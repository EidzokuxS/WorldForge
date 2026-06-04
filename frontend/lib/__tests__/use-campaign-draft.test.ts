import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCampaignDraft } from "../use-campaign-draft";

describe("useCampaignDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("restores a campaign draft after remount", async () => {
    const first = renderHook(() => useCampaignDraft("campaign-a"));

    act(() => {
      first.result.current.setDraft("Search the platform.");
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("worldforge:game:draft:campaign-a")).toBe(
        "Search the platform.",
      );
    });

    first.unmount();
    const second = renderHook(() => useCampaignDraft("campaign-a"));

    await waitFor(() => {
      expect(second.result.current.draft).toBe("Search the platform.");
    });
  });

  it("does not leak drafts between campaigns", async () => {
    const campaignA = renderHook(() => useCampaignDraft("campaign-a"));

    act(() => {
      campaignA.result.current.setDraft("A-only draft");
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("worldforge:game:draft:campaign-a")).toBe(
        "A-only draft",
      );
    });

    const campaignB = renderHook(() => useCampaignDraft("campaign-b"));

    await waitFor(() => {
      expect(campaignB.result.current.draft).toBe("");
    });
    expect(window.localStorage.getItem("worldforge:game:draft:campaign-b")).toBeNull();
  });

  it("keeps null campaign drafts in memory and avoids a global storage key", () => {
    const { result } = renderHook(() => useCampaignDraft(null));

    act(() => {
      result.current.setDraft("Temporary action");
    });

    expect(result.current.draft).toBe("Temporary action");
    expect(window.localStorage.getItem("worldforge:game:draft:null")).toBeNull();
    expect(window.localStorage.getItem("worldforge:game:draft:")).toBeNull();
  });

  it("clears only the active campaign draft", async () => {
    window.localStorage.setItem("worldforge:game:draft:campaign-a", "A draft");
    window.localStorage.setItem("worldforge:game:draft:campaign-b", "B draft");

    const { result } = renderHook(() => useCampaignDraft("campaign-a"));

    await waitFor(() => {
      expect(result.current.draft).toBe("A draft");
    });

    act(() => {
      result.current.clearDraft();
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("worldforge:game:draft:campaign-a")).toBeNull();
    });
    expect(window.localStorage.getItem("worldforge:game:draft:campaign-b")).toBe("B draft");
  });

  it("falls back to in-memory state when storage read throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    const { result } = renderHook(() => useCampaignDraft("campaign-a"));

    act(() => {
      result.current.setDraft("Still usable");
    });

    expect(result.current.draft).toBe("Still usable");
  });

  it("falls back to in-memory state when storage write throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    const { result } = renderHook(() => useCampaignDraft("campaign-a"));

    act(() => {
      result.current.setDraft("Still controlled");
    });

    expect(result.current.draft).toBe("Still controlled");
  });
});
