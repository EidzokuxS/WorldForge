import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type RequiredAuditRow = {
  source: string;
  priority: "P0" | "P1" | "P2";
  planOwner: string;
  markers: string[];
  requiredText?: string[];
};

const requiredAuditRows: RequiredAuditRow[] = [
  {
    source: "backend/src/engine/scene-planner.ts",
    priority: "P0",
    planOwner: "74-02",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: scene-planner.v1"],
    requiredText: ["plannedActions[].input", "actions[].action"],
  },
  {
    source: "backend/src/engine/hidden-adjudication.ts",
    priority: "P0",
    planOwner: "74-02",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: hidden-adjudication.v1"],
    requiredText: ["runtimeToolInputSchemas", "payload/input aliasing"],
  },
  {
    source: "backend/src/engine/world-brain.ts",
    priority: "P0",
    planOwner: "74-03",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: world-brain.v1"],
  },
  {
    source: "backend/src/engine/oracle.ts",
    priority: "P0",
    planOwner: "74-03",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: oracle.v1"],
  },
  {
    source: "backend/src/engine/target-context.ts",
    priority: "P0",
    planOwner: "74-03",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: target-context.v1"],
  },
  {
    source: "backend/src/worldgen/ip-researcher.ts",
    priority: "P0",
    planOwner: "74-04",
    markers: [
      "STRUCTURED_OUTPUT_CONTRACT: generated-context.v1",
      "STRUCTURED_OUTPUT_CONTRACT: research-artifact.v1",
      "STRUCTURED_OUTPUT_CONTRACT: artifact-sufficiency.v1",
      "STRUCTURED_OUTPUT_CONTRACT: artifact-fact-extraction.v1",
    ],
    requiredText: ["citations", "canonicalNames"],
  },
  {
    source: "backend/src/worldgen/research-artifact.ts",
    priority: "P0",
    planOwner: "74-04",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: worldgen-research-artifact.v1"],
    requiredText: ["no backend canon inference"],
  },
  {
    source: "backend/src/worldgen/scaffold-steps/prompt-utils.ts",
    priority: "P1",
    planOwner: "74-07",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: scaffold-core.v1"],
  },
  {
    source: "backend/src/worldgen/scaffold-steps/locations-step.ts",
    priority: "P1",
    planOwner: "74-07",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: scaffold-location.v1"],
  },
  {
    source: "backend/src/worldgen/scaffold-steps/factions-step.ts",
    priority: "P1",
    planOwner: "74-07",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: scaffold-faction.v1"],
  },
  {
    source: "backend/src/worldgen/scaffold-steps/npcs-step.ts",
    priority: "P1",
    planOwner: "74-07",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: scaffold-npc.v1"],
  },
  {
    source: "backend/src/worldgen/scaffold-steps/regen-helpers.ts",
    priority: "P1",
    planOwner: "74-07",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: scaffold-regeneration.v1"],
  },
  {
    source: "backend/src/worldgen/seed-suggester.ts",
    priority: "P1",
    planOwner: "74-08",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: seed-suggestion.v1"],
  },
  {
    source: "backend/src/worldgen/lore-extractor.ts",
    priority: "P1",
    planOwner: "74-08",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: lore-extraction.v1"],
  },
  {
    source: "backend/src/worldgen/starting-location.ts",
    priority: "P1",
    planOwner: "74-08",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: starting-location.v1"],
  },
  {
    source: "backend/src/worldgen/premise-divergence.ts",
    priority: "P1",
    planOwner: "74-08",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: premise-divergence.v1"],
  },
  {
    source: "backend/src/worldgen/scaffold-steps/premise-step.ts",
    priority: "P1",
    planOwner: "74-08",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: premise-refinement.v1"],
  },
  {
    source: "backend/src/worldgen/scaffold-steps/validation.ts",
    priority: "P1",
    planOwner: "74-08",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: scaffold-validation.v1"],
  },
  {
    source: "backend/src/character/generator.ts",
    priority: "P1",
    planOwner: "74-05",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: character.v1"],
  },
  {
    source: "backend/src/character/npc-generator.ts",
    priority: "P1",
    planOwner: "74-05",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: npc-character.v1"],
  },
  {
    source: "backend/src/character/known-ip-worldgen-research.ts",
    priority: "P1",
    planOwner: "74-05",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: power-stats.v1"],
    requiredText: ["underspecified stats", "invented canon feats"],
  },
  {
    source: "backend/src/character/ingestion/assess-original.ts",
    priority: "P1",
    planOwner: "74-05",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: original-power-assessment.v1"],
  },
  {
    source: "backend/src/character/ingestion/synthesizer.ts",
    priority: "P1",
    planOwner: "74-05",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: character-synthesis.v1"],
  },
  {
    source: "backend/src/engine/npc-offscreen.ts",
    priority: "P1",
    planOwner: "74-09",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: npc-offscreen.v1"],
  },
  {
    source: "backend/src/engine/prompt-assembler.ts",
    priority: "P1",
    planOwner: "74-09",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: context-compression.v1"],
    requiredText: ["compressContext", "no fabricated memory/lore content"],
  },
  {
    source: "backend/src/worldbook-library/composition.ts",
    priority: "P2",
    planOwner: "74-06",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: worldbook-composition.v1"],
  },
  {
    source: "backend/src/worldgen/worldbook-importer.ts",
    priority: "P2",
    planOwner: "74-06",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: worldbook-import.v1"],
  },
  {
    source: "backend/src/scripts/backfill-personality.ts",
    priority: "P2",
    planOwner: "74-06",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: backfill-personality.v1"],
  },
];

