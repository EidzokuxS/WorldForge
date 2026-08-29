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
import {
  createCampaignPlayStateRepository,
  loadCampaignPlayRulebookFrame,
} from "./campaign-play-state-repository.js";
import { createCampaignPlayCharacterService } from "./character-service.js";
import { bootstrapCampaignPlayPlayer } from "./player-bootstrap.js";
import {
  createCampaignPlayOpeningPlanner,
  deriveCampaignPlayOpeningSceneCandidateId,
  type CampaignPlayOpeningModelEvidence,
  type CampaignPlayOpeningProposal,
} from "./opening-planner.js";
import {
  CAMPAIGN_PLAY_OPENING_NARRATOR_MAX_OUTPUT_TOKENS,
  CampaignPlayNarratorError,
  createCampaignPlayNarrator,
  type CampaignPlayNarratorModelEvidence,
  type CampaignPlayNarratorRecoveryFeedback,
} from "./narrator.js";
import { buildCampaignPlayOpeningOptions } from "./opening-options.js";
import { deriveCampaignPlayPublicHandle } from "./campaign-play-projection.js";
import { createCampaignPlayOpeningRuntime } from "./opening-runtime.js";
import { createCampaignPlayActorScheduler } from "./actor-scheduler.js";
import { createCampaignPlayVisibilityService } from "./visibility-service.js";
import type { CampaignPlayTurnServiceClock } from "./turn-service.js";
import {
  deriveCampaignPlayCommandId,
  executeCampaignPlayRulebookBatch,
  preflightCampaignPlayRulebook,
  type CampaignPlayRulebookFrame,
} from "./rulebook.js";

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
    drives: ["Understand the celestial signal", "Protect vulnerable witnesses"],
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
          ? { ...placement, locationId: "location-a-office" }
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

