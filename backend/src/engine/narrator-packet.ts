import type { NarrativeOutcomeBounds } from "./combat-envelope.js";
import type { BridgeLookupToolName } from "./bridge-candidate-tools.js";
import type { NarrationClaimKind } from "./narration-grounding-guard.js";
import type { SceneActor, SceneFrame, SceneFramePlayerInventoryItem } from "./scene-frame.js";
import type { ToolResult } from "./tool-executor.js";
import { isObservationToolResult } from "./tool-result.js";
import type { RuntimeToolName } from "./tool-schemas.js";
import { isRuntimeToolName, runtimeToolHasRole } from "./tool-contracts.js";
import { sanitizeModelFacingConversationText } from "./model-facing-conversation.js";
import { sanitizeModelFacingText } from "./model-facing-ref-safety.js";
import { sourceBoundaryTermIsLeak } from "./source-boundary.js";
import {
  buildContextBudgetTrace,
  type ContextBudgetTrace,
} from "./context-budget-trace.js";
import { getFrameBudgetSpec } from "./frame-budget.js";

export type CanonicalTurnPacketEventKind =
  | "player_action"
  | "oracle_outcome"
  | "scene_response"
  | "tool_result"
  | "environment";

export type CanonicalTurnPacketResponseKind =
  | "spoken"
  | "gesture"
  | "movement"
  | "environment"
  | "silence"
  | "system";

export type CanonicalTurnPacketResponseEvidenceAuthority =
  | "backend_fact"
  | "model_guidance";

export interface CanonicalTurnPacketNarratorFacts {
  anchorEventId: string;
  eventIds: string[];
  responseIds: string[];
  actionIds: string[];
  toolResultRefs: Array<{
    actionId: string;
    toolName: CanonicalTurnPacketToolName;
  }>;
}

export type CanonicalTurnKind =
  | "status_read"
  | "dialogue_outcome"
  | "world_fact"
  | "scene_beat"
  | "state_mutation"
  | "combat_transition"
  | "direct_noop";

export type CanonicalTurnResolutionState =
  | "observation_grounded"
  | "mutated"
  | "explicit_no_change"
  | "explicit_no_combat";

export interface CanonicalTurnResolution {
  kind: CanonicalTurnKind;
  resolutionState: CanonicalTurnResolutionState;
  combatIntent: boolean;
  evidenceIds: string[];
  consequenceIds: string[];
  explicitNoCombatEvidenceIds: string[];
  toolNames: string[];
}

export type CanonicalTurnPacketToolName = RuntimeToolName | BridgeLookupToolName;

export interface CanonicalTurnPacketActionResult {
  order: number;
  actionId: string;
  actionRef: string;
  actorId: string;
  toolName: CanonicalTurnPacketToolName;
  input: unknown;
  args: unknown;
  result: ToolResult;
  summary?: string;
}

export interface CanonicalTurnPacketEvent {
  id: string;
  actorId: string;
  kind: CanonicalTurnPacketEventKind;
  summary: string;
  perceivableByPlayer: boolean;
  actionId?: string;
  toolResultRef?: {
    actionId: string;
    toolName: CanonicalTurnPacketToolName;
  };
}

export interface CanonicalTurnPacketResponse {
  id: string;
  actorId: string;
  responseKind: CanonicalTurnPacketResponseKind;
  eventId: string;
  summary: string;
  visibleToPlayer: boolean;
  targetIds?: string[];
  evidenceAuthority?: CanonicalTurnPacketResponseEvidenceAuthority;
}

export interface CanonicalTurnPacketEffect {
  id: string;
  actionId?: string;
  actorId?: string;
  toolName?: CanonicalTurnPacketToolName;
  summary: string;
  perceivableByPlayer: boolean;
  toolResult?: ToolResult;
}

export type NarratorPacketObservationAtomKind =
  | "actor"
  | "route"
  | "object"
  | "barrier"
  | "fact"
  | "absence";

export interface NarratorPacketObservationAtom {
  id: string;
  actionId: string;
  toolName: CanonicalTurnPacketToolName;
  kind: NarratorPacketObservationAtomKind;
  summary: string;
  claimSupport: NarrationClaimKind[];
  sourcePath: string;
}

export interface NarratorPacketObservation {
  id: string;
  actionId: string;
  toolName: CanonicalTurnPacketToolName;
  summary: string;
  atoms: NarratorPacketObservationAtom[];
}

export interface CanonicalTurnPacket {
  campaignId: string;
  tick: number;
  playerAction: string;
  oracleOutcome: string | null;
  turnResolution?: CanonicalTurnResolution;
  narratorFacts: CanonicalTurnPacketNarratorFacts;
  anchorEvent: CanonicalTurnPacketEvent;
  events: CanonicalTurnPacketEvent[];
  responses: CanonicalTurnPacketResponse[];
  effects: CanonicalTurnPacketEffect[];
  actionResults: CanonicalTurnPacketActionResult[];
  guardrails: string[];
  controlReturnReason: string;
  outcomeBounds?: NarrativeOutcomeBounds;
}

export interface NarratorPacketActor {
  id: string;
  label: string;
  type: SceneActor["type"];
}

export interface NarratorPacketHintSignalSourceRef {
  id: string;
  kind: "hint_signal" | "world_thread_signal";
}

export interface NarratorPacketInventoryItem {
  id: string;
  itemId: string;
  label: string;
  tags: string[];
  equipState: "carried" | "equipped";
  equippedSlot: string | null;
  isSignature: boolean;
}

export type NarratorPacketEvidenceCategory =
  | "player_action_request"
  | "oracle_outcome"
  | "anchor_event"
  | "committed_event"
  | "perceivable_response"
  | "perceivable_effect"
  | "observation_result"
  | "visible_actor"
  | "current_inventory_status"
  | "hint_signal"
  | "world_thread_signal"
  | "guardrail"
  | "control_return"
  | "tool_result";

export type NarratorPacketPrecisionFactKind =
  | "claim"
  | "quote"
  | "summary"
  | "state_effect"
  | "subject";

export interface NarratorPacketPrecisionFact {
  kind: NarratorPacketPrecisionFactKind;
  value: string;
  sourcePath: string;
  claimKind?: string;
  polarity?: string;
  exhaustive?: boolean;
}

export interface NarratorPacketEvidence {
  id: string;
  category: NarratorPacketEvidenceCategory;
  summary: string;
  sourceId?: string;
  summaryBackendFact?: boolean;
  claimSupport?: string[];
  precisionFacts?: NarratorPacketPrecisionFact[];
}

export type NarratorPacketRedactionReason =
  | "hidden_event"
  | "hidden_response"
  | "failed_effect"
  | "unreferenced_effect"
  | "hidden_effect"
  | "private_actor_name"
  | "forbidden_fact_marker"
  | "forbidden_private_term"
  | "uncommitted_proposal";

export interface NarratorPacketRedactionAudit {
  hiddenEventCount: number;
  hiddenResponseCount: number;
  failedEffectCount: number;
  unreferencedEffectCount: number;
  hiddenEffectCount: number;
  privateActorNameCount: number;
  forbiddenFactMarkerCount: number;
  forbiddenPrivateTermCount: number;
  uncommittedProposalCount: number;
  retainedSourceRefCount: number;
  retainedEvidenceCount: number;
  excludedReasons: Record<NarratorPacketRedactionReason, number>;
}

export interface NarratorPacketSourceLinkedSummary {
  id: string;
  summary: string;
  sourceIds: string[];
  summarizedItemCount: number;
}

export interface NarratorPacket {
  campaignId: string;
  tick: number;
  postNarrationTargetTick?: number;
  playerAction: string;
  oracleOutcome: string | null;
  anchorEvent: CanonicalTurnPacketEvent;
  perceivableEvents: CanonicalTurnPacketEvent[];
  perceivableResponses: CanonicalTurnPacketResponse[];
  perceivableEffects: CanonicalTurnPacketEffect[];
  perceivableObservations?: NarratorPacketObservation[];
  visibleActors: NarratorPacketActor[];
  currentInventory?: NarratorPacketInventoryItem[];
  hintSignals: string[];
  hintSignalSourceRefs?: NarratorPacketHintSignalSourceRef[];
  evidenceLedger?: NarratorPacketEvidence[];
  guardrails: string[];
  controlReturnReason: string;
  allowedVisibleActorNames: string[];
  forbiddenActorNames: string[];
  forbiddenFactMarkers: string[];
  forbiddenPrivateTerms: string[];
  redactionAudit?: NarratorPacketRedactionAudit;
  sourceLinkedSummaries?: NarratorPacketSourceLinkedSummary[];
  contextBudgetTrace?: ContextBudgetTrace;
  canonicalTurnPacket: CanonicalTurnPacket;
}

export interface BuildNarratorPacketArgs {
  frame: SceneFrame;
  canonicalTurnPacket: CanonicalTurnPacket;
  forbiddenFactMarkers?: string[];
  forbiddenPrivateTerms?: string[];
  uncommittedProposalCandidates?: readonly NarratorPacketProposalCandidate[];
}

export interface NarratorPacketProposalCandidate {
  id: string;
  status?: string;
  hidden?: boolean;
}

export class NarratorPacketPromptSafetyError extends Error {
  constructor(
    message: string,
    public readonly term: string,
  ) {
    super(message);
    this.name = "NarratorPacketPromptSafetyError";
  }
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function boundedSummary(value: string, maxChars: number): string {
  const text = value.trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function collectVisibleActors(frame: SceneFrame): NarratorPacketActor[] {
  return [...frame.roster.active, ...frame.roster.support]
    .filter((actor) => actor.awareness === "clear")
    .map((actor) => ({
      id: actor.id,
      label: actor.label,
      type: actor.type,
    }));
}

function collectCurrentInventory(
  frame: Pick<SceneFrame, "playerInventory">,
): NarratorPacketInventoryItem[] {
  return (frame.playerInventory ?? []).map((item: SceneFramePlayerInventoryItem) => ({
    id: item.id,
    itemId: item.itemId,
    label: item.label,
    tags: [...item.tags],
    equipState: item.equipState,
    equippedSlot: item.equippedSlot,
    isSignature: item.isSignature,
  }));
}

function collectHintSignals(frame: SceneFrame): string[] {
  return uniqueStrings([
    ...frame.perception.playerAwarenessHints,
    ...frame.roster.support
      .filter((actor) => actor.awareness === "hint")
      .map((actor) => actor.awarenessHint ?? null),
    ...frame.recentEvents
      .filter((event) => event.source === "world_thread_signal" && event.perceivableByPlayer)
      .map((event) => event.summary),
  ]);
}

function collectHintSignalSourceRefs(frame: SceneFrame): NarratorPacketHintSignalSourceRef[] {
  const worldThreadSignals = frame.recentEvents
    .filter((event) => event.source === "world_thread_signal" && event.perceivableByPlayer)
    .map((event) => ({
      id: event.id,
      kind: "world_thread_signal" as const,
    }));
  return [
    ...frame.perception.playerAwarenessHints.map((_, index) => ({
      id: `awareness:${index + 1}`,
      kind: "hint_signal" as const,
    })),
    ...frame.roster.support
      .filter((actor) => actor.awareness === "hint")
      .map((actor) => ({
        id: actor.id,
        kind: "hint_signal" as const,
      })),
    ...worldThreadSignals,
  ];
}

function evidenceId(category: NarratorPacketEvidenceCategory, id: string): string {
  return `${category}:${id}`;
}

const NON_NARRATIVE_INVENTORY_TAGS = new Set(["starting-loadout", "equipped", "carried"]);

function formatInventoryTagForPrompt(tag: string): string {
  let formatted = "";
  let pendingSpace = false;

  for (const char of tag) {
    if (char === "_" || char === "-") {
      pendingSpace = formatted.length > 0;
      continue;
    }
    if (pendingSpace) {
      formatted += " ";
      pendingSpace = false;
    }
    formatted += char;
  }

  return formatted.trim();
}

function playerVisibleInventoryStates(tags: readonly string[]): string[] {
  return uniqueStrings(tags)
    .filter((tag) => !NON_NARRATIVE_INVENTORY_TAGS.has(tag.toLowerCase()))
    .map((tag) => formatInventoryTagForPrompt(tag));
}

function joinNaturalList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function formatEquippedSlotForPrompt(slot: string | null): string | null {
  const formatted = slot ? formatInventoryTagForPrompt(slot) : "";
  if (!formatted || formatted.toLowerCase() === "equipped") {
    return null;
  }
  return formatted;
}

function formatInventoryItemStatusPhrase(item: NarratorPacketInventoryItem): string {
  const equippedSlot = formatEquippedSlotForPrompt(item.equippedSlot);
  if (item.equipState === "equipped") {
    return equippedSlot
      ? `${item.label} at your ${equippedSlot}`
      : `${item.label} ready to hand`;
  }
  return `${item.label} with you`;
}

function formatInventoryItemVisibleStatus(item: NarratorPacketInventoryItem): string | null {
  const tags = playerVisibleInventoryStates(item.tags);
  return tags.length > 0
    ? `${item.label} shows ${joinNaturalList(tags)}.`
    : null;
}

export function formatInventoryStatusSummary(item: NarratorPacketInventoryItem): string {
  const visibleStatus = formatInventoryItemVisibleStatus(item);
  return [
    `You have ${formatInventoryItemStatusPhrase(item)}.`,
    visibleStatus,
  ].filter((part): part is string => Boolean(part)).join(" ");
}

export function formatCurrentInventoryStatusSummary(
  items: readonly NarratorPacketInventoryItem[],
): string | null {
  if (items.length === 0) {
    return null;
  }
  const inventoryLine = `You have ${joinNaturalList(items.map(formatInventoryItemStatusPhrase))}.`;
  const visibleStatuses = items
    .map(formatInventoryItemVisibleStatus)
    .filter((part): part is string => Boolean(part));
  return [inventoryLine, ...visibleStatuses].join(" ");
}

function addPrecisionFact(
  facts: NarratorPacketPrecisionFact[],
  fact: NarratorPacketPrecisionFact,
): void {
  const value = safePrecisionFactText(fact.value);
  if (!value) return;
  if (facts.some((existing) =>
    existing.kind === fact.kind
    && existing.value === value
    && existing.sourcePath === fact.sourcePath
  )) {
    return;
  }
  facts.push({ ...fact, value });
}

function collectClaimPrecisionFacts(
  claims: readonly unknown[],
): NarratorPacketPrecisionFact[] {
  const facts: NarratorPacketPrecisionFact[] = [];
  claims.forEach((claim, index) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return;
    const record = claim as Record<string, unknown>;
    const claimKind = readRecordString(record, "claimKind") ?? "other";
    const polarity = readRecordString(record, "polarity") ?? "states";
    const subjectText = readRecordString(record, "subjectText");
    const summary = readRecordString(record, "summary");
  if (subjectText) {
    addPrecisionFact(facts, {
      kind: "subject",
      value: subjectText,
      sourcePath: `claims.${index}.subjectText`,
        claimKind,
        polarity,
      exhaustive: false,
    });
  }
  if (summary) {
    addPrecisionFact(facts, {
      kind: "claim",
      value: summary,
      sourcePath: `claims.${index}.summary`,
      claimKind,
        polarity,
        exhaustive: true,
      });
    }
  });
  return facts;
}

function collectToolResultPrecisionFacts(
  result: unknown,
  toolName?: CanonicalTurnPacketToolName,
): NarratorPacketPrecisionFact[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return [];
  }
  const record = result as Record<string, unknown>;
  const facts: NarratorPacketPrecisionFact[] = [];
  const summary = readRecordString(record, "summary");
  const quote = readRecordString(record, "quote");
  const speaker = readRecordString(record, "speakerRef");
  const summaryIsNarrativeSurface =
    toolName !== "record_dialogue_outcome"
    && toolName !== "record_world_fact";
  if (summary && summaryIsNarrativeSurface) {
    addPrecisionFact(facts, {
      kind: "summary",
      value: summary,
      sourcePath: "summary",
      exhaustive: false,
    });
  }
  if (quote) {
    const quoteText = toolName === "record_dialogue_outcome" && speaker
      ? `${speaker} says, ${quote}`
      : quote;
    addPrecisionFact(facts, {
      kind: "quote",
      value: quoteText,
      sourcePath: "quote",
      exhaustive: true,
    });
  }
  for (const fact of collectClaimPrecisionFacts(readRecordArray(record, "claims"))) {
    addPrecisionFact(facts, fact);
  }
  return facts;
}

