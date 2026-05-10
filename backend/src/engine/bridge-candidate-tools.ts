import { buildObservationToolResult, type ToolResult } from "./tool-result.js";
import type {
  ModelFacingActor,
  ModelFacingScenePacket,
} from "./model-facing-scene.js";
import type {
  SceneFrame,
  SceneFrameMovementCandidate,
  SceneFrameRecentEvent,
  SceneFrameTargetCandidate,
} from "./scene-frame.js";
import type { ToolExecutionContext } from "./tool-execution-context.js";

export const BRIDGE_LOOKUP_TOOL_NAMES = [
  "list_visible_affordances",
  "list_navigation_options",
  "find_location_candidates",
  "find_object_candidates",
  "find_actor_candidates",
  "find_poi_candidates",
  "inspect_known_fact",
  "check_route",
] as const;

export type BridgeLookupToolName = typeof BRIDGE_LOOKUP_TOOL_NAMES[number];

export interface BridgeKnownFactSnapshot {
  id: string;
  summary: string;
  visibilityRoute: "player_visible" | "player_known";
  confidence: number;
  sourceRefs: string[];
}

export interface BridgeLookupSnapshot {
  current: {
    campaignId: string;
    tick: number;
    playerActorId: string;
    currentLocationId: string | null;
    currentSceneScopeId: string | null;
    currentLocationName: string | null;
    currentSceneScopeName: string | null;
  };
  visibleActors: ModelFacingActor[];
  awarenessHints: string[];
  legalTargets: SceneFrameTargetCandidate[];
  legalMovement: SceneFrameMovementCandidate[];
  localRecentEvents: SceneFrameRecentEvent[];
  playerKnownFacts: BridgeKnownFactSnapshot[];
  allowedTools: string[];
}

export interface BuildBridgeLookupSnapshotArgs {
  frame: SceneFrame;
  packet: ModelFacingScenePacket;
  playerKnownFacts?: readonly BridgeKnownFactSnapshot[];
}

export function isBridgeLookupToolName(toolName: string): toolName is BridgeLookupToolName {
  return (BRIDGE_LOOKUP_TOOL_NAMES as readonly string[]).includes(toolName);
}

function uniqueStrings(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function words(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[^a-zа-яё0-9_'-]+/iu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function readString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function readBoolean(input: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = input[key];
  return typeof value === "boolean" ? value : fallback;
}

function readMaxResults(input: Record<string, unknown>, fallback = 5): number {
  const value = input.maxResults;
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(8, Math.trunc(value)));
}

function asInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function candidateRefs(candidate: SceneFrameTargetCandidate): string[] {
  return uniqueStrings([
    candidate.id,
    candidate.actorId,
    candidate.itemId,
    candidate.locationId,
    candidate.factionId,
    candidate.label,
  ]);
}

function movementRefs(candidate: SceneFrameMovementCandidate): string[] {
  return uniqueStrings([
    candidate.id,
    candidate.locationId,
    candidate.label,
    ...(candidate.path ?? []),
  ]);
}

function actorRefs(actor: ModelFacingActor): string[] {
  return uniqueStrings([actor.id, actor.actorId, actor.label]);
}

function scoreText(input: {
  query: string | null;
  tags: readonly string[];
  label: string;
  refs: readonly string[];
  candidateTags?: readonly string[];
}): number {
  const query = input.query ? normalize(input.query) : "";
  const haystack = [
    input.label,
    ...input.refs,
    ...(input.candidateTags ?? []),
  ].join(" ").toLowerCase();
  let score = 0;
  if (query) {
    if (normalize(input.label) === query) score += 100;
    if (normalize(input.label).includes(query)) score += 40;
    for (const token of words(query)) {
      if (haystack.includes(token)) score += 12;
    }
  }
  for (const tag of input.tags) {
    if (haystack.includes(normalize(tag))) score += 8;
  }
  if (!query && input.tags.length === 0) score += 1;
  return score;
}

function compactTarget(
  candidate: SceneFrameTargetCandidate,
  score: number,
): Record<string, unknown> {
  return {
    ref: candidate.id,
    type: candidate.type,
    label: candidate.label,
    score,
    ids: uniqueStrings([
      candidate.actorId,
      candidate.itemId,
      candidate.locationId,
      candidate.factionId,
    ]),
    tags: candidate.tags ?? [],
    sourceRefs: candidateRefs(candidate),
    observationOnly: true,
  };
}

function compactMovement(
  candidate: SceneFrameMovementCandidate,
  score: number,
): Record<string, unknown> {
  return {
    ref: candidate.id,
    type: "location",
    label: candidate.label,
    score,
    locationId: candidate.locationId,
    connected: candidate.connected,
    travelCost: candidate.travelCost ?? null,
    path: candidate.path ?? [],
    sourceRefs: movementRefs(candidate),
    observationOnly: true,
  };
}

function compactActor(actor: ModelFacingActor, score: number): Record<string, unknown> {
  return {
    ref: actor.actorId ?? actor.id,
    type: "actor",
    label: actor.label,
    score,
    ids: actorRefs(actor),
    tags: actor.tags ?? [],
    sourceRefs: actorRefs(actor),
    observationOnly: true,
  };
}

function sortCandidates<T extends { score: number; label: string }>(values: T[]): T[] {
  return values.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.label.localeCompare(right.label);
  });
}

