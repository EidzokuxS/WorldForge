import {
  generateText,
  NoObjectGeneratedError,
  Output,
  tool as defineTool,
  type LanguageModel,
} from "ai";
import type { ZodType } from "zod";
import { createLogger } from "../lib/index.js";
import { extractReasoningText } from "./extract-reasoning-text.js";
import {
  getStructuredOutputModelMetadata,
  resolveStructuredOutputCapability,
  type StructuredOutputCapabilityDecision,
  type StructuredOutputModelMetadata,
  type StructuredOutputPrimaryStrategy,
  type StructuredOutputRequestedMode,
  type StructuredOutputTraceStrategy,
} from "./structured-output-capabilities.js";

const log = createLogger("generate-object-safe");
const STRUCTURED_OUTPUT_TOOL_NAME = "structured_output";

/**
 * Phase 74 structured output repair policy.
 *
 * Repair may coerce syntax and shape, but must never invent semantic content.
 * Keep this text aligned with 74-REPAIR-POLICY.md because it is injected into
 * targeted repair prompts that run after schema validation fails.
 */
export const STRUCTURED_OUTPUT_REPAIR_POLICY = [
  "STRUCTURED_OUTPUT_CONTRACT: repair-policy.v1",
  "Repair may coerce object/list/string shape, field types, field names, known aliases, and invalid caps when the original output already contains the same meaning.",
  "Repair must never invent semantic lore, actions, targets, actor intent, quick action labels, source roles, canonical names, power facts, IDs, UUIDs, or new array elements with missing semantics.",
  "If required semantics are missing, fail closed instead of manufacturing placeholder truth.",
].join("\n");

export interface SafeGenerateTraceCapability {
  requestedMode: StructuredOutputRequestedMode;
  primaryStrategy: StructuredOutputPrimaryStrategy;
  fallbackStrategy: "text_fallback";
  actualMode: StructuredOutputPrimaryStrategy;
  reason: string;
  capabilityKey?: string;
  providerId?: string;
  providerName?: string;
  model?: string;
  protocol?: string;
  baseUrlFamily?: string;
  transport?: string;
}

export interface SafeGenerateTrace {
  text: string;
  cleanedText: string;
  requestedMode?: StructuredOutputRequestedMode;
  strategy?: StructuredOutputTraceStrategy;
  primaryStrategy?: StructuredOutputPrimaryStrategy;
  fallbackStrategy?: "text_fallback";
  fallbackReason?: string;
  capability?: SafeGenerateTraceCapability;
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
  repairedFromStrategy?: StructuredOutputTraceStrategy;
  repair?: SafeGenerateTrace & {
    issues: string;
  };
}

export interface SafeGenerateResult<T> {
  object: T;
  trace: SafeGenerateTrace;
}

class SafeGenerateError extends Error {
  readonly trace?: SafeGenerateTrace;

  constructor(message: string, trace?: SafeGenerateTrace) {
    super(message);
    this.name = "SafeGenerateError";
    this.trace = trace;
  }
}

export function isSafeGenerateObjectError(error: unknown): boolean {
  if (error instanceof SafeGenerateError) return true;
  if (!(error instanceof Error)) return false;

  return (
    error.message.startsWith("safeGenerateObject:")
    || error.message.includes("safeGenerateObject fallback: invalid JSON")
    || error.message.includes("safeGenerateObject fallback: Zod validation failed")
    || error.message.includes("safeGenerateObject native structured output")
    || error.message.includes("structured output")
    || error.message.includes("NoObjectGeneratedError")
    || error.message.includes("No object generated")
    || NoObjectGeneratedError.isInstance(error)
  );
}

/**
 * Extract JSON from LLM response that may contain code fences or surrounding text.
 */
function extractJson(text: string): string {
  // Try stripping code fences first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) return fenceMatch[1]!.trim();

  const balanced = findFirstParseableJson(text);
  if (balanced) return balanced;

  // Last resort: return trimmed text as-is
  return text.trim();
}

function findFirstParseableJson(text: string): string | null {
  for (let start = 0; start < text.length; start++) {
    const first = text[start];
    if (first !== "{" && first !== "[") continue;

    const candidate = readBalancedJsonCandidate(text, start);
    if (!candidate) continue;

    try {
      JSON.parse(candidate);
      return candidate.trim();
    } catch {
      // Keep scanning; prose can contain balanced non-JSON braces before the payload.
    }
  }

  return null;
}

