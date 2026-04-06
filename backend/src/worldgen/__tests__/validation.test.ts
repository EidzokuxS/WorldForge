import { describe, it } from "vitest";

describe("validation: LLM validation loop (D-03)", () => {
  it.todo("validateAndFixStage returns clean entities when no critical issues found");
  it.todo("validateAndFixStage re-generates flagged entities on critical issues");
  it.todo("validateAndFixStage stops after MAX_VALIDATION_ROUNDS (3) even with remaining issues");
  it.todo("validateAndFixStage only re-generates entities matching critical issue entityName");
  it.todo("validateCrossStage runs up to 3 validate-fix-revalidate rounds for semantic issues");
  it.todo("validateCrossStage normalizes NPC locationName to valid location names via code");
  it.todo("validateCrossStage normalizes faction territoryNames to valid location names via code");
  it.todo("validateCrossStage normalizes location connectedTo to valid location names via code");
  it.todo("validateCrossStage removes self-links from connectedTo");
  it.todo("validateCrossStage re-generates NPCs with semantic cross-stage issues via regen helpers");
});

describe("validation: Judge role (D-04)", () => {
  it.todo("validateAndFixStage uses Judge role provider for validation calls");
  it.todo("validateCrossStage uses Judge role provider");
  it.todo("re-generation uses Generator role, not Judge role");
});
