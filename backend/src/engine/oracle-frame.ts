import type { CombatEnvelope } from "./combat-envelope.js";
import {
  buildContextBudgetTrace,
  type ContextBudgetTrace,
} from "./context-budget-trace.js";

export const DURABILITY_NO_BYPASS_CLAMP_LINE =
  "Clamp: actorBypassesTarget is false and durabilityTierGap >= 2. Unless the action explicitly exploits a listed vulnerability or setup angle, keep direct frontal force at 35% chance or lower.";

export interface OracleFramePayload {
  intent: string;
  method: string;
  actorTags: string[];
  targetTags: string[];
  environmentTags: string[];
  sceneContext: string;
  combatEnvelope?: CombatEnvelope;
}

export interface OracleFrameSourceRef {
  id: string;
  kind:
    | "action"
    | "actor_tags"
    | "target_tags"
    | "environment_tags"
    | "scene_context"
    | "combat_envelope";
}

export interface OracleFrame {
  action: {
    intent: string;
    method: string;
  };
  actorTags: string[];
  targetTags: string[];
  environmentTags: string[];
  sceneContext: string;
  combatEnvelope?: CombatEnvelope;
  sourceRefs: OracleFrameSourceRef[];
  excluded: {
    hiddenProposalCount: number;
    irrelevantLoreCount: number;
    fullMemoryCount: number;
    chatHistoryCount: number;
  };
  contextBudgetTrace: ContextBudgetTrace;
}

export interface BuildOracleFrameInput {
  payload: OracleFramePayload;
  sourceRefs?: readonly OracleFrameSourceRef[];
  hiddenProposalCandidates?: readonly unknown[];
  irrelevantLoreCandidates?: readonly unknown[];
  fullMemoryCandidates?: readonly unknown[];
  chatHistoryMessages?: readonly unknown[];
}

function defaultSourceRefs(payload: OracleFramePayload): OracleFrameSourceRef[] {
  return [
    { id: "oracle-action", kind: "action" },
    { id: "oracle-actor-tags", kind: "actor_tags" },
    { id: "oracle-target-tags", kind: "target_tags" },
    { id: "oracle-environment-tags", kind: "environment_tags" },
    { id: "oracle-scene-context", kind: "scene_context" },
    ...(payload.combatEnvelope
      ? [{ id: "oracle-combat-envelope", kind: "combat_envelope" as const }]
      : []),
  ];
}

function buildCombatEnvelopeBlock(envelope: CombatEnvelope): string {
  const lines = [
    "[Combat Envelope]",
    `Matchup: ${envelope.matchup}`,
    `durabilityTierGap: ${envelope.durabilityTierGap}`,
    `speedTierGap: ${envelope.speedTierGap}`,
    `intelligenceTierGap: ${envelope.intelligenceTierGap ?? "n/a"}`,
    `actorBypassesTarget: ${String(envelope.actorBypassesTarget)}`,
    `targetBypassesActor: ${String(envelope.targetBypassesActor)}`,
    ...envelope.summaryLines.map((line) => `- ${line}`),
  ];

  if (!envelope.actorBypassesTarget && envelope.durabilityTierGap >= 2) {
    lines.push(DURABILITY_NO_BYPASS_CLAMP_LINE);
  }

  return lines.join("\n");
}

export function buildOracleFrame(input: BuildOracleFrameInput): OracleFrame {
  const excluded = {
    hiddenProposalCount: input.hiddenProposalCandidates?.length ?? 0,
    irrelevantLoreCount: input.irrelevantLoreCandidates?.length ?? 0,
    fullMemoryCount: input.fullMemoryCandidates?.length ?? 0,
    chatHistoryCount: input.chatHistoryMessages?.length ?? 0,
  };
  const sourceRefs = [...(input.sourceRefs ?? defaultSourceRefs(input.payload))];
  const visibleTexts = [
    input.payload.intent,
    input.payload.method,
    ...input.payload.actorTags,
    ...input.payload.targetTags,
    ...input.payload.environmentTags,
    input.payload.sceneContext,
    ...(input.payload.combatEnvelope ? [buildCombatEnvelopeBlock(input.payload.combatEnvelope)] : []),
  ];

  return {
    action: {
      intent: input.payload.intent,
      method: input.payload.method,
    },
    actorTags: [...input.payload.actorTags],
    targetTags: [...input.payload.targetTags],
    environmentTags: [...input.payload.environmentTags],
    sceneContext: input.payload.sceneContext,
    combatEnvelope: input.payload.combatEnvelope,
    sourceRefs,
    excluded,
    contextBudgetTrace: buildContextBudgetTrace({
      label: "OracleFrame",
      frameType: "OracleFrame",
      visibleTexts,
      visibleItemCount: visibleTexts.length,
      hiddenExcludedCount:
        excluded.hiddenProposalCount
        + excluded.irrelevantLoreCount
        + excluded.fullMemoryCount
        + excluded.chatHistoryCount,
      candidateItemCount:
        visibleTexts.length
        + excluded.hiddenProposalCount
        + excluded.irrelevantLoreCount
        + excluded.fullMemoryCount
        + excluded.chatHistoryCount,
      selectedItemCount: visibleTexts.length,
      excludedByVisibilityCount: excluded.hiddenProposalCount + excluded.fullMemoryCount,
      excludedByBudgetCount: excluded.irrelevantLoreCount + excluded.chatHistoryCount,
      sectionCounts: {
        action: 1,
        actorTags: input.payload.actorTags.length,
        targetTags: input.payload.targetTags.length,
        environmentTags: input.payload.environmentTags.length,
        sceneContext: input.payload.sceneContext ? 1 : 0,
        combatEnvelope: input.payload.combatEnvelope ? 1 : 0,
      },
      sourceCoverage: {
        sourceBackedCount: sourceRefs.length,
        routeCounts: sourceRefs.reduce<Record<string, number>>((counts, source) => {
          counts[source.kind] = (counts[source.kind] ?? 0) + 1;
          return counts;
        }, {}),
      },
      notes: [
        "OracleFrame is bounded to action, tags, scene context, mechanics, uncertainty, and source refs.",
      ],
    }),
  };
}

export function formatOracleFrameForPrompt(frame: OracleFrame): string {
  return [
    `Action: ${frame.action.intent}${frame.action.method ? ` via ${frame.action.method}` : ""}`,
    `Actor: [${frame.actorTags.join(", ")}]`,
    `Target: [${frame.targetTags.join(", ")}]`,
    `Environment: [${frame.environmentTags.join(", ")}]`,
    `Scene: ${frame.sceneContext}`,
    ...(frame.combatEnvelope ? [buildCombatEnvelopeBlock(frame.combatEnvelope)] : []),
  ].join("\n");
}
