import {
  advanceWorldThread,
  createWorldThread,
  type WorldThreadSurfaceRoute,
  type WorldThreadVisibility,
} from "./world-thread.js";
import { readWorldClock } from "./living-world-authority.js";

export const SURFACE_POLICIES = [
  "none",
  "local_only",
  "rumor",
  "visible_modifier",
  "direct_message",
  "quest_hook",
  "physical_trace",
  "social_reaction",
] as const;

export type SurfacePolicy = typeof SURFACE_POLICIES[number];

export interface SurfaceSignalDecision {
  policy: SurfacePolicy;
  summary: string;
  locationRef?: string | null;
  threadName?: string;
  threadStage?: string;
  sourceEventIds: string[];
  authorityTraceIds: string[];
  hiddenCauseTerms: string[];
  noSurfaceReason?: string;
}

export interface SurfaceSignalApplyResult {
  policy: SurfacePolicy;
  summary: string;
  threadId: string | null;
  eventId: string | null;
  locationEventCreated: boolean;
  noSurfaceReason?: string;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function normalizePolicy(value: unknown): SurfacePolicy | null {
  return typeof value === "string" && SURFACE_POLICIES.includes(value as SurfacePolicy)
    ? value as SurfacePolicy
    : null;
}

function assertHiddenTermsSafe(input: {
  summary: string;
  hiddenCauseTerms: readonly string[];
}): void {
  const normalizedSummary = input.summary.toLowerCase();
  for (const term of input.hiddenCauseTerms) {
    const normalizedTerm = term.trim().toLowerCase();
    if (normalizedTerm && normalizedSummary.includes(normalizedTerm)) {
      throw new Error(`Surface signal summary leaks hidden cause term: ${term}`);
    }
  }
}

export function validateSurfaceSignalDecision(value: unknown): SurfaceSignalDecision {
  const record = readObject(value);
  if (!record) {
    throw new Error("surface_signal_missing");
  }
  const policy = normalizePolicy(record.policy);
  if (!policy) {
    throw new Error("surface_signal_policy_missing_or_invalid");
  }
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const noSurfaceReason =
    typeof record.noSurfaceReason === "string" ? record.noSurfaceReason.trim() : "";
  if (policy === "none") {
    if (!noSurfaceReason) {
      throw new Error("surface_signal_none_requires_reason");
    }
    return {
      policy,
      summary,
      sourceEventIds: readStringArray(record.sourceEventIds),
      authorityTraceIds: readStringArray(record.authorityTraceIds),
      hiddenCauseTerms: readStringArray(record.hiddenCauseTerms),
      noSurfaceReason,
    };
  }
  if (!summary) {
    throw new Error("surface_signal_summary_required");
  }
  const hiddenCauseTerms = readStringArray(record.hiddenCauseTerms);
  assertHiddenTermsSafe({ summary, hiddenCauseTerms });
  return {
    policy,
    summary,
    locationRef: typeof record.locationRef === "string" ? record.locationRef : null,
    threadName: typeof record.threadName === "string" ? record.threadName : undefined,
    threadStage: typeof record.threadStage === "string" ? record.threadStage : undefined,
    sourceEventIds: readStringArray(record.sourceEventIds),
    authorityTraceIds: readStringArray(record.authorityTraceIds),
    hiddenCauseTerms,
  };
}

export function readSurfaceSignalDecisionFromData(data: unknown): SurfaceSignalDecision | null {
  const record = readObject(data);
  if (!record || !("surfaceSignal" in record)) {
    return null;
  }
  return validateSurfaceSignalDecision(record.surfaceSignal);
}

export function proposalRequiresSurfaceSignal(data: unknown): boolean {
  const record = readObject(data);
  return record?.meaningfulOffscreenCommit === true;
}

function policyToRoute(policy: SurfacePolicy): WorldThreadSurfaceRoute["route"] {
  switch (policy) {
    case "rumor":
    case "social_reaction":
      return "rumor";
    case "quest_hook":
    case "direct_message":
      return "report";
    case "visible_modifier":
    case "physical_trace":
    case "local_only":
      return "sensory";
    case "none":
      return "public_record";
  }
}

function policyToVisibility(policy: SurfacePolicy): WorldThreadVisibility {
  return policy === "direct_message" || policy === "quest_hook"
    ? "public"
    : "signal_only";
}

export function applySurfaceSignalDecision(input: {
  campaignId: string;
  proposalId: string;
  tick: number;
  decision: SurfaceSignalDecision;
  authorityTraceIds: readonly string[];
  sourceEventIds?: readonly string[];
}): SurfaceSignalApplyResult {
  if (input.decision.policy === "none") {
    return {
      policy: "none",
      summary: input.decision.summary,
      threadId: null,
      eventId: null,
      locationEventCreated: false,
      noSurfaceReason: input.decision.noSurfaceReason,
    };
  }

  const sourceAuthorityTraceIds = [
    ...input.authorityTraceIds,
    ...input.decision.authorityTraceIds,
  ];
  const sourceEventIds = [
    ...(input.sourceEventIds ?? []),
    ...input.decision.sourceEventIds,
  ];
  const route = policyToRoute(input.decision.policy);
  const visibility = policyToVisibility(input.decision.policy);
  const thread = createWorldThread({
    campaignId: input.campaignId,
    name: input.decision.threadName ?? `Surface signal for ${input.proposalId}`,
    stage: input.decision.threadStage ?? "surface_signal",
    visibility,
    pressure: 1,
    hiddenCauseTerms: input.decision.hiddenCauseTerms,
    sourceEventIds,
    sourceAuthorityTraceIds,
    currentLocationId: input.decision.locationRef ?? null,
    surfaceRoutes: [{
      route,
      summary: input.decision.summary,
      locationId: input.decision.locationRef ?? null,
      sourceEventIds,
      sourceAuthorityTraceIds,
    }],
    metadata: {
      sourceProposalId: input.proposalId,
      surfacePolicy: input.decision.policy,
    },
  });
  const clock = readWorldClock(input.campaignId);
  const advanced = advanceWorldThread({
    campaignId: input.campaignId,
    threadId: thread.id,
    baseWorldVersion: clock.worldVersion,
    sourceEventIds,
    sourceAuthorityTraceIds,
    surface: {
      summary: input.decision.summary,
      route,
      locationRef: input.decision.locationRef ?? null,
      visibility,
    },
    metadata: {
      sourceProposalId: input.proposalId,
      surfacePolicy: input.decision.policy,
      tick: input.tick,
    },
  });
  if (advanced.status !== "advanced") {
    throw new Error(`surface_signal_thread_advance_failed:${advanced.reason}`);
  }
  return {
    policy: input.decision.policy,
    summary: input.decision.summary,
    threadId: thread.id,
    eventId: advanced.event.id,
    locationEventCreated: Boolean(input.decision.locationRef),
  };
}
