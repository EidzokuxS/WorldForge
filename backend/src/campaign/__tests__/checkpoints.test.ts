import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";

// ---- mocks ----

vi.mock("../paths.js", () => ({
  assertSafeId: vi.fn(),
  getCampaignDir: vi.fn((id: string) => `/campaigns/${id}`),
  getChatHistoryPath: vi.fn((id: string) => `/campaigns/${id}/chat_history.json`),
  getCheckpointsDir: vi.fn((id: string) => `/campaigns/${id}/checkpoints`),
  getCheckpointDir: vi.fn(
    (cId: string, cpId: string) => `/campaigns/${cId}/checkpoints/${cpId}`
  ),
}));

const mockBackup = vi.fn(async () => {});

vi.mock("../../db/index.js", () => ({
  connectDb: vi.fn(),
  closeDb: vi.fn(),
  getSqliteConnection: vi.fn(() => ({ backup: mockBackup })),
}));

vi.mock("../../db/migrate.js", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("../../vectors/connection.js", () => ({
  openVectorDb: vi.fn(async () => ({})),
  closeVectorDb: vi.fn(),
}));

vi.mock("../../lib/index.js", () => {
  class AppError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "AppError";
      this.status = status;
    }
  }
  return { AppError };
});

import {
  createCheckpoint,
  listCheckpoints,
  loadCheckpoint,
  deleteCheckpoint,
  pruneAutoCheckpoints,
} from "../checkpoints.js";
import { closeDb, connectDb } from "../../db/index.js";
import { openVectorDb, closeVectorDb } from "../../vectors/connection.js";
import { runMigrations } from "../../db/migrate.js";
import { AppError } from "../../lib/index.js";

beforeEach(() => {
  vi.restoreAllMocks();
  mockBackup.mockReset().mockResolvedValue(undefined);
});

describe("createCheckpoint", () => {
  it("creates checkpoint directory with mkdirSync", async () => {
    const mkdirSpy = vi.spyOn(fs, "mkdirSync").mockImplementation(() => "");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "cpSync").mockImplementation(() => {});
    vi.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    await createCheckpoint("camp-1");

    expect(mkdirSpy).toHaveBeenCalledWith(
      expect.stringContaining("checkpoints"),
      { recursive: true }
    );
  });

  it("calls getSqliteConnection().backup() for safe DB copy", async () => {
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => "");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "cpSync").mockImplementation(() => {});
    vi.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    await createCheckpoint("camp-1");

    expect(mockBackup).toHaveBeenCalledWith(
      expect.stringContaining("state.db")
    );
  });

  it("copies vectors/ directory if it exists", async () => {
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => "");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const cpSpy = vi.spyOn(fs, "cpSync").mockImplementation(() => {});
    vi.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    await createCheckpoint("camp-1");

    expect(cpSpy).toHaveBeenCalledWith(
      expect.stringContaining("vectors"),
      expect.stringContaining("vectors"),
      { recursive: true }
    );
  });

  it("copies chat_history.json if it exists", async () => {
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => "");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "cpSync").mockImplementation(() => {});
    const copySpy = vi.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    await createCheckpoint("camp-1");

    expect(copySpy).toHaveBeenCalledWith(
      expect.stringContaining("chat_history.json"),
      expect.stringContaining("chat_history.json")
    );
  });

  it("writes meta.json with id, name, description, createdAt, auto flag", async () => {
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => "");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "cpSync").mockImplementation(() => {});
    vi.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    const result = await createCheckpoint("camp-1", {
      name: "Before Boss",
      description: "Saving before fight",
    });

    const metaCall = writeSpy.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("meta.json")
    );
    expect(metaCall).toBeDefined();
    const meta = JSON.parse(metaCall![1] as string);
    expect(meta.name).toBe("Before Boss");
    expect(meta.description).toBe("Saving before fight");
    expect(meta.auto).toBe(false);
    expect(typeof meta.createdAt).toBe("number");
    expect(result.name).toBe("Before Boss");
  });

  it("ID format is {timestamp}-{sanitized-name}", async () => {
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => "");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "cpSync").mockImplementation(() => {});
    vi.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    const result = await createCheckpoint("camp-1", { name: "My Save!" });

    // ID should contain timestamp dash sanitized name
    expect(result.id).toMatch(/^\d+-my-save$/);
  });

  it("cleans up on backup failure (rmSync checkpoint dir)", async () => {
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => "");
    const rmSpy = vi.spyOn(fs, "rmSync").mockImplementation(() => {});
    mockBackup.mockRejectedValue(new Error("backup failed"));

    await expect(createCheckpoint("camp-1")).rejects.toThrow("backup failed");

    expect(rmSpy).toHaveBeenCalledWith(
      expect.stringContaining("checkpoints"),
      { recursive: true, force: true }
    );
  });

  it("with auto:true sets auto flag in meta", async () => {
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => "");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "cpSync").mockImplementation(() => {});
    vi.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    const result = await createCheckpoint("camp-1", { auto: true });

    expect(result.auto).toBe(true);
  });
});

