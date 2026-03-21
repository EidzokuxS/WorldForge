import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatMessage } from "@worldforge/shared";

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

import {
  compressConversation,
} from "../prompt-assembler.js";
import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import type { ResolvedRole } from "../../ai/resolve-role-model.js";

const MOCK_JUDGE_ROLE: ResolvedRole = {
  provider: {
    id: "test",
    name: "Test",
    baseUrl: "http://localhost",
    apiKey: "key",
    model: "test-model",
  },
  temperature: 0.1,
  maxTokens: 1024,
};

function makeMsg(role: "user" | "assistant", content: string): ChatMessage {
  return { role, content };
}

function makeHistory(count: number): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    msgs.push(makeMsg(role as "user" | "assistant", `Message ${i}: This is a regular conversation turn with some content.`));
  }
  return msgs;
}

describe("compressConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no important messages detected
    vi.mocked(safeGenerateObject).mockResolvedValue({ object: { importantIndices: [] } } as never);
  });

  it("returns all messages when history fits within budget", async () => {
    const history = makeHistory(10);
    const result = await compressConversation(history, 100_000);

    expect(result).not.toBeNull();
    const lines = result!.content.split("\n");
    const playerGmLines = lines.filter((l) => l.startsWith("Player:") || l.startsWith("GM:"));
    expect(playerGmLines).toHaveLength(10);
    expect(result!.content).not.toContain("omitted");
  });

  it("keeps first 2 + last N + drops mundane middle when budget is small", async () => {
    const history = makeHistory(50);
    const result = await compressConversation(history, 500);

    expect(result).not.toBeNull();
    const lines = result!.content.split("\n");
    const playerGmLines = lines.filter((l) => l.startsWith("Player:") || l.startsWith("GM:"));

    expect(playerGmLines.length).toBeLessThan(50);
    expect(playerGmLines.length).toBeGreaterThanOrEqual(3);

    expect(playerGmLines[0]).toContain("Message 0");
    expect(playerGmLines[1]).toContain("Message 1");
    expect(playerGmLines[playerGmLines.length - 1]).toContain("Message 49");
    expect(result!.content).toContain("omitted");
  });

  it("keeps important messages from middle detected by LLM", async () => {
    const history: ChatMessage[] = [
      makeMsg("user", "Message 0: Starting the adventure"),
      makeMsg("assistant", "Message 1: Welcome to the world"),
      makeMsg("user", "Message 2: I look around"),
      makeMsg("assistant", "Message 3: You see a room"),
      makeMsg("user", "Message 4: I walk forward"),
      makeMsg("assistant", "Message 5: You enter a hallway"),
      makeMsg("user", "Message 6: I attack the goblin"),
      makeMsg("assistant", "Message 7: The goblin is killed"),
      makeMsg("user", "Message 8: I search the room"),
      makeMsg("assistant", "Message 9: You find nothing special"),
      makeMsg("user", "Message 10: I continue walking"),
      makeMsg("assistant", "Message 11: Another corridor"),
      makeMsg("user", "Message 12: I open the door"),
      makeMsg("assistant", "Message 13: A dragon appears"),
    ];

    // LLM detects messages at middle-indices 4 and 5 (history indices 6 and 7) as important
    vi.mocked(safeGenerateObject).mockResolvedValue({
      object: { importantIndices: [4, 5] },
    } as never);

    const result = await compressConversation(history, 400, MOCK_JUDGE_ROLE);

    expect(result).not.toBeNull();
    const content = result!.content;

    expect(content).toContain("Message 0");
    expect(content).toContain("Message 1");
    expect(content).toContain("Message 13");
    expect(content).toContain("attack");
    expect(content).toContain("killed");
  });

  it("inserts omission marker where messages were dropped", async () => {
    const history = makeHistory(30);
    const result = await compressConversation(history, 400);

    expect(result).not.toBeNull();
    const omissionMatch = result!.content.match(/\[\.\.\..*(\d+).*omitted.*\]/i);
    expect(omissionMatch).not.toBeNull();
  });

  it("returns null for empty history", async () => {
    const result = await compressConversation([], 1000);
    expect(result).toBeNull();
  });

  it("has correct section metadata", async () => {
    const history = makeHistory(5);
    const result = await compressConversation(history, 100_000);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("RECENT CONVERSATION");
    expect(result!.priority).toBe(7);
    expect(result!.canTruncate).toBe(true);
  });

  it("works without judgeRole (no middle messages kept)", async () => {
    const history = makeHistory(50);
    const result = await compressConversation(history, 500);

    expect(result).not.toBeNull();
    expect(safeGenerateObject).not.toHaveBeenCalled();
  });
});
