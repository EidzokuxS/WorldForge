import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Track DB calls ----
interface DbCall {
  op: "insert";
  table: string;
  data: unknown;
}
const dbCalls: DbCall[] = [];

// ---- Mocks ----
vi.mock("node:crypto", () => ({
  default: {
    randomUUID: () => "mock-uuid",
  },
}));

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("../../db/schema.js", () => ({
  npcs: { _name: "npcs" },
  locations: { _name: "locations" },
  factions: { _name: "factions" },
}));

vi.mock("../../db/index.js", () => {
  function createChain(table: { _name: string }, calls: { op: string; table: string; data: unknown }[]) {
    const chain = {
      values: (data: unknown) => {
        calls.push({ op: "insert", table: table._name, data });
        return chain;
      },
      run: () => {},
    };
    return chain;
  }

  return {
    getDb: vi.fn(() => ({
      transaction: (fn: (tx: unknown) => void) => {
        const tx = {
          insert: (table: { _name: string }) => createChain(table, dbCalls),
        };
        fn(tx);
      },
    })),
  };
});

vi.mock("../../vectors/lore-cards.js", () => ({
  storeLoreCards: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// ---- Imports after mocks ----
import {
  parseWorldBook,
  classifyEntries,
  importClassifiedEntries,
  type ClassifiedEntry,
  type WorldBookEntry,
} from "../worldbook-importer.js";
import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { storeLoreCards } from "../../vectors/lore-cards.js";
import type { ResolvedRole } from "../../ai/resolve-role-model.js";
import type { ResolveResult } from "../../ai/index.js";

const mockRole: ResolvedRole = {
  provider: {
    id: "test",
    name: "Test",
    baseUrl: "http://localhost",
    apiKey: "key",
    model: "test-model",
  },
  temperature: 0.2,
  maxTokens: 4096,
};

const mockEmbedderResult: ResolveResult = {
  resolved: {
    provider: mockRole.provider,
    temperature: 0,
    maxTokens: 512,
  },
};

describe("parseWorldBook", () => {
  it("extracts entries from valid WorldBook JSON with comment/content fields", () => {
    const json = {
      entries: {
        "0": { comment: "Dragon", content: "A fire-breathing beast." },
        "1": { comment: "Elf", content: "A graceful woodland creature." },
      },
    };
    const result = parseWorldBook(json);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Dragon", text: "A fire-breathing beast." });
    expect(result[1]).toEqual({ name: "Elf", text: "A graceful woodland creature." });
  });

  it("strips HTML tags from content", () => {
    const json = {
      entries: {
        "0": { comment: "Knight", content: "<b>A brave</b> warrior with <i>honor</i>." },
      },
    };
    const result = parseWorldBook(json);
    expect(result[0]!.text).toBe("A brave warrior with honor.");
  });

  it("deduplicates entries by name (case-insensitive)", () => {
    const json = {
      entries: {
        "0": { comment: "Dragon", content: "First entry." },
        "1": { comment: "dragon", content: "Duplicate entry." },
        "2": { comment: "DRAGON", content: "Another duplicate." },
      },
    };
    const result = parseWorldBook(json);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Dragon");
  });

  it("skips entries with empty name or empty content", () => {
    const json = {
      entries: {
        "0": { comment: "", content: "No name entry." },
        "1": { comment: "Empty", content: "" },
        "2": { comment: "  ", content: "Whitespace name." },
        "3": { comment: "Valid", content: "Has content." },
      },
    };
    const result = parseWorldBook(json);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Valid");
  });

  it("throws on invalid JSON structure (missing entries key)", () => {
    expect(() => parseWorldBook({ items: [] })).toThrow();
    expect(() => parseWorldBook("not-an-object")).toThrow();
    expect(() => parseWorldBook(null)).toThrow();
  });
});

describe("classifyEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array for empty input", async () => {
    const result = await classifyEntries([], mockRole);
    expect(result).toEqual([]);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("calls generateObject with correct schema and prompt containing entry names", async () => {
    const entries: WorldBookEntry[] = [
      { name: "Dragon", text: "A fire-breathing beast." },
      { name: "Castle", text: "A fortified structure." },
    ];

    vi.mocked(generateObject).mockResolvedValue({
      object: {
        entries: [
          { name: "Dragon", type: "bestiary", summary: "A fire beast." },
          { name: "Castle", type: "location", summary: "A fort." },
        ],
      },
    } as never);

    await classifyEntries(entries, mockRole);

    expect(generateObject).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateObject).mock.calls[0]![0];
    expect(callArgs.prompt).toContain("Dragon");
    expect(callArgs.prompt).toContain("Castle");
    expect(callArgs.model).toBe("mock-model");
    expect(callArgs.temperature).toBe(0.2);
  });

  it("returns classified entries from generateObject result", async () => {
    const entries: WorldBookEntry[] = [
      { name: "Goblin", text: "Small green creature." },
    ];

    vi.mocked(generateObject).mockResolvedValue({
      object: {
        entries: [
          { name: "Goblin", type: "bestiary", summary: "A small green menace." },
        ],
      },
    } as never);

    const result = await classifyEntries(entries, mockRole);
    expect(result).toEqual([
      { name: "Goblin", type: "bestiary", summary: "A small green menace." },
    ]);
  });
});

describe("importClassifiedEntries", () => {
  beforeEach(() => {
    dbCalls.length = 0;
    vi.clearAllMocks();
  });

  it("routes characters to npcs table, locations to locations table, factions to factions table", async () => {
    const entries: ClassifiedEntry[] = [
      { name: "Sir Galahad", type: "character", summary: "A noble knight." },
      { name: "Dark Cave", type: "location", summary: "A deep cave." },
      { name: "Thieves Guild", type: "faction", summary: "A shadowy organization." },
    ];

    await importClassifiedEntries("camp-1", entries, mockEmbedderResult);

    const npcInserts = dbCalls.filter((c) => c.table === "npcs");
    const locInserts = dbCalls.filter((c) => c.table === "locations");
    const facInserts = dbCalls.filter((c) => c.table === "factions");

    expect(npcInserts).toHaveLength(1);
    expect((npcInserts[0]!.data as Record<string, unknown>).name).toBe("Sir Galahad");

    expect(locInserts).toHaveLength(1);
    expect((locInserts[0]!.data as Record<string, unknown>).name).toBe("Dark Cave");

    expect(facInserts).toHaveLength(1);
    expect((facInserts[0]!.data as Record<string, unknown>).name).toBe("Thieves Guild");
  });

  it("routes bestiary and lore_general entries to storeLoreCards", async () => {
    const entries: ClassifiedEntry[] = [
      { name: "Wyvern", type: "bestiary", summary: "A two-legged dragon." },
      { name: "Magic System", type: "lore_general", summary: "How magic works." },
    ];

    await importClassifiedEntries("camp-1", entries, mockEmbedderResult);

    expect(storeLoreCards).toHaveBeenCalledTimes(1);
    const loreArgs = vi.mocked(storeLoreCards).mock.calls[0]!;
    expect(loreArgs[0]).toEqual([
      { term: "Wyvern", definition: "A two-legged dragon.", category: "npc" },
      { term: "Magic System", definition: "How magic works.", category: "concept" },
    ]);
  });

  it("returns correct counts in ImportResult", async () => {
    const entries: ClassifiedEntry[] = [
      { name: "Hero", type: "character", summary: "A brave hero." },
      { name: "Villain", type: "character", summary: "An evil villain." },
      { name: "Town", type: "location", summary: "A small town." },
      { name: "Order", type: "faction", summary: "A holy order." },
      { name: "Troll", type: "bestiary", summary: "A bridge troll." },
      { name: "History", type: "lore_general", summary: "Ancient history." },
    ];

    const result = await importClassifiedEntries("camp-1", entries, mockEmbedderResult);

    expect(result.imported).toEqual({
      characters: 2,
      locations: 1,
      factions: 1,
      loreCards: 2,
    });
  });
});
