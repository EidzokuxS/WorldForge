import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

import type { TurnSnapshot } from "../engine/state-snapshot.js";
import { getCampaignDir } from "./paths.js";

const lastTurnSnapshots = new Map<string, TurnSnapshot>();
interface ActiveTurnLease {
  campaignId: string;
  token: string;
  owner: string;
  startedAt: number;
  heartbeatAt: number;
}

export interface LastTurnSnapshotMetadata {
  acceptedDurableEventIds: string[];
  producedDurableEventIds: string[];
  playerAction: string | null;
  chatHistoryLengthBeforeTurn: number | null;
  chatHistoryLengthAfterTurn: number | null;
}

const EMPTY_LAST_TURN_SNAPSHOT_METADATA: LastTurnSnapshotMetadata = {
  acceptedDurableEventIds: [],
  producedDurableEventIds: [],
  playerAction: null,
  chatHistoryLengthBeforeTurn: null,
  chatHistoryLengthAfterTurn: null,
};

const lastTurnSnapshotMetadata = new Map<string, LastTurnSnapshotMetadata>();
const campaignsWithActiveTurn = new Set<string>();
const activeTurnLeaseTokens = new Map<string, string>();
const TURN_BOUNDARY_DIRNAME = ".turn-boundaries";
const LAST_TURN_BOUNDARY_DIRNAME = "last-turn-boundary";
const LAST_TURN_MANIFEST_FILENAME = "manifest.json";
const ACTIVE_TURN_LEASE_FILENAME = "active-turn-lease.json";
const ACTIVE_TURN_RECLAIM_LOCK_FILENAME = "active-turn-lease.reclaim-lock.json";
const PENDING_ROLLBACK_INTENT_FILENAME = "pending-rollback-intent.json";
const ACTIVE_TURN_LEASE_STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const ACTIVE_TURN_MALFORMED_LEASE_GRACE_MS = 30 * 1000;
const ACTIVE_TURN_RECLAIM_LOCK_STALE_AFTER_MS = ACTIVE_TURN_MALFORMED_LEASE_GRACE_MS;

interface LastTurnSnapshotManifest {
  version: 1;
  snapshot: TurnSnapshot;
  metadata: LastTurnSnapshotMetadata;
}

export interface PendingRollbackIntent {
  version: 1;
  campaignId: string;
  route: string;
  snapshot: TurnSnapshot;
  turnId: string | null;
  eventIds: string[];
  createdAt: number;
}

function uniqueStrings(values: readonly unknown[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values ?? []) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function fsyncDirectoryBestEffort(dirPath: string): void {
  let fd: number | null = null;
  try {
    fd = fs.openSync(dirPath, "r");
    fs.fsyncSync(fd);
  } catch {
    // Some platforms do not allow directory fsync. The file fsync still gives
    // us the important crash boundary; the directory fence is best-effort.
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

function writeUtf8FileAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpPath, "w");
    fs.writeFileSync(fd, content, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, filePath);
    fsyncDirectoryBestEffort(path.dirname(filePath));
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // Successful rename already removed it.
    }
  }
}

function normalizeSnapshotMetadata(metadata?: {
  acceptedDurableEventIds?: readonly string[];
  producedDurableEventIds?: readonly string[];
  playerAction?: string | null;
  chatHistoryLengthBeforeTurn?: number | null;
  chatHistoryLengthAfterTurn?: number | null;
}): LastTurnSnapshotMetadata {
  return {
    acceptedDurableEventIds: uniqueStrings(metadata?.acceptedDurableEventIds),
    producedDurableEventIds: uniqueStrings(metadata?.producedDurableEventIds),
    playerAction: metadata?.playerAction ?? null,
    chatHistoryLengthBeforeTurn: metadata?.chatHistoryLengthBeforeTurn ?? null,
    chatHistoryLengthAfterTurn: metadata?.chatHistoryLengthAfterTurn ?? null,
  };
}

function lastTurnManifestPath(campaignId: string): string {
  return path.join(
    getCampaignDir(campaignId),
    TURN_BOUNDARY_DIRNAME,
    LAST_TURN_BOUNDARY_DIRNAME,
    LAST_TURN_MANIFEST_FILENAME,
  );
}

function activeTurnLeasePath(campaignId: string): string {
  return path.join(
    getCampaignDir(campaignId),
    TURN_BOUNDARY_DIRNAME,
    ACTIVE_TURN_LEASE_FILENAME,
  );
}

