import { describe, it, expect } from "vitest";
import { classifyCanonicalStatus } from "../classifier.js";
import type { IngestionSources } from "../types.js";
import type { IpResearchContext } from "@worldforge/shared";

const baseSources: IngestionSources = {
  mode: "import",
  role: "player",
  freeText: null,
  archetype: null,
  card: null,
  overrideText: null,
  displayName: null,
};

const jjkContext: IpResearchContext = {
  franchise: "Jujutsu Kaisen",
  canonicalNames: {
    characters: ["Gojo Satoru", "Yuji Itadori"],
    locations: [],
    factions: [],
  },
  excludedCharacters: [],
} as any;

describe("classifyCanonicalStatus", () => {
  it("returns known_ip_canonical when card name matches canonical characters", () => {
    const out = classifyCanonicalStatus({
      sources: { ...baseSources, displayName: "Gojo Satoru", card: {} as any },
      ipContext: jjkContext,
      premiseDivergence: null,
    });
    expect(out.canonicalStatus).toBe("known_ip_canonical");
    expect(out.franchise).toBe("Jujutsu Kaisen");
  });

  it("is case-insensitive on canonical name match", () => {
    const out = classifyCanonicalStatus({
      sources: { ...baseSources, displayName: "gojo satoru", card: {} as any },
      ipContext: jjkContext,
      premiseDivergence: null,
    });
    expect(out.canonicalStatus).toBe("known_ip_canonical");
  });

  it("returns known_ip_diverged when name is canonical but excluded", () => {
    const out = classifyCanonicalStatus({
      sources: { ...baseSources, displayName: "Gojo Satoru", card: {} as any },
      ipContext: { ...jjkContext, excludedCharacters: ["Gojo Satoru"] } as any,
      premiseDivergence: null,
    });
    expect(out.canonicalStatus).toBe("known_ip_diverged");
  });

  it("returns imported when card exists but name is not canonical", () => {
    const out = classifyCanonicalStatus({
      sources: { ...baseSources, displayName: "Serin Varn", card: {} as any },
      ipContext: jjkContext,
      premiseDivergence: null,
    });
    expect(out.canonicalStatus).toBe("imported");
  });

  it("returns original when no card and no ipContext", () => {
    const out = classifyCanonicalStatus({
      sources: { ...baseSources, mode: "parse", freeText: "a rogue" },
      ipContext: null,
      premiseDivergence: null,
    });
    expect(out.canonicalStatus).toBe("original");
    expect(out.franchise).toBeNull();
  });

  it("returns imported when card but ipContext null", () => {
    const out = classifyCanonicalStatus({
      sources: { ...baseSources, displayName: "Anyone", card: {} as any },
      ipContext: null,
      premiseDivergence: null,
    });
    expect(out.canonicalStatus).toBe("imported");
  });

  it("detects canonical name inside archetype string (research mode)", () => {
    const out = classifyCanonicalStatus({
      sources: {
        ...baseSources,
        mode: "research",
        archetype: "Gojo Satoru the strongest",
      },
      ipContext: jjkContext,
      premiseDivergence: null,
    });
    expect(out.canonicalStatus).toBe("known_ip_canonical");
  });

  it("returns original for generate mode with no ipContext", () => {
    const out = classifyCanonicalStatus({
      sources: { ...baseSources, mode: "generate" },
      ipContext: null,
      premiseDivergence: null,
    });
    expect(out.canonicalStatus).toBe("original");
  });
});
