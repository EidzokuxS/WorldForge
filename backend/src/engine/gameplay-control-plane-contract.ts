import { z } from "zod";
import {
  RUNTIME_TOOL_DESCRIPTORS,
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
  idempotencyKey: string;
  writeScope: "none" | "lease" | "snapshot" | "staged_effects" | "authority" | "packet" | "narration" | "projection" | "final";
  recoveryMode: "retry" | "resume" | "rollback" | "rebuild" | "terminal";
  vectorPolicy: "none" | "staged" | "rebuild_from_receipts" | "purge";
}

export const TURN_AUTHORITY_STAGE_CONTRACTS: readonly TurnAuthorityStageContract[] = [
  {
    stage: "intent_created",
    idempotencyKey: "campaign_id:turn_id:action_id",
    writeScope: "none",
    recoveryMode: "retry",
    vectorPolicy: "none",
  },
  {
    stage: "lease_acquired",
    idempotencyKey: "turn_saga_id:lease_token",
    writeScope: "lease",
    recoveryMode: "resume",
    vectorPolicy: "none",
  },
  {
    stage: "snapshot_taken",
    idempotencyKey: "turn_saga_id:snapshot_id",
    writeScope: "snapshot",
    recoveryMode: "rollback",
    vectorPolicy: "none",
  },
  {
    stage: "effects_staged",
    idempotencyKey: "turn_saga_id:effect_batch_id",
    writeScope: "staged_effects",
    recoveryMode: "rollback",
    vectorPolicy: "staged",
  },
  {
    stage: "receipts_accepted",
    idempotencyKey: "turn_saga_id:receipt_batch_id",
    writeScope: "authority",
    recoveryMode: "resume",
    vectorPolicy: "rebuild_from_receipts",
  },
  {
    stage: "canonical_state_committed",
    idempotencyKey: "turn_saga_id:world_version",
    writeScope: "authority",
    recoveryMode: "resume",
    vectorPolicy: "rebuild_from_receipts",
  },
  {
    stage: "settled_packet_persisted",
    idempotencyKey: "turn_saga_id:settled_packet_id",
    writeScope: "packet",
    recoveryMode: "resume",
    vectorPolicy: "rebuild_from_receipts",
  },
  {
    stage: "narration_accepted",
    idempotencyKey: "turn_saga_id:narrator_attempt_id",
    writeScope: "narration",
    recoveryMode: "resume",
    vectorPolicy: "rebuild_from_receipts",
  },
  {
    stage: "public_projection_committed",
    idempotencyKey: "turn_saga_id:projection_digest",
    writeScope: "projection",
    recoveryMode: "rebuild",
    vectorPolicy: "rebuild_from_receipts",
  },
  {
    stage: "turn_finalized",
    idempotencyKey: "turn_saga_id:final_status",
    writeScope: "final",
    recoveryMode: "terminal",
    vectorPolicy: "rebuild_from_receipts",
  },
] as const;

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

export const STORE_REPLAY_POLICY_VALUES = [
  "deterministic",
  "recorded_reuse",
  "regenerate",
  "reject",
] as const;

export const SOURCE_CAMPAIGN_ID_POLICY_VALUES = [
  "not_applicable",
  "rewrite",
  "purge",
  "reject_if_present",
] as const;

export const STORE_MANIFEST_ENTRY_SCHEMA = z.object({
  store: z.string().min(1),
  authorityLevel: z.enum(STORE_AUTHORITY_LEVEL_VALUES),
  clonePolicy: z.enum(STORE_POLICY_VALUES),
  rollbackPolicy: z.enum(STORE_POLICY_VALUES),
  replayPolicy: z.enum(STORE_REPLAY_POLICY_VALUES),
  sourceCampaignIdPolicy: z.enum(SOURCE_CAMPAIGN_ID_POLICY_VALUES),
  requiresHash: z.boolean(),
  requiresRowCount: z.boolean(),
});

