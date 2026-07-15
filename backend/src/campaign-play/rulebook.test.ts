import { describe, expect, it } from "vitest";
import { CAMPAIGN_PLAY_LIMITS, type CampaignWorldReview } from "@worldforge/shared";
import {
  preflightCampaignPlayRulebook,
  type CampaignPlayRulebookAuthority,
  type CampaignPlayRulebookFrame,
} from "./rulebook.js";
import {
  deriveCampaignPlayPossessionId,
  deriveCampaignPlayPossessionKey,
} from "./campaign-play-projection.js";

const CAMPAIGN_ID = "campaign-rulebook";
const PLAYER_ID = "actor-player";
const TURN_ID = "turn-current";
const BATCH_ID = "batch-current";
const HASH = "a".repeat(64);
const CHARACTER_VERSION = 3;
const OPENING_VERSION = 4;
const READY_VERSION = 7;

function worldFixture(): CampaignWorldReview {
  return {
    campaignId: CAMPAIGN_ID,
    status: "accepted",
    version: 3,
    contentHash: HASH,
    sourceDigest: "b".repeat(64),
    worldSummary: "Two harbors negotiate a failing passage while a council watches both shores.",
    locations: [
      { id: "region-a", name: "North Harbor Region", description: "The northern harbor district.", kind: "macro", parentLocationId: null, tags: ["harbor"], isStarting: true },
      { id: "region-b", name: "South Harbor Region", description: "The southern market district.", kind: "macro", parentLocationId: null, tags: ["market"], isStarting: false },
      { id: "region-c", name: "Bell Island Region", description: "The outer island district.", kind: "macro", parentLocationId: null, tags: ["island"], isStarting: false },
      {
        id: "location-a",
        name: "North Harbor",
        description: "A guarded northern harbor.",
        kind: "persistent_sublocation",
        parentLocationId: "region-a",
        tags: ["harbor"],
        isStarting: false,
      },
      {
        id: "location-b",
        name: "South Harbor",
        description: "A market harbor beyond the passage.",
        kind: "persistent_sublocation",
        parentLocationId: "region-b",
        tags: ["market"],
        isStarting: false,
      },
      {
        id: "location-c",
        name: "Bell Island",
        description: "A distant island outside the harbor passage.",
        kind: "persistent_sublocation",
        parentLocationId: "region-c",
        tags: ["island"],
        isStarting: false,
      },
    ],
    routes: [
      {
        id: "route-a-b",
        fromLocationId: "location-a",
        toLocationId: "location-b",
        travelCost: 5,
      },
      {
        id: "route-b-a",
        fromLocationId: "location-b",
        toLocationId: "location-a",
        travelCost: 5,
      },
    ],
    actors: [
      {
        id: "actor-key",
        kind: "person",
        controller: "agent",
        role: "key",
        name: "Mara Venn",
        summary: "The northern signal keeper.",
        traits: ["methodical"],
        tags: ["keeper"],
      },
      {
        id: "actor-support",
        kind: "person",
        controller: "agent",
        role: "support",
        name: "Oren Tide",
        summary: "A courier at the southern harbor.",
        traits: ["observant"],
        tags: ["courier"],
      },
      {
        id: "actor-council",
        kind: "person",
        controller: "agent",
        role: "key",
        name: "Lantern Council",
        summary: "Delegates who control passage windows.",
        traits: ["procedural"],
        tags: ["civic"],
      },
    ],
    goals: [
      {
        id: "goal-key",
        actorId: "actor-key",
        objective: "Restore the passage signal.",
        motivation: "Keep North Harbor supplied.",
        horizon: "immediate",
        priority: 5,
        status: "active",
      },
    ],
    relations: [
      {
        id: "relation-key-support",
        sourceActorId: "actor-key",
        targetActorId: "actor-support",
        relationType: "association",
        intensity: 2,
        summary: "They share route reports cautiously.",
      },
    ],
    placements: [
      {
        id: "placement-key",
        actorId: "actor-key",
        locationId: "location-a",
        placementKind: "present",
      },
      {
        id: "placement-support",
        actorId: "actor-support",
        locationId: "location-b",
        placementKind: "present",
      },
      {
        id: "placement-council",
        actorId: "actor-council",
        locationId: "location-a",
        placementKind: "present",
      },
    ],
    pressures: [
      {
        id: "pressure-passage",
        name: "Passage Failure",
        description: "The signal route loses coherence.",
        trajectory: "Both harbors will close passage.",
        urgency: 5,
        actorIds: ["actor-key"],
        locationIds: ["location-a", "location-b"],
      },
    ],
    builtAt: 1_000,
    acceptedAt: 2_000,
    source: {
      premise: "A traveler arrives while two harbors lose contact.",
      dna: null,
      researchSummary: null,
      sourceReferences: [],
    },
  };
}

