import type {
  CharacterDraft,
  CharacterImportMode,
  CharacterRecord,
  CharacterSkill,
  CharacterTier,
  CharacterWealthTier,
  PlayerCharacter,
} from "@worldforge/shared";
import { CHARACTER_SKILL_TIERS, CHARACTER_WEALTH_TIERS } from "@worldforge/shared";
import type { ScaffoldNpc } from "../worldgen/types.js";
import { deriveRuntimeCharacterTags } from "./runtime-tags.js";

const CONDITION_TAGS = new Set([
  "bleeding",
  "burned",
  "cursed",
  "disguised",
  "exhausted",
  "hidden",
  "injured",
  "poisoned",
  "prone",
  "sick",
  "starving",
  "wounded",
]);

const FLAW_TAGS = new Set([
  "arrogant",
  "cowardly",
  "cold-blooded",
  "greedy",
  "paranoid",
  "reckless",
  "ruthless",
  "vengeful",
]);

const DEFAULT_ACTIVITY_STATE = "idle";

type LegacyPlayerRow = {
  id: string;
  campaignId: string;
  name: string;
  race: string;
  gender: string;
  age: string;
  appearance: string;
  hp: number;
  tags: string;
  equippedItems: string;
  currentLocationId: string | null;
};

type StoredPlayerRow = LegacyPlayerRow & {
  characterRecord?: string | null;
  derivedTags?: string | null;
};

type LegacyNpcRow = {
  id: string;
  campaignId: string;
  name: string;
  persona: string;
  tags: string;
  tier: "temporary" | "persistent" | "key";
  currentLocationId: string | null;
  goals: string;
  beliefs: string;
  unprocessedImportance: number;
  inactiveTicks: number;
  createdAt: number;
};

type StoredNpcRow = LegacyNpcRow & {
  characterRecord?: string | null;
  derivedTags?: string | null;
};

interface LegacyPlayerOptions {
  currentLocationName?: string | null;
  canonicalStatus?: CharacterRecord["identity"]["canonicalStatus"];
  sourceKind?: CharacterRecord["provenance"]["sourceKind"];
  originMode?: CharacterDraft["socialContext"]["originMode"];
}

interface LegacyNpcOptions extends LegacyPlayerOptions {
  factionId?: string | null;
  factionName?: string | null;
}

interface ParsedLegacyTags {
  traits: string[];
  skills: CharacterSkill[];
  flaws: string[];
  conditions: string[];
  wealthTier: CharacterWealthTier | null;
  legacyTags: string[];
}

export function createCharacterRecordFromDraft(
  draft: CharacterDraft,
  identity: Pick<CharacterRecord["identity"], "id" | "campaignId">,
): CharacterRecord {
  return {
    ...draft,
    identity: {
      ...draft.identity,
      ...identity,
    },
  };
}

export function toCharacterDraft(record: CharacterRecord): CharacterDraft {
  const { id: _id, campaignId: _campaignId, ...identity } = record.identity;
  return {
    ...record,
    identity,
  };
}

export function fromLegacyPlayerRow(
  row: LegacyPlayerRow,
  opts: LegacyPlayerOptions = {},
): CharacterRecord {
  const parsedTags = classifyLegacyTags(safeParseStringArray(row.tags));

  return {
    identity: {
      id: row.id,
      campaignId: row.campaignId,
      role: "player",
      tier: "key",
      displayName: row.name,
      canonicalStatus: opts.canonicalStatus ?? "original",
    },
    profile: {
      species: row.race,
      gender: row.gender,
      ageText: row.age,
      appearance: row.appearance,
      backgroundSummary: "",
      personaSummary: "",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: row.currentLocationId,
      currentLocationName: opts.currentLocationName ?? null,
      relationshipRefs: [],
      socialStatus: [],
      originMode: opts.originMode ?? "native",
    },
    motivations: {
      shortTermGoals: [],
      longTermGoals: [],
      beliefs: [],
      drives: [],
      frictions: [],
    },
    capabilities: {
      traits: parsedTags.traits,
      skills: parsedTags.skills,
      flaws: parsedTags.flaws,
      specialties: [],
      wealthTier: parsedTags.wealthTier,
    },
    state: {
      hp: row.hp,
      conditions: parsedTags.conditions,
      statusFlags: [],
      activityState: DEFAULT_ACTIVITY_STATE,
    },
    loadout: {
      inventorySeed: safeParseStringArray(row.equippedItems),
      equippedItemRefs: safeParseStringArray(row.equippedItems),
      currencyNotes: "",
      signatureItems: safeParseStringArray(row.equippedItems),
    },
    startConditions: {},
    provenance: {
      sourceKind: opts.sourceKind ?? "migration",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: parsedTags.legacyTags,
    },
  };
}

