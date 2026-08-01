import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";

export const GROK_CLI_MODEL_ID = "grok-4.5";

export interface GrokCliCompletion {
  text: string;
  structuredOutput?: unknown;
  stopReason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    reasoning_tokens?: number;
    total_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
}

export interface GrokCliRunner {
  listModels(signal: AbortSignal): Promise<{ version: string; models: string[] }>;
  complete(input: {
    prompt: string;
    model: string;
    schema?: unknown;
    signal: AbortSignal;
  }): Promise<GrokCliCompletion>;
}

export interface GrokCliLoopbackOptions {
  runner: GrokCliRunner;
  port?: number;
  requestTimeoutMs?: number;
}

export interface GrokCliLoopbackServer {
  server: Server;
  port: number;
  close(): Promise<void>;
}

class GrokCliRequestError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      const record = asRecord(part);
      return typeof record?.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function promptFromMessages(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    throw new GrokCliRequestError(400, "messages_required");
  }

  const lines = value.map((message) => {
    const record = asRecord(message);
    const role = typeof record?.role === "string" ? record.role : "user";
    const text = messageText(record?.content);
    if (!text) throw new GrokCliRequestError(400, "message_content_required");
    return `${role}: ${text}`;
  });

  return lines.join("\n\n");
}

function schemaFromResponseFormat(value: unknown): unknown | undefined {
  const format = asRecord(value);
  if (!format) return undefined;
  if (format.type === "json_object") return { type: "object" };
  if (format.type !== "json_schema") return undefined;

  const jsonSchema = asRecord(format.json_schema);
  if (!jsonSchema || !("schema" in jsonSchema)) {
    throw new GrokCliRequestError(400, "json_schema_required");
  }

  return jsonSchema.schema;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  try {
    const body = asRecord(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!body) throw new Error("body must be an object");
    return body;
  } catch {
    throw new GrokCliRequestError(400, "invalid_json_request");
  }
}

function withTimeout(timeoutMs: number, request: IncomingMessage): {
  signal: AbortSignal;
  dispose(): void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAborted = () => controller.abort();
  request.once("aborted", onAborted);

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      request.off("aborted", onAborted);
    },
  };
}

function completionResponse(model: string, completion: GrokCliCompletion): Record<string, unknown> {
  const content = completion.structuredOutput === undefined
    ? completion.text
    : JSON.stringify(completion.structuredOutput);

  return {
    id: `grok-cli-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: "assistant", content },
      finish_reason: completion.stopReason === "EndTurn" ? "stop" : completion.stopReason ?? "stop",
    }],
    usage: completion.usage ? {
      prompt_tokens: completion.usage.input_tokens ?? 0,
      completion_tokens: completion.usage.output_tokens ?? 0,
      total_tokens: completion.usage.total_tokens ?? 0,
    } : undefined,
    grok_cli: {
      stop_reason: completion.stopReason,
      reasoning_tokens: completion.usage?.reasoning_tokens,
      model_usage: completion.modelUsage,
    },
  };
}

export async function startGrokCliLoopback(
  options: GrokCliLoopbackOptions,
): Promise<GrokCliLoopbackServer> {
  const requestTimeoutMs = options.requestTimeoutMs ?? 90_000;
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
    throw new Error("requestTimeoutMs must be a positive integer");
  }

  const startupController = new AbortController();
  const available = await options.runner.listModels(startupController.signal);
  if (!available.models.includes(GROK_CLI_MODEL_ID)) {
    throw new Error(`Grok CLI does not expose ${GROK_CLI_MODEL_ID}`);
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/healthz") {
        writeJson(response, 200, {
          status: "ok",
          model: GROK_CLI_MODEL_ID,
          cliVersion: available.version,
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/models") {
        const requestControl = withTimeout(requestTimeoutMs, request);
        try {
          const models = await options.runner.listModels(requestControl.signal);
          if (!models.models.includes(GROK_CLI_MODEL_ID)) {
            throw new GrokCliRequestError(503, "required_model_unavailable");
          }
          writeJson(response, 200, {
            object: "list",
            data: [{ id: GROK_CLI_MODEL_ID, object: "model", owned_by: "grok-cli" }],
          });
        } finally {
          requestControl.dispose();
        }
        return;
      }

      if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
        writeJson(response, 404, { error: { code: "not_found" } });
        return;
      }

      const body = await readJsonBody(request);
      if (body.model !== GROK_CLI_MODEL_ID) {
        throw new GrokCliRequestError(400, "unsupported_model");
      }

      const requestControl = withTimeout(requestTimeoutMs, request);
      try {
        const schema = schemaFromResponseFormat(body.response_format);
        const completion = await options.runner.complete({
          prompt: promptFromMessages(body.messages),
          model: GROK_CLI_MODEL_ID,
          schema,
          signal: requestControl.signal,
        });
        if (schema !== undefined && completion.structuredOutput === undefined) {
          throw new GrokCliRequestError(502, "structured_output_missing");
        }
        writeJson(response, 200, completionResponse(GROK_CLI_MODEL_ID, completion));
      } finally {
        requestControl.dispose();
      }
    } catch (error) {
      if (response.writableEnded) return;
      if (error instanceof GrokCliRequestError) {
        writeJson(response, error.statusCode, { error: { code: error.code } });
        return;
      }
      if (error instanceof Error && error.name === "AbortError") {
        writeJson(response, 504, { error: { code: "grok_cli_timeout" } });
        return;
      }
      writeJson(response, 502, { error: { code: "grok_cli_unavailable" } });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Grok CLI loopback did not bind a TCP port");
  }

  return {
    server,
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

export function createGrokCliRunner(options: {
  executable: string;
  cwd: string;
}): GrokCliRunner {
  const invoke = (args: string[], signal: AbortSignal): Promise<string> => new Promise((resolve, reject) => {
    const child = spawn(options.executable, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const onAbort = () => child.kill();
    signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.once("error", (error) => reject(error));
    child.once("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) {
        const error = new Error("Grok CLI request timed out");
        error.name = "AbortError";
        reject(error);
        return;
      }
      if (code !== 0) {
        reject(new Error("Grok CLI request failed"));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });

  return {
    async listModels(signal) {
      const version = (await invoke(["version"], signal)).trim();
      const output = await invoke(["models"], signal);
      const models = [...output.matchAll(/^\s*\*?\s*([a-z0-9][a-z0-9._-]*)\s*(?:\(|$)/gim)]
        .map((match) => match[1]!)
        .filter((model) => model.startsWith("grok-"));
      return { version, models };
    },
    async complete(input) {
      const args = [
        "-p", input.prompt,
        "-m", input.model,
        "--output-format", "json",
        "--no-memory",
        "--no-subagents",
        "--max-turns", "1",
        "--permission-mode", "dontAsk",
        "--cwd", options.cwd,
      ];
      if (input.schema !== undefined) {
        args.push("--json-schema", JSON.stringify(input.schema));
      }
      const output = await invoke(args, input.signal);
      const parsed = asRecord(JSON.parse(output));
      if (!parsed || typeof parsed.text !== "string") {
        throw new Error("Grok CLI returned an invalid machine-readable response");
      }
      return {
        text: parsed.text,
        structuredOutput: parsed.structuredOutput,
        stopReason: typeof parsed.stopReason === "string" ? parsed.stopReason : undefined,
        usage: asRecord(parsed.usage) ?? undefined,
        modelUsage: asRecord(parsed.modelUsage) ?? undefined,
      };
    },
  };
}