function readBalancedJsonCandidate(text: string, start: number): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index]!;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const open = stack.pop();
      if ((char === "}" && open !== "{") || (char === "]" && open !== "[")) {
        return null;
      }

      if (stack.length === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function coerceObjectToString(data: unknown): unknown {
  if (typeof data === "string") {
    return data;
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return String(data);
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return data;
  }

  const record = data as Record<string, unknown>;
  const preferredKeys = [
    "name",
    "item",
    "label",
    "title",
    "value",
    "text",
    "content",
    "description",
  ];

  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const stringValues = Object.values(record)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  if (stringValues.length === 1) {
    return stringValues[0];
  }

  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSchemaType(schema: ZodType<any> | undefined): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)?._def;
  return def?.typeName ?? def?.type;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getArrayElementSchema(def: any): ZodType<any> | undefined {
  return def?.element ?? (typeof def?.type === "object" ? def.type : undefined);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getInnerSchema(def: any): ZodType<any> | undefined {
  return def?.innerType ?? def?.schema ?? def?.in ?? (typeof def?.type === "object" ? def.type : undefined);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRecordValueSchema(def: any): ZodType<any> | undefined {
  return def?.valueType ?? def?.valueSchema;
}

/**
 * Recursively coerce parsed JSON to match Zod schema expectations.
 * Handles: string → array (comma split), primitive → record value wrapper,
 * nested objects within arrays.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coerceToSchema(data: unknown, schema: ZodType<any>): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  const schemaType = getSchemaType(schema);

  if (
    schemaType === "ZodOptional" || schemaType === "optional" ||
    schemaType === "ZodNullable" || schemaType === "nullable" ||
    schemaType === "ZodDefault" || schemaType === "default" ||
    schemaType === "ZodCatch" || schemaType === "catch"
  ) {
    const inner = getInnerSchema(def);
    return inner ? coerceToSchema(data, inner) : data;
  }

  // Object schema: coerce each field
  if (schemaType === "ZodObject" || schemaType === "object") {
    if (typeof data !== "object" || data === null || Array.isArray(data)) return data;
    const shape = typeof def.shape === "function" ? def.shape() : def.shape;
    if (!shape) return data;

    const coerced = { ...data } as Record<string, unknown>;
    for (const [key, fieldSchema] of Object.entries(shape)) {
      if (coerced[key] !== undefined) {
        coerced[key] = coerceToSchema(coerced[key], fieldSchema as ZodType<unknown>);
      }
    }
    return coerced;
  }

  if (schemaType === "ZodRecord" || schemaType === "record") {
    const valueSchema = getRecordValueSchema(def);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return { value: data };
    }

    if (!valueSchema) return data;
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([key, value]) => [
        key,
        coerceToSchema(value, valueSchema),
      ]),
    );
  }

  // Array schema: if data is string, split by comma; if data is array, coerce each element
  if (schemaType === "ZodArray" || schemaType === "array") {
    const elementSchema = getArrayElementSchema(def);
    const elementType = getSchemaType(elementSchema);
    if (typeof data === "string") {
      if (elementType === "ZodString" || elementType === "string") {
        return data.split(/,\s*/).map(s => s.trim()).filter(Boolean);
      }
      return data;
    }
    if (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data)
    ) {
      const record = data as Record<string, unknown>;
      for (const key of ["items", "values", "data", "results", "entries"]) {
        if (Array.isArray(record[key])) {
          return coerceToSchema(record[key], schema);
        }
      }
    }
    if (Array.isArray(data)) {
      // Get element schema (Zod 3: _def.type is object, Zod 4: _def.element is object)
      let result = elementSchema
        ? data.map(item => coerceToSchema(item, elementSchema))
        : data;
      // Truncate to max_length if schema has a max constraint (Zod 4: checks[].{_zod.def})
      const checks: unknown[] | undefined = def.checks;
      if (Array.isArray(checks) && Array.isArray(result)) {
        for (const c of checks) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const checkDef = (c as any)?._zod?.def;
          if (checkDef?.check === "max_length" && typeof checkDef.maximum === "number") {
            if (result.length > checkDef.maximum) {
              result = result.slice(0, checkDef.maximum);
            }
          }
        }
      }
      // Zod 3: def.maxLength?.value
      if (typeof def.maxLength?.value === "number" && Array.isArray(result)) {
        if (result.length > def.maxLength.value) {
          result = result.slice(0, def.maxLength.value);
        }
      }
      return result;
    }
    return data;
  }

  // Union schema: try each option (Zod 3: _def.options, Zod 4: _def.options)
  if (schemaType === "ZodUnion" || schemaType === "union") {
    const options = def.options;
    if (Array.isArray(options)) {
      // Try first object option for coercion
      for (const opt of options) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const optType = (opt as any)?._def?.typeName ?? (opt as any)?._def?.type;
        if (optType === "ZodObject" || optType === "object") {
          return coerceToSchema(data, opt);
        }
      }
    }
  }

  // Enum schema: normalize human-readable strings to valid enum values
  // e.g. "Broken Connection" → "broken_reference", "CRITICAL" → "critical"
  if (schemaType === "ZodEnum" || schemaType === "enum") {
    // Zod 3: def.values is string[]. Zod 4: def.entries is Record<string, string>, no def.values.
    const values: string[] | undefined =
      def.values ?? (def.entries ? Object.keys(def.entries) : undefined);
    if (typeof data === "string" && Array.isArray(values)) {
      // Exact match
      if (values.includes(data)) return data;
      // Case-insensitive match
      const lower = data.toLowerCase();
      const ciMatch = values.find(v => v.toLowerCase() === lower);
      if (ciMatch) return ciMatch;
      // Normalize: lowercase + spaces/hyphens → underscores
      const normalized = lower.replace(/[\s-]+/g, "_");
      const normMatch = values.find(v => v === normalized);
      if (normMatch) return normMatch;
    }
    return data;
  }

  // Pipe schema (Zod 4 .transform()/.pipe()): coerce against the input schema
  if (schemaType === "ZodPipeline" || schemaType === "pipe") {
    const inner = getInnerSchema(def);
    if (inner) return coerceToSchema(data, inner);
  }

  // Effects schema (Zod 3 .transform()/.refine()): coerce against the inner schema
  if (schemaType === "ZodEffects" || schemaType === "effects") {
    const inner = getInnerSchema(def);
    if (inner) return coerceToSchema(data, inner);
  }

  if (schemaType === "ZodString" || schemaType === "string") {
    return coerceObjectToString(data);
  }

  return data;
}

