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

function mapRecordTierToScaffoldTier(
  tier: CharacterTier,
): ScaffoldNpc["tier"] {
  return tier === "key" ? "key" : "supporting";
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

function classifyLegacyTags(tags: string[]): ParsedLegacyTags {
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
