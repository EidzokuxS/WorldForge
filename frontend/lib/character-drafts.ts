import type {
  CharacterDraft,
  CharacterDraftPatch,
  CharacterRecord,
} from "@worldforge/shared";
import type { ParsedCharacter, ScaffoldNpc } from "./api-types";

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function mergeDefined<T extends object>(base: T, patch?: Partial<T>): T {
  if (!patch) {
    return { ...base };
  }

  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ),
  };
}

function buildDerivedTagsFromDraft(draft: CharacterDraft): string[] {
  return dedupeStrings([
    ...draft.capabilities.traits,
    ...draft.capabilities.skills.map((skill) =>
      skill.tier ? `${skill.tier} ${skill.name}` : skill.name
    ),
    ...draft.capabilities.flaws,
    ...(draft.capabilities.wealthTier ? [draft.capabilities.wealthTier] : []),
    ...draft.state.conditions,
    ...draft.state.statusFlags,
    ...draft.socialContext.socialStatus,
    ...draft.motivations.drives,
    ...draft.motivations.frictions,
  ]);
}

function mapDraftTierToScaffoldTier(
  tier: CharacterDraft["identity"]["tier"],
): ScaffoldNpc["tier"] {
  return tier === "key" ? "key" : "supporting";
}

function mapScaffoldTierToDraftTier(
  tier: ScaffoldNpc["tier"],
): CharacterDraft["identity"]["tier"] {
  return tier === "key" ? "key" : "supporting";
}

function resolveScaffoldNpcTier(npc: Partial<Pick<ScaffoldNpc, "tier" | "draft">>): ScaffoldNpc["tier"] {
  if (npc.tier) {
    return npc.tier;
  }

  if (npc.draft) {
    return mapDraftTierToScaffoldTier(npc.draft.identity.tier);
  }

  return "key";
}

export function syncScaffoldTierToDraft(
  draft: CharacterDraft,
  tier: ScaffoldNpc["tier"],
): CharacterDraft {
  return {
    ...draft,
    identity: {
      ...draft.identity,
      tier: mapScaffoldTierToDraftTier(tier),
    },
  };
}

export function characterRecordToDraft(record: CharacterRecord): CharacterDraft {
  const { id, campaignId, ...identity } = record.identity;
  void id;
  void campaignId;
  return {
    ...record,
    identity,
  };
}

export function characterDraftToParsedCharacter(
  draft: CharacterDraft,
): ParsedCharacter {
  return {
    name: draft.identity.displayName,
    race: draft.profile.species,
    gender: draft.profile.gender,
    age: draft.profile.ageText,
    appearance: draft.profile.appearance,
    tags: buildDerivedTagsFromDraft(draft),
    hp: draft.state.hp,
    equippedItems: [...draft.loadout.equippedItemRefs],
    locationName: draft.socialContext.currentLocationName ?? "",
    draft,
  };
}

export function characterDraftToScaffoldNpc(draft: CharacterDraft): ScaffoldNpc {
  return {
    name: draft.identity.displayName,
    persona: draft.profile.personaSummary,
    tags: buildDerivedTagsFromDraft(draft),
    goals: {
      shortTerm: [...draft.motivations.shortTermGoals],
      longTerm: [...draft.motivations.longTermGoals],
    },
    locationName: draft.socialContext.currentLocationName ?? "",
    factionName: draft.socialContext.factionName,
    tier: mapDraftTierToScaffoldTier(draft.identity.tier),
    draft,
  };
}

export function applyCharacterDraftPatch(
  draft: CharacterDraft,
  patch: CharacterDraftPatch,
  templateId?: string | null,
): CharacterDraft {
  return {
    ...draft,
    profile: mergeDefined(draft.profile, patch.profile),
    socialContext: mergeDefined(draft.socialContext, patch.socialContext),
    motivations: mergeDefined(draft.motivations, patch.motivations),
    capabilities: mergeDefined(draft.capabilities, patch.capabilities),
    state: mergeDefined(draft.state, patch.state),
    loadout: mergeDefined(draft.loadout, patch.loadout),
    startConditions: mergeDefined(draft.startConditions, patch.startConditions),
    provenance: {
      ...draft.provenance,
      ...(patch.provenance ?? {}),
      templateId:
        templateId ?? patch.provenance?.templateId ?? draft.provenance.templateId,
    },
  };
}

