import {
  CAMPAIGN_PLAY_CHARACTER_SOURCE_VALUES,
  CAMPAIGN_PLAY_CONSEQUENCE_CUE_VALUES,
  CAMPAIGN_PLAY_EFFECT_KIND_VALUES,
  CAMPAIGN_PLAY_LIMITS,
  CAMPAIGN_PLAY_NARRATION_OPERATION_STATUS_VALUES,
  CAMPAIGN_PLAY_PHASE_VALUES,
  CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES,
  CAMPAIGN_PLAY_PUBLIC_PROGRESS_VALUES,
  CAMPAIGN_PLAY_PUBLIC_TURN_STATUS_VALUES,
  CAMPAIGN_PLAY_ROUTE_STATE_VALUES,
  CAMPAIGN_PLAY_SSE_EVENT_TYPE_VALUES,
  CAMPAIGN_TURN_KIND_VALUES,
  type CampaignPlayCharacterDraft,
  type CampaignPlayCharacterDraftResponse,
  type CampaignPlayCharacterResearch,
  type CampaignPlayCharacterResearchResponse,
  type CampaignPlayConsequence,
  type CampaignPlayErrorResponse,
  type CampaignPlayGeneratePlayerDraftRequest,
  type CampaignPlayJournalEntry,
  type CampaignPlayJournalPage,
  type CampaignPlayJournalRequest,
  type CampaignPlayNarration,
  type CampaignPlayNarrationOperation,
  type CampaignPlayNarrationRecoveryRequest,
  type CampaignPlayNarrationRecoveryResponse,
  type CampaignPlayOpeningAdmissionRequest,
  type CampaignPlayOpeningDetailOption,
  type CampaignPlayOpeningLocationOption,
  type CampaignPlayParsePlayerCardRequest,
  type CampaignPlayPublicCharacter,
  type CampaignPlayPublicErrorCode,
  type CampaignPlayPublicTurn,
  type CampaignPlayPutPlayerRequest,
  type CampaignPlayPutPlayerResponse,
  type CampaignPlayResearchPlayerRequest,
  type CampaignPlayResumeTurnRequest,
  type CampaignPlaySseEvent,
  type CampaignPlaySuggestedAction,
  type CampaignPlayState,
  type CampaignPlayTurnAdmissionRequest,
  type CampaignPlayTurnAdmissionResponse,
  type CampaignPlayTurnReadResponse,
  type CampaignPlayTurnPublicResult,
  type CampaignPlayVisibleActor,
  type CampaignPlayVisibleLocation,
  type CampaignPlayVisibleObligation,
  type CampaignPlayVisiblePossession,
  type CampaignPlayVisiblePressure,
  type CampaignPlayVisibleRoute,
} from "@worldforge/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

const HANDLE_CHARACTERS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
const ID_CHARACTERS = `${HANDLE_CHARACTERS}:`;
const ACCENT_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789-";
const REQUIREMENT_CODE_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789_";
const LOWER_HEX_CHARACTERS = "0123456789abcdef";
const IMPORT_MODE_VALUES = ["native", "outsider"] as const;
const SKILL_TIER_VALUES = ["Novice", "Skilled", "Master"] as const;

type TerminalTurnEvent = Extract<
  CampaignPlaySseEvent,
  { type: "turn.interrupted" | "turn.completed" | "turn.failed" }
>;
type UnknownRecord = Record<string, unknown>;
type PublicVersionsRecord = UnknownRecord & {
  acceptedWorldVersion: number;
  worldVersion: number;
  runtimeRevision: number;
};

const ERROR_METADATA: Record<
  CampaignPlayPublicErrorCode,
  { status: 404 | 409 | 422 | 503; retryEligible: boolean; context: "none" | "play" }
> = {
  campaign_not_found: { status: 404, retryEligible: false, context: "none" },
  world_not_accepted: { status: 422, retryEligible: false, context: "none" },
  world_not_playable: { status: 422, retryEligible: false, context: "play" },
  character_required: { status: 422, retryEligible: false, context: "play" },
  character_already_exists: { status: 409, retryEligible: false, context: "play" },
  opening_required: { status: 422, retryEligible: false, context: "play" },
  opening_already_completed: { status: 409, retryEligible: false, context: "play" },
  invalid_character: { status: 422, retryEligible: false, context: "play" },
  invalid_starting_conditions: { status: 422, retryEligible: false, context: "play" },
  invalid_intent: { status: 422, retryEligible: false, context: "play" },
  invalid_choice: { status: 422, retryEligible: false, context: "play" },
  invalid_event_cursor: { status: 422, retryEligible: false, context: "play" },
  idempotency_conflict: { status: 409, retryEligible: false, context: "play" },
  stale_world_version: { status: 409, retryEligible: false, context: "play" },
  stale_runtime_revision: { status: 409, retryEligible: false, context: "play" },
  turn_in_progress: { status: 409, retryEligible: false, context: "play" },
  turn_not_found: { status: 404, retryEligible: false, context: "play" },
  turn_not_resumable: { status: 409, retryEligible: false, context: "play" },
  turn_interrupted: { status: 503, retryEligible: true, context: "play" },
  turn_failed: { status: 503, retryEligible: false, context: "play" },
  service_unavailable: { status: 503, retryEligible: true, context: "play" },
};

export interface CampaignPlayTurnEventStreamOptions {
  afterSequence: number;
  signal?: AbortSignal;
  onEvent: (event: CampaignPlaySseEvent) => void;
}

export interface CampaignPlayTurnEventStreamResult {
  lastSequence: number;
  terminalEvent: TerminalTurnEvent | null;
}

export class CampaignPlayApiError extends Error {
  readonly code: CampaignPlayPublicErrorCode;
  readonly status: number;
  readonly details: CampaignPlayErrorResponse | null;
  readonly invalidResponse: boolean;

  constructor(
    code: CampaignPlayPublicErrorCode,
    message: string,
    status: number,
    details: CampaignPlayErrorResponse | null,
    invalidResponse = false,
  ) {
    super(message);
    this.name = "CampaignPlayApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.invalidResponse = invalidResponse;
  }
}

