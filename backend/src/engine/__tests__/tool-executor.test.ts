import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const { accumulateReflectionBudgetMock } = vi.hoisted(() => ({
  accumulateReflectionBudgetMock: vi.fn(),
}));

// Mock modules before imports
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  storeEpisodicEvent: vi.fn(),
}));

vi.mock("../reflection-budget.js", () => ({
  accumulateReflectionBudget: accumulateReflectionBudgetMock,
}));

import { executeToolCall } from "../tool-executor.js";
import { getDb } from "../../db/index.js";
import { storeEpisodicEvent } from "../../vectors/episodic-events.js";

const CAMPAIGN_ID = "test-campaign-123";
const TICK = 5;

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
  const updateRun = options.updateFn ?? vi.fn();
  const insertRun = options.insertFn ?? vi.fn();
  const upsertRun = vi.fn();

  // Track which table is being queried for multi-table lookups
  let currentTable: string | null = null;

  const db = {
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

// -- Tests --------------------------------------------------------------------

describe("executeToolCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    it("stores event metadata via storeEpisodicEvent and returns success", async () => {
      (storeEpisodicEvent as Mock).mockResolvedValue("event-123");

      const result = await executeToolCall(CAMPAIGN_ID, "log_event", {
        text: "Battle at the bridge",
        importance: 8,
        participants: ["Gandalf", "Balrog"],
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
    });

    it("accumulates reflection budget after committed log_event writes", async () => {
      (storeEpisodicEvent as Mock).mockResolvedValue("event-234");

      const result = await executeToolCall(CAMPAIGN_ID, "log_event", {
        text: "Greta and Balrog clash on the bridge",
        importance: 8,
        participants: ["Greta", "Balrog"],
      }, TICK);

      expect(result.success).toBe(true);
      expect(accumulateReflectionBudgetMock).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        ["Greta", "Balrog"],
        8,
      );
    });
  });

  // -- offer_quick_actions ----------------------------------------------------

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
      expect(result.error).toContain("Invalid entity type");
    });
  });

  // -- spawn_npc --------------------------------------------------------------

  describe("spawn_npc", () => {
    it("inserts NPC at resolved location and returns success", async () => {
      const { db, insertRun } = createMockDb({
        entity: { id: "loc-1", name: "Tavern", tags: "[]" },
      });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_npc", {
        name: "Bartender",
        tags: ["friendly", "merchant"],
        locationName: "Tavern",
      }, TICK);

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        name: "Bartender",
        location: "Tavern",
      });
      expect((result.result as { id: string }).id).toBeDefined();
      expect(insertRun).toHaveBeenCalled();
    });

    it("returns error if location not found", async () => {
      const { db } = createMockDb({ entity: null });
      (getDb as Mock).mockReturnValue(db);

      const result = await executeToolCall(CAMPAIGN_ID, "spawn_npc", {
        name: "Ghost",
        tags: ["scary"],
        locationName: "Nowhere",
      }, TICK);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Location not found");
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
