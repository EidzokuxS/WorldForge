import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// -- Mocks --------------------------------------------------------------------

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../campaign/manager.js", () => ({
  readCampaignConfig: vi.fn(),
}));

vi.mock("../../campaign/paths.js", () => ({
  getCampaignDir: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: { writeFileSync: vi.fn() },
}));

import {
  captureSnapshot,
  restoreSnapshot,
  type TurnSnapshot,
} from "../state-snapshot.js";
import { getDb } from "../../db/index.js";
import { readCampaignConfig } from "../../campaign/manager.js";
import { getCampaignDir } from "../../campaign/paths.js";
import fs from "node:fs";

// -- Helpers ------------------------------------------------------------------

const CAMPAIGN_ID = "test-campaign-123";

function makeSnapshot(overrides: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    playerHp: 4,
    playerTags: '["brave","strong"]',
    playerLocationId: "loc-tavern",
    playerEquippedItems: '["sword-01"]',
    tick: 3,
    spawnedNpcIds: [],
    spawnedItemIds: [],
    revealedLocationIds: [],
    createdRelationshipIds: [],
    createdChronicleIds: [],
    ...overrides,
  };
}

function createMockDb() {
  const selectGetResult = { get: vi.fn() };
  const updateRun = vi.fn();
  const deleteRun = vi.fn();

  // Track per-call select results for location lookups
  const selectGetResults: Array<unknown> = [];
  let selectCallIndex = 0;

  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(selectGetResult),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ run: updateRun }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ run: deleteRun }),
    }),
    _selectGetResult: selectGetResult,
    _updateRun: updateRun,
    _deleteRun: deleteRun,
  };

  return db;
}

// -- Tests --------------------------------------------------------------------

describe("captureSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures player state and tick from DB and config", () => {
    const db = createMockDb();
    db._selectGetResult.get.mockReturnValue({
      hp: 3,
      tags: '["sneaky"]',
      currentLocationId: "loc-forest",
      equippedItems: '["dagger"]',
    });
    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 7 });

    const snapshot = captureSnapshot(CAMPAIGN_ID);

    expect(snapshot).toEqual({
      playerHp: 3,
      playerTags: '["sneaky"]',
      playerLocationId: "loc-forest",
      playerEquippedItems: '["dagger"]',
      tick: 7,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    });
  });

  it("uses default values when no player row exists", () => {
    const db = createMockDb();
    db._selectGetResult.get.mockReturnValue(undefined);
    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({});

    const snapshot = captureSnapshot(CAMPAIGN_ID);

    expect(snapshot.playerHp).toBe(5);
    expect(snapshot.playerTags).toBe("[]");
    expect(snapshot.playerLocationId).toBeNull();
    expect(snapshot.playerEquippedItems).toBe("[]");
    expect(snapshot.tick).toBe(0);
  });

  it("defaults tick to 0 when currentTick is undefined in config", () => {
    const db = createMockDb();
    db._selectGetResult.get.mockReturnValue({
      hp: 5,
      tags: "[]",
      currentLocationId: null,
      equippedItems: "[]",
    });
    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: undefined });

    const snapshot = captureSnapshot(CAMPAIGN_ID);

    expect(snapshot.tick).toBe(0);
  });

  it("initializes all spawned arrays as empty", () => {
    const db = createMockDb();
    db._selectGetResult.get.mockReturnValue({
      hp: 5,
      tags: "[]",
      currentLocationId: null,
      equippedItems: "[]",
    });
    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 1 });

    const snapshot = captureSnapshot(CAMPAIGN_ID);

    expect(snapshot.spawnedNpcIds).toEqual([]);
    expect(snapshot.spawnedItemIds).toEqual([]);
    expect(snapshot.revealedLocationIds).toEqual([]);
    expect(snapshot.createdRelationshipIds).toEqual([]);
    expect(snapshot.createdChronicleIds).toEqual([]);
  });
});

