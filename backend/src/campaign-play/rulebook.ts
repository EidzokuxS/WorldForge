import {
  CAMPAIGN_PLAY_LIMITS,
  type CampaignPlaySetupPhase,
  type CampaignWorldReview,
} from "@worldforge/shared";
import type {
  CampaignPlayDecisionDisposition,
  CampaignPlayDecisionKind,
  CampaignPlayDecisionStatus,
  CampaignPlayPlayerCommitment,
} from "@worldforge/shared";
import {
  CAMPAIGN_PLAY_COMMAND_METADATA,
  rulebookCommandBatchSchema,
  type CampaignPlayCausalParent,
  type CampaignPlayEntityRef,
  type RulebookBatchCommand,
  type RulebookCommandBatch,
} from "./contracts.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayLocalSceneTopologyIds,
  deriveCampaignPlayObligationId,
  deriveCampaignPlayPossessionId,
  deriveCampaignPlayPossessionKey,
  deriveCampaignPlaySupportActorIds,
  deriveCampaignPlayPublicHandle,
  hashCampaignPlayProjection,
  projectCampaignPlayMechanicalTruth,
} from "./campaign-play-projection.js";
import type { CampaignPlayMutationContext } from "./campaign-play-state-repository.js";
import type {
  CampaignPlayHumanMechanicalIdentity,
  CampaignPlayLiveActorCondition,
  CampaignPlayLiveActorObligation,
  CampaignPlayLiveActorPossession,
  CampaignPlayLiveGoal,
  CampaignPlayLivePlacement,
  CampaignPlayLivePressureState,
  CampaignPlayLiveRelation,
  CampaignPlayLiveRouteState,
  CampaignPlayLivePendingDecision,
  CampaignPlayRuntimeLocation,
  CampaignPlayRuntimeRoute,
  CampaignPlayRuntimeActor,
} from "./campaign-play-projection.js";

export type CampaignPlayPendingDecision = CampaignPlayLivePendingDecision;

export type CampaignPlayRulebookPurpose =
  | "character_bootstrap"
  | "opening"
  | "player_action"
  | "actor_job"
  | "commitment_execution";

interface CampaignPlayRulebookCommitmentExecutionContextBase {
  action: "collect" | "deliver";
  commitmentKind: "paid_delivery" | "unpaid_delivery";
  commitmentId: string;
  performerActorId: string;
  counterpartyActorId: string;
  subjectName: string;
  destinationLocationId: string;
  destinationHandle: string;
  possessionId: string | null;
  sourceDecisionKey: string;
  sourceTurnId: string;
  sourceReceiptId: string;
  commitmentWorldVersion: number;
}

export type CampaignPlayRulebookCommitmentExecutionContext =
  | (CampaignPlayRulebookCommitmentExecutionContextBase & {
      commitmentKind: "paid_delivery";
      feeUnit: "copper";
      feeAmount: number;
    })
  | (CampaignPlayRulebookCommitmentExecutionContextBase & {
      commitmentKind: "unpaid_delivery";
    });

export interface CampaignPlayRulebookFrame {
  campaignId: string;
  acceptedWorldVersion: number;
  acceptedContentHash: string;
  setupPhase: CampaignPlaySetupPhase;
  worldVersion: number;
  worldTimeMinutes: number | null;
  human: CampaignPlayHumanMechanicalIdentity | null;
  acceptedWorld: CampaignWorldReview;
  runtimeActors: CampaignPlayRuntimeActor[];
  runtimeLocations: CampaignPlayRuntimeLocation[];
  runtimeRoutes: CampaignPlayRuntimeRoute[];
  routeStates: CampaignPlayLiveRouteState[];
  actorConditions: CampaignPlayLiveActorCondition[];
  possessions: CampaignPlayLiveActorPossession[];
  obligations: CampaignPlayLiveActorObligation[];
  pressureStates: CampaignPlayLivePressureState[];
  placements: CampaignPlayLivePlacement[];
  relations: CampaignPlayLiveRelation[];
  goals: CampaignPlayLiveGoal[];
  pendingDecisions?: CampaignPlayPendingDecision[];
  commitments: CampaignPlayPlayerCommitment[];
}

export interface CampaignPlayRulebookAuthority {
  purpose: CampaignPlayRulebookPurpose;
  turnId: string | null;
  actorId: string | null;
  rootParent: CampaignPlayCausalParent;
  authorizedRefs: CampaignPlayEntityRef[];
  witnessActorIds: string[];
  knownWorldEventIds: string[];
  commitmentExecution?: CampaignPlayRulebookCommitmentExecutionContext;
}

export interface CampaignPlayRulebookPreflightInput {
  frame: CampaignPlayRulebookFrame;
  authority: CampaignPlayRulebookAuthority;
  batch: unknown;
}

export type CampaignPlayRulebookDenialCode =
  | "invalid_frame"
  | "invalid_authority"
  | "invalid_batch"
  | "stale_world_version"
  | "command_unavailable"
  | "invalid_source"
  | "invalid_causal_parent"
  | "unauthorized_reference"
  | "invalid_reference"
  | "invalid_read_scope"
  | "invalid_write_scope"
  | "precondition_failed"
  | "invalid_exposure"
  | "invalid_bootstrap_coverage";

export interface CampaignPlayRulebookDenial {
  code: CampaignPlayRulebookDenialCode;
  commandIndex: number | null;
  commandId: string | null;
  detail: string;
}

export interface CampaignPlayRulebookSimulation {
  worldVersion: number;
  worldTimeMinutes: number | null;
  human: CampaignPlayHumanMechanicalIdentity | null;
  runtimeActors: CampaignPlayRuntimeActor[];
  runtimeLocations: CampaignPlayRuntimeLocation[];
  runtimeRoutes: CampaignPlayRuntimeRoute[];
  routeStates: CampaignPlayLiveRouteState[];
  actorConditions: CampaignPlayLiveActorCondition[];
  possessions: CampaignPlayLiveActorPossession[];
  obligations: CampaignPlayLiveActorObligation[];
  pressureStates: CampaignPlayLivePressureState[];
  placements: CampaignPlayLivePlacement[];
  relations: CampaignPlayLiveRelation[];
  goals: CampaignPlayLiveGoal[];
  pendingDecisions: CampaignPlayPendingDecision[];
  commitments: CampaignPlayPlayerCommitment[];
}

export type CampaignPlayRulebookPreflightResult =
  | {
      accepted: true;
      batch: RulebookCommandBatch;
      simulation: CampaignPlayRulebookSimulation;
      checkpoints: CampaignPlayRulebookSimulation[];
    }
  | { accepted: false; denial: CampaignPlayRulebookDenial };

const acceptedRulebookSeals = new WeakMap<object, string>();

function freezeRulebookValue<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeRulebookValue(child, seen);
  }
  return Object.freeze(value);
}

function acceptedRulebookSeal(
  batch: RulebookCommandBatch,
  checkpoints: CampaignPlayRulebookSimulation[],
): string {
  return hashCampaignPlayProjection({ batch, checkpoints });
}

class RulebookDenied extends Error {
  constructor(readonly denial: CampaignPlayRulebookDenial) {
    super(denial.code);
    this.name = "RulebookDenied";
  }
}

