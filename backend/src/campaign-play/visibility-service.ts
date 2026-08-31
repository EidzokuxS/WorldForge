import {
  CAMPAIGN_PLAY_DEFAULT_WAIT_MINUTES,
  CAMPAIGN_PLAY_LIMITS,
  type CampaignPlayActionContext,
  type CampaignPlayAvailableIntent,
  type CampaignPlayConsequence,
  type CampaignPlayDecisionAcceptEffect,
  type CampaignPlayDecisionObservation,
  type CampaignPlayDecisionOutcome,
  type CampaignPlayJournalEntry,
  type CampaignPlayNarratorPacket,
  type CampaignPlayOpeningDecision,
  type CampaignPlayVisibleActor,
  type CampaignPlayVisibleCommitment,
  type CampaignPlayVisibleLocation,
  type CampaignPlayVisibleObligation,
  type CampaignPlayVisiblePossession,
  type CampaignPlayVisiblePressure,
  type CampaignPlayVisibleRoute,
} from "@worldforge/shared";
import {
  campaignPlayActionExecutionRouteSchema,
  campaignPlayActionContextSchema,
  campaignPlayDecisionAcceptEffectSchema,
  campaignPlayDecisionObservationSchema,
  campaignPlayJudgeArtifactSchema,
  campaignPlayJournalEntrySchema,
  campaignPlayNarratorPacketSchema,
  campaignPlayOpeningDecisionSchema,
} from "./contracts.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayPublicHandle,
  deriveCampaignPlayPossessionKey,
  hashCampaignPlayProjection,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";
import {
  createCampaignPlayTurnRepository,
  hashCampaignPlayNarratorPacket,
  type CampaignPlayWorkerLeaseToken,
  type LoadedCampaignPlayTurn,
} from "./campaign-play-turn-repository.js";
import {
  campaignPlayOpeningArtifactSchema,
  type CampaignPlayOpeningExposureSeed,
} from "./opening-planner.js";

type ExposureChannel =
  | "direct_perception"
  | "local_aftermath"
  | "route_state"
  | "witness_report";
type RouteTrigger = "inspect" | "attempt" | "traverse";

interface VisibilityStateRow {
  acceptedWorldVersion: number;
  worldVersion: number;
  runtimeRevision: number;
  worldTimeMinutes: number;
}

interface ActorRow {
  id: string;
  kind: "person";
  controller: "human" | "agent";
  name: string;
}

interface LocationRow {
  id: string;
  name: string;
  description: string;
}

interface ExposureRow {
  exposureId: string;
  eventId: string;
  channel: ExposureChannel;
  locationId: string | null;
  routeId: string | null;
  witnessActorId: string | null;
  validUntilWorldTimeMinutes: number | null;
  routeTriggersJson: string | null;
  eventTurnId: string | null;
  eventKind: string;
  eventSourceJson: string;
  eventAffectedRefsJson: string;
  eventWorldTimeMinutes: number;
  eventWorldVersion: number;
  eventAfterPayloadJson: string | null;
  eventOrder: number;
  commandKind: string;
  commandPayloadJson: string;
  commandReadScopeJson: string;
  commandWriteScopeJson: string;
  commandExposurePolicyJson: string;
}

interface OpeningPressureContract {
  actorId: string;
  pressureId: string;
  locationId: string;
  summary: string;
}

type OpeningPressureObservation = OpeningPressureContract;

interface EpistemicCandidate {
  actorId: string;
  exposure: ExposureRow;
  source: Record<string, unknown>;
  sourceHash: string;
  learnedAtWorldTimeMinutes: number;
  perceivedActorId: string | null;
  earnedEventOrder: number;
}

interface InteractionPoint {
  eventOrder: number;
  createdAt: number;
}

interface StoredObservationRow {
  observationId: string;
  worldTimeMinutes: number;
  publicEntryJson: string;
}

interface StoredPlayerTurnRow {
  turnId: string;
}

interface CampaignPlayDecisionRow {
  decisionKey: string;
  actorHandle: string;
  actorName: string;
  kind: "yes_no" | "offer" | "demand";
  status: "open" | "accepted" | "declined";
  sourceTurnId: string;
  summary: string;
  acceptLabel: string;
  declineLabel: string;
  acceptEffectJson: string | null;
  resolutionTurnId: string | null;
  resolutionEventId: string | null;
  worldVersion: number;
}

interface CampaignPlayCommitmentRow {
  commitmentId: string;
  counterpartyActorId: string;
  counterpartyName: string;
  counterpartyKind: "person";
  counterpartyController: "human" | "agent";
  kind: "paid_delivery" | "unpaid_delivery";
  status: "active" | "completed";
  title: string;
  subjectName: string;
  destinationHandle: string;
  feeUnit: "copper" | null;
  feeAmount: number | null;
  paymentTiming: "on_completion" | null;
  dueWorldTimeMinutes: number | null;
}

export interface ProjectCampaignPlayVisibilityInput {
  token: CampaignPlayWorkerLeaseToken;
  actionContext: CampaignPlayActionContext | null;
  sourceMoment: string | null;
  committedAt: number;
  mutationId: string;
}

export interface CampaignPlayVisibilityResult {
  turn: LoadedCampaignPlayTurn;
  packet: CampaignPlayNarratorPacket;
  knowledgeInserted: number;
  observationsInserted: number;
}

export interface CampaignPlayVisibilityService {
  projectTurn(input: ProjectCampaignPlayVisibilityInput): CampaignPlayVisibilityResult;
}

