import { describe, expect, it } from "vitest";

import {
  attachStructuralStateReceiptsToToolResult,
  receiptBacksAppliedStateEffect,
  resolveAppliedStateEffectFromReceipt,
  structuralStateReceiptFromToolCall,
} from "../dialogue-state-receipt.js";
import {
  DIALOGUE_STRUCTURAL_EFFECT_TOOL_NAMES,
  dialogueStateReceiptKeysForTool,
  dialogueStateEffectStateKeyDescription,
  type DialogueStructuralEffectToolName,
} from "../dialogue-state-receipt-contract.js";
import { runtimeToolInputSchemas } from "../tool-schemas.js";
import type { ToolResult } from "../tool-result.js";

function mutationToolResult(result: unknown): ToolResult {
  return {
    success: true,
    status: "success",
    kind: "mutation",
    result,
    authority: {
      toolResultId: "tool-result-receipt-regression",
      campaignId: "campaign-receipt-regression",
      sourceEntity: { type: "test" },
      baseWorldVersion: 1,
      resultWorldVersion: 2,
      elapsedWorldTimeMinutes: 0,
      stateDeltaRefs: ["state:receipt-regression"],
      eventRefs: [],
      witnesses: [],
      knowledgeOutputs: [],
      visibilityOutputs: [],
      resources: [],
    },
  };
}

function dialogueOutcomeInput(stateEffect: Record<string, unknown>) {
  return {
    speakerRef: "Court Routing Clerk",
    addresseeRefs: ["Player"],
    outcomeKind: "answered",
    topicKind: "proof",
    authorityKind: "role_authority",
    truthStatus: "settled_by_backend",
    durability: "durable",
    futureUseKind: "evidence",
    futureRelevance: "The receipt can be used later.",
    summary: "A durable outcome is recorded.",
    quote: "The sealed proof is now docketed for later use.",
    claims: [{
      claimKind: "document_status",
      polarity: "states",
      subjectRef: "Anonymous sealed proof",
      summary: "The proof changed state.",
    }],
    stateEffects: [stateEffect],
    sourceRefs: ["Court Routing Clerk", "Anonymous sealed proof"],
  };
}