function deny(
  code: CampaignPlayRulebookDenialCode,
  detail: string,
  command?: RulebookBatchCommand,
  commandIndex: number | null = null,
): never {
  throw new RulebookDenied({
    code,
    commandIndex,
    commandId: command?.commandId ?? null,
    detail,
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function refKey(reference: CampaignPlayEntityRef): string {
  return `${reference.kind}\u0000${reference.id}`;
}

function refsEqual(
  actual: readonly CampaignPlayEntityRef[],
  expected: readonly CampaignPlayEntityRef[],
): boolean {
  return actual.length === expected.length
    && actual.every((reference, index) => refKey(reference) === refKey(expected[index]!));
}

function causalParentsEqual(
  left: CampaignPlayCausalParent,
  right: CampaignPlayCausalParent,
): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "accepted_world": return right.kind === "accepted_world"
      && left.campaignId === right.campaignId
      && left.acceptedWorldVersion === right.acceptedWorldVersion
      && left.acceptedContentHash === right.acceptedContentHash;
    case "turn": return right.kind === "turn" && left.turnId === right.turnId;
    case "command": return right.kind === "command" && left.commandId === right.commandId;
    case "world_event": return right.kind === "world_event" && left.eventId === right.eventId;
    case "actor_job": return right.kind === "actor_job" && left.jobId === right.jobId;
  }
}

function ref(kind: CampaignPlayEntityRef["kind"], id: string): CampaignPlayEntityRef {
  return { kind, id };
}

function liveLocation(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  locationId: string,
) {
  return state.runtimeLocations.find((row) => row.id === locationId)
    ?? frame.acceptedWorld.locations.find((row) => row.id === locationId);
}

function liveRoute(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  routeId: string,
) {
  return state.runtimeRoutes.find((row) => row.id === routeId)
    ?? frame.acceptedWorld.routes.find((row) => row.id === routeId);
}

function validFrame(frame: CampaignPlayRulebookFrame): boolean {
  const world = frame.acceptedWorld;
  const lowerHex = "0123456789abcdef";
  const validHash = (value: string) => value.length === 64
    && [...value].every((character) => lowerHex.includes(character));
  const validWorldTime = frame.worldTimeMinutes === null
    || (Number.isInteger(frame.worldTimeMinutes)
      && frame.worldTimeMinutes >= 0
      && frame.worldTimeMinutes <= CAMPAIGN_PLAY_LIMITS.worldTimeMinutes);
  const idsUnique = [
    frame.runtimeActors.map((row) => row.id),
    frame.runtimeLocations.map((row) => row.id),
    frame.runtimeRoutes.map((row) => row.id),
    frame.routeStates.map((row) => row.routeId),
    frame.actorConditions.map((row) => `${row.actorId}\u0000${row.condition}`),
    frame.possessions.map((row) => row.possessionId),
    frame.possessions.map((row) => `${row.actorId}\u0000${row.possessionKey}`),
    frame.obligations.map((row) => row.obligationId),
    frame.obligations.map((row) =>
      `${row.debtorActorId}\u0000${row.creditorActorId}\u0000${row.unitKey}`),
    frame.pressureStates.map((row) => row.pressureId),
    frame.placements.map((row) => row.placementId),
    frame.relations.map((row) => row.relationId),
    frame.goals.map((row) => row.goalId),
    frame.pendingDecisions?.map((row) => row.decisionKey) ?? [],
    frame.commitments.map((row) => row.commitmentId),
    frame.commitments.map((row) => row.sourceDecisionKey),
  ].every(unique);
  const runtimeActorIds = new Set(frame.runtimeActors.map((actor) => actor.id));
  const allActorIdentityIds = [
    ...world.actors.map((actor) => actor.id),
    ...frame.runtimeActors.map((actor) => actor.id),
    ...(frame.human ? [frame.human.actorId] : []),
  ];
  const actorIds = new Set(allActorIdentityIds);
  if (frame.human) actorIds.add(frame.human.actorId);
  const locationIds = new Set([
    ...world.locations.map((location) => location.id),
    ...frame.runtimeLocations.map((location) => location.id),
  ]);
  const routeIds = new Set([
    ...world.routes.map((route) => route.id),
    ...frame.runtimeRoutes.map((route) => route.id),
  ]);
  const relationById = new Map(world.relations.map((relation) => [relation.id, relation]));
  const goalById = new Map(world.goals.map((goal) => [goal.id, goal]));
  const acceptedPlacementById = new Map(world.placements.map((placement) => [placement.id, placement]));
  const acceptedPlacementIds = new Set(world.placements.map((placement) => placement.id));
  const pressureIds = [...world.pressures].map((pressure) => pressure.id).sort(compareText);
  const currentPressureIds = frame.pressureStates.map((pressure) => pressure.pressureId).sort(compareText);
  const playerPresent = frame.human !== null && frame.placements.some((placement) =>
    placement.actorId === frame.human!.actorId && placement.placementKind === "present");
  const playerPlacements = frame.human === null
    ? []
    : frame.placements.filter((placement) => placement.actorId === frame.human!.actorId);
  const openingPossessionsValid = frame.human !== null && frame.possessions.every((possession) =>
    possession.actorId === frame.human!.actorId && possession.quantity > 0);
  const pendingDecisions = frame.pendingDecisions ?? [];
  const decisionKeys = new Set(pendingDecisions.map((decision) => decision.decisionKey));
  const commitments = frame.commitments;
  const commitmentIds = new Set(commitments.map((commitment) => commitment.commitmentId));
  const expectedOpeningBaseVersion = frame.acceptedWorldVersion + 1 + frame.possessions.length;
  const expectedReadyMinimumVersion = frame.acceptedWorldVersion + 3 + world.pressures.length;
  const setupShapeValid = frame.setupPhase === "character_required"
    ? frame.human === null && frame.worldVersion === frame.acceptedWorldVersion
      && frame.worldTimeMinutes === null
      && frame.pressureStates.length === 0 && frame.possessions.length === 0
      && frame.obligations.length === 0 && frame.runtimeActors.length === 0
      && commitments.length === 0 && !playerPresent
    : frame.setupPhase === "opening_required"
      ? frame.human !== null && frame.worldVersion === expectedOpeningBaseVersion
        && frame.worldTimeMinutes === null && playerPlacements.length === 0
        && frame.pressureStates.length === 0 && frame.runtimeActors.length === 0
        && commitments.length === 0 && openingPossessionsValid
      : frame.human !== null && frame.worldVersion >= expectedReadyMinimumVersion
        && frame.worldTimeMinutes !== null && playerPlacements.length === 1 && playerPresent
        && JSON.stringify(currentPressureIds) === JSON.stringify(pressureIds);
  return world.status === "accepted"
    && world.acceptedAt !== null
    && world.campaignId === frame.campaignId
    && world.version === frame.acceptedWorldVersion
    && world.contentHash === frame.acceptedContentHash
    && Number.isInteger(frame.worldVersion)
    && frame.worldVersion >= frame.acceptedWorldVersion
    && validWorldTime
    && idsUnique
    && unique(allActorIdentityIds)
    && (frame.human === null || validHash(frame.human.recordHash))
    && (frame.human === null || !world.actors.some((candidate) => candidate.id === frame.human!.actorId))
    && frame.runtimeActors.every((runtimeActor) =>
      runtimeActor.kind === "person"
      && runtimeActor.controller === "agent"
      && runtimeActor.role === "support"
      && runtimeActor.name === runtimeActor.name.trim()
      && runtimeActor.summary === runtimeActor.summary.trim()
      && runtimeActor.name.length > 0
      && runtimeActor.name.length <= CAMPAIGN_PLAY_LIMITS.name
      && runtimeActor.summary.length > 0
      && runtimeActor.summary.length <= CAMPAIGN_PLAY_LIMITS.text
      && runtimeActor.causalReceiptId.length > 0
      && Number.isInteger(runtimeActor.worldVersion)
      && runtimeActor.worldVersion > frame.acceptedWorldVersion
      && runtimeActor.worldVersion <= frame.worldVersion)
    && frame.runtimeLocations.every((location) => {
      const parent = world.locations.find((candidate) => candidate.id === location.parentLocationId);
      const outbound = frame.runtimeRoutes.find((candidate) =>
        candidate.fromLocationId === location.anchorLocationId
        && candidate.toLocationId === location.id
        && candidate.causalReceiptId === location.causalReceiptId);
      const returning = frame.runtimeRoutes.find((candidate) =>
        candidate.fromLocationId === location.id
        && candidate.toLocationId === location.anchorLocationId
        && candidate.causalReceiptId === location.causalReceiptId);
      return location.kind === "persistent_sublocation"
        && parent?.kind === "macro"
        && location.tags.length === 0
        && location.name === location.name.trim()
        && location.description === location.description.trim()
        && !world.locations.some((candidate) => candidate.id === location.id)
        && Number.isInteger(location.worldVersion)
        && location.worldVersion >= frame.acceptedWorldVersion
        && location.worldVersion <= frame.worldVersion
        && outbound?.travelCost === returning?.travelCost
        && outbound?.worldVersion === location.worldVersion
        && returning?.worldVersion === location.worldVersion;
    })
    && frame.runtimeRoutes.every((route) =>
      !world.routes.some((candidate) => candidate.id === route.id)
      && locationIds.has(route.fromLocationId)
      && locationIds.has(route.toLocationId)
      && Number.isInteger(route.travelCost)
      && route.travelCost >= 1
      && route.travelCost <= 10
      && Number.isInteger(route.worldVersion)
      && route.worldVersion >= frame.acceptedWorldVersion
      && route.worldVersion <= frame.worldVersion)
    && frame.routeStates.every((row) => routeIds.has(row.routeId))
    && frame.actorConditions.every((row) => actorIds.has(row.actorId)
      && row.summary.length > 0
      && row.summary.length <= CAMPAIGN_PLAY_LIMITS.shortText
      && row.summary === row.summary.trim())
    && frame.possessions.every((row) => actorIds.has(row.actorId)
      && row.name.length > 0
      && row.name.length <= CAMPAIGN_PLAY_LIMITS.name
      && row.name === row.name.trim()
      && row.possessionKey === deriveCampaignPlayPossessionKey(row.name)
      && row.possessionId === deriveCampaignPlayPossessionId(
        frame.campaignId,
        row.actorId,
        row.possessionKey,
      )
      && Number.isInteger(row.quantity)
      && row.quantity >= 0
      && row.quantity <= CAMPAIGN_PLAY_LIMITS.possessionQuantity)
    && frame.obligations.every((row) => actorIds.has(row.debtorActorId)
      && actorIds.has(row.creditorActorId)
      && row.debtorActorId !== row.creditorActorId
      && row.unitKey === "copper"
      && row.obligationId === deriveCampaignPlayObligationId(
        frame.campaignId,
        row.debtorActorId,
        row.creditorActorId,
        row.unitKey,
      )
      && Number.isInteger(row.principalAmount)
      && Number.isInteger(row.outstandingAmount)
      && row.principalAmount >= 1
      && row.principalAmount <= CAMPAIGN_PLAY_LIMITS.possessionQuantity
      && row.outstandingAmount >= 0
      && row.outstandingAmount <= row.principalAmount)
    && frame.pressureStates.every((row) =>
      world.pressures.some((pressure) => pressure.id === row.pressureId)
      && Number.isInteger(row.progress)
      && row.progress >= 0
      && row.progress <= CAMPAIGN_PLAY_LIMITS.pressureProgress
      && (row.status === "resolved") === (row.progress === CAMPAIGN_PLAY_LIMITS.pressureProgress)
      && Number.isInteger(row.lastAdvancedWorldTimeMinutes)
      && row.lastAdvancedWorldTimeMinutes >= 0
      && frame.worldTimeMinutes !== null
      && row.lastAdvancedWorldTimeMinutes <= frame.worldTimeMinutes)
    && frame.placements.every((row) => {
      const accepted = acceptedPlacementById.get(row.placementId);
      return actorIds.has(row.actorId)
        && locationIds.has(row.locationId)
        && (row.placementKind === "present" || row.placementKind === "home")
        && (accepted
          ? accepted.actorId === row.actorId
            && accepted.placementKind === row.placementKind
            && (row.placementKind === "present" || accepted.locationId === row.locationId)
          : (row.actorId === frame.human?.actorId || runtimeActorIds.has(row.actorId))
            && row.placementKind === "present");
    })
    && [...acceptedPlacementIds].every((placementId) =>
      frame.placements.some((row) => row.placementId === placementId))
    && unique(frame.placements
      .filter((placement) => placement.placementKind === "present")
      .map((placement) => placement.actorId))
    && frame.runtimeActors.every((runtimeActor) =>
      frame.placements.filter((placement) =>
        placement.actorId === runtimeActor.id && placement.placementKind === "present").length === 1)
    && frame.relations.length === world.relations.length
    && frame.relations.every((row) => {
      const accepted = relationById.get(row.relationId);
      return accepted?.sourceActorId === row.sourceActorId
        && accepted.targetActorId === row.targetActorId
        && accepted.relationType === row.relationType
        && Number.isInteger(row.intensity)
        && row.intensity >= 1
        && row.intensity <= 5
        && row.summary.length > 0
        && row.summary.length <= CAMPAIGN_PLAY_LIMITS.shortText
        && row.summary === row.summary.trim();
    })
    && frame.goals.length === world.goals.length + frame.runtimeActors.length
    && frame.goals.every((row) => {
      const accepted = goalById.get(row.goalId);
      if (accepted) {
        return accepted.actorId === row.actorId
          && accepted.objective === row.objective
          && accepted.motivation === row.motivation
          && accepted.priority === row.priority;
      }
      return runtimeActorIds.has(row.actorId)
        && row.objective.length > 0
        && row.objective.length <= CAMPAIGN_PLAY_LIMITS.shortText
        && row.motivation.length > 0
        && row.motivation.length <= CAMPAIGN_PLAY_LIMITS.shortText
        && Number.isInteger(row.priority)
        && row.priority >= 1
        && row.priority <= 5;
    })
    && frame.runtimeActors.every((runtimeActor) =>
      frame.goals.filter((goal) => goal.actorId === runtimeActor.id).length === 1)
    && pendingDecisions.every((decision) => {
      const decisionActor = actorIds.has(decision.actorId)
        && world.actors.some((candidate) => candidate.id === decision.actorId
          && candidate.kind === "person" && candidate.controller === "agent")
        || frame.runtimeActors.some((candidate) => candidate.id === decision.actorId);
      const resolved = decision.status === "accepted" || decision.status === "declined";
      return decisionKeys.has(decision.decisionKey)
        && decisionActor
        && (decision.kind === "offer" || decision.kind === "yes_no" || decision.kind === "demand")
        && (decision.status === "open" || decision.status === "accepted" || decision.status === "declined")
        && decision.actorHandle === deriveCampaignPlayPublicHandle(
          "actor",
          frame.campaignId,
          decision.actorId,
        )
        && decision.actorHandle.length > 0
        && decision.actorHandle === decision.actorHandle.trim()
        && decision.actorHandle.length <= CAMPAIGN_PLAY_LIMITS.handle
        && decision.sourceTurnId.length > 0
        && decision.summary.length > 0
        && decision.summary.length <= CAMPAIGN_PLAY_LIMITS.text
        && decision.summary === decision.summary.trim()
        && decision.acceptLabel.length > 0
        && decision.acceptLabel.length <= CAMPAIGN_PLAY_LIMITS.label
        && decision.acceptLabel === decision.acceptLabel.trim()
        && decision.declineLabel.length > 0
        && decision.declineLabel.length <= CAMPAIGN_PLAY_LIMITS.label
        && decision.declineLabel === decision.declineLabel.trim()
        && (resolved
          ? decision.resolutionEventId !== null
            && decision.resolutionDisposition === (decision.status === "accepted" ? "accept" : "decline")
          : decision.resolutionEventId === null && decision.resolutionDisposition === null)
        && (decision.resolutionEventId === null || decision.resolutionEventId.length > 0)
        && Number.isInteger(decision.worldVersion)
        && decision.worldVersion >= frame.acceptedWorldVersion
        && decision.worldVersion <= frame.worldVersion;
    })
    && commitments.every((commitment) => {
      const performer = commitment.performerActorId === frame.human?.actorId
        ? { kind: "person" as const, controller: "human" as const }
        : world.actors.find((candidate) => candidate.id === commitment.performerActorId)
          ?? frame.runtimeActors.find((candidate) => candidate.id === commitment.performerActorId)
          ?? null;
      const counterparty = world.actors.find((candidate) => candidate.id === commitment.counterpartyActorId)
        ?? frame.runtimeActors.find((candidate) => candidate.id === commitment.counterpartyActorId)
        ?? null;
      const sourceDecision = pendingDecisions.find((decision) =>
        decision.decisionKey === commitment.sourceDecisionKey);
      const destination = [...world.locations, ...frame.runtimeLocations].find((location) =>
        deriveCampaignPlayPublicHandle("location", frame.campaignId, location.id)
          === commitment.destinationHandle);
      const deliveryEffect = sourceDecision?.acceptEffect?.kind === "paid_delivery" ||
        sourceDecision?.acceptEffect?.kind === "unpaid_delivery"
        ? sourceDecision.acceptEffect
        : null;
      const expectedDue = deliveryEffect?.dueInMinutes !== undefined
        ? commitment.acceptedWorldTimeMinutes + deliveryEffect.dueInMinutes
        : null;
      const completionConsistent = commitment.status === "active"
        ? commitment.completionTurnId === null && commitment.completionReceiptId === null
        : commitment.completionTurnId !== null && commitment.completionReceiptId !== null;
      const termsValid = commitment.kind === "paid_delivery"
        ? deliveryEffect?.kind === "paid_delivery"
          && commitment.feeUnit === deliveryEffect.feeUnit
          && commitment.feeAmount === deliveryEffect.feeAmount
          && commitment.paymentTiming === deliveryEffect.paymentTiming
        : deliveryEffect?.kind === "unpaid_delivery";
      return commitmentIds.has(commitment.commitmentId)
        && performer?.kind === "person" && performer.controller === "human"
        && counterparty?.kind === "person" && counterparty.controller === "agent"
        && commitment.performerActorId === frame.human?.actorId
        && commitment.counterpartyActorId !== commitment.performerActorId
        && (commitment.kind === "paid_delivery" || commitment.kind === "unpaid_delivery")
        && (commitment.status === "active" || commitment.status === "completed")
        && commitment.title === commitment.title.trim()
        && commitment.title.length > 0
        && commitment.title.length <= CAMPAIGN_PLAY_LIMITS.label
        && commitment.subjectName === commitment.subjectName.trim()
        && commitment.subjectName.length > 0
        && commitment.subjectName.length <= CAMPAIGN_PLAY_LIMITS.name
        && destination !== undefined
        && commitment.destinationHandle === deriveCampaignPlayPublicHandle(
          "location", frame.campaignId, destination.id,
        )
        && Number.isInteger(commitment.acceptedWorldTimeMinutes)
        && commitment.acceptedWorldTimeMinutes >= 0
        && (commitment.dueWorldTimeMinutes === null
          ? expectedDue === null
          : commitment.dueWorldTimeMinutes === expectedDue
            && commitment.dueWorldTimeMinutes >= commitment.acceptedWorldTimeMinutes)
        && sourceDecision?.status === "accepted"
        && sourceDecision.sourceTurnId === commitment.sourceTurnId
        && sourceDecision.actorId === commitment.counterpartyActorId
        && deliveryEffect?.title === commitment.title
        && deliveryEffect.subjectName === commitment.subjectName
        && deliveryEffect.destinationHandle === commitment.destinationHandle
        && termsValid
        && commitment.sourceReceiptId.length > 0
        && Number.isInteger(commitment.worldVersion)
        && commitment.worldVersion >= frame.acceptedWorldVersion
        && commitment.worldVersion <= frame.worldVersion
        && Number.isInteger(commitment.acceptedWorldTimeMinutes)
        && Number.isInteger(commitment.createdAt)
        && commitment.createdAt >= 0
        && Number.isInteger(commitment.updatedAt)
        && commitment.updatedAt >= commitment.createdAt
        && completionConsistent;
    })
    && world.pressures.every((pressure) =>
      pressure.actorIds.length + pressure.locationIds.length > 0
      && pressure.actorIds.every((actorId) => actorIds.has(actorId))
      && pressure.locationIds.every((locationId) => locationIds.has(locationId)))
    && setupShapeValid;
}

function expectedRoot(frame: CampaignPlayRulebookFrame, authority: CampaignPlayRulebookAuthority) {
  switch (authority.purpose) {
    case "character_bootstrap":
      return authority.turnId === null
        && authority.actorId === null
        && authority.rootParent.kind === "accepted_world"
        && authority.rootParent.campaignId === frame.campaignId
        && authority.rootParent.acceptedWorldVersion === frame.acceptedWorldVersion
        && authority.rootParent.acceptedContentHash === frame.acceptedContentHash;
    case "opening":
    case "player_action":
    case "commitment_execution":
      return authority.turnId !== null
        && authority.actorId === frame.human?.actorId
        && authority.rootParent.kind === "turn"
        && authority.rootParent.turnId === authority.turnId;
    case "actor_job":
      return authority.turnId !== null
        && authority.actorId !== null
        && authority.rootParent.kind === "actor_job";
  }
}

function validateAuthority(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
): Set<string> {
  if (
    !expectedRoot(frame, authority)
    || !unique(authority.authorizedRefs.map(refKey))
    || !unique(authority.witnessActorIds)
    || !unique(authority.knownWorldEventIds)
    || !authority.witnessActorIds.every((actorId) =>
      authority.authorizedRefs.some((reference) =>
        reference.kind === "actor" && reference.id === actorId)
      && (frame.acceptedWorld.actors.some((candidate) => candidate.id === actorId)
        || frame.runtimeActors.some((candidate) => candidate.id === actorId)
        || actorId === frame.human?.actorId))
  ) {
    deny("invalid_authority", "Rulebook authority does not match its purpose.");
  }
  if (authority.purpose === "player_action") {
    if (frame.setupPhase !== "ready" || frame.worldTimeMinutes === null) {
      deny("invalid_authority", "Player actions require ready mechanical state.");
    }
  }
  if (authority.purpose === "actor_job") {
    const actor = [
      ...frame.acceptedWorld.actors,
      ...frame.runtimeActors,
    ].find((candidate) => candidate.id === authority.actorId);
    if (
      frame.setupPhase !== "ready"
      || frame.worldTimeMinutes === null
      || !actor
      || actor.controller !== "agent"
    ) {
      deny("invalid_authority", "Actor jobs require one schedulable agent actor.");
    }
  }
  if (authority.purpose === "commitment_execution") {
    const context = authority.commitmentExecution;
    const paymentBindingValid = context?.commitmentKind === "unpaid_delivery"
      || (context?.commitmentKind === "paid_delivery"
        && context.feeUnit === "copper"
        && Number.isInteger(context.feeAmount)
        && context.feeAmount > 0);
    if (
      frame.setupPhase !== "ready"
      || frame.worldTimeMinutes === null
      || context === undefined
      || ![context.commitmentId, context.performerActorId, context.counterpartyActorId,
        context.subjectName, context.destinationLocationId, context.destinationHandle,
        context.sourceDecisionKey, context.sourceTurnId,
        context.sourceReceiptId].every((value) => typeof value === "string" && value.length > 0)
      || !paymentBindingValid
      || !Number.isInteger(context.commitmentWorldVersion)
      || context.commitmentWorldVersion < frame.acceptedWorldVersion
      || context.commitmentWorldVersion > frame.worldVersion
      || (context.action !== "collect" && context.action !== "deliver")
      || (context.action === "collect" && context.possessionId !== null)
      || (context.action === "deliver"
        && (typeof context.possessionId !== "string" || context.possessionId.length === 0))
    ) {
      deny("invalid_authority", "Commitment execution requires one complete code-owned commitment binding.");
    }
  } else if (authority.commitmentExecution !== undefined) {
    deny("invalid_authority", "Commitment execution context is not valid for this authority purpose.");
  }
  return new Set(authority.authorizedRefs.map(refKey));
}

function cloneSimulation(frame: CampaignPlayRulebookFrame): CampaignPlayRulebookSimulation {
  return {
    worldVersion: frame.worldVersion,
    worldTimeMinutes: frame.worldTimeMinutes,
    human: frame.human ? { ...frame.human } : null,
    runtimeActors: structuredClone(frame.runtimeActors),
    runtimeLocations: structuredClone(frame.runtimeLocations),
    runtimeRoutes: structuredClone(frame.runtimeRoutes),
    routeStates: structuredClone(frame.routeStates),
    actorConditions: structuredClone(frame.actorConditions),
    possessions: structuredClone(frame.possessions),
    obligations: structuredClone(frame.obligations),
    pressureStates: structuredClone(frame.pressureStates),
    placements: structuredClone(frame.placements),
    relations: structuredClone(frame.relations),
    goals: structuredClone(frame.goals),
    pendingDecisions: structuredClone(frame.pendingDecisions ?? []),
    commitments: structuredClone(frame.commitments),
  };
}

function actor(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  actorId: string,
) {
  const accepted = frame.acceptedWorld.actors.find((candidate) => candidate.id === actorId);
  if (accepted) return accepted;
  const runtime = state.runtimeActors.find((candidate) => candidate.id === actorId);
  if (runtime) return runtime;
  if (state.human?.actorId === actorId) {
    return {
      id: actorId,
      kind: "person" as const,
      controller: "human" as const,
      role: "player" as const,
    };
  }
  return null;
}

function entityExists(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  knownWorldEventIds: ReadonlySet<string>,
  reference: CampaignPlayEntityRef,
): boolean {
  switch (reference.kind) {
    case "actor": return actor(frame, state, reference.id) !== null;
    case "location": return liveLocation(frame, state, reference.id) !== undefined;
    case "route": return liveRoute(frame, state, reference.id) !== undefined;
    case "relation": return state.relations.some((row) => row.relationId === reference.id);
    case "goal": return state.goals.some((row) => row.goalId === reference.id);
    case "pressure": return frame.acceptedWorld.pressures.some((row) => row.id === reference.id);
    case "possession": return state.possessions.some((row) => row.possessionId === reference.id);
    case "obligation": return state.obligations.some((row) => row.obligationId === reference.id);
    case "world_event": return knownWorldEventIds.has(reference.id);
    case "decision": return state.pendingDecisions.some((row) => row.decisionKey === reference.id);
    case "commitment": return state.commitments.some((row) => row.commitmentId === reference.id);
  }
}

function routeState(state: CampaignPlayRulebookSimulation, routeId: string) {
  return state.routeStates.find((row) => row.routeId === routeId)?.state ?? "open";
}

function commandEntityRefs(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
): CampaignPlayEntityRef[] {
  switch (command.kind) {
    case "advance_world_time": return [];
    case "move_actor": return command.materializedLocalScene === undefined
      ? [
          ref("actor", command.actorId),
          ref("route", command.routeId),
          ref("location", command.fromLocationId),
          ref("location", command.toLocationId),
        ]
      : [
          ref("actor", command.actorId),
          ref("route", command.routeId),
          ref("location", command.fromLocationId),
          ref("location", command.toLocationId),
          ref("route", command.materializedLocalScene.returnRouteId),
        ];
    case "set_route_state": return [ref("route", command.routeId)];
    case "set_actor_condition": return [ref("actor", command.actorId)];
    case "update_actor_relation": {
      const relation = state.relations.find((row) => row.relationId === command.relationId);
      return relation ? [
        ref("relation", command.relationId),
        ref("actor", relation.sourceActorId),
        ref("actor", relation.targetActorId),
      ] : [ref("relation", command.relationId)];
    }
    case "update_actor_goal": {
      const goal = state.goals.find((row) => row.goalId === command.goalId);
      return goal
        ? [ref("goal", command.goalId), ref("actor", goal.actorId)]
        : [ref("goal", command.goalId)];
    }
    case "advance_pressure": return [ref("pressure", command.pressureId)];
    case "adjust_actor_possession": return [
      ref("actor", command.actorId),
      ref("possession", command.possessionId),
      ...command.affectedRefs.filter((reference) =>
        reference.kind !== "actor" || reference.id !== command.actorId),
    ].filter((reference, index, values) =>
      values.findIndex((candidate) => refKey(candidate) === refKey(reference)) === index);
    case "incur_actor_obligation": return [
      ref("actor", command.debtorActorId),
      ref("actor", command.creditorActorId),
      ref("obligation", command.obligationId),
      ...command.affectedRefs.filter((reference) =>
        (reference.kind !== "actor"
          || (reference.id !== command.debtorActorId && reference.id !== command.creditorActorId))
        && (reference.kind !== "obligation" || reference.id !== command.obligationId)),
    ].filter((reference, index, values) =>
      values.findIndex((candidate) => refKey(candidate) === refKey(reference)) === index);
    case "pay_actor_obligation": {
      const paymentPossession = state.possessions.find((candidate) =>
        candidate.possessionId === command.paymentPossessionId);
      const creditorPossessionId = paymentPossession === undefined
        ? null
        : deriveCampaignPlayPossessionId(
          frame.campaignId,
          command.creditorActorId,
          paymentPossession.possessionKey,
        );
      return [
        ref("actor", command.debtorActorId),
        ref("actor", command.creditorActorId),
        ref("possession", command.paymentPossessionId),
        ...(creditorPossessionId === null ? [] : [ref("possession", creditorPossessionId)]),
        ref("obligation", command.obligationId),
        ...command.affectedRefs.filter((reference) =>
          !(
            (reference.kind === "actor" && (
              reference.id === command.debtorActorId
              || reference.id === command.creditorActorId
            ))
            || (reference.kind === "possession" && (
              reference.id === command.paymentPossessionId
              || reference.id === creditorPossessionId
            ))
            || (reference.kind === "obligation" && reference.id === command.obligationId)
          )),
      ].filter((reference, index, values) =>
        values.findIndex((candidate) => refKey(candidate) === refKey(reference)) === index);
    }
    case "settle_player_receivable": return [
      ref("actor", command.debtorActorId),
      ref("actor", command.creditorActorId),
      ref("possession", command.creditorPossessionId),
      ref("obligation", command.obligationId),
      ...command.affectedRefs.filter((reference) =>
        !(
          (reference.kind === "actor" && (
            reference.id === command.debtorActorId
            || reference.id === command.creditorActorId
          ))
          || (reference.kind === "possession" && reference.id === command.creditorPossessionId)
          || (reference.kind === "obligation" && reference.id === command.obligationId)
        )),
    ].filter((reference, index, values) =>
      values.findIndex((candidate) => refKey(candidate) === refKey(reference)) === index);
    case "materialize_support_actor": return [
      ref("actor", command.actorId),
      ref("location", command.locationId),
      ref("goal", command.goalId),
    ];
    case "record_world_event": return command.affectedRefs;
    case "create_player_actor": return [ref("actor", command.actorId)];
    case "initialize_player_placement": return [
      ref("actor", command.actorId),
      ref("location", command.locationId),
    ];
    case "initialize_world_time": return [];
    case "initialize_pressure_state": return [ref("pressure", command.pressureId)];
    case "decision_open":
    case "decision_resolve": return [
      ref("actor", command.actorId),
      ref("decision", command.decisionKey),
    ];
    case "create_player_commitment": {
      const destination = [...frame.acceptedWorld.locations, ...state.runtimeLocations].find((location) =>
        deriveCampaignPlayPublicHandle("location", frame.campaignId, location.id)
          === command.destinationHandle);
      return [
        ref("commitment", command.commitmentId),
        ref("actor", command.performerActorId),
        ref("actor", command.counterpartyActorId),
        ref("decision", command.sourceDecisionKey),
        ...(destination ? [ref("location", destination.id)] : []),
      ];
    }
    case "complete_player_commitment": {
      const commitment = state.commitments.find((row) =>
        row.commitmentId === command.commitmentId);
      const performerActorId = commitment?.performerActorId ?? command.performerActorId;
      const counterpartyActorId = commitment?.counterpartyActorId ?? command.counterpartyActorId;
      const possessionId = commitment === undefined
        ? command.deliveryPossessionId
        : deriveCampaignPlayPossessionId(
          frame.campaignId,
          performerActorId,
          deriveCampaignPlayPossessionKey(commitment.subjectName),
        );
      const destination = commitment === undefined
        ? undefined
        : [...frame.acceptedWorld.locations, ...state.runtimeLocations].find((location) =>
          deriveCampaignPlayPublicHandle("location", frame.campaignId, location.id)
            === commitment.destinationHandle);
      return [
        ref("commitment", command.commitmentId),
        ref("actor", performerActorId),
        ref("actor", counterpartyActorId),
        ref("possession", possessionId),
        ...(destination === undefined ? [] : [ref("location", destination.id)]),
      ];
    }
  }
}

function expectedScopes(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
): { read: CampaignPlayEntityRef[]; write: CampaignPlayEntityRef[] } {
  const refs = commandEntityRefs(frame, state, command);
  switch (command.kind) {
    case "advance_world_time":
    case "initialize_world_time": return { read: [], write: [] };
    case "move_actor": return command.materializedLocalScene === undefined
      ? { read: refs, write: [refs[0]!, refs[2]!, refs[3]!] }
      : { read: [refs[0]!, refs[2]!], write: refs };
    case "set_route_state":
    case "set_actor_condition":
    case "advance_pressure":
    case "create_player_actor":
    case "initialize_pressure_state": return { read: command.kind === "create_player_actor" ? [] : refs, write: [refs[0]!] };
    case "update_actor_relation":
    case "update_actor_goal": return { read: refs, write: [refs[0]!] };
    case "adjust_actor_possession": return { read: refs, write: [refs[1]!] };
    case "incur_actor_obligation": return { read: refs.slice(0, 3), write: [refs[2]!] };
    case "pay_actor_obligation": return refs.length >= 5
      ? { read: refs.slice(0, 5), write: [refs[2]!, refs[3]!, refs[4]!] }
      : { read: refs, write: [] };
    case "settle_player_receivable": return {
      read: refs.slice(0, 4),
      write: [refs[2]!, refs[3]!],
    };
    case "materialize_support_actor": return { read: [refs[1]!], write: refs };
    case "record_world_event": return { read: refs, write: [] };
    case "initialize_player_placement": return { read: refs, write: refs };
    case "decision_open": return { read: [refs[0]!], write: [refs[1]!] };
    case "decision_resolve": return { read: refs, write: [refs[1]!] };
    case "create_player_commitment": return {
      read: refs.slice(1),
      write: [refs[0]!],
    };
    case "complete_player_commitment": return {
      read: refs,
      write: refs.length >= 6
        ? [refs[3]!, refs[5]!, refs[0]!]
        : refs.length >= 5
          ? [refs[3]!, refs[0]!]
          : [],
    };
  }
}

function exposureRefs(command: RulebookBatchCommand): CampaignPlayEntityRef[] {
  if (command.exposure.mode === "protected") return [];
  return command.exposure.predicates.map((predicate) => {
    switch (predicate.channel) {
      case "direct_perception":
      case "local_aftermath": return ref("location", predicate.locationId);
      case "route_state": return ref("route", predicate.routeId);
      case "witness_report": return ref("actor", predicate.witnessActorId);
    }
  });
}

function operativeActorLocations(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  actorId: string,
): string[] {
  return state.placements
    .filter((placement) =>
      placement.actorId === actorId && placement.placementKind === "present")
    .map((placement) => placement.locationId);
}

function validatePaidDeliverySettlementInvariants(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  commands: readonly RulebookBatchCommand[],
): void {
  const completionEntries = commands
    .map((command, index) => ({ command, index }))
    .filter((entry): entry is {
      command: Extract<RulebookBatchCommand, { kind: "complete_player_commitment" }>;
      index: number;
    } => entry.command.kind === "complete_player_commitment");
  if (completionEntries.length === 0) return;

  const completion = completionEntries[0]!;
  if (
    completionEntries.length !== 1
    || commands.length !== 3
    || completion.index !== commands.length - 1
    || commands[0]?.kind !== "adjust_actor_possession"
    || commands[1]?.kind !== "adjust_actor_possession"
  ) {
    deny(
      "invalid_batch",
      "Paid-delivery completion requires exactly one cargo spend and one exact Copper payment in the same batch, followed by completion.",
      completion.command,
      completion.index,
    );
  }

  const commitment = state.commitments.find((row) =>
    row.commitmentId === completion.command.commitmentId);
  if (
    commitment === undefined
    || commitment.status !== "active"
    || commitment.kind !== "paid_delivery"
  ) {
    deny(
      "precondition_failed",
      "Only an active paid-delivery commitment can be settled.",
      completion.command,
      completion.index,
    );
  }
  const destination = [...frame.acceptedWorld.locations, ...state.runtimeLocations].find((location) =>
    deriveCampaignPlayPublicHandle("location", frame.campaignId, location.id)
      === commitment.destinationHandle);
  const expectedPossessionKey = deriveCampaignPlayPossessionKey(commitment.subjectName);
  const expectedPossessionId = deriveCampaignPlayPossessionId(
    frame.campaignId,
    commitment.performerActorId,
    expectedPossessionKey,
  );
  const expectedPaymentPossessionId = deriveCampaignPlayPossessionId(
    frame.campaignId,
    commitment.performerActorId,
    "copper",
  );
  const possession = state.possessions.find((row) => row.possessionId === expectedPossessionId);
  const spend = commands[0]?.kind === "adjust_actor_possession" ? commands[0] : undefined;
  const payment = commands[1]?.kind === "adjust_actor_possession" ? commands[1] : undefined;
  if (
    destination === undefined
    || commitment.performerActorId !== frame.human?.actorId
    || commitment.paymentTiming !== "on_completion"
    || commitment.performerActorId !== completion.command.performerActorId
    || commitment.counterpartyActorId !== completion.command.counterpartyActorId
    || completion.command.deliveryPossessionId !== expectedPossessionId
    || completion.command.destinationHandle !== commitment.destinationHandle
    || completion.command.destinationLocationId !== destination.id
    || !operativeActorLocations(frame, state, commitment.performerActorId).includes(destination.id)
    || possession === undefined
    || possession.actorId !== commitment.performerActorId
    || possession.possessionKey !== expectedPossessionKey
    || possession.name !== commitment.subjectName
    || possession.quantity < 1
    || spend === undefined
    || spend.actorId !== commitment.performerActorId
    || spend.possessionId !== expectedPossessionId
    || spend.possessionKey !== expectedPossessionKey
    || spend.name !== commitment.subjectName
    || spend.quantityDelta !== -1
    || payment === undefined
    || payment.actorId !== commitment.performerActorId
    || payment.possessionId !== expectedPaymentPossessionId
    || payment.possessionKey !== "copper"
    || payment.name !== "Copper"
    || payment.quantityDelta !== commitment.feeAmount
    || payment.exposure.mode !== "projectable"
    || payment.exposure.predicates.length !== 1
    || payment.exposure.predicates[0]?.channel !== "direct_perception"
    || payment.exposure.predicates[0]?.locationId !== destination.id
  ) {
    deny(
      "precondition_failed",
      "Paid-delivery settlement must deliver the stored cargo at its stored destination and credit the exact stored Copper fee immediately.",
      completion.command,
      completion.index,
    );
  }
}

function validatePaidDeliverySettlementBatch(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  state: CampaignPlayRulebookSimulation,
  commands: readonly RulebookBatchCommand[],
): void {
  const completionIndex = commands.findIndex((command) =>
    command.kind === "complete_player_commitment");
  if (completionIndex < 0) return;
  const commitmentId = commands[completionIndex]?.kind === "complete_player_commitment"
    ? commands[completionIndex].commitmentId
    : null;
  const commitment = commitmentId === null
    ? undefined
    : state.commitments.find((row) => row.commitmentId === commitmentId);
  if (commitment?.kind === "unpaid_delivery") {
    validateUnpaidDeliverySettlementInvariants(frame, state, commands);
    return;
  }
  if (authority.purpose !== "player_action" || authority.turnId === null) {
    deny(
      "precondition_failed",
      "Paid-delivery settlement requires a player-action turn authority.",
      commands[completionIndex],
      completionIndex,
    );
  }
  validatePaidDeliverySettlementInvariants(frame, state, commands);
}

function validateUnpaidDeliverySettlementInvariants(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  commands: readonly RulebookBatchCommand[],
): void {
  const completionEntries = commands
    .map((command, index) => ({ command, index }))
    .filter((entry): entry is {
      command: Extract<RulebookBatchCommand, { kind: "complete_player_commitment" }>;
      index: number;
    } => entry.command.kind === "complete_player_commitment");
  if (completionEntries.length === 0) return;

  const completion = completionEntries[0]!;
  if (
    completionEntries.length !== 1
    || commands.length !== 2
    || completion.index !== commands.length - 1
    || commands.some((command, index) =>
      index === completion.index
        ? command.kind !== "complete_player_commitment"
        : command.kind !== "adjust_actor_possession")
  ) {
    deny(
      "invalid_batch",
      "Unpaid-delivery completion requires exactly one cargo spend followed by completion.",
      completion.command,
      completion.index,
    );
  }

  const commitment = state.commitments.find((row) =>
    row.commitmentId === completion.command.commitmentId);
  if (commitment === undefined || commitment.status !== "active" || commitment.kind !== "unpaid_delivery") {
    deny(
      "precondition_failed",
      "Only an active unpaid-delivery commitment can be settled.",
      completion.command,
      completion.index,
    );
  }
  const destination = [...frame.acceptedWorld.locations, ...state.runtimeLocations].find((location) =>
    deriveCampaignPlayPublicHandle("location", frame.campaignId, location.id)
      === commitment.destinationHandle);
  const expectedPossessionKey = deriveCampaignPlayPossessionKey(commitment.subjectName);
  const expectedPossessionId = deriveCampaignPlayPossessionId(
    frame.campaignId,
    commitment.performerActorId,
    expectedPossessionKey,
  );
  const possession = state.possessions.find((row) => row.possessionId === expectedPossessionId);
  const spend = commands[0];
  if (
    destination === undefined
    || commitment.performerActorId !== frame.human?.actorId
    || commitment.performerActorId !== completion.command.performerActorId
    || commitment.counterpartyActorId !== completion.command.counterpartyActorId
    || completion.command.deliveryPossessionId !== expectedPossessionId
    || completion.command.destinationHandle !== commitment.destinationHandle
    || completion.command.destinationLocationId !== destination.id
    || !operativeActorLocations(frame, state, commitment.performerActorId).includes(destination.id)
    || possession === undefined
    || possession.actorId !== commitment.performerActorId
    || possession.possessionKey !== expectedPossessionKey
    || possession.name !== commitment.subjectName
    || possession.quantity < 1
    || spend?.kind !== "adjust_actor_possession"
    || spend.actorId !== commitment.performerActorId
    || spend.possessionId !== expectedPossessionId
    || spend.possessionKey !== expectedPossessionKey
    || spend.name !== commitment.subjectName
    || spend.quantityDelta !== -1
  ) {
    deny(
      "precondition_failed",
      "Unpaid-delivery settlement must deliver the stored cargo at its stored destination without an employer obligation.",
      completion.command,
      completion.index,
    );
  }
}

function validateCommitmentExecutionBatch(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  state: CampaignPlayRulebookSimulation,
  authorized: ReadonlySet<string>,
  commands: readonly RulebookBatchCommand[],
): void {
  const context = authority.commitmentExecution;
  if (context === undefined) {
    deny("invalid_authority", "Commitment execution requires a scoped commitment context.");
  }
  const commitment = state.commitments.find((row) => row.commitmentId === context.commitmentId);
  const destination = liveLocation(frame, state, context.destinationLocationId);
  const expectedPossessionKey = deriveCampaignPlayPossessionKey(context.subjectName);
  const expectedPossessionId = deriveCampaignPlayPossessionId(
    frame.campaignId,
    context.performerActorId,
    expectedPossessionKey,
  );
  const expectedPaymentPossessionId = context.commitmentKind === "paid_delivery"
    ? deriveCampaignPlayPossessionId(
        frame.campaignId,
        context.performerActorId,
        "copper",
      )
    : null;
  const possession = state.possessions.find((row) => row.possessionId === expectedPossessionId);
  const requiredRefs = [
    ref("commitment", context.commitmentId),
    ref("actor", context.performerActorId),
    ref("actor", context.counterpartyActorId),
    ref("location", context.destinationLocationId),
    ...(context.possessionId === null ? [] : [ref("possession", context.possessionId)]),
    ...(context.action === "deliver" && expectedPaymentPossessionId !== null
      ? [ref("possession", expectedPaymentPossessionId)]
      : []),
  ];
  const commitmentTermsMatch = commitment?.kind === context.commitmentKind &&
    (context.commitmentKind === "unpaid_delivery"
      || (context.commitmentKind === "paid_delivery"
        && commitment.kind === "paid_delivery"
        && commitment.feeUnit === context.feeUnit
        && commitment.feeAmount === context.feeAmount
        && commitment.paymentTiming === "on_completion"));
  if (
    commitment === undefined
    || commitment.status !== "active"
    || commitment.campaignId !== frame.campaignId
    || !commitmentTermsMatch
    || commitment.performerActorId !== context.performerActorId
    || commitment.counterpartyActorId !== context.counterpartyActorId
    || commitment.subjectName !== context.subjectName
    || commitment.destinationHandle !== context.destinationHandle
    || commitment.sourceDecisionKey !== context.sourceDecisionKey
    || commitment.sourceTurnId !== context.sourceTurnId
    || commitment.sourceReceiptId !== context.sourceReceiptId
    || commitment.worldVersion !== context.commitmentWorldVersion
    || destination === undefined
    || deriveCampaignPlayPublicHandle("location", frame.campaignId, destination.id)
      !== context.destinationHandle
    || (context.possessionId !== null && context.possessionId !== expectedPossessionId)
    || !requiredRefs.every((reference) => authorized.has(refKey(reference)))
    || frame.human?.actorId !== context.performerActorId
  ) {
    deny("precondition_failed", "Commitment execution binding does not match the active durable commitment.");
  }

  if (context.action === "collect") {
    const command = commands[0];
    if (
      commands.length !== 1
      || command?.kind !== "adjust_actor_possession"
      || command.actorId !== context.performerActorId
      || command.possessionId !== expectedPossessionId
      || command.possessionKey !== expectedPossessionKey
      || command.name !== context.subjectName
      || command.quantityDelta !== 1
      || command.source.kind !== "system"
      || command.source.system !== "commitment_executor"
      || (possession !== undefined && possession.quantity !== 0)
    ) {
      deny("precondition_failed", "Collect requires one exact positive cargo adjustment from the commitment executor.", command);
    }
    return;
  }

  const spend = commands[0];
  const completion = commands[context.commitmentKind === "paid_delivery" ? 2 : 1];
  const payment = context.commitmentKind === "paid_delivery" ? commands[1] : undefined;
  const paidDeliveryInvalid = context.commitmentKind === "paid_delivery" && (
    commands.length !== 3
    || payment?.kind !== "adjust_actor_possession"
    || payment.actorId !== context.performerActorId
    || payment.possessionId !== expectedPaymentPossessionId
    || payment.possessionKey !== "copper"
    || payment.name !== "Copper"
    || payment.quantityDelta !== context.feeAmount
  );
  const unpaidDeliveryInvalid = context.commitmentKind === "unpaid_delivery" && commands.length !== 2;
  if (
    paidDeliveryInvalid
    || unpaidDeliveryInvalid
    || spend?.kind !== "adjust_actor_possession"
    || completion?.kind !== "complete_player_commitment"
    || spend.actorId !== context.performerActorId
    || spend.possessionId !== expectedPossessionId
    || spend.possessionKey !== expectedPossessionKey
    || spend.name !== context.subjectName
    || spend.quantityDelta !== -1
    || completion.commitmentId !== context.commitmentId
    || completion.performerActorId !== context.performerActorId
    || completion.counterpartyActorId !== context.counterpartyActorId
    || completion.deliveryPossessionId !== expectedPossessionId
    || completion.destinationHandle !== context.destinationHandle
    || completion.destinationLocationId !== context.destinationLocationId
    || !possession
    || possession.quantity < 1
    || !operativeActorLocations(frame, state, context.performerActorId).includes(destination.id)
  ) {
    deny(
      "precondition_failed",
      context.commitmentKind === "paid_delivery"
        ? "Deliver requires cargo spend, exact Copper payment, then completion."
        : "Deliver requires cargo spend followed by completion without an employer obligation.",
      completion,
    );
  }

  // Keep the independent settlement invariant as the final route-independent check.
  if (context.commitmentKind === "paid_delivery") {
    validatePaidDeliverySettlementInvariants(frame, state, commands);
  } else {
    validateUnpaidDeliverySettlementInvariants(frame, state, commands);
  }
}

function exposureGrounding(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
): { locationIds: Set<string>; routeIds: Set<string>; actorIds: Set<string> } {
  const locationIds = new Set<string>();
  const routeIds = new Set<string>();
  const actorIds = new Set<string>();
  const addActor = (actorId: string) => {
    actorIds.add(actorId);
    operativeActorLocations(frame, state, actorId)
      .forEach((locationId) => locationIds.add(locationId));
  };
  const addRoute = (routeId: string) => {
    const route = liveRoute(frame, state, routeId);
    if (!route) return;
    routeIds.add(route.id);
    locationIds.add(route.fromLocationId);
    locationIds.add(route.toLocationId);
  };
  const addPressure = (pressureId: string) => {
    const pressure = frame.acceptedWorld.pressures.find((candidate) => candidate.id === pressureId);
    if (!pressure) return;
    pressure.locationIds.forEach((locationId) => locationIds.add(locationId));
    pressure.actorIds.forEach(addActor);
  };
  const addReference = (reference: CampaignPlayEntityRef) => {
    switch (reference.kind) {
      case "actor": addActor(reference.id); break;
      case "location": locationIds.add(reference.id); break;
      case "route": addRoute(reference.id); break;
      case "relation": {
        const relation = state.relations.find((candidate) => candidate.relationId === reference.id);
        if (relation) {
          addActor(relation.sourceActorId);
          addActor(relation.targetActorId);
        }
        break;
      }
      case "goal": {
        const goal = state.goals.find((candidate) => candidate.goalId === reference.id);
        if (goal) addActor(goal.actorId);
        break;
      }
      case "pressure": addPressure(reference.id); break;
      case "possession": {
        const possession = state.possessions.find((candidate) =>
          candidate.possessionId === reference.id);
        if (possession) addActor(possession.actorId);
        break;
      }
      case "obligation": {
        const obligation = state.obligations.find((candidate) =>
          candidate.obligationId === reference.id);
        if (obligation) {
          addActor(obligation.debtorActorId);
          addActor(obligation.creditorActorId);
        }
        break;
      }
      case "world_event": break;
      case "decision": {
        const decision = state.pendingDecisions.find((candidate) =>
          candidate.decisionKey === reference.id);
        if (decision) addActor(decision.actorId);
        break;
      }
      case "commitment": {
        const commitment = state.commitments.find((candidate) =>
          candidate.commitmentId === reference.id);
        if (commitment) {
          addActor(commitment.performerActorId);
          addActor(commitment.counterpartyActorId);
          const destination = [...frame.acceptedWorld.locations, ...state.runtimeLocations].find((location) =>
            deriveCampaignPlayPublicHandle("location", frame.campaignId, location.id)
              === commitment.destinationHandle);
          if (destination) locationIds.add(destination.id);
        }
        break;
      }
    }
  };
  switch (command.kind) {
    case "advance_world_time":
      if (command.source.kind === "actor") addActor(command.source.actorId);
      break;
    case "move_actor":
      addActor(command.actorId);
      if (command.materializedLocalScene === undefined) {
        addRoute(command.routeId);
      } else {
        routeIds.add(command.routeId);
        routeIds.add(command.materializedLocalScene.returnRouteId);
        locationIds.add(command.fromLocationId);
        locationIds.add(command.toLocationId);
      }
      break;
    case "set_route_state": addRoute(command.routeId); break;
    case "set_actor_condition": addActor(command.actorId); break;
    case "update_actor_relation": addReference(ref("relation", command.relationId)); break;
    case "update_actor_goal": addReference(ref("goal", command.goalId)); break;
    case "advance_pressure": addPressure(command.pressureId); break;
    case "adjust_actor_possession": addActor(command.actorId); break;
    case "incur_actor_obligation":
      addActor(command.debtorActorId);
      addActor(command.creditorActorId);
      break;
    case "pay_actor_obligation":
      addActor(command.debtorActorId);
      addActor(command.creditorActorId);
      break;
    case "settle_player_receivable":
      addActor(command.debtorActorId);
      addActor(command.creditorActorId);
      break;
    case "materialize_support_actor":
      addActor(command.actorId);
      locationIds.add(command.locationId);
      addReference(ref("goal", command.goalId));
      break;
    case "record_world_event": command.affectedRefs.forEach(addReference); break;
    case "create_player_actor": addActor(command.actorId); break;
    case "initialize_player_placement": locationIds.add(command.locationId); addActor(command.actorId); break;
    case "initialize_world_time": break;
    case "initialize_pressure_state": addPressure(command.pressureId); break;
    case "decision_open":
    case "decision_resolve": addActor(command.actorId); break;
    case "create_player_commitment":
      addActor(command.performerActorId);
      addActor(command.counterpartyActorId);
      addReference(ref("decision", command.sourceDecisionKey));
      break;
    case "complete_player_commitment":
      addReference(ref("commitment", command.commitmentId));
      addActor(command.performerActorId);
      addActor(command.counterpartyActorId);
      break;
  }
  return { locationIds, routeIds, actorIds };
}

function validateSource(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
  index: number,
): void {
  const source = command.source;
  const commitmentCommand = command.kind === "create_player_commitment"
    || command.kind === "complete_player_commitment";
  const valid = authority.purpose === "character_bootstrap"
    ? source.kind === "system" && source.system === "character_bootstrap"
    : authority.purpose === "opening"
      ? source.kind === "system" && source.system === "opening_bootstrap"
      : authority.purpose === "player_action"
      ? (source.kind === "system" && source.system === "game_master")
          || (!commitmentCommand && source.kind === "actor" && source.actorId === state.human?.actorId)
        : authority.purpose === "commitment_execution"
          ? source.kind === "system" && source.system === "commitment_executor"
        : source.kind === "actor" && source.actorId === authority.actorId;
  if (!valid) deny("invalid_source", "Command source exceeds its admitted authority.", command, index);
  if (source.kind === "actor") {
    const sourceActor = actor(frame, state, source.actorId);
    if (!sourceActor) deny("invalid_source", "Command source actor does not exist.", command, index);
    if (state.actorConditions.some((condition) =>
      condition.actorId === source.actorId
      && condition.condition === "incapacitated"
      && condition.present)) {
      deny("precondition_failed", "An incapacitated actor cannot issue a command.", command, index);
    }
  }
}

function validateCausalParent(
  authority: CampaignPlayRulebookAuthority,
  commands: readonly RulebookBatchCommand[],
  command: RulebookBatchCommand,
  index: number,
): void {
  const expected = index === 0 || authority.purpose === "actor_job"
    ? authority.rootParent
    : { kind: "command" as const, commandId: commands[index - 1]!.commandId };
  if (!causalParentsEqual(command.causalParent, expected)) {
    deny("invalid_causal_parent", "Command causal lineage is not contiguous.", command, index);
  }
}

function validateMaterializedLocalSceneTiming(
  commands: RulebookBatchCommand[],
  command: RulebookBatchCommand,
  index: number,
): void {
  if (command.kind !== "move_actor" || command.materializedLocalScene === undefined) return;
  const previous = commands[index - 1];
  if (
    previous?.kind !== "advance_world_time"
    || previous.elapsedMinutes !== command.materializedLocalScene.travelCost
  ) {
    deny(
      "invalid_batch",
      "Materialized local traversal must immediately follow its matching world-time advance.",
      command,
      index,
    );
  }
}

function isOpeningPremiseCommand(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
): boolean {
  if (
    command.kind !== "record_world_event"
    || command.source.kind !== "system"
    || command.source.system !== "opening_bootstrap"
    || (command.eventClass !== "dialogue" && command.eventClass !== "interaction")
    || command.performingActorId === null
    || command.observableTrace !== null
    || command.exposure.mode !== "projectable"
    || command.exposure.predicates.length !== 1
    || command.exposure.predicates[0]?.channel !== "direct_perception"
    || state.human === null
  ) return false;
  const playerLocations = operativeActorLocations(frame, state, state.human.actorId);
  if (playerLocations.length !== 1) return false;
  const locationId = playerLocations[0]!;
  const performer = actor(frame, state, command.performingActorId);
  const expectedRefs: CampaignPlayEntityRef[] = [
    ref("actor", state.human.actorId),
    ref("actor", command.performingActorId),
    ref("location", locationId),
  ];
  return performer?.kind === "person"
    && performer.controller === "agent"
    && operativeActorLocations(frame, state, command.performingActorId).includes(locationId)
    && command.exposure.predicates[0].locationId === locationId
    && refsEqual(command.affectedRefs, expectedRefs);
}

function isOpeningRouteRestrictionCommand(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
): boolean {
  if (
    command.kind !== "set_route_state"
    || command.source.kind !== "system"
    || command.source.system !== "opening_bootstrap"
    || command.state !== "restricted"
    || command.exposure.mode !== "protected"
    || state.human === null
  ) return false;
  const playerLocations = operativeActorLocations(frame, state, state.human.actorId);
  if (playerLocations.length !== 1) return false;
  const route = frame.acceptedWorld.routes.find((row) => row.id === command.routeId);
  return route?.fromLocationId === playerLocations[0]
    && routeState(state, command.routeId) === "open";
}

function materializedLocalSceneGrant(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
): Set<string> | null {
  if (command.kind !== "move_actor" || command.materializedLocalScene === undefined) {
    return new Set();
  }
  const scene = command.materializedLocalScene;
  const origin = liveLocation(frame, state, command.fromLocationId);
  if (
    authority.purpose !== "player_action"
    || authority.turnId === null
    || authority.actorId !== command.actorId
    || state.human?.actorId !== command.actorId
    || command.source.kind !== "system"
    || command.source.system !== "game_master"
    || origin?.kind !== "persistent_sublocation"
    || scene.anchorLocationId !== command.fromLocationId
    || scene.locationId !== command.toLocationId
    || scene.outboundRouteId !== command.routeId
    || liveLocation(frame, state, scene.locationId) !== undefined
    || liveRoute(frame, state, scene.outboundRouteId) !== undefined
    || liveRoute(frame, state, scene.returnRouteId) !== undefined
  ) return null;
  const expected = deriveCampaignPlayLocalSceneTopologyIds({
    campaignId: frame.campaignId,
    turnId: authority.turnId,
    anchorLocationId: scene.anchorLocationId,
    name: scene.name,
    description: scene.description,
  });
  if (
    expected.locationId !== scene.locationId
    || expected.outboundRouteId !== scene.outboundRouteId
    || expected.returnRouteId !== scene.returnRouteId
  ) return null;
  return new Set([
    refKey(ref("location", scene.locationId)),
    refKey(ref("route", scene.outboundRouteId)),
    refKey(ref("route", scene.returnRouteId)),
  ]);
}

function validateRefsAndScopes(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  state: CampaignPlayRulebookSimulation,
  authorized: ReadonlySet<string>,
  knownEvents: ReadonlySet<string>,
  command: RulebookBatchCommand,
  index: number,
): void {
  const entityRefs = commandEntityRefs(frame, state, command);
  const allRefs = [...entityRefs, ...command.readScope, ...command.writeScope, ...exposureRefs(command)];
  const existingPossession = command.kind === "adjust_actor_possession"
    ? state.possessions.find((row) => row.possessionId === command.possessionId)
    : undefined;
  const existingObligation = command.kind === "incur_actor_obligation"
    ? state.obligations.find((row) => row.obligationId === command.obligationId)
    : undefined;
  const existingDecision = command.kind === "decision_resolve"
    ? state.pendingDecisions.find((row) => row.decisionKey === command.decisionKey)
    : undefined;
  const existingCommitment = command.kind === "complete_player_commitment"
    ? state.commitments.find((row) => row.commitmentId === command.commitmentId)
    : undefined;
  const paymentPossession = command.kind === "pay_actor_obligation"
    ? state.possessions.find((row) => row.possessionId === command.paymentPossessionId)
    : undefined;
  const settlementPossession = command.kind === "settle_player_receivable"
    ? state.possessions.find((row) => row.possessionId === command.creditorPossessionId)
    : undefined;
  const localSceneGrant = materializedLocalSceneGrant(
    frame,
    authority,
    state,
    command,
  );
  if (localSceneGrant === null) {
    deny("invalid_reference", "Materialized local scene identity is invalid.", command, index);
  }
  const grantedPossessionRef = command.kind === "adjust_actor_possession"
    && command.quantityDelta > 0
    && command.possessionKey === deriveCampaignPlayPossessionKey(command.name)
    && command.possessionId === deriveCampaignPlayPossessionId(
      frame.campaignId,
      command.actorId,
      command.possessionKey,
    )
    ? refKey(ref("possession", command.possessionId))
    : null;
  const grantedObligationRef = command.kind === "incur_actor_obligation"
    && command.obligationId === deriveCampaignPlayObligationId(
      frame.campaignId,
      command.debtorActorId,
      command.creditorActorId,
      command.unitKey,
    )
    ? refKey(ref("obligation", command.obligationId))
    : null;
  const grantedCreditorPossessionRef = command.kind === "pay_actor_obligation"
    && paymentPossession !== undefined
    ? refKey(ref("possession", deriveCampaignPlayPossessionId(
      frame.campaignId,
      command.creditorActorId,
      paymentPossession.possessionKey,
    )))
    : null;
  const grantedSettlementPossessionRef = command.kind === "settle_player_receivable"
    && command.creditorPossessionKey === deriveCampaignPlayPossessionKey(command.creditorPossessionName)
    && command.creditorPossessionKey === "copper"
    && command.creditorPossessionName === "Copper"
    && command.creditorPossessionId === deriveCampaignPlayPossessionId(
      frame.campaignId,
      command.creditorActorId,
      command.creditorPossessionKey,
    )
    && settlementPossession === undefined
    ? refKey(ref("possession", command.creditorPossessionId))
    : null;
  const grantedDecisionRef = command.kind === "decision_open"
    && command.decisionKey === deriveCampaignPlayDecisionKey(
      frame.campaignId,
      command.sourceTurnId,
      command.actorId,
      command.decisionKind,
    )
    && !state.pendingDecisions.some((row) => row.decisionKey === command.decisionKey)
    ? refKey(ref("decision", command.decisionKey))
    : null;
  const grantedCommitmentRef = command.kind === "create_player_commitment"
    && command.commitmentId === deriveCampaignPlayCommitmentId(
      frame.campaignId,
      command.sourceDecisionKey,
    )
    && !state.commitments.some((row) => row.commitmentId === command.commitmentId)
    ? refKey(ref("commitment", command.commitmentId))
    : null;
  const supportIds = command.kind === "materialize_support_actor" && authority.turnId !== null
    ? deriveCampaignPlaySupportActorIds({
        campaignId: frame.campaignId,
        turnId: authority.turnId,
        locationId: command.locationId,
        name: command.name,
        summary: command.summary,
      })
    : null;
  const grantedSupportRefs = command.kind === "materialize_support_actor"
    && supportIds !== null
    && command.actorId === supportIds.actorId
    && command.placementId === supportIds.placementId
    && command.goalId === supportIds.goalId
    && command.planId === supportIds.planId
    && command.scheduleId === supportIds.scheduleId
    ? new Set([
        refKey(ref("actor", command.actorId)),
        refKey(ref("goal", command.goalId)),
      ])
    : new Set<string>();
  const materializedEarlierInBatch = (reference: CampaignPlayEntityRef): boolean =>
    (reference.kind === "location"
      && !frame.runtimeLocations.some((row) => row.id === reference.id)
      && state.runtimeLocations.some((row) => row.id === reference.id))
    || (reference.kind === "route"
      && !frame.runtimeRoutes.some((row) => row.id === reference.id)
      && state.runtimeRoutes.some((row) => row.id === reference.id))
    || (reference.kind === "actor"
      && !frame.runtimeActors.some((row) => row.id === reference.id)
      && state.runtimeActors.some((row) => row.id === reference.id))
    || (reference.kind === "goal"
      && !frame.goals.some((row) => row.goalId === reference.id)
      && state.goals.some((row) => row.goalId === reference.id))
    || (reference.kind === "decision"
      && !(frame.pendingDecisions ?? []).some((row) => row.decisionKey === reference.id)
      && state.pendingDecisions.some((row) => row.decisionKey === reference.id))
    || (reference.kind === "commitment"
      && !frame.commitments.some((row) => row.commitmentId === reference.id)
      && state.commitments.some((row) => row.commitmentId === reference.id));
  if (!allRefs.every((reference) =>
    refKey(reference) === grantedPossessionRef
    || refKey(reference) === grantedObligationRef
    || refKey(reference) === grantedCreditorPossessionRef
    || refKey(reference) === grantedSettlementPossessionRef
    || refKey(reference) === grantedDecisionRef
    || refKey(reference) === grantedCommitmentRef
    || grantedSupportRefs.has(refKey(reference))
    || localSceneGrant.has(refKey(reference))
    || materializedEarlierInBatch(reference)
    || authorized.has(refKey(reference)))) {
    deny("unauthorized_reference", "Command references an entity outside its frozen frame.", command, index);
  }
  const newPlayerRef = command.kind === "create_player_actor" ? refKey(ref("actor", command.actorId)) : null;
  if (!allRefs.every((reference) =>
    refKey(reference) === newPlayerRef
    || grantedSupportRefs.has(refKey(reference))
    || (existingPossession === undefined && refKey(reference) === grantedPossessionRef)
    || (existingObligation === undefined && refKey(reference) === grantedObligationRef)
    || refKey(reference) === grantedCreditorPossessionRef
    || (settlementPossession === undefined && refKey(reference) === grantedSettlementPossessionRef)
    || refKey(reference) === grantedDecisionRef
    || refKey(reference) === grantedCommitmentRef
    || (command.kind === "decision_resolve" && existingDecision !== undefined
      && refKey(reference) === refKey(ref("decision", existingDecision.decisionKey)))
    || (command.kind === "complete_player_commitment" && existingCommitment !== undefined
      && refKey(reference) === refKey(ref("commitment", existingCommitment.commitmentId)))
    || localSceneGrant.has(refKey(reference))
    || entityExists(frame, state, knownEvents, reference))) {
    deny("invalid_reference", "Command references an entity that does not exist.", command, index);
  }
  const scopes = expectedScopes(frame, state, command);
  if (!refsEqual(command.readScope, scopes.read)) {
    deny("invalid_read_scope", "Command read scope differs from its exact contract.", command, index);
  }
  if (!refsEqual(command.writeScope, scopes.write)) {
    deny("invalid_write_scope", "Command write scope differs from its exact contract.", command, index);
  }
  if (
    (command.kind === "create_player_commitment" || command.kind === "complete_player_commitment")
    && !refsEqual(command.affectedRefs, entityRefs)
  ) {
    deny("invalid_reference", "Commitment affected references must match the exact party, source, and commitment identity.", command, index);
  }
  if (authority.purpose === "character_bootstrap" || authority.purpose === "opening") {
    if (
      command.exposure.mode !== "protected"
      && !(authority.purpose === "opening" && isOpeningPremiseCommand(frame, state, command))
    ) {
      deny("invalid_exposure", "Bootstrap commands require protected exposure.", command, index);
    }
  }
  if (command.exposure.mode === "projectable") {
    const grounding = exposureGrounding(frame, state, command);
    const predicateKeys = new Set<string>();
    for (const predicate of command.exposure.predicates) {
      const exposureReference = exposureRefs({ ...command, exposure: {
        mode: "projectable",
        predicates: [predicate],
      }} as RulebookBatchCommand)[0]!;
      if (
        !localSceneGrant.has(refKey(exposureReference))
        && !entityExists(frame, state, knownEvents, exposureReference)
      ) {
        deny("invalid_exposure", "Exposure anchor does not exist.", command, index);
      }
      const predicateKey = `${predicate.channel}\u0000${exposureReference.id}`;
      if (predicateKeys.has(predicateKey)) {
        deny("invalid_exposure", "Exposure predicates must be semantically unique.", command, index);
      }
      predicateKeys.add(predicateKey);
      if (
        (predicate.channel === "direct_perception" || predicate.channel === "local_aftermath")
        && !grounding.locationIds.has(predicate.locationId)
      ) {
        deny("invalid_exposure", "Location exposure is outside the command effect.", command, index);
      }
      if (predicate.channel === "route_state" && !grounding.routeIds.has(predicate.routeId)) {
        deny("invalid_exposure", "Route exposure is outside the command effect.", command, index);
      }
      if (
        predicate.channel === "witness_report"
        && (
          actor(frame, state, predicate.witnessActorId)?.kind !== "person"
          || !authority.witnessActorIds.includes(predicate.witnessActorId)
          || !operativeActorLocations(frame, state, predicate.witnessActorId).some((locationId) =>
            grounding.locationIds.has(locationId))
        )
      ) {
        deny("invalid_exposure", "Witness exposure requires a person at an affected location.", command, index);
      }
      if (
        predicate.channel === "local_aftermath"
        && (state.worldTimeMinutes === null
          || predicate.validUntilWorldTimeMinutes < state.worldTimeMinutes)
      ) {
        deny("invalid_exposure", "Local aftermath is already expired.", command, index);
      }
    }
  }
}

function actorJobOwns(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  authority: CampaignPlayRulebookAuthority,
  command: RulebookBatchCommand,
): boolean {
  if (authority.purpose !== "actor_job") return true;
  const actorId = authority.actorId!;
  const actorLocations = new Set(operativeActorLocations(frame, state, actorId));
  const sharesActorLocation = (targetActorId: string) =>
    operativeActorLocations(frame, state, targetActorId).some((locationId) =>
      actorLocations.has(locationId));
  switch (command.kind) {
    case "advance_world_time": return true;
    case "move_actor": return command.actorId === actorId;
    case "set_route_state": {
      const route = liveRoute(frame, state, command.routeId);
      return !!route && (actorLocations.has(route.fromLocationId) || actorLocations.has(route.toLocationId));
    }
    case "set_actor_condition": return sharesActorLocation(command.actorId);
    case "update_actor_relation": {
      const relation = state.relations.find((row) => row.relationId === command.relationId);
      return !!relation && (relation.sourceActorId === actorId || relation.targetActorId === actorId);
    }
    case "update_actor_goal": return state.goals.some((goal) =>
      goal.goalId === command.goalId && goal.actorId === actorId);
    case "advance_pressure": {
      const pressure = frame.acceptedWorld.pressures.find((row) => row.id === command.pressureId);
      return !!pressure && (pressure.actorIds.includes(actorId)
        || pressure.locationIds.some((locationId) => actorLocations.has(locationId)));
    }
    case "adjust_actor_possession": return command.actorId === actorId;
    case "incur_actor_obligation": return command.debtorActorId === actorId
      && sharesActorLocation(command.creditorActorId);
    case "pay_actor_obligation": return command.debtorActorId === actorId
      && sharesActorLocation(command.creditorActorId);
    case "settle_player_receivable": return false;
    case "materialize_support_actor": return false;
    case "record_world_event": return command.affectedRefs.some((reference) =>
      reference.kind === "actor" && reference.id === actorId);
    case "create_player_actor":
    case "initialize_player_placement":
    case "initialize_world_time":
    case "initialize_pressure_state":
    case "decision_open":
    case "decision_resolve":
    case "create_player_commitment":
    case "complete_player_commitment": return false;
  }
}

function validateAvailability(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
  index: number,
): void {
  const modelVisible = CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].modelVisible;
  const obligationAvailable = command.kind !== "incur_actor_obligation"
    || (
      (authority.purpose === "player_action"
        && state.human?.actorId !== undefined
        && (state.human.actorId === command.debtorActorId
          || state.human.actorId === command.creditorActorId))
      || (authority.purpose === "actor_job"
        && authority.actorId === command.debtorActorId)
      || authority.purpose === "commitment_execution"
    );
  const paymentAvailable = command.kind !== "pay_actor_obligation"
    || (
      (authority.purpose === "player_action" || authority.purpose === "actor_job")
      && authority.actorId === command.debtorActorId
    );
  const receivableAvailable = command.kind !== "settle_player_receivable"
    || (
      authority.purpose === "player_action"
      && authority.actorId === command.creditorActorId
      && state.human?.actorId === command.creditorActorId
    );
  const available = authority.purpose === "character_bootstrap"
    ? command.kind === "create_player_actor"
      || (command.kind === "adjust_actor_possession" && command.quantityDelta > 0)
    : authority.purpose === "opening"
      ? (!modelVisible && command.kind !== "decision_resolve")
        || isOpeningPremiseCommand(frame, state, command)
        || isOpeningRouteRestrictionCommand(frame, state, command)
      : authority.purpose === "player_action"
        ? command.kind === "decision_open"
          || command.kind === "decision_resolve"
          || command.kind === "create_player_commitment"
          || command.kind === "complete_player_commitment"
          || command.kind === "settle_player_receivable"
          || modelVisible
        : authority.purpose === "commitment_execution"
          ? command.kind === "adjust_actor_possession"
            || command.kind === "incur_actor_obligation"
            || command.kind === "complete_player_commitment"
        : modelVisible;
  if (
    !available
    || !obligationAvailable
    || !paymentAvailable
    || !receivableAvailable
    || !actorJobOwns(frame, state, authority, command)
  ) {
    deny("command_unavailable", "Command kind is unavailable to this authority.", command, index);
  }
}

