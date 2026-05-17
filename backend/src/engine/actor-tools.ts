import { randomUUID } from "node:crypto";
import type { ProviderConfig } from "../ai/provider-registry.js";
import { createLogger } from "../lib/index.js";
import { getSqliteConnection } from "../db/index.js";
import { retractStoredEpisodicEvent } from "../vectors/episodic-events.js";
import {
  type ParsedActorDecisionPacket,
  assertBoundActorDecisionPacket,
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
  type ToolResultAuthority,
} from "./tool-result.js";
import {
  runParallelSimulationJobs,
  type ParallelSimulationRunTrace,
} from "./parallel-simulation-runner.js";
import { runFrameRetrievalJobs } from "./frame-retrieval-runner.js";
import { isAcceptedRuntimeReceiptForTurn } from "./tool-contracts.js";

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
  authorityForTool?: (input: {
    packet: ParsedActorDecisionPacket;
    request: ParsedActorDecisionPacket["requestedTools"][number];
    index: number;
  }) => { toolResultId?: string; metadata?: Record<string, unknown> } | null;
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
  authority?: ToolResultAuthority;
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
  presentActorReactionRoute?: "required_before_done" | "proposal_after_done";
  legalTools?: readonly RuntimeToolName[];
  scheduleActorProcesses?: typeof scheduleKeyActorProcessesForTurn;
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
    writeScopes: input.process.state.activePlan?.writeScopes ?? [],
    deadlineWorldTimeMinutes:
      input.process.state.activePlan?.deadlineWorldTimeMinutes ?? null,
    provenance: {
      source: "actor_private_plan_update",
      authoritativeForPlayer: false,
    },
  };
}

