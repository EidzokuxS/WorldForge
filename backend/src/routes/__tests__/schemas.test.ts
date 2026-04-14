import { describe, it, expect } from "vitest";
import { z } from "zod";
import type {
  CharacterGroundingProfile,
  PowerProfile,
} from "@worldforge/shared";
import {
  chatBodySchema,
  seedCategorySchema,
  settingsPayloadSchema,
  worldSeedsSchema,
  createCampaignSchema,
  rollSeedSchema,
  suggestSeedsSchema,
  suggestSeedSchema,
  generateWorldSchema,
  testProviderSchema,
  testRoleSchema,
  parseCharacterSchema,
  generateCharacterSchema,
  researchCharacterSchema,
  importV2CardSchema,
  characterDraftSchema,
  characterRecordSchema,
  saveCharacterSchema,
  saveEditsSchema,
  resolveStartingLocationSchema,
  personaTemplateSchema,
  personaTemplateSummarySchema,
  personaTemplatePatchSchema,
  createPersonaTemplateSchema,
  updatePersonaTemplateSchema,
  applyPersonaTemplateSchema,
  resolvedStartConditionsSchema,
  canonicalLoadoutPreviewSchema,
} from "../schemas.js";
import { parseBody, zodFirstError } from "../helpers.js";
import { npcs, players } from "../../db/schema.js";

