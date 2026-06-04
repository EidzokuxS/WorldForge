"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  generateWorld,
  suggestSeed,
  suggestSeeds,
  importWorldbookLibrary,
  listWorldbookLibrary,
  apiPost,
  loadCampaign,
  getWorldData,
  getWorldgenDebugProgress,
} from "@/lib/api";
import type {
  GenerateWorldResult,
  GenerationProgress,
  WorldbookLibraryItem,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/settings";
import type { IpResearchContext, PremiseDivergence, SeedCategory, Settings, WorldSeeds } from "@/lib/types";
import type { WorldgenResearchArtifactV2 } from "@worldforge/shared";
import {
  clearCampaignNewFlowSession,
  type CampaignNewFlowSession,
} from "@/components/campaign-new/flow-session";
import {
  type CampaignMeta,
  type DnaState,
  WORLD_DNA_CARDS,
  collectEnabledSeeds,
  createDnaStateFromSeeds,
  createEmptyDnaState,
  isGeneratorConfigured,
  normalizeSeedValue,
  readSeedValue,
} from "./utils";

const DEFAULT_API_ERROR = "Unknown API error.";
const GENERATION_RECOVERY_POLL_MS = 5000;
const GENERATION_RECOVERY_ATTEMPTS = 360;

function sortWorldbookItems(items: WorldbookLibraryItem[]): WorldbookLibraryItem[] {
  return [...items].sort((left, right) => {
    const nameCompare = left.displayName.localeCompare(right.displayName, "en", {
      sensitivity: "base",
    });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.id.localeCompare(right.id, "en", { sensitivity: "base" });
  });
}

function mergeWorldbookItem(
  items: WorldbookLibraryItem[],
  item: WorldbookLibraryItem,
): WorldbookLibraryItem[] {
  return sortWorldbookItems([
    ...items.filter((existing) => existing.id !== item.id),
    item,
  ]);
}

function mergeSelectedWorldbooks(
  items: WorldbookLibraryItem[],
  item: WorldbookLibraryItem,
): WorldbookLibraryItem[] {
  if (items.some((existing) => existing.id === item.id)) {
    return items;
  }
  return [...items, item];
}

type Phase =
  | { kind: "idle" }
  | { kind: "suggesting-all" }
  | { kind: "suggesting-category"; category: SeedCategory }
  | { kind: "creating" }
  | { kind: "generating" };

type UseNewCampaignWizardOptions = {
  initialSession?: CampaignNewFlowSession | null;
};

type SuggestedAuthorityContext = {
  _ipContext?: IpResearchContext | null;
  _premiseDivergence?: PremiseDivergence | null;
  _researchArtifact?: WorldgenResearchArtifactV2 | null;
};

export function useNewCampaignWizard(
  settings: Settings | null,
  onCreated: () => void,
  options?: UseNewCampaignWizardOptions,
) {
  const router = useRouter();
  const initialSession = options?.initialSession ?? null;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(initialSession?.step ?? 1);
  const [campaignName, setCampaignName] = useState(initialSession?.campaignName ?? "");
  const [campaignPremise, setCampaignPremise] = useState(initialSession?.campaignPremise ?? "");
  const [campaignFranchise, setCampaignFranchise] = useState(initialSession?.campaignFranchise ?? "");
  const [researchEnabled, setResearchEnabled] = useState(initialSession?.researchEnabled ?? true);
  const [dnaState, setDnaState] = useState<DnaState | null>(initialSession?.dnaState ?? null);
  const [phase, setPhase] = useState<Phase>((initialSession?.phase as Phase | undefined) ?? { kind: "idle" });
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(
    initialSession?.generationProgress ?? null,
  );
  const [ipContext, setIpResearchContext] = useState<IpResearchContext | null>(null);
  const [premiseDivergence, setPremiseDivergence] = useState<PremiseDivergence | null>(null);
  const [researchArtifact, setResearchArtifact] = useState<WorldgenResearchArtifactV2 | null>(
    initialSession?.researchArtifact ?? null,
  );

  const [worldbookLibrary, setWorldbookLibrary] = useState<WorldbookLibraryItem[]>([]);
  const [selectedWorldbooks, setSelectedWorldbooks] = useState<WorldbookLibraryItem[]>(
    initialSession?.selectedWorldbooks ?? [],
  );
  const [worldbookLibraryLoading, setWorldbookLibraryLoading] = useState(false);
  const [worldbookStatus, setWorldbookStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [worldbookError, setWorldbookError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationRetryCampaignId, setGenerationRetryCampaignId] = useState<string | null>(null);

  const isBusy = phase.kind !== "idle";
  const creatingCampaign = phase.kind === "creating" || phase.kind === "generating";
  const isGenerating = phase.kind === "generating";
  const isSuggesting = phase.kind === "suggesting-all";
  const suggestingCategory =
    phase.kind === "suggesting-category" ? phase.category : null;
  const hasWorldbook = selectedWorldbooks.length > 0;
  const conceptReady =
    campaignName.trim().length > 0 && (campaignPremise.trim().length > 0 || hasWorldbook);
  const canCreate = conceptReady && !isBusy;

  function resetFlow() {
    setStep(1);
    setCampaignName("");
    setCampaignPremise("");
    setCampaignFranchise("");
    setResearchEnabled(true);
    setDnaState(null);
    setIpResearchContext(null);
    setPremiseDivergence(null);
    setResearchArtifact(null);
    setPhase({ kind: "idle" });
    setGenerationProgress(null);
    setGenerationError(null);
    setGenerationRetryCampaignId(null);
    // Reusable worldbooks are global library data, not part of the campaign draft.
    // A fresh-start reset should clear selections while keeping the loaded shelf visible.
    setSelectedWorldbooks([]);
    setWorldbookStatus("idle");
    setWorldbookError(null);
  }

  function invalidatePreparedDna() {
    setDnaState(null);
    setIpResearchContext(null);
    setPremiseDivergence(null);
    setResearchArtifact(null);
    setGenerationProgress(null);
    setGenerationError(null);
    setGenerationRetryCampaignId(null);
    if (step === 2) {
      setStep(1);
    }
  }

  function updateCampaignName(value: string) {
    if (value !== campaignName) {
      invalidatePreparedDna();
    }
    setCampaignName(value);
  }

  function updateCampaignPremise(value: string) {
    if (value !== campaignPremise) {
      invalidatePreparedDna();
    }
    setCampaignPremise(value);
  }

  function updateCampaignFranchise(value: string) {
    if (value !== campaignFranchise) {
      invalidatePreparedDna();
    }
    setCampaignFranchise(value);
  }

  function updateResearchEnabled(value: boolean) {
    if (value !== researchEnabled) {
      invalidatePreparedDna();
    }
    setResearchEnabled(value);
  }

  function applySuggestedAuthorityContext(suggested: SuggestedAuthorityContext) {
    setIpResearchContext(suggested._ipContext ?? null);
    setPremiseDivergence(suggested._premiseDivergence ?? null);
    setResearchArtifact(suggested._researchArtifact ?? null);
  }

  async function loadReusableWorldbooks() {
    setWorldbookLibraryLoading(true);
    setWorldbookError(null);
    try {
      const result = await listWorldbookLibrary();
      setWorldbookLibrary(sortWorldbookItems(result.items));
    } catch (error) {
      const message = getErrorMessage(error, "Failed to load reusable worldbooks.");
      setWorldbookError(message);
      toast.error("Failed to load worldbook library", {
        description: message,
      });
    } finally {
      setWorldbookLibraryLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isBusy) return;
    setOpen(nextOpen);
    if (nextOpen) {
      void loadReusableWorldbooks();
      return;
    }
    resetFlow();
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function isRecoverableGenerationError(error: unknown): boolean {
    const message = getErrorMessage(error, DEFAULT_API_ERROR).toLowerCase();
    return message.includes("network error")
      || message.includes("failed to fetch")
      || message.includes("stream ended without completion");
  }

  async function readCompletedGenerationResult(campaignId: string): Promise<GenerateWorldResult> {
    await loadCampaign(campaignId);
    const world = await getWorldData(campaignId);
    return {
      refinedPremise: "",
      locationCount: world.locations.length,
      npcCount: world.npcs.length,
      factionCount: world.factions.length,
      startingLocation:
        world.locations.find((location) => location.isStarting)?.name
        ?? world.locations[0]?.name
        ?? "Unknown",
    };
  }

  async function recoverInterruptedGeneration(campaignId: string): Promise<GenerateWorldResult | null> {
    for (let attempt = 0; attempt < GENERATION_RECOVERY_ATTEMPTS; attempt += 1) {
      const [campaign, debug] = await Promise.all([
        loadCampaign(campaignId).catch(() => null),
        getWorldgenDebugProgress().catch(() => null),
      ]);

      if (campaign?.generationComplete) {
        return readCompletedGenerationResult(campaignId);
      }

      const activeGeneration = debug?.active.some(
        (operation) => operation.kind === "generate-world" && operation.campaignId === campaignId,
      ) ?? false;

      if (!activeGeneration) {
        break;
      }

      setGenerationProgress((current) => current ?? {
        step: 0,
        totalSteps: 5,
        label: "Reconnecting to running generation",
      });
      await sleep(GENERATION_RECOVERY_POLL_MS);
    }

    return null;
  }

  async function tryGenerateWorld(
    campaignId: string,
  ): Promise<boolean> {
    if (!settings || !isGeneratorConfigured(settings)) return true;

    setPhase({ kind: "generating" });
    setGenerationProgress(null);
    setGenerationError(null);
    try {
      const generation = await generateWorld(campaignId, (progress) => {
        setGenerationProgress(progress);
      }, ipContext, premiseDivergence, researchArtifact);
      toast.success(`World generated: ${generation.startingLocation ?? "Unknown"}`, {
        description: `${generation.locationCount ?? 0} locations, ${generation.npcCount ?? 0} NPCs, ${generation.factionCount ?? 0} factions`,
      });
      return true;
    } catch (error) {
      if (isRecoverableGenerationError(error)) {
        const recovered = await recoverInterruptedGeneration(campaignId);
        if (recovered) {
          toast.success(`World generated: ${recovered.startingLocation ?? "Unknown"}`, {
            description: `${recovered.locationCount ?? 0} locations, ${recovered.npcCount ?? 0} NPCs, ${recovered.factionCount ?? 0} factions`,
          });
          return true;
        }

        try {
          const restarted = await generateWorld(campaignId, (progress) => {
            setGenerationProgress(progress);
          }, ipContext, premiseDivergence, researchArtifact);
          toast.success(`World generated: ${restarted.startingLocation ?? "Unknown"}`, {
            description: `${restarted.locationCount ?? 0} locations, ${restarted.npcCount ?? 0} NPCs, ${restarted.factionCount ?? 0} factions`,
          });
          return true;
        } catch (retryError) {
          error = retryError;
        }
      }

      const msg = getErrorMessage(error, "World generation failed.");
      setGenerationError(msg);
      toast.error("World generation failed", {
        description: "See error details below the progress bar.",
      });
      return false;
    } finally {
      setGenerationProgress(null);
    }
  }

  async function handleWorldbookUpload(file: File) {
    setWorldbookStatus("importing");
    setWorldbookError(null);

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      setWorldbookStatus("error");
      setWorldbookError("Invalid JSON file");
      return;
    }

    const displayName = file.name.replace(/\.json$/i, "").trim() || "Worldbook";

    try {
      const result = await importWorldbookLibrary(
        displayName,
        parsed as object,
        file.name,
      );
      setWorldbookLibrary((current) => mergeWorldbookItem(current, result.item));
      setSelectedWorldbooks((current) => mergeSelectedWorldbooks(current, result.item));
      setWorldbookStatus("done");
    } catch (error) {
      const message = getErrorMessage(error, "Worldbook import failed");
      setWorldbookStatus("error");
      setWorldbookError(message);
      toast.error("Worldbook import failed", {
        description: message,
      });
    }
  }

  function toggleWorldbookSelection(item: WorldbookLibraryItem) {
    invalidatePreparedDna();
    setSelectedWorldbooks((current) => {
      if (current.some((existing) => existing.id === item.id)) {
        return current.filter((existing) => existing.id !== item.id);
      }
      return [...current, item];
    });
  }

  async function createCampaignWithSeeds(seeds?: Partial<WorldSeeds>): Promise<void> {
    const name = campaignName.trim();
    const premise = campaignPremise.trim();
    if (!conceptReady) {
      toast.error(hasWorldbook ? "Campaign name is required." : "Campaign name and premise are required.");
      return;
    }

    setPhase({ kind: "creating" });
    try {
      const payload: {
        name: string;
        premise: string;
        seeds?: Partial<WorldSeeds>;
        ipContext?: IpResearchContext | null;
        premiseDivergence?: PremiseDivergence | null;
        worldgenSourceHint?: string;
        worldgenResearchEnabled?: boolean;
        worldbookSelection?: WorldbookLibraryItem[];
      } = {
        name,
        premise,
      };
      if (seeds && Object.keys(seeds).length > 0) {
        payload.seeds = seeds;
      }
      if (ipContext) {
        payload.ipContext = ipContext;
      }
      if (premiseDivergence) {
        payload.premiseDivergence = premiseDivergence;
      }
      const sourceHint = campaignFranchise.trim();
      if (sourceHint) {
        payload.worldgenSourceHint = sourceHint;
      }
      payload.worldgenResearchEnabled = researchEnabled;
      if (selectedWorldbooks.length > 0) {
        payload.worldbookSelection = selectedWorldbooks;
      }

      const created = generationRetryCampaignId
        ? await loadCampaign(generationRetryCampaignId)
        : await apiPost<CampaignMeta>("/api/campaigns", payload);
      if (!generationRetryCampaignId) {
        toast.success("Campaign created", { description: created.name });
        setGenerationRetryCampaignId(created.id);
      }

      // Load campaign so it becomes active BEFORE generation (generate needs active campaign)
      await loadCampaign(created.id);

      // Close the dialog before generation starts, but keep local state intact
      // until the request resolves so we do not churn wizard state mid-SSE.
      setOpen(false);
      const generated = await tryGenerateWorld(created.id);

      if (!generated) {
        // Generation failed — stay on creation page so the user sees the error
        setPhase({ kind: "idle" });
        return;
      }

      resetFlow();
      clearCampaignNewFlowSession();
      onCreated();
      router.push(`/campaign/${created.id}/review`);
    } catch (error) {
      toast.error("Failed to create campaign", {
        description: getErrorMessage(error, DEFAULT_API_ERROR),
      });
    } finally {
      setPhase({ kind: "idle" });
    }
  }

  async function handleNextToDna(): Promise<boolean> {
    if (!conceptReady) {
      toast.error(hasWorldbook ? "Campaign name is required." : "Campaign name and premise are required.");
      return false;
    }
    if (dnaState) {
      setStep(2);
      return true;
    }
    if (!settings) {
      toast.error("Settings are still loading.");
      return false;
    }
    if (!isGeneratorConfigured(settings)) {
      toast.error("Configure Generator API key in Settings first.");
      return false;
    }

    setStep(2);
    setPhase({ kind: "suggesting-all" });
    try {
      const suggested = await suggestSeeds(campaignPremise.trim(), {
          name: campaignName.trim(),
          franchise: campaignFranchise.trim() || undefined,
          research: researchEnabled,
          selectedWorldbooks: selectedWorldbooks.length > 0 ? selectedWorldbooks : undefined,
        });
      applySuggestedAuthorityContext(suggested);
      setDnaState(createDnaStateFromSeeds(suggested));
    } catch (error) {
      toast.error("Failed to generate suggestions", {
        description: getErrorMessage(error, "Try again or write seeds manually."),
      });
      applySuggestedAuthorityContext({});
      setDnaState(createEmptyDnaState());
    } finally {
      setPhase({ kind: "idle" });
    }
    return true;
  }

  async function handleResuggestAll() {
    if (!settings || !dnaState) return;

    const categoriesToUpdate = WORLD_DNA_CARDS.map((item) => item.category).filter(
      (category) => {
        const slot = dnaState[category];
        return slot.enabled && !slot.isCustom;
      }
    );

    if (categoriesToUpdate.length === 0) {
      toast.info("All seeds are custom-edited. Nothing to re-suggest.");
      return;
    }

    setPhase({ kind: "suggesting-all" });
    try {
      const suggested = await suggestSeeds(campaignPremise.trim(), {
          name: campaignName.trim(),
          franchise: campaignFranchise.trim() || undefined,
          research: researchEnabled,
          selectedWorldbooks: selectedWorldbooks.length > 0 ? selectedWorldbooks : undefined,
        });
      applySuggestedAuthorityContext(suggested);
      setDnaState((current) => {
        if (!current) return current;
        const next = { ...current };
        for (const category of categoriesToUpdate) {
          next[category] = {
            ...next[category],
            value: normalizeSeedValue(category, readSeedValue(suggested, category)),
            isCustom: false,
          };
        }
        return next;
      });
    } catch (error) {
      toast.error("Failed to re-suggest seeds", {
        description: getErrorMessage(error, DEFAULT_API_ERROR),
      });
    } finally {
      setPhase({ kind: "idle" });
    }
  }

  async function handleResuggestCategory(category: SeedCategory) {
    if (!settings || !dnaState) return;
    if (!dnaState[category].enabled) return;

    setPhase({ kind: "suggesting-category", category });
    try {
      const result = await suggestSeed(
        campaignPremise.trim(),
        category,
        ipContext,
        premiseDivergence,
        researchArtifact,
      );
      setDnaState((current) => {
        if (!current) return current;
        return {
          ...current,
          [category]: {
            ...current[category],
            value: normalizeSeedValue(category, result.value),
            enabled: true,
            isCustom: false,
          },
        };
      });
    } catch (error) {
      toast.error(`Failed to re-suggest ${category}`, {
        description: getErrorMessage(error, DEFAULT_API_ERROR),
      });
    } finally {
      setPhase({ kind: "idle" });
    }
  }

  function handleSeedToggle(category: SeedCategory, enabled: boolean) {
    setGenerationRetryCampaignId(null);
    setDnaState((current) => {
      if (!current) return current;
      return { ...current, [category]: { ...current[category], enabled } };
    });
  }

  function handleSeedTextChange(category: SeedCategory, value: string) {
    setGenerationRetryCampaignId(null);
    setDnaState((current) => {
      if (!current) return current;
      return {
        ...current,
        [category]: {
          ...current[category],
          value: normalizeSeedValue(category, value),
          isCustom: true,
        },
      };
    });
  }

  async function handleCreateWithDna() {
    if (!dnaState) {
      setStep(2);
      setDnaState(createEmptyDnaState());
      toast.error("Prepare World DNA first.", {
        description: "Continue from concept to generate suggestions, or add at least one manual seed before creating the world.",
      });
      return;
    }

    const enabledSeeds = collectEnabledSeeds(dnaState);
    if (!enabledSeeds) {
      toast.error("Add at least one DNA seed before generating the world.");
      return;
    }
    await createCampaignWithSeeds(enabledSeeds);
  }

  function handlePrepareManualDna() {
    setStep(2);
    setDnaState((current) => current ?? createEmptyDnaState());
  }

  return {
    // Dialog state
    open,
    step,
    handleOpenChange,
    setStep,

    // Form fields
    campaignName,
    setCampaignName: updateCampaignName,
    campaignPremise,
    setCampaignPremise: updateCampaignPremise,
    campaignFranchise,
    setCampaignFranchise: updateCampaignFranchise,
    researchEnabled,
    setResearchEnabled: updateResearchEnabled,
    dnaState,
    researchArtifact,

    // Derived state
    isBusy,
    creatingCampaign,
    isGenerating,
    generationProgress,
    generationError,
    isSuggesting,
    suggestingCategory,
    canCreate,
    hasWorldbook,

    // Worldbook state
    worldbookLibrary,
    selectedWorldbooks,
    worldbookLibraryLoading,
    worldbookStatus,
    worldbookError,

    // Handlers
    handleCreateWithSeeds: createCampaignWithSeeds,
    handleNextToDna,
    handleResuggestAll,
    handleResuggestCategory,
    handleSeedToggle,
    handleSeedTextChange,
    handleCreateWithDna,
    handlePrepareManualDna,
    handleWorldbookUpload,
    toggleWorldbookSelection,
    resetFlow,
  };
}