function campaignPath(campaignId: string, suffix: string): string {
  return `${API_BASE}/api/campaigns/${encodeURIComponent(campaignId)}/play${suffix}`;
}

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 1;
}

function isNonnegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

function isBoundedString(
  value: unknown,
  maximum: number,
  options: { singleLine: boolean; characters?: string },
): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value !== value.trim()
  ) {
    return false;
  }
  if (options.singleLine && (value.includes("\n") || value.includes("\r"))) return false;
  return options.characters === undefined ||
    [...value].every((character) => options.characters?.includes(character));
}

function isOptionalBoundedString(
  value: unknown,
  maximum: number,
  options: { singleLine: boolean },
): value is string {
  return typeof value === "string" &&
    value.length <= maximum &&
    value === value.trim() &&
    (!options.singleLine || (!value.includes("\n") && !value.includes("\r")));
}

function isId(value: unknown): value is string {
  return isBoundedString(value, CAMPAIGN_PLAY_LIMITS.id, {
    singleLine: true,
    characters: ID_CHARACTERS,
  });
}

function isHandle(value: unknown): value is string {
  return isBoundedString(value, CAMPAIGN_PLAY_LIMITS.handle, {
    singleLine: true,
    characters: HANDLE_CHARACTERS,
  });
}

function isName(value: unknown): value is string {
  return isBoundedString(value, CAMPAIGN_PLAY_LIMITS.name, { singleLine: true });
}

function isLabel(value: unknown): value is string {
  return isBoundedString(value, CAMPAIGN_PLAY_LIMITS.label, { singleLine: true });
}

function isOptionalLabel(value: unknown): value is string {
  return isOptionalBoundedString(value, CAMPAIGN_PLAY_LIMITS.label, { singleLine: true });
}

function isShortText(value: unknown): value is string {
  return isBoundedString(value, CAMPAIGN_PLAY_LIMITS.shortText, { singleLine: true });
}

function isText(value: unknown): value is string {
  return isBoundedString(value, CAMPAIGN_PLAY_LIMITS.text, { singleLine: false });
}

function isOptionalText(value: unknown): value is string {
  return isOptionalBoundedString(value, CAMPAIGN_PLAY_LIMITS.text, { singleLine: false });
}

function isNarrationBeatText(value: unknown): value is string {
  return isBoundedString(value, CAMPAIGN_PLAY_LIMITS.narrationBeat, { singleLine: false });
}

function isNarrationText(value: unknown): value is string {
  return isBoundedString(value, CAMPAIGN_PLAY_LIMITS.narrationText, { singleLine: false });
}

function isAccent(value: unknown): value is string {
  return isBoundedString(value, 32, {
    singleLine: true,
    characters: ACCENT_CHARACTERS,
  });
}

function isRequirementCode(value: unknown): value is string {
  return isBoundedString(value, 80, {
    singleLine: true,
    characters: REQUIREMENT_CODE_CHARACTERS,
  });
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && value.length === 64 &&
    [...value].every((character) => LOWER_HEX_CHARACTERS.includes(character));
}

function isUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function parseArray<T>(
  value: unknown,
  parse: (item: unknown) => T | null,
  maximum: number,
  minimum = 0,
): T[] | null {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return null;
  const parsed: T[] = [];
  for (const item of value) {
    const result = parse(item);
    if (result === null) return null;
    parsed.push(result);
  }
  return parsed;
}

function hasPublicVersions(value: UnknownRecord): value is PublicVersionsRecord {
  return isPositiveInteger(value.acceptedWorldVersion) &&
    isPositiveInteger(value.worldVersion) &&
    isPositiveInteger(value.runtimeRevision) &&
    value.worldVersion >= value.acceptedWorldVersion;
}

function asParsed<T>(value: UnknownRecord): T {
  return value as unknown as T;
}

function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function parseVisibleLocation(value: unknown): CampaignPlayVisibleLocation | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["handle", "name", "description"]) ||
    !isHandle(value.handle) ||
    !isName(value.name) ||
    !isText(value.description)
  ) {
    return null;
  }
  return asParsed<CampaignPlayVisibleLocation>(value);
}

function parseVisibleActor(value: unknown): CampaignPlayVisibleActor | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["handle", "name", "monogram", "descriptor", "accent"]) ||
    !isHandle(value.handle) ||
    !isName(value.name) ||
    !isBoundedString(value.monogram, 3, { singleLine: true }) ||
    !isLabel(value.descriptor) ||
    !isAccent(value.accent)
  ) {
    return null;
  }
  return asParsed<CampaignPlayVisibleActor>(value);
}

function parseVisibleRoute(value: unknown): CampaignPlayVisibleRoute | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["handle", "destinationHandle", "destinationName", "state", "travelTimeLabel"]) ||
    !isHandle(value.handle) ||
    !isHandle(value.destinationHandle) ||
    !isName(value.destinationName) ||
    !isOneOf(value.state, CAMPAIGN_PLAY_ROUTE_STATE_VALUES) ||
    !isLabel(value.travelTimeLabel)
  ) {
    return null;
  }
  return asParsed<CampaignPlayVisibleRoute>(value);
}

function parseVisiblePressure(value: unknown): CampaignPlayVisiblePressure | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["handle", "label", "summary"]) ||
    !isHandle(value.handle) ||
    !isLabel(value.label) ||
    !isText(value.summary)
  ) {
    return null;
  }
  return asParsed<CampaignPlayVisiblePressure>(value);
}

function parseVisiblePossession(value: unknown): CampaignPlayVisiblePossession | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["handle", "name", "quantity"]) ||
    !isHandle(value.handle) ||
    !isName(value.name) ||
    !isPositiveInteger(value.quantity) ||
    value.quantity > CAMPAIGN_PLAY_LIMITS.possessionQuantity
  ) {
    return null;
  }
  return asParsed<CampaignPlayVisiblePossession>(value);
}

