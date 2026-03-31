import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetVectorDb = vi.fn();
const mockEmbedTexts = vi.fn();

vi.mock("../connection.js", () => ({
  getVectorDb: () => mockGetVectorDb(),
}));

vi.mock("../embeddings.js", () => ({
  embedTexts: (...args: unknown[]) => mockEmbedTexts(...args),
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  insertLoreCards,
  insertLoreCardsWithoutVectors,
  searchLoreCards,
  getAllLoreCards,
  deleteCampaignLore,
  storeLoreCards,
  updateLoreCard,
  deleteLoreCardById,
} from "../lore-cards.js";

function createMockDb({
  hasTable = false,
  queryRows = [],
  vectorRows = [],
}: {
  hasTable?: boolean;
  queryRows?: Record<string, unknown>[];
  vectorRows?: Record<string, unknown>[];
} = {}) {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(queryRows),
  };
  const mockTable = {
    vectorSearch: vi.fn().mockReturnThis(),
    distanceType: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(vectorRows),
    query: vi.fn().mockReturnValue(mockQuery),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return {
    tableNames: vi.fn().mockResolvedValue(hasTable ? ["lore_cards"] : []),
    createTable: vi.fn().mockResolvedValue(mockTable),
    dropTable: vi.fn().mockResolvedValue(undefined),
    openTable: vi.fn().mockResolvedValue(mockTable),
    _mockQuery: mockQuery,
    _mockTable: mockTable,
  };
}

const fakeCards = [
  { id: "1", term: "Ironhaven", definition: "A fortified city.", category: "location" as const },
  { id: "2", term: "The Crown", definition: "A noble faction.", category: "faction" as const },
];

describe("insertLoreCards", () => {
  beforeEach(() => {
    mockGetVectorDb.mockReset();
    mockEmbedTexts.mockReset();
  });

  it("creates table with rows including vectors", async () => {
    const db = createMockDb();
    mockGetVectorDb.mockReturnValue(db);

    await insertLoreCards(fakeCards, [[0.1, 0.2], [0.3, 0.4]]);

    expect(db.createTable).toHaveBeenCalledTimes(1);
    const rows = db.createTable.mock.calls[0][1];
    expect(rows).toHaveLength(2);
    expect(rows[0].vector).toEqual([0.1, 0.2]);
  });

  it("drops existing table before creating", async () => {
    const db = createMockDb({ hasTable: true });
    mockGetVectorDb.mockReturnValue(db);

    await insertLoreCards(fakeCards, [[0.1], [0.2]]);

    expect(db.dropTable).toHaveBeenCalledWith("lore_cards");
    expect(db.createTable).toHaveBeenCalledTimes(1);
  });
});

describe("insertLoreCardsWithoutVectors", () => {
  beforeEach(() => {
    mockGetVectorDb.mockReset();
  });

  it("creates table without vector field", async () => {
    const db = createMockDb();
    mockGetVectorDb.mockReturnValue(db);

    await insertLoreCardsWithoutVectors(fakeCards);

    const rows = db.createTable.mock.calls[0][1];
    expect(rows[0]).not.toHaveProperty("vector");
  });
});

describe("searchLoreCards", () => {
  beforeEach(() => {
    mockGetVectorDb.mockReset();
  });

  it("returns empty array when table does not exist", async () => {
    const db = createMockDb();
    mockGetVectorDb.mockReturnValue(db);

    const result = await searchLoreCards([0.1, 0.2]);
    expect(result).toEqual([]);
  });

  it("performs vector search with cosine distance", async () => {
    const db = createMockDb({
      hasTable: true,
      vectorRows: [
        { id: "1", term: "Ironhaven", definition: "City.", category: "location", vector: [0.1] },
      ],
    });
    db._mockTable.toArray.mockResolvedValueOnce([
      { id: "1", term: "Ironhaven", definition: "City.", category: "location", vector: [0.1] },
    ]);
    mockGetVectorDb.mockReturnValue(db);

    const result = await searchLoreCards([0.1, 0.2], 3);
    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("Ironhaven");
    expect(db._mockTable.distanceType).toHaveBeenCalledWith("cosine");
    expect(db._mockTable.limit).toHaveBeenCalledWith(3);
  });
});

describe("getAllLoreCards", () => {
  beforeEach(() => {
    mockGetVectorDb.mockReset();
  });

  it("returns empty array when table does not exist", async () => {
    const db = createMockDb();
    mockGetVectorDb.mockReturnValue(db);

    const result = await getAllLoreCards();
    expect(result).toEqual([]);
  });
});

describe("deleteCampaignLore", () => {
  beforeEach(() => {
    mockGetVectorDb.mockReset();
  });

  it("drops table when it exists", async () => {
    const db = createMockDb({ hasTable: true });
    mockGetVectorDb.mockReturnValue(db);

    await deleteCampaignLore();
    expect(db.dropTable).toHaveBeenCalledWith("lore_cards");
  });

  it("does nothing when table does not exist", async () => {
    const db = createMockDb();
    mockGetVectorDb.mockReturnValue(db);

    await deleteCampaignLore();
    expect(db.dropTable).not.toHaveBeenCalled();
  });
});

describe("storeLoreCards", () => {
  beforeEach(() => {
    mockGetVectorDb.mockReset();
    mockEmbedTexts.mockReset();
  });

  it("does nothing for empty cards array", async () => {
    await storeLoreCards([], { error: "no embedder", status: 400 as const });
    expect(mockGetVectorDb).not.toHaveBeenCalled();
  });

  it("stores without vectors when embedder not resolved", async () => {
    const db = createMockDb();
    mockGetVectorDb.mockReturnValue(db);

    await storeLoreCards(
      [{ term: "T", definition: "D", category: "location" }],
      { error: "no embedder", status: 400 as const }
    );

    expect(mockEmbedTexts).not.toHaveBeenCalled();
    expect(db.createTable).toHaveBeenCalledTimes(1);
  });

  it("embeds and stores when embedder is resolved", async () => {
    const db = createMockDb();
    mockGetVectorDb.mockReturnValue(db);
    mockEmbedTexts.mockResolvedValueOnce([[0.5, 0.6]]);

    await storeLoreCards(
      [{ term: "T", definition: "D", category: "location" }],
      { resolved: { provider: { id: "test", name: "Test Provider", baseUrl: "http://x", apiKey: "k", model: "m" }, temperature: 0, maxTokens: 512 } }
    );

    expect(mockEmbedTexts).toHaveBeenCalledTimes(1);
    expect(db.createTable).toHaveBeenCalledTimes(1);
  });

  it("falls back to no-vectors when embedding fails", async () => {
    const db = createMockDb();
    mockGetVectorDb.mockReturnValue(db);
    mockEmbedTexts.mockRejectedValueOnce(new Error("embed failed"));

    await storeLoreCards(
      [{ term: "T", definition: "D", category: "location" }],
      { resolved: { provider: { id: "test", name: "Test Provider", baseUrl: "http://x", apiKey: "k", model: "m" }, temperature: 0, maxTokens: 512 } }
    );

    expect(db.createTable).toHaveBeenCalledTimes(1);
  });
});

describe("updateLoreCard", () => {
  beforeEach(() => {
    mockGetVectorDb.mockReset();
    mockEmbedTexts.mockReset();
  });

  it("preserves ids and refreshes embeddings on edit", async () => {
    const db = createMockDb({
      hasTable: true,
      queryRows: [
        { id: "1", term: "Ironhaven", definition: "A fortified city.", category: "location" },
        { id: "2", term: "The Crown", definition: "A noble faction.", category: "faction" },
      ],
    });
    mockGetVectorDb.mockReturnValue(db);
    mockEmbedTexts.mockResolvedValueOnce([[0.9, 0.1], [0.2, 0.8]]);

    const updated = await updateLoreCard(
      "1",
      {
        term: "New Ironhaven",
        definition: "A rebuilt fortress-city.",
        category: "location",
      },
      {
        resolved: {
          provider: {
            id: "embedder",
            name: "Embedder",
            baseUrl: "http://localhost",
            apiKey: "key",
            model: "embed-model",
          },
          temperature: 0,
          maxTokens: 512,
        },
      },
    );

    expect(updated).toEqual({
      id: "1",
      term: "New Ironhaven",
      definition: "A rebuilt fortress-city.",
      category: "location",
    });
    expect(mockEmbedTexts).toHaveBeenCalledWith(
      [
        "New Ironhaven: A rebuilt fortress-city.",
        "The Crown: A noble faction.",
      ],
      expect.objectContaining({ model: "embed-model" }),
    );
    expect(db.dropTable).toHaveBeenCalledWith("lore_cards");
    expect(db.createTable).toHaveBeenCalledTimes(1);
    expect(db.createTable.mock.calls[0][1]).toEqual([
      {
        id: "1",
        term: "New Ironhaven",
        definition: "A rebuilt fortress-city.",
        category: "location",
        vector: [0.9, 0.1],
      },
      {
        id: "2",
        term: "The Crown",
        definition: "A noble faction.",
        category: "faction",
        vector: [0.2, 0.8],
      },
    ]);
  });

  it("fails edit when embedder is unavailable", async () => {
    await expect(() =>
      updateLoreCard(
        "1",
        {
          term: "New Ironhaven",
          definition: "A rebuilt fortress-city.",
          category: "location",
        },
        { error: "no embedder", status: 400 as const },
      ),
    ).rejects.toThrow("Embedder not configured. Lore edits require fresh embeddings.");
  });
});

describe("deleteLoreCardById", () => {
  beforeEach(() => {
    mockGetVectorDb.mockReset();
  });

  it("deletes only the targeted lore card", async () => {
    const db = createMockDb({
      hasTable: true,
      queryRows: [
        { id: "1" },
        { id: "2" },
      ],
    });
    mockGetVectorDb.mockReturnValue(db);

    const deleted = await deleteLoreCardById("1");

    expect(deleted).toBe(true);
    expect(db._mockTable.delete).toHaveBeenCalledWith("id = '1'");
  });

  it("returns false without deleting when the target card is missing", async () => {
    const db = createMockDb({
      hasTable: true,
      queryRows: [
        { id: "2" },
        { id: "3" },
      ],
    });
    mockGetVectorDb.mockReturnValue(db);

    const deleted = await deleteLoreCardById("1");

    expect(deleted).toBe(false);
    expect(db._mockTable.delete).not.toHaveBeenCalled();
  });
});
