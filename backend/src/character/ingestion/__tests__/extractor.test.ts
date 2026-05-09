import { describe, it, expect } from "vitest";
import { extractIngestionSources } from "../extractor.js";
import type { IngestionInput } from "../types.js";
import gojoCard from "./fixtures/v2-gojo.json" with { type: "json" };
import rogueCard from "./fixtures/v2-original-rogue.json" with { type: "json" };

describe("extractIngestionSources", () => {
  it("maps import mode with full card payload and displayName", () => {
    const input: IngestionInput = {
      mode: "import",
      campaignId: "c1",
      role: "player",
      v2Card: gojoCard as any,
      overrideText: "Eyes are red not blue",
    };
    const out = extractIngestionSources(input);
    expect(out.mode).toBe("import");
    expect(out.role).toBe("player");
    expect(out.card).toEqual(gojoCard);
    expect(out.displayName).toBe("Gojo Satoru");
    expect(out.overrideText).toBe("Eyes are red not blue");
    expect(out.freeText).toBeNull();
    expect(out.archetype).toBeNull();
  });

  it("maps parse mode with free text and no card", () => {
    const input: IngestionInput = {
      mode: "parse",
      campaignId: "c1",
      role: "player",
      freeText: "  a haunted clockmaker  ",
    };
    const out = extractIngestionSources(input);
    expect(out.freeText).toBe("a haunted clockmaker");
    expect(out.card).toBeNull();
    expect(out.displayName).toBeNull();
  });

  it("maps research mode with archetype", () => {
    const input: IngestionInput = {
      mode: "research",
      campaignId: "c1",
      role: "key",
      archetype: "world-weary paladin",
    };
    const out = extractIngestionSources(input);
    expect(out.archetype).toBe("world-weary paladin");
    expect(out.role).toBe("key");
  });

  it("maps generate mode with all source fields null", () => {
    const input: IngestionInput = {
      mode: "generate",
      campaignId: "c1",
      role: "player",
    };
    const out = extractIngestionSources(input);
    expect(out.freeText).toBeNull();
    expect(out.archetype).toBeNull();
    expect(out.card).toBeNull();
    expect(out.displayName).toBeNull();
  });

  it("coerces empty-string overrideText to null", () => {
    const input: IngestionInput = {
      mode: "import",
      campaignId: "c1",
      role: "player",
      v2Card: rogueCard as any,
      overrideText: "   ",
    };
    expect(extractIngestionSources(input).overrideText).toBeNull();
  });

  it("trims overrideText whitespace", () => {
    const input: IngestionInput = {
      mode: "parse",
      campaignId: "c1",
      role: "player",
      freeText: "test",
      overrideText: "  she is weaker than canon  ",
    };
    expect(extractIngestionSources(input).overrideText).toBe(
      "she is weaker than canon",
    );
  });

  it("preserves original character card without canon tags", () => {
    const input: IngestionInput = {
      mode: "import",
      campaignId: "c1",
      role: "player",
      v2Card: rogueCard as any,
    };
    const out = extractIngestionSources(input);
    expect(out.displayName).toBe("Serin Varn");
    expect(out.overrideText).toBeNull();
  });
});