export class CampaignPlayVisibilityError extends Error {
  constructor(
    readonly code:
      | "visibility_state_invalid"
      | "visibility_turn_invalid"
      | "visibility_projection_invalid",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignPlayVisibilityError";
  }
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}:${hashCampaignPlayProjection(value).slice(0, 40)}`;
}

function publicHandle(kind: string, campaignId: string, id: string): string {
  return deriveCampaignPlayPublicHandle(kind, campaignId, id);
}

function parseRecord(value: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      `${label} must be a JSON object.`,
    );
  }
  return parsed as Record<string, unknown>;
}

function parseRecordArray(value: string, label: string): Record<string, unknown>[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((entry) =>
    !entry || typeof entry !== "object" || Array.isArray(entry))) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      `${label} must be a JSON object array.`,
    );
  }
  return parsed as Record<string, unknown>[];
}

function parseDecisionAcceptEffect(
  acceptEffectJson: string | null,
): CampaignPlayDecisionAcceptEffect | null {
  if (acceptEffectJson === null) return null;
  try {
    return campaignPlayDecisionAcceptEffectSchema.parse(JSON.parse(acceptEffectJson));
  } catch (cause) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      "Decision accept effect is not a valid durable effect.",
      { cause },
    );
  }
}

function openingPressureObservation(
  handle: CampaignPlayDatabaseHandle,
  exposure: ExposureRow,
  contract: OpeningPressureContract,
): OpeningPressureObservation | null {
  if (exposure.commandKind !== "record_world_event") {
    return null;
  }
  const source = parseRecord(exposure.eventSourceJson, "Event source");
  if (source.kind !== "system" || source.system !== "opening_bootstrap") return null;
  const payload = parseRecord(exposure.commandPayloadJson, "Command payload");
  if (
    payload.eventClass !== "discovery" ||
    payload.performingActorId !== null ||
    payload.observableTrace !== null
  ) return null;
  if (exposure.channel !== "direct_perception") {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      "Opening pressure exposure must use direct perception.",
    );
  }
  const affectedRefs = parseRecordArray(
    exposure.eventAffectedRefsJson,
    "Event affected references",
  );
  const commandReadScope = parseRecordArray(
    exposure.commandReadScopeJson,
    "Opening pressure command read scope",
  );
  const commandWriteScope = parseRecordArray(
    exposure.commandWriteScopeJson,
    "Opening pressure command write scope",
  );
  const commandExposure = parseRecord(
    exposure.commandExposurePolicyJson,
    "Opening pressure command exposure policy",
  );
  const actorIds = affectedRefs.flatMap((reference) =>
    reference.kind === "actor" && typeof reference.id === "string" ? [reference.id] : []);
  const locationIds = affectedRefs.flatMap((reference) =>
    reference.kind === "location" && typeof reference.id === "string" ? [reference.id] : []);
  const pressureIds = affectedRefs.flatMap((reference) =>
    reference.kind === "pressure" && typeof reference.id === "string" ? [reference.id] : []);
  if (
    typeof payload.summary !== "string"
    || exposure.locationId === null
    || affectedRefs.length !== 3
    || actorIds.length !== 1
    || new Set(actorIds).size !== 1
    || locationIds.length !== 1
    || new Set(locationIds).size !== 1
    || locationIds[0] !== exposure.locationId
    || pressureIds.length !== 1
    || new Set(pressureIds).size !== 1
  ) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      "Opening pressure exposure does not match its participant contract.",
    );
  }
  if (
    actorIds[0] !== contract.actorId
    || locationIds[0] !== contract.locationId
    || pressureIds[0] !== contract.pressureId
    || exposure.locationId !== contract.locationId
    || payload.summary !== contract.summary
    || actorLocationFromSnapshot(exposure.eventAfterPayloadJson, contract.actorId)
      !== contract.locationId
  ) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      "Opening pressure exposure must match the accepted opening actor, scene, and selected pressure.",
    );
  }
  const expectedRefs = [
    { kind: "actor", id: contract.actorId },
    { kind: "location", id: contract.locationId },
    { kind: "pressure", id: contract.pressureId },
  ];
  const expectedExposure = {
    mode: "projectable",
    predicates: [{
      channel: "direct_perception",
      locationId: contract.locationId,
    }],
  };
  if (
    canonicalizeCampaignPlayProjection(affectedRefs)
      !== canonicalizeCampaignPlayProjection(expectedRefs)
    || canonicalizeCampaignPlayProjection(commandReadScope)
      !== canonicalizeCampaignPlayProjection(expectedRefs)
    || commandWriteScope.length !== 0
    || canonicalizeCampaignPlayProjection(commandExposure)
      !== canonicalizeCampaignPlayProjection(expectedExposure)
  ) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      "Opening pressure exposure does not match its durable command authority.",
    );
  }
  const pressure = handle.sqlite.prepare(`SELECT pressure.id, pressure.description
    FROM world_pressure_locations anchor
    JOIN world_pressures pressure ON pressure.id = anchor.pressure_id
      AND pressure.campaign_id = anchor.campaign_id
    JOIN campaign_play_pressure_states state ON state.pressure_id = pressure.id
      AND state.campaign_id = anchor.campaign_id
    WHERE anchor.campaign_id = ? AND anchor.location_id = ?
      AND pressure.id = ?`).get(
        handle.campaignId,
        exposure.locationId,
        pressureIds[0],
      ) as { id: string; description: string } | undefined;
  if (!pressure || pressure.id !== contract.pressureId || pressure.description !== contract.summary) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      "Opening pressure exposure does not name one canonical local pressure with its description.",
    );
  }
  return { ...contract };
}

function openingPremiseParticipants(
  handle: CampaignPlayDatabaseHandle,
  exposure: ExposureRow,
  openingPressureContract: OpeningPressureContract,
): Set<string> | null {
  if (exposure.channel !== "direct_perception" || exposure.commandKind !== "record_world_event") {
    return null;
  }
  const pressureObservation = openingPressureObservation(
    handle,
    exposure,
    openingPressureContract,
  );
  if (pressureObservation !== null) return new Set([pressureObservation.actorId]);
  const source = parseRecord(exposure.eventSourceJson, "Event source");
  const payload = parseRecord(exposure.commandPayloadJson, "Command payload");
  const affectedRefs = parseRecordArray(
    exposure.eventAffectedRefsJson,
    "Event affected references",
  );
  const actorIds = affectedRefs.flatMap((reference) =>
    reference.kind === "actor" && typeof reference.id === "string" ? [reference.id] : []);
  const locationIds = affectedRefs.flatMap((reference) =>
    reference.kind === "location" && typeof reference.id === "string" ? [reference.id] : []);
  if (source.kind !== "system" || source.system !== "opening_bootstrap") return null;
  if (
    (payload.eventClass !== "dialogue" && payload.eventClass !== "interaction")
    || typeof payload.performingActorId !== "string"
    || exposure.locationId === null
  ) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      "Opening premise exposure does not match its participant contract.",
    );
  }
  if (!(actorIds.length === 2
      && new Set(actorIds).size === 2
      && actorIds.includes(payload.performingActorId)
      && locationIds.length === 1
      && locationIds[0] === exposure.locationId)) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      "Opening premise exposure does not name exactly its two participants and scene.",
    );
  }
  return new Set(actorIds);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function timeLabel(worldTimeMinutes: number): string {
  const day = Math.floor(worldTimeMinutes / 1_440) + 1;
  const minuteOfDay = worldTimeMinutes % 1_440;
  const hours = Math.floor(minuteOfDay / 60).toString().padStart(2, "0");
  const minutes = (minuteOfDay % 60).toString().padStart(2, "0");
  return `Day ${day}, ${hours}:${minutes}`;
}

function actorLocationFromSnapshot(
  afterPayloadJson: string | null,
  actorId: string,
): string | null {
  if (!afterPayloadJson) return null;
  const snapshot = parseRecord(afterPayloadJson, "Event after-payload");
  const placements = snapshot.placements;
  if (!Array.isArray(placements)) return null;
  for (const placement of placements) {
    if (!placement || typeof placement !== "object" || Array.isArray(placement)) continue;
    const row = placement as Record<string, unknown>;
    if (
      row.actorId === actorId && row.placementKind === "present" &&
      typeof row.locationId === "string"
    ) return row.locationId;
  }
  return null;
}

function eventSourceActorId(exposure: ExposureRow): string | null {
  const source = parseRecord(exposure.eventSourceJson, "Event source");
  return source.kind === "actor" && typeof source.actorId === "string"
    ? source.actorId
    : null;
}

function currentActorLocations(
  handle: CampaignPlayDatabaseHandle,
): Map<string, string> {
  const rows = handle.sqlite.prepare(`SELECT actor_id AS actorId, location_id AS locationId
    FROM actor_placements WHERE campaign_id = ? AND placement_kind = 'present'
    ORDER BY actor_id`).all(handle.campaignId) as Array<{
      actorId: string;
      locationId: string;
    }>;
  return new Map(rows.map((row) => [row.actorId, row.locationId]));
}

function interactionEvidence(
  handle: CampaignPlayDatabaseHandle,
  turnId: string,
): Map<string, Map<RouteTrigger, number[]>> {
  const rows = handle.sqlite.prepare(`SELECT c.command_kind AS commandKind,
      c.source_json AS sourceJson, c.protected_payload_json AS payloadJson,
      event.rowid AS eventOrder
    FROM campaign_play_commands c
    JOIN campaign_play_receipts r ON r.command_id = c.command_id
      AND r.campaign_id = c.campaign_id AND r.outcome = 'applied'
    JOIN campaign_play_events event ON event.command_id = c.command_id
      AND event.campaign_id = c.campaign_id
    WHERE c.campaign_id = ? AND c.turn_id = ?
    ORDER BY c.command_order, c.command_id`).all(handle.campaignId, turnId) as Array<{
      commandKind: string;
      sourceJson: string;
      payloadJson: string;
      eventOrder: number;
    }>;
  const evidence = new Map<string, Map<RouteTrigger, number[]>>();
  for (const row of rows) {
    const source = parseRecord(row.sourceJson, "Command source");
    const payload = parseRecord(row.payloadJson, "Command payload");
    if (source.kind !== "actor" || typeof source.actorId !== "string") continue;
    const routeId = typeof payload.routeId === "string"
      ? payload.routeId
      : Array.isArray(payload.affectedRefs)
        ? (payload.affectedRefs as unknown[]).find((value) =>
          !!value && typeof value === "object" && !Array.isArray(value) &&
          (value as Record<string, unknown>).kind === "route") as Record<string, unknown> | undefined
        : undefined;
    const resolvedRouteId = typeof routeId === "string"
      ? routeId
      : typeof routeId?.id === "string" ? routeId.id : null;
    if (!resolvedRouteId) continue;
    let trigger: RouteTrigger | null = null;
    if (row.commandKind === "move_actor") trigger = "traverse";
    if (row.commandKind === "set_route_state") trigger = "attempt";
    if (row.commandKind === "record_world_event") {
      if (payload.eventClass === "discovery") trigger = "inspect";
      if (payload.eventClass === "interaction") trigger = "attempt";
    }
    if (!trigger) continue;
    const key = `${source.actorId}\u0000${resolvedRouteId}`;
    const triggers = evidence.get(key) ?? new Map<RouteTrigger, number[]>();
    const orders = triggers.get(trigger) ?? [];
    orders.push(row.eventOrder);
    triggers.set(trigger, orders);
    evidence.set(key, triggers);
  }
  return evidence;
}

function contactedWitnesses(
  handle: CampaignPlayDatabaseHandle,
  turnId: string,
  humanActorId: string,
): Map<string, InteractionPoint[]> {
  const rows = handle.sqlite.prepare(`SELECT c.protected_payload_json AS payloadJson,
      event.after_payload_json AS eventAfterPayloadJson,
      event.rowid AS eventOrder, event.created_at AS createdAt
    FROM campaign_play_commands c
    JOIN campaign_play_receipts r ON r.command_id = c.command_id
      AND r.campaign_id = c.campaign_id AND r.outcome = 'applied'
    JOIN campaign_play_events event ON event.command_id = c.command_id
      AND event.campaign_id = c.campaign_id
    WHERE c.campaign_id = ? AND c.turn_id = ? AND c.command_kind = 'record_world_event'
      AND json_extract(c.source_json, '$.kind') = 'actor'
      AND json_extract(c.source_json, '$.actorId') = ?
    ORDER BY c.command_order, c.command_id`).all(
      handle.campaignId,
      turnId,
      humanActorId,
    ) as Array<{
      payloadJson: string;
      eventAfterPayloadJson: string;
      eventOrder: number;
      createdAt: number;
    }>;
  const contacts = new Map<string, InteractionPoint[]>();
  for (const row of rows) {
    const payload = parseRecord(row.payloadJson, "Contact command payload");
    if (payload.eventClass !== "dialogue" && payload.eventClass !== "interaction") continue;
    if (typeof payload.performingActorId !== "string" || payload.performingActorId === humanActorId) continue;
    const humanLocation = actorLocationFromSnapshot(row.eventAfterPayloadJson, humanActorId);
    const witnessLocation = actorLocationFromSnapshot(row.eventAfterPayloadJson, payload.performingActorId);
    if (humanLocation && witnessLocation === humanLocation) {
      const points = contacts.get(payload.performingActorId) ?? [];
      points.push({ eventOrder: row.eventOrder, createdAt: row.createdAt });
      contacts.set(payload.performingActorId, points);
    }
  }
  return contacts;
}

function entryEvidence(handle: CampaignPlayDatabaseHandle): Map<string, number[]> {
  const rows = handle.sqlite.prepare(`SELECT event.rowid AS eventOrder,
      event.after_payload_json AS afterPayloadJson,
      json_extract(command.protected_payload_json, '$.actorId') AS actorId
    FROM campaign_play_events event
    JOIN campaign_play_commands command ON command.command_id = event.command_id
      AND command.campaign_id = event.campaign_id
    WHERE event.campaign_id = ?
      AND event.event_kind IN ('actor_moved', 'player_placement_initialized')
    ORDER BY event.rowid`).all(handle.campaignId) as Array<{
      eventOrder: number;
      afterPayloadJson: string;
      actorId: string;
    }>;
  const evidence = new Map<string, number[]>();
  for (const row of rows) {
    const locationId = actorLocationFromSnapshot(row.afterPayloadJson, row.actorId);
    if (!locationId) continue;
    const key = `${row.actorId}\u0000${locationId}`;
    const orders = evidence.get(key) ?? [];
    orders.push(row.eventOrder);
    evidence.set(key, orders);
  }
  return evidence;
}

function epistemicSource(
  exposure: ExposureRow,
  perceivedActorId: string | null,
  trigger?: RouteTrigger,
): Record<string, unknown> {
  if (exposure.channel === "direct_perception") {
    return {
      channel: exposure.channel,
      locationId: exposure.locationId!,
      perceivedActorId,
    };
  }
  if (exposure.channel === "local_aftermath") {
    return { channel: exposure.channel, locationId: exposure.locationId! };
  }
  if (exposure.channel === "route_state") {
    return { channel: exposure.channel, routeId: exposure.routeId!, trigger: trigger! };
  }
  return { channel: exposure.channel, witnessActorId: exposure.witnessActorId! };
}

function knowledgeKey(candidate: EpistemicCandidate): string {
  return `${candidate.actorId}\u0000${candidate.exposure.eventId}\u0000${candidate.exposure.channel}\u0000${candidate.sourceHash}`;
}

function deriveBaseKnowledge(
  handle: CampaignPlayDatabaseHandle,
  actors: readonly ActorRow[],
  openingPressureContract: OpeningPressureContract,
  exposures: readonly ExposureRow[],
  locations: ReadonlyMap<string, string>,
  routeEvidence: ReadonlyMap<string, Map<RouteTrigger, number[]>>,
  entries: ReadonlyMap<string, number[]>,
  worldTimeMinutes: number,
): EpistemicCandidate[] {
  const candidates = new Map<string, EpistemicCandidate>();
  for (const exposure of exposures) {
    if (exposure.channel === "witness_report") continue;
    const premiseParticipants = openingPremiseParticipants(
      handle,
      exposure,
      openingPressureContract,
    );
    for (const actor of actors) {
      let trigger: RouteTrigger | undefined;
      let earnedEventOrder = exposure.eventOrder;
      let earned = false;
      if (exposure.channel === "direct_perception") {
        earned = actorLocationFromSnapshot(exposure.eventAfterPayloadJson, actor.id) === exposure.locationId
          && (premiseParticipants === null || premiseParticipants.has(actor.id));
      } else if (exposure.channel === "local_aftermath") {
        const entryOrder = entries.get(`${actor.id}\u0000${exposure.locationId}`)
          ?.find((order) => order > exposure.eventOrder);
        earned = entryOrder !== undefined && locations.get(actor.id) === exposure.locationId &&
          exposure.validUntilWorldTimeMinutes !== null &&
          exposure.validUntilWorldTimeMinutes >= worldTimeMinutes;
        if (entryOrder !== undefined) earnedEventOrder = entryOrder;
      } else {
        const available = routeEvidence.get(`${actor.id}\u0000${exposure.routeId}`);
        const permitted = new Set(
          exposure.routeTriggersJson
            ? JSON.parse(exposure.routeTriggersJson) as RouteTrigger[]
            : [],
        );
        trigger = (["inspect", "attempt", "traverse"] as const).find((value) =>
          permitted.has(value) && available?.get(value)?.some((order) =>
            order >= exposure.eventOrder));
        earned = trigger !== undefined;
        if (trigger) {
          earnedEventOrder = available!.get(trigger)!.find((order) =>
            order >= exposure.eventOrder)!;
        }
      }
      if (!earned) continue;
      const perceivedActorId = exposure.channel === "direct_perception"
        ? eventSourceActorId(exposure)
        : null;
      const source = epistemicSource(exposure, perceivedActorId, trigger);
      const candidate: EpistemicCandidate = {
        actorId: actor.id,
        exposure,
        source,
        sourceHash: hashCampaignPlayProjection(source),
        learnedAtWorldTimeMinutes: worldTimeMinutes,
        perceivedActorId,
        earnedEventOrder,
      };
      candidates.set(knowledgeKey(candidate), candidate);
    }
  }
  return [...candidates.values()].sort((left, right) =>
    compareText(knowledgeKey(left), knowledgeKey(right)));
}

function knownEventEvidence(
  handle: CampaignPlayDatabaseHandle,
  planned: readonly EpistemicCandidate[],
): {
  persisted: Map<string, number>;
  planned: Map<string, number>;
} {
  const rows = handle.sqlite.prepare(`SELECT actor_id AS actorId, event_id AS eventId,
      created_at AS createdAt
    FROM campaign_play_actor_knowledge WHERE campaign_id = ?
    ORDER BY actor_id, event_id`).all(handle.campaignId) as Array<{
      actorId: string;
      eventId: string;
      createdAt: number;
    }>;
  const persisted = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.actorId}\u0000${row.eventId}`;
    persisted.set(key, Math.min(persisted.get(key) ?? Number.POSITIVE_INFINITY, row.createdAt));
  }
  const plannedEvidence = new Map<string, number>();
  for (const row of planned) {
    const key = `${row.actorId}\u0000${row.exposure.eventId}`;
    plannedEvidence.set(
      key,
      Math.min(plannedEvidence.get(key) ?? Number.POSITIVE_INFINITY, row.earnedEventOrder),
    );
  }
  return { persisted, planned: plannedEvidence };
}

export function resolveCampaignPlayOpeningObservableTrace(
  seed: CampaignPlayOpeningExposureSeed | null,
  exposure: {
    openingTurnId: string;
    eventTurnId: string | null;
    sourceActorId: string | null;
    channel: ExposureChannel;
    locationId: string | null;
    routeId: string | null;
    witnessActorId: string | null;
    commandKind: string | null;
    observableTrace: unknown;
  },
): string | null {
  if (seed === null) return null;
  if (
    exposure.eventTurnId !== exposure.openingTurnId
    || exposure.sourceActorId !== seed.sourceActorId
    || exposure.channel !== seed.predicate.channel
  ) {
    return null;
  }
  if (
    exposure.commandKind === "record_world_event" &&
    typeof exposure.observableTrace === "string" &&
    exposure.observableTrace !== seed.observableTrace
  ) {
    return null;
  }
  switch (seed.predicate.channel) {
    case "local_aftermath":
      return seed.predicate.locationId === exposure.locationId ? seed.observableTrace : null;
    case "route_state":
      return seed.predicate.routeId === exposure.routeId ? seed.observableTrace : null;
    case "witness_report":
      return seed.predicate.witnessActorId === exposure.witnessActorId ? seed.observableTrace : null;
    case "direct_perception":
      return null;
  }
}

