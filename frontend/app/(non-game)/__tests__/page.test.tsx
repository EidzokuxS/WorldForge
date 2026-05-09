import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  getActiveCampaign: vi.fn(),
  getWorldData: vi.fn(),
  loadCampaign: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  apiGet: apiMock.apiGet,
  apiDelete: apiMock.apiDelete,
  getActiveCampaign: apiMock.getActiveCampaign,
  getWorldData: apiMock.getWorldData,
  loadCampaign: apiMock.loadCampaign,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@worldforge/shared", () => ({
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

import LauncherPage from "@/app/(non-game)/page";

describe("LauncherPage", () => {
  beforeEach(() => {
    apiMock.apiGet.mockReset();
    apiMock.apiDelete.mockReset();
    apiMock.getActiveCampaign.mockReset();
    apiMock.getWorldData.mockReset();
    apiMock.loadCampaign.mockReset();
  });

  it("renders the launcher with campaign actions and recent campaigns section", async () => {
    apiMock.apiGet.mockResolvedValueOnce([]);
    apiMock.getActiveCampaign.mockResolvedValueOnce(null);

    render(<LauncherPage />);

    const link = screen.getByRole("link", { name: /New campaign/i });
    expect(link).toHaveAttribute("href", "/campaign/new");
    expect(screen.getByRole("heading", { name: /Forge a world/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Campaign library")).toBeInTheDocument();
    });
  });

  it("uses real world scene data for the V4 home hero instead of campaign-library placeholders", async () => {
    const campaign = {
      id: "c1",
      name: "The Seventh Mercy",
      premise: "A generation ship premise.",
      createdAt: Date.now() - 10_000,
      updatedAt: Date.now() - 120_000,
      generationComplete: true,
    };

    apiMock.apiGet.mockResolvedValueOnce([campaign]);
    apiMock.getActiveCampaign.mockResolvedValueOnce(campaign);
    apiMock.getWorldData.mockResolvedValueOnce({
      currentScene: {
        id: "scene-1",
        name: "Spinal Chapel deck 12",
        broadLocationId: "loc-1",
        broadLocationName: "Spinal Chapel",
        sceneNpcIds: [],
        clearNpcIds: [],
        awareness: { byNpcId: {}, hintSignals: [] },
      },
      locations: [{
        id: "scene-1",
        campaignId: "c1",
        name: "Spinal Chapel deck 12",
        description: "Iru has stopped by the bulkhead with the captain's log in his hand.",
        tags: [],
        connectedTo: [],
        isStarting: true,
      }],
      npcs: [],
      factions: [],
      relationships: [],
      items: [],
      player: {
        id: "p1",
        campaignId: "c1",
        name: "Iru",
        race: "",
        gender: "",
        age: "",
        appearance: "",
        hp: 10,
        tags: [],
        equippedItems: [],
        inventory: [],
        equipment: [],
        currentLocationId: "scene-1",
        sceneScopeId: "scene-1",
      },
      personaTemplates: [],
    });

    render(<LauncherPage />);

    expect(await screen.findByText("Current scene")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Spinal Chapel deck 12/i })).toBeInTheDocument();
    expect(screen.getByText("Iru is present")).toBeInTheDocument();
    expect(screen.getByText("dialogue beat open")).toBeInTheDocument();
    expect(screen.queryByText("Saved campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("Local disk")).not.toBeInTheDocument();
    expect(document.querySelector(".wf-home-pin[data-state='hot']")).not.toBeNull();
  });
});
