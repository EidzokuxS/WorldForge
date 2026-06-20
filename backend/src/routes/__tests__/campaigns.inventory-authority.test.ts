import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { Hono } from "hono";

vi.mock("../../campaign/index.js", () => ({
  assertSafeId: vi.fn(),
  createCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  getActiveCampaign: vi.fn(),
  listCampaigns: vi.fn(),
  loadCampaign: vi.fn(),
  readCampaignConfig: vi.fn(),
  createCheckpoint: vi.fn(),
  listCheckpoints: vi.fn(),
  loadCheckpoint: vi.fn(),
  deleteCheckpoint: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../engine/location-events.js", () => ({
  listRecentLocationEventsForLocations: vi.fn().mockReturnValue({}),
}));

vi.mock("../../engine/location-graph.js", () => ({
  listConnectedPaths: vi.fn().mockReturnValue([]),
  loadLocationGraph: vi.fn().mockReturnValue({ locations: [], edges: [] }),
}));

vi.mock("../../engine/living-world-authority.js", () => ({
  readWorldClock: vi.fn(),
}));

vi.mock("../../inventory/authority.js", async () => {
  const actual = await vi.importActual<typeof import("../../inventory/authority.js")>("../../inventory/authority.js");
  return {
    ...actual,
    loadAuthoritativeInventoryView: vi.fn(),
  };
});

import { getActiveCampaign, readCampaignConfig } from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import { requirePublicDtoHandle } from "../../engine/public-dto-handles.js";
import { readWorldClock } from "../../engine/living-world-authority.js";
import { loadAuthoritativeInventoryView } from "../../inventory/authority.js";
import campaignRoutes from "../campaigns.js";
import {
  locations as locationsTable,
  npcs as npcsTable,
  factions as factionsTable,
  relationships as relationshipsTable,
  players as playersTable,
  items as itemsTable,
} from "../../db/schema.js";

function createMockDb(overrides: {
  locations?: Record<string, unknown>[];
  npcs?: Record<string, unknown>[];
  factions?: Record<string, unknown>[];
  relationships?: Record<string, unknown>[];
  players?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
} = {}) {
  const tableMap = new Map<unknown, Record<string, unknown>[]>([
    [locationsTable, overrides.locations ?? []],
    [npcsTable, overrides.npcs ?? []],
    [factionsTable, overrides.factions ?? []],
    [relationshipsTable, overrides.relationships ?? []],
    [playersTable, overrides.players ?? []],
    [itemsTable, overrides.items ?? []],
  ]);

  const selectFn = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      const data = tableMap.get(table) ?? [];
      return {
        where: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(data),
          get: vi.fn().mockReturnValue(data[0]),
        }),
        all: vi.fn().mockReturnValue(data),
        get: vi.fn().mockReturnValue(data[0]),
      };
    }),
  }));

  return { select: selectFn };
}

const app = new Hono();
app.route("/api/campaigns", campaignRoutes);

function publicPlaceHandle(sourceId: string): string {
  return requirePublicDtoHandle({
    campaignId: "abc-123",
    kind: "place",
    sourceId,
  });
}

function publicActorHandle(sourceId: string): string {
  return requirePublicDtoHandle({
    campaignId: "abc-123",
    kind: "actor",
    sourceId,
  });
}

