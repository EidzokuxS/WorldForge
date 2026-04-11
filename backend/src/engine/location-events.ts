import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { locationRecentEvents, locations } from "../db/schema.js";

type ResolvedLocationProjection = {
  locationId: string;
  sourceLocationId: string | null;
  anchorLocationId: string | null;
  archivedAtTick: number | null;
};

export type RecordLocationRecentEventInput = {
  campaignId: string;
  locationRef: string | null | undefined;
  tick: number;
  eventType: string;
  summary: string;
  importance: number;
  sourceEventId?: string | null;
  createdAt?: number;
};

export type LocationRecentEventSummary = typeof locationRecentEvents.$inferSelect;

function resolveLocationProjection(
  campaignId: string,
  locationRef: string | null | undefined,
): ResolvedLocationProjection | null {
  const normalizedLocationRef = locationRef?.trim();
  if (!normalizedLocationRef) {
    return null;
  }

  const location = getDb()
    .select({
      id: locations.id,
      kind: locations.kind,
      persistence: locations.persistence,
      anchorLocationId: locations.anchorLocationId,
      archivedAtTick: locations.archivedAtTick,
    })
    .from(locations)
    .where(
      sql`${locations.campaignId} = ${campaignId} AND (${locations.id} = ${normalizedLocationRef} OR LOWER(${locations.name}) = LOWER(${normalizedLocationRef}))`,
    )
    .get();

  if (!location) {
    return null;
  }

  const shouldAnchorProjection =
    location.kind === "ephemeral_scene" && Boolean(location.anchorLocationId);

  return {
    locationId: shouldAnchorProjection ? location.anchorLocationId! : location.id,
    sourceLocationId: shouldAnchorProjection ? location.id : null,
    anchorLocationId: shouldAnchorProjection ? location.anchorLocationId : null,
    archivedAtTick: shouldAnchorProjection ? location.archivedAtTick : null,
  };
}

export function recordLocationRecentEvent(
  input: RecordLocationRecentEventInput,
): LocationRecentEventSummary | null {
  const projection = resolveLocationProjection(input.campaignId, input.locationRef);
  if (!projection) {
    return null;
  }

  const row: typeof locationRecentEvents.$inferInsert = {
    id: crypto.randomUUID(),
    campaignId: input.campaignId,
    locationId: projection.locationId,
    sourceLocationId: projection.sourceLocationId,
    anchorLocationId: projection.anchorLocationId,
    sourceEventId: input.sourceEventId ?? null,
    eventType: input.eventType,
    summary: input.summary,
    tick: input.tick,
    importance: input.importance,
    archivedAtTick: projection.archivedAtTick,
    createdAt: input.createdAt ?? Date.now(),
  };

  getDb().insert(locationRecentEvents).values(row).run();
  return row;
}

export function listRecentLocationEvents(input: {
  campaignId: string;
  locationRef: string;
  limit?: number;
}): LocationRecentEventSummary[] {
  const projection = resolveLocationProjection(input.campaignId, input.locationRef);
  if (!projection) {
    return [];
  }

  return getDb()
    .select()
    .from(locationRecentEvents)
    .where(
      and(
        eq(locationRecentEvents.campaignId, input.campaignId),
        eq(locationRecentEvents.locationId, projection.locationId),
      ),
    )
    .orderBy(desc(locationRecentEvents.tick), desc(locationRecentEvents.createdAt))
    .limit(input.limit ?? 5)
    .all();
}
