import { describe, expect, it } from "vitest";

import { buildPremiseRefinementPromptContract } from "../prompt-contracts.js";

describe("pipeline-rework: premise refinement contract helper", () => {
  it("documents structured premise-refinement output before pipeline data", () => {
    const contract = buildPremiseRefinementPromptContract();

    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: premise-refinement.v1");
    expect(contract).toContain("Required fields");
    expect(contract).toContain("refinedPremise");
    expect(contract).toContain("Caps:");
    expect(contract).toContain("nullable");
    expect(contract).toContain("Valid example:");
    expect(contract).toContain("Minimal valid output:");
    expect(contract).toContain("Invalid example:");
    expect(contract).toContain("backend must not invent canonical truth");
  });
});

describe("pipeline-rework: per-entity detail (D-01)", () => {
  it.todo("locations-step makes N individual detail calls for N planned locations");
  it.todo("factions-step makes N individual detail calls for N planned factions");
  it.todo("npcs-step makes N individual detail calls for N planned NPCs");
  it.todo("plan calls remain batched (1 call returns all names)");
});

describe("pipeline-rework: sequential accumulator (D-02)", () => {
  it.todo("each location detail call prompt contains all previously detailed locations");
  it.todo("each faction detail call prompt contains all previously detailed factions");
  it.todo("each NPC detail call prompt contains all previously detailed NPCs including cross-tier");
  it.todo("detail calls run sequentially, not in parallel");
});
