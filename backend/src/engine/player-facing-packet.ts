import type {
  CanonicalTurnPacketEffect,
  CanonicalTurnPacketEvent,
  CanonicalTurnPacketResponse,
  NarratorPacket,
  NarratorPacketActor,
  NarratorPacketInventoryItem,
  NarratorPacketObservation,
  NarratorPacketRedactionAudit,
  NarratorPacketSourceLinkedSummary,
} from "./narrator-packet.js";
import {
  collectCommittedVisibleActorCreationLabels,
  getNarratorPacketRedactionAudit,
  sourceBoundaryTermIsAllowedCommittedActorCreation,
} from "./narrator-packet.js";
import { sourceBoundaryTermIsLeak } from "./source-boundary.js";
import type { RuntimeToolName } from "./tool-schemas.js";
import {
  buildContextBudgetTrace,
  type ContextBudgetTrace,
} from "./context-budget-trace.js";
import { getFrameBudgetSpec } from "./frame-budget.js";
import { sanitizeModelFacingConversationText } from "./model-facing-conversation.js";
import { sanitizeModelFacingText } from "./model-facing-ref-safety.js";

export type PlayerFacingPacketSourceKind =
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
  redactionAudit: NarratorPacketRedactionAudit;
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
  perceivableObservations: NarratorPacketObservation[];
  visibleActors: NarratorPacketActor[];
  currentInventory: NarratorPacketInventoryItem[];
  hintSignals: string[];
  guardrails: string[];
  controlReturnReason: string;
  sourceRefs: PlayerFacingPacketSourceRef[];
  sourceLinkedSummaries: NarratorPacketSourceLinkedSummary[];
  forbiddenTerms: string[];
  forbiddenActorNames: string[];
  forbiddenFactMarkers: string[];
  forbiddenPrivateTerms: string[];
  committedVisibleActorCreationLabels: string[];
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

function formatEvent(event: CanonicalTurnPacketEvent, includeTechnicalRefs: boolean): string {
  const summary = sanitizeModelFacingText(event.summary);
  return includeTechnicalRefs
    ? `- ${formatDiagnosticRef(event.id)}: ${summary} [actor=${formatDiagnosticRef(event.actorId)}; kind=${event.kind}]`
    : `- ${summary}`;
}

function formatResponse(response: CanonicalTurnPacketResponse, includeTechnicalRefs: boolean): string {
  const summary = sanitizeModelFacingText(response.summary);
  return includeTechnicalRefs
    ? `- ${formatDiagnosticRef(response.id)}: ${summary} [actor=${formatDiagnosticRef(response.actorId)}; event=${formatDiagnosticRef(response.eventId)}; kind=${response.responseKind}]`
    : `- ${summary}`;
}

function formatEffect(
  effect: CanonicalTurnPacketEffect,
  includeTechnicalRefs: boolean,
): string {
  const summary = sanitizeModelFacingText(effect.summary);
  if (!includeTechnicalRefs) {
    return `- ${summary}`;
  }
  const refs = [
    effect.actionId ? `action=${formatDiagnosticRef(effect.actionId)}` : null,
    effect.actorId ? `actor=${formatDiagnosticRef(effect.actorId)}` : null,
  ].filter((value): value is string => Boolean(value));

  return `- ${formatDiagnosticRef(effect.id)}: ${summary}${refs.length > 0 ? ` [${refs.join("; ")}]` : ""}`;
}