function applyCommand(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
  index: number,
): void {
  switch (command.kind) {
    case "advance_world_time": {
      if (
        state.worldTimeMinutes === null
        || state.worldTimeMinutes + command.elapsedMinutes > CAMPAIGN_PLAY_LIMITS.worldTimeMinutes
      ) deny("precondition_failed", "World time cannot advance from this state.", command, index);
      state.worldTimeMinutes += command.elapsedMinutes;
      break;
    }
    case "move_actor": {
      const movingActor = actor(frame, state, command.actorId);
      let route = liveRoute(frame, state, command.routeId);
      let fromLocation = liveLocation(frame, state, command.fromLocationId);
      let toLocation = liveLocation(frame, state, command.toLocationId);
      const placement = state.placements.find((row) =>
        row.actorId === command.actorId && row.placementKind === "present");
      if (command.materializedLocalScene !== undefined) {
        const scene = command.materializedLocalScene;
        const parent = fromLocation?.parentLocationId === null
          ? undefined
          : frame.acceptedWorld.locations.find((candidate) =>
              candidate.id === fromLocation?.parentLocationId && candidate.kind === "macro");
        const grant = materializedLocalSceneGrant(frame, authority, state, command);
        if (grant === null || parent === undefined || placement?.locationId !== command.fromLocationId) {
          deny("precondition_failed", "Local scene materialization preconditions failed.", command, index);
        }
        const resultWorldVersion = state.worldVersion + 1;
        const causalReceiptId = deriveCampaignPlayReceiptId(
          frame.campaignId,
          authority.turnId,
          command.batchId,
          command.order,
        );
        state.runtimeLocations.push({
          id: scene.locationId,
          name: scene.name,
          description: scene.description,
          kind: "persistent_sublocation",
          parentLocationId: parent.id,
          anchorLocationId: scene.anchorLocationId,
          tags: [],
          causalReceiptId,
          worldVersion: resultWorldVersion,
        });
        state.runtimeRoutes.push(
          {
            id: scene.outboundRouteId,
            fromLocationId: scene.anchorLocationId,
            toLocationId: scene.locationId,
            travelCost: scene.travelCost,
            causalReceiptId,
            worldVersion: resultWorldVersion,
          },
          {
            id: scene.returnRouteId,
            fromLocationId: scene.locationId,
            toLocationId: scene.anchorLocationId,
            travelCost: scene.travelCost,
            causalReceiptId,
            worldVersion: resultWorldVersion,
          },
        );
        route = liveRoute(frame, state, command.routeId);
        fromLocation = liveLocation(frame, state, command.fromLocationId);
        toLocation = liveLocation(frame, state, command.toLocationId);
      }
      if (
        movingActor?.kind !== "person"
        || !route
        || fromLocation?.kind !== "persistent_sublocation"
        || toLocation?.kind !== "persistent_sublocation"
        || route.fromLocationId !== command.fromLocationId
        || route.toLocationId !== command.toLocationId
        || routeState(state, route.id) !== "open"
        || placement?.locationId !== command.fromLocationId
        || state.actorConditions.some((condition) =>
          condition.actorId === command.actorId
          && condition.condition === "incapacitated"
          && condition.present)
      ) deny("precondition_failed", "Actor movement preconditions failed.", command, index);
      placement.locationId = command.toLocationId;
      break;
    }
    case "set_route_state": {
      const prior = routeState(state, command.routeId);
      if (prior === command.state) deny("precondition_failed", "Route state already has that value.", command, index);
      const row = state.routeStates.find((candidate) => candidate.routeId === command.routeId);
      if (row) row.state = command.state;
      else state.routeStates.push({ routeId: command.routeId, state: command.state });
      break;
    }
    case "set_actor_condition": {
      if (!actor(frame, state, command.actorId)) {
        deny("invalid_reference", "Actor condition target does not exist.", command, index);
      }
      const row = state.actorConditions.find((candidate) =>
        candidate.actorId === command.actorId && candidate.condition === command.condition);
      const present = row?.present ?? false;
      if ((command.operation === "set") === present) {
        deny("precondition_failed", "Actor condition operation has no valid transition.", command, index);
      }
      if (row) {
        row.present = command.operation === "set";
        row.summary = command.summary;
      } else {
        state.actorConditions.push({
          actorId: command.actorId,
          condition: command.condition,
          present: true,
          summary: command.summary,
        });
      }
      break;
    }
    case "update_actor_relation": {
      const relation = state.relations.find((row) => row.relationId === command.relationId);
      if (!relation || (relation.intensity === command.intensity && relation.summary === command.summary)) {
        deny("precondition_failed", "Relation update has no valid transition.", command, index);
      }
      relation.intensity = command.intensity;
      relation.summary = command.summary;
      break;
    }
    case "update_actor_goal": {
      const goal = state.goals.find((row) => row.goalId === command.goalId);
      if (!goal || goal.status === "completed" || goal.status === command.status) {
        deny("precondition_failed", "Goal status transition is invalid.", command, index);
      }
      goal.status = command.status;
      break;
    }
    case "advance_pressure": {
      const pressure = frame.acceptedWorld.pressures.find((row) => row.id === command.pressureId);
      const stateRow = state.pressureStates.find((row) => row.pressureId === command.pressureId);
      if (!pressure || !stateRow || stateRow.status !== "active") {
        deny("precondition_failed", "Pressure is unavailable for advancement.", command, index);
      }
      const result = Math.min(CAMPAIGN_PLAY_LIMITS.pressureProgress, stateRow.progress + command.amount);
      const expectedStatus = result === CAMPAIGN_PLAY_LIMITS.pressureProgress ? "resolved" : "active";
      if (command.resultStatus !== expectedStatus) {
        deny("precondition_failed", "Pressure result status does not match its progress.", command, index);
      }
      stateRow.progress = result;
      stateRow.status = expectedStatus;
      stateRow.lastAdvancedWorldTimeMinutes = state.worldTimeMinutes!;
      break;
    }
    case "adjust_actor_possession": {
      if (!actor(frame, state, command.actorId)) {
        deny("invalid_reference", "Possession owner does not exist.", command, index);
      }
      const expectedKey = deriveCampaignPlayPossessionKey(command.name);
      const expectedId = deriveCampaignPlayPossessionId(
        frame.campaignId,
        command.actorId,
        expectedKey,
      );
      const row = state.possessions.find((candidate) =>
        candidate.possessionId === command.possessionId);
      if (
        command.possessionKey !== expectedKey
        || command.possessionId !== expectedId
        || (row !== undefined && (
          row.actorId !== command.actorId
          || row.possessionKey !== command.possessionKey
          || row.name !== command.name
        ))
      ) {
        deny("precondition_failed", "Possession identity does not match its owner and name.", command, index);
      }
      const priorQuantity = row?.quantity ?? 0;
      const resultQuantity = priorQuantity + command.quantityDelta;
      if (
        resultQuantity < 0
        || resultQuantity > CAMPAIGN_PLAY_LIMITS.possessionQuantity
        || (!row && command.quantityDelta <= 0)
      ) {
        deny("precondition_failed", "Possession quantity transition is unavailable.", command, index);
      }
      if (row) row.quantity = resultQuantity;
      else state.possessions.push({
        possessionId: command.possessionId,
        actorId: command.actorId,
        possessionKey: command.possessionKey,
        name: command.name,
        quantity: resultQuantity,
      });
      break;
    }
    case "incur_actor_obligation": {
      const debtor = actor(frame, state, command.debtorActorId);
      const creditor = actor(frame, state, command.creditorActorId);
      const expectedId = deriveCampaignPlayObligationId(
        frame.campaignId,
        command.debtorActorId,
        command.creditorActorId,
        command.unitKey,
      );
      const row = state.obligations.find((candidate) =>
        candidate.obligationId === command.obligationId);
      if (
        debtor === null
        || creditor === null
        || command.debtorActorId === command.creditorActorId
        || command.obligationId !== expectedId
        || (row !== undefined && (
          row.debtorActorId !== command.debtorActorId
          || row.creditorActorId !== command.creditorActorId
          || row.unitKey !== command.unitKey
        ))
      ) {
        deny("precondition_failed", "Obligation identity does not match distinct campaign actors.", command, index);
      }
      const principalAmount = (row?.principalAmount ?? 0) + command.amount;
      const outstandingAmount = (row?.outstandingAmount ?? 0) + command.amount;
      if (
        principalAmount > CAMPAIGN_PLAY_LIMITS.possessionQuantity
        || outstandingAmount > principalAmount
      ) {
        deny("precondition_failed", "Obligation amount transition is unavailable.", command, index);
      }
      if (row) {
        row.principalAmount = principalAmount;
        row.outstandingAmount = outstandingAmount;
      } else {
        state.obligations.push({
          obligationId: command.obligationId,
          debtorActorId: command.debtorActorId,
          creditorActorId: command.creditorActorId,
          unitKey: command.unitKey,
          principalAmount,
          outstandingAmount,
        });
      }
      break;
    }
    case "pay_actor_obligation": {
      const debtor = actor(frame, state, command.debtorActorId);
      const creditor = actor(frame, state, command.creditorActorId);
      const obligation = state.obligations.find((candidate) =>
        candidate.obligationId === command.obligationId);
      const paymentPossession = state.possessions.find((candidate) =>
        candidate.possessionId === command.paymentPossessionId);
      if (
        debtor === null
        || creditor === null
        || command.debtorActorId === command.creditorActorId
        || obligation === undefined
        || obligation.debtorActorId !== command.debtorActorId
        || obligation.creditorActorId !== command.creditorActorId
        || obligation.unitKey !== command.unitKey
        || obligation.obligationId !== deriveCampaignPlayObligationId(
          frame.campaignId,
          command.debtorActorId,
          command.creditorActorId,
          command.unitKey,
        )
        || paymentPossession === undefined
        || paymentPossession.actorId !== command.debtorActorId
        || paymentPossession.quantity < command.amount
        || obligation.outstandingAmount < command.amount
      ) {
        deny("precondition_failed", "Obligation payment does not match the exact debtor, possession, and balance.", command, index);
      }
      const creditorPossessionId = deriveCampaignPlayPossessionId(
        frame.campaignId,
        command.creditorActorId,
        paymentPossession.possessionKey,
      );
      const creditorPossession = state.possessions.find((candidate) =>
        candidate.possessionId === creditorPossessionId);
      const creditorQuantity = creditorPossession?.quantity ?? 0;
      if (
        (creditorPossession !== undefined && (
          creditorPossession.actorId !== command.creditorActorId
          || creditorPossession.possessionKey !== paymentPossession.possessionKey
          || creditorPossession.name !== paymentPossession.name
        ))
        || creditorQuantity + command.amount > CAMPAIGN_PLAY_LIMITS.possessionQuantity
      ) {
        deny("precondition_failed", "Creditor possession cannot receive the exact payment.", command, index);
      }
      paymentPossession.quantity -= command.amount;
      obligation.outstandingAmount -= command.amount;
      if (creditorPossession) {
        creditorPossession.quantity += command.amount;
      } else {
        state.possessions.push({
          possessionId: creditorPossessionId,
          actorId: command.creditorActorId,
          possessionKey: paymentPossession.possessionKey,
          name: paymentPossession.name,
          quantity: command.amount,
        });
      }
      break;
    }
    case "settle_player_receivable": {
      const debtor = actor(frame, state, command.debtorActorId);
      const creditor = actor(frame, state, command.creditorActorId);
      const obligation = state.obligations.find((candidate) =>
        candidate.obligationId === command.obligationId);
      const expectedObligationId = deriveCampaignPlayObligationId(
        frame.campaignId,
        command.debtorActorId,
        command.creditorActorId,
        command.unitKey,
      );
      const expectedPossessionKey = deriveCampaignPlayPossessionKey(command.creditorPossessionName);
      const expectedPossessionId = deriveCampaignPlayPossessionId(
        frame.campaignId,
        command.creditorActorId,
        expectedPossessionKey,
      );
      const creditorPossession = state.possessions.find((candidate) =>
        candidate.possessionId === command.creditorPossessionId);
      const playerLocations = state.human?.actorId === command.creditorActorId
        ? operativeActorLocations(frame, state, command.creditorActorId)
        : [];
      const debtorLocations = operativeActorLocations(frame, state, command.debtorActorId);
      const debtorVisible = playerLocations.some((locationId) =>
        debtorLocations.includes(locationId));
      if (
        authority.purpose !== "player_action"
        || authority.actorId !== command.creditorActorId
        || state.human?.actorId !== command.creditorActorId
        || debtor?.kind !== "person"
        || debtor.controller !== "agent"
        || creditor?.kind !== "person"
        || creditor.controller !== "human"
        || command.debtorActorId === command.creditorActorId
        || command.unitKey !== "copper"
        || command.obligationId !== expectedObligationId
        || obligation === undefined
        || obligation.debtorActorId !== command.debtorActorId
        || obligation.creditorActorId !== command.creditorActorId
        || obligation.unitKey !== command.unitKey
        || obligation.outstandingAmount !== command.amount
        || !debtorVisible
        || command.creditorPossessionKey !== expectedPossessionKey
        || command.creditorPossessionKey !== "copper"
        || command.creditorPossessionName !== "Copper"
        || command.creditorPossessionId !== expectedPossessionId
        || (creditorPossession !== undefined && (
          creditorPossession.actorId !== command.creditorActorId
          || creditorPossession.possessionKey !== command.creditorPossessionKey
          || creditorPossession.name !== command.creditorPossessionName
        ))
        || (creditorPossession?.quantity ?? 0) + command.amount >
          CAMPAIGN_PLAY_LIMITS.possessionQuantity
      ) {
        deny(
          "precondition_failed",
          "Receivable collection requires the exact visible debtor, copper obligation, and amount.",
          command,
          index,
        );
      }
      obligation.outstandingAmount -= command.amount;
      if (creditorPossession) {
        creditorPossession.quantity += command.amount;
      } else {
        state.possessions.push({
          possessionId: command.creditorPossessionId,
          actorId: command.creditorActorId,
          possessionKey: command.creditorPossessionKey,
          name: command.creditorPossessionName,
          quantity: command.amount,
        });
      }
      break;
    }
    case "materialize_support_actor": {
      const turnId = authority.turnId;
      const playerActorId = state.human?.actorId;
      const playerPlacement = playerActorId === undefined
        ? undefined
        : state.placements.find((row) =>
            row.actorId === playerActorId && row.placementKind === "present");
      const location = liveLocation(frame, state, command.locationId);
      const expectedIds = turnId === null
        ? null
        : deriveCampaignPlaySupportActorIds({
            campaignId: frame.campaignId,
            turnId,
            locationId: command.locationId,
            name: command.name,
            summary: command.summary,
          });
      const exposure = command.exposure.mode === "projectable"
        && command.exposure.predicates.length === 1
        && command.exposure.predicates[0]?.channel === "direct_perception"
        ? command.exposure.predicates[0]
        : null;
      const nameKey = command.name.trim().toLowerCase();
      const nameAlreadyOwned = [
        ...frame.acceptedWorld.actors,
        ...state.runtimeActors,
      ].some((candidate) => candidate.name.trim().toLowerCase() === nameKey);
      if (
        authority.purpose !== "player_action"
        || turnId === null
        || playerPlacement?.locationId !== command.locationId
        || location?.kind !== "persistent_sublocation"
        || exposure?.locationId !== command.locationId
        || expectedIds === null
        || command.actorId !== expectedIds.actorId
        || command.placementId !== expectedIds.placementId
        || command.goalId !== expectedIds.goalId
        || command.planId !== expectedIds.planId
        || command.scheduleId !== expectedIds.scheduleId
        || actor(frame, state, command.actorId) !== null
        || state.placements.some((row) => row.placementId === command.placementId)
        || state.goals.some((row) => row.goalId === command.goalId)
        || state.runtimeActors.length !== frame.runtimeActors.length
        || nameAlreadyOwned
        || command.planIntentKind === "move"
        || command.steps.some((step) => step.intentKind === "move")
      ) {
        deny(
          "precondition_failed",
          "Support actor materialization requires one new local person with code-owned identity and a stationary first plan.",
          command,
          index,
        );
      }
      const resultWorldVersion = state.worldVersion + 1;
      const causalReceiptId = deriveCampaignPlayReceiptId(
        frame.campaignId,
        turnId,
        command.batchId,
        command.order,
      );
      state.runtimeActors.push({
        id: command.actorId,
        kind: "person",
        controller: "agent",
        role: "support",
        name: command.name,
        summary: command.summary,
        traits: [...command.traits],
        tags: [...command.tags],
        causalReceiptId,
        worldVersion: resultWorldVersion,
      });
      state.placements.push({
        placementId: command.placementId,
        actorId: command.actorId,
        locationId: command.locationId,
        placementKind: "present",
      });
      state.goals.push({
        goalId: command.goalId,
        actorId: command.actorId,
        status: "active",
        priority: command.priority,
        objective: command.goalObjective,
        motivation: command.goalMotivation,
      });
      break;
    }
    case "record_world_event": {
      if (!unique(command.affectedRefs.map(refKey))) {
        deny("precondition_failed", "World event affected references must be unique.", command, index);
      }
      const performingActor = command.performingActorId === null
        ? null
        : actor(frame, state, command.performingActorId);
      if (
        command.performingActorId !== null
        && (
          performingActor?.kind !== "person"
          || performingActor.controller !== "agent"
          || !command.affectedRefs.some((reference) =>
            reference.kind === "actor" && reference.id === command.performingActorId)
        )
      ) {
        deny("precondition_failed", "World event performer must be one affected agent person.", command, index);
      }
      if (command.performingActorId !== null && command.exposure.mode === "projectable") {
        for (const predicate of command.exposure.predicates) {
          if (
            predicate.channel === "direct_perception"
            && !operativeActorLocations(frame, state, command.performingActorId).includes(predicate.locationId)
          ) {
            deny("precondition_failed", "Directly perceived performer must be present at the event location.", command, index);
          }
        }
      }
      break;
    }
    case "decision_open": {
      const selectedActor = actor(frame, state, command.actorId);
      const playerLocations = state.human === null
        ? []
        : operativeActorLocations(frame, state, state.human.actorId);
      const actorLocations = operativeActorLocations(frame, state, command.actorId);
      const stableDecisionKey = authority.turnId !== null
        && command.sourceTurnId === authority.turnId
        && command.decisionKey === deriveCampaignPlayDecisionKey(
          frame.campaignId,
          command.sourceTurnId,
          command.actorId,
          command.decisionKind,
        );
      const visibleAgentActor = selectedActor?.kind === "person"
        && selectedActor.controller === "agent"
        && playerLocations.length === 1
        && actorLocations.includes(playerLocations[0]!)
        && command.actorHandle === deriveCampaignPlayPublicHandle(
          "actor",
          frame.campaignId,
          command.actorId,
        );
      const openingDecision = authority.purpose === "opening"
        && stableDecisionKey
        && !state.pendingDecisions.some((row) => row.decisionKey === command.decisionKey)
        && visibleAgentActor;
      const deliveryEffect = command.acceptEffect?.kind === "paid_delivery"
        || command.acceptEffect?.kind === "unpaid_delivery"
        ? command.acceptEffect
        : null;
      const destination = deliveryEffect === null
        ? undefined
        : [...frame.acceptedWorld.locations, ...state.runtimeLocations].find((location) =>
          deriveCampaignPlayPublicHandle("location", frame.campaignId, location.id)
            === deliveryEffect.destinationHandle);
      const destinationAuthorized = destination !== undefined
        && authority.authorizedRefs.some((reference) =>
          reference.kind === "location" && reference.id === destination.id);
      const playerActionEffectAllowed = command.acceptEffect === null
        || (deliveryEffect !== null && destinationAuthorized);
      const playerActionDecision = authority.purpose === "player_action"
        && command.source.kind === "system"
        && command.source.system === "game_master"
        && stableDecisionKey
        && command.decisionKind === "offer"
        && playerActionEffectAllowed
        && !state.pendingDecisions.some((row) =>
          row.status === "open" && row.actorId === command.actorId)
        && visibleAgentActor
        && state.human?.actorId === authority.actorId
        && authority.actorId !== null;
      if (!openingDecision && !playerActionDecision) {
        deny(
          "precondition_failed",
          authority.purpose === "opening"
            ? "Opening decision must target one visible agent actor with a stable code-owned identity."
            : "Offer decision must target one visible agent actor with a null effect or an authorized delivery destination.",
          command,
          index,
        );
      }
      state.pendingDecisions.push({
        decisionKey: command.decisionKey,
        actorId: command.actorId,
        actorHandle: command.actorHandle,
        kind: command.decisionKind,
        status: "open",
        sourceTurnId: command.sourceTurnId,
        summary: command.summary,
        acceptLabel: command.acceptLabel,
        declineLabel: command.declineLabel,
        acceptEffect: command.acceptEffect ?? null,
        resolutionEventId: null,
        resolutionTurnId: null,
        resolutionDisposition: null,
        worldVersion: state.worldVersion + 1,
      });
      break;
    }
    case "decision_resolve": {
      const existing = state.pendingDecisions.find((row) => row.decisionKey === command.decisionKey);
      const selectedActor = actor(frame, state, command.actorId);
      if (
        authority.purpose !== "player_action"
        || authority.turnId === null
        || command.sourceTurnId !== existing?.sourceTurnId
        || existing === undefined
        || existing.status !== "open"
        || existing.actorId !== command.actorId
        || existing.actorHandle !== command.actorHandle
        || existing.kind !== command.decisionKind
        || command.selectedLabel !== (
          command.disposition === "accept" ? existing?.acceptLabel : existing?.declineLabel)
        || selectedActor?.kind !== "person"
        || selectedActor.controller !== "agent"
      ) {
        deny(
          "precondition_failed",
          existing === undefined
            ? "Decision does not exist in the current mechanical frame."
            : existing.status !== "open"
              ? "Decision has already been resolved."
              : "Decision resolution does not match the current code-owned decision.",
          command,
          index,
        );
      }
      existing.status = command.disposition === "accept" ? "accepted" : "declined";
      existing.resolutionEventId = deriveCampaignPlayEventId(
        frame.campaignId,
        authority.turnId,
        command.batchId,
        command.order,
      );
      existing.resolutionTurnId = authority.turnId;
      existing.resolutionDisposition = command.disposition;
      existing.worldVersion = state.worldVersion + 1;
      break;
    }
    case "create_player_commitment": {
      const activeCommitmentCount = state.commitments.filter((row) =>
        row.status === "active").length;
      if (activeCommitmentCount >= CAMPAIGN_PLAY_LIMITS.visibleCommitments) {
        deny(
          "precondition_failed",
          "Complete an active commitment before accepting more work.",
          command,
          index,
        );
      }
      const sourceDecision = state.pendingDecisions.find((row) =>
        row.decisionKey === command.sourceDecisionKey);
      const performer = actor(frame, state, command.performerActorId);
      const counterparty = actor(frame, state, command.counterpartyActorId);
      const destination = [...frame.acceptedWorld.locations, ...state.runtimeLocations].find((location) =>
        deriveCampaignPlayPublicHandle("location", frame.campaignId, location.id)
          === command.destinationHandle && location.id === command.destinationLocationId);
      const acceptedWorldTimeMinutes = state.worldTimeMinutes;
      const deliveryEffect = sourceDecision?.acceptEffect?.kind === "paid_delivery" ||
        sourceDecision?.acceptEffect?.kind === "unpaid_delivery"
        ? sourceDecision.acceptEffect
        : null;
      const expectedDue = deliveryEffect?.dueInMinutes !== undefined
        && acceptedWorldTimeMinutes !== null
        ? acceptedWorldTimeMinutes + deliveryEffect.dueInMinutes
        : null;
      const expectedCommitmentId = deriveCampaignPlayCommitmentId(
        frame.campaignId,
        command.sourceDecisionKey,
      );
      const expectedReceiptId = deriveCampaignPlayReceiptId(
        frame.campaignId,
        authority.turnId,
        command.batchId,
        command.order,
      );
      const baseInvalid =
        authority.purpose !== "player_action"
        || authority.turnId === null
        || sourceDecision?.status !== "accepted"
        || sourceDecision.actorId !== command.counterpartyActorId
        || sourceDecision.sourceTurnId !== command.sourceTurnId
        || (sourceDecision.acceptEffect?.kind !== "paid_delivery"
          && sourceDecision.acceptEffect?.kind !== "unpaid_delivery")
        || performer?.kind !== "person"
        || performer.controller !== "human"
        || state.human?.actorId !== command.performerActorId
        || counterparty?.kind !== "person"
        || counterparty.controller !== "agent"
        || command.performerActorId === command.counterpartyActorId
        || destination === undefined
        || acceptedWorldTimeMinutes === null
        || command.acceptedWorldTimeMinutes !== acceptedWorldTimeMinutes
        || command.commitmentId !== expectedCommitmentId
        || state.commitments.some((row) => row.commitmentId === command.commitmentId)
        || command.dueWorldTimeMinutes !== expectedDue;
      if (baseInvalid) {
        deny(
          "precondition_failed",
          "Delivery commitment must match one accepted decision and its exact public terms.",
          command,
          index,
        );
      }
      const commonCommitment = {
        commitmentId: command.commitmentId,
        campaignId: frame.campaignId,
        performerActorId: command.performerActorId,
        counterpartyActorId: command.counterpartyActorId,
        status: "active" as const,
        title: command.title,
        subjectName: command.subjectName,
        destinationHandle: command.destinationHandle,
        acceptedWorldTimeMinutes,
        dueWorldTimeMinutes: command.dueWorldTimeMinutes,
        sourceDecisionKey: command.sourceDecisionKey,
        sourceTurnId: command.sourceTurnId,
        sourceReceiptId: expectedReceiptId,
        completionTurnId: null,
        completionReceiptId: null,
        worldVersion: state.worldVersion + 1,
        createdAt: 0,
        updatedAt: 0,
      };
      if (command.commitmentKind === "paid_delivery") {
        const effect = sourceDecision?.acceptEffect;
        if (
          effect?.kind !== "paid_delivery"
          || effect.title !== command.title
          || effect.subjectName !== command.subjectName
          || effect.destinationHandle !== command.destinationHandle
          || effect.feeUnit !== command.feeUnit
          || effect.feeAmount !== command.feeAmount
          || effect.paymentTiming !== command.paymentTiming
        ) {
          deny(
            "precondition_failed",
            "Paid-delivery commitment must match one accepted decision and its exact payment terms.",
            command,
            index,
          );
        }
        state.commitments.push({
          ...commonCommitment,
          kind: "paid_delivery",
          feeUnit: command.feeUnit,
          feeAmount: command.feeAmount,
          paymentTiming: command.paymentTiming,
        });
      } else {
        const effect = sourceDecision?.acceptEffect;
        if (
          effect?.kind !== "unpaid_delivery"
          || effect.title !== command.title
          || effect.subjectName !== command.subjectName
          || effect.destinationHandle !== command.destinationHandle
        ) {
          deny(
            "precondition_failed",
            "Unpaid-delivery commitment must match one accepted decision and its exact delivery terms.",
            command,
            index,
          );
        }
        state.commitments.push({
          ...commonCommitment,
          kind: "unpaid_delivery",
        });
      }
      break;
    }
    case "complete_player_commitment": {
      const existing = state.commitments.find((row) => row.commitmentId === command.commitmentId);
      const performer = actor(frame, state, command.performerActorId);
      const counterparty = actor(frame, state, command.counterpartyActorId);
      const expectedPossessionKey = existing === undefined
        ? null
        : deriveCampaignPlayPossessionKey(existing.subjectName);
      const expectedPossessionId = existing === undefined || expectedPossessionKey === null
        ? null
        : deriveCampaignPlayPossessionId(
          frame.campaignId,
          existing.performerActorId,
          expectedPossessionKey,
        );
      const destination = existing === undefined
        ? undefined
        : [...frame.acceptedWorld.locations, ...state.runtimeLocations].find((location) =>
          deriveCampaignPlayPublicHandle("location", frame.campaignId, location.id)
            === existing.destinationHandle);
      const possession = expectedPossessionId === null
        ? undefined
        : state.possessions.find((row) => row.possessionId === expectedPossessionId);
      const completionReceiptId = deriveCampaignPlayReceiptId(
        frame.campaignId,
        authority.turnId,
        command.batchId,
        command.order,
      );
      const baseInvalid =
        authority.purpose !== "player_action"
        && authority.purpose !== "commitment_execution"
        || authority.turnId === null
        || existing === undefined
        || existing.status !== "active"
        || existing.performerActorId !== command.performerActorId
        || existing.counterpartyActorId !== command.counterpartyActorId
        || performer?.kind !== "person"
        || performer.controller !== "human"
        || state.human?.actorId !== command.performerActorId
        || counterparty?.kind !== "person"
        || counterparty.controller !== "agent"
        || expectedPossessionId === null
        || command.deliveryPossessionId !== expectedPossessionId
        || command.destinationHandle !== existing.destinationHandle
        || command.destinationLocationId !== destination?.id
        || destination === undefined
        || !operativeActorLocations(frame, state, existing?.performerActorId ?? command.performerActorId)
          .includes(destination.id)
        || possession === undefined
        || possession.actorId !== existing?.performerActorId
        || possession.possessionKey !== expectedPossessionKey
        || possession.name !== existing?.subjectName
        || (existing?.kind !== "paid_delivery" && existing?.kind !== "unpaid_delivery");
      if (baseInvalid) {
        deny(
          "precondition_failed",
          "Only an active delivery commitment can be completed by its player performer.",
          command,
          index,
        );
      }
      existing.status = "completed";
      existing.completionTurnId = authority.turnId;
      existing.completionReceiptId = completionReceiptId;
      existing.worldVersion = state.worldVersion + 1;
      existing.updatedAt = 0;
      break;
    }
    case "create_player_actor": {
      if (
        frame.setupPhase !== "character_required"
        || state.human !== null
        || actor(frame, state, command.actorId) !== null
      ) deny("precondition_failed", "Player actor already exists or phase is closed.", command, index);
      state.human = { actorId: command.actorId, recordHash: command.characterDigest };
      break;
    }
    case "initialize_player_placement": {
      const player = actor(frame, state, command.actorId);
      const location = frame.acceptedWorld.locations.find((row) => row.id === command.locationId);
      const placementId = `opening-placement:${command.actorId}`;
      if (
        frame.setupPhase !== "opening_required"
        || player?.controller !== "human"
        || player.role !== "player"
        || location?.kind !== "persistent_sublocation"
        || state.placements.some((row) => row.actorId === command.actorId)
        || state.placements.some((row) => row.placementId === placementId)
      ) deny("precondition_failed", "Player placement initialization is invalid.", command, index);
      state.placements.push({
        placementId,
        actorId: command.actorId,
        locationId: command.locationId,
        placementKind: "present",
      });
      break;
    }
    case "initialize_world_time": {
      if (frame.setupPhase !== "opening_required" || state.worldTimeMinutes !== null || command.worldTimeMinutes !== 0) {
        deny("precondition_failed", "Opening world clock must initialize exactly once at zero.", command, index);
      }
      state.worldTimeMinutes = 0;
      break;
    }
    case "initialize_pressure_state": {
      if (
        frame.setupPhase !== "opening_required"
        || !frame.acceptedWorld.pressures.some((row) => row.id === command.pressureId)
        || state.pressureStates.some((row) => row.pressureId === command.pressureId)
        || command.progress !== 0
        || command.status !== "active"
      ) deny("precondition_failed", "Pressure state initialization is invalid.", command, index);
      state.pressureStates.push({
        pressureId: command.pressureId,
        progress: 0,
        status: "active",
        lastAdvancedWorldTimeMinutes: 0,
      });
      break;
    }
  }
  if (CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].mechanicalMutation) {
    state.worldVersion += 1;
  }
}