function activeTurnReclaimLockPath(campaignId: string): string {
  return path.join(
    getCampaignDir(campaignId),
    TURN_BOUNDARY_DIRNAME,
    ACTIVE_TURN_RECLAIM_LOCK_FILENAME,
  );
}

function pendingRollbackIntentPath(campaignId: string): string {
  return path.join(
    getCampaignDir(campaignId),
    TURN_BOUNDARY_DIRNAME,
    PENDING_ROLLBACK_INTENT_FILENAME,
  );
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function parseManifest(value: unknown, campaignId: string): LastTurnSnapshotManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  const snapshot = record.snapshot;
  const metadata = record.metadata;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;

  const snapshotRecord = snapshot as Record<string, unknown>;
  const metadataRecord = metadata as Record<string, unknown>;
  if (
    snapshotRecord.campaignId !== campaignId
    || typeof snapshotRecord.snapshotId !== "string"
    || typeof snapshotRecord.bundleDir !== "string"
    || typeof snapshotRecord.capturedAt !== "number"
    || !Number.isFinite(snapshotRecord.capturedAt)
    || !(typeof snapshotRecord.capturedWorldVersion === "number" || snapshotRecord.capturedWorldVersion === null)
    || !(typeof snapshotRecord.capturedWorldTimeMinutes === "number" || snapshotRecord.capturedWorldTimeMinutes === null)
    || !Array.isArray(metadataRecord.acceptedDurableEventIds)
    || !Array.isArray(metadataRecord.producedDurableEventIds)
    || !(typeof metadataRecord.playerAction === "string" || metadataRecord.playerAction === null)
    || !isNullableNumber(metadataRecord.chatHistoryLengthBeforeTurn)
    || !isNullableNumber(metadataRecord.chatHistoryLengthAfterTurn)
  ) {
    return null;
  }

  return {
    version: 1,
    snapshot: {
      campaignId,
      snapshotId: snapshotRecord.snapshotId,
      bundleDir: snapshotRecord.bundleDir,
      capturedAt: snapshotRecord.capturedAt,
      capturedWorldVersion: snapshotRecord.capturedWorldVersion,
      capturedWorldTimeMinutes: snapshotRecord.capturedWorldTimeMinutes,
      fileHashes: parseSnapshotFileHashes(snapshotRecord.fileHashes),
    },
    metadata: {
      acceptedDurableEventIds: uniqueStrings(metadataRecord.acceptedDurableEventIds),
      producedDurableEventIds: uniqueStrings(metadataRecord.producedDurableEventIds),
      playerAction: metadataRecord.playerAction,
      chatHistoryLengthBeforeTurn: metadataRecord.chatHistoryLengthBeforeTurn,
      chatHistoryLengthAfterTurn: metadataRecord.chatHistoryLengthAfterTurn,
    },
  };
}

function parseSnapshotFileHashes(value: unknown): TurnSnapshot["fileHashes"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.stateDb !== "string"
    || typeof record.config !== "string"
    || typeof record.chatHistory !== "string"
  ) {
    return null;
  }
  return {
    stateDb: record.stateDb,
    config: record.config,
    chatHistory: record.chatHistory,
    vectors: typeof record.vectors === "string" ? record.vectors : record.vectors === null ? null : undefined,
  };
}

function parsePendingRollbackIntent(value: unknown, campaignId: string): PendingRollbackIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1
    || record.campaignId !== campaignId
    || typeof record.route !== "string"
    || !(typeof record.turnId === "string" || record.turnId === null || record.turnId === undefined)
    || !Array.isArray(record.eventIds)
    || typeof record.createdAt !== "number"
    || !Number.isFinite(record.createdAt)
  ) {
    return null;
  }
  const snapshot = record.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const snapshotRecord = snapshot as Record<string, unknown>;
  if (
    snapshotRecord.campaignId !== campaignId
    || typeof snapshotRecord.snapshotId !== "string"
    || typeof snapshotRecord.bundleDir !== "string"
    || typeof snapshotRecord.capturedAt !== "number"
    || !Number.isFinite(snapshotRecord.capturedAt)
    || !(typeof snapshotRecord.capturedWorldVersion === "number" || snapshotRecord.capturedWorldVersion === null)
    || !(typeof snapshotRecord.capturedWorldTimeMinutes === "number" || snapshotRecord.capturedWorldTimeMinutes === null)
  ) {
    return null;
  }
  return {
    version: 1,
    campaignId,
    route: record.route,
    snapshot: {
      campaignId,
      snapshotId: snapshotRecord.snapshotId,
      bundleDir: snapshotRecord.bundleDir,
      capturedAt: snapshotRecord.capturedAt,
      capturedWorldVersion: snapshotRecord.capturedWorldVersion,
      capturedWorldTimeMinutes: snapshotRecord.capturedWorldTimeMinutes,
      fileHashes: parseSnapshotFileHashes(snapshotRecord.fileHashes),
    },
    turnId: record.turnId ?? null,
    eventIds: uniqueStrings(record.eventIds),
    createdAt: record.createdAt,
  };
}