function parseVisibleObligation(value: unknown): CampaignPlayVisibleObligation | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["handle", "direction", "counterpartyHandle", "counterpartyName", "unitKey", "outstandingAmount"]) ||
    !isHandle(value.handle) ||
    (value.direction !== "payable" && value.direction !== "receivable") ||
    !isHandle(value.counterpartyHandle) ||
    !isName(value.counterpartyName) ||
    value.unitKey !== "copper" ||
    !isPositiveInteger(value.outstandingAmount) ||
    value.outstandingAmount > CAMPAIGN_PLAY_LIMITS.possessionQuantity
  ) {
    return null;
  }
  return asParsed<CampaignPlayVisibleObligation>(value);
}

function parseConsequence(value: unknown): CampaignPlayConsequence | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["observationHandle", "performingActorHandle", "performingActorName", "whatChanged", "whereOrRoute", "worldTimeLabel", "causalCue"]) ||
    !isHandle(value.observationHandle) ||
    !((value.performingActorHandle === null && value.performingActorName === null)
      || (isHandle(value.performingActorHandle) && isLabel(value.performingActorName))) ||
    !isText(value.whatChanged) ||
    !isLabel(value.whereOrRoute) ||
    !isLabel(value.worldTimeLabel) ||
    !isOneOf(value.causalCue, CAMPAIGN_PLAY_CONSEQUENCE_CUE_VALUES)
  ) {
    return null;
  }
  return asParsed<CampaignPlayConsequence>(value);
}

function parseJournalEntry(value: unknown): CampaignPlayJournalEntry | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["observationHandle", "title", "text", "whereOrRoute", "worldTimeLabel", "consequence"]) ||
    !isHandle(value.observationHandle) ||
    !isLabel(value.title) ||
    !isText(value.text) ||
    !(value.whereOrRoute === null || isLabel(value.whereOrRoute)) ||
    !isLabel(value.worldTimeLabel)
  ) {
    return null;
  }
  const consequence = value.consequence === null ? null : parseConsequence(value.consequence);
  if (consequence === null && value.consequence !== null) return null;
  if (consequence !== null && consequence.observationHandle !== value.observationHandle) return null;
  return asParsed<CampaignPlayJournalEntry>(value);
}

function parseSuggestedAction(value: unknown): CampaignPlaySuggestedAction | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["choiceHandle", "label"]) ||
    !isHandle(value.choiceHandle) ||
    !isLabel(value.label)
  ) {
    return null;
  }
  return asParsed<CampaignPlaySuggestedAction>(value);
}

function parseNarration(value: unknown): CampaignPlayNarration | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "narrationId",
      "turnId",
      "beats",
      "displayText",
      "suggestedActions",
      "effects",
      "createdAt",
    ]) ||
    !isId(value.narrationId) ||
    !isId(value.turnId) ||
    !isNarrationText(value.displayText) ||
    !isNonnegativeInteger(value.createdAt)
  ) {
    return null;
  }
  const beats = parseArray<{ beatId: string }>(value.beats, (item) => {
    if (
      !isObject(item) ||
      !hasExactKeys(item, ["beatId", "text"]) ||
      !isId(item.beatId) ||
      !isNarrationBeatText(item.text)
    ) {
      return null;
    }
    return asParsed<{ beatId: string }>(item);
  }, CAMPAIGN_PLAY_LIMITS.narrationBeats, 1);
  const suggestedActions = parseArray<{ choiceHandle: string }>(value.suggestedActions, (item) => {
    if (
      !isObject(item) ||
      !hasExactKeys(item, ["choiceHandle", "label"]) ||
      !isHandle(item.choiceHandle) ||
      !isLabel(item.label)
    ) {
      return null;
    }
    return asParsed<{ choiceHandle: string }>(item);
  }, CAMPAIGN_PLAY_LIMITS.suggestedActions);
  const effects = parseArray<{ beatId: string | null }>(value.effects, (item) => {
    if (
      !isObject(item) ||
      !hasExactKeys(item, ["kind", "beatId"]) ||
      !isOneOf(item.kind, CAMPAIGN_PLAY_EFFECT_KIND_VALUES) ||
      !(item.beatId === null || isId(item.beatId))
    ) {
      return null;
    }
    return asParsed<{ beatId: string | null }>(item);
  }, CAMPAIGN_PLAY_LIMITS.effects);
  if (beats === null || suggestedActions === null || effects === null) return null;
  if (!isUnique(beats.map((beat) => beat.beatId))) return null;
  if (!isUnique(suggestedActions.map((action) => action.choiceHandle))) return null;
  const beatIds = new Set(beats.map((beat) => beat.beatId));
  if (effects.some((effect) => effect.beatId !== null && !beatIds.has(effect.beatId))) return null;
  return asParsed<CampaignPlayNarration>(value);
}

function parseNarrationOperation(value: unknown): CampaignPlayNarrationOperation | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "operationId",
      "resultId",
      "turnId",
      "narrationId",
      "packetHash",
      "receiptIds",
      "status",
      "attemptId",
      "attempt",
      "conciseResult",
      "createdAt",
      "completedAt",
    ]) ||
    !isId(value.operationId) || !isId(value.resultId) || !isId(value.turnId) ||
    !isId(value.narrationId) || !isHash(value.packetHash) ||
    !isOneOf(value.status, CAMPAIGN_PLAY_NARRATION_OPERATION_STATUS_VALUES) ||
    !(value.attemptId === null || isId(value.attemptId)) ||
    !isNonnegativeInteger(value.attempt) || !isNonnegativeInteger(value.createdAt) ||
    !(value.completedAt === null || isNonnegativeInteger(value.completedAt)) ||
    !isObject(value.conciseResult) ||
    !hasExactKeys(value.conciseResult, ["displayText", "suggestedActions"]) ||
    !isNarrationText(value.conciseResult.displayText)
  ) {
    return null;
  }
  const receiptIds = parseArray(value.receiptIds, (item) => isId(item) ? item : null,
    CAMPAIGN_PLAY_LIMITS.commandsPerBatch);
  const suggestedActions = parseArray(value.conciseResult.suggestedActions, (item) => {
    if (
      !isObject(item) || !hasExactKeys(item, ["choiceHandle", "label"]) ||
      !isHandle(item.choiceHandle) || !isLabel(item.label)
    ) return null;
    return asParsed<{ choiceHandle: string; label: string }>(item);
  }, CAMPAIGN_PLAY_LIMITS.suggestedActions);
  if (
    receiptIds === null || suggestedActions === null ||
    !isUnique(receiptIds as string[]) ||
    !isUnique(suggestedActions.map((action) => action.choiceHandle)) ||
    (value.status === "pending" ? value.attemptId !== null
      : value.attempt < 1 || value.attemptId === null) ||
    ((value.status === "complete") !== (value.completedAt !== null))
  ) return null;
  return asParsed<CampaignPlayNarrationOperation>(value);
}

