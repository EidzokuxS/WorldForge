import crypto from "node:crypto";
import type { LanguageModel } from "ai";
import { z, type ZodType } from "zod";
import type {
  ActorGoal,
  PressureUrgency,
  RelationIntensity,
  RouteCost,
} from "@worldforge/shared";
import {
  getSafeGenerateObjectErrorCode,
  getSafeGenerateObjectSchemaDiagnostics,
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
import { createLogger } from "../lib/index.js";

const log = createLogger("campaign-world-builder");

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

/**
 * Provider-facing transport for the Z.AI tool-mode world-frame call.
 *
 * Keep this deliberately less expressive than the domain contract. The
 * decoder below restores the domain references only after the provider-safe
 * object has been checked for shape and exact index usage.
 */
export const worldFrameToolPacketSchema = z.object({
  worldSummary: z.string().min(1),
  startingMacroIndex: z.number().int().min(0).max(2),
  macroLocations: z.array(z.object({
    locationKey: z.string().min(1),
    name: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
  }).strict()).length(3),
  persistentLocations: z.array(z.object({
    locationKey: z.string().min(1),
    name: z.string(),
    description: z.string(),
    parentMacroIndex: z.number().int().min(0).max(2),
    tags: z.array(z.string()),
  }).strict()).min(6).max(7),
  routes: z.array(z.object({
    fromPersistentIndex: z.number().int(),
    toPersistentIndex: z.number().int(),
    travelCost: z.number().int().min(1).max(10),
  }).strict()).min(2).max(30),
}).strict();

export type WorldFrameToolPacket = z.infer<typeof worldFrameToolPacketSchema>;

const WORLD_FRAME_RECOVERY_CHECKS = [
  "location_key",
  "location_count",
  "location_kind",
  "starting_macro",
  "parent_index",
  "parent_macro",
  "macro_children",
  "route_index",
  "route_endpoint_kind",
  "route_self",
  "route_duplicate",
  "route_connectivity",
  "route_cost",
  "text_or_tag_shape",
  "unknown_contract_issue",
] as const;

type WorldFrameRecoveryCheck = typeof WORLD_FRAME_RECOVERY_CHECKS[number];

type WorldFrameRecoveryIssue = Readonly<{
  issueIndex: number;
  code: string;
  path: ReadonlyArray<string | number>;
  check: WorldFrameRecoveryCheck;
}>;

type WorldFrameRecoveryDiagnostic = Readonly<{
  stage: CampaignWorldModelStage;
  attempt: number;
  issueCount: number;
  issues: ReadonlyArray<WorldFrameRecoveryIssue>;
  provider: string | null;
  model: string | null;
  strategy: string | null;
}>;

const MAX_RECOVERY_ISSUES = 8;
const MAX_RECOVERY_PATH_SEGMENTS = 12;
const SAFE_SCHEMA_PATH_NAMES = new Set([
  "worldSummary",
  "startingMacroIndex",
  "macroLocations",
  "persistentLocations",
  "locations",
  "routes",
  "locationKey",
  "locationRef",
  "name",
  "description",
  "kind",
  "parentMacroIndex",
  "parentLocationIndex",
  "parentLocationRef",
  "tags",
  "isStarting",
  "fromPersistentIndex",
  "toPersistentIndex",
  "fromLocationIndex",
  "toLocationIndex",
  "fromLocationRef",
  "toLocationRef",
  "travelCost",
]);

function sanitizeWorldFrameSchemaPath(path: unknown): ReadonlyArray<string | number> {
  const segments = Array.isArray(path) ? path : [];
  return Object.freeze(segments.slice(0, MAX_RECOVERY_PATH_SEGMENTS).map((segment) => {
    if (
      typeof segment === "number" &&
      Number.isSafeInteger(segment) &&
      segment >= 0
    ) {
      return segment;
    }
    if (typeof segment === "string" && SAFE_SCHEMA_PATH_NAMES.has(segment)) {
      return segment;
    }
    return "[dynamic]";
  }));
}

function sanitizeWorldFrameIssueCode(code: unknown): string {
  if (typeof code !== "string") return "unknown";
  const trimmed = code.trim();
  return /^[a-zA-Z0-9_.:-]{1,64}$/.test(trimmed) ? trimmed : "unknown";
}

function createWorldFrameRecoveryIssue(
  issueIndex: number,
  code: unknown,
  path: unknown,
  check: WorldFrameRecoveryCheck,
): WorldFrameRecoveryIssue {
  return Object.freeze({
    issueIndex: Number.isSafeInteger(issueIndex) && issueIndex >= 0
      ? issueIndex
      : 0,
    code: sanitizeWorldFrameIssueCode(code),
    path: sanitizeWorldFrameSchemaPath(path),
    check,
  });
}

class WorldFrameLocalContractError extends Error {
  readonly recoveryIssues: ReadonlyArray<WorldFrameRecoveryIssue>;

  constructor(
    recoveryIssues: readonly WorldFrameRecoveryIssue[],
    options?: ErrorOptions,
  ) {
    super("World-frame output failed the local contract.", options);
    this.name = "WorldFrameLocalContractError";
    this.recoveryIssues = Object.freeze([...recoveryIssues]);
  }
}

function directWorldFrameIssueCheck(
  path: readonly (string | number)[],
  code: string,
  rootIssueCount = 0,
  rootIssueIndex = 0,
): WorldFrameRecoveryCheck {
  const last = path[path.length - 1];
  if (last === "locationKey" || last === "locationRef") return "location_key";
  if (last === "kind") return "location_kind";
  if (last === "startingMacroIndex") return "starting_macro";
  if (last === "parentMacroIndex" || last === "parentLocationIndex") return "parent_index";
  if (last === "parentLocationRef") return "parent_macro";
  if (
    last === "fromPersistentIndex" ||
    last === "toPersistentIndex" ||
    last === "fromLocationIndex" ||
    last === "toLocationIndex"
  ) return "route_index";
  if (last === "fromLocationRef" || last === "toLocationRef") return "route_endpoint_kind";
  if (last === "travelCost") return "route_cost";
  if (last === "isStarting" && code === "custom") return "starting_macro";
  if (
    last === "name" ||
    last === "description" ||
    last === "tags" ||
    last === "worldSummary" ||
    last === "isStarting"
  ) {
    return "text_or_tag_shape";
  }
  if (
    (path[0] === "locations" ||
      path[0] === "macroLocations" ||
      path[0] === "persistentLocations") &&
    (code === "too_small" || code === "too_big")
  ) {
    return "location_count";
  }
  if (path[0] === "routes" && (code === "too_small" || code === "too_big")) {
    return "route_index";
  }
  if (path[0] === "routes" && typeof path[1] === "number" && code === "custom") {
    return "route_self";
  }
  if (path[0] === "locations" && code === "custom") {
    return rootIssueCount === 1
      ? "location_key"
      : rootIssueIndex === 0
        ? "macro_children"
        : "unknown_contract_issue";
  }
  if (path[0] === "routes" && code === "custom") {
    return rootIssueCount > 1 && rootIssueIndex === 0
      ? "route_duplicate"
      : "route_connectivity";
  }
  return "unknown_contract_issue";
}

function safeIssuesFromZodError(
  error: unknown,
): readonly WorldFrameRecoveryIssue[] {
  const issues = error instanceof z.ZodError ? error.issues : [];
  const rootLocationIssues = issues.filter((issue) =>
    issue.code === "custom" && issue.path.length === 1 && issue.path[0] === "locations"
  );
  const rootRouteIssues = issues.filter((issue) =>
    issue.code === "custom" && issue.path.length === 1 && issue.path[0] === "routes"
  );
  let rootLocationIssueIndex = 0;
  let rootRouteIssueIndex = 0;
  const safeIssues = issues.slice(0, MAX_RECOVERY_ISSUES).map((issue, index) => {
    const code = sanitizeWorldFrameIssueCode(issue.code);
    const path = sanitizeWorldFrameSchemaPath(issue.path);
    const locationIssueIndex = path[0] === "locations" && code === "custom"
      ? rootLocationIssueIndex++
      : 0;
    const routeIssueIndex = path[0] === "routes" && code === "custom"
      ? rootRouteIssueIndex++
      : 0;
    return createWorldFrameRecoveryIssue(
      index,
      code,
      path,
      directWorldFrameIssueCheck(
        path,
        code,
        path[0] === "locations" && code === "custom"
          ? rootLocationIssues.length
          : path[0] === "routes" && code === "custom"
            ? rootRouteIssues.length
            : 0,
        path[0] === "locations" && code === "custom"
          ? locationIssueIndex
          : path[0] === "routes" && code === "custom"
            ? routeIssueIndex
            : 0,
      ),
    );
  });
  return safeIssues.length > 0
    ? Object.freeze(safeIssues)
    : Object.freeze([
      createWorldFrameRecoveryIssue(0, "unknown", [], "unknown_contract_issue"),
    ]);
}

function safeIssuesFromProviderDiagnostics(
  diagnostics: ReturnType<typeof getSafeGenerateObjectSchemaDiagnostics>,
): { issueCount: number; issues: readonly WorldFrameRecoveryIssue[] } {
  if (!diagnostics) {
    return {
      issueCount: 1,
      issues: [createWorldFrameRecoveryIssue(0, "unknown", [], "unknown_contract_issue")],
    };
  }
  const issues = diagnostics.schemaIssues.slice(0, MAX_RECOVERY_ISSUES).map((issue) => {
    const path = sanitizeWorldFrameSchemaPath(issue.path);
    const code = sanitizeWorldFrameIssueCode(issue.code);
    return createWorldFrameRecoveryIssue(
      issue.issueIndex,
      code,
      path,
      directWorldFrameIssueCheck(path, code),
    );
  });
  return {
    issueCount: Math.max(diagnostics.schemaIssueCount, issues.length, 1),
    issues: issues.length > 0
      ? Object.freeze(issues)
      : Object.freeze([
        createWorldFrameRecoveryIssue(0, "unknown", [], "unknown_contract_issue"),
      ]),
  };
}

function worldFrameRecoveryIssuesFromError(
  error: unknown,
): { issueCount: number; issues: readonly WorldFrameRecoveryIssue[] } {
  if (error instanceof WorldFrameLocalContractError) {
    return {
      issueCount: Math.max(error.recoveryIssues.length, 1),
      issues: error.recoveryIssues,
    };
  }
  return safeIssuesFromProviderDiagnostics(getSafeGenerateObjectSchemaDiagnostics(error));
}

function createWorldFrameRecoveryDiagnostic(
  stage: CampaignWorldModelStage,
  attempt: number,
  error: unknown,
  trace: StageTrace,
): WorldFrameRecoveryDiagnostic {
  const issueData = worldFrameRecoveryIssuesFromError(error);
  return Object.freeze({
    stage,
    attempt,
    issueCount: issueData.issueCount,
    issues: Object.freeze([...issueData.issues]),
    provider: trace?.capability?.providerId ?? trace?.capability?.providerName ?? null,
    model: trace?.response?.modelId ?? trace?.capability?.model ?? null,
    strategy: trace?.strategy ?? trace?.capability?.actualMode ?? null,
  });
}

function appendWorldFrameRecoveryPrompt(
  basePrompt: string,
  diagnostic: WorldFrameRecoveryDiagnostic,
): string {
  const safeIssues = diagnostic.issues.map(({ issueIndex, code, path, check }) => ({
    issueIndex,
    code,
    path,
    check,
  }));
  return [
    basePrompt,
    "",
    "WORLD_FRAME_RECOVERY: The previous object was rejected by the local world-frame contract. Return a complete fresh object using the same campaign source and provider schema. Correct every listed coordinate and recheck the whole object; the list may be non-exhaustive. Do not reuse an unchecked field, omit a required location or route, add an extra key, or replace a missing value with a default. SAFE_ISSUES follows and contains only issueIndex, code, path, and check.",
    "SAFE_ISSUES",
    JSON.stringify(safeIssues),
    "END_SAFE_ISSUES",
  ].join("\n");
}

function structuralLocationReferenceAtIndex(
  locations: readonly { locationKey: string }[],
  index: number,
  path: readonly (string | number)[],
): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= locations.length) {
    throw new WorldFrameLocalContractError([
      createWorldFrameRecoveryIssue(
        0,
        "index_out_of_range",
        path,
        path[0] === "persistentLocations" ? "parent_index" : "route_index",
      ),
    ]);
  }
  const location = locations[index];
  if (!location) {
    throw new WorldFrameLocalContractError([
      createWorldFrameRecoveryIssue(
        0,
        "index_missing",
        path,
        path[0] === "persistentLocations" ? "parent_index" : "route_index",
      ),
    ]);
  }
  return `location:${location.locationKey}`;
}

