export const DIALOGUE_STRUCTURAL_EFFECT_TOOL_NAMES = [
  "add_tag",
  "remove_tag",
  "set_relationship",
  "set_condition",
  "transfer_item",
  "move_actor",
  "reveal_location",
  "spawn_item",
  "promote_npc",
  "create_minor_poi",
] as const;

export type DialogueStructuralEffectToolName =
  (typeof DIALOGUE_STRUCTURAL_EFFECT_TOOL_NAMES)[number];

type DialogueStateReceiptDescriptor = {
  stateKeys: readonly string[];
};

export const DIALOGUE_STATE_RECEIPT_DESCRIPTORS: Record<
  DialogueStructuralEffectToolName,
  DialogueStateReceiptDescriptor
> = {
  add_tag: {
    stateKeys: [
      "tag",
      "state",
      "status",
      "document_status",
      "verification",
      "authentication",
      "authenticity",
      "certification",
      "mark",
      "flag",
      "access",
    ],
  },
  remove_tag: {
    stateKeys: [
      "tag",
      "state",
      "status",
      "document_status",
      "verification",
      "authentication",
      "authenticity",
      "certification",
      "mark",
      "flag",
      "access",
    ],
  },
  set_relationship: {
    stateKeys: ["relationship", "tag"],
  },
  set_condition: {
    stateKeys: ["condition", "hp"],
  },
  transfer_item: {
    stateKeys: ["possession", "owner", "custody", "equipState", "inventory"],
  },
  move_actor: {
    stateKeys: ["location", "route"],
  },
  reveal_location: {
    stateKeys: ["location", "route", "visibility", "access"],
  },
  spawn_item: {
    stateKeys: ["item", "possession", "owner"],
  },
  promote_npc: {
    stateKeys: ["tier"],
  },
  create_minor_poi: {
    stateKeys: ["location", "route", "visibility", "access"],
  },
};

export function dialogueStateReceiptKeysForTool(
  toolName: DialogueStructuralEffectToolName,
): readonly string[] {
  return DIALOGUE_STATE_RECEIPT_DESCRIPTORS[toolName].stateKeys;
}

export function isDialogueStructuralEffectToolName(
  value: unknown,
): value is DialogueStructuralEffectToolName {
  return typeof value === "string"
    && DIALOGUE_STRUCTURAL_EFFECT_TOOL_NAMES.includes(value as DialogueStructuralEffectToolName);
}

export function normalizeDialogueStateReceiptKey(value: string): string {
  return value.trim().toLowerCase();
}

export function isDialogueStateReceiptKeyForTool(
  toolName: DialogueStructuralEffectToolName,
  stateKey: string,
): boolean {
  const normalized = normalizeDialogueStateReceiptKey(stateKey);
  return dialogueStateReceiptKeysForTool(toolName)
    .some((key) => normalizeDialogueStateReceiptKey(key) === normalized);
}

export function dialogueStateEffectStateKeyDescription(): string {
  return [
    "State slot to match the structural tool receipt.",
    "Use canonical keys by tool:",
    DIALOGUE_STRUCTURAL_EFFECT_TOOL_NAMES
      .map((toolName) =>
        `${toolName}=${dialogueStateReceiptKeysForTool(toolName).join("/")}`)
      .join("; "),
    "For possession/custody, stateValue may be the exact owner/target label or a receipt-derived phrase such as carried by <character> or located at <location>.",
    "Use custody only for transfer_item ownership/custody transfer.",
  ].join(" ");
}