function deriveWitnessKnowledge(
  humanActorId: string,
  exposures: readonly ExposureRow[],
  contacts: ReadonlyMap<string, InteractionPoint[]>,
  knownEvents: ReturnType<typeof knownEventEvidence>,
  worldTimeMinutes: number,
): EpistemicCandidate[] {
  return exposures.flatMap((exposure) => {
    const witnessId = exposure.witnessActorId;
    const key = witnessId ? `${witnessId}\u0000${exposure.eventId}` : "";
    const report = witnessId
      ? contacts.get(witnessId)?.find((point) =>
        point.eventOrder >= exposure.eventOrder && (
          (knownEvents.persisted.get(key) ?? Number.POSITIVE_INFINITY) <= point.createdAt ||
          (knownEvents.planned.get(key) ?? Number.POSITIVE_INFINITY) <= point.eventOrder
        ))
      : undefined;
    if (
      exposure.channel !== "witness_report" || !witnessId ||
      !report
    ) return [];
    const source = epistemicSource(exposure, null);
    return [{
      actorId: humanActorId,
      exposure,
      source,
      sourceHash: hashCampaignPlayProjection(source),
      learnedAtWorldTimeMinutes: worldTimeMinutes,
      perceivedActorId: null,
      earnedEventOrder: report.eventOrder,
    }];
  });
}

export function renderCampaignPlayVisibleActorEvent(input: {
  observableTrace: unknown;
}): string {
  if (typeof input.observableTrace !== "string" || input.observableTrace.trim().length === 0) {
    throw new CampaignPlayVisibilityError(
      "visibility_projection_invalid",
      "A directly perceived autonomous actor event requires its persisted observable trace.",
    );
  }
  return input.observableTrace;
}

function isHumanMovementEvent(
  candidate: EpistemicCandidate,
  humanActorId: string,
): boolean {
  const exposure = candidate.exposure;
  if (exposure.eventKind !== "actor_moved" || exposure.commandKind !== "move_actor") {
    return false;
  }
  const payload = parseRecord(exposure.commandPayloadJson, "Movement command payload");
  return payload.actorId === humanActorId;
}

function publicEntry(
  handle: CampaignPlayDatabaseHandle,
  candidate: EpistemicCandidate,
  humanActorId: string,
  currentTurnId: string,
  openingTurnId: string,
  openingExposureSeed: CampaignPlayOpeningExposureSeed | null,
  humanArrivalObservation = false,
): CampaignPlayJournalEntry {
  const exposure = candidate.exposure;
  const location = exposure.locationId
    ? handle.sqlite.prepare(`SELECT name FROM locations WHERE id = ? AND campaign_id = ?`)
      .get(exposure.locationId, handle.campaignId) as { name: string } | undefined
    : undefined;
  const route = exposure.routeId
    ? handle.sqlite.prepare(`SELECT destination.name AS destinationName,
          COALESCE(state.state, 'open') AS state
        FROM location_edges edge
        JOIN locations destination ON destination.id = edge.to_location_id
        LEFT JOIN campaign_play_route_states state ON state.route_id = edge.id
        WHERE edge.id = ? AND edge.campaign_id = ?`)
      .get(exposure.routeId, handle.campaignId) as {
        destinationName: string;
        state: "open" | "restricted" | "blocked";
      } | undefined
    : undefined;
  const witness = exposure.witnessActorId
    ? handle.sqlite.prepare(`SELECT name FROM actors WHERE id = ? AND campaign_id = ?`)
      .get(exposure.witnessActorId, handle.campaignId) as { name: string } | undefined
    : undefined;
  const observationHandle = publicHandle(
    "observation",
    handle.campaignId,
    `${candidate.actorId}:${exposure.exposureId}:${candidate.sourceHash}`,
  );
  const label = location?.name ?? route?.destinationName ?? witness?.name ?? "Nearby";
  const affectedRefs = parseRecordArray(exposure.eventAffectedRefsJson, "Event affected references");
  const eventSource = parseRecord(exposure.eventSourceJson, "Event source");
  const commandPayload = parseRecord(exposure.commandPayloadJson, "Command payload");
  const playerParticipated = exposure.eventTurnId === currentTurnId && (
    affectedRefs.some((reference) =>
      reference.kind === "actor" && reference.id === humanActorId
    ) || (
      exposure.commandKind === "decision_resolve" &&
      ((eventSource.kind === "system" && eventSource.system === "game_master") ||
        (eventSource.kind === "actor" && eventSource.actorId === humanActorId))
    )
  );
  const performingActorId = exposure.commandKind === "record_world_event"
    ? commandPayload.performingActorId
    : exposure.commandKind === "adjust_actor_possession"
      ? commandPayload.actorId
      : exposure.commandKind === "decision_resolve"
        ? commandPayload.actorId
        : undefined;
  const directlyPerceivedSourceActorId = eventSource.kind === "actor"
    && typeof eventSource.actorId === "string"
    && eventSource.actorId !== humanActorId
    ? eventSource.actorId
    : undefined;
  const attributedActorId = typeof performingActorId === "string"
    ? performingActorId
    : directlyPerceivedSourceActorId;
  const performingActor = exposure.channel === "direct_perception"
    && typeof attributedActorId === "string"
    ? handle.sqlite.prepare(`SELECT id, name FROM actors
        WHERE id = ? AND campaign_id = ? AND kind = 'person'`)
      .get(attributedActorId, handle.campaignId) as { id: string; name: string } | undefined
    : undefined;
  const openingTrace = resolveCampaignPlayOpeningObservableTrace(openingExposureSeed, {
    openingTurnId,
    eventTurnId: exposure.eventTurnId,
    sourceActorId: eventSourceActorId(exposure),
    channel: exposure.channel,
    locationId: exposure.locationId,
    routeId: exposure.routeId,
    witnessActorId: exposure.witnessActorId,
    commandKind: exposure.commandKind,
    observableTrace: commandPayload.observableTrace,
  });
  const playerCaused = eventSourceActorId(exposure) === humanActorId || (
    playerParticipated && eventSource.kind === "system" && eventSource.system === "game_master"
  );
  const commitmentCargoCollect = eventSource.kind === "system"
    && eventSource.system === "commitment_executor"
    && exposure.commandKind === "adjust_actor_possession"
    && typeof commandPayload.possessionKey === "string"
    && commandPayload.possessionKey !== "copper"
    && typeof commandPayload.name === "string"
    && commandPayload.possessionKey === deriveCampaignPlayPossessionKey(commandPayload.name)
    && typeof commandPayload.quantityDelta === "number"
    && Number.isInteger(commandPayload.quantityDelta)
    && commandPayload.quantityDelta > 0
    && affectedRefs.some((reference) =>
      reference.kind === "commitment" && typeof reference.id === "string");
  let title = "Seen nearby";
  let text = "You witnessed a change nearby.";
  let cue: CampaignPlayConsequence["causalCue"] = "direct_perception";
  let decisionOutcome: CampaignPlayDecisionObservation | undefined;
  const playerResolvedDecision =
    (eventSource.kind === "system" && eventSource.system === "game_master") ||
    (eventSource.kind === "actor" && eventSource.actorId === humanActorId);
  if (
    exposure.channel === "direct_perception" && playerParticipated &&
    playerResolvedDecision &&
    exposure.commandKind === "decision_resolve" &&
    (commandPayload.disposition === "accept" || commandPayload.disposition === "decline") &&
    typeof commandPayload.summary === "string" &&
    typeof commandPayload.selectedLabel === "string"
  ) {
    const decisionDisposition = commandPayload.disposition === "accept" ? "accepted" : "declined";
    if (!performingActor) {
      throw new CampaignPlayVisibilityError(
        "visibility_projection_invalid",
        "A decision resolution observation requires its visible actor.",
      );
    }
    decisionOutcome = campaignPlayDecisionObservationSchema.parse({
      decisionKey: commandPayload.decisionKey,
      actorName: performingActor.name,
      actorHandle: typeof commandPayload.actorHandle === "string"
        ? commandPayload.actorHandle
        : publicHandle("actor", handle.campaignId, performingActor.id),
      kind: commandPayload.decisionKind,
      disposition: commandPayload.disposition,
      summary: commandPayload.summary,
      selectedLabel: commandPayload.selectedLabel,
    });
    title = `Decision ${decisionDisposition}`;
    text = `You ${decisionDisposition} the choice presented by ${performingActor.name}: ${commandPayload.summary} Your response was “${commandPayload.selectedLabel}.”`;
  } else if (
    exposure.channel === "direct_perception" && playerParticipated &&
    eventSource.kind === "system" &&
    (eventSource.system === "game_master" || commitmentCargoCollect || (
      eventSource.system === "commitment_executor" &&
      exposure.commandKind === "adjust_actor_possession" &&
      commandPayload.possessionKey === "copper" &&
      commandPayload.name === "Copper" &&
      typeof commandPayload.quantityDelta === "number" &&
      Number.isInteger(commandPayload.quantityDelta) &&
      commandPayload.quantityDelta > 0
    )) &&
    (exposure.commandKind === "record_world_event"
      || exposure.commandKind === "adjust_actor_possession"
      || exposure.commandKind === "incur_actor_obligation"
      || exposure.commandKind === "pay_actor_obligation")
    && typeof commandPayload.summary === "string"
  ) {
    title = "Your action";
    text = commandPayload.summary;
  } else if (
    exposure.channel === "direct_perception" && playerParticipated &&
    eventSource.kind === "system" && eventSource.system === "game_master" &&
    exposure.commandKind === "set_actor_condition" &&
    commandPayload.actorId === humanActorId &&
    typeof commandPayload.summary === "string"
  ) {
    title = "Your condition";
    text = commandPayload.summary;
  } else if (
    exposure.channel === "direct_perception" && playerParticipated
    && eventSource.kind === "system" && eventSource.system === "opening_bootstrap"
    && exposure.commandKind === "record_world_event"
    && typeof commandPayload.summary === "string"
  ) {
    title = "At the start";
    text = commandPayload.summary;
  } else if (
    exposure.channel === "direct_perception"
    && exposure.commandKind === "materialize_support_actor"
    && eventSource.kind === "system"
    && eventSource.system === "game_master"
    && typeof commandPayload.summary === "string"
  ) {
    title = "Seen nearby";
    text = commandPayload.summary;
  } else if (
    exposure.channel === "direct_perception" && exposure.eventKind === "actor_moved" &&
    typeof commandPayload.actorId === "string" && typeof commandPayload.toLocationId === "string"
  ) {
    const movingActor = handle.sqlite.prepare(`SELECT name FROM actors
      WHERE id = ? AND campaign_id = ?`).get(
        commandPayload.actorId,
        handle.campaignId,
      ) as { name: string } | undefined;
    const destination = handle.sqlite.prepare(`SELECT name FROM locations
      WHERE id = ? AND campaign_id = ?`).get(
        commandPayload.toLocationId,
        handle.campaignId,
    ) as { name: string } | undefined;
    if (movingActor && destination) {
      const arrived = exposure.locationId === commandPayload.toLocationId;
      title = humanArrivalObservation && arrived
        ? "You arrived"
        : `${movingActor.name} moved`;
      text = humanArrivalObservation && arrived
        ? `You arrived at ${destination.name}.`
        : arrived
          ? `${movingActor.name} arrived at ${destination.name}.`
          : `${movingActor.name} left for ${destination.name}.`;
    }
  } else if (exposure.channel === "direct_perception"
    && (exposure.commandKind === "record_world_event"
      || exposure.commandKind === "adjust_actor_possession")
    && eventSource.kind === "actor" && typeof eventSource.actorId === "string"
    && eventSource.actorId !== humanActorId) {
    title = "Seen nearby";
    text = renderCampaignPlayVisibleActorEvent({
      observableTrace: exposure.commandKind === "adjust_actor_possession"
        ? commandPayload.summary
        : commandPayload.observableTrace,
    });
  } else if (exposure.channel === "local_aftermath") {
    title = "Signs of change";
    if (openingTrace !== null) {
      text = openingTrace;
    } else if (
      eventSource.kind === "actor"
      && (exposure.commandKind === "record_world_event"
        || exposure.commandKind === "move_actor"
        || exposure.commandKind === "adjust_actor_possession")
    ) {
      const actorTrace = exposure.commandKind === "adjust_actor_possession"
        ? commandPayload.summary
        : commandPayload.observableTrace;
      if (typeof actorTrace !== "string") {
        throw new CampaignPlayVisibilityError(
          "visibility_projection_invalid",
          "An autonomous actor aftermath requires its persisted observable trace.",
        );
      }
      text = actorTrace;
    } else {
      text = "Something changed here before you arrived.";
    }
    cue = "visible_aftermath";
  } else if (exposure.channel === "route_state") {
    title = "Along the route";
    text = openingTrace ?? `The route to ${route?.destinationName ?? "the next place"} is ${route?.state ?? "open"}.`;
    cue = "route_change";
  } else if (exposure.channel === "witness_report") {
    title = `${witness?.name ?? "A witness"}'s account`;
    text = openingTrace ?? `${witness?.name ?? "A witness"} described a change they had witnessed.`;
    cue = "witness_report";
  }
  const consequence: CampaignPlayConsequence = {
    observationHandle,
    performingActorHandle: performingActor
      ? publicHandle("actor", handle.campaignId, performingActor.id)
      : null,
    performingActorName: performingActor?.name ?? null,
    whatChanged: text,
    whereOrRoute: label,
    worldTimeLabel: timeLabel(exposure.eventWorldTimeMinutes),
    causalCue: playerCaused ? "your_action" : cue,
  };
  return campaignPlayJournalEntrySchema.parse({
    observationHandle,
    title,
    text,
    whereOrRoute: label,
    worldTimeLabel: timeLabel(exposure.eventWorldTimeMinutes),
    consequence,
    ...(decisionOutcome === undefined ? {} : { decisionOutcome }),
  });
}

