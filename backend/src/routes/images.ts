import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { assertSafeId } from "../campaign/paths.js";
import { getImagesDir as getCampaignImagesDir } from "../campaign/paths.js";
import {
  generateImage,
  resolveImageProvider,
  cacheImage,
} from "../images/index.js";
import { loadSettings } from "../settings/index.js";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
import { parseBody } from "./helpers.js";
import { imageGenerateSchema } from "./schemas.js";

const VALID_TYPES = new Set(["portraits", "locations", "scenes"]);
const SAFE_FILENAME = /^[\w-]+\.png$/;

const app = new Hono();

/**
 * GET /:campaignId/:type/:filename — serve a cached image
 */
app.get("/:campaignId/:type/:filename", (c) => {
  try {
    const { campaignId, type, filename } = c.req.param();

    assertSafeId(campaignId);

    if (!VALID_TYPES.has(type)) {
      return c.json({ error: "Invalid image type. Must be portraits, locations, or scenes." }, 400);
    }

    if (!SAFE_FILENAME.test(filename)) {
      return c.json({ error: "Invalid filename." }, 400);
    }

    const filePath = path.join(
      getCampaignImagesDir(campaignId),
      type,
      filename
    );

    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Image not found." }, 404);
    }

    const data = fs.readFileSync(filePath);
    return new Response(data, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to serve image.") },
      getErrorStatus(error)
    );
  }
});

/**
 * POST /generate — on-demand image generation
 */
app.post("/generate", async (c) => {
  try {
    const result = await parseBody(c, imageGenerateSchema);
    if ("response" in result) return result.response;
    const { campaignId, type, entityId, prompt } = result.data;

    assertSafeId(campaignId);

    const settings = loadSettings();
    const resolved = resolveImageProvider(settings);
    if (!resolved) {
      return c.json(
        { error: "Image generation is disabled or no provider configured." },
        400
      );
    }

    const imageData = await generateImage({
      prompt,
      provider: resolved.provider,
      model: resolved.model,
    });

    const filename = `${entityId}.png`;
    const imageType = type === "portrait" ? "portraits" : type === "location" ? "locations" : "scenes";
    cacheImage(campaignId, imageType, filename, imageData);

    return c.json({
      ok: true,
      path: `/api/images/${campaignId}/${imageType}/${filename}`,
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Image generation failed.") },
      getErrorStatus(error)
    );
  }
});

export default app;
