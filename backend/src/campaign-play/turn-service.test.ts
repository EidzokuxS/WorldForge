import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
import {
  openCampaignPlayDatabase,
  type CampaignPlayDatabaseHandle,
} from "./campaign-play-database.js";
import type { CampaignPlayProjectionRecord } from "./campaign-play-projection.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import {
  CampaignPlayTurnRepositoryError,
  createCampaignPlayTurnRepository,
  type AdmitCampaignPlayTurnInput,
  type CampaignPlayModelExecutionEvidence,
} from "./campaign-play-turn-repository.js";
import {
  CampaignPlayExternalStageInterruption,
  createCampaignPlayTurnService,
  type CampaignPlayTurnServiceClock,
  type CampaignPlayTurnStageResolver,
} from "./turn-service.js";

const campaignId = "11111111-1111-4111-8111-111111111111";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const TEST_MODEL_PRICING = { known: true, currency: "USD", tokenUnit: 1_000_000,
  inputCostMicros: 1_000, outputCostMicros: 2_000, rounding: "ceil" } as const;
let root = "";
let priorCampaignsRoot: string | undefined;
let handles: CampaignPlayDatabaseHandle[] = [];

beforeEach(() => {
  priorCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-turn-service-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.close();
  closeDb();
  if (priorCampaignsRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
  else process.env.GSD_CAMPAIGNS_ROOT = priorCampaignsRoot;
  fs.rmSync(root, { recursive: true, force: true });
});

function openPlay(): CampaignPlayDatabaseHandle {
  const handle = openCampaignPlayDatabase(campaignId);
  handles.push(handle);
  return handle;
}

function closePlay(handle: CampaignPlayDatabaseHandle): void {
  handle.close();
  handles = handles.filter((candidate) => candidate !== handle);
}

function createOpeningReadyCampaign() {
  createMigratedCampaign(root, campaignId);
  const world = openCampaignWorldDatabase(campaignId);
  try {
    const repository = createCampaignWorldRepository(world);
    const source = sourceFixture(campaignId);
    repository.acquireBuild({
      buildId: "build-turn-service",
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test-provider",
      model: "test-model",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, "build-turn-service");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b"
          ? { ...placement, locationId: "location-a" }
          : placement),
    };
    const review = repository.completeBuild({
      buildId: "build-turn-service",
      candidate: {
        ...candidate,
        draft,
        contentHash: calculateCampaignWorldContentHash(source.sourceDigest, draft),
      },
      completedAt: 1_100,
    });
    repository.acceptWorld({
      expectedVersion: review.version,
      expectedContentHash: review.contentHash,
      acceptedAt: 1_200,
    });
  } finally {
    world.close();
  }
  const handle = openPlay();
  const states = createCampaignPlayStateRepository(handle);
  states.createState({ eventId: "state-created", createdAt: 1_300 });
  const state = states.commitMechanicalAndRuntime({
    worldVersionAdvance: 1,
    event: {
      eventId: "character-created",
      turnId: null,
      kind: "character_created",
      workerEpoch: null,
      protectedPayloadHash: hashA,
      createdAt: 1_400,
    },
    mutate(context) {
      context.sqlite.prepare(`INSERT INTO actors
        (id, campaign_id, kind, controller, role, name, summary, traits, tags)
        VALUES ('actor-player', ?, 'person', 'human', 'player', 'Player',
          'A human-controlled visitor.', '[]', '[]')`).run(context.campaignId);
      context.sqlite.prepare(`INSERT INTO campaign_play_characters
        (actor_id, campaign_id, record_json, record_hash, source_kind, source_digest, created_at)
        VALUES ('actor-player', ?, '{"name":"Player"}', ?, 'created', ?, 1400)`)
        .run(context.campaignId, hashA, hashB);
      context.sqlite.prepare(`UPDATE campaign_play_states SET setup_phase = 'opening_required'
        WHERE campaign_id = ?`).run(context.campaignId);
    },
  });
  return { handle, state };
}

