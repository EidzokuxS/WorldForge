import { describe, expect, it } from "vitest";

import {
  buildRuntimeReceiptPlan,
  canRuntimeToolSatisfyRequirement,
  canRuntimeToolSatisfyReceiptPlan,
  evaluateRuntimeReceiptPlanStatus,
  getRuntimeRequirementStructuralRoutingStatus,
  isAcceptedRuntimeReceipt,
  isAcceptedRuntimeReceiptForActorProcess,
  isAcceptedRuntimeReceiptForPlan,
  isRuntimeReceiptAllowedByPlan,
  isAcceptedRuntimeReceiptForTurn,
  isAcceptedTerminalToolResult,
  MODEL_TOOL_CONTRACTS,
  modelToolHasRole,
  modelToolIsSideEffecting,
  RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS,
  RUNTIME_EXECUTION_AUTHORITY_TOOL_NAMES,
  RUNTIME_STATE_BEARING_TOOL_NAMES,
  RUNTIME_TOOL_CONTRACTS,
  runtimeRequirementStateMutationTools,
  runtimeToolRequiresExecutionAuthority,
  runtimeToolIsSideEffecting,
} from "../tool-contracts.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "../tool-schemas.js";
import type { ToolResult } from "../tool-result.js";
import { RUNTIME_TOOL_DESCRIPTORS } from "../runtime-tool-descriptors.js";

function withAuthority(
  result: ToolResult,
  stateDeltaRefs: string[] = ["state:delta"],
  eventRefs: string[] = [],
  knowledgeOutputs: string[] = [],
): ToolResult {
  return {
    ...result,
    authority: {
      toolResultId: "tool-result-1",
      campaignId: "campaign-1",
      sourceEntity: { type: "system", id: "test" },
      baseWorldVersion: 1,
      resultWorldVersion: 2,
      elapsedWorldTimeMinutes: 1,
      stateDeltaRefs,
      eventRefs,
      witnesses: [],
      knowledgeOutputs,
      visibilityOutputs: [],
      resources: [],
    },
  };
}

function withWorldFactAuthority(result: ToolResult): ToolResult {
  const payload = result.result && typeof result.result === "object" && !Array.isArray(result.result)
    ? result.result as Record<string, unknown>
    : {};
  const knowledgeId = typeof payload.knowledgeId === "string" ? payload.knowledgeId : "knowledge-1";
  const factRef = typeof payload.factRef === "string" ? payload.factRef : `knowledge:${knowledgeId}`;
  return withAuthority({
    ...result,
    result: {
      ...payload,
      knowledgeId,
      factRef,
      durability: "durable",
      persisted: true,
    },
  }, ["world:fact"], [], [knowledgeId, factRef]);
}

function withDialogueAuthority(result: ToolResult): ToolResult {
  const payload = result.result && typeof result.result === "object" && !Array.isArray(result.result)
    ? result.result as Record<string, unknown>
    : {};
  const eventId = typeof payload.eventId === "string" ? payload.eventId : "event-dialogue-1";
  const knowledgeId = typeof payload.knowledgeId === "string" ? payload.knowledgeId : null;
  const factRef = typeof payload.factRef === "string" ? payload.factRef : null;
  const knowledgeRefs = [knowledgeId, factRef].filter((ref): ref is string => Boolean(ref));
  const stateDeltaRefs = [
    "world:dialogue",
    "world:event",
    ...(knowledgeRefs.length > 0 ? ["world:fact"] : []),
  ];
  return withAuthority({
    ...result,
    result: {
      ...payload,
      eventId,
    },
  }, stateDeltaRefs, [eventId], knowledgeRefs);
}

function withoutResultWorldVersion(result: ToolResult): ToolResult {
  const authority = result.authority;
  if (!authority) return result;
  const { resultWorldVersion: _resultWorldVersion, ...rest } = authority;
  return {
    ...result,
    authority: rest,
  };
}

