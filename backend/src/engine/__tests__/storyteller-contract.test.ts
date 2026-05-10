import { describe, expect, it } from "vitest";
import {
  STORYTELLER_WORLD_RULES,
  STORYTELLER_RP_PLAY_RULES,
  STORYTELLER_PROSE_TECHNIQUE_RULES,
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
    expect(STORYTELLER_RP_PLAY_RULES).toContain("one playable RPG/VN beat");
    expect(STORYTELLER_RP_PLAY_RULES).toContain("Player agency is locked");
    expect(STORYTELLER_RP_PLAY_RULES).toContain("NPCs are autonomous");
    expect(STORYTELLER_RP_PLAY_RULES).toContain("The first sentence must add new pressure");
    expect(STORYTELLER_RP_PLAY_RULES).toContain("already supported by authoritative inputs");
    expect(STORYTELLER_RP_PLAY_RULES).toContain("one concrete line, gesture, decision, or refusal");
    expect(STORYTELLER_PROSE_TECHNIQUE_RULES).toContain("plain scene truth first");
    expect(STORYTELLER_PROSE_TECHNIQUE_RULES).toContain("Write what an actor could perform");
    expect(STORYTELLER_PROSE_TECHNIQUE_RULES).toContain("replace 'the air was thick with tension'");
    expect(STORYTELLER_PROSE_TECHNIQUE_RULES).toContain("mundane or tourist turns");
    expect(STORYTELLER_CONTEXT_RULES).toContain("canonical character records");
    expect(STORYTELLER_TOOL_SUPPORT_RULES).toContain("offer_quick_actions");

    expect(STORYTELLER_WORLD_RULES).not.toBe(STORYTELLER_CONTEXT_RULES);
    expect(STORYTELLER_CONTEXT_RULES).not.toBe(STORYTELLER_TOOL_SUPPORT_RULES);
    expect(STORYTELLER_RP_PLAY_RULES).not.toBe(STORYTELLER_WORLD_RULES);
    expect(STORYTELLER_PROSE_TECHNIQUE_RULES).not.toBe(STORYTELLER_RP_PLAY_RULES);

    const combined = buildStorytellerContract();
    expect(combined).toContain("narrative prose");
    expect(combined).toContain("one playable RPG/VN beat");
    expect(combined).toContain("Player agency is locked");
    expect(combined).toContain("canonical character records");
    expect(combined).toContain("offer_quick_actions");
    expect(combined).not.toContain("plain scene truth first");

    const finalCombined = buildStorytellerContract({ pass: "final-visible" });
    expect(finalCombined).toContain("plain scene truth first");
    expect(finalCombined).toContain("one local behavior or object");
    expect(finalCombined).toContain("If no authoritative effect is present");
    expect(finalCombined).toContain("do not add reusable props, routes, hazards, documents, authorities");
    expect(finalCombined).not.toContain("offer_quick_actions");
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

  it("adds GLM overlay text only when requested and shares preset source across passes", () => {
    const hiddenPlain = buildStorytellerContract({ pass: "hidden-tool-driving" });
    const hiddenWithOverlay = buildStorytellerContract({
      pass: "hidden-tool-driving",
      includeGlmOverlay: true,
    });
    const finalWithOverlay = buildStorytellerContract({
      pass: "final-visible",
      includeGlmOverlay: true,
    });

    expect(hiddenPlain).toContain("Do not speak or decide for the player");
    expect(hiddenPlain).not.toContain("preserve sampler behavior");

    expect(hiddenWithOverlay).toContain("cut repetitive loops");
    expect(hiddenWithOverlay).toContain("preserve sampler behavior");

    expect(finalWithOverlay).toContain("Write one final narration");
    expect(finalWithOverlay).toContain("visible pass");
    expect(finalWithOverlay).not.toContain("Do not speak or decide for the player");
  });

  it("can pin final-visible narration to the session response language", () => {
    const contract = buildStorytellerContract({
      pass: "final-visible",
      responseLanguage: {
        languageName: "English",
        source: "inferred",
        reason: "current player action language",
      },
    });

    expect(contract).toContain("SESSION RESPONSE LANGUAGE");
    expect(contract).toContain("Output language: English.");
    expect(contract).toContain("proper nouns");
    expect(contract).toContain("Do not switch language because of operator locale");
    expect(contract).toContain("plain scene truth first");
  });

  it("uses a non-conflicting final-visible JSON draft output mode", () => {
    const contract = buildStorytellerContract({
      pass: "final-visible",
      outputMode: "narration-draft-json",
    });

    expect(contract).toContain("Return exactly one JSON object");
    expect(contract).toContain("prose field must contain narrative prose only");
    expect(contract).not.toContain("Your output must be narrative prose only.");
    expect(contract).toContain("plain scene truth first");
  });
});
