import { getSqliteConnection } from "../../db/index.js";
import {
  assertApiResponseProjectionV2,
  assertGameplayRuntimeReceiptLedgerV2,
  assertGmActionChecklistV2,
  assertNarratorViewV2,
  assertSettledPacketPersistenceV2,
  assertSettledTurnPacketV2,
  type ApiResponseProjectionV2,
  type GameplayRuntimeReceiptLedgerV2,
  type GmActionChecklistV2,
  type NarratorViewV2,
  type SettledPacketPersistenceV2,
  type SettledTurnPacketV2,
} from "./contracts.js";

const TABLE_NAME = "gameplay_cycle_v2_packets";

export interface PersistedGameplayCycleV2Packet {
  packetId: string;
  campaignId: string;
  turnId: string;
  status: SettledPacketPersistenceV2["status"];
  narratorAttemptStatus: SettledPacketPersistenceV2["narratorAttemptStatus"];
  packet: SettledTurnPacketV2;
  persistence: SettledPacketPersistenceV2;
  checklist: GmActionChecklistV2 | null;
  receiptLedger: GameplayRuntimeReceiptLedgerV2 | null;
  narratorView: NarratorViewV2 | null;
  apiProjection: ApiResponseProjectionV2 | null;
  baseWorldVersion: number;
  resultWorldVersion: number;
  createdAt: number;
  updatedAt: number;
}

