import {
  buildObservationToolResult,
  type ToolResult,
} from "./tool-result.js";
import { runtimeToolInputSchemas } from "./runtime-tool-input-schemas.js";
import {
  canonicalEventRef,
  uniqueModelRefs,
} from "./ref-provenance.js";
import type {
  ModelFacingActor,
  ModelFacingPromptSafety,
  ModelFacingScenePacket,
} from "./model-facing-scene.js";
import {
  isBackendOnlyModelRef,
  sanitizeModelFacingText,
} from "./model-facing-ref-safety.js";
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
  truthStatus?: "observed" | "verified" | "reported" | "rumored" | "claimed" | "believed" | "disputed";
  confidence: number;
  sourceRefs: string[];
}

export interface BridgeLookupSnapshot {
  modelFacingSafety?: ModelFacingPromptSafety;
  current: {
    campaignId: string;
    tick: number;
    playerActorId: string;
    currentLocationId: string | null;
    currentSceneScopeId: string | null;
    currentLocationName: string | null;
    currentSceneScopeName: string | null;
    currentLocationDescription: string | null;
    currentSceneScopeDescription: string | null;
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

interface BridgeDisplayAliases {
  targetRefs: Map<SceneFrameTargetCandidate, string>;
  movementRefs: Map<SceneFrameMovementCandidate, string>;
  actorRefs: Map<ModelFacingActor, string>;
  factRefs: Map<BridgeKnownFactSnapshot, string>;
  refAliases: Map<string, string>;
}

function addAlias(aliases: Map<string, string>, rawRef: string | null | undefined, alias: string): void {
  const trimmed = rawRef?.trim();
  if (!trimmed) return;
  aliases.set(normalize(trimmed), alias);
}

function buildDisplayAliases(
  snapshot: BridgeLookupSnapshot,
  facts: readonly BridgeKnownFactSnapshot[],
): BridgeDisplayAliases {
  const aliases: BridgeDisplayAliases = {
    targetRefs: new Map(),
    movementRefs: new Map(),
    actorRefs: new Map(),
    factRefs: new Map(),
    refAliases: new Map(),
  };

  snapshot.visibleActors.forEach((actor, index) => {
    const alias = `actor${index + 1}`;
    aliases.actorRefs.set(actor, alias);
    actorRefs(actor).forEach((ref) => addAlias(aliases.refAliases, ref, alias));
  });

  snapshot.legalTargets.forEach((target, index) => {
    const actorAlias = target.actorId
      ? aliases.refAliases.get(normalize(target.actorId))
      : undefined;
    const alias = target.type === "actor" && actorAlias
      ? actorAlias
      : `target${index + 1}`;
    aliases.targetRefs.set(target, alias);
    candidateRefs(target).forEach((ref) => addAlias(aliases.refAliases, ref, alias));
  });

  snapshot.legalMovement.forEach((movement, index) => {
    const alias = `route${index + 1}`;
    aliases.movementRefs.set(movement, alias);
    movementRefs(movement).forEach((ref) => addAlias(aliases.refAliases, ref, alias));
  });

  facts.forEach((fact, index) => {
    const alias = `fact${index + 1}`;
    aliases.factRefs.set(fact, alias);
    factRefs(fact).forEach((ref) => addAlias(aliases.refAliases, ref, alias));
  });

  addAlias(aliases.refAliases, snapshot.current.currentLocationId, "current_location");
  addAlias(aliases.refAliases, snapshot.current.currentSceneScopeId, "current_scene");
  addAlias(aliases.refAliases, snapshot.current.currentLocationName, "current_location");
  addAlias(aliases.refAliases, snapshot.current.currentSceneScopeName, "current_scene");

  return aliases;
}

function compactCurrent(snapshot: BridgeLookupSnapshot): Record<string, unknown> {
  return {
    actor: "Player",
    locationRef: "current_location",
    sceneRef: "current_scene",
    locationName: snapshot.current.currentLocationName,
    sceneName: snapshot.current.currentSceneScopeName,
    tick: snapshot.current.tick,
  };
}

function safeUsableAs(...values: Array<string | null | undefined>): string[] {
  return uniqueStrings(values).filter(isConsumableObservationRef);
}

function safeLookupText(
  value: string,
  safety?: ModelFacingPromptSafety,
): string {
  return sanitizeModelFacingText(value, { safety });
}

function isUnsafeBridgeInputRef(
  context: ToolExecutionContext,
  value: string | null,
): boolean {
  if (!value) return false;
  return isBackendOnlyModelRef(value) || Boolean(context.backendOnlyRefs?.has(normalize(value)));
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
  aliases: BridgeDisplayAliases,
): Record<string, unknown> {
  const ref = aliases.targetRefs.get(candidate) ?? candidate.label;
  const payload: Record<string, unknown> = {
    ref,
    type: candidate.type,
    label: candidate.label,
    score,
    observationOnly: true,
    usableAs: safeUsableAs(ref, candidate.label),
  };
  if (candidate.tags && candidate.tags.length > 0) {
    payload.visibleTags = [...candidate.tags];
  }
  return payload;
}

function compactMovement(
  candidate: SceneFrameMovementCandidate,
  score: number,
  aliases: BridgeDisplayAliases,
): Record<string, unknown> {
  const ref = aliases.movementRefs.get(candidate) ?? candidate.label;
  return {
    ref,
    type: "location",
    label: candidate.label,
    score,
    connected: candidate.connected,
    travelCost: candidate.travelCost ?? null,
    observationOnly: true,
    usableAs: safeUsableAs(ref, candidate.label),
  };
}

function compactActor(
  actor: ModelFacingActor,
  score: number,
  aliases: BridgeDisplayAliases,
): Record<string, unknown> {
  const ref = aliases.actorRefs.get(actor) ?? actor.label;
  return {
    ref,
    type: "actor",
    label: actor.label,
    score,
    observationOnly: true,
    usableAs: safeUsableAs(ref, actor.label),
  };
}

function compactFact(
  fact: BridgeKnownFactSnapshot,
  score: number,
  aliases: BridgeDisplayAliases,
  safety?: ModelFacingPromptSafety,
): Record<string, unknown> {
  const ref = aliases.factRefs.get(fact) ?? "fact";
  return {
    ref,
    kind: "fact",
    summary: safeLookupText(fact.summary, safety),
    visibilityRoute: fact.visibilityRoute,
    confidence: fact.confidence,
    score,
    observationOnly: true,
    usableAs: safeUsableAs(ref),
  };
}

function isConsumableObservationRef(value: string): boolean {
  const ref = value.trim();
  const normalized = normalize(ref);
  if (!ref || isBackendOnlyModelRef(ref)) return false;
  if (/^potential(?:_|:|$)/iu.test(normalized)) return false;
  if (/^current_(?:location|scene):.+:description$/iu.test(ref)) return false;
  return true;
}

function addConsumableObservationRefs(value: unknown, refs: string[]): void {
  if (typeof value === "string") {
    if (isConsumableObservationRef(value)) refs.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => addConsumableObservationRefs(entry, refs));
    return;
  }
}

function collectBridgeModelSafeRefs(payload: unknown): string[] {
  const refs: string[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === "ref" || key === "locationRef" || key === "sceneRef" || key === "visibleFactRefs" || key === "usableAs") {
        addConsumableObservationRefs(entry, refs);
        continue;
      }
      if (Array.isArray(entry) || (entry && typeof entry === "object")) {
        visit(entry);
      }
    }
  };

  visit(payload);
  return uniqueModelRefs(refs);
}

