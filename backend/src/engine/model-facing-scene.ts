import type {
  SceneActor,
  SceneFrame,
  SceneFrameMovementCandidate,
  SceneFrameRecentEvent,
  SceneFrameTargetCandidate,
} from "./scene-frame.js";
import type { RuntimeToolName } from "./tool-schemas.js";

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

export interface ModelFacingPromptSafety {
  forbiddenTerms: string[];
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
  const baseTerms = [...terms];

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

function actorIsVisible(actor: SceneActor): boolean {
  return actor.awareness === "clear";
}

function toModelFacingActor(actor: SceneActor): ModelFacingActor {
  return {
    id: actor.id,
    actorId: actor.actorId ?? actor.id,
    type: actor.type,
    label: actor.label,
    awareness: "clear",
    tags: actor.tags ? [...actor.tags] : undefined,
    summary: actor.summary,
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

function toModelFacingRecentEvent(
  event: SceneFrameRecentEvent,
  safety: ModelFacingPromptSafety,
): SceneFrameRecentEvent | null {
  if (!event.perceivableByPlayer) {
    return null;
  }

  return {
    ...event,
    summary: redactModelFacingText(event.summary, safety),
    actorIds: event.actorIds.filter(
      (actorId) => !includesForbiddenTerm(actorId, safety.forbiddenTerms),
    ),
  };
}

function cloneTargetCandidate(candidate: SceneFrameTargetCandidate): SceneFrameTargetCandidate {
  return {
    ...candidate,
    tags: candidate.tags ? [...candidate.tags] : undefined,
  };
}

function cloneMovementCandidate(
  candidate: SceneFrameMovementCandidate,
): SceneFrameMovementCandidate {
  return {
    ...candidate,
    path: candidate.path ? [...candidate.path] : undefined,
  };
}

function buildAwarenessHints(frame: SceneFrame, safety: ModelFacingPromptSafety): string[] {
  return uniqueStrings([
    ...frame.perception.playerAwarenessHints,
    ...frame.roster.support
      .filter((actor) => actor.awareness !== "clear")
      .map((actor) => actor.awarenessHint ?? "unknown nearby presence"),
  ]).filter((hint) => !includesForbiddenTerm(hint, safety.forbiddenTerms));
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
  };
  const hintedActorCount = frame.roster.support.filter((actor) => actor.awareness !== "clear")
    .length;
  const hiddenActorCount = hintedActorCount + frame.roster.background.length;
  const view: ModelFacingSceneView = {
    localScene: {
      campaignId: frame.campaignId,
      tick: frame.tick,
      playerActorId: frame.playerActorId,
      currentLocationId: frame.currentLocationId,
      currentSceneScopeId: frame.currentSceneScopeId,
      currentLocationName: frame.currentLocationName ?? null,
      currentSceneScopeName: frame.currentSceneScopeName ?? null,
      currentLocationDescription: frame.currentLocationDescription
        ? redactModelFacingText(frame.currentLocationDescription, safety)
        : null,
      currentSceneScopeDescription: frame.currentSceneScopeDescription
        ? redactModelFacingText(frame.currentSceneScopeDescription, safety)
        : null,
    },
    visibleActors: [...frame.roster.active, ...frame.roster.support]
      .filter(actorIsVisible)
      .map(toModelFacingActor),
    awarenessHints: buildAwarenessHints(frame, safety),
    privateContext: {
      hiddenActorCount,
      opaquePresenceCategories: buildOpaquePresenceCategories({
        hintedActorCount,
        hiddenActorCount: frame.roster.background.length,
      }),
    },
    localRecentEvents: frame.recentEvents.flatMap((event) => {
      const modelFacingEvent = toModelFacingRecentEvent(event, safety);
      return modelFacingEvent ? [cloneRecentEvent(modelFacingEvent)] : [];
    }),
    legalTargets: frame.targetCandidates
      .filter((candidate) => candidateIsAllowed(candidate, safety))
      .map(cloneTargetCandidate),
    legalMovement: frame.movementCandidates
      .filter((candidate) => movementIsAllowed(candidate, safety))
      .map(cloneMovementCandidate),
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

export function redactModelFacingText(
  text: string,
  safety: ModelFacingPromptSafety,
): string {
  let redacted = text;
  for (const term of safety.forbiddenTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    redacted = redacted.replace(new RegExp(escaped, "gi"), "[redacted]");
  }
  return redacted;
}

export function redactModelFacingJson(
  value: unknown,
  safety: ModelFacingPromptSafety,
): unknown {
  if (typeof value === "string") {
    return redactModelFacingText(value, safety);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactModelFacingJson(entry, safety));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      if (includesForbiddenTerm(key, safety.forbiddenTerms)) {
        return [];
      }
      return [[key, redactModelFacingJson(entry, safety)]];
    }),
  );
}

export function shouldDropModelFacingText(
  text: string,
  safety: ModelFacingPromptSafety,
): boolean {
  return includesForbiddenTerm(text, safety.forbiddenTerms);
}
