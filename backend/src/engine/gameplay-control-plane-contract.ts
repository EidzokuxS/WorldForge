import { z } from "zod";
import {
  RUNTIME_TOOL_DESCRIPTORS,
  RUNTIME_TOOL_STATE_EFFECT_KINDS,
  type RuntimeToolStateEffectKind,
} from "./runtime-tool-descriptors.js";
import type { RuntimeToolName } from "./runtime-tool-input-schemas.js";

export const TURN_AUTHORITY_STAGE_VALUES = [
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
] as const;

export type TurnAuthorityStage = (typeof TURN_AUTHORITY_STAGE_VALUES)[number];

export const TURN_AUTHORITY_STAGE_SCHEMA = z.enum(TURN_AUTHORITY_STAGE_VALUES);

export interface TurnAuthorityStageContract {
  stage: TurnAuthorityStage;
  owner: string;
  preconditions: readonly string[];
  writes: readonly string[];
  idempotencyKey: string;
  writeScope: "none" | "lease" | "snapshot" | "staged_effects" | "authority" | "packet" | "narration" | "projection" | "final";
  requiredPayloadFields: readonly string[];
  acceptedReceiptRequirements: readonly string[];
  projectionAction: string;
  recoveryMode: "retry" | "resume" | "rollback" | "rebuild" | "terminal";
  recoveryAction: string;
  replayRollbackAction: string;
  vectorPolicy: "none" | "staged" | "rebuild_from_receipts" | "purge";
  observabilityEvent: string;
  failureTransition: string;
  tests: readonly string[];
}

export const TURN_AUTHORITY_STAGE_CONTRACTS: readonly TurnAuthorityStageContract[] = [
  {
    stage: "intent_created",
    owner: "chat_route",
    preconditions: [
      "public player action or backend-resolved quick-action handle is accepted",
      "no pending narration saga blocks the campaign",
    ],
    writes: ["turn_sagas", "turn_saga_events"],
    idempotencyKey: "campaign_id:turn_id:action_id",
    writeScope: "none",
    requiredPayloadFields: ["actionTextLength", "processor"],
    acceptedReceiptRequirements: ["none: intent creation cannot accept gameplay mutation receipts"],
    projectionAction: "no public projection; intent remains backend lifecycle state",
    recoveryMode: "retry",
    recoveryAction: "drop incomplete intent and retry from the original public action",
    replayRollbackAction: "replay must recreate the same source action before any mutation",
    vectorPolicy: "none",
    observabilityEvent: "turn.begin",
    failureTransition: "request fails before gameplay mutation",
    tests: ["chat.test.ts", "turn-processor.test.ts", "turn-saga.test.ts"],
  },
  {
    stage: "lease_acquired",
    owner: "turn_saga_worker",
    preconditions: [
      "turn saga exists and is not terminal",
      "no active non-stale worker lock is present",
    ],
    writes: ["turn_sagas.active_lock_token", "turn_sagas.active_worker_id", "turn_saga_events"],
    idempotencyKey: "turn_saga_id:lease_token",
    writeScope: "lease",
    requiredPayloadFields: ["leaseOwner"],
    acceptedReceiptRequirements: ["none: worker lease is not gameplay authority"],
    projectionAction: "surface only coarse recovery state if a lease blocks public work",
    recoveryMode: "resume",
    recoveryAction: "stale lease can be reclaimed by pending narration recovery",
    replayRollbackAction: "retry/replay must acquire a fresh lease token",
    vectorPolicy: "none",
    observabilityEvent: "turn.worker.claimed",
    failureTransition: "TurnSagaLockConflictError",
    tests: ["turn-saga.test.ts", "chat.resilience.test.ts", "turn-processor.test.ts"],
  },
  {
    stage: "snapshot_taken",
    owner: "store_manifest_restore",
    preconditions: [
      "lease is acquired for the live turn",
      "pre-turn restore bundle is captured or explicitly absent",
    ],
    writes: ["turn_saga_events", "restore bundle metadata"],
    idempotencyKey: "turn_saga_id:snapshot_id",
    writeScope: "snapshot",
    requiredPayloadFields: ["provided"],
    acceptedReceiptRequirements: ["none: snapshot capture precedes gameplay mutation receipts"],
    projectionAction: "no public projection; snapshot is rollback evidence only",
    recoveryMode: "rollback",
    recoveryAction: "restore the verified pre-turn bundle before retrying after pre-settled failure",
    replayRollbackAction: "rollback restores DB/config/chat/vector stores from the snapshot contract",
    vectorPolicy: "none",
    observabilityEvent: "turn.snapshot",
    failureTransition: "rollback_critical failure if snapshot restore evidence is invalid",
    tests: ["rollback.test.ts", "store-manifest-executor.test.ts", "turn-processor.test.ts"],
  },
  {
    stage: "effects_staged",
    owner: "gm_tool_loop",
    preconditions: [
      "GM Read/ScenePlan selected legal runtime tools",
      "tool execution occurs inside mutation boundary or backend service boundary",
    ],
    writes: ["runtime side-effect savepoints", "turn_saga_events"],
    idempotencyKey: "turn_saga_id:effect_batch_id",
    writeScope: "staged_effects",
    requiredPayloadFields: ["gmActionResultCount", "actorActionResultCount"],
    acceptedReceiptRequirements: [
      "state-bearing tool results are not terminal until accepted by receipt checks",
      "observation-only results cannot authorize mutation",
    ],
    projectionAction: "no public projection until settled packet persistence",
    recoveryMode: "rollback",
    recoveryAction: "rollback mutation boundary and retract staged durable/vector writes",
    replayRollbackAction: "replay must re-execute tools from typed requirements, not prior prose",
    vectorPolicy: "staged",
    observabilityEvent: "gm-tool-loop.mutation-boundary",
    failureTransition: "rollback_critical before settled packet",
    tests: ["gm-tool-loop.test.ts", "gm-tool-step.test.ts", "tool-executor-authority.test.ts"],
  },
  {
    stage: "receipts_accepted",
    owner: "tool_executor",
    preconditions: [
      "every terminal runtime requirement has an accepted authoritative receipt",
      "write scopes and base world version match the backend authority context",
    ],
    writes: ["authority_traces", "turn_clock_ledger", "runtime gameplay tables", "turn_saga_events"],
    idempotencyKey: "turn_saga_id:receipt_batch_id",
    writeScope: "authority",
    requiredPayloadFields: ["acceptedToolResultRefs", "acceptedActorResultRefs"],
    acceptedReceiptRequirements: [
      "successful",
      "authoritative",
      "non-observation-only",
      "state delta refs cover the claimed mutation lane",
    ],
    projectionAction: "receipt facts become eligible for narrator packet construction",
    recoveryMode: "resume",
    recoveryAction: "resume from accepted receipts and rebuild derived vectors/facts",
    replayRollbackAction: "replay compares accepted receipt refs before accepting settled packet reuse",
    vectorPolicy: "rebuild_from_receipts",
    observabilityEvent: "tool.call",
    failureTransition: "state corruption if committed receipt evidence cannot be recovered",
    tests: ["tool-contracts.test.ts", "tool-executor-authority.test.ts", "turn-processor.test.ts"],
  },
  {
    stage: "canonical_state_committed",
    owner: "living_world_authority",
    preconditions: [
      "accepted receipts have committed their canonical rows",
      "world clock/version ledger is monotonic for the turn",
    ],
    writes: ["world_clocks", "canonical gameplay stores", "turn_saga_events"],
    idempotencyKey: "turn_saga_id:world_version",
    writeScope: "authority",
    requiredPayloadFields: ["worldVersion"],
    acceptedReceiptRequirements: [
      "result world version is not lower than base world version",
      "time delta exists only when backed by accepted elapsed/travel authority",
    ],
    projectionAction: "canonical rows become source for settled packet and public projection builders",
    recoveryMode: "resume",
    recoveryAction: "resume from canonical rows and accepted authority traces",
    replayRollbackAction: "rollback restores prior snapshot; replay rejects stale world versions",
    vectorPolicy: "rebuild_from_receipts",
    observabilityEvent: "authority.trace",
    failureTransition: "failed_state_corruption on world-version mismatch",
    tests: ["living-world-authority.test.ts", "tool-executor-authority.test.ts", "turn-processor.test.ts"],
  },
  {
    stage: "settled_packet_persisted",
    owner: "turn_saga",
    preconditions: [
      "canonical turn packet and narrator packet are built from backend-owned evidence",
      "accepted tool/actor/durable refs are attached to the packet",
    ],
    writes: ["settled_turn_packets", "turn_sagas.settled_turn_packet_id", "turn_saga_events"],
    idempotencyKey: "turn_saga_id:settled_packet_id",
    writeScope: "packet",
    requiredPayloadFields: ["settledTurnPacketId"],
    acceptedReceiptRequirements: [
      "settled packet lists accepted tool result refs",
      "settled packet lists accepted actor result refs or an explicit empty set",
      "settled packet stores base/result world versions",
    ],
    projectionAction: "public SSE may expose turn_resolution derived from settled packet only",
    recoveryMode: "resume",
    recoveryAction: "recover prepared settled packet event before rerunning narration",
    replayRollbackAction: "replay can resume narration from packet without re-running paid resolution",
    vectorPolicy: "rebuild_from_receipts",
    observabilityEvent: "settled_packet_persisted",
    failureTransition: "pending settled narration until packet is recovered or rebuilt",
    tests: ["turn-saga.test.ts", "turn-processor.test.ts", "chat.resilience.test.ts"],
  },
  {
    stage: "narration_accepted",
    owner: "narration_grounding_guard",
    preconditions: [
      "settled packet exists",
      "final narration draft cites backend-issued selectable fact refs",
    ],
    writes: ["narrator_attempts", "turn_saga_events"],
    idempotencyKey: "turn_saga_id:narrator_attempt_id",
    writeScope: "narration",
    requiredPayloadFields: ["narratorAttemptId"],
    acceptedReceiptRequirements: [
      "successful narrator attempt has final text",
      "grounding guard result is accepted for the settled packet",
    ],
    projectionAction: "accepted final text may be appended after settled packet presentation metadata is recorded",
    recoveryMode: "resume",
    recoveryAction: "resume narration from settled packet and latest successful narrator attempt",
    replayRollbackAction: "replay does not regenerate gameplay truth; it may rerender narration from settled facts",
    vectorPolicy: "rebuild_from_receipts",
    observabilityEvent: "visible-narration.packet-guard",
    failureTransition: "resolved_pending_narration or narrator_repairing until accepted",
    tests: ["narration-grounding-guard.test.ts", "turn-processor.test.ts", "chat.test.ts"],
  },
  {
    stage: "public_projection_committed",
    owner: "public_projection_builder",
    preconditions: [
      "narration is accepted or a no-narration settled packet is finalized",
      "public payloads pass projection guards",
    ],
    writes: ["chat_history assistant message", "SSE done/narrative payloads", "turn_saga_events"],
    idempotencyKey: "turn_saga_id:projection_digest",
    writeScope: "projection",
    requiredPayloadFields: ["narratorAttemptId", "projectionAction", "projectionDigest"],
    acceptedReceiptRequirements: [
      "public projection uses settled packet/narrator attempt metadata",
      "no backend-only refs leak into public DTO/SSE payloads",
    ],
    projectionAction: "commit public assistant/SSE projection from settled packet presentation only",
    recoveryMode: "rebuild",
    recoveryAction: "dedupe assistant append and rebuild public projection from settled packet",
    replayRollbackAction: "rollback removes post-settled public append only if finalization never completed",
    vectorPolicy: "rebuild_from_receipts",
    observabilityEvent: "sse.emit",
    failureTransition: "resume_ready pending narration if projection fails after packet persistence",
    tests: ["chat.test.ts", "chat.resilience.test.ts", "player-facing-events.test.ts"],
  },
  {
    stage: "turn_finalized",
    owner: "turn_saga",
    preconditions: [
      "public projection is committed or explicitly unnecessary",
      "post-narration finalization tail completed",
    ],
    writes: ["turn_sagas.status", "turn_saga_events", "post-turn summary hooks"],
    idempotencyKey: "turn_saga_id:final_status",
    writeScope: "final",
    requiredPayloadFields: ["narratorAttemptId", "tick"],
    acceptedReceiptRequirements: [
      "successful narrator attempt is attached when narration is required",
      "settled packet remains attached to the finalized saga",
    ],
    projectionAction: "final done boundary can be emitted after saga finalization succeeds",
    recoveryMode: "terminal",
    recoveryAction: "finalized saga is immutable except same-attempt idempotent finalization",
    replayRollbackAction: "retry/undo must start from explicit restore/replay path, not mutate finalized saga",
    vectorPolicy: "rebuild_from_receipts",
    observabilityEvent: "turn.finalized",
    failureTransition: "failed_state_corruption only for verified restore/corruption faults",
    tests: ["turn-saga.test.ts", "turn-processor.test.ts", "chat.resilience.test.ts"],
  },
] as const;

