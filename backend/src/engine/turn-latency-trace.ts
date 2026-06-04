import type { LivingWorldProposalMetrics } from "./living-world-metrics.js";

export type TurnLatencyCriticality = "L0" | "L1" | "L2" | "L3" | "L4";

export interface TurnLatencyStageClassification {
  criticality: TurnLatencyCriticality;
  blocksPlayerResponse: boolean;
  criticalPath: boolean;
  sourceStageId: string;
  route?: string;
  classificationReason?: string;
}

export interface TurnLatencyTraceStage {
  stage: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  criticality: TurnLatencyCriticality;
  blocksPlayerResponse: boolean;
  criticalPath: boolean;
  sourceStageId: string;
  route?: string;
  classificationReason?: string;
  metadata: Record<string, unknown>;
}

export type TurnLatencyTraceTurnClass = "normal" | "heavy";

export type TurnLatencySerializedGroupKind =
  | "world_forecast"
  | "gm_read"
  | "oracle"
  | "gm_tool_loop"
  | "actor_decision"
  | "storyteller"
  | "reflection"
  | "unknown";

export interface TurnLatencyUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
}

export interface TurnLatencySerializedGroup {
  groupId: string;
  kind: TurnLatencySerializedGroupKind;
  label: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  llmCallCount: number;
  retryCount: number;
  usage: TurnLatencyUsage;
  outputChars: number;
  metadata: Record<string, unknown>;
}

export interface TurnLatencyParallelGroup {
  groupId: string;
  label: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  jobCount: number;
  writeScopes: string[];
  serializedFallbackCount: number;
  metadata: Record<string, unknown>;
}

export interface TurnLatencyProposalEffects {
  queued: number;
  committed: number;
  rejected: number;
  deferred: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface TurnLatencyDiagnostic {
  code:
    | "serialized_group_budget_exceeded"
    | "retry_budget_exceeded"
    | "output_clip_attempt"
    | "missing_stage"
    | "stage_classification_mismatch"
    | "noncritical_blocking_stage"
    | "slow_stage";
  severity: "info" | "warning" | "error";
  message: string;
  value?: number;
  target?: number;
  metadata?: Record<string, unknown>;
}

export interface TurnLatencyTrace {
  turnId: string;
  campaignId: string;
  tick: number;
  turnClass: TurnLatencyTraceTurnClass;
  startedAt: number;
  endedAt?: number;
  totalDurationMs?: number;
  stages: TurnLatencyTraceStage[];
  serializedGroups: TurnLatencySerializedGroup[];
  parallelGroups: TurnLatencyParallelGroup[];
  retryCount: number;
  llmCallCount: number;
  usage: TurnLatencyUsage;
  outputChars: number;
  actorWaitMs: number;
  reflectionWaitMs: number;
  narratorWaitMs: number;
  proposalEffects: TurnLatencyProposalEffects;
  didClipModelOutput: boolean;
  diagnostics: TurnLatencyDiagnostic[];
}

export interface TurnLatencyRequiredStage {
  stage: string;
  criticality?: TurnLatencyCriticality;
  blocksPlayerResponse?: boolean;
  criticalPath?: boolean;
}

const defaultStageClassifications: Record<string, TurnLatencyStageClassification> = {
  pre_scene_frame_due_work: {
    criticality: "L2",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "pre_scene_frame_due_work",
    classificationReason: "Visible-scope due work can surface in the SceneFrame.",
  },
  scene_frame: {
    criticality: "L0",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "scene_frame",
    classificationReason: "SceneFrame is required to ground the current player turn.",
  },
  world_forecast: {
    criticality: "L2",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "world_forecast",
    classificationReason: "Scoped forecast is consumed by the current GM Read.",
  },
  gm_read: {
    criticality: "L0",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "gm_read",
    classificationReason: "GM Read interprets the current player action.",
  },
  oracle: {
    criticality: "L0",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "oracle",
    classificationReason: "Oracle is only called when immediate adjudication is required.",
  },
  gm_tool_loop: {
    criticality: "L0",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "gm_tool_loop",
    classificationReason: "Validated tool execution settles current-turn state.",
  },
  clarification_response: {
    criticality: "L0",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "clarification_response",
    classificationReason: "Clarification is the current visible response.",
  },
  actor_reactions: {
    criticality: "L1",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "actor_reactions",
    classificationReason: "Visible actor reactions can affect the current scene.",
  },
  pre_narrator_due_work: {
    criticality: "L2",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "pre_narrator_due_work",
    classificationReason: "Due work runs because consequences may surface before narration.",
  },
  narrator_frame_refresh: {
    criticality: "L2",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "narrator_frame_refresh",
    classificationReason: "Refreshed visible frame is needed after surfaced due work.",
  },
  narrator_packet: {
    criticality: "L0",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "narrator_packet",
    classificationReason: "NarratorPacket is the final visibility boundary.",
  },
  final_prompt: {
    criticality: "L0",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "final_prompt",
    classificationReason: "Final prompt assembly prepares the visible response.",
  },
  final_narration: {
    criticality: "L0",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "final_narration",
    classificationReason: "Final narration is the player-visible turn response.",
  },
  narrator_repair: {
    criticality: "L0",
    blocksPlayerResponse: true,
    criticalPath: true,
    sourceStageId: "narrator_repair",
    classificationReason: "Narration repair protects the visible response boundary.",
  },
  transient_cleanup: {
    criticality: "L4",
    blocksPlayerResponse: false,
    criticalPath: false,
    sourceStageId: "transient_cleanup",
    classificationReason: "Maintenance cleanup should not determine player-visible truth.",
  },
};

export function createTurnLatencyTrace(input: {
  turnId: string;
  campaignId: string;
  tick: number;
  turnClass?: TurnLatencyTraceTurnClass;
  startedAt?: number;
}): TurnLatencyTrace {
  return {
    turnId: input.turnId,
    campaignId: input.campaignId,
    tick: input.tick,
    turnClass: input.turnClass ?? "normal",
    startedAt: input.startedAt ?? Date.now(),
    stages: [],
    serializedGroups: [],
    parallelGroups: [],
    retryCount: 0,
    llmCallCount: 0,
    usage: emptyUsage(),
    outputChars: 0,
    actorWaitMs: 0,
    reflectionWaitMs: 0,
    narratorWaitMs: 0,
    proposalEffects: {
      queued: 0,
      committed: 0,
      rejected: 0,
      deferred: 0,
      cacheHits: 0,
      cacheMisses: 0,
    },
    didClipModelOutput: false,
    diagnostics: [],
  };
}

function emptyUsage(): TurnLatencyUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
  };
}

