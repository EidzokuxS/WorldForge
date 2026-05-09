import type {
  SceneActor,
  SceneFrame,
  SceneFrameMovementCandidate,
  SceneFrameRecentEvent,
  SceneFrameTargetCandidate,
} from "./scene-frame.js";
import type { RuntimeToolName } from "./tool-schemas.js";
import type { ActorDecisionPacket } from "./actor-decision-packet.js";
import {
  buildContextBudgetTrace,
  type ContextBudgetTrace,
} from "./context-budget-trace.js";

export type ActorFactSourceRoute =
  | "self_state"
  | "direct_observation"
  | "report_message"
  | "rumor"
  | "belief"
  | "memory"
  | "public_record"
  | "local_affordance";

export interface ActorFrameFact {
  id: string;
  route: ActorFactSourceRoute;
  text: string;
  subjectRefs: string[];
  confidence: number;
  reliability?: number;
  sourceEventIds?: string[];
  sourceKnowledgeIds?: string[];
  authorityTraceIds?: string[];
  deliveredAtWorldTimeMinutes?: number | null;
  observedAtWorldVersion?: number | null;
}

export interface ActorFrameActorRef {
  id: string;
  actorId: string;
  label: string;
  type: SceneActor["type"];
  locationId: string | null;
  sceneScopeId: string | null;
}

export interface ActorFrameExternalFactInput {
  id?: string;
  route: Exclude<ActorFactSourceRoute, "self_state" | "direct_observation" | "local_affordance">;
  text: string;
  subjectRefs?: readonly string[];
  confidence?: number;
  reliability?: number;
  sourceEventIds?: readonly string[];
  sourceKnowledgeIds?: readonly string[];
  authorityTraceIds?: readonly string[];
  deliveredAtWorldTimeMinutes?: number | null;
}

export interface BuildActorFrameArgs {
  frame: SceneFrame;
  actorId: string;
  worldVersion?: number | null;
  reports?: readonly ActorFrameExternalFactInput[];
  memories?: readonly ActorFrameExternalFactInput[];
  beliefs?: readonly ActorFrameExternalFactInput[];
  publicRecords?: readonly ActorFrameExternalFactInput[];
  legalTools?: readonly RuntimeToolName[];
  constraints?: readonly string[];
}

export interface ActorFrame {
  campaignId: string;
  worldVersion: number | null;
  observer: ActorFrameActorRef;
  playerActionRequest: string;
  facts: ActorFrameFact[];
  legalTools: RuntimeToolName[];
  constraints: string[];
  contextBudgetTrace: ContextBudgetTrace;
  hiddenExcludedCount: number;
}

export interface ActorDecisionCitationValidation {
  ok: boolean;
  missingFactIds: string[];
}

export class ActorFrameCitationError extends Error {
  constructor(public readonly missingFactIds: string[]) {
    super(`Actor decision cited facts outside ActorFrame: ${missingFactIds.join(", ")}`);
    this.name = "ActorFrameCitationError";
  }
}

export interface CommandNodeFrame {
  campaignId: string;
  worldVersion: number | null;
  commandNodeId: string;
  label: string;
  facts: ActorFrameFact[];
  goals: string[];
  legalTools: RuntimeToolName[];
  constraints: string[];
  contextBudgetTrace: ContextBudgetTrace;
}

export interface BuildCommandNodeFrameArgs {
  campaignId: string;
  commandNodeId: string;
  label: string;
  worldVersion?: number | null;
  reports?: readonly ActorFrameExternalFactInput[];
  rumors?: readonly ActorFrameExternalFactInput[];
  publicRecords?: readonly ActorFrameExternalFactInput[];
  beliefs?: readonly ActorFrameExternalFactInput[];
  goals?: readonly string[];
  legalTools?: readonly RuntimeToolName[];
  constraints?: readonly string[];
}

