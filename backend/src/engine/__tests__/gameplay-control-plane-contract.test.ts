import { describe, expect, it } from "vitest";
import {
  GAMEPLAY_STATE_LANE_VALUES,
  GAMEPLAY_STATE_OWNER_REGISTRY,
  GAMEPLAY_STATE_SERVICE_CONTRACTS,
  ISSUED_REF_NAMESPACE_VALUES,
  ISSUED_REF_OWNER_MATRIX,
  ISSUED_REF_SCHEMA,
  CAMPAIGN_PLAY_SQLITE_TABLES,
  CAMPAIGN_STATE_REQUIRED_STORE_KEYS,
  CAMPAIGN_STATE_STORE_MANIFEST,
  RUNTIME_EFFECT_KIND_STATE_LANES,
  TURN_AUTHORITY_STAGE_CONTRACTS,
  TURN_AUTHORITY_STAGE_VALUES,
  TURN_CLOCK_LEDGER_ENTRY_SCHEMA,
  assertIssuedRefOwnerMatrix,
  assertPublicProjectionPayload,
  assertRuntimeEffectStateOwnerParity,
  assertSelectableNarrationRefs,
  assertStateOwnerRegistry,
  assertTurnAuthorityStageContracts,
  assertStoreManifestCoverage,
  assertTurnAuthorityLifecycle,
  runtimeDescriptorCanonicalOwnersByEffectKind,
  type NarrationFact,
} from "../gameplay-control-plane-contract.js";
import { RUNTIME_TOOL_DESCRIPTORS } from "../runtime-tool-descriptors.js";

