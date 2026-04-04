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

export const EXPLICIT_USER_FACTS_RULE =
  "Preserve explicit user-provided facts as source-of-truth. Copy authored names, ages, species, appearance, biography facts, startConditions, and persona-template choices verbatim when the user already supplied them.";

export const DERIVED_RUNTIME_TAGS_RULE =
  "Derived runtime tags are a compact compatibility view generated from the canonical fields. They support runtime shorthand, but they never replace the source-of-truth character semantics.";

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
    options.roleEmphasis ? `Role emphasis: ${options.roleEmphasis}` : null,
    options.includeExplicitUserFacts === false ? null : EXPLICIT_USER_FACTS_RULE,
    options.includeStartConditions === false ? null : START_CONDITIONS_CONTRACT,
    options.includePersonaTemplates === false ? null : PERSONA_TEMPLATE_PATCH_RULE,
    options.includeCanonicalLoadout === false ? null : CANONICAL_LOADOUT_RULE,
    options.includeDerivedTagsRule === false ? null : DERIVED_RUNTIME_TAGS_RULE,
  ].filter((value): value is string => Boolean(value));

  return blocks.join("\n");
}

export const SHARED_CHARACTER_PROMPT_CONTRACT = buildCharacterPromptContract();
