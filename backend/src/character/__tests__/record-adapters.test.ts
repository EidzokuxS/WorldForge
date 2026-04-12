import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "@worldforge/shared";
import {
  deriveRuntimeCharacterTags,
} from "../runtime-tags.js";
import {
  projectPlayerRecord,
  fromLegacyNpcRow,
  fromLegacyPlayerRow,
  toLegacyNpcDraft,
  toLegacyPlayerCharacter,
} from "../record-adapters.js";
import { buildAuthoritativeInventoryView } from "../../inventory/authority.js";

describe("record adapters", () => {
  it("hydrates legacy player and npc rows into one shared CharacterRecord shape", () => {
    const player = fromLegacyPlayerRow(
      {
        id: "player-1",
        campaignId: "camp-1",
        name: "Aria Bloodthorn",
        race: "Human",
        gender: "Female",
        age: "18",
        appearance: "Violet eyes and raven hair.",
        hp: 4,
        tags: JSON.stringify(["Poor", "Novice Swordsman", "Observant", "Wounded"]),
        equippedItems: JSON.stringify(["Iron Sword", "Traveler's Cloak"]),
        currentLocationId: "loc-1",
      },
      { currentLocationName: "Signal Station" },
    );

    const npc = fromLegacyNpcRow(
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
    );

    for (const record of [player, npc]) {
      expectSharedRecordShape(record);
    }

    expect(player.identity.role).toBe("player");
    expect(player.identity.tier).toBe("key");
    expect(player.profile.species).toBe("Human");
    expect(player.capabilities.wealthTier).toBe("Poor");
    expect(player.capabilities.skills).toEqual([
      { name: "Swordsman", tier: "Novice" },
    ]);
    expect(player.state.conditions).toEqual(["Wounded"]);
    expect(player.loadout.equippedItemRefs).toEqual(["Iron Sword", "Traveler's Cloak"]);

    expect(npc.identity.role).toBe("npc");
    expect(npc.identity.tier).toBe("key");
    expect(npc.profile.personaSummary).toContain("hard-edged commander");
    expect(npc.socialContext.factionName).toBe("Wardens");
    expect(npc.motivations.shortTermGoals).toEqual(["Hold the barricade"]);
    expect(npc.motivations.longTermGoals).toEqual(["Restore order in the valley"]);
    expect(npc.motivations.beliefs).toEqual(["The station can still be saved"]);
  });

  it("derives runtime tags from canonical buckets instead of a free-form passthrough array", () => {
    const record: CharacterRecord = {
      identity: {
        id: "npc-2",
        campaignId: "camp-1",
        role: "npc",
        tier: "persistent",
        displayName: "Sera Vale",
        canonicalStatus: "original",
      },
      profile: {
        species: "Human",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "",
        personaSummary: "Calculating fixer",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: null,
        currentLocationName: "Dock Ward",
        relationshipRefs: [],
        socialStatus: ["Wanted"],
        originMode: "outsider",
      },
      motivations: {
        shortTermGoals: [],
        longTermGoals: [],
        beliefs: [],
        drives: ["Ambitious"],
        frictions: ["Guarded"],
      },
      capabilities: {
        traits: ["Connected"],
        skills: [{ name: "Negotiator", tier: "Master" }],
        flaws: ["Cold-blooded"],
        specialties: [],
        wealthTier: "Comfortable",
      },
      state: {
        hp: 5,
        conditions: ["Wounded"],
        statusFlags: ["Hidden"],
        activityState: "active",
      },
      loadout: {
        inventorySeed: [],
        equippedItemRefs: [],
        currencyNotes: "",
        signatureItems: [],
      },
      startConditions: {},
      provenance: {
        sourceKind: "worldgen",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: "scaffold",
        legacyTags: ["Plot Armor", "Meta Flag"],
      },
    };

    expect(deriveRuntimeCharacterTags(record)).toEqual([
      "Connected",
      "Master Negotiator",
      "Cold-blooded",
      "Comfortable",
      "Wounded",
      "Hidden",
      "Wanted",
      "Ambitious",
      "Guarded",
    ]);
  });

  it("emits legacy compatibility views without discarding the canonical record", () => {
    const record = fromLegacyNpcRow(
      {
        id: "npc-3",
        campaignId: "camp-1",
        name: "Marshal Thorne",
        persona: "A decorated officer who treats every conversation like a negotiation.",
        tags: JSON.stringify(["Comfortable", "Skilled Tactician", "Disciplined"]),
        tier: "persistent",
        currentLocationId: "loc-9",
        goals: JSON.stringify({
          short_term: ["Secure the depot"],
          long_term: ["Rebuild the militia"],
        }),
        beliefs: JSON.stringify(["Order must come before mercy"]),
        unprocessedImportance: 2,
        inactiveTicks: 1,
        createdAt: Date.now(),
      },
      { currentLocationName: "Depot", factionName: "Militia" },
    );

    const legacyNpc = toLegacyNpcDraft(record);
    const legacyPlayer = toLegacyPlayerCharacter({
      ...record,
      identity: {
        ...record.identity,
        role: "player",
      },
      loadout: {
        ...record.loadout,
        equippedItemRefs: ["Officer Saber"],
      },
    });

    expect(legacyNpc.persona).toContain("decorated officer");
    expect(legacyNpc.goals).toEqual({
      shortTerm: ["Secure the depot"],
      longTerm: ["Rebuild the militia"],
    });
    expect(legacyNpc.tags).toContain("Skilled Tactician");

    expect(legacyPlayer.name).toBe("Marshal Thorne");
    expect(legacyPlayer.equippedItems).toEqual(["Officer Saber"]);
    expect(legacyPlayer.tags).toContain("Comfortable");

    expect(record.capabilities.skills).toEqual([
      { name: "Tactician", tier: "Skilled" },
    ]);
    expect(record.motivations.longTermGoals).toEqual(["Rebuild the militia"]);
  });

  it("derives legacy equippedItems compatibility output from authoritative inventory instead of record.loadout", () => {
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
        tags: JSON.stringify(["Poor", "Observant"]),
        equippedItems: JSON.stringify(["Legacy Bow"]),
        currentLocationId: "loc-1",
      },
      { currentLocationName: "Signal Station" },
    );

    const authoritativeInventory = buildAuthoritativeInventoryView([
      {
        id: "item-1",
        campaignId: "camp-1",
        name: "Iron Sword",
        tags: "[]",
        ownerId: "player-1",
        locationId: null,
        equipState: "equipped",
        equippedSlot: "main-hand",
        isSignature: false,
      },
      {
        id: "item-2",
        campaignId: "camp-1",
        name: "Family Compass",
        tags: "[]",
        ownerId: "player-1",
        locationId: null,
        equipState: "carried",
        equippedSlot: null,
        isSignature: true,
      },
    ]);

    const legacyPlayer = (toLegacyPlayerCharacter as unknown as (
      record: CharacterRecord,
      inventory: ReturnType<typeof buildAuthoritativeInventoryView>,
    ) => ReturnType<typeof toLegacyPlayerCharacter>)(record, authoritativeInventory);
    const projection = (projectPlayerRecord as unknown as (
      record: CharacterRecord,
      inventory: ReturnType<typeof buildAuthoritativeInventoryView>,
    ) => ReturnType<typeof projectPlayerRecord>)(record, authoritativeInventory);

    expect(legacyPlayer.equippedItems).toEqual(["Iron Sword"]);
    expect(JSON.parse(projection.equippedItems)).toEqual(["Iron Sword"]);
    expect(legacyPlayer.equippedItems).not.toEqual(["Legacy Bow"]);
  });
});

function expectSharedRecordShape(record: CharacterRecord) {
  expect(record).toHaveProperty("identity");
  expect(record).toHaveProperty("profile");
  expect(record).toHaveProperty("socialContext");
  expect(record).toHaveProperty("motivations");
  expect(record).toHaveProperty("capabilities");
  expect(record).toHaveProperty("state");
  expect(record).toHaveProperty("loadout");
  expect(record).toHaveProperty("startConditions");
  expect(record).toHaveProperty("provenance");
}
