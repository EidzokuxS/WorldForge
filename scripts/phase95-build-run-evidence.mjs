import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function loadSqlite() {
  try {
    return require("better-sqlite3");
  } catch {
    return require(path.resolve("backend/node_modules/better-sqlite3"));
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value !== "string" || value.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(tableName),
  );
}

function safeCount(db, sql, params = []) {
  try {
    const row = db.prepare(sql).get(...params);
    return Number.isFinite(row?.count) ? row.count : 0;
  } catch {
    return 0;
  }
}

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function gitDirtyState() {
  try {
    const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
    return status.length === 0 ? "clean" : "dirty";
  } catch {
    return "unknown";
  }
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function resolveCampaignPath(root, state, provenance) {
  const candidate = state.cloneCampaignPath ?? provenance?.cloneCampaignPath;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return path.resolve(candidate);
  }
  if (typeof state.campaignId === "string" && state.campaignId.trim().length > 0) {
    return path.resolve("campaigns", state.campaignId);
  }
  throw new Error("Cannot resolve campaign path for run evidence.");
}

function rowsByKey(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const value = row?.[key];
    if (typeof value !== "string") continue;
    result.set(value, row);
  }
  return result;
}

function matchSagaForTurn(turn, index, sagas, usedSagaIds) {
  const action = typeof turn.action === "string" ? turn.action : null;
  if (action) {
    const exact = sagas.find((saga) => saga.action_text === action && !usedSagaIds.has(saga.id));
    if (exact) return exact;
  }
  const byOrder = sagas[index];
  if (byOrder && !usedSagaIds.has(byOrder.id)) return byOrder;
  return sagas.find((saga) => !usedSagaIds.has(saga.id)) ?? null;
}

function countRetryEvents(events) {
  return events.filter((event) => /retry/i.test(String(event.event_type ?? ""))).length;
}

function recoveryOutcome(saga, events) {
  const recoveryEvent = events.find((event) => /recover/i.test(String(event.event_type ?? "")));
  if (recoveryEvent) return "recovered";
  if (saga.status === "finalized") return "none";
  return saga.status_reason ? `${saga.status}:${saga.status_reason}` : String(saga.status ?? "unknown");
}

function terminalEventCount(saga, events) {
  const persisted = events.filter((event) => event.event_type === "settled_packet_persisted").length;
  return persisted + (saga.status === "finalized" ? 1 : 0);
}

function acceptedReceiptRefs(saga, packet) {
  const refs = [
    `turn-saga:${saga.id}`,
    packet?.id ? `settled-packet:${packet.id}` : null,
    ...parseJsonArray(packet?.accepted_tool_result_refs),
    ...parseJsonArray(packet?.accepted_actor_result_refs),
    ...parseJsonArray(packet?.accepted_durable_event_ids).map((id) => `durable-event:${id}`),
  ].filter((ref) => typeof ref === "string" && ref.trim().length > 0);
  return Array.from(new Set(refs));
}

async function countVectorRows(campaignPath, tableName) {
  const vectorsPath = path.join(campaignPath, "vectors");
  if (!fs.existsSync(vectorsPath)) return 0;
  try {
    const lancedb = await import("@lancedb/lancedb");
    const db = await lancedb.connect(vectorsPath);
    const names = await db.tableNames();
    if (!names.includes(tableName)) return 0;
    const table = await db.openTable(tableName);
    return await table.countRows();
  } catch {
    return 0;
  }
}

function queryRunRows(db, campaignId) {
  if (!tableExists(db, "turn_sagas")) throw new Error("state.db lacks turn_sagas.");
  if (!tableExists(db, "settled_turn_packets")) throw new Error("state.db lacks settled_turn_packets.");
  if (!tableExists(db, "turn_saga_events")) throw new Error("state.db lacks turn_saga_events.");

  const sagas = db.prepare(`
    select id, campaign_id, turn_id, action_text, status, status_reason,
      base_world_version, result_world_version, settled_turn_packet_id, created_at
    from turn_sagas
    where campaign_id = ?
    order by created_at asc
  `).all(campaignId);
  const packets = db.prepare(`
    select id, saga_id, turn_id, accepted_tool_result_refs, accepted_actor_result_refs,
      accepted_durable_event_ids, due_world_refs, base_world_version, result_world_version, created_at
    from settled_turn_packets
    where campaign_id = ?
    order by created_at asc
  `).all(campaignId);
  const events = db.prepare(`
    select id, saga_id, turn_id, event_type, payload_json, created_at
    from turn_saga_events
    where campaign_id = ?
    order by created_at asc
  `).all(campaignId);

  return {
    sagas,
    packetsBySaga: rowsByKey(packets, "saga_id"),
    eventsBySaga: events.reduce((map, event) => {
      const existing = map.get(event.saga_id) ?? [];
      existing.push(event);
      map.set(event.saga_id, existing);
      return map;
    }, new Map()),
  };
}

