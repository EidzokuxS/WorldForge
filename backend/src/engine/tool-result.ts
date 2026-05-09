import crypto from "node:crypto";

export type ToolResultStatus = "success" | "partial" | "failure";

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

export interface ToolResult {
  success: boolean;
  status?: ToolResultStatus;
  result?: unknown;
  error?: string;
  authority?: ToolResultAuthority;
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

  return {
    ...result,
    status,
    authority: {
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
  };
}

export function buildValidationFailureToolResult(error: string): ToolResult {
  return {
    success: false,
    status: "failure",
    error,
  };
}

export function buildPartialToolResult(result: unknown, error?: string): ToolResult {
  return {
    success: false,
    status: "partial",
    result,
    error,
  };
}
