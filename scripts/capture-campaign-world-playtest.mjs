import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

function readArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Arguments must use --key value pairs.");
    }
    values.set(key.slice(2), value);
  }
  return values;
}

function required(values, key) {
  const value = values.get(key);
  if (!value) throw new Error(`Missing --${key}.`);
  return value;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function gitOutput(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const modelStages = ["world_frame", "world_cast", "world_connections"];
const buildStages = [...modelStages, "validation", "persistence"];
const structuredStrategies = new Set(["native_schema", "native_json", "tool_mode"]);

function requireEvidence(condition, message) {
  if (!condition) throw new Error(message);
}

function validateAcceptedEvidence(input) {
  const {
    campaignId,
    latestBuild,
    worldState,
    source,
    events,
    stageEvidence,
    integrityRows,
    foreignKeyRows,
  } = input;
  const world = worldState.world;
  requireEvidence(latestBuild.status === "completed", "Latest build is not completed.");
  requireEvidence(latestBuild.completed_at !== null, "Completed build has no completion timestamp.");
  requireEvidence(worldState.status === "accepted", "World state is not accepted.");
  requireEvidence(world?.status === "accepted", "Persisted world is not accepted.");
  requireEvidence(world?.campaignId === campaignId, "Accepted world belongs to another campaign.");
  requireEvidence(world?.acceptedAt !== null, "Accepted world has no acceptance timestamp.");
  requireEvidence(worldState.currentBuildId === latestBuild.id, "World state points to another build.");
  requireEvidence(worldState.lastEventSequence === events.length, "World state event cursor is incomplete.");
  requireEvidence(source.campaignId === campaignId, "Frozen source belongs to another campaign.");
  requireEvidence(source.sourceDigest === latestBuild.source_digest, "Frozen source digest does not match the build.");
  requireEvidence(world.sourceDigest === latestBuild.source_digest, "Accepted world source digest does not match the build.");

  requireEvidence(events.length > 0, "Build ledger is empty.");
  events.forEach((event, index) => {
    requireEvidence(event.sequence === index + 1, "Build event sequence is not contiguous.");
    requireEvidence(event.buildId === latestBuild.id, "Build event belongs to another build.");
  });
  for (const stage of buildStages) {
    requireEvidence(
      events.filter((event) => event.type === "stage_started" && event.stage === stage).length === 1,
      `Build ledger does not contain exactly one ${stage} start.`,
    );
    requireEvidence(
      events.filter((event) => event.type === "stage_completed" && event.stage === stage).length === 1,
      `Build ledger does not contain exactly one ${stage} completion.`,
    );
  }
  const terminalEvents = events.filter((event) => (
    event.type === "build_completed" || event.type === "build_failed"
  ));
  requireEvidence(terminalEvents.length === 1, "Build ledger requires exactly one terminal event.");
  requireEvidence(terminalEvents[0].type === "build_completed", "Build ledger terminal is not successful.");
  requireEvidence(events.at(-1) === terminalEvents[0], "Build terminal is not the final event.");
  requireEvidence(terminalEvents[0].worldVersion === world.version, "Build terminal version does not match the world.");
  requireEvidence(terminalEvents[0].contentHash === world.contentHash, "Build terminal hash does not match the world.");

  requireEvidence(stageEvidence.length === modelStages.length, "Model evidence stage count is incomplete.");
  for (const stage of modelStages) {
    const rows = stageEvidence.filter((entry) => entry.stage === stage);
    requireEvidence(rows.length === 1, `Model evidence requires exactly one ${stage} row.`);
    const evidence = rows[0];
    requireEvidence(evidence.requestedMode === "auto", `${stage} requested mode is not auto.`);
    requireEvidence(structuredStrategies.has(evidence.primaryStrategy), `${stage} primary strategy is not structured.`);
    requireEvidence(evidence.actualStrategy === evidence.primaryStrategy, `${stage} strategy changed during generation.`);
    requireEvidence(evidence.totalAttempts === 1, `${stage} did not use exactly one attempt.`);
    requireEvidence(!evidence.repairUsed, `${stage} used repair.`);
    requireEvidence(!evidence.retryUsed, `${stage} used retry.`);
    requireEvidence(!evidence.textFallbackUsed, `${stage} used text fallback.`);
    requireEvidence(evidence.errorCode === null, `${stage} recorded a model error.`);
  }

  requireEvidence(
    integrityRows.length === 1 && integrityRows[0].integrity_check === "ok",
    "SQLite integrity check failed.",
  );
  requireEvidence(foreignKeyRows.length === 0, "SQLite foreign-key check failed.");
  return world;
}

const argumentsMap = readArguments(process.argv.slice(2));
const campaignRoot = path.resolve(required(argumentsMap, "campaign-root"));
const campaignId = required(argumentsMap, "campaign-id");
const outputDirectory = path.resolve(required(argumentsMap, "output"));
const stateLabel = required(argumentsMap, "state-label");
const allowedStateLabels = new Set(["world-before-restart", "world-after-restart"]);
if (!allowedStateLabels.has(stateLabel)) {
  throw new Error("--state-label must be world-before-restart or world-after-restart.");
}

const databasePath = path.join(campaignRoot, campaignId, "state.db");
const database = new Database(databasePath, { readonly: true, fileMustExist: true });
const tableNames = [
  "campaign_worlds",
  "campaign_world_builds",
  "campaign_world_build_stages",
  "campaign_world_build_events",
  "locations",
  "location_edges",
  "actors",
  "actor_goals",
  "actor_relations",
  "actor_placements",
  "world_pressures",
  "world_pressure_actors",
  "world_pressure_locations",
];

try {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const latestBuild = database.prepare(`
    SELECT *
    FROM campaign_world_builds
    WHERE campaign_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).get(campaignId);
  if (!latestBuild) throw new Error("Campaign has no Campaign World build.");

  const worldResponse = await fetch(
    `http://localhost:3001/api/campaigns/${campaignId}/world/state`,
  );
  if (!worldResponse.ok) {
    throw new Error(`World state request failed with ${worldResponse.status}.`);
  }
  const worldState = await worldResponse.json();

  const source = JSON.parse(latestBuild.source_snapshot_json);

  const events = database.prepare(`
    SELECT sequence, build_id AS buildId, event_type AS eventType, stage,
           payload_json AS payloadJson, created_at AS createdAt
    FROM campaign_world_build_events
    WHERE build_id = ?
    ORDER BY sequence
  `).all(latestBuild.id).map((row) => ({
    sequence: row.sequence,
    buildId: row.buildId,
    type: row.eventType,
    ...(row.stage ? { stage: row.stage } : {}),
    ...JSON.parse(row.payloadJson),
    createdAt: row.createdAt,
  }));
  const stageEvidence = database.prepare(`
    SELECT stage, requested_mode AS requestedMode, primary_strategy AS primaryStrategy,
           actual_strategy AS actualStrategy, total_attempts AS totalAttempts,
           repair_used AS repairUsed, retry_used AS retryUsed,
           text_fallback_used AS textFallbackUsed, response_model AS responseModel,
           finish_reason AS finishReason, error_code AS errorCode,
           input_tokens AS inputTokens, output_tokens AS outputTokens,
           total_tokens AS totalTokens, created_at AS createdAt
    FROM campaign_world_build_stages
    WHERE build_id = ?
    ORDER BY created_at
  `).all(latestBuild.id).map((row) => ({
    ...row,
    repairUsed: row.repairUsed === 1,
    retryUsed: row.retryUsed === 1,
    textFallbackUsed: row.textFallbackUsed === 1,
  }));
  const integrityRows = database.prepare("PRAGMA integrity_check").all();
  const foreignKeyRows = database.prepare("PRAGMA foreign_key_check").all();
  const tableCounts = Object.fromEntries(tableNames.map((tableName) => {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM "${tableName}"`).get();
    return [tableName, row.count];
  }));
  const world = validateAcceptedEvidence({
    campaignId,
    latestBuild,
    worldState,
    source,
    events,
    stageEvidence,
    integrityRows,
    foreignKeyRows,
  });

  writeJson(path.join(outputDirectory, `${stateLabel}.json`), worldState);
  writeJson(path.join(outputDirectory, "source.json"), source);
  fs.writeFileSync(
    path.join(outputDirectory, "source-digest.txt"),
    `${latestBuild.source_digest}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputDirectory, "events.jsonl"),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    "utf8",
  );
  writeJson(path.join(outputDirectory, "model-contract-evidence.json"), stageEvidence);
  fs.writeFileSync(
    path.join(outputDirectory, "sqlite-integrity.txt"),
    [
      ...integrityRows.map((row) => String(row.integrity_check)),
      `foreign_key_violations: ${foreignKeyRows.length}`,
      "",
      ...Object.entries(tableCounts).map(([tableName, count]) => `${tableName}: ${count}`),
      "",
    ].join("\n"),
    "utf8",
  );

  const statusLines = gitOutput(["status", "--porcelain=v1"]);
  const manifest = {
    commit: gitOutput(["rev-parse", "HEAD"]),
    dirty: statusLines.length > 0,
    dirtyFiles: statusLines.length > 0 ? statusLines.split("\n") : [],
    campaignRoot,
    campaignId,
    buildId: latestBuild.id,
    providerId: latestBuild.provider_id,
    model: latestBuild.model,
    sourceDigest: latestBuild.source_digest,
    buildStatus: latestBuild.status,
    startedAt: new Date(latestBuild.started_at).toISOString(),
    completedAt: latestBuild.completed_at === null
      ? null
      : new Date(latestBuild.completed_at).toISOString(),
    capturedAt: new Date().toISOString(),
  };
  writeJson(path.join(outputDirectory, "manifest.json"), manifest);

  writeJson(path.join(outputDirectory, "acceptance-receipt.json"), {
    campaignId,
    worldVersion: world.version,
    contentHash: world.contentHash,
    acceptedAt: world.acceptedAt,
  });

  process.stdout.write(`${JSON.stringify({
    campaignId,
    buildId: latestBuild.id,
    buildStatus: latestBuild.status,
    stateLabel,
    tableCounts,
  })}\n`);
} finally {
  database.close();
}
