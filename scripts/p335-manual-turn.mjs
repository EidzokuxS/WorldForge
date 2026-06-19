import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

function loadSqlite() {
  try {
    return require("better-sqlite3");
  } catch {
    return require(path.resolve(ROOT, "backend/node_modules/better-sqlite3"));
  }
}

const Database = loadSqlite();

const LEGACY_TABLES = [
  "gameplay_cycle_v2_packets",
  "turn_sagas",
  "settled_turn_packets",
  "narrator_attempts",
  "oracle_decisions",
  "simulation_jobs",
  "simulation_proposals",
];

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry.startsWith("--")) {
      const key = entry.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        result[key] = true;
      } else {
        result[key] = next;
        index += 1;
      }
    } else {
      result._.push(entry);
    }
  }
  return result;
}

function usage() {
  return [
    "Usage:",
    "  node --import ./backend/node_modules/tsx/dist/esm/index.mjs scripts/p335-manual-turn.mjs init --root <dir> --base-url <url> --source <campaignId> [--campaign <cloneId>] [--lane lane-a]",
    "  node scripts/p335-manual-turn.mjs turn --root <dir> --base-url <url> --action <text> [--note <manual decision note>]",
    "",
    "This recorder never chooses gameplay actions. The caller must provide --action for every turn.",
  ].join("\n");
}

function stamp() {
  return new Date()
    .toISOString()
    .slice(0, 19)
    .replaceAll(":", "")
    .replaceAll("-", "")
    .replaceAll("T", "-");
}

function trimTrailingSlash(value) {
  let result = String(value);
  while (result.endsWith("/") || result.endsWith("\\")) result = result.slice(0, -1);
  return result;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function appendLine(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${value}\n`, "utf8");
}

function parseSse(raw) {
  const blocks = raw.replaceAll("\r\n", "\n").split("\n\n").filter((entry) => entry.trim().length > 0);
  return blocks.flatMap((block) => {
    let type = "message";
    const data = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) type = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length === 0) return [];
    const text = data.join("\n");
    try {
      return [{ type, data: JSON.parse(text) }];
    } catch {
      return [{ type, data: text }];
    }
  });
}

async function apiJson(baseUrl, route, options = {}) {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}${route}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text.trim().length > 0 ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${route} failed: ${response.status} ${text.slice(0, 500)}`);
  }
  return body;
}

async function apiSse(baseUrl, route, body) {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  return { ok: response.ok, status: response.status, raw, events: parseSse(raw) };
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(tableName));
}

function tableCount(db, tableName, campaignId = null) {
  if (!tableExists(db, tableName)) return 0;
  const row = campaignId
    ? db.prepare(`select count(*) as count from ${tableName} where campaign_id = ?`).get(campaignId)
    : db.prepare(`select count(*) as count from ${tableName}`).get();
  return Number(row?.count ?? 0);
}

function safeRows(db, sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch {
    return [];
  }
}

function safeGet(db, sql, params = []) {
  try {
    return db.prepare(sql).get(...params) ?? null;
  } catch {
    return null;
  }
}

function cleanTurnRecord(db, campaignId, recordId) {
  const row = safeGet(
    db,
    "select record_json as recordJson from clean_gameplay_turn_records where campaign_id = ? and record_id = ? limit 1",
    [campaignId, recordId],
  ) ?? safeGet(
    db,
    "select record_json as recordJson from clean_gameplay_turn_records where campaign_id = ? order by created_at desc limit 1",
    [campaignId],
  );
  if (!row?.recordJson) return null;
  try {
    return JSON.parse(row.recordJson);
  } catch {
    return null;
  }
}

