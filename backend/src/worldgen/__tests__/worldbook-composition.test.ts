import { describe, expect, it } from "vitest";
import type { StoredWorldbookLibraryRecord } from "../../worldbook-library/manager.js";
import { composeWorldbookLibraryRecords } from "../../worldbook-library/composition.js";
import type { ClassifiedEntry } from "../worldbook-importer.js";

function buildRecord(
  overrides: Partial<StoredWorldbookLibraryRecord> & Pick<StoredWorldbookLibraryRecord, "id" | "displayName">,
): StoredWorldbookLibraryRecord {
  return {
    id: overrides.id,
    displayName: overrides.displayName,
    normalizedSourceHash: overrides.normalizedSourceHash ?? overrides.id,
    entryCount: overrides.entryCount ?? overrides.entries?.length ?? 0,
    classificationVersion: overrides.classificationVersion ?? 1,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    originalFileName: overrides.originalFileName,
    entries: overrides.entries ?? [],
  };
}

describe("composeWorldbookLibraryRecords", () => {
  it("produces the same merged result regardless of selected source order", () => {
    const alpha = buildRecord({
      id: "wb-alpha",
      displayName: "Alpha Archive",
      entries: [
        { name: "Captain Mira", type: "character", summary: "A decorated sky captain." },
        { name: "Sunspire", type: "location", summary: "A trading city built on mesas." },
      ],
    });
    const beta = buildRecord({
      id: "wb-beta",
      displayName: "Beta Codex",
      entries: [
        { name: "Captain Mira", type: "character", summary: "Leader of the brass-wing fleet." },
        { name: "The Maw", type: "location", summary: "A storm trench haunted by leviathans." },
      ],
    });

    const forward = composeWorldbookLibraryRecords([alpha, beta]);
    const reversed = composeWorldbookLibraryRecords([beta, alpha]);

    expect(reversed).toEqual(forward);
    expect(forward.worldbookSelection.map((item) => item.id)).toEqual(["wb-alpha", "wb-beta"]);
  });

  it("groups duplicates by type plus normalized name instead of request order", () => {
    const alpha = buildRecord({
      id: "wb-alpha",
      displayName: "Alpha Archive",
      entries: [
        { name: "Nexus", type: "character", summary: "A rogue archivist who guards forbidden routes." },
        { name: "Nexus", type: "location", summary: "A ring-port where all trade routes converge." },
      ],
    });
    const beta = buildRecord({
      id: "wb-beta",
      displayName: "Beta Codex",
      entries: [
        { name: " nexus ", type: "character", summary: "An outlaw courier known only as Nexus." },
      ],
    });

    const result = composeWorldbookLibraryRecords([beta, alpha]);

    expect(result.ipContext.keyFacts).toContain(
      "Nexus: A rogue archivist who guards forbidden routes.",
    );
    expect(result.ipContext.keyFacts).toContain(
      "Nexus: A ring-port where all trade routes converge.",
    );
    expect(result.ipContext.keyFacts).not.toContain(
      " nexus : An outlaw courier known only as Nexus.",
    );

    expect(result.provenance.groups.map((group) => group.entityKey)).toEqual([
      "character:nexus",
      "location:nexus",
    ]);
  });

  it("returns merged ipContext together with provenance for every contributing source", () => {
    const alpha = buildRecord({
      id: "wb-alpha",
      displayName: "Alpha Archive",
      entries: [
        { name: "Captain Mira", type: "character", summary: "A decorated sky captain." },
        { name: "Storm law", type: "lore_general", summary: "Lightning oaths bind all captains." },
      ],
    });
    const beta = buildRecord({
      id: "wb-beta",
      displayName: "Beta Codex",
      entries: [
        { name: "Captain Mira", type: "character", summary: "Leader of the brass-wing fleet." },
      ],
    });

    const result = composeWorldbookLibraryRecords([alpha, beta]);
    const captainMira = result.provenance.groups.find(
      (group) => group.entityKey === "character:captain mira",
    );

    expect(result.ipContext.franchise).toBe("Alpha Archive + Beta Codex");
    expect(result.ipContext.tonalNotes).toEqual(["Lightning oaths bind all captains."]);
    expect(captainMira).toEqual({
      entityKey: "character:captain mira",
      type: "character",
      name: "Captain Mira",
      summary: "A decorated sky captain.",
      contributions: [
        {
          sourceId: "wb-alpha",
          sourceDisplayName: "Alpha Archive",
          entryName: "Captain Mira",
          summary: "A decorated sky captain.",
        },
        {
          sourceId: "wb-beta",
          sourceDisplayName: "Beta Codex",
          entryName: "Captain Mira",
          summary: "Leader of the brass-wing fleet.",
        },
      ],
    });
  });

  describe("source-grouped composition", () => {
    function makeEntries(prefix: string, count: number): ClassifiedEntry[] {
      return Array.from({ length: count }, (_, i) => ({
        name: `${prefix}-Entity-${i + 1}`,
        type: "lore_general" as const,
        summary: `${prefix} lore fact number ${i + 1}.`,
      }));
    }

    it("single-worldbook returns sourceGroups with one primary group and keyFacts unchanged", () => {
      const single = buildRecord({
        id: "wb-single",
        displayName: "Voices of the Void",
        entries: [
          { name: "The Signal", type: "lore_general", summary: "A mysterious broadcast from deep space." },
          { name: "Dr. Kel", type: "character", summary: "Lead researcher at the observatory." },
        ],
      });

      const result = composeWorldbookLibraryRecords([single]);

      // sourceGroups should exist with one primary group
      expect(result.ipContext.sourceGroups).toBeDefined();
      expect(result.ipContext.sourceGroups).toHaveLength(1);
      expect(result.ipContext.sourceGroups![0].priority).toBe("primary");
      expect(result.ipContext.sourceGroups![0].sourceName).toBe("Voices of the Void");
      // flat keyFacts still present for backward compat
      expect(result.ipContext.keyFacts.length).toBe(2);
    });

    it("two-worldbook composition with premise 'mainly Alpha' tags Alpha as primary, Beta as supplementary", () => {
      const alpha = buildRecord({
        id: "wb-alpha",
        displayName: "Alpha Archive",
        entries: [
          { name: "Alpha City", type: "location", summary: "The capital of Alpha realm." },
          { name: "Alpha Lord", type: "character", summary: "Ruler of Alpha." },
        ],
      });
      const beta = buildRecord({
        id: "wb-beta",
        displayName: "Beta Codex",
        entries: [
          { name: "Beta Town", type: "location", summary: "A small town in Beta." },
        ],
      });

      const result = composeWorldbookLibraryRecords(
        [alpha, beta],
        "A world mainly based on Alpha Archive with some Beta elements",
      );

      expect(result.ipContext.sourceGroups).toBeDefined();
      expect(result.ipContext.sourceGroups).toHaveLength(2);

      const primaryGroup = result.ipContext.sourceGroups!.find((g) => g.priority === "primary");
      const suppGroup = result.ipContext.sourceGroups!.find((g) => g.priority === "supplementary");

      expect(primaryGroup).toBeDefined();
      expect(primaryGroup!.sourceName).toBe("Alpha Archive");
      expect(suppGroup).toBeDefined();
      expect(suppGroup!.sourceName).toBe("Beta Codex");
    });

    it("supplementary source with 60+ entries is capped to 15 in sourceGroups", () => {
      const primary = buildRecord({
        id: "wb-primary",
        displayName: "VotV",
        entries: makeEntries("VotV", 15),
      });
      const secondary = buildRecord({
        id: "wb-secondary",
        displayName: "SCP Foundation",
        entries: makeEntries("SCP", 60),
      });

      const result = composeWorldbookLibraryRecords(
        [primary, secondary],
        "A world primarily based on VotV with small SCP elements",
      );

      const suppGroup = result.ipContext.sourceGroups!.find((g) => g.priority === "supplementary");
      expect(suppGroup).toBeDefined();
      expect(suppGroup!.keyFacts.length).toBeLessThanOrEqual(15);
      // primary should have all its entries
      const primGroup = result.ipContext.sourceGroups!.find((g) => g.priority === "primary");
      expect(primGroup).toBeDefined();
      expect(primGroup!.keyFacts.length).toBe(15);
    });

    it("without premise hint, all sources default to primary", () => {
      const alpha = buildRecord({
        id: "wb-alpha",
        displayName: "Alpha Archive",
        entries: [
          { name: "Alpha City", type: "location", summary: "The capital." },
        ],
      });
      const beta = buildRecord({
        id: "wb-beta",
        displayName: "Beta Codex",
        entries: [
          { name: "Beta Town", type: "location", summary: "A town." },
        ],
      });

      const result = composeWorldbookLibraryRecords([alpha, beta]);

      expect(result.ipContext.sourceGroups).toBeDefined();
      const priorities = result.ipContext.sourceGroups!.map((g) => g.priority);
      expect(priorities).toEqual(["primary", "primary"]);
    });

    it("canonicalNames are merged across sources (existing behavior preserved)", () => {
      const alpha = buildRecord({
        id: "wb-alpha",
        displayName: "Alpha Archive",
        entries: [
          { name: "Alpha City", type: "location", summary: "The capital of Alpha." },
          { name: "Alpha Guild", type: "faction", summary: "A guild in Alpha." },
        ],
      });
      const beta = buildRecord({
        id: "wb-beta",
        displayName: "Beta Codex",
        entries: [
          { name: "Beta Town", type: "location", summary: "A town in Beta." },
          { name: "Beta Corp", type: "faction", summary: "A corporation in Beta." },
        ],
      });

      const result = composeWorldbookLibraryRecords([alpha, beta]);

      // Merged canonicalNames should contain entries from both sources
      expect(result.ipContext.canonicalNames?.locations).toContain("Alpha City");
      expect(result.ipContext.canonicalNames?.locations).toContain("Beta Town");
      expect(result.ipContext.canonicalNames?.factions).toContain("Alpha Guild");
      expect(result.ipContext.canonicalNames?.factions).toContain("Beta Corp");
    });
  });
});
