import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignPlayCharacterDraft, CampaignPlayNarratorPacket } from "@worldforge/shared";
import { closeDb } from "../db/index.js";
import {
  openCampaignWorldDatabase,
  type CampaignWorldDatabaseHandle,
} from "../campaign-world/world-database.js";
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
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import { createCampaignPlayCharacterService } from "./character-service.js";
import { bootstrapCampaignPlayPlayer } from "./player-bootstrap.js";
import {
  createCampaignPlayOpeningPlanner,
  deriveCampaignPlayOpeningSceneCandidateId,
  type CampaignPlayOpeningModelEvidence,
  type CampaignPlayOpeningProposal,
} from "./opening-planner.js";
import {
  CampaignPlayNarratorError,
  createCampaignPlayNarrator,
  type CampaignPlayNarratorModelEvidence,
} from "./narrator.js";
import { buildCampaignPlayOpeningOptions } from "./opening-options.js";
import { deriveCampaignPlayPublicHandle } from "./campaign-play-projection.js";
import { createCampaignPlayOpeningRuntime } from "./opening-runtime.js";
import { createCampaignPlayActorScheduler } from "./actor-scheduler.js";
import { createCampaignPlayVisibilityService } from "./visibility-service.js";
import type { CampaignPlayTurnServiceClock } from "./turn-service.js";

const CAMPAIGN_ID = "77777777-7777-4777-8777-777777777777";
const PLAYER_ID = "actor-player-opening";
const TEST_MODEL_PRICING = { known: true, currency: "USD", tokenUnit: 1_000_000,
  inputCostMicros: 1_000, outputCostMicros: 2_000, rounding: "ceil" } as const;
let root = "";
let previousCampaignsRoot: string | undefined;
let handles: Array<CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle> = [];

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-opening-runtime-"));
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

function track<T extends CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle>(handle: T): T {
  handles.push(handle);
  return handle;
}

function playerDraft(): CampaignPlayCharacterDraft {
  return {
    name: "Mara Venn",
    summary: "A careful mechanic following an impossible signal.",
    species: "Human",
    gender: "Woman",
    ageText: "Thirty-two",
    appearance: "Oil-dark coat, brass spectacles, and scarred hands.",
    biography: "Mara repairs instruments and follows the storm's impossible harmonics.",
    personality: {
      summary: "Patient, observant, and privately superstitious.",
      voice: "Precise sentences with dry understatement.",
      decisionStyle: "Measures immediate risk, then tests one variable.",
      worldview: "Every mystery leaves a physical trace.",
      contradictions: ["Distrusts prophecy but keeps omen journals"],
      mythology: "The mechanic who can tune the sky.",
      sampleLines: ["Give me a minute and a quiet room."],
    },
    motives: ["Understand the celestial signal"],
    beliefs: ["Machines tell the truth"],
    drives: ["Protect vulnerable witnesses"],
    traits: ["Observant", "Methodical"],
    skills: [{ name: "Instrument repair", tier: "Master" }],
    flaws: ["Overcommits to solvable details"],
    specialties: ["Acoustic mechanisms"],
    inventory: ["Repair roll"],
    signatureItems: ["Brass tuning fork"],
    source: { kind: "created", importMode: null, label: "Player-authored character" },
  };
}

