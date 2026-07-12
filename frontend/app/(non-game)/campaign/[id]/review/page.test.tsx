import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignWorldReview } from "@worldforge/shared";

import type { CampaignWorldStateResponse } from "@/lib/campaign-world-api";
import { campaignWorldReviewFixture } from "@/components/world-review/world-review.test-support";
import WorldReviewPage from "./page";

const worldApi = vi.hoisted(() => ({
  loadCampaignWorldState: vi.fn(),
  acceptCampaignWorld: vi.fn(),
}));

const shell = vi.hoisted(() => ({
  refreshCampaignWorldState: vi.fn(),
}));

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("@/lib/campaign-world-api", () => ({
  loadCampaignWorldState: worldApi.loadCampaignWorldState,
  acceptCampaignWorld: worldApi.acceptCampaignWorld,
}));

vi.mock("@/components/non-game-shell/campaign-status-provider", () => ({
  useCampaignStatus: () => ({
    campaignId: "campaign-1",
    campaign: { id: "campaign-1", name: "Bell Coast" },
    worldState: null,
    loading: false,
    refreshCampaignWorldState: shell.refreshCampaignWorldState,
  }),
}));

function worldState(
  status: "review" | "accepted" = "review",
  world: CampaignWorldReview = campaignWorldReviewFixture(),
): CampaignWorldStateResponse {
  return {
    status,
    world: {
      ...world,
      status,
      acceptedAt: status === "accepted" ? 4000 : null,
    },
    currentBuildId: "build-1",
    currentStage: "persistence",
    lastEventSequence: 12,
  };
}

async function renderPage() {
  const params = Promise.resolve({ id: "campaign-1" });
  await act(async () => {
    render(
      <Suspense fallback={<div>Loading route</div>}>
        <WorldReviewPage params={params} />
      </Suspense>,
    );
    await params;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  worldApi.loadCampaignWorldState.mockResolvedValue(worldState());
  worldApi.acceptCampaignWorld.mockResolvedValue({
    campaignId: "campaign-1",
    worldVersion: 2,
    contentHash: campaignWorldReviewFixture().contentHash,
    acceptedAt: 4000,
  });
  shell.refreshCampaignWorldState.mockResolvedValue(worldState("accepted"));
});

describe("WorldReviewPage", () => {
  it("renders exactly the persisted Campaign World review tabs", async () => {
    await renderPage();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent?.replaceAll("2", "").replaceAll("1", "").trim())).toEqual([
      "Overview",
      "Locations",
      "Actors",
      "Connections",
      "Source",
    ]);
    expect(screen.queryByRole("tab", { name: "Factions" })).not.toBeInTheDocument();
    expect(screen.queryByText("Continue to Character")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit world")).not.toBeInTheDocument();
  });

  it("moves between location, actor, relation, and pressure details by stable ID", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("tab", { name: "Locations 2" }));
    await user.click(screen.getByRole("button", { name: "Route to Bell Platform, travel cost 2" }));
    expect(screen.getByLabelText("Bell Platform routes")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Connections 2" }));
    const pressure = screen.getByRole("heading", { name: "Closing Route" }).closest("article");
    fireEvent.click(within(pressure!).getByRole("button", { name: "The Signal Guild" }));
    expect(screen.getByRole("tab", { name: "Actors 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("The Signal Guild details")).toBeInTheDocument();
  });

  it("reloads the current projection after a stale acceptance conflict", async () => {
    const refreshedWorld = {
      ...campaignWorldReviewFixture(),
      version: 3,
      contentHash: "fedcba9876543210fedcba9876543210",
    };
    const conflict = Object.assign(new Error("The world changed before acceptance."), {
      code: "world_version_conflict",
      status: 409,
    });
    worldApi.loadCampaignWorldState
      .mockResolvedValueOnce(worldState())
      .mockResolvedValueOnce(worldState("review", refreshedWorld));
    worldApi.acceptCampaignWorld.mockRejectedValue(conflict);
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Accept world" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The world changed before acceptance.");
    expect(worldApi.acceptCampaignWorld).toHaveBeenCalledWith(
      "campaign-1",
      2,
      campaignWorldReviewFixture().contentHash,
    );
    expect(screen.getByText("fedcba987654")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept world" })).toBeEnabled();
  });

  it("accepts the displayed version, refreshes shell lifecycle, and opens Character", async () => {
    worldApi.loadCampaignWorldState
      .mockResolvedValueOnce(worldState())
      .mockResolvedValueOnce(worldState("accepted"));
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Accept world" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/campaign/campaign-1/character"));
    expect(shell.refreshCampaignWorldState).toHaveBeenCalledOnce();
  });

  it("opens Character after persisted acceptance when shell refresh fails", async () => {
    worldApi.loadCampaignWorldState
      .mockResolvedValueOnce(worldState())
      .mockResolvedValueOnce(worldState("accepted"));
    shell.refreshCampaignWorldState.mockRejectedValue(
      new Error("Campaign status refresh failed."),
    );
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Accept world" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/campaign/campaign-1/character"));
  });

  it("restores an accepted world and its exact source snapshot", async () => {
    const user = userEvent.setup();
    worldApi.loadCampaignWorldState.mockResolvedValue(worldState("accepted"));
    await renderPage();

    expect(await screen.findByText("World accepted")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to character" })).toHaveAttribute(
      "href",
      "/campaign/campaign-1/character",
    );
    await user.click(screen.getByRole("tab", { name: "Source" }));
    expect(await screen.findByText("A drowned rail kingdom listens for impossible bells.")).toBeInTheDocument();
    expect(screen.getByText("Rail guilds organize the coast through signal authority.")).toBeInTheDocument();
    expect(screen.getByText("Campaign premise")).toBeInTheDocument();
  });

  it("presents structured research as player-readable source context", async () => {
    const user = userEvent.setup();
    const researchedWorld = campaignWorldReviewFixture();
    researchedWorld.source = {
      ...researchedWorld.source,
      researchSummary: JSON.stringify({
        interpretationSummary: "The named source supplies tone while the campaign keeps its own world structure.",
        tonalNotes: ["Industrial cold", "Civic pressure"],
        ambiguityNotes: ["The source defines mood rather than locations."],
      }),
    };
    worldApi.loadCampaignWorldState.mockResolvedValue(worldState("review", researchedWorld));
    await renderPage();

    await user.click(await screen.findByRole("tab", { name: "Source" }));

    expect(screen.getByText("The named source supplies tone while the campaign keeps its own world structure.")).toBeInTheDocument();
    expect(screen.getByText("Industrial cold · Civic pressure")).toBeInTheDocument();
    expect(screen.getByText("The source defines mood rather than locations.")).toBeInTheDocument();
    expect(screen.queryAllByText((content) => content.includes('"interpretationSummary"'))).toHaveLength(0);
  });

  it("routes construction states back to Campaign Forge", async () => {
    worldApi.loadCampaignWorldState.mockResolvedValue({
      status: "failed",
      source: {
        campaignId: "campaign-1",
        premise: "A coast",
        dna: null,
        researchSummary: null,
        sourceReferences: [],
        sourceDigest: "digest-1",
      },
      build: {
        buildId: "build-1",
        status: "failed",
        stage: "world_cast",
        lastEventSequence: 4,
        sourceDigest: "digest-1",
        errorCode: "provider_failed",
      },
      currentBuildId: "build-1",
      currentStage: "world_cast",
      lastEventSequence: 4,
    });
    await renderPage();

    expect(await screen.findByText("World build needs attention")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Campaign Forge" })).toHaveAttribute(
      "href",
      "/campaign/campaign-1/forge",
    );
  });
});