function frameFixture(
  setupPhase: CampaignPlayRulebookFrame["setupPhase"] = "ready",
): CampaignPlayRulebookFrame {
  const world = worldFixture();
  const human = setupPhase === "character_required"
    ? null
    : { actorId: PLAYER_ID, recordHash: "c".repeat(64) };
  return {
    campaignId: CAMPAIGN_ID,
    acceptedWorldVersion: 3,
    acceptedContentHash: HASH,
    setupPhase,
    worldVersion: setupPhase === "character_required"
      ? CHARACTER_VERSION
      : setupPhase === "opening_required" ? OPENING_VERSION : READY_VERSION,
    worldTimeMinutes: setupPhase === "ready" ? 10 : null,
    human,
    acceptedWorld: world,
    routeStates: [],
    actorConditions: [],
    possessions: [],
    pressureStates: setupPhase === "ready" ? [{
      pressureId: "pressure-passage",
      progress: 80,
      status: "active",
      lastAdvancedWorldTimeMinutes: 0,
    }] : [],
    placements: [
      ...world.placements.map((placement) => ({
        placementId: placement.id,
        actorId: placement.actorId,
        locationId: placement.locationId,
        placementKind: placement.placementKind,
      })),
      ...(setupPhase === "ready" ? [{
        placementId: "placement-player",
        actorId: PLAYER_ID,
        locationId: "location-a",
        placementKind: "present" as const,
      }] : []),
    ],
    relations: world.relations.map((relation) => ({
      relationId: relation.id,
      sourceActorId: relation.sourceActorId,
      targetActorId: relation.targetActorId,
      relationType: relation.relationType,
      intensity: relation.intensity,
      summary: relation.summary,
    })),
    goals: world.goals.map((goal) => ({
      goalId: goal.id,
      actorId: goal.actorId,
      status: goal.status,
      priority: goal.priority,
      objective: goal.objective,
      motivation: goal.motivation,
    })),
  };
}

function allRefs() {
  return [
    { kind: "actor" as const, id: PLAYER_ID },
    { kind: "actor" as const, id: "actor-key" },
    { kind: "actor" as const, id: "actor-support" },
    { kind: "actor" as const, id: "actor-council" },
    { kind: "location" as const, id: "location-a" },
    { kind: "location" as const, id: "location-b" },
    { kind: "location" as const, id: "location-c" },
    { kind: "route" as const, id: "route-a-b" },
    { kind: "route" as const, id: "route-b-a" },
    { kind: "relation" as const, id: "relation-key-support" },
    { kind: "goal" as const, id: "goal-key" },
    { kind: "pressure" as const, id: "pressure-passage" },
    { kind: "world_event" as const, id: "event-known" },
  ];
}

function playerAuthority(): CampaignPlayRulebookAuthority {
  return {
    purpose: "player_action",
    turnId: TURN_ID,
    actorId: PLAYER_ID,
    rootParent: { kind: "turn", turnId: TURN_ID },
    authorizedRefs: allRefs(),
    witnessActorIds: ["actor-support"],
    knownWorldEventIds: ["event-known"],
  };
}

function commandBase(
  order: number,
  expectedWorldVersion: number,
  root: CampaignPlayRulebookAuthority["rootParent"] = playerAuthority().rootParent,
) {
  return {
    commandId: `command-${order}`,
    batchId: BATCH_ID,
    order,
    causalParent: order === 0
      ? root
      : { kind: "command" as const, commandId: `command-${order - 1}` },
    source: { kind: "system" as const, system: "game_master" as const },
    expectedWorldVersion,
    exposure: { mode: "protected" as const },
  };
}

