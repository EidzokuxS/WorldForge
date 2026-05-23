import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { connectDb, closeDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { campaigns, quickActionOffers } from "../../db/schema.js";
import { and, eq } from "drizzle-orm";
import {
  persistQuickActionOffer,
  QuickActionOfferError,
  resolveSelectedQuickActionOffer,
} from "../quick-action-offers.js";

let tempDir = "";

function seedCampaign() {
  getDb().insert(campaigns).values({
    id: "campaign-quick-actions",
    name: "Quick Actions",
    premise: "Test campaign.",
    createdAt: 1,
    updatedAt: 1,
  }).run();
  getDb().insert(campaigns).values({
    id: "campaign-other",
    name: "Other Quick Actions",
    premise: "Other test campaign.",
    createdAt: 1,
    updatedAt: 1,
  }).run();
}

describe("quick action offer authority", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-quick-actions-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves a selected offer to backend canonical action and consumes it", () => {
    const persisted = persistQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_1",
      tick: 10,
      baseWorldVersion: 7,
      actions: [{
        actionId: "qa_offer_1_1",
        label: "Question clerk",
        action: "Ask the clerk about the sealed corridor.",
        sourceRefs: ["current_scene"],
        sourceEvidenceDigest: "src_corridor",
      }],
    });

    expect(persisted).toBe(true);
    expect(resolveSelectedQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_1",
      actionId: "qa_offer_1_1",
      submittedAction: "Ask the clerk about the sealed corridor.",
      currentTick: 11,
      currentWorldVersion: 7,
    })).toEqual({
      offerId: "qa_offer_1",
      actionId: "qa_offer_1_1",
      label: "Question clerk",
      action: "Ask the clerk about the sealed corridor.",
      sourceEvidenceDigest: "src_corridor",
    });

    expect(() => resolveSelectedQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_1",
      actionId: "qa_offer_1_1",
      submittedAction: "Ask the clerk about the sealed corridor.",
      currentTick: 11,
      currentWorldVersion: 7,
    })).toThrow(QuickActionOfferError);
  });

  it("rejects forged, mismatched, and expired selected quick actions", () => {
    persistQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_2",
      tick: 20,
      baseWorldVersion: 0,
      actions: [{
        actionId: "qa_offer_2_1",
        label: "Inspect seal",
        action: "Inspect the corridor seal.",
        sourceRefs: ["current_scene"],
        sourceEvidenceDigest: "src_seal",
      }],
    });

    expect(() => resolveSelectedQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_2",
      actionId: "qa_offer_2_9",
      submittedAction: "Inspect the corridor seal.",
      currentTick: 20,
      currentWorldVersion: 0,
    })).toThrowError(/no longer available/i);

    expect(() => resolveSelectedQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_2",
      actionId: "qa_offer_2_1",
      submittedAction: "Open the sealed corridor.",
      currentTick: 20,
      currentWorldVersion: 0,
    })).toThrowError(/does not match/i);

    expect(() => resolveSelectedQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_2",
      actionId: "qa_offer_2_1",
      submittedAction: "Inspect the corridor seal.",
      currentTick: 22,
      currentWorldVersion: 0,
    })).toThrowError(/expired/i);
  });

  it("consumes only the campaign and offer scoped row when action ids collide", () => {
    persistQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_a",
      tick: 3,
      baseWorldVersion: 2,
      actions: [{
        actionId: "qa_shared_1",
        label: "Ask here",
        action: "Ask the local clerk.",
        sourceRefs: ["current_scene"],
        sourceEvidenceDigest: "src_local",
      }],
    });
    persistQuickActionOffer({
      campaignId: "campaign-other",
      offerId: "qa_offer_b",
      tick: 3,
      baseWorldVersion: 2,
      actions: [{
        actionId: "qa_shared_1",
        label: "Ask there",
        action: "Ask the other clerk.",
        sourceRefs: ["current_scene"],
        sourceEvidenceDigest: "src_other",
      }],
    });

    resolveSelectedQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_a",
      actionId: "qa_shared_1",
      submittedAction: "Ask the local clerk.",
      currentTick: 3,
      currentWorldVersion: 2,
    });

    const consumed = getDb()
      .select({ consumedAt: quickActionOffers.consumedAt })
      .from(quickActionOffers)
      .where(and(
        eq(quickActionOffers.campaignId, "campaign-quick-actions"),
        eq(quickActionOffers.offerId, "qa_offer_a"),
        eq(quickActionOffers.actionId, "qa_shared_1"),
      ))
      .get();
    const untouched = getDb()
      .select({ consumedAt: quickActionOffers.consumedAt })
      .from(quickActionOffers)
      .where(and(
        eq(quickActionOffers.campaignId, "campaign-other"),
        eq(quickActionOffers.offerId, "qa_offer_b"),
        eq(quickActionOffers.actionId, "qa_shared_1"),
      ))
      .get();

    expect(consumed?.consumedAt).toEqual(expect.any(Number));
    expect(untouched?.consumedAt).toBeNull();
  });

  it("rejects actions offered against a stale base world version", () => {
    persistQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_stale",
      tick: 5,
      baseWorldVersion: 3,
      actions: [{
        actionId: "qa_offer_stale_1",
        label: "Inspect",
        action: "Inspect the old trace.",
        sourceRefs: ["current_scene"],
        sourceEvidenceDigest: "src_stale",
      }],
    });

    expect(() => resolveSelectedQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_stale",
      actionId: "qa_offer_stale_1",
      submittedAction: "Inspect the old trace.",
      currentTick: 5,
      currentWorldVersion: 4,
    })).toThrowError(/older world state/i);
  });

  it("fails closed when an offer has no version authority", () => {
    const persisted = persistQuickActionOffer({
      campaignId: "campaign-quick-actions",
      offerId: "qa_offer_unversioned",
      tick: 5,
      baseWorldVersion: null as unknown as number,
      actions: [{
        actionId: "qa_offer_unversioned_1",
        label: "Inspect",
        action: "Inspect the trace.",
        sourceRefs: ["current_scene"],
        sourceEvidenceDigest: "src_unversioned",
      }],
    });

    expect(persisted).toBe(false);
    expect(getDb()
      .select()
      .from(quickActionOffers)
      .where(and(
        eq(quickActionOffers.campaignId, "campaign-quick-actions"),
        eq(quickActionOffers.offerId, "qa_offer_unversioned"),
      ))
      .all()).toEqual([]);
  });
});
