import { describe, expect, it } from "vitest";
import type { CampaignWorldSource } from "@worldforge/shared";
import type { WorldCastPacket, WorldFramePacket } from "./contracts.js";
import {
  buildWorldCastPrompt,
  buildWorldConnectionsPrompt,
  buildWorldFramePrompt,
} from "./world-prompts.js";

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
    { locationRef: "location:signal-region", name: "Signal Region", description: "A rail region.", kind: "macro", parentLocationRef: null, tags: ["rail"], isStarting: true },
    { locationRef: "location:signal-yard", name: "Signal Yard", description: "A dry junction.", kind: "persistent_sublocation", parentLocationRef: "location:signal-region", tags: ["rail"], isStarting: false },
  ],
  routes: [{ fromLocationRef: "location:signal-yard", toLocationRef: "location:signal-yard", travelCost: 1 }],
};

const cast: WorldCastPacket = {
  actors: [],
  goals: [],
  placements: [],
};

describe("Campaign World prompts", () => {
  it("defines macro regions as grouping only and routes as concrete-scene travel", () => {
    const prompt = buildWorldFramePrompt(source);

    expect(prompt).toContain("A macro region groups and selects scenes. It is not a place anyone can occupy or visit.");
    expect(prompt).toContain("Every persistent sublocation is a concrete establishment or site.");
    expect(prompt).toContain("Every route connects persistent sublocations directly, never macro regions.");
    expect(prompt).toContain("The directed graph of persistent sublocations must be strongly connected");
  });

  it("allows cast placements only at exact concrete scenes", () => {
    const prompt = buildWorldCastPrompt(source, frame);

    expect(prompt).toContain("[\"location:signal-yard\"]");
    expect(prompt).not.toContain("[\"location:signal-region\",\"location:signal-yard\"]");
    expect(prompt).toContain("Present and home placements must name exact persistent sublocations, never macro regions.");
    expect(prompt).toContain("Set every goal priority to an integer from 1 (lowest) through 5 (highest).");
  });

  it("requires pressures to anchor exact concrete scenes", () => {
    const prompt = buildWorldConnectionsPrompt(source, frame, cast);

    expect(prompt).toContain("Every pressure must name at least one person anchor and one exact persistent-sublocation anchor.");
    expect(prompt).toContain("A macro region cannot anchor a pressure.");
    expect(prompt).toContain("[\"location:signal-yard\"]");
  });
});
