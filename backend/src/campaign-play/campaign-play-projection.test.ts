import type { CampaignWorldReview } from "@worldforge/shared";
import { describe, expect, it } from "vitest";
import { calculateCampaignWorldContentHash } from "../campaign-world/world-snapshot.js";
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
  projectAcceptedTopologyEligibility,
  projectCampaignPlayMechanicalTruth,
  projectCampaignPlayProtectedAudit,
  projectCampaignPlayPublicState,
  projectCampaignPlayRuntimeTruth,
  type CampaignPlayMechanicalProjectionInput,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_DIGEST = "a".repeat(64);

function acceptedReviewFixture(): CampaignWorldReview {
  const draft = {
    worldSummary: "A coast where trade, storms, and civic power remain in motion.",
    locations: [
      {
        id: "location:harbor",
        name: "Harbor",
        description: "A crowded harbor district.",
        kind: "macro" as const,
        parentLocationId: null,
        tags: ["trade"],
        isStarting: true,
      },
      {
        id: "location:ridge",
        name: "Ridge",
        description: "A guarded ridge road.",
        kind: "macro" as const,
        parentLocationId: null,
        tags: ["road"],
        isStarting: false,
      },
      {
        id: "location:marsh",
        name: "Marsh",
        description: "A flooded outer settlement.",
        kind: "macro" as const,
        parentLocationId: null,
        tags: ["flood"],
        isStarting: false,
      },
    ],
    routes: [
      {
        id: "route:harbor-ridge",
        fromLocationId: "location:harbor",
        toLocationId: "location:ridge",
        travelCost: 2 as const,
      },
      {
        id: "route:ridge-marsh",
        fromLocationId: "location:ridge",
        toLocationId: "location:marsh",
        travelCost: 3 as const,
      },
    ],
    actors: [
      {
        id: "actor:key",
        kind: "person" as const,
        controller: "agent" as const,
        role: "key" as const,
        name: "Mara",
        summary: "A magistrate protecting the ridge road.",
        traits: ["resolute"],
        tags: ["civic"],
      },
      {
        id: "actor:support-a",
        kind: "person" as const,
        controller: "agent" as const,
        role: "support" as const,
        name: "Iven",
        summary: "A harbor porter with local ties.",
        traits: ["observant"],
        tags: ["harbor"],
      },
      {
        id: "actor:support-b",
        kind: "person" as const,
        controller: "agent" as const,
        role: "support" as const,
        name: "Sela",
        summary: "A marsh guide tracking the floods.",
        traits: ["patient"],
        tags: ["marsh"],
      },
      {
        id: "actor:collective",
        kind: "collective" as const,
        controller: "agent" as const,
        role: "background" as const,
        name: "Harbor Council",
        summary: "A council controlling harbor access.",
        traits: ["pragmatic"],
        tags: ["trade"],
      },
      {
        id: "actor:background",
        kind: "person" as const,
        controller: "agent" as const,
        role: "background" as const,
        name: "Toma",
        summary: "A dock sweeper clearing storm debris.",
        traits: ["quiet"],
        tags: ["harbor"],
      },
    ],
    goals: [
      { id: "goal:key", actorId: "actor:key", objective: "Keep the road open.", motivation: "Preserve order.", horizon: "ongoing" as const, priority: 5 as const, status: "active" as const },
      { id: "goal:support-a", actorId: "actor:support-a", objective: "Protect the crews.", motivation: "Mutual duty.", horizon: "immediate" as const, priority: 3 as const, status: "active" as const },
      { id: "goal:support-b", actorId: "actor:support-b", objective: "Map safe crossings.", motivation: "Keep neighbors alive.", horizon: "immediate" as const, priority: 4 as const, status: "active" as const },
      { id: "goal:collective", actorId: "actor:collective", objective: "Control harbor traffic.", motivation: "Retain leverage.", horizon: "ongoing" as const, priority: 4 as const, status: "active" as const },
      { id: "goal:background", actorId: "actor:background", objective: "Clear the ferry passage.", motivation: "Keep the docks usable.", horizon: "immediate" as const, priority: 2 as const, status: "active" as const },
    ],
    relations: [
      { id: "relation:one", sourceActorId: "actor:key", targetActorId: "actor:collective", relationType: "rivalry" as const, summary: "They contest road tolls.", intensity: 4 as const },
      { id: "relation:two", sourceActorId: "actor:support-a", targetActorId: "actor:key", relationType: "association" as const, summary: "They exchange reports.", intensity: 2 as const },
      { id: "relation:three", sourceActorId: "actor:support-b", targetActorId: "actor:support-a", relationType: "alliance" as const, summary: "They share warnings.", intensity: 3 as const },
    ],
    placements: [
      { id: "placement:key", actorId: "actor:key", locationId: "location:ridge", placementKind: "present" as const },
      { id: "placement:support-a", actorId: "actor:support-a", locationId: "location:harbor", placementKind: "present" as const },
      { id: "placement:support-b", actorId: "actor:support-b", locationId: "location:marsh", placementKind: "present" as const },
      { id: "placement:collective", actorId: "actor:collective", locationId: "location:ridge", placementKind: "base" as const },
      { id: "placement:background", actorId: "actor:background", locationId: "location:harbor", placementKind: "present" as const },
    ],
    pressures: [
      { id: "pressure:harbor", name: "Dock strike", description: "Crews refuse unsafe work.", trajectory: "Traffic stops.", urgency: 4 as const, actorIds: ["actor:support-a"], locationIds: ["location:harbor"] },
      { id: "pressure:marsh", name: "Flood surge", description: "Water rises in the marsh.", trajectory: "The ridge road floods.", urgency: 5 as const, actorIds: ["actor:support-b"], locationIds: ["location:marsh"] },
    ],
  };
  const contentHash = calculateCampaignWorldContentHash(SOURCE_DIGEST, draft);
  return {
    campaignId: CAMPAIGN_ID,
    status: "accepted",
    version: 7,
    contentHash,
    sourceDigest: SOURCE_DIGEST,
    ...draft,
    builtAt: 100,
    acceptedAt: 110,
    source: {
      premise: "A living coastal polity.",
      dna: null,
      researchSummary: null,
      sourceReferences: [],
    },
  };
}

