import { generateText } from "ai";
import { createModel } from "./provider-registry.js";
import type { ProviderConfig } from "./provider-registry.js";

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
