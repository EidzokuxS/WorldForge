import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  factionOperations,
  factionReports,
  factionResourceLedger,
  factionResources,
  factions,
  locationRecentEvents,
  locations,
} from "../../db/schema.js";
import { runCommandNodeDecisionPass } from "../command-node-agent.js";
import {
  createFactionReport,
  ensureFactionCommandNode,
  ensureFactionResource,
} from "../faction-command-network.js";
import { ensureWorldClock } from "../living-world-authority.js";

const CAMPAIGN_ID = "command-node-agent";
const FACTION_ID = "faction-wardens";
const LOCATION_ID = "loc-market";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Command Node Agent",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  getDb().insert(locations).values({
    id: LOCATION_ID,
    campaignId: CAMPAIGN_ID,
    name: "Night Market",
    description: "A market where command reports arrive.",
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
  getDb().insert(factions).values({
    id: FACTION_ID,
    campaignId: CAMPAIGN_ID,
    name: "Market Wardens",
    tags: "[]",
    goals: "[]",
    assets: "[]",
  }).run();
  ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 0, worldTimeMinutes: 0 });
}

describe("command node agent", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-command-node-agent-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not inspect idle command nodes with no report, standing order, wake, or retry", async () => {
    const node = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      standingOrders: [],
    });

    const result = await runCommandNodeDecisionPass({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      commandNodeIds: [node.id],
      decideCommandNode: () => {
        throw new Error("idle command node should not be asked for an operation");
      },
    });

    expect(result.inspectedCommandNodeIds).toEqual([]);
    expect(result.results).toEqual([]);
  });

  it("blocks proposed operations when the command node lacks sufficient resources", async () => {
    const node = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      standingOrders: [],
    });
    const report = createFactionReport({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: node.id,
      route: "report_message",
      summary: "A runner reports pressure at the east gate.",
      sourceLocationId: LOCATION_ID,
    });

    const result = await runCommandNodeDecisionPass({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      commandNodeIds: [node.id],
      decideCommandNode: ({ frame, candidate }) => {
        expect(frame.facts.map((fact) => fact.text)).toContain(report.summary);
        expect(candidate.reports.map((candidateReport) => candidateReport.id)).toEqual([report.id]);
        return {
          action: "propose_operation",
          operationKind: "patrol_shift",
          summary: "Send patrols to the east gate.",
          resourceCosts: { patrols: 1 },
        };
      },
    });

    expect(result.results[0]?.proposal).toMatchObject({
      status: "blocked",
      reason: "insufficient_resource:patrols",
    });
    expect(getDb().select().from(factionOperations).all()[0]).toMatchObject({
      status: "blocked",
      blockedReason: "insufficient_resource:patrols",
    });
  });

  it("commits only through report-backed operation helpers and consumes resources and reports", async () => {
    const node = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      standingOrders: [],
    });
    ensureFactionResource({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      resourceKey: "patrols",
      quantity: 2,
    });
    const report = createFactionReport({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: node.id,
      route: "report_message",
      summary: "A runner reports pressure at the west gate.",
      sourceLocationId: LOCATION_ID,
      hiddenCauseTerms: ["PRIVATE COMMAND CAUSE"],
    });

    const result = await runCommandNodeDecisionPass({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      commandNodeIds: [node.id],
      decideCommandNode: ({ frame }) => {
        expect(JSON.stringify(frame)).toContain("A runner reports pressure at the west gate.");
        return {
          action: "propose_operation",
          operationKind: "patrol_shift",
          summary: "Send one patrol to the west gate.",
          requiredReportIds: [report.id],
          resourceCosts: { patrols: 1 },
          targetLocationId: LOCATION_ID,
          commit: true,
          surfaceLocationRef: LOCATION_ID,
          surfaceSummary: "A visible warden patrol begins checking west-gate permits.",
        };
      },
    });

    expect(result.results[0]?.proposal).toMatchObject({ status: "proposed" });
    expect(result.results[0]?.commit).toMatchObject({ status: "committed" });
    expect(getDb().select().from(factionResources).where(eq(factionResources.id, "patrols")).get())
      .toBeUndefined();
    expect(getDb().select().from(factionResources).all()[0]).toMatchObject({
      resourceKey: "patrols",
      quantity: 1,
    });
    expect(getDb().select().from(factionReports).where(eq(factionReports.id, report.id)).get())
      .toMatchObject({ status: "consumed" });
    expect(getDb().select().from(factionResourceLedger).all()[0]).toMatchObject({
      delta: -1,
    });
    expect(getDb().select().from(locationRecentEvents).all()[0]).toMatchObject({
      summary: "A visible warden patrol begins checking west-gate permits.",
      visibility: "local_signal",
    });
    expect(JSON.stringify(getDb().select().from(locationRecentEvents).all())).not.toContain(
      "PRIVATE COMMAND CAUSE",
    );
  });
});