/**
 * The decision_open command is intentionally protected from generic exposure
 * projection.  Opening narration still needs one durable, code-owned fact to
 * cover, so derive a deterministic packet observation from the accepted
 * opening artifact and its persisted decision row.  It is regenerated on
 * reload rather than written into the ordinary observation table.
 */
function openingDecisionPublicObservation(
  handle: CampaignPlayDatabaseHandle,
  turnId: string,
  worldTimeMinutes: number,
  locationName: string,
  decision: CampaignPlayOpeningDecision,
  visibleActors: CampaignPlayVisibleActor[],
): CampaignPlayJournalEntry | null {
  const row = handle.sqlite.prepare(`SELECT
      decision_key AS decisionKey, actor_handle AS actorHandle,
      decision_kind AS kind, status, source_turn_id AS sourceTurnId,
      summary, accept_label AS acceptLabel, decline_label AS declineLabel
    FROM campaign_play_decisions
    WHERE campaign_id = ? AND decision_key = ?`).get(
      handle.campaignId,
      decision.decisionKey,
    ) as {
      decisionKey: string;
      actorHandle: string;
      kind: CampaignPlayOpeningDecision["kind"];
      status: "open" | "accepted" | "declined";
      sourceTurnId: string;
      summary: string;
      acceptLabel: string;
      declineLabel: string;
    } | undefined;
  if (
    !row || row.status !== "open" || row.sourceTurnId !== turnId ||
    row.actorHandle !== decision.actorHandle || row.kind !== decision.kind ||
    row.summary !== decision.summary || row.acceptLabel !== decision.acceptLabel ||
    row.declineLabel !== decision.declineLabel
  ) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      "Opening decision observation requires its matching durable decision.",
    );
  }
  if (!visibleActors.some((actor) => actor.handle === decision.actorHandle)) return null;
  return decisionPublicObservation(
    handle,
    turnId,
    worldTimeMinutes,
    locationName,
    decision,
  );
}

function decisionPublicObservation(
  handle: CampaignPlayDatabaseHandle,
  turnId: string,
  worldTimeMinutes: number,
  locationName: string,
  decision: CampaignPlayOpeningDecision,
): CampaignPlayJournalEntry {
  const observationHandle = publicHandle(
    "observation",
    handle.campaignId,
    `${turnId}:decision-open:${decision.decisionKey}`,
  );
  const text = `${decision.actorName} puts a choice before you: ${decision.summary}`;
  const consequence: CampaignPlayConsequence = {
    observationHandle,
    performingActorHandle: decision.actorHandle,
    performingActorName: decision.actorName,
    whatChanged: text,
    whereOrRoute: locationName,
    worldTimeLabel: timeLabel(worldTimeMinutes),
    causalCue: "direct_perception",
  };
  return campaignPlayJournalEntrySchema.parse({
    observationHandle,
    title: "A choice at hand",
    text,
    whereOrRoute: locationName,
    worldTimeLabel: timeLabel(worldTimeMinutes),
    consequence,
    decision,
  });
}

export function currentTurnDecisionPublicObservations(
  handle: CampaignPlayDatabaseHandle,
  turnId: string,
  worldTimeMinutes: number,
  locationName: string,
  visibleActors: CampaignPlayVisibleActor[],
): CampaignPlayJournalEntry[] {
  const visibleActorHandles = new Set(visibleActors.map((actor) => actor.handle));
  return selectCampaignPlayDecisions(handle, "open")
    .filter((decision) => decision.sourceTurnId === turnId &&
      visibleActorHandles.has(decision.actorHandle))
    .map((decision) => decisionPublicObservation(
      handle,
      turnId,
      worldTimeMinutes,
      locationName,
      campaignPlayOpeningDecisionSchema.parse({
        decisionKey: decision.decisionKey,
        actorName: decision.actorName,
        actorHandle: decision.actorHandle,
        kind: decision.kind,
        summary: decision.summary,
        acceptLabel: decision.acceptLabel,
        declineLabel: decision.declineLabel,
        acceptEffect: parseDecisionAcceptEffect(decision.acceptEffectJson),
      }),
    ));
}

function directlyPerceivedObservationSubjects(
  handle: CampaignPlayDatabaseHandle,
  candidate: EpistemicCandidate,
  humanActorId: string,
  visibleActors: CampaignPlayVisibleActor[],
  observationText: string,
): Array<{ handle: string; name: string }> {
  const exposure = candidate.exposure;
  if (exposure.channel !== "direct_perception" || exposure.locationId === null) return [];
  const eventSource = parseRecord(exposure.eventSourceJson, "Event source");
  const commandPayload = parseRecord(exposure.commandPayloadJson, "Command payload");
  const performingActorId = exposure.commandKind === "record_world_event"
    ? commandPayload.performingActorId
    : exposure.commandKind === "adjust_actor_possession"
      ? commandPayload.actorId
      : undefined;
  const attributedActorId = typeof performingActorId === "string"
    ? performingActorId
    : eventSource.kind === "actor" && typeof eventSource.actorId === "string"
      ? eventSource.actorId
      : undefined;
  const humanConditionActorId = exposure.commandKind === "set_actor_condition" &&
    eventSource.kind === "system" && eventSource.system === "game_master" &&
    commandPayload.actorId === humanActorId
    ? humanActorId
    : undefined;
  const actorIds = [...new Set([
    ...(humanConditionActorId === undefined ? [] : [humanConditionActorId]),
    ...parseRecordArray(exposure.eventAffectedRefsJson, "Event affected references")
      .filter((reference) => reference.kind === "actor"
        && typeof reference.id === "string"
        && reference.id !== humanActorId
        && reference.id !== attributedActorId)
      .map((reference) => reference.id as string),
  ])].filter((actorId) =>
    actorLocationFromSnapshot(exposure.eventAfterPayloadJson, actorId) === exposure.locationId);
  const actors = actorIds.length === 0
    ? []
    : handle.sqlite.prepare(`SELECT id, name FROM actors
        WHERE campaign_id = ? AND kind = 'person' AND id IN (${actorIds.map(() => "?").join(",")})`)
      .all(handle.campaignId, ...actorIds) as Array<{ id: string; name: string }>;
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const subjects = actorIds.flatMap((actorId) => {
    const actor = actorById.get(actorId);
    return actor ? [{ handle: publicHandle("actor", handle.campaignId, actor.id), name: actor.name }] : [];
  });
  const performingActorHandle = typeof attributedActorId === "string"
    ? publicHandle("actor", handle.campaignId, attributedActorId)
    : null;
  visibleActors.forEach((actor) => {
    if (actor.handle === performingActorHandle) return;
    const escapedName = actor.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(
      `(?<![\\p{L}\\p{N}])${escapedName}(?![\\p{L}\\p{N}])`,
      "iu",
    ).test(observationText)) return;
    if (!subjects.some((subject) => subject.handle === actor.handle)) {
      subjects.push({ handle: actor.handle, name: actor.name });
    }
  });
  return subjects;
}

