import type { LivingWorldProposalMetrics } from "./living-world-metrics.js";

export interface TurnLatencyTraceStage {
  stage: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
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
  didClipModelOutput: false;
  diagnostics: TurnLatencyDiagnostic[];
}

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
    metadata?: Record<string, unknown>;
  },
): TurnLatencyTraceStage {
  const endedAt = input.endedAt ?? Date.now();
  const stage = {
    stage: input.stage,
    startedAt: input.startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - input.startedAt),
    metadata: { ...(input.metadata ?? {}) },
  };
  trace.stages.push(stage);
  return stage;
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

  const stageNames = new Set(trace.stages.map((stage) => stage.stage));
  for (const required of options.requiredStages ?? []) {
    if (!stageNames.has(required)) {
      diagnostics.push({
        code: "missing_stage",
        severity: "warning",
        message: `Latency trace did not record required stage '${required}'.`,
        metadata: { stage: required },
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
