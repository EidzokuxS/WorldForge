import { describe, expect, it } from "vitest";
import {
  executeBridgeCandidateTool,
  type BridgeKnownFactSnapshot,
} from "../bridge-candidate-tools.js";
import type { SceneFrame } from "../scene-frame.js";
import { createPlayerTurnToolExecutionContext } from "../tool-execution-context.js";
import { isObservationToolResult } from "../tool-result.js";

function createFrame(): SceneFrame {
  return {
    campaignId: "campaign-bridge",
    tick: 12,
    playerActorId: "actor-player",
    currentLocationId: "loc-market",
    currentSceneScopeId: "scene-market",
    currentLocationName: "Canal Market",
    currentSceneScopeName: "Canal Market Counter",
    playerAction: "иду дальше по логичному маршруту и ищу чайную лавку",
    roster: {
      active: [
        {
          id: "actor-player",
          actorId: "actor-player",
          type: "player",
          label: "Player",
          locationId: "loc-market",
          sceneScopeId: "scene-market",
          awareness: "clear",
        },
        {
          id: "npc-warden",
          actorId: "npc-warden",
          type: "npc",
          label: "Road Warden",
          locationId: "loc-market",
          sceneScopeId: "scene-market",
          awareness: "clear",
          tags: ["guide", "route"],
        },
      ],
      support: [
        {
          id: "npc-hidden",
          actorId: "npc-hidden",
          type: "npc",
          label: "Shadow Broker",
          locationId: "loc-market",
          sceneScopeId: "scene-market",
          awareness: "hint",
          awarenessHint: "someone watches from the crowd",
          tags: ["private"],
        },
      ],
      background: [
        {
          id: "npc-offscreen",
          actorId: "npc-offscreen",
          type: "npc",
          label: "Vault Keeper",
          locationId: "loc-vault",
          sceneScopeId: "loc-vault",
          awareness: "none",
        },
      ],
    },
    perception: {
      playerAwarenessHints: ["a public tea aroma drifts from the east lane"],
      actorAwareness: {},
      forbiddenActorLabels: ["Shadow Broker", "Vault Keeper"],
    },
    recentEvents: [
      {
        id: "event-tea-visible",
        tick: 11,
        summary: "A tea seller was heard calling from the east lane.",
        source: "location_recent_event",
        actorIds: [],
        perceivableByPlayer: true,
      },
      {
        id: "event-shadow-hidden",
        tick: 11,
        summary: "Shadow Broker reserved the private vault route.",
        source: "location_recent_event",
        actorIds: ["npc-hidden"],
        perceivableByPlayer: false,
      },
    ],
    targetCandidates: [
      {
        id: "actor:npc-warden",
        type: "actor",
        label: "Road Warden",
        actorId: "npc-warden",
        awareness: "clear",
        tags: ["guide", "route"],
      },
      {
        id: "actor:npc-hidden",
        type: "actor",
        label: "Shadow Broker",
        actorId: "npc-hidden",
        awareness: "hint",
        tags: ["private"],
      },
      {
        id: "item:tea-sign",
        type: "item",
        label: "Painted Tea Sign",
        itemId: "item-tea-sign",
        locationId: "loc-market",
        tags: ["tea", "shop", "sign"],
      },
      {
        id: "location:loc-tea-lane",
        type: "location",
        label: "East Tea Lane",
        locationId: "loc-tea-lane",
        tags: ["tea", "shop"],
      },
    ],
    movementCandidates: [
      {
        id: "edge-tea-lane",
        locationId: "loc-tea-lane",
        label: "East Tea Lane",
        connected: true,
        travelCost: 4,
        path: ["loc-market", "loc-tea-lane"],
      },
      {
        id: "edge-private-vault",
        locationId: "loc-private-vault",
        label: "Shadow Broker Vault",
        connected: true,
        travelCost: 1,
        path: ["loc-market", "loc-private-vault"],
      },
    ],
    deferredHooks: [],
    allowedTools: [
      "find_poi_candidates",
      "inspect_known_fact",
      "check_route",
      "find_actor_candidates",
      "find_location_candidates",
    ],
    oracle: null,
  };
}

function createContext() {
  const context = createPlayerTurnToolExecutionContext(createFrame());
  context.authority = {
    baseWorldVersion: 5,
    sourceEntity: { type: "player", id: "actor-player" },
    elapsedWorldTimeMinutes: 1,
  };
  const knownFact: BridgeKnownFactSnapshot = {
    id: "knowledge:tea-route",
    summary: "reported: The east lane usually has a public tea stall.",
    visibilityRoute: "player_known",
    confidence: 0.7,
    sourceRefs: ["knowledge-tea", "event-tea-visible"],
  };
  context.bridgeLookup?.playerKnownFacts.push(knownFact);
  return context;
}

