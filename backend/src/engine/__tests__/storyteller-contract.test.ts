import { describe, expect, it } from "vitest";
import {
  STORYTELLER_WORLD_RULES,
  STORYTELLER_CONTEXT_RULES,
  STORYTELLER_TOOL_SUPPORT_RULES,
  buildStorytellerContract,
} from "../storyteller-contract.js";
import {
  buildStorytellerBaselinePreset,
  buildStorytellerGlmOverlay,
  type StorytellerSceneMode,
  type StorytellerPass,
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

function assertNoRejectedMotifs(value: string): void {
  for (const rejected of REJECTED_PATTERNS) {
    expect(rejected.test(value)).toBe(false);
  }
}

function buildContractPresetSample(
  pass: StorytellerPass,
  sceneMode: StorytellerSceneMode = "default",
): string {
  return [
    buildStorytellerBaselinePreset({ pass, sceneMode }),
    buildStorytellerGlmOverlay({ pass, sceneMode }),
  ].join("\n\n");
}

describe("storyteller-contract", () => {
  it("separates worldview, canonical context, and tool support into distinct blocks", () => {
    expect(STORYTELLER_WORLD_RULES).toContain("narrative prose");
    expect(STORYTELLER_CONTEXT_RULES).toContain("canonical character records");
    expect(STORYTELLER_TOOL_SUPPORT_RULES).toContain("offer_quick_actions");

    expect(STORYTELLER_WORLD_RULES).not.toBe(STORYTELLER_CONTEXT_RULES);
    expect(STORYTELLER_CONTEXT_RULES).not.toBe(STORYTELLER_TOOL_SUPPORT_RULES);

    const combined = buildStorytellerContract();
    expect(combined).toContain("narrative prose");
    expect(combined).toContain("canonical character records");
    expect(combined).toContain("offer_quick_actions");
  });

  it("keeps hard runtime constraints while removing unqualified tag-only worldview text", () => {
    expect(STORYTELLER_WORLD_RULES).toContain("outcome");
    expect(STORYTELLER_WORLD_RULES).toContain("world premise");
    expect(STORYTELLER_WORLD_RULES).not.toContain("all characters, items, locations, and factions use a tag-based system");
    expect(STORYTELLER_CONTEXT_RULES).toContain("derived runtime tags");
    expect(STORYTELLER_CONTEXT_RULES).toContain("startConditions");
  });

  it("keeps quick-action and HP obligations in one authoritative tool-support block", () => {
    expect(STORYTELLER_TOOL_SUPPORT_RULES).toContain("offer_quick_actions");
    expect(STORYTELLER_TOOL_SUPPORT_RULES).toContain("light hit = -1");
    expect(STORYTELLER_WORLD_RULES).not.toContain("offer_quick_actions");
    expect(STORYTELLER_CONTEXT_RULES).not.toContain("offer_quick_actions");
    expect(STORYTELLER_WORLD_RULES).not.toContain("light hit = -1");
    expect(STORYTELLER_CONTEXT_RULES).not.toContain("light hit = -1");
  });

  it("produces a preset-style seam for hidden and final passes without banned artifacts", () => {
    const hidden = buildContractPresetSample("hidden-tool-driving");
    const final = buildContractPresetSample("final-visible", "horror");

    expect(hidden).toContain("simulate scene-state");
    expect(hidden).toContain("GLM");
    expect(final).toContain("visible");

    assertNoRejectedMotifs(hidden);
    assertNoRejectedMotifs(final);
  });
});