function openingInput(
  state: ReturnType<typeof createOpeningReadyCampaign>["state"],
): AdmitCampaignPlayTurnInput {
  return {
    turnId: "turn-opening",
    supersedesTurnId: null,
    mutationId: "turn-admitted",
    submittedAt: 1_500,
    document: {
      turnKind: "opening",
      request: {
        idempotencyKey: "opening-one",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
      frame: state.publicState.projection as CampaignPlayProjectionRecord,
    },
    modelSelection: {
      turnKind: "opening",
      openingPlanner: {
        providerId: "test-provider",
        model: "planner",
        strategy: "strict_object",
        pricing: TEST_MODEL_PRICING,
      },
      narrator: {
        providerId: "test-provider",
        model: "narrator",
        strategy: "strict_object",
        pricing: TEST_MODEL_PRICING,
      },
    },
  };
}

function executionEvidence(): CampaignPlayModelExecutionEvidence {
  return {
    actualProviderId: "test-provider",
    actualModel: "planner",
    actualStrategy: "strict_object",
    inputTokens: 11,
    outputTokens: 17,
    durationMs: 50,
    finishReason: "stop",
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function controlledClock(initial: number) {
  let value = initial;
  const clock: CampaignPlayTurnServiceClock = {
    now: () => value,
    wait: (_delayMs, signal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  };
  return {
    clock,
    set(next: number) {
      value = next;
    },
  };
}

function durableTiming(handle: CampaignPlayDatabaseHandle) {
  const row = handle.sqlite.prepare(`SELECT
      (SELECT created_at FROM campaign_play_turn_events
        WHERE turn_id = 'turn-opening' AND event_type = 'turn.accepted') AS submittedAt,
      (SELECT created_at FROM campaign_play_runtime_events
        WHERE turn_id = 'turn-opening' AND kind = 'worker_claimed') AS claimedAt,
      (SELECT completed_at FROM campaign_play_model_stages
        WHERE turn_id = 'turn-opening' AND status = 'accepted') AS completedAt,
      (SELECT COUNT(*) FROM campaign_play_runtime_events
        WHERE turn_id = 'turn-opening' AND kind = 'worker_lease_renewed') AS renewals`)
    .get() as {
      submittedAt: number;
      claimedAt: number;
      completedAt: number;
      renewals: number;
    };
  return {
    queueTimeMs: row.claimedAt - row.submittedAt,
    stageTimeMs: row.completedAt - row.claimedAt,
    leaseRenewals: row.renewals,
  };
}

function acceptingResolver(
  handle: CampaignPlayDatabaseHandle,
  onCall: () => void,
): CampaignPlayTurnStageResolver {
  const repository = createCampaignPlayTurnRepository(handle);
  return ({ stage }) => stage === "admitted"
    ? {
        kind: "external",
        async execute() {
          onCall();
          return {
            commit({ token, completedAt }) {
              repository.acceptModelArtifact({
                token,
                artifact: { plan: "ready" },
                evidence: executionEvidence(),
                mutationDomain: "runtime",
                acceptedAt: completedAt,
                mutationId: `planner-accepted-${token.epoch}`,
              });
              return undefined;
            },
          };
        },
      }
    : null;
}

describe("Campaign Play turn service", () => {
  it("commits the started attempt before external work and renews the same epoch outside the claim transaction", async () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    let time = 1_600;
    let waitCount = 0;
    const renewed = deferred<void>();
    const clock: CampaignPlayTurnServiceClock = {
      now: () => time,
      async wait(_delayMs, signal) {
        waitCount += 1;
        if (waitCount === 1) {
          time = 1_650;
          return;
        }
        renewed.resolve();
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      },
    };
    let providerCalls = 0;
    const service = createCampaignPlayTurnService({
      handle,
      owner: "worker-heartbeat",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock,
      resolveStage: ({ stage }) => stage === "admitted"
        ? {
            kind: "external",
            async execute() {
              providerCalls += 1;
              expect(handle.sqlite.prepare(`SELECT status, worker_epoch AS workerEpoch
                FROM campaign_play_model_stages WHERE turn_id = 'turn-opening'`).get())
                .toEqual({ status: "started", workerEpoch: 1 });
              const observer = openCampaignPlayDatabase(campaignId);
              try {
                expect(observer.sqlite.prepare(`SELECT status FROM campaign_play_model_stages
                  WHERE turn_id = 'turn-opening'`).get()).toEqual({ status: "started" });
                observer.sqlite.exec("BEGIN IMMEDIATE");
                observer.sqlite.exec("ROLLBACK");
              } finally {
                observer.close();
              }
              await renewed.promise;
              return {
                commit({ token, completedAt }) {
                  repository.acceptModelArtifact({
                    token,
                    artifact: { plan: "renewed" },
                    evidence: executionEvidence(),
                    mutationDomain: "runtime",
                    acceptedAt: completedAt,
                    mutationId: "planner-accepted-after-renewal",
                  });
                  return undefined;
                },
              };
            },
          }
        : null,
    });

    const result = await service.runNextStage("turn-opening");

    expect(providerCalls).toBe(1);
    expect(result.turn.stage).toBe("planned");
    expect(result.telemetry).toEqual({
      turnId: "turn-opening",
      stage: "admitted",
      progress: "interpreting",
      workerEpoch: 1,
      attempt: 1,
      queueTimeMs: 100,
      stageTimeMs: 50,
      leaseRenewals: 1,
      outcome: "advanced",
    });
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_model_stages WHERE turn_id = 'turn-opening'`).get())
      .toEqual({ count: 1 });
    expect(handle.sqlite.prepare(`SELECT kind FROM campaign_play_runtime_events
      WHERE turn_id = 'turn-opening' ORDER BY sequence`).all()).toEqual([
      { kind: "turn_admitted" },
      { kind: "worker_claimed" },
      { kind: "worker_lease_renewed" },
      { kind: "stage_accepted" },
    ]);
    expect(durableTiming(handle)).toEqual({
      queueTimeMs: 100,
      stageTimeMs: 50,
      leaseRenewals: 1,
    });
    closePlay(handle);
    const reopened = openPlay();
    expect(durableTiming(reopened)).toEqual({
      queueTimeMs: 100,
      stageTimeMs: 50,
      leaseRenewals: 1,
    });
  });

  it("keeps an asynchronous deterministic stage alive past its initial lease deadline", async () => {
    const { handle, state } = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(handle);
    repository.admitTurn(openingInput(state));
    const plannerToken = repository.claimStage({
      turnId: "turn-opening",
      expectedStage: "admitted",
      observedEpoch: 0,
      owner: "planner-worker",
      claimedAt: 1_600,
      leaseExpiresAt: 1_800,
      mutationId: "planner-claimed-before-deterministic-heartbeat",
    });
    repository.acceptModelArtifact({
      token: plannerToken,
      artifact: { plan: "accepted" },
      evidence: executionEvidence(),
      mutationDomain: "runtime",
      acceptedAt: 1_600,
      mutationId: "planner-accepted-before-deterministic-heartbeat",
    });
    let time = 1_700;
    let waitCount = 0;
    const renewed = deferred<void>();
    const clock: CampaignPlayTurnServiceClock = {
      now: () => time,
      async wait(_delayMs, signal) {
        waitCount += 1;
        if (waitCount <= 5) {
          time += 50;
          return;
        }
        renewed.resolve();
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      },
    };
    const stageState: { signal: AbortSignal | null } = { signal: null };
    const service = createCampaignPlayTurnService({
      handle,
      owner: "deterministic-heartbeat-worker",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock,
      resolveStage: ({ stage }) => stage === "planned"
        ? {
            kind: "deterministic",
            ready: () => true,
            async execute({ token, signal }) {
              stageState.signal = signal;
              expect(signal.aborted).toBe(false);
              await renewed.promise;
              expect(time).toBeGreaterThan(1_900);
              expect(token.expiresAt).toBe(2_150);
              repository.commitDeterministic({
                token,
                transition: "primary_settled",
                worldVersionAdvance: 0,
                committedAt: time,
                mutationId: "primary-settled-after-deterministic-heartbeat",
              });
            },
          }
        : null,
    });

    const result = await service.runNextStage("turn-opening");

    expect(result.turn.stage).toBe("primary_settled");
    expect(result.telemetry).toMatchObject({
      stage: "planned",
      workerEpoch: 2,
      attempt: null,
      queueTimeMs: 100,
      stageTimeMs: 250,
      leaseRenewals: 5,
      outcome: "advanced",
    });
    expect(stageState.signal?.aborted).toBe(true);
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_runtime_events
      WHERE turn_id = 'turn-opening' AND kind = 'worker_lease_renewed'`).get())
      .toEqual({ count: 5 });
  });

  it("lets one of two services invoke the external stage and settle one artifact", async () => {
    const fixture = createOpeningReadyCampaign();
    createCampaignPlayTurnRepository(fixture.handle).admitTurn(openingInput(fixture.state));
    const peer = openPlay();
    const firstClock = controlledClock(1_600);
    const secondClock = controlledClock(1_600);
    let providerCalls = 0;
    const first = createCampaignPlayTurnService({
      handle: fixture.handle,
      owner: "worker-one",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: firstClock.clock,
      resolveStage: acceptingResolver(fixture.handle, () => { providerCalls += 1; }),
    });
    const second = createCampaignPlayTurnService({
      handle: peer,
      owner: "worker-two",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: secondClock.clock,
      resolveStage: acceptingResolver(peer, () => { providerCalls += 1; }),
    });

    const results = await Promise.all([
      first.runNextStage("turn-opening"),
      second.runNextStage("turn-opening"),
    ]);

    expect(providerCalls).toBe(1);
    expect(results.some((result) => result.turn.stage === "planned")).toBe(true);
    expect(fixture.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_model_stages WHERE status = 'accepted'`).get()).toEqual({ count: 1 });
    expect(fixture.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_runtime_events WHERE kind = 'worker_claimed'`).get()).toEqual({ count: 1 });
  });

  it("revalidates a stale ready snapshot when another worker advances before claim", async () => {
    const fixture = createOpeningReadyCampaign();
    createCampaignPlayTurnRepository(fixture.handle).admitTurn(openingInput(fixture.state));
    const peer = openPlay();
    const peerRepository = createCampaignPlayTurnRepository(peer);
    let providerCalls = 0;
    const service = createCampaignPlayTurnService({
      handle: fixture.handle,
      owner: "worker-stale-ready",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: controlledClock(1_600).clock,
      resolveStage: ({ stage }) => {
        if (stage !== "admitted") return null;
        const token = peerRepository.claimStage({
          turnId: "turn-opening",
          expectedStage: "admitted",
          observedEpoch: 0,
          owner: "worker-peer-winner",
          claimedAt: 1_600,
          leaseExpiresAt: 1_800,
          mutationId: "peer-winner-claimed",
        });
        peerRepository.acceptModelArtifact({
          token,
          artifact: { plan: "peer-won" },
          evidence: executionEvidence(),
          mutationDomain: "runtime",
          acceptedAt: 1_600,
          mutationId: "peer-winner-accepted",
        });
        return {
          kind: "external",
          async execute() {
            providerCalls += 1;
            throw new Error("unreachable");
          },
        };
      },
    });

    const result = await service.runNextStage("turn-opening");

    expect(result.turn.stage).toBe("planned");
    expect(result.telemetry).toBeNull();
    expect(providerCalls).toBe(0);
    expect(peerRepository.loadAcceptedModelArtifact("turn-opening", "opening_planner"))
      .toMatchObject({ artifact: { plan: "peer-won" }, workerEpoch: 1 });
  });

  it("surfaces an unexpected external handler defect without reclassifying it", async () => {
    const executeFixture = createOpeningReadyCampaign();
    const executeRepository = createCampaignPlayTurnRepository(executeFixture.handle);
    executeRepository.admitTurn(openingInput(executeFixture.state));
    const executeDefect = new TypeError("handler defect");
    const executeService = createCampaignPlayTurnService({
      handle: executeFixture.handle,
      owner: "worker-execute-defect",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: controlledClock(1_600).clock,
      resolveStage: ({ stage }) => stage === "admitted"
        ? {
            kind: "external",
            async execute() {
              throw executeDefect;
            },
          }
        : null,
    });

    await expect(executeService.runNextStage("turn-opening")).rejects.toBe(executeDefect);
    expect(executeRepository.loadRecoveryState("turn-opening", 1_600).kind)
      .toBe("external_in_flight");
  });

  it("records a typed external interruption and requires explicit resume", async () => {
    const fixture = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(fixture.handle);
    repository.admitTurn(openingInput(fixture.state));
    const service = createCampaignPlayTurnService({
      handle: fixture.handle,
      owner: "worker-provider-interruption",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: controlledClock(1_600).clock,
      resolveStage: ({ stage }) => stage === "admitted"
        ? {
            kind: "external",
            async execute() {
              throw new CampaignPlayExternalStageInterruption({
                actualProviderId: "test-provider",
                actualModel: "planner",
                actualStrategy: "strict_object",
                inputTokens: null,
                outputTokens: null,
                durationMs: 50,
                finishReason: null,
                schemaOutcome: "transport_error",
                errorCode: "provider_unavailable",
              });
            },
          }
        : null,
    });

    const result = await service.runNextStage("turn-opening");

    expect(result.telemetry?.outcome).toBe("interrupted");
    expect(result.recovery).toMatchObject({
      kind: "explicit_resume_required",
      workerEpoch: 1,
      attempt: 1,
      errorCode: "provider_unavailable",
    });
  });

  it("surfaces an active-token stage defect without reclassifying it as stale", async () => {
    const commitFixture = createOpeningReadyCampaign();
    const commitRepository = createCampaignPlayTurnRepository(commitFixture.handle);
    commitRepository.admitTurn(openingInput(commitFixture.state));
    const stageDefect = new CampaignPlayTurnRepositoryError(
      "turn_stage_invalid",
      "active token artifact is invalid",
    );
    const commitService = createCampaignPlayTurnService({
      handle: commitFixture.handle,
      owner: "worker-commit-defect",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: controlledClock(1_600).clock,
      resolveStage: ({ stage }) => stage === "admitted"
        ? {
            kind: "external",
            async execute() {
              return {
                commit() {
                  throw stageDefect;
                },
              };
            },
          }
        : null,
    });

    await expect(commitService.runNextStage("turn-opening")).rejects.toBe(stageDefect);
    expect(commitRepository.loadRecoveryState("turn-opening", 1_600).kind)
      .toBe("external_in_flight");
  });

  it("rejects a non-synchronous completion result before it can outlive the heartbeat", async () => {
    const fixture = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(fixture.handle);
    repository.admitTurn(openingInput(fixture.state));
    const service = createCampaignPlayTurnService({
      handle: fixture.handle,
      owner: "worker-async-completion",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: controlledClock(1_600).clock,
      resolveStage: ({ stage }) => stage === "admitted"
        ? {
            kind: "external",
            async execute() {
              return {
                commit() {
                  return Promise.resolve() as never;
                },
              };
            },
          }
        : null,
    });

    await expect(service.runNextStage("turn-opening")).rejects.toMatchObject({
      code: "turn_service_invalid",
    });
    expect(repository.loadRecoveryState("turn-opening", 1_600).kind)
      .toBe("external_in_flight");
  });

  it("reports a stalled stage when completion only renews the same lease authority", async () => {
    const fixture = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(fixture.handle);
    repository.admitTurn(openingInput(fixture.state));
    const service = createCampaignPlayTurnService({
      handle: fixture.handle,
      owner: "worker-renew-only",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: controlledClock(1_600).clock,
      resolveStage: ({ stage }) => stage === "admitted"
        ? {
            kind: "external",
            async execute() {
              return {
                commit({ token }) {
                  repository.renewLease({
                    token,
                    renewedAt: 1_650,
                    leaseExpiresAt: 1_850,
                    mutationId: "renewed-without-settlement",
                  });
                  return undefined;
                },
              };
            },
          }
        : null,
    });

    await expect(service.runNextStage("turn-opening")).rejects.toMatchObject({
      code: "turn_stage_stalled",
    });
    expect(repository.loadRecoveryState("turn-opening", 1_650)).toMatchObject({
      kind: "external_in_flight",
      token: { epoch: 1, expiresAt: 1_850 },
    });
  });

  it("discovers external work without invoking it, interrupts expiry, and invokes only explicit resume", async () => {
    const fixture = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(fixture.handle);
    repository.admitTurn(openingInput(fixture.state));
    const time = controlledClock(1_550);
    let providerCalls = 0;
    const discovery = createCampaignPlayTurnService({
      handle: fixture.handle,
      owner: "startup-worker",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: time.clock,
      resolveStage: acceptingResolver(fixture.handle, () => { providerCalls += 1; }),
    });
    expect((await discovery.recoverActiveTurn())?.recovery.kind).toBe("external_ready");
    expect(providerCalls).toBe(0);
    const deadToken = repository.claimStage({
      turnId: "turn-opening",
      expectedStage: "admitted",
      observedEpoch: 0,
      owner: "dead-worker",
      claimedAt: 1_600,
      leaseExpiresAt: 1_650,
      mutationId: "dead-worker-claimed",
    });
    repository.renewLease({
      token: deadToken,
      renewedAt: 1_620,
      leaseExpiresAt: 1_670,
      mutationId: "dead-worker-renewed",
    });
    closePlay(fixture.handle);

    const reopened = openPlay();
    time.set(1_700);
    const recovered = createCampaignPlayTurnService({
      handle: reopened,
      owner: "restart-worker",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: time.clock,
      resolveStage: acceptingResolver(reopened, () => { providerCalls += 1; }),
    });
    const interrupted = await recovered.recoverActiveTurn();
    expect(interrupted?.recovery).toMatchObject({
      kind: "explicit_resume_required",
      workerEpoch: 1,
      attempt: 1,
      attemptStartedAt: 1_600,
      errorCode: "worker_lease_lost",
    });
    expect(interrupted?.turn.stage).toBe("interrupted");
    expect(interrupted?.telemetry).toMatchObject({
      attempt: 1,
      queueTimeMs: 100,
      stageTimeMs: 100,
      leaseRenewals: 1,
      outcome: "interrupted",
    });
    expect(createCampaignPlayTurnRepository(reopened).loadActiveTurn()?.turnId)
      .toBe("turn-opening");
    expect(providerCalls).toBe(0);

    time.set(1_710);
    const resumed = await recovered.resumeInterruptedStage({
      turnId: "turn-opening",
      interruptedStage: "admitted",
      observedEpoch: 1,
    });
    expect(providerCalls).toBe(1);
    expect(resumed.turn).toMatchObject({ stage: "planned", workerEpoch: 2 });
    expect(reopened.sqlite.prepare(`SELECT attempt, status, worker_epoch AS workerEpoch
      FROM campaign_play_model_stages ORDER BY attempt`).all()).toEqual([
      { attempt: 1, status: "interrupted", workerEpoch: 1 },
      { attempt: 2, status: "accepted", workerEpoch: 2 },
    ]);
  });

  it("rejects a late old-epoch completion after restart interruption and a successful resumed attempt", async () => {
    const fixture = createOpeningReadyCampaign();
    createCampaignPlayTurnRepository(fixture.handle).admitTurn(openingInput(fixture.state));
    const peer = openPlay();
    const time = controlledClock(1_600);
    const firstStarted = deferred<void>();
    const lateCompletion = deferred<{
      commit(input: { token: Parameters<ReturnType<typeof createCampaignPlayTurnRepository>["acceptModelArtifact"]>[0]["token"]; completedAt: number }): undefined;
    }>();
    let providerCalls = 0;
    const firstRepository = createCampaignPlayTurnRepository(fixture.handle);
    const first = createCampaignPlayTurnService({
      handle: fixture.handle,
      owner: "worker-old",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: time.clock,
      resolveStage: ({ stage }) => stage === "admitted"
        ? {
            kind: "external",
            async execute() {
              providerCalls += 1;
              firstStarted.resolve();
              return lateCompletion.promise;
            },
          }
        : null,
    });
    const oldRun = first.runNextStage("turn-opening");
    await firstStarted.promise;

    time.set(1_800);
    const peerRepository = createCampaignPlayTurnRepository(peer);
    const second = createCampaignPlayTurnService({
      handle: peer,
      owner: "worker-new",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: time.clock,
      resolveStage: acceptingResolver(peer, () => { providerCalls += 1; }),
    });
    expect((await second.recoverActiveTurn())?.recovery.kind).toBe("explicit_resume_required");
    time.set(1_810);
    const resumed = await second.resumeInterruptedStage({
      turnId: "turn-opening",
      interruptedStage: "admitted",
      observedEpoch: 1,
    });
    expect(resumed.turn.stage).toBe("planned");
    const beforeLate = peer.sqlite.prepare(`SELECT
        (SELECT runtime_revision FROM campaign_play_states WHERE campaign_id = ?) AS runtimeRevision,
        (SELECT COUNT(*) FROM campaign_play_runtime_events WHERE campaign_id = ?) AS runtimeEvents,
        (SELECT COUNT(*) FROM campaign_play_turn_events WHERE turn_id = 'turn-opening') AS turnEvents,
        (SELECT COUNT(*) FROM campaign_play_model_stages WHERE status = 'accepted') AS accepted`)
      .get(campaignId, campaignId);
    lateCompletion.resolve({
      commit({ token, completedAt }) {
        firstRepository.acceptModelArtifact({
          token,
          artifact: { plan: "late" },
          evidence: executionEvidence(),
          mutationDomain: "runtime",
          acceptedAt: completedAt,
          mutationId: "late-old-epoch-artifact",
        });
        return undefined;
      },
    });
    const late = await oldRun;
    expect(late.turn.stage).toBe("planned");
    expect(late.telemetry).toMatchObject({
      workerEpoch: 1,
      attempt: 1,
      outcome: "stale",
    });
    expect(providerCalls).toBe(2);
    expect(peer.sqlite.prepare(`SELECT
        (SELECT runtime_revision FROM campaign_play_states WHERE campaign_id = ?) AS runtimeRevision,
        (SELECT COUNT(*) FROM campaign_play_runtime_events WHERE campaign_id = ?) AS runtimeEvents,
        (SELECT COUNT(*) FROM campaign_play_turn_events WHERE turn_id = 'turn-opening') AS turnEvents,
        (SELECT COUNT(*) FROM campaign_play_model_stages WHERE status = 'accepted') AS accepted`)
      .get(campaignId, campaignId)).toEqual(beforeLate);
    expect(peerRepository.loadAcceptedModelArtifact("turn-opening", "opening_planner"))
      .toMatchObject({ attempt: 2, workerEpoch: 2, artifact: { plan: "ready" } });
  });

  it("continues a committed deterministic stage once after reopen and fails closed without its artifact", async () => {
    const fixture = createOpeningReadyCampaign();
    const repository = createCampaignPlayTurnRepository(fixture.handle);
    repository.admitTurn(openingInput(fixture.state));
    const plannerToken = repository.claimStage({
      turnId: "turn-opening",
      expectedStage: "admitted",
      observedEpoch: 0,
      owner: "planner-worker",
      claimedAt: 1_600,
      leaseExpiresAt: 1_800,
      mutationId: "planner-claimed",
    });
    repository.acceptModelArtifact({
      token: plannerToken,
      artifact: { plan: "committed" },
      evidence: executionEvidence(),
      mutationDomain: "runtime",
      acceptedAt: 1_700,
      mutationId: "planner-accepted",
    });
    closePlay(fixture.handle);

    const reopened = openPlay();
    const recoveredRepository = createCampaignPlayTurnRepository(reopened);
    const time = controlledClock(1_800);
    let deterministicCalls = 0;
    let providerCalls = 0;
    const service = createCampaignPlayTurnService({
      handle: reopened,
      owner: "deterministic-worker",
      leaseDurationMs: 200,
      heartbeatIntervalMs: 50,
      clock: time.clock,
      resolveStage: ({ stage }) => {
        if (stage === "planned") {
          return {
            kind: "deterministic",
            ready: ({ artifacts }) => artifacts.load("opening_planner")?.artifactHash !== undefined,
            execute({ token }) {
              deterministicCalls += 1;
              recoveredRepository.commitDeterministic({
                token,
                transition: "primary_settled",
                worldVersionAdvance: 0,
                committedAt: time.clock.now(),
                mutationId: "primary-settled-by-recovery",
              });
            },
          };
        }
        if (stage === "primary_settled") {
          return {
            kind: "deterministic",
            ready: () => false,
            execute() {
              throw new Error("unreachable");
            },
          };
        }
        providerCalls += 1;
        return null;
      },
    });

    const continued = await service.recoverActiveTurn();
    expect(continued?.turn.stage).toBe("primary_settled");
    expect(continued?.telemetry).toMatchObject({
      stage: "planned",
      workerEpoch: 2,
      attempt: null,
      outcome: "advanced",
    });
    expect(deterministicCalls).toBe(1);
    expect(providerCalls).toBe(0);
    expect(recoveredRepository.loadAcceptedModelArtifact("turn-opening", "opening_planner"))
      .toMatchObject({ artifact: { plan: "committed" }, attempt: 1 });
    const beforeClosed = reopened.sqlite.prepare(`SELECT runtime_revision AS runtimeRevision,
      next_runtime_event_sequence AS nextRuntimeEventSequence FROM campaign_play_states
      WHERE campaign_id = ?`).get(campaignId);
    expect((await service.recoverActiveTurn())?.recovery.kind).toBe("deterministic_ready");
    expect(deterministicCalls).toBe(1);
    expect(reopened.sqlite.prepare(`SELECT runtime_revision AS runtimeRevision,
      next_runtime_event_sequence AS nextRuntimeEventSequence FROM campaign_play_states
      WHERE campaign_id = ?`).get(campaignId)).toEqual(beforeClosed);
  });
});
