import { describe, expect, it, vi, beforeEach } from "vitest";

import { loadCampaignDestination } from "./campaign-navigation";

const worldApi = vi.hoisted(() => ({ loadCampaignWorldState: vi.fn() }));
const playApi = vi.hoisted(() => ({ loadCampaignPlayState: vi.fn() }));

vi.mock("@/lib/campaign-world-api", () => worldApi);
vi.mock("@/lib/campaign-play-api", () => playApi);

function worldState(status: "unbuilt" | "building" | "failed" | "review" | "accepted") {
  return { status };
}

describe("loadCampaignDestination", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["unbuilt", "/campaign/campaign-1/forge"],
    ["building", "/campaign/campaign-1/forge"],
    ["failed", "/campaign/campaign-1/forge"],
    ["review", "/campaign/campaign-1/review"],
  ] as const)("routes %s Campaign World state to %s", async (status, destination) => {
    worldApi.loadCampaignWorldState.mockResolvedValue(worldState(status));

    await expect(loadCampaignDestination("campaign-1")).resolves.toBe(destination);
    expect(playApi.loadCampaignPlayState).not.toHaveBeenCalled();
  });

  it("routes an accepted world with no player character to Character", async () => {
    worldApi.loadCampaignWorldState.mockResolvedValue(worldState("accepted"));
    playApi.loadCampaignPlayState.mockResolvedValue({ phase: "character_required" });

    await expect(loadCampaignDestination("campaign-1")).resolves.toBe("/campaign/campaign-1/character");
    expect(playApi.loadCampaignPlayState).toHaveBeenCalledWith("campaign-1");
  });

  it.each(["opening_required", "ready", "opening_active", "turn_active", "narration_pending"] as const)(
    "routes accepted Campaign Play phase %s to Play",
    async (phase) => {
      worldApi.loadCampaignWorldState.mockResolvedValue(worldState("accepted"));
      playApi.loadCampaignPlayState.mockResolvedValue({ phase });

      await expect(loadCampaignDestination("campaign-1")).resolves.toBe("/campaign/campaign-1/play");
    },
  );

  it("propagates persisted state errors", async () => {
    const error = new Error("Campaign World unavailable");
    worldApi.loadCampaignWorldState.mockRejectedValue(error);

    await expect(loadCampaignDestination("campaign-1")).rejects.toBe(error);
  });
});
