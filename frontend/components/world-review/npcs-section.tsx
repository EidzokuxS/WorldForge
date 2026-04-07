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
import {
  characterDraftToScaffoldNpc,
  createEmptyNpcDraft,
  syncScaffoldTierToDraft,
} from "@/lib/character-drafts";
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

function syncNpcTier(npc: ScaffoldNpc, tier: ScaffoldNpc["tier"]): ScaffoldNpc {
  return {
    ...npc,
    tier,
    draft: npc.draft ? syncScaffoldTierToDraft(npc.draft, tier) : npc.draft,
  };
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
  const [creationTier, setCreationTier] = useState<ScaffoldNpc["tier"]>("supporting");
  const [expandedPersonas, setExpandedPersonas] = useState<Set<number>>(new Set());
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

  const togglePersona = useCallback((index: number) => {
    setExpandedPersonas((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const updateNpc = useCallback(
    (index: number, patch: Partial<ScaffoldNpc>) => {
      const updated = npcs.map((npc, i) =>
        i === index
          ? patch.tier
            ? syncNpcTier({ ...npc, ...patch }, patch.tier)
            : { ...npc, ...patch }
          : npc
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
    const newNpc = assignUid(
      characterDraftToScaffoldNpc(
        createEmptyNpcDraft(locationNames[0] ?? "", creationTier)
      )
    );
    onChange([...npcs, newNpc]);
  }, [creationTier, locationNames, npcs, onChange]);

  const handleParseNpc = useCallback(async () => {
    if (!descriptionText.trim()) return;
    setBusy(true);
    try {
      const result = await parseCharacter(campaignId, descriptionText, "key", locationNames, factionNames);
      if (result.role !== "key") throw new Error("Unexpected response");
      const npc = assignUid(syncNpcTier(result.npc, creationTier));
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
  }, [creationTier, descriptionText, campaignId, locationNames, factionNames, npcs, onChange]);

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
        const npc = assignUid(syncNpcTier(result.npc, creationTier));
        onChange([...npcs, npc]);
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
    [campaignId, creationTier, factionNames, importMode, locationNames, npcs, onChange]
  );

  const handleGenerateNpc = useCallback(async () => {
    if (!archetypeText.trim()) return;
    setBusy(true);
    try {
      const result = await researchCharacter(campaignId, archetypeText, "key", locationNames, factionNames);
      if (result.role !== "key") throw new Error("Unexpected response");
      const npc = assignUid(syncNpcTier(result.npc, creationTier));
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
  }, [archetypeText, campaignId, creationTier, locationNames, factionNames, npcs, onChange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-bold text-bone">NPCs</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="New NPC tier"
            className="flex items-center gap-2 rounded-md border border-border/40 bg-zinc-950/40 px-2 py-1"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              New NPC tier
            </span>
            <Button
              type="button"
              size="sm"
              variant={creationTier === "key" ? "default" : "outline"}
              aria-label="New NPC tier key"
              aria-pressed={creationTier === "key"}
              onClick={() => setCreationTier("key")}
            >
              Key
            </Button>
            <Button
              type="button"
              size="sm"
              variant={creationTier === "supporting" ? "default" : "outline"}
              aria-label="New NPC tier supporting"
              aria-pressed={creationTier === "supporting"}
              onClick={() => setCreationTier("supporting")}
            >
              Supporting
            </Button>
          </div>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {npcs.map((npc, index) => (
          <div
            key={npc._uid ?? `npc-fallback-${index}`}
            className="group relative flex flex-col overflow-hidden border border-border/30 rounded-lg bg-zinc-900/40 p-[clamp(16px,1.4vw,28px)] before:pointer-events-none before:absolute before:left-0 before:top-0 before:h-24 before:w-24 before:rounded-br-full before:bg-[radial-gradient(ellipse_at_top_left,rgba(230,62,0,0.12)_0%,transparent_70%)]"
          >
            {/* Delete button — hidden until hover */}
            <button
              type="button"
              onClick={() => deleteNpc(index)}
              className="absolute right-3 top-3 hidden rounded p-1 text-zinc-600 group-hover:block hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            {/* Tier */}
            <div
              role="group"
              aria-label={`${npc.name.trim() || `NPC ${index + 1}`} tier`}
              className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3"
            >
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  Tier
                </span>
                <p className="mt-1 text-xs text-zinc-300">
                  {npc.tier === "key" ? "Key NPC" : "Supporting NPC"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={npc.tier === "key" ? "default" : "outline"}
                  aria-label={`${npc.name.trim() || `NPC ${index + 1}`} key tier`}
                  aria-pressed={npc.tier === "key"}
                  onClick={() => updateNpc(index, { tier: "key" })}
                >
                  Key
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={npc.tier === "supporting" ? "default" : "outline"}
                  aria-label={`${npc.name.trim() || `NPC ${index + 1}`} supporting tier`}
                  aria-pressed={npc.tier === "supporting"}
                  onClick={() => updateNpc(index, { tier: "supporting" })}
                >
                  Supporting
                </Button>
              </div>
            </div>

            {/* NPC Name */}
            <div>
              <Input
                value={npc.name}
                onChange={(e) => updateNpc(index, { name: e.target.value })}
                placeholder="NPC NAME"
                className="!border-0 !bg-transparent !shadow-none px-2 font-mono text-[clamp(13px,0.9vw,16px)] uppercase tracking-widest text-zinc-100 focus-visible:!ring-0"
              />
              {npc.name.trim() && duplicateNames.has(npc.name.trim().toLowerCase()) && (
                <p className="mt-1 flex items-center gap-1 text-xs text-yellow-500">
                  <AlertTriangle className="h-3 w-3" />
                  Duplicate name
                </p>
              )}
            </div>

            {/* Persona */}
            <div className="border-t border-white/[0.06] py-[clamp(8px,0.6vw,14px)]">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                PERSONA
              </span>
              <Textarea
                value={npc.persona}
                onChange={(e) =>
                  updateNpc(index, { persona: e.target.value })
                }
                rows={expandedPersonas.has(index) ? 8 : 3}
                className={`mt-1 resize-none text-sm ${!expandedPersonas.has(index) ? "overflow-hidden" : ""}`}
                placeholder="Personality and background..."
              />
              <button
                type="button"
                onClick={() => togglePersona(index)}
                className="mt-1 cursor-pointer font-mono text-[10px] text-zinc-500 hover:text-zinc-300"
              >
                {expandedPersonas.has(index) ? "\u25BE less" : "\u25B8 more"}
              </button>
            </div>

            {/* Tags */}
            <div className="border-t border-white/[0.06] py-[clamp(8px,0.6vw,14px)]">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                TAGS
              </span>
              <div className="mt-1">
                <TagEditor
                  tags={npc.tags}
                  onChange={(tags) => updateNpc(index, { tags })}
                />
              </div>
            </div>

            {/* Objectives */}
            <div className="border-t border-white/[0.06] py-[clamp(8px,0.6vw,14px)]">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                OBJECTIVES
              </span>

              <div className="mt-2 space-y-2">
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                    SHORT-TERM
                  </span>
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
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                    LONG-TERM
                  </span>
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
              </div>
            </div>

            {/* Location / Faction footer */}
            <div className="mt-auto grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-[clamp(8px,0.6vw,14px)]">
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-mono text-[10px] uppercase text-zinc-500">
                  Location
                </span>
                <Select
                  value={npc.locationName}
                  onValueChange={(v: string) =>
                    updateNpc(index, { locationName: v })
                  }
                >
                  <SelectTrigger className="h-7 flex-1 border-none bg-transparent text-[12px]">
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
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-mono text-[10px] uppercase text-zinc-500">
                  Faction
                </span>
                <Select
                  value={npc.factionName ?? NONE_VALUE}
                  onValueChange={(v: string) =>
                    updateNpc(index, {
                      factionName: v === NONE_VALUE ? null : v,
                    })
                  }
                >
                  <SelectTrigger className="h-7 flex-1 border-none bg-transparent text-[12px]">
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
        ))}
      </div>

      {/* ─── NPC Creation ─── */}
      <div className="mt-6 border-t border-border/50 pt-6">
        <h3 className="mb-3 font-serif text-lg font-bold text-bone">Create NPCs</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Add custom NPCs via description, V2 card import, or AI generation from an archetype. New NPCs use the selected tier above.
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
