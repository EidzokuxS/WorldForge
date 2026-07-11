import crypto from "node:crypto";
import type { LanguageModel } from "ai";
import type { CampaignWorldBuildStage } from "@worldforge/shared";
import { createLogger } from "../lib/index.js";
import {
  CampaignWorldBuilderError,
  campaignWorldBuilder,
  type CampaignWorldBuilder,
  type CampaignWorldModelStage,
  type CampaignWorldStageEvidence,
} from "./world-builder.js";
import {
  openCampaignWorldDatabase,
  type CampaignWorldDatabaseHandle,
} from "./world-database.js";
import {
  createCampaignWorldRepository,
  type CampaignWorldRepository,
  type StoredCampaignWorldBuild,
} from "./world-repository.js";
import {
  assertCampaignWorldSourceWritable,
  campaignWorldSourceService,
  type CampaignWorldSourceService,
} from "./world-source.js";
import { withCampaignWorldSourceLock } from "./world-source-lock.js";
import { campaignWorldPlayerMessages } from "./world-prompts.js";
import { validateCampaignWorldDraft } from "./world-validator.js";

const log = createLogger("campaign-world-build");
const modelStages = new Set<CampaignWorldModelStage>([
  "world_frame",
  "world_cast",
  "world_connections",
]);

export interface StartCampaignWorldBuildRequest {
  campaignId: string;
  expectedSourceDigest: string;
  providerId: string;
  modelName: string;
  model: LanguageModel;
  temperature: number;
  maxOutputTokens: number;
}

export interface StartedCampaignWorldBuild {
  campaignId: string;
  buildId: string;
  sourceDigest: string;
  startedAt: number;
}

interface CampaignWorldBuildCoordinator {
  campaignId: string;
  buildId: string;
  completion: Promise<void>;
}

interface CampaignWorldBuildServiceDependencies {
  sourceService: CampaignWorldSourceService;
  builder: CampaignWorldBuilder;
  openDatabase: (campaignId: string) => CampaignWorldDatabaseHandle;
  createRepository: (
    handle: CampaignWorldDatabaseHandle,
  ) => CampaignWorldRepository;
  sourceLock: typeof withCampaignWorldSourceLock;
  idFactory: () => string;
  now: () => number;
  onBackgroundError: (error: unknown) => void;
}

export interface CampaignWorldBuildService {
  startBuild(
    request: StartCampaignWorldBuildRequest,
  ): Promise<StartedCampaignWorldBuild>;
  recoverInterruptedBuild(campaignId: string): StoredCampaignWorldBuild | null;
  assertSourceWritable(campaignId: string): void;
  hasLiveCoordinator(campaignId: string, buildId: string): boolean;
  waitForBuild(campaignId: string, buildId: string): Promise<void> | null;
}

class CampaignWorldCoordinatorRegistry {
  private readonly byCampaign = new Map<
    string,
    Map<string, CampaignWorldBuildCoordinator>
  >();

  register(coordinator: CampaignWorldBuildCoordinator): void {
    const campaign = this.byCampaign.get(coordinator.campaignId) ?? new Map();
    if (campaign.has(coordinator.buildId)) {
      throw new Error(
        `Campaign World coordinator ${coordinator.buildId} is already registered.`,
      );
    }
    campaign.set(coordinator.buildId, coordinator);
    this.byCampaign.set(coordinator.campaignId, campaign);
  }

  find(
    campaignId: string,
    buildId: string,
  ): CampaignWorldBuildCoordinator | null {
    return this.byCampaign.get(campaignId)?.get(buildId) ?? null;
  }

  remove(
    campaignId: string,
    buildId: string,
    completion: Promise<void>,
  ): void {
    const campaign = this.byCampaign.get(campaignId);
    const coordinator = campaign?.get(buildId);
    if (!campaign || coordinator?.completion !== completion) return;
    campaign.delete(buildId);
    if (campaign.size === 0) this.byCampaign.delete(campaignId);
  }
}

interface BuildFailure {
  errorCode: string;
  message: string;
  evidence?: CampaignWorldStageEvidence;
}

function failedModelEvidence(
  error: CampaignWorldBuilderError,
): CampaignWorldStageEvidence | undefined {
  if (!modelStages.has(error.stage as CampaignWorldModelStage)) return undefined;
  for (let index = error.stageEvidence.length - 1; index >= 0; index -= 1) {
    const evidence = error.stageEvidence[index];
    if (evidence.stage === error.stage) return evidence;
  }
  return undefined;
}

function buildFailure(error: unknown): BuildFailure {
  if (error instanceof CampaignWorldBuilderError) {
    if (error.code === "structured_output_unavailable") {
      return {
        errorCode: error.code,
        message: campaignWorldPlayerMessages.structuredOutputUnavailable,
      };
    }
    return {
      errorCode: error.code,
      message: campaignWorldPlayerMessages.modelContractFailed,
      evidence: failedModelEvidence(error),
    };
  }
  return {
    errorCode: "world_build_failed",
    message: campaignWorldPlayerMessages.worldBuildFailed,
  };
}

