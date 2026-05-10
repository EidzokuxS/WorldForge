import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  locationRecentEvents,
  locations,
  players,
  simulationProposals,
} from "../../db/schema.js";
import { assembleAuthoritativeScene } from "../scene-assembly.js";
import { buildSceneFrame } from "../scene-frame.js";
import {
  buildNarratorPacket,
  formatNarratorPacketForPrompt,
  type CanonicalTurnPacket,
} from "../narrator-packet.js";
import {
  buildPlayerFacingPacketFromNarratorPacket,
  formatPlayerFacingPacketForPrompt,
} from "../player-facing-packet.js";
import { ensureWorldClock, readWorldClock } from "../living-world-authority.js";
import { advanceWorldThread, createWorldThread } from "../world-thread.js";

const CAMPAIGN_ID = "proposal-truth-boundary-campaign";
const PLAYER_ID = "player-proposal-boundary";
const LOCATION_ID = "loc-boundary-market";

const pendingSentinel = "PENDING PROPOSAL SENTINEL: the courier sees a hidden vault.";
const staleSentinel = "STALE PROPOSAL SENTINEL: the old alley route is definitely open.";
const supersededSentinel = "SUPERSEDED PROPOSAL SENTINEL: the vanished porter is present.";
const actorRetrySentinel = "ACTOR RETRY SENTINEL: the guard secretly approves passage.";
const committedSurfaceSignal = "A stallkeeper mentions fresh wax tracks near the east awning.";

let tempDir = "";
let previousCampaignRoot: string | undefined;

function seedCampaign() {
  const timestamp = Date.now();
  const campaignsRoot = path.join(tempDir, "campaigns-root");
  const campaignDir = path.join(campaignsRoot, CAMPAIGN_ID);
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir, "config.json"),
    JSON.stringify({
      name: "Proposal Truth Boundary",
      premise: "A packet firewall test campaign.",
      generationComplete: true,
      currentTick: 10,
      createdAt: timestamp,
      updatedAt: timestamp,
    }, null, 2),
    "utf-8",
  );
  process.env.GSD_CAMPAIGNS_ROOT = campaignsRoot;
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Proposal Truth Boundary",
    premise: "A packet firewall test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  getDb().insert(locations).values({
    id: LOCATION_ID,
    campaignId: CAMPAIGN_ID,
    name: "Boundary Market",
    description: "A market where proposal truth boundaries are tested.",
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
  getDb().insert(players).values({
    id: PLAYER_ID,
    campaignId: CAMPAIGN_ID,
    name: "Mira",
    race: "Human",
    gender: "",
    age: "",
    appearance: "",
    hp: 5,
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    equippedItems: "[]",
    currentLocationId: LOCATION_ID,
    currentSceneLocationId: null,
  }).run();
  ensureWorldClock({
    campaignId: CAMPAIGN_ID,
    currentTick: 10,
    worldTimeMinutes: 10,
  });
}