function readLastTurnManifest(campaignId: string): LastTurnSnapshotManifest | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(lastTurnManifestPath(campaignId), "utf8")) as unknown;
    return parseManifest(manifest, campaignId);
  } catch {
    return null;
  }
}

type ActiveTurnLeaseState =
  | { kind: "missing" }
  | { kind: "valid"; lease: ActiveTurnLease }
  | { kind: "malformed"; modifiedAt: number };

interface ActiveTurnReclaimLock {
  campaignId: string;
  token: string;
  owner: string;
  startedAt: number;
}

type ActiveTurnReclaimLockState =
  | { kind: "missing" }
  | { kind: "valid"; lock: ActiveTurnReclaimLock }
  | { kind: "malformed"; modifiedAt: number };

function malformedActiveTurnLeaseState(campaignId: string): ActiveTurnLeaseState {
  try {
    return {
      kind: "malformed",
      modifiedAt: fs.statSync(activeTurnLeasePath(campaignId)).mtimeMs,
    };
  } catch {
    return { kind: "missing" };
  }
}

function readActiveTurnLeaseState(campaignId: string): ActiveTurnLeaseState {
  const leasePath = activeTurnLeasePath(campaignId);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(leasePath, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "missing" };
    }
    return malformedActiveTurnLeaseState(campaignId);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return malformedActiveTurnLeaseState(campaignId);
  }
  const record = parsed as Record<string, unknown>;
  if (
    record.campaignId !== campaignId
    || typeof record.token !== "string"
    || typeof record.owner !== "string"
    || typeof record.startedAt !== "number"
    || typeof record.heartbeatAt !== "number"
    || !Number.isFinite(record.startedAt)
    || !Number.isFinite(record.heartbeatAt)
  ) {
    return malformedActiveTurnLeaseState(campaignId);
  }
  return {
    kind: "valid",
    lease: {
      campaignId,
      token: record.token,
      owner: record.owner,
      startedAt: record.startedAt,
      heartbeatAt: record.heartbeatAt,
    },
  };
}

function readActiveTurnLease(campaignId: string): ActiveTurnLease | null {
  const state = readActiveTurnLeaseState(campaignId);
  return state.kind === "valid" ? state.lease : null;
}

function malformedActiveTurnLeaseIsFresh(state: Extract<ActiveTurnLeaseState, { kind: "malformed" }>, nowMs: number): boolean {
  return nowMs - state.modifiedAt < ACTIVE_TURN_MALFORMED_LEASE_GRACE_MS;
}

function parseActiveTurnReclaimLock(value: unknown, campaignId: string): ActiveTurnReclaimLock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.campaignId !== campaignId
    || typeof record.token !== "string"
    || typeof record.owner !== "string"
    || typeof record.startedAt !== "number"
    || !Number.isFinite(record.startedAt)
  ) {
    return null;
  }
  return {
    campaignId,
    token: record.token,
    owner: record.owner,
    startedAt: record.startedAt,
  };
}

function malformedActiveTurnReclaimLockState(campaignId: string): ActiveTurnReclaimLockState {
  try {
    return {
      kind: "malformed",
      modifiedAt: fs.statSync(activeTurnReclaimLockPath(campaignId)).mtimeMs,
    };
  } catch {
    return { kind: "missing" };
  }
}

function readActiveTurnReclaimLockState(campaignId: string): ActiveTurnReclaimLockState {
  try {
    const parsed = JSON.parse(fs.readFileSync(activeTurnReclaimLockPath(campaignId), "utf8")) as unknown;
    const lock = parseActiveTurnReclaimLock(parsed, campaignId);
    return lock ? { kind: "valid", lock } : malformedActiveTurnReclaimLockState(campaignId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "missing" };
    }
    return malformedActiveTurnReclaimLockState(campaignId);
  }
}

