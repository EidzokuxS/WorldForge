import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type BoundaryClassification =
  | "native_schema"
  | "native_json"
  | "tool_mode"
  | "text_fallback"
  | "unstructured_prose";

const allowedClassifications = new Set<BoundaryClassification>([
  "native_schema",
  "native_json",
  "tool_mode",
  "text_fallback",
  "unstructured_prose",
]);

const expectedBoundaryRows: Array<{
  file: string;
  classification: BoundaryClassification;
}> = [
  { file: "backend/src/ai/storyteller.ts", classification: "unstructured_prose" },
  { file: "backend/src/ai/structured-output-conformance.ts", classification: "text_fallback" },
  { file: "backend/src/character/generator.ts", classification: "text_fallback" },
  { file: "backend/src/character/ingestion/assess-original.ts", classification: "text_fallback" },
  { file: "backend/src/character/ingestion/synthesizer.ts", classification: "text_fallback" },
  { file: "backend/src/character/known-ip-worldgen-research.ts", classification: "text_fallback" },
  { file: "backend/src/character/npc-generator.ts", classification: "text_fallback" },
  { file: "backend/src/engine/actor-brain.ts", classification: "text_fallback" },
  { file: "backend/src/engine/clarification-reviewer.ts", classification: "text_fallback" },
  { file: "backend/src/engine/gameplay-cycle-runtime/gm-read.ts", classification: "text_fallback" },
  { file: "backend/src/engine/gameplay-cycle-runtime/judge-uncertainty.ts", classification: "text_fallback" },
  { file: "backend/src/engine/gameplay-cycle-runtime/narration.ts", classification: "text_fallback" },
  { file: "backend/src/engine/gameplay-cycle-runtime/stage4-execution.ts", classification: "text_fallback" },
  { file: "backend/src/engine/gm-action-checklist.ts", classification: "text_fallback" },
  { file: "backend/src/engine/gm-beat-plan.ts", classification: "text_fallback" },
  { file: "backend/src/engine/gm-tool-step.ts", classification: "text_fallback" },
  { file: "backend/src/engine/gm-turn-decision.ts", classification: "text_fallback" },
  { file: "backend/src/engine/gm-turn-read.ts", classification: "text_fallback" },
  { file: "backend/src/engine/hidden-adjudication.ts", classification: "text_fallback" },
  { file: "backend/src/engine/npc-offscreen.ts", classification: "text_fallback" },
  { file: "backend/src/engine/oracle.ts", classification: "text_fallback" },
  { file: "backend/src/engine/prompt-assembler.ts", classification: "text_fallback" },
  { file: "backend/src/engine/scene-planner.ts", classification: "text_fallback" },
  { file: "backend/src/engine/target-context.ts", classification: "text_fallback" },
  { file: "backend/src/engine/turn-processor.ts", classification: "text_fallback" },
  { file: "backend/src/engine/world-brain.ts", classification: "text_fallback" },
  { file: "backend/src/engine/world-forecast-builder.ts", classification: "text_fallback" },
  { file: "backend/src/scripts/backfill-personality.ts", classification: "text_fallback" },
  { file: "backend/src/worldbook-library/composition.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/ip-researcher.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/lore-extractor.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/premise-divergence.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/scaffold-steps/factions-step.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/scaffold-steps/locations-step.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/scaffold-steps/npcs-step.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/scaffold-steps/placement-expansion-step.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/scaffold-steps/premise-step.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/scaffold-steps/regen-helpers.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/scaffold-steps/validation.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/seed-suggester.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/starting-location.ts", classification: "text_fallback" },
  { file: "backend/src/worldgen/worldbook-importer.ts", classification: "text_fallback" },
];

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "__tests__") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function toInventoryPath(filePath: string): string {
  return `backend/${path.relative(process.cwd(), filePath).split(path.sep).join("/")}`;
}

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function collectStructuredOutputBoundaryFiles(): string[] {
  const srcRoot = path.resolve(process.cwd(), "src");
  return collectSourceFiles(srcRoot)
    .filter((filePath) => {
      const source = readSource(filePath);
      const safeGenerateObjectImport =
        /from\s*["'][^"']*generate-object-safe\.js["']/.test(source);
      const directTextImport =
        /import\s*\{[^}]*\b(?:generateText|streamText)\b[^}]*\}\s*from\s*["']ai["']/s.test(source);
      const directTextCall = /\b(?:generateText|streamText)\s*\(/.test(source);
      return safeGenerateObjectImport || (directTextImport && directTextCall);
    })
    .map(toInventoryPath)
    .sort();
}

describe("structured output boundary", () => {
  it("keeps production LLM object generation behind safeGenerateObject", () => {
    const srcRoot = path.resolve(process.cwd(), "src");
    const offenders = collectSourceFiles(srcRoot)
      .filter((filePath) => !filePath.endsWith(path.join("ai", "generate-object-safe.ts")))
      .filter((filePath) => {
        const source = fs.readFileSync(filePath, "utf8");
        return /import\s*\{[^}]*\bgenerateObject\b[^}]*\}\s*from\s*["']ai["']/s.test(source);
      })
      .map((filePath) => path.relative(process.cwd(), filePath));

    expect(offenders).toEqual([]);
  });

  it("keeps every production object/prose generation boundary in the source-level registry", () => {
    const actual = collectStructuredOutputBoundaryFiles();
    const expected = expectedBoundaryRows.map((row) => row.file).sort();

    expect(actual).toEqual(expected);
  });

  it("uses only known structured-output classifications in the source-level registry", () => {
    const invalidRows = expectedBoundaryRows.filter(
      (row) => !allowedClassifications.has(row.classification),
    );

    expect(expectedBoundaryRows.length).toBeGreaterThan(0);
    expect(invalidRows).toEqual([]);
  });

  it("does not couple production fallbacks to obsolete safeGenerateObject message text", () => {
    const srcRoot = path.resolve(process.cwd(), "src");
    const offenders = collectSourceFiles(srcRoot)
      .filter((filePath) => !filePath.endsWith(path.join("ai", "generate-object-safe.ts")))
      .filter((filePath) => {
        const source = fs.readFileSync(filePath, "utf8");
        return source.includes("safeGenerateObject fallback:");
      })
      .map((filePath) => path.relative(process.cwd(), filePath));

    expect(offenders).toEqual([]);
  });
});
