import type {
  CampaignWorldAcceptanceReceipt,
  CampaignWorldBuildEvent,
  CampaignWorldBuildStage,
  CampaignWorldDna,
  CampaignWorldSource,
  CampaignWorldState,
} from "@worldforge/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

const BUILD_STAGES: readonly CampaignWorldBuildStage[] = [
  "world_frame",
  "world_cast",
  "world_connections",
  "validation",
  "persistence",
];

const EVENT_TYPES = [
  "build_started",
  "stage_started",
  "stage_completed",
  "build_completed",
  "build_failed",
] as const;

type CampaignWorldStateWithCursor<T> = T extends CampaignWorldState
  ? T & {
      currentBuildId: string | null;
      currentStage: CampaignWorldBuildStage | null;
      lastEventSequence: number;
    }
  : never;

export type CampaignWorldStateResponse = CampaignWorldStateWithCursor<CampaignWorldState>;

export interface StartedCampaignWorldBuild {
  campaignId: string;
  buildId: string;
  sourceDigest: string;
  startedAt: number;
}

export interface CampaignWorldEventStreamResult {
  lastSequence: number;
  terminalEvent: Extract<
    CampaignWorldBuildEvent,
    { type: "build_completed" | "build_failed" }
  >;
}

export interface CampaignWorldEventStreamOptions {
  afterSequence: number;
  signal?: AbortSignal;
  onEvent: (event: CampaignWorldBuildEvent) => void;
}

export class CampaignWorldApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "CampaignWorldApiError";
    this.code = code;
    this.status = status;
  }
}

