import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  authorityTraces,
  actorKnowledgeRecords,
  campaigns,
  factionCommandNodes,
  factionOperations,
  factionReports,
  factionResourceLedger,
  factionResources,
  factions,
  locationRecentEvents,
  locations,
  worldClocks,
} from "../../db/schema.js";
import {
  buildFactionCommandNodeFrame,
  commitFactionOperation,
  createFactionReport,
  ensureFactionCommandNode,
  ensureFactionResource,
  listAvailableFactionReports,
  proposeFactionOperation,
} from "../faction-command-network.js";
import { ensureWorldClock, readWorldClock } from "../living-world-authority.js";

const CAMPAIGN_ID = "faction-command-test";
const FACTION_ID = "faction-wardens";
const LOCATION_ID = "loc-market";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Faction Command Test",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  getDb().insert(locations).values({
    id: LOCATION_ID,
    campaignId: CAMPAIGN_ID,
    name: "Night Market",
    description: "A market where patrol reports arrive late.",
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

describe("faction command network", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-faction-command-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("blocks faction operations without command routing, reports or standing orders, and resources", () => {
    seedFaction();

    const missingNode = proposeFactionOperation({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: "missing-node",
      operationKind: "patrol_shift",
      summary: "Move the patrol line.",
      resourceCosts: { patrols: 1 },
    });
    expect(missingNode).toMatchObject({
      status: "blocked",
      reason: "missing_command_node",
    });

    const node = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      standingOrders: [],
    });
    const missingReport = proposeFactionOperation({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: node.id,
      operationKind: "patrol_shift",
      summary: "Move the patrol line.",
      resourceCosts: { patrols: 1 },
    });
    expect(missingReport).toMatchObject({
      status: "blocked",
      reason: "missing_report_or_standing_order",
    });

    const report = createFactionReport({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: node.id,
      route: "report_message",
      summary: "A runner reports pressure at the north gate.",
      sourceEventIds: ["event-runner-report"],
    });
    const missingResource = proposeFactionOperation({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: node.id,
      operationKind: "patrol_shift",
      summary: "Move the patrol line.",
      requiredReportIds: [report.id],
      resourceCosts: { patrols: 1 },
    });
    expect(missingResource).toMatchObject({
      status: "blocked",
      reason: "insufficient_resource:patrols",
    });
  });

  it("routes reports into command-node knowledge and delivers delayed reports by world time", () => {
    seedFaction();
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
      summary: "The east bridge patrol saw masked couriers entering the market.",
      sourceLocationId: LOCATION_ID,
      sourceEventIds: ["event-east-bridge"],
      deliveryDelayWorldTimeMinutes: 5,
    });

    expect(listAvailableFactionReports({
      campaignId: CAMPAIGN_ID,
      commandNodeId: node.id,
    })).toHaveLength(0);

    getDb().update(worldClocks)
      .set({ worldTimeMinutes: 5, currentTick: 5 })
      .where(eq(worldClocks.campaignId, CAMPAIGN_ID))
      .run();

    const available = listAvailableFactionReports({
      campaignId: CAMPAIGN_ID,
      commandNodeId: node.id,
    });
    expect(available).toHaveLength(1);
    expect(available[0]?.deliveredWorldTimeMinutes).toBe(5);

    const stored = getDb()
      .select()
      .from(factionReports)
      .where(eq(factionReports.id, report.id))
      .get();
    expect(JSON.parse(stored?.sourceKnowledgeIds ?? "[]")).toHaveLength(1);
    expect(getDb().select().from(actorKnowledgeRecords).all()[0]).toMatchObject({
      actorId: `command-node:${node.id}`,
      route: "report_message",
    });

    const frame = buildFactionCommandNodeFrame({
      campaignId: CAMPAIGN_ID,
      commandNodeId: node.id,
    });
    expect(frame.facts.map((fact) => fact.text)).toContain(
      "The east bridge patrol saw masked couriers entering the market.",
    );
    expect(frame.constraints.join("\n")).toContain("command node");
  });

  it("summarizes over-budget command frame records and counts hidden report terms as excluded", () => {
    seedFaction(["Keep the market open.", "Protect the canal permit ledger."]);
    const node = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
    });
    createFactionReport({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: node.id,
      route: "report_message",
      summary: "A runner reports ordinary permit pressure at the market gate.",
      sourceEventIds: ["event-visible-report"],
      hiddenCauseTerms: ["secret patron"],
    });
    for (let index = 0; index < 34; index += 1) {
      ensureFactionResource({
        campaignId: CAMPAIGN_ID,
        factionId: FACTION_ID,
        resourceKey: `resource-${index}`,
        label: `Resource ${index}`,
        quantity: index + 1,
      });
    }

    const frame = buildFactionCommandNodeFrame({
      campaignId: CAMPAIGN_ID,
      commandNodeId: node.id,
    });
    const factText = frame.facts.map((fact) => fact.text).join("\n");

    expect(factText).toContain("Resource 0");
    expect(factText).not.toContain("secret patron");
    expect(frame.facts.some((fact) => fact.route === "source_linked_summary")).toBe(true);
    expect(frame.contextBudgetTrace.frameType).toBe("FactionCommandFrame");
    expect(frame.contextBudgetTrace.excludedByVisibilityCount).toBe(1);
    expect(frame.contextBudgetTrace.summarizedItemCount).toBeGreaterThan(0);
    expect(frame.contextBudgetTrace.sourceLinkedSummaryCount).toBe(1);
    expect(frame.contextBudgetTrace.overflowWarnings).toContainEqual(
      expect.objectContaining({ code: "items_summarized_by_budget" }),
    );
  });

  it("commits faction operations only after resource validation and emits local signals through authority", () => {
    seedFaction(["Keep the night market open unless a source-backed threat arrives."]);
    const node = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
    });
    ensureFactionResource({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      resourceKey: "patrols",
      quantity: 3,
    });

    const proposal = proposeFactionOperation({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: node.id,
      operationKind: "patrol_shift",
      summary: "Send two patrols to the canal arcade.",
      resourceCosts: { patrols: 2 },
      targetLocationId: LOCATION_ID,
    });
    expect(proposal.status).toBe("proposed");
    if (proposal.status !== "proposed") {
      throw new Error("expected proposed faction operation");
    }

    const result = commitFactionOperation({
      campaignId: CAMPAIGN_ID,
      operationId: proposal.operation.id,
      surfaceLocationRef: LOCATION_ID,
      surfaceSummary: "Two extra warden patrols begin checking canal permits.",
    });
    expect(result).toMatchObject({ status: "committed" });
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({
      worldVersion: 1,
      worldTimeMinutes: 1,
    });

    const resource = getDb()
      .select()
      .from(factionResources)
      .where(eq(factionResources.resourceKey, "patrols"))
      .get();
    expect(resource?.quantity).toBe(1);
    expect(getDb().select().from(factionResourceLedger).all()[0]).toMatchObject({
      delta: -2,
      resultWorldVersion: 1,
    });
    expect(getDb().select().from(locationRecentEvents).all()[0]).toMatchObject({
      eventType: "faction_operation_signal",
      surfaceRoute: "faction_report",
      visibility: "local_signal",
    });
  });

  it("revalidates report/resource rows at commit time so stale proposals cannot double-spend authority", () => {
    seedFaction([]);
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
      summary: "A runner reports pressure at the canal gate.",
      sourceEventIds: ["event-canal-gate"],
    });

    const first = proposeFactionOperation({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: node.id,
      operationKind: "patrol_shift",
      summary: "Send the first patrol to the canal gate.",
      requiredReportIds: [report.id],
      resourceCosts: { patrols: 1 },
    });
    const second = proposeFactionOperation({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      commandNodeId: node.id,
      operationKind: "patrol_shift",
      summary: "Send a second patrol using the same report.",
      requiredReportIds: [report.id],
      resourceCosts: { patrols: 1 },
    });
    expect(first.status).toBe("proposed");
    expect(second.status).toBe("proposed");
    if (first.status !== "proposed" || second.status !== "proposed") {
      throw new Error("expected two proposed faction operations");
    }

    const firstCommit = commitFactionOperation({
      campaignId: CAMPAIGN_ID,
      operationId: first.operation.id,
    });
    const secondCommit = commitFactionOperation({
      campaignId: CAMPAIGN_ID,
      operationId: second.operation.id,
    });

    expect(firstCommit).toMatchObject({ status: "committed" });
    expect(secondCommit).toMatchObject({
      status: "blocked",
      reason: `missing_or_unavailable_reports:${report.id}`,
    });
    expect(getDb().select().from(factionReports).where(eq(factionReports.id, report.id)).get())
      .toMatchObject({ status: "consumed" });
    expect(getDb().select().from(factionResources).all()[0]).toMatchObject({
      resourceKey: "patrols",
      quantity: 1,
    });
    expect(getDb().select().from(factionResourceLedger).all()).toHaveLength(1);
    expect(getDb().select().from(authorityTraces).all()).toHaveLength(1);
    expect(getDb().select().from(factionOperations).where(eq(factionOperations.id, second.operation.id)).get())
      .toMatchObject({
        status: "blocked",
        blockedReason: `missing_or_unavailable_reports:${report.id}`,
        authorityTraceId: null,
      });
  });

  it("ignores faction child rows that point at a command node owned by another faction", () => {
    seedFaction([]);
    getDb().insert(factions).values({
      id: "faction-rivals",
      campaignId: CAMPAIGN_ID,
      name: "Rival Wardens",
      tags: "[]",
      goals: "[]",
      assets: "[]",
    }).run();
    const node = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: FACTION_ID,
      standingOrders: [],
    });
    const timestamp = Date.now();
    getDb().insert(factionReports).values({
      id: "mismatched-report",
      campaignId: CAMPAIGN_ID,
      factionId: "faction-rivals",
      commandNodeId: node.id,
      sourceActorId: null,
      sourceLocationId: null,
      route: "report_message",
      status: "available",
      summary: "A rival report should not enter this command node.",
      sourceEventIds: "[]",
      sourceKnowledgeIds: "[]",
      hiddenCauseTerms: "[]",
      baseWorldVersion: 0,
      createdWorldTimeMinutes: 0,
      deliverAtWorldTimeMinutes: 0,
      deliveredWorldTimeMinutes: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();
    getDb().insert(factionOperations).values({
      id: "mismatched-operation",
      campaignId: CAMPAIGN_ID,
      factionId: "faction-rivals",
      commandNodeId: node.id,
      status: "proposed",
      operationKind: "patrol_shift",
      summary: "A rival operation should not enter this command node.",
      requiredReportIds: "[]",
      resourceCosts: "{}",
      targetLocationId: null,
      baseWorldVersion: 0,
      committedWorldVersion: null,
      authorityTraceId: null,
      blockedReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();

    expect(getDb().select().from(factionCommandNodes).all()).toHaveLength(1);
    expect(listAvailableFactionReports({
      campaignId: CAMPAIGN_ID,
      commandNodeId: node.id,
    })).toEqual([]);

    const frame = buildFactionCommandNodeFrame({
      campaignId: CAMPAIGN_ID,
      commandNodeId: node.id,
    });
    const frameText = frame.facts.map((fact) => fact.text).join("\n");

    expect(frameText).not.toContain("rival report");
    expect(frameText).not.toContain("rival operation");
  });
});
