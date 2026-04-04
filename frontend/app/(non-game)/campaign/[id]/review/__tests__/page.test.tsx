import { Suspense } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  loadCampaign: vi.fn(),
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
  },
}));

vi.mock("@/components/world-review/premise-section", () => ({
  PremiseSection: () => <div>Premise Section</div>,
}));
vi.mock("@/components/world-review/locations-section", () => ({
  LocationsSection: () => <div>Locations Section</div>,
}));
vi.mock("@/components/world-review/factions-section", () => ({
  FactionsSection: () => <div>Factions Section</div>,
}));
vi.mock("@/components/world-review/npcs-section", () => ({
  NpcsSection: () => <div>NPC Section</div>,
}));
vi.mock("@/components/world-review/lore-section", () => ({
  LoreSection: () => <div>Lore Section</div>,
}));

import { getLoreCards, getWorldData, loadCampaign } from "@/lib/api";
import { toEditableScaffold } from "@/lib/world-data-helpers";
import WorldReviewPage from "@/app/(non-game)/campaign/[id]/review/page";

const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedGetWorldData = vi.mocked(getWorldData);
const mockedGetLoreCards = vi.mocked(getLoreCards);
const mockedToEditableScaffold = vi.mocked(toEditableScaffold);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldReviewPage", () => {
  it("renders review tabs, premise section, and navigation footer", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A world",
      generationComplete: true,
    } as never);
    mockedGetWorldData.mockResolvedValue({ locations: [], factions: [], npcs: [], relationships: [] } as never);
    mockedGetLoreCards.mockResolvedValue([]);
    mockedToEditableScaffold.mockReturnValue({
      refinedPremise: "A world",
      locations: [{ name: "Ironkeep" }],
      factions: [{ name: "The Order" }],
      npcs: [{ name: "Garan" }],
      loreCards: [],
    } as never);

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading route...</div>}>
          <WorldReviewPage params={Promise.resolve({ id: "campaign-1" })} />
        </Suspense>,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Premise Section")).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: /Premise/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Locations/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Factions/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /NPCs/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Lore/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Character" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Launchpad" })).toBeInTheDocument();
  });

  it("blocks world review when the campaign is not generation-ready", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A world",
      generationComplete: false,
    } as never);

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading route...</div>}>
          <WorldReviewPage params={Promise.resolve({ id: "campaign-1" })} />
        </Suspense>,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("World generation required")).toBeInTheDocument();
    });

    expect(mockedGetWorldData).not.toHaveBeenCalled();
    expect(screen.queryByText("Premise Section")).not.toBeInTheDocument();
  });
});
