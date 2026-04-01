import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const flowState = {
  isBusy: false,
  isSuggesting: false,
  suggestingCategory: null,
  creatingCampaign: false,
  isGenerating: false,
  generationProgress: null as { step: number; totalSteps: number; label: string } | null,
  handleResuggestAll: vi.fn(),
  handleResuggestCategory: vi.fn(),
  handleCreateWithDna: vi.fn(),
  handleSeedTextChange: vi.fn(),
  dnaState: {
    geography: { enabled: true, value: "Storm coast", isCustom: false },
    politicalStructure: { enabled: true, value: "Guild council", isCustom: false },
    centralConflict: { enabled: true, value: "Trade war", isCustom: false },
    culturalFlavor: { enabled: true, value: ["masked festivals"], isCustom: false },
    environment: { enabled: true, value: "Sea caves", isCustom: false },
    wildcard: { enabled: true, value: "Whispering relics", isCustom: false },
  },
};

vi.mock("@/components/campaign-new/flow-provider", () => ({
  useCampaignNewFlow: () => flowState,
}));

import CampaignDnaPage from "@/app/(non-game)/campaign/new/dna/page";

describe("CampaignDnaPage", () => {
  beforeEach(() => {
    flowState.isBusy = false;
    flowState.isSuggesting = false;
    flowState.suggestingCategory = null;
    flowState.creatingCampaign = false;
    flowState.isGenerating = false;
    flowState.generationProgress = null;
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

    expect(screen.getByText("World DNA")).toBeInTheDocument();
    expect(screen.getByText(/Storm coast/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create World" })).toBeInTheDocument();
  });

  it("renders visible world-generation progress and disables the create CTA while work is in flight", () => {
    flowState.isBusy = true;
    flowState.creatingCampaign = true;
    flowState.isGenerating = true;
    flowState.generationProgress = {
      step: 3,
      totalSteps: 5,
      label: "Generating factions",
    };

    render(<CampaignDnaPage />);

    expect(screen.getByText("Generating factions")).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create World" })).toBeDisabled();
  });

  it("replaces the dead fallback with actionable recovery guidance when DNA is still empty", () => {
    flowState.dnaState = null;

    render(<CampaignDnaPage />);

    expect(screen.getByText("World DNA has not been prepared yet. Go back to concept, continue into DNA, or start with at least one manual seed before generating.")).toBeInTheDocument();
    expect(screen.queryByText("DNA suggestions are not ready yet. Return to concept and continue when the flow is populated.")).not.toBeInTheDocument();
  });
});
