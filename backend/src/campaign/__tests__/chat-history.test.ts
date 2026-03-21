import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";

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
});
