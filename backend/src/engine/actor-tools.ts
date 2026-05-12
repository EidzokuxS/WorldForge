import { randomUUID } from "node:crypto";
import type { ProviderConfig } from "../ai/provider-registry.js";
import { createLogger } from "../lib/index.js";
import {
  type ParsedActorDecisionPacket,
  assertActorDecisionPacket,
  type ActorDecisionPacket,
} from "./actor-decision-packet.js";
import {
  buildActorFrame,
  type ActorFrame,
} from "./actor-frame.js";
import { runActorDecisionBrain } from "./actor-brain.js";
import {
  KEY_ACTOR_DEFAULT_WAKE_DELAY_MINUTES,
  listKeyActorProcessesForCampaign,
  updateActorProcessAfterDecision,
  type KeyActorPlanStep,
  type KeyActorProcess,
  type KeyActorProcessState,
} from "./key-actor-process.js";
import {
  readWorldClock,
  type WorldClockState,
} from "./living-world-authority.js";
import {
  retrieveActorKnowledgeForFrame,
  type ActorKnowledgeRetrievalResult,
} from "./knowledge-retrieval.js";
import {
  scheduleKeyActorProcessesForTurn,
  type ActorScheduleDecision,
  type ScheduleKeyActorProcessesResult,
} from "./actor-scheduler.js";
import type {
  ExecutedScenePlanActionResult,
} from "./scene-plan-executor.js";
import type { SceneFrame } from "./scene-frame.js";
import {
  applySuccessfulToolObservationToExecutionContext,
  createActorTurnToolExecutionContext,
} from "./tool-execution-context.js";
import { executeToolCall } from "./tool-executor.js";
import type { RuntimeToolName } from "./tool-schemas.js";
import {
  runParallelSimulationJobs,
  type ParallelSimulationRunTrace,
} from "./parallel-simulation-runner.js";
import { runFrameRetrievalJobs } from "./frame-retrieval-runner.js";

const log = createLogger("actor-tools");

export const ACTOR_TURN_LEGAL_TOOLS = [
  "log_event",
  "move_to",
  "set_relationship",
  "add_tag",
  "remove_tag",
  "request_contested_outcome",
  "set_condition",
  "spawn_item",
  "transfer_item",
] as const satisfies readonly RuntimeToolName[];

export interface ExecuteActorDecisionPacketArgs {
  campaignId: string;
  tick: number;
  sceneFrame: SceneFrame;
  actorFrame: ActorFrame;
  packet: ActorDecisionPacket;
  baseWorldVersion: number;
  elapsedWorldTimeMinutes?: number;
  orderOffset?: number;
}

export interface ExecuteActorDecisionPacketResult {
  packet: ParsedActorDecisionPacket;
  actionResults: ExecutedScenePlanActionResult[];
}

export interface ActorDecisionPassRecord {
  schedule: ActorScheduleDecision;
  actorFrame: ActorFrame;
  packet: ParsedActorDecisionPacket;
  actionResults: ExecutedScenePlanActionResult[];
  processUpdateStatus: ReturnType<typeof updateActorProcessAfterDecision>["status"];
}

export interface RunRequiredActorDecisionPassArgs {
  campaignId: string;
  tick: number;
  provider: ProviderConfig;
  sceneFrame: SceneFrame;
  playerAction?: string;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
  elapsedWorldTimeMinutes?: number;
  maxOutputTokens?: number;
  decideActor?: (input: {
    schedule: ActorScheduleDecision;
    actorFrame: ActorFrame;
  }) => Promise<ActorDecisionPacket> | ActorDecisionPacket;
}

export interface RunRequiredActorDecisionPassResult {
  schedule: ScheduleKeyActorProcessesResult;
  decisions: ActorDecisionPassRecord[];
  actionResults: ExecutedScenePlanActionResult[];
  parallelFrameRetrievalTrace: ParallelSimulationRunTrace[];
  parallelPrepTrace: ParallelSimulationRunTrace[];
}

function compactSignalReason(decision: ActorScheduleDecision): string[] {
  return decision.signals
    .slice(0, 6)
    .map((signal) => `${signal.type}: ${signal.reason}`);
}

function newestPlanUpdate(
  packet: ParsedActorDecisionPacket,
): ParsedActorDecisionPacket["planUpdates"][number] | null {
  return packet.planUpdates.at(-1) ?? null;
}

