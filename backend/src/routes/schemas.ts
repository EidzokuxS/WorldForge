import { z } from "zod";
import {
  CHARACTER_SKILL_TIERS,
  CHARACTER_WEALTH_TIERS,
} from "@worldforge/shared";
import type {
  CanonicalLoadoutPreview,
  PersonaTemplate,
  PersonaTemplateSummary,
  ResolvedStartConditions,
} from "@worldforge/shared";
import {
  createCharacterRecordFromDraft,
  fromLegacyNpcRow,
  fromLegacyPlayerRow,
  toLegacyNpcDraft,
  toLegacyPlayerCharacter,
} from "../character/record-adapters.js";
import { LORE_CATEGORIES } from "../worldgen/types.js";
import { WORLDBOOK_ENTRY_TYPES } from "../worldgen/worldbook-importer.js";

const SEED_CATEGORIES = [
  "geography",
  "politicalStructure",
  "centralConflict",
  "culturalFlavor",
  "environment",
  "wildcard",
] as const;

export const seedCategorySchema = z.enum(SEED_CATEGORIES);

export const worldSeedsSchema = z
  .object({
    geography: z.string().optional(),
    politicalStructure: z.string().optional(),
    centralConflict: z.string().optional(),
    culturalFlavor: z.array(z.string()).optional(),
    environment: z.string().optional(),
    wildcard: z.string().optional(),
  })
  .refine(
    (seeds) =>
      Object.values(seeds).some(
        (v) =>
          (typeof v === "string" && v.trim() !== "") ||
          (Array.isArray(v) && v.length > 0)
      ),
    { message: "At least one seed must be non-empty." }
  );

const providerSchema = z.object({
  id: z.string().default(""),
  name: z.string().default(""),
  baseUrl: z.string().default(""),
  apiKey: z.string().default(""),
  defaultModel: z.string().default(""),
});

const roleConfigSchema = z.object({
  providerId: z.string().default(""),
  model: z.string().optional(),
  temperature: z.number().default(0.8),
  maxTokens: z.number().int().default(1024),
});

export const settingsPayloadSchema = z.object({
  providers: z.array(providerSchema),
  judge: roleConfigSchema,
  storyteller: roleConfigSchema,
  generator: roleConfigSchema,
  embedder: roleConfigSchema,
  fallback: z.object({
    providerId: z.string(),
    model: z.string(),
    timeoutMs: z.number(),
    retryCount: z.number(),
  }).strip(),
  images: z.object({
    providerId: z.string(),
    model: z.string(),
    stylePrompt: z.string(),
    enabled: z.boolean(),
  }).strip(),
  research: z.object({
    enabled: z.boolean(),
    maxSearchSteps: z.number().int().min(1).max(100),
    searchProvider: z.enum(["brave", "duckduckgo", "zai"]).optional(),
    braveApiKey: z.string().optional(),
    zaiApiKey: z.string().optional(),
  }).strip(),
}).strip();

// --- Endpoint schemas ---

export const chatBodySchema = z.object({
  playerAction: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "playerAction is required.")),
});

export const chatActionBodySchema = z.object({
  playerAction: z.string().min(1).max(2000),
  intent: z.string().min(1).max(2000),
  method: z.string().max(500).default(""),
});

const createCampaignBaseSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Campaign name is required.")),
  premise: z
    .string()
    .transform((s) => s.trim())
    .default(""),
  seeds: worldSeedsSchema.optional(),
});

const worldbookSelectionSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  normalizedSourceHash: z.string().min(1),
  entryCount: z.number().int().min(0),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const rollSeedSchema = z.object({
  category: seedCategorySchema,
});

export const suggestSeedsSchema = z.object({
  premise: z
    .string()
    .transform((s) => s.trim())
    .optional()
    .default(""),
  name: z.string().optional(),
  /** Explicit franchise name — if set, research this IP. If empty, treat as original world. */
  franchise: z.string().optional(),
  /** Whether to run web research. Default true. */
  research: z.boolean().optional(),
  /** Selected reusable worldbooks — composed on the backend into one context. */
  selectedWorldbooks: z.array(worldbookSelectionSchema).optional(),
  /** Pre-classified worldbook entries — used as knowledge base for world generation. */
  worldbookEntries: z.array(z.object({
    name: z.string(),
    type: z.enum(["character", "location", "faction", "bestiary", "lore_general"]),
    summary: z.string(),
  })).optional(),
});

