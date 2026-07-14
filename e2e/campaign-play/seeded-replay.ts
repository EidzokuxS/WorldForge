import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LanguageModel } from "ai";
import type {
  CampaignPlayCharacterDraft,
  CampaignPlayNarratorPacket,
} from "@worldforge/shared";

import { closeDb } from "../../backend/src/db/index.js";
import { openCampaignWorldDatabase } from "../../backend/src/campaign-world/world-database.js";
import { createCampaignWorldRepository } from "../../backend/src/campaign-world/world-repository.js";
import {
  advanceBuildToPersistence,
  candidateFixture,
  createMigratedCampaign,
  sourceFixture,
} from "../../backend/src/campaign-world/world-repository.test-support.js";
import { calculateCampaignWorldContentHash } from "../../backend/src/campaign-world/world-snapshot.js";
import {
  openCampaignPlayDatabase,
  type CampaignPlayDatabaseHandle,
} from "../../backend/src/campaign-play/campaign-play-database.js";
import { createCampaignPlayApplication } from "../../backend/src/campaign-play/campaign-play-application.js";
import { createCampaignPlayGameMaster } from "../../backend/src/campaign-play/game-master.js";
import {
  createCampaignPlayJudge,
  type CampaignPlayModelEvidence,
} from "../../backend/src/campaign-play/judge.js";
import {
  createCampaignPlayNarrator,
  type CampaignPlayNarratorModelEvidence,
} from "../../backend/src/campaign-play/narrator.js";
import {
  createCampaignPlayOpeningPlanner,
  deriveCampaignPlayOpeningSceneCandidateId,
  type CampaignPlayOpeningModelEvidence,
  type CampaignPlayOpeningProposal,
} from "../../backend/src/campaign-play/opening-planner.js";
import { createCampaignPlayOpeningRuntime } from "../../backend/src/campaign-play/opening-runtime.js";
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
} from "../../backend/src/campaign-play/campaign-play-projection.js";
import type { CampaignPlayTurnServiceClock } from "../../backend/src/campaign-play/turn-service.js";
import { createCampaignPlayTurnRuntime } from "../../backend/src/campaign-play/turn-runtime.js";
import {
  captureCampaignPlayReplay,
  findUnboundCampaignPlayPublicHandles,
  type CampaignPlayCanonicalReport,
} from "./replay-report.js";

const CAMPAIGN_ID = "d16a0000-0000-4000-8000-000000000001";
const PRICING = {
  known: true,
  currency: "USD",
  tokenUnit: 1_000_000,
  inputCostMicros: 1_000,
  outputCostMicros: 2_000,
  rounding: "ceil",
} as const;

export interface SeededCampaignPlayReplayOptions {
  playerActions: number;
  policy: "intervene" | "peripheral";
  inputControl?: "choice" | "freeform";
  restartAfterPlayerActions?: readonly number[];
}

export interface SeededCampaignPlayReplayResult {
  campaignId: string;
  openingTurns: number;
  completedPlayerActions: number;
  canonicalBytes: string;
  replayHash: string;
  integrity: string;
  foreignKeyViolations: number;
  terminalStages: string[];
  receiptCount: number;
  runtimeEventCount: number;
  turnEventCount: number;
  acceptedSnapshotHash: string;
  openingProjectionHash: string;
  mechanicalHash: string;
  publicStateHash: string;
  pressureStateBytes: string;
  observationCount: number;
  observationChannels: string[];
  unboundObservationHandles: string[];
  restartProjectionMatches: boolean;
  report: SeededCampaignPlayCanonicalReport;
}