function openingProposal(
  decision: NonNullable<CampaignPlayOpeningProposal["decision"]> | null = null,
): CampaignPlayOpeningProposal {
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
    decision,
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function count(handle: CampaignPlayDatabaseHandle, table: string): number {
  return (handle.sqlite.prepare(`SELECT count(*) AS value FROM ${table}
    WHERE campaign_id = ?`).get(CAMPAIGN_ID) as { value: number }).value;
}

async function runOpeningUntil(
  runtime: ReturnType<typeof createCampaignPlayOpeningRuntime>,
  time: ReturnType<typeof fixedClock>,
  turnId: string,
  predicate: (turn: NonNullable<ReturnType<typeof runtime.loadTurn>>) => boolean,
): Promise<void> {
  for (let step = 0; step < 16; step += 1) {
    const turn = runtime.loadTurn(turnId);
    if (turn && predicate(turn)) return;
    time.advance();
    await runtime.runNextStage(turnId);
  }
  throw new Error("Opening runtime did not reach the expected durable state.");
}

function plannerFixture(
  modelEvidence: CampaignPlayOpeningModelEvidence = plannerEvidence,
  decision: NonNullable<CampaignPlayOpeningProposal["decision"]> | null = null,
) {
  const compiler = createCampaignPlayOpeningPlanner();
  return {
    compile: compiler.compile,
    plan: vi.fn(async (request: Parameters<typeof compiler.plan>[0]) => {
      const proposal = openingProposal(decision);
      if (request.startingConditions.mode === "chosen") {
        proposal.start = {
          role: request.startingConditions.role,
          arrivalMode: request.startingConditions.arrivalMode,
          immediateSituation: request.startingConditions.immediateSituation,
        };
        if (request.startingConditions.macroLocationId === "region-a") {
          proposal.scene = {
            candidateId: deriveCampaignPlayOpeningSceneCandidateId({
              sceneLocationId: "location-a",
              openingActorId: "actor-b",
              supportActorId: "actor-b",
              pressureId: "pressure-a",
              routeId: "route-a",
            }),
          };
        }
      }
      return compiler.compile(
        request.frame,
        request.startingConditions,
        proposal,
        modelEvidence,
      );
    }),
  };
}

function prepareDecisionResolution(
  frame: CampaignPlayRulebookFrame,
  turnId: string,
  batchId: string,
  disposition: "accept" | "decline",
  overrides: {
    actorId?: string;
    source?: { kind: "system"; system: "game_master" | "opening_bootstrap" };
  } = {},
) {
  const decision = frame.pendingDecisions?.[0];
  if (!decision || !frame.human) throw new Error("Decision fixture is missing a pending decision.");
  const actorId = overrides.actorId ?? decision.actorId;
  const source = overrides.source ?? { kind: "system" as const, system: "game_master" as const };
  const rootParent = { kind: "turn" as const, turnId };
  const command = {
    commandId: deriveCampaignPlayCommandId(frame.campaignId, turnId, batchId, 0),
    batchId,
    order: 0,
    kind: "decision_resolve" as const,
    causalParent: rootParent,
    source,
    expectedWorldVersion: frame.worldVersion,
    readScope: [
      { kind: "actor" as const, id: actorId },
      { kind: "decision" as const, id: decision.decisionKey },
    ],
    writeScope: [{ kind: "decision" as const, id: decision.decisionKey }],
    exposure: { mode: "protected" as const },
    decisionKey: decision.decisionKey,
    actorId,
    actorHandle: decision.actorHandle,
    decisionKind: decision.kind,
    sourceTurnId: decision.sourceTurnId,
    summary: decision.summary,
    selectedLabel: disposition === "accept" ? decision.acceptLabel : decision.declineLabel,
    disposition,
  };
  const preflight = preflightCampaignPlayRulebook({
    frame,
    authority: {
      purpose: "player_action",
      turnId,
      actorId: frame.human.actorId,
      rootParent,
      authorizedRefs: [
        { kind: "actor", id: frame.human.actorId },
        ...frame.acceptedWorld.actors.map((actor) => ({ kind: "actor" as const, id: actor.id })),
        { kind: "decision", id: decision.decisionKey },
      ],
      witnessActorIds: [],
      knownWorldEventIds: [],
    },
    batch: {
      batchId,
      baseWorldVersion: frame.worldVersion,
      commands: [command],
    },
  });
  return { command, preflight };
}

async function completeDecisionOpening(
  decision: NonNullable<CampaignPlayOpeningProposal["decision"]>,
) {
  const { handle, state } = createPlayableCampaign();
  const planner = plannerFixture(plannerEvidence, decision);
  const time = fixedClock(1_500);
  const runtime = createCampaignPlayOpeningRuntime({
    handle,
    owner: "opening-decision-worker",
    leaseDurationMs: 1_000,
    heartbeatIntervalMs: 100,
    clock: time.clock,
    ...runtimeModels(),
    openingPlanner: planner,
    narrator: narratorFixture(),
  });
  const admission = runtime.admitOpening({
    submittedAt: 1_500,
    request: {
      idempotencyKey: "opening-decision",
      expectedWorldVersion: state.authority.worldVersion,
      expectedRuntimeRevision: state.authority.runtimeRevision,
      startingConditions: { mode: "delegate" },
    },
  });
  await runOpeningUntil(runtime, time, admission.turnId, (turn) => turn.stage === "completed");
  return {
    handle,
    state,
    runtime,
    admission,
    frame: loadCampaignPlayRulebookFrame(handle),
  };
}

function narratorActionSelections(packet: CampaignPlayNarratorPacket) {
  const latestVisiblePerformer = [...packet.consequences].reverse().find((consequence) =>
    consequence.performingActorHandle !== null && packet.visibleActors.some((actor) =>
      actor.handle === consequence.performingActorHandle))?.performingActorHandle ?? null;
  const requiredReplyIndex = latestVisiblePerformer === null
    ? -1
    : packet.availableIntents.findIndex((intent) => intent.kind === "contact"
      && intent.decisionBinding === undefined
      && intent.targets.some((target) => target.kind === "actor"
        && target.handle === latestVisiblePerformer));
  const expectedActionCount = Math.min(
    CAMPAIGN_PLAY_LIMITS.suggestedActions,
    packet.availableIntents.length,
  );
  const mandatoryDecisionIndexes = packet.availableIntents
    .map((intent, intentIndex) => ({ intent, intentIndex }))
    .filter((entry) => entry.intent.decisionBinding !== undefined)
    .sort((left, right) => {
      const leftBinding = left.intent.decisionBinding!;
      const rightBinding = right.intent.decisionBinding!;
      return leftBinding.decisionKey.localeCompare(rightBinding.decisionKey)
        || (leftBinding.disposition === "accept" ? -1 : 1)
          - (rightBinding.disposition === "accept" ? -1 : 1);
    })
    .map((entry) => entry.intentIndex);
  const indexes = packet.availableIntents.map((_intent, intentIndex) => intentIndex);
  const requiredReplyIndexes = requiredReplyIndex < 0 ||
    mandatoryDecisionIndexes.includes(requiredReplyIndex)
    ? []
    : [requiredReplyIndex];
  const orderedIndexes = [
    ...mandatoryDecisionIndexes,
    ...requiredReplyIndexes,
    ...indexes.filter((intentIndex) =>
      !mandatoryDecisionIndexes.includes(intentIndex) &&
      !requiredReplyIndexes.includes(intentIndex)),
  ];
  return orderedIndexes.slice(0, expectedActionCount).map((intentIndex) => ({
    intentIndex,
    detail: intentIndex === requiredReplyIndex ? "the immediate situation" : null,
  }));
}

function narratorFixture(modelEvidence: CampaignPlayNarratorModelEvidence = narratorEvidence) {
  const compiler = createCampaignPlayNarrator();
  return {
    compile: compiler.compile,
    narrate: vi.fn(async (request: Parameters<typeof compiler.narrate>[0]) => {
      const packet = JSON.parse(request.packetBytes) as CampaignPlayNarratorPacket;
      const openingDecision = packet.openingContext?.decision ?? null;
      const decisionObservationIndex = openingDecision === null
        ? null
        : packet.newObservations.findIndex((entry) => {
          const marker = entry.decision;
          return marker !== undefined
            && marker.decisionKey === openingDecision.decisionKey
            && marker.actorName === openingDecision.actorName
            && marker.actorHandle === openingDecision.actorHandle
            && marker.kind === openingDecision.kind
            && marker.summary === openingDecision.summary
            && marker.acceptLabel === openingDecision.acceptLabel
            && marker.declineLabel === openingDecision.declineLabel;
        });
      const orientationObservationIndexes = decisionObservationIndex !== null
        && decisionObservationIndex >= 0
        ? [decisionObservationIndex]
        : [];
      const consequenceObservationIndexes = packet.newObservations
        .map((_entry, index) => index)
        .filter((index) => !orientationObservationIndexes.includes(index));
      const orientationText = openingDecision === null
        ? "Rain rings against the signal tower as Mara reaches Bell Island."
        : `${openingDecision.actorName} presents a choice: ${openingDecision.summary}`;
      return compiler.compile({
        narrationId: request.narrationId,
        packet,
        proposal: {
          actionSelections: narratorActionSelections(packet),
          beats: [
            { purpose: "orientation", observationIndexes: orientationObservationIndexes, text: orientationText },
            { purpose: "consequence", observationIndexes: consequenceObservationIndexes, text: "Ahead, signal keepers brace the route gate while warning bells gather pace." },
            { purpose: "action_handoff", observationIndexes: [], text: "The open path and the waiting keeper leave a clear choice." },
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
  const decisionFixture = {
    actor: "openingActor" as const,
    kind: "offer" as const,
    summary: "The signal keeper offers a sealed route map for the next crossing.",
    acceptLabel: "Take the map",
    declineLabel: "Leave it sealed",
  };

  it("compiles a structured opening decision and persists one open decision at settlement", async () => {
    const { handle, admission, frame } = await completeDecisionOpening(decisionFixture);

    expect(frame.pendingDecisions).toHaveLength(1);
    const decision = frame.pendingDecisions![0]!;
    expect(decision).toMatchObject({
      actorId: "actor-c",
      kind: "offer",
      status: "open",
      sourceTurnId: admission.turnId,
      summary: decisionFixture.summary,
      acceptLabel: decisionFixture.acceptLabel,
      declineLabel: decisionFixture.declineLabel,
      resolutionEventId: null,
      resolutionTurnId: null,
      resolutionDisposition: null,
    });
    expect(handle.sqlite.prepare(`SELECT decision_key AS decisionKey, status,
        source_turn_id AS sourceTurnId, resolution_event_id AS resolutionEventId,
        resolution_turn_id AS resolutionTurnId
      FROM campaign_play_decisions WHERE campaign_id = ?`).all(CAMPAIGN_ID)).toEqual([{
      decisionKey: decision.decisionKey,
      status: "open",
      sourceTurnId: admission.turnId,
      resolutionEventId: null,
      resolutionTurnId: null,
    }]);
    expect(handle.sqlite.prepare(`SELECT event_kind AS eventKind, command_kind AS commandKind
      FROM campaign_play_events e
      JOIN campaign_play_commands c ON c.command_id = e.command_id
      WHERE e.campaign_id = ? AND c.turn_id = ? AND c.command_kind = 'decision_open'`
    ).all(CAMPAIGN_ID, admission.turnId)).toEqual([
      { eventKind: "decision_opened", commandKind: "decision_open" },
    ]);
  });

  it("persists an explicit custody effect with the opening decision and public packet", async () => {
    const decision = {
      ...decisionFixture,
      acceptEffect: {
        kind: "grant_player_possession" as const,
        name: "Sealed route map",
      },
    };
    const { handle, frame } = await completeDecisionOpening(decision);
    const pending = frame.pendingDecisions?.[0];
    expect(pending?.acceptEffect).toEqual(decision.acceptEffect);
    expect(handle.sqlite.prepare(`
      SELECT accept_effect_json AS acceptEffectJson
      FROM campaign_play_decisions WHERE campaign_id = ?
    `).get(CAMPAIGN_ID)).toEqual({
      acceptEffectJson: JSON.stringify(decision.acceptEffect),
    });

    const narration = handle.sqlite.prepare(`
      SELECT packet_json AS packetJson
      FROM campaign_play_narrations
      WHERE campaign_id = ? AND status = 'complete'
      ORDER BY completed_at DESC LIMIT 1
    `).get(CAMPAIGN_ID) as { packetJson: string };
    const packet = JSON.parse(narration.packetJson) as CampaignPlayNarratorPacket;
    expect(packet.openingContext?.decision?.acceptEffect).toEqual(decision.acceptEffect);
    expect(packet.newObservations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decision: expect.objectContaining({ acceptEffect: decision.acceptEffect }),
      }),
    ]));
  });

  it("accepts a pending decision once and retains its accepted receipt and event after reload", async () => {
    const { handle, admission, frame } = await completeDecisionOpening(decisionFixture);
    const repository = createCampaignPlayStateRepository(handle);
    const prepared = prepareDecisionResolution(
      frame,
      admission.turnId,
      "batch-decision-accept",
      "accept",
    );
    const acceptedPreflight = prepared.preflight;
    if (!acceptedPreflight.accepted) {
      throw new Error(`Decision accept preflight failed: ${acceptedPreflight.denial.code}`);
    }
    let execution: ReturnType<typeof executeCampaignPlayRulebookBatch> | null = null;
    repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "runtime-decision-accept",
        turnId: admission.turnId,
        kind: "turn_completed",
        workerEpoch: 1,
        protectedPayloadHash: "d".repeat(64),
        createdAt: 2_000,
      },
      mutate(context) {
        execution = executeCampaignPlayRulebookBatch({
          frame,
          accepted: acceptedPreflight,
          context,
          turnId: admission.turnId,
          createdAt: 2_000,
        });
      },
    });
    expect(execution).not.toBeNull();
    const result = execution!;
    const row = handle.sqlite.prepare(`SELECT status,
        resolution_turn_id AS resolutionTurnId, resolution_event_id AS resolutionEventId
      FROM campaign_play_decisions WHERE campaign_id = ?`).get(CAMPAIGN_ID);
    expect(row).toEqual({
      status: "accepted",
      resolutionTurnId: admission.turnId,
      resolutionEventId: result.eventIds[0],
    });
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM campaign_play_receipts WHERE command_id = ?) AS receipts,
      (SELECT count(*) FROM campaign_play_events
        WHERE command_id = ? AND event_kind = 'decision_accepted') AS acceptedEvents,
      (SELECT count(*) FROM campaign_play_events
        WHERE command_id = ? AND event_kind = 'decision_declined') AS declinedEvents`
    ).get(prepared.command.commandId, prepared.command.commandId, prepared.command.commandId))
      .toEqual({ receipts: 1, acceptedEvents: 1, declinedEvents: 0 });

    const reloadedFrame = loadCampaignPlayRulebookFrame(handle);
    expect(reloadedFrame.pendingDecisions).toMatchObject([{
      decisionKey: frame.pendingDecisions![0]!.decisionKey,
      status: "accepted",
      resolutionTurnId: admission.turnId,
      resolutionEventId: result.eventIds[0],
      resolutionDisposition: "accept",
    }]);

    const duplicate = prepareDecisionResolution(
      reloadedFrame,
      admission.turnId,
      "batch-decision-accept-duplicate",
      "accept",
    );
    expect(duplicate.preflight).toMatchObject({
      accepted: false,
      denial: { code: "precondition_failed" },
    });
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM campaign_play_receipts WHERE command_kind = 'decision_resolve') AS receipts,
      (SELECT count(*) FROM campaign_play_events
        WHERE event_kind IN ('decision_accepted', 'decision_declined')) AS events`
    ).get()).toEqual({ receipts: 1, events: 1 });
  });

  it("declines an isolated pending decision once without producing an accepted event", async () => {
    const { handle, admission, frame } = await completeDecisionOpening(decisionFixture);
    const repository = createCampaignPlayStateRepository(handle);
    const prepared = prepareDecisionResolution(
      frame,
      admission.turnId,
      "batch-decision-decline",
      "decline",
    );
    const declinedPreflight = prepared.preflight;
    if (!declinedPreflight.accepted) {
      throw new Error(`Decision decline preflight failed: ${declinedPreflight.denial.code}`);
    }
    let execution: ReturnType<typeof executeCampaignPlayRulebookBatch> | null = null;
    repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "runtime-decision-decline",
        turnId: admission.turnId,
        kind: "turn_completed",
        workerEpoch: 1,
        protectedPayloadHash: "e".repeat(64),
        createdAt: 2_100,
      },
      mutate(context) {
        execution = executeCampaignPlayRulebookBatch({
          frame,
          accepted: declinedPreflight,
          context,
          turnId: admission.turnId,
          createdAt: 2_100,
        });
      },
    });
    const result = execution!;
    expect(handle.sqlite.prepare(`SELECT status,
        resolution_turn_id AS resolutionTurnId, resolution_event_id AS resolutionEventId
      FROM campaign_play_decisions WHERE campaign_id = ?`).get(CAMPAIGN_ID)).toEqual({
      status: "declined",
      resolutionTurnId: admission.turnId,
      resolutionEventId: result.eventIds[0],
    });
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM campaign_play_receipts WHERE command_id = ?) AS receipts,
      (SELECT count(*) FROM campaign_play_events
        WHERE command_id = ? AND event_kind = 'decision_declined') AS declinedEvents,
      (SELECT count(*) FROM campaign_play_events
        WHERE command_id = ? AND event_kind = 'decision_accepted') AS acceptedEvents`
    ).get(prepared.command.commandId, prepared.command.commandId, prepared.command.commandId))
      .toEqual({ receipts: 1, declinedEvents: 1, acceptedEvents: 0 });
    expect(loadCampaignPlayRulebookFrame(handle).pendingDecisions).toMatchObject([{
      status: "declined",
      resolutionDisposition: "decline",
      resolutionEventId: result.eventIds[0],
      resolutionTurnId: admission.turnId,
    }]);
  });

  it("rejects forged decision actor and source before any resolution mutation", async () => {
    const { handle, admission, frame } = await completeDecisionOpening(decisionFixture);
    const invalidActor = prepareDecisionResolution(
      frame,
      admission.turnId,
      "batch-decision-invalid-actor",
      "accept",
      { actorId: "actor-b" },
    );
    expect(invalidActor.preflight).toMatchObject({
      accepted: false,
      denial: { code: "precondition_failed" },
    });
    const invalidSource = prepareDecisionResolution(
      frame,
      admission.turnId,
      "batch-decision-invalid-source",
      "accept",
      { source: { kind: "system", system: "opening_bootstrap" } },
    );
    expect(invalidSource.preflight).toMatchObject({
      accepted: false,
      denial: { code: "invalid_source" },
    });
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM campaign_play_decisions WHERE status = 'open') AS openDecisions,
      (SELECT count(*) FROM campaign_play_receipts WHERE command_kind = 'decision_resolve') AS receipts,
      (SELECT count(*) FROM campaign_play_events
        WHERE event_kind IN ('decision_accepted', 'decision_declined')) AS events`
    ).get()).toEqual({ openDecisions: 1, receipts: 0, events: 0 });
  });

  it("bounds the opening provider, fences its late result, and resumes only in a fresh epoch", async () => {
    const { handle, state } = createPlayableCampaign();
    const before = createCampaignPlayStateRepository(handle).loadState()!;
    const commandsBefore = count(handle, "campaign_play_commands");
    const actorPlansBefore = count(handle, "campaign_play_actor_plans");
    const basePlanner = plannerFixture();
    const late = deferred<Awaited<ReturnType<typeof basePlanner.plan>>>();
    const deadline = deferred<void>();
    let now = 5_000;
    let deadlineCalls = 0;
    const provider: {
      request: Parameters<typeof basePlanner.plan>[0] | null;
      signal: AbortSignal | null;
    } = { request: null, signal: null };
    const clock: CampaignPlayTurnServiceClock = {
      now: () => now,
      wait(delayMs, signal) {
        if (delayMs === 40 && deadlineCalls++ === 0) return deadline.promise;
        return new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      },
    };
    let calls = 0;
    const planner = {
      compile: basePlanner.compile,
      plan: vi.fn(async (request: Parameters<typeof basePlanner.plan>[0]) => {
        calls += 1;
        if (calls > 1) return basePlanner.plan(request);
        provider.request = request;
        provider.signal = request.signal ?? null;
        return late.promise;
      }),
    };
    const runtime = createCampaignPlayOpeningRuntime({
      handle,
      owner: "opening-timeout-worker",
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 10,
      externalOperationDeadlineMs: 40,
      clock,
      ...runtimeModels(),
      openingPlanner: planner,
      narrator: narratorFixture(),
    });
    const admission = runtime.admitOpening({
      submittedAt: now,
      request: {
        idempotencyKey: "opening-provider-timeout",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
    });

    const running = runtime.runNextStage(admission.turnId);
    while (provider.signal === null) await Promise.resolve();
    now = 5_040;
    deadline.resolve();
    const interrupted = await running;

    expect(provider.signal?.aborted).toBe(true);
    expect(interrupted.turn).toMatchObject({
      stage: "interrupted",
      interruptedStage: "admitted",
      errorCode: "stage_timeout",
      resumeEligible: true,
      workerLeaseOwner: null,
    });
    expect(interrupted.telemetry).toMatchObject({ stageTimeMs: 40, outcome: "interrupted" });
    expect(handle.sqlite.prepare(`SELECT status, error_code AS errorCode,
        worker_epoch AS workerEpoch, completed_at AS completedAt, duration_ms AS durationMs
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'opening_planner' AND attempt = 1`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({
        status: "interrupted",
        errorCode: "stage_timeout",
        workerEpoch: 1,
        completedAt: 5_040,
        durationMs: 40,
      });
    const afterTimeout = createCampaignPlayStateRepository(handle).loadState()!;
    expect(afterTimeout.authority).toMatchObject({
      setupPhase: before.authority.setupPhase,
      worldVersion: before.authority.worldVersion,
      worldHash: before.authority.worldHash,
      worldTimeMinutes: before.authority.worldTimeMinutes,
      openedAt: before.authority.openedAt,
    });
    expect(afterTimeout.acceptedReview).toEqual(before.acceptedReview);
    expect(count(handle, "campaign_play_commands")).toBe(commandsBefore);
    expect(count(handle, "campaign_play_actor_plans")).toBe(actorPlansBefore);

    late.resolve(await basePlanner.plan(provider.request!));
    await Promise.resolve();
    await Promise.resolve();
    expect(handle.sqlite.prepare(`SELECT status FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'opening_planner' AND attempt = 1`).get(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual({ status: "interrupted" });
    expect(count(handle, "campaign_play_commands")).toBe(commandsBefore);
    expect(count(handle, "campaign_play_actor_plans")).toBe(actorPlansBefore);

    now = 5_060;
    const resumed = await runtime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: "admitted",
      observedEpoch: interrupted.turn.workerEpoch,
    });
    expect(resumed.turn).toMatchObject({ stage: "planned", workerEpoch: 2 });
    expect(planner.plan).toHaveBeenCalledTimes(2);
    expect(handle.sqlite.prepare(`SELECT attempt, status, worker_epoch AS workerEpoch
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'opening_planner'
      ORDER BY attempt`).all(CAMPAIGN_ID, admission.turnId)).toEqual([
        { attempt: 1, status: "interrupted", workerEpoch: 1 },
        { attempt: 2, status: "accepted", workerEpoch: 2 },
      ]);
  });

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
        state.eligibility.projection.startingMacroLocationId!,
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
      await runOpeningUntil(
        runtime,
        time,
        admission.turnId,
        (turn) => turn.stage === "completed",
      );

      const completed = runtime.loadTurn(admission.turnId)!;
      const finalState = createCampaignPlayStateRepository(handle).loadState()!;
      expect(loadCampaignPlayRulebookFrame(handle).pendingDecisions).toEqual([]);
      expect(completed.stage).toBe("completed");
      expect(completed.workerLeaseOwner).toBeNull();
      expect(finalState.authority).toMatchObject({ setupPhase: "ready" });
      expect(finalState.authority.openedAt).not.toBeNull();
      expect(planner.plan).toHaveBeenCalledTimes(1);
      expect(planner.plan.mock.calls[0]![0].frame.player.motivations).toEqual([
        "Understand the celestial signal",
        "Protect vulnerable witnesses",
      ]);
      expect(narrator.narrate).toHaveBeenCalledTimes(1);
      expect(finalState.authority.worldVersion).toBe(
        state.authority.worldVersion + 2 + finalState.acceptedReview.pressures.length,
      );
      expect(count(handle, "campaign_play_actor_plans")).toBe(0);
      expect(count(handle, "campaign_play_actor_schedules")).toBe(6);
      expect(count(handle, "campaign_play_actor_jobs")).toBe(0);
      expect(count(handle, "campaign_play_actor_proposals")).toBe(0);
      expect(handle.sqlite.prepare(`SELECT actor_id AS actorId, stage
        FROM campaign_play_actor_jobs WHERE campaign_id = ? AND turn_id = ?
        ORDER BY actor_id`).all(CAMPAIGN_ID, admission.turnId)).toEqual([]);
      expect((handle.sqlite.prepare(`SELECT count(*) AS value
        FROM campaign_play_commands WHERE campaign_id = ? AND turn_id = ?
          AND json_extract(causal_parent_json, '$.kind') = 'actor_job'`).get(
            CAMPAIGN_ID,
            admission.turnId,
          ) as { value: number }).value).toBe(0);
      expect(count(handle, "campaign_play_narrations")).toBe(1);
      expect(handle.sqlite.prepare(`SELECT status FROM campaign_play_narrations
        WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, admission.turnId))
        .toEqual({ status: "complete" });
      const openingPacket = JSON.parse((handle.sqlite.prepare(`SELECT packet_json AS packetJson
        FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
          CAMPAIGN_ID,
          admission.turnId,
        ) as { packetJson: string }).packetJson) as CampaignPlayNarratorPacket;
      const hiddenTrace = "Fresh sealing wax and torn binding thread mark a ledger removed in haste.";
      expect(openingPacket.turnKind).toBe("opening");
      expect(openingPacket.consequences.map((consequence) => consequence.whatChanged))
        .toContain("The signal keeper asks Mara what she has learned about the impossible signal.");
      expect(openingPacket.consequences.map((consequence) => consequence.whatChanged))
        .not.toContain(hiddenTrace);

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

  it("accepts the allowlisted Z.AI response model and persists the truthful actual model", async () => {
    const { handle, state } = createPlayableCampaign();
    const models = runtimeModels();
    const time = fixedClock(2_000);
    const runtime = createCampaignPlayOpeningRuntime({
      handle,
      owner: "opening-zai-model-worker",
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 100,
      clock: time.clock,
      openingPlannerModel: {
        ...models.openingPlannerModel,
        requested: {
          ...models.openingPlannerModel.requested,
          providerId: "zai-coding-plan",
          model: "glm-5.2",
        },
      },
      narratorModel: {
        ...models.narratorModel,
        requested: {
          ...models.narratorModel.requested,
          providerId: "zai-coding-plan",
          model: "glm-5.2",
        },
      },
      openingPlanner: plannerFixture({ ...plannerEvidence, responseModel: "glm-5.3" }),
      narrator: narratorFixture({
        ...narratorEvidence,
        actualProviderId: "zai-coding-plan",
        responseModel: "glm-5.3",
      }),
    });
    const admission = runtime.admitOpening({
      submittedAt: 2_000,
      request: {
        idempotencyKey: "opening-zai-response-model",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
    });
    await runOpeningUntil(runtime, time, admission.turnId, (turn) => turn.stage === "completed");

    expect(runtime.loadTurn(admission.turnId)).toMatchObject({ stage: "completed" });
    expect(handle.sqlite.prepare(`SELECT kind, actual_provider_id AS actualProviderId,
        actual_model AS actualModel, status
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? ORDER BY kind`).all(
        CAMPAIGN_ID,
        admission.turnId,
      )).toEqual([
        { kind: "narrator", actualProviderId: "zai-coding-plan", actualModel: "glm-5.3", status: "accepted" },
        { kind: "opening_planner", actualProviderId: "zai-coding-plan", actualModel: "glm-5.3", status: "accepted" },
      ]);
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
    await runOpeningUntil(
      runtime,
      time,
      admission.turnId,
      (turn) => turn.stage === "interrupted",
    );

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
    await runOpeningUntil(
      runtime,
      time,
      admission.turnId,
      (turn) => turn.stage === "interrupted",
    );

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

  it("resumes the same Opening Narrator packet with its safe recovery feedback", async () => {
    const { handle, state } = createPlayableCampaign();
    const time = fixedClock(1_950);
    const narratorBase = narratorFixture();
    const recoveryFeedback: CampaignPlayNarratorRecoveryFeedback = {
      diagnostic: "narrator_generation_schema_mismatch",
      failedChecks: [{ check: "generation_schema_invalid" }],
    };
    let capturedRecoveryFeedback: CampaignPlayNarratorRecoveryFeedback | undefined;
    const interruptedRuntime = createCampaignPlayOpeningRuntime({
      handle,
      owner: "opening-narrator-recovery-worker",
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 100,
      clock: time.clock,
      ...runtimeModels(),
      openingPlanner: plannerFixture(),
      narrator: {
        compile: narratorBase.compile,
        narrate: vi.fn(async () => {
          throw new CampaignPlayNarratorError(
            "model_contract_failed",
            { ...narratorEvidence, errorCode: "narration_invalid" },
            { recoveryFeedback },
          );
        }),
      },
      onNarratorRecoveryFeedback(feedback) {
        capturedRecoveryFeedback = feedback;
      },
    });
    const admission = interruptedRuntime.admitOpening({
      submittedAt: 1_950,
      request: {
        idempotencyKey: "opening-narrator-safe-recovery",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
    });
    await runOpeningUntil(
      interruptedRuntime,
      time,
      admission.turnId,
      (turn) => turn.stage === "interrupted",
    );

    const interrupted = interruptedRuntime.loadTurn(admission.turnId)!;
    expect(interrupted).toMatchObject({
      stage: "interrupted",
      interruptedStage: "visibility_projected",
      errorCode: "model_contract_invalid",
    });
    expect(capturedRecoveryFeedback).toEqual(recoveryFeedback);
    const packetBeforeRecovery = (handle.sqlite.prepare(`SELECT packet_json AS packetJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID,
        admission.turnId,
      ) as { packetJson: string }).packetJson;

    const recoveredNarrate = vi.fn(async (
      request: Parameters<typeof narratorBase.narrate>[0],
    ) => narratorBase.narrate(request));
    const recoveredRuntime = createCampaignPlayOpeningRuntime({
      handle,
      owner: "opening-narrator-recovery-worker",
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 100,
      clock: time.clock,
      ...runtimeModels(),
      openingPlanner: plannerFixture(),
      narrator: {
        compile: narratorBase.compile,
        narrate: recoveredNarrate,
      },
      narratorRecoveryFeedback: capturedRecoveryFeedback,
    });
    time.advance();
    await recoveredRuntime.resumeInterruptedStage({
      turnId: admission.turnId,
      interruptedStage: interrupted.interruptedStage!,
      observedEpoch: interrupted.workerEpoch,
    });
    await runOpeningUntil(
      recoveredRuntime,
      time,
      admission.turnId,
      (turn) => turn.stage === "completed",
    );

    expect(recoveredNarrate).toHaveBeenCalledTimes(1);
    expect(recoveredNarrate.mock.calls[0]?.[0]).toMatchObject({ recoveryFeedback });
    expect((handle.sqlite.prepare(`SELECT packet_json AS packetJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID,
        admission.turnId,
      ) as { packetJson: string }).packetJson).toBe(packetBeforeRecovery);
    expect(handle.sqlite.prepare(`SELECT attempt, status, error_code AS errorCode
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'narrator'
      ORDER BY attempt`).all(CAMPAIGN_ID, admission.turnId)).toEqual([
      { attempt: 1, status: "interrupted", errorCode: "model_contract_invalid" },
      { attempt: 2, status: "accepted", errorCode: null },
    ]);
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
      if (failedStage === "narrator") {
        await runOpeningUntil(
          runtime,
          time,
          admission.turnId,
          (turn) => turn.stage === "visibility_projected",
        );
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
      await runOpeningUntil(
        runtime,
        time,
        admission.turnId,
        (turn) => turn.stage === "completed",
      );

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
    for (let stage = 0; stage < 16; stage += 1) {
      if (buildRuntime(stage).loadTurn(admission.turnId)?.stage === "completed") break;
      time.advance();
      await buildRuntime(stage).runNextStage(admission.turnId);
      if (buildRuntime(stage).loadTurn(admission.turnId)?.stage === "visibility_projected") {
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
    expect(count(handle, "campaign_play_actor_plans")).toBe(0);
    expect(count(handle, "campaign_play_actor_schedules")).toBe(6);
    expect(count(handle, "campaign_play_narrations")).toBe(1);
    expect((handle.sqlite.prepare(`SELECT packet_json AS packetJson
      FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`)
      .get(CAMPAIGN_ID, admission.turnId) as { packetJson: string }).packetJson)
      .toBe(packetBytes);
  });

  it("caps only the opening narrator budget to the compact scene contract", async () => {
    const { handle, state } = createPlayableCampaign();
    const narrator = narratorFixture();
    const models = runtimeModels();
    const time = fixedClock(3_500);
    const runtime = createCampaignPlayOpeningRuntime({
      handle,
      owner: "opening-compact-narrator-budget",
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 100,
      clock: time.clock,
      openingPlannerModel: models.openingPlannerModel,
      narratorModel: {
        ...models.narratorModel,
        maximumOutputTokens: 32_768,
        maximumTotalTokens: 33_768,
      },
      openingPlanner: plannerFixture(),
      narrator,
    });
    const admission = runtime.admitOpening({
      submittedAt: 3_500,
      request: {
        idempotencyKey: "compact-opening-narrator-budget",
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
    });

    await runOpeningUntil(runtime, time, admission.turnId, (turn) => turn.stage === "completed");

    expect(narrator.narrate).toHaveBeenCalledOnce();
    expect(narrator.narrate.mock.calls[0]![0].budget).toMatchObject({
      maximumInputTokens: models.narratorModel.maximumInputTokens,
      maximumOutputTokens: CAMPAIGN_PLAY_OPENING_NARRATOR_MAX_OUTPUT_TOKENS,
      maximumTotalTokens:
        models.narratorModel.maximumInputTokens +
        CAMPAIGN_PLAY_OPENING_NARRATOR_MAX_OUTPUT_TOKENS,
    });
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
      if (failurePoint === "actor_validation") {
        for (let stage = 0; stage < 2; stage += 1) {
          time.advance();
          await broken.runNextStage(admission.turnId);
        }
      } else {
        await runOpeningUntil(
          broken,
          time,
          admission.turnId,
          (turn) => turn.stage === "actors_settled",
        );
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
      await runOpeningUntil(
        recovered,
        time,
        admission.turnId,
        (turn) => turn.stage === "completed",
      );
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
