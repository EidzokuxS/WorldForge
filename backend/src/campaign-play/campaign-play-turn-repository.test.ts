import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../db/index.js";
import { openCampaignWorldDatabase } from "../campaign-world/world-database.js";
import { createCampaignWorldRepository } from "../campaign-world/world-repository.js";
import {
  advanceBuildToPersistence,
  candidateFixture,
  createMigratedCampaign,
  sourceFixture,
} from "../campaign-world/world-repository.test-support.js";
import { calculateCampaignWorldContentHash } from "../campaign-world/world-snapshot.js";
import { openCampaignPlayDatabase, type CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import { createCampaignPlayReadModel } from "./campaign-play-read-model.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";
import {
  CampaignPlayTurnRepositoryError,
  createCampaignPlayTurnRepository,
  hashCampaignPlayNarratorPacket,
  type AdmitCampaignPlayTurnInput,
  type CampaignPlayWorkerLeaseToken,
  type ClaimCampaignPlayStageInput,
  type RenewCampaignPlayLeaseInput,
} from "./campaign-play-turn-repository.js";

const campaignId = "11111111-1111-4111-8111-111111111111";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const TEST_MODEL_PRICING = { known: true, currency: "USD", tokenUnit: 1_000_000,
  inputCostMicros: 1_000, outputCostMicros: 2_000, rounding: "ceil" } as const;
const UNKNOWN_MODEL_PRICING = { known: false, currency: "USD", tokenUnit: 1_000_000,
  inputCostMicros: 0, outputCostMicros: 0, rounding: "ceil" } as const;
let root = "";
let previousCampaignsRoot: string | undefined;
let handles: CampaignPlayDatabaseHandle[] = [];

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-turn-repository-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.close();
  closeDb();
  if (previousCampaignsRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
  else process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  fs.rmSync(root, { recursive: true, force: true });
});

function openPlay(): CampaignPlayDatabaseHandle {
  const handle = openCampaignPlayDatabase(campaignId);
  handles.push(handle);
  return handle;
}

function createOpeningReadyCampaign() {
  createMigratedCampaign(root, campaignId);
  const world = openCampaignWorldDatabase(campaignId);
  try {
    const repository = createCampaignWorldRepository(world);
    const source = sourceFixture(campaignId);
    repository.acquireBuild({
      buildId: "build-one", source, expectedSourceDigest: source.sourceDigest,
      providerId: "test-provider", model: "test-model", startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, "build-one");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b" ? { ...placement, locationId: "location-a" } : placement),
    };
    const review = repository.completeBuild({
      buildId: "build-one",
      candidate: { ...candidate, draft, contentHash: calculateCampaignWorldContentHash(source.sourceDigest, draft) },
      completedAt: 1_100,
    });
    repository.acceptWorld({ expectedVersion: review.version, expectedContentHash: review.contentHash, acceptedAt: 1_200 });
  } finally {
    world.close();
  }
  const handle = openPlay();
  const states = createCampaignPlayStateRepository(handle);
  states.createState({ eventId: "state-created", createdAt: 1_300 });
  const state = states.commitMechanicalAndRuntime({
    worldVersionAdvance: 1,
    event: { eventId: "character-created", turnId: null, kind: "character_created", workerEpoch: null, protectedPayloadHash: hashA, createdAt: 1_400 },
    mutate(context) {
      context.sqlite.prepare(`
        INSERT INTO actors (id, campaign_id, kind, controller, role, name, summary, traits, tags)
        VALUES ('actor-player', ?, 'person', 'human', 'player', 'Player', 'A human-controlled visitor.', '[]', '[]')
      `).run(context.campaignId);
      context.sqlite.prepare(`
        INSERT INTO campaign_play_characters (actor_id, campaign_id, record_json, record_hash, source_kind, source_digest, created_at)
        VALUES ('actor-player', ?, '{"name":"Player"}', ?, 'created', ?, 1400)
      `).run(context.campaignId, hashA, hashB);
      context.sqlite.prepare("UPDATE campaign_play_states SET setup_phase = 'opening_required' WHERE campaign_id = ?")
        .run(context.campaignId);
    },
  });
  return { handle, state };
}

