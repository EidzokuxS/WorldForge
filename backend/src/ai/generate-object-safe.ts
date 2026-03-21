import { generateObject, generateText, type LanguageModel } from "ai";
import type { ZodType } from "zod";
import { createLogger } from "../lib/index.js";

const log = createLogger("generate-object-safe");

/**
 * Strip markdown code fences that some providers (GLM) wrap around JSON.
 */
function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
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
  const { schema, ...rest } = opts;

  // Attempt 1: standard generateObject
  try {
    const result = await generateObject({ ...rest, schema } as Parameters<typeof generateObject>[0]);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fallbackOpts: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens ?? opts.maxTokens,
  };
  if (opts.system) fallbackOpts.system = opts.system;
  if (opts.messages) {
    fallbackOpts.messages = opts.messages;
  } else {
    fallbackOpts.prompt = opts.prompt;
  }
  const { text } = await generateText(
    fallbackOpts as Parameters<typeof generateText>[0]
  );

  const cleaned = stripCodeFences(text);
  const object = schema.parse(JSON.parse(cleaned)) as T;
  return { object };
}
