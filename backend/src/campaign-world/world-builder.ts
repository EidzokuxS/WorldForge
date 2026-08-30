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
  createWorldCastDetailPacketSchema,
  createWorldCastDetailBatchPacketSchema,
  worldCastSkeletonTransportPacketBaseSchema,
  createWorldCastSkeletonTransportPacketSchema,
  createWorldCastPacketSchema,
  createWorldConnectionsPacketSchema,
  createWorldConnectionsTransportPacketSchema,
  decodeWorldCastSkeletonTransportPacket,
  decodeWorldCastDetailBatchPacket,
  worldFramePacketSchema,
  type WorldCastDetailPacket,
  type WorldCastPacket,
  type WorldCastSkeletonPacket,
  type WorldCastSkeletonTransportPacket,
  type WorldConnectionsPacket,
  type WorldConnectionsTransportPacket,
  type WorldFramePacket,
} from "./contracts.js";
import {
  buildWorldCastDetailBatchPrompt,
  buildWorldCastSkeletonPrompt,
  buildWorldConnectionsTransportPrompt,
  buildWorldFrameAndCastSkeletonPrompt,
  buildWorldFramePrompt,
} from "./world-prompts.js";
import { calculateCampaignWorldContentHash } from "./world-snapshot.js";
import {
  CampaignWorldValidationError,
  validateCampaignWorldDraft,
  type CampaignWorldDraft,
} from "./world-validator.js";
import type { CampaignWorldSource } from "@worldforge/shared";
import { normalizeCampaignIdentityName } from "@worldforge/shared";
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
  // Provider transport accepts headroom for valid prose. The prompt still
  // targets <=300 characters so normal output remains compact.
  worldSummary: z.string().min(1).max(400),
  startingMacroIndex: z.number().int().min(0).max(2),
  macroLocations: z.array(z.object({
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(220),
    tags: z.array(z.string().min(1).max(48)).min(2).max(4),
  }).strict()).length(3),
  persistentLocations: z.array(z.object({
    name: z.string().min(1).max(80),
    // Provider transport accepts a little headroom for valid prose. The
    // prompt still targets <=220 characters so normal output remains compact.
    description: z.string().min(1).max(320),
    parentMacroIndex: z.number().int().min(0).max(2),
    tags: z.array(z.string().min(1).max(48)).min(2).max(4),
  }).strict()).length(6),
  routes: z.array(z.object({
    fromPersistentIndex: z.number().int(),
    toPersistentIndex: z.number().int(),
    travelCost: z.number().int().min(1).max(10),
  }).strict()).min(2).max(30),
}).strict();

export type WorldFrameToolPacket = z.infer<typeof worldFrameToolPacketSchema>;

/**
 * Provider-only flat packet used by tool-mode world builds. It combines the
 * indexed frame transport with the fixed-slot cast skeleton in one strict
 * provider call. Stable actor/location references are still assigned only by
 * the decoders after this packet is accepted.
 */
export const worldFrameAndCastSkeletonToolPacketSchema =
  worldFrameToolPacketSchema
    .merge(worldCastSkeletonTransportPacketBaseSchema)
    .check(({ value, issues }) => {
      const actorSlots = [
        "keyActorOne",
        "keyActorTwo",
        "startingSupport",
        "supportActor",
        "remoteBackground",
        "backgroundActor",
        "otherActorOne",
        "otherActorTwo",
      ] as const;
      const names = actorSlots.flatMap((slot) => {
        const actor = (value as Record<string, unknown>)[slot];
        if (actor === null || typeof actor !== "object") return [];
        const name = (actor as Record<string, unknown>).name;
        return typeof name === "string"
          ? [normalizeCampaignIdentityName(name)]
          : [];
      });
      const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
      if (duplicates.length > 0) {
        issues.push({
          code: "custom",
          input: value,
          path: ["actors"],
          message: "Actor names must be unique after normalization.",
        });
      }

    });

export type WorldFrameAndCastSkeletonToolPacket = z.infer<
  typeof worldFrameAndCastSkeletonToolPacketSchema
>;

// Keep a domain-oriented alias available to callers that refer to the packet
// as a world seed. Both names intentionally point at the same strict schema.
export const worldSeedToolPacketSchema = worldFrameAndCastSkeletonToolPacketSchema;
export type WorldSeedToolPacket = WorldFrameAndCastSkeletonToolPacket;

