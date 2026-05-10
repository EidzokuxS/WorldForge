import type { NarrativeOutcomeBounds } from "./combat-envelope.js";
import type { SceneActor, SceneFrame } from "./scene-frame.js";
import type { ToolResult } from "./tool-executor.js";
import { isObservationToolResult } from "./tool-result.js";
import type { RuntimeToolName } from "./tool-schemas.js";
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

export interface CanonicalTurnPacketNarratorFacts {
  anchorEventId: string;
  eventIds: string[];
  responseIds: string[];
  actionIds: string[];
  toolResultRefs: Array<{
    actionId: string;
    toolName: RuntimeToolName;
  }>;
}

export interface CanonicalTurnPacketActionResult {
  order: number;
  actionId: string;
  actionRef: string;
  actorId: string;
  toolName: RuntimeToolName;
  input: unknown;
  args: unknown;
  result: ToolResult;
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
    toolName: RuntimeToolName;
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
}

export interface CanonicalTurnPacketEffect {
  id: string;
  actionId?: string;
  actorId?: string;
  toolName?: RuntimeToolName;
  summary: string;
  perceivableByPlayer: boolean;
  toolResult?: ToolResult;
}

export interface CanonicalTurnPacket {
  campaignId: string;
  tick: number;
  playerAction: string;
  oracleOutcome: string | null;
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

export type NarratorPacketEvidenceCategory =
  | "player_action_request"
  | "oracle_outcome"
  | "anchor_event"
  | "committed_event"
  | "perceivable_response"
  | "perceivable_effect"
  | "visible_actor"
  | "hint_signal"
  | "world_thread_signal"
  | "guardrail"
  | "control_return"
  | "tool_result";

export interface NarratorPacketEvidence {
  id: string;
  category: NarratorPacketEvidenceCategory;
  summary: string;
  sourceId?: string;
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
  playerAction: string;
  oracleOutcome: string | null;
  anchorEvent: CanonicalTurnPacketEvent;
  perceivableEvents: CanonicalTurnPacketEvent[];
  perceivableResponses: CanonicalTurnPacketResponse[];
  perceivableEffects: CanonicalTurnPacketEffect[];
  visibleActors: NarratorPacketActor[];
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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
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

function collectVisibleActors(frame: SceneFrame): NarratorPacketActor[] {
  return [...frame.roster.active, ...frame.roster.support]
    .filter((actor) => actor.awareness === "clear")
    .map((actor) => ({
      id: actor.id,
      label: actor.label,
      type: actor.type,
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

function collectEvidenceLedger(args: {
  packet: CanonicalTurnPacket;
  visibleActors: NarratorPacketActor[];
  perceivableEvents: CanonicalTurnPacketEvent[];
  perceivableResponses: CanonicalTurnPacketResponse[];
  perceivableEffects: CanonicalTurnPacketEffect[];
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
    add({
      id: evidenceId("perceivable_effect", effect.id),
      category: "perceivable_effect",
      summary: effect.summary,
      sourceId: effect.id,
    });
    if (effect.actionId && effect.toolName) {
      add({
        id: evidenceId("tool_result", `${effect.actionId}:${effect.toolName}`),
        category: "tool_result",
        summary: `${formatToolName(effect.toolName)} result is player-perceivable through effect ${effect.id}.`,
        sourceId: `${effect.actionId}:${effect.toolName}`,
      });
    }
  }
  for (const actor of args.visibleActors) {
    add({
      id: evidenceId("visible_actor", actor.id),
      category: "visible_actor",
      summary: actor.label,
      sourceId: actor.id,
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

function summarizeFirstListEntry(values: readonly string[], fallback: string): string {
  const first = values[0]?.trim();
  if (!first) return fallback;
  return first.length > 180 ? `${first.slice(0, 177)}...` : first;
}

function toolField(input: unknown, args: unknown, key: string): string | null {
  return readRecordString(input, key) ?? readRecordString(args, key);
}

function formatToolName(toolName: RuntimeToolName): string {
  return toolName.replace(/_/g, " ");
}

export function summarizeRuntimeToolResultForNarrator(input: {
  toolName: RuntimeToolName;
  actionId: string;
  toolInput: unknown;
  toolArgs: unknown;
  toolResult?: ToolResult;
}): string {
  const { toolName, toolInput, toolArgs, toolResult } = input;
  const acceptedResult = toolResult?.success === true ? toolResult.result : null;
  const acceptedField = (key: string): string | null => readRecordString(acceptedResult, key);

  switch (toolName) {
    case "log_event":
      return clarifyUnconfirmedClaimSummary(
        toolField(toolInput, toolArgs, "text")
          ?? toolField(toolInput, toolArgs, "summary")
          ?? "A future-relevant local event is recorded.",
      );
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
      const tag = toolField(toolInput, toolArgs, "tag") ?? "a new state";
      return `${entityName} gains ${tag}.`;
    }
    case "remove_tag": {
      const entityName = toolField(toolInput, toolArgs, "entityName") ?? "An entity";
      const tag = toolField(toolInput, toolArgs, "tag") ?? "a prior state";
      return `${entityName} is no longer marked by ${tag}.`;
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
      return `The scene moves to ${targetLocationName}.`;
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
      const itemName = toolField(toolInput, toolArgs, "itemName") ?? "An item";
      const targetName = toolField(toolInput, toolArgs, "targetName") ?? "a new holder";
      return `${itemName} moves to ${targetName}.`;
    }
    default:
      return `A validated ${formatToolName(toolName)} consequence settles in the scene.`;
  }
}

function clarifyUnconfirmedClaimSummary(summary: string): string {
  if (
    /\bclaim(?:ed|s)?\s+to\s+(?:possess|have|hold|own)\b/i.test(summary) &&
    /\beither\b[^.]{0,160}\bdoesn'?t\s+exist\b/i.test(summary)
  ) {
    return summary.replace(
      /\bThe\s+[^.]{1,120}?\s+did\s+not\s+work\s+[-—]\s+either\s+[^.]+?\./i,
      "No confirmed possession or access is established; the claim is visibly challenged.",
    );
  }

  return summary;
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
    .filter((response): response is CanonicalTurnPacketResponse =>
      Boolean(response?.visibleToPlayer),
    );
}

function collectPerceivableEffects(packet: CanonicalTurnPacket): CanonicalTurnPacketEffect[] {
  const actionIds = new Set(packet.narratorFacts.actionIds);
  const toolResultRefs = new Set(
    packet.narratorFacts.toolResultRefs.map((ref) => `${ref.actionId}:${ref.toolName}`),
  );
  const generatedEffects = packet.actionResults
    .filter(
      (result) =>
        result.result.success
        && !isObservationToolResult(result.result)
        && (
          actionIds.has(result.actionId)
          || toolResultRefs.has(`${result.actionId}:${result.toolName}`)
        ),
    )
    .map(buildActionResultEffect);

  return uniqueById([
    ...packet.effects.filter(
      (effect) =>
        effect.perceivableByPlayer
        && effect.toolResult?.success !== false
        && !(effect.toolResult && isObservationToolResult(effect.toolResult))
        && (
          (effect.actionId ? actionIds.has(effect.actionId) : false)
          || (effect.actionId && effect.toolName
            ? toolResultRefs.has(`${effect.actionId}:${effect.toolName}`)
            : false)
        ),
    ),
    ...generatedEffects,
  ]);
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
    ...packet.visibleActors.map((actor) => ({
      id: actor.id,
      category: "visible_actor",
      text: actor.label,
      sourceId: actor.id,
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
      .map((effect) => effect.id.replace(/^action-result:/u, "")),
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
      + `Sources: ${sourceIds.slice(0, 8).join(", ")}.`,
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
      hints: args.packet.hintSignals.length,
      events: args.packet.perceivableEvents.length,
      responses: args.packet.perceivableResponses.length,
      effects: args.packet.perceivableEffects.length,
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
  const perceivableEvents = collectPerceivableEvents(args.canonicalTurnPacket);
  const perceivableResponses = collectPerceivableResponses(args.canonicalTurnPacket);
  const perceivableEffects = collectPerceivableEffects(args.canonicalTurnPacket);
  const hintSignals = collectHintSignals(args.frame);
  const hintSignalSourceRefs = collectHintSignalSourceRefs(args.frame);
  const evidenceLedger = collectEvidenceLedger({
    packet: args.canonicalTurnPacket,
    visibleActors,
    perceivableEvents,
    perceivableResponses,
    perceivableEffects,
    hintSignals,
    hintSignalSourceRefs,
  });
  const forbiddenActorNames = collectForbiddenActorNames(args.frame);
  const forbiddenFactMarkers = collectForbiddenFactMarkers(
    args.frame,
    args.forbiddenFactMarkers,
  );
  const forbiddenPrivateTerms = uniqueStrings(args.forbiddenPrivateTerms ?? []);
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
    visibleActors,
    hintSignals,
    hintSignalSourceRefs,
    evidenceLedger,
    guardrails: [...args.canonicalTurnPacket.guardrails],
    controlReturnReason: args.canonicalTurnPacket.controlReturnReason,
    allowedVisibleActorNames: visibleActors.map((actor) => actor.label),
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

function isPlayerActionEvent(event: CanonicalTurnPacketEvent): boolean {
  return event.kind === "player_action";
}

function promptSourceBoundaryText(
  packet: NarratorPacket,
): Array<{
  source: string;
  text: string;
  playerSourced: boolean;
  toolName?: RuntimeToolName | null;
}> {
  const texts: Array<{
    source: string;
    text: string | null | undefined;
    playerSourced?: boolean;
    toolName?: RuntimeToolName | null;
  }> = [
    { source: "oracle_outcome", text: packet.oracleOutcome },
    {
      source: `anchor_event:${packet.anchorEvent.id}`,
      text: packet.anchorEvent.summary,
      playerSourced: isPlayerActionEvent(packet.anchorEvent),
    },
    ...packet.perceivableEvents.map((event) => ({
      source: `perceivable_event:${event.id}`,
      text: event.summary,
      playerSourced: isPlayerActionEvent(event),
    })),
    ...packet.perceivableResponses.map((response) => ({
      source: `perceivable_response:${response.id}`,
      text: response.summary,
    })),
    ...packet.perceivableEffects.map((effect) => ({
      source: `perceivable_effect:${effect.id}`,
      text: effect.summary,
      toolName: effect.toolName,
    })),
    ...packet.hintSignals.map((hint, index) => ({
      source: `hint_signal:${index + 1}`,
      text: hint,
    })),
    ...packet.guardrails.map((guardrail, index) => ({
      source: `guardrail:${index + 1}`,
      text: guardrail,
    })),
    ...(packet.sourceLinkedSummaries ?? []).map((summary) => ({
      source: `source_linked_summary:${summary.id}`,
      text: summary.summary,
    })),
    { source: "control_return", text: packet.controlReturnReason },
  ];

  return texts.filter(
    (entry): entry is {
      source: string;
      text: string;
      playerSourced?: boolean;
      toolName?: RuntimeToolName | null;
    } =>
      typeof entry.text === "string" && entry.text.length > 0,
  ).map((entry) => ({
    source: entry.source,
    text: entry.text,
    playerSourced: Boolean(entry.playerSourced),
    toolName: entry.toolName,
  }));
}

export function assertNarratorPacketPromptSafe(packet: NarratorPacket): void {
  const forbiddenTerms = uniqueStrings([
    ...packet.forbiddenActorNames,
    ...packet.forbiddenFactMarkers,
    ...packet.forbiddenPrivateTerms,
  ]);
  const promptTexts = promptSourceBoundaryText(packet);

  for (const term of forbiddenTerms) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) {
      continue;
    }
    const leak = promptTexts.find((entry) => {
      return sourceBoundaryTermIsLeak({
        source: entry.source,
        text: entry.text,
        playerSourced: entry.playerSourced,
        playerAction: packet.playerAction,
        normalizedTerm,
        toolName: entry.toolName,
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

function formatEvent(event: CanonicalTurnPacketEvent): string {
  return `- ${event.id}: ${event.summary} [actor=${event.actorId}; kind=${event.kind}]`;
}

function formatResponse(response: CanonicalTurnPacketResponse): string {
  return `- ${response.id}: ${response.summary} [actor=${response.actorId}; event=${response.eventId}; kind=${response.responseKind}]`;
}

function formatEffect(effect: CanonicalTurnPacketEffect): string {
  const refs = [
    effect.actionId ? `action=${effect.actionId}` : null,
    effect.actorId ? `actor=${effect.actorId}` : null,
    effect.toolName ? `tool=${effect.toolName}` : null,
  ].filter((value): value is string => Boolean(value));

  return `- ${effect.id}: ${effect.summary}${refs.length > 0 ? ` [${refs.join("; ")}]` : ""}`;
}

function formatEvidence(evidence: NarratorPacketEvidence): string {
  return `- ${evidence.id} [category=${evidence.category}]`;
}

function formatSourceLinkedSummary(summary: NarratorPacketSourceLinkedSummary): string {
  return `- ${summary.id}: ${summary.summary} [sources=${summary.sourceIds.join(", ")}]`;
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
    `Campaign: ${packet.campaignId}`,
    `Tick: ${packet.tick}`,
    `Player action request: ${packet.playerAction}`,
    "Player action and player_action event summaries are player-supplied claims, not authoritative world state. Treat claimed possessions, locations, NPC consent, names, or completed acquisitions as attempts unless committed non-player events/effects/tool results below confirm them.",
    `Oracle outcome: ${packet.oracleOutcome ?? "none"}`,
    `Anchor event: ${packet.anchorEvent.id}`,
    "",
    "[VISIBLE ACTORS]",
    ...(packet.visibleActors.length > 0
      ? packet.visibleActors.map((actor) => `- ${actor.label} (${actor.id}; ${actor.type})`)
      : ["- No confirmed visible actors."]),
    "",
    "[HINT SIGNALS]",
    ...(packet.hintSignals.length > 0
      ? packet.hintSignals.map((hint) => `- ${hint}`)
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
    "[GUARDRAILS]",
    ...(packet.guardrails.length > 0
      ? packet.guardrails.map((guardrail) => `- ${guardrail}`)
      : ["- Stay within the committed packet."]),
    "",
    "[EVIDENCE LEDGER]",
    ...((packet.evidenceLedger ?? []).length > 0
      ? (packet.evidenceLedger ?? []).map(formatEvidence)
      : ["- No packet evidence ids are in scope."]),
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
    packet.controlReturnReason,
  ].join("\n");
}
