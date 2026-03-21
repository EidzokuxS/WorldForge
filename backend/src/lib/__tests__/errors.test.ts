import { describe, it, expect } from "vitest";
import { AppError, getErrorMessage, getErrorStatus } from "../errors.js";

// ---------------------------------------------------------------------------
// AppError
// ---------------------------------------------------------------------------
describe("AppError", () => {
  it("sets message from constructor argument", () => {
    const err = new AppError("something broke");
    expect(err.message).toBe("something broke");
  });

  it("defaults statusCode to 500 when omitted", () => {
    const err = new AppError("server fault");
    expect(err.statusCode).toBe(500);
  });

  it("accepts a custom statusCode", () => {
    const err = new AppError("not found", 404);
    expect(err.statusCode).toBe(404);
  });

  it("sets name to 'AppError'", () => {
    const err = new AppError("test");
    expect(err.name).toBe("AppError");
  });

  it("is an instance of Error", () => {
    const err = new AppError("test");
    expect(err).toBeInstanceOf(Error);
  });

  it("is an instance of AppError", () => {
    const err = new AppError("test");
    expect(err).toBeInstanceOf(AppError);
  });

  it("statusCode is readonly and preserves value", () => {
    const err = new AppError("bad request", 400);
    expect(err.statusCode).toBe(400);
  });

  it("produces a proper stack trace", () => {
    const err = new AppError("traced");
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("traced");
  });
});

// ---------------------------------------------------------------------------
// getErrorMessage
// ---------------------------------------------------------------------------
describe("getErrorMessage", () => {
  it("returns the message of an Error instance", () => {
    const err = new Error("plain error");
    expect(getErrorMessage(err)).toBe("plain error");
  });

  it("returns the message of an AppError instance", () => {
    const err = new AppError("app error", 400);
    expect(getErrorMessage(err)).toBe("app error");
  });

  it("returns default fallback for a non-Error value", () => {
    expect(getErrorMessage("string value")).toBe("Unknown error");
  });

  it("returns default fallback for null", () => {
    expect(getErrorMessage(null)).toBe("Unknown error");
  });

  it("returns default fallback for undefined", () => {
    expect(getErrorMessage(undefined)).toBe("Unknown error");
  });

  it("returns default fallback for a number", () => {
    expect(getErrorMessage(42)).toBe("Unknown error");
  });

  it("returns default fallback for a plain object", () => {
    expect(getErrorMessage({ message: "looks like error" })).toBe("Unknown error");
  });

  it("uses a custom fallback when provided", () => {
    expect(getErrorMessage("not an error", "custom fallback")).toBe("custom fallback");
  });

  it("ignores custom fallback when the value is an Error", () => {
    const err = new Error("real message");
    expect(getErrorMessage(err, "should not appear")).toBe("real message");
  });
});

// ---------------------------------------------------------------------------
// getErrorStatus
// ---------------------------------------------------------------------------
describe("getErrorStatus", () => {
  describe("when error is an AppError", () => {
    it("returns 400 for statusCode 400", () => {
      const err = new AppError("bad request", 400);
      expect(getErrorStatus(err)).toBe(400);
    });

    it("returns 404 for statusCode 404", () => {
      const err = new AppError("not found", 404);
      expect(getErrorStatus(err)).toBe(404);
    });

    it("returns 500 for statusCode 500", () => {
      const err = new AppError("server error", 500);
      expect(getErrorStatus(err)).toBe(500);
    });

    it("returns 403 for statusCode 403", () => {
      const err = new AppError("forbidden", 403);
      expect(getErrorStatus(err)).toBe(403);
    });

    it("returns 422 for statusCode 422", () => {
      const err = new AppError("unprocessable", 422);
      expect(getErrorStatus(err)).toBe(422);
    });

    it("returns 429 for statusCode 429", () => {
      const err = new AppError("too many requests", 429);
      expect(getErrorStatus(err)).toBe(429);
    });

    it("returns 500 for statusCode 503 (5xx falls to 500)", () => {
      const err = new AppError("unavailable", 503);
      expect(getErrorStatus(err)).toBe(500);
    });

    it("ignores fallback parameter when error is AppError", () => {
      const err = new AppError("bad", 400);
      expect(getErrorStatus(err, 404)).toBe(400);
    });
  });

  describe("when error is a plain Error (not AppError)", () => {
    it("returns default fallback 500", () => {
      const err = new Error("plain");
      expect(getErrorStatus(err)).toBe(500);
    });

    it("returns custom fallback 400", () => {
      const err = new Error("plain");
      expect(getErrorStatus(err, 400)).toBe(400);
    });

    it("returns custom fallback 404", () => {
      const err = new Error("plain");
      expect(getErrorStatus(err, 404)).toBe(404);
    });
  });

  describe("when error is not an Error at all", () => {
    it("returns default fallback 500 for a string", () => {
      expect(getErrorStatus("oops")).toBe(500);
    });

    it("returns default fallback 500 for null", () => {
      expect(getErrorStatus(null)).toBe(500);
    });

    it("returns default fallback 500 for undefined", () => {
      expect(getErrorStatus(undefined)).toBe(500);
    });

    it("returns custom fallback for a number", () => {
      expect(getErrorStatus(123, 404)).toBe(404);
    });

    it("returns custom fallback for a plain object", () => {
      expect(getErrorStatus({}, 400)).toBe(400);
    });
  });
});
