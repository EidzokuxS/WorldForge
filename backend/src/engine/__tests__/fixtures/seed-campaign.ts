/**
 * Phase 58-04 — minimal campaign fixture seeder for route-level integration
 * tests.
 *
 * Purpose:
 *   `app.request("/api/chat/action", ...)` flows through the real chat
 *   route, which calls `readCampaignConfig(campaignId)` during turn
 *   context setup. `readCampaignConfig` resolves to
 *   `{GSD_CAMPAIGNS_ROOT}/campaigns/{id}/config.json` under Plan 58-01's
 *   env-aware `getCampaignsDir()`. If the file is missing the route
 *   throws a 404.
 *
 *   The heavy collaborators (DB queries, processTurn body, embedder,
 *   image work) are stubbed in `mock-llm.ts`. All the seed needs to
 *   provide on disk is a valid `config.json` so the route's
 *   `currentTick` read resolves.
 *
 *   The pipeline-simulator inside `processTurn` mock emits the 14
 *   engine-owned seams, so a minimal config.json is sufficient to
 *   trigger all 18 seams end-to-end through the real route.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface SeedOptions {
  /** Initial campaign tick (default 0). */
  tick?: number;
  /** Premise string (default placeholder). */
  premise?: string;
}

/**
 * Seed a campaign fixture on disk at `{campaignsRoot}/{campaignId}/`.
 *
 * `campaignsRoot` is expected to be the value that will be assigned to
 * `GSD_CAMPAIGNS_ROOT` — i.e. the directory `getCampaignsDir()` returns
 * at call time. The chat route then resolves
 *   `getCampaignConfigPath(id) = {GSD_CAMPAIGNS_ROOT}/{id}/config.json`
 * directly against this path.
 *
 * Writes only `config.json` + `chat_history.json` — the route mocks
 * short-circuit DB / vector / LLM calls, so we don't need `state.db`
 * for the observability-coverage assertion.
 */
export function seedCampaignWithAllSeams(
  campaignsRoot: string,
  campaignId: string,
  opts: SeedOptions = {},
): void {
  const tick = opts.tick ?? 0;
  const premise = opts.premise ?? "Observability acceptance test premise.";

  const dir = join(campaignsRoot, campaignId);
  mkdirSync(dir, { recursive: true });

  const now = Date.now();
  const config = {
    name: `Observability-${campaignId}`,
    premise,
    createdAt: now,
    updatedAt: now,
    generationComplete: true,
    currentTick: tick,
    reflection: { threshold: 1 },
    factions: { tickInterval: 1 },
  };
  writeFileSync(join(dir, "config.json"), JSON.stringify(config, null, 2));
  writeFileSync(join(dir, "chat_history.json"), "[]");
}