function visibleScene(
  handle: CampaignPlayDatabaseHandle,
  humanActorId: string,
  openingPressureContract: OpeningPressureContract,
  pendingOpeningPressureObservations: readonly OpeningPressureObservation[] = [],
): {
  currentLocation: CampaignPlayVisibleLocation;
  visibleActors: CampaignPlayVisibleActor[];
  visibleRoutes: CampaignPlayVisibleRoute[];
  visiblePressures: CampaignPlayVisiblePressure[];
  possessions: CampaignPlayVisiblePossession[];
  obligations: CampaignPlayVisibleObligation[];
  commitments?: CampaignPlayVisibleCommitment[];
} {
  const location = handle.sqlite.prepare(`SELECT l.id, l.name, l.description
    FROM actor_placements placement JOIN locations l ON l.id = placement.location_id
    WHERE placement.campaign_id = ? AND placement.actor_id = ?
      AND placement.placement_kind = 'present' LIMIT 1`).get(
      handle.campaignId,
      humanActorId,
    ) as LocationRow | undefined;
  if (!location) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      "Visibility projection requires one present player placement.",
    );
  }
  const actors = handle.sqlite.prepare(`SELECT actor.id, actor.kind, actor.controller, actor.name,
      condition.condition
    FROM actor_placements placement JOIN actors actor ON actor.id = placement.actor_id
    LEFT JOIN campaign_play_actor_conditions condition ON condition.actor_id = actor.id
      AND condition.present = 1
    WHERE placement.campaign_id = ? AND placement.location_id = ?
      AND placement.placement_kind = 'present' AND actor.id <> ? AND actor.kind = 'person'
    GROUP BY actor.id ORDER BY actor.name, actor.id LIMIT 8`).all(
      handle.campaignId,
      location.id,
      humanActorId,
    ) as Array<ActorRow & { condition: string | null }>;
  const routes = handle.sqlite.prepare(`SELECT edge.id, edge.to_location_id AS destinationId,
      destination.name AS destinationName, edge.travel_cost AS travelCost,
      COALESCE(state.state, 'open') AS state
    FROM location_edges edge JOIN locations destination ON destination.id = edge.to_location_id
    LEFT JOIN campaign_play_route_states state ON state.route_id = edge.id
    WHERE edge.campaign_id = ? AND edge.from_location_id = ? AND edge.discovered = 1
    ORDER BY destination.name, edge.id LIMIT 8`).all(
      handle.campaignId,
      location.id,
    ) as Array<{
      id: string;
      destinationId: string;
      destinationName: string;
      travelCost: number;
      state: "open" | "restricted" | "blocked";
    }>;
  const persistedPressures = handle.sqlite.prepare(`WITH observed_pressure AS (
      SELECT pressure.id, pressure.name, pressure.urgency,
        json_extract(observation.public_entry_json, '$.text') AS summary,
        ROW_NUMBER() OVER (
          PARTITION BY pressure.id
          ORDER BY observation.world_time_minutes DESC,
            observation.created_at DESC, observation.observation_id DESC
        ) AS recency
      FROM world_pressure_locations anchor
      JOIN world_pressures pressure ON pressure.id = anchor.pressure_id
      JOIN campaign_play_pressure_states state ON state.pressure_id = pressure.id
      JOIN campaign_play_events event ON event.campaign_id = anchor.campaign_id
        AND EXISTS (
          SELECT 1 FROM json_each(event.affected_refs_json) affected
          WHERE json_extract(affected.value, '$.kind') = 'pressure'
            AND json_extract(affected.value, '$.id') = pressure.id
        )
      JOIN campaign_play_observations observation
        ON observation.campaign_id = event.campaign_id
        AND observation.event_id = event.event_id
        AND observation.human_actor_id = ?
      WHERE anchor.campaign_id = ? AND anchor.location_id = ? AND state.status = 'active'
    )
    SELECT id, name, urgency, summary FROM observed_pressure
    WHERE recency = 1 AND typeof(summary) = 'text' AND length(summary) > 0
    ORDER BY urgency DESC, name, id`).all(
      humanActorId,
      handle.campaignId,
      location.id,
    ) as Array<{ id: string; name: string; urgency: number; summary: string }>;
  const pressureById = new Map(persistedPressures.map((pressure) => [pressure.id, pressure]));
  const pendingPressureIds = [...new Set(pendingOpeningPressureObservations
    .filter((observation) => observation.locationId === location.id)
    .map((observation) => observation.pressureId))];
  if (pendingPressureIds.length > 0) {
    const pendingPressures = handle.sqlite.prepare(`SELECT pressure.id,
        pressure.name, pressure.description, pressure.urgency, state.status
      FROM world_pressure_locations anchor
      JOIN world_pressures pressure ON pressure.id = anchor.pressure_id
        AND pressure.campaign_id = anchor.campaign_id
      JOIN campaign_play_pressure_states state ON state.pressure_id = pressure.id
        AND state.campaign_id = anchor.campaign_id
      WHERE anchor.campaign_id = ? AND anchor.location_id = ?
        AND pressure.id IN (${pendingPressureIds.map(() => "?").join(",")})`).all(
          handle.campaignId,
          location.id,
          ...pendingPressureIds,
        ) as Array<{
          id: string;
          name: string;
          description: string;
          urgency: number;
          status: "active" | "resolved";
        }>;
    const pendingPressureById = new Map(pendingPressures.map((pressure) => [pressure.id, pressure]));
    for (const pending of pendingOpeningPressureObservations) {
      if (pending.locationId !== location.id) continue;
      const pressure = pendingPressureById.get(pending.pressureId);
      if (!pressure || pressure.description !== pending.summary) {
        throw new CampaignPlayVisibilityError(
          "visibility_state_invalid",
          "Pending opening pressure observation does not match its canonical local pressure.",
        );
      }
      if (pressure.status !== "active") continue;
      pressureById.set(pending.pressureId, {
        id: pressure.id,
        name: pressure.name,
        urgency: pressure.urgency,
        summary: pending.summary,
      });
    }
  }
  const selectedOpeningPressure = location.id === openingPressureContract.locationId
    ? pressureById.get(openingPressureContract.pressureId)
    : undefined;
  const otherPressures = [...pressureById.values()]
    .filter((pressure) => pressure.id !== selectedOpeningPressure?.id)
    .sort((left, right) => right.urgency - left.urgency ||
      compareText(left.name, right.name) || compareText(left.id, right.id));
  const pressures = [
    ...(selectedOpeningPressure ? [selectedOpeningPressure] : []),
    ...otherPressures,
  ].slice(0, CAMPAIGN_PLAY_LIMITS.visiblePressures);
  const possessions = handle.sqlite.prepare(`SELECT possession_id AS possessionId,
      name, quantity FROM campaign_play_actor_possessions
    WHERE campaign_id = ? AND actor_id = ? AND quantity > 0
    ORDER BY name, possession_id LIMIT ?`).all(
      handle.campaignId,
      humanActorId,
      CAMPAIGN_PLAY_LIMITS.visiblePossessions,
    ) as Array<{ possessionId: string; name: string; quantity: number }>;
  const obligations = handle.sqlite.prepare(`SELECT obligation.obligation_id AS obligationId,
      obligation.debtor_actor_id AS debtorActorId, debtor.name AS debtorName,
      obligation.creditor_actor_id AS creditorActorId, creditor.name AS creditorName,
      obligation.unit_key AS unitKey, obligation.outstanding_amount AS outstandingAmount
    FROM campaign_play_actor_obligations obligation
    JOIN actors debtor ON debtor.id = obligation.debtor_actor_id
      AND debtor.campaign_id = obligation.campaign_id
    JOIN actors creditor ON creditor.id = obligation.creditor_actor_id
      AND creditor.campaign_id = obligation.campaign_id
    WHERE obligation.campaign_id = ?
      AND (obligation.debtor_actor_id = ? OR obligation.creditor_actor_id = ?)
      AND obligation.outstanding_amount > 0
    ORDER BY obligation.debtor_actor_id = ? DESC,
      CASE WHEN obligation.debtor_actor_id = ? THEN creditor.name ELSE debtor.name END,
      obligation.unit_key, obligation.obligation_id LIMIT ?`).all(
      handle.campaignId,
      humanActorId,
      humanActorId,
      humanActorId,
      humanActorId,
      CAMPAIGN_PLAY_LIMITS.visibleObligations,
    ) as Array<{
      obligationId: string;
      debtorActorId: string;
      debtorName: string;
      creditorActorId: string;
      creditorName: string;
      unitKey: "copper";
      outstandingAmount: number;
    }>;
  const commitmentRows = handle.sqlite.prepare(`SELECT
      commitment.commitment_id AS commitmentId,
      commitment.counterparty_actor_id AS counterpartyActorId,
      counterparty.kind AS counterpartyKind,
      counterparty.controller AS counterpartyController,
      counterparty.name AS counterpartyName,
      commitment.kind AS kind, commitment.status AS status,
      commitment.title AS title, commitment.subject_name AS subjectName,
      commitment.destination_handle AS destinationHandle,
      commitment.fee_unit AS feeUnit, commitment.fee_amount AS feeAmount,
      commitment.payment_timing AS paymentTiming,
      commitment.due_world_time_minutes AS dueWorldTimeMinutes
    FROM campaign_play_commitments commitment
    JOIN actors counterparty ON counterparty.id = commitment.counterparty_actor_id
      AND counterparty.campaign_id = commitment.campaign_id
    WHERE commitment.campaign_id = ? AND commitment.performer_actor_id = ?
    ORDER BY CASE commitment.status WHEN 'active' THEN 0 ELSE 1 END,
      COALESCE(commitment.due_world_time_minutes, 2147483647),
      commitment.title, commitment.commitment_id LIMIT ?`).all(
      handle.campaignId,
      humanActorId,
      CAMPAIGN_PLAY_LIMITS.visibleCommitments,
    ) as CampaignPlayCommitmentRow[];
  const destinationRows = handle.sqlite.prepare(`SELECT id, name, description
    FROM locations WHERE campaign_id = ?`).all(handle.campaignId) as LocationRow[];
  const destinations = new Map(destinationRows.map((destination) => [
    publicHandle("location", handle.campaignId, destination.id),
    destination,
  ]));
  const commitments = commitmentRows.map((commitment) => {
    if (
      commitment.counterpartyKind !== "person" ||
      commitment.counterpartyController !== "agent" ||
      (commitment.kind !== "paid_delivery" && commitment.kind !== "unpaid_delivery") ||
      (commitment.status !== "active" && commitment.status !== "completed") ||
      (commitment.kind === "paid_delivery" && (
        commitment.feeUnit !== "copper" ||
        commitment.paymentTiming !== "on_completion" ||
        !Number.isSafeInteger(commitment.feeAmount) ||
        typeof commitment.feeAmount !== "number" || commitment.feeAmount < 1
      )) ||
      (commitment.kind === "unpaid_delivery" && (
        commitment.feeUnit !== null ||
        commitment.feeAmount !== null ||
        commitment.paymentTiming !== null
      )) ||
      (commitment.dueWorldTimeMinutes !== null &&
        (!Number.isSafeInteger(commitment.dueWorldTimeMinutes) ||
          commitment.dueWorldTimeMinutes < 1))
    ) {
      throw new CampaignPlayVisibilityError(
        "visibility_state_invalid",
        "Player commitment does not match its public contract.",
      );
    }
    const destination = destinations.get(commitment.destinationHandle);
    if (!destination) {
      throw new CampaignPlayVisibilityError(
        "visibility_state_invalid",
        "Player commitment destination is not a canonical location handle.",
      );
    }
    const common = {
      handle: publicHandle("commitment", handle.campaignId, commitment.commitmentId),
      status: commitment.status,
      counterpartyHandle: publicHandle(
        "actor",
        handle.campaignId,
        commitment.counterpartyActorId,
      ),
      counterpartyName: commitment.counterpartyName,
      title: commitment.title,
      subjectName: commitment.subjectName,
      destinationHandle: commitment.destinationHandle,
      destinationName: destination.name,
      dueWorldTimeLabel: commitment.dueWorldTimeMinutes === null
        ? null
        : timeLabel(commitment.dueWorldTimeMinutes),
    };
    return commitment.kind === "paid_delivery"
      ? {
          ...common,
          kind: "paid_delivery" as const,
          feeUnit: commitment.feeUnit!,
          feeAmount: commitment.feeAmount!,
          paymentTiming: commitment.paymentTiming!,
        } satisfies CampaignPlayVisibleCommitment
      : {
          ...common,
          kind: "unpaid_delivery" as const,
        } satisfies CampaignPlayVisibleCommitment;
  });
  return {
    currentLocation: {
      handle: publicHandle("location", handle.campaignId, location.id),
      name: location.name,
      description: location.description,
    },
    visibleActors: actors.map((actor) => ({
      handle: publicHandle("actor", handle.campaignId, actor.id),
      name: actor.name,
      monogram: [...actor.name].slice(0, 2).join("").toUpperCase(),
      descriptor: actor.condition ? `Appears ${actor.condition}` : "Person nearby",
      accent: "slate",
    })),
    visibleRoutes: routes.map((route) => ({
      handle: publicHandle("route", handle.campaignId, route.id),
      destinationHandle: publicHandle("location", handle.campaignId, route.destinationId),
      destinationName: route.destinationName,
      state: route.state,
      travelTimeLabel: `${route.travelCost} travel ${route.travelCost === 1 ? "unit" : "units"}`,
    })),
    visiblePressures: pressures.map((pressure) => ({
      handle: publicHandle("pressure", handle.campaignId, pressure.id),
      label: pressure.name,
      summary: pressure.summary,
    })),
    possessions: possessions.map((possession) => ({
      handle: publicHandle("possession", handle.campaignId, possession.possessionId),
      name: possession.name,
      quantity: possession.quantity,
    })),
    obligations: obligations.map((obligation) => ({
      handle: publicHandle("obligation", handle.campaignId, obligation.obligationId),
      direction: obligation.debtorActorId === humanActorId ? "payable" as const : "receivable" as const,
      counterpartyHandle: publicHandle(
        "actor",
        handle.campaignId,
        obligation.debtorActorId === humanActorId
          ? obligation.creditorActorId
          : obligation.debtorActorId,
      ),
      counterpartyName: obligation.debtorActorId === humanActorId
        ? obligation.creditorName
        : obligation.debtorName,
      unitKey: obligation.unitKey,
      outstandingAmount: obligation.outstandingAmount,
    })),
    commitments,
  };
}