function numberFromRecord(record: Record<string, unknown>, keys: readonly string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value);
    }
  }
  return 0;
}

export function normalizeTurnLatencyUsage(value: unknown): TurnLatencyUsage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyUsage();
  }
  const record = value as Record<string, unknown>;
  const inputTokens = numberFromRecord(record, [
    "inputTokens",
    "promptTokens",
    "prompt_tokens",
  ]);
  const outputTokens = numberFromRecord(record, [
    "outputTokens",
    "completionTokens",
    "completion_tokens",
  ]);
  const explicitTotal = numberFromRecord(record, [
    "totalTokens",
    "total_tokens",
  ]);
  return {
    inputTokens,
    outputTokens,
    totalTokens: explicitTotal || inputTokens + outputTokens,
    reasoningTokens: numberFromRecord(record, [
      "reasoningTokens",
      "reasoning_tokens",
    ]),
  };
}

function addUsage(left: TurnLatencyUsage, right: TurnLatencyUsage): TurnLatencyUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
  };
}

export function recordTurnLatencyStage(
  trace: TurnLatencyTrace,
  input: {
    stage: string;
    startedAt: number;
    endedAt?: number;
    criticality?: TurnLatencyCriticality;
    blocksPlayerResponse?: boolean;
    criticalPath?: boolean;
    sourceStageId?: string;
    route?: string;
    classificationReason?: string;
    metadata?: Record<string, unknown>;
  },
): TurnLatencyTraceStage {
  const endedAt = input.endedAt ?? Date.now();
  const defaultClassification = classifyTurnLatencyStage(input.stage);
  const stage = {
    stage: input.stage,
    startedAt: input.startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - input.startedAt),
    criticality: input.criticality ?? defaultClassification.criticality,
    blocksPlayerResponse:
      input.blocksPlayerResponse ?? defaultClassification.blocksPlayerResponse,
    criticalPath: input.criticalPath ?? defaultClassification.criticalPath,
    sourceStageId:
      input.sourceStageId ?? defaultClassification.sourceStageId ?? input.stage,
    route: input.route ?? defaultClassification.route,
    classificationReason:
      input.classificationReason ?? defaultClassification.classificationReason,
    metadata: { ...(input.metadata ?? {}) },
  };
  trace.stages.push(stage);
  return stage;
}

