"use client";

import type { GenerationProgress, WorldbookLibraryItem } from "@/lib/api";
import type { DnaState } from "@/components/title/utils";

export type CampaignNewFlowPhaseSnapshot =
  | { kind: "idle" }
  | { kind: "suggesting-all" }
  | { kind: "suggesting-category"; category: string }
  | { kind: "creating" }
  | { kind: "generating" };

export type CampaignNewFlowSession = {
  version: 1;
  campaignName: string;
  campaignPremise: string;
  campaignFranchise: string;
  researchEnabled: boolean;
  selectedWorldbooks: WorldbookLibraryItem[];
  dnaState: DnaState | null;
  step: 1 | 2;
  phase: CampaignNewFlowPhaseSnapshot;
  generationProgress: GenerationProgress | null;
};

const STORAGE_KEY = "worldforge.campaign-new-flow";

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readCampaignNewFlowSession(): CampaignNewFlowSession | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CampaignNewFlowSession> | null;
    if (!parsed || parsed.version !== 1) {
      return null;
    }

    return {
      version: 1,
      campaignName: typeof parsed.campaignName === "string" ? parsed.campaignName : "",
      campaignPremise: typeof parsed.campaignPremise === "string" ? parsed.campaignPremise : "",
      campaignFranchise: typeof parsed.campaignFranchise === "string" ? parsed.campaignFranchise : "",
      researchEnabled: parsed.researchEnabled !== false,
      selectedWorldbooks: Array.isArray(parsed.selectedWorldbooks) ? parsed.selectedWorldbooks : [],
      dnaState: parsed.dnaState ?? null,
      step: parsed.step === 2 ? 2 : 1,
      phase: parsed.phase ?? { kind: "idle" },
      generationProgress: parsed.generationProgress ?? null,
    };
  } catch {
    return null;
  }
}

export function writeCampaignNewFlowSession(session: CampaignNewFlowSession): void {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearCampaignNewFlowSession(): void {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function isCampaignNewFlowSessionEmpty(session: CampaignNewFlowSession): boolean {
  return (
    session.campaignName.trim().length === 0
    && session.campaignPremise.trim().length === 0
    && session.campaignFranchise.trim().length === 0
    && session.selectedWorldbooks.length === 0
    && session.dnaState === null
    && session.step === 1
    && session.phase.kind === "idle"
    && session.generationProgress === null
  );
}
