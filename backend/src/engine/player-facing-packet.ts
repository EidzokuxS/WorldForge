import type {
  CanonicalTurnPacketEffect,
  CanonicalTurnPacketEvent,
  CanonicalTurnPacketResponse,
  NarratorPacket,
  NarratorPacketActor,
} from "./narrator-packet.js";
import { sourceBoundaryTermIsLeak } from "./source-boundary.js";
import type { RuntimeToolName } from "./tool-schemas.js";
import {
  buildContextBudgetTrace,
  type ContextBudgetTrace,
} from "./context-budget-trace.js";

export type PlayerFacingPacketSourceKind =
  | "player_action_request"
  | "oracle_outcome"
  | "anchor_event"
  | "committed_event"
  | "perceivable_response"
  | "perceivable_effect"
  | "visible_actor"
  | "hint_signal"
  | "world_thread_signal"
  | "guardrail";

export interface PlayerFacingPacketSourceRef {
  id: string;
  kind: PlayerFacingPacketSourceKind;
}

export interface PlayerFacingPacketAudit {
  sourceCount: number;
  visibleTextCount: number;
  hiddenExcludedCount: number;
  forbiddenTermCount: number;
  canonicalTurnPacketOmitted: true;
}

export interface PlayerFacingPacket {
  campaignId: string;
  tick: number;
  playerActionRequest: string;
  oracleOutcome: string | null;
  anchorEvent: CanonicalTurnPacketEvent;
  committedEvents: CanonicalTurnPacketEvent[];
  perceivableResponses: CanonicalTurnPacketResponse[];
  perceivableEffects: CanonicalTurnPacketEffect[];
  visibleActors: NarratorPacketActor[];
  hintSignals: string[];
  guardrails: string[];
  controlReturnReason: string;
  sourceRefs: PlayerFacingPacketSourceRef[];
  forbiddenTerms: string[];
  audit: PlayerFacingPacketAudit;
  contextBudgetTrace: ContextBudgetTrace;
}