export function createSeededAcceptedCampaign(root: string, campaignId: string): void {
  createMigratedCampaign(root, campaignId);
  fs.writeFileSync(
    path.join(root, campaignId, "config.json"),
    JSON.stringify({
      name: "Bell Island Deterministic Replay",
      premise: "A stormbound archipelago faces a failing sea route.",
      createdAt: 1_000,
      updatedAt: 1_000,
    }),
    "utf8",
  );
  const handle = openCampaignWorldDatabase(campaignId);
  try {
    const repository = createCampaignWorldRepository(handle);
    const source = sourceFixture(campaignId);
    repository.acquireBuild({
      buildId: "deterministic-replay-build",
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "fixture",
      model: "world-fixture",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, "deterministic-replay-build");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b"
          ? { ...placement, locationId: "location-a" }
          : placement),
    };
    const review = repository.completeBuild({
      buildId: "deterministic-replay-build",
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
    const observableTrace = suffix === "b"
      ? "Fresh sealing wax and torn binding thread mark a ledger removed in haste."
      : `Fresh tool marks show that work on ${goalId} continued here.`;
    return {
      actorId,
      primaryGoalId: goalId,
      cadenceMinutes: 1_440,
      steps: [{
        intent,
        observableTrace,
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
  responseModel: "fixture-opening-planner",
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
  actualProviderId: "fixture",
  responseModel: "fixture-narrator",
  finishReason: "stop",
  errorCode: null,
  inputTokens: 15,
  outputTokens: 25,
  totalTokens: 40,
  durationMs: 5,
  estimatedCostMicros: 1,
};

function modelEvidence(model: "fixture-judge" | "fixture-game-master"): CampaignPlayModelEvidence {
  return {
    requestedStrategy: "strict_object",
    actualProviderId: "fixture",
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
  };
}

function advancingClock(initial: number): {
  clock: CampaignPlayTurnServiceClock;
  now: () => number;
} {
  let value = initial;
  const now = () => {
    value += 1;
    return value;
  };
  return {
    now,
    clock: {
      now,
      wait: (_delayMilliseconds, signal) => new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    },
  };
}

function openingPlannerFixture() {
  const compiler = createCampaignPlayOpeningPlanner();
  return {
    compile: compiler.compile,
    async plan(request: Parameters<typeof compiler.plan>[0]) {
      return compiler.compile(
        request.frame,
        request.startingConditions,
        openingProposal(),
        openingPlannerEvidence,
      );
    },
  };
}

function openingNarratorFixture() {
  const compiler = createCampaignPlayNarrator();
  return {
    compile: compiler.compile,
    async narrate(request: Parameters<typeof compiler.narrate>[0]) {
      const packet = JSON.parse(request.packetBytes) as CampaignPlayNarratorPacket;
      return compiler.compile({
        narrationId: request.narrationId,
        packet,
        proposal: {
          beats: [
            { purpose: "orientation", text: "Rain rings against the signal tower as Mara reaches Bell Island." },
            { purpose: "consequence", text: "Signal keepers brace the route gate while warning bells gather pace." },
            { purpose: "action_handoff", text: "The open path and the waiting keeper leave a clear choice." },
          ],
          actionDetails: packet.availableIntents.map((intent) => {
            switch (intent.kind) {
              case "observe": return "the warning bells at the gate";
              case "move": return "old signal marks on the posts";
              case "contact": return "the route keeper's warning";
              case "wait": return "listen for the next bell";
              case "attempt": return "test the gate latch";
            }
          }),
        },
        createdAt: request.createdAt,
        modelEvidence: { ...narratorEvidence, responseModel: "fixture-opening-narrator" },
      });
    },
  };
}

function playerNarratorFixture() {
  const compiler = createCampaignPlayNarrator();
  return {
    compile: compiler.compile,
    async narrate(request: Parameters<typeof compiler.narrate>[0]) {
      const packet = JSON.parse(request.packetBytes) as CampaignPlayNarratorPacket;
      return compiler.compile({
        narrationId: request.narrationId,
        packet,
        proposal: {
          beats: [
            {
              purpose: "consequence",
              text: `${packet.actionContext!.submittedText} leaves a visible trace at ${packet.currentLocation.name}.`,
            },
            {
              purpose: "action_handoff",
              text: `The scene at ${packet.currentLocation.name} leaves another move open.`,
            },
          ],
          actionDetails: packet.availableIntents.map((intent) => {
            switch (intent.kind) {
              case "observe": return "the new marks left nearby";
              case "move": return "fresh tracks beyond the scene";
              case "contact": return "the witness's account";
              case "wait": return "watch for another change";
              case "attempt": return "test what changed here";
            }
          }),
        },
        createdAt: request.createdAt,
        modelEvidence: narratorEvidence,
      });
    },
  };
}

function judgeFixture(policy: SeededCampaignPlayReplayOptions["policy"]) {
  const compiler = createCampaignPlayJudge();
  return {
    async judge(request: Parameters<ReturnType<typeof createCampaignPlayJudge>["judge"]>[0]) {
      const frozenChoice = request.input.frozenChoice;
      const movementRouteHandle = frozenChoice?.kind === "move"
        ? frozenChoice.targets.find((target) => target.kind === "route")?.handle ?? null
        : null;
      const intervening = !frozenChoice && policy === "intervene";
      const interventionRouteHandle = intervening
        ? request.frame.visibleFacts.find((fact) => fact.kind === "route")?.handle
        : null;
      if (intervening && !interventionRouteHandle) {
        throw new Error("Deterministic Judge requires one visible route for intervention.");
      }
      const ruling = compiler.compile(request.frame, request.input, {
        kind: frozenChoice?.kind ?? (intervening ? "attempt" : "wait"),
        targets: frozenChoice?.targets ?? (interventionRouteHandle
          ? [{ handle: interventionRouteHandle, kind: "route" as const }]
          : []),
        method: intervening
          ? "Lower the visible signal gate and secure it against unsafe passage"
          : "Wait and watch the visible situation",
        stakes: intervening
          ? "Restrict the visible route until the gate is safe"
          : "Learn what changes at the signal gate",
        movementRouteHandle,
        disposition: "deterministic",
        citedVisibleFactHandles: [request.frame.locationHandle],
        resultBounds: { minimum: "success", maximum: "success" },
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 2 },
        uncertainty: { kind: "none" },
        reason: intervening
          ? "The visible route and its gate can be worked on from the current location."
          : "Waiting is possible from the current visible location.",
        clarificationQuestion: null,
      });
      return {
        ruling,
        rulingHash: hashCampaignPlayProjection(ruling),
        modelEvidence: modelEvidence("fixture-judge"),
      };
    },
  };
}

function gameMasterFixture(policy: SeededCampaignPlayReplayOptions["policy"]) {
  const compiler = createCampaignPlayGameMaster();
  return {
    async plan(request: Parameters<ReturnType<typeof createCampaignPlayGameMaster>["plan"]>[0]) {
      const playerHandle = request.frame.handleBindings.find((binding) =>
        binding.reference.kind === "actor" && binding.reference.id.startsWith("player:"))?.handle;
      if (!playerHandle) throw new Error("Deterministic Game Master requires the player binding.");
      const locationHandle = request.frame.visibleFacts.find((fact) => fact.kind === "location")?.handle;
      if (!locationHandle) throw new Error("Deterministic Game Master requires the current location binding.");
      const routeHandle = request.frame.visibleFacts.find((fact) => fact.kind === "route")?.handle;
      const consequenceEffects = policy === "intervene"
        ? (() => {
            if (!routeHandle) {
              throw new Error("Deterministic Game Master requires one visible route binding.");
            }
            return [{
              kind: "set_route_state" as const,
              routeHandle,
              state: "restricted" as const,
              reason: "Mara lowers and secures the visible signal gate.",
              exposure: {
                mode: "projectable" as const,
                predicates: [{ channel: "direct_perception" as const, anchorHandle: locationHandle }],
              },
            }];
          })()
        : [{
            kind: "record_world_event" as const,
            eventClass: "scene" as const,
            summary: `Mara waits and records the visible signal pattern for ${request.ruling.normalizedIntent.originalText}.`,
            affectedHandles: [playerHandle, locationHandle],
          }];
      const effects = request.ruling.movementRouteHandle === null
        ? consequenceEffects
        : [{ kind: "move_actor" as const }, ...consequenceEffects];
      return {
        ...compiler.compile(
          request.frame,
          request.ruling,
          request.resolution,
          request.uncertaintyAuthority,
          {
            elapsedMinutes: 1,
            effects,
          },
        ),
        modelEvidence: modelEvidence("fixture-game-master"),
      };
    },
  };
}

function openingRuntime(handle: CampaignPlayDatabaseHandle, clock: CampaignPlayTurnServiceClock) {
  return createCampaignPlayOpeningRuntime({
    handle,
    owner: "deterministic-opening-worker",
    leaseDurationMs: 60_000,
    heartbeatIntervalMs: 10_000,
    clock,
    openingPlannerModel: {
      languageModel: {} as LanguageModel,
      requested: {
        providerId: "fixture",
        model: "fixture-opening-planner",
        strategy: "strict_object",
        pricing: PRICING,
      },
      temperature: 0.2,
      maxOutputTokens: 32_768,
    },
    narratorModel: {
      languageModel: {} as LanguageModel,
      requested: {
        providerId: "fixture",
        model: "fixture-opening-narrator",
        strategy: "strict_object",
        pricing: PRICING,
      },
      temperature: 0.3,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 32_768,
      maximumTotalTokens: 33_768,
      maximumCostMicros: 10_000,
    },
    openingPlanner: openingPlannerFixture(),
    narrator: openingNarratorFixture(),
  });
}

function turnRuntime(
  handle: CampaignPlayDatabaseHandle,
  clock: CampaignPlayTurnServiceClock,
  policy: SeededCampaignPlayReplayOptions["policy"],
) {
  const stageModel = (model: string) => ({
    languageModel: {} as LanguageModel,
    requested: {
      providerId: "fixture",
      model,
      strategy: "strict_object" as const,
      pricing: PRICING,
    },
    temperature: 0.2,
    maximumInputTokens: 1_000,
    maximumOutputTokens: 32_768,
    maximumTotalTokens: 33_768,
    maximumCostMicros: 10_000,
  });
  return createCampaignPlayTurnRuntime({
    handle,
    owner: "deterministic-turn-worker",
    leaseDurationMs: 60_000,
    heartbeatIntervalMs: 10_000,
    uncertaintySeedKey: "deterministic-replay-seed-key-with-32-bytes",
    clock,
    judgeModel: stageModel("fixture-judge"),
    gameMasterModel: stageModel("fixture-game-master"),
    actorReplannerModel: stageModel("fixture-actor-replanner"),
    narratorModel: stageModel("fixture-narrator"),
    judge: judgeFixture(policy),
    gameMaster: gameMasterFixture(policy),
    narrator: playerNarratorFixture(),
  });
}

export type SeededCampaignPlayCanonicalReport = CampaignPlayCanonicalReport;

export async function runAcceptedCampaignPlayReplay(
  campaignId: string,
  options: SeededCampaignPlayReplayOptions,
): Promise<SeededCampaignPlayReplayResult> {
  if (!Number.isSafeInteger(options.playerActions) || options.playerActions < 1) {
    throw new Error("Deterministic replay requires a positive player action count.");
  }
  const restartAfter = new Set(options.restartAfterPlayerActions ?? []);
  if ([...restartAfter].some((action) =>
    !Number.isSafeInteger(action) || action < 1 || action >= options.playerActions)) {
    throw new Error("Restart checkpoints must fall between completed player actions.");
  }
  const time = advancingClock(1_300);
  const runtimeFactory = {
    createOpening: (handle: CampaignPlayDatabaseHandle) => openingRuntime(handle, time.clock),
    createTurn: (handle: CampaignPlayDatabaseHandle) => turnRuntime(handle, time.clock, options.policy),
  };
  const createApplication = (owner: string) => createCampaignPlayApplication({
      now: time.now,
      owner,
      uncertaintySeedKey: () => "deterministic-replay-seed-key-with-32-bytes",
      runtimeFactory,
    });
  let application = createApplication("deterministic-replay-application");
  let restartProjectionMatches = true;

  const initial = application.loadState(campaignId);
  application.putPlayer(campaignId, {
    acceptedWorldVersion: initial.acceptedWorldVersion,
    expectedWorldVersion: initial.worldVersion,
    expectedRuntimeRevision: initial.runtimeRevision,
    source: "created",
    character: playerDraft(),
  });
  const beforeOpening = application.loadState(campaignId);
  const opening = application.admitOpening(campaignId, {
    idempotencyKey: "deterministic-opening",
    expectedWorldVersion: beforeOpening.worldVersion,
    expectedRuntimeRevision: beforeOpening.runtimeRevision,
    startingConditions: { mode: "delegate" },
  });
  await application.waitForIdle(campaignId);
  const openingTurn = application.loadTurn(campaignId, opening.turnId);
  if (openingTurn.turn.status !== "completed") {
    throw new Error(`Opening ended in ${openingTurn.turn.status}.`);
  }
  const openingProjectionHash = application.loadState(campaignId).projectionHash;

  for (let actionNumber = 1; actionNumber <= options.playerActions; actionNumber += 1) {
    const state = application.loadState(campaignId);
    if (state.phase !== "ready") {
      throw new Error(`Action ${actionNumber} began in ${state.phase}.`);
    }
    let admission;
    try {
      if (options.inputControl === "choice") {
        const choiceHandle = state.narration?.suggestedActions[0]?.choiceHandle;
        if (!choiceHandle) throw new Error("Deterministic replay has no suggested choice to admit.");
        admission = application.admitTurn(campaignId, {
          idempotencyKey: `deterministic-action-${actionNumber}`,
          expectedWorldVersion: state.worldVersion,
          expectedRuntimeRevision: state.runtimeRevision,
          source: "suggested",
          choiceHandle,
        });
      } else {
        admission = application.admitTurn(campaignId, {
          idempotencyKey: `deterministic-action-${actionNumber}`,
          expectedWorldVersion: state.worldVersion,
          expectedRuntimeRevision: state.runtimeRevision,
          source: "freeform",
          text: options.policy === "intervene"
            ? `I lower the visible signal gate and secure it against unsafe passage ${actionNumber}.`
            : `I remain at the visible edge of the signal gate and watch change ${actionNumber}.`,
        });
      }
    } catch (error) {
      const diagnosticHandle = openCampaignPlayDatabase(campaignId);
      try {
        throw new Error(
          `Action ${actionNumber} admission has unbound public handles: ${findUnboundCampaignPlayPublicHandles(diagnosticHandle).join(", ") || "none"}.`,
          { cause: error },
        );
      } finally {
        diagnosticHandle.close();
      }
    }
    await application.waitForIdle(campaignId);
    const turn = application.loadTurn(campaignId, admission.turnId);
    if (turn.turn.status !== "completed") {
      const diagnosticHandle = openCampaignPlayDatabase(campaignId);
      try {
        const stored = diagnosticHandle.sqlite.prepare(`SELECT stage,
          interrupted_stage AS interruptedStage, error_code AS errorCode
          FROM campaign_play_turns WHERE campaign_id = ? AND id = ?`).get(
            campaignId,
            admission.turnId,
          ) as { stage: string; interruptedStage: string | null; errorCode: string | null };
        throw new Error(
          `Player action ${actionNumber} ended in ${stored.stage}`
          + ` at ${stored.interruptedStage ?? "terminal"}`
          + ` with ${stored.errorCode ?? "no error code"}.`,
        );
      } finally {
        diagnosticHandle.close();
      }
    }
    if (restartAfter.has(actionNumber)) {
      const beforeRestart = application.loadState(campaignId);
      application = createApplication(`deterministic-replay-restart-${actionNumber}`);
      await application.recoverCampaign(campaignId);
      const afterRestart = application.loadState(campaignId);
      if (
        canonicalizeCampaignPlayProjection(beforeRestart)
        !== canonicalizeCampaignPlayProjection(afterRestart)
      ) {
        restartProjectionMatches = false;
      }
    }
  }

  const handle = openCampaignPlayDatabase(campaignId);
  try {
    const captured = captureCampaignPlayReplay(handle);
    const turns = captured.report.tables.turns as Array<{ turn_kind: string; stage: string }>;
    const openingTurns = turns.filter((turn) => turn.turn_kind === "opening").length;
    const playerTurns = turns.filter((turn) => turn.turn_kind === "player_action");
    return {
      campaignId,
      openingTurns,
      completedPlayerActions: playerTurns.filter((turn) => turn.stage === "completed").length,
      canonicalBytes: captured.canonicalBytes,
      replayHash: captured.replayHash,
      integrity: captured.report.integrity,
      foreignKeyViolations: captured.report.foreignKeyViolations,
      terminalStages: turns.map((turn) => turn.stage),
      receiptCount: captured.report.tables.receipts.length,
      runtimeEventCount: captured.report.tables.runtimeEvents.length,
      turnEventCount: captured.report.tables.turnEvents.length,
      acceptedSnapshotHash: captured.report.acceptedSnapshotHash,
      openingProjectionHash,
      mechanicalHash: captured.report.mechanical.hash,
      publicStateHash: captured.report.publicState.hash,
      pressureStateBytes: canonicalizeCampaignPlayProjection(captured.report.tables.pressureStates),
      observationCount: captured.report.tables.observations.length,
      observationChannels: captured.report.tables.observations.map((row) => String(row.channel)),
      unboundObservationHandles: captured.unboundObservationHandles,
      restartProjectionMatches,
      report: captured.report,
    };
  } finally {
    handle.close();
  }
}

export async function runSeededCampaignPlayReplay(
  options: SeededCampaignPlayReplayOptions,
): Promise<SeededCampaignPlayReplayResult> {
  const previousRoot = process.env.GSD_CAMPAIGNS_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-seeded-replay-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
  try {
    createSeededAcceptedCampaign(root, CAMPAIGN_ID);
    return await runAcceptedCampaignPlayReplay(CAMPAIGN_ID, options);
  } finally {
    closeDb();
    if (previousRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
    else process.env.GSD_CAMPAIGNS_ROOT = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
}