function parsePublicCharacter(value: unknown): CampaignPlayPublicCharacter | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["name", "monogram", "descriptor", "accent"]) ||
    !isName(value.name) ||
    !isBoundedString(value.monogram, 3, { singleLine: true }) ||
    !isLabel(value.descriptor) ||
    !isAccent(value.accent)
  ) {
    return null;
  }
  return asParsed<CampaignPlayPublicCharacter>(value);
}

function parseOpeningDetailOption(value: unknown): CampaignPlayOpeningDetailOption | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["handle", "label"]) ||
    !isHandle(value.handle) ||
    !isLabel(value.label)
  ) {
    return null;
  }
  return asParsed<CampaignPlayOpeningDetailOption>(value);
}

function parseOpeningLocationOption(value: unknown): CampaignPlayOpeningLocationOption | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["locationHandle", "name", "description", "roles", "arrivalModes", "immediateSituations"]) ||
    !isHandle(value.locationHandle) ||
    !isName(value.name) ||
    !isText(value.description)
  ) {
    return null;
  }
  const roles = parseArray(
    value.roles,
    parseOpeningDetailOption,
    CAMPAIGN_PLAY_LIMITS.openingDetails,
    1,
  );
  const arrivalModes = parseArray(
    value.arrivalModes,
    parseOpeningDetailOption,
    CAMPAIGN_PLAY_LIMITS.openingDetails,
    1,
  );
  const immediateSituations = parseArray(
    value.immediateSituations,
    parseOpeningDetailOption,
    CAMPAIGN_PLAY_LIMITS.openingDetails,
    1,
  );
  if (roles === null || arrivalModes === null || immediateSituations === null) return null;
  if (
    !isUnique(roles.map((option) => option.handle)) ||
    !isUnique(arrivalModes.map((option) => option.handle)) ||
    !isUnique(immediateSituations.map((option) => option.handle))
  ) {
    return null;
  }
  return asParsed<CampaignPlayOpeningLocationOption>(value);
}

function parsePublicTurn(value: unknown): CampaignPlayPublicTurn | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "turnId",
      "turnKind",
      "status",
      "progress",
      "lastEventSequence",
      "retryEligible",
      "submittedAt",
      "completedAt",
    ]) ||
    !isId(value.turnId) ||
    !isOneOf(value.turnKind, CAMPAIGN_TURN_KIND_VALUES) ||
    !isOneOf(value.status, CAMPAIGN_PLAY_PUBLIC_TURN_STATUS_VALUES) ||
    !(value.progress === null || isOneOf(value.progress, CAMPAIGN_PLAY_PUBLIC_PROGRESS_VALUES)) ||
    !isNonnegativeInteger(value.lastEventSequence) ||
    typeof value.retryEligible !== "boolean" ||
    !isNonnegativeInteger(value.submittedAt) ||
    !(value.completedAt === null || isNonnegativeInteger(value.completedAt))
  ) {
    return null;
  }
  if (value.status === "processing") {
    if (value.progress === null || value.completedAt !== null || value.retryEligible) return null;
  } else if (value.status === "interrupted") {
    if (value.progress !== null || value.completedAt !== null || !value.retryEligible) return null;
  } else if (value.progress !== null || value.completedAt === null || value.retryEligible) {
    return null;
  }
  return asParsed<CampaignPlayPublicTurn>(value);
}

function parseTurnResult(value: unknown): CampaignPlayTurnPublicResult | null {
  if (!isObject(value) || typeof value.status !== "string") return null;
  if (value.status === "processing") {
    return hasExactKeys(value, ["status"])
      ? asParsed<CampaignPlayTurnPublicResult>(value)
      : null;
  }
  if (value.status === "interrupted" || value.status === "failed") {
    if (
      !hasExactKeys(value, ["status", "errorCode"]) ||
      !isOneOf(value.errorCode, CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES)
    ) {
      return null;
    }
    return asParsed<CampaignPlayTurnPublicResult>(value);
  }
  if (value.status !== "completed") return null;
  if (
    !hasExactKeys(value, [
      "status",
      "narration",
      "narrationOperation",
      "consequences",
      "journalCursor",
    ]) ||
    !isNonnegativeInteger(value.journalCursor)
  ) {
    return null;
  }
  const narration = value.narration === null ? null : parseNarration(value.narration);
  const narrationOperation = value.narrationOperation === null
    ? null
    : parseNarrationOperation(value.narrationOperation);
  const consequences = parseArray(
    value.consequences,
    parseConsequence,
    CAMPAIGN_PLAY_LIMITS.newObservations,
  );
  return (narration === null && value.narration !== null) ||
      (narrationOperation === null && value.narrationOperation !== null) ||
      (narration === null && narrationOperation === null) || consequences === null
    ? null
    : asParsed<CampaignPlayTurnPublicResult>(value);
}

