import type {
  CampaignPlayActionContext,
  CampaignPlayAvailableIntent,
  CampaignPlayConsequence,
  CampaignPlayJournalEntry,
  CampaignPlayNarratorPacket,
  CampaignPlayVisibleActor,
  CampaignPlayVisibleLocation,
  CampaignPlayVisiblePressure,
  CampaignPlayVisibleRoute,
} from "@worldforge/shared";
import {
  campaignPlayActionContextSchema,
  campaignPlayJudgeArtifactSchema,
  campaignPlayJournalEntrySchema,
  campaignPlayNarratorPacketSchema,
} from "./contracts.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayPublicHandle,
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
}

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
    if (!Array.isArray(payload.affectedRefs)) continue;
    for (const reference of payload.affectedRefs) {
      if (!reference || typeof reference !== "object" || Array.isArray(reference)) continue;
      const candidate = reference as Record<string, unknown>;
      if (candidate.kind === "actor" && typeof candidate.id === "string" && candidate.id !== humanActorId) {
        const humanLocation = actorLocationFromSnapshot(row.eventAfterPayloadJson, humanActorId);
        const witnessLocation = actorLocationFromSnapshot(row.eventAfterPayloadJson, candidate.id);
        if (humanLocation && witnessLocation === humanLocation) {
          const points = contacts.get(candidate.id) ?? [];
          points.push({ eventOrder: row.eventOrder, createdAt: row.createdAt });
          contacts.set(candidate.id, points);
        }
      }
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
  exposures: readonly ExposureRow[],
  locations: ReadonlyMap<string, string>,
  routeEvidence: ReadonlyMap<string, Map<RouteTrigger, number[]>>,
  entries: ReadonlyMap<string, number[]>,
  worldTimeMinutes: number,
): EpistemicCandidate[] {
  const candidates = new Map<string, EpistemicCandidate>();
  for (const exposure of exposures) {
    if (exposure.channel === "witness_report") continue;
    for (const actor of actors) {
      let trigger: RouteTrigger | undefined;
      let earnedEventOrder = exposure.eventOrder;
      let earned = false;
      if (exposure.channel === "direct_perception") {
        earned = actorLocationFromSnapshot(exposure.eventAfterPayloadJson, actor.id) === exposure.locationId;
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
  seed: CampaignPlayOpeningExposureSeed,
  exposure: {
    sourceActorId: string | null;
    channel: ExposureChannel;
    locationId: string | null;
    routeId: string | null;
    witnessActorId: string | null;
  },
): string | null {
  if (exposure.sourceActorId !== seed.sourceActorId || exposure.channel !== seed.predicate.channel) {
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
  openingExposureSeed: CampaignPlayOpeningExposureSeed,
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
  const playerParticipated = exposure.eventTurnId === currentTurnId && affectedRefs.some((reference) =>
    reference.kind === "actor" && reference.id === humanActorId
  );
  const eventSource = parseRecord(exposure.eventSourceJson, "Event source");
  const commandPayload = parseRecord(exposure.commandPayloadJson, "Command payload");
  const openingTrace = resolveCampaignPlayOpeningObservableTrace(openingExposureSeed, {
    sourceActorId: eventSourceActorId(exposure),
    channel: exposure.channel,
    locationId: exposure.locationId,
    routeId: exposure.routeId,
    witnessActorId: exposure.witnessActorId,
  });
  const playerCaused = eventSourceActorId(exposure) === humanActorId || (
    playerParticipated && eventSource.kind === "system" && eventSource.system === "game_master"
  );
  let title = "Seen nearby";
  let text = "You witnessed a change nearby.";
  let cue: CampaignPlayConsequence["causalCue"] = "direct_perception";
  if (
    exposure.channel === "direct_perception" && playerParticipated &&
    eventSource.kind === "system" && eventSource.system === "game_master" &&
    exposure.commandKind === "record_world_event" && typeof commandPayload.summary === "string"
  ) {
    title = "Your action";
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
      title = `${movingActor.name} moved`;
      text = `${movingActor.name} left for ${destination.name}.`;
    }
  } else if (
    exposure.channel === "direct_perception" && exposure.commandKind === "record_world_event" &&
    eventSource.kind === "actor" && typeof eventSource.actorId === "string" &&
    eventSource.actorId !== humanActorId
  ) {
    title = "Seen nearby";
    text = renderCampaignPlayVisibleActorEvent({
      observableTrace: commandPayload.observableTrace,
    });
  } else if (exposure.channel === "local_aftermath") {
    title = "Signs of change";
    if (openingTrace !== null) {
      text = openingTrace;
    } else if (eventSource.kind === "actor" && exposure.commandKind === "record_world_event") {
      if (typeof commandPayload.observableTrace !== "string") {
        throw new CampaignPlayVisibilityError(
          "visibility_projection_invalid",
          "An autonomous actor aftermath requires its persisted observable trace.",
        );
      }
      text = commandPayload.observableTrace;
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
  });
}

function visibleScene(
  handle: CampaignPlayDatabaseHandle,
  humanActorId: string,
): {
  currentLocation: CampaignPlayVisibleLocation;
  visibleActors: CampaignPlayVisibleActor[];
  visibleRoutes: CampaignPlayVisibleRoute[];
  visiblePressures: CampaignPlayVisiblePressure[];
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
  const pressures = handle.sqlite.prepare(`WITH observed_pressure AS (
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
    SELECT id, name, summary FROM observed_pressure
    WHERE recency = 1 AND typeof(summary) = 'text' AND length(summary) > 0
    ORDER BY urgency DESC, name, id LIMIT 4`).all(
      humanActorId,
      handle.campaignId,
      location.id,
    ) as Array<{ id: string; name: string; summary: string }>;
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
  };
}

export function availableIntents(
  handle: CampaignPlayDatabaseHandle,
  turnId: string,
  scene: ReturnType<typeof visibleScene>,
  humanActorId: string,
  openingExposureSeed: CampaignPlayOpeningExposureSeed,
  worldTimeMinutes: number,
): CampaignPlayAvailableIntent[] {
  const campaignId = handle.campaignId;
  const intents: CampaignPlayAvailableIntent[] = [{
    handle: publicHandle("choice", campaignId, `${turnId}:observe`),
    label: "Look around",
    kind: "observe",
    targets: [{ handle: scene.currentLocation.handle, kind: "location" }],
  }];
  const route = preferredOpeningExposureRoute(
    handle,
    scene,
    humanActorId,
    openingExposureSeed,
    worldTimeMinutes,
  ) ?? scene.visibleRoutes.find((candidate) => candidate.state !== "blocked");
  if (route) intents.push({
    handle: publicHandle("choice", campaignId, `${turnId}:move:${route.handle}`),
    label: `Go to ${route.destinationName}`,
    kind: "move",
    targets: [{ handle: route.handle, kind: "route" }],
  });
  const actor = scene.visibleActors[0];
  if (actor) intents.push({
    handle: publicHandle("choice", campaignId, `${turnId}:contact:${actor.handle}`),
    label: `Talk to ${actor.name}`,
    kind: "contact",
    targets: [{ handle: actor.handle, kind: "actor" }],
  });
  intents.push({
    handle: publicHandle("choice", campaignId, `${turnId}:wait`),
    label: "Wait",
    kind: "wait",
    targets: [],
  });
  return intents.slice(0, 4);
}

function preferredOpeningExposureRoute(
  handle: CampaignPlayDatabaseHandle,
  scene: ReturnType<typeof visibleScene>,
  humanActorId: string,
  seed: CampaignPlayOpeningExposureSeed,
  worldTimeMinutes: number,
): CampaignPlayVisibleRoute | undefined {
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
  const acceptedJudge = turnRepository.loadAcceptedModelArtifact(turn.turnId, "judge");
  if (!acceptedJudge) {
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
      if (!openingArtifact) {
        throw new CampaignPlayVisibilityError(
          "visibility_state_invalid",
          "Visibility projection requires the accepted opening exposure seed.",
        );
      }
      const openingExposureSeed = campaignPlayOpeningArtifactSchema.parse(
        openingArtifact.artifact,
      ).exposureSeed;
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
          command.protected_payload_json AS commandPayloadJson
          , event.rowid AS eventOrder
        FROM campaign_play_event_exposures exposure
        JOIN campaign_play_events event ON event.event_id = exposure.event_id
        JOIN campaign_play_commands command ON command.command_id = event.command_id
          AND command.campaign_id = event.campaign_id
        WHERE exposure.campaign_id = ? ORDER BY exposure.exposure_id`).all(
          handle.campaignId,
        ) as ExposureRow[];
      const placements = currentActorLocations(handle);
      const baseKnowledge = deriveBaseKnowledge(
        handle,
        actors,
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
      const candidates = [...baseKnowledge, ...witnessKnowledge];
      const existingObservations = new Set((handle.sqlite.prepare(`SELECT event_id AS eventId,
          channel, source_hash AS sourceHash FROM campaign_play_observations
        WHERE campaign_id = ? AND human_actor_id = ?`).all(
          handle.campaignId,
          human.id,
        ) as Array<{ eventId: string; channel: string; sourceHash: string }>)
        .map((row) => `${row.eventId}\u0000${row.channel}\u0000${row.sourceHash}`));
      const observationPlans = candidates
        .filter((candidate) => candidate.actorId === human.id)
        .filter((candidate) => !isHumanMovementEvent(candidate, human.id))
        .filter((candidate) => !existingObservations.has(
          `${candidate.exposure.eventId}\u0000${candidate.exposure.channel}\u0000${candidate.sourceHash}`,
        ))
        .slice(0, 8)
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
              openingExposureSeed,
            ),
          };
        });
      const scene = visibleScene(handle, human.id);
      const actionContext = actionContextForTurn(turn, turnRepository);
      if (
        canonicalizeCampaignPlayProjection(input.actionContext) !==
          canonicalizeCampaignPlayProjection(actionContext)
      ) {
        throw new CampaignPlayVisibilityError(
          "visibility_turn_invalid",
          "Visibility action context disagrees with its frozen admission and accepted Judge result.",
        );
      }
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
              return artifact.narratorFacts.player;
            })()
          : null,
        actionContext,
        sourceMoment: input.sourceMoment,
        acceptedWorldVersion: state.acceptedWorldVersion,
        worldVersion: state.worldVersion,
        runtimeRevision: state.runtimeRevision + 1,
        ...scene,
        newObservations: observationPlans.map((plan) => plan.entry),
        consequences: observationPlans.map((plan) => plan.entry.consequence!),
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
          scene,
          human.id,
          openingExposureSeed,
          state.worldTimeMinutes,
        ),
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
