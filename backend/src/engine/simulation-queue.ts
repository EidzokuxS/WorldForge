import type { ProviderConfig } from "../ai/provider-registry.js";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  factionCommandNodes,
  factionReports,
  factionResources,
  factions,
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
import { scheduleFactionCommandNodes } from "./faction-command-scheduler.js";
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

function buildFactionCommandRoutingSnapshot(campaignId: string): {
  factionCount: number;
  commandNodeCount: number;
  availableReportCount: number;
  resourceRouteCount: number;
  commandNodeCandidateIds: string[];
  candidates: Array<{
    commandNodeId: string;
    factionId: string;
    reason: string;
    reportIds: string[];
    standingOrderCount: number;
    resourceKeys: string[];
  }>;
  routingWarnings: string[];
} {
  const db = getDb();
  const factionCount = db
    .select()
    .from(factions)
    .where(eq(factions.campaignId, campaignId))
    .all().length;
  const commandNodeCount = db
    .select()
    .from(factionCommandNodes)
    .where(eq(factionCommandNodes.campaignId, campaignId))
    .all().length;
  const availableReportCount = db
    .select()
    .from(factionReports)
    .where(eq(factionReports.campaignId, campaignId))
    .all()
    .filter((row) => row.status === "available").length;
  const resourceRouteCount = db
    .select()
    .from(factionResources)
    .where(eq(factionResources.campaignId, campaignId))
    .all().length;
  const schedule = scheduleFactionCommandNodes({ campaignId });
  return {
    factionCount,
    commandNodeCount,
    availableReportCount,
    resourceRouteCount,
    commandNodeCandidateIds: schedule.candidates.map((candidate) => candidate.commandNodeId),
    candidates: schedule.candidates.map((candidate) => ({
      commandNodeId: candidate.commandNodeId,
      factionId: candidate.factionId,
      reason: candidate.reason,
      reportIds: candidate.reports.map((report) => report.id),
      standingOrderCount: candidate.standingOrders.length,
      resourceKeys: candidate.resources.map((resource) => resource.resourceKey),
    })),
    routingWarnings: commandNodeCount === 0 && factionCount > 0
      ? ["No faction command nodes exist yet; command-node proposals must seed routing before committing faction action."]
      : [],
  };
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
        writeScopes: ["npc:state", "event:npc_offscreen", "memory:reflection_budget"],
        preconditions: ["Do not apply NPC moves, goals, events, or reflection budget until proposal commit validates base world version."],
        intendedTools: [
          { name: "npc_offscreen_update", reason: "interval_due" },
          { name: "record_location_event", reason: "surface_offscreen_change" },
        ],
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

  queued.push(
    enqueueProposal({
      campaignId: input.campaignId,
      baseWorldVersion: clock.worldVersion,
      jobType: "npc_reflection_scan",
      proposalType: "npc_reflection_updates",
      sourceEntity: { type: "system", id: "npc-reflection" },
      idempotencyKey: proposalIdempotencyKey({
        rootKey: input.idempotencyKey,
        proposalType: "npc_reflection_updates",
        sourceEntity: { type: "system", id: "npc-reflection" },
      }),
      priority: 5,
      tick: input.tick,
      worldTimeMinutes: clock.worldTimeMinutes,
      route: input.route,
      summary: "Scan reflection-eligible NPCs and propose memory/belief/goal updates only.",
      readSet: [`tick:${input.tick}`, "npc:unprocessed_importance"],
      writeScopes: ["npc:memory", "npc:belief", "npc:goal", "npc:identity"],
      preconditions: ["Reflection tools cannot directly mutate NPC records from detached post-turn work."],
      intendedTools: [{ name: "npc_reflection_update", reason: "post_turn_reflection_scan" }],
      payload: {
        tick: input.tick,
        provider,
      },
    }),
  );

  if (dueOnInterval(input.tick, interval)) {
    const factionRouting = buildFactionCommandRoutingSnapshot(input.campaignId);
    queued.push(
      enqueueProposal({
        campaignId: input.campaignId,
        baseWorldVersion: clock.worldVersion,
        jobType: "faction_command_tick",
        proposalType: "faction_command_updates",
        sourceEntity: { type: "system", id: "faction-command-network" },
        idempotencyKey: proposalIdempotencyKey({
          rootKey: input.idempotencyKey,
          proposalType: "faction_command_updates",
          sourceEntity: { type: "system", id: "faction-command-network" },
        }),
        priority: 1,
        tick: input.tick,
        worldTimeMinutes: clock.worldTimeMinutes,
        route: input.route,
        summary: "Evaluate faction command nodes through reports, standing orders, and resource ledgers before proposing any faction/world change.",
        readSet: [
          `tick:${input.tick}`,
          "faction:command_nodes",
          "faction:reports",
          "faction:resources",
        ],
        writeScopes: ["faction:command_network", "world:event", "location:event"],
        preconditions: [
          "Faction work cannot directly mutate state from detached post-turn work.",
          "A committed faction operation must cite a command node plus available report or standing order and validated resources.",
        ],
        intendedTools: [
          { name: "faction_command_operation", reason: "interval_due" },
          { name: "record_world_event", reason: "surface_faction_consequence" },
        ],
        payload: {
          tick: input.tick,
          provider,
          interval,
          factionRouting,
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
  const base = data && typeof data === "object" && !Array.isArray(data)
    ? { ...data as Record<string, unknown> }
    : { value: data };
  const clock = readWorldClock(campaignId);
  return {
    ...base,
    worldVersion: clock.worldVersion,
    worldTimeMinutes: clock.worldTimeMinutes,
  };
}
