import crypto from "node:crypto";

import type { ToolExecutionContext } from "./tool-execution-context.js";

export const BRIDGE_STATE_TOOL_NAMES = [
  "move_actor",
  "create_minor_poi",
  "create_scene_extra",
  "start_search",
  "record_player_intent",
] as const;

export type BridgeStateToolName = typeof BRIDGE_STATE_TOOL_NAMES[number];

type BridgeStateIssueCode =
  | "remote_location_ref"
  | "ambiguous_entity_ref"
  | "hidden_actor_ref"
  | "unexposed_item_ref"
  | "unsupported_action_claim";

export interface BridgeStateValidationIssue {
  code: BridgeStateIssueCode;
  path: string;
  message: string;
}

export interface PreparedMoveActorInput {
  actorRef: string;
  actorRefs: string[];
  destinationRef: string;
  targetLocationName: string;
  routeEvidenceRefs: string[];
  intentSummary: string | null;
}

export interface PreparedMinorPoiInput {
  name: string;
  description: string;
  tags: string[];
  connectedToName: "current_scene" | "current_location";
  poiType: MinorPoiType;
  areaRef: string;
  visibility: "public" | "visible";
  reason: string;
}

export interface PreparedSceneExtraInput {
  name: string;
  tags: string[];
  locationRef: "current_scene" | "current_location";
  role: SceneExtraRole;
  reason: string;
}

type PreparationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issue: BridgeStateValidationIssue };

export const MINOR_POI_TYPES = [
  "tea_stall",
  "street_vendor",
  "shrine_desk",
  "notice_board",
  "courier_desk",
] as const;

export type MinorPoiType = typeof MINOR_POI_TYPES[number];

export const SCENE_EXTRA_ROLES = [
  "service",
  "witness",
  "crowd",
  "support",
  "vendor",
  "courier",
  "clerk",
  "porter",
] as const;

export type SceneExtraRole = typeof SCENE_EXTRA_ROLES[number];

const MINOR_POI_LABELS: Record<MinorPoiType, string> = {
  tea_stall: "Tea Stall",
  street_vendor: "Street Vendor",
  shrine_desk: "Shrine Desk",
  notice_board: "Public Notice Board",
  courier_desk: "Courier Desk",
};

const SCENE_EXTRA_LABELS: Record<SceneExtraRole, string> = {
  service: "Local Attendant",
  witness: "Local Witness",
  crowd: "Nearby Onlooker",
  support: "Local Helper",
  vendor: "Local Vendor",
  courier: "Local Courier",
  clerk: "Local Clerk",
  porter: "Local Porter",
};

const DISALLOWED_MINOR_POI_PATTERNS = [
  /\bfaction\s+(?:headquarters|hq|base|command)\b/i,
  /\bsecret\s+(?:vault|base|door|room|archive|passage)\b/i,
  /\bvault\b/i,
  /\brare\s+(?:weapon|artifact|item|shop)\b/i,
  /\bweapon\s+shop\b/i,
  /\bplot[-\s]?critical\b/i,
  /\bkey\s+(?:npc|character|artifact|item|location)\b/i,
  /\bremote\b/i,
  /\boffscreen\b/i,
  /\bhidden\b/i,
  /\bforbidden\b/i,
  /\bheadquarters\b/i,
  /\blegendary\b/i,
];

const DISALLOWED_EXTRA_PATTERNS = [
  /\bkey\s+(?:npc|character|witness|ally|enemy)\b/i,
  /\bplot[-\s]?critical\b/i,
  /\bsecret\b/i,
  /\bremote\b/i,
  /\boffscreen\b/i,
  /\bfaction\s+(?:leader|head|commander|boss|agent)\b/i,
  /\bleader\b/i,
  /\bcommander\b/i,
  /\bboss\b/i,
  /\blegendary\b/i,
  /\bprominent\b/i,
];

export function isBridgeStateToolName(toolName: string): toolName is BridgeStateToolName {
  return (BRIDGE_STATE_TOOL_NAMES as readonly string[]).includes(toolName);
}