/**
 * Generate a JSON example from a Zod schema to guide the LLM in the fallback path.
 * Produces a sample structure with placeholder values showing expected types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateSchemaExample(schema: ZodType<any>, depth = 0): unknown {
  if (depth > 8) return "...";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  const schemaType = def?.typeName ?? def?.type;
  const desc = def?.description ?? "";

  if (schemaType === "ZodObject" || schemaType === "object") {
    const shape = typeof def.shape === "function" ? def.shape() : def.shape;
    if (!shape) return {};
    const example: Record<string, unknown> = {};
    for (const [key, fieldSchema] of Object.entries(shape)) {
      example[key] = generateSchemaExample(fieldSchema as ZodType<unknown>, depth + 1);
    }
    return example;
  }

  if (schemaType === "ZodArray" || schemaType === "array") {
    // Preserve array-level description as the example element so the LLM sees field guidance
    if (desc) {
      return [desc];
    }
    // Zod 3: def.type is element schema; Zod 4: def.element is element schema, def.type is "array"
    const elementSchema = def.element ?? (typeof def.type === "object" ? def.type : undefined);
    if (elementSchema) {
      return [generateSchemaExample(elementSchema, depth + 1)];
    }
    return ["..."];
  }

  if (schemaType === "ZodString" || schemaType === "string") {
    return desc || "string value";
  }

  if (schemaType === "ZodNumber" || schemaType === "number") {
    return 0;
  }

  if (schemaType === "ZodBoolean" || schemaType === "boolean") {
    return false;
  }

  if (schemaType === "ZodNullable" || schemaType === "nullable") {
    const inner = getInnerSchema(def);
    if (inner) return generateSchemaExample(inner, depth + 1);
    return null;
  }

  if (schemaType === "ZodOptional" || schemaType === "optional") {
    const inner = getInnerSchema(def);
    if (inner) return generateSchemaExample(inner, depth + 1);
    return null;
  }

  if (schemaType === "ZodDefault" || schemaType === "default") {
    // Return actual default value instead of unwrapping to inner type's example
    const defaultVal =
      typeof def.defaultValue === "function"
        ? def.defaultValue()
        : def.defaultValue;
    if (defaultVal !== undefined) return defaultVal;
    const inner = getInnerSchema(def);
    if (inner) return generateSchemaExample(inner, depth + 1);
    return null;
  }

  if (schemaType === "ZodCatch" || schemaType === "catch") {
    const inner = getInnerSchema(def);
    if (inner) return generateSchemaExample(inner, depth + 1);
    return null;
  }

  if (schemaType === "ZodUnion" || schemaType === "union") {
    const options = def.options;
    if (Array.isArray(options) && options.length > 0) {
      return generateSchemaExample(options[0], depth + 1);
    }
  }

  if (schemaType === "ZodEnum" || schemaType === "enum") {
    // Zod 3: def.values is string[]. Zod 4: def.entries is Record<string, string>.
    const values = def.values ?? (def.entries ? Object.keys(def.entries) : undefined);
    if (Array.isArray(values) && values.length > 0) {
      // Show ALL valid values so LLM knows the exact options
      return values.join("|");
    }
  }

  // Pipe schema (Zod 4 .transform()/.pipe()): use input schema for example
  if (schemaType === "ZodPipeline" || schemaType === "pipe") {
    const inner = getInnerSchema(def);
    if (inner) return generateSchemaExample(inner, depth + 1);
  }

  // Effects schema (Zod 3 .transform()/.refine()): use inner schema for example
  if (schemaType === "ZodEffects" || schemaType === "effects") {
    const inner = getInnerSchema(def);
    if (inner) return generateSchemaExample(inner, depth + 1);
  }

  return desc || "value";
}

/**
 * Generate a compact schema hint string for the LLM fallback prompt.
 */
