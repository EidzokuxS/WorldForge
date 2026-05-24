import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  quickActionOffers,
} from "../../db/schema.js";
import { commitAuthorityTrace } from "../living-world-authority.js";
import {
  QuickActionSelectionError,
  persistQuickActionOffer,
  resolveQuickActionSelection,
} from "../quick-action-offers.js";

const CAMPAIGN_ID = "quick-action-campaign";
const OTHER_CAMPAIGN_ID = "other-campaign";

let tempDir = "";

function seedCampaign(id = CAMPAIGN_ID): void {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id,
    name: `Campaign ${id}`,
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

describe("quick action offers", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-quick-actions-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign(CAMPAIGN_ID);
    seedCampaign(OTHER_CAMPAIGN_ID);
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists player-facing capabilities and resolves selected handles to stored action text", async () => {
    const offer = await persistQuickActionOffer({
      campaignId: CAMPAIGN_ID,
      tick: 4,
      actions: [
        {
          label: "Ask actor_hidden",
          action: "Ask actor_hidden about tool_result_7.",
        },
        { label: "Watch", action: "Watch the counter." },
        { label: "Move", action: "Step to the open desk." },
      ],
      sourceRefs: ["fact:visible-counter"],
    });

    expect(offer.actions).toHaveLength(3);
    expect(offer.actions[0]).toMatchObject({
      label: "Ask [hidden]",
      action: "Ask [hidden] about [hidden].",
    });
    expect(offer.actions[0]?.handle).toMatch(/^qac_[a-f0-9]{32}$/u);

    const resolved = await resolveQuickActionSelection({
      campaignId: CAMPAIGN_ID,
      handle: offer.actions[0]!.handle,
      currentTick: 5,
    });

    expect(resolved.action).toBe("Ask [hidden] about [hidden].");
    expect(resolved.label).toBe("Ask [hidden]");
    const stored = getDb()
      .select()
      .from(quickActionOffers)
      .where(eq(quickActionOffers.capability, offer.actions[0]!.handle))
      .get();
    expect(stored?.consumedAt).toEqual(expect.any(Number));
    expect(stored?.consumedTick).toBe(5);
  });

  it("rejects forged, cross-campaign, consumed, expired, stale, and tampered handles", async () => {
    const offer = await persistQuickActionOffer({
      campaignId: CAMPAIGN_ID,
      tick: 2,
      actions: [
        { label: "Ask", action: "Ask for details." },
        { label: "Watch", action: "Watch the door." },
        { label: "Move", action: "Move to the counter." },
      ],
    });
    const handle = offer.actions[0]!.handle;

    await expect(resolveQuickActionSelection({
      campaignId: CAMPAIGN_ID,
      handle: "not-a-capability",
      currentTick: 3,
    })).rejects.toMatchObject({ reason: "malformed" } satisfies Partial<QuickActionSelectionError>);

    await expect(resolveQuickActionSelection({
      campaignId: OTHER_CAMPAIGN_ID,
      handle,
      currentTick: 3,
    })).rejects.toMatchObject({ reason: "not_found" } satisfies Partial<QuickActionSelectionError>);

    await resolveQuickActionSelection({
      campaignId: CAMPAIGN_ID,
      handle,
      currentTick: 3,
    });
    await expect(resolveQuickActionSelection({
      campaignId: CAMPAIGN_ID,
      handle,
      currentTick: 3,
    })).rejects.toMatchObject({ reason: "consumed" } satisfies Partial<QuickActionSelectionError>);

    const expired = await persistQuickActionOffer({
      campaignId: CAMPAIGN_ID,
      tick: 4,
      actions: [
        { label: "Ask", action: "Ask for a route." },
        { label: "Wait", action: "Wait one beat." },
        { label: "Leave", action: "Leave the desk." },
      ],
    });
    await expect(resolveQuickActionSelection({
      campaignId: CAMPAIGN_ID,
      handle: expired.actions[0]!.handle,
      currentTick: 6,
    })).rejects.toMatchObject({ reason: "expired" } satisfies Partial<QuickActionSelectionError>);

    const stale = await persistQuickActionOffer({
      campaignId: CAMPAIGN_ID,
      tick: 7,
      actions: [
        { label: "Ask", action: "Ask about the stamp." },
        { label: "Watch", action: "Watch the clerk." },
        { label: "Move", action: "Move to the queue." },
      ],
    });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:bump-world",
      baseWorldVersion: 0,
      sourceEntity: { type: "system" },
      elapsedWorldTimeMinutes: 0,
      currentTick: 7,
      eventIds: [],
      stateDeltaRefs: ["test"],
    });
    await expect(resolveQuickActionSelection({
      campaignId: CAMPAIGN_ID,
      handle: stale.actions[0]!.handle,
      currentTick: 8,
    })).rejects.toMatchObject({ reason: "stale_world_version" } satisfies Partial<QuickActionSelectionError>);

    const tampered = await persistQuickActionOffer({
      campaignId: CAMPAIGN_ID,
      tick: 9,
      actions: [
        { label: "Ask", action: "Ask about the ledger." },
        { label: "Watch", action: "Watch the desk." },
        { label: "Move", action: "Move closer." },
      ],
    });
    getDb()
      .update(quickActionOffers)
      .set({ action: "Tampered action text." })
      .where(eq(quickActionOffers.capability, tampered.actions[0]!.handle))
      .run();
    await expect(resolveQuickActionSelection({
      campaignId: CAMPAIGN_ID,
      handle: tampered.actions[0]!.handle,
      currentTick: 10,
    })).rejects.toMatchObject({ reason: "digest_mismatch" } satisfies Partial<QuickActionSelectionError>);

    const corruptRefs = await persistQuickActionOffer({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      actions: [
        { label: "Ask", action: "Ask about the docket." },
        { label: "Watch", action: "Watch the queue." },
        { label: "Move", action: "Move to the archway." },
      ],
    });
    getDb()
      .update(quickActionOffers)
      .set({ sourceRefsJson: "{not-json" })
      .where(eq(quickActionOffers.capability, corruptRefs.actions[0]!.handle))
      .run();
    await expect(resolveQuickActionSelection({
      campaignId: CAMPAIGN_ID,
      handle: corruptRefs.actions[0]!.handle,
      currentTick: 10,
    })).rejects.toMatchObject({ reason: "digest_mismatch" } satisfies Partial<QuickActionSelectionError>);
  });
});
