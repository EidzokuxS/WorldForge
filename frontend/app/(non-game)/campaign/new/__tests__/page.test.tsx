import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  generationProgress: null as { step: number; totalSteps: number; label: string; subStep?: number; subTotal?: number; subLabel?: string } | null,
  generationError: null,
  dnaState: null as Record<string, { enabled: boolean; value: string | string[]; isCustom: boolean }> | null,
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
    flowState.isSuggesting = false;
    flowState.creatingCampaign = false;
    flowState.isGenerating = false;
    flowState.generationProgress = null;
    flowState.generationError = null;
    flowState.dnaState = null;
  });

  it("renders concept, research, and selected-source context in shell-owned routed form", () => {
    render(<CampaignConceptPage />);

    expect(screen.getByLabelText("Campaign Name")).toHaveValue("Arcadia");
    expect(screen.getByLabelText("Premise")).toHaveValue("A haunted coast.");
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Alpha Codex")).toBeInTheDocument();
    expect(screen.getByText("Import worldbook JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to DNA" })).toBeInTheDocument();
    expect(screen.getByText("Forge sequence")).toBeInTheDocument();

    const sourceStep = screen.getByText("Sources").closest(".wf-form-step");
    expect(sourceStep).not.toBeNull();
    expect(sourceStep?.querySelector(".wf-forge-source")).not.toBeNull();
    expect(document.querySelectorAll(".wf-form-step")).toHaveLength(4);
    expect(document.querySelector(".wf-set-toggle")).not.toBeNull();

    const side = document.querySelector(".wf-forge-side");
    expect(side?.textContent).toContain("Forge sequence");
    expect(side?.textContent).not.toContain("Alpha Codex");

    const cta = document.querySelector(".wf-forge-cta");
    expect(cta).not.toBeNull();
    expect(cta?.closest(".wf-forge-main")).not.toBeNull();
    expect(cta?.closest(".wf-forge-shell")?.lastElementChild).not.toBe(cta);
  });

  it("uses the wizard guarded DNA startup instead of a bare route push", () => {
    mockHandleNextToDna.mockResolvedValue(false);
    render(<CampaignConceptPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to DNA" }));

    expect(mockHandleNextToDna).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("routes to DNA only after the wizard reports that DNA is ready", async () => {
    mockHandleNextToDna.mockResolvedValue(true);
    render(<CampaignConceptPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to DNA" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/campaign/new/dna");
    });
  });

  it("stays on concept when the wizard rejects DNA startup", async () => {
    mockHandleNextToDna.mockResolvedValue(false);
    render(<CampaignConceptPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to DNA" }));

    await waitFor(() => {
      expect(mockHandleNextToDna).toHaveBeenCalledTimes(1);
    });
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

  it("switches to the V4 worldgen surface while backend generation is running", () => {
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

    render(<CampaignConceptPage />);

    expect(screen.getByTestId("worldgen-surface")).toBeInTheDocument();
    expect(screen.getByText("Forging - step 4 of 10")).toBeInTheDocument();
    expect(document.querySelector(".wf-gen-h")?.textContent).toContain("Forging factions");
    expect(screen.getAllByText(/Faction: Shibuya Incident Alliance - 4 of 5/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Generation stages")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".wf-gen-loc")).toHaveLength(0);
    expect(screen.getByTestId("engine-trace")).toBeInTheDocument();
    expect(document.querySelector(".wf-forge-cta")).toBeNull();
  });

  it("switches to a full DNA preparation surface while suggestions are running", () => {
    flowState.isBusy = true;
    flowState.isSuggesting = true;
    flowState.dnaState = null;

    render(<CampaignConceptPage />);

    expect(screen.getByTestId("dna-suggestion-surface")).toBeInTheDocument();
    expect(screen.getByText("World DNA - preparing suggestions")).toBeInTheDocument();
    expect(screen.getAllByText("Alpha Codex").length).toBeGreaterThan(0);
    expect(document.querySelector(".wf-forge-cta")).toBeNull();
    expect(document.querySelector(".wf-forge-shell")).toBeNull();
  });
});
