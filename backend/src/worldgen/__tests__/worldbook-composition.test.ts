import { describe, expect, it } from "vitest";
import type { StoredWorldbookLibraryRecord } from "../../worldbook-library/manager.js";
import { composeWorldbookLibraryRecords } from "../../worldbook-library/composition.js";

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
});