function nextActivePlan(input: {
  process: KeyActorProcess;
  packet: ParsedActorDecisionPacket;
}): KeyActorPlanStep | null {
  const update = newestPlanUpdate(input.packet);
  if (!update) {
    return input.process.state.activePlan;
  }
  if (update.status === "completed") {
    return null;
  }
  return {
    id: input.process.state.activePlan?.id ?? `actor-plan-${randomUUID()}`,
    summary: update.summary,
    deterministic: false,
    writeScopes: update.writeScopes ?? input.process.state.activePlan?.writeScopes ?? [],
    deadlineWorldTimeMinutes:
      input.process.state.activePlan?.deadlineWorldTimeMinutes ?? null,
  };
}

function nextProcessState(input: {
  process: KeyActorProcess;
  packet: ParsedActorDecisionPacket;
  toolSucceeded: boolean;
}): KeyActorProcessState {
  return {
    ...input.process.state,
    activePlan: nextActivePlan(input),
    nextDecisionReason:
      input.packet.nextDecisionTrigger?.reason
      ?? input.packet.noActionReason
      ?? input.packet.intent,
    interrupts: [],
    inbox: [],
    agencyDebt: input.toolSucceeded ? 0 : input.process.state.agencyDebt + 1,
  };
}

function nextWakeWorldTime(input: {
  clock: WorldClockState;
  packet: ParsedActorDecisionPacket;
}): number {
  return input.clock.worldTimeMinutes
    + (
      input.packet.nextDecisionTrigger?.delayWorldTimeMinutes
      ?? KEY_ACTOR_DEFAULT_WAKE_DELAY_MINUTES
    );
}

function actorActionResult(input: {
  packet: ParsedActorDecisionPacket;
  order: number;
  request: ParsedActorDecisionPacket["requestedTools"][number];
  result: Awaited<ReturnType<typeof executeToolCall>>;
}): ExecutedScenePlanActionResult {
  return {
    order: input.order,
    actionId: randomUUID(),
    actionRef: `actor-tool:${input.packet.actorId}:${input.request.toolName}:${input.order + 1}`,
    actorId: input.packet.actorId,
    toolName: input.request.toolName,
    input: input.request.input as ExecutedScenePlanActionResult["input"],
    args: input.request.input,
    result: input.result,
  };
}

export async function executeActorDecisionPacket(
  args: ExecuteActorDecisionPacketArgs,
): Promise<ExecuteActorDecisionPacketResult> {
  const packet = assertActorDecisionPacket({
    frame: args.actorFrame,
    packet: args.packet,
  });
  const context = createActorTurnToolExecutionContext({
    sceneFrame: args.sceneFrame,
    actorFrame: args.actorFrame,
    baseWorldVersion: args.baseWorldVersion,
    elapsedWorldTimeMinutes: args.elapsedWorldTimeMinutes,
  });
  const actionResults: ExecutedScenePlanActionResult[] = [];

  for (const [index, request] of packet.requestedTools.entries()) {
    const result = await executeToolCall(
      args.campaignId,
      request.toolName,
      request.input,
      args.tick,
      undefined,
      context,
    );
    if (result.success) {
      applySuccessfulToolObservationToExecutionContext({
        toolName: request.toolName,
        result,
        context,
      });
    }
    actionResults.push(actorActionResult({
      packet,
      order: (args.orderOffset ?? 0) + index,
      request,
      result,
    }));
  }

  log.event("actor.tool.execution", {
    campaignId: args.campaignId,
    actorId: packet.actorId,
    requestedToolCount: packet.requestedTools.length,
    successCount: actionResults.filter((result) => result.result.success).length,
    failureCount: actionResults.filter((result) => !result.result.success).length,
  });

  return { packet, actionResults };
}

function requiredReservedDecisions(
  schedule: ScheduleKeyActorProcessesResult,
): ActorScheduleDecision[] {
  return schedule.decisions.filter((decision) =>
    decision.route === "required_before_done"
    && decision.reservation?.status === "reserved",
  );
}

const BROAD_STATUS_READ_ACTION_PATTERN =
  /\b(take stock|read the room|look around|look over|scan|survey|observe|watch|inspect|study|listen|assess|describe|identify|note|check|compare|tour)\b/i;
const DIRECT_INTERACTION_ACTION_PATTERN =
  /\b(ask|tell|say|reply|answer|question|interrogate|demand|request|order|command|threaten|attack|strike|grab|restrain|follow|chase|show|give|offer|pay|bribe|promise|negotiate|argue|accuse|convince|persuade|deceive|lie|bluff|intimidate)\b/i;

