import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CampaignWorldStateResponse } from "@/lib/campaign-world-api";
import { campaignWorldReviewFixture } from "@/components/world-review/world-review.test-support";
import {
  CampaignStatusProvider,
  useCampaignStatus,
} from "./campaign-status-provider";

const route = vi.hoisted(() => ({ pathname: "/" }));
const campaignApi = vi.hoisted(() => ({
  getActiveCampaign: vi.fn(),
  loadCampaign: vi.fn(),
}));
const worldApi = vi.hoisted(() => ({
  loadCampaignWorldState: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

vi.mock("@/lib/api", () => ({
  getActiveCampaign: campaignApi.getActiveCampaign,
  loadCampaign: campaignApi.loadCampaign,
}));

vi.mock("@/lib/campaign-world-api", () => ({
  loadCampaignWorldState: worldApi.loadCampaignWorldState,
}));

function unbuiltState(campaignId: string): CampaignWorldStateResponse {
  return {
    status: "unbuilt",
    source: {
      campaignId,
      premise: "A coast",
      dna: null,
      researchSummary: null,
      sourceReferences: [],
      sourceDigest: `digest-${campaignId}`,
    },
    currentBuildId: null,
    currentStage: null,
    lastEventSequence: 0,
  };
}

function reviewState(): CampaignWorldStateResponse {
  return {
    status: "review",
    world: campaignWorldReviewFixture(),
    currentBuildId: "build-1",
    currentStage: "persistence",
    lastEventSequence: 12,
  };
}

function StatusProbe() {
  const value = useCampaignStatus();
  return (
    <div>
      <span data-testid="campaignId">{value.campaignId}</span>
      <span data-testid="campaignName">{value.campaign?.name}</span>
      <span data-testid="worldState">{value.worldState?.status}</span>
      <button type="button" onClick={() => void value.refreshCampaignWorldState()}>Refresh world state</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <CampaignStatusProvider>
      <StatusProbe />
    </CampaignStatusProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  route.pathname = "/";
  campaignApi.getActiveCampaign.mockResolvedValue(null);
  campaignApi.loadCampaign.mockResolvedValue(null);
  worldApi.loadCampaignWorldState.mockResolvedValue(unbuiltState("active-1"));
});

describe("CampaignStatusProvider", () => {
  it("gives a literal campaign route precedence over the active campaign", async () => {
    route.pathname = "/campaign/route-1/forge";
    campaignApi.getActiveCampaign.mockResolvedValue({ id: "active-1", name: "Active Coast" });
    campaignApi.loadCampaign.mockResolvedValue({ id: "route-1", name: "Route Coast" });
    worldApi.loadCampaignWorldState.mockResolvedValue(unbuiltState("route-1"));
    renderProvider();

    expect(await screen.findByTestId("campaignId")).toHaveTextContent("route-1");
    expect(screen.getByTestId("campaignName")).toHaveTextContent("Route Coast");
    expect(campaignApi.loadCampaign).toHaveBeenCalledWith("route-1");
    expect(worldApi.loadCampaignWorldState).toHaveBeenCalledWith("route-1");
  });

  it("treats campaign creation as a non-campaign route and follows the active campaign", async () => {
    route.pathname = "/campaign/new/dna";
    campaignApi.getActiveCampaign.mockResolvedValue({ id: "active-1", name: "Active Coast" });
    worldApi.loadCampaignWorldState.mockResolvedValue(unbuiltState("active-1"));
    renderProvider();

    expect(await screen.findByTestId("campaignId")).toHaveTextContent("active-1");
    expect(campaignApi.loadCampaign).not.toHaveBeenCalled();
    expect(worldApi.loadCampaignWorldState).toHaveBeenCalledWith("active-1");
  });

  it("reloads lifecycle on pathname changes and explicit same-route refresh", async () => {
    route.pathname = "/campaign/campaign-1/forge";
    campaignApi.getActiveCampaign.mockResolvedValue({ id: "campaign-1", name: "Bell Coast" });
    worldApi.loadCampaignWorldState
      .mockResolvedValueOnce(unbuiltState("campaign-1"))
      .mockResolvedValueOnce(unbuiltState("campaign-1"))
      .mockResolvedValueOnce(reviewState());
    const view = renderProvider();
    expect(await screen.findByTestId("worldState")).toHaveTextContent("unbuilt");

    route.pathname = "/campaign/campaign-1/review";
    view.rerender(
      <CampaignStatusProvider>
        <StatusProbe />
      </CampaignStatusProvider>,
    );
    await waitFor(() => expect(worldApi.loadCampaignWorldState).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Refresh world state" }));
    expect(await screen.findByTestId("worldState")).toHaveTextContent("review");
    expect(worldApi.loadCampaignWorldState).toHaveBeenCalledTimes(3);
  });

  it("keeps resolved campaign identity when World State is temporarily unavailable", async () => {
    route.pathname = "/campaign/campaign-1/review";
    campaignApi.getActiveCampaign.mockResolvedValue({ id: "campaign-1", name: "Bell Coast" });
    worldApi.loadCampaignWorldState.mockRejectedValue(new Error("World State unavailable"));

    renderProvider();

    expect(await screen.findByTestId("campaignId")).toHaveTextContent("campaign-1");
    expect(screen.getByTestId("campaignName")).toHaveTextContent("Bell Coast");
    expect(screen.getByTestId("worldState")).toBeEmptyDOMElement();
  });
});
