import { retractStoredEpisodicEvent } from "../vectors/episodic-events.js";
import { createLogger } from "../lib/index.js";
import { retractActorKnowledgeRecord } from "./knowledge-model.js";
import { retractReflectionBudget } from "./reflection-budget.js";
import type { GmToolStepResult } from "./gm-tool-step.js";

const log = createLogger("durable-side-effect-retraction");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayField(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string =>
    typeof entry === "string" && entry.trim().length > 0);
}

function uniqueNonEmptyStrings(values: readonly unknown[]): string[] {
  return [...new Set(values.filter((value): value is string =>
    typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim()))];
}

export function durableMemoryDetailsFromRejectedStep(
  step: GmToolStepResult,
): {
  eventId?: string;
  knowledgeId?: string;
  factRef?: string;
  participants: string[];
  importance: number;
} | null {
  if (
    step.toolName !== "log_event"
    && step.toolName !== "record_dialogue_outcome"
    && step.toolName !== "record_world_fact"
  ) {
    return null;
  }
  if (step.result?.success !== true) return null;
  const payload = isRecord(step.result.result) ? step.result.result : null;
  const input = isRecord(step.candidateInput) ? step.candidateInput : {};
  if (
    !payload
    || stringField(payload, "durability") !== "durable"
    || payload.persisted !== true
  ) return null;
  const eventId = stringField(payload, "eventId");
  const knowledgeId = stringField(payload, "knowledgeId");
  const factRef = stringField(payload, "factRef");
  if (!eventId && !knowledgeId && !factRef) return null;

  if (step.toolName === "log_event") {
    const importanceValue = input.importance;
    if (!eventId) return null;
    return {
      eventId,
      participants: stringArrayField(input, "participants"),
      importance: typeof importanceValue === "number" ? importanceValue : 0,
    };
  }

  if (step.toolName === "record_world_fact") {
    if (!knowledgeId && !factRef) return null;
    return {
      knowledgeId: knowledgeId ?? undefined,
      factRef: factRef ?? undefined,
      participants: uniqueNonEmptyStrings([
        ...stringArrayField(input, "subjectRefs"),
        ...stringArrayField(payload, "subjectRefs"),
        ...stringArrayField(input, "sourceRefs"),
        ...stringArrayField(payload, "sourceRefs"),
      ]),
      importance: 5,
    };
  }

  if (!eventId) return null;
  return {
    eventId,
    participants: uniqueNonEmptyStrings([
      stringField(input, "speakerRef") ?? stringField(payload, "speakerRef"),
      ...stringArrayField(input, "addresseeRefs"),
      ...stringArrayField(payload, "addresseeRefs"),
      ...stringArrayField(input, "sourceRefs"),
      ...stringArrayField(payload, "sourceRefs"),
    ]),
    importance: 5,
  };
}

export async function retractDurableMemoryForRejectedSteps(input: {
  campaignId: string;
  stepResults: readonly GmToolStepResult[];
  reason: unknown;
  source: string;
}): Promise<void> {
  const retractedEventIds = new Set<string>();
  const retractedKnowledgeIds = new Set<string>();
  for (const step of input.stepResults) {
    const details = durableMemoryDetailsFromRejectedStep(step);
    if (!details) continue;
    const knowledgeDedupId = details.knowledgeId ?? details.factRef?.replace(/^knowledge:/i, "");
    const dedupKey = details.eventId
      ? `event:${details.eventId}`
      : knowledgeDedupId ? `knowledge:${knowledgeDedupId}` : null;
    if (!dedupKey) continue;
    if (details.eventId && retractedEventIds.has(details.eventId)) continue;
    if (knowledgeDedupId && retractedKnowledgeIds.has(knowledgeDedupId)) continue;
    if (details.eventId) retractedEventIds.add(details.eventId);
    if (knowledgeDedupId) retractedKnowledgeIds.add(knowledgeDedupId);
    try {
      if (details.eventId) {
        await retractStoredEpisodicEvent({
          campaignId: input.campaignId,
          eventId: details.eventId,
        });
        await retractReflectionBudget(
          input.campaignId,
          details.participants,
          details.importance,
        );
      }
      if (details.knowledgeId) {
        retractActorKnowledgeRecord({
          campaignId: input.campaignId,
          knowledgeId: details.knowledgeId,
          factRef: details.factRef,
          reason: input.source,
        });
      } else if (details.factRef) {
        retractActorKnowledgeRecord({
          campaignId: input.campaignId,
          factRef: details.factRef,
          reason: input.source,
        });
      }
    } catch (error) {
      log.warn("Failed to retract durable memory after rejected side effect", {
        source: input.source,
        toolName: step.toolName,
        eventId: details.eventId ?? null,
        knowledgeId: details.knowledgeId ?? null,
        reason: input.reason instanceof Error ? input.reason.message : String(input.reason),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
