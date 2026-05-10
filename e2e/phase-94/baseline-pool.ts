import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import Database from "better-sqlite3";

import type { Phase94RouteId } from "../../backend/src/engine/phase-94-trace-assertions.js";
import {
  assertPhase94BaselinePoolValid,
  writeJsonFile,
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

function quoteSqlIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function rewriteCampaignIdInDatabase(stateDbPath: string, sourceCampaignId: string, targetCampaignId: string): string[] {
  const db = new Database(stateDbPath);
  const updatedTables: string[] = [];
  try {
    db.pragma("foreign_keys = OFF");
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>;
    const rewrite = db.transaction(() => {
      if (tables.some((table) => table.name === "campaigns")) {
        const result = db.prepare("UPDATE campaigns SET id = ?, updated_at = ? WHERE id = ?")
          .run(targetCampaignId, Date.now(), sourceCampaignId);
        if (result.changes > 0) updatedTables.push("campaigns");
      }
      for (const table of tables) {
        const tableName = quoteSqlIdentifier(table.name);
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
        if (!columns.some((column) => column.name === "campaign_id")) continue;
        const result = db.prepare(`UPDATE ${tableName} SET campaign_id = ? WHERE campaign_id = ?`)
          .run(targetCampaignId, sourceCampaignId);
        if (result.changes > 0) updatedTables.push(table.name);
      }
    });
    rewrite();
    const violations = db.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(`Campaign clone created ${violations.length} foreign-key violation(s).`);
    }
    db.pragma("wal_checkpoint(TRUNCATE)");
    return updatedTables;
  } finally {
    db.pragma("foreign_keys = ON");
    db.close();
  }
}

function rewriteCloneFiles(input: {
  targetDir: string;
  sourceCampaignId: string;
  targetCampaignId: string;
  routeId: Phase94RouteId;
}): void {
  const configPath = join(input.targetDir, "config.json");
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    if (config.id === input.sourceCampaignId) config.id = input.targetCampaignId;
    config.name = `${String(config.name ?? "Phase 94 baseline")} [P94 ${input.routeId}]`;
    config.updatedAt = Date.now();
    writeJsonFile(configPath, config);
  }
  writeJsonFile(join(input.targetDir, "chat_history.json"), []);
  rmSync(join(input.targetDir, "checkpoints"), { recursive: true, force: true });
  rmSync(join(input.targetDir, ".turn-boundaries"), { recursive: true, force: true });
  rewriteCampaignIdInDatabase(join(input.targetDir, "state.db"), input.sourceCampaignId, input.targetCampaignId);
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

export function buildPhase94BaselinePool(options: Phase94BaselinePoolOptions): Phase94BaselinePoolArtifact {
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
      status: options.dryRun ? "planned" : options.reuseBaselines ? "reused" : "created",
    };

    if (!options.dryRun && !options.reuseBaselines) {
      if (existsSync(clonePath)) {
        throw new Error(`Clone campaign target already exists: ${clonePath}`);
      }
      cpSync(sourcePath, clonePath, { recursive: true, errorOnExist: true });
      rewriteCloneFiles({
        targetDir: clonePath,
        sourceCampaignId: baseline.sourceCampaignId,
        targetCampaignId: cloneCampaignId,
        routeId: route.id,
      });
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
  assertPhase94BaselinePoolValid(artifact);
  return artifact;
}