export function fromLegacyPlayerCharacter(
  character: PlayerCharacter,
  opts: LegacyPlayerOptions = {},
): CharacterDraft {
  return toCharacterDraft(
    fromLegacyPlayerRow(
      {
        id: "legacy-player",
        campaignId: "legacy-campaign",
        name: character.name,
        race: character.race,
        gender: character.gender,
        age: character.age,
        appearance: character.appearance,
        hp: character.hp,
        tags: JSON.stringify(character.tags),
        equippedItems: JSON.stringify(character.equippedItems),
        currentLocationId: null,
      },
      {
        ...opts,
        currentLocationName: opts.currentLocationName ?? character.locationName,
      },
    ),
  );
}

export interface RichParsedCharacter {
  name: string;
  race: string;
  gender: string;
  age: string;
  appearance: string;
  backgroundSummary: string;
  personaSummary: string;
  tags: string[];
  drives: string[];
  frictions: string[];
  shortTermGoals: string[];
  longTermGoals: string[];
  hp: number;
  equippedItems: string[];
  locationName: string;
}

export function fromRichParsedCharacter(
  rich: RichParsedCharacter,
  opts: {
    canonicalStatus?: CharacterRecord["identity"]["canonicalStatus"];
    sourceKind?: CharacterRecord["provenance"]["sourceKind"];
    originMode?: CharacterDraft["socialContext"]["originMode"];
    importMode?: CharacterImportMode | null;
  },
): CharacterDraft {
  const parsedTags = classifyLegacyTags(rich.tags);

  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: rich.name,
      canonicalStatus: opts.canonicalStatus ?? "original",
    },
    profile: {
      species: rich.race,
      gender: rich.gender,
      ageText: rich.age,
      appearance: rich.appearance,
      backgroundSummary: rich.backgroundSummary,
      personaSummary: rich.personaSummary,
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: rich.locationName,
      relationshipRefs: [],
      socialStatus: [],
      originMode: opts.originMode ?? "native",
    },
    motivations: {
      shortTermGoals: rich.shortTermGoals,
      longTermGoals: rich.longTermGoals,
      beliefs: [],
      drives: rich.drives,
      frictions: rich.frictions,
    },
    capabilities: {
      traits: parsedTags.traits,
      skills: parsedTags.skills,
      flaws: parsedTags.flaws,
      specialties: [],
      wealthTier: parsedTags.wealthTier,
    },
    state: {
      hp: rich.hp,
      conditions: parsedTags.conditions,
      statusFlags: [],
      activityState: DEFAULT_ACTIVITY_STATE,
    },
    loadout: {
      inventorySeed: rich.equippedItems,
      equippedItemRefs: rich.equippedItems,
      currencyNotes: "",
      signatureItems: rich.equippedItems,
    },
    startConditions: {},
    provenance: {
      sourceKind: opts.sourceKind ?? "generator",
      importMode: opts.importMode ?? null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: parsedTags.legacyTags,
    },
  };
}

