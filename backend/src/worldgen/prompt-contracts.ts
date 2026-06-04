import {
  GENERATED_CONTEXT_MODEL_SHAPE,
  WORLDGEN_RESEARCH_ARTIFACT_CONTRACT_MARKER,
} from "./research-artifact.js";

const SOURCE_RULE_AUTHORITY_LINES = [
  "Source authority: source roles come only from the artifact/source rules.",
  "Source authority: backend may trim strings, cap arrays, or drop invalid optional fields.",
  "Source authority: backend must not invent source roles.",
  "Source authority: backend must not infer premise canon.",
  "Source authority: backend must not invent canonical truth.",
  "If required source meaning is missing, preserve ambiguity or fail validation rather than filling it in with backend guesses.",
];

export function buildWorldgenSourceRuleAuthorityContract(): string {
  return SOURCE_RULE_AUTHORITY_LINES.join("\n");
}

function formatAllowedValues(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

export function buildSeedSuggestionPromptContract(): string {
  return [
    "STRUCTURED_OUTPUT_CONTRACT: seed-suggestion.v1",
    "Return exactly one seed suggestion object.",
    "Required fields for sequential DNA calls: value and reasoning.",
    "Required fields for single-seed calls: value.",
    "Shape for geography, politicalStructure, centralConflict, environment, and wildcard: { \"value\": \"1-2 concrete sentences\", \"reasoning\": \"one short reason\" }.",
    "Shape for culturalFlavor: { \"value\": [\"specific inspiration\", \"specific inspiration\"], \"reasoning\": \"one short reason\" }.",
    "Caps: value string max 260 chars; reasoning max 220 chars; culturalFlavor value array min 2, max 3; each culturalFlavor item max 80 chars.",
    "Nullable/optional rules (nullable/optional): do not emit null for value; reasoning is required only when the schema requests it; do not return a string when value must be an array.",
    "Minimal valid output: { \"value\": \"A rain-lashed volcanic coast.\", \"reasoning\": \"It follows the premise's island hazard.\" }",
    "Valid example: { \"value\": [\"Heian court intrigue\", \"urban occult horror\"], \"reasoning\": \"The premise mixes formal ritual and modern supernatural pressure.\" }",
    "Invalid example: { \"value\": \"Heian court intrigue, urban occult horror\", \"reasoning\": \"array collapsed into one string\" }",
    "No stale legacy source authority: when a research artifact is present, follow artifact source usage rules and ignore legacy ipContext premise canon.",
    buildWorldgenSourceRuleAuthorityContract(),
  ].join("\n");
}

export function buildLoreExtractionPromptContract(input: {
  allowedCategories: readonly string[];
  minCards: number;
  maxCards: number;
}): string {
  return [
    "STRUCTURED_OUTPUT_CONTRACT: lore-extraction.v1",
    "Return exactly one object with a loreCards array.",
    "Required fields: loreCards[].term, loreCards[].definition, loreCards[].category.",
    `Allowed category values for this call: ${formatAllowedValues(input.allowedCategories)}.`,
    "loreCards item shape: { \"term\": \"Ironhaven\", \"definition\": \"A fortified city controlling the pass.\", \"category\": \"location\" }.",
    `Caps: loreCards min ${input.minCards}, max ${input.maxCards}; term 1-5 words and max 80 chars; definition 1-2 factual sentences and max 320 chars.`,
    "Nullable/optional rules (nullable/optional): do not emit null loreCards, null terms, or null definitions; use an empty array only when a reduced/best-effort schema explicitly permits it.",
    "Minimal valid output: { \"loreCards\": [{ \"term\": \"Ironhaven\", \"definition\": \"A fortified city controlling the pass.\", \"category\": \"location\" }] }",
    "Valid example: { \"loreCards\": [{ \"term\": \"Signal Base\", \"definition\": \"A remote station that monitors anomalous transmissions.\", \"category\": \"location\" }] }",
    "Invalid example: { \"loreCards\": [\"Signal Base: remote station\"] }",
    "Invalid example: { \"loreCards\": { \"term\": \"Signal Base\", \"definition\": \"remote station\", \"category\": \"location\" } }",
    "Source authority: write lore only from the scaffold, explicit premise, and artifact/source rules; backend must not invent lore, source roles, or canonical truth to satisfy the schema.",
    buildWorldgenSourceRuleAuthorityContract(),
  ].join("\n");
}

export function buildStartingLocationPromptContract(): string {
  return [
    "STRUCTURED_OUTPUT_CONTRACT: starting-location.v1",
    "Return exactly one object resolving the player start against KNOWN LOCATIONS.",
    "Required fields: locationName, arrivalMode, immediateSituation, entryPressure, companions, startingVisibility, resolvedNarrative.",
    "Shape: { \"locationName\": \"Ironhaven\", \"arrivalMode\": \"on-foot\", \"immediateSituation\": \"The gate watch is questioning arrivals.\", \"entryPressure\": [\"cold rain\"], \"companions\": [], \"startingVisibility\": \"noticed\", \"resolvedNarrative\": \"The character reaches Ironhaven under cold rain.\" }.",
    "Caps: locationName must match one known location name; arrivalMode max 60 chars; immediateSituation max 220; entryPressure max 4; companions max 4; startingVisibility max 120; resolvedNarrative max 300.",
    "Nullable/optional rules (nullable/optional): do not emit null fields; entryPressure and companions may be empty arrays; if the request cannot be matched exactly, choose the closest known location and explain uncertainty in immediateSituation.",
    "Minimal valid output: { \"locationName\": \"Ironhaven\", \"arrivalMode\": \"settled\", \"immediateSituation\": \"The character begins inside Ironhaven.\", \"entryPressure\": [], \"companions\": [], \"startingVisibility\": \"expected\", \"resolvedNarrative\": \"The character begins inside Ironhaven.\" }",
    "Valid example: { \"locationName\": \"Mistharbor\", \"arrivalMode\": \"by boat\", \"immediateSituation\": \"Dockworkers are unloading cargo as fog rolls in.\", \"entryPressure\": [\"fog\"], \"companions\": [\"a nervous guide\"], \"startingVisibility\": \"mostly unnoticed\", \"resolvedNarrative\": \"The character arrives by boat at Mistharbor under heavy fog.\" }",
    "Invalid example: { \"locationName\": \"Invented Moon Citadel\", \"resolvedNarrative\": \"Start somewhere dramatic.\" }",
    "no invented location: locationName must come from KNOWN LOCATIONS; backend fallback may select an existing location but must not create one.",
    "Source authority: source rules and known locations are data; backend must not invent canonical truth or missing world facts.",
  ].join("\n");
}

export function buildPremiseDivergencePromptContract(): string {
  return [
    "STRUCTURED_OUTPUT_CONTRACT: premise-divergence.v1",
    "Return exactly one object describing LLM-authored premise interpretation.",
    "Required fields: mode, protagonistRole, preservedCanonFacts, changedCanonFacts, currentStateDirectives, ambiguityNotes.",
    "mode enum: canonical, coexisting, diverged.",
    "protagonistRole shape: { \"kind\": \"canonical|custom\", \"interpretation\": \"canonical|replacement|coexisting|outsider|unknown\", \"canonicalCharacterName\": \"name or null\", \"roleSummary\": \"short sentence\" }.",
    "Caps: preservedCanonFacts max 4; changedCanonFacts max 4; currentStateDirectives max 4; ambiguityNotes max 5; each fact/directive max 180 chars; roleSummary max 240 chars.",
    "Nullable/optional rules (nullable/optional): protagonistRole.canonicalCharacterName may be null only when no exact canonical character is identified; arrays may be empty when no fact is changed or preserved.",
    "Minimal valid output: { \"mode\": \"canonical\", \"protagonistRole\": { \"kind\": \"canonical\", \"interpretation\": \"canonical\", \"canonicalCharacterName\": null, \"roleSummary\": \"The canon protagonist role is unchanged.\" }, \"preservedCanonFacts\": [], \"changedCanonFacts\": [], \"currentStateDirectives\": [\"Keep the canon cast intact.\"], \"ambiguityNotes\": [] }",
    "Valid example: { \"mode\": \"diverged\", \"protagonistRole\": { \"kind\": \"custom\", \"interpretation\": \"replacement\", \"canonicalCharacterName\": \"Dr. Kel\", \"roleSummary\": \"The custom player replaces Dr. Kel as active station operator.\" }, \"preservedCanonFacts\": [\"The signal base remains active.\"], \"changedCanonFacts\": [\"Dr. Kel is not the active operator.\"], \"currentStateDirectives\": [\"Treat the player as the newly arrived operator.\"], \"ambiguityNotes\": [] }",
    "Invalid example: { \"mode\": \"diverged\", \"protagonistRole\": \"player replaces canon\", \"preservedCanonFacts\": \"everything else is canon\" }",
    "If uncertain, record ambiguityNotes instead of fabricating certainty.",
    "Source authority: backend must not infer premise canon; backend must not invent source roles or canonical truth.",
  ].join("\n");
}

export function buildPremiseRefinementPromptContract(): string {
  return [
    "STRUCTURED_OUTPUT_CONTRACT: premise-refinement.v1",
    "Return exactly one object for the structured path: { \"refinedPremise\": \"2-3 factual present-state sentences\" }.",
    "Required fields: refinedPremise.",
    "Caps: refinedPremise max 900 chars; exactly 2-3 sentences; preserve user-stated relationships verbatim when present.",
    "Nullable/optional rules (nullable/optional): refinedPremise must be a non-empty string and must not be null; no arrays or nested objects are valid for the structured path.",
    "Minimal valid output: { \"refinedPremise\": \"Ironhaven stands under siege while river guilds ration food. The player enters a city where faction loyalties are visible in every checkpoint.\" }",
    "Valid example: { \"refinedPremise\": \"Tokyo Jujutsu High anchors a modern occult world while chakra-style control changes how sorcerers train and fight. The player arrives into that current state without rewriting unrelated canon institutions.\" }",
    "Invalid example: { \"premise\": \"cool anime world\", \"canonFranchise\": \"Naruto\" }",
    "The text-only compatibility fallback is not structured success; it may preserve plain text after schema failure, but backend must not infer premise canon from that fallback.",
    "Source authority: backend must not infer premise canon; backend must not invent canonical truth, source roles, or missing world facts.",
  ].join("\n");
}

export function buildScaffoldValidationPromptContract(): string {
  return [
    "STRUCTURED_OUTPUT_CONTRACT: scaffold-validation.v1",
    "Return exactly one validation/fix issue object.",
    "Required fields: issues and summary.",
    "issues item shape: { \"entityName\": \"Ironhaven\", \"issueType\": \"broken_reference\", \"description\": \"Connected location is missing.\", \"severity\": \"critical\", \"suggestedFix\": \"Use an existing connected location or remove the link.\" }.",
    "issueType enum: duplicate_name, semantic_overlap, broken_reference, inconsistent_tags, narrative_collision, vague_description, canon_violation, missing_connection.",
    "severity enum: critical, warning.",
    "Caps: issues max 12; entityName max 120 chars; description max 320; suggestedFix max 320; summary max 220.",
    "Nullable/optional rules (nullable/optional): do not emit null issues; use issues: [] with summary: \"clean\" when no critical issues exist.",
    "Minimal valid output: { \"issues\": [], \"summary\": \"clean\" }",
    "Valid example: { \"issues\": [{ \"entityName\": \"Ironhaven\", \"issueType\": \"broken_reference\", \"description\": \"Faction territory references a missing location.\", \"severity\": \"critical\", \"suggestedFix\": \"Point the faction to an existing location or remove that territory.\" }], \"summary\": \"One critical broken reference.\" }",
    "Invalid example: { \"issues\": [\"Ironhaven is vague\"], \"summary\": \"fix it by inventing a new faction\" }",
    "fail closed: if required semantics are absent, report the missing issue or leave the entity unchanged; backend must not invent locations, factions, NPC facts, source roles, or canon truth to satisfy validation.",
    buildWorldgenSourceRuleAuthorityContract(),
  ].join("\n");
}

export function buildGeneratedContextPromptContract(): string {
  return [
    "STRUCTURED_OUTPUT_CONTRACT: generated-context.v1",
    "Return exactly one generatedContext object with this target shape:",
    GENERATED_CONTEXT_MODEL_SHAPE,
    "Required fields: keyFacts: string[], tonalNotes: string[].",
    "Optional citations item shape: \"citations\": [{ \"jobId\": \"optional job id\", \"url\": \"optional url\", \"note\": \"short citation note\" }]",
    "Optional fields: citations and canonicalNames may be omitted when no grounded data exists.",
    "Caps: keyFacts max 80, each keyFact max 450 chars; tonalNotes max 30, each tonal note max 350 chars; citations max 24, note max 300 chars; canonicalNames locations/factions/characters max 40 each, each name max 120 chars.",
    "Nullability: canonicalNames is optional; do not emit canonicalNames as null or as one combined string.",
    "Minimal valid output: { \"keyFacts\": [], \"tonalNotes\": [] }",
    "Valid example:",
    "{ \"keyFacts\": [\"Tokyo Jujutsu High coordinates sorcerer missions in modern Japan.\"], \"tonalNotes\": [\"urban occult action\"], \"citations\": [{ \"jobId\": \"jjk-world-structure\", \"url\": \"https://example.test/jjk\", \"note\": \"School institution context.\" }], \"canonicalNames\": { \"locations\": [\"Tokyo Jujutsu High\"], \"factions\": [\"Jujutsu High\"], \"characters\": [\"Satoru Gojo\"] } }",
    "Invalid examples:",
    "{ \"citations\": \"jjk-world-structure: Tokyo Jujutsu High\" }",
    "{ \"canonicalNames\": \"Satoru Gojo, Tokyo Jujutsu High\" }",
    buildWorldgenSourceRuleAuthorityContract(),
  ].join("\n");
}

export function buildResearchArtifactPromptContract(): string {
  return [
    WORLDGEN_RESEARCH_ARTIFACT_CONTRACT_MARKER,
    "STRUCTURED_OUTPUT_CONTRACT: research-artifact.v1",
    "Return the v2 worldgen research artifact brief fields before any generatedContext pass.",
    "Required researchBrief fields: interpretationSummary, ambiguityNotes[], sourceUsageRules[], searchJobs[].",
    "sourceUsageRules item shape:",
    "{ \"sourceLabel\": \"Jujutsu Kaisen\", \"role\": \"world_basis\", \"useFor\": [\"locations\", \"factions\", \"npcs\", \"timeline\"], \"avoidFor\": [\"power_system\"], \"rationale\": \"The premise assigns JJK as world structure.\" }",
    "Allowed role values: world_basis, mechanics_overlay, tone_overlay, reference_only, ambiguous.",
    "searchJobs item shape:",
    "{ \"id\": \"jjk-world-structure\", \"sourceLabel\": \"Jujutsu Kaisen\", \"query\": \"Jujutsu Kaisen school institutions locations\", \"purpose\": \"Ground world-basis institutions.\", \"useFor\": [\"locations\", \"factions\"] }",
    "Caps: sourceUsageRules max 8; searchJobs max 12; useFor/avoidFor max 10 each; interpretationSummary max 1200 chars; ambiguityNotes max 8.",
    "Minimal valid output: { \"researchBrief\": { \"interpretationSummary\": \"Original/no external research needed.\", \"ambiguityNotes\": [], \"sourceUsageRules\": [], \"searchJobs\": [] } }",
    "Invalid examples: one canonical franchise chosen for a mixed premise; sourceUsageRules as a string; searchJobs as a blended cross-source query.",
    buildWorldgenSourceRuleAuthorityContract(),
  ].join("\n");
}

export function buildArtifactSufficiencyPromptContract(): string {
  return [
    "STRUCTURED_OUTPUT_CONTRACT: artifact-sufficiency.v1",
    "Return exactly one object: { \"sufficient\": boolean, \"searchJobs\": [] }.",
    "When sufficient is false, searchJobs item shape:",
    "{ \"id\": \"jjk-extra-locations\", \"sourceLabel\": \"Jujutsu Kaisen\", \"query\": \"Jujutsu Kaisen additional school locations\", \"purpose\": \"Ground extra location details for this step.\", \"useFor\": [\"locations\"] }",
    "Caps: searchJobs max 3; id max 64 chars; sourceLabel max 120; query max 240; purpose max 500; useFor max 10.",
    "Valid non-sufficient output: { \"sufficient\": false, \"searchJobs\": [{ \"id\": \"jjk-extra-locations\", \"sourceLabel\": \"Jujutsu Kaisen\", \"query\": \"Jujutsu Kaisen additional school locations\", \"purpose\": \"Ground extra location details for this step.\", \"useFor\": [\"locations\"] }] }",
    "Minimal valid output: { \"sufficient\": true, \"searchJobs\": [] }",
    "Do not create a search job for avoidFor categories on that source. Do not collapse multiple sources into one subject.",
    buildWorldgenSourceRuleAuthorityContract(),
  ].join("\n");
}

export function buildArtifactFactExtractionPromptContract(): string {
  return [
    "STRUCTURED_OUTPUT_CONTRACT: artifact-fact-extraction.v1",
    "Return exactly one object with source-grounded step facts:",
    "{ \"facts\": [\"source-grounded fact\"], \"tonalNotes\": [\"optional tonal note\"] }",
    "Required field: facts: string[]. Optional field: tonalNotes: string[].",
    "Caps: facts max 5, each fact max 450 chars; tonalNotes max 3, each note max 350 chars.",
    "Minimal valid output: { \"facts\": [] }",
    "Invalid examples: facts as one string; tonalNotes as one string; facts that assign canon/source roles not present in the artifact rules.",
    buildWorldgenSourceRuleAuthorityContract(),
  ].join("\n");
}
