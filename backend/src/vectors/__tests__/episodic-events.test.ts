import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVectorDb = vi.fn();
const mockEmbedTexts = vi.fn();

vi.mock("../connection.js", () => ({
  getVectorDb: () => mockGetVectorDb(),
}));

vi.mock("../embeddings.js", () => ({
  embedTexts: (...args: unknown[]) => mockEmbedTexts(...args),
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import {
  clearPendingCommittedEvents,
  computeCompositeScore,
  drainPendingCommittedEvents,
  embedAndUpdateEvent,
  readPendingCommittedEvents,
  searchEpisodicEvents,
  storeEpisodicEvent,
} from "../episodic-events.js";

function createMockDb({
  hasTable = false,
  queryRows = [],
  vectorRows = [],
  vectorSearchThrows = false,
  schemaFields = ["id", "text", "tick", "location", "participants", "importance", "type"],
}: {
  hasTable?: boolean;
  queryRows?: Record<string, unknown>[];
  vectorRows?: Record<string, unknown>[];
  vectorSearchThrows?: boolean;
  schemaFields?: string[];
} = {}) {
  const queryBuilder = {
    where: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(queryRows),
  };

  const vectorSearchBuilder = {
    distanceType: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: vectorSearchThrows
      ? vi.fn().mockRejectedValue(new Error("vectorSearch failed"))
      : vi.fn().mockResolvedValue(vectorRows),
  };

  const table = {
    add: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockReturnValue(queryBuilder),
    vectorSearch: vi.fn().mockReturnValue(vectorSearchBuilder),
    schema: vi.fn().mockResolvedValue({
      fields: schemaFields.map((name) => ({ name })),
    }),
  };

  const db = {
    tableNames: vi.fn().mockResolvedValue(hasTable ? ["episodic_events"] : []),
    openTable: vi.fn().mockResolvedValue(table),
    createEmptyTable: vi.fn().mockResolvedValue(table),
    dropTable: vi.fn().mockResolvedValue(undefined),
  };

  return { db, table, queryBuilder, vectorSearchBuilder };
}

describe("episodic-events", () => {
  beforeEach(() => {
    mockGetVectorDb.mockReset();
    mockEmbedTexts.mockReset();
    clearPendingCommittedEvents("campaign-1");
    clearPendingCommittedEvents("campaign-live");
    clearPendingCommittedEvents("campaign-other");
    clearPendingCommittedEvents("campaign-clear");
  });

  describe("computeCompositeScore", () => {
    it("computes correct weighted score with all factors at max", () => {
      const score = computeCompositeScore(1.0, 10, 10, 10);
      expect(score).toBeCloseTo(1.0, 5);
    });

    it("computes correct weighted score with mixed values", () => {
      const score = computeCompositeScore(0.8, 5, 6, 10);
      expect(score).toBeCloseTo(0.65, 5);
    });

    it("handles currentTick=0 (recency defaults to 1.0)", () => {
      const score = computeCompositeScore(0.5, 0, 5, 0);
      expect(score).toBeCloseTo(0.65, 5);
    });

    it("handles importance=0", () => {
      const score = computeCompositeScore(1.0, 10, 0, 10);
      expect(score).toBeCloseTo(0.7, 5);
    });

    it("handles importance=10 (max)", () => {
      const score = computeCompositeScore(0.0, 1, 10, 10);
      expect(score).toBeCloseTo(0.33, 5);
    });

    it("old events have lower recency", () => {
      const scoreRecent = computeCompositeScore(0.8, 9, 5, 10);
      const scoreOld = computeCompositeScore(0.8, 1, 5, 10);
      expect(scoreRecent).toBeGreaterThan(scoreOld);
    });

    it("higher importance yields higher score", () => {
      const scoreHigh = computeCompositeScore(0.5, 5, 9, 10);
      const scoreLow = computeCompositeScore(0.5, 5, 2, 10);
      expect(scoreHigh).toBeGreaterThan(scoreLow);
    });

    it("higher similarity yields higher score", () => {
      const scoreHigh = computeCompositeScore(0.9, 5, 5, 10);
      const scoreLow = computeCompositeScore(0.2, 5, 5, 10);
      expect(scoreHigh).toBeGreaterThan(scoreLow);
    });
  });

  describe("storeEpisodicEvent", () => {
    it("creates an empty episodic table with stable schema, then adds the first row without a vector field", async () => {
      const { db, table } = createMockDb();
      mockGetVectorDb.mockReturnValue(db);

      await storeEpisodicEvent("campaign-1", {
        text: "The duel ended in a draw.",
        tick: 12,
        location: "Arena",
        participants: ["Hero", "Rival"],
        importance: 7,
        type: "combat",
      });

      expect(db.createEmptyTable).toHaveBeenCalledTimes(1);
      const rows = table.add.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toHaveProperty("vector");
      expect(rows[0]).toMatchObject({
        text: "The duel ended in a draw.",
        tick: 12,
        location: "Arena",
        participants: ["Hero", "Rival"],
        importance: 7,
        type: "combat",
      });
    });

    it("adds later episodic rows without vector when the table already exists", async () => {
      const { db, table } = createMockDb({ hasTable: true });
      mockGetVectorDb.mockReturnValue(db);

      await storeEpisodicEvent("campaign-1", {
        text: "A bell rang in the tower.",
        tick: 13,
        location: "Tower",
        participants: ["Hero"],
        importance: 4,
        type: "event",
      });

      const rows = table.add.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toHaveProperty("vector");
      expect(rows[0]).toMatchObject({
        text: "A bell rang in the tower.",
        tick: 13,
        location: "Tower",
        participants: ["Hero"],
        importance: 4,
        type: "event",
      });
    });

    it("queues same-turn pending evidence for committed events without requiring embeddings", async () => {
      const { db } = createMockDb();
      mockGetVectorDb.mockReturnValue(db);

      await storeEpisodicEvent("campaign-1", {
        text: "Greta warned the player about raiders.",
        tick: 14,
        location: "Market Square",
        participants: ["Greta the Merchant", "player"],
        importance: 6,
        type: "dialogue",
      });

      expect(readPendingCommittedEvents("campaign-1", 14)).toEqual([
        expect.objectContaining({
          text: "Greta warned the player about raiders.",
          tick: 14,
          location: "Market Square",
          participants: ["Greta the Merchant", "player"],
          importance: 6,
          type: "dialogue",
        }),
      ]);
    });

    it("keeps pending evidence campaign-scoped and tick-scoped, and drain clears queued committed events", async () => {
      const { db } = createMockDb();
      mockGetVectorDb.mockReturnValue(db);

      await storeEpisodicEvent("campaign-live", {
        text: "Greta made a same-turn evidence note.",
        tick: 20,
        location: "Bazaar",
        participants: ["Greta the Merchant"],
        importance: 4,
        type: "event",
      });
      await storeEpisodicEvent("campaign-live", {
        text: "Old stale turn evidence.",
        tick: 19,
        location: "Bazaar",
        participants: ["Greta the Merchant"],
        importance: 2,
        type: "event",
      });
      await storeEpisodicEvent("campaign-other", {
        text: "Wrong campaign evidence.",
        tick: 20,
        location: "Elsewhere",
        participants: ["Other NPC"],
        importance: 9,
        type: "event",
      });

      expect(readPendingCommittedEvents("campaign-live", 20)).toEqual([
        expect.objectContaining({ text: "Greta made a same-turn evidence note." }),
      ]);
      expect(readPendingCommittedEvents("campaign-live", 19)).toEqual([
        expect.objectContaining({ text: "Old stale turn evidence." }),
      ]);
      expect(readPendingCommittedEvents("campaign-other", 20)).toEqual([
        expect.objectContaining({ text: "Wrong campaign evidence." }),
      ]);

      expect(drainPendingCommittedEvents("campaign-live", 20)).toEqual([
        expect.objectContaining({ text: "Greta made a same-turn evidence note." }),
      ]);
      expect(readPendingCommittedEvents("campaign-live", 20)).toEqual([]);
      expect(readPendingCommittedEvents("campaign-live", 19)).toEqual([
        expect.objectContaining({ text: "Old stale turn evidence." }),
      ]);
      expect(readPendingCommittedEvents("campaign-other", 20)).toEqual([
        expect.objectContaining({ text: "Wrong campaign evidence." }),
      ]);
    });

    it("clears all queued committed events for one campaign regardless of tick", async () => {
      const { db } = createMockDb();
      mockGetVectorDb.mockReturnValue(db);

      await storeEpisodicEvent("campaign-clear", {
        text: "Tick 20 event.",
        tick: 20,
        location: "Bazaar",
        participants: ["Greta the Merchant"],
        importance: 4,
        type: "event",
      });
      await storeEpisodicEvent("campaign-clear", {
        text: "Tick 21 event.",
        tick: 21,
        location: "Bazaar",
        participants: ["Greta the Merchant"],
        importance: 4,
        type: "event",
      });
      await storeEpisodicEvent("campaign-other", {
        text: "Other campaign event.",
        tick: 20,
        location: "Elsewhere",
        participants: ["Other NPC"],
        importance: 9,
        type: "event",
      });

      clearPendingCommittedEvents("campaign-clear");

      expect(readPendingCommittedEvents("campaign-clear", 20)).toEqual([]);
      expect(readPendingCommittedEvents("campaign-clear", 21)).toEqual([]);
      expect(readPendingCommittedEvents("campaign-other", 20)).toEqual([
        expect.objectContaining({ text: "Other campaign event." }),
      ]);
    });
  });

  describe("embedAndUpdateEvent", () => {
    it("updates the stored row with the generated vector", async () => {
      const existing = {
        id: "evt-1",
        text: "The signal cut out.",
        tick: 6,
        location: "Listening Post",
        participants: ["Aria"],
        importance: 8,
        type: "event",
      };
      const { db, table } = createMockDb({ hasTable: true, queryRows: [existing] });
      mockGetVectorDb.mockReturnValue(db);
      mockEmbedTexts.mockResolvedValue([[0.25, 0.75]]);

      await embedAndUpdateEvent("evt-1", existing.text, {
        id: "embedder",
        model: "test-model",
      } as never);

      expect(table.update).toHaveBeenCalledWith({
        where: "id = 'evt-1'",
        values: { vector: [0.25, 0.75] },
      });
    });

    it("migrates legacy tables without a vector column before updating embeddings", async () => {
      const existing = {
        id: "evt-2",
        text: "The signal cut out again.",
        tick: 7,
        location: "Listening Post",
        participants: {
          toArray: () => ["Aria", "Greta"],
          isValid: vi.fn(),
        },
        importance: 9,
        type: "event",
      };
      const { db, table } = createMockDb({
        hasTable: true,
        queryRows: [existing],
        schemaFields: ["id", "text", "tick", "location", "participants", "importance", "type"],
      });
      mockGetVectorDb.mockReturnValue(db);
      mockEmbedTexts.mockResolvedValue([[0.5, 0.5]]);

      await embedAndUpdateEvent("evt-2", "The signal cut out again.", {
        id: "embedder",
        model: "test-model",
      } as never);

      expect(db.dropTable).toHaveBeenCalledWith("episodic_events");
      const migratedTable = await db.createEmptyTable.mock.results[0]?.value;
      expect(migratedTable.add).toHaveBeenCalledWith([
        {
          id: "evt-2",
          text: "The signal cut out again.",
          tick: 7,
          location: "Listening Post",
          participants: ["Aria", "Greta"],
          importance: 9,
          type: "event",
        },
      ]);
      expect(migratedTable.update).toHaveBeenCalledWith({
        where: "id = 'evt-2'",
        values: { vector: [0.5, 0.5] },
      });
    });
  });

  describe("searchEpisodicEvents", () => {
    it("returns an empty list without running vectorSearch when the table schema lacks a vector column", async () => {
      const { db, table } = createMockDb({
        hasTable: true,
        schemaFields: ["id", "text", "tick", "location", "participants", "importance", "type"],
      });
      mockGetVectorDb.mockReturnValue(db);

      const results = await searchEpisodicEvents([0.1, 0.2], 20, 5);

      expect(table.vectorSearch).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it("returns an empty list when vectorSearch fails before vectors exist", async () => {
      const { db, table } = createMockDb({
        hasTable: true,
        vectorSearchThrows: true,
        schemaFields: ["id", "text", "tick", "location", "participants", "importance", "type", "vector"],
      });
      mockGetVectorDb.mockReturnValue(db);

      const results = await searchEpisodicEvents([0.1, 0.2], 20, 5);

      expect(table.vectorSearch).toHaveBeenCalledWith([0.1, 0.2]);
      expect(results).toEqual([]);
    });
  });
});
