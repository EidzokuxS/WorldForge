import crypto from "node:crypto";
import {
  isBackendOnlyModelRef,
  sanitizeModelFacingText,
} from "./model-facing-ref-safety.js";

export type ToolResultStatus = "success" | "partial" | "failure";
export type ToolResultKind = "mutation" | "observation";

export type ToolResultSourceEntity = {
  type: string;
  id?: string | null;
};

export interface ToolResultAuthority {
  toolResultId: string;
  campaignId: string;
  sourceEntity: ToolResultSourceEntity;
  baseWorldVersion: number;
  resultWorldVersion?: number;
  worldTimeMinutes?: number;
  elapsedWorldTimeMinutes: number;
  stateDeltaRefs: string[];
  eventRefs: string[];
  witnesses: string[];
  knowledgeOutputs: string[];
  visibilityOutputs: string[];
  resources: string[];
  failureReason?: string;
}

export interface ToolContractFailure {
  code: string;
  path?: string;
  toolName?: string;
  terminalKind?: string;
  retryable: boolean;
  invalidRef?: string;
  refHints?: string[];
  message: string;
}

export interface ToolResultStateReceipt {
  stateReceipt: string;
  tool: string;
  target: string;
  key: string;
  value: string;
}

export interface ToolResult {
  success: boolean;
  status?: ToolResultStatus;
  kind?: ToolResultKind;
  observationOnly?: boolean;
  result?: unknown;
  error?: string;
  authority?: ToolResultAuthority;
  contractFailure?: ToolContractFailure;
  modelSafeRefs?: string[];
  stateReceipts?: ToolResultStateReceipt[];
}

export type AttachToolResultAuthorityInput = Omit<
  ToolResultAuthority,
  "toolResultId"
> & {
  toolResultId?: string;
  requireStateDelta?: boolean;
};

function uniqueStrings(values: readonly unknown[]): string[] {
  const refs = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) refs.add(trimmed);
  }
  return [...refs];
}

const BACKEND_ID_KEY_NAMES = new Set([
  "id",
  "ids",
  "actionid",
  "actionids",
  "actorid",
  "actorids",
  "campaignid",
  "eventid",
  "eventids",
  "effectid",
  "effectids",
  "factionid",
  "itemid",
  "itemids",
  "locationid",
  "locationids",
  "npcid",
  "npcids",
  "responseid",
  "responseids",
  "routeid",
  "sceneid",
  "sourceid",
  "sourceids",
  "toolresultid",
]);

const BACKEND_REF_KEY_NAMES = new Set([
  "delegatetool",
  "eventrefs",
  "localityrefs",
  "mutationrefs",
  "routeevidencerefs",
  "sourcerefs",
  "statedeltarefs",
  "subjectrefs",
  "terminalsourcerefs",
  "toolresultrefs",
  "writescopes",
]);

const BACKEND_HANDLE_KEY_RE =
  /^(?:.*(?:action|actor|authority|campaign|candidate|edge|effect|event|fact|faction|item|knowledge|location|movement|npc|response|route|scene|source|toolresult|world)(?:id|ids|ref|refs))$/u;

function normalizedModelPayloadKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function isBackendIdentifierKey(key: string): boolean {
  const normalized = normalizedModelPayloadKey(key);
  return BACKEND_ID_KEY_NAMES.has(normalized)
    || BACKEND_REF_KEY_NAMES.has(normalized)
    || BACKEND_HANDLE_KEY_RE.test(normalized);
}

function sanitizeModelVisibleToolPayload(payload: unknown): unknown {
  if (typeof payload === "string") {
    return sanitizeModelFacingText(payload);
  }
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => sanitizeModelVisibleToolPayload(entry))
      .filter((entry) => entry !== undefined);
  }
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const visible: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (isBackendIdentifierKey(key)) continue;
    const sanitized = sanitizeModelVisibleToolPayload(value);
    if (sanitized !== undefined) {
      visible[key] = sanitized;
    }
  }
  return visible;
}

function safeModelSafeRefs(refs: readonly string[] | undefined): string[] | undefined {
  const safeRefs = refs
    ?.flatMap((ref) => {
      if (isBackendOnlyModelRef(ref)) return [];
      const sanitized = sanitizeModelFacingText(ref);
      return sanitized === ref ? [sanitized] : [];
    });
  return safeRefs && safeRefs.length > 0 ? safeRefs : undefined;
}

function safeContractFailureForModel(
  failure: ToolContractFailure | undefined,
): ToolContractFailure | undefined {
  if (!failure) return undefined;
  const safeHints = safeModelSafeRefs(failure.refHints);
  return {
    ...failure,
    invalidRef: undefined,
    refHints: safeHints && safeHints.length > 0 ? safeHints : undefined,
    message: sanitizeModelFacingText(failure.message),
  };
}

