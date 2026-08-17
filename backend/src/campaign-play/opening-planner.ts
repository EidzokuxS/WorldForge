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
  isSafeGenerateObjectContractErrorCode,
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
  campaignPlayActorPlanSchema,
  campaignPlayActorScheduleSchema,
  campaignPlayBootstrapCommandSchema,
  campaignPlayExposurePredicateSchema,
  recordWorldEventCommandSchema,
  setRouteStateCommandSchema,
  type CampaignPlayActorPlan,
  type CampaignPlayActorSchedule,
  type CampaignPlayBootstrapCommand,
  type CampaignPlayCommand,
  type CampaignPlayExposurePredicate,
} from "./contracts.js";
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
} from "./campaign-play-projection.js";
import { buildCampaignPlayOpeningPrompt } from "./opening-prompts.js";
import {
  isActorPresentAtScene,
  isSceneInMacroRegion,
} from "./opening-location.js";
import {
  recordCampaignPlayOpeningNoObjectDiagnostics,
  recordCampaignPlayOpeningSchemaIssueDiagnostics,
  type OpeningDiagnosticsLogger,
} from "./opening-diagnostics.js";
import { deriveCampaignPlayCommandId } from "./rulebook.js";

const OPENING_MAX_ELIGIBLE_ACTORS = 20;
const OPENING_MAX_SCENE_CANDIDATES = 24;
const OPENING_ACTOR_STAGGER_MINUTES = 5;
const OPENING_MAX_OUTPUT_TOKENS = 2_048;
const log = createLogger("campaign-play-opening-planner");

const boundedLine = (maximum: number) => z.string().min(1).max(maximum)
  .refine((value) => value === value.trim())
  .refine((value) => !value.includes("\n") && !value.includes("\r"));
const boundedText = (maximum: number) => z.string().min(1).max(maximum)
  .refine((value) => value === value.trim());

export const campaignPlayOpeningProposalSchema = z.object({
  start: z.object({
    role: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
    arrivalMode: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
    immediateSituation: boundedText(CAMPAIGN_PLAY_LIMITS.text),
  }).strict(),
  scene: z.object({
    candidateId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
  }).strict(),
  playerPremise: z.object({
    motivationIndex: z.number().int().safe().nonnegative()
      .max(CAMPAIGN_PLAY_LIMITS.characterList * 2 - 1),
    anchor: z.enum(["openingActor", "supportActor"]),
    eventClass: z.enum(["dialogue", "interaction"]),
    summary: boundedText(CAMPAIGN_PLAY_LIMITS.text),
    routeRestriction: z.object({
      reason: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
    }).strict().nullable(),
  }).strict().nullable(),
}).strict();

export type CampaignPlayOpeningProposal =
  z.infer<typeof campaignPlayOpeningProposalSchema>;

/**
 * Z.AI strict tools do not reliably accept the exact opening proposal's
 * nullable unions or frame-dependent alternatives. Keep this transport shape
 * flat and structural; the exact proposal schema remains authoritative after
 * the result is decoded.
 */
function openingPlannerToolSchemaForFrame(
  frame: CampaignPlayOpeningFrame,
  startingConditions: CampaignPlayResolvedStartingConditions,
  sceneCandidates: readonly CampaignPlayOpeningSceneCandidate[],
) {
  const candidateIds = sceneCandidates.map((candidate) => candidate.candidateId);
  const scene = z.object({
    candidateId: z.enum(candidateIds as [string, ...string[]]),
  }).strict();
  const start = startingConditions.mode === "chosen"
    ? z.object({
        role: z.enum([startingConditions.role]),
        arrivalMode: z.enum([startingConditions.arrivalMode]),
        immediateSituation: z.enum([startingConditions.immediateSituation]),
      }).strict()
    : z.object({
        role: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
        arrivalMode: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
        immediateSituation: boundedText(CAMPAIGN_PLAY_LIMITS.text),
      }).strict();
  const routeRestriction = z.object({
    state: z.enum(["none", "restricted"]),
    reason: z.string()
      .max(CAMPAIGN_PLAY_LIMITS.shortText)
      .refine((value) => value === value.trim())
      .refine((value) => !value.includes("\n") && !value.includes("\r")),
  }).strict();
  const playerPremise = frame.player.motivations.length === 0
    ? z.object({ state: z.enum(["none"]) }).strict()
    : z.object({
        state: z.enum(["motivated"]),
        motivationIndex: z.number().int().min(0)
          .max(frame.player.motivations.length - 1),
        anchor: z.enum(["openingActor", "supportActor"]),
        eventClass: z.enum(["dialogue", "interaction"]),
        summary: boundedText(CAMPAIGN_PLAY_LIMITS.text),
        routeRestriction,
      }).strict();
  return z.object({ start, scene, playerPremise }).strict();
}