const ipContextSchema = z.object({
  franchise: z.string(),
  keyFacts: z.array(z.string()),
  tonalNotes: z.array(z.string()),
  canonicalNames: z.object({
    locations: z.array(z.string()).optional(),
    factions: z.array(z.string()).optional(),
    characters: z.array(z.string()).optional(),
  }).optional(),
  excludedCharacters: z.array(z.string()).optional(),
  source: z.enum(["mcp", "llm"]),
  sourceGroups: z.array(z.object({
    sourceName: z.string(),
    priority: z.enum(["primary", "supplementary"]),
    keyFacts: z.array(z.string()),
    canonicalNames: z.object({
      locations: z.array(z.string()).optional(),
      factions: z.array(z.string()).optional(),
      characters: z.array(z.string()).optional(),
    }).optional(),
  })).optional(),
}).nullable().optional();

const premiseDivergenceSchema = z.object({
  mode: z.enum(["canonical", "coexisting", "diverged"]),
  protagonistRole: z.object({
    kind: z.enum(["canonical", "custom"]),
    interpretation: z.enum(["canonical", "replacement", "coexisting", "outsider", "unknown"]),
    canonicalCharacterName: z.string().nullable().optional(),
    roleSummary: z.string(),
  }),
  preservedCanonFacts: z.array(z.string()),
  changedCanonFacts: z.array(z.string()),
  currentStateDirectives: z.array(z.string()),
  ambiguityNotes: z.array(z.string()),
}).nullable().optional();

export const createCampaignSchema = createCampaignBaseSchema.extend({
  ipContext: ipContextSchema,
  premiseDivergence: premiseDivergenceSchema,
  worldbookSelection: z.array(worldbookSelectionSchema).optional(),
});

export const suggestSeedSchema = z.object({
  premise: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "premise is required.")),
  category: seedCategorySchema,
  ipContext: ipContextSchema,
  premiseDivergence: premiseDivergenceSchema,
});

export const generateWorldSchema = z.object({
  campaignId: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "campaignId is required.")),
  ipContext: ipContextSchema,
  premiseDivergence: premiseDivergenceSchema,
});

export const testProviderSchema = z.object({
  baseUrl: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "baseUrl is required.")),
  model: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "model is required.")),
  apiKey: z.string().default(""),
});

export const testRoleSchema = z.object({
  role: z.enum(["judge", "storyteller", "generator"]),
  providers: z.array(providerSchema).min(1, '"providers" must be a non-empty array.'),
  roles: z.record(z.string(), roleConfigSchema),
});

const characterRoleSchema = z.enum(["player", "npc"]);
const characterTierSchema = z.enum([
  "temporary",
  "supporting",
  "persistent",
  "key",
]);
const canonicalStatusSchema = z.enum([
  "original",
  "imported",
  "known_ip_canonical",
  "known_ip_diverged",
]);
const sourceKindSchema = z.enum([
  "player-input",
  "generator",
  "archetype",
  "import",
  "worldgen",
  "runtime",
  "migration",
]);
const importModeSchema = z.enum(["native", "outsider"]);
const characterSkillTierSchema = z.enum(CHARACTER_SKILL_TIERS);
const characterWealthTierSchema = z.enum(CHARACTER_WEALTH_TIERS);

const characterRelationshipRefSchema = z.object({
  entityId: z.string().nullable(),
  entityName: z.string().default(""),
  type: z.string().default(""),
  reason: z.string().default(""),
});

const characterIdentityDraftSchema = z.object({
  role: characterRoleSchema,
  tier: characterTierSchema,
  displayName: z.string().min(1),
  canonicalStatus: canonicalStatusSchema,
});

