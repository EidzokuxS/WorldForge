import crypto from "node:crypto";
import type { LanguageModel } from "ai";
import { z } from "zod";
import {
  CAMPAIGN_PLAY_LIMITS,
  type CampaignWorldReview,
} from "@worldforge/shared";
import {
  getSafeGenerateObjectErrorCode,
  getSafeGenerateObjectTrace,
  safeGenerateObject,
  type SafeGenerateErrorCode,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";
import {
  getStructuredOutputModelMetadata,
  resolveStructuredOutputCapability,
} from "../ai/structured-output-capabilities.js";
import { createLogger } from "../lib/index.js";
import {
  campaignPlayActorIntentSchema,
  campaignPlayActorPlanSchema,
  campaignPlayActorScheduleSchema,
  campaignPlayBootstrapCommandSchema,
  campaignPlayElapsedBoundsSchema,
  campaignPlayExposurePredicateSchema,
  type CampaignPlayActorIntent,
  type CampaignPlayActorPlan,
  type CampaignPlayActorSchedule,
  type CampaignPlayBootstrapCommand,
  type CampaignPlayExposurePredicate,
} from "./contracts.js";
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
} from "./campaign-play-projection.js";
import { buildCampaignPlayOpeningPrompt } from "./opening-prompts.js";
import { isActorPresentInOpeningArea } from "./opening-location.js";
import { deriveCampaignPlayCommandId } from "./rulebook.js";

const OPENING_MAX_ELIGIBLE_ACTORS = 20;
const OPENING_MAX_EXPOSURE_ACTIONS = 5;
const OPENING_MAX_SCENE_CANDIDATES = 24;
const log = createLogger("campaign-play-opening-planner");

const boundedLine = (maximum: number) => z.string().min(1).max(maximum)
  .refine((value) => value === value.trim())
  .refine((value) => !value.includes("\n") && !value.includes("\r"));
const boundedText = (maximum: number) => z.string().min(1).max(maximum)
  .refine((value) => value === value.trim());

const openingHiddenExposurePredicateSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("local_aftermath"),
    locationId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    validUntilWorldTimeMinutes: z.number().int().safe().min(0),
  }).strict(),
  z.object({
    channel: z.literal("route_state"),
    routeId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    triggers: z.array(z.enum(["inspect", "attempt", "traverse"]))
      .min(1)
      .max(3)
      .refine((triggers) => new Set(triggers).size === triggers.length),
  }).strict(),
  z.object({
    channel: z.literal("witness_report"),
    witnessActorId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
  }).strict(),
]);

const openingPlanStepProposalSchema = z.object({
  intent: campaignPlayActorIntentSchema,
  observableTrace: boundedText(CAMPAIGN_PLAY_LIMITS.shortText),
  elapsedBounds: campaignPlayElapsedBoundsSchema,
}).strict();

const openingActorPlanProposalSchema = z.object({
  actorId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
  primaryGoalId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
  cadenceMinutes: z.number().int().min(1).max(CAMPAIGN_PLAY_LIMITS.elapsedMinutes),
  steps: z.array(openingPlanStepProposalSchema)
    .length(1),
}).strict();

export const campaignPlayOpeningProposalSchema = z.object({
  start: z.object({
    role: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
    arrivalMode: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
    immediateSituation: boundedText(CAMPAIGN_PLAY_LIMITS.text),
  }).strict(),
  scene: z.object({
    candidateId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
  }).strict(),
  actorPlans: z.array(openingActorPlanProposalSchema)
    .min(1)
    .max(OPENING_MAX_ELIGIBLE_ACTORS),
  hiddenConsequence: z.object({
    actorId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    locationId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    summary: boundedText(CAMPAIGN_PLAY_LIMITS.text),
    exposure: openingHiddenExposurePredicateSchema,
  }).strict(),
}).strict();

export type CampaignPlayOpeningProposal =
  z.infer<typeof campaignPlayOpeningProposalSchema>;

const campaignPlayOpeningStartSchema = z.object({
  locationId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
  role: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
  arrivalMode: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
  immediateSituation: boundedText(CAMPAIGN_PLAY_LIMITS.text),
}).strict();

export type CampaignPlayOpeningStart = z.infer<typeof campaignPlayOpeningStartSchema>;

export interface CampaignPlayOpeningSceneCandidate {
  candidateId: string;
  locationId: string;
  supportActorId: string;
  pressureId: string;
  routeId: string;
}

export type CampaignPlayResolvedStartingConditions =
  | { mode: "delegate" }
  | {
      mode: "chosen";
      locationId: string;
      role: string;
      arrivalMode: string;
      immediateSituation: string;
    };

export const campaignPlayResolvedStartingConditionsSchema:
  z.ZodType<CampaignPlayResolvedStartingConditions> = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("delegate") }).strict(),
    z.object({
      mode: z.literal("chosen"),
      locationId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
      role: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
      arrivalMode: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
      immediateSituation: boundedText(CAMPAIGN_PLAY_LIMITS.text),
    }).strict(),
  ]);

export interface CampaignPlayOpeningPlayer {
  actorId: string;
  profileDigest: string;
  name: string;
  summary: string;
  traits: string[];
  tags: string[];
}