function campaignPath(campaignId: string, suffix: string): string {
  return `${API_BASE}/api/campaigns/${encodeURIComponent(campaignId)}/world${suffix}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSafeSequence(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isBuildStage(value: unknown): value is CampaignWorldBuildStage {
  return typeof value === "string" && BUILD_STAGES.includes(value as CampaignWorldBuildStage);
}

function invalidResponse(status: number): CampaignWorldApiError {
  return new CampaignWorldApiError(
    "invalid_campaign_world_response",
    "Campaign World returned an invalid response.",
    status,
  );
}

function parseSource(value: unknown, status: number): CampaignWorldSource {
  if (
    !isObject(value)
    || !isNonEmptyString(value.campaignId)
    || typeof value.premise !== "string"
    || !(value.researchSummary === null || typeof value.researchSummary === "string")
    || !Array.isArray(value.sourceReferences)
    || !isNonEmptyString(value.sourceDigest)
  ) {
    throw invalidResponse(status);
  }

  if (value.dna !== null) {
    if (
      !isObject(value.dna)
      || !hasExactKeys(value.dna, [
        "geography",
        "politicalStructure",
        "centralConflict",
        "culturalFlavor",
        "environment",
        "wildcard",
      ])
      || !Object.values(value.dna).every((entry) => isNonEmptyString(entry))
    ) {
      throw invalidResponse(status);
    }
  }

  if (value.playerIdentity !== undefined) {
    if (
      !isObject(value.playerIdentity)
      || !hasExactKeys(value.playerIdentity, ["displayName"])
      || !isNonEmptyString(value.playerIdentity.displayName)
    ) {
      throw invalidResponse(status);
    }
  }

  for (const reference of value.sourceReferences) {
    if (
      !isObject(reference)
      || !hasExactKeys(reference, ["id", "label", "sourceType"])
      || !isNonEmptyString(reference.id)
      || !isNonEmptyString(reference.label)
      || !isNonEmptyString(reference.sourceType)
    ) {
      throw invalidResponse(status);
    }
  }

  return value as unknown as CampaignWorldSource;
}

function parseState(value: unknown, status: number): CampaignWorldStateResponse {
  if (
    !isObject(value)
    || !["unbuilt", "building", "review", "accepted", "failed"].includes(String(value.status))
    || !(value.currentBuildId === null || isNonEmptyString(value.currentBuildId))
    || !(value.currentStage === null || isBuildStage(value.currentStage))
    || !isSafeSequence(value.lastEventSequence)
  ) {
    throw invalidResponse(status);
  }

  if (value.status === "unbuilt") {
    parseSource(value.source, status);
  } else if (value.status === "building" || value.status === "failed") {
    parseSource(value.source, status);
    if (!isObject(value.build) || !isNonEmptyString(value.build.buildId)) {
      throw invalidResponse(status);
    }
  } else if (
    !isObject(value.world)
    || !isNonEmptyString(value.world.campaignId)
    || !Array.isArray(value.world.locations)
    || !Array.isArray(value.world.routes)
    || !Array.isArray(value.world.actors)
    || !Array.isArray(value.world.goals)
    || !Array.isArray(value.world.relations)
    || !Array.isArray(value.world.placements)
    || !Array.isArray(value.world.pressures)
    || !isObject(value.world.source)
  ) {
    throw invalidResponse(status);
  }

  return value as unknown as CampaignWorldStateResponse;
}

function parseStartedBuild(value: unknown, status: number): StartedCampaignWorldBuild {
  if (
    !isObject(value)
    || !hasExactKeys(value, ["campaignId", "buildId", "sourceDigest", "startedAt"])
    || !isNonEmptyString(value.campaignId)
    || !isNonEmptyString(value.buildId)
    || !isNonEmptyString(value.sourceDigest)
    || !Number.isSafeInteger(value.startedAt)
  ) {
    throw invalidResponse(status);
  }
  return value as unknown as StartedCampaignWorldBuild;
}

function parseAcceptance(value: unknown, status: number): CampaignWorldAcceptanceReceipt {
  if (
    !isObject(value)
    || !hasExactKeys(value, ["campaignId", "worldVersion", "contentHash", "acceptedAt"])
    || !isNonEmptyString(value.campaignId)
    || !Number.isSafeInteger(value.worldVersion)
    || Number(value.worldVersion) < 1
    || !isNonEmptyString(value.contentHash)
    || !Number.isSafeInteger(value.acceptedAt)
  ) {
    throw invalidResponse(status);
  }
  return value as unknown as CampaignWorldAcceptanceReceipt;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw invalidResponse(response.status);
  }
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  parse: (value: unknown, status: number) => T,
): Promise<T> {
  const response = await fetch(url, init);
  const payload = await readJson(response);

  if (!response.ok) {
    if (
      isObject(payload)
      && hasExactKeys(payload, ["error"])
      && isObject(payload.error)
      && hasExactKeys(payload.error, ["code", "message"])
      && isNonEmptyString(payload.error.code)
      && isNonEmptyString(payload.error.message)
    ) {
      throw new CampaignWorldApiError(payload.error.code, payload.error.message, response.status);
    }
    throw invalidResponse(response.status);
  }

  return parse(payload, response.status);
}

export function loadCampaignWorldSource(campaignId: string): Promise<CampaignWorldSource> {
  return requestJson(
    campaignPath(campaignId, "/source"),
    { method: "GET" },
    parseSource,
  );
}

export function saveCampaignWorldDna(
  campaignId: string,
  dna: CampaignWorldDna,
): Promise<CampaignWorldSource> {
  return requestJson(
    campaignPath(campaignId, "/dna"),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dna),
    },
    parseSource,
  );
}

export function createCampaignWorldBuild(
  campaignId: string,
  expectedSourceDigest: string,
): Promise<StartedCampaignWorldBuild> {
  return requestJson(
    campaignPath(campaignId, "/builds"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedSourceDigest }),
    },
    parseStartedBuild,
  );
}

export function loadCampaignWorldState(campaignId: string): Promise<CampaignWorldStateResponse> {
  return requestJson(
    campaignPath(campaignId, "/state"),
    { method: "GET" },
    parseState,
  );
}

export function acceptCampaignWorld(
  campaignId: string,
  expectedVersion: number,
  expectedContentHash: string,
): Promise<CampaignWorldAcceptanceReceipt> {
  return requestJson(
    campaignPath(campaignId, "/accept"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion, expectedContentHash }),
    },
    parseAcceptance,
  );
}

function parseBuildEvent(
  value: unknown,
  expectedBuildId: string,
): CampaignWorldBuildEvent {
  if (
    !isObject(value)
    || !isSafeSequence(value.sequence)
    || Number(value.sequence) < 1
    || value.buildId !== expectedBuildId
    || !EVENT_TYPES.includes(value.type as (typeof EVENT_TYPES)[number])
    || !Number.isSafeInteger(value.createdAt)
  ) {
    throw invalidResponse(200);
  }

  if (value.type === "build_started") {
    if (!hasExactKeys(value, ["sequence", "buildId", "type", "createdAt"])) {
      throw invalidResponse(200);
    }
  } else if (value.type === "stage_started" || value.type === "stage_completed") {
    if (
      !hasExactKeys(value, ["sequence", "buildId", "type", "stage", "createdAt"])
      || !isBuildStage(value.stage)
    ) {
      throw invalidResponse(200);
    }
  } else if (value.type === "build_completed") {
    if (
      !hasExactKeys(value, ["sequence", "buildId", "type", "worldVersion", "contentHash", "createdAt"])
      || !Number.isSafeInteger(value.worldVersion)
      || Number(value.worldVersion) < 1
      || !isNonEmptyString(value.contentHash)
    ) {
      throw invalidResponse(200);
    }
  } else if (
    !hasExactKeys(value, ["sequence", "buildId", "type", "errorCode", "message", "createdAt"])
    || !isNonEmptyString(value.errorCode)
    || !isNonEmptyString(value.message)
  ) {
    throw invalidResponse(200);
  }

  return value as unknown as CampaignWorldBuildEvent;
}

export async function streamCampaignWorldBuildEvents(
  campaignId: string,
  buildId: string,
  options: CampaignWorldEventStreamOptions,
): Promise<CampaignWorldEventStreamResult> {
  const response = await fetch(
    campaignPath(
      campaignId,
      `/builds/${encodeURIComponent(buildId)}/events?afterSequence=${options.afterSequence}`,
    ),
    { method: "GET", signal: options.signal },
  );

  if (!response.ok) {
    const payload = await readJson(response);
    if (
      isObject(payload)
      && hasExactKeys(payload, ["error"])
      && isObject(payload.error)
      && hasExactKeys(payload.error, ["code", "message"])
      && isNonEmptyString(payload.error.code)
      && isNonEmptyString(payload.error.message)
    ) {
      throw new CampaignWorldApiError(payload.error.code, payload.error.message, response.status);
    }
    throw invalidResponse(response.status);
  }

  if (!response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) {
    throw invalidResponse(response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const seen = new Map<number, string>();
  let buffer = "";
  let eventId: string | null = null;
  let eventName: string | null = null;
  let dataLines: string[] = [];
  let lastSequence = options.afterSequence;
  let terminalEvent: CampaignWorldEventStreamResult["terminalEvent"] | null = null;

  const dispatch = () => {
    if (eventId === null && eventName === null && dataLines.length === 0) return;
    if (eventId === null || eventName === null || dataLines.length !== 1) {
      throw invalidResponse(response.status);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(dataLines[0]!);
    } catch {
      throw invalidResponse(response.status);
    }
    const event = parseBuildEvent(payload, buildId);
    if (eventId !== String(event.sequence) || eventName !== event.type) {
      throw invalidResponse(response.status);
    }

    const canonicalEvent = JSON.stringify(event);
    const priorEvent = seen.get(event.sequence);
    if (priorEvent !== undefined) {
      if (priorEvent !== canonicalEvent) throw invalidResponse(response.status);
      return;
    }
    if (event.sequence !== lastSequence + 1) {
      throw invalidResponse(response.status);
    }

    seen.set(event.sequence, canonicalEvent);
    lastSequence = event.sequence;
    options.onEvent(event);
    if (event.type === "build_completed" || event.type === "build_failed") {
      terminalEvent = event;
    }
  };

  const consumeLine = (line: string) => {
    if (line.length === 0) {
      dispatch();
      eventId = null;
      eventName = null;
      dataLines = [];
      return;
    }
    if (line.startsWith(":")) return;
    const separator = line.indexOf(":");
    if (separator < 0) throw invalidResponse(response.status);
    const field = line.slice(0, separator);
    const rawValue = line.slice(separator + 1);
    const fieldValue = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "id") {
      if (eventId !== null) throw invalidResponse(response.status);
      eventId = fieldValue;
    } else if (field === "event") {
      if (eventName !== null) throw invalidResponse(response.status);
      eventName = fieldValue;
    } else if (field === "data") {
      dataLines.push(fieldValue);
    } else {
      throw invalidResponse(response.status);
    }
  };

  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value, { stream: !chunk.done });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      consumeLine(line);
      newlineIndex = buffer.indexOf("\n");
    }

    if (chunk.done) break;
  }

  if (buffer.length > 0 || eventId !== null || eventName !== null || dataLines.length > 0) {
    throw invalidResponse(response.status);
  }
  if (terminalEvent === null) {
    throw new CampaignWorldApiError(
      "campaign_world_event_stream_closed",
      "Campaign World progress ended before the build finished.",
      response.status,
    );
  }

  return { lastSequence, terminalEvent };
}
