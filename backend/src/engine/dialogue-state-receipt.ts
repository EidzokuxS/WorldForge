import type { ToolResult } from "./tool-result.js";
import { isAuthoritativeMutationToolResult } from "./tool-result.js";
import type { RuntimeToolName } from "./tool-schemas.js";
import {
  DIALOGUE_STRUCTURAL_EFFECT_TOOL_NAMES,
  dialogueStateReceiptKeysForTool,
  isDialogueStructuralEffectToolName,
  normalizeDialogueStateReceiptKey,
  type DialogueStructuralEffectToolName,
} from "./dialogue-state-receipt-contract.js";

export const DIALOGUE_STRUCTURAL_EFFECT_TOOLS = new Set<RuntimeToolName>(
  DIALOGUE_STRUCTURAL_EFFECT_TOOL_NAMES as readonly RuntimeToolName[],
);

export type StructuralStateReceipt = {
  toolName: RuntimeToolName;
  targetRefs: Set<string>;
  stateKeys: Set<string>;
  stateValues: Set<string>;
  claims: StructuralStateReceiptClaim[];
};

type StructuralStateReceiptClaim = {
  targetRefs: Set<string>;
  keyedValues: Map<string, Set<string>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStateToken(value: string): string {
  return value.trim().toLowerCase();
}

function slugStateToken(value: string): string {
  return normalizeStateToken(value)
    .replace(/^[a-z]+:/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function dialogueStateTokenAliases(value?: unknown, typeHint?: string | null): string[] {
  if (typeof value !== "string") return [];
  const normalized = normalizeStateToken(value);
  if (!normalized) return [];
  const withoutPrefix = normalized.replace(/^[a-z]+:/, "");
  const slug = slugStateToken(normalized);
  const aliases = new Set([normalized, withoutPrefix, slug].filter(Boolean));
  if (typeHint?.trim()) {
    const type = normalizeStateToken(typeHint);
    aliases.add(`${type}:${withoutPrefix}`);
    if (slug) aliases.add(`${type}:${slug}`);
  }
  return [...aliases];
}

function addReceiptRef(
  refs: Set<string>,
  value?: unknown,
  typeHint?: string | null,
): void {
  dialogueStateTokenAliases(value, typeHint).forEach((alias) => refs.add(alias));
}

function addReceiptKey(keys: Set<string>, value: string): void {
  const normalized = normalizeStateToken(value);
  if (normalized) keys.add(normalized);
}

function addReceiptValue(values: Set<string>, value?: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    values.add(String(value));
    return;
  }
  if (typeof value !== "string") return;
  dialogueStateTokenAliases(value).forEach((alias) => values.add(alias));
}

function addReceiptQualifiedValue(values: Set<string>, prefix: string, value?: unknown): void {
  if (typeof value !== "string") return;
  const normalizedPrefix = normalizeStateToken(prefix);
  const normalizedValue = normalizeStateToken(value);
  if (!normalizedPrefix || !normalizedValue) return;
  const qualified = `${normalizedPrefix}:${normalizedValue.replace(/^[a-z]+:/, "")}`;
  values.add(qualified);
  const slug = qualified
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug) values.add(slug);
}

function addReceiptStatePhraseValue(
  values: Set<string>,
  state?: unknown,
  relation?: "by" | "at",
  holder?: unknown,
): void {
  if (typeof state !== "string" || typeof holder !== "string") return;
  const stateText = state.trim();
  const holderText = holder.trim();
  if (!stateText || !holderText) return;
  addReceiptValue(values, `${stateText} ${relation} ${holderText}`);
}

function addReceiptArrayValues(values: Set<string>, value?: unknown): void {
  if (!Array.isArray(value)) return;
  value.forEach((entry) => addReceiptValue(values, entry));
}

function hasIntersection(left: ReadonlySet<string>, right: readonly string[]): boolean {
  return right.some((entry) => left.has(entry));
}

function toolResultRecord(result: ToolResult | null | undefined): Record<string, unknown> {
  return isRecord(result?.result) ? result.result : {};
}

function claimValuesForKey(
  claim: StructuralStateReceiptClaim,
  stateKey: string,
): Set<string> {
  const normalizedKey = normalizeDialogueStateReceiptKey(stateKey);
  let values = claim.keyedValues.get(normalizedKey);
  if (!values) {
    values = new Set();
    claim.keyedValues.set(normalizedKey, values);
  }
  return values;
}

function addReceiptValuesForKey(
  claim: StructuralStateReceiptClaim,
  stateKey: string,
  buildValues: (values: Set<string>) => void,
): void {
  buildValues(claimValuesForKey(claim, stateKey));
}

function addReceiptValuesForKeys(
  claim: StructuralStateReceiptClaim,
  stateKeys: readonly string[],
  buildValues: (values: Set<string>) => void,
): void {
  stateKeys.forEach((key) => addReceiptValuesForKey(claim, key, buildValues));
}

function addReceiptValuesForTool(
  claim: StructuralStateReceiptClaim,
  toolName: DialogueStructuralEffectToolName,
  buildValues: (values: Set<string>) => void,
): void {
  addReceiptValuesForKeys(claim, dialogueStateReceiptKeysForTool(toolName), buildValues);
}

function appendReceiptClaim(
  receipt: StructuralStateReceipt,
  build: (claim: StructuralStateReceiptClaim) => void,
): void {
  const claim: StructuralStateReceiptClaim = {
    targetRefs: new Set(),
    keyedValues: new Map(),
  };
  build(claim);
  const populatedEntries = [...claim.keyedValues.entries()]
    .filter(([, values]) => values.size > 0);
  if (claim.targetRefs.size === 0 || populatedEntries.length === 0) {
    return;
  }
  receipt.claims.push(claim);
  claim.targetRefs.forEach((ref) => receipt.targetRefs.add(ref));
  populatedEntries.forEach(([key, values]) => {
    addReceiptKey(receipt.stateKeys, key);
    values.forEach((value) => receipt.stateValues.add(value));
  });
}

export function structuralStateReceiptFromToolCall(input: {
  toolName: RuntimeToolName | string | null | undefined;
  candidateInput?: unknown;
  result?: ToolResult | null;
}): StructuralStateReceipt | null {
  if (!isDialogueStructuralEffectToolName(input.toolName)) return null;
  if (!isAuthoritativeMutationToolResult(input.result)) return null;

  const toolName = input.toolName;
  const candidateInput = isRecord(input.candidateInput) ? input.candidateInput : {};
  const result = toolResultRecord(input.result);
  const receipt: StructuralStateReceipt = {
    toolName,
    targetRefs: new Set(),
    stateKeys: new Set(),
    stateValues: new Set(),
    claims: [],
  };
  const entityType = stringField(candidateInput, "entityType");

  switch (toolName) {
    case "add_tag": {
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.entity, entityType);
        addReceiptValuesForTool(claim, toolName, (values) => {
          if (stringField(result, "appliedTag")) {
            addReceiptValue(values, result.appliedTag);
          }
        });
      });
      break;
    }
    case "remove_tag":
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.entity, entityType);
        addReceiptValuesForTool(claim, toolName, (values) => {
          addReceiptQualifiedValue(values, "removed", result.removedTag);
          addReceiptQualifiedValue(values, "cleared", result.removedTag);
        });
      });
      break;
    case "set_relationship":
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.entityA);
        addReceiptRef(claim.targetRefs, result.entityB);
        addReceiptValuesForTool(claim, toolName, (values) => {
          addReceiptValue(values, result.tag);
        });
      });
      break;
    case "set_condition":
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.entity);
        addReceiptValuesForTool(claim, toolName, (values) => {
          addReceiptValue(values, result.newHp);
        });
      });
      break;
    case "transfer_item":
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.item, "item");
        addReceiptValuesForKeys(claim, ["possession", "owner", "custody", "inventory"], (values) => {
          addReceiptValue(values, result.target);
          addReceiptStatePhraseValue(values, result.action, "by", result.target);
          addReceiptStatePhraseValue(values, result.equipState, "by", result.target);
        });
        addReceiptValuesForKeys(claim, ["custody", "equipState"], (values) => {
          addReceiptValue(values, result.action);
          addReceiptValue(values, result.equipState);
        });
      });
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.target);
        addReceiptValuesForKeys(claim, ["possession", "owner", "custody", "inventory"], (values) => {
          addReceiptValue(values, result.item);
        });
      });
      if (result.partialTransfer === true) {
        appendReceiptClaim(receipt, (claim) => {
          addReceiptRef(claim.targetRefs, result.splitFrom, "item");
          addReceiptValuesForKeys(claim, ["possession", "inventory"], (values) => {
            addReceiptValue(values, "partial-transfer");
            addReceiptValue(values, "split");
            addReceiptValue(values, result.item);
            addReceiptValue(values, result.remainingItem);
          });
        });
        appendReceiptClaim(receipt, (claim) => {
          addReceiptRef(claim.targetRefs, result.remainingItem, "item");
          addReceiptValuesForKeys(claim, ["possession", "inventory"], (values) => {
            addReceiptValue(values, "remaining");
            addReceiptValue(values, "retained");
          });
        });
      }
      break;
    case "move_actor":
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.actorRef, "actor");
        addReceiptValuesForTool(claim, toolName, (values) => {
          addReceiptValue(values, result.destinationRef);
          addReceiptValue(values, result.locationName);
        });
      });
      break;
    case "reveal_location":
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.id, "location");
        addReceiptRef(claim.targetRefs, result.name, "location");
        addReceiptValuesForKey(claim, "location", (values) => {
          addReceiptValue(values, result.id);
          addReceiptValue(values, result.name);
        });
        addReceiptValuesForKey(claim, "visibility", (values) => {
          addReceiptValue(values, "revealed");
          addReceiptValue(values, "visible");
        });
        addReceiptValuesForKey(claim, "access", (values) => {
          addReceiptValue(values, result.id);
          addReceiptValue(values, result.name);
        });
      });
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.parentLocationId, "location");
        addReceiptRef(claim.targetRefs, result.anchorLocationId, "location");
        addReceiptValuesForKeys(claim, ["route", "access"], (values) => {
          addReceiptValue(values, result.id);
          addReceiptValue(values, result.name);
        });
      });
      break;
    case "spawn_item":
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.id, "item");
        addReceiptRef(claim.targetRefs, result.name, "item");
        addReceiptValuesForKey(claim, "item", (values) => {
          addReceiptValue(values, "created");
          addReceiptValue(values, result.id);
          addReceiptValue(values, result.name);
        });
        addReceiptValuesForKey(claim, "owner", (values) => {
          addReceiptValue(values, result.owner);
        });
        addReceiptValuesForKey(claim, "possession", (values) => {
          addReceiptValue(values, result.owner);
          if (stringField(result, "ownerType") === "character") {
            addReceiptValue(values, "carried");
            addReceiptStatePhraseValue(values, "carried", "by", result.owner);
          }
          if (stringField(result, "ownerType") === "location") {
            addReceiptValue(values, "located");
            addReceiptStatePhraseValue(values, "located", "at", result.owner);
          }
        });
      });
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.owner);
        addReceiptValuesForKeys(claim, ["possession", "owner"], (values) => {
          addReceiptValue(values, result.id);
          addReceiptValue(values, result.name);
        });
      });
      break;
    case "promote_npc":
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.npcId, "actor");
        addReceiptRef(claim.targetRefs, result.name, "actor");
        addReceiptValuesForTool(claim, toolName, (values) => {
          addReceiptValue(values, result.newTier);
        });
      });
      break;
    case "create_minor_poi":
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.id, "location");
        addReceiptRef(claim.targetRefs, result.name, "location");
        addReceiptValuesForKey(claim, "location", (values) => {
          addReceiptValue(values, "created");
          addReceiptValue(values, result.id);
          addReceiptValue(values, result.name);
        });
        addReceiptValuesForKey(claim, "visibility", (values) => {
          addReceiptValue(values, "visible");
          addReceiptValue(values, result.visibility);
        });
        addReceiptValuesForKey(claim, "access", (values) => {
          addReceiptValue(values, result.id);
          addReceiptValue(values, result.name);
        });
      });
      appendReceiptClaim(receipt, (claim) => {
        addReceiptRef(claim.targetRefs, result.anchorLocationId, "location");
        addReceiptValuesForKeys(claim, ["route", "access"], (values) => {
          addReceiptValue(values, result.id);
          addReceiptValue(values, result.name);
        });
      });
      break;
  }

  return receipt;
}

