import { describe, expect, it } from "vitest";

import {
  applySuccessfulToolObservationToExecutionContext,
  createPlayerTurnToolExecutionContext,
  validateToolInputGrounding,
} from "../tool-execution-context.js";
import type { SceneFrame } from "../scene-frame.js";

function createFrame(): SceneFrame {
  return {
    campaignId: "campaign-1",
    tick: 12,
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
  it("accepts model-facing actor-prefixed refs for the current player only", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(context.subjectActorRefs.has("actor:actor-player")).toBe(true);
    expect(validateToolInputGrounding({
      toolName: "record_player_intent",
      toolInput: {
        actorRef: "actor:actor-player",
        intentType: "ask",
        targetHint: "Road Warden",
        stance: "asks",
      },
      context,
    })).toBeNull();
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
    })).toBeNull();

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
        speakerRef: "actor:support-local-courier",
        addresseeRefs: ["Mira Voss"],
        outcomeKind: "answered",
        topicKind: "status",
        authorityKind: "witness",
        truthStatus: "speaker_asserted",
        durability: "durable",
        futureUseKind: "permission_check",
        futureRelevance: "The courier's named office can shape later wardens' permission checks.",
        summary: "The local courier names the office currently speaking for the wardens.",
        claims: [
          {
            claimKind: "office",
            polarity: "states",
            subjectText: "warden spokesperson office",
            summary: "The courier identifies the public office speaking for the wardens today.",
          },
        ],
        sourceRefs: ["actor:support-local-courier", "Mira Voss"],
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
        itemName: "item:item-waxed-cloth-manifest",
        targetName: "Mira Voss",
        targetType: "character",
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
        speakerRef: "Mira Voss",
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
        subjectRefs: ["location:scene-counter"],
        sourceRefs: ["location:loc-pier", "Mira Voss"],
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
    });
  });
});
