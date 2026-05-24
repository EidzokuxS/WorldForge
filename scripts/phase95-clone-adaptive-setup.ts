import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { buildPhase94BaselinePool } from "../e2e/phase-94/baseline-pool.ts";
import { writeJsonFile } from "../e2e/phase-94/artifact-schema.ts";
import { getPhase94Routes } from "../e2e/phase-94/route-manifest.ts";

const API = process.env.WORLDFORGE_API_BASE ?? process.env.BACKEND_URL ?? "http://localhost:3001";
const BASELINE_POOL_ID = process.env.PHASE95_BASELINE_POOL_ID ?? "lacquer-signal";
const ROUTE_ID = process.env.PHASE95_ROUTE_ID ?? defaultRouteForBaseline(BASELINE_POOL_ID);
const PROFILE = process.env.PHASE95_CLONE_PROFILE ?? "phase95-clone-adaptive";
const SUITE_LABEL = process.env.PHASE95_SUITE_LABEL ?? "phase95-clone-adaptive";
const ROOT = resolve(
  process.env.PHASE95_ACTUAL_ROOT ?? `output/playwright/${SUITE_LABEL}-${stamp()}`,
);
const TARGET_TURNS = Number.parseInt(process.env.PHASE95_TARGET_TURNS ?? "60", 10);

function defaultRouteForBaseline(baselinePoolId: string): string {
  if (baselinePoolId === "urban-occult-crossover") return "combat-power";
  return "tourist-courier";
}

function stamp(): string {
  return new Date()
    .toISOString()
    .slice(0, 19)
    .split(":")
    .join("")
    .split("-")
    .join("")
    .split("T")
    .join("-");
}

function trimTrailingSlash(value: string): string {
  let result = String(value);
  while (result.endsWith("/") || result.endsWith("\\")) {
    result = result.slice(0, -1);
  }
  return result;
}

async function apiJson(route: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${trimTrailingSlash(API)}${route}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let data = null;
  if (text.trim().length > 0) {
    data = JSON.parse(text);
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${route} failed: ${response.status} ${text}`);
  }
  return data;
}

async function main(): Promise<void> {
  mkdirSync(ROOT, { recursive: true });
  const routeTemplate = getPhase94Routes([ROUTE_ID])[0];
  if (!routeTemplate) {
    throw new Error(`Unknown Phase 94 route id for clone setup: ${ROUTE_ID}`);
  }

  const route = {
    ...routeTemplate,
    title: `Phase 95 clone adaptive: ${routeTemplate.title}`,
    baselinePoolId: BASELINE_POOL_ID,
    actionScript: [
      "Adaptive player chooses each move from the live visible state, not from a fixed route.",
    ],
  };
  const runId = `${SUITE_LABEL}-${stamp()}-${ROUTE_ID}-${BASELINE_POOL_ID}`;
  const pool = await buildPhase94BaselinePool({
    routes: [route],
    runId,
    profile: PROFILE,
    dryRun: false,
    reuseBaselines: false,
    outRoot: ROOT,
  });
  const clone = pool.routeClones[0];
  if (!clone) throw new Error("Clone setup did not return a campaign clone.");

  await apiJson(`/api/campaigns/${encodeURIComponent(clone.cloneCampaignId)}/load`, {
    method: "POST",
  });
  const world = await apiJson(`/api/campaigns/${encodeURIComponent(clone.cloneCampaignId)}/world`);
  let history = null;
  try {
    history = await apiJson(`/api/chat/history?campaignId=${encodeURIComponent(clone.cloneCampaignId)}`);
  } catch {
    history = null;
  }

  const createdAt = new Date().toISOString();
  const metadata = {
    setupMode: "clone",
    gateVersion: "phase95-clone-adaptive-v1",
    createdAt,
    backendUrl: API,
    runId,
    profile: PROFILE,
    targetTurns: TARGET_TURNS,
    routeId: ROUTE_ID,
    baselinePoolId: BASELINE_POOL_ID,
    sourceCampaignId: clone.sourceCampaignId,
    sourceCampaignPath: clone.sourceCampaignPath,
    cloneCampaignId: clone.cloneCampaignId,
    cloneCampaignPath: clone.cloneCampaignPath,
    outputRoot: ROOT,
  };
  const state = {
    startedAt: createdAt,
    setupMode: "clone",
    campaignId: clone.cloneCampaignId,
    campaignName: world?.campaign?.name ?? world?.config?.name ?? null,
    routeId: ROUTE_ID,
    baselinePoolId: BASELINE_POOL_ID,
    sourceCampaignId: clone.sourceCampaignId,
    cloneCampaignPath: clone.cloneCampaignPath,
    worldGeneratedAt: createdAt,
    worldgenDone: {
      clonedFromBaseline: clone.sourceCampaignId,
      baselinePoolId: BASELINE_POOL_ID,
    },
    playerSavedAt: createdAt,
    openingAt: createdAt,
    turns: [],
  };

  writeJsonFile(join(ROOT, "baseline-pool.json"), pool);
  writeJsonFile(join(ROOT, "clone-provenance.json"), metadata);
  writeJsonFile(join(ROOT, "state.json"), state);
  writeJsonFile(join(ROOT, "world-after-clone-load.json"), world);
  if (history) writeJsonFile(join(ROOT, "history-after-clone-load.json"), history);
  writeFileSync(
    join(ROOT, "transcript.md"),
    [
      "# Phase 95 Clone Adaptive Player Run",
      "",
      `Started: ${createdAt}`,
      "",
      "## Clone",
      "",
      `Source campaign: ${clone.sourceCampaignId}`,
      `Clone campaign: ${clone.cloneCampaignId}`,
      `Baseline pool: ${BASELINE_POOL_ID}`,
      `Route id: ${ROUTE_ID}`,
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(JSON.stringify({ ok: true, ...metadata }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
