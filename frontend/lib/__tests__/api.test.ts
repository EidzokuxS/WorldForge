import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteLoreCardById, readErrorMessage, updateLoreCard } from "../api";
import type { LoreCardItem, LoreCardUpdateInput } from "../api-types";

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

describe("lore item API helpers", () => {
  const fetchMock = vi.fn<typeof fetch>();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("updateLoreCard sends PUT with the exact payload and returns parsed card data", async () => {
    const payload: LoreCardUpdateInput = {
      term: "The Black Spire",
      definition: "A ruined tower watching the northern pass.",
      category: "location",
    };
    const card: LoreCardItem = { id: "card-7", ...payload };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ card }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateLoreCard("camp-1", "card-7", payload)).resolves.toEqual(card);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/campaigns/camp-1/lore/card-7", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  });

  it("deleteLoreCardById sends DELETE to the item endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteLoreCardById("camp-1", "card-9")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/campaigns/camp-1/lore/card-9", {
      method: "DELETE",
    });
  });

  it("propagates update lore card API errors", async () => {
    const payload: LoreCardUpdateInput = {
      term: "Bad",
      definition: "",
      category: "concept",
    };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Lore card not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateLoreCard("camp-1", "missing-card", payload)).rejects.toThrow("Lore card not found.");
  });

  it("propagates delete lore card API errors", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Definition is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteLoreCardById("camp-1", "blocked-card")).rejects.toThrow("Definition is required.");
  });
});
