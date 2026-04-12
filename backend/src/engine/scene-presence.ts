export type AwarenessBand = "none" | "hint" | "clear";

export const AWARENESS_BAND_CONTRACT: Record<AwarenessBand, string> = {
  clear: "Full present-scene actor context. Identity and direct interaction are justified.",
  hint: "Bounded indirect presence signal only. No identity leakage in player-facing surfaces.",
  none: "Outside encounter scope for this consumer. Omit from player-facing prompt surfaces.",
};

export type KnowledgeBasis =
  | "none"
  | "perceived_now"
  | "prior_relation"
  | "reputation"
  | "report";

export interface PresenceActorInput {
  actorId: string;
  actorType: "player" | "npc";
  broadLocationId: string | null;
  sceneScopeId?: string | null;
  visibility?: "clear" | "hint" | "hidden";
  awarenessHint?: string | null;
}

export interface PriorKnowledgeInput {
  observerActorId: string;
  subjectActorId: string;
  knowledgeBasis: Exclude<KnowledgeBasis, "none" | "perceived_now">;
}

export interface PresenceSnapshot {
  broadLocationId: string | null;
  sceneScopeId: string | null;
  presentActorIds: string[];
  awarenessByObserver: Record<string, Record<string, AwarenessBand>>;
  knowledgeBasisByObserver: Record<string, Record<string, KnowledgeBasis>>;
  playerAwarenessHints: string[];
}

export interface ResolveScenePresenceOptions {
  playerActorId: string;
  broadLocationId: string | null;
  sceneScopeId?: string | null;
  actors: PresenceActorInput[];
  priorKnowledge?: PriorKnowledgeInput[];
}

export function normalizePresenceKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
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

export interface PresenceVisibilityState {
  visibility: "clear" | "hint" | "hidden";
  awarenessHint: string | null;
}

function parseLowercaseTags(rawTags: string | string[] | null | undefined): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.toLowerCase());
  }

  if (typeof rawTags !== "string" || rawTags.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawTags) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.toLowerCase());
    }
  } catch {
    // Ignore malformed tag blobs and fall back to heuristics below.
  }

  return rawTags
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

export function inferPresenceVisibility(
  rawTags: string | string[] | null | undefined,
): PresenceVisibilityState {
  const tags = parseLowercaseTags(rawTags);

  if (tags.some((tag) => tag === "hidden" || tag === "concealed" || tag === "disguised")) {
    return {
      visibility: "hidden",
      awarenessHint: "Something concealed is nearby.",
    };
  }

  if (tags.some((tag) => tag === "obscured" || tag === "faint" || tag === "distant")) {
    return {
      visibility: "hint",
      awarenessHint: "You catch only a partial sign of movement nearby.",
    };
  }

  return { visibility: "clear", awarenessHint: null };
}

export function resolveStoredSceneScopeId(
  broadLocationId: string | null | undefined,
  currentSceneLocationId: string | null | undefined,
): string | null {
  return currentSceneLocationId ?? broadLocationId ?? null;
}

function resolveAwareness(
  observerActorId: string,
  subject: PresenceActorInput,
  presentActorIds: Set<string>,
): AwarenessBand {
  if (observerActorId === subject.actorId) {
    return "clear";
  }

  if (!presentActorIds.has(subject.actorId)) {
    return "none";
  }

  if (subject.visibility === "hidden") {
    return subject.awarenessHint ? "hint" : "none";
  }

  if (subject.visibility === "hint") {
    return "hint";
  }

  return "clear";
}

export function getObserverAwareness(
  snapshot: PresenceSnapshot,
  observerActorId: string,
  subjectActorId: string,
): AwarenessBand {
  return (
    snapshot.awarenessByObserver[normalizePresenceKey(observerActorId)]?.[
      normalizePresenceKey(subjectActorId)
    ] ?? "none"
  );
}

export function getObserverKnowledgeBasis(
  snapshot: PresenceSnapshot,
  observerActorId: string,
  subjectActorId: string,
): KnowledgeBasis {
  return (
    snapshot.knowledgeBasisByObserver[normalizePresenceKey(observerActorId)]?.[
      normalizePresenceKey(subjectActorId)
    ] ?? "none"
  );
}

export function resolveScenePresence(
  options: ResolveScenePresenceOptions,
): PresenceSnapshot {
  const sceneScopeId = resolveStoredSceneScopeId(
    options.broadLocationId,
    options.sceneScopeId,
  );

  const presentActors = options.actors.filter((actor) => {
    const actorSceneScopeId = resolveStoredSceneScopeId(
      actor.broadLocationId,
      actor.sceneScopeId,
    );

    return (
      actor.broadLocationId === options.broadLocationId
      && actorSceneScopeId === sceneScopeId
    );
  });

  const presentActorIds = presentActors.map((actor) => actor.actorId);
  const presentActorIdSet = new Set(presentActorIds);
  const subjectIds = new Set<string>(options.actors.map((actor) => actor.actorId));
  subjectIds.add(options.playerActorId);
  for (const entry of options.priorKnowledge ?? []) {
    subjectIds.add(entry.subjectActorId);
  }

  const awarenessByObserver: Record<string, Record<string, AwarenessBand>> = {};
  const knowledgeBasisByObserver: Record<string, Record<string, KnowledgeBasis>> = {};
  const actorsById = new Map(options.actors.map((actor) => [actor.actorId, actor]));
  const playerObserverKey = normalizePresenceKey(options.playerActorId);

  for (const observer of options.actors) {
    const observerKey = normalizePresenceKey(observer.actorId);
    const observerAwareness: Record<string, AwarenessBand> = {};
    const observerKnowledge: Record<string, KnowledgeBasis> = {};

    for (const subjectId of subjectIds) {
      const subjectKey = normalizePresenceKey(subjectId);
      const subject = actorsById.get(subjectId);
      const awareness = subject
        ? resolveAwareness(observer.actorId, subject, presentActorIdSet)
        : "none";

      observerAwareness[subjectKey] = awareness;
      observerKnowledge[subjectKey] = awareness === "clear" ? "perceived_now" : "none";
    }

    awarenessByObserver[observerKey] = observerAwareness;
    knowledgeBasisByObserver[observerKey] = observerKnowledge;
  }

  for (const entry of options.priorKnowledge ?? []) {
    const observerKey = normalizePresenceKey(entry.observerActorId);
    const subjectKey = normalizePresenceKey(entry.subjectActorId);
    const observerKnowledge =
      knowledgeBasisByObserver[observerKey]
      ?? (knowledgeBasisByObserver[observerKey] = {});

    if (observerKnowledge[subjectKey] !== "perceived_now") {
      observerKnowledge[subjectKey] = entry.knowledgeBasis;
    }
  }

  const playerAwarenessHints = dedupeStrings(
    presentActors
      .filter(
        (actor) =>
          awarenessByObserver[playerObserverKey]?.[normalizePresenceKey(actor.actorId)] === "hint",
      )
      .map((actor) => actor.awarenessHint ?? null),
  );

  return {
    broadLocationId: options.broadLocationId,
    sceneScopeId,
    presentActorIds,
    awarenessByObserver,
    knowledgeBasisByObserver,
    playerAwarenessHints,
  };
}