export interface CampaignPlayOpeningFrame {
  campaignId: string;
  turnId: string;
  acceptedWorldVersion: number;
  acceptedContentHash: string;
  baseWorldVersion: number;
  player: CampaignPlayOpeningPlayer;
  acceptedWorld: CampaignWorldReview;
}

export interface CampaignPlayOpeningExposureSeed {
  sourceActorId: string;
  sourceGoalId: string;
  sourceLocationId: string;
  summary: string;
  observableTrace: string;
  predicate: CampaignPlayExposurePredicate;
  discoverableWithinPlayerActions: number;
}

export interface CampaignPlayOpeningNarratorFacts {
  location: { id: string; name: string; description: string };
  player: { role: string; arrivalMode: string; immediateSituation: string };
  supportActor: { id: string; name: string; summary: string };
  pressure: { id: string; name: string; description: string; trajectory: string };
  route: {
    id: string;
    destinationId: string;
    destinationName: string;
    travelCost: number;
  };
}

export interface CampaignPlayOpeningArtifact {
  artifactId: string;
  campaignId: string;
  turnId: string;
  acceptedWorldVersion: number;
  acceptedContentHash: string;
  baseWorldVersion: number;
  frameHash: string;
  proposalHash: string;
  start: CampaignPlayOpeningStart;
  bootstrapCommands: CampaignPlayBootstrapCommand[];
  actorPlans: CampaignPlayActorPlan[];
  actorSchedules: CampaignPlayActorSchedule[];
  exposureSeed: CampaignPlayOpeningExposureSeed;
  narratorFacts: CampaignPlayOpeningNarratorFacts;
}

const openingNarratorFactsSchema = z.object({
  location: z.object({
    id: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    name: boundedLine(CAMPAIGN_PLAY_LIMITS.name),
    description: boundedText(CAMPAIGN_PLAY_LIMITS.text),
  }).strict(),
  player: z.object({
    role: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
    arrivalMode: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
    immediateSituation: boundedText(CAMPAIGN_PLAY_LIMITS.text),
  }).strict(),
  supportActor: z.object({
    id: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    name: boundedLine(CAMPAIGN_PLAY_LIMITS.name),
    summary: boundedText(CAMPAIGN_PLAY_LIMITS.text),
  }).strict(),
  pressure: z.object({
    id: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    name: boundedLine(CAMPAIGN_PLAY_LIMITS.name),
    description: boundedText(CAMPAIGN_PLAY_LIMITS.text),
    trajectory: boundedText(CAMPAIGN_PLAY_LIMITS.text),
  }).strict(),
  route: z.object({
    id: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    destinationId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    destinationName: boundedLine(CAMPAIGN_PLAY_LIMITS.name),
    travelCost: z.number().int().safe().min(0).max(CAMPAIGN_PLAY_LIMITS.elapsedMinutes),
  }).strict(),
}).strict();

export const campaignPlayOpeningArtifactSchema: z.ZodType<CampaignPlayOpeningArtifact> =
  z.object({
    artifactId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    campaignId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    turnId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    acceptedWorldVersion: z.number().int().safe().positive(),
    acceptedContentHash: z.string().length(64),
    baseWorldVersion: z.number().int().safe().positive(),
    frameHash: z.string().length(64),
    proposalHash: z.string().length(64),
    start: campaignPlayOpeningStartSchema,
    bootstrapCommands: z.array(campaignPlayBootstrapCommandSchema)
      .min(1)
      .max(CAMPAIGN_PLAY_LIMITS.commandsPerBatch),
    actorPlans: z.array(campaignPlayActorPlanSchema).min(1).max(OPENING_MAX_ELIGIBLE_ACTORS),
    actorSchedules: z.array(campaignPlayActorScheduleSchema).min(1).max(OPENING_MAX_ELIGIBLE_ACTORS),
    exposureSeed: z.object({
      sourceActorId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
      sourceGoalId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
      sourceLocationId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
      summary: boundedText(CAMPAIGN_PLAY_LIMITS.text),
      observableTrace: boundedText(CAMPAIGN_PLAY_LIMITS.text),
      predicate: campaignPlayExposurePredicateSchema,
      discoverableWithinPlayerActions: z.number().int().min(1).max(OPENING_MAX_EXPOSURE_ACTIONS),
    }).strict(),
    narratorFacts: openingNarratorFactsSchema,
  }).strict().superRefine((artifact, context) => {
    if (artifact.baseWorldVersion < artifact.acceptedWorldVersion) {
      context.addIssue({
        code: "custom",
        path: ["baseWorldVersion"],
        message: "Opening artifact base world version precedes accepted world authority.",
      });
    }
    if (artifact.actorPlans.length !== artifact.actorSchedules.length) {
      context.addIssue({
        code: "custom",
        path: ["actorSchedules"],
        message: "Opening artifact requires one schedule per actor plan.",
      });
    }
  });