function writeActiveTurnReclaimLock(campaignId: string, lock: ActiveTurnReclaimLock): boolean {
  const lockPath = activeTurnReclaimLockPath(campaignId);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let fd: number | null = null;
  try {
    fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, JSON.stringify(lock, null, 2), "utf8");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

function replaceStaleActiveTurnReclaimLock(campaignId: string, lock: ActiveTurnReclaimLock): boolean {
  fs.writeFileSync(activeTurnReclaimLockPath(campaignId), JSON.stringify(lock, null, 2), "utf8");
  const state = readActiveTurnReclaimLockState(campaignId);
  return state.kind === "valid" && state.lock.token === lock.token;
}

function tryAcquireActiveTurnReclaimLock(campaignId: string, nowMs: number): string | null {
  const lock: ActiveTurnReclaimLock = {
    campaignId,
    token: randomUUID(),
    owner: `pid:${process.pid}`,
    startedAt: nowMs,
  };
  if (writeActiveTurnReclaimLock(campaignId, lock)) {
    return lock.token;
  }

  const existing = readActiveTurnReclaimLockState(campaignId);
  if (existing.kind === "valid") {
    if (nowMs - existing.lock.startedAt < ACTIVE_TURN_RECLAIM_LOCK_STALE_AFTER_MS) {
      return null;
    }
    return replaceStaleActiveTurnReclaimLock(campaignId, lock) ? lock.token : null;
  }
  if (existing.kind === "malformed") {
    if (nowMs - existing.modifiedAt < ACTIVE_TURN_RECLAIM_LOCK_STALE_AFTER_MS) {
      return null;
    }
    return replaceStaleActiveTurnReclaimLock(campaignId, lock) ? lock.token : null;
  }
  return writeActiveTurnReclaimLock(campaignId, lock) ? lock.token : null;
}

function activeTurnReclaimLockIsHeld(campaignId: string, token: string): boolean {
  const state = readActiveTurnReclaimLockState(campaignId);
  return state.kind === "valid" && state.lock.token === token;
}

function releaseActiveTurnReclaimLock(campaignId: string, token: string): void {
  try {
    if (activeTurnReclaimLockIsHeld(campaignId, token)) {
      fs.rmSync(activeTurnReclaimLockPath(campaignId), { force: true });
    }
  } catch {
    // Another process may already have claimed or removed this short-lived fence.
  }
}

function reclaimStaleMalformedActiveTurnLease(campaignId: string, lockToken: string, nowMs: number): boolean {
  if (!activeTurnReclaimLockIsHeld(campaignId, lockToken)) {
    return false;
  }
  const state = readActiveTurnLeaseState(campaignId);
  if (state.kind === "missing") {
    return true;
  }
  if (state.kind === "valid") {
    return false;
  }
  if (malformedActiveTurnLeaseIsFresh(state, nowMs)) {
    return false;
  }
  if (!activeTurnReclaimLockIsHeld(campaignId, lockToken)) {
    return false;
  }
  fs.rmSync(activeTurnLeasePath(campaignId), { force: true });
  return activeTurnReclaimLockIsHeld(campaignId, lockToken);
}

function reclaimStaleValidActiveTurnLease(
  campaignId: string,
  lockToken: string,
  expectedLeaseToken: string,
  nowMs: number,
): boolean {
  if (!activeTurnReclaimLockIsHeld(campaignId, lockToken)) {
    return false;
  }
  const state = readActiveTurnLeaseState(campaignId);
  if (state.kind === "missing") {
    return true;
  }
  if (state.kind !== "valid") {
    return false;
  }
  if (activeTurnLeaseIsFresh(state.lease, nowMs) || state.lease.token !== expectedLeaseToken) {
    return false;
  }
  if (!activeTurnReclaimLockIsHeld(campaignId, lockToken)) {
    return false;
  }
  fs.rmSync(activeTurnLeasePath(campaignId), { force: true });
  return activeTurnReclaimLockIsHeld(campaignId, lockToken);
}

function writeActiveTurnLease(campaignId: string, lease: ActiveTurnLease): void {
  const leasePath = activeTurnLeasePath(campaignId);
  fs.mkdirSync(path.dirname(leasePath), { recursive: true });
  const tmpPath = `${leasePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(lease, null, 2), "utf8");
  fs.renameSync(tmpPath, leasePath);
}

function tryCreateActiveTurnLease(campaignId: string, lease: ActiveTurnLease): boolean {
  const leasePath = activeTurnLeasePath(campaignId);
  fs.mkdirSync(path.dirname(leasePath), { recursive: true });
  let fd: number | null = null;
  try {
    fd = fs.openSync(leasePath, "wx");
    fs.writeFileSync(fd, JSON.stringify(lease, null, 2), "utf8");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

function deleteActiveTurnLease(campaignId: string, token?: string): void {
  try {
    const existing = readActiveTurnLease(campaignId);
    if (token && existing && existing.token !== token) return;
    fs.rmSync(activeTurnLeasePath(campaignId), { force: true });
  } catch {
    // Lease cleanup is best-effort; a stale lease will be reclaimed by tryBeginTurn.
  }
}

function activeTurnLeaseIsFresh(lease: ActiveTurnLease, nowMs: number): boolean {
  return nowMs - lease.heartbeatAt < ACTIVE_TURN_LEASE_STALE_AFTER_MS;
}

function hydrateLastTurnSnapshot(campaignId: string): boolean {
  if (lastTurnSnapshots.has(campaignId)) return true;
  const manifest = readLastTurnManifest(campaignId);
  if (!manifest) return false;
  lastTurnSnapshots.set(campaignId, manifest.snapshot);
  lastTurnSnapshotMetadata.set(campaignId, manifest.metadata);
  return true;
}

function persistLastTurnManifest(
  campaignId: string,
  snapshot: TurnSnapshot,
  metadata: LastTurnSnapshotMetadata,
): void {
  const manifestPath = lastTurnManifestPath(campaignId);
  writeUtf8FileAtomic(
    manifestPath,
    JSON.stringify({ version: 1, snapshot, metadata } satisfies LastTurnSnapshotManifest, null, 2),
  );
}

function deleteLastTurnManifest(campaignId: string): void {
  try {
    fs.rmSync(lastTurnManifestPath(campaignId), { force: true });
  } catch {
    // Runtime cleanup must remain best-effort if the snapshot directory already disappeared.
  }
}

export function tryBeginTurn(campaignId: string): boolean {
  if (campaignsWithActiveTurn.has(campaignId)) {
    return false;
  }
  const nowMs = Date.now();
  let reclaimLockToken: string | null = null;
  const existingLeaseState = readActiveTurnLeaseState(campaignId);
  try {
    if (existingLeaseState.kind === "valid") {
      if (activeTurnLeaseIsFresh(existingLeaseState.lease, nowMs)) {
        return false;
      }
      reclaimLockToken = tryAcquireActiveTurnReclaimLock(campaignId, nowMs);
      if (!reclaimLockToken) {
        return false;
      }
      if (!reclaimStaleValidActiveTurnLease(
        campaignId,
        reclaimLockToken,
        existingLeaseState.lease.token,
        nowMs,
      )) {
        return false;
      }
    } else if (existingLeaseState.kind === "malformed") {
      if (malformedActiveTurnLeaseIsFresh(existingLeaseState, nowMs)) {
        return false;
      }
      reclaimLockToken = tryAcquireActiveTurnReclaimLock(campaignId, nowMs);
      if (!reclaimLockToken) {
        return false;
      }
      if (!reclaimStaleMalformedActiveTurnLease(campaignId, reclaimLockToken, nowMs)) {
        return false;
      }
    }

    const token = randomUUID();
    const lease: ActiveTurnLease = {
      campaignId,
      token,
      owner: `pid:${process.pid}`,
      startedAt: nowMs,
      heartbeatAt: nowMs,
    };
    if (!tryCreateActiveTurnLease(campaignId, lease)) {
      return false;
    }
    const confirmedLease = readActiveTurnLease(campaignId);
    if (!confirmedLease || confirmedLease.token !== token) {
      deleteActiveTurnLease(campaignId, token);
      return false;
    }
    campaignsWithActiveTurn.add(campaignId);
    activeTurnLeaseTokens.set(campaignId, token);
    return true;
  } finally {
    if (reclaimLockToken) {
      releaseActiveTurnReclaimLock(campaignId, reclaimLockToken);
    }
  }
}

export function endTurn(campaignId: string): void {
  const token = activeTurnLeaseTokens.get(campaignId);
  if (token) {
    deleteActiveTurnLease(campaignId, token);
  }
  activeTurnLeaseTokens.delete(campaignId);
  campaignsWithActiveTurn.delete(campaignId);
}

export function heartbeatActiveTurn(campaignId: string): void {
  const token = activeTurnLeaseTokens.get(campaignId);
  if (!token) {
    throw new Error(`No active turn lease is held for campaign ${campaignId}.`);
  }
  const existing = readActiveTurnLease(campaignId);
  if (!existing || existing.token !== token) {
    throw new Error(`Active turn lease for campaign ${campaignId} was lost.`);
  }
  writeActiveTurnLease(campaignId, {
    ...existing,
    heartbeatAt: Date.now(),
  });
}

export function assertActiveTurnLease(campaignId: string): void {
  heartbeatActiveTurn(campaignId);
}

export function hasActiveTurn(campaignId: string): boolean {
  if (campaignsWithActiveTurn.has(campaignId)) return true;
  const state = readActiveTurnLeaseState(campaignId);
  const nowMs = Date.now();
  if (state.kind === "valid") return activeTurnLeaseIsFresh(state.lease, nowMs);
  if (state.kind === "malformed") return malformedActiveTurnLeaseIsFresh(state, nowMs);
  return false;
}

export function hasAnyActiveTurn(): boolean {
  return campaignsWithActiveTurn.size > 0;
}

export function setLastTurnSnapshot(
  campaignId: string,
  snapshot: TurnSnapshot,
  metadata?: {
    acceptedDurableEventIds?: readonly string[];
    producedDurableEventIds?: readonly string[];
    playerAction?: string | null;
    chatHistoryLengthBeforeTurn?: number | null;
    chatHistoryLengthAfterTurn?: number | null;
  },
): void {
  const normalizedMetadata = normalizeSnapshotMetadata(metadata);
  lastTurnSnapshots.set(campaignId, snapshot);
  lastTurnSnapshotMetadata.set(campaignId, normalizedMetadata);
  persistLastTurnManifest(campaignId, snapshot, normalizedMetadata);
}

export function getLastTurnSnapshot(
  campaignId: string,
): TurnSnapshot | undefined {
  hydrateLastTurnSnapshot(campaignId);
  return lastTurnSnapshots.get(campaignId);
}

export function getLastTurnSnapshotMetadata(
  campaignId: string,
): LastTurnSnapshotMetadata {
  hydrateLastTurnSnapshot(campaignId);
  return lastTurnSnapshotMetadata.get(campaignId) ?? EMPTY_LAST_TURN_SNAPSHOT_METADATA;
}

export function clearLastTurnSnapshot(campaignId: string): void {
  lastTurnSnapshots.delete(campaignId);
  lastTurnSnapshotMetadata.delete(campaignId);
  deleteLastTurnManifest(campaignId);
}

export function setPendingRollbackIntent(input: {
  campaignId: string;
  route: string;
  snapshot: TurnSnapshot;
  turnId?: string | null;
  eventIds: readonly string[];
}): void {
  const intent: PendingRollbackIntent = {
    version: 1,
    campaignId: input.campaignId,
    route: input.route,
    snapshot: input.snapshot,
    turnId: input.turnId ?? null,
    eventIds: uniqueStrings(input.eventIds),
    createdAt: Date.now(),
  };
  const filePath = pendingRollbackIntentPath(input.campaignId);
  writeUtf8FileAtomic(filePath, `${JSON.stringify(intent, null, 2)}\n`);
}

export function getPendingRollbackIntent(campaignId: string): PendingRollbackIntent | null {
  const filePath = pendingRollbackIntentPath(campaignId);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new Error(`Pending rollback intent for campaign ${campaignId} is unreadable or malformed.`);
  }
  const intent = parsePendingRollbackIntent(parsed, campaignId);
  if (!intent) {
    throw new Error(`Pending rollback intent for campaign ${campaignId} is malformed.`);
  }
  return intent;
}

export function clearPendingRollbackIntent(campaignId: string): void {
  fs.rmSync(pendingRollbackIntentPath(campaignId), { force: true });
}

export function hasLiveTurnSnapshot(campaignId: string): boolean {
  hydrateLastTurnSnapshot(campaignId);
  return lastTurnSnapshots.has(campaignId);
}

export function clearCampaignRuntimeState(campaignId: string): void {
  campaignsWithActiveTurn.delete(campaignId);
  activeTurnLeaseTokens.delete(campaignId);
  lastTurnSnapshots.delete(campaignId);
  lastTurnSnapshotMetadata.delete(campaignId);
  deleteLastTurnManifest(campaignId);
  clearPendingRollbackIntent(campaignId);
}
