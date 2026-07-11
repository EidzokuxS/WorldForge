import { z } from "zod";
import {
  CAMPAIGN_PLAY_LIMITS,
  type CampaignPlayCharacterDraft,
  type CampaignPlayCharacterResearchResponse,
  type CampaignPlayGeneratePlayerDraftRequest,
  type CampaignPlayParsePlayerCardRequest,
  type CampaignPlayResearchPlayerRequest,
  type CampaignWorldReview,
  type CharacterDraft,
  type CharacterRecord,
  type Settings,
} from "@worldforge/shared";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { researchArchetype } from "../character/archetype-researcher.js";
import { ingestCharacterDraft } from "../character/ingestion/pipeline.js";
import type { IngestionContext, IngestionInput } from "../character/ingestion/types.js";
import { createCharacterRecordFromDraft } from "../character/record-adapters.js";
import {
  campaignPlayCharacterDraftSchema,
  campaignPlayCharacterResearchResponseSchema,
  campaignPlayGeneratePlayerDraftRequestSchema,
  campaignPlayParsePlayerCardRequestSchema,
  campaignPlayResearchPlayerRequestSchema,
} from "./contracts.js";
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
} from "./campaign-play-projection.js";

const CHARACTER_CONTEXT_BYTE_LIMIT = 16_384;
const ENTITY_ID_CHARACTERS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-:";

const entityIdSchema = z.string()
  .min(1)
  .max(CAMPAIGN_PLAY_LIMITS.id)
  .refine((value) => value === value.trim())
  .refine((value) => [...value].every((character) =>
    ENTITY_ID_CHARACTERS.includes(character)));

const characterCardV2DataSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  personality: z.string(),
  scenario: z.string(),
  first_mes: z.string(),
  mes_example: z.string(),
  creator_notes: z.string(),
  system_prompt: z.string(),
  post_history_instructions: z.string(),
  alternate_greetings: z.array(z.string()),
  character_book: z.record(z.string(), z.unknown()).nullable().optional(),
  tags: z.array(z.string()),
  creator: z.string(),
  character_version: z.string(),
  extensions: z.record(z.string(), z.unknown()),
}).strict();

const characterCardV2Schema = z.object({
  spec: z.literal("chara_card_v2"),
  spec_version: z.literal("2.0"),
  data: characterCardV2DataSchema,
}).strict();

export type CampaignPlayCharacterServiceErrorCode =
  | "accepted_world_context_invalid"
  | "invalid_character_card"
  | "invalid_character_profile"
  | "character_generation_failed"
  | "character_research_failed";

export class CampaignPlayCharacterServiceError extends Error {
  readonly code: CampaignPlayCharacterServiceErrorCode;
  readonly publicCode: "invalid_character" | "service_unavailable";

  constructor(
    code: CampaignPlayCharacterServiceErrorCode,
    publicCode: "invalid_character" | "service_unavailable",
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "CampaignPlayCharacterServiceError";
    this.code = code;
    this.publicCode = publicCode;
  }
}

export interface CampaignPlayCharacterContext {
  acceptedWorld: CampaignWorldReview;
  generator: ResolvedRole;
  settings: Settings;
}

export interface CampaignPlayCharacterIntake {
  draft: CampaignPlayCharacterDraft;
  sourceDigest: string;
}

export interface PreparedCampaignPlayCharacter {
  campaignId: string;
  actorId: string;
  sourceKind: CampaignPlayCharacterDraft["source"]["kind"];
  sourceDigest: string;
  record: CharacterRecord;
  recordJson: string;
  profileDigest: string;
}

const preparedCharacterSeals = new WeakMap<object, string>();

function preparedCharacterSeal(character: PreparedCampaignPlayCharacter): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_prepared_character",
    character,
  });
}

export function isPreparedCampaignPlayCharacter(
  character: PreparedCampaignPlayCharacter,
): boolean {
  return preparedCharacterSeals.get(character) === preparedCharacterSeal(character);
}