export function availableIntents(
  handle: CampaignPlayDatabaseHandle,
  turnId: string,
  actionContext: CampaignPlayActionContext | null,
  scene: ReturnType<typeof visibleScene>,
  humanActorId: string,
  openingExposureSeed: CampaignPlayOpeningExposureSeed | null,
  worldTimeMinutes: number,
): CampaignPlayAvailableIntent[] {
  const campaignId = handle.campaignId;
  const intents: CampaignPlayAvailableIntent[] = [{
    handle: publicHandle("choice", campaignId, `${turnId}:observe`),
    label: "Examine the immediate situation",
    kind: "observe",
    targets: [{ handle: scene.currentLocation.handle, kind: "location" }],
  }];
  const preferredRoute = preferredOpeningExposureRoute(
    handle,
    scene,
    humanActorId,
    openingExposureSeed,
    worldTimeMinutes,
  );
  const routes = scene.visibleRoutes
    .filter((route) => route.state !== "blocked")
    .sort((left, right) => {
      if (left.handle === preferredRoute?.handle) return -1;
      if (right.handle === preferredRoute?.handle) return 1;
      return 0;
    });
  routes.forEach((route) => {
    if (route.state === "open") {
      intents.push({
        handle: publicHandle("choice", campaignId, `${turnId}:move:${route.handle}`),
        label: `Go to ${route.destinationName}`,
        kind: "move",
        targets: [{ handle: route.handle, kind: "route" }],
      });
    }
    const routeAttemptAvailable = actionContext?.disposition !== "clarification_required"
      && route.state === "restricted";
    if (routeAttemptAvailable) {
      intents.push({
        handle: publicHandle("choice", campaignId, `${turnId}:attempt:${route.handle}`),
        label: route.state === "restricted"
          ? `Try to pass toward ${route.destinationName}`
          : `Try a risky approach to ${route.destinationName}`,
        kind: "attempt",
        targets: [{ handle: route.handle, kind: "route" }],
      });
    }
  });
  scene.visibleActors.forEach((actor) => intents.push({
    handle: publicHandle("choice", campaignId, `${turnId}:contact:${actor.handle}`),
    label: `Talk to ${actor.name}`,
    kind: "contact",
    targets: [{ handle: actor.handle, kind: "actor" }],
  }));
  const visibleActorHandles = new Set(scene.visibleActors.map((actor) => actor.handle));
  const visibleAgentActorHandles = new Set(
    (handle.sqlite.prepare(`SELECT id FROM actors
      WHERE campaign_id = ? AND kind = 'person' AND controller = 'agent'`).all(
        campaignId,
      ) as Array<{ id: string }>).map((actor) => publicHandle("actor", campaignId, actor.id)),
  );
  const playerActorHandle = publicHandle("actor", campaignId, humanActorId);
  scene.obligations
    .filter((obligation) =>
      obligation.direction === "receivable"
      && obligation.unitKey === "copper"
      && obligation.outstandingAmount > 0
      && visibleAgentActorHandles.has(obligation.counterpartyHandle)
      && visibleActorHandles.has(obligation.counterpartyHandle),
    )
    .forEach((obligation) => {
      intents.push({
        handle: publicHandle(
          "choice",
          campaignId,
          `${turnId}:obligation:${obligation.handle}:collect`,
        ),
        label: `Collect ${obligation.outstandingAmount} copper from ${obligation.counterpartyName}`,
        kind: "contact",
        targets: [{ handle: obligation.counterpartyHandle, kind: "actor" }],
        obligationBinding: {
          obligationHandle: obligation.handle,
          debtorHandle: obligation.counterpartyHandle,
          creditorHandle: playerActorHandle,
          unitKey: "copper",
          amount: obligation.outstandingAmount,
        },
      });
    });
  const presentConditionActorHandles = new Set(
    (handle.sqlite.prepare(`SELECT actor_id AS actorId
      FROM campaign_play_actor_conditions
      WHERE campaign_id = ? AND present = 1`).all(handle.campaignId) as Array<{ actorId: string }>)
      .map((row) => publicHandle("actor", campaignId, row.actorId)),
  );
  const playerHasPresentCondition = presentConditionActorHandles.has(
    publicHandle("actor", campaignId, humanActorId),
  );
  const openDecisions = selectCampaignPlayDecisions(handle, "open")
    .filter((decision) => visibleActorHandles.has(decision.actorHandle));
  if (openDecisions.length > 0) {
    const maximumDecisionGroups = Math.floor(
      CAMPAIGN_PLAY_LIMITS.suggestedActions / 2,
    );
    if (openDecisions.length > maximumDecisionGroups) {
      throw new CampaignPlayVisibilityError(
        "visibility_state_invalid",
        "Open decision controls exceed the public suggested-action budget.",
      );
    }
    const decisionActors = new Set(openDecisions.map((decision) => decision.actorHandle));
    const contactStart = intents.findIndex((intent) => intent.kind === "contact");
    if (contactStart >= 0) {
      const contacts = intents.splice(contactStart).filter((intent) =>
        intent.kind !== "contact" || !intent.targets.some((target) =>
          target.kind === "actor" && decisionActors.has(target.handle)));
      intents.push(...contacts);
    }
    openDecisions.forEach((decision) => {
      (['accept', 'decline'] as const).forEach((disposition) => {
        intents.push({
          handle: publicHandle(
            "choice",
            campaignId,
            `${turnId}:decision:${decision.decisionKey}:${disposition}`,
          ),
          label: decisionIntentLabel(
            disposition,
            disposition === "accept" ? decision.acceptLabel : decision.declineLabel,
          ),
          kind: "contact",
          targets: [{ handle: decision.actorHandle, kind: "actor" }],
          decisionBinding: {
            decisionKey: decision.decisionKey,
            actorHandle: decision.actorHandle,
            kind: decision.kind,
            disposition,
          },
        });
      });
    });
  }
  scene.commitments?.forEach((commitment) => {
    if (commitment.status !== "active") return;
    const counterparty = scene.visibleActors.find((actor) =>
      actor.handle === commitment.counterpartyHandle);
    const hasCargo = scene.possessions.some((possession) =>
      possession.name === commitment.subjectName && possession.quantity > 0);
    const counterpartyHasPresentCondition = presentConditionActorHandles.has(
      commitment.counterpartyHandle,
    );
    if (counterparty !== undefined && !hasCargo &&
      !playerHasPresentCondition && !counterpartyHasPresentCondition) {
      intents.push({
        handle: publicHandle(
          "choice",
          campaignId,
          `${turnId}:commitment:${commitment.handle}:collect`,
        ),
        label: `Ask ${counterparty.name} for ${commitment.subjectName}`,
        kind: "contact",
        targets: [{ handle: commitment.counterpartyHandle, kind: "actor" }],
        commitmentBinding: {
          commitmentHandle: commitment.handle,
          action: "collect",
          counterpartyHandle: commitment.counterpartyHandle,
          subjectName: commitment.subjectName,
          destinationHandle: commitment.destinationHandle,
        },
      });
    }
    if (hasCargo && scene.currentLocation.handle === commitment.destinationHandle &&
      !playerHasPresentCondition) {
      intents.push({
        handle: publicHandle(
          "choice",
          campaignId,
          `${turnId}:commitment:${commitment.handle}:deliver`,
        ),
        label: `Deliver ${commitment.subjectName} at ${commitment.destinationName}`,
        kind: "attempt",
        targets: [{ handle: commitment.destinationHandle, kind: "location" }],
        commitmentBinding: {
          commitmentHandle: commitment.handle,
          action: "deliver",
          counterpartyHandle: commitment.counterpartyHandle,
          subjectName: commitment.subjectName,
          destinationHandle: commitment.destinationHandle,
        },
      });
    }
  });
  intents.push({
    handle: publicHandle("choice", campaignId, `${turnId}:wait`),
    label: `Wait ${CAMPAIGN_PLAY_DEFAULT_WAIT_MINUTES} minutes`,
    kind: "wait",
    targets: [],
  });
  const dueWorldTimeLabelByCommitmentHandle = new Map(
    (scene.commitments ?? []).map((commitment) => [
      commitment.handle,
      commitment.dueWorldTimeLabel,
    ]),
  );
  return intents
    .map((intent, intentIndex) => ({ intent, intentIndex }))
    .sort((left, right) => {
      const leftDecision = left.intent.decisionBinding;
      const rightDecision = right.intent.decisionBinding;
      const leftCommitment = left.intent.commitmentBinding;
      const rightCommitment = right.intent.commitmentBinding;
      const leftObligation = left.intent.obligationBinding;
      const rightObligation = right.intent.obligationBinding;
      const leftRank = leftObligation !== undefined
        ? 0
        : leftDecision !== undefined
          ? 1
          : leftCommitment !== undefined ? 2 : 3;
      const rightRank = rightObligation !== undefined
        ? 0
        : rightDecision !== undefined
          ? 1
          : rightCommitment !== undefined ? 2 : 3;
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (leftObligation !== undefined && rightObligation !== undefined) {
        return compareText(leftObligation.obligationHandle, rightObligation.obligationHandle) ||
          compareText(left.intent.handle, right.intent.handle);
      }
      if (leftDecision !== undefined && rightDecision !== undefined) {
        return compareText(leftDecision.decisionKey, rightDecision.decisionKey) ||
          (leftDecision.disposition === rightDecision.disposition
            ? 0
            : leftDecision.disposition === "accept" ? -1 : 1) ||
          compareText(left.intent.handle, right.intent.handle);
      }
      if (leftCommitment !== undefined && rightCommitment !== undefined) {
        const actionOrder = (leftCommitment.action === "deliver" ? 0 : 1) -
          (rightCommitment.action === "deliver" ? 0 : 1);
        if (actionOrder !== 0) return actionOrder;
        const leftDue = dueWorldTimeLabelByCommitmentHandle.get(leftCommitment.commitmentHandle);
        const rightDue = dueWorldTimeLabelByCommitmentHandle.get(rightCommitment.commitmentHandle);
        if (leftDue !== rightDue) {
          if (leftDue === null || leftDue === undefined) return 1;
          if (rightDue === null || rightDue === undefined) return -1;
          const dueOrder = compareText(leftDue, rightDue);
          if (dueOrder !== 0) return dueOrder;
        }
        return compareText(leftCommitment.commitmentHandle, rightCommitment.commitmentHandle) ||
          compareText(left.intent.handle, right.intent.handle);
      }
      return left.intentIndex - right.intentIndex;
    })
    .map(({ intent }) => intent);
}

function decisionIntentLabel(
  disposition: "accept" | "decline",
  branchLabel: string,
): string {
  const prefix = disposition === "accept" ? "Accept" : "Decline";
  const label = `${prefix}: ${branchLabel}`;
  if (label.length > CAMPAIGN_PLAY_LIMITS.label) {
    throw new CampaignPlayVisibilityError(
      "visibility_state_invalid",
      "Open decision branch label exceeds the public label limit.",
    );
  }
  return label;
}

function preferredOpeningExposureRoute(
  handle: CampaignPlayDatabaseHandle,
  scene: ReturnType<typeof visibleScene>,
  humanActorId: string,
  seed: CampaignPlayOpeningExposureSeed | null,
  worldTimeMinutes: number,
): CampaignPlayVisibleRoute | undefined {
  if (seed === null) return undefined;
  if (seed.predicate.channel !== "local_aftermath") return undefined;
  if (seed.predicate.validUntilWorldTimeMinutes < worldTimeMinutes) return undefined;

  const pendingExposures = handle.sqlite.prepare(`SELECT exposure.event_id AS eventId,
      event.source_json AS eventSourceJson
    FROM campaign_play_event_exposures exposure
    JOIN campaign_play_events event ON event.event_id = exposure.event_id
      AND event.campaign_id = exposure.campaign_id
    WHERE exposure.campaign_id = ? AND exposure.channel = 'local_aftermath'
      AND exposure.location_id = ?
      AND exposure.valid_until_world_time_minutes >= ?
      AND NOT EXISTS (
        SELECT 1 FROM campaign_play_observations observation
        WHERE observation.campaign_id = exposure.campaign_id
          AND observation.event_id = exposure.event_id
          AND observation.channel = exposure.channel
      )
    ORDER BY event.world_time_minutes, event.rowid`).all(
      handle.campaignId,
      seed.predicate.locationId,
      worldTimeMinutes,
    ) as Array<{ eventId: string; eventSourceJson: string }>;
  const hasPendingOpeningExposure = pendingExposures.some((row) => {
    const source = parseRecord(row.eventSourceJson, "opening exposure event source");
    return source.kind === "actor" && source.actorId === seed.sourceActorId;
  });
  if (!hasPendingOpeningExposure) return undefined;

  const placement = handle.sqlite.prepare(`SELECT location_id AS locationId
    FROM actor_placements WHERE campaign_id = ? AND actor_id = ?
      AND placement_kind = 'present' LIMIT 1`).get(
        handle.campaignId,
        humanActorId,
      ) as { locationId: string } | undefined;
  if (!placement || placement.locationId === seed.predicate.locationId) return undefined;

  const routes = handle.sqlite.prepare(`SELECT edge.id, edge.from_location_id AS fromLocationId,
      edge.to_location_id AS toLocationId, edge.travel_cost AS travelCost,
      destination.name AS destinationName,
      COALESCE(state.state, 'open') AS state
    FROM location_edges edge
    JOIN locations destination ON destination.id = edge.to_location_id
    LEFT JOIN campaign_play_route_states state ON state.route_id = edge.id
    WHERE edge.campaign_id = ? AND edge.discovered = 1
      AND COALESCE(state.state, 'open') <> 'blocked'
    ORDER BY edge.id`).all(handle.campaignId) as Array<{
      id: string;
      fromLocationId: string;
      toLocationId: string;
      travelCost: number;
      destinationName: string;
      state: "open" | "restricted";
    }>;
  const distances = new Map<string, number>([[seed.predicate.locationId, 0]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const route of routes) {
      const remaining = distances.get(route.toLocationId);
      if (remaining === undefined) continue;
      const candidate = remaining + 1;
      const known = distances.get(route.fromLocationId);
      if (known === undefined || candidate < known) {
        distances.set(route.fromLocationId, candidate);
        changed = true;
      }
    }
  }
  const next = routes
    .filter((route) => route.fromLocationId === placement.locationId)
    .filter((route) => distances.has(route.toLocationId))
    .sort((left, right) =>
      distances.get(left.toLocationId)! - distances.get(right.toLocationId)!
      || left.travelCost - right.travelCost
      || left.destinationName.localeCompare(right.destinationName)
      || left.id.localeCompare(right.id))[0];
  if (!next) return undefined;
  const routeHandle = publicHandle("route", handle.campaignId, next.id);
  return scene.visibleRoutes.find((route) => route.handle === routeHandle);
}

function priorContinuity(
  handle: CampaignPlayDatabaseHandle,
  excludedObservationIds: ReadonlySet<string>,
): CampaignPlayJournalEntry[] {
  const rows = handle.sqlite.prepare(`SELECT observation_id AS observationId,
      world_time_minutes AS worldTimeMinutes, public_entry_json AS publicEntryJson
    FROM campaign_play_observations WHERE campaign_id = ?
    ORDER BY world_time_minutes DESC, observation_id DESC LIMIT 32`).all(
      handle.campaignId,
    ) as StoredObservationRow[];
  return rows
    .filter((row) => !excludedObservationIds.has(row.observationId))
    .slice(0, 12)
    .reverse()
    .map((row) => campaignPlayJournalEntrySchema.parse(JSON.parse(row.publicEntryJson)));
}

function admittedWorldTime(
  turn: LoadedCampaignPlayTurn,
  currentWorldTimeMinutes: number,
): number {
  if (turn.turnKind === "opening") return currentWorldTimeMinutes;
  const value = turn.document.frame.worldTimeMinutes;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new CampaignPlayVisibilityError(
      "visibility_turn_invalid",
      "Turn frame requires its admitted public world time.",
    );
  }
  return value;
}