function validateBootstrapCoverage(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  commands: readonly RulebookBatchCommand[],
): void {
  if (authority.purpose === "character_bootstrap") {
    const player = commands[0];
    const possessions = commands.slice(1);
    if (
      player?.kind !== "create_player_actor"
      || possessions.some((command) =>
        command.kind !== "adjust_actor_possession"
        || command.actorId !== player.actorId
        || command.quantityDelta <= 0)
      || new Set(possessions.map((command) =>
        command.kind === "adjust_actor_possession" ? command.possessionId : "")).size
        !== possessions.length
    ) {
      deny(
        "invalid_bootstrap_coverage",
        "Character bootstrap requires one player command followed by unique positive starting possessions for that actor.",
      );
    }
    return;
  }
  if (authority.purpose !== "opening") return;
  const placements = commands.filter((command) => command.kind === "initialize_player_placement");
  const clocks = commands.filter((command) => command.kind === "initialize_world_time");
  const pressures = commands.filter((command) => command.kind === "initialize_pressure_state");
  const routeRestrictions = commands.filter((command) => command.kind === "set_route_state");
  const premises = commands.filter((command) => command.kind === "record_world_event");
  const decisionOpens = commands.filter((command) => command.kind === "decision_open");
  const expectedPressureIds = [...frame.acceptedWorld.pressures].map((pressure) => pressure.id).sort(compareText);
  const actualPressureIds = pressures.map((command) => command.pressureId).sort(compareText);
  if (
    placements.length !== 1
    || clocks.length !== 1
    || routeRestrictions.length > 1
    || premises.length > 1
    || decisionOpens.length > 1
    || (routeRestrictions.length === 1 && premises.length !== 1)
    || (decisionOpens.length === 1 && commands.at(-1) !== decisionOpens[0])
    || (premises.length === 1 && commands.at(-(decisionOpens.length + 1)) !== premises[0])
    || (routeRestrictions.length === 1
      && commands.at(-(decisionOpens.length + premises.length + 1)) !== routeRestrictions[0])
    || commands.length !== 2 + expectedPressureIds.length
      + routeRestrictions.length + premises.length + decisionOpens.length
    || JSON.stringify(actualPressureIds) !== JSON.stringify(expectedPressureIds)
  ) {
    deny("invalid_bootstrap_coverage", "Opening must initialize placement, clock, and every pressure exactly once, followed by optional route restriction, player-premise, and one structured decision.");
  }
}