describe("tool contracts", () => {
  const acceptedWorldFact: ToolResult = withWorldFactAuthority({
    success: true,
    status: "success",
    result: {
      factKind: "contradiction",
      topicKind: "procedure",
      truthStatus: "disputed",
      knowledgeId: "knowledge-procedure-1",
      factRef: "knowledge:knowledge-procedure-1",
      durability: "durable",
      persisted: true,
    },
  });

  it("has a runtime contract for every runtimeToolInputSchemas key", () => {
    const runtimeSchemaToolNames = Object.keys(runtimeToolInputSchemas).sort();
    const runtimeContractToolNames = Object.keys(RUNTIME_TOOL_CONTRACTS).sort();
    const runtimeDescriptorToolNames = Object.keys(RUNTIME_TOOL_DESCRIPTORS).sort();

    expect(runtimeDescriptorToolNames).toEqual(runtimeSchemaToolNames);
    expect(runtimeContractToolNames).toEqual(runtimeSchemaToolNames);
    for (const toolName of runtimeSchemaToolNames as RuntimeToolName[]) {
      expect(RUNTIME_TOOL_CONTRACTS[toolName].toolName).toBe(toolName);
      expect(RUNTIME_TOOL_CONTRACTS[toolName]).toMatchObject({
        toolName: RUNTIME_TOOL_DESCRIPTORS[toolName].toolName,
        roles: [...RUNTIME_TOOL_DESCRIPTORS[toolName].roles],
      });
    }
  });

  it("classifies proposal typed tools as side-effecting model tools", () => {
    expect(modelToolIsSideEffecting("record_location_event")).toBe(true);
    expect(modelToolIsSideEffecting("actor_decision")).toBe(true);
    expect(MODEL_TOOL_CONTRACTS.record_location_event.roles).toEqual(
      expect.arrayContaining(["state_mutation", "side_effect"]),
    );
    expect(MODEL_TOOL_CONTRACTS.actor_decision.roles).toEqual(
      expect.arrayContaining(["state_mutation", "side_effect"]),
    );
  });

  it("keeps helper observation and UI suggestion tools non-side-effecting unless explicitly marked", () => {
    for (const [toolName, contract] of Object.entries(MODEL_TOOL_CONTRACTS)) {
      const helperOrUiOnly = contract.roles.some((role) =>
        role === "helper_observation" || role === "ui_suggestion")
        && !contract.roles.some((role) =>
          role === "state_mutation"
          || role === "terminal_receipt"
          || role === "time_effect"
          || role === "legacy_scene_beat"
          || role === "side_effect");

      if (helperOrUiOnly) {
        expect(modelToolIsSideEffecting(toolName as keyof typeof MODEL_TOOL_CONTRACTS)).toBe(false);
      }
    }
  });

  it("derives runtime execution authority from tool contract roles", () => {
    const derivedStateBearingTools = [...RUNTIME_STATE_BEARING_TOOL_NAMES].sort();
    const derivedAuthorityTools = [...RUNTIME_EXECUTION_AUTHORITY_TOOL_NAMES].sort();
    const expectedStateBearingTools = (Object.keys(RUNTIME_TOOL_CONTRACTS) as RuntimeToolName[])
      .filter((toolName) => runtimeToolIsSideEffecting(toolName))
      .sort();
    const expectedAuthorityTools = (Object.keys(RUNTIME_TOOL_CONTRACTS) as RuntimeToolName[])
      .filter((toolName) => runtimeToolRequiresExecutionAuthority(toolName))
      .sort();

    expect(derivedStateBearingTools).toEqual(expectedStateBearingTools);
    expect(derivedAuthorityTools).toEqual(expectedAuthorityTools);
    expect(derivedStateBearingTools).toEqual(
      expect.arrayContaining([
        "record_dialogue_outcome",
        "record_world_fact",
        "add_tag",
        "log_event",
        "advance_time",
        "start_search",
        "record_player_intent",
        "transfer_item",
      ]),
    );
    expect(derivedStateBearingTools).not.toEqual(
      expect.arrayContaining([
        "inspect_known_fact",
        "check_route",
        "request_contested_outcome",
        "offer_quick_actions",
      ]),
    );
    expect(derivedAuthorityTools).toEqual(expect.arrayContaining(["offer_quick_actions"]));
    expect(runtimeToolIsSideEffecting("offer_quick_actions")).toBe(false);

    for (const toolName of Object.keys(runtimeToolInputSchemas) as RuntimeToolName[]) {
      expect(runtimeToolRequiresExecutionAuthority(toolName)).toBe(
        runtimeToolIsSideEffecting(toolName) || modelToolHasRole(toolName, "authority_handle"),
      );
    }
  });

  it("accepts only successful required terminal receipts", () => {
    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: acceptedWorldFact,
      requirement: { kind: "world_fact", topicKind: "procedure" },
    })).toBe(true);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: {
        success: true,
        status: "success",
        result: {
          factKind: "contradiction",
          topicKind: "procedure",
          truthStatus: "disputed",
        },
      },
      requirement: { kind: "world_fact", topicKind: "procedure" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "inspect_known_fact",
      result: {
        success: true,
        status: "success",
        kind: "observation",
        observationOnly: true,
      },
      requirement: { kind: "world_fact", topicKind: "procedure" },
    })).toBe(false);
  });

  it("rejects failed or mismatched terminal attempts as receipts", () => {
    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: {
        success: false,
        status: "failure",
        error: "Tool grounding failed",
        contractFailure: {
          code: "invalid_source_ref",
          path: "input.sourceRefs.0",
          retryable: true,
          invalidRef: "raw-id",
          refHints: ["knowledge:fact-1"],
          message: "raw-id is not legal",
        },
      },
      requirement: { kind: "world_fact", topicKind: "procedure" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: acceptedWorldFact,
      requirement: { kind: "world_fact", topicKind: "route" },
    })).toBe(false);
  });

  it("requires terminal authority to match concrete tool-specific refs", () => {
    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: withAuthority({
        success: true,
        status: "success",
        result: {
          factKind: "rule",
          topicKind: "procedure",
          truthStatus: "established",
          durability: "durable",
          persisted: true,
        },
      }),
      requirement: { kind: "world_fact", topicKind: "procedure", durability: "durable" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: withAuthority({
        success: true,
        status: "success",
        result: {
          knowledgeId: "knowledge-1",
          factRef: "knowledge:knowledge-1",
          factKind: "rule",
          topicKind: "procedure",
          truthStatus: "established",
          durability: "durable",
          persisted: true,
        },
      }),
      requirement: { kind: "world_fact", topicKind: "procedure", durability: "durable" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: withAuthority({
        success: true,
        status: "success",
        result: {
          knowledgeId: "knowledge-1",
          factRef: "knowledge:knowledge-1",
          factKind: "rule",
          topicKind: "procedure",
          truthStatus: "established",
          durability: "durable",
          persisted: true,
        },
      }, [], [], ["knowledge-1", "knowledge:knowledge-1"]),
      requirement: { kind: "world_fact", topicKind: "procedure", durability: "durable" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withAuthority({
        success: true,
        status: "success",
        result: {
          eventId: "event-dialogue-1",
          outcomeKind: "answered",
          topicKind: "procedure",
          truthStatus: "speaker_asserted",
          durability: "durable",
          persisted: true,
        },
      }),
      requirement: { kind: "dialogue_outcome", topicKind: "procedure", durability: "durable" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withAuthority({
        success: true,
        status: "success",
        result: {
          eventId: "event-dialogue-1",
          knowledgeId: "knowledge-dialogue-1",
          factRef: "knowledge:knowledge-dialogue-1",
          outcomeKind: "answered",
          topicKind: "procedure",
          truthStatus: "speaker_asserted",
          durability: "durable",
          persisted: true,
        },
      }, [], ["event-dialogue-1"]),
      requirement: { kind: "dialogue_outcome", topicKind: "procedure", durability: "durable" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withAuthority({
        success: true,
        status: "success",
        result: {
          eventId: "event-dialogue-1",
          knowledgeId: "knowledge-dialogue-1",
          factRef: "knowledge:knowledge-dialogue-1",
          outcomeKind: "answered",
          topicKind: "procedure",
          truthStatus: "speaker_asserted",
          durability: "durable",
          persisted: true,
        },
      }, ["world:dialogue", "world:event", "world:fact"], ["event-dialogue-1"], ["knowledge-dialogue-1", "knowledge:knowledge-dialogue-1"]),
      requirement: { kind: "dialogue_outcome", topicKind: "procedure", durability: "durable" },
    })).toBe(true);
  });

  it("requires compatible terminal payload fields for typed GM requirements", () => {
    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: {
        success: true,
        status: "success",
        result: {
          factKind: "rule",
          topicKind: "route",
          truthStatus: "established",
          durability: "durable",
          persisted: true,
        },
      },
      requirement: { kind: "world_fact", topicKind: "procedure", durability: "durable" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: {
        success: true,
        status: "success",
        result: {
          factKind: "rule",
          topicKind: "procedure",
          truthStatus: "established",
          durability: "scene_local",
          persisted: false,
        },
      },
      requirement: { kind: "world_fact", topicKind: "procedure", durability: "durable" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: withWorldFactAuthority({
        success: true,
        status: "success",
        result: {
          factKind: "rule",
          topicKind: "procedure",
          truthStatus: "established",
          durability: "durable",
          persisted: true,
        },
      }),
      requirement: { kind: "world_fact", topicKind: "procedure", durability: "durable" },
    })).toBe(true);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: {
        success: true,
        status: "success",
        result: {
          outcomeKind: "answered",
          topicKind: "procedure",
          truthStatus: "speaker_asserted",
          durability: "durable",
          persisted: true,
          futureUseKind: "route_choice",
          futureRelevance: "The answer names a real office route for later use.",
        },
      },
      requirement: { kind: "dialogue_outcome", topicKind: "procedure", durability: "scene_local" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: {
        success: true,
        status: "success",
        result: {
          outcomeKind: "answered",
          topicKind: "social",
          truthStatus: "speaker_asserted",
          durability: "durable",
          persisted: true,
          futureUseKind: "npc_memory",
          futureRelevance: "The clerk made a harmless joke.",
        },
      },
      requirement: { kind: "dialogue_outcome", topicKind: "social", durability: "scene_local" },
    })).toBe(false);
  });

  it("requires world-version authority for payload-durable terminal receipts even when requirement omits durability", () => {
    const durableWorldFact = withWorldFactAuthority({
      success: true,
      status: "success",
      result: {
        factKind: "rule",
        topicKind: "procedure",
        truthStatus: "established",
        durability: "durable",
        persisted: true,
      },
    });

    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: withoutResultWorldVersion(durableWorldFact),
      requirement: { kind: "world_fact", topicKind: "procedure" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_world_fact",
      result: durableWorldFact,
      requirement: { kind: "world_fact", topicKind: "procedure" },
    })).toBe(true);

    const durableDialogueOutcome = withDialogueAuthority({
      success: true,
      status: "success",
      result: {
        outcomeKind: "answered",
        topicKind: "procedure",
        truthStatus: "speaker_asserted",
        durability: "durable",
        persisted: true,
        futureUseKind: "route_choice",
        futureRelevance: "The answer names a real office route for later use.",
      },
    });

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withoutResultWorldVersion(durableDialogueOutcome),
      requirement: { kind: "dialogue_outcome", topicKind: "procedure" },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: durableDialogueOutcome,
      requirement: { kind: "dialogue_outcome", topicKind: "procedure" },
    })).toBe(true);
  });

  it("requires backed applied_now effects or an explicit non-application outcome kind when dialogue must settle structural state", () => {
    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withDialogueAuthority({
        success: true,
        status: "success",
        result: {
          outcomeKind: "accepted",
          topicKind: "permission",
          durability: "durable",
          persisted: true,
          stateEffects: [],
        },
      }),
      requirement: {
        kind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withDialogueAuthority({
        success: true,
        status: "success",
        result: {
          outcomeKind: "accepted",
          topicKind: "permission",
          durability: "durable",
          persisted: true,
          stateEffects: [{
            status: "applied_now",
            structuralTool: "add_tag",
            targetRef: "npc:warden",
            stateKey: "access_granted",
          }],
        },
      }),
      requirement: {
        kind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withDialogueAuthority({
        success: true,
        status: "success",
        result: {
          outcomeKind: "accepted",
          topicKind: "permission",
          durability: "durable",
          persisted: true,
          stateEffects: [{
            status: "applied_now",
            structuralTool: "add_tag",
            targetRef: "npc:warden",
            stateKey: "access",
            stateValue: "granted",
          }],
        },
      }),
      requirement: {
        kind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withDialogueAuthority({
        success: true,
        status: "success",
        result: {
          outcomeKind: "accepted",
          topicKind: "permission",
          durability: "durable",
          persisted: true,
          stateEffects: [{
            status: "applied_now",
            structuralTool: "add_tag",
            targetRef: "npc:warden",
            stateKey: "access",
            stateValue: "granted",
          }],
        },
      }),
      requirement: {
        kind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
      appliedStructuralEffectProofs: [{
        structuralTool: "add_tag",
        targetRef: "npc:warden",
        stateKey: "access",
        stateValue: "granted",
      }],
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withDialogueAuthority({
        success: true,
        status: "success",
        result: {
          outcomeKind: "accepted",
          topicKind: "permission",
          durability: "durable",
          persisted: true,
          stateEffects: [{
            effectId: "effect-1",
            status: "applied_now",
            stateChangeRef: "state_change_1_1",
            summary: "The backend resolves the concrete state from the prior receipt.",
          }],
        },
      }),
      requirement: {
        kind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
      appliedStructuralEffectProofs: [{
        structuralTool: "add_tag",
        targetRef: "npc:warden",
        stateKey: "access",
        stateValue: "granted",
        stateChangeRef: "state_change_1_1",
        toolResultId: "tool-result-add-tag-1",
      }],
    })).toBe(true);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withDialogueAuthority({
        success: true,
        status: "success",
        result: {
          outcomeKind: "accepted",
          topicKind: "permission",
          durability: "durable",
          persisted: true,
          stateEffects: [{
            status: "applied_now",
            structuralTool: "transfer_item",
            targetRef: "item:permit",
            stateKey: "possession",
            stateValue: "carried by Player",
          }],
        },
      }),
      requirement: {
        kind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
      appliedStructuralEffectProofs: [{
        structuralTool: "transfer_item",
        targetRef: "item:permit",
        stateKey: "possession",
        stateValue: "carried by Player",
      }],
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withDialogueAuthority({
        success: true,
        status: "success",
        result: {
          outcomeKind: "accepted",
          topicKind: "permission",
          durability: "durable",
          persisted: true,
          stateEffects: [{
            status: "applied_now",
            structuralTool: "transfer_item",
            targetRef: "npc:warden",
            stateKey: "access",
            stateValue: "granted",
          }],
        },
      }),
      requirement: {
        kind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withDialogueAuthority({
        success: true,
        status: "success",
        result: {
          outcomeKind: "refused",
          topicKind: "permission",
          durability: "durable",
          persisted: true,
          stateEffects: [],
        },
      }),
      requirement: {
        kind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withDialogueAuthority({
        success: true,
        status: "success",
        result: {
          outcomeKind: "refused",
          topicKind: "permission",
          durability: "durable",
          persisted: true,
          stateEffects: [{
            effectId: "effect-not-applied",
            status: "not_applied",
            effectKind: "entity_tag",
            summary: "The clerk refused to apply the access tag.",
          }],
        },
      }),
      requirement: {
        kind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    })).toBe(true);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withDialogueAuthority({
        success: true,
        status: "success",
        result: {
          outcomeKind: "no_current_answer",
          topicKind: "procedure",
          durability: "durable",
          persisted: true,
          stateEffects: [{
            effectId: "movement-not-applied",
            status: "not_applied",
            effectKind: "movement",
            summary: "No one currently confirms the route after arrival.",
          }],
        },
      }),
      requirement: {
        kind: "dialogue_outcome",
        topicKind: "procedure",
        durability: "durable",
        requiresStructuralEffect: true,
        effectKinds: ["movement"],
      },
    })).toBe(false);

    expect(isAcceptedTerminalToolResult({
      toolName: "record_dialogue_outcome",
      result: withDialogueAuthority({
        success: true,
        status: "success",
        result: {
          outcomeKind: "answered",
          topicKind: "permission",
          durability: "durable",
          persisted: true,
          stateEffects: [{ status: "not_applied", stateKey: "possession" }],
        },
      }),
      requirement: {
        kind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    })).toBe(false);
  });

  it("does not credit time or intent markers as state mutation receipts", () => {
    expect(isAcceptedRuntimeReceipt({
      toolName: "add_tag",
      result: withAuthority({
        success: true,
        status: "success",
        result: { entity: "Gate Guard", tags: ["convinced"] },
      }),
      requirement: { kind: "state_mutation", effectKind: "entity_tag" },
    })).toBe(true);

    expect(isAcceptedRuntimeReceipt({
      toolName: "add_chronicle_entry",
      result: withAuthority({
        success: true,
        status: "success",
        result: { entryId: "chronicle-1" },
      }),
      requirement: { kind: "state_mutation", effectKind: "chronicle_entry" },
    })).toBe(true);

    expect(isAcceptedRuntimeReceipt({
      toolName: "add_tag",
      result: withAuthority({
        success: true,
        status: "success",
        result: { entity: "Gate Guard", tags: ["convinced"] },
      }),
      requirement: { kind: "state_mutation" },
    })).toBe(false);

    expect(isAcceptedRuntimeReceipt({
      toolName: "advance_time",
      result: {
        success: true,
        status: "success",
        result: { minutes: 10 },
      },
      requirement: { kind: "state_mutation" },
    })).toBe(false);

    expect(isAcceptedRuntimeReceipt({
      toolName: "record_player_intent",
      result: {
        success: true,
        status: "success",
        result: { intentId: "intent-1" },
      },
      requirement: { kind: "state_mutation" },
    })).toBe(false);
  });

  it("treats intent/search tools as side-effecting but not receipt-bearing", () => {
    for (const toolName of ["record_player_intent", "start_search"] as const) {
      expect(runtimeToolIsSideEffecting(toolName)).toBe(true);
      expect(isAcceptedRuntimeReceipt({
        toolName,
        result: {
          success: true,
          status: "success",
          result: { id: `${toolName}-1` },
        },
        requirement: { kind: "state_mutation" },
      })).toBe(false);
      expect(isAcceptedRuntimeReceiptForTurn({
        toolName,
        result: {
          success: true,
          status: "success",
          result: { id: `${toolName}-1` },
        },
        requirement: null,
      })).toBe(false);
    }
  });

  it("treats contested outcome requests as helper evidence but never receipt-bearing", () => {
    const result: ToolResult = {
      success: true,
      status: "success",
      kind: "observation",
      observationOnly: true,
      result: {
        outcomeTier: "success_with_cost",
      },
    };

    expect(RUNTIME_TOOL_CONTRACTS.request_contested_outcome.roles).toEqual(
      expect.arrayContaining(["helper_observation", "authority_bounds"]),
    );
    expect(RUNTIME_TOOL_CONTRACTS.request_contested_outcome.roles).not.toContain("side_effect");
    expect(modelToolIsSideEffecting("request_contested_outcome")).toBe(false);
    expect(runtimeToolIsSideEffecting("request_contested_outcome")).toBe(false);
    for (const requirement of [
      { kind: "state_mutation" },
      { kind: "dialogue_outcome" },
      { kind: "world_fact" },
      { kind: "scene_beat", beatKind: "event_log" },
    ] as const) {
      expect(isAcceptedRuntimeReceipt({
        toolName: "request_contested_outcome",
        result,
        requirement,
      })).toBe(false);
      expect(canRuntimeToolSatisfyRequirement(
        "request_contested_outcome",
        requirement,
      )).toBe(false);
    }
  });

  it("does not credit observation-only reuse as a mutation receipt", () => {
    expect(isAcceptedRuntimeReceipt({
      toolName: "create_scene_extra",
      result: {
        success: true,
        status: "success",
        kind: "observation",
        observationOnly: true,
        result: {
          id: "npc-existing",
          name: "Existing Clerk",
          reusedExisting: true,
        },
      },
      requirement: { kind: "state_mutation", effectKind: "support_actor_created" },
    })).toBe(false);

    expect(isAcceptedRuntimeReceipt({
      toolName: "create_scene_extra",
      result: withAuthority({
        success: true,
        status: "success",
        result: {
          id: "npc-new",
          name: "New Clerk",
        },
      }, ["npc:npc-new:presence"]),
      requirement: { kind: "state_mutation", effectKind: "support_actor_created" },
    })).toBe(true);
  });

  it("identifies which tools can satisfy typed runtime requirements before model calls", () => {
    expect(canRuntimeToolSatisfyRequirement(
      "record_world_fact",
      { kind: "world_fact", durability: "durable" },
    )).toBe(true);
    expect(canRuntimeToolSatisfyRequirement(
      "inspect_known_fact",
      { kind: "world_fact", durability: "durable" },
    )).toBe(false);
    expect(canRuntimeToolSatisfyRequirement(
      "inspect_known_fact",
      { kind: "observation_read" },
    )).toBe(true);
    expect(canRuntimeToolSatisfyRequirement(
      "log_event",
      { kind: "observation_read" },
    )).toBe(false);
    expect(canRuntimeToolSatisfyRequirement(
      "advance_time",
      { kind: "state_mutation" },
    )).toBe(false);
    expect(canRuntimeToolSatisfyRequirement(
      "advance_time",
      { kind: "scene_beat", durability: "scene_local", beatKind: "time_passage" },
    )).toBe(true);
    expect(canRuntimeToolSatisfyRequirement(
      "advance_time",
      { kind: "scene_beat", durability: "scene_local" },
    )).toBe(false);
    expect(canRuntimeToolSatisfyRequirement(
      "move_actor",
      { kind: "state_mutation" },
    )).toBe(false);
    expect(canRuntimeToolSatisfyRequirement(
      "move_actor",
      { kind: "state_mutation", effectKind: "movement" },
    )).toBe(true);
    expect(canRuntimeToolSatisfyRequirement(
      "add_tag",
      { kind: "state_mutation", effectKind: "movement" },
    )).toBe(false);
    expect(canRuntimeToolSatisfyRequirement(
      "add_chronicle_entry",
      { kind: "state_mutation", effectKind: "chronicle_entry" },
    )).toBe(true);
    expect(canRuntimeToolSatisfyRequirement(
      "log_event",
      { kind: "scene_beat", durability: "durable", beatKind: "event_log" },
    )).toBe(false);
    expect(canRuntimeToolSatisfyRequirement(
      "log_event",
      { kind: "scene_beat", durability: "scene_local", beatKind: "event_log" },
    )).toBe(true);
    expect(canRuntimeToolSatisfyRequirement(
      "log_event",
      { kind: "scene_beat", durability: "durable" },
    )).toBe(false);
  });

  it("keeps every runtime state effect kind mapped to at least one receipt-capable owner", () => {
    for (const effectKind of RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS) {
      const ownerTools = runtimeRequirementStateMutationTools({
        kind: "state_mutation",
        effectKind,
      });

      expect(ownerTools.length).toBeGreaterThan(0);
      for (const ownerTool of ownerTools) {
        expect(canRuntimeToolSatisfyRequirement(ownerTool, {
          kind: "state_mutation",
          effectKind,
        })).toBe(true);
        expect(canRuntimeToolSatisfyRequirement(ownerTool, {
          kind: "scene_beat",
          durability: "scene_local",
          effectKind,
        })).toBe(true);
      }
    }
  });

  it("keeps player-turn state effect ownership canonical and exclusive", () => {
    expect(runtimeRequirementStateMutationTools({
      kind: "state_mutation",
      effectKind: "movement",
    })).toEqual(["move_actor"]);
    expect(runtimeRequirementStateMutationTools({
      kind: "state_mutation",
      effectKind: "support_actor_created",
    })).toEqual(["create_scene_extra"]);
    expect(runtimeRequirementStateMutationTools({
      kind: "state_mutation",
      effectKind: "minor_poi_created",
    })).toEqual(["create_minor_poi"]);

    expect(canRuntimeToolSatisfyRequirement("move_to", {
      kind: "state_mutation",
      effectKind: "movement",
    })).toBe(false);
    expect(canRuntimeToolSatisfyRequirement("spawn_npc", {
      kind: "state_mutation",
      effectKind: "support_actor_created",
    })).toBe(false);
  });

  it("reports structural dialogue routing separately from terminal dialogue receipts", () => {
    expect(getRuntimeRequirementStructuralRoutingStatus({
      kind: "dialogue_outcome",
      durability: "durable",
      topicKind: "route",
      requiresStructuralEffect: false,
    })).toEqual({ status: "none" });

    expect(getRuntimeRequirementStructuralRoutingStatus({
      kind: "dialogue_outcome",
      durability: "durable",
      topicKind: "permission",
      requiresStructuralEffect: true,
    })).toEqual({ status: "missing_structural_owner_kind" });

    expect(getRuntimeRequirementStructuralRoutingStatus({
      kind: "dialogue_outcome",
      durability: "durable",
      topicKind: "permission",
      requiresStructuralEffect: true,
      effectKind: "entity_tag",
    })).toEqual({
      status: "has_structural_owner",
      effectKinds: ["entity_tag"],
      ownerTools: ["add_tag", "remove_tag"],
      preparatoryTools: [],
    });
  });

  it("derives an explicit receipt plan for primary mutations plus contextual time", () => {
    const plan = buildRuntimeReceiptPlan({ kind: "state_mutation", effectKind: "movement" });

    expect(plan.primary).toEqual({ kind: "state_mutation", effectKind: "movement" });
    expect(plan.secondary).toEqual([]);
    expect(plan.optionalContextual).toEqual([
      { kind: "scene_beat", durability: "scene_local", beatKind: "time_passage" },
    ]);
    expect(canRuntimeToolSatisfyReceiptPlan("move_actor", plan)).toBe(true);
    expect(canRuntimeToolSatisfyReceiptPlan("advance_time", plan)).toBe(true);
    expect(canRuntimeToolSatisfyReceiptPlan("log_event", plan)).toBe(false);
    expect(canRuntimeToolSatisfyRequirement(
      "advance_time",
      { kind: "state_mutation", effectKind: "movement" },
    )).toBe(false);

    const moveReceipt = withAuthority({
      success: true,
      status: "success",
      result: { locationId: "loc-overlook" },
    }, ["actor:player:location"]);
    const timeReceipt = withAuthority({
      success: true,
      status: "success",
      result: { minutes: 10, clockAdvanced: true },
    }, ["world:time"]);

    expect(isAcceptedRuntimeReceiptForPlan({
      toolName: "move_actor",
      result: moveReceipt,
      plan,
    })).toBe(true);
    expect(isRuntimeReceiptAllowedByPlan({
      toolName: "advance_time",
      result: timeReceipt,
      plan,
    })).toBe(true);
    expect(isAcceptedRuntimeReceiptForPlan({
      toolName: "advance_time",
      result: timeReceipt,
      plan,
    })).toBe(false);
    expect(isAcceptedRuntimeReceiptForPlan({
      toolName: "log_event",
      result: withAuthority({
        success: true,
        status: "success",
        result: { eventId: "event-1", durability: "scene_local", persisted: false },
      }, ["world:event"]),
      plan,
    })).toBe(false);

    expect(evaluateRuntimeReceiptPlanStatus({
      plan,
      receipts: [{ toolName: "advance_time", result: timeReceipt }],
    })).toMatchObject({
      primarySatisfied: false,
      contextualAccepted: false,
      acceptedReceiptIndexes: [],
      complete: false,
    });
    expect(evaluateRuntimeReceiptPlanStatus({
      plan,
      receipts: [{ toolName: "move_actor", result: moveReceipt }],
    })).toMatchObject({
      primarySatisfied: true,
      contextualAccepted: false,
      acceptedReceiptIndexes: [0],
      complete: true,
    });
    expect(evaluateRuntimeReceiptPlanStatus({
      plan,
      receipts: [
        { toolName: "move_actor", result: moveReceipt },
        { toolName: "advance_time", result: timeReceipt },
      ],
    })).toMatchObject({
      primarySatisfied: true,
      contextualAccepted: true,
      acceptedReceiptIndexes: [0, 1],
      complete: true,
    });
  });

  it("accepts only one primary receipt per runtime plan", () => {
    const plan = buildRuntimeReceiptPlan({
      kind: "dialogue_outcome",
      durability: "durable",
      topicKind: "proof",
    });
    const firstDialogueReceipt = withDialogueAuthority({
      success: true,
      status: "success",
      result: {
        eventId: "event-first-proof",
        durability: "durable",
        topicKind: "proof",
        futureUseKind: "permission_check",
        futureRelevance: "The first answer is the authoritative turn closure.",
        persisted: true,
      },
    });
    const duplicateDialogueReceipt = withDialogueAuthority({
      success: true,
      status: "success",
      result: {
        eventId: "event-second-proof",
        durability: "durable",
        topicKind: "proof",
        futureUseKind: "permission_check",
        futureRelevance: "The duplicate answer must not also close the same turn.",
        persisted: true,
      },
    });

    expect(evaluateRuntimeReceiptPlanStatus({
      plan,
      receipts: [
        { toolName: "record_dialogue_outcome", result: firstDialogueReceipt },
        { toolName: "record_dialogue_outcome", result: duplicateDialogueReceipt },
      ],
    })).toMatchObject({
      primarySatisfied: true,
      secondarySatisfied: true,
      acceptedReceiptIndexes: [0],
      complete: true,
    });
  });

  it("accepts dialogue-time context only after the dialogue terminal receipt is satisfied", () => {
    const plan = buildRuntimeReceiptPlan({
      kind: "dialogue_outcome",
      durability: "durable",
      topicKind: "proof",
    });

    expect(plan.primary).toEqual({
      kind: "dialogue_outcome",
      durability: "durable",
      topicKind: "proof",
    });
    expect(plan.secondary).toEqual([]);
    expect(plan.optionalContextual).toEqual([
      { kind: "scene_beat", durability: "scene_local", beatKind: "time_passage" },
    ]);
    expect(canRuntimeToolSatisfyReceiptPlan("record_dialogue_outcome", plan)).toBe(true);
    expect(canRuntimeToolSatisfyReceiptPlan("advance_time", plan)).toBe(true);

    const dialogueReceipt = withDialogueAuthority({
      success: true,
      status: "success",
      result: {
        eventId: "event-proof-answer",
        durability: "durable",
        topicKind: "proof",
        futureUseKind: "permission_check",
        futureRelevance: "The answer constrains later permit checks.",
        persisted: true,
      },
    });
    const timeReceipt = withAuthority({
      success: true,
      status: "success",
      result: { minutes: 6, clockAdvanced: true },
    }, ["world:time"]);

    expect(evaluateRuntimeReceiptPlanStatus({
      plan,
      receipts: [{ toolName: "advance_time", result: timeReceipt }],
    })).toMatchObject({
      primarySatisfied: false,
      contextualAccepted: false,
      acceptedReceiptIndexes: [],
      complete: false,
    });
    expect(evaluateRuntimeReceiptPlanStatus({
      plan,
      receipts: [
        { toolName: "advance_time", result: timeReceipt },
        { toolName: "record_dialogue_outcome", result: dialogueReceipt },
      ],
    })).toMatchObject({
      primarySatisfied: true,
      contextualAccepted: true,
      acceptedReceiptIndexes: [0, 1],
      complete: true,
    });
  });

  it("requires durable scene-beat receipts to be durably persisted", () => {
    expect(isAcceptedRuntimeReceipt({
      toolName: "log_event",
      result: {
        success: true,
        status: "success",
        result: { durability: "scene_local", persisted: false },
      },
      requirement: { kind: "scene_beat", durability: "durable", beatKind: "event_log" },
    })).toBe(false);

    expect(isAcceptedRuntimeReceipt({
      toolName: "log_event",
      result: {
        success: true,
        status: "success",
        result: { durability: "durable", persisted: false },
      },
      requirement: { kind: "scene_beat", durability: "durable", beatKind: "event_log" },
    })).toBe(false);

    expect(isAcceptedRuntimeReceipt({
      toolName: "log_event",
      result: {
        success: true,
        status: "success",
        result: { eventId: "event-1", durability: "durable", persisted: true },
      },
      requirement: { kind: "scene_beat", durability: "durable", beatKind: "event_log" },
    })).toBe(false);

    expect(isAcceptedRuntimeReceipt({
      toolName: "log_event",
      result: withAuthority({
        success: true,
        status: "success",
        result: { eventId: "event-1", durability: "durable", persisted: true },
      }, ["event-1"]),
      requirement: { kind: "scene_beat", durability: "durable", beatKind: "event_log" },
    })).toBe(false);

    expect(isAcceptedRuntimeReceipt({
      toolName: "log_event",
      result: {
        success: true,
        status: "success",
        result: { eventId: "event-1", durability: "durable", persisted: true },
        authority: {
          toolResultId: "tool-result-1",
          campaignId: "campaign-1",
          sourceEntity: { type: "system", id: "test" },
          baseWorldVersion: 1,
          elapsedWorldTimeMinutes: 1,
          stateDeltaRefs: ["event-1"],
          eventRefs: ["event-1"],
          witnesses: [],
          knowledgeOutputs: [],
          visibilityOutputs: [],
          resources: [],
        },
      },
      requirement: { kind: "scene_beat", durability: "durable", beatKind: "event_log" },
    })).toBe(false);

    expect(isAcceptedRuntimeReceipt({
      toolName: "log_event",
      result: withAuthority({
        success: true,
        status: "success",
        result: { eventId: "event-1", durability: "durable", persisted: true },
      }, [], ["event-1"]),
      requirement: { kind: "scene_beat", durability: "durable", beatKind: "event_log" },
    })).toBe(false);

    expect(isAcceptedRuntimeReceipt({
      toolName: "log_event",
      result: withAuthority({
        success: true,
        status: "success",
        result: { eventId: "event-2", durability: "scene_local", persisted: false },
      }, ["world:event"]),
      requirement: { kind: "scene_beat", durability: "scene_local", beatKind: "event_log" },
    })).toBe(true);

    expect(isAcceptedRuntimeReceiptForTurn({
      toolName: "log_event",
      result: {
        success: true,
        status: "success",
        result: { eventId: "event-raw", durability: "durable", persisted: true },
      },
      requirement: null,
    })).toBe(false);

    expect(isAcceptedRuntimeReceipt({
      toolName: "add_chronicle_entry",
      result: withAuthority({
        success: true,
        status: "success",
        result: { entryId: "chronicle-1" },
      }),
      requirement: { kind: "scene_beat", durability: "durable", effectKind: "chronicle_entry" },
    })).toBe(true);

    expect(isAcceptedRuntimeReceipt({
      toolName: "add_chronicle_entry",
      result: withAuthority({
        success: true,
        status: "success",
        result: { entryId: "chronicle-1" },
      }),
      requirement: { kind: "scene_beat", durability: "durable" },
    })).toBe(false);
  });

  it("uses one shared fallback acceptance contract when GM Read has no typed requirement", () => {
    expect(isAcceptedRuntimeReceiptForTurn({
      toolName: "set_condition",
      result: withAuthority({
        success: true,
        status: "success",
        result: { entity: "Player", condition: "winded", newHp: 4 },
      }),
      requirement: null,
    })).toBe(true);

    expect(isAcceptedRuntimeReceiptForTurn({
      toolName: "advance_time",
      result: withAuthority({
        success: true,
        status: "success",
        result: { minutes: 10 },
      }, ["world_time", "elapsed:10"]),
      requirement: null,
    })).toBe(true);

    expect(isAcceptedRuntimeReceiptForTurn({
      toolName: "log_event",
      result: withAuthority({
        success: true,
        status: "success",
        result: { eventId: "event-local", durability: "scene_local", persisted: false },
      }, ["world:event"]),
      requirement: null,
    })).toBe(true);

    expect(isAcceptedRuntimeReceiptForTurn({
      toolName: "log_event",
      result: withAuthority({
        success: true,
        status: "success",
        result: { eventId: "event-durable", durability: "durable", persisted: true },
      }, ["event-durable"], ["event-durable"]),
      requirement: null,
    })).toBe(false);

    expect(isAcceptedRuntimeReceiptForActorProcess({
      toolName: "log_event",
      result: withAuthority({
        success: true,
        status: "success",
        result: { eventId: "event-actor-memory", durability: "durable", persisted: true },
      }, [], ["event-actor-memory"]),
      requirement: null,
    })).toBe(true);

    const actorMoveToBase = withAuthority({
      success: true,
      status: "success",
      result: {
        actorId: "npc-key",
        actorName: "Watcher",
        locationId: "loc-b",
        locationName: "Station B",
      },
    }, ["npc:npc-key:location", "location:loc-b"]);
    const actorMoveToReceipt: ToolResult = {
      ...actorMoveToBase,
      authority: {
        ...actorMoveToBase.authority!,
        sourceEntity: { type: "npc", id: "npc-key" },
      },
    };
    expect(isAcceptedRuntimeReceiptForActorProcess({
      toolName: "move_to",
      result: actorMoveToReceipt,
      requirement: null,
    })).toBe(true);

    const playerMoveToReceipt: ToolResult = {
      ...withAuthority({
        success: true,
        status: "success",
        result: {
          playerId: "player-1",
          locationId: "loc-b",
          locationName: "Station B",
        },
      }, ["player:player-1:location", "location:loc-b"]),
      authority: {
        ...actorMoveToBase.authority!,
        sourceEntity: { type: "player", id: "player-1" },
        stateDeltaRefs: ["player:player-1:location", "location:loc-b"],
      },
    };
    expect(isAcceptedRuntimeReceiptForActorProcess({
      toolName: "move_to",
      result: playerMoveToReceipt,
      requirement: null,
    })).toBe(false);

    expect(isAcceptedRuntimeReceiptForTurn({
      toolName: "find_actor_candidates",
      result: {
        success: true,
        status: "success",
        kind: "observation",
        observationOnly: true,
      },
      requirement: null,
    })).toBe(false);
  });
});
