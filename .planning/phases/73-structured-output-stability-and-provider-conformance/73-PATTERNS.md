# Phase 73: Structured Output Stability and Provider Conformance - Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 18 likely new/modified files
**Analogs found:** 18 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/ai/generate-object-safe.ts` | utility/service | request-response, transform | `backend/src/ai/generate-object-safe.ts` | exact-existing |
| `backend/src/ai/structured-output-capabilities.ts` | utility/config | request-response, transform | `backend/src/ai/provider-registry.ts` | role-match |
| `backend/src/ai/structured-output-conformance.ts` | service/harness | batch, request-response | `backend/src/ai/test-connection.ts` + `backend/src/ai/provider-registry.ts` | partial |
| `backend/src/ai/__tests__/generate-object-safe.test.ts` | test | request-response, transform | `backend/src/ai/__tests__/generate-object-safe.test.ts` | exact-existing |
| `backend/src/ai/__tests__/structured-output-conformance.test.ts` | test | batch, request-response | `backend/src/ai/__tests__/generate-object-safe.test.ts` + `backend/src/ai/__tests__/provider-registry.test.ts` | role-match |
| `backend/src/ai/__tests__/structured-output-boundary.test.ts` | test | file-I/O, static inventory | `backend/src/ai/__tests__/structured-output-boundary.test.ts` | exact-existing |
| `backend/src/engine/scene-planner.ts` | service | request-response, transform | `backend/src/engine/scene-planner.ts` | exact-existing |
| `backend/src/engine/scene-plan-schema.ts` | model/schema | transform, validation | `backend/src/engine/scene-plan-schema.ts` | exact-existing |
| `backend/src/engine/semantic-scene-plan-schema.ts` | model/schema | transform, validation | `backend/src/engine/scene-plan-schema.ts` | role-match |
| `backend/src/engine/__tests__/scene-planner.test.ts` | test | request-response, transform | `backend/src/engine/__tests__/scene-planner.test.ts` | exact-existing |
| `backend/src/engine/__tests__/scene-plan-validator.test.ts` | test | transform, validation | `backend/src/engine/scene-plan-validator.ts` + existing test file | role-match |
| `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts` | test | event-driven, request-response | `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts` | exact-existing |
| `backend/src/worldgen/research-artifact.ts` | model/schema | transform, validation | `backend/src/worldgen/research-artifact.ts` | exact-existing |
| `backend/src/worldgen/ip-researcher.ts` | service | request-response, file-I/O/external search | `backend/src/worldgen/ip-researcher.ts` | exact-existing |
| `backend/src/worldgen/scaffold-steps/npcs-step.ts` | service | batch, request-response | `backend/src/worldgen/scaffold-steps/npcs-step.ts` | exact-existing |
| `backend/src/worldgen/__tests__/research-artifact.test.ts` | test | transform, validation | `backend/src/worldgen/__tests__/research-artifact.test.ts` | exact-existing |
| `backend/src/worldgen/__tests__/ip-researcher.test.ts` | test | request-response, external I/O mocked | `backend/src/worldgen/__tests__/ip-researcher.test.ts` | exact-existing |
| `backend/src/worldgen/__tests__/npcs-step.test.ts` | test | batch, request-response | `backend/src/worldgen/__tests__/npcs-step.test.ts` | exact-existing |

## Pattern Assignments

### `backend/src/ai/generate-object-safe.ts` (utility/service, request-response + transform)

**Analog:** `backend/src/ai/generate-object-safe.ts`

**Imports and trace shape pattern** (lines 1-29):
```typescript
import { generateText, type LanguageModel } from "ai";
import type { ZodType } from "zod";
import { createLogger } from "../lib/index.js";
import { extractReasoningText } from "./extract-reasoning-text.js";

const log = createLogger("generate-object-safe");