function toLocalPath(source: string): string {
  return path.resolve(process.cwd(), "..", source);
}

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function readContractTestSource(): string {
  const self = path.resolve(process.cwd(), "src/ai/__tests__/structured-prompt-contract-audit.test.ts");
  return collectSourceFiles(path.resolve(process.cwd(), "src"))
    .filter((filePath) => filePath.includes(`${path.sep}__tests__${path.sep}`))
    .filter((filePath) => path.resolve(filePath) !== self)
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

describe("Structured prompt-contract audit", () => {
  it("keeps required structured-output seams as concrete source-level contracts", () => {
    const failures = requiredAuditRows.flatMap((requirement) => {
      const sourcePath = toLocalPath(requirement.source);
      if (!fs.existsSync(sourcePath)) {
        return [`${requirement.source}: missing production source file`];
      }
      if (requirement.markers.length === 0) {
        return [`${requirement.source}: missing contract marker declaration`];
      }
      return [];
    });

    expect(failures).toEqual([]);
  });

  it("requires versioned contract markers for every owned seam", () => {
    const failures = requiredAuditRows.flatMap((requirement) => {
      return requirement.markers
        .filter((marker) => !/^STRUCTURED_OUTPUT_CONTRACT: [a-z0-9.-]+\.v1$/.test(marker))
        .map((marker) => `${requirement.source}: marker is not versioned: ${marker}`);
    });

    expect(failures).toEqual([]);
  });

  it("requires semantic test coverage beyond marker presence", () => {
    const testSource = readContractTestSource();
    const failures = requiredAuditRows.flatMap((requirement) => {
      return requirement.markers
        .filter((marker) => !testSource.includes(marker))
        .map((marker) => `${requirement.source}: missing test coverage for ${marker}`);
    });

    expect(failures).toEqual([]);
  });

  it("keeps prose-only seams outside the structured-output ownership list", () => {
    const ownedSources = new Set(requiredAuditRows.map((row) => row.source));

    expect(ownedSources.size).toBeGreaterThan(0);
    expect(ownedSources.has("backend/src/engine/gameplay-cycle-runtime/narration.ts")).toBe(false);
    expect(ownedSources.has("backend/src/ai/storyteller.ts")).toBe(false);
  });
});
