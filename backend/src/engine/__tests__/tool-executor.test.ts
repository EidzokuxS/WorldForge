import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const {
  accumulateReflectionBudgetMock,
  retractReflectionBudgetMock,
  retractStoredEpisodicEventMock,
} = vi.hoisted(() => ({
  accumulateReflectionBudgetMock: vi.fn(),
  retractReflectionBudgetMock: vi.fn(),
  retractStoredEpisodicEventMock: vi.fn(),
}));

// Mock modules before imports
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  storeEpisodicEvent: vi.fn(),
  retractStoredEpisodicEvent: retractStoredEpisodicEventMock,
}));

vi.mock("../reflection-budget.js", () => ({
  accumulateReflectionBudget: accumulateReflectionBudgetMock,
  retractReflectionBudget: retractReflectionBudgetMock,
}));

import {
  executeToolCall as executeToolCallRaw,
  toolRequiresExecutionAuthority,
  type ExecuteToolCallOptions,
  type ToolResult,
} from "../tool-executor.js";
import {
  applySuccessfulToolObservationToExecutionContext,
  createPlayerTurnToolExecutionContext,
  type ToolExecutionContext,
} from "../tool-execution-context.js";
import type { SceneFrame } from "../scene-frame.js";
import { isRuntimeToolName } from "../tool-contracts.js";
import { getDb } from "../../db/index.js";
import { storeEpisodicEvent } from "../../vectors/episodic-events.js";
import { buildAuthoritativeInventoryView } from "../../inventory/authority.js";

const CAMPAIGN_ID = "test-campaign-123";
const TICK = 5;

async function executeToolCall(
  campaignId: string,
  toolName: string,
  args: Record<string, unknown>,
  tick: number,
  outcomeTier?: string,
  executionContext?: ToolExecutionContext,
  options: ExecuteToolCallOptions = {},
): Promise<ToolResult> {
  const authorityOptions = executionContext === undefined
    && options.authorityMode === undefined
    && toolRequiresExecutionAuthority(toolName)
    ? { ...options, authorityMode: "legacy_unscoped" as const }
    : options;
  const result = await executeToolCallRaw(
    campaignId,
    toolName,
    args,
    tick,
    outcomeTier,
    executionContext,
    authorityOptions,
  );
  if (executionContext && result.success && isRuntimeToolName(toolName)) {
    applySuccessfulToolObservationToExecutionContext({
      toolName,
      toolInput: args,
      result,
      context: executionContext,
    });
  }
  return result;
}

function createPlayerTurnContext(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    scope: "player_turn",
    subjectActorId: "player-1",
    subjectActorRefs: new Set(["player-1", "player"]),
    authority: {
      baseWorldVersion: 0,
      sourceEntity: { type: "player", id: "player-1" },
      allowedWriteScopes: ["*"],
    },
    currentLocationId: "loc-current",
    currentSceneScopeId: "scene-current",
    legalLocationRefs: new Set(["current_location", "current_scene", "loc-current", "scene-current"]),
    legalActorRefs: new Set(["player-1", "player"]),
    legalItemRefs: new Set(),
    legalFactionRefs: new Set(),
    currentLocationRefs: new Set(["current_location", "loc-current", "shibuya district"]),
    currentSceneRefs: new Set(["current_scene", "scene-current", "kissaten alcove"]),
    legalMovementRefs: new Set(),
    ...overrides,
  };
}

// -- Helpers ------------------------------------------------------------------

function mockEntity(entity: { id: string; name: string; tags: string }) {
  return {
    get: vi.fn().mockReturnValue(entity),
    all: vi.fn().mockReturnValue([entity]),
  };
}

function mockNoEntity() {
  return {
    get: vi.fn().mockReturnValue(undefined),
    all: vi.fn().mockReturnValue([]),
  };
}

function createMockDb(options: {
  entity?: { id: string; name: string; tags: string } | null;
  updateFn?: Mock;
  insertFn?: Mock;
  entitiesByTable?: Record<string, { id: string; name: string; tags: string } | null>;
}) {
  const updateRun = options.updateFn ?? vi.fn().mockReturnValue({ changes: 1 });
  const insertRun = options.insertFn ?? vi.fn();
  const upsertRun = vi.fn();

  // Track which table is being queried for multi-table lookups
  let currentTable: string | null = null;

  const db = {
    transaction: vi.fn((operation: () => unknown) => operation()),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table: unknown) => {
      // Detect which table is being queried by checking the table's Symbol name or reference
      const tableName = (table as { _?: { name?: string } })?._ ?.name;
      currentTable = tableName ?? null;

      // If we have per-table entities, use them
      if (options.entitiesByTable && currentTable && currentTable in options.entitiesByTable) {
        const entity = options.entitiesByTable[currentTable];
        return {
          where: vi.fn().mockReturnValue(entity ? mockEntity(entity) : mockNoEntity()),
        };
      }

      // Default: use the single entity option
      if (options.entity === null || options.entity === undefined) {
        return { where: vi.fn().mockReturnValue(mockNoEntity()) };
      }
      return { where: vi.fn().mockReturnValue(mockEntity(options.entity)) };
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ run: updateRun }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        run: insertRun,
        onConflictDoUpdate: vi.fn().mockReturnValue({ run: upsertRun }),
      }),
    }),
  };

  return { db, updateRun, insertRun, upsertRun };
}

type MutableInventoryItem = {
  id: string;
  campaignId: string;
  name: string;
  tags: string;
  ownerId: string | null;
  locationId: string | null;
  equipState: "carried" | "equipped";
  equippedSlot: string | null;
  isSignature: boolean;
};

function getDrizzleTableName(table: unknown): string | null {
  return (table as Record<PropertyKey, unknown>)?.[Symbol.for("drizzle:Name")] as string | null;
}

function createMutableInventoryDb(options?: {
  players?: Array<Record<string, unknown>>;
  npcs?: Array<Record<string, unknown>>;
  locations?: Array<Record<string, unknown>>;
  locationEdges?: Array<Record<string, unknown>>;
  items?: MutableInventoryItem[];
}) {
  const state = {
    players: options?.players ?? [],
    npcs: options?.npcs ?? [],
    locations: options?.locations ?? [],
    locationEdges: options?.locationEdges ?? [],
    items: options?.items ?? [],
    worldClocks: [] as Array<Record<string, unknown>>,
    authorityTraces: [] as Array<Record<string, unknown>>,
    updateTables: [] as string[],
    insertedItems: [] as MutableInventoryItem[],
  };

  let lastTableName: string | null = null;

  const getRows = (tableName: string | null): Array<Record<string, unknown>> => {
    switch (tableName) {
      case "players":
        return state.players;
      case "npcs":
        return state.npcs;
      case "locations":
        return state.locations;
      case "location_edges":
        return state.locationEdges;
      case "items":
        return state.items;
      case "world_clocks":
        return state.worldClocks;
      case "authority_traces":
        return state.authorityTraces;
      default:
        return [];
    }
  };

  const matchesCondition = (
    row: Record<string, unknown>,
    condition: unknown,
    tableName: string | null = lastTableName,
  ): boolean => {
    const params = extractSqlStringParams(condition).map((entry) => entry.toLowerCase());
    if (params.length === 0) return true;
    const campaignId = typeof row.campaignId === "string" ? row.campaignId.toLowerCase() : null;
    if (campaignId && !params.includes(campaignId)) return false;
    const candidateValues = [
      row.id,
      row.name,
      row.toolResultId,
    ]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase());
    const identityParams = params.filter((param) => param !== campaignId);
    if (tableName === "authority_traces" && identityParams.length === 0) return false;
    if (identityParams.length === 0) return true;
    return identityParams.some((param) => candidateValues.includes(param));
  };

  const db = {
    transaction: vi.fn((operation: () => unknown) => operation()),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table: unknown) => {
      lastTableName = getDrizzleTableName(table);
      return db;
    }),
    where: vi.fn().mockImplementation((condition: unknown) => {
      if (lastTableName === "authority_traces") {
        return {
          get: vi.fn().mockReturnValue(undefined),
          all: vi.fn().mockReturnValue(state.authorityTraces),
        };
      }
      return {
        get: vi.fn().mockImplementation(() =>
          getRows(lastTableName).find((row) => matchesCondition(row, condition))),
        all: vi.fn().mockImplementation(() =>
          getRows(lastTableName).filter((row) => matchesCondition(row, condition))),
      };
    }),
    update: vi.fn().mockImplementation((table: unknown) => {
      const tableName = getDrizzleTableName(table);
      return {
        set: vi.fn().mockImplementation((values: Record<string, unknown>) => ({
          where: vi.fn().mockImplementation(() => ({
            run: vi.fn().mockImplementation(() => {
              state.updateTables.push(tableName ?? "unknown");
              const row = getRows(tableName)[0];
              if (row) {
                Object.assign(row, values);
              }
              return { changes: row ? 1 : 0 };
            }),
          })),
        })),
      };
    }),
    insert: vi.fn().mockImplementation((table: unknown) => {
      const tableName = getDrizzleTableName(table);
      return {
        values: vi.fn().mockImplementation((values: Record<string, unknown> | Record<string, unknown>[]) => ({
          run: vi.fn().mockImplementation(() => {
            const rows = Array.isArray(values) ? values : [values];
            const destination = getRows(tableName);
            for (const row of rows) {
              const inserted = { ...row };
              destination.push(inserted);
              if (tableName === "items") {
                state.insertedItems.push(inserted as MutableInventoryItem);
              }
            }
          }),
          onConflictDoUpdate: vi.fn().mockReturnValue({ run: vi.fn() }),
        })),
      };
    }),
  };

  return { db, state };
}

function extractSqlStringParams(value: unknown, seen = new Set<object>()): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return [];
  return chunks.flatMap((chunk) => extractSqlStringParams(chunk, seen));
}