function recordCodeStage(
  repository: CampaignWorldRepository,
  buildId: string,
  stage: Extract<CampaignWorldBuildStage, "validation" | "persistence">,
  now: () => number,
  operation: () => void,
): void {
  repository.recordStageStarted({ buildId, stage, createdAt: now() });
  operation();
  if (stage === "validation") {
    repository.recordStageCompleted({ buildId, stage, createdAt: now() });
  }
}

async function executeBuild(
  request: StartCampaignWorldBuildRequest,
  buildId: string,
  repository: CampaignWorldRepository,
  dependencies: CampaignWorldBuildServiceDependencies,
): Promise<void> {
  try {
    const source = repository.loadBuildContext(buildId).source;
    const candidate = await dependencies.builder.build({
      source,
      model: request.model,
      temperature: request.temperature,
      maxOutputTokens: request.maxOutputTokens,
      observer: {
        onStageStarted(stage) {
          repository.recordStageStarted({
            buildId,
            stage,
            createdAt: dependencies.now(),
          });
        },
        onStageCompleted(evidence) {
          repository.recordStageCompleted({
            buildId,
            stage: evidence.stage,
            evidence,
            createdAt: dependencies.now(),
          });
        },
      },
    });

    recordCodeStage(
      repository,
      buildId,
      "validation",
      dependencies.now,
      () => {
        validateCampaignWorldDraft(candidate.draft);
      },
    );
    recordCodeStage(
      repository,
      buildId,
      "persistence",
      dependencies.now,
      () => {},
    );
    repository.completeBuild({
      buildId,
      candidate,
      completedAt: dependencies.now(),
    });
  } catch (error) {
    const failure = buildFailure(error);
    repository.failBuild({
      buildId,
      errorCode: failure.errorCode,
      message: failure.message,
      completedAt: dependencies.now(),
      evidence: failure.evidence,
    });
  }
}

export function createCampaignWorldBuildService(
  overrides: Partial<CampaignWorldBuildServiceDependencies> = {},
): CampaignWorldBuildService {
  const dependencies: CampaignWorldBuildServiceDependencies = {
    sourceService: campaignWorldSourceService,
    builder: campaignWorldBuilder,
    openDatabase: openCampaignWorldDatabase,
    createRepository: createCampaignWorldRepository,
    sourceLock: withCampaignWorldSourceLock,
    idFactory: crypto.randomUUID,
    now: Date.now,
    onBackgroundError: (error) => {
      log.error("Campaign World coordinator failed outside its terminal transaction", error);
    },
    ...overrides,
  };
  const registry = new CampaignWorldCoordinatorRegistry();

  const recoverInterruptedBuild = (
    campaignId: string,
  ): StoredCampaignWorldBuild | null => {
    const handle = dependencies.openDatabase(campaignId);
    try {
      const repository = dependencies.createRepository(handle);
      const latest = repository.loadLatestBuild();
      if (
        latest?.status === "running" &&
        !registry.find(campaignId, latest.buildId)
      ) {
        repository.failBuild({
          buildId: latest.buildId,
          errorCode: "process_interrupted",
          message: campaignWorldPlayerMessages.processInterrupted,
          completedAt: dependencies.now(),
        });
        return repository.loadLatestBuild();
      }
      return latest;
    } finally {
      handle.close();
    }
  };

  return {
    async startBuild(request) {
      const handle = dependencies.openDatabase(request.campaignId);
      let workerOwnsHandle = false;
      try {
        const prepared = await dependencies.sourceLock(
          request.campaignId,
          () => {
            const source = dependencies.sourceService.load(request.campaignId);
            const repository = dependencies.createRepository(handle);
            const buildId = dependencies.idFactory();
            const startedAt = dependencies.now();
            repository.acquireBuild({
              buildId,
              source,
              expectedSourceDigest: request.expectedSourceDigest,
              providerId: request.providerId,
              model: request.modelName,
              startedAt,
            });

            let startWorker!: () => void;
            const workerGate = new Promise<void>((resolve) => {
              startWorker = resolve;
            });
            let completion!: Promise<void>;
            completion = workerGate
              .then(() => executeBuild(request, buildId, repository, dependencies))
              .finally(() => {
                registry.remove(request.campaignId, buildId, completion);
                handle.close();
              });
            registry.register({
              campaignId: request.campaignId,
              buildId,
              completion,
            });
            void completion.catch(dependencies.onBackgroundError);
            workerOwnsHandle = true;

            return {
              started: {
                campaignId: request.campaignId,
                buildId,
                sourceDigest: source.sourceDigest,
                startedAt,
              },
              startWorker,
            };
          },
        );
        prepared.startWorker();
        return prepared.started;
      } catch (error) {
        if (!workerOwnsHandle) handle.close();
        throw error;
      }
    },

    recoverInterruptedBuild,

    assertSourceWritable(campaignId) {
      recoverInterruptedBuild(campaignId);
      const handle = dependencies.openDatabase(campaignId);
      try {
        const repository = dependencies.createRepository(handle);
        assertCampaignWorldSourceWritable(repository.loadSourceStatus());
      } finally {
        handle.close();
      }
    },

    hasLiveCoordinator(campaignId, buildId) {
      return registry.find(campaignId, buildId) !== null;
    },

    waitForBuild(campaignId, buildId) {
      return registry.find(campaignId, buildId)?.completion ?? null;
    },
  };
}

export const campaignWorldBuildService = createCampaignWorldBuildService();
