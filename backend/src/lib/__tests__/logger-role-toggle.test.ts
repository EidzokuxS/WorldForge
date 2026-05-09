import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configureObservability,
  getObservabilityConfigSnapshot,
  shouldLogRole,
  resetLoggerForTest,
} from "../logger-setup.js";

describe("observability role toggle + snapshot cache", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-logger-role-"));
    resetLoggerForTest({ logRoot: tmpDir });
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("shouldLogRole reflects role toggle state", () => {
    configureObservability({
      enabled: true,
      dumpFullPrompts: false,
      roles: {
        judge: false,
        storyteller: true,
      },
    });

    expect(shouldLogRole("judge", "info")).toBe(false);
    expect(shouldLogRole("storyteller", "info")).toBe(true);
  });

  it("warn and error bypass role gating (always log)", () => {
    configureObservability({
      enabled: true,
      dumpFullPrompts: false,
      roles: { judge: false },
    });
    expect(shouldLogRole("judge", "warn")).toBe(true);
    expect(shouldLogRole("judge", "error")).toBe(true);
  });

  it("enabled=false silences info/debug for all roles", () => {
    configureObservability({
      enabled: false,
      dumpFullPrompts: false,
      roles: { judge: true, storyteller: true },
    });
    expect(shouldLogRole("judge", "info")).toBe(false);
    expect(shouldLogRole("storyteller", "debug")).toBe(false);
    // warn/error still bypass the enabled flag
    expect(shouldLogRole("judge", "warn")).toBe(true);
  });

  it("getObservabilityConfigSnapshot returns the current cached config", () => {
    configureObservability({
      enabled: true,
      dumpFullPrompts: true,
      roles: { oracle: false },
    });
    const snap = getObservabilityConfigSnapshot();
    expect(snap.enabled).toBe(true);
    expect(snap.dumpFullPrompts).toBe(true);
    expect(snap.roles.oracle).toBe(false);
  });

  it("snapshot accessor is synchronous and returns stably without side effects", () => {
    configureObservability({
      enabled: true,
      dumpFullPrompts: false,
      roles: { judge: false },
    });
    const a = getObservabilityConfigSnapshot();
    const b = getObservabilityConfigSnapshot();
    const c = getObservabilityConfigSnapshot();
    // All calls return the SAME cached object (no fs read rebuilding it).
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a.roles.judge).toBe(false);

    // Timing sanity check: 1000 calls should be sub-millisecond per call
    // (pure property access, no I/O). If we ever regressed to disk reads,
    // this would blow past the budget instantly.
    const t0 = Date.now();
    for (let i = 0; i < 1000; i++) {
      getObservabilityConfigSnapshot();
    }
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(100);
  });

  it("configureObservability with partial roles preserves other toggles", () => {
    configureObservability({
      enabled: true,
      dumpFullPrompts: false,
      roles: { judge: false, storyteller: false, oracle: false },
    });
    // Now toggle only storyteller — judge and oracle should stay false.
    configureObservability({
      enabled: true,
      dumpFullPrompts: false,
      roles: { storyteller: true },
    });
    const snap = getObservabilityConfigSnapshot();
    expect(snap.roles.storyteller).toBe(true);
    expect(snap.roles.judge).toBe(false);
    expect(snap.roles.oracle).toBe(false);
  });
});