function initialMechanicalInput(review: CampaignWorldReview): CampaignPlayMechanicalProjectionInput {
  return {
    acceptedReview: review,
    worldTimeMinutes: null,
    human: null,
    routeStates: [],
    actorConditions: [],
    pressureStates: [],
    placements: [],
    relations: [],
    goals: [],
  };
}

describe("Campaign Play canonical projections", () => {
  it("produces stable bytes and SHA-256 values independent of object key order", () => {
    const left = { z: [3, { b: true, a: null }], a: "value" };
    const right = { a: "value", z: [3, { a: null, b: true }] };

    expect(canonicalizeCampaignPlayProjection(left)).toBe(
      canonicalizeCampaignPlayProjection(right),
    );
    expect(hashCampaignPlayProjection(left)).toBe(hashCampaignPlayProjection(right));
    expect(hashCampaignPlayProjection(left)).toHaveLength(64);
  });

  it("rejects non-JSON numbers and cyclic values", () => {
    expect(() => canonicalizeCampaignPlayProjection({ value: Number.NaN })).toThrow(
      "finite numbers",
    );
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeCampaignPlayProjection(cyclic)).toThrow("cycles");
  });
});

describe("accepted topology eligibility", () => {
  it("builds a deterministic eligible projection with sorted witnesses and a route path", () => {
    const review = acceptedReviewFixture();
    const before = structuredClone(review);
    const result = projectAcceptedTopologyEligibility(review);
    const reordered = projectAcceptedTopologyEligibility({
      ...review,
      locations: [...review.locations].reverse(),
      routes: [...review.routes].reverse(),
      actors: [...review.actors].reverse(),
      goals: [...review.goals].reverse(),
      placements: [...review.placements].reverse(),
      pressures: [...review.pressures].reverse(),
    });

    expect(result.projection).toMatchObject({
      eligible: true,
      unmetRequirements: [],
      openingLocationId: "location:harbor",
      reachableMacroLocationIds: ["location:harbor", "location:marsh", "location:ridge"],
      activeActorIds: ["actor:background", "actor:key", "actor:support-a", "actor:support-b"],
      exposurePath: {
        fromLocationId: "location:harbor",
        toLocationId: "location:ridge",
        routeIds: ["route:harbor-ridge"],
        locationIds: ["location:harbor", "location:ridge"],
      },
    });
    expect(reordered.canonicalBytes).toBe(result.canonicalBytes);
    expect(reordered.hash).toBe(result.hash);
    expect(review).toEqual(before);
  });

  it("allows the player to enter a pressured starting location without a support actor beside them", () => {
    const review = acceptedReviewFixture();
    const result = projectAcceptedTopologyEligibility({
      ...review,
      placements: review.placements.map((placement) =>
        placement.actorId === "actor:support-a"
          ? { ...placement, locationId: "location:ridge" }
          : placement
      ),
    });

    expect(result.projection).toMatchObject({
      eligible: true,
      unmetRequirements: [],
      openingLocationId: "location:harbor",
    });
  });

  it("accepts an active actor placed in a persistent sublocation of a reachable macro", () => {
    const review = acceptedReviewFixture();
    const result = projectAcceptedTopologyEligibility({
      ...review,
      locations: [
        ...review.locations,
        {
          id: "location:signal-tower",
          name: "Signal Tower",
          description: "A staffed tower above the harbor.",
          kind: "persistent_sublocation",
          parentLocationId: "location:harbor",
          tags: ["signals"],
          isStarting: false,
        },
      ],
      placements: review.placements.map((placement) =>
        placement.actorId === "actor:support-a"
          ? { ...placement, locationId: "location:signal-tower" }
          : placement
      ),
    });

    expect(result.projection).toMatchObject({
      eligible: true,
      unmetRequirements: [],
    });
  });

  it("returns stable unmet requirement codes for each first-gate family", () => {
    const review = acceptedReviewFixture();
    const result = projectAcceptedTopologyEligibility({
      ...review,
      locations: review.locations.slice(0, 2),
      routes: [],
      actors: [],
      goals: [],
      placements: [],
      pressures: [
        { ...review.pressures[0], actorIds: [], locationIds: [] },
      ],
    });

    expect(result.projection.eligible).toBe(false);
    expect(result.projection.unmetRequirements).toEqual([
      "directed_routes_missing",
      "key_person_missing",
      "macro_location_unreachable",
      "macro_locations_below_minimum",
      "non_local_exposure_path_missing",
      "opening_location_invalid",
      "pressure_anchors_not_distinct",
      "pressures_below_minimum",
      "support_people_below_minimum",
    ]);
  });

  it("reports missing goal and invalid placement for active non-player actors", () => {
    const review = acceptedReviewFixture();
    const result = projectAcceptedTopologyEligibility({
      ...review,
      goals: review.goals.filter((goal) => goal.actorId !== "actor:key"),
      placements: review.placements.filter((placement) => placement.actorId !== "actor:key"),
    });

    expect(result.projection.unmetRequirements).toContain("active_actor_goal_missing");
    expect(result.projection.unmetRequirements).toContain("active_actor_placement_invalid");
  });
});

