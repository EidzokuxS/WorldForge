"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  generateWorld,
  suggestSeed,
  suggestSeeds,
  classifyWorldBook,
  apiPost,
  loadCampaign,
  getWorldData,
  getWorldgenDebugProgress,
} from "@/lib/api";
import type { GenerateWorldResult, GenerationProgress, IpContext, ClassifiedWorldBookEntry } from "@/lib/api";
import { getErrorMessage } from "@/lib/settings";
import type { PremiseDivergence, SeedCategory, Settings, WorldSeeds } from "@/lib/types";
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

type Phase =
  | { kind: "idle" }
  | { kind: "suggesting-all" }
  | { kind: "suggesting-category"; category: SeedCategory }
  | { kind: "creating" }
  | { kind: "generating" };

export function useNewCampaignWizard(settings: Settings | null, onCreated: () => void) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [campaignName, setCampaignName] = useState("");
  const [campaignPremise, setCampaignPremise] = useState("");
  const [campaignFranchise, setCampaignFranchise] = useState("");
  const [researchEnabled, setResearchEnabled] = useState(true);
  const [dnaState, setDnaState] = useState<DnaState | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [ipContext, setIpContext] = useState<IpContext | null>(null);
  const [premiseDivergence, setPremiseDivergence] = useState<PremiseDivergence | null>(null);

  // Worldbook state
  const [worldbookFile, setWorldbookFile] = useState<File | null>(null);
  const [worldbookEntries, setWorldbookEntries] = useState<ClassifiedWorldBookEntry[] | null>(null);
  const [worldbookStatus, setWorldbookStatus] = useState<"idle" | "parsing" | "classifying" | "done" | "error">("idle");
  const [classifyProgress, setClassifyProgress] = useState<{ batch: number; total: number } | null>(null);
  const [worldbookError, setWorldbookError] = useState<string | null>(null);

  const isBusy = phase.kind !== "idle";
  const creatingCampaign = phase.kind === "creating" || phase.kind === "generating";
  const isGenerating = phase.kind === "generating";
  const isSuggesting = phase.kind === "suggesting-all";
  const suggestingCategory =
    phase.kind === "suggesting-category" ? phase.category : null;
  const hasWorldbook = worldbookStatus === "done" && worldbookEntries !== null && worldbookEntries.length > 0;
  const conceptReady =
    campaignName.trim().length > 0 && (campaignPremise.trim().length > 0 || hasWorldbook);
  const canCreate = conceptReady && !isBusy;

  function resetFlow() {
    setStep(1);
    setDnaState(null);
    setIpContext(null);
    setPremiseDivergence(null);
    setPhase({ kind: "idle" });
    setWorldbookFile(null);
    setWorldbookEntries(null);
    setWorldbookStatus("idle");
    setClassifyProgress(null);
    setWorldbookError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isBusy) return;
    setOpen(nextOpen);
    if (!nextOpen) resetFlow();
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
    try {
      const generation = await generateWorld(campaignId, (progress) => {
        setGenerationProgress(progress);
      });
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
          });
          toast.success(`World generated: ${restarted.startingLocation ?? "Unknown"}`, {
            description: `${restarted.locationCount ?? 0} locations, ${restarted.npcCount ?? 0} NPCs, ${restarted.factionCount ?? 0} factions`,
          });
          return true;
        } catch (retryError) {
          error = retryError;
        }
      }

      toast.error("World generation failed", {
        description: getErrorMessage(error, "You can still play - the world will be empty."),
      });
      return false;
    } finally {
      setGenerationProgress(null);
    }
  }

  async function handleWorldBookUpload(file: File) {
    setWorldbookFile(file);
    setWorldbookStatus("parsing");
    setWorldbookError(null);
    setClassifyProgress(null);

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      setWorldbookStatus("error");
      setWorldbookError("Invalid JSON file");
      return;
    }

    setWorldbookStatus("classifying");
    try {
      const result = await classifyWorldBook(parsed as object);
      setWorldbookEntries(result.entries);
      setWorldbookStatus("done");
    } catch (error) {
      setWorldbookStatus("error");
      setWorldbookError(getErrorMessage(error, "Classification failed"));
      toast.error("WorldBook classification failed", {
        description: getErrorMessage(error, "Check your Generator settings."),
      });
    }
  }

  function handleWorldBookRemove() {
    setWorldbookFile(null);
    setWorldbookEntries(null);
    setWorldbookStatus("idle");
    setClassifyProgress(null);
    setWorldbookError(null);
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
        ipContext?: IpContext | null;
        premiseDivergence?: PremiseDivergence | null;
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

      const created = await apiPost<CampaignMeta>("/api/campaigns", payload);
      toast.success("Campaign created", { description: created.name });

      // Load campaign so it becomes active BEFORE generation (generate needs active campaign)
      await loadCampaign(created.id);

      // Close the dialog before generation starts, but keep local state intact
      // until the request resolves so we do not churn wizard state mid-SSE.
      setOpen(false);

      // If worldbook was uploaded but ipContext not set (skipped DNA step), build it now
      if (!ipContext && worldbookEntries?.length) {
        const { worldbookToIpContext } = await import("@/lib/api");
        const derivedContext = worldbookToIpContext(worldbookEntries, name);
        setIpContext(derivedContext);
      }
      const generated = await tryGenerateWorld(created.id);

      setCampaignName("");
      setCampaignPremise("");
      setCampaignFranchise("");
      setResearchEnabled(true);
      resetFlow();
      onCreated();
      router.push(`/campaign/${created.id}/${generated ? "review" : "character"}`);
    } catch (error) {
      toast.error("Failed to create campaign", {
        description: getErrorMessage(error, DEFAULT_API_ERROR),
      });
    } finally {
      setPhase({ kind: "idle" });
    }
  }

  async function handleNextToDna() {
    if (!conceptReady) {
      toast.error(hasWorldbook ? "Campaign name is required." : "Campaign name and premise are required.");
      return;
    }
    if (dnaState) {
      setStep(2);
      return;
    }
    if (!settings) {
      toast.error("Settings are still loading.");
      return;
    }
    if (!isGeneratorConfigured(settings)) {
      toast.error("Configure Generator API key in Settings first.");
      return;
    }

    setStep(2);
    setPhase({ kind: "suggesting-all" });
    try {
      const suggested = await suggestSeeds(campaignPremise.trim(), {
          name: campaignName.trim(),
          franchise: campaignFranchise.trim() || undefined,
          research: researchEnabled,
          worldbookEntries: worldbookEntries ?? undefined,
        });
      if (suggested._ipContext) {
        setIpContext(suggested._ipContext);
      }
      if (suggested._premiseDivergence) {
        setPremiseDivergence(suggested._premiseDivergence);
      }
      setDnaState(createDnaStateFromSeeds(suggested));
    } catch (error) {
      toast.error("Failed to generate suggestions", {
        description: getErrorMessage(error, "Try again or write seeds manually."),
      });
      setDnaState(createEmptyDnaState());
    } finally {
      setPhase({ kind: "idle" });
    }
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
          worldbookEntries: worldbookEntries ?? undefined,
        });
      if (suggested._ipContext) {
        setIpContext(suggested._ipContext);
      }
      if (suggested._premiseDivergence) {
        setPremiseDivergence(suggested._premiseDivergence);
      }
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
    setDnaState((current) => {
      if (!current) return current;
      return { ...current, [category]: { ...current[category], enabled } };
    });
  }

  function handleSeedTextChange(category: SeedCategory, value: string) {
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
    const enabledSeeds = collectEnabledSeeds(dnaState);
    await createCampaignWithSeeds(enabledSeeds);
  }

  return {
    // Dialog state
    open,
    step,
    handleOpenChange,
    setStep,

    // Form fields
    campaignName,
    setCampaignName,
    campaignPremise,
    setCampaignPremise,
    campaignFranchise,
    setCampaignFranchise,
    researchEnabled,
    setResearchEnabled,
    dnaState,

    // Derived state
    isBusy,
    creatingCampaign,
    isGenerating,
    generationProgress,
    isSuggesting,
    suggestingCategory,
    canCreate,
    hasWorldbook,

    // Worldbook state
    worldbookFile,
    worldbookEntries,
    worldbookStatus,
    classifyProgress,
    worldbookError,

    // Handlers
    handleCreateWithSeeds: createCampaignWithSeeds,
    handleNextToDna,
    handleResuggestAll,
    handleResuggestCategory,
    handleSeedToggle,
    handleSeedTextChange,
    handleCreateWithDna,
    handleWorldBookUpload,
    handleWorldBookRemove,
  };
}