function actionContextForTurn(
  turn: LoadedCampaignPlayTurn,
  turnRepository: ReturnType<typeof createCampaignPlayTurnRepository>,
): CampaignPlayActionContext | null {
  if (turn.turnKind === "opening") return null;
  if (turn.document.turnKind !== "player_action") {
    throw new CampaignPlayVisibilityError(
      "visibility_turn_invalid",
      "Player-action visibility requires its frozen admission document.",
    );
  }
  const frame = turn.document.frame;
  const judgeInput = frame.judgeInput;
  if (!judgeInput || typeof judgeInput !== "object" || Array.isArray(judgeInput)) {
    throw new CampaignPlayVisibilityError(
      "visibility_turn_invalid",
      "Player-action visibility requires its frozen submitted action.",
    );
  }
  const submittedText = (judgeInput as Record<string, unknown>).originalText;
  const source = (judgeInput as Record<string, unknown>).source;
  const choiceHandle = (judgeInput as Record<string, unknown>).choiceHandle;
  const request = turn.document.request;
  const admissionMatches = request.source === "freeform"
    ? source === "freeform" && choiceHandle === null && submittedText === request.text
    : source === "suggested" && choiceHandle === request.choiceHandle;
  if (typeof submittedText !== "string" || !admissionMatches) {
    throw new CampaignPlayVisibilityError(
      "visibility_turn_invalid",
      "Player-action visibility found a submitted action outside its frozen admission.",
    );
  }
  if (frame.executionRoute !== undefined) {
    const executionRoute = campaignPlayActionExecutionRouteSchema.parse(frame.executionRoute);
    if (executionRoute.kind !== "full_authority") {
      const domain = executionRoute.kind === "certified_move"
        ? "campaign_play_certified_move"
        : executionRoute.kind === "certified_wait"
          ? "campaign_play_certified_wait"
          : executionRoute.kind === "certified_contact"
            ? "campaign_play_certified_contact"
            : executionRoute.kind === "certified_decision"
              ? "campaign_play_certified_decision"
              : executionRoute.kind === "certified_observe"
                ? "campaign_play_certified_observe"
                : executionRoute.kind === "certified_obligation"
                  ? "campaign_play_certified_obligation"
                  : "campaign_play_certified_commitment";
      const acceptedJudge = turnRepository.loadAcceptedModelArtifact(turn.turnId, "judge");
      if (
        executionRoute.certificateHash !== hashCampaignPlayProjection({
          domain,
          certificate: executionRoute.certificate,
        }) ||
        (executionRoute.kind !== "certified_observe" && acceptedJudge !== null)
      ) {
        throw new CampaignPlayVisibilityError(
          "visibility_turn_invalid",
          "Player-action visibility rejected invalid certified route authority.",
        );
      }
      if (executionRoute.kind !== "certified_observe") {
        if (executionRoute.kind === "certified_decision") {
          const certificate = executionRoute.certificate;
          return campaignPlayActionContextSchema.parse({
            submittedText,
            ...certificate.publicResult,
            decisionBinding: certificate.decisionBinding,
            decisionOutcome: {
              ...certificate.decisionBinding,
              status: certificate.decisionBinding.disposition === "accept"
                ? "accepted" as const
                : "declined" as const,
              sourceTurnId: certificate.decisionSourceTurnId,
              summary: certificate.decisionSummary,
              acceptEffect: certificate.acceptEffect ?? null,
            },
          });
        }
        if (executionRoute.kind === "certified_commitment") {
          const certificate = executionRoute.certificate;
          return campaignPlayActionContextSchema.parse({
            submittedText,
            intentKind: certificate.action === "collect" ? "contact" : "attempt",
            disposition: "deterministic",
            result: "success",
            clarificationQuestion: null,
          });
        }
        if (executionRoute.kind === "certified_obligation") {
          const certificate = executionRoute.certificate;
          return campaignPlayActionContextSchema.parse({
            submittedText,
            intentKind: "contact",
            disposition: "deterministic",
            result: "success",
            clarificationQuestion: null,
            obligationSettlement: {
              obligationHandle: certificate.obligationHandle,
              debtorHandle: certificate.debtorActorHandle,
              creditorHandle: certificate.creditorActorHandle,
              unitKey: certificate.unitKey,
              amount: certificate.amount,
              status: "settled",
              sourceTurnId: certificate.turnId,
              summary: certificate.label,
            },
          });
        }
        return campaignPlayActionContextSchema.parse({
          submittedText,
          ...executionRoute.certificate.publicResult,
        });
      }
    }
  }
  const acceptedJudge = turnRepository.loadAcceptedModelArtifact(turn.turnId, "judge");
  if (!acceptedJudge) {
    if (turn.mutationAudit.kind === "control_budget_continuity") {
      const choiceBindings = Array.isArray(frame.choiceBindings)
        ? frame.choiceBindings as CampaignPlayAvailableIntent[]
        : [];
      const binding = choiceHandle === null
        ? null
        : choiceBindings.find((choice) => choice.handle === choiceHandle);
      return campaignPlayActionContextSchema.parse({
        submittedText,
        intentKind: binding?.kind ?? "attempt",
        disposition: "uncertain",
        result: "no_effect",
        clarificationQuestion: null,
      });
    }
    throw new CampaignPlayVisibilityError(
      "visibility_turn_invalid",
      "Player-action visibility requires its accepted Judge artifact.",
    );
  }
  const judgeArtifact = campaignPlayJudgeArtifactSchema.parse(acceptedJudge.artifact);
  return campaignPlayActionContextSchema.parse({
    submittedText,
    ...judgeArtifact.publicResult,
  });
}

function selectCampaignPlayDecisions(
  handle: CampaignPlayDatabaseHandle,
  status: "open" | "accepted" | "declined" | "all",
): CampaignPlayDecisionRow[] {
  const statusClause = status === "all" ? "" : " AND decision.status = ?";
  const parameters = status === "all"
    ? [handle.campaignId]
    : [handle.campaignId, status];
  return handle.sqlite.prepare(`SELECT decision.decision_key AS decisionKey,
      decision.actor_handle AS actorHandle, actor.name AS actorName,
      decision.decision_kind AS kind, decision.status,
      decision.source_turn_id AS sourceTurnId, decision.summary,
      decision.accept_label AS acceptLabel, decision.decline_label AS declineLabel,
      decision.accept_effect_json AS acceptEffectJson,
      decision.resolution_turn_id AS resolutionTurnId,
      decision.resolution_event_id AS resolutionEventId,
      decision.world_version AS worldVersion
    FROM campaign_play_decisions decision
    JOIN actors actor ON actor.id = decision.actor_id
      AND actor.campaign_id = decision.campaign_id
    WHERE decision.campaign_id = ?${statusClause}
    ORDER BY decision.decision_key`).all(...parameters) as CampaignPlayDecisionRow[];
}

function resolvedDecisionOutcomes(
  handle: CampaignPlayDatabaseHandle,
): CampaignPlayDecisionOutcome[] {
  return selectCampaignPlayDecisions(handle, "all")
    .filter((decision): decision is CampaignPlayDecisionRow & {
      status: "accepted" | "declined";
    } => decision.status !== "open")
    .sort((left, right) => right.worldVersion - left.worldVersion ||
      right.decisionKey.localeCompare(left.decisionKey))
    .slice(0, CAMPAIGN_PLAY_LIMITS.continuityEntries)
    .map((decision) => {
      if (decision.resolutionTurnId === null || decision.resolutionEventId === null) {
        throw new CampaignPlayVisibilityError(
          "visibility_state_invalid",
          "Resolved decision is missing its durable resolution references.",
        );
      }
      const event = handle.sqlite.prepare(`SELECT event_kind AS eventKind
        FROM campaign_play_events
        WHERE campaign_id = ? AND event_id = ?`).get(
          handle.campaignId,
          decision.resolutionEventId,
        ) as { eventKind: string } | undefined;
      const expectedEventKind = decision.status === "accepted"
        ? "decision_accepted"
        : "decision_declined";
      if (!event || event.eventKind !== expectedEventKind) {
        throw new CampaignPlayVisibilityError(
          "visibility_state_invalid",
          "Resolved decision does not have its matching durable outcome event.",
        );
      }
      return {
        decisionKey: decision.decisionKey,
        actorHandle: decision.actorHandle,
        kind: decision.kind,
        disposition: decision.status === "accepted" ? "accept" : "decline",
        status: decision.status,
        sourceTurnId: decision.sourceTurnId,
        summary: decision.summary,
        acceptEffect: parseDecisionAcceptEffect(decision.acceptEffectJson),
      };
    });
}

function priorPlayerHistory(
  handle: CampaignPlayDatabaseHandle,
  currentTurn: LoadedCampaignPlayTurn,
  turnRepository: ReturnType<typeof createCampaignPlayTurnRepository>,
): CampaignPlayActionContext[] {
  if (currentTurn.turnKind === "opening") return [];
  const rows = handle.sqlite.prepare(`SELECT id AS turnId
    FROM campaign_play_turns
    WHERE campaign_id = ? AND turn_kind = 'player_action'
      AND stage = 'completed' AND id <> ?
    ORDER BY submitted_at DESC, id DESC LIMIT ?`).all(
      handle.campaignId,
      currentTurn.turnId,
      CAMPAIGN_PLAY_LIMITS.continuityEntries,
    ) as StoredPlayerTurnRow[];
  return rows.reverse().map((row) => {
    const priorTurn = turnRepository.loadTurn(row.turnId);
    if (!priorTurn || priorTurn.stage !== "completed") {
      throw new CampaignPlayVisibilityError(
        "visibility_state_invalid",
        "Player history requires each selected prior turn to remain completed.",
      );
    }
    const action = actionContextForTurn(priorTurn, turnRepository);
    if (action === null) {
      throw new CampaignPlayVisibilityError(
        "visibility_state_invalid",
        "Player history requires a frozen prior player action.",
      );
    }
    return action;
  });
}