export interface SafeGenerateTrace {
  text: string;
  cleanedText: string;
  reasoningText?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
  };
  response?: {
    id?: string;
    modelId?: string;
    timestamp?: string;
  };
  providerMetadata?: unknown;
  finishReason?: string;
  repair?: SafeGenerateTrace & {
    issues: string;
  };
}
```

**Copy/extend:** add strategy fields here, not in ad hoc caller logs. Planner should preserve `usage`, `response`, `providerMetadata`, `finishReason`, and nested `repair`.

**Current option seam** (lines 464-475):
```typescript
export interface SafeGenerateOpts<T> {
  model: LanguageModel;
  schema: ZodType<T>;
  system?: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
  mode?: "json" | "tool";
  /** Override retry count (default 3). Set to 1 to disable retries. */
  retries?: number;
  [key: string]: unknown;
}
```

**Copy/extend:** `mode` already exists but is unused. Add explicit requested/actual strategy without changing caller signature unless needed.

**Trace conversion pattern** (lines 478-505):
```typescript
function toTraceFromGenerateTextResult(
  result: Awaited<ReturnType<typeof generateText>>,
  cleanedText: string,
): SafeGenerateTrace {
  return {
    text: result.text,
    cleanedText,
    reasoningText: extractReasoningText(result),
    usage: result.usage
      ? {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          reasoningTokens: result.usage.reasoningTokens,
          cachedInputTokens: result.usage.cachedInputTokens,
        }
      : undefined,
    response: {
      id: result.response?.id,
      modelId: result.response?.modelId,
      timestamp:
        result.response?.timestamp instanceof Date
          ? result.response.timestamp.toISOString()
          : undefined,
    },
    providerMetadata: result.providerMetadata,
    finishReason: result.finishReason,
  };
}
```

**Copy/extend:** native structured output branch should use the same metadata projection, with `output` object source if AI SDK returns object output.

**Repair pattern** (lines 514-533, 543-586):
```typescript
function buildRepairPrompt(invalidJson: string, issues: string, schemaHint: string): string {
  return `Repair this model JSON output so it satisfies the expected schema.

Rules:
- Preserve the original meaning and facts whenever possible.
- Change only structure, field types, field names, and invalid caps needed to satisfy validation.
- Do not invent new lore.
- If an optional field cannot be repaired from the output, omit it.
- If a field named "citations" is present and the schema expects citation objects, return an array of objects, not strings.
- If a field named "canonicalNames" is present, return an object with locations/factions/characters arrays when those names can be classified.
- Output valid JSON only. No markdown. No explanation.
```

```typescript
const result = await generateText({
  model: opts.model,
  temperature: 0,
  maxOutputTokens: opts.maxOutputTokens ?? opts.maxTokens,
  system: "You repair invalid JSON into schema-valid JSON. Return JSON only.",
  prompt: buildRepairPrompt(invalidJson, issues, schemaHint),
});

const cleaned = extractJson(result.text);
const repairTrace = toTraceFromGenerateTextResult(result, cleaned);
let parsed: unknown;
try {
  parsed = JSON.parse(cleaned);
} catch {
  log.warn(`safeGenerateObject repair returned invalid JSON: ${result.text.slice(0, 200)}`);
  return null;
}

parsed = coerceToSchema(parsed, opts.schema);
const repaired = opts.schema.safeParse(parsed);
if (!repaired.success) {
  log.warn(`safeGenerateObject repair still failed Zod validation: ${formatZodIssues(repaired.error)}`);
  return null;
}
```

**Copy/extend:** repair stays secondary. Native-first branch must not bypass final Zod `safeParse`.

**Retry/logging pattern** (lines 682-725):
```typescript
export async function safeGenerateObject<T>(opts: SafeGenerateOpts<T>): Promise<SafeGenerateResult<T>> {
  const maxAttempts = opts.retries ?? MAX_RETRIES;
  let lastError: Error | undefined;
  const modelId = describeModel(opts.model);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();
    try {
      const result = await attemptGenerate(opts);
      log.event("llm.attempt", {
        attemptNum: attempt,
        model: modelId,
        success: true,
        reasoningLen: result.trace.reasoningText?.length ?? 0,
        responseModel: result.trace.response?.modelId ?? null,
        usage: result.trace.usage ?? null,
        latencyMs: Date.now() - attemptStart,
      });
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const trace =
        err instanceof SafeGenerateError
          ? err.trace
          : undefined;
      log.event("llm.attempt", {
        attemptNum: attempt,
        model: modelId,
        success: false,
        error: lastError.message.slice(0, 500),
        reasoningLen: trace?.reasoningText?.length ?? 0,
        responseModel: trace?.response?.modelId ?? null,
        usage: trace?.usage ?? null,
        latencyMs: Date.now() - attemptStart,
      });
```

**Copy/extend:** add `strategy`, `requestedMode`, `fallbackReason`, and provider/model capability data to this event payload.

---

### `backend/src/ai/structured-output-capabilities.ts` (utility/config, request-response + transform)

**Analog:** `backend/src/ai/provider-registry.ts`

**Provider identity and protocol pattern** (lines 10-19, 88-100):
```typescript
export type ProviderProtocol = "openai-compatible" | "anthropic-compatible";

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol?: ProviderProtocol;
}
```

```typescript
export function resolveProviderProtocol(config: ProviderConfig): ProviderProtocol {
  if (config.protocol) {
    return config.protocol;
  }

  const normalized = normalizeBaseUrl(config.baseUrl).toLowerCase();
  const isAnthropicCompatible =
    normalized.includes("/anthropic") ||
    normalized.includes("anthropic.com");

  return isAnthropicCompatible
    ? "anthropic-compatible"
    : "openai-compatible";
}
```

**Copy/extend:** capability keys should include `provider.id`, `provider.name`, normalized `baseUrl` family/protocol, `model`, and transport/protocol. Never key only by model name.

**Model-family helper pattern** (lines 37-64):
```typescript
function shouldForceReasoning(config: ProviderConfig): boolean {
  const haystack = `${config.name} ${config.model} ${config.baseUrl}`.toLowerCase();
  return /(glm-5|gpt-5|(^|[\s/_-])o[1345]($|[\s._-]))/.test(haystack);
}

function isGlmFamilyModel(config: ProviderConfig): boolean {
  const haystack = `${config.name} ${config.model} ${config.baseUrl}`.toLowerCase();
  return /\bglm\b/.test(haystack);
}
```

**Copy/extend:** capability resolver may use similar string classifiers, but planner should require tests because provider capability is not globally inferable.

---

### `backend/src/ai/structured-output-conformance.ts` (service/harness, batch + request-response)

**Analogs:** `backend/src/ai/test-connection.ts`, `backend/src/ai/provider-registry.ts`, `backend/src/lib/logger.ts`

**Probe result shape and latency pattern** (test-connection lines 5-35):
```typescript
export interface TestResult {
  success: boolean;
  latencyMs: number;
  model: string;
  error?: string;
}

export async function testProviderConnection(
  config: ProviderConfig
): Promise<TestResult> {
  const start = Date.now();
  try {
    const model = createModel(config);
    await generateText({
      model,
      prompt: "Respond with exactly one word: hello",
    });

    return {
      success: true,
      latencyMs: Date.now() - start,
      model: config.model,
    };
  } catch (error) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      model: config.model,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**Copy/extend:** conformance result should add `providerId`, `protocol`, `schemaId`, `mode`, `strategy`, `usage`, `repairUsed`, `semanticPass`, and `errorType`. Keep no campaign mutation.

**Structured log wrapper pattern** (logger lines 53-59):
```typescript
event: (eventName: string, d?: unknown) => {
  if (!roleGate("info")) return;
  child.info(
    { event: eventName, payload: serializePayload(d) },
    eventName,
  );
},
```

**Copy/extend:** emit compact conformance events through `createLogger`; do not print API keys, raw prompts, or secrets.

---

### `backend/src/ai/__tests__/generate-object-safe.test.ts` (test, request-response + transform)

**Analog:** `backend/src/ai/__tests__/generate-object-safe.test.ts`

**Vitest mock/import pattern** (lines 1-16):
```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  generateObject: vi.fn(),
}));

const {
  isSafeGenerateObjectError,
  safeGenerateObject,
} = await import("../generate-object-safe.js");
```

**Copy/extend:** add `Output.object` / native output mocks in this same hoisted style before importing `generate-object-safe.ts`.

**Trace metadata assertion pattern** (lines 50-102):
```typescript
mockGenerateText.mockResolvedValue({
  text: JSON.stringify({ hp: 5 }),
  reasoningText: "The answer is stable and does not require any repair.",
  usage: {
    inputTokens: 120,
    outputTokens: 18,
    totalTokens: 138,
    reasoningTokens: 44,
    cachedInputTokens: 12,
  },
  response: {
    id: "resp-123",
    modelId: "glm-5.1",
    timestamp: new Date("2026-04-22T07:00:00.000Z"),
  },
  providerMetadata: {
    openai: { cached: true },
  },
  finishReason: "stop",
});
```

**Copy/extend:** assert strategy/capability fields beside existing metadata.

**Observed Kimi/Mimo repair regression pattern** (lines 139-217):
```typescript
mockGenerateText
  .mockResolvedValueOnce({
    text: JSON.stringify({
      keyFacts: [
        "Tokyo Jujutsu High is a central Jujutsu Kaisen institution.",
        "Chakra mechanics are imported as the power-system overlay.",
      ],
      tonalNotes: ["Urban occult action"],
      citations: "jjk-world-structure: Tokyo Jujutsu High; naruto-power-system: chakra mechanics",
      canonicalNames: "Tokyo Jujutsu High, Kyoto Jujutsu High, Satoru Gojo, Naruto chakra",
    }),
  })
  .mockResolvedValueOnce({
    text: JSON.stringify({
      keyFacts: [
        "Tokyo Jujutsu High is a central Jujutsu Kaisen institution.",
        "Chakra mechanics are imported as the power-system overlay.",
      ],
      tonalNotes: ["Urban occult action"],
      citations: [
        { jobId: "jjk-world-structure", note: "Tokyo Jujutsu High institution context." },
        { jobId: "naruto-power-system", note: "Chakra mechanics context." },
      ],
      canonicalNames: {
        locations: ["Tokyo Jujutsu High", "Kyoto Jujutsu High"],
        factions: [],
        characters: ["Satoru Gojo"],
      },
    }),
    usage: {
      inputTokens: 250,
      outputTokens: 120,
      totalTokens: 370,
    },
  });
