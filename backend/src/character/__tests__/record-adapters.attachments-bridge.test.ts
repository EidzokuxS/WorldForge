import { describe, expect, it } from "vitest";
import { hydrateStoredNpcRecord } from "../record-adapters.js";

type StoredNpcRecordIdentity = {
  id: string;
  campaignId: string;
  role: "npc";
  tier: "key";
  displayName: string;
  canonicalStatus: "original";
  behavioralCore?: {
    attachments?: string[];
    selfImage?: string;
  };
  liveDynamics?: {
    attachments?: string[];
    activeGoals?: string[];
    beliefDrift?: string[];
    currentStrains?: string[];
    earnedChanges?: string[];
  };
};

function makeStoredNpcRecord(
  identity: StoredNpcRecordIdentity,
): Record<string, unknown> {
  return {
    identity,
    profile: {
      species: "",
      gender: "",
      ageText: "",
      appearance: "",
      backgroundSummary: "",
      personaSummary: "",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: "loc-1",
      currentLocationName: "Dockside",
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
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
  };
}

function hydrateNpcWithIdentity(identity: StoredNpcRecordIdentity) {
  return hydrateStoredNpcRecord(
    {
      id: identity.id,
      campaignId: identity.campaignId,
      name: identity.displayName,
      persona: "",
      tags: "[]",
      tier: "key",
      currentLocationId: "loc-1",
      goals: JSON.stringify({ short_term: [], long_term: [] }),
      beliefs: "[]",
      unprocessedImportance: 0,
      inactiveTicks: 0,
      createdAt: Date.now(),
      characterRecord: JSON.stringify(makeStoredNpcRecord(identity)),
    },
    { currentLocationName: "Dockside" },
  );
}

describe("record-adapters attachments bridge", () => {
  it("bridges legacy behavioralCore attachments into liveDynamics attachments", () => {
    const record = hydrateNpcWithIdentity({
      id: "npc-legacy-attachments",
      campaignId: "camp-1",
      role: "npc",
      tier: "key",
      displayName: "Legacy Harbor Watch",
      canonicalStatus: "original",
      behavioralCore: {
        attachments: ["X", "Y"],
        selfImage: "",
      },
    });

    expect(record.identity.liveDynamics?.attachments).toEqual(["X", "Y"]);
  });

  it("prefers liveDynamics attachments when both shapes are present", () => {
    const record = hydrateNpcWithIdentity({
      id: "npc-both-attachments",
      campaignId: "camp-1",
      role: "npc",
      tier: "key",
      displayName: "Bridge Priority",
      canonicalStatus: "original",
      behavioralCore: {
        attachments: ["A"],
        selfImage: "",
      },
      liveDynamics: {
        attachments: ["B"],
      },
    });

    expect(record.identity.liveDynamics?.attachments).toEqual(["B"]);
  });

  it("defaults to an empty attachments array when neither shape provides one", () => {
    const record = hydrateNpcWithIdentity({
      id: "npc-empty-attachments",
      campaignId: "camp-1",
      role: "npc",
      tier: "key",
      displayName: "No Attachments",
      canonicalStatus: "original",
    });

    expect(record.identity.liveDynamics?.attachments).toEqual([]);
  });

  it("preserves new-shape liveDynamics attachments unchanged", () => {
    const record = hydrateNpcWithIdentity({
      id: "npc-new-attachments",
      campaignId: "camp-1",
      role: "npc",
      tier: "key",
      displayName: "New Shape",
      canonicalStatus: "original",
      liveDynamics: {
        attachments: ["fresh-link"],
      },
    });

    expect(record.identity.liveDynamics?.attachments).toEqual(["fresh-link"]);
  });
});
