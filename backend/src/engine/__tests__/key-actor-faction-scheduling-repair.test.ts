import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  actorProcessStates,
  authorityTraces,
  campaigns,
  factionReports,
  factionResourceLedger,
  factionResources,
  factions,
  locationEdges,
  locationRecentEvents,
  locations,
  npcs,
  players,
} from "../../db/schema.js";
import {
  backfillKeyActorProcessesForCampaign,
} from "../key-actor-process.js";
import { scheduleKeyActorProcessesForTurn } from "../actor-scheduler.js";
import { resolveDueWorldWorkForScope } from "../due-world-work.js";
import { buildSceneFrame, type SceneFrame } from "../scene-frame.js";
import { buildModelFacingScenePacket } from "../model-facing-scene.js";
import {
  buildNarratorPacket,
  formatNarratorPacketForPrompt,
  type CanonicalTurnPacket,
} from "../narrator-packet.js";
import { runCommandNodeDecisionPass } from "../command-node-agent.js";
import {
  commitFactionOperation,
  createFactionReport,
  ensureFactionCommandNode,
  ensureFactionResource,
  proposeFactionOperation,
} from "../faction-command-network.js";
import { ensureWorldClock } from "../living-world-authority.js";

const CAMPAIGN_ID = "phase-92-acceptance";
const PLAYER_ID = "player-phase-92";
const PHASE_DIR = path.resolve(
  process.cwd(),
  "..",
  ".planning",
  "phases",
  "92-key-actor-and-faction-scheduling-repair",
);
const EVIDENCE_DIR = path.join(PHASE_DIR, "evidence");
const ACTOR_EVIDENCE = path.join(EVIDENCE_DIR, "acceptance-key-actor.jsonl");
const FACTION_EVIDENCE = path.join(EVIDENCE_DIR, "acceptance-faction-command.jsonl");

let tempDir = "";
let previousCampaignsRoot: string | undefined;

function writeEvidence(filePath: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Phase 92 Acceptance",
    premise: "A deterministic acceptance campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  const campaignDir = path.join(process.env.GSD_CAMPAIGNS_ROOT!, CAMPAIGN_ID);
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir, "config.json"),
    JSON.stringify({
      name: "Phase 92 Acceptance",
      premise: "A deterministic acceptance campaign.",
      createdAt: timestamp,
      currentTick: 20,
    }),
  );
}

function seedLocation(id: string, name: string) {
  getDb().insert(locations).values({
    id,
    campaignId: CAMPAIGN_ID,
    name,
    description: `${name} description.`,
    kind: "macro",
    parentLocationId: null,
    anchorLocationId: null,
    persistence: "persistent",
    expiresAtTick: null,
    archivedAtTick: null,
    tags: "[]",
    isStarting: id === "loc-player",
    connectedTo: "[]",
  }).run();
}

function seedEdge(fromLocationId: string, toLocationId: string) {
  getDb().insert(locationEdges).values({
    id: `${fromLocationId}-${toLocationId}`,
    campaignId: CAMPAIGN_ID,
    fromLocationId,
    toLocationId,
    travelCost: 4,
    discovered: true,
  }).run();
}

function seedPlayer(locationId: string) {
  getDb().insert(players).values({
    id: PLAYER_ID,
    campaignId: CAMPAIGN_ID,
    name: "Iria",
    race: "Human",
    gender: "",
    age: "",
    appearance: "",
    hp: 5,
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    equippedItems: "[]",
    currentLocationId: locationId,
    currentSceneLocationId: null,
  }).run();
}

function seedNpc(input: {
  id: string;
  name: string;
  locationId: string;
  goals?: string[];
}) {
  getDb().insert(npcs).values({
    id: input.id,
    campaignId: CAMPAIGN_ID,
    name: input.name,
    persona: `${input.name} persona.`,
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    tier: "key",
    currentLocationId: input.locationId,
    currentSceneLocationId: null,
    goals: JSON.stringify({
      short_term: input.goals ?? ["wait"],
      long_term: ["persist"],
    }),
    beliefs: "[]",
    unprocessedImportance: 0,
    inactiveTicks: 0,
    createdAt: Date.now(),
  }).run();
}

function setActorPlan(actorId: string, activePlan: unknown, nextWakeWorldTimeMinutes: number) {
  const row = getDb()
    .select()
    .from(actorProcessStates)
    .where(eq(actorProcessStates.actorId, actorId))
    .get();
  if (!row) {
    throw new Error(`missing actor process ${actorId}`);
  }
  const processState = JSON.parse(row.processState) as Record<string, unknown>;
  getDb()
    .update(actorProcessStates)
    .set({
      processState: JSON.stringify({ ...processState, activePlan }),
      nextWakeWorldTimeMinutes,
    })
    .where(eq(actorProcessStates.id, row.id))
    .run();
}

function seedFaction() {
  getDb().insert(factions).values({
    id: "faction-wardens",
    campaignId: CAMPAIGN_ID,
    name: "Market Wardens",
    tags: "[]",
    goals: "[]",
    assets: "[]",
  }).run();
}