function describeZodShape(schema: ZodType<unknown>): string {
  try {
    const example = generateSchemaExample(schema);
    if (typeof example === "object" && example !== null) {
      return "Example JSON structure:\n```json\n" + JSON.stringify(example, null, 2) + "\n```";
    }
  } catch {
    // Fall through to empty string
  }
  return "";
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

interface SafeGenerateOpts<T> {
  model: LanguageModel;
  schema: ZodType<T>;
  system?: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
  timeout?: Parameters<typeof generateText>[0]["timeout"];
  mode?: StructuredOutputRequestedMode;
  /** Override retry count (default 3). Set to 1 to disable retries. */
  retries?: number;
  [key: string]: unknown;
}

interface StrategyContext {
  metadata?: StructuredOutputModelMetadata;
  capability: StructuredOutputCapabilityDecision;
}

function resolveRequestedMode(mode: SafeGenerateOpts<unknown>["mode"]): StructuredOutputRequestedMode {
  return mode ?? "auto";
}

function buildStrategyContext(opts: SafeGenerateOpts<unknown>): StrategyContext {
  const metadata = getStructuredOutputModelMetadata(opts.model);
  const capability = resolveStructuredOutputCapability({
    metadata,
    requestedMode: resolveRequestedMode(opts.mode),
  });

  return {
    metadata,
    capability,
  };
}

function toTraceCapability(
  context: StrategyContext,
): SafeGenerateTraceCapability {
  return {
    requestedMode: context.capability.requestedMode,
    primaryStrategy: context.capability.primaryStrategy,
    fallbackStrategy: context.capability.fallbackStrategy,
    actualMode: context.capability.actualMode,
    reason: context.capability.reason,
    capabilityKey: context.capability.capabilityKey,
    providerId: context.metadata?.providerId,
    providerName: context.metadata?.providerName,
    model: context.metadata?.model,
    protocol: context.metadata?.protocol,
    baseUrlFamily: context.metadata?.baseUrlFamily,
    transport: context.metadata?.transport,
  };
}

function applyStrategyTrace(
  trace: SafeGenerateTrace,
  context: StrategyContext,
  strategy: StructuredOutputTraceStrategy,
  fallbackReason?: string,
): SafeGenerateTrace {
  return {
    ...trace,
    requestedMode: context.capability.requestedMode,
    strategy,
    primaryStrategy: context.capability.primaryStrategy,
    fallbackStrategy: context.capability.fallbackStrategy,
    fallbackReason,
    capability: toTraceCapability(context),
  };
}

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

function formatZodIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues.slice(0, 8).map(i =>
    `[${i.path.map(String).join(".")}] ${i.message}`
  ).join("; ");
}