describe("GET /api/campaigns/:id/world authoritative inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getActiveCampaign as Mock).mockReturnValue({
      id: "abc-123",
      name: "Test",
      createdAt: "2026-01-01",
      generationComplete: true,
    });
    (readCampaignConfig as Mock).mockReturnValue({ personaTemplates: [] });
    (readWorldClock as Mock).mockReturnValue({
      campaignId: "abc-123",
      worldVersion: 3,
      worldTimeMinutes: 21,
      currentTick: 21,
      updatedAt: 123456,
    });
    (getDb as Mock).mockReturnValue(
      createMockDb({
        locations: [
          {
            id: "loc-1",
            campaignId: "abc-123",
            name: "Town Square",
            description: "Stone and wind.",
            connectedTo: "[]",
          },
        ],
        players: [
          {
            id: "player-1",
            campaignId: "abc-123",
            name: "Hero",
            race: "Human",
            gender: "",
            age: "",
            appearance: "",
            hp: 5,
            tags: "[]",
            equippedItems: '["Legacy Bow"]',
            currentLocationId: "loc-1",
          },
        ],
        items: [
          {
            id: "item-world-1",
            campaignId: "abc-123",
            name: "Iron Sword",
            tags: '["weapon"]',
            ownerId: "player-1",
            locationId: null,
          },
          {
            id: "item-world-2",
            campaignId: "abc-123",
            name: "Lantern",
            tags: '["utility"]',
            ownerId: null,
            locationId: "loc-1",
          },
        ],
      }) as unknown as ReturnType<typeof getDb>,
    );
    (loadAuthoritativeInventoryView as Mock).mockReturnValue({
      items: [],
      carried: [{
        id: "item-bedroll",
        campaignId: "abc-123",
        name: "Bedroll",
        tags: '["gear"]',
        ownerId: "player-1",
        locationId: null,
        equipState: "carried",
        equippedSlot: null,
        isSignature: false,
      }],
      equipped: [{
        id: "item-sword",
        campaignId: "abc-123",
        name: "Iron Sword",
        tags: '["weapon"]',
        ownerId: "player-1",
        locationId: null,
        equipState: "equipped",
        equippedSlot: "hand",
        isSignature: false,
      }],
      signature: [{
        id: "item-compass",
        campaignId: "abc-123",
        name: "Family Compass",
        tags: '["heirloom"]',
        ownerId: "player-1",
        locationId: null,
        equipState: "carried",
        equippedSlot: null,
        isSignature: true,
      }],
      compatibility: {
        inventorySeed: ["Bedroll"],
        equippedItemRefs: ["Iron Sword"],
        signatureItems: ["Family Compass"],
      },
    });
  });

  it("returns player inventory, equipped, and signature arrays from the authoritative inventory seam while preserving top-level world items", async () => {
    const response = await app.request("/api/campaigns/abc-123/world");

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(loadAuthoritativeInventoryView).toHaveBeenCalledWith("abc-123", "player-1");
    expect(body.player.inventory).toEqual([
      expect.objectContaining({
        name: "Bedroll",
        equipState: "carried",
        isSignature: false,
      }),
    ]);
    expect(body.player.equipment).toEqual([
      expect.objectContaining({
        name: "Iron Sword",
        equipState: "equipped",
        isSignature: false,
      }),
    ]);
    expect(body.player.inventoryItems).toEqual(["Bedroll"]);
    expect(body.player.equippedItems).toEqual(["Iron Sword"]);
    expect(body.player.signatureItems).toEqual(["Family Compass"]);
    expect(body.player.equippedItems).not.toEqual(["Legacy Bow"]);
    expect(body.items).toEqual([
      expect.objectContaining({ name: "Iron Sword" }),
      expect.objectContaining({ name: "Lantern" }),
    ]);
  });

  it("returns an explicit bounded currentScene payload for immediate-scene participants", async () => {
    (getDb as Mock).mockReturnValue(
      createMockDb({
        locations: [
          {
            id: "loc-1",
            campaignId: "abc-123",
            name: "Shibuya Station",
            description: "A crowded district hub.",
            connectedTo: "[]",
          },
          {
            id: "scene-platform-7",
            campaignId: "abc-123",
            name: "Platform 7",
            description: "The local encounter pocket beneath the station.",
            connectedTo: "[]",
          },
        ],
        players: [
          {
            id: "player-1",
            campaignId: "abc-123",
            name: "Yuji Itadori",
            race: "Human",
            gender: "",
            age: "",
            appearance: "",
            hp: 5,
            tags: "[]",
            equippedItems: "[]",
            currentLocationId: "loc-1",
            currentSceneLocationId: "scene-platform-7",
          },
        ],
        npcs: [
          {
            id: "npc-1",
            campaignId: "abc-123",
            name: "Nobara Kugisaki",
            persona: "",
            tags: "[]",
            tier: "key",
            currentLocationId: "loc-1",
            currentSceneLocationId: "scene-platform-7",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
          {
            id: "npc-2",
            campaignId: "abc-123",
            name: "Hidden Presence",
            persona: "",
            tags: "[\"hidden\"]",
            tier: "key",
            currentLocationId: "loc-1",
            currentSceneLocationId: "scene-platform-7",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
          {
            id: "npc-3",
            campaignId: "abc-123",
            name: "Gojo Elsewhere",
            persona: "",
            tags: "[]",
            tier: "key",
            currentLocationId: "loc-1",
            currentSceneLocationId: "scene-rooftop",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
        ],
        items: [],
      }) as unknown as ReturnType<typeof getDb>,
    );

    const response = await app.request("/api/campaigns/abc-123/world");

    expect(response.status).toBe(200);
    const body = await response.json();
    const sceneHandle = publicPlaceHandle("scene-platform-7");
    const broadPlaceHandle = publicPlaceHandle("loc-1");
    const visibleActorHandle = publicActorHandle("npc-1");
    const hiddenActorHandle = publicActorHandle("npc-2");

    expect(body.currentScene).toEqual({
      id: sceneHandle,
      sceneHandle,
      name: "Platform 7",
      broadLocationId: broadPlaceHandle,
      broadPlaceHandle,
      broadLocationName: "Shibuya Station",
      sceneNpcIds: [visibleActorHandle, hiddenActorHandle],
      actorHandles: [visibleActorHandle, hiddenActorHandle],
      clearNpcIds: [visibleActorHandle],
      clearActorHandles: [visibleActorHandle],
      awareness: {
        byNpcId: {
          [visibleActorHandle]: "clear",
          [hiddenActorHandle]: "hint",
        },
        byActorHandle: {
          [visibleActorHandle]: "clear",
          [hiddenActorHandle]: "hint",
        },
        hintSignals: ["Something concealed is nearby."],
      },
    });
  });

  it("scopes currentScene to the player's persistent sublocation and excludes sibling actors under the same macro", async () => {
    (getDb as Mock).mockReturnValue(
      createMockDb({
        locations: [
          {
            id: "loc-macro",
            campaignId: "abc-123",
            name: "Dense Transit Ward",
            description: "A macro transit district.",
            kind: "macro",
            parentLocationId: null,
            connectedTo: "[]",
          },
          {
            id: "loc-concourse",
            campaignId: "abc-123",
            name: "Station Concourse",
            description: "The player's concrete starting scene.",
            kind: "persistent_sublocation",
            parentLocationId: "loc-macro",
            connectedTo: "[]",
          },
          {
            id: "loc-rooftop",
            campaignId: "abc-123",
            name: "Rooftop Service Corridor",
            description: "A sibling scene under the same macro.",
            kind: "persistent_sublocation",
            parentLocationId: "loc-macro",
            connectedTo: "[]",
          },
        ],
        players: [
          {
            id: "player-1",
            campaignId: "abc-123",
            name: "Hero",
            race: "Human",
            gender: "",
            age: "",
            appearance: "",
            hp: 5,
            tags: "[]",
            equippedItems: "[]",
            currentLocationId: "loc-macro",
            currentSceneLocationId: "loc-concourse",
          },
        ],
        npcs: [
          {
            id: "npc-same-scene",
            campaignId: "abc-123",
            name: "Transit Warden",
            persona: "",
            tags: "[]",
            tier: "key",
            currentLocationId: "loc-macro",
            currentSceneLocationId: "loc-concourse",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
          {
            id: "npc-sibling-scene",
            campaignId: "abc-123",
            name: "Signal Runner",
            persona: "",
            tags: "[]",
            tier: "key",
            currentLocationId: "loc-macro",
            currentSceneLocationId: "loc-rooftop",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
        ],
        items: [],
      }) as unknown as ReturnType<typeof getDb>,
    );

    const response = await app.request("/api/campaigns/abc-123/world");

    expect(response.status).toBe(200);
    const body = await response.json();
    const sceneHandle = publicPlaceHandle("loc-concourse");
    const broadPlaceHandle = publicPlaceHandle("loc-macro");
    const sameSceneActorHandle = publicActorHandle("npc-same-scene");
    const siblingSceneActorHandle = publicActorHandle("npc-sibling-scene");
    const siblingSceneHandle = publicPlaceHandle("loc-rooftop");

    expect(body.currentScene).toMatchObject({
      id: sceneHandle,
      sceneHandle,
      name: "Station Concourse",
      broadLocationId: broadPlaceHandle,
      broadPlaceHandle,
      broadLocationName: "Dense Transit Ward",
      sceneNpcIds: [sameSceneActorHandle],
      actorHandles: [sameSceneActorHandle],
      clearNpcIds: [sameSceneActorHandle],
      clearActorHandles: [sameSceneActorHandle],
      awareness: {
        byNpcId: {
          [sameSceneActorHandle]: "clear",
        },
        byActorHandle: {
          [sameSceneActorHandle]: "clear",
        },
      },
    });
    expect(body.currentScene.sceneNpcIds).not.toContain("npc-sibling-scene");
    expect(body.currentScene.sceneNpcIds).not.toContain(siblingSceneActorHandle);
    expect(body.currentScene.clearNpcIds).not.toContain("npc-sibling-scene");
    expect(body.currentScene.clearNpcIds).not.toContain(siblingSceneActorHandle);
    expect(body.npcs.find((npc: { id: string }) => npc.id === sameSceneActorHandle)?.sceneScopeId)
      .toBe(sceneHandle);
    expect(body.npcs.find((npc: { id: string }) => npc.id === siblingSceneActorHandle)?.sceneScopeId)
      .toBe(siblingSceneHandle);
  });

  it("does not synthesize visible actors from a macro currentScene scope", async () => {
    (getDb as Mock).mockReturnValue(
      createMockDb({
        locations: [
          {
            id: "loc-macro",
            campaignId: "abc-123",
            name: "Brass Citadel",
            description: "A macro civic district with an active public platform.",
            kind: "macro",
            parentLocationId: null,
            connectedTo: "[]",
          },
          {
            id: "loc-bell-hall",
            campaignId: "abc-123",
            name: "Bell Hall",
            description: "A sibling hall under the same macro.",
            kind: "persistent_sublocation",
            parentLocationId: "loc-macro",
            connectedTo: "[]",
          },
        ],
        players: [
          {
            id: "player-1",
            campaignId: "abc-123",
            name: "Courier",
            race: "Human",
            gender: "",
            age: "",
            appearance: "",
            hp: 5,
            tags: "[]",
            equippedItems: "[]",
            currentLocationId: "loc-macro",
            currentSceneLocationId: "loc-macro",
          },
        ],
        npcs: [
          {
            id: "npc-clerk",
            campaignId: "abc-123",
            name: "Wax-Tablet Clerk",
            persona: "",
            tags: "[]",
            tier: "temporary",
            currentLocationId: "loc-macro",
            currentSceneLocationId: "loc-macro",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
          {
            id: "npc-bell-hall",
            campaignId: "abc-123",
            name: "Bell Hall Arbiter",
            persona: "",
            tags: "[]",
            tier: "key",
            currentLocationId: "loc-macro",
            currentSceneLocationId: "loc-bell-hall",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
          {
            id: "npc-legacy",
            campaignId: "abc-123",
            name: "Broad Legacy Presence",
            persona: "",
            tags: "[]",
            tier: "key",
            currentLocationId: "loc-macro",
            currentSceneLocationId: null,
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
        ],
        items: [],
      }) as unknown as ReturnType<typeof getDb>,
    );

    const response = await app.request("/api/campaigns/abc-123/world");

    expect(response.status).toBe(200);
    const body = await response.json();
    const macroPlaceHandle = publicPlaceHandle("loc-macro");
    const bellHallActorHandle = publicActorHandle("npc-bell-hall");
    const legacyActorHandle = publicActorHandle("npc-legacy");

    expect(body.currentScene).toMatchObject({
      id: macroPlaceHandle,
      sceneHandle: macroPlaceHandle,
      name: "Brass Citadel",
      broadLocationId: macroPlaceHandle,
      broadPlaceHandle: macroPlaceHandle,
      broadLocationName: "Brass Citadel",
      sceneNpcIds: [],
      actorHandles: [],
      clearNpcIds: [],
      clearActorHandles: [],
      awareness: {
        byNpcId: {},
        byActorHandle: {},
      },
    });
    expect(body.currentScene.sceneNpcIds).not.toContain("npc-clerk");
    expect(body.currentScene.sceneNpcIds).not.toContain("npc-bell-hall");
    expect(body.currentScene.sceneNpcIds).not.toContain("npc-legacy");
    expect(body.currentScene.sceneNpcIds).not.toContain(bellHallActorHandle);
    expect(body.currentScene.sceneNpcIds).not.toContain(legacyActorHandle);
  });

  it("shows explicit current-scene support actors on a macro scene without broad actor synthesis", async () => {
    (getDb as Mock).mockReturnValue(
      createMockDb({
        locations: [
          {
            id: "loc-market",
            campaignId: "abc-123",
            name: "Lowwater Bazaar",
            description: "A broad market district.",
            kind: "macro",
            parentLocationId: null,
            connectedTo: "[]",
          },
        ],
        players: [
          {
            id: "player-1",
            campaignId: "abc-123",
            name: "Courier",
            race: "Human",
            gender: "",
            age: "",
            appearance: "",
            hp: 5,
            tags: "[]",
            equippedItems: "[]",
            currentLocationId: "loc-market",
            currentSceneLocationId: "loc-market",
          },
        ],
        npcs: [
          {
            id: "npc-local-vendor",
            campaignId: "abc-123",
            name: "Local Vendor",
            persona: "",
            tags: JSON.stringify([
              "temporary-support",
              "clean-runtime-support",
              "support-role:vendor",
              "current-scene",
              "minor-support",
              "reactive-only",
            ]),
            tier: "temporary",
            currentLocationId: "loc-market",
            currentSceneLocationId: "loc-market",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
          {
            id: "npc-market-crowd",
            campaignId: "abc-123",
            name: "Market Crowd",
            persona: "",
            tags: "[]",
            tier: "temporary",
            currentLocationId: "loc-market",
            currentSceneLocationId: "loc-market",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
          {
            id: "npc-local-clerk",
            campaignId: "abc-123",
            name: "Local Clerk",
            persona: "",
            tags: JSON.stringify(["clerk"]),
            tier: "temporary",
            currentLocationId: "loc-market",
            currentSceneLocationId: "loc-market",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
        ],
        items: [],
      }) as unknown as ReturnType<typeof getDb>,
    );

    const response = await app.request("/api/campaigns/abc-123/world");

    expect(response.status).toBe(200);
    const body = await response.json();
    const marketHandle = publicPlaceHandle("loc-market");
    const vendorHandle = publicActorHandle("npc-local-vendor");
    const crowdHandle = publicActorHandle("npc-market-crowd");
    const clerkHandle = publicActorHandle("npc-local-clerk");

    expect(body.currentScene).toMatchObject({
      id: marketHandle,
      sceneHandle: marketHandle,
      name: "Lowwater Bazaar",
      broadLocationId: marketHandle,
      broadPlaceHandle: marketHandle,
      broadLocationName: "Lowwater Bazaar",
      sceneNpcIds: [vendorHandle, clerkHandle],
      actorHandles: [vendorHandle, clerkHandle],
      clearNpcIds: [vendorHandle, clerkHandle],
      clearActorHandles: [vendorHandle, clerkHandle],
      awareness: {
        byNpcId: {
          [vendorHandle]: "clear",
          [clerkHandle]: "clear",
        },
        byActorHandle: {
          [vendorHandle]: "clear",
          [clerkHandle]: "clear",
        },
      },
    });
    expect(body.currentScene.sceneNpcIds).not.toContain(crowdHandle);
    expect(body.currentScene.clearNpcIds).not.toContain(crowdHandle);
  });

  it("derives persistent sublocation broad scope so support NPCs placed at parent remain visible", async () => {
    (getDb as Mock).mockReturnValue(
      createMockDb({
        locations: [
          {
            id: "loc-macro",
            campaignId: "abc-123",
            name: "Canal Market District",
            description: "A macro canal district.",
            kind: "macro",
            parentLocationId: null,
            connectedTo: "[]",
          },
          {
            id: "loc-pier",
            campaignId: "abc-123",
            name: "Lantern-Lit Gondola Pier",
            description: "A concrete pier scene.",
            kind: "persistent_sublocation",
            parentLocationId: "loc-macro",
            connectedTo: "[]",
          },
        ],
        players: [
          {
            id: "player-1",
            campaignId: "abc-123",
            name: "Hero",
            race: "Human",
            gender: "",
            age: "",
            appearance: "",
            hp: 5,
            tags: "[]",
            equippedItems: "[]",
            currentLocationId: "loc-pier",
            currentSceneLocationId: "loc-pier",
          },
        ],
        npcs: [
          {
            id: "npc-gondolier",
            campaignId: "abc-123",
            name: "Gondolier",
            persona: "",
            tags: "[]",
            tier: "temporary",
            currentLocationId: "loc-macro",
            currentSceneLocationId: "loc-pier",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
        ],
        items: [],
      }) as unknown as ReturnType<typeof getDb>,
    );

    const response = await app.request("/api/campaigns/abc-123/world");

    expect(response.status).toBe(200);
    const body = await response.json();
    const sceneHandle = publicPlaceHandle("loc-pier");
    const broadPlaceHandle = publicPlaceHandle("loc-macro");
    const gondolierActorHandle = publicActorHandle("npc-gondolier");

    expect(body.currentScene).toMatchObject({
      id: sceneHandle,
      sceneHandle,
      name: "Lantern-Lit Gondola Pier",
      broadLocationId: broadPlaceHandle,
      broadPlaceHandle,
      broadLocationName: "Canal Market District",
      sceneNpcIds: [gondolierActorHandle],
      actorHandles: [gondolierActorHandle],
      clearNpcIds: [gondolierActorHandle],
      clearActorHandles: [gondolierActorHandle],
      awareness: {
        byNpcId: {
          [gondolierActorHandle]: "clear",
        },
        byActorHandle: {
          [gondolierActorHandle]: "clear",
        },
      },
    });
    expect(body.npcs.find((npc: { id: string }) => npc.id === gondolierActorHandle)?.sceneScopeId)
      .toBe(sceneHandle);
  });
});