interface CampaignPlayCharacterServiceDependencies {
  ingestCharacterDraft: typeof ingestCharacterDraft;
  researchArchetype: typeof researchArchetype;
}

export interface CampaignPlayCharacterService {
  parsePlayerCard(
    campaignId: string,
    request: CampaignPlayParsePlayerCardRequest,
    context: CampaignPlayCharacterContext,
  ): Promise<CampaignPlayCharacterIntake>;
  generatePlayerDraft(
    campaignId: string,
    request: CampaignPlayGeneratePlayerDraftRequest,
    context: CampaignPlayCharacterContext,
  ): Promise<CampaignPlayCharacterIntake>;
  researchPlayer(
    request: CampaignPlayResearchPlayerRequest,
    generator: ResolvedRole,
    settings: Settings,
  ): Promise<CampaignPlayCharacterResearchResponse>;
  preparePlayerProfile(input: {
    campaignId: string;
    actorId: string;
    character: CampaignPlayCharacterDraft;
  }): PreparedCampaignPlayCharacter;
}

function fail(
  code: CampaignPlayCharacterServiceErrorCode,
  publicCode: "invalid_character" | "service_unavailable",
  cause?: unknown,
): never {
  throw new CampaignPlayCharacterServiceError(code, publicCode, { cause });
}

function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    fail("invalid_character_profile", "invalid_character", parsed.error);
  }
  return parsed.data;
}

function parseEntityId(value: unknown): string {
  const parsed = entityIdSchema.safeParse(value);
  if (!parsed.success) {
    fail("invalid_character_profile", "invalid_character", parsed.error);
  }
  return parsed.data;
}

function parseCharacterDraft(value: unknown): CampaignPlayCharacterDraft {
  const parsed = campaignPlayCharacterDraftSchema.safeParse(value);
  if (!parsed.success) {
    fail("invalid_character_profile", "invalid_character", parsed.error);
  }
  const source = parsed.data.source;
  const validImportMode = source.kind === "character_card"
    ? source.importMode !== null
    : source.importMode === null;
  if (!validImportMode) {
    fail("invalid_character_profile", "invalid_character");
  }
  return parsed.data;
}

