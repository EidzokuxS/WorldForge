import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fs and path before importing
vi.mock("node:fs", () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { createLogger } from "../logger.js";

describe("createLogger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("creates a logger with info, warn, and error methods", () => {
    const log = createLogger("test");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("info writes to console.log", () => {
    const log = createLogger("myTag");
    log.info("hello world");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0]![0] as string;
    expect(output).toContain("[INFO]");
    expect(output).toContain("[myTag]");
    expect(output).toContain("hello world");
  });

  it("warn writes to console.log", () => {
    const log = createLogger("myTag");
    log.warn("caution");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0]![0] as string;
    expect(output).toContain("[WARN]");
    expect(output).toContain("caution");
  });

  it("error writes to console.error", () => {
    const log = createLogger("myTag");
    log.error("failure");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const output = consoleErrorSpy.mock.calls[0]![0] as string;
    expect(output).toContain("[ERROR]");
    expect(output).toContain("failure");
  });

  it("includes data in output when provided", () => {
    const log = createLogger("test");
    log.info("with data", { key: "value" });
    const output = consoleSpy.mock.calls[0]![0] as string;
    expect(output).toContain('"key": "value"');
  });

  it("formats Error data with message and stack", () => {
    const log = createLogger("test");
    const err = new Error("boom");
    log.error("caught", err);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const output = consoleErrorSpy.mock.calls[0]![0] as string;
    expect(output).toContain("boom");
  });

  it("includes ISO timestamp in output", () => {
    const log = createLogger("test");
    log.info("timestamped");
    const output = consoleSpy.mock.calls[0]![0] as string;
    // ISO format: 2026-01-01T00:00:00.000Z
    expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });
});