export function appliedStateEffectsFromDialoguePayload(
  payload: Record<string, unknown> | null,
): Record<string, unknown>[] {
  if (!payload || !Array.isArray(payload.stateEffects)) return [];
  return payload.stateEffects.filter((effect): effect is Record<string, unknown> =>
    isRecord(effect) && stringField(effect, "status") === "applied_now");
}

export function receiptBacksAppliedStateEffect(
  receipt: StructuralStateReceipt,
  effect: Record<string, unknown>,
): boolean {
  const structuralTool = stringField(effect, "structuralTool");
  if (!structuralTool || receipt.toolName !== structuralTool) return false;

  const stateValue = stringField(effect, "stateValue");
  if (!stateValue) {
    return false;
  }

  const targetRef = stringField(effect, "targetRef");
  const stateKey = stringField(effect, "stateKey");
  if (!targetRef || !stateKey) return false;

  return receipt.claims.some((claim) => {
    if (!hasIntersection(claim.targetRefs, dialogueStateTokenAliases(targetRef))) {
      return false;
    }
    const values = claim.keyedValues.get(normalizeDialogueStateReceiptKey(stateKey));
    if (!values || values.size === 0) {
      return false;
    }
    return hasIntersection(values, dialogueStateTokenAliases(stateValue));
  });
}
