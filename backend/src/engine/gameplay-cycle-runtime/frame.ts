import { createHash, randomUUID } from "node:crypto";

import { buildSceneFrame, type SceneFrame } from "../scene-frame.js";
import {
  buildScopedForecastExcerpt,
  loadWorldTrajectoryForecast,
} from "../world-forecast.js";
import type { GameplayRuntimeTurnInput } from "./contracts.js";
import {
  assertAuthoritativeSceneFrame,
  type AuthoritativeSceneFrame,
  type GameplayRuntimeCapabilityId,
  type ScopedForecastEnvelope,
} from "./contracts.js";

const LIVE_GAMEPLAY_CAPABILITIES: GameplayRuntimeCapabilityId[] = [
  "observe_visible",
  "oracle_roll",
  "route_options",
  "route_check",
  "movement",
  "dialogue_record",
  "world_fact_record",
  "support_actor_create",
  "entity_tag",
  "item_transfer",
  "condition_set",
  "time_advance",
  "quick_action_offer",
  "scene_beat_record",
  "location_reveal",
  "minor_poi_create",
];

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "current_scene";
}

function stableFrameId(input: GameplayRuntimeTurnInput): string {
  const hash = createHash("sha256")
    .update(`${input.campaignId}:${input.turnId}:${input.base.tick}:${input.base.worldVersion}`)
    .digest("hex")
    .slice(0, 12);
  return `frame-${hash}-${randomUUID().slice(0, 8)}`;
}

function actorRows(frame: SceneFrame): AuthoritativeSceneFrame["actors"] {
  const rows = [
    ...frame.roster.active.map((actor) => ({ actor, role: "active" as const })),
    ...frame.roster.support.map((actor) => ({ actor, role: "support" as const })),
    ...frame.roster.background.map((actor) => ({ actor, role: "background" as const })),
  ];
  return rows
    .filter(({ actor }) => actor.type !== "player")
    .map(({ actor, role }) => ({
      ref: firstText(actor.label, actor.id),
      label: firstText(actor.label, actor.id),
      role,
      visibleStatus: {
        hp: typeof actor.hp === "number" ? actor.hp : null,
        conditions: actor.statusConditions?.slice(0, 12) ?? [],
      },
    }));
}

function playerView(frame: SceneFrame): AuthoritativeSceneFrame["player"] {
  const player = frame.roster.active.find((actor) => actor.type === "player");
  return {
    ref: "Player",
    label: firstText(player?.label, "Player"),
    visibleStatus: {
      hp: typeof player?.hp === "number" ? player.hp : null,
      conditions: player?.statusConditions?.slice(0, 12) ?? [],
    },
  };
}

function targetKind(target: SceneFrame["targetCandidates"][number]): "actor" | "item" | "location" | "faction" | "unknown" {
  if (target.type === "actor" || target.type === "item" || target.type === "location" || target.type === "faction") {
    return target.type;
  }
  return "unknown";
}

function eventRows(frame: SceneFrame): AuthoritativeSceneFrame["scene"]["recentLocalFacts"] {
  return frame.recentEvents.slice(0, 24).map((event, index) => ({
    factId: firstText(event.id, `recent-${index + 1}`),
    summary: firstText(event.summary, "Recent local event."),
    source: firstText(event.source, "location_recent_event"),
    tick: typeof event.tick === "number" ? event.tick : null,
  }));
}