describe("listCheckpoints", () => {
  it("returns empty array when checkpoints dir does not exist", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const result = listCheckpoints("camp-1");
    expect(result).toEqual([]);
  });

  it("reads meta.json from each subdirectory, returns sorted by createdAt desc", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockReturnValue([
      { name: "cp-1", isDirectory: () => true },
      { name: "cp-2", isDirectory: () => true },
    ] as unknown as fs.Dirent[]);
    vi.spyOn(fs, "readFileSync").mockImplementation((filePath) => {
      const p = String(filePath);
      if (p.includes("cp-1")) {
        return JSON.stringify({
          id: "cp-1",
          name: "First",
          description: "",
          createdAt: 1000,
          auto: false,
        });
      }
      return JSON.stringify({
        id: "cp-2",
        name: "Second",
        description: "",
        createdAt: 2000,
        auto: false,
      });
    });

    const result = listCheckpoints("camp-1");

    expect(result).toHaveLength(2);
    // Sorted desc by createdAt
    expect(result[0].id).toBe("cp-2");
    expect(result[1].id).toBe("cp-1");
  });

  it("skips directories without meta.json", () => {
    const existsSpy = vi.spyOn(fs, "existsSync");
    // First call (checkpoints dir exists), then meta.json checks
    existsSpy.mockImplementation((p) => {
      const path = String(p);
      if (path.endsWith("checkpoints")) return true;
      if (path.includes("cp-good")) return true;
      return false; // cp-bad has no meta.json
    });
    vi.spyOn(fs, "readdirSync").mockReturnValue([
      { name: "cp-good", isDirectory: () => true },
      { name: "cp-bad", isDirectory: () => true },
    ] as unknown as fs.Dirent[]);
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        id: "cp-good",
        name: "Good",
        description: "",
        createdAt: 1000,
        auto: false,
      })
    );

    const result = listCheckpoints("camp-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("cp-good");
  });
});

describe("loadCheckpoint", () => {
  it("throws 404 for missing checkpoint", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(loadCheckpoint("camp-1", "cp-missing")).rejects.toThrow(
      "not found"
    );
  });

  it("disconnects DB/vectors, copies files back, reconnects", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        id: "cp-1",
        name: "Save",
        description: "",
        createdAt: 1000,
        auto: false,
      })
    );
    const copySpy = vi.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    const cpSpy = vi.spyOn(fs, "cpSync").mockImplementation(() => {});
    vi.spyOn(fs, "rmSync").mockImplementation(() => {});

    const result = await loadCheckpoint("camp-1", "cp-1");

    // Disconnect
    expect(closeDb).toHaveBeenCalled();
    expect(closeVectorDb).toHaveBeenCalled();

    // Restore state.db
    expect(copySpy).toHaveBeenCalledWith(
      expect.stringContaining("state.db"),
      expect.stringContaining("state.db")
    );

    // Restore vectors
    expect(cpSpy).toHaveBeenCalledWith(
      expect.stringContaining("vectors"),
      expect.stringContaining("vectors"),
      { recursive: true }
    );

    // Reconnect
    expect(connectDb).toHaveBeenCalled();
    expect(runMigrations).toHaveBeenCalled();
    expect(openVectorDb).toHaveBeenCalledWith("camp-1");

    expect(result.id).toBe("cp-1");
  });
});

