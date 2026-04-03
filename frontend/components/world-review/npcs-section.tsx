"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, FileText, Upload, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagEditor } from "@/components/world-review/tag-editor";
import { StringListEditor } from "@/components/world-review/string-list-editor";
import { RegenerateDialog } from "@/components/world-review/regenerate-dialog";
import { parseV2CardFile } from "@/lib/v2-card-parser";
import { parseCharacter, importV2Card, researchCharacter } from "@/lib/api";
import type { CharacterImportMode } from "@/lib/types";
import type { ScaffoldNpc } from "@/lib/api";
import type { PersonaTemplateSummary } from "@/lib/api-types";

interface NpcsSectionProps {
  npcs: ScaffoldNpc[];
  campaignId: string;
  locationNames: string[];
  factionNames: string[];
  personaTemplates?: PersonaTemplateSummary[];
  onChange: (npcs: ScaffoldNpc[]) => void;
  onRegenerate: (instruction: string | undefined) => void;
  regenerating: boolean;
}

const NONE_VALUE = "__none__";

let npcUidCounter = 0;
function assignUid(npc: ScaffoldNpc): ScaffoldNpc {
  if (!npc._uid) {
    return { ...npc, _uid: `npc-${npcUidCounter++}` };
  }
  return npc;
}

export function NpcsSection({
  npcs,
  campaignId,
  locationNames,
  factionNames,
  personaTemplates = [],
  onChange,
  onRegenerate,
  regenerating,
}: NpcsSectionProps) {
  const [addMode, setAddMode] = useState<"describe" | "import" | "generate" | null>(null);
  const [busy, setBusy] = useState(false);
  const [descriptionText, setDescriptionText] = useState("");
  const [archetypeText, setArchetypeText] = useState("");
  const [importMode, setImportMode] = useState<CharacterImportMode>("native");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Assign stable UIDs to any NPCs missing them (e.g., from initial load or regeneration)
  useEffect(() => {
    if (npcs.length > 0 && npcs.some((n) => !n._uid)) {
      onChange(npcs.map(assignUid));
    }
  }, [npcs, onChange]);

  // Detect duplicate NPC names for warning
  const duplicateNames = new Set<string>();
  {
    const seen = new Set<string>();
    for (const npc of npcs) {
      const name = npc.name.trim().toLowerCase();
      if (name && seen.has(name)) duplicateNames.add(name);
      if (name) seen.add(name);
    }
  }

  const updateNpc = useCallback(
    (index: number, patch: Partial<ScaffoldNpc>) => {
      const updated = npcs.map((npc, i) =>
        i === index ? { ...npc, ...patch } : npc
      );
      onChange(updated);
    },
    [npcs, onChange]
  );

  const deleteNpc = useCallback(
    (index: number) => {
      onChange(npcs.filter((_, i) => i !== index));
    },
    [npcs, onChange]
  );

  const addNpc = useCallback(() => {
    const newNpc: ScaffoldNpc = {
      _uid: `npc-${npcUidCounter++}`,
      name: "",
      persona: "",
      tags: [],
      goals: { shortTerm: [], longTerm: [] },
      locationName: locationNames[0] ?? "",
      factionName: null,
    };
    onChange([...npcs, newNpc]);
  }, [npcs, locationNames, onChange]);

  const handleParseNpc = useCallback(async () => {
    if (!descriptionText.trim()) return;
    setBusy(true);
    try {
      const result = await parseCharacter(campaignId, descriptionText, "key", locationNames, factionNames);
      if (result.role !== "key") throw new Error("Unexpected response");
      const npc = assignUid(result.npc);
      onChange([...npcs, npc]);
      setDescriptionText("");
      setAddMode(null);
      toast.success(`NPC "${npc.name}" created`);
    } catch (error) {
      toast.error("Failed to parse NPC", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }, [descriptionText, campaignId, locationNames, factionNames, npcs, onChange]);

  const handleImportNpc = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        setAddMode(null);
        return;
      }
      // Reset input so the same file can be re-selected
      e.target.value = "";

      setBusy(true);
      try {
        const card = await parseV2CardFile(file);
        const result = await importV2Card(
          campaignId,
          {
            name: card.name,
            description: card.description,
            personality: card.personality,
            scenario: card.scenario,
            tags: card.tags,
          },
          {
            role: "key",
            importMode,
            locationNames,
            factionNames,
          },
        );
        if (result.role !== "key") throw new Error("Unexpected response");
        const npc = result.npc;
        onChange([...npcs, assignUid(npc)]);
        setAddMode(null);
        toast.success(`NPC "${npc.name}" imported`);
      } catch (error) {
        toast.error("Failed to import NPC card", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setBusy(false);
      }
    },
    [campaignId, factionNames, importMode, locationNames, npcs, onChange]
  );

  const handleGenerateNpc = useCallback(async () => {
    if (!archetypeText.trim()) return;
    setBusy(true);
    try {
      const result = await researchCharacter(campaignId, archetypeText, "key", locationNames, factionNames);
      if (result.role !== "key") throw new Error("Unexpected response");
      const npc = assignUid(result.npc);
      onChange([...npcs, npc]);
      setArchetypeText("");
      setAddMode(null);
      toast.success(`NPC "${npc.name}" generated`);
    } catch (error) {
      toast.error("Failed to generate NPC", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }, [archetypeText, campaignId, locationNames, factionNames, npcs, onChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-bone">NPCs</h2>
        <div className="flex items-center gap-2">
          <RegenerateDialog
            sectionName="NPCs"
            onConfirm={onRegenerate}
            regenerating={regenerating}
          />
          <Button variant="outline" size="sm" onClick={addNpc}>
            <Plus className="mr-2 h-4 w-4" />
            Add NPC
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[clamp(12px,1vw,20px)] lg:grid-cols-2">
        {npcs.map((npc, index) => (
          <div key={npc._uid ?? `npc-fallback-${index}`} className="relative rounded-lg border border-border/40 p-[clamp(16px,1.4vw,28px)]">
            <button
              type="button"
              onClick={() => deleteNpc(index)}
              className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <div className="mb-[clamp(8px,0.6vw,14px)] pr-10">
              <Input
                value={npc.name}
                onChange={(e) => updateNpc(index, { name: e.target.value })}
                placeholder="NPC name"
                className="font-serif text-[clamp(14px,1vw,18px)] font-bold"
              />
              {npc.name.trim() && duplicateNames.has(npc.name.trim().toLowerCase()) && (
                <p className="mt-1 flex items-center gap-1 text-xs text-yellow-500">
                  <AlertTriangle className="h-3 w-3" />
                  Duplicate name
                </p>
              )}
            </div>
            <div className="space-y-[clamp(8px,0.7vw,14px)]">
              <div>
                <Label className="text-xs text-muted-foreground">Persona</Label>
                <Textarea
                  value={npc.persona}
                  onChange={(e) =>
                    updateNpc(index, { persona: e.target.value })
                  }
                  rows={2}
                  className="mt-1 resize-none text-sm"
                  placeholder="Personality and background..."
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Tags</Label>
                <div className="mt-1">
                  <TagEditor
                    tags={npc.tags}
                    onChange={(tags) => updateNpc(index, { tags })}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Short-term Goals
                </Label>
                <div className="mt-1">
                  <StringListEditor
                    items={npc.goals.shortTerm}
                    onChange={(shortTerm) =>
                      updateNpc(index, {
                        goals: { ...npc.goals, shortTerm },
                      })
                    }
                    placeholder="Add short-term goal..."
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Long-term Goals
                </Label>
                <div className="mt-1">
                  <StringListEditor
                    items={npc.goals.longTerm}
                    onChange={(longTerm) =>
                      updateNpc(index, {
                        goals: { ...npc.goals, longTerm },
                      })
                    }
                    placeholder="Add long-term goal..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Location
                  </Label>
                  <Select
                    value={npc.locationName}
                    onValueChange={(v: string) =>
                      updateNpc(index, { locationName: v })
                    }
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locationNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Faction
                  </Label>
                  <Select
                    value={npc.factionName ?? NONE_VALUE}
                    onValueChange={(v: string) =>
                      updateNpc(index, {
                        factionName: v === NONE_VALUE ? null : v,
                      })
                    }
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue placeholder="Select faction" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>None</SelectItem>
                      {factionNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Key Characters ─── */}
      <div className="mt-6 border-t border-border/50 pt-6">
        <h3 className="mb-3 font-serif text-lg font-bold text-bone">Key Characters</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Add custom NPCs via description, V2 card import, or AI generation from an archetype.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={addMode === "describe" ? "default" : "outline"}
            size="sm"
            onClick={() => setAddMode(addMode === "describe" ? null : "describe")}
            disabled={busy}
          >
            <FileText className="mr-2 h-4 w-4" />
            Describe
          </Button>
          <Button
            variant={addMode === "import" ? "default" : "outline"}
            size="sm"
            onClick={() => setAddMode(addMode === "import" ? null : "import")}
            disabled={busy}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import V2 Card
          </Button>
          <Button
            variant={addMode === "generate" ? "default" : "outline"}
            size="sm"
            onClick={() => setAddMode(addMode === "generate" ? null : "generate")}
            disabled={busy}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            AI Generate
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.png"
          className="hidden"
          onChange={handleImportNpc}
        />

        {addMode === "describe" && (
          <div className="mt-4 space-y-2 rounded-lg border border-border/50 bg-card p-4">
            <Label className="text-sm">Describe your NPC</Label>
            <Textarea
              value={descriptionText}
              onChange={(e) => setDescriptionText(e.target.value)}
              placeholder="A grizzled old blacksmith who secretly leads the resistance..."
              rows={3}
              className="resize-none text-sm"
              disabled={busy}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setAddMode(null); setDescriptionText(""); }}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleParseNpc}
                disabled={busy || !descriptionText.trim()}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  "Parse"
                )}
              </Button>
            </div>
          </div>
        )}

        {addMode === "import" && (
          <div className="mt-4 space-y-3 rounded-lg border border-border/50 bg-card p-4">
            <div>
              <Label className="text-sm">Import integration</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose whether this character belongs to the setting natively or arrived here as an outsider with their own prior lore.
              </p>
            </div>

            <Select
              value={importMode}
              onValueChange={(value: CharacterImportMode) => setImportMode(value)}
              disabled={busy}
            >
              <SelectTrigger className="h-10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="native">Native resident</SelectItem>
                <SelectItem value="outsider">Outsider / popadanets</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAddMode(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  "Choose V2 Card"
                )}
              </Button>
            </div>
          </div>
        )}

        {addMode === "generate" && (
          <div className="mt-4 space-y-2 rounded-lg border border-border/50 bg-card p-4">
            <Label className="text-sm">Archetype or inspiration</Label>
            <Input
              value={archetypeText}
              onChange={(e) => setArchetypeText(e.target.value)}
              placeholder='a character like Gandalf, or "mysterious plague doctor"'
              disabled={busy}
              className="text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setAddMode(null); setArchetypeText(""); }}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleGenerateNpc}
                disabled={busy || !archetypeText.trim()}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate"
                )}
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
