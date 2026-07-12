import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { registerApiRoutes } from "./api-routes.js";

describe("campaign API route registration", () => {
  it("mounts Campaign World and Campaign Play while displaced endpoints return 404", async () => {
    const app = new Hono();
    registerApiRoutes(app);

    const campaignWorldResponse = await app.request("/api/campaigns/missing-campaign/world/state");
    expect(campaignWorldResponse.status).toBe(404);
    expect(await campaignWorldResponse.json()).toMatchObject({
      error: { code: "campaign_not_found" },
    });

    const campaignPlayResponse = await app.request("/api/campaigns/missing-campaign/play/state");
    expect(campaignPlayResponse.status).toBe(404);
    expect(await campaignPlayResponse.json()).toMatchObject({
      code: "campaign_not_found",
    });

    const chatResponse = await app.request("/api/chat/history");
    expect(chatResponse.status).toBe(404);

    const characterResponse = await app.request("/api/worldgen/parse-character", {
      method: "POST",
    });
    expect(characterResponse.status).toBe(404);
  });
});