export interface CampaignPlayOpeningModelEvidence {
  requestedStrategy: "strict_object";
  actualStrategy: string | null;
  totalAttempts: number;
  repairUsed: boolean;
  retryUsed: boolean;
  textFallbackUsed: boolean;
  responseModel: string | null;
  finishReason: string | null;
  errorCode: SafeGenerateErrorCode | "structured_output_unavailable" | "transport_interrupted" |
    "model_contract_failed" | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface CampaignPlayOpeningCandidate {
  artifact: CampaignPlayOpeningArtifact;
  canonicalBytes: string;
  hash: string;
  modelEvidence: CampaignPlayOpeningModelEvidence;
}

export type CampaignPlayOpeningPlannerErrorCode =
  | "opening_frame_invalid"
  | "opening_proposal_invalid"
  | "structured_output_unavailable"
  | "transport_interrupted"
  | "model_contract_failed";

export class CampaignPlayOpeningPlannerError extends Error {
  constructor(
    readonly code: CampaignPlayOpeningPlannerErrorCode,
    readonly modelEvidence: CampaignPlayOpeningModelEvidence | null,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "CampaignPlayOpeningPlannerError";
  }
}

export interface CampaignPlayOpeningPlanRequest {
  frame: CampaignPlayOpeningFrame;
  startingConditions: CampaignPlayResolvedStartingConditions;
  model: LanguageModel;
  temperature: number;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

interface CampaignPlayOpeningPlannerDependencies {
  generateObject: typeof safeGenerateObject;
}

type OpeningBootstrapInput<T = CampaignPlayBootstrapCommand> =
  T extends CampaignPlayBootstrapCommand
    ? Omit<T, "commandId" | "batchId" | "order" | "expectedWorldVersion" | "causalParent">
    : never;

export interface CampaignPlayOpeningPlanner {
  plan(request: CampaignPlayOpeningPlanRequest): Promise<CampaignPlayOpeningCandidate>;
  compile(
    frame: CampaignPlayOpeningFrame,
    startingConditions: CampaignPlayResolvedStartingConditions,
    proposal: CampaignPlayOpeningProposal,
    modelEvidence?: CampaignPlayOpeningModelEvidence,
  ): CampaignPlayOpeningCandidate;
}

function fail(
  code: CampaignPlayOpeningPlannerErrorCode,
  cause?: unknown,
  modelEvidence: CampaignPlayOpeningModelEvidence | null = null,
): never {
  throw new CampaignPlayOpeningPlannerError(code, modelEvidence, { cause });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}:${hashCampaignPlayProjection(value).slice(0, 32)}`;
}

export function deriveCampaignPlayOpeningSceneCandidateId(
  candidate: Omit<CampaignPlayOpeningSceneCandidate, "candidateId">,
): string {
  return stableId("opening-scene", candidate);
}

function deepFreeze<T>(value: T, visited = new Set<object>()): T {
  if (typeof value !== "object" || value === null || visited.has(value)) return value;
  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  return Object.freeze(value);
}

function assertFrame(frame: CampaignPlayOpeningFrame): void {
  const world = frame.acceptedWorld;
  const idCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-:";
  const lowerHex = "0123456789abcdef";
  const validId = (value: string) => value.length > 0
    && value.length <= CAMPAIGN_PLAY_LIMITS.id
    && value === value.trim()
    && [...value].every((character) => idCharacters.includes(character));
  const validHash = (value: string) => value.length === 64
    && [...value].every((character) => lowerHex.includes(character));
  const validLabels = (values: readonly string[]) => values.length <= CAMPAIGN_PLAY_LIMITS.characterList
    && unique(values)
    && values.every((value) => value.length > 0
      && value.length <= CAMPAIGN_PLAY_LIMITS.label
      && value === value.trim()
      && !value.includes("\n")
      && !value.includes("\r"));
  const uniqueIds = (values: readonly { id: string }[]) =>
    unique(values.map((value) => value.id));
  if (
    !validId(frame.campaignId)
    || !validId(frame.turnId)
    || !validId(frame.player.actorId)
    || world.status !== "accepted"
    || world.acceptedAt === null
    || world.campaignId !== frame.campaignId
    || world.version !== frame.acceptedWorldVersion
    || world.contentHash !== frame.acceptedContentHash
    || !Number.isInteger(frame.acceptedWorldVersion)
    || !Number.isInteger(frame.baseWorldVersion)
    || frame.acceptedWorldVersion < 1
    || frame.baseWorldVersion < frame.acceptedWorldVersion
    || !validHash(frame.acceptedContentHash)
    || !validHash(frame.player.profileDigest)
    || frame.player.name.length < 1
    || frame.player.name.length > CAMPAIGN_PLAY_LIMITS.name
    || frame.player.name !== frame.player.name.trim()
    || frame.player.summary.length < 1
    || frame.player.summary.length > CAMPAIGN_PLAY_LIMITS.text
    || frame.player.summary !== frame.player.summary.trim()
    || !validLabels(frame.player.traits)
    || !validLabels(frame.player.tags)
    || !uniqueIds(world.locations)
    || !uniqueIds(world.routes)
    || !uniqueIds(world.actors)
    || !uniqueIds(world.goals)
    || !uniqueIds(world.relations)
    || !uniqueIds(world.placements)
    || !uniqueIds(world.pressures)
    || world.locations.filter((location) => location.kind === "macro" && location.isStarting).length !== 1
    || eligibleActors(world).length < 1
    || eligibleActors(world).length > OPENING_MAX_ELIGIBLE_ACTORS
    || world.pressures.length + 2 > CAMPAIGN_PLAY_LIMITS.commandsPerBatch
  ) {
    fail("opening_frame_invalid");
  }
}

function actorLocations(
  world: CampaignWorldReview,
  actorId: string,
): string[] {
  const actor = world.actors.find((candidate) => candidate.id === actorId);
  if (!actor) return [];
  const locations = world.placements
    .filter((placement) =>
      placement.actorId === actorId && placement.placementKind === "present")
    .map((placement) => placement.locationId)
    .sort(compareText);
  return [...new Set(locations)];
}

function eligibleActors(world: CampaignWorldReview) {
  return world.actors
    .filter((actor) => actor.controller === "agent")
    .sort((left, right) => compareText(left.id, right.id));
}

function entityExists(world: CampaignWorldReview, reference: CampaignPlayActorIntent["targets"][number]): boolean {
  switch (reference.kind) {
    case "actor": return world.actors.some((value) => value.id === reference.id);
    case "location": return world.locations.some((value) => value.id === reference.id);
    case "route": return world.routes.some((value) => value.id === reference.id);
    case "relation": return world.relations.some((value) => value.id === reference.id);
    case "goal": return world.goals.some((value) => value.id === reference.id);
    case "pressure": return world.pressures.some((value) => value.id === reference.id);
    case "world_event": return false;
  }
}

function targetLocationIds(
  world: CampaignWorldReview,
  reference: CampaignPlayActorIntent["targets"][number],
): string[] {
  switch (reference.kind) {
    case "location": return [reference.id];
    case "route": {
      const route = world.routes.find((value) => value.id === reference.id);
      return route ? [route.fromLocationId] : [];
    }
    case "actor": {
      return actorLocations(world, reference.id);
    }
    case "goal": {
      const goal = world.goals.find((value) => value.id === reference.id);
      return goal ? actorLocations(world, goal.actorId) : [];
    }
    case "relation": {
      const relation = world.relations.find((value) => value.id === reference.id);
      if (!relation) return [];
      return [...new Set([
        ...actorLocations(world, relation.sourceActorId),
        ...actorLocations(world, relation.targetActorId),
      ])];
    }
    case "pressure": {
      const pressure = world.pressures.find((value) => value.id === reference.id);
      if (!pressure) return [];
      return [...new Set([
        ...pressure.locationIds,
        ...pressure.actorIds
          .flatMap((actorId) => actorLocations(world, actorId)),
      ])];
    }
    case "world_event": return [];
  }
}

function validateIntent(
  world: CampaignWorldReview,
  actorLocationIds: readonly string[],
  intent: CampaignPlayActorIntent,
): void {
  if (!intent.targets.every((target) => {
    if (!entityExists(world, target)) return false;
    const locations = targetLocationIds(world, target);
    return locations.length > 0 && actorLocationIds.some((actorLocationId) =>
      locations.some((locationId) =>
        shortestDirectedDistance(world, actorLocationId, locationId) !== null));
  })) {
    fail("opening_proposal_invalid");
  }
}

function shortestDirectedDistance(
  world: CampaignWorldReview,
  fromLocationId: string,
  toLocationId: string,
): number | null {
  fromLocationId = routingLocationId(world, fromLocationId);
  toLocationId = routingLocationId(world, toLocationId);
  if (fromLocationId === toLocationId) return 0;
  const queue: Array<{ locationId: string; distance: number }> = [
    { locationId: fromLocationId, distance: 0 },
  ];
  const visited = new Set([fromLocationId]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const destinations = world.routes
      .filter((route) => route.fromLocationId === current.locationId)
      .map((route) => route.toLocationId)
      .sort(compareText);
    for (const destination of destinations) {
      if (visited.has(destination)) continue;
      const distance = current.distance + 1;
      if (destination === toLocationId) return distance;
      visited.add(destination);
      queue.push({ locationId: destination, distance });
    }
  }
  return null;
}

export function buildCampaignPlayOpeningSceneCandidates(
  frame: CampaignPlayOpeningFrame,
  startingConditions: CampaignPlayResolvedStartingConditions,
): CampaignPlayOpeningSceneCandidate[] {
  const world = frame.acceptedWorld;
  const canonicalStart = world.locations.find((location) =>
    location.kind === "macro" && location.isStarting);
  if (!canonicalStart) return [];

  const locations = world.locations
    .filter((location) =>
      location.kind === "macro"
      && shortestDirectedDistance(world, canonicalStart.id, location.id) !== null
      && (
        startingConditions.mode === "delegate"
        || location.id === startingConditions.locationId
      ))
    .sort((left, right) => compareText(left.id, right.id));
  const candidatesByLocation = locations.map((location) => {
    const supports = world.actors
      .filter((actor) =>
        actor.kind === "person"
        && actor.role === "support"
        && isActorPresentInOpeningArea(world, actor.id, location.id))
      .sort((left, right) => compareText(left.id, right.id));
    const pressures = world.pressures
      .filter((pressure) => pressure.locationIds.includes(location.id))
      .sort((left, right) => compareText(left.id, right.id));
    const routes = world.routes
      .filter((route) =>
        route.fromLocationId === location.id
        && route.toLocationId !== location.id
        && world.locations.some((candidate) => candidate.id === route.toLocationId))
      .sort((left, right) => compareText(left.id, right.id));
    const candidates: CampaignPlayOpeningSceneCandidate[] = [];
    for (const support of supports) {
      for (const pressure of pressures) {
        for (const route of routes) {
          const identity = {
            locationId: location.id,
            supportActorId: support.id,
            pressureId: pressure.id,
            routeId: route.id,
          };
          candidates.push({
            candidateId: deriveCampaignPlayOpeningSceneCandidateId(identity),
            ...identity,
          });
        }
      }
    }
    return candidates;
  });

  const selected: CampaignPlayOpeningSceneCandidate[] = [];
  for (let round = 0; selected.length < OPENING_MAX_SCENE_CANDIDATES; round += 1) {
    let added = false;
    for (const candidates of candidatesByLocation) {
      const candidate = candidates[round];
      if (!candidate) continue;
      selected.push(candidate);
      added = true;
      if (selected.length === OPENING_MAX_SCENE_CANDIDATES) break;
    }
    if (!added) break;
  }
  return selected;
}

function routingLocationId(world: CampaignWorldReview, locationId: string): string {
  const locations = new Map(world.locations.map((location) => [location.id, location]));
  const visited = new Set<string>();
  let currentId = locationId;
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const current = locations.get(currentId);
    if (!current?.parentLocationId) return currentId;
    currentId = current.parentLocationId;
  }
  return locationId;
}

function shortestDirectedTravelMinutes(
  world: CampaignWorldReview,
  fromLocationId: string,
  toLocationId: string,
): number | null {
  fromLocationId = routingLocationId(world, fromLocationId);
  toLocationId = routingLocationId(world, toLocationId);
  if (fromLocationId === toLocationId) return 0;
  const remaining = new Set(world.locations.map((location) => location.id));
  const distances = new Map<string, number>([[fromLocationId, 0]]);
  while (remaining.size > 0) {
    const current = [...remaining]
      .filter((locationId) => distances.has(locationId))
      .sort((left, right) =>
        distances.get(left)! - distances.get(right)! || compareText(left, right))[0];
    if (current === undefined) return null;
    if (current === toLocationId) return distances.get(current)!;
    remaining.delete(current);
    const currentDistance = distances.get(current)!;
    for (const route of world.routes.filter((value) => value.fromLocationId === current)) {
      const candidate = currentDistance + route.travelCost;
      const known = distances.get(route.toLocationId);
      if (known === undefined || candidate < known) distances.set(route.toLocationId, candidate);
    }
  }
  return null;
}

function intentTargetKeys(intent: CampaignPlayActorIntent): Set<string> {
  return new Set(intent.targets.map((target) => `${target.kind}:${target.id}`));
}

function compilePlans(
  frame: CampaignPlayOpeningFrame,
  proposal: CampaignPlayOpeningProposal,
) {
  const world = frame.acceptedWorld;
  const actors = eligibleActors(world);
  if (
    proposal.actorPlans.length !== actors.length
    || !unique(proposal.actorPlans.map((plan) => plan.actorId))
  ) {
    log.warn("Opening proposal actor-plan roster mismatch.", {
      expectedActorIds: actors.map((actor) => actor.id),
      proposedActorIds: proposal.actorPlans.map((plan) => plan.actorId),
    });
    fail("opening_proposal_invalid");
  }
  const hiddenActorId = proposal.hiddenConsequence.actorId;
  const plans: CampaignPlayActorPlan[] = [];
  const schedules: CampaignPlayActorSchedule[] = [];

  for (const actor of actors) {
    const proposed = proposal.actorPlans.find((plan) => plan.actorId === actor.id);
    const goals = world.goals
      .filter((goal) => goal.actorId === actor.id && goal.status === "active")
      .sort((left, right) => right.priority - left.priority || compareText(left.id, right.id));
    if (!proposed || goals.length === 0) fail("opening_proposal_invalid");
    if (!goals.some((goal) => goal.id === proposed.primaryGoalId)) {
      fail("opening_proposal_invalid");
    }
    const locationIds = actorLocations(world, actor.id);
    if (locationIds.length === 0) fail("opening_proposal_invalid");
    proposed.steps.forEach((step) => {
      validateIntent(world, locationIds, step.intent);
      if (step.observableTrace.toLowerCase().includes(actor.name.toLowerCase())) {
        fail("opening_proposal_invalid");
      }
    });

    const primaryGoal = goals.find((goal) => goal.id === proposed.primaryGoalId)!;
    const planId = stableId("plan", {
      campaignId: frame.campaignId,
      actorId: actor.id,
      goalId: primaryGoal.id,
      proposal: proposed,
    });
    const preconditions: CampaignPlayActorPlan["preconditions"] = [
      { kind: "goal_status", goalId: primaryGoal.id, status: "active" },
      { kind: "actor_at_location" as const, actorId: actor.id, locationId: locationIds[0]! },
    ];
    const plan = campaignPlayActorPlanSchema.parse({
      planId,
      campaignId: frame.campaignId,
      actorId: actor.id,
      goalId: primaryGoal.id,
      planVersion: 1,
      intent: proposed.steps[0]!.intent,
      preconditions,
      cadenceMinutes: proposed.cadenceMinutes,
      priority: primaryGoal.priority,
      steps: proposed.steps.map((step, order) => ({
        stepId: stableId("step", { planId, order, step }),
        order,
        intent: step.intent,
        observableTrace: step.observableTrace,
        elapsedBounds: step.elapsedBounds,
      })),
      status: "active",
    });
    const schedule = campaignPlayActorScheduleSchema.parse({
      scheduleId: stableId("schedule", { campaignId: frame.campaignId, actorId: actor.id }),
      campaignId: frame.campaignId,
      actorId: actor.id,
      planId,
      nextActAtWorldTimeMinutes: actor.id === hiddenActorId ? 0 : proposed.cadenceMinutes,
      lastActAtWorldTimeMinutes: null,
      priority: primaryGoal.priority,
      agencyDebt: 0,
    });
    plans.push(plan);
    schedules.push(schedule);
  }
  return { plans, schedules };
}

function compileBootstrapCommands(
  frame: CampaignPlayOpeningFrame,
  startLocationId: string,
): CampaignPlayBootstrapCommand[] {
  const batchId = stableId("batch", {
    campaignId: frame.campaignId,
    turnId: frame.turnId,
    purpose: "opening_bootstrap",
  });
  const source = { kind: "system" as const, system: "opening_bootstrap" as const };
  const inputs: OpeningBootstrapInput[] = [
    {
      kind: "initialize_player_placement",
      source,
      readScope: [
        { kind: "actor", id: frame.player.actorId },
        { kind: "location", id: startLocationId },
      ],
      writeScope: [
        { kind: "actor", id: frame.player.actorId },
        { kind: "location", id: startLocationId },
      ],
      exposure: { mode: "protected" },
      actorId: frame.player.actorId,
      locationId: startLocationId,
    },
    {
      kind: "initialize_world_time",
      source,
      readScope: [],
      writeScope: [],
      exposure: { mode: "protected" },
      worldTimeMinutes: 0,
    },
    ...[...frame.acceptedWorld.pressures]
      .sort((left, right) => compareText(left.id, right.id))
      .map((pressure) => ({
        kind: "initialize_pressure_state" as const,
        source,
        readScope: [{ kind: "pressure" as const, id: pressure.id }],
        writeScope: [{ kind: "pressure" as const, id: pressure.id }],
        exposure: { mode: "protected" as const },
        pressureId: pressure.id,
        progress: 0,
        status: "active" as const,
      })),
  ];
  const commands: CampaignPlayBootstrapCommand[] = [];
  for (const [order, input] of inputs.entries()) {
    const causalParent = order === 0
      ? { kind: "turn" as const, turnId: frame.turnId }
      : { kind: "command" as const, commandId: commands[order - 1]!.commandId };
    const commandId = deriveCampaignPlayCommandId(
      frame.campaignId,
      frame.turnId,
      batchId,
      order,
    );
    commands.push(campaignPlayBootstrapCommandSchema.parse({
      ...input,
      commandId,
      batchId,
      order,
      expectedWorldVersion: frame.baseWorldVersion + order,
      causalParent,
    }));
  }
  return commands;
}

function compileScene(
  frame: CampaignPlayOpeningFrame,
  startingConditions: CampaignPlayResolvedStartingConditions,
  proposal: CampaignPlayOpeningProposal,
  candidates: readonly CampaignPlayOpeningSceneCandidate[],
): { start: CampaignPlayOpeningStart; narratorFacts: CampaignPlayOpeningNarratorFacts } {
  const world = frame.acceptedWorld;
  const scene = candidates.find((candidate) =>
    candidate.candidateId === proposal.scene.candidateId);
  if (!scene) fail("opening_proposal_invalid");
  const start = {
    locationId: scene.locationId,
    ...proposal.start,
  };
  if (
    startingConditions.mode === "chosen"
    && (
      start.locationId !== startingConditions.locationId
      || start.role !== startingConditions.role
      || start.arrivalMode !== startingConditions.arrivalMode
      || start.immediateSituation !== startingConditions.immediateSituation
    )
  ) {
    fail("opening_proposal_invalid");
  }
  const location = world.locations.find((value) =>
    value.id === start.locationId && value.kind === "macro");
  const support = world.actors.find((value) =>
    value.id === scene.supportActorId
    && value.kind === "person"
    && value.role === "support");
  const pressure = world.pressures.find((value) =>
    value.id === scene.pressureId
    && value.locationIds.includes(start.locationId));
  const route = world.routes.find((value) =>
    value.id === scene.routeId
    && value.fromLocationId === start.locationId
    && value.toLocationId !== start.locationId);
  const destination = route
    ? world.locations.find((value) => value.id === route.toLocationId)
    : undefined;
  const supportPresent = support
    && isActorPresentInOpeningArea(world, support.id, start.locationId);
  if (
    !location
    || !support
    || !supportPresent
    || !pressure
    || !route
    || !destination
  ) {
    fail("opening_proposal_invalid");
  }
  return {
    start,
    narratorFacts: {
      location: { id: location.id, name: location.name, description: location.description },
      player: {
        role: start.role,
        arrivalMode: start.arrivalMode,
        immediateSituation: start.immediateSituation,
      },
      supportActor: { id: support.id, name: support.name, summary: support.summary },
      pressure: {
        id: pressure.id,
        name: pressure.name,
        description: pressure.description,
        trajectory: pressure.trajectory,
      },
      route: {
        id: route.id,
        destinationId: destination.id,
        destinationName: destination.name,
        travelCost: route.travelCost,
      },
    },
  };
}

function compileExposureSeed(
  frame: CampaignPlayOpeningFrame,
  proposal: CampaignPlayOpeningProposal,
  narratorFacts: CampaignPlayOpeningNarratorFacts,
  plans: CampaignPlayActorPlan[],
): CampaignPlayOpeningExposureSeed {
  const world = frame.acceptedWorld;
  const hidden = proposal.hiddenConsequence;
  const actor = world.actors.find((value) =>
    value.id === hidden.actorId && value.controller === "agent" && value.kind === "person");
  const locationIds = actor ? actorLocations(world, actor.id) : [];
  const locationId = hidden.locationId;
  const plan = plans.find((value) => value.actorId === hidden.actorId);
  const firstStep = plan?.steps[0];
  const goal = plan
    ? world.goals.find((value) =>
        value.id === plan.goalId
        && value.actorId === hidden.actorId
        && value.status === "active")
    : undefined;
  if (
    !actor
    || !goal
    || !plan
    || !firstStep
    || !locationIds.includes(locationId)
    || locationId === narratorFacts.location.id
  ) {
    fail("opening_proposal_invalid");
  }
  const observableTrace = firstStep.observableTrace;
  if (observableTrace.toLowerCase().includes(actor.name.toLowerCase())) {
    fail("opening_proposal_invalid");
  }
  const firstStepTargets = intentTargetKeys(firstStep.intent);
  let discoverableWithinPlayerActions: number;
  switch (hidden.exposure.channel) {
    case "route_state": {
      if (
        hidden.exposure.routeId !== narratorFacts.route.id
        || !firstStepTargets.has(`route:${hidden.exposure.routeId}`)
      ) fail("opening_proposal_invalid");
      discoverableWithinPlayerActions = 2;
      break;
    }
    case "witness_report": {
      if (
        hidden.exposure.witnessActorId !== narratorFacts.supportActor.id
        || !firstStepTargets.has(`actor:${hidden.exposure.witnessActorId}`)
      ) {
        fail("opening_proposal_invalid");
      }
      discoverableWithinPlayerActions = 2;
      break;
    }
    case "local_aftermath": {
      if (
        hidden.exposure.locationId !== locationId
        || !firstStepTargets.has(`location:${locationId}`)
      ) fail("opening_proposal_invalid");
      const distance = shortestDirectedDistance(world, narratorFacts.location.id, locationId);
      const travelMinutes = shortestDirectedTravelMinutes(
        world,
        narratorFacts.location.id,
        locationId,
      );
      if (
        distance === null
        || travelMinutes === null
        || hidden.exposure.validUntilWorldTimeMinutes < travelMinutes
      ) fail("opening_proposal_invalid");
      discoverableWithinPlayerActions = 1 + distance;
      break;
    }
  }
  if (discoverableWithinPlayerActions > OPENING_MAX_EXPOSURE_ACTIONS) {
    fail("opening_proposal_invalid");
  }
  return {
    sourceActorId: actor.id,
    sourceGoalId: goal.id,
    sourceLocationId: locationId,
    summary: hidden.summary,
    observableTrace,
    predicate: structuredClone(hidden.exposure),
    discoverableWithinPlayerActions,
  };
}

function successfulEvidence(trace: Readonly<SafeGenerateTrace>): CampaignPlayOpeningModelEvidence {
  const actualStrategy = trace.strategy ?? trace.capability?.actualMode ?? null;
  const primaryStrategy = trace.primaryStrategy
    ?? trace.capability?.primaryStrategy
    ?? null;
  const repairUsed = trace.strategy === "repair" || trace.repair !== undefined;
  const retryUsed = trace.strategy === "full_retry";
  const textFallbackUsed = trace.strategy === "text_fallback";
  const evidence: CampaignPlayOpeningModelEvidence = {
    requestedStrategy: "strict_object",
    actualStrategy,
    totalAttempts: 1,
    repairUsed,
    retryUsed,
    textFallbackUsed,
    responseModel: trace.response?.modelId ?? null,
    finishReason: trace.finishReason ?? null,
    errorCode: null,
    inputTokens: trace.usage?.inputTokens ?? null,
    outputTokens: trace.usage?.outputTokens ?? null,
    totalTokens: trace.usage?.totalTokens ?? null,
  };
  const structuredStrategies = new Set(["native_schema", "native_json", "tool_mode"]);
  if (
    trace.requestedMode !== "auto"
    || primaryStrategy === null
    || !structuredStrategies.has(primaryStrategy)
    || actualStrategy !== primaryStrategy
    || repairUsed
    || retryUsed
    || textFallbackUsed
  ) {
    fail("model_contract_failed", undefined, evidence);
  }
  return evidence;
}

const codeOnlyEvidence: CampaignPlayOpeningModelEvidence = {
  requestedStrategy: "strict_object",
  actualStrategy: "fixture",
  totalAttempts: 1,
  repairUsed: false,
  retryUsed: false,
  textFallbackUsed: false,
  responseModel: null,
  finishReason: null,
  errorCode: null,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
};

export function createCampaignPlayOpeningPlanner(
  overrides: Partial<CampaignPlayOpeningPlannerDependencies> = {},
): CampaignPlayOpeningPlanner {
  const dependencies = {
    generateObject: safeGenerateObject,
    ...overrides,
  };
  const compile = (
    frame: CampaignPlayOpeningFrame,
    startingConditions: CampaignPlayResolvedStartingConditions,
    rawProposal: CampaignPlayOpeningProposal,
    modelEvidence: CampaignPlayOpeningModelEvidence = codeOnlyEvidence,
  ): CampaignPlayOpeningCandidate => {
    assertFrame(frame);
    const startingResult = campaignPlayResolvedStartingConditionsSchema.safeParse(
      startingConditions,
    );
    if (!startingResult.success) {
      fail("opening_proposal_invalid", startingResult.error);
    }
    const parsedStartingConditions = startingResult.data;
    const proposalResult = campaignPlayOpeningProposalSchema.safeParse(rawProposal);
    if (!proposalResult.success) fail("opening_proposal_invalid", proposalResult.error);
    const proposal = proposalResult.data;
    const sceneCandidates = buildCampaignPlayOpeningSceneCandidates(
      frame,
      parsedStartingConditions,
    );
    if (sceneCandidates.length === 0) fail("opening_frame_invalid");
    const { start, narratorFacts } = compileScene(
      frame,
      parsedStartingConditions,
      proposal,
      sceneCandidates,
    );
    const { plans, schedules } = compilePlans(frame, proposal);
    const exposureSeed = compileExposureSeed(frame, proposal, narratorFacts, plans);
    const frameHash = hashCampaignPlayProjection({
      domain: "campaign_play_opening_frame",
      frame,
      startingConditions: parsedStartingConditions,
    });
    const proposalHash = hashCampaignPlayProjection({
      domain: "campaign_play_opening_proposal",
      proposal,
    });
    const artifact = campaignPlayOpeningArtifactSchema.parse({
      artifactId: stableId("opening", { frameHash, proposalHash }),
      campaignId: frame.campaignId,
      turnId: frame.turnId,
      acceptedWorldVersion: frame.acceptedWorldVersion,
      acceptedContentHash: frame.acceptedContentHash,
      baseWorldVersion: frame.baseWorldVersion,
      frameHash,
      proposalHash,
      start: structuredClone(start),
      bootstrapCommands: compileBootstrapCommands(frame, start.locationId),
      actorPlans: plans,
      actorSchedules: schedules,
      exposureSeed,
      narratorFacts,
    });
    const canonicalBytes = canonicalizeCampaignPlayProjection(artifact);
    return {
      artifact: deepFreeze(artifact),
      canonicalBytes,
      hash: crypto.createHash("sha256").update(canonicalBytes).digest("hex"),
      modelEvidence,
    };
  };

  return {
    compile,
    async plan(request) {
      assertFrame(request.frame);
      const startingResult = campaignPlayResolvedStartingConditionsSchema.safeParse(
        request.startingConditions,
      );
      if (!startingResult.success) {
        fail("opening_proposal_invalid", startingResult.error);
      }
      const startingConditions = startingResult.data;
      const sceneCandidates = buildCampaignPlayOpeningSceneCandidates(
        request.frame,
        startingConditions,
      );
      if (sceneCandidates.length === 0) fail("opening_frame_invalid");
      const capability = resolveStructuredOutputCapability({
        metadata: getStructuredOutputModelMetadata(request.model),
        requestedMode: "auto",
      });
      if (capability.primaryStrategy === "text_fallback") {
        fail("structured_output_unavailable", undefined, {
          ...codeOnlyEvidence,
          actualStrategy: null,
          totalAttempts: 0,
          errorCode: "structured_output_unavailable",
        });
      }
      let generated;
      try {
        generated = await dependencies.generateObject({
          model: request.model,
          schema: campaignPlayOpeningProposalSchema,
          prompt: buildCampaignPlayOpeningPrompt(
            request.frame,
            startingConditions,
            sceneCandidates,
          ),
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          abortSignal: request.signal,
          mode: "auto",
          strictSchema: true,
          allowRepair: false,
          allowTextFallback: false,
          retries: 1,
        });
      } catch (error) {
        const code = getSafeGenerateObjectErrorCode(error);
        const trace = getSafeGenerateObjectTrace(error);
        const plannerCode: CampaignPlayOpeningPlannerErrorCode =
          code === "schema_validation_failed" ||
              code === "invalid_structured_tool_call" ||
              code === "missing_structured_tool_call"
            ? "model_contract_failed"
            : "transport_interrupted";
        const evidence: CampaignPlayOpeningModelEvidence = {
          ...codeOnlyEvidence,
          actualStrategy: trace?.strategy ?? trace?.capability?.actualMode ?? null,
          repairUsed: trace?.strategy === "repair" || trace?.repair !== undefined,
          retryUsed: trace?.strategy === "full_retry",
          textFallbackUsed: trace?.strategy === "text_fallback",
          responseModel: trace?.response?.modelId ?? null,
          finishReason: trace?.finishReason ?? null,
          errorCode: code ?? plannerCode,
        };
        fail(plannerCode, error, evidence);
      }
      const modelEvidence = successfulEvidence(generated.trace);
      try {
        return compile(
          request.frame,
          startingConditions,
          generated.object,
          modelEvidence,
        );
      } catch (cause) {
        log.warn("Opening proposal failed semantic compilation.", {
          code: cause instanceof CampaignPlayOpeningPlannerError ? cause.code : null,
          stack: cause instanceof Error ? cause.stack : String(cause),
        });
        if (cause instanceof CampaignPlayOpeningPlannerError) {
          throw new CampaignPlayOpeningPlannerError(
            cause.code,
            modelEvidence,
            { cause },
          );
        }
        throw cause;
      }
    },
  };
}

export const campaignPlayOpeningPlanner = createCampaignPlayOpeningPlanner();
