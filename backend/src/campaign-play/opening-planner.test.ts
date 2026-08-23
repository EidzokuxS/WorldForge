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
} from "./opening-planner.js";
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

  it("builds a bounded opening prompt without the world actor roster or plan instructions", () => {
    const frame = frameFixture();
    const candidates = buildCampaignPlayOpeningSceneCandidates(frame, chosenConditions);
    const prompt = buildCampaignPlayOpeningPrompt(frame, chosenConditions, candidates);
    expect(prompt).toContain("exactly these top-level keys: start, scene, playerPremise");
    expect(prompt).toContain("Do not write actor plans, actor schedules, hidden consequences");
    expect(prompt).not.toContain('"actorPlans"');
    expect(prompt).not.toContain('"relations"');
    expect(prompt).not.toContain("Dock Sweeper");
    expect(prompt).not.toContain("Rhea Quill");
    expect(prompt).toContain("Oren Tide");
    expect(prompt).toContain("North Harbor");
  });

  it("uses a strict tuple-free tool transport and decodes it through the exact proposal contract", async () => {
    const generateObject = vi.fn(async (_options: unknown) => ({
      object: toolProposalFixture(),
      trace: trace("tool_mode"),
    }));
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

    expect(generateObject).toHaveBeenCalledTimes(1);
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
    expect(schema.required).toEqual(["start", "scene", "playerPremise"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.start.properties.role.enum).toEqual([chosenConditions.role]);
    expect(schema.properties.start.properties.arrivalMode.enum)
      .toEqual([chosenConditions.arrivalMode]);
    expect(schema.properties.start.properties.immediateSituation.enum)
      .toEqual([chosenConditions.immediateSituation]);
    expect(schema.properties.scene.properties.candidateId.enum)
      .toContain(proposalFixture().scene.candidateId);
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
    expect(options.prompt).not.toContain("set playerPremise to null");
    expect(options.prompt).not.toContain("routeRestriction is null");
  });

  it("keeps motivationless delegated tool transport exact and decodes none states to null", async () => {
    const frame = frameFixture();
    frame.player.motivations = [];
    const delegated = { mode: "delegate" as const };
    const toolObject = toolProposalFixture();
    toolObject.playerPremise = { state: "none" };
    const generateObject = vi.fn(async (_options: unknown) => ({
      object: toolObject,
      trace: trace("tool_mode"),
    }));
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
    const generateObject = vi.fn(async () => ({
      object: proposalFixture(),
      trace: trace(),
    }));
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

      expect(generateObject).toHaveBeenCalledTimes(1);
      expect(generateObject).toHaveBeenCalledWith(expect.objectContaining({
        schema: campaignPlayOpeningProposalSchema,
        prompt: expect.not.stringContaining("TOOL_OUTPUT_CONTRACT"),
        maxOutputTokens: 2_048,
        strictSchema: true,
        allowRepair: false,
        allowTextFallback: false,
        retries: 1,
        timeout: { totalMs: 180_000 },
        abortSignal: signal,
      }));
      expect(result.artifact.actorPlans).toEqual([]);
      expect(result.modelEvidence).toMatchObject({
        actualStrategy: "native_schema",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
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
