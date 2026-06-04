import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { closeDb, connectDb, getDb } from "../backend/src/db/index.js";
import { runMigrations } from "../backend/src/db/migrate.js";
import {
  authorityTraces,
  campaigns,
  chronicle,
  locationRecentEvents,
  locations,
  players,
  simulationJobs,
  simulationProposals,
  worldThreadEvents,
  worldThreads,
} from "../backend/src/db/schema.js";
import {
  commitAuthorityTrace,
  ensureWorldClock,
  queueSimulationJob,
  readWorldClock,
} from "../backend/src/engine/living-world-authority.js";
import { calculateLivingWorldProposalMetrics } from "../backend/src/engine/living-world-metrics.js";
import {
  buildNarratorPacket,
  formatNarratorPacketForPrompt,
  type CanonicalTurnPacket,
} from "../backend/src/engine/narrator-packet.js";
import {
  buildPlayerFacingPacketFromNarratorPacket,
  formatPlayerFacingPacketForPrompt,
} from "../backend/src/engine/player-facing-packet.js";
import { buildSceneFrame } from "../backend/src/engine/scene-frame.js";
import { assembleAuthoritativeScene } from "../backend/src/engine/scene-assembly.js";
import { createSimulationProposal } from "../backend/src/engine/simulation-proposal.js";
import { resolveDueSimulationProposalsForScope } from "../backend/src/engine/simulation-proposal-watchdog.js";

type CheckStatus = "passed" | "failed";

interface CheckRecord {
  id: string;
  status: CheckStatus;
  detail: string;
  evidence?: Record<string, unknown>;
}

interface RunSummary {
  phase: 91;
  mode: string;
  runId: string;
  artifactDir: string;
  startedAt: string;
  finishedAt: string;
  status: CheckStatus;
  checks: CheckRecord[];
  notes: string[];
}

const MODE = (process.env.PHASE91_MODE ?? "deterministic").toLowerCase();
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const ARTIFACT_DIR = process.env.PHASE91_ARTIFACT_DIR
  ?? join("output", "playwright", "phase-91-proposal-backlog", RUN_ID);
const EVIDENCE_DIR =
  ".planning/phases/91-living-world-proposal-commit-and-surface-signal-pipeline/evidence/wave-5";
const CAMPAIGN_ID = "phase-91-proposal-backlog-route";
const PLAYER_ID = "phase-91-player";
const LOCATION_ID = "phase-91-market";
const COMMITTED_SURFACE_SIGNAL =
  "Couriers trade a source-backed rumor about sealed carts leaving at dawn.";
const PENDING_SENTINEL =
  "PENDING ROUTE PROPOSAL SENTINEL: a hidden patron gives the player a vault key.";
const INVALID_SENTINEL =
  "INVALID ROUTE PROPOSAL SENTINEL: the archive door is already unlocked.";

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function check(
  id: string,
  condition: boolean,
  detail: string,
  evidence?: Record<string, unknown>,
): CheckRecord {
  return {
    id,
    status: condition ? "passed" : "failed",
    detail,
    evidence,
  };
}

function seedCampaignConfig(): void {
  const campaignsRoot = join(ARTIFACT_DIR, "campaigns");
  const campaignDir = join(campaignsRoot, CAMPAIGN_ID);
  const timestamp = Date.now();
  mkdirSync(campaignDir, { recursive: true });
  process.env.GSD_CAMPAIGNS_ROOT = campaignsRoot;
  writeJson(join(campaignDir, "config.json"), {
    name: "Phase 91 Proposal Backlog Route",
    premise: "A deterministic ignored-world-time proof campaign.",
    generationComplete: true,
    currentTick: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function seedDb(): void {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Phase 91 Proposal Backlog Route",
    premise: "A deterministic ignored-world-time proof campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  getDb().insert(locations).values({
    id: LOCATION_ID,
    campaignId: CAMPAIGN_ID,
    name: "Proposal Market",
    description: "A market where offscreen proposal backlog can surface safely.",
    kind: "macro",
    parentLocationId: null,
    anchorLocationId: null,
    persistence: "persistent",
    expiresAtTick: null,
    archivedAtTick: null,
    tags: "[]",
    isStarting: true,
    connectedTo: "[]",
  }).run();
  getDb().insert(players).values({
    id: PLAYER_ID,
    campaignId: CAMPAIGN_ID,
    name: "Mira",
    race: "Human",
    gender: "",
    age: "",
    appearance: "",
    hp: 5,
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    equippedItems: "[]",
    currentLocationId: LOCATION_ID,
    currentSceneLocationId: null,
  }).run();
  ensureWorldClock({
    campaignId: CAMPAIGN_ID,
    currentTick: 0,
    worldTimeMinutes: 0,
  });
}

function createProposal(input: {
  proposalType: string;
  summary: string;
  priority: number;
  intendedTools: Array<{ name: string; args?: Record<string, unknown>; reason?: string }>;
  data: Record<string, unknown>;
}) {
  const clock = readWorldClock(CAMPAIGN_ID);
  const jobId = queueSimulationJob({
    campaignId: CAMPAIGN_ID,
    jobType: input.proposalType,
    baseWorldVersion: clock.worldVersion,
    scheduledWorldTimeMinutes: 180,
    priority: input.priority,
    sourceEntity: { type: "system", id: input.proposalType },
    payload: input.data,
  });
  const proposal = createSimulationProposal({
    campaignId: CAMPAIGN_ID,
    proposalType: input.proposalType,
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "system", id: input.proposalType },
    jobId,
    summary: input.summary,
    readSet: [`world_version:${clock.worldVersion}`],
    writeScopes: ["world:event", `location:${LOCATION_ID}:event`],
    dueAtWorldTimeMinutes: 180,
    priority: input.priority,
    intendedTools: input.intendedTools,
    provenance: { source: "phase-91-route", tick: 0 },
    data: input.data,
  });
  return { jobId, proposal };
}

