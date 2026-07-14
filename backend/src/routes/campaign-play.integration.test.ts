import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  CampaignPlayCharacterDraft,
  CampaignPlayNarratorPacket,
} from "@worldforge/shared";
import { closeDb } from "../db/index.js";
import { readCampaignConfig } from "../campaign/index.js";
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
} from "../campaign-play/campaign-play-database.js";
import { createCampaignPlayApplication } from "../campaign-play/campaign-play-application.js";
import {
  campaignPlayJournalPageSchema,
  campaignPlayErrorResponseSchema,
  campaignPlayPutPlayerResponseSchema,
  campaignPlaySseEventSchema,
  campaignPlayStateSchema,
  campaignPlayTurnAdmissionResponseSchema,
  campaignPlayTurnReadResponseSchema,
} from "../campaign-play/contracts.js";
import {
  createCampaignPlayOpeningPlanner,
  deriveCampaignPlayOpeningSceneCandidateId,
  type CampaignPlayOpeningModelEvidence,
  type CampaignPlayOpeningProposal,
} from "../campaign-play/opening-planner.js";
import { createCampaignPlayOpeningRuntime } from "../campaign-play/opening-runtime.js";
import {
  createCampaignPlayNarrator,
  type CampaignPlayNarratorModelEvidence,
} from "../campaign-play/narrator.js";
import {
  createCampaignPlayJudge,
  type CampaignPlayModelEvidence,
} from "../campaign-play/judge.js";
import { createCampaignPlayGameMaster } from "../campaign-play/game-master.js";
import {
  CampaignPlayTurnRuntimeError,
  createCampaignPlayTurnRuntime,
} from "../campaign-play/turn-runtime.js";
import type { CampaignPlayTurnServiceClock } from "../campaign-play/turn-service.js";
import { createCampaignPlayRoutes } from "./campaign-play.js";

const CAMPAIGN_ID = "4f52a9b9-3f7e-4f17-8c5e-6934b72bd731";
const PRICING = {
  known: true,
  currency: "USD",
  tokenUnit: 1_000_000,
  inputCostMicros: 1_000,
  outputCostMicros: 2_000,
  rounding: "ceil",
} as const;

let root = "";
let previousCampaignsRoot: string | undefined;

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-mounted-play-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
});

afterEach(() => {
  closeDb();
  if (previousCampaignsRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
  else process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  fs.rmSync(root, { recursive: true, force: true });
});

function writeCampaignConfig(): void {
  fs.writeFileSync(
    path.join(root, CAMPAIGN_ID, "config.json"),
    JSON.stringify({
      name: "Bell Island Playtest",
      premise: "A stormbound archipelago faces a failing sea route.",
      createdAt: 1_000,
      updatedAt: 1_000,
    }),
    "utf8",
  );
}

function acceptCampaignWorld(): void {
  createMigratedCampaign(root, CAMPAIGN_ID);
  writeCampaignConfig();
  const handle = openCampaignWorldDatabase(CAMPAIGN_ID);
  try {
    const repository = createCampaignWorldRepository(handle);
    const source = sourceFixture(CAMPAIGN_ID);
    repository.acquireBuild({
      buildId: "mounted-play-build",
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "playtest-provider",
      model: "playtest-model",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, "mounted-play-build");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b"
          ? { ...placement, locationId: "location-a" }
          : placement),
    };
    const review = repository.completeBuild({
      buildId: "mounted-play-build",
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
      cadenceMinutes: 1_440,
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
  responseModel: "playtest-opening-planner",
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
  actualProviderId: "playtest",
  responseModel: "playtest-narrator",
  finishReason: "stop",
  errorCode: null,
  inputTokens: 15,
  outputTokens: 25,
  totalTokens: 40,
  durationMs: 5,
  estimatedCostMicros: 1,
};

function modelEvidence(
  model: "playtest-judge" | "playtest-game-master",
): CampaignPlayModelEvidence {
  return {
    requestedStrategy: "strict_object",
    actualProviderId: "playtest",
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
          actionDetails: packet.availableIntents.map(() => "the immediate situation"),
          beats: [
            { purpose: "orientation", text: "Rain rings against the signal tower as Mara reaches Bell Island." },
            { purpose: "consequence", text: "Signal keepers brace the route gate while warning bells gather pace." },
            { purpose: "action_handoff", text: "The open path and the waiting keeper leave a clear choice." },
          ],
        },
        createdAt: request.createdAt,
        modelEvidence: {
          ...narratorEvidence,
          responseModel: "playtest-opening-narrator",
        },
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
          actionDetails: packet.availableIntents.map(() => "the immediate situation"),
          beats: [
            {
              purpose: "consequence",
              text: `${packet.actionContext!.submittedText} meets the visible conditions at ${packet.currentLocation.name}.`,
            },
            {
              purpose: "action_handoff",
              text: `The scene at ${packet.currentLocation.name} leaves another move open.`,
            },
          ],
        },
        createdAt: request.createdAt,
        modelEvidence: narratorEvidence,
      });
    },
  };
}