/**
 * Decode the provider-safe indexed transport into the unchanged domain
 * contract. The final parse is intentionally the last operation so every
 * existing world-frame invariant remains authoritative.
 */
export function decodeWorldFrameToolPacket(input: unknown): WorldFramePacket {
  let transport: WorldFrameToolPacket;
  try {
    transport = worldFrameToolPacketSchema.parse(input);
  } catch (error) {
    throw new WorldFrameLocalContractError(
      safeIssuesFromZodError(error),
    );
  }

  const locations = [
    ...transport.macroLocations.map((location, index) => ({
      locationRef: `location:${location.locationKey}`,
      name: location.name,
      description: location.description,
      kind: "macro" as const,
      parentLocationRef: null,
      tags: [...location.tags],
      isStarting: index === transport.startingMacroIndex,
    })),
    ...transport.persistentLocations.map((location, index) => ({
      locationRef: `location:${location.locationKey}`,
      name: location.name,
      description: location.description,
      kind: "persistent_sublocation" as const,
      parentLocationRef: structuralLocationReferenceAtIndex(
        transport.macroLocations,
        location.parentMacroIndex,
        ["persistentLocations", index, "parentMacroIndex"],
      ),
      tags: [...location.tags],
      isStarting: false,
    })),
  ];
  const routes = transport.routes.map((route, index) => ({
    fromLocationRef: structuralLocationReferenceAtIndex(
      transport.persistentLocations,
      route.fromPersistentIndex,
      ["routes", index, "fromPersistentIndex"],
    ),
    toLocationRef: structuralLocationReferenceAtIndex(
      transport.persistentLocations,
      route.toPersistentIndex,
      ["routes", index, "toPersistentIndex"],
    ),
    travelCost: route.travelCost,
  }));

  const decoded = {
    worldSummary: transport.worldSummary,
    locations,
    routes,
  } as WorldFramePacket;
  try {
    return worldFramePacketSchema.parse(decoded);
  } catch (error) {
    throw new WorldFrameLocalContractError(
      safeIssuesFromZodError(error),
    );
  }
}

