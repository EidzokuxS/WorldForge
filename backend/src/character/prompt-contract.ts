import {
  AP_DURABILITY_TIERS,
  INTELLIGENCE_TIERS,
  SPEED_TIERS,
} from "@worldforge/shared";

export const CANONICAL_CHARACTER_FIELD_GROUPS = [
  "identity",
  "profile",
  "socialContext",
  "motivations",
  "capabilities",
  "state",
  "loadout",
  "startConditions",
  "provenance",
] as const;

export const CHARACTER_ONTOLOGY_CONTRACT =
  "Treat every player and NPC as one shared CharacterDraft/CharacterRecord model with field groups in this order: identity, profile, socialContext, motivations, capabilities, state, loadout, startConditions, provenance.";

export const RICHER_IDENTITY_TRUTH_RULE =
  "Inside identity, the stored truth is richer than the LLM output: baseFacts + personality define who the character is, while liveDynamics records earned campaign change without overwriting deeper identity.";

export const EXPLICIT_USER_FACTS_RULE =
  "Preserve explicit user-provided facts as source-of-truth. Copy authored names, ages, species, appearance, biography facts, startConditions, and persona-template choices verbatim when the user already supplied them. Do not let synthesis, tags, or secondary source cues overwrite those authored facts.";

export const SHARED_DRAFT_PIPELINE_RULE =
  "All player, NPC, archetype, and import flows go through one shared draft pipeline. The model returns a flatter/safe generator payload first, then WorldForge deterministically maps that payload into the richer shared draft record.";

export const FLAT_OUTPUT_ADAPTER_RULE =
  "Keep the model output flatter than the final ontology. Do NOT emit nested baseFacts, behavioralCore, liveDynamics, personality, sourceBundle, or continuity objects directly. Return flat authored facts, behavior cues, pressures, goals, tags, and loadout seeds that WorldForge lifts into the richer structure.";

export const DETERMINISTIC_MAPPING_RULE =
  "Deterministic mapping rules: biography and authored background facts feed baseFacts; interiority cues (summary, voice, decisionStyle, worldview, contradictions, mythology, quotes) feed personality; self-image and hard-constraints remain on behavioralCore/baseFacts; current goals, strain, and belief drift feed liveDynamics. personaSummary, tags, and legacy goals remain compatibility projections from that richer truth.";

export const SOURCE_BUNDLE_RULE =
  "Imported and canonical material uses sourceBundle semantics inside the shared model: canon-facing facts stay primary, secondary community-card cues stay separate, and WorldForge owns the final structured synthesis.";

export const DERIVED_RUNTIME_TAGS_RULE =
  "Derived runtime tags, personaSummary, and shallow goals are compact compatibility views generated from the richer canonical fields. They support runtime shorthand, but they never replace the source-of-truth character semantics.";

export function buildCharacterOutputShapeContract(marker = "character.v1"): string {
  return [
    `STRUCTURED_OUTPUT_CONTRACT: ${marker}`,
    "Return only the flat generator fields from the schema: name, race, gender, age, appearance, backgroundSummary, personaSummary, personalitySummary, personalityVoice, personalityDecisionStyle, personalityWorldview, personalityContradictions, personalityMythology, personalitySampleLines, drives, frictions, shortTermGoals, longTermGoals, tags, hp, equippedItems, locationName.",
    "Model-facing string caps: name <= 120 chars; race/gender/age/locationName <= 80 chars; appearance/backgroundSummary/personaSummary/personalitySummary <= 600 chars; personality voice/worldview/decisionStyle/mythology <= 500 chars.",
    "List caps: tags, drives, frictions, shortTermGoals, longTermGoals, equippedItems, personalityContradictions, and personalitySampleLines arrays max 6 unless a narrower caller schema says otherwise.",
    "optional fields may be empty strings or empty arrays when source material does not establish them. Do not invent rigid player motivations, backstory, location, equipment, or personality facts to fill optional fields.",
    "Minimal valid output example: { \"name\": \"Kael\", \"race\": \"Human\", \"gender\": \"unknown\", \"age\": \"adult\", \"appearance\": \"Travel-worn scout in a patched cloak.\", \"backgroundSummary\": \"\", \"personaSummary\": \"Alert, cautious, and direct.\", \"personalitySampleLines\": [], \"drives\": [], \"frictions\": [], \"shortTermGoals\": [], \"longTermGoals\": [], \"tags\": [], \"hp\": 5, \"equippedItems\": [], \"locationName\": \"\" }.",
    "Invalid example: { \"identity\": { \"baseFacts\": {} }, \"liveDynamics\": {}, \"powerStats\": \"strong\" }. Do NOT emit nested baseFacts, behavioralCore, liveDynamics, personality, sourceBundle, continuity, or powerStats here.",
  ].join("\n");
}

export const CHARACTER_OUTPUT_SHAPE_CONTRACT = buildCharacterOutputShapeContract();