export function classifyTurnLatencyStage(stage: string): TurnLatencyStageClassification {
  return defaultStageClassifications[stage] ?? {
    criticality: "L3",
    blocksPlayerResponse: false,
    criticalPath: false,
    sourceStageId: stage,
    classificationReason: "Unmapped work defaults to non-blocking offscreen diagnostics.",
  };
}

export function recordSerializedLlmGroup(
  trace: TurnLatencyTrace,
  input: {
    groupId?: string;
    kind: TurnLatencySerializedGroupKind;
    label?: string;
    startedAt: number;
    endedAt?: number;
    llmCallCount?: number;
    retryCount?: number;
    usage?: unknown;
    outputChars?: number;
    metadata?: Record<string, unknown>;
  },
): TurnLatencySerializedGroup {
  const endedAt = input.endedAt ?? Date.now();
  const usage = normalizeTurnLatencyUsage(input.usage);
  const group: TurnLatencySerializedGroup = {
    groupId: input.groupId ?? `${input.kind}-${trace.serializedGroups.length + 1}`,
    kind: input.kind,
    label: input.label ?? input.kind,
    startedAt: input.startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - input.startedAt),
    llmCallCount: Math.max(0, input.llmCallCount ?? 1),
    retryCount: Math.max(0, input.retryCount ?? 0),
    usage,
    outputChars: Math.max(0, input.outputChars ?? 0),
    metadata: { ...(input.metadata ?? {}) },
  };
  trace.serializedGroups.push(group);
  trace.llmCallCount += group.llmCallCount;
  trace.retryCount += group.retryCount;
  trace.usage = addUsage(trace.usage, group.usage);
  trace.outputChars += group.outputChars;
  if (group.kind === "actor_decision") {
    trace.actorWaitMs += group.durationMs;
  }
  if (group.kind === "reflection") {
    trace.reflectionWaitMs += group.durationMs;
  }
  if (group.kind === "storyteller") {
    trace.narratorWaitMs += group.durationMs;
  }
  return group;
}

export function recordParallelGroup(
  trace: TurnLatencyTrace,
  input: {
    groupId?: string;
    label: string;
    startedAt: number;
    endedAt?: number;
    jobCount: number;
    writeScopes?: readonly string[];
    serializedFallbackCount?: number;
    metadata?: Record<string, unknown>;
  },
): TurnLatencyParallelGroup {
  const endedAt = input.endedAt ?? Date.now();
  const group: TurnLatencyParallelGroup = {
    groupId: input.groupId ?? `parallel-${trace.parallelGroups.length + 1}`,
    label: input.label,
    startedAt: input.startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - input.startedAt),
    jobCount: Math.max(0, input.jobCount),
    writeScopes: [...new Set(input.writeScopes ?? [])],
    serializedFallbackCount: Math.max(0, input.serializedFallbackCount ?? 0),
    metadata: { ...(input.metadata ?? {}) },
  };
  trace.parallelGroups.push(group);
  return group;
}

export function addTurnLatencyProposalEffects(
  trace: TurnLatencyTrace,
  input: Partial<TurnLatencyProposalEffects>,
): void {
  trace.proposalEffects = {
    queued: trace.proposalEffects.queued + Math.max(0, input.queued ?? 0),
    committed: trace.proposalEffects.committed + Math.max(0, input.committed ?? 0),
    rejected: trace.proposalEffects.rejected + Math.max(0, input.rejected ?? 0),
    deferred: trace.proposalEffects.deferred + Math.max(0, input.deferred ?? 0),
    cacheHits: trace.proposalEffects.cacheHits + Math.max(0, input.cacheHits ?? 0),
    cacheMisses: trace.proposalEffects.cacheMisses + Math.max(0, input.cacheMisses ?? 0),
  };
}

export function addLivingWorldProposalMetricsToTrace(
  trace: TurnLatencyTrace,
  metrics: Pick<LivingWorldProposalMetrics, "counts">,
): void {
  addTurnLatencyProposalEffects(trace, {
    queued: metrics.counts.pending,
    committed: metrics.counts.committed,
    rejected: metrics.counts.rejected,
    deferred: metrics.counts.deferred,
  });
}

