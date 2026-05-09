import {
  normalizeWriteScope,
  writeScopesConflict,
} from "./simulation-write-scope.js";

export interface ParallelSimulationJob<T> {
  id: string;
  label?: string;
  route?: string;
  writeScopes: readonly string[];
  run: (context: {
    groupIndex: number;
    jobIndex: number;
    serializedAfterJobIds: readonly string[];
  }) => Promise<T> | T;
}

export interface ParallelSimulationPlannedJob<T> extends ParallelSimulationJob<T> {
  normalizedWriteScopes: string[];
  serializedAfterJobIds: string[];
}

export interface ParallelSimulationGroup<T> {
  groupIndex: number;
  jobs: ParallelSimulationPlannedJob<T>[];
  writeScopes: string[];
}

export type ParallelSimulationJobResult<T> =
  | {
      status: "completed";
      jobId: string;
      groupIndex: number;
      jobIndex: number;
      startedAt: number;
      endedAt: number;
      durationMs: number;
      writeScopes: string[];
      serializedAfterJobIds: string[];
      value: T;
    }
  | {
      status: "failed";
      jobId: string;
      groupIndex: number;
      jobIndex: number;
      startedAt: number;
      endedAt: number;
      durationMs: number;
      writeScopes: string[];
      serializedAfterJobIds: string[];
      error: string;
    };

export interface ParallelSimulationRunTrace {
  groupIndex: number;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  jobCount: number;
  writeScopes: string[];
  serializedFallbackCount: number;
}

export interface ParallelSimulationRunResult<T> {
  groups: ParallelSimulationGroup<T>[];
  results: ParallelSimulationJobResult<T>[];
  trace: ParallelSimulationRunTrace[];
}

function normalizedScopes(scopes: readonly string[]): string[] {
  return [...new Set(scopes.map(normalizeWriteScope).filter(Boolean))];
}

function scopesConflict(left: readonly string[], right: readonly string[]): boolean {
  return left.some((leftScope) =>
    right.some((rightScope) => writeScopesConflict(leftScope, rightScope)),
  );
}

function conflictingJobIds<T>(
  groups: readonly ParallelSimulationGroup<T>[],
  scopes: readonly string[],
): string[] {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const job of group.jobs) {
      if (scopesConflict(job.normalizedWriteScopes, scopes)) {
        ids.add(job.id);
      }
    }
  }
  return [...ids];
}

export function planParallelSimulationGroups<T>(
  jobs: readonly ParallelSimulationJob<T>[],
): ParallelSimulationGroup<T>[] {
  const groups: ParallelSimulationGroup<T>[] = [];

  for (const job of jobs) {
    const normalizedWriteScopes = normalizedScopes(job.writeScopes);
    const planned: ParallelSimulationPlannedJob<T> = {
      ...job,
      normalizedWriteScopes,
      serializedAfterJobIds: conflictingJobIds(groups, normalizedWriteScopes),
    };

    let placed = false;
    for (const group of groups) {
      if (!scopesConflict(group.writeScopes, normalizedWriteScopes)) {
        group.jobs.push(planned);
        group.writeScopes = [...new Set([...group.writeScopes, ...normalizedWriteScopes])];
        placed = true;
        break;
      }
    }

    if (!placed) {
      groups.push({
        groupIndex: groups.length,
        jobs: [planned],
        writeScopes: [...normalizedWriteScopes],
      });
    }
  }

  return groups;
}

export async function runParallelSimulationJobs<T>(
  jobs: readonly ParallelSimulationJob<T>[],
  options: {
    now?: () => number;
  } = {},
): Promise<ParallelSimulationRunResult<T>> {
  const now = options.now ?? Date.now;
  const groups = planParallelSimulationGroups(jobs);
  const results: ParallelSimulationJobResult<T>[] = [];
  const trace: ParallelSimulationRunTrace[] = [];

  for (const group of groups) {
    const groupStartedAt = now();
    const groupResults = await Promise.all(
      group.jobs.map(async (job, jobIndex): Promise<ParallelSimulationJobResult<T>> => {
        const startedAt = now();
        try {
          const value = await job.run({
            groupIndex: group.groupIndex,
            jobIndex,
            serializedAfterJobIds: job.serializedAfterJobIds,
          });
          const endedAt = now();
          return {
            status: "completed",
            jobId: job.id,
            groupIndex: group.groupIndex,
            jobIndex,
            startedAt,
            endedAt,
            durationMs: Math.max(0, endedAt - startedAt),
            writeScopes: job.normalizedWriteScopes,
            serializedAfterJobIds: job.serializedAfterJobIds,
            value,
          };
        } catch (error) {
          const endedAt = now();
          return {
            status: "failed",
            jobId: job.id,
            groupIndex: group.groupIndex,
            jobIndex,
            startedAt,
            endedAt,
            durationMs: Math.max(0, endedAt - startedAt),
            writeScopes: job.normalizedWriteScopes,
            serializedAfterJobIds: job.serializedAfterJobIds,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    const groupEndedAt = now();
    results.push(...groupResults);
    trace.push({
      groupIndex: group.groupIndex,
      startedAt: groupStartedAt,
      endedAt: groupEndedAt,
      durationMs: Math.max(0, groupEndedAt - groupStartedAt),
      jobCount: group.jobs.length,
      writeScopes: group.writeScopes,
      serializedFallbackCount: group.jobs.filter((job) => job.serializedAfterJobIds.length > 0).length,
    });
  }

  return { groups, results, trace };
}

export function formatParallelismWriteScopeAudit<T>(
  result: Pick<ParallelSimulationRunResult<T>, "groups" | "results" | "trace">,
): string {
  const lines = ["# Parallelism Write-Scope Audit", ""];
  for (const group of result.groups) {
    const groupTrace = result.trace.find((entry) => entry.groupIndex === group.groupIndex);
    lines.push(
      `## Group ${group.groupIndex + 1}`,
      "",
      `- jobs: ${group.jobs.length}`,
      `- durationMs: ${groupTrace?.durationMs ?? 0}`,
      `- writeScopes: ${group.writeScopes.join(", ") || "none"}`,
      "",
    );
    for (const job of group.jobs) {
      const jobResult = result.results.find((entry) => entry.jobId === job.id);
      lines.push(
        `- ${job.id}: ${jobResult?.status ?? "not_run"}; serializedAfter=${job.serializedAfterJobIds.join(", ") || "none"}`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
