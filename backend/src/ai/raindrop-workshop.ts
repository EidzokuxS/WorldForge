import * as ai from "ai";
import {
  createRaindropAISDK,
  type AISDKMessage,
  type EventBuilder,
  type RaindropAISDKClient,
} from "@raindrop-ai/ai-sdk";
import { getTurnContext } from "../lib/logger-context.js";

const DEFAULT_LOCAL_DEBUGGER_WRITE_KEY = "worldforge-local-debugger";
const MAX_EVENT_TEXT_CHARS = 8_000;
const REDACTED_EVENT_PAYLOAD = "[redacted]";
type GenerateTextArgs = Parameters<typeof ai.generateText>;
type StreamTextArgs = Parameters<typeof ai.streamText>;

function envFlagEnabled(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function raindropEndpoint(): string | undefined {
  const explicit = process.env.RAINDROP_ENDPOINT?.trim();
  if (explicit) return explicit;
  return process.env.RAINDROP_LOCAL_DEBUGGER?.trim() || undefined;
}

function raindropWriteKey(endpoint: string | undefined): string | undefined {
  const explicit = process.env.RAINDROP_WRITE_KEY?.trim();
  if (explicit) return explicit;
  return endpoint ? DEFAULT_LOCAL_DEBUGGER_WRITE_KEY : undefined;
}

function shouldEnableRaindrop(): boolean {
  if (process.env.NODE_ENV === "test" && !envFlagEnabled(process.env.WORLDFORGE_RAINDROP_IN_TESTS)) {
    return false;
  }
  return Boolean(raindropEndpoint() || process.env.RAINDROP_WRITE_KEY);
}

function isLocalRaindropEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint) return false;
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();
    return (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
      && (!url.port || url.port === "5899");
  } catch {
    return false;
  }
}

function shouldCaptureFullRaindropPayloads(): boolean {
  return isLocalRaindropEndpoint(raindropEndpoint());
}

function truncateText(text: string, maxChars = MAX_EVENT_TEXT_CHARS): string {
  return text.length <= maxChars
    ? text
    : `${text.slice(0, maxChars)}\n[truncated ${text.length - maxChars} chars]`;
}

function stringifyContent(content: unknown): string | undefined {
  if (typeof content === "string") return truncateText(content);
  if (content === undefined || content === null) return undefined;
  try {
    return truncateText(JSON.stringify(content));
  } catch {
    return truncateText(String(content));
  }
}

const buildEvent: EventBuilder = (messages: AISDKMessage[]) => {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const capturePayloads = shouldCaptureFullRaindropPayloads();
  return {
    input: capturePayloads ? stringifyContent(lastUser?.content) : REDACTED_EVENT_PAYLOAD,
    output: capturePayloads ? stringifyContent(lastAssistant?.content) : REDACTED_EVENT_PAYLOAD,
    properties: {
      messageCount: messages.length,
      hasToolMessages: messages.some((message) => message.role === "tool"),
      payloadCapture: capturePayloads ? "local-workshop" : "redacted",
    },
  };
};

function createRaindropClient(): RaindropAISDKClient | null {
  if (!shouldEnableRaindrop()) return null;

  const endpoint = raindropEndpoint();
  const writeKey = raindropWriteKey(endpoint);
  return createRaindropAISDK({
    writeKey,
    endpoint,
    traces: {
      debug: envFlagEnabled(process.env.RAINDROP_AI_DEBUG),
      debugSpans: envFlagEnabled(process.env.RAINDROP_AI_DEBUG_SPANS),
      flushIntervalMs: 500,
    },
    events: {
      debug: envFlagEnabled(process.env.RAINDROP_AI_DEBUG),
      partialFlushMs: 500,
    },
  });
}

export const raindropWorkshopClient = createRaindropClient();

const tracedAi = raindropWorkshopClient
  ? raindropWorkshopClient.wrap(ai, {
      context: ({ operation }) => {
        const turn = getTurnContext();
        const capturePayloads = shouldCaptureFullRaindropPayloads();
        return {
          userId: capturePayloads && turn?.campaignId
            ? `campaign:${turn.campaignId}`
            : "worldforge-redacted",
          eventId: capturePayloads ? turn?.turnId : undefined,
          convoId: capturePayloads ? turn?.campaignId : undefined,
          eventName: turn?.turnId ? "worldforge.player_turn" : "worldforge.llm_call",
          properties: {
            app: "WorldForge",
            surface: "backend",
            operation,
            role: turn?.role ?? null,
            campaignId: capturePayloads ? turn?.campaignId ?? null : null,
            tick: turn?.tick ?? null,
            payloadCapture: capturePayloads ? "local-workshop" : "redacted",
            workshop: capturePayloads,
          },
        };
      },
      buildEvent,
      autoAttachment: false,
    })
  : ai;

const wrappedGenerateText = tracedAi.generateText;
const wrappedStreamText = tracedAi.streamText;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withRaindropTelemetryPrivacy(args: GenerateTextArgs): GenerateTextArgs {
  if (!raindropWorkshopClient || shouldCaptureFullRaindropPayloads()) return args;

  const [options, ...rest] = args;
  if (!isRecord(options)) return args;

  const existingTelemetry = isRecord(options.experimental_telemetry)
    ? options.experimental_telemetry
    : {};
  const { metadata: _metadata, ...telemetryWithoutMetadata } = existingTelemetry;
  return [
    {
      ...options,
      experimental_telemetry: {
        ...telemetryWithoutMetadata,
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        metadata: {
          payloadCapture: "redacted",
        },
      },
    },
    ...rest,
  ] as GenerateTextArgs;
}

function withRaindropStreamTelemetryPrivacy(args: StreamTextArgs): StreamTextArgs {
  if (!raindropWorkshopClient || shouldCaptureFullRaindropPayloads()) return args;

  const [options, ...rest] = args;
  if (!isRecord(options)) return args;

  const existingTelemetry = isRecord(options.experimental_telemetry)
    ? options.experimental_telemetry
    : {};
  const { metadata: _metadata, ...telemetryWithoutMetadata } = existingTelemetry;
  return [
    {
      ...options,
      experimental_telemetry: {
        ...telemetryWithoutMetadata,
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        metadata: {
          payloadCapture: "redacted",
        },
      },
    },
    ...rest,
  ] as StreamTextArgs;
}

export const generateText: typeof ai.generateText = (async (
  ...args: GenerateTextArgs
) => {
  const result = await wrappedGenerateText(...withRaindropTelemetryPrivacy(args));
  if (shouldCaptureFullRaindropPayloads()) {
    await flushRaindropWorkshopTelemetry();
  }
  return result;
}) as typeof ai.generateText;

export const streamText: typeof ai.streamText = ((...args: StreamTextArgs) =>
  wrappedStreamText(...withRaindropStreamTelemetryPrivacy(args))) as typeof ai.streamText;

export async function flushRaindropWorkshopTelemetry(): Promise<void> {
  if (!raindropWorkshopClient) return;
  try {
    await raindropWorkshopClient.flush();
  } catch (error) {
    if (envFlagEnabled(process.env.RAINDROP_AI_DEBUG)) {
      console.warn(
        "[worldforge/raindrop] failed to flush telemetry",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