function shouldDeferPresenceOnlyActorReactions(playerAction?: string): boolean {
  if (!playerAction) {
    return false;
  }
  return BROAD_STATUS_READ_ACTION_PATTERN.test(playerAction)
    && !DIRECT_INTERACTION_ACTION_PATTERN.test(playerAction);
}

interface PreparedActorDecision {
  decision: ActorScheduleDecision;
  process: KeyActorProcess;
  actorFrame: ActorFrame;
  packet: ActorDecisionPacket;
}

async function prepareActorDecision(input: {
  args: RunRequiredActorDecisionPassArgs;
  decision: ActorScheduleDecision;
  process: KeyActorProcess;
  knowledge: ActorKnowledgeRetrievalResult;
}): Promise<PreparedActorDecision> {
  const clockBefore = readWorldClock(input.args.campaignId);
  const actorFrame = buildActorFrame({
    frame: input.args.sceneFrame,
    actorId: input.decision.actorId,
    worldVersion: clockBefore.worldVersion,
    reports: input.knowledge.reports,
    memories: input.knowledge.memories,
    beliefs: input.knowledge.beliefs,
    publicRecords: input.knowledge.publicRecords,
    legalTools: ACTOR_TURN_LEGAL_TOOLS,
    constraints: [
      `scheduler route: ${input.decision.route}`,
      `scheduler reason: ${input.decision.reason}`,
      "Act only as this NPC within the visible turn boundary. Do not decide for the player, the GM, or backend systems.",
      ...compactSignalReason(input.decision),
    ],
  });
  const packet = input.args.decideActor
    ? await input.args.decideActor({ schedule: input.decision, actorFrame })
    : await runActorDecisionBrain({
        provider: input.args.provider,
        frame: actorFrame,
        maxOutputTokens: input.args.maxOutputTokens,
      });
  return {
    decision: input.decision,
    process: input.process,
    actorFrame,
    packet,
  };
}

