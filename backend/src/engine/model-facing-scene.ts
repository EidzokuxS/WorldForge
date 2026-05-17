import type {
  SceneActor,
  SceneFrame,
  SceneFrameMovementCandidate,
  SceneFrameRecentEvent,
  SceneFrameTargetCandidate,
} from "./scene-frame.js";
import type { RuntimeToolName } from "./tool-schemas.js";
import {
  isBackendOnlyModelRef,
  sanitizeModelFacingJsonValue,
  sanitizeModelFacingText,
} from "./model-facing-ref-safety.js";

export interface ModelFacingActor {
  id: string;
  actorId?: string;
  type: SceneActor["type"];
  label: string;
  awareness: "clear";
  tags?: string[];
  summary?: string | null;
}

export interface ModelFacingSceneView {
  localScene: {
    campaignId: string;
    tick: number;
    playerActorId: string;
    currentLocationId: string | null;
    currentSceneScopeId: string | null;
    currentLocationName?: string | null;
    currentSceneScopeName?: string | null;
    currentLocationDescription?: string | null;
    currentSceneScopeDescription?: string | null;
  };
  visibleActors: ModelFacingActor[];
  awarenessHints: string[];
  privateContext: {
    hiddenActorCount: number;
    opaquePresenceCategories: string[];
  };
  localRecentEvents: SceneFrameRecentEvent[];
  legalTargets: SceneFrameTargetCandidate[];
  legalMovement: SceneFrameMovementCandidate[];
  allowedTools: RuntimeToolName[];
  oracle: SceneFrame["oracle"];
  oracleContext?: unknown;
  combatEnvelope?: unknown;
}

export interface ModelFacingScenePromptAlias {
  ref: string;
  label: string | null;
  description?: string | null;
}

export interface ModelFacingScenePromptActor {
  ref: string;
  type: SceneActor["type"];
  label: string;
  awareness: "clear";
  tags?: string[];
  summary?: string | null;
}

export interface ModelFacingScenePromptRecentEvent {
  tick: number;
  source: SceneFrameRecentEvent["source"];
  summary: string;
  actors?: string[];
}

export interface ModelFacingScenePromptTarget {
  ref: string;
  type: SceneFrameTargetCandidate["type"];
  label: string;
  awareness?: SceneFrameTargetCandidate["awareness"];
  tags?: string[];
}

export interface ModelFacingScenePromptMovement {
  ref: string;
  label: string;
  connected: boolean;
  travelCost?: number;
}

export interface ModelFacingScenePromptView {
  localScene: {
    tick: number;
    player: ModelFacingScenePromptAlias;
    currentLocation: ModelFacingScenePromptAlias | null;
    currentScene: ModelFacingScenePromptAlias | null;
  };
  visibleActors: ModelFacingScenePromptActor[];
  awarenessHints: string[];
  localRecentEvents: ModelFacingScenePromptRecentEvent[];
  legalTargets: ModelFacingScenePromptTarget[];
  legalMovement: ModelFacingScenePromptMovement[];
  allowedTools: RuntimeToolName[];
}

export interface ModelFacingPromptSafety {
  forbiddenTerms: string[];
  backendOnlyTerms?: string[];
}

export interface ModelFacingScenePacket {
  view: ModelFacingSceneView;
  safety: ModelFacingPromptSafety;
}