export function hydrateStoredPlayerRecord(
  row: StoredPlayerRow,
  opts: LegacyPlayerOptions = {},
): CharacterRecord {
  const stored = parseStoredCharacterRecord(row.characterRecord);
  if (!stored || stored.identity.role !== "player") {
    return fromLegacyPlayerRow(row, opts);
  }

  const equippedItems = safeParseStringArray(row.equippedItems);

  return {
    ...stored,
    identity: {
      ...stored.identity,
      id: row.id,
      campaignId: row.campaignId,
      role: "player",
      tier: "key",
      displayName: stored.identity.displayName || row.name,
      canonicalStatus: opts.canonicalStatus ?? stored.identity.canonicalStatus,
    },
    profile: {
      ...stored.profile,
      species: stored.profile.species || row.race,
      gender: stored.profile.gender || row.gender,
      ageText: stored.profile.ageText || row.age,
      appearance: stored.profile.appearance || row.appearance,
    },
    socialContext: {
      ...stored.socialContext,
      currentLocationId: row.currentLocationId,
      currentLocationName:
        opts.currentLocationName ?? stored.socialContext.currentLocationName,
      originMode: opts.originMode ?? stored.socialContext.originMode,
    },
    state: {
      ...stored.state,
      hp: row.hp,
    },
    loadout: {
      ...stored.loadout,
      inventorySeed:
        stored.loadout.inventorySeed.length > 0
          ? stored.loadout.inventorySeed
          : equippedItems,
      equippedItemRefs:
        stored.loadout.equippedItemRefs.length > 0
          ? stored.loadout.equippedItemRefs
          : equippedItems,
      signatureItems:
        stored.loadout.signatureItems.length > 0
          ? stored.loadout.signatureItems
          : equippedItems,
    },
    provenance: {
      ...stored.provenance,
      sourceKind: opts.sourceKind ?? stored.provenance.sourceKind,
      legacyTags: dedupeStrings([
        ...stored.provenance.legacyTags,
        ...safeParseStringArray(row.derivedTags ?? "[]"),
      ]),
    },
  };
}

export function fromLegacyNpcRow(
  row: LegacyNpcRow,
  opts: LegacyNpcOptions = {},
): CharacterRecord {
  const parsedTags = classifyLegacyTags(safeParseStringArray(row.tags));
  const goals = safeParseGoals(row.goals);

  return {
    identity: {
      id: row.id,
      campaignId: row.campaignId,
      role: "npc",
      tier: row.tier,
      displayName: row.name,
      canonicalStatus: opts.canonicalStatus ?? "original",
    },
    profile: {
      species: "",
      gender: "",
      ageText: "",
      appearance: "",
      backgroundSummary: "",
      personaSummary: row.persona,
    },
    socialContext: {
      factionId: opts.factionId ?? null,
      factionName: opts.factionName ?? null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: row.currentLocationId,
      currentLocationName: opts.currentLocationName ?? null,
      relationshipRefs: [],
      socialStatus: [],
      originMode: opts.originMode ?? "unknown",
    },
    motivations: {
      shortTermGoals: goals.shortTerm,
      longTermGoals: goals.longTerm,
      beliefs: safeParseStringArray(row.beliefs),
      drives: [],
      frictions: [],
    },
    capabilities: {
      traits: parsedTags.traits,
      skills: parsedTags.skills,
      flaws: parsedTags.flaws,
      specialties: [],
      wealthTier: parsedTags.wealthTier,
    },
    state: {
      hp: 5,
      conditions: parsedTags.conditions,
      statusFlags: [],
      activityState: row.inactiveTicks > 0 ? "inactive" : "active",
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: [],
    },
    startConditions: {},
    provenance: {
      sourceKind: opts.sourceKind ?? "migration",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: parsedTags.legacyTags,
    },
  };
}

export function fromLegacyScaffoldNpc(
  npc: ScaffoldNpc,
  opts: LegacyNpcOptions = {},
): CharacterDraft {
  return toCharacterDraft(
    fromLegacyNpcRow(
      {
        id: "legacy-npc",
        campaignId: "legacy-campaign",
        name: npc.name,
        persona: npc.persona,
        tags: JSON.stringify(npc.tags),
        tier: npc.tier === "key" ? "key" : "persistent",
        currentLocationId: null,
        goals: JSON.stringify({
          short_term: npc.goals.shortTerm,
          long_term: npc.goals.longTerm,
        }),
        beliefs: "[]",
        unprocessedImportance: 0,
        inactiveTicks: 0,
        createdAt: 0,
      },
      {
        ...opts,
        currentLocationName: opts.currentLocationName ?? npc.locationName,
        factionName: opts.factionName ?? npc.factionName,
      },
    ),
  );
}

