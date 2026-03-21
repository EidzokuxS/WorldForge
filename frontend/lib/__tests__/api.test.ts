import { describe, it, expect } from "vitest";
import { readErrorMessage } from "../api";

// ---------------------------------------------------------------------------
// readErrorMessage
// ---------------------------------------------------------------------------
describe("readErrorMessage", () => {
  it("extracts error from JSON response", async () => {
    const response = {
      json: async () => ({ error: "Something went wrong" }),
      statusText: "Internal Server Error",
    } as unknown as Response;
    expect(await readErrorMessage(response)).toBe("Something went wrong");
  });

  it("falls back to statusText when no error field", async () => {
    const response = {
      json: async () => ({ data: "ok" }),
      statusText: "Bad Request",
    } as unknown as Response;
    expect(await readErrorMessage(response)).toBe("Bad Request");
  });

  it("falls back to statusText when json parse fails", async () => {
    const response = {
      json: async () => { throw new Error("not json"); },
      statusText: "Not Found",
    } as unknown as Response;
    expect(await readErrorMessage(response)).toBe("Not Found");
  });

  it("returns 'Request failed' when statusText is empty", async () => {
    const response = {
      json: async () => { throw new Error(); },
      statusText: "",
    } as unknown as Response;
    expect(await readErrorMessage(response)).toBe("Request failed");
  });
});
