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
import { retrieveActorKnowledgeForFrame } from "./knowledge-retrieval.js";
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
}): Promise<PreparedActorDecision> {
  const clockBefore = readWorldClock(input.args.campaignId);
  const knowledge = retrieveActorKnowledgeForFrame({
    campaignId: input.args.campaignId,
    actorId: input.decision.actorId,
    frame: input.args.sceneFrame,
    worldVersion: clockBefore.worldVersion,
    maxFacts: 12,
  });
  const actorFrame = buildActorFrame({
    frame: input.args.sceneFrame,
    actorId: input.decision.actorId,
    worldVersion: clockBefore.worldVersion,
    reports: knowledge.reports,
    memories: knowledge.memories,
    beliefs: knowledge.beliefs,
    publicRecords: knowledge.publicRecords,
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
  });
  const processes = new Map(
    listKeyActorProcessesForCampaign({ campaignId: args.campaignId })
      .map((process) => [process.actorId, process]),
  );
  const decisions: ActorDecisionPassRecord[] = [];
  const actionResults: ExecutedScenePlanActionResult[] = [];
  const requiredDecisions = requiredReservedDecisions(schedule);

  const preparedRun = await runParallelSimulationJobs(
    requiredDecisions.map((decision) => {
      const process = processes.get(decision.actorId);
      if (!process) {
        throw new Error(`Required actor process disappeared before decision: ${decision.actorId}`);
      }
      return {
        id: decision.actorId,
        label: decision.actorName,
        route: decision.route,
        writeScopes: decision.writeScopes,
        run: () => prepareActorDecision({ args, decision, process }),
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
    parallelPrepTrace: preparedRun.trace,
  };
}