// ---------------------------------------------------------------------------
// seedCategorySchema
// ---------------------------------------------------------------------------
describe("seedCategorySchema", () => {
  const validCategories = [
    "geography",
    "politicalStructure",
    "centralConflict",
    "culturalFlavor",
    "environment",
    "wildcard",
  ] as const;

  describe("accepts all valid seed categories", () => {
    for (const category of validCategories) {
      it(`accepts "${category}"`, () => {
        const result = seedCategorySchema.safeParse(category);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(category);
        }
      });
    }
  });

  describe("rejects invalid values", () => {
    it("rejects an unknown string", () => {
      const result = seedCategorySchema.safeParse("magic");
      expect(result.success).toBe(false);
    });

    it("rejects an empty string", () => {
      const result = seedCategorySchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("rejects a misspelled category", () => {
      const result = seedCategorySchema.safeParse("geographi");
      expect(result.success).toBe(false);
    });

    it("rejects a category with wrong casing", () => {
      const result = seedCategorySchema.safeParse("Geography");
      expect(result.success).toBe(false);
    });

  });
});

// ---------------------------------------------------------------------------
// worldSeedsSchema
// ---------------------------------------------------------------------------
describe("worldSeedsSchema", () => {
  describe("rejects objects with no non-empty seed values", () => {
    it("rejects an empty object", () => {
      const result = worldSeedsSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes("At least one seed"))).toBe(true);
      }
    });

    it("rejects an object where all string fields are empty", () => {
      const result = worldSeedsSchema.safeParse({
        geography: "",
        politicalStructure: "",
        centralConflict: "",
        environment: "",
        wildcard: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an object where all string fields are whitespace-only", () => {
      const result = worldSeedsSchema.safeParse({
        geography: "   ",
        politicalStructure: "\t",
        centralConflict: " \n ",
      });
      expect(result.success).toBe(false);
    });

    it("rejects when culturalFlavor is an empty array and all strings are empty", () => {
      const result = worldSeedsSchema.safeParse({
        geography: "",
        culturalFlavor: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects when all fields are undefined (explicit)", () => {
      const result = worldSeedsSchema.safeParse({
        geography: undefined,
        politicalStructure: undefined,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("accepts objects with at least one non-empty seed value", () => {
    it("accepts when only geography is set", () => {
      const result = worldSeedsSchema.safeParse({ geography: "mountains" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.geography).toBe("mountains");
      }
    });

    it("accepts when only politicalStructure is set", () => {
      const result = worldSeedsSchema.safeParse({ politicalStructure: "feudal monarchy" });
      expect(result.success).toBe(true);
    });

    it("accepts when only centralConflict is set", () => {
      const result = worldSeedsSchema.safeParse({ centralConflict: "civil war" });
      expect(result.success).toBe(true);
    });

    it("accepts when only environment is set", () => {
      const result = worldSeedsSchema.safeParse({ environment: "tundra" });
      expect(result.success).toBe(true);
    });

    it("accepts when only wildcard is set", () => {
      const result = worldSeedsSchema.safeParse({ wildcard: "sentient animals" });
      expect(result.success).toBe(true);
    });

    it("accepts when only culturalFlavor has items", () => {
      const result = worldSeedsSchema.safeParse({ culturalFlavor: ["samurai culture"] });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.culturalFlavor).toEqual(["samurai culture"]);
      }
    });

    it("accepts when culturalFlavor has multiple items", () => {
      const result = worldSeedsSchema.safeParse({
        culturalFlavor: ["feudal Japan", "steam-powered tech"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.culturalFlavor).toHaveLength(2);
      }
    });

    it("accepts a fully populated object", () => {
      const result = worldSeedsSchema.safeParse({
        geography: "archipelago",
        politicalStructure: "city-states",
        centralConflict: "trade war",
        culturalFlavor: ["maritime", "mercantile"],
        environment: "tropical",
        wildcard: "dragons",
      });
      expect(result.success).toBe(true);
    });

    it("accepts when one string is non-empty alongside empty strings", () => {
      const result = worldSeedsSchema.safeParse({
        geography: "",
        politicalStructure: "",
        centralConflict: "dragon invasion",
        environment: "",
      });
      expect(result.success).toBe(true);
    });

    it("accepts when culturalFlavor has items but all strings are empty", () => {
      const result = worldSeedsSchema.safeParse({
        geography: "",
        culturalFlavor: ["viking"],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("handles culturalFlavor type constraints", () => {
    it("rejects culturalFlavor when it is a plain string", () => {
      const result = worldSeedsSchema.safeParse({
        culturalFlavor: "should be array",
      });
      expect(result.success).toBe(false);
    });

    it("rejects culturalFlavor when it contains non-strings", () => {
      const result = worldSeedsSchema.safeParse({
        culturalFlavor: [123, true],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("strips unknown fields", () => {
    it("does not include unknown top-level fields in the output", () => {
      const result = worldSeedsSchema.safeParse({
        geography: "plains",
        unknownField: "should vanish",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty("unknownField");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// createCampaignSchema
// ---------------------------------------------------------------------------
describe("createCampaignSchema", () => {
  describe("accepts valid inputs", () => {
    it("accepts a minimal valid object", () => {
      const result = createCampaignSchema.safeParse({
        name: "My Campaign",
        premise: "A dark world awaits",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("My Campaign");
        expect(result.data.premise).toBe("A dark world awaits");
        expect(result.data.seeds).toBeUndefined();
      }
    });

    it("accepts an object with seeds", () => {
      const result = createCampaignSchema.safeParse({
        name: "Seeded Campaign",
        premise: "Interesting premise",
        seeds: { geography: "desert" },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.seeds).toBeDefined();
        expect(result.data.seeds!.geography).toBe("desert");
      }
    });

    it("accepts without seeds field at all", () => {
      const result = createCampaignSchema.safeParse({
        name: "No seeds",
        premise: "Quick start",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.seeds).toBeUndefined();
      }
    });
  });

  describe("trims whitespace from name and premise", () => {
    it("trims leading and trailing whitespace from name", () => {
      const result = createCampaignSchema.safeParse({
        name: "  My Campaign  ",
        premise: "A premise",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("My Campaign");
      }
    });

    it("trims leading and trailing whitespace from premise", () => {
      const result = createCampaignSchema.safeParse({
        name: "Campaign",
        premise: "  A dark world  ",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.premise).toBe("A dark world");
      }
    });

    it("trims tabs and newlines", () => {
      const result = createCampaignSchema.safeParse({
        name: "\tTabbed\n",
        premise: "\nNewlined\t",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Tabbed");
        expect(result.data.premise).toBe("Newlined");
      }
    });
  });

  describe("rejects invalid inputs", () => {
    it("rejects empty name", () => {
      const result = createCampaignSchema.safeParse({
        name: "",
        premise: "Valid premise",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const nameIssue = result.error.issues.find((i) =>
          i.path.includes("name")
        );
        expect(nameIssue).toBeDefined();
        expect(nameIssue!.message).toBe("Campaign name is required.");
      }
    });

    it("rejects whitespace-only name", () => {
      const result = createCampaignSchema.safeParse({
        name: "   ",
        premise: "Valid premise",
      });
      expect(result.success).toBe(false);
    });

    it("accepts empty premise because worldbook can provide the context", () => {
      const result = createCampaignSchema.safeParse({
        name: "Valid name",
        premise: "",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.premise).toBe("");
      }
    });

    it("normalizes whitespace-only premise to empty string", () => {
      const result = createCampaignSchema.safeParse({
        name: "Valid name",
        premise: "   ",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.premise).toBe("");
      }
    });

    it("rejects missing name field", () => {
      const result = createCampaignSchema.safeParse({
        premise: "Valid premise",
      });
      expect(result.success).toBe(false);
    });

    it("defaults missing premise field to empty string", () => {
      const result = createCampaignSchema.safeParse({
        name: "Valid name",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.premise).toBe("");
      }
    });

    it("rejects non-string premise", () => {
      const result = createCampaignSchema.safeParse({
        name: "Valid name",
        premise: false,
      });
      expect(result.success).toBe(false);
    });

    it("rejects when both name and premise are empty", () => {
      const result = createCampaignSchema.safeParse({
        name: "",
        premise: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("seeds validation within createCampaignSchema", () => {
    it("rejects seeds that are an empty object (no non-empty value)", () => {
      const result = createCampaignSchema.safeParse({
        name: "Campaign",
        premise: "Premise",
        seeds: {},
      });
      expect(result.success).toBe(false);
    });

    it("accepts seeds with at least one non-empty value", () => {
      const result = createCampaignSchema.safeParse({
        name: "Campaign",
        premise: "Premise",
        seeds: { wildcard: "time travel" },
      });
      expect(result.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// rollSeedSchema
// ---------------------------------------------------------------------------
describe("rollSeedSchema", () => {
  describe("accepts valid categories", () => {
    const categories = [
      "geography",
      "politicalStructure",
      "centralConflict",
      "culturalFlavor",
      "environment",
      "wildcard",
    ] as const;

    for (const category of categories) {
      it(`accepts { category: "${category}" }`, () => {
        const result = rollSeedSchema.safeParse({ category });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.category).toBe(category);
        }
      });
    }
  });

  describe("rejects invalid categories", () => {
    it("rejects an unknown category string", () => {
      const result = rollSeedSchema.safeParse({ category: "unknown" });
      expect(result.success).toBe(false);
    });

    it("rejects an empty string category", () => {
      const result = rollSeedSchema.safeParse({ category: "" });
      expect(result.success).toBe(false);
    });

    it("rejects a missing category field", () => {
      const result = rollSeedSchema.safeParse({});
      expect(result.success).toBe(false);
    });

  });
});

// ---------------------------------------------------------------------------
// suggestSeedsSchema
// ---------------------------------------------------------------------------
describe("suggestSeedsSchema", () => {
  describe("accepts valid inputs", () => {
    it("accepts a non-empty premise", () => {
      const result = suggestSeedsSchema.safeParse({ premise: "A world of magic" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.premise).toBe("A world of magic");
      }
    });

    it("trims whitespace from premise", () => {
      const result = suggestSeedsSchema.safeParse({ premise: "  space opera  " });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.premise).toBe("space opera");
      }
    });
  });

  describe("rejects invalid inputs", () => {
    it("accepts empty premise and falls back later in the route", () => {
      const result = suggestSeedsSchema.safeParse({ premise: "" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.premise).toBe("");
      }
    });

    it("normalizes whitespace-only premise to empty string", () => {
      const result = suggestSeedsSchema.safeParse({ premise: "   " });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.premise).toBe("");
      }
    });

    it("defaults missing premise field to empty string", () => {
      const result = suggestSeedsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.premise).toBe("");
      }
    });

  });
});

// ---------------------------------------------------------------------------
// suggestSeedSchema
// ---------------------------------------------------------------------------
describe("suggestSeedSchema", () => {
  describe("accepts valid inputs", () => {
    it("accepts a valid premise and category", () => {
      const result = suggestSeedSchema.safeParse({
        premise: "Fantasy world",
        category: "geography",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.premise).toBe("Fantasy world");
        expect(result.data.category).toBe("geography");
      }
    });

    it("trims whitespace from premise", () => {
      const result = suggestSeedSchema.safeParse({
        premise: "  trimmed  ",
        category: "wildcard",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.premise).toBe("trimmed");
      }
    });

    it("accepts all valid category values", () => {
      const categories = [
        "geography",
        "politicalStructure",
        "centralConflict",
        "culturalFlavor",
        "environment",
        "wildcard",
      ] as const;

      for (const category of categories) {
        const result = suggestSeedSchema.safeParse({
          premise: "Some premise",
          category,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("rejects invalid inputs", () => {
    it("rejects empty premise with valid category", () => {
      const result = suggestSeedSchema.safeParse({
        premise: "",
        category: "geography",
      });
      expect(result.success).toBe(false);
    });

    it("rejects whitespace-only premise", () => {
      const result = suggestSeedSchema.safeParse({
        premise: "   ",
        category: "geography",
      });
      expect(result.success).toBe(false);
    });

    it("rejects valid premise with invalid category", () => {
      const result = suggestSeedSchema.safeParse({
        premise: "Valid premise",
        category: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing premise", () => {
      const result = suggestSeedSchema.safeParse({
        category: "geography",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing category", () => {
      const result = suggestSeedSchema.safeParse({
        premise: "Valid premise",
      });
      expect(result.success).toBe(false);
    });

    it("rejects entirely empty object", () => {
      const result = suggestSeedSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// generateWorldSchema
// ---------------------------------------------------------------------------
describe("generateWorldSchema", () => {
  describe("accepts valid inputs", () => {
    it("accepts a non-empty campaignId", () => {
      const result = generateWorldSchema.safeParse({
        campaignId: "abc-123-def",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.campaignId).toBe("abc-123-def");
      }
    });

    it("trims whitespace from campaignId", () => {
      const result = generateWorldSchema.safeParse({
        campaignId: "  uuid-456  ",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.campaignId).toBe("uuid-456");
      }
    });

    it("accepts optional premiseDivergence beside ipContext", () => {
      const result = generateWorldSchema.safeParse({
        campaignId: "abc-123-def",
        ipContext: {
          franchise: "Voices of the Void",
          keyFacts: ["The signal base sits in a remote valley."],
          tonalNotes: ["lonely"],
          source: "mcp",
        },
        premiseDivergence: {
          mode: "diverged",
          protagonistRole: {
            kind: "custom",
            interpretation: "replacement",
            canonicalCharacterName: "Dr. Kel",
            roleSummary: "The player's custom character replaces Dr. Kel in the active role.",
          },
          preservedCanonFacts: ["The signal base remains active."],
          changedCanonFacts: ["Dr. Kel is no longer the active protagonist."],
          currentStateDirectives: ["Treat the player as the new arrival to the station."],
          ambiguityNotes: [],
        },
      });
      expect(result.success).toBe(true);
    });

    it("remains backward compatible with requests that only send ipContext", () => {
      const result = generateWorldSchema.safeParse({
        campaignId: "abc-123-def",
        ipContext: {
          franchise: "Naruto",
          keyFacts: ["Konohagakure is a hidden village."],
          tonalNotes: ["shonen"],
          source: "mcp",
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("rejects invalid inputs", () => {
    it("rejects empty campaignId", () => {
      const result = generateWorldSchema.safeParse({ campaignId: "" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("campaignId is required.");
      }
    });

    it("rejects whitespace-only campaignId", () => {
      const result = generateWorldSchema.safeParse({ campaignId: "   " });
      expect(result.success).toBe(false);
    });

    it("rejects missing campaignId field", () => {
      const result = generateWorldSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects null campaignId", () => {
      const result = generateWorldSchema.safeParse({ campaignId: null });
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// testProviderSchema
// ---------------------------------------------------------------------------
describe("testProviderSchema", () => {
  describe("accepts valid inputs", () => {
    it("accepts a complete valid object", () => {
      const result = testProviderSchema.safeParse({
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4",
        apiKey: "sk-test-key",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.baseUrl).toBe("https://api.openai.com/v1");
        expect(result.data.model).toBe("gpt-4");
        expect(result.data.apiKey).toBe("sk-test-key");
      }
    });

    it("defaults apiKey to empty string when omitted", () => {
      const result = testProviderSchema.safeParse({
        baseUrl: "http://localhost:1234",
        model: "llama2",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.apiKey).toBe("");
      }
    });

    it("accepts empty apiKey explicitly", () => {
      const result = testProviderSchema.safeParse({
        baseUrl: "http://localhost:1234",
        model: "llama2",
        apiKey: "",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.apiKey).toBe("");
      }
    });
  });

  describe("trims whitespace from baseUrl and model", () => {
    it("trims baseUrl", () => {
      const result = testProviderSchema.safeParse({
        baseUrl: "  http://localhost:1234  ",
        model: "gpt-4",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.baseUrl).toBe("http://localhost:1234");
      }
    });

    it("trims model", () => {
      const result = testProviderSchema.safeParse({
        baseUrl: "http://localhost:1234",
        model: "  gpt-4  ",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.model).toBe("gpt-4");
      }
    });
  });

  describe("rejects invalid inputs", () => {
    it("rejects empty baseUrl", () => {
      const result = testProviderSchema.safeParse({
        baseUrl: "",
        model: "gpt-4",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("baseUrl is required.");
      }
    });

    it("rejects whitespace-only baseUrl", () => {
      const result = testProviderSchema.safeParse({
        baseUrl: "   ",
        model: "gpt-4",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty model", () => {
      const result = testProviderSchema.safeParse({
        baseUrl: "http://localhost:1234",
        model: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("model is required.");
      }
    });

    it("rejects whitespace-only model", () => {
      const result = testProviderSchema.safeParse({
        baseUrl: "http://localhost:1234",
        model: "   ",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing baseUrl", () => {
      const result = testProviderSchema.safeParse({
        model: "gpt-4",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing model", () => {
      const result = testProviderSchema.safeParse({
        baseUrl: "http://localhost:1234",
      });
      expect(result.success).toBe(false);
    });

  });
});

// ---------------------------------------------------------------------------
// testRoleSchema
// ---------------------------------------------------------------------------
describe("testRoleSchema", () => {
  // Helper to build a minimal valid input
  const validInput = (role: "judge" | "storyteller" | "generator" = "judge") => ({
    role,
    providers: [
      {
        id: "p1",
        name: "Provider",
        baseUrl: "http://localhost:1234",
        apiKey: "",
        defaultModel: "gpt-4",
      },
    ],
    roles: {
      judge: {
        providerId: "p1",
        model: "gpt-4",
        temperature: 0.3,
        maxTokens: 512,
      },
    },
  });

  describe("accepts valid inputs", () => {
    it("accepts a complete valid object with role 'judge'", () => {
      const result = testRoleSchema.safeParse(validInput());
      expect(result.success).toBe(true);
    });

    it("accepts role 'storyteller'", () => {
      const result = testRoleSchema.safeParse(validInput("storyteller"));
      expect(result.success).toBe(true);
    });

    it("accepts role 'generator'", () => {
      const result = testRoleSchema.safeParse(validInput("generator"));
      expect(result.success).toBe(true);
    });

    it("accepts providers with default values for missing fields", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        providers: [{}],
        roles: {},
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.providers[0]).toEqual({
          id: "",
          name: "",
          baseUrl: "",
          apiKey: "",
          defaultModel: "",
        });
      }
    });

    it("accepts an empty roles record", () => {
      const result = testRoleSchema.safeParse({
        role: "storyteller",
        providers: [{ id: "p1" }],
        roles: {},
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.roles).toEqual({});
      }
    });

    it("applies default temperature (0.8) and maxTokens (1024) in role configs", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        providers: [{ id: "p1" }],
        roles: {
          judge: { providerId: "p1" },
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.roles.judge!.temperature).toBe(0.8);
        expect(result.data.roles.judge!.maxTokens).toBe(1024);
      }
    });

    it("accepts multiple providers", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        providers: [
          { id: "p1", name: "First" },
          { id: "p2", name: "Second" },
        ],
        roles: {},
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.providers).toHaveLength(2);
      }
    });

    it("accepts multiple role configs in the roles record", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        providers: [{ id: "p1" }],
        roles: {
          judge: { providerId: "p1", temperature: 0.3 },
          storyteller: { providerId: "p1", temperature: 0.9 },
          generator: { providerId: "p1", temperature: 0.7 },
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Object.keys(result.data.roles)).toHaveLength(3);
      }
    });
  });

  describe("validates the role enum", () => {
    it("rejects an unknown role string", () => {
      const input = { ...validInput(), role: "narrator" };
      const result = testRoleSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects an empty role string", () => {
      const input = { ...validInput(), role: "" };
      const result = testRoleSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects a numeric role", () => {
      const input = { ...validInput(), role: 1 };
      const result = testRoleSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects role with wrong casing", () => {
      const input = { ...validInput(), role: "Judge" };
      const result = testRoleSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("validates the providers array", () => {
    it("rejects an empty providers array", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        providers: [],
        roles: {},
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const providerIssue = result.error.issues.find((i) =>
          i.message.includes("providers")
        );
        expect(providerIssue).toBeDefined();
      }
    });

    it("rejects missing providers field", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        roles: {},
      });
      expect(result.success).toBe(false);
    });

    it("rejects providers as a non-array", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        providers: "not an array",
        roles: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe("validates role config values in the roles record", () => {
    it("rejects non-integer maxTokens", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        providers: [{ id: "p1" }],
        roles: {
          judge: { providerId: "p1", maxTokens: 512.5 },
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-number temperature", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        providers: [{ id: "p1" }],
        roles: {
          judge: { providerId: "p1", temperature: "hot" },
        },
      });
      expect(result.success).toBe(false);
    });

    it("accepts model as optional (undefined)", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        providers: [{ id: "p1" }],
        roles: {
          judge: { providerId: "p1" },
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.roles.judge!.model).toBeUndefined();
      }
    });

    it("accepts model when provided as a string", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        providers: [{ id: "p1" }],
        roles: {
          judge: { providerId: "p1", model: "gpt-4" },
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.roles.judge!.model).toBe("gpt-4");
      }
    });
  });

  describe("handles missing required fields", () => {
    it("rejects missing role field", () => {
      const result = testRoleSchema.safeParse({
        providers: [{ id: "p1" }],
        roles: {},
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing roles field", () => {
      const result = testRoleSchema.safeParse({
        role: "judge",
        providers: [{ id: "p1" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects an entirely empty object", () => {
      const result = testRoleSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// zodFirstError
// ---------------------------------------------------------------------------
describe("zodFirstError", () => {
  it("extracts the first error message from a ZodError", () => {
    const result = z.string().min(5, "too short").safeParse("hi");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodFirstError(result.error)).toBe("too short");
    }
  });

  it("returns the first message when there are multiple issues", () => {
    const schema = z.object({
      a: z.string().min(1, "a is required"),
      b: z.string().min(1, "b is required"),
    });
    const result = schema.safeParse({ a: "", b: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      // First issue in order should be about "a"
      const msg = zodFirstError(result.error);
      expect(msg).toBe("a is required");
    }
  });

  it("returns fallback 'Validation failed.' for a ZodError with no issues", () => {
    // Construct a ZodError with an empty issues array (edge case)
    const emptyError = new z.ZodError([]);
    expect(zodFirstError(emptyError)).toBe("Validation failed.");
  });

  it("works with custom error messages from refine", () => {
    const schema = z.string().refine((s) => s.length > 3, {
      message: "Must be longer than 3 characters",
    });
    const result = schema.safeParse("ab");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodFirstError(result.error)).toBe("Must be longer than 3 characters");
    }
  });

  it("works with enum validation errors", () => {
    const schema = z.enum(["a", "b"]);
    const result = schema.safeParse("c");
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = zodFirstError(result.error);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it("works with nested object validation errors", () => {
    const schema = z.object({
      nested: z.object({
        value: z.number({ message: "Expected number" }),
      }),
    });
    const result = schema.safeParse({ nested: { value: "not a number" } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = zodFirstError(result.error);
      expect(msg).toBe("Expected number");
    }
  });
});

// ---------------------------------------------------------------------------
// chatBodySchema
// ---------------------------------------------------------------------------
describe("chatBodySchema", () => {
  it("accepts a valid playerAction", () => {
    const result = chatBodySchema.safeParse({ playerAction: "look around" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.playerAction).toBe("look around");
    }
  });

  it("trims whitespace from playerAction", () => {
    const result = chatBodySchema.safeParse({ playerAction: "  go north  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.playerAction).toBe("go north");
    }
  });

  it("rejects empty playerAction", () => {
    const result = chatBodySchema.safeParse({ playerAction: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only playerAction", () => {
    const result = chatBodySchema.safeParse({ playerAction: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects missing playerAction", () => {
    const result = chatBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// settingsPayloadSchema
// ---------------------------------------------------------------------------
describe("settingsPayloadSchema", () => {
  const validSettings = () => ({
    providers: [
      { id: "p1", name: "Test", baseUrl: "http://localhost", apiKey: "", defaultModel: "m1" },
    ],
    judge: { providerId: "p1", temperature: 0.3, maxTokens: 512 },
    storyteller: { providerId: "p1", temperature: 0.8, maxTokens: 1024 },
    generator: { providerId: "p1", temperature: 0.7, maxTokens: 2048 },
    embedder: { providerId: "p1", temperature: 0, maxTokens: 512 },
    images: { providerId: "p1", model: "dall-e", stylePrompt: "fantasy", enabled: false },
    research: { enabled: true, maxSearchSteps: 10 },
    ui: { showRawReasoning: false },
  });

  it("accepts a complete valid settings object", () => {
    const result = settingsPayloadSchema.safeParse(validSettings());
    expect(result.success).toBe(true);
  });

  it("strips extra properties", () => {
    const input = { ...validSettings(), customField: "extra" };
    const result = settingsPayloadSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("customField" in result.data).toBe(false);
    }
  });

  it("rejects missing providers", () => {
    const { providers: _, ...rest } = validSettings();
    const result = settingsPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing judge role", () => {
    const { judge: _, ...rest } = validSettings();
    const result = settingsPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing images config", () => {
    const { images: _, ...rest } = validSettings();
    const result = settingsPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects non-number temperature in role", () => {
    const input = validSettings();
    (input.judge as Record<string, unknown>).temperature = "hot";
    const result = settingsPayloadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean enabled in images", () => {
    const input = validSettings();
    (input.images as Record<string, unknown>).enabled = "yes";
    const result = settingsPayloadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("accepts providers with optional isBuiltin", () => {
    const input = validSettings();
    (input.providers[0] as Record<string, unknown>).isBuiltin = true;
    const result = settingsPayloadSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects missing research config", () => {
    const { research: _, ...rest } = validSettings();
    const result = settingsPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing embedder role", () => {
    const { embedder: _, ...rest } = validSettings();
    const result = settingsPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean research.enabled", () => {
    const input = validSettings();
    (input.research as Record<string, unknown>).enabled = "yes";
    const result = settingsPayloadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer research.maxSearchSteps", () => {
    const input = validSettings();
    (input.research as Record<string, unknown>).maxSearchSteps = 5.5;
    const result = settingsPayloadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects research.maxSearchSteps below 1", () => {
    const input = validSettings();
    (input.research as Record<string, unknown>).maxSearchSteps = 0;
    const result = settingsPayloadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects research.maxSearchSteps above 100", () => {
    const input = validSettings();
    (input.research as Record<string, unknown>).maxSearchSteps = 101;
    const result = settingsPayloadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("accepts research.maxSearchSteps at boundaries", () => {
    const input1 = validSettings();
    (input1.research as Record<string, unknown>).maxSearchSteps = 1;
    expect(settingsPayloadSchema.safeParse(input1).success).toBe(true);

    const input100 = validSettings();
    (input100.research as Record<string, unknown>).maxSearchSteps = 100;
    expect(settingsPayloadSchema.safeParse(input100).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseBody
// ---------------------------------------------------------------------------
describe("parseBody", () => {
  function mockContext(body: unknown, throwOnJson = false) {
    return {
      req: {
        json: async () => {
          if (throwOnJson) throw new Error("parse error");
          return body;
        },
      },
      json: (data: unknown, status?: number) =>
        ({ __data: data, __status: status ?? 200 }) as unknown as Response,
    } as Parameters<typeof parseBody>[0];
  }

  it("returns parsed data for valid body", async () => {
    const schema = z.object({ name: z.string() });
    const c = mockContext({ name: "hello" });
    const result = await parseBody(c, schema);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.name).toBe("hello");
    }
  });

  it("returns error response for invalid JSON", async () => {
    const schema = z.object({ name: z.string() });
    const c = mockContext(null, true);
    const result = await parseBody(c, schema);
    expect("response" in result).toBe(true);
    if ("response" in result) {
      const resp = result.response as unknown as { __data: { error: string }; __status: number };
      expect(resp.__status).toBe(400);
      expect(resp.__data.error).toBe("Invalid JSON body.");
    }
  });

  it("returns error response for schema validation failure", async () => {
    const schema = z.object({ name: z.string().min(1, "name required") });
    const c = mockContext({ name: "" });
    const result = await parseBody(c, schema);
    expect("response" in result).toBe(true);
    if ("response" in result) {
      const resp = result.response as unknown as { __data: { error: string }; __status: number };
      expect(resp.__status).toBe(400);
      expect(resp.__data.error).toBe("name required");
    }
  });

  it("applies schema transforms (e.g. trim)", async () => {
    const schema = z.object({
      value: z.string().transform((s) => s.trim()).pipe(z.string().min(1, "empty")),
    });
    const c = mockContext({ value: "  hello  " });
    const result = await parseBody(c, schema);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.value).toBe("hello");
    }
  });
});

// ---------------------------------------------------------------------------
// parseCharacterSchema
// ---------------------------------------------------------------------------
describe("parseCharacterSchema", () => {
  it("accepts valid player input (minimal: campaignId + concept)", () => {
    const result = parseCharacterSchema.safeParse({
      campaignId: "abc-123",
      concept: "A wandering bard",
    });
    expect(result.success).toBe(true);
  });

  it("defaults role to 'player'", () => {
    const result = parseCharacterSchema.safeParse({
      campaignId: "abc-123",
      concept: "A wandering bard",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("player");
    }
  });

  it("trims concept whitespace", () => {
    const result = parseCharacterSchema.safeParse({
      campaignId: "abc-123",
      concept: "  A wandering bard  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.concept).toBe("A wandering bard");
    }
  });

  it("rejects empty campaignId", () => {
    const result = parseCharacterSchema.safeParse({
      campaignId: "",
      concept: "A wandering bard",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty concept", () => {
    const result = parseCharacterSchema.safeParse({
      campaignId: "abc-123",
      concept: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects concept over 2000 chars", () => {
    const result = parseCharacterSchema.safeParse({
      campaignId: "abc-123",
      concept: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts key role with locationNames", () => {
    const result = parseCharacterSchema.safeParse({
      campaignId: "abc-123",
      concept: "A guard captain",
      role: "key",
      locationNames: ["Castle"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects key role without locationNames", () => {
    const result = parseCharacterSchema.safeParse({
      campaignId: "abc-123",
      concept: "A guard captain",
      role: "key",
    });
    expect(result.success).toBe(false);
  });

  it("rejects key role with empty locationNames array", () => {
    const result = parseCharacterSchema.safeParse({
      campaignId: "abc-123",
      concept: "A guard captain",
      role: "key",
      locationNames: [],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateCharacterSchema
// ---------------------------------------------------------------------------
describe("generateCharacterSchema", () => {
  it("accepts valid player input (minimal: campaignId only)", () => {
    const result = generateCharacterSchema.safeParse({
      campaignId: "abc-123",
    });
    expect(result.success).toBe(true);
  });

  it("defaults role to 'player'", () => {
    const result = generateCharacterSchema.safeParse({
      campaignId: "abc-123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("player");
    }
  });

  it("accepts key role with locationNames", () => {
    const result = generateCharacterSchema.safeParse({
      campaignId: "abc-123",
      role: "key",
      locationNames: ["Tavern"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects key role without locationNames", () => {
    const result = generateCharacterSchema.safeParse({
      campaignId: "abc-123",
      role: "key",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty campaignId", () => {
    const result = generateCharacterSchema.safeParse({
      campaignId: "",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// researchCharacterSchema
// ---------------------------------------------------------------------------
describe("researchCharacterSchema", () => {
  it("accepts valid input (campaignId + archetype)", () => {
    const result = researchCharacterSchema.safeParse({
      campaignId: "abc-123",
      archetype: "Noble knight",
    });
    expect(result.success).toBe(true);
  });

  it("defaults role to 'player'", () => {
    const result = researchCharacterSchema.safeParse({
      campaignId: "abc-123",
      archetype: "Noble knight",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("player");
    }
  });

  it("trims archetype whitespace", () => {
    const result = researchCharacterSchema.safeParse({
      campaignId: "abc-123",
      archetype: "  Noble knight  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.archetype).toBe("Noble knight");
    }
  });

  it("rejects empty archetype", () => {
    const result = researchCharacterSchema.safeParse({
      campaignId: "abc-123",
      archetype: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects archetype over 500 chars", () => {
    const result = researchCharacterSchema.safeParse({
      campaignId: "abc-123",
      archetype: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts key role with locationNames", () => {
    const result = researchCharacterSchema.safeParse({
      campaignId: "abc-123",
      archetype: "Noble knight",
      role: "key",
      locationNames: ["Keep"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects key role without locationNames", () => {
    const result = researchCharacterSchema.safeParse({
      campaignId: "abc-123",
      archetype: "Noble knight",
      role: "key",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// importV2CardSchema
// ---------------------------------------------------------------------------
describe("importV2CardSchema", () => {
  it("accepts valid player input (campaignId + name + description)", () => {
    const result = importV2CardSchema.safeParse({
      campaignId: "abc-123",
      name: "Elara",
      description: "A mysterious sorceress from the northern wastes.",
    });
    expect(result.success).toBe(true);
  });

  it("defaults role, personality, scenario, tags", () => {
    const result = importV2CardSchema.safeParse({
      campaignId: "abc-123",
      name: "Elara",
      description: "A mysterious sorceress.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("player");
      expect(result.data.personality).toBe("");
      expect(result.data.scenario).toBe("");
      expect(result.data.tags).toEqual([]);
      expect(result.data.importMode).toBe("native");
    }
  });

  it("accepts outsider import mode", () => {
    const result = importV2CardSchema.safeParse({
      campaignId: "abc-123",
      name: "Elara",
      description: "A mysterious sorceress.",
      importMode: "outsider",
    });
    expect(result.success).toBe(true);
  });

  it("accepts long V2 card text fields without max-length limits", () => {
    const result = importV2CardSchema.safeParse({
      campaignId: "abc-123",
      name: "Elara",
      description: "x".repeat(20000),
      personality: "y".repeat(15000),
      scenario: "z".repeat(15000),
    });
    expect(result.success).toBe(true);
  });

  it("accepts key role with locationNames", () => {
    const result = importV2CardSchema.safeParse({
      campaignId: "abc-123",
      name: "Elara",
      description: "A mysterious sorceress.",
      role: "key",
      locationNames: ["Tower"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects key role without locationNames", () => {
    const result = importV2CardSchema.safeParse({
      campaignId: "abc-123",
      name: "Elara",
      description: "A mysterious sorceress.",
      role: "key",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional grounding on the same payload seam as researched drafts", () => {
    const result = importV2CardSchema.safeParse({
      campaignId: "abc-123",
      name: "Elara",
      description: "A mysterious sorceress.",
      grounding: {
        summary: "Canon-grounded frost mage with bounded battlefield reach.",
        facts: ["Specializes in cold-linked spellwork."],
        abilities: ["Cryomancy"],
        constraints: ["Requires focus to sustain area effects"],
        signatureMoves: ["Ice-lance barrage"],
        strongPoints: ["Area denial"],
        vulnerabilities: ["Fatigues when overextending mana output"],
        uncertaintyNotes: ["True upper limit varies across sources."],
        powerProfile: {
          attack: "Building-scale area spells under ideal setup.",
          speed: "Human reactions with spell-assisted repositioning.",
          durability: "Normal human durability with magical shielding bursts.",
          range: "Long range when line of sight is available.",
          strengths: ["Area denial", "Battlefield control"],
          constraints: ["Needs casting windows"],
          vulnerabilities: ["Can be rushed before shields are active"],
          uncertaintyNotes: ["Shield uptime is inconsistently described."],
        },
        sources: [
          {
            kind: "card",
            label: "Community card",
            excerpt: "Known for freezing a watchtower approach in seconds.",
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.grounding?.powerProfile?.vulnerabilities).toEqual([
        "Can be rushed before shields are active",
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// canonical character schemas
// ---------------------------------------------------------------------------
describe("canonical character schemas", () => {
  const draft = {
    identity: {
      role: "player" as const,
      tier: "key" as const,
      displayName: "Aria Bloodthorn",
      canonicalStatus: "original" as const,
    },
    profile: {
      species: "Human",
      gender: "Female",
      ageText: "18",
      appearance: "Violet eyes and raven hair.",
      backgroundSummary: "A runaway courier from the alpine relay.",
      personaSummary: "Quiet until she trusts you.",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Signal Station",
      relationshipRefs: [],
      socialStatus: ["Wanted"],
      originMode: "outsider" as const,
    },
    motivations: {
      shortTermGoals: ["Reach the tower"],
      longTermGoals: ["Decode the buried signal"],
      beliefs: ["The storm is hiding something"],
      drives: ["Curious"],
      frictions: ["Guarded"],
    },
    capabilities: {
      traits: ["Observant"],
      skills: [{ name: "Swordsman", tier: "Novice" as const }],
      flaws: ["Stubborn"],
      specialties: ["Signal Lore"],
      wealthTier: "Poor" as const,
    },
    state: {
      hp: 4,
      conditions: ["Wounded"],
      statusFlags: ["Hidden"],
      activityState: "active",
    },
    loadout: {
      inventorySeed: ["Rope"],
      equippedItemRefs: ["Iron Sword"],
      currencyNotes: "",
      signatureItems: ["Family Compass"],
    },
    startConditions: {},
    provenance: {
      sourceKind: "generator" as const,
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: ["legacy"],
    },
  };

  it("accepts a canonical character draft and record", () => {
    expect(characterDraftSchema.safeParse(draft).success).toBe(true);
    expect(
      characterRecordSchema.safeParse({
        ...draft,
        identity: {
          ...draft.identity,
          id: "player-1",
          campaignId: "camp-1",
        },
      }).success,
    ).toBe(true);
  });

  it("keeps additive compatibility for legacy and canonical save-character payloads", () => {
    expect(
      saveCharacterSchema.safeParse({
        campaignId: "camp-1",
        draft,
      }).success,
    ).toBe(true);

    expect(
      saveCharacterSchema.safeParse({
        campaignId: "camp-1",
        character: {
          name: "Aria Bloodthorn",
          race: "Human",
          gender: "Female",
          age: "18",
          appearance: "Violet eyes and raven hair.",
          tags: ["Observant", "Poor"],
          hp: 4,
          equippedItems: ["Iron Sword"],
          locationName: "Signal Station",
        },
      }).success,
    ).toBe(true);
  });

  it("materializes legacy save-character payloads onto the current shared draft lane", () => {
    const result = saveCharacterSchema.safeParse({
      campaignId: "camp-1",
      character: {
        name: "Aria Bloodthorn",
        race: "Human",
        gender: "Female",
        age: "18",
        appearance: "Violet eyes and raven hair.",
        tags: ["Observant", "Poor"],
        hp: 4,
        equippedItems: ["Iron Sword"],
        locationName: "Signal Station",
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draft.identity.baseFacts.biography).toBe("");
      expect(result.data.draft.identity.behavioralCore.selfImage).toBe("");
      expect(result.data.draft.identity.liveDynamics.activeGoals).toEqual([]);
      expect(result.data.draft.socialContext.currentLocationName).toBe("Signal Station");
    }
  });

  it("preserves supporting tier for draft-backed save-edits NPC payloads", () => {
    const result = saveEditsSchema.safeParse({
      campaignId: "camp-1",
      scaffold: {
        refinedPremise: "Signals whisper through the alpine dark.",
        locations: [
          {
            name: "Signal Station",
            description: "A frozen relay tower above the valley.",
            tags: ["Cold"],
            isStarting: true,
            connectedTo: [],
          },
        ],
        factions: [],
        npcs: [
          {
            draft: {
              ...draft,
              identity: {
                ...draft.identity,
                role: "npc",
                tier: "supporting",
                displayName: "Captain Mire",
              },
            },
            locationName: "Signal Station",
            factionName: "Wardens",
            tier: "supporting",
          },
        ],
        loreCards: [],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scaffold.npcs[0]).toMatchObject({
        name: "Captain Mire",
        locationName: "Signal Station",
        factionName: "Wardens",
        tier: "supporting",
      });
      expect(result.data.scaffold.npcs[0]?.draft.identity.tier).toBe("supporting");
    }
  });

  it("materializes a canonical supporting draft for legacy supporting scaffold NPC payloads", () => {
    const result = saveEditsSchema.safeParse({
      campaignId: "camp-1",
      scaffold: {
        refinedPremise: "Signals whisper through the alpine dark.",
        locations: [
          {
            name: "Signal Station",
            description: "A frozen relay tower above the valley.",
            tags: ["Cold"],
            isStarting: true,
            connectedTo: [],
          },
        ],
        factions: [],
        npcs: [
          {
            name: "Field Runner Iven",
            persona: "Carries sealed messages through the blizzard.",
            tags: ["fast", "reliable"],
            goals: {
              shortTerm: ["Deliver the dispatch"],
              longTerm: ["Map every pass in the range"],
            },
            locationName: "Signal Station",
            factionName: null,
            tier: "supporting",
          },
        ],
        loreCards: [],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scaffold.npcs[0]).toMatchObject({
        name: "Field Runner Iven",
        tier: "supporting",
      });
      expect(result.data.scaffold.npcs[0]?.draft.identity.tier).toBe("supporting");
      expect(result.data.scaffold.npcs[0]?.draft.profile.personaSummary).toBe(
        "Carries sealed messages through the blizzard.",
      );
    }
  });

  it("adds canonical persistence columns to players and npcs without removing legacy ones", () => {
    expect(players.characterRecord.name).toBe("character_record");
    expect(players.derivedTags.name).toBe("derived_tags");
    expect(players.tags.name).toBe("tags");

    expect(npcs.characterRecord.name).toBe("character_record");
    expect(npcs.derivedTags.name).toBe("derived_tags");
    expect(npcs.persona.name).toBe("persona");
  });
});

describe("phase 48 richer identity schemas", () => {
  const richerDraft = {
    identity: {
      role: "npc" as const,
      tier: "key" as const,
      displayName: "Captain Mire",
      canonicalStatus: "known_ip_canonical" as const,
      baseFacts: {
        biography: "A veteran signal-station commander.",
        socialRole: ["warden", "captain"],
        hardConstraints: ["Will not abandon the station"],
      },
      behavioralCore: {
        motives: ["Protect the valley"],
        pressureResponses: ["Turns colder under pressure"],
        taboos: ["Will not lie to subordinates"],
        attachments: ["The station crew"],
        selfImage: "Guardian of the northern line",
      },
      liveDynamics: {
        activeGoals: ["Hold the barricade"],
        beliefDrift: ["The valley can still be saved"],
        currentStrains: ["Running out of supplies"],
        earnedChanges: ["Started trusting the player"],
      },
    },
    profile: {
      species: "Human",
      gender: "Female",
      ageText: "42",
      appearance: "Storm-scarred uniform and frost-burned hands.",
      backgroundSummary: "Raised inside the watchtowers of the north.",
      personaSummary: "Commanding, clipped, and exhausted.",
    },
    socialContext: {
      factionId: "faction-wardens",
      factionName: "Wardens",
      homeLocationId: "loc-station",
      homeLocationName: "Signal Station",
      currentLocationId: "loc-barricade",
      currentLocationName: "North Barricade",
      relationshipRefs: [],
      socialStatus: ["Respected"],
      originMode: "resident" as const,
    },
    motivations: {
      shortTermGoals: ["Hold the barricade"],
      longTermGoals: ["Restore order in the valley"],
      beliefs: ["The station can still be saved"],
      drives: ["Duty"],
      frictions: ["Suspicious of outsiders"],
    },
    capabilities: {
      traits: ["Connected"],
      skills: [{ name: "Negotiator", tier: "Master" as const }],
      flaws: ["Cold-blooded"],
      specialties: ["Signal doctrine"],
      wealthTier: "Comfortable" as const,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "active",
    },
    loadout: {
      inventorySeed: ["Signal key"],
      equippedItemRefs: ["Officer Saber"],
      currencyNotes: "",
      signatureItems: ["Signal key"],
    },
    startConditions: {},
    provenance: {
      sourceKind: "import" as const,
      importMode: "outsider" as const,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: "known-ip",
      legacyTags: ["legacy"],
    },
    sourceBundle: {
      canonSources: [
        {
          kind: "canon",
          label: "Episode Guide",
          excerpt: "Captain Mire held the station through three winters.",
        },
      ],
      secondarySources: [
        {
          kind: "card",
          label: "Community card",
          excerpt: "Voice is dry, clipped, and tired.",
        },
      ],
      synthesis: {
        owner: "worldforge",
        strategy: "canon-facts-authoritative",
        notes: ["Merged canon history with secondary voice cues."],
      },
    },
    continuity: {
      identityInertia: "anchored",
      protectedCore: ["Will not abandon the station"],
      mutableSurface: ["Trust in the player"],
      changePressureNotes: ["Major defeats can force realignment."],
    },
  };

  it("preserves richer identity, source bundle, and continuity across draft and record schemas", () => {
    const draftResult = characterDraftSchema.safeParse(richerDraft);
    expect(draftResult.success).toBe(true);
    if (draftResult.success) {
      expect(draftResult.data.identity.baseFacts.biography).toBe(
        "A veteran signal-station commander.",
      );
      expect(draftResult.data.identity.behavioralCore.motives).toEqual([
        "Protect the valley",
      ]);
      expect(draftResult.data.identity.liveDynamics.activeGoals).toEqual([
        "Hold the barricade",
      ]);
      expect(draftResult.data.sourceBundle?.canonSources[0]?.label).toBe("Episode Guide");
      expect(draftResult.data.continuity?.identityInertia).toBe("anchored");
    }

    const recordResult = characterRecordSchema.safeParse({
      ...richerDraft,
      identity: {
        ...richerDraft.identity,
        id: "npc-1",
        campaignId: "camp-1",
      },
    });
    expect(recordResult.success).toBe(true);
    if (recordResult.success) {
      expect(recordResult.data.identity.baseFacts.hardConstraints).toEqual([
        "Will not abandon the station",
      ]);
      expect(recordResult.data.sourceBundle?.secondarySources[0]?.label).toBe(
        "Community card",
      );
    }
  });

  it("accepts persona template patches that target richer identity and fidelity seams", () => {
    const result = personaTemplatePatchSchema.safeParse({
      identity: {
        baseFacts: {
          biography: "Now serving the storm watch.",
        },
        behavioralCore: {
          motives: ["Protect the valley"],
        },
        liveDynamics: {
          activeGoals: ["Hold the barricade"],
        },
      },
      sourceBundle: {
        synthesis: {
          notes: ["Reinforced canon wording."],
        },
      },
      continuity: {
        protectedCore: ["Will not abandon the station"],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.identity?.baseFacts?.biography).toBe(
        "Now serving the storm watch.",
      );
      expect(result.data.sourceBundle?.synthesis?.notes).toEqual([
        "Reinforced canon wording.",
      ]);
      expect(result.data.continuity?.protectedCore).toEqual([
        "Will not abandon the station",
      ]);
    }
  });

  it("keeps richer identity fields when draft-backed save payloads materialize compatibility aliases", () => {
    const result = saveCharacterSchema.safeParse({
      campaignId: "camp-1",
      draft: richerDraft,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draft.identity.liveDynamics.currentStrains).toEqual([
        "Running out of supplies",
      ]);
      expect(result.data.draft.sourceBundle?.synthesis?.owner).toBe("worldforge");
      expect(result.data.draft.continuity?.mutableSurface).toEqual([
        "Trust in the player",
      ]);
      expect(result.data.character.tags).toContain("Connected");
    }
  });

  it("derives save-edits compatibility persona and goals from richer identity layers when shallow draft fields are empty", () => {
    const result = saveEditsSchema.safeParse({
      campaignId: "camp-1",
      scaffold: {
        refinedPremise: "Signals whisper through the alpine dark.",
        locations: [
          {
            name: "Signal Station",
            description: "A frozen relay tower above the valley.",
            tags: ["Cold"],
            isStarting: true,
            connectedTo: [],
          },
        ],
        factions: [],
        npcs: [
          {
            draft: {
              ...richerDraft,
              profile: {
                ...richerDraft.profile,
                personaSummary: "",
              },
              motivations: {
                ...richerDraft.motivations,
                shortTermGoals: [],
                longTermGoals: [],
                beliefs: [],
                drives: [],
                frictions: [],
              },
            },
            locationName: "Signal Station",
            factionName: "Wardens",
            tier: "key",
          },
        ],
        loreCards: [],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scaffold.npcs[0]?.persona).toBe("Guardian of the northern line");
      expect(result.data.scaffold.npcs[0]?.goals).toEqual({
        shortTerm: ["Hold the barricade"],
        longTerm: [],
      });
      expect(result.data.scaffold.npcs[0]?.draft.identity.liveDynamics.beliefDrift).toEqual([
        "The valley can still be saved",
      ]);
    }
  });
});

describe("phase 49 grounding schemas", () => {
  const grounding = {
    summary:
      "Canon-grounded station commander with battlefield leadership and bounded human-scale power.",
    facts: [
      "Held the northern signal station through repeated sieges.",
      "Coordinates retreat and relay doctrine under pressure.",
    ],
    abilities: ["Command presence", "Signal doctrine", "Field tactics"],
    constraints: ["Human physiology", "Limited reach without support"],
    signatureMoves: ["Coordinated fallback with relay flares"],
    strongPoints: ["Battlefield control", "Morale under siege"],
    vulnerabilities: ["Can be overrun by superior force"],
    uncertaintyNotes: ["Solo combat ceiling is only lightly attested in canon."],
    powerProfile: {
      attack: "Human-scale martial threat with command support.",
      speed: "Normal human speed with veteran battlefield timing.",
      durability: "Human durability with siege-hardened endurance.",
      range: "Short personal reach, extended by support assets.",
      strengths: ["Command discipline", "Endurance", "Tactical reading"],
      constraints: ["Needs allies or equipment for area control"],
      vulnerabilities: ["Vulnerable when isolated"],
      uncertaintyNotes: ["Support-asset dependence varies by source."],
    },
    sources: [
      {
        kind: "canon" as const,
        label: "Station Chronicle",
        excerpt: "Captain Mire held the relay until the last evacuation horn.",
      },
    ],
  } satisfies CharacterGroundingProfile;

  const draft = {
    identity: {
      role: "npc" as const,
      tier: "key" as const,
      displayName: "Captain Mire",
      canonicalStatus: "known_ip_canonical" as const,
    },
    profile: {
      species: "Human",
      gender: "Female",
      ageText: "42",
      appearance: "Storm-scarred uniform and frost-burned hands.",
      backgroundSummary: "Raised inside the watchtowers of the north.",
      personaSummary: "Commanding, clipped, and exhausted.",
    },
    socialContext: {
      factionId: "faction-wardens",
      factionName: "Wardens",
      homeLocationId: "loc-station",
      homeLocationName: "Signal Station",
      currentLocationId: "loc-barricade",
      currentLocationName: "North Barricade",
      relationshipRefs: [],
      socialStatus: ["Respected"],
      originMode: "resident" as const,
    },
    motivations: {
      shortTermGoals: ["Hold the barricade"],
      longTermGoals: ["Restore order in the valley"],
      beliefs: ["The station can still be saved"],
      drives: ["Duty"],
      frictions: ["Suspicious of outsiders"],
    },
    capabilities: {
      traits: ["Connected"],
      skills: [{ name: "Negotiator", tier: "Master" as const }],
      flaws: ["Cold-blooded"],
      specialties: ["Signal doctrine"],
      wealthTier: "Comfortable" as const,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "active",
    },
    loadout: {
      inventorySeed: ["Signal key"],
      equippedItemRefs: ["Officer Saber"],
      currencyNotes: "",
      signatureItems: ["Signal key"],
    },
    startConditions: {},
    provenance: {
      sourceKind: "import" as const,
      importMode: "outsider" as const,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: "known-ip",
      legacyTags: ["legacy"],
    },
    grounding,
  };

  it("preserves grounding across draft and record schemas", () => {
    const draftResult = characterDraftSchema.safeParse(draft);
    expect(draftResult.success).toBe(true);
    if (draftResult.success) {
      expect(draftResult.data.grounding?.summary).toContain("Canon-grounded");
      expect(draftResult.data.grounding?.powerProfile?.constraints).toEqual([
        "Needs allies or equipment for area control",
      ]);
      expect(draftResult.data.grounding?.sources[0]?.label).toBe("Station Chronicle");
    }

    const recordResult = characterRecordSchema.safeParse({
      ...draft,
      identity: {
        ...draft.identity,
        id: "npc-1",
        campaignId: "camp-1",
      },
    });
    expect(recordResult.success).toBe(true);
    if (recordResult.success) {
      expect(recordResult.data.grounding?.powerProfile?.vulnerabilities).toEqual([
        "Vulnerable when isolated",
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveStartingLocationSchema
// ---------------------------------------------------------------------------
describe("resolveStartingLocationSchema", () => {
  it("accepts valid input (campaignId only)", () => {
    const result = resolveStartingLocationSchema.safeParse({
      campaignId: "abc-123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts with optional prompt", () => {
    const result = resolveStartingLocationSchema.safeParse({
      campaignId: "abc-123",
      prompt: "Start near the harbor",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt).toBe("Start near the harbor");
    }
  });

  it("rejects empty campaignId", () => {
    const result = resolveStartingLocationSchema.safeParse({
      campaignId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects prompt over 500 chars", () => {
    const result = resolveStartingLocationSchema.safeParse({
      campaignId: "abc-123",
      prompt: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 30 schemas
// ---------------------------------------------------------------------------
describe("phase 30 persona template schemas", () => {
  const phase30Draft = {
    identity: {
      role: "player" as const,
      tier: "key" as const,
      displayName: "Aria Bloodthorn",
      canonicalStatus: "original" as const,
    },
    profile: {
      species: "Human",
      gender: "Female",
      ageText: "18",
      appearance: "Violet eyes and raven hair.",
      backgroundSummary: "A runaway courier from the alpine relay.",
      personaSummary: "Quiet until she trusts you.",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Signal Station",
      relationshipRefs: [],
      socialStatus: ["Wanted"],
      originMode: "outsider" as const,
    },
    motivations: {
      shortTermGoals: ["Reach the tower"],
      longTermGoals: ["Decode the buried signal"],
      beliefs: ["The storm is hiding something"],
      drives: ["Curious"],
      frictions: ["Guarded"],
    },
    capabilities: {
      traits: ["Observant"],
      skills: [{ name: "Swordsman", tier: "Novice" as const }],
      flaws: ["Stubborn"],
      specialties: ["Signal Lore"],
      wealthTier: "Poor" as const,
    },
    state: {
      hp: 4,
      conditions: ["Wounded"],
      statusFlags: ["Hidden"],
      activityState: "active",
    },
    loadout: {
      inventorySeed: ["Rope"],
      equippedItemRefs: ["Iron Sword"],
      currencyNotes: "",
      signatureItems: ["Family Compass"],
    },
    startConditions: {},
    provenance: {
      sourceKind: "generator" as const,
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: ["legacy"],
    },
  };

  const patch = {
    profile: {
      backgroundSummary: "Raised in the border watch.",
      personaSummary: "Dry humor covering old grief.",
    },
    motivations: {
      drives: ["Duty"],
      frictions: ["Distrusts authority"],
    },
    capabilities: {
      traits: ["Observant"],
    },
    startConditions: {
      arrivalMode: "on-foot",
      entryPressure: ["late", "under-equipped"],
    },
  };

  it("accepts a shared draft patch shape for persona templates", () => {
    const result = personaTemplatePatchSchema.safeParse(patch);
    expect(result.success).toBe(true);
  });

  it("accepts a campaign-scoped persona template", () => {
    const result = personaTemplateSchema.safeParse({
      id: "template-border-watch",
      campaignId: "camp-1",
      name: "Border Watch Veteran",
      description: "A veteran hardened by frontier patrols.",
      roleScope: "any",
      tags: ["martial", "grim"],
      patch,
      createdAt: 123,
      updatedAt: 456,
    });

    expect(result.success).toBe(true);
  });

  it("accepts additive CRUD payloads and draft apply bodies", () => {
    expect(
      createPersonaTemplateSchema.safeParse({
        campaignId: "camp-1",
        name: "Court Attaché",
        description: "Soft-power operator.",
        roleScope: "player",
        tags: ["politics"],
        patch,
      }).success,
    ).toBe(true);

    expect(
      updatePersonaTemplateSchema.safeParse({
        campaignId: "camp-1",
        templateId: "template-border-watch",
        patch: {
          name: "Border Watch Veteran",
          tags: ["martial", "watch"],
        },
      }).success,
    ).toBe(true);

    expect(
      applyPersonaTemplateSchema.safeParse({
        campaignId: "camp-1",
        templateId: "template-border-watch",
        draft: phase30Draft,
      }).success,
    ).toBe(true);
  });

  it("accepts persona template summaries for world payload listing", () => {
    const result = personaTemplateSummarySchema.safeParse({
      id: "template-border-watch",
      campaignId: "camp-1",
      name: "Border Watch Veteran",
      description: "A veteran hardened by frontier patrols.",
      roleScope: "any",
      tags: ["martial", "grim"],
      createdAt: 123,
      updatedAt: 456,
    });

    expect(result.success).toBe(true);
  });
});

describe("phase 30 start and loadout schemas", () => {
  it("accepts structured start-resolution responses with compatibility aliases", () => {
    const result = resolvedStartConditionsSchema.safeParse({
      locationId: "loc-1",
      locationName: "Moonwell",
      narrative: "You arrive at dawn with frost on your sleeves.",
      startConditions: {
        startLocationId: "loc-1",
        arrivalMode: "on-foot",
        immediateSituation: "Seeking shelter after a storm crossing.",
        entryPressure: ["late", "cold"],
        companions: ["hound"],
        startingVisibility: "noticed",
        resolvedNarrative: "You arrive at dawn with frost on your sleeves.",
        sourcePrompt: "I reach town after a storm.",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts canonical loadout preview payloads with audit metadata", () => {
    const result = canonicalLoadoutPreviewSchema.safeParse({
      loadout: {
        inventorySeed: ["Travel Cloak", "Waterskin"],
        equippedItemRefs: ["Travel Cloak"],
        currencyNotes: "A few clipped silver marks.",
        signatureItems: ["Weathered Compass"],
      },
      items: [
        {
          name: "Travel Cloak",
          slot: "equipped",
          tags: ["starting-loadout", "wearable"],
          quantity: 1,
          reason: "baseline travel gear",
        },
      ],
      audit: [
        "baseline-travel-kit",
        "arrival:on-foot",
      ],
      warnings: [],
    });

    expect(result.success).toBe(true);
  });
});
