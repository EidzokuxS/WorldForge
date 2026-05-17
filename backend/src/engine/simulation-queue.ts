import type { ProviderConfig } from "../ai/provider-registry.js";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  simulationProposals,
} from "../db/schema.js";
import {
  queueSimulationJob,
  readWorldClock,
  type AuthoritySourceEntity,
} from "./living-world-authority.js";
import {
  scheduleKeyActorProcessesForTurn,
  type ActorScheduleDecision,
} from "./actor-scheduler.js";
import {
  createSimulationProposal,
  parseSimulationProposalPayload,
  type CreatedSimulationProposal,
  type SimulationProposalIntendedTool,
  type SimulationProposalWriteScope,
} from "./simulation-proposal.js";

export const POST_TURN_SIMULATION_INTERVAL = 5;

export interface PostTurnSimulationQueueInput {
  campaignId: string;
  tick: number;
  judgeProvider: ProviderConfig;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
  route?: string;
  interval?: number;
  idempotencyKey?: string;
}

export interface PostTurnSimulationQueueResult {
  campaignId: string;
  baseWorldVersion: number;
  worldTimeMinutes: number;
  queued: CreatedSimulationProposal[];
  actorSchedules: ActorScheduleDecision[];
}

function providerDescriptor(provider: ProviderConfig): Record<string, string | undefined> {
  return {
    id: provider.id,
    model: provider.model,
    baseUrl: provider.baseUrl,
  };
}

function dueOnInterval(tick: number, interval: number): boolean {
  return tick > 0 && tick % interval === 0;
}

function enqueueProposal(input: {
  campaignId: string;
  baseWorldVersion: number;
  jobType: string;
  proposalType: string;
  sourceEntity: AuthoritySourceEntity;
  priority?: number;
  tick: number;
  worldTimeMinutes: number;
  route?: string;
  summary: string;
  readSet: readonly string[];
  writeScopes: readonly SimulationProposalWriteScope[];
  preconditions?: readonly string[];
  intendedTools?: readonly SimulationProposalIntendedTool[];
  idempotencyKey?: string;
  payload: unknown;
}): CreatedSimulationProposal {
  const existing = input.idempotencyKey
    ? findReusableProposalByIdempotencyKey(input.campaignId, input.idempotencyKey)
    : null;
  if (existing) {
    return existing;
  }

  const jobId = queueSimulationJob({
    campaignId: input.campaignId,
    jobType: input.jobType,
    baseWorldVersion: input.baseWorldVersion,
    sourceEntity: input.sourceEntity,
    idempotencyKey: input.idempotencyKey,
    priority: input.priority ?? 0,
    payload: input.payload,
  });

  return createSimulationProposal({
    campaignId: input.campaignId,
    proposalType: input.proposalType,
    baseWorldVersion: input.baseWorldVersion,
    sourceEntity: input.sourceEntity,
    jobId,
    idempotencyKey: input.idempotencyKey,
    summary: input.summary,
    readSet: input.readSet,
    writeScopes: input.writeScopes,
    preconditions: input.preconditions,
    dueAtWorldTimeMinutes: input.worldTimeMinutes,
    expiresAtWorldTimeMinutes: input.worldTimeMinutes + 24 * 60,
    priority: input.priority ?? 0,
    intendedTools: input.intendedTools,
    provenance: {
      source: "post-turn-simulation-queue",
      tick: input.tick,
      route: input.route,
      idempotencyKey: input.idempotencyKey,
    },
    data: input.payload,
  });
}

function proposalIdempotencyKey(input: {
  rootKey?: string;
  proposalType: string;
  sourceEntity: AuthoritySourceEntity;
}): string | undefined {
  if (!input.rootKey) {
    return undefined;
  }
  return [
    input.rootKey,
    input.proposalType,
    input.sourceEntity.type,
    input.sourceEntity.id ?? "none",
  ].join(":");
}

function findReusableProposalByIdempotencyKey(
  campaignId: string,
  idempotencyKey: string,
): CreatedSimulationProposal | null {
  const rows = getDb()
    .select()
    .from(simulationProposals)
    .where(and(
      eq(simulationProposals.campaignId, campaignId),
      eq(simulationProposals.idempotencyKey, idempotencyKey),
    ))
    .get();

  if (!rows) {
    return null;
  }
  const payload = parseSimulationProposalPayload(rows.payload);
  return {
    proposalId: rows.id,
    campaignId: rows.campaignId,
    proposalType: rows.proposalType,
    baseWorldVersion: rows.baseWorldVersion,
    writeScopes: payload.writeScopes,
    status: rows.status,
    disposition: rows.proposalDisposition === "pending" && rows.status === "committed"
      ? "committed"
      : rows.proposalDisposition,
    dueAtWorldTimeMinutes: rows.dueAtWorldTimeMinutes ?? payload.dueAtWorldTimeMinutes,
    priority: rows.priority ?? payload.priority,
  };
}