const REQUIRED_TURN_STAGE_ARRAY_FIELDS = [
  "preconditions",
  "writes",
  "requiredPayloadFields",
  "acceptedReceiptRequirements",
  "tests",
] as const satisfies readonly (keyof TurnAuthorityStageContract)[];

const REQUIRED_TURN_STAGE_TEXT_FIELDS = [
  "owner",
  "idempotencyKey",
  "projectionAction",
  "recoveryAction",
  "replayRollbackAction",
  "observabilityEvent",
  "failureTransition",
] as const satisfies readonly (keyof TurnAuthorityStageContract)[];

export function assertTurnAuthorityLifecycle(
  stages: readonly string[],
): TurnAuthorityStage[] {
  const parsed = z.array(TURN_AUTHORITY_STAGE_SCHEMA).safeParse(stages);
  if (!parsed.success) {
    throw new Error("Turn authority lifecycle contains an unknown stage.");
  }
  const expected = TURN_AUTHORITY_STAGE_VALUES;
  if (parsed.data.length !== expected.length) {
    throw new Error("Turn authority lifecycle must include every required stage.");
  }
  parsed.data.forEach((stage, index) => {
    if (stage !== expected[index]) {
      throw new Error(`Turn authority lifecycle out of order at ${stage}.`);
    }
  });
  return parsed.data;
}

