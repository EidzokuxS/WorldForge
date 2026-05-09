import { describe, expect, it } from "vitest";

import {
  formatParallelismWriteScopeAudit,
  planParallelSimulationGroups,
  runParallelSimulationJobs,
} from "../parallel-simulation-runner.js";

describe("parallel simulation runner", () => {
  it("parallelizes non-conflicting jobs and serializes conflicting write scopes", () => {
    const groups = planParallelSimulationGroups([
      {
        id: "actor-a",
        writeScopes: ["Actor:A"],
        run: () => "a",
      },
      {
        id: "actor-b",
        writeScopes: ["actor:b"],
        run: () => "b",
      },
      {
        id: "actor-a-belief",
        writeScopes: ["actor:a:belief"],
        run: () => "a-belief",
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.jobs.map((job) => job.id)).toEqual(["actor-a", "actor-b"]);
    expect(groups[1]?.jobs.map((job) => job.id)).toEqual(["actor-a-belief"]);
    expect(groups[1]?.jobs[0]?.serializedAfterJobIds).toEqual(["actor-a"]);
  });

  it("returns failed job results instead of manufacturing successful no-op output", async () => {
    let clock = 100;
    const result = await runParallelSimulationJobs(
      [
        {
          id: "safe-a",
          writeScopes: ["location:north"],
          run: () => "ok",
        },
        {
          id: "safe-b",
          writeScopes: ["location:south"],
          run: () => {
            throw new Error("provider failed");
          },
        },
        {
          id: "after-a",
          writeScopes: ["location:north:event"],
          run: () => "rebased",
        },
      ],
      {
        now: () => {
          clock += 5;
          return clock;
        },
      },
    );

    expect(result.groups).toHaveLength(2);
    expect(result.results).toHaveLength(3);
    expect(result.results.find((entry) => entry.jobId === "safe-a")).toMatchObject({
      status: "completed",
      value: "ok",
    });
    expect(result.results.find((entry) => entry.jobId === "safe-b")).toMatchObject({
      status: "failed",
      error: "provider failed",
    });
    expect(result.results.find((entry) => entry.jobId === "after-a")).toMatchObject({
      status: "completed",
      serializedAfterJobIds: ["safe-a"],
      value: "rebased",
    });
    expect(result.trace[1]?.serializedFallbackCount).toBe(1);
    expect(formatParallelismWriteScopeAudit(result)).toContain(
      "after-a: completed; serializedAfter=safe-a",
    );
  });
});