function parseState(value: unknown): CampaignPlayState | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "acceptedWorldVersion",
      "worldVersion",
      "runtimeRevision",
      "campaignId",
      "phase",
      "character",
      "openingOptions",
      "currentLocation",
      "visibleActors",
      "visibleRoutes",
      "visiblePressures",
      "possessions",
      "obligations",
      "narration",
      "narrationOperation",
      "utilityActions",
      "consequences",
      "activeTurn",
      "journalCursor",
      "projectionHash",
    ]) ||
    !hasPublicVersions(value) ||
    !isId(value.campaignId) ||
    !isOneOf(value.phase, CAMPAIGN_PLAY_PHASE_VALUES) ||
    !isNonnegativeInteger(value.journalCursor) ||
    !isHash(value.projectionHash)
  ) {
    return null;
  }
  if (jsonByteLength(value) > CAMPAIGN_PLAY_LIMITS.publicStateBytes) return null;
  const character = value.character === null ? null : parsePublicCharacter(value.character);
  const openingOptions = parseArray(
    value.openingOptions,
    parseOpeningLocationOption,
    CAMPAIGN_PLAY_LIMITS.openingLocations,
  );
  const currentLocation = value.currentLocation === null
    ? null
    : parseVisibleLocation(value.currentLocation);
  const visibleActors = parseArray(
    value.visibleActors,
    parseVisibleActor,
    CAMPAIGN_PLAY_LIMITS.visibleActors,
  );
  const visibleRoutes = parseArray(
    value.visibleRoutes,
    parseVisibleRoute,
    CAMPAIGN_PLAY_LIMITS.visibleRoutes,
  );
  const visiblePressures = parseArray(
    value.visiblePressures,
    parseVisiblePressure,
    CAMPAIGN_PLAY_LIMITS.visiblePressures,
  );
  const possessions = parseArray(
    value.possessions,
    parseVisiblePossession,
    CAMPAIGN_PLAY_LIMITS.visiblePossessions,
  );
  const obligations = parseArray(
    value.obligations,
    parseVisibleObligation,
    CAMPAIGN_PLAY_LIMITS.visibleObligations,
  );
  const narration = value.narration === null ? null : parseNarration(value.narration);
  const narrationOperation = value.narrationOperation === null
    ? null
    : parseNarrationOperation(value.narrationOperation);
  const utilityActions = parseArray(
    value.utilityActions,
    parseSuggestedAction,
    1,
  );
  const consequences = parseArray(
    value.consequences,
    parseConsequence,
    CAMPAIGN_PLAY_LIMITS.newObservations,
  );
  const activeTurn = value.activeTurn === null ? null : parsePublicTurn(value.activeTurn);
  if (
    (character === null && value.character !== null) ||
    openingOptions === null ||
    (currentLocation === null && value.currentLocation !== null) ||
    visibleActors === null ||
    visibleRoutes === null ||
    visiblePressures === null ||
    possessions === null ||
    obligations === null ||
    (narration === null && value.narration !== null) ||
    (narrationOperation === null && value.narrationOperation !== null) ||
    utilityActions === null ||
    consequences === null ||
    (activeTurn === null && value.activeTurn !== null) ||
    !isUnique(openingOptions.map((option) => option.locationHandle)) ||
    !isUnique(utilityActions.map((action) => action.choiceHandle))
  ) {
    return null;
  }
  if ((value.phase !== "ready" || activeTurn !== null) && utilityActions.length > 0) {
    return null;
  }
  const noLiveScene = currentLocation === null && narration === null && narrationOperation === null &&
    visibleActors.length === 0 && visibleRoutes.length === 0 &&
    visiblePressures.length === 0 && obligations.length === 0 && consequences.length === 0;
  if ((value.phase === "opening_required") !== (openingOptions.length > 0)) return null;
  if (value.phase === "character_required") {
    if (character !== null || activeTurn !== null || !noLiveScene || possessions.length > 0) return null;
  } else if (value.phase === "opening_required") {
    if (character === null || activeTurn !== null || openingOptions.length === 0 || !noLiveScene) return null;
  } else if (value.phase === "opening_active") {
    if (
      character === null || activeTurn === null || activeTurn.turnKind !== "opening" ||
      (activeTurn.status !== "processing" && activeTurn.status !== "interrupted") ||
      activeTurn.progress === "narrating" || !noLiveScene
    ) {
      return null;
    }
  } else if (value.phase === "ready") {
    if (
      character === null || currentLocation === null ||
      (narration === null && narrationOperation === null) || activeTurn !== null
    ) return null;
  } else if (value.phase === "turn_active") {
    if (
      character === null || currentLocation === null || activeTurn === null ||
      activeTurn.turnKind !== "player_action" ||
      (activeTurn.status !== "processing" && activeTurn.status !== "interrupted") ||
      activeTurn.progress === "narrating"
    ) {
      return null;
    }
  } else {
    const narrationProcessing = activeTurn?.status === "processing" &&
      activeTurn.progress === "narrating";
    const narrationInterrupted = activeTurn?.status === "interrupted" &&
      activeTurn.progress === null && activeTurn.retryEligible;
    if (character === null || currentLocation === null || (!narrationProcessing && !narrationInterrupted)) {
      return null;
    }
  }
  return asParsed<CampaignPlayState>(value);
}

function parseTurnReadResponse(value: unknown): CampaignPlayTurnReadResponse | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "acceptedWorldVersion",
      "worldVersion",
      "runtimeRevision",
      "campaignId",
      "turn",
      "result",
    ]) ||
    !hasPublicVersions(value) ||
    !isId(value.campaignId)
  ) {
    return null;
  }
  const turn = parsePublicTurn(value.turn);
  const result = parseTurnResult(value.result);
  if (turn === null || result === null || turn.status !== result.status) return null;
  if (
    result.status === "completed" &&
    ((result.narration !== null && result.narration.turnId !== turn.turnId) ||
      (result.narrationOperation !== null && result.narrationOperation.turnId !== turn.turnId))
  ) return null;
  const metadata = result.status === "interrupted" || result.status === "failed"
    ? ERROR_METADATA[result.errorCode]
    : null;
  if (
    (result.status === "interrupted" && metadata?.retryEligible !== true) ||
    (result.status === "failed" && metadata?.retryEligible !== false)
  ) {
    return null;
  }
  return asParsed<CampaignPlayTurnReadResponse>(value);
}

function parseJournalPage(value: unknown): CampaignPlayJournalPage | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "acceptedWorldVersion",
      "worldVersion",
      "runtimeRevision",
      "campaignId",
      "entries",
      "nextCursor",
    ]) ||
    !hasPublicVersions(value) ||
    !isId(value.campaignId) ||
    !(value.nextCursor === null || isNonnegativeInteger(value.nextCursor))
  ) {
    return null;
  }
  const entries = parseArray(value.entries, parseJournalEntry, CAMPAIGN_PLAY_LIMITS.journalPage);
  return entries === null ? null : asParsed<CampaignPlayJournalPage>(value);
}