const characterProfileSchema = z.object({
  species: z.string().default(""),
  gender: z.string().default(""),
  ageText: z.string().default(""),
  appearance: z.string().default(""),
  backgroundSummary: z.string().default(""),
  personaSummary: z.string().default(""),
});

const characterSocialContextSchema = z.object({
  factionId: z.string().nullable(),
  factionName: z.string().nullable(),
  homeLocationId: z.string().nullable(),
  homeLocationName: z.string().nullable(),
  currentLocationId: z.string().nullable(),
  currentLocationName: z.string().nullable(),
  relationshipRefs: z.array(characterRelationshipRefSchema).default([]),
  socialStatus: z.array(z.string()).default([]),
  originMode: z.enum(["native", "outsider", "resident", "unknown"]).nullable(),
});

const characterSkillSchema = z.object({
  name: z.string().min(1),
  tier: characterSkillTierSchema.nullable(),
});

const characterMotivationsSchema = z.object({
  shortTermGoals: z.array(z.string()).default([]),
  longTermGoals: z.array(z.string()).default([]),
  beliefs: z.array(z.string()).default([]),
  drives: z.array(z.string()).default([]),
  frictions: z.array(z.string()).default([]),
});

const characterCapabilitiesSchema = z.object({
  traits: z.array(z.string()).default([]),
  skills: z.array(characterSkillSchema).default([]),
  flaws: z.array(z.string()).default([]),
  specialties: z.array(z.string()).default([]),
  wealthTier: characterWealthTierSchema.nullable(),
});

const characterStateSchema = z.object({
  hp: z.number().int().min(1).max(5),
  conditions: z.array(z.string()).default([]),
  statusFlags: z.array(z.string()).default([]),
  activityState: z.string().default("idle"),
});

export const characterLoadoutSchema = z.object({
  inventorySeed: z.array(z.string()).default([]),
  equippedItemRefs: z.array(z.string()).default([]),
  currencyNotes: z.string().default(""),
  signatureItems: z.array(z.string()).default([]),
});

export const characterStartConditionsSchema = z.object({
  startLocationId: z.string().nullable().optional(),
  arrivalMode: z.string().nullable().optional(),
  immediateSituation: z.string().nullable().optional(),
  entryPressure: z.array(z.string()).optional(),
  companions: z.array(z.string()).optional(),
  startingVisibility: z.string().nullable().optional(),
  resolvedNarrative: z.string().nullable().optional(),
  sourcePrompt: z.string().nullable().optional(),
});

export const personaTemplatePatchSchema = z.object({
  profile: characterProfileSchema.partial().optional(),
  socialContext: characterSocialContextSchema.partial().optional(),
  motivations: characterMotivationsSchema.partial().optional(),
  capabilities: characterCapabilitiesSchema.partial().optional(),
  state: characterStateSchema.partial().optional(),
  loadout: characterLoadoutSchema.partial().optional(),
  startConditions: characterStartConditionsSchema.partial().optional(),
  provenance: z.object({
    templateId: z.string().nullable().optional(),
    archetypePrompt: z.string().nullable().optional(),
    worldgenOrigin: z.string().nullable().optional(),
  }).partial().optional(),
}).strip();

const personaTemplateRoleScopeSchema = z.enum(["player", "npc", "any"]);

export const personaTemplateSummarySchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  name: z.string().trim().min(1),
  description: z.string().default(""),
  roleScope: personaTemplateRoleScopeSchema.default("any"),
  tags: z.array(z.string()).default([]),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).strip() satisfies z.ZodType<PersonaTemplateSummary>;

export const personaTemplateSchema = personaTemplateSummarySchema.extend({
  patch: personaTemplatePatchSchema,
}).strip() satisfies z.ZodType<PersonaTemplate>;

export const createPersonaTemplateSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().trim().min(1),
  description: z.string().default(""),
  roleScope: personaTemplateRoleScopeSchema.default("any"),
  tags: z.array(z.string()).default([]),
  patch: personaTemplatePatchSchema,
}).strip();

