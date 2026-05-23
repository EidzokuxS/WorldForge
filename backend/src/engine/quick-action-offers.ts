import { and, eq, gte, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { quickActionOffers } from "../db/schema.js";

export interface QuickActionOfferAction {
  actionId: string;
  label: string;
  action: string;
  sourceRefs: string[];
  sourceEvidenceDigest: string;
}

export interface PersistQuickActionOfferInput {
  campaignId: string;
  offerId: string;
  tick: number;
  baseWorldVersion: number;
  actions: QuickActionOfferAction[];
}

export interface ResolveSelectedQuickActionInput {
  campaignId: string;
  offerId: string;
  actionId: string;
  submittedAction: string;
  currentTick: number;
  currentWorldVersion: number;
}

export interface ResolvedSelectedQuickAction {
  offerId: string;
  actionId: string;
  label: string;
  action: string;
  sourceEvidenceDigest: string;
}

export class QuickActionOfferError extends Error {
  constructor(
    public readonly code: "not_found" | "expired" | "consumed" | "mismatch" | "stale",
    message: string,
  ) {
    super(message);
    this.name = "QuickActionOfferError";
  }
}

function readSourceRefs(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function persistQuickActionOffer(input: PersistQuickActionOfferInput): boolean {
  if (input.actions.length === 0) {
    return true;
  }
  if (!Number.isSafeInteger(input.baseWorldVersion) || input.baseWorldVersion < 0) {
    return false;
  }

  try {
    const now = Date.now();
    const rows = input.actions.map((action) => ({
      actionId: action.actionId,
      offerId: input.offerId,
      campaignId: input.campaignId,
      label: action.label,
      action: action.action,
      sourceRefs: JSON.stringify(action.sourceRefs),
      sourceEvidenceDigest: action.sourceEvidenceDigest,
      tick: input.tick,
      expiresAtTick: input.tick + 1,
      baseWorldVersion: input.baseWorldVersion,
      consumedAt: null,
      createdAt: now,
      updatedAt: now,
    }));

    getDb()
      .insert(quickActionOffers)
      .values(rows)
      .onConflictDoNothing()
      .run();
    return true;
  } catch {
    return false;
  }
}

export function resolveSelectedQuickActionOffer(
  input: ResolveSelectedQuickActionInput,
): ResolvedSelectedQuickAction {
  const row = getDb()
    .select()
    .from(quickActionOffers)
    .where(and(
      eq(quickActionOffers.campaignId, input.campaignId),
      eq(quickActionOffers.offerId, input.offerId),
      eq(quickActionOffers.actionId, input.actionId),
    ))
    .get();

  if (!row) {
    throw new QuickActionOfferError(
      "not_found",
      "That quick action is no longer available.",
    );
  }

  if (row.consumedAt !== null) {
    throw new QuickActionOfferError(
      "consumed",
      "That quick action has already been used.",
    );
  }

  if (input.currentTick > row.expiresAtTick) {
    throw new QuickActionOfferError(
      "expired",
      "That quick action has expired.",
    );
  }

  if (input.submittedAction.trim() !== row.action.trim()) {
    throw new QuickActionOfferError(
      "mismatch",
      "That quick action does not match the offered action.",
    );
  }

  if (row.baseWorldVersion !== input.currentWorldVersion) {
    throw new QuickActionOfferError(
      "stale",
      "That quick action belongs to an older world state.",
    );
  }

  const consumedAt = Date.now();
  const result = getDb()
    .update(quickActionOffers)
    .set({ consumedAt, updatedAt: consumedAt })
    .where(and(
      eq(quickActionOffers.campaignId, input.campaignId),
      eq(quickActionOffers.offerId, input.offerId),
      eq(quickActionOffers.actionId, input.actionId),
      isNull(quickActionOffers.consumedAt),
      gte(quickActionOffers.expiresAtTick, input.currentTick),
      eq(quickActionOffers.baseWorldVersion, input.currentWorldVersion),
    ))
    .run();
  if (result.changes !== 1) {
    throw new QuickActionOfferError(
      "stale",
      "That quick action is no longer available.",
    );
  }

  return {
    offerId: row.offerId,
    actionId: row.actionId,
    label: row.label,
    action: row.action,
    sourceEvidenceDigest: row.sourceEvidenceDigest,
  };
}

export function readQuickActionOfferSourceRefs(sourceRefs: string): string[] {
  return readSourceRefs(sourceRefs);
}