function ordinaryBatch() {
  const possessionKey = deriveCampaignPlayPossessionKey("Copper chit");
  const possessionId = deriveCampaignPlayPossessionId(
    CAMPAIGN_ID,
    PLAYER_ID,
    possessionKey,
  );
  const commands = [
    {
      ...commandBase(0, READY_VERSION),
      kind: "advance_world_time",
      readScope: [],
      writeScope: [],
      elapsedMinutes: 5,
    },
    {
      ...commandBase(1, READY_VERSION + 1),
      kind: "move_actor",
      readScope: [
        { kind: "actor", id: PLAYER_ID },
        { kind: "route", id: "route-a-b" },
        { kind: "location", id: "location-a" },
        { kind: "location", id: "location-b" },
      ],
      writeScope: [
        { kind: "actor", id: PLAYER_ID },
        { kind: "location", id: "location-a" },
        { kind: "location", id: "location-b" },
      ],
      actorId: PLAYER_ID,
      routeId: "route-a-b",
      fromLocationId: "location-a",
      toLocationId: "location-b",
    },
    {
      ...commandBase(2, READY_VERSION + 2),
      kind: "set_route_state",
      readScope: [{ kind: "route", id: "route-b-a" }],
      writeScope: [{ kind: "route", id: "route-b-a" }],
      routeId: "route-b-a",
      state: "restricted",
      reason: "South Harbor requires verified passage papers.",
    },
    {
      ...commandBase(3, READY_VERSION + 3),
      kind: "set_actor_condition",
      readScope: [{ kind: "actor", id: "actor-support" }],
      writeScope: [{ kind: "actor", id: "actor-support" }],
      actorId: "actor-support",
      condition: "occupied",
      operation: "set",
      summary: "The courier examines the damaged signal case.",
    },
    {
      ...commandBase(4, READY_VERSION + 4),
      kind: "update_actor_relation",
      readScope: [
        { kind: "relation", id: "relation-key-support" },
        { kind: "actor", id: "actor-key" },
        { kind: "actor", id: "actor-support" },
      ],
      writeScope: [{ kind: "relation", id: "relation-key-support" }],
      relationId: "relation-key-support",
      intensity: 3,
      summary: "Sharing the signal case improves their trust.",
    },
    {
      ...commandBase(5, READY_VERSION + 5),
      kind: "update_actor_goal",
      readScope: [
        { kind: "goal", id: "goal-key" },
        { kind: "actor", id: "actor-key" },
      ],
      writeScope: [{ kind: "goal", id: "goal-key" }],
      goalId: "goal-key",
      status: "completed",
      summary: "The passage signal works again.",
    },
    {
      ...commandBase(6, READY_VERSION + 6),
      kind: "advance_pressure",
      readScope: [{ kind: "pressure", id: "pressure-passage" }],
      writeScope: [{ kind: "pressure", id: "pressure-passage" }],
      pressureId: "pressure-passage",
      amount: 20,
      resultStatus: "resolved",
    },
    {
      ...commandBase(7, READY_VERSION + 7),
      kind: "adjust_actor_possession",
      readScope: [
        { kind: "actor", id: PLAYER_ID },
        { kind: "possession", id: possessionId },
        { kind: "location", id: "location-b" },
      ],
      writeScope: [{ kind: "possession", id: possessionId }],
      actorId: PLAYER_ID,
      possessionId,
      possessionKey,
      name: "Copper chit",
      quantityDelta: 2,
      summary: "The clerk pays the traveler two copper chits.",
      affectedRefs: [
        { kind: "actor", id: PLAYER_ID },
        { kind: "location", id: "location-b" },
      ],
    },
    {
      ...commandBase(8, READY_VERSION + 8),
      kind: "record_world_event",
      readScope: [
        { kind: "actor", id: PLAYER_ID },
        { kind: "location", id: "location-b" },
      ],
      writeScope: [],
      eventClass: "scene",
      summary: "The traveler reaches South Harbor with the repaired signal case.",
      observableTrace: null,
      affectedRefs: [
        { kind: "actor", id: PLAYER_ID },
        { kind: "location", id: "location-b" },
      ],
    },
  ];
  return { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands };
}

function openingBatch() {
  const root = { kind: "turn" as const, turnId: TURN_ID };
  return {
    batchId: BATCH_ID,
    baseWorldVersion: OPENING_VERSION,
    commands: [
      {
        ...commandBase(0, OPENING_VERSION, root),
        source: { kind: "system", system: "opening_bootstrap" },
        kind: "initialize_player_placement",
        readScope: [
          { kind: "actor", id: PLAYER_ID },
          { kind: "location", id: "location-a" },
        ],
        writeScope: [
          { kind: "actor", id: PLAYER_ID },
          { kind: "location", id: "location-a" },
        ],
        actorId: PLAYER_ID,
        locationId: "location-a",
      },
      {
        ...commandBase(1, OPENING_VERSION + 1, root),
        source: { kind: "system", system: "opening_bootstrap" },
        kind: "initialize_world_time",
        readScope: [],
        writeScope: [],
        worldTimeMinutes: 0,
      },
      {
        ...commandBase(2, OPENING_VERSION + 2, root),
        source: { kind: "system", system: "opening_bootstrap" },
        kind: "initialize_pressure_state",
        readScope: [{ kind: "pressure", id: "pressure-passage" }],
        writeScope: [{ kind: "pressure", id: "pressure-passage" }],
        pressureId: "pressure-passage",
        progress: 0,
        status: "active",
      },
    ],
  };
}