function sortSimulation(state: CampaignPlayRulebookSimulation): void {
  state.runtimeActors.sort((left, right) => compareText(left.id, right.id));
  state.runtimeLocations.sort((left, right) => compareText(left.id, right.id));
  state.runtimeRoutes.sort((left, right) => compareText(left.id, right.id));
  state.routeStates.sort((left, right) => compareText(left.routeId, right.routeId));
  state.actorConditions.sort((left, right) =>
    compareText(`${left.actorId}\u0000${left.condition}`, `${right.actorId}\u0000${right.condition}`));
  state.possessions.sort((left, right) => compareText(left.possessionId, right.possessionId));
  state.obligations.sort((left, right) => compareText(left.obligationId, right.obligationId));
  state.pressureStates.sort((left, right) => compareText(left.pressureId, right.pressureId));
  state.placements.sort((left, right) => compareText(left.placementId, right.placementId));
  state.relations.sort((left, right) => compareText(left.relationId, right.relationId));
  state.goals.sort((left, right) => compareText(left.goalId, right.goalId));
  state.pendingDecisions.sort((left, right) => compareText(left.decisionKey, right.decisionKey));
  state.commitments.sort((left, right) => compareText(left.commitmentId, right.commitmentId));
}

function snapshotSimulation(
  state: CampaignPlayRulebookSimulation,
): CampaignPlayRulebookSimulation {
  return {
    worldVersion: state.worldVersion,
    worldTimeMinutes: state.worldTimeMinutes,
    human: state.human === null ? null : { ...state.human },
    runtimeActors: state.runtimeActors.map((row) => ({
      ...row,
      traits: [...row.traits],
      tags: [...row.tags],
    })),
    runtimeLocations: state.runtimeLocations.map((row) => ({ ...row, tags: [...row.tags] })),
    runtimeRoutes: state.runtimeRoutes.map((row) => ({ ...row })),
    routeStates: state.routeStates.map((row) => ({ ...row })),
    actorConditions: state.actorConditions.map((row) => ({ ...row })),
    possessions: state.possessions.map((row) => ({ ...row })),
    obligations: state.obligations.map((row) => ({ ...row })),
    pressureStates: state.pressureStates.map((row) => ({ ...row })),
    placements: state.placements.map((row) => ({ ...row })),
    relations: state.relations.map((row) => ({ ...row })),
    goals: state.goals.map((row) => ({ ...row })),
    pendingDecisions: state.pendingDecisions.map((row) => ({ ...row })),
    commitments: state.commitments.map((row) => ({ ...row })),
  };
}

