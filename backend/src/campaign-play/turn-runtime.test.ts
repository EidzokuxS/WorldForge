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
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
} from "./campaign-play-projection.js";
import { createCampaignPlayReadModel } from "./campaign-play-read-model.js";
import { createCampaignPlayNarrationOperationRepository } from "./narration-operation-repository.js";
import {
  CampaignPlayApplicationError,
  createCampaignPlayApplication,
} from "./campaign-play-application.js";
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

function narratorActionSelections(packet: CampaignPlayNarratorPacket, includeWait = false) {
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
  return selectedIndexes.map((intentIndex) => ({
    intentIndex,
    detail: packet.availableIntents[intentIndex]?.kind === "move"
      ? null
      : packet.availableIntents[intentIndex]?.kind === "wait"
        ? null
        : "the immediate situation",
  }));
}

function openingNarratorFixture(includeWait = false) {
  const compiler = createCampaignPlayNarrator();
  return {
    compile: compiler.compile,
    narrate: vi.fn(async (request: Parameters<typeof compiler.narrate>[0]) => {
      const packet = JSON.parse(request.packetBytes) as CampaignPlayNarratorPacket;
      return compiler.compile({
        narrationId: request.narrationId,
        packet,
        proposal: {
          actionSelections: narratorActionSelections(packet, includeWait),
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
          actionSelections: narratorActionSelections(packet),
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
  options: { includeWait?: boolean } = {},
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
    narrator: openingNarratorFixture(options.includeWait),
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
  expect(opening.loadTurn(admitted.turnId)).toMatchObject({ stage: "completed" });
  return {
    handle,
    state: createCampaignPlayStateRepository(handle).loadState()!,
    openingTurnId: admitted.turnId,
  };
}

type Disposition = "deterministic" | "uncertain" | "impossible" | "clarification_required";

function judgeFixture(disposition: Disposition, compoundDestinationName: string | null = null) {
  const compiler = createCampaignPlayJudge();
  let selectedChoice: {
    kind: "observe" | "move" | "contact" | "wait" | "attempt";
    targets: Array<{ handle: string; kind: "actor" | "location" | "route" | "pressure" | "possession" }>;
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
      const route = request.frame.visibleFacts.find((fact) =>
        fact.kind === "route" && (
          compoundDestinationName === null || fact.summary.startsWith(`${compoundDestinationName};`)
        ));
      const destination = request.frame.visibleFacts.find((fact) =>
        fact.kind === "location" && fact.handle !== request.frame.locationHandle && (
          compoundDestinationName === null || fact.summary === compoundDestinationName
        ));
      const useChoice = choice !== null && choice !== undefined;
      const useCompoundMovement = !useChoice && compoundDestinationName !== null
        && route !== undefined && destination !== undefined;
      const noEffect = disposition === "impossible" || disposition === "clarification_required";
      const movementRouteHandle = useChoice && selectedChoice!.kind === "move"
        ? selectedChoice!.targets.find((candidate) => candidate.kind === "route")?.handle ?? null
        : useCompoundMovement ? route.handle : null;
      const movementRoute = movementRouteHandle === null
        ? null
        : request.frame.visibleRoutes.find((candidate) => candidate.handle === movementRouteHandle) ?? null;
      const ruling = compiler.compile(request.frame, request.input, {
        kind: useChoice ? selectedChoice!.kind : useCompoundMovement || target ? "contact" : "wait",
        targets: useChoice
          ? selectedChoice!.targets
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
        citedVisibleFactHandles: [request.frame.locationHandle],
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
      return { ruling, rulingHash: "f".repeat(64), modelEvidence: acceptedEvidence("test-judge") };
    }),
  };
}

function gameMasterFixture(
  worldEventCount = 1,
  includeSubmittedText = false,
  actorlessResult = false,
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
                routeAccessClaims: [],
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
        modelEvidence: acceptedEvidence("test-game-master"),
      };
    }),
  };
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
                routeAccessClaims: [],
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
) {
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
    actorReplanner,
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
  it("routes the exact current rendered wait directly to Game Master and keeps same-text freeform on Judge", async () => {
    const { handle, state } = await createReadyCampaignWithOpening(10_000, { includeWait: true });
    const time = fixedClock(1_930);
    const judge = judgeFixture("deterministic");
    const gameMaster = gameMasterFixture();
    const narrator = playerNarratorFixture();
    const runtime = turnRuntime(handle, time, judge, gameMaster, { narrator });
    const wait = renderedWaitSuggestion(handle);
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
    let calls = 0;
    const gameMaster = {
      plan: vi.fn(async (request: Parameters<typeof successful.plan>[0]) => {
        calls += 1;
        if (calls === 1) throw new CampaignPlayGameMasterError("stage_timeout", null);
        return successful.plan(request);
      }),
    };
    const runtime = turnRuntime(handle, time, judge, gameMaster);
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
    await advanceUntilStage(runtime, time, admission.turnId, "completed");
    expect(countForTurn(handle, "campaign_play_turn_results", admission.turnId)).toBe(1);
    expect(countForTurn(handle, "campaign_play_receipts", admission.turnId)).toBeGreaterThan(0);
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
      gameMasterFixture(),
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
    expect(providerCalls).toBe(3);
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

  it("renews the same worker epoch while an explicit actor resume waits on the model", async () => {
    const { handle, state } = await createReadyCampaignWithOpening();
    const time = fixedClock(3_800);
    const originalWait = time.clock.wait;
    let heartbeatArmed = false;
    let resolveHeartbeat!: () => void;
    const heartbeatObserved = new Promise<void>((resolve) => {
      resolveHeartbeat = resolve;
    });
    time.clock.wait = async (delayMs, signal) => {
      if (!heartbeatArmed) return originalWait(delayMs, signal);
      heartbeatArmed = false;
      time.advanceBy(delayMs);
      resolveHeartbeat();
    };
    let providerCalls = 0;
    const actorReplanner = createCampaignPlayActorReplanner(handle, {
      now: time.clock.now,
      generateObject: (async (request: { prompt: string }) => {
        providerCalls += 1;
        if (providerCalls === 1) throw new Error("provider transport interrupted");
        if (providerCalls === 2) await heartbeatObserved;
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
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({
        stage: "interrupted",
        workerEpoch: 1,
      });

    heartbeatArmed = true;
    time.advance();
    await runtime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "primary_settled",
      observedEpoch: interruptedTurn.workerEpoch,
    });

    expect(providerCalls).toBe(3);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
      .find((job) => job.jobId === jobId)).toMatchObject({
        stage: "claimed",
        workerEpoch: 2,
      });
    expect(handle.sqlite.prepare(`SELECT count(*) AS value
      FROM campaign_play_runtime_events
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'worker_lease_renewed'
        AND worker_epoch = ?`).get(
          CAMPAIGN_ID,
          admission.turnId,
          interruptedTurn.workerEpoch + 1,
        )).toEqual({ value: 1 });
    expect(handle.sqlite.prepare(`SELECT status, worker_epoch AS workerEpoch
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'
      ORDER BY attempt`).all(CAMPAIGN_ID, admission.turnId)).toEqual([
      { status: "interrupted", workerEpoch: 1 },
      { status: "accepted", workerEpoch: 2 },
    ]);
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

  it.each([
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
      const firstAttemptCalls = failure === "persistence" ? 2 : 1;
      expect(providerCalls).toBe(firstAttemptCalls);
      expect(createCampaignPlayActorScheduler(handle).listTurnJobs(admission.turnId)
        .filter((job) => job.workerEpoch > 0).map((job) => job.jobId)).toEqual([jobId]);

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
        judgeFixture("deterministic"),
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
      judgeFixture("deterministic"),
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
