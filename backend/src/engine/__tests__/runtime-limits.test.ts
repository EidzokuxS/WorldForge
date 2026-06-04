import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PLAYER_BLOCKING_STAGE_TIMEOUT_MS,
  playerBlockingStageLimit,
  readRuntimeLimitMs,
} from "../runtime-limits.js";

const ENV_NAMES = [
  "WORLDFORGE_TEST_STAGE_TIMEOUT_MS",
  "WF_TEST_STAGE_TIMEOUT_MS",
  "WORLDFORGE_PLAYER_TURN_LLM_TIMEOUT_MS",
  "WF_PLAYER_BLOCKING_STAGE_TIMEOUT_MS",
] as const;

describe("runtime limit helpers", () => {
  afterEach(() => {
    for (const name of ENV_NAMES) {
      delete process.env[name];
    }
  });

  it("uses the first configured positive integer override", () => {
    process.env.WORLDFORGE_TEST_STAGE_TIMEOUT_MS = "240000";
    process.env.WORLDFORGE_PLAYER_TURN_LLM_TIMEOUT_MS = "300000";

    expect(readRuntimeLimitMs(
      ["WORLDFORGE_TEST_STAGE_TIMEOUT_MS", "WORLDFORGE_PLAYER_TURN_LLM_TIMEOUT_MS"],
      60_000,
    )).toBe(240_000);
  });

  it("accepts legacy WF aliases for local playtest scripts", () => {
    process.env.WF_TEST_STAGE_TIMEOUT_MS = "210000";

    expect(readRuntimeLimitMs("WORLDFORGE_TEST_STAGE_TIMEOUT_MS", 60_000)).toBe(210_000);
  });

  it("falls back to the shared player-turn LLM budget for stage limits", () => {
    process.env.WORLDFORGE_PLAYER_TURN_LLM_TIMEOUT_MS = "300000";

    expect(playerBlockingStageLimit("WORLDFORGE_TEST_STAGE_TIMEOUT_MS")).toBe(300_000);
  });

  it("uses the five-minute player-blocking default when no override is configured", () => {
    expect(playerBlockingStageLimit("WORLDFORGE_TEST_STAGE_TIMEOUT_MS")).toBe(
      DEFAULT_PLAYER_BLOCKING_STAGE_TIMEOUT_MS,
    );
  });

  it("rejects invalid timeout values instead of silently guessing", () => {
    process.env.WORLDFORGE_TEST_STAGE_TIMEOUT_MS = "soon";

    expect(() => readRuntimeLimitMs("WORLDFORGE_TEST_STAGE_TIMEOUT_MS", 60_000)).toThrow(
      /positive integer/,
    );
  });
});
