import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAMPAIGN_PLAY_LIMITS,
  type CampaignPlayCharacterDraft,
  type CampaignPlayNarratorPacket,
} from "@worldforge/shared";
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
import { createCampaignPlayOpeningRuntime } from "./opening-runtime.js";
import {
  CampaignPlayJudgeError,
  createCampaignPlayJudge,
  type CampaignPlayModelEvidence,
} from "./judge.js";
import { CampaignPlayGameMasterError, createCampaignPlayGameMaster } from "./game-master.js";
import {
  createCampaignPlayTurnRuntime,
  loadCampaignPlayPlayerActionAdmissionFrame,
} from "./turn-runtime.js";
import type { CampaignPlayTurnServiceClock } from "./turn-service.js";
import {
  createCampaignPlayActorScheduler,
  type CampaignPlayActorScheduler,
} from "./actor-scheduler.js";
import { createCampaignPlayActorReplanner } from "./actor-replanner.js";
import {
  createCampaignPlayActorProposalService,
  type CampaignPlayActorProposalService,
} from "./actor-proposal-service.js";
import { createCampaignPlayTurnRepository } from "./campaign-play-turn-repository.js";
import { createCampaignPlayReadModel } from "./campaign-play-read-model.js";
import {
  safeGenerateObject,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";

const CAMPAIGN_ID = "79797979-7979-4797-8797-797979797979";
const PLAYER_ID = "actor-player-turn-runtime";
const TEST_MODEL_PRICING = {
  known: true,
  currency: "USD",
  tokenUnit: 1_000_000,
  inputCostMicros: 1_000,
  outputCostMicros: 2_000,
  rounding: "ceil",
} as const;

let root = "";
let previousCampaignsRoot: string | undefined;
let handles: Array<CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle> = [];

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-turn-runtime-"));
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

function closeTracked(handle: CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle): void {
  handle.close();
  handles = handles.filter((candidate) => candidate !== handle);
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
      buildId: "build-turn-runtime",
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test-provider",
      model: "test-model",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, "build-turn-runtime");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b"
          ? { ...placement, locationId: "location-a" }
          : placement),
    };
    const review = repository.completeBuild({
      buildId: "build-turn-runtime",
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

function openingProposal(actorCadenceMinutes = 1): CampaignPlayOpeningProposal {
  const actorPlans = ["a", "b", "c"].map((suffix) => {
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
      cadenceMinutes: actorCadenceMinutes,
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
      goalId: "goal-b",
      locationId: "location-a",
      summary: "A courier changes which ledger reaches the reef.",
      observableTrace: "Fresh sealing wax and torn binding thread mark a ledger removed in haste.",
      exposure: {
        channel: "local_aftermath",
        locationId: "location-a",
        validUntilWorldTimeMinutes: 4,
      },
    },
  };
}

const openingPlannerEvidence: CampaignPlayOpeningModelEvidence = {
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

const openingNarratorEvidence: CampaignPlayNarratorModelEvidence = {
  requestedStrategy: "strict_object",
  actualStrategy: "native_schema",
  totalAttempts: 1,
  repairUsed: false,
  retryUsed: false,
  textFallbackUsed: false,
  actualProviderId: "test",
  responseModel: "test-opening-narrator",
  finishReason: "stop",
  errorCode: null,
  inputTokens: 15,
  outputTokens: 25,
  totalTokens: 40,
  durationMs: 5,
  estimatedCostMicros: 1,
};

const acceptedEvidence = (model: "test-judge" | "test-game-master"): CampaignPlayModelEvidence => ({
  requestedStrategy: "strict_object",
  actualProviderId: "test",
  actualStrategy: "native_schema",
  totalAttempts: 1,
  repairUsed: false,
  retryUsed: false,
  textFallbackUsed: false,
  responseModel: model,
  finishReason: "stop",
  errorCode: null,
  inputTokens: 20,
  outputTokens: 30,
  totalTokens: 50,
  durationMs: 5,
  estimatedCostMicros: 1,
});

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

function countForCampaign(handle: CampaignPlayDatabaseHandle, table: string): number {
  return (handle.sqlite.prepare(`SELECT count(*) AS value FROM ${table}
    WHERE campaign_id = ?`).get(CAMPAIGN_ID) as { value: number }).value;
}

function countForTurn(handle: CampaignPlayDatabaseHandle, table: string, turnId: string): number {
  return (handle.sqlite.prepare(`SELECT count(*) AS value FROM ${table}
    WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, turnId) as { value: number }).value;
}

function isCanonicalHash(value: string): boolean {
  return value.length === 64 && [...value].every((character) =>
    (character >= "0" && character <= "9") ||
    (character >= "a" && character <= "f"));
}

function openingPlannerFixture(actorCadenceMinutes = 1) {
  const compiler = createCampaignPlayOpeningPlanner();
  return {
    compile: compiler.compile,
    plan: vi.fn(async (request: Parameters<typeof compiler.plan>[0]) =>
      compiler.compile(
        request.frame,
        request.startingConditions,
        openingProposal(actorCadenceMinutes),
        openingPlannerEvidence,
      )),
  };
}

function openingNarratorFixture() {
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
            { purpose: "consequence", text: "Signal keepers brace the route gate while warning bells gather pace." },
            { purpose: "action_handoff", text: "The open path and the waiting keeper leave a clear choice." },
          ],
        },
        createdAt: request.createdAt,
        modelEvidence: openingNarratorEvidence,
      });
    }),
  };
}

function playerNarratorFixture() {
  const compiler = createCampaignPlayNarrator();
  const evidence: CampaignPlayNarratorModelEvidence = {
    ...openingNarratorEvidence,
    actualProviderId: "test",
    responseModel: "test-narrator",
  };
  return {
    compile: compiler.compile,
    narrate: vi.fn(async (request: Parameters<typeof compiler.narrate>[0]) => {
      const packet = JSON.parse(request.packetBytes) as CampaignPlayNarratorPacket;
      const clarification = packet.actionContext?.clarificationQuestion;
      const beats = clarification
        ? [{ purpose: "action_handoff" as const, text: clarification }]
        : [
            {
              purpose: "consequence" as const,
              text: `${packet.actionContext!.submittedText} meets the visible conditions at ${packet.currentLocation.name}.`,
            },
            {
              purpose: "action_handoff" as const,
              text: `The scene at ${packet.currentLocation.name} leaves another move open.`,
            },
          ];
      return compiler.compile({
        narrationId: request.narrationId,
        packet,
        proposal: {
          actionDetails: packet.availableIntents.map(() => "the immediate situation"),
          beats,
        },
        createdAt: request.createdAt,
        modelEvidence: evidence,
      });
    }),
  };
}

async function createReadyCampaignWithOpening(actorCadenceMinutes = 1) {
  acceptWorld();
  const handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
  const states = createCampaignPlayStateRepository(handle);
  const created = states.createState({ eventId: "turn-runtime-state-created", createdAt: 1_300 });
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
  const time = fixedClock(1_500);
  const opening = createCampaignPlayOpeningRuntime({
    handle,
    owner: "turn-runtime-opening-worker",
    leaseDurationMs: 1_000,
    heartbeatIntervalMs: 100,
    clock: time.clock,
    openingPlannerModel: {
      languageModel: {} as LanguageModel,
      requested: {
        providerId: "test",
        model: "test-opening-planner",
        strategy: "strict_object",
        pricing: TEST_MODEL_PRICING,
      },
      temperature: 0.2,
      maxOutputTokens: 4_096,
    },
    narratorModel: {
      languageModel: {} as LanguageModel,
      requested: {
        providerId: "test",
        model: "test-opening-narrator",
        strategy: "strict_object",
        pricing: TEST_MODEL_PRICING,
      },
      temperature: 0.3,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 2_048,
      maximumTotalTokens: 3_048,
      maximumCostMicros: 10_000,
    },
    openingPlanner: openingPlannerFixture(actorCadenceMinutes),
    narrator: openingNarratorFixture(),
  });
  const admitted = opening.admitOpening({
    request: {
      idempotencyKey: "completed-opening",
      expectedWorldVersion: bootstrapped.state.authority.worldVersion,
      expectedRuntimeRevision: bootstrapped.state.authority.runtimeRevision,
      startingConditions: { mode: "delegate" },
    },
    submittedAt: 1_500,
  });
  for (let stage = 0; stage < 5; stage += 1) {
    time.advance();
    await opening.runNextStage(admitted.turnId);
  }
  expect(opening.loadTurn(admitted.turnId)).toMatchObject({ stage: "completed" });
  return {
    handle,
    state: createCampaignPlayStateRepository(handle).loadState()!,
    openingTurnId: admitted.turnId,
  };
}

type Disposition = "deterministic" | "uncertain" | "impossible" | "clarification_required";

function judgeFixture(disposition: Disposition) {
  const compiler = createCampaignPlayJudge();
  let selectedChoice: {
    kind: "observe" | "move" | "contact" | "wait" | "attempt";
    targets: Array<{ handle: string; kind: "actor" | "location" | "route" | "pressure" }>;
  } | null = null;
  return {
    selectChoice(binding: typeof selectedChoice) {
      selectedChoice = binding;
    },
    judge: vi.fn(async (request: Parameters<ReturnType<typeof createCampaignPlayJudge>["judge"]>[0]) => {
      const choice = request.input.choiceHandle === null
        ? null
        : request.frame.visibleFacts.find((fact) => fact.handle === request.input.choiceHandle);
      const target = request.frame.visibleFacts.find((fact) =>
        fact.kind === "actor" && fact.handle !== request.frame.playerActorHandle);
      const useChoice = choice !== null && choice !== undefined;
      const noEffect = disposition === "impossible" || disposition === "clarification_required";
      const ruling = compiler.compile(request.frame, request.input, {
        kind: useChoice ? selectedChoice!.kind : target ? "contact" : "wait",
        targets: useChoice ? selectedChoice!.targets : !target ? [] : [{ handle: target.handle, kind: "actor" }],
        method: useChoice ? "Follow the selected opportunity" : target ? "Ask calmly" : "Wait and watch",
        stakes: "Learn what changes at the signal gate",
        disposition,
        citedVisibleFactHandles: [request.frame.locationHandle],
        resultBounds: noEffect
          ? { minimum: "no_effect", maximum: "no_effect" }
          : disposition === "uncertain"
            ? { minimum: "setback", maximum: "success" }
            : { minimum: "success", maximum: "success" },
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 2 },
        uncertainty: disposition === "uncertain"
          ? { kind: "check", dieSides: 20, difficulty: 10, modifierMinimum: -1, modifierMaximum: 1 }
          : { kind: "none" },
        reason: "The visible situation supports this ruling.",
        clarificationQuestion: disposition === "clarification_required"
          ? "Which signal do you mean?"
          : null,
      });
      return { ruling, rulingHash: "f".repeat(64), modelEvidence: acceptedEvidence("test-judge") };
    }),
  };
}

function gameMasterFixture(worldEventCount = 1, includeSubmittedText = false) {
  const compiler = createCampaignPlayGameMaster();
  return {
    plan: vi.fn(async (request: Parameters<ReturnType<typeof createCampaignPlayGameMaster>["plan"]>[0]) => {
      const playerHandle = request.frame.handleBindings.find((binding) =>
        binding.reference.kind === "actor" && binding.reference.id === PLAYER_ID)!.handle;
      const locationHandle = request.frame.handleBindings.find((binding) =>
        binding.reference.kind === "location" &&
        binding.handle === request.frame.visibleFacts.find((fact) =>
          fact.kind === "location")?.handle)!.handle;
      return {
        ...compiler.compile(
          request.frame,
          request.ruling,
          request.resolution,
          request.uncertaintyAuthority,
          {
            elapsedMinutes: 1,
            effects: Array.from({ length: worldEventCount }, (_, index) => ({
              kind: "record_world_event",
              eventClass: "dialogue",
              summary: includeSubmittedText
                ? `${request.ruling.normalizedIntent.originalText} (trace ${index + 1}).`
                : worldEventCount === 1
                ? "Mara tests the signal keepers' account against the ringing tower."
                : `Mara tests signal account ${index + 1} against the ringing tower.`,
              affectedHandles: [playerHandle, locationHandle],
            })),
          },
        ),
        modelEvidence: acceptedEvidence("test-game-master"),
      };
    }),
  };
}

function turnRuntime(
  handle: CampaignPlayDatabaseHandle,
  time: ReturnType<typeof fixedClock>,
  judge: NonNullable<Parameters<typeof createCampaignPlayTurnRuntime>[0]["judge"]>,
  gameMaster: NonNullable<Parameters<typeof createCampaignPlayTurnRuntime>[0]["gameMaster"]>,
  overrides: Partial<Parameters<typeof createCampaignPlayTurnRuntime>[0]> = {},
) {
  return createCampaignPlayTurnRuntime({
    handle,
    owner: "turn-runtime-worker",
    leaseDurationMs: 1_000,
    heartbeatIntervalMs: 100,
    uncertaintySeedKey: "turn-runtime-test-seed-key-with-32-bytes",
    clock: time.clock,
    judgeModel: {
      languageModel: {} as LanguageModel,
      requested: {
        providerId: "test",
        model: "test-judge",
        strategy: "strict_object",
        pricing: TEST_MODEL_PRICING,
      },
      temperature: 0.2,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 1_000,
      maximumTotalTokens: 2_000,
      maximumCostMicros: 10_000,
    },
    gameMasterModel: {
      languageModel: {} as LanguageModel,
      requested: {
        providerId: "test",
        model: "test-game-master",
        strategy: "strict_object",
        pricing: TEST_MODEL_PRICING,
      },
      temperature: 0.2,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 1_000,
      maximumTotalTokens: 2_000,
      maximumCostMicros: 10_000,
    },
    actorReplannerModel: {
      languageModel: {} as LanguageModel,
      requested: {
        providerId: "test",
        model: "test-actor-replanner",
        strategy: "strict_object",
        pricing: TEST_MODEL_PRICING,
      },
      temperature: 0.2,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 1_000,
      maximumTotalTokens: 2_000,
      maximumCostMicros: 10_000,
    },
    narratorModel: {
      languageModel: {} as LanguageModel,
      requested: {
        providerId: "test",
        model: "test-narrator",
        strategy: "strict_object",
        pricing: TEST_MODEL_PRICING,
      },
      temperature: 0.3,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 2_048,
      maximumTotalTokens: 3_048,
      maximumCostMicros: 10_000,
    },
    judge,
    gameMaster,
    narrator: playerNarratorFixture(),
    ...overrides,
  });
}

function admissionRequest(
  state: ReturnType<typeof createCampaignPlayStateRepository>["loadState"] extends () => infer T
    ? NonNullable<T>
    : never,
  idempotencyKey: string,
  text = "I ask the signal keeper what changed at the gate.",
) {
  return {
    idempotencyKey,
    expectedWorldVersion: state.authority.worldVersion,
    expectedRuntimeRevision: state.authority.runtimeRevision,
    source: "freeform" as const,
    text,
  };
}

function actorReplanProposalFromPrompt(prompt: string) {
  const startMarker = "ACTOR_FRAME\n";
  const endMarker = "\nEND_ACTOR_FRAME";
  const start = prompt.indexOf(startMarker);
  const end = prompt.indexOf(endMarker);
  if (start < 0 || end < 0) throw new Error("Actor frame markers are missing.");
  const frame = JSON.parse(prompt.slice(start + startMarker.length, end)) as {
    entities: Array<{ handle: string; kind: string; state: string | null }>;
  };
  const goal = frame.entities.find((entity) => entity.kind === "goal" && entity.state === "active");
  if (!goal) throw new Error("Actor replan frame requires one active goal.");
  const intent = {
    kind: "attempt" as const,
    targetHandles: [goal.handle],
    method: "Check the signal archive",
    stakes: "The harbor route remains uncertain",
  };
  return {
    goalHandle: goal.handle,
    cadenceMinutes: 15,
    priority: 4,
    intent,
    steps: [{
      intent,
      observableTrace: "Fresh archive tabs mark a recently checked signal ledger.",
      elapsedBounds: { minimumMinutes: 2, maximumMinutes: 10 },
    }],
  };
}

function actorReplanTrace(): SafeGenerateTrace {
  return {
    text: "private actor plan",
    cleanedText: "private actor plan",
    requestedMode: "auto",
    strategy: "native_schema",
    primaryStrategy: "native_schema",
    capability: {
      requestedMode: "auto",
      primaryStrategy: "native_schema",
      fallbackStrategy: "text_fallback",
      actualMode: "native_schema",
      reason: "test capability",
      providerId: "test",
      model: "test-actor-replanner",
    },
    usage: { inputTokens: 40, outputTokens: 25, totalTokens: 65 },
    response: { modelId: "test-actor-replanner" },
    finishReason: "stop",
  };
}

function forceFirstActorReplan(
  handle: CampaignPlayDatabaseHandle,
  time: ReturnType<typeof fixedClock>,
  turnId: string,
): string {
  const scheduler = createCampaignPlayActorScheduler(handle);
  const job = scheduler.listTurnJobs(turnId).find((candidate) => candidate.stage === "queued");
  if (!job) throw new Error("Actor replan fixture requires one queued job.");
  const repository = createCampaignPlayTurnRepository(handle);
  const turn = repository.loadTurn(turnId)!;
  time.advance();
  const claimedAt = time.clock.now();
  const token = repository.claimStage({
    turnId,
    expectedStage: "primary_settled",
    observedEpoch: turn.workerEpoch,
    owner: "actor-replan-fixture",
    claimedAt,
    leaseExpiresAt: claimedAt + 1_000,
    mutationId: `force-replan-claim:${turn.workerEpoch + 1}`,
  });
  repository.commitActorTransition({
    token,
    leaseMode: "live",
    worldVersionAdvance: 0,
    protectedPayloadHash: "a".repeat(64),
    committedAt: claimedAt,
    mutationId: `force-replan-plan-boundary:${job.jobId}`,
    mutate(context) {
      const updated = context.sqlite.prepare(`UPDATE campaign_play_actor_plans
        SET status = 'completed', updated_at = ?
        WHERE campaign_id = ? AND plan_id = ? AND status = 'active'`).run(
          claimedAt,
          context.campaignId,
          job.planId,
        );
      if (updated.changes !== 1) throw new Error("Actor replan fixture lost its active plan.");
    },
  });
  repository.commitDeterministic({
    token,
    transition: "actor_job_transitioned",
    worldVersionAdvance: 0,
    committedAt: claimedAt,
    mutationId: `force-replan-release:${job.jobId}`,
  });
  return job.jobId;
}

async function advanceToPrimarySettlement(
  runtime: ReturnType<typeof createCampaignPlayTurnRuntime>,
  time: ReturnType<typeof fixedClock>,
  turnId: string,
  noEffect = false,
) {
  const stages = noEffect ? 2 : 3;
  for (let stage = 0; stage < stages; stage += 1) {
    time.advance();
    await runtime.runNextStage(turnId);
  }
}

async function advanceUntilStage(
  runtime: ReturnType<typeof createCampaignPlayTurnRuntime>,
  time: ReturnType<typeof fixedClock>,
  turnId: string,
  expectedStage: "actors_settled" | "visibility_projected" | "completed",
) {
  for (let boundary = 0; boundary < 20; boundary += 1) {
    const current = runtime.loadTurn(turnId);
    if (current?.stage === expectedStage) return current;
    if (!current || current.stage === "failed" || current.stage === "interrupted") {
      throw new Error(`Turn stopped at ${current?.stage ?? "missing"} before ${expectedStage}.`);
    }
    time.advance();
    await runtime.runNextStage(turnId);
  }
  throw new Error(`Turn did not reach ${expectedStage} within twenty durable boundaries.`);
}

describe("Campaign Play player-action turn runtime", () => {
  it.each(["freeform", "suggested"] as const)(
    "freezes one real completed opening for %s admission",
    async (source) => {
    const { handle, state, openingTurnId } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_000);
    const judge = judgeFixture("deterministic");
    const gameMaster = gameMasterFixture();
    const runtime = turnRuntime(handle, time, judge, gameMaster);
    const completedNarration = handle.sqlite.prepare(`SELECT suggested_actions_json AS suggestedActionsJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND status = 'complete'
      ORDER BY completed_at DESC LIMIT 1`).get(CAMPAIGN_ID) as { suggestedActionsJson: string };
    const suggestion = JSON.parse(completedNarration.suggestedActionsJson)[0] as {
      choiceHandle: string;
      label: string;
    };
    const admitted = runtime.admitAction({
      request: source === "freeform"
        ? admissionRequest(state, "freeform-admission")
        : {
            idempotencyKey: "suggested-admission",
            expectedWorldVersion: state.authority.worldVersion,
            expectedRuntimeRevision: state.authority.runtimeRevision,
            source: "suggested" as const,
            choiceHandle: suggestion.choiceHandle,
          },
      submittedAt: 2_000,
    });
    const frame = loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(admitted.turnId)!);
    expect(frame).toMatchObject({
      sourceTurnId: openingTurnId,
      sourceNarrationId: expect.any(String),
      judgeInput: source === "freeform"
        ? { source: "freeform", choiceHandle: null }
        : { originalText: suggestion.label, source: "suggested", choiceHandle: suggestion.choiceHandle },
    });
    expect(isCanonicalHash(frame.sourceNarrationHash)).toBe(true);
    expect(isCanonicalHash(frame.sourcePacketHash)).toBe(true);
    expect(JSON.stringify(frame.visibleFacts)).not.toContain("location-c");
    expect(JSON.stringify(frame.visibleFacts)).not.toContain(PLAYER_ID);
    if (source === "suggested") {
      expect(frame.choiceBindings).toContainEqual(expect.objectContaining({
        handle: suggestion.choiceHandle,
      }));
    }
  });

  it("rejects invalid and stale admission before creating a turn or runtime event", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const runtime = turnRuntime(handle, fixedClock(2_100), judgeFixture("deterministic"), gameMasterFixture());
    const baseline = {
      turns: countForCampaign(handle, "campaign_play_turns"),
      runtimeEvents: countForCampaign(handle, "campaign_play_runtime_events"),
    };
    expect(() => runtime.admitAction({
      request: {
        idempotencyKey: "stale-suggestion",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: "choice_stale",
      },
      submittedAt: 2_100,
    })).toThrowError(expect.objectContaining({ code: "turn_request_invalid" }));
    expect(() => runtime.admitAction({
      request: {
        ...admissionRequest(state, "stale-version"),
        expectedWorldVersion: state.authority.worldVersion - 1,
      },
      submittedAt: 2_101,
    })).toThrowError(expect.objectContaining({ code: "turn_state_invalid" }));
    expect(() => runtime.admitAction({
      request: { ...admissionRequest(state, "invalid-text"), text: "  " },
      submittedAt: 2_102,
    })).toThrowError(expect.objectContaining({ code: "turn_request_invalid" }));
    expect({
      turns: countForCampaign(handle, "campaign_play_turns"),
      runtimeEvents: countForCampaign(handle, "campaign_play_runtime_events"),
    }).toEqual(baseline);
  });

  it.each(["deterministic", "uncertain"] as const)(
    "commits one exact actionable %s Judge/GM/Rulebook ledger atomically",
    async (disposition) => {
      const { handle, state } = await createReadyCampaignWithOpening();
      const time = fixedClock(2_200);
      const judge = judgeFixture(disposition);
      const gameMaster = gameMasterFixture();
      const runtime = turnRuntime(handle, time, judge, gameMaster);
      const initialVersion = state.authority.worldVersion;
      const admission = runtime.admitAction({
        request: admissionRequest(state, `actionable-${disposition}`),
        submittedAt: 2_200,
      });
      await advanceToPrimarySettlement(runtime, time, admission.turnId);

      const settled = runtime.loadTurn(admission.turnId)!;
      const finalState = createCampaignPlayStateRepository(handle).loadState()!;
      expect(settled).toMatchObject({
        stage: "primary_settled",
        baseWorldVersion: initialVersion,
      });
      expect(settled.finalWorldVersion).toBeNull();
      expect(finalState.authority.worldVersion).toBe(initialVersion + 1);
      expect(judge.judge).toHaveBeenCalledTimes(1);
      expect(gameMaster.plan).toHaveBeenCalledTimes(1);
      expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(2);
      expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBe(2);
      expect(countForTurn(handle, "campaign_play_events", admission.turnId)).toBe(2);
      const commands = handle.sqlite.prepare(`SELECT command_order AS commandOrder,
          command_kind AS commandKind, expected_world_version AS expectedWorldVersion
        FROM campaign_play_commands WHERE campaign_id = ? AND turn_id = ?
        ORDER BY command_order`).all(CAMPAIGN_ID, admission.turnId);
      expect(commands).toEqual([
        { commandOrder: 0, commandKind: "advance_world_time", expectedWorldVersion: initialVersion },
        { commandOrder: 1, commandKind: "record_world_event", expectedWorldVersion: initialVersion + 1 },
      ]);
      const receipts = handle.sqlite.prepare(`SELECT prior_world_version AS priorWorldVersion,
          result_world_version AS resultWorldVersion, applied_world_mutation AS appliedWorldMutation
        FROM campaign_play_receipts WHERE campaign_id = ? AND turn_id = ?
        ORDER BY prior_world_version`).all(CAMPAIGN_ID, admission.turnId);
      expect(receipts).toEqual([
        { priorWorldVersion: initialVersion, resultWorldVersion: initialVersion + 1, appliedWorldMutation: 1 },
        { priorWorldVersion: initialVersion + 1, resultWorldVersion: initialVersion + 1, appliedWorldMutation: 0 },
      ]);
      expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_runtime_events
        WHERE campaign_id = ? AND turn_id = ? AND kind = 'primary_settled'`)
        .get(CAMPAIGN_ID, admission.turnId)).toEqual({ value: 1 });
      expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_turn_events
        WHERE campaign_id = ? AND turn_id = ? AND event_type = 'turn.progressed'
          AND json_extract(payload_json, '$.progress') = 'world_acting'`)
        .get(CAMPAIGN_ID, admission.turnId)).toEqual({ value: 1 });
      if (disposition === "uncertain") {
        const artifact = handle.sqlite.prepare(`SELECT artifact_json AS artifactJson
          FROM campaign_play_model_stages
          WHERE campaign_id = ? AND turn_id = ? AND kind = 'judge' AND status = 'accepted'`)
          .get(CAMPAIGN_ID, admission.turnId) as { artifactJson: string };
        expect(JSON.parse(artifact.artifactJson)).toMatchObject({
          uncertaintyAuthority: { seedMaterial: expect.any(String), modifier: 0 },
          resolution: { kind: "rolled", dieSides: 20 },
        });
        expect(isCanonicalHash(JSON.parse(artifact.artifactJson).uncertaintyAuthority.seedMaterial))
          .toBe(true);
      }
    },
  );

  it("settles the exact current suggested action without Judge reinterpretation", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_300);
    const judge = judgeFixture("deterministic");
    const gameMaster = gameMasterFixture();
    const runtime = turnRuntime(handle, time, judge, gameMaster);
    const openingNarration = handle.sqlite.prepare(`SELECT suggested_actions_json AS suggestedActionsJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND status = 'complete'
      ORDER BY completed_at DESC LIMIT 1`).get(CAMPAIGN_ID) as { suggestedActionsJson: string };
    const suggestion = JSON.parse(openingNarration.suggestedActionsJson)[0] as {
      choiceHandle: string;
      label: string;
    };
    const admission = runtime.admitAction({
      request: {
        idempotencyKey: "current-suggested-action",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: suggestion.choiceHandle,
      },
      submittedAt: 2_300,
    });
    const frame = loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(admission.turnId)!);
    const binding = frame.choiceBindings.find((choice) => choice.handle === suggestion.choiceHandle)!;
    judge.selectChoice({ kind: binding.kind, targets: binding.targets });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "primary_settled" });
    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(gameMaster.plan).toHaveBeenCalledTimes(1);
    expect(judge.judge.mock.calls[0]![0].frame.sourceMoment).toBe(frame.sourceNarration.displayText);
    expect(gameMaster.plan.mock.calls[0]![0].frame.sourceMoment).toBe(frame.sourceNarration.displayText);
  });

  it("interrupts a current suggestion when Judge changes its frozen kind or targets", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_350);
    const judge = judgeFixture("deterministic");
    const gameMaster = gameMasterFixture();
    const runtime = turnRuntime(handle, time, judge, gameMaster);
    const openingNarration = handle.sqlite.prepare(`SELECT suggested_actions_json AS suggestedActionsJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND status = 'complete'
      ORDER BY completed_at DESC LIMIT 1`).get(CAMPAIGN_ID) as { suggestedActionsJson: string };
    const suggestion = JSON.parse(openingNarration.suggestedActionsJson)[0] as {
      choiceHandle: string;
    };
    const admission = runtime.admitAction({
      request: {
        idempotencyKey: "reinterpreted-suggested-action",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: suggestion.choiceHandle,
      },
      submittedAt: 2_350,
    });
    const frame = loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(admission.turnId)!);
    const binding = frame.choiceBindings.find((choice) => choice.handle === suggestion.choiceHandle)!;
    const wrongBinding = binding.kind === "wait"
      ? {
          kind: "observe" as const,
          targets: [{ handle: frame.sourcePacket.currentLocation.handle, kind: "location" as const }],
        }
      : { kind: "wait" as const, targets: [] };
    judge.selectChoice(wrongBinding);

    time.advance();
    const result = await runtime.runNextStage(admission.turnId);
    expect(result.turn).toMatchObject({
      stage: "interrupted",
      interruptedStage: "admitted",
      resumeEligible: true,
    });
    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(gameMaster.plan).not.toHaveBeenCalled();
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(0);
    expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBe(0);
    expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'game_master'`)
      .get(CAMPAIGN_ID, admission.turnId)).toEqual({ value: 0 });
  });

  it.each(["impossible", "clarification_required"] as const)(
    "settles %s as a zero-effect plan with no GM, command, receipt, or version advance",
    async (disposition) => {
      const { handle, state } = await createReadyCampaignWithOpening();
      const time = fixedClock(2_400);
      const judge = judgeFixture(disposition);
      const gameMaster = gameMasterFixture();
      const runtime = turnRuntime(handle, time, judge, gameMaster);
      const admission = runtime.admitAction({
        request: admissionRequest(state, `no-effect-${disposition}`),
        submittedAt: 2_400,
      });
      await advanceToPrimarySettlement(runtime, time, admission.turnId, true);

      expect(runtime.loadTurn(admission.turnId)).toMatchObject({
        stage: "primary_settled",
        baseWorldVersion: state.authority.worldVersion,
      });
      expect(runtime.loadTurn(admission.turnId)!.finalWorldVersion).toBeNull();
      expect(createCampaignPlayStateRepository(handle).loadState()!.authority.worldVersion)
        .toBe(state.authority.worldVersion);
      expect(judge.judge).toHaveBeenCalledTimes(1);
      expect(gameMaster.plan).not.toHaveBeenCalled();
      expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(0);
      expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBe(0);
      expect(countForTurn(handle, "campaign_play_events", admission.turnId)).toBe(0);
      expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_model_stages
        WHERE campaign_id = ? AND turn_id = ? AND kind = 'game_master'`)
        .get(CAMPAIGN_ID, admission.turnId)).toEqual({ value: 0 });
    },
  );

  it("reopens after accepted Judge and GM stages without repeating either provider or settlement", async () => {
    const fixture = await createReadyCampaignWithOpening();
    let handle = fixture.handle;
    const time = fixedClock(2_500);
    const judge = judgeFixture("deterministic");
    const gameMaster = gameMasterFixture();
    const buildRuntime = () => turnRuntime(handle, time, judge, gameMaster);
    const admission = buildRuntime().admitAction({
      request: admissionRequest(fixture.state, "reopen-action"),
      submittedAt: 2_500,
    });

    closeTracked(handle);
    handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    time.advance();
    await buildRuntime().runNextStage(admission.turnId);
    closeTracked(handle);
    handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    time.advance();
    await buildRuntime().runNextStage(admission.turnId);
    closeTracked(handle);
    handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    time.advance();
    await buildRuntime().runNextStage(admission.turnId);
    closeTracked(handle);
    handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));

    expect(buildRuntime().loadTurn(admission.turnId)).toMatchObject({ stage: "primary_settled" });
    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(gameMaster.plan).toHaveBeenCalledTimes(1);
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(2);
    expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBe(2);
    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(gameMaster.plan).toHaveBeenCalledTimes(1);
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(2);
  });

  it("persists a Judge timeout and resumes only through the exact observed epoch", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_600);
    const acceptedJudge = judgeFixture("deterministic");
    let interrupted = false;
    const judge = {
      judge: vi.fn(async (...args: Parameters<typeof acceptedJudge.judge>) => {
        if (!interrupted) {
          interrupted = true;
          throw new CampaignPlayJudgeError("stage_timeout", {
            ...acceptedEvidence("test-judge"),
            errorCode: "stage_timeout",
          });
        }
        return acceptedJudge.judge(...args);
      }),
    };
    const gameMaster = gameMasterFixture();
    const runtime = turnRuntime(handle, time, judge, gameMaster);
    const admission = runtime.admitAction({
      request: admissionRequest(state, "interrupted-judge"),
      submittedAt: 2_600,
    });
    time.advance();
    const first = await runtime.runNextStage(admission.turnId);
    expect(first.turn).toMatchObject({
      stage: "interrupted",
      interruptedStage: "admitted",
      errorCode: "stage_timeout",
      resumeEligible: true,
    });
    expect(handle.sqlite.prepare(`SELECT schema_outcome AS schemaOutcome, error_code AS errorCode
      FROM campaign_play_model_stages WHERE campaign_id = ? AND turn_id = ? AND kind = 'judge'
      ORDER BY attempt DESC LIMIT 1`).get(CAMPAIGN_ID, admission.turnId)).toEqual({
      schemaOutcome: "transport_error",
      errorCode: "stage_timeout",
    });
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(0);
    const stored = runtime.loadTurn(admission.turnId)!;
    const rowsBeforeLateResume = {
      runtimeEvents: countForTurn(handle, "campaign_play_runtime_events", admission.turnId),
      turnEvents: countForTurn(handle, "campaign_play_turn_events", admission.turnId),
    };
    await expect(runtime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "admitted",
      observedEpoch: stored.workerEpoch - 1,
    })).rejects.toMatchObject({ code: "turn_stage_invalid" });
    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect({
      runtimeEvents: countForTurn(handle, "campaign_play_runtime_events", admission.turnId),
      turnEvents: countForTurn(handle, "campaign_play_turn_events", admission.turnId),
    }).toEqual(rowsBeforeLateResume);

    time.advance();
    await runtime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "admitted",
      observedEpoch: stored.workerEpoch,
    });
    time.advance();
    await runtime.runNextStage(admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "primary_settled" });
    expect(judge.judge).toHaveBeenCalledTimes(2);
    expect(gameMaster.plan).toHaveBeenCalledTimes(1);
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(2);
  });

  it("persists a Game Master timeout and resumes the same accepted Judge ledger", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_650);
    const judge = judgeFixture("deterministic");
    const acceptedGameMaster = gameMasterFixture();
    let interrupted = false;
    const gameMaster = {
      plan: vi.fn(async (...args: Parameters<typeof acceptedGameMaster.plan>) => {
        if (!interrupted) {
          interrupted = true;
          throw new CampaignPlayGameMasterError("stage_timeout", {
            ...acceptedEvidence("test-game-master"),
            errorCode: "stage_timeout",
          });
        }
        return acceptedGameMaster.plan(...args);
      }),
    };
    const runtime = turnRuntime(handle, time, judge, gameMaster);
    const admission = runtime.admitAction({
      request: admissionRequest(state, "interrupted-game-master"),
      submittedAt: 2_650,
    });
    time.advance();
    await runtime.runNextStage(admission.turnId);
    time.advance();
    const firstGameMaster = await runtime.runNextStage(admission.turnId);
    expect(firstGameMaster.turn).toMatchObject({
      stage: "interrupted",
      interruptedStage: "judged",
      errorCode: "stage_timeout",
      resumeEligible: true,
    });
    expect(handle.sqlite.prepare(`SELECT schema_outcome AS schemaOutcome, error_code AS errorCode
      FROM campaign_play_model_stages WHERE campaign_id = ? AND turn_id = ? AND kind = 'game_master'
      ORDER BY attempt DESC LIMIT 1`).get(CAMPAIGN_ID, admission.turnId)).toEqual({
      schemaOutcome: "transport_error",
      errorCode: "stage_timeout",
    });
    const interruptedTurn = runtime.loadTurn(admission.turnId)!;
    time.advance();
    await runtime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "judged",
      observedEpoch: interruptedTurn.workerEpoch,
    });
    time.advance();
    await runtime.runNextStage(admission.turnId);
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "primary_settled" });
    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(gameMaster.plan).toHaveBeenCalledTimes(2);
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(2);
  });

  it("rolls back the entire primary Rulebook batch when settlement faults between commands", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_700);
    let faulted = false;
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      {
        injectRulebookFault(point) {
          if (!faulted && point.kind === "after_command" && point.commandIndex === 0) {
            faulted = true;
            throw new Error("injected settlement fault");
          }
        },
      },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "atomic-settlement-fault"),
      submittedAt: 2_700,
    });
    time.advance();
    await runtime.runNextStage(admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    time.advance();
    await expect(runtime.runNextStage(admission.turnId))
      .rejects.toThrow("injected settlement fault");

    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      stage: "planned",
      finalWorldVersion: null,
    });
    expect(createCampaignPlayStateRepository(handle).loadState()!.authority.worldVersion)
      .toBe(state.authority.worldVersion);
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(0);
    expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBe(0);
    expect(countForTurn(handle, "campaign_play_events", admission.turnId)).toBe(0);
    expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_runtime_events
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'primary_settled'`)
      .get(CAMPAIGN_ID, admission.turnId)).toEqual({ value: 0 });

    time.advanceBy(1_001);
    await runtime.recoverActiveTurn();
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "primary_settled" });
    expect(createCampaignPlayStateRepository(handle).loadState()!.authority.worldVersion)
      .toBe(state.authority.worldVersion + 1);
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(2);
    expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBe(2);
  });

  it("admits one frozen due set and settles actors in strict serial order before actors_settled", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(3_000);
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "serial-actor-settlement"),
      submittedAt: 3_000,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "primary_settled" });

    time.advance();
    await runtime.runNextStage(admission.turnId);
    const scheduler = createCampaignPlayActorScheduler(handle);
    const dueSet = scheduler.loadDueSet(admission.turnId);
    expect(dueSet).not.toBeNull();
    const expectedJobs = dueSet!.decisions.filter((decision) => decision.disposition !== "skip");
    expect(scheduler.listTurnJobs(admission.turnId)).toHaveLength(expectedJobs.length);
    expect(() => scheduler.validateTurnSettlement(admission.turnId))
      .toThrow("scheduler_job_invalid");

    let priorTerminalCount = scheduler.listTurnJobs(admission.turnId)
      .filter((job) => ["settled", "rejected", "deferred"].includes(job.stage)).length;
    let actorBoundaries = 0;
    while (runtime.loadTurn(admission.turnId)!.stage === "primary_settled") {
      time.advance();
      await runtime.runNextStage(admission.turnId);
      const jobs = scheduler.listTurnJobs(admission.turnId);
      const terminalCount = jobs
        .filter((job) => ["settled", "rejected", "deferred"].includes(job.stage)).length;
      expect(terminalCount - priorTerminalCount).toBeLessThanOrEqual(1);
      priorTerminalCount = terminalCount;
      actorBoundaries += 1;
      if (actorBoundaries > expectedJobs.length + 1) {
        throw new Error("Actor settlement exceeded the frozen serial boundary count.");
      }
    }

    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "actors_settled" });
    expect(scheduler.validateTurnSettlement(admission.turnId)).toHaveLength(expectedJobs.length);
    expect(actorBoundaries).toBe(expectedJobs.filter((decision) => decision.disposition === "wake").length + 1);
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_actor_proposals proposal
      JOIN campaign_play_actor_jobs job ON job.job_id = proposal.job_id
      WHERE proposal.campaign_id = ? AND job.turn_id = ? AND proposal.status = 'pending'`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({ count: 0 });
    expect(handle.sqlite.prepare(`SELECT exposure.channel,
        exposure.location_id AS locationId,
        exposure.valid_until_world_time_minutes AS validUntilWorldTimeMinutes
      FROM campaign_play_event_exposures exposure
      JOIN campaign_play_events event ON event.event_id = exposure.event_id
      JOIN campaign_play_commands command ON command.command_id = event.command_id
      WHERE exposure.campaign_id = ? AND event.turn_id = ?
        AND json_extract(command.causal_parent_json, '$.kind') = 'actor_job'`).all(
          CAMPAIGN_ID,
          admission.turnId,
        )).toEqual([
          {
            channel: "direct_perception",
            locationId: "location-c",
            validUntilWorldTimeMinutes: null,
          },
          {
            channel: "local_aftermath",
            locationId: "location-a",
            validUntilWorldTimeMinutes: 4,
          },
          {
            channel: "local_aftermath",
            locationId: "location-a",
            validUntilWorldTimeMinutes: 1_441,
          },
        ]);
  });

  it("admits a consecutive real action through grounded observation authority", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(7_000);
    const narrator = playerNarratorFixture();
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator },
    );
    const request = admissionRequest(state, "real-one-action-playtest");
    const admission = runtime.admitAction({ request, submittedAt: 7_000 });

    await advanceUntilStage(runtime, time, admission.turnId, "completed");

    const completed = runtime.loadTurn(admission.turnId)!;
    expect(completed).toMatchObject({
      stage: "completed",
      terminalReason: "action_resolved",
      workerLeaseOwner: null,
      workerLeaseExpiresAt: null,
    });
    expect(narrator.narrate).toHaveBeenCalledTimes(1);
    const narrationRow = handle.sqlite.prepare(`SELECT packet_json AS packetJson,
        beats_json AS beatsJson, suggested_actions_json AS suggestedActionsJson,
        effects_json AS effectsJson, status
      FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID,
        admission.turnId,
      ) as {
        packetJson: string;
        beatsJson: string;
        suggestedActionsJson: string;
        effectsJson: string;
        status: string;
      };
    const packet = JSON.parse(narrationRow.packetJson) as CampaignPlayNarratorPacket;
    const frozenAdmission = loadCampaignPlayPlayerActionAdmissionFrame(completed);
    expect(packet.sourceMoment).toBe(frozenAdmission.sourceNarration.displayText);
    expect(packet.actionContext).toMatchObject({
      submittedText: request.text,
      disposition: "deterministic",
      result: "success",
      clarificationQuestion: null,
    });
    expect(narrationRow.packetJson).not.toContain("The visible situation supports this ruling.");
    expect(JSON.parse(narrationRow.beatsJson)).toContainEqual(expect.objectContaining({
      text: expect.stringContaining(request.text),
    }));
    expect(JSON.parse(narrationRow.suggestedActionsJson)).toHaveLength(packet.availableIntents.length);
    expect(JSON.parse(narrationRow.effectsJson)).toEqual([
      { kind: "flash", beatId: expect.any(String) },
    ]);
    expect(narrationRow.status).toBe("complete");
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId))
      .toBeGreaterThanOrEqual(2);
    expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(1);
    expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_runtime_events
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'turn_completed'`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({ value: 1 });
    expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_turns
      WHERE campaign_id = ? AND turn_kind = 'player_action'`).get(CAMPAIGN_ID))
      .toEqual({ value: 1 });

    const telemetry = runtime.loadTelemetry(admission.turnId);
    expect(telemetry).toMatchObject({
      terminalReason: "action_resolved",
      costComplete: true,
      inputTokens: 55,
      outputTokens: 85,
      totalTokens: 140,
      estimatedCostMicros: 6,
    });
    expect(telemetry.modelAttempts.map((attempt) => attempt.kind).sort()).toEqual([
      "game_master",
      "judge",
      "narrator",
    ]);
    expect(telemetry.stageExecutions.every((stage) => stage.outcome === "advanced")).toBe(true);

    const nextState = createCampaignPlayStateRepository(handle).loadState()!;
    const nextRequest = admissionRequest(nextState, "real-second-action-playtest");
    const nextAdmission = runtime.admitAction({ request: nextRequest, submittedAt: 7_100 });

    expect(runtime.loadTurn(nextAdmission.turnId)).toMatchObject({
      stage: "admitted",
      terminalReason: null,
    });
    expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_turns
      WHERE campaign_id = ? AND turn_kind = 'player_action'`).get(
        CAMPAIGN_ID,
      )).toEqual({ value: 2 });
  });

  it("admits the next action when the public moment fills both observation windows", async () => {
    const { handle } = await createReadyCampaignWithOpening(10_000);
    const time = fixedClock(7_500);
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(7, true),
      { narrator: playerNarratorFixture() },
    );

    const actionTexts = [
      "Inspect the copper lantern alpha notch",
      "Inspect the copper lantern beta notch",
      "Inspect the copper lantern gamma notch",
    ];
    let firstObservationHandle: string | null = null;
    for (let index = 0; index < 3; index += 1) {
      const state = createCampaignPlayStateRepository(handle).loadState()!;
      const admission = runtime.admitAction({
        request: admissionRequest(
          state,
          `observation-window-${index + 1}`,
          actionTexts[index]!,
        ),
        submittedAt: time.clock.now(),
      });
      await advanceUntilStage(runtime, time, admission.turnId, "completed");
      if (index === 0) {
        const stored = handle.sqlite.prepare(`SELECT observation.public_entry_json AS publicEntryJson
          FROM campaign_play_observations observation
          JOIN campaign_play_events event ON event.event_id = observation.event_id
            AND event.campaign_id = observation.campaign_id
          WHERE observation.campaign_id = ? AND event.turn_id = ?
          ORDER BY observation.world_time_minutes, observation.observation_id LIMIT 1`).get(
            CAMPAIGN_ID,
            admission.turnId,
          ) as { publicEntryJson: string };
        firstObservationHandle = (JSON.parse(stored.publicEntryJson) as {
          observationHandle: string;
        }).observationHandle;
      }
      time.advance();
    }

    const state = createCampaignPlayStateRepository(handle).loadState()!;
    const admission = runtime.admitAction({
      request: admissionRequest(
        state,
        "observation-window-next-action",
        "Revisit the alpha notch on the copper lantern",
      ),
      submittedAt: time.clock.now(),
    });
    const frame = loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(admission.turnId)!);

    expect(firstObservationHandle).not.toBeNull();
    expect(frame.sourcePacket.newObservations.concat(frame.sourcePacket.continuity)
      .some((entry) => entry.observationHandle === firstObservationHandle)).toBe(false);
    expect(frame.visibleFacts).toContainEqual(expect.objectContaining({
      handle: firstObservationHandle,
      kind: "observation",
    }));
    expect(frame.authority.knownWorldEventIds.length).toBeGreaterThan(16);
    expect(frame.authority.knownWorldEventIds.length).toBeLessThanOrEqual(
      CAMPAIGN_PLAY_LIMITS.newObservations + CAMPAIGN_PLAY_LIMITS.continuityEntries,
    );
  });

  it.each([
    ["impossible", "action_impossible", null],
    ["clarification_required", "clarification_requested", "Which signal do you mean?"],
  ] as const)(
    "grounds completed %s narration in the accepted public Judge result",
    async (disposition, terminalReason, clarificationQuestion) => {
      const { handle, state } = await createReadyCampaignWithOpening();
      const time = fixedClock(7_250);
      const runtime = turnRuntime(
        handle,
        time,
        judgeFixture(disposition),
        gameMasterFixture(),
      );
      const request = admissionRequest(state, `grounded-${disposition}`);
      const admission = runtime.admitAction({ request, submittedAt: 7_250 });

      await advanceUntilStage(runtime, time, admission.turnId, "completed");

      expect(runtime.loadTurn(admission.turnId)).toMatchObject({
        stage: "completed",
        terminalReason,
      });
      const stored = handle.sqlite.prepare(`SELECT packet_json AS packetJson,
          beats_json AS beatsJson, effects_json AS effectsJson
        FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
          CAMPAIGN_ID,
          admission.turnId,
        ) as { packetJson: string; beatsJson: string; effectsJson: string };
      const packet = JSON.parse(stored.packetJson) as CampaignPlayNarratorPacket;
      expect(packet.actionContext).toMatchObject({
        submittedText: request.text,
        disposition,
        result: "no_effect",
        clarificationQuestion,
      });
      const beats = JSON.parse(stored.beatsJson) as Array<{ text: string }>;
      if (clarificationQuestion === null) {
        expect(beats).toContainEqual(expect.objectContaining({
          text: expect.stringContaining(request.text),
        }));
      } else {
        expect(beats.at(-1)?.text).toBe(clarificationQuestion);
        expect(JSON.parse(stored.effectsJson)).toEqual([
          { kind: "pause", beatId: expect.any(String) },
        ]);
      }
      expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_commands
        WHERE campaign_id = ? AND turn_id = ?
          AND json_extract(causal_parent_json, '$.kind') = 'turn'`).get(
            CAMPAIGN_ID,
            admission.turnId,
          )).toEqual({ value: 0 });
    },
  );

  it("reopens at visibility with byte-identical narrator input and zero mechanical replay", async () => {
    const fixture = await createReadyCampaignWithOpening();
    let handle = fixture.handle;
    const time = fixedClock(7_500);
    const narrator = playerNarratorFixture();
    const buildRuntime = () => turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator },
    );
    const admission = buildRuntime().admitAction({
      request: admissionRequest(fixture.state, "visibility-reopen"),
      submittedAt: 7_500,
    });
    await advanceUntilStage(buildRuntime(), time, admission.turnId, "visibility_projected");
    const frozen = handle.sqlite.prepare(`SELECT packet_hash AS packetHash, packet_json AS packetJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID,
        admission.turnId,
      ) as { packetHash: string; packetJson: string };
    const commandCount = countForTurn(handle, "campaign_play_commands", admission.turnId);

    closeTracked(handle);
    handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    const reopenedRuntime = buildRuntime();
    time.advance();
    await reopenedRuntime.runNextStage(admission.turnId);

    expect(reopenedRuntime.loadTurn(admission.turnId)).toMatchObject({ stage: "completed" });
    expect(narrator.narrate).toHaveBeenCalledTimes(1);
    expect(narrator.narrate.mock.calls[0]![0].packetBytes).toBe(frozen.packetJson);
    expect(handle.sqlite.prepare(`SELECT packet_hash AS packetHash, packet_json AS packetJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual(frozen);
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(commandCount);
  });

  it("persists interrupted narrator identity only when provider, model, and strategy are complete", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(7_750);
    const compiler = createCampaignPlayNarrator();
    const narrator = {
      compile: compiler.compile,
      narrate: vi.fn(async () => {
        throw new CampaignPlayNarratorError("transport_interrupted", {
          ...openingNarratorEvidence,
          actualProviderId: "partial-provider",
          responseModel: null,
          actualStrategy: "native_schema",
          durationMs: 77,
          errorCode: "narration_invalid",
        });
      }),
    };
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "partial-narrator-identity"),
      submittedAt: 7_750,
    });
    await advanceUntilStage(runtime, time, admission.turnId, "visibility_projected");

    time.advance();
    await runtime.runNextStage(admission.turnId);

    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      stage: "interrupted",
      interruptedStage: "visibility_projected",
      errorCode: "provider_unavailable",
      resumeEligible: true,
    });
    expect(handle.sqlite.prepare(`SELECT actual_provider_id AS actualProviderId,
      actual_model AS actualModel, actual_strategy AS actualStrategy,
      duration_ms AS durationMs, error_code AS errorCode
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'narrator'
      ORDER BY attempt DESC LIMIT 1`).get(CAMPAIGN_ID, admission.turnId)).toEqual({
        actualProviderId: null,
        actualModel: null,
        actualStrategy: null,
        durationMs: 77,
        errorCode: "provider_unavailable",
      });
  });

  it.each(["after_provider_return", "during_terminal_commit"] as const)(
    "recovers %s with one accepted narration and complete reopened telemetry",
    async (faultPoint) => {
      const fixture = await createReadyCampaignWithOpening();
      let handle = fixture.handle;
      const state = fixture.state;
      const time = fixedClock(8_000);
      const narrator = playerNarratorFixture();
      let inject = true;
      const runtime = turnRuntime(
        handle,
        time,
        judgeFixture("deterministic"),
        gameMasterFixture(),
        {
          narrator,
          injectNarratorFault(point) {
            if (inject && point === faultPoint) {
              inject = false;
              throw new Error(`process stopped ${faultPoint}`);
            }
          },
        },
      );
      const admission = runtime.admitAction({
        request: admissionRequest(state, `narrator-recovery-${faultPoint}`),
        submittedAt: 8_000,
      });
      await advanceUntilStage(runtime, time, admission.turnId, "visibility_projected");
      const commandCount = countForTurn(handle, "campaign_play_commands", admission.turnId);

      time.advance();
      await expect(runtime.runNextStage(admission.turnId))
        .rejects.toThrow(`process stopped ${faultPoint}`);
      expect(runtime.loadTurn(admission.turnId)).toMatchObject({
        stage: "visibility_projected",
        workerLeaseOwner: "turn-runtime-worker",
      });
      expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(0);

      time.advanceBy(1_001);
      await runtime.recoverActiveTurn();
      const interrupted = runtime.loadTurn(admission.turnId)!;
      expect(interrupted).toMatchObject({
        stage: "interrupted",
        interruptedStage: "visibility_projected",
        resumeEligible: true,
      });
      time.advance();
      await runtime.resumeInterruptedStage({
        turnId: admission.turnId,
        interruptedStage: "visibility_projected",
        observedEpoch: interrupted.workerEpoch,
      });

      expect(runtime.loadTurn(admission.turnId)).toMatchObject({
        stage: "completed",
        terminalReason: "action_resolved",
      });
      expect(narrator.narrate).toHaveBeenCalledTimes(2);
      expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(commandCount);
      expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(1);
      expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_model_stages
        WHERE campaign_id = ? AND turn_id = ? AND kind = 'narrator' AND status = 'accepted'`).get(
          CAMPAIGN_ID,
          admission.turnId,
        )).toEqual({ value: 1 });
      const telemetry = runtime.loadTelemetry(admission.turnId);
      expect(telemetry.costComplete).toBe(false);
      expect(telemetry.estimatedCostMicros).toBeNull();
      expect(telemetry.modelAttempts.filter((attempt) => attempt.kind === "narrator"))
        .toEqual([
          expect.objectContaining({ status: "interrupted", inputTokens: null, outputTokens: null }),
          expect.objectContaining({ status: "accepted", inputTokens: 15, outputTokens: 25 }),
        ]);
      expect(telemetry.stageExecutions).toContainEqual(expect.objectContaining({
        stage: "visibility_projected",
        outcome: "interrupted",
      }));
      expect(telemetry.stageExecutions).toContainEqual(expect.objectContaining({
        stage: "visibility_projected",
        outcome: "advanced",
      }));
      closeTracked(handle);
      handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
      expect(turnRuntime(
        handle,
        time,
        judgeFixture("deterministic"),
        gameMasterFixture(),
      ).loadTelemetry(admission.turnId)).toEqual(telemetry);
    },
  );

  it("keeps failed actor replanning interrupted until explicit fresh-epoch resume", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(3_500);
    let providerCalls = 0;
    const actorReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => {
        providerCalls += 1;
        if (providerCalls === 1) throw new Error("provider transport interrupted");
        return {
          object: actorReplanProposalFromPrompt(request.prompt),
          trace: actorReplanTrace(),
        };
      }) as unknown as typeof safeGenerateObject,
    });
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorReplanner },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "interrupted-actor-replanner"),
      submittedAt: 3_500,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    const jobId = forceFirstActorReplan(handle, time, admission.turnId);

    time.advance();
    await runtime.runNextStage(admission.turnId);
    const interruptedTurn = runtime.loadTurn(admission.turnId)!;
    expect(interruptedTurn.stage).toBe("primary_settled");
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({
        stage: "interrupted",
        workerEpoch: 1,
      });
    expect(providerCalls).toBe(1);
    expect(handle.sqlite.prepare(`SELECT status, error_code AS errorCode
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'
      ORDER BY attempt`).all(CAMPAIGN_ID, admission.turnId)).toEqual([
      { status: "interrupted", errorCode: "provider_unavailable" },
    ]);
    expect(runtime.loadTelemetry(admission.turnId)).toMatchObject({
      costComplete: false,
      estimatedCostMicros: null,
      modelAttempts: expect.arrayContaining([
        expect.objectContaining({
          kind: "actor_replanner",
          status: "interrupted",
          inputTokens: null,
          outputTokens: null,
          estimatedCostMicros: null,
          costComplete: false,
        }),
      ]),
    });

    time.advance();
    await runtime.runNextStage(admission.turnId);
    expect(providerCalls).toBe(1);
    expect(runtime.loadTurn(admission.turnId)!.workerEpoch).toBe(interruptedTurn.workerEpoch);

    time.advance();
    await runtime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "primary_settled",
      observedEpoch: interruptedTurn.workerEpoch,
    });
    expect(providerCalls).toBe(2);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({
        stage: "deferred",
        workerEpoch: 2,
      });
    expect(handle.sqlite.prepare(`SELECT status, worker_epoch AS workerEpoch
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'
      ORDER BY attempt`).all(CAMPAIGN_ID, admission.turnId)).toEqual([
      { status: "interrupted", workerEpoch: 1 },
      { status: "accepted", workerEpoch: 2 },
    ]);
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      stage: "primary_settled",
      workerEpoch: interruptedTurn.workerEpoch + 1,
      workerLeaseOwner: null,
    });
    expect(runtime.loadTelemetry(admission.turnId).modelAttempts
      .filter((attempt) => attempt.kind === "actor_replanner"))
      .toEqual([
        expect.objectContaining({ status: "interrupted", costComplete: false }),
        expect.objectContaining({ status: "accepted", costComplete: true }),
      ]);
  });

  it.each([
    ["schema", "model_contract_invalid"],
    ["budget", "stage_budget_exceeded"],
    ["persistence", "persistence_failed"],
  ] as const)(
    "persists actor replanner %s failure as an explicit interruption",
    async (failure, expectedErrorCode) => {
      const { handle, state } = await createReadyCampaignWithOpening();
      const time = fixedClock(3_800);
      let providerCalls = 0;
      const baseReplanner = createCampaignPlayActorReplanner(handle, {
        now: time.clock.now,
        generateObject: (async (request: { prompt: string }) => {
          providerCalls += 1;
          const trace = actorReplanTrace();
          if (providerCalls === 1 && failure === "budget") {
            trace.usage = { inputTokens: 1_001, outputTokens: 25, totalTokens: 1_026 };
          }
          return {
            object: providerCalls === 1 && failure === "schema"
              ? { unexpected: true }
              : actorReplanProposalFromPrompt(request.prompt),
            trace,
          };
        }) as unknown as typeof safeGenerateObject,
      });
      if (failure === "persistence") {
        handle.sqlite.exec(`CREATE TRIGGER test_actor_replanner_acceptance_failure
          BEFORE UPDATE ON campaign_play_model_stages
          FOR EACH ROW WHEN NEW.status = 'accepted' AND OLD.kind = 'actor_replanner'
          BEGIN
            SELECT RAISE(ABORT, 'injected actor replanner persistence failure');
          END`);
      }
      const runtime = turnRuntime(
        handle,
        time,
        judgeFixture("deterministic"),
        gameMasterFixture(),
        { actorReplanner: baseReplanner },
      );
      const admission = runtime.admitAction({
        request: admissionRequest(state, `actor-replanner-${failure}`),
        submittedAt: 3_800,
      });
      await advanceToPrimarySettlement(runtime, time, admission.turnId);
      time.advance();
      await runtime.runNextStage(admission.turnId);
      const jobId = forceFirstActorReplan(handle, time, admission.turnId);

      time.advance();
      await runtime.runNextStage(admission.turnId);
      expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
        .find((job) => job.jobId === jobId)).toMatchObject({
          stage: "interrupted",
          workerEpoch: 1,
        });
      expect(() => createCampaignPlayActorScheduler(handle).validateTurnSettlement(admission.turnId))
        .toThrow("scheduler_job_invalid");
      expect(handle.sqlite.prepare(`SELECT status, error_code AS errorCode
        FROM campaign_play_model_stages
        WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'`).get(
          CAMPAIGN_ID,
          admission.turnId,
        )).toEqual({ status: "interrupted", errorCode: expectedErrorCode });
      expect(runtime.loadTurn(admission.turnId)).toMatchObject({
        stage: "primary_settled",
        workerLeaseOwner: null,
      });
      expect(providerCalls).toBe(1);
      expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
        .filter((job) => job.workerEpoch > 0).map((job) => job.jobId)).toEqual([jobId]);

      if (failure === "persistence") {
        handle.sqlite.exec("DROP TRIGGER test_actor_replanner_acceptance_failure");
      }

      time.advance();
      await runtime.runNextStage(admission.turnId);
      expect(providerCalls).toBe(1);
      const interruptedTurn = runtime.loadTurn(admission.turnId)!;
      time.advance();
      await runtime.resumeInterruptedStage({
        turnId: admission.turnId,
        interruptedStage: "primary_settled",
        observedEpoch: interruptedTurn.workerEpoch,
      });
      expect(providerCalls).toBe(2);
      expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
        .find((job) => job.jobId === jobId)).toMatchObject({
          stage: "deferred",
          workerEpoch: 2,
        });
      expect(handle.sqlite.prepare(`SELECT status, worker_epoch AS workerEpoch
        FROM campaign_play_model_stages
        WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'
        ORDER BY attempt`).all(CAMPAIGN_ID, admission.turnId)).toEqual([
        { status: "interrupted", workerEpoch: 1 },
        { status: "accepted", workerEpoch: 2 },
      ]);
    },
  );

  it("reopens a process stop after actor replanner provider return without classifying or retrying it", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(4_200);
    let providerCalls = 0;
    let stopOnce = true;
    const baseReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => {
        providerCalls += 1;
        return {
          object: actorReplanProposalFromPrompt(request.prompt),
          trace: actorReplanTrace(),
        };
      }) as unknown as typeof safeGenerateObject,
    });
    const stoppingReplanner = {
      interruptExpired: baseReplanner.interruptExpired,
      replan: (request: Parameters<typeof baseReplanner.replan>[0]) => baseReplanner.replan({
        ...request,
        injectFault(point) {
          if (stopOnce && point === "after_provider_return") {
            stopOnce = false;
            throw new Error("process stopped after actor provider return");
          }
        },
      }),
    };
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorReplanner: stoppingReplanner, owner: "provider-return-worker" },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "actor-provider-return-stop"),
      submittedAt: 4_200,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    const jobId = forceFirstActorReplan(handle, time, admission.turnId);

    time.advance();
    await expect(runtime.runNextStage(admission.turnId))
      .rejects.toThrow("process stopped after actor provider return");
    const stoppedTurn = runtime.loadTurn(admission.turnId)!;
    expect(providerCalls).toBe(1);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({ stage: "claimed", workerEpoch: 1 });
    expect(handle.sqlite.prepare(`SELECT status, schema_outcome AS schemaOutcome, error_code AS errorCode
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({ status: "started", schemaOutcome: "pending", errorCode: null });

    closeTracked(handle);
    time.advanceBy(1_001);
    const reopened = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    const resumedReplanner = createCampaignPlayActorReplanner(reopened, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => {
        providerCalls += 1;
        return {
          object: actorReplanProposalFromPrompt(request.prompt),
          trace: actorReplanTrace(),
        };
      }) as unknown as typeof safeGenerateObject,
    });
    const reopenedRuntime = turnRuntime(
      reopened,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorReplanner: resumedReplanner, owner: "provider-return-recovery-worker" },
    );
    await reopenedRuntime.runNextStage(admission.turnId);
    expect(providerCalls).toBe(1);
    expect(createCampaignPlayActorScheduler(reopened).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({ stage: "interrupted", workerEpoch: 1 });

    time.advance();
    await reopenedRuntime.runNextStage(admission.turnId);
    expect(providerCalls).toBe(1);
    time.advance();
    await reopenedRuntime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "primary_settled",
      observedEpoch: stoppedTurn.workerEpoch,
    });
    expect(providerCalls).toBe(2);
    expect(createCampaignPlayActorScheduler(reopened).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({ stage: "deferred", workerEpoch: 2 });
  });

  it("rejects actor replanner acceptance when compilation crosses the main lease deadline", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(4_400);
    let providerCalls = 0;
    let crossDeadline = true;
    const baseReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => {
        providerCalls += 1;
        return {
          object: actorReplanProposalFromPrompt(request.prompt),
          trace: actorReplanTrace(),
        };
      }) as unknown as typeof safeGenerateObject,
    });
    const actorReplanner = {
      interruptExpired: baseReplanner.interruptExpired,
      replan: (request: Parameters<typeof baseReplanner.replan>[0]) => baseReplanner.replan({
        ...request,
        injectFault(point) {
          if (crossDeadline && point === "before_acceptance_commit") {
            crossDeadline = false;
            time.advanceBy(1_001);
          }
        },
      }),
    };
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorReplanner, owner: "deadline-crossing-worker" },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "actor-acceptance-deadline"),
      submittedAt: 4_400,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    const jobId = forceFirstActorReplan(handle, time, admission.turnId);

    time.advance();
    await runtime.runNextStage(admission.turnId);
    expect(providerCalls).toBe(1);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({ stage: "interrupted", workerEpoch: 1 });
    expect(handle.sqlite.prepare(`SELECT status FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({ status: "interrupted" });
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_actor_plans
      WHERE campaign_id = ? AND actor_id = (
        SELECT actor_id FROM campaign_play_actor_jobs WHERE job_id = ?
      ) AND plan_version = 2`).get(CAMPAIGN_ID, jobId)).toEqual({ count: 0 });

    const interruptedTurn = runtime.loadTurn(admission.turnId)!;
    expect(interruptedTurn).toMatchObject({
      stage: "primary_settled",
      workerLeaseOwner: null,
      workerLeaseExpiresAt: null,
    });
    expect(interruptedTurn.events.at(-1)).toMatchObject({ type: "turn.interrupted" });
    expect(createCampaignPlayReadModel(handle).loadTurn(admission.turnId)).toMatchObject({
      turn: { status: "interrupted", retryEligible: true },
      result: { status: "interrupted", errorCode: "turn_interrupted" },
    });
    time.advance();
    await runtime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "primary_settled",
      observedEpoch: interruptedTurn.workerEpoch,
    });
    expect(providerCalls).toBe(2);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({ stage: "deferred", workerEpoch: 2 });
  });

  it("keeps a queued actor replan outside startup recovery until explicit runtime work", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(4_450);
    let providerCalls = 0;
    const actorReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => {
        providerCalls += 1;
        return {
          object: actorReplanProposalFromPrompt(request.prompt),
          trace: actorReplanTrace(),
        };
      }) as unknown as typeof safeGenerateObject,
    });
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorReplanner, owner: "deterministic-startup-worker" },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "startup-replan-boundary"),
      submittedAt: 4_450,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    const jobId = forceFirstActorReplan(handle, time, admission.turnId);

    time.advance();
    await runtime.recoverActiveTurn();
    expect(providerCalls).toBe(0);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({ stage: "queued", workerEpoch: 0 });

    time.advance();
    await runtime.runNextStage(admission.turnId);
    expect(providerCalls).toBe(1);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({ stage: "deferred", workerEpoch: 1 });
  });

  it("interrupts an expired claimed replanner before recovery and rejects its late result", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(4_500);
    type Generated = {
      object: ReturnType<typeof actorReplanProposalFromPrompt>;
      trace: SafeGenerateTrace;
    };
    let resolveOld: ((value: Generated) => void) | undefined;
    let oldObject: Generated["object"] | undefined;
    const oldReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: ((request: { prompt: string }) => {
        oldObject = actorReplanProposalFromPrompt(request.prompt);
        return new Promise<Generated>((resolve) => {
          resolveOld = resolve;
        });
      }) as unknown as typeof safeGenerateObject,
    });
    const oldRuntime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorReplanner: oldReplanner, owner: "old-actor-worker" },
    );
    const admission = oldRuntime.admitAction({
      request: admissionRequest(state, "expired-actor-replanner"),
      submittedAt: 4_500,
    });
    await advanceToPrimarySettlement(oldRuntime, time, admission.turnId);
    time.advance();
    await oldRuntime.runNextStage(admission.turnId);
    const jobId = forceFirstActorReplan(handle, time, admission.turnId);

    time.advance();
    const lateRun = oldRuntime.runNextStage(admission.turnId);
    await vi.waitFor(() => expect(resolveOld).toBeTypeOf("function"));
    const expiredEpoch = oldRuntime.loadTurn(admission.turnId)!.workerEpoch;
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({
        stage: "claimed",
        workerEpoch: 1,
        claimTurnWorkerEpoch: expiredEpoch,
      });

    time.advanceBy(1_001);
    const recoveryReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => ({
        object: actorReplanProposalFromPrompt(request.prompt),
        trace: actorReplanTrace(),
      })) as unknown as typeof safeGenerateObject,
    });
    const recoveryRuntime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorReplanner: recoveryReplanner, owner: "recovery-actor-worker" },
    );
    await recoveryRuntime.runNextStage(admission.turnId);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({
        stage: "interrupted",
        workerEpoch: 1,
      });

    time.advance();
    await recoveryRuntime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "primary_settled",
      observedEpoch: expiredEpoch,
    });
    const resumedJob = createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId);
    expect(resumedJob).toMatchObject({ stage: "deferred", workerEpoch: 2 });

    if (!resolveOld || !oldObject) throw new Error("Expired actor replanner never reached its provider call.");
    resolveOld({ object: oldObject, trace: actorReplanTrace() });
    await expect(lateRun).resolves.toMatchObject({
      turn: { stage: "primary_settled", workerEpoch: expiredEpoch + 1 },
    });
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toEqual(resumedJob);
    expect(handle.sqlite.prepare(`SELECT attempt, status, worker_epoch AS workerEpoch
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'
      ORDER BY attempt`).all(CAMPAIGN_ID, admission.turnId)).toEqual([
      { attempt: 1, status: "interrupted", workerEpoch: 1 },
      { attempt: 2, status: "accepted", workerEpoch: 2 },
    ]);
  });

  it("rolls back due-set admission as one ledger and commits it once on recovery", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(5_000);
    const baseScheduler = createCampaignPlayActorScheduler(handle);
    let inject = true;
    const actorScheduler: CampaignPlayActorScheduler = {
      ...baseScheduler,
      admitDueSet(request) {
        const jobs = baseScheduler.admitDueSet(request);
        if (inject) {
          inject = false;
          throw new Error("injected due-set admission failure");
        }
        return jobs;
      },
    };
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorScheduler },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "atomic-due-set-admission"),
      submittedAt: 5_000,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);

    time.advance();
    await expect(runtime.runNextStage(admission.turnId))
      .rejects.toThrow("injected due-set admission failure");
    expect(baseScheduler.loadDueSet(admission.turnId)).toBeNull();
    expect(baseScheduler.listTurnJobs(admission.turnId)).toEqual([]);
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_runtime_events
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_job_transitioned'`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({ count: 0 });

    time.advanceBy(1_001);
    await runtime.recoverActiveTurn();
    const dueSet = baseScheduler.loadDueSet(admission.turnId);
    expect(dueSet).not.toBeNull();
    expect(baseScheduler.listTurnJobs(admission.turnId)).toHaveLength(
      dueSet!.decisions.filter((decision) => decision.disposition !== "skip").length,
    );
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_actor_due_sets
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, admission.turnId))
      .toEqual({ count: 1 });
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_runtime_events
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_job_transitioned'`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({ count: 1 });
  });

  it("reloads multiple accepted actor-owned replanner artifacts without turn-stage collisions", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(5_500);
    const actorReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => ({
        object: actorReplanProposalFromPrompt(request.prompt),
        trace: actorReplanTrace(),
      })) as unknown as typeof safeGenerateObject,
    });
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorReplanner },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "multiple-actor-replanners"),
      submittedAt: 5_500,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);

    const firstJobId = forceFirstActorReplan(handle, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    const secondJobId = forceFirstActorReplan(handle, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);

    expect(secondJobId).not.toBe(firstJobId);
    const rows = handle.sqlite.prepare(`SELECT stage_id AS stageId, status, worker_epoch AS workerEpoch
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'
      ORDER BY stage_id`).all(CAMPAIGN_ID, admission.turnId) as Array<{
        stageId: string;
        status: string;
        workerEpoch: number;
      }>;
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.stageId)).size).toBe(2);
    expect(rows.every((row) => row.status === "accepted" && row.workerEpoch === 1)).toBe(true);
    const actorTelemetry = runtime.loadTelemetry(admission.turnId).modelAttempts
      .filter((attempt) => attempt.kind === "actor_replanner");
    expect(actorTelemetry).toHaveLength(2);
    expect(new Set(actorTelemetry.map((attempt) => attempt.stageId)).size).toBe(2);
    expect(actorTelemetry.every((attempt) => attempt.costComplete)).toBe(true);
    const repository = createCampaignPlayTurnRepository(handle);
    expect(repository.loadTurn(admission.turnId)).toMatchObject({ stage: "primary_settled" });
    expect(() => repository.loadAcceptedModelArtifact(admission.turnId, "actor_replanner"))
      .toThrow("owned by individual actor jobs");
  });

  it.each([
    ["after_job_claim", "claimed"],
    ["after_proposal_persisted", "proposed"],
  ] as const)(
    "recovers a process stop %s from stored actor state without duplicating settlement",
    async (faultPoint, strandedStage) => {
      const { handle, state } = await createReadyCampaignWithOpening();
      const time = fixedClock(4_000);
      const base = createCampaignPlayActorProposalService(handle, { now: time.clock.now });
      let inject = true;
      const actorProposalService: CampaignPlayActorProposalService = {
        processNext(request) {
          return base.processNext({
            ...request,
            injectFault(point) {
              if (inject && point === faultPoint) {
                inject = false;
                throw new Error(`process stopped ${faultPoint}`);
              }
            },
          });
        },
      };
      const runtime = turnRuntime(
        handle,
        time,
        judgeFixture("deterministic"),
        gameMasterFixture(),
        { actorProposalService },
      );
      const admission = runtime.admitAction({
        request: admissionRequest(state, `actor-restart-${faultPoint}`),
        submittedAt: 4_000,
      });
      await advanceToPrimarySettlement(runtime, time, admission.turnId);
      time.advance();
      await runtime.runNextStage(admission.turnId);

      time.advance();
      await expect(runtime.runNextStage(admission.turnId))
        .rejects.toThrow(`process stopped ${faultPoint}`);
      const scheduler = createCampaignPlayActorScheduler(handle);
      const stranded = scheduler.listTurnJobs(admission.turnId)
        .find((job) => job.stage === strandedStage);
      expect(stranded).toBeDefined();
      expect(() => scheduler.validateTurnSettlement(admission.turnId))
        .toThrow("scheduler_job_invalid");
      const proposalsBefore = handle.sqlite.prepare(`SELECT count(*) AS count
        FROM campaign_play_actor_proposals WHERE campaign_id = ? AND job_id = ?`).get(
          CAMPAIGN_ID,
          stranded!.jobId,
        ) as { count: number };
      expect(proposalsBefore.count).toBe(strandedStage === "proposed" ? 1 : 0);
      const strandedEpoch = runtime.loadTurn(admission.turnId)!.workerEpoch;

      time.advanceBy(1_001);
      await runtime.recoverActiveTurn();
      expect(scheduler.listTurnJobs(admission.turnId)
        .find((job) => job.jobId === stranded!.jobId)).toMatchObject({ stage: "settled" });
      expect(handle.sqlite.prepare(`SELECT count(*) AS count
        FROM campaign_play_actor_proposals WHERE campaign_id = ? AND job_id = ?`).get(
          CAMPAIGN_ID,
          stranded!.jobId,
        )).toEqual({ count: 1 });
      expect(handle.sqlite.prepare(`SELECT count(*) AS count
        FROM campaign_play_commands
        WHERE campaign_id = ? AND json_extract(causal_parent_json, '$.jobId') = ?`).get(
          CAMPAIGN_ID,
          stranded!.jobId,
        )).toEqual({ count: 1 });
      expect(runtime.loadTurn(admission.turnId)).toMatchObject({
        stage: "primary_settled",
        workerEpoch: strandedEpoch + 1,
        workerLeaseOwner: null,
      });
    },
  );

  it("reopens after an actor receipt fault and settles the stored proposal exactly once", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(6_000);
    const base = createCampaignPlayActorProposalService(handle, { now: time.clock.now });
    let faultPending = true;
    const actorProposalService: CampaignPlayActorProposalService = {
      processNext(request) {
        return base.processNext({
          ...request,
          injectRulebookFault(point) {
            if (faultPending && point.kind === "after_command" && point.commandIndex === 0) {
              faultPending = false;
              throw new Error("process stopped after actor receipt");
            }
          },
        });
      },
    };
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorProposalService, owner: "actor-receipt-worker" },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "actor-receipt-restart"),
      submittedAt: 6_000,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);

    time.advance();
    await expect(runtime.runNextStage(admission.turnId))
      .rejects.toThrow("process stopped after actor receipt");
    const scheduler = createCampaignPlayActorScheduler(handle);
    const proposed = scheduler.listTurnJobs(admission.turnId).find((job) => job.stage === "proposed");
    expect(proposed).toBeDefined();
    expect(handle.sqlite.prepare(`SELECT status FROM campaign_play_actor_proposals
      WHERE campaign_id = ? AND job_id = ?`).get(CAMPAIGN_ID, proposed!.jobId))
      .toEqual({ status: "pending" });
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_commands
      WHERE campaign_id = ? AND json_extract(causal_parent_json, '$.jobId') = ?`).get(
        CAMPAIGN_ID,
        proposed!.jobId,
      )).toEqual({ count: 0 });
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_receipts receipt
      JOIN campaign_play_commands command ON command.command_id = receipt.command_id
      WHERE receipt.campaign_id = ? AND json_extract(command.causal_parent_json, '$.jobId') = ?`).get(
        CAMPAIGN_ID,
        proposed!.jobId,
      )).toEqual({ count: 0 });

    closeTracked(handle);
    time.advanceBy(1_001);
    const reopened = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    const reopenedRuntime = turnRuntime(
      reopened,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { owner: "actor-receipt-recovery-worker" },
    );
    await reopenedRuntime.runNextStage(admission.turnId);
    expect(createCampaignPlayActorScheduler(reopened).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === proposed!.jobId)).toMatchObject({ stage: "settled" });
    expect(reopened.sqlite.prepare(`SELECT status FROM campaign_play_actor_proposals
      WHERE campaign_id = ? AND job_id = ?`).get(CAMPAIGN_ID, proposed!.jobId))
      .toEqual({ status: "accepted" });
    expect(reopened.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_commands
      WHERE campaign_id = ? AND json_extract(causal_parent_json, '$.jobId') = ?`).get(
        CAMPAIGN_ID,
        proposed!.jobId,
      )).toEqual({ count: 1 });
    expect(reopened.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_receipts receipt
      JOIN campaign_play_commands command ON command.command_id = receipt.command_id
      WHERE receipt.campaign_id = ? AND json_extract(command.causal_parent_json, '$.jobId') = ?`).get(
        CAMPAIGN_ID,
        proposed!.jobId,
      )).toEqual({ count: 1 });
  });
});