function collectEffectPrecisionFacts(
  effect: CanonicalTurnPacketEffect,
): NarratorPacketPrecisionFact[] {
  const result = effect.toolResult?.success === true ? effect.toolResult.result : null;
  return [
    ...collectToolResultPrecisionFacts(result, effect.toolName),
    ...collectStructuralEffectNarratableFacts(effect, result),
  ];
}

function withPrecisionFacts(
  entry: NarratorPacketEvidence,
  precisionFacts: readonly NarratorPacketPrecisionFact[],
): NarratorPacketEvidence {
  return precisionFacts.length > 0
    ? { ...entry, precisionFacts: [...precisionFacts] }
    : entry;
}

const SUPPORT_ONLY_STRUCTURAL_EFFECT_SUMMARY_TOOLS = new Set<CanonicalTurnPacketToolName>([
  "advance_time",
  "move_to",
  "move_actor",
  "reveal_location",
  "create_minor_poi",
]);

function isPlayerMoveActorRef(value: string | null, result: unknown): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "player" || normalized === "current_player") {
    return true;
  }
  return readRecordStringArray(result, "actorRefs")
    .map((ref) => ref.trim().toLowerCase())
    .includes("current_player");
}

function collectStructuralEffectNarratableFacts(
  effect: CanonicalTurnPacketEffect,
  result: unknown,
): NarratorPacketPrecisionFact[] {
  const facts: NarratorPacketPrecisionFact[] = [];
  const addSummaryFact = (value: string | null, sourcePath: string, claimKind?: NarrationClaimKind) => {
    if (!value) return;
    addPrecisionFact(facts, {
      kind: "summary",
      value,
      sourcePath,
      claimKind,
      exhaustive: true,
    });
  };

  switch (effect.toolName) {
    case "advance_time": {
      const minutes = readRecordNumber(result, "minutes");
      const reason = trimTrailingSentencePunctuation(readRecordString(result, "reason") ?? "");
      if (minutes !== null && reason) {
        addSummaryFact(formatAdvanceTimeReason(reason, minutes), "toolResult.result.reason", "playable_beat");
      } else if (minutes !== null) {
        addSummaryFact(`${formatElapsedWorldMinutes(minutes)}.`, "toolResult.result.minutes", "playable_beat");
      } else {
        addSummaryFact("In-world time passes.", "toolResult.result", "playable_beat");
      }
      break;
    }
    case "move_to": {
      const locationName = readRecordString(result, "locationName");
      addSummaryFact(
        locationName ? `You arrive at ${locationName}.` : null,
        "toolResult.result.locationName",
        "location_change",
      );
      break;
    }
    case "move_actor": {
      const locationName = readRecordString(result, "locationName");
      if (!locationName) break;
      const actorRef = readRecordString(result, "actorRef");
      const actorText = actorRef && !isPlayerMoveActorRef(actorRef, result)
        ? `${actorRef} arrives`
        : "You arrive";
      addSummaryFact(`${actorText} at ${locationName}.`, "toolResult.result.locationName", "location_change");
      break;
    }
    case "reveal_location": {
      const name = readRecordString(result, "name");
      const connectedTo = readRecordString(result, "connectedTo");
      if (name && connectedTo) {
        addSummaryFact(`${name} is reachable from ${connectedTo}.`, "toolResult.result.name", "route_status");
      } else if (name) {
        addSummaryFact(`${name} is reachable.`, "toolResult.result.name", "route_status");
      }
      break;
    }
    case "create_minor_poi": {
      const name = readRecordString(result, "name");
      const connectedTo = readRecordString(result, "connectedTo");
      const description = readRecordString(result, "description");
      if (description) {
        addSummaryFact(ensureSentencePunctuation(description), "toolResult.result.description", "playable_beat");
      }
      if (name && connectedTo) {
        addSummaryFact(`${name} is available near ${connectedTo}.`, "toolResult.result.name", "route_status");
      } else if (name) {
        addSummaryFact(`${name} is available nearby.`, "toolResult.result.name", "route_status");
      }
      break;
    }
    default:
      break;
  }

  return facts;
}

function effectSummaryContributesBackendFact(effect: CanonicalTurnPacketEffect): boolean {
  if (effect.toolName && SUPPORT_ONLY_STRUCTURAL_EFFECT_SUMMARY_TOOLS.has(effect.toolName)) {
    return false;
  }
  return effect.toolName !== "record_dialogue_outcome"
    && effect.toolName !== "record_world_fact";
}

function collectEvidenceLedger(args: {
  packet: CanonicalTurnPacket;
  visibleActors: NarratorPacketActor[];
  currentInventory: NarratorPacketInventoryItem[];
  perceivableEvents: CanonicalTurnPacketEvent[];
  perceivableResponses: CanonicalTurnPacketResponse[];
  perceivableEffects: CanonicalTurnPacketEffect[];
  perceivableObservations: NarratorPacketObservation[];
  hintSignals: string[];
  hintSignalSourceRefs: NarratorPacketHintSignalSourceRef[];
}): NarratorPacketEvidence[] {
  const entries: NarratorPacketEvidence[] = [];
  const add = (entry: NarratorPacketEvidence) => entries.push(entry);

  add({
    id: evidenceId("player_action_request", "player-action"),
    category: "player_action_request",
    summary: args.packet.playerAction,
    sourceId: "player-action",
  });
  if (args.packet.oracleOutcome) {
    add({
      id: evidenceId("oracle_outcome", "oracle-outcome"),
      category: "oracle_outcome",
      summary: args.packet.oracleOutcome,
      sourceId: "oracle-outcome",
    });
  }
  add({
    id: evidenceId("anchor_event", args.packet.anchorEvent.id),
    category: "anchor_event",
    summary: args.packet.anchorEvent.summary,
    sourceId: args.packet.anchorEvent.id,
  });
  for (const event of args.perceivableEvents) {
    add({
      id: evidenceId("committed_event", event.id),
      category: "committed_event",
      summary: event.summary,
      sourceId: event.id,
    });
  }
  for (const response of args.perceivableResponses) {
    add({
      id: evidenceId("perceivable_response", response.id),
      category: "perceivable_response",
      summary: response.summary,
      sourceId: response.id,
    });
  }
  for (const effect of args.perceivableEffects) {
    const precisionFacts = collectEffectPrecisionFacts(effect);
    add(withPrecisionFacts({
      id: evidenceId("perceivable_effect", effect.id),
      category: "perceivable_effect",
      summary: effect.summary,
      sourceId: effect.id,
      summaryBackendFact: effectSummaryContributesBackendFact(effect),
    }, precisionFacts));
    if (effect.actionId && effect.toolName) {
      add(withPrecisionFacts({
        id: evidenceId("tool_result", effect.actionId),
        category: "tool_result",
        summary: `The accepted action result supports this player-perceivable effect: ${effect.summary}`,
        sourceId: effect.actionId,
        summaryBackendFact: false,
      }, precisionFacts));
    }
  }
  for (const observation of args.perceivableObservations) {
    for (const atom of observation.atoms) {
      add({
        id: evidenceId("observation_result", `${observation.actionId}:${atom.id}`),
        category: "observation_result",
        summary: atom.summary,
        sourceId: observation.actionId,
        claimSupport: atom.claimSupport,
      });
    }
  }
  for (const actor of args.visibleActors) {
    const isPlayer = actor.type === "player";
    add({
      id: evidenceId("visible_actor", actor.id),
      category: "visible_actor",
      summary: isPlayer ? actor.label : `${actor.label} is present in the scene.`,
      sourceId: actor.id,
      summaryBackendFact: false,
    });
  }
  const currentInventorySummary = formatCurrentInventoryStatusSummary(args.currentInventory);
  if (currentInventorySummary) {
    add({
      id: evidenceId("current_inventory_status", "current"),
      category: "current_inventory_status",
      summary: currentInventorySummary,
      sourceId: "current",
      summaryBackendFact: true,
    });
  }
  for (const item of args.currentInventory) {
    add({
      id: evidenceId("current_inventory_status", item.itemId),
      category: "current_inventory_status",
      summary: formatInventoryStatusSummary(item),
      sourceId: item.itemId,
      summaryBackendFact: false,
    });
  }
  for (let index = 0; index < args.hintSignals.length; index += 1) {
    const source = args.hintSignalSourceRefs[index];
    const category = source?.kind ?? "hint_signal";
    const sourceId = source?.id ?? `${index + 1}`;
    add({
      id: evidenceId(category, sourceId),
      category,
      summary: args.hintSignals[index]!,
      sourceId,
    });
  }
  for (let index = 0; index < args.packet.guardrails.length; index += 1) {
    add({
      id: evidenceId("guardrail", `${index + 1}`),
      category: "guardrail",
      summary: args.packet.guardrails[index]!,
      sourceId: `${index + 1}`,
    });
  }
  add({
    id: evidenceId("control_return", "current"),
    category: "control_return",
    summary: args.packet.controlReturnReason,
    sourceId: "current",
  });

  return uniqueById(entries);
}

function collectForbiddenActors(frame: SceneFrame): SceneActor[] {
  const forbiddenIds = new Set(frame.perception.forbiddenActorIds ?? []);
  return [...frame.roster.active, ...frame.roster.support, ...frame.roster.background]
    .filter((actor) => actor.id !== frame.playerActorId)
    .filter((actor) => actor.awareness !== "clear" || forbiddenIds.has(actor.id));
}

function collectForbiddenActorNames(frame: SceneFrame): string[] {
  return uniqueStrings([
    ...(frame.perception.forbiddenActorLabels ?? []),
    ...collectForbiddenActors(frame).map((actor) => actor.label),
  ]);
}

function collectForbiddenFactMarkers(
  frame: SceneFrame,
  explicitMarkers: readonly string[] = [],
): string[] {
  return uniqueStrings([
    ...explicitMarkers,
    ...collectForbiddenActors(frame).flatMap((actor) => [
      `hidden-actor:${actor.id}`,
      actor.actorId ? `hidden-actor:${actor.actorId}` : null,
    ]),
    ...(frame.perception.forbiddenActorIds ?? []).map((id) => `hidden-actor:${id}`),
  ]);
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    if (seen.has(value.id)) {
      continue;
    }
    seen.add(value.id);
    result.push(value);
  }

  return result;
}

function readRecordString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim().length > 0
    ? field.trim()
    : null;
}

function readRecordStringArray(value: unknown, key: string): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field)
    ? field.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function readRecordNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" && Number.isFinite(field)
    ? field
    : null;
}

function readRecordArray(value: unknown, key: string): Record<string, unknown>[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field)
    ? field.filter((entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function summarizeFirstListEntry(values: readonly string[], fallback: string): string {
  const first = values[0]?.trim();
  if (!first) return fallback;
  return first.length > 180 ? `${first.slice(0, 177)}...` : first;
}

function toolField(input: unknown, args: unknown, key: string): string | null {
  return readRecordString(input, key) ?? readRecordString(args, key);
}

function toolNumber(input: unknown, args: unknown, key: string): number | null {
  return readRecordNumber(input, key) ?? readRecordNumber(args, key);
}

function toolStringArray(input: unknown, args: unknown, key: string): string[] {
  return readRecordStringArray(input, key).length > 0
    ? readRecordStringArray(input, key)
    : readRecordStringArray(args, key);
}

function formatElapsedWorldMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) {
    return "time passes";
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "1 day passes" : `${days} days pass`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour passes" : `${hours} hours pass`;
  }
  return minutes === 1 ? "1 minute passes" : `${minutes} minutes pass`;
}

function formatWorldDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) {
    return "some time";
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

function normalizeDurationComparisonText(value: string): string {
  let normalized = "";
  let pendingSpace = false;
  for (const char of value.trim().toLowerCase()) {
    if (char.trim() === "") {
      pendingSpace = normalized.length > 0;
      continue;
    }
    if (pendingSpace) {
      normalized += " ";
      pendingSpace = false;
    }
    normalized += char;
  }
  return normalized;
}

function reasonAlreadyNamesDuration(reason: string, minutes: number): boolean {
  const normalizedReason = normalizeDurationComparisonText(reason);
  return normalizedReason.includes(normalizeDurationComparisonText(formatWorldDuration(minutes)))
    || normalizedReason.includes(normalizeDurationComparisonText(formatElapsedWorldMinutes(minutes)));
}

const ELAPSED_BEAT_VERB_PATTERN =
  /\b(?:asks|answers|checks|compares|copies|examines|follows|guides|listens|marks|moves|reads|records|rests|searches|speaks|steps|studies|travels|waits|walks|watches|writes)\b/iu;

function selectElapsedBeatClause(reason: string): string {
  const clauses = reason.split(/\s*;\s*/u)
    .map((clause) => trimTrailingSentencePunctuation(clause))
    .filter((clause) => clause.length > 0);
  return clauses[0] ?? reason;
}

function shouldRenderAsElapsedBeat(reason: string): boolean {
  const clause = selectElapsedBeatClause(reason);
  return /\bwhile\b/iu.test(clause) || ELAPSED_BEAT_VERB_PATTERN.test(clause.split(/\s+/u).slice(0, 6).join(" "));
}

function formatAdvanceTimeReason(reason: string, minutes: number): string {
  if (reasonAlreadyNamesDuration(reason, minutes)) {
    return `${reason}.`;
  }
  if (shouldRenderAsElapsedBeat(reason)) {
    return `${formatElapsedWorldMinutes(minutes)} as ${selectElapsedBeatClause(reason)}.`;
  }
  return `${reason} takes ${formatWorldDuration(minutes)}.`;
}

function ensureSentencePunctuation(value: string): string {
  const trimmed = value.trim();
  return /[.!?][)"'\]]*$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function trimTrailingSentencePunctuation(value: string): string {
  let result = value.trim();
  while (
    result.endsWith(".")
    || result.endsWith("!")
    || result.endsWith("?")
    || result.endsWith(";")
    || result.endsWith(":")
  ) {
    result = result.slice(0, -1).trimEnd();
  }
  return result;
}

function toolRecordArray(input: unknown, args: unknown, key: string): Record<string, unknown>[] {
  const inputArray = readRecordArray(input, key);
  return inputArray.length > 0 ? inputArray : readRecordArray(args, key);
}

function candidateLabelsFromResult(result: unknown, key: string): string[] {
  return readRecordArray(result, key)
    .map((candidate) =>
      readRecordString(candidate, "label")
        ?? readRecordString(candidate, "name")
        ?? readRecordString(candidate, "summary"))
    .filter((label): label is string => Boolean(label))
    .slice(0, 3);
}

function formatLabelList(labels: readonly string[]): string {
  return labels.join(", ");
}

const MODEL_ONLY_ALIAS_PREFIXES = new Set([
  "actor",
  "npc",
  "player",
  "loc",
  "location",
  "scene",
  "route",
  "movement",
  "item",
  "faction",
  "event",
  "knowledge",
  "tool",
  "source",
  "candidate",
  "support",
]);

function isPositiveIntegerText(value: string): boolean {
  return value.length > 0
    && [...value].every((char) => char >= "0" && char <= "9")
    && Number.parseInt(value, 10) > 0;
}

function isModelOnlyAlias(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  const separatorIndex = trimmed.indexOf("_");
  if (separatorIndex <= 0) return false;
  const prefix = trimmed.slice(0, separatorIndex);
  const numericTail = trimmed.slice(separatorIndex + 1);
  return MODEL_ONLY_ALIAS_PREFIXES.has(prefix)
    && isPositiveIntegerText(numericTail)
    && !numericTail.includes("_");
}

function safeStructuralSummaryText(value: string | null | undefined, fallback: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (isModelOnlyAlias(trimmed)) return fallback;
  const sanitized = sanitizeModelFacingConversationText(trimmed, { maxChars: 140 });
  if (!sanitized || sanitized === "[backend ref hidden]") return fallback;
  return sanitized;
}

function safePrecisionFactText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || isModelOnlyAlias(trimmed)) return null;
  const sanitized = sanitizeModelFacingConversationText(trimmed, { maxChars: 2000 });
  if (!sanitized || sanitized === "[backend ref hidden]") return null;
  return sanitized.length <= 640 ? sanitized : null;
}

function safeStructuralSummaryList(values: readonly string[], fallback: string): string[] {
  return values
    .map((value) => safeStructuralSummaryText(value, fallback))
    .filter((value): value is string => Boolean(value));
}

function formatStructuralClaim(claim: Record<string, unknown>): string {
  const claimKind = readRecordString(claim, "claimKind") ?? "claim";
  const polarity = readRecordString(claim, "polarity") ?? "states";
  const subject =
    safeStructuralSummaryText(readRecordString(claim, "subjectText"), "described subject")
    ?? (readRecordString(claim, "subjectRef") ? "referenced subject" : null);
  return subject
    ? `${claimKind}/${polarity} subject=${subject}`
    : `${claimKind}/${polarity}`;
}

