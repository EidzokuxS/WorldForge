import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { cloneCampaignCleanStart } from "../../backend/src/campaign/clone.js";
import type { Phase94RouteId } from "../../backend/src/engine/phase-94-trace-assertions.js";
import {
  assertPhase94BaselinePoolValid,
  type Phase94BaselinePoolArtifact,
  type Phase94BaselineRecord,
  type Phase94RouteCloneRecord,
  type Phase94RouteManifestEntry,
} from "./artifact-schema.js";

interface BaselineSource {
  baselinePoolId: string;
  label: string;
  sourceCampaignId: string;
}

export interface Phase94BaselinePoolOptions {
  routes: readonly Phase94RouteManifestEntry[];
  runId: string;
  profile: string;
  dryRun: boolean;
  reuseBaselines: boolean;
  outRoot: string;
  campaignsRoot?: string;
}

const DEFAULT_BASELINES: Record<string, BaselineSource> = {
  "lacquer-signal": {
    baselinePoolId: "lacquer-signal",
    label: "Lacquer Signal living-world baseline",
    sourceCampaignId: "0ed6bb3c-a528-4067-8f29-86ebdd8d0637",
  },
  "urban-occult-crossover": {
    baselinePoolId: "urban-occult-crossover",
    label: "Urban occult crossover baseline",
    sourceCampaignId: "da183dd3-9e19-4ba3-ae72-c969af1ffe1d",
  },
};

function campaignIdFromEnv(baselinePoolId: string): string | undefined {
  const envKey = `PHASE94_BASELINE_${baselinePoolId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  return process.env[envKey];
}

function assertUuidLike(value: string, label: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error(`${label} must be a UUID-like campaign id: ${value}`);
  }
}

function assertInside(parentDir: string, childPath: string): void {
  const parent = resolve(parentDir);
  const child = resolve(childPath);
  if (child !== parent && !child.startsWith(`${parent}${sep}`)) {
    throw new Error(`Refusing filesystem operation outside ${parent}: ${child}`);
  }
}

function campaignsRoot(input?: string): string {
  return resolve(input ?? process.env.GSD_CAMPAIGNS_ROOT ?? join(process.cwd(), "campaigns"));
}

function campaignDir(root: string, campaignId: string): string {
  assertUuidLike(campaignId, "campaignId");
  const dir = resolve(root, campaignId);
  assertInside(root, dir);
  return dir;
}

function baselineForRoute(route: Phase94RouteManifestEntry): BaselineSource {
  const configured = DEFAULT_BASELINES[route.baselinePoolId];
  if (!configured) {
    throw new Error(`No baseline source configured for ${route.baselinePoolId}.`);
  }
  return {
    ...configured,
    sourceCampaignId: campaignIdFromEnv(route.baselinePoolId) ?? configured.sourceCampaignId,
  };
}

export async function buildPhase94BaselinePool(options: Phase94BaselinePoolOptions): Promise<Phase94BaselinePoolArtifact> {
  const root = campaignsRoot(options.campaignsRoot);
  mkdirSync(root, { recursive: true });
  const baselineRoutes = new Map<string, Phase94RouteId[]>();
  const baselinesById = new Map<string, Phase94BaselineRecord>();
  const routeClones: Phase94RouteCloneRecord[] = [];

  for (const route of options.routes) {
    const baseline = baselineForRoute(route);
    const sourcePath = campaignDir(root, baseline.sourceCampaignId);
    const exists = existsSync(sourcePath);
    if (!exists) {
      throw new Error(`Phase 94 baseline campaign does not exist for ${route.id}: ${sourcePath}`);
    }
    const routesForBaseline = baselineRoutes.get(baseline.baselinePoolId) ?? [];
    routesForBaseline.push(route.id);
    baselineRoutes.set(baseline.baselinePoolId, routesForBaseline);
    baselinesById.set(baseline.baselinePoolId, {
      baselinePoolId: baseline.baselinePoolId,
      sourceCampaignId: baseline.sourceCampaignId,
      sourceCampaignPath: sourcePath,
      routeIds: routesForBaseline,
      exists,
    });

    const cloneCampaignId = randomUUID();
    const clonePath = campaignDir(root, cloneCampaignId);
    const cloneRecord: Phase94RouteCloneRecord = {
      routeId: route.id,
      profile: options.profile,
      baselinePoolId: baseline.baselinePoolId,
      sourceCampaignId: baseline.sourceCampaignId,
      cloneCampaignId,
      sourceCampaignPath: sourcePath,
      cloneCampaignPath: clonePath,
      routeOutputRoot: resolve(options.outRoot, route.id),
      dryRun: options.dryRun,
      status: options.dryRun ? "planned" : "created",
    };

    if (!options.dryRun) {
      if (existsSync(clonePath)) {
        throw new Error(`Clone campaign target already exists: ${clonePath}`);
      }
      const cloneResult = await cloneCampaignCleanStart({
        sourceCampaignId: baseline.sourceCampaignId,
        targetCampaignId: cloneCampaignId,
        nameSuffix: `[P94 ${route.id}]`,
      });
      if (cloneResult.targetDir !== clonePath) {
        throw new Error(`Manifest clone returned unexpected target path: ${cloneResult.targetDir}`);
      }
    }
    routeClones.push(cloneRecord);
  }

  const artifact: Phase94BaselinePoolArtifact = {
    phase: 94,
    runId: options.runId,
    dryRun: options.dryRun,
    profile: options.profile,
    baselines: [...baselinesById.values()],
    routeClones,
  };
  assertPhase94BaselinePoolValid(artifact, { routeIds: options.routes.map((route) => route.id) });
  return artifact;
}
