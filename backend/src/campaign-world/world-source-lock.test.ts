import { describe, expect, it, vi } from "vitest";
import { withCampaignWorldSourceLock } from "./world-source-lock.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Campaign World source mutex", () => {
  it("serializes source operations for one campaign", async () => {
    const firstRelease = deferred();
    const firstStarted = vi.fn();
    const secondStarted = vi.fn();

    const first = withCampaignWorldSourceLock("campaign-a", async () => {
      firstStarted();
      await firstRelease.promise;
    });
    const second = withCampaignWorldSourceLock("campaign-a", async () => {
      secondStarted();
    });

    await Promise.resolve();
    expect(firstStarted).toHaveBeenCalledOnce();
    expect(secondStarted).not.toHaveBeenCalled();

    firstRelease.resolve();
    await Promise.all([first, second]);
    expect(secondStarted).toHaveBeenCalledOnce();
  });

  it("allows different campaign sources to proceed independently", async () => {
    const releaseA = deferred();
    const releaseB = deferred();
    const started: string[] = [];

    const first = withCampaignWorldSourceLock("campaign-a", async () => {
      started.push("campaign-a");
      await releaseA.promise;
    });
    const second = withCampaignWorldSourceLock("campaign-b", async () => {
      started.push("campaign-b");
      await releaseB.promise;
    });

    await Promise.resolve();
    expect(started).toEqual(["campaign-a", "campaign-b"]);

    releaseA.resolve();
    releaseB.resolve();
    await Promise.all([first, second]);
  });

  it("releases a campaign source after an operation fails", async () => {
    await expect(
      withCampaignWorldSourceLock("campaign-a", async () => {
        throw new Error("source operation failed");
      }),
    ).rejects.toThrow("source operation failed");

    await expect(
      withCampaignWorldSourceLock("campaign-a", async () => "available"),
    ).resolves.toBe("available");
  });
});