function summarizeDialogueOutcomeStructurally(input: {
  acceptedResult: unknown;
  toolInput: unknown;
  toolArgs: unknown;
}): string {
  const { acceptedResult, toolInput, toolArgs } = input;
  const acceptedField = (key: string): string | null => readRecordString(acceptedResult, key);
  const field = (key: string): string | null =>
    acceptedField(key) ?? toolField(toolInput, toolArgs, key);
  const claims = readRecordArray(acceptedResult, "claims").length > 0
    ? readRecordArray(acceptedResult, "claims")
    : toolRecordArray(toolInput, toolArgs, "claims");
  const addresseeRefs = readRecordStringArray(acceptedResult, "addresseeRefs").length > 0
    ? readRecordStringArray(acceptedResult, "addresseeRefs")
    : toolStringArray(toolInput, toolArgs, "addresseeRefs");
  const sourceRefs = readRecordStringArray(acceptedResult, "sourceRefs").length > 0
    ? readRecordStringArray(acceptedResult, "sourceRefs")
    : toolStringArray(toolInput, toolArgs, "sourceRefs");
  const parts = [
    `Dialogue outcome: outcome=${field("outcomeKind") ?? "unknown"}`,
    `topic=${field("topicKind") ?? "unknown"}`,
    `authority=${field("authorityKind") ?? "unknown"}`,
    `truth=${field("truthStatus") ?? "unknown"}`,
    `durability=${field("durability") ?? "unknown"}`,
    field("speakerRef")
      ? `speaker=${safeStructuralSummaryText(field("speakerRef"), "referenced speaker")}`
      : null,
    addresseeRefs.length > 0
      ? `addressees=${formatLabelList(safeStructuralSummaryList(addresseeRefs, "referenced addressee"))}`
      : null,
    field("requestedRoleText")
      ? `requestedRole=${safeStructuralSummaryText(field("requestedRoleText"), "requested role")}`
      : null,
    field("futureUseKind") ? `futureUse=${field("futureUseKind")}` : null,
    sourceRefs.length > 0
      ? `sources=${formatLabelList(safeStructuralSummaryList(sourceRefs, "referenced source"))}`
      : null,
    claims.length > 0 ? `Claims: ${claims.map(formatStructuralClaim).join(" | ")}` : null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join("; ");
}

function summarizeWorldFactStructurally(input: {
  acceptedResult: unknown;
  toolInput: unknown;
  toolArgs: unknown;
}): string {
  const { acceptedResult, toolInput, toolArgs } = input;
  const acceptedField = (key: string): string | null => readRecordString(acceptedResult, key);
  const field = (key: string): string | null =>
    acceptedField(key) ?? toolField(toolInput, toolArgs, key);
  const claims = readRecordArray(acceptedResult, "claims").length > 0
    ? readRecordArray(acceptedResult, "claims")
    : toolRecordArray(toolInput, toolArgs, "claims");
  const subjectRefs = readRecordStringArray(acceptedResult, "subjectRefs").length > 0
    ? readRecordStringArray(acceptedResult, "subjectRefs")
    : toolStringArray(toolInput, toolArgs, "subjectRefs");
  const sourceRefs = readRecordStringArray(acceptedResult, "sourceRefs").length > 0
    ? readRecordStringArray(acceptedResult, "sourceRefs")
    : toolStringArray(toolInput, toolArgs, "sourceRefs");
  const parts = [
    `World fact: fact=${field("factKind") ?? "unknown"}`,
    `topic=${field("topicKind") ?? "unknown"}`,
    `truth=${field("truthStatus") ?? "unknown"}`,
    `source=${field("sourceKind") ?? "unknown"}`,
    `durability=${field("durability") ?? "unknown"}`,
    field("futureUseKind") ? `futureUse=${field("futureUseKind")}` : null,
    subjectRefs.length > 0
      ? `subjects=${formatLabelList(safeStructuralSummaryList(subjectRefs, "referenced subject"))}`
      : null,
    sourceRefs.length > 0
      ? `sources=${formatLabelList(safeStructuralSummaryList(sourceRefs, "referenced source"))}`
      : null,
    claims.length > 0 ? `Claims: ${claims.map(formatStructuralClaim).join(" | ")}` : null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join("; ");
}

function summarizeObservationToolResult(
  toolName: CanonicalTurnPacketToolName,
  acceptedResult: unknown,
): string | null {
  const labels = candidateLabelsFromResult(acceptedResult, "candidates");
  const facts = candidateLabelsFromResult(acceptedResult, "facts");
  const count = readRecordNumber(acceptedResult, "count");
  const labelsText = formatLabelList(labels);
  const factsText = formatLabelList(facts);

  switch (toolName) {
    case "list_visible_affordances":
      return "The current visible actors, routes, objects, and public scene cues are checked without changing state.";
    case "list_navigation_options":
      return labels.length > 0
        ? `Reachable routes are checked: ${labelsText}.`
        : "No additional reachable route is confirmed from the current scene.";
    case "find_location_candidates":
      return labels.length > 0
        ? `Matching visible or reachable locations are checked: ${labelsText}.`
        : "No matching visible or reachable location is confirmed; the current scene remains the grounded vantage point.";
    case "find_poi_candidates":
      return labels.length > 0
        ? `Matching visible points of interest are checked: ${labelsText}.`
        : "No matching visible point of interest is confirmed in the current scene.";
    case "find_object_candidates":
      return labels.length > 0
        ? `Matching visible objects are checked: ${labelsText}.`
        : "No matching visible object is confirmed in the current scene.";
    case "find_actor_candidates":
      return labels.length > 0
        ? `Matching visible actors are checked: ${labelsText}.`
        : "No matching visible actor is confirmed in the current scene.";
    case "inspect_known_fact":
      return facts.length > 0
        ? `Player-visible or player-known facts are checked: ${factsText}.`
        : "No matching player-visible or player-known fact is confirmed.";
    case "check_route": {
      const routeStatus = readRecordString(acceptedResult, "routeStatus");
      const destination = acceptedResult && typeof acceptedResult === "object"
        ? readRecordString((acceptedResult as Record<string, unknown>).destination, "label")
        : null;
      if (routeStatus === "already_here") {
        return destination
          ? `The player is already at ${destination}.`
          : "The player is already at the checked destination.";
      }
      if (routeStatus === "legal") {
        return destination
          ? `A visible route to ${destination} is confirmed.`
          : "A visible route to the checked destination is confirmed.";
      }
      return "The requested route is checked against visible current-scene routes.";
    }
    default:
      return count !== null && count === 0
        ? "No matching player-visible result is confirmed."
        : null;
  }
}

export function summarizeRuntimeToolResultForNarrator(input: {
  toolName: CanonicalTurnPacketToolName;
  actionId: string;
  toolInput: unknown;
  toolArgs: unknown;
  toolResult?: ToolResult;
}): string {
  const { toolName, toolInput, toolArgs, toolResult } = input;
  const acceptedResult = toolResult?.success === true ? toolResult.result : null;
  const acceptedField = (key: string): string | null => readRecordString(acceptedResult, key);

  switch (toolName) {
    case "list_visible_affordances":
    case "list_navigation_options":
    case "find_location_candidates":
    case "find_object_candidates":
    case "find_actor_candidates":
    case "find_poi_candidates":
    case "inspect_known_fact":
    case "check_route":
      return summarizeObservationToolResult(toolName, acceptedResult)
        ?? "A player-visible observation is checked without changing state.";
    case "log_event":
      return clarifyUnconfirmedClaimSummary(
        toolField(toolInput, toolArgs, "text")
          ?? toolField(toolInput, toolArgs, "summary")
          ?? "A future-relevant local event is recorded.",
      );
    case "record_dialogue_outcome": {
      return summarizeDialogueOutcomeStructurally({
        acceptedResult,
        toolInput,
        toolArgs,
      });
    }
    case "record_world_fact": {
      return summarizeWorldFactStructurally({
        acceptedResult,
        toolInput,
        toolArgs,
      });
    }
    case "advance_time": {
      const minutes =
        readRecordNumber(acceptedResult, "minutes")
        ?? toolNumber(toolInput, toolArgs, "minutes")
        ?? toolResult?.authority?.elapsedWorldTimeMinutes
        ?? null;
      const elapsedText = minutes === null
        ? "In-world time passes"
        : formatElapsedWorldMinutes(minutes);
      return `${elapsedText}.`;
    }
    case "set_relationship": {
      const reason = toolField(toolInput, toolArgs, "reason");
      const entityA = toolField(toolInput, toolArgs, "entityA");
      const entityB = toolField(toolInput, toolArgs, "entityB");
      const tag = toolField(toolInput, toolArgs, "tag");
      const relationshipLabel = [entityA, entityB, tag].filter(Boolean).join(" / ");
      return reason
        ?? (relationshipLabel.length > 0
          ? relationshipLabel
          : "A relationship changes in the scene.");
    }
    case "add_chronicle_entry":
      return toolField(toolInput, toolArgs, "text")
        ?? "A campaign chronicle beat is recorded.";
    case "add_tag": {
      const entityName = toolField(toolInput, toolArgs, "entityName") ?? "An entity";
      return `${entityName}'s recorded status changes.`;
    }
    case "remove_tag": {
      const entityName = toolField(toolInput, toolArgs, "entityName") ?? "An entity";
      return `${entityName}'s recorded status changes.`;
    }
    case "offer_quick_actions":
      return "Follow-up player options become available.";
    case "spawn_npc": {
      const name = acceptedField("name")
        ?? toolField(toolInput, toolArgs, "name")
        ?? "A support character";
      return `${name} becomes visibly present in the scene.`;
    }
    case "promote_npc": {
      const npcRef = toolField(toolInput, toolArgs, "npcRef") ?? "A support character";
      const reason = toolField(toolInput, toolArgs, "reason");
      return reason
        ? `${npcRef} becomes future-relevant: ${reason}`
        : `${npcRef} becomes future-relevant.`;
    }
    case "spawn_item": {
      const name = acceptedField("name")
        ?? toolField(toolInput, toolArgs, "name")
        ?? "An item";
      const ownerName = acceptedField("owner") ?? toolField(toolInput, toolArgs, "ownerName");
      return ownerName
        ? `${name} becomes available to ${ownerName}.`
        : `${name} becomes available in the scene.`;
    }
    case "reveal_location": {
      const name = acceptedField("name")
        ?? toolField(toolInput, toolArgs, "name")
        ?? "A local place";
      const connectedToName = acceptedField("connectedTo")
        ?? toolField(toolInput, toolArgs, "connectedToName");
      return connectedToName
        ? `${name} becomes reachable from ${connectedToName}.`
        : `${name} becomes a reachable local place.`;
    }
    case "request_contested_outcome": {
      const actorName = acceptedField("actorName")
        ?? toolField(toolInput, toolArgs, "actorName")
        ?? "An actor";
      const targetName = acceptedField("targetName")
        ?? toolField(toolInput, toolArgs, "targetName")
        ?? "the opposition";
      const matchup = acceptedField("matchup");
      const allowed = summarizeFirstListEntry(
        readRecordStringArray(acceptedResult, "allowedEffects"),
        "visible effort and local pressure are allowed.",
      );
      const prohibited = summarizeFirstListEntry(
        readRecordStringArray(acceptedResult, "prohibitedEffects"),
        "final harm, capture, escape, inventory, or movement changes are not settled here.",
      );
      const matchupText = matchup && matchup !== "unknown"
        ? ` by a ${matchup} matchup`
        : "";
      return `${actorName}'s contest with ${targetName} is bounded${matchupText}. Allowed now: ${allowed} Prohibited: ${prohibited}`;
    }
    case "set_condition": {
      const targetName = toolField(toolInput, toolArgs, "targetName") ?? "The target";
      return `${targetName}'s condition changes.`;
    }
    case "move_to": {
      const targetLocationName =
        acceptedField("locationName")
        ?? toolField(toolInput, toolArgs, "locationName")
        ?? toolField(toolInput, toolArgs, "targetLocationName")
        ?? "the destination";
      return `You arrive at ${targetLocationName}.`;
    }
    case "move_actor": {
      const actorRef =
        acceptedField("actorRef")
        ?? toolField(toolInput, toolArgs, "actorRef")
        ?? "The current actor";
      const targetLocationName =
        acceptedField("locationName")
        ?? toolField(toolInput, toolArgs, "destinationRef")
        ?? "the destination";
      return `${actorRef} moves to ${targetLocationName}.`;
    }
    case "create_minor_poi": {
      const name = acceptedField("name")
        ?? toolField(toolInput, toolArgs, "name")
        ?? "A minor local place";
      const anchor = acceptedField("connectedTo")
        ?? toolField(toolInput, toolArgs, "areaRef")
        ?? "the current area";
      return `${name} becomes reachable from ${anchor}.`;
    }
    case "create_scene_extra": {
      const name = acceptedField("name")
        ?? toolField(toolInput, toolArgs, "name")
        ?? "A temporary local extra";
      return `${name} becomes visibly present in the scene.`;
    }
    case "start_search": {
      const actorRef =
        acceptedField("actorRef")
        ?? toolField(toolInput, toolArgs, "actorRef")
        ?? "The current actor";
      const query =
        acceptedField("query")
        ?? toolField(toolInput, toolArgs, "query")
        ?? "the target";
      return `${actorRef} starts searching for ${query}; no discovery is confirmed.`;
    }
    case "record_player_intent": {
      const actorRef =
        acceptedField("actorRef")
        ?? toolField(toolInput, toolArgs, "actorRef")
        ?? "The player";
      const targetHint =
        acceptedField("targetHint")
        ?? toolField(toolInput, toolArgs, "targetHint")
        ?? toolField(toolInput, toolArgs, "summary")
        ?? "the stated intent";
      return `${actorRef} records an unconfirmed intent or claim about ${targetHint}.`;
    }
    case "transfer_item": {
      const itemName =
        acceptedField("item")
        ?? toolField(toolInput, toolArgs, "transferredItemName")
        ?? toolField(toolInput, toolArgs, "itemName")
        ?? "An item";
      const sourceItem = acceptedField("splitFrom") ?? toolField(toolInput, toolArgs, "itemName");
      const remainingItem =
        acceptedField("remainingItem") ?? toolField(toolInput, toolArgs, "remainingItemName");
      const targetName =
        acceptedField("target") ?? toolField(toolInput, toolArgs, "targetName") ?? "a new holder";
      if (sourceItem && remainingItem && itemName !== sourceItem) {
        return `${sourceItem} is split: ${itemName} moves to ${targetName}, leaving ${remainingItem}.`;
      }
      return `${itemName} moves to ${targetName}.`;
    }
    default:
      return "A player-visible action result is accepted by the game state.";
  }
}

function clarifyUnconfirmedClaimSummary(summary: string): string {
  const normalized = summary.toLowerCase();
  const possessionClaim =
    normalized.includes("claim to possess")
    || normalized.includes("claims to possess")
    || normalized.includes("claimed to possess")
    || normalized.includes("claim to have")
    || normalized.includes("claims to have")
    || normalized.includes("claimed to have")
    || normalized.includes("claim to hold")
    || normalized.includes("claims to hold")
    || normalized.includes("claimed to hold")
    || normalized.includes("claim to own")
    || normalized.includes("claims to own")
    || normalized.includes("claimed to own");
  const challengedExistence =
    normalized.includes("either")
    && (
      normalized.includes("doesn't exist")
      || normalized.includes("doesnt exist")
      || normalized.includes("does not exist")
    );
  if (possessionClaim && challengedExistence) {
    return "No confirmed possession or access is established; the claim is visibly challenged.";
  }

  return summary;
}

function isNarratableSettledActionResult(result: CanonicalTurnPacketActionResult): boolean {
  if (!result.result.success || isObservationToolResult(result.result)) return false;
  if (!isRuntimeToolName(result.toolName)) return false;
  if (!runtimeToolHasGeneratedNarrativeSurface(result.toolName)) return false;
  return runtimeToolHasRole(result.toolName, "state_mutation")
    || runtimeToolHasRole(result.toolName, "terminal_receipt")
    || runtimeToolHasRole(result.toolName, "legacy_scene_beat");
}

function runtimeToolHasGeneratedNarrativeSurface(toolName: RuntimeToolName): boolean {
  switch (toolName) {
    case "add_tag":
    case "remove_tag":
    case "record_player_intent":
    case "start_search":
      return false;
    default:
      return true;
  }
}

function summarizeActionResult(result: CanonicalTurnPacketActionResult): string {
  return summarizeRuntimeToolResultForNarrator({
    toolName: result.toolName,
    actionId: result.actionId,
    toolInput: result.input,
    toolArgs: result.args,
    toolResult: result.result,
  });
}

function buildActionResultEffect(
  result: CanonicalTurnPacketActionResult,
): CanonicalTurnPacketEffect {
  return {
    id: `action-result:${result.actionId}`,
    actionId: result.actionId,
    actorId: result.actorId,
    toolName: result.toolName,
    summary: summarizeActionResult(result),
    perceivableByPlayer: true,
    toolResult: result.result,
  };
}

type ActorCreationToolName = Extract<RuntimeToolName, "spawn_npc" | "create_scene_extra">;

function isActorCreationToolName(
  toolName: CanonicalTurnPacketToolName | undefined,
): toolName is ActorCreationToolName {
  return toolName === "spawn_npc" || toolName === "create_scene_extra";
}

export function collectCommittedVisibleActorCreationLabels(args: {
  packet: CanonicalTurnPacket;
  perceivableEffects: readonly CanonicalTurnPacketEffect[];
}): string[] {
  const visibleCreationRefs = new Set(
    args.perceivableEffects
      .filter((effect) => isActorCreationToolName(effect.toolName))
      .flatMap((effect) => [
        effect.actionId ? `action:${effect.actionId}` : null,
        effect.actionId && effect.toolName ? `tool:${effect.actionId}:${effect.toolName}` : null,
      ])
      .filter((ref): ref is string => Boolean(ref)),
  );
  const effectLabels = args.perceivableEffects
    .filter((effect) => isActorCreationToolName(effect.toolName))
    .map((effect) =>
      effect.toolResult?.success === true
        ? readRecordString(effect.toolResult.result, "name")
        : null,
    );
  const actionResultLabels = args.packet.actionResults
    .filter((result) =>
      result.result.success
      && !isObservationToolResult(result.result)
      && isActorCreationToolName(result.toolName)
      && (
        visibleCreationRefs.has(`action:${result.actionId}`)
        || visibleCreationRefs.has(`tool:${result.actionId}:${result.toolName}`)
      ),
    )
    .map((result) =>
      readRecordString(result.result.result, "name")
        ?? toolField(result.input, result.args, "name"),
    );

  return uniqueStrings([...effectLabels, ...actionResultLabels]);
}

function normalizeActorPromptSafetyLabel(label: string): string {
  let normalized = "";
  let pendingSpace = false;

  for (const char of label.trim().toLowerCase()) {
    if (char.trim() === "") {
      pendingSpace = normalized.length > 0;
      continue;
    }
    if (pendingSpace) {
      normalized += " ";
      pendingSpace = false;
    }
    normalized += char;
  }

  return normalized;
}

function forbiddenActorNameMatchesCommittedVisibleActorLabel(
  forbiddenActorName: string,
  normalizedCommittedLabel: string,
): boolean {
  const normalizedForbiddenName = normalizeActorPromptSafetyLabel(forbiddenActorName);
  return Boolean(normalizedForbiddenName)
    && Boolean(normalizedCommittedLabel)
    && normalizedForbiddenName === normalizedCommittedLabel;
}

function actorPromptSafetyLabelContainsWholeTokens(container: string, contained: string): boolean {
  return container === contained
    || container.startsWith(`${contained} `)
    || container.endsWith(` ${contained}`)
    || container.includes(` ${contained} `);
}

function forbiddenActorNameIsAllowedVisibleLabel(
  forbiddenActorName: string,
  allowedVisibleActorNames: readonly string[],
): boolean {
  const normalizedForbiddenName = normalizeActorPromptSafetyLabel(forbiddenActorName);
  return Boolean(normalizedForbiddenName)
    && allowedVisibleActorNames.some((label) =>
      normalizeActorPromptSafetyLabel(label) === normalizedForbiddenName,
    );
}

function collectPerceivableEvents(packet: CanonicalTurnPacket): CanonicalTurnPacketEvent[] {
  const eventById = new Map(
    uniqueById([packet.anchorEvent, ...packet.events]).map((event) => [event.id, event]),
  );
  const eventIds = uniqueStrings([
    packet.narratorFacts.anchorEventId,
    ...packet.narratorFacts.eventIds,
  ]);

  return eventIds
    .map((id) => eventById.get(id))
    .filter((event): event is CanonicalTurnPacketEvent => Boolean(event?.perceivableByPlayer));
}

function collectPerceivableResponses(
  packet: CanonicalTurnPacket,
): CanonicalTurnPacketResponse[] {
  const responseById = new Map(packet.responses.map((response) => [response.id, response]));
  return uniqueStrings(packet.narratorFacts.responseIds)
    .map((id) => responseById.get(id))
    .filter((response): response is CanonicalTurnPacketResponse => {
      if (!response?.visibleToPlayer) {
        return false;
      }
      return responseContributesBackendFacts(response);
    });
}

function responseContributesBackendFacts(
  response: CanonicalTurnPacketResponse,
): boolean {
  if (response.evidenceAuthority === "model_guidance") {
    return false;
  }
  if (response.evidenceAuthority === "backend_fact") {
    return true;
  }
  return false;
}

function findFrameActor(frame: SceneFrame, actorId: string | null | undefined): SceneActor | null {
  if (!actorId) {
    return null;
  }

  return [
    ...frame.roster.active,
    ...frame.roster.support,
    ...frame.roster.background,
  ].find((entry) => entry.id === actorId || entry.actorId === actorId) ?? null;
}

function actorIsPromptVisible(frame: SceneFrame, actorId: string | null | undefined): boolean {
  if (!actorId || actorId === frame.playerActorId) {
    return true;
  }

  const actor = findFrameActor(frame, actorId);
  return actor?.awareness === "clear";
}

interface HiddenSourceRedactionTerm {
  term: string;
  replacement: string;
}

function collectHiddenSourceRedactionTerms(args: {
  frame: SceneFrame;
  forbiddenActorNames: readonly string[];
  forbiddenFactMarkers: readonly string[];
  forbiddenPrivateTerms: readonly string[];
}): HiddenSourceRedactionTerm[] {
  const actorIdentityTerms = uniqueStrings([
    ...args.forbiddenActorNames,
    ...(args.frame.perception.forbiddenActorIds ?? []),
    ...collectForbiddenActors(args.frame).flatMap((actor) => [
      actor.id,
      actor.actorId,
      actor.label,
    ]),
  ]).map((term) => ({ term, replacement: "someone unseen" }));
  const privateTerms = uniqueStrings([
    ...args.forbiddenFactMarkers,
    ...args.forbiddenPrivateTerms,
  ]).map((term) => ({ term, replacement: "something private" }));

  return [...actorIdentityTerms, ...privateTerms]
    .filter((entry) => entry.term.trim().length > 0)
    .sort((left, right) => right.term.length - left.term.length);
}

function containsForbiddenPromptTerm(
  text: string,
  terms: readonly HiddenSourceRedactionTerm[],
): boolean {
  const normalizedText = text.toLowerCase();
  return terms.some((entry) => normalizedText.includes(entry.term.trim().toLowerCase()));
}

function replaceLiteralCaseInsensitive(
  value: string,
  search: string,
  replacement: string,
): string {
  const normalizedValue = value.toLocaleLowerCase();
  const normalizedSearch = search.toLocaleLowerCase();
  let cursor = 0;
  let result = "";

  while (cursor < value.length) {
    const matchIndex = normalizedValue.indexOf(normalizedSearch, cursor);
    if (matchIndex < 0) {
      result += value.slice(cursor);
      break;
    }
    result += value.slice(cursor, matchIndex);
    result += replacement;
    cursor = matchIndex + search.length;
  }

  return result;
}

function collapseWhitespace(value: string): string {
  let compacted = "";
  let pendingSpace = false;

  for (const char of value.trim()) {
    if (char.trim() === "") {
      pendingSpace = compacted.length > 0;
      continue;
    }
    if (pendingSpace) {
      compacted += " ";
      pendingSpace = false;
    }
    compacted += char;
  }

  return compacted;
}

function hasPlayerVisibleCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      return true;
    }
  }
  return false;
}