const AP_DUR_TIER_LIST = AP_DURABILITY_TIERS.join(", ");
const SPEED_TIER_LIST = SPEED_TIERS.join(", ");
const INTELLIGENCE_TIER_LIST = INTELLIGENCE_TIERS.join(", ");

interface BuildPowerStatsPromptContractOptions {
  marker?: string;
  evidenceLabel?: string;
}

export function buildPowerStatsPromptContract(
  options: BuildPowerStatsPromptContractOptions = {},
): string {
  const marker = options.marker ?? "power-stats.v1";
  const evidenceLabel = options.evidenceLabel ?? "raw payload and search results";

  return [
    `STRUCTURED_OUTPUT_CONTRACT: ${marker}`,
    "Return one PowerStats object with exactly these top-level fields:",
    "  attackPotency: { tier: string, rank: 1-10 }",
    "  speed: { tier: string, rank: 1-10 }",
    "  durability: { tier: string, rank: 1-10 }",
    "  intelligence: { tier: string, rank: 1-10 }",
    "  hax: [{ name, type, bypassTier, limitations }]",
    "  vulnerabilities: [{ description, severity }]",
    "bypassTier may be null. hax and vulnerabilities may be empty arrays when evidence does not establish abilities or weaknesses.",
    "Allowed vulnerability severity values: minor, major, critical.",
    "Attack Potency / Durability tiers: " + AP_DUR_TIER_LIST,
    "Speed tiers: " + SPEED_TIER_LIST,
    "Intelligence tiers: " + INTELLIGENCE_TIER_LIST,
    "Rank within tier: Low = 1-3, Mid = 4-7, High = 8-10.",
    "Minimal valid output example: { \"attackPotency\": { \"tier\": \"Street\", \"rank\": 5 }, \"speed\": { \"tier\": \"Athletic Human\", \"rank\": 5 }, \"durability\": { \"tier\": \"Street\", \"rank\": 5 }, \"intelligence\": { \"tier\": \"Average\", \"rank\": 5 }, \"hax\": [], \"vulnerabilities\": [] }.",
    "Invalid example: { \"attackPotency\": \"godlike\", \"speed\": \"fast\", \"durability\": {}, \"intelligence\": \"unknown\", \"hax\": \"many\" }.",
    "Do not return vague labels like \"strong\", \"godlike\", or \"unknown\". Do not omit any of the four axes.",
    `Use only facts from the ${evidenceLabel}. Do not invent feats, tiers, source roles, or canonical facts to satisfy the schema.`,
  ].join("\n");
}

export const START_CONDITIONS_CONTRACT =
  "startConditions is the authoritative opening-state object. Capture arrivalMode, immediateSituation, entryPressure, companions, startingVisibility, resolvedNarrative, and any saved location reference before adding compatibility aliases.";

export const PERSONA_TEMPLATE_PATCH_RULE =
  "A persona template applies a CharacterDraftPatch through the shared draft pipeline. It can refine profile, socialContext, motivations, capabilities, state, loadout, startConditions, and provenance without creating separate role-forked schemas.";

export const CANONICAL_LOADOUT_RULE =
  "Use canonical loadout guidance in CharacterLoadout and CanonicalLoadoutPreview terms: preserve loadout intent, derive canonical items, and surface audit plus warnings instead of ad hoc inventory prose.";

interface BuildCharacterPromptContractOptions {
  marker?: string;
  roleEmphasis?: string | null;
  includeExplicitUserFacts?: boolean;
  includeStartConditions?: boolean;
  includePersonaTemplates?: boolean;
  includeCanonicalLoadout?: boolean;
  includeDerivedTagsRule?: boolean;
}

export function buildCharacterPromptContract(
  options: BuildCharacterPromptContractOptions = {},
): string {
  const blocks = [
    buildCharacterOutputShapeContract(options.marker),
    CHARACTER_ONTOLOGY_CONTRACT,
    RICHER_IDENTITY_TRUTH_RULE,
    options.roleEmphasis ? `Role emphasis: ${options.roleEmphasis}` : null,
    options.includeExplicitUserFacts === false ? null : EXPLICIT_USER_FACTS_RULE,
    SHARED_DRAFT_PIPELINE_RULE,
    FLAT_OUTPUT_ADAPTER_RULE,
    DETERMINISTIC_MAPPING_RULE,
    SOURCE_BUNDLE_RULE,
    options.includeStartConditions === false ? null : START_CONDITIONS_CONTRACT,
    options.includePersonaTemplates === false ? null : PERSONA_TEMPLATE_PATCH_RULE,
    options.includeCanonicalLoadout === false ? null : CANONICAL_LOADOUT_RULE,
    options.includeDerivedTagsRule === false ? null : DERIVED_RUNTIME_TAGS_RULE,
  ].filter((value): value is string => Boolean(value));

  return blocks.join("\n");
}

export const SHARED_CHARACTER_PROMPT_CONTRACT = buildCharacterPromptContract();