function decodeOpeningPlannerToolResult(
  frame: CampaignPlayOpeningFrame,
  startingConditions: CampaignPlayResolvedStartingConditions,
  sceneCandidates: readonly CampaignPlayOpeningSceneCandidate[],
  raw: unknown,
): CampaignPlayOpeningProposal {
  const transportResult = openingPlannerToolSchemaForFrame(
    frame,
    startingConditions,
    sceneCandidates,
  ).safeParse(raw);
  if (!transportResult.success) fail("model_contract_failed", transportResult.error);

  const transportPremise = transportResult.data.playerPremise;
  const playerPremise = transportPremise.state === "none"
    ? null
    : (() => {
        const route = transportPremise.routeRestriction;
        if (route.state === "none") {
          if (route.reason !== "") fail("model_contract_failed");
          return {
            motivationIndex: transportPremise.motivationIndex,
            anchor: transportPremise.anchor,
            eventClass: transportPremise.eventClass,
            summary: transportPremise.summary,
            routeRestriction: null,
          };
        }
        const reasonResult = boundedLine(CAMPAIGN_PLAY_LIMITS.shortText).safeParse(route.reason);
        if (!reasonResult.success) fail("model_contract_failed", reasonResult.error);
        return {
          motivationIndex: transportPremise.motivationIndex,
          anchor: transportPremise.anchor,
          eventClass: transportPremise.eventClass,
          summary: transportPremise.summary,
          routeRestriction: { reason: reasonResult.data },
        };
      })();
  const proposalResult = campaignPlayOpeningProposalSchema.safeParse({
    start: transportResult.data.start,
    scene: transportResult.data.scene,
    playerPremise,
  });
  if (!proposalResult.success) fail("model_contract_failed", proposalResult.error);
  return proposalResult.data;
}

const campaignPlayOpeningStartSchema = z.object({
  sceneLocationId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
  role: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
  arrivalMode: boundedLine(CAMPAIGN_PLAY_LIMITS.shortText),
  immediateSituation: boundedText(CAMPAIGN_PLAY_LIMITS.text),
}).strict();

export type CampaignPlayOpeningStart = z.infer<typeof campaignPlayOpeningStartSchema>;

export interface CampaignPlayOpeningSceneCandidate {
  candidateId: string;
  sceneLocationId: string;
  openingActorId: string;
  supportActorId: string;
  pressureId: string;
  routeId: string;
}

export type CampaignPlayResolvedStartingConditions =
  | { mode: "delegate" }
  | {
      mode: "chosen";
      macroLocationId: string;
      role: string;
      arrivalMode: string;
      immediateSituation: string;
    };

