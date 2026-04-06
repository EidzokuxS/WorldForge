import { describe, it } from "vitest";

describe("lore-extractor: per-category calls (D-06)", () => {
  it.todo("extractLoreCards makes 4 separate LLM calls (location, faction, NPC, concept)");
  it.todo("each category call has a focused prompt for its domain");
  it.todo("results are merged and deduplicated by term (case-insensitive)");
  it.todo("if one category call fails, other categories still succeed");
  it.todo("sub-progress reports 0/4, 1/4, 2/4, 3/4 for each category");
  it.todo("location lore call only emits location and event category cards");
  it.todo("faction lore call only emits faction and rule category cards");
  it.todo("NPC lore call only emits npc and ability category cards");
});
