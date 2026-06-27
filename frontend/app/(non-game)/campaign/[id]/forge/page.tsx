"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  FileText,
  Loader2,
  Play,
  Save,
  Upload,
  UserRound,
  Wand2,
} from "lucide-react";
import type { CampaignKernel, CampaignWorldDna, CharacterDraft, SeedCategory, WorldSeeds } from "@worldforge/shared";

import {
  generateWorld,
  loadCampaign,
  type CampaignMeta,
  type WorldGenerationComplete,
  type WorldGenerationProgress,
} from "@/lib/api";
import { WORLD_DNA_CARDS } from "@/components/title/utils";
import {
  applyWorldDna,
  composeCampaignGraph,
  importPlayerCard,
  loadCampaignKernel,
  parsePlayerCharacterDraft,
  savePlayerCast,
  suggestCampaignWorldDna,
  suggestCampaignWorldDnaCategory,
} from "@/lib/campaign-kernel-api";
import { getErrorMessage } from "@/lib/settings";
import { parseV2CardFile as parseCharacterCardFile } from "@/lib/v2-card-parser";
import type { CharacterImportMode } from "@/lib/types";

type WorldDnaSummaryRow = {
  code: string;
  label: string;
  value: string;
};

type WorldDnaDraft = Record<keyof CampaignWorldDna, string>;
type WorldDnaStatus = "Ready" | "No DNA" | "Locked";
type StageState = "done" | "active" | "pending";
type WorldGenerationStatus = "idle" | "running" | "complete";
type DnaBusyState = "idle" | "saving" | "saving-generate" | "reroll-all" | SeedCategory;

const WORLD_DNA_FIELDS: Array<{
  key: keyof CampaignWorldDna;
  label: string;
}> = [
  { key: "geography", label: "Geography" },
  { key: "politicalStructure", label: "Political structure" },
  { key: "centralConflict", label: "Central conflict" },
  { key: "culturalFlavor", label: "Cultural flavor" },
  { key: "environment", label: "Environment" },
  { key: "wildcard", label: "Wildcard" },
];

const WORLD_GENERATION_RAIL = [
  { title: "Concept", detail: "name and premise" },
  { title: "World DNA", detail: "edit before build" },
  { title: "World generation", detail: "locations, cast, lore" },
  { title: "World Review", detail: "inspect before play" },
  { title: "Player character", detail: "after world review" },
] as const;

const WORLD_GENERATION_CARDS = [
  { title: "Locations", idle: "Queued for generation." },
  { title: "Factions", idle: "Queued for generation." },
  { title: "Characters", idle: "Queued for generation." },
  { title: "Lore cards", idle: "Queued for generation." },
] as const;

function characterNodeIsPresent(kernel: CampaignKernel): boolean {
  return kernel.worldGraph.nodes.some((node) => node.type === "Character");
}

function worldDnaStatus(kernel: CampaignKernel): WorldDnaStatus {
  if (kernel.worldDna) {
    return "Ready";
  }
  return kernel.phase === "draft" || kernel.phase === "world_ready" ? "No DNA" : "Locked";
}

function worldDnaRows(worldDna: CampaignWorldDna): WorldDnaSummaryRow[] {
  return WORLD_DNA_FIELDS.map((field, index) => ({
    code: `D${String(index + 1).padStart(2, "0")}`,
    label: field.label,
    value: worldDna[field.key],
  }));
}

