import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { quickActionOffers } from "../db/schema.js";
import { withSqliteWriteLock } from "../db/sqlite-write-lock.js";
import { AppError } from "../lib/index.js";
import { readWorldClock } from "./living-world-authority.js";
import { sanitizePlayerFacingText } from "./player-facing-events.js";

const MAX_QUICK_ACTIONS = 5;
const MAX_QUICK_ACTION_LABEL_LENGTH = 80;
const MAX_QUICK_ACTION_TEXT_LENGTH = 320;
const DEFAULT_QUICK_ACTION_TTL_TURNS = 1;
const QUICK_ACTION_CAPABILITY_PATTERN = /^qac_[a-f0-9]{32}$/u;

export interface IssuedQuickAction {
  label: string;
  action: string;
  handle: string;
}

export interface PersistQuickActionOfferInput {
  campaignId: string;
  actions: unknown;
  tick: number;
  sourceRefs?: readonly string[];
  ttlTurns?: number;
}

export interface ResolvedQuickActionSelection {
  action: string;
  label: string;
  handle: string;
  offerId: string;
  actionId: string;
  baseWorldVersion: number;
}

export class QuickActionSelectionError extends AppError {
  constructor(
    public readonly reason:
      | "malformed"
      | "not_found"
      | "consumed"
      | "expired"
      | "stale_world_version"
      | "digest_mismatch"
      | "race_lost",
    message = "That quick action is no longer available. Choose or type another action.",
  ) {
    super(message, reason === "malformed" ? 400 : 409);
    this.name = "QuickActionSelectionError";
  }
}

export function isQuickActionSelectionError(error: unknown): error is QuickActionSelectionError {
  return error instanceof QuickActionSelectionError;
}

function now(): number {
  return Date.now();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Digest(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function normalizeSourceRefs(sourceRefs: readonly string[] | undefined): string[] {
  return [...new Set((sourceRefs ?? []).filter((ref) => typeof ref === "string" && ref.trim().length > 0))]
    .map((ref) => ref.trim())
    .sort();
}

function sanitizeQuickActionEntry(entry: unknown): Omit<IssuedQuickAction, "handle"> | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  if (typeof record.label !== "string" || typeof record.action !== "string") return null;
  const label = sanitizePlayerFacingText(record.label, { maxChars: MAX_QUICK_ACTION_LABEL_LENGTH });
  const action = sanitizePlayerFacingText(record.action, { maxChars: MAX_QUICK_ACTION_TEXT_LENGTH });
  if (!label || !action || label === "[hidden]" || action === "[hidden]") return null;
  return { label, action };
}

function normalizeQuickActions(actions: unknown): Array<Omit<IssuedQuickAction, "handle">> {
  if (!Array.isArray(actions)) return [];
  return actions
    .flatMap((entry) => {
      const normalized = sanitizeQuickActionEntry(entry);
      return normalized ? [normalized] : [];
    })
    .slice(0, MAX_QUICK_ACTIONS);
}

function parseStoredSourceRefs(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("quick action source refs must be an array");
    }
    return normalizeSourceRefs(parsed.filter((ref): ref is string => typeof ref === "string"));
  } catch {
    throw new QuickActionSelectionError("digest_mismatch");
  }
}

function createCapability(): string {
  return `qac_${crypto.randomUUID().replace(/-/gu, "")}`;
}