export function createCampaignPlayVisibilityService(
  handle: CampaignPlayDatabaseHandle,
): CampaignPlayVisibilityService {
  const turnRepository = createCampaignPlayTurnRepository(handle);
  return {
    projectTurn(input) {
      const turn = turnRepository.loadTurn(input.token.turnId);
      if (
        !turn || turn.campaignId !== handle.campaignId ||
        turn.stage !== "actors_settled" || input.token.stage !== "actors_settled"
      ) {
        throw new CampaignPlayVisibilityError(
          "visibility_turn_invalid",
          "Visibility projection requires the exact actors-settled turn.",
        );
      }
      const state = handle.sqlite.prepare(`SELECT
          accepted_world_version AS acceptedWorldVersion,
          world_version AS worldVersion, runtime_revision AS runtimeRevision,
          world_time_minutes AS worldTimeMinutes
        FROM campaign_play_states WHERE campaign_id = ?`).get(
          handle.campaignId,
        ) as VisibilityStateRow | undefined;
      if (!state || state.worldTimeMinutes === null) {
        throw new CampaignPlayVisibilityError(
          "visibility_state_invalid",
          "Visibility projection requires initialized campaign time.",
        );
      }
      const actors = handle.sqlite.prepare(`SELECT id, kind, controller, name
        FROM actors WHERE campaign_id = ? ORDER BY id`).all(handle.campaignId) as ActorRow[];
      const human = actors.find((actor) => actor.controller === "human" && actor.kind === "person");
      if (!human) {
        throw new CampaignPlayVisibilityError(
          "visibility_state_invalid",
          "Visibility projection requires one human player actor.",
        );
      }
      const openingTurnId = turn.turnKind === "opening"
        ? turn.turnId
        : (handle.sqlite.prepare(`SELECT id FROM campaign_play_turns
            WHERE campaign_id = ? AND turn_kind = 'opening' AND stage = 'completed'
            ORDER BY submitted_at DESC LIMIT 1`).get(handle.campaignId) as { id: string } | undefined)?.id;
      const openingArtifact = openingTurnId
        ? turnRepository.loadAcceptedModelArtifact(openingTurnId, "opening_planner")
        : null;
      if (!openingTurnId || !openingArtifact) {
        throw new CampaignPlayVisibilityError(
          "visibility_state_invalid",
          "Visibility projection requires the accepted opening exposure seed.",
        );
      }
      const openingArtifactDocument = campaignPlayOpeningArtifactSchema.parse(
        openingArtifact.artifact,
      );
      const openingPressureContract: OpeningPressureContract = {
        actorId: human.id,
        locationId: openingArtifactDocument.narratorFacts.location.id,
        pressureId: openingArtifactDocument.narratorFacts.pressure.id,
        summary: openingArtifactDocument.narratorFacts.pressure.description,
      };
      const openingExposureSeed = openingArtifactDocument.exposureSeed;
      const openingDecision = turn.turnKind === "opening" &&
        openingArtifactDocument.narratorFacts.decision !== null &&
        openingArtifactDocument.narratorFacts.decision !== undefined
        ? openingArtifactDocument.narratorFacts.decision
        : null;
      const exposures = handle.sqlite.prepare(`SELECT exposure.exposure_id AS exposureId,
          exposure.event_id AS eventId, exposure.channel,
          exposure.location_id AS locationId, exposure.route_id AS routeId,
          exposure.witness_actor_id AS witnessActorId,
          exposure.valid_until_world_time_minutes AS validUntilWorldTimeMinutes,
          exposure.route_triggers_json AS routeTriggersJson,
          event.turn_id AS eventTurnId, event.event_kind AS eventKind,
          event.source_json AS eventSourceJson,
          event.affected_refs_json AS eventAffectedRefsJson,
          event.world_time_minutes AS eventWorldTimeMinutes,
          event.world_version AS eventWorldVersion,
          event.after_payload_json AS eventAfterPayloadJson,
          command.command_kind AS commandKind,
          command.protected_payload_json AS commandPayloadJson,
          command.read_scope_json AS commandReadScopeJson,
          command.write_scope_json AS commandWriteScopeJson,
          command.exposure_policy_json AS commandExposurePolicyJson
          , event.rowid AS eventOrder
        FROM campaign_play_event_exposures exposure
        JOIN campaign_play_events event ON event.event_id = exposure.event_id
        JOIN campaign_play_commands command ON command.command_id = event.command_id
          AND command.campaign_id = event.campaign_id
        WHERE exposure.campaign_id = ? ORDER BY exposure.exposure_id`).all(
          handle.campaignId,
        ) as ExposureRow[];
      const openingPressureExposures = exposures.filter((exposure) =>
        openingPressureObservation(handle, exposure, openingPressureContract) !== null);
      if (openingPressureExposures.length !== 1) {
        throw new CampaignPlayVisibilityError(
          "visibility_state_invalid",
          "Visibility state requires exactly one opening pressure exposure.",
        );
      }
      const placements = currentActorLocations(handle);
      const baseKnowledge = deriveBaseKnowledge(
        handle,
        actors,
        openingPressureContract,
        exposures,
        placements,
        interactionEvidence(handle, turn.turnId),
        entryEvidence(handle),
        state.worldTimeMinutes,
      );
      const witnessKnowledge = deriveWitnessKnowledge(
        human.id,
        exposures,
        contactedWitnesses(handle, turn.turnId, human.id),
        knownEventEvidence(handle, baseKnowledge),
        state.worldTimeMinutes,
      );
      const candidates = [...baseKnowledge, ...witnessKnowledge].sort((left, right) =>
        left.learnedAtWorldTimeMinutes - right.learnedAtWorldTimeMinutes ||
        left.earnedEventOrder - right.earnedEventOrder ||
        compareText(knowledgeKey(left), knowledgeKey(right)));
      const openingPressureKnowledge = candidates.filter((candidate) =>
        candidate.actorId === human.id && openingPressureObservation(
          handle,
          candidate.exposure,
          openingPressureContract,
        ) !== null);
      if (openingPressureKnowledge.length !== 1) {
        throw new CampaignPlayVisibilityError(
          "visibility_state_invalid",
          "Visibility projection requires exactly one valid opening pressure observation.",
        );
      }
      const actionContext = actionContextForTurn(turn, turnRepository);
      const humanMoveCandidate = actionContext?.intentKind === "move" &&
        actionContext.result === "success"
        ? candidates.find((candidate) =>
            candidate.actorId === human.id &&
            candidate.exposure.eventTurnId === turn.turnId &&
            candidate.exposure.channel === "direct_perception" &&
            isHumanMovementEvent(candidate, human.id))
        : undefined;
      const existingObservations = new Set((handle.sqlite.prepare(`SELECT event_id AS eventId,
          channel, source_hash AS sourceHash FROM campaign_play_observations
        WHERE campaign_id = ? AND human_actor_id = ?`).all(
          handle.campaignId,
          human.id,
        ) as Array<{ eventId: string; channel: string; sourceHash: string }>)
        .map((row) => `${row.eventId}\u0000${row.channel}\u0000${row.sourceHash}`));
      const observationCandidates = candidates
        .filter((candidate) => candidate.actorId === human.id)
        .filter((candidate) => !isHumanMovementEvent(candidate, human.id) || candidate === humanMoveCandidate)
        .filter((candidate) => !existingObservations.has(
          `${candidate.exposure.eventId}\u0000${candidate.exposure.channel}\u0000${candidate.sourceHash}`,
        ));
      const openingPressureCandidates = observationCandidates.filter((candidate) =>
        openingPressureObservation(
          handle,
          candidate.exposure,
          openingPressureContract,
        ) !== null);
      if (openingPressureCandidates.length > 1) {
        throw new CampaignPlayVisibilityError(
          "visibility_state_invalid",
          "Visibility projection found more than one unobserved opening pressure observation.",
        );
      }
      const openingPressureCandidate = openingPressureCandidates[0];
      const pinnedCandidates = [humanMoveCandidate, openingPressureCandidate]
        .filter((candidate): candidate is EpistemicCandidate => candidate !== undefined);
      const pinnedCandidateSet = new Set(pinnedCandidates);
      const candidateBudget = Math.max(
        0,
        CAMPAIGN_PLAY_LIMITS.newObservations - pinnedCandidates.length,
      );
      const newestObservationCandidates = observationCandidates
        .filter((candidate) => !pinnedCandidateSet.has(candidate))
        .sort((left, right) =>
          right.learnedAtWorldTimeMinutes - left.learnedAtWorldTimeMinutes ||
          right.earnedEventOrder - left.earnedEventOrder ||
          compareText(knowledgeKey(right), knowledgeKey(left)))
        .slice(0, candidateBudget);
      const selectedObservationCandidates = [...newestObservationCandidates, ...pinnedCandidates];
      const observationPlans = selectedObservationCandidates
        .sort((left, right) =>
          left.learnedAtWorldTimeMinutes - right.learnedAtWorldTimeMinutes ||
          left.earnedEventOrder - right.earnedEventOrder ||
          compareText(knowledgeKey(left), knowledgeKey(right)))
        .map((candidate) => {
          const observationId = stableId("observation", {
            campaignId: handle.campaignId,
            actorId: human.id,
            exposureId: candidate.exposure.exposureId,
            sourceHash: candidate.sourceHash,
          });
          return {
            candidate,
            observationId,
            entry: publicEntry(
              handle,
              candidate,
              human.id,
              turn.turnId,
              openingTurnId,
              openingExposureSeed,
              candidate === humanMoveCandidate,
            ),
          };
        });
      const pendingOpeningPressureObservations = observationPlans.flatMap((plan) => {
        const observation = openingPressureObservation(
          handle,
          plan.candidate.exposure,
          openingPressureContract,
        );
        return observation === null ? [] : [observation];
      });
      if (pendingOpeningPressureObservations.length > 1) {
        throw new CampaignPlayVisibilityError(
          "visibility_state_invalid",
          "Visibility projection scheduled more than one opening pressure observation.",
        );
      }
      const scene = visibleScene(
        handle,
        human.id,
        openingPressureContract,
        pendingOpeningPressureObservations,
      );
      const openingDecisionObservation = openingDecision === null
        ? null
        : openingDecisionPublicObservation(
            handle,
            turn.turnId,
            state.worldTimeMinutes,
            openingArtifactDocument.narratorFacts.location.name,
            openingDecision,
            scene.visibleActors,
          );
      const currentTurnDecisionObservations = turn.turnKind === "opening"
        ? (openingDecisionObservation === null ? [] : [openingDecisionObservation])
        : currentTurnDecisionPublicObservations(
            handle,
            turn.turnId,
            state.worldTimeMinutes,
            scene.currentLocation.name,
            scene.visibleActors,
          );
      if (
        canonicalizeCampaignPlayProjection(input.actionContext) !==
          canonicalizeCampaignPlayProjection(actionContext)
      ) {
        throw new CampaignPlayVisibilityError(
          "visibility_turn_invalid",
          "Visibility action context disagrees with its frozen admission and accepted Judge result.",
        );
      }
      const narratorSourceMoment =
        actionContext?.intentKind === "move" && actionContext.result === "success"
          ? null
          : input.sourceMoment;
      const packet = campaignPlayNarratorPacketSchema.parse({
        campaignId: handle.campaignId,
        turnId: turn.turnId,
        turnKind: turn.turnKind,
        openingContext: turn.turnKind === "opening"
          ? (() => {
              const stored = turnRepository.loadAcceptedModelArtifact(
                turn.turnId,
                "opening_planner",
              );
              if (!stored) {
                throw new CampaignPlayVisibilityError(
                  "visibility_turn_invalid",
                  "Opening visibility requires its accepted planner artifact.",
                );
              }
              const artifact = campaignPlayOpeningArtifactSchema.parse(stored.artifact);
              if (
                artifact.campaignId !== handle.campaignId ||
                artifact.turnId !== turn.turnId
              ) {
                throw new CampaignPlayVisibilityError(
                  "visibility_turn_invalid",
                  "Opening planner artifact belongs to a different turn authority.",
                );
              }
              return {
                ...artifact.narratorFacts.player,
                decision: artifact.narratorFacts.decision ?? null,
              };
            })()
          : null,
        actionContext,
        playerHistory: priorPlayerHistory(handle, turn, turnRepository),
        sourceMoment: narratorSourceMoment,
        acceptedWorldVersion: state.acceptedWorldVersion,
        worldVersion: state.worldVersion,
        runtimeRevision: state.runtimeRevision + 1,
        ...scene,
        commitments: scene.commitments ?? [],
        newObservations: [
          ...currentTurnDecisionObservations,
          ...observationPlans.map((plan) => plan.entry),
        ],
        consequences: [
          ...currentTurnDecisionObservations.map((observation) => observation.consequence!),
          ...observationPlans.map((plan) => plan.entry.consequence!),
        ],
        observationSubjects: [
          ...currentTurnDecisionObservations.map((observation) => ({
            observationHandle: observation.observationHandle,
            actors: [{
              handle: observation.decision!.actorHandle,
              name: observation.decision!.actorName,
            }],
          })),
          ...observationPlans.map((plan) => ({
            observationHandle: plan.entry.observationHandle,
            actors: directlyPerceivedObservationSubjects(
              handle,
              plan.candidate,
              human.id,
              scene.visibleActors,
              plan.entry.text,
            ),
          })),
        ],
        continuity: priorContinuity(
          handle,
          new Set(observationPlans.map((plan) => plan.observationId)),
        ),
        elapsedMinutes: Math.min(
          10_080,
          Math.max(0, state.worldTimeMinutes - admittedWorldTime(turn, state.worldTimeMinutes)),
        ),
        availableIntents: availableIntents(
          handle,
          turn.turnId,
          actionContext,
          scene,
          human.id,
          openingExposureSeed,
          state.worldTimeMinutes,
        ),
        decisionOutcomes: resolvedDecisionOutcomes(handle),
      });
      const packetJson = canonicalizeCampaignPlayProjection(packet);
      const packetHash = hashCampaignPlayNarratorPacket(
        turn.turnId,
        JSON.parse(packetJson) as CampaignPlayProjectionRecord,
      );
      const narrationId = stableId("narration", {
        campaignId: handle.campaignId,
        turnId: turn.turnId,
        packetHash,
      });
      let knowledgeInserted = 0;
      let observationsInserted = 0;
      const committed = turnRepository.commitDeterministic({
        token: input.token,
        transition: "visibility_projected",
        worldVersionAdvance: 0,
        publicPacketHash: packetHash,
        committedAt: input.committedAt,
        mutationId: input.mutationId,
        mutate(context) {
          if (
            context.priorWorldVersion !== state.worldVersion ||
            context.targetWorldVersion !== state.worldVersion ||
            context.priorRuntimeRevision !== state.runtimeRevision ||
            context.targetRuntimeRevision !== state.runtimeRevision + 1
          ) {
            throw new CampaignPlayVisibilityError(
              "visibility_projection_invalid",
              "Visibility authority changed before its atomic commit.",
            );
          }
          for (const candidate of candidates) {
            const exposure = candidate.exposure;
            const result = context.sqlite.prepare(`INSERT INTO campaign_play_actor_knowledge
              (knowledge_id, campaign_id, actor_id, event_id, exposure_id, channel,
                source_location_id, source_route_id, source_trigger,
                source_witness_actor_id, perceived_actor_id, source_json, source_hash,
                learned_at_world_time_minutes, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(actor_id, event_id, channel, source_hash) DO NOTHING`).run(
                stableId("knowledge", {
                  campaignId: handle.campaignId,
                  actorId: candidate.actorId,
                  eventId: exposure.eventId,
                  channel: exposure.channel,
                  sourceHash: candidate.sourceHash,
                }),
                handle.campaignId,
                candidate.actorId,
                exposure.eventId,
                exposure.exposureId,
                exposure.channel,
                exposure.locationId,
                exposure.routeId,
                exposure.channel === "route_state" ? candidate.source.trigger : null,
                exposure.witnessActorId,
                candidate.perceivedActorId,
                canonicalizeCampaignPlayProjection(candidate.source),
                candidate.sourceHash,
                candidate.learnedAtWorldTimeMinutes,
                input.committedAt,
              );
            knowledgeInserted += result.changes;
          }
          for (const plan of observationPlans) {
            const candidate = plan.candidate;
            const exposure = candidate.exposure;
            const entryJson = canonicalizeCampaignPlayProjection(plan.entry);
            const result = context.sqlite.prepare(`INSERT INTO campaign_play_observations
              (observation_id, campaign_id, human_actor_id, event_id, exposure_id,
                channel, source_location_id, source_route_id, source_trigger,
                source_witness_actor_id, perceived_actor_id, source_json, source_hash,
                public_entry_json, public_entry_hash, world_time_minutes, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(human_actor_id, event_id, exposure_id, channel, source_hash)
              DO NOTHING`).run(
                plan.observationId,
                handle.campaignId,
                human.id,
                exposure.eventId,
                exposure.exposureId,
                exposure.channel,
                exposure.locationId,
                exposure.routeId,
                exposure.channel === "route_state" ? candidate.source.trigger : null,
                exposure.witnessActorId,
                candidate.perceivedActorId,
                canonicalizeCampaignPlayProjection(candidate.source),
                candidate.sourceHash,
                entryJson,
                hashCampaignPlayProjection(plan.entry),
                state.worldTimeMinutes,
                input.committedAt,
              );
            observationsInserted += result.changes;
          }
          context.sqlite.prepare(`INSERT INTO campaign_play_narrations
            (narration_id, campaign_id, turn_id, status, packet_hash, packet_json, created_at)
            VALUES (?, ?, ?, 'pending', ?, ?, ?)`).run(
              narrationId,
              handle.campaignId,
              turn.turnId,
              packetHash,
              packetJson,
              input.committedAt,
            );
        },
      });
      return { turn: committed, packet, knowledgeInserted, observationsInserted };
    },
  };
}
