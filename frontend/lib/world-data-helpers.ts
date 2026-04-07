/**
 * Helpers for transforming raw WorldData (DB IDs) into EditableScaffold
 * (human-readable names). Used by both world-review pages.
 */

import type {
  WorldData,
  EditableScaffold,
  LoreCardItem,
  ScaffoldNpc,
} from "./api-types";
import type { CharacterDraft } from "@worldforge/shared";
import { characterDraftToScaffoldNpc } from "./character-drafts";

export interface WorldIdMaps {
  readonly locationIdToName: ReadonlyMap<string, string>;
  readonly factionIdToName: ReadonlyMap<string, string>;
  readonly npcIdToName: ReadonlyMap<string, string>;
}

function mapDraftTierToScaffoldTier(
  tier: CharacterDraft["identity"]["tier"] | null | undefined,
): ScaffoldNpc["tier"] | null {
  if (!tier) {
    return null;
  }

  return tier === "key" ? "key" : "supporting";
}

function mapWorldRowTierToScaffoldTier(
  tier: string | null | undefined,
): ScaffoldNpc["tier"] | null {
  if (tier === "key") {
    return "key";
  }

  if (tier === "supporting" || tier === "persistent" || tier === "temporary") {
    return "supporting";
  }

  return null;
}

function resolveEditableNpcTier(
  npc: WorldData["npcs"][number],
): ScaffoldNpc["tier"] {
  return (
    mapDraftTierToScaffoldTier(npc.draft?.identity.tier)
    ?? mapWorldRowTierToScaffoldTier(npc.tier)
    ?? "key"
  );
}

/** Build ID-to-name lookup maps from raw world data. */
export function buildIdMaps(world: WorldData): WorldIdMaps {
  return {
    locationIdToName: new Map(world.locations.map((l) => [l.id, l.name])),
    factionIdToName: new Map(world.factions.map((f) => [f.id, f.name])),
    npcIdToName: new Map(world.npcs.map((n) => [n.id, n.name])),
  };
}

/** Parse relationship rows into faction-territory and npc-faction lookup maps. */
export function buildRelationshipMaps(
  world: WorldData,
  idMaps: WorldIdMaps,
): {
  factionTerritories: ReadonlyMap<string, string[]>;
  npcFaction: ReadonlyMap<string, string>;
} {
  const factionTerritories = new Map<string, string[]>();
  const npcFaction = new Map<string, string>();

  for (const rel of world.relationships) {
    if (rel.tags.includes("Controls")) {
      const factionName = idMaps.factionIdToName.get(rel.entityA);
      const locationName = idMaps.locationIdToName.get(rel.entityB);
      if (factionName && locationName) {
        const existing = factionTerritories.get(factionName) ?? [];
        factionTerritories.set(factionName, [...existing, locationName]);
      }
    } else if (rel.tags.includes("Member")) {
      const nName = idMaps.npcIdToName.get(rel.entityA);
      const fName = idMaps.factionIdToName.get(rel.entityB);
      if (nName && fName) {
        npcFaction.set(nName, fName);
      }
    }
  }

  return { factionTerritories, npcFaction };
}

/** Transform raw WorldData + campaign premise + lore into an EditableScaffold. */
export function toEditableScaffold(
  world: WorldData,
  premise: string,
  lore: LoreCardItem[],
): EditableScaffold {
  const idMaps = buildIdMaps(world);
  const { factionTerritories, npcFaction } = buildRelationshipMaps(world, idMaps);

  return {
    refinedPremise: premise,
    locations: world.locations.map((loc) => ({
      name: loc.name,
      description: loc.description,
      tags: loc.tags,
      isStarting: loc.isStarting,
      connectedTo: loc.connectedTo
        .map((id) => idMaps.locationIdToName.get(id))
        .filter((n): n is string => n != null),
    })),
    factions: world.factions.map((fac) => ({
      name: fac.name,
      tags: fac.tags,
      goals: fac.goals,
      assets: fac.assets,
      territoryNames: factionTerritories.get(fac.name) ?? [],
    })),
    npcs: world.npcs.map((npc) => {
      const draft = npc.draft ?? null;
      const goals = npc.goals as Record<string, unknown>;
      const shortTerm = Array.isArray(goals.short_term)
        ? (goals.short_term as string[])
        : Array.isArray(goals.shortTerm)
          ? (goals.shortTerm as string[])
          : [];
      const longTerm = Array.isArray(goals.long_term)
        ? (goals.long_term as string[])
        : Array.isArray(goals.longTerm)
          ? (goals.longTerm as string[])
          : [];
      const draftNpc = draft ? draftToEditableNpc(draft) : null;
      const tier = resolveEditableNpcTier(npc);
      return {
        name: draftNpc?.name ?? npc.name,
        persona: draftNpc?.persona ?? npc.persona,
        tags: draftNpc?.tags ?? npc.tags,
        goals: draftNpc?.goals ?? { shortTerm, longTerm },
        locationName: draftNpc?.locationName ?? (npc.currentLocationId
          ? idMaps.locationIdToName.get(npc.currentLocationId) ?? ""
          : ""),
        factionName: draftNpc?.factionName ?? npcFaction.get(npc.name) ?? null,
        tier,
        ...(draft ? { draft } : {}),
      };
    }),
    loreCards: lore.map((lc) => ({
      term: lc.term,
      definition: lc.definition,
      category: lc.category,
    })),
    personaTemplates: world.personaTemplates,
  };
}

function draftToEditableNpc(draft: CharacterDraft) {
  return characterDraftToScaffoldNpc(draft);
}