function formatObservation(
  observation: NarratorPacketObservation,
  includeTechnicalRefs: boolean,
): string {
  const summary = sanitizeModelFacingText(observation.summary);
  return includeTechnicalRefs
    ? `- ${formatDiagnosticRef(observation.id)}: ${summary} [tool=${sanitizeModelFacingText(observation.toolName)}]`
    : `- ${summary}`;
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

function formatEquippedSlotForPrompt(slot: string | null): string | null {
  const formatted = slot ? formatInventoryTagForPrompt(slot) : "";
  if (!formatted || formatted.toLowerCase() === "equipped") {
    return null;
  }
  return formatted;
}

function formatInventoryStatus(item: NarratorPacketInventoryItem): string {
  const equippedSlot = formatEquippedSlotForPrompt(item.equippedSlot);
  const state = item.equipState === "equipped"
    ? equippedSlot
      ? `ready at the player's ${equippedSlot}`
      : "ready to hand"
    : "carried by the player";
  const tags = playerVisibleInventoryStates(item.tags);
  const tagSummary = tags.length > 0 ? ` Visible marks/status: ${tags.join(", ")}.` : "";
  return sanitizeModelFacingText(`${item.label} is ${state}.${tagSummary}`);
}

function visibleTexts(packet: PlayerFacingPacket): string[] {
  return [
    sanitizeModelFacingText(packet.playerActionRequest),
    packet.oracleOutcome ? sanitizeModelFacingText(packet.oracleOutcome) : packet.oracleOutcome,
    sanitizeModelFacingText(packet.anchorEvent.summary),
    ...packet.committedEvents.map((event) => sanitizeModelFacingText(event.summary)),
    ...packet.perceivableResponses.map((response) => sanitizeModelFacingText(response.summary)),
    ...packet.perceivableEffects.map((effect) => sanitizeModelFacingText(effect.summary)),
    ...(packet.perceivableObservations ?? []).map((observation) =>
      sanitizeModelFacingText(observation.summary)
    ),
    ...packet.visibleActors.map((actor) => sanitizeModelFacingText(actor.label)),
    ...packet.currentInventory.map(formatInventoryStatus),
    ...packet.hintSignals.map((hint) => sanitizeModelFacingText(hint)),
    ...packet.guardrails.map((guardrail) => sanitizeModelFacingText(guardrail)),
    sanitizeModelFacingText(packet.controlReturnReason),
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
    {
      source: "oracle_outcome",
      text: packet.oracleOutcome ? sanitizeModelFacingText(packet.oracleOutcome) : packet.oracleOutcome,
    },
    {
      source: "anchor_event:e0",
      text: sanitizeModelFacingText(packet.anchorEvent.summary),
      playerSourced: isPlayerActionEvent(packet.anchorEvent),
    },
    ...packet.committedEvents.map((event, index) => ({
      source: `committed_event:e${index + 1}`,
      text: sanitizeModelFacingText(event.summary),
      playerSourced: isPlayerActionEvent(event),
    })),
    ...packet.perceivableResponses.map((response, index) => ({
      source: `perceivable_response:r${index + 1}`,
      text: sanitizeModelFacingText(response.summary),
    })),
    ...packet.perceivableEffects.map((effect, index) => ({
      source: `perceivable_effect:f${index + 1}`,
      text: sanitizeModelFacingText(effect.summary),
      toolName: effect.toolName,
    })),
    ...packet.perceivableObservations.map((observation, index) => ({
      source: `observation_result:o${index + 1}`,
      text: sanitizeModelFacingText(observation.summary),
      toolName: observation.toolName,
    })),
    ...packet.visibleActors.map((actor, index) => ({
      source: `visible_actor:v${index + 1}`,
      text: sanitizeModelFacingText(actor.label),
    })),
    ...packet.currentInventory.map((item, index) => ({
      source: `current_inventory_status:i${index + 1}`,
      text: formatInventoryStatus(item),
    })),
    ...packet.hintSignals.map((hint, index) => ({
      source: `hint_signal:${index + 1}`,
      text: sanitizeModelFacingText(hint),
    })),
    ...packet.guardrails.map((guardrail, index) => ({
      source: `guardrail:${index + 1}`,
      text: sanitizeModelFacingText(guardrail),
    })),
    { source: "control_return", text: sanitizeModelFacingText(packet.controlReturnReason) },
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
    ...(packet.perceivableObservations ?? []).map((observation) => ({
      id: observation.id,
      kind: "observation_result" as const,
    })),
    ...packet.visibleActors.map((actor) => ({
      id: actor.id,
      kind: "visible_actor" as const,
    })),
    ...(packet.currentInventory ?? []).map((item) => ({
      id: item.itemId,
      kind: "current_inventory_status" as const,
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

function countHiddenExclusions(audit: NarratorPacketRedactionAudit): number {
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

function sourceRouteCounts(
  sourceRefs: readonly PlayerFacingPacketSourceRef[],
): Record<string, number> {
  return sourceRefs.reduce<Record<string, number>>((counts, source) => {
    counts[source.kind] = (counts[source.kind] ?? 0) + 1;
    return counts;
  }, {});
}

function buildFallbackSourceLinkedSummaries(args: {
  texts: readonly string[];
  sourceRefs: readonly PlayerFacingPacketSourceRef[];
}): NarratorPacketSourceLinkedSummary[] {
  const budget = getFrameBudgetSpec("NarratorPacket");
  const overflow = args.sourceRefs.slice(budget.maxSelectedItems);
  if (args.texts.length <= budget.maxSelectedItems || overflow.length === 0) {
    return [];
  }

  const sourceIds = uniqueStrings(overflow.map((source) => source.id));
  return [{
    id: `player-facing-summary:${sourceIds.slice(0, 4).join(":")}`,
    summary:
      `${overflow.length} additional player-facing packet records summarized for budget. `
      + "Source links are preserved internally.",
    sourceIds,
    summarizedItemCount: overflow.length,
  }];
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

export function buildPlayerFacingPacketFromNarratorPacket(
  packet: NarratorPacket,
): PlayerFacingPacket {
  const forbiddenTerms = uniqueStrings([
    ...packet.forbiddenActorNames,
    ...packet.forbiddenFactMarkers,
    ...packet.forbiddenPrivateTerms,
  ]);
  const committedVisibleActorCreationLabels = collectCommittedVisibleActorCreationLabels({
    packet: packet.canonicalTurnPacket,
    perceivableEffects: packet.perceivableEffects,
  });
  const sourceRefs = sourceRefsFromNarratorPacket(packet);
  const redactionAudit = getNarratorPacketRedactionAudit(packet);
  const hiddenExcludedCount = countHiddenExclusions(redactionAudit);
  const playerFacingPacket: PlayerFacingPacket = {
    campaignId: packet.campaignId,
    tick: packet.tick,
    playerActionRequest: packet.playerAction,
    oracleOutcome: packet.oracleOutcome,
    anchorEvent: packet.anchorEvent,
    committedEvents: [...packet.perceivableEvents],
    perceivableResponses: [...packet.perceivableResponses],
    perceivableEffects: [...packet.perceivableEffects],
    perceivableObservations: [...(packet.perceivableObservations ?? [])],
    visibleActors: [...packet.visibleActors],
    currentInventory: [...(packet.currentInventory ?? [])],
    hintSignals: [...packet.hintSignals],
    guardrails: [...packet.guardrails],
    controlReturnReason: packet.controlReturnReason,
    sourceRefs,
    sourceLinkedSummaries: [...(packet.sourceLinkedSummaries ?? [])],
    forbiddenTerms,
    forbiddenActorNames: [...packet.forbiddenActorNames],
    forbiddenFactMarkers: [...packet.forbiddenFactMarkers],
    forbiddenPrivateTerms: [...packet.forbiddenPrivateTerms],
    committedVisibleActorCreationLabels,
    audit: {
      sourceCount: sourceRefs.length,
      visibleTextCount: 0,
      hiddenExcludedCount,
      forbiddenTermCount: forbiddenTerms.length,
      redactionAudit,
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
  const sourceLinkedSummaries = playerFacingPacket.sourceLinkedSummaries.length > 0
    ? playerFacingPacket.sourceLinkedSummaries
    : buildFallbackSourceLinkedSummaries({ texts, sourceRefs });
  playerFacingPacket.sourceLinkedSummaries = sourceLinkedSummaries;
  const budget = getFrameBudgetSpec("NarratorPacket");
  const overflowCount = Math.max(0, texts.length - budget.maxSelectedItems);
  playerFacingPacket.audit.visibleTextCount = texts.length;
  playerFacingPacket.contextBudgetTrace = buildContextBudgetTrace({
    label: "PlayerFacingPacket",
    frameType: "NarratorPacket",
    visibleTexts: [
      ...texts,
      ...sourceLinkedSummaries.map((summary) => sanitizeModelFacingText(summary.summary)),
    ],
    visibleItemCount: texts.length + sourceLinkedSummaries.length,
    hiddenExcludedCount,
    candidateItemCount:
      texts.length
      + hiddenExcludedCount,
    selectedItemCount: Math.min(texts.length, budget.maxSelectedItems),
    summarizedItemCount: overflowCount,
    excludedByVisibilityCount:
      redactionAudit.hiddenEventCount
      + redactionAudit.hiddenResponseCount
      + redactionAudit.hiddenEffectCount
      + redactionAudit.privateActorNameCount
      + redactionAudit.forbiddenFactMarkerCount
      + redactionAudit.forbiddenPrivateTermCount
      + redactionAudit.uncommittedProposalCount,
    excludedByBudgetCount: 0,
    sourceLinkedSummaryCount: sourceLinkedSummaries.length,
    sectionCounts: {
      actors: packet.visibleActors.length,
      currentInventory: (packet.currentInventory ?? []).length,
      hints: packet.hintSignals.length,
      events: packet.perceivableEvents.length,
      responses: packet.perceivableResponses.length,
      effects: packet.perceivableEffects.length,
      observations: (packet.perceivableObservations ?? []).length,
      guardrails: packet.guardrails.length,
      sourceLinkedSummaries: sourceLinkedSummaries.length,
    },
    sourceCoverage: {
      sourceBackedCount: uniqueStrings([
        ...sourceRefs.map((source) => source.id),
        ...sourceLinkedSummaries.flatMap((summary) => summary.sourceIds),
      ]).length,
      routeCounts: sourceRouteCounts(sourceRefs),
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
  const forbiddenTermGroups = [
    {
      terms: packet.forbiddenActorNames,
      allowCommittedActorCreation: true,
      allowVisibleActorLabel: true,
    },
    {
      terms: packet.forbiddenFactMarkers,
      allowCommittedActorCreation: false,
      allowVisibleActorLabel: false,
    },
    {
      terms: packet.forbiddenPrivateTerms,
      allowCommittedActorCreation: false,
      allowVisibleActorLabel: false,
    },
  ];

  for (const group of forbiddenTermGroups) {
    for (const term of uniqueStrings(group.terms)) {
      const normalizedTerm = term.trim().toLowerCase();
      if (!normalizedTerm) {
        continue;
      }
      const leak = texts.find((entry) => {
        if (
          group.allowCommittedActorCreation
          && sourceBoundaryTermIsAllowedCommittedActorCreation({
            source: entry.source,
            text: entry.text,
            toolName: entry.toolName,
            forbiddenTerm: term,
            committedVisibleActorCreationLabels: packet.committedVisibleActorCreationLabels,
          })
        ) {
          return false;
        }
        if (
          group.allowVisibleActorLabel
          && sourceBoundaryTermIsAllowedVisibleActorLabel({
            source: entry.source,
            text: entry.text,
            forbiddenTerm: term,
            committedVisibleActorCreationLabels: packet.committedVisibleActorCreationLabels,
          })
        ) {
          return false;
        }
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
}

function sourceBoundaryTermIsAllowedVisibleActorLabel(args: {
  source: string;
  text: string;
  forbiddenTerm: string;
  committedVisibleActorCreationLabels: readonly string[];
}): boolean {
  const normalizedText = normalizeActorLabel(args.text);
  const normalizedTerm = normalizeActorLabel(args.forbiddenTerm);
  return args.committedVisibleActorCreationLabels.some((label) => {
    const normalizedLabel = normalizeActorLabel(label);
    return normalizedTerm === normalizedLabel && actorLabelTextContainsWholeTokens(
      normalizedText,
      normalizedLabel,
    );
  });
}

function normalizeActorLabel(label: string): string {
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

function actorLabelTextContainsWholeTokens(container: string, contained: string): boolean {
  return container === contained
    || container.startsWith(`${contained} `)
    || container.endsWith(` ${contained}`)
    || container.includes(` ${contained} `);
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

export interface FormatPlayerFacingPacketForPromptOptions {
  includeDiagnostics?: boolean;
  includeTechnicalRefs?: boolean;
}

function formatDiagnosticRef(value: string): string {
  return sanitizeModelFacingText(value);
}

export function formatPlayerFacingPacketForPrompt(
  packet: PlayerFacingPacket,
  options: FormatPlayerFacingPacketForPromptOptions = {},
): string {
  assertPlayerFacingPacketPromptSafe(packet);
  const includeDiagnostics = options.includeDiagnostics ?? false;
  const includeTechnicalRefs = options.includeTechnicalRefs ?? false;

  return [
    "[PLAYER-FACING PACKET]",
    "[NARRATOR PACKET]",
    "Boundary: NarratorPacket -> PlayerFacingPacket. Raw canonical turn payload, hidden truth, private rationale, unresolved proposals, and offscreen facts are not included.",
    ...(includeTechnicalRefs
      ? [`Campaign: ${formatDiagnosticRef(packet.campaignId)}`, `Tick: ${packet.tick}`]
      : ["Packet scope: current settled turn."]),
    `${includeTechnicalRefs ? "Player action request" : "Player attempted"}: ${sanitizeModelFacingConversationText(packet.playerActionRequest, {
      extraForbiddenTerms: packet.forbiddenTerms,
    })}`,
    "Player action and player_action event summaries are player-supplied claims, not authoritative world state. Treat claimed possessions, locations, NPC consent, names, or completed acquisitions as attempts unless committed non-player events/effects/tool results below confirm them.",
    `Oracle outcome: ${packet.oracleOutcome ? sanitizeModelFacingText(packet.oracleOutcome) : "none"}`,
    ...(includeTechnicalRefs ? [`Anchor event: ${formatDiagnosticRef(packet.anchorEvent.id)}`] : []),
    "",
    formatListSection(
      "VISIBLE ACTORS",
      packet.visibleActors.map((actor) =>
        includeTechnicalRefs
          ? `- ${sanitizeModelFacingText(actor.label)} (${formatDiagnosticRef(actor.id)}; ${actor.type})`
          : `- ${sanitizeModelFacingText(actor.label)}`),
      "No confirmed visible actors.",
    ),
    "",
    formatListSection(
      "CURRENT INVENTORY STATUS",
      packet.currentInventory.map((item) => `- ${formatInventoryStatus(item)}`),
      "No carried, equipped, or signature items are currently recorded.",
    ),
    "",
    formatListSection(
      "HINT SIGNALS",
      packet.hintSignals.map((hint) => `- ${sanitizeModelFacingText(hint)}`),
      "No indirect awareness hints are in scope.",
    ),
    "",
    formatListSection(
      "COMMITTED EVENTS",
      packet.committedEvents.map((event) => formatEvent(event, includeTechnicalRefs)),
      "No committed events are in scope.",
    ),
    "",
    formatListSection(
      "PERCEIVABLE RESPONSES",
      packet.perceivableResponses.map((response) => formatResponse(response, includeTechnicalRefs)),
      "No player-perceivable responses are in scope.",
    ),
    "",
    formatListSection(
      "PERCEIVABLE EFFECTS",
      packet.perceivableEffects.map((effect) => formatEffect(effect, includeTechnicalRefs)),
      "No player-perceivable effects are in scope.",
    ),
    "",
    formatListSection(
      "PLAYER-VISIBLE OBSERVATIONS",
      packet.perceivableObservations.map((observation) =>
        formatObservation(observation, includeTechnicalRefs)
      ),
      "No lookup-grounded observations are in scope.",
    ),
    "",
    formatListSection(
      "GUARDRAILS",
      packet.guardrails.map((guardrail) => `- ${sanitizeModelFacingText(guardrail)}`),
      "Stay within the committed packet.",
    ),
    "",
    ...(includeDiagnostics
      ? [
          "[VISIBLE SOURCE IDS -- DIAGNOSTIC, DO NOT USE AS evidenceRefs]",
          ...(packet.sourceRefs.length > 0
            ? packet.sourceRefs.map((source) => `- ${source.kind}:${formatDiagnosticRef(source.id)}`)
            : ["- No source ids are in scope."]),
          "",
          "[SOURCE-LINKED SUMMARIES]",
          ...(packet.sourceLinkedSummaries.length > 0
            ? packet.sourceLinkedSummaries.map(
                (summary) =>
                  includeTechnicalRefs
                    ? `- ${formatDiagnosticRef(summary.id)}: ${sanitizeModelFacingText(summary.summary)} [sources=${summary.sourceIds.map(formatDiagnosticRef).join(", ")}]`
                    : `- ${sanitizeModelFacingText(summary.summary)}`,
              )
            : ["- No source-linked overflow summaries were needed."]),
          "",
          "[REDACTION AUDIT]",
          ...formatRedactionAudit(packet.audit.redactionAudit),
          "",
          "[CONTEXT BUDGET TRACE]",
          `- frameType: ${packet.contextBudgetTrace.frameType ?? "unknown"}`,
          `- estimatedInputTokens: ${packet.contextBudgetTrace.estimatedInputTokens}`,
          `- selectedItemCount: ${packet.contextBudgetTrace.selectedItemCount}`,
          `- summarizedItemCount: ${packet.contextBudgetTrace.summarizedItemCount}`,
          `- hiddenExcludedCount: ${packet.contextBudgetTrace.hiddenExcludedCount}`,
          `- sourceLinkedSummaryCount: ${packet.contextBudgetTrace.sourceLinkedSummaryCount}`,
          `- didClipModelOutput: ${packet.contextBudgetTrace.didClipModelOutput}`,
          ...(packet.contextBudgetTrace.overflowWarnings.length > 0
            ? packet.contextBudgetTrace.overflowWarnings.map((warning) =>
                `- overflowWarning: ${warning.code}${warning.count ? ` (${warning.count})` : ""}`,
              )
            : ["- overflowWarnings: none"]),
          "",
        ]
      : []),
    "[CONTROL RETURN]",
    sanitizeModelFacingText(packet.controlReturnReason),
  ].join("\n");
}