function queueBacklogProposals(): void {
  createProposal({
    proposalType: "phase_91_committed_surface",
    summary: "Commit a source-backed offscreen rumor after ignored time.",
    priority: 10,
    intendedTools: [{
      name: "add_chronicle_entry",
      args: { text: "A sealed-cart rumor becomes part of the campaign chronicle." },
    }],
    data: {
      meaningfulOffscreenCommit: true,
      pendingSentinel: PENDING_SENTINEL,
      surfaceSignal: {
        policy: "rumor",
        summary: COMMITTED_SURFACE_SIGNAL,
        locationRef: LOCATION_ID,
        threadName: "Sealed-cart rumor",
        sourceEventIds: ["event-sealed-cart"],
        hiddenCauseTerms: ["hidden patron", "vault key"],
      },
    },
  });
  createProposal({
    proposalType: "phase_91_invalid_terminal",
    summary: INVALID_SENTINEL,
    priority: 5,
    intendedTools: [{
      name: "add_tag",
      args: { entityName: "Mira" },
      reason: "Invalid fixture intentionally omits entityType and tag.",
    }],
    data: {
      meaningfulOffscreenCommit: true,
      pendingSentinel: INVALID_SENTINEL,
      surfaceSignal: {
        policy: "none",
        noSurfaceReason: "Invalid proposal never commits player-discoverable state.",
      },
    },
  });
}

function advanceIgnoredWorldTime(): void {
  const clock = readWorldClock(CAMPAIGN_ID);
  commitAuthorityTrace({
    campaignId: CAMPAIGN_ID,
    operation: "phase91:ignored_world_time",
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "system", id: "ignored-world-time-route" },
    elapsedWorldTimeMinutes: 180,
    currentTick: 180,
    stateDeltaRefs: ["world_time:ignored_player_wait"],
    metadata: {
      ignoredActions: [
        "The player waits at the market instead of following hooks.",
        "The player rests through several in-world hours.",
        "The player checks only public local signals afterward.",
      ],
    },
  });
}

function canonicalPacket(): CanonicalTurnPacket {
  return {
    campaignId: CAMPAIGN_ID,
    tick: readWorldClock(CAMPAIGN_ID).currentTick,
    playerAction: "I wait and ignore the hooks for several hours.",
    oracleOutcome: null,
    narratorFacts: {
      anchorEventId: "anchor-ignore-hooks",
      eventIds: ["anchor-ignore-hooks"],
      responseIds: [],
      actionIds: [],
      toolResultRefs: [],
    },
    anchorEvent: {
      id: "anchor-ignore-hooks",
      actorId: PLAYER_ID,
      kind: "player_action",
      summary: "Mira waits and ignores the hooks for several hours.",
      perceivableByPlayer: true,
    },
    events: [
      {
        id: "anchor-ignore-hooks",
        actorId: PLAYER_ID,
        kind: "player_action",
        summary: "Mira waits and ignores the hooks for several hours.",
        perceivableByPlayer: true,
      },
    ],
    responses: [],
    effects: [],
    actionResults: [],
    guardrails: ["Narrate only committed source-backed world signals."],
    controlReturnReason: "Return control after the ignored-time signal check.",
  };
}

