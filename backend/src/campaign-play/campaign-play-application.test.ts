import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CampaignPlayCharacterDraft,
  CampaignPlayOpeningAdmissionRequest,
} from "@worldforge/shared";
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
import {
  CAMPAIGN_PLAY_MINIMUM_OUTPUT_TOKENS,
  CampaignPlayApplicationError,
  campaignPlayGameMasterOperationDeadlineMs,
  campaignPlayMayAutomaticallyResumeExternalStage,
  campaignPlayMaximumOutputTokens,
  createCampaignPlayApplication,
  resolveCampaignPlayRequestedModel,
} from "./campaign-play-application.js";
import {
  createCampaignPlayTurnRepository,
  type CampaignPlayExternalInterruptionEvidence,
  type CampaignPlayTurnModelSelection,
} from "./campaign-play-turn-repository.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import type { CampaignPlayGameMasterRecoveryFeedback } from "./game-master.js";
import type { CampaignPlayTurnRuntime } from "./turn-runtime.js";
import type { CampaignPlayOpeningRuntime } from "./opening-runtime.js";

const CAMPAIGN_ID = "99999999-9999-4999-8999-999999999999";
const PRICING = { known: false, currency: "USD", tokenUnit: 1_000_000,
  inputCostMicros: 0, outputCostMicros: 0, rounding: "ceil" } as const;
const SELECTION: CampaignPlayTurnModelSelection = {
  turnKind: "opening",
  openingPlanner: {
    providerId: "provider-frozen",
    model: "planner-frozen",
    strategy: "strict_object",
    pricing: PRICING,
  },
  narrator: {
    providerId: "provider-frozen",
    model: "narrator-frozen",
    strategy: "strict_object",
    pricing: PRICING,
  },
};

const PLAYER_SELECTION: CampaignPlayTurnModelSelection = {
  turnKind: "player_action",
  routeKind: "full_authority",
  judge: {
    providerId: "provider-frozen",
    model: "judge-frozen",
    strategy: "strict_object",
    pricing: PRICING,
  },
  gameMaster: {
    providerId: "provider-frozen",
    model: "game-master-frozen",
    strategy: "strict_object",
    pricing: PRICING,
  },
  actorReplanner: {
    providerId: "provider-frozen",
    model: "actor-frozen",
    strategy: "strict_object",
    pricing: PRICING,
  },
  narrator: {
    providerId: "provider-frozen",
    model: "narrator-frozen",
    strategy: "strict_object",
    pricing: PRICING,
  },
};

const GAME_MASTER_RECOVERY_FEEDBACK: CampaignPlayGameMasterRecoveryFeedback = {
  diagnostic: "game_master_semantic_validation_mismatch",
  failedChecks: [{
    check: "repeated_actor_dialogue",
    effectIndex: 0,
    fieldPath: "effects[0].summary",
    performingActorHandle: "actor:performer",
    recentOwnActionIndex: 0,
  }],
};

let root = "";
let previousCampaignsRoot: string | undefined;

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-play-application-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
});