function openingInput(state: ReturnType<typeof createOpeningReadyCampaign>["state"], idempotencyKey = "opening-one"): AdmitCampaignPlayTurnInput {
  return {
    turnId: "turn-opening", supersedesTurnId: null, mutationId: "runtime-turn-opening", submittedAt: 1_500,
    document: {
      turnKind: "opening",
      request: { idempotencyKey, expectedWorldVersion: state.authority.worldVersion, expectedRuntimeRevision: state.authority.runtimeRevision, startingConditions: { mode: "delegate" } },
      frame: state.publicState.projection as CampaignPlayProjectionRecord,
    },
    modelSelection: {
      turnKind: "opening",
      openingPlanner: { providerId: "test-provider", model: "planner", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
      narrator: { providerId: "test-provider", model: "narrator", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
    },
  };
}

function expectTurnError(action: () => unknown, code: CampaignPlayTurnRepositoryError["code"]): void {
  expect(action).toThrowError(expect.objectContaining<Partial<CampaignPlayTurnRepositoryError>>({ code }));
}

function claimInput(
  overrides: Partial<ClaimCampaignPlayStageInput> = {},
): ClaimCampaignPlayStageInput {
  return {
    turnId: "turn-opening",
    expectedStage: "admitted",
    observedEpoch: 0,
    owner: "worker-alpha",
    claimedAt: 1_600,
    leaseExpiresAt: 1_800,
    mutationId: "worker-claim-one",
    ...overrides,
  };
}

function renewInput(
  token: CampaignPlayWorkerLeaseToken,
  overrides: Partial<Omit<RenewCampaignPlayLeaseInput, "token">> = {},
): RenewCampaignPlayLeaseInput {
  return {
    token,
    renewedAt: token.expiresAt - 10,
    leaseExpiresAt: token.expiresAt + 200,
    mutationId: "worker-renew-one",
    ...overrides,
  };
}

function runtimeSnapshot(handle: CampaignPlayDatabaseHandle) {
  return {
    state: handle.sqlite.prepare(`
      SELECT runtime_revision AS runtimeRevision, next_runtime_event_sequence AS nextRuntimeEventSequence
      FROM campaign_play_states WHERE campaign_id = ?
    `).get(campaignId),
    turn: handle.sqlite.prepare(`
      SELECT next_event_sequence AS nextEventSequence, worker_lease_owner AS workerLeaseOwner,
        worker_epoch AS workerEpoch, worker_lease_expires_at AS workerLeaseExpiresAt
      FROM campaign_play_turns WHERE id = 'turn-opening'
    `).get(),
    runtimeEvents: handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_runtime_events WHERE campaign_id = ?
    `).get(campaignId),
    turnEvents: handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_turn_events WHERE turn_id = 'turn-opening'
    `).get(),
    stages: handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_model_stages WHERE turn_id = 'turn-opening'
    `).get(),
  };
}

function disableCampaignPlayGuards(handle: CampaignPlayDatabaseHandle): void {
  for (const row of handle.sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'trigger'",
  ).all() as Array<{ name: string }>) {
    if (row.name.startsWith("campaign_play_")) {
      handle.sqlite.exec(`DROP TRIGGER ${row.name}`);
    }
  }
}

interface ChildRepositoryResult {
  kind: "success" | "error";
  value?: unknown;
  code?: string | null;
  message?: string;
}

interface ChildRepositoryRun {
  ready: Promise<void>;
  result: Promise<ChildRepositoryResult>;
  start(): void;
  cancel(): void;
}

function startRepositoryChild(
  operation: "admit" | "claim",
  input: AdmitCampaignPlayTurnInput | ClaimCampaignPlayStageInput,
): ChildRepositoryRun {
  const backendRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
  );
  const databaseModule = pathToFileURL(
    path.join(backendRoot, "src", "campaign-play", "campaign-play-database.ts"),
  ).href;
  const repositoryModule = pathToFileURL(
    path.join(backendRoot, "src", "campaign-play", "campaign-play-turn-repository.ts"),
  ).href;
  const source = `
    import { readFileSync } from "node:fs";
    import { openCampaignPlayDatabase } from ${JSON.stringify(databaseModule)};
    import {
      CampaignPlayTurnRepositoryError,
      createCampaignPlayTurnRepository,
    } from ${JSON.stringify(repositoryModule)};
    const input = ${JSON.stringify(input)};
    let handle;
    try {
      handle = openCampaignPlayDatabase(${JSON.stringify(campaignId)});
      process.stdout.write("__WF_READY__\\n");
      readFileSync(0, "utf8");
      const repository = createCampaignPlayTurnRepository(handle);
      const value = ${operation === "admit"
        ? "repository.admitTurn(input)"
        : "repository.claimStage(input)"};
      process.stdout.write(JSON.stringify({ kind: "success", value }));
    } catch (error) {
      process.stdout.write(JSON.stringify({
        kind: "error",
        code: error instanceof CampaignPlayTurnRepositoryError ? error.code : null,
        message: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      handle?.close();
    }
  `;
  const child = spawn(process.execPath, [
    "--import",
    "tsx/esm",
    "--input-type=module",
    "--eval",
    source,
  ], {
    cwd: backendRoot,
    env: { ...process.env, GSD_CAMPAIGNS_ROOT: root },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const readySignal = "__WF_READY__\n";
  let stdout = "";
  let stderr = "";
  let readySettled = false;
  let resultSettled = false;
  let startSent = false;
  let resolveReady!: () => void;
  let rejectReady!: (reason: Error) => void;
  let resolveResult!: (value: ChildRepositoryResult) => void;
  let rejectResult!: (reason: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const result = new Promise<ChildRepositoryResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const fail = (error: Error): void => {
    if (!readySettled) {
      readySettled = true;
      rejectReady(error);
    }
    if (!resultSettled) {
      resultSettled = true;
      rejectResult(error);
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
    if (!readySettled && stdout.startsWith(readySignal)) {
      stdout = stdout.slice(readySignal.length);
      readySettled = true;
      resolveReady();
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.once("error", (error) => {
    fail(error);
  });
  child.stdin.once("error", (error) => {
    fail(error);
  });
  child.once("close", (exitCode) => {
    if (exitCode !== 0) {
      fail(new Error(`Campaign Play child exited ${String(exitCode)}: ${stderr}`));
      return;
    }
    if (!readySettled) {
      fail(new Error("Campaign Play child exited before the race barrier opened."));
      return;
    }
    try {
      if (!resultSettled) {
        resultSettled = true;
        resolveResult(JSON.parse(stdout) as ChildRepositoryResult);
      }
    } catch (error) {
      fail(new Error(`Campaign Play child emitted invalid JSON: ${stdout}`, { cause: error }));
    }
  });
  void result.catch(() => undefined);

  return {
    ready,
    result,
    start(): void {
      if (startSent) return;
      startSent = true;
      child.stdin.end("go\n");
    },
    cancel(): void {
      if (!child.killed) child.kill();
    },
  };
}

function raceRepositoryChildren(
  operation: "admit" | "claim",
  first: AdmitCampaignPlayTurnInput | ClaimCampaignPlayStageInput,
  second: AdmitCampaignPlayTurnInput | ClaimCampaignPlayStageInput,
): Promise<[ChildRepositoryResult, ChildRepositoryResult]> {
  const firstChild = startRepositoryChild(operation, first);
  const secondChild = startRepositoryChild(operation, second);
  return Promise.all([firstChild.ready, secondChild.ready])
    .then(() => {
      firstChild.start();
      secondChild.start();
      return Promise.all([firstChild.result, secondChild.result]);
    })
    .catch((error: unknown) => {
      firstChild.cancel();
      secondChild.cancel();
      throw error;
    });
}

function seedExpiredDeterministicLease(
  handle: CampaignPlayDatabaseHandle,
  repository: ReturnType<typeof createCampaignPlayTurnRepository>,
): void {
  repository.claimStage(claimInput());
  const states = createCampaignPlayStateRepository(handle);
  const state = states.loadState();
  if (!state) throw new Error("Campaign Play state must exist for the deterministic lease fixture.");
  const stage = handle.sqlite.prepare(`
    SELECT stage_id AS stageId FROM campaign_play_model_stages
    WHERE turn_id = 'turn-opening' AND kind = 'opening_planner' AND attempt = 1
  `).get() as { stageId: string };
  const artifact = { opening: "planned" };
  const artifactJson = canonicalizeCampaignPlayProjection(artifact);
  const artifactHash = hashCampaignPlayProjection({
    domain: "campaign_play_model_artifact",
    stageId: stage.stageId,
    kind: "opening_planner",
    artifact,
  });
  states.commitRuntime({
    event: {
      eventId: "fixture-stage-accepted",
      turnId: "turn-opening",
      kind: "stage_accepted",
      workerEpoch: 1,
      protectedPayloadHash: hashA,
      createdAt: 1_650,
    },
    mutate(context) {
      handle.sqlite.prepare(`
        UPDATE campaign_play_turns
        SET stage = 'planned', worker_lease_owner = NULL,
          worker_lease_expires_at = NULL, next_event_sequence = 4, updated_at = 1_650
        WHERE id = 'turn-opening' AND campaign_id = ?
      `).run(context.campaignId);
      handle.sqlite.prepare(`
        UPDATE campaign_play_model_stages SET
          status = 'accepted', actual_provider_id = 'test-provider', actual_model = 'planner',
          actual_strategy = 'strict_object', input_tokens = 10, output_tokens = 20,
          duration_ms = 50, finish_reason = 'stop', schema_outcome = 'valid',
          artifact_json = ?, artifact_hash = ?, completed_at = 1650
        WHERE stage_id = ? AND attempt = 1
      `).run(artifactJson, artifactHash, stage.stageId);
      const event = {
        type: "turn.progressed" as const,
        progress: "settling" as const,
        sequence: 3,
        turnId: "turn-opening",
        acceptedWorldVersion: state.authority.acceptedWorldVersion,
        worldVersion: context.priorWorldVersion,
        runtimeRevision: context.targetRuntimeRevision,
        createdAt: 1_650,
      };
      handle.sqlite.prepare(`
        INSERT INTO campaign_play_turn_events (
          event_id, campaign_id, turn_id, sequence, event_type,
          payload_json, sse_cursor, created_at
        ) VALUES ('fixture-stage-accepted', ?, 'turn-opening', 3, 'turn.progressed', ?, 'turn-opening:3', 1650)
      `).run(context.campaignId, canonicalizeCampaignPlayProjection(event));
    },
  });
  repository.claimStage(claimInput({
    expectedStage: "planned",
    observedEpoch: 1,
    owner: "worker-expired",
    claimedAt: 1_660,
    leaseExpiresAt: 1_690,
    mutationId: "fixture-deterministic-claim",
  }));
}

function executionEvidence(model: string) {
  return {
    actualProviderId: "test-provider",
    actualModel: model,
    actualStrategy: "strict_object" as const,
    inputTokens: 12,
    outputTokens: 24,
    durationMs: 40,
    finishReason: "stop",
  };
}

function advanceOpeningToVisibility(
  handle: CampaignPlayDatabaseHandle,
  repository: ReturnType<typeof createCampaignPlayTurnRepository>,
  state: ReturnType<typeof createOpeningReadyCampaign>["state"],
  packetHashOverride?: string,
  narrationStatus: "pending" | "complete" | "invalid" = "pending",
) {
  repository.admitTurn(openingInput(state));
  const plannerToken = repository.claimStage(claimInput());
  repository.acceptModelArtifact({
    token: plannerToken,
    artifact: { plan: { summary: "Arrive quietly", steps: ["place", "observe"] } },
    evidence: executionEvidence("planner"),
    mutationDomain: "runtime",
    acceptedAt: 1_650,
    mutationId: "opening-plan-accepted",
  });
  const primaryToken = repository.claimStage(claimInput({
    expectedStage: "planned",
    observedEpoch: 1,
    claimedAt: 1_700,
    leaseExpiresAt: 2_000,
    mutationId: "primary-claim",
  }));
  repository.commitDeterministic({
    token: primaryToken,
    transition: "primary_settled",
    worldVersionAdvance: 1,
    committedAt: 1_750,
    mutationId: "primary-settled",
    mutate(context) {
      context.sqlite.prepare(`
        INSERT INTO actor_placements (id, campaign_id, actor_id, location_id, placement_kind)
        VALUES ('placement-player', ?, 'actor-player', 'location-a', 'present')
      `).run(context.campaignId);
      context.sqlite.prepare(`
        UPDATE campaign_play_states SET world_time_minutes = 0 WHERE campaign_id = ?
      `).run(context.campaignId);
    },
  });
  const actorJobToken = repository.claimStage(claimInput({
    expectedStage: "primary_settled",
    observedEpoch: 2,
    claimedAt: 1_800,
    leaseExpiresAt: 2_100,
    mutationId: "actor-job-claim",
  }));
  repository.commitDeterministic({
    token: actorJobToken,
    transition: "actor_job_transitioned",
    worldVersionAdvance: 0,
    committedAt: 1_850,
    mutationId: "actor-job-settled",
  });
  const actorsToken = repository.claimStage(claimInput({
    expectedStage: "primary_settled",
    observedEpoch: 3,
    claimedAt: 1_900,
    leaseExpiresAt: 2_200,
    mutationId: "actors-claim",
  }));
  repository.commitDeterministic({
    token: actorsToken,
    transition: "actors_settled",
    worldVersionAdvance: 0,
    committedAt: 1_950,
    mutationId: "actors-settled",
  });
  const packet = {
    campaignId,
    turnId: "turn-opening",
    turnKind: "opening" as const,
    acceptedWorldVersion: 1,
    worldVersion: 1,
    runtimeRevision: 1,
    openingContext: {
      role: "A repairer waiting for passage",
      arrivalMode: "On the last permitted ferry",
      immediateSituation: "The harbor gates close as an impossible bell pattern crosses the water.",
    },
    actionContext: null,
    currentLocation: {
      handle: "location_harbor",
      name: "Harbor",
      description: "Rain crosses the lantern light.",
    },
    visibleActors: [],
    visibleRoutes: [],
    visiblePressures: [],
    newObservations: [],
    consequences: [],
    continuity: [],
    elapsedMinutes: 0,
    availableIntents: [],
  };
  const packetJson = canonicalizeCampaignPlayProjection(packet);
  const packetHash = packetHashOverride ??
    hashCampaignPlayNarratorPacket("turn-opening", packet);
  const visibilityToken = repository.claimStage(claimInput({
    expectedStage: "actors_settled",
    observedEpoch: 4,
    claimedAt: 2_000,
    leaseExpiresAt: 2_300,
    mutationId: "visibility-claim",
  }));
  repository.commitDeterministic({
    token: visibilityToken,
    transition: "visibility_projected",
    worldVersionAdvance: 0,
    publicPacketHash: packetHash,
    committedAt: 2_050,
    mutationId: "visibility-projected",
    mutate(context) {
      if (narrationStatus === "pending") {
        context.sqlite.prepare(`
          INSERT INTO campaign_play_narrations (
            narration_id, campaign_id, turn_id, status, packet_hash, packet_json, created_at
          ) VALUES ('narration-opening', ?, 'turn-opening', 'pending', ?, ?, 2050)
        `).run(context.campaignId, packetHash, packetJson);
      } else if (narrationStatus === "complete") {
        context.sqlite.prepare(`
          INSERT INTO campaign_play_narrations (
            narration_id, campaign_id, turn_id, status, packet_hash, packet_json,
            beats_json, display_text, suggested_actions_json, effects_json,
            created_at, completed_at
          ) VALUES (
            'narration-opening', ?, 'turn-opening', 'complete', ?, ?,
            '[]', 'Premature narration.', '[]', '[]', 2050, 2050
          )
        `).run(context.campaignId, packetHash, packetJson);
      } else {
        context.sqlite.prepare(`
          INSERT INTO campaign_play_narrations (
            narration_id, campaign_id, turn_id, status, packet_hash, packet_json,
            error_code, created_at, completed_at
          ) VALUES (
            'narration-opening', ?, 'turn-opening', 'invalid', ?, ?,
            'narration_invalid', 2050, 2050
          )
        `).run(context.campaignId, packetHash, packetJson);
      }
    },
  });
  return { packetHash };
}

function completeOpening(
  handle: CampaignPlayDatabaseHandle,
  repository: ReturnType<typeof createCampaignPlayTurnRepository>,
  state: ReturnType<typeof createOpeningReadyCampaign>["state"],
) {
  const { packetHash } = advanceOpeningToVisibility(handle, repository, state);
  const narratorToken = repository.claimStage(claimInput({
    expectedStage: "visibility_projected",
    observedEpoch: 5,
    claimedAt: 2_100,
    leaseExpiresAt: 2_500,
    mutationId: "narrator-claim",
  }));
  const narration = {
    narrationId: "narration-opening",
    turnId: "turn-opening",
    beats: [{ beatId: "beat-arrival", text: "Rain gathers on the quiet road." }],
    displayText: "Rain gathers on the quiet road as a lantern moves beyond the gate.",
    suggestedActions: [],
    effects: [],
    createdAt: 2_050,
  };
  const completed = repository.acceptModelArtifact({
    token: narratorToken,
    artifact: narration,
    evidence: executionEvidence("narrator"),
    mutationDomain: "narration",
    publicPacketHash: packetHash,
    acceptedAt: 2_150,
    mutationId: "narration-completed",
    mutate(context) {
      context.sqlite.prepare(`
        UPDATE campaign_play_narrations SET status = 'complete', beats_json = ?,
          display_text = ?, suggested_actions_json = ?, effects_json = ?, completed_at = 2150
        WHERE campaign_id = ? AND turn_id = 'turn-opening' AND status = 'pending'
      `).run(
        canonicalizeCampaignPlayProjection(narration.beats), narration.displayText,
        canonicalizeCampaignPlayProjection(narration.suggestedActions),
        canonicalizeCampaignPlayProjection(narration.effects), context.campaignId,
      );
      context.sqlite.prepare(`
        UPDATE campaign_play_states SET setup_phase = 'ready', opened_at = 2150
        WHERE campaign_id = ?
      `).run(context.campaignId);
    },
  });
  return { completed, narratorToken, packetHash, narration };
}

describe("Campaign Play turn repository admission", () => {
  it("admits an opening exactly once, persists its paired boundary, lists cursored events, and reopens", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    const input = openingInput(state);

    expect(repository.admitTurn(input)).toEqual({ turnId: "turn-opening", sequence: 1 });
    const loaded = repository.loadTurn("turn-opening");
    expect(loaded).toMatchObject({ turnId: "turn-opening", stage: "admitted", nextEventSequence: 2 });
    expect(loaded?.events).toEqual([expect.objectContaining({ type: "turn.accepted", sequence: 1, turnId: "turn-opening" })]);
    expect(repository.listTurnEvents("turn-opening", 1)).toEqual([]);
    expect(repository.loadActiveTurn()?.turnId).toBe("turn-opening");
    expect(handle.sqlite.prepare("SELECT turn_id AS turnId, kind FROM campaign_play_runtime_events WHERE event_id = 'runtime-turn-opening'").get())
      .toEqual({ turnId: "turn-opening", kind: "turn_admitted" });

    handle.close();
    handles = handles.filter((candidate) => candidate !== handle);
    const reopened = openPlay();
    expect(createCampaignPlayTurnRepository(reopened).loadTurn("turn-opening")?.events).toHaveLength(1);
  });

  it("replays an exact same key without a second row or revision, while a changed same key fails before phase checks", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    const input = openingInput(state);
    repository.admitTurn(input);
    const before = handle.sqlite.prepare("SELECT runtime_revision AS revision FROM campaign_play_states WHERE campaign_id = ?").get(campaignId);
    expect(repository.admitTurn(input)).toEqual({ turnId: "turn-opening", sequence: 1 });
    expect(handle.sqlite.prepare("SELECT COUNT(*) AS count FROM campaign_play_turns WHERE campaign_id = ?").get(campaignId)).toEqual({ count: 1 });
    expect(handle.sqlite.prepare("SELECT runtime_revision AS revision FROM campaign_play_states WHERE campaign_id = ?").get(campaignId)).toEqual(before);

    const altered = { ...input, turnId: "turn-other", document: { ...input.document, request: { ...input.document.request, expectedWorldVersion: state.authority.worldVersion + 1 } } } as AdmitCampaignPlayTurnInput;
    expectTurnError(() => repository.admitTurn(altered), "turn_idempotency_mismatch");
  });

  it("rejects a competing active key after a valid first opening", () => {
    const { state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handles[0]!);
    repository.admitTurn(openingInput(state));
    const competing = openingInput(state, "opening-two");
    competing.turnId = "turn-competing";
    competing.mutationId = "runtime-turn-competing";
    expectTurnError(() => repository.admitTurn(competing), "turn_in_progress");
  });

  it("rejects missing or malformed frozen model pricing before creating a turn", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    const missing = structuredClone(openingInput(state)) as unknown as Record<string, unknown>;
    const missingSelection = missing.modelSelection as {
      openingPlanner: Record<string, unknown>;
    };
    delete missingSelection.openingPlanner.pricing;
    expectTurnError(
      () => repository.admitTurn(missing as unknown as AdmitCampaignPlayTurnInput),
      "turn_stage_invalid",
    );
    const malformed = structuredClone(openingInput(state)) as unknown as Record<string, unknown>;
    const malformedSelection = malformed.modelSelection as {
      openingPlanner: { pricing: { inputCostMicros: number } };
    };
    malformedSelection.openingPlanner.pricing.inputCostMicros = -1;
    expectTurnError(
      () => repository.admitTurn(malformed as unknown as AdmitCampaignPlayTurnInput),
      "turn_stage_invalid",
    );
    expect(handle.sqlite.prepare(`SELECT count(*) AS count
      FROM campaign_play_turns WHERE campaign_id = ?`).get(campaignId)).toEqual({ count: 0 });
  });

  it("replays one same-key admission across two racing database processes", async () => {
    const { handle, state } = createOpeningReadyCampaign();
    const input = openingInput(state);

    const [first, second] = await raceRepositoryChildren("admit", input, input);
    expect([first, second]).toEqual([
      expect.objectContaining({ kind: "success", value: { turnId: "turn-opening", sequence: 1 } }),
      expect.objectContaining({ kind: "success", value: { turnId: "turn-opening", sequence: 1 } }),
    ]);
    expect(handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_turns WHERE campaign_id = ?
    `).get(campaignId)).toEqual({ count: 1 });
    expect(handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_runtime_events
      WHERE campaign_id = ? AND kind = 'turn_admitted'
    `).get(campaignId)).toEqual({ count: 1 });
    expect(handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_turn_events WHERE turn_id = 'turn-opening'
    `).get()).toEqual({ count: 1 });
  });

  it("fences distinct admission keys across two racing database processes", async () => {
    const { handle, state } = createOpeningReadyCampaign();
    const firstInput = openingInput(state);
    const competing = openingInput(state, "opening-independent-two");
    competing.turnId = "turn-independent-two";
    competing.mutationId = "runtime-turn-independent-two";

    const results = await raceRepositoryChildren("admit", firstInput, competing);
    expect(results.filter((result) => result.kind === "success")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "error")).toEqual([
      expect.objectContaining({ code: "turn_in_progress" }),
    ]);
    expect(handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_turns WHERE campaign_id = ?
    `).get(campaignId)).toEqual({ count: 1 });
    expect(handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_runtime_events
      WHERE campaign_id = ? AND kind = 'turn_admitted'
    `).get(campaignId)).toEqual({ count: 1 });
  });

  it("rejects corrupt input, frame, event payload, and runtime-event pairing", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    const original = handle.sqlite.prepare(`
      SELECT input_json AS inputJson, input_hash AS inputHash, frame_hash AS frameHash,
        payload_json AS payloadJson
      FROM campaign_play_turns JOIN campaign_play_turn_events
        ON campaign_play_turn_events.turn_id = campaign_play_turns.id
      WHERE campaign_play_turns.id = 'turn-opening'
    `).get() as { inputJson: string; inputHash: string; frameHash: string; payloadJson: string };
    const disableImmutable = () => {
      for (const row of handle.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'campaign_play_%immutable%' ").all() as Array<{ name: string }>) {
        handle.sqlite.exec(`DROP TRIGGER ${row.name}`);
      }
    };
    disableImmutable();
    handle.sqlite.prepare("UPDATE campaign_play_turns SET input_json = '{}' WHERE id = 'turn-opening'").run();
    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");

    handle.sqlite.prepare("UPDATE campaign_play_turns SET input_json = ? WHERE id = 'turn-opening'")
      .run(original.inputJson);
    handle.sqlite.prepare("UPDATE campaign_play_turns SET frame_hash = ? WHERE id = 'turn-opening'").run(hashB);
    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");

    handle.sqlite.prepare("UPDATE campaign_play_turns SET frame_hash = ? WHERE id = 'turn-opening'").run(original.frameHash);
    handle.sqlite.prepare("UPDATE campaign_play_turn_events SET payload_json = '{}' WHERE turn_id = 'turn-opening'").run();
    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");

    handle.sqlite.prepare("UPDATE campaign_play_turn_events SET payload_json = ? WHERE turn_id = 'turn-opening'")
      .run(original.payloadJson);
    const eventBeforeAdmission = {
      ...(JSON.parse(original.payloadJson) as Record<string, unknown>),
      createdAt: 1_499,
    };
    handle.sqlite.prepare(`UPDATE campaign_play_turn_events
      SET payload_json = ?, created_at = 1499 WHERE turn_id = 'turn-opening'`)
      .run(canonicalizeCampaignPlayProjection(eventBeforeAdmission));
    handle.sqlite.prepare(`UPDATE campaign_play_runtime_events
      SET created_at = 1499 WHERE event_id = 'runtime-turn-opening'`).run();
    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");

    handle.sqlite.prepare(`UPDATE campaign_play_turn_events
      SET payload_json = ?, created_at = 1500 WHERE turn_id = 'turn-opening'`)
      .run(original.payloadJson);
    handle.sqlite.prepare(`UPDATE campaign_play_runtime_events
      SET created_at = 1500 WHERE event_id = 'runtime-turn-opening'`).run();
    handle.sqlite.pragma("ignore_check_constraints = ON");
    handle.sqlite.prepare("UPDATE campaign_play_runtime_events SET turn_id = NULL WHERE event_id = 'runtime-turn-opening'").run();
    handle.sqlite.pragma("ignore_check_constraints = OFF");
    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");
  });
});