async function buildPacketProof() {
  const sceneAssembly = assembleAuthoritativeScene({
    campaignId: CAMPAIGN_ID,
    currentLocationId: LOCATION_ID,
    pendingEventTicks: [],
    toolCalls: [],
    playerLabel: "Mira",
  });
  const sceneFrame = await buildSceneFrame({
    campaignId: CAMPAIGN_ID,
    playerActorId: PLAYER_ID,
    currentLocationId: LOCATION_ID,
    playerAction: "I wait and ignore the hooks for several hours.",
    tick: readWorldClock(CAMPAIGN_ID).currentTick,
  });
  const narratorPacket = buildNarratorPacket({
    frame: sceneFrame,
    canonicalTurnPacket: canonicalPacket(),
    forbiddenPrivateTerms: ["hidden patron", "vault key"],
  });
  const playerPacket = buildPlayerFacingPacketFromNarratorPacket(narratorPacket);
  const formattedNarratorPacket = formatNarratorPacketForPrompt(narratorPacket);
  const formattedPlayerPacket = formatPlayerFacingPacketForPrompt(playerPacket);
  const visibleText = [
    ...sceneAssembly.recentContext.map((entry) => entry.summary),
    ...sceneAssembly.playerPerceivableConsequences,
    ...sceneFrame.recentEvents.map((event) => event.summary),
    ...narratorPacket.hintSignals,
    formattedNarratorPacket,
    ...playerPacket.hintSignals,
    formattedPlayerPacket,
  ].join("\n");
  return {
    sceneRecentContext: sceneAssembly.recentContext,
    sceneFrameRecentEvents: sceneFrame.recentEvents,
    narratorHintSignals: narratorPacket.hintSignals,
    narratorHintSignalSourceRefs: narratorPacket.hintSignalSourceRefs ?? [],
    playerHintSignals: playerPacket.hintSignals,
    playerSourceRefs: playerPacket.sourceRefs,
    formattedNarratorPacket,
    formattedPlayerPacket,
    visibleText,
    leaks: {
      pendingSentinel: visibleText.includes(PENDING_SENTINEL),
      invalidSentinel: visibleText.includes(INVALID_SENTINEL),
      hiddenCause: visibleText.includes("hidden patron") || visibleText.includes("vault key"),
    },
  };
}

function collectDbProof(packetProofBefore: unknown, packetProofAfter: unknown, watchdogResult: unknown) {
  const proposals = getDb().select().from(simulationProposals).all();
  const jobs = getDb().select().from(simulationJobs).all();
  const traces = getDb().select().from(authorityTraces).all();
  const threads = getDb().select().from(worldThreads).all();
  const threadEvents = getDb().select().from(worldThreadEvents).all();
  const locationEvents = getDb().select().from(locationRecentEvents).all();
  const chronicleRows = getDb().select().from(chronicle).all();
  const metrics = calculateLivingWorldProposalMetrics({ campaignId: CAMPAIGN_ID });
  return {
    campaignId: CAMPAIGN_ID,
    worldClock: readWorldClock(CAMPAIGN_ID),
    watchdogResult,
    proposals: proposals.map((row) => ({
      id: row.id,
      proposalType: row.proposalType,
      status: row.status,
      proposalDisposition: row.proposalDisposition,
      dispositionReason: row.dispositionReason,
      committedWorldVersion: row.committedWorldVersion,
      lifecycleMetadata: JSON.parse(row.lifecycleMetadata || "{}") as unknown,
    })),
    jobs: jobs.map((row) => ({
      id: row.id,
      jobType: row.jobType,
      status: row.status,
      resultWorldVersion: row.resultWorldVersion,
      canceledReason: row.canceledReason,
    })),
    counts: {
      proposals: proposals.length,
      committedProposals: proposals.filter((row) => row.status === "committed").length,
      terminalNonCommitProposals: proposals.filter((row) => row.status !== "pending" && row.status !== "committed").length,
      authorityTraces: traces.length,
      chronicleRows: chronicleRows.length,
      worldThreads: threads.length,
      worldThreadEvents: threadEvents.length,
      locationRecentEvents: locationEvents.length,
      surfaceSignals: threadEvents.filter((row) => row.eventType === "surface_signal").length,
    },
    surfaceSignals: threadEvents.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      surfaceRoute: row.surfaceRoute,
      locationId: row.locationId,
      summary: row.summary,
      sourceEventIds: JSON.parse(row.sourceEventIds || "[]") as unknown,
      sourceAuthorityTraceIds: JSON.parse(row.sourceAuthorityTraceIds || "[]") as unknown,
    })),
    locationRecentEvents: locationEvents.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      eventType: row.eventType,
      summary: row.summary,
      surfaceRoute: row.surfaceRoute,
      knowledgeRoute: row.knowledgeRoute,
      sourceEventId: row.sourceEventId,
    })),
    packetProofBefore,
    packetProofAfter,
    metrics,
  };
}