export function preflightCampaignPlayRulebook(
  input: CampaignPlayRulebookPreflightInput,
): CampaignPlayRulebookPreflightResult {
  try {
    if (!validFrame(input.frame)) deny("invalid_frame", "Mechanical frame is inconsistent.");
    const authorized = validateAuthority(input.frame, input.authority);
    const parsed = rulebookCommandBatchSchema.safeParse(input.batch);
    if (!parsed.success) deny("invalid_batch", "Command batch violates the strict contract.");
    const batch = parsed.data;
    if (
      input.authority.purpose !== "character_bootstrap"
      && batch.commands.length > CAMPAIGN_PLAY_LIMITS.commandsPerBatch
    ) {
      deny("invalid_batch", "Command batch exceeds the authority-specific command limit.");
    }
    if (batch.baseWorldVersion !== input.frame.worldVersion) {
      deny("stale_world_version", "Command batch base version is stale.");
    }
    validateBootstrapCoverage(input.frame, input.authority, batch.commands);
    const state = cloneSimulation(input.frame);
    if (input.authority.purpose === "commitment_execution") {
      validateCommitmentExecutionBatch(
        input.frame,
        input.authority,
        state,
        authorized,
        batch.commands,
      );
    } else {
      validatePaidDeliverySettlementBatch(input.frame, input.authority, state, batch.commands);
    }
    const checkpoints: CampaignPlayRulebookSimulation[] = [snapshotSimulation(state)];
    const knownEvents = new Set(input.authority.knownWorldEventIds);
    for (const [index, command] of batch.commands.entries()) {
      validateAvailability(input.frame, input.authority, state, command, index);
      validateSource(input.frame, input.authority, state, command, index);
      validateCausalParent(input.authority, batch.commands, command, index);
      validateMaterializedLocalSceneTiming(batch.commands, command, index);
      validateRefsAndScopes(
        input.frame,
        input.authority,
        state,
        authorized,
        knownEvents,
        command,
        index,
      );
      applyCommand(input.frame, input.authority, state, command, index);
      sortSimulation(state);
      checkpoints.push(snapshotSimulation(state));
    }
    sortSimulation(state);
    const result = { accepted: true as const, batch, simulation: state, checkpoints };
    acceptedRulebookSeals.set(result, acceptedRulebookSeal(batch, checkpoints));
    return freezeRulebookValue(result);
  } catch (error) {
    if (error instanceof RulebookDenied) return { accepted: false, denial: error.denial };
    throw error;
  }
}

export type CampaignPlayRulebookFaultPoint =
  | { kind: "before_command"; commandIndex: number }
  | { kind: "after_command"; commandIndex: number }
  | { kind: "before_commit"; commandIndex: null };

