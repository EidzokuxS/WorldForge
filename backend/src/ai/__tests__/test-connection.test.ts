import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("../provider-registry.js", () => ({
  createModel: vi.fn(() => ({})),
}));

import { testProviderConnection } from "../test-connection.js";
import type { TestResult } from "../test-connection.js";

describe("testProviderConnection", () => {
  const config = {
    id: "test-provider",
    name: "Test Provider",
    baseUrl: "http://localhost:1234",
    apiKey: "",
    model: "test-model",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success when generateText succeeds", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({} as never);

    const result: TestResult = await testProviderConnection(config);
    expect(result.success).toBe(true);
    expect(result.model).toBe("test-model");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it("returns failure when generateText throws", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValue(new Error("Connection refused"));

    const result = await testProviderConnection(config);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Connection refused");
    expect(result.model).toBe("test-model");
  });

  it("returns failure with string error for non-Error throws", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValue("timeout");

    const result = await testProviderConnection(config);
    expect(result.success).toBe(false);
    expect(result.error).toBe("timeout");
  });

  it("measures latency", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({} as never), 10))
    );

    const result = await testProviderConnection(config);
    expect(result.latencyMs).toBeGreaterThanOrEqual(5);
  });
});
