import { describe, it, expect } from "vitest";
import { buildV2CardSections } from "../v2-sections.js";

describe("buildV2CardSections", () => {
  it("includes all fields when present", () => {
    const result = buildV2CardSections({
      name: "Aria",
      description: "A wandering bard.",
      personality: "Cheerful and witty.",
      scenario: "Lost in the woods.",
      v2Tags: ["female", "bard"],
    });

    expect(result).toContain("CHARACTER NAME: Aria");
    expect(result).toContain("CHARACTER DESCRIPTION:\nA wandering bard.");
    expect(result).toContain("PERSONALITY:\nCheerful and witty.");
    expect(result).toContain("SCENARIO CONTEXT:\nLost in the woods.");
    expect(result).toContain("SOURCE TAGS: female, bard");
  });

  it("omits personality when empty", () => {
    const result = buildV2CardSections({
      name: "Aria",
      description: "A bard.",
      personality: "",
      scenario: "Lost.",
      v2Tags: [],
    });

    expect(result).not.toContain("PERSONALITY:");
  });

  it("omits scenario when empty", () => {
    const result = buildV2CardSections({
      name: "Aria",
      description: "A bard.",
      personality: "Cheerful.",
      scenario: "",
      v2Tags: [],
    });

    expect(result).not.toContain("SCENARIO CONTEXT:");
  });

  it("omits source tags when array is empty", () => {
    const result = buildV2CardSections({
      name: "Aria",
      description: "A bard.",
      personality: "",
      scenario: "",
      v2Tags: [],
    });

    expect(result).not.toContain("SOURCE TAGS:");
  });

  it("separates sections with double newlines", () => {
    const result = buildV2CardSections({
      name: "Aria",
      description: "A bard.",
      personality: "Cheerful.",
      scenario: "Lost.",
      v2Tags: ["tag"],
    });

    const sections = result.split("\n\n");
    expect(sections.length).toBe(5);
  });

  it("includes name and description even with all other fields empty", () => {
    const result = buildV2CardSections({
      name: "Test",
      description: "Desc.",
      personality: "",
      scenario: "",
      v2Tags: [],
    });

    expect(result).toBe("CHARACTER NAME: Test\n\nCHARACTER DESCRIPTION:\nDesc.");
  });
});