describe("dialogue state receipts", () => {
  it("backs document verification stateEffects with prior tag receipts", () => {
    const receipt = structuralStateReceiptFromToolCall({
      toolName: "add_tag",
      candidateInput: {
        entityName: "Anonymous sealed proof",
        entityType: "item",
        tag: "verified-authentic",
      },
      result: mutationToolResult({
        entity: "Anonymous sealed proof",
        appliedTag: "verified-authentic",
        tags: ["starting-loadout", "equipped", "verified-authentic"],
      }),
    });

    expect(receipt).not.toBeNull();
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "add_tag",
      targetRef: "Anonymous sealed proof",
      stateKey: "verification",
      stateValue: "verified-authentic",
    })).toBe(true);
  });

  it("backs applied_now effects from backend-issued stateReceipt aliases", () => {
    const toolResult = mutationToolResult({
      entity: "Anonymous sealed proof",
      appliedTag: "verified-authentic",
      tags: ["starting-loadout", "equipped", "verified-authentic"],
    });
    attachStructuralStateReceiptsToToolResult({
      toolName: "add_tag",
      candidateInput: {
        entityName: "Anonymous sealed proof",
        entityType: "item",
        tag: "verified-authentic",
      },
      result: toolResult,
      prefix: "state_receipt_1",
    });
    const receipt = structuralStateReceiptFromToolCall({
      toolName: "add_tag",
      candidateInput: {
        entityName: "Anonymous sealed proof",
        entityType: "item",
        tag: "verified-authentic",
      },
      result: toolResult,
    });

    const stateReceipt = toolResult.stateReceipts?.find((row) =>
      row.key === "tag" && row.value === "verified-authentic")?.stateReceipt;
    expect(stateReceipt).toBe("state_receipt_1_1");
    expect(receipt).not.toBeNull();
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      stateReceipt,
      summary: "The backend resolves target/key/value from this receipt.",
    })).toBe(true);
    expect(resolveAppliedStateEffectFromReceipt(receipt!, {
      status: "applied_now",
      stateReceipt,
      summary: "The backend resolves target/key/value from this receipt.",
    })).toMatchObject({
      structuralTool: "add_tag",
      targetRef: "anonymous sealed proof",
      stateKey: "tag",
      stateValue: "verified-authentic",
    });
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      stateReceipt: "state_receipt_9_9",
      summary: "A forged same-turn receipt must not work.",
    })).toBe(false);
  });

  it("does not let a tag receipt back an unrelated state key", () => {
    const receipt = structuralStateReceiptFromToolCall({
      toolName: "add_tag",
      candidateInput: {
        entityName: "Anonymous sealed proof",
        entityType: "item",
        tag: "verified-authentic",
      },
      result: mutationToolResult({
        entity: "Anonymous sealed proof",
        tags: ["verified-authentic"],
      }),
    });

    expect(receipt).not.toBeNull();
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "add_tag",
      targetRef: "Anonymous sealed proof",
      stateKey: "possession",
      stateValue: "verified-authentic",
    })).toBe(false);
  });

  it("does not use candidate-only values as structural receipt semantics", () => {
    const receipt = structuralStateReceiptFromToolCall({
      toolName: "add_tag",
      candidateInput: {
        entityName: "Anonymous sealed proof",
        entityType: "item",
        tag: "verified-authentic",
      },
      result: mutationToolResult({
        entity: "Anonymous sealed proof",
        tags: ["docketed-pending-tide-lock"],
      }),
    });

    expect(receipt).not.toBeNull();
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "add_tag",
      targetRef: "Anonymous sealed proof",
      stateKey: "verification",
      stateValue: "verified-authentic",
    })).toBe(false);
  });

  it("does not use preexisting result tags as the applied add_tag value", () => {
    const receipt = structuralStateReceiptFromToolCall({
      toolName: "add_tag",
      candidateInput: {
        entityName: "Anonymous sealed proof",
        entityType: "item",
        tag: "verified-authentic",
      },
      result: mutationToolResult({
        entity: "Anonymous sealed proof",
        tags: ["starting-loadout", "verified-authentic"],
      }),
    });

    expect(receipt).not.toBeNull();
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "add_tag",
      targetRef: "Anonymous sealed proof",
      stateKey: "verification",
      stateValue: "starting-loadout",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "add_tag",
      targetRef: "Anonymous sealed proof",
      stateKey: "verification",
      stateValue: "verified-authentic",
    })).toBe(false);
  });

  it("models remove_tag as removal or clearing, not positive presence of the removed tag", () => {
    const receipt = structuralStateReceiptFromToolCall({
      toolName: "remove_tag",
      candidateInput: {
        entityName: "Gate Writ",
        entityType: "item",
        tag: "blocked",
      },
      result: mutationToolResult({
        entity: "Gate Writ",
        removedTag: "blocked",
        tags: [],
      }),
    });

    expect(receipt).not.toBeNull();
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "remove_tag",
      targetRef: "Gate Writ",
      stateKey: "status",
      stateValue: "blocked",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "remove_tag",
      targetRef: "Gate Writ",
      stateKey: "status",
      stateValue: "removed",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "remove_tag",
      targetRef: "Gate Writ",
      stateKey: "access",
      stateValue: "cleared",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "remove_tag",
      targetRef: "Gate Writ",
      stateKey: "status",
      stateValue: "removed:blocked",
    })).toBe(true);
  });

  it("backs item custody stateEffects with prior transfer receipts", () => {
    const receipt = structuralStateReceiptFromToolCall({
      toolName: "transfer_item",
      candidateInput: {
        itemName: "Anonymous sealed proof",
        targetName: "Corvan Dels",
        targetType: "character",
      },
      result: mutationToolResult({
        item: "Anonymous sealed proof",
        target: "Corvan Dels",
        action: "carried",
        equipState: "carried",
        equippedSlot: null,
      }),
    });

    expect(receipt).not.toBeNull();
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Anonymous sealed proof",
      stateKey: "custody",
      stateValue: "carried",
    })).toBe(true);
  });

  it("keeps partial transfer target/value relationships separate", () => {
    const receipt = structuralStateReceiptFromToolCall({
      toolName: "transfer_item",
      candidateInput: {
        itemName: "Three Ration Slips",
        targetName: "Bureau Window Clerk",
        targetType: "character",
        transferredItemName: "Two Ration Slips",
        remainingItemName: "One Ration Slip",
      },
      result: mutationToolResult({
        item: "Two Ration Slips",
        splitFrom: "Three Ration Slips",
        remainingItem: "One Ration Slip",
        target: "Bureau Window Clerk",
        action: "carried",
        equipState: "carried",
        partialTransfer: true,
      }),
    });

    expect(receipt).not.toBeNull();
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "One Ration Slip",
      stateKey: "possession",
      stateValue: "Bureau Window Clerk",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Two Ration Slips",
      stateKey: "possession",
      stateValue: "Bureau Window Clerk",
    })).toBe(true);
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Three Ration Slips",
      stateKey: "possession",
      stateValue: "split",
    })).toBe(true);
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Three Ration Slips",
      stateKey: "owner",
      stateValue: "split",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(receipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Three Ration Slips",
      stateKey: "owner",
      stateValue: "partial-transfer",
    })).toBe(false);
  });

  it("keeps receipt values local to the exact state key inside a claim", () => {
    const transferReceipt = structuralStateReceiptFromToolCall({
      toolName: "transfer_item",
      candidateInput: {
        itemName: "Two Ration Slips",
        targetName: "Bureau Window Clerk",
        targetType: "character",
      },
      result: mutationToolResult({
        item: "Two Ration Slips",
        target: "Bureau Window Clerk",
        action: "equipped",
        equipState: "equipped",
      }),
    });
    const spawnReceipt = structuralStateReceiptFromToolCall({
      toolName: "spawn_item",
      candidateInput: {
        name: "Stamped Delay Report",
        ownerName: "Mira Voss",
        ownerType: "character",
      },
      result: mutationToolResult({
        id: "item-stamped-delay-report",
        name: "Stamped Delay Report",
        owner: "Mira Voss",
        ownerType: "character",
      }),
    });
    const revealReceipt = structuralStateReceiptFromToolCall({
      toolName: "reveal_location",
      candidateInput: {
        name: "Old Archive Stair",
      },
      result: mutationToolResult({
        id: "location-old-archive-stair",
        name: "Old Archive Stair",
        parentLocationId: "location-court-annex",
      }),
    });
    const poiReceipt = structuralStateReceiptFromToolCall({
      toolName: "create_minor_poi",
      candidateInput: {
        name: "Hidden Ledger Niche",
        areaRef: "current_location",
      },
      result: mutationToolResult({
        id: "location-hidden-ledger-niche",
        name: "Hidden Ledger Niche",
        anchorLocationId: "location-court-annex",
        visibility: "visible",
      }),
    });

    expect(transferReceipt).not.toBeNull();
    expect(spawnReceipt).not.toBeNull();
    expect(revealReceipt).not.toBeNull();
    expect(poiReceipt).not.toBeNull();

    expect(receiptBacksAppliedStateEffect(transferReceipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Two Ration Slips",
      stateKey: "equipState",
      stateValue: "Bureau Window Clerk",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(transferReceipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Two Ration Slips",
      stateKey: "owner",
      stateValue: "equipped",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(transferReceipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Two Ration Slips",
      stateKey: "owner",
      stateValue: "carried",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(transferReceipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Two Ration Slips",
      stateKey: "owner",
      stateValue: "Bureau Window Clerk",
    })).toBe(true);
    expect(receiptBacksAppliedStateEffect(transferReceipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Two Ration Slips",
      stateKey: "equipState",
      stateValue: "equipped",
    })).toBe(true);
    expect(receiptBacksAppliedStateEffect(transferReceipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Two Ration Slips",
      stateKey: "possession",
      stateValue: "equipped by Bureau Window Clerk",
    })).toBe(true);
    expect(receiptBacksAppliedStateEffect(spawnReceipt!, {
      status: "applied_now",
      structuralTool: "spawn_item",
      targetRef: "Stamped Delay Report",
      stateKey: "owner",
      stateValue: "created",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(spawnReceipt!, {
      status: "applied_now",
      structuralTool: "spawn_item",
      targetRef: "Stamped Delay Report",
      stateKey: "item",
      stateValue: "Mira Voss",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(spawnReceipt!, {
      status: "applied_now",
      structuralTool: "spawn_item",
      targetRef: "Stamped Delay Report",
      stateKey: "item",
      stateValue: "character",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(revealReceipt!, {
      status: "applied_now",
      structuralTool: "reveal_location",
      targetRef: "Old Archive Stair",
      stateKey: "route",
      stateValue: "revealed",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(revealReceipt!, {
      status: "applied_now",
      structuralTool: "reveal_location",
      targetRef: "Old Archive Stair",
      stateKey: "route",
      stateValue: "visible",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(poiReceipt!, {
      status: "applied_now",
      structuralTool: "create_minor_poi",
      targetRef: "location-court-annex",
      stateKey: "access",
      stateValue: "visible",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(poiReceipt!, {
      status: "applied_now",
      structuralTool: "create_minor_poi",
      targetRef: "Hidden Ledger Niche",
      stateKey: "route",
      stateValue: "visible",
    })).toBe(false);
  });

  it("keeps dialogue structuralTool schema in parity with receipt descriptors", () => {
    for (const structuralTool of DIALOGUE_STRUCTURAL_EFFECT_TOOL_NAMES) {
      for (const stateKey of dialogueStateReceiptKeysForTool(structuralTool)) {
        expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse(
          dialogueOutcomeInput({
            effectId: `${structuralTool}-${stateKey}-effect`,
            status: "applied_now",
            structuralTool,
            targetRef: "Anonymous sealed proof",
            stateKey,
            stateValue: "docketed",
            summary: "The structural effect is linked to a receipt.",
          }),
        ).success).toBe(true);
      }
    }
  });

  it("documents custody as a transfer_item state key, not a generic prose guess", () => {
    expect(dialogueStateEffectStateKeyDescription()).toContain(
      "transfer_item=possession/owner/custody/equipState/inventory",
    );
  });

  it("requires concrete stateValue evidence for applied_now tag and transfer receipts", () => {
    const tagReceipt = structuralStateReceiptFromToolCall({
      toolName: "add_tag",
      candidateInput: {
        entityName: "Anonymous sealed proof",
        entityType: "item",
        tag: "verified-authentic",
      },
      result: mutationToolResult({
        entity: "Anonymous sealed proof",
        tags: ["verified-authentic"],
      }),
    });
    const transferReceipt = structuralStateReceiptFromToolCall({
      toolName: "transfer_item",
      candidateInput: {
        itemName: "Anonymous sealed proof",
        targetName: "Corvan Dels",
        targetType: "character",
      },
      result: mutationToolResult({
        item: "Anonymous sealed proof",
        target: "Corvan Dels",
        action: "carried",
        equipState: "carried",
      }),
    });

    expect(tagReceipt).not.toBeNull();
    expect(transferReceipt).not.toBeNull();
    expect(receiptBacksAppliedStateEffect(tagReceipt!, {
      status: "applied_now",
      structuralTool: "add_tag",
      targetRef: "Anonymous sealed proof",
      stateKey: "verification",
      summary: "Missing stateValue must not be enough.",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(transferReceipt!, {
      status: "applied_now",
      structuralTool: "transfer_item",
      targetRef: "Anonymous sealed proof",
      stateKey: "custody",
      summary: "Missing stateValue must not be enough.",
    })).toBe(false);
  });

  it("validates record_dialogue_outcome structuralTool and stateKey pairs", () => {
    const parsePair = (
      structuralTool: DialogueStructuralEffectToolName,
      stateKey: string,
    ) =>
      runtimeToolInputSchemas.record_dialogue_outcome.safeParse(
        dialogueOutcomeInput({
          effectId: `${structuralTool}-${stateKey}`,
          status: "applied_now",
          structuralTool,
          targetRef: "Anonymous sealed proof",
          stateKey,
          stateValue: "receipt-value",
          summary: "The structural effect is linked to a receipt.",
        }),
      ).success;

    expect(parsePair("transfer_item", "tag")).toBe(false);
    expect(parsePair("add_tag", "possession")).toBe(false);
    expect(parsePair("reveal_location", "custody")).toBe(false);

    expect(parsePair("transfer_item", "custody")).toBe(true);
    expect(parsePair("add_tag", "verification")).toBe(true);
    expect(parsePair("create_minor_poi", "visibility")).toBe(true);
  });

  it("requires authoritative mutation results before a receipt can back applied_now", () => {
    const candidateInput = {
      entityName: "Anonymous sealed proof",
      entityType: "item",
      tag: "verified-authentic",
    };
    const result = {
      entity: "Anonymous sealed proof",
      tags: ["verified-authentic"],
    };

    expect(structuralStateReceiptFromToolCall({
      toolName: "add_tag",
      candidateInput,
      result: {
        success: true,
        status: "success",
        kind: "mutation",
        result,
      } satisfies ToolResult,
    })).toBeNull();
    expect(structuralStateReceiptFromToolCall({
      toolName: "add_tag",
      candidateInput,
      result: {
        success: true,
        status: "success",
        kind: "mutation",
        result,
        authority: {
          toolResultId: "malformed-authority",
          campaignId: "campaign-receipt-regression",
          sourceEntity: { type: "test" },
          baseWorldVersion: 1,
          resultWorldVersion: 2,
          elapsedWorldTimeMinutes: 0,
          eventRefs: [],
          witnesses: [],
          knowledgeOutputs: [],
          visibilityOutputs: [],
          resources: [],
        },
      } as unknown as ToolResult,
    })).toBeNull();
    expect(structuralStateReceiptFromToolCall({
      toolName: "add_tag",
      candidateInput,
      result: {
        success: true,
        status: "success",
        kind: "observation",
        observationOnly: true,
        result,
      } satisfies ToolResult,
    })).toBeNull();
    expect(structuralStateReceiptFromToolCall({
      toolName: "add_tag",
      candidateInput,
      result: {
        success: false,
        status: "failure",
        kind: "mutation",
        result,
      } satisfies ToolResult,
    })).toBeNull();
  });

  it("records natural created and revealed receipt values for created-world tools", () => {
    const spawnReceipt = structuralStateReceiptFromToolCall({
      toolName: "spawn_item",
      candidateInput: {
        name: "Stamped Delay Report",
        tags: ["document", "receipt"],
        ownerName: "Mira Voss",
        ownerType: "character",
      },
      result: mutationToolResult({
        id: "item-stamped-delay-report",
        name: "Stamped Delay Report",
        owner: "Mira Voss",
        ownerType: "character",
      }),
    });
    const poiReceipt = structuralStateReceiptFromToolCall({
      toolName: "create_minor_poi",
      candidateInput: {
        name: "Hidden Ledger Niche",
        areaRef: "current_location",
        poiType: "alcove",
        tags: ["visible", "ledger-niche"],
      },
      result: mutationToolResult({
        id: "location-hidden-ledger-niche",
        name: "Hidden Ledger Niche",
        anchorLocationId: "location-court-annex",
      }),
    });
    const revealReceipt = structuralStateReceiptFromToolCall({
      toolName: "reveal_location",
      candidateInput: {
        name: "Old Archive Stair",
      },
      result: mutationToolResult({
        id: "location-old-archive-stair",
        name: "Old Archive Stair",
        parentLocationId: "location-court-annex",
      }),
    });

    expect([...spawnReceipt!.stateValues]).toEqual(expect.arrayContaining([
      "stamped delay report",
      "stamped-delay-report",
      "carried",
      "carried by mira voss",
      "carried-by-mira-voss",
    ]));
    expect([...poiReceipt!.stateValues]).toEqual(expect.arrayContaining([
      "hidden ledger niche",
      "hidden-ledger-niche",
      "visible",
    ]));
    expect([...revealReceipt!.stateValues]).toEqual(expect.arrayContaining([
      "old archive stair",
      "old-archive-stair",
      "revealed",
    ]));
    expect(receiptBacksAppliedStateEffect(spawnReceipt!, {
      status: "applied_now",
      structuralTool: "spawn_item",
      targetRef: "Mira Voss",
      stateKey: "possession",
      stateValue: "created",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(spawnReceipt!, {
      status: "applied_now",
      structuralTool: "spawn_item",
      targetRef: "Mira Voss",
      stateKey: "possession",
      stateValue: "Stamped Delay Report",
    })).toBe(true);
    expect(receiptBacksAppliedStateEffect(spawnReceipt!, {
      status: "applied_now",
      structuralTool: "spawn_item",
      targetRef: "Stamped Delay Report",
      stateKey: "possession",
      stateValue: "carried by Mira Voss",
    })).toBe(true);
    expect(receiptBacksAppliedStateEffect(poiReceipt!, {
      status: "applied_now",
      structuralTool: "create_minor_poi",
      targetRef: "location-court-annex",
      stateKey: "visibility",
      stateValue: "visible",
    })).toBe(false);
    expect(receiptBacksAppliedStateEffect(revealReceipt!, {
      status: "applied_now",
      structuralTool: "reveal_location",
      targetRef: "location-court-annex",
      stateKey: "visibility",
      stateValue: "revealed",
    })).toBe(false);
  });
});
