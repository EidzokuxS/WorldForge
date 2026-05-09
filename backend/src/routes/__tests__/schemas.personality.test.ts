import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { characterDraftSchema } from "../schemas.js";

function minimalDraft() {
  return {
    identity: {
      role: "npc" as const,
      tier: "key" as const,
      displayName: "Archivist Vale",
      canonicalStatus: "original" as const,
    },
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
      currentLocationId: null,
      currentLocationName: null,
      relationshipRefs: [],
      socialStatus: [],
      originMode: null,
    },
    motivations: {
      shortTermGoals: [],
      longTermGoals: [],
      beliefs: [],
      drives: [],
      frictions: [],
    },
    capabilities: {
      skills: [],
      specialties: [],
      wealthTier: null,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "idle",
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: [],
    },
    startConditions: {},
    provenance: {
      sourceKind: "generator" as const,
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
    },
  };
}

describe("characterIdentityDraftSchema personality migration", () => {
  it("accepts a valid personality block", () => {
    const parsed = characterDraftSchema.parse({
      ...minimalDraft(),
      identity: {
        ...minimalDraft().identity,
        personality: {
          summary: "A sharp-eyed archivist who treats gossip like evidence.",
          voice: "Measured, dry, and precise, with metaphors borrowed from ledgers and weather reports.",
          decisionStyle: "Analytical, but quick to improvise when the facts start moving underfoot.",
          worldview: "Pragmatic enough to bargain with danger, idealistic enough to hate doing it.",
          internalContradictions: [
            "Believes truth should be shared but hoards secrets to control the timing.",
          ],
          personalMythology: "I am the last honest witness in a city built on edited memories.",
          sampleLines: [
            "I do not collect rumors, I collect patterns wearing cheaper clothes.",
            "If the record disagrees with the witness, interrogate the record first.",
          ],
        },
      },
    });

    expect(parsed.identity.personality).toEqual({
      summary: "A sharp-eyed archivist who treats gossip like evidence.",
      voice: "Measured, dry, and precise, with metaphors borrowed from ledgers and weather reports.",
      decisionStyle: "Analytical, but quick to improvise when the facts start moving underfoot.",
      worldview: "Pragmatic enough to bargain with danger, idealistic enough to hate doing it.",
      internalContradictions: [
        "Believes truth should be shared but hoards secrets to control the timing.",
      ],
      personalMythology: "I am the last honest witness in a city built on edited memories.",
      sampleLines: [
        "I do not collect rumors, I collect patterns wearing cheaper clothes.",
        "If the record disagrees with the witness, interrogate the record first.",
      ],
    });
  });

  it("accepts drafts without personality", () => {
    const parsed = characterDraftSchema.parse(minimalDraft());
    expect(parsed.identity.personality).toBeUndefined();
  });

  it("accepts legacy behavioralCore reads during the migration window", () => {
    const parsed = characterDraftSchema.parse({
      ...minimalDraft(),
      identity: {
        ...minimalDraft().identity,
        behavioralCore: {
          motives: ["Protect the archive"],
          pressureResponses: ["Becomes severe and over-explains"],
          taboos: ["Destroying primary sources"],
          selfImage: "Custodian of facts",
          attachments: [],
        },
      },
    });

    expect(parsed.identity.behavioralCore).toMatchObject({
      motives: ["Protect the archive"],
      pressureResponses: ["Becomes severe and over-explains"],
      taboos: ["Destroying primary sources"],
      selfImage: "Custodian of facts",
      attachments: [],
    });
  });

  it("keeps the behavioralCore wrapper defaulted when omitted", () => {
    const parsed = characterDraftSchema.parse(minimalDraft());

    expect(parsed.identity.behavioralCore).toBeDefined();
    expect(parsed.identity.behavioralCore).toEqual({
      motives: [],
      pressureResponses: [],
      taboos: [],
      attachments: [],
      selfImage: "",
    });
  });

  it("accepts behavioralCore objects with motives omitted", () => {
    const parsed = characterDraftSchema.parse({
      ...minimalDraft(),
      identity: {
        ...minimalDraft().identity,
        behavioralCore: {
          pressureResponses: ["Withdraws and starts counting exits"],
          taboos: ["Burning books"],
          selfImage: "Prepared for the worst",
          attachments: ["North archive"],
        },
      },
    });

    expect(parsed.identity.behavioralCore.motives).toBeUndefined();
    expect(parsed.identity.behavioralCore.pressureResponses).toEqual([
      "Withdraws and starts counting exits",
    ]);
  });

  it("accepts capabilities without traits or flaws and leaves them undefined", () => {
    const parsed = characterDraftSchema.parse({
      ...minimalDraft(),
      capabilities: {
        skills: [{ name: "Cataloging", tier: "Master" }],
        specialties: ["Counterforgery"],
        wealthTier: "Comfortable",
      },
    });

    expect(parsed.capabilities.traits).toBeUndefined();
    expect(parsed.capabilities.flaws).toBeUndefined();
  });

  it("accepts provenance without legacyTags and leaves them undefined", () => {
    const parsed = characterDraftSchema.parse({
      ...minimalDraft(),
      provenance: {
        sourceKind: "generator",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: null,
      },
    });

    expect(parsed.provenance.legacyTags).toBeUndefined();
  });

  it("rejects sampleLines longer than three entries", () => {
    expect(() =>
      characterDraftSchema.parse({
        ...minimalDraft(),
        identity: {
          ...minimalDraft().identity,
          personality: {
            summary: "Summary",
            voice: "Voice",
            decisionStyle: "Decision",
            worldview: "Worldview",
            internalContradictions: [],
            personalMythology: "Myth",
            sampleLines: ["1", "2", "3", "4"],
          },
        },
      }),
    ).toThrow(ZodError);
  });

  it("rejects summary values over four hundred characters", () => {
    expect(() =>
      characterDraftSchema.parse({
        ...minimalDraft(),
        identity: {
          ...minimalDraft().identity,
          personality: {
            summary: "x".repeat(401),
            voice: "Voice",
            decisionStyle: "Decision",
            worldview: "Worldview",
            internalContradictions: [],
            personalMythology: "Myth",
            sampleLines: [],
          },
        },
      }),
    ).toThrow(ZodError);
  });

  it("rejects more than five internal contradictions", () => {
    expect(() =>
      characterDraftSchema.parse({
        ...minimalDraft(),
        identity: {
          ...minimalDraft().identity,
          personality: {
            summary: "Summary",
            voice: "Voice",
            decisionStyle: "Decision",
            worldview: "Worldview",
            internalContradictions: ["1", "2", "3", "4", "5", "6"],
            personalMythology: "Myth",
            sampleLines: [],
          },
        },
      }),
    ).toThrow(ZodError);
  });
});
