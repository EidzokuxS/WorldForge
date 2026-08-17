import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
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
import { buildCampaignPlaySuggestedActionLabel } from "./contracts.js";
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
  type CampaignPlayNarratorRecoveryFeedback,
} from "./narrator.js";
import { createCampaignPlayOpeningRuntime } from "./opening-runtime.js";
import {
  CampaignPlayJudgeError,
  createCampaignPlayJudge,
  type CampaignPlayModelEvidence,
  type CampaignPlayJudgeRecoveryFeedback,
} from "./judge.js";
import {
  CampaignPlayGameMasterError,
  createCampaignPlayGameMaster,
  type CampaignPlayGameMasterRecoveryFeedback,
} from "./game-master.js";
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
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
} from "./campaign-play-projection.js";
import { createCampaignPlayReadModel } from "./campaign-play-read-model.js";
import {
  CAMPAIGN_PLAY_AUTOMATIC_NARRATION_WINDOW_MS,
  createCampaignPlayNarrationOperationRepository,
} from "./narration-operation-repository.js";
import {
  CampaignPlayApplicationError,
  createCampaignPlayApplication,
} from "./campaign-play-application.js";
import {
  safeGenerateObject,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
} from "../ai/structured-output-capabilities.js";

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

function openingProposal(_actorCadenceMinutes = 1): CampaignPlayOpeningProposal {
  return {
    start: {
      role: "A visitor on Bell Island",
      arrivalMode: "On foot",
      immediateSituation: "Signal keepers prepare for another route closure.",
    },
    scene: {
      candidateId: deriveCampaignPlayOpeningSceneCandidateId({
        sceneLocationId: "location-c",
        openingActorId: "actor-c",
        supportActorId: "actor-c",
        pressureId: "pressure-b",
        routeId: "route-c",
      }),
    },
    playerPremise: {
      motivationIndex: 0,
      anchor: "openingActor",
      eventClass: "dialogue",
      summary: "The signal keeper asks Mara what she has learned about the impossible signal.",
      routeRestriction: null,
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

const acceptedEvidence = (
  model: "test-judge" | "test-game-master",
  providerId = "test",
  responseModel: string = model,
): CampaignPlayModelEvidence => ({
  requestedStrategy: "strict_object",
  actualProviderId: providerId,
  actualStrategy: "native_schema",
  totalAttempts: 1,
  repairUsed: false,
  retryUsed: false,
  textFallbackUsed: false,
  responseModel,
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

function deadlineClock(initial: number) {
  let value = initial;
  const waiters: Array<{
    dueAt: number;
    resolve: () => void;
    reject: (error: unknown) => void;
    signal: AbortSignal;
  }> = [];
  const clock: CampaignPlayTurnServiceClock = {
    now: () => value,
    wait: (delayMs, signal) => new Promise<void>((resolve, reject) => {
      const waiter = {
        dueAt: value + delayMs,
        resolve,
        reject,
        signal,
      };
      const onAbort = () => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error("aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      waiters.push(waiter);
    }),
  };
  const settleDue = () => {
    for (const waiter of [...waiters]) {
      if (waiter.dueAt > value || waiter.signal.aborted) continue;
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      waiter.resolve();
    }
  };
  return {
    clock,
    advance: () => { value += 10; settleDue(); },
    advanceBy: (durationMs: number) => { value += durationMs; settleDue(); },
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

function narratorActionSelections(
  packet: CampaignPlayNarratorPacket,
  includeWait = false,
  contactDetail = "the immediate situation",
) {
  const latestVisiblePerformer = [...packet.consequences].reverse().find((consequence) =>
    consequence.performingActorHandle !== null && packet.visibleActors.some((actor) =>
      actor.handle === consequence.performingActorHandle))?.performingActorHandle ?? null;
  const requiredReplyIndex = latestVisiblePerformer === null
    ? -1
    : packet.availableIntents.findIndex((intent) => intent.kind === "contact"
      && intent.targets.some((target) => target.kind === "actor"
        && target.handle === latestVisiblePerformer));
  const indexes = packet.availableIntents.map((_intent, intentIndex) => intentIndex);
  const orderedIndexes = requiredReplyIndex < 0
    ? indexes
    : [requiredReplyIndex, ...indexes.filter((intentIndex) => intentIndex !== requiredReplyIndex)];
  const waitIndex = includeWait
    ? packet.availableIntents.findIndex((intent) => intent.kind === "wait")
    : -1;
  const selectedIndexes = waitIndex < 0
    ? orderedIndexes.slice(0, CAMPAIGN_PLAY_LIMITS.suggestedActions)
    : requiredReplyIndex < 0
      ? [waitIndex, ...orderedIndexes.filter((intentIndex) => intentIndex !== waitIndex)]
        .slice(0, CAMPAIGN_PLAY_LIMITS.suggestedActions)
      : [
          requiredReplyIndex,
          waitIndex,
          ...orderedIndexes.filter((intentIndex) =>
            intentIndex !== requiredReplyIndex && intentIndex !== waitIndex),
        ].slice(0, CAMPAIGN_PLAY_LIMITS.suggestedActions);
  const contactIndex = contactDetail.startsWith("ask ")
    ? requiredReplyIndex >= 0
      ? requiredReplyIndex
      : packet.availableIntents.findIndex((intent) => intent.kind === "contact")
    : -1;
  const finalIndexes = contactIndex < 0
    ? selectedIndexes
    : [contactIndex, ...selectedIndexes.filter((intentIndex) => intentIndex !== contactIndex)]
      .slice(0, CAMPAIGN_PLAY_LIMITS.suggestedActions);
  return finalIndexes.map((intentIndex) => ({
    intentIndex,
    detail: packet.availableIntents[intentIndex]?.kind === "move"
      ? null
      : packet.availableIntents[intentIndex]?.kind === "wait"
        ? null
        : packet.availableIntents[intentIndex]?.kind === "contact"
          ? contactDetail
          : "the immediate situation",
  }));
}

function openingNarratorFixture(includeWait = false, contactDetail = "the immediate situation") {
  const compiler = createCampaignPlayNarrator();
  return {
    compile: compiler.compile,
    narrate: vi.fn(async (request: Parameters<typeof compiler.narrate>[0]) => {
      const packet = JSON.parse(request.packetBytes) as CampaignPlayNarratorPacket;
      return compiler.compile({
        narrationId: request.narrationId,
        packet,
        proposal: {
          actionSelections: narratorActionSelections(packet, includeWait, contactDetail),
          beats: [
            { purpose: "orientation", observationIndexes: [], text: "Rain rings against the signal tower as Mara reaches Bell Island." },
            { purpose: "consequence", observationIndexes: packet.newObservations.map((_entry, index) => index), text: "Signal keepers brace the route gate while warning bells gather pace." },
            { purpose: "action_handoff", observationIndexes: [], text: "The open path and the waiting keeper leave a clear choice." },
          ],
        },
        createdAt: request.createdAt,
        modelEvidence: openingNarratorEvidence,
      });
    }),
  };
}

function playerNarratorFixture(
  contactDetail = "the immediate situation",
  modelEvidence?: CampaignPlayNarratorModelEvidence,
) {
  const compiler = createCampaignPlayNarrator();
  const evidence: CampaignPlayNarratorModelEvidence = {
    ...openingNarratorEvidence,
    actualProviderId: modelEvidence?.actualProviderId ?? "test",
    responseModel: modelEvidence?.responseModel ?? "test-narrator",
    ...(modelEvidence ?? {}),
  };
  return {
    compile: compiler.compile,
    narrate: vi.fn(async (request: Parameters<typeof compiler.narrate>[0]) => {
      const packet = JSON.parse(request.packetBytes) as CampaignPlayNarratorPacket;
      const clarification = packet.actionContext?.clarificationQuestion;
      const beats = clarification
        ? [{
            purpose: "action_handoff" as const,
            observationIndexes: [],
            text: clarification,
          }]
        : [
            {
              purpose: "consequence" as const,
              observationIndexes: packet.newObservations.map((_entry, index) => index),
              text: `${packet.actionContext!.submittedText} meets the visible conditions at ${packet.currentLocation.name}.`,
            },
            {
              purpose: "action_handoff" as const,
              observationIndexes: [],
              text: `The scene at ${packet.currentLocation.name} leaves another move open.`,
            },
          ];
      return compiler.compile({
        narrationId: request.narrationId,
        packet,
        proposal: {
            actionSelections: narratorActionSelections(packet, false, contactDetail),
          beats,
        },
        createdAt: request.createdAt,
        modelEvidence: evidence,
      });
    }),
  };
}

async function createReadyCampaignWithOpening(
  actorCadenceMinutes = 1,
  options: { includeWait?: boolean; contactDetail?: string } = {},
) {
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
    narrator: openingNarratorFixture(options.includeWait, options.contactDetail),
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
  for (let stage = 0; stage < 16; stage += 1) {
    if (opening.loadTurn(admitted.turnId)?.stage === "completed") break;
    time.advance();
    await opening.runNextStage(admitted.turnId);
  }
  const completedOpening = opening.loadTurn(admitted.turnId);
  expect(completedOpening).toMatchObject({ stage: "completed" });
  return {
    handle,
    state: createCampaignPlayStateRepository(handle).loadState()!,
    openingTurnId: admitted.turnId,
  };
}

type Disposition = "deterministic" | "uncertain" | "impossible" | "clarification_required";

function judgeFixture(
  disposition: Disposition,
  compoundDestinationName: string | null = null,
  failFirstFinalValidation = false,
  modelEvidence: CampaignPlayModelEvidence = acceptedEvidence("test-judge"),
) {
  const compiler = createCampaignPlayJudge();
  let calls = 0;
  let selectedChoice: {
    kind: "observe" | "move" | "contact" | "wait" | "attempt";
    targets: Array<{ handle: string; kind: "actor" | "location" | "route" | "pressure" | "possession" }>;
  } | null = null;
  return {
    selectChoice(binding: typeof selectedChoice) {
      selectedChoice = binding;
    },
    judge: vi.fn(async (request: Parameters<ReturnType<typeof createCampaignPlayJudge>["judge"]>[0]) => {
      calls += 1;
      const choice = request.input.choiceHandle === null
        ? null
        : request.frame.visibleFacts.find((fact) => fact.handle === request.input.choiceHandle);
      const target = request.frame.visibleFacts.find((fact) =>
        fact.kind === "actor" && fact.handle !== request.frame.playerActorHandle);
      const route = request.frame.visibleFacts.find((fact) =>
        fact.kind === "route" && (
          compoundDestinationName === null || fact.summary.startsWith(`${compoundDestinationName};`)
        ));
      const destination = request.frame.visibleFacts.find((fact) =>
        fact.kind === "location" && fact.handle !== request.frame.locationHandle && (
          compoundDestinationName === null || fact.summary === compoundDestinationName
        ));
      const selected = selectedChoice;
      const useChoice = choice !== null && choice !== undefined && selected !== null;
      const useCompoundMovement = !useChoice && compoundDestinationName !== null
        && route !== undefined && destination !== undefined;
      const noEffect = disposition === "impossible" || disposition === "clarification_required";
      const movementRouteHandle = useChoice && selected!.kind === "move"
        ? selected!.targets.find((candidate) => candidate.kind === "route")?.handle ?? null
        : useCompoundMovement ? route.handle : null;
      const movementRoute = movementRouteHandle === null
        ? null
        : request.frame.visibleRoutes.find((candidate) => candidate.handle === movementRouteHandle) ?? null;
      const ruling = compiler.compile(request.frame, request.input, {
        kind: useChoice ? selected!.kind : useCompoundMovement || target ? "contact" : "wait",
        targets: useChoice
          ? selected!.targets
          : useCompoundMovement
            ? [
                { handle: route.handle, kind: "route" },
                { handle: destination.handle, kind: "location" },
              ]
            : !target ? [] : [{ handle: target.handle, kind: "actor" }],
        visibleActorReactions: request.frame.visibleFacts
          .filter((fact) => fact.kind === "actor" && fact.handle !== request.frame.playerActorHandle)
          .map((fact) => ({
            actorHandle: fact.handle,
            reaction: "none" as const,
            supportingVisibleFactHandle: null,
            reason: "No additional material reaction is under test.",
          })),
        method: useChoice
          ? "Follow the selected opportunity"
          : useCompoundMovement ? "Take the route, then ask whoever is organizing crossings"
          : target ? "Ask calmly" : "Wait and watch",
        stakes: "Learn what changes at the signal gate",
        movementRouteHandle,
        possessionEffectAuthority: { kind: "none" },
        requiredObligationEffect: { kind: "none" },
        disposition,
        citedVisibleFactHandles: failFirstFinalValidation && calls === 1
          ? [request.frame.locationHandle, request.frame.locationHandle]
          : [request.frame.locationHandle],
        resultBounds: noEffect
          ? { minimum: "no_effect", maximum: "no_effect" }
          : disposition === "uncertain"
            ? { minimum: "setback", maximum: "success" }
            : { minimum: "success", maximum: "success" },
        elapsedBounds: movementRoute === null
          ? { minimumMinutes: 1, maximumMinutes: 2 }
          : useChoice && selectedChoice!.kind === "move"
            ? { minimumMinutes: movementRoute.travelCost, maximumMinutes: movementRoute.travelCost }
            : { minimumMinutes: movementRoute.travelCost, maximumMinutes: movementRoute.travelCost + 1 },
        uncertainty: disposition === "uncertain"
          ? { kind: "check", dieSides: 20, difficulty: 10, modifierMinimum: -1, modifierMaximum: 1 }
          : { kind: "none" },
        reason: "The visible situation supports this ruling.",
        clarificationQuestion: disposition === "clarification_required"
          ? "Which signal do you mean?"
          : null,
      });
      return { ruling, rulingHash: "f".repeat(64), modelEvidence };
    }),
  };
}

function gameMasterFixture(
  worldEventCount = 1,
  includeSubmittedText = false,
  actorlessResult = false,
  modelEvidence: CampaignPlayModelEvidence = acceptedEvidence("test-game-master"),
) {
  const compiler = createCampaignPlayGameMaster();
  return {
    plan: vi.fn(async (request: Parameters<ReturnType<typeof createCampaignPlayGameMaster>["plan"]>[0]) => {
      const playerHandle = request.frame.handleBindings.find((binding) =>
        binding.reference.kind === "actor" && binding.reference.id === PLAYER_ID)!.handle;
      const locationHandle = request.frame.handleBindings.find((binding) =>
        binding.reference.kind === "location" &&
        binding.handle === request.frame.visibleFacts.find((fact) =>
          fact.kind === "location")?.handle)!.handle;
      const movementEffects = request.ruling.movementRouteHandle === null
        ? []
        : [{ kind: "move_actor" as const, actorHandle: null }];
      const performingActorHandle = actorlessResult
        ? null
        : request.ruling.normalizedIntent.targets.find((target) =>
          target.kind === "actor")?.handle ?? null;
      return {
        ...compiler.compile(
          request.frame,
          request.ruling,
          request.resolution,
          request.uncertaintyAuthority,
          {
            elapsedMinutes: request.ruling.elapsedBounds.minimumMinutes,
            effects: [
              ...movementEffects,
              ...Array.from({ length: worldEventCount }, (_, index) => ({
                kind: "record_world_event" as const,
                eventClass: performingActorHandle === null ? "scene" as const : "dialogue" as const,
                performingActorHandle,
                summary: includeSubmittedText
                  ? `${request.ruling.normalizedIntent.originalText} (trace ${index + 1}).`
                  : worldEventCount === 1
                  ? "Mara tests the signal keepers' account against the ringing tower."
                  : `Mara tests signal account ${index + 1} against the ringing tower.`,
                affectedHandles: request.ruling.movementRouteHandle === null
                  ? [playerHandle, locationHandle]
                  : [playerHandle],
              })),
            ],
          },
        ),
        semanticReview: { kind: "not_required" as const },
        modelEvidence,
      };
    }),
  };
}

function repeatedDialogueErrorForRequest(
  request: Parameters<ReturnType<typeof createCampaignPlayGameMaster>["plan"]>[0],
): CampaignPlayGameMasterError {
  const continuity = request.frame.actorContinuity.find((entry) =>
    entry.recentOwnActions.length > 0);
  if (!continuity) throw new Error("Recovery fixture requires actor continuity.");
  const playerHandle = request.frame.handleBindings.find((binding) =>
    binding.reference.kind === "actor" && binding.reference.id === PLAYER_ID)?.handle;
  const locationHandle = request.frame.visibleFacts.find((fact) => fact.kind === "location")?.handle;
  if (!playerHandle || !locationHandle) {
    throw new Error("Recovery fixture requires player and location handles.");
  }
  const recentSummary = continuity.recentOwnActions[0]!.summary;
  try {
    createCampaignPlayGameMaster().compile(
      request.frame,
      request.ruling,
      request.resolution,
      request.uncertaintyAuthority,
      {
        elapsedMinutes: request.ruling.elapsedBounds.minimumMinutes,
        effects: [{
          kind: "record_world_event",
          eventClass: "dialogue",
          performingActorHandle: continuity.actorHandle,
          summary: recentSummary,
          affectedHandles: [playerHandle, locationHandle],
        }],
      },
    );
  } catch (error) {
    if (error instanceof CampaignPlayGameMasterError) return error;
    throw error;
  }
  throw new Error("Recovery fixture did not reject the repeated dialogue.");
}

function ambientContactJudgeFixture() {
  const compiler = createCampaignPlayJudge();
  return {
    judge: vi.fn(async (request: Parameters<ReturnType<typeof createCampaignPlayJudge>["judge"]>[0]) => {
      const ruling = compiler.compile(request.frame, request.input, {
        kind: "contact",
        targets: [{ handle: request.frame.locationHandle, kind: "location" }],
        visibleActorReactions: request.frame.visibleFacts
          .filter((fact) => fact.kind === "actor" && fact.handle !== request.frame.playerActorHandle)
          .map((fact) => ({
            actorHandle: fact.handle,
            reaction: "none" as const,
            supportingVisibleFactHandle: null,
            reason: "The contact is addressed to an unnamed ambient presence.",
          })),
        method: "Offer an unnamed courier a free satchel inspection and ask their name.",
        stakes: "Find paid repair work before the next eastbound run.",
        movementRouteHandle: null,
        possessionEffectAuthority: { kind: "none" },
        requiredObligationEffect: { kind: "none" },
        disposition: "deterministic",
        citedVisibleFactHandles: [request.frame.locationHandle],
        resultBounds: { minimum: "success", maximum: "success" },
        elapsedBounds: { minimumMinutes: 2, maximumMinutes: 3 },
        uncertainty: { kind: "none" },
        reason: "Unnamed couriers are visibly present and can answer without creating a binding exchange.",
        clarificationQuestion: null,
      });
      return { ruling, rulingHash: "f".repeat(64), modelEvidence: acceptedEvidence("test-judge") };
    }),
  };
}

function supportActorGameMasterFixture() {
  const compiler = createCampaignPlayGameMaster();
  return {
    plan: vi.fn(async (request: Parameters<ReturnType<typeof createCampaignPlayGameMaster>["plan"]>[0]) => {
      const playerHandle = request.frame.handleBindings.find((binding) =>
        binding.reference.kind === "actor" && binding.reference.id === PLAYER_ID)!.handle;
      const locationHandle = request.frame.handleBindings.find((binding) =>
        binding.reference.kind === "location" && binding.handle === request.frame.visibleFacts.find((fact) =>
          fact.kind === "location")?.handle)!.handle;
      return {
        ...compiler.compile(
          request.frame,
          request.ruling,
          request.resolution,
          request.uncertaintyAuthority,
          {
            elapsedMinutes: 3,
            effects: [
              {
                kind: "materialize_support_actor" as const,
                actorHandle: "introduced-support-actor",
                name: "Dario Calvo",
                summary: "An independent courier whose rain-softened satchel strap needs repair before an eastbound run.",
                goal: "Have the satchel strap repaired before the next eastbound run.",
                motivation: "Black rain has softened the stitching beside the buckle.",
                nextIntentKind: "wait" as const,
                nextAction: "Wait beside the open toolkit with the damaged strap extended.",
                observableTrace: "A courier sets a weathered satchel beside the open toolkit.",
                cadenceMinutes: 5,
              },
              {
                kind: "record_world_event" as const,
                eventClass: "dialogue" as const,
                performingActorHandle: "introduced-support-actor",
                summary: "Dario Calvo sets his satchel beside the toolkit and shows Nera the rain-softened stitching at its buckle.",
                affectedHandles: ["introduced-support-actor", playerHandle, locationHandle],
              },
            ],
          },
        ),
        semanticReview: { kind: "not_required" as const },
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
  modelIdentity?: { providerId: string; requestedModel: string },
) {
  const requested = (fallbackModel: string) => ({
    providerId: modelIdentity?.providerId ?? "test",
    model: modelIdentity?.requestedModel ?? fallbackModel,
    strategy: "strict_object" as const,
    pricing: TEST_MODEL_PRICING,
  });
  const actorReplanner = createCampaignPlayActorReplanner(handle, {
    now: time.clock.now,
    generateObject: (async (request: { prompt: string }) => ({
      object: actorReplanModelObjectFromPrompt(request.prompt),
      trace: actorReplanTrace(),
    })) as unknown as typeof safeGenerateObject,
  });
  return createCampaignPlayTurnRuntime({
    handle,
    owner: "turn-runtime-worker",
    leaseDurationMs: 1_000,
    heartbeatIntervalMs: 100,
    uncertaintySeedKey: "turn-runtime-test-seed-key-with-32-bytes",
    clock: time.clock,
    judgeModel: {
      languageModel: {} as LanguageModel,
      requested: requested("test-judge"),
      temperature: 0.2,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 1_000,
      maximumTotalTokens: 2_000,
      maximumCostMicros: 10_000,
    },
    gameMasterModel: {
      languageModel: {} as LanguageModel,
      requested: requested("test-game-master"),
      temperature: 0.2,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 1_000,
      maximumTotalTokens: 2_000,
      maximumCostMicros: 10_000,
    },
    actorReplannerModel: {
      languageModel: {} as LanguageModel,
      requested: requested("test-actor-replanner"),
      temperature: 0.2,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 1_000,
      maximumTotalTokens: 2_000,
      maximumCostMicros: 10_000,
    },
    narratorModel: {
      languageModel: {} as LanguageModel,
      requested: requested("test-narrator"),
      temperature: 0.3,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 2_048,
      maximumTotalTokens: 3_048,
      maximumCostMicros: 10_000,
    },
    judge,
    gameMaster,
    actorReplanner,
    narrator: playerNarratorFixture(),
    ...overrides,
  });
}

type TestNarrator = NonNullable<Parameters<typeof createCampaignPlayTurnRuntime>[0]["narrator"]>;

function playerActionMechanicsSnapshot(handle: CampaignPlayDatabaseHandle, turnId: string) {
  const receiptIds = (handle.sqlite.prepare(`SELECT receipt_id AS receiptId
    FROM campaign_play_receipts WHERE campaign_id = ? AND turn_id = ? ORDER BY receipt_id`)
    .all(CAMPAIGN_ID, turnId) as Array<{ receiptId: string }>).map((row) => row.receiptId);
  return {
    modelStages: countForTurn(handle, "campaign_play_model_stages", turnId),
    commands: countForTurn(handle, "campaign_play_commands", turnId),
    receipts: countForTurn(handle, "campaign_play_receipts", turnId),
    turnResults: countForTurn(handle, "campaign_play_turn_results", turnId),
    runtimeEvents: countForTurn(handle, "campaign_play_runtime_events", turnId),
    receiptIds,
    authority: handle.sqlite.prepare(`SELECT world_version AS worldVersion,
        runtime_revision AS runtimeRevision
      FROM campaign_play_states WHERE campaign_id = ?`).get(CAMPAIGN_ID) as {
        worldVersion: number;
        runtimeRevision: number;
      },
  };
}

async function createCompletedPlayerActionForApplication(
  time = fixedClock(7_500),
  submittedAt = time.clock.now(),
) {
  const fixture = await createReadyCampaignWithOpening();
  const mechanicsRuntime = turnRuntime(
    fixture.handle,
    time,
    judgeFixture("deterministic"),
    gameMasterFixture(),
    { narrator: playerNarratorFixture() },
  );
  const admission = mechanicsRuntime.admitAction({
    request: admissionRequest(fixture.state, "application-driver-action"),
    submittedAt,
  });
  await advanceUntilStage(mechanicsRuntime, time, admission.turnId, "completed");
  const pending = createCampaignPlayReadModel(fixture.handle).loadState().narrationOperation;
  if (!pending) throw new Error("Application driver fixture did not create a pending narration operation.");
  return {
    time,
    turnId: admission.turnId,
    pending,
    mechanics: playerActionMechanicsSnapshot(fixture.handle, admission.turnId),
    handle: fixture.handle,
  };
}

async function runPendingNarrationThroughApplication(narrator: TestNarrator) {
  const prepared = await createCompletedPlayerActionForApplication();
  closeTracked(prepared.handle);
  const application = createCampaignPlayApplication({
    now: prepared.time.clock.now,
    runtimeFactory: {
      createOpening: () => { throw new Error("Opening is outside narration recovery."); },
      createTurn: (handle) => turnRuntime(
        handle,
        prepared.time,
        judgeFixture("deterministic"),
        gameMasterFixture(),
        { narrator },
      ),
    },
  });
  await application.recoverCampaign(CAMPAIGN_ID);
  await application.waitForIdle(CAMPAIGN_ID);
  return {
    ...prepared,
    application,
    handle: track(openCampaignPlayDatabase(CAMPAIGN_ID)),
  };
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

function renderedMoveSuggestion(handle: CampaignPlayDatabaseHandle): {
  choiceHandle: string;
  label: string;
} {
  const row = handle.sqlite.prepare(`SELECT packet_json AS packetJson,
      suggested_actions_json AS suggestedActionsJson
    FROM campaign_play_narrations WHERE campaign_id = ? AND status = 'complete'
    ORDER BY completed_at DESC LIMIT 1`).get(CAMPAIGN_ID) as {
      packetJson: string;
      suggestedActionsJson: string;
    };
  const packet = JSON.parse(row.packetJson) as CampaignPlayNarratorPacket;
  const move = packet.availableIntents.find((intent) => intent.kind === "move");
  if (!move) throw new Error("Opening fixture has no rendered move intent.");
  const suggestion = (JSON.parse(row.suggestedActionsJson) as Array<{
    choiceHandle: string;
    label: string;
  }>).find((candidate) => candidate.choiceHandle === move.handle);
  if (!suggestion) throw new Error("Opening fixture did not render its move intent.");
  return suggestion;
}

function renderedWaitSuggestion(handle: CampaignPlayDatabaseHandle): {
  choiceHandle: string;
  label: string;
} {
  const row = handle.sqlite.prepare(`SELECT packet_json AS packetJson,
      suggested_actions_json AS suggestedActionsJson
    FROM campaign_play_narrations WHERE campaign_id = ? AND status = 'complete'
    ORDER BY completed_at DESC LIMIT 1`).get(CAMPAIGN_ID) as {
      packetJson: string;
      suggestedActionsJson: string;
    };
  const packet = JSON.parse(row.packetJson) as CampaignPlayNarratorPacket;
  const wait = packet.availableIntents.find((intent) => intent.kind === "wait");
  if (!wait) throw new Error("Opening fixture has no rendered wait intent.");
  const suggestion = (JSON.parse(row.suggestedActionsJson) as Array<{
    choiceHandle: string;
    label: string;
  }>).find((candidate) => candidate.choiceHandle === wait.handle);
  if (!suggestion) throw new Error("Opening fixture did not render its wait intent.");
  return suggestion;
}

function dropCampaignPlayGuards(handle: CampaignPlayDatabaseHandle): void {
  for (const row of handle.sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'trigger'",
  ).all() as Array<{ name: string }>) {
    if (row.name.startsWith("campaign_play_")) {
      handle.sqlite.exec(`DROP TRIGGER ${row.name}`);
    }
  }
}

function controlBudgetContinuityAudit(): string {
  return canonicalizeCampaignPlayProjection({
    kind: "control_budget_continuity",
    reason: "authority_budget",
    sourceMomentHash: "a".repeat(64),
  });
}

function renderedContactSuggestion(
  handle: CampaignPlayDatabaseHandle,
  requireQuestion = true,
): {
  choiceHandle: string;
  label: string;
} {
  const row = handle.sqlite.prepare(`SELECT packet_json AS packetJson,
      suggested_actions_json AS suggestedActionsJson
    FROM campaign_play_narrations WHERE campaign_id = ? AND status = 'complete'
    ORDER BY completed_at DESC LIMIT 1`).get(CAMPAIGN_ID) as {
      packetJson: string;
      suggestedActionsJson: string;
  };
  const packet = JSON.parse(row.packetJson) as CampaignPlayNarratorPacket;
  const contacts = packet.availableIntents.filter((intent) => intent.kind === "contact");
  if (contacts.length === 0) throw new Error("Opening fixture has no rendered contact intent.");
  const suggestions = JSON.parse(row.suggestedActionsJson) as Array<{
    choiceHandle: string;
    label: string;
  }>;
  const suggestion = suggestions.find((candidate) => contacts.some((contact) =>
    contact.handle === candidate.choiceHandle &&
    (!requireQuestion || /^Talk to .+: ask /.test(candidate.label))));
  if (!suggestion) throw new Error("Opening fixture did not render a matching contact intent.");
  return suggestion;
}

function renderedObserveSuggestion(handle: CampaignPlayDatabaseHandle): {
  choiceHandle: string;
  label: string;
} {
  const row = handle.sqlite.prepare(`SELECT packet_json AS packetJson,
      suggested_actions_json AS suggestedActionsJson
    FROM campaign_play_narrations WHERE campaign_id = ? AND status = 'complete'
    ORDER BY completed_at DESC LIMIT 1`).get(CAMPAIGN_ID) as {
      packetJson: string;
      suggestedActionsJson: string;
    };
  const packet = JSON.parse(row.packetJson) as CampaignPlayNarratorPacket;
  const observe = packet.availableIntents.find((intent) => intent.kind === "observe");
  if (!observe) throw new Error("Opening fixture has no rendered observe intent.");
  const suggestion = (JSON.parse(row.suggestedActionsJson) as Array<{
    choiceHandle: string;
    label: string;
  }>).find((candidate) => candidate.choiceHandle === observe.handle);
  if (!suggestion) throw new Error("Opening fixture did not render its observe intent.");
  return suggestion;
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
  const step = {
    intent,
    observableTrace: "Fresh archive tabs mark a recently checked signal ledger.",
    possessionOutcome: { kind: "none" as const },
    obligationOutcome: { kind: "none" as const },
    elapsedBounds: { minimumMinutes: 2, maximumMinutes: 10 },
  };
  return {
    goalHandle: goal.handle,
    cadenceMinutes: 15,
    priority: 4,
    intent,
    steps: [step, step, step],
  };
}

function actorReplanModelObjectFromPrompt(prompt: string) {
  return prompt.includes("ACTOR_PLAN_REVIEW\n")
    ? { verdict: "accepted" as const, violations: [] }
    : actorReplanProposalFromPrompt(prompt);
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
      if (job.planId !== null) {
        const updated = context.sqlite.prepare(`UPDATE campaign_play_actor_plans
          SET status = 'completed', updated_at = ?
          WHERE campaign_id = ? AND plan_id = ? AND status = 'active'`).run(
            claimedAt,
            context.campaignId,
            job.planId,
          );
        if (updated.changes !== 1) throw new Error("Actor replan fixture lost its active plan.");
      }
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
  it("routes the exact current rendered inspection directly to Game Master and keeps freeform on Judge", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(10_000);
    const time = fixedClock(1_925);
    const judge = judgeFixture("deterministic");
    const gameMaster = gameMasterFixture();
    const narrator = playerNarratorFixture();
    const runtime = turnRuntime(handle, time, judge, gameMaster, { narrator });
    const observe = renderedObserveSuggestion(handle);
    const admission = runtime.admitAction({
      request: {
        idempotencyKey: "certified-rendered-observe",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: observe.choiceHandle,
      },
      submittedAt: 1_925,
    });
    const frame = loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(admission.turnId)!);
    expect(frame.executionRoute).toMatchObject({
      kind: "certified_observe",
      certificate: {
        actionSchemaVersion: 1,
        resolver: "game_master",
        choiceHandle: observe.choiceHandle,
        label: observe.label,
        detail: "the immediate situation",
        ruling: {
          normalizedIntent: {
            kind: "observe",
            method: "the immediate situation",
          },
          elapsedBounds: { minimumMinutes: 1, maximumMinutes: 1 },
        },
      },
      certificateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      modelSelection: { routeKind: "certified_observe" },
    });

    time.advance();
    await runtime.runNextStage(admission.turnId);
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "planned" });
    expect(judge.judge).toHaveBeenCalledTimes(0);
    expect(gameMaster.plan).toHaveBeenCalledTimes(1);
    expect(runtime.loadTelemetry(admission.turnId)).toMatchObject({
      routeKind: "certified_observe",
      modelCallCounts: { judge: 0, gameMaster: 1 },
    });
    await advanceUntilStage(runtime, time, admission.turnId, "completed");
    await runtime.runNarration(admission.turnId);
    expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(1);
    expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBeGreaterThan(0);

    const nextState = createCampaignPlayStateRepository(handle).loadState()!;
    const freeform = runtime.admitAction({
      request: admissionRequest(nextState, "same-observe-as-freeform", observe.label),
      submittedAt: time.clock.now(),
    });
    expect(loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(freeform.turnId)!)
      .executionRoute).toEqual({ kind: "full_authority" });
    time.advance();
    await runtime.runNextStage(freeform.turnId);
    expect(judge.judge).toHaveBeenCalledTimes(1);
  });

  it("routes the exact current rendered wait directly to Game Master and keeps same-text freeform on Judge", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(10_000, { includeWait: true });
    const time = fixedClock(1_930);
    const judge = judgeFixture("deterministic");
    const gameMaster = gameMasterFixture();
    const narrator = playerNarratorFixture();
    const runtime = turnRuntime(handle, time, judge, gameMaster, { narrator });
    const wait = renderedWaitSuggestion(handle);
    expect(createCampaignPlayReadModel(handle).loadState().utilityActions).toEqual([]);
    const admission = runtime.admitAction({
      request: {
        idempotencyKey: "certified-rendered-wait",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: wait.choiceHandle,
      },
      submittedAt: 1_930,
    });
    const frame = loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(admission.turnId)!);
    expect(frame.executionRoute).toMatchObject({
      kind: "certified_wait",
      certificate: {
        actionSchemaVersion: 1,
        resolver: "game_master",
        choiceHandle: wait.choiceHandle,
        label: "Wait 10 minutes",
        waitMinutes: 10,
      },
    });

    time.advance();
    await runtime.runNextStage(admission.turnId);
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "planned" });
    expect(judge.judge).toHaveBeenCalledTimes(0);
    expect(gameMaster.plan).toHaveBeenCalledTimes(1);
    expect(runtime.loadTelemetry(admission.turnId)).toMatchObject({
      routeKind: "certified_wait",
      modelCallCounts: { judge: 0, gameMaster: 1 },
    });
    await advanceUntilStage(runtime, time, admission.turnId, "completed");
    await runtime.runNarration(admission.turnId);
    expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(1);
    expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBeGreaterThan(0);

    const nextState = createCampaignPlayStateRepository(handle).loadState()!;
    const freeform = runtime.admitAction({
      request: admissionRequest(nextState, "same-wait-as-freeform", wait.label),
      submittedAt: time.clock.now(),
    });
    expect(loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(freeform.turnId)!)
      .executionRoute).toEqual({ kind: "full_authority" });
    time.advance();
    await runtime.runNextStage(freeform.turnId);
    expect(judge.judge).toHaveBeenCalledTimes(1);
  });

  it("resumes a certified wait under a fresh epoch without Judge or duplicate settlement", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(10_000, { includeWait: true });
    const time = fixedClock(1_940);
    const judge = judgeFixture("deterministic");
    const successful = gameMasterFixture();
    const bypassModel = {} as LanguageModel;
    const reasoningModel = {} as LanguageModel;
    const observedModels: LanguageModel[] = [];
    const observedModes: Array<"auto" | "tool" | undefined> = [];
    let calls = 0;
    const gameMaster = {
      plan: vi.fn(async (request: Parameters<typeof successful.plan>[0]) => {
        observedModels.push(request.model);
        observedModes.push(request.structuredOutputMode);
        calls += 1;
        if (calls === 1) throw new CampaignPlayGameMasterError("stage_timeout", null);
        return successful.plan(request);
      }),
    };
    const runtime = turnRuntime(handle, time, judge, gameMaster, {
      certifiedGameMasterModel: {
        languageModel: bypassModel,
        reasoningModel,
        requested: {
          providerId: "test",
          model: "test-certified-game-master",
          strategy: "strict_object",
          pricing: TEST_MODEL_PRICING,
        },
        temperature: 0.2,
        maximumInputTokens: 1_000,
        maximumOutputTokens: 1_000,
        maximumTotalTokens: 2_000,
        maximumCostMicros: 10_000,
      },
    });
    const wait = renderedWaitSuggestion(handle);
    const admission = runtime.admitAction({
      request: {
        idempotencyKey: "certified-wait-recovery",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: wait.choiceHandle,
      },
      submittedAt: 1_940,
    });
    time.advance();
    await runtime.runNextStage(admission.turnId);
    const interrupted = runtime.loadTurn(admission.turnId)!;
    expect(interrupted).toMatchObject({
      stage: "interrupted", interruptedStage: "admitted", workerEpoch: 1, resumeEligible: true,
    });
    time.advance();
    await runtime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "admitted",
      observedEpoch: interrupted.workerEpoch,
    });
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "planned", workerEpoch: 2 });
    expect(judge.judge).toHaveBeenCalledTimes(0);
    expect(gameMaster.plan).toHaveBeenCalledTimes(2);
    expect(observedModels).toEqual([bypassModel, bypassModel]);
    expect(observedModes).toEqual(["auto", "auto"]);
    await advanceUntilStage(runtime, time, admission.turnId, "completed");
    expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(1);
    expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBeGreaterThan(0);
  });

  it("rejects a stale utility wait handle before any provider call", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(10_000, { includeWait: true });
    const runtimeEventsBefore = countForCampaign(handle, "campaign_play_runtime_events");
    const judge = judgeFixture("deterministic");
    const gameMaster = gameMasterFixture();
    const runtime = turnRuntime(handle, fixedClock(1_950), judge, gameMaster);
    const currentWait = renderedWaitSuggestion(handle);
    expect(currentWait.label).toBe("Wait 10 minutes");
    expect(() => runtime.admitAction({
      request: {
        idempotencyKey: "stale-utility-wait",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: "choice_ffffffffffffffffffffffff",
      },
      submittedAt: 1_950,
    })).toThrowError(expect.objectContaining({ code: "turn_request_invalid" }));
    expect(judge.judge).toHaveBeenCalledTimes(0);
    expect(gameMaster.plan).toHaveBeenCalledTimes(0);
    expect(countForCampaign(handle, "campaign_play_turns")).toBe(1);
    expect(countForCampaign(handle, "campaign_play_runtime_events")).toBe(runtimeEventsBefore);
  });

  it("routes an exact rendered question to the visible actor without Judge and keeps freeform on Judge", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(10_000, {
      contactDetail: "ask about the immediate situation",
    });
    const baseTime = fixedClock(1_945);
    const waitDelays: number[] = [];
    const time = {
      ...baseTime,
      clock: {
        ...baseTime.clock,
        wait(delayMs: number, signal: AbortSignal) {
          waitDelays.push(delayMs);
          return baseTime.clock.wait(delayMs, signal);
        },
      },
    };
    const judge = judgeFixture("deterministic");
    const gameMaster = gameMasterFixture(1, true);
    const narrator = playerNarratorFixture();
    const runtime = turnRuntime(handle, time, judge, gameMaster, {
      narrator,
      externalOperationDeadlineMs: 30_000,
      gameMasterOperationDeadlineMs: 45_000,
    });
    const contact = renderedContactSuggestion(handle);
    const admission = runtime.admitAction({
      request: {
        idempotencyKey: "certified-rendered-contact",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: contact.choiceHandle,
      },
      submittedAt: 1_945,
    });
    const frame = loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(admission.turnId)!);
    expect(frame.executionRoute).toMatchObject({
      kind: "certified_contact",
      certificate: {
        actionSchemaVersion: 1,
        resolver: "game_master",
        choiceHandle: contact.choiceHandle,
        label: contact.label,
        targetActorHandle: expect.any(String),
        detail: "ask about the immediate situation",
        ruling: {
          normalizedIntent: {
            kind: "contact",
            method: "ask about the immediate situation",
          },
          elapsedBounds: { minimumMinutes: 1, maximumMinutes: 1 },
        },
      },
      certificateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      modelSelection: { routeKind: "certified_contact" },
    });

    time.advance();
    await runtime.runNextStage(admission.turnId);
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "planned" });
    expect(judge.judge).toHaveBeenCalledTimes(0);
    expect(gameMaster.plan).toHaveBeenCalledTimes(1);
    expect(waitDelays).toContain(45_000);
    expect(waitDelays).not.toContain(30_000);
    expect(runtime.loadTelemetry(admission.turnId)).toMatchObject({
      routeKind: "certified_contact",
      modelCallCounts: { judge: 0, gameMaster: 1 },
    });
    await advanceUntilStage(runtime, time, admission.turnId, "completed");
    await runtime.runNarration(admission.turnId);
    expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(1);
    expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBeGreaterThan(0);

    const nextState = createCampaignPlayStateRepository(handle).loadState()!;
    const freeform = runtime.admitAction({
      request: admissionRequest(nextState, "same-contact-as-freeform", contact.label),
      submittedAt: time.clock.now(),
    });
    waitDelays.length = 0;
    expect(loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(freeform.turnId)!)
      .executionRoute).toEqual({ kind: "full_authority" });
    time.advance();
    await runtime.runNextStage(freeform.turnId);
    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(waitDelays).toContain(30_000);
    expect(waitDelays).not.toContain(45_000);
    waitDelays.length = 0;
    time.advance();
    await runtime.runNextStage(freeform.turnId);
    expect(gameMaster.plan).toHaveBeenCalledTimes(2);
    expect(waitDelays).toContain(45_000);
  });

  it("uses default reasoning for a certified semantic recovery without Judge or duplicate settlement", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(10_000, {
      contactDetail: "ask about the immediate situation",
    });
    const time = fixedClock(1_947);
    const judge = judgeFixture("deterministic");
    const successful = gameMasterFixture();
    const bypassModel = {} as LanguageModel;
    const reasoningModel = {} as LanguageModel;
    const observedModels: LanguageModel[] = [];
    const observedModes: Array<"auto" | "tool" | undefined> = [];
    let calls = 0;
    const gameMaster = {
      plan: vi.fn(async (request: Parameters<typeof successful.plan>[0]) => {
        observedModels.push(request.model);
        observedModes.push(request.structuredOutputMode);
        calls += 1;
        if (calls === 1) throw new CampaignPlayGameMasterError("model_contract_failed", null);
        return successful.plan(request);
      }),
    };
    const runtime = turnRuntime(handle, time, judge, gameMaster, {
      certifiedGameMasterModel: {
        languageModel: bypassModel,
        reasoningModel,
        requested: {
          providerId: "test",
          model: "test-certified-game-master",
          strategy: "strict_object",
          pricing: TEST_MODEL_PRICING,
        },
        temperature: 0.2,
        maximumInputTokens: 1_000,
        maximumOutputTokens: 1_000,
        maximumTotalTokens: 2_000,
        maximumCostMicros: 10_000,
      },
    });
    const contact = renderedContactSuggestion(handle);
    const admission = runtime.admitAction({
      request: {
        idempotencyKey: "certified-contact-recovery",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: contact.choiceHandle,
      },
      submittedAt: 1_947,
    });
    time.advance();
    await runtime.runNextStage(admission.turnId);
    const interrupted = runtime.loadTurn(admission.turnId)!;
    expect(interrupted).toMatchObject({
      stage: "interrupted", interruptedStage: "admitted", workerEpoch: 1, resumeEligible: true,
    });
    expect(judge.judge).toHaveBeenCalledTimes(0);
    time.advance();
    await runtime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "admitted",
      observedEpoch: interrupted.workerEpoch,
    });
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "planned", workerEpoch: 2 });
    expect(judge.judge).toHaveBeenCalledTimes(0);
    expect(gameMaster.plan).toHaveBeenCalledTimes(2);
    expect(observedModels).toEqual([bypassModel, reasoningModel]);
    expect(observedModes).toEqual(["auto", "auto"]);
    await advanceUntilStage(runtime, time, admission.turnId, "completed");
    expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(1);
  });

  it("forwards safe Game Master recovery feedback on a certified route once", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(10_000, {
      contactDetail: "ask about the immediate situation",
    });
    const time = fixedClock(1_947_5);
    const judge = judgeFixture("deterministic");
    const acceptedGameMaster = gameMasterFixture();
    const bypassModel = {} as LanguageModel;
    const reasoningModel = {} as LanguageModel;
    const observedRequests: Array<Parameters<typeof acceptedGameMaster.plan>[0]> = [];
    let calls = 0;
    const gameMaster = {
      plan: vi.fn(async (request: Parameters<typeof acceptedGameMaster.plan>[0]) => {
        observedRequests.push(request);
        calls += 1;
        if (calls === 1) throw repeatedDialogueErrorForRequest(request);
        return acceptedGameMaster.plan(request);
      }),
    };
    let recoveredFeedback: CampaignPlayGameMasterRecoveryFeedback | undefined;
    const firstRuntime = turnRuntime(handle, time, judge, gameMaster, {
      certifiedGameMasterModel: {
        languageModel: bypassModel,
        reasoningModel,
        requested: {
          providerId: "test",
          model: "test-certified-game-master",
          strategy: "strict_object",
          pricing: TEST_MODEL_PRICING,
        },
        temperature: 0.2,
        maximumInputTokens: 1_000,
        maximumOutputTokens: 1_000,
        maximumTotalTokens: 2_000,
        maximumCostMicros: 10_000,
      },
      onGameMasterRecoveryFeedback: (feedback) => { recoveredFeedback = feedback; },
    });
    const contact = renderedContactSuggestion(handle);
    const admission = firstRuntime.admitAction({
      request: {
        idempotencyKey: "certified-contact-dialogue-recovery",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: contact.choiceHandle,
      },
      submittedAt: time.clock.now(),
    });
    time.advance();
    await firstRuntime.runNextStage(admission.turnId);
    const interrupted = firstRuntime.loadTurn(admission.turnId)!;
    expect(interrupted).toMatchObject({
      stage: "interrupted",
      interruptedStage: "admitted",
      errorCode: "model_contract_invalid",
      resumeEligible: true,
    });
    expect(judge.judge).toHaveBeenCalledTimes(0);
    expect(recoveredFeedback).toEqual({
      diagnostic: "game_master_semantic_validation_mismatch",
      failedChecks: [{
        check: "repeated_actor_dialogue",
        effectIndex: 0,
        fieldPath: "effects[0].summary",
        performingActorHandle: expect.any(String),
        recentOwnActionIndex: 0,
      }],
    });
    if (recoveredFeedback === undefined) throw new Error("Expected safe Game Master recovery feedback.");
    const firstRequest = observedRequests[0]!;
    expect(firstRequest.recoveryFeedback).toBeUndefined();
    const secondRuntime = turnRuntime(handle, time, judge, gameMaster, {
      certifiedGameMasterModel: {
        languageModel: bypassModel,
        reasoningModel,
        requested: {
          providerId: "test",
          model: "test-certified-game-master",
          strategy: "strict_object",
          pricing: TEST_MODEL_PRICING,
        },
        temperature: 0.2,
        maximumInputTokens: 1_000,
        maximumOutputTokens: 1_000,
        maximumTotalTokens: 2_000,
        maximumCostMicros: 10_000,
      },
      gameMasterRecoveryFeedback: recoveredFeedback,
    });
    time.advance();
    await secondRuntime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "admitted",
      observedEpoch: interrupted.workerEpoch,
    });
    await advanceUntilStage(secondRuntime, time, admission.turnId, "completed");
    expect(observedRequests).toHaveLength(2);
    expect(observedRequests.map((request) => request.model)).toEqual([bypassModel, bypassModel]);
    expect(observedRequests[1]!.recoveryFeedback).toEqual(recoveredFeedback);
    expect(observedRequests[1]!.frame.sourceMoment).toBe(firstRequest.frame.sourceMoment);
    expect(observedRequests[1]!.ruling).toEqual(firstRequest.ruling);
    expect(observedRequests[1]!.resolution).toEqual(firstRequest.resolution);
    expect(judge.judge).toHaveBeenCalledTimes(0);
    expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(1);
    expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBeGreaterThan(0);
  });

  it("keeps a nonmatching rendered contact detail on full authority", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(10_000, {
      contactDetail: "greet the keeper",
    });
    const time = fixedClock(1_948);
    const judge = judgeFixture("deterministic");
    const gameMaster = gameMasterFixture();
    const runtime = turnRuntime(handle, time, judge, gameMaster);
    const contact = renderedContactSuggestion(handle, false);
    expect(contact.label).not.toMatch(/: ask /);
    const admission = runtime.admitAction({
      request: {
        idempotencyKey: "nonmatching-rendered-contact",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: contact.choiceHandle,
      },
      submittedAt: 1_948,
    });
    expect(loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(admission.turnId)!)
      .executionRoute).toEqual({ kind: "full_authority" });
    time.advance();
    await runtime.runNextStage(admission.turnId);
    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(gameMaster.plan).toHaveBeenCalledTimes(0);
  });

  it("routes the exact current rendered move directly to Game Master and keeps freeform on Judge", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(10_000);
    const time = fixedClock(1_950);
    const judge = judgeFixture("deterministic");
    const gameMaster = gameMasterFixture();
    const narrator = playerNarratorFixture();
    const runtime = turnRuntime(handle, time, judge, gameMaster, { narrator });
    const move = renderedMoveSuggestion(handle);
    const admitted = runtime.admitAction({
      request: {
        idempotencyKey: "certified-rendered-move",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: move.choiceHandle,
      },
      submittedAt: 1_950,
    });
    const admittedTurn = runtime.loadTurn(admitted.turnId)!;
    const frame = loadCampaignPlayPlayerActionAdmissionFrame(admittedTurn);
    expect(frame.executionRoute).toMatchObject({
      kind: "certified_move",
      certificate: {
        actionSchemaVersion: 1,
        resolver: "game_master",
        choiceHandle: move.choiceHandle,
        label: move.label,
      },
      certificateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(admittedTurn.modelSelection).toMatchObject({ routeKind: "certified_move" });

    time.advance();
    await runtime.runNextStage(admitted.turnId);
    expect(runtime.loadTurn(admitted.turnId)).toMatchObject({ stage: "planned" });
    expect(judge.judge).toHaveBeenCalledTimes(0);
    expect(gameMaster.plan).toHaveBeenCalledTimes(1);
    expect(runtime.loadTelemetry(admitted.turnId)).toMatchObject({
      routeKind: "certified_move",
      modelCallCounts: { judge: 0, gameMaster: 1 },
      stageExecutions: [expect.objectContaining({ stage: "admitted", outcome: "advanced" })],
    });

    await advanceUntilStage(runtime, time, admitted.turnId, "completed");
    expect(createCampaignPlayReadModel(handle).loadState()).toMatchObject({
      phase: "ready",
      narrationOperation: { status: "pending", turnId: admitted.turnId },
    });
    await runtime.runNarration(admitted.turnId);
    expect(narrator.narrate).toHaveBeenCalledTimes(1);
    expect(countForTurn(handle, "campaign_play_turn_results", admitted.turnId)).toBe(1);
    expect(countForTurn(handle, "campaign_play_receipts", admitted.turnId)).toBeGreaterThan(0);

    const nextState = createCampaignPlayStateRepository(handle).loadState()!;
    const freeform = runtime.admitAction({
      request: admissionRequest(nextState, "same-move-as-freeform", move.label),
      submittedAt: time.clock.now(),
    });
    expect(loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(freeform.turnId)!)
      .executionRoute).toEqual({ kind: "full_authority" });
    time.advance();
    await runtime.runNextStage(freeform.turnId);
    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(gameMaster.plan).toHaveBeenCalledTimes(1);
    expect(runtime.loadTelemetry(freeform.turnId)).toMatchObject({
      routeKind: "full_authority",
      modelCallCounts: { judge: 1, gameMaster: 0 },
    });
  });

  it("interrupts and resumes the certified move at the same Game Master authority boundary", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(10_000);
    const time = fixedClock(1_975);
    const judge = judgeFixture("deterministic");
    const successful = gameMasterFixture();
    let calls = 0;
    const gameMaster = {
      plan: vi.fn(async (request: Parameters<typeof successful.plan>[0]) => {
        calls += 1;
        if (calls === 1) {
          throw new CampaignPlayGameMasterError("stage_timeout", null);
        }
        return successful.plan(request);
      }),
    };
    const runtime = turnRuntime(handle, time, judge, gameMaster);
    const move = renderedMoveSuggestion(handle);
    const admission = runtime.admitAction({
      request: {
        idempotencyKey: "certified-move-recovery",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: move.choiceHandle,
      },
      submittedAt: 1_975,
    });

    time.advance();
    await runtime.runNextStage(admission.turnId);
    const interrupted = runtime.loadTurn(admission.turnId)!;
    expect(interrupted).toMatchObject({
      stage: "interrupted",
      interruptedStage: "admitted",
      workerEpoch: 1,
      resumeEligible: true,
    });
    expect(judge.judge).toHaveBeenCalledTimes(0);
    expect(gameMaster.plan).toHaveBeenCalledTimes(1);
    expect(runtime.loadTelemetry(admission.turnId)).toMatchObject({
      routeKind: "certified_move",
      modelCallCounts: { judge: 0, gameMaster: 1 },
    });

    time.advance();
    await runtime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "admitted",
      observedEpoch: interrupted.workerEpoch,
    });
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      stage: "planned",
      workerEpoch: 2,
      workerLeaseOwner: null,
    });
    expect(judge.judge).toHaveBeenCalledTimes(0);
    expect(gameMaster.plan).toHaveBeenCalledTimes(2);
    expect(runtime.loadTelemetry(admission.turnId)).toMatchObject({
      modelCallCounts: { judge: 0, gameMaster: 2 },
      modelAttempts: [
        expect.objectContaining({ kind: "game_master", status: "interrupted", workerEpoch: 1 }),
        expect.objectContaining({ kind: "game_master", status: "accepted", workerEpoch: 2 }),
      ],
    });
  });

  it.each(["handle", "target", "parameters", "revision"] as const)(
    "rejects a certified move with mismatched %s authority before a provider call",
    async (mismatch) => {
      const { handle, state } = await createReadyCampaignWithOpening(10_000);
      const time = fixedClock(1_990);
      const judge = judgeFixture("deterministic");
      const gameMaster = gameMasterFixture();
      const runtime = turnRuntime(handle, time, judge, gameMaster);
      const move = renderedMoveSuggestion(handle);
      const admission = runtime.admitAction({
        request: {
          idempotencyKey: `certified-move-mismatch-${mismatch}`,
          expectedWorldVersion: state.authority.worldVersion,
          expectedRuntimeRevision: state.authority.runtimeRevision,
          source: "suggested",
          choiceHandle: move.choiceHandle,
        },
        submittedAt: 1_990,
      });
      const stored = runtime.loadTurn(admission.turnId)!;
      const document = structuredClone(stored.document);
      if (document.turnKind !== "player_action") throw new Error("Expected player action.");
      const route = document.frame.executionRoute as Record<string, unknown>;
      const certificate = route.certificate as Record<string, unknown>;
      const ruling = certificate.ruling as Record<string, unknown>;
      const normalizedIntent = ruling.normalizedIntent as Record<string, unknown>;
      if (mismatch === "handle") {
        certificate.choiceHandle = "choice_mismatched";
        normalizedIntent.choiceHandle = "choice_mismatched";
      } else if (mismatch === "target") {
        certificate.destinationLocationId = "location-mismatched";
      } else if (mismatch === "parameters") {
        const travelCost = Number(certificate.travelCost) + 1;
        certificate.travelCost = travelCost;
        ruling.elapsedBounds = { minimumMinutes: travelCost, maximumMinutes: travelCost };
      } else {
        certificate.baseRuntimeRevision = Number(certificate.baseRuntimeRevision) + 1;
      }
      route.certificateHash = hashCampaignPlayProjection({
        domain: "campaign_play_certified_move",
        certificate,
      });
      const inputJson = canonicalizeCampaignPlayProjection(document);
      expect(() => handle.sqlite.prepare(`UPDATE campaign_play_turns
          SET input_json = ?, input_hash = ?, frame_hash = ?
          WHERE campaign_id = ? AND id = ?`).run(
            inputJson,
            hashCampaignPlayProjection({ domain: "campaign_play_turn_input", document }),
            hashCampaignPlayProjection({
              domain: "campaign_play_turn_frame",
              frame: document.frame,
            }),
            CAMPAIGN_ID,
            admission.turnId,
          )).toThrow("campaign_play_turn_admission_immutable");
      expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "admitted" });
      expect(judge.judge).toHaveBeenCalledTimes(0);
      expect(gameMaster.plan).toHaveBeenCalledTimes(0);
    },
  );

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
      sourceMomentId: expect.any(String),
      player: {
        name: "Mara Venn",
        profileDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        profile: {
          backgroundSummary: "Mara repairs instruments and follows the storm's impossible harmonics.",
          personaSummary: "A careful mechanic following an impossible signal.",
          traits: ["Observant", "Methodical"],
          skills: [{ name: "Instrument repair", tier: "Master" }],
          specialties: ["Acoustic mechanisms"],
          motivations: ["Understand the celestial signal", "Protect vulnerable witnesses"],
        },
      },
      judgeInput: source === "freeform"
        ? { source: "freeform", choiceHandle: null }
        : { originalText: suggestion.label, source: "suggested", choiceHandle: suggestion.choiceHandle },
    });
    expect(isCanonicalHash(frame.sourceMomentHash)).toBe(true);
    expect(isCanonicalHash(frame.sourcePacketHash)).toBe(true);
    expect(JSON.stringify(frame.visibleFacts)).not.toContain("location-c");
    expect(JSON.stringify(frame.visibleFacts)).not.toContain(PLAYER_ID);
    expect(JSON.stringify(frame.visibleFacts)).not.toContain("impossible harmonics");
    if (source === "suggested") {
      expect(frame.choiceBindings).toContainEqual(expect.objectContaining({
        handle: suggestion.choiceHandle,
      }));
    }
  });

  it("gives Judge the player's depleted possession stacks as explicit mechanical facts", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(1_000);
    const time = fixedClock(2_050);
    const judgeCompiler = createCampaignPlayJudge();
    const spendJudge = {
      judge: vi.fn(async (request: Parameters<ReturnType<typeof createCampaignPlayJudge>["judge"]>[0]) => {
        const possession = request.frame.visibleFacts.find((fact) =>
          fact.kind === "possession" && fact.summary.startsWith("Repair roll:"))!;
        const ruling = judgeCompiler.compile(request.frame, request.input, {
          kind: "attempt",
          targets: [{ handle: possession.handle, kind: "possession" }],
          visibleActorReactions: request.frame.visibleFacts
            .filter((fact) => fact.kind === "actor" && fact.handle !== request.frame.playerActorHandle)
            .map((fact) => ({
              actorHandle: fact.handle,
              reaction: "none" as const,
              supportingVisibleFactHandle: null,
              reason: "No visible actor participates in the possession spend.",
            })),
          method: "Use the final repair roll on the damaged strap.",
          stakes: "Consume the repair roll while completing the repair.",
          movementRouteHandle: null,
          possessionEffectAuthority: {
            kind: "adjust_actor_possession",
            enforcement: "required",
            operation: "spend",
            possessionHandle: possession.handle,
            quantity: 1,
            minimumResult: "success",
          },
          requiredObligationEffect: { kind: "none" },
          disposition: "deterministic",
          citedVisibleFactHandles: [request.frame.locationHandle, possession.handle],
          resultBounds: { minimum: "success", maximum: "success" },
          elapsedBounds: { minimumMinutes: 1, maximumMinutes: 1 },
          uncertainty: { kind: "none" },
          reason: "The player has one visible repair roll available to spend.",
          clarificationQuestion: null,
        });
        return { ruling, rulingHash: "f".repeat(64), modelEvidence: acceptedEvidence("test-judge") };
      }),
    };
    const gameMasterCompiler = createCampaignPlayGameMaster();
    const spendGameMaster = {
      plan: vi.fn(async (request: Parameters<ReturnType<typeof createCampaignPlayGameMaster>["plan"]>[0]) => {
        const playerHandle = request.frame.handleBindings.find((binding) =>
          binding.reference.kind === "actor" && binding.reference.id === PLAYER_ID)!.handle;
        const possessionHandle = request.ruling.possessionEffectAuthority.kind === "adjust_actor_possession"
          ? request.ruling.possessionEffectAuthority.possessionHandle
          : null;
        return {
          ...gameMasterCompiler.compile(
            request.frame,
            request.ruling,
            request.resolution,
            request.uncertaintyAuthority,
            {
              elapsedMinutes: 1,
              effects: [{
                kind: "adjust_actor_possession" as const,
                operation: "spend" as const,
                actorHandle: playerHandle,
                possessionHandle: possessionHandle!,
                name: null,
                quantity: 1,
                summary: "The final repair roll is consumed while the strap is repaired.",
                affectedHandles: [],
              }],
            },
          ),
          semanticReview: { kind: "not_required" as const },
          modelEvidence: acceptedEvidence("test-game-master"),
        };
      }),
    };
    const spendRuntime = turnRuntime(handle, time, spendJudge, spendGameMaster);
    const spendTurn = spendRuntime.admitAction({
      request: admissionRequest(
        state,
        "spend-final-repair-roll",
        "I use my final repair roll to finish the damaged strap.",
      ),
      submittedAt: 2_050,
    });
    await advanceUntilStage(spendRuntime, time, spendTurn.turnId, "completed");
    expect(handle.sqlite.prepare(`SELECT quantity FROM campaign_play_actor_possessions
      WHERE campaign_id = ? AND actor_id = ? AND name = ?`).get(
        CAMPAIGN_ID,
        PLAYER_ID,
        "Repair roll",
      )).toEqual({ quantity: 0 });

    const continuedState = createCampaignPlayStateRepository(handle).loadState()!;
    const judge = judgeFixture("impossible");
    const runtime = turnRuntime(handle, time, judge, gameMasterFixture());
    const admitted = runtime.admitAction({
      request: admissionRequest(continuedState, "depleted-possession-frame"),
      submittedAt: 2_100,
    });
    time.advance();
    await runtime.runNextStage(admitted.turnId);

    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(judge.judge.mock.calls[0]![0].frame.depletedPlayerPossessions)
      .toEqual(["Repair roll"]);
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

  it("commits a newly contacted support actor with one receipt-backed plan and schedule", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_250);
    const runtime = turnRuntime(
      handle,
      time,
      ambientContactJudgeFixture(),
      supportActorGameMasterFixture(),
    );
    const admission = runtime.admitAction({
      request: admissionRequest(
        state,
        "support-actor-contact",
        "I offer the unnamed couriers a free satchel inspection and ask who leaves east next.",
      ),
      submittedAt: 2_250,
    });

    await advanceToPrimarySettlement(runtime, time, admission.turnId);

    const actor = handle.sqlite.prepare(`SELECT id, name, definition_authority AS definitionAuthority,
        causal_receipt_id AS causalReceiptId, world_version AS worldVersion
      FROM actors WHERE campaign_id = ? AND definition_authority = 'campaign_play'`)
      .get(CAMPAIGN_ID) as Record<string, unknown>;
    expect(actor).toMatchObject({
      name: "Dario Calvo",
      definitionAuthority: "campaign_play",
      causalReceiptId: expect.any(String),
      worldVersion: state.authority.worldVersion + 2,
    });
    expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM actor_goals
      WHERE campaign_id = ? AND actor_id = ?`).get(CAMPAIGN_ID, actor.id)).toEqual({ value: 1 });
    expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_actor_plans
      WHERE campaign_id = ? AND actor_id = ? AND status = 'active'`).get(CAMPAIGN_ID, actor.id))
      .toEqual({ value: 1 });
    expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_actor_schedules
      WHERE campaign_id = ? AND actor_id = ?`).get(CAMPAIGN_ID, actor.id)).toEqual({ value: 1 });

    await advanceUntilStage(runtime, time, admission.turnId, "completed");
    const materializationObservation = handle.sqlite.prepare(`SELECT observation.public_entry_json AS publicEntryJson
      FROM campaign_play_observations observation
      JOIN campaign_play_events event ON event.event_id = observation.event_id
        AND event.campaign_id = observation.campaign_id
      JOIN campaign_play_commands command ON command.command_id = event.command_id
        AND command.campaign_id = event.campaign_id
      WHERE event.turn_id = ? AND command.command_kind = 'materialize_support_actor'`)
      .get(admission.turnId) as { publicEntryJson: string };
    expect(JSON.parse(materializationObservation.publicEntryJson)).toMatchObject({
      title: "Seen nearby",
      text: "An independent courier whose rain-softened satchel strap needs repair before an eastbound run.",
      consequence: {
        whatChanged: "An independent courier whose rain-softened satchel strap needs repair before an eastbound run.",
      },
    });
    const continuedState = createCampaignPlayStateRepository(handle).loadState()!;
    const continuedAdmission = runtime.admitAction({
      request: admissionRequest(
        continuedState,
        "support-actor-continuity",
        "I agree to mend Dario's buckle strap before his eastbound run.",
      ),
      submittedAt: 2_300,
    });
    expect(continuedAdmission.turnId).toMatch(/^turn-player-action:/);
  });

  it("accepts compound contact through the exact visible route destination", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_250);
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic", "North Harbor Docks"),
      gameMasterFixture(),
    );
    const admission = runtime.admitAction({
      request: {
        ...admissionRequest(state, "compound-travel-contact"),
        text: "I take the route to North Harbor and ask who is organizing crossings today.",
      },
      submittedAt: 2_250,
    });

    time.advance();
    const judged = await runtime.runNextStage(admission.turnId);
    expect(judged.turn).toMatchObject({
      stage: "judged",
      interruptedStage: null,
      errorCode: null,
    });
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(0);
    const stage = handle.sqlite.prepare(`SELECT artifact_json AS artifactJson
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'judge' AND status = 'accepted'`)
      .get(CAMPAIGN_ID, admission.turnId) as { artifactJson: string };
    expect(JSON.parse(stage.artifactJson)).toMatchObject({
      ruling: {
        normalizedIntent: {
          kind: "contact",
          targets: expect.arrayContaining([
            expect.objectContaining({ kind: "location" }),
          ]),
        },
        movementRouteHandle: expect.any(String),
      },
    });
  });

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
    expect(judge.judge.mock.calls[0]![0].frame.sourceMoment).toBe(frame.sourceMoment.displayText);
    expect(gameMaster.plan.mock.calls[0]![0].frame.sourceMoment).toBe(frame.sourceMoment.displayText);
  });

  it("admits a visible nonplayer participant added to a frozen suggested action", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_325);
    const judge = judgeFixture("deterministic");
    const runtime = turnRuntime(handle, time, judge, gameMasterFixture());
    const openingNarration = handle.sqlite.prepare(`SELECT suggested_actions_json AS suggestedActionsJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND status = 'complete'
      ORDER BY completed_at DESC LIMIT 1`).get(CAMPAIGN_ID) as { suggestedActionsJson: string };
    const suggestions = JSON.parse(openingNarration.suggestedActionsJson) as Array<{
      choiceHandle: string;
    }>;
    const admission = runtime.admitAction({
      request: {
        idempotencyKey: "suggested-action-visible-participant",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        source: "suggested",
        choiceHandle: suggestions[0]!.choiceHandle,
      },
      submittedAt: 2_325,
    });
    const frame = loadCampaignPlayPlayerActionAdmissionFrame(runtime.loadTurn(admission.turnId)!);
    const binding = frame.choiceBindings.find((choice) =>
      choice.handle === suggestions[0]!.choiceHandle)!;
    const participant = frame.visibleFacts.find((fact) =>
      fact.kind === "actor" && fact.handle !== frame.player.actorHandle);
    expect(participant).toBeDefined();
    judge.selectChoice({
      kind: binding.kind,
      targets: [...binding.targets, { handle: participant!.handle, kind: "actor" }],
    });

    time.advance();
    const result = await runtime.runNextStage(admission.turnId);
    expect(result.turn).toMatchObject({
      stage: "judged",
      interruptedStage: null,
      errorCode: null,
    });
    expect(judge.judge).toHaveBeenCalledTimes(1);
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
    const bypassJudgeModel = { specificationVersion: "v3" } as unknown as LanguageModel;
    const reasoningJudgeModel = { specificationVersion: "v3" } as unknown as LanguageModel;
    const observedJudgeModels: LanguageModel[] = [];
    const observedJudgeModes: Array<"auto" | "tool" | undefined> = [];
    let interrupted = false;
    const judge = {
      judge: vi.fn(async (...args: Parameters<typeof acceptedJudge.judge>) => {
        observedJudgeModels.push(args[0].model);
        observedJudgeModes.push(args[0].structuredOutputMode);
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
    const runtime = turnRuntime(handle, time, judge, gameMaster, {
      judgeModel: {
        languageModel: bypassJudgeModel,
        reasoningModel: reasoningJudgeModel,
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
    });
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
    expect(observedJudgeModels).toEqual([bypassJudgeModel, bypassJudgeModel]);
    expect(observedJudgeModes).toEqual(["auto", "auto"]);
    expect(gameMaster.plan).toHaveBeenCalledTimes(1);
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(2);
  });

  it.each([
    {
      label: "model contract invalid",
      error: "model_contract_failed" as const,
      persistedErrorCode: "model_contract_invalid" as const,
      expectedSecondModel: "reasoning" as const,
    },
    {
      label: "provider unavailable",
      error: "transport_interrupted" as const,
      persistedErrorCode: "provider_unavailable" as const,
      expectedSecondModel: "language" as const,
    },
  ])(
    "keeps Judge attempt 2 in native structured-output mode after a no-feedback $label interruption",
    async ({ error, persistedErrorCode, expectedSecondModel }) => {
      const { handle, state } = await createReadyCampaignWithOpening();
      const time = fixedClock(2_610);
      const acceptedJudge = judgeFixture("deterministic");
      const languageModel = { specificationVersion: "v3" } as unknown as LanguageModel;
      const reasoningModel = { specificationVersion: "v3" } as unknown as LanguageModel;
      let calls = 0;
      const observedModels: LanguageModel[] = [];
      const observedModes: Array<"auto" | "tool" | undefined> = [];
      const judge = {
        judge: vi.fn(async (...args: Parameters<typeof acceptedJudge.judge>) => {
          calls += 1;
          observedModels.push(args[0].model);
          observedModes.push(args[0].structuredOutputMode);
          if (calls === 1) {
            throw new CampaignPlayJudgeError(error, {
              ...acceptedEvidence("test-judge"),
              errorCode: error === "transport_interrupted" ? null : "model_contract_invalid",
            });
          }
          return acceptedJudge.judge(...args);
        }),
      };
      const runtime = turnRuntime(handle, time, judge, gameMasterFixture(), {
        judgeModel: {
          languageModel,
          reasoningModel,
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
      });
      const admission = runtime.admitAction({
        request: admissionRequest(state, `interrupted-judge-${persistedErrorCode}`),
        submittedAt: 2_610,
      });
      time.advance();
      const first = await runtime.runNextStage(admission.turnId);
      expect(first.turn).toMatchObject({
        stage: "interrupted",
        interruptedStage: "admitted",
        errorCode: persistedErrorCode,
        resumeEligible: true,
      });
      const interrupted = runtime.loadTurn(admission.turnId)!;

      time.advance();
      await runtime.resumeInterruptedStage({
        turnId: admission.turnId,
        interruptedStage: "admitted",
        observedEpoch: interrupted.workerEpoch,
      });
      time.advance();
      await runtime.runNextStage(admission.turnId);
      time.advance();
      await runtime.runNextStage(admission.turnId);

      expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "primary_settled" });
      expect(observedModes).toEqual(["auto", "auto"]);
      expect(observedModels).toEqual([
        languageModel,
        expectedSecondModel === "reasoning" ? reasoningModel : languageModel,
      ]);
      expect(judge.judge).toHaveBeenCalledTimes(2);
      expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(2);
      expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_model_stages
        WHERE campaign_id = ? AND turn_id = ? AND kind = 'judge'`)
        .get(CAMPAIGN_ID, admission.turnId)).toEqual({ value: 2 });
    },
  );

  it("does not pass recovery feedback into the initial Judge attempt", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_625);
    const judge = judgeFixture("deterministic");
    const runtime = turnRuntime(handle, time, judge, gameMasterFixture(), {
      judgeRecoveryFeedback: {
        issues: [{
          issueIndex: 0,
          code: "custom",
          path: ["resultBounds", "minimum"],
          message: "Actionable judgments require a mechanical result range.",
        }],
      },
    });
    const admission = runtime.admitAction({
      request: admissionRequest(state, "judge-recovery-feedback"),
      submittedAt: 2_625,
    });
    time.advance();
    const result = await runtime.runNextStage(admission.turnId);

    expect(result.turn).toMatchObject({
      turnId: admission.turnId,
      stage: "judged",
    });
    expect(judge.judge).toHaveBeenCalledOnce();
    expect(judge.judge.mock.calls[0]![0]).toMatchObject({
      frame: expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        turnId: admission.turnId,
      }),
      attempt: 1,
      structuredOutputMode: "auto",
    });
    expect(judge.judge.mock.calls[0]![0]).not.toHaveProperty("recoveryFeedback");
  });

  it("recovers one final-validation Judge rejection into one settlement without replay", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_635);
    const judge = judgeFixture("deterministic", null, true);
    let recoveredFeedback: CampaignPlayJudgeRecoveryFeedback | undefined;
    const firstRuntime = turnRuntime(handle, time, judge, gameMasterFixture(), {
      onJudgeRecoveryFeedback: (feedback) => { recoveredFeedback = feedback; },
    });
    const admission = firstRuntime.admitAction({
      request: admissionRequest(state, "judge-dependent-field-recovery"),
      submittedAt: 2_635,
    });
    time.advance();
    const first = await firstRuntime.runNextStage(admission.turnId);
    expect(first.turn).toMatchObject({
      turnId: admission.turnId,
      stage: "interrupted",
      interruptedStage: "admitted",
      errorCode: "model_contract_invalid",
      resumeEligible: true,
    });
    expect(recoveredFeedback).toEqual({
      issues: [{
        issueIndex: 0,
        code: "custom",
        path: ["citedVisibleFactHandles"],
        message: "Cited visible fact handles must be unique.",
      }],
    });
    const interrupted = firstRuntime.loadTurn(admission.turnId)!;
    expect(playerActionMechanicsSnapshot(handle, admission.turnId)).toMatchObject({
      commands: 0,
      receipts: 0,
      turnResults: 0,
    });
    if (recoveredFeedback === undefined) throw new Error("Expected safe Judge recovery feedback.");

    const secondRuntime = turnRuntime(handle, time, judge, gameMasterFixture(), {
      judgeRecoveryFeedback: recoveredFeedback,
    });
    time.advance();
    await secondRuntime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "admitted",
      observedEpoch: interrupted.workerEpoch,
    });
    time.advance();
    await secondRuntime.runNextStage(admission.turnId);
    time.advance();
    await secondRuntime.runNextStage(admission.turnId);

    expect(secondRuntime.loadTurn(admission.turnId)).toMatchObject({ stage: "primary_settled" });
    expect(judge.judge).toHaveBeenCalledTimes(2);
    expect(judge.judge.mock.calls.map((call) => call[0]!.attempt)).toEqual([1, 2]);
    expect(judge.judge.mock.calls.map((call) => call[0]!.structuredOutputMode)).toEqual([
      "auto",
      "auto",
    ]);
    expect(judge.judge.mock.calls[1]![0]).toMatchObject({
      frame: expect.objectContaining({ campaignId: CAMPAIGN_ID, turnId: admission.turnId }),
      recoveryFeedback: recoveredFeedback,
    });
    expect(playerActionMechanicsSnapshot(handle, admission.turnId)).toMatchObject({
      commands: 2,
      receipts: 2,
      turnResults: 0,
    });
    expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'judge'`)
      .get(CAMPAIGN_ID, admission.turnId)).toEqual({ value: 2 });
  });

  it("persists a Game Master timeout and resumes the same accepted Judge ledger", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_650);
    const judge = judgeFixture("deterministic");
    const acceptedGameMaster = gameMasterFixture();
    const bypassGameMasterModel = { specificationVersion: "v3" } as unknown as LanguageModel;
    const reasoningGameMasterModel = { specificationVersion: "v3" } as unknown as LanguageModel;
    const observedGameMasterModels: LanguageModel[] = [];
    const observedGameMasterModes: Array<"auto" | "tool" | undefined> = [];
    let interrupted = false;
    const gameMaster = {
      plan: vi.fn(async (...args: Parameters<typeof acceptedGameMaster.plan>) => {
        observedGameMasterModels.push(args[0].model);
        observedGameMasterModes.push(args[0].structuredOutputMode);
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
    const runtime = turnRuntime(handle, time, judge, gameMaster, {
      gameMasterModel: {
        languageModel: bypassGameMasterModel,
        reasoningModel: reasoningGameMasterModel,
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
    });
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
    expect(observedGameMasterModels).toEqual([bypassGameMasterModel, bypassGameMasterModel]);
    expect(observedGameMasterModes).toEqual(["auto", "auto"]);
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(2);
  });

  it("keeps Game Master provider recovery in tool mode", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_652);
    const judge = judgeFixture("deterministic");
    const acceptedGameMaster = gameMasterFixture();
    const languageModel = { specificationVersion: "v3" } as unknown as LanguageModel;
    const reasoningModel = { specificationVersion: "v3" } as unknown as LanguageModel;
    const observedModels: LanguageModel[] = [];
    const observedModes: Array<"auto" | "tool" | undefined> = [];
    let calls = 0;
    const gameMaster = {
      plan: vi.fn(async (request: Parameters<typeof acceptedGameMaster.plan>[0]) => {
        observedModels.push(request.model);
        observedModes.push(request.structuredOutputMode);
        calls += 1;
        throw new CampaignPlayGameMasterError("transport_interrupted", null);
      }),
    };
    const runtime = turnRuntime(handle, time, judge, gameMaster, {
      gameMasterModel: {
        languageModel,
        reasoningModel,
        requested: {
          providerId: "test",
          model: "test-game-master-provider-recovery",
          strategy: "strict_object",
          pricing: TEST_MODEL_PRICING,
        },
        temperature: 0.2,
        maximumInputTokens: 1_000,
        maximumOutputTokens: 1_000,
        maximumTotalTokens: 2_000,
        maximumCostMicros: 10_000,
      },
    });
    const admission = runtime.admitAction({
      request: admissionRequest(state, "interrupted-game-master-provider"),
      submittedAt: 2_652,
    });
    time.advance();
    await runtime.runNextStage(admission.turnId);
    time.advance();
    const firstGameMaster = await runtime.runNextStage(admission.turnId);
    expect(firstGameMaster.turn).toMatchObject({
      stage: "interrupted",
      interruptedStage: "judged",
      errorCode: "provider_unavailable",
      resumeEligible: true,
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
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      stage: "interrupted",
      interruptedStage: "judged",
      errorCode: "provider_unavailable",
      resumeEligible: true,
    });
    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(gameMaster.plan).toHaveBeenCalledTimes(2);
    expect(observedModels).toEqual([languageModel, languageModel]);
    expect(observedModes).toEqual(["auto", "tool"]);
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(0);
  });

  it("forwards Game Master recovery feedback at the judged boundary without replaying Judge", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(2_655);
    const judge = judgeFixture("deterministic");
    const acceptedGameMaster = gameMasterFixture();
    const bypassGameMasterModel = {} as LanguageModel;
    const reasoningGameMasterModel = {} as LanguageModel;
    const observedModels: LanguageModel[] = [];
    const observedRequests: Array<Parameters<typeof acceptedGameMaster.plan>[0]> = [];
    let calls = 0;
    const gameMaster = {
      plan: vi.fn(async (request: Parameters<typeof acceptedGameMaster.plan>[0]) => {
        observedRequests.push(request);
        observedModels.push(request.model);
        calls += 1;
        if (calls === 1) throw repeatedDialogueErrorForRequest(request);
        return acceptedGameMaster.plan(request);
      }),
    };
    let recoveredFeedback: CampaignPlayGameMasterRecoveryFeedback | undefined;
    const firstRuntime = turnRuntime(handle, time, judge, gameMaster, {
      gameMasterModel: {
        languageModel: bypassGameMasterModel,
        reasoningModel: reasoningGameMasterModel,
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
      onGameMasterRecoveryFeedback: (feedback) => { recoveredFeedback = feedback; },
    });
    const admission = firstRuntime.admitAction({
      request: admissionRequest(state, "full-authority-game-master-dialogue-recovery"),
      submittedAt: time.clock.now(),
    });
    time.advance();
    await firstRuntime.runNextStage(admission.turnId);
    expect(judge.judge).toHaveBeenCalledTimes(1);
    time.advance();
    const first = await firstRuntime.runNextStage(admission.turnId);
    expect(first.turn).toMatchObject({
      stage: "interrupted",
      interruptedStage: "judged",
      errorCode: "model_contract_invalid",
      resumeEligible: true,
    });
    expect(recoveredFeedback).toEqual({
      diagnostic: "game_master_semantic_validation_mismatch",
      failedChecks: [{
        check: "repeated_actor_dialogue",
        effectIndex: 0,
        fieldPath: "effects[0].summary",
        performingActorHandle: expect.any(String),
        recentOwnActionIndex: 0,
      }],
    });
    if (recoveredFeedback === undefined) throw new Error("Expected safe Game Master recovery feedback.");
    const interrupted = firstRuntime.loadTurn(admission.turnId)!;
    const firstRequest = observedRequests[0]!;
    expect(firstRequest.recoveryFeedback).toBeUndefined();
    const secondRuntime = turnRuntime(handle, time, judge, gameMaster, {
      gameMasterModel: {
        languageModel: bypassGameMasterModel,
        reasoningModel: reasoningGameMasterModel,
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
      gameMasterRecoveryFeedback: recoveredFeedback,
    });
    time.advance();
    await secondRuntime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "judged",
      observedEpoch: interrupted.workerEpoch,
    });
    time.advance();
    await secondRuntime.runNextStage(admission.turnId);
    expect(secondRuntime.loadTurn(admission.turnId)).toMatchObject({ stage: "primary_settled" });
    expect(observedRequests).toHaveLength(2);
    expect(observedModels).toEqual([bypassGameMasterModel, bypassGameMasterModel]);
    expect(observedRequests[1]!.recoveryFeedback).toEqual(recoveredFeedback);
    expect(observedRequests[1]!.frame.sourceMoment).toBe(firstRequest.frame.sourceMoment);
    expect(observedRequests[1]!.ruling).toEqual(firstRequest.ruling);
    expect(observedRequests[1]!.resolution).toEqual(firstRequest.resolution);
    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'game_master'`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({ value: 2 });
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(2);
    expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBe(2);
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
    expect(dueSet!.decisions.filter((decision) => decision.disposition === "wake"))
      .toHaveLength(1);
    expect(dueSet!.decisions.filter((decision) =>
      decision.disposition === "defer" && decision.reason === "actor_capacity"))
      .toHaveLength(0);
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
      if (actorBoundaries > expectedJobs.length + 2) {
        throw new Error("Actor settlement exceeded the frozen serial boundary count.");
      }
    }

    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "actors_settled" });
    const settledJobs = scheduler.validateTurnSettlement(admission.turnId);
    expect(settledJobs).toHaveLength(expectedJobs.length);
    const capacityDeferred = settledJobs.filter((job) => job.deferReason === "actor_capacity");
    expect(capacityDeferred).toHaveLength(0);
    for (const job of capacityDeferred) {
      const schedule = handle.sqlite.prepare(`SELECT next_act_at_world_time_minutes AS nextDue,
          agency_debt AS agencyDebt FROM campaign_play_actor_schedules
        WHERE campaign_id = ? AND actor_id = ?`).get(CAMPAIGN_ID, job.actorId) as {
          nextDue: number;
          agencyDebt: number;
        };
      expect(schedule.agencyDebt).toBe(1);
      expect(schedule.nextDue).toBeGreaterThan(dueSet!.settledWorldTimeMinutes);
    }
    expect(actorBoundaries).toBe(
      expectedJobs.filter((decision) => decision.disposition === "wake").length + 2,
    );
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
      gameMasterFixture(1, true),
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
    const pendingState = createCampaignPlayReadModel(handle).loadState();
    expect(pendingState).toMatchObject({
      phase: "ready",
      narration: null,
      narrationOperation: { status: "pending", turnId: admission.turnId },
    });
    expect(narrator.narrate).toHaveBeenCalledTimes(0);
    await runtime.runNarration(admission.turnId);
    expect(narrator.narrate).toHaveBeenCalledTimes(1);
    const narrationRow = handle.sqlite.prepare(`SELECT narration.packet_json AS packetJson,
        scene.beats_json AS beatsJson, scene.suggested_actions_json AS suggestedActionsJson,
        scene.effects_json AS effectsJson, operation.status
      FROM campaign_play_narrations narration
      JOIN campaign_play_narration_operations operation
        ON operation.campaign_id = narration.campaign_id AND operation.turn_id = narration.turn_id
      JOIN campaign_play_proper_scenes scene
        ON scene.campaign_id = operation.campaign_id AND scene.operation_id = operation.operation_id
      WHERE narration.campaign_id = ? AND narration.turn_id = ?`).get(
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
    expect(packet.sourceMoment).toBe(frozenAdmission.sourceMoment.displayText);
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
    expect(JSON.parse(narrationRow.suggestedActionsJson)).toHaveLength(
      Math.min(packet.availableIntents.length, CAMPAIGN_PLAY_LIMITS.suggestedActions),
    );
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
    expect(telemetry).toMatchObject({ terminalReason: "action_resolved", costComplete: true });
    expect(telemetry.modelAttempts.map((attempt) => attempt.kind).sort()).toEqual([
      "actor_replanner",
      "game_master",
      "judge",
    ]);
    expect(handle.sqlite.prepare(`SELECT status, schema_outcome AS schemaOutcome
      FROM campaign_play_narration_attempts WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({ status: "accepted", schemaOutcome: "valid" });
    expect(telemetry.stageExecutions.every((stage) => stage.outcome === "advanced")).toBe(true);

    const nextState = createCampaignPlayStateRepository(handle).loadState()!;
    const nextRequest = admissionRequest(
      nextState,
      "real-second-action-playtest",
      "I count the blue rivets on the north arch.",
    );
    const nextAdmission = runtime.admitAction({ request: nextRequest, submittedAt: 7_100 });
    const nextAdmissionFrame = loadCampaignPlayPlayerActionAdmissionFrame(
      runtime.loadTurn(nextAdmission.turnId)!,
    );
    const continuityHandles = nextAdmissionFrame.sourcePacket.continuity.map((entry) =>
      entry.observationHandle);

    expect(runtime.loadTurn(nextAdmission.turnId)).toMatchObject({
      stage: "admitted",
      terminalReason: null,
    });
    expect(continuityHandles.length).toBeGreaterThan(0);
    expect(nextAdmissionFrame.visibleFacts.some((fact) =>
      continuityHandles.includes(fact.handle))).toBe(false);
    expect(handle.sqlite.prepare(`SELECT count(*) AS value FROM campaign_play_turns
      WHERE campaign_id = ? AND turn_kind = 'player_action'`).get(
        CAMPAIGN_ID,
      )).toEqual({ value: 2 });

    await advanceUntilStage(runtime, time, nextAdmission.turnId, "completed");
    await runtime.runNarration(nextAdmission.turnId);
    const nextNarrationRow = handle.sqlite.prepare(`SELECT packet_json AS packetJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID,
        nextAdmission.turnId,
      ) as { packetJson: string };
    const nextPacket = JSON.parse(nextNarrationRow.packetJson) as CampaignPlayNarratorPacket;
    expect(nextPacket.actionContext?.submittedText).toBe(nextRequest.text);
    expect(nextPacket.playerHistory).toEqual([expect.objectContaining({
      submittedText: request.text,
      disposition: "deterministic",
      result: "success",
    })]);
    expect(narrator.narrate).toHaveBeenCalledTimes(2);
  });

  it("accepts the allowlisted Z.AI response model for player stages and persists the truthful model", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(7_500);
    const modelIdentity = {
      providerId: "zai-coding-plan",
      requestedModel: "glm-5.2",
    };
    const judge = judgeFixture(
      "deterministic",
      null,
      false,
      acceptedEvidence("test-judge", "zai-coding-plan", "glm-5.3"),
    );
    const gameMaster = gameMasterFixture(
      1,
      false,
      false,
      acceptedEvidence("test-game-master", "zai-coding-plan", "glm-5.3"),
    );
    const narrator = playerNarratorFixture("the immediate situation", {
      ...openingNarratorEvidence,
      actualProviderId: "zai-coding-plan",
      responseModel: "glm-5.3",
    });
    const runtime = turnRuntime(
      handle,
      time,
      judge,
      gameMaster,
      { narrator },
      modelIdentity,
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "zai-player-response-model"),
      submittedAt: time.clock.now(),
    });

    await advanceUntilStage(runtime, time, admission.turnId, "completed");
    await runtime.runNarration(admission.turnId);

    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "completed" });
    const stages = handle.sqlite.prepare(`SELECT kind, actual_provider_id AS actualProviderId,
        actual_model AS actualModel, status
      FROM campaign_play_model_stages WHERE campaign_id = ? AND turn_id = ? ORDER BY kind`).all(
      CAMPAIGN_ID,
      admission.turnId,
    ) as Array<{ kind: string; actualProviderId: string; actualModel: string; status: string }>;
    expect(stages).toEqual(expect.arrayContaining([
      { kind: "judge", actualProviderId: "zai-coding-plan", actualModel: "glm-5.3", status: "accepted" },
      { kind: "game_master", actualProviderId: "zai-coding-plan", actualModel: "glm-5.3", status: "accepted" },
    ]));
    expect(stages
      .filter((stage) => stage.kind === "judge" || stage.kind === "game_master")
      .every((stage) => stage.status === "accepted")).toBe(true);
    expect(handle.sqlite.prepare(`SELECT actual_provider_id AS actualProviderId,
        actual_model AS actualModel, schema_outcome AS schemaOutcome, status
      FROM campaign_play_narration_attempts WHERE campaign_id = ? AND turn_id = ?
      ORDER BY attempt DESC LIMIT 1`).get(CAMPAIGN_ID, admission.turnId)).toEqual({
      actualProviderId: "zai-coding-plan",
      actualModel: "glm-5.3",
      schemaOutcome: "valid",
      status: "accepted",
    });
  });

  it("admits the next action when a known observation is outside both packet windows", async () => {
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
      await runtime.runNarration(admission.turnId);
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
    expect(frame.authority.knownWorldEventIds.length).toBeGreaterThan(
      CAMPAIGN_PLAY_LIMITS.newObservations,
    );
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
      if (clarificationQuestion !== null) {
        const visiblePacket = handle.sqlite.prepare(`SELECT packet_json AS packetJson
          FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
            CAMPAIGN_ID,
            admission.turnId,
          ) as { packetJson: string };
        expect((JSON.parse(visiblePacket.packetJson) as CampaignPlayNarratorPacket).newObservations)
          .toHaveLength(0);
      }
      const narrationOperation = await runtime.runNarration(admission.turnId);
      expect(narrationOperation).toMatchObject({ status: "complete" });

      expect(runtime.loadTurn(admission.turnId)).toMatchObject({
        stage: "completed",
        terminalReason,
      });
      const stored = handle.sqlite.prepare(`SELECT narration.packet_json AS packetJson,
          scene.beats_json AS beatsJson, scene.effects_json AS effectsJson
        FROM campaign_play_narrations narration
        JOIN campaign_play_narration_operations operation
          ON operation.campaign_id = narration.campaign_id AND operation.turn_id = narration.turn_id
        JOIN campaign_play_proper_scenes scene
          ON scene.campaign_id = operation.campaign_id AND scene.operation_id = operation.operation_id
        WHERE narration.campaign_id = ? AND narration.turn_id = ?`).get(
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

  it.each(["narration_invalid", "model_contract_failed"] as const)(
    "automatically retries one receipt-keyed %s failure without replaying mechanics",
    async (failureCode) => {
    const successful = playerNarratorFixture();
    const recoveryFeedback = {
      diagnostic: "narrator_packet_validation_mismatch" as const,
      failedChecks: [{
        check: "visible_actor_observation_mismatch" as const,
        beatIndex: 0,
        fieldPath: "beats[0].text",
        observationIndexes: [0],
        matchedActor: {
          canonicalId: "actor_vedris_kast",
          canonicalName: "Vedris Kast",
          matchedAlias: "Vedris",
        },
        allowedActors: [{
          canonicalId: "actor_dren_vask",
          canonicalName: "Dren Vask",
        }],
        sourceObservationPerformers: [{
          observationIndex: 0,
          canonicalId: "actor_dren_vask",
          canonicalName: "Dren Vask",
        }],
      }],
    };
    let calls = 0;
    const requests: Parameters<typeof successful.narrate>[0][] = [];
    const narrator: TestNarrator = {
      compile: successful.compile,
      narrate: vi.fn(async (request) => {
        calls += 1;
        requests.push(request);
        if (calls === 1) {
          throw new CampaignPlayNarratorError(failureCode, null, {
            recoveryFeedback,
          });
        }
        return successful.narrate(request);
      }),
    };
    const result = await runPendingNarrationThroughApplication(narrator);
    const operation = result.handle.sqlite.prepare(`SELECT operation_id AS operationId,
        result_id AS resultId, turn_id AS turnId, narration_id AS narrationId,
        packet_hash AS packetHash, receipt_ids_json AS receiptIdsJson,
        status, current_attempt AS currentAttempt, current_attempt_id AS currentAttemptId,
        error_code AS errorCode
      FROM campaign_play_narration_operations
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, result.turnId) as {
        operationId: string;
        resultId: string;
        turnId: string;
        narrationId: string;
        packetHash: string;
        receiptIdsJson: string;
        status: string;
        currentAttempt: number;
        currentAttemptId: string;
        errorCode: string | null;
      };
    const attempts = result.handle.sqlite.prepare(`SELECT attempt_id AS attemptId,
        operation_id AS operationId, campaign_id AS campaignId, turn_id AS turnId,
        attempt, status, error_code AS errorCode
      FROM campaign_play_narration_attempts
      WHERE campaign_id = ? AND operation_id = ? ORDER BY attempt`).all(
      CAMPAIGN_ID,
      operation.operationId,
    ) as Array<{
      attemptId: string;
      operationId: string;
      campaignId: string;
      turnId: string;
      attempt: number;
      status: string;
      errorCode: string | null;
    }>;
    const packet = result.handle.sqlite.prepare(`SELECT packet_hash AS packetHash,
        packet_json AS packetJson FROM campaign_play_narrations
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, result.turnId) as {
        packetHash: string;
        packetJson: string;
      };
    expect(narrator.narrate).toHaveBeenCalledTimes(2);
    expect(requests.map((request) => request.structuredOutputMode)).toEqual([
      "auto",
      "auto",
    ]);
    expect(attempts).toHaveLength(2);
    expect(attempts.map((attempt) => attempt.attempt)).toEqual([1, 2]);
    expect(new Set(attempts.map((attempt) => attempt.attemptId)).size).toBe(2);
    expect(attempts).toEqual([
      expect.objectContaining({
        operationId: operation.operationId,
        campaignId: CAMPAIGN_ID,
        turnId: result.turnId,
        attempt: 1,
        status: "failed",
        // The runtime preserves its public narration_invalid classification while
        // forwarding model_contract_failed recovery feedback privately.
        errorCode: "narration_invalid",
      }),
      expect.objectContaining({
        operationId: operation.operationId,
        campaignId: CAMPAIGN_ID,
        turnId: result.turnId,
        attempt: 2,
        status: "accepted",
        errorCode: null,
      }),
    ]);
    expect(operation).toMatchObject({
      resultId: result.pending.resultId,
      turnId: result.pending.turnId,
      narrationId: result.pending.narrationId,
      packetHash: result.pending.packetHash,
      status: "complete",
      currentAttempt: 2,
      errorCode: null,
    });
    expect(JSON.parse(operation.receiptIdsJson)).toEqual(result.pending.receiptIds);
    expect(packet).toMatchObject({ packetHash: result.pending.packetHash });
    expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND operation_id = ?`).get(
        CAMPAIGN_ID,
        operation.operationId,
      )).toEqual({ count: 1 });
    expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_narration_operations WHERE campaign_id = ?`).get(CAMPAIGN_ID))
      .toEqual({ count: 1 });
    expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_narration_attempts WHERE campaign_id = ?`).get(CAMPAIGN_ID))
      .toEqual({ count: 2 });
    expect(playerActionMechanicsSnapshot(result.handle, result.turnId)).toEqual(result.mechanics);
    expect(requests[0]!.narrationId).toBe(requests[1]!.narrationId);
    expect(requests[0]!.packetBytes).toBe(requests[1]!.packetBytes);
    expect(requests[0]!.packetBytes).toBe(packet.packetJson);
    expect(requests[0]!.recoveryFeedback).toBeUndefined();
    expect(requests[1]!.recoveryFeedback).toEqual(recoveryFeedback);
    const state = createCampaignPlayReadModel(result.handle).loadState();
    expect(state.narrationOperation).toMatchObject({
      operationId: result.pending.operationId,
      status: "complete",
      attempt: 2,
    });
    expect(state.narration).toMatchObject({
      turnId: result.turnId,
      displayText: expect.stringContaining("I ask the signal keeper"),
    });
    expect(result.handle.sqlite.prepare("PRAGMA integrity_check").get())
      .toEqual({ integrity_check: "ok" });
    expect(result.handle.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    },
  );

  it("carries every prior safe Narrator check into the third automatic attempt", async () => {
    const successful = playerNarratorFixture();
    const actorMismatch: CampaignPlayNarratorRecoveryFeedback = {
      diagnostic: "narrator_packet_validation_mismatch",
      failedChecks: [{
        check: "visible_actor_observation_mismatch",
        beatIndex: 0,
        fieldPath: "beats[0].text",
        observationIndexes: [0],
        matchedActor: {
          canonicalId: "actor_vedris_kast",
          canonicalName: "Vedris Kast",
          matchedAlias: "Vedris",
        },
        allowedActors: [],
        sourceObservationPerformers: [{
          observationIndex: 0,
          canonicalId: null,
          canonicalName: null,
        }],
      }],
    };
    const duplicateIntent: CampaignPlayNarratorRecoveryFeedback = {
      diagnostic: "narrator_packet_validation_mismatch",
      failedChecks: [{ check: "duplicate_selected_intent_indexes", indexes: [0] }],
    };
    const requests: Parameters<typeof successful.narrate>[0][] = [];
    const narrator: TestNarrator = {
      compile: successful.compile,
      narrate: vi.fn(async (request) => {
        requests.push(request);
        if (requests.length === 1) {
          throw new CampaignPlayNarratorError("narration_invalid", null, {
            recoveryFeedback: actorMismatch,
          });
        }
        if (requests.length === 2) {
          throw new CampaignPlayNarratorError("narration_invalid", null, {
            recoveryFeedback: duplicateIntent,
          });
        }
        return successful.narrate(request);
      }),
    };

    const result = await runPendingNarrationThroughApplication(narrator);

    expect(requests.map((request) => request.recoveryFeedback)).toEqual([
      undefined,
      actorMismatch,
      {
        diagnostic: "narrator_packet_validation_mismatch",
        failedChecks: [
          actorMismatch.failedChecks[0],
          duplicateIntent.failedChecks[0],
        ],
      },
    ]);
    expect(result.handle.sqlite.prepare(`SELECT attempt, status, error_code AS errorCode
      FROM campaign_play_narration_attempts WHERE campaign_id = ? ORDER BY attempt`).all(
        CAMPAIGN_ID,
      )).toEqual([
        { attempt: 1, status: "failed", errorCode: "narration_invalid" },
        { attempt: 2, status: "failed", errorCode: "narration_invalid" },
        { attempt: 3, status: "accepted", errorCode: null },
      ]);
    expect(result.handle.sqlite.prepare(`SELECT status, current_attempt AS currentAttempt
      FROM campaign_play_narration_operations WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID,
        result.turnId,
      )).toEqual({ status: "complete", currentAttempt: 3 });
    expect(playerActionMechanicsSnapshot(result.handle, result.turnId)).toEqual(result.mechanics);
  });

  it.each([
    {
      label: "keeps bypass when safe compiler feedback identifies the failed checks",
      failure: "semantic_safe" as const,
      safeCompilerFeedback: true,
      actorObservationMismatch: false,
      recoveryFails: false,
    },
    {
      label: "keeps the frozen Narrator construction for visible actor observation feedback",
      failure: "semantic_actor" as const,
      safeCompilerFeedback: false,
      actorObservationMismatch: true,
      recoveryFails: false,
    },
    {
      label: "keeps actor observation mismatch recovery terminal after three failed attempts",
      failure: "semantic_actor" as const,
      safeCompilerFeedback: false,
      actorObservationMismatch: true,
      recoveryFails: true,
    },
    {
      label: "keeps the frozen Narrator construction when semantic feedback is unavailable",
      failure: "semantic_opaque" as const,
      safeCompilerFeedback: false,
      actorObservationMismatch: false,
      recoveryFails: false,
    },
    {
      label: "keeps the frozen Narrator construction after tool transport rejection",
      failure: "provider" as const,
      safeCompilerFeedback: false,
      actorObservationMismatch: false,
      recoveryFails: false,
    },
  ])("$label", async ({
    failure,
    safeCompilerFeedback,
    actorObservationMismatch,
    recoveryFails,
  }) => {
    const prepared = await createCompletedPlayerActionForApplication();
    closeTracked(prepared.handle);

    const provider = {
      id: "test",
      name: "Test Provider",
      baseUrl: "http://localhost:1234",
      apiKey: "",
      defaultModel: "test-model",
    };
    const role = (model: string) => ({
      providerId: provider.id,
      model,
      temperature: 0.3,
      maxTokens: 32_768,
    });
    const settings = {
      providers: [provider],
      judge: role("test-judge"),
      storyteller: role("test-narrator"),
      generator: role("test-game-master"),
      embedder: { providerId: provider.id, model: "test-embedder", enabled: false },
      images: { providerId: provider.id, model: "test-image", stylePrompt: "", enabled: false },
      research: { enabled: false, maxSearchSteps: 1, searchProvider: "duckduckgo" as const },
      ui: { showRawReasoning: false },
      observability: {
        enabled: false,
        dumpFullPrompts: false,
        roles: {
          judge: false,
          storyteller: false,
          oracle: false,
          npcAgent: false,
          reflection: false,
          embedder: false,
        },
      },
    };

    let generatedCalls = 0;
    const observedStructuredOutputModes: Array<"auto" | "tool"> = [];
    const model = new MockLanguageModelV3({
      provider: provider.id,
      modelId: "test-narrator",
      doGenerate: async (options) => {
        generatedCalls += 1;
        type PromptPacket = {
          actionContext: {
            disposition: string;
            clarificationQuestion: string | null;
          } | null;
          availableIntents: Array<{ kind: string }>;
          currentLocation: { name: string; handle: string };
          newObservations: Array<{
            consequence?: { performingActorName?: string | null } | null;
          }>;
          observationSubjects?: Array<{ actors: Array<{ name: string }> }>;
          visibleActors: Array<{ name: string }>;
        };
        const promptText = (options.prompt as Array<{
          content?: Array<{ type?: string; text?: string }>;
        }>)
          .flatMap((message) => message.content ?? [])
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join("\n");
        const marker = "NARRATOR_PACKET\n";
        const markerStart = promptText.indexOf(marker);
        const markerEnd = promptText.indexOf("\nEND_NARRATOR_PACKET", markerStart);
        const packet = JSON.parse(promptText.slice(markerStart + marker.length, markerEnd)) as PromptPacket;
        const requiredMatch = promptText.match(/REQUIRED_REPLY_INTENT_INDEX=(null|\d+)/u);
        const requiredIndex = requiredMatch?.[1] === undefined || requiredMatch[1] === "null"
          ? null
          : Number(requiredMatch[1]);
        const expectedActionCount = Math.min(4, packet.availableIntents.length);
        const selectedIndexes = [...new Set([
          ...(requiredIndex === null ? [] : [requiredIndex]),
          ...packet.availableIntents.map((_intent, index) => index),
        ])].slice(0, expectedActionCount);
        const actionSelections = selectedIndexes.map((intentIndex) => ({
          intentIndex,
          detail: packet.availableIntents[intentIndex]?.kind === "move" ||
            packet.availableIntents[intentIndex]?.kind === "wait"
            ? null
            : "the immediate situation",
        }));
        const usesToolMode = (options.tools?.length ?? 0) > 0;
        observedStructuredOutputModes.push(usesToolMode ? "tool" : "auto");
        if (generatedCalls >= 2 && recoveryFails) {
          throw new Error("actor observation recovery interrupted");
        }
        if (generatedCalls === 1) {
          if (failure === "provider") throw new Error("transport interrupted");
          const firstObservation = packet.newObservations[0];
          const permittedActorNames = new Set([
            ...(firstObservation?.consequence?.performingActorName
              ? [firstObservation.consequence.performingActorName]
              : []),
            ...(packet.observationSubjects?.[0]?.actors ?? []).map((actor) => actor.name),
          ]);
          const actorMismatchName = packet.visibleActors.find((actor) =>
            !permittedActorNames.has(actor.name))?.name;
          if (actorObservationMismatch) expect(actorMismatchName).toBeDefined();
          const observationIndexes = packet.newObservations.map((_observation, index) => index);
          const actorMismatchBeats = actorObservationMismatch
            ? [
                {
                  purpose: "consequence",
                  observationIndexes: observationIndexes.slice(0, 1),
                  text: `${actorMismatchName} remains visible.`,
                },
                ...(observationIndexes.length > 1
                  ? [{
                      purpose: "consequence",
                      observationIndexes: observationIndexes.slice(1),
                      text: "The accepted result holds.",
                    }]
                  : []),
              ]
            : null;
          const proposal = {
            beats: actorMismatchBeats ?? [{
                purpose: "consequence",
                observationIndexes: safeCompilerFeedback ? [] : observationIndexes,
                text: safeCompilerFeedback
                  ? `You see the first accepted result at ${packet.currentLocation.name}.`
                  : packet.currentLocation.handle,
              }],
            actionSelections,
          };
          return {
            content: usesToolMode
              ? [{
                  type: "tool-call",
                  toolCallId: "structured-output-1",
                  toolName: "structured_output",
                  input: JSON.stringify(proposal),
                }]
              : [{ type: "text", text: JSON.stringify(proposal) }],
            finishReason: {
              unified: usesToolMode ? "tool-calls" : "stop",
              raw: undefined,
            },
            response: { modelId: "test-narrator" },
            usage: {
              inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 12, text: 12, reasoning: undefined },
            },
            warnings: [],
          };
        }
        const actorNames = [...new Set([
          ...packet.newObservations.flatMap((observation) =>
            observation.consequence?.performingActorName
              ? [observation.consequence.performingActorName]
              : []),
          ...(packet.observationSubjects ?? []).flatMap((binding) =>
            binding.actors.map((actor) => actor.name)),
        ])];
        const clarification = packet.actionContext?.disposition === "clarification_required"
          ? packet.actionContext.clarificationQuestion
          : null;
        const proposal = clarification
          ? {
              beats: [{ purpose: "action_handoff", observationIndexes: [], text: clarification }],
              actionSelections,
            }
          : {
              beats: [{
                purpose: "consequence",
                observationIndexes: packet.newObservations.map((_observation, index) => index),
                text: `You see the accepted result at ${packet.currentLocation.name}.${
                  actorNames.length > 0 ? ` ${actorNames.join(" and ")} remain visible.` : ""}`,
              }],
              actionSelections,
            };
        return {
          content: failure === "provider" || !usesToolMode
            ? [{ type: "text", text: JSON.stringify(proposal) }]
            : [{
                type: "tool-call",
                toolCallId: `structured-output-${generatedCalls}`,
                toolName: "structured_output",
                input: JSON.stringify(proposal),
              }],
          finishReason: {
            unified: failure === "provider" || !usesToolMode ? "stop" : "tool-calls",
            raw: undefined,
          },
          response: { modelId: "test-narrator" },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 30, text: 30, reasoning: undefined },
          },
          warnings: [],
        };
      },
    });
    const createModel = vi.fn((
      config: { id: string; name: string; baseUrl: string; model: string },
      options: { role?: string; reasoningMode?: string } = {},
    ) => {
      rememberStructuredOutputModelMetadata(model, buildStructuredOutputModelMetadata({
        providerId: config.id,
        providerName: config.name,
        model: config.model,
        protocol: "openai-compatible",
        baseUrl: config.baseUrl,
        transport: "chat-completions",
      }));
      return model as never;
    });
    const application = createCampaignPlayApplication({
      now: prepared.time.clock.now,
      loadSettings: () => settings as never,
      createModel: createModel as never,
    });

    await application.recoverCampaign(CAMPAIGN_ID);
    await application.waitForIdle(CAMPAIGN_ID);

    const storytellerModels = createModel.mock.calls
      .map(([config, options]) => ({
        providerId: config.id,
        model: config.model,
        options,
      }))
      .filter(({ options }) => options?.role === "storyteller");
    expect(storytellerModels).toEqual([
      {
        providerId: provider.id,
        model: "test-narrator",
        options: { role: "storyteller", reasoningMode: "bypass" },
      },
    ]);
    expect(generatedCalls).toBe(recoveryFails ? 3 : 2);
    expect(observedStructuredOutputModes).toEqual(
      recoveryFails ? ["auto", "auto", "auto"] : ["auto", "auto"],
    );
    const handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    const operation = handle.sqlite.prepare(`SELECT operation_id AS operationId,
        result_id AS resultId, turn_id AS turnId, narration_id AS narrationId,
        packet_hash AS packetHash, receipt_ids_json AS receiptIdsJson,
        status, source_kind AS sourceKind, current_attempt AS currentAttempt, error_code AS errorCode
      FROM campaign_play_narration_operations
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, prepared.turnId) as {
        operationId: string;
        resultId: string;
        turnId: string;
        narrationId: string;
        packetHash: string;
        receiptIdsJson: string;
        status: string;
        sourceKind: string;
        currentAttempt: number;
        errorCode: string | null;
      };
    expect(operation).toMatchObject({
      operationId: prepared.pending.operationId,
      resultId: prepared.pending.resultId,
      turnId: prepared.pending.turnId,
      narrationId: prepared.pending.narrationId,
      packetHash: prepared.pending.packetHash,
      status: recoveryFails ? "failed" : "complete",
      sourceKind: "model_accepted",
      currentAttempt: recoveryFails ? 3 : 2,
      errorCode: recoveryFails ? "provider_unavailable" : null,
    });
    expect(JSON.parse((operation as { receiptIdsJson: string }).receiptIdsJson))
      .toEqual(prepared.pending.receiptIds);
    const attempts = handle.sqlite.prepare(`SELECT attempt_id AS attemptId,
        operation_id AS operationId, campaign_id AS campaignId, turn_id AS turnId,
        attempt, status, error_code AS errorCode
      FROM campaign_play_narration_attempts
      WHERE campaign_id = ? AND operation_id = ? ORDER BY attempt`).all(
      CAMPAIGN_ID,
      (operation as { operationId: string }).operationId,
    ) as Array<{
      attemptId: string;
      operationId: string;
      campaignId: string;
      turnId: string;
      attempt: number;
      status: string;
      errorCode: string | null;
    }>;
    expect(attempts).toHaveLength(recoveryFails ? 3 : 2);
    expect(new Set(attempts.map((attempt) => attempt.attemptId)).size)
      .toBe(recoveryFails ? 3 : 2);
    expect(attempts).toEqual([
      expect.objectContaining({
        operationId: prepared.pending.operationId,
        campaignId: CAMPAIGN_ID,
        turnId: prepared.turnId,
        attempt: 1,
        status: "failed",
        errorCode: failure === "provider" ? "provider_unavailable" : "narration_invalid",
      }),
      expect.objectContaining({
        operationId: prepared.pending.operationId,
        campaignId: CAMPAIGN_ID,
        turnId: prepared.turnId,
        attempt: 2,
        status: recoveryFails ? "failed" : "accepted",
        errorCode: recoveryFails ? "provider_unavailable" : null,
      }),
      ...(recoveryFails ? [expect.objectContaining({
        operationId: prepared.pending.operationId,
        campaignId: CAMPAIGN_ID,
        turnId: prepared.turnId,
        attempt: 3,
        status: "failed",
        errorCode: "provider_unavailable",
      })] : []),
    ]);
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_narration_attempts WHERE campaign_id = ?`).get(CAMPAIGN_ID))
      .toEqual({ count: recoveryFails ? 3 : 2 });
    const properScene = handle.sqlite.prepare(`SELECT operation_id AS operationId, narration_id AS narrationId,
        turn_id AS turnId, packet_hash AS packetHash, attempt_id AS attemptId
      FROM campaign_play_proper_scenes
      WHERE campaign_id = ? AND operation_id = ?`).get(
      CAMPAIGN_ID,
      prepared.pending.operationId,
    );
    if (recoveryFails) {
      expect(properScene).toBeUndefined();
    } else {
      expect(properScene).toMatchObject({
        operationId: prepared.pending.operationId,
        narrationId: prepared.pending.narrationId,
        turnId: prepared.turnId,
        packetHash: prepared.pending.packetHash,
        attemptId: attempts.at(-1)!.attemptId,
      });
    }
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ?`).get(CAMPAIGN_ID))
      .toEqual({ count: recoveryFails ? 0 : 1 });
    expect(playerActionMechanicsSnapshot(handle, prepared.turnId)).toEqual(prepared.mechanics);
    expect(handle.sqlite.prepare("PRAGMA integrity_check").get())
      .toEqual({ integrity_check: "ok" });
    expect(handle.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("keeps narration failed after three invalid attempts without publishing a scene", async () => {
    const fixtureNarrator = playerNarratorFixture();
    const requests: Parameters<typeof fixtureNarrator.narrate>[0][] = [];
    const narrator: TestNarrator = {
      compile: fixtureNarrator.compile,
      narrate: vi.fn(async (request) => {
        requests.push(request);
        throw new CampaignPlayNarratorError("narration_invalid", null);
      }),
    };
    const result = await runPendingNarrationThroughApplication(narrator);
    const operation = result.handle.sqlite.prepare(`SELECT operation_id AS operationId,
        status, source_kind AS sourceKind, current_attempt AS currentAttempt, error_code AS errorCode
      FROM campaign_play_narration_operations
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, result.turnId) as {
        operationId: string;
        status: string;
        sourceKind: string;
        currentAttempt: number;
        errorCode: string | null;
      };
    const attempts = result.handle.sqlite.prepare(`SELECT attempt_id AS attemptId,
        attempt, status, error_code AS errorCode
      FROM campaign_play_narration_attempts
      WHERE campaign_id = ? AND operation_id = ? ORDER BY attempt`).all(
      CAMPAIGN_ID,
      operation.operationId,
    ) as Array<{ attemptId: string; attempt: number; status: string; errorCode: string | null }>;
    expect(narrator.narrate).toHaveBeenCalledTimes(3);
    expect(requests.map((request) => request.recoveryFeedback)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(requests.map((request) => request.structuredOutputMode)).toEqual([
      "auto",
      "auto",
      "auto",
    ]);
    expect(attempts).toHaveLength(3);
    expect(new Set(attempts.map((attempt) => attempt.attemptId)).size).toBe(3);
    expect(attempts.map((attempt) => attempt.attempt)).toEqual([1, 2, 3]);
    expect(attempts[0]).toMatchObject({ status: "failed", errorCode: "narration_invalid" });
    expect(attempts[1]).toMatchObject({ status: "failed", errorCode: "narration_invalid" });
    expect(attempts[2]).toMatchObject({ status: "failed", errorCode: "narration_invalid" });
    expect(operation).toMatchObject({
      status: "failed",
      sourceKind: "model_accepted",
      currentAttempt: 3,
      errorCode: "narration_invalid",
    });
    expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ?`).get(CAMPAIGN_ID))
      .toEqual({ count: 0 });
    expect(playerActionMechanicsSnapshot(result.handle, result.turnId)).toEqual(result.mechanics);
    expect(createCampaignPlayReadModel(result.handle).loadState()).toMatchObject({
      narrationOperation: { status: "failed", attempt: 3, sourceKind: "model_accepted" },
    });
    expect(result.handle.sqlite.prepare("PRAGMA integrity_check").get())
      .toEqual({ integrity_check: "ok" });
    expect(result.handle.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("reads an exact historical deterministic-continuity fade without rewriting it", async () => {
    const result = await runPendingNarrationThroughApplication(playerNarratorFixture());
    const scene = result.handle.sqlite.prepare(`SELECT beats_json AS beatsJson,
        effects_json AS effectsJson, suggested_actions_json AS suggestedActionsJson
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND turn_id = ?`).get(
      CAMPAIGN_ID,
      result.turnId,
    ) as { beatsJson: string; effectsJson: string; suggestedActionsJson: string };
    const packet = JSON.parse((result.handle.sqlite.prepare(`SELECT packet_json AS packetJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
      CAMPAIGN_ID,
      result.turnId,
    ) as { packetJson: string }).packetJson) as CampaignPlayNarratorPacket;
    if (packet.sourceMoment === null) {
      throw new Error("Historical continuity fixture requires a source moment.");
    }
    const beats = JSON.parse(scene.beatsJson) as Array<{ beatId: string; text: string }>;
    if (beats[0] === undefined) {
      throw new Error("Historical continuity fixture requires a beat.");
    }
    const historicalBeats = JSON.stringify([{ ...beats[0], text: packet.sourceMoment }]);
    const historicalSuggestedActions = JSON.stringify(
      packet.availableIntents.slice(0, 4).map((intent) => ({
        choiceHandle: intent.handle,
        label: intent.kind === "move" || intent.kind === "wait"
          ? buildCampaignPlaySuggestedActionLabel(packet, intent, null)
          : buildCampaignPlaySuggestedActionLabel(packet, intent, intent.label),
      })),
    );
    const effects = JSON.parse(scene.effectsJson) as Array<{ kind: string; beatId: string }>;
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ kind: "flash" });
    const historicalEffects = JSON.stringify([{
      ...effects[0],
      kind: "fade",
      beatId: beats[0].beatId,
    }]);
    dropCampaignPlayGuards(result.handle);
    result.handle.sqlite.prepare(`UPDATE campaign_play_proper_scenes
      SET display_text = ?, beats_json = ?, suggested_actions_json = ?, effects_json = ?
      WHERE campaign_id = ? AND turn_id = ?`).run(
      packet.sourceMoment,
      historicalBeats,
      historicalSuggestedActions,
      historicalEffects,
      CAMPAIGN_ID,
      result.turnId,
    );
    result.handle.sqlite.prepare(`UPDATE campaign_play_narration_operations
      SET source_kind = 'deterministic_continuity', concise_display_text = ?,
        concise_suggested_actions_json = ?
      WHERE campaign_id = ? AND turn_id = ?`).run(
      packet.sourceMoment,
      historicalSuggestedActions,
      CAMPAIGN_ID,
      result.turnId,
    );
    result.handle.sqlite.prepare(`UPDATE campaign_play_turns SET mutation_audit_json = ?
      WHERE campaign_id = ? AND id = ?`).run(
        canonicalizeCampaignPlayProjection({
          kind: "control_budget_continuity",
          reason: "authority_budget",
          sourceMomentHash: hashCampaignPlayProjection({
            domain: "historical_continuity_fixture",
            turnId: result.turnId,
          }),
        }),
        CAMPAIGN_ID,
        result.turnId,
      );
    const state = createCampaignPlayReadModel(result.handle).loadState();
    const choice = (JSON.parse(historicalSuggestedActions) as Array<{ choiceHandle: string }>)[0];
    if (!state || !choice) throw new Error("Historical continuity fixture is incomplete.");
    const runtime = turnRuntime(
      result.handle,
      result.time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator: playerNarratorFixture() },
    );
    const admission = runtime.admitAction({
      request: {
        idempotencyKey: "historical-continuity-next-action",
        expectedWorldVersion: state.worldVersion,
        expectedRuntimeRevision: state.runtimeRevision,
        source: "suggested",
        choiceHandle: choice.choiceHandle,
      },
      submittedAt: result.time.clock.now(),
    });
    expect(admission.turnId).not.toBe(result.turnId);
    expect(result.handle.sqlite.prepare(`SELECT effects_json AS effectsJson
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND turn_id = ?`).get(
      CAMPAIGN_ID,
      result.turnId,
    )).toEqual({ effectsJson: historicalEffects });
  });

  it("rejects fade on a model-accepted player-action scene", async () => {
    const prepared = await runPendingNarrationThroughApplication(playerNarratorFixture());
    const scene = prepared.handle.sqlite.prepare(`SELECT effects_json AS effectsJson,
        suggested_actions_json AS suggestedActionsJson
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND turn_id = ?`).get(
      CAMPAIGN_ID,
      prepared.turnId,
    ) as { effectsJson: string; suggestedActionsJson: string };
    const effects = JSON.parse(scene.effectsJson) as Array<{ kind: string; beatId: string }>;
    const persistedFade = JSON.stringify([{ ...effects[0]!, kind: "fade" }]);
    dropCampaignPlayGuards(prepared.handle);
    prepared.handle.sqlite.prepare(`UPDATE campaign_play_proper_scenes
      SET effects_json = ? WHERE campaign_id = ? AND turn_id = ?`).run(
      persistedFade,
      CAMPAIGN_ID,
      prepared.turnId,
    );
    const state = createCampaignPlayReadModel(prepared.handle).loadState();
    const choice = (JSON.parse(scene.suggestedActionsJson) as Array<{ choiceHandle: string }>)[0];
    if (!state || !choice) throw new Error("Model narration fixture is incomplete.");
    const runtime = turnRuntime(
      prepared.handle,
      prepared.time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator: playerNarratorFixture() },
    );
    expect(() => runtime.admitAction({
      request: {
        idempotencyKey: "model-fade-next-action",
        expectedWorldVersion: state.worldVersion,
        expectedRuntimeRevision: state.runtimeRevision,
        source: "suggested",
        choiceHandle: choice.choiceHandle,
      },
      submittedAt: prepared.time.clock.now(),
    })).toThrowError(expect.objectContaining({ code: "turn_public_context_invalid" }));
    expect(prepared.handle.sqlite.prepare(`SELECT effects_json AS effectsJson
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND turn_id = ?`).get(
      CAMPAIGN_ID,
      prepared.turnId,
    )).toEqual({ effectsJson: persistedFade });
  });

  it.each([
    ["active stage", "admitted"],
    ["failed stage", "failed"],
  ])("rejects a control-budget marker on an illegal %s", async (_label, stage) => {
    const prepared = await createCompletedPlayerActionForApplication();
    dropCampaignPlayGuards(prepared.handle);
    if (stage === "admitted") {
      prepared.handle.sqlite.prepare(`UPDATE campaign_play_turns
        SET stage = 'admitted', final_world_version = NULL, public_packet_hash = NULL,
          interrupted_stage = NULL, error_code = NULL, resume_eligible = 0,
          completed_at = NULL, mutation_audit_json = ?
        WHERE campaign_id = ? AND id = ?`).run(
        controlBudgetContinuityAudit(),
        CAMPAIGN_ID,
        prepared.turnId,
      );
    } else {
      prepared.handle.sqlite.prepare(`UPDATE campaign_play_turns
        SET stage = 'failed', public_packet_hash = NULL, interrupted_stage = NULL,
          error_code = 'persistence_failed', resume_eligible = 0,
          mutation_audit_json = ? WHERE campaign_id = ? AND id = ?`).run(
        controlBudgetContinuityAudit(),
        CAMPAIGN_ID,
        prepared.turnId,
      );
    }
    const runtime = turnRuntime(
      prepared.handle,
      prepared.time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator: playerNarratorFixture() },
    );
    expect(() => runtime.loadTurn(prepared.turnId)).toThrowError(
      expect.objectContaining({ code: "turn_corrupt" }),
    );
  });

  it("rejects a control-budget marker on an accepted narrator turn", async () => {
    const prepared = await runPendingNarrationThroughApplication(playerNarratorFixture());
    dropCampaignPlayGuards(prepared.handle);
    prepared.handle.sqlite.prepare(`UPDATE campaign_play_turns
      SET mutation_audit_json = ? WHERE campaign_id = ? AND id = ?`).run(
      controlBudgetContinuityAudit(),
      CAMPAIGN_ID,
      prepared.turnId,
    );
    const runtime = turnRuntime(
      prepared.handle,
      prepared.time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator: playerNarratorFixture() },
    );
    expect(() => runtime.loadTurn(prepared.turnId)).toThrowError(
      expect.objectContaining({ code: "turn_corrupt" }),
    );
  });

  it("rejects a control-budget marker on an opening turn", async () => {
    const prepared = await createReadyCampaignWithOpening();
    dropCampaignPlayGuards(prepared.handle);
    prepared.handle.sqlite.prepare(`UPDATE campaign_play_turns
      SET mutation_audit_json = ? WHERE campaign_id = ? AND id = ?`).run(
      controlBudgetContinuityAudit(),
      CAMPAIGN_ID,
      prepared.openingTurnId,
    );
    const runtime = turnRuntime(
      prepared.handle,
      fixedClock(7_500),
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator: playerNarratorFixture() },
    );
    expect(() => runtime.loadTurn(prepared.openingTurnId)).toThrowError(
      expect.objectContaining({ code: "turn_corrupt" }),
    );
  });

  it("rejects a completed continuity marker without terminal proof", async () => {
    const fixtureNarrator = playerNarratorFixture();
    const narrator: TestNarrator = {
      compile: fixtureNarrator.compile,
      narrate: vi.fn(async () => {
        throw new CampaignPlayNarratorError("narration_invalid", null);
      }),
    };
    const result = await runPendingNarrationThroughApplication(narrator);
    dropCampaignPlayGuards(result.handle);
    result.handle.sqlite.prepare(`DELETE FROM campaign_play_runtime_events
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'turn_completed'`).run(
      CAMPAIGN_ID,
      result.turnId,
    );
    const runtime = turnRuntime(
      result.handle,
      result.time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator: playerNarratorFixture() },
    );
    expect(() => runtime.loadTurn(result.turnId)).toThrowError(
      expect.objectContaining({ code: "turn_corrupt" }),
    );
  });

  it("leaves narration failed when attempts 2 and 3 time out", async () => {
    const successful = playerNarratorFixture();
    let calls = 0;
    const narrator: TestNarrator = {
      compile: successful.compile,
      narrate: vi.fn(async (request) => {
        calls += 1;
        if (calls === 1) throw new CampaignPlayNarratorError("narration_invalid", null);
        throw new CampaignPlayNarratorError("stage_timeout", null);
      }),
    };
    const result = await runPendingNarrationThroughApplication(narrator);
    const operation = result.handle.sqlite.prepare(`SELECT operation_id AS operationId,
        status, source_kind AS sourceKind, current_attempt AS currentAttempt, error_code AS errorCode
      FROM campaign_play_narration_operations
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, result.turnId) as {
        operationId: string;
        status: string;
        sourceKind: string;
        currentAttempt: number;
        errorCode: string | null;
      };
    const attempts = result.handle.sqlite.prepare(`SELECT attempt, status, error_code AS errorCode
      FROM campaign_play_narration_attempts
      WHERE campaign_id = ? AND operation_id = ? ORDER BY attempt`).all(
      CAMPAIGN_ID,
      operation.operationId,
    ) as Array<{ attempt: number; status: string; errorCode: string | null }>;
    expect(narrator.narrate).toHaveBeenCalledTimes(3);
    expect(attempts).toEqual([
      { attempt: 1, status: "failed", errorCode: "narration_invalid" },
      { attempt: 2, status: "failed", errorCode: "stage_timeout" },
      { attempt: 3, status: "failed", errorCode: "stage_timeout" },
    ]);
    expect(operation).toMatchObject({
      status: "failed",
      sourceKind: "model_accepted",
      currentAttempt: 3,
      errorCode: "stage_timeout",
    });
    const state = createCampaignPlayReadModel(result.handle).loadState();
    expect(state.narration).toBeNull();
    expect(state.narrationOperation).toMatchObject({
      status: "failed",
      attempt: 3,
      sourceKind: "model_accepted",
    });
    expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ?`).get(CAMPAIGN_ID))
      .toEqual({ count: 0 });
    expect(playerActionMechanicsSnapshot(result.handle, result.turnId)).toEqual(result.mechanics);
    expect(result.handle.sqlite.prepare("PRAGMA integrity_check").get())
      .toEqual({ integrity_check: "ok" });
    expect(result.handle.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("automatically retries a first Narrator timeout with the same identity and settles once", async () => {
    const successful = playerNarratorFixture();
    const requests: Parameters<typeof successful.narrate>[0][] = [];
    let calls = 0;
    const narrator: TestNarrator = {
      compile: successful.compile,
      narrate: vi.fn(async (request) => {
        requests.push(request);
        calls += 1;
        if (calls === 1) throw new CampaignPlayNarratorError("stage_timeout", null);
        return successful.narrate(request);
      }),
    };
    const result = await runPendingNarrationThroughApplication(narrator);
    const operation = result.handle.sqlite.prepare(`SELECT operation_id AS operationId,
        result_id AS resultId, turn_id AS turnId, narration_id AS narrationId,
        packet_hash AS packetHash, receipt_ids_json AS receiptIdsJson,
        status, current_attempt AS currentAttempt, current_attempt_id AS currentAttemptId,
        error_code AS errorCode
      FROM campaign_play_narration_operations
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, result.turnId) as {
        operationId: string;
        resultId: string;
        turnId: string;
        narrationId: string;
        packetHash: string;
        receiptIdsJson: string;
        status: string;
        sourceKind: string;
        currentAttempt: number;
        currentAttemptId: string;
        errorCode: string | null;
      };
    const attempts = result.handle.sqlite.prepare(`SELECT attempt_id AS attemptId,
        operation_id AS operationId, campaign_id AS campaignId, turn_id AS turnId,
        attempt, status, error_code AS errorCode
      FROM campaign_play_narration_attempts
      WHERE campaign_id = ? AND operation_id = ? ORDER BY attempt`).all(
      CAMPAIGN_ID,
      operation.operationId,
    ) as Array<{
      attemptId: string;
      operationId: string;
      campaignId: string;
      turnId: string;
      attempt: number;
      status: string;
      errorCode: string | null;
    }>;
    expect(requests.map((request) => request.structuredOutputMode)).toEqual(["auto", "auto"]);
    expect(requests.map((request) => request.recoveryFeedback)).toEqual([undefined, undefined]);
    expect(attempts).toHaveLength(2);
    expect(new Set(attempts.map((attempt) => attempt.attemptId)).size).toBe(2);
    expect(attempts).toEqual([
      expect.objectContaining({
        operationId: operation.operationId,
        campaignId: CAMPAIGN_ID,
        turnId: result.turnId,
        attempt: 1,
        status: "failed",
        errorCode: "stage_timeout",
      }),
      expect.objectContaining({
        operationId: operation.operationId,
        campaignId: CAMPAIGN_ID,
        turnId: result.turnId,
        attempt: 2,
        status: "accepted",
        errorCode: null,
      }),
    ]);
    expect(operation).toMatchObject({
      operationId: result.pending.operationId,
      resultId: result.pending.resultId,
      turnId: result.pending.turnId,
      narrationId: result.pending.narrationId,
      packetHash: result.pending.packetHash,
      status: "complete",
      currentAttempt: 2,
      errorCode: null,
    });
    expect(JSON.parse(operation.receiptIdsJson)).toEqual(result.pending.receiptIds);
    expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND operation_id = ?`).get(
      CAMPAIGN_ID,
      operation.operationId,
    )).toEqual({ count: 1 });
    expect(playerActionMechanicsSnapshot(result.handle, result.turnId)).toEqual(result.mechanics);
    expect(result.handle.sqlite.prepare("PRAGMA integrity_check").get())
      .toEqual({ integrity_check: "ok" });
    expect(result.handle.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("stops after three automatic Narrator timeout attempts", async () => {
    const successful = playerNarratorFixture();
    const requests: Parameters<typeof successful.narrate>[0][] = [];
    const narrator: TestNarrator = {
      compile: successful.compile,
      narrate: vi.fn(async (request) => {
        requests.push(request);
        throw new CampaignPlayNarratorError("stage_timeout", null);
      }),
    };
    const result = await runPendingNarrationThroughApplication(narrator);
    const operation = result.handle.sqlite.prepare(`SELECT operation_id AS operationId,
        status, source_kind AS sourceKind, current_attempt AS currentAttempt, error_code AS errorCode
      FROM campaign_play_narration_operations
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, result.turnId) as {
        operationId: string;
        status: string;
        sourceKind: string;
        currentAttempt: number;
        errorCode: string | null;
      };
    const attempts = result.handle.sqlite.prepare(`SELECT attempt, status,
        error_code AS errorCode
      FROM campaign_play_narration_attempts
      WHERE campaign_id = ? AND operation_id = ? ORDER BY attempt`).all(
      CAMPAIGN_ID,
      operation.operationId,
    ) as Array<{ attempt: number; status: string; errorCode: string | null }>;
    expect(requests.map((request) => request.structuredOutputMode)).toEqual([
      "auto",
      "auto",
      "auto",
    ]);
    expect(requests.map((request) => request.recoveryFeedback)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(attempts).toEqual([
      { attempt: 1, status: "failed", errorCode: "stage_timeout" },
      { attempt: 2, status: "failed", errorCode: "stage_timeout" },
      { attempt: 3, status: "failed", errorCode: "stage_timeout" },
    ]);
    expect(operation).toMatchObject({
      status: "failed",
      sourceKind: "model_accepted",
      currentAttempt: 3,
      errorCode: "stage_timeout",
    });
    expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ?`).get(CAMPAIGN_ID))
      .toEqual({ count: 0 });
    expect(playerActionMechanicsSnapshot(result.handle, result.turnId)).toEqual(result.mechanics);
    expect(createCampaignPlayReadModel(result.handle).loadState()).toMatchObject({
      narration: null,
      narrationOperation: {
        status: "failed",
        attempt: 3,
        sourceKind: "model_accepted",
      },
    });
    expect(result.handle.sqlite.prepare("PRAGMA integrity_check").get())
      .toEqual({ integrity_check: "ok" });
    expect(result.handle.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it.each([
    ["narration_invalid", "narration_invalid"],
    ["provider_unavailable", "transport_interrupted"],
    ["stage_timeout", "stage_timeout"],
  ] as const)(
    "gives a %s automatic recovery a fresh deadline without changing operation identity",
    async (_label, firstErrorCode) => {
      const time = fixedClock(100_000);
      const prepared = await createCompletedPlayerActionForApplication(time);
      const successful = playerNarratorFixture();
      let calls = 0;
      const narrator: TestNarrator = {
        compile: successful.compile,
        narrate: vi.fn(async (request) => {
          calls += 1;
          if (calls === 1) throw new CampaignPlayNarratorError(firstErrorCode, null);
          return successful.narrate(request);
        }),
      };
      const runtime = turnRuntime(
        prepared.handle,
        time,
        judgeFixture("deterministic"),
        gameMasterFixture(),
        { narrator },
      );
      const first = await runtime.runNarration(prepared.turnId);
      expect(first).toMatchObject({ status: "failed", attempt: 1 });
      const persistedBefore = prepared.handle.sqlite.prepare(`SELECT
        automatic_deadline_at AS automaticDeadlineAt,
        active_deadline_at AS activeDeadlineAt,
        error_code AS errorCode,
        operation_id AS operationId, result_id AS resultId, narration_id AS narrationId,
        packet_hash AS packetHash, receipt_ids_json AS receiptIdsJson
      FROM campaign_play_narration_operations WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID,
        prepared.turnId,
      ) as {
        automaticDeadlineAt: number;
        activeDeadlineAt: number;
        operationId: string;
        resultId: string;
        narrationId: string;
        packetHash: string;
        receiptIdsJson: string;
        errorCode: string | null;
      };
      expect(persistedBefore.errorCode).toBe(firstErrorCode === "transport_interrupted"
        ? "provider_unavailable"
        : firstErrorCode);
      expect(persistedBefore.automaticDeadlineAt).toBe(persistedBefore.activeDeadlineAt);
      time.advanceBy(persistedBefore.automaticDeadlineAt - time.clock.now() + 1);
      const recoveryPreparedAt = time.clock.now();
      const token = runtime.prepareNarrationRecovery({
        operationId: first!.operationId,
        resultId: first!.resultId,
        narrationId: first!.narrationId,
        packetHash: first!.packetHash,
        receiptIds: first!.receiptIds,
      }, "automatic");
      expect(token).toMatchObject({
        operationId: persistedBefore.operationId,
        resultId: persistedBefore.resultId,
        turnId: prepared.turnId,
        narrationId: persistedBefore.narrationId,
        packetHash: persistedBefore.packetHash,
        receiptIds: JSON.parse(persistedBefore.receiptIdsJson),
        attempt: 2,
        deadlineAt: recoveryPreparedAt + CAMPAIGN_PLAY_AUTOMATIC_NARRATION_WINDOW_MS,
      });
      const persistedRecovery = prepared.handle.sqlite.prepare(`SELECT
        automatic_deadline_at AS automaticDeadlineAt,
        active_deadline_at AS activeDeadlineAt
      FROM campaign_play_narration_operations WHERE campaign_id = ? AND operation_id = ?`).get(
        CAMPAIGN_ID,
        first!.operationId,
      ) as { automaticDeadlineAt: number; activeDeadlineAt: number };
      expect(persistedRecovery).toEqual({
        automaticDeadlineAt: persistedBefore.automaticDeadlineAt,
        activeDeadlineAt: recoveryPreparedAt + CAMPAIGN_PLAY_AUTOMATIC_NARRATION_WINDOW_MS,
      });
      const completed = await runtime.runNarration(prepared.turnId, token);
      expect(completed).toMatchObject({
        operationId: first!.operationId,
        resultId: first!.resultId,
        turnId: first!.turnId,
        narrationId: first!.narrationId,
        packetHash: first!.packetHash,
        receiptIds: first!.receiptIds,
        status: "complete",
        attempt: 2,
      });
      expect(calls).toBe(2);
      expect(prepared.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_narration_attempts WHERE campaign_id = ? AND operation_id = ?`).get(
        CAMPAIGN_ID,
        first!.operationId,
      )).toEqual({ count: 2 });
      expect(prepared.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND operation_id = ?`).get(
        CAMPAIGN_ID,
        first!.operationId,
      )).toEqual({ count: 1 });
      expect(playerActionMechanicsSnapshot(prepared.handle, prepared.turnId)).toEqual(prepared.mechanics);
    },
  );

  it("enforces one persisted automatic deadline when a late provider ignores abort", async () => {
    const time = deadlineClock(100_000);
    const prepared = await createCompletedPlayerActionForApplication(time);
    const successful = playerNarratorFixture();
    let calls = 0;
    let releaseLate: (() => Promise<void>) | null = null;
    let lateCandidate: Awaited<ReturnType<typeof successful.narrate>> | null = null;
    const narrator: TestNarrator = {
      compile: successful.compile,
      narrate: vi.fn((request) => {
        calls += 1;
        if (calls === 1) throw new CampaignPlayNarratorError("narration_invalid", null);
        if (calls === 3) return successful.narrate(request);
        return new Promise<Awaited<ReturnType<typeof successful.narrate>>>((resolve) => {
          releaseLate = async () => {
            const candidate = await successful.narrate(request);
            lateCandidate = candidate;
            resolve(candidate);
          };
        });
      }),
    };
    const runtime = turnRuntime(
      prepared.handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator },
    );
    const first = await runtime.runNarration(prepared.turnId);
    expect(first).toMatchObject({ status: "failed", attempt: 1 });
    const recoveryPreparedAt = time.clock.now();
    const secondToken = runtime.prepareNarrationRecovery({
      operationId: first!.operationId,
      resultId: first!.resultId,
      narrationId: first!.narrationId,
      packetHash: first!.packetHash,
      receiptIds: first!.receiptIds,
    }, "automatic");
    const persistedDeadline = prepared.handle.sqlite.prepare(`SELECT
        automatic_deadline_at AS automaticDeadlineAt,
        active_deadline_at AS activeDeadlineAt
      FROM campaign_play_narration_operations WHERE campaign_id = ? AND turn_id = ?`).get(
      CAMPAIGN_ID,
      prepared.turnId,
    ) as { automaticDeadlineAt: number; activeDeadlineAt: number };
    const completedAt = (prepared.handle.sqlite.prepare(`SELECT completed_at AS completedAt
      FROM campaign_play_turns WHERE campaign_id = ? AND id = ?`).get(
      CAMPAIGN_ID,
      prepared.turnId,
    ) as { completedAt: number }).completedAt;
    expect(completedAt).toBeGreaterThan(25_000);
    expect(persistedDeadline.automaticDeadlineAt).toBe(
      completedAt + CAMPAIGN_PLAY_AUTOMATIC_NARRATION_WINDOW_MS,
    );
    expect(persistedDeadline.activeDeadlineAt).toBe(
      recoveryPreparedAt + CAMPAIGN_PLAY_AUTOMATIC_NARRATION_WINDOW_MS,
    );
    const inFlight = runtime.runNarration(prepared.turnId, secondToken);
    expect(narrator.narrate).toHaveBeenCalledTimes(2);
    time.advanceBy(persistedDeadline.activeDeadlineAt - time.clock.now());
    const failed = await inFlight;
    expect(failed).toMatchObject({ status: "failed", attempt: 2 });
    const secondRequest = vi.mocked(narrator.narrate).mock.calls[1]?.[0];
    expect(secondRequest).toBeDefined();
    expect(secondRequest!.signal).toBeDefined();
    expect(secondRequest!.signal!.aborted).toBe(true);
    expect(releaseLate).not.toBeNull();
    await releaseLate!();
    expect(lateCandidate).not.toBeNull();
    expect(prepared.handle.sqlite.prepare(`SELECT attempt, status, error_code AS errorCode
      FROM campaign_play_narration_attempts WHERE campaign_id = ? AND operation_id = ?
      ORDER BY attempt`).all(CAMPAIGN_ID, first!.operationId)).toEqual([
      { attempt: 1, status: "failed", errorCode: "narration_invalid" },
      { attempt: 2, status: "failed", errorCode: "stage_timeout" },
    ]);
    expect(prepared.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND operation_id = ?`).get(
      CAMPAIGN_ID,
      first!.operationId,
    )).toEqual({ count: 0 });
    closeTracked(prepared.handle);
    const reloaded = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    expect(createCampaignPlayReadModel(reloaded).loadState()).toMatchObject({
      narration: null,
      narrationOperation: {
        operationId: first!.operationId,
        status: "failed",
        attempt: 2,
        conciseResult: { displayText: expect.any(String), suggestedActions: expect.any(Array) },
      },
    });
    expect(reloaded.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(reloaded.sqlite.pragma("foreign_key_check")).toEqual([]);

    const reloadedRuntime = turnRuntime(
      reloaded,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator },
    );
    const automaticDeadline = persistedDeadline.automaticDeadlineAt;
    const manualToken = reloadedRuntime.prepareNarrationRecovery({
      operationId: first!.operationId,
      resultId: first!.resultId,
      narrationId: first!.narrationId,
      packetHash: first!.packetHash,
      receiptIds: first!.receiptIds,
    });
    expect(manualToken).toMatchObject({
      operationId: first!.operationId,
      resultId: first!.resultId,
      turnId: first!.turnId,
      narrationId: first!.narrationId,
      packetHash: first!.packetHash,
      receiptIds: first!.receiptIds,
      attempt: 3,
      deadlineAt: time.clock.now() + 180_000,
    });
    const manualDeadlines = reloaded.sqlite.prepare(`SELECT
        automatic_deadline_at AS automaticDeadlineAt,
        active_deadline_at AS activeDeadlineAt,
        result_id AS resultId, narration_id AS narrationId, packet_hash AS packetHash,
        receipt_ids_json AS receiptIdsJson
      FROM campaign_play_narration_operations WHERE campaign_id = ? AND operation_id = ?`).get(
      CAMPAIGN_ID,
      first!.operationId,
    ) as {
      automaticDeadlineAt: number;
      activeDeadlineAt: number;
      resultId: string;
      narrationId: string;
      packetHash: string;
      receiptIdsJson: string;
    };
    expect(manualDeadlines).toEqual({
      automaticDeadlineAt: automaticDeadline,
      activeDeadlineAt: time.clock.now() + 180_000,
      resultId: first!.resultId,
      narrationId: first!.narrationId,
      packetHash: first!.packetHash,
      receiptIdsJson: JSON.stringify(first!.receiptIds),
    });
    expect(() => createCampaignPlayNarrationOperationRepository(reloaded).accept({
      token: secondToken,
      narration: lateCandidate!.narration,
      evidence: {
        actualProviderId: "test",
        actualModel: "test-narrator",
        actualStrategy: "strict_object",
        inputTokens: 15,
        outputTokens: 25,
        durationMs: 5,
        finishReason: "stop",
      },
      acceptedAt: time.clock.now(),
    })).toThrowError(expect.objectContaining({ code: "operation_fence_lost" }));
    const manual = await reloadedRuntime.runNarration(prepared.turnId, manualToken);
    expect(manual).toMatchObject({
      operationId: first!.operationId,
      resultId: first!.resultId,
      turnId: first!.turnId,
      narrationId: first!.narrationId,
      packetHash: first!.packetHash,
      receiptIds: first!.receiptIds,
      status: "complete",
      attempt: 3,
    });
    expect(reloaded.sqlite.prepare(`SELECT attempt, status, error_code AS errorCode
      FROM campaign_play_narration_attempts WHERE campaign_id = ? AND operation_id = ?
      ORDER BY attempt`).all(CAMPAIGN_ID, first!.operationId)).toEqual([
      { attempt: 1, status: "failed", errorCode: "narration_invalid" },
      { attempt: 2, status: "failed", errorCode: "stage_timeout" },
      { attempt: 3, status: "accepted", errorCode: null },
    ]);
    expect(reloaded.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND operation_id = ?`).get(
      CAMPAIGN_ID,
      first!.operationId,
    )).toEqual({ count: 1 });
    expect(playerActionMechanicsSnapshot(reloaded, prepared.turnId)).toEqual(prepared.mechanics);
  });

  it("keeps a normal application narration success to one attempt", async () => {
    const narrator = playerNarratorFixture();
    const result = await runPendingNarrationThroughApplication(narrator);
    const operation = result.handle.sqlite.prepare(`SELECT status,
        current_attempt AS currentAttempt FROM campaign_play_narration_operations
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, result.turnId) as {
        status: string;
        currentAttempt: number;
      };
    expect(narrator.narrate).toHaveBeenCalledTimes(1);
    expect(narrator.narrate.mock.calls[0]?.[0]).toMatchObject({
      structuredOutputMode: "auto",
    });
    expect(operation).toEqual({ status: "complete", currentAttempt: 1 });
    expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_narration_attempts WHERE campaign_id = ?`).get(CAMPAIGN_ID))
      .toEqual({ count: 1 });
    expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ?`).get(CAMPAIGN_ID))
      .toEqual({ count: 1 });
    expect(playerActionMechanicsSnapshot(result.handle, result.turnId)).toEqual(result.mechanics);
  });

  it.each([
    ["transport error", () => new Error("transport interrupted")],
    ["provider error", () => new CampaignPlayNarratorError("transport_interrupted", null)],
  ] as const)(
    "automatically retries one %s narration failure without replaying mechanics",
    async (_label, createError) => {
      const successful = playerNarratorFixture();
      let calls = 0;
      const requests: Parameters<typeof successful.narrate>[0][] = [];
      const narrator: TestNarrator = {
        compile: successful.compile,
        narrate: vi.fn(async (request) => {
          requests.push(request);
          calls += 1;
          if (calls === 1) throw createError();
          return successful.narrate(request);
        }),
      };
      const result = await runPendingNarrationThroughApplication(narrator);
      const operation = result.handle.sqlite.prepare(`SELECT operation_id AS operationId,
          result_id AS resultId, narration_id AS narrationId, packet_hash AS packetHash,
          receipt_ids_json AS receiptIdsJson, status, current_attempt AS currentAttempt,
          error_code AS errorCode, automatic_deadline_at AS automaticDeadlineAt,
          active_deadline_at AS activeDeadlineAt
        FROM campaign_play_narration_operations
        WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, result.turnId) as {
          operationId: string;
          resultId: string;
          narrationId: string;
          packetHash: string;
          receiptIdsJson: string;
          status: string;
          currentAttempt: number;
          errorCode: string | null;
          automaticDeadlineAt: number;
          activeDeadlineAt: number;
        };
      const attempts = result.handle.sqlite.prepare(`SELECT attempt, status,
          error_code AS errorCode FROM campaign_play_narration_attempts
        WHERE campaign_id = ? AND operation_id = ? ORDER BY attempt`).all(
          CAMPAIGN_ID,
          operation.operationId,
        );

      expect(narrator.narrate).toHaveBeenCalledTimes(2);
      expect(requests.map((request) => request.structuredOutputMode)).toEqual([
        "auto",
        "auto",
      ]);
      expect(attempts).toEqual([
        { attempt: 1, status: "failed", errorCode: "provider_unavailable" },
        { attempt: 2, status: "accepted", errorCode: null },
      ]);
      expect(operation).toMatchObject({
        resultId: result.pending.resultId,
        narrationId: result.pending.narrationId,
        packetHash: result.pending.packetHash,
        status: "complete",
        currentAttempt: 2,
        errorCode: null,
      });
      expect(operation.activeDeadlineAt).toBe(operation.automaticDeadlineAt);
      expect(JSON.parse(operation.receiptIdsJson)).toEqual(result.pending.receiptIds);
      expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
        FROM campaign_play_proper_scenes WHERE campaign_id = ? AND operation_id = ?`).get(
          CAMPAIGN_ID,
          operation.operationId,
        )).toEqual({ count: 1 });
      expect(playerActionMechanicsSnapshot(result.handle, result.turnId)).toEqual(result.mechanics);
    },
  );

  it("leaves narration failed after three provider-unavailable attempts", async () => {
    const fixtureNarrator = playerNarratorFixture();
    const requests: Parameters<typeof fixtureNarrator.narrate>[0][] = [];
    const narrator: TestNarrator = {
      compile: fixtureNarrator.compile,
      narrate: vi.fn(async (request) => {
        requests.push(request);
        throw new CampaignPlayNarratorError("transport_interrupted", null);
      }),
    };
    const result = await runPendingNarrationThroughApplication(narrator);
    expect(narrator.narrate).toHaveBeenCalledTimes(3);
    expect(requests.map((request) => request.structuredOutputMode)).toEqual([
      "auto",
      "auto",
      "auto",
    ]);
    expect(result.handle.sqlite.prepare(`SELECT attempt, status, error_code AS errorCode
      FROM campaign_play_narration_attempts WHERE campaign_id = ? ORDER BY attempt`).all(
        CAMPAIGN_ID,
      )).toEqual([
        { attempt: 1, status: "failed", errorCode: "provider_unavailable" },
        { attempt: 2, status: "failed", errorCode: "provider_unavailable" },
        { attempt: 3, status: "failed", errorCode: "provider_unavailable" },
      ]);
    expect(result.handle.sqlite.prepare(`SELECT status, source_kind AS sourceKind,
        current_attempt AS currentAttempt, error_code AS errorCode FROM campaign_play_narration_operations
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, result.turnId)).toEqual({
      status: "failed",
      sourceKind: "model_accepted",
      currentAttempt: 3,
      errorCode: "provider_unavailable",
      });
      expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
        FROM campaign_play_proper_scenes WHERE campaign_id = ? AND turn_id = ?`).get(
          CAMPAIGN_ID,
          result.turnId,
        ))
        .toEqual({ count: 0 });
    expect(playerActionMechanicsSnapshot(result.handle, result.turnId)).toEqual(result.mechanics);
  });

  const nonRetryableNarrationFailures = [
    { label: "budget", expectedErrorCode: "stage_budget_exceeded", createError: () => new CampaignPlayNarratorError("stage_budget_exceeded", null) },
  ] as const;

  it.each(nonRetryableNarrationFailures)(
    "leaves narration failed after a $label narration failure",
    async ({ createError, expectedErrorCode }) => {
      const fixtureNarrator = playerNarratorFixture();
      const narrator: TestNarrator = {
        compile: fixtureNarrator.compile,
        narrate: vi.fn(async () => {
          throw createError();
        }),
      };
      const result = await runPendingNarrationThroughApplication(narrator);
      const operation = result.handle.sqlite.prepare(`SELECT status, source_kind AS sourceKind,
          current_attempt AS currentAttempt, error_code AS errorCode
        FROM campaign_play_narration_operations
        WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, result.turnId) as {
          status: string;
          sourceKind: string;
          currentAttempt: number;
          errorCode: string | null;
        };
      expect(narrator.narrate).toHaveBeenCalledTimes(1);
      expect(operation).toEqual({
        status: "failed",
        sourceKind: "model_accepted",
        currentAttempt: 1,
        errorCode: expectedErrorCode,
      });
      expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
        FROM campaign_play_narration_attempts WHERE campaign_id = ?`).get(CAMPAIGN_ID))
        .toEqual({ count: 1 });
      expect(result.handle.sqlite.prepare(`SELECT COUNT(*) AS count
        FROM campaign_play_proper_scenes WHERE campaign_id = ? AND turn_id = ?`).get(
          CAMPAIGN_ID,
          result.turnId,
        ))
        .toEqual({ count: 0 });
      expect(playerActionMechanicsSnapshot(result.handle, result.turnId)).toEqual(result.mechanics);
    },
  );

  it("does not append an automatic attempt after an explicitly triggered Restore failure", async () => {
    const prepared = await createCompletedPlayerActionForApplication();
    const fixtureNarrator = playerNarratorFixture();
    const narrator: TestNarrator = {
      compile: fixtureNarrator.compile,
      narrate: vi.fn(async () => {
        throw new CampaignPlayNarratorError("narration_invalid", null);
      }),
    };
    const firstRuntime = turnRuntime(
      prepared.handle,
      prepared.time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator },
    );
    const failed = await firstRuntime.runNarration(prepared.turnId);
    expect(failed).toMatchObject({ status: "failed", attempt: 1 });
    closeTracked(prepared.handle);
    const application = createCampaignPlayApplication({
      now: prepared.time.clock.now,
      runtimeFactory: {
        createOpening: () => { throw new Error("Opening is outside narration recovery."); },
        createTurn: (handle) => turnRuntime(
          handle,
          prepared.time,
          judgeFixture("deterministic"),
          gameMasterFixture(),
          { narrator },
        ),
      },
    });
    const response = application.recoverNarration(CAMPAIGN_ID, prepared.turnId, {
      operationId: failed!.operationId,
      resultId: failed!.resultId,
      narrationId: failed!.narrationId,
      packetHash: failed!.packetHash,
      receiptIds: failed!.receiptIds,
    });
    expect(response).toMatchObject({ attempt: 2, status: "running" });
    await application.waitForIdle(CAMPAIGN_ID);
    const handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    expect(narrator.narrate).toHaveBeenCalledTimes(2);
    expect(handle.sqlite.prepare(`SELECT attempt, status, error_code AS errorCode
      FROM campaign_play_narration_attempts WHERE campaign_id = ?
      ORDER BY attempt`).all(CAMPAIGN_ID)).toEqual([
      { attempt: 1, status: "failed", errorCode: "narration_invalid" },
      { attempt: 2, status: "failed", errorCode: "narration_invalid" },
    ]);
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_narration_attempts WHERE campaign_id = ?`).get(CAMPAIGN_ID))
      .toEqual({ count: 2 });
    expect(playerActionMechanicsSnapshot(handle, prepared.turnId)).toEqual(prepared.mechanics);
  });

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
    await advanceUntilStage(buildRuntime(), time, admission.turnId, "completed");
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
    await reopenedRuntime.runNarration(admission.turnId);

    expect(reopenedRuntime.loadTurn(admission.turnId)).toMatchObject({ stage: "completed" });
    expect(narrator.narrate).toHaveBeenCalledTimes(1);
    expect(narrator.narrate.mock.calls[0]![0].packetBytes).toBe(frozen.packetJson);
    expect(handle.sqlite.prepare(`SELECT packet_hash AS packetHash, packet_json AS packetJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
      CAMPAIGN_ID,
      admission.turnId,
    )).toEqual(frozen);
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count FROM campaign_play_proper_scenes
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, admission.turnId))
      .toEqual({ count: 1 });
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(commandCount);
  });

  it("reopens an expired narration attempt as the same failed recovery operation", async () => {
    const fixture = await createReadyCampaignWithOpening();
    let handle = fixture.handle;
    const time = fixedClock(7_625);
    const narrator = playerNarratorFixture();
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      {
        narrator,
        injectNarratorFault(point) {
          if (point === "after_provider_return") throw new Error("process stopped after provider return");
        },
      },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(fixture.state, "narration-expired-reload"),
      submittedAt: 7_625,
    });
    await advanceUntilStage(runtime, time, admission.turnId, "completed");
    const original = createCampaignPlayReadModel(handle).loadState().narrationOperation!;
    const commandCount = countForTurn(handle, "campaign_play_commands", admission.turnId);
    await expect(runtime.runNarration(admission.turnId))
      .rejects.toThrow("process stopped after provider return");

    closeTracked(handle);
    time.advanceBy(1_001);
    handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    const interrupted = createCampaignPlayNarrationOperationRepository(handle)
      .interruptExpired(time.clock.now());
    expect(interrupted).toMatchObject({
      operationId: original.operationId,
      resultId: original.resultId,
      packetHash: original.packetHash,
      receiptIds: original.receiptIds,
      attemptId: expect.any(String),
      attempt: 1,
      status: "failed",
    });
    expect(createCampaignPlayReadModel(handle).loadState()).toMatchObject({
      phase: "ready",
      narration: null,
      narrationOperation: { operationId: original.operationId, status: "failed" },
    });
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(commandCount);
    expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(1);
  });

  it("keeps a failed proper scene separate from the committed result and recovers by exact identity", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(7_750);
    const compiler = createCampaignPlayNarrator();
    const successfulNarrator = playerNarratorFixture();
    let narrationCalls = 0;
    const narrator = {
      compile: compiler.compile,
      narrate: vi.fn(async (request: Parameters<typeof compiler.narrate>[0]) => {
        narrationCalls += 1;
        if (narrationCalls === 1) {
          throw new CampaignPlayNarratorError("transport_interrupted", {
            ...openingNarratorEvidence,
            actualProviderId: "partial-provider",
            responseModel: null,
            actualStrategy: "native_schema",
            durationMs: 77,
            errorCode: "narration_invalid",
          });
        }
        return successfulNarrator.narrate(request);
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
    await advanceUntilStage(runtime, time, admission.turnId, "completed");
    const commandCount = countForTurn(handle, "campaign_play_commands", admission.turnId);
    const pending = createCampaignPlayReadModel(handle).loadState().narrationOperation!;
    const failed = await runtime.runNarration(admission.turnId);
    expect(failed).toMatchObject({
      operationId: pending.operationId,
      resultId: pending.resultId,
      packetHash: pending.packetHash,
      receiptIds: pending.receiptIds,
      status: "failed",
      attempt: 1,
    });
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      stage: "completed",
      resumeEligible: false,
    });
    expect(handle.sqlite.prepare(`SELECT actual_provider_id AS actualProviderId,
      actual_model AS actualModel, actual_strategy AS actualStrategy,
      duration_ms AS durationMs, error_code AS errorCode, schema_outcome AS schemaOutcome
      FROM campaign_play_narration_attempts
      WHERE campaign_id = ? AND turn_id = ?
      ORDER BY attempt DESC LIMIT 1`).get(CAMPAIGN_ID, admission.turnId)).toEqual({
        actualProviderId: null,
        actualModel: null,
        actualStrategy: null,
        durationMs: 77,
        errorCode: "provider_unavailable",
        schemaOutcome: "transport_error",
      });
    const token = runtime.prepareNarrationRecovery({
      operationId: failed!.operationId,
      resultId: failed!.resultId,
      narrationId: failed!.narrationId,
      packetHash: failed!.packetHash,
      receiptIds: failed!.receiptIds,
    });
    expect(token).toMatchObject({
      operationId: pending.operationId,
      turnId: admission.turnId,
      packetHash: pending.packetHash,
      attempt: 2,
    });
    const recovered = await runtime.runNarration(admission.turnId, token);
    expect(recovered).toMatchObject({ status: "complete", attempt: 2 });
    expect(countForTurn(handle, "campaign_play_commands", admission.turnId)).toBe(commandCount);
    expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(1);
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count FROM campaign_play_proper_scenes
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, admission.turnId))
      .toEqual({ count: 1 });
  });

  it("coalesces duplicate narration completion at one proper scene", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(8_000);
    const narrator = playerNarratorFixture();
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { narrator },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "narrator-duplicate-completion"),
      submittedAt: 8_000,
    });
    await advanceUntilStage(runtime, time, admission.turnId, "completed");
    const first = await runtime.runNarration(admission.turnId);
    const duplicate = await runtime.runNarration(admission.turnId);

    expect(duplicate).toEqual(first);
    expect(narrator.narrate).toHaveBeenCalledTimes(1);
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count FROM campaign_play_proper_scenes
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, admission.turnId))
      .toEqual({ count: 1 });
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count FROM campaign_play_narration_attempts
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, admission.turnId))
      .toEqual({ count: 1 });
  });

  it("keeps late completion and mismatched reload recovery fenced behind the newer result", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(8_250);
    const successfulNarrator = playerNarratorFixture();
    let releaseNarration: (() => Promise<void>) | null = null;
    let narrationCalls = 0;
    const compiler = createCampaignPlayNarrator();
    const narrator = {
      compile: compiler.compile,
      narrate: vi.fn((request: Parameters<typeof compiler.narrate>[0]) => {
        narrationCalls += 1;
        if (narrationCalls === 1) {
          return new Promise<Awaited<ReturnType<typeof compiler.narrate>>>((resolve) => {
            releaseNarration = async () => resolve(await successfulNarrator.narrate(request));
          });
        }
        throw new CampaignPlayNarratorError("transport_interrupted", {
          ...openingNarratorEvidence,
          actualProviderId: "current-result-provider",
          responseModel: null,
          actualStrategy: "native_schema",
          durationMs: 91,
          errorCode: "narration_invalid",
        });
      }),
    };
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(1, true),
      { narrator },
    );
    const first = runtime.admitAction({
      request: admissionRequest(state, "narrator-stale-first"),
      submittedAt: 8_250,
    });
    await advanceUntilStage(runtime, time, first.turnId, "completed");
    const inFlight = runtime.runNarration(first.turnId);
    await vi.waitFor(() => expect(releaseNarration).not.toBeNull());

    const nextState = createCampaignPlayStateRepository(handle).loadState()!;
    expect(createCampaignPlayReadModel(handle).loadState().phase).toBe("ready");
    const second = runtime.admitAction({
      request: admissionRequest(nextState, "narrator-stale-second", "I follow the next signal."),
      submittedAt: 8_251,
    });
    await advanceUntilStage(runtime, time, second.turnId, "completed");
    const currentFailure = await runtime.runNarration(second.turnId);
    expect(currentFailure).toMatchObject({ status: "failed", turnId: second.turnId });
    await releaseNarration!();
    const stale = await inFlight;

    expect(stale).toMatchObject({ status: "failed", turnId: first.turnId });
    expect(handle.sqlite.prepare(`SELECT status, error_code AS errorCode
      FROM campaign_play_narration_attempts WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID,
        first.turnId,
      )).toEqual({ status: "stale", errorCode: "stale_artifact" });
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count FROM campaign_play_proper_scenes
      WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, first.turnId))
      .toEqual({ count: 0 });
    expect(countForTurn(handle, "campaign_play_turn_results", first.turnId)).toBe(1);
    expect(countForTurn(handle, "campaign_play_turn_results", second.turnId)).toBe(1);

    const recoveryRequest = {
      operationId: currentFailure!.operationId,
      resultId: currentFailure!.resultId,
      narrationId: currentFailure!.narrationId,
      packetHash: currentFailure!.packetHash,
      receiptIds: currentFailure!.receiptIds,
    };
    const snapshot = () => ({
      authority: handle.sqlite.prepare(`SELECT * FROM campaign_play_states
        WHERE campaign_id = ?`).get(CAMPAIGN_ID),
      turns: handle.sqlite.prepare(`SELECT * FROM campaign_play_turns
        WHERE campaign_id = ? AND id IN (?, ?) ORDER BY submitted_at, id`).all(
          CAMPAIGN_ID,
          first.turnId,
          second.turnId,
        ),
      operation: handle.sqlite.prepare(`SELECT * FROM campaign_play_narration_operations
        WHERE campaign_id = ? AND operation_id = ?`).get(
          CAMPAIGN_ID,
          currentFailure!.operationId,
        ),
      attempts: handle.sqlite.prepare(`SELECT * FROM campaign_play_narration_attempts
        WHERE campaign_id = ? AND operation_id = ? ORDER BY attempt`).all(
          CAMPAIGN_ID,
          currentFailure!.operationId,
        ),
      result: handle.sqlite.prepare(`SELECT * FROM campaign_play_turn_results
        WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, second.turnId),
      packet: handle.sqlite.prepare(`SELECT * FROM campaign_play_narrations
        WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, second.turnId),
      receipts: handle.sqlite.prepare(`SELECT * FROM campaign_play_receipts
        WHERE campaign_id = ? AND turn_id = ? ORDER BY receipt_id`).all(
          CAMPAIGN_ID,
          second.turnId,
        ),
      counts: handle.sqlite.prepare(`SELECT
        (SELECT COUNT(*) FROM campaign_play_narration_operations WHERE campaign_id = ?) AS operations,
        (SELECT COUNT(*) FROM campaign_play_narration_attempts WHERE campaign_id = ?) AS attempts,
        (SELECT COUNT(*) FROM campaign_play_proper_scenes WHERE campaign_id = ?) AS scenes,
        (SELECT COUNT(*) FROM campaign_play_turn_results WHERE campaign_id = ?) AS results,
        (SELECT COUNT(*) FROM campaign_play_receipts WHERE campaign_id = ?) AS receipts,
        (SELECT COUNT(*) FROM campaign_play_turns WHERE campaign_id = ?) AS turns`).get(
          CAMPAIGN_ID,
          CAMPAIGN_ID,
          CAMPAIGN_ID,
          CAMPAIGN_ID,
          CAMPAIGN_ID,
          CAMPAIGN_ID,
        ),
    });
    const before = snapshot();
    const createTurn = vi.fn((reloadedHandle: CampaignPlayDatabaseHandle) =>
      turnRuntime(
        reloadedHandle,
        time,
        judgeFixture("deterministic"),
        gameMasterFixture(),
      ));
    const reloadedApplication = createCampaignPlayApplication({
      now: time.clock.now,
      runtimeFactory: {
        createOpening: () => { throw new Error("Opening is outside narration recovery."); },
        createTurn,
      },
    });

    expect(() => reloadedApplication.recoverNarration(
      CAMPAIGN_ID,
      first.turnId,
      recoveryRequest,
    )).toThrow(expect.objectContaining<Partial<CampaignPlayApplicationError>>({
      publicCode: "turn_not_resumable",
      message: "The proper scene can no longer be restored.",
    }));
    expect(createTurn).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
  });

  it("defers failed player-action replanning without explicit resume", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(3_500);
    let providerCalls = 0;
    const actorReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => {
        providerCalls += 1;
        if (providerCalls === 1) throw new Error("provider transport interrupted");
        return {
          object: actorReplanModelObjectFromPrompt(request.prompt),
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
        stage: "deferred",
        deferReason: "control_budget",
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

    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      stage: "primary_settled",
      workerEpoch: interruptedTurn.workerEpoch,
      workerLeaseOwner: null,
    });
    await advanceUntilStage(runtime, time, admission.turnId, "actors_settled");
    expect(providerCalls).toBe(1);
  });

  it("gives the Actor Replanner its full stage window without synthesizing continuity", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const submittedAt = 100_000;
    const time = fixedClock(submittedAt);
    let providerCalls = 0;
    let actorStartedAt: number | null = null;
    const actorReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => {
        providerCalls += 1;
        actorStartedAt ??= time.clock.now();
        // Cross the removed 30-second reserve while staying inside the
        // Actor Replanner's own 90-second model-stage window.
        time.advanceBy(submittedAt + 85_000 - time.clock.now());
        return {
          object: actorReplanModelObjectFromPrompt(request.prompt),
          trace: actorReplanTrace(),
        };
      }) as unknown as typeof safeGenerateObject,
    });
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      {
        actorReplanner,
        // Keep the fixture lease alive while the fake clock crosses the
        // provider boundary.
        leaseDurationMs: 200_000,
      },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "r174-control-budget-boundary"),
      submittedAt,
    });

    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    // Make the Actor Replanner begin exactly 68 seconds after admission.
    time.advanceBy(submittedAt + 67_980 - time.clock.now());
    const jobId = forceFirstActorReplan(handle, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);

    expect(actorStartedAt).toBe(submittedAt + 68_000);
    expect(time.clock.now()).toBe(submittedAt + 85_000);
    expect(providerCalls).toBe(2);
    expect(handle.sqlite.prepare(`SELECT attempt, status, error_code AS errorCode
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'
      ORDER BY attempt`).all(CAMPAIGN_ID, admission.turnId)).toEqual([
      { attempt: 1, status: "accepted", errorCode: null },
    ]);

    const completed = await advanceUntilStage(runtime, time, admission.turnId, "completed");
    expect(completed.completedAt).toBeGreaterThan(submittedAt + 30_000);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)?.stage).toBe("settled");
    expect(createCampaignPlayReadModel(handle).loadState().narrationOperation).toMatchObject({
      turnId: admission.turnId,
      status: "pending",
      sourceKind: "model_accepted",
    });
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND turn_id = ?`).get(
      CAMPAIGN_ID,
      admission.turnId,
    )).toEqual({ count: 0 });
  });

  it("does not skip the Actor Replanner because earlier stages consumed time", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const submittedAt = 3_800;
    const time = fixedClock(submittedAt);
    let providerCalls = 0;
    const actorReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async () => {
        providerCalls += 1;
        throw new Error("actor provider unavailable");
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
      request: admissionRequest(state, "actor-direct-control-budget"),
      submittedAt,
    });

    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    // Crossing the former shared player-action deadline must not suppress the
    // Actor Replanner's own model-stage attempt.
    time.advanceBy(85_000);
    const actorsSettled = await advanceUntilStage(runtime, time, admission.turnId, "actors_settled");
    expect(actorsSettled.stage).toBe("actors_settled");
    expect(providerCalls).toBe(1);

    const jobs = createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((job) => job.stage === "deferred" && job.deferReason === "control_budget"))
      .toBe(true);
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'`).get(
      CAMPAIGN_ID,
      admission.turnId,
    )).toEqual({ count: 1 });

    const completed = await advanceUntilStage(runtime, time, admission.turnId, "completed");
    expect(completed.terminalReason).toBe("action_resolved");
    const narration = await runtime.runNarration(admission.turnId);
    expect(narration).toMatchObject({ status: "complete" });
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND turn_id = ?`).get(
      CAMPAIGN_ID,
      admission.turnId,
    )).toEqual({ count: 1 });
    expect(createCampaignPlayReadModel(handle).loadState()).toMatchObject({
      phase: "ready",
      activeTurn: null,
      narration: expect.objectContaining({ turnId: admission.turnId }),
      narrationOperation: expect.objectContaining({
        turnId: admission.turnId,
        status: "complete",
      }),
    });
  });

  it("defers a provider interruption without a second actor epoch", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(3_800);
    let providerCalls = 0;
    const actorReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => {
        providerCalls += 1;
        if (providerCalls === 1) throw new Error("provider transport interrupted");
        return {
          object: actorReplanModelObjectFromPrompt(request.prompt),
          trace: actorReplanTrace(),
        };
      }) as unknown as typeof safeGenerateObject,
    });
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorReplanner, owner: "actor-resume-heartbeat-worker" },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "actor-resume-heartbeat"),
      submittedAt: 3_800,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    const jobId = forceFirstActorReplan(handle, time, admission.turnId);

    time.advance();
    await runtime.runNextStage(admission.turnId);
    const interruptedTurn = runtime.loadTurn(admission.turnId)!;
    expect(providerCalls).toBe(1);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({
        stage: "deferred",
        deferReason: "control_budget",
        workerEpoch: 1,
      });
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      stage: "primary_settled",
      workerLeaseOwner: null,
    });
    await advanceUntilStage(runtime, time, admission.turnId, "actors_settled");
  });

  it("defers an invalid background replan and continues the committed player turn", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(3_800);
    let providerCalls = 0;
    const actorReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async () => {
        providerCalls += 1;
        return {
          object: { unexpected: true },
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
      request: admissionRequest(state, "actor-replanner-invalid"),
      submittedAt: 3_800,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    const jobId = forceFirstActorReplan(handle, time, admission.turnId);

    time.advance();
    await runtime.runNextStage(admission.turnId);

    expect(providerCalls).toBe(1);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({
        stage: "deferred",
        deferReason: "replan_invalid",
        workerEpoch: 1,
      });
    expect(handle.sqlite.prepare(`SELECT status, error_code AS errorCode
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({ status: "interrupted", errorCode: "model_contract_invalid" });
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      stage: "primary_settled",
      workerLeaseOwner: null,
    });

    await advanceUntilStage(runtime, time, admission.turnId, "actors_settled");
  });

  it("defers a contract-invalid replan when its fresh recovery window misses the control deadline", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const submittedAt = 3_800;
    const time = fixedClock(submittedAt);
    let providerCalls = 0;
    const actorReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async () => {
        providerCalls += 1;
        return {
          object: { unexpected: true },
          trace: actorReplanTrace(),
        };
      }) as unknown as typeof safeGenerateObject,
    });
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      {
        actorReplanner,
        actorReplannerModel: {
          languageModel: {} as LanguageModel,
          reasoningModel: {} as LanguageModel,
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
      },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "actor-replanner-control-budget-invalid"),
      submittedAt,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    const jobId = forceFirstActorReplan(handle, time, admission.turnId);

    time.advance();
    await runtime.runNextStage(admission.turnId);

    expect(providerCalls).toBe(1);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({
        stage: "deferred",
        deferReason: "control_budget",
        workerEpoch: 1,
      });
    expect(handle.sqlite.prepare(`SELECT attempt, status, schema_outcome AS schemaOutcome,
        error_code AS errorCode
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'
      ORDER BY attempt`).all(CAMPAIGN_ID, admission.turnId)).toEqual([
      {
        attempt: 1,
        status: "interrupted",
        schemaOutcome: "invalid",
        errorCode: "model_contract_invalid",
      },
    ]);
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_actor_replan_attempts
      WHERE campaign_id = ? AND job_id = ? AND attempt_number = 2`).get(
      CAMPAIGN_ID,
      jobId,
    )).toEqual({ count: 0 });
    expect(handle.sqlite.prepare(`SELECT retry_consumed_at AS retryConsumedAt
      FROM campaign_play_actor_replan_attempts
      WHERE campaign_id = ? AND job_id = ? AND attempt_number = 1`).get(
      CAMPAIGN_ID,
      jobId,
    )).toEqual({ retryConsumedAt: null });
    expect(runtime.loadTurn(admission.turnId)).toMatchObject({
      stage: "primary_settled",
      workerLeaseOwner: null,
    });

    const completed = await advanceUntilStage(runtime, time, admission.turnId, "completed");
    expect(completed.terminalReason).toBe("action_resolved");
    const narration = await runtime.runNarration(admission.turnId);
    expect(narration).toMatchObject({ status: "complete" });
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND turn_id = ?`).get(
      CAMPAIGN_ID,
      admission.turnId,
    )).toEqual({ count: 1 });
    expect(createCampaignPlayReadModel(handle).loadState()).toMatchObject({
      phase: "ready",
      activeTurn: null,
      narration: expect.objectContaining({ turnId: admission.turnId }),
      narrationOperation: expect.objectContaining({
        turnId: admission.turnId,
        status: "complete",
      }),
    });
  });

  it.each([
    ["budget", "stage_budget_exceeded"],
    ["persistence", "persistence_failed"],
  ] as const)(
    "keeps actor replanner %s failure inside the control contract",
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
            object: actorReplanModelObjectFromPrompt(request.prompt),
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
        .find((job) => job.jobId === jobId)).toMatchObject(failure === "budget"
          ? { stage: "deferred", deferReason: "control_budget", workerEpoch: 1 }
          : { stage: "interrupted", workerEpoch: 1 });
      if (failure === "budget") {
        expect(() => createCampaignPlayActorScheduler(handle).validateTurnSettlement(admission.turnId))
          .not.toThrow();
      } else {
        expect(() => createCampaignPlayActorScheduler(handle).validateTurnSettlement(admission.turnId))
          .toThrow("scheduler_job_invalid");
      }
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
      const firstAttemptCalls = failure === "persistence" ? 2 : 1;
      expect(providerCalls).toBe(firstAttemptCalls);
      expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
        .filter((job) => job.workerEpoch > 0).map((job) => job.jobId)).toEqual([jobId]);

      if (failure === "budget") {
        expect(runtime.loadTurn(admission.turnId)).toMatchObject({
          stage: "primary_settled",
          workerLeaseOwner: null,
        });
        expect(providerCalls).toBe(1);
        await advanceUntilStage(runtime, time, admission.turnId, "actors_settled");
        return;
      }

      if (failure === "persistence") {
        handle.sqlite.exec("DROP TRIGGER test_actor_replanner_acceptance_failure");
      }

      time.advance();
      await runtime.runNextStage(admission.turnId);
      expect(providerCalls).toBe(firstAttemptCalls);
      const interruptedTurn = runtime.loadTurn(admission.turnId)!;
      time.advance();
      await runtime.resumeInterruptedStage({
        turnId: admission.turnId,
        interruptedStage: "primary_settled",
        observedEpoch: interruptedTurn.workerEpoch,
      });
      expect(providerCalls).toBe(firstAttemptCalls + 2);
      expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
        .find((job) => job.jobId === jobId)).toMatchObject({
          stage: "claimed",
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
          object: actorReplanModelObjectFromPrompt(request.prompt),
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
          object: actorReplanModelObjectFromPrompt(request.prompt),
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
    expect(providerCalls).toBe(3);
    expect(createCampaignPlayActorScheduler(reopened).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({ stage: "claimed", workerEpoch: 2 });
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
          object: actorReplanModelObjectFromPrompt(request.prompt),
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
    expect(providerCalls).toBe(2);
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
    expect(providerCalls).toBe(4);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({ stage: "claimed", workerEpoch: 2 });
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
          object: actorReplanModelObjectFromPrompt(request.prompt),
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
    expect(providerCalls).toBe(2);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({ stage: "claimed", workerEpoch: 1 });
  });

  it("keeps the Actor Replanner deadline independent from player external stages", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(4_475);
    let observedDeadlineMs: number | null = null;
    const baseReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => ({
        object: actorReplanModelObjectFromPrompt(request.prompt),
        trace: actorReplanTrace(),
      })) as unknown as typeof safeGenerateObject,
    });
    const actorReplanner = {
      interruptExpired: baseReplanner.interruptExpired,
      replan: (request: Parameters<typeof baseReplanner.replan>[0]) => {
        observedDeadlineMs = request.externalOperationDeadlineMs;
        return baseReplanner.replan(request);
      },
    };
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      {
        actorReplanner,
        externalOperationDeadlineMs: 30_000,
        gameMasterOperationDeadlineMs: 45_000,
        actorReplannerOperationDeadlineMs: 90_000,
      },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "independent-actor-deadline"),
      submittedAt: 4_475,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);
    forceFirstActorReplan(handle, time, admission.turnId);

    time.advance();
    await runtime.runNextStage(admission.turnId);
    expect(observedDeadlineMs).toBe(90_000);
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
          object: actorReplanModelObjectFromPrompt(request.prompt),
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
    expect(resumedJob).toMatchObject({ stage: "claimed", workerEpoch: 2 });

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

  it("reopens one accepted first actor plan and executes it once", async () => {
    const fixture = await createReadyCampaignWithOpening();
    let handle = fixture.handle;
    const { state } = fixture;
    const time = fixedClock(5_500);
    let providerCalls = 0;
    const createReplanner = (currentHandle: CampaignPlayDatabaseHandle) =>
      createCampaignPlayActorReplanner(currentHandle, {
        now: time.clock.now,
        generateObject: (async (request: { prompt: string }) => {
          providerCalls += 1;
          return {
          object: actorReplanModelObjectFromPrompt(request.prompt),
        trace: actorReplanTrace(),
          };
        }) as unknown as typeof safeGenerateObject,
      });
    const runtime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorReplanner: createReplanner(handle) },
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

    closeTracked(handle);
    handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    const reopenedRuntime = turnRuntime(
      handle,
      time,
      judgeFixture("deterministic"),
      gameMasterFixture(),
      { actorReplanner: createReplanner(handle), owner: "reopened-replan-worker" },
    );
    time.advance();
    await reopenedRuntime.runNextStage(admission.turnId);

    expect(providerCalls).toBe(2);
    const rows = handle.sqlite.prepare(`SELECT stage_id AS stageId, status, worker_epoch AS workerEpoch
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'
      ORDER BY stage_id`).all(CAMPAIGN_ID, admission.turnId) as Array<{
        stageId: string;
        status: string;
        workerEpoch: number;
      }>;
    expect(rows).toHaveLength(1);
    expect(new Set(rows.map((row) => row.stageId)).size).toBe(1);
    expect(rows.every((row) => row.status === "accepted" && row.workerEpoch === 1)).toBe(true);
    const actorTelemetry = reopenedRuntime.loadTelemetry(admission.turnId).modelAttempts
      .filter((attempt) => attempt.kind === "actor_replanner");
    expect(actorTelemetry).toHaveLength(1);
    expect(new Set(actorTelemetry.map((attempt) => attempt.stageId)).size).toBe(1);
    expect(actorTelemetry.every((attempt) => attempt.costComplete)).toBe(true);
    const jobs = createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId);
    expect(jobs.find((job) => job.jobId === firstJobId)).toMatchObject({
      stage: "settled",
      admittedPlanId: expect.not.stringMatching(/^actor-plan:/),
      planId: expect.stringMatching(/^actor-plan:/),
    });
    const repository = createCampaignPlayTurnRepository(handle);
    expect(repository.loadTurn(admission.turnId)).toMatchObject({ stage: "primary_settled" });
    expect(() => repository.loadAcceptedModelArtifact(admission.turnId, "actor_replanner"))
      .toThrow("owned by individual actor jobs");
  });

  it.each([
    ["after_proposal_persisted", "proposed"],
  ] as const)(
    "recovers a process stop %s from stored actor state without duplicating settlement",
    async (faultPoint, strandedStage) => {
      const { handle, state } = await createReadyCampaignWithOpening();
      const time = fixedClock(4_000);
      const base = createCampaignPlayActorProposalService(handle, { now: time.clock.now });
      let inject = true;
      const actorProposalService: CampaignPlayActorProposalService = {
        deferReplan: (request) => base.deferReplan(request),
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
        ambientContactJudgeFixture(),
        gameMasterFixture(1, false, true),
        { actorProposalService },
      );
      const admission = runtime.admitAction({
        request: admissionRequest(state, `actor-restart-${faultPoint}`),
        submittedAt: 4_000,
      });
      await advanceToPrimarySettlement(runtime, time, admission.turnId);
      time.advance();
      await runtime.runNextStage(admission.turnId);

      let stopped: unknown = null;
      for (let boundary = 0; boundary < 8 && stopped === null; boundary += 1) {
        time.advance();
        try {
          await runtime.runNextStage(admission.turnId);
        } catch (cause) {
          stopped = cause;
        }
      }
      expect(stopped).toEqual(expect.objectContaining({
        message: expect.stringContaining(`process stopped ${faultPoint}`),
      }));
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
      deferReplan: (request) => base.deferReplan(request),
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
      ambientContactJudgeFixture(),
      gameMasterFixture(1, false, true),
      { actorProposalService, owner: "actor-receipt-worker" },
    );
    const admission = runtime.admitAction({
      request: admissionRequest(state, "actor-receipt-restart"),
      submittedAt: 6_000,
    });
    await advanceToPrimarySettlement(runtime, time, admission.turnId);
    time.advance();
    await runtime.runNextStage(admission.turnId);

    let stopped: unknown = null;
    for (let boundary = 0; boundary < 4 && stopped === null; boundary += 1) {
      time.advance();
      try {
        await runtime.runNextStage(admission.turnId);
      } catch (cause) {
        stopped = cause;
      }
    }
    expect(stopped).toEqual(expect.objectContaining({
      message: expect.stringContaining("process stopped after actor receipt"),
    }));
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