export function assertTurnAuthorityStageContracts(
  contracts: readonly TurnAuthorityStageContract[] = TURN_AUTHORITY_STAGE_CONTRACTS,
): TurnAuthorityStageContract[] {
  const stages = assertTurnAuthorityLifecycle(contracts.map((contract) => contract.stage));
  contracts.forEach((contract, index) => {
    if (contract.stage !== stages[index]) {
      throw new Error(`Turn authority stage contract out of order at ${contract.stage}.`);
    }
    for (const field of REQUIRED_TURN_STAGE_TEXT_FIELDS) {
      const value = contract[field];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Turn authority stage ${contract.stage} has no ${field}.`);
      }
    }
    for (const field of REQUIRED_TURN_STAGE_ARRAY_FIELDS) {
      const value = contract[field];
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`Turn authority stage ${contract.stage} has no ${field}.`);
      }
    }
  });
  return [...contracts];
}

export function turnAuthorityStageContractFor(
  stage: TurnAuthorityStage,
): TurnAuthorityStageContract {
  const contract = TURN_AUTHORITY_STAGE_CONTRACTS.find((entry) => entry.stage === stage);
  if (!contract) {
    throw new Error(`Missing turn authority stage contract: ${stage}.`);
  }
  return contract;
}

export const STORE_AUTHORITY_LEVEL_VALUES = [
  "authoritative",
  "derived",
  "projection",
  "diagnostic",
  "evidence",
  "cache",
] as const;

export const STORE_POLICY_VALUES = [
  "preserve",
  "purge",
  "rewrite",
  "rebuild",
  "reject",
] as const;

export type StorePolicy = (typeof STORE_POLICY_VALUES)[number];

export const STORE_TURN_ROLLBACK_POLICY_VALUES = [
  "snapshot_restore",
  "purge_rebuild",
  "preserve_verified",
  "purge",
  "reject",
] as const;

export type StoreTurnRollbackPolicy = (typeof STORE_TURN_ROLLBACK_POLICY_VALUES)[number];

export const STORE_CHECKPOINT_RESTORE_POLICY_VALUES = [
  "snapshot_restore",
  "exact_restore",
  "purge_rebuild",
  "preserve_verified",
  "purge",
  "reject",
] as const;

export type StoreCheckpointRestorePolicy = (typeof STORE_CHECKPOINT_RESTORE_POLICY_VALUES)[number];

export const STORE_REPLAY_POLICY_VALUES = [
  "deterministic",
  "recorded_reuse",
  "regenerate",
  "reject",
] as const;

export type StoreReplayPolicy = (typeof STORE_REPLAY_POLICY_VALUES)[number];

export const SOURCE_CAMPAIGN_ID_POLICY_VALUES = [
  "not_applicable",
  "rewrite",
  "purge",
  "reject_if_present",
] as const;

export type SourceCampaignIdPolicy = (typeof SOURCE_CAMPAIGN_ID_POLICY_VALUES)[number];

export const STORE_RESTORE_POLICIES_SCHEMA = z.object({
  turnRollback: z.enum(STORE_TURN_ROLLBACK_POLICY_VALUES),
  checkpointRestore: z.enum(STORE_CHECKPOINT_RESTORE_POLICY_VALUES),
});

export type StoreRestorePolicies = z.infer<typeof STORE_RESTORE_POLICIES_SCHEMA>;

export const STORE_MANIFEST_ENTRY_BASE_SCHEMA = z.object({
  store: z.string().min(1),
  authorityLevel: z.enum(STORE_AUTHORITY_LEVEL_VALUES),
  clonePolicy: z.enum(STORE_POLICY_VALUES),
  rollbackPolicy: z.enum(STORE_POLICY_VALUES),
  replayPolicy: z.enum(STORE_REPLAY_POLICY_VALUES),
  sourceCampaignIdPolicy: z.enum(SOURCE_CAMPAIGN_ID_POLICY_VALUES),
  requiresHash: z.boolean(),
  requiresRowCount: z.boolean(),
});

export type StoreManifestEntryBase = z.infer<typeof STORE_MANIFEST_ENTRY_BASE_SCHEMA>;

export const STORE_MANIFEST_ENTRY_SCHEMA = STORE_MANIFEST_ENTRY_BASE_SCHEMA.extend({
  restorePolicies: STORE_RESTORE_POLICIES_SCHEMA,
});

export type StoreManifestEntry = z.infer<typeof STORE_MANIFEST_ENTRY_SCHEMA>;

const SNAPSHOT_RESTORE_POLICIES: StoreRestorePolicies = {
  turnRollback: "snapshot_restore",
  checkpointRestore: "snapshot_restore",
};

const EPISODIC_VECTOR_RESTORE_POLICIES: StoreRestorePolicies = {
  turnRollback: "purge_rebuild",
  checkpointRestore: "exact_restore",
};

const LORE_VECTOR_RESTORE_POLICIES: StoreRestorePolicies = {
  turnRollback: "preserve_verified",
  checkpointRestore: "exact_restore",
};

const PURGE_REBUILD_RESTORE_POLICIES: StoreRestorePolicies = {
  turnRollback: "purge_rebuild",
  checkpointRestore: "purge_rebuild",
};

const PRESERVE_VERIFIED_RESTORE_POLICIES: StoreRestorePolicies = {
  turnRollback: "preserve_verified",
  checkpointRestore: "preserve_verified",
};

const PURGE_RESTORE_POLICIES: StoreRestorePolicies = {
  turnRollback: "purge",
  checkpointRestore: "purge",
};

const REJECT_RESTORE_POLICIES: StoreRestorePolicies = {
  turnRollback: "reject",
  checkpointRestore: "reject",
};

export function restorePoliciesForStore(store: string): StoreRestorePolicies {
  if (store.startsWith("sqlite:") || store === "json:config" || store === "json:chat_history") {
    return SNAPSHOT_RESTORE_POLICIES;
  }
  if (store === "vectors:episodic_events") {
    return EPISODIC_VECTOR_RESTORE_POLICIES;
  }
  if (store === "vectors:lore_cards") {
    return LORE_VECTOR_RESTORE_POLICIES;
  }
  if (store === "projection:public_dtos") {
    return PURGE_REBUILD_RESTORE_POLICIES;
  }
  if (store === "artifact:checkpoints" || store === "artifact:images") {
    return PRESERVE_VERIFIED_RESTORE_POLICIES;
  }
  if (store === "artifact:turn_boundaries") {
    return PURGE_RESTORE_POLICIES;
  }
  if (store === "evidence:playtest_reports") {
    return REJECT_RESTORE_POLICIES;
  }
  throw new Error(`No restore policy declared for store: ${store}.`);
}

function defineStoreManifestEntry(entry: StoreManifestEntryBase): StoreManifestEntry {
  return STORE_MANIFEST_ENTRY_SCHEMA.parse({
    ...entry,
    restorePolicies: restorePoliciesForStore(entry.store),
  });
}

export const PHASE95_SQLITE_STORE_TABLES = [
  "campaigns",
  "locations",
  "location_edges",
  "location_recent_events",
  "players",
  "npcs",
  "items",
  "factions",
  "faction_command_nodes",
  "faction_resources",
  "faction_reports",
  "faction_operations",
  "faction_resource_ledger",
  "world_threads",
  "world_thread_events",
  "relationships",
  "chronicle",
  "quick_action_offers",
  "world_clocks",
  "turn_clock_ledger",
  "simulation_jobs",
  "simulation_proposals",
  "actor_process_states",
  "actor_wake_signals",
  "actor_knowledge_records",
  "authority_traces",
  "turn_sagas",
  "turn_saga_events",
  "oracle_decisions",
  "settled_turn_packets",
  "narrator_attempts",
  "gameplay_cycle_v2_packets",
  "clean_gameplay_turn_records",
] as const;

export const PHASE95_REQUIRED_STORE_KEYS = [
  ...PHASE95_SQLITE_STORE_TABLES.map((table) => `sqlite:${table}` as const),
  "json:config",
  "json:chat_history",
  "vectors:episodic_events",
  "vectors:lore_cards",
  "artifact:checkpoints",
  "artifact:images",
  "artifact:turn_boundaries",
  "projection:public_dtos",
  "evidence:playtest_reports",
] as const;

export type Phase95RequiredStoreKey = (typeof PHASE95_REQUIRED_STORE_KEYS)[number];

const PHASE95_STORE_MANIFEST_BASE = [
  {
    store: "sqlite:campaigns",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:locations",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:location_edges",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:location_recent_events",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:players",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:npcs",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:items",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:factions",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:faction_command_nodes",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:faction_resources",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:faction_reports",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:faction_operations",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:faction_resource_ledger",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:world_threads",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:world_thread_events",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:relationships",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:chronicle",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:turn_sagas",
    authorityLevel: "authoritative",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:settled_turn_packets",
    authorityLevel: "authoritative",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:narrator_attempts",
    authorityLevel: "authoritative",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:gameplay_cycle_v2_packets",
    authorityLevel: "authoritative",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:clean_gameplay_turn_records",
    authorityLevel: "authoritative",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "reject",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:quick_action_offers",
    authorityLevel: "authoritative",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "reject",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:world_clocks",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:turn_clock_ledger",
    authorityLevel: "authoritative",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:simulation_jobs",
    authorityLevel: "derived",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:simulation_proposals",
    authorityLevel: "derived",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:actor_process_states",
    authorityLevel: "derived",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:actor_wake_signals",
    authorityLevel: "derived",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:actor_knowledge_records",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:authority_traces",
    authorityLevel: "authoritative",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:turn_saga_events",
    authorityLevel: "authoritative",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "sqlite:oracle_decisions",
    authorityLevel: "authoritative",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "json:config",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "rewrite",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "rewrite",
    requiresHash: true,
    requiresRowCount: false,
  },
  {
    store: "json:chat_history",
    authorityLevel: "evidence",
    clonePolicy: "purge",
    rollbackPolicy: "rewrite",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "purge",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "vectors:episodic_events",
    authorityLevel: "derived",
    clonePolicy: "rebuild",
    rollbackPolicy: "rebuild",
    replayPolicy: "regenerate",
    sourceCampaignIdPolicy: "reject_if_present",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "vectors:lore_cards",
    authorityLevel: "derived",
    clonePolicy: "rebuild",
    rollbackPolicy: "rebuild",
    replayPolicy: "regenerate",
    sourceCampaignIdPolicy: "reject_if_present",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "artifact:checkpoints",
    authorityLevel: "evidence",
    clonePolicy: "reject",
    rollbackPolicy: "preserve",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "reject_if_present",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "artifact:images",
    authorityLevel: "evidence",
    clonePolicy: "reject",
    rollbackPolicy: "preserve",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "reject_if_present",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "artifact:turn_boundaries",
    authorityLevel: "evidence",
    clonePolicy: "reject",
    rollbackPolicy: "purge",
    replayPolicy: "reject",
    sourceCampaignIdPolicy: "reject_if_present",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "projection:public_dtos",
    authorityLevel: "projection",
    clonePolicy: "rebuild",
    rollbackPolicy: "rebuild",
    replayPolicy: "deterministic",
    sourceCampaignIdPolicy: "reject_if_present",
    requiresHash: true,
    requiresRowCount: true,
  },
  {
    store: "evidence:playtest_reports",
    authorityLevel: "evidence",
    clonePolicy: "reject",
    rollbackPolicy: "reject",
    replayPolicy: "recorded_reuse",
    sourceCampaignIdPolicy: "not_applicable",
    requiresHash: true,
    requiresRowCount: false,
  },
] as const satisfies readonly StoreManifestEntryBase[];

export const PHASE95_STORE_MANIFEST: readonly StoreManifestEntry[] =
  PHASE95_STORE_MANIFEST_BASE.map((entry) => defineStoreManifestEntry(entry));

export function assertStoreManifestCoverage(
  manifest: readonly StoreManifestEntry[] = PHASE95_STORE_MANIFEST,
): StoreManifestEntry[] {
  const parsed = z.array(STORE_MANIFEST_ENTRY_SCHEMA).parse(manifest);
  const stores = new Set<string>();
  const requiredStores = new Set<string>(PHASE95_REQUIRED_STORE_KEYS);
  for (const entry of parsed) {
    if (stores.has(entry.store)) {
      throw new Error(`Duplicate store manifest entry: ${entry.store}.`);
    }
    if (!requiredStores.has(entry.store)) {
      throw new Error(`Unexpected store manifest entry: ${entry.store}.`);
    }
    stores.add(entry.store);
  }
  for (const required of PHASE95_REQUIRED_STORE_KEYS) {
    if (!stores.has(required)) {
      throw new Error(`Missing store manifest entry: ${required}.`);
    }
  }
  return parsed;
}

export const ISSUED_REF_NAMESPACE_VALUES = [
  "scene_alias",
  "tool_result_alias",
  "quick_action_capability",
  "narration_fact",
  "public_dto_handle",
] as const;

export const ISSUED_REF_LIFETIME_VALUES = [
  "turn",
  "same_turn_tool_result",
  "durable_until_consumed",
  "narration_attempt",
  "projection_snapshot",
] as const;

export const ISSUED_REF_VISIBILITY_VALUES = [
  "model",
  "player",
  "public_projection",
  "backend_only",
] as const;

export const ISSUED_REF_SCHEMA = z.object({
  handle: z.string().min(1),
  namespace: z.enum(ISSUED_REF_NAMESPACE_VALUES),
  lifetime: z.enum(ISSUED_REF_LIFETIME_VALUES),
  visibility: z.enum(ISSUED_REF_VISIBILITY_VALUES),
  campaignId: z.string().min(1),
  playerId: z.string().min(1).nullable(),
  turnId: z.string().min(1).nullable(),
  baseWorldVersion: z.number().int().nonnegative(),
  expiresAtTurn: z.number().int().nonnegative().nullable(),
  consumable: z.boolean(),
});

export type IssuedRef = z.infer<typeof ISSUED_REF_SCHEMA>;

export interface IssuedRefOwnerMatrixEntry {
  namespace: (typeof ISSUED_REF_NAMESPACE_VALUES)[number];
  sourceOfTruth: string;
  issuerOwner: string;
  resolverOwner: string;
  authorityBoundary: string;
  supportOnlySurfaces: readonly string[];
  modelAuthoredFields: readonly string[];
  runtimeValidators: readonly string[];
  receipts: readonly string[];
  projections: readonly string[];
  recoveryModes: readonly string[];
  tests: readonly string[];
}

export const ISSUED_REF_OWNER_MATRIX_ENTRY_SCHEMA = z.object({
  namespace: z.enum(ISSUED_REF_NAMESPACE_VALUES),
  sourceOfTruth: z.string().min(1),
  issuerOwner: z.string().min(1),
  resolverOwner: z.string().min(1),
  authorityBoundary: z.string().min(1),
  supportOnlySurfaces: z.array(z.string().min(1)),
  modelAuthoredFields: z.array(z.string().min(1)),
  runtimeValidators: z.array(z.string().min(1)).min(1),
  receipts: z.array(z.string().min(1)),
  projections: z.array(z.string().min(1)).min(1),
  recoveryModes: z.array(z.string().min(1)).min(1),
  tests: z.array(z.string().min(1)).min(1),
});

export const ISSUED_REF_OWNER_MATRIX: readonly IssuedRefOwnerMatrixEntry[] = [
  {
    namespace: "scene_alias",
    sourceOfTruth: "Current model-facing SceneFrame alias map.",
    issuerOwner: "scene_frame_builder",
    resolverOwner: "model_facing_alias_resolver",
    authorityBoundary:
      "Packet-local aliases identify current candidates only; executor resolves them to canonical backend ids before mutation.",
    supportOnlySurfaces: ["visible labels", "scene summaries", "candidate prose"],
    modelAuthoredFields: ["tool candidate aliases"],
    runtimeValidators: ["reserved backend-ref guard", "candidate alias resolver", "tool input schemas"],
    receipts: [],
    projections: ["model-facing scene packet"],
    recoveryModes: ["rebuild scene packet from canonical world snapshot"],
    tests: ["gm-turn-read.test.ts", "tool-contracts.test.ts", "gameplay-control-plane-contract.test.ts"],
  },
  {
    namespace: "tool_result_alias",
    sourceOfTruth: "Accepted same-turn tool result and state receipt ledger.",
    issuerOwner: "gm_tool_loop_result_projector",
    resolverOwner: "same_turn_receipt_resolver",
    authorityBoundary:
      "Same-turn aliases are evidence selectors, not durable storage ids; later tools must resolve against accepted receipts.",
    supportOnlySurfaces: ["tool result summaries", "repair diagnostics"],
    modelAuthoredFields: ["state receipt refs selected by later tool calls"],
    runtimeValidators: ["state receipt matcher", "same-turn write-scope ledger", "tool result schema"],
    receipts: ["accepted tool result receipt", "authority trace"],
    projections: ["GM tool loop follow-up packet", "narrator packet citable evidence"],
    recoveryModes: ["rollback unaccepted effects", "resume from accepted receipt batch"],
    tests: ["gm-tool-loop.test.ts", "dialogue-state-receipt.test.ts", "tool-contracts.test.ts"],
  },
  {
    namespace: "quick_action_capability",
    sourceOfTruth: "quick_action_offers rows plus accepted source receipt digest.",
    issuerOwner: "quick_action_offer_service",
    resolverOwner: "quick_action_consumption_service",
    authorityBoundary:
      "Player-visible label/action prose is presentation; offerId/actionId authority is backend-owned and consumable.",
    supportOnlySurfaces: ["quick action labels", "quick action prose"],
    modelAuthoredFields: ["label", "action prose"],
    runtimeValidators: ["offer id/action id schema", "expiry validator", "consumed/base-world-version/source-digest validator"],
    receipts: ["accepted turn receipt adjacent to offer creation", "quick action consumption trace"],
    projections: ["SSE quick actions", "frontend quick action chips", "chat route quick actions"],
    recoveryModes: ["rollback non-receipted offers", "expire stale offers", "idempotently reject consumed offers"],
    tests: ["quick-action-offers.test.ts", "chat.test.ts", "quick-actions.test.tsx"],
  },
  {
    namespace: "narration_fact",
    sourceOfTruth: "Settled narrator packet fact list and narrator attempt record.",
    issuerOwner: "narrator_packet_builder",
    resolverOwner: "narration_grounding_guard",
    authorityBoundary:
      "The model selects issued fact/evidence refs for prose; backend compiles only citable accepted facts into public narration.",
    supportOnlySurfaces: ["style instructions", "support context", "diagnostic context"],
    modelAuthoredFields: ["selected fact refs", "selected evidence refs", "style/order"],
    runtimeValidators: ["assertSelectableNarrationRefs", "grounding compiler", "private/backend term guard"],
    receipts: ["settled packet", "narrator attempt"],
    projections: ["assistant SSE text", "chat history assistant message", "narrative log"],
    recoveryModes: ["resume from settled packet", "fail closed on unsupported/private prose", "retry structured narration"],
    tests: ["narrator-packet.test.ts", "narration-grounding-guard.test.ts", "visible-narration-output-guard.test.ts"],
  },
  {
    namespace: "public_dto_handle",
    sourceOfTruth: "Public DTO projector output and resolver map over canonical stores.",
    issuerOwner: "public_dto_handle_projector",
    resolverOwner: "public_dto_handle_resolver",
    authorityBoundary:
      "Public handles are opaque projection capabilities; raw storage ids stay backend-only and are never UI authority.",
    supportOnlySurfaces: ["UI labels", "frontend render state"],
    modelAuthoredFields: [],
    runtimeValidators: ["public DTO handle parser", "assertPublicProjectionPayload", "frontend API parser"],
    receipts: ["projection digest"],
    projections: ["world", "inventory", "history", "checkpoints", "location entities", "npc promote"],
    recoveryModes: ["rebuild projection from canonical stores", "reject malformed public handles"],
    tests: ["campaigns.test.ts", "campaigns.inventory-authority.test.ts", "api.test.ts"],
  },
] as const;

export function assertIssuedRefOwnerMatrix(
  matrix: readonly IssuedRefOwnerMatrixEntry[] = ISSUED_REF_OWNER_MATRIX,
): IssuedRefOwnerMatrixEntry[] {
  const parsed = z.array(ISSUED_REF_OWNER_MATRIX_ENTRY_SCHEMA).parse(matrix) as IssuedRefOwnerMatrixEntry[];
  const seen = new Set<string>();
  const required = new Set<string>(ISSUED_REF_NAMESPACE_VALUES);
  for (const entry of parsed) {
    if (seen.has(entry.namespace)) {
      throw new Error(`Duplicate issued-ref owner entry: ${entry.namespace}.`);
    }
    if (!required.has(entry.namespace)) {
      throw new Error(`Unexpected issued-ref namespace owner entry: ${entry.namespace}.`);
    }
    seen.add(entry.namespace);
    for (const field of [
      ["runtimeValidators", entry.runtimeValidators],
      ["projections", entry.projections],
      ["recoveryModes", entry.recoveryModes],
      ["tests", entry.tests],
    ] as const) {
      if (field[1].length === 0) {
        throw new Error(`Issued-ref namespace ${entry.namespace} has no ${field[0]}.`);
      }
    }
  }
  for (const namespace of ISSUED_REF_NAMESPACE_VALUES) {
    if (!seen.has(namespace)) {
      throw new Error(`Missing issued-ref owner entry: ${namespace}.`);
    }
  }
  return parsed;
}

const BACKEND_REF_BOUNDARY_PATTERN =
  /\b(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?:actor|location|route|item|tool-result|action-result|authority|saga|turn-saga|settled-packet):[A-Za-z0-9_.:-]+|(?:tool_result|action_result|turn_saga|settled_packet)_[A-Za-z0-9_.:-]+)\b/i;

const BACKEND_STORAGE_ID_PATTERN =
  /^(?:campaign|camp|loc|location|npc|player|item|faction|relationship|route|edge|event)-[A-Za-z0-9_.:-]+$/i;

const PUBLIC_PROJECTION_SAFE_STRING_VALUES = new Set([
  "player-input",
]);

export function assertNoBackendRefsInPublicValue(value: unknown, path = "$"): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      !PUBLIC_PROJECTION_SAFE_STRING_VALUES.has(trimmed)
      && (BACKEND_REF_BOUNDARY_PATTERN.test(value) || BACKEND_STORAGE_ID_PATTERN.test(trimmed))
    ) {
      throw new Error(`Backend ref crossed public boundary at ${path}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoBackendRefsInPublicValue(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (BACKEND_REF_BOUNDARY_PATTERN.test(key) || BACKEND_STORAGE_ID_PATTERN.test(key.trim())) {
        throw new Error(`Backend ref key crossed public boundary at ${path}.${key}.`);
      }
      assertNoBackendRefsInPublicValue(nested, `${path}.${key}`);
    }
  }
}

export const PUBLIC_PROJECTION_SURFACE_VALUES = [
  "sse",
  "world",
  "world_review",
  "history",
  "checkpoints",
  "location_entities",
  "npc_promote",
  "quick_actions",
  "inventory",
  "frontend_state",
] as const;

export const PUBLIC_PROJECTION_SURFACE_SCHEMA = z.enum(PUBLIC_PROJECTION_SURFACE_VALUES);

const WORLD_NPC_PRIVATE_PROJECTION_KEYS = new Set([
  "characterRecord",
  "draft",
  "npc",
  "persona",
  "goals",
  "beliefs",
]);

function isPublicProjectionRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertNoPrivateWorldNpcProjectionFields(payload: unknown): void {
  if (!isPublicProjectionRecord(payload) || !Array.isArray(payload.npcs)) {
    return;
  }
  payload.npcs.forEach((npc, index) => {
    if (!isPublicProjectionRecord(npc)) {
      return;
    }
    for (const key of WORLD_NPC_PRIVATE_PROJECTION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(npc, key)) {
        throw new Error(`Private NPC projection field crossed world public boundary at $.npcs[${index}].${key}.`);
      }
    }
  });
}

export function assertPublicProjectionPayload(input: {
  surface: string;
  payload: unknown;
}): void {
  PUBLIC_PROJECTION_SURFACE_SCHEMA.parse(input.surface);
  if (input.surface === "world") {
    assertNoPrivateWorldNpcProjectionFields(input.payload);
  }
  assertNoBackendRefsInPublicValue(input.payload);
}

export const CLOCK_LEDGER_REASON_VALUES = [
  "zero_time_status",
  "wait",
  "watch",
  "rest",
  "work",
  "other_elapsed_time",
  "travel",
  "tool_time_effect",
  "due_world_elapsed",
  "replay_restore",
] as const;

export type ClockLedgerReasonKind = (typeof CLOCK_LEDGER_REASON_VALUES)[number];

export const TURN_CLOCK_LEDGER_ENTRY_SCHEMA = z.object({
  clockReceiptId: z.string().min(1),
  campaignId: z.string().min(1),
  turnId: z.string().min(1),
  uiTurnOrdinal: z.number().int().nonnegative(),
  baseWorldVersion: z.number().int().nonnegative(),
  deltaMinutes: z.number().int().nonnegative(),
  reasonKind: z.enum(CLOCK_LEDGER_REASON_VALUES),
  sourceReceiptRef: z.string().min(1).nullable(),
  resultWorldTimeMinutes: z.number().int().nonnegative(),
  resultWorldVersion: z.number().int().nonnegative(),
});

export type TurnClockLedgerEntry = z.infer<typeof TURN_CLOCK_LEDGER_ENTRY_SCHEMA>;

export const NARRATION_CONTEXT_KIND_VALUES = [
  "selectable_fact",
  "citable_evidence",
  "support_context",
  "diagnostic_context",
  "private_context",
] as const;

export const NARRATION_FACT_SCHEMA = z.object({
  ref: z.string().min(1),
  kind: z.enum(NARRATION_CONTEXT_KIND_VALUES),
  text: z.string().min(1),
});

export type NarrationFact = z.infer<typeof NARRATION_FACT_SCHEMA>;

export function assertSelectableNarrationRefs(input: {
  facts: readonly NarrationFact[];
  selectedRefs: readonly string[];
}): void {
  const factsByRef = new Map(input.facts.map((fact) => [fact.ref, fact]));
  for (const selectedRef of input.selectedRefs) {
    const fact = factsByRef.get(selectedRef);
    if (!fact) {
      throw new Error(`Narration selected unknown fact ref: ${selectedRef}.`);
    }
    if (fact.kind !== "selectable_fact" && fact.kind !== "citable_evidence") {
      throw new Error(`Narration selected non-citable ref: ${selectedRef}.`);
    }
  }
}

export const GAMEPLAY_STATE_LANE_VALUES = [
  "known_route_movement",
  "new_place_reveal",
  "local_poi_creation",
  "dialogue_outcome",
  "durable_world_fact",
  "scene_local_event",
  "item_transfer",
  "item_creation",
  "condition_state",
  "entity_tag",
  "chronicle_entry",
  "relationship_change",
  "npc_belief_state",
  "npc_goal_state",
  "npc_identity_profile",
  "npc_capability_profile",
  "support_actor_creation",
  "actor_lifecycle",
  "transient_scene_lifecycle",
  "clock_delta",
  "quick_action_offer",
] as const;

export type GameplayStateLane = (typeof GAMEPLAY_STATE_LANE_VALUES)[number];

export type GameplayStateOwner =
  | RuntimeToolName
  | "entity_tag_service"
  | "transient_scene_lifecycle_service"
  | "turn_clock_ledger"
  | "quick_action_offer_service"
  | "npc_profile_authority_quarantine";

export type GameplayStateOwnerStatus =
  | "live"
  | "legacy_hidden"
  | "background_only"
  | "contract_only"
  | "quarantined";

export type GameplayStateBackingKind =
  | "runtime_state_effect"
  | "terminal_receipt"
  | "legacy_scene_beat"
  | "runtime_descriptor_role"
  | "time_ledger"
  | "deterministic_service_contract"
  | "service_contract"
  | "projection_contract"
  | "proposal_quarantine_contract";

export interface GameplayStateOwnerEntry {
  lane: GameplayStateLane;
  owner: GameplayStateOwner;
  status: GameplayStateOwnerStatus;
  sourceOfTruth: string;
  supportOnlySurfaces: readonly string[];
  modelAuthoredFields: readonly string[];
  runtimeValidators: readonly string[];
  receiptKind: string;
  acceptedReceiptKinds: readonly string[];
  rollbackPolicy: "receipt_replay" | "snapshot_restore" | "purge" | "rebuild";
  projectionPolicy: "public_fact" | "public_handle" | "support_only" | "hidden";
  projections: readonly string[];
  recoveryModes: readonly string[];
  tests: readonly string[];
  backing: {
    kind: GameplayStateBackingKind;
    refs: readonly string[];
  };
}

export interface GameplayStateServiceContract {
  owner: Exclude<GameplayStateOwner, RuntimeToolName>;
  sourceOfTruth: string;
  delegateTools: readonly RuntimeToolName[];
  stores: readonly Phase95RequiredStoreKey[];
  validators: readonly string[];
  receiptKinds: readonly string[];
  projections: readonly string[];
  recoveryModes: readonly string[];
  tests: readonly string[];
}

export const GAMEPLAY_STATE_OWNER_REGISTRY: readonly GameplayStateOwnerEntry[] = [
  {
    lane: "known_route_movement",
    owner: "move_actor",
    status: "live",
    sourceOfTruth: "Canonical actor location row plus accepted movement receipt.",
    supportOnlySurfaces: ["route candidate labels", "movement receipt summaries"],
    modelAuthoredFields: ["movement target alias", "movement intent prose"],
    runtimeValidators: ["route reachability validator", "actor write-scope validator", "world-version authority validator"],
    receiptKind: "movement_receipt",
    acceptedReceiptKinds: ["movement_receipt"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
    projections: ["narrator packet movement facts", "world/history projection"],
    recoveryModes: ["turn snapshot restore", "settled packet replay from accepted receipts"],
    tests: ["tool-executor-authority.test.ts", "narrator-packet.test.ts", "chat.test.ts"],
    backing: { kind: "runtime_state_effect", refs: ["movement"] },
  },
  {
    lane: "new_place_reveal",
    owner: "reveal_location",
    status: "live",
    sourceOfTruth: "Canonical location table and route/location reveal receipt.",
    supportOnlySurfaces: ["candidate location aliases", "world lore summaries"],
    modelAuthoredFields: ["location candidate alias", "reveal reason prose"],
    runtimeValidators: ["location candidate resolver", "reveal permission validator", "world-version authority validator"],
    receiptKind: "location_revealed",
    acceptedReceiptKinds: ["location_revealed"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
    projections: ["world projection", "narrator packet location facts"],
    recoveryModes: ["turn snapshot restore", "public projection rebuild"],
    tests: ["tool-contracts.test.ts", "tool-executor-authority.test.ts", "campaigns.test.ts"],
    backing: { kind: "runtime_state_effect", refs: ["location_revealed"] },
  },
  {
    lane: "local_poi_creation",
    owner: "create_minor_poi",
    status: "live",
    sourceOfTruth: "Canonical location minor-POI records and accepted POI creation receipt.",
    supportOnlySurfaces: ["POI candidate prose", "scene affordance summaries"],
    modelAuthoredFields: ["POI label", "POI description"],
    runtimeValidators: ["minor-POI schema", "location write-scope validator", "world-version authority validator"],
    receiptKind: "minor_poi_created",
    acceptedReceiptKinds: ["minor_poi_created"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
    projections: ["world projection", "narrator packet POI facts"],
    recoveryModes: ["turn snapshot restore", "public projection rebuild"],
    tests: ["tool-contracts.test.ts", "narrator-packet.test.ts"],
    backing: { kind: "runtime_state_effect", refs: ["minor_poi_created"] },
  },
  {
    lane: "dialogue_outcome",
    owner: "record_dialogue_outcome",
    status: "live",
    sourceOfTruth: "Accepted dialogue outcome receipt and dialogue state receipt ledger.",
    supportOnlySurfaces: ["dialogue prompt context", "NPC public labels"],
    modelAuthoredFields: ["spoken quote", "dialogue claim", "speaker/listener aliases"],
    runtimeValidators: ["dialogue outcome schema", "dialogue state receipt validator", "visible actor resolver"],
    receiptKind: "dialogue_outcome",
    acceptedReceiptKinds: ["dialogue_outcome", "dialogue_state_receipt"],
    rollbackPolicy: "receipt_replay",
    projectionPolicy: "public_fact",
    projections: ["narrator packet dialogue precision facts", "history projection"],
    recoveryModes: ["settled packet replay", "turn snapshot restore before accepted receipts"],
    tests: ["dialogue-state-receipt.test.ts", "narrator-packet.test.ts", "narration-grounding-guard.test.ts"],
    backing: { kind: "terminal_receipt", refs: ["record_dialogue_outcome:dialogue_outcome"] },
  },
  {
    lane: "durable_world_fact",
    owner: "record_world_fact",
    status: "live",
    sourceOfTruth: "Accepted world fact receipt and canonical world fact/event store.",
    supportOnlySurfaces: ["lore context", "world fact summaries"],
    modelAuthoredFields: ["fact text", "topic aliases", "durability"],
    runtimeValidators: ["world fact schema", "grounding/runtime requirement validator", "world-version authority validator"],
    receiptKind: "world_fact",
    acceptedReceiptKinds: ["world_fact"],
    rollbackPolicy: "receipt_replay",
    projectionPolicy: "public_fact",
    projections: ["narrator packet world facts", "history/world projection"],
    recoveryModes: ["receipt replay", "turn snapshot restore before accepted receipts"],
    tests: ["tool-contracts.test.ts", "narrator-packet.test.ts"],
    backing: { kind: "terminal_receipt", refs: ["record_world_fact:world_fact"] },
  },
  {
    lane: "scene_local_event",
    owner: "log_event",
    status: "legacy_hidden",
    sourceOfTruth: "Legacy accepted scene beat receipt while newer structural tools replace durable state writes.",
    supportOnlySurfaces: ["legacy scene beat summaries"],
    modelAuthoredFields: ["scene event prose"],
    runtimeValidators: ["hidden tool gate", "legacy scene beat contract", "source-boundary guard"],
    receiptKind: "legacy_scene_beat",
    acceptedReceiptKinds: ["legacy_scene_beat"],
    rollbackPolicy: "purge",
    projectionPolicy: "support_only",
    projections: ["support-only narrator packet context"],
    recoveryModes: ["purge unaccepted legacy beats", "turn snapshot restore"],
    tests: ["tool-contracts.test.ts", "narrator-packet.test.ts"],
    backing: { kind: "legacy_scene_beat", refs: ["log_event"] },
  },
  {
    lane: "item_transfer",
    owner: "transfer_item",
    status: "live",
    sourceOfTruth: "Canonical item ownership rows and accepted transfer receipt.",
    supportOnlySurfaces: ["inventory labels", "trade/give prose"],
    modelAuthoredFields: ["source alias", "target alias", "item alias", "transfer reason prose"],
    runtimeValidators: ["item ownership validator", "recipient resolver", "world-version authority validator"],
    receiptKind: "item_transfer",
    acceptedReceiptKinds: ["item_transfer"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
    projections: ["inventory projection", "narrator packet item transfer facts"],
    recoveryModes: ["turn snapshot restore", "inventory projection rebuild"],
    tests: ["tool-executor-authority.test.ts", "narrator-packet.test.ts", "campaigns.inventory-authority.test.ts"],
    backing: { kind: "runtime_state_effect", refs: ["item_transfer"] },
  },
  {
    lane: "item_creation",
    owner: "spawn_item",
    status: "live",
    sourceOfTruth: "Canonical item table plus accepted item creation receipt.",
    supportOnlySurfaces: ["item candidate prose", "inventory support context"],
    modelAuthoredFields: ["item label", "item description", "recipient alias"],
    runtimeValidators: ["item creation schema", "duplicate inventory guard", "world-version authority validator"],
    receiptKind: "item_created",
    acceptedReceiptKinds: ["item_created"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
    projections: ["inventory projection", "narrator packet item status facts"],
    recoveryModes: ["turn snapshot restore", "inventory projection rebuild"],
    tests: ["tool-contracts.test.ts", "narrator-packet.test.ts", "campaigns.inventory-authority.test.ts"],
    backing: { kind: "runtime_state_effect", refs: ["item_created"] },
  },
  {
    lane: "condition_state",
    owner: "set_condition",
    status: "live",
    sourceOfTruth: "Canonical actor condition/HP rows plus accepted condition receipt.",
    supportOnlySurfaces: ["condition summaries", "combat outcome prose"],
    modelAuthoredFields: ["condition target alias", "delta/reason prose"],
    runtimeValidators: ["condition schema", "actor write-scope validator", "world-version authority validator"],
    receiptKind: "condition_state",
    acceptedReceiptKinds: ["condition_state"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
    projections: ["narrator packet condition facts", "world/history projection"],
    recoveryModes: ["turn snapshot restore", "actor condition projection rebuild"],
    tests: ["tool-executor-authority.test.ts", "narrator-packet.test.ts"],
    backing: { kind: "runtime_state_effect", refs: ["actor_condition"] },
  },
  {
    lane: "entity_tag",
    owner: "entity_tag_service",
    status: "contract_only",
    sourceOfTruth: "Canonical entity tag tables across player, NPC, item, location, and faction scopes.",
    supportOnlySurfaces: ["tag-derived summaries", "classification context"],
    modelAuthoredFields: ["tag key/value proposal", "entity alias"],
    runtimeValidators: ["entity tag service scope validator", "tag schema", "actor/player write-scope guard"],
    receiptKind: "entity_tag_delta",
    acceptedReceiptKinds: ["entity_tag_delta"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
    projections: ["tag-derived public facts", "world/inventory/history projection"],
    recoveryModes: ["turn snapshot restore", "projection rebuild from canonical tag tables"],
    tests: ["gameplay-control-plane-contract.test.ts", "tool-executor-authority.test.ts"],
    backing: { kind: "service_contract", refs: ["entity_tag_service"] },
  },
  {
    lane: "chronicle_entry",
    owner: "add_chronicle_entry",
    status: "background_only",
    sourceOfTruth: "Accepted background chronicle receipt and chronicle/event store.",
    supportOnlySurfaces: ["chronicle summaries", "history support context"],
    modelAuthoredFields: ["chronicle text", "topic aliases"],
    runtimeValidators: ["hidden-in-player-turn gate", "chronicle schema", "world-version authority validator"],
    receiptKind: "chronicle_entry",
    acceptedReceiptKinds: ["chronicle_entry"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
    projections: ["history projection", "supporting narrator facts when explicitly accepted"],
    recoveryModes: ["turn snapshot restore", "history projection rebuild"],
    tests: ["gameplay-control-plane-contract.test.ts", "tool-contracts.test.ts"],
    backing: { kind: "runtime_state_effect", refs: ["chronicle_entry"] },
  },
  {
    lane: "relationship_change",
    owner: "set_relationship",
    status: "live",
    sourceOfTruth: "Canonical relationship rows plus accepted relationship change receipt.",
    supportOnlySurfaces: ["relationship summaries", "NPC context"],
    modelAuthoredFields: ["source actor alias", "target actor alias", "relationship delta prose"],
    runtimeValidators: ["relationship schema", "actor resolver", "world-version authority validator"],
    receiptKind: "relationship_change",
    acceptedReceiptKinds: ["relationship_change"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
    projections: ["relationship context", "narrator packet relationship facts"],
    recoveryModes: ["turn snapshot restore", "relationship projection rebuild"],
    tests: ["tool-executor-authority.test.ts", "narrator-packet.test.ts"],
    backing: { kind: "runtime_state_effect", refs: ["relationship_change"] },
  },
  {
    lane: "npc_belief_state",
    owner: "npc_profile_authority_quarantine",
    status: "quarantined",
    sourceOfTruth: "No direct belief mutation owner is live; reflection/offscreen belief updates are rejected as proposals until an authority-backed owner exists.",
    supportOnlySurfaces: ["reflection proposal text", "offscreen proposal summaries"],
    modelAuthoredFields: ["belief proposal"],
    runtimeValidators: ["reflection proposal-only guard", "legacy offscreen proposal-only guard", "simulation proposal executor allowlist"],
    receiptKind: "quarantined_proposal",
    acceptedReceiptKinds: ["proposal_rejected"],
    rollbackPolicy: "purge",
    projectionPolicy: "hidden",
    projections: ["no public projection from unaccepted belief proposals"],
    recoveryModes: ["drop quarantined proposal", "retain canonical NPC belief state"],
    tests: ["reflection-agent.test.ts", "npc-offscreen.test.ts", "simulation-proposal-lifecycle.test.ts"],
    backing: {
      kind: "proposal_quarantine_contract",
      refs: ["reflection-tools:set_belief", "npc-offscreen:goalProgress/belief", "simulation-proposal-executor allowlist"],
    },
  },
  {
    lane: "npc_goal_state",
    owner: "npc_profile_authority_quarantine",
    status: "quarantined",
    sourceOfTruth: "No direct goal mutation owner is live; reflection/offscreen goal updates are rejected as proposals until an authority-backed owner exists.",
    supportOnlySurfaces: ["reflection proposal text", "offscreen proposal summaries"],
    modelAuthoredFields: ["goal proposal", "goal progress proposal"],
    runtimeValidators: ["reflection proposal-only guard", "legacy offscreen proposal-only guard", "simulation proposal executor allowlist"],
    receiptKind: "quarantined_proposal",
    acceptedReceiptKinds: ["proposal_rejected"],
    rollbackPolicy: "purge",
    projectionPolicy: "hidden",
    projections: ["no public projection from unaccepted goal proposals"],
    recoveryModes: ["drop quarantined proposal", "retain canonical NPC goal state"],
    tests: ["reflection-agent.test.ts", "npc-agent.test.ts", "npc-offscreen.test.ts"],
    backing: {
      kind: "proposal_quarantine_contract",
      refs: ["reflection-tools:set_goal/drop_goal", "npc-tools:update_own_goal", "npc-offscreen:goalProgress"],
    },
  },
  {
    lane: "npc_identity_profile",
    owner: "npc_profile_authority_quarantine",
    status: "quarantined",
    sourceOfTruth: "No direct identity/personality mutation owner is live; model-authored identity changes are rejected as proposals until an authority-backed owner exists.",
    supportOnlySurfaces: ["reflection proposal text", "NPC prompt identity slice"],
    modelAuthoredFields: ["identity proposal", "personality proposal", "persona proposal"],
    runtimeValidators: ["reflection proposal-only guard", "legacy offscreen proposal-only guard", "public NPC projection private-field guard"],
    receiptKind: "quarantined_proposal",
    acceptedReceiptKinds: ["proposal_rejected"],
    rollbackPolicy: "purge",
    projectionPolicy: "hidden",
    projections: ["no public projection from unaccepted identity proposals"],
    recoveryModes: ["drop quarantined proposal", "retain canonical characterRecord/persona state"],
    tests: ["reflection-agent.test.ts", "npc-offscreen.test.ts", "gameplay-control-plane-contract.test.ts"],
    backing: {
      kind: "proposal_quarantine_contract",
      refs: ["reflection-tools:promote_identity_change", "npc-offscreen:characterRecord/persona", "public projection guard"],
    },
  },
  {
    lane: "npc_capability_profile",
    owner: "npc_profile_authority_quarantine",
    status: "quarantined",
    sourceOfTruth: "No direct wealth/skill mutation owner is live; model-authored capability changes are rejected as proposals until an authority-backed owner exists.",
    supportOnlySurfaces: ["reflection proposal text", "NPC prompt capability slice"],
    modelAuthoredFields: ["wealth proposal", "skill proposal", "capability proposal"],
    runtimeValidators: ["reflection proposal-only guard", "legacy offscreen proposal-only guard", "public NPC projection private-field guard"],
    receiptKind: "quarantined_proposal",
    acceptedReceiptKinds: ["proposal_rejected"],
    rollbackPolicy: "purge",
    projectionPolicy: "hidden",
    projections: ["no public projection from unaccepted wealth/skill proposals"],
    recoveryModes: ["drop quarantined proposal", "retain canonical NPC capability state"],
    tests: ["reflection-agent.test.ts", "npc-offscreen.test.ts", "gameplay-control-plane-contract.test.ts"],
    backing: {
      kind: "proposal_quarantine_contract",
      refs: ["reflection-tools:upgrade_wealth/upgrade_skill", "npc-offscreen:derivedTags/capabilities", "public projection guard"],
    },
  },
  {
    lane: "support_actor_creation",
    owner: "create_scene_extra",
    status: "live",
    sourceOfTruth: "Canonical support actor rows plus accepted scene-extra receipt.",
    supportOnlySurfaces: ["support actor labels", "encounter support context"],
    modelAuthoredFields: ["support actor label", "public description"],
    runtimeValidators: ["scene-extra schema", "same-turn visible creation guard", "world-version authority validator"],
    receiptKind: "support_actor_created",
    acceptedReceiptKinds: ["support_actor_created"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "support_only",
    projections: ["narrator packet support context", "world projection when promoted"],
    recoveryModes: ["turn snapshot restore", "support actor projection rebuild"],
    tests: ["narrator-packet.test.ts", "tool-contracts.test.ts"],
    backing: { kind: "runtime_state_effect", refs: ["support_actor_created"] },
  },
  {
    lane: "actor_lifecycle",
    owner: "promote_npc",
    status: "live",
    sourceOfTruth: "Canonical actor lifecycle rows and promotion trace.",
    supportOnlySurfaces: ["NPC promote labels", "review projection"],
    modelAuthoredFields: ["promotion target handle", "public actor label"],
    runtimeValidators: ["public handle resolver", "promotion permission validator", "world-version authority validator"],
    receiptKind: "actor_lifecycle",
    acceptedReceiptKinds: ["actor_lifecycle", "support_actor_created"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
    projections: ["world projection", "location_entities projection", "npc_promote response"],
    recoveryModes: ["turn snapshot restore", "public projection rebuild"],
    tests: ["campaigns.test.ts", "api.test.ts", "gameplay-control-plane-contract.test.ts"],
    backing: { kind: "runtime_descriptor_role", refs: ["promote_npc:state_mutation"] },
  },
  {
    lane: "transient_scene_lifecycle",
    owner: "transient_scene_lifecycle_service",
    status: "background_only",
    sourceOfTruth: "Ephemeral scene archival rows, temporary NPC retirement fields, and transient cleanup authority trace.",
    supportOnlySurfaces: ["post-turn cleanup summaries", "scene lifecycle diagnostics"],
    modelAuthoredFields: [],
    runtimeValidators: ["expired ephemeral scene predicate", "protected actor guard", "world-version authority validator"],
    receiptKind: "transient_scene_cleanup",
    acceptedReceiptKinds: ["transient_scene_cleanup"],
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "hidden",
    projections: ["world projection excludes archived scenes", "location_entities projection excludes retired temporary NPCs"],
    recoveryModes: ["turn snapshot restore", "projection rebuild from canonical scene/NPC rows"],
    tests: ["transient-scene-lifecycle.test.ts", "gameplay-control-plane-contract.test.ts"],
    backing: {
      kind: "deterministic_service_contract",
      refs: ["transient_scene_lifecycle_service", "transient_scene_cleanup"],
    },
  },
  {
    lane: "clock_delta",
    owner: "turn_clock_ledger",
    status: "live",
    sourceOfTruth: "Turn clock ledger entry plus canonical campaign world time.",
    supportOnlySurfaces: ["elapsed-time support summaries"],
    modelAuthoredFields: ["elapsed-time reason prose"],
    runtimeValidators: ["TURN_CLOCK_LEDGER_ENTRY_SCHEMA", "nonnegative delta validator", "turn authority lifecycle"],
    receiptKind: "clock_receipt",
    acceptedReceiptKinds: ["clock_receipt", "time_effect"],
    rollbackPolicy: "receipt_replay",
    projectionPolicy: "public_fact",
    projections: ["narrator packet elapsed-time facts", "history/time projection"],
    recoveryModes: ["receipt replay", "turn snapshot restore", "zero-time status ledger rebuild"],
    tests: ["gameplay-control-plane-contract.test.ts", "narrator-packet.test.ts"],
    backing: { kind: "time_ledger", refs: ["advance_time", "TURN_CLOCK_LEDGER_ENTRY_SCHEMA"] },
  },
  {
    lane: "quick_action_offer",
    owner: "quick_action_offer_service",
    status: "live",
    sourceOfTruth: "quick_action_offers rows plus accepted source receipt digest.",
    supportOnlySurfaces: ["quick action label", "quick action prose"],
    modelAuthoredFields: ["quick action label", "quick action prose"],
    runtimeValidators: ["offer handle schema", "source receipt digest validator", "expiry/consumed/world-version validator"],
    receiptKind: "quick_action_offer",
    acceptedReceiptKinds: ["quick_action_offer", "quick_action_consumption_trace"],
    rollbackPolicy: "purge",
    projectionPolicy: "public_handle",
    projections: ["SSE quick actions", "frontend action chips"],
    recoveryModes: ["purge unreceipted offers", "expire stale offers", "reject consumed offers"],
    tests: ["quick-action-offers.test.ts", "chat.test.ts", "quick-actions.test.tsx"],
    backing: { kind: "service_contract", refs: ["quick_action_offer_service", "offer_quick_actions"] },
  },
] as const;

export const GAMEPLAY_STATE_SERVICE_CONTRACTS: readonly GameplayStateServiceContract[] = [
  {
    owner: "entity_tag_service",
    sourceOfTruth: "Canonical tag columns on player, NPC, item, location, and faction rows.",
    delegateTools: ["add_tag", "remove_tag"],
    stores: ["sqlite:players", "sqlite:npcs", "sqlite:items", "sqlite:locations", "sqlite:factions"],
    validators: ["entity scope resolver", "tag schema", "write-scope guard"],
    receiptKinds: ["entity_tag_delta"],
    projections: ["tag-derived world/inventory/history facts"],
    recoveryModes: ["turn snapshot restore", "projection rebuild"],
    tests: ["gameplay-control-plane-contract.test.ts", "tool-executor-authority.test.ts"],
  },
  {
    owner: "turn_clock_ledger",
    sourceOfTruth: "Turn clock ledger rows and canonical campaign world time.",
    delegateTools: ["advance_time"],
    stores: ["sqlite:turn_clock_ledger", "sqlite:world_clocks"],
    validators: ["TURN_CLOCK_LEDGER_ENTRY_SCHEMA", "nonnegative delta validator"],
    receiptKinds: ["clock_receipt"],
    projections: ["narrator packet elapsed-time facts", "history/time projection"],
    recoveryModes: ["receipt replay", "turn snapshot restore"],
    tests: ["gameplay-control-plane-contract.test.ts", "narrator-packet.test.ts"],
  },
  {
    owner: "quick_action_offer_service",
    sourceOfTruth: "quick_action_offers rows plus accepted source receipt digest.",
    delegateTools: ["offer_quick_actions"],
    stores: ["sqlite:quick_action_offers"],
    validators: ["offer handle schema", "source digest validator", "expiry/consumed/world-version validator"],
    receiptKinds: ["quick_action_offer", "quick_action_consumption_trace"],
    projections: ["SSE quick actions", "frontend quick action chips"],
    recoveryModes: ["purge unreceipted offers", "expire stale offers", "reject consumed offers"],
    tests: ["quick-action-offers.test.ts", "chat.test.ts", "quick-actions.test.tsx"],
  },
  {
    owner: "transient_scene_lifecycle_service",
    sourceOfTruth: "Expired ephemeral scene rows plus temporary NPC location retirement fields.",
    delegateTools: [],
    stores: ["sqlite:locations", "sqlite:npcs", "sqlite:authority_traces"],
    validators: ["expired ephemeral scene predicate", "protected actor guard", "world-version authority validator"],
    receiptKinds: ["transient_scene_cleanup"],
    projections: ["world projection", "location_entities projection"],
    recoveryModes: ["turn snapshot restore", "projection rebuild"],
    tests: ["transient-scene-lifecycle.test.ts", "gameplay-control-plane-contract.test.ts"],
  },
] as const;

function assertNonEmptyStateOwnerArray(
  lane: GameplayStateLane,
  fieldName: keyof Pick<
    GameplayStateOwnerEntry,
    | "runtimeValidators"
    | "acceptedReceiptKinds"
    | "projections"
    | "recoveryModes"
    | "tests"
  >,
  values: readonly string[],
): void {
  if (values.length === 0) {
    throw new Error(`Gameplay state lane ${lane} has no ${fieldName}.`);
  }
  if (values.some((value) => value.trim().length === 0)) {
    throw new Error(`Gameplay state lane ${lane} has blank ${fieldName}.`);
  }
}

function assertRuntimeStateEffectBacking(input: {
  entry: GameplayStateOwnerEntry;
  descriptors: typeof RUNTIME_TOOL_DESCRIPTORS;
}): void {
  const [effectKind] = input.entry.backing.refs;
  if (!effectKind || !RUNTIME_TOOL_STATE_EFFECT_KINDS.includes(effectKind as RuntimeToolStateEffectKind)) {
    throw new Error(`Gameplay state lane ${input.entry.lane} has invalid runtime state effect backing.`);
  }
  const mappedLane = RUNTIME_EFFECT_KIND_STATE_LANES[effectKind as RuntimeToolStateEffectKind];
  if (mappedLane !== input.entry.lane) {
    throw new Error(
      `Gameplay state lane ${input.entry.lane} backing effect ${effectKind} maps to ${mappedLane ?? "nothing"}.`,
    );
  }
  const ownerTools = (Object.keys(input.descriptors) as RuntimeToolName[])
    .filter((toolName) =>
      (input.descriptors[toolName].stateEffects ?? [])
        .some((effect) => effect.effectKind === effectKind),
    );
  if (ownerTools.length === 0) {
    throw new Error(`Gameplay state lane ${input.entry.lane} has no descriptor owner tool.`);
  }
  if (!isRuntimeToolOwner(input.entry.owner)) {
    throw new Error(`Gameplay state lane ${input.entry.lane} service-owned lane cannot use runtime state effect backing.`);
  }
  if (isRuntimeToolOwner(input.entry.owner)) {
    const ownerDescriptor = input.descriptors[input.entry.owner];
    if (
      !(ownerDescriptor.stateEffects ?? [])
        .some((effect) => effect.effectKind === effectKind && effect.ownerKind === "canonical")
    ) {
      throw new Error(
        `Gameplay state lane ${input.entry.lane} owner ${input.entry.owner} is not canonical for ${effectKind}.`,
      );
    }
  }
}

function assertTerminalReceiptBacking(input: {
  entry: GameplayStateOwnerEntry;
  descriptors: typeof RUNTIME_TOOL_DESCRIPTORS;
}): void {
  if (!isRuntimeToolOwner(input.entry.owner)) {
    throw new Error(`Gameplay state lane ${input.entry.lane} terminal backing must use a runtime tool owner.`);
  }
  const descriptor = input.descriptors[input.entry.owner];
  if (descriptor.terminalKind !== input.entry.receiptKind) {
    throw new Error(
      `Gameplay state lane ${input.entry.lane} terminal backing ${input.entry.owner} does not match ${input.entry.receiptKind}.`,
    );
  }
}

function assertLegacySceneBeatBacking(input: {
  entry: GameplayStateOwnerEntry;
  descriptors: typeof RUNTIME_TOOL_DESCRIPTORS;
}): void {
  if (!isRuntimeToolOwner(input.entry.owner)) {
    throw new Error(`Gameplay state lane ${input.entry.lane} legacy backing must use a runtime tool owner.`);
  }
  if (!input.descriptors[input.entry.owner].roles.includes("legacy_scene_beat")) {
    throw new Error(`Gameplay state lane ${input.entry.lane} owner ${input.entry.owner} is not a legacy scene beat.`);
  }
  if (input.entry.projectionPolicy !== "support_only" || input.entry.rollbackPolicy !== "purge") {
    throw new Error(`Gameplay state lane ${input.entry.lane} legacy scene beats must be support-only and purgeable.`);
  }
}

function assertRuntimeDescriptorRoleBacking(input: {
  entry: GameplayStateOwnerEntry;
  descriptors: typeof RUNTIME_TOOL_DESCRIPTORS;
}): void {
  if (!isRuntimeToolOwner(input.entry.owner)) {
    throw new Error(`Gameplay state lane ${input.entry.lane} descriptor-role backing must use a runtime tool owner.`);
  }
  if (!input.descriptors[input.entry.owner].roles.includes("state_mutation")) {
    throw new Error(`Gameplay state lane ${input.entry.lane} owner ${input.entry.owner} is not a state mutation tool.`);
  }
}

function assertServiceContractBacking(input: {
  entry: GameplayStateOwnerEntry;
  contracts: readonly GameplayStateServiceContract[];
  descriptors: typeof RUNTIME_TOOL_DESCRIPTORS;
}): void {
  if (isRuntimeToolOwner(input.entry.owner)) {
    throw new Error(`Gameplay state lane ${input.entry.lane} service backing cannot use runtime tool owner.`);
  }
  const contract = input.contracts.find((candidate) => candidate.owner === input.entry.owner);
  if (!contract) {
    throw new Error(`Gameplay state lane ${input.entry.lane} missing service contract for ${input.entry.owner}.`);
  }
  for (const field of [
    ["delegateTools", contract.delegateTools],
    ["stores", contract.stores],
    ["validators", contract.validators],
    ["receiptKinds", contract.receiptKinds],
    ["projections", contract.projections],
    ["recoveryModes", contract.recoveryModes],
    ["tests", contract.tests],
  ] as const) {
    if (field[1].length === 0) {
      throw new Error(`Gameplay state lane ${input.entry.lane} service contract has no ${field[0]}.`);
    }
  }
  for (const store of contract.stores) {
    if (!PHASE95_REQUIRED_STORE_KEYS.includes(store as typeof PHASE95_REQUIRED_STORE_KEYS[number])) {
      throw new Error(
        `Gameplay state lane ${input.entry.lane} service contract references non-manifest store ${store}.`,
      );
    }
  }
  if (!contract.receiptKinds.includes(input.entry.receiptKind)) {
    throw new Error(
      `Gameplay state lane ${input.entry.lane} service contract does not include receipt ${input.entry.receiptKind}.`,
    );
  }
  for (const receiptKind of contract.receiptKinds) {
    if (!input.entry.acceptedReceiptKinds.includes(receiptKind)) {
      throw new Error(
        `Gameplay state lane ${input.entry.lane} service contract receipt ${receiptKind} is not accepted by the lane.`,
      );
    }
  }
  for (const toolName of contract.delegateTools) {
    if (!Object.hasOwn(input.descriptors, toolName)) {
      throw new Error(
        `Gameplay state lane ${input.entry.lane} service contract references unknown delegate tool ${toolName}.`,
      );
    }
  }

  if (input.entry.backing.kind === "time_ledger") {
    for (const toolName of contract.delegateTools) {
      if (!input.descriptors[toolName].roles.includes("time_effect")) {
        throw new Error(
          `Gameplay state lane ${input.entry.lane} delegate tool ${toolName} is not a time-effect delegate.`,
        );
      }
    }
    return;
  }

  const effectKind = (Object.entries(RUNTIME_EFFECT_KIND_STATE_LANES) as Array<[
    RuntimeToolStateEffectKind,
    GameplayStateLane,
  ]>).find(([, lane]) => lane === input.entry.lane)?.[0];
  if (!effectKind) {
    throw new Error(`Gameplay state lane ${input.entry.lane} service contract has no runtime effect mapping.`);
  }
  const allowedCanonicalServiceTool = SERVICE_OWNER_CANONICAL_TOOL_ALLOWLIST[input.entry.owner];
  if (allowedCanonicalServiceTool) {
    if (!contract.delegateTools.includes(allowedCanonicalServiceTool)) {
      throw new Error(
        `Gameplay state lane ${input.entry.lane} service contract is missing canonical service tool ${allowedCanonicalServiceTool}.`,
      );
    }
    const descriptor = input.descriptors[allowedCanonicalServiceTool];
    if (
      !(descriptor.stateEffects ?? [])
        .some((effect) => effect.effectKind === effectKind && effect.ownerKind === "canonical")
    ) {
      throw new Error(
        `Gameplay state lane ${input.entry.lane} canonical service tool ${allowedCanonicalServiceTool} does not own ${effectKind}.`,
      );
    }
    for (const toolName of contract.delegateTools) {
      if (toolName === allowedCanonicalServiceTool) continue;
      const hasDelegateEffect = (input.descriptors[toolName].stateEffects ?? [])
        .some((effect) => effect.effectKind === effectKind && effect.ownerKind === "delegate");
      if (!hasDelegateEffect) {
        throw new Error(
          `Gameplay state lane ${input.entry.lane} delegate tool ${toolName} does not delegate ${effectKind}.`,
        );
      }
    }
    return;
  }

  for (const toolName of contract.delegateTools) {
    const descriptor = input.descriptors[toolName];
    const hasDelegateEffect = (descriptor.stateEffects ?? [])
      .some((effect) => effect.effectKind === effectKind && effect.ownerKind === "delegate");
    if (!hasDelegateEffect) {
      throw new Error(
        `Gameplay state lane ${input.entry.lane} delegate tool ${toolName} does not delegate ${effectKind}.`,
      );
    }
  }
}

function assertDeterministicServiceContractBacking(input: {
  entry: GameplayStateOwnerEntry;
  contracts: readonly GameplayStateServiceContract[];
}): void {
  if (isRuntimeToolOwner(input.entry.owner)) {
    throw new Error(`Gameplay state lane ${input.entry.lane} deterministic service cannot use runtime tool owner.`);
  }
  const contract = input.contracts.find((candidate) => candidate.owner === input.entry.owner);
  if (!contract) {
    throw new Error(`Gameplay state lane ${input.entry.lane} missing deterministic service contract for ${input.entry.owner}.`);
  }
  for (const field of [
    ["stores", contract.stores],
    ["validators", contract.validators],
    ["receiptKinds", contract.receiptKinds],
    ["projections", contract.projections],
    ["recoveryModes", contract.recoveryModes],
    ["tests", contract.tests],
  ] as const) {
    if (field[1].length === 0) {
      throw new Error(`Gameplay state lane ${input.entry.lane} deterministic service contract has no ${field[0]}.`);
    }
  }
  for (const store of contract.stores) {
    if (!PHASE95_REQUIRED_STORE_KEYS.includes(store as typeof PHASE95_REQUIRED_STORE_KEYS[number])) {
      throw new Error(
        `Gameplay state lane ${input.entry.lane} deterministic service contract references non-manifest store ${store}.`,
      );
    }
  }
  if (!contract.receiptKinds.includes(input.entry.receiptKind)) {
    throw new Error(
      `Gameplay state lane ${input.entry.lane} deterministic service contract does not include receipt ${input.entry.receiptKind}.`,
    );
  }
}

function assertProposalQuarantineBacking(entry: GameplayStateOwnerEntry): void {
  if (entry.owner !== "npc_profile_authority_quarantine") {
    throw new Error(`Gameplay state lane ${entry.lane} quarantine backing has invalid owner ${entry.owner}.`);
  }
  if (entry.status !== "quarantined") {
    throw new Error(`Gameplay state lane ${entry.lane} quarantine backing must be quarantined.`);
  }
  if (entry.receiptKind !== "quarantined_proposal" || !entry.acceptedReceiptKinds.includes("proposal_rejected")) {
    throw new Error(`Gameplay state lane ${entry.lane} quarantine backing must reject proposals.`);
  }
  if (entry.projectionPolicy !== "hidden" || entry.rollbackPolicy !== "purge") {
    throw new Error(`Gameplay state lane ${entry.lane} quarantine backing must be hidden and purgeable.`);
  }
}

function assertStateOwnerBacking(input: {
  entry: GameplayStateOwnerEntry;
  descriptors: typeof RUNTIME_TOOL_DESCRIPTORS;
  serviceContracts: readonly GameplayStateServiceContract[];
}): void {
  if (input.entry.backing.refs.length === 0) {
    throw new Error(`Gameplay state lane ${input.entry.lane} has no backing refs.`);
  }
  switch (input.entry.backing.kind) {
    case "runtime_state_effect":
      assertRuntimeStateEffectBacking({ entry: input.entry, descriptors: input.descriptors });
      return;
    case "terminal_receipt":
      assertTerminalReceiptBacking({ entry: input.entry, descriptors: input.descriptors });
      return;
    case "legacy_scene_beat":
      assertLegacySceneBeatBacking({ entry: input.entry, descriptors: input.descriptors });
      return;
    case "runtime_descriptor_role":
      assertRuntimeDescriptorRoleBacking({ entry: input.entry, descriptors: input.descriptors });
      return;
    case "time_ledger":
      if (input.entry.owner !== "turn_clock_ledger" || input.entry.receiptKind !== "clock_receipt") {
        throw new Error(`Gameplay state lane ${input.entry.lane} has invalid time ledger backing.`);
      }
      assertServiceContractBacking({
        entry: input.entry,
        contracts: input.serviceContracts,
        descriptors: input.descriptors,
      });
      return;
    case "deterministic_service_contract":
      assertDeterministicServiceContractBacking({
        entry: input.entry,
        contracts: input.serviceContracts,
      });
      return;
    case "service_contract":
      assertServiceContractBacking({
        entry: input.entry,
        contracts: input.serviceContracts,
        descriptors: input.descriptors,
      });
      return;
    case "projection_contract":
      return;
    case "proposal_quarantine_contract":
      assertProposalQuarantineBacking(input.entry);
      return;
    default: {
      const unreachable: never = input.entry.backing.kind;
      throw new Error(`Unsupported gameplay state backing: ${unreachable}`);
    }
  }
}

export function assertStateOwnerRegistry(
  registry: readonly GameplayStateOwnerEntry[] = GAMEPLAY_STATE_OWNER_REGISTRY,
  serviceContracts: readonly GameplayStateServiceContract[] = GAMEPLAY_STATE_SERVICE_CONTRACTS,
  descriptors: typeof RUNTIME_TOOL_DESCRIPTORS = RUNTIME_TOOL_DESCRIPTORS,
): GameplayStateOwnerEntry[] {
  const lanes = new Set<GameplayStateLane>();
  for (const entry of registry) {
    if (lanes.has(entry.lane)) {
      throw new Error(`Duplicate state owner lane: ${entry.lane}.`);
    }
    if (entry.sourceOfTruth.trim().length === 0) {
      throw new Error(`Gameplay state lane ${entry.lane} has no sourceOfTruth.`);
    }
    if (entry.receiptKind.trim().length === 0) {
      throw new Error(`Gameplay state lane ${entry.lane} has no receiptKind.`);
    }
    assertNonEmptyStateOwnerArray(entry.lane, "runtimeValidators", entry.runtimeValidators);
    assertNonEmptyStateOwnerArray(entry.lane, "acceptedReceiptKinds", entry.acceptedReceiptKinds);
    assertNonEmptyStateOwnerArray(entry.lane, "projections", entry.projections);
    assertNonEmptyStateOwnerArray(entry.lane, "recoveryModes", entry.recoveryModes);
    assertNonEmptyStateOwnerArray(entry.lane, "tests", entry.tests);
    assertStateOwnerBacking({
      entry,
      descriptors,
      serviceContracts,
    });
    lanes.add(entry.lane);
  }
  for (const lane of GAMEPLAY_STATE_LANE_VALUES) {
    if (!lanes.has(lane)) {
      throw new Error(`Missing state owner lane: ${lane}.`);
    }
  }
  return [...registry];
}

export const RUNTIME_EFFECT_KIND_STATE_LANES: Record<
  RuntimeToolStateEffectKind,
  GameplayStateLane
> = {
  movement: "known_route_movement",
  item_transfer: "item_transfer",
  item_created: "item_creation",
  actor_condition: "condition_state",
  relationship_change: "relationship_change",
  entity_tag: "entity_tag",
  support_actor_created: "support_actor_creation",
  location_revealed: "new_place_reveal",
  minor_poi_created: "local_poi_creation",
  chronicle_entry: "chronicle_entry",
  quick_action_offer: "quick_action_offer",
};

export function runtimeDescriptorCanonicalOwnersByEffectKind(
  descriptors: typeof RUNTIME_TOOL_DESCRIPTORS = RUNTIME_TOOL_DESCRIPTORS,
): Partial<Record<
  RuntimeToolStateEffectKind,
  RuntimeToolName[]
>> {
  const result: Partial<Record<RuntimeToolStateEffectKind, RuntimeToolName[]>> = {};
  for (const [toolName, descriptor] of Object.entries(descriptors) as [
    RuntimeToolName,
    typeof RUNTIME_TOOL_DESCRIPTORS[RuntimeToolName],
  ][]) {
    for (const effect of descriptor.stateEffects ?? []) {
      if (effect.ownerKind !== "canonical") continue;
      result[effect.effectKind] ??= [];
      result[effect.effectKind]?.push(toolName);
    }
  }
  return result;
}

function isRuntimeToolOwner(owner: GameplayStateOwner): owner is RuntimeToolName {
  return Object.hasOwn(RUNTIME_TOOL_DESCRIPTORS, owner);
}

const SERVICE_OWNER_CANONICAL_TOOL_ALLOWLIST: Partial<Record<GameplayStateOwner, RuntimeToolName>> = {
  quick_action_offer_service: "offer_quick_actions",
};

export interface RuntimeEffectStateOwnerParityEntry {
  effectKind: RuntimeToolStateEffectKind;
  lane: GameplayStateLane;
  owner: GameplayStateOwner;
  ownerTools: readonly RuntimeToolName[];
}

export function assertRuntimeEffectStateOwnerParity(input: {
  registry?: readonly GameplayStateOwnerEntry[];
  descriptors?: typeof RUNTIME_TOOL_DESCRIPTORS;
  effectKindStateLanes?: Partial<Record<RuntimeToolStateEffectKind, GameplayStateLane>>;
} = {}): RuntimeEffectStateOwnerParityEntry[] {
  const descriptors = input.descriptors ?? RUNTIME_TOOL_DESCRIPTORS;
  const registry = assertStateOwnerRegistry(
    input.registry ?? GAMEPLAY_STATE_OWNER_REGISTRY,
    GAMEPLAY_STATE_SERVICE_CONTRACTS,
    descriptors,
  );
  const lanesByEffectKind = input.effectKindStateLanes ?? RUNTIME_EFFECT_KIND_STATE_LANES;
  const registryByLane = new Map(registry.map((entry) => [entry.lane, entry]));
  const canonicalOwnersByEffectKind = runtimeDescriptorCanonicalOwnersByEffectKind(descriptors);
  const result: RuntimeEffectStateOwnerParityEntry[] = [];

  for (const effectKind of RUNTIME_TOOL_STATE_EFFECT_KINDS) {
    const lane = lanesByEffectKind[effectKind];
    if (!lane) {
      throw new Error(`Missing runtime effect state lane: ${effectKind}.`);
    }

    const registryEntry = registryByLane.get(lane);
    if (!registryEntry) {
      throw new Error(`Runtime effect ${effectKind} maps to missing state owner lane: ${lane}.`);
    }

    const ownerTools = (Object.keys(descriptors) as RuntimeToolName[])
      .filter((toolName) =>
        (descriptors[toolName].stateEffects ?? [])
          .some((effect) => effect.effectKind === effectKind),
      );
    if (ownerTools.length === 0) {
      throw new Error(`Runtime effect ${effectKind} has no descriptor owner tool.`);
    }

    const canonicalOwners = canonicalOwnersByEffectKind[effectKind] ?? [];
    if (isRuntimeToolOwner(registryEntry.owner)) {
      if (!canonicalOwners.includes(registryEntry.owner)) {
        throw new Error(
          `Runtime effect ${effectKind} lane ${lane} owner ${registryEntry.owner} is not the canonical descriptor owner.`,
        );
      }
      const extraCanonicalOwners = canonicalOwners.filter((toolName) => toolName !== registryEntry.owner);
      if (extraCanonicalOwners.length > 0) {
        throw new Error(
          `Runtime effect ${effectKind} has multiple canonical owners: ${canonicalOwners.join(", ")}.`,
        );
      }
    } else {
      const allowedCanonicalServiceTool = SERVICE_OWNER_CANONICAL_TOOL_ALLOWLIST[registryEntry.owner];
      if (
        allowedCanonicalServiceTool
        && canonicalOwners.length === 1
        && canonicalOwners[0] === allowedCanonicalServiceTool
      ) {
        result.push({
          effectKind,
          lane,
          owner: registryEntry.owner,
          ownerTools,
        });
        continue;
      }
      if (canonicalOwners.length > 0) {
        throw new Error(
          `Service-owned runtime effect ${effectKind} cannot also expose canonical tool owners: ${canonicalOwners.join(", ")}.`,
        );
      }
      const delegateTools = ownerTools.filter((toolName) =>
        (descriptors[toolName].stateEffects ?? [])
          .some((effect) => effect.effectKind === effectKind && effect.ownerKind === "delegate"),
      );
      if (delegateTools.length === 0) {
        throw new Error(`Service-owned runtime effect ${effectKind} has no delegate tools.`);
      }
    }

    result.push({
      effectKind,
      lane,
      owner: registryEntry.owner,
      ownerTools,
    });
  }

  return result;
}
