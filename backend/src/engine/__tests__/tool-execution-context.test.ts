import { describe, expect, it } from "vitest";

import {
  applySuccessfulToolObservationToExecutionContext,
  createActorTurnToolExecutionContext,
  createPlayerTurnToolExecutionContext,
  normalizeToolInputForGrounding,
  validateToolInputGrounding,
  writeScopesForRuntimeToolNames,
} from "../tool-execution-context.js";
import { buildObservationToolResult, type ToolResult } from "../tool-result.js";
import type { ActorFrame } from "../actor-frame.js";
import type { SceneFrame } from "../scene-frame.js";
import type { CreatePlayerTurnToolExecutionContextArgs } from "../tool-execution-context.js";

function createFrame(): SceneFrame {
  return {
    campaignId: "campaign-1",
    tick: 12,
    worldVersion: 0,
    playerActorId: "actor-player",
    currentLocationId: "loc-pier",
    currentSceneScopeId: "scene-counter",
    currentLocationName: "Lantern-Lit Gondola Pier",
    currentSceneScopeName: "Pier Records Counter",
    playerAction: "I open the records hatch beside the counter.",
    roster: {
      active: [
        {
          id: "actor-player",
          actorId: "actor-player",
          type: "player",
          label: "Mira Voss",
          locationId: "loc-pier",
          sceneScopeId: "scene-counter",
          awareness: "clear",
        },
        {
          id: "actor-road-warden",
          actorId: "npc-road-warden",
          type: "npc",
          label: "Road Warden",
          locationId: "loc-pier",
          sceneScopeId: "scene-counter",
          awareness: "clear",
        },
      ],
      support: [],
      background: [],
    },
    perception: {
      playerAwarenessHints: [],
      actorAwareness: {},
    },
    recentEvents: [],
    targetCandidates: [],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: [
      "record_player_intent",
      "move_actor",
      "create_minor_poi",
      "create_scene_extra",
      "reveal_location",
      "set_condition",
      "move_to",
      "record_dialogue_outcome",
      "record_world_fact",
      "spawn_npc",
      "spawn_item",
      "transfer_item",
      "log_event",
      "request_contested_outcome",
      "offer_quick_actions",
      "inspect_known_fact",
    ],
    oracle: null,
  };
}

function withFrameWriteScopes(
  input: CreatePlayerTurnToolExecutionContextArgs,
): CreatePlayerTurnToolExecutionContextArgs {
  return {
    ...input,
    allowedWriteScopes: writeScopesForRuntimeToolNames(input.frame.allowedTools),
  };
}

