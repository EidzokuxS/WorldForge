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

/** Extract proper nouns from facts that look like canonical entity names */
function extractCanonicalNames(facts: string[]): string {
  const namePatterns = [
    // "X Village" / "Village Hidden in X" / "Land of X"
    /\b(?:Hidden\s+)?(?:Leaf|Sand|Mist|Rock|Cloud|Sound|Rain|Grass|Waterfall|Star)\s+Village\b/gi,
    /\b(?:Konohagakure|Sunagakure|Kirigakure|Iwagakure|Kumogakure|Otogakure|Amegakure)\b/gi,
    /\bLand\s+of\s+(?:Fire|Wind|Water|Earth|Lightning|Iron|Waves|Tea|Snow|Rice|Rain|Sound|Sky|Bears|Silence)\b/gi,
    // Capitalized multi-word names (2-4 words, not starting common words)
    /\b(?:The\s+)?(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g,
  ];

  const names = new Set<string>();
  const joined = facts.join(" ");
  for (const pattern of namePatterns) {
    for (const match of joined.matchAll(pattern)) {
      const name = match[0].trim();
      if (name.length > 3 && !["The World", "The Story", "The Series", "This World"].includes(name)) {
        names.add(name);
      }
    }
  }
  return names.size > 0 ? `CANONICAL NAMES FOUND IN RESEARCH (use these EXACT names):\n${[...names].join(", ")}\n` : "";
}

export function buildIpContextBlock(ipContext: IpResearchContext | null): string {
  if (!ipContext) return "";

  const facts = ipContext.keyFacts.map((f) => `  - ${f}`).join("\n");
  const tone = ipContext.tonalNotes.map((t) => `  - ${t}`).join("\n");
  const canonicalNames = extractCanonicalNames(ipContext.keyFacts);

  return `
FRANCHISE REFERENCE (${ipContext.franchise}, verified via ${ipContext.source}):
${canonicalNames}
Key facts — treat as ground truth:
${facts}
Tone:
${tone}

CANONICAL FIDELITY RULES (MANDATORY — violations will be rejected):
1. You are building the CANONICAL world with targeted modifications. Every location, faction, organization, and character MUST be from the franchise canon unless the premise's divergence logically creates something new.
2. DO NOT INVENT original locations, factions, or characters when canonical ones exist. If the franchise has 5 major cities, use those 5 cities. Do not replace them with original creations.
3. Use the franchise's own names exactly as they appear in the source material. Never substitute, translate, simplify, or create "inspired by" variants.
4. The premise is a SINGLE POINT OF DIVERGENCE. Start from the canonical world and trace logical consequences outward. Everything NOT directly affected by that divergence stays exactly as it is in canon.
5. When the premise reassigns a character's allegiance, teacher, or role: update ONLY relationships that logically change. Keep all other canonical details (abilities, backstory, personality, appearance) intact.
6. If a detail is absent from the reference data above, rely on your knowledge of the franchise. Never fabricate franchise elements that do not exist in canon.
7. Never rename canonical entities to avoid copyright. This is a private RPG tool, not a published work.
8. The ratio of canonical to original content must be AT LEAST 80/20. Original content is acceptable ONLY for minor supporting characters or locations that the premise's divergence logically requires.
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
