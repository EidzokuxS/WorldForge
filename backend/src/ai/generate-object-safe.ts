import { generateObject, generateText, type LanguageModel } from "ai";
import type { ZodType } from "zod";
import { createLogger } from "../lib/index.js";

const log = createLogger("generate-object-safe");

/**
 * Extract JSON from LLM response that may contain code fences or surrounding text.
 */
function extractJson(text: string): string {
  // Try stripping code fences first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) return fenceMatch[1]!.trim();

  // Try finding a JSON object or array in the text
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) return jsonMatch[1]!.trim();

  // Last resort: return trimmed text as-is
  return text.trim();
}

/**
 * Recursively coerce parsed JSON to match Zod schema expectations.
 * Handles: string → array (comma split), nested objects within arrays.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coerceToSchema(data: unknown, schema: ZodType<any>): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  const schemaType = def?.typeName ?? def?.type;

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

  // Array schema: if data is string, split by comma; if data is array, coerce each element
  if (schemaType === "ZodArray" || schemaType === "array") {
    if (typeof data === "string") {
      return data.split(/,\s*/).map(s => s.trim()).filter(Boolean);
    }
    if (Array.isArray(data)) {
      // Get element schema (Zod 3: _def.type is object, Zod 4: _def.element is object)
      const elementSchema = def.element ?? (typeof def.type === "object" ? def.type : undefined);
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
    const inner = def.in ?? def.innerType;
    if (inner) return coerceToSchema(data, inner);
  }

  // Effects schema (Zod 3 .transform()/.refine()): coerce against the inner schema
  if (schemaType === "ZodEffects" || schemaType === "effects") {
    const inner = def.schema ?? def.innerType;
    if (inner) return coerceToSchema(data, inner);
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
    const inner = def.innerType ?? (typeof def.type === "object" ? def.type : undefined);
    if (inner) return generateSchemaExample(inner, depth + 1);
    return null;
  }

  if (schemaType === "ZodDefault" || schemaType === "default") {
    // Return actual default value instead of unwrapping to inner type's example
    const defaultVal = def.defaultValue?.();
    if (defaultVal !== undefined) return defaultVal;
    const inner = def.innerType ?? (typeof def.type === "object" ? def.type : undefined);
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
    const inner = def.in ?? def.innerType;
    if (inner) return generateSchemaExample(inner, depth + 1);
  }

  // Effects schema (Zod 3 .transform()/.refine()): use inner schema for example
  if (schemaType === "ZodEffects" || schemaType === "effects") {
    const inner = def.schema ?? def.innerType;
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
  mode?: "json" | "tool";
  /** Override retry count (default 3). Set to 1 to disable retries. */
  retries?: number;
  [key: string]: unknown;
}

/**
 * Single attempt: generateText → extractJson → coerce → Zod parse.
 * Returns { object } on success, throws on failure.
 */
async function attemptGenerate<T>(opts: SafeGenerateOpts<T>): Promise<{ object: T }> {
  const { schema } = opts;
  const schemaHint = describeZodShape(schema);
  const jsonSuffix =
    "\n\nYou MUST respond with valid JSON only. No explanations, no markdown, no text before or after the JSON object." +
    (schemaHint ? `\n\nThe JSON object MUST have EXACTLY these fields (use these exact names):\n${schemaHint}` : "");

  const callOpts: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens ?? opts.maxTokens,
  };
  if (opts.system) {
    callOpts.system = opts.system + jsonSuffix;
  } else {
    callOpts.system = jsonSuffix.trim();
  }
  if (opts.messages) {
    callOpts.messages = opts.messages;
  } else {
    callOpts.prompt = opts.prompt;
  }

  const { text } = await generateText(
    callOpts as Parameters<typeof generateText>[0]
  );

  const cleaned = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`safeGenerateObject: invalid JSON. Raw: ${text.slice(0, 500)}`);
  }

  parsed = coerceToSchema(parsed, schema);

  const direct = schema.safeParse(parsed);
  if (direct.success) {
    return { object: direct.data as T };
  }

  // Try wrapping bare array
  if (Array.isArray(parsed)) {
    const shape = (schema as { shape?: Record<string, unknown> }).shape
      ?? (schema as { _def?: { shape?: () => Record<string, unknown> } })._def?.shape?.();
    if (shape) {
      for (const key of Object.keys(shape)) {
        const wrapped = { [key]: parsed };
        const retryWrapped = schema.safeParse(wrapped);
        if (retryWrapped.success) {
          log.warn(`Wrapped bare array into { ${key}: [...] }`);
          return { object: retryWrapped.data as T };
        }
      }
    }
  }

  const zodErrors = direct.error.issues.slice(0, 5).map(i =>
    `[${i.path.join(".")}] ${i.message}`
  ).join("; ");
  throw new Error(
    `safeGenerateObject: Zod validation failed.\nErrors: ${zodErrors}\nRaw (first 500 chars): ${cleaned.slice(0, 500)}`
  );
}

/**
 * Wrapper around Vercel AI SDK's generateObject that handles providers
 * which wrap JSON in markdown code fences (e.g., GLM via Z.AI).
 *
 * Uses generateText + manual JSON parse. Retries up to 3 times on failure
 * (invalid JSON or Zod validation errors) with a 2s delay between attempts.
 */
export async function safeGenerateObject<T>(opts: SafeGenerateOpts<T>): Promise<{ object: T }> {
  const maxAttempts = opts.retries ?? MAX_RETRIES;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await attemptGenerate(opts);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        log.warn(`safeGenerateObject attempt ${attempt}/${maxAttempts} failed, retrying in ${RETRY_DELAY_MS}ms: ${lastError.message.slice(0, 200)}`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  log.error(`safeGenerateObject failed after ${maxAttempts} attempts`);
  throw lastError;
}