export function hydrateStoredNpcRecord(
  row: StoredNpcRow,
  opts: LegacyNpcOptions = {},
): CharacterRecord {
  const stored = parseStoredCharacterRecord(row.characterRecord);
  if (!stored || stored.identity.role !== "npc") {
    return fromLegacyNpcRow(row, opts);
  }

  const goals = safeParseGoals(row.goals);
  const beliefs = safeParseStringArray(row.beliefs);

  return {
    ...stored,
    identity: {
      ...stored.identity,
      id: row.id,
      campaignId: row.campaignId,
      role: "npc",
      tier: row.tier,
      displayName: stored.identity.displayName || row.name,
      canonicalStatus: opts.canonicalStatus ?? stored.identity.canonicalStatus,
    },
    profile: {
      ...stored.profile,
      personaSummary: stored.profile.personaSummary || row.persona,
    },
    socialContext: {
      ...stored.socialContext,
      factionId: opts.factionId ?? stored.socialContext.factionId,
      factionName: opts.factionName ?? stored.socialContext.factionName,
      currentLocationId: row.currentLocationId,
      currentLocationName:
        opts.currentLocationName ?? stored.socialContext.currentLocationName,
      originMode: opts.originMode ?? stored.socialContext.originMode,
    },
    motivations: {
      ...stored.motivations,
      shortTermGoals:
        stored.motivations.shortTermGoals.length > 0
          ? stored.motivations.shortTermGoals
          : goals.shortTerm,
      longTermGoals:
        stored.motivations.longTermGoals.length > 0
          ? stored.motivations.longTermGoals
          : goals.longTerm,
      beliefs:
        stored.motivations.beliefs.length > 0
          ? stored.motivations.beliefs
          : beliefs,
    },
    state: {
      ...stored.state,
      activityState: row.inactiveTicks > 0 ? "inactive" : stored.state.activityState,
    },
    provenance: {
      ...stored.provenance,
      sourceKind: opts.sourceKind ?? stored.provenance.sourceKind,
      legacyTags: dedupeStrings([
        ...stored.provenance.legacyTags,
        ...safeParseStringArray(row.derivedTags ?? "[]"),
      ]),
    },
  };
}

export function toLegacyPlayerCharacter(record: CharacterRecord): PlayerCharacter {
  return {
    name: record.identity.displayName,
    race: record.profile.species,
    gender: record.profile.gender,
    age: record.profile.ageText,
    appearance: record.profile.appearance,
    tags: deriveRuntimeCharacterTags(record),
    hp: record.state.hp,
    equippedItems: record.loadout.equippedItemRefs,
    locationName: record.socialContext.currentLocationName ?? "",
  };
}

export interface PlayerRecordProjection {
  name: string;
  race: string;
  gender: string;
  age: string;
  appearance: string;
  hp: number;
  tags: string;
  equippedItems: string;
  currentLocationId: string | null;
  characterRecord: string;
  derivedTags: string;
}

export function projectPlayerRecord(record: CharacterRecord): PlayerRecordProjection {
  const legacy = toLegacyPlayerCharacter(record);
  const derivedTags = deriveRuntimeCharacterTags(record);

  return {
    name: legacy.name,
    race: legacy.race,
    gender: legacy.gender,
    age: legacy.age,
    appearance: legacy.appearance,
    hp: legacy.hp,
    tags: JSON.stringify(legacy.tags),
    equippedItems: JSON.stringify(legacy.equippedItems),
    currentLocationId: record.socialContext.currentLocationId,
    characterRecord: JSON.stringify(record),
    derivedTags: JSON.stringify(derivedTags),
  };
}

