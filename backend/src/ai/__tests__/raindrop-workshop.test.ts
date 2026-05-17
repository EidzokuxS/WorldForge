import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  flush: vi.fn(),
  createRaindropAISDK: vi.fn(),
  wrapOptions: undefined as {
    buildEvent?: (messages: unknown[]) => unknown;
    context?: (input: { operation: string }) => unknown;
  } | undefined,
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mocks.generateText(...args),
}));

vi.mock("@raindrop-ai/ai-sdk", () => ({
  createRaindropAISDK: (...args: unknown[]) => mocks.createRaindropAISDK(...args),
}));

vi.mock("../../lib/logger-context.js", () => ({
  getTurnContext: vi.fn(() => ({
    campaignId: "campaign-1",
    role: "storyteller",
    tick: 7,
    turnId: "turn-1",
  })),
}));

async function importSubject() {
  vi.resetModules();
  mocks.wrapOptions = undefined;
  mocks.generateText.mockResolvedValue({ text: "ok" });
  mocks.flush.mockResolvedValue(undefined);
  mocks.createRaindropAISDK.mockReturnValue({
    wrap: (module: unknown, options: typeof mocks.wrapOptions) => {
      mocks.wrapOptions = options;
      return module;
    },
    flush: mocks.flush,
  });
  return import("../raindrop-workshop.js");
}

describe("raindrop Workshop telemetry privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    process.env.WORLDFORGE_RAINDROP_IN_TESTS = "1";
    delete process.env.RAINDROP_ENDPOINT;
    delete process.env.RAINDROP_LOCAL_DEBUGGER;
    delete process.env.RAINDROP_WRITE_KEY;
  });

  it("redacts trace and event payloads by default for remote write-key telemetry", async () => {
    process.env.RAINDROP_WRITE_KEY = "remote-key";
    const { generateText } = await importSubject();

    await generateText({
      model: "mock-model",
      prompt: "hidden prompt",
      experimental_telemetry: {
        recordInputs: true,
        recordOutputs: true,
        metadata: { keep: "metadata" },
      },
    } as never);

    const callOptions = mocks.generateText.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callOptions.experimental_telemetry).toMatchObject({
      isEnabled: true,
      recordInputs: false,
      recordOutputs: false,
      metadata: { payloadCapture: "redacted" },
    });

    const event = mocks.wrapOptions?.buildEvent?.([
      { role: "user", content: "hidden input" },
      { role: "assistant", content: "hidden output" },
    ]) as { input?: string; output?: string; properties?: Record<string, unknown> };
    expect(event.input).toBe("[redacted]");
    expect(event.output).toBe("[redacted]");
    expect(event.properties?.payloadCapture).toBe("redacted");

    const context = mocks.wrapOptions?.context?.({ operation: "generateText" }) as
      | {
        userId?: string;
        eventId?: string;
        convoId?: string;
        properties?: Record<string, unknown>;
      }
      | undefined;
    expect(context).toMatchObject({
      userId: "worldforge-redacted",
      eventId: undefined,
      convoId: undefined,
      properties: {
        campaignId: null,
        payloadCapture: "redacted",
        workshop: false,
      },
    });
    expect(mocks.flush).not.toHaveBeenCalled();
  });

  it("keeps full payload capture for explicit local Workshop debugging", async () => {
    process.env.RAINDROP_LOCAL_DEBUGGER = "http://localhost:5899/v1/";
    const { generateText } = await importSubject();

    await generateText({
      model: "mock-model",
      prompt: "visible local prompt",
    } as never);

    const callOptions = mocks.generateText.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callOptions.experimental_telemetry).toBeUndefined();

    const event = mocks.wrapOptions?.buildEvent?.([
      { role: "user", content: "visible local input" },
      { role: "assistant", content: "visible local output" },
    ]) as { input?: string; output?: string; properties?: Record<string, unknown> };
    expect(event.input).toBe("visible local input");
    expect(event.output).toBe("visible local output");
    expect(event.properties?.payloadCapture).toBe("local-workshop");

    const context = mocks.wrapOptions?.context?.({ operation: "generateText" }) as
      | {
        userId?: string;
        eventId?: string;
        convoId?: string;
        properties?: Record<string, unknown>;
      }
      | undefined;
    expect(context).toMatchObject({
      userId: "campaign:campaign-1",
      eventId: "turn-1",
      convoId: "campaign-1",
      properties: {
        campaignId: "campaign-1",
        payloadCapture: "local-workshop",
        workshop: true,
      },
    });
    expect(mocks.flush).toHaveBeenCalledTimes(1);
  });
});
