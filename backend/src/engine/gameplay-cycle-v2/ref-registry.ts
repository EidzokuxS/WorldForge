import type {
  SceneFrame,
  SceneFrameMovementCandidate,
  SceneFramePlayerInventoryItem,
  SceneFrameTargetCandidate,
} from "../scene-frame.js";

export type GameplayRefKindV2 =
  | "player_actor"
  | "visible_actor"
  | "current_location"
  | "current_scene"
  | "movement_option"
  | "visible_target"
  | "inventory_item";

export interface GameplayRefRegistryEntryV2 {
  ref: string;
  kind: GameplayRefKindV2;
  label: string;
  ids: {
    actorId?: string;
    broadLocationId?: string | null;
    candidateId?: string;
    currentLocationId?: string | null;
    itemId?: string | null;
    locationId?: string | null;
    playerActorId?: string | null;
    sceneScopeId?: string | null;
    targetId?: string;
  };
  metadata: {
    actorType?: string;
    connected?: boolean;
    equipState?: "carried" | "equipped";
    targetKind?: "actor" | "item" | "location" | "faction";
    travelCost?: number | null;
  };
}

export interface GameplayRefRegistryV2 {
  version: "gameplay-ref-registry.v2";
  campaignId: string;
  turnId: string;
  baseWorldVersion: number;
  entries: GameplayRefRegistryEntryV2[];
}

export type GameplayRefResolutionV2 =
  | {
    status: "resolved";
    entry: GameplayRefRegistryEntryV2;
  }
  | {
    status: "missing";
    reason: string;
  }
  | {
    status: "ambiguous";
    reason: string;
    entries: GameplayRefRegistryEntryV2[];
  };

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function key(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueEntries(entries: GameplayRefRegistryEntryV2[]): GameplayRefRegistryEntryV2[] {
  const seen = new Set<string>();
  const result: GameplayRefRegistryEntryV2[] = [];
  for (const entry of entries) {
    const entryKey = JSON.stringify({
      ref: key(entry.ref),
      kind: entry.kind,
      ids: entry.ids,
    });
    if (seen.has(entryKey)) continue;
    seen.add(entryKey);
    result.push(entry);
  }
  return result;
}

function playerEntry(frame: SceneFrame): GameplayRefRegistryEntryV2 {
  return {
    ref: "Player",
    kind: "player_actor",
    label: "Player",
    ids: {
      playerActorId: frame.playerActorId,
      currentLocationId: frame.currentLocationId,
      sceneScopeId: frame.currentSceneScopeId,
    },
    metadata: {
      actorType: "player",
    },
  };
}

function currentLocationEntries(frame: SceneFrame): GameplayRefRegistryEntryV2[] {
  const entries: GameplayRefRegistryEntryV2[] = [];
  const currentLocationName = cleanText(frame.currentLocationName);
  if (currentLocationName) {
    entries.push({
      ref: currentLocationName,
      kind: "current_location",
      label: currentLocationName,
      ids: {
        currentLocationId: frame.currentLocationId,
        locationId: frame.currentLocationId,
        sceneScopeId: frame.currentSceneScopeId,
      },
      metadata: {},
    });
  }
  const currentSceneName = cleanText(frame.currentSceneScopeName);
  if (currentSceneName) {
    entries.push({
      ref: currentSceneName,
      kind: "current_scene",
      label: currentSceneName,
      ids: {
        broadLocationId: frame.currentLocationId,
        currentLocationId: frame.currentLocationId,
        locationId: frame.currentSceneScopeId,
        sceneScopeId: frame.currentSceneScopeId,
      },
      metadata: {},
    });
  }
  return entries;
}

function actorEntries(frame: SceneFrame): GameplayRefRegistryEntryV2[] {
  return [
    ...frame.roster.active,
    ...frame.roster.support,
    ...frame.roster.background,
  ]
    .filter((actor) => actor.awareness === "clear")
    .map((actor) => ({
      ref: actor.label,
      kind: "visible_actor" as const,
      label: actor.label,
      ids: {
        actorId: actor.actorId ?? actor.id,
        broadLocationId: actor.locationId,
        candidateId: actor.id,
        currentLocationId: frame.currentLocationId,
        sceneScopeId: actor.sceneScopeId,
      },
      metadata: {
        actorType: actor.type,
      },
    }));
}

function movementEntry(
  frame: SceneFrame,
  candidate: SceneFrameMovementCandidate,
): GameplayRefRegistryEntryV2 {
  return {
    ref: candidate.label,
    kind: "movement_option",
    label: candidate.label,
    ids: {
      candidateId: candidate.id,
      currentLocationId: frame.currentLocationId,
      locationId: candidate.locationId,
      sceneScopeId: candidate.locationId,
    },
    metadata: {
      connected: candidate.connected,
      travelCost: candidate.travelCost ?? null,
    },
  };
}

function targetEntry(
  frame: SceneFrame,
  target: SceneFrameTargetCandidate,
): GameplayRefRegistryEntryV2 {
  return {
    ref: target.label,
    kind: "visible_target",
    label: target.label,
    ids: {
      actorId: target.actorId ?? undefined,
      candidateId: target.id,
      currentLocationId: frame.currentLocationId,
      itemId: target.itemId ?? undefined,
      locationId: target.locationId ?? undefined,
      targetId: target.id,
    },
    metadata: {
      targetKind: target.type,
    },
  };
}

function inventoryEntry(
  frame: SceneFrame,
  item: SceneFramePlayerInventoryItem,
): GameplayRefRegistryEntryV2 {
  return {
    ref: item.label,
    kind: "inventory_item",
    label: item.label,
    ids: {
      candidateId: item.id,
      currentLocationId: frame.currentLocationId,
      itemId: item.itemId,
      playerActorId: frame.playerActorId,
    },
    metadata: {
      equipState: item.equipState,
    },
  };
}

export function buildGameplayRefRegistryV2(input: {
  turnId: string;
  frame: SceneFrame;
}): GameplayRefRegistryV2 {
  return {
    version: "gameplay-ref-registry.v2",
    campaignId: input.frame.campaignId,
    turnId: input.turnId,
    baseWorldVersion: input.frame.worldVersion,
    entries: uniqueEntries([
      playerEntry(input.frame),
      ...currentLocationEntries(input.frame),
      ...actorEntries(input.frame),
      ...input.frame.movementCandidates.map((candidate) =>
        movementEntry(input.frame, candidate)),
      ...input.frame.targetCandidates.map((target) =>
        targetEntry(input.frame, target)),
      ...(input.frame.playerInventory ?? []).map((item) =>
        inventoryEntry(input.frame, item)),
    ]),
  };
}

export function resolveGameplayRefV2(input: {
  registry: GameplayRefRegistryV2;
  ref: string;
  allowedKinds: readonly GameplayRefKindV2[];
}): GameplayRefResolutionV2 {
  const normalizedRef = key(input.ref);
  const allowed = new Set<GameplayRefKindV2>(input.allowedKinds);
  const matches = input.registry.entries.filter((entry) =>
    key(entry.ref) === normalizedRef && allowed.has(entry.kind));

  if (matches.length === 0) {
    return {
      status: "missing",
      reason: `Ref "${input.ref}" is not a unique ${input.allowedKinds.join("|")} registry entry.`,
    };
  }
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      reason: `Ref "${input.ref}" resolves to ${matches.length} ${input.allowedKinds.join("|")} registry entries.`,
      entries: matches,
    };
  }
  return {
    status: "resolved",
    entry: matches[0],
  };
}
