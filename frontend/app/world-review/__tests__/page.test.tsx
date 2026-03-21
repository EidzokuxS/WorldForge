import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockPush = vi.fn();
const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockGet }),
}));

vi.mock("@/lib/api", () => ({
  getActiveCampaign: vi.fn(),
  getWorldData: vi.fn(),
  getLoreCards: vi.fn(),
  saveWorldEdits: vi.fn(),
  regenerateSection: vi.fn(),
}));

vi.mock("@/lib/world-data-helpers", () => ({
  toEditableScaffold: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/components/world-review/premise-section", () => ({
  PremiseSection: () => <div data-testid="premise-section" />,
}));
vi.mock("@/components/world-review/locations-section", () => ({
  LocationsSection: () => <div data-testid="locations-section" />,
}));
vi.mock("@/components/world-review/factions-section", () => ({
  FactionsSection: () => <div data-testid="factions-section" />,
}));
vi.mock("@/components/world-review/npcs-section", () => ({
  NpcsSection: () => <div data-testid="npcs-section" />,
}));
vi.mock("@/components/world-review/lore-section", () => ({
  LoreSection: () => <div data-testid="lore-section" />,
}));

import {
  getActiveCampaign,
  getWorldData,
  getLoreCards,
} from "@/lib/api";
import { toEditableScaffold } from "@/lib/world-data-helpers";
import WorldReviewPage from "../page";

const mockedGetActive = vi.mocked(getActiveCampaign);
const mockedGetWorld = vi.mocked(getWorldData);
const mockedGetLore = vi.mocked(getLoreCards);
const mockedToEditable = vi.mocked(toEditableScaffold);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const fakeScaffold = {
  refinedPremise: "A dark fantasy world",
  locations: [{ name: "Ironkeep", description: "A fortress", tags: [], isStarting: true, connectedTo: [] }],
  factions: [{ name: "The Order", tags: [], goals: [], assets: [], territoryNames: [] }],
  npcs: [{ name: "Garan", persona: "Bold", tags: [], goals: { shortTerm: [], longTerm: [] }, locationName: "", factionName: null }],
  loreCards: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldReviewPage", () => {
  it("shows 'No campaign ID' when campaignId is missing", () => {
    mockGet.mockReturnValue(null);
    render(<WorldReviewPage />);
    expect(screen.getByText("No campaign ID provided.")).toBeInTheDocument();
  });

  it("shows loading spinner while data is fetching", () => {
    mockGet.mockReturnValue("test-id");
    mockedGetActive.mockReturnValue(new Promise(() => {}));
    mockedGetWorld.mockReturnValue(new Promise(() => {}));
    mockedGetLore.mockReturnValue(new Promise(() => {}));

    const { container } = render(<WorldReviewPage />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("renders scaffold tabs after data loads", async () => {
    mockGet.mockReturnValue("test-id");
    mockedGetActive.mockResolvedValue({ id: "test-id", name: "Test", premise: "A dark fantasy world" } as never);
    mockedGetWorld.mockResolvedValue({ locations: [], factions: [], npcs: [], relationships: [] } as never);
    mockedGetLore.mockResolvedValue([]);
    mockedToEditable.mockReturnValue(fakeScaffold as never);

    render(<WorldReviewPage />);

    await waitFor(() => {
      expect(screen.getByText("World Review")).toBeInTheDocument();
    });

    expect(screen.getByText("Premise")).toBeInTheDocument();
    expect(screen.getByText("Locations (1)")).toBeInTheDocument();
    expect(screen.getByText("Factions (1)")).toBeInTheDocument();
    expect(screen.getByText("NPCs (1)")).toBeInTheDocument();
    expect(screen.getByText("Lore (0)")).toBeInTheDocument();
  });

  it("shows 'Failed to load' when world data is unavailable", async () => {
    mockGet.mockReturnValue("test-id");
    mockedGetActive.mockRejectedValue(new Error("Network error"));

    render(<WorldReviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load world data.")).toBeInTheDocument();
    });
  });

  it("renders Continue button", async () => {
    mockGet.mockReturnValue("test-id");
    mockedGetActive.mockResolvedValue({ id: "test-id", name: "Test", premise: "A world" } as never);
    mockedGetWorld.mockResolvedValue({ locations: [], factions: [], npcs: [], relationships: [] } as never);
    mockedGetLore.mockResolvedValue([]);
    mockedToEditable.mockReturnValue(fakeScaffold as never);

    render(<WorldReviewPage />);

    await waitFor(() => {
      expect(screen.getByText(/Continue to Character Creation/)).toBeInTheDocument();
    });
  });
});
