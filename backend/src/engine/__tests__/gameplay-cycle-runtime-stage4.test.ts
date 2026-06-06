import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, connectDb, getSqliteConnection } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { runCleanStage4Execution } from "../gameplay-cycle-runtime/stage4-execution.js";
import type {
  AuthoritativeSceneFrame,
  GmActionChecklist,
} from "../gameplay-cycle-runtime/contracts.js";

const CAMPAIGN_ID = "stage4-campaign";

let tempRoot = "";

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

describe("clean Stage 4 executor DB contracts", () => {
  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wf-stage4-"));
    connectDb(path.join(tempRoot, "state.db"));
    runMigrations();
    seedWorld();
  });

  afterEach(() => {
    closeDb();
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
});