type AcceptedRulebookBatch = Extract<
  CampaignPlayRulebookPreflightResult,
  { accepted: true }
>;

export interface ExecuteCampaignPlayRulebookInput {
  frame: CampaignPlayRulebookFrame;
  accepted: AcceptedRulebookBatch;
  context: CampaignPlayMutationContext;
  turnId: string | null;
  createdAt: number;
  persistPlayerCharacter?: (
    context: CampaignPlayMutationContext,
    command: Extract<RulebookBatchCommand, { kind: "create_player_actor" }>,
  ) => void;
  injectFault?: (point: CampaignPlayRulebookFaultPoint) => void;
}

export interface ExecutedCampaignPlayRulebookBatch {
  batchId: string;
  commandIds: string[];
  receiptIds: string[];
  eventIds: string[];
  priorWorldVersion: number;
  resultWorldVersion: number;
  resultWorldHash: string;
}

export class CampaignPlayRulebookExecutionError extends Error {
  constructor(
    readonly code:
      | "execution_contract_invalid"
      | "player_character_writer_required"
      | "mechanical_hash_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "CampaignPlayRulebookExecutionError";
  }
}

function stableRulebookId(prefix: string, value: unknown): string {
  return `${prefix}:${hashCampaignPlayProjection(value).slice(0, 32)}`;
}

export function deriveCampaignPlayDecisionKey(
  campaignId: string,
  sourceTurnId: string,
  actorId: string,
  decisionKind: CampaignPlayDecisionKind,
): string {
  return stableRulebookId("decision", {
    campaignId,
    sourceOpeningTurnId: sourceTurnId,
    actorId,
    kind: decisionKind,
  });
}

export function deriveCampaignPlayCommitmentId(
  campaignId: string,
  sourceDecisionKey: string,
): string {
  return stableRulebookId("commitment", { campaignId, sourceDecisionKey });
}

export function deriveCampaignPlayReceiptId(
  campaignId: string,
  turnId: string | null,
  batchId: string,
  commandOrder: number,
): string {
  return stableRulebookId("receipt", { campaignId, turnId, batchId, commandOrder });
}

export function deriveCampaignPlayCommandId(
  campaignId: string,
  turnId: string | null,
  batchId: string,
  commandOrder: number,
): string {
  return stableRulebookId("command", { campaignId, turnId, batchId, commandOrder });
}

function deriveCampaignPlayEventId(
  campaignId: string,
  turnId: string | null,
  batchId: string,
  commandOrder: number,
): string {
  return stableRulebookId("event", { campaignId, turnId, batchId, commandOrder });
}

function commandArguments(command: RulebookBatchCommand): Record<string, unknown> {
  const result = { ...command } as Record<string, unknown>;
  for (const key of [
    "commandId", "batchId", "order", "causalParent", "source",
    "expectedWorldVersion", "readScope", "writeScope", "exposure",
  ]) delete result[key];
  return result;
}

function mechanicalHash(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
): string {
  const acceptedPlacements = frame.acceptedWorld.placements.map((row) => ({
    placementId: row.id,
    actorId: row.actorId,
    locationId: row.locationId,
    placementKind: row.placementKind,
  }));
  const acceptedRelations = frame.acceptedWorld.relations.map((row) => ({
    relationId: row.id,
    sourceActorId: row.sourceActorId,
    targetActorId: row.targetActorId,
    relationType: row.relationType,
    intensity: row.intensity,
    summary: row.summary,
  }));
  const acceptedGoals = frame.acceptedWorld.goals.map((row) => ({
    goalId: row.id,
    actorId: row.actorId,
    status: row.status,
    priority: row.priority,
    objective: row.objective,
    motivation: row.motivation,
  }));
  const unchanged = (left: unknown, right: unknown) =>
    canonicalizeCampaignPlayProjection(left) === canonicalizeCampaignPlayProjection(right);
  const acceptedBaseRowsUnchanged =
    unchanged(state.placements, acceptedPlacements)
    && unchanged(state.relations, acceptedRelations)
    && unchanged(state.goals, acceptedGoals);
  const base = projectCampaignPlayMechanicalTruth({
    acceptedReview: frame.acceptedWorld,
    worldTimeMinutes: state.worldTimeMinutes,
    human: state.human,
    runtimeActors: state.runtimeActors,
    runtimeLocations: state.runtimeLocations,
    runtimeRoutes: state.runtimeRoutes,
    routeStates: state.routeStates,
    actorConditions: state.actorConditions,
    possessions: state.possessions,
    obligations: state.obligations,
    pressureStates: state.pressureStates,
    placements: acceptedBaseRowsUnchanged ? [] : state.placements,
    relations: acceptedBaseRowsUnchanged ? [] : state.relations,
    goals: acceptedBaseRowsUnchanged ? [] : state.goals,
    pendingDecisions: state.pendingDecisions,
  });
  if (state.commitments.length === 0) return base.hash;
  const commitments = state.commitments
    .map(({ createdAt, updatedAt, ...row }) => row)
    .sort((left, right) => compareText(left.commitmentId, right.commitmentId));
  const projection = {
    ...(base.projection as Record<string, unknown>),
    commitments,
  };
  return hashCampaignPlayProjection(projection);
}

function eventKind(command: RulebookBatchCommand): string {
  switch (command.kind) {
    case "advance_world_time": return "world_time_advanced";
    case "move_actor": return "actor_moved";
    case "set_route_state": return "route_state_changed";
    case "set_actor_condition": return "actor_condition_changed";
    case "update_actor_relation": return "actor_relation_changed";
    case "update_actor_goal": return "actor_goal_changed";
    case "advance_pressure": return "pressure_advanced";
    case "adjust_actor_possession": return "actor_possession_adjusted";
    case "incur_actor_obligation": return "actor_obligation_incurred";
    case "pay_actor_obligation": return "actor_obligation_payment_applied";
    case "settle_player_receivable": return "player_receivable_settled";
    case "materialize_support_actor": return "support_actor_materialized";
    case "record_world_event": return "scene_recorded";
    case "create_player_actor": return "player_actor_created";
    case "initialize_player_placement": return "player_placement_initialized";
    case "initialize_world_time": return "world_time_initialized";
    case "initialize_pressure_state": return "pressure_initialized";
    case "decision_open": return "decision_opened";
    case "decision_resolve":
      return command.disposition === "accept" ? "decision_accepted" : "decision_declined";
    case "create_player_commitment": return "player_commitment_created";
    case "complete_player_commitment": return "player_commitment_completed";
  }
}

function eventAffectedRefs(
  frame: CampaignPlayRulebookFrame,
  command: RulebookBatchCommand,
  before: CampaignPlayRulebookSimulation,
  after: CampaignPlayRulebookSimulation,
): CampaignPlayEntityRef[] {
  if (command.kind === "record_world_event") return command.affectedRefs;
  if (command.kind === "adjust_actor_possession") return commandEntityRefs(frame, after, command);
  if (command.kind === "incur_actor_obligation") return commandEntityRefs(frame, after, command);
  if (command.kind === "pay_actor_obligation") return commandEntityRefs(frame, after, command);
  if (command.kind === "settle_player_receivable") return commandEntityRefs(frame, after, command);
  if (command.kind === "decision_open" || command.kind === "decision_resolve") {
    return commandEntityRefs(frame, after, command);
  }
  if (command.kind === "create_player_commitment" || command.kind === "complete_player_commitment") {
    return commandEntityRefs(frame, after, command);
  }
  const refs = command.writeScope.length > 0 ? command.writeScope : command.readScope;
  if (refs.length > 0) return refs;
  if (command.source.kind === "actor") return [ref("actor", command.source.actorId)];
  const humanActorId = after.human?.actorId ?? before.human?.actorId;
  if (humanActorId) return [ref("actor", humanActorId)];
  throw new CampaignPlayRulebookExecutionError(
    "execution_contract_invalid",
    `Command ${command.commandId} has no durable affected entity.`,
  );
}

