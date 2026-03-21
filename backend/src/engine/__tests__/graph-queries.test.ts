import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

import { getRelationshipGraph } from "../graph-queries.js";
import { getDb } from "../../db/index.js";
import {
  players as playersTable,
  npcs as npcsTable,
  locations as locationsTable,
  factions as factionsTable,
  relationships as relationshipsTable,
} from "../../db/schema.js";

const CAMPAIGN_ID = "test-campaign-001";

function createMockDb(overrides: {
  players?: Record<string, unknown>[];
  npcs?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  factions?: Record<string, unknown>[];
  relationships?: Record<string, unknown>[];
} = {}) {
  const tableMap = new Map<unknown, Record<string, unknown>[]>([
    [playersTable, overrides.players ?? []],
    [npcsTable, overrides.npcs ?? []],
    [locationsTable, overrides.locations ?? []],
    [factionsTable, overrides.factions ?? []],
    [relationshipsTable, overrides.relationships ?? []],
  ]);

  const selectFn = vi.fn().mockImplementation((_columns?: unknown) => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      const data = tableMap.get(table) ?? [];
      return {
        where: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(data),
        }),
        all: vi.fn().mockReturnValue(data),
      };
    }),
  }));

  return { select: selectFn };
}

function makeRel(
  entityA: string,
  entityB: string,
  tags: string[] = [],
  reason: string | null = null,
) {
  return {
    id: `rel-${entityA}-${entityB}`,
    campaignId: CAMPAIGN_ID,
    entityA,
    entityB,
    tags: JSON.stringify(tags),
    reason,
  };
}

