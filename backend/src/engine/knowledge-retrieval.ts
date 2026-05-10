import type { ActorFrameExternalFactInput } from "./actor-frame.js";
import type { SceneFrame } from "./scene-frame.js";
import {
  listActorKnowledge,
  toActorFrameExternalFact,
  type ActorKnowledgeRecord,
  type ActorKnowledgeRoute,
} from "./knowledge-model.js";
import {
  buildContextBudgetTrace,
  type ContextBudgetTrace,
} from "./context-budget-trace.js";

export interface ActorKnowledgeRetrievalResult {
  reports: ActorFrameExternalFactInput[];
  memories: ActorFrameExternalFactInput[];
  beliefs: ActorFrameExternalFactInput[];
  publicRecords: ActorFrameExternalFactInput[];
  trace: ContextBudgetTrace;
  sourceRecords: ActorKnowledgeRecord[];
}

export interface RetrieveActorKnowledgeForFrameInput {
  campaignId: string;
  actorId: string;
  frame: SceneFrame;
  worldVersion: number;
  maxFacts?: number;
}

function uniqueStrings(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function structuredRefs(frame: SceneFrame): string[] {
  return uniqueStrings([
    frame.currentLocationId,
    frame.currentSceneScopeId,
    frame.playerActorId,
    ...frame.roster.active.flatMap((actor) => [actor.id, actor.actorId, actor.locationId, actor.sceneScopeId]),
    ...frame.roster.support.flatMap((actor) => [actor.id, actor.actorId, actor.locationId, actor.sceneScopeId]),
    ...frame.targetCandidates.flatMap((target) => [
      target.id,
      target.actorId,
      target.locationId,
      target.itemId,
      target.factionId,
    ]),
  ]);
}

function recordIsEligibleForFrame(input: {
  record: ActorKnowledgeRecord;
  actorId: string;
  visibleRefs: readonly string[];
}): boolean {
  if (input.record.privacy === "public") {
    return true;
  }
  if (input.record.sourceActorId === input.actorId) {
    return true;
  }
  if (input.record.recipientActorIds.includes(input.actorId)) {
    return true;
  }

  const visibleRefSet = new Set(input.visibleRefs.map((ref) => ref.toLowerCase()));
  return input.record.subjectRefs.some((ref) => visibleRefSet.has(ref.toLowerCase()));
}

function buildSourceLinkedKnowledgeSummary(
  records: readonly ActorKnowledgeRecord[],
): ActorFrameExternalFactInput | null {
  if (records.length === 0) {
    return null;
  }
  const sourceKnowledgeIds = uniqueStrings([
    ...records.map((record) => record.id),
    ...records.flatMap((record) => record.sourceKnowledgeIds),
  ]);
  return {
    id: `knowledge-summary:${sourceKnowledgeIds.slice(0, 4).join(":")}`,
    route: "memory",
    text: `source-linked summary: ${records.length} eligible actor knowledge records were summarized for frame budget. Sources: ${sourceKnowledgeIds.slice(0, 8).join(", ")}.`,
    subjectRefs: uniqueStrings(records.flatMap((record) => record.subjectRefs)),
    confidence: Math.min(...records.map((record) => record.confidence)) / 100,
    reliability: Math.min(...records.map((record) => record.reliability)) / 100,
    sourceEventIds: uniqueStrings(records.flatMap((record) => record.sourceEventIds)),
    sourceKnowledgeIds,
    authorityTraceIds: uniqueStrings(records.flatMap((record) => record.authorityTraceIds)),
    deliveredAtWorldTimeMinutes: Math.max(
      ...records.map((record) => record.deliveredWorldTimeMinutes ?? 0),
    ),
  };
}

function partitionFacts(records: readonly ActorKnowledgeRecord[]) {
  const result = {
    reports: [] as ActorFrameExternalFactInput[],
    memories: [] as ActorFrameExternalFactInput[],
    beliefs: [] as ActorFrameExternalFactInput[],
    publicRecords: [] as ActorFrameExternalFactInput[],
  };

  for (const record of records) {
    const fact = toActorFrameExternalFact(record);
    if (record.route === "report_message") {
      result.reports.push(fact);
    } else if (record.route === "rumor" || record.route === "belief" || record.route === "claim") {
      result.beliefs.push(fact);
    } else if (record.route === "public_record") {
      result.publicRecords.push(fact);
    } else {
      result.memories.push(fact);
    }
  }
  return result;
}

function routeCounts(records: readonly ActorKnowledgeRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    counts[record.route] = (counts[record.route] ?? 0) + 1;
  }
  return counts;
}