afterEach(() => {
  closeDb();
  if (previousCampaignsRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
  else process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  fs.rmSync(root, { recursive: true, force: true });
});

function createAcceptedCampaign(): void {
  createMigratedCampaign(root, CAMPAIGN_ID);
  const handle = openCampaignWorldDatabase(CAMPAIGN_ID);
  try {
    const repository = createCampaignWorldRepository(handle);
    const source = sourceFixture(CAMPAIGN_ID);
    repository.acquireBuild({
      buildId: "application-build",
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test",
      model: "test",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, "application-build");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b"
          ? { ...placement, locationId: "location-a" }
          : placement),
    };
    const review = repository.completeBuild({
      buildId: "application-build",
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

function bootstrapPlayer(application: ReturnType<typeof createCampaignPlayApplication>) {
  const state = application.loadState(CAMPAIGN_ID);
  return application.putPlayer(CAMPAIGN_ID, {
    acceptedWorldVersion: state.acceptedWorldVersion,
    expectedWorldVersion: state.worldVersion,
    expectedRuntimeRevision: state.runtimeRevision,
    source: "created",
    character: playerDraft(),
  });
}

function applicationSettings() {
  const provider = {
    id: "provider-test",
    name: "Provider Test",
    baseUrl: "http://localhost:1234",
    apiKey: "",
    defaultModel: "test-model",
  };
  const role = (model: string) => ({
    providerId: provider.id,
    model,
    temperature: 0,
    maxTokens: 32_768,
  });
  return {
    providers: [provider],
    judge: role("judge-model"),
    storyteller: role("storyteller-model"),
    generator: role("generator-model"),
    embedder: { providerId: provider.id, model: "embedder-model", enabled: false },
    images: { providerId: provider.id, model: "image-model", stylePrompt: "", enabled: false },
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
}

function fakeOpeningRuntime(
  handle: CampaignPlayDatabaseHandle,
  options: {
    runNextStage: ReturnType<typeof vi.fn>;
    resumeStage?: ReturnType<typeof vi.fn>;
    interruptOnRun?: boolean;
    initialErrorCode?: CampaignPlayExternalInterruptionEvidence["errorCode"];
    resumeErrorCode?: CampaignPlayExternalInterruptionEvidence["errorCode"];
    resumeSucceeds?: boolean;
  },
): CampaignPlayOpeningRuntime {
  const repository = createCampaignPlayTurnRepository(handle);
  const snapshot = (turnId: string, observedAt: number) => {
    const turn = repository.loadTurn(turnId)!;
    return {
      turn,
      recovery: repository.loadRecoveryState(turnId, observedAt),
      telemetry: null,
    };
  };
  return {
    admitOpening({ request, submittedAt }) {
      const turnId = `turn:${request.idempotencyKey}`;
      const replay = repository.loadTurn(turnId);
      if (replay) {
        if (replay.document.turnKind !== "opening") {
          throw new Error("Opening fixture loaded another turn kind.");
        }
        return repository.admitTurn({
          turnId: replay.turnId,
          supersedesTurnId: replay.supersedesTurnId,
          mutationId: `admit:${request.idempotencyKey}`,
          submittedAt: replay.submittedAt,
          document: {
            turnKind: "opening",
            request,
            frame: replay.document.frame,
          },
          modelSelection: replay.modelSelection,
        });
      }
      const state = handle.sqlite.prepare(`SELECT world_version AS worldVersion,
        runtime_revision AS runtimeRevision FROM campaign_play_states
        WHERE campaign_id = ?`).get(CAMPAIGN_ID) as {
          worldVersion: number;
          runtimeRevision: number;
        };
      return repository.admitTurn({
        turnId,
        supersedesTurnId: null,
        mutationId: `admit:${request.idempotencyKey}`,
        submittedAt,
        document: {
          turnKind: "opening",
          request,
          frame: { worldVersion: state.worldVersion, runtimeRevision: state.runtimeRevision },
        },
        modelSelection: SELECTION,
      });
    },
    async runNextStage(turnId) {
      options.runNextStage(turnId);
      const turn = repository.loadTurn(turnId)!;
      if (!options.interruptOnRun || turn.stage !== "admitted") {
        return snapshot(turnId, turn.updatedAt);
      }
      const claimedAt = turn.updatedAt + 1;
      const token = repository.claimStage({
        turnId,
        expectedStage: "admitted",
        observedEpoch: turn.workerEpoch,
        owner: "application-driver",
        claimedAt,
        leaseExpiresAt: claimedAt + 1_000,
        mutationId: `claim:${turn.workerEpoch + 1}`,
      });
      repository.interruptExternal({
        token,
        evidence: {
          actualProviderId: "provider-frozen",
          actualModel: "planner-frozen",
          actualStrategy: "strict_object",
          inputTokens: 3,
          outputTokens: 0,
          durationMs: 2,
          finishReason: options.initialErrorCode === "model_contract_invalid"
            ? "invalid_output" : "transport_error",
          schemaOutcome: options.initialErrorCode === "model_contract_invalid"
            ? "invalid" : "transport_error",
          errorCode: options.initialErrorCode ?? "provider_unavailable",
        },
        interruptedAt: claimedAt + 2,
        mutationId: `interrupt:${token.epoch}`,
      });
      return snapshot(turnId, claimedAt + 2);
    },
    async recoverActiveTurn() {
      const turn = repository.loadActiveTurn();
      return turn ? snapshot(turn.turnId, turn.updatedAt) : null;
    },
    async resumeInterruptedStage(input) {
      options.resumeStage?.(input);
      const turn = repository.loadTurn(input.turnId)!;
      const resumedAt = turn.updatedAt + 1;
      const token = repository.resumeExternal({
        turnId: input.turnId,
        interruptedStage: input.interruptedStage,
        observedEpoch: input.observedEpoch,
        owner: "application-resume",
        resumedAt,
        leaseExpiresAt: resumedAt + 1_000,
        mutationId: `resume:${input.observedEpoch + 1}`,
      });
      if (options.resumeSucceeds) {
        repository.acceptModelArtifact({
          token,
          artifact: { plan: { summary: "Retry succeeded", steps: ["continue"] } },
          evidence: {
            actualProviderId: "provider-frozen",
            actualModel: "planner-frozen",
            actualStrategy: "strict_object",
            inputTokens: 4,
            outputTokens: 8,
            durationMs: 2,
            finishReason: "stop",
          },
          mutationDomain: "runtime",
          acceptedAt: resumedAt + 2,
          mutationId: `resume-accept:${token.epoch}`,
        });
        return snapshot(input.turnId, resumedAt + 2);
      }
      repository.interruptExternal({
        token,
        evidence: {
          actualProviderId: "provider-frozen",
          actualModel: "planner-frozen",
          actualStrategy: "strict_object",
          inputTokens: 4,
          outputTokens: 0,
          durationMs: 2,
          finishReason: options.resumeErrorCode === "model_contract_invalid"
            ? "invalid_output" : "transport_error",
          schemaOutcome: options.resumeErrorCode === "model_contract_invalid"
            ? "invalid" : "transport_error",
          errorCode: options.resumeErrorCode ?? "provider_unavailable",
        },
        interruptedAt: resumedAt + 2,
        mutationId: `resume-interrupt:${token.epoch}`,
      });
      return snapshot(input.turnId, resumedAt + 2);
    },
    loadTurn: (turnId) => repository.loadTurn(turnId),
  };
}

function markPlayerPhaseReady(): void {
  const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
  try {
    const stateRepository = createCampaignPlayStateRepository(handle);
    const before = stateRepository.loadState();
    if (!before) throw new Error("Campaign Play state must exist before the ready fixture.");
    const packet = {
      acceptedWorldVersion: before.authority.acceptedWorldVersion,
      worldVersion: before.authority.worldVersion + 1,
      runtimeRevision: before.authority.runtimeRevision + 1,
      campaignId: CAMPAIGN_ID,
      turnId: "turn:opening-fixture",
      turnKind: "opening" as const,
      openingContext: {
        role: "A repairer waiting for passage",
        arrivalMode: "On the last permitted ferry",
        immediateSituation: "The harbor gates close as an impossible bell pattern crosses the water.",
      },
      actionContext: null,
      playerHistory: [],
      sourceMoment: null,
      currentLocation: {
        handle: "location_harbor",
        name: "Harbor",
        description: "Rain crosses the lantern light.",
      },
      visibleActors: [],
      visibleRoutes: [],
      visiblePressures: [],
      possessions: [],
      obligations: [],
      newObservations: [],
      consequences: [],
      continuity: [],
      elapsedMinutes: 0,
      availableIntents: [],
    };
    const packetHash = "a".repeat(64);
    stateRepository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "player-ready-boundary",
        turnId: null,
        kind: "character_created",
        workerEpoch: null,
        protectedPayloadHash: "b".repeat(64),
        createdAt: 2_000,
      },
      mutate({ sqlite, campaignId }) {
        sqlite.prepare(`INSERT INTO campaign_play_turns (
          id, campaign_id, turn_kind, supersedes_turn_id, input_json, input_hash,
          idempotency_key, expected_world_version, expected_runtime_revision,
          base_world_version, final_world_version, stage, frame_hash,
          next_event_sequence, worker_epoch, model_selection_json,
          public_packet_hash, mutation_audit_json, submitted_at, updated_at, completed_at
        ) VALUES (?, ?, 'opening', NULL, '{}', ?, ?, ?, ?, ?, ?, 'completed', ?, 1, 0, ?, ?, '{}', ?, ?, ?)`)
          .run(
            packet.turnId,
            campaignId,
            "d".repeat(64),
            "opening-fixture",
            before.authority.worldVersion,
            before.authority.runtimeRevision,
            before.authority.worldVersion,
            before.authority.worldVersion + 1,
            "c".repeat(64),
            JSON.stringify(SELECTION),
            packetHash,
            1_500,
            2_000,
            2_000,
          );
        sqlite.prepare(`INSERT INTO campaign_play_narrations (
          narration_id, campaign_id, turn_id, status, packet_hash, packet_json,
          beats_json, display_text, suggested_actions_json, effects_json,
          created_at, completed_at
        ) VALUES (?, ?, ?, 'complete', ?, ?, ?, ?, '[]', '[]', ?, ?)`)
          .run(
            "narration:opening-fixture",
            campaignId,
            packet.turnId,
            packetHash,
            JSON.stringify(packet),
            JSON.stringify([{ beatId: "beat-opening", text: "Rain gathers on the quiet road." }]),
            "The harbor waits beneath the impossible bell.",
            2_000,
            2_000,
          );
        sqlite.prepare(`UPDATE campaign_play_states
          SET setup_phase = 'ready', world_time_minutes = 0, opened_at = ?, updated_at = ?
          WHERE campaign_id = ?`).run(2_000, 2_000, campaignId);
      },
    });
  } finally {
    handle.close();
  }
}

function fakePlayerRuntime(
  handle: CampaignPlayDatabaseHandle,
  options: {
    gameMasterRecoveryFeedback?: CampaignPlayGameMasterRecoveryFeedback;
    onGameMasterRecoveryFeedback?: (feedback: CampaignPlayGameMasterRecoveryFeedback) => void;
    onRun?: (turnId: string) => void;
    onResume?: (input: {
      turnId: string;
      gameMasterRecoveryFeedback?: CampaignPlayGameMasterRecoveryFeedback;
    }) => void;
  },
): CampaignPlayTurnRuntime {
  const repository = createCampaignPlayTurnRepository(handle);
  const snapshot = (turnId: string, observedAt: number) => ({
    turn: repository.loadTurn(turnId)!,
    recovery: repository.loadRecoveryState(turnId, observedAt),
    telemetry: null,
  });
  return {
    admitAction({ request, submittedAt }) {
      const turnId = `turn:${request.idempotencyKey}`;
      return repository.admitTurn({
        turnId,
        supersedesTurnId: null,
        mutationId: `admit:${request.idempotencyKey}`,
        submittedAt,
        document: { turnKind: "player_action", request, frame: {} },
        modelSelection: PLAYER_SELECTION,
      });
    },
    async runNextStage(turnId) {
      options.onRun?.(turnId);
      const turn = repository.loadTurn(turnId)!;
      if (turn.stage !== "admitted" || turn.workerLeaseOwner !== null) {
        return snapshot(turnId, turn.updatedAt);
      }
      const claimedAt = turn.updatedAt + 1;
      const token = repository.claimStage({
        turnId,
        expectedStage: "admitted",
        observedEpoch: turn.workerEpoch,
        owner: "application-gm-recovery",
        claimedAt,
        leaseExpiresAt: claimedAt + 1_000,
        mutationId: `claim:${turn.workerEpoch + 1}`,
      });
      options.onGameMasterRecoveryFeedback?.(GAME_MASTER_RECOVERY_FEEDBACK);
      repository.interruptExternal({
        token,
        evidence: {
          actualProviderId: "provider-frozen",
          actualModel: "game-master-frozen",
          actualStrategy: "strict_object",
          inputTokens: 3,
          outputTokens: 0,
          durationMs: 2,
          finishReason: "invalid_output",
          schemaOutcome: "invalid",
          errorCode: "model_contract_invalid",
        },
        interruptedAt: claimedAt + 2,
        mutationId: `interrupt:${token.epoch}`,
      });
      return snapshot(turnId, claimedAt + 2);
    },
    async recoverActiveTurn() {
      const turn = repository.loadActiveTurn();
      return turn ? snapshot(turn.turnId, turn.updatedAt) : null;
    },
    async resumeInterruptedStage(input) {
      options.onResume?.({
        turnId: input.turnId,
        gameMasterRecoveryFeedback: options.gameMasterRecoveryFeedback,
      });
      const turn = repository.loadTurn(input.turnId)!;
      const resumedAt = turn.updatedAt + 1;
      const token = repository.resumeExternal({
        turnId: input.turnId,
        interruptedStage: input.interruptedStage,
        observedEpoch: input.observedEpoch,
        owner: "application-gm-recovery-resume",
        resumedAt,
        leaseExpiresAt: resumedAt + 1_000,
        mutationId: `resume:${input.observedEpoch + 1}`,
      });
      const resumed = repository.loadTurn(input.turnId)!;
      return {
        turn: resumed,
        recovery: {
          kind: "external_ready" as const,
          turnId: input.turnId,
          stage: "admitted" as const,
          workerEpoch: token.epoch,
        },
        telemetry: null,
      };
    },
    runNarration: async () => null,
    prepareNarrationRecovery: () => { throw new Error("Narration is outside this application fixture."); },
    loadTurn: (turnId) => repository.loadTurn(turnId),
    loadTelemetry: (turnId) => repository.loadTurnTelemetry(turnId),
  };
}

function openingRequest(
  application: ReturnType<typeof createCampaignPlayApplication>,
  idempotencyKey = "opening-one",
): CampaignPlayOpeningAdmissionRequest {
  const state = application.loadState(CAMPAIGN_ID);
  return {
    idempotencyKey,
    expectedWorldVersion: state.worldVersion,
    expectedRuntimeRevision: state.runtimeRevision,
    startingConditions: { mode: "delegate" },
  };
}

describe("CampaignPlayApplication", () => {
  it("allows player-action and Opening visibility timeout recovery without widening other Opening recovery", () => {
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "player_action",
      interruptedStage: "admitted",
      routeKind: "full_authority",
      errorCode: "stage_timeout",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: false,
    })).toBe(true);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "opening",
      interruptedStage: "visibility_projected",
      routeKind: undefined,
      errorCode: "stage_timeout",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: false,
    })).toBe(true);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "opening",
      interruptedStage: "admitted",
      routeKind: undefined,
      errorCode: "stage_timeout",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: false,
    })).toBe(false);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "opening",
      interruptedStage: "primary_settled",
      routeKind: undefined,
      errorCode: "stage_timeout",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: false,
    })).toBe(false);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "opening",
      interruptedStage: "planned",
      routeKind: undefined,
      errorCode: "stage_timeout",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: false,
    })).toBe(false);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "opening",
      interruptedStage: "actors_settled",
      routeKind: undefined,
      errorCode: "stage_timeout",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: false,
    })).toBe(false);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "opening",
      interruptedStage: "visibility_projected",
      routeKind: undefined,
      errorCode: "model_contract_invalid",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: false,
    })).toBe(false);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "opening",
      interruptedStage: "visibility_projected",
      routeKind: undefined,
      errorCode: "stage_timeout",
      attempt: 2,
      wasResume: true,
      alreadyAttempted: true,
    })).toBe(false);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "opening",
      interruptedStage: "visibility_projected",
      routeKind: undefined,
      errorCode: "stage_timeout",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: true,
    })).toBe(false);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "player_action",
      interruptedStage: "admitted",
      routeKind: "full_authority",
      errorCode: "stage_timeout",
      attempt: 2,
      wasResume: true,
      alreadyAttempted: true,
    })).toBe(false);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "player_action",
      interruptedStage: "admitted",
      routeKind: "full_authority",
      errorCode: "model_contract_invalid",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: false,
    })).toBe(true);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "player_action",
      interruptedStage: "admitted",
      routeKind: "certified_contact",
      errorCode: "model_contract_invalid",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: false,
    })).toBe(true);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "player_action",
      interruptedStage: "judged",
      routeKind: "full_authority",
      errorCode: "model_contract_invalid",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: false,
    })).toBe(true);
    expect(campaignPlayMayAutomaticallyResumeExternalStage({
      turnKind: "player_action",
      interruptedStage: "judged",
      routeKind: "certified_contact",
      errorCode: "model_contract_invalid",
      attempt: 1,
      wasResume: false,
      alreadyAttempted: false,
    })).toBe(false);
  });

  it("gives every Campaign Play model at least a 32k output window", () => {
    expect(campaignPlayMaximumOutputTokens(512)).toBe(CAMPAIGN_PLAY_MINIMUM_OUTPUT_TOKENS);
    expect(campaignPlayMaximumOutputTokens(65_536)).toBe(65_536);
  });

  it("keeps the Game Master deadline ordinary unless safe recovery feedback is present", () => {
    expect(campaignPlayGameMasterOperationDeadlineMs()).toBe(45_000);
    expect(campaignPlayGameMasterOperationDeadlineMs(undefined)).toBe(45_000);
    expect(campaignPlayGameMasterOperationDeadlineMs(GAME_MASTER_RECOVERY_FEEDBACK)).toBe(90_000);
  });

  it("freezes exact known role pricing into Campaign Play model authority", () => {
    expect(resolveCampaignPlayRequestedModel({
      provider: {
        id: "provider-priced",
        name: "Priced Provider",
        baseUrl: "https://example.test/v1",
        apiKey: "key",
        model: "priced-model",
      },
      temperature: 0,
      maxTokens: 1_024,
      pricing: {
        currency: "USD",
        tokenUnit: 1_000_000,
        inputCostMicros: 150_000,
        outputCostMicros: 600_000,
      },
    })).toEqual({
      providerId: "provider-priced",
      model: "priced-model",
      strategy: "strict_object",
      pricing: {
        known: true,
        currency: "USD",
        tokenUnit: 1_000_000,
        inputCostMicros: 150_000,
        outputCostMicros: 600_000,
        rounding: "ceil",
      },
    });
  });

  it("keeps role model construction modes and identities explicit", () => {
    createAcceptedCampaign();
    const createModel = vi.fn((
      _config: unknown,
      options: { role?: string; reasoningMode?: string } = {},
    ) => ({}) as never);
    const openingApplication = createCampaignPlayApplication({
      now: () => 1_300,
      loadSettings: () => applicationSettings() as never,
      createModel: createModel as never,
    });
    expect(() => openingApplication.admitOpening(CAMPAIGN_ID, {
      idempotencyKey: "opening-narrator-options",
      expectedWorldVersion: openingApplication.loadState(CAMPAIGN_ID).worldVersion,
      expectedRuntimeRevision: openingApplication.loadState(CAMPAIGN_ID).runtimeRevision,
      startingConditions: { mode: "delegate" },
    })).toThrow(expect.objectContaining({ publicCode: "character_required" }));
    expect(createModel.mock.calls).toEqual([
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "generator-model",
        },
        { role: "generator", reasoningMode: "bypass" },
      ],
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "storyteller-model",
        },
        { role: "storyteller" },
      ],
    ]);

    bootstrapPlayer(openingApplication);
    const state = openingApplication.loadState(CAMPAIGN_ID);
    expect(() => openingApplication.admitTurn(CAMPAIGN_ID, {
      idempotencyKey: "player-narrator-options",
      expectedWorldVersion: state.worldVersion,
      expectedRuntimeRevision: state.runtimeRevision,
      source: "freeform",
      text: "I ask the keeper about the signal.",
    })).toThrow(expect.objectContaining({ publicCode: "opening_required" }));
    expect(createModel.mock.calls).toEqual([
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "generator-model",
        },
        { role: "generator", reasoningMode: "bypass" },
      ],
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "storyteller-model",
        },
        { role: "storyteller" },
      ],
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "judge-model",
        },
        { role: "judge", reasoningMode: "bypass" },
      ],
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "judge-model",
        },
        { role: "judge" },
      ],
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "generator-model",
        },
        { role: "generator", reasoningMode: "bypass" },
      ],
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "generator-model",
        },
        { role: "generator" },
      ],
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "generator-model",
        },
        { role: "generator", reasoningMode: "bypass" },
      ],
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "generator-model",
        },
        { role: "generator" },
      ],
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "generator-model",
        },
        { role: "generator", reasoningMode: "bypass" },
      ],
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "generator-model",
        },
        { role: "generator" },
      ],
      [
        {
          id: "provider-test",
          name: "Provider Test",
          baseUrl: "http://localhost:1234",
          apiKey: "",
          model: "storyteller-model",
        },
        { role: "storyteller", reasoningMode: "bypass" },
      ],
    ]);
  });

  it("initializes once and deduplicates same-key opening admission and its driver", async () => {
    createAcceptedCampaign();
    const runNextStage = vi.fn();
    const application = createCampaignPlayApplication({
      now: () => 1_300,
      runtimeFactory: {
        createOpening: (handle) => fakeOpeningRuntime(handle, { runNextStage }),
        createTurn: () => { throw new Error("Player runtime is outside this test."); },
      },
    });

    const firstState = application.loadState(CAMPAIGN_ID);
    expect(application.loadState(CAMPAIGN_ID)).toEqual(firstState);
    const setupHandle = openCampaignPlayDatabase(CAMPAIGN_ID);
    expect(setupHandle.sqlite.prepare(`SELECT COUNT(*) AS count FROM campaign_play_states
      WHERE campaign_id = ?`).get(CAMPAIGN_ID)).toEqual({ count: 1 });
    setupHandle.close();
    bootstrapPlayer(application);

    const request = openingRequest(application);
    const first = application.admitOpening(CAMPAIGN_ID, request);
    const replay = application.admitOpening(CAMPAIGN_ID, request);
    expect(replay).toEqual(first);
    await application.waitForIdle(CAMPAIGN_ID);
    expect(runNextStage).toHaveBeenCalledTimes(1);
    expect(application.loadState(CAMPAIGN_ID)).toMatchObject({
      phase: "opening_active",
      activeTurn: { turnId: first.turnId, status: "processing", progress: "interpreting" },
    });

    expect(() => application.admitOpening(CAMPAIGN_ID, {
      ...request,
      expectedRuntimeRevision: request.expectedRuntimeRevision + 1,
    })).toThrow(expect.objectContaining<Partial<CampaignPlayApplicationError>>({
      publicCode: "idempotency_conflict",
    }));
  });

  it("automatically resumes one provider interruption on a fresh epoch and preserves turn identity", async () => {
    createAcceptedCampaign();
    const runNextStage = vi.fn();
    const resumeStage = vi.fn();
    const application = createCampaignPlayApplication({
      now: () => 1_300,
      runtimeFactory: {
        createOpening: (handle) => fakeOpeningRuntime(handle, {
          runNextStage,
          resumeStage,
          interruptOnRun: true,
          resumeSucceeds: true,
        }),
        createTurn: () => { throw new Error("Player runtime is outside this test."); },
      },
    });
    application.loadState(CAMPAIGN_ID);
    bootstrapPlayer(application);
    const request = openingRequest(application, "opening-auto-provider-recovery");
    const admission = application.admitOpening(CAMPAIGN_ID, request);
    await application.waitForIdle(CAMPAIGN_ID);

    expect(resumeStage).toHaveBeenCalledTimes(1);
    expect(resumeStage).toHaveBeenCalledWith({
      turnId: admission.turnId,
      interruptedStage: "admitted",
      observedEpoch: 1,
    });
    expect(runNextStage).toHaveBeenCalledTimes(2);

    const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
    try {
      const repository = createCampaignPlayTurnRepository(handle);
      const turn = repository.loadTurn(admission.turnId)!;
      expect(turn).toMatchObject({
        turnId: admission.turnId,
        idempotencyKey: request.idempotencyKey,
        stage: "planned",
        workerEpoch: 2,
        resumeEligible: false,
      });
      const attempts = handle.sqlite.prepare(`SELECT attempt, status,
          worker_epoch AS workerEpoch, turn_id AS turnId, error_code AS errorCode
        FROM campaign_play_model_stages WHERE turn_id = ? ORDER BY attempt`).all(
        admission.turnId,
      );
      expect(attempts).toEqual([
        { attempt: 1, status: "interrupted", workerEpoch: 1, turnId: admission.turnId,
          errorCode: "provider_unavailable" },
        { attempt: 2, status: "accepted", workerEpoch: 2, turnId: admission.turnId,
          errorCode: null },
      ]);
      expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
        FROM campaign_play_receipts WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID, admission.turnId,
      )).toEqual({ count: 0 });
      expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
        FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID, admission.turnId,
      )).toEqual({ count: 0 });
      expect(handle.sqlite.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
      expect(handle.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      handle.close();
    }
  });

  it("carries Game Master recovery feedback through one automatic player-action resume and clears it", async () => {
    createAcceptedCampaign();
    const resumeFeedback: Array<CampaignPlayGameMasterRecoveryFeedback | undefined> = [];
    const createTurn = vi.fn((
      handle: CampaignPlayDatabaseHandle,
      _selection?: CampaignPlayTurnModelSelection,
      _judgeRecoveryFeedback?: unknown,
      _onJudgeRecoveryFeedback?: unknown,
      gameMasterRecoveryFeedback?: CampaignPlayGameMasterRecoveryFeedback,
      onGameMasterRecoveryFeedback?: (feedback: CampaignPlayGameMasterRecoveryFeedback) => void,
    ) => fakePlayerRuntime(handle, {
      gameMasterRecoveryFeedback,
      onGameMasterRecoveryFeedback,
      onResume: (input) => resumeFeedback.push(input.gameMasterRecoveryFeedback),
    }));
    const application = createCampaignPlayApplication({
      now: () => 1_300,
      runtimeFactory: {
        createOpening: (handle) => fakeOpeningRuntime(handle, { runNextStage: vi.fn() }),
        createTurn,
      },
    });
    application.loadState(CAMPAIGN_ID);
    bootstrapPlayer(application);
    markPlayerPhaseReady();
    const state = application.loadState(CAMPAIGN_ID);
    const admission = application.admitTurn(CAMPAIGN_ID, {
      source: "freeform",
      idempotencyKey: "player-gm-recovery-feedback",
      text: "Ask about the current signal.",
      expectedWorldVersion: state.worldVersion,
      expectedRuntimeRevision: state.runtimeRevision,
    });
    await application.waitForIdle(CAMPAIGN_ID);

    const playerTurnCalls = createTurn.mock.calls.filter((call) => call[1]?.turnKind === "player_action");
    expect(playerTurnCalls.map((call) => call[4])).toEqual([
      undefined,
      GAME_MASTER_RECOVERY_FEEDBACK,
      undefined,
    ]);
    expect(resumeFeedback).toEqual([GAME_MASTER_RECOVERY_FEEDBACK]);

    const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
    try {
      const repository = createCampaignPlayTurnRepository(handle);
      expect(repository.loadTurn(admission.turnId)).toMatchObject({
        turnId: admission.turnId,
        stage: "admitted",
        workerEpoch: 2,
        workerLeaseOwner: "application-gm-recovery-resume",
      });
      expect(handle.sqlite.prepare(`SELECT attempt, status, error_code AS errorCode
        FROM campaign_play_model_stages WHERE turn_id = ? ORDER BY attempt`).all(
        admission.turnId,
      )).toEqual([
        { attempt: 1, status: "interrupted", errorCode: "model_contract_invalid" },
        { attempt: 2, status: "started", errorCode: null },
      ]);
      expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
        FROM campaign_play_turn_results WHERE campaign_id = ? AND turn_id = ?`).get(
        CAMPAIGN_ID, admission.turnId,
      )).toEqual({ count: 0 });
    } finally {
      handle.close();
    }
  });

  it("stops after one automatic resume when the resumed provider attempt fails", async () => {
    createAcceptedCampaign();
    const runNextStage = vi.fn();
    const resumeStage = vi.fn();
    const application = createCampaignPlayApplication({
      now: () => 1_300,
      runtimeFactory: {
        createOpening: (handle) => fakeOpeningRuntime(handle, {
          runNextStage,
          resumeStage,
          interruptOnRun: true,
        }),
        createTurn: () => { throw new Error("Player runtime is outside this test."); },
      },
    });
    application.loadState(CAMPAIGN_ID);
    bootstrapPlayer(application);
    const request = openingRequest(application, "opening-auto-provider-failure");
    const admission = application.admitOpening(CAMPAIGN_ID, request);
    await application.waitForIdle(CAMPAIGN_ID);

    expect(resumeStage).toHaveBeenCalledTimes(1);
    expect(runNextStage).toHaveBeenCalledTimes(1);
    const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
    try {
      const repository = createCampaignPlayTurnRepository(handle);
      const turn = repository.loadTurn(admission.turnId)!;
      expect(turn).toMatchObject({
        stage: "interrupted",
        interruptedStage: "admitted",
        errorCode: "provider_unavailable",
        workerEpoch: 2,
        resumeEligible: true,
        idempotencyKey: request.idempotencyKey,
      });
      expect(handle.sqlite.prepare(`SELECT attempt, status, worker_epoch AS workerEpoch,
          turn_id AS turnId, error_code AS errorCode
        FROM campaign_play_model_stages WHERE turn_id = ? ORDER BY attempt`).all(
        admission.turnId,
      )).toEqual([
        { attempt: 1, status: "interrupted", workerEpoch: 1, turnId: admission.turnId,
          errorCode: "provider_unavailable" },
        { attempt: 2, status: "interrupted", workerEpoch: 2, turnId: admission.turnId,
          errorCode: "provider_unavailable" },
      ]);
      expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
        FROM campaign_play_model_stages WHERE turn_id = ?`).get(admission.turnId))
        .toEqual({ count: 2 });
    } finally {
      handle.close();
    }
  });

  it.each([
    "model_contract_invalid",
    "stage_timeout",
    "stage_budget_exceeded",
  ] as const)("does not automatically resume %s", async (errorCode) => {
    createAcceptedCampaign();
    const runNextStage = vi.fn();
    const resumeStage = vi.fn();
    const application = createCampaignPlayApplication({
      now: () => 1_300,
      runtimeFactory: {
        createOpening: (handle) => fakeOpeningRuntime(handle, {
          runNextStage,
          resumeStage,
          interruptOnRun: true,
          initialErrorCode: errorCode,
        }),
        createTurn: () => { throw new Error("Player runtime is outside this test."); },
      },
    });
    application.loadState(CAMPAIGN_ID);
    bootstrapPlayer(application);
    const admission = application.admitOpening(
      CAMPAIGN_ID,
      openingRequest(application, `opening-no-auto-${errorCode}`),
    );
    await application.waitForIdle(CAMPAIGN_ID);

    expect(resumeStage).not.toHaveBeenCalled();
    expect(runNextStage).toHaveBeenCalledTimes(1);
    const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
    try {
      const turn = createCampaignPlayTurnRepository(handle).loadTurn(admission.turnId)!;
      expect(turn).toMatchObject({
        stage: "interrupted",
        workerEpoch: 1,
        resumeEligible: true,
        errorCode,
      });
      expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
        FROM campaign_play_model_stages WHERE turn_id = ? AND attempt = 2`).get(
        admission.turnId,
      )).toEqual({ count: 0 });
    } finally {
      handle.close();
    }
  });

  it("preserves frozen model identity across restart and calls the provider once on explicit resume", async () => {
    createAcceptedCampaign();
    const firstRun = vi.fn();
    const firstApplication = createCampaignPlayApplication({
      now: () => 1_300,
      runtimeFactory: {
        createOpening: (handle) => fakeOpeningRuntime(handle, {
          runNextStage: firstRun,
          interruptOnRun: true,
          initialErrorCode: "model_contract_invalid",
        }),
        createTurn: () => { throw new Error("Player runtime is outside this test."); },
      },
    });
    firstApplication.loadState(CAMPAIGN_ID);
    bootstrapPlayer(firstApplication);
    const request = openingRequest(firstApplication, "opening-restart");
    const admission = firstApplication.admitOpening(CAMPAIGN_ID, request);
    await firstApplication.waitForIdle(CAMPAIGN_ID);

    const interruptedHandle = openCampaignPlayDatabase(CAMPAIGN_ID);
    const interrupted = createCampaignPlayTurnRepository(interruptedHandle)
      .loadTurn(admission.turnId)!;
    expect(interrupted).toMatchObject({
      stage: "interrupted",
      workerEpoch: 1,
      modelSelection: SELECTION,
    });
    interruptedHandle.close();

    const replayFactory = vi.fn(() => {
      throw new Error("Durable replay must not resolve current model settings.");
    });
    const replayApplication = createCampaignPlayApplication({
      now: () => 1_350,
      runtimeFactory: {
        createOpening: replayFactory,
        createTurn: () => { throw new Error("Player runtime is outside this test."); },
      },
    });
    expect(replayApplication.admitOpening(CAMPAIGN_ID, request)).toEqual(admission);
    await replayApplication.waitForIdle(CAMPAIGN_ID);
    expect(replayFactory).not.toHaveBeenCalled();

    const recoveredSelections: CampaignPlayTurnModelSelection[] = [];
    const resumeStage = vi.fn();
    const restarted = createCampaignPlayApplication({
      now: () => 1_400,
      runtimeFactory: {
        createOpening(handle, selection) {
          if (selection) recoveredSelections.push(selection);
          return fakeOpeningRuntime(handle, { runNextStage: vi.fn(), resumeStage });
        },
        createTurn: () => { throw new Error("Player runtime is outside this test."); },
      },
    });
    await restarted.recoverCampaign(CAMPAIGN_ID);
    expect(recoveredSelections).toEqual([SELECTION]);
    expect(resumeStage).not.toHaveBeenCalled();

    const state = restarted.loadState(CAMPAIGN_ID);
    restarted.resumeTurn(CAMPAIGN_ID, admission.turnId, {
      expectedWorldVersion: state.worldVersion,
      expectedRuntimeRevision: state.runtimeRevision,
    });
    await restarted.waitForIdle(CAMPAIGN_ID);
    expect(resumeStage).toHaveBeenCalledTimes(1);
    const resumedHandle = openCampaignPlayDatabase(CAMPAIGN_ID);
    expect(createCampaignPlayTurnRepository(resumedHandle).loadTurn(admission.turnId))
      .toMatchObject({ stage: "interrupted", workerEpoch: 2 });
    resumedHandle.close();
  });

  it("continues an unclaimed external stage once during startup recovery", async () => {
    createAcceptedCampaign();
    const firstApplication = createCampaignPlayApplication({
      now: () => 1_300,
      runtimeFactory: {
        createOpening: (handle) => fakeOpeningRuntime(handle, { runNextStage: vi.fn() }),
        createTurn: () => { throw new Error("Player runtime is outside this test."); },
      },
    });
    firstApplication.loadState(CAMPAIGN_ID);
    bootstrapPlayer(firstApplication);
    firstApplication.admitOpening(
      CAMPAIGN_ID,
      openingRequest(firstApplication, "opening-external-ready"),
    );
    await firstApplication.waitForIdle(CAMPAIGN_ID);

    const recoveredRun = vi.fn();
    const restarted = createCampaignPlayApplication({
      now: () => 1_400,
      runtimeFactory: {
        createOpening: (handle) => fakeOpeningRuntime(handle, { runNextStage: recoveredRun }),
        createTurn: () => { throw new Error("Player runtime is outside this test."); },
      },
    });

    await restarted.recoverCampaign(CAMPAIGN_ID);
    await restarted.waitForIdle(CAMPAIGN_ID);

    expect(recoveredRun).toHaveBeenCalledTimes(1);
  });

  it("closes an unclaimed player action at the shared control target during restart recovery", async () => {
    createAcceptedCampaign();
    let now = 1_300;
    const firstApplication = createCampaignPlayApplication({
      now: () => now,
      runtimeFactory: {
        createOpening: (handle) => fakeOpeningRuntime(handle, { runNextStage: vi.fn() }),
        createTurn: (handle) => {
          const runtime = fakePlayerRuntime(handle, {});
          const repository = createCampaignPlayTurnRepository(handle);
          runtime.runNextStage = async (turnId) => {
            const turn = repository.loadTurn(turnId)!;
            return {
              turn,
              recovery: repository.loadRecoveryState(turnId, now),
              telemetry: null,
            };
          };
          return runtime;
        },
      },
    });
    firstApplication.loadState(CAMPAIGN_ID);
    bootstrapPlayer(firstApplication);
    markPlayerPhaseReady();
    const state = firstApplication.loadState(CAMPAIGN_ID);
    const admission = firstApplication.admitTurn(CAMPAIGN_ID, {
      source: "freeform",
      idempotencyKey: "player-restart-control-target",
      text: "Ask about the current signal.",
      expectedWorldVersion: state.worldVersion,
      expectedRuntimeRevision: state.runtimeRevision,
    });
    await firstApplication.waitForIdle(CAMPAIGN_ID);

    now = 116_301;
    const continuity = vi.fn((turnId: string) => {
      const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
      try {
        return createCampaignPlayTurnRepository(handle).loadTurn(turnId)!;
      } finally {
        handle.close();
      }
    });
    const restarted = createCampaignPlayApplication({
      now: () => now,
      runtimeFactory: {
        createOpening: (handle) => fakeOpeningRuntime(handle, { runNextStage: vi.fn() }),
        createTurn: (handle) => {
          const runtime = fakePlayerRuntime(handle, {});
          runtime.commitControlBudgetContinuity = continuity;
          return runtime;
        },
      },
    });

    await restarted.recoverCampaign(CAMPAIGN_ID);

    expect(continuity).toHaveBeenCalledWith(admission.turnId, "control_deadline");
  });

  it("wakes startup recovery when a foreign deterministic lease reaches its durable expiry", async () => {
    createAcceptedCampaign();
    const firstApplication = createCampaignPlayApplication({
      now: () => 1_300,
      runtimeFactory: {
        createOpening: (handle) => fakeOpeningRuntime(handle, { runNextStage: vi.fn() }),
        createTurn: () => { throw new Error("Player runtime is outside this test."); },
      },
    });
    firstApplication.loadState(CAMPAIGN_ID);
    bootstrapPlayer(firstApplication);
    firstApplication.admitOpening(
      CAMPAIGN_ID,
      openingRequest(firstApplication, "opening-live-lease"),
    );
    await firstApplication.waitForIdle(CAMPAIGN_ID);

    let now = 1_400;
    let wakeup: (() => void) | null = null;
    const recoverActiveTurn = vi.fn(async () => {
      const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
      try {
        const turn = createCampaignPlayTurnRepository(handle).loadActiveTurn()!;
        if (recoverActiveTurn.mock.calls.length > 1) return null;
        return {
          turn,
          recovery: {
            kind: "deterministic_in_flight" as const,
            turnId: turn.turnId,
            token: {
              turnId: turn.turnId,
              stage: "admitted" as const,
              owner: "foreign-worker",
              epoch: turn.workerEpoch,
              expiresAt: 1_500,
            },
          },
          telemetry: null,
        };
      } finally {
        handle.close();
      }
    });
    const restarted = createCampaignPlayApplication({
      now: () => now,
      setTimer(callback, delayMilliseconds) {
        expect(delayMilliseconds).toBe(100);
        wakeup = callback;
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: vi.fn(),
      runtimeFactory: {
        createOpening: (handle) => ({
          ...fakeOpeningRuntime(handle, { runNextStage: vi.fn() }),
          recoverActiveTurn,
        }),
        createTurn: () => { throw new Error("Player runtime is outside this test."); },
      },
    });

    await restarted.recoverCampaign(CAMPAIGN_ID);
    expect(recoverActiveTurn).toHaveBeenCalledTimes(1);
    expect(wakeup).not.toBeNull();
    now = 1_500;
    wakeup!();
    await vi.waitFor(() => expect(recoverActiveTurn).toHaveBeenCalledTimes(2));
  });
});
