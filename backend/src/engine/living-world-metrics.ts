import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  locationRecentEvents,
  simulationJobs,
  simulationProposals,
  worldThreadEvents,
} from "../db/schema.js";
import { readWorldClock } from "./living-world-authority.js";
import { SURFACE_POLICIES, type SurfacePolicy } from "./surface-signal.js";

export interface LivingWorldProposalMetricsCounts {
  totalProposals: number;
  pending: number;
  committed: number;
  rejected: number;
  canceled: number;
  expired: number;
  deferred: number;
  superseded: number;
  needsRebase: number;
  needsActorRetry: number;
  meaningfulCommitted: number;
  discoverableSurface: number;
  explicitNoSurface: number;
  missingSurface: number;
  worldThreadEvents: number;
  locationRecentEvents: number;
  staleJobs: number;
}

export interface LivingWorldProposalMetrics {
  campaignId: string;
  sinceWorldTimeMinutes: number | null;
  generatedAt: number;
  metrics: {
    proposal_commit_ratio: number;
    proposal_terminal_state_ratio: number;
    surface_signal_coverage: number;
    stale_job_count: number;
  };
  counts: LivingWorldProposalMetricsCounts;
  defects: {
    missingSurfaceProposalIds: string[];
    staleJobIds: string[];
  };
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }
  try {
    return readObject(JSON.parse(value) as unknown) ?? {};
  } catch {
    return {};
  }
}

function readSurfacePolicy(metadata: Record<string, unknown>): SurfacePolicy | null {
  const surfaceSignal = readObject(metadata.surfaceSignal);
  const policy = surfaceSignal?.policy;
  return typeof policy === "string" && SURFACE_POLICIES.includes(policy as SurfacePolicy)
    ? policy as SurfacePolicy
    : null;
}

function hasExplicitNoSurface(metadata: Record<string, unknown>): boolean {
  const surfaceSignal = readObject(metadata.surfaceSignal);
  return surfaceSignal?.policy === "none"
    && typeof surfaceSignal.noSurfaceReason === "string"
    && surfaceSignal.noSurfaceReason.trim().length > 0;
}

function payloadRequiresSurfaceSignal(payload: Record<string, unknown>): boolean {
  const data = readObject(payload.data);
  return data?.meaningfulOffscreenCommit === true
    || payload.meaningfulOffscreenCommit === true;
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function calculateLivingWorldProposalMetrics(input: {
  campaignId: string;
  sinceWorldTimeMinutes?: number;
}): LivingWorldProposalMetrics {
  const db = getDb();
  const since = input.sinceWorldTimeMinutes;
  const proposals = db
    .select()
    .from(simulationProposals)
    .where(eq(simulationProposals.campaignId, input.campaignId))
    .all()
    .filter((row) => since == null || row.createdWorldTimeMinutes >= since);

  const proposalEntries = proposals.map((row) => {
    const metadata = parseJsonObject(row.lifecycleMetadata);
    const payload = parseJsonObject(row.payload);
    const surfacePolicy = readSurfacePolicy(metadata);
    const requiresSurface = payloadRequiresSurfaceSignal(payload);
    return {
      row,
      surfacePolicy,
      requiresSurface,
      explicitNoSurface: hasExplicitNoSurface(metadata),
    };
  });

  const meaningfulCommitted = proposalEntries.filter((entry) =>
    entry.row.status === "committed"
    && (entry.requiresSurface || entry.surfacePolicy !== null)
  );
  const missingSurfaceProposalIds = meaningfulCommitted
    .filter((entry) => entry.requiresSurface && !entry.surfacePolicy)
    .map((entry) => entry.row.id);
  const terminalCount = proposals.filter((row) => row.status !== "pending").length;
  const clock = readWorldClock(input.campaignId);
  const staleJobs = db
    .select()
    .from(simulationJobs)
    .where(eq(simulationJobs.campaignId, input.campaignId))
    .all()
    .filter((job) =>
      (job.status === "queued" || job.status === "running")
      && job.scheduledWorldTimeMinutes <= clock.worldTimeMinutes
      && (since == null || job.scheduledWorldTimeMinutes >= since)
    );
  const worldThreadEventCount = db
    .select()
    .from(worldThreadEvents)
    .where(eq(worldThreadEvents.campaignId, input.campaignId))
    .all()
    .filter((event) => since == null || event.worldTimeMinutes >= since)
    .length;
  const locationRecentEventCount = db
    .select()
    .from(locationRecentEvents)
    .where(eq(locationRecentEvents.campaignId, input.campaignId))
    .all()
    .filter((event) => since == null || event.tick >= since)
    .length;

  const counts: LivingWorldProposalMetricsCounts = {
    totalProposals: proposals.length,
    pending: proposals.filter((row) => row.status === "pending").length,
    committed: proposals.filter((row) => row.status === "committed").length,
    rejected: proposals.filter((row) => row.status === "rejected").length,
    canceled: proposals.filter((row) => row.status === "canceled").length,
    expired: proposals.filter((row) => row.proposalDisposition === "expired_stale_version").length,
    deferred: proposals.filter((row) => row.proposalDisposition === "deferred_not_due").length,
    superseded: proposals.filter((row) =>
      row.status === "superseded" || row.proposalDisposition === "superseded_by_new_event",
    ).length,
    needsRebase: proposals.filter((row) => row.proposalDisposition === "needs_rebase").length,
    needsActorRetry: proposals.filter((row) => row.proposalDisposition === "needs_actor_retry").length,
    meaningfulCommitted: meaningfulCommitted.length,
    discoverableSurface: meaningfulCommitted.filter((entry) =>
      entry.surfacePolicy !== null && entry.surfacePolicy !== "none",
    ).length,
    explicitNoSurface: meaningfulCommitted.filter((entry) => entry.explicitNoSurface).length,
    missingSurface: missingSurfaceProposalIds.length,
    worldThreadEvents: worldThreadEventCount,
    locationRecentEvents: locationRecentEventCount,
    staleJobs: staleJobs.length,
  };

  return {
    campaignId: input.campaignId,
    sinceWorldTimeMinutes: since ?? null,
    generatedAt: Date.now(),
    metrics: {
      proposal_commit_ratio: safeRatio(counts.committed, counts.totalProposals),
      proposal_terminal_state_ratio: safeRatio(terminalCount, counts.totalProposals),
      surface_signal_coverage: safeRatio(
        counts.discoverableSurface + counts.explicitNoSurface,
        counts.meaningfulCommitted,
      ),
      stale_job_count: counts.staleJobs,
    },
    counts,
    defects: {
      missingSurfaceProposalIds,
      staleJobIds: staleJobs.map((job) => job.id),
    },
  };
}
