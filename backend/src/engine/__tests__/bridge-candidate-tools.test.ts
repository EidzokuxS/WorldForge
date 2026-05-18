import { describe, expect, it } from "vitest";
import {
  executeBridgeCandidateTool,
  type BridgeKnownFactSnapshot,
} from "../bridge-candidate-tools.js";
import type { SceneFrame } from "../scene-frame.js";
import { createPlayerTurnToolExecutionContext } from "../tool-execution-context.js";
import { isObservationToolResult } from "../tool-result.js";

const RAW_REFS = {
  campaign: "campaign:550e8400-e29b-41d4-a716-446655440000",
  player: "actor:550e8400-e29b-41d4-a716-446655440001",
  warden: "actor:550e8400-e29b-41d4-a716-446655440002",
  hidden: "actor:550e8400-e29b-41d4-a716-446655440003",
  offscreen: "actor:550e8400-e29b-41d4-a716-446655440004",
  market: "location:550e8400-e29b-41d4-a716-446655440005",
  scene: "scene:550e8400-e29b-41d4-a716-446655440006",
  teaLane: "location:550e8400-e29b-41d4-a716-446655440007",
  privateVault: "location:550e8400-e29b-41d4-a716-446655440008",
  teaSign: "item:550e8400-e29b-41d4-a716-446655440009",
  routeTeaLane: "route:550e8400-e29b-41d4-a716-446655440010",
  routePrivateVault: "route:550e8400-e29b-41d4-a716-446655440011",
  eventTea: "event:550e8400-e29b-41d4-a716-446655440012",
  eventHidden: "event:550e8400-e29b-41d4-a716-446655440013",
  knowledgeTea: "knowledge:550e8400-e29b-41d4-a716-446655440014",
  knowledgeTeaSource: "knowledge:550e8400-e29b-41d4-a716-446655440015",
};

const RAW_REF_VALUES = [
  ...Object.values(RAW_REFS),
  "candidate:550e8400-e29b-41d4-a716-446655440016",
  "candidate:550e8400-e29b-41d4-a716-446655440017",
  "candidate:550e8400-e29b-41d4-a716-446655440018",
  "candidate:550e8400-e29b-41d4-a716-446655440019",
  "actor:550e8400-e29b-41d4-a716-446655440020",
  "candidate:550e8400-e29b-41d4-a716-446655440021",
  "item:550e8400-e29b-41d4-a716-446655440022",
  "knowledge:550e8400-e29b-41d4-a716-446655440023",
  "event:550e8400-e29b-41d4-a716-446655440024",
];

