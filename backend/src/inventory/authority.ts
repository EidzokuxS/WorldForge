import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { CanonicalLoadoutItemSpec } from "@worldforge/shared";
import { getDb } from "../db/index.js";
import { items } from "../db/schema.js";

export const INVENTORY_EQUIP_STATES = ["carried", "equipped"] as const;

export type InventoryEquipState = (typeof INVENTORY_EQUIP_STATES)[number];

export type AuthoritativeItemRow = {
  id: string;
  campaignId: string;
  name: string;
  tags: string;
  ownerId: string | null;
  locationId: string | null;
  equipState: InventoryEquipState;
  equippedSlot: string | null;
  isSignature: boolean;
};

export type AuthoritativeInventoryCompatibility = {
  inventorySeed: string[];
  equippedItemRefs: string[];
  signatureItems: string[];
};

export type AuthoritativeInventoryView = {
  items: AuthoritativeItemRow[];
  carried: AuthoritativeItemRow[];
  equipped: AuthoritativeItemRow[];
  signature: AuthoritativeItemRow[];
  compatibility: AuthoritativeInventoryCompatibility;
};

export function normalizeInventoryItemName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function includesNormalized(values: string[], candidate: string): boolean {
  const normalizedCandidate = normalizeInventoryItemName(candidate).toLowerCase();
  return values.some(
    (value) => normalizeInventoryItemName(value).toLowerCase() === normalizedCandidate,
  );
}

function dedupeItemNames(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = normalizeInventoryItemName(value);
    if (!normalized || includesNormalized(deduped, normalized)) {
      continue;
    }
    deduped.push(normalized);
  }
  return deduped;
}

function sortByName(rows: AuthoritativeItemRow[]): AuthoritativeItemRow[] {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name));
}

export function buildAuthoritativeInventoryView(
  itemRows: AuthoritativeItemRow[],
): AuthoritativeInventoryView {
  const ownedRows = sortByName(itemRows);
  const equipped = ownedRows.filter((row) => row.equipState === "equipped");
  const carried = ownedRows.filter((row) => row.equipState !== "equipped");
  const signature = ownedRows.filter((row) => row.isSignature);

  return {
    items: ownedRows,
    carried,
    equipped,
    signature,
    compatibility: {
      inventorySeed: dedupeItemNames(ownedRows.map((row) => row.name)),
      equippedItemRefs: dedupeItemNames(equipped.map((row) => row.name)),
      signatureItems: dedupeItemNames(signature.map((row) => row.name)),
    },
  };
}

export function loadAuthoritativeInventoryView(
  campaignId: string,
  ownerId: string,
): AuthoritativeInventoryView {
  const db = getDb();
  const ownedRows = db
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
    .where(and(eq(items.campaignId, campaignId), eq(items.ownerId, ownerId)))
    .all();

  return buildAuthoritativeInventoryView(ownedRows);
}

export function toAuthoritativeItemSeed(
  campaignId: string,
  ownerId: string,
  item: CanonicalLoadoutItemSpec,
): {
  id: string;
  campaignId: string;
  name: string;
  tags: string;
  ownerId: string;
  locationId: null;
  equipState: InventoryEquipState;
  equippedSlot: string | null;
  isSignature: boolean;
} {
  const equipped = item.slot === "equipped";
  return {
    id: crypto.randomUUID(),
    campaignId,
    name: item.name,
    tags: JSON.stringify(item.tags),
    ownerId,
    locationId: null,
    equipState: equipped ? "equipped" : "carried",
    equippedSlot: equipped ? "equipped" : null,
    isSignature: item.slot === "signature" || item.tags.includes("signature"),
  };
}

export function isAuthoritativeItemMetadataEqual(
  row: Pick<AuthoritativeItemRow, "equipState" | "equippedSlot" | "isSignature">,
  desired: Pick<AuthoritativeItemRow, "equipState" | "equippedSlot" | "isSignature">,
): boolean {
  return row.equipState === desired.equipState
    && row.equippedSlot === desired.equippedSlot
    && row.isSignature === desired.isSignature;
}
