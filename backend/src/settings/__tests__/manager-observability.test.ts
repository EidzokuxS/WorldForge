import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDefaultSettings } from "@worldforge/shared";

// Mock node:fs BEFORE importing the module under test so the fs-touching
// paths go through deterministic fakes.
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

import fs from "node:fs";
import { normalizeSettings, loadSettings } from "../manager.js";
import {
  getObservabilityConfigSnapshot,
  shouldLogRole,
  resetLoggerForTest,
} from "../../lib/logger-setup.js";

const mockedFs = vi.mocked(fs);

function buildRawSettings(observability: unknown): string {
  const base = createDefaultSettings() as unknown as Record<string, unknown>;
  const { observability: _omit, ...rest } = base;
  const payload =
    observability === undefined ? rest : { ...rest, observability };
  return JSON.stringify(payload);
}

describe("normalizeSettings observability handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetLoggerForTest();
  });

  it("fills defaults when observability is missing (pre-upgrade file)", () => {
    const settings = normalizeSettings({
      providers: [],
      judge: {},
      storyteller: {},
      generator: {},
      embedder: {},
      images: {},
      research: {},
      ui: {},
    });
    expect(settings.observability.enabled).toBe(true);
    expect(settings.observability.dumpFullPrompts).toBe(false);
    expect(settings.observability.roles.judge).toBe(true);
    expect(settings.observability.roles.storyteller).toBe(true);
    expect(settings.observability.roles.oracle).toBe(true);
    expect(settings.observability.roles.npcAgent).toBe(true);
    expect(settings.observability.roles.reflection).toBe(true);
    expect(settings.observability.roles.embedder).toBe(true);
  });

  it("passes through a valid observability block", () => {
    const settings = normalizeSettings({
      providers: [],
      judge: {},
      storyteller: {},
      generator: {},
      embedder: {},
      images: {},
      research: {},
      ui: {},
      observability: {
        enabled: false,
        dumpFullPrompts: true,
        roles: {
          judge: false,
          storyteller: true,
          oracle: true,
          npcAgent: false,
          reflection: true,
          embedder: true,
        },
      },
    });
    expect(settings.observability.enabled).toBe(false);
    expect(settings.observability.dumpFullPrompts).toBe(true);
    expect(settings.observability.roles.judge).toBe(false);
    expect(settings.observability.roles.npcAgent).toBe(false);
  });

  it("throws with Zod issue list when observability.enabled is malformed", () => {
    expect(() =>
      normalizeSettings({
        providers: [],
        judge: {},
        storyteller: {},
        generator: {},
        embedder: {},
        images: {},
        research: {},
        ui: {},
        observability: {
          enabled: "yes",
          dumpFullPrompts: false,
          roles: {
            judge: true,
            storyteller: true,
            oracle: true,
            npcAgent: true,
            reflection: true,
            embedder: true,
          },
        },
      }),
    ).toThrow(/observability block in settings.json is malformed.*enabled/);
  });

  it("throws when a required role toggle is missing", () => {
    expect(() =>
      normalizeSettings({
        providers: [],
        judge: {},
        storyteller: {},
        generator: {},
        embedder: {},
        images: {},
        research: {},
        ui: {},
        observability: {
          enabled: true,
          dumpFullPrompts: false,
          roles: {
            judge: true,
            storyteller: true,
            oracle: true,
            npcAgent: true,
            reflection: true,
            // embedder missing
          },
        },
      }),
    ).toThrow(/observability block in settings.json is malformed/);
  });
});

describe("loadSettings applies observability runtime", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetLoggerForTest();
  });

  it("configures the runtime cache from loaded settings", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      buildRawSettings({
        enabled: true,
        dumpFullPrompts: false,
        roles: {
          judge: false,
          storyteller: true,
          oracle: true,
          npcAgent: true,
          reflection: true,
          embedder: true,
        },
      }) as unknown as string,
    );
    mockedFs.writeFileSync.mockImplementation(() => undefined);

    const settings = loadSettings();
    expect(settings.observability.roles.judge).toBe(false);

    const snapshot = getObservabilityConfigSnapshot();
    expect(snapshot.roles.judge).toBe(false);
    expect(snapshot.roles.storyteller).toBe(true);
    expect(shouldLogRole("judge", "info")).toBe(false);
    expect(shouldLogRole("storyteller", "info")).toBe(true);
  });

  it("loadSettings with missing observability still applies defaults to runtime", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      buildRawSettings(undefined) as unknown as string,
    );
    mockedFs.writeFileSync.mockImplementation(() => undefined);

    loadSettings();
    const snapshot = getObservabilityConfigSnapshot();
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.dumpFullPrompts).toBe(false);
    expect(snapshot.roles.judge).toBe(true);
  });

  it("loadSettings with malformed observability throws with Zod issue list", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      buildRawSettings({
        enabled: "not-a-boolean",
        dumpFullPrompts: false,
        roles: {
          judge: true,
          storyteller: true,
          oracle: true,
          npcAgent: true,
          reflection: true,
          embedder: true,
        },
      }) as unknown as string,
    );

    expect(() => loadSettings()).toThrow(
      /observability block in settings.json is malformed.*enabled/,
    );
  });
});