function forecastLocalRefs(frame: SceneFrame): string[] {
  return [
    frame.currentLocationName,
    frame.currentSceneScopeName,
    ...frame.roster.active.map((actor) => actor.label),
    ...frame.roster.support.map((actor) => actor.label),
    ...frame.movementCandidates.map((candidate) => candidate.label),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function buildForecastEnvelope(frame: SceneFrame, campaignId: string): ScopedForecastEnvelope {
  const forecast = loadWorldTrajectoryForecast(campaignId);
  if (!forecast) {
    return {
      version: "scoped-forecast.v1",
      advisoryOnly: true,
      sourceStatus: "empty_missing",
      mayAuthorizeMutation: false,
      maySupportNarrationClaim: false,
      entries: [],
      forbiddenPrivateTerms: [],
    };
  }
  try {
    const scoped = buildScopedForecastExcerpt({
      forecast,
      localRefs: forecastLocalRefs(frame),
    });
    return {
      version: "scoped-forecast.v1",
      advisoryOnly: true,
      sourceStatus: scoped.entries.length > 0 ? "loaded" : "empty_missing",
      mayAuthorizeMutation: false,
      maySupportNarrationClaim: false,
      entries: scoped.entries.slice(0, 12).map((entry) => ({
        ref: entry.entryId,
        horizonTicks: entry.horizonTicks,
        pressure: entry.pressure,
        confidence: entry.confidence,
        localRelevanceRefs: [],
      })),
      forbiddenPrivateTerms: scoped.forbiddenPrivateTerms.slice(0, 64),
    };
  } catch {
    return {
      version: "scoped-forecast.v1",
      advisoryOnly: true,
      sourceStatus: "empty_unavailable",
      mayAuthorizeMutation: false,
      maySupportNarrationClaim: false,
      entries: [],
      forbiddenPrivateTerms: [],
    };
  }
}

export async function buildAuthoritativeSceneFrame(
  input: GameplayRuntimeTurnInput,
): Promise<AuthoritativeSceneFrame> {
  const frame = await buildSceneFrame({
    campaignId: input.campaignId,
    tick: input.base.tick,
    playerAction: input.playerAction.normalized,
    runActorExposureCatchup: false,
    allowedTools: [],
    toolExposureMode: "internal",
  });
  const currentLocationLabel = firstText(frame.currentLocationName, "current_location");
  const currentSceneLabel = firstText(frame.currentSceneScopeName, frame.currentLocationName, "current_scene");
  const player = playerView(frame);
  const actors = actorRows(frame);
  const movementOptions = frame.movementCandidates.map((candidate) => ({
    ref: firstText(candidate.label),
    label: firstText(candidate.label),
    connected: candidate.connected,
    travelCost: candidate.travelCost ?? null,
  }));
  const targets = frame.targetCandidates
    .filter((target) => firstText(target.label) !== player.label)
    .map((target) => ({
      ref: firstText(target.label),
      label: firstText(target.label),
      kind: targetKind(target),
    }));
  const inventory = (frame.playerInventory ?? []).map((item) => ({
    ref: firstText(item.label),
    label: firstText(item.label),
    equipState: item.equipState,
    tags: item.tags.slice(0, 12),
  }));
  const recentLocalFacts = eventRows(frame);
  const forecast = buildForecastEnvelope(frame, input.campaignId);

  return assertAuthoritativeSceneFrame({
    version: "scene-frame.v1",
    frameId: stableFrameId(input),
    campaignId: input.campaignId,
    turnId: input.turnId,
    base: {
      tick: input.base.tick,
      worldVersion: input.base.worldVersion,
      worldTimeMinutes: input.base.worldTimeMinutes ?? 0,
    },
    playerAction: input.playerAction.normalized,
    player,
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
      visibleFacts: [],
      recentLocalFacts,
    },
    actors,
    movementOptions,
    targets,
    inventory,
    capabilities: LIVE_GAMEPLAY_CAPABILITIES.map((capabilityId) => ({
      capabilityId,
      evidenceAuthority: capabilityId === "observe_visible" || capabilityId === "route_options"
        ? "observation_only"
        : capabilityId === "dialogue_record" || capabilityId === "scene_beat_record"
          ? "terminal_receipt_required"
          : "receipt_required",
      allowed: true,
    })),
    citableRefs: [
      "Player",
      currentLocationLabel,
      currentSceneLabel,
      ...actors.map((actor) => actor.ref),
      ...movementOptions.map((option) => option.ref),
      ...targets.map((target) => target.ref),
      ...inventory.map((item) => item.ref),
    ].filter((ref, index, refs) => refs.indexOf(ref) === index),
    privateGuards: {
      forbiddenActorLabels: frame.perception.forbiddenActorLabels?.slice(0, 64) ?? [],
      forbiddenPrivateTerms: forecast.forbiddenPrivateTerms,
    },
    forecast,
  });
}