export class PlayerFacingPacketSafetyError extends Error {
  constructor(
    message: string,
    public readonly term: string,
  ) {
    super(message);
    this.name = "PlayerFacingPacketSafetyError";
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

function visibleTexts(packet: PlayerFacingPacket): string[] {
  return [
    packet.playerActionRequest,
    packet.oracleOutcome,
    packet.anchorEvent.summary,
    ...packet.committedEvents.map((event) => event.summary),
    ...packet.perceivableResponses.map((response) => response.summary),
    ...packet.perceivableEffects.map((effect) => effect.summary),
    ...packet.visibleActors.map((actor) => actor.label),
    ...packet.hintSignals,
    ...packet.guardrails,
    packet.controlReturnReason,
  ].filter((text): text is string => typeof text === "string" && text.length > 0);
}

function sourceBoundaryCheckedTexts(
  packet: PlayerFacingPacket,
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
    ...packet.committedEvents.map((event) => ({
      source: `committed_event:${event.id}`,
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
    ...packet.visibleActors.map((actor) => ({
      source: `visible_actor:${actor.id}`,
      text: actor.label,
    })),
    ...packet.hintSignals.map((hint, index) => ({
      source: `hint_signal:${index + 1}`,
      text: hint,
    })),
    ...packet.guardrails.map((guardrail, index) => ({
      source: `guardrail:${index + 1}`,
      text: guardrail,
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

function isPlayerActionEvent(event: CanonicalTurnPacketEvent): boolean {
  return event.kind === "player_action";
}

function sourceRefsFromNarratorPacket(packet: NarratorPacket): PlayerFacingPacketSourceRef[] {
  return [
    { id: "player-action", kind: "player_action_request" },
    ...(packet.oracleOutcome ? [{ id: "oracle-outcome", kind: "oracle_outcome" as const }] : []),
    { id: packet.anchorEvent.id, kind: "anchor_event" },
    ...packet.perceivableEvents.map((event) => ({
      id: event.id,
      kind: "committed_event" as const,
    })),
    ...packet.perceivableResponses.map((response) => ({
      id: response.id,
      kind: "perceivable_response" as const,
    })),
    ...packet.perceivableEffects.map((effect) => ({
      id: effect.id,
      kind: "perceivable_effect" as const,
    })),
    ...packet.visibleActors.map((actor) => ({
      id: actor.id,
      kind: "visible_actor" as const,
    })),
    ...(packet.hintSignalSourceRefs && packet.hintSignalSourceRefs.length === packet.hintSignals.length
      ? packet.hintSignalSourceRefs.map((source) => ({
          id: source.id,
          kind: source.kind,
        }))
      : packet.hintSignals.map((_, index) => ({
          id: `hint:${index + 1}`,
          kind: "hint_signal" as const,
        }))),
    ...packet.guardrails.map((_, index) => ({
      id: `guardrail:${index + 1}`,
      kind: "guardrail" as const,
    })),
  ];
}

function countHiddenExclusions(packet: NarratorPacket): number {
  const hiddenEventCount = packet.canonicalTurnPacket.events
    .filter((event) => !event.perceivableByPlayer)
    .length;
  const hiddenResponseCount = packet.canonicalTurnPacket.responses
    .filter((response) => !response.visibleToPlayer)
    .length;
  const hiddenEffectCount = packet.canonicalTurnPacket.effects
    .filter((effect) => !effect.perceivableByPlayer || effect.toolResult?.success === false)
    .length;

  return hiddenEventCount
    + hiddenResponseCount
    + hiddenEffectCount
    + packet.forbiddenActorNames.length
    + packet.forbiddenFactMarkers.length
    + packet.forbiddenPrivateTerms.length;
}

export function buildPlayerFacingPacketFromNarratorPacket(
  packet: NarratorPacket,
): PlayerFacingPacket {
  const forbiddenTerms = uniqueStrings([
    ...packet.forbiddenActorNames,
    ...packet.forbiddenFactMarkers,
    ...packet.forbiddenPrivateTerms,
  ]);
  const sourceRefs = sourceRefsFromNarratorPacket(packet);
  const hiddenExcludedCount = countHiddenExclusions(packet);
  const playerFacingPacket: PlayerFacingPacket = {
    campaignId: packet.campaignId,
    tick: packet.tick,
    playerActionRequest: packet.playerAction,
    oracleOutcome: packet.oracleOutcome,
    anchorEvent: packet.anchorEvent,
    committedEvents: [...packet.perceivableEvents],
    perceivableResponses: [...packet.perceivableResponses],
    perceivableEffects: [...packet.perceivableEffects],
    visibleActors: [...packet.visibleActors],
    hintSignals: [...packet.hintSignals],
    guardrails: [...packet.guardrails],
    controlReturnReason: packet.controlReturnReason,
    sourceRefs,
    forbiddenTerms,
    audit: {
      sourceCount: sourceRefs.length,
      visibleTextCount: 0,
      hiddenExcludedCount,
      forbiddenTermCount: forbiddenTerms.length,
      canonicalTurnPacketOmitted: true,
    },
    contextBudgetTrace: buildContextBudgetTrace({
      label: "PlayerFacingPacket",
      visibleTexts: [],
      visibleItemCount: 0,
      hiddenExcludedCount,
      candidateItemCount:
        packet.canonicalTurnPacket.events.length
        + packet.canonicalTurnPacket.responses.length
        + packet.canonicalTurnPacket.effects.length
        + packet.canonicalTurnPacket.actionResults.length,
      sectionCounts: {},
      sourceCoverage: {
        sourceBackedCount: sourceRefs.length,
      },
      notes: [
        "PlayerFacingPacket is derived from NarratorPacket and intentionally omits raw canonicalTurnPacket.",
        "Context pressure is diagnostic only; it must not clip model output.",
      ],
    }),
  };
  const texts = visibleTexts(playerFacingPacket);
  playerFacingPacket.audit.visibleTextCount = texts.length;
  playerFacingPacket.contextBudgetTrace = buildContextBudgetTrace({
    label: "PlayerFacingPacket",
    visibleTexts: texts,
    visibleItemCount: texts.length,
    hiddenExcludedCount,
    candidateItemCount:
      packet.canonicalTurnPacket.events.length
      + packet.canonicalTurnPacket.responses.length
      + packet.canonicalTurnPacket.effects.length
      + packet.canonicalTurnPacket.actionResults.length,
      sectionCounts: {
        actors: packet.visibleActors.length,
        hints: packet.hintSignals.length,
        events: packet.perceivableEvents.length,
        responses: packet.perceivableResponses.length,
        effects: packet.perceivableEffects.length,
        guardrails: packet.guardrails.length,
      },
      sourceCoverage: {
        sourceBackedCount: sourceRefs.length,
      },
      notes: [
      "PlayerFacingPacket is derived from NarratorPacket and intentionally omits raw canonicalTurnPacket.",
      "Context pressure is diagnostic only; it must not clip model output.",
    ],
  });

  assertPlayerFacingPacketPromptSafe(playerFacingPacket);
  return playerFacingPacket;
}

export function assertPlayerFacingPacketPromptSafe(packet: PlayerFacingPacket): void {
  const texts = sourceBoundaryCheckedTexts(packet);
  for (const term of packet.forbiddenTerms) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) {
      continue;
    }
    const leak = texts.find((entry) => {
      return sourceBoundaryTermIsLeak({
        source: entry.source,
        text: entry.text,
        playerSourced: entry.playerSourced,
        playerAction: packet.playerActionRequest,
        normalizedTerm,
        toolName: entry.toolName,
      });
    });
    if (leak) {
      throw new PlayerFacingPacketSafetyError(
        `PlayerFacingPacket unsafe: forbidden packet term would be formatted from ${leak.source}.`,
        term,
      );
    }
  }
}

function formatListSection(
  title: string,
  lines: readonly string[],
  emptyLine: string,
): string {
  return [
    `[${title}]`,
    ...(lines.length > 0 ? lines : [`- ${emptyLine}`]),
  ].join("\n");
}

export function formatPlayerFacingPacketForPrompt(packet: PlayerFacingPacket): string {
  assertPlayerFacingPacketPromptSafe(packet);

  return [
    "[PLAYER-FACING PACKET]",
    "[NARRATOR PACKET]",
    "Boundary: NarratorPacket -> PlayerFacingPacket. Raw canonical turn payload, hidden truth, private rationale, unresolved proposals, and offscreen facts are not included.",
    `Campaign: ${packet.campaignId}`,
    `Tick: ${packet.tick}`,
    `Player action request: ${packet.playerActionRequest}`,
    "Player action and player_action event summaries are player-supplied claims, not authoritative world state. Treat claimed possessions, locations, NPC consent, names, or completed acquisitions as attempts unless committed non-player events/effects/tool results below confirm them.",
    `Oracle outcome: ${packet.oracleOutcome ?? "none"}`,
    `Anchor event: ${packet.anchorEvent.id}`,
    "",
    formatListSection(
      "VISIBLE ACTORS",
      packet.visibleActors.map((actor) => `- ${actor.label} (${actor.id}; ${actor.type})`),
      "No confirmed visible actors.",
    ),
    "",
    formatListSection(
      "HINT SIGNALS",
      packet.hintSignals.map((hint) => `- ${hint}`),
      "No indirect awareness hints are in scope.",
    ),
    "",
    formatListSection(
      "COMMITTED EVENTS",
      packet.committedEvents.map(formatEvent),
      "No committed events are in scope.",
    ),
    "",
    formatListSection(
      "PERCEIVABLE RESPONSES",
      packet.perceivableResponses.map(formatResponse),
      "No player-perceivable responses are in scope.",
    ),
    "",
    formatListSection(
      "PERCEIVABLE EFFECTS",
      packet.perceivableEffects.map(formatEffect),
      "No player-perceivable effects are in scope.",
    ),
    "",
    formatListSection(
      "GUARDRAILS",
      packet.guardrails.map((guardrail) => `- ${guardrail}`),
      "Stay within the committed packet.",
    ),
    "",
    "[SOURCE IDS]",
    ...(packet.sourceRefs.length > 0
      ? packet.sourceRefs.map((source) => `- ${source.kind}:${source.id}`)
      : ["- No source ids are in scope."]),
    "",
    "[CONTEXT BUDGET TRACE]",
    `- estimatedInputTokens: ${packet.contextBudgetTrace.estimatedInputTokens}`,
    `- hiddenExcludedCount: ${packet.contextBudgetTrace.hiddenExcludedCount}`,
    `- didClipModelOutput: ${packet.contextBudgetTrace.didClipModelOutput}`,
    "",
    "[CONTROL RETURN]",
    packet.controlReturnReason,
  ].join("\n");
}
