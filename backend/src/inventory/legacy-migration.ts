import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { AppError } from "../lib/index.js";
import { getDb } from "../db/index.js";
import { items, npcs, players } from "../db/schema.js";
import {
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
  projectNpcRecord,
  projectPlayerRecord,
} from "../character/record-adapters.js";
import {
  isAuthoritativeItemMetadataEqual,
  loadAuthoritativeInventoryView,
  normalizeInventoryItemName,
  type AuthoritativeItemRow,
  type InventoryEquipState,
} from "./authority.js";

type LegacyLoadout = {
  inventorySeed: string[];
  equippedItemRefs: string[];
  signatureItems: string[];
};

type DesiredAuthoritativeItem = {
  name: string;
  equipState: InventoryEquipState;
  equippedSlot: string | null;
  isSignature: boolean;
};

type PlayerRow = typeof players.$inferSelect;
type NpcRow = typeof npcs.$inferSelect;

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => normalizeInventoryItemName(value))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function dedupeNames(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = normalizeInventoryItemName(value);
    if (!normalized) {
      continue;
    }
    if (
      deduped.some(
        (existing) => existing.toLowerCase() === normalized.toLowerCase(),
      )
    ) {
      continue;
    }
    deduped.push(normalized);
  }
  return deduped;
}

function readLegacyLoadout(rawRecord: string | null | undefined): LegacyLoadout {
  if (!rawRecord) {
    return {
      inventorySeed: [],
      equippedItemRefs: [],
      signatureItems: [],
    };
  }

  try {
    const parsed = JSON.parse(rawRecord) as {
      loadout?: {
        inventorySeed?: unknown;
        equippedItemRefs?: unknown;
        signatureItems?: unknown;
      };
    };
    const loadout = parsed?.loadout ?? {};
    return {
      inventorySeed: dedupeNames(
        Array.isArray(loadout.inventorySeed)
          ? loadout.inventorySeed.filter((value): value is string => typeof value === "string")
          : [],
      ),
      equippedItemRefs: dedupeNames(
        Array.isArray(loadout.equippedItemRefs)
          ? loadout.equippedItemRefs.filter((value): value is string => typeof value === "string")
          : [],
      ),
      signatureItems: dedupeNames(
        Array.isArray(loadout.signatureItems)
          ? loadout.signatureItems.filter((value): value is string => typeof value === "string")
          : [],
      ),
    };
  } catch {
    return {
      inventorySeed: [],
      equippedItemRefs: [],
      signatureItems: [],
    };
  }
}