describe("Campaign Play turn worker leases", () => {
  it("claims an external stage atomically with its started attempt and paired public event", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));

    const token = repository.claimStage(claimInput());
    expect(token).toEqual({
      turnId: "turn-opening",
      stage: "admitted",
      owner: "worker-alpha",
      epoch: 1,
      expiresAt: 1_800,
    });
    const loaded = repository.loadTurn("turn-opening");
    expect(loaded).toMatchObject({
      stage: "admitted",
      workerLeaseOwner: "worker-alpha",
      workerEpoch: 1,
      workerLeaseExpiresAt: 1_800,
      nextEventSequence: 3,
    });
    expect(loaded?.events.at(-1)).toEqual(expect.objectContaining({
      type: "turn.progressed",
      progress: "interpreting",
      sequence: 2,
      runtimeRevision: state.authority.runtimeRevision + 2,
    }));
    expect(JSON.stringify(loaded?.events.at(-1))).not.toContain("worker-alpha");
    expect(handle.sqlite.prepare(`
      SELECT kind, attempt, status, worker_epoch AS workerEpoch,
        requested_provider_id AS requestedProviderId, requested_model AS requestedModel
      FROM campaign_play_model_stages WHERE turn_id = 'turn-opening'
    `).get()).toEqual({
      kind: "opening_planner",
      attempt: 1,
      status: "started",
      workerEpoch: 1,
      requestedProviderId: "test-provider",
      requestedModel: "planner",
    });
    expect(handle.sqlite.prepare(`
      SELECT event_id AS eventId, kind, worker_epoch AS workerEpoch
      FROM campaign_play_runtime_events WHERE event_id = 'worker-claim-one'
    `).get()).toEqual({ eventId: "worker-claim-one", kind: "worker_claimed", workerEpoch: 1 });

    handle.close();
    handles = handles.filter((candidate) => candidate !== handle);
    const reopened = openPlay();
    expect(createCampaignPlayTurnRepository(reopened).loadTurn("turn-opening")).toMatchObject({
      workerLeaseOwner: "worker-alpha",
      workerEpoch: 1,
      events: [
        expect.objectContaining({ type: "turn.accepted", sequence: 1 }),
        expect.objectContaining({ type: "turn.progressed", sequence: 2 }),
      ],
    });
  });

  it("fences duplicate and contending claims without adding an event, attempt, or revision", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    repository.claimStage(claimInput());
    const before = runtimeSnapshot(handle);

    expectTurnError(
      () => repository.claimStage(claimInput({ mutationId: "worker-claim-contender" })),
      "turn_fence_lost",
    );
    expectTurnError(() => repository.claimStage(claimInput()), "turn_fence_lost");
    expect(runtimeSnapshot(handle)).toEqual(before);
  });

  it("rejects a canonical progress payload that disagrees with its admitted stage", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    repository.claimStage(claimInput());
    const original = handle.sqlite.prepare(`
      SELECT payload_json AS payloadJson FROM campaign_play_turn_events
      WHERE event_id = 'worker-claim-one'
    `).get() as { payloadJson: string };
    const event = JSON.parse(original.payloadJson) as Record<string, unknown>;
    expect(event.progress).toBe("interpreting");
    disableCampaignPlayGuards(handle);
    handle.sqlite.prepare(`
      UPDATE campaign_play_turn_events SET payload_json = ? WHERE event_id = 'worker-claim-one'
    `).run(canonicalizeCampaignPlayProjection({ ...event, progress: "settling" }));

    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");
  });

  it("lets exactly one of two racing database processes claim the same admitted stage", async () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    expect(repository.loadTurn("turn-opening")?.workerEpoch).toBe(0);

    const results = await raceRepositoryChildren("claim", claimInput(), claimInput({
      owner: "worker-beta",
      mutationId: "worker-claim-peer",
    }));
    expect(results.filter((result) => result.kind === "success")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "error")).toEqual([
      expect.objectContaining({ code: "turn_fence_lost" }),
    ]);
    expect(handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_model_stages WHERE turn_id = 'turn-opening'
    `).get()).toEqual({ count: 1 });
    expect(handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_runtime_events
      WHERE campaign_id = ? AND turn_id = 'turn-opening' AND kind = 'worker_claimed'
    `).get(campaignId)).toEqual({ count: 1 });
  });

  it("takes over an expired deterministic lease without creating a model attempt", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    seedExpiredDeterministicLease(handle, repository);

    const token = repository.claimStage(claimInput({
      expectedStage: "planned",
      observedEpoch: 2,
      owner: "worker-beta",
      claimedAt: 1_700,
      leaseExpiresAt: 1_900,
      mutationId: "worker-deterministic-takeover",
    }));
    expect(token).toMatchObject({ stage: "planned", owner: "worker-beta", epoch: 3 });
    expect(handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_model_stages WHERE turn_id = 'turn-opening'
    `).get()).toEqual({ count: 1 });
    expect(repository.loadTurn("turn-opening")).toMatchObject({
      stage: "planned",
      workerLeaseOwner: "worker-beta",
      workerEpoch: 3,
      nextEventSequence: 6,
    });
  });

  it("holds an expired external lease until an explicit interruption records its outcome", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    repository.claimStage(claimInput({ leaseExpiresAt: 1_650 }));
    const before = runtimeSnapshot(handle);

    expectTurnError(() => repository.claimStage(claimInput({
      observedEpoch: 1,
      owner: "worker-beta",
      claimedAt: 1_700,
      leaseExpiresAt: 1_900,
      mutationId: "worker-external-takeover",
    })), "turn_fence_lost");
    expect(runtimeSnapshot(handle)).toEqual(before);
  });

  it("renews an exact lease once and fences stale, expired, or non-increasing renewals", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    const token = repository.claimStage(claimInput());
    const renewed = repository.renewLease(renewInput(token));
    expect(renewed).toEqual({ ...token, expiresAt: 2_000 });
    expect(repository.loadTurn("turn-opening")).toMatchObject({
      workerLeaseOwner: "worker-alpha",
      workerEpoch: 1,
      workerLeaseExpiresAt: 2_000,
      nextEventSequence: 4,
    });
    const before = runtimeSnapshot(handle);

    expectTurnError(() => repository.renewLease(renewInput({ ...renewed, owner: "worker-beta" }, {
      mutationId: "renew-stale-owner",
    })), "turn_fence_lost");
    expectTurnError(() => repository.renewLease(renewInput({ ...renewed, epoch: 2 }, {
      mutationId: "renew-stale-epoch",
    })), "turn_fence_lost");
    expectTurnError(() => repository.renewLease(renewInput({ ...renewed, stage: "planned" }, {
      mutationId: "renew-stale-stage",
    })), "turn_fence_lost");
    expectTurnError(() => repository.renewLease(renewInput(renewed, {
      renewedAt: 2_000,
      mutationId: "renew-expired",
    })), "turn_fence_lost");
    expectTurnError(() => repository.renewLease(renewInput(renewed, {
      renewedAt: 1_900,
      leaseExpiresAt: 2_000,
      mutationId: "renew-nonincreasing",
    })), "turn_fence_lost");
    expect(runtimeSnapshot(handle)).toEqual(before);
  });

  it("rejects a claim event whose protected kind is rewritten as a lease renewal", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    repository.claimStage(claimInput());
    for (const row of handle.sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger'",
    ).all() as Array<{ name: string }>) {
      if (row.name.startsWith("campaign_play_")) {
        handle.sqlite.exec(`DROP TRIGGER ${row.name}`);
      }
    }
    handle.sqlite.prepare(`
      UPDATE campaign_play_runtime_events
      SET kind = 'worker_lease_renewed'
      WHERE event_id = 'worker-claim-one'
    `).run();

    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");
  });

  it("rejects an external started attempt after its owner and expiry are cleared", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    repository.claimStage(claimInput());
    for (const row of handle.sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger'",
    ).all() as Array<{ name: string }>) {
      if (row.name.startsWith("campaign_play_")) {
        handle.sqlite.exec(`DROP TRIGGER ${row.name}`);
      }
    }
    handle.sqlite.pragma("ignore_check_constraints = ON");
    handle.sqlite.prepare(`
      UPDATE campaign_play_turns
      SET worker_lease_owner = NULL, worker_lease_expires_at = NULL
      WHERE id = 'turn-opening'
    `).run();
    handle.sqlite.pragma("ignore_check_constraints = OFF");

    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");
  });

  it("rejects malformed owned leases, missing started attempts, and noncontiguous attempts at reload", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    repository.claimStage(claimInput());
    const disableCampaignPlayGuards = () => {
      for (const row of handle.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as Array<{ name: string }>) {
        if (row.name.startsWith("campaign_play_")) {
          handle.sqlite.exec(`DROP TRIGGER ${row.name}`);
        }
      }
    };
    disableCampaignPlayGuards();
    const originalStage = handle.sqlite.prepare(`
      SELECT stage_id AS stageId FROM campaign_play_model_stages WHERE turn_id = 'turn-opening'
    `).get() as { stageId: string };
    handle.sqlite.pragma("ignore_check_constraints = ON");
    handle.sqlite.prepare(`
      UPDATE campaign_play_turns SET worker_lease_owner = NULL WHERE id = 'turn-opening'
    `).run();
    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");

    handle.sqlite.prepare(`
      UPDATE campaign_play_turns SET worker_lease_owner = 'worker-alpha' WHERE id = 'turn-opening'
    `).run();
    handle.sqlite.pragma("ignore_check_constraints = OFF");
    handle.sqlite.prepare(`DELETE FROM campaign_play_model_stages WHERE turn_id = 'turn-opening'`).run();
    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");

    handle.sqlite.prepare(`
      UPDATE campaign_play_turns SET worker_epoch = 2 WHERE id = 'turn-opening'
    `).run();
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_model_stages (
        id, stage_id, attempt, campaign_id, turn_id, kind, status, worker_epoch,
        requested_provider_id, requested_model, requested_strategy, schema_outcome, created_at
      ) VALUES ('repaired-stage', ?, 2, ?, 'turn-opening', 'opening_planner', 'started', 2,
        'test-provider', 'planner', 'strict_object', 'pending', 1600)
    `).run(
      originalStage.stageId,
      campaignId,
    );
    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");
  });
});