```

**Copy/extend:** keep this regression when adding native-first tests; add separate cases for native success and native failure -> text fallback.

---

### `backend/src/ai/__tests__/structured-output-conformance.test.ts` (test, batch + request-response)

**Analogs:** `backend/src/ai/__tests__/provider-registry.test.ts`, `backend/src/ai/__tests__/generate-object-safe.test.ts`

**Provider SDK mocking pattern** (provider-registry test lines 1-38):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelCreationOptions, ProviderConfig } from "../provider-registry.js";

const mockOpenAIChatFn = vi.fn();
const mockCreateOpenAI = vi.fn(() => ({ chat: mockOpenAIChatFn }));

const mockAnthropicModelFn = vi.fn();
const mockCreateAnthropic = vi.fn(() => mockAnthropicModelFn);

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mockCreateAnthropic,
}));
```

**Copy/extend:** conformance tests should mock providers and AI SDK output deterministically, not require live credentials.

**Protocol case table pattern** (provider-registry test lines 40-100):
```typescript
describe("resolveProviderProtocol", () => {
  it('returns explicit protocol when set to "openai-compatible"', () => {
    const config: ProviderConfig = {
      id: "test",
      name: "Test",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "key",
      model: "model",
      protocol: "openai-compatible",
    };

    expect(resolveProviderProtocol(config)).toBe("openai-compatible");
  });
```

**Copy/extend:** test conformance keys by provider/protocol/model/transport; include a no-secret assertion.

---

### `backend/src/ai/__tests__/structured-output-boundary.test.ts` (test, file-I/O + static inventory)

**Analog:** `backend/src/ai/__tests__/structured-output-boundary.test.ts`

**Filesystem scan pattern** (lines 1-20):
```typescript
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
```

**Boundary assertion pattern** (lines 22-47):
```typescript
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
```

**Copy/extend:** add static inventory for object-generation seams and allowed classifications. Keep tests source-based and deterministic.

---

### `backend/src/engine/scene-planner.ts` (service, request-response + transform)

**Analog:** `backend/src/engine/scene-planner.ts`

**Imports and ordering contract** (lines 1-24):
```typescript
import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { withRole } from "../lib/index.js";
import type { NarrativeOutcomeBounds } from "./combat-envelope.js";
import type { OracleResult } from "./oracle.js";
import type { SceneFrame } from "./scene-frame.js";
import {
  buildScenePlanContract,
  formatScenePlanValidationIssues,
  sanitizeScenePlanCandidate,
  scenePlanLooseSchema,
  scenePlanSchema,
  type ScenePlan,
} from "./scene-plan-schema.js";

export const SCENE_PLAN_TURN_ORDER = [
  "buildSceneFrame",
  "callOracle",
  "runScenePlanner",
  "validateScenePlan",
  "executeScenePlan",
  "buildNarratorPacket",
  "final narration",
] as const;
```

**Copy/extend:** semantic mapper must preserve this frame -> oracle -> plan -> validate -> execute -> packet -> narrate order.

**Current model-facing prompt pattern** (lines 47-56, 91-127):
```typescript
function buildDefaultScenePlannerSystem(): string {
  return [
    "You are the local Scene Planner of Record.",
    "Return one ScenePlan JSON object only. Do not write prose, dialogue, or markdown.",
    "Oracle result is separate and binding. Do not choose a new Oracle outcome tier.",
    "SceneFrame actor labels are readability labels only.",
    "All actor references in planned actions, responses, and facts must use SceneFrame actor IDs.",
    "Narrator facts must use backend references only. No summaries, descriptions, text, prose, or hidden fact bodies.",
    buildScenePlanContract(),
  ].join(" ");
}
```

```typescript
return [
  "SCENE FRAME",
  JSON.stringify(args.frame, null, 2),
  "",
  "ORACLE RESULT",
  JSON.stringify(oracleResult, null, 2),
  "",
  "ALLOWED ACTORS",
  formatActors(args.frame),
  "",
  "ALLOWED TOOLS",
  args.frame.allowedTools.length > 0
    ? args.frame.allowedTools.map((toolName) => `- ${toolName}`).join("\n")
    : "- none",
  "",
  "OUTCOME BOUNDS",
  args.outcomeBounds ? JSON.stringify(args.outcomeBounds, null, 2) : "- none",
  "",
  "RECENT CONVERSATION",
  formatRecentConversation(args.recentConversation),
  "",
  "USE ACTOR IDS",
  "Use only actorId/id values from ALLOWED ACTORS. Display names are labels only.",
  "",
  "NARRATOR FACT REFERENCES ONLY",
  "narratorFacts may contain only anchorEventId, eventIds, responseIds, actionIds, and toolResultRefs.",
  "",
  "SCENE PLAN TASK",
  `Player action: ${args.playerAction}`,
  "Interpret the player action, choose local actor responses, plan validated backend actions, and return references for the narrator packet.",
].join("\n");
```

**Replace direction:** semantic prompt should still enumerate allowed actors/tools, but stop asking for final backend UUID graph.

**Strict parse + repair pattern** (lines 140-159, 182-239):
```typescript
function strictParseScenePlan(candidate: unknown, frame: SceneFrame):
  | { success: true; plan: ScenePlan }
  | { success: false; issues: string } {
  try {
    const sanitized = sanitizeScenePlanCandidate(candidate, frame);
    const parsed = scenePlanSchema.safeParse(sanitized);
    if (parsed.success) {
      return { success: true, plan: parsed.data };
    }

    return {
      success: false,
      issues: formatScenePlanValidationIssues(parsed.error.issues),
    };
  } catch (error) {
    return {
      success: false,
      issues: formatUnknownValidationError(error),
    };
  }
}
```

```typescript
const result = await withRole("judge", () =>
  safeGenerateObject({
    model,
    schema: scenePlanLooseSchema,
    system,
    prompt,
    temperature: 0,
    maxOutputTokens: args.maxOutputTokens ?? 1400,
    retries: 1,
  }),
);
const parsed = strictParseScenePlan(result.object, args.frame);
if (parsed.success) {
  return parsed.plan;
}
```

