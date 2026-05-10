import {
  runParallelSimulationJobs,
  type ParallelSimulationJobResult,
  type ParallelSimulationRunTrace,
} from "./parallel-simulation-runner.js";
import type { TurnLatencyCriticality } from "./turn-latency-trace.js";

export type FrameRetrievalType =
  | "SceneFrame"
  | "OracleFrame"
  | "ActorFrame"
  | "FactionCommandFrame"
  | "NarratorPacket"
  | "ReviewerPacket";

export interface FrameRetrievalJob<T> {
  id: string;
  label?: string;
  frameType: FrameRetrievalType;
  viewerId?: string | null;
  scopeRefs?: readonly string[];
  criticality: TurnLatencyCriticality;
  metadata?: Record<string, unknown>;
  run: (context: {
    groupIndex: number;
    jobIndex: number;
    frameType: FrameRetrievalType;
    viewerId?: string | null;
    scopeRefs: readonly string[];
  }) => Promise<T> | T;
}

export type FrameRetrievalJobResult<T> =
  | (Extract<ParallelSimulationJobResult<T>, { status: "completed" }> & {
      frameType: FrameRetrievalType;
      viewerId?: string | null;
      scopeRefs: string[];
      criticality: TurnLatencyCriticality;
      readOnly: true;
    })
  | (Extract<ParallelSimulationJobResult<T>, { status: "failed" }> & {
      frameType: FrameRetrievalType;
      viewerId?: string | null;
      scopeRefs: string[];
      criticality: TurnLatencyCriticality;
      readOnly: true;
    });

export interface FrameRetrievalRunResult<T> {
  results: FrameRetrievalJobResult<T>[];
  trace: ParallelSimulationRunTrace[];
}

function uniqueRefs(refs: readonly string[] | undefined): string[] {
  return [...new Set((refs ?? []).map((ref) => ref.trim()).filter(Boolean))];
}

export async function runFrameRetrievalJobs<T>(
  jobs: readonly FrameRetrievalJob<T>[],
  options: {
    now?: () => number;
  } = {},
): Promise<FrameRetrievalRunResult<T>> {
  const metadataByJobId = new Map(
    jobs.map((job) => [
      job.id,
      {
        frameType: job.frameType,
        viewerId: job.viewerId,
        scopeRefs: uniqueRefs(job.scopeRefs),
        criticality: job.criticality,
      },
    ]),
  );
  const run = await runParallelSimulationJobs(
    jobs.map((job) => {
      const scopeRefs = uniqueRefs(job.scopeRefs);
      return {
        id: job.id,
        label: job.label ?? `${job.frameType}:${job.id}`,
        route: `frame-retrieval:${job.frameType}`,
        writeScopes: [],
        run: (context: {
          groupIndex: number;
          jobIndex: number;
          serializedAfterJobIds: readonly string[];
        }) =>
          job.run({
            groupIndex: context.groupIndex,
            jobIndex: context.jobIndex,
            frameType: job.frameType,
            viewerId: job.viewerId,
            scopeRefs,
          }),
      };
    }),
    options,
  );

  return {
    trace: run.trace,
    results: run.results.map((result) => {
      const metadata = metadataByJobId.get(result.jobId);
      if (!metadata) {
        throw new Error(`Frame retrieval metadata missing for job ${result.jobId}.`);
      }
      return {
        ...result,
        ...metadata,
        readOnly: true as const,
      };
    }),
  };
}