describe("Campaign Play external artifact and recovery fencing", () => {
  const acceptedEvidence = {
    actualProviderId: "test-provider",
    actualModel: "planner",
    actualStrategy: "strict_object" as const,
    inputTokens: 12,
    outputTokens: 34,
    durationMs: 56,
    finishReason: "stop",
  };
  const interruptionEvidence = {
    actualProviderId: "test-provider",
    actualModel: "planner",
    actualStrategy: "strict_object" as const,
    inputTokens: 3,
    outputTokens: 0,
    durationMs: 70,
    finishReason: "transport_error",
    schemaOutcome: "transport_error" as const,
    errorCode: "provider_unavailable" as const,
  };

  it("accepts canonical model bytes under the exact live epoch and reloads their hash", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    const token = repository.claimStage(claimInput());
    const artifact = { plan: { summary: "Begin locally", steps: ["observe", "contact"] } };

    const accepted = repository.acceptModelArtifact({
      token,
      artifact,
      evidence: acceptedEvidence,
      mutationDomain: "runtime",
      acceptedAt: 1_700,
      mutationId: "opening-plan-accepted",
    });

    expect(accepted.stage).toBe("planned");
    expect(accepted.workerLeaseOwner).toBeNull();
    expect(accepted.events.map((event) => event.type)).toEqual([
      "turn.accepted", "turn.progressed", "turn.progressed",
    ]);
    const stored = handle.sqlite.prepare(`
      SELECT stage_id AS stageId, artifact_json AS artifactJson, artifact_hash AS artifactHash,
        status, worker_epoch AS workerEpoch
      FROM campaign_play_model_stages WHERE turn_id = 'turn-opening'
    `).get() as { stageId: string; artifactJson: string; artifactHash: string; status: string; workerEpoch: number };
    expect(stored).toMatchObject({
      artifactJson: canonicalizeCampaignPlayProjection(artifact),
      status: "accepted",
      workerEpoch: token.epoch,
    });
    expect(stored.artifactHash).toBe(hashCampaignPlayProjection({
      domain: "campaign_play_model_artifact",
      stageId: stored.stageId,
      kind: "opening_planner",
      artifact,
    }));
    expect(repository.loadRecoveryState("turn-opening", 1_701)).toEqual({
      kind: "deterministic_ready",
      turnId: "turn-opening",
      stage: "planned",
      workerEpoch: 1,
    });
    expect(repository.loadAcceptedModelArtifact("turn-opening", "opening_planner"))
      .toEqual({
        kind: "opening_planner",
        attempt: 1,
        workerEpoch: 1,
        artifact,
        artifactHash: stored.artifactHash,
        requested: {
          providerId: "test-provider",
          model: "planner",
          strategy: "strict_object",
          pricing: TEST_MODEL_PRICING,
        },
        evidence: acceptedEvidence,
        startedAt: 1_600,
        completedAt: 1_700,
      });
    expect(repository.loadAcceptedModelArtifact("turn-opening", "narrator")).toBeNull();
    const reopened = openPlay();
    expect(createCampaignPlayTurnRepository(reopened).loadTurn("turn-opening")?.stage).toBe("planned");
    const after = runtimeSnapshot(handle);
    expectTurnError(() => repository.acceptModelArtifact({
      token,
      artifact: { plan: "late" },
      evidence: acceptedEvidence,
      mutationDomain: "runtime",
      acceptedAt: 1_710,
      mutationId: "late-opening-plan",
    }), "turn_fence_lost");
    expect(runtimeSnapshot(handle)).toEqual(after);
  });

  it("keeps token telemetry while marking unknown frozen pricing incomplete", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    const input = openingInput(state);
    if (input.modelSelection.turnKind !== "opening") {
      throw new Error("Opening fixture lost its model selection contract.");
    }
    input.modelSelection.openingPlanner.pricing = UNKNOWN_MODEL_PRICING;
    repository.admitTurn(input);
    const token = repository.claimStage(claimInput());
    repository.acceptModelArtifact({
      token,
      artifact: { plan: { summary: "Begin locally", steps: ["observe"] } },
      evidence: acceptedEvidence,
      mutationDomain: "runtime",
      acceptedAt: 1_700,
      mutationId: "unknown-pricing-plan-accepted",
    });

    const telemetry = repository.loadTurnTelemetry("turn-opening");
    expect(telemetry).toMatchObject({
      inputTokens: 12,
      outputTokens: 34,
      totalTokens: 46,
      estimatedCostMicros: null,
      costComplete: false,
    });
    expect(telemetry.modelAttempts).toContainEqual(expect.objectContaining({
      kind: "opening_planner",
      inputTokens: 12,
      outputTokens: 34,
      estimatedCostMicros: null,
      costComplete: false,
    }));
    const reopened = openPlay();
    expect(createCampaignPlayTurnRepository(reopened).loadTurnTelemetry("turn-opening"))
      .toEqual(telemetry);
  });

  it("rolls back the artifact, stage, event, and runtime revision when its callback fails", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    const token = repository.claimStage(claimInput());
    const before = runtimeSnapshot(handle);

    expect(() => repository.acceptModelArtifact({
      token,
      artifact: { plan: "rollback" },
      evidence: acceptedEvidence,
      mutationDomain: "runtime",
      acceptedAt: 1_700,
      mutationId: "artifact-callback-failed",
      mutate() {
        throw new Error("callback failed");
      },
    })).toThrow("callback failed");

    expect(runtimeSnapshot(handle)).toEqual(before);
    expect(repository.loadTurn("turn-opening")).toMatchObject({
      stage: "admitted",
      workerLeaseOwner: "worker-alpha",
      workerEpoch: 1,
    });
  });

  it("interrupts a live external call, requires explicit resume, and rejects the old epoch", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    const oldToken = repository.claimStage(claimInput());
    const beforeBackwardBoundary = runtimeSnapshot(handle);
    expectTurnError(() => repository.acceptModelArtifact({
      token: oldToken,
      artifact: { plan: "before claim" },
      evidence: acceptedEvidence,
      mutationDomain: "runtime",
      acceptedAt: 1_599,
      mutationId: "opening-plan-before-claim",
    }), "turn_fence_lost");
    expectTurnError(() => repository.interruptExternal({
      token: oldToken,
      evidence: interruptionEvidence,
      interruptedAt: 1_599,
      mutationId: "opening-interruption-before-claim",
    }), "turn_fence_lost");
    expect(runtimeSnapshot(handle)).toEqual(beforeBackwardBoundary);
    expect(repository.loadRecoveryState("turn-opening", 1_700)).toMatchObject({
      kind: "external_in_flight",
      attempt: 1,
      token: oldToken,
    });

    const interrupted = repository.interruptExternal({
      token: oldToken,
      evidence: interruptionEvidence,
      interruptedAt: 1_720,
      mutationId: "opening-plan-interrupted",
    });
    expect(interrupted).toMatchObject({
      stage: "interrupted",
      interruptedStage: "admitted",
      errorCode: "provider_unavailable",
      resumeEligible: true,
      workerEpoch: 1,
    });
    expect(interrupted.events.at(-1)).toMatchObject({
      type: "turn.interrupted",
      retryEligible: true,
    });
    expect(repository.loadRecoveryState("turn-opening", 1_721)).toEqual({
      kind: "explicit_resume_required",
      turnId: "turn-opening",
      interruptedStage: "admitted",
      workerEpoch: 1,
      attempt: 1,
      attemptStartedAt: 1_600,
      errorCode: "provider_unavailable",
    });
    expectTurnError(() => repository.resumeExternal({
      turnId: "turn-opening",
      interruptedStage: "admitted",
      observedEpoch: 1,
      owner: "worker-before-interruption",
      resumedAt: 1_719,
      leaseExpiresAt: 1_930,
      mutationId: "opening-resume-before-interruption",
    }), "turn_fence_lost");

    const resumed = repository.resumeExternal({
      turnId: "turn-opening",
      interruptedStage: "admitted",
      observedEpoch: 1,
      owner: "worker-beta",
      resumedAt: 1_730,
      leaseExpiresAt: 1_930,
      mutationId: "opening-plan-resumed",
    });
    expect(resumed).toEqual({
      turnId: "turn-opening", stage: "admitted", owner: "worker-beta", epoch: 2, expiresAt: 1_930,
    });
    expect(repository.loadRecoveryState("turn-opening", 1_800)).toMatchObject({
      kind: "external_in_flight",
      attempt: 2,
      token: resumed,
    });
    const attempts = handle.sqlite.prepare(`
      SELECT stage_id AS stageId, attempt, status, worker_epoch AS workerEpoch,
        requested_provider_id AS providerId, requested_model AS model
      FROM campaign_play_model_stages WHERE turn_id = 'turn-opening' ORDER BY attempt
    `).all() as Array<Record<string, unknown>>;
    expect(attempts).toEqual([
      expect.objectContaining({ attempt: 1, status: "interrupted", workerEpoch: 1, providerId: "test-provider", model: "planner" }),
      expect.objectContaining({ attempt: 2, status: "started", workerEpoch: 2, providerId: "test-provider", model: "planner" }),
    ]);
    expect(attempts[1].stageId).toBe(attempts[0].stageId);
    const afterResume = runtimeSnapshot(handle);
    expectTurnError(() => repository.acceptModelArtifact({
      token: oldToken,
      artifact: { plan: "late" },
      evidence: acceptedEvidence,
      mutationDomain: "runtime",
      acceptedAt: 1_740,
      mutationId: "old-epoch-result",
    }), "turn_fence_lost");
    expect(runtimeSnapshot(handle)).toEqual(afterResume);
  });

  it("persists schema-invalid interruptions as invalid recovery evidence", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    const token = repository.claimStage(claimInput());

    repository.interruptExternal({
      token,
      evidence: {
        actualProviderId: "test-provider",
        actualModel: "planner",
        actualStrategy: "strict_object",
        inputTokens: 12,
        outputTokens: 4,
        durationMs: 70,
        finishReason: "schema_rejected",
        schemaOutcome: "invalid",
        errorCode: "model_contract_invalid",
      },
      interruptedAt: 1_720,
      mutationId: "opening-plan-schema-invalid",
    });

    expect(handle.sqlite.prepare(`
      SELECT status, schema_outcome AS schemaOutcome, error_code AS errorCode
      FROM campaign_play_model_stages WHERE turn_id = 'turn-opening' AND attempt = 1
    `).get()).toEqual({
      status: "interrupted",
      schemaOutcome: "invalid",
      errorCode: "model_contract_invalid",
    });
  });

  it("classifies an expired external attempt and interrupts it only from exact observed authority", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    const token = repository.claimStage(claimInput({ leaseExpiresAt: 1_650 }));
    expect(repository.loadRecoveryState("turn-opening", 1_650)).toMatchObject({
      kind: "external_interruption_required",
      attempt: 1,
      token,
    });
    const before = runtimeSnapshot(handle);
    expectTurnError(() => repository.interruptExpiredExternal({
      turnId: token.turnId,
      stage: token.stage,
      owner: "other-worker",
      observedEpoch: token.epoch,
      observedLeaseExpiresAt: token.expiresAt,
      evidence: interruptionEvidence,
      observedAt: 1_660,
      mutationId: "wrong-expired-observation",
    }), "turn_fence_lost");
    expect(runtimeSnapshot(handle)).toEqual(before);

    const interrupted = repository.interruptExpiredExternal({
      turnId: token.turnId,
      stage: token.stage,
      owner: token.owner,
      observedEpoch: token.epoch,
      observedLeaseExpiresAt: token.expiresAt,
      evidence: { ...interruptionEvidence, errorCode: "worker_lease_lost" },
      observedAt: 1_660,
      mutationId: "expired-opening-interrupted",
    });
    expect(interrupted).toMatchObject({
      stage: "interrupted",
      interruptedStage: "admitted",
      errorCode: "worker_lease_lost",
      resumeEligible: true,
    });
    expect(createCampaignPlayTurnRepository(handle).loadRecoveryState("turn-opening", 1_700))
      .toMatchObject({ kind: "explicit_resume_required", attempt: 1 });
  });
});

