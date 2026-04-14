import type { PremiseDivergence, WorldSeeds } from "@worldforge/shared";

export type WorldgenResearchStep = "locations" | "factions" | "npcs";

export interface WorldgenResearchFrame {
  version: 1;
  franchise: string;
  premise: string;
  divergenceMode: PremiseDivergence["mode"] | "original";
  overlayNotes: string[];
  dnaConstraints: string[];
  stepFocus: Record<WorldgenResearchStep, string[]>;
}

const SEED_LABELS: ReadonlyArray<{ field: keyof WorldSeeds; label: string }> = [
  { field: "geography", label: "Geography" },
  { field: "politicalStructure", label: "Political Structure" },
  { field: "centralConflict", label: "Central Conflict" },
  { field: "culturalFlavor", label: "Cultural Flavor" },
  { field: "environment", label: "Environment" },
  { field: "wildcard", label: "Wildcard" },
];

function uniqueLines(values: Array<string | null | undefined>, max = 6): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const value of values) {
    const normalized = value?.trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(normalized);
    if (lines.length >= max) break;
  }

  return lines;
}

function formatSeedValue(label: string, value: WorldSeeds[keyof WorldSeeds] | undefined): string | null {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return null;
  }

  return `${label}: ${Array.isArray(value) ? value.join(", ") : value}`;
}

function buildDnaConstraints(seeds?: Partial<WorldSeeds>): string[] {
  if (!seeds) return [];
  return uniqueLines(SEED_LABELS.map(({ field, label }) => formatSeedValue(label, seeds[field])));
}

function buildOverlayNotes(premiseDivergence: PremiseDivergence | null | undefined): string[] {
  if (!premiseDivergence) return [];

  return uniqueLines([
    premiseDivergence.protagonistRole.roleSummary,
    ...premiseDivergence.currentStateDirectives,
    ...premiseDivergence.changedCanonFacts,
    ...premiseDivergence.ambiguityNotes,
  ]);
}

export function buildWorldgenResearchFrame(input: {
  franchise: string;
  premise: string;
  premiseDivergence?: PremiseDivergence | null;
  seeds?: Partial<WorldSeeds>;
}): WorldgenResearchFrame {
  const dnaConstraints = buildDnaConstraints(input.seeds);
  const overlayNotes = buildOverlayNotes(input.premiseDivergence);

  const geography = formatSeedValue("Geography", input.seeds?.geography);
  const political = formatSeedValue("Political Structure", input.seeds?.politicalStructure);
  const conflict = formatSeedValue("Central Conflict", input.seeds?.centralConflict);
  const culture = formatSeedValue("Cultural Flavor", input.seeds?.culturalFlavor);
  const environment = formatSeedValue("Environment", input.seeds?.environment);
  const wildcard = formatSeedValue("Wildcard", input.seeds?.wildcard);

  return {
    version: 1,
    franchise: input.franchise,
    premise: input.premise.trim(),
    divergenceMode: input.premiseDivergence?.mode ?? "original",
    overlayNotes,
    dnaConstraints,
    stepFocus: {
      locations: uniqueLines([geography, environment, conflict, wildcard, ...overlayNotes]),
      factions: uniqueLines([political, conflict, culture, wildcard, ...overlayNotes]),
      npcs: uniqueLines([
        conflict,
        political,
        culture,
        wildcard,
        input.premiseDivergence?.protagonistRole.roleSummary ?? null,
        ...overlayNotes,
      ]),
    },
  };
}

export function buildWorldgenResearchFrameBlock(
  frame: WorldgenResearchFrame | null | undefined,
  step: WorldgenResearchStep,
): string {
  if (!frame) return "";

  const overlayBlock = frame.overlayNotes.length
    ? frame.overlayNotes.map((note) => `  - ${note}`).join("\n")
    : "  - (none)";
  const dnaBlock = frame.dnaConstraints.length
    ? frame.dnaConstraints.map((item) => `  - ${item}`).join("\n")
    : "  - (none)";
  const focusBlock = frame.stepFocus[step].length
    ? frame.stepFocus[step].map((item) => `  - ${item}`).join("\n")
    : "  - (none)";

  return `WORLDGEN RESEARCH FRAME:
  - Canonical subject: ${frame.franchise}
  - Divergence mode: ${frame.divergenceMode}
  - Premise snapshot: ${frame.premise}
ACTIVE WORLD-STATE / OVERLAY NOTES:
${overlayBlock}
WORLD DNA CONSTRAINTS:
${dnaBlock}
CURRENT STEP FOCUS (${step.toUpperCase()}):
${focusBlock}`;
}

export function getWorldgenResearchFrameFocus(
  frame: WorldgenResearchFrame | null | undefined,
  step: WorldgenResearchStep,
): string[] {
  if (!frame) return [];
  return frame.stepFocus[step];
}
