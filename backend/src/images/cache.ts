import fs from "node:fs";
import path from "node:path";
import { getCampaignDir } from "../campaign/paths.js";

export type ImageType = "portraits" | "locations" | "scenes";

/**
 * Get the directory path for cached images of a given type within a campaign.
 */
export function getImagesDir(
  campaignId: string,
  type: ImageType
): string {
  return path.join(getCampaignDir(campaignId), "images", type);
}

/**
 * Ensure the image directory exists for the given campaign and type.
 */
export function ensureImageDir(
  campaignId: string,
  type: ImageType
): void {
  fs.mkdirSync(getImagesDir(campaignId, type), { recursive: true });
}

/**
 * Read a cached image file. Returns null if file does not exist.
 */
export function getCachedImage(
  campaignId: string,
  type: ImageType,
  filename: string
): Buffer | null {
  const filePath = path.join(getImagesDir(campaignId, type), filename);
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

/**
 * Write an image buffer to the cache. Returns the relative path from campaign root.
 */
export function cacheImage(
  campaignId: string,
  type: ImageType,
  filename: string,
  data: Buffer
): string {
  ensureImageDir(campaignId, type);
  const filePath = path.join(getImagesDir(campaignId, type), filename);
  fs.writeFileSync(filePath, data);
  return `images/${type}/${filename}`;
}

/**
 * Check if a cached image exists.
 */
export function imageExists(
  campaignId: string,
  type: ImageType,
  filename: string
): boolean {
  const filePath = path.join(getImagesDir(campaignId, type), filename);
  return fs.existsSync(filePath);
}
