import type { Context } from "hono";
import { z } from "zod";

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

const LORE_CATEGORIES = [
  "location",
  "npc",
  "faction",
  "ability",
  "rule",
  "concept",
  "item",
  "event",
] as const;

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

// --- Character creation schemas ---

export const parseCharacterSchema = z.object({
  campaignId: z.string().min(1),
  description: z.string().trim().min(1, "Character description is required.").max(2000, "Character description is too long (max 2000 characters)."),
});

export const generateCharacterSchema = z.object({
  campaignId: z.string().min(1),
});

export const saveCharacterSchema = z.object({
  campaignId: z.string().min(1),
  character: z.object({
    name: z.string().min(1),
    tags: z.array(z.string()),
    hp: z.number().int().min(1).max(5),
    equippedItems: z.array(z.string()),
    locationName: z.string().min(1),
  }),
});

// Utility: extract first Zod error message
export function zodFirstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation failed.";
}

/**
 * Parse a JSON request body and validate it against a Zod schema.
 * Returns `{ data }` on success or a ready-made Hono JSON error response.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T
): Promise<{ data: z.infer<T> } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { response: c.json({ error: "Invalid JSON body." }, 400) };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { response: c.json({ error: zodFirstError(parsed.error) }, 400) };
  }

  return { data: parsed.data as z.infer<T> };
}