function judgeFixture() {
  const compiler = createCampaignPlayJudge();
  return {
    async judge(request: Parameters<ReturnType<typeof createCampaignPlayJudge>["judge"]>[0]) {
      const target = request.frame.visibleFacts.find((fact) =>
        fact.kind === "actor" && fact.handle !== request.frame.playerActorHandle);
      const ruling = compiler.compile(request.frame, request.input, {
        kind: target ? "contact" : "wait",
        targets: target ? [{ handle: target.handle, kind: "actor" }] : [],
        method: target ? "Ask calmly" : "Wait and watch",
        stakes: "Learn what changes at the signal gate",
        movementRouteHandle: null,
        disposition: "deterministic",
        citedVisibleFactHandles: [request.frame.locationHandle],
        resultBounds: { minimum: "success", maximum: "success" },
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 2 },
        uncertainty: { kind: "none" },
        reason: "The visible situation supports this ruling.",
        clarificationQuestion: null,
      });
      return {
        ruling,
        rulingHash: "f".repeat(64),
        modelEvidence: modelEvidence("playtest-judge"),
      };
    },
  };
}

function gameMasterFixture() {
  const compiler = createCampaignPlayGameMaster();
  return {
    async plan(request: Parameters<ReturnType<typeof createCampaignPlayGameMaster>["plan"]>[0]) {
      const playerHandle = request.frame.handleBindings.find((binding) =>
        binding.reference.kind === "actor" && binding.reference.id.startsWith("player:"))?.handle;
      if (!playerHandle) throw new Error("Game Master fixture requires the player binding.");
      const locationHandle = request.frame.visibleFacts.find((fact) =>
        fact.kind === "location")!.handle;
      return {
        ...compiler.compile(
          request.frame,
          request.ruling,
          request.resolution,
          request.uncertaintyAuthority,
          {
            elapsedMinutes: 1,
            effects: [{
              kind: "record_world_event",
              eventClass: "dialogue",
              summary: "Mara tests the signal keepers' account against the ringing tower.",
              affectedHandles: [playerHandle, locationHandle],
            }],
          },
        ),
        modelEvidence: modelEvidence("playtest-game-master"),
      };
    },
  };
}

function openingRuntime(handle: CampaignPlayDatabaseHandle, clock: CampaignPlayTurnServiceClock) {
  return createCampaignPlayOpeningRuntime({
    handle,
    owner: "mounted-play-opening-worker",
    leaseDurationMs: 60_000,
    heartbeatIntervalMs: 10_000,
    clock,
    openingPlannerModel: {
      languageModel: {} as LanguageModel,
      requested: {
        providerId: "playtest",
        model: "playtest-opening-planner",
        strategy: "strict_object",
        pricing: PRICING,
      },
      temperature: 0.2,
      maxOutputTokens: 4_096,
    },
    narratorModel: {
      languageModel: {} as LanguageModel,
      requested: {
        providerId: "playtest",
        model: "playtest-opening-narrator",
        strategy: "strict_object",
        pricing: PRICING,
      },
      temperature: 0.3,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 2_048,
      maximumTotalTokens: 3_048,
      maximumCostMicros: 10_000,
    },
    openingPlanner: openingPlannerFixture(),
    narrator: openingNarratorFixture(),
  });
}

