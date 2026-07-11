import { describe, expect, it, vi } from "vitest";
import type {
  CampaignPlayCharacterDraft,
  CampaignWorldReview,
  CharacterDraft,
  Settings,
} from "@worldforge/shared";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { IngestionContext, IngestionInput } from "../character/ingestion/types.js";
import {
  CampaignPlayCharacterServiceError,
  createCampaignPlayCharacterService,
} from "./character-service.js";

const CAMPAIGN_ID = "campaign-character-intake";
const ACTOR_ID = "player-character";

const generator = {
  provider: {
    id: "test-provider",
    name: "Test Provider",
    baseUrl: "https://example.invalid",
    apiKey: "test-key",
    model: "test-model",
  },
  temperature: 0.4,
  maxTokens: 4_096,
} satisfies ResolvedRole;

const settings = {
  research: {
    enabled: true,
    searchProvider: "none",
    maxSearchSteps: 2,
  },
} as unknown as Settings;

type IngestDependency = (
  input: IngestionInput,
  context: IngestionContext,
) => Promise<CharacterDraft>;

type ResearchDependency = (options: {
  archetype: string;
  role: ResolvedRole;
  research: Settings["research"];
}) => Promise<string | null>;

function makeWorld(overrides: Partial<CampaignWorldReview> = {}): CampaignWorldReview {
  return {
    campaignId: CAMPAIGN_ID,
    status: "accepted",
    version: 3,
    contentHash: "a".repeat(64),
    sourceDigest: "b".repeat(64),
    worldSummary: "A rain-soaked port city lives under an approaching celestial storm.",
    locations: [
      {
        id: "location-zinc",
        name: "Zinc Market",
        description: "A crowded market under copper roofs.",
        kind: "macro",
        parentLocationId: null,
        tags: ["market"],
        isStarting: true,
      },
      {
        id: "location-archive",
        name: "Archive Steps",
        description: "An old civic archive above the flooded quarter.",
        kind: "macro",
        parentLocationId: null,
        tags: ["archive"],
        isStarting: false,
      },
    ],
    routes: [],
    actors: [],
    goals: [],
    relations: [],
    placements: [],
    pressures: [],
    builtAt: 1_000,
    acceptedAt: 2_000,
    source: {
      premise: "A stranger arrives while the city prepares for the storm.",
      dna: null,
      researchSummary: "Maritime trade and observatory politics shape public life.",
      sourceReferences: [
        { id: "source-one", label: "Port notes", sourceType: "user" },
      ],
    },
    ...overrides,
  };
}

function makeDonorDraft(overrides: Partial<CharacterDraft> = {}): CharacterDraft {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: "Mara Venn",
      canonicalStatus: "original",
      baseFacts: {
        biography: "Mara repairs instruments and follows the storm's impossible harmonics.",
        socialRole: [],
        hardConstraints: [],
      },
      behavioralCore: {
        motives: ["Understand the celestial signal"],
        pressureResponses: ["Becomes terse when cornered"],
        taboos: [],
        attachments: [],
        selfImage: "A practical craftswoman facing an impossible phenomenon.",
      },
      liveDynamics: {
        attachments: [],
        activeGoals: [],
        beliefDrift: [],
        currentStrains: [],
        earnedChanges: [],
      },
      personality: {
        summary: "Patient, observant, and privately superstitious.",
        voice: "Precise sentences with dry understatement.",
        decisionStyle: "Measures immediate risk, then tests one variable.",
        worldview: "Every mystery leaves a physical trace.",
        internalContradictions: ["Distrusts prophecy but keeps omen journals"],
        personalMythology: "The mechanic who can tune the sky.",
        sampleLines: ["Give me a minute and a quiet room."],
      },
    },
    profile: {
      species: "Human",
      gender: "Woman",
      ageText: "Thirty-two",
      appearance: "Oil-dark coat, brass spectacles, and scarred hands.",
      backgroundSummary: "An instrument repairer from the inland observatories.",
      personaSummary: "A careful mechanic drawn into a city-scale mystery.",
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
      beliefs: ["Machines tell the truth when people do not"],
      drives: ["Protect vulnerable witnesses"],
      frictions: ["Refuses ceremonial authority"],
    },
    capabilities: {
      traits: ["Observant", "Methodical"],
      skills: [{ name: "Instrument repair", tier: "Master" }],
      flaws: ["Overcommits to solvable details"],
      specialties: ["Acoustic mechanisms"],
      wealthTier: null,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "idle",
    },
    loadout: {
      inventorySeed: ["Repair roll", "Pocket resonator"],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: ["Brass tuning fork"],
    },
    startConditions: {},
    provenance: {
      sourceKind: "generator",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
    },
    ...overrides,
  };
}

