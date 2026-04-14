import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredWorldbookLibraryRecord } from "../../worldbook-library/manager.js";
import { composeWorldbookLibraryRecords } from "../../worldbook-library/composition.js";

const mockSafeGenerateObject = vi.fn();
vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockSafeGenerateObject(...args),
}));

vi.mock("../../settings/manager.js", () => ({
  loadSettings: () => ({ judge: { providerId: "test", model: "test", temperature: 0, maxTokens: 4096 }, providers: [{ id: "test", name: "Test", baseUrl: "http://test", apiKey: "test-key", defaultModel: "test-model" }] }),
}));

vi.mock("../../ai/resolve-role-model.js", () => ({
  resolveRoleModel: () => ({ provider: { id: "test", name: "Test", baseUrl: "http://test", apiKey: "test-key", model: "test-model" }, temperature: 0, maxTokens: 4096 }),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: () => ({}),
}));

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
  beforeEach(() => {
    mockSafeGenerateObject.mockReset();
  });

  it("produces the same merged result regardless of selected source order", async () => {
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

    const forward = await composeWorldbookLibraryRecords([alpha, beta]);
    const reversed = await composeWorldbookLibraryRecords([beta, alpha]);

    expect(reversed).toEqual(forward);
    expect(forward.worldbookSelection.map((item) => item.id)).toEqual(["wb-alpha", "wb-beta"]);
  });

  it("groups duplicates by type plus normalized name instead of request order", async () => {
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

    const result = await composeWorldbookLibraryRecords([beta, alpha]);

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

  it("returns merged ipContext together with provenance for every contributing source", async () => {
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

    const result = await composeWorldbookLibraryRecords([alpha, beta]);
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

  it("supplementary entries are filtered by LLM relevance when premise exists", async () => {
    const primary = buildRecord({
      id: "wb-primary",
      displayName: "Voices of the Void",
      entries: Array.from({ length: 15 }, (_, i) => ({
        name: `VotV Entry ${i + 1}`,
        type: "character" as const,
        summary: `Primary character ${i + 1} from VotV.`,
      })),
    });
    const supplementary = buildRecord({
      id: "wb-supp",
      displayName: "SCP Foundation",
      entries: Array.from({ length: 10 }, (_, i) => ({
        name: `SCP-${100 + i}`,
        type: "character" as const,
        summary: `SCP entity ${100 + i} description.`,
      })),
    });

    // First call: detectPrimarySource
    mockSafeGenerateObject.mockResolvedValueOnce({
      object: { primarySource: "Voices of the Void", reasoning: "Premise is about VotV" },
    });
    // Second call: filterRelevantEntries — keep only 3 of 10
    mockSafeGenerateObject.mockResolvedValueOnce({
      object: {
        relevantIndices: [0, 3, 7],
        reasoning: "These three relate to the void theme",
      },
    });

    const result = await composeWorldbookLibraryRecords(
      [primary, supplementary],
      "A campaign set in the Voices of the Void universe with some SCP crossovers",
    );

    // Primary source: all 15 entries pass through
    const primaryFacts = result.ipContext.keyFacts.filter((f) => f.includes("VotV"));
    expect(primaryFacts).toHaveLength(15);

    // Supplementary source: only 3 entries pass through
    const suppFacts = result.ipContext.keyFacts.filter((f) => f.includes("SCP-"));
    expect(suppFacts).toHaveLength(3);

    // Total: 15 + 3 = 18
    expect(result.ipContext.keyFacts).toHaveLength(18);

    // Verify both LLM calls were made
    expect(mockSafeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("fails closed when supplementary relevance filtering fails", async () => {
    const primary = buildRecord({
      id: "wb-primary",
      displayName: "Alpha Archive",
      entries: [
        { name: "Hero", type: "character", summary: "The hero." },
      ],
    });
    const supplementary = buildRecord({
      id: "wb-supp",
      displayName: "Beta Codex",
      entries: [
        { name: "Villain", type: "character", summary: "The villain." },
        { name: "Sidekick", type: "character", summary: "The sidekick." },
      ],
    });

    // First call: detectPrimarySource succeeds
    mockSafeGenerateObject.mockResolvedValueOnce({
      object: { primarySource: "Alpha Archive", reasoning: "Primary world" },
    });
    // Second call: filterRelevantEntries throws
    mockSafeGenerateObject.mockRejectedValueOnce(new Error("LLM unavailable"));

    await expect(
      composeWorldbookLibraryRecords(
        [primary, supplementary],
        "A campaign in the Alpha Archive world",
      ),
    ).rejects.toThrow("Failed to filter supplementary worldbook entries.");
  });

  it("single worldbook skips filtering entirely", async () => {
    const single = buildRecord({
      id: "wb-single",
      displayName: "Solo Archive",
      entries: [
        { name: "Lone Wolf", type: "character", summary: "A solitary wanderer." },
        { name: "Ghost Town", type: "location", summary: "An abandoned settlement." },
      ],
    });

    const result = await composeWorldbookLibraryRecords(
      [single],
      "A campaign in Solo Archive",
    );

    // No LLM calls should be made for single worldbook
    expect(mockSafeGenerateObject).not.toHaveBeenCalled();
    expect(result.ipContext.keyFacts).toHaveLength(2);
  });

  it("primary source entries are never filtered even when supplementary filtering is active", async () => {
    const primary = buildRecord({
      id: "wb-primary",
      displayName: "Main World",
      entries: [
        { name: "King Arthur", type: "character", summary: "The once and future king." },
        { name: "Camelot", type: "location", summary: "A legendary castle." },
        { name: "Excalibur", type: "lore_general", summary: "A magical sword." },
      ],
    });
    const supplementary = buildRecord({
      id: "wb-supp",
      displayName: "Norse Myths",
      entries: [
        { name: "Odin", type: "character", summary: "The all-father." },
        { name: "Loki", type: "character", summary: "The trickster god." },
        { name: "Asgard", type: "location", summary: "Realm of the gods." },
        { name: "Mjolnir", type: "lore_general", summary: "Thor's hammer." },
      ],
    });

    // detectPrimarySource returns "Main World"
    mockSafeGenerateObject.mockResolvedValueOnce({
      object: { primarySource: "Main World", reasoning: "Arthurian focus" },
    });
    // filterRelevantEntries returns only 1 Norse entry
    mockSafeGenerateObject.mockResolvedValueOnce({
      object: {
        relevantIndices: [0],
        reasoning: "Odin parallels Arthur as a wise king figure",
      },
    });

    const result = await composeWorldbookLibraryRecords(
      [primary, supplementary],
      "An Arthurian legend campaign with occasional Norse mythology crossovers",
    );

    // All 3 primary entries present
    expect(result.ipContext.keyFacts).toContainEqual(expect.stringContaining("King Arthur"));
    expect(result.ipContext.keyFacts).toContainEqual(expect.stringContaining("Camelot"));
    expect(result.ipContext.keyFacts).toContainEqual(expect.stringContaining("Excalibur"));

    // Only 1 of 4 supplementary entries present
    expect(result.ipContext.keyFacts).toContainEqual(expect.stringContaining("Odin"));
    expect(result.ipContext.keyFacts).not.toContainEqual(expect.stringContaining("Loki"));
    expect(result.ipContext.keyFacts).not.toContainEqual(expect.stringContaining("Asgard"));
    expect(result.ipContext.keyFacts).not.toContainEqual(expect.stringContaining("Mjolnir"));

    // Total: 3 primary + 1 supplementary = 4
    expect(result.ipContext.keyFacts).toHaveLength(4);
  });
});