function observation(toolName: BridgeLookupToolName, result: Record<string, unknown>): ToolResult {
  return buildObservationToolResult({
    result: {
      toolName,
      observationOnly: true,
      ...result,
    },
  });
}

function denial(toolName: BridgeLookupToolName, reason: string): ToolResult {
  return buildObservationToolResult({
    success: false,
    error: reason,
    result: {
      toolName,
      observationOnly: true,
      denied: true,
      reason,
    },
  });
}

export function buildBridgeLookupSnapshot(
  args: BuildBridgeLookupSnapshotArgs,
): BridgeLookupSnapshot {
  const view = args.packet.view;
  return {
    current: {
      campaignId: args.frame.campaignId,
      tick: args.frame.tick,
      playerActorId: args.frame.playerActorId,
      currentLocationId: args.frame.currentLocationId,
      currentSceneScopeId: args.frame.currentSceneScopeId,
      currentLocationName: args.frame.currentLocationName ?? null,
      currentSceneScopeName: args.frame.currentSceneScopeName ?? null,
    },
    visibleActors: view.visibleActors.map((actor) => ({
      ...actor,
      tags: actor.tags ? [...actor.tags] : undefined,
    })),
    awarenessHints: [...view.awarenessHints],
    legalTargets: view.legalTargets.map((candidate) => ({
      ...candidate,
      tags: candidate.tags ? [...candidate.tags] : undefined,
    })),
    legalMovement: view.legalMovement.map((candidate) => ({
      ...candidate,
      path: candidate.path ? [...candidate.path] : undefined,
    })),
    localRecentEvents: view.localRecentEvents.map((event) => ({
      ...event,
      actorIds: [...event.actorIds],
    })),
    playerKnownFacts: [...(args.playerKnownFacts ?? [])],
    allowedTools: [...view.allowedTools],
  };
}

function getSnapshot(context: ToolExecutionContext): BridgeLookupSnapshot | null {
  return context.bridgeLookup ?? null;
}

function listVisibleAffordances(
  toolName: BridgeLookupToolName,
  context: ToolExecutionContext,
): ToolResult {
  const snapshot = getSnapshot(context);
  if (!snapshot) return denial(toolName, "bridge_lookup_context_unavailable");

  return observation(toolName, {
    current: snapshot.current,
    visibleActors: snapshot.visibleActors.map((actor) => compactActor(actor, 1)),
    legalTargets: snapshot.legalTargets.map((candidate) => compactTarget(candidate, 1)),
    legalMovement: snapshot.legalMovement
      .filter((candidate) => candidate.connected)
      .map((candidate) => compactMovement(candidate, 1)),
    visibleFactRefs: [
      ...snapshot.localRecentEvents.map((event) => event.id),
      ...snapshot.playerKnownFacts.map((fact) => fact.id),
    ],
    allowedTools: snapshot.allowedTools,
  });
}

function listNavigationOptions(
  toolName: BridgeLookupToolName,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
): ToolResult {
  const snapshot = getSnapshot(context);
  if (!snapshot) return denial(toolName, "bridge_lookup_context_unavailable");
  const maxResults = readMaxResults(input, 8);
  const candidates = snapshot.legalMovement
    .filter((candidate) => candidate.connected)
    .slice(0, maxResults)
    .map((candidate) => compactMovement(candidate, 1));

  return observation(toolName, {
    current: snapshot.current,
    candidates,
    count: candidates.length,
  });
}

