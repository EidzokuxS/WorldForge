import { afterEach, describe, expect, it, vi } from "vitest";
import { getWorldData } from "../api";

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
            id: "legacy-bow",
            name: "Legacy Bow",
            tags: JSON.stringify(["weapon"]),
            ownerId: "player-1",
            locationId: null,
          },
        ],
        player: {
          id: "player-1",
          campaignId: "camp-1",
          name: "Hero",
          race: "Human",
          gender: "",
          age: "",
          appearance: "",
          hp: 5,
          tags: JSON.stringify([]),
          equippedItems: JSON.stringify(["Legacy Bow"]),
          currentLocationId: "loc-1",
          inventory: [
            {
              id: "item-bedroll",
              name: "Bedroll",
              tags: JSON.stringify(["gear"]),
              equipState: "carried",
              equippedSlot: null,
              isSignature: false,
            },
          ],
          equipment: [
            {
              id: "item-sword",
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
        name: string;
        tags: string[];
        equipState: string;
        equippedSlot: string | null;
        isSignature: boolean;
      }>;
      equipment?: Array<{
        id: string;
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
        id: "item-bedroll",
        name: "Bedroll",
        tags: ["gear"],
        equipState: "carried",
        equippedSlot: null,
        isSignature: false,
      },
    ]);
    expect(player.equipment).toEqual([
      {
        id: "item-sword",
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
