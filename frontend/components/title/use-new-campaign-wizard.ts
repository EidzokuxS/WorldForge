"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { generateWorld, suggestSeed, suggestSeeds, apiPost } from "@/lib/api";
import type { GenerationProgress } from "@/lib/api";
import { getErrorMessage } from "@/lib/settings";
import type { SeedCategory, Settings, WorldSeeds } from "@/lib/types";
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
  const [dnaState, setDnaState] = useState<DnaState | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);

  const isBusy = phase.kind !== "idle";
  const creatingCampaign = phase.kind === "creating" || phase.kind === "generating";
  const isGenerating = phase.kind === "generating";
  const isSuggesting = phase.kind === "suggesting-all";
  const suggestingCategory =
    phase.kind === "suggesting-category" ? phase.category : null;
  const conceptReady =
    campaignName.trim().length > 0 && campaignPremise.trim().length > 0;
  const canCreate = conceptReady && !isBusy;

  function resetFlow() {
    setStep(1);
    setDnaState(null);
    setPhase({ kind: "idle" });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isBusy) return;
    setOpen(nextOpen);
    if (!nextOpen) resetFlow();
  }

  async function tryGenerateWorld(campaignId: string): Promise<void> {
    if (!settings || !isGeneratorConfigured(settings)) return;

    setPhase({ kind: "generating" });
    setGenerationProgress(null);
    try {
      const generation = await generateWorld(campaignId, (progress) => {
        setGenerationProgress(progress);
      });
      toast.success(`World generated: ${generation.startingLocation ?? "Unknown"}`, {
        description: `${generation.locationCount ?? 0} locations, ${generation.npcCount ?? 0} NPCs, ${generation.factionCount ?? 0} factions`,
      });
    } catch (error) {
      toast.error("World generation failed", {
        description: getErrorMessage(error, "You can still play - the world will be empty."),
      });
    } finally {
      setGenerationProgress(null);
    }
  }

  async function createCampaignWithSeeds(seeds?: Partial<WorldSeeds>): Promise<void> {
    const name = campaignName.trim();
    const premise = campaignPremise.trim();
    if (!conceptReady) {
      toast.error("Campaign name and premise are required.");
      return;
    }

    setPhase({ kind: "creating" });
    try {
      const payload: { name: string; premise: string; seeds?: Partial<WorldSeeds> } = {
        name,
        premise,
      };
      if (seeds && Object.keys(seeds).length > 0) {
        payload.seeds = seeds;
      }

      const created = await apiPost<CampaignMeta>("/api/campaigns", payload);
      toast.success("Campaign created", { description: created.name });

      // Close dialog and clear form before generation starts
      // so the fullscreen overlay in TitleScreen takes over.
      setCampaignName("");
      setCampaignPremise("");
      setOpen(false);
      resetFlow();
      onCreated();

      await tryGenerateWorld(created.id);

      router.push(`/world-review?campaignId=${created.id}`);
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
      toast.error("Campaign name and premise are required.");
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
      const suggested = await suggestSeeds(campaignPremise.trim());
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
      const suggested = await suggestSeeds(campaignPremise.trim());
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
      const result = await suggestSeed(campaignPremise.trim(), category);
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
    dnaState,

    // Derived state
    isBusy,
    creatingCampaign,
    isGenerating,
    generationProgress,
    isSuggesting,
    suggestingCategory,
    canCreate,

    // Handlers
    createCampaignWithSeeds,
    handleNextToDna,
    handleResuggestAll,
    handleResuggestCategory,
    handleSeedToggle,
    handleSeedTextChange,
    handleCreateWithDna,
  };
}
