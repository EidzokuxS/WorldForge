import { describe, expect, it } from "vitest";

import { runSeededCampaignPlayReplay } from "./seeded-replay.js";

describe("Campaign Play deterministic replay", () => {
  it("repeats ten completed player actions with identical durable bytes", async () => {
    const playerActions = 10;
    const first = await runSeededCampaignPlayReplay({ playerActions, policy: "peripheral" });
    const second = await runSeededCampaignPlayReplay({ playerActions, policy: "peripheral" });

    expect(first).toMatchObject({
      openingTurns: 1,
      completedPlayerActions: playerActions,
      integrity: "ok",
      foreignKeyViolations: 0,
    });
    expect(first.terminalStages).toEqual(
      Array.from({ length: playerActions + 1 }, () => "completed"),
    );
    expect(first.receiptCount).toBeGreaterThan(0);
    expect(first.runtimeEventCount).toBeGreaterThan(0);
    expect(first.turnEventCount).toBeGreaterThan(0);
    expect(second.canonicalBytes).toBe(first.canonicalBytes);
    expect(second.replayHash).toBe(first.replayHash);
  }, 60_000);

  it("forks one accepted opening into distinct intervention and peripheral outcomes", async () => {
    const intervene = await runSeededCampaignPlayReplay({ playerActions: 1, policy: "intervene" });
    const peripheral = await runSeededCampaignPlayReplay({ playerActions: 1, policy: "peripheral" });

    expect(intervene.acceptedSnapshotHash).toBe(peripheral.acceptedSnapshotHash);
    expect(intervene.openingProjectionHash).toBe(peripheral.openingProjectionHash);
    expect(intervene.replayHash).not.toBe(peripheral.replayHash);
    expect(intervene.mechanicalHash).not.toBe(peripheral.mechanicalHash);
    expect(intervene.pressureStateBytes).toBe(peripheral.pressureStateBytes);
    expect(intervene.observationCount).toBeGreaterThan(0);
    expect(peripheral.observationCount).toBeGreaterThan(0);
    expect(intervene.observationChannels.every((channel) => channel === "direct_perception")).toBe(true);
    expect(peripheral.observationChannels.every((channel) => channel === "direct_perception")).toBe(true);
    expect(intervene.unboundObservationHandles).toEqual([]);
    expect(peripheral.unboundObservationHandles).toEqual([]);
  }, 30_000);
});