export async function runRequiredActorDecisionPass(
  args: RunRequiredActorDecisionPassArgs,
): Promise<RunRequiredActorDecisionPassResult> {
  const schedule = scheduleKeyActorProcessesForTurn({
    campaignId: args.campaignId,
    tick: args.tick,
    playerLocationId: args.playerLocationId,
    playerSceneScopeId: args.playerSceneScopeId,
    elapsedWorldTimeMinutes: args.elapsedWorldTimeMinutes,
    presentActorReactionRoute: shouldDeferPresenceOnlyActorReactions(args.playerAction)
      ? "proposal_after_done"
      : "required_before_done",
  });
  const processes = new Map(
    listKeyActorProcessesForCampaign({ campaignId: args.campaignId })
      .map((process) => [process.actorId, process]),
  );
  const decisions: ActorDecisionPassRecord[] = [];
  const actionResults: ExecutedScenePlanActionResult[] = [];
  const requiredDecisions = requiredReservedDecisions(schedule);
  const requiredDecisionProcesses = requiredDecisions.map((decision) => {
    const process = processes.get(decision.actorId);
    if (!process) {
      throw new Error(`Required actor process disappeared before decision: ${decision.actorId}`);
    }
    return { decision, process };
  });
  const frameRetrievalRun = await runFrameRetrievalJobs(
    requiredDecisionProcesses.map(({ decision }) => ({
      id: `actor-frame:${decision.actorId}`,
      label: `ActorFrame ${decision.actorName}`,
      frameType: "ActorFrame",
      viewerId: decision.actorId,
      criticality: "L1",
      scopeRefs: [
        `actor:${decision.actorId}`,
        ...(args.playerLocationId ? [`location:${args.playerLocationId}`] : []),
        ...(args.playerSceneScopeId ? [`scene:${args.playerSceneScopeId}`] : []),
      ],
      run: () => {
        const clockBefore = readWorldClock(args.campaignId);
        return retrieveActorKnowledgeForFrame({
          campaignId: args.campaignId,
          actorId: decision.actorId,
          frame: args.sceneFrame,
          worldVersion: clockBefore.worldVersion,
          maxFacts: 12,
        });
      },
    })),
  );
  const knowledgeByActorId = new Map<string, ActorKnowledgeRetrievalResult>();
  for (const result of frameRetrievalRun.results) {
    const actorId = result.viewerId;
    if (!actorId) {
      throw new Error(`ActorFrame retrieval did not include a viewer id: ${result.jobId}`);
    }
    if (result.status === "failed") {
      throw new Error(
        `ActorFrame retrieval failed for ${actorId}: ${result.error}`,
      );
    }
    knowledgeByActorId.set(actorId, result.value);
  }

  if (frameRetrievalRun.trace.length > 0) {
    log.event("actor.required-pass.frame-retrieval", {
      campaignId: args.campaignId,
      groupCount: frameRetrievalRun.trace.length,
      jobCount: requiredDecisions.length,
      serializedFallbackCount: frameRetrievalRun.trace.reduce(
        (total, group) => total + group.serializedFallbackCount,
        0,
      ),
      groups: frameRetrievalRun.trace.map((group) => ({
        groupIndex: group.groupIndex,
        jobCount: group.jobCount,
        durationMs: group.durationMs,
        serializedFallbackCount: group.serializedFallbackCount,
        writeScopes: group.writeScopes,
      })),
    });
  }

  const preparedRun = await runParallelSimulationJobs(
    requiredDecisionProcesses.map(({ decision, process }) => {
      const knowledge = knowledgeByActorId.get(decision.actorId);
      if (!knowledge) {
        throw new Error(`ActorFrame retrieval missing for ${decision.actorId}.`);
      }
      return {
        id: decision.actorId,
        label: decision.actorName,
        route: decision.route,
        writeScopes: decision.writeScopes,
        run: () => prepareActorDecision({ args, decision, process, knowledge }),
      };
    }),
  );

  if (preparedRun.trace.length > 0) {
    log.event("actor.required-pass.parallel-prep", {
      campaignId: args.campaignId,
      groupCount: preparedRun.trace.length,
      jobCount: requiredDecisions.length,
      serializedFallbackCount: preparedRun.trace.reduce(
        (total, group) => total + group.serializedFallbackCount,
        0,
      ),
      groups: preparedRun.trace.map((group) => ({
        groupIndex: group.groupIndex,
        jobCount: group.jobCount,
        durationMs: group.durationMs,
        serializedFallbackCount: group.serializedFallbackCount,
      })),
    });
  }

  for (const preparedResult of preparedRun.results) {
    if (preparedResult.status === "failed") {
      throw new Error(
        `Actor decision preparation failed for ${preparedResult.jobId}: ${preparedResult.error}`,
      );
    }
    const { decision, process, actorFrame, packet } = preparedResult.value;
    const clockBefore = readWorldClock(args.campaignId);
    const execution = await executeActorDecisionPacket({
      campaignId: args.campaignId,
      tick: args.tick,
      sceneFrame: args.sceneFrame,
      actorFrame,
      packet,
      baseWorldVersion: clockBefore.worldVersion,
      elapsedWorldTimeMinutes: args.elapsedWorldTimeMinutes,
      orderOffset: actionResults.length,
    });
    actionResults.push(...execution.actionResults);

    const clockAfter = readWorldClock(args.campaignId);
    const processUpdate = updateActorProcessAfterDecision({
      campaignId: args.campaignId,
      actorId: decision.actorId,
      expectedBaseWorldVersion: process.lastWorldVersion,
      resultWorldVersion: clockAfter.worldVersion,
      lastWakeWorldTimeMinutes: clockAfter.worldTimeMinutes,
      nextWakeWorldTimeMinutes: nextWakeWorldTime({
        clock: clockAfter,
        packet: execution.packet,
      }),
      status: "waiting",
      processState: nextProcessState({
        process,
        packet: execution.packet,
        toolSucceeded: execution.actionResults.some((action) => action.result.success),
      }),
    });
    if (processUpdate.status !== "updated") {
      throw new Error(
        `Actor process update failed for ${decision.actorId}: ${processUpdate.status}`,
      );
    }

    decisions.push({
      schedule: decision,
      actorFrame,
      packet: execution.packet,
      actionResults: execution.actionResults,
      processUpdateStatus: processUpdate.status,
    });
  }

  log.event("actor.required-pass", {
    campaignId: args.campaignId,
    scheduledCount: schedule.decisions.length,
    requiredReservedCount: requiredReservedDecisions(schedule).length,
    decisionCount: decisions.length,
    toolResultCount: actionResults.length,
  });

  return {
    schedule,
    decisions,
    actionResults,
    parallelFrameRetrievalTrace: frameRetrievalRun.trace,
    parallelPrepTrace: preparedRun.trace,
  };
}
