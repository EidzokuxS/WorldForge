import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("../../campaign/index.js", () => ({
  readCampaignConfig: vi.fn(),
  getChatHistory: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../vectors/lore-cards.js", () => ({
  searchLoreCards: vi.fn(),
}));

vi.mock("../../vectors/embeddings.js", () => ({
  embedTexts: vi.fn(),
}));

import { assemblePrompt, type AssembleOptions } from "../prompt-assembler.js";
import { readCampaignConfig, getChatHistory } from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import { searchLoreCards } from "../../vectors/lore-cards.js";
import { embedTexts } from "../../vectors/embeddings.js";
import {
  players as playersTable,
  npcs as npcsTable,
  locations as locationsTable,
  items as itemsTable,
  relationships as relationshipsTable,
  chronicle as chronicleTable,
  factions as factionsTable,
} from "../../db/schema.js";

// Helper to create a mock Drizzle DB that returns data based on table reference identity
function createMockDb(overrides: {
  players?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  npcs?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  relationships?: Record<string, unknown>[];
  chronicle?: Record<string, unknown>[];
  factions?: Record<string, unknown>[];
} = {}) {
  // Map table references to override keys
  const tableMap = new Map<unknown, Record<string, unknown>[]>([
    [playersTable, overrides.players ?? []],
    [locationsTable, overrides.locations ?? []],
    [npcsTable, overrides.npcs ?? []],
    [itemsTable, overrides.items ?? []],
    [relationshipsTable, overrides.relationships ?? []],
    [chronicleTable, overrides.chronicle ?? []],
    [factionsTable, overrides.factions ?? []],
  ]);

  const selectFn = vi.fn().mockImplementation((_columns?: unknown) => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      const data = tableMap.get(table) ?? [];
      return {
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue(data),
            }),
            all: vi.fn().mockReturnValue(data),
          }),
          all: vi.fn().mockReturnValue(data),
          get: vi.fn().mockReturnValue(data[0]),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(data),
          }),
          all: vi.fn().mockReturnValue(data),
        }),
        all: vi.fn().mockReturnValue(data),
        get: vi.fn().mockReturnValue(data[0]),
      };
    }),
  }));

  return { select: selectFn };
}

const defaultOptions: AssembleOptions = {
  campaignId: "test-campaign-123",
  contextWindow: 8192,
};