function sortText(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function buildAcceptedWorldContext(
  campaignId: string,
  context: CampaignPlayCharacterContext,
): IngestionContext {
  const validCampaignId = parseEntityId(campaignId);
  const world = context.acceptedWorld;
  if (
    world.status !== "accepted"
    || world.acceptedAt === null
    || world.campaignId !== validCampaignId
  ) {
    fail("accepted_world_context_invalid", "invalid_character");
  }

  const premise = canonicalizeCampaignPlayProjection({
    premise: world.source.premise,
    dna: world.source.dna,
    researchSummary: world.source.researchSummary,
    sourceReferences: world.source.sourceReferences,
    worldSummary: world.worldSummary,
  });
  if (Buffer.byteLength(premise, "utf-8") > CHARACTER_CONTEXT_BYTE_LIMIT) {
    fail("accepted_world_context_invalid", "invalid_character");
  }

  return {
    gen: context.generator,
    campaign: {
      premise,
      ipContext: null,
      premiseDivergence: null,
    },
    settings: context.settings,
    locationNames: sortText(world.locations.map((location) => location.name)),
    factionNames: [],
  };
}

function normalizeDraft(
  draft: CharacterDraft,
  source: CampaignPlayCharacterDraft["source"],
): CampaignPlayCharacterDraft {
  const personality = draft.identity.personality;
  const candidate: CampaignPlayCharacterDraft = {
    name: draft.identity.displayName,
    summary: draft.profile.personaSummary,
    species: draft.profile.species,
    gender: draft.profile.gender,
    ageText: draft.profile.ageText,
    appearance: draft.profile.appearance,
    biography: draft.identity.baseFacts?.biography ?? draft.profile.backgroundSummary,
    personality: {
      summary: personality?.summary ?? "",
      voice: personality?.voice ?? "",
      decisionStyle: personality?.decisionStyle ?? "",
      worldview: personality?.worldview ?? "",
      contradictions: personality?.internalContradictions ?? [],
      mythology: personality?.personalMythology ?? "",
      sampleLines: personality?.sampleLines ?? [],
    },
    motives: draft.identity.behavioralCore?.motives ?? [],
    beliefs: draft.motivations.beliefs,
    drives: draft.motivations.drives,
    traits: draft.capabilities.traits ?? [],
    skills: draft.capabilities.skills,
    flaws: draft.capabilities.flaws ?? [],
    specialties: draft.capabilities.specialties,
    inventory: draft.loadout.inventorySeed,
    signatureItems: draft.loadout.signatureItems,
    source,
  };
  return parseCharacterDraft(candidate);
}

function createIntake(draft: CampaignPlayCharacterDraft): CampaignPlayCharacterIntake {
  return {
    draft,
    sourceDigest: hashCampaignPlayProjection({
      domain: "campaign_play_character_source",
      sourceKind: draft.source.kind,
      character: draft,
    }),
  };
}

function toCharacterDraft(character: CampaignPlayCharacterDraft): CharacterDraft {
  const sourceKind = character.source.kind === "created"
    ? "player-input"
    : character.source.kind === "generated"
      ? "generator"
      : character.source.kind === "character_card"
        ? "import"
        : "archetype";

  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: character.name,
      canonicalStatus: character.source.kind === "character_card" ? "imported" : "original",
      baseFacts: {
        biography: character.biography,
        socialRole: ["player"],
        hardConstraints: [],
      },
      behavioralCore: {
        motives: character.motives,
        pressureResponses: character.flaws,
        taboos: [],
        attachments: [],
        selfImage: character.summary,
      },
      liveDynamics: {
        attachments: [],
        activeGoals: [],
        beliefDrift: [],
        currentStrains: [],
        earnedChanges: [],
      },
      personality: {
        summary: character.personality.summary,
        voice: character.personality.voice,
        decisionStyle: character.personality.decisionStyle,
        worldview: character.personality.worldview,
        internalContradictions: character.personality.contradictions,
        personalMythology: character.personality.mythology,
        sampleLines: character.personality.sampleLines,
      },
    },
    profile: {
      species: character.species,
      gender: character.gender,
      ageText: character.ageText,
      appearance: character.appearance,
      backgroundSummary: character.biography,
      personaSummary: character.summary,
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
      originMode: character.source.importMode,
    },
    motivations: {
      shortTermGoals: [],
      longTermGoals: [],
      beliefs: character.beliefs,
      drives: character.drives,
      frictions: character.flaws,
    },
    capabilities: {
      traits: character.traits,
      skills: character.skills,
      flaws: character.flaws,
      specialties: character.specialties,
      wealthTier: null,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "idle",
    },
    loadout: {
      inventorySeed: character.inventory,
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: character.signatureItems,
    },
    startConditions: {},
    provenance: {
      sourceKind,
      importMode: character.source.importMode,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
    },
  };
}

function removeUndefinedPowerStats(record: CharacterRecord): CharacterRecord {
  if (record.powerStats !== undefined) return record;
  const { powerStats: _powerStats, ...definedRecord } = record;
  return definedRecord;
}

