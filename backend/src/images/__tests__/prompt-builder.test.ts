import { describe, it, expect } from "vitest";
import {
  buildPortraitPrompt,
  buildLocationPrompt,
  buildScenePrompt,
  type PortraitPromptOptions,
  type LocationPromptOptions,
  type ScenePromptOptions,
} from "../prompt-builder.js";

// ---------------------------------------------------------------------------
// buildPortraitPrompt
// ---------------------------------------------------------------------------
describe("buildPortraitPrompt", () => {
  const base: PortraitPromptOptions = {
    name: "Aldric",
    race: "Human",
    gender: "male",
    age: "35",
    appearance: "tall with a scar across his left cheek",
    tags: ["brave", "scarred", "skill:swordplay", "faction:Knights"],
    stylePrompt: "oil painting, dramatic lighting",
  };

  it("includes name, race, gender, age in the opening", () => {
    const result = buildPortraitPrompt(base);
    expect(result).toContain("Portrait of Aldric, Human male, 35");
  });

  it("includes appearance text", () => {
    const result = buildPortraitPrompt(base);
    expect(result).toContain("tall with a scar across his left cheek");
  });

  it("filters out non-visual tags", () => {
    const result = buildPortraitPrompt(base);
    expect(result).toContain("brave");
    expect(result).toContain("scarred");
    expect(result).not.toContain("skill:swordplay");
    expect(result).not.toContain("faction:Knights");
  });

  it("filters all non-visual prefixes (case-insensitive)", () => {
    const opts: PortraitPromptOptions = {
      ...base,
      tags: [
        "wealth:rich",
        "Skill:Archery",
        "relationship:ally",
        "Faction:Empire",
        "quest:find_sword",
        "goal:revenge",
        "reputation:feared",
        "muscular",
      ],
    };
    const result = buildPortraitPrompt(opts);
    expect(result).toContain("muscular");
    expect(result).not.toContain("wealth:");
    expect(result).not.toContain("Skill:");
    expect(result).not.toContain("relationship:");
    expect(result).not.toContain("quest:");
    expect(result).not.toContain("goal:");
    expect(result).not.toContain("reputation:");
  });

  it("appends style prompt at the end", () => {
    const result = buildPortraitPrompt(base);
    expect(result).toContain("oil painting, dramatic lighting");
  });

  it("ends with a period", () => {
    const result = buildPortraitPrompt(base);
    expect(result.endsWith(".")).toBe(true);
  });

  it("omits appearance section when empty", () => {
    const opts: PortraitPromptOptions = { ...base, appearance: "" };
    const result = buildPortraitPrompt(opts);
    // Should not have an empty ". ." in the middle
    expect(result).not.toContain(". .");
  });

  it("omits tags section when all tags are non-visual", () => {
    const opts: PortraitPromptOptions = {
      ...base,
      tags: ["skill:magic", "faction:Mages"],
    };
    const result = buildPortraitPrompt(opts);
    expect(result).not.toContain("Tags:");
  });

  it("omits tags section when tags array is empty", () => {
    const opts: PortraitPromptOptions = { ...base, tags: [] };
    const result = buildPortraitPrompt(opts);
    expect(result).not.toContain("Tags:");
  });

  it("omits style prompt when empty", () => {
    const opts: PortraitPromptOptions = { ...base, stylePrompt: "" };
    const result = buildPortraitPrompt(opts);
    expect(result).not.toContain("oil painting");
  });

  it("assembles all parts with period-space separator", () => {
    const result = buildPortraitPrompt(base);
    const expected =
      "Portrait of Aldric, Human male, 35. " +
      "tall with a scar across his left cheek. " +
      "Tags: brave, scarred. " +
      "oil painting, dramatic lighting.";
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// buildLocationPrompt
// ---------------------------------------------------------------------------
describe("buildLocationPrompt", () => {
  const base: LocationPromptOptions = {
    locationName: "Ironhold Keep",
    tags: ["fortress", "mountain"],
    premise: "A dark fantasy world ravaged by war",
    stylePrompt: "concept art, moody",
  };

  it("starts with Fantasy landscape prefix", () => {
    const result = buildLocationPrompt(base);
    expect(result).toContain("Fantasy landscape: Ironhold Keep");
  });

  it("includes tags joined by commas", () => {
    const result = buildLocationPrompt(base);
    expect(result).toContain("fortress, mountain");
  });

  it("includes premise with World prefix", () => {
    const result = buildLocationPrompt(base);
    expect(result).toContain("World: A dark fantasy world ravaged by war");
  });

  it("truncates long premises to 200 chars", () => {
    const longPremise = "A".repeat(300);
    const opts: LocationPromptOptions = { ...base, premise: longPremise };
    const result = buildLocationPrompt(opts);
    // 200 chars + "..."
    expect(result).toContain("World: " + "A".repeat(200) + "...");
  });

  it("does not truncate premise at exactly 200 chars", () => {
    const exactPremise = "B".repeat(200);
    const opts: LocationPromptOptions = { ...base, premise: exactPremise };
    const result = buildLocationPrompt(opts);
    expect(result).toContain("World: " + "B".repeat(200));
    expect(result).not.toContain("...");
  });

  it("omits tags section when empty", () => {
    const opts: LocationPromptOptions = { ...base, tags: [] };
    const result = buildLocationPrompt(opts);
    // Second part should be World: ...
    expect(result).toMatch(/^Fantasy landscape: Ironhold Keep\. World:/);
  });

  it("omits premise when empty", () => {
    const opts: LocationPromptOptions = { ...base, premise: "" };
    const result = buildLocationPrompt(opts);
    expect(result).not.toContain("World:");
  });

  it("ends with a period", () => {
    const result = buildLocationPrompt(base);
    expect(result.endsWith(".")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildScenePrompt
// ---------------------------------------------------------------------------
describe("buildScenePrompt", () => {
  const base: ScenePromptOptions = {
    eventText: "The dragon swoops down on the village",
    locationName: "Ashvale",
    premise: "High fantasy realm of Eldoria",
    stylePrompt: "cinematic, wide angle",
  };

  it("starts with Scene illustration prefix", () => {
    const result = buildScenePrompt(base);
    expect(result).toContain(
      "Scene illustration: The dragon swoops down on the village"
    );
  });

  it("includes setting with location name", () => {
    const result = buildScenePrompt(base);
    expect(result).toContain("Setting: Ashvale");
  });

  it("includes world premise", () => {
    const result = buildScenePrompt(base);
    expect(result).toContain("World: High fantasy realm of Eldoria");
  });

  it("appends style prompt", () => {
    const result = buildScenePrompt(base);
    expect(result).toContain("cinematic, wide angle");
  });

  it("omits setting when locationName is empty", () => {
    const opts: ScenePromptOptions = { ...base, locationName: "" };
    const result = buildScenePrompt(opts);
    expect(result).not.toContain("Setting:");
  });

  it("omits premise when empty", () => {
    const opts: ScenePromptOptions = { ...base, premise: "" };
    const result = buildScenePrompt(opts);
    expect(result).not.toContain("World:");
  });

  it("omits style prompt when empty", () => {
    const opts: ScenePromptOptions = { ...base, stylePrompt: "" };
    const result = buildScenePrompt(opts);
    expect(result).not.toContain("cinematic");
  });

  it("truncates long premise to 200 chars", () => {
    const longPremise = "X".repeat(250);
    const opts: ScenePromptOptions = { ...base, premise: longPremise };
    const result = buildScenePrompt(opts);
    expect(result).toContain("World: " + "X".repeat(200) + "...");
  });

  it("ends with a period", () => {
    const result = buildScenePrompt(base);
    expect(result.endsWith(".")).toBe(true);
  });

  it("works with only required fields", () => {
    const opts: ScenePromptOptions = {
      eventText: "A battle begins",
      locationName: "",
      premise: "",
      stylePrompt: "",
    };
    const result = buildScenePrompt(opts);
    expect(result).toBe("Scene illustration: A battle begins.");
  });
});