function queryDbSnapshot(campaignId, done) {
  const dbPath = path.join(ROOT, "campaigns", campaignId, "state.db");
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const record = cleanTurnRecord(db, campaignId, done?.recordId);
    const internalTurnId = record?.internalTurnId ?? null;
    const receipts = internalTurnId
      ? safeRows(
        db,
        `select receipt_id as receiptId, capability_id as capabilityId, status,
          base_world_version as baseWorldVersion, result_world_version as resultWorldVersion,
          mutation_applied as mutationApplied, receipt_json as receiptJson
        from clean_gameplay_stage4_receipts
        where campaign_id = ? and turn_id = ?
        order by created_at asc`,
        [campaignId, internalTurnId],
      ).map((row) => ({
        ...row,
        receiptJson: row.receiptJson ? JSON.parse(row.receiptJson) : null,
      }))
      : [];
    return {
      dbPath,
      counts: {
        cleanGameplayTurnRecords: tableCount(db, "clean_gameplay_turn_records", campaignId),
        cleanGameplayStage4Receipts: tableCount(db, "clean_gameplay_stage4_receipts", campaignId),
        restoreLedgerCount: tableExists(db, "turn_clock_ledger")
          ? Number(safeGet(
            db,
            "select count(*) as count from turn_clock_ledger where campaign_id = ? and reason_kind = 'replay_restore'",
            [campaignId],
          )?.count ?? 0)
          : 0,
        oldStoreCounts: Object.fromEntries(LEGACY_TABLES.map((table) => [table, tableCount(db, table, campaignId)])),
      },
      player: safeGet(
        db,
        "select id, name, current_location_id as currentLocationId, current_scene_location_id as currentSceneLocationId, hp from players where campaign_id = ? limit 1",
        [campaignId],
      ),
      items: safeRows(
        db,
        "select id, name, owner_id as ownerId, location_id as locationId, equip_state as equipState from items where campaign_id = ? order by name asc limit 80",
        [campaignId],
      ),
      record,
      receipts,
    };
  } finally {
    db.close();
  }
}

function locationByHandle(world, handle) {
  return (world?.locations ?? []).find((location) =>
    location.placeHandle === handle || location.id === handle || location.toPlaceHandle === handle
  ) ?? null;
}

function currentLocation(world) {
  return locationByHandle(world, world?.state?.currentSceneHandle)
    ?? locationByHandle(world, world?.state?.currentPlaceHandle)
    ?? null;
}

function carriedItems(world) {
  const playerHandle = world?.player?.actorHandle ?? world?.player?.id ?? null;
  const inventory = [
    ...(world?.player?.inventory ?? []),
    ...(world?.player?.equipment ?? []),
  ].map((item) => item.name).filter(Boolean);
  const fromItems = (world?.items ?? [])
    .filter((item) => playerHandle && (item.ownerActorHandle === playerHandle || item.ownerId === playerHandle))
    .map((item) => item.name)
    .filter(Boolean);
  return [...new Set([...inventory, ...fromItems])];
}

function visibleActors(world) {
  const handles = new Set([
    ...(world?.currentScene?.clearActorHandles ?? []),
    ...(world?.currentScene?.actorHandles ?? []),
  ]);
  return (world?.npcs ?? [])
    .filter((npc) => handles.has(npc.actorHandle) || handles.has(npc.id))
    .map((npc) => npc.name)
    .filter(Boolean);
}

function routeOptions(world) {
  return (currentLocation(world)?.connectedPaths ?? [])
    .map((route) => ({
      name: route.toLocationName,
      travelCost: route.travelCost ?? null,
    }))
    .filter((route) => route.name);
}

function observedSummary(world, history = null) {
  const messages = Array.isArray(history?.messages) ? history.messages : [];
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? null;
  return {
    currentScene: world?.currentScene?.name ?? currentLocation(world)?.name ?? null,
    worldVersion: world?.state?.worldVersion ?? world?.worldVersion ?? null,
    worldTimeMinutes: world?.state?.worldTimeMinutes ?? world?.worldTimeMinutes ?? null,
    tick: world?.state?.tick ?? world?.state?.currentTick ?? world?.currentTick ?? null,
    routes: routeOptions(world),
    carriedItems: carriedItems(world),
    visibleActors: visibleActors(world),
    lastAssistant,
  };
}

function turnBoundary(world) {
  return {
    tick: world?.state?.tick ?? world?.state?.currentTick ?? world?.currentTick ?? null,
    worldVersion: world?.state?.worldVersion ?? world?.worldVersion ?? null,
    worldTimeMinutes: world?.state?.worldTimeMinutes ?? world?.worldTimeMinutes ?? null,
    currentScene: world?.currentScene?.name ?? null,
    currentPlaceHandle: world?.state?.currentPlaceHandle ?? null,
    currentSceneHandle: world?.state?.currentSceneHandle ?? null,
  };
}

