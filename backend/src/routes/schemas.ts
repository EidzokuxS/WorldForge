import { z } from "zod";
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
  intent: z.string().min(1).max(200),
  method: z.string().max(200).default(""),
});

export const createCampaignSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Campaign name is required.")),
  premise: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Campaign premise is required.")),
  seeds: worldSeedsSchema.optional(),
});

export const rollSeedSchema = z.object({
  category: seedCategorySchema,
});

export const suggestSeedsSchema = z.object({
  premise: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "premise is required.")),
});

export const suggestSeedSchema = z.object({
  premise: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "premise is required.")),
  category: seedCategorySchema,
});

export const generateWorldSchema = z.object({
  campaignId: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "campaignId is required.")),
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

const scaffoldNpcSchema = z.object({
  name: z.string(),
  persona: z.string(),
  tags: z.array(z.string()),
  goals: z.object({
    shortTerm: z.array(z.string()),
    longTerm: z.array(z.string()),
  }),
  locationName: z.string(),
  factionName: z.string().nullable(),
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

// --- Character save schema ---

export const saveCharacterSchema = z.object({
  campaignId: z.string().min(1),
  character: z.object({
    name: z.string().min(1),
    race: z.string().max(100).default(""),
    gender: z.string().max(100).default(""),
    age: z.string().max(100).default(""),
    appearance: z.string().max(1000).default(""),
    tags: z.array(z.string()),
    hp: z.number().int().min(1).max(5),
    equippedItems: z.array(z.string()),
    locationName: z.string().min(1),
  }),
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
  description: z.string().min(1).max(8000),
  personality: z.string().max(4000).default(""),
  scenario: z.string().max(4000).default(""),
  tags: z.array(z.string()).default([]),
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
  campaignId: z.string().min(1),
  worldbook: z.object({
    entries: z.record(z.string(), z.object({
      comment: z.string(),
      content: z.string(),
    }).passthrough()),
  }).passthrough(),
});

export const importWorldBookSchema = z.object({
  campaignId: z.string().min(1),
  entries: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(WORLDBOOK_ENTRY_TYPES),
    summary: z.string().min(1),
  })),
});