describe("assemblePrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(readCampaignConfig).mockReturnValue({
      name: "Test Campaign",
      premise: "A dark fantasy world where magic is fading.",
      createdAt: Date.now(),
      generationComplete: true,
    });

    vi.mocked(getChatHistory).mockReturnValue([]);

    vi.mocked(getDb).mockReturnValue(createMockDb() as unknown as ReturnType<typeof getDb>);
  });

  it("returns formatted string containing [SYSTEM RULES] and [WORLD PREMISE]", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.formatted).toContain("[SYSTEM RULES]");
    expect(result.formatted).toContain("[WORLD PREMISE]");
  });

  it("includes premise text in [WORLD PREMISE] section", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.formatted).toContain("A dark fantasy world where magic is fading.");
  });

  it("includes [PLAYER STATE] section when player data exists", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        players: [
          {
            id: "p1",
            campaignId: "test-campaign-123",
            name: "Elara",
            race: "Elf",
            gender: "Female",
            age: "120",
            appearance: "Silver hair",
            hp: 5,
            tags: '["brave","archer"]',
            equippedItems: '["longbow"]',
            currentLocationId: null,
          },
        ],
      }) as unknown as ReturnType<typeof getDb>
    );

    const result = await assemblePrompt(defaultOptions);
    expect(result.formatted).toContain("[PLAYER STATE]");
    expect(result.formatted).toContain("Elara");
  });

  it("omits [PLAYER STATE] section when no player exists", async () => {
    const result = await assemblePrompt(defaultOptions);
    // Check sections array -- [PLAYER STATE] text appears in SYSTEM_RULES instructions
    // but there should be no dedicated PLAYER STATE section
    expect(result.sections.find((s) => s.name === "PLAYER STATE")).toBeUndefined();
  });

  it("omits [SCENE] section when no location exists", async () => {
    const result = await assemblePrompt(defaultOptions);
    // Check sections array instead of formatted string, because SYSTEM_RULES
    // text mentions "[SCENE]" in the FORBIDDEN list
    expect(result.sections.find((s) => s.name === "SCENE")).toBeUndefined();
  });

  it("includes [ACTION RESULT] when actionResult is provided", async () => {
    const result = await assemblePrompt({
      ...defaultOptions,
      actionResult: {
        chance: 75,
        roll: 42,
        outcome: "success",
        reasoning: "The warrior's training paid off.",
      },
    });
    expect(result.formatted).toContain("[ACTION RESULT]");
    expect(result.formatted).toContain("success");
    expect(result.formatted).toContain("75");
  });

  it("includes [LORE CONTEXT] with term: definition format when lore cards available", async () => {
    vi.mocked(embedTexts).mockResolvedValue([[0.1, 0.2, 0.3]]);
    vi.mocked(searchLoreCards).mockResolvedValue([
      { id: "l1", term: "Arcane Blight", definition: "A corruption that destroys magic.", category: "concept", vector: [0.1] },
      { id: "l2", term: "Ironhold", definition: "A fortress city of the dwarves.", category: "location", vector: [0.2] },
    ]);

    const result = await assemblePrompt({
      ...defaultOptions,
      embedderResult: {
        resolved: {
          provider: { id: "emb", name: "Embedder", baseUrl: "http://localhost", apiKey: "key", model: "embed-model" },
          temperature: 0,
          maxTokens: 512,
        },
      },
      playerAction: "I investigate the ancient ruins",
    });

    expect(result.formatted).toContain("[LORE CONTEXT]");
    expect(result.formatted).toContain("Arcane Blight");
    expect(result.formatted).toContain("A corruption that destroys magic.");
  });

  it("skips lore section gracefully when embedder not configured", async () => {
    const result = await assemblePrompt({
      ...defaultOptions,
      embedderResult: { error: "Not configured", status: 400 },
      playerAction: "I investigate",
    });
    // Check sections array instead of formatted string, because SYSTEM_RULES
    // text mentions "[LORE CONTEXT]" in the FORBIDDEN list
    expect(result.sections.find((s) => s.name === "LORE CONTEXT")).toBeUndefined();
  });

  it("totalTokens is within contextWindow", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.totalTokens).toBeLessThanOrEqual(defaultOptions.contextWindow);
  });

  it("budgetUsed is a percentage 0-100", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.budgetUsed).toBeGreaterThanOrEqual(0);
    expect(result.budgetUsed).toBeLessThanOrEqual(100);
  });

  it("sections array contains PromptSection objects", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.sections.length).toBeGreaterThan(0);
    for (const section of result.sections) {
      expect(section).toHaveProperty("name");
      expect(section).toHaveProperty("priority");
      expect(section).toHaveProperty("content");
      expect(section).toHaveProperty("estimatedTokens");
      expect(section).toHaveProperty("canTruncate");
    }
  });

  it("includes recent conversation when chat history exists", async () => {
    vi.mocked(getChatHistory).mockReturnValue([
      { role: "user", content: "I open the door" },
      { role: "assistant", content: "The door creaks open revealing a dark corridor." },
    ]);

    const result = await assemblePrompt(defaultOptions);
    expect(result.formatted).toContain("[RECENT CONVERSATION]");
    expect(result.formatted).toContain("I open the door");
  });

  it("uses double newlines between sections", async () => {
    const result = await assemblePrompt(defaultOptions);
    // At minimum, [SYSTEM RULES] and [WORLD PREMISE] should be separated by double newline
    const systemIdx = result.formatted.indexOf("[SYSTEM RULES]");
    const premiseIdx = result.formatted.indexOf("[WORLD PREMISE]");
    expect(systemIdx).toBeLessThan(premiseIdx);
    // Check there's a double newline between them
    const between = result.formatted.substring(systemIdx, premiseIdx);
    expect(between).toContain("\n\n");
  });

  it("omits [WORLD STATE] section when no chronicle entries or factions exist", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.sections.find((s) => s.name === "WORLD STATE")).toBeUndefined();
  });

  it("includes [WORLD STATE] section with chronicle entries formatted as [Tick N] text", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        chronicle: [
          { tick: 10, text: "The Iron Guild expanded into Westmarch" },
          { tick: 15, text: "[WORLD EVENT] Plague sweeps eastern provinces" },
        ],
      }) as unknown as ReturnType<typeof getDb>
    );

    const result = await assemblePrompt(defaultOptions);
    const worldState = result.sections.find((s) => s.name === "WORLD STATE");
    expect(worldState).toBeDefined();
    expect(worldState!.content).toContain("[Tick 10]");
    expect(worldState!.content).toContain("[Tick 15]");
    expect(worldState!.content).toContain("Recent World Events");
  });

  it("includes faction summaries in [WORLD STATE] section", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        factions: [
          { id: "f1", name: "Iron Guild", tags: '["merchant","powerful"]', goals: '["control trade routes","expand territory"]' },
          { id: "f2", name: "Shadow Council", tags: '["secretive","political"]', goals: '["undermine the crown"]' },
        ],
      }) as unknown as ReturnType<typeof getDb>
    );

    const result = await assemblePrompt(defaultOptions);
    const worldState = result.sections.find((s) => s.name === "WORLD STATE");
    expect(worldState).toBeDefined();
    expect(worldState!.content).toContain("Active Factions");
    expect(worldState!.content).toContain("Iron Guild");
    expect(worldState!.content).toContain("Shadow Council");
  });

  it("WORLD STATE section has priority 3 and canTruncate true", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        chronicle: [
          { tick: 5, text: "Something happened" },
        ],
      }) as unknown as ReturnType<typeof getDb>
    );

    const result = await assemblePrompt(defaultOptions);
    const worldState = result.sections.find((s) => s.name === "WORLD STATE");
    expect(worldState).toBeDefined();
    expect(worldState!.priority).toBe(3);
    expect(worldState!.canTruncate).toBe(true);
  });

  it("includes [WORLD STATE] in formatted output when chronicle entries exist", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        chronicle: [
          { tick: 1, text: "The kingdom was founded" },
        ],
      }) as unknown as ReturnType<typeof getDb>
    );

    const result = await assemblePrompt(defaultOptions);
    expect(result.formatted).toContain("[WORLD STATE]");
  });
});