export function parsedCharacterToDraft(character: ParsedCharacter): CharacterDraft {
  const base = character.draft ?? {
    identity: {
      role: "player" as const,
      tier: "key" as const,
      displayName: character.name,
      canonicalStatus: "original" as const,
    },
    profile: {
      species: character.race,
      gender: character.gender,
      ageText: character.age,
      appearance: character.appearance,
      backgroundSummary: "",
      personaSummary: "",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: character.locationName,
      relationshipRefs: [],
      socialStatus: [...character.tags],
      originMode: "native" as const,
    },
    motivations: {
      shortTermGoals: [],
      longTermGoals: [],
      beliefs: [],
      drives: [],
      frictions: [],
    },
    capabilities: {
      traits: [],
      skills: [],
      flaws: [],
      specialties: [],
      wealthTier: null,
    },
    state: {
      hp: character.hp,
      conditions: [],
      statusFlags: [],
      activityState: "idle",
    },
    loadout: {
      inventorySeed: [...character.equippedItems],
      equippedItemRefs: [...character.equippedItems],
      currencyNotes: "",
      signatureItems: [...character.equippedItems],
    },
    startConditions: {},
    provenance: {
      sourceKind: "player-input" as const,
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [...character.tags],
    },
  };

  return {
    ...base,
    identity: {
      ...base.identity,
      role: "player",
      tier: "key",
      displayName: character.name,
    },
    profile: {
      ...base.profile,
      species: character.race,
      gender: character.gender,
      ageText: character.age,
      appearance: character.appearance,
    },
    socialContext: {
      ...base.socialContext,
      currentLocationName: character.locationName,
    },
    state: {
      ...base.state,
      hp: character.hp,
    },
    loadout: {
      ...base.loadout,
      inventorySeed:
        base.loadout.inventorySeed.length > 0
          ? base.loadout.inventorySeed
          : [...character.equippedItems],
      equippedItemRefs: [...character.equippedItems],
      signatureItems:
        base.loadout.signatureItems.length > 0
          ? base.loadout.signatureItems
          : [...character.equippedItems],
    },
    provenance: {
      ...base.provenance,
      legacyTags: [...character.tags],
    },
  };
}

export function scaffoldNpcToDraft(npc: ScaffoldNpc): CharacterDraft {
  const tier = resolveScaffoldNpcTier(npc);
  const base = npc.draft ?? {
    identity: {
      role: "npc" as const,
      tier: mapScaffoldTierToDraftTier(tier),
      displayName: npc.name,
      canonicalStatus: "original" as const,
    },
    profile: {
      species: "",
      gender: "",
      ageText: "",
      appearance: "",
      backgroundSummary: "",
      personaSummary: npc.persona,
    },
    socialContext: {
      factionId: null,
      factionName: npc.factionName,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: npc.locationName,
      relationshipRefs: [],
      socialStatus: [...npc.tags],
      originMode: "unknown" as const,
    },
    motivations: {
      shortTermGoals: [...npc.goals.shortTerm],
      longTermGoals: [...npc.goals.longTerm],
      beliefs: [],
      drives: [],
      frictions: [],
    },
    capabilities: {
      traits: [],
      skills: [],
      flaws: [],
      specialties: [],
      wealthTier: null,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "active",
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: [],
    },
    startConditions: {},
    provenance: {
      sourceKind: "worldgen" as const,
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [...npc.tags],
    },
  };

  return syncScaffoldTierToDraft({
    ...base,
    identity: {
      ...base.identity,
      role: "npc",
      displayName: npc.name,
    },
    profile: {
      ...base.profile,
      personaSummary: npc.persona,
    },
    socialContext: {
      ...base.socialContext,
      factionName: npc.factionName,
      currentLocationName: npc.locationName,
    },
    motivations: {
      ...base.motivations,
      shortTermGoals: [...npc.goals.shortTerm],
      longTermGoals: [...npc.goals.longTerm],
    },
    provenance: {
      ...base.provenance,
      legacyTags: [...npc.tags],
    },
  }, tier);
}

export function createEmptyNpcDraft(
  locationName: string,
  tier: ScaffoldNpc["tier"],
): CharacterDraft {
  return {
    identity: {
      role: "npc",
      tier: mapScaffoldTierToDraftTier(tier),
      displayName: "",
      canonicalStatus: "original",
    },
    profile: {
      species: "",
      gender: "",
      ageText: "",
      appearance: "",
      backgroundSummary: "",
      personaSummary: "",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: locationName,
      relationshipRefs: [],
      socialStatus: [],
      originMode: "resident",
    },
    motivations: {
      shortTermGoals: [],
      longTermGoals: [],
      beliefs: [],
      drives: [],
      frictions: [],
    },
    capabilities: {
      traits: [],
      skills: [],
      flaws: [],
      specialties: [],
      wealthTier: null,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "active",
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: [],
    },
    startConditions: {},
    provenance: {
      sourceKind: "worldgen",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
  };
}