function parseCharacterDraft(value: unknown): CampaignPlayCharacterDraft | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "name",
      "summary",
      "species",
      "gender",
      "ageText",
      "appearance",
      "biography",
      "personality",
      "motives",
      "beliefs",
      "drives",
      "traits",
      "skills",
      "flaws",
      "specialties",
      "inventory",
      "signatureItems",
      "source",
    ]) ||
    !isName(value.name) ||
    !isText(value.summary) ||
    !isOptionalLabel(value.species) ||
    !isOptionalLabel(value.gender) ||
    !isOptionalLabel(value.ageText) ||
    !isOptionalText(value.appearance) ||
    !isText(value.biography) ||
    !isObject(value.personality) ||
    !hasExactKeys(value.personality, [
      "summary",
      "voice",
      "decisionStyle",
      "worldview",
      "contradictions",
      "mythology",
      "sampleLines",
    ]) ||
    !isOptionalText(value.personality.summary) ||
    !isOptionalText(value.personality.voice) ||
    !isOptionalText(value.personality.decisionStyle) ||
    !isOptionalText(value.personality.worldview) ||
    !isOptionalText(value.personality.mythology) ||
    !isObject(value.source) ||
    !hasExactKeys(value.source, ["kind", "importMode", "label"]) ||
    !isOneOf(value.source.kind, CAMPAIGN_PLAY_CHARACTER_SOURCE_VALUES) ||
    !(value.source.importMode === null || isOneOf(value.source.importMode, IMPORT_MODE_VALUES)) ||
    !isLabel(value.source.label)
  ) {
    return null;
  }
  const labelLists = [
    value.motives,
    value.beliefs,
    value.drives,
    value.traits,
    value.flaws,
    value.specialties,
    value.inventory,
    value.signatureItems,
  ];
  if (
    labelLists.some((list) =>
      parseArray(list, (item) => isLabel(item) ? item : null, CAMPAIGN_PLAY_LIMITS.characterList) === null,
    ) ||
    parseArray(
      value.personality.contradictions,
      (item) => isShortText(item) ? item : null,
      CAMPAIGN_PLAY_LIMITS.characterList,
    ) === null ||
    parseArray(
      value.personality.sampleLines,
      (item) => isShortText(item) ? item : null,
      CAMPAIGN_PLAY_LIMITS.characterList,
    ) === null ||
    parseArray(value.skills, (item) => {
      if (
        !isObject(item) ||
        !hasExactKeys(item, ["name", "tier"]) ||
        !isLabel(item.name) ||
        !(item.tier === null || isOneOf(item.tier, SKILL_TIER_VALUES))
      ) {
        return null;
      }
      return item;
    }, CAMPAIGN_PLAY_LIMITS.characterList) === null
  ) {
    return null;
  }
  return asParsed<CampaignPlayCharacterDraft>(value);
}

function parseCharacterDraftResponse(value: unknown): CampaignPlayCharacterDraftResponse | null {
  if (!isObject(value) || !hasExactKeys(value, ["draft"])) return null;
  return parseCharacterDraft(value.draft) === null
    ? null
    : asParsed<CampaignPlayCharacterDraftResponse>(value);
}

function parseCharacterResearch(value: unknown): CampaignPlayCharacterResearch | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["summary", "sources"]) ||
    !isText(value.summary)
  ) {
    return null;
  }
  const sources = parseArray(value.sources, (item) => {
    if (
      !isObject(item) ||
      !hasExactKeys(item, ["label", "excerpt"]) ||
      !isLabel(item.label) ||
      !isText(item.excerpt)
    ) {
      return null;
    }
    return item;
  }, CAMPAIGN_PLAY_LIMITS.researchSources);
  return sources === null ? null : asParsed<CampaignPlayCharacterResearch>(value);
}

function parseCharacterResearchResponse(value: unknown): CampaignPlayCharacterResearchResponse | null {
  if (!isObject(value) || !hasExactKeys(value, ["research"])) return null;
  return parseCharacterResearch(value.research) === null
    ? null
    : asParsed<CampaignPlayCharacterResearchResponse>(value);
}

function parsePutPlayerResponse(value: unknown): CampaignPlayPutPlayerResponse | null {
  const worldVersionAdvance = isObject(value)
    && isPositiveInteger(value.worldVersion)
    && isPositiveInteger(value.acceptedWorldVersion)
    ? value.worldVersion - value.acceptedWorldVersion
    : 0;
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["acceptedWorldVersion", "worldVersion", "runtimeRevision", "actorHandle"]) ||
    !hasPublicVersions(value) ||
    !isHandle(value.actorHandle) ||
    worldVersionAdvance < 1 ||
    worldVersionAdvance > CAMPAIGN_PLAY_LIMITS.characterList + 1
  ) {
    return null;
  }
  return asParsed<CampaignPlayPutPlayerResponse>(value);
}

function parseTurnAdmissionResponse(value: unknown): CampaignPlayTurnAdmissionResponse | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["turnId", "sequence"]) ||
    !isId(value.turnId) ||
    !isPositiveInteger(value.sequence)
  ) {
    return null;
  }
  return asParsed<CampaignPlayTurnAdmissionResponse>(value);
}

function parseNarrationRecoveryResponse(
  value: unknown,
): CampaignPlayNarrationRecoveryResponse | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["operationId", "attemptId", "attempt", "status"]) ||
    !isId(value.operationId) || !isId(value.attemptId) ||
    !isPositiveInteger(value.attempt) || value.status !== "running"
  ) {
    return null;
  }
  return asParsed<CampaignPlayNarrationRecoveryResponse>(value);
}