function createStrictResolverDb(options?: {
  players?: Array<Record<string, unknown>>;
  npcs?: Array<Record<string, unknown>>;
  locations?: Array<Record<string, unknown>>;
  items?: MutableInventoryItem[];
  factions?: Array<Record<string, unknown>>;
}) {
  const state = {
    players: options?.players ?? [],
    npcs: options?.npcs ?? [],
    locations: options?.locations ?? [],
    items: options?.items ?? [],
    factions: options?.factions ?? [],
    relationships: [] as Array<Record<string, unknown>>,
    worldClocks: [] as Array<Record<string, unknown>>,
    authorityTraces: [] as Array<Record<string, unknown>>,
    actorKnowledgeRecords: [] as Array<Record<string, unknown>>,
    insertedItems: [] as MutableInventoryItem[],
    updateTables: [] as string[],
  };
  let lastTableName: string | null = null;

  const getRows = (tableName: string | null): Array<Record<string, unknown>> => {
    switch (tableName) {
      case "players":
        return state.players;
      case "npcs":
        return state.npcs;
      case "locations":
        return state.locations;
      case "items":
        return state.items;
      case "factions":
        return state.factions;
      case "relationships":
        return state.relationships;
      case "world_clocks":
        return state.worldClocks;
      case "authority_traces":
        return state.authorityTraces;
      case "actor_knowledge_records":
        return state.actorKnowledgeRecords;
      default:
        return [];
    }
  };

  const matchesCondition = (row: Record<string, unknown>, condition: unknown): boolean => {
    const params = extractSqlStringParams(condition).map((entry) => entry.toLowerCase());
    if (params.length === 0) return true;
    const campaignId = typeof row.campaignId === "string" ? row.campaignId.toLowerCase() : null;
    if (campaignId && !params.includes(campaignId)) return false;
    const id = typeof row.id === "string" ? row.id.toLowerCase() : null;
    const name = typeof row.name === "string" ? row.name.toLowerCase() : null;
    const toolResultId = typeof row.toolResultId === "string" ? row.toolResultId.toLowerCase() : null;
    const identityParams = params.filter((param) => param !== campaignId);
    if (lastTableName === "authority_traces" && identityParams.length === 0) return false;
    if (identityParams.length === 0) return true;
    return Boolean(
      (id && identityParams.includes(id))
      || (name && identityParams.includes(name))
      || (toolResultId && identityParams.includes(toolResultId)),
    );
  };

  const db = {
    transaction: vi.fn((operation: () => unknown) => operation()),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table: unknown) => {
      lastTableName = getDrizzleTableName(table);
      return db;
    }),
    where: vi.fn().mockImplementation((condition: unknown) => {
      if (lastTableName === "authority_traces") {
        return {
          get: vi.fn().mockReturnValue(undefined),
          all: vi.fn().mockReturnValue(state.authorityTraces),
        };
      }
      return {
        get: vi.fn().mockImplementation(() =>
          getRows(lastTableName).find((row) => matchesCondition(row, condition))),
        all: vi.fn().mockImplementation(() =>
          getRows(lastTableName).filter((row) => matchesCondition(row, condition))),
      };
    }),
    update: vi.fn().mockImplementation((table: unknown) => {
      const tableName = getDrizzleTableName(table);
      return {
        set: vi.fn().mockImplementation((values: Record<string, unknown>) => ({
          where: vi.fn().mockImplementation(() => ({
            run: vi.fn().mockImplementation(() => {
              state.updateTables.push(tableName ?? "unknown");
              const row = getRows(tableName)[0];
              if (row) Object.assign(row, values);
              return { changes: row ? 1 : 0 };
            }),
          })),
        })),
      };
    }),
    insert: vi.fn().mockImplementation((table: unknown) => {
      const tableName = getDrizzleTableName(table);
      return {
        values: vi.fn().mockImplementation((values: Record<string, unknown>) => ({
          run: vi.fn().mockImplementation(() => {
            const destination = getRows(tableName);
            destination.push({ ...values });
            if (tableName === "items") {
              state.insertedItems.push({ ...values } as MutableInventoryItem);
            }
          }),
          onConflictDoUpdate: vi.fn().mockReturnValue({ run: vi.fn() }),
        })),
      };
    }),
  };

  return { db, state };
}

// -- Tests --------------------------------------------------------------------