export type StoreManifestEntry = z.infer<typeof STORE_MANIFEST_ENTRY_SCHEMA>;

export const PHASE95_REQUIRED_STORE_KEYS = [
  "sqlite:campaigns",
  "sqlite:turn_sagas",
  "sqlite:settled_turn_packets",
  "sqlite:narrator_attempts",
  "sqlite:quick_action_offers",
  "sqlite:world_clocks",
  "json:config",
  "json:chat_history",
  "vectors:episodic_events",
  "artifact:checkpoints",
  "projection:public_dtos",
  "evidence:playtest_reports",
] as const;

export const PHASE95_STORE_MANIFEST: readonly StoreManifestEntry[] = [
  {
    store: "sqlite:campaigns",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "preserve",
    replayPolicy: "deterministic",
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
    store: "sqlite:quick_action_offers",
    authorityLevel: "authoritative",
    clonePolicy: "purge",
    rollbackPolicy: "purge",
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
    store: "json:config",
    authorityLevel: "authoritative",
    clonePolicy: "rewrite",
    rollbackPolicy: "preserve",
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
] as const;

export function assertStoreManifestCoverage(
  manifest: readonly StoreManifestEntry[] = PHASE95_STORE_MANIFEST,
): StoreManifestEntry[] {
  const parsed = z.array(STORE_MANIFEST_ENTRY_SCHEMA).parse(manifest);
  const stores = new Set<string>();
  for (const entry of parsed) {
    if (stores.has(entry.store)) {
      throw new Error(`Duplicate store manifest entry: ${entry.store}.`);
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

const BACKEND_REF_BOUNDARY_PATTERN =
  /\b(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?:actor|location|route|item|tool-result|authority|saga|turn-saga|settled-packet):[A-Za-z0-9_.:-]+)\b/i;

export function assertNoBackendRefsInPublicValue(value: unknown, path = "$"): void {
  if (typeof value === "string") {
    if (BACKEND_REF_BOUNDARY_PATTERN.test(value)) {
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
      if (BACKEND_REF_BOUNDARY_PATTERN.test(key)) {
        throw new Error(`Backend ref key crossed public boundary at ${path}.${key}.`);
      }
      assertNoBackendRefsInPublicValue(nested, `${path}.${key}`);
    }
  }
}

export const PUBLIC_PROJECTION_SURFACE_VALUES = [
  "sse",
  "world",
  "history",
  "location_entities",
  "quick_actions",
  "inventory",
  "frontend_state",
] as const;

export const PUBLIC_PROJECTION_SURFACE_SCHEMA = z.enum(PUBLIC_PROJECTION_SURFACE_VALUES);

export function assertPublicProjectionPayload(input: {
  surface: string;
  payload: unknown;
}): void {
  PUBLIC_PROJECTION_SURFACE_SCHEMA.parse(input.surface);
  assertNoBackendRefsInPublicValue(input.payload);
}

export const CLOCK_LEDGER_REASON_VALUES = [
  "zero_time_status",
  "wait",
  "travel",
  "tool_time_effect",
  "due_world_elapsed",
  "replay_restore",
] as const;

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
  "relationship_change",
  "support_actor_creation",
  "actor_lifecycle",
  "clock_delta",
  "quick_action_offer",
] as const;

export type GameplayStateLane = (typeof GAMEPLAY_STATE_LANE_VALUES)[number];

export type GameplayStateOwner =
  | RuntimeToolName
  | "entity_tag_service"
  | "turn_clock_ledger"
  | "quick_action_offer_service";

export interface GameplayStateOwnerEntry {
  lane: GameplayStateLane;
  owner: GameplayStateOwner;
  status: "live" | "legacy_hidden" | "contract_only";
  receiptKind: string;
  rollbackPolicy: "receipt_replay" | "snapshot_restore" | "purge" | "rebuild";
  projectionPolicy: "public_fact" | "public_handle" | "support_only" | "hidden";
}

export const GAMEPLAY_STATE_OWNER_REGISTRY: readonly GameplayStateOwnerEntry[] = [
  {
    lane: "known_route_movement",
    owner: "move_actor",
    status: "live",
    receiptKind: "movement_receipt",
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
  },
  {
    lane: "new_place_reveal",
    owner: "reveal_location",
    status: "live",
    receiptKind: "location_revealed",
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
  },
  {
    lane: "local_poi_creation",
    owner: "create_minor_poi",
    status: "live",
    receiptKind: "minor_poi_created",
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
  },
  {
    lane: "dialogue_outcome",
    owner: "record_dialogue_outcome",
    status: "live",
    receiptKind: "dialogue_outcome",
    rollbackPolicy: "receipt_replay",
    projectionPolicy: "public_fact",
  },
  {
    lane: "durable_world_fact",
    owner: "record_world_fact",
    status: "live",
    receiptKind: "world_fact",
    rollbackPolicy: "receipt_replay",
    projectionPolicy: "public_fact",
  },
  {
    lane: "scene_local_event",
    owner: "log_event",
    status: "legacy_hidden",
    receiptKind: "legacy_scene_beat",
    rollbackPolicy: "purge",
    projectionPolicy: "support_only",
  },
  {
    lane: "item_transfer",
    owner: "transfer_item",
    status: "live",
    receiptKind: "item_transfer",
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
  },
  {
    lane: "item_creation",
    owner: "spawn_item",
    status: "live",
    receiptKind: "item_created",
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
  },
  {
    lane: "condition_state",
    owner: "set_condition",
    status: "live",
    receiptKind: "condition_state",
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
  },
  {
    lane: "entity_tag",
    owner: "entity_tag_service",
    status: "contract_only",
    receiptKind: "entity_tag_delta",
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
  },
  {
    lane: "relationship_change",
    owner: "set_relationship",
    status: "live",
    receiptKind: "relationship_change",
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
  },
  {
    lane: "support_actor_creation",
    owner: "create_scene_extra",
    status: "live",
    receiptKind: "support_actor_created",
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "support_only",
  },
  {
    lane: "actor_lifecycle",
    owner: "promote_npc",
    status: "live",
    receiptKind: "actor_lifecycle",
    rollbackPolicy: "snapshot_restore",
    projectionPolicy: "public_fact",
  },
  {
    lane: "clock_delta",
    owner: "turn_clock_ledger",
    status: "contract_only",
    receiptKind: "clock_receipt",
    rollbackPolicy: "receipt_replay",
    projectionPolicy: "public_fact",
  },
  {
    lane: "quick_action_offer",
    owner: "quick_action_offer_service",
    status: "contract_only",
    receiptKind: "quick_action_offer",
    rollbackPolicy: "purge",
    projectionPolicy: "public_handle",
  },
] as const;

export function assertStateOwnerRegistry(
  registry: readonly GameplayStateOwnerEntry[] = GAMEPLAY_STATE_OWNER_REGISTRY,
): GameplayStateOwnerEntry[] {
  const lanes = new Set<GameplayStateLane>();
  for (const entry of registry) {
    if (lanes.has(entry.lane)) {
      throw new Error(`Duplicate state owner lane: ${entry.lane}.`);
    }
    lanes.add(entry.lane);
  }
  for (const lane of GAMEPLAY_STATE_LANE_VALUES) {
    if (!lanes.has(lane)) {
      throw new Error(`Missing state owner lane: ${lane}.`);
    }
  }
  return [...registry];
}

export function runtimeDescriptorCanonicalOwnersByEffectKind(): Partial<Record<
  RuntimeToolStateEffectKind,
  RuntimeToolName[]
>> {
  const result: Partial<Record<RuntimeToolStateEffectKind, RuntimeToolName[]>> = {};
  for (const [toolName, descriptor] of Object.entries(RUNTIME_TOOL_DESCRIPTORS) as [
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
