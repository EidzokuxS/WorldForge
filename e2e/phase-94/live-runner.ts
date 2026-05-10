import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

import type { Phase94RouteId } from "../../backend/src/engine/phase-94-trace-assertions.js";
import type {
  Phase94BaselinePoolArtifact,
  Phase94RouteManifestEntry,
  Phase94RouteResult,
} from "./artifact-schema.js";
import { writeJsonFile } from "./artifact-schema.js";
import { assertPhase94Route } from "./route-assertions.js";
import {
  buildCollectedTurn,
  completedTurnCount,
  fetchWorldSnapshot,
  writeCollectedTurn,
  type Phase94CollectedTurn,
} from "./trace-collector.js";

export interface Phase94LiveRunnerOptions {
  routes: readonly Phase94RouteManifestEntry[];
  baselinePool: Phase94BaselinePoolArtifact;
  outRoot: string;
  backendUrl: string;
  frontendUrl: string;
  turnsPerRoute: number;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function takeActions(actions: readonly string[], limit: number): string[] {
  const selected: string[] = [];
  for (let index = 0; index < actions.length && selected.length < limit; index += 1) {
    selected.push(actions[index]);
  }
  return selected;
}

async function fetchJson(input: {
  backendUrl: string;
  path: string;
  init?: RequestInit;
}): Promise<unknown> {
  const response = await fetch(`${input.backendUrl}${input.path}`, input.init);
  if (!response.ok) {
    throw new Error(`${input.init?.method ?? "GET"} ${input.path} failed: ${response.status} ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) as unknown : null;
}

async function loadCampaign(input: {
  backendUrl: string;
  campaignId: string;
}): Promise<void> {
  await fetchJson({
    backendUrl: input.backendUrl,
    path: `/api/campaigns/${input.campaignId}/load`,
    init: { method: "POST" },
  });
}

function cloneForRoute(pool: Phase94BaselinePoolArtifact, routeId: Phase94RouteId) {
  const clone = pool.routeClones.find((candidate) => candidate.routeId === routeId);
  if (!clone) {
    throw new Error(`No Phase 94 route clone found for ${routeId}.`);
  }
  return clone;
}

async function runRoute(input: {
  route: Phase94RouteManifestEntry;
  cloneCampaignId: string;
  routeRoot: string;
  backendUrl: string;
  frontendUrl: string;
  turnsPerRoute: number;
}): Promise<Phase94RouteResult> {
  mkdirSync(input.routeRoot, { recursive: true });
  await loadCampaign({ backendUrl: input.backendUrl, campaignId: input.cloneCampaignId });
  const browser = await chromium.launch();
  const turns: Phase94CollectedTurn[] = [];
  try {
    const page = await browser.newPage();
    await page.goto(`${input.frontendUrl}/game`, { waitUntil: "domcontentloaded", timeout: 0 });
    await page.screenshot({ path: join(input.routeRoot, "route-start.png"), fullPage: true });
    const alreadyCompleted = completedTurnCount(input.routeRoot);
    const actions = takeActions(input.route.actionScript, input.turnsPerRoute);

    for (let index = alreadyCompleted; index < actions.length; index += 1) {
      const turnIndex = index + 1;
      const action = actions[index];
      const worldBefore = await fetchWorldSnapshot({
        backendUrl: input.backendUrl,
        campaignId: input.cloneCampaignId,
      });
      const actionBox = page.getByRole("textbox", { name: "Scene action" });
      await actionBox.waitFor({ state: "visible", timeout: 0 });
      await actionBox.fill(action, { timeout: 0 });
      const responsePromise = page.waitForResponse((response) => (
        response.url().includes("/api/chat/action")
        && response.request().method() === "POST"
      ), { timeout: 0 });
      try {
        await page.getByRole("button", { name: "Send action" }).click({ timeout: 0 });
      } catch (error) {
        await responsePromise.catch(() => null);
        throw error;
      }
      const response = await responsePromise;
      const rawSse = await response.text();
      const screenshotPath = join(input.routeRoot, `turn-${turnIndex}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const worldAfter = await fetchWorldSnapshot({
        backendUrl: input.backendUrl,
        campaignId: input.cloneCampaignId,
      });
      const turn = buildCollectedTurn({
        routeId: input.route.id,
        campaignId: input.cloneCampaignId,
        turnIndex,
        action,
        rawSse,
        worldBefore,
        worldAfter,
        screenshotPath,
      });
      writeCollectedTurn({ routeRoot: input.routeRoot, turn });
      turns.push(turn);
    }
    await page.screenshot({ path: join(input.routeRoot, "final-state.png"), fullPage: true });
  } finally {
    await browser.close();
  }

  const assertion = assertPhase94Route({
    routeId: input.route.id,
    turns,
  });
  writeJsonFile(join(input.routeRoot, "route-assertions.json"), assertion);
  return {
    routeId: input.route.id,
    cloneCampaignId: input.cloneCampaignId,
    status: assertion.status,
    hardFailureCount: assertion.findings.filter((finding) => finding.severity === "hard").length,
    missingArtifactCount: 0,
    artifactRoot: input.routeRoot,
  };
}

export async function runPhase94LiveRoutes(options: Phase94LiveRunnerOptions): Promise<{
  routeResults: Phase94RouteResult[];
}> {
  const backendUrl = stripTrailingSlash(options.backendUrl);
  const frontendUrl = stripTrailingSlash(options.frontendUrl);
  const routeResults: Phase94RouteResult[] = [];
  for (const route of options.routes) {
    const clone = cloneForRoute(options.baselinePool, route.id);
    const routeRoot = resolve(options.outRoot, route.id);
    try {
      routeResults.push(await runRoute({
        route,
        cloneCampaignId: clone.cloneCampaignId,
        routeRoot,
        backendUrl,
        frontendUrl,
        turnsPerRoute: options.turnsPerRoute,
      }));
    } catch (error) {
      const failure: Phase94RouteResult = {
        routeId: route.id,
        cloneCampaignId: clone.cloneCampaignId,
        status: "failed",
        hardFailureCount: 1,
        missingArtifactCount: 0,
        artifactRoot: routeRoot,
      };
      writeJsonFile(join(routeRoot, "route-error.json"), {
        routeId: route.id,
        error: error instanceof Error ? error.message : String(error),
      });
      routeResults.push(failure);
    }
  }
  writeJsonFile(join(options.outRoot, "route-results.json"), {
    phase: 94,
    routeResults,
  });
  return { routeResults };
}