function parseErrorResponse(value: unknown): CampaignPlayErrorResponse | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "code",
      "status",
      "campaignPhase",
      "acceptedWorldVersion",
      "expectedWorldVersion",
      "currentWorldVersion",
      "expectedRuntimeRevision",
      "currentRuntimeRevision",
      "turnId",
      "retryEligible",
      "unmetRequirements",
    ]) ||
    !isOneOf(value.code, CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES) ||
    !([404, 409, 422, 503] as const).includes(value.status as 404 | 409 | 422 | 503) ||
    !(value.campaignPhase === null || isOneOf(value.campaignPhase, CAMPAIGN_PLAY_PHASE_VALUES)) ||
    !(value.acceptedWorldVersion === null || isPositiveInteger(value.acceptedWorldVersion)) ||
    !(value.expectedWorldVersion === null || isPositiveInteger(value.expectedWorldVersion)) ||
    !(value.currentWorldVersion === null || isPositiveInteger(value.currentWorldVersion)) ||
    !(value.expectedRuntimeRevision === null || isPositiveInteger(value.expectedRuntimeRevision)) ||
    !(value.currentRuntimeRevision === null || isPositiveInteger(value.currentRuntimeRevision)) ||
    !(value.turnId === null || isId(value.turnId)) ||
    typeof value.retryEligible !== "boolean"
  ) {
    return null;
  }
  const unmetRequirements = parseArray(
    value.unmetRequirements,
    (item) => isRequirementCode(item) ? item : null,
    32,
  );
  if (unmetRequirements === null) return null;
  const metadata = ERROR_METADATA[value.code];
  if (value.status !== metadata.status || value.retryEligible !== metadata.retryEligible) return null;
  const playContext = [
    value.campaignPhase,
    value.acceptedWorldVersion,
    value.currentWorldVersion,
    value.currentRuntimeRevision,
  ];
  if (
    (metadata.context === "none" && playContext.some((item) => item !== null)) ||
    (metadata.context === "play" && playContext.some((item) => item === null)) ||
    (value.code === "stale_world_version" && value.expectedWorldVersion === null) ||
    (value.code === "stale_runtime_revision" && value.expectedRuntimeRevision === null) ||
    ((value.code === "campaign_not_found" || value.code === "world_not_accepted") &&
      (value.expectedWorldVersion !== null || value.expectedRuntimeRevision !== null || value.turnId !== null)) ||
    (value.code === "world_not_playable" && unmetRequirements.length === 0)
  ) {
    return null;
  }
  return asParsed<CampaignPlayErrorResponse>(value);
}

function parseSseEvent(value: unknown, expectedTurnId: string): CampaignPlaySseEvent | null {
  if (
    !isObject(value) ||
    !isOneOf(value.type, CAMPAIGN_PLAY_SSE_EVENT_TYPE_VALUES) ||
    !isPositiveInteger(value.sequence) ||
    value.turnId !== expectedTurnId ||
    !isPositiveInteger(value.acceptedWorldVersion) ||
    !isPositiveInteger(value.worldVersion) ||
    value.worldVersion < value.acceptedWorldVersion ||
    !isPositiveInteger(value.runtimeRevision) ||
    !isNonnegativeInteger(value.createdAt)
  ) {
    return null;
  }
  if (value.type === "turn.accepted") {
    if (
      !hasExactKeys(value, [
        "sequence",
        "turnId",
        "acceptedWorldVersion",
        "worldVersion",
        "runtimeRevision",
        "createdAt",
        "type",
        "status",
      ]) ||
      value.status !== "processing"
    ) {
      return null;
    }
  } else if (value.type === "turn.progressed") {
    if (
      !hasExactKeys(value, [
        "sequence",
        "turnId",
        "acceptedWorldVersion",
        "worldVersion",
        "runtimeRevision",
        "createdAt",
        "type",
        "progress",
      ]) ||
      !isOneOf(value.progress, CAMPAIGN_PLAY_PUBLIC_PROGRESS_VALUES)
    ) {
      return null;
    }
  } else if (value.type === "turn.interrupted") {
    if (
      !hasExactKeys(value, [
        "sequence",
        "turnId",
        "acceptedWorldVersion",
        "worldVersion",
        "runtimeRevision",
        "createdAt",
        "type",
        "retryEligible",
      ]) ||
      value.retryEligible !== true
    ) {
      return null;
    }
  } else if (value.type === "turn.completed") {
    if (
      !hasExactKeys(value, [
        "sequence",
        "turnId",
        "acceptedWorldVersion",
        "worldVersion",
        "runtimeRevision",
        "createdAt",
        "type",
        "retryEligible",
      ]) ||
      value.retryEligible !== false
    ) {
      return null;
    }
  } else if (
    !hasExactKeys(value, [
      "sequence",
      "turnId",
      "acceptedWorldVersion",
      "worldVersion",
      "runtimeRevision",
      "createdAt",
      "type",
      "retryEligible",
      "errorCode",
    ]) ||
    value.retryEligible !== false ||
    !isOneOf(value.errorCode, CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES)
  ) {
    return null;
  }
  return asParsed<CampaignPlaySseEvent>(value);
}

function invalidResponse(status: number): CampaignPlayApiError {
  return new CampaignPlayApiError(
    "service_unavailable",
    "Campaign Play returned an invalid response.",
    status,
    null,
    true,
  );
}

function publicError(details: CampaignPlayErrorResponse): CampaignPlayApiError {
  return new CampaignPlayApiError(
    details.code,
    `Campaign Play request failed with ${details.code}.`,
    details.status,
    details,
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw invalidResponse(response.status);
  }
}

function throwForErrorPayload(payload: unknown, status: number): never {
  const details = parseErrorResponse(payload);
  if (details === null || details.status !== status) throw invalidResponse(status);
  throw publicError(details);
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  expectedStatus: 200 | 202,
  parse: (value: unknown) => T | null,
): Promise<T> {
  const response = await fetch(url, init);
  const payload = await readJson(response);
  if (!response.ok) throwForErrorPayload(payload, response.status);
  if (response.status !== expectedStatus) throw invalidResponse(response.status);
  const result = parse(payload);
  if (result === null) throw invalidResponse(response.status);
  return result;
}