function structuralIssues(turn, dbSnapshot) {
  const issues = [];
  if (!turn.responseOk) issues.push({ severity: "hard", code: "response-not-ok", message: `HTTP status ${turn.statusCode}` });
  if (turn.done?.runtime !== "gameplay-cycle-runtime") issues.push({ severity: "hard", code: "runtime-mismatch", message: "done.runtime is not gameplay-cycle-runtime" });
  if (turn.done?.settled !== true) issues.push({ severity: "hard", code: "turn-not-settled", message: "done.settled is not true" });
  if (String(turn.narrativeText ?? "").trim().length === 0) issues.push({ severity: "hard", code: "empty-narration", message: "Narration is empty" });
  const oldEntries = Object.entries(dbSnapshot.counts.oldStoreCounts).filter(([, count]) => count !== 0);
  if (oldEntries.length > 0) {
    issues.push({ severity: "hard", code: "old-store-write", message: "Legacy/v2 store count is nonzero", detail: Object.fromEntries(oldEntries) });
  }
  if (dbSnapshot.counts.restoreLedgerCount !== 0) {
    issues.push({ severity: "hard", code: "restore-ledger-write", message: "Replay/restore ledger count is nonzero", detail: dbSnapshot.counts.restoreLedgerCount });
  }
  if (!dbSnapshot.record) issues.push({ severity: "hard", code: "missing-clean-record", message: "No clean turn record found" });
  return issues;
}

async function commandInit(args) {
  const root = path.resolve(args.root ?? path.join(ROOT, "output", `clean-runtime-p335-manual-${stamp()}`));
  const baseUrl = args["base-url"] ?? process.env.P335_BACKEND_URL ?? process.env.WORLDFORGE_API_BASE ?? process.env.BACKEND_URL;
  const sourceCampaignId = args.source ?? process.env.P335_SOURCE_CAMPAIGN;
  const laneName = args.lane ?? "lane-a";
  const campaignId = args.campaign ?? `clean-runtime-p335-manual-${stamp()}-${laneName}`;
  if (!baseUrl || !sourceCampaignId) throw new Error(`${usage()}\n\ninit requires --base-url and --source.`);

  fs.mkdirSync(root, { recursive: true });
  const { cloneCampaignCleanStart } = await import(pathToFileURL(path.join(ROOT, "backend", "src", "campaign", "clone.ts")).href);
  const cloneResult = await cloneCampaignCleanStart({
    sourceCampaignId,
    targetCampaignId: campaignId,
    nameSuffix: `[P335 manual ${laneName}]`,
    now: Date.now(),
  });
  writeJson(path.join(root, "clone-result.json"), cloneResult);
  writeJson(path.join(root, "clone-provenance.json"), {
    setupMode: "direct-clean-start-clone",
    sourceCampaignId,
    cloneCampaignId: campaignId,
    sourceCampaignPath: cloneResult.sourceDir,
    cloneCampaignPath: cloneResult.targetDir,
    cloneManifestPath: cloneResult.cloneManifestPath,
    createdAt: new Date().toISOString(),
  });

  const load = await apiJson(baseUrl, `/api/campaigns/${encodeURIComponent(campaignId)}/load`, { method: "POST" });
  const world = await apiJson(baseUrl, `/api/campaigns/${encodeURIComponent(campaignId)}/world`);
  let history = null;
  try {
    history = await apiJson(baseUrl, `/api/chat/history?campaignId=${encodeURIComponent(campaignId)}`);
  } catch {
    history = null;
  }
  const state = {
    version: "p335-manual-play-state.v1",
    startedAt: new Date().toISOString(),
    setupMode: "direct-clean-start-clone",
    baseUrl,
    sourceCampaignId,
    campaignId,
    campaignName: load?.name ?? world?.campaign?.name ?? null,
    laneName,
    turns: [],
  };
  writeJson(path.join(root, "state.json"), state);
  writeJson(path.join(root, "load-result.json"), load);
  writeJson(path.join(root, "world-after-clone-load.json"), world);
  if (history) writeJson(path.join(root, "history-after-clone-load.json"), history);
  fs.writeFileSync(
    path.join(root, "transcript.md"),
    [
      "# P335 Manual Clean Runtime Lane",
      "",
      `Lane: ${laneName}`,
      `Source campaign: ${sourceCampaignId}`,
      `Clone campaign: ${campaignId}`,
      "",
      "Acceptance rule: each action is chosen manually after reading the current observed state.",
      "",
    ].join("\n"),
    "utf8",
  );
  console.log(JSON.stringify({ ok: true, root, campaignId, observed: observedSummary(world, history) }, null, 2));
}

