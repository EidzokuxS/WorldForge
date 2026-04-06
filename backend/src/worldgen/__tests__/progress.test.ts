import { describe, it, expect } from "vitest";
import { reportSubProgress } from "../scaffold-steps/prompt-utils.js";

describe("progress: two-tier reporting (D-07)", () => {
  it("reportSubProgress emits all 6 fields", () => {
    const collected: unknown[] = [];
    const onProgress = (p: unknown) => collected.push(p);
    reportSubProgress(onProgress, 1, 9, "Building locations...", 2, 6, "Location: Tavern");
    expect(collected).toHaveLength(1);
    expect(collected[0]).toEqual({
      step: 1, totalSteps: 9, label: "Building locations...",
      subStep: 2, subTotal: 6, subLabel: "Location: Tavern",
    });
  });

  it("reportSubProgress is no-op when onProgress is undefined", () => {
    // Should not throw
    reportSubProgress(undefined, 1, 9, "test", 0, 1, "test");
  });

  it.todo("GenerationProgress type accepts optional subStep, subTotal, subLabel");
});
