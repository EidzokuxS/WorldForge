import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEmbedMany = vi.fn();

vi.mock("ai", () => ({
  embedMany: (...args: unknown[]) => mockEmbedMany(...args),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => ({
    textEmbeddingModel: vi.fn(() => "mock-model"),
  })),
}));

import { embedTexts } from "../embeddings.js";

const fakeProvider = {
  id: "test",
  name: "Test Provider",
  baseUrl: "https://example.com",
  apiKey: "sk-test",
  model: "text-embedding-3-small",
};

describe("embedTexts", () => {
  beforeEach(() => {
    mockEmbedMany.mockClear();
  });

  it("returns empty array for empty input", async () => {
    const result = await embedTexts([], fakeProvider);
    expect(result).toEqual([]);
    expect(mockEmbedMany).not.toHaveBeenCalled();
  });

  it("throws when model is not configured", async () => {
    await expect(
      embedTexts(["hello"], { ...fakeProvider, model: "" })
    ).rejects.toThrow("Embedder model not configured");
  });

  it("throws when model is whitespace", async () => {
    await expect(
      embedTexts(["hello"], { ...fakeProvider, model: "   " })
    ).rejects.toThrow("Embedder model not configured");
  });

  it("calls embedMany and returns embeddings for small batch", async () => {
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
    });

    const result = await embedTexts(["hello", "world"], fakeProvider);
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
  });

  it("batches texts in groups of 50", async () => {
    const texts = Array.from({ length: 120 }, (_, i) => `text-${i}`);

    mockEmbedMany
      .mockResolvedValueOnce({ embeddings: Array(50).fill([1]) })
      .mockResolvedValueOnce({ embeddings: Array(50).fill([2]) })
      .mockResolvedValueOnce({ embeddings: Array(20).fill([3]) });

    const result = await embedTexts(texts, fakeProvider);
    expect(result).toHaveLength(120);
    expect(mockEmbedMany).toHaveBeenCalledTimes(3);
  });
});