async function commandTurn(args) {
  const action = String(args.action ?? "").trim();
  const note = String(args.note ?? "").trim();
  if (typeof args.root !== "string" || args.root.trim().length === 0 || !action) {
    throw new Error(`${usage()}\n\nturn requires --root and --action.`);
  }
  const root = path.resolve(args.root);
  const statePath = path.join(root, "state.json");
  const state = readJson(statePath);
  const baseUrl = args["base-url"] ?? state.baseUrl ?? process.env.P335_BACKEND_URL ?? process.env.WORLDFORGE_API_BASE ?? process.env.BACKEND_URL;
  const campaignId = state.campaignId;
  if (!baseUrl || !campaignId) throw new Error("state.json must provide baseUrl/campaignId, or pass --base-url.");

  const turnIndex = state.turns.length + 1;
  const turnDir = path.join(root, `turn-${String(turnIndex).padStart(3, "0")}`);
  fs.mkdirSync(turnDir, { recursive: true });

  const beforeWorld = await apiJson(baseUrl, `/api/campaigns/${encodeURIComponent(campaignId)}/world`);
  const beforeHistory = await apiJson(baseUrl, `/api/chat/history?campaignId=${encodeURIComponent(campaignId)}`);
  const manualChoice = {
    chosenBy: "codex-manual",
    action,
    note,
    observedBefore: observedSummary(beforeWorld, beforeHistory),
  };
  writeJson(path.join(turnDir, "manual-choice.json"), manualChoice);
  writeJson(path.join(turnDir, "world-before.json"), beforeWorld);
  writeJson(path.join(turnDir, "history-before.json"), beforeHistory);

  const request = { intent: action, method: "", campaignId, playerAction: action };
  writeJson(path.join(turnDir, "request.json"), request);
  const response = await apiSse(baseUrl, "/api/chat/action", request);
  fs.writeFileSync(path.join(turnDir, "events.raw.txt"), response.raw, "utf8");
  writeJson(path.join(turnDir, "events.json"), response.events);

  const narrativeText = response.events.find((event) => event.type === "narrative")?.data?.text ?? "";
  const done = response.events.find((event) => event.type === "done")?.data ?? null;
  const afterWorld = await apiJson(baseUrl, `/api/campaigns/${encodeURIComponent(campaignId)}/world`);
  const afterHistory = await apiJson(baseUrl, `/api/chat/history?campaignId=${encodeURIComponent(campaignId)}`);
  writeJson(path.join(turnDir, "world-after.json"), afterWorld);
  writeJson(path.join(turnDir, "history-after.json"), afterHistory);

  const dbSnapshot = queryDbSnapshot(campaignId, done);
  writeJson(path.join(turnDir, "db-snapshot.json"), dbSnapshot);
  if (dbSnapshot.record) writeJson(path.join(turnDir, "record.json"), dbSnapshot.record);

  const turn = {
    index: turnIndex,
    action,
    manualNote: note,
    responseOk: response.ok,
    statusCode: response.status,
    before: turnBoundary(beforeWorld),
    after: turnBoundary(afterWorld),
    done,
    eventTypes: response.events.map((event) => event.type),
    narrativeText,
    observedAfter: observedSummary(afterWorld, afterHistory),
    db: {
      counts: dbSnapshot.counts,
      receiptCaps: dbSnapshot.receipts.map((receipt) => ({
        receiptId: receipt.receiptId,
        capabilityId: receipt.capabilityId,
        status: receipt.status,
        mutationApplied: receipt.mutationApplied,
        baseWorldVersion: receipt.baseWorldVersion,
        resultWorldVersion: receipt.resultWorldVersion,
      })),
    },
  };
  turn.structuralIssues = structuralIssues(turn, dbSnapshot);
  turn.status = turn.structuralIssues.some((issue) => issue.severity === "hard") ? "failed" : "done";
  writeJson(path.join(turnDir, "result.json"), turn);

  state.turns.push({
    index: turn.index,
    status: turn.status,
    action: turn.action,
    manualNote: turn.manualNote,
    before: turn.before,
    after: turn.after,
    done: turn.done,
    structuralIssueCount: turn.structuralIssues.length,
    narrativeText: turn.narrativeText,
  });
  writeJson(statePath, state);
  appendLine(
    path.join(root, "transcript.md"),
    [
      `## Turn ${turnIndex}`,
      "",
      `Manual note: ${note || "chosen after inspecting observed state"}`,
      "",
      `Player: ${action}`,
      "",
      `Narrator: ${narrativeText}`,
      "",
    ].join("\n"),
  );

  console.log(JSON.stringify({
    ok: turn.status === "done",
    root,
    turn: turnIndex,
    campaignId,
    structuralIssues: turn.structuralIssues,
    narrativeText,
    observedAfter: turn.observedAfter,
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (command === "init") return commandInit(args);
  if (command === "turn") return commandTurn(args);
  throw new Error(usage());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
