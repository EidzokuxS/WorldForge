import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn().mockResolvedValue({ fake: true }),
}));

vi.mock("../../campaign/index.js", () => ({
  getCampaignDir: vi.fn((id: string) => `/campaigns/${id}`),
}));

import { getVectorDb, closeVectorDb, openVectorDb } from "../connection.js";

describe("vector connection", () => {
  beforeEach(() => {
    closeVectorDb();
  });

  describe("getVectorDb", () => {
    it("throws when no connection is open", () => {
      expect(() => getVectorDb()).toThrow(
        "Vector database is not connected. Load a campaign first."
      );
    });

    it("returns connection after openVectorDb", async () => {
      await openVectorDb("test-campaign");
      const db = getVectorDb();
      expect(db).toBeDefined();
    });
  });

  describe("closeVectorDb", () => {
    it("clears the connection so getVectorDb throws", async () => {
      await openVectorDb("test-campaign");
      closeVectorDb();
      expect(() => getVectorDb()).toThrow();
    });
  });

  describe("openVectorDb", () => {
    it("returns a connection object", async () => {
      const conn = await openVectorDb("my-campaign");
      expect(conn).toBeDefined();
    });

    it("closes previous connection when opening a new one", async () => {
      await openVectorDb("campaign-1");
      const conn2 = await openVectorDb("campaign-2");
      expect(conn2).toBeDefined();
    });
  });
});
