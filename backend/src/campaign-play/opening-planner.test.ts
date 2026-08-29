import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { CampaignWorldReview } from "@worldforge/shared";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
} from "../ai/structured-output-capabilities.js";
import {
  safeGenerateObject,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";
import {
  CampaignPlayOpeningPlannerError,
  buildCampaignPlayOpeningSceneCandidates,
  campaignPlayOpeningProposalSchema,
  createCampaignPlayOpeningPlanner,
  deriveCampaignPlayOpeningSceneCandidateId,
  type CampaignPlayOpeningFrame,
  type CampaignPlayOpeningProposal,
  type CampaignPlayOpeningSceneCandidate,
} from "./opening-planner.js";
import { deriveCampaignPlayPublicHandle } from "./campaign-play-projection.js";
import { buildCampaignPlayOpeningPrompt } from "./opening-prompts.js";

const CAMPAIGN_ID = "campaign-opening";
const TURN_ID = "turn-opening-zero";
const PLAYER_ID = "actor-player";

function worldFixture(): CampaignWorldReview {
  return {
    campaignId: CAMPAIGN_ID,
    status: "accepted",
    version: 3,
    contentHash: "a".repeat(64),
    sourceDigest: "b".repeat(64),
    worldSummary: "Three stormbound harbors depend on a failing signal route.",
    locations: [
      {
        id: "location-harbor",
        name: "North Harbor",
        description: "Signal towers watch a harbor sealed by rain.",
        kind: "macro",
        parentLocationId: null,
        tags: ["harbor"],
        isStarting: true,
      },
      {
        id: "location-reef",
        name: "Glass Reef",
        description: "A trading quay surrounds luminous shoals.",
        kind: "macro",
        parentLocationId: null,
        tags: ["trade"],
        isStarting: false,
      },
      {
        id: "location-bells",
        name: "Bell Island",
        description: "Bronze bells measure storms that never arrive.",
        kind: "macro",
        parentLocationId: null,
        tags: ["weather"],
        isStarting: false,
      },
      { id: "scene-harbor-docks", name: "North Harbor Docks", description: "A rain-slick ferry landing.", kind: "persistent_sublocation", parentLocationId: "location-harbor", tags: ["harbor"], isStarting: false },
      { id: "scene-harbor-tower", name: "North Signal Tower", description: "A staffed signal tower above the harbor.", kind: "persistent_sublocation", parentLocationId: "location-harbor", tags: ["signals"], isStarting: false },
      { id: "scene-reef-quay", name: "Glass Reef Quay", description: "A quay beside luminous shoals.", kind: "persistent_sublocation", parentLocationId: "location-reef", tags: ["trade"], isStarting: false },
      { id: "scene-reef-market", name: "Glass Reef Market", description: "A covered exchange behind the quay.", kind: "persistent_sublocation", parentLocationId: "location-reef", tags: ["trade"], isStarting: false },
      { id: "scene-bells-tower", name: "Bell Tower", description: "A bronze bell chamber open to the weather.", kind: "persistent_sublocation", parentLocationId: "location-bells", tags: ["weather"], isStarting: false },
      { id: "scene-bells-archive", name: "Bell Archive", description: "A dry room of storm records.", kind: "persistent_sublocation", parentLocationId: "location-bells", tags: ["archive"], isStarting: false },
    ],
    routes: [
      {
        id: "route-harbor-reef",
        fromLocationId: "scene-harbor-docks",
        toLocationId: "scene-reef-quay",
        travelCost: 2,
      },
      { id: "route-reef-market", fromLocationId: "scene-reef-quay", toLocationId: "scene-reef-market", travelCost: 1 },
      {
        id: "route-reef-bells",
        fromLocationId: "scene-reef-market",
        toLocationId: "scene-bells-tower",
        travelCost: 3,
      },
      { id: "route-bells-archive", fromLocationId: "scene-bells-tower", toLocationId: "scene-bells-archive", travelCost: 1 },
      {
        id: "route-bells-harbor",
        fromLocationId: "scene-bells-archive",
        toLocationId: "scene-harbor-tower",
        travelCost: 4,
      },
      { id: "route-harbor-docks", fromLocationId: "scene-harbor-tower", toLocationId: "scene-harbor-docks", travelCost: 1 },
    ],
    actors: [
      {
        id: "actor-keeper",
        kind: "person",
        controller: "agent",
        role: "key",
        name: "Mara Venn",
        summary: "A signal keeper mapping the broken route pattern.",
        traits: ["methodical"],
        tags: ["navigator"],
      },
      {
        id: "actor-courier",
        kind: "person",
        controller: "agent",
        role: "support",
        name: "Oren Tide",
        summary: "A courier who knows the reef passages.",
        traits: ["observant"],
        tags: ["courier"],
      },
      {
        id: "actor-bell-tender",
        kind: "person",
        controller: "agent",
        role: "support",
        name: "Sel Bell",
        summary: "A bell tender recording impossible storms.",
        traits: ["patient"],
        tags: ["weather"],
      },
      {
        id: "actor-council",
        kind: "person",
        controller: "agent",
        role: "background",
        name: "Ilya Venn",
        summary: "A harbor clerk who tracks the denied passage windows.",
        traits: ["precise"],
        tags: ["clerk"],
      },
      {
        id: "actor-background",
        kind: "person",
        controller: "agent",
        role: "background",
        name: "Dock Sweeper",
        summary: "A worker clearing storm debris.",
        traits: ["quiet"],
        tags: ["worker"],
      },
      {
        id: "actor-scout",
        kind: "person",
        controller: "agent",
        role: "key",
        name: "Rhea Quill",
        summary: "A route assessor who suspects the storms are directed.",
        traits: ["skeptical"],
        tags: ["assessor"],
      },
    ],
    goals: [
      {
        id: "goal-keeper-map",
        actorId: "actor-keeper",
        objective: "Map the next route change.",
        motivation: "Keep North Harbor supplied.",
        horizon: "immediate",
        priority: 5,
        status: "active",
      },
      {
        id: "goal-keeper-ledger",
        actorId: "actor-keeper",
        objective: "Recover the missing signal ledger.",
        motivation: "Prove the route failure was engineered.",
        horizon: "ongoing",
        priority: 3,
        status: "active",
      },
      {
        id: "goal-courier-deliver",
        actorId: "actor-courier",
        objective: "Deliver a sealed route ledger.",
        motivation: "Clear an old family debt.",
        horizon: "immediate",
        priority: 4,
        status: "active",
      },
      {
        id: "goal-bells-explain",
        actorId: "actor-bell-tender",
        objective: "Explain the false storm signal.",
        motivation: "Protect Bell Island from panic.",
        horizon: "ongoing",
        priority: 3,
        status: "active",
      },
      {
        id: "goal-council-control",
        actorId: "actor-council",
        objective: "Retain control of passage windows.",
        motivation: "Preserve the harbor compact.",
        horizon: "ongoing",
        priority: 4,
        status: "active",
      },
      {
        id: "goal-background-clear",
        actorId: "actor-background",
        objective: "Clear the storm debris before the next ferry.",
        motivation: "Keep the harbor passage usable.",
        horizon: "immediate",
        priority: 2,
        status: "active",
      },
      {
        id: "goal-scout-chart",
        actorId: "actor-scout",
        objective: "Find the altered storm chart.",
        motivation: "Restore a safe crossing before eclipse.",
        horizon: "ongoing",
        priority: 5,
        status: "active",
      },
    ],
    relations: [
      {
        id: "relation-keeper-council",
        sourceActorId: "actor-keeper",
        targetActorId: "actor-council",
        relationType: "authority",
        summary: "The council controls archive access.",
        intensity: 4,
      },
      { id: "relation-courier-bells", sourceActorId: "actor-courier", targetActorId: "actor-bell-tender", relationType: "association", summary: "Oren brings Sel reports from the harbor.", intensity: 3 },
      { id: "relation-bells-council", sourceActorId: "actor-bell-tender", targetActorId: "actor-council", relationType: "rivalry", summary: "Sel disputes Ilya's official storm record.", intensity: 2 },
      { id: "relation-council-background", sourceActorId: "actor-council", targetActorId: "actor-background", relationType: "association", summary: "Ilya trusts the dock worker with copied ledgers.", intensity: 3 },
      { id: "relation-background-scout", sourceActorId: "actor-background", targetActorId: "actor-scout", relationType: "dependency", summary: "The sweeper needs Rhea to keep relief routes open.", intensity: 4 },
    ],
    placements: [
      {
        id: "placement-keeper",
        actorId: "actor-keeper",
        locationId: "scene-reef-quay",
        placementKind: "present",
      },
      {
        id: "placement-courier",
        actorId: "actor-courier",
        locationId: "scene-harbor-docks",
        placementKind: "present",
      },
      {
        id: "placement-bells",
        actorId: "actor-bell-tender",
        locationId: "scene-bells-tower",
        placementKind: "present",
      },
      {
        id: "placement-council",
        actorId: "actor-council",
        locationId: "scene-reef-market",
        placementKind: "present",
      },
      {
        id: "placement-background",
        actorId: "actor-background",
        locationId: "scene-harbor-tower",
        placementKind: "present",
      },
      { id: "placement-scout", actorId: "actor-scout", locationId: "scene-bells-archive", placementKind: "present" },
    ],
    pressures: [
      {
        id: "pressure-harbor-lock",
        name: "Harbor Lock",
        description: "Signal keepers have stopped outbound traffic.",
        trajectory: "Food and medicine queues grow by the hour.",
        urgency: 5,
        actorIds: ["actor-courier"],
        locationIds: ["scene-harbor-docks"],
      },
      {
        id: "pressure-false-bells",
        name: "False Bells",
        description: "Bell Island signals storms that never arrive.",
        trajectory: "Couriers stop trusting weather warnings.",
        urgency: 3,
        actorIds: ["actor-bell-tender"],
        locationIds: ["scene-bells-tower"],
      },
    ],
    builtAt: 1_000,
    acceptedAt: 2_000,
    source: {
      premise: "A stranger arrives as the harbor routes begin to fail.",
      dna: null,
      researchSummary: null,
      sourceReferences: [],
    },
  };
}

function frameFixture(world = worldFixture()): CampaignPlayOpeningFrame {
  return {
    campaignId: CAMPAIGN_ID,
    turnId: TURN_ID,
    acceptedWorldVersion: 3,
    acceptedContentHash: "a".repeat(64),
    baseWorldVersion: 4,
    player: {
      actorId: PLAYER_ID,
      profileDigest: "c".repeat(64),
      name: "Ilya Mar",
      summary: "An itinerant instrument repairer.",
      traits: ["careful"],
      tags: ["outsider"],
      motivations: ["Understand the impossible signal", "Protect vulnerable witnesses"],
    },
    acceptedWorld: world,
  };
}

function proposalFixture(): CampaignPlayOpeningProposal {
  return {
    start: {
      role: "A repairer waiting for passage",
      arrivalMode: "On the last permitted ferry",
      immediateSituation: "The harbor gates close as an impossible bell pattern crosses the water.",
    },
    scene: {
      candidateId: deriveCampaignPlayOpeningSceneCandidateId({
        sceneLocationId: "scene-harbor-docks",
        openingActorId: "actor-courier",
        supportActorId: "actor-courier",
        pressureId: "pressure-harbor-lock",
        routeId: "route-harbor-reef",
      }),
    },
    playerPremise: {
      motivationIndex: 0,
      anchor: "openingActor",
      eventClass: "dialogue",
      summary: "Oren Tide asks Ilya what the impossible signal has changed in the harbor instruments.",
      routeRestriction: null,
    },
  };
}

function nativeProposalFixture(): CampaignPlayOpeningProposal {
  return { ...proposalFixture(), decision: null };
}

const chosenConditions = {
  mode: "chosen" as const,
  macroLocationId: "location-harbor",
  role: "A repairer waiting for passage",
  arrivalMode: "On the last permitted ferry",
  immediateSituation: "The harbor gates close as an impossible bell pattern crosses the water.",
};

function structuredModel(): LanguageModel {
  const model = {} as LanguageModel;
  rememberStructuredOutputModelMetadata(
    model,
    buildStructuredOutputModelMetadata({
      providerId: "test-provider",
      providerName: "Test Provider",
      model: "test-model",
      protocol: "openai-compatible",
      baseUrl: "https://example.invalid/v1",
      transport: "chat-completions",
    }),
  );
  return model;
}

function toolModel(): LanguageModel {
  const model = {} as LanguageModel;
  rememberStructuredOutputModelMetadata(
    model,
    buildStructuredOutputModelMetadata({
      providerId: "zai-coding-plan",
      providerName: "Z.AI",
      model: "glm-5.3",
      protocol: "openai-compatible",
      baseUrl: "https://api.z.ai/api/paas/v4",
      transport: "chat-completions",
    }),
  );
  return model;
}

function toolProposalFixture(): Record<string, unknown> {
  const proposal = proposalFixture();
  const premise = proposal.playerPremise;
  return {
    start: proposal.start,
    scene: proposal.scene,
    decision: { state: "none" },
    playerPremise: premise === null
      ? { state: "none" }
      : {
          motivationIndex: premise.motivationIndex,
          anchor: premise.anchor,
          eventClass: premise.eventClass,
          summary: premise.summary,
          routeRestriction: premise.routeRestriction === null
            ? { state: "none", reason: "" }
            : { state: "restricted", reason: premise.routeRestriction.reason },
        },
  };
}

function trace(strategy: SafeGenerateTrace["strategy"] = "native_schema"): SafeGenerateTrace {
  const primaryStrategy = strategy === "tool_mode" ? "tool_mode" : "native_schema";
  return {
    text: "private model output",
    cleanedText: "private model output",
    requestedMode: "auto",
    strategy,
    primaryStrategy,
    fallbackStrategy: "text_fallback",
    capability: {
      requestedMode: "auto",
      primaryStrategy,
      fallbackStrategy: "text_fallback",
      actualMode: primaryStrategy,
      reason: "test capability",
    },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    response: { modelId: "test-model" },
    finishReason: strategy === "tool_mode" ? "tool-calls" : "stop",
  };
}

function semanticReviewFixture() {
  return {
    verdict: "accepted" as const,
    reason: "The interaction and typed decision authority agree.",
    failedChecks: [] as const,
  };
}

function openingGenerationResponses(
  proposal: unknown,
  strategy: SafeGenerateTrace["strategy"] = "native_schema",
) {
  return vi.fn()
    .mockResolvedValueOnce({ object: proposal, trace: trace(strategy) })
    .mockResolvedValueOnce({ object: semanticReviewFixture(), trace: trace(strategy) });
}

describe("Campaign Play opening planner", () => {
  it("compiles a compact proposal into deterministic player bootstrap and lazy actor schedules", () => {
    const planner = createCampaignPlayOpeningPlanner();
    const first = planner.compile(frameFixture(), chosenConditions, proposalFixture());
    const second = planner.compile(
      structuredClone(frameFixture()),
      structuredClone(chosenConditions),
      structuredClone(proposalFixture()),
    );

    expect(first.canonicalBytes).toBe(second.canonicalBytes);
    expect(first.hash).toBe(second.hash);
    expect(first.artifact).toEqual(second.artifact);
    expect(first.artifact.actorPlans).toEqual([]);
    expect(first.artifact.exposureSeed).toBeNull();
    expect(first.artifact.actorSchedules).toHaveLength(6);
    expect(first.artifact.actorSchedules.map((schedule) => ({
      actorId: schedule.actorId,
      planId: schedule.planId,
      dueAt: schedule.nextActAtWorldTimeMinutes,
    }))).toEqual([
      { actorId: "actor-courier", planId: null, dueAt: 0 },
      { actorId: "actor-background", planId: null, dueAt: 5 },
      { actorId: "actor-bell-tender", planId: null, dueAt: 10 },
      { actorId: "actor-council", planId: null, dueAt: 15 },
      { actorId: "actor-keeper", planId: null, dueAt: 20 },
      { actorId: "actor-scout", planId: null, dueAt: 25 },
    ]);
    expect(first.artifact.bootstrapCommands.map((command) => command.kind)).toEqual([
      "initialize_player_placement",
      "initialize_world_time",
      "initialize_pressure_state",
      "initialize_pressure_state",
      "record_world_event",
    ]);
    expect(first.artifact.bootstrapCommands.map((command) =>
      command.expectedWorldVersion)).toEqual([4, 5, 6, 7, 8]);
    expect(first.artifact.playerPremise).toEqual({
      motivation: "Understand the impossible signal",
      commandId: first.artifact.bootstrapCommands[4]!.commandId,
    });
    expect(first.artifact.bootstrapCommands[4]).toMatchObject({
      kind: "record_world_event",
      performingActorId: "actor-courier",
      affectedRefs: [
        { kind: "actor", id: PLAYER_ID },
        { kind: "actor", id: "actor-courier" },
        { kind: "location", id: "scene-harbor-docks" },
      ],
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: "scene-harbor-docks" }],
      },
    });
    expect(Object.isFrozen(first.artifact)).toBe(true);
    expect(Object.isFrozen(first.artifact.actorSchedules)).toBe(true);

    const narratorJson = JSON.stringify(first.artifact.narratorFacts);
    expect(narratorJson).toContain("North Harbor");
    expect(narratorJson).toContain("Oren Tide");
    expect(narratorJson).not.toContain("Sel Bell");
    expect(narratorJson).not.toContain("goal-bells-explain");
    expect(narratorJson).not.toContain("Lantern Council");
  });

  it("keeps the provider contract compact and rejects removed actor material", () => {
    const proposal = proposalFixture();
    expect(campaignPlayOpeningProposalSchema.safeParse(proposal).success).toBe(true);
    expect(Object.keys(proposal).sort()).toEqual(["playerPremise", "scene", "start"]);
    expect(campaignPlayOpeningProposalSchema.safeParse({
      ...proposal,
      actorPlans: [],
    }).success).toBe(false);
    expect(campaignPlayOpeningProposalSchema.safeParse({
      ...proposal,
      hiddenConsequence: {},
    }).success).toBe(false);
  });

  it("commits a hard opening passage condition as typed restricted route state", () => {
    const proposal = proposalFixture();
    proposal.playerPremise!.routeRestriction = {
      reason: "The harbor guard requires a stamped passage chit.",
    };
    proposal.playerPremise!.summary =
      "Oren Tide bars the reef road until Ilya presents a stamped passage chit.";

    const artifact = createCampaignPlayOpeningPlanner().compile(
      frameFixture(),
      chosenConditions,
      proposal,
    ).artifact;
    const restrictionIndex = artifact.bootstrapCommands.findIndex((command) =>
      command.kind === "set_route_state");
    const premiseIndex = artifact.bootstrapCommands.findIndex((command) =>
      command.kind === "record_world_event");
    expect(restrictionIndex).toBeGreaterThanOrEqual(0);
    expect(premiseIndex).toBe(restrictionIndex + 1);
    expect(artifact.bootstrapCommands[restrictionIndex]).toMatchObject({
      kind: "set_route_state",
      routeId: "route-harbor-reef",
      state: "restricted",
      reason: "The harbor guard requires a stamped passage chit.",
      exposure: { mode: "protected" },
    });
  });

  it("requires a premise exactly when the CharacterRecord supplies motivations", () => {
    const emptyFrame = frameFixture();
    emptyFrame.player.motivations = [];
    const emptyProposal = proposalFixture();
    emptyProposal.playerPremise = null;
    const empty = createCampaignPlayOpeningPlanner().compile(
      emptyFrame,
      chosenConditions,
      emptyProposal,
    );
    expect(empty.artifact.playerPremise).toBeNull();
    expect(empty.artifact.bootstrapCommands.some((command) =>
      command.kind === "record_world_event")).toBe(false);

    const missing = proposalFixture();
    missing.playerPremise = null;
    expect(() => createCampaignPlayOpeningPlanner().compile(
      frameFixture(),
      chosenConditions,
      missing,
    )).toThrowError(expect.objectContaining({ code: "opening_proposal_invalid" }));

    const outOfRange = proposalFixture();
    outOfRange.playerPremise!.motivationIndex = 2;
    expect(() => createCampaignPlayOpeningPlanner().compile(
      frameFixture(),
      chosenConditions,
      outOfRange,
    )).toThrowError(expect.objectContaining({ code: "opening_proposal_invalid" }));
  });

  it("accepts delegated starts and rejects scenes outside accepted topology", () => {
    const delegated = createCampaignPlayOpeningPlanner().compile(
      frameFixture(),
      { mode: "delegate" },
      proposalFixture(),
    );
    expect(delegated.artifact.start.sceneLocationId).toBe("scene-harbor-docks");

    const invalid = proposalFixture();
    invalid.scene.candidateId = "candidate-not-accepted";
    expect(() => createCampaignPlayOpeningPlanner().compile(
      frameFixture(),
      chosenConditions,
      invalid,
    )).toThrowError(expect.objectContaining({ code: "opening_proposal_invalid" }));
  });

  it("rejects malformed or mismatched accepted-world frames", () => {
    const world = worldFixture();
    world.status = "review";
    world.acceptedAt = null;
    expect(() => createCampaignPlayOpeningPlanner().compile(
      frameFixture(world),
      chosenConditions,
      proposalFixture(),
    )).toThrowError(expect.objectContaining({ code: "opening_frame_invalid" }));

    const duplicateStart = worldFixture();
    duplicateStart.locations[1]!.isStarting = true;
    expect(() => createCampaignPlayOpeningPlanner().compile(
      frameFixture(duplicateStart),
      chosenConditions,
      proposalFixture(),
    )).toThrowError(expect.objectContaining({ code: "opening_frame_invalid" }));
  });

  it("builds a normalized opening prompt without the world actor roster or plan instructions", () => {
    const frame = frameFixture();
    const candidates = buildCampaignPlayOpeningSceneCandidates(frame, chosenConditions);
    const prompt = buildCampaignPlayOpeningPrompt(frame, chosenConditions, candidates);
    const openingDataStart = prompt.indexOf("OPENING_DATA\n") + "OPENING_DATA\n".length;
    const openingDataEnd = prompt.indexOf("\nEND_OPENING_DATA", openingDataStart);
    const data = JSON.parse(prompt.slice(openingDataStart, openingDataEnd)) as {
      sceneCandidates: CampaignPlayOpeningSceneCandidate[];
      catalogs: {
        scenes: Array<{ id: string; name: string; description: string }>;
        actors: Array<{
          id: string;
          name: string;
          summary: string;
          traits: string[];
          tags: string[];
          activeGoals: Array<{
            id: string;
            objective: string;
            motivation: string;
            horizon: string;
            priority: number;
          }>;
        }>;
        pressures: Array<{
          id: string;
          name: string;
          description: string;
          trajectory: string;
        }>;
        routes: Array<{
          id: string;
          fromLocationId: string;
          toLocationId: string;
          destinationHandle: string;
          travelCost: number;
        }>;
      };
    };
    expect(data.sceneCandidates).toEqual(candidates);
    for (const candidate of data.sceneCandidates) {
      expect(candidate).not.toHaveProperty("scene");
      expect(candidate).not.toHaveProperty("openingActor");
      expect(candidate).not.toHaveProperty("supportActor");
      expect(candidate).not.toHaveProperty("pressure");
      expect(candidate).not.toHaveProperty("route");
    }
    const expectedSceneIds = new Set<string>();
    const expectedActorIds = new Set<string>();
    const expectedPressureIds = new Set<string>();
    const expectedRouteIds = new Set<string>();
    for (const candidate of candidates) {
      expectedSceneIds.add(candidate.sceneLocationId);
      expectedActorIds.add(candidate.openingActorId);
      expectedActorIds.add(candidate.supportActorId);
      expectedPressureIds.add(candidate.pressureId);
      expectedRouteIds.add(candidate.routeId);
      const route = frame.acceptedWorld.routes.find((value) => value.id === candidate.routeId)!;
      expectedSceneIds.add(route.toLocationId);
    }
    expect(new Set(data.catalogs.scenes.map((scene) => scene.id))).toEqual(expectedSceneIds);
    expect(new Set(data.catalogs.actors.map((actor) => actor.id))).toEqual(expectedActorIds);
    expect(new Set(data.catalogs.pressures.map((pressure) => pressure.id))).toEqual(expectedPressureIds);
    expect(new Set(data.catalogs.routes.map((route) => route.id))).toEqual(expectedRouteIds);
    expect(data.catalogs.actors).toHaveLength(expectedActorIds.size);
    expect(data.catalogs.pressures).toHaveLength(expectedPressureIds.size);
    expect(data.catalogs.routes).toHaveLength(expectedRouteIds.size);
    expect(data.catalogs.actors.find((actor) => actor.id === "actor-courier")).toEqual({
      id: "actor-courier",
      name: "Oren Tide",
      summary: "A courier who knows the reef passages.",
      traits: ["observant"],
      tags: ["courier"],
      activeGoals: [{
        id: "goal-courier-deliver",
        objective: "Deliver a sealed route ledger.",
        motivation: "Clear an old family debt.",
        horizon: "immediate",
        priority: 4,
      }],
    });
    expect(data.catalogs.routes[0]).toEqual({
      id: "route-harbor-reef",
      fromLocationId: "scene-harbor-docks",
      toLocationId: "scene-reef-quay",
      destinationHandle: deriveCampaignPlayPublicHandle(
        "location",
        CAMPAIGN_ID,
        "scene-reef-quay",
      ),
      travelCost: 2,
    });
    expect(prompt).toContain("exactly these top-level keys: start, scene, decision, playerPremise");
    expect(prompt).toContain("Resolve its sceneLocationId, openingActorId, supportActorId, pressureId, and routeId through catalogs.scenes, catalogs.actors, catalogs.pressures, and catalogs.routes");
    expect(prompt).toContain("The decision field is null for ordinary conversation, exposition");
    expect(prompt).toContain("no_mechanical_effect");
    expect(prompt).toContain("paid_delivery");
    expect(prompt).toContain("unpaid_delivery");
    expect(prompt).toContain("never invent a fee, payment, debt, or compensation");
    expect(prompt).toContain("destinationHandle");
    expect(prompt).toContain("does not grant custody of the named cargo");
    expect(prompt).toContain("Do not write actor plans, actor schedules, hidden consequences");
    expect(prompt).not.toContain('"actorPlans"');
    expect(prompt).not.toContain('"relations"');
    expect(prompt).not.toContain("Dock Sweeper");
    expect(prompt).not.toContain("Rhea Quill");
    expect(prompt).toContain("Oren Tide");
    expect(prompt).toContain("North Harbor");
  });

  it("uses a strict tuple-free tool transport and decodes it through the exact proposal contract", async () => {
    const generateObject = openingGenerationResponses(toolProposalFixture(), "tool_mode");
    const frame = frameFixture();
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });

    const result = await planner.plan({
      frame,
      startingConditions: chosenConditions,
      model: toolModel(),
      temperature: 0.4,
      maxOutputTokens: 32_000,
      signal: new AbortController().signal,
    });

    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result.modelEvidence).toMatchObject({ actualStrategy: "tool_mode" });
    const options = generateObject.mock.calls[0]![0] as {
      schema: z.ZodType<unknown>;
      prompt: string;
    };
    const schema = z.toJSONSchema(options.schema as never) as Record<string, any>;
    const forbiddenKeywords = new Set(["anyOf", "oneOf", "const", "prefixItems"]);
    const foundForbidden: string[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (forbiddenKeywords.has(key)) foundForbidden.push(key);
        visit(child);
      }
    };
    visit(schema);

    expect(foundForbidden).toEqual([]);
    expect(schema.required).toEqual(["start", "scene", "playerPremise", "decision"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.start.properties.role.enum).toEqual([chosenConditions.role]);
    expect(schema.properties.start.properties.arrivalMode.enum)
      .toEqual([chosenConditions.arrivalMode]);
    expect(schema.properties.start.properties.immediateSituation.enum)
      .toEqual([chosenConditions.immediateSituation]);
    expect(schema.properties.scene.properties.candidateId.enum)
      .toContain(proposalFixture().scene.candidateId);
    expect(schema.properties.decision.required).toEqual(["state"]);
    expect(schema.properties.decision.properties.state.enum).toEqual(["none", "present"]);
    expect(schema.properties.decision.properties.acceptance.properties.kind.enum)
      .toEqual([
        "no_mechanical_effect",
        "grant_player_possession",
        "paid_delivery",
        "unpaid_delivery",
      ]);
    expect(schema.properties.playerPremise.properties.state).toBeUndefined();
    expect(schema.properties.playerPremise.required).toEqual([
      "motivationIndex",
      "anchor",
      "eventClass",
      "summary",
      "routeRestriction",
    ]);
    expect(schema.properties.playerPremise.properties.routeRestriction.required)
      .toEqual(["state", "reason"]);
    expect(options.schema.safeParse(toolProposalFixture()).success).toBe(true);
    expect(options.prompt).toContain("TOOL_OUTPUT_CONTRACT");
    expect(options.prompt).toContain('decision is always exactly one object with state "none" or "present"');
    expect(options.prompt).toContain("unpaid_delivery");
    expect(options.prompt).not.toContain("set playerPremise to null");
    expect(options.prompt).not.toContain("routeRestriction is null");
  });

  it("keeps motivationless delegated tool transport exact and decodes none states to null", async () => {
    const frame = frameFixture();
    frame.player.motivations = [];
    const delegated = { mode: "delegate" as const };
    const toolObject = toolProposalFixture();
    toolObject.playerPremise = { state: "none" };
    const generateObject = openingGenerationResponses(toolObject, "tool_mode");
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });

    const result = await planner.plan({
      frame,
      startingConditions: delegated,
      model: toolModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    });

    expect(result.artifact.playerPremise).toBeNull();
    const options = generateObject.mock.calls[0]![0] as { schema: z.ZodType<unknown> };
    const schema = z.toJSONSchema(options.schema as never) as Record<string, any>;
    expect(schema.properties.playerPremise.required).toEqual(["state"]);
    expect(schema.properties.playerPremise.properties).toEqual({
      state: { type: "string", enum: ["none"] },
    });
    expect(schema.properties.start.properties.role.enum).toBeUndefined();
    expect(options.schema.safeParse(toolObject).success).toBe(true);
  });

  it("preserves a neutral no-mechanical-effect decision without creating an acceptance effect", async () => {
    const frame = frameFixture();
    const toolObject = toolProposalFixture();
    toolObject.decision = {
      state: "present",
      actor: "openingActor",
      kind: "offer",
      summary: "Oren asks whether the player will hear the route warning.",
      acceptLabel: "Hear the warning",
      declineLabel: "Leave the warning",
      acceptance: { kind: "no_mechanical_effect" },
    };
    const generateObject = openingGenerationResponses(toolObject, "tool_mode");
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });

    const result = await planner.plan({
      frame,
      startingConditions: chosenConditions,
      model: toolModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    });

    expect(result.artifact.decision).toMatchObject({
      actorId: "actor-courier",
      kind: "offer",
      summary: "Oren asks whether the player will hear the route warning.",
      acceptLabel: "Hear the warning",
      declineLabel: "Leave the warning",
      acceptEffect: null,
    });
    expect(result.artifact.narratorFacts.decision?.acceptEffect).toBeNull();
    expect(result.artifact.bootstrapCommands.filter((command) =>
      command.kind === "decision_open")).toHaveLength(1);
  });

  it("maps a fully typed paid delivery acceptance without granting cargo custody", async () => {
    const destinationHandle = deriveCampaignPlayPublicHandle(
      "location",
      CAMPAIGN_ID,
      "scene-reef-quay",
    );
    const frame = frameFixture();
    const toolObject = toolProposalFixture();
    toolObject.decision = {
      state: "present",
      actor: "openingActor",
      kind: "offer",
      summary: "Oren offers a night shrine delivery.",
      acceptLabel: "Take the delivery",
      declineLabel: "Decline the delivery",
      acceptance: {
        kind: "paid_delivery",
        title: "Night shrine delivery",
        subjectName: "Brine-bleeding shrine statue",
        destinationHandle,
        feeUnit: "copper",
        feeAmount: 35,
        paymentTiming: "on_completion",
        dueInMinutes: 180,
      },
    };
    const generateObject = openingGenerationResponses(toolObject, "tool_mode");
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });

    const result = await planner.plan({
      frame,
      startingConditions: chosenConditions,
      model: toolModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    });

    const expectedEffect = {
      kind: "paid_delivery" as const,
      title: "Night shrine delivery",
      subjectName: "Brine-bleeding shrine statue",
      destinationHandle,
      feeUnit: "copper" as const,
      feeAmount: 35,
      paymentTiming: "on_completion" as const,
      dueInMinutes: 180,
    };
    expect(result.artifact.decision?.acceptEffect).toEqual(expectedEffect);
    expect(result.artifact.narratorFacts.decision?.acceptEffect).toEqual(expectedEffect);
    expect(result.artifact.bootstrapCommands.find((command) =>
      command.kind === "decision_open")?.acceptEffect).toEqual(expectedEffect);
  });

  it("maps a native paid delivery acceptance through the same typed boundary", async () => {
    const destinationHandle = deriveCampaignPlayPublicHandle(
      "location",
      CAMPAIGN_ID,
      "scene-reef-quay",
    );
    const nativeObject = {
      ...proposalFixture(),
      decision: {
        actor: "openingActor" as const,
        kind: "offer" as const,
        summary: "Oren offers a night shrine delivery.",
        acceptLabel: "Take the delivery",
        declineLabel: "Decline the delivery",
        acceptance: {
          kind: "paid_delivery" as const,
          title: "Night shrine delivery",
          subjectName: "Brine-bleeding shrine statue",
          destinationHandle,
          feeUnit: "copper" as const,
          feeAmount: 35,
          paymentTiming: "on_completion" as const,
          dueInMinutes: 180,
        },
      },
    };
    const generateObject = openingGenerationResponses(nativeObject);
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });

    const result = await planner.plan({
      frame: frameFixture(),
      startingConditions: chosenConditions,
      model: structuredModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    });

    expect(result.artifact.decision?.acceptEffect).toMatchObject({
      kind: "paid_delivery",
      title: "Night shrine delivery",
      destinationHandle,
      feeAmount: 35,
      paymentTiming: "on_completion",
    });
  });

  it("maps a tool-mode unpaid delivery without inventing payment or custody", async () => {
    const destinationHandle = deriveCampaignPlayPublicHandle(
      "location",
      CAMPAIGN_ID,
      "scene-reef-quay",
    );
    const frame = frameFixture();
    const toolObject = toolProposalFixture();
    toolObject.decision = {
      state: "present",
      actor: "openingActor",
      kind: "offer",
      summary: "Oren asks the player to carry the evacuation signature roll to the quay.",
      acceptLabel: "Carry the roll",
      declineLabel: "Decline the errand",
      acceptance: {
        kind: "unpaid_delivery",
        title: "Evacuation signature delivery",
        subjectName: "Evacuation signature roll",
        destinationHandle,
        dueInMinutes: 180,
      },
    };
    const generateObject = openingGenerationResponses(toolObject, "tool_mode");
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });

    const result = await planner.plan({
      frame,
      startingConditions: chosenConditions,
      model: toolModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    });

    const expectedEffect = {
      kind: "unpaid_delivery" as const,
      title: "Evacuation signature delivery",
      subjectName: "Evacuation signature roll",
      destinationHandle,
      dueInMinutes: 180,
    };
    expect(result.artifact.decision?.acceptEffect).toEqual(expectedEffect);
    expect(result.artifact.decision?.acceptEffect).not.toHaveProperty("feeUnit");
    expect(result.artifact.decision?.acceptEffect).not.toHaveProperty("feeAmount");
    expect(result.artifact.decision?.acceptEffect).not.toHaveProperty("paymentTiming");
    expect(result.artifact.narratorFacts.decision?.acceptEffect).toEqual(expectedEffect);
  });

  it("maps a native unpaid delivery acceptance through the same typed boundary", async () => {
    const destinationHandle = deriveCampaignPlayPublicHandle(
      "location",
      CAMPAIGN_ID,
      "scene-reef-quay",
    );
    const nativeObject = {
      ...proposalFixture(),
      decision: {
        actor: "openingActor" as const,
        kind: "offer" as const,
        summary: "Oren asks the player to carry the evacuation signature roll to the quay.",
        acceptLabel: "Carry the roll",
        declineLabel: "Decline the errand",
        acceptance: {
          kind: "unpaid_delivery" as const,
          title: "Evacuation signature delivery",
          subjectName: "Evacuation signature roll",
          destinationHandle,
        },
      },
    };
    const generateObject = openingGenerationResponses(nativeObject);
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });

    const result = await planner.plan({
      frame: frameFixture(),
      startingConditions: chosenConditions,
      model: structuredModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    });

    expect(result.artifact.decision?.acceptEffect).toEqual({
      kind: "unpaid_delivery",
      title: "Evacuation signature delivery",
      subjectName: "Evacuation signature roll",
      destinationHandle,
    });
  });

  it("rejects unpaid delivery with a mismatched route destination or invented payment", async () => {
    const destinationHandle = deriveCampaignPlayPublicHandle(
      "location",
      CAMPAIGN_ID,
      "scene-reef-quay",
    );
    const cases = [
      {
        kind: "unpaid_delivery",
        title: "Evacuation signature delivery",
        subjectName: "Evacuation signature roll",
        destinationHandle: "location_not_the_selected_route",
      },
      {
        kind: "unpaid_delivery",
        title: "Evacuation signature delivery",
        subjectName: "Evacuation signature roll",
        destinationHandle,
        feeUnit: "copper",
        feeAmount: 1,
        paymentTiming: "on_completion",
      },
    ];
    for (const acceptance of cases) {
      const toolObject = toolProposalFixture();
      toolObject.decision = {
        state: "present",
        actor: "openingActor",
        kind: "offer",
        summary: "Oren asks the player to carry the evacuation signature roll to the quay.",
        acceptLabel: "Carry the roll",
        declineLabel: "Decline the errand",
        acceptance,
      };
      const generateObject = vi.fn(async (_options: unknown) => ({
        object: toolObject,
        trace: trace("tool_mode"),
      }));
      const planner = createCampaignPlayOpeningPlanner({
        generateObject: generateObject as unknown as typeof safeGenerateObject,
      });

      await expect(planner.plan({
        frame: frameFixture(),
        startingConditions: chosenConditions,
        model: toolModel(),
        temperature: 0,
        maxOutputTokens: 2_048,
        signal: new AbortController().signal,
      })).rejects.toMatchObject({ code: "model_contract_failed" });
      expect(generateObject).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects a decision-less actionable offer, then recovers and re-reviews typed authority", async () => {
    const destinationHandle = deriveCampaignPlayPublicHandle(
      "location",
      CAMPAIGN_ID,
      "scene-reef-quay",
    );
    const contradictory = {
      ...proposalFixture(),
      decision: null,
      playerPremise: {
        ...proposalFixture().playerPremise!,
        summary: "Oren offers a sealed medicine crate to Lantern Clinic for 12 copper. Aye or Nay?",
      },
    };
    const recovered = {
      ...proposalFixture(),
      decision: {
        actor: "openingActor" as const,
        kind: "offer" as const,
        summary: "Oren offers a sealed medicine crate to Lantern Clinic for 12 copper.",
        acceptLabel: "Take the delivery",
        declineLabel: "Decline the delivery",
        acceptance: {
          kind: "paid_delivery" as const,
          title: "Lantern Clinic medicine",
          subjectName: "Sealed medicine crate",
          destinationHandle,
          feeUnit: "copper" as const,
          feeAmount: 12,
          paymentTiming: "on_completion" as const,
          dueInMinutes: 180,
        },
      },
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: contradictory, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "rejected",
          reason: "The player-facing delivery offer has no typed decision authority.",
          failedChecks: ["decision_authority_mismatch"],
        },
        trace: trace(),
      })
      .mockResolvedValueOnce({ object: recovered, trace: trace() })
      .mockResolvedValueOnce({ object: semanticReviewFixture(), trace: trace() });
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });

    const result = await planner.plan({
      frame: frameFixture(),
      startingConditions: chosenConditions,
      model: structuredModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    });

    expect(generateObject).toHaveBeenCalledTimes(4);
    expect(String(generateObject.mock.calls[1]![0].prompt))
      .toContain("OPENING_SEMANTIC_REVIEW_INPUT");
    const reviewerPrompt = String(generateObject.mock.calls[1]![0].prompt);
    const reviewerInputMarker = "OPENING_SEMANTIC_REVIEW_INPUT=";
    const reviewerInputStart = reviewerPrompt.indexOf(reviewerInputMarker)
      + reviewerInputMarker.length;
    const reviewerInputEnd = reviewerPrompt.indexOf("\nReturn verdict=", reviewerInputStart);
    const rejectedReviewInput = reviewerPrompt.slice(reviewerInputStart, reviewerInputEnd);
    const recoveryPrompt = String(generateObject.mock.calls[2]![0].prompt);
    expect(recoveryPrompt).toContain("OPENING_SEMANTIC_RECOVERY");
    expect(recoveryPrompt).toContain(
      `REJECTED_OPENING_SEMANTIC_REVIEW_INPUT=${rejectedReviewInput}`,
    );
    expect(recoveryPrompt).toContain('"decision":null');
    expect(String(generateObject.mock.calls[3]![0].prompt))
      .toContain("OPENING_SEMANTIC_REVIEW_INPUT");
    expect(result.artifact.decision).toMatchObject({
      kind: "offer",
      acceptEffect: {
        kind: "paid_delivery",
        feeAmount: 12,
        destinationHandle,
      },
    });
    expect(result.artifact.bootstrapCommands.some((command) =>
      command.kind === "decision_open")).toBe(true);
    expect(result.modelEvidence.retryUsed).toBe(false);
    expect(result.modelEvidence.totalAttempts).toBe(1);
  });

  it("keeps tool-mode semantic reviewer transport flat while enforcing its domain branches", async () => {
    const generateObject = openingGenerationResponses(toolProposalFixture(), "tool_mode");
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });

    await planner.plan({
      frame: frameFixture(),
      startingConditions: chosenConditions,
      model: toolModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    });

    const reviewerPrompt = String(generateObject.mock.calls[1]![0].prompt);
    expect(reviewerPrompt).toContain("unpaid_delivery");
    expect(reviewerPrompt).toContain("reject no_mechanical_effect as decision_authority_mismatch");
    expect(reviewerPrompt).toContain("do not invent compensation");
    const reviewerOptions = generateObject.mock.calls[1]![0] as {
      schema: z.ZodType<unknown>;
    };
    const reviewerSchema = z.toJSONSchema(reviewerOptions.schema as never) as Record<string, any>;
    expect(reviewerSchema).not.toHaveProperty("anyOf");
    expect(reviewerSchema).not.toHaveProperty("oneOf");
    expect(reviewerSchema.required).toEqual(["verdict", "reason", "failedChecks"]);
    expect(reviewerSchema.additionalProperties).toBe(false);
    expect(reviewerOptions.schema.safeParse({
      verdict: "accepted",
      reason: "No actionable choice is established.",
      failedChecks: [],
    }).success).toBe(true);
    expect(reviewerOptions.schema.safeParse({
      verdict: "accepted",
      reason: "No actionable choice is established.",
      failedChecks: ["decision_authority_mismatch"],
    }).success).toBe(false);
    expect(reviewerOptions.schema.safeParse({
      verdict: "rejected",
      reason: "The offer lacks typed authority.",
      failedChecks: ["decision_authority_mismatch"],
    }).success).toBe(true);
    expect(reviewerOptions.schema.safeParse({
      verdict: "rejected",
      reason: "The offer lacks typed authority.",
      failedChecks: [],
    }).success).toBe(false);
  });

  it("keeps an atmosphere-only named price and promise without player control as decision null", async () => {
    const atmosphere = {
      ...proposalFixture(),
      decision: null,
      playerPremise: {
        ...proposalFixture().playerPremise!,
        summary: "Oren mentions a fishmonger quoted two copper for dried kelp and a dockhand's casual promise to sing later; Ilya is not involved and nothing is owed.",
      },
    };
    const generateObject = openingGenerationResponses(atmosphere);
    const result = await createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frameFixture(),
      startingConditions: chosenConditions,
      model: structuredModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    });

    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result.artifact.decision).toBeNull();
    expect(result.artifact.bootstrapCommands.some((command) =>
      command.kind === "decision_open")).toBe(false);
  });

  it("fails closed when the semantic reviewer returns an invalid branch", async () => {
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: nativeProposalFixture(), trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "accepted",
          reason: "The interaction is consistent.",
          failedChecks: ["decision_authority_mismatch"],
        },
        trace: trace(),
      });
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });

    await expect(planner.plan({
      frame: frameFixture(),
      startingConditions: chosenConditions,
      model: structuredModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "model_contract_failed" });
    expect(generateObject).toHaveBeenCalledTimes(2);
  });

  it("rejects incomplete or mismatched paid delivery terms at the model boundary", async () => {
    const destinationHandle = deriveCampaignPlayPublicHandle(
      "location",
      CAMPAIGN_ID,
      "scene-reef-quay",
    );
    const cases = [
      {
        kind: "paid_delivery" as const,
        title: "Night shrine delivery",
        subjectName: "Brine-bleeding shrine statue",
        destinationHandle,
        feeUnit: "copper" as const,
        paymentTiming: "on_completion" as const,
      },
      {
        kind: "paid_delivery" as const,
        title: "Night shrine delivery",
        subjectName: "Brine-bleeding shrine statue",
        destinationHandle: "location_not_the_selected_route",
        feeUnit: "copper" as const,
        feeAmount: 35,
        paymentTiming: "on_completion" as const,
      },
    ];
    for (const acceptance of cases) {
      const toolObject = toolProposalFixture();
      toolObject.decision = {
        state: "present",
        actor: "openingActor",
        kind: "offer",
        summary: "Oren offers a night shrine delivery.",
        acceptLabel: "Take the delivery",
        declineLabel: "Decline the delivery",
        acceptance,
      };
      const generateObject = vi.fn(async (_options: unknown) => ({
        object: toolObject,
        trace: trace("tool_mode"),
      }));
      const planner = createCampaignPlayOpeningPlanner({
        generateObject: generateObject as unknown as typeof safeGenerateObject,
      });

      await expect(planner.plan({
        frame: frameFixture(),
        startingConditions: chosenConditions,
        model: toolModel(),
        temperature: 0,
        maxOutputTokens: 2_048,
        signal: new AbortController().signal,
      })).rejects.toMatchObject({ code: "model_contract_failed" });
      expect(generateObject).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects actor, item, and quantity fields outside the typed custody effect", () => {
    for (const extraKey of ["actorId", "itemId", "quantity"] as const) {
      const proposal = {
        ...proposalFixture(),
        decision: {
          actor: "openingActor" as const,
          kind: "offer" as const,
          summary: "Oren offers the player a sealed route map.",
          acceptLabel: "Take the map",
          declineLabel: "Leave it sealed",
          acceptEffect: {
            kind: "grant_player_possession" as const,
            name: "Sealed route map",
            [extraKey]: extraKey === "quantity" ? 1 : "foreign-value",
          },
        },
      };
      expect(campaignPlayOpeningProposalSchema.safeParse(proposal).success).toBe(false);
    }
  });

  it("fails closed on inconsistent tool route state without a second generation call", async () => {
    const invalid = toolProposalFixture();
    (invalid.playerPremise as Record<string, unknown>).routeRestriction = {
      state: "none",
      reason: "passage is blocked",
    };
    const generateObject = vi.fn(async (_options: unknown) => ({
      object: invalid,
      trace: trace("tool_mode"),
    }));
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });

    await expect(planner.plan({
      frame: frameFixture(),
      startingConditions: chosenConditions,
      model: toolModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "model_contract_failed" });
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it("uses one strict structured call and caps output at the compact contract budget", async () => {
    vi.useFakeTimers();
    const generateObject = openingGenerationResponses(nativeProposalFixture());
    const signal = new AbortController().signal;
    try {
      const planner = createCampaignPlayOpeningPlanner({
        generateObject: generateObject as unknown as typeof safeGenerateObject,
      });
      const result = await planner.plan({
        frame: frameFixture(),
        startingConditions: chosenConditions,
        model: structuredModel(),
        temperature: 0.4,
        maxOutputTokens: 32_000,
        signal,
      });

      expect(generateObject).toHaveBeenCalledTimes(2);
      expect(generateObject).toHaveBeenCalledWith(expect.objectContaining({
        schema: expect.anything(),
        prompt: expect.not.stringContaining("TOOL_OUTPUT_CONTRACT"),
        maxOutputTokens: 2_048,
        strictSchema: true,
        allowRepair: false,
        allowTextFallback: false,
        retries: 1,
        timeout: { totalMs: 180_000 },
        abortSignal: signal,
      }));
      const options = generateObject.mock.calls[0]![0] as { schema: z.ZodType<unknown> };
      const schema = z.toJSONSchema(options.schema as never) as Record<string, any>;
      expect(schema.required).toContain("decision");
      expect(result.artifact.actorPlans).toEqual([]);
      expect(result.modelEvidence).toMatchObject({
        actualStrategy: "native_schema",
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects malformed starting conditions before a model call", async () => {
    const generateObject = vi.fn();
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });
    await expect(planner.plan({
      frame: frameFixture(),
      startingConditions: { mode: "delegate", extra: true } as never,
      model: structuredModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "opening_proposal_invalid" });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("retains successful model evidence when semantic compilation rejects a proposal", async () => {
    const invalid = proposalFixture();
    invalid.scene.candidateId = "candidate-not-accepted";
    invalid.decision = null;
    const planner = createCampaignPlayOpeningPlanner({
      generateObject: vi.fn(async () => ({ object: invalid, trace: trace() })) as unknown as
        typeof safeGenerateObject,
    });

    await expect(planner.plan({
      frame: frameFixture(),
      startingConditions: chosenConditions,
      model: structuredModel(),
      temperature: 0,
      maxOutputTokens: 2_048,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: "opening_proposal_invalid",
      modelEvidence: expect.objectContaining({
        actualStrategy: "native_schema",
        inputTokens: 100,
        outputTokens: 50,
      }),
    });
  });
});