const OBSERVATION_CATEGORY_KEYWORDS = {
  camera: [
    "camera",
    "cctv",
    "lens",
    "surveillance",
    "recorder",
    "monitor",
  ],
  barrier: [
    "barrier",
    "barricade",
    "blockade",
    "gate",
    "fence",
    "wall",
    "ward",
    "curtain",
    "seal",
    "checkpoint",
  ],
  witness: [
    "witness",
    "onlooker",
    "bystander",
    "civilian",
    "crowd",
    "staff",
    "clerk",
    "guard",
    "personnel",
  ],
  personnel: [
    "personnel",
    "staff",
    "guard",
    "officer",
    "warden",
    "clerk",
    "attendant",
    "crew",
    "sorcerer",
    "jujutsu",
  ],
} as const;

function partsMatchKeywords(
  parts: Array<string | null | undefined>,
  keywords: readonly string[],
): boolean {
  const haystack = parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function targetMatchesCategory(
  candidate: SceneFrameTargetCandidate,
  keywords: readonly string[],
): boolean {
  return partsMatchKeywords([
    candidate.label,
    ...(candidate.tags ?? []),
  ], keywords);
}

function actorMatchesCategory(actor: ModelFacingActor, keywords: readonly string[]): boolean {
  return partsMatchKeywords([
    actor.label,
    ...(actor.tags ?? []),
    actor.summary,
  ], keywords);
}

function factMatchesCategory(fact: BridgeKnownFactSnapshot, keywords: readonly string[]): boolean {
  return partsMatchKeywords([fact.summary], keywords);
}

function categoryFacts(
  facts: readonly BridgeKnownFactSnapshot[],
  keywords: readonly string[],
  maxResults: number,
  aliases: BridgeDisplayAliases,
  safety?: ModelFacingPromptSafety,
): Record<string, unknown>[] {
  return facts
    .filter((fact) => factMatchesCategory(fact, keywords))
    .slice(0, maxResults)
    .map((fact) => compactFact(fact, 1, aliases, safety));
}

function categoryTargets(
  targets: readonly SceneFrameTargetCandidate[],
  keywords: readonly string[],
  maxResults: number,
  aliases: BridgeDisplayAliases,
): Record<string, unknown>[] {
  return targets
    .filter((target) => targetMatchesCategory(target, keywords))
    .slice(0, maxResults)
    .map((target) => compactTarget(target, 1, aliases));
}

function sortCandidates<T extends { score: number; label: string }>(values: T[]): T[] {
  return values.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.label.localeCompare(right.label);
  });
}