function findTargets(input: {
  toolName: BridgeLookupToolName;
  rawInput: Record<string, unknown>;
  context: ToolExecutionContext;
  types: readonly SceneFrameTargetCandidate["type"][];
  includeMovementLocations?: boolean;
}): ToolResult {
  const snapshot = getSnapshot(input.context);
  if (!snapshot) return denial(input.toolName, "bridge_lookup_context_unavailable");
  const query = readString(input.rawInput, "query");
  const tags = readStringArray(input.rawInput, "tags");
  const maxResults = readMaxResults(input.rawInput);
  const candidates: Array<Record<string, unknown> & { score: number; label: string }> = [];

  for (const candidate of snapshot.legalTargets.filter((entry) => input.types.includes(entry.type))) {
    const score = scoreText({
      query,
      tags,
      label: candidate.label,
      refs: candidateRefs(candidate),
      candidateTags: candidate.tags,
    });
    if (score > 0) {
      candidates.push(compactTarget(candidate, score) as Record<string, unknown> & { score: number; label: string });
    }
  }

  if (input.includeMovementLocations) {
    for (const candidate of snapshot.legalMovement.filter((entry) => entry.connected)) {
      const score = scoreText({
        query,
        tags,
        label: candidate.label,
        refs: movementRefs(candidate),
      });
      if (score > 0) {
        candidates.push(compactMovement(candidate, score) as Record<string, unknown> & { score: number; label: string });
      }
    }
  }

  return observation(input.toolName, {
    queryMatched: candidates.length > 0,
    candidates: sortCandidates(candidates).slice(0, maxResults),
    count: Math.min(candidates.length, maxResults),
  });
}

function findActors(
  toolName: BridgeLookupToolName,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
): ToolResult {
  const snapshot = getSnapshot(context);
  if (!snapshot) return denial(toolName, "bridge_lookup_context_unavailable");
  const query = readString(input, "query") ?? readString(input, "relationHint");
  const tags = readStringArray(input, "tags");
  const maxResults = readMaxResults(input);
  const byRef = new Map<string, Record<string, unknown> & { score: number; label: string }>();

  for (const actor of snapshot.visibleActors) {
    const score = scoreText({
      query,
      tags,
      label: actor.label,
      refs: actorRefs(actor),
      candidateTags: actor.tags,
    });
    if (score > 0) {
      byRef.set(actor.actorId ?? actor.id, compactActor(actor, score) as Record<string, unknown> & { score: number; label: string });
    }
  }

  for (const candidate of snapshot.legalTargets.filter((entry) => entry.type === "actor")) {
    const score = scoreText({
      query,
      tags,
      label: candidate.label,
      refs: candidateRefs(candidate),
      candidateTags: candidate.tags,
    });
    if (score <= 0) continue;
    const ref = candidate.actorId ?? candidate.id;
    const existing = byRef.get(ref);
    if (!existing || score > existing.score) {
      byRef.set(ref, compactTarget(candidate, score) as Record<string, unknown> & { score: number; label: string });
    }
  }

  const candidates = sortCandidates([...byRef.values()]).slice(0, maxResults);
  return observation(toolName, {
    queryMatched: candidates.length > 0,
    candidates,
    count: candidates.length,
  });
}

function findPoiCandidates(
  toolName: BridgeLookupToolName,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
): ToolResult {
  const snapshot = getSnapshot(context);
  if (!snapshot) return denial(toolName, "bridge_lookup_context_unavailable");
  const query = readString(input, "query");
  const includePotential = readBoolean(input, "includePotential");
  const targetResult = findTargets({
    toolName,
    rawInput: input,
    context,
    types: ["location", "item"],
    includeMovementLocations: true,
  });
  const resultRecord = targetResult.result && typeof targetResult.result === "object"
    ? targetResult.result as Record<string, unknown>
    : {};
  const candidates = Array.isArray(resultRecord.candidates)
    ? [...resultRecord.candidates] as Record<string, unknown>[]
    : [];

  if (includePotential && query && candidates.length === 0 && snapshot.current.currentLocationId) {
    candidates.push({
      ref: `potential:${snapshot.current.currentLocationId}:${words(query).join("-").slice(0, 48) || "poi"}`,
      type: "potential_poi",
      label: query,
      score: 1,
      legal: false,
      requires: "future create_minor_poi authority",
      sourceRefs: uniqueStrings([
        snapshot.current.currentLocationId,
        snapshot.current.currentLocationName,
        "current_location",
      ]),
      observationOnly: true,
    });
  }

  return observation(toolName, {
    queryMatched: candidates.length > 0,
    candidates: candidates.slice(0, readMaxResults(input)),
    count: Math.min(candidates.length, readMaxResults(input)),
  });
}

function factRefs(fact: BridgeKnownFactSnapshot): string[] {
  return uniqueStrings([fact.id, ...fact.sourceRefs]);
}

function allFacts(snapshot: BridgeLookupSnapshot): BridgeKnownFactSnapshot[] {
  const visibleEvents: BridgeKnownFactSnapshot[] = snapshot.localRecentEvents.map((event) => ({
    id: event.id,
    summary: event.summary,
    visibilityRoute: "player_visible",
    confidence: 0.85,
    sourceRefs: uniqueStrings([event.id, event.source, ...event.actorIds]),
  }));
  return [...visibleEvents, ...snapshot.playerKnownFacts];
}