describe("getRelationshipGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when entityIds is empty", () => {
    const result = getRelationshipGraph(CAMPAIGN_ID, []);
    expect(result).toEqual([]);
    // getDb should not be called at all
    expect(getDb).not.toHaveBeenCalled();
  });

  it("returns empty array when DB has no relationships", () => {
    const db = createMockDb({
      players: [{ id: "player-1", name: "Hero" }],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["player-1"]);
    expect(result).toEqual([]);
  });

  it("returns single-hop direct relationships", () => {
    const db = createMockDb({
      npcs: [
        { id: "npc-1", name: "Aldric" },
        { id: "npc-2", name: "Brenna" },
      ],
      relationships: [
        makeRel("npc-1", "npc-2", ["ally", "friend"], "Fought together"),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["npc-1"], 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      entityId: "npc-1",
      entityName: "Aldric",
      relationships: [
        {
          targetId: "npc-2",
          targetName: "Brenna",
          tags: ["ally", "friend"],
          reason: "Fought together",
        },
      ],
    });
  });

  it("resolves bidirectional relationships (entityB matches seed)", () => {
    const db = createMockDb({
      npcs: [
        { id: "npc-1", name: "Aldric" },
        { id: "npc-2", name: "Brenna" },
      ],
      relationships: [
        makeRel("npc-1", "npc-2", ["ally"]),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    // Query from npc-2 side — should still find the relationship
    const result = getRelationshipGraph(CAMPAIGN_ID, ["npc-2"], 1);

    expect(result).toHaveLength(1);
    expect(result[0].entityId).toBe("npc-2");
    expect(result[0].entityName).toBe("Brenna");
    expect(result[0].relationships[0].targetId).toBe("npc-1");
    expect(result[0].relationships[0].targetName).toBe("Aldric");
  });

  it("traverses multi-hop BFS with maxDepth=2", () => {
    // A -> B -> C chain
    const db = createMockDb({
      npcs: [
        { id: "npc-a", name: "Alpha" },
        { id: "npc-b", name: "Beta" },
        { id: "npc-c", name: "Gamma" },
      ],
      relationships: [
        makeRel("npc-a", "npc-b", ["mentor"]),
        makeRel("npc-b", "npc-c", ["rival"]),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["npc-a"], 2);

    expect(result).toHaveLength(2);

    const nodeA = result.find((n) => n.entityId === "npc-a");
    const nodeB = result.find((n) => n.entityId === "npc-b");

    expect(nodeA).toBeDefined();
    expect(nodeA!.relationships).toHaveLength(1);
    expect(nodeA!.relationships[0].targetId).toBe("npc-b");

    expect(nodeB).toBeDefined();
    expect(nodeB!.relationships).toHaveLength(2); // back to A + forward to C
    const targetIds = nodeB!.relationships.map((r) => r.targetId).sort();
    expect(targetIds).toEqual(["npc-a", "npc-c"]);
  });

  it("does not traverse beyond maxDepth=1", () => {
    // A -> B -> C, but maxDepth=1 should only include A
    const db = createMockDb({
      npcs: [
        { id: "npc-a", name: "Alpha" },
        { id: "npc-b", name: "Beta" },
        { id: "npc-c", name: "Gamma" },
      ],
      relationships: [
        makeRel("npc-a", "npc-b", ["mentor"]),
        makeRel("npc-b", "npc-c", ["rival"]),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["npc-a"], 1);

    expect(result).toHaveLength(1);
    expect(result[0].entityId).toBe("npc-a");
    // npc-b is discovered but not expanded (only 1 hop)
  });

  it("handles circular relationships without infinite loop", () => {
    // A -> B -> C -> A (cycle)
    const db = createMockDb({
      npcs: [
        { id: "npc-a", name: "Alpha" },
        { id: "npc-b", name: "Beta" },
        { id: "npc-c", name: "Gamma" },
      ],
      relationships: [
        makeRel("npc-a", "npc-b", ["ally"]),
        makeRel("npc-b", "npc-c", ["rival"]),
        makeRel("npc-c", "npc-a", ["enemy"]),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["npc-a"], 10);

    // All 3 nodes should be visited exactly once
    expect(result).toHaveLength(3);
    const ids = result.map((n) => n.entityId).sort();
    expect(ids).toEqual(["npc-a", "npc-b", "npc-c"]);
  });

  it("falls back to raw ID when entity is not in name cache", () => {
    const db = createMockDb({
      // No NPCs/players/etc registered — names won't resolve
      relationships: [
        makeRel("unknown-1", "unknown-2", ["mysterious"]),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["unknown-1"], 1);

    expect(result).toHaveLength(1);
    expect(result[0].entityName).toBe("unknown-1");
    expect(result[0].relationships[0].targetName).toBe("unknown-2");
  });

  it("resolves names across entity types (player, npc, location, faction)", () => {
    const db = createMockDb({
      players: [{ id: "player-1", name: "Hero" }],
      npcs: [{ id: "npc-1", name: "Merchant" }],
      locations: [{ id: "loc-1", name: "Tavern" }],
      factions: [{ id: "fac-1", name: "Thieves Guild" }],
      relationships: [
        makeRel("player-1", "npc-1", ["friend"]),
        makeRel("player-1", "loc-1", ["home"]),
        makeRel("player-1", "fac-1", ["member"]),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["player-1"], 1);

    expect(result).toHaveLength(1);
    expect(result[0].entityName).toBe("Hero");
    expect(result[0].relationships).toHaveLength(3);

    const names = result[0].relationships.map((r) => r.targetName).sort();
    expect(names).toEqual(["Merchant", "Tavern", "Thieves Guild"]);
  });

  it("handles malformed tags JSON gracefully", () => {
    const db = createMockDb({
      npcs: [
        { id: "npc-1", name: "Aldric" },
        { id: "npc-2", name: "Brenna" },
      ],
      relationships: [
        {
          id: "rel-bad",
          campaignId: CAMPAIGN_ID,
          entityA: "npc-1",
          entityB: "npc-2",
          tags: "not-valid-json{{{",
          reason: null,
        },
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["npc-1"], 1);

    expect(result).toHaveLength(1);
    expect(result[0].relationships[0].tags).toEqual([]);
  });

  it("filters non-string items from tags array", () => {
    const db = createMockDb({
      npcs: [
        { id: "npc-1", name: "Aldric" },
        { id: "npc-2", name: "Brenna" },
      ],
      relationships: [
        {
          id: "rel-mixed",
          campaignId: CAMPAIGN_ID,
          entityA: "npc-1",
          entityB: "npc-2",
          tags: JSON.stringify(["ally", 42, null, "friend", true]),
          reason: null,
        },
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["npc-1"], 1);

    expect(result[0].relationships[0].tags).toEqual(["ally", "friend"]);
  });

  it("handles multiple seed entities", () => {
    const db = createMockDb({
      npcs: [
        { id: "npc-1", name: "Aldric" },
        { id: "npc-2", name: "Brenna" },
        { id: "npc-3", name: "Cael" },
      ],
      relationships: [
        makeRel("npc-1", "npc-3", ["mentor"]),
        makeRel("npc-2", "npc-3", ["rival"]),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["npc-1", "npc-2"], 1);

    expect(result).toHaveLength(2);
    const ids = result.map((n) => n.entityId).sort();
    expect(ids).toEqual(["npc-1", "npc-2"]);
  });

  it("skips entities with no relationships (no node created)", () => {
    const db = createMockDb({
      npcs: [
        { id: "npc-1", name: "Loner" },
        { id: "npc-2", name: "Aldric" },
        { id: "npc-3", name: "Brenna" },
      ],
      relationships: [
        makeRel("npc-2", "npc-3", ["ally"]),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    // npc-1 has no relationships → should not appear in result
    const result = getRelationshipGraph(CAMPAIGN_ID, ["npc-1"], 2);

    expect(result).toEqual([]);
  });

  it("preserves reason field including null", () => {
    const db = createMockDb({
      npcs: [
        { id: "npc-1", name: "A" },
        { id: "npc-2", name: "B" },
        { id: "npc-3", name: "C" },
      ],
      relationships: [
        makeRel("npc-1", "npc-2", ["ally"], "Saved his life"),
        makeRel("npc-1", "npc-3", ["enemy"], null),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["npc-1"], 1);

    const relB = result[0].relationships.find((r) => r.targetId === "npc-2");
    const relC = result[0].relationships.find((r) => r.targetId === "npc-3");
    expect(relB!.reason).toBe("Saved his life");
    expect(relC!.reason).toBeNull();
  });

  it("uses default maxDepth of 2 when not specified", () => {
    // A -> B -> C -> D chain, default maxDepth=2 should reach B and C but not D
    const db = createMockDb({
      npcs: [
        { id: "npc-a", name: "A" },
        { id: "npc-b", name: "B" },
        { id: "npc-c", name: "C" },
        { id: "npc-d", name: "D" },
      ],
      relationships: [
        makeRel("npc-a", "npc-b", ["link"]),
        makeRel("npc-b", "npc-c", ["link"]),
        makeRel("npc-c", "npc-d", ["link"]),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const result = getRelationshipGraph(CAMPAIGN_ID, ["npc-a"]);

    const ids = result.map((n) => n.entityId).sort();
    expect(ids).toEqual(["npc-a", "npc-b"]);
    // npc-c is discovered at depth 2 but not expanded — it appears as target only
    // npc-d should NOT appear at all
    const allTargetIds = result.flatMap((n) => n.relationships.map((r) => r.targetId));
    expect(allTargetIds).not.toContain("npc-d");
  });
});
