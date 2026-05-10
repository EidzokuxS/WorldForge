import { describe, expect, it } from "vitest";

import { runFrameRetrievalJobs } from "../frame-retrieval-runner.js";

describe("frame retrieval runner", () => {
  it("runs read-only frame retrieval jobs in one parallel group with trace metadata", async () => {
    let clock = 10;
    const result = await runFrameRetrievalJobs<unknown>(
      [
        {
          id: "scene",
          frameType: "SceneFrame",
          criticality: "L0",
          scopeRefs: ["location:depot", "location:depot"],
          run: ({ frameType, scopeRefs }) => ({
            frameType,
            refs: scopeRefs,
          }),
        },
        {
          id: "actor",
          frameType: "ActorFrame",
          viewerId: "npc-1",
          criticality: "L1",
          scopeRefs: ["actor:npc-1"],
          run: ({ viewerId }) => ({
            viewerId,
          }),
        },
        {
          id: "narrator",
          frameType: "NarratorPacket",
          criticality: "L0",
          scopeRefs: ["packet:settled"],
          run: () => ({
            packetFacts: 2,
          }),
        },
      ],
      {
        now: () => {
          clock += 5;
          return clock;
        },
      },
    );

    expect(result.trace).toEqual([
      expect.objectContaining({
        groupIndex: 0,
        jobCount: 3,
        writeScopes: [],
        serializedFallbackCount: 0,
      }),
    ]);
    expect(result.results).toHaveLength(3);
    expect(result.results.map((entry) => entry.status)).toEqual([
      "completed",
      "completed",
      "completed",
    ]);
    expect(result.results[0]).toMatchObject({
      jobId: "scene",
      frameType: "SceneFrame",
      criticality: "L0",
      scopeRefs: ["location:depot"],
      readOnly: true,
      writeScopes: [],
      value: {
        frameType: "SceneFrame",
        refs: ["location:depot"],
      },
    });
    expect(result.results[1]).toMatchObject({
      jobId: "actor",
      frameType: "ActorFrame",
      viewerId: "npc-1",
      criticality: "L1",
      readOnly: true,
      writeScopes: [],
      value: {
        viewerId: "npc-1",
      },
    });
  });

  it("keeps failed retrieval jobs failed instead of manufacturing no-op frames", async () => {
    const result = await runFrameRetrievalJobs<unknown>([
      {
        id: "oracle",
        frameType: "OracleFrame",
        criticality: "L0",
        run: () => {
          throw new Error("oracle evidence unavailable");
        },
      },
      {
        id: "reviewer",
        frameType: "ReviewerPacket",
        criticality: "L2",
        run: () => ({
          evidenceRefs: ["event:1"],
        }),
      },
    ]);

    expect(result.trace).toEqual([
      expect.objectContaining({
        jobCount: 2,
        writeScopes: [],
        serializedFallbackCount: 0,
      }),
    ]);
    expect(result.results.find((entry) => entry.jobId === "oracle")).toMatchObject({
      status: "failed",
      frameType: "OracleFrame",
      readOnly: true,
      error: "oracle evidence unavailable",
    });
    expect(result.results.find((entry) => entry.jobId === "reviewer")).toMatchObject({
      status: "completed",
      frameType: "ReviewerPacket",
      readOnly: true,
      value: { evidenceRefs: ["event:1"] },
    });
  });
});
