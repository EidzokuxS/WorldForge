import { describe, expect, it } from "vitest";
import {
  CANONICAL_CHARACTER_FIELD_GROUPS,
  CHARACTER_ONTOLOGY_CONTRACT,
  DERIVED_RUNTIME_TAGS_RULE,
  PERSONA_TEMPLATE_PATCH_RULE,
  CANONICAL_LOADOUT_RULE,
  START_CONDITIONS_CONTRACT,
  buildCharacterPromptContract,
} from "../prompt-contract.js";

describe("prompt-contract", () => {
  it("names the canonical field groups in Phase 29/30 order", () => {
    expect(CANONICAL_CHARACTER_FIELD_GROUPS).toEqual([
      "identity",
      "profile",
      "socialContext",
      "motivations",
      "capabilities",
      "state",
      "loadout",
      "startConditions",
      "provenance",
    ]);

    const contract = CHARACTER_ONTOLOGY_CONTRACT;
    expect(contract.indexOf("identity")).toBeLessThan(contract.indexOf("profile"));
    expect(contract.indexOf("profile")).toBeLessThan(contract.indexOf("socialContext"));
    expect(contract.indexOf("socialContext")).toBeLessThan(contract.indexOf("motivations"));
    expect(contract.indexOf("motivations")).toBeLessThan(contract.indexOf("capabilities"));
    expect(contract.indexOf("capabilities")).toBeLessThan(contract.indexOf("state"));
    expect(contract.indexOf("state")).toBeLessThan(contract.indexOf("loadout"));
    expect(contract.indexOf("loadout")).toBeLessThan(contract.indexOf("startConditions"));
    expect(contract.indexOf("startConditions")).toBeLessThan(contract.indexOf("provenance"));
  });

  it("frames derived runtime tags as a compatibility view instead of the source model", () => {
    expect(DERIVED_RUNTIME_TAGS_RULE).toContain("compatibility view");
    expect(DERIVED_RUNTIME_TAGS_RULE).toContain("source-of-truth");
    expect(DERIVED_RUNTIME_TAGS_RULE).not.toContain("tag-only system");
    expect(DERIVED_RUNTIME_TAGS_RULE).not.toContain("all characters use a tag-based system");
  });

  it("exposes shared persona-template, start-condition, and canonical-loadout wording", () => {
    expect(PERSONA_TEMPLATE_PATCH_RULE).toContain("CharacterDraftPatch");
    expect(PERSONA_TEMPLATE_PATCH_RULE).toContain("shared draft pipeline");
    expect(PERSONA_TEMPLATE_PATCH_RULE).not.toContain("player-only");
    expect(PERSONA_TEMPLATE_PATCH_RULE).not.toContain("NPC-only");

    expect(START_CONDITIONS_CONTRACT).toContain("arrivalMode");
    expect(START_CONDITIONS_CONTRACT).toContain("immediateSituation");
    expect(START_CONDITIONS_CONTRACT).toContain("resolvedNarrative");

    expect(CANONICAL_LOADOUT_RULE).toContain("CanonicalLoadoutPreview");
    expect(CANONICAL_LOADOUT_RULE).toContain("audit");
    expect(CANONICAL_LOADOUT_RULE).toContain("warnings");

    const composed = buildCharacterPromptContract();
    expect(composed).toContain("identity");
    expect(composed).toContain("persona template");
    expect(composed).toContain("canonical loadout");
    expect(composed).not.toContain("player schema");
    expect(composed).not.toContain("npc schema");
  });
});
