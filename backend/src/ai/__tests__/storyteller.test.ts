import { describe, it, expect, vi } from "vitest";

vi.mock("ai", () => ({
  streamText: vi.fn(() => ({ textStream: new ReadableStream() })),
}));

vi.mock("../provider-registry.js", () => ({
  createModel: vi.fn(() => ({})),
}));

import { callStoryteller } from "../storyteller.js";
import type { StorytellerRequest } from "../storyteller.js";

describe("callStoryteller", () => {
  const baseRequest: StorytellerRequest = {
    playerAction: "I enter the cave",
    worldPremise: "A dark fantasy world",
    chatHistory: [],
    temperature: 0.8,
    maxTokens: 1024,
    provider: { id: "test-provider", name: "Test", baseUrl: "http://localhost:1234", apiKey: "", model: "test" },
  };

  it("returns a result from streamText", () => {
    const result = callStoryteller(baseRequest);
    expect(result).toBeDefined();
  });

  it("passes chat history trimmed to last 20 messages", async () => {
    const { streamText } = await import("ai");
    const history = Array.from({ length: 25 }, (_, i) => ({
      role: "user" as const,
      content: `message ${i}`,
    }));

    callStoryteller({ ...baseRequest, chatHistory: history });

    expect(streamText).toHaveBeenCalled();
    const call = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    // system + last 20 history + player action = 22 messages
    expect(call?.messages).toHaveLength(22);
  });

  it("includes world premise in system prompt", async () => {
    const { streamText } = await import("ai");

    callStoryteller({ ...baseRequest, worldPremise: "A steampunk city" });

    const call = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    const systemMsg = call?.messages?.find((m) => m.role === "system");
    expect(systemMsg?.content).toContain("A steampunk city");
  });

  it("passes temperature and maxTokens", async () => {
    const { streamText } = await import("ai");

    callStoryteller({ ...baseRequest, temperature: 0.5, maxTokens: 512 });

    const call = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    expect(call?.temperature).toBe(0.5);
    expect(call?.maxOutputTokens).toBe(512);
  });
});
