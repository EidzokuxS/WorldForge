import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../../db/index.js";
import { cleanupTransientSceneObjects } from "../transient-scene-lifecycle.js";

function getDrizzleTableName(table: unknown): string | null {
  return (table as Record<PropertyKey, unknown>)?.[Symbol.for("drizzle:Name")] as string | null;
}

function createMutableCleanupDb(options: {
  players?: Array<Record<string, unknown>>;
  npcs?: Array<Record<string, unknown>>;
  locations?: Array<Record<string, unknown>>;
}) {
  const state = {
    players: options.players ?? [],
    npcs: options.npcs ?? [],
    locations: options.locations ?? [],
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
      default:
        return [];
    }
  };

  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table: unknown) => {
      lastTableName = getDrizzleTableName(table);
      return db;
    }),
    where: vi.fn().mockImplementation(() => ({
      all: vi.fn().mockImplementation(() => getRows(lastTableName)),
      get: vi.fn().mockImplementation(() => getRows(lastTableName)[0]),
    })),
    update: vi.fn().mockImplementation((table: unknown) => {
      const tableName = getDrizzleTableName(table);
      return {
        set: vi.fn().mockImplementation((values: Record<string, unknown>) => ({
          where: vi.fn().mockImplementation(() => ({
            run: vi.fn().mockImplementation(() => {
              const rows = getRows(tableName);
              const matchingRow = rows.find((row) => {
                if ("archivedAtTick" in values) return row.kind === "ephemeral_scene";
                return row.tier === "temporary";
              });
              if (matchingRow) Object.assign(matchingRow, values);
            }),
          })),
        })),
      };
    }),
  };

  return { db, state };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cleanupTransientSceneObjects", () => {
  it("archives expired empty ephemeral scenes and retires temporary support NPCs", () => {
    const { db, state } = createMutableCleanupDb({
      players: [{ currentLocationId: "macro-current", currentSceneLocationId: "macro-current" }],
      locations: [
        {
          id: "scene-expired",
          kind: "ephemeral_scene",
          persistence: "ephemeral",
          expiresAtTick: 8,
          archivedAtTick: null,
        },
      ],
      npcs: [
        {
          id: "npc-temp-clerk",
          tier: "temporary",
          currentLocationId: "macro-current",
          currentSceneLocationId: "scene-expired",
        },
      ],
    });
    (getDb as Mock).mockReturnValue(db);

    const result = cleanupTransientSceneObjects("campaign-1", 8);

    expect(result).toEqual({
      archivedSceneIds: ["scene-expired"],
      retiredNpcIds: ["npc-temp-clerk"],
      skippedProtectedSceneIds: [],
    });
    expect(state.locations[0]).toMatchObject({ archivedAtTick: 8 });
    expect(state.npcs[0]).toMatchObject({
      currentLocationId: null,
      currentSceneLocationId: null,
      inactiveTicks: 8,
    });
  });

  it("skips player or durable NPC occupied scenes and never retires promoted NPCs", () => {
    const { db, state } = createMutableCleanupDb({
      players: [{ currentLocationId: "macro-current", currentSceneLocationId: "scene-player" }],
      locations: [
        {
          id: "scene-player",
          kind: "ephemeral_scene",
          persistence: "ephemeral",
          expiresAtTick: 8,
          archivedAtTick: null,
        },
        {
          id: "scene-promoted",
          kind: "ephemeral_scene",
          persistence: "ephemeral",
          expiresAtTick: 8,
          archivedAtTick: null,
        },
      ],
      npcs: [
        {
          id: "npc-promoted",
          tier: "persistent",
          currentLocationId: "macro-current",
          currentSceneLocationId: "scene-promoted",
        },
      ],
    });
    (getDb as Mock).mockReturnValue(db);

    const result = cleanupTransientSceneObjects("campaign-1", 8);

    expect(result.archivedSceneIds).toEqual([]);
    expect(result.retiredNpcIds).toEqual([]);
    expect(result.skippedProtectedSceneIds).toEqual(["scene-player", "scene-promoted"]);
    expect(state.locations).toEqual([
      expect.objectContaining({ id: "scene-player", archivedAtTick: null }),
      expect.objectContaining({ id: "scene-promoted", archivedAtTick: null }),
    ]);
    expect(state.npcs[0]).toMatchObject({
      tier: "persistent",
      currentSceneLocationId: "scene-promoted",
    });
  });
});
