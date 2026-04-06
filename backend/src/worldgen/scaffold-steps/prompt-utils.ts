import type { IpResearchContext, PremiseDivergence } from "@worldforge/shared";
import { createLogger } from "../../lib/index.js";
import type { WorldSeeds } from "../seed-roller.js";
import type { GenerationProgress } from "../types.js";

const log = createLogger("prompt-utils");

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

function buildCanonicalNamesBlock(cn: IpResearchContext["canonicalNames"]): string {
  if (!cn) return "";
  const lines: string[] = [];
  if (cn.locations?.length) lines.push(`  Locations: ${cn.locations.join(", ")}`);
  if (cn.factions?.length) lines.push(`  Factions: ${cn.factions.join(", ")}`);
  if (cn.characters?.length) lines.push(`  Characters: ${cn.characters.join(", ")}`);
  if (lines.length === 0) return "";
  return `CANONICAL NAMES — use these EXACT names, never invent substitutes:\n${lines.join("\n")}`;
}

function buildFlatIpContextBlock(ipContext: IpResearchContext): string {
  const facts = ipContext.keyFacts.map((f) => `  - ${f}`).join("\n");
  const tone = ipContext.tonalNotes.map((t) => `  - ${t}`).join("\n");
  const nameBlock = buildCanonicalNamesBlock(ipContext.canonicalNames);

  return `
FRANCHISE REFERENCE (${ipContext.franchise}, verified via ${ipContext.source}):
${nameBlock ? `${nameBlock}\n` : ""}
Key facts — treat as ground truth:
${facts}
Tone:
${tone}

GENERATION RULES:
1. Build the canonical world from this FRANCHISE REFERENCE, with targeted modifications from the premise.
2. Draw locations, factions, and characters from the franchise canon. Use the franchise's own names exactly as written.
3. Keep all canonical details intact unless the premise explicitly changes them.
4. For absent details, rely on your knowledge of the franchise.
5. This is a private RPG tool — use real canonical names freely.
`;
}

function buildSourceGroupedIpContextBlock(ipContext: IpResearchContext): string {
  const groups = ipContext.sourceGroups!;
  const tone = ipContext.tonalNotes.map((t) => `  - ${t}`).join("\n");

  // Merged canonical names block (from the flat ipContext — already merged)
  const nameBlock = buildCanonicalNamesBlock(ipContext.canonicalNames);

  const primaryGroups = groups.filter(g => g.priority === "primary");
  const suppGroups = groups.filter(g => g.priority !== "primary");

  const sourceBlocks: string[] = [];
  for (const group of primaryGroups) {
    const facts = group.keyFacts.map((f) => `  - ${f}`).join("\n");
    sourceBlocks.push(
      `PRIMARY SOURCE — ${group.sourceName} (${group.keyFacts.length} entries):\nThis is THE WORLD. Draw all locations, factions, and NPCs from here.\n${facts}`,
    );
  }
  for (const group of suppGroups) {
    const facts = group.keyFacts.map((f) => `  - ${f}`).join("\n");
    sourceBlocks.push(
      `SUPPLEMENTARY — ${group.sourceName} (${group.keyFacts.length} entries):\nSeasoning only. Borrow 1-2 elements max and weave them into the PRIMARY world.\nThe PRIMARY SOURCE defines the setting; this source adds minor crossover flavor.\n${facts}`,
    );
  }

  return `
FRANCHISE REFERENCE (${ipContext.franchise}, verified via ${ipContext.source}):
${nameBlock ? `${nameBlock}\n` : ""}
${sourceBlocks.join("\n\n")}

Tone:
${tone}

GENERATION RULES:
1. The PREMISE defines what this world is. Follow it as the primary creative guide.
2. Draw the vast majority of locations, factions, and NPCs from the PRIMARY SOURCE. This source IS the world.
3. Supplementary sources contribute at most 1-2 crossover elements. The world belongs to the PRIMARY SOURCE.
4. Use canonical names exactly as written in the source material.
5. Keep all canonical details intact unless the premise explicitly changes them.
6. For absent details, rely on your knowledge of the franchise.
7. This is a private RPG tool — use real canonical names freely.
`;
}

export function buildIpContextBlock(ipContext: IpResearchContext | null): string {
  if (!ipContext) {
    log.info("buildIpContextBlock: no ipContext provided");
    return "";
  }

  // Use source-grouped format when multiple source groups with different priorities exist
  const hasMultipleGroups = ipContext.sourceGroups && ipContext.sourceGroups.length > 1;
  log.info("buildIpContextBlock DECISION", {
    franchise: ipContext.franchise,
    hasSourceGroups: !!ipContext.sourceGroups,
    sourceGroupCount: ipContext.sourceGroups?.length ?? 0,
    hasMultipleGroups,
    format: hasMultipleGroups ? "GROUPED (primary/supplementary)" : "FLAT",
    totalKeyFacts: ipContext.keyFacts.length,
    sourceGroupDetails: ipContext.sourceGroups?.map((g) => `${g.sourceName}: ${g.priority} (${g.keyFacts.length} facts)`),
  });

  if (hasMultipleGroups) {
    return buildSourceGroupedIpContextBlock(ipContext);
  }

  return buildFlatIpContextBlock(ipContext);
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

export function buildCharacterStartGuardrail(): string {
  return `
CHARACTER/START GUARDRAIL:
- If this world detail implies protagonists, NPCs, or opening-state facts, reason about them through authored profile/social context/motivations and startConditions rather than legacy tag-only shorthand.
- Any derived runtime tags are a compact compatibility view, not the source-of-truth character model.
`.trim();
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

// ---------------------------------------------------------------------------
// reportSubProgress — emit SSE progress event with entity-level sub-progress
// ---------------------------------------------------------------------------

export function reportSubProgress(
  onProgress: ((progress: GenerationProgress) => void) | undefined,
  step: number,
  totalSteps: number,
  label: string,
  subStep: number,
  subTotal: number,
  subLabel: string,
): void {
  onProgress?.({ step, totalSteps, label, subStep, subTotal, subLabel });
}
