import type { IpResearchContext, PremiseDivergence } from "@worldforge/shared";
import type { WorldSeeds } from "../seed-roller.js";
import type { GenerationProgress } from "../types.js";

// ---------------------------------------------------------------------------
// Seed label mapping (re-exported for use in other steps)
// ---------------------------------------------------------------------------

export const SEED_LABELS: ReadonlyArray<{ field: keyof WorldSeeds; label: string }> = [
  { field: "geography", label: "Geography" },
  { field: "politicalStructure", label: "Political Structure" },
  { field: "centralConflict", label: "Central Conflict" },
  { field: "culturalFlavor", label: "Cultural Flavor" },
  { field: "environment", label: "Environment" },
  { field: "wildcard", label: "Wildcard" },
];

// ---------------------------------------------------------------------------
// buildIpContextBlock — canonical IP fidelity instructions
// ---------------------------------------------------------------------------

export function buildIpContextBlock(ipContext: IpResearchContext | null): string {
  if (!ipContext) return "";

  const facts = ipContext.keyFacts.map((f) => `  - ${f}`).join("\n");
  const tone = ipContext.tonalNotes.map((t) => `  - ${t}`).join("\n");

  const cn = ipContext.canonicalNames;
  const nameBlock = cn
    ? `
CANONICAL NAMES — use these EXACT names, never invent substitutes:
${cn.locations?.length ? `  Locations: ${cn.locations.join(", ")}` : ""}
${cn.factions?.length ? `  Factions: ${cn.factions.join(", ")}` : ""}
${cn.characters?.length ? `  Characters: ${cn.characters.join(", ")}` : ""}
`.trim()
    : "";

  return `
FRANCHISE REFERENCE (${ipContext.franchise}, verified via ${ipContext.source}):
${nameBlock ? `${nameBlock}\n` : ""}
Key facts — treat as ground truth:
${facts}
Tone:
${tone}

CANONICAL FIDELITY RULES (MANDATORY — violations will be rejected):
1. You are building the CANONICAL world with targeted modifications. Every location, faction, organization, and character MUST be from the franchise canon unless the premise's divergence logically creates something new.
2. DO NOT INVENT original locations, factions, or characters when canonical ones exist. If the franchise has 5 major cities, use those 5 cities. Do not replace them with original creations.
3. Use the franchise's own names exactly as they appear in the source material. Never substitute, translate, simplify, or create "inspired by" variants.
4. Treat this FRANCHISE REFERENCE as the canonical baseline. Apply only the divergence consequences stated elsewhere in the prompt. Everything not explicitly changed stays canon.
5. When the premise reassigns a character's allegiance, teacher, or role: update ONLY relationships that logically change. Keep all other canonical details (abilities, backstory, personality, appearance) intact.
6. If a detail is absent from the reference data above, rely on your knowledge of the franchise. Never fabricate franchise elements that do not exist in canon.
7. Never rename canonical entities to avoid copyright. This is a private RPG tool, not a published work.
8. The ratio of canonical to original content must be AT LEAST 80/20. Original content is acceptable ONLY for minor supporting characters or locations that the premise's divergence logically requires.
`;
}

export function buildPremiseDivergenceBlock(
  premiseDivergence: PremiseDivergence | null | undefined,
): string {
  if (!premiseDivergence) return "";

  const protagonistBlock = `
PROTAGONIST ROLE:
  - Kind: ${premiseDivergence.protagonistRole.kind}
  - Interpretation: ${premiseDivergence.protagonistRole.interpretation}
  - Canonical Character: ${premiseDivergence.protagonistRole.canonicalCharacterName ?? "(none)"}
  - Role Summary: ${premiseDivergence.protagonistRole.roleSummary}
`.trim();

  const preservedBlock = `
PRESERVED CANON FACTS:
${premiseDivergence.preservedCanonFacts.length > 0
    ? premiseDivergence.preservedCanonFacts.map((fact) => `  - ${fact}`).join("\n")
    : "  - (none provided)"}
`.trim();

  const changedBlock = `
CHANGED CANON FACTS:
${premiseDivergence.changedCanonFacts.length > 0
    ? premiseDivergence.changedCanonFacts.map((fact) => `  - ${fact}`).join("\n")
    : "  - (none provided)"}
`.trim();

  const directivesBlock = `
CURRENT WORLD-STATE DIRECTIVES:
${premiseDivergence.currentStateDirectives.length > 0
    ? premiseDivergence.currentStateDirectives.map((directive) => `  - ${directive}`).join("\n")
    : "  - Preserve canon exactly as researched."}
`.trim();

  const ambiguityBlock = premiseDivergence.ambiguityNotes.length > 0
    ? `
AMBIGUITY NOTES:
${premiseDivergence.ambiguityNotes.map((note) => `  - ${note}`).join("\n")}
`.trim()
    : "";

  return `
PREMISE DIVERGENCE (${premiseDivergence.mode.toUpperCase()}):
${protagonistBlock}
${preservedBlock}
${changedBlock}
${directivesBlock}
${ambiguityBlock ? `${ambiguityBlock}\n` : ""}INTERPRETATION RULE:
  - Preserve canon conservatively. If a fact is not explicitly changed above, keep it true in the current world state.
`.trim();
}