const MAX_STAGE_ATTEMPTS = 3;

type StageTrace = Readonly<SafeGenerateTrace> | null;

function aggregateUsage(
  traces: readonly StageTrace[],
  key: "inputTokens" | "outputTokens" | "totalTokens",
): number | null {
  if (
    traces.length === 0 ||
    traces.some((trace) => {
      const value = trace?.usage?.[key];
      return typeof value !== "number" || !Number.isFinite(value);
    })
  ) {
    return null;
  }
  return traces.reduce((sum, trace) => sum + trace!.usage![key]!, 0);
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
  totalAttempts = 1,
  attemptTraces?: readonly StageTrace[],
): CampaignWorldStageEvidence {
  const traces = attemptTraces ?? (totalAttempts === 1
    ? [trace]
    : Array.from({ length: totalAttempts }, (_, index) =>
      index === totalAttempts - 1 ? trace : null
    ));
  const representativeTrace = [...traces].reverse().find(Boolean) ?? trace;
  const primaryStrategy =
    representativeTrace?.primaryStrategy ??
    representativeTrace?.capability?.primaryStrategy ??
    expectedPrimaryStrategy;
  const traceStrategy = representativeTrace?.strategy ?? null;
  const actualStrategy = failed && traceStrategy === "full_retry"
    ? primaryStrategy
    : traceStrategy ?? representativeTrace?.capability?.actualMode ?? primaryStrategy;

  return {
    stage,
    requestedMode:
      representativeTrace?.requestedMode ?? representativeTrace?.capability?.requestedMode ?? "auto",
    primaryStrategy,
    actualStrategy,
    totalAttempts,
    repairUsed:
      traces.some((attemptTrace) =>
        attemptTrace?.strategy === "repair" ||
        attemptTrace?.repair !== undefined ||
        attemptTrace?.repairedFromStrategy !== undefined,
      ),
    retryUsed: totalAttempts > 1,
    textFallbackUsed: traces.some((attemptTrace) =>
      attemptTrace?.strategy === "text_fallback"
    ),
    responseModel: representativeTrace?.response?.modelId ?? null,
    finishReason: representativeTrace?.finishReason ?? null,
    errorCode,
    inputTokens: aggregateUsage(traces, "inputTokens"),
    outputTokens: aggregateUsage(traces, "outputTokens"),
    totalTokens: aggregateUsage(traces, "totalTokens"),
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
    evidence.totalAttempts < 1 ||
    evidence.totalAttempts > MAX_STAGE_ATTEMPTS ||
    evidence.repairUsed ||
    evidence.retryUsed !== evidence.totalAttempts > 1 ||
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
      const runStage = async <Generated, Accepted = Generated>(
        stage: CampaignWorldModelStage,
        schema: ZodType<Generated>,
        prompt: string,
        decode: (value: Generated) => Accepted = ((value) => value as unknown as Accepted),
      ): Promise<Accepted> => {
        await request.observer?.onStageStarted(stage);
        const attemptTraces: StageTrace[] = [];
        const baseGenerationOptions = {
          model: request.model,
          schema,
          prompt,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          mode: "auto" as const,
          strictSchema: true,
          allowRepair: false,
          allowTextFallback: false,
          retries: 1,
        };
        let lastError: unknown = null;
        let lastRecoveryDiagnostic: WorldFrameRecoveryDiagnostic | null = null;

        for (let attempt = 1; attempt <= MAX_STAGE_ATTEMPTS; attempt += 1) {
          let result: Awaited<ReturnType<typeof safeGenerateObject<Generated>>> | null = null;
          const generationOptions = stage === "world_frame" && lastRecoveryDiagnostic !== null
            ? {
              ...baseGenerationOptions,
              prompt: appendWorldFrameRecoveryPrompt(
                prompt,
                lastRecoveryDiagnostic,
              ),
            }
            : baseGenerationOptions;
          try {
            result = await dependencies.generateObject(generationOptions);
            attemptTraces.push(result.trace);
            const accepted = decode(result.object);
            const completedEvidence = createCampaignWorldStageEvidence(
              stage,
              result.trace,
              null,
              false,
              capability.primaryStrategy,
              attempt,
              attemptTraces,
            );
            assertSuccessfulEvidence(completedEvidence);
            evidence.push(completedEvidence);
            await request.observer?.onStageCompleted(completedEvidence);
            return accepted;
          } catch (error) {
            lastError = error;
            const failedTrace = result?.trace ?? getSafeGenerateObjectTrace(error);
            if (result === null) {
              attemptTraces.push(failedTrace);
            }
            const recoveryDiagnostic = createWorldFrameRecoveryDiagnostic(
              stage,
              attempt,
              error,
              failedTrace,
            );
            log.event("campaign_world_stage_rejected", recoveryDiagnostic);
            lastRecoveryDiagnostic = stage === "world_frame"
              ? recoveryDiagnostic
              : null;
            if (attempt === MAX_STAGE_ATTEMPTS) break;
          }
        }

        const finalTrace = [...attemptTraces].reverse().find(Boolean) ?? null;
        const failedEvidence = createCampaignWorldStageEvidence(
          stage,
          finalTrace,
          getSafeGenerateObjectErrorCode(lastError) ?? "model_contract_failed",
          true,
          capability.primaryStrategy,
          attemptTraces.length,
          attemptTraces,
        );
        throw new CampaignWorldBuilderError(
          "model_contract_failed",
          stage,
          [...evidence, failedEvidence],
          `Campaign World stage ${stage} failed its model contract.`,
          { cause: lastError },
        );
      };

      const frame = capability.primaryStrategy === "tool_mode"
        ? await runStage(
          "world_frame",
          worldFrameToolPacketSchema,
          buildWorldFramePrompt(request.source, true),
          decodeWorldFrameToolPacket,
        )
        : await runStage(
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
