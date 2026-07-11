import { describe, expect, it } from "vitest";

import { presentCampaignWorldResearchSummary } from "./campaign-world-research";

describe("Campaign World research presentation", () => {
  it("presents the normalized research payload without serialized JSON", () => {
    expect(presentCampaignWorldResearchSummary(JSON.stringify({
      interpretationSummary: "The source establishes industrial cold and civic pressure.",
      tonalNotes: ["Industrial cold", "Civic pressure"],
      ambiguityNotes: ["The source defines mood rather than locations."],
    }))).toEqual({
      interpretation: "The source establishes industrial cold and civic pressure.",
      tonalNotes: ["Industrial cold", "Civic pressure"],
      ambiguityNotes: ["The source defines mood rather than locations."],
    });
  });

  it("presents a prose summary as prose", () => {
    expect(presentCampaignWorldResearchSummary("A coast shaped by rail guilds.")).toEqual({
      interpretation: "A coast shaped by rail guilds.",
      tonalNotes: [],
      ambiguityNotes: [],
    });
  });

  it("presents selected-worldbook research context without serialized JSON", () => {
    expect(presentCampaignWorldResearchSummary(JSON.stringify({
      franchise: "Harbor Notes",
      keyFacts: [
        "Safe harbors control seasonal trade.",
        "The council taxes every marked ship.",
      ],
      tonalNotes: ["Cold maritime civic life"],
    }))).toEqual({
      interpretation: "Harbor Notes: Safe harbors control seasonal trade. The council taxes every marked ship.",
      tonalNotes: ["Cold maritime civic life"],
      ambiguityNotes: [],
    });
  });
});