function applyStoredMutation(
  input: ExecuteCampaignPlayRulebookInput,
  command: RulebookBatchCommand,
  receiptId: string,
  resultWorldVersion: number,
  causalEventId: string | null = null,
): void {
  const { sqlite, campaignId } = input.context;
  switch (command.kind) {
    case "advance_world_time":
      sqlite.prepare(`UPDATE campaign_play_states SET world_time_minutes = world_time_minutes + ? WHERE campaign_id = ?`)
        .run(command.elapsedMinutes, campaignId);
      return;
    case "move_actor":
      if (command.materializedLocalScene !== undefined) {
        const scene = command.materializedLocalScene;
        const origin = sqlite.prepare(`SELECT parent_location_id AS parentLocationId
          FROM locations WHERE id = ? AND campaign_id = ? AND kind = 'persistent_sublocation'`)
          .get(command.fromLocationId, campaignId) as { parentLocationId: string | null } | undefined;
        if (origin?.parentLocationId === null || origin === undefined) {
          throw new CampaignPlayRulebookExecutionError(
            "execution_contract_invalid",
            "Accepted local scene move lost its parent region.",
          );
        }
        sqlite.prepare(`INSERT INTO locations
          (id, campaign_id, name, description, kind, parent_location_id,
            anchor_location_id, persistence, tags, is_starting, definition_authority,
            causal_receipt_id, world_version)
          VALUES (?, ?, ?, ?, 'persistent_sublocation', ?, ?, 'persistent', '[]', 0,
            'campaign_play', ?, ?)`)
          .run(scene.locationId, campaignId, scene.name, scene.description,
            origin.parentLocationId, scene.anchorLocationId, receiptId, resultWorldVersion);
        const insertRoute = sqlite.prepare(`INSERT INTO location_edges
          (id, campaign_id, from_location_id, to_location_id, travel_cost, discovered,
            definition_authority, causal_receipt_id, world_version)
          VALUES (?, ?, ?, ?, ?, 1, 'campaign_play', ?, ?)`);
        insertRoute.run(scene.outboundRouteId, campaignId, scene.anchorLocationId,
          scene.locationId, scene.travelCost, receiptId, resultWorldVersion);
        insertRoute.run(scene.returnRouteId, campaignId, scene.locationId,
          scene.anchorLocationId, scene.travelCost, receiptId, resultWorldVersion);
      }
      sqlite.prepare(`UPDATE actor_placements SET location_id = ? WHERE campaign_id = ? AND actor_id = ? AND placement_kind = 'present' AND location_id = ?`)
        .run(command.toLocationId, campaignId, command.actorId, command.fromLocationId);
      return;
    case "set_route_state":
      sqlite.prepare(`INSERT INTO campaign_play_route_states (route_id, campaign_id, state, causal_receipt_id, world_version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(route_id) DO UPDATE SET state = excluded.state, causal_receipt_id = excluded.causal_receipt_id,
          world_version = excluded.world_version, updated_at = excluded.updated_at`)
        .run(command.routeId, campaignId, command.state, receiptId, resultWorldVersion, input.createdAt);
      return;
    case "set_actor_condition":
      sqlite.prepare(`INSERT INTO campaign_play_actor_conditions
        (actor_id, campaign_id, condition, present, summary, causal_receipt_id, world_version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(actor_id, condition) DO UPDATE SET present = excluded.present, summary = excluded.summary,
          causal_receipt_id = excluded.causal_receipt_id, world_version = excluded.world_version,
          updated_at = excluded.updated_at`)
        .run(command.actorId, campaignId, command.condition, command.operation === "set" ? 1 : 0,
          command.summary, receiptId, resultWorldVersion, input.createdAt);
      return;
    case "update_actor_relation":
      sqlite.prepare(`UPDATE actor_relations SET intensity = ?, summary = ? WHERE id = ? AND campaign_id = ?`)
        .run(command.intensity, command.summary, command.relationId, campaignId);
      return;
    case "update_actor_goal":
      sqlite.prepare(`UPDATE actor_goals SET status = ? WHERE id = ? AND campaign_id = ?`)
        .run(command.status, command.goalId, campaignId);
      return;
    case "advance_pressure": {
      sqlite.prepare(`UPDATE campaign_play_pressure_states SET
        progress = min(100, progress + ?), status = ?, last_advanced_world_time_minutes =
          (SELECT world_time_minutes FROM campaign_play_states WHERE campaign_id = ?),
        causal_receipt_id = ?, world_version = ?, updated_at = ?
        WHERE pressure_id = ? AND campaign_id = ?`)
        .run(command.amount, command.resultStatus, campaignId, receiptId, resultWorldVersion,
          input.createdAt, command.pressureId, campaignId);
      return;
    }
    case "adjust_actor_possession": {
      const exists = sqlite.prepare(`SELECT 1 FROM campaign_play_actor_possessions
        WHERE possession_id = ? AND campaign_id = ?`).get(command.possessionId, campaignId);
      if (exists) {
        sqlite.prepare(`UPDATE campaign_play_actor_possessions SET
          quantity = quantity + ?, causal_receipt_id = ?, world_version = ?, updated_at = ?
          WHERE possession_id = ? AND campaign_id = ?`)
          .run(command.quantityDelta, receiptId, resultWorldVersion, input.createdAt,
            command.possessionId, campaignId);
      } else {
        sqlite.prepare(`INSERT INTO campaign_play_actor_possessions
          (possession_id, campaign_id, actor_id, possession_key, name, quantity,
            causal_receipt_id, world_version, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(command.possessionId, campaignId, command.actorId, command.possessionKey,
            command.name, command.quantityDelta, receiptId, resultWorldVersion, input.createdAt);
      }
      return;
    }
    case "incur_actor_obligation": {
      const exists = sqlite.prepare(`SELECT 1 FROM campaign_play_actor_obligations
        WHERE obligation_id = ? AND campaign_id = ?`).get(command.obligationId, campaignId);
      if (exists) {
        sqlite.prepare(`UPDATE campaign_play_actor_obligations SET
          principal_amount = principal_amount + ?, outstanding_amount = outstanding_amount + ?,
          causal_receipt_id = ?, world_version = ?, updated_at = ?
          WHERE obligation_id = ? AND campaign_id = ?`)
          .run(command.amount, command.amount, receiptId, resultWorldVersion, input.createdAt,
            command.obligationId, campaignId);
      } else {
        sqlite.prepare(`INSERT INTO campaign_play_actor_obligations
          (obligation_id, campaign_id, debtor_actor_id, creditor_actor_id, unit_key,
            principal_amount, outstanding_amount, causal_receipt_id, world_version, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(command.obligationId, campaignId, command.debtorActorId, command.creditorActorId,
            command.unitKey, command.amount, command.amount, receiptId, resultWorldVersion,
            input.createdAt);
      }
      return;
    }
    case "pay_actor_obligation": {
      const paymentPossession = sqlite.prepare(`SELECT possession_key AS possessionKey, name
        FROM campaign_play_actor_possessions
        WHERE possession_id = ? AND campaign_id = ?`).get(
          command.paymentPossessionId,
          campaignId,
        ) as { possessionKey: string; name: string } | undefined;
      if (!paymentPossession) {
        throw new CampaignPlayRulebookExecutionError(
          "execution_contract_invalid",
          "Accepted obligation payment is missing its debtor possession.",
        );
      }
      const creditorPossessionId = deriveCampaignPlayPossessionId(
        campaignId,
        command.creditorActorId,
        paymentPossession.possessionKey,
      );
      sqlite.prepare(`UPDATE campaign_play_actor_possessions SET
        quantity = quantity - ?, causal_receipt_id = ?, world_version = ?, updated_at = ?
        WHERE possession_id = ? AND campaign_id = ?`)
        .run(command.amount, receiptId, resultWorldVersion, input.createdAt,
          command.paymentPossessionId, campaignId);
      const creditorPossession = sqlite.prepare(`SELECT 1 FROM campaign_play_actor_possessions
        WHERE possession_id = ? AND campaign_id = ?`).get(creditorPossessionId, campaignId);
      if (creditorPossession) {
        sqlite.prepare(`UPDATE campaign_play_actor_possessions SET
          quantity = quantity + ?, causal_receipt_id = ?, world_version = ?, updated_at = ?
          WHERE possession_id = ? AND campaign_id = ?`)
          .run(command.amount, receiptId, resultWorldVersion, input.createdAt,
            creditorPossessionId, campaignId);
      } else {
        sqlite.prepare(`INSERT INTO campaign_play_actor_possessions
          (possession_id, campaign_id, actor_id, possession_key, name, quantity,
            causal_receipt_id, world_version, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(creditorPossessionId, campaignId, command.creditorActorId,
            paymentPossession.possessionKey, paymentPossession.name, command.amount,
            receiptId, resultWorldVersion, input.createdAt);
      }
      sqlite.prepare(`UPDATE campaign_play_actor_obligations SET
        outstanding_amount = outstanding_amount - ?, causal_receipt_id = ?,
        world_version = ?, updated_at = ?
        WHERE obligation_id = ? AND campaign_id = ?`)
        .run(command.amount, receiptId, resultWorldVersion, input.createdAt,
          command.obligationId, campaignId);
      return;
    }
    case "settle_player_receivable": {
      const obligation = sqlite.prepare(`SELECT debtor_actor_id AS debtorActorId,
          creditor_actor_id AS creditorActorId, unit_key AS unitKey,
          outstanding_amount AS outstandingAmount
        FROM campaign_play_actor_obligations
        WHERE obligation_id = ? AND campaign_id = ?`).get(
          command.obligationId,
          campaignId,
        ) as {
          debtorActorId: string;
          creditorActorId: string;
          unitKey: string;
          outstandingAmount: number;
        } | undefined;
      if (
        obligation === undefined
        || obligation.debtorActorId !== command.debtorActorId
        || obligation.creditorActorId !== command.creditorActorId
        || obligation.unitKey !== "copper"
        || obligation.outstandingAmount !== command.amount
      ) {
        throw new CampaignPlayRulebookExecutionError(
          "execution_contract_invalid",
          "Receivable settlement lost its exact outstanding obligation.",
        );
      }
      const possessionId = deriveCampaignPlayPossessionId(
        campaignId,
        command.creditorActorId,
        command.creditorPossessionKey,
      );
      if (possessionId !== command.creditorPossessionId) {
        throw new CampaignPlayRulebookExecutionError(
          "execution_contract_invalid",
          "Receivable settlement lost its canonical creditor possession.",
        );
      }
      const result = sqlite.prepare(`UPDATE campaign_play_actor_obligations SET
        outstanding_amount = outstanding_amount - ?, causal_receipt_id = ?,
        world_version = ?, updated_at = ?
        WHERE obligation_id = ? AND campaign_id = ? AND outstanding_amount = ?`)
        .run(command.amount, receiptId, resultWorldVersion, input.createdAt,
          command.obligationId, campaignId, command.amount);
      if (result.changes !== 1) {
        throw new CampaignPlayRulebookExecutionError(
          "execution_contract_invalid",
          "Receivable settlement did not update exactly one obligation.",
        );
      }
      const possession = sqlite.prepare(`SELECT actor_id AS actorId,
          possession_key AS possessionKey, name, quantity
        FROM campaign_play_actor_possessions
        WHERE possession_id = ? AND campaign_id = ?`).get(
          command.creditorPossessionId,
          campaignId,
        ) as {
          actorId: string;
          possessionKey: string;
          name: string;
          quantity: number;
        } | undefined;
      if (possession !== undefined) {
        if (
          possession.actorId !== command.creditorActorId
          || possession.possessionKey !== "copper"
          || possession.name !== "Copper"
          || possession.quantity > CAMPAIGN_PLAY_LIMITS.possessionQuantity - command.amount
        ) {
          throw new CampaignPlayRulebookExecutionError(
            "execution_contract_invalid",
            "Receivable settlement lost its canonical copper possession.",
          );
        }
        sqlite.prepare(`UPDATE campaign_play_actor_possessions SET
          quantity = quantity + ?, causal_receipt_id = ?, world_version = ?, updated_at = ?
          WHERE possession_id = ? AND campaign_id = ?`)
          .run(command.amount, receiptId, resultWorldVersion, input.createdAt,
            command.creditorPossessionId, campaignId);
      } else {
        sqlite.prepare(`INSERT INTO campaign_play_actor_possessions
          (possession_id, campaign_id, actor_id, possession_key, name, quantity,
            causal_receipt_id, world_version, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(command.creditorPossessionId, campaignId, command.creditorActorId,
            "copper", "Copper", command.amount, receiptId, resultWorldVersion,
            input.createdAt);
      }
      return;
    }
    case "materialize_support_actor": {
      const after = input.accepted.checkpoints[command.order + 1]!;
      if (after.worldTimeMinutes === null) {
        throw new CampaignPlayRulebookExecutionError(
          "execution_contract_invalid",
          "Support actor materialization requires initialized world time.",
        );
      }
      const planIntent = {
        kind: command.planIntentKind,
        targets: [{ kind: "location" as const, id: command.locationId }],
        method: command.planMethod,
        stakes: command.planStakes,
      };
      const planSteps = command.steps.map((step, order) => ({
        stepId: `support-step:${hashCampaignPlayProjection({
          domain: "campaign_play_support_actor_step",
          planId: command.planId,
          order,
        }).slice(0, 32)}`,
        order,
        intent: {
          kind: step.intentKind,
          targets: [{ kind: "location" as const, id: command.locationId }],
          method: step.method,
          stakes: step.stakes,
        },
        observableTrace: step.observableTrace,
        possessionOutcome: { kind: "none" as const },
        elapsedBounds: step.elapsedBounds,
      }));
      sqlite.prepare(`INSERT INTO actors
        (id, campaign_id, kind, controller, role, name, summary, traits, tags,
          definition_authority, causal_receipt_id, world_version)
        VALUES (?, ?, 'person', 'agent', 'support', ?, ?, ?, ?,
          'campaign_play', ?, ?)`).run(
            command.actorId,
            campaignId,
            command.name,
            command.summary,
            canonicalizeCampaignPlayProjection(command.traits),
            canonicalizeCampaignPlayProjection(command.tags),
            receiptId,
            resultWorldVersion,
          );
      sqlite.prepare(`INSERT INTO actor_goals
        (id, campaign_id, actor_id, objective, motivation, horizon, priority, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`).run(
          command.goalId,
          campaignId,
          command.actorId,
          command.goalObjective,
          command.goalMotivation,
          command.goalHorizon,
          command.priority,
        );
      sqlite.prepare(`INSERT INTO actor_placements
        (id, campaign_id, actor_id, location_id, placement_kind)
        VALUES (?, ?, ?, ?, 'present')`).run(
          command.placementId,
          campaignId,
          command.actorId,
          command.locationId,
        );
      sqlite.prepare(`INSERT INTO campaign_play_actor_plans (
        plan_id, campaign_id, actor_id, goal_id, plan_version, intent_json,
        preconditions_json, cadence_minutes, priority, steps_json, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'active', ?, ?)`).run(
        command.planId,
        campaignId,
        command.actorId,
        command.goalId,
        canonicalizeCampaignPlayProjection(planIntent),
        canonicalizeCampaignPlayProjection([{
          kind: "actor_at_location",
          actorId: command.actorId,
          locationId: command.locationId,
        }]),
        command.cadenceMinutes,
        command.priority,
        canonicalizeCampaignPlayProjection(planSteps),
        input.createdAt,
        input.createdAt,
      );
      sqlite.prepare(`INSERT INTO campaign_play_actor_schedules (
        schedule_id, campaign_id, actor_id, plan_id,
        next_act_at_world_time_minutes, last_act_at_world_time_minutes,
        priority, agency_debt, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).run(
        command.scheduleId,
        campaignId,
        command.actorId,
        command.planId,
        Math.min(
          CAMPAIGN_PLAY_LIMITS.worldTimeMinutes,
          after.worldTimeMinutes + command.cadenceMinutes,
        ),
        after.worldTimeMinutes,
        command.priority,
        input.createdAt,
        input.createdAt,
      );
      return;
    }
    case "record_world_event": return;
    case "create_player_actor":
      sqlite.prepare(`INSERT INTO actors
        (id, campaign_id, kind, controller, role, name, summary, traits, tags)
        VALUES (?, ?, 'person', 'human', 'player', ?, ?, ?, ?)`)
        .run(command.actorId, campaignId, command.name, command.summary,
          canonicalizeCampaignPlayProjection(command.traits),
          canonicalizeCampaignPlayProjection(command.tags));
      if (!input.persistPlayerCharacter) {
        throw new CampaignPlayRulebookExecutionError(
          "player_character_writer_required",
          "Player creation requires its CharacterRecord writer inside the same transaction.",
        );
      }
      input.persistPlayerCharacter(input.context, command);
      sqlite.prepare(`UPDATE campaign_play_states SET setup_phase = 'opening_required' WHERE campaign_id = ?`)
        .run(campaignId);
      return;
    case "initialize_player_placement":
      sqlite.prepare(`INSERT INTO actor_placements (id, campaign_id, actor_id, location_id, placement_kind)
        VALUES (?, ?, ?, ?, 'present')`)
        .run(`opening-placement:${command.actorId}`, campaignId, command.actorId, command.locationId);
      return;
    case "initialize_world_time":
      sqlite.prepare(`UPDATE campaign_play_states SET world_time_minutes = ? WHERE campaign_id = ?`)
        .run(command.worldTimeMinutes, campaignId);
      return;
    case "initialize_pressure_state":
      sqlite.prepare(`INSERT INTO campaign_play_pressure_states
        (pressure_id, campaign_id, progress, status, last_advanced_world_time_minutes,
          causal_receipt_id, world_version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(command.pressureId, campaignId, command.progress, command.status,
          input.accepted.checkpoints[command.order + 1]!.worldTimeMinutes,
          receiptId, resultWorldVersion, input.createdAt);
      return;
    case "decision_open":
      sqlite.prepare(`INSERT INTO campaign_play_decisions (
        decision_key, campaign_id, actor_id, actor_handle, decision_kind,
        source_turn_id, status, summary, accept_label, decline_label, accept_effect_json,
        opened_at, resolved_at, resolution_turn_id, resolution_event_id,
        world_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`)
        .run(
          command.decisionKey,
          campaignId,
          command.actorId,
          command.actorHandle,
          command.decisionKind,
          command.sourceTurnId,
          command.summary,
          command.acceptLabel,
          command.declineLabel,
          command.acceptEffect === undefined || command.acceptEffect === null
            ? null
            : canonicalizeCampaignPlayProjection(command.acceptEffect),
          input.createdAt,
          resultWorldVersion,
          input.createdAt,
          input.createdAt,
        );
      return;
    case "create_player_commitment": {
      const after = input.accepted.checkpoints[command.order + 1]!;
      const commitment = after.commitments.find((row) => row.commitmentId === command.commitmentId);
      if (commitment === undefined || commitment.sourceReceiptId !== receiptId) {
        throw new CampaignPlayRulebookExecutionError(
          "execution_contract_invalid",
          "Accepted commitment creation is missing its deterministic receipt binding.",
        );
      }
      const paidCommitment = commitment.kind === "paid_delivery" ? commitment : null;
      sqlite.prepare(`INSERT INTO campaign_play_commitments (
        commitment_id, campaign_id, performer_actor_id, counterparty_actor_id,
        kind, status, title, subject_name, destination_handle, destination_location_id, fee_unit,
        fee_amount, payment_timing, accepted_world_time_minutes,
        due_world_time_minutes, source_decision_key, source_turn_id,
        source_receipt_id, completion_turn_id, completion_receipt_id,
        world_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`)
        .run(
          commitment.commitmentId,
          campaignId,
          commitment.performerActorId,
          commitment.counterpartyActorId,
          commitment.kind,
          commitment.status,
          commitment.title,
          commitment.subjectName,
          commitment.destinationHandle,
          command.destinationLocationId,
          paidCommitment?.feeUnit ?? null,
          paidCommitment?.feeAmount ?? null,
          paidCommitment?.paymentTiming ?? null,
          commitment.acceptedWorldTimeMinutes,
          commitment.dueWorldTimeMinutes,
          commitment.sourceDecisionKey,
          commitment.sourceTurnId,
          receiptId,
          commitment.worldVersion,
          input.createdAt,
          input.createdAt,
        );
      return;
    }
    case "complete_player_commitment": {
      if (causalEventId === null || input.turnId === null) {
        throw new CampaignPlayRulebookExecutionError(
          "execution_contract_invalid",
          "Commitment completion requires its deterministic event and turn identity.",
        );
      }
      const after = input.accepted.checkpoints[command.order + 1]!;
      const commitment = after.commitments.find((row) => row.commitmentId === command.commitmentId);
      if (
        commitment === undefined
        || commitment.status !== "completed"
        || commitment.completionReceiptId !== receiptId
        || commitment.completionTurnId !== input.turnId
      ) {
        throw new CampaignPlayRulebookExecutionError(
          "execution_contract_invalid",
          "Accepted commitment completion is missing its deterministic receipt binding.",
        );
      }
      const result = sqlite.prepare(`UPDATE campaign_play_commitments SET
        status = 'completed', completion_turn_id = ?, completion_receipt_id = ?,
        world_version = ?, updated_at = ?
        WHERE campaign_id = ? AND commitment_id = ? AND status = 'active'`)
        .run(
          input.turnId,
          receiptId,
          commitment.worldVersion,
          input.createdAt,
          campaignId,
          commitment.commitmentId,
        );
      if (result.changes !== 1) {
        throw new CampaignPlayRulebookExecutionError(
          "execution_contract_invalid",
          "Commitment completion did not update exactly one active commitment.",
        );
      }
      return;
    }
    case "decision_resolve":
      if (causalEventId === null) {
        throw new CampaignPlayRulebookExecutionError(
          "execution_contract_invalid",
          "Decision resolution requires its deterministic causal event identity.",
        );
      }
      {
        const result = sqlite.prepare(`UPDATE campaign_play_decisions
          SET status = ?, resolved_at = ?, resolution_turn_id = ?,
            resolution_event_id = ?, world_version = ?, updated_at = ?
          WHERE campaign_id = ? AND decision_key = ? AND status = 'open'`)
          .run(
            command.disposition === "accept" ? "accepted" : "declined",
            input.createdAt,
            input.turnId,
            causalEventId,
            resultWorldVersion,
            input.createdAt,
            campaignId,
            command.decisionKey,
          );
        if (result.changes !== 1) {
          throw new CampaignPlayRulebookExecutionError(
            "execution_contract_invalid",
            "Decision resolution did not update exactly one open decision.",
          );
        }
      }
      return;
  }
}

export function executeCampaignPlayRulebookBatch(
  input: ExecuteCampaignPlayRulebookInput,
): ExecutedCampaignPlayRulebookBatch {
  const { accepted, context, frame, turnId, createdAt } = input;
  const mutationCount = accepted.batch.commands.filter((command) =>
    CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].mechanicalMutation).length;
  const createsPlayer = accepted.batch.commands.some((command) =>
    command.kind === "create_player_actor");
  if (
    accepted.checkpoints.length !== accepted.batch.commands.length + 1
    || acceptedRulebookSeals.get(accepted) !== acceptedRulebookSeal(
      accepted.batch,
      accepted.checkpoints,
    )
    || context.campaignId !== frame.campaignId
    || context.priorWorldVersion !== accepted.batch.baseWorldVersion
    || context.targetWorldVersion !== context.priorWorldVersion + mutationCount
    || (createsPlayer ? turnId !== null : turnId === null)
  ) {
    throw new CampaignPlayRulebookExecutionError(
      "execution_contract_invalid",
      "Rulebook execution context does not match its accepted batch.",
    );
  }

  const receiptIds: string[] = [];
  const eventIds: string[] = [];
  let priorHash = mechanicalHash(frame, accepted.checkpoints[0]!);
  if (priorHash !== context.mechanicalHash()) {
    throw new CampaignPlayRulebookExecutionError(
      "mechanical_hash_mismatch",
      "Rulebook base hash differs from persisted mechanical truth.",
    );
  }

  for (const [index, command] of accepted.batch.commands.entries()) {
    input.injectFault?.({ kind: "before_command", commandIndex: index });
    const expectedCommandId = deriveCampaignPlayCommandId(
      frame.campaignId,
      command.kind === "create_player_actor" ? null : turnId,
      accepted.batch.batchId,
      index,
    );
    if (command.commandId !== expectedCommandId) {
      throw new CampaignPlayRulebookExecutionError(
        "execution_contract_invalid",
        `Command ${index} does not carry its code-owned deterministic identity.`,
      );
    }
    const before = accepted.checkpoints[index]!;
    const after = accepted.checkpoints[index + 1]!;
    const mutates = CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].mechanicalMutation;
    const resultHash = mutates ? mechanicalHash(frame, after) : priorHash;
    const receiptId = deriveCampaignPlayReceiptId(frame.campaignId, turnId, accepted.batch.batchId, index);
    const causalEventId = deriveCampaignPlayEventId(frame.campaignId, turnId, accepted.batch.batchId, index);
    const argumentsPayload = commandArguments(command);
    const commandPayloadJson = canonicalizeCampaignPlayProjection(argumentsPayload);
    const sourceJson = canonicalizeCampaignPlayProjection(command.source);
    const eventPayload = { before, after };
    const parentEventId = command.causalParent.kind === "world_event"
      ? command.causalParent.eventId
      : command.causalParent.kind === "command"
        ? eventIds[command.order - 1] ?? null
        : null;

    context.sqlite.prepare(`INSERT INTO campaign_play_commands
      (command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version, read_scope_json,
        write_scope_json, exposure_policy_json, arguments_hash, protected_payload_json,
        protected_payload_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(command.commandId, frame.campaignId, command.kind === "create_player_actor" ? null : turnId,
        accepted.batch.batchId, index, command.kind,
        canonicalizeCampaignPlayProjection(command.causalParent), sourceJson,
        command.expectedWorldVersion, canonicalizeCampaignPlayProjection(command.readScope),
        canonicalizeCampaignPlayProjection(command.writeScope),
        canonicalizeCampaignPlayProjection(command.exposure),
        hashCampaignPlayProjection(argumentsPayload),
        commandPayloadJson,
        hashCampaignPlayProjection(argumentsPayload),
        createdAt);

    if (command.kind === "create_player_actor") {
      applyStoredMutation(input, command, receiptId, after.worldVersion);
    }
    context.sqlite.prepare(`INSERT INTO campaign_play_receipts
      (receipt_id, campaign_id, turn_id, command_id, command_kind, outcome,
        applied_world_mutation, prior_world_version, result_world_version,
        prior_world_hash, result_world_hash, causal_event_ids_json,
        protected_payload_json, protected_payload_hash, created_at)
      VALUES (?, ?, ?, ?, ?, 'applied', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(receiptId, frame.campaignId, command.kind === "create_player_actor" ? null : turnId,
        command.commandId, command.kind, mutates ? 1 : 0, before.worldVersion, after.worldVersion,
        priorHash, resultHash, canonicalizeCampaignPlayProjection([causalEventId]),
        commandPayloadJson,
        hashCampaignPlayProjection(argumentsPayload),
        createdAt);

    const appliesBeforeEvent = (
      command.kind === "adjust_actor_possession"
      || command.kind === "incur_actor_obligation"
      || command.kind === "pay_actor_obligation"
      || command.kind === "settle_player_receivable"
      || command.kind === "materialize_support_actor"
      || command.kind === "decision_open"
      || command.kind === "create_player_commitment"
      || (command.kind === "move_actor" && command.materializedLocalScene !== undefined)
    );
    if (appliesBeforeEvent) {
      applyStoredMutation(input, command, receiptId, after.worldVersion, causalEventId);
    }

    const affectedRefs = eventAffectedRefs(input.frame, command, before, after);
    context.sqlite.prepare(`INSERT INTO campaign_play_events
      (event_id, campaign_id, turn_id, command_id, receipt_id, parent_event_id,
        event_kind, source_json, world_time_minutes, world_version, affected_refs_json,
        before_payload_json, after_payload_json, payload_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(causalEventId, frame.campaignId, command.kind === "create_player_actor" ? null : turnId,
        command.commandId, receiptId, parentEventId, eventKind(command), sourceJson,
        after.worldTimeMinutes ?? 0, after.worldVersion,
        canonicalizeCampaignPlayProjection(affectedRefs),
        canonicalizeCampaignPlayProjection(eventPayload.before),
        canonicalizeCampaignPlayProjection(eventPayload.after),
        hashCampaignPlayProjection(eventPayload),
        createdAt);

    if (command.exposure.mode === "projectable") {
      for (const [exposureIndex, predicate] of command.exposure.predicates.entries()) {
        const exposureId = stableRulebookId("exposure", {
          campaignId: frame.campaignId,
          eventId: causalEventId,
          exposureIndex,
        });
        context.sqlite.prepare(`INSERT INTO campaign_play_event_exposures
          (exposure_id, campaign_id, event_id, channel, location_id, route_id,
            witness_actor_id, valid_until_world_time_minutes, route_triggers_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(exposureId, frame.campaignId, causalEventId, predicate.channel,
            "locationId" in predicate ? predicate.locationId : null,
            "routeId" in predicate ? predicate.routeId : null,
            "witnessActorId" in predicate ? predicate.witnessActorId : null,
            "validUntilWorldTimeMinutes" in predicate ? predicate.validUntilWorldTimeMinutes : null,
            "triggers" in predicate ? canonicalizeCampaignPlayProjection(predicate.triggers) : null,
            createdAt);
      }
    }
    if (
      command.kind !== "create_player_actor"
      && command.kind !== "adjust_actor_possession"
      && command.kind !== "incur_actor_obligation"
      && command.kind !== "pay_actor_obligation"
      && command.kind !== "settle_player_receivable"
      && command.kind !== "materialize_support_actor"
      && command.kind !== "decision_open"
      && command.kind !== "create_player_commitment"
      && !(command.kind === "move_actor" && command.materializedLocalScene !== undefined)
    ) {
      applyStoredMutation(
        input,
        command,
        receiptId,
        after.worldVersion,
        command.kind === "decision_resolve" || command.kind === "complete_player_commitment"
          ? causalEventId
          : null,
      );
    }
    const observedHash = context.mechanicalHash();
    if (observedHash !== resultHash) {
      throw new CampaignPlayRulebookExecutionError(
        "mechanical_hash_mismatch",
        `Command ${command.commandId} produced a mechanical hash outside its accepted checkpoint.`,
      );
    }
    priorHash = resultHash;
    receiptIds.push(receiptId);
    eventIds.push(causalEventId);
    input.injectFault?.({ kind: "after_command", commandIndex: index });
  }

  const ledgerCounts = context.sqlite.prepare(`SELECT
    (SELECT count(*) FROM campaign_play_commands WHERE campaign_id = ? AND batch_id = ?) AS commands,
    (SELECT count(*) FROM campaign_play_receipts r JOIN campaign_play_commands c ON c.command_id = r.command_id
      WHERE r.campaign_id = ? AND c.batch_id = ?) AS receipts,
    (SELECT count(*) FROM campaign_play_events e JOIN campaign_play_commands c ON c.command_id = e.command_id
      WHERE e.campaign_id = ? AND c.batch_id = ?) AS events`)
    .get(
      frame.campaignId, accepted.batch.batchId,
      frame.campaignId, accepted.batch.batchId,
      frame.campaignId, accepted.batch.batchId,
    ) as { commands: number; receipts: number; events: number };
  if (
    ledgerCounts.commands !== accepted.batch.commands.length
    || ledgerCounts.receipts !== accepted.batch.commands.length
    || ledgerCounts.events !== accepted.batch.commands.length
  ) {
    throw new CampaignPlayRulebookExecutionError(
      "execution_contract_invalid",
      "Rulebook ledger is incomplete at the transaction boundary.",
    );
  }
  input.injectFault?.({ kind: "before_commit", commandIndex: null });
  return {
    batchId: accepted.batch.batchId,
    commandIds: accepted.batch.commands.map((command) => command.commandId),
    receiptIds,
    eventIds,
    priorWorldVersion: context.priorWorldVersion,
    resultWorldVersion: context.targetWorldVersion,
    resultWorldHash: priorHash,
  };
}
