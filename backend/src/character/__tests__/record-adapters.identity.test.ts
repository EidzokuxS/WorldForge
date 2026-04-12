import { describe, expect, it } from "vitest";
import {
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
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

  it("backfills pre-phase-48 stored player records from shallow summaries and motivations", () => {
    const record = hydrateStoredPlayerRecord(
      {
        id: "player-legacy",
        campaignId: "camp-1",
        name: "Aria Bloodthorn",
        race: "Human",
        gender: "Female",
        age: "18",
        appearance: "Violet eyes and raven hair.",
        hp: 4,
        tags: JSON.stringify(["Poor", "Observant"]),
        equippedItems: JSON.stringify(["Iron Sword"]),
        currentLocationId: "loc-1",
        characterRecord: JSON.stringify({
          identity: {
            id: "player-legacy",
            campaignId: "camp-1",
            role: "player",
            tier: "key",
            displayName: "Aria Bloodthorn",
            canonicalStatus: "original",
          },
          profile: {
            species: "Human",
            gender: "Female",
            ageText: "18",
            appearance: "Violet eyes and raven hair.",
            backgroundSummary: "Raised in the border watch.",
            personaSummary: "Dry humor covering old grief.",
          },
          socialContext: {
            factionId: null,
            factionName: null,
            homeLocationId: null,
            homeLocationName: null,
            currentLocationId: "loc-1",
            currentLocationName: "Signal Station",
            relationshipRefs: [],
            socialStatus: [],
            originMode: "native",
          },
          motivations: {
            shortTermGoals: ["Reach the tower"],
            longTermGoals: ["Decode the buried signal"],
            beliefs: ["The storm is hiding something"],
            drives: ["Duty"],
            frictions: ["Guarded"],
          },
          capabilities: {
            traits: ["Observant"],
            skills: [],
            flaws: [],
            specialties: [],
            wealthTier: "Poor",
          },
          state: {
            hp: 4,
            conditions: [],
            statusFlags: [],
            activityState: "active",
          },
          loadout: {
            inventorySeed: ["Iron Sword"],
            equippedItemRefs: ["Iron Sword"],
            currencyNotes: "",
            signatureItems: [],
          },
          startConditions: {},
          provenance: {
            sourceKind: "generator",
            importMode: null,
            templateId: null,
            archetypePrompt: null,
            worldgenOrigin: null,
            legacyTags: ["legacy"],
          },
        }),
      },
      { currentLocationName: "Signal Station" },
    ) as Record<string, any>;

    expect(record.identity.baseFacts.biography).toBe("Raised in the border watch.");
    expect(record.identity.behavioralCore.motives).toEqual(["Duty"]);
    expect(record.identity.behavioralCore.pressureResponses).toEqual(["Guarded"]);
    expect(record.identity.liveDynamics.activeGoals).toEqual([
      "Reach the tower",
      "Decode the buried signal",
    ]);
    expect(record.identity.liveDynamics.beliefDrift).toEqual([
      "The storm is hiding something",
    ]);
  });

  it("preserves continuity metadata through projection and re-hydration", () => {
    const projected = {
      identity: {
        id: "npc-legacy",
        campaignId: "camp-1",
        role: "npc",
        tier: "key",
        displayName: "Captain Mire",
        canonicalStatus: "known_ip_canonical",
        baseFacts: {
          biography: "A veteran signal-station commander.",
          socialRole: ["npc", "warden"],
          hardConstraints: ["Will not abandon the station"],
        },
        behavioralCore: {
          motives: ["Protect the valley"],
          pressureResponses: ["Turns colder under pressure"],
          taboos: [],
          attachments: ["The station crew"],
          selfImage: "Guardian of the northern line",
        },
        liveDynamics: {
          activeGoals: ["Hold the barricade"],
          beliefDrift: ["The valley can still be saved"],
          currentStrains: ["Running out of supplies"],
          earnedChanges: [],
        },
      },
      profile: {
        species: "Human",
        gender: "Female",
        ageText: "42",
        appearance: "",
        backgroundSummary: "",
        personaSummary: "",
      },
      socialContext: {
        factionId: "faction-wardens",
        factionName: "Wardens",
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: "loc-barricade",
        currentLocationName: "North Barricade",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "resident",
      },
      motivations: {
        shortTermGoals: [],
        longTermGoals: [],
        beliefs: [],
        drives: [],
        frictions: [],
      },
      capabilities: {
        traits: [],
        skills: [],
        flaws: [],
        specialties: [],
        wealthTier: null,
      },
      state: {
        hp: 5,
        conditions: [],
        statusFlags: [],
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
        sourceKind: "import",
        importMode: "outsider",
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: "known-ip",
        legacyTags: ["legacy"],
      },
      continuity: {
        identityInertia: "anchored",
        protectedCore: ["Will not abandon the station"],
        mutableSurface: ["Trust in the player"],
        changePressureNotes: ["Major defeats can force realignment."],
      },
    };

    const record = hydrateStoredNpcRecord(
      {
        id: "npc-legacy",
        campaignId: "camp-1",
        name: "Captain Mire",
        persona: "",
        tags: "[]",
        tier: "key",
        currentLocationId: "loc-barricade",
        goals: JSON.stringify({ short_term: [], long_term: [] }),
        beliefs: "[]",
        unprocessedImportance: 1,
        inactiveTicks: 0,
        createdAt: Date.now(),
        characterRecord: JSON.stringify(projected),
      },
      { currentLocationName: "North Barricade", factionName: "Wardens" },
    ) as Record<string, any>;

    expect(record.continuity).toMatchObject({
      identityInertia: "anchored",
      protectedCore: ["Will not abandon the station"],
      mutableSurface: ["Trust in the player"],
    });
  });
});