function observation(toolName: BridgeLookupToolName, result: Record<string, unknown>): ToolResult {
  const payload = {
    toolName,
    observationOnly: true,
    ...result,
  };
  return buildObservationToolResult({
    result: payload,
    modelSafeRefs: collectBridgeModelSafeRefs(payload),
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

function cloneKnownFactForLookup(
  fact: BridgeKnownFactSnapshot,
  safety: ModelFacingPromptSafety,
): BridgeKnownFactSnapshot {
  return {
    ...fact,
    summary: safeLookupText(fact.summary, safety),
    sourceRefs: [...fact.sourceRefs],
  };
}

export function buildBridgeLookupSnapshot(
  args: BuildBridgeLookupSnapshotArgs,
): BridgeLookupSnapshot {
  const view = args.packet.view;
  return {
    modelFacingSafety: args.packet.safety,
    current: {
      campaignId: args.frame.campaignId,
      tick: args.frame.tick,
      playerActorId: args.frame.playerActorId,
      currentLocationId: args.frame.currentLocationId,
      currentSceneScopeId: args.frame.currentSceneScopeId,
      currentLocationName: view.localScene.currentLocationName ?? null,
      currentSceneScopeName: view.localScene.currentSceneScopeName ?? null,
      currentLocationDescription: args.packet.view.localScene.currentLocationDescription ?? null,
      currentSceneScopeDescription: args.packet.view.localScene.currentSceneScopeDescription ?? null,
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
    playerKnownFacts: (args.playerKnownFacts ?? []).map((fact) =>
      cloneKnownFactForLookup(fact, args.packet.safety)),
    allowedTools: [...view.allowedTools],
  };
}

function getSnapshot(context: ToolExecutionContext): BridgeLookupSnapshot | null {
  return context.bridgeLookup ?? null;
}

function listVisibleAffordances(
  toolName: BridgeLookupToolName,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
): ToolResult {
  const snapshot = getSnapshot(context);
  if (!snapshot) return denial(toolName, "bridge_lookup_context_unavailable");
  const maxResults = readMaxResults(input, 8);
  const visibleFacts = allFacts(snapshot);
  const aliases = buildDisplayAliases(snapshot, visibleFacts);
  const connectedRoutes = snapshot.legalMovement.filter((candidate) => candidate.connected);
  const visiblePersonnel = snapshot.visibleActors.filter(
    (actor) => (actor.actorId ?? actor.id) !== snapshot.current.playerActorId,
  );
  const witnessActors = visiblePersonnel.filter((actor) =>
    actorMatchesCategory(actor, OBSERVATION_CATEGORY_KEYWORDS.witness)
  );
  const personnelActors = visiblePersonnel.filter((actor) =>
    actorMatchesCategory(actor, OBSERVATION_CATEGORY_KEYWORDS.personnel)
  );
  const visiblePhysicalTargets = snapshot.legalTargets.filter((target) => target.type !== "actor");
  const cameraTargets = categoryTargets(
    visiblePhysicalTargets,
    OBSERVATION_CATEGORY_KEYWORDS.camera,
    maxResults,
    aliases,
  );
  const cameraFacts = categoryFacts(
    visibleFacts,
    OBSERVATION_CATEGORY_KEYWORDS.camera,
    maxResults,
    aliases,
    snapshot.modelFacingSafety,
  );
  const barrierTargets = categoryTargets(
    visiblePhysicalTargets,
    OBSERVATION_CATEGORY_KEYWORDS.barrier,
    maxResults,
    aliases,
  );
  const barrierFacts = categoryFacts(
    visibleFacts,
    OBSERVATION_CATEGORY_KEYWORDS.barrier,
    maxResults,
    aliases,
    snapshot.modelFacingSafety,
  );
  const witnessFacts = categoryFacts(
    visibleFacts,
    OBSERVATION_CATEGORY_KEYWORDS.witness,
    maxResults,
    aliases,
    snapshot.modelFacingSafety,
  );
  const personnelFacts = categoryFacts(
    visibleFacts,
    OBSERVATION_CATEGORY_KEYWORDS.personnel,
    maxResults,
    aliases,
    snapshot.modelFacingSafety,
  );

  return observation(toolName, {
    current: compactCurrent(snapshot),
    visibleActors: snapshot.visibleActors.map((actor) => compactActor(actor, 1, aliases)),
    legalTargets: snapshot.legalTargets.map((candidate) => compactTarget(candidate, 1, aliases)),
    legalMovement: snapshot.legalMovement
      .filter((candidate) => candidate.connected)
      .map((candidate) => compactMovement(candidate, 1, aliases)),
    visibleFactRefs: [
      ...visibleFacts.map((fact) => aliases.factRefs.get(fact)),
    ].filter((ref): ref is string => Boolean(ref)),
    visibleFacts: visibleFacts
      .slice(0, maxResults)
      .map((fact) => compactFact(fact, 1, aliases, snapshot.modelFacingSafety)),
    categories: {
      exitsRoutes: connectedRoutes.slice(0, maxResults).map((candidate) => compactMovement(candidate, 1, aliases)),
      physicalAffordances: visiblePhysicalTargets
        .slice(0, maxResults)
        .map((candidate) => compactTarget(candidate, 1, aliases)),
      cameras: {
        targets: cameraTargets,
        facts: cameraFacts,
        absence: cameraTargets.length === 0 && cameraFacts.length === 0
          ? "No visible camera refs are present in current scene packet or player-visible/player-known facts."
          : null,
      },
      barriers: {
        targets: barrierTargets,
        facts: barrierFacts,
        absence: barrierTargets.length === 0 && barrierFacts.length === 0
          ? "No visible barrier refs are present in current scene packet or player-visible/player-known facts."
          : null,
      },
      witnesses: {
        actors: witnessActors.slice(0, maxResults).map((actor) => compactActor(actor, 1, aliases)),
        facts: witnessFacts,
        absence: witnessActors.length === 0 && witnessFacts.length === 0
          ? "No clearly identified witness refs are visible in current scene packet or player-visible/player-known facts."
          : null,
      },
      personnel: {
        actors: (personnelActors.length > 0 ? personnelActors : visiblePersonnel)
          .slice(0, maxResults)
          .map((actor) => compactActor(actor, 1, aliases)),
        facts: personnelFacts,
        absence: visiblePersonnel.length === 0 && personnelFacts.length === 0
          ? "No non-player personnel actors are clearly visible in current scene packet."
          : null,
      },
      hints: snapshot.awarenessHints.slice(0, maxResults),
    },
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
  const facts = allFacts(snapshot);
  const aliases = buildDisplayAliases(snapshot, facts);
  const candidates = snapshot.legalMovement
    .filter((candidate) => candidate.connected)
    .slice(0, maxResults)
    .map((candidate) => compactMovement(candidate, 1, aliases));

  return observation(toolName, {
    current: compactCurrent(snapshot),
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
  const aliases = buildDisplayAliases(snapshot, allFacts(snapshot));
  const candidates: Array<Record<string, unknown> & { score: number; label: string }> = [];

  for (const candidate of snapshot.legalTargets.filter((entry) => input.types.includes(entry.type))) {
    const score = scoreText({
      query,
      tags,
      label: candidate.label,
      refs: safeUsableAs(aliases.targetRefs.get(candidate), candidate.label),
      candidateTags: candidate.tags,
    });
    if (score > 0) {
      candidates.push(compactTarget(candidate, score, aliases) as Record<string, unknown> & { score: number; label: string });
    }
  }

  if (input.includeMovementLocations) {
    for (const candidate of snapshot.legalMovement.filter((entry) => entry.connected)) {
      const score = scoreText({
        query,
        tags,
        label: candidate.label,
        refs: movementDisplayRefs(candidate, snapshot, aliases),
      });
      if (score > 0) {
        candidates.push(compactMovement(candidate, score, aliases) as Record<string, unknown> & { score: number; label: string });
      }
    }
  }

  return observation(input.toolName, {
    queryMatched: candidates.length > 0,
    candidates: sortCandidates(candidates).slice(0, maxResults),
    count: Math.min(candidates.length, maxResults),
    detailAuthority: input.types.includes("item")
      ? "candidate_identity_and_visible_tags_only"
      : "candidate_identity_only",
    limitations: input.types.includes("item")
      ? "This lookup confirms matching visible item labels and visible tags only; it does not inspect contents, markings, text, serial numbers, registration numbers, addresses, or the absence of details not returned."
      : "This lookup confirms matching visible candidate labels only; it does not inspect unreturned details or prove their absence.",
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
  const aliases = buildDisplayAliases(snapshot, allFacts(snapshot));
  const byRef = new Map<string, Record<string, unknown> & { score: number; label: string }>();

  for (const actor of snapshot.visibleActors) {
    const score = scoreText({
      query,
      tags,
      label: actor.label,
      refs: safeUsableAs(aliases.actorRefs.get(actor), actor.label),
      candidateTags: actor.tags,
    });
    if (score > 0) {
      byRef.set(actor.actorId ?? actor.id, compactActor(actor, score, aliases) as Record<string, unknown> & { score: number; label: string });
    }
  }

  for (const candidate of snapshot.legalTargets.filter((entry) => entry.type === "actor")) {
    const score = scoreText({
      query,
      tags,
      label: candidate.label,
      refs: safeUsableAs(aliases.targetRefs.get(candidate), candidate.label),
      candidateTags: candidate.tags,
    });
    if (score <= 0) continue;
    const ref = candidate.actorId ?? candidate.id;
    const existing = byRef.get(ref);
    if (!existing || score > existing.score) {
      byRef.set(ref, compactTarget(candidate, score, aliases) as Record<string, unknown> & { score: number; label: string });
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
      ref: "potential_poi_1",
      type: "potential_poi",
      label: query,
      score: 1,
      legal: false,
      requires: "future create_minor_poi authority",
      observationOnly: true,
      usableAs: [],
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

function currentSceneDescriptionFacts(snapshot: BridgeLookupSnapshot): BridgeKnownFactSnapshot[] {
  const facts: BridgeKnownFactSnapshot[] = [];
  if (snapshot.current.currentLocationDescription?.trim()) {
    facts.push({
      id: "visible_fact:current_location_description",
      summary: `${snapshot.current.currentLocationName ?? "Current location"}: ${snapshot.current.currentLocationDescription.trim()}`,
      visibilityRoute: "player_visible",
      truthStatus: "observed",
      confidence: 1,
      sourceRefs: uniqueStrings([
        snapshot.current.currentLocationName,
        "current_location",
      ]),
    });
  }
  if (
    snapshot.current.currentSceneScopeDescription?.trim()
    && snapshot.current.currentSceneScopeId !== snapshot.current.currentLocationId
  ) {
    facts.push({
      id: "visible_fact:current_scene_description",
      summary: `${snapshot.current.currentSceneScopeName ?? "Current scene"}: ${snapshot.current.currentSceneScopeDescription.trim()}`,
      visibilityRoute: "player_visible",
      truthStatus: "observed",
      confidence: 1,
      sourceRefs: uniqueStrings([
        snapshot.current.currentSceneScopeName,
        "current_scene",
      ]),
    });
  }
  return facts;
}

function allFacts(snapshot: BridgeLookupSnapshot): BridgeKnownFactSnapshot[] {
  const visibleEvents: BridgeKnownFactSnapshot[] = snapshot.localRecentEvents.map((event) => ({
    id: canonicalEventRef(event.id),
    summary: event.summary,
    visibilityRoute: "player_visible",
    truthStatus: "observed",
    confidence: 0.85,
    sourceRefs: uniqueStrings([canonicalEventRef(event.id)]),
  }));
  return [
    ...currentSceneDescriptionFacts(snapshot),
    ...visibleEvents,
    ...snapshot.playerKnownFacts,
  ];
}

function visibleFacts(snapshot: BridgeLookupSnapshot): BridgeKnownFactSnapshot[] {
  return allFacts(snapshot).filter((fact) => fact.visibilityRoute === "player_visible");
}

function factsForInspectScope(
  snapshot: BridgeLookupSnapshot,
  scope: string | null,
): BridgeKnownFactSnapshot[] {
  switch (scope) {
    case "known":
      return snapshot.playerKnownFacts;
    case "visible":
    case "current_scene":
    case "current_location":
      return visibleFacts(snapshot);
    default:
      return allFacts(snapshot);
  }
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
  if (isUnsafeBridgeInputRef(context, ref)) {
    return denial(toolName, "backend_ref_not_model_facing");
  }
  const maxResults = readMaxResults(input, 3);
  const facts = factsForInspectScope(snapshot, readString(input, "scope"));
  const aliases = buildDisplayAliases(snapshot, facts);
  const candidates = facts
    .map((fact) => ({
      fact,
      score:
        (ref && refMatches(ref, safeUsableAs(aliases.factRefs.get(fact))) ? 100 : 0)
        + scoreText({
          query,
          tags: [],
          label: fact.summary,
          refs: safeUsableAs(aliases.factRefs.get(fact)),
        }),
    }))
    .filter(({ score }) => score > 0 || (!query && !ref))
    .sort((left, right) => right.score - left.score || left.fact.id.localeCompare(right.fact.id))
    .slice(0, maxResults)
    .map(({ fact, score }) => compactFact(fact, score, aliases, snapshot.modelFacingSafety));

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

function displayRefMatches(ref: string, refs: readonly string[], aliases: BridgeDisplayAliases): boolean {
  if (refMatches(ref, refs)) return true;
  const normalized = normalize(ref);
  return refs.some((candidateRef) => {
    const alias = aliases.refAliases.get(normalize(candidateRef));
    return Boolean(alias && normalize(alias) === normalized);
  });
}

function movementDisplayRefs(
  movement: SceneFrameMovementCandidate,
  snapshot: BridgeLookupSnapshot,
  aliases: BridgeDisplayAliases,
): string[] {
  return safeUsableAs(
    aliases.movementRefs.get(movement),
    movement.label,
    ...snapshot.legalTargets
      .filter((target) => target.type === "location" && target.locationId === movement.locationId)
      .map((target) => aliases.targetRefs.get(target)),
  );
}

function checkRoute(
  toolName: BridgeLookupToolName,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
): ToolResult {
  const snapshot = getSnapshot(context);
  if (!snapshot) return denial(toolName, "bridge_lookup_context_unavailable");
  const aliases = buildDisplayAliases(snapshot, allFacts(snapshot));
  const destinationRef = readString(input, "destinationRef");
  if (!destinationRef) return denial(toolName, "missing_destination_ref");
  const actorRef = readString(input, "actorRef");
  if (isUnsafeBridgeInputRef(context, actorRef) || isUnsafeBridgeInputRef(context, destinationRef)) {
    return denial(toolName, "backend_ref_not_model_facing");
  }
  const actorRefAllowed = !actorRef
    || context.subjectActorRefs.has(normalize(actorRef))
    || context.legalActorRefs.has(normalize(actorRef))
    || snapshot.visibleActors.some((actor) =>
      refMatches(actorRef, safeUsableAs(aliases.actorRefs.get(actor), actor.label))
    );
  if (!actorRefAllowed) {
    return denial(toolName, "actor_ref_not_visible_or_allowed");
  }

  if (
    displayRefMatches(destinationRef, uniqueStrings([
      snapshot.current.currentLocationId,
      snapshot.current.currentLocationName,
      snapshot.current.currentSceneScopeId,
      snapshot.current.currentSceneScopeName,
      "current_location",
      "current_scene",
    ]), aliases)
  ) {
    return observation(toolName, {
      routeStatus: "already_here",
      destination: {
        ref: "current_location",
        type: "location",
        label: snapshot.current.currentLocationName ?? snapshot.current.currentSceneScopeName ?? "current location",
      },
      cost: 0,
      path: ["current_location"],
      usableAs: safeUsableAs("current_location", snapshot.current.currentLocationName),
    });
  }

  const route = snapshot.legalMovement.find((candidate) =>
    candidate.connected
    && (
      displayRefMatches(destinationRef, movementRefs(candidate), aliases)
      || refMatches(destinationRef, movementDisplayRefs(candidate, snapshot, aliases))
    )
  );
  if (!route) return denial(toolName, "route_not_visible_or_legal");
  const routeRef = aliases.movementRefs.get(route) ?? route.label;

  return observation(toolName, {
    routeStatus: "legal",
    destination: {
      ref: routeRef,
      type: "location",
      label: route.label,
    },
    cost: route.travelCost ?? null,
    path: safeUsableAs("current_location", routeRef, route.label),
    usableAs: safeUsableAs(routeRef, route.label),
  });
}

export function executeBridgeCandidateTool(
  toolName: BridgeLookupToolName,
  input: unknown,
  context: ToolExecutionContext | undefined,
): ToolResult {
  if (!context) return denial(toolName, "bridge_lookup_context_unavailable");
  const parsedInput = runtimeToolInputSchemas[toolName].safeParse(input);
  if (!parsedInput.success) return denial(toolName, "invalid_tool_input");
  const rawInput = parsedInput.data as Record<string, unknown>;

  switch (toolName) {
    case "list_visible_affordances":
      return listVisibleAffordances(toolName, rawInput, context);
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
