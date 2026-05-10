import { describe, expect, it } from "vitest";

import {
  buildRecordPlayerIntentResult,
  buildStartSearchResult,
  prepareCreateMinorPoiInput,
  prepareCreateSceneExtraInput,
  prepareMoveActorInput,
} from "../bridge-state-tools.js";
import { dynamicCreationBudgetKey } from "../gm-tool-budget.js";
import type { ToolExecutionContext } from "../tool-execution-context.js";
import { runtimeToolInputSchemas } from "../tool-schemas.js";

function createContext(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    scope: "player_turn",
    subjectActorId: "player-1",
    subjectActorRefs: new Set(["player-1", "iria", "player"]),
    currentLocationId: "loc-market",
    currentSceneScopeId: "scene-market-counter",
    legalLocationRefs: new Set([
      "current_location",
      "current_scene",
      "loc-market",
      "scene-market-counter",
      "loc-tea-lane",
      "Tea Lane",
    ].map((value) => value.toLowerCase())),
    legalActorRefs: new Set(["player-1", "iria", "player"]),
    legalItemRefs: new Set(),
    legalFactionRefs: new Set(),
    currentLocationRefs: new Set(["current_location", "loc-market", "market district"]),
    currentSceneRefs: new Set(["current_scene", "scene-market-counter", "market counter"]),
    legalMovementRefs: new Set(["route-tea-lane", "loc-tea-lane", "tea lane"]),
    bridgeLookup: {
      current: {
        campaignId: "campaign-1",
        tick: 4,
        playerActorId: "player-1",
        currentLocationId: "loc-market",
        currentSceneScopeId: "scene-market-counter",
        currentLocationName: "Market District",
        currentSceneScopeName: "Market Counter",
      },
      visibleActors: [],
      awarenessHints: [],
      legalTargets: [],
      legalMovement: [
        {
          id: "route-tea-lane",
          locationId: "loc-tea-lane",
          label: "Tea Lane",
          connected: true,
          travelCost: 1,
          path: ["Market District", "Tea Lane"],
        },
      ],
      localRecentEvents: [],
      playerKnownFacts: [],
      allowedTools: ["move_actor"],
    },
    ...overrides,
  };
}

