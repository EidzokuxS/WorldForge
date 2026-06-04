import { describe, it, expect } from "vitest";
import {
  runWithTurnContext,
  getTurnContext,
  withRole,
} from "../logger-context.js";

describe("TurnContext propagation", () => {
  it("returns undefined outside any turn context", () => {
    expect(getTurnContext()).toBeUndefined();
  });

  it("binds context inside runWithTurnContext synchronously", () => {
    const ctx = runWithTurnContext(
      { turnId: "abc", campaignId: "cmp", tick: 1 },
      () => getTurnContext(),
    );
    expect(ctx).toEqual({ turnId: "abc", campaignId: "cmp", tick: 1 });
  });

  it("context survives await Promise.resolve()", async () => {
    const ctx = await runWithTurnContext(
      { turnId: "abc", campaignId: "cmp", tick: 1 },
      async () => {
        await Promise.resolve();
        return getTurnContext();
      },
    );
    expect(ctx).toEqual({ turnId: "abc", campaignId: "cmp", tick: 1 });
  });

  it("context survives setTimeout across microtask boundary", async () => {
    const ctx = await runWithTurnContext(
      { turnId: "abc", campaignId: "cmp", tick: 1 },
      async () => {
        await new Promise((r) => setTimeout(r, 1));
        return getTurnContext();
      },
    );
    expect(ctx?.turnId).toBe("abc");
  });

  it("withRole nests — inner role wins while base fields persist", () => {
    const result = runWithTurnContext(
      { turnId: "abc", campaignId: "cmp", tick: 1, role: "judge" },
      () =>
        withRole("oracle", () => {
          const c = getTurnContext();
          return c;
        }),
    );
    expect(result?.role).toBe("oracle");
    expect(result?.turnId).toBe("abc");
    expect(result?.campaignId).toBe("cmp");
    expect(result?.tick).toBe(1);
  });

  it("withRole is a no-op outside a turn context", () => {
    const result = withRole("oracle", () => getTurnContext());
    expect(result).toBeUndefined();
  });
});
