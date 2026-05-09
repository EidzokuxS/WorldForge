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
  worldThreadEvents,
} from "../../db/schema.js";
import {
  advanceWorldThread,
  createWorldThread,
} from "../world-thread.js";
import { resolveDueWorldThreadWorkForScope } from "../world-thread-runner.js";
import { buildSceneFrame } from "../scene-frame.js";
import {
  buildNarratorPacket,
  type CanonicalTurnPacket,
} from "../narrator-packet.js";
import { buildPlayerFacingPacketFromNarratorPacket } from "../player-facing-packet.js";
import { ensureWorldClock, readWorldClock } from "../living-world-authority.js";

const CAMPAIGN_ID = "world-thread-test";
const PLAYER_ID = "player-world-thread";
const LOCATION_ID = "loc-pier";

let tempDir = "";

function seedWorld() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "World Thread Test",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  getDb().insert(locations).values({
    id: LOCATION_ID,
    campaignId: CAMPAIGN_ID,
    name: "Lantern Pier",
    description: "A pier where distant pressure can become visible.",
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
  ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 0, worldTimeMinutes: 0 });
}

function canonicalPacket(): CanonicalTurnPacket {
  return {
    campaignId: CAMPAIGN_ID,
    tick: 1,
    playerAction: "I wait at the pier.",
    oracleOutcome: null,
    narratorFacts: {
      anchorEventId: "anchor-wait",
      eventIds: ["anchor-wait"],
      responseIds: [],
      actionIds: [],
      toolResultRefs: [],
    },
    anchorEvent: {
      id: "anchor-wait",
      actorId: PLAYER_ID,
      kind: "player_action",
      summary: "Mira waits at the pier.",
      perceivableByPlayer: true,
    },
    events: [
      {
        id: "anchor-wait",
        actorId: PLAYER_ID,
        kind: "player_action",
        summary: "Mira waits at the pier.",
        perceivableByPlayer: true,
      },
    ],
    responses: [],
    effects: [],
    actionResults: [],
    guardrails: ["Narrate only committed player-perceivable packet facts."],
    controlReturnReason: "Return control after local pressure is surfaced.",
  };
}

describe("world threads", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-world-thread-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedWorld();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("refuses to create durable world threads without provenance", () => {
    expect(() =>
      createWorldThread({
        campaignId: CAMPAIGN_ID,
        name: "Unbacked pressure",
        stage: "rumored",
      }),
    ).toThrow(/without provenance/);
  });

  it("blocks hidden-cause leakage and surfaces safe local thread signals", () => {
    const thread = createWorldThread({
      campaignId: CAMPAIGN_ID,
      name: "Canal Investigation",
      stage: "searching",
      visibility: "signal_only",
      pressure: 2,
      hiddenCause: "The sealed ledger names the real patron.",
      hiddenCauseTerms: ["sealed ledger", "real patron"],
      currentLocationId: LOCATION_ID,
      sourceEventIds: ["event-ledger-glimpse"],
    });

    expect(() =>
      advanceWorldThread({
        campaignId: CAMPAIGN_ID,
        threadId: thread.id,
        baseWorldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
        surface: {
          route: "rumor",
          locationRef: LOCATION_ID,
          summary: "Dockhands whisper that the sealed ledger names the real patron.",
        },
      }),
    ).toThrow(/hidden cause term/);

    const result = advanceWorldThread({
      campaignId: CAMPAIGN_ID,
      threadId: thread.id,
      baseWorldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
      nextStage: "visible_pressure",
      surface: {
        route: "sensory",
        locationRef: LOCATION_ID,
        summary: "Two dockhands lower their voices as a patrol passes the pier.",
      },
    });
    expect(result).toMatchObject({ status: "advanced" });
    expect(getDb().select().from(worldThreadEvents).all()[0]).toMatchObject({
      eventType: "surface_signal",
      surfaceRoute: "sensory",
    });
    expect(getDb().select().from(locationRecentEvents).all()[0]).toMatchObject({
      threadId: thread.id,
      sourceEventId: result.status === "advanced" ? result.event.id : "",
      eventType: "world_thread_signal",
      visibility: "local_signal",
    });
  });

  it("attaches due thread signals to the scene and player-facing packet without leaking hidden causes", async () => {
    createWorldThread({
      campaignId: CAMPAIGN_ID,
      name: "Tourist Pressure",
      stage: "distant movement",
      visibility: "signal_only",
      pressure: 1,
      hiddenCause: "A private council has marked Mira's route.",
      hiddenCauseTerms: ["private council", "marked Mira"],
      currentLocationId: LOCATION_ID,
      nextDueWorldTimeMinutes: 0,
      sourceEventIds: ["event-council-sighting"],
      surfaceRoutes: [
        {
          id: "route-pier-bells",
          route: "sensory",
          summary: "Bells across the pier change rhythm while nobody addresses Mira directly.",
          locationId: LOCATION_ID,
          dueWorldTimeMinutes: 0,
          sourceEventIds: ["event-bell-pattern"],
        },
      ],
    });

    const due = resolveDueWorldThreadWorkForScope({
      campaignId: CAMPAIGN_ID,
      playerLocationId: LOCATION_ID,
    });
    expect(due.executed).toHaveLength(1);
    expect(due.deferred).toHaveLength(0);

    const signal = getDb()
      .select()
      .from(locationRecentEvents)
      .all()
      .find((event) => event.threadId);
    expect(signal).toBeTruthy();

    const frame = await buildSceneFrame({
      campaignId: CAMPAIGN_ID,
      playerActorId: PLAYER_ID,
      playerAction: "I wait at the pier.",
      currentLocationId: LOCATION_ID,
      tick: 1,
      roster: {
        active: [
          {
            id: PLAYER_ID,
            type: "player",
            label: "Mira",
            locationId: LOCATION_ID,
            sceneScopeId: null,
            awareness: "clear",
          },
        ],
        support: [],
        background: [],
      },
      perception: {
        playerAwarenessHints: [],
        actorAwareness: {},
        forbiddenActorIds: [],
        forbiddenActorLabels: [],
      },
      recentEvents: [
        {
          id: signal!.id,
          tick: signal!.tick,
          summary: signal!.summary,
          source: "world_thread_signal",
          actorIds: [],
          perceivableByPlayer: true,
        },
      ],
      targetCandidates: [],
      movementCandidates: [],
      deferredHooks: [],
      allowedTools: ["log_event"],
    });
    expect(frame.recentEvents[0]).toMatchObject({
      source: "world_thread_signal",
      perceivableByPlayer: true,
    });

    const narratorPacket = buildNarratorPacket({
      frame,
      canonicalTurnPacket: canonicalPacket(),
      forbiddenPrivateTerms: ["private council", "marked Mira"],
    });
    const playerPacket = buildPlayerFacingPacketFromNarratorPacket(narratorPacket);
    expect(playerPacket.hintSignals).toContain(
      "Bells across the pier change rhythm while nobody addresses Mira directly.",
    );
    expect(playerPacket.sourceRefs).toContainEqual(
      expect.objectContaining({ kind: "world_thread_signal" }),
    );
    expect(playerPacket.hintSignals.join("\n")).not.toContain("private council");
  });
});
