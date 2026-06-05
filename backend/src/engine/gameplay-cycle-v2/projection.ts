import {
  assertModelFacingTurnPacketV2,
  type ModelFacingTurnPacketV2,
  type SceneFrameEnvelopeV2,
} from "./contracts.js";
import { toModelFacingCapabilitiesV2 } from "./capability-catalog.js";
import type {
  SceneActor,
  SceneFrameRecentEvent,
  SceneFrameTargetCandidate,
} from "../scene-frame.js";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function firstText(...values: Array<string | null | undefined>): string | null {
  return values.find((value) => value?.trim())?.trim() ?? null;
}

function actorRows(role: "active" | "support" | "background", actors: readonly SceneActor[]) {
  return actors
    .filter((actor) => actor.awareness === "clear" && actor.type !== "player")
    .map((actor) => ({
      ref: actor.label,
      label: actor.label,
      role,
      awarenessHint: actor.awarenessHint?.trim() || null,
      status: {
        conditions: (actor.statusConditions ?? []).slice(0, 12),
        hp: null,
      },
    }));
}

function isPlayerTarget(target: SceneFrameTargetCandidate, frame: SceneFrameEnvelopeV2["frame"]): boolean {
  if (target.type !== "actor") {
    return false;
  }
  const rosterActors = [
    ...frame.roster.active,
    ...frame.roster.support,
    ...frame.roster.background,
  ];
  const playerActorIds = new Set(
    [
      frame.playerActorId,
      ...rosterActors
        .filter((actor) => actor.type === "player")
        .flatMap((actor) => [actor.id, actor.actorId]),
    ]
      .filter((value): value is string => Boolean(value)),
  );
  const playerLabels = new Set(
    rosterActors
      .filter((actor) => actor.type === "player")
      .map((actor) => actor.label.trim().toLowerCase())
      .filter(Boolean),
  );
  return Boolean(target.actorId && playerActorIds.has(target.actorId))
    || playerLabels.has(target.label.trim().toLowerCase());
}

function targetKind(target: SceneFrameTargetCandidate): ModelFacingTurnPacketV2["scene"]["targets"][number]["kind"] {
  return target.type;
}

function eventRows(events: readonly SceneFrameRecentEvent[]) {
  return events
    .filter((event) => event.perceivableByPlayer)
    .map((event) => ({
      summary: event.summary,
      tick: event.tick,
      source: event.source,
    }));
}

export function buildModelFacingTurnPacketV2(
  envelope: SceneFrameEnvelopeV2,
): ModelFacingTurnPacketV2 {
  const frame = envelope.frame;
  const currentLocationLabel = firstText(frame.currentLocationName, "current_location");
  const currentSceneLabel = firstText(frame.currentSceneScopeName, frame.currentLocationName, "current_scene");
  const actors = [
    {
      ref: "Player",
      label: "Player",
      role: "player" as const,
      awarenessHint: null,
      status: {
        conditions: frame.roster.active
          .find((actor) => actor.type === "player")
          ?.statusConditions?.slice(0, 12) ?? [],
        hp: frame.roster.active
          .find((actor) => actor.type === "player")
          ?.hp ?? null,
      },
    },
    ...actorRows("active", frame.roster.active),
    ...actorRows("support", frame.roster.support),
    ...actorRows("background", frame.roster.background),
  ];
  const movementOptions = frame.movementCandidates.map((candidate) => ({
    ref: candidate.label,
    label: candidate.label,
    connected: candidate.connected,
    travelCost: candidate.travelCost ?? null,
  }));
  const targets = frame.targetCandidates
    .filter((target) => !isPlayerTarget(target, frame))
    .map((target) => ({
      ref: target.label,
      label: target.label,
      kind: targetKind(target),
    }));
  const inventory = (frame.playerInventory ?? []).map((item) => ({
    ref: item.label,
    label: item.label,
    equipState: item.equipState,
    tags: item.tags.slice(0, 12),
  }));
  const capabilities = toModelFacingCapabilitiesV2(envelope.refs.allowedCapabilityIds);
  const forecastEntries = (envelope.scopedForecastExcerpt?.entries ?? []).map((entry) => ({
    ref: entry.entryId,
    horizonTicks: entry.horizonTicks,
    pressure: entry.pressure,
    confidence: entry.confidence,
  }));
  const runtimePrivateGuardTerms = uniqueStrings([
    ...envelope.refs.privateGuardTerms,
    ...(envelope.scopedForecastExcerpt?.forbiddenPrivateTerms ?? []),
  ]);

  return assertModelFacingTurnPacketV2({
    version: "model-facing-turn-packet.v2",
    campaignId: envelope.attempt.campaignId,
    turnId: envelope.attempt.turnId,
    playerAction: envelope.attempt.playerAction,
    baseTick: envelope.attempt.baseTick,
    baseWorldVersion: envelope.attempt.baseWorldVersion,
    scene: {
      currentLocation: {
        ref: currentLocationLabel,
        label: currentLocationLabel,
        description: frame.currentLocationDescription?.trim() || null,
      },
      currentScene: {
        ref: currentSceneLabel,
        label: currentSceneLabel,
        description: frame.currentSceneScopeDescription?.trim() || null,
      },
      actors,
      movementOptions,
      targets,
      inventory,
      recentEvents: eventRows(frame.recentEvents),
    },
    capabilities,
    forecast: {
      advisoryOnly: true,
      entries: forecastEntries,
    },
    citableRefs: uniqueStrings([
      ...envelope.refs.visibleRefs,
      currentLocationLabel,
      currentSceneLabel,
      ...actors.map((actor) => actor.ref),
      ...movementOptions.map((option) => option.ref),
      ...targets.map((target) => target.ref),
      ...inventory.map((item) => item.ref),
      ...forecastEntries.map((entry) => entry.ref),
    ]),
    runtimePrivateGuardTerms,
  });
}

export function formatModelFacingTurnPacketForPromptV2(
  packet: ModelFacingTurnPacketV2,
): Omit<ModelFacingTurnPacketV2, "runtimePrivateGuardTerms"> {
  const { runtimePrivateGuardTerms: _privateTerms, ...promptSafe } = packet;
  return promptSafe;
}
