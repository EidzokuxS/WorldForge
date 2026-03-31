import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewCampaignDialog } from "../new-campaign-dialog";
import type { useNewCampaignWizard } from "../use-new-campaign-wizard";

const LIBRARY_ITEMS = [
  {
    id: "wb-alpha",
    displayName: "Alpha Codex",
    normalizedSourceHash: "hash-alpha",
    entryCount: 12,
    createdAt: 100,
    updatedAt: 100,
  },
  {
    id: "wb-beta",
    displayName: "Beta Atlas",
    normalizedSourceHash: "hash-beta",
    entryCount: 7,
    createdAt: 200,
    updatedAt: 250,
  },
];

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
    worldbookLibrary: LIBRARY_ITEMS,
    selectedWorldbooks: [],
    worldbookLibraryLoading: false,
    worldbookStatus: "idle",
    worldbookError: null,
    handleWorldbookUpload: vi.fn(),
    toggleWorldbookSelection: vi.fn(),
    ...overrides,
  };
}

describe("NewCampaignDialog", () => {
  it("renders a reusable worldbook library section with selection state", async () => {
    const user = userEvent.setup();
    const wizard = createMockWizard({
      selectedWorldbooks: [LIBRARY_ITEMS[0]],
    });

    render(<NewCampaignDialog wizard={wizard} />);

    expect(screen.getByText("Knowledge Sources")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alpha Codex/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Beta Atlas/i })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: /Beta Atlas/i }));
    expect(wizard.toggleWorldbookSelection).toHaveBeenCalledWith(LIBRARY_ITEMS[1]);
  });

  it("keeps upload controls visible and shows import progress", () => {
    const wizard = createMockWizard({
      worldbookStatus: "importing",
    });

    render(<NewCampaignDialog wizard={wizard} />);

    expect(screen.getByText("Add Worldbook JSON")).toBeInTheDocument();
    expect(screen.getByText("Importing reusable worldbook...")).toBeInTheDocument();
  });

  it("shows reusable import errors without hiding the upload affordance", () => {
    const wizard = createMockWizard({
      worldbookStatus: "error",
      worldbookError: "Import failed",
    });

    render(<NewCampaignDialog wizard={wizard} />);

    expect(screen.getByText("Add Worldbook JSON")).toBeInTheDocument();
    expect(screen.getByText("Import failed")).toBeInTheDocument();
  });

  it("treats premise as optional when worldbooks are selected", () => {
    const wizard = createMockWizard({
      canCreate: true,
      hasWorldbook: true,
      selectedWorldbooks: [LIBRARY_ITEMS[0]],
    });

    render(<NewCampaignDialog wizard={wizard} />);

    expect(
      screen.getByPlaceholderText(
        "Describe your world (optional - selected worldbooks provide context)..."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create World/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Next → World DNA/i })).toBeEnabled();
  });

  it("renders step 2 with the World DNA header", () => {
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

    expect(screen.getByText("Create Campaign - World DNA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Re-roll All/i })).toBeInTheDocument();
  });
});