function buildRepairPrompt(invalidJson: string, issues: string, schemaHint: string): string {
  return `Repair this model JSON output so it satisfies the expected schema.

${STRUCTURED_OUTPUT_REPAIR_POLICY}

Rules:
- Preserve the original meaning and facts whenever possible.
- Change only structure, field types, field names, and invalid caps needed to satisfy validation.
- Do not invent new lore, actions, targets, actor intent, quick action labels, source roles, canonical names, power facts, IDs, UUIDs, or new array elements with missing semantics.
- If an optional field cannot be repaired from the output, omit it.
- If a field named "citations" is present and the schema expects citation objects, return an array of objects, not strings.
- If a field named "canonicalNames" is present, return an object with locations/factions/characters arrays when those names can be classified.
- If required semantic content is absent, fail closed by leaving the output invalid rather than creating missing content.
- Output valid JSON only. No markdown. No explanation.

Validation errors:
${issues}

Expected schema:
${schemaHint || "(schema example unavailable)"}

Invalid output:
${invalidJson.slice(0, 24000)}`;
}

async function attemptRepair<T>(
  opts: SafeGenerateOpts<T>,
  invalidJson: string,
  issues: string,
  originalTrace: SafeGenerateTrace,
  schemaHint: string,
): Promise<SafeGenerateResult<T> | null> {
  const repairContext: StrategyContext = {
    metadata: getStructuredOutputModelMetadata(opts.model),
    capability: {
      requestedMode: originalTrace.requestedMode ?? resolveRequestedMode(opts.mode),
      primaryStrategy: originalTrace.primaryStrategy ?? "text_fallback",
      fallbackStrategy: originalTrace.fallbackStrategy ?? "text_fallback",
      actualMode: originalTrace.primaryStrategy ?? "text_fallback",
      reason: originalTrace.capability?.reason ?? "Repairing schema-invalid generated output.",
      capabilityKey: originalTrace.capability?.capabilityKey,
    },
  };
  const result = await generateText({
    model: opts.model,
    temperature: 0,
    maxOutputTokens: opts.maxOutputTokens ?? opts.maxTokens,
    timeout: opts.timeout,
    system: "You repair invalid JSON into schema-valid JSON. Return JSON only.",
    prompt: buildRepairPrompt(invalidJson, issues, schemaHint),
  });

  const cleaned = extractJson(result.text);
  const repairTrace = applyStrategyTrace(
    toTraceFromGenerateTextResult(result, cleaned),
    repairContext,
    "repair",
    originalTrace.fallbackReason,
  );
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

  log.event("llm.repair", {
    strategy: "repair",
    primaryStrategy: repairTrace.primaryStrategy ?? null,
    fallbackStrategy: repairTrace.fallbackStrategy ?? null,
    fallbackReason: repairTrace.fallbackReason ?? null,
    success: true,
    issues,
    reasoningLen: repairTrace.reasoningText?.length ?? 0,
    responseModel: repairTrace.response?.modelId ?? null,
    usage: repairTrace.usage ?? null,
  });

  return {
    object: repaired.data as T,
    trace: {
      ...originalTrace,
      strategy: "repair",
      ...(originalTrace.strategy ? { repairedFromStrategy: originalTrace.strategy } : {}),
      cleanedText: JSON.stringify(repaired.data),
      repair: {
        ...repairTrace,
        issues,
      },
    },
  };
}

function buildBaseCallOpts<T>(opts: SafeGenerateOpts<T>): Record<string, unknown> {
  const callOpts: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens ?? opts.maxTokens,
  };
  if (opts.timeout !== undefined) {
    callOpts.timeout = opts.timeout;
  }
  return callOpts;
}