function createIssuedId(prefix: "qao" | "qaa" | "qar"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function evidenceDigest(input: {
  campaignId: string;
  offerId: string;
  actionId: string;
  label: string;
  action: string;
  sourceRefs: readonly string[];
  baseWorldVersion: number;
  createdTick: number;
  expiresAtTick: number;
}): string {
  return sha256Digest(input);
}

export async function persistQuickActionOffer(
  input: PersistQuickActionOfferInput,
): Promise<{ actions: IssuedQuickAction[] }> {
  const actions = normalizeQuickActions(input.actions);
  if (actions.length === 0) {
    throw new AppError("offer_quick_actions produced no player-safe actions.", 422);
  }

  return await withSqliteWriteLock(`quick-action-offer:${input.campaignId}`, () => {
    const db = getDb();
    const clock = readWorldClock(input.campaignId);
    const createdTick = Math.max(0, input.tick);
    const ttlTurns = Math.max(1, input.ttlTurns ?? DEFAULT_QUICK_ACTION_TTL_TURNS);
    const expiresAtTick = createdTick + ttlTurns;
    const offerId = createIssuedId("qao");
    const sourceRefs = normalizeSourceRefs(input.sourceRefs);
    const timestamp = now();
    const rows = actions.map((action) => {
      const actionId = createIssuedId("qaa");
      const capability = createCapability();
      return {
        id: createIssuedId("qar"),
        campaignId: input.campaignId,
        offerId,
        actionId,
        capability,
        label: action.label,
        action: action.action,
        sourceRefsJson: JSON.stringify(sourceRefs),
        sourceEvidenceDigest: evidenceDigest({
          campaignId: input.campaignId,
          offerId,
          actionId,
          label: action.label,
          action: action.action,
          sourceRefs,
          baseWorldVersion: clock.worldVersion,
          createdTick,
          expiresAtTick,
        }),
        baseWorldVersion: clock.worldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        createdTick,
        expiresAtTick,
        consumedAt: null,
        consumedTick: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies typeof quickActionOffers.$inferInsert;
    });

    db.insert(quickActionOffers).values(rows).run();
    return {
      actions: rows.map((row) => ({
        label: row.label,
        action: row.action,
        handle: row.capability,
      })),
    };
  });
}

export async function resolveQuickActionSelection(input: {
  campaignId: string;
  handle: string;
  currentTick: number;
}): Promise<ResolvedQuickActionSelection> {
  const handle = input.handle.trim();
  if (!QUICK_ACTION_CAPABILITY_PATTERN.test(handle)) {
    throw new QuickActionSelectionError("malformed");
  }

  return await withSqliteWriteLock(`quick-action-select:${input.campaignId}`, () => {
    const db = getDb();
    const row = db
      .select()
      .from(quickActionOffers)
      .where(and(
        eq(quickActionOffers.campaignId, input.campaignId),
        eq(quickActionOffers.capability, handle),
      ))
      .get();

    if (!row) {
      throw new QuickActionSelectionError("not_found");
    }
    if (row.consumedAt !== null) {
      throw new QuickActionSelectionError("consumed");
    }
    if (row.expiresAtTick < input.currentTick) {
      throw new QuickActionSelectionError("expired");
    }

    const sourceRefs = parseStoredSourceRefs(row.sourceRefsJson);
    const expectedDigest = evidenceDigest({
      campaignId: row.campaignId,
      offerId: row.offerId,
      actionId: row.actionId,
      label: row.label,
      action: row.action,
      sourceRefs,
      baseWorldVersion: row.baseWorldVersion,
      createdTick: row.createdTick,
      expiresAtTick: row.expiresAtTick,
    });
    if (expectedDigest !== row.sourceEvidenceDigest) {
      throw new QuickActionSelectionError("digest_mismatch");
    }

    const clock = readWorldClock(input.campaignId);
    if (clock.worldVersion !== row.baseWorldVersion) {
      throw new QuickActionSelectionError("stale_world_version");
    }

    const timestamp = now();
    const update = db
      .update(quickActionOffers)
      .set({
        consumedAt: timestamp,
        consumedTick: input.currentTick,
        updatedAt: timestamp,
      })
      .where(and(
        eq(quickActionOffers.campaignId, input.campaignId),
        eq(quickActionOffers.capability, handle),
        isNull(quickActionOffers.consumedAt),
      ))
      .run();

    if (update.changes !== 1) {
      throw new QuickActionSelectionError("race_lost");
    }

    return {
      action: row.action,
      label: row.label,
      handle: row.capability,
      offerId: row.offerId,
      actionId: row.actionId,
      baseWorldVersion: row.baseWorldVersion,
    };
  });
}
