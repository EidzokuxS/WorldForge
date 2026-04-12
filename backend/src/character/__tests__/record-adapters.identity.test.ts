import { describe, expect, it } from "vitest";
import {
  fromLegacyNpcRow,
  fromLegacyPlayerRow,
} from "../record-adapters.js";

describe("record adapters richer identity hydration", () => {
  it("backfills the three-layer identity baseline for legacy player rows", () => {
    const record = fromLegacyPlayerRow(
      {
        id: "player-1",
        campaignId: "camp-1",
        name: "Aria Bloodthorn",
        race: "Human",
        gender: "Female",
        age: "18",
        appearance: "Violet eyes and raven hair.",
        hp: 4,
        tags: JSON.stringify(["Poor", "Observant", "Guarded"]),
        equippedItems: JSON.stringify(["Iron Sword", "Traveler's Cloak"]),
        currentLocationId: "loc-1",
      },
      { currentLocationName: "Signal Station" },
    ) as Record<string, any>;

    expect(record.identity.baseFacts).toMatchObject({
      biography: "",
      socialRole: ["player"],
      hardConstraints: [],
    });
    expect(record.identity.behavioralCore).toMatchObject({
      motives: [],
      pressureResponses: [],
      taboos: [],
      attachments: [],
      selfImage: "",
    });
    expect(record.identity.liveDynamics).toMatchObject({
      activeGoals: [],
      beliefDrift: [],
      currentStrains: [],
      earnedChanges: [],
    });
    expect(record.sourceBundle).toBeUndefined();
    expect(record.continuity).toBeUndefined();
  });

  it("backfills npc persona, beliefs, and goals into the richer identity layers", () => {
    const record = fromLegacyNpcRow(
      {
        id: "npc-1",
        campaignId: "camp-1",
        name: "Captain Mire",
        persona: "A hard-edged commander who masks fear with discipline.",
        tags: JSON.stringify(["Wealthy", "Master Negotiator", "Connected"]),
        tier: "key",
        currentLocationId: "loc-2",
        goals: JSON.stringify({
          short_term: ["Hold the barricade"],
          long_term: ["Restore order in the valley"],
        }),
        beliefs: JSON.stringify(["The station can still be saved"]),
        unprocessedImportance: 3,
        inactiveTicks: 0,
        createdAt: Date.now(),
      },
      { currentLocationName: "North Barricade", factionName: "Wardens" },
    ) as Record<string, any>;

    expect(record.identity.baseFacts).toMatchObject({
      socialRole: ["npc", "Wardens"],
    });
    expect(record.identity.behavioralCore).toMatchObject({
      selfImage: "A hard-edged commander who masks fear with discipline.",
    });
    expect(record.identity.liveDynamics).toMatchObject({
      activeGoals: ["Hold the barricade", "Restore order in the valley"],
      beliefDrift: ["The station can still be saved"],
    });
  });
});
