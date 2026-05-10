import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  factionCommandNodes,
  factions,
  locations,
  worldClocks,
} from "../../db/schema.js";
import { enqueueActorWakeSignal } from "../actor-wake-signals.js";
import {
  createFactionReport,
  ensureFactionCommandNode,
  ensureFactionResource,
  proposeFactionOperation,
} from "../faction-command-network.js";
import { scheduleFactionCommandNodes } from "../faction-command-scheduler.js";
import { ensureWorldClock } from "../living-world-authority.js";

const CAMPAIGN_ID = "faction-command-scheduler";
const FACTION_ID = "faction-wardens";
const LOCATION_ID = "loc-market";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Faction Command Scheduler",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  getDb().insert(locations).values({
    id: LOCATION_ID,
    campaignId: CAMPAIGN_ID,
    name: "Night Market",
    description: "A market with reports and patrol resources.",
    kind: "macro",
    parentLocationId: null,
    anchorLocationId: null,
    persistence: "persistent",
    expiresAtTick: null,
    archivedAtTick: null,
    tags: "[]",
    isStarting: true,
    connectedTo: "[]",
  }).run();
  ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 0, worldTimeMinutes: 0 });
}

function seedFaction(goals: string[] = []) {
  getDb().insert(factions).values({
    id: FACTION_ID,
    campaignId: CAMPAIGN_ID,
    name: "Market Wardens",
    tags: "[]",
    goals: JSON.stringify(goals),
    assets: "[]",
  }).run();
}

describe("faction command scheduler", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-faction-scheduler-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("selects no command nodes without reports, standing orders, wake signals, or retries", () => {
    seedFaction();
    ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      standingOrders: [],
    });

    expect(scheduleFactionCommandNodes({ campaignId: CAMPAIGN_ID }).candidates).toEqual([]);
  });

  it("selects command nodes from arrived reports and resource summaries", () => {
    seedFaction();
    const node = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      standingOrders: [],
    });
    ensureFactionResource({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      resourceKey: "patrols",
      quantity: 3,
      metadata: { privateStockpile: "not player-facing" },
    });
    createFactionReport({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: node.id,
      route: "report_message",
      summary: "Runner reports canal pressure at the market edge.",
      sourceLocationId: LOCATION_ID,
      deliveryDelayWorldTimeMinutes: 5,
    });

    expect(scheduleFactionCommandNodes({ campaignId: CAMPAIGN_ID }).candidates).toEqual([]);

    getDb().update(worldClocks)
      .set({ worldTimeMinutes: 5, currentTick: 5 })
      .where(eq(worldClocks.campaignId, CAMPAIGN_ID))
      .run();

    const candidates = scheduleFactionCommandNodes({ campaignId: CAMPAIGN_ID }).candidates;
    expect(candidates).toEqual([
      expect.objectContaining({
        commandNodeId: node.id,
        factionId: FACTION_ID,
        reason: "available_report",
        reasons: ["available_report"],
        resources: [
          expect.objectContaining({
            resourceKey: "patrols",
            quantity: 3,
            availableQuantity: 3,
          }),
        ],
      }),
    ]);
    expect(candidates[0]?.reports.map((report) => report.summary)).toEqual([
      "Runner reports canal pressure at the market edge.",
    ]);
  });

  it("selects command nodes from standing orders, durable wakes, and resource retry signals", () => {
    seedFaction();
    const node = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      standingOrders: ["Keep patrols near the Night Market gates."],
    });
    ensureFactionResource({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      resourceKey: "patrols",
      quantity: 0,
    });
    const blocked = proposeFactionOperation({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: node.id,
      operationKind: "patrol_shift",
      summary: "Send patrols to the market gates.",
      resourceCosts: { patrols: 1 },
    });
    expect(blocked.status).toBe("blocked");
    enqueueActorWakeSignal({
      campaignId: CAMPAIGN_ID,
      actorType: "faction_command_node",
      actorId: node.id,
      signalType: "report",
      sourceType: "faction_report",
      sourceId: "report-urgent",
      summary: "Urgent gate report is ready.",
      priority: 8,
      dueWorldTimeMinutes: 0,
    });

    const candidate = scheduleFactionCommandNodes({ campaignId: CAMPAIGN_ID }).candidates[0];

    expect(candidate).toMatchObject({
      commandNodeId: node.id,
      reason: "standing_order",
      reasons: ["standing_order", "durable_wake_signal", "operation_retry"],
    });
    expect(candidate?.wakeSignals).toHaveLength(1);
    expect(candidate?.retryOperations).toEqual([
      expect.objectContaining({ reason: "insufficient_resource:patrols" }),
    ]);
  });

  it("respects explicit command-node filters without scanning unrelated command nodes into decisions", () => {
    seedFaction(["Keep watch."]);
    const first = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      label: "First command",
    });
    const second = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      label: "Second command",
    });
    getDb().update(factionCommandNodes)
      .set({ standingOrders: JSON.stringify(["Second order."]) })
      .where(eq(factionCommandNodes.id, second.id))
      .run();

    const result = scheduleFactionCommandNodes({
      campaignId: CAMPAIGN_ID,
      commandNodeIds: [second.id],
    });

    expect(result.candidates.map((candidate) => candidate.commandNodeId)).toEqual([second.id]);
    expect(result.candidates.map((candidate) => candidate.commandNodeId)).not.toContain(first.id);
  });
});
