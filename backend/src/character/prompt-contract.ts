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
  "Inside identity, the stored truth is richer than the LLM output: baseFacts + behavioralCore define who the character is, while liveDynamics records earned campaign change without overwriting deeper identity.";

export const EXPLICIT_USER_FACTS_RULE =
  "Preserve explicit user-provided facts as source-of-truth. Copy authored names, ages, species, appearance, biography facts, startConditions, and persona-template choices verbatim when the user already supplied them. Do not let synthesis, tags, or secondary source cues overwrite those authored facts.";

export const SHARED_DRAFT_PIPELINE_RULE =
  "All player, NPC, archetype, and import flows go through one shared draft pipeline. The model returns a flatter/safe generator payload first, then WorldForge deterministically maps that payload into the richer shared draft record.";

export const FLAT_OUTPUT_ADAPTER_RULE =
  "Keep the model output flatter than the final ontology. Do NOT emit nested baseFacts, behavioralCore, liveDynamics, sourceBundle, or continuity objects directly. Return flat authored facts, behavior cues, pressures, goals, tags, and loadout seeds that WorldForge lifts into the richer structure.";

export const DETERMINISTIC_MAPPING_RULE =
  "Deterministic mapping rules: biography and authored background facts feed baseFacts; enduring motives, self-image, attachments, and pressure cues feed behavioralCore; current goals, strain, and belief drift feed liveDynamics. personaSummary, tags, and legacy goals remain compatibility projections from that richer truth.";

export const SOURCE_BUNDLE_RULE =
  "Imported and canonical material uses sourceBundle semantics inside the shared model: canon-facing facts stay primary, secondary community-card cues stay separate, and WorldForge owns the final structured synthesis.";

export const DERIVED_RUNTIME_TAGS_RULE =
  "Derived runtime tags, personaSummary, and shallow goals are compact compatibility views generated from the richer canonical fields. They support runtime shorthand, but they never replace the source-of-truth character semantics.";

export const START_CONDITIONS_CONTRACT =
  "startConditions is the authoritative opening-state object. Capture arrivalMode, immediateSituation, entryPressure, companions, startingVisibility, resolvedNarrative, and any saved location reference before adding compatibility aliases.";

export const PERSONA_TEMPLATE_PATCH_RULE =
  "A persona template applies a CharacterDraftPatch through the shared draft pipeline. It can refine profile, socialContext, motivations, capabilities, state, loadout, startConditions, and provenance without creating separate role-forked schemas.";

export const CANONICAL_LOADOUT_RULE =
  "Use canonical loadout guidance in CharacterLoadout and CanonicalLoadoutPreview terms: preserve loadout intent, derive canonical items, and surface audit plus warnings instead of ad hoc inventory prose.";

interface BuildCharacterPromptContractOptions {
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
