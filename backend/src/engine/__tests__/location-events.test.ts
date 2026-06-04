import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { campaigns, locations } from "../../db/schema.js";
import {
  listRecentLocationEvents,
  listRecentLocationEventsForLocations,
  recordLocationRecentEvent,
} from "../location-events.js";

const CAMPAIGN_ID = "location-events-audience";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Location Events Audience",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

function seedLocation() {
  getDb().insert(locations).values({
    id: "loc-market",
    campaignId: CAMPAIGN_ID,
    name: "Market",
    description: "A crowded market.",
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
}

describe("location event audience filtering", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-location-events-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
    seedLocation();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("hides private events from player reads and strips backend-only cause metadata", () => {
    recordLocationRecentEvent({
      campaignId: CAMPAIGN_ID,
      locationRef: "loc-market",
      tick: 10,
      eventType: "test",
      summary: "A public deal closed in the market.",
      importance: 3,
      visibility: "player_perceivable",
      createdAt: 10,
    });
    recordLocationRecentEvent({
      campaignId: CAMPAIGN_ID,
      locationRef: "loc-market",
      tick: 11,
      eventType: "test",
      summary: "Someone felt a sealed pattern nearby.",
      importance: 4,
      visibility: "local_signal",
      knowledgeRoute: "witness_report",
      hiddenCauseTerms: ["sealed patron"],
      createdAt: 11,
    });
    recordLocationRecentEvent({
      campaignId: CAMPAIGN_ID,
      locationRef: "loc-market",
      tick: 12,
      eventType: "test",
      summary: "Renn privately identified the masked courier.",
      importance: 5,
      visibility: "hidden",
      knowledgeRoute: "actor:npc-renn",
      hiddenCauseTerms: ["masked courier"],
      createdAt: 12,
    });

    const playerEvents = listRecentLocationEvents({
      campaignId: CAMPAIGN_ID,
      locationRef: "loc-market",
      limit: 5,
      audience: { kind: "player", includeLocalSignals: true },
    });

    expect(playerEvents.map((event) => event.summary)).toEqual([
      "Someone felt a sealed pattern nearby.",
      "A public deal closed in the market.",
    ]);
    expect(playerEvents).toEqual([
      expect.objectContaining({ knowledgeRoute: null, hiddenCauseTerms: "[]" }),
      expect.objectContaining({ knowledgeRoute: null, hiddenCauseTerms: "[]" }),
    ]);
  });

  it("lets an actor read its own hidden event without exposing it to other actors", () => {
    recordLocationRecentEvent({
      campaignId: CAMPAIGN_ID,
      locationRef: "loc-market",
      tick: 12,
      eventType: "test",
      summary: "Renn privately identified the masked courier.",
      importance: 5,
      visibility: "hidden",
      knowledgeRoute: "actor:npc-renn",
      hiddenCauseTerms: ["masked courier"],
      createdAt: 12,
    });

    expect(
      listRecentLocationEvents({
        campaignId: CAMPAIGN_ID,
        locationRef: "loc-market",
        limit: 5,
        audience: { kind: "actor", actorId: "npc-mira", includePlayerPerceivable: false },
      }),
    ).toEqual([]);

    expect(
      listRecentLocationEventsForLocations({
        campaignId: CAMPAIGN_ID,
        locationIds: ["loc-market"],
        limitPerLocation: 5,
        audience: { kind: "actor", actorId: "npc-renn", includePlayerPerceivable: false },
      }),
    ).toEqual({
      "loc-market": [
        expect.objectContaining({
          summary: "Renn privately identified the masked courier.",
          knowledgeRoute: "actor:npc-renn",
          hiddenCauseTerms: "[\"masked courier\"]",
        }),
      ],
    });
  });
});
