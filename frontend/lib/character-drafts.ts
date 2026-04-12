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

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function firstNonEmptyList(...lists: Array<readonly string[] | null | undefined>): string[] {
  for (const list of lists) {
    if (!list) {
      continue;
    }

    const normalized = dedupeStrings([...list]);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

function normalizeSourceBundle(
  sourceBundle: CharacterDraft["sourceBundle"],
): CharacterDraft["sourceBundle"] {
  if (!sourceBundle) {
    return undefined;
  }

  return {
    canonSources: sourceBundle.canonSources.map((citation) => ({
      ...citation,
      label: citation.label.trim(),
      excerpt: citation.excerpt.trim(),
    })),
    secondarySources: sourceBundle.secondarySources.map((citation) => ({
      ...citation,
      label: citation.label.trim(),
      excerpt: citation.excerpt.trim(),
    })),
    synthesis: {
      ...sourceBundle.synthesis,
      owner: sourceBundle.synthesis.owner.trim(),
      strategy: sourceBundle.synthesis.strategy.trim(),
      notes: dedupeStrings(sourceBundle.synthesis.notes),
    },
  };
}

function normalizeContinuity(
  continuity: CharacterDraft["continuity"],
): CharacterDraft["continuity"] {
  if (!continuity) {
    return undefined;
  }

  return {
    identityInertia: continuity.identityInertia,
    protectedCore: dedupeStrings(continuity.protectedCore),
    mutableSurface: dedupeStrings(continuity.mutableSurface),
    changePressureNotes: dedupeStrings(continuity.changePressureNotes),
  };
}

function normalizeCharacterDraft(draft: CharacterDraft): CharacterDraft {
  const baseFacts = {
    biography: firstNonEmpty(
      draft.identity.baseFacts?.biography,
      draft.profile.backgroundSummary,
    ),
    socialRole: dedupeStrings([
      ...(draft.identity.baseFacts?.socialRole ?? []),
      draft.identity.role,
      draft.socialContext.factionName ?? "",
    ]),
    hardConstraints: dedupeStrings(draft.identity.baseFacts?.hardConstraints ?? []),
  };
  const behavioralCore = {
    motives: firstNonEmptyList(
      draft.identity.behavioralCore?.motives,
      draft.motivations.drives,
    ),
    pressureResponses: firstNonEmptyList(
      draft.identity.behavioralCore?.pressureResponses,
      draft.motivations.frictions,
    ),
    taboos: dedupeStrings(draft.identity.behavioralCore?.taboos ?? []),
    attachments: firstNonEmptyList(
      draft.identity.behavioralCore?.attachments,
      draft.socialContext.relationshipRefs.map((ref) => ref.entityName),
    ),
    selfImage: firstNonEmpty(
      draft.identity.behavioralCore?.selfImage,
      draft.profile.personaSummary,
      draft.profile.backgroundSummary,
    ),
  };
  const liveDynamics = {
    activeGoals: firstNonEmptyList(
      draft.identity.liveDynamics?.activeGoals,
      [...draft.motivations.shortTermGoals, ...draft.motivations.longTermGoals],
    ),
    beliefDrift: firstNonEmptyList(
      draft.identity.liveDynamics?.beliefDrift,
      draft.motivations.beliefs,
    ),
    currentStrains: firstNonEmptyList(
      draft.identity.liveDynamics?.currentStrains,
      draft.motivations.frictions,
    ),
    earnedChanges: dedupeStrings(draft.identity.liveDynamics?.earnedChanges ?? []),
  };

  return {
    ...draft,
    identity: {
      ...draft.identity,
      baseFacts,
      behavioralCore,
      liveDynamics,
    },
    profile: {
      ...draft.profile,
      backgroundSummary: firstNonEmpty(
        draft.profile.backgroundSummary,
        baseFacts.biography,
      ),
      personaSummary: firstNonEmpty(
        draft.profile.personaSummary,
        behavioralCore.selfImage,
        baseFacts.biography,
      ),
    },
    socialContext: {
      ...draft.socialContext,
      socialStatus: dedupeStrings(draft.socialContext.socialStatus),
    },
    motivations: {
      ...draft.motivations,
      shortTermGoals: firstNonEmptyList(
        draft.motivations.shortTermGoals,
        liveDynamics.activeGoals,
      ),
      longTermGoals: dedupeStrings(draft.motivations.longTermGoals),
      beliefs: firstNonEmptyList(
        draft.motivations.beliefs,
        liveDynamics.beliefDrift,
      ),
      drives: firstNonEmptyList(
        draft.motivations.drives,
        behavioralCore.motives,
      ),
      frictions: firstNonEmptyList(
        draft.motivations.frictions,
        liveDynamics.currentStrains,
      ),
    },
    capabilities: {
      ...draft.capabilities,
      traits: dedupeStrings(draft.capabilities.traits),
      flaws: dedupeStrings(draft.capabilities.flaws),
      specialties: dedupeStrings(draft.capabilities.specialties),
    },
    state: {
      ...draft.state,
      conditions: dedupeStrings(draft.state.conditions),
      statusFlags: dedupeStrings(draft.state.statusFlags),
    },
    loadout: {
      ...draft.loadout,
      inventorySeed: dedupeStrings(draft.loadout.inventorySeed),
      equippedItemRefs: dedupeStrings(draft.loadout.equippedItemRefs),
      signatureItems: dedupeStrings(draft.loadout.signatureItems),
    },
    sourceBundle: normalizeSourceBundle(draft.sourceBundle),
    continuity: normalizeContinuity(draft.continuity),
  };
}

function buildDerivedTagsFromDraft(draft: CharacterDraft): string[] {
  const normalizedDraft = normalizeCharacterDraft(draft);

  return dedupeStrings([
    ...normalizedDraft.capabilities.traits,
    ...normalizedDraft.capabilities.skills.map((skill) =>
      skill.tier ? `${skill.tier} ${skill.name}` : skill.name
    ),
    ...normalizedDraft.capabilities.flaws,
    ...(normalizedDraft.capabilities.wealthTier ? [normalizedDraft.capabilities.wealthTier] : []),
    ...normalizedDraft.state.conditions,
    ...normalizedDraft.state.statusFlags,
    ...normalizedDraft.socialContext.socialStatus,
    ...normalizedDraft.motivations.drives,
    ...normalizedDraft.motivations.frictions,
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
  return normalizeCharacterDraft({
    ...record,
    identity,
  });
}

export function characterDraftToParsedCharacter(
  draft: CharacterDraft,
): ParsedCharacter {
  const normalizedDraft = normalizeCharacterDraft(draft);

  return {
    name: normalizedDraft.identity.displayName,
    race: normalizedDraft.profile.species,
    gender: normalizedDraft.profile.gender,
    age: normalizedDraft.profile.ageText,
    appearance: normalizedDraft.profile.appearance,
    tags: buildDerivedTagsFromDraft(normalizedDraft),
    hp: normalizedDraft.state.hp,
    equippedItems: [...normalizedDraft.loadout.equippedItemRefs],
    locationName: normalizedDraft.socialContext.currentLocationName ?? "",
    draft: normalizedDraft,
  };
}

export function characterDraftToScaffoldNpc(draft: CharacterDraft): ScaffoldNpc {
  const normalizedDraft = normalizeCharacterDraft(draft);

  return {
    name: normalizedDraft.identity.displayName,
    persona: normalizedDraft.profile.personaSummary,
    tags: buildDerivedTagsFromDraft(normalizedDraft),
    goals: {
      shortTerm: [...normalizedDraft.motivations.shortTermGoals],
      longTerm: [...normalizedDraft.motivations.longTermGoals],
    },
    locationName: normalizedDraft.socialContext.currentLocationName ?? "",
    factionName: normalizedDraft.socialContext.factionName,
    tier: mapDraftTierToScaffoldTier(normalizedDraft.identity.tier),
    draft: normalizedDraft,
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
      baseFacts: {
        biography: "",
        socialRole: ["player"],
        hardConstraints: [],
      },
      behavioralCore: {
        motives: [],
        pressureResponses: [],
        taboos: [],
        attachments: [],
        selfImage: "",
      },
      liveDynamics: {
        activeGoals: [],
        beliefDrift: [],
        currentStrains: [],
        earnedChanges: [],
      },
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

  return normalizeCharacterDraft({
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
  });
}

export function scaffoldNpcToDraft(npc: ScaffoldNpc): CharacterDraft {
  const tier = resolveScaffoldNpcTier(npc);
  const base = npc.draft ?? {
    identity: {
      role: "npc" as const,
      tier: mapScaffoldTierToDraftTier(tier),
      displayName: npc.name,
      canonicalStatus: "original" as const,
      baseFacts: {
        biography: "",
        socialRole: ["npc", ...(npc.factionName ? [npc.factionName] : [])],
        hardConstraints: [],
      },
      behavioralCore: {
        motives: [],
        pressureResponses: [],
        taboos: [],
        attachments: [],
        selfImage: npc.persona,
      },
      liveDynamics: {
        activeGoals: [
          ...dedupeStrings([...npc.goals.shortTerm, ...npc.goals.longTerm]),
        ],
        beliefDrift: [],
        currentStrains: [],
        earnedChanges: [],
      },
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

  return syncScaffoldTierToDraft(normalizeCharacterDraft({
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
  }), tier);
}

export function createEmptyNpcDraft(
  locationName: string,
  tier: ScaffoldNpc["tier"],
): CharacterDraft {
  return normalizeCharacterDraft({
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
  });
}
