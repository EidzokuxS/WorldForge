import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Stats } from "node:fs";

// Mock fs before importing the module under test
vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
  },
}));

// Mock campaign paths
vi.mock("../../campaign/paths.js", () => ({
  getCampaignDir: vi.fn(
    (campaignId: string) => `/campaigns/${campaignId}`
  ),
}));

import fs from "node:fs";
import {
  getImagesDir,
  ensureImageDir,
  getCachedImage,
  cacheImage,
  imageExists,
} from "../cache.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getImagesDir
// ---------------------------------------------------------------------------
describe("getImagesDir", () => {
  it("returns path with campaign dir, images folder, and type", () => {
    const result = getImagesDir("test-campaign", "portraits");
    // path.join normalises separators, but the segments should be present
    expect(result).toContain("test-campaign");
    expect(result).toContain("images");
    expect(result).toContain("portraits");
  });

  it("handles each image type", () => {
    expect(getImagesDir("c1", "portraits")).toContain("portraits");
    expect(getImagesDir("c1", "locations")).toContain("locations");
    expect(getImagesDir("c1", "scenes")).toContain("scenes");
  });
});

// ---------------------------------------------------------------------------
// ensureImageDir
// ---------------------------------------------------------------------------
describe("ensureImageDir", () => {
  it("calls mkdirSync with recursive option", () => {
    ensureImageDir("camp-1", "portraits");
    expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
    const [dirPath, opts] = (fs.mkdirSync as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(dirPath).toContain("portraits");
    expect(opts).toEqual({ recursive: true });
  });
});

// ---------------------------------------------------------------------------
// getCachedImage
// ---------------------------------------------------------------------------
describe("getCachedImage", () => {
  it("returns buffer when file exists", () => {
    const buf = Buffer.from("fake-png-data");
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(buf);

    const result = getCachedImage("c1", "portraits", "hero.png");
    expect(result).toBe(buf);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it("returns null when file does not exist", () => {
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = getCachedImage("c1", "portraits", "missing.png");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cacheImage
// ---------------------------------------------------------------------------
describe("cacheImage", () => {
  it("ensures directory exists before writing", () => {
    const buf = Buffer.from("img");
    cacheImage("c1", "portraits", "hero.png", buf);

    expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

    // mkdirSync should be called before writeFileSync
    const mkdirOrder = (fs.mkdirSync as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const writeOrder = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(mkdirOrder).toBeLessThan(writeOrder);
  });

  it("writes buffer data to the correct path", () => {
    const buf = Buffer.from("img-data");
    cacheImage("c1", "locations", "tavern.png", buf);

    const [writePath, writeData] = (
      fs.writeFileSync as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(writePath).toContain("locations");
    expect(writePath).toContain("tavern.png");
    expect(writeData).toBe(buf);
  });

  it("returns relative path from campaign root", () => {
    const buf = Buffer.from("img");
    const result = cacheImage("c1", "portraits", "hero.png", buf);
    expect(result).toBe("images/portraits/hero.png");
  });

  it("returns correct relative path for each type", () => {
    const buf = Buffer.from("img");
    expect(cacheImage("c1", "locations", "town.png", buf)).toBe(
      "images/locations/town.png"
    );
    expect(cacheImage("c1", "scenes", "battle.png", buf)).toBe(
      "images/scenes/battle.png"
    );
  });
});

// ---------------------------------------------------------------------------
// imageExists
// ---------------------------------------------------------------------------
describe("imageExists", () => {
  it("returns true when file exists", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    expect(imageExists("c1", "portraits", "hero.png")).toBe(true);
  });

  it("returns false when file does not exist", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect(imageExists("c1", "portraits", "hero.png")).toBe(false);
  });

  it("checks the correct path", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    imageExists("camp-2", "scenes", "dragon.png");

    const [checkedPath] = (fs.existsSync as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(checkedPath).toContain("camp-2");
    expect(checkedPath).toContain("scenes");
    expect(checkedPath).toContain("dragon.png");
  });
});
