import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const engineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executeToolCallPattern = /\bexecuteToolCall\s*\(/g;

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : collectSourceFiles(fullPath);
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
      return [];
    }
    return [fullPath];
  });
}

function sourceFor(relativePath: string): string {
  return fs.readFileSync(path.join(engineDir, relativePath), "utf8");
}

describe("tool executor caller authority contract", () => {
  it("keeps every production executeToolCall caller classified by strict authority context", () => {
    const callerCounts = new Map<string, number>();
    for (const file of collectSourceFiles(engineDir)) {
      const relativePath = path.relative(engineDir, file).replace(/\\/g, "/");
      if (relativePath === "tool-executor.ts") {
        continue;
      }
      const source = fs.readFileSync(file, "utf8");
      const count = [...source.matchAll(executeToolCallPattern)].length;
      if (count > 0) {
        callerCounts.set(relativePath, count);
      }
    }

    expect(Object.fromEntries(callerCounts)).toEqual({
      "actor-tools.ts": 1,
      "gm-tool-step.ts": 2,
      "hidden-adjudication.ts": 1,
      "npc-tools.ts": 2,
      "scene-plan-executor.ts": 1,
      "tool-schemas.ts": 1,
    });

    expect(sourceFor("actor-tools.ts")).toEqual(expect.stringContaining("createActorTurnToolExecutionContext({"));
    expect(sourceFor("actor-tools.ts")).toEqual(expect.stringContaining("allowedWriteScopes: args.allowedWriteScopes"));

    expect(sourceFor("gm-tool-step.ts")).toEqual(expect.stringContaining("input.context"));
    expect(sourceFor("hidden-adjudication.ts")).toEqual(expect.stringContaining("args.executionContext"));

    const npcTools = sourceFor("npc-tools.ts");
    expect(npcTools).toEqual(expect.stringContaining("createBackgroundToolExecutionContext({"));
    expect(npcTools).toEqual(expect.stringContaining("createNpcAuthorityContext({"));
    expect(npcTools).toEqual(expect.stringContaining("createNpcMoveAuthorityContext({"));

    expect(sourceFor("reflection-tools.ts")).not.toMatch(executeToolCallPattern);

    expect(sourceFor("scene-plan-executor.ts"))
      .toEqual(expect.stringContaining("createScenePlanActionToolExecutionContext({"));

    const toolSchemas = sourceFor("tool-schemas.ts");
    expect(toolSchemas).toEqual(expect.stringContaining("if (!executionContext && toolRequiresExecutionAuthority(toolName))"));
    expect(toolSchemas).toEqual(expect.stringContaining("buildValidationFailureToolResult"));
  });
});