function applyPromptOptions<T>(
  callOpts: Record<string, unknown>,
  opts: SafeGenerateOpts<T>,
): void {
  if (opts.messages) {
    callOpts.messages = opts.messages;
  } else {
    callOpts.prompt = opts.prompt;
  }
}

function formatNativeFailureReason(error: unknown): string {
  if (NoObjectGeneratedError.isInstance(error)) {
    return `NoObjectGeneratedError: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function formatToolFailureReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function parseWithSchema<T>(
  parsed: unknown,
  schema: ZodType<T>,
  trace: SafeGenerateTrace,
): SafeGenerateResult<T> | null {
  const direct = schema.safeParse(parsed);
  if (direct.success) {
    return { object: direct.data as T, trace };
  }

  if (Array.isArray(parsed)) {
    const shape = (schema as { shape?: Record<string, unknown> }).shape
      ?? (schema as { _def?: { shape?: () => Record<string, unknown> } })._def?.shape?.();
    if (shape) {
      for (const key of Object.keys(shape)) {
        const wrapped = { [key]: parsed };
        const retryWrapped = schema.safeParse(wrapped);
        if (retryWrapped.success) {
          log.warn(`Wrapped bare array into { ${key}: [...] }`);
          return { object: retryWrapped.data as T, trace };
        }
      }
    }
  }

  return null;
}

function extractStructuredOutputToolInput(result: Awaited<ReturnType<typeof generateText>>): unknown {
  const toolCalls = (result as {
    toolCalls?: Array<{
      toolName?: string;
      input?: unknown;
      invalid?: boolean;
    }>;
  }).toolCalls ?? [];
  const toolCall = toolCalls.find((call) => (
    call.toolName === STRUCTURED_OUTPUT_TOOL_NAME &&
    !call.invalid
  ));

  return toolCall?.input;
}

/**
 * Single text fallback attempt: generateText → extractJson → coerce → Zod parse.
 * Returns { object } on success, throws on failure.
 */
async function attemptTextFallbackGenerate<T>(
  opts: SafeGenerateOpts<T>,
  schemaHint: string,
  context: StrategyContext,
  fallbackReason?: string,
): Promise<SafeGenerateResult<T>> {
  const { schema } = opts;
  const jsonSuffix =
    "\n\nYou MUST respond with valid JSON only. No explanations, no markdown, no text before or after the JSON object." +
    (schemaHint ? `\n\nThe JSON object MUST have EXACTLY these fields (use these exact names):\n${schemaHint}` : "");

  const callOpts = buildBaseCallOpts(opts);
  if (opts.system) {
    callOpts.system = opts.system + jsonSuffix;
  } else {
    callOpts.system = jsonSuffix.trim();
  }
  applyPromptOptions(callOpts, opts);

  const result = await generateText(
    callOpts as Parameters<typeof generateText>[0]
  );

  const cleaned = extractJson(result.text);
  const trace = applyStrategyTrace(
    toTraceFromGenerateTextResult(result, cleaned),
    context,
    "text_fallback",
    fallbackReason,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const issues = `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`;
    const repaired = await attemptRepair(opts, result.text, issues, trace, schemaHint);
    if (repaired) return repaired;
    throw new SafeGenerateError(
      `safeGenerateObject: invalid JSON. Raw: ${result.text.slice(0, 500)}`,
      trace,
    );
  }

  parsed = coerceToSchema(parsed, schema);

  const valid = parseWithSchema(parsed, schema, trace);
  if (valid) return valid;

  const direct = schema.safeParse(parsed);
  const zodErrors = direct.success ? "" : formatZodIssues(direct.error);
  const repaired = await attemptRepair(opts, cleaned, zodErrors, trace, schemaHint);
  if (repaired) return repaired;

  throw new SafeGenerateError(
    `safeGenerateObject: Zod validation failed.\nErrors: ${zodErrors}\nRaw (first 500 chars): ${cleaned.slice(0, 500)}`,
    trace,
  );
}

async function attemptNativeStructuredGenerate<T>(
  opts: SafeGenerateOpts<T>,
  context: StrategyContext,
): Promise<SafeGenerateResult<T>> {
  const callOpts = buildBaseCallOpts(opts);
  if (opts.system) {
    callOpts.system = opts.system;
  }
  applyPromptOptions(callOpts, opts);
  callOpts.output = Output.object({
    schema: opts.schema as never,
  });

  const result = await generateText(
    callOpts as Parameters<typeof generateText>[0]
  );
  const trace = applyStrategyTrace(
    toTraceFromGenerateTextResult(result, result.text),
    context,
    "native_schema",
  );
  const parsed = coerceToSchema(
    (result as { output?: unknown }).output,
    opts.schema,
  );
  const valid = parseWithSchema(parsed, opts.schema, trace);
  if (valid) return valid;

  const direct = opts.schema.safeParse(parsed);
  const zodErrors = direct.success ? "" : formatZodIssues(direct.error);
  throw new SafeGenerateError(
    `safeGenerateObject native structured output: Zod validation failed.\nErrors: ${zodErrors}`,
    trace,
  );
}

async function attemptNativeJsonGenerate<T>(
  opts: SafeGenerateOpts<T>,
  schemaHint: string,
  context: StrategyContext,
): Promise<SafeGenerateResult<T>> {
  const callOpts = buildBaseCallOpts(opts);
  const jsonSystemSuffix = [
    "Return a single valid JSON object only. Do not include markdown or prose.",
    schemaHint ? `Expected JSON shape:\n${schemaHint}` : "",
  ].filter(Boolean).join("\n\n");
  callOpts.system = opts.system
    ? `${opts.system}\n\n${jsonSystemSuffix}`
    : jsonSystemSuffix;
  applyPromptOptions(callOpts, opts);
  callOpts.output = Output.json();

  const result = await generateText(
    callOpts as Parameters<typeof generateText>[0]
  );
  const trace = applyStrategyTrace(
    toTraceFromGenerateTextResult(result, result.text),
    context,
    "native_json",
  );
  const rawOutput = (result as { output?: unknown }).output;
  const parsed = coerceToSchema(rawOutput, opts.schema);
  const valid = parseWithSchema(parsed, opts.schema, trace);
  if (valid) return valid;

  const direct = opts.schema.safeParse(parsed);
  const zodErrors = direct.success ? "" : formatZodIssues(direct.error);
  const repaired = await attemptRepair(
    opts,
    JSON.stringify(rawOutput),
    zodErrors,
    trace,
    schemaHint,
  );
  if (repaired) return repaired;

  throw new SafeGenerateError(
    `safeGenerateObject native JSON output: Zod validation failed.\nErrors: ${zodErrors}`,
    trace,
  );
}

async function attemptToolModeGenerate<T>(
  opts: SafeGenerateOpts<T>,
  schemaHint: string,
  context: StrategyContext,
): Promise<SafeGenerateResult<T>> {
  const callOpts = buildBaseCallOpts(opts);
  const toolSystemSuffix = [
    `Call the ${STRUCTURED_OUTPUT_TOOL_NAME} tool exactly once with schema-valid arguments for the requested object.`,
    "Do not answer in prose.",
    schemaHint ? `Expected schema shape:\n${schemaHint}` : "",
  ].filter(Boolean).join("\n\n");

  callOpts.system = opts.system
    ? `${opts.system}\n\n${toolSystemSuffix}`
    : toolSystemSuffix;
  applyPromptOptions(callOpts, opts);
  callOpts.tools = {
    [STRUCTURED_OUTPUT_TOOL_NAME]: defineTool({
      description: "Return the schema-valid structured output object.",
      inputSchema: opts.schema as never,
      strict: true,
    }),
  };
  callOpts.toolChoice = {
    type: "tool",
    toolName: STRUCTURED_OUTPUT_TOOL_NAME,
  };

  const result = await generateText(
    callOpts as Parameters<typeof generateText>[0]
  );
  const trace = applyStrategyTrace(
    toTraceFromGenerateTextResult(result, ""),
    context,
    "tool_mode",
  );
  const toolInput = extractStructuredOutputToolInput(result);
  if (toolInput === undefined) {
    throw new SafeGenerateError(
      `safeGenerateObject tool mode: ${STRUCTURED_OUTPUT_TOOL_NAME} tool call was not generated`,
      trace,
    );
  }

  const parsed = coerceToSchema(toolInput, opts.schema);
  const valid = parseWithSchema(parsed, opts.schema, trace);
  if (valid) return valid;

  const direct = opts.schema.safeParse(parsed);
  const zodErrors = direct.success ? "" : formatZodIssues(direct.error);
  const repaired = await attemptRepair(opts, JSON.stringify(toolInput), zodErrors, trace, schemaHint);
  if (repaired) return repaired;

  throw new SafeGenerateError(
    `safeGenerateObject tool mode: Zod validation failed.\nErrors: ${zodErrors}`,
    trace,
  );
}

/**
 * Single attempt: native structured output when available, then explicit text fallback.
 */
async function attemptGenerate<T>(opts: SafeGenerateOpts<T>): Promise<SafeGenerateResult<T>> {
  const schemaHint = describeZodShape(opts.schema);
  const context = buildStrategyContext(opts);

  if (context.capability.primaryStrategy === "native_schema") {
    try {
      return await attemptNativeStructuredGenerate(opts, context);
    } catch (err) {
      const fallbackReason = formatNativeFailureReason(err);
      return attemptTextFallbackGenerate(opts, schemaHint, context, fallbackReason);
    }
  }

  if (context.capability.primaryStrategy === "native_json") {
    try {
      return await attemptNativeJsonGenerate(opts, schemaHint, context);
    } catch (err) {
      return attemptTextFallbackGenerate(
        opts,
        schemaHint,
        context,
        `native_json failed: ${formatNativeFailureReason(err)}`,
      );
    }
  }

  if (context.capability.primaryStrategy === "tool_mode") {
    try {
      return await attemptToolModeGenerate(opts, schemaHint, context);
    } catch (err) {
      return attemptTextFallbackGenerate(
        opts,
        schemaHint,
        context,
        `tool_mode failed: ${formatToolFailureReason(err)}`,
      );
    }
  }

  const fallbackReason =
    context.capability.primaryStrategy === "text_fallback"
      ? undefined
      : `${context.capability.primaryStrategy} is not implemented for safeGenerateObject; using explicit text fallback.`;

  return attemptTextFallbackGenerate(opts, schemaHint, context, fallbackReason);
}

function describeModel(model: unknown): string | null {
  if (!model || typeof model !== "object") return null;
  const rec = model as Record<string, unknown>;
  const modelId = rec.modelId ?? rec.model ?? rec.id;
  return typeof modelId === "string" ? modelId : null;
}

/**
 * Wrapper around Vercel AI SDK's generateObject that handles providers
 * which wrap JSON in markdown code fences (e.g., GLM via Z.AI).
 *
 * Uses generateText + manual JSON parse. Retries up to 3 times on failure
 * (invalid JSON or Zod validation errors) with a 2s delay between attempts.
 */
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
        strategy: result.trace.strategy ?? null,
        primaryStrategy: result.trace.primaryStrategy ?? null,
        fallbackStrategy: result.trace.fallbackStrategy ?? null,
        fallbackReason: result.trace.fallbackReason ?? null,
        capability: result.trace.capability ?? null,
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
        strategy: "full_retry",
        primaryStrategy: trace?.primaryStrategy ?? null,
        fallbackStrategy: trace?.fallbackStrategy ?? null,
        fallbackReason: trace?.fallbackReason ?? null,
        capability: trace?.capability ?? null,
        error: lastError.message.slice(0, 500),
        reasoningLen: trace?.reasoningText?.length ?? 0,
        responseModel: trace?.response?.modelId ?? null,
        usage: trace?.usage ?? null,
        latencyMs: Date.now() - attemptStart,
      });
      if (attempt < maxAttempts) {
        log.warn(`safeGenerateObject attempt ${attempt}/${maxAttempts} failed, retrying in ${RETRY_DELAY_MS}ms: ${lastError.message.slice(0, 200)}`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  log.error(`safeGenerateObject failed after ${maxAttempts} attempts`);
  if (lastError instanceof SafeGenerateError) {
    throw new SafeGenerateError(
      `safeGenerateObject: full_retry exhausted. ${lastError.message}`,
      lastError.trace
        ? {
            ...lastError.trace,
            strategy: "full_retry",
          }
        : undefined,
    );
  }
  throw lastError;
}
