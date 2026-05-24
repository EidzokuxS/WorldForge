import { describe, expect, it } from "vitest";
import {
  GAMEPLAY_STATE_LANE_VALUES,
  GAMEPLAY_STATE_OWNER_REGISTRY,
  ISSUED_REF_SCHEMA,
  PHASE95_REQUIRED_STORE_KEYS,
  PHASE95_STORE_MANIFEST,
  TURN_AUTHORITY_STAGE_CONTRACTS,
  TURN_AUTHORITY_STAGE_VALUES,
  TURN_CLOCK_LEDGER_ENTRY_SCHEMA,
  assertPublicProjectionPayload,
  assertSelectableNarrationRefs,
  assertStateOwnerRegistry,
  assertStoreManifestCoverage,
  assertTurnAuthorityLifecycle,
  runtimeDescriptorCanonicalOwnersByEffectKind,
  type NarrationFact,
} from "../gameplay-control-plane-contract.js";

describe("Phase 95 gameplay control-plane contracts", () => {
  it("locks the turn authority lifecycle in the Oracle-reviewed order", () => {
    expect(assertTurnAuthorityLifecycle(TURN_AUTHORITY_STAGE_VALUES)).toEqual([
      "intent_created",
      "lease_acquired",
      "snapshot_taken",
      "effects_staged",
      "receipts_accepted",
      "canonical_state_committed",
      "settled_packet_persisted",
      "narration_accepted",
      "public_projection_committed",
      "turn_finalized",
    ]);

    expect(TURN_AUTHORITY_STAGE_CONTRACTS.map((entry) => entry.stage))
      .toEqual([...TURN_AUTHORITY_STAGE_VALUES]);
    expect(() => assertTurnAuthorityLifecycle([
      "intent_created",
      "snapshot_taken",
      "lease_acquired",
    ])).toThrow(/include every required stage|out of order/i);
  });

  it("fails closed when a required store is missing from the manifest", () => {
    const manifest = assertStoreManifestCoverage();
    expect(manifest.map((entry) => entry.store).sort())
      .toEqual([...PHASE95_REQUIRED_STORE_KEYS].sort());
    expect(PHASE95_STORE_MANIFEST.find((entry) => entry.store === "vectors:episodic_events"))
      .toMatchObject({
        authorityLevel: "derived",
        clonePolicy: "rebuild",
        rollbackPolicy: "rebuild",
        sourceCampaignIdPolicy: "reject_if_present",
      });

    expect(() => assertStoreManifestCoverage(
      PHASE95_STORE_MANIFEST.filter((entry) => entry.store !== "sqlite:quick_action_offers"),
    )).toThrow(/sqlite:quick_action_offers/i);
  });

  it("keeps one registry entry per gameplay state lane", () => {
    const registry = assertStateOwnerRegistry();
    expect(registry.map((entry) => entry.lane).sort())
      .toEqual([...GAMEPLAY_STATE_LANE_VALUES].sort());
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "clock_delta"))
      .toMatchObject({
        owner: "turn_clock_ledger",
        status: "live",
        receiptKind: "clock_receipt",
      });
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "quick_action_offer"))
      .toMatchObject({
        owner: "quick_action_offer_service",
        status: "live",
        receiptKind: "quick_action_offer",
      });

    expect(() => assertStateOwnerRegistry([
      ...GAMEPLAY_STATE_OWNER_REGISTRY,
      GAMEPLAY_STATE_OWNER_REGISTRY[0],
    ])).toThrow(/duplicate state owner lane/i);
  });

  it("makes current descriptor ambiguities visible instead of hiding them", () => {
    const owners = runtimeDescriptorCanonicalOwnersByEffectKind();
    expect(owners.movement).toEqual(["move_actor"]);
    expect(owners.location_revealed).toEqual(["reveal_location"]);
    expect(owners.minor_poi_created).toEqual(["create_minor_poi"]);
    expect(owners.quick_action_offer).toEqual(["offer_quick_actions"]);

    // Entity tags still have multiple tool verbs. The Phase 95 contract keeps
    // the write owner as an explicit service until runtime routing is unified.
    expect(owners.entity_tag).toEqual(["add_tag", "remove_tag"]);
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "entity_tag"))
      .toMatchObject({ owner: "entity_tag_service", status: "contract_only" });
  });

  it("rejects backend refs at the public projection boundary", () => {
    expect(() => assertPublicProjectionPayload({
      surface: "sse",
      payload: {
        type: "turn_resolution",
        text: "The clerk nods.",
        quickActions: [{ handle: "qa_1", label: "Ask about the ledger" }],
      },
    })).not.toThrow();

    expect(() => assertPublicProjectionPayload({
      surface: "world",
      payload: { visibleActor: "actor:internal-1" },
    })).toThrow(/backend ref/i);

    expect(() => assertPublicProjectionPayload({
      surface: "history",
      payload: { sagaId: "turn-saga:abc" },
    })).toThrow(/backend ref/i);
  });

  it("validates issued handles without accepting raw backend refs as handles", () => {
    expect(ISSUED_REF_SCHEMA.parse({
      handle: "qa_01J_turn_1",
      namespace: "quick_action_capability",
      lifetime: "durable_until_consumed",
      visibility: "player",
      campaignId: "campaign-1",
      playerId: "player-1",
      turnId: "turn-1",
      baseWorldVersion: 4,
      expiresAtTurn: 5,
      consumable: true,
    })).toMatchObject({ namespace: "quick_action_capability" });

    expect(() => assertPublicProjectionPayload({
      surface: "frontend_state",
      payload: { handle: "tool-result:raw" },
    })).toThrow(/backend ref/i);
  });

  it("keeps zero-time status turns explicit in the clock ledger contract", () => {
    expect(TURN_CLOCK_LEDGER_ENTRY_SCHEMA.parse({
      clockReceiptId: "clock-1",
      campaignId: "campaign-1",
      turnId: "turn-1",
      uiTurnOrdinal: 60,
      baseWorldVersion: 12,
      deltaMinutes: 0,
      reasonKind: "zero_time_status",
      sourceReceiptRef: null,
      resultWorldTimeMinutes: 480,
      resultWorldVersion: 12,
    })).toMatchObject({ deltaMinutes: 0, reasonKind: "zero_time_status" });

    expect(() => TURN_CLOCK_LEDGER_ENTRY_SCHEMA.parse({
      clockReceiptId: "clock-2",
      campaignId: "campaign-1",
      turnId: "turn-2",
      uiTurnOrdinal: 61,
      baseWorldVersion: 12,
      deltaMinutes: -1,
      reasonKind: "wait",
      sourceReceiptRef: "receipt-1",
      resultWorldTimeMinutes: 479,
      resultWorldVersion: 13,
    })).toThrow();
  });

  it("allows final narration to cite only selectable facts and evidence", () => {
    const facts: NarrationFact[] = [
      { ref: "f1", kind: "selectable_fact", text: "The seal is cracked." },
      { ref: "e1", kind: "citable_evidence", text: "A receipt records the crack." },
      { ref: "s1", kind: "support_context", text: "Mention the office tone." },
      { ref: "p1", kind: "private_context", text: "Hidden patron motive." },
    ];

    expect(() => assertSelectableNarrationRefs({
      facts,
      selectedRefs: ["f1", "e1"],
    })).not.toThrow();
    expect(() => assertSelectableNarrationRefs({
      facts,
      selectedRefs: ["s1"],
    })).toThrow(/non-citable/i);
    expect(() => assertSelectableNarrationRefs({
      facts,
      selectedRefs: ["missing"],
    })).toThrow(/unknown fact ref/i);
  });
});