export function retrieveActorKnowledgeForFrame(
  input: RetrieveActorKnowledgeForFrameInput,
): ActorKnowledgeRetrievalResult {
  const maxFacts = Math.max(1, input.maxFacts ?? 12);
  const refs = structuredRefs(input.frame);
  const routes: ActorKnowledgeRoute[] = [
    "report_message",
    "rumor",
    "belief",
    "memory",
    "public_record",
    "claim",
    "direct_observation",
  ];
  const structured = listActorKnowledge({
    campaignId: input.campaignId,
    actorId: input.actorId,
    worldVersion: input.worldVersion,
    routes,
    subjectRefs: refs,
    limit: maxFacts * 3,
  });
  const lexical = listActorKnowledge({
    campaignId: input.campaignId,
    actorId: input.actorId,
    worldVersion: input.worldVersion,
    routes,
    query: input.frame.playerAction,
    limit: maxFacts * 3,
  });
  const visibilityFilteredStructured = structured.filter((record) =>
    recordIsEligibleForFrame({ record, actorId: input.actorId, visibleRefs: refs }),
  );
  const visibilityFilteredLexical = lexical.filter((record) =>
    recordIsEligibleForFrame({ record, actorId: input.actorId, visibleRefs: refs }),
  );
  const byId = new Map<string, ActorKnowledgeRecord>();
  for (const record of [...visibilityFilteredStructured, ...visibilityFilteredLexical]) {
    byId.set(record.id, record);
  }
  const eligibleRecords = [...byId.values()];
  const sourceRecords = eligibleRecords.slice(0, maxFacts);
  const overflowRecords = eligibleRecords.slice(maxFacts);
  const facts = partitionFacts(sourceRecords);
  const summary = buildSourceLinkedKnowledgeSummary(overflowRecords);
  if (summary) {
    facts.memories.push(summary);
  }
  const visibleTexts = [
    ...sourceRecords.map((record) => record.statement),
    ...(summary ? [summary.text] : []),
  ];
  const candidateCount = structured.length + lexical.length;
  const visibilityExcludedCount =
    candidateCount
    - visibilityFilteredStructured.length
    - visibilityFilteredLexical.length;

  return {
    ...facts,
    sourceRecords,
    trace: buildContextBudgetTrace({
      label: "ActorKnowledgeRetrieval",
      frameType: "ActorFrame",
      visibleTexts,
      visibleItemCount: sourceRecords.length + (summary ? 1 : 0),
      hiddenExcludedCount: Math.max(0, visibilityExcludedCount),
      candidateItemCount: candidateCount,
      selectedItemCount: sourceRecords.length,
      summarizedItemCount: overflowRecords.length,
      excludedByVisibilityCount: Math.max(0, visibilityExcludedCount),
      sourceLinkedSummaryCount: summary ? 1 : 0,
      sectionCounts: {
        structured: structured.length,
        lexical: lexical.length,
        returned: sourceRecords.length + (summary ? 1 : 0),
      },
      sourceCoverage: {
        sourceBackedCount: sourceRecords.length + (summary ? 1 : 0),
        routeCounts: routeCounts(sourceRecords),
      },
      retrievalCounts: {
        structured: structured.length,
        lexical: lexical.length,
        returned: sourceRecords.length + (summary ? 1 : 0),
      },
      notes: [
        "Visibility and source-route eligibility are applied before lexical records merge into ActorFrame retrieval.",
      ],
    }),
  };
}