describe("bridge candidate lookup tools", () => {
  it("returns observation-only fuzzy POI and location candidates from visible/legal refs", () => {
    const context = createContext();

    const result = executeBridgeCandidateTool(
      "find_poi_candidates",
      { query: "чай tea лавка", tags: ["shop"], maxResults: 4 },
      context,
    );

    expect(result.success).toBe(true);
    expect(isObservationToolResult(result)).toBe(true);
    expect(result.authority).toBeUndefined();
    expect(JSON.stringify(result)).toContain("East Tea Lane");
    expect(JSON.stringify(result)).toContain("Painted Tea Sign");
    expect(JSON.stringify(result)).not.toContain("Shadow Broker");
    expect(JSON.stringify(result)).not.toContain("Vault Keeper");
  });

  it("matches only clear visible actors and omits hidden/offscreen actor names", () => {
    const context = createContext();

    const visible = executeBridgeCandidateTool(
      "find_actor_candidates",
      { query: "warden", maxResults: 4 },
      context,
    );
    const hidden = executeBridgeCandidateTool(
      "find_actor_candidates",
      { query: "shadow", maxResults: 4 },
      context,
    );

    expect(JSON.stringify(visible)).toContain("Road Warden");
    expect(JSON.stringify(hidden)).not.toContain("Shadow Broker");
    expect(JSON.stringify(hidden)).not.toContain("Vault Keeper");
    expect(hidden.success).toBe(true);
  });

  it("inspects visible and player-known facts while denying private facts without leaked names", () => {
    const context = createContext();
    const baseWorldVersion = context.authority?.baseWorldVersion;

    const visible = executeBridgeCandidateTool(
      "inspect_known_fact",
      { query: "tea stall", maxResults: 2 },
      context,
    );
    const hidden = executeBridgeCandidateTool(
      "inspect_known_fact",
      { query: "Shadow Broker private vault", maxResults: 2 },
      context,
    );

    expect(visible.success).toBe(true);
    expect(JSON.stringify(visible)).toContain("east lane usually has a public tea stall");
    expect(JSON.stringify(visible)).toContain("player_known");
    expect(hidden.success).toBe(false);
    expect(hidden.error).toBe("no_player_visible_or_known_fact");
    expect(JSON.stringify(hidden)).not.toContain("Shadow Broker");
    expect(JSON.stringify(hidden)).not.toContain("private vault");
    expect(context.authority?.baseWorldVersion).toBe(baseWorldVersion);
  });

  it("checks only visible legal routes and does not mutate authority state", () => {
    const context = createContext();
    const baseWorldVersion = context.authority?.baseWorldVersion;

    const legal = executeBridgeCandidateTool(
      "check_route",
      { actorRef: "Player", destinationRef: "East Tea Lane", mode: "walk" },
      context,
    );
    const denied = executeBridgeCandidateTool(
      "check_route",
      { actorRef: "Player", destinationRef: "Secret Vault", mode: "walk" },
      context,
    );

    expect(legal).toMatchObject({
      success: true,
      kind: "observation",
      observationOnly: true,
      result: expect.objectContaining({
        routeStatus: "legal",
        cost: 4,
        path: ["loc-market", "loc-tea-lane"],
      }),
    });
    expect(denied.success).toBe(false);
    expect(JSON.stringify(denied)).not.toContain("Secret Vault");
    expect(context.authority?.baseWorldVersion).toBe(baseWorldVersion);
  });

  it("supports the tourist courier route/POI lookup sequence without exact-ID target prompts", () => {
    const context = createContext();

    const navigation = executeBridgeCandidateTool(
      "list_navigation_options",
      { maxResults: 4 },
      context,
    );
    const location = executeBridgeCandidateTool(
      "find_location_candidates",
      { query: "logical route East Tea Lane", tags: ["tea"], maxResults: 4 },
      context,
    );
    const poi = executeBridgeCandidateTool(
      "find_poi_candidates",
      { query: "чайная лавка", tags: ["tea", "shop"], includePotential: true, maxResults: 4 },
      context,
    );
    const visibleFact = executeBridgeCandidateTool(
      "inspect_known_fact",
      { query: "public tea stall", maxResults: 2 },
      context,
    );
    const route = executeBridgeCandidateTool(
      "check_route",
      { actorRef: "Player", destinationRef: "East Tea Lane", mode: "walk" },
      context,
    );

    expect(navigation.success).toBe(true);
    expect(location.success).toBe(true);
    expect(poi.success).toBe(true);
    expect(visibleFact.success).toBe(true);
    expect(route.success).toBe(true);
    expect(JSON.stringify([navigation, location, poi, visibleFact, route])).toContain("East Tea Lane");
    expect(JSON.stringify(poi)).toContain("Painted Tea Sign");
    expect(JSON.stringify(visibleFact)).toContain("player_known");
    expect(JSON.stringify([navigation, location, poi, visibleFact, route])).not.toMatch(
      /which connected location|exact route id|backend target/i,
    );
  });
});
