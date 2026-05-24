import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { campaigns } from "../../db/schema.js";
import {
  applySuccessfulToolObservationToExecutionContext,
  createActorTurnToolExecutionContext,
  createBackgroundToolExecutionContext,
  createPlayerTurnToolExecutionContext,
  validateToolInputGrounding,
} from "../tool-execution-context.js";
import { buildObservationToolResult } from "../tool-result.js";
import type { ActorFrame } from "../actor-frame.js";
import type { SceneFrame } from "../scene-frame.js";

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
    allowedTools: ["reveal_location"],
    oracle: null,
  };
}

describe("createPlayerTurnToolExecutionContext", () => {
  it("defaults player, background, and actor authority elapsed time to zero", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-tool-context-"));
    try {
      connectDb(path.join(tempDir, "state.db"));
      runMigrations();
      getDb().insert(campaigns).values({
        id: "campaign-1",
        name: "Tool Context",
        premise: "A deterministic context test campaign.",
        createdAt: 100,
        updatedAt: 100,
      }).run();

      const frame = createFrame();
      const playerContext = createPlayerTurnToolExecutionContext(frame);
      expect(playerContext.authority).toMatchObject({
        baseWorldVersion: 0,
        elapsedWorldTimeMinutes: 0,
      });

      const backgroundContext = createBackgroundToolExecutionContext({
        campaignId: "campaign-1",
        sourceEntity: { type: "system", id: "test-background" },
        baseWorldVersion: 2,
      });
      expect(backgroundContext.authority).toMatchObject({
        baseWorldVersion: 2,
        elapsedWorldTimeMinutes: 0,
      });

      const actorFrame: ActorFrame = {
        campaignId: "campaign-1",
        worldVersion: 2,
        observer: {
          id: "actor-road-warden",
          actorId: "npc-road-warden",
          label: "Road Warden",
          type: "npc",
          locationId: "loc-pier",
          sceneScopeId: "scene-counter",
        },
        playerActionRequest: "I open the records hatch beside the counter.",
        facts: [],
        legalTools: ["log_event"],
        constraints: [],
        contextBudgetTrace: {} as never,
        hiddenExcludedCount: 0,
      };
      const actorContext = createActorTurnToolExecutionContext({
        sceneFrame: frame,
        actorFrame,
        baseWorldVersion: 2,
      });
      expect(actorContext.authority).toMatchObject({
        baseWorldVersion: 2,
        elapsedWorldTimeMinutes: 0,
      });
    } finally {
      closeDb();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects backend-only actor refs for player-turn bridge tools", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(context.subjectActorRefs.has("actor:actor-player")).toBe(true);
    expect(validateToolInputGrounding({
      toolName: "record_player_intent",
      toolInput: {
        actorRef: "Mira Voss",
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

  it("grounds quick action offers in visible refs and rejects backend refs in choices", () => {
    const context = createPlayerTurnToolExecutionContext({
      ...createFrame(),
      allowedTools: ["offer_quick_actions"],
    });
    const actions = [
      { label: "Ask", action: "Ask the Road Warden for details." },
      { label: "Watch", action: "Watch the records counter." },
      { label: "Move", action: "Step back into the pier crowd." },
    ];

    expect(validateToolInputGrounding({
      toolName: "offer_quick_actions",
      toolInput: {
        actions,
        sourceRefs: ["current_scene", "Road Warden"],
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "offer_quick_actions",
      toolInput: {
        actions,
        sourceRefs: ["actor:hidden-listener"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.sourceRefs.0",
    });

    expect(validateToolInputGrounding({
      toolName: "offer_quick_actions",
      toolInput: {
        actions: [
          { label: "Ask actor:hidden-listener", action: "Ask for details." },
          { label: "Watch", action: "Watch the records counter." },
          { label: "Move", action: "Step back into the pier crowd." },
        ],
        sourceRefs: ["current_scene"],
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.actions.0.label",
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

    expect(context.legalActorRefs.has("cafe clerk")).toBe(true);
    expect(context.legalActorRefs.has("npc-cafe-clerk")).toBe(true);
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

    expect(context.subjectActorRefs.has("actor_player")).toBe(true);
    expect(context.currentLocationRefs.has("loc_pier")).toBe(true);

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

    expect(context.legalActorRefs.has("mirainternal42")).toBe(true);
    expect(context.legalMovementRefs.has("backroominternal99")).toBe(true);
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
        targetName: "Mira Voss",
        condition: "winded",
        intensity: "minor",
      },
      context,
    })).toBeNull();
    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "Road Warden",
        addresseeRefs: ["miraInternal42"],
        sourceRefs: ["Road Warden"],
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
        speakerRef: "Road Warden",
        addresseeRefs: ["Mira Voss"],
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
        actorName: "Mira Voss",
        targetName: "Road Warden",
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
      toolInput: { targetLocationName: "Back Room" },
      context,
    })).toBeNull();
  });

  it("treats current scene and location labels as legal aliases without accepting remote labels", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(context.currentLocationRefs.has("lantern-lit gondola pier")).toBe(true);
    expect(context.currentLocationRefs.has("location:loc-pier")).toBe(true);
    expect(context.currentSceneRefs.has("pier records counter")).toBe(true);
    expect(context.currentSceneRefs.has("location:scene-counter")).toBe(true);
    expect(context.legalLocationRefs.has("lantern-lit gondola pier")).toBe(true);
    expect(context.legalLocationRefs.has("pier records counter")).toBe(true);
    expect(context.legalLocationRefs.has("location:loc-pier")).toBe(true);
    expect(context.legalLocationRefs.has("location:scene-counter")).toBe(true);
    expect(context.legalLocationRefs.has("forest outpost")).toBe(false);

    expect(validateToolInputGrounding({
      toolName: "reveal_location",
      toolInput: {
        name: "Pier Records Back Room",
        description: "A cramped back room behind the counter.",
        tags: ["records"],
        connectedToName: "Lantern-Lit Gondola Pier",
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

    applySuccessfulToolObservationToExecutionContext({
      toolName: "reveal_location",
      context,
      result: {
        success: true,
        result: {
          id: "loc-recessed-counting-stair",
          name: "Recessed Counting Stair",
          connectedTo: "Pier Records Counter",
        },
      },
    });

    expect(context.legalLocationRefs.has("loc-recessed-counting-stair")).toBe(true);
    expect(context.legalLocationRefs.has("location:loc-recessed-counting-stair")).toBe(true);
    expect(context.legalMovementRefs.has("recessed counting stair")).toBe(true);
    expect(context.legalMovementRefs.has("location:loc-recessed-counting-stair")).toBe(true);
    expect(validateToolInputGrounding({
      toolName: "move_to",
      toolInput: { targetLocationName: "Recessed Counting Stair" },
      context,
    })).toBeNull();
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
    expect(context.currentLocationRefs.has("recessed counting stair")).toBe(true);
    expect(context.currentLocationRefs.has("location:loc-recessed-counting-stair")).toBe(true);
    expect(context.currentSceneRefs.has("current_scene")).toBe(true);
    expect(context.currentSceneRefs.has("location:loc-recessed-counting-stair")).toBe(true);

    applySuccessfulToolObservationToExecutionContext({
      toolName: "spawn_npc",
      context,
      result: {
        success: true,
        result: { id: "npc-ledger-porter", name: "Ledger Porter" },
      },
    });

    expect(context.legalActorRefs.has("ledger porter")).toBe(true);
    expect(context.legalActorRefs.has("actor:npc-ledger-porter")).toBe(true);
    expect(validateToolInputGrounding({
      toolName: "spawn_item",
      toolInput: {
        name: "Waxed-Cloth Manifest",
        tags: ["manifest", "persistent"],
        ownerName: "Ledger Porter",
        ownerType: "character",
      },
      context,
    })).toBeNull();

    applySuccessfulToolObservationToExecutionContext({
      toolName: "create_scene_extra",
      context,
      result: {
        success: true,
        result: { id: "support-local-courier", name: "Local Courier" },
      },
    });

    expect(context.legalActorRefs.has("local courier")).toBe(true);
    expect(context.legalActorRefs.has("actor:support-local-courier")).toBe(true);
    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "Local Courier",
        addresseeRefs: ["Mira Voss"],
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
        sourceRefs: ["Local Courier", "Mira Voss"],
      },
      context,
    })).toBeNull();

    applySuccessfulToolObservationToExecutionContext({
      toolName: "spawn_item",
      context,
      result: {
        success: true,
        result: {
          id: "item-waxed-cloth-manifest",
          name: "Waxed-Cloth Manifest",
          owner: "Ledger Porter",
          ownerType: "character",
        },
      },
    });

    expect(context.legalItemRefs.has("waxed-cloth manifest")).toBe(true);
    expect(context.legalItemRefs.has("item:item-waxed-cloth-manifest")).toBe(true);
    expect(validateToolInputGrounding({
      toolName: "transfer_item",
      toolInput: {
        itemName: "Waxed-Cloth Manifest",
        targetName: "Mira Voss",
        targetType: "character",
      },
      context,
    })).toBeNull();
    expect(validateToolInputGrounding({
      toolName: "transfer_item",
      toolInput: {
        itemName: "Waxed-Cloth Manifest",
        targetName: "Mira Voss",
        targetType: "npc",
      },
      context,
    })).toBeNull();

    applySuccessfulToolObservationToExecutionContext({
      toolName: "transfer_item",
      context,
      result: {
        success: true,
        result: {
          item: "Counter Receipt",
          splitFrom: "Waxed-Cloth Manifest",
          remainingItem: "Manifest Stub",
          target: "Road Warden",
          partialTransfer: true,
        },
        authority: {
          toolResultId: "tool-transfer-counter-receipt",
          campaignId: "campaign-1",
          sourceEntity: { type: "player", id: "actor-player" },
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
      },
    });

    expect(context.legalItemRefs.has("counter receipt")).toBe(true);
    expect(context.legalItemRefs.has("manifest stub")).toBe(true);
    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "Road Warden",
        addresseeRefs: ["Mira Voss"],
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
            subjectRef: "Counter Receipt",
            summary: "The counter receipt exists as the current proof object.",
          },
        ],
        sourceRefs: ["Counter Receipt"],
      },
      context,
    })).toBeNull();
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
        targetName: "Mira Voss",
        targetType: "character",
      },
      context,
    })).toMatchObject({
      code: "unexposed_item_ref",
      path: "input.itemName",
    });
  });

  it("rejects unsupported durable access claims instead of making them legal facts", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(validateToolInputGrounding({
      toolName: "log_event",
      toolInput: {
        text: "Mira Voss has a master key and opens the sealed records office.",
        importance: 8,
        participants: ["Mira Voss"],
        durability: "durable",
        futureRelevance: "The claimed key would grant office access.",
      },
      context,
    })).toMatchObject({
      code: "unsupported_action_claim",
      path: "input.text",
    });
  });

  it("rejects unsafe contested-outcome evidence refs before observation results can replay them", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(validateToolInputGrounding({
      toolName: "request_contested_outcome",
      toolInput: {
        actorName: "Mira Voss",
        targetName: "Road Warden",
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
        actorName: "Mira Voss",
        targetName: "Road Warden",
        mode: "contest",
        intent: "test the warden's nerve",
        stakes: "whether the warden gives ground",
        evidenceRefs: ["Road Warden", "current_scene"],
      },
      context,
    })).toBeNull();
  });

  it("grounds dialogue outcomes structurally instead of parsing answer prose", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "Road Warden",
        addresseeRefs: ["Mira Voss"],
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
        sourceRefs: ["Road Warden", "Mira Voss"],
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "Road Warden",
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
        sourceRefs: ["Road Warden", "current_player"],
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "Player",
        addresseeRefs: ["Mira Voss"],
        outcomeKind: "answered",
        topicKind: "proof",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "scene_local",
        summary: "The player answers their own proof question.",
        sourceRefs: ["Mira Voss"],
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
        addresseeRefs: ["Mira Voss"],
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
        speakerRef: "Road Warden",
        addresseeRefs: ["Mira Voss"],
        outcomeKind: "refused",
        topicKind: "status",
        authorityKind: "no_visible_authority",
        truthStatus: "speaker_asserted",
        durability: "durable",
        futureUseKind: "npc_memory",
        futureRelevance: "The refusal affects later attempts to ask Road Warden for status rumors.",
        summary: "The warden refuses to answer a status question.",
        sourceRefs: ["Road Warden"],
      },
      context,
    })).toMatchObject({
      code: "invalid_speaker_ref",
      path: "input.authorityKind",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        addresseeRefs: ["Mira Voss"],
        outcomeKind: "no_current_answer",
        topicKind: "procedure",
        authorityKind: "no_visible_authority",
        truthStatus: "unconfirmed",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance: "The missing dispatcher response pushes the player toward another public source.",
        requestedRoleText: "dispatcher",
        summary: "No dispatcher can be reached from this counter right now.",
        sourceRefs: ["current_scene", "Mira Voss"],
      },
      context,
    })).toBeNull();

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        addresseeRefs: ["Mira Voss"],
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
    const context = createPlayerTurnToolExecutionContext({
      frame: createFrame(),
      addressedTarget: { kind: "prose_role", roleText: "bored attendant" },
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        speakerRef: "Road Warden",
        addresseeRefs: ["Mira Voss"],
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
        addresseeRefs: ["Mira Voss"],
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
    const context = createPlayerTurnToolExecutionContext({
      frame: createFrame(),
      addressedTarget: { kind: "prose_role", roleText: "bored attendant" },
    });

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
        speakerRef: "Bored Attendant",
        addresseeRefs: ["Mira Voss"],
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
        speakerRef: "Bored Attendant",
        addresseeRefs: ["Mira Voss"],
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
    const context = createPlayerTurnToolExecutionContext({
      frame: createFrame(),
      addressedTarget: { kind: "prose_role", roleText: "nearest engineer" },
    });

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
        speakerRef: "Engineer Corraden",
        addresseeRefs: ["Mira Voss"],
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
    const context = createPlayerTurnToolExecutionContext({
      frame: createFrame(),
      addressedTarget: { kind: "prose_role", roleText: "dispatch clerk" },
    });

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
        speakerRef: "Local Witness",
        addresseeRefs: ["Mira Voss"],
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
    const context = createPlayerTurnToolExecutionContext({
      frame: createFrame(),
      addressedTarget: { kind: "no_visible_authority", roleText: "dispatch clerk" },
    });

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
        speakerRef: "Dispatch Clerk",
        addresseeRefs: ["Mira Voss"],
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "public_service",
        truthStatus: "speaker_asserted",
        durability: "scene_local",
        requestedRoleText: "dispatch clerk",
        summary: "The created clerk answers anyway.",
        sourceRefs: ["Dispatch Clerk"],
      },
      context,
    })).toMatchObject({
      code: "addressed_target_mismatch",
      path: "input.outcomeKind",
    });

    expect(validateToolInputGrounding({
      toolName: "record_dialogue_outcome",
      toolInput: {
        addresseeRefs: ["Mira Voss"],
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
        addresseeRefs: ["Mira Voss"],
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
        subjectRefs: ["Pier Records Counter"],
        sourceRefs: ["Lantern-Lit Gondola Pier", "Mira Voss"],
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
        sourceRefs: ["Mira Voss"],
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
        participants: ["Mira Voss"],
        durability: "durable",
        futureRelevance: "The proof claim should matter later.",
      },
      context,
    })).toMatchObject({
      code: "invalid_source_ref",
      path: "input.text",
    });
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
      "current_location",
      "current_scene",
      "fact1",
      "route1",
      "actor1",
      "person_guard",
      "mira voss",
      "road warden",
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
        addresseeRefs: ["Mira Voss"],
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
        sourceRefs: ["Gondolier", "Mira Voss"],
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
});
