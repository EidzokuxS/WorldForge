import { describe, expect, it } from "vitest";
import {
  buildStorytellerBaselinePreset,
  buildStorytellerGlmOverlay,
  type StorytellerPass,
  type StorytellerSceneMode,
} from "../storyteller-presets.js";

const REJECTED_PATTERNS = [
  /\{\{[^}]+\}\}/,
  /\{\$[^}]+\}/,
  /{{\s*setvar\b/i,
  /\{\{\s*if\b/i,
  /\bignore\s+all\s+prior\s+instructions\b/i,
  /\bact\s+as\s+someone\b/i,
  /\bYOU\s+ARE\s+Celia\b/i,
  /\bpersona shell\b/i,
  /jailbreak/i,
];

function assertNoRejectedMotifs(presetText: string): void {
  for (const rejected of REJECTED_PATTERNS) {
    expect(rejected.test(presetText)).toBe(false);
  }
}

function buildContractPreset(
  pass: StorytellerPass,
  sceneMode: StorytellerSceneMode = "default",
): string {
  const baseline = buildStorytellerBaselinePreset({ pass, sceneMode });
  const overlay = buildStorytellerGlmOverlay({ pass, sceneMode });
  return [baseline, overlay].filter(Boolean).join("\n");
}

describe("storyteller-presets", () => {
  it("produces baseline RP rules with simulation-first, anti-impersonation, and anti-omniscience control", () => {
    const preset = buildStorytellerBaselinePreset({ pass: "hidden-tool-driving" });

    expect(preset).toContain("simulate scene-state");
    expect(preset).toContain("Do not speak or decide for the player");
    expect(preset).toContain("do not claim knowledge beyond player perception");
    expect(preset).toContain("avoid repeating");
    expect(preset).toContain("bounded");
    expect(preset).toContain("Concrete nouns and actions");

    assertNoRejectedMotifs(preset);
  });

  it("adds scene-adaptive rules for combat, dialogue, horror, and quiet scenes", () => {
    const combat = buildStorytellerBaselinePreset({
      pass: "hidden-tool-driving",
      sceneMode: "combat",
    });
    const dialogue = buildStorytellerBaselinePreset({
      pass: "hidden-tool-driving",
      sceneMode: "dialogue",
    });
    const horror = buildStorytellerBaselinePreset({
      pass: "hidden-tool-driving",
      sceneMode: "horror",
    });
    const quiet = buildStorytellerBaselinePreset({
      pass: "hidden-tool-driving",
      sceneMode: "quiet",
    });

    expect(combat).toContain("impactful action beats");
    expect(dialogue).toContain("speak");
    expect(horror).toContain("pressure");
    expect(quiet).toContain("quiet scene");

    assertNoRejectedMotifs(combat);
    assertNoRejectedMotifs(dialogue);
    assertNoRejectedMotifs(horror);
    assertNoRejectedMotifs(quiet);
  });

  it("returns a smaller GLM overlay focused on repetition and overthinking control", () => {
    const hiddenBaseline = buildStorytellerBaselinePreset({
      pass: "hidden-tool-driving",
      sceneMode: "combat",
    });
    const hiddenOverlay = buildStorytellerGlmOverlay({
      pass: "hidden-tool-driving",
      sceneMode: "combat",
    });

    expect(hiddenOverlay.length).toBeGreaterThan(0);
    expect(hiddenOverlay.length).toBeLessThan(hiddenBaseline.length);
    expect(hiddenOverlay).toContain("short, concrete turns");
    expect(hiddenOverlay).toContain("cut repetitive loops");
    expect(hiddenOverlay).toContain("preserve sampler behavior");
    expect(hiddenOverlay).toContain("anti-echo");

    assertNoRejectedMotifs(hiddenOverlay);
  });

  it("keeps final-visible overlay intentionally focused and bounded", () => {
    const finalBaseline = buildStorytellerBaselinePreset({
      pass: "final-visible",
    });
    const finalOverlay = buildStorytellerGlmOverlay({ pass: "final-visible" });

    expect(finalOverlay).toContain("visible pass");
    expect(finalOverlay).not.toMatch(/tool\s+calling/i);

    expect(finalOverlay.length).toBeLessThan(finalBaseline.length);
    assertNoRejectedMotifs(finalOverlay);
  });

  it("builds a full contract from baseline plus overlay with no banned artifacts", () => {
    const contract = buildContractPreset("final-visible", "horror");

    expect(contract).toContain("simulate scene-state");
    expect(contract).toContain("anti-echo");
    expect(contract).toContain("GLM");
    assertNoRejectedMotifs(contract);
  });
});