export function loadCampaignPlayState(campaignId: string): Promise<CampaignPlayState> {
  return requestJson(
    campaignPath(campaignId, "/state"),
    { method: "GET" },
    200,
    (value) => {
      const parsed = parseState(value);
      return parsed?.campaignId === campaignId ? parsed : null;
    },
  );
}

export function parseCampaignPlayPlayerCard(
  campaignId: string,
  request: CampaignPlayParsePlayerCardRequest,
): Promise<CampaignPlayCharacterDraftResponse> {
  return requestJson(
    campaignPath(campaignId, "/player/cards/parse"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    200,
    parseCharacterDraftResponse,
  );
}

export function generateCampaignPlayPlayerDraft(
  campaignId: string,
  request: CampaignPlayGeneratePlayerDraftRequest,
): Promise<CampaignPlayCharacterDraftResponse> {
  return requestJson(
    campaignPath(campaignId, "/player/drafts/generate"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    200,
    parseCharacterDraftResponse,
  );
}

export function researchCampaignPlayPlayer(
  campaignId: string,
  request: CampaignPlayResearchPlayerRequest,
): Promise<CampaignPlayCharacterResearchResponse> {
  return requestJson(
    campaignPath(campaignId, "/player/research"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    200,
    parseCharacterResearchResponse,
  );
}

export function putCampaignPlayPlayer(
  campaignId: string,
  request: CampaignPlayPutPlayerRequest,
): Promise<CampaignPlayPutPlayerResponse> {
  return requestJson(
    campaignPath(campaignId, "/player"),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    200,
    parsePutPlayerResponse,
  );
}

export function admitCampaignPlayOpening(
  campaignId: string,
  request: CampaignPlayOpeningAdmissionRequest,
): Promise<CampaignPlayTurnAdmissionResponse> {
  return requestJson(
    campaignPath(campaignId, "/opening"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    202,
    parseTurnAdmissionResponse,
  );
}

export function admitCampaignPlayTurn(
  campaignId: string,
  request: CampaignPlayTurnAdmissionRequest,
): Promise<CampaignPlayTurnAdmissionResponse> {
  return requestJson(
    campaignPath(campaignId, "/turns"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    202,
    parseTurnAdmissionResponse,
  );
}

export function loadCampaignPlayTurn(
  campaignId: string,
  turnId: string,
): Promise<CampaignPlayTurnReadResponse> {
  return requestJson(
    campaignPath(campaignId, `/turns/${encodeURIComponent(turnId)}`),
    { method: "GET" },
    200,
    (value) => {
      const parsed = parseTurnReadResponse(value);
      return parsed?.campaignId === campaignId && parsed.turn.turnId === turnId
        ? parsed
        : null;
    },
  );
}

export async function streamCampaignPlayTurnEvents(
  campaignId: string,
  turnId: string,
  options: CampaignPlayTurnEventStreamOptions,
): Promise<CampaignPlayTurnEventStreamResult> {
  if (!isNonnegativeInteger(options.afterSequence)) throw invalidResponse(0);
  const response = await fetch(
    campaignPath(
      campaignId,
      `/turns/${encodeURIComponent(turnId)}/events?afterSequence=${options.afterSequence}`,
    ),
    { method: "GET", signal: options.signal },
  );
  if (!response.ok) {
    const payload = await readJson(response);
    throwForErrorPayload(payload, response.status);
  }
  if (response.status !== 200) throw invalidResponse(response.status);
  const contentType = response.headers.get("content-type");
  if (
    contentType === null ||
    contentType.split(";", 1)[0]?.trim().toLowerCase() !== "text/event-stream" ||
    response.body === null
  ) {
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
  let terminalEvent: TerminalTurnEvent | null = null;

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
    const event = parseSseEvent(payload, turnId);
    if (event === null || eventId !== String(event.sequence) || eventName !== event.type) {
      throw invalidResponse(response.status);
    }
    const canonicalEvent = JSON.stringify(event);
    const priorEvent = seen.get(event.sequence);
    if (priorEvent !== undefined) {
      if (priorEvent !== canonicalEvent) throw invalidResponse(response.status);
      return;
    }
    if (terminalEvent !== null || event.sequence !== lastSequence + 1) {
      throw invalidResponse(response.status);
    }
    seen.set(event.sequence, canonicalEvent);
    lastSequence = event.sequence;
    options.onEvent(event);
    if (
      event.type === "turn.interrupted" ||
      event.type === "turn.completed" ||
      event.type === "turn.failed"
    ) {
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

  const consumeBufferedLines = () => {
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      consumeLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.value !== undefined) {
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
    } else if (chunk.done) {
      buffer += decoder.decode();
    }
    consumeBufferedLines();
    if (chunk.done) break;
  }
  if (buffer.length > 0 || eventId !== null || eventName !== null || dataLines.length > 0) {
    throw invalidResponse(response.status);
  }
  return { lastSequence, terminalEvent };
}

export function resumeCampaignPlayTurn(
  campaignId: string,
  turnId: string,
  request: CampaignPlayResumeTurnRequest,
): Promise<CampaignPlayTurnAdmissionResponse> {
  return requestJson(
    campaignPath(campaignId, `/turns/${encodeURIComponent(turnId)}/resume`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    202,
    parseTurnAdmissionResponse,
  );
}

export function recoverCampaignPlayNarration(
  campaignId: string,
  turnId: string,
  request: CampaignPlayNarrationRecoveryRequest,
): Promise<CampaignPlayNarrationRecoveryResponse> {
  return requestJson(
    campaignPath(campaignId, `/turns/${encodeURIComponent(turnId)}/narration/recover`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    202,
    parseNarrationRecoveryResponse,
  );
}

export function loadCampaignPlayJournal(
  campaignId: string,
  request: CampaignPlayJournalRequest,
): Promise<CampaignPlayJournalPage> {
  return requestJson(
    campaignPath(campaignId, `/journal?cursor=${request.cursor}&limit=${request.limit}`),
    { method: "GET" },
    200,
    (value) => {
      const parsed = parseJournalPage(value);
      return parsed?.campaignId === campaignId ? parsed : null;
    },
  );
}