function redactHiddenSourceSummary(args: {
  summary: string;
  terms: readonly HiddenSourceRedactionTerm[];
}): string | null {
  let redacted = args.summary.trim();
  if (!redacted) {
    return null;
  }

  for (const entry of args.terms) {
    const term = entry.term.trim();
    if (!term) {
      continue;
    }
    redacted = replaceLiteralCaseInsensitive(redacted, term, entry.replacement);
  }

  redacted = collapseWhitespace(redacted);
  redacted = replaceLiteralCaseInsensitive(
    redacted,
    "someone unseen's something private",
    "an unseen private action",
  );

  if (!hasPlayerVisibleCharacter(redacted) || containsForbiddenPromptTerm(redacted, args.terms)) {
    return null;
  }

  return redacted;
}

function anonymizeHiddenSourceEffect(args: {
  effect: CanonicalTurnPacketEffect;
  index: number;
  terms: readonly HiddenSourceRedactionTerm[];
}): CanonicalTurnPacketEffect | null {
  const summary = redactHiddenSourceSummary({
    summary: args.effect.summary,
    terms: args.terms,
  });
  if (!summary) {
    return null;
  }

  const anonymousActionId = args.effect.actionId
    ? `anonymous-action-${args.index}`
    : undefined;

  return {
    ...args.effect,
    id: `anonymous-effect-${args.index}`,
    actionId: anonymousActionId,
    actorId: undefined,
    summary,
  };
}

function effectRuntimeToolName(
  effect: CanonicalTurnPacketEffect,
): RuntimeToolName | null {
  return effect.toolName && isRuntimeToolName(effect.toolName) ? effect.toolName : null;
}

function actorCreationLabelsFromEffect(effect: CanonicalTurnPacketEffect): string[] {
  if (!isActorCreationToolName(effect.toolName) || effect.toolResult?.success !== true) {
    return [];
  }

  return uniqueStrings([readRecordString(effect.toolResult.result, "name")]);
}

function visibleEffectWouldLeakForbiddenTerm(args: {
  effect: CanonicalTurnPacketEffect;
  playerAction: string;
  forbiddenActorNames: readonly string[];
  forbiddenFactMarkers: readonly string[];
  forbiddenPrivateTerms: readonly string[];
}): boolean {
  if (isActorCreationToolName(args.effect.toolName)) {
    return false;
  }

  const text = sanitizeModelFacingText(args.effect.summary);
  const toolName = effectRuntimeToolName(args.effect);
  const committedVisibleActorCreationLabels = actorCreationLabelsFromEffect(args.effect);

  for (const term of uniqueStrings(args.forbiddenActorNames)) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) {
      continue;
    }
    if (
      sourceBoundaryTermIsAllowedCommittedActorCreation({
        source: "perceivable_effect:candidate",
        text,
        toolName,
        forbiddenTerm: term,
        committedVisibleActorCreationLabels,
      })
    ) {
      continue;
    }
    if (
      sourceBoundaryTermIsLeak({
        source: "perceivable_effect:candidate",
        text,
        playerSourced: false,
        playerAction: args.playerAction,
        normalizedTerm,
        toolName,
      })
    ) {
      return true;
    }
  }

  for (const term of uniqueStrings([
    ...args.forbiddenFactMarkers,
    ...args.forbiddenPrivateTerms,
  ])) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) {
      continue;
    }
    if (
      sourceBoundaryTermIsLeak({
        source: "perceivable_effect:candidate",
        text,
        playerSourced: false,
        playerAction: args.playerAction,
        normalizedTerm,
        toolName,
      })
    ) {
      return true;
    }
  }

  return false;
}

function collectPromptSafeEffect(args: {
  effect: CanonicalTurnPacketEffect;
  frame: SceneFrame;
  hiddenSourceIndex: number;
  hiddenSourceRedactionTerms: readonly HiddenSourceRedactionTerm[];
  playerAction: string;
  forbiddenActorNames: readonly string[];
  forbiddenFactMarkers: readonly string[];
  forbiddenPrivateTerms: readonly string[];
}): CanonicalTurnPacketEffect | null {
  if (actorIsPromptVisible(args.frame, args.effect.actorId)) {
    if (
      visibleEffectWouldLeakForbiddenTerm({
        effect: args.effect,
        playerAction: args.playerAction,
        forbiddenActorNames: args.forbiddenActorNames,
        forbiddenFactMarkers: args.forbiddenFactMarkers,
        forbiddenPrivateTerms: args.forbiddenPrivateTerms,
      })
    ) {
      return null;
    }
    return args.effect;
  }

  return anonymizeHiddenSourceEffect({
    effect: args.effect,
    index: args.hiddenSourceIndex,
    terms: args.hiddenSourceRedactionTerms,
  });
}

function collectPerceivableEffects(
  packet: CanonicalTurnPacket,
  frame: SceneFrame,
  hiddenSourceRedactionTerms: readonly HiddenSourceRedactionTerm[],
  forbiddenActorNames: readonly string[],
  forbiddenFactMarkers: readonly string[],
  forbiddenPrivateTerms: readonly string[],
): CanonicalTurnPacketEffect[] {
  const actionIds = new Set(packet.narratorFacts.actionIds);
  const toolResultRefs = new Set(
    packet.narratorFacts.toolResultRefs.map((ref) => `${ref.actionId}:${ref.toolName}`),
  );
  let hiddenSourceIndex = 0;
  const nextHiddenSourceIndex = (): number => {
    hiddenSourceIndex += 1;
    return hiddenSourceIndex;
  };
  const referencedAction = (
    actionId: string,
    toolName?: CanonicalTurnPacketToolName,
  ): boolean =>
    actionIds.has(actionId)
    || (toolName ? toolResultRefs.has(`${actionId}:${toolName}`) : false);
  const explicitEffects = packet.effects
    .filter((effect) =>
      effect.perceivableByPlayer
      && effect.toolResult?.success !== false
      && (effect.toolResult ? !isObservationToolResult(effect.toolResult) : true)
      && (
        (effect.actionId ? referencedAction(effect.actionId, effect.toolName) : false)
      ),
    )
    .map((effect) =>
      collectPromptSafeEffect({
        effect,
        frame,
        hiddenSourceIndex: nextHiddenSourceIndex(),
        hiddenSourceRedactionTerms,
        playerAction: packet.playerAction,
        forbiddenActorNames,
        forbiddenFactMarkers,
        forbiddenPrivateTerms,
      }),
    )
    .filter((effect): effect is CanonicalTurnPacketEffect => Boolean(effect));
  const generatedEffects = packet.actionResults
    .filter((result) =>
      isNarratableSettledActionResult(result)
      && referencedAction(result.actionId, result.toolName),
    )
    .map(buildActionResultEffect)
    .map((effect) =>
      collectPromptSafeEffect({
        effect,
        frame,
        hiddenSourceIndex: nextHiddenSourceIndex(),
        hiddenSourceRedactionTerms,
        playerAction: packet.playerAction,
        forbiddenActorNames,
        forbiddenFactMarkers,
        forbiddenPrivateTerms,
      }),
    )
    .filter((effect): effect is CanonicalTurnPacketEffect => Boolean(effect));

  return uniqueById([...explicitEffects, ...generatedEffects]);
}

const OBSERVATION_ATOM_MAX = 12;
const OBSERVATION_ATOM_SUMMARY_MAX = 220;
const OBSERVATION_ATOM_DEPTH_MAX = 4;

interface NarratorPacketObservationAtomDraft {
  kind: NarratorPacketObservationAtomKind;
  summary: string;
  claimSupport: NarrationClaimKind[];
  sourcePath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value);
}

function normalizeObservationKey(key: string): string {
  let normalized = "";
  for (const char of key.toLocaleLowerCase()) {
    const code = char.charCodeAt(0);
    const isNumber = code >= 48 && code <= 57;
    const isLetter = code >= 97 && code <= 122;
    if (isNumber || isLetter) {
      normalized += char;
    }
  }
  return normalized;
}

function readObservationString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function readNestedObservationLabel(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (!isRecord(value)) return null;
  return readObservationString(value, ["label", "name", "title", "summary"]);
}

function observationAtomKindForToolName(
  toolName: CanonicalTurnPacketToolName,
): NarratorPacketObservationAtomKind | null {
  switch (toolName) {
    case "find_actor_candidates":
      return "actor";
    case "find_object_candidates":
      return "object";
    case "find_location_candidates":
    case "list_navigation_options":
    case "check_route":
      return "route";
    case "inspect_known_fact":
      return "fact";
    case "find_poi_candidates":
      return "object";
    default:
      return null;
  }
}

function observationAtomKindForRecord(
  record: Record<string, unknown>,
): NarratorPacketObservationAtomKind | null {
  const kind = readObservationString(record, ["kind"])?.toLocaleLowerCase();
  if (kind === "fact") return "fact";

  const type = readObservationString(record, ["type"])?.toLocaleLowerCase();
  switch (type) {
    case "actor":
      return "actor";
    case "item":
    case "object":
      return "object";
    case "location":
    case "route":
      return "route";
    default:
      return null;
  }
}

function observationAtomKindForKey(input: {
  key: string;
  toolName: CanonicalTurnPacketToolName;
  inheritedKind: NarratorPacketObservationAtomKind | null;
}): NarratorPacketObservationAtomKind | null {
  const normalized = normalizeObservationKey(input.key);
  if (
    input.inheritedKind
    && [
      "actors",
      "facts",
      "items",
      "targets",
      "candidates",
      "destination",
      "path",
    ].includes(normalized)
  ) {
    return input.inheritedKind;
  }

  switch (normalized) {
    case "visibleactors":
    case "actors":
    case "personnel":
    case "witnesses":
      return "actor";
    case "legaltargets":
    case "physicalaffordances":
    case "objects":
    case "items":
    case "targets":
    case "cameras":
      return "object";
    case "legalmovement":
    case "movement":
    case "routes":
    case "exitsroutes":
    case "navigation":
    case "destination":
    case "path":
      return "route";
    case "barriers":
    case "hazards":
    case "risks":
      return "barrier";
    case "visiblefacts":
    case "facts":
    case "knownfacts":
    case "publicfacts":
    case "hints":
      return "fact";
    case "candidates":
      return observationAtomKindForToolName(input.toolName);
    default:
      return null;
  }
}

function observationAtomClaimSupport(
  kind: NarratorPacketObservationAtomKind,
  absenceOf: NarratorPacketObservationAtomKind | null = null,
): NarrationClaimKind[] {
  const effectiveKind = kind === "absence" && absenceOf ? absenceOf : kind;
  switch (effectiveKind) {
    case "actor":
      return ["actor_presence", "playable_beat"];
    case "object":
      return ["object_presence", "playable_beat"];
    case "route":
      return ["route_status", "playable_beat"];
    case "barrier":
      return ["route_status", "threat_hazard", "playable_beat"];
    case "fact":
    case "absence":
      return ["playable_beat"];
  }
}

function observationAtomSummaryFromRecord(
  record: Record<string, unknown>,
  kind: NarratorPacketObservationAtomKind,
): string | null {
  if (kind === "route") {
    const routeStatus = readObservationString(record, ["routeStatus", "status"]);
    if (routeStatus) {
      const destinationLabel = readNestedObservationLabel(record, "destination")
        ?? readObservationString(record, ["label", "name", "title"]);
      const status = formatInventoryTagForPrompt(routeStatus);
      return destinationLabel
        ? formatRouteStatusObservation(destinationLabel, status)
        : formatRouteStatusObservation(null, status);
    }
  }

  return readObservationString(record, [
    "summary",
    "label",
    "name",
    "title",
    "description",
    "text",
    "reason",
  ]);
}

function formatRouteStatusObservation(
  destinationLabel: string | null,
  status: string,
): string {
  const normalizedStatus = status.trim().toLocaleLowerCase();
  if (normalizedStatus === "legal") {
    return destinationLabel
      ? `The route to ${destinationLabel} is reachable from here.`
      : "A route is reachable from here.";
  }
  if (normalizedStatus === "already here") {
    return destinationLabel
      ? `You are already at ${destinationLabel}.`
      : "You are already at the checked destination.";
  }
  return destinationLabel
    ? `The route to ${destinationLabel} is ${status}.`
    : `The route status is ${status}.`;
}

function hasSentencePunctuation(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const last = trimmed[trimmed.length - 1];
  return last === "." || last === "!" || last === "?";
}