describe("restoreSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores player state and writes config", () => {
    const db = createMockDb();
    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 10, someSetting: true });
    (getCampaignDir as Mock).mockReturnValue("/campaigns/test-campaign-123");

    const snapshot = makeSnapshot({ playerHp: 4, tick: 3 });
    restoreSnapshot(CAMPAIGN_ID, snapshot);

    // Player state updated
    expect(db.update).toHaveBeenCalled();
    expect(db._updateRun).toHaveBeenCalled();

    // Config written with restored tick
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("config.json"),
      expect.stringContaining('"currentTick": 3'),
      "utf-8"
    );
  });

  it("preserves other config fields when restoring tick", () => {
    const db = createMockDb();
    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({
      currentTick: 10,
      worldName: "Testland",
    });
    (getCampaignDir as Mock).mockReturnValue("/campaigns/test-campaign-123");

    restoreSnapshot(CAMPAIGN_ID, makeSnapshot({ tick: 2 }));

    const writtenJson = (fs.writeFileSync as Mock).mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenJson);
    expect(parsed.currentTick).toBe(2);
    expect(parsed.worldName).toBe("Testland");
  });

  it("does not delete anything when spawned arrays are empty", () => {
    const db = createMockDb();
    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({});
    (getCampaignDir as Mock).mockReturnValue("/campaigns/test-campaign-123");

    restoreSnapshot(CAMPAIGN_ID, makeSnapshot());

    expect(db.delete).not.toHaveBeenCalled();
  });

  it("deletes spawned NPCs on rollback", () => {
    const db = createMockDb();
    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({});
    (getCampaignDir as Mock).mockReturnValue("/campaigns/test");

    const snapshot = makeSnapshot({
      spawnedNpcIds: ["npc-1", "npc-2"],
    });
    restoreSnapshot(CAMPAIGN_ID, snapshot);

    expect(db.delete).toHaveBeenCalledTimes(2);
  });

  it("deletes spawned items on rollback", () => {
    const db = createMockDb();
    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({});
    (getCampaignDir as Mock).mockReturnValue("/campaigns/test");

    const snapshot = makeSnapshot({
      spawnedItemIds: ["item-a", "item-b", "item-c"],
    });
    restoreSnapshot(CAMPAIGN_ID, snapshot);

    expect(db.delete).toHaveBeenCalledTimes(3);
  });

  it("deletes created relationships on rollback", () => {
    const db = createMockDb();
    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({});
    (getCampaignDir as Mock).mockReturnValue("/campaigns/test");

    const snapshot = makeSnapshot({
      createdRelationshipIds: ["rel-1"],
    });
    restoreSnapshot(CAMPAIGN_ID, snapshot);

    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it("deletes created chronicle entries on rollback", () => {
    const db = createMockDb();
    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({});
    (getCampaignDir as Mock).mockReturnValue("/campaigns/test");

    const snapshot = makeSnapshot({
      createdChronicleIds: ["chr-1", "chr-2"],
    });
    restoreSnapshot(CAMPAIGN_ID, snapshot);

    expect(db.delete).toHaveBeenCalledTimes(2);
  });

  it("cleans up bidirectional connections when deleting revealed locations", () => {
    // Build a DB mock that tracks select/from/where chains for location lookups
    const updateRun = vi.fn();
    const deleteRun = vi.fn();

    // The revealed location has connectedTo: ["adj-1"]
    // adj-1 has connectedTo: ["loc-revealed", "loc-other"]
    const locationData: Record<string, { connectedTo: string }> = {
      "loc-revealed": { connectedTo: '["adj-1"]' },
      "adj-1": { connectedTo: '["loc-revealed","loc-other"]' },
    };

    let selectContext = "";

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation((condition: unknown) => {
          // For player update, return a run-capable object
          // For location selects, return get-capable object
          return {
            get: vi.fn().mockImplementation(() => {
              // Determine which location is being queried by checking call order
              // First call = the revealed location, second = adj-1
              const calls = db.select.mock.calls.length;
              if (calls <= 2) return locationData["loc-revealed"];
              return locationData["adj-1"];
            }),
            run: updateRun,
          };
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ run: updateRun }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ run: deleteRun }),
      }),
    };

    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({});
    (getCampaignDir as Mock).mockReturnValue("/campaigns/test");

    const snapshot = makeSnapshot({
      revealedLocationIds: ["loc-revealed"],
    });
    restoreSnapshot(CAMPAIGN_ID, snapshot);

    // Should update adj-1 to remove loc-revealed from its connections
    expect(db.update).toHaveBeenCalled();
    // Should delete the revealed location
    expect(db.delete).toHaveBeenCalled();
  });

  it("handles location with invalid connectedTo JSON gracefully", () => {
    const updateRun = vi.fn();
    const deleteRun = vi.fn();

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue({ connectedTo: "not-valid-json" }),
          run: updateRun,
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ run: updateRun }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ run: deleteRun }),
      }),
    };

    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({});
    (getCampaignDir as Mock).mockReturnValue("/campaigns/test");

    const snapshot = makeSnapshot({
      revealedLocationIds: ["loc-bad"],
    });

    // Should not throw
    expect(() => restoreSnapshot(CAMPAIGN_ID, snapshot)).not.toThrow();
    // Should still delete the location
    expect(db.delete).toHaveBeenCalled();
  });

  it("handles location not found in DB during rollback", () => {
    const updateRun = vi.fn();
    const deleteRun = vi.fn();

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(undefined),
          run: updateRun,
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ run: updateRun }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ run: deleteRun }),
      }),
    };

    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({});
    (getCampaignDir as Mock).mockReturnValue("/campaigns/test");

    const snapshot = makeSnapshot({
      revealedLocationIds: ["loc-missing"],
    });

    expect(() => restoreSnapshot(CAMPAIGN_ID, snapshot)).not.toThrow();
    expect(db.delete).toHaveBeenCalled();
  });

  it("deletes all entity types when snapshot has mixed spawned IDs", () => {
    const deleteRun = vi.fn();
    const updateRun = vi.fn();

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(undefined),
          run: updateRun,
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ run: updateRun }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ run: deleteRun }),
      }),
    };

    (getDb as Mock).mockReturnValue(db);
    (readCampaignConfig as Mock).mockReturnValue({});
    (getCampaignDir as Mock).mockReturnValue("/campaigns/test");

    const snapshot = makeSnapshot({
      spawnedNpcIds: ["npc-1"],
      spawnedItemIds: ["item-1", "item-2"],
      revealedLocationIds: ["loc-1"],
      createdRelationshipIds: ["rel-1"],
      createdChronicleIds: ["chr-1", "chr-2", "chr-3"],
    });
    restoreSnapshot(CAMPAIGN_ID, snapshot);

    // 1 NPC + 2 items + 1 location + 1 relationship + 3 chronicle = 8 deletes
    expect(deleteRun).toHaveBeenCalledTimes(8);
  });
});