function insertProposal(input: {
  id: string;
  status: typeof simulationProposals.$inferSelect.status;
  disposition: typeof simulationProposals.$inferSelect.proposalDisposition;
  sentinel: string;
}) {
  const timestamp = Date.now();
  const row: typeof simulationProposals.$inferInsert = {
    id: input.id,
    campaignId: CAMPAIGN_ID,
    jobId: null,
    proposalType: "truth_boundary_fixture",
    idempotencyKey: null,
    status: input.status,
    proposalDisposition: input.disposition,
    dispositionReason: input.sentinel,
    baseWorldVersion: 0,
    proposedWorldVersion: null,
    committedWorldVersion: input.status === "committed" ? 1 : null,
    dueAtWorldTimeMinutes: 10,
    expiryPolicy: "reject_when_expired",
    priority: 0,
    intendedTools: JSON.stringify([{ name: "log_event", args: { text: input.sentinel } }]),
    supersededByProposalId: null,
    lifecycleMetadata: JSON.stringify({ sentinel: input.sentinel }),
    sourceEntityType: "system",
    sourceEntityId: "truth-boundary",
    payload: JSON.stringify({
      summary: input.sentinel,
      data: { meaningfulOffscreenCommit: true },
    }),
    toolResultId: null,
    rejectionReason: input.status === "rejected" ? input.sentinel : null,
    createdWorldTimeMinutes: 10,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  getDb().insert(simulationProposals).values(row).run();
}

function createCommittedSurfaceSignal() {
  const thread = createWorldThread({
    campaignId: CAMPAIGN_ID,
    name: "Wax track rumor",
    stage: "surface_signal",
    currentLocationId: LOCATION_ID,
    hiddenCauseTerms: ["secret patron"],
    sourceEventIds: ["event-wax-source"],
    metadata: {
      sourceProposalId: "proposal-committed-surface",
      surfacePolicy: "rumor",
    },
  });
  const result = advanceWorldThread({
    campaignId: CAMPAIGN_ID,
    threadId: thread.id,
    baseWorldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
    sourceEventIds: ["event-wax-source"],
    surface: {
      route: "rumor",
      locationRef: LOCATION_ID,
      visibility: "signal_only",
      summary: committedSurfaceSignal,
    },
  });
  expect(result.status).toBe("advanced");
  insertProposal({
    id: "proposal-committed-surface",
    status: "committed",
    disposition: "committed",
    sentinel: committedSurfaceSignal,
  });
}

function canonicalPacket(): CanonicalTurnPacket {
  return {
    campaignId: CAMPAIGN_ID,
    tick: 11,
    playerAction: "I wait and listen.",
    oracleOutcome: null,
    narratorFacts: {
      anchorEventId: "anchor-listen",
      eventIds: ["anchor-listen"],
      responseIds: [],
      actionIds: [],
      toolResultRefs: [],
    },
    anchorEvent: {
      id: "anchor-listen",
      actorId: PLAYER_ID,
      kind: "player_action",
      summary: "Mira waits and listens.",
      perceivableByPlayer: true,
    },
    events: [
      {
        id: "anchor-listen",
        actorId: PLAYER_ID,
        kind: "player_action",
        summary: "Mira waits and listens.",
        perceivableByPlayer: true,
      },
    ],
    responses: [],
    effects: [],
    actionResults: [],
    guardrails: ["Narrate only source-backed committed signals."],
    controlReturnReason: "Return control after the local signal.",
  };
}

describe("proposal truth boundary", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-proposal-boundary-"));
    previousCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    if (previousCampaignRoot == null) {
      delete process.env.GSD_CAMPAIGNS_ROOT;
    } else {
      process.env.GSD_CAMPAIGNS_ROOT = previousCampaignRoot;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("keeps non-committed proposal text out of scene, narrator, and player-facing packets", async () => {
    insertProposal({
      id: "proposal-pending",
      status: "pending",
      disposition: "pending",
      sentinel: pendingSentinel,
    });
    insertProposal({
      id: "proposal-stale",
      status: "rejected",
      disposition: "expired_stale_version",
      sentinel: staleSentinel,
    });
    insertProposal({
      id: "proposal-superseded",
      status: "superseded",
      disposition: "superseded_by_new_event",
      sentinel: supersededSentinel,
    });
    insertProposal({
      id: "proposal-actor-retry",
      status: "rejected",
      disposition: "needs_actor_retry",
      sentinel: actorRetrySentinel,
    });
    createCommittedSurfaceSignal();

    const sceneAssembly = assembleAuthoritativeScene({
      campaignId: CAMPAIGN_ID,
      currentLocationId: LOCATION_ID,
      pendingEventTicks: [],
      toolCalls: [],
      playerLabel: "Mira",
    });
    const sceneFrame = await buildSceneFrame({
      campaignId: CAMPAIGN_ID,
      playerActorId: PLAYER_ID,
      currentLocationId: LOCATION_ID,
      playerAction: "I wait and listen.",
      tick: 11,
    });
    const narratorPacket = buildNarratorPacket({
      frame: sceneFrame,
      canonicalTurnPacket: canonicalPacket(),
      forbiddenPrivateTerms: ["secret patron"],
    });
    const playerPacket = buildPlayerFacingPacketFromNarratorPacket(narratorPacket);
    const formattedNarratorPacket = formatNarratorPacketForPrompt(narratorPacket);
    const formattedPlayerPacket = formatPlayerFacingPacketForPrompt(playerPacket);
    const packetText = [
      JSON.stringify(sceneAssembly),
      JSON.stringify(sceneFrame),
      JSON.stringify(narratorPacket),
      JSON.stringify(playerPacket),
      formattedNarratorPacket,
      formattedPlayerPacket,
    ].join("\n");
    const visibleSurfaceText = [
      ...sceneAssembly.recentContext.map((entry) => entry.summary),
      ...sceneAssembly.playerPerceivableConsequences,
      ...sceneFrame.recentEvents.map((event) => event.summary),
      ...narratorPacket.hintSignals,
      formattedNarratorPacket,
      ...playerPacket.hintSignals,
      formattedPlayerPacket,
    ].join("\n");

    for (const sentinel of [
      pendingSentinel,
      staleSentinel,
      supersededSentinel,
      actorRetrySentinel,
    ]) {
      expect(packetText).not.toContain(sentinel);
    }
    expect(sceneAssembly.recentContext).toEqual([
      expect.objectContaining({
        summary: committedSurfaceSignal,
        source: "world_thread_signal",
      }),
    ]);
    expect(sceneAssembly.playerPerceivableConsequences).toContain(committedSurfaceSignal);
    expect(sceneFrame.recentEvents).toEqual([
      expect.objectContaining({
        summary: committedSurfaceSignal,
        source: "world_thread_signal",
        perceivableByPlayer: true,
      }),
    ]);
    expect(narratorPacket.hintSignals).toContain(committedSurfaceSignal);
    expect(formattedNarratorPacket).toContain(committedSurfaceSignal);
    expect(playerPacket.hintSignals).toContain(committedSurfaceSignal);
    expect(playerPacket.sourceRefs).toContainEqual(
      expect.objectContaining({
        id: getDb().select().from(locationRecentEvents).all()[0]?.id,
        kind: "world_thread_signal",
      }),
    );
    expect(playerPacket.sourceRefs).not.toContainEqual(
      expect.objectContaining({ id: "proposal-committed-surface" }),
    );
    expect(playerPacket.sourceRefs.some((source) => source.id.startsWith("proposal-"))).toBe(false);
    expect(formattedPlayerPacket).toContain("world_thread_signal");
    expect(formattedPlayerPacket).toContain(committedSurfaceSignal);
    expect(visibleSurfaceText).not.toContain("secret patron");
  });
});
