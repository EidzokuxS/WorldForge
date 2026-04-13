import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import { formatLookupLogEntry } from "@worldforge/shared";

vi.mock("../manager.js", () => ({
  readCampaignConfig: vi.fn(() => ({ premise: "Test premise" })),
}));

vi.mock("../paths.js", () => ({
  getChatHistoryPath: vi.fn((id: string) => `/tmp/test-${id}/chat_history.json`),
}));

import { getCampaignPremise, getChatHistory, appendChatMessages } from "../chat-history.js";

describe("getCampaignPremise", () => {
  it("returns premise from campaign config", () => {
    const result = getCampaignPremise("test-id");
    expect(result).toBe("Test premise");
  });
});

describe("getChatHistory", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty array when file does not exist", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    expect(getChatHistory("no-file")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("not json");
    expect(getChatHistory("bad-json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue('{"key": "value"}');
    expect(getChatHistory("obj")).toEqual([]);
  });

  it("filters out invalid chat messages", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify([
        { role: "user", content: "hello" },
        { role: "invalid" },
        { role: "assistant", content: "world" },
        "not an object",
      ])
    );

    const result = getChatHistory("mixed");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "user", content: "hello" });
    expect(result[1]).toEqual({ role: "assistant", content: "world" });
  });
});

describe("appendChatMessages", () => {
  it("writes existing + new messages to file", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify([{ role: "user", content: "first" }])
    );
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    appendChatMessages("test-id", [
      { role: "assistant", content: "second" },
    ]);

    expect(writeSpy).toHaveBeenCalledOnce();
    const written = JSON.parse(writeSpy.mock.calls[0][1] as string) as unknown[];
    expect(written).toHaveLength(2);
  });

  it("round-trips persisted lookup command and factual reply through getChatHistory", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    appendChatMessages("test-id", [
      { role: "user", content: "/lookup character: Satoru Gojo" },
      {
        role: "assistant",
        content: formatLookupLogEntry(
          "character_canon_fact",
          "Gojo teaches at Tokyo Jujutsu High before the Shibuya Incident.",
        ),
      },
    ]);

    const persisted = writeSpy.mock.calls[0]?.[1] as string;
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(persisted);

    expect(getChatHistory("test-id")).toEqual([
      { role: "user", content: "/lookup character: Satoru Gojo" },
      {
        role: "assistant",
        content:
          "[Lookup: character_canon_fact] Gojo teaches at Tokyo Jujutsu High before the Shibuya Incident.",
      },
    ]);
  });

  it("round-trips compare lookup entries through the same history lane", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    appendChatMessages("test-id", [
      { role: "user", content: "/compare Satoru Gojo vs Ryomen Sukuna" },
      {
        role: "assistant",
        content: formatLookupLogEntry(
          "compare",
          "Gojo controls spacing more cleanly, while Sukuna brings the harsher finishing ceiling.",
        ),
      },
    ]);

    const persisted = writeSpy.mock.calls[0]?.[1] as string;
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(persisted);

    expect(getChatHistory("test-id")).toEqual([
      { role: "user", content: "/compare Satoru Gojo vs Ryomen Sukuna" },
      {
        role: "assistant",
        content:
          "[Lookup: compare] Gojo controls spacing more cleanly, while Sukuna brings the harsher finishing ceiling.",
      },
    ]);
  });
});