**Copy/extend:** semantic output should map deterministically to strict `ScenePlan`, then use `scenePlanSchema.safeParse` as final authority.

---

### `backend/src/engine/scene-plan-schema.ts` (model/schema, transform + validation)

**Analog:** `backend/src/engine/scene-plan-schema.ts`

**Strict backend-owned schema pattern** (lines 1-13, 73-170, 188-213):
```typescript
import { z } from "zod";

import type { SceneFrame } from "./scene-frame.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";

export const SCENE_PLAN_ACTION_LIMIT = 8;
export const SCENE_PLAN_HIDDEN_RATIONALE_MAX = 280;
export const SCENE_PLAN_SUPPORT_RESPONSE_LIMIT = 2;
export const SCENE_PLAN_DEFERRED_HOOK_LIMIT = 4;

const backendIdSchema = z.string().uuid();
const boundedText = (max: number) => z.string().trim().min(1).max(max);
const looseReferenceSchema = z.string().trim().min(1).max(160);
```

```typescript
export const scenePlanActionSchema = z.discriminatedUnion("toolName", [
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("add_tag"),
      input: runtimeToolInputSchemas.add_tag,
    })
    .strict(),
```

```typescript
const narratorFactsSchema = z
  .object({
    anchorEventId: backendIdSchema,
    eventIds: z.array(backendIdSchema).max(12),
    responseIds: z.array(backendIdSchema).max(
      1 + SCENE_PLAN_SUPPORT_RESPONSE_LIMIT,
    ),
    actionIds: z.array(backendIdSchema).max(SCENE_PLAN_ACTION_LIMIT),
    toolResultRefs: z.array(toolResultRefSchema).max(SCENE_PLAN_ACTION_LIMIT),
  })
  .strict();
```

**Copy/keep:** final `ScenePlan` remains strict backend contract. Do not relax UUID/tool input schemas to satisfy model drift.

**Loose schema/sanitizer pattern** (lines 257-275, 363-428, 476-558):
```typescript
const looseScenePlanActionSchema = z
  .object({
    id: looseReferenceSchema.optional(),
    actionId: looseReferenceSchema.optional(),
    actorId: looseReferenceSchema.optional(),
    toolName: z.string().trim().min(1).max(80).optional(),
    tool: z.string().trim().min(1).max(80).optional(),
    tool_name: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    type: z.string().trim().min(1).max(80).optional(),
    actionType: z.string().trim().min(1).max(80).optional(),
    input: z.unknown().optional(),
    payload: z.unknown().optional(),
    args: z.unknown().optional(),
    arguments: z.unknown().optional(),
    parameters: z.unknown().optional(),
    toolInput: z.unknown().optional(),
  })
  .passthrough();
```

```typescript
function normalizeRuntimeToolName(value: string): RuntimeToolName | null {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  if (runtimeToolNameSet.has(normalized)) {
    return normalized as RuntimeToolName;
  }
```

```typescript
export function sanitizeScenePlanCandidate(
  candidate: unknown,
  frame: SceneFrame,
): LooseScenePlan {
  const loose = scenePlanLooseSchema.parse(trimUnknown(candidate));
  const forbiddenRefs = buildForbiddenReferenceSet(frame);
  const usedActionIds = new Set(
    loose.plannedActions
      .map(actionReferenceId)
      .filter(isBackendId),
  );
  const actionReferenceRewrites = new Map<string, string>();
  const plannedActions = loose.plannedActions.flatMap((action, index) => {
    const toolName = actionToolName(action);
    if (!toolName) {
      return [];
    }

    const rawActionId = actionReferenceId(action);
    const id = isBackendId(rawActionId)
      ? rawActionId
      : makeUniqueSyntheticActionId(index, usedActionIds);
```

**Replace direction:** new semantic schema should be simpler than this loose repair surface. Reuse sanitizer concepts only for compatibility bridge, not as primary contract.

**Contract text pattern** (lines 576-587):
```typescript
export function buildScenePlanContract(): string {
  return [
    "Return exactly one strict ScenePlan JSON object.",
    `plannedActions max ${SCENE_PLAN_ACTION_LIMIT}.`,
    `supportResponses max ${SCENE_PLAN_SUPPORT_RESPONSE_LIMIT}.`,
    `deferredHooks max ${SCENE_PLAN_DEFERRED_HOOK_LIMIT}.`,
    `hiddenRationale max ${SCENE_PLAN_HIDDEN_RATIONALE_MAX} characters.`,
    "Use actor IDs from SceneFrame roster fields, never display names.",
    `Allowed tools: ${runtimeToolNames.join(", ")}.`,
    "narratorFacts must contain reference IDs only: anchorEventId, eventIds, responseIds, actionIds, toolResultRefs.",
    `Do not include narratorFacts prose fields: ${narratorFactProseKeys.join(", ")}.`,
  ].join("\n");
}
```

**Replace direction:** semantic contract should say model chooses actor/tool/intent semantically; backend derives IDs/references.

---

### `backend/src/engine/semantic-scene-plan-schema.ts` (model/schema, transform + validation)

**Analog:** `backend/src/engine/scene-plan-schema.ts`

**Pattern to copy:** Zod schema module with exported constants/types and pure mapping helpers. Use imports from `scene-frame.ts` and `tool-schemas.ts` as needed, as in `scene-plan-schema.ts` lines 1-4.

**Specific constraints to copy:**
- bounded text helper from lines 11-13
- runtime tool names from lines 15-29
- strict final parse from `scenePlanSchema` lines 200-213
- deterministic allowed/forbidden actor filtering from `sanitizeScenePlanCandidate` lines 476-558

**Planner note:** this file has no exact model-facing semantic schema analog. Use `scene-plan-schema.ts` structure, but new schema must avoid backend-owned UUID requirements in model output.

---

### `backend/src/engine/__tests__/scene-planner.test.ts` (test, request-response + transform)

**Analog:** `backend/src/engine/__tests__/scene-planner.test.ts`

