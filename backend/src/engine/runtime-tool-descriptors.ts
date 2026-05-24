import type { RuntimeToolName } from "./runtime-tool-input-schemas.js";

export const RUNTIME_TOOL_STATE_EFFECT_KINDS = [
  "movement",
  "item_transfer",
  "item_created",
  "actor_condition",
  "relationship_change",
  "entity_tag",
  "support_actor_created",
  "location_revealed",
  "minor_poi_created",
  "chronicle_entry",
  "quick_action_offer",
] as const;

export type RuntimeToolStateEffectKind =
  (typeof RUNTIME_TOOL_STATE_EFFECT_KINDS)[number];

export type RuntimeToolRole =
  | "helper_observation"
  | "terminal_receipt"
  | "state_mutation"
  | "side_effect"
  | "intent_marker"
  | "time_effect"
  | "authority_bounds"
  | "legacy_scene_beat"
  | "ui_suggestion"
  | "public_handle_authority";

export type RuntimeToolEffectOwnerKind =
  | "canonical"
  | "delegate"
  | "legacy"
  | "preparatory";

export interface RuntimeToolEffectDescriptor {
  effectKind: RuntimeToolStateEffectKind;
  ownerKind: RuntimeToolEffectOwnerKind;
  preparatoryFor?: RuntimeToolStateEffectKind;
}

export interface RuntimeToolDescriptor {
  toolName: RuntimeToolName;
  roles: readonly RuntimeToolRole[];
  terminalKind?: "dialogue_outcome" | "world_fact";
  stateEffects?: readonly RuntimeToolEffectDescriptor[];
  hiddenInPlayerTurn?: boolean;
  suppressInPlayerTurnWhenPresent?: readonly RuntimeToolName[];
}

export const RUNTIME_TOOL_DESCRIPTORS: Record<RuntimeToolName, RuntimeToolDescriptor> = {
  list_visible_affordances: {
    toolName: "list_visible_affordances",
    roles: ["helper_observation"],
  },
  list_navigation_options: {
    toolName: "list_navigation_options",
    roles: ["helper_observation"],
  },
  find_location_candidates: {
    toolName: "find_location_candidates",
    roles: ["helper_observation"],
  },
  find_object_candidates: {
    toolName: "find_object_candidates",
    roles: ["helper_observation"],
  },
  find_actor_candidates: {
    toolName: "find_actor_candidates",
    roles: ["helper_observation"],
  },
  find_poi_candidates: {
    toolName: "find_poi_candidates",
    roles: ["helper_observation"],
  },
  inspect_known_fact: {
    toolName: "inspect_known_fact",
    roles: ["helper_observation"],
  },
  check_route: {
    toolName: "check_route",
    roles: ["helper_observation"],
  },
  record_dialogue_outcome: {
    toolName: "record_dialogue_outcome",
    roles: ["terminal_receipt", "state_mutation"],
    terminalKind: "dialogue_outcome",
  },
  record_world_fact: {
    toolName: "record_world_fact",
    roles: ["terminal_receipt", "state_mutation"],
    terminalKind: "world_fact",
  },
  add_tag: {
    toolName: "add_tag",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "entity_tag", ownerKind: "canonical" }],
  },
  remove_tag: {
    toolName: "remove_tag",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "entity_tag", ownerKind: "canonical" }],
  },
  set_relationship: {
    toolName: "set_relationship",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "relationship_change", ownerKind: "canonical" }],
  },
  add_chronicle_entry: {
    toolName: "add_chronicle_entry",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "chronicle_entry", ownerKind: "canonical" }],
    hiddenInPlayerTurn: true,
  },
  log_event: {
    toolName: "log_event",
    roles: ["legacy_scene_beat"],
  },
  advance_time: {
    toolName: "advance_time",
    roles: ["time_effect"],
  },
  spawn_npc: {
    toolName: "spawn_npc",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "support_actor_created", ownerKind: "legacy" }],
    hiddenInPlayerTurn: true,
  },
  promote_npc: {
    toolName: "promote_npc",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "support_actor_created", ownerKind: "delegate" }],
    suppressInPlayerTurnWhenPresent: ["create_scene_extra"],
  },
  spawn_item: {
    toolName: "spawn_item",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "item_created", ownerKind: "canonical" }],
  },
  reveal_location: {
    toolName: "reveal_location",
    roles: ["state_mutation"],
    stateEffects: [
      { effectKind: "location_revealed", ownerKind: "canonical" },
      { effectKind: "movement", ownerKind: "preparatory", preparatoryFor: "movement" },
    ],
  },
  request_contested_outcome: {
    toolName: "request_contested_outcome",
    roles: ["helper_observation", "authority_bounds"],
  },
  set_condition: {
    toolName: "set_condition",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "actor_condition", ownerKind: "canonical" }],
  },
  move_to: {
    toolName: "move_to",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "movement", ownerKind: "legacy" }],
    hiddenInPlayerTurn: true,
  },
  move_actor: {
    toolName: "move_actor",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "movement", ownerKind: "canonical" }],
  },
  create_minor_poi: {
    toolName: "create_minor_poi",
    roles: ["state_mutation"],
    stateEffects: [
      { effectKind: "minor_poi_created", ownerKind: "canonical" },
      { effectKind: "movement", ownerKind: "preparatory", preparatoryFor: "movement" },
    ],
  },
  create_scene_extra: {
    toolName: "create_scene_extra",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "support_actor_created", ownerKind: "canonical" }],
  },
  start_search: {
    toolName: "start_search",
    roles: ["intent_marker", "side_effect"],
  },
  record_player_intent: {
    toolName: "record_player_intent",
    roles: ["intent_marker", "side_effect"],
  },
  transfer_item: {
    toolName: "transfer_item",
    roles: ["state_mutation"],
    stateEffects: [{ effectKind: "item_transfer", ownerKind: "canonical" }],
  },
  offer_quick_actions: {
    toolName: "offer_quick_actions",
    roles: ["ui_suggestion", "public_handle_authority"],
    stateEffects: [{ effectKind: "quick_action_offer", ownerKind: "canonical" }],
  },
};
