import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  authorityTraces,
  campaigns,
  chronicle,
  worldClocks,
} from "../../db/schema.js";
import type { ToolExecutionContext } from "../tool-execution-context.js";
import {
  applySuccessfulToolObservationToExecutionContext,
} from "../tool-execution-context.js";
import { executeToolCall } from "../tool-executor.js";

const CAMPAIGN_ID = "tool-authority-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Tool Authority",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

function createAuthorityContext(baseWorldVersion: number): ToolExecutionContext {
  return {
    scope: "player_turn",
    subjectActorId: "player-1",
    subjectActorRefs: new Set(["player-1", "player"]),
    authority: {
      baseWorldVersion,
      sourceEntity: { type: "player", id: "player-1" },
      elapsedWorldTimeMinutes: 1,
    },
    currentLocationId: null,
    currentSceneScopeId: null,
    legalLocationRefs: new Set(),
    legalActorRefs: new Set(),
    legalItemRefs: new Set(),
    legalFactionRefs: new Set(),
    currentLocationRefs: new Set(),
    currentSceneRefs: new Set(),
    legalMovementRefs: new Set(),
  };
}

describe("executeToolCall authority bridge", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-tool-authority-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("commits a state-bearing tool result with authority metadata and advances context base", async () => {
    const context = createAuthorityContext(0);

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "The bell rang once." },
      3,
      undefined,
      context,
    );

    expect(result.success).toBe(true);
    expect(result.authority).toMatchObject({
      campaignId: CAMPAIGN_ID,
      baseWorldVersion: 0,
      resultWorldVersion: 1,
      worldTimeMinutes: 4,
      stateDeltaRefs: [expect.any(String)],
    });
    expect(
      getDb()
        .select()
        .from(chronicle)
        .where(eq(chronicle.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(1);
    expect(
      getDb()
        .select()
        .from(authorityTraces)
        .where(eq(authorityTraces.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(1);

    applySuccessfulToolObservationToExecutionContext({
      toolName: "add_chronicle_entry",
      result,
      context,
    });
    expect(context.authority?.baseWorldVersion).toBe(1);
  });

  it("rejects stale authoritative tools before the handler mutates state", async () => {
    await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "The first entry." },
      3,
      undefined,
      createAuthorityContext(0),
    );

    const staleResult = await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "This must not be inserted." },
      4,
      undefined,
      createAuthorityContext(0),
    );

    expect(staleResult.success).toBe(false);
    expect(staleResult.status).toBe("failure");
    expect(staleResult.authority).toMatchObject({
      baseWorldVersion: 0,
      failureReason: expect.stringContaining("Stale world version"),
    });
    expect(
      getDb()
        .select()
        .from(chronicle)
        .where(eq(chronicle.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(1);
    expect(
      getDb()
        .select()
        .from(authorityTraces)
        .where(eq(authorityTraces.campaignId, CAMPAIGN_ID))
        .all(),
    ).toHaveLength(1);
    expect(
      getDb()
        .select()
        .from(worldClocks)
        .where(eq(worldClocks.campaignId, CAMPAIGN_ID))
      .get(),
    ).toMatchObject({ worldVersion: 1 });
  });

  it("lets the GM advance in-world time without backend text parsing", async () => {
    const context = createAuthorityContext(0);

    const result = await executeToolCall(
      CAMPAIGN_ID,
      "advance_time",
      {
        minutes: 60,
        reason: "The player explicitly spends an hour watching canal traffic.",
      },
      0,
      undefined,
      context,
    );

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      minutes: 60,
      clockAdvanced: true,
    });
    expect(result.authority).toMatchObject({
      campaignId: CAMPAIGN_ID,
      baseWorldVersion: 0,
      resultWorldVersion: 1,
      worldTimeMinutes: 60,
      elapsedWorldTimeMinutes: 60,
      stateDeltaRefs: expect.arrayContaining(["world_time", "elapsed:60"]),
    });

    applySuccessfulToolObservationToExecutionContext({
      toolName: "advance_time",
      result,
      context,
    });
    expect(context.authority?.baseWorldVersion).toBe(1);
    expect(context.authority?.elapsedWorldTimeMinutes).toBe(0);

    const followupResult = await executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "The hour matters later." },
      0,
      undefined,
      context,
    );

    expect(followupResult.success).toBe(true);
    expect(followupResult.authority).toMatchObject({
      baseWorldVersion: 1,
      worldTimeMinutes: 60,
      elapsedWorldTimeMinutes: 0,
    });
  });
});
