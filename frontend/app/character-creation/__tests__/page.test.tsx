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
  loadCampaign: vi.fn(),
  getWorldData: vi.fn(),
  parseCharacter: vi.fn(),
  generateCharacter: vi.fn(),
  saveCharacter: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/components/character-creation/character-form", () => ({
  CharacterForm: (props: Record<string, unknown>) => (
    <div data-testid="character-form" data-parsing={String(props.parsing)} data-generating={String(props.generating)} />
  ),
}));

vi.mock("@/components/character-creation/character-card", () => ({
  CharacterCard: () => <div data-testid="character-card" />,
}));

import {
  loadCampaign,
  getWorldData,
} from "@/lib/api";
import CharacterCreationPage from "../page";

const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedGetWorld = vi.mocked(getWorldData);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe("CharacterCreationPage", () => {
  it("shows 'No campaign ID' when campaignId is missing", () => {
    mockGet.mockReturnValue(null);
    render(<CharacterCreationPage />);
    expect(screen.getByText("No campaign ID provided.")).toBeInTheDocument();
  });

  it("shows loading spinner while data is fetching", () => {
    mockGet.mockReturnValue("test-id");
    mockedLoadCampaign.mockReturnValue(new Promise(() => {}));
    mockedGetWorld.mockReturnValue(new Promise(() => {}));

    const { container } = render(<CharacterCreationPage />);
    // Loader2 renders an SVG with animate-spin class
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("renders character form after data loads", async () => {
    mockGet.mockReturnValue("test-id");
    mockedLoadCampaign.mockResolvedValue({ id: "test-id", name: "Test", premise: "A world" } as never);
    mockedGetWorld.mockResolvedValue({
      locations: [{ name: "Town" }],
      factions: [],
      npcs: [],
      relationships: [],
    } as never);

    render(<CharacterCreationPage />);

    await waitFor(() => {
      expect(screen.getByText("Create Your Character")).toBeInTheDocument();
    });
    expect(screen.getByTestId("character-form")).toBeInTheDocument();
  });

  it("does not render character card when no character is set", async () => {
    mockGet.mockReturnValue("test-id");
    mockedLoadCampaign.mockResolvedValue({ id: "test-id", name: "Test", premise: "A world" } as never);
    mockedGetWorld.mockResolvedValue({
      locations: [{ name: "Town" }],
      factions: [],
      npcs: [],
      relationships: [],
    } as never);

    render(<CharacterCreationPage />);

    await waitFor(() => {
      expect(screen.getByText("Create Your Character")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("character-card")).not.toBeInTheDocument();
    expect(screen.queryByText(/Begin Adventure/)).not.toBeInTheDocument();
  });
});