function nextProcessState(input: {
  process: KeyActorProcess;
  packet: ParsedActorDecisionPacket;
  toolSucceeded: boolean;
}): KeyActorProcessState {
  const processSatisfied = input.toolSucceeded || input.packet.requestedTools.length === 0;
  return {
    ...input.process.state,
    activePlan: nextActivePlan(input),
    nextDecisionReason:
      input.packet.nextDecisionTrigger?.reason
      ?? input.packet.noActionReason
      ?? input.packet.intent,
    interrupts: [],
    inbox: [],
    agencyDebt: processSatisfied ? 0 : input.process.state.agencyDebt + 1,
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

function isAcceptedActorProcessAction(result: ExecutedScenePlanActionResult): boolean {
  return isAcceptedRuntimeReceiptForTurn({
    toolName: result.toolName,
    result: result.result,
    requirement: null,
  });
}

function requireActorFrameWorldVersion(actorFrame: ActorFrame): number {
  if (typeof actorFrame.worldVersion === "number") {
    return actorFrame.worldVersion;
  }
  throw new Error("ActorFrame is missing worldVersion; refusing actor tool execution.");
}

let actorDecisionBoundaryCounter = 0;

function createActorDecisionMutationBoundary(input: {
  campaignId: string;
  actorId: string;
}): {
  commit: () => void;
  rollback: () => void;
} {
  actorDecisionBoundaryCounter += 1;
  const savepointName = `actor_decision_${actorDecisionBoundaryCounter}`;
  const sqlite = getSqliteConnection();
  let closed = false;
  sqlite.exec(`SAVEPOINT ${savepointName}`);
  log.event("actor.decision.mutation-boundary.start", {
    campaignId: input.campaignId,
    actorId: input.actorId,
    savepointName,
  });

  const close = (mode: "commit" | "rollback"): void => {
    if (closed) return;
    if (mode === "rollback") {
      sqlite.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    }
    sqlite.exec(`RELEASE SAVEPOINT ${savepointName}`);
    closed = true;
    log.event("actor.decision.mutation-boundary.close", {
      campaignId: input.campaignId,
      actorId: input.actorId,
      savepointName,
      mode,
    });
  };

  return {
    commit: () => close("commit"),
    rollback: () => close("rollback"),
  };
}

function durableActorEventId(result: ExecutedScenePlanActionResult): string | null {
  if (result.toolName !== "log_event" && result.toolName !== "record_dialogue_outcome") {
    return null;
  }
  if (!result.result.success) return null;
  const payload = result.result.result;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (record.durability !== "durable" || record.persisted !== true) {
    return null;
  }
  return typeof record.eventId === "string" && record.eventId.trim()
    ? record.eventId.trim()
    : null;
}

async function retractActorDecisionExternalSideEffects(input: {
  campaignId: string;
  actionResults: readonly ExecutedScenePlanActionResult[];
}): Promise<void> {
  for (const actionResult of input.actionResults) {
    const eventId = durableActorEventId(actionResult);
    if (!eventId) continue;
    try {
      await retractStoredEpisodicEvent({
        campaignId: input.campaignId,
        eventId,
      });
    } catch (error) {
      log.warn("Failed to retract durable actor event after decision rollback", {
        campaignId: input.campaignId,
        eventId,
        toolName: actionResult.toolName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function runActorDecisionMutationBoundary<T>(input: {
  campaignId: string;
  actorId: string;
  actionResults: () => readonly ExecutedScenePlanActionResult[];
  run: () => Promise<T>;
}): Promise<T> {
  const boundary = createActorDecisionMutationBoundary({
    campaignId: input.campaignId,
    actorId: input.actorId,
  });
  try {
    const result = await input.run();
    boundary.commit();
    return result;
  } catch (error) {
    try {
      boundary.rollback();
    } catch (rollbackError) {
      log.warn("Failed to rollback actor decision mutation boundary", {
        campaignId: input.campaignId,
        actorId: input.actorId,
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }
    await retractActorDecisionExternalSideEffects({
      campaignId: input.campaignId,
      actionResults: input.actionResults(),
    });
    throw error;
  }
}

export async function executeActorDecisionPacket(
  args: ExecuteActorDecisionPacketArgs,
): Promise<ExecuteActorDecisionPacketResult> {
  const packet = assertBoundActorDecisionPacket({
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
    const authorityOverride = args.authorityForTool?.({ packet, request, index });
    if (context.authority && authorityOverride) {
      context.authority.toolResultId = authorityOverride.toolResultId;
      context.authority.metadata = authorityOverride.metadata;
    }
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

export interface RunScheduledActorDecisionArgs {
  campaignId: string;
  tick: number;
  provider: ProviderConfig;
  sceneFrame: SceneFrame;
  decision: ActorScheduleDecision;
  process: KeyActorProcess;
  playerAction?: string;
  elapsedWorldTimeMinutes?: number;
  maxOutputTokens?: number;
  legalTools?: readonly RuntimeToolName[];
  decideActor?: RunRequiredActorDecisionPassArgs["decideActor"];
  authorityForTool?: ExecuteActorDecisionPacketArgs["authorityForTool"];
  commitProcessDecision?: (input: {
    decision: ActorScheduleDecision;
    process: KeyActorProcess;
    packet: ParsedActorDecisionPacket;
    actionResults: ExecutedScenePlanActionResult[];
    clockBeforeCommit: WorldClockState;
    processState: KeyActorProcessState;
  }) => {
    status: ReturnType<typeof updateActorProcessAfterDecision>["status"];
    authority?: ToolResultAuthority;
  };
}

export async function runScheduledActorDecision(
  args: RunScheduledActorDecisionArgs,
): Promise<ActorDecisionPassRecord> {
  const clockBefore = readWorldClock(args.campaignId);
  if (typeof args.sceneFrame.worldVersion !== "number") {
    throw new Error("actor_decision_missing_scene_frame_world_version");
  }
  if (args.sceneFrame.worldVersion !== clockBefore.worldVersion) {
    throw new Error(
      `actor_decision_stale_scene_frame:${args.sceneFrame.worldVersion}->${clockBefore.worldVersion}`,
    );
  }
  const knowledge = retrieveActorKnowledgeForFrame({
    campaignId: args.campaignId,
    actorId: args.decision.actorId,
    frame: args.sceneFrame,
    worldVersion: clockBefore.worldVersion,
    maxFacts: 12,
  });
  const prepared = await prepareActorDecision({
    args: {
      campaignId: args.campaignId,
      tick: args.tick,
      provider: args.provider,
      sceneFrame: args.sceneFrame,
      playerAction: args.playerAction ?? args.sceneFrame.playerAction,
      playerLocationId: args.sceneFrame.currentLocationId,
      playerSceneScopeId: args.sceneFrame.currentSceneScopeId,
      elapsedWorldTimeMinutes: args.elapsedWorldTimeMinutes,
      maxOutputTokens: args.maxOutputTokens,
      legalTools: args.legalTools,
      decideActor: args.decideActor,
    },
    decision: args.decision,
    process: args.process,
    knowledge,
  });
  let execution: ExecuteActorDecisionPacketResult | null = null;
  return runActorDecisionMutationBoundary({
    campaignId: args.campaignId,
    actorId: args.decision.actorId,
    actionResults: () => execution?.actionResults ?? [],
    run: async () => {
      execution = await executeActorDecisionPacket({
        campaignId: args.campaignId,
        tick: args.tick,
        sceneFrame: args.sceneFrame,
        actorFrame: prepared.actorFrame,
        packet: prepared.packet,
        baseWorldVersion: requireActorFrameWorldVersion(prepared.actorFrame),
        elapsedWorldTimeMinutes: args.elapsedWorldTimeMinutes,
        authorityForTool: args.authorityForTool,
      });

      const clockAfter = readWorldClock(args.campaignId);
      const processState = nextProcessState({
        process: args.process,
        packet: execution.packet,
        toolSucceeded: execution.actionResults.some(isAcceptedActorProcessAction),
      });
      const processCommit = args.commitProcessDecision
        ? args.commitProcessDecision({
          decision: args.decision,
          process: args.process,
          packet: execution.packet,
          actionResults: execution.actionResults,
          clockBeforeCommit: clockAfter,
          processState,
        })
        : updateActorProcessAfterDecision({
          campaignId: args.campaignId,
          actorId: args.decision.actorId,
          expectedBaseWorldVersion: args.process.lastWorldVersion,
          resultWorldVersion: clockAfter.worldVersion,
          lastWakeWorldTimeMinutes: clockAfter.worldTimeMinutes,
          nextWakeWorldTimeMinutes: nextWakeWorldTime({
            clock: clockAfter,
            packet: execution.packet,
          }),
          status: "waiting",
          processState,
        });
      if (processCommit.status !== "updated") {
        throw new Error(
          `Actor process update failed for ${args.decision.actorId}: ${processCommit.status}`,
        );
      }
      const authority = "authority" in processCommit ? processCommit.authority : undefined;

      return {
        schedule: args.decision,
        actorFrame: prepared.actorFrame,
        packet: execution.packet,
        actionResults: execution.actionResults,
        processUpdateStatus: processCommit.status,
        authority,
      };
    },
  });
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
    legalTools: input.args.legalTools ?? ACTOR_TURN_LEGAL_TOOLS,
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
  const presentActorReactionRoute =
    args.presentActorReactionRoute
    ?? (shouldDeferPresenceOnlyActorReactions(args.playerAction)
      ? "proposal_after_done"
      : "required_before_done");
  const schedule = (args.scheduleActorProcesses ?? scheduleKeyActorProcessesForTurn)({
    campaignId: args.campaignId,
    tick: args.tick,
    playerLocationId: args.playerLocationId,
    playerSceneScopeId: args.playerSceneScopeId,
    elapsedWorldTimeMinutes: args.elapsedWorldTimeMinutes,
    presentActorReactionRoute,
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

  const preparedDecisions: PreparedActorDecision[] = [];
  for (const preparedResult of preparedRun.results) {
    if (preparedResult.status === "failed") {
      throw new Error(
        `Actor decision preparation failed for ${preparedResult.jobId}: ${preparedResult.error}`,
      );
    }
    preparedDecisions.push(preparedResult.value);
  }

  await runActorDecisionMutationBoundary({
    campaignId: args.campaignId,
    actorId: "required-pass",
    actionResults: () => actionResults,
    run: async () => {
      for (const { decision, process, actorFrame, packet } of preparedDecisions) {
        const execution = await executeActorDecisionPacket({
          campaignId: args.campaignId,
          tick: args.tick,
          sceneFrame: args.sceneFrame,
          actorFrame,
          packet,
          baseWorldVersion: requireActorFrameWorldVersion(actorFrame),
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
            toolSucceeded: execution.actionResults.some(isAcceptedActorProcessAction),
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
    },
  });

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
