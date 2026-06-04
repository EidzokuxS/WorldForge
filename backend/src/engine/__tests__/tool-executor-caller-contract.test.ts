import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const engineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executeToolCallPattern = /\bexecuteToolCall\s*\(/g;
const aiSdkToolImportPattern = /import\s*\{\s*tool\s*\}\s*from\s*["']ai["']/;
const aiSdkToolFactoryPattern = /\btool\s*\(\s*\{/g;
const aiSdkToolNamePattern = /^\s{4}([a-zA-Z0-9_]+): tool\(\{/gm;

const unsafeProposalOnlyToolSurfacePatterns: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "executeToolCall import",
    pattern: /import\s*\{[^}]*\bexecuteToolCall\b[^}]*\}\s*from\s*["'][^"']*tool-executor\.js["']/,
  },
  {
    label: "commitAuthorityTrace import",
    pattern: /import\s*\{[^}]*\bcommitAuthorityTrace\b[^}]*\}\s*from\s*["'][^"']*living-world-authority\.js["']/,
  },
  { label: "executeToolCall call", pattern: /\bexecuteToolCall\s*\(/ },
  { label: "commitAuthorityTrace call", pattern: /\bcommitAuthorityTrace\s*\(/ },
  { label: "direct db write", pattern: /\bdb\.(?:insert|update|delete|run|prepare)\s*\(/ },
  { label: "direct getDb write", pattern: /\bgetDb\(\)\.(?:insert|update|delete|run|prepare|transaction)\s*\(/ },
  { label: "transaction write", pattern: /\btx\.(?:insert|update|delete|run|prepare)\s*\(/ },
  { label: "direct db transaction", pattern: /\bdb\.transaction\s*\(/ },
];

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

function extractAiSdkToolNames(source: string): string[] {
  return [...source.matchAll(aiSdkToolNamePattern)].map((match) => match[1]);
}

function forbiddenProposalOnlyToolSurfaceMatches(source: string): string[] {
  return unsafeProposalOnlyToolSurfacePatterns
    .filter(({ pattern }) => pattern.test(source))
    .map(({ label }) => label);
}

const classifiedAiSdkToolSurfaces: Record<string, {
  classification: "proposal_only" | "owned_executor_bridge" | "hybrid_owned_and_proposal";
  toolNames: string[];
}> = {
  "faction-tools.ts": {
    classification: "proposal_only",
    toolNames: [
      "faction_action",
      "update_faction_goal",
      "add_chronicle_entry",
      "declare_world_event",
    ],
  },
  "npc-tools.ts": {
    classification: "proposal_only",
    toolNames: [
      "act",
      "speak",
      "move_to",
      "update_own_goal",
    ],
  },
  "reflection-tools.ts": {
    classification: "proposal_only",
    toolNames: [
      "set_belief",
      "set_goal",
      "drop_goal",
      "set_relationship",
      "promote_identity_change",
      "upgrade_wealth",
      "upgrade_skill",
    ],
  },
  "tool-schemas.ts": {
    classification: "owned_executor_bridge",
    toolNames: [
      "list_visible_affordances",
      "list_navigation_options",
      "find_location_candidates",
      "find_object_candidates",
      "find_actor_candidates",
      "find_poi_candidates",
      "inspect_known_fact",
      "check_route",
      "move_actor",
      "create_minor_poi",
      "create_scene_extra",
      "start_search",
      "record_player_intent",
      "record_dialogue_outcome",
      "record_world_fact",
      "add_tag",
      "remove_tag",
      "set_relationship",
      "add_chronicle_entry",
      "log_event",
      "advance_time",
      "offer_quick_actions",
      "spawn_npc",
      "promote_npc",
      "spawn_item",
      "reveal_location",
      "request_contested_outcome",
      "set_condition",
      "move_to",
      "transfer_item",
    ],
  },
};

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
      "scene-plan-executor.ts": 1,
      "tool-schemas.ts": 1,
    });

    expect(sourceFor("actor-tools.ts")).toEqual(expect.stringContaining("createActorTurnToolExecutionContext({"));
    expect(sourceFor("actor-tools.ts")).toEqual(expect.stringContaining("allowedWriteScopes: args.allowedWriteScopes"));

    expect(sourceFor("gm-tool-step.ts")).toEqual(expect.stringContaining("input.context"));
    expect(sourceFor("hidden-adjudication.ts")).toEqual(expect.stringContaining("args.executionContext"));

    expect(sourceFor("reflection-tools.ts")).not.toMatch(executeToolCallPattern);

    expect(sourceFor("scene-plan-executor.ts"))
      .toEqual(expect.stringContaining("createScenePlanActionToolExecutionContext({"));

    const toolSchemas = sourceFor("tool-schemas.ts");
    expect(toolSchemas).toEqual(expect.stringContaining("if (!executionContext && toolRequiresExecutionAuthority(toolName))"));
    expect(toolSchemas).toEqual(expect.stringContaining("buildValidationFailureToolResult"));
  });

  it("keeps every production model-facing AI SDK tool surface explicitly classified", () => {
    const discoveredSurfaces = new Map<string, string[]>();
    for (const file of collectSourceFiles(engineDir)) {
      const relativePath = path.relative(engineDir, file).replace(/\\/g, "/");
      const source = fs.readFileSync(file, "utf8");
      if (!aiSdkToolImportPattern.test(source)) {
        continue;
      }
      const toolCount = [...source.matchAll(aiSdkToolFactoryPattern)].length;
      if (toolCount > 0) {
        discoveredSurfaces.set(relativePath, extractAiSdkToolNames(source));
      }
    }

    expect(Object.fromEntries(discoveredSurfaces)).toEqual(
      Object.fromEntries(
        Object.entries(classifiedAiSdkToolSurfaces).map(([file, contract]) => [
          file,
          contract.toolNames,
        ]),
      ),
    );
  });

  it("keeps proposal-only model-facing tools quarantined from direct state mutation", () => {
    for (const [file, contract] of Object.entries(classifiedAiSdkToolSurfaces)) {
      const source = sourceFor(file);
      if (contract.classification !== "proposal_only") {
        continue;
      }

      expect(forbiddenProposalOnlyToolSurfaceMatches(source)).toEqual([]);
      expect(source).toMatch(/proposalOnly: true|status: "proposal_only"|status: "proposal_only" as const/);
      expect(source).toMatch(/accepted: false|committed: false|committed: false as const/);
    }
  });

  it("keeps NPC model-facing tools proposal-only and quarantined from writes", () => {
    const npcTools = sourceFor("npc-tools.ts");
    expect(forbiddenProposalOnlyToolSurfaceMatches(npcTools)).toEqual([]);

    expect(npcTools).toEqual(expect.stringContaining('npcProposalOnly("act"'));
    expect(npcTools).toEqual(expect.stringContaining('npcProposalOnly("speak"'));
    expect(npcTools).toEqual(expect.stringContaining('npcProposalOnly("move_to"'));
    expect(npcTools).toEqual(expect.stringContaining('npcProposalOnly("update_own_goal"'));
  });

  it("keeps reflection model-facing tools proposal-only and quarantined from writes", () => {
    const reflectionTools = sourceFor("reflection-tools.ts");
    expect(forbiddenProposalOnlyToolSurfaceMatches(reflectionTools)).toEqual([]);

    for (const toolName of classifiedAiSdkToolSurfaces["reflection-tools.ts"].toolNames) {
      expect(reflectionTools).toEqual(expect.stringContaining(`reflectionProposalOnly("${toolName}"`));
    }
  });

  it("keeps faction model-facing tools proposal-only and quarantined from writes", () => {
    const factionTools = sourceFor("faction-tools.ts");
    expect(forbiddenProposalOnlyToolSurfaceMatches(factionTools)).toEqual([]);

    expect(factionTools).toEqual(expect.stringContaining("const PROPOSAL_ONLY_MESSAGE"));
    expect(factionTools).toEqual(expect.stringContaining('status: "proposal_only" as const'));
    expect(factionTools).toEqual(expect.stringContaining("committed: false as const"));
  });

  it("keeps the storyteller AI SDK surface behind the canonical executor bridge", () => {
    const toolSchemas = sourceFor("tool-schemas.ts");
    expect([...toolSchemas.matchAll(aiSdkToolFactoryPattern)]).toHaveLength(
      classifiedAiSdkToolSurfaces["tool-schemas.ts"].toolNames.length,
    );
    expect(toolSchemas).toEqual(expect.stringContaining("const executeRuntimeTool = ("));
    expect(toolSchemas).toEqual(expect.stringContaining("executeToolCall("));
    expect(toolSchemas).toEqual(expect.stringContaining("toolRequiresExecutionAuthority(toolName)"));
    expect(toolSchemas).toEqual(expect.stringContaining("const executeBridgeLookupTool = ("));
    expect(toolSchemas).toEqual(expect.stringContaining("executeBridgeCandidateTool(toolName, args, executionContext)"));
  });
});
