import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mockHandleNextToDna = vi.fn();
const mockPush = vi.fn();

const flowState = {
  campaignName: "Arcadia",
  setCampaignName: vi.fn(),
  campaignPremise: "A haunted coast.",
  setCampaignPremise: vi.fn(),
  campaignFranchise: "The Witcher",
  setCampaignFranchise: vi.fn(),
  researchEnabled: true,
  setResearchEnabled: vi.fn(),
  hasWorldbook: true,
  selectedWorldbooks: [{ id: "wb", displayName: "Alpha Codex" }],
  worldbookLibrary: [{ id: "wb", displayName: "Alpha Codex", entryCount: 12 }],
  worldbookLibraryLoading: false,
  worldbookError: null,
  toggleWorldbookSelection: vi.fn(),
  handleWorldbookUpload: vi.fn(),
  canCreate: true,
  isBusy: false,
  isSuggesting: false,
  creatingCampaign: false,
  isGenerating: false,
  generationProgress: null,
  handleCreateWithSeeds: vi.fn(),
  handleNextToDna: mockHandleNextToDna,
};

vi.mock("@/components/campaign-new/flow-provider", () => ({
  useCampaignNewFlow: () => flowState,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import CampaignConceptPage from "@/app/(non-game)/campaign/new/page";

describe("CampaignConceptPage", () => {
  beforeEach(() => {
    mockHandleNextToDna.mockReset();
    mockPush.mockReset();
    flowState.campaignName = "Arcadia";
    flowState.campaignPremise = "A haunted coast.";
    flowState.hasWorldbook = true;
    flowState.canCreate = true;
    flowState.isBusy = false;
    flowState.creatingCampaign = false;
    flowState.isGenerating = false;
    flowState.generationProgress = null;
  });

  it("renders concept, research, and selected-source context in shell-owned routed form", () => {
    render(<CampaignConceptPage />);

    expect(screen.getByLabelText("Campaign Name")).toHaveValue("Arcadia");
    expect(screen.getByLabelText("Premise")).toHaveValue("A haunted coast.");
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Alpha Codex")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to DNA" })).toBeInTheDocument();
  });

  it("uses the wizard guarded DNA startup instead of a bare route push", () => {
    render(<CampaignConceptPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to DNA" }));

    expect(mockHandleNextToDna).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows actionable concept validation when required inputs are still missing", () => {
    flowState.campaignName = "";
    flowState.campaignPremise = "";
    flowState.hasWorldbook = false;
    flowState.canCreate = false;

    render(<CampaignConceptPage />);

    expect(screen.getByText("Enter a campaign name and premise, or select a source, before continuing into DNA.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to DNA" })).toBeDisabled();
  });
});
