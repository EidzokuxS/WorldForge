import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LanguageModel } from "ai";
import type { CampaignWorldDna, CampaignWorldSource } from "@worldforge/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "../db/index.js";
import { saveWorldSeeds } from "../campaign/index.js";
import {
  CampaignWorldBuilderError,
  type CampaignWorldBuilder,
} from "./world-builder.js";
import {
  createCampaignWorldBuildService,
  CAMPAIGN_WORLD_SERVICE_BUILDER_BUDGET_MS,
  type CampaignWorldBuildService,
} from "./world-build-service.js";
import { openCampaignWorldDatabase } from "./world-database.js";
import {
  CampaignWorldRepositoryError,
  createCampaignWorldRepository,
} from "./world-repository.js";
import {
  CAMPAIGN_A,
  CAMPAIGN_B,
  candidateFixture,
  createMigratedCampaign,
  evidenceFixture,
} from "./world-repository.test-support.js";
import {
  CampaignWorldSourceError,
  createCampaignWorldSourceService,
  type CampaignWorldSourceService,
} from "./world-source.js";
import { withCampaignWorldSourceLock } from "./world-source-lock.js";

const DNA: CampaignWorldDna = {
  geography: "A ring of stormbound islands",
  politicalStructure: "Independent harbor councils",
  centralConflict: "The sea routes are failing",
  culturalFlavor: "Salt-worn ritual\nCommunal songs",
  environment: "Cold ocean winds and luminous reefs",
  wildcard: "Maps change after every eclipse",
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

interface ControlledBuilder {
  builder: CampaignWorldBuilder;
  entered: Promise<CampaignWorldSource>;
  release(): void;
}

function successfulControlledBuilder(): ControlledBuilder {
  const entered = deferred<CampaignWorldSource>();
  const release = deferred<void>();
  return {
    entered: entered.promise,
    release: () => release.resolve(),
    builder: {
      async build(request) {
        await request.observer?.onStageStarted("world_frame");
        entered.resolve(request.source);
        await release.promise;
        await request.observer?.onStageCompleted(evidenceFixture("world_frame"));
        for (const stage of ["world_cast", "world_connections"] as const) {
          await request.observer?.onStageStarted(stage);
          await request.observer?.onStageCompleted(evidenceFixture(stage));
        }
        return candidateFixture(request.source);
      },
    },
  };
}

function failingControlledBuilder(): ControlledBuilder {
  const entered = deferred<CampaignWorldSource>();
  const release = deferred<void>();
  return {
    entered: entered.promise,
    release: () => release.resolve(),
    builder: {
      async build(request) {
        await request.observer?.onStageStarted("world_frame");
        entered.resolve(request.source);
        await release.promise;
        throw new CampaignWorldBuilderError(
          "model_contract_failed",
          "world_frame",
          [{
            ...evidenceFixture("world_frame"),
            actualStrategy: null,
            errorCode: "model_contract_failed",
          }],
          "Injected provider failure.",
        );
      },
    },
  };
}

let root = "";
let previousCampaignsRoot: string | undefined;

function campaignDirectory(campaignId = CAMPAIGN_A): string {
  return path.join(root, campaignId);
}

function writeConfig(
  campaignId = CAMPAIGN_A,
  premise = "A stormbound archipelago faces a failing sea route.",
): void {
  fs.writeFileSync(
    path.join(campaignDirectory(campaignId), "config.json"),
    JSON.stringify({
      name: `Campaign ${campaignId.slice(0, 8)}`,
      premise,
      createdAt: 1_000,
    }),
    "utf-8",
  );
}

function buildRequest(source: CampaignWorldSource) {
  return {
    campaignId: CAMPAIGN_A,
    expectedSourceDigest: source.sourceDigest,
    providerId: "test-provider",
    modelName: "test-model",
    model: {} as LanguageModel,
    temperature: 0.7,
    maxOutputTokens: 8_000,
  };
}

function expectSourceError(
  captured: unknown,
  code: CampaignWorldSourceError["code"],
): void {
  expect(captured).toBeInstanceOf(CampaignWorldSourceError);
  expect(captured).toMatchObject({ code });
}

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-world-service-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
  createMigratedCampaign(root, CAMPAIGN_A);
  writeConfig();
});