**Mock/import pattern** (lines 1-24):
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import { runScenePlanner } from "../scene-planner.js";
import {
  SCENE_PLAN_ACTION_LIMIT,
  SCENE_PLAN_DEFERRED_HOOK_LIMIT,
  SCENE_PLAN_HIDDEN_RATIONALE_MAX,
  SCENE_PLAN_SUPPORT_RESPONSE_LIMIT,
  buildScenePlanContract,
  formatScenePlanValidationIssues,
  sanitizeScenePlanCandidate,
  scenePlanLooseSchema,
  scenePlanSchema,
} from "../scene-plan-schema.js";
```

**Repairable candidate regression pattern** (lines 324-351):
```typescript
it("normalizes repairable plannedActions with payload and missing actorId before strict parse", () => {
  const payload = {
    text: "The player searches the plaza for a dessert vendor.",
    importance: 2,
    participants: ["Player"],
  };

  const sanitized = sanitizeScenePlanCandidate(
    {
      ...createValidPlan(),
      plannedActions: [
        {
          id: actionId,
          toolName: "logEvent",
          payload,
        },
      ],
    },
    createFrame(),
  );

  expect(sanitized.plannedActions[0]).toMatchObject({
    id: actionId,
    actorId: playerId,
    toolName: "log_event",
    input: payload,
  });
  expect(scenePlanSchema.safeParse(sanitized).success).toBe(true);
});
```

**Unsupported invented action pattern** (lines 424-449):
```typescript
it("drops unsupported model-invented plannedActions instead of failing loose schema parsing", () => {
  const sanitized = sanitizeScenePlanCandidate(
    {
      ...createValidPlan(),
      plannedActions: [
        {
          id: actionId,
          toolName: "search_environment",
          payload: {
            query: "parfait vendor",
          },
        },
      ],
      narratorFacts: {
        ...createValidPlan().narratorFacts,
        actionIds: [actionId],
        toolResultRefs: [{ actionId, toolName: "search_environment" }],
      },
    },
    createFrame(),
  );

  expect(sanitized.plannedActions).toEqual([]);
  expect(sanitized.narratorFacts.actionIds).toEqual([]);
  expect(sanitized.narratorFacts.toolResultRefs).toEqual([]);
  expect(scenePlanSchema.safeParse(sanitized).success).toBe(true);
});
```

**Planner-call assertion pattern** (lines 514-545):
```typescript
it("calls safeGenerateObject once on valid strict output with judge role and required prompt markers", async () => {
  vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(createValidPlan()));

  const result = await runScenePlanner({
    provider,
    frame: createFrame(),
    playerAction: "Ask the road warden what happened.",
    oracleResult: {
      outcome: "weak_hit",
      reasoning: "Contact is possible but not guaranteed.",
    },
  });

  expect(result).toEqual(createValidPlan());
  expect(createModel).toHaveBeenCalledWith(provider, { role: "judge" });
  expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  expect(safeGenerateObject).toHaveBeenCalledWith(
    expect.objectContaining({
      schema: scenePlanLooseSchema,
      temperature: 0,
      prompt: expect.stringContaining("SCENE FRAME"),
    }),
  );
```

**Copy/extend:** add semantic model output fixture, map to strict plan, and assert backend-generated IDs/actions/refs.

---

### `backend/src/engine/__tests__/scene-plan-validator.test.ts` (test, transform + validation)

**Analog:** `backend/src/engine/scene-plan-validator.ts`

**Validation issue taxonomy pattern** (validator lines 6-23):
```typescript
export type ScenePlanValidationIssueCode =
  | "unknown_actor"
  | "display_name_actor_reference"
  | "inactive_primary_actor"
  | "background_actor_action"
  | "hidden_actor_visible_fact"
  | "narrator_fact_prose"
  | "unsupported_tool"
  | "invalid_tool_input"
  | "tool_input_scope"
  | "outcome_contradiction"
  | "too_many_primary_scene_changers";

export interface ScenePlanValidationIssue {
  code: ScenePlanValidationIssueCode;
  path: string;
  message: string;
}
```

**Actor validation pattern** (validator lines 134-169):
```typescript
function pushActorIssue(
  issues: ScenePlanValidationIssue[],
  path: string,
  actorId: unknown,
  rosterIds: ReturnType<typeof collectRosterIds>,
  options: {
    requireActive?: boolean;
    requireSceneActionOwner?: boolean;
  } = {}
) {
  if (typeof actorId !== "string") {
    issues.push({
      code: "unknown_actor",
      path,
      message: `${path} must reference a SceneFrame actor ID.`,
    });
    return;
  }

  const normalized = actorId.trim().toLowerCase();
  if (rosterIds.displayNameToId.has(normalized)) {
    issues.push({
      code: "display_name_actor_reference",
      path,
      message: `${path} uses display name "${actorId}" instead of a SceneFrame actor ID.`,
    });
    return;
  }
```

**Copy/extend:** semantic mapper tests should expect existing validation errors when mapped strict plan uses display names, unknown actors, hidden refs, invalid tool input, or unsupported tools.

---

### `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts` (test, event-driven + request-response)

**Analog:** `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`

**Source-slice inspection pattern** (lines 1-39):
```typescript
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  SCENE_PLAN_ROLLBACK_STAGES,
  SCENE_PLAN_TURN_ORDER,
  SCENE_PLAN_VISIBLE_CRITICAL_PATH_EXCLUSIONS,
  runScenePlanner,
} from "../scene-planner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TURN_PROCESSOR_PATH = join(
  __dirname,
  "../turn-processor.ts",
);

function extractScenePlanPathSource(): string {
  const source = readTurnProcessorSource();
  const start = source.indexOf("async function* processTurnScenePlan");
  const end = source.indexOf("async function* processTurnLegacy", start);

  expect(start, "processTurnScenePlan exists").toBeGreaterThanOrEqual(0);
  expect(end, "processTurnLegacy follows ScenePlan path").toBeGreaterThan(start);

  return source.slice(start, end);
}
```

**Ordering assertion pattern** (lines 55-76, 111-136):
```typescript
it("pins canonical ScenePlan ordering before final narration", () => {
  expect(SCENE_PLAN_TURN_ORDER).toEqual([
    "buildSceneFrame",
    "callOracle",
    "runScenePlanner",
    "validateScenePlan",
    "executeScenePlan",
    "buildNarratorPacket",
    "final narration",
  ]);
```

```typescript
expectInOrder(source, [
  "buildSceneFrame",
  "callOracle",
  "runScenePlanner",
  "validateScenePlan",
  "executeScenePlan",
  "buildNarratorPacket",
  "assembleFinalNarrationPrompt",
  "runVisibleNarrationWithPacketGuard",
  "{ role: \"assistant\"",
  "yield { type: \"narrative\"",
]);
```

**Copy/extend:** if semantic mapper inserts a new function, update and test order explicitly before final narration.

---

### `backend/src/worldgen/research-artifact.ts` (model/schema, transform + validation)

**Analog:** `backend/src/worldgen/research-artifact.ts`

**Caps and preprocess pattern** (lines 12-26, 46-59, 61-89):
```typescript
const MAX_SEARCH_RESULTS = 48;

function cappedString(max: number) {
  return z.string().trim().min(1).max(max);
}

function externalSnippetString(max: number) {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      return value.trim().slice(0, max);
    },
    z.string().min(1).max(max),
  );
}
```

```typescript
const searchResultSchema = z.object({
  jobId: externalSnippetString(64),
  title: externalSnippetString(180),
  description: externalSnippetString(700),
  url: externalSnippetString(700),
});