describe("Campaign Play deterministic and terminal turn boundaries", () => {
  it.each(["complete", "invalid"] as const)(
    "rolls back visibility when narration is prematurely %s",
    (narrationStatus) => {
      const { handle, state } = createOpeningReadyCampaign();
      const repository = createCampaignPlayTurnRepository(handle);

      expectTurnError(() => advanceOpeningToVisibility(
        handle,
        repository,
        state,
        undefined,
        narrationStatus,
      ), "turn_corrupt");
      expect(repository.loadTurn("turn-opening")).toMatchObject({
        stage: "actors_settled",
        publicPacketHash: null,
        workerEpoch: 5,
        workerLeaseOwner: "worker-alpha",
        workerLeaseExpiresAt: 2_300,
      });
      expect(handle.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_narrations WHERE turn_id = 'turn-opening'
      `).get()).toEqual({ count: 0 });
      expect(handle.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_runtime_events
        WHERE event_id = 'visibility-projected'
      `).get()).toEqual({ count: 0 });
      expect(handle.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_turn_events
        WHERE event_id = 'visibility-projected'
      `).get()).toEqual({ count: 0 });
    },
  );

  it("rolls back visibility when packet bytes disagree with the supplied domain hash", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    const mismatchedHash = hashCampaignPlayNarratorPacket("turn-opening", {
      scene: "Different packet bytes",
      visibleFacts: [],
    });

    expectTurnError(() => advanceOpeningToVisibility(
      handle,
      repository,
      state,
      mismatchedHash,
    ), "turn_corrupt");
    expect(repository.loadTurn("turn-opening")).toMatchObject({
      stage: "actors_settled",
      publicPacketHash: null,
      workerEpoch: 5,
      workerLeaseOwner: "worker-alpha",
      workerLeaseExpiresAt: 2_300,
    });
    expect(handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_narrations WHERE turn_id = 'turn-opening'
    `).get()).toEqual({ count: 0 });
    expect(handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_runtime_events
      WHERE event_id = 'visibility-projected'
    `).get()).toEqual({ count: 0 });
    expect(handle.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM campaign_play_turn_events
      WHERE event_id = 'visibility-projected'
    `).get()).toEqual({ count: 0 });
  });

  it("rejects packet byte tampering after visibility and after completion", () => {
    const visibleFixture = createOpeningReadyCampaign();
    const visibleRepository = createCampaignPlayTurnRepository(visibleFixture.handle);
    advanceOpeningToVisibility(
      visibleFixture.handle,
      visibleRepository,
      visibleFixture.state,
    );
    visibleFixture.handle.close();
    handles = handles.filter((candidate) => candidate !== visibleFixture.handle);
    const reopenedVisible = openPlay();
    const reopenedVisibleRepository = createCampaignPlayTurnRepository(reopenedVisible);
    expect(reopenedVisibleRepository.loadTurn("turn-opening")?.stage).toBe("visibility_projected");
    disableCampaignPlayGuards(reopenedVisible);
    reopenedVisible.sqlite.prepare(`
      UPDATE campaign_play_narrations SET packet_json = ? WHERE turn_id = 'turn-opening'
    `).run(canonicalizeCampaignPlayProjection({ scene: "Tampered visible packet" }));
    expectTurnError(
      () => reopenedVisibleRepository.loadTurn("turn-opening"),
      "turn_corrupt",
    );

    for (const openHandle of handles) openHandle.close();
    handles = [];
    closeDb();
    fs.rmSync(root, { recursive: true, force: true });
    root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-turn-repository-"));
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const completedFixture = createOpeningReadyCampaign();
    const completedRepository = createCampaignPlayTurnRepository(completedFixture.handle);
    completeOpening(completedFixture.handle, completedRepository, completedFixture.state);
    disableCampaignPlayGuards(completedFixture.handle);
    completedFixture.handle.sqlite.prepare(`
      UPDATE campaign_play_narrations SET packet_json = ? WHERE turn_id = 'turn-opening'
    `).run(canonicalizeCampaignPlayProjection({ scene: "Tampered completed packet" }));
    expectTurnError(
      () => completedRepository.loadTurn("turn-opening"),
      "turn_corrupt",
    );
  });

  it("settles deterministic stages, completes narration atomically, and reopens terminal recovery", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    const { completed, narratorToken, packetHash, narration } = completeOpening(
      handle,
      repository,
      state,
    );

    expect(completed).toMatchObject({
      stage: "completed",
      finalWorldVersion: state.authority.worldVersion + 1,
      publicPacketHash: packetHash,
      completedAt: 2_150,
      workerLeaseOwner: null,
    });
    expect(completed.events).toHaveLength(13);
    expect(completed.events[0].type).toBe("turn.accepted");
    expect(completed.events.slice(1, -1).every((event) => event.type === "turn.progressed"))
      .toBe(true);
    expect(completed.events.at(-1)?.type).toBe("turn.completed");
    expect(repository.loadActiveTurn()).toBeNull();
    expect(repository.loadRecoveryState("turn-opening", 2_200)).toEqual({
      kind: "completed",
      turnId: "turn-opening",
      finalWorldVersion: state.authority.worldVersion + 1,
      completedAt: 2_150,
    });
    expect(handle.sqlite.prepare(`
      SELECT status, packet_hash AS packetHash, display_text AS displayText
      FROM campaign_play_narrations WHERE turn_id = 'turn-opening'
    `).get()).toEqual({ status: "complete", packetHash, displayText: narration.displayText });
    expectTurnError(() => repository.acceptModelArtifact({
      token: narratorToken,
      artifact: narration,
      evidence: executionEvidence("narrator"),
      mutationDomain: "narration",
      publicPacketHash: packetHash,
      acceptedAt: 2_160,
      mutationId: "late-narration",
      mutate() {},
    }), "turn_fence_lost");

    handle.close();
    handles = handles.filter((candidate) => candidate !== handle);
    const reopened = openPlay();
    const recovered = createCampaignPlayTurnRepository(reopened);
    expect(recovered.loadTurn("turn-opening")).toMatchObject({
      stage: "completed",
      finalWorldVersion: state.authority.worldVersion + 1,
      publicPacketHash: packetHash,
    });
    expect(recovered.loadRecoveryState("turn-opening", 3_000).kind).toBe("completed");
  });

  it("rolls back state, ledgers, domain rows, and the turn when final verification fails", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    const plannerToken = repository.claimStage(claimInput());
    repository.acceptModelArtifact({
      token: plannerToken,
      artifact: { plan: "ready" },
      evidence: executionEvidence("planner"),
      mutationDomain: "runtime",
      acceptedAt: 1_650,
      mutationId: "rollback-plan-accepted",
    });
    const primaryToken = repository.claimStage(claimInput({
      expectedStage: "planned", observedEpoch: 1, claimedAt: 1_700,
      leaseExpiresAt: 2_000, mutationId: "rollback-primary-claim",
    }));
    const snapshot = () => ({
      state: handle.sqlite.prepare(`
        SELECT world_version AS worldVersion, runtime_revision AS runtimeRevision,
          next_runtime_event_sequence AS nextRuntimeEventSequence
        FROM campaign_play_states WHERE campaign_id = ?
      `).get(campaignId),
      turn: handle.sqlite.prepare(`
        SELECT stage, next_event_sequence AS nextEventSequence,
          mutation_audit_json AS mutationAuditJson
        FROM campaign_play_turns WHERE id = 'turn-opening'
      `).get(),
      runtimeEvents: handle.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_runtime_events WHERE campaign_id = ?
      `).get(campaignId),
      turnEvents: handle.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_turn_events WHERE turn_id = 'turn-opening'
      `).get(),
      placements: handle.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM actor_placements WHERE actor_id = 'actor-player'
      `).get(),
    });
    const before = snapshot();
    disableCampaignPlayGuards(handle);

    expectTurnError(() => repository.commitDeterministic({
      token: primaryToken,
      transition: "primary_settled",
      worldVersionAdvance: 1,
      committedAt: 1_750,
      mutationId: "rollback-primary-settled",
      mutate(context) {
        context.sqlite.prepare(`
          INSERT INTO actor_placements (id, campaign_id, actor_id, location_id, placement_kind)
          VALUES ('placement-rollback', ?, 'actor-player', 'location-a', 'present')
        `).run(context.campaignId);
        context.sqlite.prepare(`
          UPDATE campaign_play_turns SET mutation_audit_json = '{ "tampered": true }'
          WHERE id = 'turn-opening'
        `).run();
      },
    }), "turn_corrupt");
    expect(snapshot()).toEqual(before);
  });

  it("rolls back an interrupted model attempt when post-mutation turn verification fails", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    const token = repository.claimStage(claimInput());
    const snapshot = () => ({
      state: handle.sqlite.prepare(`
        SELECT runtime_revision AS runtimeRevision,
          next_runtime_event_sequence AS nextRuntimeEventSequence
        FROM campaign_play_states WHERE campaign_id = ?
      `).get(campaignId),
      turn: handle.sqlite.prepare(`
        SELECT stage, worker_lease_owner AS workerLeaseOwner,
          worker_lease_expires_at AS workerLeaseExpiresAt,
          next_event_sequence AS nextEventSequence, mutation_audit_json AS mutationAuditJson
        FROM campaign_play_turns WHERE id = 'turn-opening'
      `).get(),
      attempt: handle.sqlite.prepare(`
        SELECT status, schema_outcome AS schemaOutcome, error_code AS errorCode,
          completed_at AS completedAt
        FROM campaign_play_model_stages WHERE turn_id = 'turn-opening' AND attempt = 1
      `).get(),
      runtimeEvents: handle.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_runtime_events WHERE campaign_id = ?
      `).get(campaignId),
      turnEvents: handle.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_turn_events WHERE turn_id = 'turn-opening'
      `).get(),
    });
    const before = snapshot();
    disableCampaignPlayGuards(handle);
    handle.sqlite.exec(`
      CREATE TRIGGER test_corrupt_interrupted_turn_after_update
      AFTER UPDATE OF stage ON campaign_play_turns
      WHEN NEW.stage = 'interrupted'
      BEGIN
        UPDATE campaign_play_turns SET mutation_audit_json = '{ "late": true }'
        WHERE id = NEW.id;
      END
    `);

    expectTurnError(() => repository.interruptExternal({
      token,
      evidence: {
        actualProviderId: "test-provider", actualModel: "planner",
        actualStrategy: "strict_object", inputTokens: 4, outputTokens: 0,
        durationMs: 25, finishReason: "timeout", schemaOutcome: "transport_error",
        errorCode: "provider_unavailable",
      },
      interruptedAt: 1_650,
      mutationId: "rollback-interruption",
    }), "turn_corrupt");
    expect(snapshot()).toEqual(before);
  });

  it("rolls back narration bytes, model acceptance, completion, and revisions when narration persistence fails", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    const { packetHash } = advanceOpeningToVisibility(handle, repository, state);
    const token = repository.claimStage(claimInput({
      expectedStage: "visibility_projected", observedEpoch: 5,
      claimedAt: 2_100, leaseExpiresAt: 2_500, mutationId: "rollback-narrator-claim",
    }));
    const narration = {
      narrationId: "narration-opening",
      turnId: "turn-opening",
      beats: [{ beatId: "beat-rollback", text: "This text must roll back." }],
      displayText: "This text must roll back.",
      suggestedActions: [],
      effects: [],
      createdAt: 2_050,
    };
    const snapshot = () => ({
      state: handle.sqlite.prepare(`
        SELECT runtime_revision AS runtimeRevision,
          next_runtime_event_sequence AS nextRuntimeEventSequence
        FROM campaign_play_states WHERE campaign_id = ?
      `).get(campaignId),
      turn: handle.sqlite.prepare(`
        SELECT stage, final_world_version AS finalWorldVersion,
          worker_lease_owner AS workerLeaseOwner, next_event_sequence AS nextEventSequence,
          completed_at AS completedAt FROM campaign_play_turns WHERE id = 'turn-opening'
      `).get(),
      attempt: handle.sqlite.prepare(`
        SELECT status, artifact_json AS artifactJson, artifact_hash AS artifactHash
        FROM campaign_play_model_stages WHERE turn_id = 'turn-opening' AND kind = 'narrator'
      `).get(),
      narration: handle.sqlite.prepare(`
        SELECT status, beats_json AS beatsJson, display_text AS displayText,
          completed_at AS completedAt FROM campaign_play_narrations WHERE turn_id = 'turn-opening'
      `).get(),
      runtimeEvents: handle.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_runtime_events WHERE campaign_id = ?
      `).get(campaignId),
      turnEvents: handle.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_turn_events WHERE turn_id = 'turn-opening'
      `).get(),
    });
    const before = snapshot();

    expect(() => repository.acceptModelArtifact({
      token,
      artifact: narration,
      evidence: executionEvidence("narrator"),
      mutationDomain: "narration",
      publicPacketHash: packetHash,
      acceptedAt: 2_150,
      mutationId: "rollback-narration-completion",
      mutate(context) {
        context.sqlite.prepare(`
          UPDATE campaign_play_narrations SET status = 'complete', beats_json = ?,
            display_text = ?, suggested_actions_json = '[]', effects_json = '[]',
            completed_at = 2150 WHERE turn_id = 'turn-opening'
        `).run(canonicalizeCampaignPlayProjection(narration.beats), narration.displayText);
        throw new Error("narration persistence failed");
      },
    })).toThrow("narration persistence failed");
    expect(snapshot()).toEqual(before);
  });

  it("terminally fails an exact pre-settlement lease and preserves its audit across reopen", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    const token = repository.claimStage(claimInput());
    const mutationAudit = { reason: "planner contract rejected", commandCount: 0 };
    expectTurnError(() => repository.failTurn({
      token,
      errorCode: "model_contract_invalid",
      publicErrorCode: "turn_failed",
      mutationAudit,
      modelEvidence: {
        actualProviderId: "test-provider", actualModel: "planner",
        actualStrategy: "strict_object", inputTokens: 12, outputTokens: 7,
        durationMs: 30, finishReason: "stop", schemaOutcome: "invalid",
      },
      failedAt: 1_599,
      mutationId: "opening-terminal-failure-before-claim",
    }), "turn_fence_lost");
    const failed = repository.failTurn({
      token,
      errorCode: "model_contract_invalid",
      publicErrorCode: "turn_failed",
      mutationAudit,
      modelEvidence: {
        actualProviderId: "test-provider", actualModel: "planner",
        actualStrategy: "strict_object", inputTokens: 12, outputTokens: 7,
        durationMs: 30, finishReason: "stop", schemaOutcome: "invalid",
      },
      failedAt: 1_650,
      mutationId: "opening-terminal-failure",
    });

    expect(failed).toMatchObject({
      stage: "failed",
      finalWorldVersion: state.authority.worldVersion,
      errorCode: "model_contract_invalid",
      mutationAudit,
      completedAt: 1_650,
      workerLeaseOwner: null,
    });
    expect(failed.events.at(-1)).toMatchObject({
      type: "turn.failed", errorCode: "turn_failed", retryEligible: false,
    });
    expect(repository.loadRecoveryState("turn-opening", 1_700)).toEqual({
      kind: "terminal_failure",
      turnId: "turn-opening",
      finalWorldVersion: state.authority.worldVersion,
      completedAt: 1_650,
      errorCode: "model_contract_invalid",
      mutationAudit,
    });
    expectTurnError(() => repository.failTurn({
      token,
      errorCode: "model_contract_invalid",
      publicErrorCode: "turn_failed",
      mutationAudit,
      modelEvidence: {
        actualProviderId: null, actualModel: null, actualStrategy: null,
        inputTokens: null, outputTokens: null, durationMs: 0,
        finishReason: null, schemaOutcome: "invalid",
      },
      failedAt: 1_660,
      mutationId: "late-terminal-failure",
    }), "turn_fence_lost");

    handle.close();
    handles = handles.filter((candidate) => candidate !== handle);
    const reopened = openPlay();
    expect(createCampaignPlayTurnRepository(reopened).loadRecoveryState("turn-opening", 2_000))
      .toMatchObject({ kind: "terminal_failure", mutationAudit });
    expect(createCampaignPlayReadModel(reopened).loadTurn("turn-opening").result).toEqual({
      status: "failed",
      errorCode: "turn_failed",
    });
  });

  it("recovers the current game-master interruption after an earlier judge retry", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const openingRepository = createCampaignPlayTurnRepository(handle);
    completeOpening(handle, openingRepository, state);
    const ready = createCampaignPlayStateRepository(handle).loadState();
    if (!ready) throw new Error("Campaign Play ready state disappeared.");
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn({
      turnId: "turn-player",
      supersedesTurnId: null,
      mutationId: "player-turn-admitted",
      submittedAt: 3_000,
      document: {
        turnKind: "player_action",
        request: {
          source: "freeform",
          idempotencyKey: "player-action-one",
          text: "I watch the gate from the rain.",
          expectedWorldVersion: ready.authority.worldVersion,
          expectedRuntimeRevision: ready.authority.runtimeRevision,
        },
        frame: ready.publicState.projection as CampaignPlayProjectionRecord,
      },
      modelSelection: {
        turnKind: "player_action",
        judge: { providerId: "test-provider", model: "judge", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
        gameMaster: { providerId: "test-provider", model: "game-master", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
        actorReplanner: { providerId: "test-provider", model: "actor-replanner", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
        narrator: { providerId: "test-provider", model: "narrator", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
      },
    });
    const interruption = {
      actualProviderId: "test-provider",
      actualModel: "judge",
      actualStrategy: "strict_object" as const,
      inputTokens: 5,
      outputTokens: 0,
      durationMs: 20,
      finishReason: "timeout",
      schemaOutcome: "transport_error" as const,
      errorCode: "provider_unavailable" as const,
    };
    const judgeToken = repository.claimStage({
      turnId: "turn-player", expectedStage: "admitted", observedEpoch: 0,
      owner: "judge-worker", claimedAt: 3_050, leaseExpiresAt: 3_300,
      mutationId: "judge-claim-one",
    });
    repository.interruptExternal({
      token: judgeToken,
      evidence: interruption,
      interruptedAt: 3_100,
      mutationId: "judge-interrupted",
    });
    const resumedJudge = repository.resumeExternal({
      turnId: "turn-player", interruptedStage: "admitted", observedEpoch: 1,
      owner: "judge-worker-two", resumedAt: 3_150, leaseExpiresAt: 3_400,
      mutationId: "judge-resumed",
    });
    repository.acceptModelArtifact({
      token: resumedJudge,
      artifact: {
        ruling: {
          disposition: "deterministic",
          normalizedIntent: {
            originalText: "I watch the gate from the rain.",
            source: "freeform",
            choiceHandle: null,
            kind: "observe",
            targets: [],
            method: null,
            stakes: null,
          },
          citedVisibleFactHandles: [],
          resultBounds: { minimum: "limited", maximum: "success" },
          elapsedBounds: { minimumMinutes: 0, maximumMinutes: 10 },
          uncertainty: { kind: "none" },
          reason: "The visible gate can be watched from shelter.",
          clarificationQuestion: null,
        },
        resolution: { kind: "deterministic", result: "success" },
        uncertaintyAuthority: null,
        publicResult: {
          intentKind: "observe",
          disposition: "deterministic",
          result: "success",
          clarificationQuestion: null,
        },
        primaryPlan: { kind: "game_master_required" },
      },
      evidence: executionEvidence("judge"),
      mutationDomain: "runtime",
      acceptedAt: 3_200,
      mutationId: "judge-accepted",
    });
    const gameMasterToken = repository.claimStage({
      turnId: "turn-player", expectedStage: "judged", observedEpoch: 2,
      owner: "gm-worker", claimedAt: 3_250, leaseExpiresAt: 3_500,
      mutationId: "gm-claim-one",
    });
    repository.interruptExternal({
      token: gameMasterToken,
      evidence: { ...interruption, actualModel: "game-master" },
      interruptedAt: 3_300,
      mutationId: "gm-interrupted",
    });

    handle.close();
    handles = handles.filter((candidate) => candidate !== handle);
    const reopened = openPlay();
    const recovered = createCampaignPlayTurnRepository(reopened);
    expect(recovered.loadRecoveryState("turn-player", 3_350)).toEqual({
      kind: "explicit_resume_required",
      turnId: "turn-player",
      interruptedStage: "judged",
      workerEpoch: 3,
      attempt: 1,
      attemptStartedAt: 3_250,
      errorCode: "provider_unavailable",
    });
    const resumedGameMaster = recovered.resumeExternal({
      turnId: "turn-player", interruptedStage: "judged", observedEpoch: 3,
      owner: "gm-worker-two", resumedAt: 3_350, leaseExpiresAt: 3_650,
      mutationId: "gm-resumed",
    });
    expect(resumedGameMaster).toMatchObject({ stage: "judged", epoch: 4 });
    expect(recovered.loadRecoveryState("turn-player", 3_400)).toMatchObject({
      kind: "external_in_flight",
      attempt: 2,
      token: resumedGameMaster,
    });
    const judgeArtifactHash = recovered.loadAcceptedModelArtifact("turn-player", "judge")?.artifactHash;
    if (!judgeArtifactHash) throw new Error("Accepted Judge artifact disappeared.");
    const batch = {
      batchId: "batch-player-observation",
      baseWorldVersion: ready.authority.worldVersion,
      commands: [{
        kind: "record_world_event" as const,
        commandId: "command-player-observation",
        batchId: "batch-player-observation",
        order: 0,
        causalParent: { kind: "turn" as const, turnId: "turn-player" },
        source: { kind: "system" as const, system: "game_master" as const },
        expectedWorldVersion: ready.authority.worldVersion,
        eventClass: "scene" as const,
        summary: "The player watches the gate.",
        affectedRefs: [{ kind: "actor" as const, id: "actor-player" }],
        readScope: [{ kind: "actor" as const, id: "actor-player" }],
        writeScope: [],
        exposure: { mode: "protected" as const },
      }],
    };
    expectTurnError(() => recovered.acceptModelArtifact({
      token: resumedGameMaster,
      artifact: { judgeArtifactHash, batch },
      evidence: executionEvidence("game-master"),
      mutationDomain: "runtime",
      acceptedAt: 3_450,
      mutationId: "gm-malformed-artifact",
    }), "turn_stage_invalid");
    expectTurnError(() => recovered.acceptModelArtifact({
      token: resumedGameMaster,
      artifact: { judgeArtifactHash, batch, batchHash: hashA },
      evidence: executionEvidence("game-master"),
      mutationDomain: "runtime",
      acceptedAt: 3_450,
      mutationId: "gm-mismatched-batch-hash",
    }), "turn_stage_invalid");
    expectTurnError(() => recovered.acceptModelArtifact({
      token: resumedGameMaster,
      artifact: {
        judgeArtifactHash: hashB,
        batch,
        batchHash: hashCampaignPlayProjection(batch),
      },
      evidence: executionEvidence("game-master"),
      mutationDomain: "runtime",
      acceptedAt: 3_450,
      mutationId: "gm-mismatched-judge-artifact",
    }), "turn_stage_invalid");
    expect(recovered.acceptModelArtifact({
      token: resumedGameMaster,
      artifact: {
        judgeArtifactHash,
        batch,
        batchHash: hashCampaignPlayProjection(batch),
      },
      evidence: executionEvidence("game-master"),
      mutationDomain: "runtime",
      acceptedAt: 3_450,
      mutationId: "gm-accepted",
    }).stage).toBe("planned");
  });

  it("advances a clarification result directly to the durable no-effect plan without a game-master attempt", () => {
    const { handle, state } = createOpeningReadyCampaign();
    completeOpening(handle, createCampaignPlayTurnRepository(handle), state);
    const ready = createCampaignPlayStateRepository(handle).loadState();
    if (!ready) throw new Error("Campaign Play ready state disappeared.");
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn({
      turnId: "turn-clarification",
      supersedesTurnId: null,
      mutationId: "clarification-admitted",
      submittedAt: 3_000,
      document: {
        turnKind: "player_action",
        request: {
          source: "freeform",
          idempotencyKey: "clarification-one",
          text: "I use it.",
          expectedWorldVersion: ready.authority.worldVersion,
          expectedRuntimeRevision: ready.authority.runtimeRevision,
        },
        frame: ready.publicState.projection as CampaignPlayProjectionRecord,
      },
      modelSelection: {
        turnKind: "player_action",
        judge: { providerId: "test-provider", model: "judge", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
        gameMaster: { providerId: "test-provider", model: "game-master", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
        actorReplanner: { providerId: "test-provider", model: "actor-replanner", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
        narrator: { providerId: "test-provider", model: "narrator", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
      },
    });
    const judge = repository.claimStage({
      turnId: "turn-clarification",
      expectedStage: "admitted",
      observedEpoch: 0,
      owner: "judge-worker",
      claimedAt: 3_050,
      leaseExpiresAt: 3_400,
      mutationId: "clarification-judge-claimed",
    });
    const accepted = repository.acceptModelArtifact({
      token: judge,
      artifact: {
        ruling: {
          disposition: "clarification_required",
          normalizedIntent: {
            originalText: "I use it.",
            source: "freeform",
            choiceHandle: null,
            kind: "attempt",
            targets: [],
            method: null,
            stakes: null,
          },
          citedVisibleFactHandles: [],
          resultBounds: { minimum: "no_effect", maximum: "no_effect" },
          elapsedBounds: { minimumMinutes: 0, maximumMinutes: 0 },
          uncertainty: { kind: "none" },
          reason: "The referenced object is ambiguous.",
          clarificationQuestion: "What do you want to use?",
        },
        resolution: { kind: "deterministic", result: "no_effect" },
        uncertaintyAuthority: null,
        publicResult: {
          intentKind: "attempt",
          disposition: "clarification_required",
          result: "no_effect",
          clarificationQuestion: "What do you want to use?",
        },
        primaryPlan: {
          kind: "no_effect",
          reason: "clarification_required",
          commands: [],
        },
      },
      evidence: executionEvidence("judge"),
      mutationDomain: "runtime",
      acceptedAt: 3_100,
      mutationId: "clarification-judge-accepted",
    });
    expect(accepted.stage).toBe("planned");
    expect(accepted.workerEpoch).toBe(1);
    expect(handle.sqlite.prepare(`SELECT count(*) AS count
      FROM campaign_play_model_stages
      WHERE turn_id = 'turn-clarification' AND kind = 'game_master'`).get())
      .toEqual({ count: 0 });
    expect(repository.loadRecoveryState("turn-clarification", 3_101)).toEqual({
      kind: "deterministic_ready",
      turnId: "turn-clarification",
      stage: "planned",
      workerEpoch: 1,
    });

    handle.close();
    handles = handles.filter((candidate) => candidate !== handle);
    const reopened = createCampaignPlayTurnRepository(openPlay());
    expect(reopened.loadTurn("turn-clarification")?.stage).toBe("planned");
    expect(reopened.loadAcceptedModelArtifact("turn-clarification", "game_master")).toBeNull();
  });

  it("rejects deterministic and terminal runtime events that violate replay order", () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    completeOpening(handle, repository, state);
    disableCampaignPlayGuards(handle);

    handle.sqlite.prepare(`
      UPDATE campaign_play_runtime_events SET kind = 'actor_job_transitioned'
      WHERE event_id = 'primary-settled'
    `).run();
    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");
    handle.sqlite.prepare(`
      UPDATE campaign_play_runtime_events SET kind = 'primary_settled'
      WHERE event_id = 'primary-settled'
    `).run();

    handle.sqlite.prepare(`
      UPDATE campaign_play_runtime_events SET kind = 'turn_failed'
      WHERE event_id = 'narration-completed'
    `).run();
    expectTurnError(() => repository.loadTurn("turn-opening"), "turn_corrupt");
  });
});