export const updatePersonaTemplateSchema = z.object({
  campaignId: z.string().min(1),
  templateId: z.string().min(1),
  patch: z.object({
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    roleScope: personaTemplateRoleScopeSchema.optional(),
    tags: z.array(z.string()).optional(),
    patch: personaTemplatePatchSchema.optional(),
  }).strip(),
}).strip();

export const applyPersonaTemplateSchema = z.object({
  campaignId: z.string().min(1),
  templateId: z.string().min(1),
  draft: z.lazy(() => characterDraftSchema),
}).strip();

export const previewCanonicalLoadoutSchema = z.object({
  campaignId: z.string().min(1),
  draft: z.lazy(() => characterDraftSchema),
}).strip();

const canonicalLoadoutItemSpecSchema = z.object({
  name: z.string().min(1),
  slot: z.enum(["equipped", "pack", "signature"]),
  tags: z.array(z.string()).default([]),
  quantity: z.number().int().positive().default(1),
  reason: z.string().min(1),
}).strip();

export const canonicalLoadoutPreviewSchema = z.object({
  loadout: characterLoadoutSchema,
  items: z.array(canonicalLoadoutItemSpecSchema),
  audit: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
}).strip() satisfies z.ZodType<CanonicalLoadoutPreview>;

export const resolvedStartConditionsSchema = z.object({
  locationId: z.string().min(1),
  locationName: z.string().min(1),
  startConditions: characterStartConditionsSchema,
  narrative: z.string().nullable(),
}).strip() satisfies z.ZodType<ResolvedStartConditions>;

const characterProvenanceSchema = z.object({
  sourceKind: sourceKindSchema,
  importMode: importModeSchema.nullable(),
  templateId: z.string().nullable(),
  archetypePrompt: z.string().nullable(),
  worldgenOrigin: z.string().nullable(),
  legacyTags: z.array(z.string()).default([]),
});

export const characterDraftSchema = z.object({
  identity: characterIdentityDraftSchema,
  profile: characterProfileSchema,
  socialContext: characterSocialContextSchema,
  motivations: characterMotivationsSchema,
  capabilities: characterCapabilitiesSchema,
  state: characterStateSchema,
  loadout: characterLoadoutSchema,
  startConditions: characterStartConditionsSchema.default({}),
  provenance: characterProvenanceSchema,
});

export const characterRecordSchema = characterDraftSchema.extend({
  identity: characterIdentityDraftSchema.extend({
    id: z.string().min(1),
    campaignId: z.string().min(1),
  }),
});

const legacyCharacterSchema = z.object({
  name: z.string().min(1),
  race: z.string().max(100).default(""),
  gender: z.string().max(100).default(""),
  age: z.string().max(100).default(""),
  appearance: z.string().max(1000).default(""),
  tags: z.array(z.string()),
  hp: z.number().int().min(1).max(5),
  equippedItems: z.array(z.string()),
  locationName: z.string().min(1),
});

function materializeDraftRecord(
  campaignId: string,
  draft: z.infer<typeof characterDraftSchema>,
) {
  return createCharacterRecordFromDraft(draft, {
    id: `draft:${draft.identity.displayName || "character"}`,
    campaignId,
  });
}

function recordToDraft(
  record: z.infer<typeof characterRecordSchema>,
): z.infer<typeof characterDraftSchema> {
  const { id: _id, campaignId: _campaignId, ...identity } = record.identity;
  return {
    ...record,
    identity,
  };
}

function legacyCharacterToDraft(
  character: z.infer<typeof legacyCharacterSchema>,
) {
  return recordToDraft(
    fromLegacyPlayerRow(
      {
        id: "legacy-player",
        campaignId: "legacy-campaign",
        name: character.name,
        race: character.race,
        gender: character.gender,
        age: character.age,
        appearance: character.appearance,
        hp: character.hp,
        tags: JSON.stringify(character.tags),
        equippedItems: JSON.stringify(character.equippedItems),
        currentLocationId: null,
      },
      { currentLocationName: character.locationName },
    ),
  );
}

