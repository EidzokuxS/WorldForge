import { describe, expect, it } from "vitest";
import type { CharacterDraft, PersonaTemplate } from "@worldforge/shared";
import {
  applyPersonaTemplate,
  applyPersonaTemplatePatch,
  createPersonaTemplateSummary,
} from "../persona-templates.js";

function makeDraft(
  role: CharacterDraft["identity"]["role"] = "player",
): CharacterDraft {
  return {
    identity: {
      role,
      tier: role === "player" ? "key" : "persistent",
      displayName: role === "player" ? "Aria Vale" : "Watchman Orren",
      canonicalStatus: "original",
      baseFacts: {
        biography: "Baseline background",
        socialRole: [role],
        hardConstraints: ["Never betray the watch"],
      },
      behavioralCore: {
        motives: ["Curiosity"],
        pressureResponses: ["Withdraws before trusting"],
        taboos: [],
        attachments: ["Moonwell"],
        selfImage: "Baseline persona",
      },
      liveDynamics: {
        attachments: [],
        activeGoals: ["Keep moving", "Stay alive"],
        beliefDrift: [],
        currentStrains: [],
        earnedChanges: [],
      },
      personality: {
        summary: "Baseline interiority.",
        voice: "Measured and plainspoken.",
        decisionStyle: "Careful, but not hesitant.",
        worldview: "Pragmatic and local.",
        internalContradictions: ["Wants distance, but keeps taking responsibility."],
        personalMythology: "Just another traveler trying to keep one promise.",
        sampleLines: ["Keep your hood up and your head down."],
      },
    },
    profile: {
      species: "Human",
      gender: "",
      ageText: "",
      appearance: "",
      backgroundSummary: "Baseline background",
      personaSummary: "Baseline persona",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Moonwell",
      relationshipRefs: [],
      socialStatus: [],
      originMode: role === "player" ? "native" : "resident",
    },
    motivations: {
      shortTermGoals: ["Keep moving"],
      longTermGoals: ["Stay alive"],
      beliefs: [],
      drives: ["Curiosity"],
      frictions: [],
    },
    capabilities: {
      traits: ["Alert"],
      skills: [],
      flaws: [],
      specialties: [],
      wealthTier: "Poor",
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "active",
    },
    loadout: {
      inventorySeed: ["Bedroll"],
      equippedItemRefs: ["Bedroll"],
      currencyNotes: "",
      signatureItems: [],
    },
    startConditions: {
      sourcePrompt: "I arrive before sunrise.",
    },
    provenance: {
      sourceKind: role === "player" ? "player-input" : "worldgen",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
  };
}

const TEMPLATE: PersonaTemplate = {
  id: "template-border-watch",
  campaignId: "camp-1",
  name: "Border Watch Veteran",
  description: "A veteran hardened by long patrols.",
  roleScope: "any",
  tags: ["martial", "grim"],
  patch: {
    identity: {
      baseFacts: {
        biography: "Years on the wind-scoured frontier.",
      },
      behavioralCore: {
        motives: ["Duty"],
        selfImage: "Dry wit hiding hard-earned caution.",
      },
      liveDynamics: {
        attachments: [],
        currentStrains: ["Distrusts authority"],
      },
    },
    profile: {
      backgroundSummary: "Years on the wind-scoured frontier.",
      personaSummary: "Dry wit hiding hard-earned caution.",
    },
    motivations: {
      drives: ["Duty"],
      frictions: ["Distrusts authority"],
    },
    capabilities: {
      traits: ["Observant", "Steady"],
    },
    startConditions: {
      arrivalMode: "on-foot",
      entryPressure: ["late", "under-equipped"],
    },
    provenance: {
      templateId: "template-border-watch",
    },
  },
  createdAt: 100,
  updatedAt: 200,
};

describe("persona templates", () => {
  it("applies a shared patch to a player draft without changing identity role or tier", () => {
    const draft = makeDraft("player");

    const next = applyPersonaTemplate(draft, TEMPLATE);

    expect(next.identity.role).toBe("player");
    expect(next.identity.tier).toBe("key");
    expect(next.identity.baseFacts?.biography).toBe(
      "Years on the wind-scoured frontier.",
    );
    expect(next.identity.behavioralCore?.motives).toEqual(["Duty"]);
    expect(next.identity.liveDynamics?.currentStrains).toEqual([
      "Distrusts authority",
    ]);
    expect(next.profile.backgroundSummary).toBe(
      "Years on the wind-scoured frontier.",
    );
    expect(next.motivations.drives).toEqual(["Duty"]);
    expect(next.capabilities.traits).toEqual(["Observant", "Steady"]);
    expect(next.startConditions.arrivalMode).toBe("on-foot");
    expect(next.provenance.templateId).toBe(TEMPLATE.id);
  });

  it("applies the same shared patch to an npc draft without forking the contract", () => {
    const draft = makeDraft("npc");

    const next = applyPersonaTemplatePatch(draft, TEMPLATE.patch, TEMPLATE.id);

    expect(next.identity.role).toBe("npc");
    expect(next.identity.tier).toBe("persistent");
    expect(next.profile.personaSummary).toContain("Dry wit");
    expect(next.identity.behavioralCore?.selfImage).toContain("Dry wit");
    expect(next.startConditions.entryPressure).toEqual([
      "late",
      "under-equipped",
    ]);
    // sourceBundle and continuity no longer managed by persona templates
  });

  it("creates lightweight summaries for list payloads without dropping scope metadata", () => {
    expect(createPersonaTemplateSummary(TEMPLATE)).toEqual({
      id: TEMPLATE.id,
      campaignId: TEMPLATE.campaignId,
      name: TEMPLATE.name,
      description: TEMPLATE.description,
      roleScope: TEMPLATE.roleScope,
      tags: TEMPLATE.tags,
      createdAt: TEMPLATE.createdAt,
      updatedAt: TEMPLATE.updatedAt,
    });
  });

  it("merges personality patches without disturbing untouched fields", () => {
    const draft = makeDraft("player");

    const next = applyPersonaTemplatePatch(draft, {
      identity: {
        personality: {
          voice: "Dry, clipped, and a little dismissive.",
        },
      },
    });

    expect(next.identity.personality?.voice).toBe(
      "Dry, clipped, and a little dismissive.",
    );
    expect(next.identity.personality?.summary).toBe("Baseline interiority.");
    expect(next.identity.personality?.sampleLines).toEqual([
      "Keep your hood up and your head down.",
    ]);
  });

  it("leaves personality untouched when the patch omits it", () => {
    const draft = makeDraft("npc");

    const next = applyPersonaTemplatePatch(draft, {
      identity: {
        behavioralCore: {
          selfImage: "Changed self-image only.",
        },
      },
    });

    expect(next.identity.behavioralCore?.selfImage).toBe("Changed self-image only.");
    expect(next.identity.personality).toEqual(draft.identity.personality);
  });

  it("replaces personality sampleLines arrays instead of concatenating them", () => {
    const draft = makeDraft("player");

    const next = applyPersonaTemplatePatch(draft, {
      identity: {
        personality: {
          sampleLines: ["Eyes up.", "Move clean."],
        },
      },
    });

    expect(next.identity.personality?.sampleLines).toEqual([
      "Eyes up.",
      "Move clean.",
    ]);
  });
});
