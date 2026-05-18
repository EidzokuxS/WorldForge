import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  authorityTraces,
  campaigns,
  chronicle,
  npcs,
  players,
  worldClocks,
} from "../../db/schema.js";
import type { ToolExecutionContext } from "../tool-execution-context.js";
import {
  applySuccessfulToolObservationToExecutionContext,
} from "../tool-execution-context.js";
import { executeToolCall } from "../tool-executor.js";
import { closeVectorDb, openVectorDb } from "../../vectors/connection.js";

const CAMPAIGN_ID = "tool-authority-campaign";

let tempDir = "";
let previousCampaignsRoot: string | undefined;

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Tool Authority",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

function createAuthorityContext(baseWorldVersion: number): ToolExecutionContext {
  return {
    scope: "player_turn",
    subjectActorId: "player-1",
    subjectActorRefs: new Set(["player-1", "player"]),
    authority: {
      baseWorldVersion,
      sourceEntity: { type: "player", id: "player-1" },
      elapsedWorldTimeMinutes: 1,
    },
    currentLocationId: null,
    currentSceneScopeId: null,
    legalLocationRefs: new Set(),
    legalActorRefs: new Set(),
    legalItemRefs: new Set(),
    legalFactionRefs: new Set(),
    currentLocationRefs: new Set(),
    currentSceneRefs: new Set(),
    legalMovementRefs: new Set(),
  };
}

function createBackgroundChronicleContext(baseWorldVersion: number): ToolExecutionContext {
  const context = createAuthorityContext(baseWorldVersion);
  context.scope = "background";
  context.authority = {
    baseWorldVersion,
    sourceEntity: { type: "system", id: "chronicle-projection" },
    elapsedWorldTimeMinutes: 1,
    allowedWriteScopes: ["*"],
  };
  return context;
}