function turnRuntime(handle: CampaignPlayDatabaseHandle, clock: CampaignPlayTurnServiceClock) {
  const stageModel = (model: string) => ({
    languageModel: {} as LanguageModel,
    requested: {
      providerId: "playtest",
      model,
      strategy: "strict_object" as const,
      pricing: PRICING,
    },
    temperature: 0.2,
    maximumInputTokens: 1_000,
    maximumOutputTokens: 2_048,
    maximumTotalTokens: 3_048,
    maximumCostMicros: 10_000,
  });
  return createCampaignPlayTurnRuntime({
    handle,
    owner: "mounted-play-turn-worker",
    leaseDurationMs: 60_000,
    heartbeatIntervalMs: 10_000,
    uncertaintySeedKey: "mounted-route-playtest-seed-key-with-32-bytes",
    clock,
    judgeModel: stageModel("playtest-judge"),
    gameMasterModel: stageModel("playtest-game-master"),
    actorReplannerModel: stageModel("playtest-actor-replanner"),
    narratorModel: stageModel("playtest-narrator"),
    judge: judgeFixture(),
    gameMaster: gameMasterFixture(),
    narrator: playerNarratorFixture(),
  });
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function decodeSseEvents(text: string) {
  return text
    .split("\n\n")
    .filter((frame) => frame.length > 0)
    .map((frame) => {
      const data = frame.split("\n").find((line) => line.startsWith("data: "));
      if (!data) throw new Error("SSE frame lacks a data payload.");
      return campaignPlaySseEventSchema.parse(JSON.parse(data.slice("data: ".length)));
    });
}

function countRows(handle: CampaignPlayDatabaseHandle, table: string, turnId: string): number {
  return (handle.sqlite.prepare(`SELECT count(*) AS count FROM ${table}
    WHERE campaign_id = ? AND turn_id = ?`).get(CAMPAIGN_ID, turnId) as { count: number }).count;
}

describe("Campaign Play mounted route", () => {
  it("plays a migrated accepted campaign through player bootstrap, opening, and one player action", async () => {
    acceptCampaignWorld();
    const time = advancingClock(1_300);
    const runtimeFactory = {
      createOpening: (handle: CampaignPlayDatabaseHandle) => openingRuntime(handle, time.clock),
      createTurn: (handle: CampaignPlayDatabaseHandle) => turnRuntime(handle, time.clock),
    };
    const application = createCampaignPlayApplication({
      now: time.now,
      owner: "mounted-route-playtest-application",
      uncertaintySeedKey: () => "mounted-route-playtest-seed-key-with-32-bytes",
      runtimeFactory,
    });
    const app = createCampaignPlayRoutes({
      application,
      readCampaign: readCampaignConfig,
      eventPollMilliseconds: 1,
    });

    const initialStateResponse = await app.request(`/${CAMPAIGN_ID}/play/state`);
    expect(initialStateResponse.status).toBe(200);
    const initialState = campaignPlayStateSchema.parse(await initialStateResponse.json());
    expect(initialState).toMatchObject({ phase: "character_required", character: null });

    const playerResponse = await app.request(
      `/${CAMPAIGN_ID}/play/player`,
      jsonRequest("PUT", {
        acceptedWorldVersion: initialState.acceptedWorldVersion,
        expectedWorldVersion: initialState.worldVersion,
        expectedRuntimeRevision: initialState.runtimeRevision,
        source: "created",
        character: playerDraft(),
      }),
    );
    expect(playerResponse.status).toBe(200);
    const player = campaignPlayPutPlayerResponseSchema.parse(await playerResponse.json());
    expect(player.actorHandle.startsWith("actor_")).toBe(true);

    const openingStateResponse = await app.request(`/${CAMPAIGN_ID}/play/state`);
    const openingState = campaignPlayStateSchema.parse(await openingStateResponse.json());
    expect(openingState).toMatchObject({ phase: "opening_required", character: { name: "Mara Venn" } });

    const openingResponse = await app.request(
      `/${CAMPAIGN_ID}/play/opening`,
      jsonRequest("POST", {
        idempotencyKey: "mounted-opening",
        expectedWorldVersion: openingState.worldVersion,
        expectedRuntimeRevision: openingState.runtimeRevision,
        startingConditions: { mode: "delegate" },
      }),
    );
    expect(openingResponse.status).toBe(202);
    const openingAdmission = campaignPlayTurnAdmissionResponseSchema.parse(
      await openingResponse.json(),
    );
    await application.waitForIdle(CAMPAIGN_ID);

    const completedOpeningResponse = await app.request(
      `/${CAMPAIGN_ID}/play/turns/${openingAdmission.turnId}`,
    );
    expect(completedOpeningResponse.status).toBe(200);
    const completedOpening = campaignPlayTurnReadResponseSchema.parse(
      await completedOpeningResponse.json(),
    );
    expect(completedOpening.turn).toMatchObject({
      turnId: openingAdmission.turnId,
      turnKind: "opening",
      status: "completed",
    });
    expect(completedOpening.result).toMatchObject({ status: "completed" });

    const openingSseResponse = await app.request(
      `/${CAMPAIGN_ID}/play/turns/${openingAdmission.turnId}/events?afterSequence=0`,
    );
    expect(openingSseResponse.status).toBe(200);
    const openingEvents = decodeSseEvents(await openingSseResponse.text());
    expect(openingEvents.some((event) => event.type === "turn.completed")).toBe(true);

    const readyStateResponse = await app.request(`/${CAMPAIGN_ID}/play/state`);
    const readyState = campaignPlayStateSchema.parse(await readyStateResponse.json());
    expect(readyState).toMatchObject({
      phase: "ready",
      activeTurn: null,
      narration: { turnId: openingAdmission.turnId },
    });

    const actionResponse = await app.request(
      `/${CAMPAIGN_ID}/play/turns`,
      jsonRequest("POST", {
        idempotencyKey: "mounted-action",
        expectedWorldVersion: readyState.worldVersion,
        expectedRuntimeRevision: readyState.runtimeRevision,
        source: "freeform",
        text: "I ask the signal keeper what changed at the gate.",
      }),
    );
    expect(actionResponse.status).toBe(202);
    const actionAdmission = campaignPlayTurnAdmissionResponseSchema.parse(
      await actionResponse.json(),
    );
    await application.waitForIdle(CAMPAIGN_ID);

    const actionTurnResponse = await app.request(
      `/${CAMPAIGN_ID}/play/turns/${actionAdmission.turnId}`,
    );
    expect(actionTurnResponse.status).toBe(200);
    const actionTurn = campaignPlayTurnReadResponseSchema.parse(await actionTurnResponse.json());
    expect(actionTurn.turn).toMatchObject({
      turnId: actionAdmission.turnId,
      turnKind: "player_action",
      status: "completed",
    });
    expect(actionTurn.result).toMatchObject({ status: "completed" });

    const actionSseResponse = await app.request(
      `/${CAMPAIGN_ID}/play/turns/${actionAdmission.turnId}/events?afterSequence=0`,
    );
    expect(actionSseResponse.status).toBe(200);
    const actionEvents = decodeSseEvents(await actionSseResponse.text());
    expect(actionEvents.some((event) => event.type === "turn.completed")).toBe(true);

    const finalStateResponse = await app.request(`/${CAMPAIGN_ID}/play/state`);
    const finalState = campaignPlayStateSchema.parse(await finalStateResponse.json());
    expect(finalState).toMatchObject({
      phase: "ready",
      activeTurn: null,
      narration: { turnId: actionAdmission.turnId },
    });
    expect(finalState.worldVersion).toBeGreaterThan(readyState.worldVersion);

    const misconfiguredApplication = createCampaignPlayApplication({
      now: time.now,
      owner: "mounted-route-invalid-runtime",
      runtimeFactory: {
        createOpening: runtimeFactory.createOpening,
        createTurn: () => {
          throw new CampaignPlayTurnRuntimeError(
            "turn_state_invalid",
            "Campaign Play uncertainty seed key is invalid.",
          );
        },
      },
    });
    const misconfiguredRoutes = createCampaignPlayRoutes({
      application: misconfiguredApplication,
      readCampaign: readCampaignConfig,
      eventPollMilliseconds: 1,
    });
    const misconfiguredResponse = await misconfiguredRoutes.request(
      `/${CAMPAIGN_ID}/play/turns`,
      jsonRequest("POST", {
        idempotencyKey: "misconfigured-action",
        expectedWorldVersion: finalState.worldVersion,
        expectedRuntimeRevision: finalState.runtimeRevision,
        source: "freeform",
        text: "I wait for the bells.",
      }),
    );
    expect(misconfiguredResponse.status).toBe(503);
    expect(campaignPlayErrorResponseSchema.parse(await misconfiguredResponse.json()))
      .toMatchObject({
        code: "service_unavailable",
        expectedWorldVersion: finalState.worldVersion,
        currentWorldVersion: finalState.worldVersion,
        expectedRuntimeRevision: finalState.runtimeRevision,
        currentRuntimeRevision: finalState.runtimeRevision,
      });

    const journalResponse = await app.request(`/${CAMPAIGN_ID}/play/journal?cursor=0&limit=20`);
    expect(journalResponse.status).toBe(200);
    const journal = campaignPlayJournalPageSchema.parse(await journalResponse.json());
    expect(journal.entries).toHaveLength(1);
    expect(journal.entries[0]).toMatchObject({
      title: "Your action",
      text: "Mara tests the signal keepers' account against the ringing tower.",
      whereOrRoute: "Bell Island",
    });

    const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
    try {
      const durableTurns = handle.sqlite.prepare(`SELECT turn_kind AS turnKind, stage
        FROM campaign_play_turns WHERE campaign_id = ? ORDER BY submitted_at, id`).all(CAMPAIGN_ID);
      expect(durableTurns).toEqual([
        { turnKind: "opening", stage: "completed" },
        { turnKind: "player_action", stage: "completed" },
      ]);
      expect(countRows(handle, "campaign_play_turn_events", openingAdmission.turnId)).toBeGreaterThan(0);
      expect(countRows(handle, "campaign_play_turn_events", actionAdmission.turnId)).toBeGreaterThan(0);
      expect(countRows(handle, "campaign_play_receipts", actionAdmission.turnId)).toBeGreaterThanOrEqual(2);
      expect(countRows(handle, "campaign_play_events", actionAdmission.turnId)).toBeGreaterThan(0);
      expect(countRows(handle, "campaign_play_turn_results", openingAdmission.turnId)).toBe(1);
      expect(countRows(handle, "campaign_play_turn_results", actionAdmission.turnId)).toBe(1);
    } finally {
      handle.close();
    }

    const restartedApplication = createCampaignPlayApplication({
      now: time.now,
      owner: "mounted-route-playtest-restarted-application",
      uncertaintySeedKey: () => "mounted-route-playtest-seed-key-with-32-bytes",
      runtimeFactory,
    });
    const restartedRoutes = createCampaignPlayRoutes({
      application: restartedApplication,
      readCampaign: readCampaignConfig,
      eventPollMilliseconds: 1,
    });
    const reloadedStateResponse = await restartedRoutes.request(`/${CAMPAIGN_ID}/play/state`);
    expect(reloadedStateResponse.status).toBe(200);
    expect(campaignPlayStateSchema.parse(await reloadedStateResponse.json())).toEqual(finalState);
    const reloadedActionResponse = await restartedRoutes.request(
      `/${CAMPAIGN_ID}/play/turns/${actionAdmission.turnId}`,
    );
    expect(reloadedActionResponse.status).toBe(200);
    expect(campaignPlayTurnReadResponseSchema.parse(await reloadedActionResponse.json()))
      .toEqual(actionTurn);
    const reloadedJournalResponse = await restartedRoutes.request(
      `/${CAMPAIGN_ID}/play/journal?cursor=0&limit=20`,
    );
    expect(reloadedJournalResponse.status).toBe(200);
    expect(campaignPlayJournalPageSchema.parse(await reloadedJournalResponse.json())).toEqual(journal);
  });
});