function inspectKnownFact(
  toolName: BridgeLookupToolName,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
): ToolResult {
  const snapshot = getSnapshot(context);
  if (!snapshot) return denial(toolName, "bridge_lookup_context_unavailable");
  const query = readString(input, "query");
  const ref = readString(input, "ref");
  const maxResults = readMaxResults(input, 3);
  const candidates = allFacts(snapshot)
    .map((fact) => ({
      fact,
      score:
        (ref && factRefs(fact).some((candidateRef) => normalize(candidateRef) === normalize(ref)) ? 100 : 0)
        + scoreText({
          query,
          tags: [],
          label: fact.summary,
          refs: factRefs(fact),
        }),
    }))
    .filter(({ score }) => score > 0 || (!query && !ref))
    .sort((left, right) => right.score - left.score || left.fact.id.localeCompare(right.fact.id))
    .slice(0, maxResults)
    .map(({ fact, score }) => ({
      id: fact.id,
      summary: fact.summary,
      visibilityRoute: fact.visibilityRoute,
      confidence: fact.confidence,
      sourceRefs: fact.sourceRefs,
      score,
      observationOnly: true,
    }));

  if (candidates.length === 0) {
    return denial(toolName, "no_player_visible_or_known_fact");
  }

  return observation(toolName, {
    found: true,
    facts: candidates,
    count: candidates.length,
  });
}

function refMatches(ref: string, refs: readonly string[]): boolean {
  const normalized = normalize(ref);
  return refs.some((candidateRef) => normalize(candidateRef) === normalized);
}

function checkRoute(
  toolName: BridgeLookupToolName,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
): ToolResult {
  const snapshot = getSnapshot(context);
  if (!snapshot) return denial(toolName, "bridge_lookup_context_unavailable");
  const destinationRef = readString(input, "destinationRef");
  if (!destinationRef) return denial(toolName, "missing_destination_ref");
  const actorRef = readString(input, "actorRef");
  if (actorRef && !context.subjectActorRefs.has(normalize(actorRef)) && !context.legalActorRefs.has(normalize(actorRef))) {
    return denial(toolName, "actor_ref_not_visible_or_allowed");
  }

  if (
    refMatches(destinationRef, uniqueStrings([
      snapshot.current.currentLocationId,
      snapshot.current.currentLocationName,
      snapshot.current.currentSceneScopeId,
      snapshot.current.currentSceneScopeName,
      "current_location",
      "current_scene",
    ]))
  ) {
    return observation(toolName, {
      routeStatus: "already_here",
      destination: {
        locationId: snapshot.current.currentLocationId,
        label: snapshot.current.currentLocationName ?? snapshot.current.currentSceneScopeName ?? "current location",
      },
      cost: 0,
      path: uniqueStrings([snapshot.current.currentLocationId]),
    });
  }

  const route = snapshot.legalMovement.find((candidate) =>
    candidate.connected && refMatches(destinationRef, movementRefs(candidate))
  );
  if (!route) return denial(toolName, "route_not_visible_or_legal");

  return observation(toolName, {
    routeStatus: "legal",
    destination: {
      ref: route.id,
      locationId: route.locationId,
      label: route.label,
    },
    cost: route.travelCost ?? null,
    path: route.path ?? [],
    sourceRefs: movementRefs(route),
  });
}

export function executeBridgeCandidateTool(
  toolName: BridgeLookupToolName,
  input: unknown,
  context: ToolExecutionContext | undefined,
): ToolResult {
  if (!context) return denial(toolName, "bridge_lookup_context_unavailable");
  const rawInput = asInput(input);

  switch (toolName) {
    case "list_visible_affordances":
      return listVisibleAffordances(toolName, context);
    case "list_navigation_options":
      return listNavigationOptions(toolName, rawInput, context);
    case "find_location_candidates":
      return findTargets({
        toolName,
        rawInput,
        context,
        types: ["location"],
        includeMovementLocations: true,
      });
    case "find_object_candidates":
      return findTargets({
        toolName,
        rawInput,
        context,
        types: ["item"],
      });
    case "find_actor_candidates":
      return findActors(toolName, rawInput, context);
    case "find_poi_candidates":
      return findPoiCandidates(toolName, rawInput, context);
    case "inspect_known_fact":
      return inspectKnownFact(toolName, rawInput, context);
    case "check_route":
      return checkRoute(toolName, rawInput, context);
  }
}