const scaffoldNpcLegacySchema = z.object({
  name: z.string(),
  persona: z.string(),
  tags: z.array(z.string()),
  goals: z.object({
    shortTerm: z.array(z.string()),
    longTerm: z.array(z.string()),
  }),
  locationName: z.string(),
  factionName: z.string().nullable(),
  tier: z.enum(["key", "supporting"]).optional(),
});

function legacyNpcToDraft(
  npc: z.infer<typeof scaffoldNpcLegacySchema>,
) {
  const scaffoldTier = npc.tier ?? "key";
  const draft = recordToDraft(
    fromLegacyNpcRow(
      {
        id: "legacy-npc",
        campaignId: "legacy-campaign",
        name: npc.name,
        persona: npc.persona,
        tags: JSON.stringify(npc.tags),
        tier: scaffoldTier === "key" ? "key" : "persistent",
        currentLocationId: null,
        goals: JSON.stringify({
          short_term: npc.goals.shortTerm,
          long_term: npc.goals.longTerm,
        }),
        beliefs: "[]",
        unprocessedImportance: 0,
        inactiveTicks: 0,
        createdAt: 0,
      },
      {
        currentLocationName: npc.locationName,
        factionName: npc.factionName,
      },
    ),
  );

  return {
    ...draft,
    identity: {
      ...draft.identity,
      tier: scaffoldTier === "key" ? "key" : "supporting",
    },
  };
}

// --- World review schemas ---

const regenerateSectionBaseSchema = z.object({
  campaignId: z.string().min(1),
  additionalInstruction: z.string().optional(),
});

export const regenerateSectionSchema = z.discriminatedUnion("section", [
  regenerateSectionBaseSchema.extend({
    section: z.literal("premise"),
  }),
  regenerateSectionBaseSchema.extend({
    section: z.literal("locations"),
    refinedPremise: z.string().min(1),
  }),
  regenerateSectionBaseSchema.extend({
    section: z.literal("factions"),
    refinedPremise: z.string().min(1),
    locationNames: z.array(z.string()),
  }),
  regenerateSectionBaseSchema.extend({
    section: z.literal("npcs"),
    refinedPremise: z.string().min(1),
    locationNames: z.array(z.string()),
    factionNames: z.array(z.string()),
  }),
]);

const scaffoldLocationSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  isStarting: z.boolean(),
  connectedTo: z.array(z.string()),
});

const scaffoldFactionSchema = z.object({
  name: z.string(),
  tags: z.array(z.string()),
  goals: z.array(z.string()),
  assets: z.array(z.string()),
  territoryNames: z.array(z.string()),
});

const scaffoldNpcSchema = z
  .union([
    scaffoldNpcLegacySchema,
    scaffoldNpcLegacySchema.extend({
      draft: characterDraftSchema,
    }),
    z.object({
      draft: characterDraftSchema,
      locationName: z.string().optional(),
      factionName: z.string().nullable().optional(),
      tier: z.enum(["key", "supporting"]).optional(),
    }),
  ])
  .transform((input) => {
    if ("draft" in input) {
      const legacy = toLegacyNpcDraft(
        materializeDraftRecord("draft-campaign", input.draft),
      );
      return {
        ...legacy,
        locationName: input.locationName ?? legacy.locationName,
        factionName: input.factionName ?? legacy.factionName,
        tier: input.tier ?? legacy.tier,
        draft: input.draft,
      };
    }

    const tier = input.tier ?? "key";
    return {
      ...input,
      tier,
      draft: legacyNpcToDraft({
        ...input,
        tier,
      }),
    };
  });

export const saveEditsSchema = z.object({
  campaignId: z.string().min(1),
  scaffold: z.object({
    refinedPremise: z.string().min(1),
    locations: z.array(scaffoldLocationSchema).min(1),
    factions: z.array(scaffoldFactionSchema),
    npcs: z.array(scaffoldNpcSchema),
    loreCards: z.array(z.object({
      term: z.string(),
      definition: z.string(),
      category: z.enum(LORE_CATEGORIES),
    })),
  }),
});