export const campaignPlayResolvedStartingConditionsSchema:
  z.ZodType<CampaignPlayResolvedStartingConditions> = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("delegate") }).strict(),
    z.object({
      mode: z.literal("chosen"),
      macroLocationId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
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
  motivations: string[];
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

type CampaignPlayOpeningCommand = CampaignPlayBootstrapCommand |
  Extract<CampaignPlayCommand, { kind: "record_world_event" | "set_route_state" }>;

const campaignPlayOpeningCommandSchema: z.ZodType<CampaignPlayOpeningCommand> = z.union([
  campaignPlayBootstrapCommandSchema,
  recordWorldEventCommandSchema,
  setRouteStateCommandSchema,
]);

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
  bootstrapCommands: CampaignPlayOpeningCommand[];
  playerPremise: { motivation: string; commandId: string } | null;
  actorPlans: CampaignPlayActorPlan[];
  actorSchedules: CampaignPlayActorSchedule[];
  exposureSeed: CampaignPlayOpeningExposureSeed | null;
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
    bootstrapCommands: z.array(campaignPlayOpeningCommandSchema)
      .min(1)
      .max(CAMPAIGN_PLAY_LIMITS.commandsPerBatch),
    playerPremise: z.object({
      motivation: boundedLine(CAMPAIGN_PLAY_LIMITS.label),
      commandId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
    }).strict().nullable(),
    actorPlans: z.array(campaignPlayActorPlanSchema).max(OPENING_MAX_ELIGIBLE_ACTORS),
    actorSchedules: z.array(campaignPlayActorScheduleSchema).min(1).max(OPENING_MAX_ELIGIBLE_ACTORS),
    exposureSeed: z.object({
      sourceActorId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
      sourceGoalId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
      sourceLocationId: boundedLine(CAMPAIGN_PLAY_LIMITS.id),
      summary: boundedText(CAMPAIGN_PLAY_LIMITS.text),
      observableTrace: boundedText(CAMPAIGN_PLAY_LIMITS.text),
      predicate: campaignPlayExposurePredicateSchema,
      discoverableWithinPlayerActions: z.number().int().min(1).max(5),
    }).strict().nullable(),
    narratorFacts: openingNarratorFactsSchema,
  }).strict().superRefine((artifact, context) => {
    if (artifact.baseWorldVersion < artifact.acceptedWorldVersion) {
      context.addIssue({
        code: "custom",
        path: ["baseWorldVersion"],
        message: "Opening artifact base world version precedes accepted world authority.",
      });
    }
    const lazyOpening = artifact.actorPlans.length === 0;
    if (
      (lazyOpening && artifact.actorSchedules.some((schedule) => schedule.planId !== null))
      || (!lazyOpening && (
        artifact.actorPlans.length !== artifact.actorSchedules.length
        || artifact.actorSchedules.some((schedule) => schedule.planId === null)
      ))
    ) {
      context.addIssue({
        code: "custom",
        path: ["actorSchedules"],
        message: "Opening artifact schedules must be uniformly lazy or paired with legacy plans.",
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
  diagnosticsLogger?: OpeningDiagnosticsLogger;
}

type OpeningBootstrapInput<T = CampaignPlayOpeningCommand> =
  T extends CampaignPlayOpeningCommand
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
  const validMotivations = (values: readonly string[]) =>
    values.length <= CAMPAIGN_PLAY_LIMITS.characterList * 2
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
    || !validMotivations(frame.player.motivations)
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
    || world.pressures.length + 2 + (frame.player.motivations.length > 0 ? 1 : 0)
      > CAMPAIGN_PLAY_LIMITS.commandsPerBatch
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

export function buildCampaignPlayOpeningSceneCandidates(
  frame: CampaignPlayOpeningFrame,
  startingConditions: CampaignPlayResolvedStartingConditions,
): CampaignPlayOpeningSceneCandidate[] {
  const world = frame.acceptedWorld;
  const locations = world.locations
    .filter((location) =>
      location.kind === "persistent_sublocation"
      && (
        startingConditions.mode === "delegate"
        || location.parentLocationId === startingConditions.macroLocationId
      ))
    .sort((left, right) => compareText(left.id, right.id));
  const candidatesByLocation = locations.map((location) => {
    const openingActors = world.actors
      .filter((actor) =>
        actor.kind === "person"
        && actor.controller === "agent"
        && actorLocations(world, actor.id).includes(location.id))
      .sort((left, right) => compareText(left.id, right.id));
    const supports = world.actors
      .filter((actor) =>
        actor.kind === "person"
        && actor.role === "support"
        && isActorPresentAtScene(world, actor.id, location.id))
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
    for (const openingActor of openingActors) {
      for (const support of supports) {
        for (const pressure of pressures) {
          for (const route of routes) {
            const identity = {
              sceneLocationId: location.id,
              openingActorId: openingActor.id,
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

function compileActorSchedules(
  frame: CampaignPlayOpeningFrame,
  openingActorId: string,
): CampaignPlayActorSchedule[] {
  const world = frame.acceptedWorld;
  const actors = eligibleActors(world).sort((left, right) => {
    if (left.id === openingActorId) return -1;
    if (right.id === openingActorId) return 1;
    return compareText(left.id, right.id);
  });
  return actors.map((actor, dueOrder) => {
    const goals = world.goals
      .filter((goal) => goal.actorId === actor.id && goal.status === "active")
      .sort((left, right) => right.priority - left.priority || compareText(left.id, right.id));
    const primaryGoal = goals[0];
    if (!primaryGoal || actorLocations(world, actor.id).length !== 1) {
      fail("opening_frame_invalid");
    }
    return campaignPlayActorScheduleSchema.parse({
      scheduleId: stableId("schedule", { campaignId: frame.campaignId, actorId: actor.id }),
      campaignId: frame.campaignId,
      actorId: actor.id,
      planId: null,
      nextActAtWorldTimeMinutes: dueOrder * OPENING_ACTOR_STAGGER_MINUTES,
      lastActAtWorldTimeMinutes: null,
      priority: primaryGoal.priority,
      agencyDebt: 0,
    });
  });
}

function compileBootstrapCommands(
  frame: CampaignPlayOpeningFrame,
  startLocationId: string,
  premiseRouteId: string,
  playerPremise: CampaignPlayOpeningProposal["playerPremise"],
  openingActorId: string,
  supportActorId: string,
): CampaignPlayOpeningCommand[] {
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
    ...(playerPremise === null || playerPremise.routeRestriction === null
      ? []
      : [{
          kind: "set_route_state" as const,
          source,
          readScope: [{ kind: "route" as const, id: premiseRouteId }],
          writeScope: [{ kind: "route" as const, id: premiseRouteId }],
          exposure: { mode: "protected" as const },
          routeId: premiseRouteId,
          state: "restricted" as const,
          reason: playerPremise.routeRestriction.reason,
        }]),
    ...(playerPremise === null
      ? []
      : [{
          kind: "record_world_event" as const,
          source,
          readScope: [
            { kind: "actor" as const, id: frame.player.actorId },
            {
              kind: "actor" as const,
              id: playerPremise.anchor === "openingActor" ? openingActorId : supportActorId,
            },
            { kind: "location" as const, id: startLocationId },
          ],
          writeScope: [],
          exposure: {
            mode: "projectable" as const,
            predicates: [{
              channel: "direct_perception" as const,
              locationId: startLocationId,
            }],
          },
          eventClass: playerPremise.eventClass,
          performingActorId:
            playerPremise.anchor === "openingActor" ? openingActorId : supportActorId,
          summary: playerPremise.summary,
          observableTrace: null,
          affectedRefs: [
            { kind: "actor" as const, id: frame.player.actorId },
            {
              kind: "actor" as const,
              id: playerPremise.anchor === "openingActor" ? openingActorId : supportActorId,
            },
            { kind: "location" as const, id: startLocationId },
          ],
        }]),
  ];
  const commands: CampaignPlayOpeningCommand[] = [];
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
    commands.push(campaignPlayOpeningCommandSchema.parse({
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
): {
  start: CampaignPlayOpeningStart;
  openingActorId: string;
  supportActorId: string;
  narratorFacts: CampaignPlayOpeningNarratorFacts;
} {
  const world = frame.acceptedWorld;
  const scene = candidates.find((candidate) =>
    candidate.candidateId === proposal.scene.candidateId);
  if (!scene) fail("opening_proposal_invalid");
  const start = {
    sceneLocationId: scene.sceneLocationId,
    ...proposal.start,
  };
  if (
    startingConditions.mode === "chosen"
    && (
      !isSceneInMacroRegion(
        world,
        start.sceneLocationId,
        startingConditions.macroLocationId,
      )
      || start.role !== startingConditions.role
      || start.arrivalMode !== startingConditions.arrivalMode
      || start.immediateSituation !== startingConditions.immediateSituation
    )
  ) {
    fail("opening_proposal_invalid");
  }
  const location = world.locations.find((value) =>
    value.id === start.sceneLocationId && value.kind === "persistent_sublocation");
  const support = world.actors.find((value) =>
    value.id === scene.supportActorId
    && value.kind === "person"
    && value.role === "support");
  const openingActor = world.actors.find((value) =>
    value.id === scene.openingActorId
    && value.kind === "person"
    && value.controller === "agent");
  const pressure = world.pressures.find((value) =>
    value.id === scene.pressureId
    && value.locationIds.includes(start.sceneLocationId));
  const route = world.routes.find((value) =>
    value.id === scene.routeId
    && value.fromLocationId === start.sceneLocationId
    && value.toLocationId !== start.sceneLocationId);
  const destination = route
    ? world.locations.find((value) => value.id === route.toLocationId)
    : undefined;
  const supportPresent = support
    && isActorPresentAtScene(world, support.id, start.sceneLocationId);
  if (
    !location
    || !openingActor
    || !actorLocations(world, openingActor.id).includes(start.sceneLocationId)
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
    openingActorId: openingActor.id,
    supportActorId: support.id,
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
    const { start, openingActorId, supportActorId, narratorFacts } = compileScene(
      frame,
      parsedStartingConditions,
      proposal,
      sceneCandidates,
    );
    if (
      (frame.player.motivations.length === 0) !== (proposal.playerPremise === null)
      || (
        proposal.playerPremise !== null
        && proposal.playerPremise.motivationIndex >= frame.player.motivations.length
      )
    ) {
      fail("opening_proposal_invalid");
    }
    const schedules = compileActorSchedules(frame, openingActorId);
    const frameHash = hashCampaignPlayProjection({
      domain: "campaign_play_opening_frame",
      frame,
      startingConditions: parsedStartingConditions,
    });
    const proposalHash = hashCampaignPlayProjection({
      domain: "campaign_play_opening_proposal",
      proposal,
    });
    const bootstrapCommands = compileBootstrapCommands(
      frame,
      start.sceneLocationId,
      narratorFacts.route.id,
      proposal.playerPremise,
      openingActorId,
      supportActorId,
    );
    const premiseCommand = bootstrapCommands.find((command) =>
      command.kind === "record_world_event");
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
      bootstrapCommands,
      playerPremise: proposal.playerPremise === null
        ? null
        : {
            motivation: frame.player.motivations[proposal.playerPremise.motivationIndex]!,
            commandId: premiseCommand!.commandId,
          },
      actorPlans: [],
      actorSchedules: schedules,
      exposureSeed: null,
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
        const toolMode = capability.primaryStrategy === "tool_mode";
        const generationSchema = toolMode
          ? openingPlannerToolSchemaForFrame(
            request.frame,
            startingConditions,
            sceneCandidates,
          ) as unknown as z.ZodType<CampaignPlayOpeningProposal>
          : campaignPlayOpeningProposalSchema;
        generated = await dependencies.generateObject({
          model: request.model,
          schema: generationSchema,
          prompt: buildCampaignPlayOpeningPrompt(
            request.frame,
            startingConditions,
            sceneCandidates,
            toolMode ? "tool_mode" : "native",
          ),
          temperature: request.temperature,
          maxOutputTokens: Math.min(request.maxOutputTokens, OPENING_MAX_OUTPUT_TOKENS),
          abortSignal: request.signal,
          mode: "auto",
          strictSchema: true,
          allowRepair: false,
          allowTextFallback: false,
          retries: 1,
          timeout: { totalMs: 180_000 },
        });
      } catch (error) {
        const code = getSafeGenerateObjectErrorCode(error);
        const trace = getSafeGenerateObjectTrace(error);
        recordCampaignPlayOpeningNoObjectDiagnostics(
          dependencies.diagnosticsLogger ?? log,
          error,
          code,
          trace,
        );
        const plannerCode: CampaignPlayOpeningPlannerErrorCode =
          isSafeGenerateObjectContractErrorCode(code)
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
        const proposal = capability.primaryStrategy === "tool_mode"
          ? decodeOpeningPlannerToolResult(
            request.frame,
            startingConditions,
            sceneCandidates,
            generated.object,
          )
          : generated.object;
        return compile(
          request.frame,
          startingConditions,
          proposal,
          modelEvidence,
        );
      } catch (cause) {
        const plannerError = cause instanceof CampaignPlayOpeningPlannerError
          ? cause
          : null;
        const schemaIssueLogged = plannerError
          ? recordCampaignPlayOpeningSchemaIssueDiagnostics(
            dependencies.diagnosticsLogger ?? log,
            plannerError.cause,
          )
          : false;
        if (!schemaIssueLogged) {
          log.warn("Opening proposal failed semantic compilation.", {
            code: plannerError?.code ?? null,
            stack: cause instanceof Error ? cause.stack : String(cause),
          });
        }
        if (plannerError) {
          throw new CampaignPlayOpeningPlannerError(
            plannerError.code,
            modelEvidence,
            { cause: plannerError },
          );
        }
        throw cause;
      }
    },
  };
}

export const campaignPlayOpeningPlanner = createCampaignPlayOpeningPlanner();
