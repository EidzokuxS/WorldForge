import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { CharacterDraft, PersonaTemplate } from "@worldforge/shared";

vi.mock("../../campaign/index.js", () => ({
  getPersonaTemplate: vi.fn(),
  readCampaignConfig: vi.fn(),
  savePersonaTemplates: vi.fn(),
  loadCampaign: vi.fn(),
  getActiveCampaign: vi.fn(),
}));

vi.mock("../../lib/index.js", () => ({
  getErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
  getErrorStatus: vi.fn(() => 500),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  getPersonaTemplate,
  readCampaignConfig,
  savePersonaTemplates,
  loadCampaign,
  getActiveCampaign,
} from "../../campaign/index.js";
import personaTemplateRoutes from "../persona-templates.js";

const mockedGetPersonaTemplate = vi.mocked(getPersonaTemplate);
const mockedReadCampaignConfig = vi.mocked(readCampaignConfig);
const mockedSavePersonaTemplates = vi.mocked(savePersonaTemplates);
const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedGetActiveCampaign = vi.mocked(getActiveCampaign);

const app = new Hono();
app.route("/api/campaigns/:id/persona-templates", personaTemplateRoutes);

const CAMPAIGN_ID = "campaign-1";
const TEMPLATE: PersonaTemplate = {
  id: "template-border-watch",
  campaignId: CAMPAIGN_ID,
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
      personaSummary: "Dry wit hiding hard-earned caution.",
    },
    motivations: {
      drives: ["Duty"],
    },
    provenance: {
      templateId: "template-border-watch",
    },
  },
  createdAt: 100,
  updatedAt: 200,
};

function makeDraft(role: CharacterDraft["identity"]["role"] = "player"): CharacterDraft {
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

function setLoadedCampaign() {
  const campaign = {
    id: CAMPAIGN_ID,
    name: "Arcadia",
    premise: "A cold frontier",
    generationComplete: true,
  } as const;
  mockedGetActiveCampaign.mockReturnValue(campaign as never);
  mockedLoadCampaign.mockResolvedValue(campaign as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedReadCampaignConfig.mockReturnValue({ personaTemplates: [] } as never);
  mockedLoadCampaign.mockRejectedValue(new Error("not found"));
});

describe("personaTemplateRoutes", () => {
  it("lists persona template summaries for a campaign", async () => {
    setLoadedCampaign();
    mockedReadCampaignConfig.mockReturnValue({
      personaTemplates: [TEMPLATE],
    } as never);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/persona-templates`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      personaTemplates: [
        {
          id: TEMPLATE.id,
          campaignId: CAMPAIGN_ID,
          name: TEMPLATE.name,
          description: TEMPLATE.description,
          roleScope: TEMPLATE.roleScope,
          tags: TEMPLATE.tags,
          createdAt: TEMPLATE.createdAt,
          updatedAt: TEMPLATE.updatedAt,
        },
      ],
    });
  });

  it("creates and persists a new persona template", async () => {
    setLoadedCampaign();

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/persona-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        name: TEMPLATE.name,
        description: TEMPLATE.description,
        roleScope: TEMPLATE.roleScope,
        tags: TEMPLATE.tags,
        patch: TEMPLATE.patch,
      }),
    });

    expect(res.status).toBe(201);
    expect(mockedSavePersonaTemplates).toHaveBeenCalledTimes(1);
    const savedTemplates = mockedSavePersonaTemplates.mock.calls[0]?.[1];
    expect(savedTemplates).toHaveLength(1);
    expect(savedTemplates?.[0]).toMatchObject({
      campaignId: CAMPAIGN_ID,
      name: TEMPLATE.name,
      description: TEMPLATE.description,
      roleScope: TEMPLATE.roleScope,
      tags: TEMPLATE.tags,
      patch: TEMPLATE.patch,
    });
  });

  it("applies a template to a player draft and returns richer draft data plus compatibility payloads", async () => {
    setLoadedCampaign();
    mockedGetPersonaTemplate.mockReturnValue(TEMPLATE as never);

    const draft = makeDraft("player");
    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/persona-templates/${TEMPLATE.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        templateId: TEMPLATE.id,
        draft,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft.provenance.templateId).toBe(TEMPLATE.id);
    expect(body.draft.profile.personaSummary).toContain("Dry wit");
    expect(body.draft.identity.baseFacts.biography).toBe(
      "Years on the wind-scoured frontier.",
    );
    expect(body.draft.identity.behavioralCore.motives).toEqual(["Duty"]);
    expect(body.draft.identity.liveDynamics.currentStrains).toEqual([
      "Distrusts authority",
    ]);
    expect(body.draft.sourceBundle.secondarySources[0].label).toBe(
      "Baseline concept",
    );
    expect(body.draft.continuity.identityInertia).toBe("anchored");
    expect(body.characterRecord.identity.baseFacts.biography).toBe(
      "Years on the wind-scoured frontier.",
    );
    expect(body.personaTemplate).toMatchObject({
      id: TEMPLATE.id,
      name: TEMPLATE.name,
    });
    expect(body.character).toMatchObject({
      name: "Aria Vale",
    });
  });

  it("does not erase sourceBundle or continuity when applying a template to an imported npc draft", async () => {
    setLoadedCampaign();
    mockedGetPersonaTemplate.mockReturnValue(TEMPLATE as never);

    const draft = makeDraft("npc");
    draft.provenance.sourceKind = "import";
    draft.provenance.importMode = "outsider";

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/persona-templates/${TEMPLATE.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        templateId: TEMPLATE.id,
        draft,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft.sourceBundle.secondarySources[0].label).toBe(
      "Baseline concept",
    );
    expect(body.draft.continuity.identityInertia).toBe("anchored");
    expect(body.characterRecord.sourceBundle.secondarySources[0].label).toBe(
      "Baseline concept",
    );
    expect(body.characterRecord.continuity.identityInertia).toBe("anchored");
    expect(body.npc).toMatchObject({
      name: "Watchman Orren",
    });
  });

  it("returns 404 when applying a missing template", async () => {
    setLoadedCampaign();
    mockedGetPersonaTemplate.mockReturnValue(null as never);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/persona-templates/missing/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        templateId: "missing",
        draft: makeDraft("npc"),
      }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Persona template not found.",
    });
  });
});
