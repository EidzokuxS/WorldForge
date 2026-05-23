import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVectorDb = vi.fn();
const mockEmbedTexts = vi.fn();
const mockGetDb = vi.fn();
const mockGetTurnContext = vi.fn();

vi.mock("../connection.js", () => ({
  getVectorDb: () => mockGetVectorDb(),
}));

vi.mock("../embeddings.js", () => ({
  embedTexts: (...args: unknown[]) => mockEmbedTexts(...args),
}));

vi.mock("../../db/index.js", () => ({
  getDb: () => mockGetDb(),
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
  }),
  getTurnContext: () => mockGetTurnContext(),
  withRole: <T,>(_role: string, fn: () => T) => fn(),
}));

import {
  clearPendingCommittedEvents,
  computeCompositeScore,
  drainPendingCommittedEvents,
  drainPendingCommittedEventsByIds,
  embedAndUpdateEvent,
  isDurableEventProjectionAllowed,
  readPendingCommittedEvents,
  readTurnDurableEventIds,
  acceptDurableEventsByIds,
  retractStoredEpisodicEvent,
  retractPendingCommittedEventsForTick,
  searchEpisodicEvents,
  storeEpisodicEvent,
} from "../episodic-events.js";

function createMockDb({
  hasTable = false,
  queryRows = [],
  vectorRows = [],
  vectorSearchThrows = false,
  tableNamesThrows = false,
  deleteThrows = false,
  schemaFields = [
    "campaignId",
    "id",
    "text",
    "tick",
    "location",
    "participants",
    "importance",
    "type",
    "visibility",
    "surfaceRoute",
    "knowledgeRoute",
    "hiddenCauseTerms",
  ],
  schemaThrows = false,
}: {
  hasTable?: boolean;
  queryRows?: Record<string, unknown>[];
  vectorRows?: Record<string, unknown>[];
  vectorSearchThrows?: boolean;
  tableNamesThrows?: boolean;
  deleteThrows?: boolean;
  schemaFields?: string[];
  schemaThrows?: boolean;
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
    delete: deleteThrows
      ? vi.fn().mockRejectedValue(new Error("vector delete failed"))
      : vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockReturnValue(queryBuilder),
    vectorSearch: vi.fn().mockReturnValue(vectorSearchBuilder),
    schema: schemaThrows
      ? vi.fn().mockRejectedValue(new Error("Dataset missing _versions"))
      : vi.fn().mockResolvedValue({
          fields: schemaFields.map((name) => ({ name })),
        }),
  };

  const db = {
    tableNames: tableNamesThrows
      ? vi.fn().mockRejectedValue(new Error("vector table list failed"))
      : vi.fn().mockResolvedValue(hasTable ? ["episodic_events"] : []),
    openTable: vi.fn().mockResolvedValue(table),
    createEmptyTable: vi.fn().mockResolvedValue(table),
    dropTable: vi.fn().mockResolvedValue(undefined),
  };

  return { db, table, queryBuilder, vectorSearchBuilder };
}

function createMockCampaignDb({
  location,
  ledgerStatus,
  selectResults,
  selectAllRows,
  selectAllThrows = false,
}: {
  location?: Record<string, unknown> | null;
  ledgerStatus?: string | null;
  selectResults?: Array<Record<string, unknown> | null | undefined>;
  selectAllRows?: Array<Record<string, unknown>>;
  selectAllThrows?: boolean;
} = {}) {
  const insertRun = vi.fn();
  const insertOnConflictDoNothing = vi.fn().mockReturnValue({ run: insertRun });
  const insertOnConflictDoUpdate = vi.fn().mockReturnValue({ run: insertRun });
  const insertValues = vi.fn().mockReturnValue({
    run: insertRun,
    onConflictDoNothing: insertOnConflictDoNothing,
    onConflictDoUpdate: insertOnConflictDoUpdate,
  });
  const insert = vi.fn().mockReturnValue({ values: insertValues });
  const updateRun = vi.fn();
  const updateWhere = vi.fn().mockReturnValue({ run: updateRun });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set: updateSet });
  const deleteRun = vi.fn();
  const deleteWhere = vi.fn().mockReturnValue({ run: deleteRun });
  const deleteFn = vi.fn().mockReturnValue({ where: deleteWhere });

  const defaultSelectResults = ledgerStatus === undefined
    ? [location]
    : [{ status: ledgerStatus }];
  const queuedSelectResults = selectResults ?? defaultSelectResults;
  let selectResultIndex = 0;
  const selectGet = vi.fn().mockImplementation(() => {
    const result = queuedSelectResults[
      Math.min(selectResultIndex, Math.max(queuedSelectResults.length - 1, 0))
    ];
    selectResultIndex += 1;
    return result;
  });
  const selectAll = selectAllThrows
    ? vi.fn().mockImplementation(() => {
        throw new Error("durable event ledger unavailable");
      })
    : vi.fn().mockReturnValue(selectAllRows ?? []);
  const where = vi.fn().mockReturnValue({ get: selectGet, all: selectAll });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  return {
    db: {
      select,
      insert,
      update,
      delete: deleteFn,
    },
    insertValues,
    insertOnConflictDoNothing,
    insertOnConflictDoUpdate,
    insertRun,
    updateSet,
    updateRun,
    deleteRun,
    selectGet,
    selectAll,
  };
}