function sameNormalizedSet(left: string[], right: string[]): boolean {
  const normalizedLeft = dedupeNames(left).map((value) => value.toLowerCase()).sort();
  const normalizedRight = dedupeNames(right).map((value) => value.toLowerCase()).sort();
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function buildDesiredAuthoritativeItems(loadout: LegacyLoadout): DesiredAuthoritativeItem[] {
  const allNames = dedupeNames([
    ...loadout.inventorySeed,
    ...loadout.equippedItemRefs,
    ...loadout.signatureItems,
  ]);

  return allNames.map((name) => {
    const equipped = loadout.equippedItemRefs.some(
      (entry) => entry.toLowerCase() === name.toLowerCase(),
    );
    const signature = loadout.signatureItems.some(
      (entry) => entry.toLowerCase() === name.toLowerCase(),
    );

    return {
      name,
      equipState: equipped ? "equipped" : "carried",
      equippedSlot: equipped ? "equipped" : null,
      isSignature: signature,
    };
  });
}

function findUnmatchedRowByName(
  rows: AuthoritativeItemRow[],
  consumedRowIds: Set<string>,
  itemName: string,
): AuthoritativeItemRow | null {
  const normalizedName = normalizeInventoryItemName(itemName).toLowerCase();
  return rows.find(
    (row) =>
      !consumedRowIds.has(row.id)
      && normalizeInventoryItemName(row.name).toLowerCase() === normalizedName,
  ) ?? null;
}

function buildPlayerLegacyLoadout(campaignId: string, row: PlayerRow): LegacyLoadout {
  const recordLoadout = readLegacyLoadout(row.characterRecord);
  const equippedItems = dedupeNames(parseStringArray(row.equippedItems));

  if (
    recordLoadout.equippedItemRefs.length > 0
    && equippedItems.length > 0
    && !sameNormalizedSet(recordLoadout.equippedItemRefs, equippedItems)
  ) {
    throw new AppError(
      `Inventory authority migration conflict in campaign ${campaignId} for player ${row.id}: `
        + `characterRecord equipped items ${recordLoadout.equippedItemRefs.join(", ")} `
        + `do not match players.equippedItems ${equippedItems.join(", ")}.`,
      500,
    );
  }

  return {
    inventorySeed: recordLoadout.inventorySeed,
    equippedItemRefs:
      recordLoadout.equippedItemRefs.length > 0
        ? recordLoadout.equippedItemRefs
        : equippedItems,
    signatureItems: recordLoadout.signatureItems,
  };
}

function buildNpcLegacyLoadout(row: NpcRow): LegacyLoadout {
  return readLegacyLoadout(row.characterRecord);
}

function upsertDesiredItemsForOwner(
  campaignId: string,
  ownerId: string,
  existingRows: AuthoritativeItemRow[],
  desiredItems: DesiredAuthoritativeItem[],
): void {
  const db = getDb();
  const consumedRowIds = new Set<string>();

  for (const desiredItem of desiredItems) {
    const matchingRow = findUnmatchedRowByName(existingRows, consumedRowIds, desiredItem.name);
    if (matchingRow) {
      consumedRowIds.add(matchingRow.id);
      if (!isAuthoritativeItemMetadataEqual(matchingRow, desiredItem)) {
        db.update(items)
          .set({
            equipState: desiredItem.equipState,
            equippedSlot: desiredItem.equippedSlot,
            isSignature: desiredItem.isSignature,
            ownerId,
            locationId: null,
          })
          .where(eq(items.id, matchingRow.id))
          .run();
      }
      continue;
    }

    db.insert(items)
      .values({
        id: crypto.randomUUID(),
        campaignId,
        name: desiredItem.name,
        tags: "[]",
        ownerId,
        locationId: null,
        equipState: desiredItem.equipState,
        equippedSlot: desiredItem.equippedSlot,
        isSignature: desiredItem.isSignature,
      })
      .run();
  }
}

function rewritePlayerCompatibilityProjection(campaignId: string, row: PlayerRow): void {
  const db = getDb();
  const authoritativeView = loadAuthoritativeInventoryView(campaignId, row.id);
  const baseRecord = hydrateStoredPlayerRecord(row);
  const authoritativeRecord = {
    ...baseRecord,
    loadout: {
      ...baseRecord.loadout,
      ...authoritativeView.compatibility,
    },
  };
  const projection = projectPlayerRecord(authoritativeRecord);

  db.update(players)
    .set(projection)
    .where(eq(players.id, row.id))
    .run();
}

function rewriteNpcCompatibilityProjection(campaignId: string, row: NpcRow): void {
  const db = getDb();
  const authoritativeView = loadAuthoritativeInventoryView(campaignId, row.id);
  const baseRecord = hydrateStoredNpcRecord(row);
  const authoritativeRecord = {
    ...baseRecord,
    loadout: {
      ...baseRecord.loadout,
      ...authoritativeView.compatibility,
    },
  };
  const projection = projectNpcRecord(authoritativeRecord);

  db.update(npcs)
    .set(projection)
    .where(eq(npcs.id, row.id))
    .run();
}

export function ensureCampaignInventoryAuthority(campaignId: string): void {
  const db = getDb();
  const playerRows = db.select().from(players).where(eq(players.campaignId, campaignId)).all();
  const npcRows = db.select().from(npcs).where(eq(npcs.campaignId, campaignId)).all();

  for (const row of playerRows) {
    const existingRows = db
      .select({
        id: items.id,
        campaignId: items.campaignId,
        name: items.name,
        tags: items.tags,
        ownerId: items.ownerId,
        locationId: items.locationId,
        equipState: items.equipState,
        equippedSlot: items.equippedSlot,
        isSignature: items.isSignature,
      })
      .from(items)
      .where(and(eq(items.campaignId, campaignId), eq(items.ownerId, row.id)))
      .all();
    const desiredItems = buildDesiredAuthoritativeItems(
      buildPlayerLegacyLoadout(campaignId, row),
    );

    upsertDesiredItemsForOwner(campaignId, row.id, existingRows, desiredItems);
    rewritePlayerCompatibilityProjection(campaignId, row);
  }

  for (const row of npcRows) {
    const existingRows = db
      .select({
        id: items.id,
        campaignId: items.campaignId,
        name: items.name,
        tags: items.tags,
        ownerId: items.ownerId,
        locationId: items.locationId,
        equipState: items.equipState,
        equippedSlot: items.equippedSlot,
        isSignature: items.isSignature,
      })
      .from(items)
      .where(and(eq(items.campaignId, campaignId), eq(items.ownerId, row.id)))
      .all();
    const desiredItems = buildDesiredAuthoritativeItems(buildNpcLegacyLoadout(row));

    upsertDesiredItemsForOwner(campaignId, row.id, existingRows, desiredItems);
    rewriteNpcCompatibilityProjection(campaignId, row);
  }
}
