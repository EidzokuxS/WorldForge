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
    limit: maxFacts,
  });
  const lexical = listActorKnowledge({
    campaignId: input.campaignId,
    actorId: input.actorId,
    worldVersion: input.worldVersion,
    routes,
    query: input.frame.playerAction,
    limit: maxFacts,
  });
  const byId = new Map<string, ActorKnowledgeRecord>();
  for (const record of [...structured, ...lexical]) {
    byId.set(record.id, record);
  }
  const sourceRecords = [...byId.values()].slice(0, maxFacts);
  const facts = partitionFacts(sourceRecords);

  return {
    ...facts,
    sourceRecords,
    trace: buildContextBudgetTrace({
      label: "ActorKnowledgeRetrieval",
      visibleTexts: sourceRecords.map((record) => record.statement),
      visibleItemCount: sourceRecords.length,
      hiddenExcludedCount: Math.max(0, structured.length + lexical.length - sourceRecords.length),
      candidateItemCount: structured.length + lexical.length,
      sectionCounts: {
        structured: structured.length,
        lexical: lexical.length,
        returned: sourceRecords.length,
      },
      sourceCoverage: {
        sourceBackedCount: sourceRecords.length,
        routeCounts: routeCounts(sourceRecords),
      },
      retrievalCounts: {
        structured: structured.length,
        lexical: lexical.length,
        returned: sourceRecords.length,
      },
      notes: [
        "Structured refs are tried before lexical recall; vector recall remains optional and must attach source ids before use.",
      ],
    }),
  };
}