const WORLD_FRAME_RECOVERY_CHECKS = [
  "location_name",
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

type WorldSeedRecoveryCheck =
  | WorldFrameRecoveryCheck
  | WorldCastRecoveryCheck;

type WorldSeedRecoveryIssue = Readonly<{
  issueIndex: number;
  code: string;
  path: ReadonlyArray<string | number>;
  check: WorldSeedRecoveryCheck;
}>;

type WorldSeedRecoveryDiagnostic = Readonly<{
  stage: CampaignWorldModelStage;
  attempt: number;
  issueCount: number;
  issues: ReadonlyArray<WorldSeedRecoveryIssue>;
  provider: string | null;
  model: string | null;
  strategy: string | null;
}>;

const WORLD_CAST_RECOVERY_CHECKS = [
  "actor_object_keys",
  "actor_field",
  "actor_contract",
  "actor_player_identity",
  "actor_count",
  "goal_object_keys",
  "goal_field",
  "goal_actor_ref",
  "goal_contract",
  "goal_count",
  "placement_object_keys",
  "placement_field",
  "placement_actor_ref",
  "placement_location_ref",
  "placement_contract",
  "placement_count",
  "unknown_contract_issue",
] as const;

type WorldCastRecoveryCheck = typeof WORLD_CAST_RECOVERY_CHECKS[number];

type WorldCastRecoveryIssue = Readonly<{
  issueIndex: number;
  code: string;
  path: ReadonlyArray<string | number>;
  check: WorldCastRecoveryCheck;
}>;

type WorldCastRecoveryDiagnostic = Readonly<{
  stage: CampaignWorldModelStage;
  attempt: number;
  issueCount: number;
  issues: ReadonlyArray<WorldCastRecoveryIssue>;
  provider: string | null;
  model: string | null;
  strategy: string | null;
}>;

const WORLD_CONNECTIONS_RECOVERY_CHECKS = [
  "relation_slot_index",
  "relation_target_actor_index",
  "relation_type",
  "relation_count",
  "relation_self",
  "relation_duplicate",
  "relation_participation",
  "pressure_actor_indices",
  "pressure_location_indices",
  "pressure_anchor_set",
  "pressure_support_scene",
  "pressure_count",
  "relation_text_or_value_shape",
  "pressure_text_or_value_shape",
  "unknown_contract_issue",
] as const;

type WorldConnectionsRecoveryCheck = typeof WORLD_CONNECTIONS_RECOVERY_CHECKS[number];

type WorldConnectionsRecoveryIssue = Readonly<{
  issueIndex: number;
  code: string;
  path: ReadonlyArray<string | number>;
  check: WorldConnectionsRecoveryCheck;
}>;

type WorldConnectionsRecoveryDiagnostic = Readonly<{
  stage: CampaignWorldModelStage;
  attempt: number;
  issueCount: number;
  issues: ReadonlyArray<WorldConnectionsRecoveryIssue>;
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

const SAFE_CAST_SCHEMA_PATH_NAMES = new Set([
  "actors",
  "actorIndex",
  "additionalGoals",
  "presentLocationIndex",
  "homeLocationIndex",
  "keyActorOne",
  "keyActorTwo",
  "startingSupport",
  "supportActor",
  "remoteBackground",
  "backgroundActor",
  "otherActorOne",
  "otherActorTwo",
  "goals",
  "placements",
  "actorRef",
  "kind",
  "controller",
  "role",
  "name",
  "summary",
  "traits",
  "tags",
  "objective",
  "motivation",
  "horizon",
  "priority",
  "status",
  "locationRef",
  "placementKind",
]);

const WORLD_CAST_SKELETON_SLOT_NAMES = new Set([
  "keyActorOne",
  "keyActorTwo",
  "startingSupport",
  "supportActor",
  "remoteBackground",
  "backgroundActor",
  "otherActorOne",
  "otherActorTwo",
]);

const SAFE_CONNECTIONS_SCHEMA_PATH_NAMES = new Set([
  "relations",
  "pressures",
  "relationSlotIndex",
  "targetActorIndex",
  "actorIndices",
  "locationIndices",
  "relationType",
  "intensity",
  "name",
  "description",
  "trajectory",
  "urgency",
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

function sanitizeWorldCastSchemaPath(path: unknown): ReadonlyArray<string | number> {
  const segments = Array.isArray(path) ? path : [];
  return Object.freeze(segments.slice(0, MAX_RECOVERY_PATH_SEGMENTS).map((segment) => {
    if (
      typeof segment === "number" &&
      Number.isSafeInteger(segment) &&
      segment >= 0
    ) {
      return segment;
    }
    if (typeof segment === "string" && SAFE_CAST_SCHEMA_PATH_NAMES.has(segment)) {
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

function sanitizeWorldConnectionsSchemaPath(path: unknown): ReadonlyArray<string | number> {
  const segments = Array.isArray(path) ? path : [];
  return Object.freeze(segments.slice(0, MAX_RECOVERY_PATH_SEGMENTS).map((segment) => {
    if (
      typeof segment === "number" &&
      Number.isSafeInteger(segment) &&
      segment >= 0
    ) {
      return segment;
    }
    if (typeof segment === "string" && SAFE_CONNECTIONS_SCHEMA_PATH_NAMES.has(segment)) {
      return segment;
    }
    return "[dynamic]";
  }));
}

function createWorldConnectionsRecoveryIssue(
  issueIndex: number,
  code: unknown,
  path: unknown,
  check: WorldConnectionsRecoveryCheck,
): WorldConnectionsRecoveryIssue {
  return Object.freeze({
    issueIndex: Number.isSafeInteger(issueIndex) && issueIndex >= 0
      ? issueIndex
      : 0,
    code: sanitizeWorldFrameIssueCode(code),
    path: sanitizeWorldConnectionsSchemaPath(path),
    check,
  });
}

function directWorldConnectionsIssueCheck(
  path: readonly (string | number)[],
  code: string,
  rootIssueCount = 0,
  rootIssueIndex = 0,
): WorldConnectionsRecoveryCheck {
  const last = path[path.length - 1];
  const relationFieldPath =
    path[0] === "relations" &&
    typeof path[1] === "number" &&
    path.length === 3;
  if (relationFieldPath && last === "relationSlotIndex") return "relation_slot_index";
  if (relationFieldPath && last === "targetActorIndex") return "relation_target_actor_index";
  if (relationFieldPath && last === "relationType") return "relation_type";
  const pressureReferencePath =
    path[0] === "pressures" &&
    typeof path[1] === "number" &&
    (path.length === 3 || (path.length === 4 && typeof path[3] === "number"));
  if (
    pressureReferencePath &&
    (last === "actorIndices" || path[2] === "actorIndices")
  ) {
    return "pressure_actor_indices";
  }
  if (
    pressureReferencePath &&
    (last === "locationIndices" || path[2] === "locationIndices")
  ) {
    return "pressure_location_indices";
  }
  if (path[0] === "relations" && last === "intensity") {
    return "relation_text_or_value_shape";
  }
  if (path[0] === "pressures" && (last === "name" || last === "description" || last === "trajectory" || last === "urgency")) {
    return "pressure_text_or_value_shape";
  }
  if (path[0] === "relations" && (code === "too_small" || code === "too_big")) {
    return "relation_count";
  }
  if (path[0] === "pressures" && (code === "too_small" || code === "too_big")) {
    return "pressure_count";
  }
  if (path[0] === "relations" && typeof path[1] === "number" && code === "custom") {
    return "relation_self";
  }
  if (path[0] === "relations" && code === "custom") {
    if (rootIssueCount > 1 && rootIssueIndex === 0) return "relation_duplicate";
    if (rootIssueCount > 1 && rootIssueIndex === 1) return "relation_participation";
    return "unknown_contract_issue";
  }
  if (path[0] === "pressures" && code === "custom") {
    if (rootIssueCount > 1 && rootIssueIndex === 0) return "pressure_anchor_set";
    if (rootIssueCount > 1 && rootIssueIndex === 1) return "pressure_support_scene";
    return "unknown_contract_issue";
  }
  return "unknown_contract_issue";
}

function safeIssuesFromConnectionsZodError(
  error: z.ZodError,
): { issueCount: number; issues: readonly WorldConnectionsRecoveryIssue[] } {
  const issues = error.issues.slice(0, MAX_RECOVERY_ISSUES).map((issue, index) => {
    const code = sanitizeWorldFrameIssueCode(issue.code);
    const path = sanitizeWorldConnectionsSchemaPath(issue.path);
    const rootRelationIssues = error.issues.filter((candidate) =>
      candidate.code === "custom" && candidate.path.length === 1 && candidate.path[0] === "relations"
    );
    const rootPressureIssues = error.issues.filter((candidate) =>
      candidate.code === "custom" && candidate.path.length === 1 && candidate.path[0] === "pressures"
    );
    const relationIssueIndex = path[0] === "relations" && code === "custom"
      ? rootRelationIssues.findIndex((candidate) => candidate === issue)
      : 0;
    const pressureIssueIndex = path[0] === "pressures" && code === "custom"
      ? rootPressureIssues.findIndex((candidate) => candidate === issue)
      : 0;
    return createWorldConnectionsRecoveryIssue(
      index,
      code,
      path,
      directWorldConnectionsIssueCheck(
        path,
        code,
        path[0] === "relations" && code === "custom" ? rootRelationIssues.length :
          path[0] === "pressures" && code === "custom" ? rootPressureIssues.length : 0,
        path[0] === "relations" && code === "custom" ? Math.max(relationIssueIndex, 0) :
          path[0] === "pressures" && code === "custom" ? Math.max(pressureIssueIndex, 0) : 0,
      ),
    );
  });
  return {
    issueCount: Math.max(error.issues.length, issues.length, 1),
    issues: issues.length > 0
      ? Object.freeze(issues)
      : Object.freeze([
        createWorldConnectionsRecoveryIssue(0, "unknown", [], "unknown_contract_issue"),
      ]),
  };
}

function safeIssuesFromConnectionsProviderDiagnostics(
  diagnostics: ReturnType<typeof getSafeGenerateObjectSchemaDiagnostics>,
): { issueCount: number; issues: readonly WorldConnectionsRecoveryIssue[] } {
  if (!diagnostics) {
    return {
      issueCount: 1,
      issues: [createWorldConnectionsRecoveryIssue(0, "unknown", [], "unknown_contract_issue")],
    };
  }
  const rootRelationIssues = diagnostics.schemaIssues.filter((candidate) =>
    candidate.code === "custom" &&
    candidate.path.length === 1 &&
    candidate.path[0] === "relations"
  );
  const rootPressureIssues = diagnostics.schemaIssues.filter((candidate) =>
    candidate.code === "custom" &&
    candidate.path.length === 1 &&
    candidate.path[0] === "pressures"
  );
  const rootIssueGroupingIsComplete =
    !diagnostics.schemaIssuesTruncated &&
    diagnostics.schemaIssueCount === diagnostics.schemaIssues.length;
  const issues = diagnostics.schemaIssues.slice(0, MAX_RECOVERY_ISSUES).map((issue) => {
    const path = sanitizeWorldConnectionsSchemaPath(issue.path);
    const code = sanitizeWorldFrameIssueCode(issue.code);
    const isRootRelationIssue =
      rootIssueGroupingIsComplete &&
      code === "custom" &&
      path.length === 1 &&
      path[0] === "relations";
    const isRootPressureIssue =
      rootIssueGroupingIsComplete &&
      code === "custom" &&
      path.length === 1 &&
      path[0] === "pressures";
    const rootIssues = isRootRelationIssue
      ? rootRelationIssues
      : isRootPressureIssue
        ? rootPressureIssues
        : [];
    const rootIssueIndex = rootIssues.findIndex((candidate) => candidate === issue);
    return createWorldConnectionsRecoveryIssue(
      issue.issueIndex,
      code,
      path,
      directWorldConnectionsIssueCheck(
        path,
        code,
        rootIssues.length,
        Math.max(rootIssueIndex, 0),
      ),
    );
  });
  return {
    issueCount: Math.max(diagnostics.schemaIssueCount, issues.length, 1),
    issues: issues.length > 0
      ? Object.freeze(issues)
      : Object.freeze([
        createWorldConnectionsRecoveryIssue(0, "unknown", [], "unknown_contract_issue"),
      ]),
  };
}

function worldConnectionsRecoveryIssuesFromError(
  error: unknown,
): { issueCount: number; issues: readonly WorldConnectionsRecoveryIssue[] } {
  if (error instanceof z.ZodError) {
    return safeIssuesFromConnectionsZodError(error);
  }
  return safeIssuesFromConnectionsProviderDiagnostics(getSafeGenerateObjectSchemaDiagnostics(error));
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
  if (last === "locationKey" || last === "locationRef") return "location_name";
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
      ? "location_name"
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

function createWorldCastRecoveryIssue(
  issueIndex: number,
  code: unknown,
  path: unknown,
  check: WorldCastRecoveryCheck,
): WorldCastRecoveryIssue {
  return Object.freeze({
    issueIndex: Number.isSafeInteger(issueIndex) && issueIndex >= 0
      ? issueIndex
      : 0,
    code: sanitizeWorldFrameIssueCode(code),
    path: sanitizeWorldCastSchemaPath(path),
    check,
  });
}

function directWorldCastIssueCheck(
  path: readonly (string | number)[],
  code: string,
): WorldCastRecoveryCheck {
  const root = path[0];
  const index = path[1];
  const last = path[path.length - 1];
  const isSkeletonSlot =
    typeof root === "string" && WORLD_CAST_SKELETON_SLOT_NAMES.has(root);
  const itemPath =
    (root === "actors" || root === "goals" || root === "placements") &&
    typeof index === "number";

  if (isSkeletonSlot && code === "unrecognized_keys") {
    return "actor_object_keys";
  }
  if (isSkeletonSlot && path.length >= 2) {
    return "actor_field";
  }
  if (isSkeletonSlot) {
    return "actor_contract";
  }

  if (itemPath && path.length === 2 && code === "unrecognized_keys") {
    if (root === "actors") return "actor_object_keys";
    if (root === "goals") return "goal_object_keys";
    return "placement_object_keys";
  }
  if (root === "actors" && itemPath && path.length >= 3) {
    if (last === "name" && code === "custom") return "actor_player_identity";
    return "actor_field";
  }
  if (root === "goals" && itemPath && path.length === 3 && last === "actorRef") {
    return "goal_actor_ref";
  }
  if (root === "goals" && itemPath && path.length === 3) {
    return "goal_field";
  }
  if (root === "placements" && itemPath && path.length === 3) {
    if (last === "actorRef") return "placement_actor_ref";
    if (last === "locationRef") return "placement_location_ref";
    return "placement_field";
  }
  if (root === "actors" && (code === "too_small" || code === "too_big")) {
    return "actor_count";
  }
  if (root === "goals" && (code === "too_small" || code === "too_big")) {
    return "goal_count";
  }
  if (root === "placements" && (code === "too_small" || code === "too_big")) {
    return "placement_count";
  }
  if (root === "actors") return "actor_contract";
  if (root === "goals") return "goal_contract";
  if (root === "placements") return "placement_contract";
  return "unknown_contract_issue";
}

function safeIssuesFromCastZodError(
  error: z.ZodError,
): { issueCount: number; issues: readonly WorldCastRecoveryIssue[] } {
  const issues = error.issues.slice(0, MAX_RECOVERY_ISSUES).map((issue, index) => {
    const code = sanitizeWorldFrameIssueCode(issue.code);
    const path = sanitizeWorldCastSchemaPath(issue.path);
    return createWorldCastRecoveryIssue(
      index,
      code,
      path,
      directWorldCastIssueCheck(path, code),
    );
  });
  return {
    issueCount: Math.max(error.issues.length, issues.length, 1),
    issues: issues.length > 0
      ? Object.freeze(issues)
      : Object.freeze([
        createWorldCastRecoveryIssue(0, "unknown", [], "unknown_contract_issue"),
      ]),
  };
}

function safeIssuesFromCastProviderDiagnostics(
  diagnostics: ReturnType<typeof getSafeGenerateObjectSchemaDiagnostics>,
): { issueCount: number; issues: readonly WorldCastRecoveryIssue[] } {
  if (!diagnostics) {
    return {
      issueCount: 1,
      issues: [createWorldCastRecoveryIssue(0, "unknown", [], "unknown_contract_issue")],
    };
  }
  const issues = diagnostics.schemaIssues.slice(0, MAX_RECOVERY_ISSUES).map((issue) => {
    const path = sanitizeWorldCastSchemaPath(issue.path);
    const code = sanitizeWorldFrameIssueCode(issue.code);
    return createWorldCastRecoveryIssue(
      issue.issueIndex,
      code,
      path,
      directWorldCastIssueCheck(path, code),
    );
  });
  return {
    issueCount: Math.max(diagnostics.schemaIssueCount, issues.length, 1),
    issues: issues.length > 0
      ? Object.freeze(issues)
      : Object.freeze([
        createWorldCastRecoveryIssue(0, "unknown", [], "unknown_contract_issue"),
      ]),
  };
}

function worldCastRecoveryIssuesFromError(
  error: unknown,
): { issueCount: number; issues: readonly WorldCastRecoveryIssue[] } {
  if (error instanceof z.ZodError) {
    return safeIssuesFromCastZodError(error);
  }
  return safeIssuesFromCastProviderDiagnostics(getSafeGenerateObjectSchemaDiagnostics(error));
}

function createWorldCastRecoveryDiagnostic(
  stage: CampaignWorldModelStage,
  attempt: number,
  error: unknown,
  trace: StageTrace,
): WorldCastRecoveryDiagnostic {
  const issueData = worldCastRecoveryIssuesFromError(error);
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

function appendWorldCastRecoveryPrompt(
  basePrompt: string,
  diagnostic: WorldCastRecoveryDiagnostic,
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
    "WORLD_CAST_RECOVERY: The previous object was rejected by the local world-cast contract. Return one complete fresh object matching the original stage packet, campaign source, frame, accepted skeleton, player reservation, and provider schema. Correct every listed coordinate and recheck the whole object; the list may be non-exhaustive. For a skeleton, return exactly these eight actor slots in this order: keyActorOne, keyActorTwo, startingSupport, supportActor, remoteBackground, backgroundActor, otherActorOne, otherActorTwo. The startingSupport and remoteBackground anchor objects contain exactly name, role, summary, homeLocationIndex, and objective; the other six actor objects contain exactly name, role, summary, presentLocationIndex, homeLocationIndex, and objective. keyActorOne and keyActorTwo use role key; startingSupport and supportActor use role support; remoteBackground and backgroundActor use role background; otherActorOne and otherActorTwo use role key, support, or background. Code assigns both anchor present scenes from the accepted frame; do not emit, copy, infer, calculate, or mention a presentLocationIndex for either anchor. Before returning, recheck that every mechanically active actor has a unique full name across all eight slots after normalizing letter case and whitespace (ignore case, trim surrounding whitespace, and collapse repeated spaces); names must identify distinct people rather than repeated aliases. Use homeLocationIndex -1 for no home. For detail, preserve every assigned detailSlotIndex exactly once; return 2-4 traits and 2-4 tags with each item <=48 characters, motivation <=160 characters, and at most one actor in this batch with one additional goal whose objective and motivation are each <=140 characters. Every actor retains the required core goal from the accepted skeleton. Never emit actorIndex, actorRef, locationRef, or any free-form reference; code derives those values from accepted array slots. Do not omit a required field, add an extra key, or replace a missing value with a default. SAFE_ISSUES follows and contains only issueIndex, code, path, and check.",
    "SAFE_ISSUES",
    JSON.stringify(safeIssues),
    "END_SAFE_ISSUES",
  ].join("\n");
}

const WORLD_SEED_CAST_ROOTS = new Set([
  ...WORLD_CAST_SKELETON_SLOT_NAMES,
  "actors",
  "goals",
  "placements",
]);

function isWorldSeedCastPath(path: readonly (string | number)[]): boolean {
  return typeof path[0] === "string" && WORLD_SEED_CAST_ROOTS.has(path[0]);
}

function sanitizeWorldSeedSchemaPath(
  path: unknown,
): ReadonlyArray<string | number> {
  const segments = Array.isArray(path) ? path : [];
  return isWorldSeedCastPath(segments as (string | number)[])
    ? sanitizeWorldCastSchemaPath(path)
    : sanitizeWorldFrameSchemaPath(path);
}

function createWorldSeedRecoveryIssue(
  issueIndex: number,
  code: unknown,
  path: unknown,
  check: WorldSeedRecoveryCheck,
): WorldSeedRecoveryIssue {
  return Object.freeze({
    issueIndex: Number.isSafeInteger(issueIndex) && issueIndex >= 0
      ? issueIndex
      : 0,
    code: sanitizeWorldFrameIssueCode(code),
    path: sanitizeWorldSeedSchemaPath(path),
    check,
  });
}

function directWorldSeedIssueCheck(
  path: readonly (string | number)[],
  code: string,
): WorldSeedRecoveryCheck {
  return isWorldSeedCastPath(path)
    ? directWorldCastIssueCheck(path, code)
    : directWorldFrameIssueCheck(path, code);
}

function worldSeedRecoveryIssuesFromError(
  error: unknown,
): { issueCount: number; issues: readonly WorldSeedRecoveryIssue[] } {
  if (error instanceof WorldFrameLocalContractError) {
    const issues = error.recoveryIssues.slice(0, MAX_RECOVERY_ISSUES).map((issue) =>
      createWorldSeedRecoveryIssue(
        issue.issueIndex,
        issue.code,
        issue.path,
        issue.check,
      )
    );
    return {
      issueCount: Math.max(error.recoveryIssues.length, issues.length, 1),
      issues: issues.length > 0
        ? Object.freeze(issues)
        : Object.freeze([
          createWorldSeedRecoveryIssue(0, "unknown", [], "unknown_contract_issue"),
        ]),
    };
  }

  if (error instanceof z.ZodError) {
    const issues = error.issues.slice(0, MAX_RECOVERY_ISSUES).map((issue, index) => {
      const code = sanitizeWorldFrameIssueCode(issue.code);
      const path = sanitizeWorldSeedSchemaPath(issue.path);
      return createWorldSeedRecoveryIssue(
        index,
        code,
        path,
        directWorldSeedIssueCheck(path, code),
      );
    });
    return {
      issueCount: Math.max(error.issues.length, issues.length, 1),
      issues: issues.length > 0
        ? Object.freeze(issues)
        : Object.freeze([
          createWorldSeedRecoveryIssue(0, "unknown", [], "unknown_contract_issue"),
        ]),
    };
  }

  const diagnostics = getSafeGenerateObjectSchemaDiagnostics(error);
  if (!diagnostics) {
    return {
      issueCount: 1,
      issues: [createWorldSeedRecoveryIssue(0, "unknown", [], "unknown_contract_issue")],
    };
  }
  const issues = diagnostics.schemaIssues.slice(0, MAX_RECOVERY_ISSUES).map((issue) => {
    const path = sanitizeWorldSeedSchemaPath(issue.path);
    const code = sanitizeWorldFrameIssueCode(issue.code);
    return createWorldSeedRecoveryIssue(
      issue.issueIndex,
      code,
      path,
      directWorldSeedIssueCheck(path, code),
    );
  });
  return {
    issueCount: Math.max(diagnostics.schemaIssueCount, issues.length, 1),
    issues: issues.length > 0
      ? Object.freeze(issues)
      : Object.freeze([
        createWorldSeedRecoveryIssue(0, "unknown", [], "unknown_contract_issue"),
      ]),
  };
}

function createWorldSeedRecoveryDiagnostic(
  stage: CampaignWorldModelStage,
  attempt: number,
  error: unknown,
  trace: StageTrace,
): WorldSeedRecoveryDiagnostic {
  const issueData = worldSeedRecoveryIssuesFromError(error);
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

function appendWorldSeedRecoveryPrompt(
  basePrompt: string,
  diagnostic: WorldSeedRecoveryDiagnostic,
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
    "WORLD_FRAME_AND_CAST_RECOVERY: The previous combined world-seed object was rejected by the local frame or cast contract. Return one complete fresh flat object containing every frame transport field and exactly these eight actor slots in this order: keyActorOne, keyActorTwo, startingSupport, supportActor, remoteBackground, backgroundActor, otherActorOne, otherActorTwo. Correct every listed coordinate and recheck the frame and skeleton together; the list may be non-exhaustive. Preserve the fixed six-scene frame allocation; code derives both anchor placements from the accepted startingMacroIndex and parentMacroIndex values. keyActorOne and keyActorTwo use role key; startingSupport and supportActor use role support; remoteBackground and backgroundActor use role background; otherActorOne and otherActorTwo use role key, support, or background. The startingSupport and remoteBackground anchor objects contain exactly name, role, summary, homeLocationIndex, and objective; the other six actor objects contain exactly name, role, summary, presentLocationIndex, homeLocationIndex, and objective, with unique normalized names. Do not emit, copy, infer, calculate, or mention a presentLocationIndex for either anchor. Before returning, recheck that every mechanically active actor has a unique full name across all eight slots after normalizing letter case and whitespace (ignore case, trim surrounding whitespace, and collapse repeated spaces); names must identify distinct people rather than repeated aliases. Preserve the player identity reservation, return no stable actor/location references or extra keys, and keep named or unnamed incidental people and exchanges with no future reliance or consequence in atmosphere. SAFE_ISSUES follows and contains only issueIndex, code, path, and check.",
    "SAFE_ISSUES",
    JSON.stringify(safeIssues),
    "END_SAFE_ISSUES",
  ].join("\n");
}

function createWorldConnectionsRecoveryDiagnostic(
  stage: CampaignWorldModelStage,
  attempt: number,
  error: unknown,
  trace: StageTrace,
): WorldConnectionsRecoveryDiagnostic {
  const issueData = worldConnectionsRecoveryIssuesFromError(error);
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

function appendWorldConnectionsRecoveryPrompt(
  basePrompt: string,
  diagnostic: WorldConnectionsRecoveryDiagnostic,
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
    "WORLD_CONNECTIONS_RECOVERY: The previous object was rejected by the local world-connections contract. Return one complete fresh packet matching the original campaign source, accepted cast skeleton, bounded transport schema, and provider contract. Correct every listed coordinate and recheck the complete checklist below; SAFE_ISSUES is not the full contract.",
    "Relations: return exactly one row for every fixed relationSlotIndex in RELATION_SLOTS, exactly once; each row contains only relationSlotIndex, targetActorIndex, relationType, and intensity. relationType must be exactly one of alliance, rivalry, authority, dependency, kinship, association, hostility. targetActorIndex must be a direct integer from ALLOWED_ACTOR_INDICES and must differ from relationSlotIndex. intensity is an integer from 1 through 5.",
    "Pressures: return exactly 3 or 4 rows; each row contains only name, description, trajectory, urgency, actorIndices, and locationIndices. name is at most 64 characters; description is one sentence at most 160 characters; trajectory is one sentence at most 120 characters; urgency is an integer from 1 through 5. actorIndices must be non-empty in-range integers from the accepted skeleton with no duplicates, and locationIndices must be non-empty in-range integers from persistent location slots with no duplicates; use at least two different combined actor/location anchor sets. At least one pressure must contain a persistent location index from STARTING_MACRO_SCENE_INDICES and a support actor whose presentLocationIndex is included in that same pressure's locationIndices.",
    "Use no actorRef, locationRef, or free-form references; code derives stable references and relation summaries from accepted indices and relationType. Do not return summary, rationale, actor names, or other relation prose. Do not omit required rows or pressures, add extra keys, or replace missing values with defaults.",
    "SAFE_ISSUES follows and contains only issueIndex, code, path, and check.",
    "SAFE_ISSUES",
    JSON.stringify(safeIssues),
    "END_SAFE_ISSUES",
  ].join("\n");
}

function structuralLocationReferenceAtIndex(
  locations: readonly unknown[],
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
  if (!locations[index]) {
    throw new WorldFrameLocalContractError([
      createWorldFrameRecoveryIssue(
        0,
        "index_missing",
        path,
        path[0] === "persistentLocations" ? "parent_index" : "route_index",
      ),
    ]);
  }
  const prefix = path[0] === "persistentLocations" ? "macro" : "scene";
  return `location:${prefix}-${index + 1}`;
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

  const locationNames = [
    ...transport.macroLocations.map((location) => location.name),
    ...transport.persistentLocations.map((location) => location.name),
  ];
  const duplicateNames = locationNames.filter((name, index) =>
    locationNames.indexOf(name) !== index
  );
  if (duplicateNames.length > 0) {
    throw new WorldFrameLocalContractError([
      createWorldFrameRecoveryIssue(
        0,
        "custom",
        ["locations"],
        "location_name",
      ),
    ]);
  }

  const locations = [
    ...transport.macroLocations.map((location, index) => ({
      locationRef: `location:macro-${index + 1}`,
      name: location.name,
      description: location.description,
      kind: "macro" as const,
      parentLocationRef: null,
      tags: [...location.tags],
      isStarting: index === transport.startingMacroIndex,
    })),
    ...transport.persistentLocations.map((location, index) => ({
      locationRef: `location:scene-${index + 1}`,
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

/**
 * Decode the single tool-mode world seed packet. The frame is decoded first,
 * then the fixed-slot skeleton is checked against that exact accepted frame via
 * the existing frame-aware skeleton schema and decoder. This keeps stable
 * references and player-identity reservation outside provider output.
 */
export function decodeWorldFrameAndCastSkeletonToolPacket(
  input: unknown,
  playerIdentity?: CampaignWorldBuildRequest["source"]["playerIdentity"],
): { frame: WorldFramePacket; skeleton: WorldCastSkeletonPacket } {
  const transport = worldFrameAndCastSkeletonToolPacketSchema.parse(input);
  const frame = decodeWorldFrameToolPacket({
    worldSummary: transport.worldSummary,
    startingMacroIndex: transport.startingMacroIndex,
    macroLocations: transport.macroLocations,
    persistentLocations: transport.persistentLocations,
    routes: transport.routes,
  });
  const skeletonTransport: WorldCastSkeletonTransportPacket = {
    keyActorOne: transport.keyActorOne,
    keyActorTwo: transport.keyActorTwo,
    startingSupport: transport.startingSupport,
    supportActor: transport.supportActor,
    remoteBackground: transport.remoteBackground,
    backgroundActor: transport.backgroundActor,
    otherActorOne: transport.otherActorOne,
    otherActorTwo: transport.otherActorTwo,
  };
  // The flat provider schema supplies fixed-slot shape only. Rebuild the
  // frame-aware transport schema before decoding so role, anchor, and direct
  // location-index invariants are checked against this packet's frame.
  const frameAwareSkeletonTransport = createWorldCastSkeletonTransportPacketSchema(frame)
    .parse(skeletonTransport);
  const skeleton = decodeWorldCastSkeletonTransportPacket(
    frame,
    frameAwareSkeletonTransport,
    playerIdentity,
  );
  return { frame, skeleton };
}

export const decodeWorldSeedToolPacket = decodeWorldFrameAndCastSkeletonToolPacket;
export const decodeWorldFrameCastSkeletonToolPacket =
  decodeWorldFrameAndCastSkeletonToolPacket;

export function actorReferenceForIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError("Actor index must be a non-negative integer.");
  }
  return `actor:slot-${index + 1}`;
}

export function persistentLocationReferenceForIndex(
  frame: Pick<WorldFramePacket, "locations">,
  index: number,
): string {
  const persistentLocations = frame.locations.filter((location) =>
    location.kind === "persistent_sublocation"
  );
  if (!Number.isInteger(index) || index < 0 || index >= persistentLocations.length) {
    throw new RangeError("Persistent location index is outside the frame slots.");
  }
  return persistentLocations[index]!.locationRef;
}

export function composeWorldCastPacketFromTransport(
  frame: WorldFramePacket,
  skeleton: WorldCastSkeletonPacket,
  detail: WorldCastDetailPacket,
  playerIdentity?: CampaignWorldBuildRequest["source"]["playerIdentity"],
): WorldCastPacket {
  const acceptedDetail = createWorldCastDetailPacketSchema(skeleton).parse(detail);
  const detailByActorIndex = new Map(
    acceptedDetail.actors.map((actor) => [actor.actorIndex, actor]),
  );
  const actors = skeleton.actors.map((actor, index) => ({
    actorRef: actorReferenceForIndex(index),
    kind: "person" as const,
    controller: "agent" as const,
    role: actor.role,
    name: actor.name,
    summary: actor.summary,
    traits: [...detailByActorIndex.get(index)!.traits],
    tags: [...detailByActorIndex.get(index)!.tags],
  }));
  const goals = skeleton.actors.flatMap((actor, index) => {
    const actorRef = actorReferenceForIndex(index);
    const coreGoal = {
      actorRef,
      objective: actor.objective,
      motivation: detailByActorIndex.get(index)!.motivation,
      horizon: detailByActorIndex.get(index)!.horizon,
      priority: detailByActorIndex.get(index)!.priority,
      status: "active" as const,
    };
    const detailGoals = detailByActorIndex.get(index)!.additionalGoals.map((goal) => ({
      actorRef,
      objective: goal.objective,
      motivation: goal.motivation,
      horizon: goal.horizon,
      priority: goal.priority,
      status: "active" as const,
    }));
    return [coreGoal, ...detailGoals];
  });
  const placements = skeleton.actors.flatMap((actor, index) => {
    const actorRef = actorReferenceForIndex(index);
    const present = {
      actorRef,
      locationRef: persistentLocationReferenceForIndex(
        frame,
        actor.presentLocationIndex,
      ),
      placementKind: "present" as const,
    };
    if (actor.homeLocationIndex === null) return [present];
    return [
      present,
      {
        actorRef,
        locationRef: persistentLocationReferenceForIndex(
          frame,
          actor.homeLocationIndex,
        ),
        placementKind: "home" as const,
      },
    ];
  });
  return createWorldCastPacketSchema(frame, playerIdentity).parse({
    actors,
    goals,
    placements,
  });
}

function canonicalRelationSummary(
  sourceActorName: string,
  targetActorName: string,
  relationType: WorldConnectionsPacket["relations"][number]["relationType"],
): string {
  switch (relationType) {
    case "alliance":
      return `${sourceActorName} and ${targetActorName} work as allies.`;
    case "rivalry":
      return `${sourceActorName} and ${targetActorName} are active rivals.`;
    case "authority":
      return `${sourceActorName} answers to ${targetActorName}'s authority.`;
    case "dependency":
      return `${sourceActorName} depends on ${targetActorName}.`;
    case "kinship":
      return `${sourceActorName} and ${targetActorName} are kin.`;
    case "association":
      return `${sourceActorName} is associated with ${targetActorName}.`;
    case "hostility":
      return `${sourceActorName} is hostile toward ${targetActorName}.`;
    default:
      throw new Error(`Unsupported relation type: ${String(relationType)}`);
  }
}

export function composeWorldConnectionsPacketFromTransport(
  frame: WorldFramePacket,
  skeleton: Pick<WorldCastSkeletonPacket, "actors"> | Pick<WorldCastPacket, "actors">,
  input: WorldConnectionsTransportPacket,
): WorldConnectionsPacket {
  const relations = input.relations.map((relation) => {
    const sourceActorIndex = relation.relationSlotIndex;
    const targetActorIndex = relation.targetActorIndex;
    return {
      sourceActorRef: actorReferenceForIndex(sourceActorIndex),
      targetActorRef: actorReferenceForIndex(targetActorIndex),
      relationType: relation.relationType,
      summary: canonicalRelationSummary(
        skeleton.actors[sourceActorIndex]!.name,
        skeleton.actors[targetActorIndex]!.name,
        relation.relationType,
      ),
      intensity: relation.intensity,
    };
  });
  const pressures = input.pressures.map((pressure) => ({
    name: pressure.name,
    description: pressure.description,
    trajectory: pressure.trajectory,
    urgency: pressure.urgency,
    actorRefs: pressure.actorIndices.map((index) => actorReferenceForIndex(index)),
    locationRefs: pressure.locationIndices.map((index) =>
      persistentLocationReferenceForIndex(frame, index)
    ),
  }));
  return {
    relations,
    pressures,
  };
}

export function decodeWorldConnectionsTransportPacket(
  frame: WorldFramePacket,
  cast: WorldCastPacket,
  input: WorldConnectionsTransportPacket,
): WorldConnectionsPacket {
  const raw = composeWorldConnectionsPacketFromTransport(frame, cast, input);
  return createWorldConnectionsPacketSchema(frame, cast).parse(raw);
}

export function splitWorldCastDetailActorIndices(
  actorCount: number,
): readonly [readonly number[], readonly number[]] {
  if (!Number.isInteger(actorCount) || actorCount < 6 || actorCount > 16) {
    throw new RangeError("Cast detail batching requires 6 through 16 skeleton actors.");
  }
  const actorIndices = Array.from({ length: actorCount }, (_, actorIndex) => actorIndex);
  return [
    actorIndices.filter((actorIndex) => actorIndex % 2 === 0),
    actorIndices.filter((actorIndex) => actorIndex % 2 === 1),
  ];
}

const MAX_STAGE_ATTEMPTS = 3;
export const CAMPAIGN_WORLD_STAGE_BUDGET_MS = 70_000;
export const CAMPAIGN_WORLD_BUILD_BUDGET_MS = 210_000;

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

class CampaignWorldStageFailure extends Error {
  constructor(
    readonly stage: CampaignWorldModelStage,
    readonly stageEvidence: CampaignWorldStageEvidence[],
    readonly traces: readonly StageTrace[],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignWorldStageFailure";
  }
}

class CampaignWorldSiblingAbortError extends Error {
  constructor(readonly failedStage: CampaignWorldModelStage) {
    super(`Campaign World sibling stage ${failedStage} failed.`);
    this.name = "CampaignWorldSiblingAbortError";
  }
}

export class CampaignWorldStageTimeoutError extends Error {
  constructor(readonly stage: CampaignWorldModelStage) {
    super(`Campaign World stage ${stage} exceeded its local timeout.`);
    this.name = "CampaignWorldStageTimeoutError";
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
  abortSignal?: AbortSignal;
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

function createAggregatedCampaignWorldStageEvidence(
  stage: CampaignWorldModelStage,
  traceGroups: readonly (readonly StageTrace[])[],
  errorCode: SafeGenerateErrorCode | "model_contract_failed" | null,
  failed: boolean,
  expectedPrimaryStrategy: string | null = null,
): CampaignWorldStageEvidence {
  const traces = traceGroups.flat();
  const representativeTrace = [...traces].reverse().find(Boolean) ?? null;
  const primaryStrategy =
    representativeTrace?.primaryStrategy ??
    representativeTrace?.capability?.primaryStrategy ??
    expectedPrimaryStrategy;
  const traceStrategy = representativeTrace?.strategy ?? null;
  return {
    stage,
    requestedMode:
      representativeTrace?.requestedMode ?? representativeTrace?.capability?.requestedMode ?? "auto",
    primaryStrategy,
    actualStrategy: failed && traceStrategy === "full_retry"
      ? primaryStrategy
      : traceStrategy ?? representativeTrace?.capability?.actualMode ?? primaryStrategy,
    totalAttempts: traces.length,
    repairUsed: traces.some((attemptTrace) =>
      attemptTrace?.strategy === "repair" ||
      attemptTrace?.repair !== undefined ||
      attemptTrace?.repairedFromStrategy !== undefined,
    ),
    // A stage can contain multiple independent model calls. Retry evidence is
    // true only when one of those calls itself used a second transport attempt.
    retryUsed: traceGroups.some((group) => group.length > 1),
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

function assertSuccessfulEvidence(
  evidence: CampaignWorldStageEvidence,
  retryExpected = evidence.totalAttempts > 1,
  maxAttempts = MAX_STAGE_ATTEMPTS,
): void {
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
    evidence.totalAttempts > maxAttempts ||
    evidence.repairUsed ||
    evidence.retryUsed !== retryExpected ||
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

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new DOMException("Campaign World build was aborted.", "AbortError");
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
      const buildDeadlineAt = Date.now() + CAMPAIGN_WORLD_BUILD_BUDGET_MS;
      throwIfAborted(request.abortSignal);
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
      const runStageCall = async <Generated, Accepted = Generated>(
        stage: CampaignWorldModelStage,
        schema: ZodType<Generated>,
        prompt: string,
        decode: (value: Generated) => Accepted = ((value) => value as unknown as Accepted),
        stageDeadlineAt: number,
        abortSignal = request.abortSignal,
        recoveryMode: "frame" | "seed" | "cast" | "connections" =
          stage === "world_frame" ? "frame" : stage === "world_cast" ? "cast" : "connections",
      ): Promise<{ accepted: Accepted; traces: readonly StageTrace[] }> => {
        throwIfAborted(abortSignal);
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
          timeout: { totalMs: CAMPAIGN_WORLD_STAGE_BUDGET_MS },
        };
        let lastError: unknown = null;
        let terminalError: unknown = null;
        let lastWorldFrameRecoveryDiagnostic: WorldFrameRecoveryDiagnostic | null = null;
        let lastWorldSeedRecoveryDiagnostic: WorldSeedRecoveryDiagnostic | null = null;
        let lastWorldCastRecoveryDiagnostic: WorldCastRecoveryDiagnostic | null = null;
        let lastWorldConnectionsRecoveryDiagnostic: WorldConnectionsRecoveryDiagnostic | null = null;

        for (let attempt = 1; attempt <= MAX_STAGE_ATTEMPTS; attempt += 1) {
          throwIfAborted(abortSignal);
          const remainingMs = Math.max(0, stageDeadlineAt - Date.now());
          if (remainingMs <= 0) {
            const stageTimeoutError = new CampaignWorldStageTimeoutError(stage);
            lastError = stageTimeoutError;
            terminalError = stageTimeoutError;
            break;
          }
          const attemptTimeoutMs = Math.min(CAMPAIGN_WORLD_STAGE_BUDGET_MS, remainingMs);
          const attemptAbortController = new AbortController();
          let parentAbortHandler: (() => void) | null = null;
          let rejectParentAbort!: (reason?: unknown) => void;
          let rejectStageTimeout!: (reason?: unknown) => void;
          const parentAbortPromise = new Promise<never>((_, reject) => {
            rejectParentAbort = reject;
          });
          const stageTimeoutPromise = new Promise<never>((_, reject) => {
            rejectStageTimeout = reject;
          });
          const stageTimeoutError = new CampaignWorldStageTimeoutError(stage);
          const stageTimeoutHandle = setTimeout(() => {
            if (attemptAbortController.signal.aborted) return;
            attemptAbortController.abort(stageTimeoutError);
            rejectStageTimeout(stageTimeoutError);
          }, attemptTimeoutMs);
          if (abortSignal) {
            parentAbortHandler = () => {
              const reason = abortSignal.reason;
              if (!attemptAbortController.signal.aborted) {
                attemptAbortController.abort(reason);
              }
              rejectParentAbort(reason);
            };
            if (abortSignal.aborted) {
              parentAbortHandler();
            } else {
              abortSignal.addEventListener("abort", parentAbortHandler, { once: true });
            }
          }
          let result: Awaited<ReturnType<typeof safeGenerateObject<Generated>>> | null = null;
          const recoveryPrompt: string | null = recoveryMode === "seed" && lastWorldSeedRecoveryDiagnostic !== null
            ? appendWorldSeedRecoveryPrompt(prompt, lastWorldSeedRecoveryDiagnostic)
            : recoveryMode === "frame" && lastWorldFrameRecoveryDiagnostic !== null
              ? appendWorldFrameRecoveryPrompt(prompt, lastWorldFrameRecoveryDiagnostic)
              : recoveryMode === "cast" && lastWorldCastRecoveryDiagnostic !== null
              ? appendWorldCastRecoveryPrompt(prompt, lastWorldCastRecoveryDiagnostic)
              : recoveryMode === "connections" && lastWorldConnectionsRecoveryDiagnostic !== null
                ? appendWorldConnectionsRecoveryPrompt(prompt, lastWorldConnectionsRecoveryDiagnostic)
                : null;
          const generationOptions = {
            ...(recoveryPrompt === null
              ? baseGenerationOptions
              : { ...baseGenerationOptions, prompt: recoveryPrompt }),
            timeout: { totalMs: attemptTimeoutMs },
          };
          try {
            result = await Promise.race([
              dependencies.generateObject({
                ...generationOptions,
                abortSignal: attemptAbortController.signal,
              }),
              parentAbortPromise,
              stageTimeoutPromise,
            ]);
            throwIfAborted(attemptAbortController.signal);
            throwIfAborted(abortSignal);
            attemptTraces.push(result.trace);
            const accepted = decode(result.object);
            throwIfAborted(attemptAbortController.signal);
            throwIfAborted(abortSignal);
            const attemptEvidence = createCampaignWorldStageEvidence(
              stage,
              result.trace,
              null,
              false,
              capability.primaryStrategy,
              attempt,
              attemptTraces,
            );
            assertSuccessfulEvidence(attemptEvidence);
            return { accepted, traces: Object.freeze([...attemptTraces]) };
          } catch (error) {
            if (abortSignal?.aborted) throwIfAborted(abortSignal);
            if (attemptAbortController.signal.reason instanceof CampaignWorldStageTimeoutError) {
              lastError = stageTimeoutError;
              terminalError = stageTimeoutError;
              const failedTrace: StageTrace = result?.trace ?? getSafeGenerateObjectTrace(error);
              if (result === null) attemptTraces.push(failedTrace);
              if (recoveryMode === "seed") {
                log.event("campaign_world_stage_rejected", createWorldSeedRecoveryDiagnostic(
                  stage,
                  attempt,
                  stageTimeoutError,
                  failedTrace,
                ));
              } else if (recoveryMode === "frame") {
                log.event("campaign_world_stage_rejected", createWorldFrameRecoveryDiagnostic(
                  stage,
                  attempt,
                  stageTimeoutError,
                  failedTrace,
                ));
              } else if (recoveryMode === "cast") {
                log.event("campaign_world_stage_rejected", createWorldCastRecoveryDiagnostic(
                  stage,
                  attempt,
                  stageTimeoutError,
                  failedTrace,
                ));
              } else {
                log.event("campaign_world_stage_rejected", createWorldConnectionsRecoveryDiagnostic(
                  stage,
                  attempt,
                  stageTimeoutError,
                  failedTrace,
                ));
              }
              break;
            }
            if (attemptAbortController.signal.aborted) {
              throwIfAborted(attemptAbortController.signal);
            }
            lastError = error;
            const failedTrace: StageTrace = result?.trace ?? getSafeGenerateObjectTrace(error);
            if (result === null) attemptTraces.push(failedTrace);
            if (recoveryMode === "seed") {
              const diagnostic = createWorldSeedRecoveryDiagnostic(stage, attempt, error, failedTrace);
              log.event("campaign_world_stage_rejected", diagnostic);
              lastWorldSeedRecoveryDiagnostic = diagnostic;
            } else if (recoveryMode === "frame") {
              const diagnostic = createWorldFrameRecoveryDiagnostic(stage, attempt, error, failedTrace);
              log.event("campaign_world_stage_rejected", diagnostic);
              lastWorldFrameRecoveryDiagnostic = diagnostic;
            } else if (recoveryMode === "cast") {
              const diagnostic = createWorldCastRecoveryDiagnostic(stage, attempt, error, failedTrace);
              log.event("campaign_world_stage_rejected", diagnostic);
              lastWorldCastRecoveryDiagnostic = diagnostic;
            } else {
              const diagnostic = createWorldConnectionsRecoveryDiagnostic(stage, attempt, error, failedTrace);
              log.event("campaign_world_stage_rejected", diagnostic);
              lastWorldConnectionsRecoveryDiagnostic = diagnostic;
            }
            if (attempt === MAX_STAGE_ATTEMPTS) break;
          } finally {
            clearTimeout(stageTimeoutHandle);
            if (abortSignal && parentAbortHandler) {
              abortSignal.removeEventListener("abort", parentAbortHandler);
            }
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
        throw new CampaignWorldStageFailure(
          stage,
          [failedEvidence],
          Object.freeze([...attemptTraces]),
          `Campaign World stage ${stage} failed its model contract.`,
          { cause: terminalError ?? lastError },
        );
      };

      const runObservedFrame = async (): Promise<{
        frame: WorldFramePacket;
        skeleton: WorldCastSkeletonPacket | null;
        traces: readonly StageTrace[];
      }> => {
        await request.observer?.onStageStarted("world_frame");
        throwIfAborted(request.abortSignal);
        try {
          const combinedSeed = capability.primaryStrategy === "tool_mode";
          const frameDeadlineAt = Math.min(
            buildDeadlineAt - (CAMPAIGN_WORLD_STAGE_BUDGET_MS * (combinedSeed ? 1 : 2)),
            Date.now() + (CAMPAIGN_WORLD_STAGE_BUDGET_MS * (combinedSeed ? 2 : 1)),
          );
          let frame: WorldFramePacket;
          let skeleton: WorldCastSkeletonPacket | null = null;
          let traces: readonly StageTrace[];
          if (capability.primaryStrategy === "tool_mode") {
            const result = await runStageCall(
              "world_frame",
              worldFrameAndCastSkeletonToolPacketSchema,
              buildWorldFrameAndCastSkeletonPrompt(request.source),
              (value) => decodeWorldFrameAndCastSkeletonToolPacket(
                value,
                request.source.playerIdentity,
              ),
              frameDeadlineAt,
              request.abortSignal,
              "seed",
            );
            frame = result.accepted.frame;
            skeleton = result.accepted.skeleton;
            traces = result.traces;
          } else {
            const result = await runStageCall(
              "world_frame",
              worldFramePacketSchema,
              buildWorldFramePrompt(request.source),
              (value) => value,
              frameDeadlineAt,
            );
            frame = result.accepted;
            traces = result.traces;
          }
          const stageEvidence = createCampaignWorldStageEvidence(
            "world_frame",
            traces[traces.length - 1] ?? null,
            null,
            false,
            capability.primaryStrategy,
            traces.length,
            traces,
          );
          assertSuccessfulEvidence(stageEvidence);
          evidence.push(stageEvidence);
          await request.observer?.onStageCompleted(stageEvidence);
          throwIfAborted(request.abortSignal);
          return { frame, skeleton, traces };
        } catch (error) {
          if (error instanceof CampaignWorldBuilderError) throw error;
          if (error instanceof CampaignWorldStageFailure) {
            throw new CampaignWorldBuilderError(
              "model_contract_failed",
              error.stage,
              [...evidence, ...error.stageEvidence],
              error.message,
              { cause: error.cause },
            );
          }
          throw error;
        }
      };

      const observedFrame = await runObservedFrame();
      const frame = observedFrame.frame;
      throwIfAborted(request.abortSignal);

      await request.observer?.onStageStarted("world_cast");
      throwIfAborted(request.abortSignal);
      let skeletonResult: { accepted: WorldCastSkeletonPacket; traces: readonly StageTrace[] };
      if (observedFrame.skeleton !== null) {
        // Tool mode coalesces frame and skeleton into one provider call. Keep
        // an empty trace list here so world_cast evidence counts only detail
        // batches below, never an invented skeleton call.
        skeletonResult = { accepted: observedFrame.skeleton, traces: [] };
      } else {
        try {
          skeletonResult = await runStageCall(
            "world_cast",
            createWorldCastSkeletonTransportPacketSchema(frame),
            buildWorldCastSkeletonPrompt(request.source, frame),
            (value) => decodeWorldCastSkeletonTransportPacket(
              frame,
              value,
              request.source.playerIdentity,
            ),
            Math.min(
              buildDeadlineAt - CAMPAIGN_WORLD_STAGE_BUDGET_MS,
              Date.now() + CAMPAIGN_WORLD_STAGE_BUDGET_MS,
            ),
          );
        } catch (error) {
          if (error instanceof CampaignWorldStageFailure) {
            throw new CampaignWorldBuilderError(
              "model_contract_failed",
              error.stage,
              [...evidence, ...error.stageEvidence],
              error.message,
              { cause: error.cause },
            );
          }
          throw error;
        }
      }
      throwIfAborted(request.abortSignal);

      // The connections start event is durable before either dependent branch
      // launches. The model calls below intentionally share the same frame and
      // accepted skeleton but do not wait on each other.
      await request.observer?.onStageStarted("world_connections");
      throwIfAborted(request.abortSignal);
      const branchDeadlineAt = buildDeadlineAt;
      const branchAbortController = new AbortController();
      const forwardAbort = () => {
        if (!branchAbortController.signal.aborted) {
          branchAbortController.abort(request.abortSignal?.reason);
        }
      };
      request.abortSignal?.addEventListener("abort", forwardAbort, { once: true });
      const branchState: {
        failure: { stage: CampaignWorldModelStage; error: unknown } | null;
      } = { failure: null };
      let branchCompletionOrdinal = 0;
      const registerBranchFailure = (stage: CampaignWorldModelStage, error: unknown): void => {
        if (
          error instanceof CampaignWorldSiblingAbortError ||
          request.abortSignal?.aborted ||
          branchState.failure !== null
        ) return;
        branchState.failure = { stage, error };
        branchAbortController.abort(new CampaignWorldSiblingAbortError(stage));
      };

      const detailActorIndexGroups = splitWorldCastDetailActorIndices(
        skeletonResult.accepted.actors.length,
      );
      const castDetailPromise = (async () => {
        try {
          const batchResults = await Promise.all(
            detailActorIndexGroups.map((globalActorIndices) => runStageCall(
              "world_cast",
              createWorldCastDetailBatchPacketSchema(globalActorIndices.length),
              buildWorldCastDetailBatchPrompt(
                request.source,
                frame,
                skeletonResult.accepted,
                globalActorIndices,
              ),
              (value) => decodeWorldCastDetailBatchPacket(value, globalActorIndices),
              branchDeadlineAt,
              branchAbortController.signal,
            )),
          );
          if (branchState.failure !== null || branchAbortController.signal.aborted) {
            throw new CampaignWorldSiblingAbortError(branchState.failure?.stage ?? "world_connections");
          }
          const detail = createWorldCastDetailPacketSchema(skeletonResult.accepted).parse({
            actors: batchResults
              .flatMap((result) => result.accepted)
              .sort((left, right) => left.actorIndex - right.actorIndex),
          });
          const stageEvidence = createAggregatedCampaignWorldStageEvidence(
            "world_cast",
            capability.primaryStrategy === "tool_mode"
              ? batchResults.map((result) => result.traces)
              : [skeletonResult.traces, ...batchResults.map((result) => result.traces)],
            null,
            false,
            capability.primaryStrategy,
          );
          assertSuccessfulEvidence(
            stageEvidence,
            stageEvidence.retryUsed,
            MAX_STAGE_ATTEMPTS * (
              capability.primaryStrategy === "tool_mode"
                ? detailActorIndexGroups.length
                : 1 + detailActorIndexGroups.length
            ),
          );
          const completionOrdinal = ++branchCompletionOrdinal;
          return {
            packet: detail,
            stageEvidence,
            completionOrdinal,
          };
        } catch (error) {
          const failure = error instanceof CampaignWorldStageFailure
            ? new CampaignWorldStageFailure(
              "world_cast",
              [createAggregatedCampaignWorldStageEvidence(
                "world_cast",
                capability.primaryStrategy === "tool_mode"
                  ? [error.traces]
                  : [skeletonResult.traces, error.traces],
                error.stageEvidence[0]?.errorCode ?? "model_contract_failed",
                true,
                capability.primaryStrategy,
              )],
              error.traces,
              error.message,
              { cause: error.cause },
            )
            : error;
          registerBranchFailure("world_cast", failure);
          throw failure;
        }
      })();

      const connectionsPromise = (async () => {
        try {
          const result = await runStageCall(
            "world_connections",
            createWorldConnectionsTransportPacketSchema(frame, skeletonResult.accepted),
            buildWorldConnectionsTransportPrompt(request.source, frame, skeletonResult.accepted),
            (value) => value,
            branchDeadlineAt,
            branchAbortController.signal,
          );
          if (branchState.failure !== null || branchAbortController.signal.aborted) {
            throw new CampaignWorldSiblingAbortError(branchState.failure?.stage ?? "world_cast");
          }
          const stageEvidence = createAggregatedCampaignWorldStageEvidence(
            "world_connections",
            [result.traces],
            null,
            false,
            capability.primaryStrategy,
          );
          assertSuccessfulEvidence(stageEvidence, stageEvidence.retryUsed);
          const completionOrdinal = ++branchCompletionOrdinal;
          return {
            packet: result.accepted,
            stageEvidence,
            completionOrdinal,
          };
        } catch (error) {
          registerBranchFailure("world_connections", error);
          throw error;
        }
      })();

      const [castDetailSettled, connectionsSettled] = await Promise.allSettled([
        castDetailPromise,
        connectionsPromise,
      ]);
      request.abortSignal?.removeEventListener("abort", forwardAbort);
      if (branchState.failure !== null) {
        const failedStage = branchState.failure.stage;
        const failedError = branchState.failure.error;
        const failedEvidence = failedError instanceof CampaignWorldStageFailure
          ? failedError.stageEvidence
          : [];
        throw new CampaignWorldBuilderError(
          "model_contract_failed",
          failedStage,
          [...evidence, ...failedEvidence],
          failedError instanceof Error
            ? failedError.message
            : `Campaign World stage ${failedStage} failed its model contract.`,
          { cause: failedError },
        );
      }
      if (
        castDetailSettled.status !== "fulfilled" ||
        connectionsSettled.status !== "fulfilled"
      ) {
        const rejected = castDetailSettled.status === "rejected"
          ? castDetailSettled.reason
          : connectionsSettled.status === "rejected"
            ? connectionsSettled.reason
            : new Error("Campaign World branches did not settle.");
        throw rejected;
      }
      throwIfAborted(request.abortSignal);
      const completedBranches = [
        castDetailSettled.value,
        connectionsSettled.value,
      ].sort((left, right) => left.completionOrdinal - right.completionOrdinal);
      for (const branch of completedBranches) {
        evidence.push(branch.stageEvidence);
        await request.observer?.onStageCompleted(branch.stageEvidence);
      }
      const cast = composeWorldCastPacketFromTransport(
        frame,
        skeletonResult.accepted,
        castDetailSettled.value.packet,
        request.source.playerIdentity,
      );
      const connections = decodeWorldConnectionsTransportPacket(
        frame,
        cast,
        connectionsSettled.value.packet,
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