function uniqueStrings(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function actorStableId(actor: SceneActor): string {
  return actor.actorId ?? actor.id;
}

function toActorRef(actor: SceneActor): ActorFrameActorRef {
  return {
    id: actor.id,
    actorId: actorStableId(actor),
    label: actor.label,
    type: actor.type,
    locationId: actor.locationId,
    sceneScopeId: actor.sceneScopeId,
  };
}

function findActor(frame: SceneFrame, actorId: string): SceneActor {
  const allActors = [
    ...frame.roster.active,
    ...frame.roster.support,
    ...frame.roster.background,
  ];
  const actor = allActors.find(
    (candidate) => candidate.id === actorId || candidate.actorId === actorId,
  );
  if (!actor) {
    throw new Error(`ActorFrame observer not found in SceneFrame: ${actorId}`);
  }
  return actor;
}

function observerAwareness(
  frame: SceneFrame,
  observer: SceneActor,
  subject: SceneActor,
): "none" | "hint" | "clear" {
  if (actorStableId(observer) === actorStableId(subject) || observer.id === subject.id) {
    return "clear";
  }

  const observerKeys = uniqueStrings([observer.id, observer.actorId]);
  const subjectKeys = uniqueStrings([subject.id, subject.actorId]);
  for (const observerKey of observerKeys) {
    const awarenessMap = frame.perception.actorAwareness[observerKey];
    if (!awarenessMap) {
      continue;
    }
    for (const subjectKey of subjectKeys) {
      const awareness = awarenessMap[subjectKey];
      if (awareness) {
        return awareness;
      }
    }
  }

  return subject.awareness;
}

function pushFact(facts: ActorFrameFact[], fact: ActorFrameFact): void {
  if (fact.text.trim().length === 0) {
    return;
  }
  if (facts.some((existing) => existing.id === fact.id)) {
    return;
  }
  facts.push({
    ...fact,
    subjectRefs: uniqueStrings(fact.subjectRefs),
    sourceEventIds: uniqueStrings(fact.sourceEventIds ?? []),
    sourceKnowledgeIds: uniqueStrings(fact.sourceKnowledgeIds ?? []),
    authorityTraceIds: uniqueStrings(fact.authorityTraceIds ?? []),
    confidence: Math.max(0, Math.min(1, fact.confidence)),
    reliability: fact.reliability === undefined
      ? undefined
      : Math.max(0, Math.min(1, fact.reliability)),
  });
}

function locationLabel(frame: SceneFrame, actor: SceneActor): string {
  if (actor.sceneScopeId && actor.sceneScopeId === frame.currentSceneScopeId) {
    return frame.currentSceneScopeName ?? frame.currentLocationName ?? "the current scene";
  }
  if (actor.locationId && actor.locationId === frame.currentLocationId) {
    return frame.currentLocationName ?? "the current broad location";
  }
  return "an unconfirmed location";
}

function addSelfStateFact(args: {
  frame: SceneFrame;
  observer: SceneActor;
  facts: ActorFrameFact[];
  worldVersion: number | null;
}): void {
  const tags = args.observer.tags?.length
    ? ` Tags: ${args.observer.tags.join(", ")}.`
    : "";
  const summary = args.observer.summary ? ` ${args.observer.summary}` : "";
  pushFact(args.facts, {
    id: `self:${actorStableId(args.observer)}`,
    route: "self_state",
    text: `${args.observer.label} is at ${locationLabel(args.frame, args.observer)}.${tags}${summary}`,
    subjectRefs: [actorStableId(args.observer)],
    confidence: 1,
    observedAtWorldVersion: args.worldVersion,
  });
}

function addObservedActorFacts(args: {
  frame: SceneFrame;
  observer: SceneActor;
  facts: ActorFrameFact[];
  worldVersion: number | null;
}): number {
  let excluded = 0;
  const allActors = [
    ...args.frame.roster.active,
    ...args.frame.roster.support,
    ...args.frame.roster.background,
  ];

  for (const subject of allActors) {
    if (subject.id === args.observer.id) {
      continue;
    }

    const awareness = observerAwareness(args.frame, args.observer, subject);
    if (awareness === "clear") {
      const tags = subject.tags?.length ? ` Tags: ${subject.tags.join(", ")}.` : "";
      pushFact(args.facts, {
        id: `actor:${actorStableId(subject)}`,
        route: "direct_observation",
        text: `${subject.label} is directly observable at ${locationLabel(args.frame, subject)}.${tags}`,
        subjectRefs: [actorStableId(subject)],
        confidence: 1,
        observedAtWorldVersion: args.worldVersion,
      });
      continue;
    }

    if (awareness === "hint") {
      pushFact(args.facts, {
        id: `hint:${subject.id}`,
        route: "direct_observation",
        text: subject.awarenessHint ?? "An indirect presence signal is detectable nearby.",
        subjectRefs: [],
        confidence: 0.55,
        observedAtWorldVersion: args.worldVersion,
      });
      excluded += 1;
      continue;
    }

    excluded += 1;
  }

  return excluded;
}

function addTargetFacts(args: {
  facts: ActorFrameFact[];
  targets: readonly SceneFrameTargetCandidate[];
  worldVersion: number | null;
}): void {
  for (const target of args.targets) {
    if (target.awareness === "none") {
      continue;
    }
    const tags = target.tags?.length ? ` Tags: ${target.tags.join(", ")}.` : "";
    pushFact(args.facts, {
      id: `target:${target.id}`,
      route: "local_affordance",
      text: `${target.label} is an available ${target.type} target.${tags}`,
      subjectRefs: uniqueStrings([
        target.actorId,
        target.itemId,
        target.locationId,
        target.factionId,
      ]),
      confidence: target.awareness === "hint" ? 0.55 : 0.9,
      observedAtWorldVersion: args.worldVersion,
    });
  }
}

function addMovementFacts(args: {
  facts: ActorFrameFact[];
  movements: readonly SceneFrameMovementCandidate[];
  worldVersion: number | null;
}): void {
  for (const movement of args.movements) {
    pushFact(args.facts, {
      id: `move:${movement.id}`,
      route: "local_affordance",
      text: `${movement.label} is ${movement.connected ? "reachable" : "known but not currently connected"}.`,
      subjectRefs: [movement.locationId],
      confidence: movement.connected ? 0.9 : 0.6,
      observedAtWorldVersion: args.worldVersion,
    });
  }
}

function actorCanKnowEvent(
  event: SceneFrameRecentEvent,
  observer: SceneActor,
): boolean {
  const observerIds = new Set(uniqueStrings([observer.id, observer.actorId]));
  return event.perceivableByPlayer || event.actorIds.some((id) => observerIds.has(id));
}

function addRecentEventFacts(args: {
  facts: ActorFrameFact[];
  events: readonly SceneFrameRecentEvent[];
  observer: SceneActor;
  worldVersion: number | null;
}): number {
  let excluded = 0;
  for (const event of args.events) {
    if (!actorCanKnowEvent(event, args.observer)) {
      excluded += 1;
      continue;
    }
    pushFact(args.facts, {
      id: `event:${event.id}`,
      route: event.actorIds.includes(actorStableId(args.observer)) ? "memory" : "direct_observation",
      text: event.summary,
      subjectRefs: event.actorIds,
      confidence: event.source === "chat_history" ? 0.7 : 0.85,
      observedAtWorldVersion: args.worldVersion,
    });
  }
  return excluded;
}

function addExternalFacts(args: {
  facts: ActorFrameFact[];
  inputs: readonly ActorFrameExternalFactInput[];
  prefix: string;
  worldVersion: number | null;
}): void {
  args.inputs.forEach((input, index) => {
    pushFact(args.facts, {
      id: input.id ?? `${args.prefix}:${index + 1}`,
      route: input.route,
      text: input.text,
      subjectRefs: [...(input.subjectRefs ?? [])],
      confidence: input.confidence ?? (input.route === "rumor" ? 0.45 : 0.75),
      reliability: input.reliability,
      sourceEventIds: [...(input.sourceEventIds ?? [])],
      sourceKnowledgeIds: [...(input.sourceKnowledgeIds ?? [])],
      authorityTraceIds: [...(input.authorityTraceIds ?? [])],
      deliveredAtWorldTimeMinutes: input.deliveredAtWorldTimeMinutes ?? null,
      observedAtWorldVersion: args.worldVersion,
    });
  });
}

function routeCountsForFacts(facts: readonly ActorFrameFact[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const fact of facts) {
    counts[fact.route] = (counts[fact.route] ?? 0) + 1;
  }
  return counts;
}

export function buildActorFrame(args: BuildActorFrameArgs): ActorFrame {
  const observer = findActor(args.frame, args.actorId);
  const worldVersion = args.worldVersion ?? null;
  const facts: ActorFrameFact[] = [];

  addSelfStateFact({ frame: args.frame, observer, facts, worldVersion });
  let hiddenExcludedCount = addObservedActorFacts({
    frame: args.frame,
    observer,
    facts,
    worldVersion,
  });
  addTargetFacts({
    facts,
    targets: args.frame.targetCandidates,
    worldVersion,
  });
  addMovementFacts({
    facts,
    movements: args.frame.movementCandidates,
    worldVersion,
  });
  hiddenExcludedCount += addRecentEventFacts({
    facts,
    events: args.frame.recentEvents,
    observer,
    worldVersion,
  });
  addExternalFacts({
    facts,
    inputs: args.reports ?? [],
    prefix: "report",
    worldVersion,
  });
  addExternalFacts({
    facts,
    inputs: args.memories ?? [],
    prefix: "memory",
    worldVersion,
  });
  addExternalFacts({
    facts,
    inputs: args.beliefs ?? [],
    prefix: "belief",
    worldVersion,
  });
  addExternalFacts({
    facts,
    inputs: args.publicRecords ?? [],
    prefix: "record",
    worldVersion,
  });

  return {
    campaignId: args.frame.campaignId,
    worldVersion,
    observer: toActorRef(observer),
    playerActionRequest: args.frame.playerAction,
    facts,
    legalTools: [...(args.legalTools ?? args.frame.allowedTools)],
    constraints: [...(args.constraints ?? [])],
    hiddenExcludedCount,
    contextBudgetTrace: buildContextBudgetTrace({
      label: "ActorFrame",
      visibleTexts: facts.map((fact) => fact.text),
      visibleItemCount: facts.length,
      hiddenExcludedCount,
      candidateItemCount:
        args.frame.roster.active.length
        + args.frame.roster.support.length
        + args.frame.roster.background.length
        + args.frame.recentEvents.length
        + args.frame.targetCandidates.length
        + args.frame.movementCandidates.length,
      sectionCounts: {
        facts: facts.length,
        legalTools: args.legalTools?.length ?? args.frame.allowedTools.length,
        constraints: args.constraints?.length ?? 0,
      },
      sourceCoverage: {
        sourceBackedCount: facts.length,
        routeCounts: routeCountsForFacts(facts),
      },
      notes: [
        "ActorFrame is a POV packet. It records exclusions as trace metadata instead of leaking hidden entities.",
      ],
    }),
  };
}

export function validateActorDecisionCitations(
  frame: Pick<ActorFrame, "facts">,
  packet: ActorDecisionPacket,
): ActorDecisionCitationValidation {
  const knownFactIds = new Set(frame.facts.map((fact) => fact.id));
  const missingFactIds = uniqueStrings(packet.citedFactIds)
    .filter((factId) => !knownFactIds.has(factId));

  return {
    ok: missingFactIds.length === 0,
    missingFactIds,
  };
}

export function assertActorDecisionCitations(
  frame: Pick<ActorFrame, "facts">,
  packet: ActorDecisionPacket,
): void {
  const validation = validateActorDecisionCitations(frame, packet);
  if (!validation.ok) {
    throw new ActorFrameCitationError(validation.missingFactIds);
  }
}

export function buildCommandNodeFrame(args: BuildCommandNodeFrameArgs): CommandNodeFrame {
  const worldVersion = args.worldVersion ?? null;
  const facts: ActorFrameFact[] = [];

  addExternalFacts({
    facts,
    inputs: args.reports ?? [],
    prefix: "command-report",
    worldVersion,
  });
  addExternalFacts({
    facts,
    inputs: args.rumors ?? [],
    prefix: "command-rumor",
    worldVersion,
  });
  addExternalFacts({
    facts,
    inputs: args.publicRecords ?? [],
    prefix: "command-record",
    worldVersion,
  });
  addExternalFacts({
    facts,
    inputs: args.beliefs ?? [],
    prefix: "command-belief",
    worldVersion,
  });

  return {
    campaignId: args.campaignId,
    worldVersion,
    commandNodeId: args.commandNodeId,
    label: args.label,
    facts,
    goals: [...(args.goals ?? [])],
    legalTools: [...(args.legalTools ?? [])],
    constraints: [...(args.constraints ?? [])],
    contextBudgetTrace: buildContextBudgetTrace({
      label: "CommandNodeFrame",
      visibleTexts: [
        ...facts.map((fact) => fact.text),
        ...(args.goals ?? []),
        ...(args.constraints ?? []),
      ],
      visibleItemCount: facts.length,
      hiddenExcludedCount: 0,
      candidateItemCount: facts.length,
      sectionCounts: {
        facts: facts.length,
        goals: args.goals?.length ?? 0,
        legalTools: args.legalTools?.length ?? 0,
        constraints: args.constraints?.length ?? 0,
      },
      sourceCoverage: {
        sourceBackedCount: facts.length,
        routeCounts: routeCountsForFacts(facts),
      },
      notes: [
        "CommandNodeFrame facts are routed through report, rumor, belief, or public-record provenance.",
      ],
    }),
  };
}
