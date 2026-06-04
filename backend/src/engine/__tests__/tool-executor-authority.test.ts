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
  locations,
  npcs,
  players,
  quickActionOffers,
  turnClockLedger,
  worldClocks,
} from "../../db/schema.js";
import type { ToolExecutionContext } from "../tool-execution-context.js";
import {
  applySuccessfulToolObservationToExecutionContext,
} from "../tool-execution-context.js";
import { executeToolCall } from "../tool-executor.js";
import {
  RUNTIME_AUTHORITY_REQUIRED_TOOL_NAMES,
} from "../tool-contracts.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "../tool-schemas.js";
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

const executorAuthorityProofInputs = {
  list_visible_affordances: { scope: "visible" },
  list_navigation_options: { actorRef: "Player", fromLocationRef: "current_location" },
  find_location_candidates: { query: "north gate", scope: "visible", tags: [] },
  find_object_candidates: { query: "ledger", scope: "visible", tags: [] },
  find_actor_candidates: { query: "clerk", scope: "visible", tags: [] },
  find_poi_candidates: { query: "notice board", scope: "current_location", tags: [] },
  inspect_known_fact: { query: "route permit", scope: "known" },
  check_route: { actorRef: "Player", destinationRef: "North Road", mode: "walk" },
  move_actor: {
    actorRef: "Player",
    destinationRef: "North Road",
    mode: "walk",
    evidenceRefs: ["route_1"],
  },
  create_minor_poi: {
    areaRef: "current_location",
    poiType: "notice_board",
    tags: [],
    reason: "The player examines public notices.",
  },
  create_scene_extra: {
    locationRef: "current_scene",
    role: "witness",
    tags: [],
    reason: "The player asks whether anyone nearby saw the courier.",
  },
  start_search: {
    actorRef: "Player",
    query: "missing courier seal",
    scope: "current_scene",
    method: "look",
  },
  record_player_intent: {
    actorRef: "Player",
    intentType: "seek",
    targetHint: "missing courier seal",
    stance: "intends",
  },
  record_dialogue_outcome: {
    addresseeRefs: ["Player"],
    outcomeKind: "no_current_answer",
    topicKind: "other",
    authorityKind: "no_visible_authority",
    truthStatus: "unconfirmed",
    durability: "scene_local",
    requestedRoleText: "route clerk",
    quote: "No one here can answer that.",
    summary: "The requested route clerk is not visible.",
    claims: [],
    stateEffects: [],
    sourceRefs: ["Player"],
  },
  record_world_fact: {
    sourceKind: "direct_observation",
    truthStatus: "observed",
    factKind: "status",
    topicKind: "status",
    durability: "durable",
    futureUseKind: "evidence",
    futureRelevance: "The observed queue status can matter in later route choices.",
    summary: "The player observes that the permit queue is closed.",
    claims: [
      {
        claimKind: "status",
        polarity: "states",
        subjectText: "permit queue",
        summary: "The permit queue is closed.",
      },
    ],
    subjectRefs: [],
    sourceRefs: ["Player"],
  },
  add_tag: { entityName: "Player", entityType: "player", tag: "wounded" },
  remove_tag: { entityName: "Player", entityType: "player", tag: "wounded" },
  set_relationship: {
    entityA: "Player",
    entityB: "Clerk",
    tag: "trusted",
    reason: "The clerk accepts the stamped writ.",
  },
  add_chronicle_entry: { text: "The bell rang once." },
  log_event: {
    text: "The player studies the quiet counter.",
    importance: 2,
    participants: ["Player"],
    durability: "scene_local",
  },
  advance_time: {
    minutes: 10,
    reason: "The player waits through a short queue.",
  },
  offer_quick_actions: {
    actions: [
      { label: "Ask", action: "Ask the clerk about the seal." },
      { label: "Wait", action: "Wait for the next clerk." },
      { label: "Leave", action: "Step away from the counter." },
    ],
    sourceRefs: ["Player"],
  },
  spawn_npc: {
    name: "Route Clerk",
    tags: ["clerk", "visible"],
    locationRef: "current_scene",
  },
  promote_npc: {
    npcRef: "Route Clerk",
    newTier: "persistent",
    reason: "The clerk now carries a future-usable route answer.",
  },
  spawn_item: {
    name: "Stamped Writ",
    tags: ["document", "proof"],
    ownerName: "Player",
    ownerType: "character",
  },
  reveal_location: {
    name: "Permit Alcove",
    description: "A public alcove used for route stamps.",
    tags: ["public", "local"],
    connectedToName: "current_scene",
  },
  request_contested_outcome: {
    actorName: "Player",
    targetName: "Guard",
    mode: "contest",
    intent: "push past the guard",
    stakes: "control of the doorway",
    evidenceRefs: ["Player", "Guard"],
  },
  set_condition: { targetName: "Player", delta: -1 },
  move_to: { targetLocationName: "North Road" },
  transfer_item: {
    itemName: "Stamped Writ",
    targetName: "Player",
    targetType: "character",
  },
} satisfies Record<RuntimeToolName, Record<string, unknown>>;

