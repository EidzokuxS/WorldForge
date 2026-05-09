import {
  advanceWorldThread,
  listDueWorldThreads,
  type WorldThreadAdvanceResult,
  type WorldThreadRecord,
  type WorldThreadSurfaceRoute,
} from "./world-thread.js";
import { readWorldClock } from "./living-world-authority.js";

export interface ResolveDueWorldThreadWorkForScopeInput {
  campaignId: string;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
}

export interface SkippedWorldThreadWork {
  thread: WorldThreadRecord;
  reason: string;
}

export interface DeferredWorldThreadWork {
  thread: WorldThreadRecord;
  reason: string;
}

export interface ResolveDueWorldThreadWorkForScopeResult {
  executed: Extract<WorldThreadAdvanceResult, { status: "advanced" }>[];
  deferred: DeferredWorldThreadWork[];
  skipped: SkippedWorldThreadWork[];
}

function matchesScope(
  route: WorldThreadSurfaceRoute,
  scopeRefs: ReadonlySet<string>,
): boolean {
  if (!route.locationId) {
    return true;
  }
  return scopeRefs.has(route.locationId);
}

function dueRouteForScope(input: {
  thread: WorldThreadRecord;
  worldTimeMinutes: number;
  scopeRefs: ReadonlySet<string>;
}): WorldThreadSurfaceRoute | null {
  const sortedRoutes = [...input.thread.surfaceRoutes].sort(
    (left, right) =>
      (left.dueWorldTimeMinutes ?? input.thread.nextDueWorldTimeMinutes ?? 0)
      - (right.dueWorldTimeMinutes ?? input.thread.nextDueWorldTimeMinutes ?? 0),
  );
  return sortedRoutes.find((route) => {
    const dueWorldTimeMinutes = route.dueWorldTimeMinutes
      ?? input.thread.nextDueWorldTimeMinutes
      ?? input.worldTimeMinutes;
    return dueWorldTimeMinutes <= input.worldTimeMinutes
      && matchesScope(route, input.scopeRefs);
  }) ?? null;
}

function hasRouteSource(route: WorldThreadSurfaceRoute, thread: WorldThreadRecord): boolean {
  return (route.sourceEventIds?.length ?? 0) > 0
    || (route.sourceAuthorityTraceIds?.length ?? 0) > 0
    || thread.sourceEventIds.length > 0
    || thread.sourceAuthorityTraceIds.length > 0;
}

export function resolveDueWorldThreadWorkForScope(
  input: ResolveDueWorldThreadWorkForScopeInput,
): ResolveDueWorldThreadWorkForScopeResult {
  const clock = readWorldClock(input.campaignId);
  const scopeRefs = new Set(
    [
      input.playerSceneScopeId,
      input.playerLocationId,
    ].filter((value): value is string => Boolean(value)),
  );
  const executed: Extract<WorldThreadAdvanceResult, { status: "advanced" }>[] = [];
  const deferred: DeferredWorldThreadWork[] = [];
  const skipped: SkippedWorldThreadWork[] = [];

  for (const thread of listDueWorldThreads({
    campaignId: input.campaignId,
    worldTimeMinutes: clock.worldTimeMinutes,
  })) {
    const route = dueRouteForScope({
      thread,
      worldTimeMinutes: clock.worldTimeMinutes,
      scopeRefs,
    });
    if (!route) {
      skipped.push({ thread, reason: "no_due_surface_route_for_scope" });
      continue;
    }
    if (!hasRouteSource(route, thread)) {
      deferred.push({ thread, reason: "surface_route_missing_source" });
      continue;
    }

    const result = advanceWorldThread({
      campaignId: input.campaignId,
      threadId: thread.id,
      baseWorldVersion: readWorldClock(input.campaignId).worldVersion,
      nextStage: route.stage ?? thread.stage,
      pressureDelta: 1,
      sourceEventIds: route.sourceEventIds,
      sourceAuthorityTraceIds: route.sourceAuthorityTraceIds,
      surface: {
        summary: route.summary,
        route: route.route,
        locationRef: route.locationId ?? input.playerSceneScopeId ?? input.playerLocationId,
        visibility: thread.visibility,
      },
      nextDueWorldTimeMinutes: route.nextDueWorldTimeMinutes ?? null,
      metadata: {
        resolvedBy: "due-world-thread-runner",
        routeId: route.id ?? null,
      },
    });
    if (result.status === "advanced") {
      executed.push(result);
    } else {
      deferred.push({ thread, reason: result.reason });
    }
  }

  return { executed, deferred, skipped };
}
