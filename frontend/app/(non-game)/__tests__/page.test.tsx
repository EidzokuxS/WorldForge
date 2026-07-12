import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiMock = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  getActiveCampaign: vi.fn(),
  loadCampaign: vi.fn(),
}));

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const campaignNavigation = vi.hoisted(() => ({ loadCampaignDestination: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("@/lib/campaign-navigation", () => campaignNavigation);

vi.mock("@/lib/api", () => ({
  apiGet: apiMock.apiGet,
  apiDelete: apiMock.apiDelete,
  getActiveCampaign: apiMock.getActiveCampaign,
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
    apiMock.loadCampaign.mockReset();
    navigation.push.mockReset();
    campaignNavigation.loadCampaignDestination.mockReset();
  });

  it("loads the campaign before navigating to its persisted product phase", async () => {
    const campaign = {
      id: "c1",
      name: "The Seventh Mercy",
      premise: "A generation ship premise.",
      createdAt: 1,
      updatedAt: 2,
    };
    apiMock.apiGet.mockResolvedValue([campaign]);
    apiMock.getActiveCampaign.mockResolvedValue(null);
    apiMock.loadCampaign.mockResolvedValue(campaign);
    campaignNavigation.loadCampaignDestination.mockResolvedValue("/campaign/c1/character");

    render(<LauncherPage />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Load" }));

    await waitFor(() => expect(campaignNavigation.loadCampaignDestination).toHaveBeenCalledWith("c1"));
    expect(navigation.push).toHaveBeenCalledWith("/campaign/c1/character");
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

  it("uses campaign metadata for the home hero", async () => {
    const campaign = {
      id: "c1",
      name: "The Seventh Mercy",
      premise: "A generation ship premise.",
      createdAt: Date.now() - 10_000,
      updatedAt: Date.now() - 120_000,
    };

    apiMock.apiGet.mockResolvedValueOnce([campaign]);
    apiMock.getActiveCampaign.mockResolvedValueOnce(campaign);
    render(<LauncherPage />);

    expect(await screen.findByText("Current campaign")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /The Seventh Mercy/i })).toBeInTheDocument();
    expect(document.querySelector(".wf-home-lede")).toHaveTextContent("A generation ship premise.");
    expect(screen.getByText("Ready to enter")).toBeInTheDocument();
    expect(screen.getByText("campaign state")).toBeInTheDocument();
    expect(document.querySelector(".wf-home-pin[data-state='hot']")).not.toBeNull();
  });
});