export function diagnoseTurnLatencyTrace(
  trace: TurnLatencyTrace,
  options: {
    normalSerializedGroupLimit?: number;
    heavySerializedGroupLimit?: number;
    retryLimit?: number;
    slowStageMs?: number;
    requiredStages?: readonly string[];
    requiredStageDefinitions?: readonly TurnLatencyRequiredStage[];
  } = {},
): TurnLatencyDiagnostic[] {
  const diagnostics: TurnLatencyDiagnostic[] = [];
  const serializedLimit = trace.turnClass === "heavy"
    ? options.heavySerializedGroupLimit ?? 5
    : options.normalSerializedGroupLimit ?? 4;

  if (trace.serializedGroups.length > serializedLimit) {
    diagnostics.push({
      code: "serialized_group_budget_exceeded",
      severity: "warning",
      message:
        `Turn used ${trace.serializedGroups.length} serialized LLM groups; target for ${trace.turnClass} turns is ${serializedLimit}.`,
      value: trace.serializedGroups.length,
      target: serializedLimit,
    });
  }

  const retryLimit = options.retryLimit ?? 2;
  if (trace.retryCount > retryLimit) {
    diagnostics.push({
      code: "retry_budget_exceeded",
      severity: "warning",
      message: `Turn used ${trace.retryCount} retries; target is ${retryLimit}.`,
      value: trace.retryCount,
      target: retryLimit,
    });
  }

  if (trace.didClipModelOutput) {
    diagnostics.push({
      code: "output_clip_attempt",
      severity: "error",
      message: "Model output clipping is not a valid latency-control strategy.",
    });
  }

  const stagesByName = new Map(trace.stages.map((stage) => [stage.stage, stage]));
  const requiredStageNames = new Set([
    ...(options.requiredStages ?? []),
    ...(options.requiredStageDefinitions ?? []).map((stage) => stage.stage),
  ]);
  for (const required of requiredStageNames) {
    if (!stagesByName.has(required)) {
      diagnostics.push({
        code: "missing_stage",
        severity: "warning",
        message: `Latency trace did not record required stage '${required}'.`,
        metadata: { stage: required },
      });
    }
  }

  for (const expected of options.requiredStageDefinitions ?? []) {
    const actual = stagesByName.get(expected.stage);
    if (!actual) {
      continue;
    }
    const mismatches: Record<string, unknown> = {};
    if (expected.criticality && actual.criticality !== expected.criticality) {
      mismatches.criticality = {
        expected: expected.criticality,
        actual: actual.criticality,
      };
    }
    if (
      typeof expected.blocksPlayerResponse === "boolean"
      && actual.blocksPlayerResponse !== expected.blocksPlayerResponse
    ) {
      mismatches.blocksPlayerResponse = {
        expected: expected.blocksPlayerResponse,
        actual: actual.blocksPlayerResponse,
      };
    }
    if (
      typeof expected.criticalPath === "boolean"
      && actual.criticalPath !== expected.criticalPath
    ) {
      mismatches.criticalPath = {
        expected: expected.criticalPath,
        actual: actual.criticalPath,
      };
    }
    if (Object.keys(mismatches).length > 0) {
      diagnostics.push({
        code: "stage_classification_mismatch",
        severity: "warning",
        message: `Latency stage '${expected.stage}' did not match required critical-path classification.`,
        metadata: { stage: expected.stage, mismatches },
      });
    }
  }

  for (const stage of trace.stages) {
    if ((stage.criticality === "L3" || stage.criticality === "L4") && stage.blocksPlayerResponse) {
      diagnostics.push({
        code: "noncritical_blocking_stage",
        severity: "warning",
        message: `Latency stage '${stage.stage}' is ${stage.criticality} but marked as player-blocking.`,
        metadata: {
          stage: stage.stage,
          criticality: stage.criticality,
        },
      });
    }
  }

  const slowStageMs = options.slowStageMs ?? 0;
  if (slowStageMs > 0) {
    for (const stage of trace.stages) {
      if (stage.durationMs > slowStageMs) {
        diagnostics.push({
          code: "slow_stage",
          severity: "info",
          message: `Stage '${stage.stage}' took ${stage.durationMs}ms.`,
          value: stage.durationMs,
          target: slowStageMs,
          metadata: { stage: stage.stage },
        });
      }
    }
  }

  return diagnostics;
}

export function finalizeTurnLatencyTrace(
  trace: TurnLatencyTrace,
  input: {
    endedAt?: number;
    diagnostics?: readonly TurnLatencyDiagnostic[];
    diagnosticOptions?: Parameters<typeof diagnoseTurnLatencyTrace>[1];
  } = {},
): TurnLatencyTrace {
  const endedAt = input.endedAt ?? Date.now();
  trace.endedAt = endedAt;
  trace.totalDurationMs = Math.max(0, endedAt - trace.startedAt);
  trace.diagnostics = [
    ...diagnoseTurnLatencyTrace(trace, input.diagnosticOptions),
    ...(input.diagnostics ?? []),
  ];
  return trace;
}
