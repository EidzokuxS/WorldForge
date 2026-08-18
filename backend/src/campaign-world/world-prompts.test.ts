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
    expect(prompt).toContain("Every locationRef value must be a full identifier in the exact form location:<lowercase-kebab-case>");
    expect(prompt).toContain("Every non-null parentLocationRef, fromLocationRef, and toLocationRef must repeat one of those full location:<lowercase-kebab-case> identifiers exactly.");
    expect(prompt).toContain("Every persistent sublocation is one concrete, directly perceivable scene");
    expect(prompt).toContain("Its description is shown verbatim to the player whenever that scene is current.");
    expect(prompt).toContain("The campaign source may explicitly state a secret, concealed discovery, private motive, disputed hidden cause, future event, or another actor's private knowledge.");
    expect(prompt).toContain("Do not copy, paraphrase, confirm, or imply that protected truth in any location description.");
    expect(prompt).toContain("Describe only its publicly perceivable surface; later cast goals, relations, and pressures own the protected claim.");
    expect(prompt).toContain("Every route connects persistent sublocations directly, never macro regions.");
    expect(prompt).toContain("The directed graph of persistent sublocations must be strongly connected");
  });

  it("uses structural indexed rows only in the tool-mode frame contract", () => {
    const prompt = buildWorldFramePrompt(source, true);

    expect(prompt).toContain(
      "Return locationKey as lowercase kebab-case without the location: prefix.",
    );
    expect(prompt).toContain(
      "Return exactly three macroLocations, then six or seven persistentLocations.",
    );
    expect(prompt).toContain(
      "startingMacroIndex selects one macroLocations row.",
    );
    expect(prompt).toContain(
      "Each persistentLocations row uses parentMacroIndex to index macroLocations.",
    );
    expect(prompt).toContain(
      "Each route uses required fromPersistentIndex and toPersistentIndex values that index persistentLocations; the two indices must differ.",
    );
    expect(prompt).toContain(
      "Do not return kind, isStarting, parentLocationRef, fromLocationRef, or toLocationRef in tool mode.",
    );
    expect(prompt).toContain("Return every required key once and no extra keys.");
    expect(prompt).not.toContain("Every locationRef value must be a full identifier");
  });

  it("allows cast placements only at exact concrete scenes", () => {
    const prompt = buildWorldCastPrompt(source, frame);

    expect(prompt).toContain("[\"location:signal-yard\"]");
    expect(prompt).not.toContain("[\"location:signal-region\",\"location:signal-yard\"]");
    expect(prompt).toContain("Present and home placements must name exact persistent sublocations, never macro regions.");
    expect(prompt).toContain("A present placement means the person is directly perceivable and identifiable by name whenever the player shares that exact scene.");
    expect(prompt).toContain("place them in a different persistent sublocation instead of the same scene");
    expect(prompt).toContain("At least one support person must have a present placement whose locationRef is copied from STARTING_MACRO_SCENE_REFS.");
    expect(prompt).toContain("the support person must be present in a persistent sublocation under the sole starting macro");
    expect(prompt).toContain("Set every goal priority to an integer from 1 (lowest) through 5 (highest).");
  });

  it("requires pressures to anchor exact concrete scenes", () => {
    const prompt = buildWorldConnectionsPrompt(source, frame, cast);

    expect(prompt).toContain("Every pressure must name at least one person anchor and one exact persistent-sublocation anchor.");
    expect(prompt).toContain("A macro region cannot anchor a pressure.");
    expect(prompt).toContain("At least one pressure must copy one value from ELIGIBLE_STARTING_SUPPORT_SCENE_REFS into pressures[].locationRefs[].");
    expect(prompt).toContain("the pressure must anchor the same persistent scene where a support person from the cast is present under the sole starting macro");
    expect(prompt).toContain("[\"location:signal-yard\"]");
  });
});