describe("deleteCheckpoint", () => {
  it("removes checkpoint directory", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const rmSpy = vi.spyOn(fs, "rmSync").mockImplementation(() => {});

    deleteCheckpoint("camp-1", "cp-1");

    expect(rmSpy).toHaveBeenCalledWith(
      expect.stringContaining("cp-1"),
      { recursive: true, force: true }
    );
  });

  it("throws 404 for missing checkpoint", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    expect(() => deleteCheckpoint("camp-1", "cp-missing")).toThrow("not found");
  });
});

describe("pruneAutoCheckpoints", () => {
  it("deletes oldest auto checkpoints beyond keepCount", () => {
    // Setup: 5 auto + 2 manual checkpoints
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockReturnValue(
      ["auto-1", "auto-2", "manual-1", "auto-3", "auto-4", "manual-2", "auto-5"].map(
        (name) => ({ name, isDirectory: () => true })
      ) as unknown as fs.Dirent[]
    );
    vi.spyOn(fs, "readFileSync").mockImplementation((filePath) => {
      const p = String(filePath);
      const entries: Record<string, object> = {
        "auto-1": { id: "auto-1", name: "A1", description: "", createdAt: 100, auto: true },
        "auto-2": { id: "auto-2", name: "A2", description: "", createdAt: 200, auto: true },
        "manual-1": { id: "manual-1", name: "M1", description: "", createdAt: 300, auto: false },
        "auto-3": { id: "auto-3", name: "A3", description: "", createdAt: 400, auto: true },
        "auto-4": { id: "auto-4", name: "A4", description: "", createdAt: 500, auto: true },
        "manual-2": { id: "manual-2", name: "M2", description: "", createdAt: 600, auto: false },
        "auto-5": { id: "auto-5", name: "A5", description: "", createdAt: 700, auto: true },
      };
      for (const [key, val] of Object.entries(entries)) {
        if (p.includes(key)) return JSON.stringify(val);
      }
      return "{}";
    });
    const rmSpy = vi.spyOn(fs, "rmSync").mockImplementation(() => {});

    pruneAutoCheckpoints("camp-1", 3);

    // Should delete 2 oldest auto (auto-1, auto-2), keep auto-3, auto-4, auto-5
    expect(rmSpy).toHaveBeenCalledTimes(2);
    // Verify the deleted ones contain auto-1 and auto-2
    const deletedPaths = rmSpy.mock.calls.map((c) => c[0] as string);
    expect(deletedPaths.some((p) => p.includes("auto-1"))).toBe(true);
    expect(deletedPaths.some((p) => p.includes("auto-2"))).toBe(true);
  });

  it("skips manual checkpoints", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockReturnValue(
      ["manual-1", "manual-2"].map((name) => ({
        name,
        isDirectory: () => true,
      })) as unknown as fs.Dirent[]
    );
    vi.spyOn(fs, "readFileSync").mockImplementation((filePath) => {
      const p = String(filePath);
      if (p.includes("manual-1")) {
        return JSON.stringify({ id: "manual-1", name: "M1", description: "", createdAt: 100, auto: false });
      }
      return JSON.stringify({ id: "manual-2", name: "M2", description: "", createdAt: 200, auto: false });
    });
    const rmSpy = vi.spyOn(fs, "rmSync").mockImplementation(() => {});

    pruneAutoCheckpoints("camp-1", 1);

    // No auto checkpoints to prune
    expect(rmSpy).not.toHaveBeenCalled();
  });
});

describe("sanitizeName (via createCheckpoint)", () => {
  it("converts special chars to hyphens, lowercases, trims to 40 chars", async () => {
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => "");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "cpSync").mockImplementation(() => {});
    vi.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    const result = await createCheckpoint("camp-1", {
      name: "Hello World! @#$ Special & Chars 123 This Is A Very Long Name That Should Be Trimmed",
    });

    // The sanitized part should be lowercase, hyphens for special chars, max 40 chars
    const parts = result.id.split("-");
    // First part is timestamp (all digits)
    expect(parts[0]).toMatch(/^\d+$/);
    // Remaining is sanitized name, joined back
    const sanitized = parts.slice(1).join("-");
    expect(sanitized).toBe(sanitized.toLowerCase());
    expect(sanitized.length).toBeLessThanOrEqual(40);
    expect(sanitized).not.toMatch(/[^\w-]/);
  });
});
