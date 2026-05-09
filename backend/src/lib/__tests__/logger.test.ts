import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../logger.js";
import { resetLoggerForTest } from "../logger-test-utils.js";

describe("createLogger (backward-compatible API)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-logger-compat-"));
    resetLoggerForTest({ logRoot: tmpDir });
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("creates a logger with info, warn, error, debug, event methods", () => {
    const log = createLogger("test");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.event).toBe("function");
  });

  it("does not throw when info is called with a string message", () => {
    const log = createLogger("myTag");
    expect(() => log.info("hello world")).not.toThrow();
  });

  it("does not throw when warn is called with a string message", () => {
    const log = createLogger("myTag");
    expect(() => log.warn("caution")).not.toThrow();
  });

  it("does not throw when error is called with a string message", () => {
    const log = createLogger("myTag");
    expect(() => log.error("failure")).not.toThrow();
  });

  it("does not throw when info is called with data", () => {
    const log = createLogger("test");
    expect(() => log.info("with data", { key: "value" })).not.toThrow();
  });

  it("does not throw when error is called with an Error instance", () => {
    const log = createLogger("test");
    const err = new Error("boom");
    expect(() => log.error("caught", err)).not.toThrow();
  });

  it("does not throw on event with arbitrary payload", () => {
    const log = createLogger("test");
    expect(() => log.event("test.event", { nested: { a: 1 } })).not.toThrow();
  });
});