describe("Campaign Play Rulebook preflight", () => {
  it("simulates every ordinary command kind in order without mutating the frozen frame", () => {
    const frame = frameFixture();
    const before = structuredClone(frame);
    const result = preflightCampaignPlayRulebook({
      frame,
      authority: playerAuthority(),
      batch: ordinaryBatch(),
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.simulation.worldVersion).toBe(READY_VERSION + 8);
    expect(result.simulation.worldTimeMinutes).toBe(15);
    expect(result.simulation.placements.find((row) => row.actorId === PLAYER_ID)?.locationId)
      .toBe("location-b");
    expect(result.simulation.routeStates).toEqual([
      { routeId: "route-b-a", state: "restricted" },
    ]);
    expect(result.simulation.actorConditions[0]).toMatchObject({
      actorId: "actor-support",
      condition: "occupied",
      present: true,
    });
    expect(result.simulation.relations[0]?.intensity).toBe(3);
    expect(result.simulation.goals[0]?.status).toBe("completed");
    expect(result.simulation.pressureStates[0]).toMatchObject({ progress: 100, status: "resolved" });
    expect(result.simulation.possessions).toEqual([{
      possessionId: deriveCampaignPlayPossessionId(
        CAMPAIGN_ID,
        PLAYER_ID,
        deriveCampaignPlayPossessionKey("Copper chit"),
      ),
      actorId: PLAYER_ID,
      possessionKey: deriveCampaignPlayPossessionKey("Copper chit"),
      name: "Copper chit",
      quantity: 2,
    }]);
    expect(frame).toEqual(before);
  });

  it("spends only an authorized holding with sufficient quantity", () => {
    const frame = frameFixture();
    const possessionKey = deriveCampaignPlayPossessionKey("Copper chit");
    const possessionId = deriveCampaignPlayPossessionId(
      CAMPAIGN_ID,
      PLAYER_ID,
      possessionKey,
    );
    frame.possessions.push({
      possessionId,
      actorId: PLAYER_ID,
      possessionKey,
      name: "Copper chit",
      quantity: 2,
    });
    const authority = playerAuthority();
    authority.authorizedRefs.push({ kind: "possession", id: possessionId });
    const command = {
      ...commandBase(0, READY_VERSION),
      kind: "adjust_actor_possession",
      readScope: [
        { kind: "actor", id: PLAYER_ID },
        { kind: "possession", id: possessionId },
      ],
      writeScope: [{ kind: "possession", id: possessionId }],
      actorId: PLAYER_ID,
      possessionId,
      possessionKey,
      name: "Copper chit",
      quantityDelta: -1,
      summary: "The traveler pays one copper chit for the cot.",
      affectedRefs: [{ kind: "actor", id: PLAYER_ID }],
    };
    const accepted = preflightCampaignPlayRulebook({
      frame,
      authority,
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [command] },
    });
    expect(accepted.accepted).toBe(true);
    if (accepted.accepted) expect(accepted.simulation.possessions[0]?.quantity).toBe(1);

    const denied = preflightCampaignPlayRulebook({
      frame,
      authority,
      batch: {
        batchId: BATCH_ID,
        baseWorldVersion: READY_VERSION,
        commands: [{ ...command, quantityDelta: -3 }],
      },
    });
    expect(denied).toMatchObject({
      accepted: false,
      denial: { code: "precondition_failed" },
    });
    expect(frame.possessions[0]?.quantity).toBe(2);
  });

  it("accepts the complete opening bootstrap and simulates earlier outputs", () => {
    const frame = frameFixture("opening_required");
    const authority: CampaignPlayRulebookAuthority = {
      purpose: "opening",
      turnId: TURN_ID,
      actorId: PLAYER_ID,
      rootParent: { kind: "turn", turnId: TURN_ID },
      authorizedRefs: allRefs(),
      witnessActorIds: [],
      knownWorldEventIds: [],
    };
    const result = preflightCampaignPlayRulebook({ frame, authority, batch: openingBatch() });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.simulation.worldVersion).toBe(READY_VERSION);
    expect(result.simulation.worldTimeMinutes).toBe(0);
    expect(result.simulation.placements.some((row) =>
      row.actorId === PLAYER_ID && row.locationId === "location-a")).toBe(true);
    expect(result.simulation.pressureStates).toEqual([{
      pressureId: "pressure-passage",
      progress: 0,
      status: "active",
      lastAdvancedWorldTimeMinutes: 0,
    }]);
  });

  it("rejects opening bootstrap into a macro region", () => {
    const frame = frameFixture("opening_required");
    const batch = structuredClone(openingBatch());
    const placement = batch.commands[0]!;
    if (placement.kind !== "initialize_player_placement" || !("locationId" in placement)) {
      throw new Error("fixture requires player placement first");
    }
    placement.locationId = "region-a";
    placement.readScope = [
      { kind: "actor", id: PLAYER_ID },
      { kind: "location", id: "region-a" },
    ];
    placement.writeScope = structuredClone(placement.readScope);
    const authority: CampaignPlayRulebookAuthority = {
      purpose: "opening",
      turnId: TURN_ID,
      actorId: PLAYER_ID,
      rootParent: { kind: "turn", turnId: TURN_ID },
      authorizedRefs: [...allRefs(), { kind: "location", id: "region-a" }],
      witnessActorIds: [],
      knownWorldEventIds: [],
    };

    expect(preflightCampaignPlayRulebook({ frame, authority, batch })).toMatchObject({
      accepted: false,
      denial: { code: "precondition_failed" },
    });
  });

  it("rejects movement whose route ends at a macro region", () => {
    const frame = frameFixture();
    frame.acceptedWorld.routes[0] = {
      ...frame.acceptedWorld.routes[0]!,
      toLocationId: "region-b",
    };
    const command = {
      ...commandBase(0, READY_VERSION),
      kind: "move_actor" as const,
      readScope: [
        { kind: "actor" as const, id: PLAYER_ID },
        { kind: "route" as const, id: "route-a-b" },
        { kind: "location" as const, id: "location-a" },
        { kind: "location" as const, id: "region-b" },
      ],
      writeScope: [
        { kind: "actor" as const, id: PLAYER_ID },
        { kind: "location" as const, id: "location-a" },
        { kind: "location" as const, id: "region-b" },
      ],
      actorId: PLAYER_ID,
      routeId: "route-a-b",
      fromLocationId: "location-a",
      toLocationId: "region-b",
    };
    const authority = {
      ...playerAuthority(),
      authorizedRefs: [...allRefs(), { kind: "location" as const, id: "region-b" }],
    };

    expect(preflightCampaignPlayRulebook({
      frame,
      authority,
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [command] },
    })).toMatchObject({ accepted: false, denial: { code: "precondition_failed" } });
  });

  it("accepts the single receipt-bearing character bootstrap command", () => {
    const frame = frameFixture("character_required");
    const root = {
      kind: "accepted_world" as const,
      campaignId: CAMPAIGN_ID,
      acceptedWorldVersion: 3,
      acceptedContentHash: HASH,
    };
    const authority: CampaignPlayRulebookAuthority = {
      purpose: "character_bootstrap",
      turnId: null,
      actorId: null,
      rootParent: root,
      authorizedRefs: allRefs(),
      witnessActorIds: [],
      knownWorldEventIds: [],
    };
    const command = {
      ...commandBase(0, CHARACTER_VERSION, root),
      source: { kind: "system", system: "character_bootstrap" },
      kind: "create_player_actor",
      readScope: [],
      writeScope: [{ kind: "actor", id: PLAYER_ID }],
      actorId: PLAYER_ID,
      characterDigest: "c".repeat(64),
      name: "Ilya Mar",
      summary: "An itinerant instrument repairer.",
      traits: ["careful"],
      tags: ["outsider"],
    };
    const result = preflightCampaignPlayRulebook({
      frame,
      authority,
      batch: { batchId: BATCH_ID, baseWorldVersion: CHARACTER_VERSION, commands: [command] },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.simulation.human).toEqual({
        actorId: PLAYER_ID,
        recordHash: "c".repeat(64),
      });
      expect(result.simulation.worldVersion).toBe(OPENING_VERSION);
    }
  });

  it("accepts unique positive starting possessions only after creating their player", () => {
    const frame = frameFixture("character_required");
    const root = {
      kind: "accepted_world" as const,
      campaignId: CAMPAIGN_ID,
      acceptedWorldVersion: 3,
      acceptedContentHash: HASH,
    };
    const authority: CampaignPlayRulebookAuthority = {
      purpose: "character_bootstrap",
      turnId: null,
      actorId: null,
      rootParent: root,
      authorizedRefs: allRefs(),
      witnessActorIds: [],
      knownWorldEventIds: [],
    };
    const actor = {
      ...commandBase(0, CHARACTER_VERSION, root),
      source: { kind: "system" as const, system: "character_bootstrap" as const },
      kind: "create_player_actor" as const,
      readScope: [],
      writeScope: [{ kind: "actor" as const, id: PLAYER_ID }],
      actorId: PLAYER_ID,
      characterDigest: "c".repeat(64),
      name: "Ilya Mar",
      summary: "An itinerant instrument repairer.",
      traits: ["careful"],
      tags: ["outsider"],
    };
    const possessionKey = deriveCampaignPlayPossessionKey("Copper chit");
    const possessionId = deriveCampaignPlayPossessionId(CAMPAIGN_ID, PLAYER_ID, possessionKey);
    const possession = {
      ...commandBase(1, CHARACTER_VERSION + 1, root),
      source: { kind: "system" as const, system: "character_bootstrap" as const },
      kind: "adjust_actor_possession" as const,
      readScope: [
        { kind: "actor" as const, id: PLAYER_ID },
        { kind: "possession" as const, id: possessionId },
      ],
      writeScope: [{ kind: "possession" as const, id: possessionId }],
      actorId: PLAYER_ID,
      possessionId,
      possessionKey,
      name: "Copper chit",
      quantityDelta: 2,
      summary: "Two copper chits are in the starting inventory.",
      affectedRefs: [{ kind: "actor" as const, id: PLAYER_ID }],
    };
    const result = preflightCampaignPlayRulebook({
      frame,
      authority,
      batch: { batchId: BATCH_ID, baseWorldVersion: CHARACTER_VERSION, commands: [actor, possession] },
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.simulation.worldVersion).toBe(CHARACTER_VERSION + 2);
    expect(result.simulation.possessions).toEqual([{
      possessionId,
      actorId: PLAYER_ID,
      possessionKey,
      name: "Copper chit",
      quantity: 2,
    }]);

    for (const invalid of [
      [possession, actor],
      [actor, { ...possession, quantityDelta: -1 }],
      [actor, possession, { ...possession, commandId: "command-2", order: 2,
        causalParent: { kind: "command" as const, commandId: "command-1" },
        expectedWorldVersion: CHARACTER_VERSION + 2 }],
      [actor, { ...possession, actorId: "actor-support" }],
    ]) {
      expect(preflightCampaignPlayRulebook({
        frame,
        authority,
        batch: { batchId: BATCH_ID, baseWorldVersion: CHARACTER_VERSION, commands: invalid },
      })).toMatchObject({ accepted: false });
    }
  });

  it("keeps ordinary authority batches capped at sixteen commands", () => {
    const commands = Array.from({ length: CAMPAIGN_PLAY_LIMITS.commandsPerBatch + 1 }, (_, index) => ({
      ...commandBase(index, READY_VERSION + index),
      kind: "advance_world_time" as const,
      readScope: [],
      writeScope: [],
      elapsedMinutes: 1,
    }));
    expect(preflightCampaignPlayRulebook({
      frame: frameFixture(),
      authority: playerAuthority(),
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands },
    })).toMatchObject({ accepted: false, denial: { code: "invalid_batch" } });
  });

  it("rejects unknown command kinds and extra model fields", () => {
    const batch = ordinaryBatch();
    batch.commands[0] = { ...batch.commands[0], kind: "initialize_everything", hidden: true } as never;
    const result = preflightCampaignPlayRulebook({
      frame: frameFixture(), authority: playerAuthority(), batch,
    });
    expect(result).toMatchObject({ accepted: false, denial: { code: "invalid_batch" } });
  });

  it("rejects a stale base version before command simulation", () => {
    const batch = ordinaryBatch();
    batch.baseWorldVersion = 4;
    batch.commands.forEach((command, index) => {
      command.expectedWorldVersion = 4 + index;
    });
    const result = preflightCampaignPlayRulebook({
      frame: frameFixture(), authority: playerAuthority(), batch,
    });
    expect(result).toMatchObject({ accepted: false, denial: { code: "stale_world_version" } });
  });

  it("rejects a model-shaped bootstrap escalation in a player turn", () => {
    const opening = openingBatch();
    const result = preflightCampaignPlayRulebook({
      frame: frameFixture(),
      authority: playerAuthority(),
      batch: { ...opening, commands: [opening.commands[1]] },
    });
    expect(result).toMatchObject({ accepted: false, denial: { code: "invalid_batch" } });
  });

  it("rejects a valid bootstrap command kind under player authority", () => {
    const command = openingBatch().commands[1];
    const batch = {
      batchId: BATCH_ID,
      baseWorldVersion: READY_VERSION,
      commands: [{ ...command, order: 0, commandId: "command-0", expectedWorldVersion: READY_VERSION }],
    };
    const result = preflightCampaignPlayRulebook({
      frame: frameFixture(), authority: playerAuthority(), batch,
    });
    expect(result).toMatchObject({ accepted: false, denial: { code: "command_unavailable" } });
  });

  it("rejects an existing but hidden entity reference", () => {
    const authority = playerAuthority();
    authority.authorizedRefs = authority.authorizedRefs.filter((reference) =>
      !(reference.kind === "actor" && reference.id === "actor-support"));
    authority.witnessActorIds = [];
    const batch = ordinaryBatch();
    const result = preflightCampaignPlayRulebook({ frame: frameFixture(), authority, batch });
    expect(result).toMatchObject({
      accepted: false,
      denial: { code: "unauthorized_reference", commandId: "command-3" },
    });
  });

  it("rejects read-scope expansion even when the added entity is authorized", () => {
    const batch = ordinaryBatch();
    batch.commands[0]!.readScope = [{ kind: "actor", id: "actor-key" }] as never;
    const result = preflightCampaignPlayRulebook({
      frame: frameFixture(), authority: playerAuthority(), batch,
    });
    expect(result).toMatchObject({ accepted: false, denial: { code: "invalid_read_scope" } });
  });

  it("rejects a broken causal chain", () => {
    const batch = ordinaryBatch();
    batch.commands[1]!.causalParent = { kind: "turn", turnId: TURN_ID };
    const result = preflightCampaignPlayRulebook({
      frame: frameFixture(), authority: playerAuthority(), batch,
    });
    expect(result).toMatchObject({ accepted: false, denial: { code: "invalid_causal_parent" } });
  });

  it("uses earlier simulated route changes and returns no partial state on denial", () => {
    const batch = ordinaryBatch();
    const route = {
      ...batch.commands[2]!,
      ...commandBase(0, READY_VERSION),
      routeId: "route-a-b",
      state: "blocked",
      readScope: [{ kind: "route", id: "route-a-b" }],
      writeScope: [{ kind: "route", id: "route-a-b" }],
    };
    const move = { ...batch.commands[1]!, ...commandBase(1, READY_VERSION + 1) };
    const frame = frameFixture();
    const result = preflightCampaignPlayRulebook({
      frame,
      authority: playerAuthority(),
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [route, move] },
    });
    expect(result).toMatchObject({
      accepted: false,
      denial: { code: "precondition_failed", commandId: "command-1" },
    });
    expect(frame.routeStates).toEqual([]);
  });

  it("rejects movement for an actor outside the accepted world", () => {
    const batch = ordinaryBatch();
    const move = {
      ...batch.commands[1]!,
      ...commandBase(0, READY_VERSION),
      actorId: "actor-missing",
      readScope: [
        { kind: "actor", id: "actor-missing" },
        { kind: "route", id: "route-a-b" },
        { kind: "location", id: "location-a" },
        { kind: "location", id: "location-b" },
      ],
      writeScope: [
        { kind: "actor", id: "actor-missing" },
        { kind: "location", id: "location-a" },
        { kind: "location", id: "location-b" },
      ],
    };
    const result = preflightCampaignPlayRulebook({
      frame: frameFixture(),
      authority: playerAuthority(),
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [move] },
    });
    expect(result).toMatchObject({ accepted: false, denial: { code: "unauthorized_reference" } });
  });

  it("rejects an actor job mutating another actor's goal or movement", () => {
    const authority: CampaignPlayRulebookAuthority = {
      purpose: "actor_job",
      turnId: TURN_ID,
      actorId: "actor-key",
      rootParent: { kind: "actor_job", jobId: "job-key" },
      authorizedRefs: allRefs(),
      witnessActorIds: ["actor-support"],
      knownWorldEventIds: [],
    };
    const move = {
      ...ordinaryBatch().commands[1]!,
      ...commandBase(0, READY_VERSION, authority.rootParent),
      source: { kind: "actor", actorId: "actor-key" },
    };
    const result = preflightCampaignPlayRulebook({
      frame: frameFixture(), authority,
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [move] },
    });
    expect(result).toMatchObject({ accepted: false, denial: { code: "command_unavailable" } });
  });

  it("requires actor-job commands to retain the job root and actor source", () => {
    const authority: CampaignPlayRulebookAuthority = {
      purpose: "actor_job",
      turnId: TURN_ID,
      actorId: "actor-key",
      rootParent: { kind: "actor_job", jobId: "job-key" },
      authorizedRefs: allRefs(),
      witnessActorIds: ["actor-support"],
      knownWorldEventIds: [],
    };
    const first = {
      ...ordinaryBatch().commands[5]!,
      ...commandBase(0, READY_VERSION, authority.rootParent),
      source: { kind: "actor", actorId: "actor-key" },
      status: "blocked",
    };
    const second = {
      ...ordinaryBatch().commands[0]!,
      ...commandBase(1, READY_VERSION + 1, authority.rootParent),
      causalParent: authority.rootParent,
      source: { kind: "actor", actorId: "actor-key" },
    };
    const accepted = preflightCampaignPlayRulebook({
      frame: frameFixture(), authority,
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [first, second] },
    });
    expect(accepted.accepted).toBe(true);

    const impersonated = structuredClone(first);
    impersonated.source = { kind: "system", system: "actor_scheduler" } as never;
    const denied = preflightCampaignPlayRulebook({
      frame: frameFixture(), authority,
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [impersonated] },
    });
    expect(denied).toMatchObject({ accepted: false, denial: { code: "invalid_source" } });
  });

  it("rejects pressure result status that contradicts simulated progress", () => {
    const pressure = { ...ordinaryBatch().commands[6]!, ...commandBase(0, READY_VERSION), resultStatus: "active" };
    const result = preflightCampaignPlayRulebook({
      frame: frameFixture(), authority: playerAuthority(),
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [pressure] },
    });
    expect(result).toMatchObject({ accepted: false, denial: { code: "precondition_failed" } });
  });

  it("rejects expired aftermath and unknown witness exposure", () => {
    const expired = {
      ...ordinaryBatch().commands[2]!,
      ...commandBase(0, READY_VERSION),
      exposure: {
        mode: "projectable",
        predicates: [{
          channel: "local_aftermath",
          locationId: "location-a",
          validUntilWorldTimeMinutes: 9,
        }],
      },
    };
    expect(preflightCampaignPlayRulebook({
      frame: frameFixture(), authority: playerAuthority(),
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [expired] },
    })).toMatchObject({ accepted: false, denial: { code: "invalid_exposure" } });

    const unknownWitness = structuredClone(expired);
    unknownWitness.exposure.predicates = [{
      channel: "witness_report",
      witnessActorId: "actor-missing",
    }] as never;
    expect(preflightCampaignPlayRulebook({
      frame: frameFixture(), authority: playerAuthority(),
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [unknownWitness] },
    })).toMatchObject({ accepted: false, denial: { code: "unauthorized_reference" } });

    const durableWitness = structuredClone(expired);
    durableWitness.exposure.predicates = [{
      channel: "witness_report",
      witnessActorId: "actor-support",
    }] as never;
    expect(preflightCampaignPlayRulebook({
      frame: frameFixture(), authority: playerAuthority(),
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [durableWitness] },
    }).accepted).toBe(true);
  });

  it("grounds direct and route exposure in the command effect and rejects duplicates", () => {
    const remoteDirect = {
      ...ordinaryBatch().commands[2]!,
      ...commandBase(0, READY_VERSION),
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: "location-c" }],
      },
    };
    expect(preflightCampaignPlayRulebook({
      frame: frameFixture(), authority: playerAuthority(),
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [remoteDirect] },
    })).toMatchObject({ accepted: false, denial: { code: "invalid_exposure" } });

    const duplicateRoute = structuredClone(remoteDirect);
    duplicateRoute.exposure.predicates = [
      { channel: "route_state", routeId: "route-b-a", triggers: ["inspect"] },
      { channel: "route_state", routeId: "route-b-a", triggers: ["traverse"] },
    ] as never;
    expect(preflightCampaignPlayRulebook({
      frame: frameFixture(), authority: playerAuthority(),
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [duplicateRoute] },
    })).toMatchObject({ accepted: false, denial: { code: "invalid_exposure" } });
  });

  it("rejects pre-existing player placements and immutable accepted-row drift", () => {
    const placed = frameFixture("opening_required");
    placed.placements.push({
      placementId: "player-home",
      actorId: PLAYER_ID,
      locationId: "location-a",
      placementKind: "home",
    });
    const authority: CampaignPlayRulebookAuthority = {
      purpose: "opening",
      turnId: TURN_ID,
      actorId: PLAYER_ID,
      rootParent: { kind: "turn", turnId: TURN_ID },
      authorizedRefs: allRefs(),
      witnessActorIds: [],
      knownWorldEventIds: [],
    };
    expect(preflightCampaignPlayRulebook({
      frame: placed, authority, batch: openingBatch(),
    })).toMatchObject({ accepted: false, denial: { code: "invalid_frame" } });

    const drifted = frameFixture();
    drifted.relations[0]!.relationType = "hostility";
    drifted.goals[0]!.objective = "A substituted objective.";
    expect(preflightCampaignPlayRulebook({
      frame: drifted, authority: playerAuthority(), batch: ordinaryBatch(),
    })).toMatchObject({ accepted: false, denial: { code: "invalid_frame" } });
  });

  it("rejects a generated player-placement identifier collision", () => {
    const frame = frameFixture("opening_required");
    frame.acceptedWorld.placements[0]!.id = `opening-placement:${PLAYER_ID}`;
    frame.placements[0]!.placementId = `opening-placement:${PLAYER_ID}`;
    const authority: CampaignPlayRulebookAuthority = {
      purpose: "opening",
      turnId: TURN_ID,
      actorId: PLAYER_ID,
      rootParent: { kind: "turn", turnId: TURN_ID },
      authorizedRefs: allRefs(),
      witnessActorIds: [],
      knownWorldEventIds: [],
    };
    expect(preflightCampaignPlayRulebook({ frame, authority, batch: openingBatch() }))
      .toMatchObject({ accepted: false, denial: { code: "precondition_failed" } });
  });

  it("does not reclassify an accepted agent actor as the human player", () => {
    const frame = frameFixture();
    frame.human = { actorId: "actor-key", recordHash: "c".repeat(64) };
    frame.placements = frame.placements.filter((placement) => placement.actorId !== PLAYER_ID);
    expect(preflightCampaignPlayRulebook({
      frame, authority: {
        ...playerAuthority(),
        actorId: "actor-key",
        authorizedRefs: allRefs(),
      }, batch: ordinaryBatch(),
    })).toMatchObject({ accepted: false, denial: { code: "invalid_frame" } });
  });

  it("uses present locality for people and freezes non-present placement locations", () => {
    const frame = frameFixture();
    frame.acceptedWorld.routes.push({
      id: "route-b-c",
      fromLocationId: "location-b",
      toLocationId: "location-c",
      travelCost: 2,
    });
    frame.acceptedWorld.placements.push({
      id: "placement-key-home",
      actorId: "actor-key",
      locationId: "location-b",
      placementKind: "home",
    });
    frame.placements.push({
      placementId: "placement-key-home",
      actorId: "actor-key",
      locationId: "location-b",
      placementKind: "home",
    });
    const authority: CampaignPlayRulebookAuthority = {
      purpose: "actor_job",
      turnId: TURN_ID,
      actorId: "actor-key",
      rootParent: { kind: "actor_job", jobId: "job-key" },
      authorizedRefs: [...allRefs(), { kind: "route", id: "route-b-c" }],
      witnessActorIds: ["actor-support"],
      knownWorldEventIds: [],
    };
    const routeCommand = {
      ...commandBase(0, READY_VERSION, authority.rootParent),
      source: { kind: "actor", actorId: "actor-key" },
      kind: "set_route_state",
      readScope: [{ kind: "route", id: "route-b-c" }],
      writeScope: [{ kind: "route", id: "route-b-c" }],
      routeId: "route-b-c",
      state: "restricted",
      reason: "The distant home record grants no current reach.",
    };
    expect(preflightCampaignPlayRulebook({
      frame, authority,
      batch: { batchId: BATCH_ID, baseWorldVersion: READY_VERSION, commands: [routeCommand] },
    })).toMatchObject({ accepted: false, denial: { code: "command_unavailable" } });

    frame.placements.find((placement) => placement.placementId === "placement-key-home")!
      .locationId = "location-c";
    expect(preflightCampaignPlayRulebook({
      frame, authority: playerAuthority(), batch: ordinaryBatch(),
    })).toMatchObject({ accepted: false, denial: { code: "invalid_frame" } });
  });

  it("requires exact opening pressure coverage", () => {
    const frame = frameFixture("opening_required");
    const authority: CampaignPlayRulebookAuthority = {
      purpose: "opening",
      turnId: TURN_ID,
      actorId: PLAYER_ID,
      rootParent: { kind: "turn", turnId: TURN_ID },
      authorizedRefs: allRefs(),
      witnessActorIds: [],
      knownWorldEventIds: [],
    };
    const batch = openingBatch();
    batch.commands.pop();
    const result = preflightCampaignPlayRulebook({ frame, authority, batch });
    expect(result).toMatchObject({
      accepted: false,
      denial: { code: "invalid_bootstrap_coverage" },
    });
  });
});