const searchResultsSchema = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) return value;
    return value.slice(0, MAX_SEARCH_RESULTS);
  },
  z.array(searchResultSchema).max(MAX_SEARCH_RESULTS),
);
```

```typescript
const citationSchema = z.object({
  jobId: cappedString(64).optional(),
  url: cappedString(700).optional(),
  note: cappedString(300),
});

const canonicalNamesSchema = z.object({
  locations: z.array(cappedString(120)).max(40).optional(),
  factions: z.array(cappedString(120)).max(40).optional(),
  characters: z.array(cappedString(120)).max(40).optional(),
}).optional();
```

**Copy/keep:** deterministic caps stay in backend Zod/preprocess. Native structured output does not replace this.

**Parse + normalize pattern** (lines 134-187):
```typescript
export function normalizeWorldgenResearchArtifact(
  artifact: WorldgenResearchArtifactV2,
): WorldgenResearchArtifactV2 {
  return {
    version: 2,
    rawPremise: normalizeString(artifact.rawPremise),
    rawKnownIP: artifact.rawKnownIP == null ? artifact.rawKnownIP ?? null : normalizeString(artifact.rawKnownIP),
    researchBrief: {
      interpretationSummary: normalizeString(artifact.researchBrief.interpretationSummary),
      ambiguityNotes: normalizeStringList(artifact.researchBrief.ambiguityNotes),
      sourceUsageRules: artifact.researchBrief.sourceUsageRules.map((rule) => ({
```

```typescript
export function parseWorldgenResearchArtifact(value: unknown): WorldgenResearchArtifactV2 {
  return normalizeWorldgenResearchArtifact(worldgenResearchArtifactSchema.parse(value));
}
```

**Copy/keep:** parse before formatting or downstream use.

---

### `backend/src/worldgen/ip-researcher.ts` (service, request-response + external search)

**Analog:** `backend/src/worldgen/ip-researcher.ts`

**Structured output imports/schema reuse pattern** (lines 1-27, 65-70):
```typescript
import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import type {
  SearchProvider,
  IpResearchContext,
  WorldgenResearchArtifactV2,
  WorldgenResearchSearchJob,
  WorldgenResearchSearchResult,
} from "@worldforge/shared";
import { createModel } from "../ai/index.js";
```

```typescript
const researchArtifactBriefSchema = worldgenResearchArtifactSchema.pick({
  researchBrief: true,
});

const generatedResearchContextSchema = worldgenResearchArtifactSchema.shape.generatedContext;
```

**Copy/keep:** reuse artifact schema pieces instead of duplicating generated-context shapes.

**Two-step artifact generation pattern** (lines 498-552):
```typescript
const { object: briefObject } = await generateObject({
  model: createModel(role.provider),
  schema: researchArtifactBriefSchema,
  prompt: buildResearchArtifactBriefPrompt(req),
  temperature: 0.1,
  maxOutputTokens: clampTokens(role.maxTokens),
});

const cappedSearchJobs = dedupeSearchJobs(briefObject.researchBrief.searchJobs, maxJobs);
const researchBrief = {
  ...briefObject.researchBrief,
  searchJobs: cappedSearchJobs,
};
```

```typescript
const { object: generatedContext } = await generateObject({
  model: createModel(role.provider),
  schema: generatedResearchContextSchema,
  prompt: buildGeneratedContextPrompt(artifactForContext),
  temperature: 0.1,
  maxOutputTokens: clampTokens(role.maxTokens),
});

return parseWorldgenResearchArtifact({
  version: 2,
  rawPremise: req.premise,
  rawKnownIP,
  researchBrief,
  searchResults,
  generatedContext,
  provenance: {
    createdAt: new Date().toISOString(),
    model: role.provider.model,
    searchProvider: searchConfig.provider,
  },
});
```

**Copy/keep:** generated object is parsed into artifact after both model calls and search result cap/dedupe.

---

### `backend/src/worldgen/scaffold-steps/npcs-step.ts` (service, batch + request-response)

**Analog:** `backend/src/worldgen/scaffold-steps/npcs-step.ts`

**Artifact authority classification pattern** (lines 164-192, 194-256):
```typescript
function artifactHasCanonicalCharacter(
  artifact: NonNullable<GenerateScaffoldRequest["researchArtifact"]>,
  npcName: string,
): boolean {
  const names = artifact.generatedContext.canonicalNames?.characters ?? [];
  if (names.length === 0) return false;

  const canonicalKeys = new Set<string>();
  for (const name of names) {
    addNameKeys(canonicalKeys, name);
  }

  const npcKeys = new Set<string>();
  addNameKeys(npcKeys, npcName);
  for (const key of npcKeys) {
    if (canonicalKeys.has(key)) return true;
  }

  return false;
}
```

```typescript
if (artifactFranchise) {
  return {
    canonicalStatus: canonicalStatusFromContext(req, null, item.draft.identity.displayName),
    franchise: artifactFranchise,
    ipContext: null,
    premiseDivergence: null,
  };
}

if (req.researchArtifact) {
  return {
    canonicalStatus: "original",
    franchise: null,
    ipContext: null,
    premiseDivergence: null,
  };
}
```

**Copy/keep:** artifact-backed NPC dispatch must clear legacy `ipContext`/`premiseDivergence` for classification.

**Batch enrichment pattern** (lines 862-892):
```typescript
if (result.length > 0) {
  const ctx = {
    gen: req.role,
    campaign: {
      premise: refinedPremise,
      ipContext: effectiveIpContext,
      premiseDivergence: effectivePremiseDivergence,
    },
    settings: {
      research: req.research,
    } as IngestionContext["settings"],
    locationNames,
    factionNames,
  } as IngestionContext;

  const enrichedDrafts = await enrichNpcsBatch({
    items: result.map((npc) => ({
      draft: npc.draft!,
      tier: npc.tier ?? "supporting",
    })),
    buildClassification: (item) =>
      buildWorldgenNpcClassification(item, effectiveReq, effectiveIpContext),
    ctx,
  });
```

**Copy/keep:** regression tests should assert classification and context passed to `assessPowerStats`, not only final NPC fields.

---

### `backend/src/worldgen/__tests__/research-artifact.test.ts` (test, transform + validation)

**Analog:** `backend/src/worldgen/__tests__/research-artifact.test.ts`

**Artifact boundary test pattern** (lines 26-60):
```typescript
describe("WorldgenResearchArtifactV2", () => {
  it("validates and preserves the mixed-premise research artifact boundary", () => {
    const parsed = parseWorldgenResearchArtifact(jjkWithNarutoPowerSystemArtifact);

    expect(parsed.version).toBe(2);
    expect(parsed.rawPremise).toBe("Jujutsu Kaisen world with Naruto power system");
    expect(parsed.rawKnownIP).toBeNull();
    expect(parsed.researchBrief.interpretationSummary).toContain("Jujutsu Kaisen");
    expect(parsed.researchBrief.sourceUsageRules).toHaveLength(2);
    expect(parsed.researchBrief.searchJobs.map((job) => job.id)).toEqual([
      "jjk-world-structure",
      "naruto-power-system",
    ]);
```

**Caps regression pattern** (lines 62-98):
```typescript
it.each(oversizedArtifactCases)("rejects oversized artifacts: $name", ({ artifact }) => {
  expect(() => parseWorldgenResearchArtifact(artifact)).toThrow();
});

it("caps overlong external search snippets instead of rejecting the artifact", () => {
  const parsed = parseWorldgenResearchArtifact(makeArtifactWithOverlongSearchDescription());

  expect(parsed.searchResults[0]?.description).toHaveLength(700);
});

it("caps external search result count instead of rejecting provider overflow", () => {
  const parsed = parseWorldgenResearchArtifact(
    makeArtifactWith((artifact) => {
      artifact.searchResults = Array.from({ length: 49 }, (_, index) => ({
        jobId: "jjk-world-structure",
        title: `Result ${index}`,
        description: "Bounded test result.",
        url: `https://example.test/${index}`,
      }));
    }),
  );

  expect(parsed.searchResults).toHaveLength(48);
  expect(parsed.searchResults.at(-1)?.url).toBe("https://example.test/47");
});
```

**Copy/extend:** Phase 73 should add explicit overlong external metadata coverage here if any caps move.

---

### `backend/src/worldgen/__tests__/ip-researcher.test.ts` (test, request-response + mocked external I/O)

**Analog:** `backend/src/worldgen/__tests__/ip-researcher.test.ts`

**Mocking pattern** (lines 1-47):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return {
        ...actual,
        generateText: vi.fn(),
        generateObject: vi.fn(),
        stepCountIs: vi.fn((n: number) => `stepCountIs(${n})`),
    };
});

vi.mock("../../ai/generate-object-safe.js", () => ({
    safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/index.js", () => ({
    createModel: vi.fn(() => "mock-model"),
}));

vi.mock("../../lib/web-search.js", () => ({
    webSearch: vi.fn(),
}));
```

**Artifact generation mock pattern** (lines 105-133):
```typescript
function mockArtifactGeneration(artifact = cloneJjkNarutoArtifact()) {
    vi.mocked(safeGenerateObject)
        .mockResolvedValueOnce({
            object: {
                researchBrief: artifact.researchBrief,
            },
        } as never)
        .mockResolvedValueOnce({
            object: artifact.generatedContext,
        } as never);
    mockedWebSearch.mockImplementation(async (query: string) => {
        if (/Jujutsu Kaisen/i.test(query)) {
            return [
                {
                    title: "Jujutsu Kaisen institutions",
                    description: "Tokyo Jujutsu High coordinates sorcerer missions in modern Japan.",
                    url: "https://example.test/jjk-institutions",
                },
            ];
        }
```

**Copy/extend:** use two-call `safeGenerateObject` expectations for research brief and generated context; add strategy assertions through returned traces once `safeGenerateObject` exposes them.

---

### `backend/src/worldgen/__tests__/npcs-step.test.ts` (test, batch + request-response)

**Analog:** `backend/src/worldgen/__tests__/npcs-step.test.ts`

**Mocking and authority fixture pattern** (lines 1-63, 87-119):
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PowerStats } from "@worldforge/shared";

const mockGenerateObject = vi.fn();
const mockEnrichKnownIpWorldgenNpcDraft = vi.fn();
const mockAssessOriginalCharacterPowerStats = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));
```

```typescript
const pollutedMixedIpContext = {
  franchise: "Naruto and Jujutsu Kaisen",
  keyFacts: [
    "Tokyo Jujutsu High trains sorcerers in modern Japan.",
    "Naruto Uzumaki, Sasuke Uchiha, and Sakura Haruno shape shinobi politics.",
  ],
  tonalNotes: ["Urban occult action", "Shonen tactics"],
  canonicalNames: {
    locations: ["Tokyo Jujutsu High", "Hidden Leaf Village"],
    factions: ["Jujutsu Headquarters", "Akatsuki"],
    characters: [
      "Satoru Gojo",
      "Yuji Itadori",
      "Naruto Uzumaki",
      "Sasuke Uchiha",
      "Sakura Haruno",
    ],
  },
  source: "llm" as const,
};
```

**Known-IP dispatch regression pattern** (lines 693-781):
```typescript
it("routes artifact canonical NPCs to known-IP power enrichment when ipContext is null", async () => {
  queueNpcPlans(
    [
      {
        name: "Satoru Gojo",
        role: "Protects students while investigating the chakra-overlay anomaly.",
        locationName: "Tokyo Jujutsu High",
        factionName: "Jujutsu Headquarters",
      },
    ],
    [
      {
        name: "Campus Quartermaster",
        role: "Supplies students with field kits before curse incidents.",
        locationName: "Tokyo Jujutsu High",
        factionName: "Jujutsu Headquarters",
      },
    ],
  );
```

```typescript
expect(enrichKnownIpWorldgenNpcDraft).toHaveBeenCalledTimes(1);
expect(enrichKnownIpWorldgenNpcDraft).toHaveBeenCalledWith(
  expect.objectContaining({
    franchise: "Jujutsu Kaisen",
  }),
);
expect(assessOriginalCharacterPowerStats).toHaveBeenCalledTimes(1);
expect(result[0]?.draft?.identity.canonicalStatus).toBe("known_ip_canonical");
expect(result[0]?.draft?.powerStats?.attackPotency.tier).toBe("City");
expect(result[1]?.draft?.identity.canonicalStatus).toBe("original");
expect(result[1]?.draft?.powerStats?.attackPotency.tier).toBe("Human");
```

**No stale legacy context regression pattern** (lines 883-957):
```typescript
it("does not pass stale legacy context into prompts or assessPowerStats when artifact owns NPC dispatch", async () => {
  const stalePremiseDivergence = {
    mode: "diverged" as const,
    protagonistRole: {
      kind: "canonical" as const,
      interpretation: "replacement" as const,
      canonicalCharacterName: "Satoru Gojo",
      roleSummary: "A stale legacy cache claims Gojo is absent from this world.",
    },
    preservedCanonFacts: [],
    changedCanonFacts: ["Satoru Gojo should be absent."],
    currentStateDirectives: [
      "CURRENT WORLD-STATE DIRECTIVES: Remove Gojo from the present cast.",
    ],
    ambiguityNotes: [],
  };
```

```typescript
expect(gojoCall?.classification).toMatchObject({
  canonicalStatus: gojoCanonicalNpcPlanFixture.expectedCanonicalStatus,
  franchise: gojoCanonicalNpcPlanFixture.expectedFranchise,
  ipContext: null,
  premiseDivergence: null,
});
expect(gojoCall?.ctx.campaign.ipContext).toBeNull();
expect(gojoCall?.ctx.campaign.premiseDivergence).toBeNull();
```

**Copy/keep:** Phase 73 shared-boundary refactors must not regress Phase 72 artifact authority.

## Shared Patterns

### GitNexus Safety Gate

**Source:** `AGENTS.md`; GitNexus impact run 2026-04-27 after `npx gitnexus analyze`.

**Apply to:** all Phase 73 source edits.

- Before editing any function/class/method, run `gitnexus_impact({ target, direction: "upstream" })`.
- `safeGenerateObject` impact is **CRITICAL**: 18 impacted symbols, 13 direct callers, 4 affected execution flows, 5 modules.
- Direct callers include `runScenePlanner`, `runWorldBrainSceneDirection`, `executeOracleCall`, `runHiddenAdjudicationPlan`, `validateAndFixStage`, `validateCrossStage`, `regenerateLocationEntity`, `regenerateFactionEntity`, `regenerateNpcEntity`, `detectCandidateByClassifier`, and worldbook/script callers.
- Run `gitnexus_detect_changes({ scope: "all" })` before commit.
- CLI status after refresh: indexed/current at commit `5c779e7`; MCP context still cached stale warning, so use CLI status as freshness proof unless MCP server is restarted.

### Zod Remains Final Authority

**Source:** `backend/src/ai/generate-object-safe.ts`, `backend/src/worldgen/research-artifact.ts`, `backend/src/engine/scene-plan-schema.ts`

**Apply to:** native structured output, text fallback, conformance harness, ScenePlan mapper.

```typescript
parsed = coerceToSchema(parsed, opts.schema);
const repaired = opts.schema.safeParse(parsed);
if (!repaired.success) {
  log.warn(`safeGenerateObject repair still failed Zod validation: ${formatZodIssues(repaired.error)}`);
  return null;
}
```

```typescript
export function parseWorldgenResearchArtifact(value: unknown): WorldgenResearchArtifactV2 {
  return normalizeWorldgenResearchArtifact(worldgenResearchArtifactSchema.parse(value));
}
```

### Observable Structured Logging

**Source:** `backend/src/lib/logger.ts` lines 53-59; `backend/src/ai/generate-object-safe.ts` lines 691-715.

**Apply to:** strategy selection, fallback, repair, conformance reports.

```typescript
child.info(
  { event: eventName, payload: serializePayload(d) },
  eventName,
);
```

```typescript
log.event("llm.attempt", {
  attemptNum: attempt,
  model: modelId,
  success: true,
  reasoningLen: result.trace.reasoningText?.length ?? 0,
  responseModel: result.trace.response?.modelId ?? null,
  usage: result.trace.usage ?? null,
  latencyMs: Date.now() - attemptStart,
});
```

### Provider/Model Identity

**Source:** `backend/src/ai/provider-registry.ts` lines 10-19, 88-100, 103-143.

**Apply to:** capability cache/report keys and conformance result grouping.

```typescript
export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol?: ProviderProtocol;
}
```

```typescript
const provider = createOpenAI({
  baseURL,
  apiKey: config.apiKey || "ollama",
});

// Use Chat Completions API (not Responses API) for broad provider compatibility.
// The Responses API is OpenAI-specific and fails on OpenRouter, Ollama, etc.
const model = provider.chat(config.model);
```

### ScenePlan Deterministic Ownership

**Source:** `backend/src/engine/scene-plan-schema.ts`; `backend/src/engine/scene-planner.ts`.

**Apply to:** semantic ScenePlan contract and mapper.

```typescript
const backendIdSchema = z.string().uuid();
```

```typescript
export const scenePlanActionSchema = z.discriminatedUnion("toolName", [
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("add_tag"),
      input: runtimeToolInputSchemas.add_tag,
    })
    .strict(),
```

Planner should ensure model-facing semantic output maps into this strict shape, rather than weakening this strict backend contract.

### Worldgen Artifact Authority

**Source:** `backend/src/worldgen/research-artifact.ts`, `backend/src/worldgen/scaffold-steps/npcs-step.ts`, Phase 72 memory.

**Apply to:** worldgen regressions and conformance stress cases.

```typescript
if (artifactFranchise) {
  return {
    canonicalStatus: canonicalStatusFromContext(req, null, item.draft.identity.displayName),
    franchise: artifactFranchise,
    ipContext: null,
    premiseDivergence: null,
  };
}
```

### Test Commands

**Source:** `backend/vitest.config.ts`, `73-VALIDATION.md`.

```typescript
export default defineConfig({
  resolve: {
    alias: {
      "@worldforge/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

Use:

```bash
npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts
npm --prefix backend run test -- src/ai/__tests__/structured-output-boundary.test.ts
npm --prefix backend run test -- src/ai/__tests__/structured-output-conformance.test.ts
npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts
npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/worldgen/__tests__/npcs-step.test.ts
npm --prefix backend run typecheck
```

## No Exact Analog Found

| File | Role | Data Flow | Reason | Planner Fallback |
|------|------|-----------|--------|------------------|
| `backend/src/ai/structured-output-conformance.ts` | service/harness | batch, request-response | No existing structured-output conformance harness exists. | Combine `testProviderConnection` latency/result shape, `provider-registry` provider identity, `safeGenerateObject` trace fields, and Vitest mocked tests. |
| `backend/src/ai/__tests__/structured-output-conformance.test.ts` | test | batch, request-response | No existing conformance report test exists. | Copy provider SDK mocks from `provider-registry.test.ts` and object-generation mocks from `generate-object-safe.test.ts`. |
| `backend/src/engine/semantic-scene-plan-schema.ts` | model/schema | transform, validation | No semantic model-facing ScenePlan schema exists yet. | Copy schema-module style from `scene-plan-schema.ts`; keep strict `ScenePlan` as final backend authority. |

## Metadata

**Analog search scope:** `backend/src/ai`, `backend/src/engine`, `backend/src/worldgen`, `backend/vitest.config.ts`, `AGENTS.md`, `CLAUDE.md`, `.claude/skills`.

**Files scanned:** 140 files under AI/engine/worldgen plus project docs and phase docs.

**GitNexus:** `npx gitnexus analyze` ran because MCP context reported stale index. `npx gitnexus status` then reported current commit `5c779e7` and up-to-date index. MCP resource still showed cached stale warning.

**Impact facts captured:** `safeGenerateObject` upstream risk CRITICAL; `runScenePlanner` upstream risk LOW by GitNexus.

**Pattern extraction date:** 2026-04-27