describe("mechanical and runtime truth", () => {
  it("uses the accepted Campaign World bytes and hash before character bootstrap", () => {
    const review = acceptedReviewFixture();
    const projection = projectCampaignPlayMechanicalTruth(initialMechanicalInput(review));

    expect(projection.hash).toBe(review.contentHash);
    expect(projection.canonicalBytes).toContain(`\"sourceDigest\":\"${SOURCE_DIGEST}\"`);
  });

  it("includes human actor identity and CharacterRecord digest after bootstrap", () => {
    const review = acceptedReviewFixture();
    const base = initialMechanicalInput(review);
    const first = projectCampaignPlayMechanicalTruth({
      ...base,
      human: { actorId: "actor:player", recordHash: "b".repeat(64) },
      placements: [{
        placementId: "placement:player",
        actorId: "actor:player",
        locationId: "location:harbor",
        placementKind: "present",
      }],
    });
    const second = projectCampaignPlayMechanicalTruth({
      ...base,
      human: { actorId: "actor:player", recordHash: "c".repeat(64) },
      placements: [{
        placementId: "placement:player",
        actorId: "actor:player",
        locationId: "location:harbor",
        placementKind: "present",
      }],
    });

    expect(first.canonicalBytes).toContain("actor:player");
    expect(first.canonicalBytes).toContain("b".repeat(64));
    expect(first.hash).not.toBe(review.contentHash);
    expect(second.hash).not.toBe(first.hash);
  });

  it("keeps runtime, protected-audit, and player-public hash domains separate", () => {
    const eligibility = projectAcceptedTopologyEligibility(acceptedReviewFixture());
    const common: CampaignPlayProjectionRecord = { id: "same", value: 1 };
    const runtime = projectCampaignPlayRuntimeTruth({
      campaignId: CAMPAIGN_ID,
      setupPhase: "character_required",
      eligibility: eligibility.projection,
      eligibilityHash: eligibility.hash,
      activeTurn: null,
      actorPlans: [common],
      actorSchedules: [],
      pendingJobs: [],
      pendingProposals: [],
      actorKnowledge: [],
      playerObservations: [],
      narratorState: null,
      workerLeaseEpoch: 0,
      nextRuntimeEventSequence: 3,
      nextTurnEventSequence: null,
    });
    const audit = projectCampaignPlayProtectedAudit({
      campaignId: CAMPAIGN_ID,
      worldVersion: 7,
      runtimeRevision: 2,
      commands: [common],
      receipts: [],
      worldEvents: [],
      eventExposures: [],
      runtimeEvents: [],
      turnEvents: [],
      modelStages: [],
    });
    const publicState = projectCampaignPlayPublicState({
      campaignId: CAMPAIGN_ID,
      acceptedWorldVersion: 7,
      worldVersion: 7,
      runtimeRevision: 2,
      phase: "character_required",
      worldTimeMinutes: null,
      currentLocation: null,
      visibleActors: [],
      visibleRoutes: [],
      visiblePressures: [],
      consequences: [],
      journal: [],
      narration: null,
    });

    expect(new Set([runtime.hash, audit.hash, publicState.hash]).size).toBe(3);
    expect(runtime.canonicalBytes).toContain(eligibility.hash);
    expect(runtime.hash).toBe(hashCampaignPlayProjection(runtime.projection));
  });

  it("sorts normalized collections for byte stability across reload order", () => {
    const review = acceptedReviewFixture();
    const base = initialMechanicalInput(review);
    const rows = [
      { routeId: "route:z", state: "blocked" as const },
      { routeId: "route:a", state: "open" as const },
    ];
    const left = projectCampaignPlayMechanicalTruth({
      ...base,
      worldTimeMinutes: 10,
      routeStates: rows,
    });
    const right = projectCampaignPlayMechanicalTruth({
      ...base,
      worldTimeMinutes: 10,
      routeStates: [...rows].reverse(),
    });

    expect(right.canonicalBytes).toBe(left.canonicalBytes);
    expect(right.hash).toBe(left.hash);
  });

  it("orders runtime and turn event sequences numerically within stable turn groups", () => {
    const runtimeEvents: CampaignPlayProjectionRecord[] = [
      { eventId: "runtime-10", sequence: 10 },
      { eventId: "runtime-2", sequence: 2 },
    ];
    const turnEvents: CampaignPlayProjectionRecord[] = [
      { eventId: "b-10", turnId: "turn-b", sequence: 10 },
      { eventId: "a-10", turnId: "turn-a", sequence: 10 },
      { eventId: "b-2", turnId: "turn-b", sequence: 2 },
      { eventId: "a-2", turnId: "turn-a", sequence: 2 },
    ];
    const audit = projectCampaignPlayProtectedAudit({
      campaignId: CAMPAIGN_ID,
      worldVersion: 7,
      runtimeRevision: 2,
      commands: [],
      receipts: [],
      worldEvents: [],
      eventExposures: [],
      runtimeEvents,
      turnEvents,
      modelStages: [],
    });
    const reordered = projectCampaignPlayProtectedAudit({
      campaignId: CAMPAIGN_ID,
      worldVersion: 7,
      runtimeRevision: 2,
      commands: [],
      receipts: [],
      worldEvents: [],
      eventExposures: [],
      runtimeEvents: [...runtimeEvents].reverse(),
      turnEvents: [...turnEvents].reverse(),
      modelStages: [],
    });
    const projection = audit.projection as {
      runtimeEvents: CampaignPlayProjectionRecord[];
      turnEvents: CampaignPlayProjectionRecord[];
    };

    expect(projection.runtimeEvents.map((event) => event.eventId)).toEqual([
      "runtime-2",
      "runtime-10",
    ]);
    expect(projection.turnEvents.map((event) => event.eventId)).toEqual([
      "a-2",
      "a-10",
      "b-2",
      "b-10",
    ]);
    expect(reordered.canonicalBytes).toBe(audit.canonicalBytes);
    expect(reordered.hash).toBe(audit.hash);
  });

  it("orders observations and public journal entries by numeric world time plus stable ID", () => {
    const eligibility = projectAcceptedTopologyEligibility(acceptedReviewFixture());
    const observations: CampaignPlayProjectionRecord[] = [
      { observationId: "observation-z", worldTimeMinutes: 10 },
      { observationId: "observation-b", worldTimeMinutes: 2 },
      { observationId: "observation-a", worldTimeMinutes: 2 },
    ];
    const runtime = projectCampaignPlayRuntimeTruth({
      campaignId: CAMPAIGN_ID,
      setupPhase: "ready",
      eligibility: eligibility.projection,
      eligibilityHash: eligibility.hash,
      activeTurn: null,
      actorPlans: [],
      actorSchedules: [],
      pendingJobs: [],
      pendingProposals: [],
      actorKnowledge: [],
      playerObservations: observations,
      narratorState: null,
      workerLeaseEpoch: 0,
      nextRuntimeEventSequence: 3,
      nextTurnEventSequence: null,
    });
    const runtimeReordered = projectCampaignPlayRuntimeTruth({
      campaignId: CAMPAIGN_ID,
      setupPhase: "ready",
      eligibility: eligibility.projection,
      eligibilityHash: eligibility.hash,
      activeTurn: null,
      actorPlans: [],
      actorSchedules: [],
      pendingJobs: [],
      pendingProposals: [],
      actorKnowledge: [],
      playerObservations: [...observations].reverse(),
      narratorState: null,
      workerLeaseEpoch: 0,
      nextRuntimeEventSequence: 3,
      nextTurnEventSequence: null,
    });
    const runtimeProjection = runtime.projection as {
      playerObservations: CampaignPlayProjectionRecord[];
    };
    expect(runtimeProjection.playerObservations.map((row) => row.observationId)).toEqual([
      "observation-a",
      "observation-b",
      "observation-z",
    ]);
    expect(runtimeReordered.hash).toBe(runtime.hash);

    const journal = [
      {
        observationId: "observation-z",
        worldTimeMinutes: 10,
        entry: { observationHandle: "journal-10", title: "Later", text: "Later entry.",
          whereOrRoute: null, worldTimeLabel: "Day 1, 00:10", consequence: null },
      },
      {
        observationId: "observation-b",
        worldTimeMinutes: 2,
        entry: { observationHandle: "journal-2b", title: "Early B", text: "Early B entry.",
          whereOrRoute: null, worldTimeLabel: "Day 1, 00:02", consequence: null },
      },
      {
        observationId: "observation-a",
        worldTimeMinutes: 2,
        entry: { observationHandle: "journal-2a", title: "Early A", text: "Early A entry.",
          whereOrRoute: null, worldTimeLabel: "Day 1, 00:02", consequence: null },
      },
    ];
    const publicState = projectCampaignPlayPublicState({
      campaignId: CAMPAIGN_ID,
      acceptedWorldVersion: 7,
      worldVersion: 8,
      runtimeRevision: 2,
      phase: "ready",
      worldTimeMinutes: 10,
      currentLocation: null,
      visibleActors: [],
      visibleRoutes: [],
      visiblePressures: [],
      consequences: [],
      journal,
      narration: null,
    });
    const publicReordered = projectCampaignPlayPublicState({
      campaignId: CAMPAIGN_ID,
      acceptedWorldVersion: 7,
      worldVersion: 8,
      runtimeRevision: 2,
      phase: "ready",
      worldTimeMinutes: 10,
      currentLocation: null,
      visibleActors: [],
      visibleRoutes: [],
      visiblePressures: [],
      consequences: [],
      journal: [...journal].reverse(),
      narration: null,
    });
    const publicProjection = publicState.projection as {
      journal: CampaignPlayProjectionRecord[];
    };

    expect(publicProjection.journal.map((row) => row.observationHandle)).toEqual([
      "journal-2a",
      "journal-2b",
      "journal-10",
    ]);
    expect(publicReordered.canonicalBytes).toBe(publicState.canonicalBytes);
    expect(publicReordered.hash).toBe(publicState.hash);
  });

  it("orders actor knowledge by its full schema identity regardless input order", () => {
    const eligibility = projectAcceptedTopologyEligibility(acceptedReviewFixture());
    const knowledge: CampaignPlayProjectionRecord[] = [
      {
        knowledgeId: "knowledge-witness",
        actorId: "actor:key",
        eventId: "event:shared",
        channel: "witness_report",
        sourceHash: "b".repeat(64),
      },
      {
        knowledgeId: "knowledge-direct-b",
        actorId: "actor:key",
        eventId: "event:shared",
        channel: "direct_perception",
        sourceHash: "b".repeat(64),
      },
      {
        knowledgeId: "knowledge-direct-a",
        actorId: "actor:key",
        eventId: "event:shared",
        channel: "direct_perception",
        sourceHash: "a".repeat(64),
      },
    ];
    const input = {
      campaignId: CAMPAIGN_ID,
      setupPhase: "ready" as const,
      eligibility: eligibility.projection,
      eligibilityHash: eligibility.hash,
      activeTurn: null,
      actorPlans: [],
      actorSchedules: [],
      pendingJobs: [],
      pendingProposals: [],
      actorKnowledge: knowledge,
      playerObservations: [],
      narratorState: null,
      workerLeaseEpoch: 1,
      nextRuntimeEventSequence: 3,
      nextTurnEventSequence: null,
    };

    const forward = projectCampaignPlayRuntimeTruth(input);
    const reversed = projectCampaignPlayRuntimeTruth({
      ...input,
      actorKnowledge: [...knowledge].reverse(),
    });
    const projection = forward.projection as {
      actorKnowledge: CampaignPlayProjectionRecord[];
    };

    expect(projection.actorKnowledge.map((row) => row.knowledgeId)).toEqual([
      "knowledge-direct-a",
      "knowledge-direct-b",
      "knowledge-witness",
    ]);
    expect(reversed.canonicalBytes).toBe(forward.canonicalBytes);
    expect(reversed.hash).toBe(forward.hash);
  });

  it("whitelists nested public scene and journal fields at runtime", () => {
    const location = {
      handle: "location_public",
      name: "Harbor",
      description: "Rain crosses the quay.",
      canonicalLocationId: "location:hidden",
    };
    const actor = {
      handle: "actor_public",
      name: "Mara",
      monogram: "MV",
      descriptor: "Person nearby",
      accent: "slate",
      goalId: "goal:hidden",
    };
    const entry = {
      observationHandle: "observation_public",
      title: "Seen nearby",
      text: "You witnessed a change nearby.",
      whereOrRoute: "Harbor",
      worldTimeLabel: "Day 1, 00:01",
      consequence: null,
      eventId: "event:hidden",
    };
    const projected = projectCampaignPlayPublicState({
      campaignId: CAMPAIGN_ID,
      acceptedWorldVersion: 7,
      worldVersion: 8,
      runtimeRevision: 3,
      phase: "ready",
      worldTimeMinutes: 1,
      currentLocation: location,
      visibleActors: [actor],
      visibleRoutes: [],
      visiblePressures: [],
      consequences: [],
      journal: [{ observationId: "stored-observation", worldTimeMinutes: 1, entry }],
      narration: null,
    });

    expect(projected.canonicalBytes).toContain("observation_public");
    expect(projected.canonicalBytes).not.toContain("location:hidden");
    expect(projected.canonicalBytes).not.toContain("goal:hidden");
    expect(projected.canonicalBytes).not.toContain("event:hidden");
    expect(projected.canonicalBytes).not.toContain("stored-observation");
  });

  it("orders model stage attempts numerically within each stage regardless input order", () => {
    const modelStages: CampaignPlayProjectionRecord[] = [
      { id: "row-b-2", stageId: "stage-b", attempt: 2 },
      { id: "row-a-2", stageId: "stage-a", attempt: 2 },
      { id: "row-b-1", stageId: "stage-b", attempt: 1 },
      { id: "row-a-1", stageId: "stage-a", attempt: 1 },
    ];
    const input = {
      campaignId: CAMPAIGN_ID,
      worldVersion: 7,
      runtimeRevision: 2,
      commands: [],
      receipts: [],
      worldEvents: [],
      eventExposures: [],
      runtimeEvents: [],
      turnEvents: [],
      modelStages,
    };

    const forward = projectCampaignPlayProtectedAudit(input);
    const reversed = projectCampaignPlayProtectedAudit({
      ...input,
      modelStages: [...modelStages].reverse(),
    });
    const projection = forward.projection as {
      modelStages: CampaignPlayProjectionRecord[];
    };

    expect(projection.modelStages.map((row) => row.id)).toEqual([
      "row-a-1",
      "row-a-2",
      "row-b-1",
      "row-b-2",
    ]);
    expect(reversed.canonicalBytes).toBe(forward.canonicalBytes);
    expect(reversed.hash).toBe(forward.hash);
  });
});