const executorGroundingProbeInputs = {
  move_actor: { destinationRef: "backend-location-id", evidenceRefs: ["backend-route-id"] },
  create_minor_poi: {
    areaRef: "backend-location-id",
    poiType: "notice_board",
    reason: "Probe invalid location grounding.",
  },
  start_search: {
    actorRef: "backend-player-id",
    query: "sealed ledger",
  },
  record_player_intent: {
    actorRef: "backend-player-id",
    intentType: "seek",
  },
  record_dialogue_outcome: {
    ...executorAuthorityProofInputs.record_dialogue_outcome,
    sourceRefs: ["backend-player-id"],
  },
  record_world_fact: {
    ...executorAuthorityProofInputs.record_world_fact,
    sourceRefs: ["backend-player-id"],
  },
  add_tag: { entityName: "backend-player-id", entityType: "player", tag: "wounded" },
  remove_tag: { entityName: "backend-player-id", entityType: "player", tag: "wounded" },
  set_relationship: {
    entityA: "backend-player-id",
    entityB: "backend-npc-id",
    tag: "trusted",
    reason: "Probe invalid relationship grounding.",
  },
  add_chronicle_entry: { text: "Player-turn chronicle probe." },
  log_event: {
    text: "The raw backend actor id backend-player-id should not ground this.",
    importance: 2,
    participants: ["backend-player-id"],
    durability: "scene_local",
  },
  offer_quick_actions: {
    actions: executorAuthorityProofInputs.offer_quick_actions.actions,
    sourceRefs: ["backend-player-id"],
  },
  promote_npc: {
    npcRef: "backend-npc-id",
    newTier: "persistent",
    reason: "Probe invalid promotion grounding.",
  },
  spawn_item: {
    name: "Stamped Writ",
    tags: ["document"],
    ownerName: "backend-player-id",
    ownerType: "character",
  },
  reveal_location: {
    name: "Permit Alcove",
    description: "A public alcove used for route stamps.",
    tags: ["public"],
    connectedToName: "backend-location-id",
  },
  set_condition: { targetName: "backend-player-id", delta: -1 },
  move_to: { targetLocationName: "backend-location-id" },
  transfer_item: {
    itemName: "backend-item-id",
    targetName: "backend-player-id",
    targetType: "character",
  },
} satisfies Partial<Record<RuntimeToolName, Record<string, unknown>>>;

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
      worldTimeMinutes: 1,
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
    expect(
      getDb()
        .select()
        .from(turnClockLedger)
        .where(eq(turnClockLedger.campaignId, CAMPAIGN_ID))
        .get(),
    ).toMatchObject({
      deltaMinutes: 1,
      resultWorldVersion: 1,
      resultWorldTimeMinutes: 1,
    });

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

  it("requires authority for quick-action offers without committing canonical world state", async () => {
    const actions = [
      { label: "Ask", action: "Ask the clerk about the stamped writ." },
      { label: "Watch", action: "Watch the counter for a reaction." },
      { label: "Move", action: "Step back into the queue." },
    ];

    const directResult = await executeToolCall(
      CAMPAIGN_ID,
      "offer_quick_actions",
      { actions },
      3,
    );

    expect(directResult.success).toBe(false);
    expect(directResult.error).toContain("requires execution authority");

    const context = createAuthorityContext(0);
    context.authority!.elapsedWorldTimeMinutes = 0;
    const authorizedResult = await executeToolCall(
      CAMPAIGN_ID,
      "offer_quick_actions",
      { actions },
      3,
      undefined,
      context,
    );

    expect(authorizedResult.success).toBe(true);
    expect(authorizedResult.authority).toBeUndefined();
    expect(authorizedResult.result).toMatchObject({
      actions: [
        { label: "Ask", action: "Ask the clerk about the stamped writ.", handle: expect.stringMatching(/^qac_[a-f0-9]{32}$/u) },
        { label: "Watch", action: "Watch the counter for a reaction.", handle: expect.stringMatching(/^qac_[a-f0-9]{32}$/u) },
        { label: "Move", action: "Step back into the queue.", handle: expect.stringMatching(/^qac_[a-f0-9]{32}$/u) },
      ],
    });
    expect(
      getDb()
        .select()
        .from(quickActionOffers)
        .where(eq(quickActionOffers.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(3);
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
        .from(turnClockLedger)
        .where(eq(turnClockLedger.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(0);
    expect(
      getDb()
        .select()
        .from(worldClocks)
        .where(eq(worldClocks.campaignId, CAMPAIGN_ID))
        .get(),
    ).toMatchObject({ worldVersion: 0, worldTimeMinutes: 0 });
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

  it("runs schema validation for every runtime tool schema entry before executor dispatch", async () => {
    const toolNames = Object.keys(runtimeToolInputSchemas) as RuntimeToolName[];

    expect(Object.keys(executorAuthorityProofInputs).sort()).toEqual([...toolNames].sort());

    for (const toolName of toolNames) {
      const result = await executeToolCall(
        CAMPAIGN_ID,
        toolName,
        { ...executorAuthorityProofInputs[toolName], unsupportedAuthorityProbe: true },
        3,
        undefined,
        createAuthorityContext(0),
      );

      expect(result.success, toolName).toBe(false);
      expect(result.error, toolName).toContain(`Tool schema validation failed for ${toolName}`);
    }
  });

  it("requires execution authority for every authority-bearing runtime tool", async () => {
    const authorityRequiredToolNames = [...RUNTIME_AUTHORITY_REQUIRED_TOOL_NAMES];

    expect(authorityRequiredToolNames.length).toBeGreaterThan(0);
    for (const toolName of authorityRequiredToolNames) {
      const result = await executeToolCall(
        CAMPAIGN_ID,
        toolName,
        executorAuthorityProofInputs[toolName],
        3,
      );

      expect(result.success, toolName).toBe(false);
      expect(result.error, toolName).toContain("requires execution authority");
    }
  });

  it("runs grounding validation before handlers for every ref-grounded authority tool", async () => {
    const coveredGroundingTools = Object.keys(executorGroundingProbeInputs).sort();
    const intentionallyUngroundedAuthorityTools = [
      "advance_time",
      "create_scene_extra",
      "spawn_npc",
    ];
    expect([
      ...coveredGroundingTools,
      ...intentionallyUngroundedAuthorityTools,
    ].sort()).toEqual([...RUNTIME_AUTHORITY_REQUIRED_TOOL_NAMES].sort());

    for (const [toolName, input] of Object.entries(executorGroundingProbeInputs) as Array<
      [RuntimeToolName, Record<string, unknown>]
    >) {
      const result = await executeToolCall(
        CAMPAIGN_ID,
        toolName,
        input,
        3,
        undefined,
        createAuthorityContext(0),
      );

      expect(result.success, toolName).toBe(false);
      expect(result.error, toolName).toContain("Tool grounding failed");
    }
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

  it("rejects blocked world-event scopes before inserting rows", async () => {
    const context = createBackgroundChronicleContext(0);
    context.authority = {
      ...context.authority!,
      blockedWriteScopes: ["world:event"],
    };

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "The blocked bell rings anyway." },
      3,
      undefined,
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("same_turn_write_scope_conflict:world:event");
    expect(
      getDb()
        .select()
        .from(chronicle)
        .where(eq(chronicle.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(0);
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
  });

  it("does not treat scene-local observations as blocked world-event writes", async () => {
    const context = createAuthorityContext(0);
    context.authority = {
      ...context.authority!,
      blockedWriteScopes: ["world:event"],
    };
    context.legalActorRefs = new Set(["player"]);

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "log_event",
      {
        text: "The player glances at the sealed window.",
        importance: 1,
        participants: ["player"],
        durability: "scene_local",
      },
      3,
      undefined,
      context,
    );

    expect(result.success).toBe(true);
    expect(result.authority?.stateDeltaRefs).toEqual(["scene_local_observation"]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
  });

  it("lets local POI topology writes proceed after a same-location recent event", async () => {
    getDb().insert(locations).values({
      id: "loc-market",
      campaignId: CAMPAIGN_ID,
      name: "Market District",
      description: "A public district with counters and corridors.",
      kind: "macro",
      tags: "[]",
      isStarting: true,
      connectedTo: "[]",
    }).run();

    const context = createAuthorityContext(0);
    context.currentLocationId = "loc-market";
    context.currentSceneScopeId = "loc-market";
    context.legalLocationRefs = new Set(["current_location", "current_scene", "Market District", "loc-market", "location:loc-market"]);
    context.currentLocationRefs = new Set(["current_location", "Market District", "loc-market", "location:loc-market"]);
    context.currentSceneRefs = new Set(["current_scene", "Market District", "loc-market", "location:loc-market"]);
    context.authority = {
      ...context.authority!,
      blockedWriteScopes: ["location:loc-market:recent_event"],
    };

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "create_minor_poi",
      {
        areaRef: "current_location",
        poiType: "notice_board",
        name: "Overseer Receiving Desk",
        description: "A public receiving desk in the same market district.",
        reason: "The player follows a visible public route to the desk.",
      },
      3,
      undefined,
      context,
    );

    expect(result.success).toBe(true);
    expect(result.authority?.stateDeltaRefs).toEqual(
      expect.arrayContaining([
        "location:loc-market:topology",
        expect.stringMatching(/^location:.+:revealed$/u),
      ]),
    );
    expect(
      getDb()
        .select()
        .from(locations)
        .where(eq(locations.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(2);
    expect(getDb().select().from(authorityTraces).all()).toHaveLength(1);
  });

  it("rolls back sync state mutations when accepted refs hit a blocked scope", async () => {
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
      blockedWriteScopes: ["player:player-1:state"],
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
    expect(result.error).toContain("same_turn_write_scope_conflict:player:player-1:state");
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
