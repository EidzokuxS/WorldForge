import type { IpResearchContext } from "../ip-researcher.js";
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

  return `
FRANCHISE REFERENCE (${ipContext.franchise}, verified via ${ipContext.source}):
Key facts (use as source of truth):
${facts}
Tone:
${tone}

CANONICAL FIDELITY RULES:
- Use REAL canonical names for locations, factions, organizations, characters.
- Do NOT invent replacements, translations, or "inspired by" variants.
- Apply premise changes as butterfly effects on the canonical world.
- When the premise changes a character's teacher/faction/role, keep all OTHER canonical details unchanged unless logically affected.
- If a fact is not in the reference data, use your knowledge of the franchise. Do NOT invent non-existent franchise elements.
`;
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
OUTPUT QUALITY RULES:
- Write concrete, specific statements. Not "a vast ancient realm" but "a continent of five island nations."
- No purple prose: no "sprawling", "enigmatic", "shrouded in mystery", "tapestry of", "crucible of".
- No hedge words: no "perhaps", "possibly", "might be". Use definitive statements.
- No AI filler: no "In this world, there exists...", "It is worth noting that...", "Interestingly,".
- Action verbs over passive: not "There is a conflict" but "Two clans war over the northern mines."
- Every sentence must add NEW information. No restating what was already said.
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