function createFrame(): SceneFrame {
  return {
    campaignId: RAW_REFS.campaign,
    tick: 12,
    worldVersion: 0,
    playerActorId: RAW_REFS.player,
    currentLocationId: RAW_REFS.market,
    currentSceneScopeId: RAW_REFS.scene,
    currentLocationName: "Canal Market",
    currentSceneScopeName: "Canal Market Counter",
    currentLocationDescription:
      "Public exits run toward the east lane while a station camera watches the counter and a visible barrier rope controls the queue.",
    currentSceneScopeDescription:
      "The counter faces a crowd of witnesses and uniformed market personnel.",
    playerAction: "иду дальше по логичному маршруту и ищу чайную лавку",
    roster: {
      active: [
        {
          id: RAW_REFS.player,
          actorId: RAW_REFS.player,
          type: "player",
          label: "Player",
          locationId: RAW_REFS.market,
          sceneScopeId: RAW_REFS.scene,
          awareness: "clear",
        },
        {
          id: RAW_REFS.warden,
          actorId: RAW_REFS.warden,
          type: "npc",
          label: "Road Warden",
          locationId: RAW_REFS.market,
          sceneScopeId: RAW_REFS.scene,
          awareness: "clear",
          tags: ["guide", "route"],
        },
      ],
      support: [
        {
          id: RAW_REFS.hidden,
          actorId: RAW_REFS.hidden,
          type: "npc",
          label: "Shadow Broker",
          locationId: RAW_REFS.market,
          sceneScopeId: RAW_REFS.scene,
          awareness: "hint",
          awarenessHint: "someone watches from the crowd",
          tags: ["private"],
        },
      ],
      background: [
        {
          id: RAW_REFS.offscreen,
          actorId: RAW_REFS.offscreen,
          type: "npc",
          label: "Vault Keeper",
          locationId: RAW_REFS.privateVault,
          sceneScopeId: RAW_REFS.privateVault,
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
        id: RAW_REFS.eventTea,
        tick: 11,
        summary: "A tea seller was heard calling from the east lane.",
        source: "location_recent_event",
        actorIds: [],
        perceivableByPlayer: true,
      },
      {
        id: RAW_REFS.eventHidden,
        tick: 11,
        summary: "Shadow Broker reserved the private vault route.",
        source: "location_recent_event",
        actorIds: [RAW_REFS.hidden],
        perceivableByPlayer: false,
      },
    ],
    targetCandidates: [
      {
        id: "candidate:550e8400-e29b-41d4-a716-446655440016",
        type: "actor",
        label: "Road Warden",
        actorId: RAW_REFS.warden,
        awareness: "clear",
        tags: ["guide", "route"],
      },
      {
        id: "candidate:550e8400-e29b-41d4-a716-446655440017",
        type: "actor",
        label: "Shadow Broker",
        actorId: RAW_REFS.hidden,
        awareness: "hint",
        tags: ["private"],
      },
      {
        id: "candidate:550e8400-e29b-41d4-a716-446655440018",
        type: "item",
        label: "Painted Tea Sign",
        itemId: RAW_REFS.teaSign,
        locationId: RAW_REFS.market,
        tags: ["tea", "shop", "sign"],
      },
      {
        id: "candidate:550e8400-e29b-41d4-a716-446655440019",
        type: "location",
        label: "East Tea Lane",
        locationId: RAW_REFS.teaLane,
        tags: ["tea", "shop"],
      },
    ],
    movementCandidates: [
      {
        id: RAW_REFS.routeTeaLane,
        locationId: RAW_REFS.teaLane,
        label: "East Tea Lane",
        connected: true,
        travelCost: 4,
        path: [RAW_REFS.market, RAW_REFS.teaLane],
      },
      {
        id: RAW_REFS.routePrivateVault,
        locationId: RAW_REFS.privateVault,
        label: "Shadow Broker Vault",
        connected: true,
        travelCost: 1,
        path: [RAW_REFS.market, RAW_REFS.privateVault],
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
    sourceEntity: { type: "player", id: RAW_REFS.player },
    elapsedWorldTimeMinutes: 1,
  };
  const knownFact: BridgeKnownFactSnapshot = {
    id: RAW_REFS.knowledgeTea,
    summary: "reported: The east lane usually has a public tea stall.",
    visibilityRoute: "player_known",
    confidence: 0.7,
    sourceRefs: [RAW_REFS.knowledgeTeaSource, RAW_REFS.eventTea],
  };
  context.bridgeLookup?.playerKnownFacts.push(knownFact);
  return context;
}

function expectNoRawObservationRefs(result: unknown) {
  const json = JSON.stringify(result);
  for (const rawRef of RAW_REF_VALUES) {
    expect(json).not.toContain(rawRef);
  }
  expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu);
  expect(json).not.toMatch(/\b(?:actor|campaign|candidate|event|item|knowledge|location|route|scene):/iu);
  expect(json).not.toMatch(/"(?:actorId|campaignId|currentLocationId|currentSceneScopeId|id|ids|locationId|playerActorId|sourceRefs|terminalSourceRefs)"\s*:/u);
}

describe("bridge candidate lookup tools", () => {
  it("fails closed for invalid direct executor input instead of coercing manually", () => {
    const context = createContext();

    const result = executeBridgeCandidateTool(
      "find_location_candidates",
      { query: "East Tea Lane", maxResults: "4" },
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("invalid_tool_input");
    expect(result.result).toMatchObject({
      denied: true,
      reason: "invalid_tool_input",
      toolName: "find_location_candidates",
    });
    expect(JSON.stringify(result)).not.toContain("East Tea Lane");
  });

  it("sanitizes model-visible bridge lookup observations to aliases and labels", () => {
    const context = createContext();
    const locationLookup = executeBridgeCandidateTool(
      "find_location_candidates",
      { query: "East Tea Lane", maxResults: 4 },
      context,
    );
    const locationCandidateRef = (
      (locationLookup.result as { candidates?: Array<{ ref?: string }> }).candidates?.[0]?.ref
    ) ?? "East Tea Lane";
    const results = [
      executeBridgeCandidateTool("list_visible_affordances", { maxResults: 8 }, context),
      executeBridgeCandidateTool("list_navigation_options", { maxResults: 4 }, context),
      locationLookup,
      executeBridgeCandidateTool("find_object_candidates", { query: "Painted Tea Sign", maxResults: 4 }, context),
      executeBridgeCandidateTool("find_actor_candidates", { query: "Road Warden", maxResults: 4 }, context),
      executeBridgeCandidateTool(
        "find_poi_candidates",
        { query: "sealed noodle stall", includePotential: true, maxResults: 4 },
        context,
      ),
      executeBridgeCandidateTool("inspect_known_fact", { query: "public tea stall", maxResults: 2 }, context),
      executeBridgeCandidateTool(
        "check_route",
        { actorRef: "Player", destinationRef: locationCandidateRef, mode: "walk" },
        context,
      ),
    ];

    for (const result of results) {
      expect(result.success).toBe(true);
      expect(isObservationToolResult(result)).toBe(true);
      expectNoRawObservationRefs(result);
    }

    expect(JSON.stringify(results)).toContain("current_location");
    expect(JSON.stringify(results)).toContain("current_scene");
    expect(JSON.stringify(results)).toContain("actor2");
    expect(JSON.stringify(results)).toContain("route1");
    expect(JSON.stringify(results)).toContain("fact");
    expect(JSON.stringify(results)).toContain("potential_poi_1");
    expect(JSON.stringify(results)).toContain("East Tea Lane");
  });

  it("keeps inspect_known_fact visible and known scopes separate", () => {
    const context = createContext();

    const visibleResult = executeBridgeCandidateTool(
      "inspect_known_fact",
      { query: "usually stall", scope: "visible", maxResults: 4 },
      context,
    );
    expect(visibleResult.success).toBe(false);
    expect(visibleResult.error).toBe("no_player_visible_or_known_fact");

    const knownResult = executeBridgeCandidateTool(
      "inspect_known_fact",
      { query: "usually stall", scope: "known", maxResults: 4 },
      context,
    );
    expect(knownResult.success).toBe(true);
    expect(JSON.stringify(knownResult)).toContain("public tea stall");

    const knownCurrentSceneResult = executeBridgeCandidateTool(
      "inspect_known_fact",
      { query: "counter faces a crowd", scope: "known", maxResults: 4 },
      context,
    );
    expect(knownCurrentSceneResult.success).toBe(false);
    expect(knownCurrentSceneResult.error).toBe("no_player_visible_or_known_fact");
  });

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
    expect(result.modelSafeRefs).toEqual(
      expect.arrayContaining(["East Tea Lane", "Painted Tea Sign"]),
    );
    expect(result.modelSafeRefs ?? []).not.toEqual(
      expect.arrayContaining([RAW_REFS.market, RAW_REFS.teaLane, RAW_REFS.teaSign]),
    );
  });

  it("does not whitelist potential POI refs or raw route path ids for terminal tools", () => {
    const context = createContext();

    const potentialPoi = executeBridgeCandidateTool(
      "find_poi_candidates",
      { query: "sealed noodle stall", includePotential: true, maxResults: 4 },
      context,
    );
    const route = executeBridgeCandidateTool(
      "check_route",
      { actorRef: "Player", destinationRef: "East Tea Lane", mode: "walk" },
      context,
    );

    expect(JSON.stringify(potentialPoi)).toContain("potential_poi_1");
    expect(JSON.stringify(potentialPoi)).not.toContain("potential:");
    expect(potentialPoi.modelSafeRefs ?? []).not.toEqual(
      expect.arrayContaining([RAW_REFS.market, RAW_REFS.teaLane, "sealed noodle stall"]),
    );
    expect(route).toMatchObject({
      success: true,
      result: expect.objectContaining({
        path: expect.arrayContaining(["current_location", "East Tea Lane"]),
      }),
    });
    expect(route.modelSafeRefs ?? []).toEqual(
      expect.arrayContaining(["route1", "East Tea Lane"]),
    );
    expect(route.modelSafeRefs ?? []).not.toEqual(
      expect.arrayContaining([RAW_REFS.market, RAW_REFS.teaLane, RAW_REFS.routeTeaLane]),
    );
  });

  it("does not treat backend-looking query echoes as consumable observation refs", () => {
    const context = createContext();

    const result = executeBridgeCandidateTool(
      "find_poi_candidates",
      {
        query:
          "actor:hidden-watcher actor_hidden route_hidden_path tool-result-7 " +
          "source:event-1 550e8400-e29b-41d4-a716-446655440000",
        includePotential: true,
        maxResults: 4,
      },
      context,
    );

    expect(result.success).toBe(true);
    expect(JSON.stringify(result)).toContain("potential_poi_1");
    const refs = result.modelSafeRefs ?? [];
    expect(refs).not.toEqual(expect.arrayContaining([
      "potential_poi_1",
      "actor:hidden-watcher",
      "actor_hidden",
      "route_hidden_path",
      "tool-result-7",
      "source:event-1",
      "550e8400-e29b-41d4-a716-446655440000",
    ]));
  });

  it("does not use raw backend refs as lookup selectors or replay them from player-known facts", () => {
    const context = createContext();
    context.bridgeLookup?.playerKnownFacts.push({
      id: "knowledge:shadow-broker",
      summary:
        `reported: Shadow Broker ties ${RAW_REFS.hidden} to ${RAW_REFS.privateVault}.`,
      visibilityRoute: "player_known",
      confidence: 0.6,
      sourceRefs: [RAW_REFS.eventHidden, RAW_REFS.knowledgeTeaSource],
    });

    const affordances = executeBridgeCandidateTool(
      "list_visible_affordances",
      { maxResults: 8 },
      context,
    );
    const rawLocationSearch = executeBridgeCandidateTool(
      "find_location_candidates",
      { query: RAW_REFS.teaLane, maxResults: 4 },
      context,
    );
    const rawFactInspect = executeBridgeCandidateTool(
      "inspect_known_fact",
      { ref: RAW_REFS.knowledgeTea, maxResults: 2 },
      context,
    );
    const rawRouteCheck = executeBridgeCandidateTool(
      "check_route",
      { actorRef: "Player", destinationRef: RAW_REFS.routeTeaLane, mode: "walk" },
      context,
    );

    const affordancesJson = JSON.stringify(affordances);
    expect(affordancesJson).not.toContain("Shadow Broker");
    expect(affordancesJson).not.toContain(RAW_REFS.hidden);
    expect(affordancesJson).not.toContain(RAW_REFS.privateVault);
    expect(affordancesJson).toContain("[redacted]");
    expect(affordancesJson).toContain("[backend ref hidden]");

    expect(rawLocationSearch).toMatchObject({
      success: true,
      result: expect.objectContaining({
        queryMatched: false,
        count: 0,
      }),
    });
    expect(JSON.stringify(rawLocationSearch)).not.toContain("East Tea Lane");
    expect(rawFactInspect).toMatchObject({
      success: false,
      error: "backend_ref_not_model_facing",
    });
    expect(rawRouteCheck).toMatchObject({
      success: false,
      error: "backend_ref_not_model_facing",
    });
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
        path: expect.arrayContaining(["current_location", "East Tea Lane"]),
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

  it("groups visible observation affordances for routes, cameras, barriers, witnesses, and personnel without mutation", () => {
    const context = createContext();
    const baseWorldVersion = context.authority?.baseWorldVersion;
    context.bridgeLookup?.visibleActors.push({
      id: "actor:550e8400-e29b-41d4-a716-446655440020",
      actorId: "actor:550e8400-e29b-41d4-a716-446655440020",
      type: "npc",
      label: "Jujutsu Window",
      awareness: "clear",
      tags: ["jujutsu", "personnel", "witness"],
    });
    context.bridgeLookup?.legalTargets.push({
      id: "candidate:550e8400-e29b-41d4-a716-446655440021",
      type: "item",
      label: "Station CCTV Camera",
      itemId: "item:550e8400-e29b-41d4-a716-446655440022",
      locationId: RAW_REFS.market,
      tags: ["camera", "surveillance"],
    });
    context.bridgeLookup?.playerKnownFacts.push({
      id: "knowledge:550e8400-e29b-41d4-a716-446655440023",
      summary: "reported: A visible curtain barrier ripples beside the station fault line.",
      visibilityRoute: "player_known",
      confidence: 0.8,
      sourceRefs: ["event:550e8400-e29b-41d4-a716-446655440024", "barrier:550e8400-e29b-41d4-a716-446655440025"],
    });
    context.bridgeLookup?.localRecentEvents.push({
      id: "event:550e8400-e29b-41d4-a716-446655440024",
      tick: 12,
      summary: "Two station clerks point toward the exit map near the fault line.",
      source: "location_recent_event",
      actorIds: ["actor:550e8400-e29b-41d4-a716-446655440020"],
      perceivableByPlayer: true,
    });

    const result = executeBridgeCandidateTool(
      "list_visible_affordances",
      { scope: "visible", maxResults: 8 },
      context,
    );
    const resultJson = JSON.stringify(result);
    const payload = result.result as {
      categories: {
        exitsRoutes: unknown[];
        cameras: { targets: unknown[]; facts: unknown[]; absence: string | null };
        barriers: { targets: unknown[]; facts: unknown[]; absence: string | null };
        witnesses: { actors: unknown[]; facts: unknown[]; absence: string | null };
        personnel: { actors: unknown[]; facts: unknown[]; absence: string | null };
      };
      visibleFacts: unknown[];
    };

    expect(result.success).toBe(true);
    expect(isObservationToolResult(result)).toBe(true);
    expect(result.authority).toBeUndefined();
    expect(payload.categories.exitsRoutes).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "East Tea Lane" })]),
    );
    expect(payload.categories.cameras.targets).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Station CCTV Camera" })]),
    );
    expect(payload.categories.cameras.absence).toBeNull();
    expect(payload.categories.barriers.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: expect.stringMatching(/^fact\d+$/u),
          summary: expect.stringContaining("visible curtain barrier"),
        }),
      ]),
    );
    expect(payload.categories.cameras.facts).toEqual(
        expect.arrayContaining([
        expect.objectContaining({
          ref: "fact1",
          summary: expect.stringContaining("station camera"),
        }),
      ]),
    );
    expect(payload.categories.witnesses.actors).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Jujutsu Window" })]),
    );
    expect(payload.categories.personnel.actors).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Jujutsu Window" })]),
    );
    expect(payload.visibleFacts).toEqual(
        expect.arrayContaining([
        expect.objectContaining({ ref: "fact1" }),
        expect.objectContaining({ ref: "fact2" }),
        expect.objectContaining({
          ref: expect.stringMatching(/^fact\d+$/u),
          summary: expect.stringContaining("station clerks"),
        }),
      ]),
    );
    expect(result.modelSafeRefs ?? []).toEqual(
      expect.arrayContaining([
        "current_location",
        "current_scene",
        "fact1",
        "fact2",
      ]),
    );
    expect(result.modelSafeRefs ?? []).not.toEqual(
      expect.arrayContaining([
        RAW_REFS.market,
        RAW_REFS.scene,
        "actor:550e8400-e29b-41d4-a716-446655440020",
      ]),
    );
    expect(resultJson).not.toContain("Vault Keeper");
    expect(resultJson).not.toContain("Shadow Broker");
    expect(resultJson).not.toContain("private vault");
    expect(context.authority?.baseWorldVersion).toBe(baseWorldVersion);
  });
});
