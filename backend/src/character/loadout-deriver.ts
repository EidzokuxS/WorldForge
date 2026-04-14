import type {
  CanonicalLoadoutItemSpec,
  CanonicalLoadoutPreview,
  CharacterDraft,
} from "@worldforge/shared";

function normalizeItemName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function appendUnique(target: string[], value: string | null | undefined): void {
  if (!value) {
    return;
  }
  const normalized = normalizeItemName(value);
  if (!normalized) {
    return;
  }
  if (!target.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
    target.push(normalized);
  }
}

function dedupe(values: string[]): string[] {
  const next: string[] = [];
  for (const value of values) {
    appendUnique(next, value);
  }
  return next;
}

export function deriveCanonicalLoadout(
  draft: CharacterDraft,
): CanonicalLoadoutPreview {
  const equipped = dedupe(draft.loadout.equippedItemRefs);
  const inventory = dedupe(draft.loadout.inventorySeed);
  const signature = dedupe(draft.loadout.signatureItems);
  const audit: string[] = [];
  const warnings: string[] = [];

  if (equipped.length === 0 && inventory.length === 0) {
    appendUnique(equipped, "Travel Cloak");
    appendUnique(inventory, "Travel Cloak");
    audit.push("baseline-travel-kit");
  } else {
    audit.push("draft-loadout-preserved");
  }

  if (signature.length === 0 && equipped.length > 0) {
    appendUnique(signature, equipped[0]);
    audit.push("signature-from-equipped");
  }

  if (draft.socialContext.originMode === "outsider") {
    appendUnique(inventory, "Travel Papers");
    audit.push("origin:outsider");
  }

  if (draft.startConditions.arrivalMode === "on-foot") {
    appendUnique(inventory, "Waterskin");
    audit.push("arrival:on-foot");
  }

  if (draft.capabilities.wealthTier === "Poor") {
    audit.push("wealth:poor");
  } else if (draft.capabilities.wealthTier === "Comfortable") {
    audit.push("wealth:comfortable");
  }

  const items: CanonicalLoadoutItemSpec[] = [
    ...equipped.map((name) => ({
      name,
      slot: "equipped" as const,
      tags: ["starting-loadout", "equipped"],
      quantity: 1,
      reason: audit.includes("draft-loadout-preserved")
        ? "preserved from draft loadout"
        : "baseline travel gear",
    })),
    ...inventory
      .filter(
        (name) =>
          !equipped.some(
            (equippedName) => equippedName.toLowerCase() === name.toLowerCase(),
          ),
      )
      .map((name) => ({
        name,
        slot: "pack" as const,
        tags: ["starting-loadout", "pack"],
        quantity: 1,
        reason: audit.includes("baseline-travel-kit")
          ? "baseline travel gear"
          : "carried from scenario rules",
      })),
    ...signature
      .filter(
        (name) =>
          !equipped.some(
            (equippedName) => equippedName.toLowerCase() === name.toLowerCase(),
          ) &&
          !inventory.some(
            (inventoryName) => inventoryName.toLowerCase() === name.toLowerCase(),
          ),
      )
      .map((name) => ({
        name,
        slot: "signature" as const,
        tags: ["starting-loadout", "signature"],
        quantity: 1,
        reason: "signature item carried into the opening state",
      })),
  ];

  if (items.length === 0) {
    warnings.push("No canonical loadout items derived.");
  }

  return {
    loadout: {
      inventorySeed: inventory,
      equippedItemRefs: equipped,
      currencyNotes:
        draft.loadout.currencyNotes || "A few clipped silver marks.",
      signatureItems: signature,
    },
    items,
    audit,
    warnings,
  };
}