export function buildKnownIpGenerationContract(
  ipContext: IpResearchContext | null,
  premiseDivergence: PremiseDivergence | null | undefined,
  generationTarget: string,
): string {
  if (!ipContext) return "";

  const hasDivergence = Boolean(premiseDivergence);
  return `
KNOWN-IP GENERATION CONTRACT FOR ${generationTarget.toUpperCase()}:
  - Start from the FRANCHISE REFERENCE as the canonical baseline for ${ipContext.franchise}.
  - ${hasDivergence
      ? "Apply only the specific changes listed in PREMISE DIVERGENCE."
      : "No premise divergence artifact is present, so stay fully canonical."}
  - Preserve every canonical entity, relationship, institution, and history unless CHANGED CANON FACTS or CURRENT WORLD-STATE DIRECTIVES explicitly alter it.
  - Describe the present world state for ${generationTarget}, not a blind canon recap and not a character-exclusion list.
  - If the divergence changes one role, allegiance, or relationship, keep unrelated canon details intact.
`.trim();
}

/**
 * Build a focused canonical names block for a specific entity type.
 * Placed DIRECTLY inside the step's task instruction, not buried in ipBlock.
 */
export function buildCanonicalList(
  ipContext: IpResearchContext | null,
  type: "locations" | "factions" | "characters",
): string {
  if (!ipContext?.canonicalNames) return "";
  const names = ipContext.canonicalNames[type];
  if (!names?.length) return "";
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return `\nCANONICAL ${label.toUpperCase()} FROM ${ipContext.franchise.toUpperCase()} (use these EXACT names):\n${names.map((n) => `  • ${n}`).join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// buildSeedConstraints — World DNA block for generation prompts
// ---------------------------------------------------------------------------

export function buildSeedConstraints(seeds?: Partial<WorldSeeds>): string {
  if (!seeds) {
    return "";
  }

  const lines: string[] = [];
  for (const { field, label } of SEED_LABELS) {
    const v = seeds[field];
    if (!v || (Array.isArray(v) && v.length === 0)) continue;
    lines.push(`- ${label}: ${Array.isArray(v) ? v.join(", ") : v}`);
  }

  if (lines.length === 0) {
    return "";
  }

  return `\nWORLD DNA (hard constraints - you MUST incorporate ALL of these):\n${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// formatNameList — bullet list of entity names
// ---------------------------------------------------------------------------

export function formatNameList(names: string[]): string {
  if (names.length === 0) {
    return "- (none)";
  }
  return names.map((name) => `- ${name}`).join("\n");
}

// ---------------------------------------------------------------------------
// buildStopSlopRules — quality guardrails appended to all prompts
// ---------------------------------------------------------------------------

export function buildStopSlopRules(): string {
  return `
WRITING RULES — violations will be rejected:
- Every sentence states a concrete fact. Not "a vast ancient realm" → "a continent of five island nations connected by rope bridges."
- BANNED words/phrases: "sprawling", "enigmatic", "shrouded in mystery", "tapestry of", "crucible of", "bustling", "ancient evil", "delicate balance", "rich history", "looming threat", "diverse array", "stands as a testament".
- No hedging: never write "perhaps", "possibly", "might be", "it is said that". State facts.
- No AI filler openers: never start with "In this world", "It is worth noting", "Interestingly", "As a", "Here we find".
- Active voice only: not "There is a conflict between" → "Two clans fight over the northern mines."
- Zero repetition: every sentence adds information not present in any previous sentence. If you catch yourself restating, delete the sentence.
- No meta-commentary: never describe what you are doing ("I will now describe..."). Just output the content.
`;
}

// ---------------------------------------------------------------------------
// reportProgress — emit SSE progress event
// ---------------------------------------------------------------------------

export function reportProgress(
  onProgress: ((progress: GenerationProgress) => void) | undefined,
  step: number,
  totalSteps: number,
  label: string
): void {
  onProgress?.({ step, totalSteps, label });
}