describe("episodic-events", () => {
  beforeEach(() => {
    mockGetVectorDb.mockReset();
    mockEmbedTexts.mockReset();
    mockGetDb.mockReset();
    mockGetTurnContext.mockReset();
    mockGetTurnContext.mockReturnValue(undefined);
    mockGetDb.mockReturnValue(createMockCampaignDb({ location: null }).db);
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
        campaignId: "campaign-1",
        text: "The duel ended in a draw.",
        tick: 12,
        location: "Arena",
        participants: ["Hero", "Rival"],
        importance: 7,
        type: "combat",
        visibility: "report_only",
        surfaceRoute: "",
        knowledgeRoute: "",
        hiddenCauseTerms: [],
      });
    });

    it("records a produced durable-event ledger row inside the owning turn context", async () => {
      const { db } = createMockDb();
      const campaignDb = createMockCampaignDb({ location: null });
      mockGetVectorDb.mockReturnValue(db);
      mockGetDb.mockReturnValue(campaignDb.db);
      mockGetTurnContext.mockReturnValue({
        campaignId: "campaign-1",
        turnId: "turn-abc",
        tick: 14,
        role: "gm",
      });

      const eventId = await storeEpisodicEvent("campaign-1", {
        text: "The charter is accepted as binding.",
        tick: 14,
        location: "Guildhall",
        participants: ["Hero", "Clerk"],
        importance: 8,
        type: "dialogue",
      });

      expect(campaignDb.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId,
          campaignId: "campaign-1",
          turnId: "turn-abc",
          status: "produced",
          tick: 14,
          acceptedAt: null,
          projectedAt: null,
          retractedAt: null,
        }),
      );
      expect(campaignDb.insertOnConflictDoNothing).toHaveBeenCalledTimes(1);
      expect(campaignDb.insertRun).toHaveBeenCalled();
    });

    it("records detached durable writes as accepted system events instead of leaving them ledgerless", async () => {
      const { db } = createMockDb();
      const campaignDb = createMockCampaignDb({ location: null });
      mockGetVectorDb.mockReturnValue(db);
      mockGetDb.mockReturnValue(campaignDb.db);
      mockGetTurnContext.mockReturnValue(undefined);

      const eventId = await storeEpisodicEvent("campaign-1", {
        text: "The offscreen courier reached the rain gate.",
        tick: 18,
        location: "Rain Gate",
        participants: ["Courier"],
        importance: 6,
        type: "event",
      });

      expect(campaignDb.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId,
          campaignId: "campaign-1",
          turnId: "system:18",
          status: "accepted",
          tick: 18,
          acceptedAt: expect.any(Number),
          projectedAt: null,
          retractedAt: null,
        }),
      );
      expect(campaignDb.insertOnConflictDoNothing).toHaveBeenCalledTimes(1);
    });

    it("marks accepted durable events by id before async projection", () => {
      const campaignDb = createMockCampaignDb();
      mockGetDb.mockReturnValue(campaignDb.db);

      acceptDurableEventsByIds("campaign-1", [
        "evt-accepted",
        "evt-accepted",
        " ",
      ]);

      expect(campaignDb.updateSet).toHaveBeenCalledTimes(1);
      expect(campaignDb.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "accepted",
          acceptedAt: expect.any(Number),
          updatedAt: expect.any(Number),
        }),
      );
      expect(campaignDb.updateRun).toHaveBeenCalledTimes(1);
    });

    it("reads non-retracted durable event ids by turn for rollback cleanup", () => {
      const campaignDb = createMockCampaignDb({
        selectAllRows: [
          { eventId: "evt-produced", status: "produced" },
          { eventId: "evt-accepted", status: "accepted" },
          { eventId: "evt-projected", status: "projected" },
          { eventId: "evt-retracted", status: "retracted" },
        ],
      });
      mockGetDb.mockReturnValue(campaignDb.db);

      expect(readTurnDurableEventIds("campaign-1", "turn-abc")).toEqual([
        "evt-produced",
        "evt-accepted",
        "evt-projected",
      ]);
      expect(campaignDb.selectAll).toHaveBeenCalledTimes(1);
    });

    it("fails closed when rollback cannot read durable event ids", () => {
      const campaignDb = createMockCampaignDb({ selectAllThrows: true });
      mockGetDb.mockReturnValue(campaignDb.db);

      expect(() => readTurnDurableEventIds("campaign-1", "turn-abc")).toThrow(
        "durable event ledger unavailable",
      );
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
        campaignId: "campaign-1",
        text: "A bell rang in the tower.",
        tick: 13,
        location: "Tower",
        participants: ["Hero"],
        importance: 4,
        type: "event",
        visibility: "report_only",
      });
    });

    it("recreates a listed but unreadable episodic table before storing a committed event", async () => {
      const { db, table } = createMockDb({ hasTable: true, schemaThrows: true });
      mockGetVectorDb.mockReturnValue(db);

      await storeEpisodicEvent("campaign-1", {
        text: "The warden states the current proof requirement.",
        tick: 55,
        location: "Lantern-Lit Gondola Pier",
        participants: ["Lead Warden", "Mira Voss"],
        importance: 6,
        type: "dialogue",
      });

      expect(db.openTable).toHaveBeenCalledWith("episodic_events");
      expect(db.dropTable).toHaveBeenCalledWith("episodic_events");
      expect(db.createEmptyTable).toHaveBeenCalledTimes(1);
      expect(table.add).toHaveBeenCalledWith([
        expect.objectContaining({
          text: "The warden states the current proof requirement.",
          tick: 55,
          location: "Lantern-Lit Gondola Pier",
          participants: ["Lead Warden", "Mira Voss"],
          importance: 6,
          type: "dialogue",
        }),
      ]);
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

    it("writes a SQLite-backed location projection row with source traceability and anchored archived-scene spillover", async () => {
      const { db: vectorDb, table: vectorTable } = createMockDb();
      const { db: campaignDb, insertValues } = createMockCampaignDb({
        location: {
          id: "scene-1",
          campaignId: "campaign-1",
          name: "Collapsed Tunnel",
          kind: "ephemeral_scene",
          persistence: "ephemeral",
          anchorLocationId: "loc-anchor",
          archivedAtTick: 15,
        },
      });
      mockGetVectorDb.mockReturnValue(vectorDb);
      mockGetDb.mockReturnValue(campaignDb);

      await storeEpisodicEvent("campaign-1", {
        text: "The tunnel collapse left cursed residue in the crossing.",
        tick: 14,
        location: "Collapsed Tunnel",
        participants: ["Elara"],
        importance: 6,
        type: "event",
      });

      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: "campaign-1",
          locationId: "loc-anchor",
          sourceLocationId: "scene-1",
          anchorLocationId: "loc-anchor",
          eventType: "event",
          summary: "The tunnel collapse left cursed residue in the crossing.",
          tick: 14,
          importance: 6,
          visibility: "report_only",
          surfaceRoute: null,
          archivedAtTick: 15,
          sourceEventId: expect.any(String),
        }),
      );
    });

    it("keeps explicit player-visible episodic projections when a surface route is present", async () => {
      const { db: vectorDb, table: vectorTable } = createMockDb();
      const { db: campaignDb, insertValues } = createMockCampaignDb({
        location: {
          id: "public-square",
          campaignId: "campaign-1",
          name: "Public Square",
          kind: "macro",
          persistence: "persistent",
          anchorLocationId: null,
          archivedAtTick: null,
        },
      });
      mockGetVectorDb.mockReturnValue(vectorDb);
      mockGetDb.mockReturnValue(campaignDb);

      await storeEpisodicEvent("campaign-1", {
        text: "A public bell announces the gate schedule.",
        tick: 15,
        location: "Public Square",
        participants: ["Bell Keeper"],
        importance: 5,
        type: "event",
        visibility: "player_perceivable",
        surfaceRoute: "public_notice",
      });

      expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
        visibility: "player_perceivable",
        surfaceRoute: "public_notice",
      }));
      const rows = vectorTable.add.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
      expect(rows[0]).toMatchObject({
        visibility: "player_perceivable",
        surfaceRoute: "public_notice",
      });
    });

    it("propagates explicit visibility routes to location projections and pending same-turn evidence", async () => {
      const { db: vectorDb, table: vectorTable } = createMockDb();
      const { db: campaignDb, insertValues } = createMockCampaignDb({
        location: {
          id: "scene-actor-memory",
          campaignId: "campaign-1",
          name: "Moth Court",
          kind: "macro",
          persistence: "persistent",
          anchorLocationId: null,
          archivedAtTick: null,
        },
      });
      mockGetVectorDb.mockReturnValue(vectorDb);
      mockGetDb.mockReturnValue(campaignDb);

      await storeEpisodicEvent("campaign-1", {
        text: "Renn privately recognizes the sealed proof pattern.",
        tick: 14,
        location: "Moth Court",
        participants: ["Renn"],
        importance: 6,
        type: "event",
        visibility: "hidden",
        surfaceRoute: "actor_private_memory",
        knowledgeRoute: "memory",
        hiddenCauseTerms: ["sealed proof pattern"],
      });

      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: "hidden",
          surfaceRoute: "actor_private_memory",
          knowledgeRoute: "memory",
          hiddenCauseTerms: JSON.stringify(["sealed proof pattern"]),
        }),
      );
      const rows = vectorTable.add.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
      expect(rows[0]).toMatchObject({
        campaignId: "campaign-1",
        visibility: "hidden",
        surfaceRoute: "actor_private_memory",
        knowledgeRoute: "memory",
        hiddenCauseTerms: ["sealed proof pattern"],
      });
      expect(readPendingCommittedEvents("campaign-1", 14)).toEqual([
        expect.objectContaining({
          text: "Renn privately recognizes the sealed proof pattern.",
          visibility: "hidden",
          surfaceRoute: "actor_private_memory",
          knowledgeRoute: "memory",
          hiddenCauseTerms: ["sealed proof pattern"],
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

    it("promotes accepted durable memory by event id instead of post-turn tick", async () => {
      const { db } = createMockDb();
      mockGetVectorDb.mockReturnValue(db);

      const acceptedId = await storeEpisodicEvent("campaign-live", {
        text: "Accepted event from the old tick.",
        tick: 20,
        location: "Bazaar",
        participants: ["Greta the Merchant"],
        importance: 4,
        type: "event",
      });
      await storeEpisodicEvent("campaign-live", {
        text: "Unaccepted event from the same tick.",
        tick: 20,
        location: "Bazaar",
        participants: ["Greta the Merchant"],
        importance: 4,
        type: "event",
      });

      expect(drainPendingCommittedEventsByIds("campaign-live", [acceptedId])).toEqual([
        expect.objectContaining({ id: acceptedId, text: "Accepted event from the old tick." }),
      ]);
      expect(readPendingCommittedEvents("campaign-live", 20)).toEqual([
        expect.objectContaining({ text: "Unaccepted event from the same tick." }),
      ]);
    });

    it("retracts pending/vector/location projections for a rolled-back turn tick", async () => {
      const { db, table } = createMockDb({
        hasTable: true,
        queryRows: [{ id: "event-present" }],
      });
      const { db: campaignDb, deleteRun } = createMockCampaignDb();
      mockGetVectorDb.mockReturnValue(db);
      mockGetDb.mockReturnValue(campaignDb);

      const eventId = await storeEpisodicEvent("campaign-live", {
        text: "This rejected turn should not remain in memory.",
        tick: 20,
        location: "Bazaar",
        participants: ["Greta the Merchant"],
        importance: 7,
        type: "event",
      });

      await expect(retractPendingCommittedEventsForTick("campaign-live", 20)).resolves.toEqual([
        expect.objectContaining({
          eventId,
          vectorDeleted: true,
          pendingEvent: expect.objectContaining({ id: eventId }),
        }),
      ]);
      expect(table.delete).toHaveBeenCalledWith(`id = '${eventId}'`);
      expect(deleteRun).toHaveBeenCalledTimes(1);
      expect(readPendingCommittedEvents("campaign-live", 20)).toEqual([]);
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
      const campaignDb = createMockCampaignDb({
        selectResults: [
          { status: "accepted" },
          { status: "accepted" },
          { status: "accepted" },
          { status: "accepted" },
          { campaignId: "campaign-1" },
        ],
      });
      mockGetVectorDb.mockReturnValue(db);
      mockGetDb.mockReturnValue(campaignDb.db);
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

    it("projects only accepted durable events and records the projected ledger status", async () => {
      const existing = {
        id: "evt-ledger-accepted",
        text: "The signed writ becomes part of public memory.",
        tick: 8,
        location: "Guildhall",
        participants: ["Hero", "Archivist"],
        importance: 8,
        type: "event",
      };
      const { db, table } = createMockDb({ hasTable: true, queryRows: [existing] });
      const campaignDb = createMockCampaignDb({
        selectResults: [
          { status: "accepted" },
          { status: "accepted" },
          { status: "accepted" },
          { status: "accepted" },
          { campaignId: "campaign-1" },
        ],
      });
      mockGetVectorDb.mockReturnValue(db);
      mockGetDb.mockReturnValue(campaignDb.db);
      mockEmbedTexts.mockResolvedValue([[0.4, 0.6]]);

      await embedAndUpdateEvent("evt-ledger-accepted", existing.text, {
        id: "embedder",
        model: "test-model",
      } as never);

      expect(table.update).toHaveBeenCalledWith({
        where: "id = 'evt-ledger-accepted'",
        values: { vector: [0.4, 0.6] },
      });
      expect(campaignDb.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "projected",
          projectedAt: expect.any(Number),
          updatedAt: expect.any(Number),
        }),
      );
    });

    it("does not update an accepted event if it is retracted while embedding is in flight", async () => {
      const existing = {
        id: "evt-retracted-after-embed",
        text: "The signed writ was rolled back before projection.",
        tick: 9,
        location: "Guildhall",
        participants: ["Hero", "Archivist"],
        importance: 8,
        type: "event",
      };
      const { db, table } = createMockDb({ hasTable: true, queryRows: [existing] });
      const campaignDb = createMockCampaignDb({
        selectResults: [
          { status: "accepted" },
          { status: "retracted" },
        ],
      });
      mockGetVectorDb.mockReturnValue(db);
      mockGetDb.mockReturnValue(campaignDb.db);
      mockEmbedTexts.mockResolvedValue([[0.4, 0.6]]);

      await embedAndUpdateEvent("evt-retracted-after-embed", existing.text, {
        id: "embedder",
        model: "test-model",
      } as never);

      expect(mockEmbedTexts).toHaveBeenCalledWith([existing.text], {
        id: "embedder",
        model: "test-model",
      });
      expect(table.update).not.toHaveBeenCalled();
      expect(campaignDb.updateSet).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: "projected" }),
      );
    });

    it("does not embed an event after retry or undo retracted it", async () => {
      const existing = {
        id: "evt-retracted",
        text: "The old turn was reverted.",
        tick: 9,
        location: "Listening Post",
        participants: ["Aria"],
        importance: 8,
        type: "event",
      };
      const { db, table } = createMockDb({ hasTable: true, queryRows: [existing] });
      const campaignDb = createMockCampaignDb();
      mockGetVectorDb.mockReturnValue(db);
      mockGetDb.mockReturnValue(campaignDb.db);

      await retractStoredEpisodicEvent({
        campaignId: "campaign-retracted",
        eventId: "evt-retracted",
      });
      await embedAndUpdateEvent("evt-retracted", existing.text, {
        id: "embedder",
        model: "test-model",
      } as never);

      expect(mockEmbedTexts).not.toHaveBeenCalled();
      expect(table.update).not.toHaveBeenCalled();
      expect(campaignDb.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-retracted",
          campaignId: "campaign-retracted",
          status: "retracted",
          retractedAt: expect.any(Number),
        }),
      );
      expect(campaignDb.insertOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            status: "retracted",
            retractedAt: expect.any(Number),
          }),
        }),
      );
    });

    it("exposes a shared projection gate for detached non-vector projections", () => {
      const campaignDb = createMockCampaignDb({
        selectResults: [
          { status: "produced" },
          { status: "retracted" },
          { status: "accepted" },
          { status: "projected" },
          null,
        ],
      });
      mockGetDb.mockReturnValue(campaignDb.db);

      expect(isDurableEventProjectionAllowed("evt-produced")).toBe(false);
      expect(isDurableEventProjectionAllowed("evt-db-retracted")).toBe(false);
      expect(isDurableEventProjectionAllowed("evt-accepted")).toBe(true);
      expect(isDurableEventProjectionAllowed("evt-projected")).toBe(true);
      expect(isDurableEventProjectionAllowed("evt-legacy-without-ledger-row")).toBe(false);
    });

    it("writes a durable retraction tombstone so restored snapshots cannot erase rollback knowledge", async () => {
      const { db, insertValues, insertOnConflictDoUpdate } = createMockCampaignDb();
      mockGetDb.mockReturnValue(db);
      const { db: vectorDb } = createMockDb({ hasTable: false });
      mockGetVectorDb.mockReturnValue(vectorDb);

      await retractStoredEpisodicEvent({
        campaignId: "campaign-restored",
        eventId: "evt-restored-after-snapshot",
      });

      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-restored-after-snapshot",
          campaignId: "campaign-restored",
          turnId: "rollback:tombstone",
          status: "retracted",
          retractedAt: expect.any(Number),
        }),
      );
      expect(insertOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.anything(),
          set: expect.objectContaining({
            status: "retracted",
            retractedAt: expect.any(Number),
          }),
        }),
      );
    });

    it("still deletes location projections when vector deletion fails", async () => {
      const campaignDb = createMockCampaignDb();
      mockGetDb.mockReturnValue(campaignDb.db);
      const { db, table } = createMockDb({
        hasTable: true,
        queryRows: [{ id: "evt-vector-fails" }],
        deleteThrows: true,
      });
      mockGetVectorDb.mockReturnValue(db);

      await expect(retractStoredEpisodicEvent({
        campaignId: "campaign-restored",
        eventId: "evt-vector-fails",
      })).rejects.toThrow("Failed to retract all projections");

      expect(table.delete).toHaveBeenCalledWith("id = 'evt-vector-fails'");
      expect(campaignDb.deleteRun).toHaveBeenCalledTimes(1);
      expect(campaignDb.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-vector-fails",
          status: "retracted",
        }),
      );
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
      mockGetDb.mockReturnValue(createMockCampaignDb({
        selectResults: [
          { status: "accepted" },
          { status: "accepted" },
          { status: "accepted" },
          { status: "accepted" },
          { campaignId: "campaign-1" },
        ],
      }).db);
      mockEmbedTexts.mockResolvedValue([[0.5, 0.5]]);

      await embedAndUpdateEvent("evt-2", "The signal cut out again.", {
        id: "embedder",
        model: "test-model",
      } as never);

      expect(db.dropTable).toHaveBeenCalledWith("episodic_events");
      const migratedTable = await db.createEmptyTable.mock.results[0]?.value;
      expect(migratedTable.add).toHaveBeenCalledWith([
        expect.objectContaining({
          campaignId: "",
          id: "evt-2",
          text: "The signal cut out again.",
          tick: 7,
          location: "Listening Post",
          participants: ["Aria", "Greta"],
          importance: 9,
          type: "event",
          visibility: "report_only",
          surfaceRoute: "",
          knowledgeRoute: "",
          hiddenCauseTerms: [],
        }),
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

    it("filters player memory retrieval by campaign and player-visible audience", async () => {
      const { db } = createMockDb({
        hasTable: true,
        schemaFields: [
          "campaignId",
          "id",
          "text",
          "tick",
          "location",
          "participants",
          "importance",
          "type",
          "visibility",
          "surfaceRoute",
          "knowledgeRoute",
          "hiddenCauseTerms",
          "vector",
        ],
        vectorRows: [
          {
            campaignId: "campaign-live",
            id: "hidden-owning-actor-only",
            text: "Hidden actor memory should not enter player prompt.",
            tick: 21,
            location: "Bazaar",
            participants: ["Renn"],
            importance: 10,
            type: "event",
            visibility: "hidden",
            surfaceRoute: "actor_private_log_event",
            knowledgeRoute: "actor:npc-renn",
            hiddenCauseTerms: ["sealed proof"],
            vector: [0.1, 0.2],
            _distance: 0.01,
          },
          {
            campaignId: "",
            id: "legacy-blank-campaign",
            text: "Legacy blank-campaign memory must not enter scoped prompts.",
            tick: 21,
            location: "Bazaar",
            participants: ["Greta"],
            importance: 10,
            type: "event",
            visibility: "player_perceivable",
            surfaceRoute: "log_event",
            knowledgeRoute: "",
            hiddenCauseTerms: [],
            vector: [0.1, 0.2],
            _distance: 0.015,
          },
          {
            campaignId: "campaign-other",
            id: "other-campaign-public",
            text: "Other campaign event should not enter this prompt.",
            tick: 21,
            location: "Elsewhere",
            participants: ["Greta"],
            importance: 9,
            type: "event",
            visibility: "player_perceivable",
            surfaceRoute: "log_event",
            knowledgeRoute: "",
            hiddenCauseTerms: [],
            vector: [0.1, 0.2],
            _distance: 0.02,
          },
          {
            campaignId: "campaign-live",
            id: "public-live",
            text: "Public live event belongs in player memory.",
            tick: 20,
            location: "Bazaar",
            participants: ["Greta"],
            importance: 4,
            type: "event",
            visibility: "player_perceivable",
            surfaceRoute: "log_event",
            knowledgeRoute: "",
            hiddenCauseTerms: [],
            vector: [0.1, 0.2],
            _distance: 0.2,
          },
        ],
      });
      mockGetVectorDb.mockReturnValue(db);

      const results = await searchEpisodicEvents([0.1, 0.2], 21, 5, {
        kind: "player",
        campaignId: "campaign-live",
      });

      expect(results.map((event) => event.id)).toEqual(["public-live"]);
    });

    it("allows actor memory retrieval to see its own hidden events but not another actor's hidden events", async () => {
      const { db } = createMockDb({
        hasTable: true,
        schemaFields: [
          "campaignId",
          "id",
          "text",
          "tick",
          "location",
          "participants",
          "importance",
          "type",
          "visibility",
          "surfaceRoute",
          "knowledgeRoute",
          "hiddenCauseTerms",
          "vector",
        ],
        vectorRows: [
          {
            campaignId: "campaign-live",
            id: "own-hidden",
            text: "Renn remembers the private seal.",
            tick: 22,
            location: "Bazaar",
            participants: ["Renn"],
            importance: 10,
            type: "event",
            visibility: "hidden",
            surfaceRoute: "actor_private_log_event",
            knowledgeRoute: "actor:npc-renn",
            hiddenCauseTerms: ["private seal"],
            vector: [0.1, 0.2],
            _distance: 0.01,
          },
          {
            campaignId: "campaign-live",
            id: "other-hidden",
            text: "Mira's hidden memory must stay private.",
            tick: 22,
            location: "Bazaar",
            participants: ["Mira"],
            importance: 10,
            type: "event",
            visibility: "hidden",
            surfaceRoute: "actor_private_log_event",
            knowledgeRoute: "actor:npc-mira",
            hiddenCauseTerms: ["private seal"],
            vector: [0.1, 0.2],
            _distance: 0.02,
          },
        ],
      });
      mockGetVectorDb.mockReturnValue(db);

      const results = await searchEpisodicEvents([0.1, 0.2], 22, 5, {
        kind: "actor",
        campaignId: "campaign-live",
        actorId: "npc-renn",
      });

      expect(results.map((event) => event.id)).toEqual(["own-hidden"]);
    });
  });
});
