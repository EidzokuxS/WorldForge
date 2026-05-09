import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const AUDIT_PATH = path.resolve(
  process.cwd(),
  "..",
  ".planning",
  "phases",
  "74-structured-prompt-contracts-and-model-facing-schema-hardenin",
  "74-STRUCTURED-PROMPT-AUDIT.md",
);

type RequiredAuditRow = {
  source: string;
  priority: "P0" | "P1" | "P2";
  planOwner: string;
  markers: string[];
  requiredText?: string[];
};

const semanticCheckLabels = [
  "required fields",
  "caps",
  "nullability",
  "compact valid example",
  "minimal valid output",
  "invalid example",
];

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
    source: "backend/src/engine/turn-processor.ts",
    priority: "P0",
    planOwner: "74-03",
    markers: ["STRUCTURED_OUTPUT_CONTRACT: movement-detection.v1"],
    requiredText: ["detectMovementIntent"],
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

function readAudit(): string {
  return fs.readFileSync(AUDIT_PATH, "utf8");
}

function findProductionChecklistRow(audit: string, source: string): string | undefined {
  return audit
    .split(/\r?\n/)
    .find((line) => line.includes(`\`${source}\``) && line.includes("Plan owner:"));
}

describe("Phase 74 prompt-contract audit", () => {
  it("keeps required structured-output seams as concrete source-level ownership rows", () => {
    const audit = readAudit();
    const failures = requiredAuditRows.flatMap((requirement) => {
      const row = findProductionChecklistRow(audit, requirement.source);
      if (!row) {
        return [`${requirement.source}: missing concrete production checklist row`];
      }

      const rowFailures: string[] = [];
      if (!row.startsWith(`| ${requirement.priority} |`)) {
        rowFailures.push(`${requirement.source}: expected priority ${requirement.priority}`);
      }
      if (!row.includes(`Plan owner: ${requirement.planOwner}`)) {
        rowFailures.push(`${requirement.source}: missing plan owner ${requirement.planOwner}`);
      }
      if (!row.includes("test owner:")) {
        rowFailures.push(`${requirement.source}: missing semantic test owner`);
      }
      for (const marker of requirement.markers) {
        if (!row.includes(marker)) {
          rowFailures.push(`${requirement.source}: missing marker ${marker}`);
        }
      }
      for (const text of requirement.requiredText ?? []) {
        if (!row.includes(text)) {
          rowFailures.push(`${requirement.source}: missing required text ${text}`);
        }
      }

      return rowFailures;
    });

    expect(failures).toEqual([]);
  });

  it("requires versioned contract markers for every owned seam", () => {
    const audit = readAudit();
    const failures = requiredAuditRows.flatMap((requirement) => {
      const row = findProductionChecklistRow(audit, requirement.source);
      if (!row) return [`${requirement.source}: missing row`];

      return requirement.markers
        .filter((marker) => !/^STRUCTURED_OUTPUT_CONTRACT: [a-z0-9.-]+\.v1$/.test(marker))
        .map((marker) => `${requirement.source}: marker is not versioned: ${marker}`);
    });

    expect(failures).toEqual([]);
  });

  it("requires semantic adequacy metadata beyond marker presence", () => {
    const audit = readAudit();
    const failures = requiredAuditRows.flatMap((requirement) => {
      const row = findProductionChecklistRow(audit, requirement.source);
      if (!row) return [`${requirement.source}: missing row`];

      return semanticCheckLabels
        .filter((label) => !row.includes(label))
        .map((label) => `${requirement.source}: missing semantic-check label ${label}`);
    });

    expect(failures).toEqual([]);
  });

  it("keeps the audit metadata schema explicit and excludes prose-only seams", () => {
    const audit = readAudit();

    expect(audit).toContain("Call or prompt builder");
    expect(audit).toContain("Schema/tool source");
    expect(audit).toContain("Missing model-facing contract");
    expect(audit).toContain("Deterministic authority");
    expect(audit).toContain("Failure class");
    expect(audit).toContain("Explicit Exclusions");
    expect(audit).toContain("backend/src/engine/turn-processor.ts` final narration");
    expect(audit).toContain("backend/src/ai/storyteller.ts");
  });
});
