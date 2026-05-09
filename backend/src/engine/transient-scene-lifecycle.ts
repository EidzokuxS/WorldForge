import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { locations, npcs, players } from "../db/schema.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("transient-scene-lifecycle");

type CleanupLocationRow = {
  id: string;
  kind: "macro" | "persistent_sublocation" | "ephemeral_scene";
  persistence: "persistent" | "ephemeral";
  expiresAtTick: number | null;
  archivedAtTick: number | null;
};

type CleanupNpcRow = {
  id: string;
  tier: "temporary" | "persistent" | "key";
  currentLocationId: string | null;
  currentSceneLocationId: string | null;
};

type CleanupPlayerRow = {
  currentLocationId: string | null;
  currentSceneLocationId: string | null;
};

export interface TransientSceneCleanupResult {
  archivedSceneIds: string[];
  retiredNpcIds: string[];
  skippedProtectedSceneIds: string[];
}

function isExpiredEphemeralScene(location: CleanupLocationRow, tick: number): boolean {
  return (
    location.kind === "ephemeral_scene" &&
    location.persistence === "ephemeral" &&
    location.archivedAtTick == null &&
    location.expiresAtTick != null &&
    location.expiresAtTick <= tick
  );
}

function sceneContainsProtectedActor(input: {
  sceneId: string;
  players: readonly CleanupPlayerRow[];
  npcs: readonly CleanupNpcRow[];
}): boolean {
  const playerPresent = input.players.some(
    (player) =>
      player.currentSceneLocationId === input.sceneId ||
      player.currentLocationId === input.sceneId,
  );
  if (playerPresent) return true;

  return input.npcs.some(
    (npc) =>
      npc.tier !== "temporary" &&
      (npc.currentSceneLocationId === input.sceneId || npc.currentLocationId === input.sceneId),
  );
}

export function cleanupTransientSceneObjects(
  campaignId: string,
  tick: number,
): TransientSceneCleanupResult {
  const db = getDb();
  const locationRows = db
    .select({
      id: locations.id,
      kind: locations.kind,
      persistence: locations.persistence,
      expiresAtTick: locations.expiresAtTick,
      archivedAtTick: locations.archivedAtTick,
    })
    .from(locations)
    .where(eq(locations.campaignId, campaignId))
    .all() as CleanupLocationRow[];
  const playerRows = db
    .select({
      currentLocationId: players.currentLocationId,
      currentSceneLocationId: players.currentSceneLocationId,
    })
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .all() as CleanupPlayerRow[];
  const npcRows = db
    .select({
      id: npcs.id,
      tier: npcs.tier,
      currentLocationId: npcs.currentLocationId,
      currentSceneLocationId: npcs.currentSceneLocationId,
    })
    .from(npcs)
    .where(eq(npcs.campaignId, campaignId))
    .all() as CleanupNpcRow[];

  const expiredSceneIds = new Set(
    locationRows
      .filter((location) => isExpiredEphemeralScene(location, tick))
      .map((location) => location.id),
  );
  const protectedSceneIds = new Set<string>();
  for (const sceneId of expiredSceneIds) {
    if (sceneContainsProtectedActor({ sceneId, players: playerRows, npcs: npcRows })) {
      protectedSceneIds.add(sceneId);
    }
  }

  const retiredNpcIds: string[] = [];
  for (const npc of npcRows) {
    const sceneId = npc.currentSceneLocationId ?? npc.currentLocationId;
    if (
      npc.tier === "temporary" &&
      sceneId &&
      expiredSceneIds.has(sceneId) &&
      !protectedSceneIds.has(sceneId)
    ) {
      db.update(npcs)
        .set({
          currentLocationId: null,
          currentSceneLocationId: null,
          inactiveTicks: tick,
        })
        .where(eq(npcs.id, npc.id))
        .run();
      retiredNpcIds.push(npc.id);
    }
  }

  const archivedSceneIds: string[] = [];
  for (const sceneId of expiredSceneIds) {
    if (protectedSceneIds.has(sceneId)) continue;
    db.update(locations)
      .set({ archivedAtTick: tick })
      .where(eq(locations.id, sceneId))
      .run();
    archivedSceneIds.push(sceneId);
  }

  if (archivedSceneIds.length > 0 || retiredNpcIds.length > 0 || protectedSceneIds.size > 0) {
    log.event("transient-scene.cleanup", {
      campaignId,
      tick,
      archivedSceneCount: archivedSceneIds.length,
      retiredNpcCount: retiredNpcIds.length,
      skippedProtectedSceneCount: protectedSceneIds.size,
    });
  }

  return {
    archivedSceneIds,
    retiredNpcIds,
    skippedProtectedSceneIds: [...protectedSceneIds],
  };
}
