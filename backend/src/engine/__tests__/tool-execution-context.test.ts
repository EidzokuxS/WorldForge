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
  it("treats current scene and location labels as legal aliases without accepting remote labels", () => {
    const context = createPlayerTurnToolExecutionContext(createFrame());

    expect(context.currentLocationRefs.has("lantern-lit gondola pier")).toBe(true);
    expect(context.currentSceneRefs.has("pier records counter")).toBe(true);
    expect(context.legalLocationRefs.has("lantern-lit gondola pier")).toBe(true);
    expect(context.legalLocationRefs.has("pier records counter")).toBe(true);
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
    expect(context.legalMovementRefs.has("recessed counting stair")).toBe(true);
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
    expect(context.currentSceneRefs.has("current_scene")).toBe(true);

    applySuccessfulToolObservationToExecutionContext({
      toolName: "spawn_npc",
      context,
      result: {
        success: true,
        result: { id: "npc-ledger-porter", name: "Ledger Porter" },
      },
    });

    expect(context.legalActorRefs.has("ledger porter")).toBe(true);
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
    expect(validateToolInputGrounding({
      toolName: "transfer_item",
      toolInput: {
        itemName: "Waxed-Cloth Manifest",
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
});
