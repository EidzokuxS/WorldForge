import { afterEach, describe, expect, it, vi } from "vitest";
import { getWorldData } from "../api";

const HANDLES = {
  actorPlayer: "pdto_actor_11111111111111111111111111111111",
  itemBedroll: "pdto_item_11111111111111111111111111111111",
  itemBow: "pdto_item_22222222222222222222222222222222",
  itemSword: "pdto_item_33333333333333333333333333333333",
  placeOne: "pdto_place_11111111111111111111111111111111",
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authoritative world inventory parsing", () => {
  it("preserves authoritative player inventory and equipment arrays instead of relying on legacy equippedItems strings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        locations: [],
        npcs: [],
        factions: [],
        relationships: [],
        items: [
          {
            id: HANDLES.itemBow,
            name: "Legacy Bow",
            tags: JSON.stringify(["weapon"]),
            ownerId: HANDLES.actorPlayer,
            locationId: null,
          },
        ],
        player: {
          id: HANDLES.actorPlayer,
          campaignId: "camp-1",
          name: "Hero",
          race: "Human",
          gender: "",
          age: "",
          appearance: "",
          hp: 5,
          tags: JSON.stringify([]),
          equippedItems: JSON.stringify(["Legacy Bow"]),
          currentLocationId: HANDLES.placeOne,
          inventory: [
            {
              id: HANDLES.itemBedroll,
              name: "Bedroll",
              tags: JSON.stringify(["gear"]),
              equipState: "carried",
              equippedSlot: null,
              isSignature: false,
            },
          ],
          equipment: [
            {
              id: HANDLES.itemSword,
              name: "Iron Sword",
              tags: JSON.stringify(["weapon", "steel"]),
              equipState: "equipped",
              equippedSlot: "hand",
              isSignature: true,
            },
          ],
        },
        personaTemplates: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const world = await getWorldData("camp-1");
    const player = world.player as unknown as {
      inventory?: Array<{
        id: string;
        itemHandle?: string;
        name: string;
        tags: string[];
        equipState: string;
        equippedSlot: string | null;
        isSignature: boolean;
      }>;
      equipment?: Array<{
        id: string;
        itemHandle?: string;
        name: string;
        tags: string[];
        equipState: string;
        equippedSlot: string | null;
        isSignature: boolean;
      }>;
      equippedItems?: string[];
    };

    expect(player.inventory).toEqual([
      {
        id: HANDLES.itemBedroll,
        itemHandle: HANDLES.itemBedroll,
        name: "Bedroll",
        tags: ["gear"],
        equipState: "carried",
        equippedSlot: null,
        isSignature: false,
      },
    ]);
    expect(player.equipment).toEqual([
      {
        id: HANDLES.itemSword,
        itemHandle: HANDLES.itemSword,
        name: "Iron Sword",
        tags: ["weapon", "steel"],
        equipState: "equipped",
        equippedSlot: "hand",
        isSignature: true,
      },
    ]);
    expect(player.equipment?.map((item) => item.name)).not.toEqual(player.equippedItems);
  });
});