function acceptWorld(): void {
  createMigratedCampaign(root, CAMPAIGN_ID);
  const handle = openCampaignWorldDatabase(CAMPAIGN_ID);
  try {
    const repository = createCampaignWorldRepository(handle);
    const source = sourceFixture(CAMPAIGN_ID);
    repository.acquireBuild({
      buildId: "build-opening-runtime",
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test-provider",
      model: "test-model",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, "build-opening-runtime");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b"
          ? { ...placement, locationId: "location-a" }
          : placement),
    };
    const review = repository.completeBuild({
      buildId: "build-opening-runtime",
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
    handle.close();
  }
}

function createPlayableCampaign() {
  acceptWorld();
  const handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
  const states = createCampaignPlayStateRepository(handle);
  const created = states.createState({ eventId: "opening-state-created", createdAt: 1_300 });
  const character = createCampaignPlayCharacterService().preparePlayerProfile({
    campaignId: CAMPAIGN_ID,
    actorId: PLAYER_ID,
    character: playerDraft(),
  });
  const bootstrapped = bootstrapCampaignPlayPlayer(handle, {
    character,
    expectedAcceptedWorldVersion: created.authority.acceptedWorldVersion,
    expectedAcceptedContentHash: created.authority.acceptedContentHash,
    expectedWorldVersion: created.authority.worldVersion,
    expectedRuntimeRevision: created.authority.runtimeRevision,
    createdAt: 1_400,
  });
  return { handle, state: bootstrapped.state };
}

function openingProposal(): CampaignPlayOpeningProposal {
  const actorPlans = ["a", "b", "c", "d", "e", "f"].map((suffix) => {
    const actorId = `actor-${suffix}`;
    const goalId = `goal-${suffix}`;
    const targets = suffix === "b"
      ? [
          { kind: "location" as const, id: "location-b" },
          { kind: "location" as const, id: "location-a" },
          { kind: "goal" as const, id: goalId },
        ]
      : [{ kind: "goal" as const, id: goalId }];
    const intent = {
      kind: "attempt" as const,
      targets,
      method: `Advance ${goalId} from the current situation`,
      stakes: "The actor's own objective",
    };
    return {
      actorId,
      primaryGoalId: goalId,
      cadenceMinutes: 15,
      steps: [{
        intent,
        observableTrace: suffix === "b"
          ? "Fresh sealing wax and torn binding thread mark a ledger removed in haste."
          : "Fresh work marks show that someone acted here recently.",
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 5 },
      }],
    };
  });
  return {
    start: {
      role: "A visitor on Bell Island",
      arrivalMode: "On foot",
      immediateSituation: "Signal keepers prepare for another route closure.",
    },
    scene: {
      candidateId: deriveCampaignPlayOpeningSceneCandidateId({
        locationId: "location-c",
        supportActorId: "actor-c",
        pressureId: "pressure-b",
        routeId: "route-c",
      }),
    },
    actorPlans,
    hiddenConsequence: {
      actorId: "actor-b",
      locationId: "location-a",
      summary: "A courier changes which ledger reaches the reef.",
      exposure: {
        channel: "local_aftermath",
        locationId: "location-a",
        validUntilWorldTimeMinutes: 4,
      },
    },
  };
}

const plannerEvidence: CampaignPlayOpeningModelEvidence = {
  requestedStrategy: "strict_object",
  actualStrategy: "native_schema",
  totalAttempts: 1,
  repairUsed: false,
  retryUsed: false,
  textFallbackUsed: false,
  responseModel: "test-opening-planner",
  finishReason: "stop",
  errorCode: null,
  inputTokens: 20,
  outputTokens: 30,
  totalTokens: 50,
};

const narratorEvidence: CampaignPlayNarratorModelEvidence = {
  requestedStrategy: "strict_object",
  actualStrategy: "native_schema",
  totalAttempts: 1,
  repairUsed: false,
  retryUsed: false,
  textFallbackUsed: false,
  actualProviderId: "test",
  responseModel: "test-narrator",
  finishReason: "stop",
  errorCode: null,
  inputTokens: 15,
  outputTokens: 25,
  totalTokens: 40,
  durationMs: 5,
  estimatedCostMicros: 1,
};