function routeChecks(dbProof: ReturnType<typeof collectDbProof>): CheckRecord[] {
  const committed = dbProof.counts.committedProposals;
  const terminalNonCommit = dbProof.counts.terminalNonCommitProposals;
  const packetAfter = dbProof.packetProofAfter as Awaited<ReturnType<typeof buildPacketProof>>;
  const packetBefore = dbProof.packetProofBefore as Awaited<ReturnType<typeof buildPacketProof>>;
  const metrics = dbProof.metrics.metrics;
  return [
    check("not-pending-only-backlog", committed > 0 && terminalNonCommit > 0, "Backlog resolved into committed and terminal non-commit states.", {
      committed,
      terminalNonCommit,
    }),
    check("committed-proposal-exists", committed >= 1, "At least one proposal committed."),
    check("terminal-noncommit-exists", terminalNonCommit >= 1, "At least one proposal reached a non-commit terminal disposition."),
    check("authority-traces-exist", dbProof.counts.authorityTraces >= 3, "Ignored time, tool execution, and surface thread work produced authority traces.", {
      authorityTraces: dbProof.counts.authorityTraces,
    }),
    check("world-thread-updates-exist", dbProof.counts.worldThreadEvents >= 1, "World thread events were written."),
    check("location-recent-events-exist", dbProof.counts.locationRecentEvents >= 1, "Location recent events were written."),
    check("surface-signal-exists", dbProof.counts.surfaceSignals >= 1, "At least one surface signal was written."),
    check("pending-sentinel-absent-before-commit", !packetBefore.leaks.pendingSentinel, "Pending proposal sentinel was absent from pre-commit packet proof sections."),
    check("invalid-sentinel-absent-after-watchdog", !packetAfter.leaks.invalidSentinel, "Rejected proposal sentinel was absent from post-watchdog packet proof sections."),
    check("hidden-cause-absent-after-watchdog", !packetAfter.leaks.hiddenCause, "Hidden cause terms stayed out of player-visible packet proof sections."),
    check("committed-signal-visible-after-watchdog", packetAfter.visibleText.includes(COMMITTED_SURFACE_SIGNAL), "Committed surface signal reached source-backed packet proof sections."),
    check("metrics-commit-ratio-nonzero", metrics.proposal_commit_ratio > 0, "Metrics show nonzero proposal commit ratio.", metrics),
    check("metrics-terminal-ratio-complete", metrics.proposal_terminal_state_ratio === 1, "Selected due proposals all reached terminal states.", metrics),
    check("metrics-surface-coverage-nonzero", metrics.surface_signal_coverage > 0, "Metrics show nonzero surface signal coverage.", metrics),
    check("metrics-stale-jobs-bounded", metrics.stale_job_count === 0, "No due queued/running stale jobs remain.", metrics),
  ];
}

function writeSummary(summary: RunSummary): void {
  writeJson(join(ARTIFACT_DIR, "summary.json"), summary);
  writeJson(join("output", "playwright", "phase-91-proposal-backlog", "summary.json"), summary);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  if (MODE !== "deterministic") {
    throw new Error(`Unknown PHASE91_MODE "${MODE}". Phase 91 route currently supports deterministic mode.`);
  }
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  seedCampaignConfig();
  connectDb(join(ARTIFACT_DIR, "state.db"));
  runMigrations();
  seedDb();
  queueBacklogProposals();
  const packetProofBefore = await buildPacketProof();
  advanceIgnoredWorldTime();
  const watchdogResult = await resolveDueSimulationProposalsForScope({
    campaignId: CAMPAIGN_ID,
    tick: 180,
    phase: "watchdog",
    playerLocationId: LOCATION_ID,
    limit: 8,
  });
  const packetProofAfter = await buildPacketProof();
  const dbProof = collectDbProof(packetProofBefore, packetProofAfter, watchdogResult);
  const checks = routeChecks(dbProof);
  const summary: RunSummary = {
    phase: 91,
    mode: MODE,
    runId: RUN_ID,
    artifactDir: ARTIFACT_DIR,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: checks.every((item) => item.status === "passed") ? "passed" : "failed",
    checks,
    notes: [
      "Deterministic route seeds a local SQLite campaign and does not claim subjective live play quality.",
      "Ignored in-world time is represented by a source-backed authority trace before the proposal watchdog runs.",
      "Packet proof sections are SceneAssembly, SceneFrame, NarratorPacket, and PlayerFacingPacket visible/formatted surfaces.",
    ],
  };
  writeJson(join(ARTIFACT_DIR, "db-proof.json"), dbProof);
  writeJson(join(ARTIFACT_DIR, "metrics.json"), dbProof.metrics);
  writeJson(join(EVIDENCE_DIR, "ignored-world-time-db-proof.json"), dbProof);
  writeSummary(summary);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== "passed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : null;
  writeJson(join(ARTIFACT_DIR, "error.json"), { message, stack });
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  closeDb();
});