describe("bridge state tool constraints", () => {
  it("schemas expose all Phase 90 state-bearing bridge tools", () => {
    expect(runtimeToolInputSchemas.move_actor.safeParse({
      actorRef: "Iria",
      destinationRef: "Tea Lane",
      evidenceRefs: ["route-tea-lane"],
    }).success).toBe(true);
    expect(runtimeToolInputSchemas.create_minor_poi.safeParse({
      poiType: "tea_stall",
      reason: "A public market supports ordinary tea service.",
    }).success).toBe(true);
    expect(runtimeToolInputSchemas.create_scene_extra.safeParse({
      role: "courier",
      reason: "A courier desk needs a temporary clerk.",
    }).success).toBe(true);
    expect(runtimeToolInputSchemas.start_search.safeParse({
      query: "tea stall",
    }).success).toBe(true);
    expect(runtimeToolInputSchemas.record_player_intent.safeParse({
      intentType: "seek",
      targetHint: "tea stall",
    }).success).toBe(true);
  });

  it("requires subject actor and legal route evidence for move_actor", () => {
    const context = createContext();

    const accepted = prepareMoveActorInput({
      actorRef: "Iria",
      destinationRef: "Tea Lane",
      routeId: "route-tea-lane",
      evidenceRefs: ["route-tea-lane"],
      intentSummary: "Iria follows the obvious route.",
    }, context);
    const remote = prepareMoveActorInput({
      actorRef: "Iria",
      destinationRef: "Remote Outpost",
      evidenceRefs: ["Remote Outpost"],
    }, context);
    const wrongActor = prepareMoveActorInput({
      actorRef: "Hidden Auditor",
      destinationRef: "Tea Lane",
      evidenceRefs: ["route-tea-lane"],
    }, context);

    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.value.targetLocationName).toBe("loc-tea-lane");
      expect(accepted.value.actorRefs).toContain("Iria");
    }
    expect(remote.ok).toBe(false);
    expect(wrongActor.ok).toBe(false);
  });

  it("allows only ordinary local low-impact minor POIs", () => {
    const context = createContext();
    const allowedTypes = [
      "tea_stall",
      "street_vendor",
      "shrine_desk",
      "notice_board",
      "courier_desk",
    ] as const;

    for (const poiType of allowedTypes) {
      expect(prepareCreateMinorPoiInput({
        areaRef: "current_location",
        poiType,
        reason: "The public local area supports a mundane service.",
      }, context).ok).toBe(true);
    }

    for (const name of [
      "Faction Headquarters",
      "Secret Vault",
      "Rare Weapon Shop",
      "Key NPC Office",
      "Remote Plot-Critical Archive",
    ]) {
      const rejected = prepareCreateMinorPoiInput({
        areaRef: "current_location",
        poiType: "tea_stall",
        name,
        reason: "The player asked for a dramatic place.",
      }, context);
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) {
        expect(rejected.issue.message).toContain("rejects high-impact");
      }
    }
  });

  it("creates only temporary current-scope scene extras", () => {
    const context = createContext();

    const accepted = prepareCreateSceneExtraInput({
      locationRef: "current_scene",
      role: "witness",
      reason: "A local witness can answer a routine question.",
    }, context);
    const persistent = prepareCreateSceneExtraInput({
      locationRef: "current_scene",
      role: "support",
      persistence: "persistent",
      reason: "Keep this actor forever.",
    }, context);
    const keyNpc = prepareCreateSceneExtraInput({
      locationRef: "current_scene",
      role: "support",
      name: "Key NPC faction leader",
      reason: "The scene needs a key NPC.",
    }, context);

    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.value.tags).toEqual(expect.arrayContaining(["temporary", "scene-extra"]));
    }
    expect(persistent.ok).toBe(false);
    expect(keyNpc.ok).toBe(false);
  });

  it("records search and player intent without inventing discovery or truth", () => {
    const search = buildStartSearchResult({
      actorRef: "Iria",
      query: "tea stall",
      method: "browse",
    }, createContext());
    const intent = buildRecordPlayerIntentResult({
      actorRef: "Iria",
      intentType: "claim",
      targetHint: "the courier knows a hidden route",
      stance: "claims",
    }, createContext());

    expect(search.ok).toBe(true);
    expect(intent.ok).toBe(true);
    if (search.ok) {
      expect(search.value).toMatchObject({
        kind: "search_started",
        found: false,
        discoveryCreated: false,
        targetTruth: "unconfirmed",
      });
    }
    if (intent.ok) {
      expect(intent.value).toMatchObject({
        kind: "player_intent_recorded",
        claimTruth: "unconfirmed",
        proofCreated: false,
        discoveryCreated: false,
      });
    }
  });

  it("budgets repeated equivalent minor POI and scene extra creation", () => {
    expect(dynamicCreationBudgetKey({
      toolName: "create_minor_poi",
      input: {
        areaRef: "current_location",
        poiType: "tea_stall",
        name: "Lantern Tea Stall",
      },
    })).toBe(dynamicCreationBudgetKey({
      toolName: "create_minor_poi",
      input: {
        areaRef: "current_location",
        poiType: "tea_stall",
        name: "Other Tea Stall",
      },
    }));

    expect(dynamicCreationBudgetKey({
      toolName: "create_scene_extra",
      input: {
        locationRef: "current_scene",
        role: "courier",
        name: "Courier One",
      },
    })).toBe(dynamicCreationBudgetKey({
      toolName: "create_scene_extra",
      input: {
        locationRef: "current_scene",
        role: "courier",
        name: "Courier Two",
      },
    }));
  });
});