function makePublicDraft(
  source: CampaignPlayCharacterDraft["source"] = {
    kind: "created",
    importMode: null,
    label: "Player-authored character",
  },
): CampaignPlayCharacterDraft {
  return {
    name: "Mara Venn",
    summary: "A careful mechanic drawn into a city-scale mystery.",
    species: "Human",
    gender: "Woman",
    ageText: "Thirty-two",
    appearance: "Oil-dark coat, brass spectacles, and scarred hands.",
    biography: "Mara repairs instruments and follows the storm's impossible harmonics.",
    personality: {
      summary: "Patient, observant, and privately superstitious.",
      voice: "Precise sentences with dry understatement.",
      decisionStyle: "Measures immediate risk, then tests one variable.",
      worldview: "Every mystery leaves a physical trace.",
      contradictions: ["Distrusts prophecy but keeps omen journals"],
      mythology: "The mechanic who can tune the sky.",
      sampleLines: ["Give me a minute and a quiet room."],
    },
    motives: ["Understand the celestial signal"],
    beliefs: ["Machines tell the truth when people do not"],
    drives: ["Protect vulnerable witnesses"],
    traits: ["Observant", "Methodical"],
    skills: [{ name: "Instrument repair", tier: "Master" }],
    flaws: ["Overcommits to solvable details"],
    specialties: ["Acoustic mechanisms"],
    inventory: ["Repair roll", "Pocket resonator"],
    signatureItems: ["Brass tuning fork"],
    source,
  };
}

function makeV2Card() {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Mara Venn",
      description: "A mechanic who hears a structured signal inside the storm.",
      personality: "Patient, observant, and privately superstitious.",
      scenario: "She has just reached the rain-soaked port city.",
      first_mes: "The harbor bells answer a note nobody played.",
      mes_example: "<START>\nMara: Give me a minute and a quiet room.",
      creator_notes: "PRIVATE_CREATOR_NOTES",
      system_prompt: "PRIVATE_SYSTEM_PROMPT",
      post_history_instructions: "PRIVATE_POST_HISTORY",
      alternate_greetings: ["PRIVATE_GREETING"],
      character_book: { entries: [{ keys: ["storm"], content: "PRIVATE_BOOK" }] },
      tags: ["PRIVATE_TAG"],
      creator: "fixture-author",
      character_version: "1.0",
      extensions: { private_extension: "PRIVATE_EXTENSION" },
    },
  };
}

function makeService() {
  const ingest = vi.fn<IngestDependency>(async () => makeDonorDraft());
  const research = vi.fn<ResearchDependency>(
    async () => "A grounded archetype summary.",
  );
  return {
    ingest,
    research,
    service: createCampaignPlayCharacterService({
      ingestCharacterDraft: ingest,
      researchArchetype: research,
    }),
  };
}

const context = () => ({ acceptedWorld: makeWorld(), generator, settings });

