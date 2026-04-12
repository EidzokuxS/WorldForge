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
        activeGoals: ["Keep moving", "Stay alive"],
        beliefDrift: [],
        currentStrains: [],
        earnedChanges: [],
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
    sourceBundle: {
      canonSources: [],
      secondarySources: [
        {
          kind: "runtime",
          label: "Baseline concept",
          excerpt: "Baseline background",
        },
      ],
      synthesis: {
        owner: "WorldForge",
        strategy: "test-fixture",
        notes: ["Persona templates should not erase source provenance."],
      },
    },
    continuity: {
      identityInertia: "anchored",
      protectedCore: ["identity.baseFacts", "identity.behavioralCore"],
      mutableSurface: ["identity.liveDynamics"],
      changePressureNotes: ["Change should be earned."],
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
    expect(next.sourceBundle?.secondarySources[0]?.label).toBe("Baseline concept");
    expect(next.continuity?.identityInertia).toBe("anchored");
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
});
