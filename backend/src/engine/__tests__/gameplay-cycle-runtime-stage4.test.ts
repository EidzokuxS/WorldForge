import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, connectDb, getSqliteConnection } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { buildAuthoritativeSceneFrame } from "../gameplay-cycle-runtime/frame.js";
import { runCleanStage4Execution } from "../gameplay-cycle-runtime/stage4-execution.js";
import type {
  AuthoritativeSceneFrame,
  GmActionChecklist,
} from "../gameplay-cycle-runtime/contracts.js";

const CAMPAIGN_ID = "stage4-campaign";

let tempRoot = "";
let previousCampaignRoot: string | undefined;

const CLEAN_SUPPORT_TAGS = [
  "temporary-support",
  "clean-runtime-support",
  "support-role:vendor",
  "current-scene",
  "minor-support",
  "reactive-only",
];

function exec(sql: string, ...values: unknown[]): void {
  getSqliteConnection().prepare(sql).run(...values);
}

function seedWorld(): void {
  const now = Date.now();
  exec(
    "INSERT INTO campaigns (id, name, premise, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    CAMPAIGN_ID,
    "Stage 4 Campaign",
    "A focused Stage 4 test campaign.",
    now,
    now,
  );
  exec(
    "INSERT INTO locations (id, campaign_id, name, description, kind, persistence, tags, is_starting, connected_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "loc-market",
    CAMPAIGN_ID,
    "Market",
    "A public market.",
    "macro",
    "persistent",
    "[]",
    1,
    JSON.stringify(["loc-north-hall"]),
  );
  exec(
    "INSERT INTO locations (id, campaign_id, name, description, kind, persistence, tags, is_starting, connected_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "loc-north-hall",
    CAMPAIGN_ID,
    "North Hall",
    "A connected hall.",
    "macro",
    "persistent",
    "[]",
    0,
    "[]",
  );
  exec(
    "INSERT INTO location_edges (id, campaign_id, from_location_id, to_location_id, travel_cost, discovered) VALUES (?, ?, ?, ?, ?, ?)",
    "edge-market-north-hall",
    CAMPAIGN_ID,
    "loc-market",
    "loc-north-hall",
    3,
    1,
  );
  exec(
    `INSERT INTO players (
      id,
      campaign_id,
      name,
      race,
      gender,
      age,
      appearance,
      hp,
      character_record,
      derived_tags,
      tags,
      equipped_items,
      current_location_id,
      current_scene_location_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "player-1",
    CAMPAIGN_ID,
    "Mira Voss",
    "Human",
    "Female",
    "32",
    "Focused.",
    5,
    "{}",
    "[]",
    "[]",
    "[]",
    "loc-market",
    "loc-market",
  );
  exec(
    "INSERT INTO world_clocks (campaign_id, world_version, world_time_minutes, current_tick, updated_at) VALUES (?, ?, ?, ?, ?)",
    CAMPAIGN_ID,
    0,
    0,
    0,
    now,
  );
}

function frame(): AuthoritativeSceneFrame {
  return {
    version: "scene-frame.v1",
    frameId: "frame-stage4-1",
    campaignId: CAMPAIGN_ID,
    turnId: "clean-turn-stage4-1",
    base: { tick: 0, worldVersion: 0, worldTimeMinutes: 0 },
    playerAction: "I walk from Market to North Hall.",
    player: {
      ref: "Player",
      label: "Mira Voss",
      visibleStatus: { hp: 5, conditions: [] },
    },
    scene: {
      currentLocation: { ref: "Market", label: "Market", description: null },
      currentScene: { ref: "Market", label: "Market", description: null },
      visibleFacts: [],
      recentLocalFacts: [],
    },
    actors: [],
    movementOptions: [{
      ref: "North Hall",
      label: "North Hall",
      connected: true,
      travelCost: 3,
    }],
    targets: [],
    inventory: [],
    capabilities: [
      { capabilityId: "route_check", evidenceAuthority: "receipt_required", allowed: true },
      { capabilityId: "movement", evidenceAuthority: "terminal_receipt_required", allowed: true },
    ],
    citableRefs: ["Player", "Market", "North Hall"],
    privateGuards: {
      forbiddenActorLabels: [],
      forbiddenPrivateTerms: [],
    },
    forecast: {
      version: "scoped-forecast.v1",
      advisoryOnly: true,
      sourceStatus: "empty_missing",
      mayAuthorizeMutation: false,
      maySupportNarrationClaim: false,
      entries: [],
      forbiddenPrivateTerms: [],
    },
  };
}

function checklist(inputFrame = frame()): GmActionChecklist {
  return {
    version: "gm-action-checklist.v1",
    checklistId: "gm-action-checklist-stage4-1",
    campaignId: inputFrame.campaignId,
    turnId: inputFrame.turnId,
    frameId: inputFrame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      gmReadPath: "procedural",
      judgmentId: "judge-stage4-1",
      judgeCheckNeed: "backend_action_plan_needed",
      judgeNextStep: "action_plan",
      judgeNoRollReasonCode: "backend_receipt_required",
    },
    base: inputFrame.base,
    turnIntent: {
      playerIntent: "Move to North Hall.",
      admittedConsequenceNeed: "Movement needs backend receipt authority.",
    },
    steps: [{
      stepId: "step-1",
      purpose: "Resolve movement through Stage 4.",
      actorRef: "Player",
      targetRefs: ["North Hall"],
      evidenceRefs: ["Player", "North Hall"],
      intended: {
        kind: "movement",
        stateOrEvidence: "state",
        requiredCapabilityId: "movement",
        summary: "Move the player to North Hall if the backend accepts the route.",
      },
      disposition: {
        kind: "stage4_backend_resolution_required",
        reason: "Movement requires a terminal backend receipt.",
      },
      dependsOnStepIds: [],
      expectedVisibleEffect: {
        summary: "The player may arrive at North Hall only after accepted receipt.",
        visibleRefs: ["Player", "North Hall"],
      },
    }],
    authority: {
      evidenceAuthority: "planning_only",
      mutationAuthority: "none",
      mayAuthorizeMutation: false,
      mayGenerateExecutableRequest: false,
      maySupportNarrationClaim: false,
      settledTruth: false,
      publicExposure: "stage_summary_only",
    },
  };
}

function checklistForKind(
  kind: GmActionChecklist["steps"][number]["intended"]["kind"],
  inputFrame = frame(),
): GmActionChecklist {
  const base = checklist(inputFrame);
  const capability = kind === "observe_visible"
    ? "observe_visible"
    : kind === "route_options"
      ? "route_options"
      : kind === "time_advance"
        ? "time_advance"
        : kind === "scene_beat_record"
          ? "scene_beat_record"
          : kind === "dialogue_record"
            ? "dialogue_record"
            : kind === "support_actor_create"
              ? "support_actor_create"
              : base.steps[0].intended.requiredCapabilityId;
  return {
    ...base,
    steps: [{
      ...base.steps[0],
      targetRefs: kind === "movement" ? ["North Hall"] : kind === "dialogue_record" ? ["Guide"] : ["Market"],
      evidenceRefs: kind === "dialogue_record" ? ["Player", "Guide", "Market"] : ["Player", "Market"],
      intended: {
        ...base.steps[0].intended,
        kind,
        requiredCapabilityId: capability,
        stateOrEvidence: kind === "time_advance" || kind === "movement" || kind === "support_actor_create"
          ? "state"
          : kind === "dialogue_record"
            ? "terminal_player_visible"
            : "evidence",
        summary: kind === "support_actor_create"
          ? "Stage 4 may materialize one ordinary temporary current-scene support actor with roleKind=vendor; requested role text: local vendor."
          : base.steps[0].intended.summary,
      },
      expectedVisibleEffect: {
        summary: `${kind} may be visible only after accepted receipt.`,
        visibleRefs: kind === "dialogue_record" ? ["Player", "Guide"] : ["Player", "Market"],
      },
    }],
  };
}

function supportActorEffect(roleKind: "vendor" | "guide" = "vendor") {
  return {
    kind: "support_actor_create" as const,
    authorityKind: "ordinary_current_scene_support_actor" as const,
    anchorScope: "current_scene" as const,
    anchorRef: "Market",
    roleKind,
    roleLabel: roleKind,
    publicPresentation: {
      publicSummary: `An ordinary local ${roleKind} is available in the market.`,
      visibleCue: `The local ${roleKind} is close enough to be visible.`,
      voiceHint: null,
    },
    identityBounds: {
      tier: "temporary" as const,
      persistence: "current_scene" as const,
      significance: "minor_support" as const,
      agency: "reactive_only" as const,
      mayBecomePersistentHere: false as const,
    },
    reusePolicy: "reuse_matching_temporary_current_scene_or_create" as const,
    reason: `The player requested an ordinary local ${roleKind}.`,
    evidenceRefs: ["Player", "Market"],
    forbiddenPayloads: {
      dialogueContent: false as const,
      worldFact: false as const,
      relationship: false as const,
      itemState: false as const,
      routeTruth: false as const,
      futureRelevance: false as const,
      privateKnowledge: false as const,
    },
  };
}

function insertNpc(input: {
  id: string;
  name: string;
  tier?: "temporary" | "persistent" | "key";
  locationId?: string | null;
  sceneLocationId?: string | null;
  tags?: string[];
  persona?: string;
}): void {
  const tags = input.tags ?? [];
  exec(
    `INSERT INTO npcs (
      id, campaign_id, name, persona, character_record, derived_tags, tags, tier,
      current_location_id, current_scene_location_id, goals, beliefs, unprocessed_importance, inactive_ticks, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.id,
    CAMPAIGN_ID,
    input.name,
    input.persona ?? `${input.name} persona.`,
    "{}",
    JSON.stringify(tags),
    JSON.stringify(tags),
    input.tier ?? "temporary",
    input.locationId ?? "loc-market",
    input.sceneLocationId ?? "loc-market",
    JSON.stringify({ short_term: [], long_term: [] }),
    "[]",
    0,
    0,
    Date.now(),
  );
}

async function runVendorSupportActorCreate(inputFrame = {
  ...frame(),
  playerAction: "I look for a local vendor in the market.",
  capabilities: [
    ...frame().capabilities,
    { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
  ],
  citableRefs: ["Player", "Market", "North Hall"],
}): Promise<Awaited<ReturnType<typeof runCleanStage4Execution>>> {
  return runCleanStage4Execution({
    frame: inputFrame,
    checklist: checklistForKind("support_actor_create", inputFrame),
    generateSupportActorRequest: async () => supportActorEffect("vendor"),
  });
}

describe("clean Stage 4 executor DB contracts", () => {
  beforeEach(() => {
    previousCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wf-stage4-"));
    process.env.GSD_CAMPAIGNS_ROOT = tempRoot;
    const campaignDir = path.join(tempRoot, CAMPAIGN_ID);
    fs.mkdirSync(campaignDir, { recursive: true });
    fs.writeFileSync(path.join(campaignDir, "config.json"), JSON.stringify({
      name: "Stage 4 Campaign",
      premise: "A focused Stage 4 test campaign.",
      generationComplete: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, null, 2));
    connectDb(path.join(tempRoot, "state.db"));
    runMigrations();
    seedWorld();
  });

  afterEach(() => {
    closeDb();
    if (previousCampaignRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
    else process.env.GSD_CAMPAIGNS_ROOT = previousCampaignRoot;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("applies accepted movement and persists clean receipt authority transactionally", async () => {
    const inputFrame = frame();
    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklist(inputFrame),
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.mutationApplied).toBe(true);
    expect(result.publicEvents).toEqual([{
      type: "state_update",
      data: {
        type: "location_change",
        locationName: "North Hall",
        travelCost: 3,
        path: ["Market", "North Hall"],
      },
    }]);

    const player = getSqliteConnection()
      .prepare("SELECT current_location_id AS currentLocationId, current_scene_location_id AS currentSceneLocationId FROM players WHERE id = ?")
      .get("player-1") as { currentLocationId: string; currentSceneLocationId: string };
    expect(player).toEqual({
      currentLocationId: "loc-north-hall",
      currentSceneLocationId: "loc-north-hall",
    });

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 1, worldTimeMinutes: 3, currentTick: 3 });

    const receiptCount = getSqliteConnection()
      .prepare("SELECT COUNT(*) AS count FROM clean_gameplay_stage4_receipts WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { count: number };
    expect(receiptCount.count).toBe(1);

    const authority = getSqliteConnection()
      .prepare("SELECT operation, result_world_version AS resultWorldVersion FROM authority_traces WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { operation: string; resultWorldVersion: number };
    expect(authority).toEqual({
      operation: "gameplay-cycle-runtime.player.move.v1",
      resultWorldVersion: 1,
    });

    const ledger = getSqliteConnection()
      .prepare("SELECT reason_kind AS reasonKind, delta_minutes AS deltaMinutes, result_world_time_minutes AS resultWorldTimeMinutes FROM turn_clock_ledger WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { reasonKind: string; deltaMinutes: number; resultWorldTimeMinutes: number };
    expect(ledger).toEqual({
      reasonKind: "travel",
      deltaMinutes: 3,
      resultWorldTimeMinutes: 3,
    });
  });

  it("applies accepted time advance as world-clock-only mutation", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I wait here for a few minutes.",
    };
    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("time_advance", inputFrame),
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.mutationApplied).toBe(true);
    expect(result.publicEvents).toEqual([{
      type: "state_update",
      data: {
        type: "time_advance",
        elapsedMinutes: 5,
        reasonKind: "wait",
      },
    }]);
    const receipt = result.execution?.receipts[0];
    expect(receipt).toMatchObject({
      capabilityId: "time_advance",
      status: "accepted",
      authority: {
        evidenceAuthority: "terminal_mutation_receipt",
        mutationAuthority: "world_clock_only",
        visibleResultAuthority: "may_claim_elapsed_time",
      },
      publicResult: {
        timeAdvance: {
          type: "time_advance",
          elapsedMinutes: 5,
          reasonKind: "wait",
        },
      },
    });

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 1, worldTimeMinutes: 5, currentTick: 5 });
    const ledger = getSqliteConnection()
      .prepare("SELECT reason_kind AS reasonKind, delta_minutes AS deltaMinutes FROM turn_clock_ledger WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { reasonKind: string; deltaMinutes: number };
    expect(ledger).toEqual({ reasonKind: "wait", deltaMinutes: 5 });
  });

  it("accepts observation and route-options receipts without mutating world clock", async () => {
    const inputFrame = {
      ...frame(),
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support" as const,
        visibleStatus: { hp: null, conditions: [] },
      }],
      scene: {
        ...frame().scene,
        visibleFacts: [{
          factId: "fact-market",
          summary: "Lanterns burn along the market stalls.",
          source: "Market",
          tick: 0,
        }],
      },
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "observe_visible" as const, evidenceAuthority: "observation_only" as const, allowed: true },
        { capabilityId: "route_options" as const, evidenceAuthority: "observation_only" as const, allowed: true },
      ],
    };

    const observation = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("observe_visible", inputFrame),
    });
    expect(observation.execution?.receipts[0]).toMatchObject({
      capabilityId: "observe_visible",
      status: "accepted",
      authority: {
        evidenceAuthority: "scene_observation_receipt",
        mutationAuthority: "none",
      },
    });
    expect(observation.execution?.receipts[0]?.publicResult.visibleObservation).toMatchObject({
      currentScene: "Market",
      visibleActors: ["Guide"],
      visibleFacts: ["Lanterns burn along the market stalls."],
    });

    const routeFrame = {
      ...inputFrame,
      frameId: "frame-stage4-routes",
      turnId: "clean-turn-stage4-routes",
    };
    const routes = await runCleanStage4Execution({
      frame: routeFrame,
      checklist: checklistForKind("route_options", routeFrame),
    });
    expect(routes.execution?.receipts[0]).toMatchObject({
      capabilityId: "route_options",
      status: "accepted",
      authority: {
        evidenceAuthority: "route_options_receipt",
        mutationAuthority: "none",
      },
    });
    expect(routes.execution?.receipts[0]?.publicResult.routeOptions?.options).toEqual([{
      label: "North Hall",
      connected: true,
      travelCost: 3,
    }]);

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });
  });

  it("accepts existing-visible actor dialogue as terminal non-mutating evidence", async () => {
    const longQuote = `The north stairs flooded before dawn. ${Array.from({ length: 70 }, () => "water").join(" ")}`.slice(0, 480);
    const longSummary = `Guide gives a long visible answer about the north stairs. ${Array.from({ length: 70 }, () => "detail").join(" ")}`.slice(0, 480);
    const inputFrame = {
      ...frame(),
      playerAction: "I ask Guide what happened here.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support" as const,
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [{ ref: "Guide", label: "Guide", kind: "actor" as const }],
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "dialogue_record" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("dialogue_record", inputFrame),
      generateDialogueRequest: async () => ({
        kind: "dialogue_record",
        authorityKind: "existing_visible_actor",
        speakerRef: "Guide",
        addresseeRefs: ["Player"],
        outcomeKind: "answer",
        response: {
          kind: "speech",
          quotedSpeech: longQuote,
          summary: longSummary,
        },
        languageBasis: {
          responseLanguage: "match_player_action",
          source: "turn_language_profile",
        },
        evidenceRefs: ["Player", "Guide", "Market"],
        stateEffects: {
          appliesState: false,
        },
      }),
    });

    expect(result.status).toBe("executed");
    expect(result.publicEvents).toEqual([]);
    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "dialogue_record",
      status: "accepted",
      result: { tick: 0, worldVersion: 0, worldTimeMinutes: 0, mutationApplied: false },
      authority: {
        evidenceAuthority: "terminal_dialogue_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_quote_visible_dialogue_response",
      },
      publicResult: {
        dialogue: {
          type: "dialogue_response",
          speakerLabel: "Guide",
          quotedSpeech: longQuote,
          summary: longSummary,
          claimStatus: "visible_speaker_response_only",
        },
      },
    });
    expect(result.execution?.receipts[0]?.publicResult.summary).toBe("Guide dialogue response recorded (answer).");
    expect((result.execution?.receipts[0]?.publicResult.summary ?? "").length).toBeLessThanOrEqual(500);

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });

    const sideEffects = {
      traces: (getSqliteConnection().prepare("SELECT COUNT(*) AS count FROM authority_traces WHERE campaign_id = ?").get(CAMPAIGN_ID) as { count: number }).count,
      ledger: (getSqliteConnection().prepare("SELECT COUNT(*) AS count FROM turn_clock_ledger WHERE campaign_id = ?").get(CAMPAIGN_ID) as { count: number }).count,
    };
    expect(sideEffects).toEqual({ traces: 0, ledger: 0 });
  });

  it("creates a temporary current-scene support actor with materialization receipt authority", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I look for a local vendor in the market.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
    });

    expect(result.status).toBe("executed");
    expect(result.publicEvents).toEqual([]);
    expect(result.execution?.mutationApplied).toBe(true);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "support_actor_create",
      status: "accepted",
      result: { tick: 0, worldVersion: 1, worldTimeMinutes: 0, mutationApplied: true },
      authority: {
        evidenceAuthority: "support_actor_materialization_receipt",
        mutationAuthority: "current_scene_support_actor",
        visibleResultAuthority: "may_claim_visible_support_actor_materialized",
        mayAuthorizeMutation: true,
      },
      publicResult: {
        supportActor: {
          type: "support_actor_materialization",
          resultKind: "created",
          actorRef: "Local Vendor",
          actorLabel: "Local Vendor",
          roleKind: "vendor",
          roleLabel: "vendor",
          anchorSceneLabel: "Market",
          anchorLocationLabel: "Market",
          claimStatus: "visible_support_actor_materialization_only",
        },
      },
    });

    const npc = getSqliteConnection()
      .prepare("SELECT name, tier, current_location_id AS currentLocationId, current_scene_location_id AS currentSceneLocationId, tags FROM npcs WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { name: string; tier: string; currentLocationId: string; currentSceneLocationId: string; tags: string };
    expect(npc).toMatchObject({
      name: "Local Vendor",
      tier: "temporary",
      currentLocationId: "loc-market",
      currentSceneLocationId: "loc-market",
    });
    expect(JSON.parse(npc.tags)).toEqual(expect.arrayContaining([
      "temporary-support",
      "clean-runtime-support",
      "support-role:vendor",
      "current-scene",
      "minor-support",
      "reactive-only",
    ]));

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 1, worldTimeMinutes: 0, currentTick: 0 });

    const authority = getSqliteConnection()
      .prepare(`
        SELECT
          operation,
          source_entity_type AS sourceEntityType,
          source_entity_id AS sourceEntityId,
          result_world_version AS resultWorldVersion,
          elapsed_world_time_minutes AS elapsedMinutes,
          state_delta_refs AS stateDeltaRefs,
          witnesses,
          metadata
        FROM authority_traces
        WHERE campaign_id = ?
      `)
      .get(CAMPAIGN_ID) as {
        operation: string;
        sourceEntityType: string;
        sourceEntityId: string;
        resultWorldVersion: number;
        elapsedMinutes: number;
        stateDeltaRefs: string;
        witnesses: string;
        metadata: string;
      };
    expect(authority).toMatchObject({
      operation: "gameplay-cycle-runtime.support_actor.materialize.v1",
      sourceEntityType: "npc",
      resultWorldVersion: 1,
      elapsedMinutes: 0,
    });
    expect(authority.sourceEntityId).toMatch(/^stage4-support-actor-/u);
    expect(JSON.parse(authority.stateDeltaRefs)).toEqual([
      `npc:${authority.sourceEntityId}:created`,
      "scene:loc-market:support_actors",
    ]);
    expect(JSON.parse(authority.witnesses)).toEqual(["Player", "Market"]);
    expect(JSON.parse(authority.metadata)).toMatchObject({
      checklistId: "gm-action-checklist-stage4-1",
      stepId: "step-1",
      capabilityId: "support_actor_create",
      roleKind: "vendor",
      roleLabel: "vendor",
      anchorScope: "current_scene",
      resultKind: "created",
    });
    const ledgerCount = getSqliteConnection()
      .prepare("SELECT COUNT(*) AS count FROM turn_clock_ledger WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { count: number };
    expect(ledgerCount.count).toBe(0);

    const refreshed = await buildAuthoritativeSceneFrame({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: CAMPAIGN_ID,
      turnId: "clean-turn-stage4-next",
      idempotencyKey: "next-frame-proof",
      playerAction: {
        submitted: "I look at the vendor.",
        normalized: "I look at the vendor.",
        source: "typed",
      },
      base: {
        tick: 0,
        worldVersion: 1,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: path.join(tempRoot, "snapshot-next"),
          capturedAt: Date.now(),
        },
      },
      providers: {
        judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
        storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      },
    });
    expect(refreshed.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Local Vendor" }),
    ]));
    expect(refreshed.citableRefs).toContain("Local Vendor");
  });

  it("reuses the exact matching temporary current-scene support actor without mutation", async () => {
    insertNpc({
      id: "npc-existing-vendor",
      name: "Local Vendor",
      tags: CLEAN_SUPPORT_TAGS,
      persona: "An ordinary local vendor is already visible.",
    });
    const inputFrame = {
      ...frame(),
      playerAction: "I look for a local vendor in the market.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
    });

    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "support_actor_create",
      status: "accepted",
      result: { tick: 0, worldVersion: 0, worldTimeMinutes: 0, mutationApplied: false },
      authority: {
        evidenceAuthority: "support_actor_materialization_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_claim_visible_support_actor_materialized",
        mayAuthorizeMutation: false,
      },
      publicResult: {
        supportActor: {
          resultKind: "reused",
          actorLabel: "Local Vendor",
          roleKind: "vendor",
        },
      },
    });

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 1, traceCount: 0, worldVersion: 0 });
  });

  it("reuses the sole same-scene temporary support actor for the role even when its label differs", async () => {
    insertNpc({
      id: "npc-existing-bazaar-vendor",
      name: "Bazaar Vendor",
      tags: CLEAN_SUPPORT_TAGS,
      persona: "A clean temporary vendor is already available in the scene.",
    });
    const inputFrame = {
      ...frame(),
      playerAction: "I look for a local vendor in the market.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
    });

    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "support_actor_create",
      status: "accepted",
      publicResult: {
        supportActor: {
          resultKind: "reused",
          actorRef: "Bazaar Vendor",
          actorLabel: "Bazaar Vendor",
          roleKind: "vendor",
        },
      },
      privateResult: {
        supportActorId: "npc-existing-bazaar-vendor",
        supportActorOperation: "reused",
      },
    });

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 1, traceCount: 0, worldVersion: 0 });
  });

  it("fails support actor materialization when same-role same-scene temporary support actors are ambiguous", async () => {
    insertNpc({ id: "npc-vendor-a", name: "Bazaar Vendor", tags: CLEAN_SUPPORT_TAGS });
    insertNpc({ id: "npc-vendor-b", name: "Market Vendor", tags: CLEAN_SUPPORT_TAGS });
    const inputFrame = {
      ...frame(),
      playerAction: "I look for a local vendor in the market.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
    });

    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "support_actor_create",
      status: "failed",
      failure: {
        kind: "insufficient_grounding",
        hiddenMutationApplied: false,
      },
    });

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 2, traceCount: 0, worldVersion: 0 });
  });

  it("fails support actor materialization on non-reusable same-label collision without hidden mutation", async () => {
    insertNpc({
      id: "npc-persistent-vendor",
      name: "Local Vendor",
      tier: "persistent",
      tags: [],
      persona: "A persistent vendor with the same label already exists.",
    });
    const inputFrame = {
      ...frame(),
      playerAction: "I look for a local vendor in the market.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
    });

    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "support_actor_create",
      status: "failed",
      authority: {
        evidenceAuthority: "failure_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "failure_only",
      },
      failure: {
        kind: "insufficient_grounding",
        hiddenMutationApplied: false,
      },
    });
    expect(result.execution?.receipts[0]?.failure?.message).not.toContain("persistent");

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 1, traceCount: 0, worldVersion: 0 });
  });

  it("fails hidden sibling-scene support actor collision without exposing the hidden row", async () => {
    exec(
      "INSERT INTO locations (id, campaign_id, name, description, kind, persistence, tags, is_starting, connected_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "loc-side-stall",
      CAMPAIGN_ID,
      "Side Stall",
      "A sibling scene.",
      "micro",
      "temporary",
      "[]",
      0,
      "[]",
    );
    insertNpc({
      id: "npc-hidden-sibling-vendor",
      name: "Local Vendor",
      tags: [...CLEAN_SUPPORT_TAGS, "hidden"],
      sceneLocationId: "loc-side-stall",
      persona: "Hidden sibling vendor private payload.",
    });

    const result = await runVendorSupportActorCreate();

    expect(result.execution?.mutationApplied).toBe(false);
    const receipt = result.execution?.receipts[0];
    expect(receipt).toMatchObject({
      capabilityId: "support_actor_create",
      status: "failed",
      failure: {
        kind: "insufficient_grounding",
        hiddenMutationApplied: false,
      },
    });
    expect(JSON.stringify(receipt)).not.toContain("npc-hidden-sibling-vendor");
    expect(JSON.stringify(receipt)).not.toContain("Hidden sibling vendor");

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 1, traceCount: 0, worldVersion: 0 });
  });

  it("fails broad-location hidden support actor collision without exposing the hidden row", async () => {
    insertNpc({
      id: "npc-hidden-broad-vendor",
      name: "Local Vendor",
      tags: [...CLEAN_SUPPORT_TAGS, "secret"],
      sceneLocationId: null,
      persona: "Hidden broad-location vendor private payload.",
    });

    const result = await runVendorSupportActorCreate();

    expect(result.execution?.mutationApplied).toBe(false);
    const receipt = result.execution?.receipts[0];
    expect(receipt).toMatchObject({
      capabilityId: "support_actor_create",
      status: "failed",
      failure: {
        kind: "insufficient_grounding",
        hiddenMutationApplied: false,
      },
    });
    expect(JSON.stringify(receipt)).not.toContain("npc-hidden-broad-vendor");
    expect(JSON.stringify(receipt)).not.toContain("Hidden broad-location vendor");

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 1, traceCount: 0, worldVersion: 0 });
  });

  it("accepts scene-beat receipts as non-mutating visible acknowledgement", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I nod to the market crowd without leaving.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support" as const,
        visibleStatus: { hp: null, conditions: [] },
      }],
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "scene_beat_record" as const, evidenceAuthority: "observation_only" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("scene_beat_record", inputFrame),
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.publicEvents).toEqual([]);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "scene_beat_record",
      status: "accepted",
      authority: {
        evidenceAuthority: "scene_beat_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_acknowledge_scene_beat",
      },
      publicResult: {
        sceneBeat: {
          beatKind: "generic_scene_beat",
        },
      },
    });

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });
  });
});