export interface ModelFacingSceneDiagnostics {
  visibleActorCount: number;
  hiddenActorCount: number;
  localRecentEventCount: number;
  allowedToolCount: number;
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    const key = normalizeTerm(trimmed);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function promptAliasToken(prefix: string, label: string | null | undefined, index: number): string {
  const slug = label
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${prefix}_${slug || index + 1}`;
}

function uniquePromptAlias(base: string, seen: Map<string, number>): string {
  const next = (seen.get(base) ?? 0) + 1;
  seen.set(base, next);
  return next === 1 ? base : `${base}_${next}`;
}

function actorPromptAlias(actor: ModelFacingActor, index: number): string {
  if (actor.type === "player" || actor.label.trim().toLowerCase() === "player") {
    return "Player";
  }
  return promptAliasToken("person", actor.label, index);
}

export function isUnsafeModelFacingRef(ref: string): boolean {
  return isBackendOnlyModelRef(ref);
}

function labelsForRecentEvent(
  event: SceneFrameRecentEvent,
  labelByRef: ReadonlyMap<string, string>,
): string[] {
  return uniqueStrings(
    event.actorIds.flatMap((ref) => {
      const label = labelByRef.get(ref);
      if (label) return [label];
      return isBackendOnlyModelRef(ref) ? [] : [ref];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addPromptRef(refs: Set<string>, value?: string | null): void {
  const trimmed = value?.trim();
  if (trimmed) refs.add(trimmed);
}

function addTerm(terms: Set<string>, value?: string | null): void {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length < 2) {
    return;
  }

  terms.add(trimmed);
}

function actorRefs(actor: SceneActor): string[] {
  return [actor.id, actor.actorId, actor.label].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
}

function extractPrivateProperTerms(text: string): string[] {
  const terms = new Set<string>();
  const titleCasePattern =
    /\b[A-Z][A-Za-z0-9'’]*(?:\s+(?:[A-Z][A-Za-z0-9'’]*|[-–]\s*[A-Z][A-Za-z0-9'’]*))+\b/g;

  for (const match of text.matchAll(titleCasePattern)) {
    addTerm(terms, match[0]);
    for (const part of match[0].split(/\s+[-–]\s+/)) {
      addTerm(terms, part);
    }
  }

  for (const part of text.split(/\s+[-–]\s+|[.;:!?]/)) {
    const trimmed = part.trim();
    if (/^[A-Z][A-Za-z0-9'’]*(?:\s+[A-Z][A-Za-z0-9'’]*)+$/.test(trimmed)) {
      addTerm(terms, trimmed);
    }
  }

  return [...terms];
}

function includesForbiddenTerm(value: string, forbiddenTerms: readonly string[]): boolean {
  const normalizedValue = normalizeTerm(value);
  return forbiddenTerms.some((term) => normalizedValue.includes(normalizeTerm(term)));
}

function collectBaseForbiddenTerms(frame: SceneFrame): Set<string> {
  const terms = new Set<string>();

  for (const ref of frame.perception.forbiddenActorIds ?? []) addTerm(terms, ref);
  for (const ref of frame.perception.forbiddenActorLabels ?? []) addTerm(terms, ref);
  for (const actor of frame.roster.background) {
    for (const ref of actorRefs(actor)) addTerm(terms, ref);
  }
  for (const actor of frame.roster.support.filter((entry) => entry.awareness !== "clear")) {
    for (const ref of actorRefs(actor)) addTerm(terms, ref);
  }

  return terms;
}

function collectForbiddenTerms(frame: SceneFrame): string[] {
  const terms = collectBaseForbiddenTerms(frame);

  for (const event of frame.recentEvents) {
    if (event.perceivableByPlayer) {
      continue;
    }

    for (const term of extractPrivateProperTerms(event.summary)) {
      addTerm(terms, term);
    }
  }

  return [...terms].sort((left, right) => right.length - left.length);
}

function addExposedTerm(terms: Set<string>, value?: string | null): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  terms.add(normalizeTerm(trimmed));
}

function collectExposedModelTerms(frame: SceneFrame): Set<string> {
  const terms = new Set<string>([
    "player",
    "current_location",
    "current_scene",
  ]);
  addExposedTerm(terms, frame.currentLocationName);
  addExposedTerm(terms, frame.currentSceneScopeName);

  for (const actor of [...frame.roster.active, ...frame.roster.support]) {
    if (!actorIsVisible(actor)) continue;
    addExposedTerm(terms, actor.label);
  }
  for (const target of frame.targetCandidates) {
    if (target.awareness && target.awareness !== "clear") continue;
    addExposedTerm(terms, target.label);
  }
  for (const movement of frame.movementCandidates) {
    if (!movement.connected) continue;
    addExposedTerm(terms, movement.label);
  }

  return terms;
}

function addBackendOnlyTerm(
  terms: Set<string>,
  exposedTerms: ReadonlySet<string>,
  value?: string | null,
): void {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length < 2) return;
  if (exposedTerms.has(normalizeTerm(trimmed))) return;
  terms.add(trimmed);
}

function looksLikeOpaqueBackendHandle(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/u.test(trimmed)) return false;
  return (
    isBackendOnlyModelRef(trimmed)
    || /(?:internal|uuid|id)\d*$/iu.test(trimmed)
    || /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\d*$/u.test(trimmed)
  );
}

function collectBackendOnlyTerms(frame: SceneFrame): string[] {
  const exposedTerms = collectExposedModelTerms(frame);
  const terms = new Set<string>();

  addBackendOnlyTerm(terms, exposedTerms, frame.campaignId);
  addBackendOnlyTerm(terms, exposedTerms, frame.playerActorId);
  addBackendOnlyTerm(terms, exposedTerms, frame.currentLocationId);
  addBackendOnlyTerm(terms, exposedTerms, frame.currentSceneScopeId);

  for (const actor of [
    ...frame.roster.active,
    ...frame.roster.support,
    ...frame.roster.background,
  ]) {
    addBackendOnlyTerm(terms, exposedTerms, actor.id);
    addBackendOnlyTerm(terms, exposedTerms, actor.actorId);
    addBackendOnlyTerm(terms, exposedTerms, actor.locationId);
    addBackendOnlyTerm(terms, exposedTerms, actor.sceneScopeId);
  }

  for (const event of frame.recentEvents) {
    addBackendOnlyTerm(terms, exposedTerms, event.id);
    for (const actorId of event.actorIds) {
      if (!looksLikeOpaqueBackendHandle(actorId)) continue;
      addBackendOnlyTerm(terms, exposedTerms, actorId);
    }
  }

  for (const candidate of frame.targetCandidates) {
    addBackendOnlyTerm(terms, exposedTerms, candidate.id);
    if ("actorId" in candidate) addBackendOnlyTerm(terms, exposedTerms, candidate.actorId);
    if ("itemId" in candidate) addBackendOnlyTerm(terms, exposedTerms, candidate.itemId);
    if ("locationId" in candidate) addBackendOnlyTerm(terms, exposedTerms, candidate.locationId);
    if ("factionId" in candidate) addBackendOnlyTerm(terms, exposedTerms, candidate.factionId);
  }

  for (const candidate of frame.movementCandidates) {
    addBackendOnlyTerm(terms, exposedTerms, candidate.id);
    addBackendOnlyTerm(terms, exposedTerms, candidate.locationId);
  }

  return [...terms].sort((left, right) => right.length - left.length);
}

function actorIsVisible(actor: SceneActor): boolean {
  return actor.awareness === "clear";
}

function toModelFacingActor(
  actor: SceneActor,
  safety: ModelFacingPromptSafety,
): ModelFacingActor {
  return {
    id: actor.id,
    actorId: actor.actorId ?? actor.id,
    type: actor.type,
    label: redactModelFacingText(actor.label, safety),
    awareness: "clear",
    tags: actor.tags?.map((tag) => redactModelFacingText(tag, safety)),
    summary: actor.summary ? redactModelFacingText(actor.summary, safety) : actor.summary,
  };
}

function candidateIsAllowed(
  candidate: SceneFrameTargetCandidate,
  safety: ModelFacingPromptSafety,
): boolean {
  const refs = [
    candidate.id,
    candidate.label,
    candidate.actorId,
    candidate.itemId,
    candidate.locationId,
    candidate.factionId,
  ].filter((value): value is string => Boolean(value && value.trim()));

  if (refs.some((ref) => includesForbiddenTerm(ref, safety.forbiddenTerms))) {
    return false;
  }

  if (candidate.type === "actor" && candidate.awareness && candidate.awareness !== "clear") {
    return false;
  }

  return true;
}

function movementIsAllowed(
  candidate: SceneFrameMovementCandidate,
  safety: ModelFacingPromptSafety,
): boolean {
  return ![candidate.id, candidate.locationId, candidate.label]
    .filter((value): value is string => Boolean(value && value.trim()))
    .some((ref) => includesForbiddenTerm(ref, safety.forbiddenTerms));
}

function cloneRecentEvent(event: SceneFrameRecentEvent): SceneFrameRecentEvent {
  return {
    ...event,
    actorIds: [...event.actorIds],
  };
}

function buildRecentEventActorLabelMap(
  actors: readonly SceneActor[],
  safety: ModelFacingPromptSafety,
): Map<string, string> {
  const labelByRef = new Map<string, string>();
  for (const actor of actors) {
    const label = redactModelFacingText(actor.label, safety);
    labelByRef.set(actor.id, label);
    if (actor.actorId) labelByRef.set(actor.actorId, label);
    labelByRef.set(actor.label, label);
  }
  return labelByRef;
}

function toModelFacingRecentEvent(
  event: SceneFrameRecentEvent,
  safety: ModelFacingPromptSafety,
  labelByActorRef: ReadonlyMap<string, string>,
): SceneFrameRecentEvent | null {
  if (!event.perceivableByPlayer) {
    return null;
  }

  return {
    ...event,
    summary: redactModelFacingText(event.summary, safety),
    actorIds: uniqueStrings(
      event.actorIds.flatMap((actorId) => {
        const label = labelByActorRef.get(actorId);
        if (label) return [label];
        if (
          includesForbiddenTerm(actorId, safety.forbiddenTerms)
          || includesForbiddenTerm(actorId, safety.backendOnlyTerms ?? [])
          || isBackendOnlyModelRef(actorId)
        ) {
          return [];
        }
        return [redactModelFacingText(actorId, safety)];
      }),
    ),
  };
}

function cloneTargetCandidate(
  candidate: SceneFrameTargetCandidate,
  safety: ModelFacingPromptSafety,
): SceneFrameTargetCandidate {
  return {
    ...candidate,
    label: redactModelFacingText(candidate.label, safety),
    tags: candidate.tags?.map((tag) => redactModelFacingText(tag, safety)),
  };
}

function cloneMovementCandidate(
  candidate: SceneFrameMovementCandidate,
  safety: ModelFacingPromptSafety,
): SceneFrameMovementCandidate {
  return {
    ...candidate,
    label: redactModelFacingText(candidate.label, safety),
    path: candidate.path ? [...candidate.path] : undefined,
  };
}

function buildAwarenessHints(frame: SceneFrame, safety: ModelFacingPromptSafety): string[] {
  return uniqueStrings([
    ...frame.perception.playerAwarenessHints,
    ...frame.roster.support
      .filter((actor) => actor.awareness !== "clear")
      .map((actor) => actor.awarenessHint ?? "unknown nearby presence"),
  ])
    .filter((hint) => !includesForbiddenTerm(hint, safety.forbiddenTerms))
    .map((hint) => redactModelFacingText(hint, safety));
}

function buildOpaquePresenceCategories(input: {
  hintedActorCount: number;
  hiddenActorCount: number;
}): string[] {
  const categories: string[] = [];
  if (input.hintedActorCount > 0) {
    categories.push("unknown nearby presence");
  }
  if (input.hiddenActorCount > 0) {
    categories.push("private offscreen presence");
  }
  return categories;
}

export function buildModelFacingScenePacket(frame: SceneFrame): ModelFacingScenePacket {
  const safety: ModelFacingPromptSafety = {
    forbiddenTerms: collectForbiddenTerms(frame),
    backendOnlyTerms: collectBackendOnlyTerms(frame),
  };
  const hintedActorCount = frame.roster.support.filter((actor) => actor.awareness !== "clear")
    .length;
  const hiddenActorCount = hintedActorCount + frame.roster.background.length;
  const visibleSourceActors = [...frame.roster.active, ...frame.roster.support]
    .filter(actorIsVisible);
  const recentEventActorLabels = buildRecentEventActorLabelMap(visibleSourceActors, safety);
  const view: ModelFacingSceneView = {
    localScene: {
      campaignId: frame.campaignId,
      tick: frame.tick,
      playerActorId: frame.playerActorId,
      currentLocationId: frame.currentLocationId,
      currentSceneScopeId: frame.currentSceneScopeId,
      currentLocationName: frame.currentLocationName
        ? redactModelFacingText(frame.currentLocationName, safety)
        : null,
      currentSceneScopeName: frame.currentSceneScopeName
        ? redactModelFacingText(frame.currentSceneScopeName, safety)
        : null,
      currentLocationDescription: frame.currentLocationDescription
        ? redactModelFacingText(frame.currentLocationDescription, safety)
        : null,
      currentSceneScopeDescription: frame.currentSceneScopeDescription
        ? redactModelFacingText(frame.currentSceneScopeDescription, safety)
        : null,
    },
    visibleActors: visibleSourceActors.map((actor) => toModelFacingActor(actor, safety)),
    awarenessHints: buildAwarenessHints(frame, safety),
    privateContext: {
      hiddenActorCount,
      opaquePresenceCategories: buildOpaquePresenceCategories({
        hintedActorCount,
        hiddenActorCount: frame.roster.background.length,
      }),
    },
    localRecentEvents: frame.recentEvents.flatMap((event) => {
      const modelFacingEvent = toModelFacingRecentEvent(event, safety, recentEventActorLabels);
      return modelFacingEvent ? [cloneRecentEvent(modelFacingEvent)] : [];
    }),
    legalTargets: frame.targetCandidates
      .filter((candidate) => candidateIsAllowed(candidate, safety))
      .map((candidate) => cloneTargetCandidate(candidate, safety)),
    legalMovement: frame.movementCandidates
      .filter((candidate) => movementIsAllowed(candidate, safety))
      .map((candidate) => cloneMovementCandidate(candidate, safety)),
    allowedTools: [...frame.allowedTools],
    oracle: frame.oracle,
  };

  if (frame.oracleContext) {
    view.oracleContext = redactModelFacingJson(frame.oracleContext, safety);
  }
  if (frame.combatEnvelope) {
    view.combatEnvelope = redactModelFacingJson(frame.combatEnvelope, safety);
  }

  return { view, safety };
}

export function buildModelFacingSceneDiagnostics(
  packet: ModelFacingScenePacket,
): ModelFacingSceneDiagnostics {
  return {
    visibleActorCount: packet.view.visibleActors.length,
    hiddenActorCount: packet.view.privateContext.hiddenActorCount,
    localRecentEventCount: packet.view.localRecentEvents.length,
    allowedToolCount: packet.view.allowedTools.length,
  };
}

export function buildModelFacingScenePromptView(
  view: ModelFacingSceneView,
): ModelFacingScenePromptView {
  const actorAliases = new Map<string, number>();
  const labelByRef = new Map<string, string>();
  const visibleActors = view.visibleActors.map((actor, index) => {
    const ref = uniquePromptAlias(actorPromptAlias(actor, index), actorAliases);
    const label = sanitizeModelFacingText(actor.label);
    labelByRef.set(actor.id, label);
    if (actor.actorId) {
      labelByRef.set(actor.actorId, label);
    }
    labelByRef.set(actor.label, label);
    return {
      ref,
      type: actor.type,
      label,
      awareness: actor.awareness,
      tags: actor.tags?.map((tag) => sanitizeModelFacingText(tag)),
      summary: actor.summary ? sanitizeModelFacingText(actor.summary) : actor.summary,
    };
  });
  const actorAliasByLabel = new Map(
    visibleActors.map((actor) => [actor.label.trim().toLowerCase(), actor.ref]),
  );
  const targetAliases = new Map<string, number>();
  const movementAliases = new Map<string, number>();

  return {
    localScene: {
      tick: view.localScene.tick,
      player: {
        ref: "Player",
        label: "Player",
      },
      currentLocation: view.localScene.currentLocationName
        ? {
            ref: "current_location",
            label: sanitizeModelFacingText(view.localScene.currentLocationName),
            description: view.localScene.currentLocationDescription
              ? sanitizeModelFacingText(view.localScene.currentLocationDescription)
              : null,
          }
        : null,
      currentScene: view.localScene.currentSceneScopeName
        ? {
            ref: "current_scene",
            label: sanitizeModelFacingText(view.localScene.currentSceneScopeName),
            description: view.localScene.currentSceneScopeDescription
              ? sanitizeModelFacingText(view.localScene.currentSceneScopeDescription)
              : null,
          }
        : null,
    },
    visibleActors,
    awarenessHints: view.awarenessHints.map((hint) => sanitizeModelFacingText(hint)),
    localRecentEvents: view.localRecentEvents.map((event) => {
      const actors = labelsForRecentEvent(event, labelByRef);
      return {
        tick: event.tick,
        source: event.source,
        summary: sanitizeModelFacingText(event.summary),
        actors: actors.length > 0
          ? actors.map((actor) => sanitizeModelFacingText(actor))
          : undefined,
      };
    }),
    legalTargets: view.legalTargets.map((candidate, index) => {
      const actorAlias = actorAliasByLabel.get(candidate.label.trim().toLowerCase());
      return {
        ref: uniquePromptAlias(
          actorAlias ?? promptAliasToken("target", candidate.label, index),
          targetAliases,
        ),
        type: candidate.type,
        label: sanitizeModelFacingText(candidate.label),
        awareness: candidate.awareness,
        tags: candidate.tags?.map((tag) => sanitizeModelFacingText(tag)),
      };
    }),
    legalMovement: view.legalMovement.map((candidate, index) => ({
      ref: uniquePromptAlias(
        promptAliasToken("move", candidate.label, index),
        movementAliases,
      ),
      label: sanitizeModelFacingText(candidate.label),
      connected: candidate.connected,
      travelCost: candidate.travelCost,
    })),
    allowedTools: [...view.allowedTools],
  };
}

export function collectModelFacingScenePromptRefs(
  view: ModelFacingScenePromptView,
): string[] {
  const refs = new Set<string>();
  addPromptRef(refs, "Player");
  addPromptRef(refs, "current_location");
  addPromptRef(refs, "current_scene");
  addPromptRef(refs, view.localScene.player.ref);
  addPromptRef(refs, view.localScene.player.label);
  addPromptRef(refs, view.localScene.currentLocation?.ref);
  addPromptRef(refs, view.localScene.currentLocation?.label);
  addPromptRef(refs, view.localScene.currentScene?.ref);
  addPromptRef(refs, view.localScene.currentScene?.label);
  for (const actor of view.visibleActors) {
    addPromptRef(refs, actor.ref);
    addPromptRef(refs, actor.label);
  }
  for (const target of view.legalTargets) {
    addPromptRef(refs, target.ref);
    addPromptRef(refs, target.label);
  }
  for (const movement of view.legalMovement) {
    addPromptRef(refs, movement.ref);
    addPromptRef(refs, movement.label);
  }
  return [...refs];
}

function readPromptString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPromptNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPromptStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

export function oracleContextForModelPrompt(value: unknown): unknown {
  if (!isRecord(value)) return null;
  return {
    targetLabel: readPromptString(value.targetLabel),
    targetType: readPromptString(value.targetType),
    targetTags: readPromptStringArray(value.targetTags).slice(0, 8),
    source: readPromptString(value.source),
    fallbackReason: readPromptString(value.fallbackReason),
  };
}

export function oracleResultForModelPrompt(value: unknown): unknown {
  if (!isRecord(value)) return null;
  return {
    outcome: readPromptString(value.outcome),
    chance: readPromptNumber(value.chance),
    roll: readPromptNumber(value.roll),
    confidence: readPromptNumber(value.confidence),
  };
}

export function redactModelFacingText(
  text: string,
  safety: ModelFacingPromptSafety,
): string {
  return sanitizeModelFacingText(text, { safety });
}

export function redactModelFacingJson(
  value: unknown,
  safety: ModelFacingPromptSafety,
): unknown {
  return sanitizeModelFacingJsonValue(value, { safety });
}

export function shouldDropModelFacingText(
  text: string,
  safety: ModelFacingPromptSafety,
): boolean {
  return includesForbiddenTerm(text, safety.forbiddenTerms);
}
