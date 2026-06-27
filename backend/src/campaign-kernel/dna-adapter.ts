import fs from "node:fs";
import path from "node:path";
import {
  createDraftCampaignKernel,
  type CampaignKernel,
  type CampaignWorldDna,
  type WorldSeeds,
} from "@worldforge/shared";
import { readCampaignConfig } from "../campaign/manager.js";
import { assertSafeId, getCampaignDir } from "../campaign/paths.js";
import { AppError } from "../lib/index.js";

export const CAMPAIGN_KERNEL_FILE_NAME = "kernel.json";

type SeedStringField = Exclude<keyof WorldSeeds, "culturalFlavor">;

const SEED_STRING_FIELDS: SeedStringField[] = [
  "geography",
  "politicalStructure",
  "centralConflict",
  "environment",
  "wildcard",
];

const WORLD_DNA_LABELS: Record<keyof CampaignWorldDna, string> = {
  geography: "geography",
  politicalStructure: "political structure",
  centralConflict: "central conflict",
  culturalFlavor: "cultural flavor",
  environment: "environment",
  wildcard: "wildcard",
};

export function getCampaignKernelPath(campaignId: string): string {
  assertSafeId(campaignId);
  return path.join(getCampaignDir(campaignId), CAMPAIGN_KERNEL_FILE_NAME);
}

function requireTrimmedSeed(
  seeds: Partial<WorldSeeds> | undefined,
  field: SeedStringField,
): string {
  const value = seeds?.[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(`World DNA ${WORLD_DNA_LABELS[field]} is required before A3 can run.`, 400);
  }
  return value.trim();
}

function requireCulturalFlavor(seeds: Partial<WorldSeeds> | undefined): string {
  const values = seeds?.culturalFlavor;
  if (!Array.isArray(values)) {
    throw new AppError("World DNA cultural flavor is required before A3 can run.", 400);
  }

  const normalized = values
    .map((value) => value.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    throw new AppError("World DNA cultural flavor is required before A3 can run.", 400);
  }

  return normalized.join("; ");
}

export function buildCampaignWorldDna(seeds: Partial<WorldSeeds> | undefined): CampaignWorldDna {
  return {
    geography: requireTrimmedSeed(seeds, "geography"),
    politicalStructure: requireTrimmedSeed(seeds, "politicalStructure"),
    centralConflict: requireTrimmedSeed(seeds, "centralConflict"),
    culturalFlavor: requireCulturalFlavor(seeds),
    environment: requireTrimmedSeed(seeds, "environment"),
    wildcard: requireTrimmedSeed(seeds, "wildcard"),
  };
}

function resolveKernelPremise(config: ReturnType<typeof readCampaignConfig>): string {
  const premise = config.premise.trim();
  if (premise) {
    return premise;
  }

  const artifactPremise = config.worldgenResearchArtifact?.rawPremise.trim();
  if (artifactPremise) {
    return artifactPremise;
  }

  throw new AppError("Campaign premise or research artifact premise is required before A3 can run.", 400);
}

function parseCampaignKernel(value: unknown): CampaignKernel {
  if (!value || typeof value !== "object") {
    throw new AppError("Campaign kernel.json is invalid.", 500);
  }

  const kernel = value as Partial<CampaignKernel>;
  if (
    typeof kernel.campaignId !== "string"
    || typeof kernel.premise !== "string"
    || typeof kernel.phase !== "string"
    || !kernel.worldGraph
    || !kernel.castRegistry
    || !kernel.chatSession
    || typeof kernel.turnIndex !== "number"
  ) {
    throw new AppError("Campaign kernel.json is invalid.", 500);
  }

  return kernel as CampaignKernel;
}

export function readCampaignKernel(campaignId: string): CampaignKernel | null {
  const kernelPath = getCampaignKernelPath(campaignId);
  if (!fs.existsSync(kernelPath)) {
    return null;
  }

  try {
    return parseCampaignKernel(JSON.parse(fs.readFileSync(kernelPath, "utf-8")));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError("Campaign kernel.json contains invalid JSON.", 500);
    }
    throw error;
  }
}

export function writeCampaignKernel(campaignId: string, kernel: CampaignKernel): void {
  if (kernel.campaignId !== campaignId) {
    throw new AppError("Campaign kernel campaignId mismatch.", 500);
  }
  fs.writeFileSync(getCampaignKernelPath(campaignId), JSON.stringify(kernel, null, 2), "utf-8");
}

export function advanceCampaignKernelToWorldReady(campaignId: string): CampaignKernel {
  assertSafeId(campaignId);
  const config = readCampaignConfig(campaignId);
  const premise = resolveKernelPremise(config);
  const worldDna = buildCampaignWorldDna(config.seeds);
  const existingKernel = readCampaignKernel(campaignId);

  if (
    existingKernel
    && existingKernel.phase !== "draft"
    && existingKernel.phase !== "world_ready"
  ) {
    throw new AppError(`Campaign kernel phase ${existingKernel.phase} cannot rerun A3.`, 409);
  }

  const baseKernel = existingKernel ?? createDraftCampaignKernel({ id: campaignId, premise });
  const nextKernel: CampaignKernel = {
    ...baseKernel,
    campaignId,
    phase: "world_ready",
    premise,
    worldDna,
  };

  writeCampaignKernel(campaignId, nextKernel);
  return nextKernel;
}
