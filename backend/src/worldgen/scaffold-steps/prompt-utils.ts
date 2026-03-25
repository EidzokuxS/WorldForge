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
Key facts — treat as ground truth:
${facts}
Tone:
${tone}

CANONICAL FIDELITY RULES:
1. Use the franchise's own names for every location, faction, organization, and character. Never substitute, translate, or create "inspired by" variants.
2. Start from the canonical world as-is. Then apply the premise as a single point of divergence — trace its logical consequences outward. Everything NOT affected by that divergence stays canonical.
3. When the premise reassigns a character's allegiance, teacher, or role: update ONLY relationships that logically change. Keep all other canonical details (abilities, backstory, personality) intact.
4. If a detail is absent from the reference data above, rely on your knowledge of the franchise. Never fabricate franchise elements that do not exist in canon.
5. Never rename canonical entities to avoid copyright. This is a private RPG tool, not a published work.
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