export function toLegacyNpcDraft(record: CharacterRecord): ScaffoldNpc {
  const tier = mapRecordTierToScaffoldTier(record.identity.tier);

  return {
    name: record.identity.displayName,
    persona: record.profile.personaSummary,
    tags: deriveRuntimeCharacterTags(record),
    goals: {
      shortTerm: [...record.motivations.shortTermGoals],
      longTerm: [...record.motivations.longTermGoals],
    },
    locationName: record.socialContext.currentLocationName ?? "",
    factionName: record.socialContext.factionName,
    tier,
  };
}

export interface NpcRecordProjection {
  name: string;
  persona: string;
  tags: string;
  tier: "temporary" | "persistent" | "key";
  currentLocationId: string | null;
  goals: string;
  beliefs: string;
  characterRecord: string;
  derivedTags: string;
}

export function projectNpcRecord(record: CharacterRecord): NpcRecordProjection {
  const legacy = toLegacyNpcDraft(record);
  const derivedTags = deriveRuntimeCharacterTags(record);

  return {
    name: legacy.name,
    persona: legacy.persona,
    tags: JSON.stringify(legacy.tags),
    tier: record.identity.tier === "key"
      ? "key"
      : record.identity.tier === "temporary"
        ? "temporary"
        : "persistent",
    currentLocationId: record.socialContext.currentLocationId,
    goals: JSON.stringify({
      short_term: legacy.goals.shortTerm,
      long_term: legacy.goals.longTerm,
    }),
    beliefs: JSON.stringify(record.motivations.beliefs),
    characterRecord: JSON.stringify(record),
    derivedTags: JSON.stringify(derivedTags),
  };
}

function mapRecordTierToScaffoldTier(
  tier: CharacterTier,
): ScaffoldNpc["tier"] {
  return tier === "key" ? "key" : "supporting";
}

function parseStoredCharacterRecord(raw: string | null | undefined): CharacterRecord | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CharacterRecord;
    if (
      !parsed
      || typeof parsed !== "object"
      || !parsed.identity
      || typeof parsed.identity !== "object"
      || !parsed.profile
      || typeof parsed.profile !== "object"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function safeParseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function safeParseGoals(raw: string): {
  shortTerm: string[];
  longTerm: string[];
} {
  try {
    const parsed = JSON.parse(raw) as
      | { shortTerm?: unknown; longTerm?: unknown }
      | { short_term?: unknown; long_term?: unknown };

    const shortTerm =
      "shortTerm" in parsed
        ? parsed.shortTerm
        : "short_term" in parsed
          ? parsed.short_term
          : [];
    const longTerm =
      "longTerm" in parsed
        ? parsed.longTerm
        : "long_term" in parsed
          ? parsed.long_term
          : [];

    return {
      shortTerm: normalizeStringList(shortTerm),
      longTerm: normalizeStringList(longTerm),
    };
  } catch {
    return { shortTerm: [], longTerm: [] };
  }
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

export function classifyLegacyTags(tags: string[]): ParsedLegacyTags {
  const traits: string[] = [];
  const skills: CharacterSkill[] = [];
  const flaws: string[] = [];
  const conditions: string[] = [];
  let wealthTier: CharacterWealthTier | null = null;

  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag) continue;

    if (isWealthTier(tag)) {
      wealthTier = tag;
      continue;
    }

    const skill = parseSkillTag(tag);
    if (skill) {
      skills.push(skill);
      continue;
    }

    const lower = tag.toLowerCase();
    if (CONDITION_TAGS.has(lower)) {
      conditions.push(tag);
      continue;
    }

    if (FLAW_TAGS.has(lower)) {
      flaws.push(tag);
      continue;
    }

    traits.push(tag);
  }

  return {
    traits,
    skills,
    flaws,
    conditions,
    wealthTier,
    legacyTags: tags,
  };
}

function isWealthTier(tag: string): tag is CharacterWealthTier {
  return (CHARACTER_WEALTH_TIERS as readonly string[]).includes(tag);
}

function parseSkillTag(tag: string): CharacterSkill | null {
  for (const tier of CHARACTER_SKILL_TIERS) {
    const prefix = `${tier} `;
    if (tag.startsWith(prefix)) {
      return {
        name: tag.slice(prefix.length).trim(),
        tier,
      };
    }
  }

  return null;
}