describe("gameplay control-plane contracts", () => {
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
    const stageContracts = assertTurnAuthorityStageContracts();
    for (const contract of stageContracts) {
      expect(contract.owner).toMatch(/\S/);
      expect(contract.preconditions.length).toBeGreaterThan(0);
      expect(contract.writes.length).toBeGreaterThan(0);
      expect(contract.idempotencyKey).toMatch(/\S/);
      expect(contract.acceptedReceiptRequirements.length).toBeGreaterThan(0);
      expect(contract.projectionAction).toMatch(/\S/);
      expect(contract.recoveryAction).toMatch(/\S/);
      expect(contract.replayRollbackAction).toMatch(/\S/);
      expect(contract.observabilityEvent).toMatch(/\S/);
      expect(contract.failureTransition).toMatch(/\S/);
      expect(contract.tests.length).toBeGreaterThan(0);
    }
    expect(stageContracts.find((entry) => entry.stage === "settled_packet_persisted"))
      .toMatchObject({
        owner: "turn_saga",
        writeScope: "packet",
        recoveryMode: "resume",
        projectionAction: expect.stringContaining("turn_resolution"),
      });
    expect(stageContracts.find((entry) => entry.stage === "public_projection_committed"))
      .toMatchObject({
        owner: "public_projection_builder",
        writeScope: "projection",
        recoveryMode: "rebuild",
      });
    expect(() => assertTurnAuthorityStageContracts([
      {
        ...TURN_AUTHORITY_STAGE_CONTRACTS[0]!,
        preconditions: [],
      },
      ...TURN_AUTHORITY_STAGE_CONTRACTS.slice(1),
    ])).toThrow(/intent_created.*preconditions/i);
    expect(() => assertTurnAuthorityLifecycle([
      "intent_created",
      "snapshot_taken",
      "lease_acquired",
    ])).toThrow(/include every required stage|out of order/i);
  });

  it("fails closed when a required store is missing from the manifest", () => {
    const manifest = assertStoreManifestCoverage();
    expect(manifest.map((entry) => entry.store).sort())
      .toEqual([...CAMPAIGN_STATE_REQUIRED_STORE_KEYS].sort());
    expect(CAMPAIGN_STATE_STORE_MANIFEST.find((entry) => entry.store === "vectors:episodic_events"))
      .toMatchObject({
        authorityLevel: "derived",
        clonePolicy: "rebuild",
        rollbackPolicy: "rebuild",
        restorePolicies: {
          turnRollback: "purge_rebuild",
          checkpointRestore: "exact_restore",
        },
        sourceCampaignIdPolicy: "reject_if_present",
      });
    expect(CAMPAIGN_STATE_STORE_MANIFEST.find((entry) => entry.store === "sqlite:campaigns"))
      .toMatchObject({
        rollbackPolicy: "rewrite",
        restorePolicies: {
          turnRollback: "snapshot_restore",
          checkpointRestore: "snapshot_restore",
        },
      });
    expect(CAMPAIGN_PLAY_SQLITE_TABLES).toEqual([
      "campaign_play_states",
      "campaign_play_characters",
      "campaign_play_turns",
      "campaign_play_turn_results",
      "campaign_play_runtime_events",
      "campaign_play_turn_events",
      "campaign_play_model_stages",
      "campaign_play_narrations",
      "campaign_play_narration_operations",
      "campaign_play_narration_attempts",
      "campaign_play_proper_scenes",
      "campaign_play_commands",
      "campaign_play_receipts",
      "campaign_play_events",
      "campaign_play_decisions",
      "campaign_play_commitments",
      "campaign_play_event_exposures",
      "campaign_play_route_states",
      "campaign_play_actor_conditions",
      "campaign_play_actor_possessions",
      "campaign_play_actor_obligations",
      "campaign_play_pressure_states",
      "campaign_play_actor_plans",
      "campaign_play_actor_schedules",
      "campaign_play_actor_due_sets",
      "campaign_play_actor_jobs",
      "campaign_play_actor_replan_attempts",
      "campaign_play_actor_proposals",
      "campaign_play_actor_knowledge",
      "campaign_play_observations",
    ]);
    const campaignPlayEntries = CAMPAIGN_PLAY_SQLITE_TABLES.map((table) =>
      CAMPAIGN_STATE_STORE_MANIFEST.find((entry) => entry.store === `sqlite:${table}`)
    );
    expect(campaignPlayEntries.every(Boolean)).toBe(true);
    for (const entry of campaignPlayEntries) {
      expect(entry).toMatchObject({
        clonePolicy: "purge",
        rollbackPolicy: "rewrite",
        replayPolicy: "reject",
        sourceCampaignIdPolicy: "purge",
        requiresHash: true,
        requiresRowCount: true,
        restorePolicies: {
          turnRollback: "snapshot_restore",
          checkpointRestore: "snapshot_restore",
        },
      });
    }
    expect(campaignPlayEntries.map((entry) => entry?.authorityLevel)).toEqual([
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "evidence",
      "evidence",
      "evidence",
      "evidence",
      "evidence",
      "evidence",
      "evidence",
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "authoritative",
      "derived",
      "authoritative",
      "derived",
      "authoritative",
      "authoritative",
    ]);
    const firstCampaignPlayIndex = CAMPAIGN_STATE_STORE_MANIFEST.findIndex(
      (entry) => entry.store === "sqlite:campaign_play_states",
    );
    const reorderedManifest = [...CAMPAIGN_STATE_STORE_MANIFEST];
    [reorderedManifest[firstCampaignPlayIndex], reorderedManifest[firstCampaignPlayIndex + 1]] =
      [reorderedManifest[firstCampaignPlayIndex + 1]!, reorderedManifest[firstCampaignPlayIndex]!];
    expect(() => assertStoreManifestCoverage(reorderedManifest))
      .toThrow(/foreign-key order/i);

    expect(() => assertStoreManifestCoverage(
      CAMPAIGN_STATE_STORE_MANIFEST.filter((entry) => entry.store !== "sqlite:quick_action_offers"),
    )).toThrow(/sqlite:quick_action_offers/i);
    expect(() => assertStoreManifestCoverage([
      ...CAMPAIGN_STATE_STORE_MANIFEST,
      {
        ...CAMPAIGN_STATE_STORE_MANIFEST[0]!,
        store: "json:unexpected",
      },
    ])).toThrow(/unexpected/i);
  });

  it("keeps one registry entry per gameplay state lane", () => {
    const registry = assertStateOwnerRegistry();
    expect(registry.map((entry) => entry.lane).sort())
      .toEqual([...GAMEPLAY_STATE_LANE_VALUES].sort());
    for (const entry of registry) {
      expect(entry.sourceOfTruth).toMatch(/\S/);
      expect(entry.runtimeValidators.length).toBeGreaterThan(0);
      expect(entry.receiptKind).toMatch(/\S/);
      expect(entry.acceptedReceiptKinds.length).toBeGreaterThan(0);
      expect(entry.projections.length).toBeGreaterThan(0);
      expect(entry.recoveryModes.length).toBeGreaterThan(0);
      expect(entry.tests.length).toBeGreaterThan(0);
      expect(entry.backing.refs.length).toBeGreaterThan(0);
    }
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "clock_delta"))
      .toMatchObject({
        owner: "turn_clock_ledger",
        status: "live",
        receiptKind: "clock_receipt",
        backing: { kind: "time_ledger" },
      });
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "quick_action_offer"))
      .toMatchObject({
        owner: "quick_action_offer_service",
        status: "live",
        receiptKind: "quick_action_offer",
        backing: { kind: "service_contract" },
      });
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "dialogue_outcome"))
      .toMatchObject({ backing: { kind: "terminal_receipt" } });
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "durable_world_fact"))
      .toMatchObject({ backing: { kind: "terminal_receipt" } });
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "scene_local_event"))
      .toMatchObject({
        status: "legacy_hidden",
        rollbackPolicy: "purge",
        projectionPolicy: "support_only",
        backing: { kind: "legacy_scene_beat" },
      });
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "actor_lifecycle"))
      .toMatchObject({ owner: "promote_npc", backing: { kind: "runtime_descriptor_role" } });
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "transient_scene_lifecycle"))
      .toMatchObject({
        owner: "transient_scene_lifecycle_service",
        status: "background_only",
        receiptKind: "transient_scene_cleanup",
        backing: { kind: "deterministic_service_contract" },
      });
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "entity_tag"))
      .toMatchObject({
        owner: "entity_tag_service",
        status: "contract_only",
        backing: { kind: "service_contract" },
      });
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "chronicle_entry"))
      .toMatchObject({
        owner: "add_chronicle_entry",
        status: "background_only",
        backing: { kind: "runtime_state_effect" },
      });
    for (const lane of [
      "npc_belief_state",
      "npc_goal_state",
      "npc_identity_profile",
      "npc_capability_profile",
    ] as const) {
      expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === lane))
        .toMatchObject({
          owner: "npc_profile_authority_quarantine",
          status: "quarantined",
          receiptKind: "quarantined_proposal",
          acceptedReceiptKinds: ["proposal_rejected"],
          rollbackPolicy: "purge",
          projectionPolicy: "hidden",
          backing: { kind: "proposal_quarantine_contract" },
        });
    }

    expect(() => assertStateOwnerRegistry([
      ...GAMEPLAY_STATE_OWNER_REGISTRY,
      GAMEPLAY_STATE_OWNER_REGISTRY[0],
    ])).toThrow(/duplicate state owner lane/i);

    const replaceLane = (
      patch: Partial<typeof GAMEPLAY_STATE_OWNER_REGISTRY[number]>,
    ) => GAMEPLAY_STATE_OWNER_REGISTRY.map((entry) =>
      entry.lane === "known_route_movement" ? { ...entry, ...patch } : entry
    );

    expect(() => assertStateOwnerRegistry(replaceLane({ sourceOfTruth: "" })))
      .toThrow(/known_route_movement.*sourceOfTruth/i);
    expect(() => assertStateOwnerRegistry(replaceLane({ runtimeValidators: [] })))
      .toThrow(/known_route_movement.*runtimeValidators/i);
    expect(() => assertStateOwnerRegistry(replaceLane({ acceptedReceiptKinds: [] })))
      .toThrow(/known_route_movement.*acceptedReceiptKinds/i);
    expect(() => assertStateOwnerRegistry(replaceLane({ projections: [] })))
      .toThrow(/known_route_movement.*projections/i);
    expect(() => assertStateOwnerRegistry(replaceLane({ recoveryModes: [] })))
      .toThrow(/known_route_movement.*recoveryModes/i);
    expect(() => assertStateOwnerRegistry(replaceLane({ tests: [] })))
      .toThrow(/known_route_movement.*tests/i);
    expect(() => assertStateOwnerRegistry(replaceLane({
      backing: { kind: "runtime_state_effect", refs: [] },
    }))).toThrow(/known_route_movement.*backing refs/i);
    expect(() => assertStateOwnerRegistry(replaceLane({
      backing: { kind: "time_ledger", refs: ["advance_time"] },
    }))).toThrow(/known_route_movement.*time ledger/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY.map((entry) =>
        entry.lane === "npc_belief_state"
          ? { ...entry, status: "contract_only" }
          : entry
      ),
    )).toThrow(/npc_belief_state.*quarantined/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY.map((entry) =>
        entry.lane === "npc_goal_state"
          ? { ...entry, acceptedReceiptKinds: ["goal_committed"] }
          : entry
      ),
    )).toThrow(/npc_goal_state.*reject proposals/i);
  });

  it("keeps service-owned gameplay lanes backed by explicit service contracts", () => {
    expect(GAMEPLAY_STATE_SERVICE_CONTRACTS.map((entry) => entry.owner).sort())
      .toEqual([
        "entity_tag_service",
        "quick_action_offer_service",
        "transient_scene_lifecycle_service",
        "turn_clock_ledger",
      ]);
    expect(GAMEPLAY_STATE_SERVICE_CONTRACTS.find((entry) => entry.owner === "entity_tag_service"))
      .toMatchObject({
        delegateTools: ["add_tag", "remove_tag"],
        stores: expect.arrayContaining(["sqlite:players", "sqlite:npcs", "sqlite:items", "sqlite:locations", "sqlite:factions"]),
        receiptKinds: expect.arrayContaining(["entity_tag_delta"]),
        projections: expect.arrayContaining(["tag-derived world/inventory/history facts"]),
      });
    expect(GAMEPLAY_STATE_SERVICE_CONTRACTS.find((entry) => entry.owner === "entity_tag_service")?.stores)
      .not.toEqual(expect.arrayContaining(["sqlite:entity_tags", "sqlite:actors"]));
    expect(GAMEPLAY_STATE_SERVICE_CONTRACTS.find((entry) => entry.owner === "turn_clock_ledger"))
      .toMatchObject({
        delegateTools: ["advance_time"],
        stores: expect.arrayContaining(["sqlite:turn_clock_ledger", "sqlite:world_clocks"]),
      });
    expect(GAMEPLAY_STATE_SERVICE_CONTRACTS.find((entry) => entry.owner === "quick_action_offer_service"))
      .toMatchObject({
        delegateTools: ["offer_quick_actions"],
        stores: expect.arrayContaining(["sqlite:quick_action_offers"]),
      });
    expect(GAMEPLAY_STATE_SERVICE_CONTRACTS.find((entry) => entry.owner === "transient_scene_lifecycle_service"))
      .toMatchObject({
        delegateTools: [],
        stores: expect.arrayContaining(["sqlite:locations", "sqlite:npcs", "sqlite:authority_traces"]),
        receiptKinds: expect.arrayContaining(["transient_scene_cleanup"]),
      });

    expect(() => assertStateOwnerRegistry([
      ...GAMEPLAY_STATE_OWNER_REGISTRY.filter((entry) => entry.lane !== "entity_tag"),
      {
        ...GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "entity_tag")!,
        backing: { kind: "runtime_state_effect", refs: ["entity_tag"] },
      },
    ])).toThrow(/entity_tag.*runtime state effect/i);

    const replaceServiceContract = (
      owner: typeof GAMEPLAY_STATE_SERVICE_CONTRACTS[number]["owner"],
      patch: Partial<typeof GAMEPLAY_STATE_SERVICE_CONTRACTS[number]>,
    ) => GAMEPLAY_STATE_SERVICE_CONTRACTS.map((entry) =>
      entry.owner === owner
        ? { ...entry, ...patch }
        : entry,
    );
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY,
      replaceServiceContract("entity_tag_service", { stores: ["sqlite:entity_tags" as never] }),
    )).toThrow(/entity_tag.*non-manifest store sqlite:entity_tags/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY,
      replaceServiceContract("entity_tag_service", { delegateTools: ["log_event"] }),
    )).toThrow(/entity_tag.*delegate tool log_event does not delegate entity_tag/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY,
      replaceServiceContract("entity_tag_service", { delegateTools: ["promote_npc"] }),
    )).toThrow(/entity_tag.*delegate tool promote_npc does not delegate entity_tag/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY,
      replaceServiceContract("entity_tag_service", { delegateTools: ["missing_tool" as never] }),
    )).toThrow(/entity_tag.*unknown delegate tool missing_tool/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY,
      replaceServiceContract("entity_tag_service", { receiptKinds: ["wrong_receipt"] }),
    )).toThrow(/entity_tag.*does not include receipt entity_tag_delta/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY,
      replaceServiceContract("entity_tag_service", { receiptKinds: ["entity_tag_delta", "wrong_receipt"] }),
    )).toThrow(/entity_tag.*receipt wrong_receipt is not accepted/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY,
      replaceServiceContract("turn_clock_ledger", { delegateTools: ["log_event"] }),
    )).toThrow(/clock_delta.*delegate tool log_event is not a time-effect delegate/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY,
      replaceServiceContract("turn_clock_ledger", { delegateTools: ["advance_time", "log_event"] }),
    )).toThrow(/clock_delta.*delegate tool log_event is not a time-effect delegate/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY,
      replaceServiceContract("quick_action_offer_service", { delegateTools: ["offer_quick_actions", "log_event"] }),
    )).toThrow(/quick_action_offer.*delegate tool log_event does not delegate quick_action_offer/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY,
      replaceServiceContract("transient_scene_lifecycle_service", { stores: ["sqlite:transient_scene_cleanup" as never] }),
    )).toThrow(/transient_scene_lifecycle.*non-manifest store sqlite:transient_scene_cleanup/i);
    expect(() => assertStateOwnerRegistry(
      GAMEPLAY_STATE_OWNER_REGISTRY,
      replaceServiceContract("transient_scene_lifecycle_service", { receiptKinds: ["wrong_receipt"] }),
    )).toThrow(/transient_scene_lifecycle.*does not include receipt transient_scene_cleanup/i);
  });

  it("keeps descriptor canonical owners aligned with registry owners", () => {
    const owners = runtimeDescriptorCanonicalOwnersByEffectKind();
    expect(owners.movement).toEqual(["move_actor"]);
    expect(owners.location_revealed).toEqual(["reveal_location"]);
    expect(owners.minor_poi_created).toEqual(["create_minor_poi"]);
    expect(owners.chronicle_entry).toEqual(["add_chronicle_entry"]);
    expect(owners.quick_action_offer).toEqual(["offer_quick_actions"]);

    // Entity tags have multiple verbs, but the write owner is the service lane.
    // The verbs stay receipt-capable delegates rather than competing canonical
    // owners.
    expect(owners.entity_tag).toBeUndefined();
    expect(GAMEPLAY_STATE_OWNER_REGISTRY.find((entry) => entry.lane === "entity_tag"))
      .toMatchObject({ owner: "entity_tag_service", status: "contract_only" });
  });

  it("makes every runtime effect kind resolve to exactly one gameplay state owner", () => {
    const parity = assertRuntimeEffectStateOwnerParity();

    expect(parity.find((entry) => entry.effectKind === "chronicle_entry"))
      .toMatchObject({
        lane: "chronicle_entry",
        owner: "add_chronicle_entry",
        ownerTools: ["add_chronicle_entry"],
      });
    expect(parity.find((entry) => entry.effectKind === "entity_tag"))
      .toMatchObject({
        lane: "entity_tag",
        owner: "entity_tag_service",
        ownerTools: ["add_tag", "remove_tag"],
      });

    const { chronicle_entry: _omittedChronicleLane, ...missingChronicleLanes } =
      RUNTIME_EFFECT_KIND_STATE_LANES;
    expect(() => assertRuntimeEffectStateOwnerParity({
      effectKindStateLanes: missingChronicleLanes,
    })).toThrow(/Missing runtime effect state lane: chronicle_entry/i);

    expect(() => assertRuntimeEffectStateOwnerParity({
      descriptors: {
        ...RUNTIME_TOOL_DESCRIPTORS,
        add_tag: {
          ...RUNTIME_TOOL_DESCRIPTORS.add_tag,
          stateEffects: [{ effectKind: "entity_tag", ownerKind: "canonical" }] as const,
        },
        remove_tag: {
          ...RUNTIME_TOOL_DESCRIPTORS.remove_tag,
          stateEffects: [{ effectKind: "entity_tag", ownerKind: "canonical" }] as const,
        },
      },
    })).toThrow(/entity_tag.*delegate tool add_tag does not delegate entity_tag/i);

    expect(() => assertRuntimeEffectStateOwnerParity({
      descriptors: {
        ...RUNTIME_TOOL_DESCRIPTORS,
        offer_quick_actions: {
          ...RUNTIME_TOOL_DESCRIPTORS.offer_quick_actions,
          stateEffects: [{ effectKind: "quick_action_offer", ownerKind: "delegate" }] as const,
        },
      },
    })).toThrow(/quick_action_offer.*canonical service tool offer_quick_actions does not own quick_action_offer/i);
  });

  it("rejects backend refs at the public projection boundary", () => {
    expect(() => assertPublicProjectionPayload({
      surface: "sse",
      payload: {
        type: "turn_resolution",
        text: "The clerk nods.",
        quickActions: [{ handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", label: "Ask about the ledger" }],
      },
    })).not.toThrow();

    expect(() => assertPublicProjectionPayload({
      surface: "world",
      payload: {
        placeHandle: "pdto_place_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        actorHandle: "pdto_actor_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        itemHandle: "pdto_item_cccccccccccccccccccccccccccccccc",
      },
    })).not.toThrow();

    for (const privateField of ["characterRecord", "draft", "npc", "persona", "goals", "beliefs"]) {
      expect(() => assertPublicProjectionPayload({
        surface: "world",
        payload: {
          npcs: [{
            id: "pdto_actor_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            [privateField]: { provenance: { sourceKind: "player-input" } },
          }],
        },
      })).toThrow(/private npc projection field/i);
    }

    expect(() => assertPublicProjectionPayload({
      surface: "world_review",
      payload: {
        npcs: [{
          id: "pdto_actor_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          persona: "Public editor-facing persona.",
          goals: "{\"short_term\":[],\"long_term\":[]}",
          beliefs: "[]",
        }],
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

    for (const ref of [
      "loc-1",
      "npc-1",
      "item-1",
      "faction-1",
      "relationship-1",
      "campaign-main",
      "action-result:abc",
      "tool_result_abc",
    ]) {
      expect(() => assertPublicProjectionPayload({
        surface: "world",
        payload: { handle: ref },
      })).toThrow(/backend ref/i);
    }
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

  it("requires every issued-ref namespace to name issuer, resolver, validators, projections, recovery, and tests", () => {
    expect(assertIssuedRefOwnerMatrix().map((entry) => entry.namespace))
      .toEqual([...ISSUED_REF_NAMESPACE_VALUES]);

    for (const entry of ISSUED_REF_OWNER_MATRIX) {
      expect(entry.authorityBoundary).toMatch(/\S/);
      expect(entry.runtimeValidators.length).toBeGreaterThan(0);
      expect(entry.projections.length).toBeGreaterThan(0);
      expect(entry.recoveryModes.length).toBeGreaterThan(0);
      expect(entry.tests.length).toBeGreaterThan(0);
    }

    expect(
      ISSUED_REF_OWNER_MATRIX.find((entry) => entry.namespace === "quick_action_capability"),
    ).toMatchObject({
      sourceOfTruth: expect.stringContaining("quick_action_offers"),
      issuerOwner: "quick_action_offer_service",
      resolverOwner: "quick_action_consumption_service",
    });

    expect(
      ISSUED_REF_OWNER_MATRIX.find((entry) => entry.namespace === "public_dto_handle"),
    ).toMatchObject({
      issuerOwner: "public_dto_handle_projector",
      resolverOwner: "public_dto_handle_resolver",
      modelAuthoredFields: [],
    });
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