export function createCampaignPlayCharacterService(
  dependencies: Partial<CampaignPlayCharacterServiceDependencies> = {},
): CampaignPlayCharacterService {
  const ingest = dependencies.ingestCharacterDraft ?? ingestCharacterDraft;
  const research = dependencies.researchArchetype ?? researchArchetype;

  async function runIngestion(
    campaignId: string,
    input: IngestionInput,
    context: CampaignPlayCharacterContext,
    source: CampaignPlayCharacterDraft["source"],
  ): Promise<CampaignPlayCharacterIntake> {
    const ingestionContext = buildAcceptedWorldContext(campaignId, context);
    try {
      return createIntake(normalizeDraft(await ingest(input, ingestionContext), source));
    } catch (error) {
      if (error instanceof CampaignPlayCharacterServiceError) throw error;
      fail("character_generation_failed", "service_unavailable", error);
    }
  }

  return {
    async parsePlayerCard(campaignId, request, context) {
      const parsedRequest = campaignPlayParsePlayerCardRequestSchema.safeParse(request);
      if (!parsedRequest.success) {
        fail("invalid_character_card", "invalid_character", parsedRequest.error);
      }
      let rawCard: unknown;
      try {
        rawCard = JSON.parse(parsedRequest.data.cardJson);
      } catch (error) {
        fail("invalid_character_card", "invalid_character", error);
      }
      const card = characterCardV2Schema.safeParse(rawCard);
      if (!card.success) {
        fail("invalid_character_card", "invalid_character", card.error);
      }
      const data = card.data.data;
      return runIngestion(
        campaignId,
        {
          mode: "import",
          campaignId,
          role: "player",
          v2Card: {
            name: data.name,
            description: data.description,
            personality: data.personality,
            scenario: data.scenario,
            tags: [],
            mesExample: data.mes_example,
            importMode: parsedRequest.data.importMode,
          },
        },
        context,
        {
          kind: "character_card",
          importMode: parsedRequest.data.importMode,
          label: data.name,
        },
      );
    },

    async generatePlayerDraft(campaignId, request, context) {
      const parsedRequest = parseRequest(campaignPlayGeneratePlayerDraftRequestSchema, request);
      const concept = parsedRequest.research === null
        ? parsedRequest.prompt
        : `${parsedRequest.prompt}\n\nResearch notes:\n${parsedRequest.research.summary}`;
      if (Buffer.byteLength(concept, "utf-8") > CAMPAIGN_PLAY_LIMITS.cardBytes) {
        fail("invalid_character_profile", "invalid_character");
      }
      const sourceKind = parsedRequest.research === null ? "generated" : "research";
      return runIngestion(
        campaignId,
        { mode: "parse", campaignId, role: "player", freeText: concept },
        context,
        {
          kind: sourceKind,
          importMode: null,
          label: sourceKind === "generated"
            ? "Generated player character"
            : "Research-backed player character",
        },
      );
    },

    async researchPlayer(request, generator, settings) {
      const parsedRequest = parseRequest(campaignPlayResearchPlayerRequestSchema, request);
      let summary: string | null;
      try {
        summary = await research({
          archetype: parsedRequest.query,
          role: generator,
          research: settings.research,
        });
      } catch (error) {
        fail("character_research_failed", "service_unavailable", error);
      }
      const result = campaignPlayCharacterResearchResponseSchema.safeParse({
        research: { summary: summary?.trim() ?? "", sources: [] },
      });
      if (!result.success) {
        fail("character_research_failed", "service_unavailable", result.error);
      }
      return result.data;
    },

    preparePlayerProfile(input) {
      const campaignId = parseEntityId(input.campaignId);
      const actorId = parseEntityId(input.actorId);
      const character = parseCharacterDraft(input.character);
      const sourceDigest = createIntake(character).sourceDigest;
      const record = removeUndefinedPowerStats(
        createCharacterRecordFromDraft(
          toCharacterDraft(character),
          { id: actorId, campaignId },
        ),
      );
      const recordJson = canonicalizeCampaignPlayProjection(record);
      const prepared: PreparedCampaignPlayCharacter = {
        campaignId,
        actorId,
        sourceKind: character.source.kind,
        sourceDigest,
        record,
        recordJson,
        profileDigest: hashCampaignPlayProjection({
          domain: "campaign_play_character_profile",
          record,
        }),
      };
      preparedCharacterSeals.set(prepared, preparedCharacterSeal(prepared));
      return Object.freeze(prepared);
    },
  };
}

export const campaignPlayCharacterService = createCampaignPlayCharacterService();