describe("createPlayerTurnToolExecutionContext", () => {
  it("keeps actor-turn movement scoped to the actor locality instead of player routes", () => {
    const frame: SceneFrame = {
      ...createFrame(),
      currentLocationId: "loc-pier",
      currentSceneScopeId: "scene-counter",
      currentLocationName: "Lantern-Lit Gondola Pier",
      currentSceneScopeName: "Pier Records Counter",
      movementCandidates: [{
        id: "route-back-room",
        locationId: "loc-back-room",
        label: "Back Room",
        connected: true,
        travelCost: 1,
      }],
      roster: {
        ...createFrame().roster,
        background: [{
          id: "actor-offscreen-scout",
          actorId: "npc-offscreen-scout",
          type: "npc",
          label: "Offscreen Scout",
          locationId: "loc-market",
          sceneScopeId: "scene-market",
          awareness: "none",
        }],
      },
    };
    const actorFrame = {
      campaignId: "campaign-1",
      worldVersion: 0,
      observer: {
        id: "actor-offscreen-scout",
        actorId: "npc-offscreen-scout",
        type: "npc",
        label: "Offscreen Scout",
        locationId: "loc-market",
        sceneScopeId: "scene-market",
      },
      playerActionRequest: "Patrol your own area.",
      facts: [],
      legalTools: ["move_to"],
      constraints: [],
      contextBudgetTrace: {
        label: "ActorFrame",
        frameType: "ActorFrame",
        budgets: {},
        selectedItemCount: 0,
        summarizedItemCount: 0,
        droppedItemCount: 0,
      },
      hiddenExcludedCount: 0,
    } as unknown as ActorFrame;

    const context = createActorTurnToolExecutionContext({
      sceneFrame: frame,
      actorFrame,
      baseWorldVersion: 0,
      allowedWriteScopes: [
        "npc:npc-offscreen-scout:location",
        "location:loc-back-room:presence",
      ],
    });

    expect(context.currentLocationRefs.has("lantern-lit gondola pier")).toBe(false);
    expect(context.legalMovementRefs.has("back room")).toBe(false);
    expect(validateToolInputGrounding({
      toolName: "move_to",
      toolInput: { targetLocationName: "Back Room" },
      context,
    })).toMatchObject({
      code: "remote_location_ref",
      path: "input.targetLocationName",
    });
  });

  it("rejects backend-only actor refs for player-turn bridge tools", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(context.subjectActorRefs.has("player")).toBe(true);
    expect(context.subjectActorRefs.has("actor:actor-player")).toBe(false);
    expect(validateToolInputGrounding({
      toolName: "record_player_intent",
      toolInput: {
        actorRef: "Player",
        intentType: "ask",
        targetHint: "Road Warden",
        stance: "asks",
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "record_player_intent",
      toolInput: {
        actorRef: "actor:actor-player",
        intentType: "ask",
        targetHint: "Road Warden",
        stance: "asks",
      },
      context,
    })).toMatchObject({
      code: "hidden_actor_ref",
      path: "input.actorRef",
    });

    expect(validateToolInputGrounding({
      toolName: "record_player_intent",
      toolInput: {
        actorRef: "actor-player",
        intentType: "ask",
        targetHint: "Road Warden",
        stance: "asks",
      },
      context,
    })).toMatchObject({
      code: "hidden_actor_ref",
      path: "input.actorRef",
    });

    expect(validateToolInputGrounding({
      toolName: "record_player_intent",
      toolInput: {
        actorRef: "actor:hidden-watcher",
        intentType: "ask",
        targetHint: "Road Warden",
        stance: "asks",
      },
      context,
    })).toMatchObject({
      code: "hidden_actor_ref",
      path: "input.actorRef",
    });
  });

  it("rejects opaque backend refs in player-turn bridge tool fields even when internally resolvable", () => {
    const frame: SceneFrame = {
      ...createFrame(),
      movementCandidates: [
        {
          id: "routeInternal44",
          locationId: "secretRoomInternal44",
          label: "Service Stairs",
          connected: true,
        },
      ],
    };
    const context = createPlayerTurnToolExecutionContext(frame);

    expect(context.legalMovementRefs.has("move_service_stairs")).toBe(true);
    expect(context.legalMovementRefs.has("routeinternal44")).toBe(false);
    expect(context.legalMovementRefs.has("secretroominternal44")).toBe(false);
    expect(validateToolInputGrounding({
      toolName: "move_actor",
      toolInput: {
        actorRef: "Player",
        destinationRef: "secretRoomInternal44",
        routeId: "routeInternal44",
        intentSummary: "Take the service stairs.",
      },
      context,
    })).toMatchObject({
      code: "remote_location_ref",
      path: "input.destinationRef",
    });

    expect(validateToolInputGrounding({
      toolName: "move_actor",
      toolInput: {
        actorRef: "Player",
        destinationRef: "move_service_stairs",
        routeId: "move_service_stairs",
        intentSummary: "Take the service stairs.",
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "create_minor_poi",
      toolInput: {
        poiType: "notice_board",
        areaRef: "loc-pier",
        name: "Posted Schedule",
        reason: "The player checks public notices.",
      },
      context,
    })).toMatchObject({
      code: "remote_location_ref",
      path: "input.areaRef",
    });

    expect(validateToolInputGrounding({
      toolName: "create_scene_extra",
      toolInput: {
        role: "clerk",
        locationId: "scene-counter",
        name: "Ledger Clerk",
        reason: "The player looks for someone staffing the counter.",
      },
      context,
    })).toMatchObject({
      code: "remote_location_ref",
      path: "input.locationId",
    });
  });

  it("builds actor refs from model-facing legal targets, not hidden raw target candidates", () => {
    const frame: SceneFrame = {
      ...createFrame(),
      perception: {
        playerAwarenessHints: ["Someone listens behind the records curtain."],
        actorAwareness: {},
        forbiddenActorIds: ["actor-hidden-listener"],
        forbiddenActorLabels: ["Back-Room Listener"],
      },
      targetCandidates: [
        {
          id: "actor-cafe-clerk",
          type: "actor",
          label: "Cafe Clerk",
          actorId: "npc-cafe-clerk",
          awareness: "clear",
        },
        {
          id: "actor-hidden-listener",
          type: "actor",
          label: "Back-Room Listener",
          actorId: "npc-hidden-listener",
          awareness: "hint",
        },
      ],
    };

    const context = createPlayerTurnToolExecutionContext(frame);

    expect(context.legalActorRefs.has("target_cafe_clerk")).toBe(true);
    expect(context.legalActorRefs.has("cafe clerk")).toBe(false);
    expect(context.legalActorRefs.has("npc-cafe-clerk")).toBe(false);
    expect(context.legalActorRefs.has("back-room listener")).toBe(false);
    expect(context.legalActorRefs.has("actor-hidden-listener")).toBe(false);
    expect(context.legalActorRefs.has("actor:actor-hidden-listener")).toBe(false);
    expect(context.legalActorRefs.has("npc-hidden-listener")).toBe(false);
    expect(context.bridgeLookup?.legalTargets.map((target) => target.label)).toEqual([
      "Cafe Clerk",
    ]);
  });

  it("rejects underscore backend refs before legal-set membership", () => {
    const frame = {
      ...createFrame(),
      playerActorId: "actor_player",
      currentLocationId: "loc_pier",
      currentSceneScopeId: "scene_counter",
      roster: {
        ...createFrame().roster,
        active: createFrame().roster.active.map((actor, index) =>
          index === 0
            ? {
                ...actor,
                id: "actor_player",
                actorId: "actor_player",
              }
            : actor),
      },
    };
    const context = createPlayerTurnToolExecutionContext(frame);

    expect(context.subjectActorRefs.has("actor_player")).toBe(false);
    expect(context.currentLocationRefs.has("loc_pier")).toBe(false);

    expect(validateToolInputGrounding({
      toolName: "record_player_intent",
      toolInput: {
        actorRef: "actor_player",
        intentType: "ask",
        targetHint: "Road Warden",
        stance: "asks",
      },
      context,
    })).toMatchObject({
      code: "hidden_actor_ref",
      path: "input.actorRef",
      message: expect.stringContaining("backend-only ref"),
    });

    expect(validateToolInputGrounding({
      toolName: "reveal_location",
      toolInput: {
        name: "Pier Records Back Room",
        description: "A cramped back room behind the counter.",
        tags: ["records"],
        connectedToName: "loc_pier",
      },
      context,
    })).toMatchObject({
      code: "remote_location_ref",
      invalidRef: "loc_pier",
    });
  });

  it("rejects exact non-pattern backend frame ids before legal-set membership", () => {
    const frame: SceneFrame = {
      ...createFrame(),
      playerActorId: "miraInternal42",
      currentLocationId: "pierInternal77",
      currentSceneScopeId: "counterInternal88",
      roster: {
        ...createFrame().roster,
        active: createFrame().roster.active.map((actor, index) =>
          index === 0
            ? {
                ...actor,
                id: "miraInternal42",
                actorId: "miraInternal42",
                label: "Mira Voss",
                locationId: "pierInternal77",
                sceneScopeId: "counterInternal88",
              }
            : actor),
      },
      movementCandidates: [
        {
          id: "backRoomInternal99",
          locationId: "backRoomInternal99",
          label: "Back Room",
          connected: true,
          travelCost: 1,
        },
      ],
    };
    const context = createPlayerTurnToolExecutionContext(frame);

    expect(context.legalActorRefs.has("mirainternal42")).toBe(false);
    expect(context.legalMovementRefs.has("backroominternal99")).toBe(false);
    expect(validateToolInputGrounding({
      toolName: "set_condition",
      toolInput: {
        targetName: "miraInternal42",
        condition: "winded",
        intensity: "minor",
      },
      context,
    })).toMatchObject({
      code: "hidden_actor_ref",
      path: "input.targetName",
      message: expect.stringContaining("backend-only ref"),
    });
    expect(validateToolInputGrounding({
      toolName: "move_to",
      toolInput: { targetLocationName: "backRoomInternal99" },
      context,
    })).toMatchObject({
      code: "remote_location_ref",
      invalidRef: "backRoomInternal99",
    });
    expect(validateToolInputGrounding({
      toolName: "set_condition",
      toolInput: {
        targetName: "Player",
        condition: "winded",
        intensity: "minor",
      },
      context,
    })).toBeNull();
    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "person_road_warden",
        addresseeRefs: ["miraInternal42"],
        sourceRefs: ["person_road_warden"],
        outcomeKind: "answered",
        topicKind: "status",
        authorityKind: "speaker_claim",
        durability: "scene_local",
        summary: "The road warden answers Mira.",
      },
      context,
    })).toMatchObject({
      code: "hidden_actor_ref",
      path: "input.addresseeRefs.0",
      invalidRef: "miraInternal42",
    });
    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "person_road_warden",
        addresseeRefs: ["Player"],
        sourceRefs: ["pierInternal77"],
        outcomeKind: "answered",
        topicKind: "status",
        authorityKind: "speaker_claim",
        durability: "scene_local",
        summary: "The road warden answers from the pier counter.",
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.sourceRefs.0",
      invalidRef: "pierInternal77",
    });
    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "observation",
        truthStatus: "observed",
        factKind: "status",
        topicKind: "procedure",
        durability: "scene_local",
        summary: "The counter uses a special ledger procedure.",
        sourceRefs: ["pierInternal77"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.sourceRefs.0",
      invalidRef: "pierInternal77",
    });
    expect(validateToolInputGrounding({
      toolName: "request_contested_outcome",
      toolInput: {
        actorName: "Player",
        targetName: "person_road_warden",
        mode: "social_pressure",
        intent: "pressure the warden to answer",
        stakes: "whether the warden reveals the ledger routine",
        evidenceRefs: ["pierInternal77"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.evidenceRefs.0",
      invalidRef: "pierInternal77",
    });
    expect(validateToolInputGrounding({
      toolName: "move_to",
      toolInput: { targetLocationName: "move_back_room" },
      context,
    })).toBeNull();
  });

  it("treats current scene and location aliases as legal refs without accepting display labels", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(context.currentLocationRefs.has("current_location")).toBe(true);
    expect(context.currentLocationRefs.has("lantern-lit gondola pier")).toBe(false);
    expect(context.currentLocationRefs.has("location:loc-pier")).toBe(false);
    expect(context.currentSceneRefs.has("current_scene")).toBe(true);
    expect(context.currentSceneRefs.has("pier records counter")).toBe(false);
    expect(context.currentSceneRefs.has("location:scene-counter")).toBe(false);
    expect(context.legalLocationRefs.has("current_location")).toBe(true);
    expect(context.legalLocationRefs.has("current_scene")).toBe(true);
    expect(context.legalLocationRefs.has("lantern-lit gondola pier")).toBe(false);
    expect(context.legalLocationRefs.has("pier records counter")).toBe(false);
    expect(context.legalLocationRefs.has("location:loc-pier")).toBe(false);
    expect(context.legalLocationRefs.has("location:scene-counter")).toBe(false);
    expect(context.legalLocationRefs.has("forest outpost")).toBe(false);

    expect(validateToolInputGrounding({
      toolName: "reveal_location",
      toolInput: {
        name: "Pier Records Back Room",
        description: "A cramped back room behind the counter.",
        tags: ["records"],
        connectedToName: "current_location",
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "reveal_location",
      toolInput: {
        name: "Outpost Crawlspace",
        description: "A remote crawlspace.",
        tags: ["remote"],
        connectedToName: "Forest Outpost",
      },
      context,
    })).toMatchObject({
      code: "remote_location_ref",
      path: "input.connectedToName",
    });
  });

  it("adds accepted reveal, movement, NPC, and item refs for later same-loop calls", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());
    const revealResult: ToolResult = {
      success: true as const,
      result: {
        id: "loc-recessed-counting-stair",
        name: "Recessed Counting Stair",
        connectedTo: "Pier Records Counter",
      },
    };

    applySuccessfulToolObservationToExecutionContext({
      toolName: "reveal_location",
      context,
      result: revealResult,
    });
    const revealedLocationRef = revealResult.modelSafeRefs?.[0] ?? "new_location_1";

    expect(context.legalLocationRefs.has(revealedLocationRef)).toBe(true);
    expect(context.legalLocationRefs.has("loc-recessed-counting-stair")).toBe(false);
    expect(context.legalLocationRefs.has("location:loc-recessed-counting-stair")).toBe(false);
    expect(context.legalMovementRefs.has(revealedLocationRef)).toBe(true);
    expect(context.legalMovementRefs.has("recessed counting stair")).toBe(false);
    expect(context.legalMovementRefs.has("location:loc-recessed-counting-stair")).toBe(false);
    expect(validateToolInputGrounding({
      toolName: "move_to",
      toolInput: { targetLocationName: revealedLocationRef },
      context,
    })).toBeNull();
    expect(validateToolInputGrounding({
      toolName: "move_to",
      toolInput: { targetLocationName: "loc-recessed-counting-stair" },
      context,
    })).toMatchObject({
      code: "remote_location_ref",
      path: "input.targetLocationName",
      invalidRef: "loc-recessed-counting-stair",
    });
    expect(validateToolInputGrounding({
      toolName: "spawn_npc",
      toolInput: {
        name: "Ledger Porter",
        tags: ["porter", "witness"],
        locationId: "loc-recessed-counting-stair",
      },
      context,
    })).toMatchObject({
      code: "remote_location_ref",
      path: "input.locationId",
    });

    applySuccessfulToolObservationToExecutionContext({
      toolName: "move_to",
      context,
      result: {
        success: true,
        result: {
          locationId: "loc-recessed-counting-stair",
          locationName: "Recessed Counting Stair",
          travelCost: 1,
          path: ["Pier Records Counter", "Recessed Counting Stair"],
        },
      },
    });

    expect(context.currentLocationId).toBe("loc-recessed-counting-stair");
    expect(context.currentLocationRefs.has("current_location")).toBe(true);
    expect(context.currentLocationRefs.has(revealedLocationRef)).toBe(true);
    expect(context.currentLocationRefs.has("recessed counting stair")).toBe(false);
    expect(context.currentLocationRefs.has("location:loc-recessed-counting-stair")).toBe(false);
    expect(context.currentSceneRefs.has("current_scene")).toBe(true);
    expect(context.currentSceneRefs.has(revealedLocationRef)).toBe(true);
    expect(context.currentSceneRefs.has("location:loc-recessed-counting-stair")).toBe(false);

    const spawnNpcResult: ToolResult = {
      success: true as const,
      result: { id: "npc-ledger-porter", name: "Ledger Porter" },
    };
    applySuccessfulToolObservationToExecutionContext({
      toolName: "spawn_npc",
      context,
      result: spawnNpcResult,
    });
    const ledgerPorterRef = spawnNpcResult.modelSafeRefs?.[0] ?? "new_actor_1";

    expect(context.legalActorRefs.has(ledgerPorterRef)).toBe(true);
    expect(context.legalActorRefs.has("ledger porter")).toBe(false);
    expect(context.legalActorRefs.has("actor:npc-ledger-porter")).toBe(false);
    expect(validateToolInputGrounding({
      toolName: "spawn_item",
      toolInput: {
        name: "Waxed-Cloth Manifest",
        tags: ["manifest", "persistent"],
        ownerName: ledgerPorterRef,
        ownerType: "character",
      },
      context,
    })).toBeNull();

    const sceneExtraResult: ToolResult = {
      success: true as const,
      result: { id: "support-local-courier", name: "Local Courier" },
    };
    applySuccessfulToolObservationToExecutionContext({
      toolName: "create_scene_extra",
      context,
      result: sceneExtraResult,
    });
    const localCourierRef = sceneExtraResult.modelSafeRefs?.[0] ?? "new_actor_2";

    expect(context.legalActorRefs.has(localCourierRef)).toBe(true);
    expect(context.legalActorRefs.has("local courier")).toBe(false);
    expect(context.legalActorRefs.has("actor:support-local-courier")).toBe(false);
    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: localCourierRef,
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "status",
        authorityKind: "witness",
        truthStatus: "speaker_asserted",
        durability: "durable",
        futureUseKind: "permission_check",
        futureRelevance: "The courier's named office can shape later wardens' permission checks.",
        quote: "\"The pier office is speaking for the wardens today.\"",
        summary: "The local courier names the office currently speaking for the wardens.",
        claims: [
          {
            claimKind: "office",
            polarity: "states",
            subjectText: "warden spokesperson office",
            summary: "The courier identifies the public office speaking for the wardens today.",
          },
        ],
        sourceRefs: [localCourierRef, "Player"],
      },
      context,
    })).toBeNull();

    const spawnItemResult: ToolResult = {
      success: true as const,
      result: {
        id: "item-waxed-cloth-manifest",
        name: "Waxed-Cloth Manifest",
        owner: "Ledger Porter",
        ownerType: "character",
      },
    };
    applySuccessfulToolObservationToExecutionContext({
      toolName: "spawn_item",
      context,
      result: spawnItemResult,
    });
    const manifestRef = spawnItemResult.modelSafeRefs?.[0] ?? "new_item_1";

    expect(context.legalItemRefs.has(manifestRef)).toBe(true);
    expect(context.legalItemRefs.has("waxed-cloth manifest")).toBe(false);
    expect(context.legalItemRefs.has("item:item-waxed-cloth-manifest")).toBe(false);
    expect(validateToolInputGrounding({
      toolName: "transfer_item",
      toolInput: {
        itemName: manifestRef,
        targetName: "Player",
        targetType: "character",
      },
      context,
    })).toBeNull();
    expect(validateToolInputGrounding({
      toolName: "transfer_item",
      toolInput: {
        itemName: manifestRef,
        targetName: "Player",
        targetType: "npc",
      },
      context,
    })).toBeNull();

    const transferResult: ToolResult = {
      success: true as const,
      result: {
        id: "item-counter-receipt",
        item: "Counter Receipt",
        splitFrom: "Waxed-Cloth Manifest",
        remainingItemId: "item-manifest-stub",
        remainingItem: "Manifest Stub",
        target: "Road Warden",
        partialTransfer: true,
      },
      authority: {
        toolResultId: "tool-transfer-counter-receipt",
        campaignId: "campaign-1",
        sourceEntity: { type: "player" as const, id: "actor-player" },
        baseWorldVersion: 1,
        resultWorldVersion: 2,
        worldTimeMinutes: 13,
        elapsedWorldTimeMinutes: 1,
        stateDeltaRefs: ["Counter Receipt", "Manifest Stub"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };
    applySuccessfulToolObservationToExecutionContext({
      toolName: "transfer_item",
      context,
      result: transferResult,
    });
    const counterReceiptRef = transferResult.modelSafeRefs?.[0] ?? "new_item_2";

    expect(context.legalItemRefs.has(counterReceiptRef)).toBe(true);
    expect(context.legalItemRefs.has("counter receipt")).toBe(false);
    expect(context.legalItemRefs.has("manifest stub")).toBe(false);
    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "person_road_warden",
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "proof",
        authorityKind: "role_authority",
        truthStatus: "settled_by_backend",
        durability: "durable",
        futureUseKind: "evidence",
        futureRelevance: "The counter receipt can be cited in later proof checks.",
        quote: "\"That counter receipt is valid proof for this check.\"",
        summary: "The warden acknowledges the receipt created by the same tool loop.",
        claims: [
          {
            claimKind: "document_status",
            polarity: "states",
            subjectRef: counterReceiptRef,
            summary: "The counter receipt exists as the current proof object.",
          },
        ],
        stateEffects: [{ status: "applied_now" }],
        sourceRefs: [counterReceiptRef],
      },
      context,
    })).toBeNull();
    expect(validateToolInputGrounding({
      toolName: "spawn_item",
      toolInput: {
        name: "Waxed-Cloth Manifest",
        tags: ["manifest", "persistent"],
        ownerName: "actor:npc-ledger-porter",
        ownerType: "character",
      },
      context,
    })).toMatchObject({
      code: "hidden_actor_ref",
      path: "input.ownerName",
      invalidRef: "actor:npc-ledger-porter",
    });
  });

  it("keeps failed and guarded observations out of same-loop legal refs", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    applySuccessfulToolObservationToExecutionContext({
      toolName: "reveal_location",
      context,
      result: { success: false, error: "Connected location not found: Forest Outpost" },
    });
    applySuccessfulToolObservationToExecutionContext({
      toolName: "spawn_item",
      context,
      result: { success: false, error: "Unsupported access proof claim." },
    });

    expect(context.legalLocationRefs.has("forest outpost")).toBe(false);
    expect(context.legalItemRefs.has("master key")).toBe(false);
    expect(validateToolInputGrounding({
      toolName: "move_to",
      toolInput: { targetLocationName: "Forest Outpost" },
      context,
    })).toMatchObject({
      code: "remote_location_ref",
      path: "input.targetLocationName",
    });
    expect(validateToolInputGrounding({
      toolName: "transfer_item",
      toolInput: {
        itemName: "master key",
        targetName: "Player",
        targetType: "character",
      },
      context,
    })).toMatchObject({
      code: "unexposed_item_ref",
      path: "input.itemName",
    });
  });

  it("rejects player-turn durable log_event instead of making free text a durable fact", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(validateToolInputGrounding({
      toolName: "log_event",
      toolInput: {
        text: "Mira Voss has a master key and opens the sealed records office.",
        importance: 8,
        participants: ["Player"],
        durability: "durable",
        futureRelevance: "The claimed key would grant office access.",
      },
      context,
    })).toMatchObject({
      code: "invalid_durability",
      path: "input.durability",
    });
  });

  it("clears pending elapsed authority after accepted advance_time", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());
    expect(context.authority?.elapsedWorldTimeMinutes).toBe(0);

    applySuccessfulToolObservationToExecutionContext({
      toolName: "advance_time",
      context,
      result: {
        success: true,
        status: "success",
        result: { minutes: 10 },
        authority: {
          toolResultId: "tool-advance-time",
          campaignId: "campaign-1",
          sourceEntity: { type: "player", id: "actor-player" },
          baseWorldVersion: 1,
          resultWorldVersion: 2,
          worldTimeMinutes: 20,
          elapsedWorldTimeMinutes: 10,
          stateDeltaRefs: ["world:time"],
          eventRefs: [],
          witnesses: [],
          knowledgeOutputs: [],
          visibilityOutputs: [],
          resources: [],
        },
      },
    });

    expect(context.authority?.baseWorldVersion).toBe(2);
    expect(context.authority?.elapsedWorldTimeMinutes).toBe(0);
  });

  it("requires typed time semantics before player-turn advance_time can execute", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(validateToolInputGrounding({
      toolName: "advance_time",
      toolInput: {
        minutes: 10,
        reason: "Mira waits at the counter.",
      },
      context,
    })).toMatchObject({
      code: "missing_time_semantics",
      path: "input",
    });

    const timeContext = createPlayerTurnToolExecutionContext({
      frame: createFrame(),
      allowedWriteScopes: ["world:time"],
      timePassageAllowed: true,
    });
    expect(validateToolInputGrounding({
      toolName: "advance_time",
      toolInput: {
        minutes: 10,
        reason: "Mira waits at the counter.",
      },
      context: timeContext,
    })).toBeNull();
  });

  it("rejects state-bearing object-form contexts when write scopes are omitted", () => {
    const context = createPlayerTurnToolExecutionContext({
      frame: createFrame(),
    });

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "comparison",
        truthStatus: "disputed",
        factKind: "contradiction",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance:
          "The unresolved mismatch should guide which office Mira asks before choosing a route.",
        summary: "The posted date and Mira's route log do not currently agree.",
        claims: [
          {
            claimKind: "contradiction",
            polarity: "unknown",
            subjectText: "posted date vs route log",
            summary: "The date mismatch is unresolved.",
          },
        ],
        subjectRefs: ["current_scene"],
        sourceRefs: ["current_location", "Player"],
      },
      context,
    })).toMatchObject({
      code: "missing_write_scope",
      path: "input",
    });
  });

  it("rejects state-bearing tools outside descriptor-owned write scopes", () => {
    const context = createPlayerTurnToolExecutionContext({
      frame: createFrame(),
      allowedWriteScopes: ["world:event"],
    });

    expect(writeScopesForRuntimeToolNames(["record_world_fact", "log_event"])).toEqual([
      "world:fact",
      "world:event",
    ]);
    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "comparison",
        truthStatus: "disputed",
        factKind: "contradiction",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance:
          "The unresolved mismatch should guide which office Mira asks before choosing a route.",
        summary: "The posted date and Mira's route log do not currently agree.",
        claims: [
          {
            claimKind: "contradiction",
            polarity: "unknown",
            subjectText: "posted date vs route log",
            summary: "The date mismatch is unresolved.",
          },
        ],
        subjectRefs: ["current_scene"],
        sourceRefs: ["current_location", "Player"],
      },
      context,
    })).toMatchObject({
      code: "missing_write_scope",
      path: "input",
    });
  });

  it("requires every actual state-bearing write scope before execution", () => {
    const missingLocationScope = createPlayerTurnToolExecutionContext({
      frame: createFrame(),
      allowedWriteScopes: ["npc:*"],
    });

    expect(validateToolInputGrounding({
      toolName: "create_scene_extra",
      toolInput: {
        locationRef: "current_scene",
        role: "clerk",
        tags: [],
        persistence: "temporary",
        visibility: "visible",
        reason: "A local clerk is needed to answer a route question.",
      },
      context: missingLocationScope,
    })).toMatchObject({
      code: "missing_write_scope",
      path: "input",
    });

    const itemOnlyScope = createPlayerTurnToolExecutionContext({
      frame: {
        ...createFrame(),
        targetCandidates: [{
          id: "item:item-route-permit",
          type: "item",
          label: "Stamped Route Permit",
          itemId: "item-route-permit",
          awareness: "clear",
          tags: ["document", "permit"],
        }],
        playerInventory: [{
          id: "current-inventory:item-route-permit",
          itemId: "item-route-permit",
          label: "Stamped Route Permit",
          tags: ["document", "permit"],
          equipState: "carried",
          equippedSlot: null,
          isSignature: false,
        }],
      },
      allowedWriteScopes: ["item:*:state"],
    });

    expect(validateToolInputGrounding({
      toolName: "add_tag",
      toolInput: {
        entityName: "target_stamped_route_permit",
        entityType: "item",
        tag: "verified",
      },
      context: itemOnlyScope,
    })).toBeNull();
  });

  it("requires durable dialogue to be pre-authorized for dialogue, event, and fact writes", () => {
    const durableDialogueInput = {
      speakerRef: "person_road_warden",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "procedure",
      authorityKind: "witness",
      truthStatus: "speaker_asserted",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The answer can guide a later route choice.",
      quote: "Use the records counter before crossing.",
      summary: "The warden names the records counter as the required next stop.",
      claims: [{
        claimKind: "procedure",
        polarity: "states",
        subjectText: "route procedure",
        summary: "The records counter is required before crossing.",
      }],
      stateEffects: [],
      sourceRefs: ["person_road_warden", "Player"],
    };

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: durableDialogueInput,
      context: createPlayerTurnToolExecutionContext({
        frame: createFrame(),
        allowedWriteScopes: ["world:dialogue"],
      }),
    })).toMatchObject({
      code: "missing_write_scope",
      path: "input",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: durableDialogueInput,
      context: createPlayerTurnToolExecutionContext({
        frame: createFrame(),
        allowedWriteScopes: ["world:dialogue", "world:event", "world:fact"],
      }),
    })).toBeNull();
  });

  it("requires quick actions to cite visible or known source refs", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(validateToolInputGrounding({
      toolName: "offer_quick_actions",
      toolInput: {
        actions: [
          {
            label: "Ask",
            action: "Ask the road warden what changed.",
            sourceRefs: ["person_road_warden"],
          },
          {
            label: "Look",
            action: "Look over the current scene.",
            sourceRefs: ["current_scene"],
          },
          {
            label: "Wait",
            action: "Wait beside Mira Voss.",
            sourceRefs: ["Player"],
          },
        ],
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "offer_quick_actions",
      toolInput: {
        actions: [
          {
            label: "Use hidden pass",
            action: "Use the hidden pass to skip the gate.",
            sourceRefs: ["actor:npc-hidden-officer"],
          },
        ],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.actions.0.sourceRefs.0",
    });
  });

  it("requires quick actions to own the quick-action write scope", () => {
    const context = createPlayerTurnToolExecutionContext({
      frame: createFrame(),
      allowedWriteScopes: ["world:event"],
    });

    expect(validateToolInputGrounding({
      toolName: "offer_quick_actions",
      toolInput: {
        actions: [
          {
            label: "Ask",
            action: "Ask what changed.",
            sourceRefs: ["current_scene"],
          },
          {
            label: "Look",
            action: "Look over the current scene.",
            sourceRefs: ["current_scene"],
          },
          {
            label: "Wait",
            action: "Wait for a response.",
            sourceRefs: ["Player"],
          },
        ],
      },
      context,
    })).toMatchObject({
      code: "missing_write_scope",
      path: "input",
    });
  });

  it("rejects unsafe contested-outcome evidence refs before observation results can replay them", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(validateToolInputGrounding({
      toolName: "request_contested_outcome",
      toolInput: {
        actorName: "Player",
        targetName: "person_road_warden",
        mode: "contest",
        intent: "test the warden's nerve",
        stakes: "whether the warden gives ground",
        evidenceRefs: ["actor:npc-road-warden"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.evidenceRefs.0",
    });

    expect(validateToolInputGrounding({
      toolName: "request_contested_outcome",
      toolInput: {
        actorName: "Player",
        targetName: "person_road_warden",
        mode: "contest",
        intent: "test the warden's nerve",
        stakes: "whether the warden gives ground",
        evidenceRefs: ["person_road_warden", "current_scene"],
      },
      context,
    })).toBeNull();
  });

  it("grounds dialogue outcomes structurally instead of parsing answer prose", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "person_road_warden",
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "proof",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "durable",
        futureUseKind: "permission_check",
        futureRelevance: "The proof requirement controls later lawful passage attempts.",
        quote: "Bringt eine versiegelte Bescheinigung.",
        summary: "The warden names the required proof.",
        claims: [
          {
            claimKind: "requirement",
            polarity: "requires",
            subjectText: "sealed certificate",
            summary: "A sealed certificate is required.",
          },
        ],
        sourceRefs: ["person_road_warden", "Player"],
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "person_road_warden",
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance: "The office route controls later lawful filing attempts.",
        quote: "\"Records questions go through the pier office.\"",
        summary: "The warden names the correct office route.",
        claims: [
          {
            claimKind: "route_status",
            polarity: "states",
            subjectText: "records office",
            summary: "Records questions go through the pier office.",
          },
        ],
        sourceRefs: ["person_road_warden", "current_player"],
      },
      context,
    })).toBeNull();

    const offscreenOfficeOutcome = {
      speakerRef: "person_road_warden",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "route",
      authorityKind: "role_authority",
      truthStatus: "speaker_asserted",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The named tariff checkpoint controls the next lawful route choice.",
      quote: "\"Take it to Tower Bridge Concourse for the permit stamp.\"",
      summary: "The warden names an offscreen tariff checkpoint.",
      claims: [
        {
          claimKind: "route_status",
          polarity: "requires",
          subjectRef: "Tower Bridge Concourse",
          subjectText: "Tower Bridge Concourse tariff checkpoint",
          summary: "Tower Bridge Concourse is the required permit-verification checkpoint.",
        },
      ],
      sourceRefs: ["person_road_warden", "Player"],
    };
    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: offscreenOfficeOutcome,
      context,
    })).toBeNull();
    expect(normalizeToolInputForGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: offscreenOfficeOutcome,
      context,
    })).toMatchObject({
      claims: [
        expect.not.objectContaining({ subjectRef: expect.any(String) }),
      ],
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        ...offscreenOfficeOutcome,
        claims: [
          {
            claimKind: "route_status",
            polarity: "requires",
            subjectRef: "actor:actor-player",
            subjectText: "player backend handle",
            summary: "A backend handle must not be accepted as text fallback.",
          },
        ],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.claims.0.subjectRef",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "Player",
        addresseeRefs: ["person_road_warden"],
        outcomeKind: "answered",
        topicKind: "proof",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "scene_local",
        summary: "The player answers their own proof question.",
        sourceRefs: ["Player"],
      },
      context,
    })).toMatchObject({
      code: "invalid_speaker_ref",
      path: "input.speakerRef",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "Hidden Officer",
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "proof",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "scene_local",
        summary: "A hidden officer answers.",
        sourceRefs: ["Hidden Officer"],
      },
      context,
    })).toMatchObject({
      code: "invalid_speaker_ref",
      path: "input.speakerRef",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "person_road_warden",
        addresseeRefs: ["Player"],
        outcomeKind: "refused",
        topicKind: "status",
        authorityKind: "no_visible_authority",
        truthStatus: "speaker_asserted",
        durability: "durable",
        futureUseKind: "npc_memory",
        futureRelevance: "The refusal affects later attempts to ask Road Warden for status rumors.",
        summary: "The warden refuses to answer a status question.",
      sourceRefs: ["person_road_warden"],
      },
      context,
    })).toMatchObject({
      code: "invalid_speaker_ref",
      path: "input.authorityKind",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        addresseeRefs: ["Player"],
        outcomeKind: "no_current_answer",
        topicKind: "procedure",
        authorityKind: "no_visible_authority",
        truthStatus: "unconfirmed",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance: "The missing dispatcher response pushes the player toward another public source.",
        requestedRoleText: "dispatcher",
        summary: "No dispatcher can be reached from this counter right now.",
        sourceRefs: ["current_scene", "Player"],
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        addresseeRefs: ["Player"],
        outcomeKind: "no_current_answer",
        topicKind: "procedure",
        authorityKind: "no_visible_authority",
        truthStatus: "unconfirmed",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance: "The missing dispatcher response pushes the player toward another public source.",
        requestedRoleText: "dispatcher",
        summary: "No dispatcher can be reached from this counter right now.",
        sourceRefs: ["dispatcher"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.sourceRefs.0",
    });
  });

  it("rejects substituting a visible NPC for a prose-only addressed role", () => {
    const context = createPlayerTurnToolExecutionContext(withFrameWriteScopes({
      frame: createFrame(),
      addressedTarget: { kind: "prose_role", roleText: "bored attendant" },
    }));

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "person_road_warden",
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "scene_local",
        requestedRoleText: "bored attendant",
        summary: "The road warden answers for the attendant.",
      },
      context,
    })).toMatchObject({
      code: "addressed_target_mismatch",
      path: "input.speakerRef",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        addresseeRefs: ["Player"],
        outcomeKind: "no_current_answer",
        topicKind: "procedure",
        authorityKind: "no_visible_authority",
        truthStatus: "unconfirmed",
        durability: "scene_local",
        requestedRoleText: "bored attendant",
        summary: "No current attendant is visible at the records hatch.",
      },
      context,
    })).toBeNull();
  });

  it("allows a same-turn created support actor to answer the prose-only addressed role", () => {
    const context = createPlayerTurnToolExecutionContext(withFrameWriteScopes({
      frame: createFrame(),
      addressedTarget: { kind: "prose_role", roleText: "bored attendant" },
    }));

    applySuccessfulToolObservationToExecutionContext({
      toolName: "create_scene_extra",
      context,
      result: {
        success: true,
        result: {
          id: "support-bored-attendant",
          actorId: "npc-bored-attendant",
          name: "Bored Attendant",
          roleText: "bored attendant",
        },
      },
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "new_actor_1",
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "public_service",
        truthStatus: "speaker_asserted",
        durability: "scene_local",
        requestedRoleText: "bored attendant",
        summary: "The bored attendant answers from the hatch.",
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "new_actor_1",
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "public_service",
        truthStatus: "speaker_asserted",
        durability: "scene_local",
        summary: "The same created attendant answers without restating the role text.",
      },
      context,
    })).toBeNull();
  });

  it("allows a same-turn scene extra when its creation reason echoes the addressed prose role", () => {
    const context = createPlayerTurnToolExecutionContext(withFrameWriteScopes({
      frame: createFrame(),
      addressedTarget: { kind: "prose_role", roleText: "nearest engineer" },
    }));

    applySuccessfulToolObservationToExecutionContext({
      toolName: "create_scene_extra",
      toolInput: {
        locationRef: "current_scene",
        role: "support",
        roleText: "Aqueduct span engineer working near the junction box",
        name: "Engineer Corraden",
        reason:
          "The player called to the nearest engineer for procedural information about the Midspan Control Chamber.",
      },
      context,
      result: {
        success: true,
        result: {
          id: "support-engineer-corraden",
          actorId: "npc-engineer-corraden",
          name: "Engineer Corraden",
          roleText: "Aqueduct span engineer working near the junction box",
        },
      },
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "new_actor_1",
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "public_service",
        truthStatus: "speaker_asserted",
        durability: "scene_local",
        requestedRoleText: "nearest engineer",
        summary: "The engineer answers from the aqueduct rim.",
      },
      context,
    })).toBeNull();
  });

  it("does not let an unrelated same-turn scene extra satisfy the addressed prose role", () => {
    const context = createPlayerTurnToolExecutionContext(withFrameWriteScopes({
      frame: createFrame(),
      addressedTarget: { kind: "prose_role", roleText: "dispatch clerk" },
    }));

    applySuccessfulToolObservationToExecutionContext({
      toolName: "create_scene_extra",
      toolInput: {
        locationRef: "current_scene",
        role: "witness",
        roleText: "nearby onlooker",
        name: "Local Witness",
        reason: "A bystander watches the gate.",
      },
      context,
      result: {
        success: true,
        result: {
          id: "support-local-witness",
          actorId: "npc-local-witness",
          name: "Local Witness",
          roleText: "nearby onlooker",
        },
      },
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "new_actor_1",
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "public_service",
        truthStatus: "speaker_asserted",
        durability: "scene_local",
        requestedRoleText: "dispatch clerk",
        summary: "The witness answers for the clerk.",
      },
      context,
    })).toMatchObject({
      code: "addressed_target_mismatch",
      path: "input.speakerRef",
    });
  });

  it("enforces no-visible-authority binding as no speaker and no current answer", () => {
    const context = createPlayerTurnToolExecutionContext(withFrameWriteScopes({
      frame: createFrame(),
      addressedTarget: { kind: "no_visible_authority", roleText: "dispatch clerk" },
    }));

    applySuccessfulToolObservationToExecutionContext({
      toolName: "create_scene_extra",
      context,
      result: {
        success: true,
        result: {
          id: "support-dispatch-clerk",
          actorId: "npc-dispatch-clerk",
          name: "Dispatch Clerk",
          roleText: "dispatch clerk",
        },
      },
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "new_actor_1",
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "public_service",
        truthStatus: "speaker_asserted",
        durability: "scene_local",
        requestedRoleText: "dispatch clerk",
        summary: "The created clerk answers anyway.",
        sourceRefs: ["new_actor_1"],
      },
      context,
    })).toMatchObject({
      code: "addressed_target_mismatch",
      path: "input.outcomeKind",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        addresseeRefs: ["Player"],
        outcomeKind: "no_current_answer",
        topicKind: "procedure",
        authorityKind: "role_authority",
        truthStatus: "unconfirmed",
        durability: "scene_local",
        requestedRoleText: "dispatch clerk",
        summary: "No dispatch clerk can be reached.",
        sourceRefs: ["current_scene"],
      },
      context,
    })).toMatchObject({
      code: "addressed_target_mismatch",
      path: "input.authorityKind",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        addresseeRefs: ["Player"],
        outcomeKind: "no_current_answer",
        topicKind: "procedure",
        authorityKind: "no_visible_authority",
        truthStatus: "unconfirmed",
        durability: "scene_local",
        requestedRoleText: "dispatch clerk",
        summary: "No dispatch clerk can be reached.",
        sourceRefs: ["current_scene"],
      },
      context,
    })).toBeNull();
  });

  it("grounds world facts with explicit source refs instead of parsing summary prose", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "comparison",
        truthStatus: "disputed",
        factKind: "contradiction",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance:
          "The unresolved mismatch should guide which office Mira asks before choosing a route.",
        summary:
          "The posted date and Mira's route log do not currently agree.",
        claims: [
          {
            claimKind: "contradiction",
            polarity: "unknown",
            subjectText: "posted date vs route log",
            summary: "The date mismatch is unresolved.",
          },
        ],
        subjectRefs: ["current_scene"],
        sourceRefs: ["current_location", "Player"],
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "comparison",
        truthStatus: "disputed",
        factKind: "contradiction",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance:
          "The unresolved mismatch should guide which office Mira asks before choosing a route.",
        summary:
          "A hidden archive contradicts the route log.",
        claims: [
          {
            claimKind: "contradiction",
            polarity: "unknown",
            subjectRef: "Hidden Archive",
            summary: "The hidden archive creates a contradiction.",
          },
        ],
        sourceRefs: ["Hidden Archive"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.sourceRefs.0",
      invalidRef: "Hidden Archive",
      refHints: expect.arrayContaining(["current_location"]),
    });
  });

  it("rejects backend refs embedded in player-turn model-authored text fields", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());
    context.backendOnlyRefs?.add("clerkinternal44");

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "comparison",
        truthStatus: "disputed",
        factKind: "contradiction",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance:
          "The contradiction controls which office Mira asks before choosing a route.",
        summary:
          "The hidden actor:secret-witness record contradicts the public route log.",
        claims: [
          {
            claimKind: "contradiction",
            polarity: "unknown",
            subjectText: "route log mismatch",
            summary: "The mismatch is unresolved.",
          },
        ],
        sourceRefs: ["Player"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.summary",
    });

    expect(validateToolInputGrounding({
      toolName: "log_event",
      toolInput: {
        text: "The player remembers tool-result-7 as proof.",
        importance: 5,
        participants: ["Player"],
        durability: "durable",
        futureRelevance: "The proof claim should matter later.",
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.text",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        addresseeRefs: ["person_road_warden"],
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "speaker_claim",
        truthStatus: "claimed",
        durability: "scene_local",
        speakerRef: "person_road_warden",
        summary: "The answer mentions clerkInternal44 by backend handle.",
        sourceRefs: ["person_road_warden"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.summary",
      invalidRef: "clerkinternal44",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "proof",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "scene_local",
        speakerRef: "person_road_warden",
        summary:
          "The Road Warden accepts the Authority-issued chit at the scene-local route-dispatching desk.",
        futureRelevance:
          "The Authority-issued chit can be cited if the player asks another route-dispatching guard.",
        sourceRefs: ["person_road_warden"],
      },
      context,
    })).toBeNull();
  });

  it("requires an applied item-state receipt for backend-settled document status claims", () => {
    const context = createPlayerTurnToolExecutionContext({
      ...createFrame(),
      targetCandidates: [{
        id: "target-logbook",
        type: "item",
        itemId: "item-logbook",
        label: "Courier route logbook",
        awareness: "clear",
        tags: ["document"],
      }],
      playerInventory: [{
        id: "inventory-logbook",
        itemId: "item-logbook",
        label: "Courier route logbook",
        tags: ["document"],
        equipState: "equipped",
        equippedSlot: "equipped",
        isSignature: true,
      }],
    });
    const stampedLogbookOutcome = {
      speakerRef: "person_road_warden",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "proof",
      authorityKind: "role_authority",
      truthStatus: "settled_by_backend",
      durability: "durable",
      futureUseKind: "evidence",
      futureRelevance: "The stamped logbook can be cited at the next checkpoint.",
      quote: "\"I stamped your logbook for the overland route.\"",
      summary: "The warden confirms the logbook status.",
      claims: [
        {
          claimKind: "document_status",
          polarity: "states",
          subjectRef: "target_courier_route_logbook",
          summary: "The courier route logbook now has the overland instruction stamp.",
        },
      ],
      sourceRefs: ["person_road_warden", "target_courier_route_logbook"],
    };

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: stampedLogbookOutcome,
      context,
    })).toMatchObject({
      code: "missing_structural_claim",
      path: "input.claims.0",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        ...stampedLogbookOutcome,
        truthStatus: "speaker_asserted",
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        ...stampedLogbookOutcome,
        stateEffects: [{ status: "applied_now" }],
      },
      context,
    })).toBeNull();
  });

  it("does not promote weak player-known facts into observed or verified world facts", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());
    context.bridgeLookup?.playerKnownFacts.push({
      id: "fact1",
      summary: "claimed: The ledger is already sealed.",
      visibilityRoute: "player_known",
      truthStatus: "claimed",
      confidence: 0.55,
      sourceRefs: [],
    });

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "claim",
        truthStatus: "verified",
        factKind: "public_record",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "evidence",
        futureRelevance: "The ledger status would govern later proof checks.",
        summary: "The ledger is sealed.",
        claims: [
          {
            claimKind: "public_record",
            polarity: "states",
            subjectText: "ledger",
            summary: "The ledger is sealed.",
          },
        ],
        sourceRefs: ["fact1"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.sourceRefs",
      invalidRef: "fact1",
    });

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "claim",
        truthStatus: "claimed",
        factKind: "public_record",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "evidence",
        futureRelevance: "The ledger status claim can be questioned later.",
        summary: "Someone claims the ledger is sealed.",
        claims: [
          {
            claimKind: "public_record",
            polarity: "states",
            subjectText: "ledger claim",
            summary: "The ledger is only claimed to be sealed.",
          },
        ],
        sourceRefs: ["fact1"],
      },
      context,
    })).toBeNull();
  });

  it("treats unresolved claim subject refs as text only when subjectText already carries the label", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());
    const worldFactInput = {
      sourceKind: "comparison",
      truthStatus: "disputed",
      factKind: "route_status",
      topicKind: "route",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The offscreen checkpoint label can guide which office the player asks about next.",
      summary: "The warden's direction names an offscreen tariff checkpoint.",
      claims: [
        {
          claimKind: "route_status",
          polarity: "states",
          subjectRef: "Tower Bridge Concourse",
          subjectText: "Tower Bridge Concourse tariff checkpoint",
          summary: "The checkpoint is named as an offscreen route target.",
        },
      ],
        sourceRefs: ["person_road_warden"],
    };

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: worldFactInput,
      context,
    })).toBeNull();
    expect(normalizeToolInputForGrounding({
      toolName: "record_world_fact",
      toolInput: worldFactInput,
      context,
    })).toMatchObject({
      claims: [
        expect.not.objectContaining({ subjectRef: expect.any(String) }),
      ],
    });

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        ...worldFactInput,
        claims: [
          {
            claimKind: "route_status",
            polarity: "states",
            subjectRef: "Tower Bridge Concourse",
            summary: "Missing subjectText means the unresolved ref cannot be accepted.",
          },
        ],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.claims.0.subjectRef",
    });
  });

  it("keeps validation ref hints model-facing instead of leaking opaque refs", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());
    for (const safeAlias of ["fact1", "route1", "actor1", "person_guard"]) {
      context.legalActorRefs.add(safeAlias);
    }
    for (const backendOnlyRef of [
      "miraInternal42",
      "pierInternal77",
      "backRoomInternal99",
      "counterInternal88",
    ]) {
      context.legalActorRefs.add(backendOnlyRef);
      context.backendOnlyRefs?.add(backendOnlyRef.toLowerCase());
    }
    for (const backendOnlyRef of [
      "actor:hidden-watcher",
      "actor_hidden",
      "route_hidden_path",
      "tool-result-7",
      "source:event-1",
      "550e8400-e29b-41d4-a716-446655440000",
    ]) {
      context.legalActorRefs.add(backendOnlyRef);
    }

    const issue = validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "comparison",
        truthStatus: "disputed",
        factKind: "contradiction",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance: "The contradiction controls which office Mira asks next.",
        summary: "The hidden archive does not match the public route log.",
        claims: [
          {
            claimKind: "contradiction",
            polarity: "unknown",
            subjectText: "hidden archive vs route log",
            summary: "The hidden archive is not an exposed source.",
          },
        ],
        sourceRefs: ["550e8400-e29b-41d4-a716-446655440000"],
      },
      context,
    });

    expect(issue).toMatchObject({
      code: "invalid_source_ref",
      path: "input.sourceRefs.0",
    });
    expect(issue?.refHints).toEqual(expect.arrayContaining([
      "player",
      "current_player",
      "person_road_warden",
      "current_location",
      "current_scene",
      "fact1",
      "route1",
      "actor1",
      "person_guard",
    ]));
    const serializedHints = JSON.stringify(issue?.refHints ?? []);
    expect(serializedHints).not.toContain("actor-player");
    expect(serializedHints).not.toContain("loc-pier");
    expect(serializedHints).not.toContain("scene-counter");
    expect(serializedHints).not.toContain("actor:");
    expect(serializedHints).not.toContain("location:");
    expect(serializedHints).not.toContain("actor_hidden");
    expect(serializedHints).not.toContain("route_hidden_path");
    expect(serializedHints).not.toContain("tool-result-7");
    expect(serializedHints).not.toContain("source:event-1");
    expect(serializedHints).not.toContain("550e8400");
    expect(serializedHints).not.toContain("miraInternal42");
    expect(serializedHints).not.toContain("pierInternal77");
    expect(serializedHints).not.toContain("backRoomInternal99");
    expect(serializedHints).not.toContain("counterInternal88");
  });

  it("lets terminal tools consume refs returned by successful same-turn helper observations", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    applySuccessfulToolObservationToExecutionContext({
      toolName: "inspect_known_fact",
      context,
      result: buildObservationToolResult({
        result: {
          toolName: "inspect_known_fact",
          observationOnly: true,
          found: true,
          facts: [
            {
              ref: "visible_fact:posted-date-gap",
              id: "visible_fact:posted-date-gap",
              summary: "The posted date and route log disagree.",
              terminalSourceRefs: ["visible_fact:posted-date-gap", "current_location"],
              sourceRefs: ["visible_fact:posted-date-gap", "current_location"],
              observationOnly: true,
            },
          ],
        },
        modelSafeRefs: ["visible_fact:posted-date-gap", "current_location"],
      }),
    });

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "comparison",
        truthStatus: "disputed",
        factKind: "contradiction",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance:
          "The contradiction controls which office Mira asks before choosing a route.",
        summary: "The posted date and route log do not currently agree.",
        claims: [
          {
            claimKind: "contradiction",
            polarity: "unknown",
            subjectRef: "visible_fact:posted-date-gap",
            summary: "The date mismatch is unresolved.",
          },
        ],
        subjectRefs: ["visible_fact:posted-date-gap"],
        sourceRefs: ["visible_fact:posted-date-gap"],
      },
      context,
    })).toBeNull();
  });

  it("does not promote observation-only scene-extra payload actor refs into later dialogue tools", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    applySuccessfulToolObservationToExecutionContext({
      toolName: "create_scene_extra",
      context,
      result: buildObservationToolResult({
        result: {
          kind: "scene_extra",
          observationOnly: true,
          reusedExisting: true,
          id: "npc-hidden-gondolier",
          name: "Gondolier",
          delegateTool: "existing_npc",
        },
      }),
    });

    expect(context.legalActorRefs.has("gondolier")).toBe(false);
    expect(context.legalActorRefs.has("actor:npc-hidden-gondolier")).toBe(false);
    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "Gondolier",
        addresseeRefs: ["Player"],
        outcomeKind: "answered",
        topicKind: "status",
        authorityKind: "witness",
        truthStatus: "speaker_asserted",
        durability: "durable",
        futureUseKind: "permission_check",
        futureRelevance: "The witness answer would matter later if the speaker were actually visible.",
        summary: "The gondolier says what the wardens said about courier delays.",
        claims: [
          {
            claimKind: "delay",
            polarity: "states",
            subjectText: "courier delay",
            summary: "The witness names a delay.",
          },
        ],
        sourceRefs: ["Gondolier", "Player"],
      },
      context,
    })).toMatchObject({
      code: "invalid_speaker_ref",
      path: "input.speakerRef",
    });
  });

  it("rejects raw player-known backend provenance refs even when internally resolvable", () => {
    const context = createPlayerTurnToolExecutionContext({
      ...createFrame(),
      targetCandidates: [],
    });
    context.bridgeLookup?.playerKnownFacts.push({
      id: "knowledge:posted-date-gap",
      summary: "The posted date and route log disagree.",
      visibilityRoute: "player_known",
      confidence: 0.9,
      sourceRefs: ["event:counter-warning", "authority:notice-board"],
    });

    for (const ref of ["knowledge:posted-date-gap", "event:counter-warning", "authority:notice-board"]) {
      expect(validateToolInputGrounding({
        toolName: "record_world_fact",
        toolInput: {
          sourceKind: "comparison",
          truthStatus: "disputed",
          factKind: "contradiction",
          topicKind: "procedure",
          durability: "durable",
          futureUseKind: "route_choice",
          futureRelevance: "The contradiction controls which office Mira asks next.",
          summary: "The posted date and route log disagree.",
          claims: [
            {
              claimKind: "contradiction",
              polarity: "unknown",
              subjectRef: ref,
              summary: "The source is internally known but not model-facing.",
            },
          ],
          sourceRefs: [ref],
        },
        context,
      })).toMatchObject({
        code: "invalid_source_ref",
        invalidRef: ref,
      });
    }
  });

  it("does not promote arbitrary helper payload ids when modelSafeRefs are absent", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    applySuccessfulToolObservationToExecutionContext({
      toolName: "inspect_known_fact",
      context,
      result: buildObservationToolResult({
        result: {
          toolName: "inspect_known_fact",
          observationOnly: true,
          found: true,
          facts: [
            {
              ref: "visible_fact:unwhitelisted-gap",
              id: "visible_fact:unwhitelisted-gap",
              summary: "A helper returned a display-only fact without a terminal whitelist.",
              terminalSourceRefs: ["visible_fact:unwhitelisted-gap"],
              observationOnly: true,
            },
          ],
        },
      }),
    });

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "comparison",
        truthStatus: "disputed",
        factKind: "contradiction",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance:
          "The contradiction controls which office Mira asks before choosing a route.",
        summary: "The helper payload did not explicitly whitelist the ref.",
        claims: [
          {
            claimKind: "contradiction",
            polarity: "unknown",
            subjectRef: "visible_fact:unwhitelisted-gap",
            summary: "The ref remains non-consumable.",
          },
        ],
        sourceRefs: ["visible_fact:unwhitelisted-gap"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.sourceRefs.0",
      invalidRef: "visible_fact:unwhitelisted-gap",
    });
  });

  it("does not promote arbitrary mutation payload ids into later source refs", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    applySuccessfulToolObservationToExecutionContext({
      toolName: "record_player_intent",
      context,
      result: {
        success: true,
        result: {
          kind: "player_intent_recorded",
          intentId: "intent-secret-handle",
          targetHint: "unwhitelisted-intent-target",
          status: "active",
        },
      },
    });

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "claim",
        truthStatus: "claimed",
        factKind: "lead",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance: "The claimed lead would guide later routing if it were grounded.",
        summary: "The intent payload is not an explicit evidence receipt.",
        claims: [
          {
            claimKind: "lead",
            polarity: "states",
            subjectRef: "intent-secret-handle",
            summary: "The handle remains non-consumable.",
          },
        ],
        sourceRefs: ["intent-secret-handle"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.sourceRefs.0",
      invalidRef: "intent-secret-handle",
    });
  });

  it("does not let player-turn tools consume legacy same-turn mutation refs", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());
    context.sameTurnResultRefs?.add("mutation-secret-handle");

    expect(validateToolInputGrounding({
      toolName: "offer_quick_actions",
      toolInput: {
        actions: [{
          label: "Follow stale mutation",
          action: "Follow the stale mutation handle.",
          sourceRefs: ["mutation-secret-handle"],
        }],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.actions.0.sourceRefs.0",
      invalidRef: "mutation-secret-handle",
    });

    expect(validateToolInputGrounding({
      toolName: "record_world_fact",
      toolInput: {
        sourceKind: "claim",
        truthStatus: "claimed",
        factKind: "lead",
        topicKind: "procedure",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance: "The stale mutation handle must not become evidence.",
        summary: "The stale mutation handle is not model-safe evidence.",
        claims: [
          {
            claimKind: "lead",
            polarity: "states",
            subjectRef: "mutation-secret-handle",
            summary: "The stale mutation handle remains non-consumable.",
          },
        ],
        sourceRefs: ["mutation-secret-handle"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.sourceRefs.0",
      invalidRef: "mutation-secret-handle",
    });
  });
});
