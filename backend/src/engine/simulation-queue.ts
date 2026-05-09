import type { ProviderConfig } from "../ai/provider-registry.js";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  factionCommandNodes,
  factionReports,
  factionResources,
  factions,
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
  type CreatedSimulationProposal,
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
  return {
    factionCount,
    commandNodeCount,
    availableReportCount,
    resourceRouteCount,
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
  route?: string;
  summary: string;
  readSet: readonly string[];
  writeScopes: readonly SimulationProposalWriteScope[];
  preconditions?: readonly string[];
  payload: unknown;
}): CreatedSimulationProposal {
  const jobId = queueSimulationJob({
    campaignId: input.campaignId,
    jobType: input.jobType,
    baseWorldVersion: input.baseWorldVersion,
    sourceEntity: input.sourceEntity,
    priority: input.priority ?? 0,
    payload: input.payload,
  });

  return createSimulationProposal({
    campaignId: input.campaignId,
    proposalType: input.proposalType,
    baseWorldVersion: input.baseWorldVersion,
    sourceEntity: input.sourceEntity,
    jobId,
    summary: input.summary,
    readSet: input.readSet,
    writeScopes: input.writeScopes,
    preconditions: input.preconditions,
    provenance: {
      source: "post-turn-simulation-queue",
      tick: input.tick,
      route: input.route,
    },
    data: input.payload,
  });
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
        priority: schedule.signals[0]?.priority ?? 5,
        tick: input.tick,
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
        priority: 10,
        tick: input.tick,
        route: input.route,
        summary: "Evaluate key NPCs outside the player-visible scene without committing direct state.",
        readSet: [
          `tick:${input.tick}`,
          `player_location:${input.playerLocationId}`,
          `player_scene:${input.playerSceneScopeId ?? input.playerLocationId}`,
        ],
        writeScopes: ["npc:state", "event:npc_offscreen", "memory:reflection_budget"],
        preconditions: ["Do not apply NPC moves, goals, events, or reflection budget until proposal commit validates base world version."],
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
      priority: 5,
      tick: input.tick,
      route: input.route,
      summary: "Scan reflection-eligible NPCs and propose memory/belief/goal updates only.",
      readSet: [`tick:${input.tick}`, "npc:unprocessed_importance"],
      writeScopes: ["npc:memory", "npc:belief", "npc:goal", "npc:identity"],
      preconditions: ["Reflection tools cannot directly mutate NPC records from detached post-turn work."],
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
        priority: 1,
        tick: input.tick,
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
