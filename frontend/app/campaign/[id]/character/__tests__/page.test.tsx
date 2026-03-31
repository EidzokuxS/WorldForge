import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { Suspense } from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/api", () => ({
  loadCampaign: vi.fn(),
  getWorldData: vi.fn(),
  parseCharacter: vi.fn(),
  generateCharacter: vi.fn(),
  importV2Card: vi.fn(),
  saveCharacter: vi.fn(),
}));

vi.mock("@/lib/v2-card-parser", () => ({
  parseV2CardFile: vi.fn(),
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
    <div
      data-testid="character-form"
      data-parsing={String(props.parsing)}
      data-generating={String(props.generating)}
      data-importing={String(props.importing)}
    />
  ),
}));

vi.mock("@/components/character-creation/character-card", () => ({
  CharacterCard: () => <div data-testid="character-card" />,
}));

import { loadCampaign, getWorldData } from "@/lib/api";
import CharacterCreationPage from "../page";

const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedGetWorld = vi.mocked(getWorldData);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wraps the page component with Suspense since it uses React.use(Promise). */
async function renderPage(campaignId: string) {
  const params = Promise.resolve({ id: campaignId });
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
        <CharacterCreationPage params={params} />
      </Suspense>,
    );
  });
  return result!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe("CharacterCreationPage (campaign/[id]/character)", () => {
  it("renders loading spinner while world data is fetching", async () => {
    mockedLoadCampaign.mockReturnValue(new Promise(() => {}));
    mockedGetWorld.mockReturnValue(new Promise(() => {}));

    const { container } = await renderPage("test-id");

    // The component starts with busy="loading" which renders Loader2 (animate-spin)
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("renders character form after data loads", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "test-id",
      name: "Test",
      premise: "A world",
    } as never);
    mockedGetWorld.mockResolvedValue({
      locations: [{ name: "Town" }],
      factions: [],
      npcs: [],
      relationships: [],
    } as never);

    await renderPage("test-id");

    await waitFor(() => {
      expect(screen.getByText("Create Your Character")).toBeInTheDocument();
    });
    expect(screen.getByTestId("character-form")).toBeInTheDocument();
  });

  it("loads the campaign before requesting world data", async () => {
    const callOrder: string[] = [];
    mockedLoadCampaign.mockImplementation(async () => {
      callOrder.push("loadCampaign");
      return {
        id: "test-id",
        name: "Test",
        premise: "A world",
      } as never;
    });
    mockedGetWorld.mockImplementation(async () => {
      callOrder.push("getWorldData");
      return {
        locations: [{ name: "Town" }],
        factions: [],
        npcs: [],
        relationships: [],
      } as never;
    });

    await renderPage("test-id");

    await waitFor(() => {
      expect(screen.getByText("Create Your Character")).toBeInTheDocument();
    });

    expect(callOrder[0]).toBe("loadCampaign");
    expect(callOrder).toContain("getWorldData");
  });

  it("renders form with correct busy states when idle", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "test-id",
      name: "Test",
      premise: "A world",
    } as never);
    mockedGetWorld.mockResolvedValue({
      locations: [],
      factions: [],
      npcs: [],
      relationships: [],
    } as never);

    await renderPage("test-id");

    await waitFor(() => {
      expect(screen.getByTestId("character-form")).toBeInTheDocument();
    });

    const form = screen.getByTestId("character-form");
    expect(form).toHaveAttribute("data-parsing", "false");
    expect(form).toHaveAttribute("data-generating", "false");
    expect(form).toHaveAttribute("data-importing", "false");
  });

  it("does not render character card when no character is set", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "test-id",
      name: "Test",
      premise: "A world",
    } as never);
    mockedGetWorld.mockResolvedValue({
      locations: [],
      factions: [],
      npcs: [],
      relationships: [],
    } as never);

    await renderPage("test-id");

    await waitFor(() => {
      expect(screen.getByText("Create Your Character")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("character-card")).not.toBeInTheDocument();
    expect(screen.queryByText(/Begin Adventure/)).not.toBeInTheDocument();
  });
});