function issue(
  code: BridgeStateIssueCode,
  path: string,
  message: string,
): BridgeStateValidationIssue {
  return { code, path, message };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function readString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function uniqueStrings(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = normalize(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function hasRef(refs: ReadonlySet<string>, value: string | null | undefined): boolean {
  return Boolean(value && refs.has(normalize(value)));
}

function hasCurrentScopeRef(context: ToolExecutionContext, value: string): boolean {
  return hasRef(context.currentSceneRefs, value) || hasRef(context.currentLocationRefs, value);
}

function textMatchesAnyPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function enumValue<T extends readonly string[]>(
  values: T,
  value: string | null,
): T[number] | null {
  if (!value) return null;
  return values.includes(value as T[number]) ? value as T[number] : null;
}

function combinedText(input: Record<string, unknown>, keys: readonly string[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") parts.push(value);
    if (Array.isArray(value)) {
      parts.push(...value.filter((entry): entry is string => typeof entry === "string"));
    }
  }
  return parts.join(" ");
}

function movementRefs(candidate: {
  id: string;
  locationId: string;
  label: string;
  path?: string[];
}): string[] {
  return uniqueStrings([
    candidate.id,
    candidate.locationId,
    candidate.label,
    ...(candidate.path ?? []),
  ]);
}

function findMovementCandidate(
  context: ToolExecutionContext,
  ref: string,
) {
  const snapshot = context.bridgeLookup;
  if (!snapshot) return null;
  const normalizedRef = normalize(ref);
  return snapshot.legalMovement.find(
    (candidate) =>
      candidate.connected
      && movementRefs(candidate).some((candidateRef) => normalize(candidateRef) === normalizedRef),
  ) ?? null;
}

function legalMovementRef(context: ToolExecutionContext, ref: string | null): boolean {
  return Boolean(ref && hasRef(context.legalMovementRefs, ref));
}

export function prepareMoveActorInput(
  input: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
  pathPrefix = "input",
): PreparationResult<PreparedMoveActorInput> {
  if (!context) {
    return {
      ok: false,
      issue: issue(
        "unsupported_action_claim",
        pathPrefix,
        "move_actor requires a ToolExecutionContext with subject actor and legal movement refs.",
      ),
    };
  }

  const actorRef = readString(input, "actorRef") ?? context.subjectActorId ?? null;
  if (!actorRef || !hasRef(context.subjectActorRefs, actorRef)) {
    return {
      ok: false,
      issue: issue(
        "hidden_actor_ref",
        `${pathPrefix}.actorRef`,
        "move_actor can move only the current player/subject actor.",
      ),
    };
  }

  const destinationRef = readString(input, "destinationRef");
  if (!destinationRef) {
    return {
      ok: false,
      issue: issue("remote_location_ref", `${pathPrefix}.destinationRef`, "move_actor.destinationRef is required."),
    };
  }

  const routeId = readString(input, "routeId");
  const evidenceRefs = readStringArray(input, "evidenceRefs");
  const routeEvidenceRefs = uniqueStrings([routeId, ...evidenceRefs]);
  if (routeEvidenceRefs.length === 0) {
    return {
      ok: false,
      issue: issue(
        "remote_location_ref",
        `${pathPrefix}.evidenceRefs`,
        "move_actor requires legal route evidence from lookup/check_route results.",
      ),
    };
  }

  const evidenceHasLegalRoute = routeEvidenceRefs.some((ref) => legalMovementRef(context, ref));
  if (!legalMovementRef(context, destinationRef) && !evidenceHasLegalRoute) {
    return {
      ok: false,
      issue: issue(
        "remote_location_ref",
        `${pathPrefix}.destinationRef`,
        "move_actor destination or route evidence must reference a connected movement candidate.",
      ),
    };
  }

  const routeCandidate =
    (routeId ? findMovementCandidate(context, routeId) : null)
    ?? findMovementCandidate(context, destinationRef);
  const targetLocationName = routeCandidate?.locationId ?? destinationRef;

  return {
    ok: true,
    value: {
      actorRef,
      actorRefs: uniqueStrings([actorRef, context.subjectActorId, ...context.subjectActorRefs]),
      destinationRef,
      targetLocationName,
      routeEvidenceRefs,
      intentSummary: readString(input, "intentSummary"),
    },
  };
}

export function prepareCreateMinorPoiInput(
  input: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
  pathPrefix = "input",
): PreparationResult<PreparedMinorPoiInput> {
  if (!context) {
    return {
      ok: false,
      issue: issue(
        "remote_location_ref",
        pathPrefix,
        "create_minor_poi requires current scene/current location context.",
      ),
    };
  }

  const poiType = enumValue(MINOR_POI_TYPES, readString(input, "poiType"));
  if (!poiType) {
    return {
      ok: false,
      issue: issue(
        "unsupported_action_claim",
        `${pathPrefix}.poiType`,
        "create_minor_poi poiType must be one ordinary local low-impact type.",
      ),
    };
  }

  const areaRef = readString(input, "areaRef") ?? "current_location";
  if (!hasCurrentScopeRef(context, areaRef)) {
    return {
      ok: false,
      issue: issue(
        "remote_location_ref",
        `${pathPrefix}.areaRef`,
        "create_minor_poi areaRef must be current_scene/current_location or an exact current-scope ref.",
      ),
    };
  }

  const persistence = readString(input, "persistence") ?? "scene_local";
  if (persistence !== "scene_local" && persistence !== "ephemeral") {
    return {
      ok: false,
      issue: issue(
        "unsupported_action_claim",
        `${pathPrefix}.persistence`,
        "create_minor_poi may create only scene_local/ephemeral low-impact POIs.",
      ),
    };
  }

  const visibility = readString(input, "visibility") ?? "public";
  if (visibility !== "public" && visibility !== "visible") {
    return {
      ok: false,
      issue: issue(
        "unsupported_action_claim",
        `${pathPrefix}.visibility`,
        "create_minor_poi may create only public/visible ordinary POIs.",
      ),
    };
  }

  const safetyText = combinedText(input, ["poiType", "name", "description", "reason", "tags"]);
  if (textMatchesAnyPattern(safetyText, DISALLOWED_MINOR_POI_PATTERNS)) {
    return {
      ok: false,
      issue: issue(
        "unsupported_action_claim",
        pathPrefix,
        "create_minor_poi rejects high-impact, remote, secret, rare, faction, key, or plot-critical places.",
      ),
    };
  }

  const reason = readString(input, "reason");
  if (!reason) {
    return {
      ok: false,
      issue: issue("unsupported_action_claim", `${pathPrefix}.reason`, "create_minor_poi.reason is required."),
    };
  }

  const name = readString(input, "name") ?? MINOR_POI_LABELS[poiType];
  const description =
    readString(input, "description")
    ?? `${name} is an ordinary local ${MINOR_POI_LABELS[poiType].toLowerCase()} supported by the current scene.`;
  const connectedToName = hasRef(context.currentSceneRefs, areaRef)
    ? "current_scene"
    : "current_location";

  return {
    ok: true,
    value: {
      name,
      description,
      tags: uniqueStrings([
        ...readStringArray(input, "tags"),
        "minor-poi",
        "low-impact",
        "local",
        "public",
        `poi:${poiType}`,
      ]),
      connectedToName,
      poiType,
      areaRef,
      visibility,
      reason,
    },
  };
}

export function prepareCreateSceneExtraInput(
  input: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
  pathPrefix = "input",
): PreparationResult<PreparedSceneExtraInput> {
  if (!context) {
    return {
      ok: false,
      issue: issue(
        "remote_location_ref",
        pathPrefix,
        "create_scene_extra requires current scene/current location context.",
      ),
    };
  }

  const role = enumValue(SCENE_EXTRA_ROLES, readString(input, "role"));
  if (!role) {
    return {
      ok: false,
      issue: issue(
        "unsupported_action_claim",
        `${pathPrefix}.role`,
        "create_scene_extra role must be temporary service/witness/crowd/support.",
      ),
    };
  }

  const locationRef = readString(input, "locationRef") ?? "current_scene";
  if (locationRef !== "current_scene" && locationRef !== "current_location") {
    return {
      ok: false,
      issue: issue(
        "remote_location_ref",
        `${pathPrefix}.locationRef`,
        "create_scene_extra locationRef must be current_scene or current_location.",
      ),
    };
  }
  if (locationRef === "current_scene" && !context.currentSceneScopeId) {
    return {
      ok: false,
      issue: issue("remote_location_ref", `${pathPrefix}.locationRef`, "current_scene is unavailable."),
    };
  }
  if (locationRef === "current_location" && !context.currentLocationId) {
    return {
      ok: false,
      issue: issue("remote_location_ref", `${pathPrefix}.locationRef`, "current_location is unavailable."),
    };
  }

  const persistence = readString(input, "persistence") ?? "temporary";
  if (persistence !== "temporary") {
    return {
      ok: false,
      issue: issue(
        "unsupported_action_claim",
        `${pathPrefix}.persistence`,
        "create_scene_extra may create only temporary current-scene extras.",
      ),
    };
  }

  const safetyText = combinedText(input, ["role", "name", "reason", "tags"]);
  if (textMatchesAnyPattern(safetyText, DISALLOWED_EXTRA_PATTERNS)) {
    return {
      ok: false,
      issue: issue(
        "unsupported_action_claim",
        pathPrefix,
        "create_scene_extra rejects key, plot-critical, remote, secret, faction-leader, or persistent actors.",
      ),
    };
  }

  const reason = readString(input, "reason");
  if (!reason) {
    return {
      ok: false,
      issue: issue("unsupported_action_claim", `${pathPrefix}.reason`, "create_scene_extra.reason is required."),
    };
  }

  return {
    ok: true,
    value: {
      name: readString(input, "name") ?? SCENE_EXTRA_LABELS[role],
      tags: uniqueStrings([
        ...readStringArray(input, "tags"),
        "temporary",
        "scene-extra",
        "local",
        "support",
        `role:${role}`,
      ]),
      locationRef,
      role,
      reason,
    },
  };
}

function requireSubjectActor(
  input: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
  toolName: BridgeStateToolName,
  pathPrefix: string,
): PreparationResult<{ actorRef: string; actorRefs: string[] }> {
  if (!context) {
    return {
      ok: false,
      issue: issue(
        "hidden_actor_ref",
        pathPrefix,
        `${toolName} requires a ToolExecutionContext with the current subject actor.`,
      ),
    };
  }
  const actorRef = readString(input, "actorRef") ?? context.subjectActorId ?? null;
  if (!actorRef || !hasRef(context.subjectActorRefs, actorRef)) {
    return {
      ok: false,
      issue: issue(
        "hidden_actor_ref",
        `${pathPrefix}.actorRef`,
        `${toolName} can record only the current player/subject actor.`,
      ),
    };
  }
  return {
    ok: true,
    value: {
      actorRef,
      actorRefs: uniqueStrings([actorRef, context.subjectActorId, ...context.subjectActorRefs]),
    },
  };
}

export function buildStartSearchResult(
  input: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
): PreparationResult<Record<string, unknown>> {
  const subject = requireSubjectActor(input, context, "start_search", "input");
  if (!subject.ok) return subject;
  const query = readString(input, "query");
  if (!query) {
    return {
      ok: false,
      issue: issue("unsupported_action_claim", "input.query", "start_search.query is required."),
    };
  }

  return {
    ok: true,
    value: {
      kind: "search_started",
      searchId: crypto.randomUUID(),
      actorRef: subject.value.actorRef,
      actorRefs: subject.value.actorRefs,
      query,
      scope: readString(input, "scope") ?? "current_scene",
      method: readString(input, "method") ?? "look",
      intentSummary: readString(input, "intentSummary"),
      status: "active",
      targetTruth: "unconfirmed",
      found: false,
      discoveryCreated: false,
      proofCreated: false,
    },
  };
}

export function buildRecordPlayerIntentResult(
  input: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
): PreparationResult<Record<string, unknown>> {
  const subject = requireSubjectActor(input, context, "record_player_intent", "input");
  if (!subject.ok) return subject;
  const intentType = readString(input, "intentType");
  if (!intentType) {
    return {
      ok: false,
      issue: issue("unsupported_action_claim", "input.intentType", "record_player_intent.intentType is required."),
    };
  }

  return {
    ok: true,
    value: {
      kind: "player_intent_recorded",
      intentId: crypto.randomUUID(),
      actorRef: subject.value.actorRef,
      actorRefs: subject.value.actorRefs,
      intentType,
      targetHint: readString(input, "targetHint"),
      stance: readString(input, "stance") ?? "intends",
      summary: readString(input, "summary"),
      targetTruth: "unconfirmed",
      claimTruth: "unconfirmed",
      proofCreated: false,
      discoveryCreated: false,
    },
  };
}

export function validateBridgeStateToolGrounding(input: {
  toolName: BridgeStateToolName;
  toolInput: Record<string, unknown>;
  context: ToolExecutionContext;
  pathPrefix?: string;
}): BridgeStateValidationIssue | null {
  const path = input.pathPrefix ?? "input";
  switch (input.toolName) {
    case "move_actor": {
      const prepared = prepareMoveActorInput(input.toolInput, input.context, path);
      return prepared.ok ? null : prepared.issue;
    }
    case "create_minor_poi": {
      const prepared = prepareCreateMinorPoiInput(input.toolInput, input.context, path);
      return prepared.ok ? null : prepared.issue;
    }
    case "create_scene_extra": {
      const prepared = prepareCreateSceneExtraInput(input.toolInput, input.context, path);
      return prepared.ok ? null : prepared.issue;
    }
    case "start_search": {
      const prepared = buildStartSearchResult(input.toolInput, input.context);
      return prepared.ok ? null : prepared.issue;
    }
    case "record_player_intent": {
      const prepared = buildRecordPlayerIntentResult(input.toolInput, input.context);
      return prepared.ok ? null : prepared.issue;
    }
  }
}
