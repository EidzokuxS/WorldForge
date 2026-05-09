"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Loader2, AlertTriangle } from "lucide-react";
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
import {
  parseCharacter,
  generateCharacter,
  importV2Card,
  researchCharacter,
  IngestionError,
} from "@/lib/api";
import {
  characterDraftToScaffoldNpc,
  createEmptyNpcDraft,
  scaffoldNpcToDraft,
  syncScaffoldTierToDraft,
} from "@/lib/character-drafts";
import type { CharacterImportMode } from "@/lib/types";
import type { ScaffoldLocation, ScaffoldNpc } from "@/lib/api";
import { CharacterRecordInspector } from "@/components/world-review/character-record-inspector";
import { PersonalitySection } from "@/components/world-review/personality-section";
import { PowerStatsSection } from "@/components/character-creation/power-stats-section";
import { OverrideTextField } from "@/components/character-creation/override-text-field";
import {
  CreationModes,
  type CreationMode,
} from "@/components/character-creation/creation-modes";
import { PipelineErrorBanner } from "@/components/character-creation/pipeline-error-banner";

interface NpcsSectionProps {
  npcs: ScaffoldNpc[];
  campaignId: string;
  locations?: ScaffoldLocation[];
  locationNames: string[];
  factionNames: string[];
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

function normalizeLocationOptions(
  locations: ScaffoldLocation[] | undefined,
  locationNames: string[],
): ScaffoldLocation[] {
  if (locations && locations.length > 0) {
    return locations;
  }
  return locationNames.map((name) => ({
    name,
    description: "",
    tags: [],
    isStarting: false,
    connectedTo: [],
    kind: "macro",
    parentLocationName: null,
  }));
}

function locationKind(location: ScaffoldLocation): "macro" | "persistent_sublocation" {
  return location.kind === "persistent_sublocation"
    ? "persistent_sublocation"
    : "macro";
}

type BusyState =
  | "idle"
  | "parsing"
  | "generating"
  | "researching"
  | "importing";

export function NpcsSection({
  npcs,
  campaignId,
  locations,
  locationNames,
  factionNames,
  onChange,
  onRegenerate,
  regenerating,
}: NpcsSectionProps) {
  // Unified 4-mode creation UX (parse / generate / research / import). `null` = panel collapsed.
  const [mode, setMode] = useState<CreationMode | null>(null);
  const [overrideText, setOverrideText] = useState("");
  const [ingestionError, setIngestionError] = useState<Error | null>(null);
  const [lastIngestion, setLastIngestion] = useState<
    (() => Promise<void>) | null
  >(null);
  const [busy, setBusy] = useState<BusyState>("idle");

  // Per-mode input state
  const [descriptionText, setDescriptionText] = useState("");
  const [archetypeText, setArchetypeText] = useState("");
  const [importMode, setImportMode] =
    useState<CharacterImportMode>("native");
  const [creationTier, setCreationTier] =
    useState<ScaffoldNpc["tier"]>("supporting");
  const [expandedPersonas, setExpandedPersonas] = useState<Set<number>>(
    new Set(),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const locationOptions = useMemo(
    () => normalizeLocationOptions(locations, locationNames),
    [locations, locationNames],
  );
  const allLocationNames = useMemo(
    () => locationOptions.map((location) => location.name).filter(Boolean),
    [locationOptions],
  );
  const macroLocationNames = useMemo(
    () => locationOptions
      .filter((location) => locationKind(location) === "macro")
      .map((location) => location.name)
      .filter(Boolean),
    [locationOptions],
  );
  const broadLocationNames = useMemo(
    () => macroLocationNames.length > 0 ? macroLocationNames : allLocationNames,
    [allLocationNames, macroLocationNames],
  );
  const locationsByName = useMemo(
    () => new Map(locationOptions.map((location) => [location.name, location])),
    [locationOptions],
  );
  const inferBroadLocationName = useCallback(
    (sceneLocationName: string | null | undefined): string | null => {
      if (!sceneLocationName) return null;
      const sceneLocation = locationsByName.get(sceneLocationName);
      if (!sceneLocation) return null;
      if (locationKind(sceneLocation) === "macro") return sceneLocation.name;
      const parentName = sceneLocation.parentLocationName ?? null;
      const parentLocation = parentName ? locationsByName.get(parentName) : null;
      return parentLocation && locationKind(parentLocation) === "macro"
        ? parentLocation.name
        : null;
    },
    [locationsByName],
  );

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
          : npc,
      );
      onChange(updated);
    },
    [npcs, onChange],
  );

  const deleteNpc = useCallback(
    (index: number) => {
      onChange(npcs.filter((_, i) => i !== index));
    },
    [npcs, onChange],
  );

  const addNpc = useCallback(() => {
    const newNpc = assignUid(
      {
        ...characterDraftToScaffoldNpc(
          createEmptyNpcDraft(broadLocationNames[0] ?? "", creationTier),
        ),
        sceneLocationName: null,
      },
    );
    onChange([...npcs, newNpc]);
  }, [broadLocationNames, creationTier, npcs, onChange]);

  // runIngestion — wraps a callable so PipelineErrorBanner/Retry share closure semantics
  // with the player creation page. overrideText is cleared on success (research §Override
  // Text State model — NPC path clears on success). No toast.error on pipeline errors —
  // the banner owns that surface (feedback_no_fallbacks_v2).
  const runIngestion = useCallback(
    async (callable: () => Promise<void>) => {
      setLastIngestion(() => callable);
      setIngestionError(null);
      try {
        await callable();
        setLastIngestion(null);
        setOverrideText("");
      } catch (err) {
        setIngestionError(err as Error);
      }
    },
    [],
  );

  const handleParse = useCallback(() => {
    if (!descriptionText.trim()) return;
    setBusy("parsing");
    void runIngestion(async () => {
      try {
        const result = await parseCharacter(
          campaignId,
          descriptionText,
          "key",
          allLocationNames,
          factionNames,
          overrideText,
        );
        if (result.role !== "key") throw new Error("Unexpected response");
        const npc = assignUid(
          syncNpcTier(
            {
              ...result.npc,
              draft: result.draft ?? result.npc.draft ?? null,
              characterRecord:
                result.characterRecord ?? result.npc.characterRecord ?? null,
            },
            creationTier,
          ),
        );
        onChange([...npcs, npc]);
        setDescriptionText("");
        setMode(null);
        toast.success(`NPC "${npc.name}" created`);
      } finally {
        setBusy("idle");
      }
    });
  }, [
    campaignId,
    creationTier,
    descriptionText,
    factionNames,
    allLocationNames,
    npcs,
    onChange,
    overrideText,
    runIngestion,
  ]);

  const handleGenerate = useCallback(() => {
    setBusy("generating");
    void runIngestion(async () => {
      try {
        const result = await generateCharacter(
          campaignId,
          "key",
          allLocationNames,
          factionNames,
          overrideText,
        );
        if (result.role !== "key") throw new Error("Unexpected response");
        const npc = assignUid(
          syncNpcTier(
            {
              ...result.npc,
              draft: result.draft ?? result.npc.draft ?? null,
              characterRecord:
                result.characterRecord ?? result.npc.characterRecord ?? null,
            },
            creationTier,
          ),
        );
        onChange([...npcs, npc]);
        setMode(null);
        toast.success(`NPC "${npc.name}" generated`);
      } finally {
        setBusy("idle");
      }
    });
  }, [
    campaignId,
    creationTier,
    factionNames,
    allLocationNames,
    npcs,
    onChange,
    overrideText,
    runIngestion,
  ]);

  const handleResearch = useCallback(() => {
    if (!archetypeText.trim()) return;
    setBusy("researching");
    void runIngestion(async () => {
      try {
        const result = await researchCharacter(
          campaignId,
          archetypeText,
          "key",
          allLocationNames,
          factionNames,
          overrideText,
        );
        if (result.role !== "key") throw new Error("Unexpected response");
        const npc = assignUid(
          syncNpcTier(
            {
              ...result.npc,
              draft: result.draft ?? result.npc.draft ?? null,
              characterRecord:
                result.characterRecord ?? result.npc.characterRecord ?? null,
            },
            creationTier,
          ),
        );
        onChange([...npcs, npc]);
        setArchetypeText("");
        setMode(null);
        toast.success(`NPC "${npc.name}" researched`);
      } finally {
        setBusy("idle");
      }
    });
  }, [
    archetypeText,
    campaignId,
    creationTier,
    factionNames,
    allLocationNames,
    npcs,
    onChange,
    overrideText,
    runIngestion,
  ]);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        setMode(null);
        return;
      }
      // Reset input so the same file can be re-selected
      e.target.value = "";

      setBusy("importing");
      void runIngestion(async () => {
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
              locationNames: allLocationNames,
              factionNames,
              overrideText,
            },
          );
          if (result.role !== "key") throw new Error("Unexpected response");
          const npc = assignUid(
            syncNpcTier(
              {
                ...result.npc,
                draft: result.draft ?? result.npc.draft ?? null,
                characterRecord:
                  result.characterRecord ??
                  result.npc.characterRecord ??
                  null,
              },
              creationTier,
            ),
          );
          onChange([...npcs, npc]);
          setMode(null);
          toast.success(`NPC "${npc.name}" imported`);
        } finally {
          setBusy("idle");
        }
      });
    },
    [
      campaignId,
      creationTier,
      factionNames,
      allLocationNames,
      importMode,
      npcs,
      onChange,
      overrideText,
      runIngestion,
    ],
  );

  const isBusy = busy !== "idle";

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
            data-testid="npc-card"
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
              {npc.name.trim() &&
                duplicateNames.has(npc.name.trim().toLowerCase()) && (
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
                onChange={(e) => updateNpc(index, { persona: e.target.value })}
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

            <PersonalitySection
              personality={
                npc.draft?.identity?.personality ??
                npc.characterRecord?.identity?.personality
              }
            />

            {/* Power Stats (top-level — visible without opening Advanced) */}
            {npc.draft?.powerStats ? (
              <div className="mt-1 border-t border-white/[0.06] py-[clamp(8px,0.6vw,14px)]">
                <PowerStatsSection powerStats={npc.draft.powerStats} />
              </div>
            ) : null}

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

            <CharacterRecordInspector
              draft={npc.draft ? scaffoldNpcToDraft(npc) : null}
              characterRecord={npc.characterRecord ?? null}
            />

            {/* Location / Faction footer */}
            <div className="mt-auto grid grid-cols-1 gap-4 border-t border-white/[0.06] pt-[clamp(8px,0.6vw,14px)] md:grid-cols-3">
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-mono text-[10px] uppercase text-zinc-500">
                  Location
                </span>
                <Select
                  value={npc.locationName}
                  onValueChange={(v: string) => {
                    const inferredBroad = inferBroadLocationName(
                      npc.sceneLocationName,
                    );
                    updateNpc(index, {
                      locationName: v,
                      sceneLocationName:
                        inferredBroad && inferredBroad !== v
                          ? null
                          : npc.sceneLocationName ?? null,
                    });
                  }}
                >
                  <SelectTrigger
                    aria-label={`Location for ${npc.name || `NPC ${index + 1}`}`}
                    className="h-7 flex-1 border-none bg-transparent text-[12px]"
                  >
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {broadLocationNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-mono text-[10px] uppercase text-zinc-500">
                  Scene
                </span>
                <Select
                  value={npc.sceneLocationName ?? NONE_VALUE}
                  onValueChange={(v: string) => {
                    const sceneLocationName = v === NONE_VALUE ? null : v;
                    const inferredBroad = inferBroadLocationName(sceneLocationName);
                    updateNpc(index, {
                      sceneLocationName,
                      locationName: inferredBroad ?? npc.locationName,
                    });
                  }}
                >
                  <SelectTrigger
                    aria-label={`Scene for ${npc.name || `NPC ${index + 1}`}`}
                    className="h-7 flex-1 border-none bg-transparent text-[12px]"
                  >
                    <SelectValue placeholder="Select scene" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {allLocationNames.map((name) => (
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
                  <SelectTrigger
                    aria-label={`Faction for ${npc.name || `NPC ${index + 1}`}`}
                    className="h-7 flex-1 border-none bg-transparent text-[12px]"
                  >
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

      {/* ─── NPC Creation ─── unified 4-mode panel using shared atoms */}
      <section
        aria-labelledby="create-npc-heading"
        className="mt-6 flex flex-col gap-4 rounded-lg border border-border/50 bg-card p-[clamp(14px,1.2vw,20px)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id="create-npc-heading"
            className="font-serif text-lg font-bold text-bone"
          >
            Create an NPC
          </h3>
          <p className="text-xs text-muted-foreground">
            New NPCs use the selected tier above.
          </p>
        </div>

        <CreationModes mode={mode} onModeChange={setMode} busy={isBusy} />

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.png"
          className="hidden"
          onChange={handleImport}
        />

        {mode === "parse" && (
          <div className="flex flex-col gap-3">
            <Label
              htmlFor="npc-description"
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500"
            >
              Free-text description
            </Label>
            <Textarea
              id="npc-description"
              value={descriptionText}
              onChange={(e) => setDescriptionText(e.target.value)}
              placeholder="A grizzled old blacksmith who secretly leads the resistance..."
              rows={4}
              className="resize-none bg-zinc-800 border-zinc-700 text-sm text-zinc-200"
              disabled={isBusy}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode(null);
                  setDescriptionText("");
                }}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleParse}
                disabled={isBusy || !descriptionText.trim()}
              >
                {busy === "parsing" ? (
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

        {mode === "generate" && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-zinc-400">
              Generate a fully new NPC with no archetype hint. The LLM chooses
              identity, motives, and powers from world context alone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode(null)}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleGenerate} disabled={isBusy}>
                {busy === "generating" ? (
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

        {mode === "research" && (
          <div className="flex flex-col gap-3">
            <Label
              htmlFor="npc-archetype"
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500"
            >
              Archetype or inspiration
            </Label>
            <Input
              id="npc-archetype"
              value={archetypeText}
              onChange={(e) => setArchetypeText(e.target.value)}
              placeholder="a battle-scarred veteran, a mysterious plague doctor, a pragmatic court mage"
              disabled={isBusy}
              className="bg-zinc-800 border-zinc-700 text-sm text-zinc-200"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode(null);
                  setArchetypeText("");
                }}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleResearch}
                disabled={isBusy || !archetypeText.trim()}
              >
                {busy === "researching" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Researching...
                  </>
                ) : (
                  "Research"
                )}
              </Button>
            </div>
          </div>
        )}

        {mode === "import" && (
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-sm">Import integration</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose whether this character belongs to the setting natively
                or arrived here as an outsider with their own prior lore.
              </p>
            </div>

            <Select
              value={importMode}
              onValueChange={(value: CharacterImportMode) =>
                setImportMode(value)
              }
              disabled={isBusy}
            >
              <SelectTrigger className="h-10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="native">Native resident</SelectItem>
                <SelectItem value="outsider">Outsider</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode(null)}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
              >
                {busy === "importing" ? (
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

        {mode !== null && (
          <OverrideTextField
            value={overrideText}
            onChange={setOverrideText}
            disabled={isBusy}
          />
        )}

        {ingestionError && (
          <PipelineErrorBanner
            error={ingestionError.message}
            stage={
              ingestionError instanceof IngestionError
                ? ingestionError.stage
                : undefined
            }
            attempts={
              ingestionError instanceof IngestionError
                ? ingestionError.attempts
                : undefined
            }
            onRetry={() => {
              if (lastIngestion) void runIngestion(lastIngestion);
            }}
            retrying={isBusy}
            onDismiss={() => setIngestionError(null)}
          />
        )}
      </section>
    </div>
  );
}