function looksLikeShortObservationLabel(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || hasSentencePunctuation(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length <= 5;
}

export function normalizeNarratableObservationSummary(value: string): string {
  return value
    .replace(
      /\bNo visible barrier refs are present(?: in current scene packet or player-visible\/player-known facts)?\.?/i,
      "No obvious visible barriers are apparent from here.",
    )
    .replace(/\bbarrier refs\b/gi, "barriers")
    .replace(/\brefs\b/gi, "signs");
}

function formatObservationAtomNarratableSummary(input: {
  kind: NarratorPacketObservationAtomKind;
  rawSummary: string;
  absenceOf?: NarratorPacketObservationAtomKind | null;
}): string {
  const normalized = normalizeNarratableObservationSummary(input.rawSummary.trim());
  if (!normalized) return normalized;
  if (input.kind === "route") {
    const legalDestination = normalized.match(/^Route to (.+) is legal\.?$/i);
    if (legalDestination?.[1]) {
      return formatRouteStatusObservation(legalDestination[1], "legal");
    }
    if (/^Route status is legal\.?$/i.test(normalized)) {
      return formatRouteStatusObservation(null, "legal");
    }
  }
  if (input.kind === "absence") {
    const absenceKind = input.absenceOf ?? null;
    if (absenceKind === "barrier" && /no .*barrier/i.test(normalized)) {
      return "No obvious visible barriers are apparent from here.";
    }
  }
  if (looksLikeShortObservationLabel(normalized)) {
    switch (input.kind) {
      case "actor":
        return `${normalized} is visible here.`;
      case "object":
        return `${normalized} is visible here.`;
      case "route":
        return `${normalized} is reachable from here.`;
      default:
        break;
    }
  }
  return normalized;
}

function pushObservationAtomDraft(input: {
  drafts: NarratorPacketObservationAtomDraft[];
  seen: Set<string>;
  kind: NarratorPacketObservationAtomKind;
  rawSummary: string | null;
  sourcePath: string;
  absenceOf?: NarratorPacketObservationAtomKind | null;
}): void {
  if (input.drafts.length >= OBSERVATION_ATOM_MAX) return;
  const narratableSummary = input.rawSummary
    ? formatObservationAtomNarratableSummary({
        kind: input.kind,
        rawSummary: input.rawSummary,
        absenceOf: input.absenceOf ?? null,
      })
    : "";
  const summary = sanitizeModelFacingText(
    boundedSummary(narratableSummary, OBSERVATION_ATOM_SUMMARY_MAX),
  );
  if (!summary) return;

  const key = `${input.kind}:${summary.toLocaleLowerCase()}`;
  if (input.seen.has(key)) return;
  input.seen.add(key);
  input.drafts.push({
    kind: input.kind,
    summary,
    claimSupport: observationAtomClaimSupport(input.kind, input.absenceOf ?? null),
    sourcePath: input.sourcePath,
  });
}

function collectObservationAtomDraftsFromValue(input: {
  value: unknown;
  toolName: CanonicalTurnPacketToolName;
  inheritedKind: NarratorPacketObservationAtomKind | null;
  path: string;
  depth: number;
  drafts: NarratorPacketObservationAtomDraft[];
  seen: Set<string>;
}): void {
  if (
    input.depth > OBSERVATION_ATOM_DEPTH_MAX
    || input.drafts.length >= OBSERVATION_ATOM_MAX
  ) {
    return;
  }

  if (typeof input.value === "string") {
    if (!input.inheritedKind) return;
    pushObservationAtomDraft({
      drafts: input.drafts,
      seen: input.seen,
      kind: input.inheritedKind,
      rawSummary: input.value,
      sourcePath: input.path,
    });
    return;
  }

  if (Array.isArray(input.value)) {
    input.value.forEach((entry, index) => {
      collectObservationAtomDraftsFromValue({
        ...input,
        value: entry,
        path: `${input.path}.${index + 1}`,
        depth: input.depth + 1,
      });
    });
    return;
  }

  if (!isRecord(input.value)) return;

  const recordKind = observationAtomKindForRecord(input.value)
    ?? input.inheritedKind
    ?? observationAtomKindForToolName(input.toolName);
  if (recordKind) {
    pushObservationAtomDraft({
      drafts: input.drafts,
      seen: input.seen,
      kind: recordKind,
      rawSummary: observationAtomSummaryFromRecord(input.value, recordKind),
      sourcePath: input.path,
    });
  }

  for (const [key, value] of Object.entries(input.value)) {
    const normalizedKey = normalizeObservationKey(key);
    if (normalizedKey === "absence") {
      if (typeof value === "string" && value.trim()) {
        pushObservationAtomDraft({
          drafts: input.drafts,
          seen: input.seen,
          kind: "absence",
          rawSummary: value,
          sourcePath: `${input.path}.${key}`,
          absenceOf: recordKind,
        });
      }
      continue;
    }

    const childKind = observationAtomKindForKey({
      key,
      toolName: input.toolName,
      inheritedKind: recordKind,
    });
    collectObservationAtomDraftsFromValue({
      value,
      toolName: input.toolName,
      inheritedKind: childKind,
      path: `${input.path}.${key}`,
      depth: input.depth + 1,
      drafts: input.drafts,
      seen: input.seen,
    });
  }
}

function collectObservationAtoms(args: {
  actionId: string;
  toolName: CanonicalTurnPacketToolName;
  toolResult: ToolResult;
  fallbackSummary: string;
}): NarratorPacketObservationAtom[] {
  const drafts: NarratorPacketObservationAtomDraft[] = [];
  const seen = new Set<string>();
  collectObservationAtomDraftsFromValue({
    value: args.toolResult.result,
    toolName: args.toolName,
    inheritedKind: null,
    path: "result",
    depth: 0,
    drafts,
    seen,
  });

  if (drafts.length === 0) {
    pushObservationAtomDraft({
      drafts,
      seen,
      kind: "fact",
      rawSummary: args.fallbackSummary,
      sourcePath: "summary",
    });
  }

  return drafts.map((draft, index) => ({
    id: `a${index + 1}`,
    actionId: args.actionId,
    toolName: args.toolName,
    kind: draft.kind,
    summary: draft.summary,
    claimSupport: draft.claimSupport,
    sourcePath: draft.sourcePath,
  }));
}

function observationWouldLeakForbiddenTerm(args: {
  observation: NarratorPacketObservation;
  playerAction: string;
  forbiddenActorNames: readonly string[];
  forbiddenFactMarkers: readonly string[];
  forbiddenPrivateTerms: readonly string[];
}): boolean {
  const texts = [
    sanitizeModelFacingText(args.observation.summary),
    ...args.observation.atoms.map((atom) => sanitizeModelFacingText(atom.summary)),
  ];
  for (const term of uniqueStrings([
    ...args.forbiddenActorNames,
    ...args.forbiddenFactMarkers,
    ...args.forbiddenPrivateTerms,
  ])) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) continue;
    for (const text of texts) {
      if (
        sourceBoundaryTermIsLeak({
          source: "observation_result:candidate",
          text,
          playerSourced: false,
          playerAction: args.playerAction,
          normalizedTerm,
          toolName: args.observation.toolName,
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

function isPacketObservationEvidenceRef(packet: CanonicalTurnPacket, actionId: string): boolean {
  const observationEvidenceRef = `action-result:${actionId}`;
  if (packet.turnResolution?.evidenceIds.includes(observationEvidenceRef)) {
    return true;
  }
  if (packet.turnResolution?.explicitNoCombatEvidenceIds.includes(observationEvidenceRef)) {
    return true;
  }
  if (packet.narratorFacts.actionIds.includes(actionId)) {
    return true;
  }
  return packet.narratorFacts.toolResultRefs.some((ref) => ref.actionId === actionId);
}

function collectPerceivableObservations(input: {
  packet: CanonicalTurnPacket;
  forbiddenActorNames: readonly string[];
  forbiddenFactMarkers: readonly string[];
  forbiddenPrivateTerms: readonly string[];
}): NarratorPacketObservation[] {
  const packet = input.packet;
  return packet.actionResults
    .filter((result) =>
      result.result.success === true
      && isObservationToolResult(result.result)
      && isPacketObservationEvidenceRef(packet, result.actionId))
    .map((result) => {
      const rawSummary = result.summary
        ?? summarizeRuntimeToolResultForNarrator({
          toolName: result.toolName,
          actionId: result.actionId,
          toolInput: result.input,
          toolArgs: result.args,
          toolResult: result.result,
        });
      const summary = boundedSummary(
        normalizeNarratableObservationSummary(rawSummary),
        640,
      );
      return {
        id: `observation-result:${result.actionId}`,
        actionId: result.actionId,
        toolName: result.toolName,
        summary,
        atoms: collectObservationAtoms({
          actionId: result.actionId,
          toolName: result.toolName,
          toolResult: result.result,
          fallbackSummary: summary,
        }),
      };
    })
    .filter((observation) =>
      observation.summary.trim().length > 0
      && !observationWouldLeakForbiddenTerm({
        observation,
        playerAction: packet.playerAction,
        forbiddenActorNames: input.forbiddenActorNames,
        forbiddenFactMarkers: input.forbiddenFactMarkers,
        forbiddenPrivateTerms: input.forbiddenPrivateTerms,
      })
    );
}

interface NarratorPromptVisibleItem {
  id: string;
  category: string;
  text: string;
  sourceId: string;
}

function collectNarratorPromptVisibleItems(packet: NarratorPacket): NarratorPromptVisibleItem[] {
  return [
    {
      id: "player-action",
      category: "player_action_request",
      text: packet.playerAction,
      sourceId: "player-action",
    },
    ...(packet.oracleOutcome
      ? [{
          id: "oracle-outcome",
          category: "oracle_outcome",
          text: packet.oracleOutcome,
          sourceId: "oracle-outcome",
        }]
      : []),
    {
      id: packet.anchorEvent.id,
      category: "anchor_event",
      text: packet.anchorEvent.summary,
      sourceId: packet.anchorEvent.id,
    },
    ...packet.perceivableEvents.map((event) => ({
      id: event.id,
      category: "committed_event",
      text: event.summary,
      sourceId: event.id,
    })),
    ...packet.perceivableResponses.map((response) => ({
      id: response.id,
      category: "perceivable_response",
      text: response.summary,
      sourceId: response.id,
    })),
    ...packet.perceivableEffects.map((effect) => ({
      id: effect.id,
      category: "perceivable_effect",
      text: effect.summary,
      sourceId: effect.id,
    })),
    ...(packet.perceivableObservations ?? []).flatMap((observation) =>
      observation.atoms.map((atom) => ({
        id: `${observation.id}:${atom.id}`,
        category: "observation_result",
        text: atom.summary,
        sourceId: observation.actionId,
      }))
    ),
    ...packet.visibleActors.map((actor) => ({
      id: actor.id,
      category: "visible_actor",
      text: actor.label,
      sourceId: actor.id,
    })),
    ...(packet.currentInventory ?? []).map((item) => ({
      id: item.itemId,
      category: "current_inventory_status",
      text: formatInventoryStatusSummary(item),
      sourceId: item.itemId,
    })),
    ...packet.hintSignals.map((hint, index) => ({
      id: packet.hintSignalSourceRefs?.[index]?.id ?? `hint:${index + 1}`,
      category: packet.hintSignalSourceRefs?.[index]?.kind ?? "hint_signal",
      text: hint,
      sourceId: packet.hintSignalSourceRefs?.[index]?.id ?? `hint:${index + 1}`,
    })),
    ...packet.guardrails.map((guardrail, index) => ({
      id: `guardrail:${index + 1}`,
      category: "guardrail",
      text: guardrail,
      sourceId: `guardrail:${index + 1}`,
    })),
    {
      id: "control-return",
      category: "control_return",
      text: packet.controlReturnReason,
      sourceId: "control-return",
    },
  ].filter((item) => item.text.trim().length > 0);
}

function routeCountsFromItems(items: readonly NarratorPromptVisibleItem[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {});
}

function countFailedActionResultsWithoutEffect(packet: CanonicalTurnPacket): number {
  const failedEffectActionIds = new Set(
    packet.effects
      .filter((effect) => effect.toolResult?.success === false)
      .map((effect) => effect.actionId)
      .filter((id): id is string => Boolean(id)),
  );

  return packet.actionResults.filter(
    (result) => !result.result.success && !failedEffectActionIds.has(result.actionId),
  ).length;
}

function countUnreferencedSuccessfulActionResults(args: {
  packet: CanonicalTurnPacket;
  perceivableEffects: readonly CanonicalTurnPacketEffect[];
}): number {
  const referencedActionIds = new Set(args.packet.narratorFacts.actionIds);
  const referencedToolRefs = new Set(
    args.packet.narratorFacts.toolResultRefs.map((ref) => `${ref.actionId}:${ref.toolName}`),
  );
  const includedGeneratedEffectIds = new Set(
    args.perceivableEffects
      .filter((effect) => effect.id.startsWith("action-result:"))
      .map((effect) => effect.id.slice("action-result:".length)),
  );

  return args.packet.actionResults.filter((result) => {
    if (!result.result.success || isObservationToolResult(result.result)) {
      return false;
    }
    if (includedGeneratedEffectIds.has(result.actionId)) {
      return false;
    }
    return !referencedActionIds.has(result.actionId)
      && !referencedToolRefs.has(`${result.actionId}:${result.toolName}`);
  }).length;
}

function buildRedactionAudit(args: {
  packet: CanonicalTurnPacket;
  perceivableEvents: readonly CanonicalTurnPacketEvent[];
  perceivableResponses: readonly CanonicalTurnPacketResponse[];
  perceivableEffects: readonly CanonicalTurnPacketEffect[];
  forbiddenActorNames: readonly string[];
  forbiddenFactMarkers: readonly string[];
  forbiddenPrivateTerms: readonly string[];
  evidenceLedger: readonly NarratorPacketEvidence[];
  uncommittedProposalCandidates?: readonly NarratorPacketProposalCandidate[];
}): NarratorPacketRedactionAudit {
  const visibleEffectIds = new Set(args.perceivableEffects.map((effect) => effect.id));
  const candidateEvents = uniqueById([args.packet.anchorEvent, ...args.packet.events]);
  const hiddenEventCount = candidateEvents.filter(
    (event) => !event.perceivableByPlayer,
  ).length;
  const hiddenResponseCount = args.packet.responses.filter(
    (response) => !response.visibleToPlayer,
  ).length;
  const failedEffectCount = args.packet.effects.filter(
    (effect) => effect.toolResult?.success === false,
  ).length + countFailedActionResultsWithoutEffect(args.packet);
  const hiddenEffectCount = args.packet.effects.filter(
    (effect) => !effect.perceivableByPlayer,
  ).length;
  const unreferencedEffectCount = args.packet.effects.filter((effect) => {
    if (!effect.perceivableByPlayer || effect.toolResult?.success === false) {
      return false;
    }
    return !visibleEffectIds.has(effect.id);
  }).length + countUnreferencedSuccessfulActionResults({
    packet: args.packet,
    perceivableEffects: args.perceivableEffects,
  });
  const excludedReasons: Record<NarratorPacketRedactionReason, number> = {
    hidden_event: hiddenEventCount,
    hidden_response: hiddenResponseCount,
    failed_effect: failedEffectCount,
    unreferenced_effect: unreferencedEffectCount,
    hidden_effect: hiddenEffectCount,
    private_actor_name: args.forbiddenActorNames.length,
    forbidden_fact_marker: args.forbiddenFactMarkers.length,
    forbidden_private_term: args.forbiddenPrivateTerms.length,
    uncommitted_proposal: args.uncommittedProposalCandidates?.length ?? 0,
  };

  return {
    hiddenEventCount,
    hiddenResponseCount,
    failedEffectCount,
    unreferencedEffectCount,
    hiddenEffectCount,
    privateActorNameCount: args.forbiddenActorNames.length,
    forbiddenFactMarkerCount: args.forbiddenFactMarkers.length,
    forbiddenPrivateTermCount: args.forbiddenPrivateTerms.length,
    uncommittedProposalCount: args.uncommittedProposalCandidates?.length ?? 0,
    retainedSourceRefCount: uniqueStrings(
      args.evidenceLedger.map((entry) => entry.sourceId ?? null),
    ).length,
    retainedEvidenceCount: args.evidenceLedger.length,
    excludedReasons,
  };
}

function redactionAuditHiddenExcludedCount(audit: NarratorPacketRedactionAudit): number {
  return audit.hiddenEventCount
    + audit.hiddenResponseCount
    + audit.failedEffectCount
    + audit.unreferencedEffectCount
    + audit.hiddenEffectCount
    + audit.privateActorNameCount
    + audit.forbiddenFactMarkerCount
    + audit.forbiddenPrivateTermCount
    + audit.uncommittedProposalCount;
}

export function getNarratorPacketRedactionAudit(
  packet: NarratorPacket,
): NarratorPacketRedactionAudit {
  if (packet.redactionAudit) {
    return packet.redactionAudit;
  }

  const audit = buildRedactionAudit({
    packet: packet.canonicalTurnPacket,
    perceivableEvents: packet.perceivableEvents,
    perceivableResponses: packet.perceivableResponses,
    perceivableEffects: packet.perceivableEffects,
    forbiddenActorNames: packet.forbiddenActorNames,
    forbiddenFactMarkers: packet.forbiddenFactMarkers,
    forbiddenPrivateTerms: packet.forbiddenPrivateTerms,
    evidenceLedger: packet.evidenceLedger ?? [],
    uncommittedProposalCandidates: [],
  });
  if ((packet.evidenceLedger ?? []).length > 0) {
    return audit;
  }

  const visibleItems = collectNarratorPromptVisibleItems(packet);
  return {
    ...audit,
    retainedSourceRefCount: uniqueStrings(visibleItems.map((item) => item.sourceId)).length,
    retainedEvidenceCount: visibleItems.length,
  };
}

function buildNarratorSourceLinkedSummaries(
  items: readonly NarratorPromptVisibleItem[],
): NarratorPacketSourceLinkedSummary[] {
  const budget = getFrameBudgetSpec("NarratorPacket");
  const overflow = items.slice(budget.maxSelectedItems);
  if (overflow.length === 0) {
    return [];
  }

  const sourceIds = uniqueStrings(overflow.map((item) => item.sourceId));
  return [{
    id: `narrator-summary:${sourceIds.slice(0, 4).join(":")}`,
    summary:
      `${overflow.length} additional player-visible packet records summarized for budget. `
      + "Source links are preserved internally.",
    sourceIds,
    summarizedItemCount: overflow.length,
  }];
}

function buildNarratorContextBudgetTrace(args: {
  packet: NarratorPacket;
  visibleItems: readonly NarratorPromptVisibleItem[];
  redactionAudit: NarratorPacketRedactionAudit;
  sourceLinkedSummaries: readonly NarratorPacketSourceLinkedSummary[];
}): ContextBudgetTrace {
  const budget = getFrameBudgetSpec("NarratorPacket");
  const overflowCount = Math.max(0, args.visibleItems.length - budget.maxSelectedItems);
  const sourceBackedCount = uniqueStrings([
    ...(args.packet.evidenceLedger ?? []).map((entry) => entry.sourceId ?? null),
    ...args.sourceLinkedSummaries.flatMap((summary) => summary.sourceIds),
  ]).length;

  return buildContextBudgetTrace({
    label: "NarratorPacket",
    frameType: "NarratorPacket",
    visibleTexts: [
      ...args.visibleItems.map((item) => item.text),
      ...args.sourceLinkedSummaries.map((summary) => summary.summary),
    ],
    visibleItemCount: args.visibleItems.length + args.sourceLinkedSummaries.length,
    hiddenExcludedCount: redactionAuditHiddenExcludedCount(args.redactionAudit),
    candidateItemCount:
      args.visibleItems.length
      + redactionAuditHiddenExcludedCount(args.redactionAudit),
    selectedItemCount: Math.min(args.visibleItems.length, budget.maxSelectedItems),
    summarizedItemCount: overflowCount,
    excludedByVisibilityCount:
      args.redactionAudit.hiddenEventCount
      + args.redactionAudit.hiddenResponseCount
      + args.redactionAudit.hiddenEffectCount
      + args.redactionAudit.privateActorNameCount
      + args.redactionAudit.forbiddenFactMarkerCount
      + args.redactionAudit.forbiddenPrivateTermCount
      + args.redactionAudit.uncommittedProposalCount,
    excludedByBudgetCount: 0,
    sourceLinkedSummaryCount: args.sourceLinkedSummaries.length,
    sectionCounts: {
      actors: args.packet.visibleActors.length,
      currentInventory: (args.packet.currentInventory ?? []).length,
      hints: args.packet.hintSignals.length,
      events: args.packet.perceivableEvents.length,
      responses: args.packet.perceivableResponses.length,
      effects: args.packet.perceivableEffects.length,
      observations: (args.packet.perceivableObservations ?? []).length,
      guardrails: args.packet.guardrails.length,
      sourceLinkedSummaries: args.sourceLinkedSummaries.length,
    },
    sourceCoverage: {
      sourceBackedCount,
      routeCounts: routeCountsFromItems(args.visibleItems),
    },
    notes: [
      "NarratorPacket audit counts hidden/private/proposal exclusions without formatting hidden payloads.",
      "Context pressure is diagnostic only; it must not clip model output.",
    ],
  });
}

export function buildNarratorPacket(args: BuildNarratorPacketArgs): NarratorPacket {
  const visibleActors = collectVisibleActors(args.frame);
  const currentInventory = collectCurrentInventory(args.frame);
  const perceivableEvents = collectPerceivableEvents(args.canonicalTurnPacket);
  const perceivableResponses = collectPerceivableResponses(args.canonicalTurnPacket);
  const rawForbiddenActorNames = collectForbiddenActorNames(args.frame);
  const forbiddenFactMarkers = collectForbiddenFactMarkers(
    args.frame,
    args.forbiddenFactMarkers,
  );
  const forbiddenPrivateTerms = uniqueStrings(args.forbiddenPrivateTerms ?? []);
  const hiddenSourceRedactionTerms = collectHiddenSourceRedactionTerms({
    frame: args.frame,
    forbiddenActorNames: rawForbiddenActorNames,
    forbiddenFactMarkers,
    forbiddenPrivateTerms,
  });
  const perceivableEffects = collectPerceivableEffects(
    args.canonicalTurnPacket,
    args.frame,
    hiddenSourceRedactionTerms,
    rawForbiddenActorNames,
    forbiddenFactMarkers,
    forbiddenPrivateTerms,
  );
  const perceivableObservations = collectPerceivableObservations({
    packet: args.canonicalTurnPacket,
    forbiddenActorNames: rawForbiddenActorNames,
    forbiddenFactMarkers,
    forbiddenPrivateTerms,
  });
  const hintSignals = collectHintSignals(args.frame);
  const hintSignalSourceRefs = collectHintSignalSourceRefs(args.frame);
  const committedVisibleActorCreationLabels = collectCommittedVisibleActorCreationLabels({
    packet: args.canonicalTurnPacket,
    perceivableEffects,
  });
  const evidenceLedger = collectEvidenceLedger({
    packet: args.canonicalTurnPacket,
    visibleActors,
    currentInventory,
    perceivableEvents,
    perceivableResponses,
    perceivableEffects,
    perceivableObservations,
    hintSignals,
    hintSignalSourceRefs,
  });
  const forbiddenActorNames = [...rawForbiddenActorNames];
  const redactionAudit = buildRedactionAudit({
    packet: args.canonicalTurnPacket,
    perceivableEvents,
    perceivableResponses,
    perceivableEffects,
    forbiddenActorNames,
    forbiddenFactMarkers,
    forbiddenPrivateTerms,
    evidenceLedger,
    uncommittedProposalCandidates: args.uncommittedProposalCandidates,
  });
  const packet: NarratorPacket = {
    campaignId: args.canonicalTurnPacket.campaignId,
    tick: args.canonicalTurnPacket.tick,
    playerAction: args.canonicalTurnPacket.playerAction,
    oracleOutcome: args.canonicalTurnPacket.oracleOutcome,
    anchorEvent: args.canonicalTurnPacket.anchorEvent,
    perceivableEvents,
    perceivableResponses,
    perceivableEffects,
    perceivableObservations,
    visibleActors,
    currentInventory,
    hintSignals,
    hintSignalSourceRefs,
    evidenceLedger,
    guardrails: [...args.canonicalTurnPacket.guardrails],
    controlReturnReason: args.canonicalTurnPacket.controlReturnReason,
    allowedVisibleActorNames: uniqueStrings([
      ...visibleActors.map((actor) => actor.label),
      ...committedVisibleActorCreationLabels,
    ]),
    forbiddenActorNames,
    forbiddenFactMarkers,
    forbiddenPrivateTerms,
    redactionAudit,
    canonicalTurnPacket: args.canonicalTurnPacket,
  };
  const visibleItems = collectNarratorPromptVisibleItems(packet);
  const sourceLinkedSummaries = buildNarratorSourceLinkedSummaries(visibleItems);
  packet.sourceLinkedSummaries = sourceLinkedSummaries;
  packet.contextBudgetTrace = buildNarratorContextBudgetTrace({
    packet,
    visibleItems,
    redactionAudit,
    sourceLinkedSummaries,
  });

  return packet;
}

export function repairPromptUnsafePerceivableEffects(packet: NarratorPacket): NarratorPacket {
  const unsafeEffects = packet.perceivableEffects.filter((effect) =>
    visibleEffectWouldLeakForbiddenTerm({
      effect,
      playerAction: packet.playerAction,
      forbiddenActorNames: packet.forbiddenActorNames,
      forbiddenFactMarkers: packet.forbiddenFactMarkers,
      forbiddenPrivateTerms: packet.forbiddenPrivateTerms,
    }),
  );
  if (unsafeEffects.length === 0) {
    return packet;
  }

  const unsafeEffectIds = new Set(unsafeEffects.map((effect) => effect.id));
  const unsafeActionIds = new Set(
    unsafeEffects
      .map((effect) => effect.actionId)
      .filter((value): value is string => Boolean(value)),
  );
  const safeEffects = packet.perceivableEffects.filter((effect) => !unsafeEffectIds.has(effect.id));
  const summaryLeaks = (source: string, text: string): boolean => {
    for (const term of uniqueStrings([
      ...packet.forbiddenActorNames,
      ...packet.forbiddenFactMarkers,
      ...packet.forbiddenPrivateTerms,
    ])) {
      const normalizedTerm = term.trim().toLowerCase();
      if (
        normalizedTerm
        && sourceBoundaryTermIsLeak({
          source,
          text,
          playerSourced: false,
          playerAction: packet.playerAction,
          normalizedTerm,
          toolName: null,
        })
      ) {
        return true;
      }
    }
    return false;
  };
  const evidenceLedger = (packet.evidenceLedger ?? []).filter((entry) => {
    if (entry.sourceId && (unsafeEffectIds.has(entry.sourceId) || unsafeActionIds.has(entry.sourceId))) {
      return false;
    }
    if (entry.category === "perceivable_effect" || entry.category === "tool_result") {
      const separatorIndex = entry.id.indexOf(":");
      const rawId = separatorIndex >= 0 ? entry.id.slice(separatorIndex + 1) : "";
      if (rawId && (unsafeEffectIds.has(rawId) || unsafeActionIds.has(rawId))) {
        return false;
      }
    }
    return !summaryLeaks(`evidence:${entry.category}`, entry.summary);
  });
  const sourceLinkedSummaries = (packet.sourceLinkedSummaries ?? []).filter((summary) =>
    !summary.sourceIds.some((sourceId) => unsafeEffectIds.has(sourceId) || unsafeActionIds.has(sourceId))
    && !summaryLeaks("source_linked_summary", summary.summary)
  );
  const redactionAudit = packet.redactionAudit
    ? {
        ...packet.redactionAudit,
        forbiddenPrivateTermCount:
          packet.redactionAudit.forbiddenPrivateTermCount + unsafeEffects.length,
        retainedEvidenceCount: evidenceLedger.length,
        excludedReasons: {
          ...packet.redactionAudit.excludedReasons,
          forbidden_private_term:
            packet.redactionAudit.excludedReasons.forbidden_private_term + unsafeEffects.length,
        },
      }
    : undefined;

  return {
    ...packet,
    perceivableEffects: safeEffects,
    evidenceLedger,
    sourceLinkedSummaries,
    redactionAudit,
    contextBudgetTrace: undefined,
  };
}

export function repairModelGuidancePerceivableResponses(packet: NarratorPacket): NarratorPacket {
  const retainedBackendResponseIds = new Set(
    packet.perceivableResponses
      .filter(responseContributesBackendFacts)
      .map((response) => response.id),
  );

  const perceivableResponses = packet.perceivableResponses.filter(
    (response) => retainedBackendResponseIds.has(response.id),
  );
  const originalEvidenceLedger = packet.evidenceLedger ?? [];
  const evidenceLedger = originalEvidenceLedger.filter(
    (entry) => {
      if (entry.category !== "perceivable_response") {
        return true;
      }
      return Boolean(entry.sourceId && retainedBackendResponseIds.has(entry.sourceId));
    },
  );
  const originalSourceLinkedSummaries = packet.sourceLinkedSummaries ?? [];
  const sourceLinkedSummaries = buildNarratorSourceLinkedSummaries(
    collectNarratorPromptVisibleItems({
      ...packet,
      perceivableResponses,
      evidenceLedger,
      sourceLinkedSummaries: [],
      contextBudgetTrace: undefined,
    }),
  );
  if (
    perceivableResponses.length === packet.perceivableResponses.length
    && evidenceLedger.length === originalEvidenceLedger.length
    && sourceLinkedSummariesEqual(sourceLinkedSummaries, originalSourceLinkedSummaries)
  ) {
    return packet;
  }

  const redactionAudit = packet.redactionAudit
    ? {
        ...packet.redactionAudit,
        retainedEvidenceCount: evidenceLedger.length,
      }
    : undefined;

  return {
    ...packet,
    perceivableResponses,
    evidenceLedger,
    sourceLinkedSummaries,
    redactionAudit,
    contextBudgetTrace: undefined,
  };
}

function sourceLinkedSummariesEqual(
  left: readonly NarratorPacketSourceLinkedSummary[],
  right: readonly NarratorPacketSourceLinkedSummary[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((summary, index) => {
    const other = right[index];
    return Boolean(other)
      && summary.id === other.id
      && summary.summary === other.summary
      && summary.summarizedItemCount === other.summarizedItemCount
      && summary.sourceIds.length === other.sourceIds.length
      && summary.sourceIds.every((sourceId, sourceIndex) => sourceId === other.sourceIds[sourceIndex]);
  });
}

function isPlayerActionEvent(event: CanonicalTurnPacketEvent): boolean {
  return event.kind === "player_action";
}

function promptSourceBoundaryText(
  packet: NarratorPacket,
): Array<{
  source: string;
  text: string;
  playerSourced: boolean;
  toolName?: CanonicalTurnPacketToolName | null;
}> {
  const texts: Array<{
    source: string;
    text: string | null | undefined;
    playerSourced?: boolean;
    toolName?: CanonicalTurnPacketToolName | null;
  }> = [
    { source: "oracle_outcome", text: packet.oracleOutcome },
    {
      source: "anchor_event:e0",
      text: packet.anchorEvent.summary,
      playerSourced: isPlayerActionEvent(packet.anchorEvent),
    },
    ...packet.perceivableEvents.map((event, index) => ({
      source: `committed_event:e${index + 1}`,
      text: event.summary,
      playerSourced: isPlayerActionEvent(event),
    })),
    ...packet.perceivableResponses.map((response, index) => ({
      source: `perceivable_response:r${index + 1}`,
      text: response.summary,
    })),
    ...packet.perceivableEffects.map((effect, index) => ({
      source: `perceivable_effect:f${index + 1}`,
      text: effect.summary,
      toolName: effect.toolName,
    })),
    ...(packet.perceivableObservations ?? []).flatMap((observation, observationIndex) =>
      observation.atoms.map((atom, atomIndex) => ({
        source: `observation_result:o${observationIndex + 1}.a${atomIndex + 1}`,
        text: atom.summary,
        toolName: observation.toolName,
      }))
    ),
    ...(packet.currentInventory ?? []).map((item, index) => ({
      source: `current_inventory_status:i${index + 1}`,
      text: formatInventoryStatusSummary(item),
    })),
    ...packet.hintSignals.map((hint, index) => ({
      source: `hint_signal:${index + 1}`,
      text: hint,
    })),
    ...packet.guardrails.map((guardrail, index) => ({
      source: `guardrail:${index + 1}`,
      text: guardrail,
    })),
    ...(packet.sourceLinkedSummaries ?? []).map((summary, index) => ({
      source: `source_linked_summary:s${index + 1}`,
      text: summary.summary,
    })),
    { source: "control_return", text: packet.controlReturnReason },
  ];

  return texts.filter(
    (entry): entry is {
      source: string;
      text: string;
      playerSourced?: boolean;
      toolName?: CanonicalTurnPacketToolName | null;
    } =>
      typeof entry.text === "string" && entry.text.length > 0,
  ).map((entry) => ({
    source: entry.source,
    text: sanitizeModelFacingText(entry.text),
    playerSourced: Boolean(entry.playerSourced),
    toolName: entry.toolName,
  }));
}

export function assertNarratorPacketPromptSafe(packet: NarratorPacket): void {
  const promptTexts = promptSourceBoundaryText(packet);
  const committedVisibleActorCreationLabels = collectCommittedVisibleActorCreationLabels({
    packet: packet.canonicalTurnPacket,
    perceivableEffects: packet.perceivableEffects,
  });
  const forbiddenTermGroups = [
    {
      terms: packet.forbiddenActorNames,
      allowCommittedActorCreation: true,
    },
    {
      terms: packet.forbiddenFactMarkers,
      allowCommittedActorCreation: false,
    },
    {
      terms: packet.forbiddenPrivateTerms,
      allowCommittedActorCreation: false,
    },
  ];

  for (const group of forbiddenTermGroups) {
    for (const term of uniqueStrings(group.terms)) {
      const normalizedTerm = term.trim().toLowerCase();
      if (!normalizedTerm) {
        continue;
      }
      const leak = promptTexts.find((entry) => {
        if (
          group.allowCommittedActorCreation
          && forbiddenActorNameIsAllowedVisibleLabel(term, packet.allowedVisibleActorNames)
        ) {
          return false;
        }
        if (
          group.allowCommittedActorCreation
          && sourceBoundaryTermIsAllowedCommittedActorCreation({
            source: entry.source,
            text: entry.text,
            toolName: entry.toolName as RuntimeToolName | null | undefined,
            forbiddenTerm: term,
            committedVisibleActorCreationLabels,
          })
        ) {
          return false;
        }
        return sourceBoundaryTermIsLeak({
          source: entry.source,
          text: entry.text,
          playerSourced: entry.playerSourced,
          playerAction: packet.playerAction,
          normalizedTerm,
          toolName: entry.toolName as RuntimeToolName | null | undefined,
        });
      });
      if (leak) {
        throw new NarratorPacketPromptSafetyError(
          `NarratorPacket prompt unsafe: forbidden packet term would be formatted from ${leak.source}.`,
          term,
        );
      }
    }
  }
}

export function sourceBoundaryTermIsAllowedCommittedActorCreation(args: {
  source: string;
  text: string;
  toolName?: RuntimeToolName | null;
  forbiddenTerm: string;
  committedVisibleActorCreationLabels: readonly string[];
}): boolean {
  if (!args.source.startsWith("perceivable_effect:")) return false;
  if (!args.toolName || !isActorCreationToolName(args.toolName)) return false;
  const normalizedText = normalizeActorPromptSafetyLabel(args.text);
  return args.committedVisibleActorCreationLabels.some((label) => {
    const normalizedLabel = normalizeActorPromptSafetyLabel(label);
    return forbiddenActorNameMatchesCommittedVisibleActorLabel(args.forbiddenTerm, normalizedLabel)
      && actorPromptSafetyLabelContainsWholeTokens(normalizedText, normalizedLabel);
  });
}

function formatEvent(event: CanonicalTurnPacketEvent, index: number): string {
  return `- e${index + 1}: ${sanitizeModelFacingText(event.summary)} [kind=${event.kind}]`;
}

function formatResponse(response: CanonicalTurnPacketResponse, index: number): string {
  return `- r${index + 1}: ${sanitizeModelFacingText(response.summary)} [kind=${response.responseKind}]`;
}

function formatEffect(effect: CanonicalTurnPacketEffect, index: number): string {
  return `- f${index + 1}: ${sanitizeModelFacingText(effect.summary)}`;
}

function formatObservation(observation: NarratorPacketObservation, index: number): string {
  const lines = [`- o${index + 1}: ${sanitizeModelFacingText(observation.toolName)}`];
  for (let atomIndex = 0; atomIndex < observation.atoms.length; atomIndex += 1) {
    const atom = observation.atoms[atomIndex]!;
    lines.push(
      `  - o${index + 1}.a${atomIndex + 1} [${atom.kind}]: ${sanitizeModelFacingText(atom.summary)}`,
    );
  }
  return lines.join("\n");
}

function formatEvidence(evidence: NarratorPacketEvidence, index: number): string {
  return `- p${index + 1} [category=${evidence.category}]`;
}

function formatSourceLinkedSummary(summary: NarratorPacketSourceLinkedSummary): string {
  return `- ${sanitizeModelFacingText(summary.summary)}`;
}

function formatRedactionAudit(audit: NarratorPacketRedactionAudit): string[] {
  return [
    `- hiddenEventCount: ${audit.hiddenEventCount}`,
    `- hiddenResponseCount: ${audit.hiddenResponseCount}`,
    `- failedEffectCount: ${audit.failedEffectCount}`,
    `- unreferencedEffectCount: ${audit.unreferencedEffectCount}`,
    `- hiddenEffectCount: ${audit.hiddenEffectCount}`,
    `- privateActorNameCount: ${audit.privateActorNameCount}`,
    `- forbiddenFactMarkerCount: ${audit.forbiddenFactMarkerCount}`,
    `- forbiddenPrivateTermCount: ${audit.forbiddenPrivateTermCount}`,
    `- uncommittedProposalCount: ${audit.uncommittedProposalCount}`,
    `- retainedSourceRefCount: ${audit.retainedSourceRefCount}`,
    `- retainedEvidenceCount: ${audit.retainedEvidenceCount}`,
  ];
}

function formatContextBudgetTrace(trace: ContextBudgetTrace | undefined): string[] {
  if (!trace) {
    return ["- No context budget trace is available."];
  }

  return [
    `- frameType: ${trace.frameType ?? "unknown"}`,
    `- estimatedInputTokens: ${trace.estimatedInputTokens}`,
    `- selectedItemCount: ${trace.selectedItemCount}`,
    `- summarizedItemCount: ${trace.summarizedItemCount}`,
    `- hiddenExcludedCount: ${trace.hiddenExcludedCount}`,
    `- sourceLinkedSummaryCount: ${trace.sourceLinkedSummaryCount}`,
    `- didClipModelOutput: ${trace.didClipModelOutput}`,
    ...(trace.overflowWarnings.length > 0
      ? trace.overflowWarnings.map((warning) =>
          `- overflowWarning: ${warning.code}${warning.count ? ` (${warning.count})` : ""}`,
        )
      : ["- overflowWarnings: none"]),
  ];
}

export function formatNarratorPacketForPrompt(packet: NarratorPacket): string {
  assertNarratorPacketPromptSafe(packet);
  const redactionAudit = getNarratorPacketRedactionAudit(packet);
  const sourceLinkedSummaries = packet.sourceLinkedSummaries ?? [];

  return [
    "[NARRATOR PACKET]",
    "Packet scope: current settled turn.",
    `Tick: ${packet.tick}`,
    `Player action request: ${sanitizeModelFacingConversationText(packet.playerAction, {
      extraForbiddenTerms: [
        ...packet.forbiddenActorNames,
        ...packet.forbiddenFactMarkers,
        ...packet.forbiddenPrivateTerms,
      ],
    })}`,
    "Player action and player_action event summaries are player-supplied claims, not authoritative world state. Treat claimed possessions, locations, NPC consent, names, or completed acquisitions as attempts unless committed non-player events/effects/tool results below confirm them.",
    `Oracle outcome: ${packet.oracleOutcome ? sanitizeModelFacingText(packet.oracleOutcome) : "none"}`,
    "",
    "[VISIBLE ACTORS]",
    ...(packet.visibleActors.length > 0
      ? packet.visibleActors.map((actor) => `- ${sanitizeModelFacingText(actor.label)} (${actor.type})`)
      : ["- No confirmed visible actors."]),
    "",
    "[CURRENT INVENTORY STATUS]",
    ...((packet.currentInventory ?? []).length > 0
      ? (packet.currentInventory ?? []).map((item) =>
          `- ${sanitizeModelFacingText(formatInventoryStatusSummary(item))}`)
      : ["- No carried, equipped, or signature items are currently recorded."]),
    "",
    "[HINT SIGNALS]",
    ...(packet.hintSignals.length > 0
      ? packet.hintSignals.map((hint) => `- ${sanitizeModelFacingText(hint)}`)
      : ["- No indirect awareness hints are in scope."]),
    "",
    "[COMMITTED EVENTS]",
    ...(packet.perceivableEvents.length > 0
      ? packet.perceivableEvents.map(formatEvent)
      : ["- No committed events are in scope."]),
    "",
    "[PERCEIVABLE RESPONSES]",
    ...(packet.perceivableResponses.length > 0
      ? packet.perceivableResponses.map(formatResponse)
      : ["- No player-perceivable responses are in scope."]),
    "",
    "[PERCEIVABLE EFFECTS]",
    ...(packet.perceivableEffects.length > 0
      ? packet.perceivableEffects.map(formatEffect)
      : ["- No player-perceivable effects are in scope."]),
    "",
    "[PLAYER-VISIBLE OBSERVATIONS]",
    ...((packet.perceivableObservations ?? []).length > 0
      ? (packet.perceivableObservations ?? []).map(formatObservation)
      : ["- No lookup-grounded observations are in scope."]),
    "",
    "[GUARDRAILS]",
    ...(packet.guardrails.length > 0
      ? packet.guardrails.map((guardrail) => `- ${sanitizeModelFacingText(guardrail)}`)
      : ["- Stay within the committed packet."]),
    "",
    "[EVIDENCE LEDGER]",
    ...((packet.evidenceLedger ?? []).length > 0
      ? (packet.evidenceLedger ?? []).map(formatEvidence)
      : ["- No packet evidence refs are in scope."]),
    "",
    "[SOURCE-LINKED SUMMARIES]",
    ...(sourceLinkedSummaries.length > 0
      ? sourceLinkedSummaries.map(formatSourceLinkedSummary)
      : ["- No source-linked overflow summaries were needed."]),
    "",
    "[REDACTION AUDIT]",
    ...formatRedactionAudit(redactionAudit),
    "",
    "[CONTEXT BUDGET TRACE]",
    ...formatContextBudgetTrace(packet.contextBudgetTrace),
    "",
    "[CONTROL RETURN]",
    sanitizeModelFacingText(packet.controlReturnReason),
  ].join("\n");
}
