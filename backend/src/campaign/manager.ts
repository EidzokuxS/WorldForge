import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { closeDb, connectDb } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { campaigns } from "../db/schema.js";
import type { CampaignMeta, WorldSeeds } from "@worldforge/shared";
import { parseWorldSeeds } from "../worldgen/index.js";
import { AppError } from "../lib/errors.js";
import { assertSafeId, CAMPAIGNS_DIR, getCampaignConfigPath, getCampaignDir } from "./paths.js";
import { openVectorDb, closeVectorDb } from "../vectors/index.js";

export type { CampaignMeta } from "@worldforge/shared";

type CampaignConfigFile = {
  name: string;
  premise: string;
  seeds?: WorldSeeds;
  generationComplete?: boolean;
  createdAt: number;
  updatedAt?: number;
};

let activeCampaign: CampaignMeta | null = null;

export { assertSafeId } from "./paths.js";

function ensureCampaignsDir() {
  if (!fs.existsSync(CAMPAIGNS_DIR)) {
    fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });
  }
}

export function readCampaignConfig(campaignId: string): CampaignConfigFile {
  const configPath = getCampaignConfigPath(campaignId);
  if (!fs.existsSync(configPath)) {
    throw new AppError("Campaign config.json not found.", 404);
  }

  const rawConfig = fs.readFileSync(configPath, "utf-8");
  let parsed: Partial<CampaignConfigFile>;
  try {
    parsed = JSON.parse(rawConfig) as Partial<CampaignConfigFile>;
  } catch {
    throw new AppError("Campaign config.json contains invalid JSON.", 500);
  }
  if (!parsed.name || !parsed.premise || typeof parsed.createdAt !== "number") {
    throw new AppError("Campaign config.json is invalid.", 500);
  }

  return {
    name: parsed.name,
    premise: parsed.premise,
    seeds: parseWorldSeeds(parsed.seeds) ?? undefined,
    generationComplete: Boolean(parsed.generationComplete),
    createdAt: parsed.createdAt,
    updatedAt:
      typeof parsed.updatedAt === "number" ? parsed.updatedAt : parsed.createdAt,
  };
}

function writeCampaignConfig(campaignDir: string, config: CampaignConfigFile) {
  const configPath = path.join(campaignDir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function listCampaigns(): CampaignMeta[] {
  ensureCampaignsDir();

  const entries = fs
    .readdirSync(CAMPAIGNS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  const campaignsList: CampaignMeta[] = [];

  for (const entry of entries) {
    try {
      const config = readCampaignConfig(entry.name);
      campaignsList.push({
        id: entry.name,
        name: config.name,
        premise: config.premise,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt ?? config.createdAt,
        seeds: config.seeds,
        generationComplete: config.generationComplete,
      });
    } catch {
      // Skip invalid campaign directories.
    }
  }

  return campaignsList.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createCampaign(
  name: string,
  premise: string,
  seeds?: WorldSeeds
): Promise<CampaignMeta> {
  const trimmedName = name.trim();
  const trimmedPremise = premise.trim();
  if (!trimmedName) {
    throw new AppError("Campaign name is required.", 400);
  }
  if (!trimmedPremise) {
    throw new AppError("Campaign premise is required.", 400);
  }

  ensureCampaignsDir();

  const campaignId = crypto.randomUUID();
  const now = Date.now();
  const campaignDir = getCampaignDir(campaignId);
  const dbPath = path.join(campaignDir, "state.db");

  fs.mkdirSync(campaignDir, { recursive: true });
  fs.mkdirSync(path.join(campaignDir, "vectors"), { recursive: true });
  fs.writeFileSync(path.join(campaignDir, "chat_history.json"), "[]", "utf-8");

  try {
    const database = connectDb(dbPath);
    runMigrations();

    database
      .insert(campaigns)
      .values({
        id: campaignId,
        name: trimmedName,
        premise: trimmedPremise,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    writeCampaignConfig(campaignDir, {
      name: trimmedName,
      premise: trimmedPremise,
      seeds,
      generationComplete: false,
      createdAt: now,
      updatedAt: now,
    });

    await openVectorDb(campaignId);
  } catch (error) {
    closeDb();
    await closeVectorDb();
    activeCampaign = null;
    fs.rmSync(campaignDir, { recursive: true, force: true });
    throw error;
  }

  const meta: CampaignMeta = {
    id: campaignId,
    name: trimmedName,
    premise: trimmedPremise,
    createdAt: now,
    updatedAt: now,
    seeds,
    generationComplete: false,
  };

  activeCampaign = meta;
  return meta;
}

export async function loadCampaign(id: string): Promise<CampaignMeta> {
  assertSafeId(id);
  ensureCampaignsDir();

  const campaignDir = getCampaignDir(id);
  if (!fs.existsSync(campaignDir)) {
    throw new AppError("Campaign not found.", 404);
  }

  const config = readCampaignConfig(id);
  const dbPath = path.join(campaignDir, "state.db");
  try {
    const database = connectDb(dbPath);
    runMigrations();

    const existingCampaign = database
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .get();

    const now = Date.now();
    if (!existingCampaign) {
      database
        .insert(campaigns)
        .values({
          id,
          name: config.name,
          premise: config.premise,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt ?? now,
        })
        .run();
    }

    const campaignRow =
      existingCampaign ??
      database
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, id))
        .get();

    if (!campaignRow) {
      throw new Error("Campaign record could not be loaded.");
    }

    await openVectorDb(id);

    const meta: CampaignMeta = {
      id: campaignRow.id,
      name: campaignRow.name,
      premise: campaignRow.premise,
      createdAt: campaignRow.createdAt,
      updatedAt: campaignRow.updatedAt,
      seeds: config.seeds,
      generationComplete: config.generationComplete,
    };

    activeCampaign = meta;
    return meta;
  } catch (error) {
    closeDb();
    await closeVectorDb();
    activeCampaign = null;
    throw error;
  }
}

export async function deleteCampaign(id: string): Promise<void> {
  assertSafeId(id);
  ensureCampaignsDir();

  const campaignDir = getCampaignDir(id);
  if (!fs.existsSync(campaignDir)) {
    throw new AppError("Campaign not found.", 404);
  }

  if (activeCampaign?.id === id) {
    closeDb();
    await closeVectorDb();
    activeCampaign = null;
  }

  fs.rmSync(campaignDir, { recursive: true, force: true });
}

export function markGenerationComplete(
  campaignId: string,
  refinedPremise: string
): void {
  assertSafeId(campaignId);

  const config = readCampaignConfig(campaignId);
  const updatedAt = Date.now();

  const nextConfig: CampaignConfigFile = {
    ...config,
    premise: refinedPremise,
    generationComplete: true,
    updatedAt,
  };

  writeCampaignConfig(getCampaignDir(campaignId), nextConfig);

  if (activeCampaign?.id === campaignId) {
    activeCampaign = {
      ...activeCampaign,
      premise: refinedPremise,
      updatedAt,
      seeds: nextConfig.seeds,
      generationComplete: true,
    };
  }
}

export function getActiveCampaign(): CampaignMeta | null {
  return activeCampaign;
}