function fixedClock(initial: number) {
  let value = initial;
  const clock: CampaignPlayTurnServiceClock = {
    now: () => value,
    wait: (_delayMs, signal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  };
  return {
    clock,
    advance: () => { value += 10; },
    advanceBy: (durationMs: number) => { value += durationMs; },
  };
}

function count(handle: CampaignPlayDatabaseHandle, table: string): number {
  return (handle.sqlite.prepare(`SELECT count(*) AS value FROM ${table}
    WHERE campaign_id = ?`).get(CAMPAIGN_ID) as { value: number }).value;
}

function plannerFixture() {
  const compiler = createCampaignPlayOpeningPlanner();
  return {
    compile: compiler.compile,
    plan: vi.fn(async (request: Parameters<typeof compiler.plan>[0]) => {
      const proposal = openingProposal();
      if (request.startingConditions.mode === "chosen") {
        proposal.start = {
          role: request.startingConditions.role,
          arrivalMode: request.startingConditions.arrivalMode,
          immediateSituation: request.startingConditions.immediateSituation,
        };
        if (request.startingConditions.locationId === "location-a") {
          proposal.scene = {
            candidateId: deriveCampaignPlayOpeningSceneCandidateId({
              locationId: "location-a",
              supportActorId: "actor-b",
              pressureId: "pressure-a",
              routeId: "route-a",
            }),
          };
          const hiddenPlan = proposal.actorPlans.find((plan) => plan.actorId === "actor-c")!;
          hiddenPlan.steps[0]!.intent.targets.unshift({ kind: "location", id: "location-c" });
          hiddenPlan.steps[0]!.observableTrace =
            "A fresh warning notation contradicts the clear horizon.";
          proposal.hiddenConsequence = {
            actorId: "actor-c",
            locationId: "location-c",
            summary: "The bell tender changes which warning reaches the harbor.",
            exposure: {
              channel: "local_aftermath",
              locationId: "location-c",
              validUntilWorldTimeMinutes: 5,
            },
          };
        }
      }
      return compiler.compile(
        request.frame,
        request.startingConditions,
        proposal,
        plannerEvidence,
      );
    }),
  };
}

function narratorFixture(modelEvidence: CampaignPlayNarratorModelEvidence = narratorEvidence) {
  const compiler = createCampaignPlayNarrator();
  return {
    compile: compiler.compile,
    narrate: vi.fn(async (request: Parameters<typeof compiler.narrate>[0]) => {
      const packet = JSON.parse(request.packetBytes) as CampaignPlayNarratorPacket;
      return compiler.compile({
        narrationId: request.narrationId,
        packet,
        proposal: {
          actionDetails: packet.availableIntents.map(() => "the immediate situation"),
          beats: [
            { purpose: "orientation", text: "Rain rings against the signal tower as Mara reaches Bell Island." },
            { purpose: "consequence", text: "Ahead, signal keepers brace the route gate while warning bells gather pace." },
            { purpose: "action_handoff", text: "The open path and the waiting keeper leave a clear choice." },
          ],
        },
        createdAt: request.createdAt,
        modelEvidence,
      });
    }),
  };
}

function runtimeModels() {
  return {
    openingPlannerModel: {
      languageModel: {} as LanguageModel,
      requested: { providerId: "test", model: "test-opening-planner", strategy: "strict_object" as const, pricing: TEST_MODEL_PRICING },
      temperature: 0.2,
      maxOutputTokens: 4_096,
    },
    narratorModel: {
      languageModel: {} as LanguageModel,
      requested: { providerId: "test", model: "test-narrator", strategy: "strict_object" as const, pricing: TEST_MODEL_PRICING },
      temperature: 0.3,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 2_048,
      maximumTotalTokens: 3_048,
      maximumCostMicros: 10_000,
    },
  };
}

describe("Campaign Play opening runtime", () => {
  it.each(["delegate", "chosen"] as const)(
    "completes one real %s opening ledger and replays it idempotently",
    async (mode) => {
      const { handle, state } = createPlayableCampaign();
      const planner = plannerFixture();
      const narrator = narratorFixture();
      const time = fixedClock(1_500);
      const runtime = createCampaignPlayOpeningRuntime({
        handle,
        owner: `opening-worker-${mode}`,
        leaseDurationMs: 1_000,
        heartbeatIntervalMs: 100,
        clock: time.clock,
        ...runtimeModels(),
        openingPlanner: planner,
        narrator,
      });
      const canonicalLocationHandle = deriveCampaignPlayPublicHandle(
        "location",
        CAMPAIGN_ID,
        state.eligibility.projection.openingLocationId!,
      );
      const openingOption = mode === "chosen"
        ? buildCampaignPlayOpeningOptions(state).find((option) =>
            option.locationHandle !== canonicalLocationHandle
          )!
        : buildCampaignPlayOpeningOptions(state)[0]!;
      if (mode === "chosen") {
        expect(openingOption).toBeDefined();
        expect(openingOption.locationHandle).not.toBe(canonicalLocationHandle);
      }
      const chosen = {
        mode: "chosen" as const,
        locationHandle: openingOption.locationHandle,
        roleHandle: openingOption.roles[0]!.handle,
        arrivalModeHandle: openingOption.arrivalModes[0]!.handle,
        immediateSituationHandle: openingOption.immediateSituations[0]!.handle,
      };
      const request = {
        idempotencyKey: `opening-${mode}`,
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        startingConditions: mode === "chosen" ? chosen : { mode: "delegate" as const },
      };
      const admission = runtime.admitOpening({ request, submittedAt: 1_500 });
      for (let stage = 0; stage < 5; stage += 1) {
        time.advance();
        await runtime.runNextStage(admission.turnId);
      }

      const completed = runtime.loadTurn(admission.turnId)!;
      const finalState = createCampaignPlayStateRepository(handle).loadState()!;
      expect(completed.stage).toBe("completed");
      expect(completed.workerLeaseOwner).toBeNull();
      expect(finalState.authority).toMatchObject({ setupPhase: "ready" });
      expect(finalState.authority.openedAt).not.toBeNull();
      expect(planner.plan).toHaveBeenCalledTimes(1);
      expect(narrator.narrate).toHaveBeenCalledTimes(1);
      expect(count(handle, "campaign_play_actor_plans")).toBe(6);
      expect(count(handle, "campaign_play_actor_schedules")).toBe(6);
      expect(count(handle, "campaign_play_actor_jobs")).toBe(0);
      expect(count(handle, "campaign_play_actor_proposals")).toBe(0);
      expect(count(handle, "campaign_play_narrations")).toBe(1);
      expect(handle.sqlite.prepare(`SELECT status FROM campaign_play_narrations
        WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, admission.turnId))
        .toEqual({ status: "complete" });

      const beforeReplay = {
        commands: count(handle, "campaign_play_commands"),
        receipts: count(handle, "campaign_play_receipts"),
        runtimeEvents: count(handle, "campaign_play_runtime_events"),
      };
      expect(runtime.admitOpening({ request, submittedAt: 9_999 })).toEqual(admission);
      expect({
        commands: count(handle, "campaign_play_commands"),
        receipts: count(handle, "campaign_play_receipts"),
        runtimeEvents: count(handle, "campaign_play_runtime_events"),
      }).toEqual(beforeReplay);
    },
  );

  it("rejects an invalid chosen start before creating a turn or runtime event", () => {
    const { handle, state } = createPlayableCampaign();
    const before = createCampaignPlayStateRepository(handle).loadState()!;
    const runtime = createCampaignPlayOpeningRuntime({
      handle,
      owner: "opening-invalid-worker",
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 100,
      clock: fixedClock(1_500).clock,
      ...runtimeModels(),
      openingPlanner: plannerFixture(),
      narrator: narratorFixture(),
    });
    const turnsBefore = count(handle, "campaign_play_turns");
    const runtimeEventsBefore = count(handle, "campaign_play_runtime_events");

    let admissionError: unknown;
    try {
      runtime.admitOpening({
        submittedAt: 1_500,
        request: {
          idempotencyKey: "invalid-location",
          expectedWorldVersion: state.authority.worldVersion,
          expectedRuntimeRevision: state.authority.runtimeRevision,
          startingConditions: {
            mode: "chosen",
            locationHandle: "location_unknown",
            roleHandle: "role_unknown",
            arrivalModeHandle: "arrival_unknown",
            immediateSituationHandle: "situation_unknown",
          },
        },
      });
    } catch (cause) {
      admissionError = cause;
    }
    expect(admissionError).toMatchObject({ code: "opening_request_invalid" });
    expect(count(handle, "campaign_play_turns")).toBe(turnsBefore);
    expect(count(handle, "campaign_play_runtime_events")).toBe(runtimeEventsBefore);
    expect(createCampaignPlayStateRepository(handle).loadState()!.authority)
      .toEqual(before.authority);
  });

  it.each([
    ["provider", { ...narratorEvidence, actualProviderId: "other-provider" }],
    ["model", { ...narratorEvidence, responseModel: "other-model" }],
    ["attempt count", { ...narratorEvidence, totalAttempts: 2 }],
  ] as const)("interrupts narrator evidence with mismatched %s", async (_field, evidence) => {
    const { handle, state } = createPlayableCampaign();
    const time = fixedClock(1_750);
    const runtime = createCampaignPlayOpeningRuntime({
      handle,
      owner: "opening-evidence-worker",
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 100,
      clock: time.clock,
      ...runtimeModels(),
      openingPlanner: plannerFixture(),
      narrator: narratorFixture(evidence),
    });
    const admission = runtime.admitOpening({
      submittedAt: 1_750,
      request: {
        idempotencyKey: `opening-evidence-${evidence.totalAttempts}-${evidence.responseModel}`,
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
    });
    for (let stage = 0; stage < 5; stage += 1) {
      time.advance();
      await runtime.runNextStage(admission.turnId);
    }

    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      stage: "interrupted",
      interruptedStage: "visibility_projected",
      errorCode: "model_contract_invalid",
      resumeEligible: true,
    });
    expect(handle.sqlite.prepare(`SELECT status, error_code AS errorCode,
        actual_provider_id AS actualProviderId, actual_model AS actualModel
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'narrator'`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toMatchObject({
        status: "interrupted",
        errorCode: "model_contract_invalid",
        actualProviderId: evidence.actualProviderId,
        actualModel: evidence.responseModel,
      });
    expect(handle.sqlite.prepare(`SELECT status FROM campaign_play_narrations
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, admission.turnId))
      .toEqual({ status: "pending" });
  });

  it("preserves interrupted narrator provider identity and measured duration", async () => {
    const { handle, state } = createPlayableCampaign();
    const time = fixedClock(1_900);
    const base = narratorFixture();
    const interruptedEvidence: CampaignPlayNarratorModelEvidence = {
      ...narratorEvidence,
      actualProviderId: "other-provider",
      durationMs: 77,
      errorCode: "narration_invalid",
    };
    const runtime = createCampaignPlayOpeningRuntime({
      handle,
      owner: "opening-interrupted-evidence-worker",
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 100,
      clock: time.clock,
      ...runtimeModels(),
      openingPlanner: plannerFixture(),
      narrator: {
        compile: base.compile,
        narrate: vi.fn(async () => {
          throw new CampaignPlayNarratorError(
            "transport_interrupted",
            interruptedEvidence,
          );
        }),
      },
    });
    const admission = runtime.admitOpening({
      submittedAt: 1_900,
      request: {
        idempotencyKey: "opening-interrupted-evidence",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
    });
    for (let stage = 0; stage < 5; stage += 1) {
      time.advance();
      await runtime.runNextStage(admission.turnId);
    }

    expect(handle.sqlite.prepare(`SELECT actual_provider_id AS actualProviderId,
        actual_model AS actualModel, duration_ms AS durationMs, status
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'narrator'`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({
        actualProviderId: "other-provider",
        actualModel: "test-narrator",
        durationMs: 77,
        status: "interrupted",
      });
  });

  it.each(["planner", "narrator"] as const)(
    "persists a %s interruption and resumes the same ledger explicitly",
    async (failedStage) => {
      const { handle, state } = createPlayableCampaign();
      const plannerBase = plannerFixture();
      const narratorBase = narratorFixture();
      let plannerFailed = false;
      let narratorFailed = false;
      const planner = {
        compile: plannerBase.compile,
        plan: vi.fn(async (request: Parameters<typeof plannerBase.plan>[0]) => {
          if (failedStage === "planner" && !plannerFailed) {
            plannerFailed = true;
            throw new Error("planner transport interrupted");
          }
          return plannerBase.plan(request);
        }),
      };
      const narrator = {
        compile: narratorBase.compile,
        narrate: vi.fn(async (request: Parameters<typeof narratorBase.narrate>[0]) => {
          if (failedStage === "narrator" && !narratorFailed) {
            narratorFailed = true;
            throw new Error("narrator transport interrupted");
          }
          return narratorBase.narrate(request);
        }),
      };
      const time = fixedClock(2_000);
      const runtime = createCampaignPlayOpeningRuntime({
        handle,
        owner: `opening-resume-${failedStage}`,
        leaseDurationMs: 1_000,
        heartbeatIntervalMs: 100,
        clock: time.clock,
        ...runtimeModels(),
        openingPlanner: planner,
        narrator,
      });
      const admission = runtime.admitOpening({
        submittedAt: 2_000,
        request: {
          idempotencyKey: `interrupted-${failedStage}`,
          expectedWorldVersion: state.authority.worldVersion,
          expectedRuntimeRevision: state.authority.runtimeRevision,
          startingConditions: { mode: "delegate" },
        },
      });
      const stagesBeforeFailure = failedStage === "planner" ? 0 : 4;
      for (let stage = 0; stage < stagesBeforeFailure; stage += 1) {
        time.advance();
        await runtime.runNextStage(admission.turnId);
      }
      time.advance();
      const interruptedResult = await runtime.runNextStage(admission.turnId);
      expect(interruptedResult.turn).toMatchObject({
        turnId: admission.turnId,
        stage: "interrupted",
        interruptedStage: failedStage === "planner" ? "admitted" : "visibility_projected",
        resumeEligible: true,
      });
      const interrupted = runtime.loadTurn(admission.turnId)!;
      const packetBeforeResume = failedStage === "narrator"
        ? (handle.sqlite.prepare(`SELECT packet_json AS packetJson
            FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`)
            .get(CAMPAIGN_ID, admission.turnId) as { packetJson: string }).packetJson
        : null;

      time.advance();
      await runtime.resumeInterruptedStage({
        turnId: admission.turnId,
        interruptedStage: interrupted.interruptedStage!,
        observedEpoch: interrupted.workerEpoch,
      });
      const remainingStages = failedStage === "planner" ? 4 : 0;
      for (let stage = 0; stage < remainingStages; stage += 1) {
        time.advance();
        await runtime.runNextStage(admission.turnId);
      }

      expect(runtime.loadTurn(admission.turnId)).toMatchObject({
        turnId: admission.turnId,
        stage: "completed",
      });
      expect(planner.plan).toHaveBeenCalledTimes(failedStage === "planner" ? 2 : 1);
      expect(narrator.narrate).toHaveBeenCalledTimes(failedStage === "narrator" ? 2 : 1);
      if (packetBeforeResume !== null) {
        expect((handle.sqlite.prepare(`SELECT packet_json AS packetJson
          FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`)
          .get(CAMPAIGN_ID, admission.turnId) as { packetJson: string }).packetJson)
          .toBe(packetBeforeResume);
      }
      const rowsBeforeLateResume = count(handle, "campaign_play_runtime_events");
      await expect(runtime.resumeInterruptedStage({
        turnId: admission.turnId,
        interruptedStage: interrupted.interruptedStage!,
        observedEpoch: interrupted.workerEpoch,
      })).resolves.toMatchObject({ recovery: { kind: "completed" } });
      expect(count(handle, "campaign_play_runtime_events")).toBe(rowsBeforeLateResume);
    },
  );

  it("reopens the campaign after every durable stage without repeating model calls or ledger rows", async () => {
    const fixture = createPlayableCampaign();
    let handle = fixture.handle;
    const planner = plannerFixture();
    const narrator = narratorFixture();
    const time = fixedClock(3_000);
    const buildRuntime = (stage: number) => createCampaignPlayOpeningRuntime({
      handle,
      owner: `opening-restart-${stage}`,
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 100,
      clock: time.clock,
      ...runtimeModels(),
      openingPlanner: planner,
      narrator,
    });
    const admission = buildRuntime(0).admitOpening({
      submittedAt: 3_000,
      request: {
        idempotencyKey: "restart-every-stage",
        expectedWorldVersion: fixture.state.authority.worldVersion,
        expectedRuntimeRevision: fixture.state.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
    });
    let packetBytes: string | null = null;
    for (let stage = 0; stage < 5; stage += 1) {
      time.advance();
      await buildRuntime(stage).runNextStage(admission.turnId);
      if (stage === 3) {
        packetBytes = (handle.sqlite.prepare(`SELECT packet_json AS packetJson
          FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`)
          .get(CAMPAIGN_ID, admission.turnId) as { packetJson: string }).packetJson;
      }
      handle.close();
      handles = handles.filter((candidate) => candidate !== handle);
      handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    }

    expect(buildRuntime(6).loadTurn(admission.turnId)).toMatchObject({ stage: "completed" });
    expect(planner.plan).toHaveBeenCalledTimes(1);
    expect(narrator.narrate).toHaveBeenCalledTimes(1);
    expect(count(handle, "campaign_play_actor_plans")).toBe(6);
    expect(count(handle, "campaign_play_actor_schedules")).toBe(6);
    expect(count(handle, "campaign_play_narrations")).toBe(1);
    expect((handle.sqlite.prepare(`SELECT packet_json AS packetJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`)
      .get(CAMPAIGN_ID, admission.turnId) as { packetJson: string }).packetJson)
      .toBe(packetBytes);
  });

  it.each(["actor_validation", "visibility"] as const)(
    "recovers a post-primary %s defect on the same ledger after lease expiry",
    async (failurePoint) => {
      const { handle, state } = createPlayableCampaign();
      const planner = plannerFixture();
      const narrator = narratorFixture();
      const realScheduler = createCampaignPlayActorScheduler(handle);
      const realVisibility = createCampaignPlayVisibilityService(handle);
      const actorScheduler = failurePoint === "actor_validation"
        ? {
            ...realScheduler,
            validateOpeningActors: vi.fn(() => {
              throw new Error("injected actor validation defect");
            }),
          }
        : realScheduler;
      const visibility = failurePoint === "visibility"
        ? {
            projectTurn: vi.fn(() => {
              throw new Error("injected visibility defect");
            }),
          }
        : realVisibility;
      const time = fixedClock(4_000);
      const broken = createCampaignPlayOpeningRuntime({
        handle,
        owner: `opening-broken-${failurePoint}`,
        leaseDurationMs: 100,
        heartbeatIntervalMs: 20,
        clock: time.clock,
        ...runtimeModels(),
        openingPlanner: planner,
        narrator,
        actorScheduler,
        visibility,
      });
      const admission = broken.admitOpening({
        submittedAt: 4_000,
        request: {
          idempotencyKey: `post-primary-${failurePoint}`,
          expectedWorldVersion: state.authority.worldVersion,
          expectedRuntimeRevision: state.authority.runtimeRevision,
          startingConditions: { mode: "delegate" },
        },
      });
      const stagesBeforeDefect = failurePoint === "actor_validation" ? 2 : 3;
      for (let stage = 0; stage < stagesBeforeDefect; stage += 1) {
        time.advance();
        await broken.runNextStage(admission.turnId);
      }
      const stageBefore = broken.loadTurn(admission.turnId)!.stage;
      const schedulesBefore = count(handle, "campaign_play_actor_schedules");
      time.advance();
      await expect(broken.runNextStage(admission.turnId)).rejects.toThrow("injected");
      expect(broken.loadTurn(admission.turnId)!.stage).toBe(stageBefore);
      expect(count(handle, "campaign_play_actor_schedules")).toBe(schedulesBefore);

      time.advanceBy(101);
      const recovered = createCampaignPlayOpeningRuntime({
        handle,
        owner: `opening-recovered-${failurePoint}`,
        leaseDurationMs: 100,
        heartbeatIntervalMs: 20,
        clock: time.clock,
        ...runtimeModels(),
        openingPlanner: planner,
        narrator,
      });
      await recovered.recoverActiveTurn();
      const remainingStages = failurePoint === "actor_validation" ? 2 : 1;
      for (let stage = 0; stage < remainingStages; stage += 1) {
        time.advance();
        await recovered.runNextStage(admission.turnId);
      }
      expect(recovered.loadTurn(admission.turnId)).toMatchObject({
        turnId: admission.turnId,
        stage: "completed",
      });
      expect(planner.plan).toHaveBeenCalledTimes(1);
      expect(narrator.narrate).toHaveBeenCalledTimes(1);
      expect(count(handle, "campaign_play_actor_schedules")).toBe(6);
      expect(count(handle, "campaign_play_narrations")).toBe(1);
    },
  );

  it("supersedes one zero-mutation failed opening exactly once", async () => {
    const { handle, state } = createPlayableCampaign();
    const planner = plannerFixture();
    const realScheduler = createCampaignPlayActorScheduler(handle);
    const scheduler = {
      ...realScheduler,
      initializeOpeningActors: vi.fn(() => {
        throw new Error("injected pre-settlement defect");
      }),
    };
    const time = fixedClock(5_000);
    const broken = createCampaignPlayOpeningRuntime({
      handle,
      owner: "opening-failed-worker",
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 100,
      clock: time.clock,
      ...runtimeModels(),
      openingPlanner: planner,
      narrator: narratorFixture(),
      actorScheduler: scheduler,
    });
    const first = broken.admitOpening({
      submittedAt: 5_000,
      request: {
        idempotencyKey: "failed-opening",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
    });
    time.advance();
    await broken.runNextStage(first.turnId);
    const commandsBeforeFailure = count(handle, "campaign_play_commands");
    const schedulesBeforeFailure = count(handle, "campaign_play_actor_schedules");
    time.advance();
    await broken.runNextStage(first.turnId);
    expect(broken.loadTurn(first.turnId)).toMatchObject({
      stage: "failed",
      finalWorldVersion: state.authority.worldVersion,
    });
    expect(count(handle, "campaign_play_commands")).toBe(commandsBeforeFailure);
    expect(count(handle, "campaign_play_actor_schedules")).toBe(schedulesBeforeFailure);

    const current = createCampaignPlayStateRepository(handle).loadState()!;
    const successorRuntime = createCampaignPlayOpeningRuntime({
      handle,
      owner: "opening-successor-worker",
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 100,
      clock: time.clock,
      ...runtimeModels(),
      openingPlanner: plannerFixture(),
      narrator: narratorFixture(),
    });
    const successor = successorRuntime.admitOpening({
      submittedAt: 5_100,
      request: {
        idempotencyKey: "successor-opening",
        expectedWorldVersion: current.authority.worldVersion,
        expectedRuntimeRevision: current.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
    });
    expect(successorRuntime.loadTurn(successor.turnId)).toMatchObject({
      supersedesTurnId: first.turnId,
    });
    expect(() => successorRuntime.admitOpening({
      submittedAt: 5_101,
      request: {
        idempotencyKey: "second-successor",
        expectedWorldVersion: current.authority.worldVersion,
        expectedRuntimeRevision: current.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
    })).toThrow();
  });
});