export const loreCardUpdateSchema = z.object({
  term: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "term is required.")),
  definition: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "definition is required.")),
  category: z.enum(LORE_CATEGORIES),
});

// --- Character save schema ---

export const saveCharacterSchema = z.object({
  campaignId: z.string().min(1),
  character: legacyCharacterSchema,
}).or(
  z.object({
    campaignId: z.string().min(1),
    draft: characterDraftSchema,
  }),
).transform((input) => {
  if ("draft" in input) {
    return {
      campaignId: input.campaignId,
      draft: input.draft,
      character: toLegacyPlayerCharacter(
        materializeDraftRecord(input.campaignId, input.draft),
      ),
    };
  }

  return {
    campaignId: input.campaignId,
    character: input.character,
    draft: legacyCharacterToDraft(input.character),
  };
});

// ───── Unified character/NPC endpoints ─────

const roleField = z.enum(["player", "key"]).default("player");

/** Shared fields and refinement for all character/NPC creation schemas. */
const characterRoleFields = {
  role: roleField,
  locationNames: z.array(z.string()).optional(),
  factionNames: z.array(z.string()).optional(),
} as const;

const keyRoleLocationRefine = {
  refinement: (d: { role: string; locationNames?: string[] }) =>
    d.role === "player" || (d.locationNames != null && d.locationNames.length > 0),
  options: { message: "locationNames required when role is 'key'.", path: ["locationNames"] as string[] },
};

export const parseCharacterSchema = z.object({
  campaignId: z.string().min(1),
  concept: z.string().trim().min(1, "Character concept is required.").max(2000),
  ...characterRoleFields,
}).refine(keyRoleLocationRefine.refinement, keyRoleLocationRefine.options);

export const generateCharacterSchema = z.object({
  campaignId: z.string().min(1),
  ...characterRoleFields,
}).refine(keyRoleLocationRefine.refinement, keyRoleLocationRefine.options);

export const researchCharacterSchema = z.object({
  campaignId: z.string().min(1),
  archetype: z.string().trim().min(1, "Archetype is required.").max(500),
  ...characterRoleFields,
}).refine(keyRoleLocationRefine.refinement, keyRoleLocationRefine.options);

export const importV2CardSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  personality: z.string().default(""),
  scenario: z.string().default(""),
  tags: z.array(z.string()).default([]),
  importMode: z.enum(["native", "outsider"]).default("native"),
  ...characterRoleFields,
}).refine(keyRoleLocationRefine.refinement, keyRoleLocationRefine.options);

export const resolveStartingLocationSchema = z.object({
  campaignId: z.string().min(1),
  prompt: z.string().max(500).optional(),
});

// --- Checkpoint schema ---

export const createCheckpointSchema = z.object({
  name: z.string().max(60).optional(),
  description: z.string().max(200).optional(),
});

// --- NPC promotion schema ---

export const promoteNpcBodySchema = z.object({
  newTier: z.enum(["persistent", "key"]),
});

// --- Chat control schemas ---

export const chatEditBodySchema = z.object({
  messageIndex: z.number().int().min(0),
  newContent: z.string().min(1),
});

// --- Image generation schema ---

export const imageGenerateSchema = z.object({
  campaignId: z.string().min(1),
  type: z.enum(["portrait", "location", "scene"]),
  entityId: z.string().min(1).max(128),
  prompt: z.string().min(1).max(4000),
});

// --- WorldBook import schemas ---

export const parseWorldBookSchema = z.object({
  campaignId: z.string().min(1).optional(),
  worldbook: z.object({
    entries: z.record(z.string(), z.object({
      comment: z.string().default(""),
      content: z.string(),
      name: z.string().optional(),
    }).passthrough()),
  }).passthrough(),
});

export const worldbookLibraryImportSchema = z.object({
  displayName: z.string().trim().optional(),
  originalFileName: z.string().trim().optional(),
  worldbook: parseWorldBookSchema.shape.worldbook,
});

export const importWorldBookSchema = z.object({
  campaignId: z.string().min(1),
  entries: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(WORLDBOOK_ENTRY_TYPES),
    summary: z.string().min(1),
  })),
});

