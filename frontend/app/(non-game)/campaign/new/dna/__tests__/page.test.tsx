import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const flowState = {
  campaignName: "Arcadia",
  campaignPremise: "A haunted coast.",
  campaignFranchise: "",
  researchEnabled: true,
  selectedWorldbooks: [{ id: "wb", displayName: "Alpha Codex", entryCount: 12 }],
  isBusy: false,
  isSuggesting: false,
  suggestingCategory: null,
  creatingCampaign: false,
  isGenerating: false,
  generationProgress: null as { step: number; totalSteps: number; label: string; subStep?: number; subTotal?: number; subLabel?: string } | null,
  generationError: null as string | null,
  handleResuggestAll: vi.fn(),
  handleResuggestCategory: vi.fn(),
  handleCreateWithDna: vi.fn(),
  handleSeedTextChange: vi.fn(),
  handleSeedToggle: vi.fn(),
  handlePrepareManualDna: vi.fn(),
  dnaState: {
    geography: { enabled: true, value: "Storm coast", isCustom: false },
    politicalStructure: { enabled: true, value: "Guild council", isCustom: false },
    centralConflict: { enabled: true, value: "Trade war", isCustom: false },
    culturalFlavor: { enabled: true, value: ["masked festivals"], isCustom: false },
    environment: { enabled: true, value: "Sea caves", isCustom: false },
    wildcard: { enabled: true, value: "Whispering relics", isCustom: false },
  } as Record<string, { enabled: boolean; value: string | string[]; isCustom: boolean }> | null,
};

vi.mock("@/components/campaign-new/flow-provider", () => ({
  useCampaignNewFlow: () => flowState,
}));

vi.mock("@/components/title/utils", async () => {
  const actual = await vi.importActual<typeof import("@/components/title/utils")>("@/components/title/utils");
  return actual;
});

import CampaignDnaPage from "@/app/(non-game)/campaign/new/dna/page";

describe("CampaignDnaPage", () => {
  beforeEach(() => {
    flowState.isBusy = false;
    flowState.isSuggesting = false;
    flowState.suggestingCategory = null;
    flowState.creatingCampaign = false;
    flowState.isGenerating = false;
    flowState.generationProgress = null;
    flowState.generationError = null;
    flowState.dnaState = {
      geography: { enabled: true, value: "Storm coast", isCustom: false },
      politicalStructure: { enabled: true, value: "Guild council", isCustom: false },
      centralConflict: { enabled: true, value: "Trade war", isCustom: false },
      culturalFlavor: { enabled: true, value: ["masked festivals"], isCustom: false },
      environment: { enabled: true, value: "Sea caves", isCustom: false },
      wildcard: { enabled: true, value: "Whispering relics", isCustom: false },
    };
  });

  it("renders routed DNA editing on persisted flow state", () => {
    render(<CampaignDnaPage />);

    expect(screen.getByTestId("dna-edit-surface")).toBeInTheDocument();
    expect(screen.getByText("World DNA - review")).toBeInTheDocument();
    expect(screen.getByText("Geography")).toBeInTheDocument();
    expect(screen.getByText(/Storm coast/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create World" })).toBeInTheDocument();
    expect(document.querySelectorAll(".wf-dna-seed-card")).toHaveLength(6);
    expect(document.querySelector(".wf-dna-shell")).toBeNull();
    expect(document.querySelector(".wf-set-toggle")).toBeNull();
  });

  it("renders the V4 world-generation surface while work is in flight", () => {
    flowState.isBusy = true;
    flowState.creatingCampaign = true;
    flowState.isGenerating = true;
    flowState.generationProgress = {
      step: 3,
      totalSteps: 10,
      label: "Forging factions",
      subStep: 3,
      subTotal: 5,
      subLabel: "Faction: Shibuya Incident Alliance",
    };

    render(<CampaignDnaPage />);

    expect(screen.getByTestId("worldgen-surface")).toBeInTheDocument();
    expect(screen.getByText("Forging - step 4 of 10")).toBeInTheDocument();
    expect(screen.getAllByText(/Faction: Shibuya Incident Alliance - 4 of 5/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Generation stages")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".wf-gen-loc")).toHaveLength(0);
    expect(screen.getByTestId("engine-trace")).toBeInTheDocument();
    expect(document.querySelectorAll(".wf-gen-dna-card")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "Generating World..." })).not.toBeInTheDocument();
  });

  it("replaces the dead fallback with actionable recovery guidance when DNA is still empty", () => {
    flowState.dnaState = null;

    render(<CampaignDnaPage />);

    expect(screen.getByText("World DNA has not been prepared.")).toBeInTheDocument();
    expect(screen.queryByText("DNA suggestions are not ready yet. Return to concept and continue when the flow is populated.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start With Manual DNA" })).toBeInTheDocument();
  });

  it("does not duplicate DNA generation progress in the center and footer", () => {
    flowState.dnaState = null;
    flowState.isSuggesting = true;

    render(<CampaignDnaPage />);

    expect(screen.getByTestId("dna-suggestion-surface")).toBeInTheDocument();
    expect(screen.getByText("World DNA - preparing suggestions")).toBeInTheDocument();
    expect(screen.queryByText("Generating World DNA suggestions...")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-roll All" })).not.toBeInTheDocument();
    expect(document.querySelector(".wf-dna-shell")).toBeNull();
  });
});