describe("executeToolCall authority bridge", () => {
  beforeEach(async () => {
    previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-tool-authority-"));
    process.env.GSD_CAMPAIGNS_ROOT = tempDir;
    fs.mkdirSync(path.join(tempDir, CAMPAIGN_ID), { recursive: true });
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
    await openVectorDb(CAMPAIGN_ID);
  });

  afterEach(() => {
    closeVectorDb();
    closeDb();
    if (previousCampaignsRoot === undefined) {
      delete process.env.GSD_CAMPAIGNS_ROOT;
    } else {
      process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("commits a state-bearing tool result with authority metadata and advances context base", async () => {
    const context = createBackgroundChronicleContext(0);

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "The bell rang once." },
      3,
      undefined,
      context,
    );

    expect(result.success).toBe(true);
    expect(result.authority).toMatchObject({
      campaignId: CAMPAIGN_ID,
      baseWorldVersion: 0,
      resultWorldVersion: 1,
      worldTimeMinutes: 4,
      stateDeltaRefs: expect.arrayContaining([expect.any(String), "world:event"]),
    });
    expect(
      getDb()
        .select()
        .from(chronicle)
        .where(eq(chronicle.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(1);
    expect(
      getDb()
        .select()
        .from(authorityTraces)
        .where(eq(authorityTraces.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(1);

    applySuccessfulToolObservationToExecutionContext({
      toolName: "add_chronicle_entry",
      result,
      context,
    });
    expect(context.authority?.baseWorldVersion).toBe(1);
  });

  it("rejects player-turn chronicle entries before inserting rows", async () => {
    const context = createAuthorityContext(0);

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "The player model tries to author the chronicle." },
      3,
      undefined,
      context,
    );

    expect(result.success).toBe(false);
    expect(result.contractFailure).toMatchObject({
      code: "unsupported_tool_owner",
      toolName: "add_chronicle_entry",
    });
    expect(
      getDb()
        .select()
        .from(chronicle)
        .where(eq(chronicle.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(0);
  });

  it("rejects state-bearing tools when a runtime context has no authority", async () => {
    const context = createAuthorityContext(0);
    delete context.authority;

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "This should not be written." },
      3,
      undefined,
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("requires execution authority");
    expect(
      getDb()
        .select()
        .from(chronicle)
        .where(eq(chronicle.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(0);
  });

  it("rejects state-bearing tools when direct callers omit execution context", async () => {
    const result = await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "This direct call should not be written." },
      3,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("requires execution authority");
    expect(result.error).toContain("legacy_unscoped");
    expect(
      getDb()
        .select()
        .from(chronicle)
        .where(eq(chronicle.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(0);
  });

  it("validates runtime tool schemas for direct executor calls before mutation", async () => {
    const result = await executeToolCall(
      CAMPAIGN_ID,
      "advance_time",
      { minutes: "60", reason: "This bypasses the SDK schema." },
      3,
      undefined,
      createAuthorityContext(0),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Tool schema validation failed for advance_time");
    expect(
      getDb()
        .select()
        .from(worldClocks)
        .where(eq(worldClocks.campaignId, CAMPAIGN_ID))
        .get(),
    ).toBeUndefined();
  });

  it("rejects background state-bearing tools without declared write scopes", async () => {
    const context = createAuthorityContext(0);
    context.scope = "background";
    context.authority = {
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test-background" },
      elapsedWorldTimeMinutes: 0,
    };

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "This background event has no write scope." },
      3,
      undefined,
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("requires non-empty allowedWriteScopes");
    expect(
      getDb()
        .select()
        .from(chronicle)
        .where(eq(chronicle.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(0);
  });

  it("rejects stale authoritative tools before the handler mutates state", async () => {
    await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "The first entry." },
      3,
      undefined,
      createBackgroundChronicleContext(0),
    );

    const staleResult = await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "This must not be inserted." },
      4,
      undefined,
      createBackgroundChronicleContext(0),
    );

    expect(staleResult.success).toBe(false);
    expect(staleResult.status).toBe("failure");
    expect(staleResult.authority).toMatchObject({
      baseWorldVersion: 0,
      failureReason: expect.stringContaining("Stale world version"),
    });
    expect(
      getDb()
        .select()
        .from(chronicle)
        .where(eq(chronicle.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(1);
    expect(
      getDb()
        .select()
        .from(authorityTraces)
        .where(eq(authorityTraces.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(1);
    expect(
      getDb()
        .select()
        .from(worldClocks)
        .where(eq(worldClocks.campaignId, CAMPAIGN_ID))
      .get(),
    ).toMatchObject({ worldVersion: 1 });
  });

  it("lets the GM advance in-world time without backend text parsing", async () => {
    const context = createAuthorityContext(0);

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "advance_time",
      {
        minutes: 60,
        reason: "The player explicitly spends an hour watching canal traffic.",
      },
      0,
      undefined,
      context,
    );

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      minutes: 60,
      clockAdvanced: true,
    });
    expect(result.authority).toMatchObject({
      campaignId: CAMPAIGN_ID,
      baseWorldVersion: 0,
      resultWorldVersion: 1,
      worldTimeMinutes: 60,
      elapsedWorldTimeMinutes: 60,
      stateDeltaRefs: expect.arrayContaining(["world_time", "elapsed:60"]),
    });

    applySuccessfulToolObservationToExecutionContext({
      toolName: "advance_time",
      result,
      context,
    });
    expect(context.authority?.baseWorldVersion).toBe(1);
    expect(context.authority?.elapsedWorldTimeMinutes).toBe(0);
    context.legalActorRefs.add("player");

    const followupResult = await executeToolCall(
      CAMPAIGN_ID,
      "log_event",
      {
        text: "The hour matters later.",
        importance: 5,
        participants: ["player"],
        durability: "durable",
        futureRelevance: "The elapsed hour should affect later trust checks.",
      },
      0,
      undefined,
      context,
    );

    expect(followupResult.success).toBe(true);
    expect(followupResult.authority).toMatchObject({
      baseWorldVersion: 1,
      worldTimeMinutes: 60,
      elapsedWorldTimeMinutes: 0,
    });
  });

  it("records player HP mutations under player state scope, not npc scope", async () => {
    getDb().insert(players).values({
      id: "player-1",
      campaignId: CAMPAIGN_ID,
      name: "Iria",
      hp: 5,
      tags: "[]",
    }).run();
    const context = createAuthorityContext(0);
    context.authority = {
      ...context.authority!,
      allowedWriteScopes: ["player:player-1:state"],
    };
    context.legalActorRefs = new Set(["iria", "player-1", "player"]);
    context.subjectActorRefs = new Set(["iria", "player-1", "player"]);

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "set_condition",
      { targetName: "Iria", delta: -2 },
      3,
      undefined,
      context,
    );

    expect(result.success).toBe(true);
    expect(result.authority?.stateDeltaRefs).toEqual(
      expect.arrayContaining(["player:player-1:state"]),
    );
    expect(result.authority?.stateDeltaRefs).not.toContain("npc:Iria");
  });

  it("rejects player HP mutations declared under npc write scope", async () => {
    getDb().insert(players).values({
      id: "player-1",
      campaignId: CAMPAIGN_ID,
      name: "Iria",
      hp: 5,
      tags: "[]",
    }).run();
    const context = createAuthorityContext(0);
    context.authority = {
      ...context.authority!,
      allowedWriteScopes: ["npc:player-1:state"],
    };
    context.legalActorRefs = new Set(["iria", "player-1", "player"]);
    context.subjectActorRefs = new Set(["iria", "player-1", "player"]);

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "set_condition",
      { targetName: "Iria", delta: -2 },
      3,
      undefined,
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("authority_write_scope_mismatch:player:player-1:state");
    expect(getDb().select().from(players).where(eq(players.id, "player-1")).get())
      .toMatchObject({ hp: 5 });
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
  });

  it("attaches durable log_event event ids to authority event refs", async () => {
    const context = createAuthorityContext(0);
    context.legalActorRefs = new Set(["player"]);

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "log_event",
      {
        text: "The player promises to return before dusk.",
        importance: 6,
        participants: ["player"],
        durability: "durable",
        futureRelevance: "The promise should affect later trust checks.",
      },
      3,
      undefined,
      context,
    );
    const eventId = typeof (result.result as { eventId?: unknown } | undefined)?.eventId === "string"
      ? (result.result as { eventId: string }).eventId
      : null;

    expect(result.success).toBe(true);
    expect(eventId).toBeTruthy();
    expect(result.authority).toMatchObject({
      campaignId: CAMPAIGN_ID,
      baseWorldVersion: 0,
      resultWorldVersion: 1,
      eventRefs: [eventId],
      stateDeltaRefs: expect.arrayContaining([eventId, "world:event"]),
    });
    expect(
      getDb()
        .select()
        .from(authorityTraces)
        .where(eq(authorityTraces.campaignId, CAMPAIGN_ID))
        .get(),
    ).toMatchObject({
      eventIds: JSON.stringify([eventId]),
    });
  });

  it("returns contested outcome bounds without authority trace or world version bump", async () => {
    const timestamp = Date.now();
    getDb().insert(worldClocks).values({
      campaignId: CAMPAIGN_ID,
      worldVersion: 0,
      worldTimeMinutes: 0,
      currentTick: 0,
      updatedAt: timestamp,
    }).run();
    getDb().insert(players).values({
      id: "player-1",
      campaignId: CAMPAIGN_ID,
      name: "Iria",
      hp: 5,
    }).run();
    getDb().insert(npcs).values({
      id: "npc-rival",
      campaignId: CAMPAIGN_ID,
      name: "Rival Enforcer",
      persona: "A disciplined enforcer.",
      tier: "persistent",
      createdAt: timestamp,
    }).run();

    const context = createAuthorityContext(0);
    context.subjectActorRefs = new Set(["player-1", "iria"]);
    context.legalActorRefs = new Set(["player-1", "iria", "npc-rival", "rival enforcer"]);

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "request_contested_outcome",
      {
        actorName: "Iria",
        targetName: "Rival Enforcer",
        mode: "attack",
        intent: "force the rival back from the doorway",
        stakes: "control of the doorway",
        evidenceRefs: ["Iria", "Rival Enforcer"],
      },
      4,
      undefined,
      context,
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe("success");
    expect(result.kind).toBe("observation");
    expect(result.observationOnly).toBe(true);
    expect(result.authority).toBeUndefined();
    expect(result.result).toMatchObject({
      kind: "contested_outcome_bounds",
      actorId: "player-1",
      targetId: "npc-rival",
      mode: "attack",
    });
    expect(
      getDb()
        .select()
        .from(authorityTraces)
        .where(eq(authorityTraces.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(0);
    expect(
      getDb()
        .select()
        .from(worldClocks)
        .where(eq(worldClocks.campaignId, CAMPAIGN_ID))
        .get(),
    ).toMatchObject({ worldVersion: 0, worldTimeMinutes: 0 });

    applySuccessfulToolObservationToExecutionContext({
      toolName: "request_contested_outcome",
      result,
      context,
    });
    expect(context.authority?.baseWorldVersion).toBe(0);
  });
});