function suggestedValueToText(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

function worldDnaToDraft(worldDna: CampaignWorldDna): WorldDnaDraft {
  return {
    geography: worldDna.geography,
    politicalStructure: worldDna.politicalStructure,
    centralConflict: worldDna.centralConflict,
    culturalFlavor: worldDna.culturalFlavor,
    environment: worldDna.environment,
    wildcard: worldDna.wildcard,
  };
}

function worldSeedsToDraft(seeds: WorldSeeds): WorldDnaDraft {
  return {
    geography: seeds.geography ?? "",
    politicalStructure: seeds.politicalStructure ?? "",
    centralConflict: seeds.centralConflict ?? "",
    culturalFlavor: Array.isArray(seeds.culturalFlavor) ? seeds.culturalFlavor.join(", ") : "",
    environment: seeds.environment ?? "",
    wildcard: seeds.wildcard ?? "",
  };
}

function splitCulturalFlavorDraft(value: string): string[] {
  const semicolonParts = value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (semicolonParts.length > 1) {
    return semicolonParts;
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function draftToWorldSeeds(draft: WorldDnaDraft): WorldSeeds | null {
  const geography = draft.geography.trim();
  const politicalStructure = draft.politicalStructure.trim();
  const centralConflict = draft.centralConflict.trim();
  const culturalFlavor = splitCulturalFlavorDraft(draft.culturalFlavor);
  const environment = draft.environment.trim();
  const wildcard = draft.wildcard.trim();

  if (
    !geography
    || !politicalStructure
    || !centralConflict
    || culturalFlavor.length === 0
    || !environment
    || !wildcard
  ) {
    return null;
  }

  return {
    geography,
    politicalStructure,
    centralConflict,
    culturalFlavor,
    environment,
    wildcard,
  };
}

function FormStep({
  number,
  title,
  meta,
  description,
  children,
}: {
  number: string;
  title: string;
  meta?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="wf-form-step">
      <div className="wf-form-step-num">{number}</div>
      <div className="min-w-0">
        <h2 className="wf-form-step-title">
          {title}
          {meta ? <span className="wf-form-step-meta">{meta}</span> : null}
        </h2>
        {description ? <p className="wf-prose mt-1 text-[15px] italic text-[var(--fg-2)]">{description}</p> : null}
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

function SequenceItem({
  number,
  state,
  label,
  detail,
}: {
  number: string;
  state: StageState;
  label: string;
  detail: string;
}) {
  return (
    <div className="wf-stage-row" data-state={state}>
      <div />
      <div>
        <div className="wf-stage-num">{number}</div>
        <div className="wf-stage-title">{label}</div>
        <div className="wf-stage-sub">{detail}</div>
      </div>
    </div>
  );
}

function CharacterDraftPreview({ draft }: { draft: CharacterDraft }) {
  return (
    <div className="wf-campaign-forge-preview">
      <div className="flex items-center gap-2">
        <UserRound className="h-4 w-4 text-[var(--ember-1)]" />
        <h3>{draft.identity.displayName || "Unnamed character"}</h3>
      </div>
      <p>
        {draft.identity.personality?.summary
          || draft.profile.personaSummary
          || draft.profile.backgroundSummary
          || "Draft is ready for review."}
      </p>
      <div className="wf-campaign-forge-preview-meta">
        <span>role: {draft.identity.role}</span>
        <span>tier: {draft.identity.tier}</span>
        {draft.socialContext.currentLocationName ? (
          <span>start: {draft.socialContext.currentLocationName}</span>
        ) : null}
      </div>
    </div>
  );
}

function WorldGenerationSurface({
  campaign,
  kernel,
  status,
  progress,
  result,
  error,
  onStart,
  onSaveDna,
  onRerollAll,
  onRerollCategory,
}: {
  campaign: CampaignMeta;
  kernel: CampaignKernel;
  status: WorldGenerationStatus;
  progress: WorldGenerationProgress | null;
  result: WorldGenerationComplete | null;
  error: string | null;
  onStart: () => Promise<void>;
  onSaveDna: (seeds: WorldSeeds) => Promise<void>;
  onRerollAll: () => Promise<WorldSeeds>;
  onRerollCategory: (category: SeedCategory) => Promise<string | string[]>;
}) {
  const [dnaDraft, setDnaDraft] = useState<WorldDnaDraft>(() => (
    kernel.worldDna ? worldDnaToDraft(kernel.worldDna) : worldSeedsToDraft(campaign.seeds ?? {})
  ));
  const [dnaDirty, setDnaDirty] = useState(false);
  const [dnaBusy, setDnaBusy] = useState<DnaBusyState>("idle");
  const [dnaError, setDnaError] = useState<string | null>(null);
  const running = status === "running";
  const completedResult = status === "complete" ? result : null;
  const complete = completedResult !== null;
  const dnaOperationBusy = dnaBusy !== "idle";
  const controlsDisabled = running || complete || dnaOperationBusy;
  const seedsReady = draftToWorldSeeds(dnaDraft) !== null;
  const progressRatio = complete
    ? 100
    : progress?.step && progress?.totalSteps
      ? Math.max(16, Math.min(94, Math.round((progress.step / progress.totalSteps) * 100)))
      : running ? 28 : dnaDirty ? 42 : 22;
  const activeLabel = progress?.subLabel || progress?.label || (
    running ? "Creating the world." : dnaDirty ? "World DNA has unsaved edits." : "World DNA is ready to edit."
  );
  const progressMeta = complete
    ? "ready for review"
    : progress?.step && progress?.totalSteps
      ? `${progress.step} of ${progress.totalSteps} stages`
      : running ? "running" : dnaDirty ? "edited" : "ready";
  const dnaPill = dnaBusy === "reroll-all"
    ? "rerolling"
    : dnaBusy === "saving" || dnaBusy === "saving-generate"
      ? "saving"
      : dnaDirty ? "edited" : "editable";

  useEffect(() => {
    if (!dnaDirty && kernel.worldDna) {
      setDnaDraft(worldDnaToDraft(kernel.worldDna));
    }
  }, [dnaDirty, kernel.worldDna]);

  async function saveDna(nextBusy: Extract<DnaBusyState, "saving" | "saving-generate">): Promise<boolean> {
    const seeds = draftToWorldSeeds(dnaDraft);
    if (!seeds) {
      setDnaError("Fill all six World DNA fields before saving.");
      return false;
    }

    setDnaBusy(nextBusy);
    setDnaError(null);
    try {
      await onSaveDna(seeds);
      setDnaDirty(false);
      return true;
    } catch (saveFailure) {
      setDnaError(getErrorMessage(saveFailure, "Failed to save World DNA."));
      return false;
    } finally {
      setDnaBusy("idle");
    }
  }

  async function handleRerollCategory(category: SeedCategory) {
    if (controlsDisabled) {
      return;
    }

    setDnaBusy(category);
    setDnaError(null);
    try {
      const value = await onRerollCategory(category);
      setDnaDraft((current) => ({
        ...current,
        [category]: suggestedValueToText(value),
      }));
      setDnaDirty(true);
    } catch (rerollFailure) {
      setDnaError(getErrorMessage(rerollFailure, "Failed to re-roll World DNA field."));
    } finally {
      setDnaBusy("idle");
    }
  }

  async function handleRerollAll() {
    if (controlsDisabled) {
      return;
    }

    setDnaBusy("reroll-all");
    setDnaError(null);
    try {
      const seeds = await onRerollAll();
      setDnaDraft(worldSeedsToDraft(seeds));
      setDnaDirty(true);
    } catch (rerollFailure) {
      setDnaError(getErrorMessage(rerollFailure, "Failed to re-roll World DNA."));
    } finally {
      setDnaBusy("idle");
    }
  }

  async function handleCreateWorld() {
    if (running || complete || dnaOperationBusy) {
      return;
    }

    if (dnaDirty) {
      const saved = await saveDna("saving-generate");
      if (!saved) {
        return;
      }
    }

    await onStart();
  }

  return (
    <main className="wf-gen-shell wf-dna-edit-shell wf-v4-page-theater" data-testid="worldgen-surface">
      <aside className="wf-gen-rail wf-gen-rail-dna" aria-label="Campaign setup stages">
        <div className="wf-gen-rail-h">Forge</div>
        {WORLD_GENERATION_RAIL.map((stage, index) => {
          const state: StageState = index < 2 || (complete && index === 2)
            ? "done"
            : index === 2 || (complete && index === 3) ? "active" : "pending";
          return (
            <WorldGenerationStage
              key={stage.title}
              title={stage.title}
              detail={stage.detail}
              mark={state === "done" ? "done" : roman(index + 1)}
              state={state}
            />
          );
        })}
      </aside>

      <section className="wf-gen-main">
        <header className="wf-gen-head">
          <div>
            <p className="wf-gen-sub">World generation</p>
            <h1 className="wf-gen-h">
              {complete ? "World ready for " : running ? "Creating the " : "Tune the "}
              <em>{complete ? "review." : running ? "world." : "World DNA."}</em>
            </h1>
          </div>
          <div className="wf-gen-progress" aria-label="World generation progress">
            <div className="wf-gen-progress-bar">
              <div style={{ width: `${progressRatio}%` }} />
            </div>
            <div className="wf-gen-progress-meta">
              <span>{activeLabel}</span>
              <span><b>{progressMeta}</b></span>
            </div>
          </div>
        </header>

        <section className="wf-gen-think" aria-label="Current world generation work">
          <div className="wf-gen-think-mark" />
          <div>
            <div className="wf-gen-think-h">
              Engine - {complete ? "world ready" : running ? "generation running" : "ready"}
            </div>
            <p className="wf-gen-think-prose">
              {complete
                ? formatWorldGenerationSummary(completedResult)
                : running
                  ? activeLabel
                  : "Edit the six seed laws, save DNA, or create the world from the current draft."}
              {running ? <span className="wf-gen-cursor" /> : null}
            </p>
          </div>
        </section>

        <section className="wf-gen-section">
          <div className="wf-gen-section-h">
            <span className="wf-gen-kicker">i</span>
            <h2 className="wf-gen-h2">World <em>DNA</em></h2>
            <span className="wf-gen-pill" data-state={dnaOperationBusy ? "forging" : undefined}>
              {dnaPill}
            </span>
          </div>
          <div className="wf-dna-editor-grid" role="list" aria-label="Editable World DNA">
            {WORLD_DNA_CARDS.map((item, index) => {
              const category = item.category as keyof CampaignWorldDna;
              const isRerolling = dnaBusy === item.category;

              return (
                <article
                  key={item.category}
                  className="wf-dna-seed-card"
                  role="listitem"
                  data-enabled="true"
                  data-busy={isRerolling ? "true" : "false"}
                >
                  <div className="wf-dna-seed-head">
                    <div>
                      <div className="wf-dna-seed-code">D{String(index + 1).padStart(2, "0")}</div>
                      <h3 className="wf-dna-seed-title">{item.label}</h3>
                    </div>
                    <span className="wf-gen-tag">{dnaDirty ? "draft" : "seed"}</span>
                  </div>

                  <textarea
                    className="wf-dna-seed-text"
                    value={dnaDraft[category]}
                    onChange={(event) => {
                      setDnaDraft((current) => ({
                        ...current,
                        [category]: event.target.value,
                      }));
                      setDnaDirty(true);
                    }}
                    disabled={controlsDisabled}
                    aria-label={`${item.label} seed text`}
                    placeholder="Seed text"
                  />

                  <div className="wf-dna-seed-actions">
                    <span className="wf-gen-tag">
                      {isRerolling ? "rolling" : dnaDraft[category].trim() ? "ready" : "empty"}
                    </span>
                    <button
                      type="button"
                      className="wf-dna-card-action"
                      onClick={() => void handleRerollCategory(item.category)}
                      disabled={controlsDisabled}
                    >
                      {isRerolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                      Re-roll
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="wf-gen-section">
          <div className="wf-gen-section-h">
            <span className="wf-gen-kicker">ii</span>
            <h2 className="wf-gen-h2">World <em>build</em></h2>
            <span className="wf-gen-pill" data-state={running ? "forging" : undefined}>
              {complete ? "ready" : running ? "running" : "waiting"}
            </span>
          </div>
          <div className="wf-gen-locs">
            {WORLD_GENERATION_CARDS.map((card, index) => (
              <article key={card.title} className="wf-gen-loc" data-state={worldGenerationCardState(status, index)}>
                <div className="wf-gen-loc-num">{String(index + 1).padStart(2, "0")}</div>
                <div className="wf-gen-loc-h">{card.title}</div>
                <div className="wf-gen-loc-sub">{worldGenerationCardDetail(card.title, card.idle, completedResult)}</div>
                <div className="wf-gen-loc-tag">
                  <span className="wf-gen-tag">{worldGenerationCardTag(status, index)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {dnaError || error ? (
          <section className="border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            {dnaError ?? error}
          </section>
        ) : null}

        <div className="wf-gen-actions wf-dna-actionbar">
          {complete ? (
            <Link href={`/campaign/${campaign.id}/review`} className="wf-v4-btn wf-v4-btn-primary">
              <Check className="h-4 w-4" />
              Review world
            </Link>
          ) : (
            <div className="wf-dna-actionbar-main">
              <button
                type="button"
                className="wf-v4-btn"
                onClick={() => void handleRerollAll()}
                disabled={controlsDisabled}
              >
                {dnaBusy === "reroll-all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Re-roll all six
              </button>
              <button
                type="button"
                className="wf-v4-btn"
                onClick={() => void saveDna("saving")}
                disabled={controlsDisabled || !dnaDirty || !seedsReady}
              >
                {dnaBusy === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {dnaBusy === "saving" ? "Saving DNA" : "Save DNA"}
              </button>
              <button
                type="button"
                className="wf-v4-btn wf-v4-btn-primary"
                onClick={() => void handleCreateWorld()}
                disabled={running || dnaOperationBusy || !seedsReady}
              >
                {running || dnaBusy === "saving-generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {dnaBusy === "saving-generate" ? "Saving DNA" : running ? "Creating world" : "Create world"}
              </button>
            </div>
          )}
          <span className="wf-forge-cta-note">
            Player setup opens after world review.
          </span>
        </div>
      </section>
    </main>
  );
}

function WorldGenerationStage({
  title,
  detail,
  mark,
  state,
}: {
  title: string;
  detail: string;
  mark: string;
  state: StageState;
}) {
  return (
    <div className="wf-gen-stage" data-state={state}>
      <div className="wf-gen-stage-mark">
        {state === "done" ? <Check className="h-3 w-3" /> : state === "active" ? ">" : mark}
      </div>
      <div>
        <div className="wf-gen-stage-h">{title}</div>
        <div className="wf-gen-stage-sub">{detail}</div>
      </div>
    </div>
  );
}

function formatWorldGenerationSummary(result: WorldGenerationComplete): string {
  const pieces = [
    `${result.locationCount} locations`,
    `${result.npcCount} characters`,
    `${result.factionCount} factions`,
    `${result.loreCardCount} lore cards`,
  ];
  const loreNote = result.loreStorageFailed ? " Lore search needs attention during review." : "";
  return `${pieces.join(", ")}. Starting point: ${result.startingLocation}.${loreNote}`;
}

function worldGenerationCardState(status: WorldGenerationStatus, index: number): "done" | "forging" | "queued" {
  if (status === "complete") {
    return "done";
  }
  if (status === "running") {
    return index === 0 ? "forging" : "queued";
  }
  return "queued";
}

function worldGenerationCardTag(status: WorldGenerationStatus, index: number): string {
  if (status === "complete") {
    return "ready";
  }
  if (status === "running" && index === 0) {
    return "active";
  }
  return "queued";
}

function worldGenerationCardDetail(
  title: string,
  idle: string,
  result: WorldGenerationComplete | null,
): string {
  if (!result) {
    return idle;
  }
  if (title === "Locations") {
    return `${result.locationCount} locations created.`;
  }
  if (title === "Factions") {
    return `${result.factionCount} factions created.`;
  }
  if (title === "Characters") {
    return `${result.npcCount} characters created.`;
  }
  return `${result.loreCardCount} lore cards created.`;
}

function roman(value: number): string {
  const numerals = ["i", "ii", "iii", "iv", "v"];
  return numerals[value - 1] ?? String(value);
}

export default function CampaignForgePage(props: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(props.params);
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignMeta | null>(null);
  const [kernel, setKernel] = useState<CampaignKernel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [worldGenerationStatus, setWorldGenerationStatus] = useState<WorldGenerationStatus>("idle");
  const [worldGenerationProgress, setWorldGenerationProgress] = useState<WorldGenerationProgress | null>(null);
  const [worldGenerationResult, setWorldGenerationResult] = useState<WorldGenerationComplete | null>(null);
  const [worldGenerationError, setWorldGenerationError] = useState<string | null>(null);
  const [preparingCampaign, setPreparingCampaign] = useState(false);
  const [characterMode, setCharacterMode] = useState<"describe" | "import">("describe");
  const [concept, setConcept] = useState("");
  const [overrideText, setOverrideText] = useState("");
  const [importMode, setImportMode] = useState<CharacterImportMode>("native");
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [draftSource, setDraftSource] = useState<"player_created" | "player_imported">("player_created");
  const [characterBusy, setCharacterBusy] = useState<"idle" | "parsing" | "importing" | "saving">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const campaignPreparationAttemptRef = useRef<string | null>(null);
  const campaignPreparationBusyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLoadError(null);
    setActionError(null);
    setWorldGenerationStatus("idle");
    setWorldGenerationProgress(null);
    setWorldGenerationResult(null);
    setWorldGenerationError(null);
    void Promise.all([
      loadCampaign(campaignId),
      loadCampaignKernel(campaignId),
    ])
      .then(([loaded, kernelResponse]) => {
        if (!cancelled) {
          setCampaign(loaded);
          setKernel(kernelResponse.kernel);
        }
      })
      .catch((loadFailure) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(loadFailure, "Failed to load campaign forge."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  async function refreshCampaignForgeState() {
    const [loaded, kernelResponse] = await Promise.all([
      loadCampaign(campaignId),
      loadCampaignKernel(campaignId),
    ]);
    setCampaign(loaded);
    setKernel(kernelResponse.kernel);
  }

  useEffect(() => {
    if (
      campaign?.generationComplete !== true
      || !kernel?.worldDna
      || !kernel.castRegistry.playerCharacter
      || kernel.phase !== "cast_ready"
      || characterNodeIsPresent(kernel)
      || campaignPreparationBusyRef.current
    ) {
      return;
    }

    const attemptKey = `${campaignId}:${kernel.castRegistry.playerCharacter.id}`;
    if (campaignPreparationAttemptRef.current === attemptKey) {
      return;
    }

    let cancelled = false;
    campaignPreparationAttemptRef.current = attemptKey;
    campaignPreparationBusyRef.current = true;
    setPreparingCampaign(true);
    setActionError(null);

    void composeCampaignGraph(campaignId)
      .then((result) => {
        if (!cancelled) {
          setKernel(result.kernel);
        }
      })
      .catch((composeFailure) => {
        if (!cancelled) {
          setActionError(getErrorMessage(composeFailure, "Failed to prepare campaign after saving the player."));
        }
      })
      .finally(() => {
        campaignPreparationBusyRef.current = false;
        if (!cancelled) {
          setPreparingCampaign(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [campaign?.generationComplete, campaignId, kernel]);

  async function handleCreateWorld() {
    if (!campaign || !kernel?.worldDna || campaign.generationComplete === true || worldGenerationStatus === "running") {
      return;
    }

    setWorldGenerationStatus("running");
    setWorldGenerationProgress(null);
    setWorldGenerationResult(null);
    setWorldGenerationError(null);
    try {
      const result = await generateWorld(campaignId, {
        onProgress: (progress) => setWorldGenerationProgress(progress),
      });
      setWorldGenerationResult(result);
      setWorldGenerationStatus("complete");
      await refreshCampaignForgeState();
      router.push(`/campaign/${campaignId}/review`);
    } catch (generationFailure) {
      setWorldGenerationStatus("idle");
      setWorldGenerationError(getErrorMessage(generationFailure, "World generation failed."));
    }
  }

  async function handleSaveWorldDna(seeds: WorldSeeds) {
    const result = await applyWorldDna(campaignId, { seeds });
    setCampaign(result.campaign);
    setKernel(result.kernel);
  }

  async function handleRerollWorldDna(): Promise<WorldSeeds> {
    const result = await suggestCampaignWorldDna(campaignId);
    return result.seeds;
  }

  async function handleRerollWorldDnaCategory(category: SeedCategory): Promise<string | string[]> {
    const result = await suggestCampaignWorldDnaCategory(campaignId, category);
    return result.value;
  }

  async function handleDescribe() {
    const trimmedConcept = concept.trim();
    if (
      campaign?.generationComplete !== true
      || !kernel?.worldDna
      || !trimmedConcept
      || characterBusy !== "idle"
      || preparingCampaign
    ) {
      return;
    }

    setCharacterBusy("parsing");
    setActionError(null);
    try {
      const result = await parsePlayerCharacterDraft(campaignId, {
        concept: trimmedConcept,
        ...(overrideText.trim() ? { overrideText: overrideText.trim() } : {}),
      });
      setDraft(result.draft);
      setDraftSource("player_created");
    } catch (parseFailure) {
      setActionError(getErrorMessage(parseFailure, "Failed to create player draft."));
    } finally {
      setCharacterBusy("idle");
    }
  }

  async function handleImport(file: File) {
    if (
      campaign?.generationComplete !== true
      || !kernel?.worldDna
      || characterBusy !== "idle"
      || preparingCampaign
    ) {
      return;
    }

    setCharacterBusy("importing");
    setActionError(null);
    try {
      const card = await parseCharacterCardFile(file);
      const result = await importPlayerCard(
        campaignId,
        card,
        {
          importMode,
          ...(overrideText.trim() ? { overrideText: overrideText.trim() } : {}),
        },
      );
      setDraft(result.draft);
      setDraftSource("player_imported");
    } catch (importFailure) {
      setActionError(getErrorMessage(importFailure, "Failed to import player draft."));
    } finally {
      setCharacterBusy("idle");
    }
  }

  async function handleSavePlayer() {
    if (
      campaign?.generationComplete !== true
      || !kernel?.worldDna
      || !draft
      || characterBusy !== "idle"
      || preparingCampaign
    ) {
      return;
    }

    setCharacterBusy("saving");
    setActionError(null);
    try {
      campaignPreparationAttemptRef.current = null;
      const result = await savePlayerCast(campaignId, {
        draft,
        source: draftSource,
      });
      setKernel(result.kernel);
    } catch (saveFailure) {
      setActionError(getErrorMessage(saveFailure, "Failed to save player cast."));
    } finally {
      setCharacterBusy("idle");
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center text-[var(--fg-2)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading forge...
      </main>
    );
  }

  if (loadError || !campaign || !kernel) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <h1 className="font-serif text-3xl font-semibold text-[var(--fg)]">Forge failed</h1>
        <p className="text-sm text-red-300">{loadError ?? "Campaign was not loaded."}</p>
        <Link href="/campaign/new" className="wf-v4-btn w-fit">
          Start draft
        </Link>
      </main>
    );
  }

  const savedPlayer = kernel.castRegistry.playerCharacter;
  const isCharacterBusy = characterBusy !== "idle";
  const playerControlsDisabled = isCharacterBusy || preparingCampaign;
  const currentWorldDnaStatus = worldDnaStatus(kernel);
  const worldDnaAccepted = Boolean(kernel.worldDna);
  const worldBuilt = campaign.generationComplete === true;
  const showWorldGeneration = worldDnaAccepted && (!worldBuilt || worldGenerationStatus !== "idle");
  const playerUnlocked = worldDnaAccepted && worldBuilt;
  const worldDnaMeta = worldDnaAccepted ? currentWorldDnaStatus : "required";
  const worldDnaStage: StageState = currentWorldDnaStatus === "Ready" ? "done" : "active";
  const playerStage: StageState = savedPlayer && playerUnlocked ? "done" : playerUnlocked ? "active" : "pending";
  const playerMeta = savedPlayer && playerUnlocked
    ? (preparingCampaign ? "preparing" : "saved")
    : playerUnlocked ? "draft" : "locked";
  const playerStageDetail = savedPlayer && playerUnlocked
    ? preparingCampaign ? "preparing campaign" : "saved"
    : playerUnlocked ? "create or import" : worldDnaAccepted ? "create the world first" : "waiting for World DNA";
  const playerStepDescription = playerUnlocked
    ? "Create or import the player character, then save it."
    : worldDnaAccepted ? "Create the world before setting up the player." : "World DNA is required first.";
  const playerLockHeading = worldDnaAccepted ? "Create the world first" : "Player creation locked";
  const playerLockBody = worldDnaAccepted
    ? "The player starts inside the world. Create the world, then set up the player here."
    : "Accept World DNA first. The player will be built from that world context.";

  if (showWorldGeneration) {
    return (
      <WorldGenerationSurface
        campaign={campaign}
        kernel={kernel}
        status={worldGenerationStatus}
        progress={worldGenerationProgress}
        result={worldGenerationResult}
        error={worldGenerationError}
        onStart={handleCreateWorld}
        onSaveDna={handleSaveWorldDna}
        onRerollAll={handleRerollWorldDna}
        onRerollCategory={handleRerollWorldDnaCategory}
      />
    );
  }

  return (
    <main className="wf-forge-shell wf-v4-page-theater" data-testid="campaign-forge">
      <section className="wf-forge-main">
        <header className="wf-forge-head">
          <p className="wf-kicker wf-kicker-ember wf-forge-kicker">Campaign Forge</p>
          <h1 className="wf-display wf-serif-em mt-4">
            {campaign.name}
          </h1>
          <p className="wf-prose mt-4 max-w-[68ch] text-[var(--fg-2)]">
            {kernel.premise || campaign.premise || "No premise set yet."}
          </p>
        </header>

        {actionError ? (
          <section className="mx-14 mt-6 border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            {actionError}
          </section>
        ) : null}

        <div className="wf-forge-steps">
          <FormStep
            number="i."
            title="World DNA"
            meta={currentWorldDnaStatus}
            description={
              kernel.worldDna
                ? "Accepted DNA from campaign creation."
                : "Accept World DNA before creating the player."
            }
          >
            <div className="wf-campaign-forge-dna-summary" data-testid="world-dna-panel">
              {kernel.worldDna ? (
                <div className="wf-campaign-forge-dna-list" role="list" aria-label="Accepted World DNA">
                  {worldDnaRows(kernel.worldDna).map((row) => (
                    <article className="wf-campaign-forge-dna-card" role="listitem" key={row.label}>
                      <div className="wf-campaign-forge-dna-card-head">
                        <span className="wf-campaign-forge-dna-code">{row.code}</span>
                        <h3>{row.label}</h3>
                      </div>
                      <p>{row.value}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="wf-campaign-forge-preview">
                  <h3>World DNA required</h3>
                  <p>
                    Player creation starts after World DNA is accepted.
                  </p>
                </div>
              )}
              <span className="wf-campaign-forge-hint" data-testid="world-dna-status">
                {kernel.worldDna ? "World DNA accepted." : "World DNA required before player creation."}
              </span>
            </div>
          </FormStep>

          <FormStep
            number="ii."
            title="Player"
            meta={playerMeta}
            description={playerStepDescription}
          >
            <div data-testid="player-cast-panel">
              {savedPlayer && playerUnlocked ? (
                <div className="mb-5">
                  <CharacterDraftPreview draft={savedPlayer.characterDraft} />
                </div>
              ) : null}

              {playerUnlocked ? (
                <>
                  <div className="flex flex-wrap gap-2" role="tablist" aria-label="Player creation modes">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={characterMode === "describe"}
                      className="wf-v4-btn"
                      disabled={playerControlsDisabled}
                      onClick={() => setCharacterMode("describe")}
                    >
                      <FileText className="h-4 w-4" />
                      Describe
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={characterMode === "import"}
                      className="wf-v4-btn"
                      disabled={playerControlsDisabled}
                      onClick={() => setCharacterMode("import")}
                    >
                      <Upload className="h-4 w-4" />
                      Import card
                    </button>
                  </div>

                  {characterMode === "describe" ? (
                    <div className="mt-4 grid gap-3">
                      <textarea
                        value={concept}
                        onChange={(event) => setConcept(event.target.value)}
                        rows={5}
                        disabled={playerControlsDisabled}
                        placeholder="Describe the player character."
                        aria-label="Player concept"
                      />
                      <button
                        type="button"
                        className="wf-v4-btn w-fit"
                        disabled={playerControlsDisabled || !concept.trim()}
                        onClick={() => void handleDescribe()}
                      >
                        {characterBusy === "parsing" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                        Create draft
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3">
                      <label className="wf-campaign-forge-field">
                        <span>Import mode</span>
                        <select
                          value={importMode}
                          onChange={(event) => setImportMode(event.target.value as CharacterImportMode)}
                          disabled={playerControlsDisabled}
                          className="wf-campaign-forge-select"
                        >
                          <option value="native">Native resident</option>
                          <option value="outsider">Outsider</option>
                        </select>
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,.png"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void handleImport(file);
                          }
                          event.target.value = "";
                        }}
                      />
                      <button
                        type="button"
                        className="wf-v4-btn w-fit"
                        disabled={playerControlsDisabled}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {characterBusy === "importing" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        Choose card
                      </button>
                    </div>
                  )}

                  <label className="wf-campaign-forge-field mt-4">
                    <span>Override</span>
                    <textarea
                      value={overrideText}
                      onChange={(event) => setOverrideText(event.target.value)}
                      rows={3}
                      disabled={playerControlsDisabled}
                      placeholder="Instructions for this draft."
                      aria-label="Player override"
                    />
                  </label>

                  {draft ? (
                    <div className="mt-4 grid gap-3">
                      <CharacterDraftPreview draft={draft} />
                      <button
                        type="button"
                        className="wf-v4-btn w-fit"
                        disabled={playerControlsDisabled || !draft.identity.displayName.trim()}
                        onClick={() => void handleSavePlayer()}
                      >
                        {characterBusy === "saving" || preparingCampaign ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {preparingCampaign ? "Preparing campaign" : "Save player"}
                      </button>
                    </div>
                  ) : null}

                  {preparingCampaign ? (
                    <span className="wf-campaign-forge-hint mt-4 block">Preparing campaign.</span>
                  ) : null}
                </>
              ) : (
                <div className="wf-campaign-forge-preview">
                  <h3>{playerLockHeading}</h3>
                  <p>
                    {playerLockBody}
                  </p>
                </div>
              )}
            </div>
          </FormStep>
        </div>
      </section>

      <aside className="wf-forge-side">
        <div className="wf-forge-sequence">
          <p className="wf-kicker wf-kicker-ember">Campaign setup</p>
          <div className="wf-stage-list">
            <SequenceItem number="i" state={worldDnaStage} label="World DNA" detail={worldDnaMeta} />
            <SequenceItem number="ii" state={playerStage} label="Player" detail={playerStageDetail} />
          </div>
        </div>
        <div className="sr-only" data-testid="kernel-phase">{kernel.phase}</div>
      </aside>
    </main>
  );
}