function canonicalPacketFromFrame(frame: SceneFrame): CanonicalTurnPacket {
  const anchorEventId = "anchor-observe-market";
  const eventIds = frame.recentEvents.map((event) => event.id);
  return {
    campaignId: frame.campaignId,
    tick: frame.tick,
    playerAction: frame.playerAction,
    oracleOutcome: null,
    narratorFacts: {
      anchorEventId,
      eventIds,
      responseIds: [],
      actionIds: [],
      toolResultRefs: [],
    },
    anchorEvent: {
      id: anchorEventId,
      actorId: PLAYER_ID,
      kind: "player_action",
      summary: "Iria observes the local consequences.",
      perceivableByPlayer: true,
    },
    events: frame.recentEvents.map((event) => ({
      id: event.id,
      actorId: event.actorIds[0] ?? "world",
      kind: "environment",
      summary: event.summary,
      perceivableByPlayer: event.perceivableByPlayer,
    })),
    responses: [],
    effects: [],
    actionResults: [],
    guardrails: ["Narrate only source-backed visible Phase 92 acceptance facts."],
    controlReturnReason: "Return control after the visible acceptance signal.",
  };
}

describe("Phase 92 key actor and faction scheduling repair acceptance", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-phase-92-acceptance-"));
    previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
    process.env.GSD_CAMPAIGNS_ROOT = path.join(tempDir, "campaigns");
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
    seedLocation("loc-player", "Player Square");
    seedLocation("loc-remote", "Remote Archive");
    seedLocation("loc-depot", "Courier Depot");
    seedEdge("loc-remote", "loc-depot");
    seedEdge("loc-depot", "loc-remote");
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 20, worldTimeMinutes: 20 });
  });

  afterEach(() => {
    closeDb();
    if (previousCampaignsRoot === undefined) {
      delete process.env.GSD_CAMPAIGNS_ROOT;
    } else {
      process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("proves one due key actor can settle without waking sleeper actors", async () => {
    seedPlayer("loc-depot");
    for (let index = 0; index < 40; index += 1) {
      seedNpc({
        id: `npc-sleeper-${index}`,
        name: `Sleeper ${index}`,
        locationId: "loc-remote",
      });
    }
    seedNpc({
      id: "npc-due-courier",
      name: "Due Courier",
      locationId: "loc-remote",
      goals: ["PRIVATE ROUTE: deliver sealed orders"],
    });
    backfillKeyActorProcessesForCampaign({
      campaignId: CAMPAIGN_ID,
      nextWakeDelayMinutes: 120,
    });
    setActorPlan("npc-due-courier", {
      id: "plan-courier-depot",
      summary: "PRIVATE ROUTE: Due Courier carries sealed orders to the depot.",
      deterministic: true,
      writeScopes: ["npc:npc-due-courier:state", "location:loc-depot:presence"],
      action: {
        kind: "travel",
        destinationLocationName: "Courier Depot",
        summary: "A courier arrives at the depot with a sealed satchel.",
        surface: {
          surfaceRoute: "physical_trace",
          visibility: "local_signal",
          knowledgeRoute: "direct_observation",
          hiddenCauseTerms: ["PRIVATE ROUTE"],
        },
      },
    }, 20);

    const schedule = scheduleKeyActorProcessesForTurn({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerLocationId: "loc-player",
      elapsedWorldTimeMinutes: 1,
    });
    const dueWork = resolveDueWorldWorkForScope({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerLocationId: "loc-player",
      elapsedWorldTimeMinutes: 1,
      phase: "pre_scene_frame",
    });
    const frame = await buildSceneFrame({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerAction: "I check the depot for signs of offscreen movement.",
      runActorExposureCatchup: false,
    });
    const recentEvents = getDb().select().from(locationRecentEvents).all();
    const authority = getDb().select().from(authorityTraces).all();
    const evidence = {
      scenario: "key-actor-due-plan",
      candidateActorIds: schedule.candidateActorIds,
      decisionActorIds: schedule.decisions.map((decision) => decision.actorId),
      sleeperDecisionCount: schedule.decisions.filter((decision) =>
        decision.actorId.startsWith("npc-sleeper-"),
      ).length,
      executedActorIds: dueWork.executed.map((result) => result.actorId),
      authorityOperations: authority.map((trace) => trace.operation),
      eventIds: recentEvents.map((event) => event.id),
      consequenceVisibleInFrame: frame.recentEvents.some((event) =>
        event.summary.includes("sealed satchel"),
      ),
    };

    expect(schedule.decisions.map((decision) => decision.actorId)).toEqual([
      "npc-due-courier",
    ]);
    expect(evidence.sleeperDecisionCount).toBe(0);
    expect(dueWork.executed).toEqual([
      expect.objectContaining({ actorId: "npc-due-courier", status: "completed" }),
    ]);
    expect(authority.map((trace) => trace.operation)).toContain("actor_plan:travel");
    expect(frame.recentEvents.map((event) => event.summary)).toContain(
      "A courier arrives at the depot with a sealed satchel.",
    );
    expect(JSON.stringify({ evidence, frame: frame.recentEvents })).not.toContain("PRIVATE ROUTE");
    writeEvidence(ACTOR_EVIDENCE, evidence);
  });

  it("proves faction command paths require reports or orders, resources, and private POV redaction", async () => {
    seedPlayer("loc-depot");
    seedFaction();
    const node = ensureFactionCommandNode({
      campaignId: CAMPAIGN_ID,
      factionId: "faction-wardens",
      standingOrders: [],
    });

    expect(proposeFactionOperation({
      campaignId: CAMPAIGN_ID,
      factionId: "faction-wardens",
      commandNodeId: node.id,
      operationKind: "patrol_shift",
      summary: "Move a patrol without a report.",
      resourceCosts: { patrols: 1 },
    })).toMatchObject({
      status: "blocked",
      reason: "missing_report_or_standing_order",
    });

    const report = createFactionReport({
      campaignId: CAMPAIGN_ID,
      factionId: "faction-wardens",
      commandNodeId: node.id,
      route: "report_message",
      summary: "A runner reports crowd pressure near the depot.",
      sourceLocationId: "loc-depot",
      hiddenCauseTerms: ["PRIVATE COMMAND CAUSE", "Commander Ilyra"],
    });
    expect(proposeFactionOperation({
      campaignId: CAMPAIGN_ID,
      factionId: "faction-wardens",
      commandNodeId: node.id,
      operationKind: "patrol_shift",
      summary: "Move a patrol without enough resource.",
      requiredReportIds: [report.id],
      resourceCosts: { patrols: 1 },
    })).toMatchObject({
      status: "blocked",
      reason: "insufficient_resource:patrols",
    });

    ensureFactionResource({
      campaignId: CAMPAIGN_ID,
      factionId: "faction-wardens",
      resourceKey: "patrols",
      quantity: 2,
    });
    const pass = await runCommandNodeDecisionPass({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      commandNodeIds: [node.id],
      decideCommandNode: () => ({
        action: "propose_operation",
        operationKind: "patrol_shift",
        summary: "Send a patrol to the depot gate.",
        requiredReportIds: [report.id],
        resourceCosts: { patrols: 1 },
        targetLocationId: "loc-depot",
        commit: true,
        surfaceLocationRef: "loc-depot",
        surfaceSummary: "A visible warden patrol starts checking depot gate permits.",
      }),
    });
    const frame = await buildSceneFrame({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerAction: "I watch the depot gate.",
      runActorExposureCatchup: false,
    });
    const modelFacing = buildModelFacingScenePacket(frame);
    const narratorPacket = buildNarratorPacket({
      frame,
      canonicalTurnPacket: canonicalPacketFromFrame(frame),
      forbiddenPrivateTerms: ["PRIVATE COMMAND CAUSE", "Commander Ilyra"],
    });
    const formattedNarrator = formatNarratorPacketForPrompt(narratorPacket);
    const operation = pass.results[0];
    const localSignals = getDb().select().from(locationRecentEvents).all();
    const evidence = {
      scenario: "faction-command-path",
      commandNodeId: node.id,
      reportRoute: report.route,
      proposalStatus: operation?.proposal?.status,
      commitStatus: operation?.commit?.status,
      reportStatus: getDb()
        .select()
        .from(factionReports)
        .where(eq(factionReports.id, report.id))
        .get()?.status,
      resourceRows: getDb().select().from(factionResources).all().map((resource) => ({
        key: resource.resourceKey,
        quantity: resource.quantity,
      })),
      resourceLedgerDeltas: getDb().select().from(factionResourceLedger).all().map((row) =>
        row.delta
      ),
      surfaceSignalIds: localSignals.map((event) => event.id),
      surfaceSignalVisible: frame.recentEvents.some((event) =>
        event.summary.includes("depot gate permits"),
      ),
    };

    expect(operation?.proposal).toMatchObject({ status: "proposed" });
    expect(operation?.commit).toMatchObject({ status: "committed" });
    expect(evidence.reportStatus).toBe("consumed");
    expect(evidence.resourceRows).toEqual([{ key: "patrols", quantity: 1 }]);
    expect(evidence.resourceLedgerDeltas).toEqual([-1]);
    expect(frame.recentEvents.map((event) => event.summary)).toContain(
      "A visible warden patrol starts checking depot gate permits.",
    );
    expect(JSON.stringify(modelFacing.view)).not.toContain("PRIVATE COMMAND CAUSE");
    expect(JSON.stringify(modelFacing.view)).not.toContain("Commander Ilyra");
    expect(formattedNarrator).not.toContain("PRIVATE COMMAND CAUSE");
    expect(formattedNarrator).not.toContain("Commander Ilyra");
    expect(JSON.stringify(evidence)).not.toContain("PRIVATE COMMAND CAUSE");
    writeEvidence(FACTION_EVIDENCE, evidence);
  });
});