describe("Campaign Play character intake", () => {
  it("parses a complete Character Card V2 envelope through the explicit donor boundary", async () => {
    const { service, ingest } = makeService();
    const result = await service.parsePlayerCard(
      CAMPAIGN_ID,
      { cardJson: JSON.stringify(makeV2Card()), importMode: "outsider" },
      context(),
    );

    expect(result.draft.source).toEqual({
      kind: "character_card",
      importMode: "outsider",
      label: "Mara Venn",
    });
    expect(result.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(ingest).toHaveBeenCalledOnce();
    const [input, donorContext] = ingest.mock.calls[0]!;
    expect(input).toEqual({
      mode: "import",
      campaignId: CAMPAIGN_ID,
      role: "player",
      v2Card: {
        name: "Mara Venn",
        description: "A mechanic who hears a structured signal inside the storm.",
        personality: "Patient, observant, and privately superstitious.",
        scenario: "She has just reached the rain-soaked port city.",
        tags: [],
        mesExample: "<START>\nMara: Give me a minute and a quiet room.",
        importMode: "outsider",
      },
    });
    expect(donorContext.locationNames).toEqual(["Archive Steps", "Zinc Market"]);
    expect(donorContext.factionNames).toEqual([]);
    expect(donorContext.campaign.ipContext).toBeNull();
    expect(donorContext.campaign.premise).toContain("worldSummary");

    const serializedInput = JSON.stringify(input);
    for (const privateValue of [
      "PRIVATE_CREATOR_NOTES",
      "PRIVATE_SYSTEM_PROMPT",
      "PRIVATE_POST_HISTORY",
      "PRIVATE_GREETING",
      "PRIVATE_BOOK",
      "PRIVATE_TAG",
      "PRIVATE_EXTENSION",
    ]) {
      expect(serializedInput).not.toContain(privateValue);
    }
  });

  it.each([
    ["root-level card", { name: "Mara", description: "old shape" }],
    ["V3 envelope", { ...makeV2Card(), spec: "chara_card_v3", spec_version: "3.0" }],
    ["unknown root field", { ...makeV2Card(), unknown: true }],
    ["unknown data field", {
      ...makeV2Card(),
      data: { ...makeV2Card().data, unknown: true },
    }],
    ["partial V2 data", {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: { name: "Mara" },
    }],
    ["malformed character book", {
      ...makeV2Card(),
      data: { ...makeV2Card().data, character_book: 7 },
    }],
  ])("rejects %s before character generation", async (_label, card) => {
    const { service, ingest } = makeService();
    await expect(service.parsePlayerCard(
      CAMPAIGN_ID,
      { cardJson: JSON.stringify(card), importMode: "native" },
      context(),
    )).rejects.toMatchObject({
      code: "invalid_character_card",
      publicCode: "invalid_character",
    });
    expect(ingest).not.toHaveBeenCalled();
  });

  it("rejects an oversized card before character generation", async () => {
    const { service, ingest } = makeService();
    const card = makeV2Card();
    card.data.creator_notes = "x".repeat(262_144);
    await expect(service.parsePlayerCard(
      CAMPAIGN_ID,
      { cardJson: JSON.stringify(card), importMode: "native" },
      context(),
    )).rejects.toMatchObject({ code: "invalid_character_card" });
    expect(ingest).not.toHaveBeenCalled();
  });

  it("generates from one bounded concept and carries research without source excerpts", async () => {
    const { service, ingest } = makeService();
    const result = await service.generatePlayerDraft(
      CAMPAIGN_ID,
      {
        prompt: "A harbor mechanic who hears the storm sing.",
        research: {
          summary: "Historical acoustic instruments inspire her methods.",
          sources: [{ label: "Archive", excerpt: "UNTRUSTED_SOURCE_EXCERPT" }],
        },
      },
      context(),
    );

    expect(result.draft.source.kind).toBe("research");
    const donorInput = ingest.mock.calls[0]![0];
    expect(donorInput).toMatchObject({ mode: "parse", role: "player" });
    expect(JSON.stringify(donorInput)).toContain("Historical acoustic instruments");
    expect(JSON.stringify(donorInput)).not.toContain("UNTRUSTED_SOURCE_EXCERPT");
  });

  it("marks generation without research as generated", async () => {
    const { service } = makeService();
    const result = await service.generatePlayerDraft(
      CAMPAIGN_ID,
      { prompt: "A retired cartographer.", research: null },
      context(),
    );
    expect(result.draft.source).toEqual({
      kind: "generated",
      importMode: null,
      label: "Generated player character",
    });
  });

  it("keeps the normalized intake digest stable through profile preparation", async () => {
    const { service } = makeService();
    const intake = await service.generatePlayerDraft(
      CAMPAIGN_ID,
      { prompt: "A retired cartographer.", research: null },
      context(),
    );
    const prepared = service.preparePlayerProfile({
      campaignId: CAMPAIGN_ID,
      actorId: ACTOR_ID,
      character: intake.draft,
    });
    expect(prepared.sourceDigest).toBe(intake.sourceDigest);
  });

  it("rejects a donor profile with missing required character fields", async () => {
    const { service, ingest } = makeService();
    ingest.mockResolvedValueOnce(makeDonorDraft({
      profile: { ...makeDonorDraft().profile, personaSummary: "" },
    }));
    await expect(service.generatePlayerDraft(
      CAMPAIGN_ID,
      { prompt: "A retired cartographer.", research: null },
      context(),
    )).rejects.toMatchObject({
      code: "invalid_character_profile",
      publicCode: "invalid_character",
    });
  });

  it("maps donor failure to a typed retryable service error", async () => {
    const { service, ingest } = makeService();
    ingest.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(service.generatePlayerDraft(
      CAMPAIGN_ID,
      { prompt: "A retired cartographer.", research: null },
      context(),
    )).rejects.toMatchObject({
      code: "character_generation_failed",
      publicCode: "service_unavailable",
    });
  });

  it.each([
    ["review world", makeWorld({ status: "review", acceptedAt: null })],
    ["foreign campaign", makeWorld({ campaignId: "another-campaign" })],
  ])("rejects %s before invoking character generation", async (_label, acceptedWorld) => {
    const { service, ingest } = makeService();
    await expect(service.generatePlayerDraft(
      CAMPAIGN_ID,
      { prompt: "A retired cartographer.", research: null },
      { acceptedWorld, generator, settings },
    )).rejects.toMatchObject({ code: "accepted_world_context_invalid" });
    expect(ingest).not.toHaveBeenCalled();
  });

  it("returns truthful research with no invented citations", async () => {
    const { service, research } = makeService();
    const result = await service.researchPlayer(
      { query: "instrument repairers in maritime cities" },
      generator,
      settings,
    );
    expect(result).toEqual({
      research: { summary: "A grounded archetype summary.", sources: [] },
    });
    expect(research).toHaveBeenCalledWith({
      archetype: "instrument repairers in maritime cities",
      role: generator,
      research: settings.research,
    });
  });

  it.each([
    ["null", null],
    ["blank", "   "],
    ["oversized", "x".repeat(1_201)],
  ])("fails closed when research returns %s output", async (_label, output) => {
    const { service, research } = makeService();
    research.mockResolvedValueOnce(output);
    await expect(service.researchPlayer(
      { query: "instrument repairers" },
      generator,
      settings,
    )).rejects.toMatchObject({
      code: "character_research_failed",
      publicCode: "service_unavailable",
    });
  });

  it("maps a thrown research failure without attempting a second provider", async () => {
    const { service, research } = makeService();
    research.mockRejectedValueOnce(new Error("search unavailable"));
    await expect(service.researchPlayer(
      { query: "instrument repairers" },
      generator,
      settings,
    )).rejects.toMatchObject({ code: "character_research_failed" });
    expect(research).toHaveBeenCalledOnce();
  });
});

describe("Campaign Play character profile preparation", () => {
  it.each([
    ["created", null, "player-input"],
    ["generated", null, "generator"],
    ["character_card", "native", "import"],
    ["research", null, "archetype"],
  ] as const)("materializes %s provenance without bootstrap claims", (kind, importMode, provenance) => {
    const service = createCampaignPlayCharacterService();
    const character = makePublicDraft({ kind, importMode, label: `${kind} source` });
    const prepared = service.preparePlayerProfile({
      campaignId: CAMPAIGN_ID,
      actorId: ACTOR_ID,
      character,
    });

    expect(prepared.record.identity).toMatchObject({
      id: ACTOR_ID,
      campaignId: CAMPAIGN_ID,
      role: "player",
      tier: "key",
    });
    expect(prepared.record.provenance).toMatchObject({
      sourceKind: provenance,
      importMode,
    });
    expect(prepared.record.socialContext).toMatchObject({
      factionId: null,
      factionName: null,
      currentLocationId: null,
      currentLocationName: null,
      relationshipRefs: [],
    });
    expect(prepared.record.motivations.shortTermGoals).toEqual([]);
    expect(prepared.record.motivations.longTermGoals).toEqual([]);
    expect(prepared.record.startConditions).toEqual({});
    expect(prepared.record.loadout.equippedItemRefs).toEqual([]);
    expect(prepared.record.state).toEqual({
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "idle",
    });
    expect(JSON.parse(prepared.recordJson)).toEqual(prepared.record);
  });

  it("produces stable domain-separated source and profile digests", () => {
    const service = createCampaignPlayCharacterService();
    const input = {
      campaignId: CAMPAIGN_ID,
      actorId: ACTOR_ID,
      character: makePublicDraft(),
    };
    const first = service.preparePlayerProfile(input);
    const second = service.preparePlayerProfile({
      ...input,
      character: structuredClone(input.character),
    });

    expect(first.sourceDigest).toBe(second.sourceDigest);
    expect(first.profileDigest).toBe(second.profileDigest);
    expect(first.recordJson).toBe(second.recordJson);
    expect(first.sourceDigest).not.toBe(first.profileDigest);
    expect(first.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.profileDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("binds the full record identity into the profile digest", () => {
    const service = createCampaignPlayCharacterService();
    const character = makePublicDraft();
    const first = service.preparePlayerProfile({
      campaignId: CAMPAIGN_ID,
      actorId: ACTOR_ID,
      character,
    });
    const second = service.preparePlayerProfile({
      campaignId: CAMPAIGN_ID,
      actorId: "different-player",
      character,
    });
    expect(first.sourceDigest).toBe(second.sourceDigest);
    expect(first.profileDigest).not.toBe(second.profileDigest);
  });

  it("rejects unknown or partial public character profiles", () => {
    const service = createCampaignPlayCharacterService();
    expect(() => service.preparePlayerProfile({
      campaignId: CAMPAIGN_ID,
      actorId: ACTOR_ID,
      character: { ...makePublicDraft(), unknown: true } as CampaignPlayCharacterDraft,
    })).toThrow(CampaignPlayCharacterServiceError);
    expect(() => service.preparePlayerProfile({
      campaignId: CAMPAIGN_ID,
      actorId: ACTOR_ID,
      character: { name: "Mara" } as CampaignPlayCharacterDraft,
    })).toThrow(CampaignPlayCharacterServiceError);
  });

  it.each(["", " actor-with-space ", "actor/with/slash"])(
    "rejects invalid actor identity %j before digest creation",
    (actorId) => {
      const service = createCampaignPlayCharacterService();
      expect(() => service.preparePlayerProfile({
        campaignId: CAMPAIGN_ID,
        actorId,
        character: makePublicDraft(),
      })).toThrow(CampaignPlayCharacterServiceError);
    },
  );

  it.each(["", " campaign-with-space ", "campaign/with/slash"])(
    "rejects invalid campaign identity %j before digest creation",
    (campaignId) => {
      const service = createCampaignPlayCharacterService();
      expect(() => service.preparePlayerProfile({
        campaignId,
        actorId: ACTOR_ID,
        character: makePublicDraft(),
      })).toThrow(CampaignPlayCharacterServiceError);
    },
  );

  it.each([
    ["created", "outsider"],
    ["generated", "native"],
    ["research", "outsider"],
    ["character_card", null],
  ] as const)(
    "rejects incompatible %s source provenance with import mode %j",
    (kind, importMode) => {
      const service = createCampaignPlayCharacterService();
      expect(() => service.preparePlayerProfile({
        campaignId: CAMPAIGN_ID,
        actorId: ACTOR_ID,
        character: makePublicDraft({
          kind,
          importMode,
          label: "Invalid provenance",
        }),
      })).toThrow(CampaignPlayCharacterServiceError);
    },
  );
});