describe("executeToolCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns typed contract failure details for invalid terminal refs", async () => {
    const result = await executeToolCall(CAMPAIGN_ID, "record_world_fact", {
      sourceKind: "comparison",
      truthStatus: "disputed",
      factKind: "contradiction",
      topicKind: "procedure",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The mismatch controls the next route choice.",
      summary: "A posted record and route log disagree.",
      claims: [
        {
          claimKind: "contradiction",
          polarity: "unknown",
          subjectText: "posted record vs route log",
          summary: "The mismatch is unresolved.",
        },
      ],
      sourceRefs: ["raw-helper-id"],
    }, TICK, undefined, createPlayerTurnContext());

    expect(result.success).toBe(false);
    expect(result.status).toBe("failure");
    expect(result.error).toContain("Tool grounding failed");
    expect(result.contractFailure).toMatchObject({
      code: "invalid_source_ref",
      path: "input.sourceRefs.0",
      invalidRef: "raw-helper-id",
      retryable: true,
    });
    expect(result.contractFailure?.refHints).toContain("current_location");
    expect(getDb).not.toHaveBeenCalled();
  });

  describe("typed entity refs", () => {
    it("resolves typed refs after grounding instead of failing in executor lookups", async () => {
      const { db, state } = createStrictResolverDb({
        players: [{
          id: "player-1",
          campaignId: CAMPAIGN_ID,
          name: "Hero",
          tags: "[]",
          hp: 5,
        }],
        npcs: [{
          id: "npc-runner",
          campaignId: CAMPAIGN_ID,
          name: "Market Runner",
          tags: "[]",
          tier: "temporary",
        }],
        locations: [{
          id: "loc-1",
          campaignId: CAMPAIGN_ID,
          name: "Town Square",
          tags: "[]",
          kind: "macro",
          persistence: "persistent",
        }],
        items: [{
          id: "item-1",
          campaignId: CAMPAIGN_ID,
          name: "Iron Sword",
          tags: "[]",
          ownerId: null,
          locationId: "loc-1",
          equipState: "carried",
          equippedSlot: null,
          isSignature: false,
        }],
      });
      (getDb as Mock).mockReturnValue(db);
      const context = createPlayerTurnContext({
        scope: "actor_turn",
        legalActorRefs: new Set([
          "actor:player-1",
          "player-1",
          "Hero",
          "actor:npc-runner",
          "npc-runner",
          "Market Runner",
        ]),
        legalLocationRefs: new Set(["location:loc-1", "loc-1", "Town Square"]),
        currentLocationRefs: new Set(["current_location", "location:loc-1", "loc-1", "Town Square"]),
        currentSceneRefs: new Set(["current_scene", "location:loc-1", "loc-1", "Town Square"]),
        legalItemRefs: new Set(["item:item-1", "item-1", "Iron Sword"]),
      });

      await expect(executeToolCall(CAMPAIGN_ID, "spawn_item", {
        name: "Stamped Pass",
        tags: ["pass"],
        ownerName: "actor:player-1",
        ownerType: "character",
      }, TICK, undefined, context)).resolves.toMatchObject({ success: true });

      await expect(executeToolCall(CAMPAIGN_ID, "spawn_item", {
        name: "Counter Token",
        tags: ["token"],
        ownerName: "location:loc-1",
        ownerType: "location",
      }, TICK, undefined, context)).resolves.toMatchObject({ success: true });

      await expect(executeToolCall(CAMPAIGN_ID, "transfer_item", {
        itemName: "item:item-1",
        targetName: "actor:player-1",
        targetType: "character",
      }, TICK, undefined, context)).resolves.toMatchObject({ success: true });

      await expect(executeToolCall(CAMPAIGN_ID, "transfer_item", {
        itemName: "item:item-1",
        targetName: "location:loc-1",
        targetType: "location",
      }, TICK, undefined, context)).resolves.toMatchObject({ success: true });

      await expect(executeToolCall(CAMPAIGN_ID, "add_tag", {
        entityName: "item:item-1",
        entityType: "item",
        tag: "marked",
      }, TICK, undefined, context)).resolves.toMatchObject({ success: true });

      await expect(executeToolCall(CAMPAIGN_ID, "set_relationship", {
        entityA: "actor:player-1",
        entityB: "item:item-1",
        tag: "carries",
        reason: "The player now relies on the sword.",
      }, TICK, undefined, context)).resolves.toMatchObject({ success: true });

      await expect(executeToolCall(CAMPAIGN_ID, "promote_npc", {
        npcRef: "actor:npc-runner",
        newTier: "persistent",
        reason: "The runner became a reusable courier contact.",
      }, TICK, undefined, context)).resolves.toMatchObject({ success: true });

      expect(state.insertedItems.map((item) => item.name)).toEqual(
        expect.arrayContaining(["Stamped Pass", "Counter Token"]),
      );
      expect(state.updateTables).toContain("items");
      expect(state.updateTables).toContain("npcs");
    });
  });

  // -- add_tag ----------------------------------------------------------------

  describe("add_tag", () => {
    it("appends tag to entity's JSON tags column and returns success", async () => {
      const { db, updateRun } = createMockDb({
        entity: { id: "ent-1", name: "Gandalf", tags: '["wizard"]' },
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "add_tag", {
        entityName: "Gandalf",
        entityType: "npc",
        tag: "wise",
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        entity: "Gandalf",
        appliedTag: "wise",
        tags: ["wizard", "wise"],
      });
      expect(updateRun).toHaveBeenCalled();
    });

    it("returns error for non-existent entity", async () => {
      const { db } = createMockDb({ entity: null });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "add_tag", {
        entityName: "Nobody",
        entityType: "npc",
        tag: "invisible",
      }, TICK);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Entity not found");
    });

    it("does not add duplicate tags (idempotent)", async () => {
      const { db, updateRun } = createMockDb({
        entity: { id: "ent-1", name: "Gandalf", tags: '["wizard"]' },
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "add_tag", {
        entityName: "Gandalf",
        entityType: "npc",
        tag: "wizard",
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        entity: "Gandalf",
        appliedTag: "wizard",
        tags: ["wizard"],
      });
      // Update should still be called (idempotent set)
    });
  });

  // -- remove_tag -------------------------------------------------------------

  describe("remove_tag", () => {
    it("removes existing tag from entity and returns success", async () => {
      const { db, updateRun } = createMockDb({
        entity: { id: "ent-1", name: "Gandalf", tags: '["wizard", "wise"]' },
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "remove_tag", {
        entityName: "Gandalf",
        entityType: "npc",
        tag: "wise",
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        entity: "Gandalf",
        removedTag: "wise",
        tags: ["wizard"],
      });
      expect(updateRun).toHaveBeenCalled();
    });

    it("returns error when tag is not present", async () => {
      const { db } = createMockDb({
        entity: { id: "ent-1", name: "Gandalf", tags: '["wizard"]' },
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "remove_tag", {
        entityName: "Gandalf",
        entityType: "npc",
        tag: "nonexistent",
      }, TICK);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Tag not found");
    });

    it("returns error for non-existent entity", async () => {
      const { db } = createMockDb({ entity: null });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "remove_tag", {
        entityName: "Nobody",
        entityType: "npc",
        tag: "wizard",
      }, TICK);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Entity not found");
    });
  });

  // -- set_relationship -------------------------------------------------------

  describe("set_relationship", () => {
    it("upserts relationship row with tag and reason", async () => {
      const { db, upsertRun } = createMockDb({
        entity: { id: "ent-1", name: "Gandalf", tags: "[]" },
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "set_relationship", {
        entityA: "Gandalf",
        entityB: "Frodo",
        tag: "mentor",
        reason: "Guides Frodo on the quest",
      }, TICK);

      expect(result.success).toBe(true);
    });
  });

  // -- add_chronicle_entry ----------------------------------------------------

  describe("add_chronicle_entry", () => {
    it("inserts chronicle entry with tick and returns success with entry ID", async () => {
      const { db, insertRun } = createMockDb({ entity: null });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "add_chronicle_entry", {
        text: "The fellowship was formed",
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty("entryId");
      expect(typeof (result.result as { entryId: string }).entryId).toBe("string");
      expect(insertRun).toHaveBeenCalled();
    });
  });

  // -- log_event --------------------------------------------------------------

  describe("log_event", () => {
    it("defaults to scene_local and does not persist transient direct beats", async () => {
      const result = await executeToolCall(CAMPAIGN_ID, "log_event", {
        text: "Hero paid for coffee.",
        importance: 2,
        participants: ["Hero"],
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        durability: "scene_local",
        persisted: false,
      });
      expect(storeEpisodicEvent).not.toHaveBeenCalled();
      expect(accumulateReflectionBudgetMock).not.toHaveBeenCalled();
      expect(getDb).not.toHaveBeenCalled();
    });

    it("stores event metadata via storeEpisodicEvent and returns success", async () => {
      const { db } = createMockDb({ entity: null });
      (getDb as Mock).mockReturnValue(db);
      (storeEpisodicEvent as Mock).mockResolvedValue("event-123");

      const result = await executeToolCall(CAMPAIGN_ID, "log_event", {
        text: "Battle at the bridge",
        importance: 8,
        participants: ["Gandalf", "Balrog"],
        durability: "durable",
        futureRelevance: "This battle changes how both sides remember the bridge.",
      }, TICK);

      expect(result.success).toBe(true);
      expect(storeEpisodicEvent).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        expect.objectContaining({
          text: "Battle at the bridge",
          importance: 8,
          participants: ["Gandalf", "Balrog"],
          tick: TICK,
        })
      );
      expect(result.result).toMatchObject({
        eventId: "event-123",
        durability: "durable",
        persisted: true,
      });
    });

    it("accumulates reflection budget after committed log_event writes", async () => {
      const { db } = createMockDb({ entity: null });
      (getDb as Mock).mockReturnValue(db);
      (storeEpisodicEvent as Mock).mockResolvedValue("event-234");

      const result = await executeToolCall(CAMPAIGN_ID, "log_event", {
        text: "Greta and Balrog clash on the bridge",
        importance: 8,
        participants: ["Greta", "Balrog"],
        durability: "durable",
        futureRelevance: "The clash changes future reflection and relationship pressure.",
      }, TICK);

      expect(result.success).toBe(true);
      expect(accumulateReflectionBudgetMock).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        ["Greta", "Balrog"],
        8,
      );
    });

    it("retracts durable memory writes if final authority commit rejects the receipt", async () => {
      let worldClockReads = 0;
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        const tableName = getDrizzleTableName(table);
        if (tableName === "authority_traces") {
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockReturnValue(undefined),
              all: vi.fn().mockReturnValue([]),
            }),
          };
        }
        if (tableName === "players") {
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockReturnValue({ currentLocationId: null }),
            }),
          };
        }
        if (tableName === "world_clocks") {
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockImplementation(() => {
                worldClockReads += 1;
                return {
                  campaignId: CAMPAIGN_ID,
                  worldVersion: worldClockReads === 1 ? 0 : 1,
                  worldTimeMinutes: 0,
                  currentTick: 0,
                  updatedAt: 0,
                };
              }),
            }),
          };
        }
        return {
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(undefined),
          }),
        };
      });
      const db = {
        transaction: vi.fn((operation: () => unknown) => operation()),
        select: vi.fn().mockReturnValue({ from: selectFrom }),
      };
      (getDb as Mock).mockReturnValue(db);
      (storeEpisodicEvent as Mock).mockResolvedValue("event-rollback");

      const result = await executeToolCall(
        CAMPAIGN_ID,
        "log_event",
        {
          text: "A durable event races a stale authority clock.",
          importance: 7,
          participants: ["Greta"],
          durability: "durable",
          futureRelevance: "The event must disappear if authority rejects it.",
        },
        TICK,
        undefined,
        {
          scope: "background",
          subjectActorId: "system",
          subjectActorRefs: new Set(),
          authority: {
            baseWorldVersion: 0,
            sourceEntity: { type: "system", id: "test" },
            elapsedWorldTimeMinutes: 1,
            allowedWriteScopes: ["*"],
          },
          currentLocationId: null,
          currentSceneScopeId: null,
          legalLocationRefs: new Set(),
          legalActorRefs: new Set(),
          legalItemRefs: new Set(),
          legalFactionRefs: new Set(),
          currentLocationRefs: new Set(),
          currentSceneRefs: new Set(),
          legalMovementRefs: new Set(),
        },
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe("failure");
      expect(result.authority).toMatchObject({
        baseWorldVersion: 0,
        failureReason: expect.stringContaining("Stale world version"),
      });
      expect(storeEpisodicEvent).toHaveBeenCalled();
      expect(retractStoredEpisodicEventMock).toHaveBeenCalledWith({
        campaignId: CAMPAIGN_ID,
        eventId: "event-rollback",
      });
      expect(retractReflectionBudgetMock).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        ["Greta"],
        7,
      );
    });

    it("retracts durable record_world_fact knowledge if final authority commit rejects the receipt", async () => {
      const insertRun = vi.fn();
      const deleteRun = vi.fn().mockReturnValue({ changes: 1 });
      const getWorldClock = vi.fn().mockReturnValue({
        campaignId: CAMPAIGN_ID,
        worldVersion: 0,
        worldTimeMinutes: 0,
        currentTick: TICK,
        updatedAt: 0,
      });
      const db = {
        transaction: vi.fn((operation: () => unknown) => operation()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ get: getWorldClock }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ run: insertRun }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ run: deleteRun }),
        }),
      };
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(
        CAMPAIGN_ID,
        "record_world_fact",
        {
          sourceKind: "comparison",
          truthStatus: "verified",
          factKind: "procedure",
          topicKind: "route",
          durability: "durable",
          futureUseKind: "route_choice",
          futureRelevance: "The route contradiction controls later access.",
          summary: "The route log contradicts the posted office route.",
          claims: [{
            claimKind: "contradiction",
            polarity: "unknown",
            subjectText: "posted route and ledger route",
            summary: "The posted route and the ledger route disagree.",
          }],
          subjectRefs: ["player"],
          sourceRefs: ["current_location"],
        },
        TICK,
        undefined,
        createPlayerTurnContext({
          authority: {
            baseWorldVersion: 0,
            sourceEntity: { type: "player", id: "player-1" },
            elapsedWorldTimeMinutes: 1,
            allowedWriteScopes: ["event:unrelated"],
          },
        }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("authority_write_scope_mismatch");
      expect(insertRun).toHaveBeenCalled();
      expect(deleteRun).toHaveBeenCalled();
      expect(retractStoredEpisodicEventMock).not.toHaveBeenCalled();
      expect(retractReflectionBudgetMock).not.toHaveBeenCalled();
    });

    it("attaches the player's concrete current location when runtime state knows it", async () => {
      const selectCallCount = { n: 0 };
      const db = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockImplementation(() => {
          selectCallCount.n += 1;

          if (selectCallCount.n === 1) {
            return {
              where: vi.fn().mockReturnValue({
                get: vi.fn().mockReturnValue({
                  id: "player-1",
                  campaignId: CAMPAIGN_ID,
                  name: "Hero",
                  currentLocationId: "loc-1",
                }),
              }),
            };
          }

          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockReturnValue({
                id: "loc-1",
                campaignId: CAMPAIGN_ID,
                name: "Town Square",
              }),
            }),
          };
        }),
        update: vi.fn(),
        insert: vi.fn(),
      };
      (getDb as Mock).mockReturnValue(db);
      (storeEpisodicEvent as Mock).mockResolvedValue("event-345");

      const result = await executeToolCall(CAMPAIGN_ID, "log_event", {
        text: "The square bell rang out over the crowd.",
        importance: 5,
        participants: ["Hero"],
        durability: "durable",
        futureRelevance: "The bell marks a future-relevant public signal.",
      }, TICK);

      expect(result.success).toBe(true);
      expect(storeEpisodicEvent).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        expect.objectContaining({
          text: "The square bell rang out over the crowd.",
          location: "Town Square",
          tick: TICK,
        }),
      );
    });

    it("rejects durable log_event writes without a future relevance reason", async () => {
      const result = await executeToolCall(CAMPAIGN_ID, "log_event", {
        text: "Hero promised to return before dusk.",
        importance: 7,
        participants: ["Hero"],
        durability: "durable",
      }, TICK);

      expect(result.success).toBe(false);
      expect(result.error).toContain("futureRelevance");
      expect(storeEpisodicEvent).not.toHaveBeenCalled();
      expect(accumulateReflectionBudgetMock).not.toHaveBeenCalled();
      expect(getDb).not.toHaveBeenCalled();
    });
  });

  // -- offer_quick_actions ----------------------------------------------------

  describe("record_dialogue_outcome", () => {
    it("projects durable dialogue outcomes into player-known actor knowledge", async () => {
      const { db, state } = createStrictResolverDb({
        players: [{
          id: "player-1",
          campaignId: CAMPAIGN_ID,
          name: "Player",
          currentLocationId: "loc-depot",
          tags: "[]",
        }],
        locations: [{
          id: "loc-depot",
          campaignId: CAMPAIGN_ID,
          name: "Night Courier Depot",
          tags: "[]",
        }],
      });
      state.worldClocks.push({
        campaignId: CAMPAIGN_ID,
        worldVersion: 0,
        worldTimeMinutes: 80,
        currentTick: TICK,
        updatedAt: 0,
      });
      (getDb as Mock).mockReturnValue(db);
      (storeEpisodicEvent as Mock).mockResolvedValue("event-dialogue-1");

      const result = await executeToolCall(
        CAMPAIGN_ID,
        "record_dialogue_outcome",
        {
          speakerRef: "Lead Warden",
          addresseeRefs: ["Player"],
          outcomeKind: "answered",
          topicKind: "procedure",
          authorityKind: "role_authority",
          truthStatus: "speaker_asserted",
          durability: "durable",
          futureUseKind: "permission_check",
          futureRelevance: "The permit office locations control the player's later checkpoint route.",
          quote: "Transit permits come from the Guild licensing office. Tower Bridge Concourse has one, and the Night Courier Depot up the canal has another.",
          summary: "The warden says permits are issued at either Tower Bridge Concourse or Night Courier Depot.",
          claims: [{
            claimKind: "office",
            polarity: "states",
            subjectText: "Guild licensing office",
            summary: "Transit permits are issued at either Tower Bridge Concourse or Night Courier Depot.",
          }],
          sourceRefs: ["Lead Warden", "Player"],
        },
        TICK,
        undefined,
        createPlayerTurnContext({
          legalActorRefs: new Set(["player-1", "player", "lead warden"]),
          authority: {
            baseWorldVersion: 0,
            sourceEntity: { type: "player", id: "player-1" },
            elapsedWorldTimeMinutes: 1,
          },
        }),
      );

      expect(result.success).toBe(true);
      expect(state.actorKnowledgeRecords).toHaveLength(1);
      const knowledge = state.actorKnowledgeRecords[0];
      expect(knowledge.actorId).toBe("player-1");
      expect(knowledge.route).toBe("report_message");
      expect(knowledge.truthStatus).toBe("claimed");
      expect(knowledge.statement).toContain("Night Courier Depot");
      expect(JSON.parse(knowledge.sourceEventIds as string)).toEqual(["event-dialogue-1"]);
      expect(JSON.parse(knowledge.subjectRefs as string)).toEqual(expect.arrayContaining([
        "Lead Warden",
        "Guild licensing office",
      ]));
      expect(result.result).toMatchObject({
        eventId: "event-dialogue-1",
        knowledgeId: knowledge.id,
        factRef: `knowledge:${knowledge.id}`,
        persisted: true,
      });
      expect(result.authority?.knowledgeOutputs).toEqual(expect.arrayContaining([
        knowledge.id,
        `knowledge:${knowledge.id}`,
      ]));
    });
  });

  describe("offer_quick_actions", () => {
    it("returns actions passthrough with no DB interaction", async () => {
      const actions = [
        { label: "Attack", action: "Attack the goblin" },
        { label: "Flee", action: "Run away" },
        { label: "Talk", action: "Try to negotiate" },
      ];

      const result = await executeToolCall(CAMPAIGN_ID, "offer_quick_actions", {
        actions,
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ actions });
      // getDb should NOT have been called
      expect(getDb).not.toHaveBeenCalled();
    });
  });

  // -- Invalid entity type ----------------------------------------------------

  describe("invalid entity type", () => {
    it("returns error for invalid entity type", async () => {
      const result = await executeToolCall(CAMPAIGN_ID, "add_tag", {
        entityName: "X",
        entityType: "dragon",
        tag: "fire",
      }, TICK);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Tool schema validation failed for add_tag");
      expect(result.error).toContain("Invalid option");
    });
  });

  // -- spawn_npc --------------------------------------------------------------

  describe("spawn_npc", () => {
    it("inserts NPC at resolved location and returns success", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [{ id: "loc-1", name: "Tavern", tags: "[]" }],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_npc", {
        name: "Bartender",
        tags: ["friendly", "merchant"],
        locationRef: "current_scene",
      }, TICK, undefined, createPlayerTurnContext({
        scope: "background",
        currentLocationId: "loc-1",
        currentSceneScopeId: "loc-1",
      }));

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        name: "Bartender",
        locationId: "loc-1",
        locationName: "Tavern",
      });
      expect((result.result as { id: string }).id).toBeDefined();
      expect(state.npcs).toHaveLength(1);
    });

    it("returns error if location not found", async () => {
      const { db } = createMutableInventoryDb();
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_npc", {
        name: "Ghost",
        tags: ["scary"],
        locationRef: "current_scene",
      }, TICK, undefined, createPlayerTurnContext({
        scope: "background",
        currentLocationId: "loc-missing",
        currentSceneScopeId: "loc-missing",
      }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Location not found");
    });

    it("initializes spawned NPCs with local scene scope aligned to their entry location", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [{ id: "loc-1", name: "Tavern", tags: "[]" }],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_npc", {
        name: "Bartender",
        tags: ["friendly", "merchant"],
        locationRef: "current_scene",
      }, TICK, undefined, createPlayerTurnContext({
        scope: "background",
        currentLocationId: "loc-1",
        currentSceneScopeId: "loc-1",
      }));

      expect(result.success).toBe(true);
      expect(state.npcs[0]).toMatchObject({
        currentLocationId: "loc-1",
        currentSceneLocationId: "loc-1",
      });
    });

    it("rejects direct player-turn spawn_npc before grounding or DB mutation", async () => {
      const insertRun = vi.fn();
      const db = {
        select: vi.fn(),
        from: vi.fn(),
        where: vi.fn(),
        update: vi.fn(),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ run: insertRun }),
        }),
      };
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_npc", {
        name: "Outpost Cook",
        tags: ["service-staff"],
        locationRef: "current_scene",
      }, TICK, undefined, createPlayerTurnContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain("spawn_npc is not a player-turn model-facing tool");
      expect(insertRun).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("spawns with preferred locationRef and returns authoritative location metadata", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [{ id: "scene-current", name: "Kissaten Alcove", tags: "[]" }],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_npc", {
        name: "Counter Clerk",
        tags: ["service-staff"],
        locationRef: "current_scene",
      }, TICK, undefined, createPlayerTurnContext({ scope: "background" }));

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        name: "Counter Clerk",
        locationId: "scene-current",
        locationName: "Kissaten Alcove",
      });
      expect(state.npcs[0]).toMatchObject({
        currentLocationId: "scene-current",
        currentSceneLocationId: "scene-current",
      });
    });

    it("blocks direct player-turn spawn_npc even for a same-scene exact-name NPC", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-current",
            name: "Market Hall",
            kind: "macro",
            parentLocationId: null,
            tags: "[]",
          },
          {
            id: "scene-current",
            name: "Market Hall Counter",
            kind: "ephemeral_scene",
            parentLocationId: "loc-current",
            tags: "[]",
          },
        ],
        npcs: [
          {
            id: "npc-clerk",
            campaignId: CAMPAIGN_ID,
            name: "Window Clerk Nera",
            tier: "temporary",
            currentLocationId: "loc-current",
            currentSceneLocationId: "scene-current",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_npc", {
        name: "Window Clerk Nera",
        tags: ["service-staff", "clerk"],
        locationRef: "current_scene",
      }, TICK, undefined, createPlayerTurnContext({
        currentLocationId: "loc-current",
        currentSceneScopeId: "scene-current",
      }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("spawn_npc is not a player-turn model-facing tool");
      expect(state.npcs).toHaveLength(1);
    });

    it("keeps broad location on the parent macro when spawning into the current sublocation scene", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-current",
            name: "Shibuya District",
            kind: "macro",
            parentLocationId: null,
            tags: "[]",
          },
          {
            id: "scene-current",
            name: "Kissaten Alcove",
            kind: "persistent_sublocation",
            parentLocationId: "loc-current",
            tags: "[]",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_npc", {
        name: "Counter Clerk",
        tags: ["service-staff"],
        locationRef: "current_scene",
      }, TICK, undefined, createPlayerTurnContext({ scope: "background" }));

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        name: "Counter Clerk",
        locationId: "scene-current",
        locationName: "Kissaten Alcove",
        broadLocationId: "loc-current",
        sceneLocationId: "scene-current",
      });
      expect(state.npcs[0]).toMatchObject({
        currentLocationId: "loc-current",
        currentSceneLocationId: "scene-current",
        tier: "temporary",
      });
    });

    it("allows create_scene_extra to materialize a temporary NPC in a same-turn observed local sublocation", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-current",
            name: "Market Counter",
            kind: "macro",
            parentLocationId: null,
            tags: "[]",
          },
          {
            id: "loc-back-room",
            name: "Back Room",
            kind: "ephemeral_scene",
            parentLocationId: "loc-current",
            tags: "[]",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "create_scene_extra", {
        name: "Seal-Presser",
        role: "service",
        tags: ["support", "service-staff"],
        locationRef: "current_scene",
        reason: "The freshly revealed back room plausibly has a temporary service worker.",
      }, TICK, undefined, createPlayerTurnContext({
        scope: "actor_turn",
        currentLocationId: "loc-current",
        currentSceneScopeId: "loc-back-room",
        legalLocationRefs: new Set([
          "current_location",
          "current_scene",
          "loc-current",
          "scene-current",
          "loc-back-room",
          "back room",
        ]),
        sameTurnResultRefs: new Set(["loc-back-room", "back room", "location:loc-back-room"]),
      }));

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        kind: "scene_extra",
        name: "Seal-Presser",
        role: "service",
        locationId: "loc-back-room",
        locationName: "Back Room",
        broadLocationId: "loc-current",
        sceneLocationId: "loc-back-room",
      });
      expect(state.npcs[0]).toMatchObject({
        currentLocationId: "loc-current",
        currentSceneLocationId: "loc-back-room",
      });
    });
  });

  // -- promote_npc ------------------------------------------------------------

  describe("promote_npc", () => {
    it("promotes a visible temporary support NPC upward without rewriting characterRecord", async () => {
      const originalRecord = JSON.stringify({
        identity: { id: "npc-runner", name: "Market Runner", tier: "temporary" },
      });
      const { db, state } = createMutableInventoryDb({
        npcs: [
          {
            id: "npc-runner",
            campaignId: CAMPAIGN_ID,
            name: "Market Runner",
            persona: "messenger",
            characterRecord: originalRecord,
            derivedTags: "[]",
            tags: "[]",
            tier: "temporary",
            currentLocationId: "loc-current",
            currentSceneLocationId: "scene-current",
            goals: '{"short_term":[],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "promote_npc", {
        npcRef: "Market Runner",
        newTier: "persistent",
        reason: "The runner agreed to carry future messages.",
      }, TICK, undefined, createPlayerTurnContext({
        legalActorRefs: new Set(["player", "npc-runner", "market runner"]),
      }));

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        npcId: "npc-runner",
        name: "Market Runner",
        oldTier: "temporary",
        newTier: "persistent",
      });
      expect(state.npcs[0]).toMatchObject({
        tier: "persistent",
        characterRecord: originalRecord,
      });
    });

    it("rejects same-tier or downward promotion attempts", async () => {
      const { db, state } = createMutableInventoryDb({
        npcs: [
          {
            id: "npc-runner",
            campaignId: CAMPAIGN_ID,
            name: "Market Runner",
            persona: "messenger",
            characterRecord: "{}",
            derivedTags: "[]",
            tags: "[]",
            tier: "persistent",
            currentLocationId: "loc-current",
            currentSceneLocationId: "scene-current",
            goals: '{"short_term":[],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "promote_npc", {
        npcRef: "Market Runner",
        newTier: "persistent",
        reason: "No actual promotion happened.",
      }, TICK, undefined, createPlayerTurnContext({
        legalActorRefs: new Set(["player", "npc-runner", "market runner"]),
      }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Can only promote upward");
      expect(state.npcs[0]?.tier).toBe("persistent");
    });

    it("requires player-turn promotion targets to be visible local actors", async () => {
      const result = await executeToolCall(CAMPAIGN_ID, "promote_npc", {
        npcRef: "Hidden Watcher",
        newTier: "persistent",
        reason: "Hidden actors are not legal player-facing targets.",
      }, TICK, undefined, createPlayerTurnContext({
        legalActorRefs: new Set(["player"]),
      }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Tool grounding failed");
    });
  });

  // -- spawn_item -------------------------------------------------------------

  describe("spawn_item", () => {
    it("inserts item owned by character and returns success", async () => {
      const { db, insertRun } = createMockDb({
        entity: { id: "player-1", name: "Hero", tags: "[]" },
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_item", {
        name: "Iron Sword",
        tags: ["weapon", "iron"],
        ownerName: "Hero",
        ownerType: "character",
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        name: "Iron Sword",
        owner: "Hero",
      });
      expect(insertRun).toHaveBeenCalled();
    });

    it("inserts item at location and returns success", async () => {
      const { db, insertRun } = createMockDb({
        entity: { id: "loc-1", name: "Tavern", tags: "[]" },
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_item", {
        name: "Gold Coin",
        tags: ["currency"],
        ownerName: "Tavern",
        ownerType: "location",
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        name: "Gold Coin",
        owner: "Tavern",
      });
      expect(insertRun).toHaveBeenCalled();
    });

    it("returns error if owner not found", async () => {
      const { db } = createMockDb({ entity: null });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_item", {
        name: "Magic Ring",
        tags: ["magic"],
        ownerName: "Nobody",
        ownerType: "character",
      }, TICK);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("rejects player-turn item creation for hidden characters before DB mutation", async () => {
      const result = await executeToolCall(CAMPAIGN_ID, "spawn_item", {
        name: "Unsigned Pass",
        tags: ["pass"],
        ownerName: "Hidden Clerk",
        ownerType: "character",
      }, TICK, undefined, createPlayerTurnContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain("Tool grounding failed");
      expect(result.error).toContain("clear local actor");
      expect(getDb).not.toHaveBeenCalled();
    });

    it("rejects player-turn item creation for remote locations before DB mutation", async () => {
      const result = await executeToolCall(CAMPAIGN_ID, "spawn_item", {
        name: "Remote Cache Key",
        tags: ["key"],
        ownerName: "Remote Vault",
        ownerType: "location",
      }, TICK, undefined, createPlayerTurnContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain("Tool grounding failed");
      expect(result.error).toContain("local/current location ref");
      expect(getDb).not.toHaveBeenCalled();
    });

    it("allows item creation for visible actors and runtime-observed local locations", async () => {
      const { db, state } = createMutableInventoryDb({
        players: [
          {
            id: "player-1",
            campaignId: CAMPAIGN_ID,
            name: "Player",
            tags: "[]",
          },
        ],
        locations: [
          {
            id: "loc-back-room",
            name: "Back Room",
            kind: "ephemeral_scene",
            parentLocationId: "loc-current",
            tags: "[]",
          },
          {
            id: "loc-current",
            name: "Market Counter",
            kind: "macro",
            parentLocationId: null,
            tags: "[]",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);
      const context = createPlayerTurnContext({
        legalLocationRefs: new Set([
          "current_location",
          "current_scene",
          "loc-current",
          "scene-current",
          "loc-back-room",
          "back room",
        ]),
      });

      const characterResult = await executeToolCall(CAMPAIGN_ID, "spawn_item", {
        name: "Sealed Route Chit",
        tags: ["route-token", "persistent"],
        ownerName: "Player",
        ownerType: "character",
      }, TICK, undefined, context);
      const locationResult = await executeToolCall(CAMPAIGN_ID, "spawn_item", {
        name: "Ledger Stub",
        tags: ["evidence", "persistent"],
        ownerName: "Back Room",
        ownerType: "location",
      }, TICK, undefined, context);
      const locationIdResult = await executeToolCall(CAMPAIGN_ID, "spawn_item", {
        name: "Stamped Door Token",
        tags: ["token", "persistent"],
        ownerName: "Back Room",
        ownerType: "location",
      }, TICK, undefined, context);

      expect(characterResult.success).toBe(true);
      expect(locationResult.success).toBe(true);
      expect(locationIdResult.success).toBe(true);
      expect(state.insertedItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Sealed Route Chit",
            ownerId: "player-1",
          }),
          expect.objectContaining({
            name: "Ledger Stub",
            locationId: "loc-back-room",
          }),
          expect.objectContaining({
            name: "Stamped Door Token",
            locationId: "loc-back-room",
          }),
        ]),
      );
    });
  });

  // -- reveal_location --------------------------------------------------------

  describe("reveal_location", () => {
    it("inserts new location connected bidirectionally to existing one", async () => {
      const existingLocation = { id: "loc-1", name: "Town Square", tags: "[]" };
      const updateRun = vi.fn();
      const insertRun = vi.fn();

      // Need special mock: first select finds existing location, then select reads connectedTo
      const selectCallCount = { n: 0 };
      const db = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockImplementation(() => {
          selectCallCount.n++;
          if (selectCallCount.n <= 2) {
            // First calls: resolveEntity for the connected location
            return {
              where: vi.fn().mockReturnValue({
                get: vi.fn().mockReturnValue(existingLocation),
                all: vi.fn().mockReturnValue([existingLocation]),
              }),
            };
          }
          // Later call: reading existing location's full row for connectedTo update
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockReturnValue({ ...existingLocation, connectedTo: "[]" }),
              all: vi.fn().mockReturnValue([{ ...existingLocation, connectedTo: "[]" }]),
            }),
          };
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            run: insertRun,
            onConflictDoUpdate: vi.fn().mockReturnValue({ run: vi.fn() }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ run: updateRun }),
          }),
        }),
      };
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "reveal_location", {
        name: "Dark Alley",
        description: "A shadowy narrow passage",
        tags: ["dark", "dangerous"],
        connectedToName: "Town Square",
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        name: "Dark Alley",
        connectedTo: "Town Square",
      });
      expect(insertRun).toHaveBeenCalled();
      expect(updateRun).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it("creates a locally anchored ephemeral scene with lifetime metadata and authoritative refs", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-current",
            name: "Shibuya District",
            kind: "macro",
            parentLocationId: null,
            anchorLocationId: null,
            persistence: "persistent",
            tags: "[]",
            connectedTo: "[]",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "reveal_location", {
        name: "Kissaten Service Counter",
        description: "A narrow counter under the district cafe where orders and rumors trade hands.",
        tags: ["service", "local-stage"],
        connectedToName: "current_location",
      }, TICK, undefined, createPlayerTurnContext({
        currentSceneScopeId: null,
        legalLocationRefs: new Set(["current_location", "loc-current"]),
        currentSceneRefs: new Set(),
      }));

      expect(result.success).toBe(true);
      const created = state.locations.find((location) => location.name === "Kissaten Service Counter");
      expect(created).toMatchObject({
        kind: "ephemeral_scene",
        parentLocationId: "loc-current",
        anchorLocationId: "loc-current",
        persistence: "ephemeral",
        archivedAtTick: null,
      });
      expect(created?.expiresAtTick).toBeGreaterThan(TICK);
      expect(result.result).toMatchObject({
        id: created?.id,
        name: "Kissaten Service Counter",
        kind: "ephemeral_scene",
        parentLocationId: "loc-current",
        anchorLocationId: "loc-current",
        persistence: "ephemeral",
        expiresAtTick: created?.expiresAtTick,
        connectedTo: "Shibuya District",
      });
    });

    it("uses the settled world clock for reveal_location expiry after same-turn time advances", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-current",
            name: "Shibuya District",
            kind: "macro",
            parentLocationId: null,
            anchorLocationId: null,
            persistence: "persistent",
            tags: "[]",
            connectedTo: "[]",
          },
        ],
      });
      state.worldClocks.push({
        campaignId: CAMPAIGN_ID,
        worldVersion: 2,
        worldTimeMinutes: 72,
        currentTick: 72,
        updatedAt: 1,
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "reveal_location", {
        name: "Causeway Door",
        description: "A reachable door beyond the newly tested causeway.",
        tags: ["route", "local-stage"],
        connectedToName: "current_location",
      }, TICK, undefined, createPlayerTurnContext({
        authority: {
          baseWorldVersion: 2,
          sourceEntity: { type: "player", id: "player-1" },
        },
        currentSceneScopeId: null,
        legalLocationRefs: new Set(["current_location", "loc-current"]),
        currentSceneRefs: new Set(),
      }));

      expect(result.success, JSON.stringify(result)).toBe(true);
      const created = state.locations.find((location) => location.name === "Causeway Door");
      expect(created?.expiresAtTick).toBe(75);
      expect(created?.archivedAtTick).toBeNull();
    });

    it("accepts the current scene label as a reveal_location anchor without opening remote labels", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-current",
            name: "Shibuya District",
            kind: "macro",
            parentLocationId: null,
            anchorLocationId: null,
            persistence: "persistent",
            tags: "[]",
            connectedTo: "[]",
          },
          {
            id: "scene-current",
            name: "Kissaten Alcove",
            kind: "persistent_sublocation",
            parentLocationId: "loc-current",
            anchorLocationId: null,
            persistence: "persistent",
            tags: "[]",
            connectedTo: "[]",
          },
          {
            id: "loc-remote",
            name: "Forest Outpost",
            kind: "macro",
            parentLocationId: null,
            anchorLocationId: null,
            persistence: "persistent",
            tags: "[]",
            connectedTo: "[]",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const context = createPlayerTurnContext({
        currentLocationRefs: new Set(["current_location", "loc-current", "shibuya district"]),
        currentSceneRefs: new Set(["current_scene", "scene-current", "kissaten alcove"]),
        legalLocationRefs: new Set([
          "current_location",
          "current_scene",
          "loc-current",
          "shibuya district",
          "scene-current",
          "kissaten alcove",
        ]),
      });

      const localResult = await executeToolCall(CAMPAIGN_ID, "reveal_location", {
        name: "Kissaten Back Room",
        description: "A cramped service room behind the alcove curtain.",
        tags: ["service", "local-stage"],
        connectedToName: "Kissaten Alcove",
      }, TICK, undefined, context);
      const remoteResult = await executeToolCall(CAMPAIGN_ID, "reveal_location", {
        name: "Outpost Crawlspace",
        description: "A crawlspace in a remote outpost.",
        tags: ["remote"],
        connectedToName: "Forest Outpost",
      }, TICK, undefined, context);

      expect(localResult.success).toBe(true);
      expect(localResult.result).toMatchObject({
        name: "Kissaten Back Room",
        connectedTo: "Kissaten Alcove",
      });
      expect(state.locations.find((location) => location.name === "Kissaten Back Room")).toMatchObject({
        parentLocationId: "scene-current",
        anchorLocationId: "scene-current",
      });
      expect(remoteResult.success).toBe(false);
      expect(remoteResult.error).toContain("Tool grounding failed");
      expect(remoteResult.error).toContain("connectedToName");
    });

    it("returns error if connectedTo location not found", async () => {
      const { db } = createMockDb({ entity: null });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "reveal_location", {
        name: "Hidden Cave",
        description: "A secret cave",
        tags: ["hidden"],
        connectedToName: "Nowhere",
      }, TICK);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  // -- set_condition ----------------------------------------------------------

  describe("set_condition", () => {
    it("applies delta to player HP and clamps to 0-5", async () => {
      const updateRun = vi.fn();
      const db = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: "player-1",
              name: "Hero",
              tags: "[]",
              hp: 4,
            }),
          }),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ run: updateRun }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ run: vi.fn() }),
        }),
      };
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "set_condition", {
        targetName: "Hero",
        delta: -2,
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        entity: "Hero",
        oldHp: 4,
        newHp: 2,
        isDowned: false,
      });
      expect(updateRun).toHaveBeenCalled();
    });

    it("sets absolute HP value and returns isDowned when HP=0", async () => {
      const updateRun = vi.fn();
      const db = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: "player-1",
              name: "Hero",
              tags: "[]",
              hp: 3,
            }),
          }),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ run: updateRun }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ run: vi.fn() }),
        }),
      };
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "set_condition", {
        targetName: "Hero",
        value: 0,
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        entity: "Hero",
        oldHp: 3,
        newHp: 0,
        isDowned: true,
      });
    });

    it("clamps HP delta so it does not go below 0", async () => {
      const db = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: "player-1",
              name: "Hero",
              tags: "[]",
              hp: 2,
            }),
          }),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ run: vi.fn() }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ run: vi.fn() }),
        }),
      };
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "set_condition", {
        targetName: "Hero",
        delta: -10,
      }, TICK);

      expect(result.success).toBe(true);
      expect((result.result as { newHp: number }).newHp).toBe(0);
    });

    it("returns error if neither delta nor value provided", async () => {
      const result = await executeToolCall(CAMPAIGN_ID, "set_condition", {
        targetName: "Hero",
      }, TICK);

      expect(result.success).toBe(false);
      expect(result.error).toContain("delta or value");
    });

    it("returns error when targeting NPC (NPCs have no HP)", async () => {
      // Mock: players search returns null, npcs search returns the NPC
      const callCount = { n: 0 };
      const db = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockImplementation(() => {
          callCount.n++;
          if (callCount.n === 1) {
            // players table: not found
            return {
              where: vi.fn().mockReturnValue({
                get: vi.fn().mockReturnValue(undefined),
              }),
            };
          }
          // npcs table: found
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockReturnValue({
                id: "npc-1",
                name: "Guard",
                tags: "[]",
              }),
            }),
          };
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ run: vi.fn() }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ run: vi.fn() }),
        }),
      };
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "set_condition", {
        targetName: "Guard",
        delta: -1,
      }, TICK);

      expect(result.success).toBe(false);
      expect(result.error).toContain("NPCs do not have HP");
    });
  });

  // -- transfer_item ----------------------------------------------------------

  describe("transfer_item", () => {
    it("transfers item to a character", async () => {
      const updateRun = vi.fn();
      const callCount = { n: 0 };
      const db = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockImplementation(() => {
          callCount.n++;
          if (callCount.n === 1) {
            // items table: find the item
            return {
              where: vi.fn().mockReturnValue({
                get: vi.fn().mockReturnValue({
                  id: "item-1",
                  name: "Iron Sword",
                  tags: "[]",
                }),
              }),
            };
          }
          // players/npcs table: find the target character
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockReturnValue({
                id: "player-1",
                name: "Hero",
                tags: "[]",
              }),
            }),
          };
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ run: updateRun }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ run: vi.fn() }),
        }),
      };
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "transfer_item", {
        itemName: "Iron Sword",
        targetName: "Hero",
        targetType: "character",
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        item: "Iron Sword",
        target: "Hero",
      });
      expect(updateRun).toHaveBeenCalled();
    });

    it("returns error if item not found", async () => {
      const { db } = createMockDb({ entity: null });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "transfer_item", {
        itemName: "Nonexistent",
        targetName: "Hero",
        targetType: "character",
      }, TICK);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("defaults character-target pickup to carried on the authoritative item row", async () => {
      const { db, state } = createMutableInventoryDb({
        players: [{ id: "player-1", name: "Hero", hp: 5 }],
        items: [{
          id: "item-1",
          campaignId: CAMPAIGN_ID,
          name: "Iron Sword",
          tags: '["weapon"]',
          ownerId: null,
          locationId: "loc-1",
          equipState: "carried",
          equippedSlot: null,
          isSignature: false,
        }],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "transfer_item", {
        itemName: "Iron Sword",
        targetName: "Hero",
        targetType: "character",
      }, TICK);

      expect(result.success).toBe(true);
      expect(state.items[0]).toMatchObject({
        ownerId: "player-1",
        locationId: null,
        equipState: "carried",
        equippedSlot: null,
      });
      expect(
        buildAuthoritativeInventoryView(
          state.items.filter((item) => item.ownerId === "player-1"),
        ).carried.map((item) => item.name),
      ).toEqual(["Iron Sword"]);
      expect(state.updateTables).toEqual(["items"]);
    });

    it("treats npc/player/actor targetType aliases as character transfers", async () => {
      const { db, state } = createMutableInventoryDb({
        npcs: [{ id: "npc-clerk", name: "Bureau Window Clerk", hp: 5 }],
        items: [{
          id: "item-1",
          campaignId: CAMPAIGN_ID,
          name: "Stamped Token",
          tags: '["token"]',
          ownerId: "player-1",
          locationId: null,
          equipState: "carried",
          equippedSlot: null,
          isSignature: false,
        }],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "transfer_item", {
        itemName: "Stamped Token",
        targetName: "Bureau Window Clerk",
        targetType: "npc",
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        item: "Stamped Token",
        target: "Bureau Window Clerk",
        action: "carried",
      });
      expect(state.items[0]).toMatchObject({
        ownerId: "npc-clerk",
        locationId: null,
        equipState: "carried",
      });
    });

    it("equips an item by mutating the same authoritative row instead of a legacy projection", async () => {
      const { db, state } = createMutableInventoryDb({
        players: [{ id: "player-1", name: "Hero", hp: 5 }],
        items: [{
          id: "item-1",
          campaignId: CAMPAIGN_ID,
          name: "Iron Sword",
          tags: '["weapon"]',
          ownerId: null,
          locationId: "loc-1",
          equipState: "carried",
          equippedSlot: null,
          isSignature: false,
        }],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "transfer_item", {
        itemName: "Iron Sword",
        targetName: "Hero",
        targetType: "character",
        equipState: "equipped",
        equippedSlot: "main-hand",
      }, TICK);

      expect(result.success).toBe(true);
      expect(state.items[0]).toMatchObject({
        ownerId: "player-1",
        locationId: null,
        equipState: "equipped",
        equippedSlot: "main-hand",
      });
      expect(
        buildAuthoritativeInventoryView(
          state.items.filter((item) => item.ownerId === "player-1"),
        ).equipped.map((item) => item.name),
      ).toEqual(["Iron Sword"]);
      expect(state.updateTables).toEqual(["items"]);
    });

    it("drops an item to a location and clears equipped metadata on the authoritative row", async () => {
      const { db, state } = createMutableInventoryDb({
        players: [{ id: "player-1", name: "Hero", hp: 5 }],
        locations: [{ id: "loc-1", name: "Town Square", tags: "[]" }],
        items: [{
          id: "item-1",
          campaignId: CAMPAIGN_ID,
          name: "Iron Sword",
          tags: '["weapon"]',
          ownerId: "player-1",
          locationId: null,
          equipState: "equipped",
          equippedSlot: "main-hand",
          isSignature: false,
        }],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "transfer_item", {
        itemName: "Iron Sword",
        targetName: "Town Square",
        targetType: "location",
      }, TICK);

      expect(result.success).toBe(true);
      expect(state.items[0]).toMatchObject({
        ownerId: null,
        locationId: "loc-1",
        equipState: "carried",
        equippedSlot: null,
      });
      expect(
        buildAuthoritativeInventoryView(
          state.items.filter((item) => item.ownerId === "player-1"),
        ).items,
      ).toHaveLength(0);
      expect(state.updateTables).toEqual(["items"]);
    });

    it("splits a bundled item for partial transfer while preserving the holder's remainder", async () => {
      const { db, state } = createMutableInventoryDb({
        players: [{ id: "player-1", name: "Hero", hp: 5 }],
        locations: [{ id: "loc-1", name: "Bureau Window", tags: "[]" }],
        items: [{
          id: "item-1",
          campaignId: CAMPAIGN_ID,
          name: "Three Ration Slips",
          tags: '["ration","surety"]',
          ownerId: "player-1",
          locationId: null,
          equipState: "carried",
          equippedSlot: null,
          isSignature: true,
        }],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "transfer_item", {
        itemName: "Three Ration Slips",
        targetName: "Bureau Window",
        targetType: "location",
        transferredItemName: "Two Ration Slips",
        remainingItemName: "One Ration Slip",
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        item: "Two Ration Slips",
        splitFrom: "Three Ration Slips",
        remainingItem: "One Ration Slip",
        target: "Bureau Window",
        action: "dropped",
        partialTransfer: true,
      });
      expect(state.items[0]).toMatchObject({
        id: "item-1",
        name: "One Ration Slip",
        ownerId: "player-1",
        locationId: null,
        equipState: "carried",
        equippedSlot: null,
        isSignature: true,
      });
      expect(state.insertedItems).toHaveLength(1);
      expect(state.insertedItems[0]).toMatchObject({
        name: "Two Ration Slips",
        tags: '["ration","surety"]',
        ownerId: null,
        locationId: "loc-1",
        equipState: "carried",
        equippedSlot: null,
        isSignature: false,
      });
      expect(
        buildAuthoritativeInventoryView(
          state.items.filter((item) => item.ownerId === "player-1"),
        ).carried.map((item) => item.name),
      ).toEqual(["One Ration Slip"]);
      expect(state.updateTables).toEqual(["items"]);
    });

    it("unequips a same-owner item back to carried state when equip intent is omitted", async () => {
      const { db, state } = createMutableInventoryDb({
        players: [{ id: "player-1", name: "Hero", hp: 5 }],
        items: [{
          id: "item-1",
          campaignId: CAMPAIGN_ID,
          name: "Iron Sword",
          tags: '["weapon"]',
          ownerId: "player-1",
          locationId: null,
          equipState: "equipped",
          equippedSlot: "main-hand",
          isSignature: false,
        }],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "transfer_item", {
        itemName: "Iron Sword",
        targetName: "Hero",
        targetType: "character",
      }, TICK);

      expect(result.success).toBe(true);
      expect(state.items[0]).toMatchObject({
        ownerId: "player-1",
        locationId: null,
        equipState: "carried",
        equippedSlot: null,
      });
      expect(
        buildAuthoritativeInventoryView(
          state.items.filter((item) => item.ownerId === "player-1"),
        ).carried.map((item) => item.name),
      ).toEqual(["Iron Sword"]);
      expect(state.updateTables).toEqual(["items"]);
    });
  });

  describe("move_to", () => {
    it("realigns player scene scope to the destination on authoritative movement", async () => {
      const { db, state } = createMutableInventoryDb({
        players: [{
          id: "player-1",
          campaignId: CAMPAIGN_ID,
          name: "Hero",
          race: "Human",
          gender: "",
          age: "",
          appearance: "",
          hp: 5,
          tags: "[]",
          equippedItems: "[]",
          currentLocationId: "loc-1",
          currentSceneLocationId: null,
          characterRecord: JSON.stringify({
            identity: {
              id: "player-1",
              campaignId: CAMPAIGN_ID,
              role: "player",
              tier: "key",
              displayName: "Hero",
              canonicalStatus: "original",
            },
            profile: {
              species: "Human",
              gender: "",
              ageText: "",
              appearance: "",
              backgroundSummary: "",
              personaSummary: "",
            },
            socialContext: {
              factionId: null,
              factionName: null,
              homeLocationId: null,
              homeLocationName: null,
              currentLocationId: "loc-1",
              currentLocationName: "Town Square",
              relationshipRefs: [],
              socialStatus: [],
              originMode: "resident",
            },
            motivations: {
              shortTermGoals: [],
              longTermGoals: [],
              beliefs: [],
              drives: [],
              frictions: [],
            },
            capabilities: {
              traits: [],
              skills: [],
              flaws: [],
              specialties: [],
              wealthTier: null,
            },
            state: {
              hp: 5,
              conditions: [],
              statusFlags: [],
              activityState: "active",
            },
            loadout: {
              inventorySeed: [],
              equippedItemRefs: [],
              currencyNotes: "",
              signatureItems: [],
            },
            startConditions: {},
            provenance: {
              sourceKind: "generator",
              importMode: null,
              templateId: null,
              archetypePrompt: null,
              worldgenOrigin: null,
              legacyTags: [],
            },
          }),
          derivedTags: "[]",
        }],
        locations: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A busy square",
            tags: "[]",
            connectedTo: '["loc-2"]',
          },
          {
            id: "loc-2",
            campaignId: CAMPAIGN_ID,
            name: "Signal Tower",
            description: "An old relay station",
            tags: "[]",
            connectedTo: '["loc-1"]',
          },
        ],
        locationEdges: [
          {
            id: "edge-1",
            campaignId: CAMPAIGN_ID,
            fromLocationId: "loc-1",
            toLocationId: "loc-2",
            travelCost: 1,
            discovered: true,
          },
          {
            id: "edge-2",
            campaignId: CAMPAIGN_ID,
            fromLocationId: "loc-2",
            toLocationId: "loc-1",
            travelCost: 1,
            discovered: true,
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "move_to", {
        targetLocationName: "Signal Tower",
      }, TICK);

      expect(result.success).toBe(true);
      expect(state.players[0]).toMatchObject({
        currentLocationId: "loc-2",
        currentSceneLocationId: "loc-2",
      });
    });
  });

  describe("Phase 90 bridge state tools", () => {
    it("move_actor delegates through legal subject and route evidence and returns actor/destination refs", async () => {
      const { db, state } = createMutableInventoryDb({
        players: [{
          id: "player-1",
          campaignId: CAMPAIGN_ID,
          name: "Hero",
          race: "Human",
          gender: "",
          age: "",
          appearance: "",
          hp: 5,
          tags: "[]",
          equippedItems: "[]",
          currentLocationId: "loc-1",
          currentSceneLocationId: null,
          characterRecord: JSON.stringify({
            identity: {
              id: "player-1",
              campaignId: CAMPAIGN_ID,
              role: "player",
              tier: "key",
              displayName: "Hero",
              canonicalStatus: "original",
            },
            profile: {
              species: "Human",
              gender: "",
              ageText: "",
              appearance: "",
              backgroundSummary: "",
              personaSummary: "",
            },
            socialContext: {
              factionId: null,
              factionName: null,
              homeLocationId: null,
              homeLocationName: null,
              currentLocationId: "loc-1",
              currentLocationName: "Town Square",
              relationshipRefs: [],
              socialStatus: [],
              originMode: "resident",
            },
            motivations: {
              shortTermGoals: [],
              longTermGoals: [],
              beliefs: [],
              drives: [],
              frictions: [],
            },
            capabilities: {
              traits: [],
              skills: [],
              flaws: [],
              specialties: [],
              wealthTier: null,
            },
            state: {
              hp: 5,
              conditions: [],
              statusFlags: [],
              activityState: "active",
            },
            loadout: {
              inventorySeed: [],
              equippedItemRefs: [],
              currencyNotes: "",
              signatureItems: [],
            },
            startConditions: {},
            provenance: {
              sourceKind: "generator",
              importMode: null,
              templateId: null,
              archetypePrompt: null,
              worldgenOrigin: null,
              legacyTags: [],
            },
          }),
          derivedTags: "[]",
        }],
        locations: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A busy square",
            tags: "[]",
            connectedTo: '["loc-2"]',
          },
          {
            id: "loc-2",
            campaignId: CAMPAIGN_ID,
            name: "Tea Lane",
            description: "A narrow lane of stalls",
            tags: "[]",
            connectedTo: '["loc-1"]',
          },
        ],
        locationEdges: [
          {
            id: "route-tea-lane",
            campaignId: CAMPAIGN_ID,
            fromLocationId: "loc-1",
            toLocationId: "loc-2",
            travelCost: 1,
            discovered: true,
          },
          {
            id: "route-town-square",
            campaignId: CAMPAIGN_ID,
            fromLocationId: "loc-2",
            toLocationId: "loc-1",
            travelCost: 1,
            discovered: true,
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const context = createPlayerTurnContext({
        subjectActorRefs: new Set(["hero", "player-1"]),
        legalMovementRefs: new Set(["route-tea-lane", "loc-2", "tea lane"]),
        bridgeLookup: {
          current: {
            campaignId: CAMPAIGN_ID,
            tick: TICK,
            playerActorId: "player-1",
            currentLocationId: "loc-1",
            currentSceneScopeId: "loc-1",
            currentLocationName: "Town Square",
            currentSceneScopeName: "Town Square",
            currentLocationDescription: null,
            currentSceneScopeDescription: null,
          },
          visibleActors: [],
          awarenessHints: [],
          legalTargets: [],
          legalMovement: [{
            id: "route-tea-lane",
            locationId: "loc-2",
            label: "Tea Lane",
            connected: true,
            travelCost: 1,
            path: ["Town Square", "Tea Lane"],
          }],
          localRecentEvents: [],
          playerKnownFacts: [],
          allowedTools: ["move_actor"],
        },
      });

      const result = await executeToolCall(CAMPAIGN_ID, "move_actor", {
        actorRef: "Hero",
        destinationRef: "Tea Lane",
        evidenceRefs: ["Tea Lane"],
      }, TICK, undefined, context);

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        kind: "move_actor",
        actorRef: "Hero",
        locationId: "loc-2",
        locationName: "Tea Lane",
        travelCost: 1,
        path: ["Town Square", "Tea Lane"],
      });
      expect(state.players[0]).toMatchObject({
        currentLocationId: "loc-2",
        currentSceneLocationId: "loc-2",
      });
    });

    it("move_actor rejects unsupported remote destinations before movement", async () => {
      const context = createPlayerTurnContext({
        subjectActorRefs: new Set(["hero", "player-1"]),
        legalMovementRefs: new Set(["loc-2", "tea lane"]),
      });

      const result = await executeToolCall(CAMPAIGN_ID, "move_actor", {
        actorRef: "Hero",
        destinationRef: "Remote Outpost",
        evidenceRefs: ["Remote Outpost"],
      }, TICK, undefined, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Tool grounding failed");
      expect(result.error).toContain("connected movement candidate");
      expect(getDb).not.toHaveBeenCalled();
    });

    it("create_minor_poi creates a constrained local low-impact location", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [{
          id: "loc-market",
          campaignId: CAMPAIGN_ID,
          name: "Market District",
          description: "Public stalls and courier desks",
          tags: '["market"]',
          connectedTo: "[]",
        }],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "create_minor_poi", {
        areaRef: "current_location",
        poiType: "tea_stall",
        name: "Lantern Tea Stall",
        reason: "The public market supports ordinary tea service.",
      }, TICK, undefined, createPlayerTurnContext({
        currentLocationId: "loc-market",
        currentSceneScopeId: "loc-market",
        currentLocationRefs: new Set(["current_location", "loc-market", "market district"]),
        currentSceneRefs: new Set(["current_scene", "loc-market", "market district"]),
        legalLocationRefs: new Set(["current_location", "current_scene", "loc-market", "market district"]),
      }));

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        kind: "minor_poi",
        name: "Lantern Tea Stall",
        poiType: "tea_stall",
        impact: "low",
        delegateTool: "reveal_location",
      });
      expect(state.locations.find((location) => location.name === "Lantern Tea Stall")).toMatchObject({
        kind: "ephemeral_scene",
        parentLocationId: "loc-market",
        anchorLocationId: "loc-market",
      });
      expect(state.locationEdges).toHaveLength(2);
    });

    it("create_minor_poi rejects high-impact or secret places", async () => {
      const result = await executeToolCall(CAMPAIGN_ID, "create_minor_poi", {
        areaRef: "current_location",
        poiType: "tea_stall",
        name: "Secret Vault",
        reason: "The player wants a rare plot-critical weapon shop.",
      }, TICK, undefined, createPlayerTurnContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain("rejects high-impact");
      expect(getDb).not.toHaveBeenCalled();
    });

    it("create_scene_extra creates only a temporary current-scene support NPC", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-market",
            campaignId: CAMPAIGN_ID,
            name: "Market District",
            description: "Public stalls",
            tags: "[]",
          },
          {
            id: "scene-counter",
            campaignId: CAMPAIGN_ID,
            name: "Courier Counter",
            description: "A staffed courier desk",
            tags: "[]",
            kind: "ephemeral_scene",
            parentLocationId: "loc-market",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "create_scene_extra", {
        locationRef: "current_scene",
        role: "courier",
        name: "Counter Courier",
        reason: "A temporary clerk can answer routine public questions.",
      }, TICK, undefined, createPlayerTurnContext({
        currentLocationId: "loc-market",
        currentSceneScopeId: "scene-counter",
        currentLocationRefs: new Set(["current_location", "loc-market", "market district"]),
        currentSceneRefs: new Set(["current_scene", "scene-counter", "courier counter"]),
        legalLocationRefs: new Set([
          "current_location",
          "current_scene",
          "loc-market",
          "scene-counter",
          "market district",
          "courier counter",
        ]),
        legalActorRefs: new Set(["player-1", "player", "Counter Courier"]),
      }));

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        kind: "scene_extra",
        name: "Counter Courier",
        role: "courier",
        temporary: true,
        sceneLocationId: "scene-counter",
        broadLocationId: "loc-market",
      });
      expect(state.npcs[0]).toMatchObject({
        name: "Counter Courier",
        tier: "temporary",
        currentLocationId: "loc-market",
        currentSceneLocationId: "scene-counter",
      });
    });

    it("create_scene_extra reuses an existing same-scene support NPC instead of duplicating it", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-market",
            campaignId: CAMPAIGN_ID,
            name: "Market District",
            description: "Public stalls",
            tags: "[]",
          },
          {
            id: "scene-counter",
            campaignId: CAMPAIGN_ID,
            name: "Courier Counter",
            description: "A staffed courier desk",
            tags: "[]",
            kind: "ephemeral_scene",
            parentLocationId: "loc-market",
          },
        ],
        npcs: [
          {
            id: "npc-counter-courier",
            campaignId: CAMPAIGN_ID,
            name: "Counter Courier",
            persona: "courier",
            tier: "temporary",
            tags: "[]",
            currentLocationId: "loc-market",
            currentSceneLocationId: "scene-counter",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "create_scene_extra", {
        locationRef: "current_scene",
        role: "courier",
        name: "Counter Courier",
        reason: "The player is still speaking with the counter courier.",
      }, TICK, undefined, createPlayerTurnContext({
        currentLocationId: "loc-market",
        currentSceneScopeId: "scene-counter",
        currentLocationRefs: new Set(["current_location", "loc-market", "market district"]),
        currentSceneRefs: new Set(["current_scene", "scene-counter", "courier counter"]),
        legalLocationRefs: new Set([
          "current_location",
          "current_scene",
          "loc-market",
          "scene-counter",
          "market district",
          "courier counter",
        ]),
        legalActorRefs: new Set(["player-1", "player", "Counter Courier"]),
      }));

      expect(result.success).toBe(true);
      expect(result.kind).toBe("observation");
      expect(result.result).toMatchObject({
        name: "Counter Courier",
        kind: "scene_extra",
        reusedExisting: true,
        delegateTool: "existing_npc",
      });
      expect(JSON.stringify(result.result)).not.toContain("npc-counter-courier");
      expect(JSON.stringify(result.result)).not.toContain("loc-market");
      expect(JSON.stringify(result.result)).not.toContain("scene-counter");
      expect(state.npcs).toHaveLength(1);
    });

    it("create_scene_extra does not reuse a hidden same-scene temporary NPC by role intent", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-market",
            campaignId: CAMPAIGN_ID,
            name: "Market District",
            description: "Public stalls",
            tags: "[]",
          },
          {
            id: "scene-counter",
            campaignId: CAMPAIGN_ID,
            name: "Courier Counter",
            description: "A staffed courier desk",
            tags: "[]",
            kind: "ephemeral_scene",
            parentLocationId: "loc-market",
          },
        ],
        npcs: [
          {
            id: "npc-hidden-counter-witness",
            campaignId: CAMPAIGN_ID,
            name: "Hidden Counter Witness",
            persona: "civilian witness who stays out of sight",
            tier: "temporary",
            tags: "[\"temporary\",\"witness\",\"civilian\"]",
            currentLocationId: "loc-market",
            currentSceneLocationId: "scene-counter",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "create_scene_extra", {
        locationRef: "current_scene",
        role: "witness",
        roleText: "civilian witness",
        name: "Counter Civilian Witness",
        tags: ["witness", "civilian"],
        reason: "A current-scene witness can answer what the wardens said today.",
      }, TICK, undefined, createPlayerTurnContext({
        currentLocationId: "loc-market",
        currentSceneScopeId: "scene-counter",
        currentLocationRefs: new Set(["current_location", "loc-market", "market district"]),
        currentSceneRefs: new Set(["current_scene", "scene-counter", "courier counter"]),
        legalLocationRefs: new Set([
          "current_location",
          "current_scene",
          "loc-market",
          "scene-counter",
          "market district",
          "courier counter",
        ]),
      }));

      expect(result.success).toBe(true);
      expect(result.kind).not.toBe("observation");
      expect(result.result).toMatchObject({
        kind: "scene_extra",
        name: "Counter Civilian Witness",
        delegateTool: "spawn_npc",
      });
      expect(state.npcs).toHaveLength(2);
      expect(state.npcs[0]).toMatchObject({
        id: "npc-hidden-counter-witness",
        currentSceneLocationId: "scene-counter",
      });
      expect(state.npcs[1]).toMatchObject({
        name: "Counter Civilian Witness",
        tier: "temporary",
        currentLocationId: "loc-market",
        currentSceneLocationId: "scene-counter",
      });
    });

    it("create_scene_extra does not reuse a hidden same-scene NPC leaked through raw target candidates", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-market",
            campaignId: CAMPAIGN_ID,
            name: "Market District",
            description: "Public stalls",
            tags: "[]",
          },
          {
            id: "scene-counter",
            campaignId: CAMPAIGN_ID,
            name: "Courier Counter",
            description: "A staffed courier desk",
            tags: "[]",
            kind: "ephemeral_scene",
            parentLocationId: "loc-market",
          },
        ],
        npcs: [
          {
            id: "npc-hidden-counter-witness",
            campaignId: CAMPAIGN_ID,
            name: "Hidden Counter Witness",
            persona: "civilian witness who stays out of sight",
            tier: "temporary",
            tags: "[\"temporary\",\"witness\",\"civilian\"]",
            currentLocationId: "loc-market",
            currentSceneLocationId: "scene-counter",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);
      const frame: SceneFrame = {
        campaignId: CAMPAIGN_ID,
        tick: TICK,
        worldVersion: 0,
        playerActorId: "player-1",
        currentLocationId: "loc-market",
        currentSceneScopeId: "scene-counter",
        currentLocationName: "Market District",
        currentSceneScopeName: "Courier Counter",
        playerAction: "Find a visible witness near the counter.",
        roster: {
          active: [
            {
              id: "player-1",
              actorId: "player-1",
              type: "player",
              label: "Hero",
              locationId: "loc-market",
              sceneScopeId: "scene-counter",
              awareness: "clear",
            },
          ],
          support: [],
          background: [],
        },
        perception: {
          playerAwarenessHints: ["Someone may be listening behind the counter curtain."],
          actorAwareness: {},
          forbiddenActorIds: ["npc-hidden-counter-witness"],
          forbiddenActorLabels: ["Hidden Counter Witness"],
        },
        recentEvents: [],
        targetCandidates: [
          {
            id: "npc-hidden-counter-witness",
            type: "actor",
            label: "Hidden Counter Witness",
            actorId: "npc-hidden-counter-witness",
            awareness: "hint",
            tags: ["witness", "civilian"],
          },
        ],
        movementCandidates: [],
        deferredHooks: [],
        allowedTools: ["create_scene_extra"],
        oracle: null,
      };
      const context = createPlayerTurnToolExecutionContext(frame);

      expect(context.legalActorRefs.has("hidden counter witness")).toBe(false);

      const result = await executeToolCall(CAMPAIGN_ID, "create_scene_extra", {
        locationRef: "current_scene",
        role: "witness",
        roleText: "civilian witness",
        name: "Counter Civilian Witness",
        tags: ["witness", "civilian"],
        reason: "A current-scene witness can answer what the wardens said today.",
      }, TICK, undefined, context);

      expect(result.success).toBe(true);
      expect(result.kind).not.toBe("observation");
      expect(result.result).toMatchObject({
        kind: "scene_extra",
        name: "Counter Civilian Witness",
        delegateTool: "spawn_npc",
      });
      expect(JSON.stringify(result.result)).not.toContain("Hidden Counter Witness");
      expect(state.npcs).toHaveLength(2);
    });

    it("create_scene_extra does not reuse a broad-location hidden temporary NPC by role intent", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-market",
            campaignId: CAMPAIGN_ID,
            name: "Market District",
            description: "Public stalls",
            tags: "[]",
          },
          {
            id: "scene-counter",
            campaignId: CAMPAIGN_ID,
            name: "Courier Counter",
            description: "A staffed courier desk",
            tags: "[]",
            kind: "ephemeral_scene",
            parentLocationId: "loc-market",
          },
        ],
        npcs: [
          {
            id: "npc-distant-gondolier",
            campaignId: CAMPAIGN_ID,
            name: "Gondolier",
            persona: "civilian witness who overhears courier delays",
            tier: "temporary",
            tags: "[\"temporary\",\"witness\",\"civilian\"]",
            currentLocationId: "loc-market",
            currentSceneLocationId: null,
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "create_scene_extra", {
        locationRef: "current_scene",
        role: "witness",
        roleText: "civilian witness",
        name: "Counter Civilian Witness",
        tags: ["witness", "civilian"],
        reason: "A current-scene witness can answer what the wardens said today.",
      }, TICK, undefined, createPlayerTurnContext({
        currentLocationId: "loc-market",
        currentSceneScopeId: "scene-counter",
        currentLocationRefs: new Set(["current_location", "loc-market", "market district"]),
        currentSceneRefs: new Set(["current_scene", "scene-counter", "courier counter"]),
        legalLocationRefs: new Set([
          "current_location",
          "current_scene",
          "loc-market",
          "scene-counter",
          "market district",
          "courier counter",
        ]),
      }));

      expect(result.success).toBe(true);
      expect(result.kind).not.toBe("observation");
      expect(result.result).toMatchObject({
        kind: "scene_extra",
        name: "Counter Civilian Witness",
        delegateTool: "spawn_npc",
      });
      expect(state.npcs).toHaveLength(2);
      expect(state.npcs[0]).toMatchObject({
        id: "npc-distant-gondolier",
        currentSceneLocationId: null,
      });
      expect(state.npcs[1]).toMatchObject({
        name: "Counter Civilian Witness",
        tier: "temporary",
        currentLocationId: "loc-market",
        currentSceneLocationId: "scene-counter",
      });
    });

    it("create_scene_extra does not reuse a broad-location hidden temporary NPC by exact name", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-market",
            campaignId: CAMPAIGN_ID,
            name: "Market District",
            description: "Public stalls",
            tags: "[]",
          },
          {
            id: "scene-counter",
            campaignId: CAMPAIGN_ID,
            name: "Courier Counter",
            description: "A staffed courier desk",
            tags: "[]",
            kind: "ephemeral_scene",
            parentLocationId: "loc-market",
          },
        ],
        npcs: [
          {
            id: "npc-distant-gondolier",
            campaignId: CAMPAIGN_ID,
            name: "Gondolier",
            persona: "civilian witness who overhears courier delays",
            tier: "temporary",
            tags: "[\"temporary\",\"witness\",\"civilian\"]",
            currentLocationId: "loc-market",
            currentSceneLocationId: null,
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "create_scene_extra", {
        locationRef: "current_scene",
        role: "witness",
        roleText: "civilian witness",
        name: "Gondolier",
        tags: ["witness", "civilian"],
        reason: "A current-scene witness can answer what the wardens said today.",
      }, TICK, undefined, createPlayerTurnContext({
        currentLocationId: "loc-market",
        currentSceneScopeId: "scene-counter",
        currentLocationRefs: new Set(["current_location", "loc-market", "market district"]),
        currentSceneRefs: new Set(["current_scene", "scene-counter", "courier counter"]),
        legalLocationRefs: new Set([
          "current_location",
          "current_scene",
          "loc-market",
          "scene-counter",
          "market district",
          "courier counter",
        ]),
      }));

      expect(result.success).toBe(true);
      expect(result.kind).not.toBe("observation");
      expect(result.result).toMatchObject({
        kind: "scene_extra",
        name: "Gondolier",
        delegateTool: "spawn_npc",
      });
      expect(state.npcs).toHaveLength(2);
      expect(state.npcs[0]).toMatchObject({
        id: "npc-distant-gondolier",
        currentSceneLocationId: null,
      });
      expect(state.npcs[1]).toMatchObject({
        name: "Gondolier",
        tier: "temporary",
        currentLocationId: "loc-market",
        currentSceneLocationId: "scene-counter",
      });
    });

    it("create_scene_extra reuses an existing same-scene temporary responder with matching role intent", async () => {
      const { db, state } = createMutableInventoryDb({
        locations: [
          {
            id: "loc-plaza",
            campaignId: CAMPAIGN_ID,
            name: "Night-Vote Plaza",
            description: "Public pedestals",
            tags: "[]",
          },
        ],
        npcs: [
          {
            id: "npc-public-advocate",
            campaignId: CAMPAIGN_ID,
            name: "Public Advocate of Night-Vote Plaza",
            persona: "public advocate, temporary scene responder",
            tier: "temporary",
            tags: "[\"temporary\",\"scene-extra\",\"local\",\"support\",\"role:clerk\"]",
            currentLocationId: "loc-plaza",
            currentSceneLocationId: "loc-plaza",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "create_scene_extra", {
        locationRef: "current_scene",
        role: "service",
        roleText: "Public Advocate in grey salt-stained sash",
        name: "Grey-Sash Advocate",
        tags: ["public-advocate", "civic-official"],
        reason: "The player addresses the visible public advocate again.",
      }, TICK, undefined, createPlayerTurnContext({
        currentLocationId: "loc-plaza",
        currentSceneScopeId: "loc-plaza",
        currentLocationRefs: new Set(["current_location", "loc-plaza", "night-vote plaza"]),
        currentSceneRefs: new Set(["current_scene", "loc-plaza", "night-vote plaza"]),
        legalLocationRefs: new Set(["current_location", "current_scene", "loc-plaza", "night-vote plaza"]),
        legalActorRefs: new Set(["player-1", "player", "Public Advocate of Night-Vote Plaza"]),
      }));

      expect(result.success).toBe(true);
      expect(result.kind).toBe("observation");
      expect(result.result).toMatchObject({
        name: "Public Advocate of Night-Vote Plaza",
        reusedExisting: true,
        delegateTool: "existing_npc",
        role: "service",
        roleText: "Public Advocate in grey salt-stained sash",
      });
      expect(JSON.stringify(result.result)).not.toContain("npc-public-advocate");
      expect(JSON.stringify(result.result)).not.toContain("loc-plaza");
      expect(state.npcs).toHaveLength(1);
    });

    it("start_search and record_player_intent do not create target truth or discovery", async () => {
      const { db } = createMutableInventoryDb({
        players: [{ id: "player-1", campaignId: CAMPAIGN_ID, name: "Hero", tags: "[]" }],
      });
      (getDb as Mock).mockReturnValue(db);

      const context = createPlayerTurnContext({
        subjectActorRefs: new Set(["hero", "player-1"]),
      });

      const search = await executeToolCall(CAMPAIGN_ID, "start_search", {
        actorRef: "Hero",
        query: "tea stall",
        method: "browse",
      }, TICK, undefined, context);
      const intent = await executeToolCall(CAMPAIGN_ID, "record_player_intent", {
        actorRef: "Hero",
        intentType: "claim",
        targetHint: "the courier knows a hidden shortcut",
        stance: "claims",
      }, TICK, undefined, context);

      expect(search.success).toBe(true);
      expect(search.result).toMatchObject({
        kind: "search_started",
        found: false,
        discoveryCreated: false,
        targetTruth: "unconfirmed",
      });
      expect(intent.success).toBe(true);
      expect(intent.result).toMatchObject({
        kind: "player_intent_recorded",
        claimTruth: "unconfirmed",
        proofCreated: false,
        discoveryCreated: false,
      });
      expect(search.authority).toBeDefined();
      expect(intent.authority).toBeDefined();
      expect(getDb).toHaveBeenCalled();
    });
  });

  describe("spawn_item authoritative defaults", () => {
    it("creates character-owned items with explicit carried, unequipped, non-signature metadata", async () => {
      const { db, state } = createMutableInventoryDb({
        players: [{ id: "player-1", name: "Hero", hp: 5 }],
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_item", {
        name: "Lantern",
        tags: ["utility"],
        ownerName: "Hero",
        ownerType: "character",
      }, TICK);

      expect(result.success).toBe(true);
      expect(state.insertedItems).toContainEqual(
        expect.objectContaining({
          name: "Lantern",
          ownerId: "player-1",
          equipState: "carried",
          equippedSlot: null,
          isSignature: false,
        }),
      );
      expect(
        buildAuthoritativeInventoryView(
          state.items.filter((item) => item.ownerId === "player-1"),
        ).carried.map((item) => item.name),
      ).toEqual(["Lantern"]);
    });
  });

  // -- All results have consistent shape --------------------------------------

  describe("result shape", () => {
    it("all tool results have { success, result?, error? } shape", async () => {
      const { db } = createMockDb({ entity: null });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "add_tag", {
        entityName: "X",
        entityType: "npc",
        tag: "t",
      }, TICK);

      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");
    });
  });
});
