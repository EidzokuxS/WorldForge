import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  assertSafeId,
  getCampaignDir,
  getCampaignConfigPath,
  getChatHistoryPath,
  CAMPAIGNS_DIR,
} from "../paths.js";
import { AppError } from "../../lib/errors.js";

// ---------------------------------------------------------------------------
// CAMPAIGNS_DIR
// ---------------------------------------------------------------------------
describe("CAMPAIGNS_DIR", () => {
  it("is an absolute path", () => {
    expect(path.isAbsolute(CAMPAIGNS_DIR)).toBe(true);
  });

  it("ends with 'campaigns'", () => {
    expect(path.basename(CAMPAIGNS_DIR)).toBe("campaigns");
  });
});

// ---------------------------------------------------------------------------
// assertSafeId
// ---------------------------------------------------------------------------
describe("assertSafeId", () => {
  describe("accepts valid IDs", () => {
    it("accepts a standard UUID", () => {
      expect(() =>
        assertSafeId("550e8400-e29b-41d4-a716-446655440000")
      ).not.toThrow();
    });

    it("accepts a simple alphanumeric string", () => {
      expect(() => assertSafeId("campaign1")).not.toThrow();
    });

    it("accepts underscores", () => {
      expect(() => assertSafeId("my_campaign")).not.toThrow();
    });

    it("accepts hyphens", () => {
      expect(() => assertSafeId("my-campaign")).not.toThrow();
    });

    it("accepts a single character", () => {
      expect(() => assertSafeId("a")).not.toThrow();
    });

    it("accepts a 128-character string (max length)", () => {
      const id = "a".repeat(128);
      expect(() => assertSafeId(id)).not.toThrow();
    });

    it("accepts digits only", () => {
      expect(() => assertSafeId("12345")).not.toThrow();
    });

    it("accepts mixed alphanumeric with underscores and hyphens", () => {
      expect(() => assertSafeId("Campaign_01-Draft")).not.toThrow();
    });
  });

  describe("rejects invalid IDs", () => {
    it("throws AppError for an empty string", () => {
      expect(() => assertSafeId("")).toThrow(AppError);
    });

    it("throws with status 400 for an empty string", () => {
      try {
        assertSafeId("");
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
      }
    });

    it("throws for path traversal with ../", () => {
      expect(() => assertSafeId("../etc/passwd")).toThrow(AppError);
    });

    it("throws for path traversal with ..\\", () => {
      expect(() => assertSafeId("..\\etc\\passwd")).toThrow(AppError);
    });

    it("throws for a dot-dot prefix", () => {
      expect(() => assertSafeId("..")).toThrow(AppError);
    });

    it("throws for forward slashes", () => {
      expect(() => assertSafeId("foo/bar")).toThrow(AppError);
    });

    it("throws for backslashes", () => {
      expect(() => assertSafeId("foo\\bar")).toThrow(AppError);
    });

    it("throws for spaces", () => {
      expect(() => assertSafeId("has space")).toThrow(AppError);
    });

    it("throws for special characters (@)", () => {
      expect(() => assertSafeId("user@host")).toThrow(AppError);
    });

    it("throws for special characters (#)", () => {
      expect(() => assertSafeId("hash#tag")).toThrow(AppError);
    });

    it("throws for special characters ($)", () => {
      expect(() => assertSafeId("dollar$sign")).toThrow(AppError);
    });

    it("throws for dots in the string", () => {
      expect(() => assertSafeId("file.json")).toThrow(AppError);
    });

    it("throws for a string exceeding 128 characters", () => {
      const id = "a".repeat(129);
      expect(() => assertSafeId(id)).toThrow(AppError);
    });

    it("throws for null characters", () => {
      expect(() => assertSafeId("abc\0def")).toThrow(AppError);
    });

    it("throws for newlines", () => {
      expect(() => assertSafeId("abc\ndef")).toThrow(AppError);
    });

    it("throws for tab characters", () => {
      expect(() => assertSafeId("abc\tdef")).toThrow(AppError);
    });

    it("includes 'Invalid campaign ID' in error message", () => {
      expect(() => assertSafeId("../hack")).toThrow("Invalid campaign ID");
    });
  });
});

// ---------------------------------------------------------------------------
// getCampaignDir
// ---------------------------------------------------------------------------
describe("getCampaignDir", () => {
  it("returns the CAMPAIGNS_DIR joined with the campaign ID", () => {
    const id = "test-campaign-01";
    const result = getCampaignDir(id);
    expect(result).toBe(path.join(CAMPAIGNS_DIR, id));
  });

  it("returns an absolute path", () => {
    const result = getCampaignDir("abc123");
    expect(path.isAbsolute(result)).toBe(true);
  });

  it("throws AppError for invalid IDs", () => {
    expect(() => getCampaignDir("../bad")).toThrow(AppError);
  });

  it("throws AppError for empty string", () => {
    expect(() => getCampaignDir("")).toThrow(AppError);
  });
});

// ---------------------------------------------------------------------------
// getCampaignConfigPath
// ---------------------------------------------------------------------------
describe("getCampaignConfigPath", () => {
  it("returns path ending in config.json", () => {
    const result = getCampaignConfigPath("my-campaign");
    expect(path.basename(result)).toBe("config.json");
  });

  it("includes the campaign ID in the path", () => {
    const result = getCampaignConfigPath("my-campaign");
    expect(result).toContain("my-campaign");
  });

  it("equals getCampaignDir(id) + config.json", () => {
    const id = "camp-42";
    const expected = path.join(getCampaignDir(id), "config.json");
    expect(getCampaignConfigPath(id)).toBe(expected);
  });

  it("throws AppError for invalid IDs", () => {
    expect(() => getCampaignConfigPath("../evil")).toThrow(AppError);
  });
});

// ---------------------------------------------------------------------------
// getChatHistoryPath
// ---------------------------------------------------------------------------
describe("getChatHistoryPath", () => {
  it("returns path ending in chat_history.json", () => {
    const result = getChatHistoryPath("my-campaign");
    expect(path.basename(result)).toBe("chat_history.json");
  });

  it("includes the campaign ID in the path", () => {
    const result = getChatHistoryPath("my-campaign");
    expect(result).toContain("my-campaign");
  });

  it("equals getCampaignDir(id) + chat_history.json", () => {
    const id = "camp-42";
    const expected = path.join(getCampaignDir(id), "chat_history.json");
    expect(getChatHistoryPath(id)).toBe(expected);
  });

  it("throws AppError for invalid IDs", () => {
    expect(() => getChatHistoryPath("has space")).toThrow(AppError);
  });
});
