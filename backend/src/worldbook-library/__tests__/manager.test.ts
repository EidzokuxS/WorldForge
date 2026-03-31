import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedPaths = vi.hoisted(() => ({
  campaignsDir: "",
}));

vi.mock("../paths.js", () => ({
  assertSafeWorldbookLibraryId: vi.fn(),
  getWorldbookLibraryDir: () => `${mockedPaths.campaignsDir}/_worldbook-library`,
  getWorldbookLibraryIndexPath: () =>
    `${mockedPaths.campaignsDir}/_worldbook-library/index.json`,
  getWorldbookLibraryRecordsDir: () =>
    `${mockedPaths.campaignsDir}/_worldbook-library/records`,
  getWorldbookLibraryRecordPath: (id: string) =>
    `${mockedPaths.campaignsDir}/_worldbook-library/records/${id}.json`,
}));

import {
  importWorldbookToLibrary,
  listWorldbookLibrary,
  loadWorldbookLibraryRecord,
  WORLDBOOK_LIBRARY_CLASSIFICATION_VERSION,
} from "../manager.js";

describe("worldbook library manager", () => {
  beforeEach(() => {
    mockedPaths.campaignsDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "worldforge-worldbook-library-"),
    );
  });

  afterEach(() => {
    if (mockedPaths.campaignsDir) {
      fs.rmSync(mockedPaths.campaignsDir, { recursive: true, force: true });
      mockedPaths.campaignsDir = "";
    }
  });

  it("dedupes duplicate parsed worldbooks by normalized content and skips reclassification", async () => {
    const parsedEntries = [
      { name: " Naruto Uzumaki ", text: " A ninja from Konoha. " },
      { name: "Leaf Village", text: "Hidden village of fire." },
    ];
    const classifiedEntries = [
      { name: "Naruto Uzumaki", type: "character" as const, summary: "A ninja from Konoha." },
      { name: "Leaf Village", type: "location" as const, summary: "Hidden village of fire." },
    ];
    const classify = vi.fn().mockResolvedValue(classifiedEntries);

    const first = await importWorldbookToLibrary({
      displayName: "Naruto Core",
      originalFileName: "naruto.json",
      parsedEntries,
      classify,
    });
    const second = await importWorldbookToLibrary({
      displayName: "Naruto Core Copy",
      originalFileName: "naruto-copy.json",
      parsedEntries: [
        { name: "naruto uzumaki", text: "a ninja from konoha." },
        { name: "Leaf Village", text: " Hidden village of fire. " },
      ],
      classify,
    });

    expect(first.existed).toBe(false);
    expect(second.existed).toBe(true);
    expect(second.item.id).toBe(first.item.id);
    expect(second.item.normalizedSourceHash).toBe(first.item.normalizedSourceHash);
    expect(classify).toHaveBeenCalledTimes(1);

    const recordPath = path.join(
      mockedPaths.campaignsDir,
      "_worldbook-library",
      "records",
      `${first.item.id}.json`,
    );
    const indexPath = path.join(
      mockedPaths.campaignsDir,
      "_worldbook-library",
      "index.json",
    );

    expect(fs.existsSync(recordPath)).toBe(true);
    expect(fs.existsSync(indexPath)).toBe(true);

    const record = loadWorldbookLibraryRecord(first.item.id);
    expect(record).not.toBeNull();
    expect(record).toMatchObject({
      id: first.item.id,
      displayName: "Naruto Core",
      originalFileName: "naruto.json",
      normalizedSourceHash: first.item.normalizedSourceHash,
      entryCount: 2,
      classificationVersion: WORLDBOOK_LIBRARY_CLASSIFICATION_VERSION,
      entries: classifiedEntries,
    });
  });

  it("lists stored worldbooks in stable alphabetical order for selection UIs", async () => {
    await importWorldbookToLibrary({
      displayName: "zeta myths",
      parsedEntries: [{ name: "Zeta", text: "Last in the list." }],
      classify: vi.fn().mockResolvedValue([
        { name: "Zeta", type: "lore_general" as const, summary: "Last in the list." },
      ]),
    });
    await importWorldbookToLibrary({
      displayName: "Alpha Codex",
      parsedEntries: [{ name: "Alpha", text: "First in the list." }],
      classify: vi.fn().mockResolvedValue([
        { name: "Alpha", type: "lore_general" as const, summary: "First in the list." },
      ]),
    });

    const items = listWorldbookLibrary();

    expect(items.map((item) => item.displayName)).toEqual([
      "Alpha Codex",
      "zeta myths",
    ]);
    expect(items.every((item) => item.entryCount === 1)).toBe(true);
  });
});