export function queuePostTurnSimulationProposals(
  input: PostTurnSimulationQueueInput,
): PostTurnSimulationQueueResult {
  const clock = readWorldClock(input.campaignId);
  const interval = input.interval ?? POST_TURN_SIMULATION_INTERVAL;
  const provider = providerDescriptor(input.judgeProvider);
  const queued: CreatedSimulationProposal[] = [];
  const actorSchedules = input.playerLocationId
    ? scheduleKeyActorProcessesForTurn({
        campaignId: input.campaignId,
        tick: input.tick,
        playerLocationId: input.playerLocationId,
        playerSceneScopeId: input.playerSceneScopeId,
        presentActorReactionRoute: "proposal_after_done",
      }).decisions
    : [];

  for (const schedule of actorSchedules) {
    if (
      schedule.route !== "proposal_after_done"
      && schedule.route !== "deterministic_continuation"
    ) {
      continue;
    }
    queued.push(
      enqueueProposal({
        campaignId: input.campaignId,
        baseWorldVersion: clock.worldVersion,
        jobType: "key_actor_process",
        proposalType:
          schedule.route === "deterministic_continuation"
            ? "key_actor_deterministic_continuation"
            : "key_actor_decision",
        sourceEntity: { type: "npc", id: schedule.actorId },
        idempotencyKey: proposalIdempotencyKey({
          rootKey: input.idempotencyKey,
          proposalType:
            schedule.route === "deterministic_continuation"
              ? "key_actor_deterministic_continuation"
              : "key_actor_decision",
          sourceEntity: { type: "npc", id: schedule.actorId },
        }),
        priority: schedule.signals[0]?.priority ?? 5,
        tick: input.tick,
        worldTimeMinutes: clock.worldTimeMinutes,
        route: input.route,
        summary: `${schedule.actorName}: ${schedule.reason}`,
        readSet: [
          `world_version:${clock.worldVersion}`,
          `world_time:${clock.worldTimeMinutes}`,
          `npc:${schedule.actorId}:process`,
        ],
        writeScopes: schedule.writeScopes,
        preconditions: [
          "Actor process proposals cannot mutate state until base world version and write scopes are validated.",
        ],
        intendedTools: [{
          name: "actor_decision",
          reason: schedule.route,
        }],
        payload: {
          tick: input.tick,
          provider,
          schedule,
        },
      }),
    );
  }

  if (input.playerLocationId && dueOnInterval(input.tick, interval)) {
    queued.push(
      enqueueProposal({
        campaignId: input.campaignId,
        baseWorldVersion: clock.worldVersion,
        jobType: "npc_offscreen_tick",
        proposalType: "npc_offscreen_updates",
        sourceEntity: { type: "system", id: "npc-offscreen" },
        idempotencyKey: proposalIdempotencyKey({
          rootKey: input.idempotencyKey,
          proposalType: "npc_offscreen_updates",
          sourceEntity: { type: "system", id: "npc-offscreen" },
        }),
        priority: 10,
        tick: input.tick,
        worldTimeMinutes: clock.worldTimeMinutes,
        route: input.route,
        summary: "Evaluate key NPCs outside the player-visible scene without committing direct state.",
        readSet: [
          `tick:${input.tick}`,
          `player_location:${input.playerLocationId}`,
          `player_scene:${input.playerSceneScopeId ?? input.playerLocationId}`,
        ],
        writeScopes: [`location:${input.playerLocationId}:recent_event`],
        preconditions: ["Do not apply NPC moves, goals, events, or reflection budget until a supported proposal executor tool validates base world version and write scope."],
        intendedTools: [{
          name: "record_location_event",
          reason: "surface_offscreen_interval_due",
          args: {
            locationRef: input.playerLocationId,
            eventType: "npc_offscreen_interval_due",
            summary: "Offscreen NPC simulation interval became due outside the player-visible scene.",
            importance: 2,
            visibility: "report_only",
            surfaceRoute: "offscreen_scheduler_diagnostic",
            knowledgeRoute: "system:npc-offscreen",
          },
        }],
        payload: {
          tick: input.tick,
          provider,
          playerLocationId: input.playerLocationId,
          playerSceneScopeId: input.playerSceneScopeId ?? null,
          interval,
        },
      }),
    );
  }

  return {
    campaignId: input.campaignId,
    baseWorldVersion: clock.worldVersion,
    worldTimeMinutes: clock.worldTimeMinutes,
    queued,
    actorSchedules,
  };
}

export function buildDoneBoundaryData(
  campaignId: string,
  data: unknown,
): Record<string, unknown> {
  const base: Record<string, unknown> = data && typeof data === "object" && !Array.isArray(data)
    ? { ...data as Record<string, unknown> }
    : { value: data };
  const clock = readWorldClock(campaignId);
  const inputTick = base["tick"];
  const coherentTick = typeof inputTick === "number"
    ? Math.max(inputTick, clock.currentTick, clock.worldTimeMinutes)
    : null;
  return {
    ...base,
    ...(coherentTick === null ? {} : { tick: coherentTick }),
    worldVersion: clock.worldVersion,
    worldTimeMinutes: clock.worldTimeMinutes,
  };
}