afterEach(() => {
  vi.useRealTimers();
  closeDb();
  if (previousCampaignsRoot === undefined) {
    delete process.env.GSD_CAMPAIGNS_ROOT;
  } else {
    process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Campaign World build service", () => {
  it("registers before returning and accepts a builder settlement at 209.999 seconds", async () => {
    vi.useFakeTimers();
    const sourceService = createCampaignWorldSourceService();
    const source = sourceService.load(CAMPAIGN_A);
    const load = vi.fn((campaignId: string) => sourceService.load(campaignId));
    const controlled = successfulControlledBuilder();
    const service = createCampaignWorldBuildService({
      sourceService: { ...sourceService, load },
      builder: controlled.builder,
      idFactory: () => "build-service-success",
      now: (() => {
        let current = 2_000;
        return () => current++;
      })(),
    });

    const started = await service.startBuild(buildRequest(source));
    const frozenSource = await controlled.entered;
    expect(started.buildId).toBe("build-service-success");
    expect(service.hasLiveCoordinator(CAMPAIGN_A, started.buildId)).toBe(true);
    expect(service.recoverInterruptedBuild(CAMPAIGN_A)).toMatchObject({
      status: "running",
      buildId: started.buildId,
    });
    expect(frozenSource).toEqual(source);

    writeConfig(CAMPAIGN_A, "A caller changed the config after acquisition.");
    const completion = service.waitForBuild(CAMPAIGN_A, started.buildId);
    expect(completion).not.toBeNull();
    await vi.advanceTimersByTimeAsync(209_999);
    expect(CAMPAIGN_WORLD_SERVICE_BUILDER_BUDGET_MS).toBe(215_000);
    expect(vi.getTimerCount()).toBe(1);
    controlled.release();
    await completion;

    const handle = openCampaignWorldDatabase(CAMPAIGN_A);
    try {
      const repository = createCampaignWorldRepository(handle);
      expect(repository.loadWorld()).toMatchObject({
        status: "review",
        source: { premise: source.premise },
      });
      expect(repository.loadBuildEvents(started.buildId)).toHaveLength(12);
    } finally {
      handle.close();
    }
    expect(load).toHaveBeenCalledOnce();
    expect(service.hasLiveCoordinator(CAMPAIGN_A, started.buildId)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails at exactly 215 seconds and observes a late builder settlement", async () => {
    vi.useFakeTimers();
    const sourceService = createCampaignWorldSourceService();
    const source = sourceService.load(CAMPAIGN_A);
    const entered = deferred<CampaignWorldSource>();
    const lateResult = deferred<ReturnType<typeof candidateFixture>>();
    let abortSignal: AbortSignal | undefined;
    let lateSettlementObserved = false;
    const builder: CampaignWorldBuilder = {
      async build(request) {
        abortSignal = request.abortSignal;
        await request.observer?.onStageStarted("world_frame");
        entered.resolve(request.source);
        const candidate = await lateResult.promise;
        lateSettlementObserved = true;
        await request.observer?.onStageStarted("world_frame");
        await request.observer?.onStageCompleted(evidenceFixture("world_frame"));
        return candidate;
      },
    };
    const service = createCampaignWorldBuildService({
      sourceService,
      builder,
      idFactory: () => "build-service-timeout",
      now: (() => {
        let current = 5_000;
        return () => current++;
      })(),
    });

    const started = await service.startBuild(buildRequest(source));
    await entered;
    const completion = service.waitForBuild(CAMPAIGN_A, started.buildId);
    expect(completion).not.toBeNull();

    await vi.advanceTimersByTimeAsync(214_999);
    expect(abortSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await completion;

    expect(abortSignal?.aborted).toBe(true);
    expect(service.hasLiveCoordinator(CAMPAIGN_A, started.buildId)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    const handle = openCampaignWorldDatabase(CAMPAIGN_A);
    try {
      const repository = createCampaignWorldRepository(handle);
      expect(repository.loadLatestBuild()).toMatchObject({
        status: "failed",
        errorCode: "world_build_timed_out",
      });
      expect(repository.loadWorld()).toBeNull();
      const events = repository.loadBuildEvents(started.buildId);
      expect(events.filter((event) => event.type === "build_failed")).toHaveLength(1);
      expect(events.filter((event) => event.type === "build_completed")).toHaveLength(0);
      expect(events.filter((event) => event.type === "stage_started")).toHaveLength(1);
      expect(events.at(-1)).toMatchObject({
        type: "build_failed",
        errorCode: "world_build_timed_out",
      });
      expect(handle.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM campaign_world_build_stages WHERE build_id = ?",
      ).get(started.buildId)).toEqual({ count: 0 });
    } finally {
      handle.close();
    }

    lateResult.resolve(candidateFixture(source));
    await vi.runAllTicks();
    expect(lateSettlementObserved).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    const lateHandle = openCampaignWorldDatabase(CAMPAIGN_A);
    try {
      const repository = createCampaignWorldRepository(lateHandle);
      const events = repository.loadBuildEvents(started.buildId);
      expect(repository.loadLatestBuild()).toMatchObject({
        status: "failed",
        errorCode: "world_build_timed_out",
      });
      expect(events.filter((event) => event.type === "build_failed")).toHaveLength(1);
      expect(events.filter((event) => event.type === "build_completed")).toHaveLength(0);
      expect(events.filter((event) => event.type === "stage_completed")).toHaveLength(0);
    } finally {
      lateHandle.close();
    }
  });

  it("turns provider failure into one durable terminal failure", async () => {
    const sourceService = createCampaignWorldSourceService();
    const source = sourceService.load(CAMPAIGN_A);
    const controlled = failingControlledBuilder();
    const service = createCampaignWorldBuildService({
      sourceService,
      builder: controlled.builder,
      idFactory: () => "build-service-failure",
      now: (() => {
        let current = 3_000;
        return () => current++;
      })(),
    });

    const started = await service.startBuild(buildRequest(source));
    await controlled.entered;
    const completion = service.waitForBuild(CAMPAIGN_A, started.buildId);
    controlled.release();
    await completion;

    const handle = openCampaignWorldDatabase(CAMPAIGN_A);
    try {
      const repository = createCampaignWorldRepository(handle);
      expect(repository.loadLatestBuild()).toMatchObject({
        status: "failed",
        errorCode: "model_contract_failed",
      });
      expect(repository.loadWorld()).toBeNull();
      const events = repository.loadBuildEvents(started.buildId);
      expect(events.filter((event) => event.type === "build_failed")).toHaveLength(1);
      expect(events.at(-1)).toMatchObject({
        type: "build_failed",
        errorCode: "model_contract_failed",
      });
      expect(handle.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM campaign_world_build_stages WHERE build_id = ?",
      ).get(started.buildId)).toEqual({ count: 1 });
      expect(handle.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM locations WHERE campaign_id = ?",
      ).get(CAMPAIGN_A)).toEqual({ count: 0 });
    } finally {
      handle.close();
    }
  });

  it("keeps campaign A isolated while the active database switches to B", async () => {
    const sourceService = createCampaignWorldSourceService();
    const source = sourceService.load(CAMPAIGN_A);
    const controlled = successfulControlledBuilder();
    const service = createCampaignWorldBuildService({
      sourceService,
      builder: controlled.builder,
      idFactory: () => "build-service-isolation",
    });

    const started = await service.startBuild(buildRequest(source));
    await controlled.entered;
    const completion = service.waitForBuild(CAMPAIGN_A, started.buildId);
    createMigratedCampaign(root, CAMPAIGN_B);
    writeConfig(CAMPAIGN_B, "A second campaign premise.");
    controlled.release();
    await completion;

    const campaignA = openCampaignWorldDatabase(CAMPAIGN_A);
    const campaignB = openCampaignWorldDatabase(CAMPAIGN_B);
    try {
      expect(createCampaignWorldRepository(campaignA).loadWorld()).toMatchObject({
        campaignId: CAMPAIGN_A,
        status: "review",
      });
      expect(createCampaignWorldRepository(campaignB).loadWorld()).toBeNull();
    } finally {
      campaignA.close();
      campaignB.close();
    }
  });

  it("recovers an orphaned running build exactly once and permits a new build", async () => {
    const sourceService = createCampaignWorldSourceService();
    const source = sourceService.load(CAMPAIGN_A);
    const seedHandle = openCampaignWorldDatabase(CAMPAIGN_A);
    try {
      createCampaignWorldRepository(seedHandle).acquireBuild({
        buildId: "orphaned-build",
        source,
        expectedSourceDigest: source.sourceDigest,
        providerId: "test-provider",
        model: "test-model",
        startedAt: 4_000,
      });
    } finally {
      seedHandle.close();
    }

    const controlled = successfulControlledBuilder();
    const service = createCampaignWorldBuildService({
      sourceService,
      builder: controlled.builder,
      idFactory: () => "build-after-recovery",
      now: (() => {
        let current = 4_100;
        return () => current++;
      })(),
    });
    expect(service.recoverInterruptedBuild(CAMPAIGN_A)).toMatchObject({
      buildId: "orphaned-build",
      status: "failed",
      errorCode: "process_interrupted",
    });
    expect(service.recoverInterruptedBuild(CAMPAIGN_A)).toMatchObject({
      buildId: "orphaned-build",
      status: "failed",
    });

    const checkHandle = openCampaignWorldDatabase(CAMPAIGN_A);
    try {
      const events = createCampaignWorldRepository(checkHandle)
        .loadBuildEvents("orphaned-build");
      expect(events.filter((event) => event.type === "build_failed")).toHaveLength(1);
    } finally {
      checkHandle.close();
    }

    const started = await service.startBuild(buildRequest(source));
    await controlled.entered;
    const completion = service.waitForBuild(CAMPAIGN_A, started.buildId);
    controlled.release();
    await completion;
    expect(service.recoverInterruptedBuild(CAMPAIGN_A)).toMatchObject({
      buildId: started.buildId,
      status: "completed",
    });
  });

  it("rejects DNA mutation when build acquisition wins the source lock", async () => {
    const sourceService = createCampaignWorldSourceService();
    const source = sourceService.load(CAMPAIGN_A);
    const controlled = successfulControlledBuilder();
    const service = createCampaignWorldBuildService({
      sourceService,
      builder: controlled.builder,
      idFactory: () => "build-wins-source-lock",
    });

    const started = await service.startBuild(buildRequest(source));
    await controlled.entered;
    let captured: unknown;
    try {
      await sourceService.saveDna({
        campaignId: CAMPAIGN_A,
        dna: DNA,
        assertWritable: service.assertSourceWritable,
      });
    } catch (error) {
      captured = error;
    }
    expectSourceError(captured, "world_build_running");
    expect(sourceService.load(CAMPAIGN_A).dna).toBeNull();

    const completion = service.waitForBuild(CAMPAIGN_A, started.buildId);
    controlled.release();
    await completion;
  });

  it("rejects a stale build when DNA mutation wins the source lock", async () => {
    const sourceService = createCampaignWorldSourceService();
    const preMutationSource = sourceService.load(CAMPAIGN_A);
    const dnaEntered = deferred<void>();
    const releaseDna = deferred<void>();
    const dnaOperation = withCampaignWorldSourceLock(CAMPAIGN_A, async () => {
      saveWorldSeeds(CAMPAIGN_A, {
        geography: DNA.geography,
        politicalStructure: DNA.politicalStructure,
        centralConflict: DNA.centralConflict,
        culturalFlavor: ["Salt-worn ritual", "Communal songs"],
        environment: DNA.environment,
        wildcard: DNA.wildcard,
      });
      dnaEntered.resolve();
      await releaseDna.promise;
    });
    await dnaEntered.promise;

    const controlled = successfulControlledBuilder();
    const service = createCampaignWorldBuildService({
      sourceService,
      builder: controlled.builder,
      idFactory: () => "stale-build",
    });
    const start = service.startBuild(buildRequest(preMutationSource));
    releaseDna.resolve();
    await dnaOperation;

    let captured: unknown;
    try {
      await start;
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(CampaignWorldRepositoryError);
    expect(captured).toMatchObject({ code: "source_changed" });
    expect(sourceService.load(CAMPAIGN_A).dna).toEqual(DNA);

    const handle = openCampaignWorldDatabase(CAMPAIGN_A);
    try {
      expect(createCampaignWorldRepository(handle).loadLatestBuild()).toBeNull();
    } finally {
      handle.close();
    }
  });
});
