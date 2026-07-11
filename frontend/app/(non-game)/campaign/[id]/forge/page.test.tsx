import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { CampaignWorldBuildEvent, CampaignWorldSource } from "@worldforge/shared";

import type {
  CampaignWorldEventStreamOptions,
  CampaignWorldStateResponse,
} from "@/lib/campaign-world-api";
import CampaignForgePage from "./page";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

const campaignApi = vi.hoisted(() => ({
  loadCampaign: vi.fn(),
}));

const worldApi = vi.hoisted(() => ({
  loadCampaignWorldState: vi.fn(),
  saveCampaignWorldDna: vi.fn(),
  createCampaignWorldBuild: vi.fn(),
  streamCampaignWorldBuildEvents: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("@/lib/api", () => ({
  loadCampaign: campaignApi.loadCampaign,
}));

vi.mock("@/lib/campaign-world-api", () => ({
  loadCampaignWorldState: worldApi.loadCampaignWorldState,
  saveCampaignWorldDna: worldApi.saveCampaignWorldDna,
  createCampaignWorldBuild: worldApi.createCampaignWorldBuild,
  streamCampaignWorldBuildEvents: worldApi.streamCampaignWorldBuildEvents,
}));

const source: CampaignWorldSource = {
  campaignId: "campaign-1",
  premise: "A drowned rail kingdom listens for impossible bells.",
  dna: null,
  researchSummary: null,
  sourceReferences: [],
  sourceDigest: "source-digest-1",
};

function unbuiltState(): CampaignWorldStateResponse {
  return {
    status: "unbuilt",
    source,
    currentBuildId: null,
    currentStage: null,
    lastEventSequence: 0,
  };
}

function buildingState(lastEventSequence = 0): CampaignWorldStateResponse {
  return {
    status: "building",
    source,
    build: {
      buildId: "build-1",
      status: "running",
      stage: "world_frame",
      lastEventSequence,
      sourceDigest: source.sourceDigest,
      errorCode: null,
    },
    currentBuildId: "build-1",
    currentStage: "world_frame",
    lastEventSequence,
  };
}

function failedState(): CampaignWorldStateResponse {
  return {
    status: "failed",
    source,
    build: {
      buildId: "build-1",
      status: "failed",
      stage: "world_cast",
      lastEventSequence: 3,
      sourceDigest: source.sourceDigest,
      errorCode: "provider_failed",
    },
    currentBuildId: "build-1",
    currentStage: "world_cast",
    lastEventSequence: 3,
  };
}

function reviewState(): CampaignWorldStateResponse {
  return {
    status: "review",
    currentBuildId: "build-1",
    currentStage: "persistence",
    lastEventSequence: 3,
    world: {
      campaignId: "campaign-1",
      status: "review",
      version: 1,
      contentHash: "world-hash-1",
      sourceDigest: source.sourceDigest,
      worldSummary: "Guild trains cross a coast where signal bells answer back.",
      locations: [],
      routes: [],
      actors: [],
      goals: [],
      relations: [],
      placements: [],
      pressures: [],
      builtAt: 3000,
      acceptedAt: null,
      source: {
        premise: source.premise,
        dna: null,
        researchSummary: null,
        sourceReferences: [],
      },
    },
  };
}

const startedEvent: CampaignWorldBuildEvent = {
  sequence: 1,
  buildId: "build-1",
  type: "build_started",
  createdAt: 1000,
};

const stageEvent: CampaignWorldBuildEvent = {
  sequence: 2,
  buildId: "build-1",
  type: "stage_started",
  stage: "world_frame",
  createdAt: 2000,
};

const completedEvent: CampaignWorldBuildEvent = {
  sequence: 3,
  buildId: "build-1",
  type: "build_completed",
  worldVersion: 1,
  contentHash: "world-hash-1",
  createdAt: 3000,
};

const failureEvent: CampaignWorldBuildEvent = {
  sequence: 3,
  buildId: "build-1",
  type: "build_failed",
  errorCode: "provider_failed",
  message: "The provider stopped before the world was complete.",
  createdAt: 3000,
};

async function renderPage() {
  const params = Promise.resolve({ id: "campaign-1" });
  let view: ReturnType<typeof render> | undefined;
  await act(async () => {
    view = render(<CampaignForgePage params={params} />);
    await params;
  });
  return view;
}

function pendingStream(
  events: CampaignWorldBuildEvent[] = [],
) {
  return (_campaignId: string, _buildId: string, options: CampaignWorldEventStreamOptions) => {
    for (const event of events) options.onEvent(event);
    return new Promise(() => undefined);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  campaignApi.loadCampaign.mockResolvedValue({
    id: "campaign-1",
    name: "Bell Coast",
    premise: source.premise,
    createdAt: 1,
    updatedAt: 1,
  });
  worldApi.saveCampaignWorldDna.mockResolvedValue({ ...source, dna: null });
  worldApi.createCampaignWorldBuild.mockResolvedValue({
    campaignId: "campaign-1",
    buildId: "build-1",
    sourceDigest: source.sourceDigest,
    startedAt: 1000,
  });
  worldApi.streamCampaignWorldBuildEvents.mockImplementation(pendingStream());
});

describe("CampaignForgePage", () => {
  it("loads an unbuilt campaign from Campaign World and starts its durable build", async () => {
    worldApi.loadCampaignWorldState
      .mockResolvedValueOnce(unbuiltState())
      .mockResolvedValue(buildingState());
    await renderPage();

    const createButton = await screen.findByRole("button", { name: "Create world" });
    fireEvent.click(createButton);

    await waitFor(() => expect(worldApi.createCampaignWorldBuild).toHaveBeenCalledWith(
      "campaign-1",
      "source-digest-1",
    ));
    expect(campaignApi.loadCampaign).toHaveBeenCalledWith("campaign-1");
    expect(worldApi.loadCampaignWorldState).toHaveBeenCalledWith("campaign-1");
    expect(worldApi.saveCampaignWorldDna).not.toHaveBeenCalled();
  });

  it("replays a running build from sequence zero in a fresh page instance", async () => {
    worldApi.loadCampaignWorldState.mockResolvedValue(buildingState(2));
    worldApi.streamCampaignWorldBuildEvents.mockImplementation(pendingStream([startedEvent, stageEvent]));
    await renderPage();

    await waitFor(() => expect(worldApi.streamCampaignWorldBuildEvents).toHaveBeenCalled());
    const options = worldApi.streamCampaignWorldBuildEvents.mock.calls[0]![2] as CampaignWorldEventStreamOptions;
    expect(options.afterSequence).toBe(0);
    expect(await screen.findByRole("list", { name: "Persisted build events" })).toHaveTextContent("Locations started");
  });

  it("resumes a mounted stream from the last synchronously applied sequence", async () => {
    worldApi.loadCampaignWorldState.mockResolvedValue(buildingState(2));
    worldApi.streamCampaignWorldBuildEvents
      .mockImplementationOnce(async (
        _campaignId: string,
        _buildId: string,
        options: CampaignWorldEventStreamOptions,
      ) => {
        options.onEvent(startedEvent);
        options.onEvent(stageEvent);
        throw new Error("connection closed");
      })
      .mockImplementationOnce(pendingStream());
    await renderPage();

    await waitFor(() => expect(worldApi.streamCampaignWorldBuildEvents).toHaveBeenCalledTimes(2));
    const resumed = worldApi.streamCampaignWorldBuildEvents.mock.calls[1]![2] as CampaignWorldEventStreamOptions;
    expect(resumed.afterSequence).toBe(2);
    expect(screen.getByText("Build updates paused after event 2. Resuming the durable stream.")).toBeInTheDocument();
  });

  it("applies a duplicate persisted event once", async () => {
    worldApi.loadCampaignWorldState.mockResolvedValue(buildingState(1));
    worldApi.streamCampaignWorldBuildEvents.mockImplementation(pendingStream([startedEvent, startedEvent]));
    await renderPage();

    const ledger = await screen.findByRole("list", { name: "Persisted build events" });
    expect(ledger.children).toHaveLength(1);
  });

  it("does not navigate on build_completed until persisted state is review", async () => {
    worldApi.loadCampaignWorldState
      .mockResolvedValueOnce(buildingState())
      .mockResolvedValueOnce(buildingState(3));
    worldApi.streamCampaignWorldBuildEvents.mockImplementation(async (
      _campaignId: string,
      _buildId: string,
      options: CampaignWorldEventStreamOptions,
    ) => {
      options.onEvent(startedEvent);
      options.onEvent(stageEvent);
      options.onEvent(completedEvent);
      return { lastSequence: 3, terminalEvent: completedEvent };
    });
    await renderPage();

    expect(await screen.findByText("The build completed without a persisted review state.")).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("navigates only after the terminal build has a persisted review projection", async () => {
    worldApi.loadCampaignWorldState
      .mockResolvedValueOnce(buildingState())
      .mockResolvedValueOnce(reviewState());
    worldApi.streamCampaignWorldBuildEvents.mockImplementation(async (
      _campaignId: string,
      _buildId: string,
      options: CampaignWorldEventStreamOptions,
    ) => {
      options.onEvent(startedEvent);
      options.onEvent(stageEvent);
      options.onEvent(completedEvent);
      return { lastSequence: 3, terminalEvent: completedEvent };
    });
    await renderPage();

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/campaign/campaign-1/review"));
  });

  it("restores the persisted safe failure message after reload", async () => {
    worldApi.loadCampaignWorldState.mockResolvedValue(failedState());
    worldApi.streamCampaignWorldBuildEvents.mockImplementation(async (
      _campaignId: string,
      _buildId: string,
      options: CampaignWorldEventStreamOptions,
    ) => {
      options.onEvent(startedEvent);
      options.onEvent(stageEvent);
      options.onEvent(failureEvent);
      return { lastSequence: 3, terminalEvent: failureEvent };
    });
    await renderPage();

    expect(await screen.findByText("The provider stopped before the world was complete.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start build again" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Persisted build events" })).not.toHaveTextContent("provider_failed");
  });
});
