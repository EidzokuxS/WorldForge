import { describe, expect, it } from "vitest";
import type { CampaignWorldSource } from "@worldforge/shared";
import type { WorldFramePacket } from "./contracts.js";
import { buildWorldCastPrompt } from "./world-prompts.js";

const source: CampaignWorldSource = {
  campaignId: "campaign-a",
  premise: "A drowned rail kingdom listens for impossible bells.",
  dna: null,
  researchSummary: null,
  sourceReferences: [],
  sourceDigest: "source-digest",
};

const frame: WorldFramePacket = {
  worldSummary: "The last dry route crosses a drowned kingdom.",
  locations: [
    {
      locationRef: "location:signal-yard",
      name: "Signal Yard",
      description: "A dry junction above the floodline.",
      kind: "macro",
      parentLocationRef: null,
      tags: ["rail"],
      isStarting: true,
    },
  ],
  routes: [
    {
      fromLocationRef: "location:signal-yard",
      toLocationRef: "location:signal-yard",
      travelCost: 1,
    },
  ],
};

describe("campaign world cast prompt", () => {
  it("states the goal priority bounds required by the cast contract", () => {
    const prompt = buildWorldCastPrompt(source, frame);

    expect(prompt).toContain(
      "Set every goal priority to an integer from 1 (lowest) through 5 (highest).",
    );
  });
});
