import type {
  GmActionChecklistEffectKindV2,
  ModelFacingTurnPacketV2,
  RuntimeCapabilityIdV2,
} from "./contracts.js";

type CapabilityEvidenceAuthority =
  ModelFacingTurnPacketV2["capabilities"][number]["evidenceAuthority"];

export interface RuntimeCapabilityDefinitionV2 {
  capabilityId: RuntimeCapabilityIdV2;
  purpose: string;
  evidenceAuthority: CapabilityEvidenceAuthority;
  plannerSurface: "none" | "oracle" | "tool_request" | "ui";
  ownsEffectKinds: GmActionChecklistEffectKindV2[];
}

const CAPABILITY_CATALOG: Record<RuntimeCapabilityIdV2, RuntimeCapabilityDefinitionV2> = {
  observe_visible: {
    capabilityId: "observe_visible",
    purpose: "Read current visible scene affordances without proving hidden absence.",
    evidenceAuthority: "observation_only",
    plannerSurface: "none",
    ownsEffectKinds: [],
  },
  oracle_roll: {
    capabilityId: "oracle_roll",
    purpose: "Settle true uncertainty with an Oracle outcome without mutating world state.",
    evidenceAuthority: "terminal_receipt_required",
    plannerSurface: "oracle",
    ownsEffectKinds: [],
  },
  route_options: {
    capabilityId: "route_options",
    purpose: "List currently exposed movement options without moving the actor.",
    evidenceAuthority: "observation_only",
    plannerSurface: "none",
    ownsEffectKinds: [],
  },
  route_check: {
    capabilityId: "route_check",
    purpose: "Check whether a concrete exposed route is legal without moving the actor.",
    evidenceAuthority: "observation_only",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["route_check"],
  },
  movement: {
    capabilityId: "movement",
    purpose: "Move an actor only through accepted movement authority.",
    evidenceAuthority: "mutation_receipt_required",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["movement"],
  },
  dialogue_record: {
    capabilityId: "dialogue_record",
    purpose: "Record a visible dialogue answer, refusal, warning, redirect, or silence.",
    evidenceAuthority: "terminal_receipt_required",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["dialogue_outcome"],
  },
  world_fact_record: {
    capabilityId: "world_fact_record",
    purpose: "Record source-bounded player-known knowledge for future use.",
    evidenceAuthority: "mutation_receipt_required",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["world_fact"],
  },
  support_actor_create: {
    capabilityId: "support_actor_create",
    purpose: "Create a temporary visible support actor for the current scene.",
    evidenceAuthority: "mutation_receipt_required",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["support_actor_create"],
  },
  entity_tag: {
    capabilityId: "entity_tag",
    purpose: "Apply or remove a concrete tag on a visible/current entity.",
    evidenceAuthority: "mutation_receipt_required",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["entity_tag"],
  },
  item_transfer: {
    capabilityId: "item_transfer",
    purpose: "Transfer a modeled item between legal owners or locations.",
    evidenceAuthority: "mutation_receipt_required",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["item_transfer"],
  },
  condition_set: {
    capabilityId: "condition_set",
    purpose: "Apply a condition or HP change through actor condition authority.",
    evidenceAuthority: "mutation_receipt_required",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["condition"],
  },
  time_advance: {
    capabilityId: "time_advance",
    purpose: "Advance in-world time as an accepted consequence.",
    evidenceAuthority: "mutation_receipt_required",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["time_advance"],
  },
  quick_action_offer: {
    capabilityId: "quick_action_offer",
    purpose: "Offer player-facing quick actions after accepted turn truth.",
    evidenceAuthority: "ui_only",
    plannerSurface: "ui",
    ownsEffectKinds: ["quick_action_offer"],
  },
  scene_beat_record: {
    capabilityId: "scene_beat_record",
    purpose: "Record a scene-local beat without substituting for structural state.",
    evidenceAuthority: "terminal_receipt_required",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["scene_beat"],
  },
  location_reveal: {
    capabilityId: "location_reveal",
    purpose: "Reveal a concrete local place through accepted location authority.",
    evidenceAuthority: "mutation_receipt_required",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["location_reveal"],
  },
  minor_poi_create: {
    capabilityId: "minor_poi_create",
    purpose: "Create a minor point of interest through accepted local authority.",
    evidenceAuthority: "mutation_receipt_required",
    plannerSurface: "tool_request",
    ownsEffectKinds: ["minor_poi_create"],
  },
};

export function listRuntimeCapabilityDefinitionsV2(): RuntimeCapabilityDefinitionV2[] {
  return Object.values(CAPABILITY_CATALOG);
}

export function getRuntimeCapabilityDefinitionV2(
  capabilityId: RuntimeCapabilityIdV2,
): RuntimeCapabilityDefinitionV2 {
  return CAPABILITY_CATALOG[capabilityId];
}

export function capabilityForEffectKindV2(
  effectKind: GmActionChecklistEffectKindV2,
): RuntimeCapabilityIdV2 {
  const definition = listRuntimeCapabilityDefinitionsV2()
    .find((capability) => capability.ownsEffectKinds.includes(effectKind));
  if (!definition) {
    throw new Error(`No gameplay-cycle-v2 capability owns effect kind "${effectKind}".`);
  }
  return definition.capabilityId;
}

export function toModelFacingCapabilitiesV2(
  capabilityIds: readonly RuntimeCapabilityIdV2[],
): ModelFacingTurnPacketV2["capabilities"] {
  return capabilityIds.map((capabilityId) => {
    const definition = getRuntimeCapabilityDefinitionV2(capabilityId);
    return {
      capabilityId: definition.capabilityId,
      purpose: definition.purpose,
      evidenceAuthority: definition.evidenceAuthority,
    };
  });
}
