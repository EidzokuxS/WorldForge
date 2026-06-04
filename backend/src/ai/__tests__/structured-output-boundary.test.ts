import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const INVENTORY_PATH = path.resolve(
  process.cwd(),
  "..",
  ".planning",
  "phases",
  "73-structured-output-stability-and-provider-conformance",
  "73-STRUCTURED-OUTPUT-INVENTORY.md",
);

const allowedClassifications = new Set([
  "native_schema",
  "native_json",
  "tool_mode",
  "text_fallback",
  "unstructured_prose",
]);

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

function readInventory(): string {
  return fs.readFileSync(INVENTORY_PATH, "utf8");
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

  it("keeps every production object/prose generation boundary in the Phase 73 inventory", () => {
    const inventory = readInventory();
    const missing = collectStructuredOutputBoundaryFiles()
      .filter((filePath) => !inventory.includes(filePath));

    expect(missing).toEqual([]);
  });

  it("uses only known structured-output classifications in the Phase 73 inventory", () => {
    const inventory = readInventory();
    const rows = inventory
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("| `backend/src/"));

    const invalidRows = rows.filter((row) => {
      const cells = row.split("|").map((cell) => cell.trim());
      const classification = cells[5];
      return !allowedClassifications.has(classification ?? "");
    });

    expect(rows.length).toBeGreaterThan(0);
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