export function toModelVisibleToolResult(result: ToolResult): ToolResult {
  const {
    authority: _authority,
    contractFailure,
    result: payload,
    modelSafeRefs,
    stateReceipts,
    ...visible
  } = result;
  return {
    ...visible,
    error: typeof visible.error === "string"
      ? sanitizeModelFacingText(visible.error)
      : visible.error,
    result: sanitizeModelVisibleToolPayload(payload),
    contractFailure: safeContractFailureForModel(contractFailure),
    modelSafeRefs: safeModelSafeRefs(modelSafeRefs),
    stateReceipts: sanitizeModelVisibleToolPayload(stateReceipts) as ToolResultStateReceipt[] | undefined,
  };
}

function attachModelVisibleJson(result: ToolResult): ToolResult {
  Object.defineProperty(result, "toJSON", {
    value() {
      return toModelVisibleToolResult(result);
    },
    enumerable: false,
    configurable: true,
  });
  return result;
}

export function attachModelVisibleToolResultJson(result: ToolResult): ToolResult {
  return attachModelVisibleJson(result);
}

export function inferRefsFromToolResultPayload(payload: unknown): string[] {
  const refs = new Set<string>();
  const visit = (value: unknown, keyHint = ""): void => {
    if (typeof value === "string") {
      if (/id|name|ref/i.test(keyHint) && value.trim()) {
        refs.add(value.trim());
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, keyHint));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      visit(entry, key);
    }
  };

  visit(payload);
  return [...refs].slice(0, 24);
}

export function normalizeToolResultStatus(result: ToolResult): ToolResultStatus {
  if (result.status) return result.status;
  return result.success ? "success" : "failure";
}

export function attachToolResultAuthority(
  result: ToolResult,
  authority: AttachToolResultAuthorityInput,
): ToolResult {
  const status = normalizeToolResultStatus(result);
  const stateDeltaRefs = uniqueStrings(authority.stateDeltaRefs);
  const eventRefs = uniqueStrings(authority.eventRefs);

  if (authority.requireStateDelta && result.success && stateDeltaRefs.length === 0) {
    throw new Error("Successful authoritative ToolResult requires stateDeltaRefs.");
  }

  if (!result.success && status === "success") {
    throw new Error("Failed ToolResult cannot carry success status.");
  }

  const attached: ToolResult = {
    ...result,
    status,
  };
  Object.defineProperty(attached, "authority", {
    value: {
      toolResultId: authority.toolResultId ?? crypto.randomUUID(),
      campaignId: authority.campaignId,
      sourceEntity: authority.sourceEntity,
      baseWorldVersion: authority.baseWorldVersion,
      resultWorldVersion: authority.resultWorldVersion,
      worldTimeMinutes: authority.worldTimeMinutes,
      elapsedWorldTimeMinutes: authority.elapsedWorldTimeMinutes,
      stateDeltaRefs,
      eventRefs,
      witnesses: uniqueStrings(authority.witnesses),
      knowledgeOutputs: uniqueStrings(authority.knowledgeOutputs),
      visibilityOutputs: uniqueStrings(authority.visibilityOutputs),
      resources: uniqueStrings(authority.resources),
      failureReason: authority.failureReason,
    },
    enumerable: false,
    configurable: true,
  });
  return attachModelVisibleJson(attached);
}

export function buildValidationFailureToolResult(
  error: string,
  contractFailure?: ToolContractFailure,
): ToolResult {
  return attachModelVisibleJson({
    success: false,
    status: "failure",
    error,
    contractFailure,
  });
}

export function buildPartialToolResult(result: unknown, error?: string): ToolResult {
  return attachModelVisibleJson({
    success: false,
    status: "partial",
    result,
    error,
  });
}

export function isObservationToolResult(result: ToolResult): boolean {
  return result.kind === "observation" || result.observationOnly === true;
}

export function isAuthoritativeMutationToolResult(result: ToolResult | null | undefined): result is ToolResult {
  if (!result || result.success !== true) return false;
  if (normalizeToolResultStatus(result) !== "success") return false;
  if (result.contractFailure) return false;
  if (isObservationToolResult(result)) return false;

  const authority = result.authority;
  if (!authority || authority.failureReason) return false;
  if (typeof authority.resultWorldVersion !== "number") return false;
  return Array.isArray(authority.stateDeltaRefs) && authority.stateDeltaRefs.length > 0;
}

export function buildObservationToolResult(input: {
  success?: boolean;
  result: unknown;
  error?: string;
  modelSafeRefs?: readonly string[];
}): ToolResult {
  const success = input.success ?? true;
  return attachModelVisibleJson({
    success,
    status: success ? "success" : "failure",
    kind: "observation",
    observationOnly: true,
    result: input.result,
    error: input.error,
    modelSafeRefs: input.modelSafeRefs ? uniqueStrings(input.modelSafeRefs) : undefined,
  });
}
