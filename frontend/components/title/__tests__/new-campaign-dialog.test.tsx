import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewCampaignDialog } from "../new-campaign-dialog";
import type { useNewCampaignWizard } from "../use-new-campaign-wizard";

function createMockWizard(
  overrides: Partial<ReturnType<typeof useNewCampaignWizard>> = {}
): ReturnType<typeof useNewCampaignWizard> {
  return {
    open: true,
    step: 1,
    campaignName: "",
    campaignPremise: "",
    campaignFranchise: "",
    researchEnabled: true,
    isBusy: false,
    canCreate: false,
    creatingCampaign: false,
    isGenerating: false,
    isSuggesting: false,
    suggestingCategory: null,
    dnaState: null,
    generationProgress: null,
    setCampaignName: vi.fn(),
    setCampaignPremise: vi.fn(),
    setCampaignFranchise: vi.fn(),
    setResearchEnabled: vi.fn(),
    setStep: vi.fn(),
    handleOpenChange: vi.fn(),
    handleNextToDna: vi.fn(),
    handleCreateWithSeeds: vi.fn(),
    handleCreateWithDna: vi.fn(),
    handleResuggestAll: vi.fn(),
    handleResuggestCategory: vi.fn(),
    handleSeedToggle: vi.fn(),
    handleSeedTextChange: vi.fn(),
    hasWorldbook: false,
    worldbookFile: null,
    worldbookEntries: null,
    worldbookStatus: "idle",
    classifyProgress: null,
    worldbookError: null,
    handleWorldBookUpload: vi.fn(),
    handleWorldBookRemove: vi.fn(),
    ...overrides,
  };
}

describe("NewCampaignDialog", () => {
  it("renders step 1 with concept form fields", () => {
    const wizard = createMockWizard();
    render(<NewCampaignDialog wizard={wizard} />);

    expect(screen.getByText("Create Campaign — Concept")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Campaign Name")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "Describe your world: setting, tone, key themes..."
      )
    ).toBeInTheDocument();
  });

  it("shows campaign name and premise values", () => {
    const wizard = createMockWizard({
      campaignName: "Dark Realm",
      campaignPremise: "A world of shadows",
    });
    render(<NewCampaignDialog wizard={wizard} />);

    expect(screen.getByDisplayValue("Dark Realm")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A world of shadows")).toBeInTheDocument();
  });

  it("disables action buttons when canCreate is false", () => {
    const wizard = createMockWizard({ canCreate: false });
    render(<NewCampaignDialog wizard={wizard} />);

    const createBtn = screen.getByRole("button", { name: /Create World/i });
    expect(createBtn).toBeDisabled();
  });

  it("enables action buttons when canCreate is true", () => {
    const wizard = createMockWizard({ canCreate: true });
    render(<NewCampaignDialog wizard={wizard} />);

    const createBtn = screen.getByRole("button", { name: /Create World/i });
    expect(createBtn).toBeEnabled();
  });

  it("renders step 2 with World DNA header", () => {
    const wizard = createMockWizard({
      step: 2,
      dnaState: {
        geography: { value: "Mountains", enabled: true, isCustom: false },
        politicalStructure: { value: "Feudal", enabled: true, isCustom: false },
        centralConflict: { value: "War", enabled: true, isCustom: false },
        culturalFlavor: { value: ["Norse"], enabled: true, isCustom: false },
        environment: { value: "Cold", enabled: true, isCustom: false },
        wildcard: { value: "Dragons", enabled: true, isCustom: false },
      },
    });
    render(<NewCampaignDialog wizard={wizard} />);

    expect(
      screen.getByText("Create Campaign — World DNA")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Re-roll All/i })
    ).toBeInTheDocument();
  });

  it("shows loading state on step 2 when suggesting without dnaState", () => {
    const wizard = createMockWizard({
      step: 2,
      isSuggesting: true,
      dnaState: null,
    });
    render(<NewCampaignDialog wizard={wizard} />);

    expect(
      screen.getByText("Generating World DNA suggestions...")
    ).toBeInTheDocument();
  });
});
