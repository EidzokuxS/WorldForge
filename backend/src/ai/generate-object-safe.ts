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
      if (elementSchema) {
        return data.map(item => coerceToSchema(item, elementSchema));
      }
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
    const inner = def.innerType ?? (typeof def.type === "object" ? def.type : undefined);
    if (inner) return generateSchemaExample(inner, depth + 1);
    return def.defaultValue?.() ?? null;
  }

  if (schemaType === "ZodUnion" || schemaType === "union") {
    const options = def.options;
    if (Array.isArray(options) && options.length > 0) {
      return generateSchemaExample(options[0], depth + 1);
    }
  }

  if (schemaType === "ZodEnum" || schemaType === "enum") {
    const values = def.values;
    if (Array.isArray(values) && values.length > 0) return values[0];
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

/**
 * Wrapper around Vercel AI SDK's generateObject that handles providers
 * which wrap JSON in markdown code fences (e.g., GLM via Z.AI).
 *
 * Tries generateObject first. If parsing fails, falls back to generateText
 * + manual JSON parse + Zod validation.
 */
export async function safeGenerateObject<T>(opts: {
  model: LanguageModel;
  schema: ZodType<T>;
  system?: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
  mode?: "json" | "tool";
  [key: string]: unknown;
}): Promise<{ object: T }> {
  const { schema, mode, ...rest } = opts;

  // Default to "json" mode — most OpenAI-compatible providers (GLM, Ollama, OpenRouter)
  // don't support tool-based structured outputs, causing 3-5s wasted per call.
  const resolvedMode = mode ?? "json";

  // Attempt 1: standard generateObject
  try {
    const result = await generateObject({ ...rest, schema, mode: resolvedMode } as Parameters<typeof generateObject>[0]);
    return { object: result.object as T };
  } catch (primaryError) {
    // Only fall back on parse errors, not network/auth errors
    const msg = String(primaryError);
    if (
      !msg.includes("could not parse") &&
      !msg.includes("No object generated")
    ) {
      throw primaryError;
    }

    log.warn(
      "generateObject failed to parse, falling back to generateText + manual parse"
    );
  }

  // Attempt 2: generateText + strip fences + Zod parse
  // Inject JSON instruction + schema shape so the model knows the exact field names.
  const schemaHint = describeZodShape(schema);
  const jsonSuffix =
    "\n\nIMPORTANT: You MUST respond with valid JSON only. No explanations, no markdown, no text before or after the JSON object." +
    (schemaHint ? `\n\nThe JSON object MUST have EXACTLY these fields (use these exact names):\n${schemaHint}` : "");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fallbackOpts: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens ?? opts.maxTokens,
  };
  if (opts.system) {
    fallbackOpts.system = opts.system + jsonSuffix;
  } else {
    fallbackOpts.system = jsonSuffix.trim();
  }
  if (opts.messages) {
    fallbackOpts.messages = opts.messages;
  } else {
    fallbackOpts.prompt = opts.prompt;
  }
  const { text } = await generateText(
    fallbackOpts as Parameters<typeof generateText>[0]
  );

  const cleaned = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`safeGenerateObject fallback: invalid JSON. Raw text: ${text.slice(0, 200)}`);
  }

  // Recursively coerce mismatched types to match schema expectations
  parsed = coerceToSchema(parsed, schema);

  // Try direct parse first
  const direct = schema.safeParse(parsed);
  if (direct.success) {
    return { object: direct.data as T };
  }

  // If model returned a bare array but schema expects { key: array }, try wrapping
  if (Array.isArray(parsed)) {
    // Try each possible wrapper key by introspecting the Zod schema shape
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

  // Last resort: throw with context
  throw new Error(
    `safeGenerateObject fallback: Zod validation failed. Errors: ${JSON.stringify(direct.error.issues.slice(0, 3))}. Raw: ${cleaned.slice(0, 200)}`
  );
}