function actorBacklogCount(db, campaignId) {
  if (!tableExists(db, "actor_wake_signals")) return 0;
  return safeCount(
    db,
    "select count(*) as count from actor_wake_signals where campaign_id = ? and status = 'pending'",
    [campaignId],
  );
}

export async function buildRunEvidence(input) {
  const root = path.resolve(input.root);
  const state = readJson(path.join(root, "state.json"));
  const provenancePath = path.join(root, "clone-provenance.json");
  const provenance = fs.existsSync(provenancePath) ? readJson(provenancePath) : null;
  if (!isRecord(state) || typeof state.campaignId !== "string") {
    throw new Error("state.json must contain campaignId.");
  }
  const turns = Array.isArray(state.turns) ? state.turns : [];
  const campaignPath = resolveCampaignPath(root, state, provenance);
  const dbPath = input.dbPath ? path.resolve(input.dbPath) : path.join(campaignPath, "state.db");
  if (!fs.existsSync(dbPath)) throw new Error(`Campaign state.db not found: ${dbPath}`);

  const Database = loadSqlite();
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = queryRunRows(db, state.campaignId);
    const backlogCount = actorBacklogCount(db, state.campaignId);
    const vectorCounts = {
      episodicEvents: await countVectorRows(campaignPath, "episodic_events"),
      loreCards: await countVectorRows(campaignPath, "lore_cards"),
    };
    const usedSagaIds = new Set();
    const evidenceTurns = turns.map((turn, index) => {
      if (!isRecord(turn)) throw new Error(`state.turns[${index}] is not an object.`);
      const saga = matchSagaForTurn(turn, index, rows.sagas, usedSagaIds);
      if (!saga) throw new Error(`No turn_sagas row matches state turn ${index + 1}.`);
      usedSagaIds.add(saga.id);
      const packet = rows.packetsBySaga.get(saga.id);
      if (!packet) throw new Error(`No settled_turn_packets row matches state turn ${index + 1}.`);
      const events = rows.eventsBySaga.get(saga.id) ?? [];
      const dueWorldRefs = parseJsonArray(packet.due_world_refs);
      return {
        index: turn.index ?? index + 1,
        turnId: saga.turn_id,
        mode: turn.mode ?? null,
        before: turn.before ?? null,
        after: turn.after ?? null,
        done: turn.done ?? null,
        acceptedReceiptRefs: acceptedReceiptRefs(saga, packet),
        terminalEventCount: terminalEventCount(saga, events),
        retryCount: countRetryEvents(events),
        recoveryOutcome: recoveryOutcome(saga, events),
        dueWorldReasons: dueWorldRefs.length > 0 ? dueWorldRefs : ["none"],
        actorBacklogCount: backlogCount,
        vectorCounts,
      };
    });

    const manifestPath = provenance?.cloneCampaignPath
      ? path.join(provenance.cloneCampaignPath, "clone-manifest.json")
      : path.join(campaignPath, "clone-manifest.json");
    const evidence = {
      version: "phase95-run-evidence.v1",
      campaignId: state.campaignId,
      head: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
      dirtyState: gitDirtyState(),
      generatedAt: new Date().toISOString(),
      source: {
        root,
        campaignPath,
        dbPath,
      },
      cloneLineage: provenance
        ? {
          sourceCampaignId: provenance.sourceCampaignId,
          cloneCampaignId: provenance.cloneCampaignId,
          manifestDigest: fs.existsSync(manifestPath) ? sha256File(manifestPath) : "",
        }
        : undefined,
      turns: evidenceTurns,
    };
    const outputPath = path.resolve(input.outputPath ?? path.join(root, "run-evidence.json"));
    writeJson(outputPath, evidence);
    return { outputPath, evidence };
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) {
    console.error("Usage: node scripts/phase95-build-run-evidence.mjs <run-root>");
    process.exit(2);
  }
  buildRunEvidence({ root }).then(({ outputPath, evidence }) => {
    console.log(JSON.stringify({
      ok: true,
      outputPath,
      campaignId: evidence.campaignId,
      turnCount: evidence.turns.length,
      cloneLineage: Boolean(evidence.cloneLineage),
    }, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
