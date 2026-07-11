import crypto from "node:crypto";
import type { LanguageModel } from "ai";
import type { ZodType } from "zod";
import type {
  ActorGoal,
  PressureUrgency,
  RelationIntensity,
  RouteCost,
} from "@worldforge/shared";
import {
  getSafeGenerateObjectErrorCode,
  getSafeGenerateObjectTrace,
  safeGenerateObject,
  type SafeGenerateErrorCode,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";
import {
  getStructuredOutputModelMetadata,
  resolveStructuredOutputCapability,
} from "../ai/structured-output-capabilities.js";
import {
  createWorldCastPacketSchema,
  createWorldConnectionsPacketSchema,
  worldFramePacketSchema,
  type WorldCastPacket,
  type WorldConnectionsPacket,
  type WorldFramePacket,
} from "./contracts.js";
import {
  buildWorldCastPrompt,
  buildWorldConnectionsPrompt,
  buildWorldFramePrompt,
} from "./world-prompts.js";
import { calculateCampaignWorldContentHash } from "./world-snapshot.js";
import {
  CampaignWorldValidationError,
  validateCampaignWorldDraft,
  type CampaignWorldDraft,
} from "./world-validator.js";
import type { CampaignWorldSource } from "@worldforge/shared";

export type CampaignWorldModelStage =
  | "world_frame"
  | "world_cast"
  | "world_connections";

export interface CampaignWorldStageEvidence {
  stage: CampaignWorldModelStage;
  requestedMode: string;
  primaryStrategy: string | null;
  actualStrategy: string | null;
  totalAttempts: number;
  repairUsed: boolean;
  retryUsed: boolean;
  textFallbackUsed: boolean;
  responseModel: string | null;
  finishReason: string | null;
  errorCode: SafeGenerateErrorCode | "model_contract_failed" | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface CampaignWorldBuildCandidate {
  draft: CampaignWorldDraft;
  contentHash: string;
  stageEvidence: CampaignWorldStageEvidence[];
}

export type CampaignWorldBuilderErrorCode =
  | "structured_output_unavailable"
  | "model_contract_failed"
  | "world_validation_failed";

export class CampaignWorldBuilderError extends Error {
  constructor(
    readonly code: CampaignWorldBuilderErrorCode,
    readonly stage: CampaignWorldModelStage | "validation",
    readonly stageEvidence: CampaignWorldStageEvidence[],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignWorldBuilderError";
  }
}

export interface CampaignWorldBuilderObserver {
  onStageStarted(stage: CampaignWorldModelStage): Promise<void> | void;
  onStageCompleted(evidence: CampaignWorldStageEvidence): Promise<void> | void;
}

export interface CampaignWorldBuildRequest {
  source: CampaignWorldSource;
  model: LanguageModel;
  temperature: number;
  maxOutputTokens: number;
  observer?: CampaignWorldBuilderObserver;
}

interface CampaignWorldBuilderDependencies {
  generateObject: typeof safeGenerateObject;
  idFactory: () => string;
}

export interface CampaignWorldBuilder {
  build(request: CampaignWorldBuildRequest): Promise<CampaignWorldBuildCandidate>;
}

export function createCampaignWorldStageEvidence(
  stage: CampaignWorldModelStage,
  trace: Readonly<SafeGenerateTrace> | null,
  errorCode: SafeGenerateErrorCode | "model_contract_failed" | null,
  failed: boolean,
  expectedPrimaryStrategy: string | null = null,
): CampaignWorldStageEvidence {
  const primaryStrategy =
    trace?.primaryStrategy ??
    trace?.capability?.primaryStrategy ??
    expectedPrimaryStrategy;
  const traceStrategy = trace?.strategy ?? null;
  const actualStrategy = failed && traceStrategy === "full_retry"
    ? primaryStrategy
    : traceStrategy ?? trace?.capability?.actualMode ?? primaryStrategy;

  return {
    stage,
    requestedMode:
      trace?.requestedMode ?? trace?.capability?.requestedMode ?? "auto",
    primaryStrategy,
    actualStrategy,
    totalAttempts: 1,
    repairUsed:
      traceStrategy === "repair" ||
      trace?.repair !== undefined ||
      trace?.repairedFromStrategy !== undefined,
    retryUsed: failed ? false : traceStrategy === "full_retry",
    textFallbackUsed: traceStrategy === "text_fallback",
    responseModel: trace?.response?.modelId ?? null,
    finishReason: trace?.finishReason ?? null,
    errorCode,
    inputTokens: trace?.usage?.inputTokens ?? null,
    outputTokens: trace?.usage?.outputTokens ?? null,
    totalTokens: trace?.usage?.totalTokens ?? null,
  };
}

function assertSuccessfulEvidence(evidence: CampaignWorldStageEvidence): void {
  const structuredStrategies = new Set([
    "native_schema",
    "native_json",
    "tool_mode",
  ]);
  if (
    evidence.requestedMode !== "auto" ||
    evidence.primaryStrategy === null ||
    !structuredStrategies.has(evidence.primaryStrategy) ||
    evidence.actualStrategy !== evidence.primaryStrategy ||
    evidence.totalAttempts !== 1 ||
    evidence.repairUsed ||
    evidence.retryUsed ||
    evidence.textFallbackUsed
  ) {
    throw new CampaignWorldBuilderError(
      "model_contract_failed",
      evidence.stage,
      [evidence],
      `Campaign World stage ${evidence.stage} used an invalid structured-output strategy.`,
    );
  }
}

function requireMappedId(
  mapping: ReadonlyMap<string, string>,
  reference: string,
  label: string,
): string {
  const id = mapping.get(reference);
  if (!id) {
    throw new Error(`${label} reference ${reference} was not resolved.`);
  }
  return id;
}

function composeWorldDraft(
  frame: WorldFramePacket,
  cast: WorldCastPacket,
  connections: WorldConnectionsPacket,
  idFactory: () => string,
): CampaignWorldDraft {
  const locationIdByRef = new Map(
    frame.locations.map((location) => [location.locationRef, idFactory()]),
  );
  const actorIdByRef = new Map(
    cast.actors.map((actor) => [actor.actorRef, idFactory()]),
  );

  return {
    worldSummary: frame.worldSummary,
    locations: frame.locations.map((location) => ({
      id: requireMappedId(locationIdByRef, location.locationRef, "Location"),
      name: location.name,
      description: location.description,
      kind: location.kind,
      parentLocationId: location.parentLocationRef === null
        ? null
        : requireMappedId(
            locationIdByRef,
            location.parentLocationRef,
            "Parent location",
          ),
      tags: [...location.tags],
      isStarting: location.isStarting,
    })),
    routes: frame.routes.map((route) => ({
      id: idFactory(),
      fromLocationId: requireMappedId(
        locationIdByRef,
        route.fromLocationRef,
        "Route origin",
      ),
      toLocationId: requireMappedId(
        locationIdByRef,
        route.toLocationRef,
        "Route destination",
      ),
      travelCost: route.travelCost as RouteCost,
    })),
    actors: cast.actors.map((actor) => ({
      id: requireMappedId(actorIdByRef, actor.actorRef, "Actor"),
      kind: actor.kind,
      controller: actor.controller,
      role: actor.role,
      name: actor.name,
      summary: actor.summary,
      traits: [...actor.traits],
      tags: [...actor.tags],
    })),
    goals: cast.goals.map((goal) => ({
      id: idFactory(),
      actorId: requireMappedId(actorIdByRef, goal.actorRef, "Goal actor"),
      objective: goal.objective,
      motivation: goal.motivation,
      horizon: goal.horizon,
      priority: goal.priority as ActorGoal["priority"],
      status: goal.status,
    })),
    relations: connections.relations.map((relation) => ({
      id: idFactory(),
      sourceActorId: requireMappedId(
        actorIdByRef,
        relation.sourceActorRef,
        "Relation source",
      ),
      targetActorId: requireMappedId(
        actorIdByRef,
        relation.targetActorRef,
        "Relation target",
      ),
      relationType: relation.relationType,
      summary: relation.summary,
      intensity: relation.intensity as RelationIntensity,
    })),
    placements: cast.placements.map((placement) => ({
      id: idFactory(),
      actorId: requireMappedId(
        actorIdByRef,
        placement.actorRef,
        "Placement actor",
      ),
      locationId: requireMappedId(
        locationIdByRef,
        placement.locationRef,
        "Placement location",
      ),
      placementKind: placement.placementKind,
    })),
    pressures: connections.pressures.map((pressure) => ({
      id: idFactory(),
      name: pressure.name,
      description: pressure.description,
      trajectory: pressure.trajectory,
      urgency: pressure.urgency as PressureUrgency,
      actorIds: pressure.actorRefs.map((actorRef) =>
        requireMappedId(actorIdByRef, actorRef, "Pressure actor"),
      ),
      locationIds: pressure.locationRefs.map((locationRef) =>
        requireMappedId(locationIdByRef, locationRef, "Pressure location"),
      ),
    })),
  };
}

export function createCampaignWorldBuilder(
  overrides: Partial<CampaignWorldBuilderDependencies> = {},
): CampaignWorldBuilder {
  const dependencies: CampaignWorldBuilderDependencies = {
    generateObject: safeGenerateObject,
    idFactory: crypto.randomUUID,
    ...overrides,
  };

  return {
    async build(request) {
      const capability = resolveStructuredOutputCapability({
        metadata: getStructuredOutputModelMetadata(request.model),
        requestedMode: "auto",
      });
      if (capability.primaryStrategy === "text_fallback") {
        throw new CampaignWorldBuilderError(
          "structured_output_unavailable",
          "world_frame",
          [],
          "The selected model has no registered structured-output strategy.",
        );
      }

      const evidence: CampaignWorldStageEvidence[] = [];
      const runStage = async <T>(
        stage: CampaignWorldModelStage,
        schema: ZodType<T>,
        prompt: string,
      ): Promise<T> => {
        await request.observer?.onStageStarted(stage);
        let result;
        try {
          result = await dependencies.generateObject({
            model: request.model,
            schema,
            prompt,
            temperature: request.temperature,
            maxOutputTokens: request.maxOutputTokens,
            mode: "auto",
            strictSchema: true,
            allowRepair: false,
            allowTextFallback: false,
            retries: 1,
          });
        } catch (error) {
          const failedEvidence = createCampaignWorldStageEvidence(
            stage,
            getSafeGenerateObjectTrace(error),
            getSafeGenerateObjectErrorCode(error) ?? "model_contract_failed",
            true,
            capability.primaryStrategy,
          );
          throw new CampaignWorldBuilderError(
            "model_contract_failed",
            stage,
            [...evidence, failedEvidence],
            `Campaign World stage ${stage} failed its model contract.`,
            { cause: error },
          );
        }

        const completedEvidence = createCampaignWorldStageEvidence(
          stage,
          result.trace,
          null,
          false,
        );
        try {
          assertSuccessfulEvidence(completedEvidence);
        } catch (error) {
          if (error instanceof CampaignWorldBuilderError) {
            throw new CampaignWorldBuilderError(
              error.code,
              error.stage,
              [...evidence, completedEvidence],
              error.message,
              { cause: error },
            );
          }
          throw error;
        }
        evidence.push(completedEvidence);
        await request.observer?.onStageCompleted(completedEvidence);
        return result.object;
      };

      const frame = await runStage(
        "world_frame",
        worldFramePacketSchema,
        buildWorldFramePrompt(request.source),
      );
      const cast = await runStage(
        "world_cast",
        createWorldCastPacketSchema(frame),
        buildWorldCastPrompt(request.source, frame),
      );
      const connections = await runStage(
        "world_connections",
        createWorldConnectionsPacketSchema(frame, cast),
        buildWorldConnectionsPrompt(request.source, frame, cast),
      );

      try {
        const draft = validateCampaignWorldDraft(
          composeWorldDraft(frame, cast, connections, dependencies.idFactory),
        );
        return {
          draft,
          contentHash: calculateCampaignWorldContentHash(
            request.source.sourceDigest,
            draft,
          ),
          stageEvidence: [...evidence],
        };
      } catch (error) {
        throw new CampaignWorldBuilderError(
          "world_validation_failed",
          "validation",
          [...evidence],
          error instanceof CampaignWorldValidationError
            ? error.message
            : "Campaign World reference resolution failed.",
          { cause: error },
        );
      }
    },
  };
}

export const campaignWorldBuilder = createCampaignWorldBuilder();
