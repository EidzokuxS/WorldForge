import { afterEach, describe, expect, it } from "vitest";
import {
  GROK_CLI_MODEL_ID,
  startGrokCliLoopback,
  type GrokCliLoopbackServer,
  type GrokCliRunner,
} from "./grok-cli-loopback.js";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["status"],
  properties: { status: { const: "ok" } },
};

function runner(overrides: Partial<GrokCliRunner> = {}): GrokCliRunner {
  return {
    listModels: async () => ({ version: "grok 0.2.112", models: [GROK_CLI_MODEL_ID] }),
    complete: async ({ schema: requestedSchema }) => ({
      text: '{"status":"ok"}',
      structuredOutput: requestedSchema ? { status: "ok" } : undefined,
      stopReason: "EndTurn",
      usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
      modelUsage: { "grok-4.5-build": { modelCalls: 1 } },
    }),
    ...overrides,
  };
}

describe("Grok CLI loopback", () => {
  let loopback: GrokCliLoopbackServer | undefined;

  afterEach(async () => {
    await loopback?.close();
    loopback = undefined;
  });

  it("exposes only the proven model and translates a schema completion", async () => {
    loopback = await startGrokCliLoopback({ runner: runner() });
    const baseUrl = `http://127.0.0.1:${loopback.port}`;

    const models = await fetch(`${baseUrl}/v1/models`).then((response) => response.json());
    expect(models.data).toEqual([{ id: GROK_CLI_MODEL_ID, object: "model", owned_by: "grok-cli" }]);

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: GROK_CLI_MODEL_ID,
        messages: [{ role: "user", content: "return the object" }],
        response_format: { type: "json_schema", json_schema: { name: "diagnostic", schema } },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      model: GROK_CLI_MODEL_ID,
      choices: [{ message: { content: '{"status":"ok"}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      grok_cli: { stop_reason: "EndTurn", model_usage: { "grok-4.5-build": { modelCalls: 1 } } },
    });
  });

  it("fails closed for a wrong model without invoking the CLI", async () => {
    let calls = 0;
    loopback = await startGrokCliLoopback({
      runner: runner({ complete: async () => { calls += 1; throw new Error("unexpected"); } }),
    });

    const response = await fetch(`http://127.0.0.1:${loopback.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "grok-4.5-latest", messages: [{ role: "user", content: "x" }] }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { code: "unsupported_model" } });
    expect(calls).toBe(0);
  });

  it("fails closed when the CLI request is cancelled by the timeout", async () => {
    loopback = await startGrokCliLoopback({
      requestTimeoutMs: 1,
      runner: runner({
        complete: ({ signal }) => new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            const error = new Error("cancelled");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        }),
      }),
    });

    const response = await fetch(`http://127.0.0.1:${loopback.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: GROK_CLI_MODEL_ID, messages: [{ role: "user", content: "x" }] }),
    });

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ error: { code: "grok_cli_timeout" } });
  });
});