function now(): number {
  return Date.now();
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parseJsonObject<T>(value: string, fallback: T): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function ensureColumn(tableName: string, columnName: string, definition: string): void {
  const db = getSqliteConnection();
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name?: unknown;
  }>;
  if (rows.some((row) => row.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export function ensureGameplayCycleV2PacketStore(): void {
  const db = getSqliteConnection();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      packet_id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      status TEXT NOT NULL,
      narrator_attempt_status TEXT NOT NULL,
      packet_json TEXT NOT NULL,
      persistence_json TEXT NOT NULL,
      checklist_json TEXT,
      receipt_ledger_json TEXT,
      narrator_view_json TEXT,
      api_projection_json TEXT,
      base_world_version INTEGER NOT NULL,
      result_world_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gameplay_cycle_v2_packets_campaign_turn
      ON ${TABLE_NAME} (campaign_id, turn_id);
    CREATE INDEX IF NOT EXISTS idx_gameplay_cycle_v2_packets_status
      ON ${TABLE_NAME} (campaign_id, status, narrator_attempt_status);
  `);
  ensureColumn(TABLE_NAME, "checklist_json", "TEXT");
  ensureColumn(TABLE_NAME, "receipt_ledger_json", "TEXT");
}

export function persistSettledTurnPacketV2(input: {
  packet: SettledTurnPacketV2;
  persistence: SettledPacketPersistenceV2;
  checklist?: GmActionChecklistV2 | null;
  receiptLedger?: GameplayRuntimeReceiptLedgerV2 | null;
  narratorView?: NarratorViewV2 | null;
}): PersistedGameplayCycleV2Packet {
  ensureGameplayCycleV2PacketStore();
  const packet = assertSettledTurnPacketV2(input.packet);
  const persistence = assertSettledPacketPersistenceV2(input.persistence);
  const existing = readGameplayCycleV2Packet(packet.packetId);
  const checklist = input.checklist !== undefined
    ? input.checklist
      ? assertGmActionChecklistV2(input.checklist)
      : null
    : existing?.checklist ?? null;
  const receiptLedger = input.receiptLedger !== undefined
    ? input.receiptLedger
      ? assertGameplayRuntimeReceiptLedgerV2(input.receiptLedger)
      : null
    : existing?.receiptLedger ?? null;
  const narratorView = input.narratorView
    ? assertNarratorViewV2(input.narratorView)
    : null;
  if (
    persistence.packetId !== packet.packetId
    || persistence.campaignId !== packet.campaignId
    || persistence.turnId !== packet.turnId
  ) {
    throw new Error("gameplay-cycle-v2 packet persistence key does not match settled packet.");
  }
  if (narratorView && narratorView.packetId !== packet.packetId) {
    throw new Error("gameplay-cycle-v2 narrator view packetId does not match settled packet.");
  }
  if (
    checklist
    && (
      checklist.campaignId !== packet.campaignId
      || checklist.turnId !== packet.turnId
      || checklist.baseWorldVersion !== packet.baseWorldVersion
    )
  ) {
    throw new Error("gameplay-cycle-v2 checklist audit does not match settled packet turn.");
  }
  if (
    receiptLedger
    && (
      receiptLedger.campaignId !== packet.campaignId
      || receiptLedger.turnId !== packet.turnId
      || receiptLedger.baseWorldVersion !== packet.baseWorldVersion
    )
  ) {
    throw new Error("gameplay-cycle-v2 receipt ledger audit does not match settled packet turn.");
  }
  const timestamp = now();
  getSqliteConnection()
    .prepare(`
      INSERT INTO ${TABLE_NAME} (
        packet_id,
        campaign_id,
        turn_id,
        status,
        narrator_attempt_status,
        packet_json,
        persistence_json,
        checklist_json,
        receipt_ledger_json,
        narrator_view_json,
        api_projection_json,
        base_world_version,
        result_world_version,
        created_at,
        updated_at
      ) VALUES (
        @packetId,
        @campaignId,
        @turnId,
        @status,
        @narratorAttemptStatus,
        @packetJson,
        @persistenceJson,
        @checklistJson,
        @receiptLedgerJson,
        @narratorViewJson,
        NULL,
        @baseWorldVersion,
        @resultWorldVersion,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(packet_id) DO UPDATE SET
        status = excluded.status,
        narrator_attempt_status = excluded.narrator_attempt_status,
        packet_json = excluded.packet_json,
        persistence_json = excluded.persistence_json,
        checklist_json = excluded.checklist_json,
        receipt_ledger_json = excluded.receipt_ledger_json,
        narrator_view_json = excluded.narrator_view_json,
        base_world_version = excluded.base_world_version,
        result_world_version = excluded.result_world_version,
        updated_at = excluded.updated_at
    `)
    .run({
      packetId: packet.packetId,
      campaignId: packet.campaignId,
      turnId: packet.turnId,
      status: persistence.status,
      narratorAttemptStatus: persistence.narratorAttemptStatus,
      packetJson: stringifyJson(packet),
      persistenceJson: stringifyJson(persistence),
      checklistJson: checklist ? stringifyJson(checklist) : null,
      receiptLedgerJson: receiptLedger ? stringifyJson(receiptLedger) : null,
      narratorViewJson: narratorView ? stringifyJson(narratorView) : null,
      baseWorldVersion: packet.baseWorldVersion,
      resultWorldVersion: packet.resultWorldVersion,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  return readGameplayCycleV2Packet(packet.packetId)!;
}

export function markGameplayCycleV2PacketNarratorRendering(
  packetId: string,
): PersistedGameplayCycleV2Packet {
  const persisted = readGameplayCycleV2Packet(packetId);
  if (!persisted) {
    throw new Error(`gameplay-cycle-v2 packet not found: ${packetId}`);
  }
  return persistSettledTurnPacketV2({
    packet: persisted.packet,
    persistence: assertSettledPacketPersistenceV2({
      ...persisted.persistence,
      status: "narrator_rendering",
      narratorAttemptStatus: "started",
    }),
    checklist: persisted.checklist,
    receiptLedger: persisted.receiptLedger,
    narratorView: persisted.narratorView,
  });
}

export function markGameplayCycleV2PacketNarratorFailedPendingRetry(
  packetId: string,
): PersistedGameplayCycleV2Packet {
  const persisted = readGameplayCycleV2Packet(packetId);
  if (!persisted) {
    throw new Error(`gameplay-cycle-v2 packet not found: ${packetId}`);
  }
  return persistSettledTurnPacketV2({
    packet: persisted.packet,
    persistence: assertSettledPacketPersistenceV2({
      ...persisted.persistence,
      status: "resolved_pending_narration",
      narratorAttemptStatus: "failed_pending_retry",
    }),
    checklist: persisted.checklist,
    receiptLedger: persisted.receiptLedger,
    narratorView: persisted.narratorView,
  });
}

export function finalizeGameplayCycleV2Packet(input: {
  packetId: string;
  apiProjection: ApiResponseProjectionV2;
}): PersistedGameplayCycleV2Packet {
  const projection = assertApiResponseProjectionV2(input.apiProjection);
  if (projection.packetId !== input.packetId) {
    throw new Error("gameplay-cycle-v2 API projection packetId does not match stored packet.");
  }
  const persisted = readGameplayCycleV2Packet(input.packetId);
  if (!persisted) {
    throw new Error(`gameplay-cycle-v2 packet not found: ${input.packetId}`);
  }
  const persistence = assertSettledPacketPersistenceV2({
    ...persisted.persistence,
    status: "finalized",
    narratorAttemptStatus: "succeeded_projected",
  });
  const timestamp = now();
  getSqliteConnection()
    .prepare(`
      UPDATE ${TABLE_NAME}
      SET status = @status,
          narrator_attempt_status = @narratorAttemptStatus,
          persistence_json = @persistenceJson,
          api_projection_json = @apiProjectionJson,
          updated_at = @updatedAt
      WHERE packet_id = @packetId
    `)
    .run({
      packetId: input.packetId,
      status: persistence.status,
      narratorAttemptStatus: persistence.narratorAttemptStatus,
      persistenceJson: stringifyJson(persistence),
      apiProjectionJson: stringifyJson(projection),
      updatedAt: timestamp,
    });
  return readGameplayCycleV2Packet(input.packetId)!;
}

export function readGameplayCycleV2Packet(
  packetId: string,
): PersistedGameplayCycleV2Packet | null {
  ensureGameplayCycleV2PacketStore();
  const row = getSqliteConnection()
    .prepare(`
      SELECT
        packet_id AS packetId,
        campaign_id AS campaignId,
        turn_id AS turnId,
        status,
        narrator_attempt_status AS narratorAttemptStatus,
        packet_json AS packetJson,
        persistence_json AS persistenceJson,
        checklist_json AS checklistJson,
        receipt_ledger_json AS receiptLedgerJson,
        narrator_view_json AS narratorViewJson,
        api_projection_json AS apiProjectionJson,
        base_world_version AS baseWorldVersion,
        result_world_version AS resultWorldVersion,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM ${TABLE_NAME}
      WHERE packet_id = ?
    `)
    .get(packetId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const packet = assertSettledTurnPacketV2(parseJsonObject(row.packetJson as string, {}));
  const persistence = assertSettledPacketPersistenceV2(
    parseJsonObject(row.persistenceJson as string, {}),
  );
  const checklist = typeof row.checklistJson === "string"
    ? assertGmActionChecklistV2(parseJsonObject(row.checklistJson, {}))
    : null;
  const receiptLedger = typeof row.receiptLedgerJson === "string"
    ? assertGameplayRuntimeReceiptLedgerV2(parseJsonObject(row.receiptLedgerJson, {}))
    : null;
  const narratorView = typeof row.narratorViewJson === "string"
    ? assertNarratorViewV2(parseJsonObject(row.narratorViewJson, {}))
    : null;
  const apiProjection = typeof row.apiProjectionJson === "string"
    ? assertApiResponseProjectionV2(parseJsonObject(row.apiProjectionJson, {}))
    : null;
  return {
    packetId: row.packetId as string,
    campaignId: row.campaignId as string,
    turnId: row.turnId as string,
    status: row.status as PersistedGameplayCycleV2Packet["status"],
    narratorAttemptStatus:
      row.narratorAttemptStatus as PersistedGameplayCycleV2Packet["narratorAttemptStatus"],
    packet,
    persistence,
    checklist,
    receiptLedger,
    narratorView,
    apiProjection,
    baseWorldVersion: row.baseWorldVersion as number,
    resultWorldVersion: row.resultWorldVersion as number,
    createdAt: row.createdAt as number,
    updatedAt: row.updatedAt as number,
  };
}

export function findLatestGameplayCycleV2PendingNarrationPacket(
  campaignId: string,
): PersistedGameplayCycleV2Packet | null {
  ensureGameplayCycleV2PacketStore();
  const row = getSqliteConnection()
    .prepare(`
      SELECT
        packet_id AS packetId
      FROM ${TABLE_NAME}
      WHERE campaign_id = ?
        AND status = 'resolved_pending_narration'
        AND narrator_attempt_status = 'failed_pending_retry'
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `)
    .get(campaignId) as { packetId?: string } | undefined;
  if (!row?.packetId) return null;
  return readGameplayCycleV2Packet(row.packetId);
}
