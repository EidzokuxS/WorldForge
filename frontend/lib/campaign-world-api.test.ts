import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CampaignWorldBuildEvent,
  CampaignWorldDna,
  CampaignWorldSource,
} from "@worldforge/shared";

import {
  acceptCampaignWorld,
  CampaignWorldApiError,
  createCampaignWorldBuild,
  loadCampaignWorldSource,
  loadCampaignWorldState,
  saveCampaignWorldDna,
  streamCampaignWorldBuildEvents,
} from "./campaign-world-api";

const source: CampaignWorldSource = {
  campaignId: "campaign one",
  premise: "A drowned rail kingdom listens for impossible bells.",
  dna: null,
  researchSummary: null,
  sourceReferences: [],
  sourceDigest: "source-digest-1",
};

const dna: CampaignWorldDna = {
  geography: "Flooded stations",
  politicalStructure: "Signal guild councils",
  centralConflict: "The last dry route is closing",
  culturalFlavor: "Rail noir and signal liturgy",
  environment: "Salt storms",
  wildcard: "The bells answer questions",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function eventBlock(
  event: CampaignWorldBuildEvent,
  lineEnding = "\n",
  id = String(event.sequence),
  eventName = event.type,
): string {
  return [
    `id: ${id}`,
    `event: ${eventName}`,
    `data: ${JSON.stringify(event)}`,
    "",
    "",
  ].join(lineEnding);
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=UTF-8" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Campaign World API", () => {
  it("uses the exact Campaign World JSON endpoints and request bodies", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(source))
      .mockResolvedValueOnce(jsonResponse({ ...source, dna, sourceDigest: "source-digest-2" }))
      .mockResolvedValueOnce(jsonResponse({
        campaignId: "campaign one",
        buildId: "build-1",
        sourceDigest: "source-digest-2",
        startedAt: 1200,
      }, 202))
      .mockResolvedValueOnce(jsonResponse({
        status: "unbuilt",
        source,
        currentBuildId: null,
        currentStage: null,
        lastEventSequence: 0,
      }))
      .mockResolvedValueOnce(jsonResponse({
        campaignId: "campaign one",
        worldVersion: 1,
        contentHash: "world-hash-1",
        acceptedAt: 2400,
      }));
    vi.stubGlobal("fetch", fetchMock);

    await loadCampaignWorldSource("campaign one");
    await saveCampaignWorldDna("campaign one", dna);
    await createCampaignWorldBuild("campaign one", "source-digest-2");
    await loadCampaignWorldState("campaign one");
    await acceptCampaignWorld("campaign one", 1, "world-hash-1");

    const base = "http://localhost:3001/api/campaigns/campaign%20one/world";
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${base}/source`, { method: "GET" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${base}/dna`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dna),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, `${base}/builds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedSourceDigest: "source-digest-2" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, `${base}/state`, { method: "GET" });
    expect(fetchMock).toHaveBeenNthCalledWith(5, `${base}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, expectedContentHash: "world-hash-1" }),
    });
  });

  it("surfaces only the current nested error contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: {
        code: "source_changed",
        message: "The world source changed before the build started.",
      },
    }, 409)));

    await expect(createCampaignWorldBuild("campaign-1", "digest-1")).rejects.toMatchObject({
      name: "CampaignWorldApiError",
      code: "source_changed",
      status: 409,
      message: "The world source changed before the build started.",
    });
  });

  it("parses chunked CRLF events, resumes from the cursor, and deduplicates sequence", async () => {
    const stageEvent: CampaignWorldBuildEvent = {
      sequence: 3,
      buildId: "build-1",
      type: "stage_completed",
      stage: "world_frame",
      createdAt: 1300,
    };
    const terminalEvent: CampaignWorldBuildEvent = {
      sequence: 4,
      buildId: "build-1",
      type: "build_completed",
      worldVersion: 1,
      contentHash: "world-hash-1",
      createdAt: 1400,
    };
    const payload = eventBlock(stageEvent, "\r\n")
      + eventBlock(stageEvent, "\r\n")
      + eventBlock(terminalEvent, "\r\n");
    const splitAt = payload.indexOf("world_frame") + 6;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([
      payload.slice(0, splitAt),
      payload.slice(splitAt, splitAt + 7),
      payload.slice(splitAt + 7),
    ])));
    const received: CampaignWorldBuildEvent[] = [];

    const result = await streamCampaignWorldBuildEvents("campaign one", "build-1", {
      afterSequence: 2,
      onEvent: (event) => received.push(event),
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/campaigns/campaign%20one/world/builds/build-1/events?afterSequence=2",
      { method: "GET", signal: undefined },
    );
    expect(received).toEqual([stageEvent, terminalEvent]);
    expect(result).toEqual({ lastSequence: 4, terminalEvent });
  });

  it("rejects mismatched SSE identity instead of repairing the stream", async () => {
    const event: CampaignWorldBuildEvent = {
      sequence: 1,
      buildId: "build-1",
      type: "build_started",
      createdAt: 1000,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([
      eventBlock(event, "\n", "8"),
    ])));

    await expect(streamCampaignWorldBuildEvents("campaign-1", "build-1", {
      afterSequence: 0,
      onEvent: vi.fn(),
    })).rejects.toMatchObject({
      code: "invalid_campaign_world_response",
    });
  });

  it("rejects a stream that closes before a terminal event", async () => {
    const event: CampaignWorldBuildEvent = {
      sequence: 1,
      buildId: "build-1",
      type: "build_started",
      createdAt: 1000,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([eventBlock(event)])));

    await expect(streamCampaignWorldBuildEvents("campaign-1", "build-1", {
      afterSequence: 0,
      onEvent: vi.fn(),
    })).rejects.toMatchObject({
      code: "campaign_world_event_stream_closed",
      status: 200,
    });
  });

  it("rejects a successful event response without a body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })));

    await expect(streamCampaignWorldBuildEvents("campaign-1", "build-1", {
      afterSequence: 0,
      onEvent: vi.fn(),
    })).rejects.toBeInstanceOf(CampaignWorldApiError);
  });
});
