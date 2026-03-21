import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@worldforge/shared";
import {
  compressConversation,
  IMPORTANCE_KEYWORDS,
} from "../prompt-assembler.js";

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
  it("returns all messages when history fits within budget", () => {
    const history = makeHistory(10);
    // Large budget that fits everything
    const result = compressConversation(history, 100_000);

    expect(result).not.toBeNull();
    // Should contain all 10 messages, no omission marker
    const lines = result!.content.split("\n");
    const playerGmLines = lines.filter((l) => l.startsWith("Player:") || l.startsWith("GM:"));
    expect(playerGmLines).toHaveLength(10);
    expect(result!.content).not.toContain("omitted");
  });

  it("keeps first 2 + last N + drops mundane middle when budget is small", () => {
    const history = makeHistory(50);
    // Small budget: only ~500 tokens worth
    const result = compressConversation(history, 500);

    expect(result).not.toBeNull();
    const lines = result!.content.split("\n");
    const playerGmLines = lines.filter((l) => l.startsWith("Player:") || l.startsWith("GM:"));

    // Should have fewer than 50 messages
    expect(playerGmLines.length).toBeLessThan(50);
    // Should have at least 2 (first messages) + some last messages
    expect(playerGmLines.length).toBeGreaterThanOrEqual(3);

    // First 2 messages should be present
    expect(playerGmLines[0]).toContain("Message 0");
    expect(playerGmLines[1]).toContain("Message 1");

    // Last message should be present
    expect(playerGmLines[playerGmLines.length - 1]).toContain(`Message 49`);

    // Should have omission marker
    expect(result!.content).toContain("omitted");
  });

  it("keeps important messages from middle that contain keywords", () => {
    const history: ChatMessage[] = [
      makeMsg("user", "Message 0: Starting the adventure"),
      makeMsg("assistant", "Message 1: Welcome to the world"),
      // Mundane middle
      makeMsg("user", "Message 2: I look around"),
      makeMsg("assistant", "Message 3: You see a room"),
      makeMsg("user", "Message 4: I walk forward"),
      makeMsg("assistant", "Message 5: You enter a hallway"),
      // Important: combat
      makeMsg("user", "Message 6: I attack the goblin"),
      makeMsg("assistant", "Message 7: The goblin is killed"),
      // More mundane
      makeMsg("user", "Message 8: I search the room"),
      makeMsg("assistant", "Message 9: You find nothing special"),
      makeMsg("user", "Message 10: I continue walking"),
      makeMsg("assistant", "Message 11: Another corridor"),
      // Recent (last few)
      makeMsg("user", "Message 12: I open the door"),
      makeMsg("assistant", "Message 13: A dragon appears"),
    ];

    // Budget that forces compression but allows important + first + last
    const result = compressConversation(history, 400);

    expect(result).not.toBeNull();
    const content = result!.content;

    // First 2 always kept
    expect(content).toContain("Message 0");
    expect(content).toContain("Message 1");

    // Last messages kept
    expect(content).toContain("Message 13");

    // Important middle messages with keywords should survive
    expect(content).toContain("attack");
    expect(content).toContain("killed");
  });

  it("keeps messages with [IMPORTANT] prefix", () => {
    const history: ChatMessage[] = [
      makeMsg("user", "First message"),
      makeMsg("assistant", "Second message"),
      makeMsg("user", "Mundane middle"),
      makeMsg("assistant", "[IMPORTANT] The artifact was discovered"),
      makeMsg("user", "Another mundane middle"),
      makeMsg("assistant", "Yet another mundane response"),
      makeMsg("user", "Recent message 1"),
      makeMsg("assistant", "Recent message 2"),
    ];

    const result = compressConversation(history, 300);

    expect(result).not.toBeNull();
    // [IMPORTANT] tagged message should survive
    expect(result!.content).toContain("artifact was discovered");
  });

  it("inserts omission marker where messages were dropped", () => {
    const history = makeHistory(30);
    const result = compressConversation(history, 400);

    expect(result).not.toBeNull();
    // Omission marker should mention how many turns were omitted
    const omissionMatch = result!.content.match(/\[\.\.\..*(\d+).*omitted.*\]/i);
    expect(omissionMatch).not.toBeNull();
  });

  it("returns null for empty history", () => {
    const result = compressConversation([], 1000);
    expect(result).toBeNull();
  });

  it("has correct section metadata", () => {
    const history = makeHistory(5);
    const result = compressConversation(history, 100_000);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("RECENT CONVERSATION");
    expect(result!.priority).toBe(7);
    expect(result!.canTruncate).toBe(true);
  });
});

describe("IMPORTANCE_KEYWORDS", () => {
  it("includes expected combat/discovery keywords", () => {
    expect(IMPORTANCE_KEYWORDS).toContain("attack");
    expect(IMPORTANCE_KEYWORDS).toContain("killed");
    expect(IMPORTANCE_KEYWORDS).toContain("discovered");
    expect(IMPORTANCE_KEYWORDS).toContain("betrayed");
    expect(IMPORTANCE_KEYWORDS).toContain("died");
  });
});
