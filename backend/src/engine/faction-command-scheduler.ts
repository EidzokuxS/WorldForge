import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  factionCommandNodes,
  factionOperations,
  factionResources,
} from "../db/schema.js";
import {
  listCriticalActorWakeCandidates,
  type ActorWakeSignalRecord,
} from "./actor-wake-signals.js";
import {
  listAvailableFactionReports,
  type FactionReportRecord,
} from "./faction-command-network.js";
import { readWorldClock } from "./living-world-authority.js";
import type { SimulationProposalWriteScope } from "./simulation-proposal.js";

export interface FactionCommandResourceSummary {
  resourceKey: string;
  label: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

export interface FactionCommandRetryOperation {
  operationId: string;
  reason: string;
}

export interface FactionCommandDecisionCandidate {
  commandNodeId: string;
  factionId: string;
  label: string;
  reason: string;
  reasons: string[];
  reports: FactionReportRecord[];
  standingOrders: string[];
  resources: FactionCommandResourceSummary[];
  wakeSignals: ActorWakeSignalRecord[];
  retryOperations: FactionCommandRetryOperation[];
  writeScopes: SimulationProposalWriteScope[];
}

export interface ScheduleFactionCommandNodesInput {
  campaignId: string;
  commandNodeIds?: readonly string[];
  worldTimeMinutes?: number;
}

export interface ScheduleFactionCommandNodesResult {
  campaignId: string;
  baseWorldVersion: number;
  worldTimeMinutes: number;
  candidates: FactionCommandDecisionCandidate[];
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function loadCommandNodes(input: {
  campaignId: string;
  commandNodeIds?: readonly string[];
}) {
  const ids = [...new Set(input.commandNodeIds ?? [])].filter(Boolean);
  return getDb()
    .select()
    .from(factionCommandNodes)
    .where(
      and(
        eq(factionCommandNodes.campaignId, input.campaignId),
        eq(factionCommandNodes.status, "active"),
        ids.length > 0 ? inArray(factionCommandNodes.id, ids) : undefined,
      ),
    )
    .all();
}

function loadResources(input: {
  campaignId: string;
  factionId: string;
}): FactionCommandResourceSummary[] {
  return getDb()
    .select()
    .from(factionResources)
    .where(
      and(
        eq(factionResources.campaignId, input.campaignId),
        eq(factionResources.factionId, input.factionId),
      ),
    )
    .all()
    .map((row) => ({
      resourceKey: row.resourceKey,
      label: row.label,
      quantity: row.quantity,
      reservedQuantity: row.reservedQuantity,
      availableQuantity: Math.max(0, row.quantity - row.reservedQuantity),
    }));
}

function loadRetryOperations(input: {
  campaignId: string;
  commandNodeId: string;
}): FactionCommandRetryOperation[] {
  return getDb()
    .select()
    .from(factionOperations)
    .where(
      and(
        eq(factionOperations.campaignId, input.campaignId),
        eq(factionOperations.commandNodeId, input.commandNodeId),
        eq(factionOperations.status, "blocked"),
      ),
    )
    .all()
    .flatMap((row) => {
      const reason = row.blockedReason ?? "";
      return reason.startsWith("insufficient_resource:")
        ? [{ operationId: row.id, reason }]
        : [];
    });
}

function groupWakeSignalsByNode(
  wakeSignals: readonly ActorWakeSignalRecord[],
): Map<string, ActorWakeSignalRecord[]> {
  const result = new Map<string, ActorWakeSignalRecord[]>();
  for (const signal of wakeSignals) {
    const existing = result.get(signal.actorId) ?? [];
    existing.push(signal);
    result.set(signal.actorId, existing);
  }
  return result;
}

function buildWriteScopes(input: {
  factionId: string;
  commandNodeId: string;
  reports: readonly FactionReportRecord[];
  resources: readonly FactionCommandResourceSummary[];
}): SimulationProposalWriteScope[] {
  return [
    `faction:${input.factionId}:command`,
    `faction:${input.factionId}:operations`,
    `faction:${input.factionId}:reports`,
    ...input.resources.map((resource) => `faction:${input.factionId}:resource:${resource.resourceKey}` as const),
    `world:faction-command-node:${input.commandNodeId}`,
    ...input.reports.map((report) => `event:faction-report:${report.id}` as const),
  ];
}

export function scheduleFactionCommandNodes(
  input: ScheduleFactionCommandNodesInput,
): ScheduleFactionCommandNodesResult {
  const clock = readWorldClock(input.campaignId);
  const worldTimeMinutes = input.worldTimeMinutes ?? clock.worldTimeMinutes;
  const nodes = loadCommandNodes(input);
  const wakeSignalsByNode = groupWakeSignalsByNode(
    listCriticalActorWakeCandidates({
      campaignId: input.campaignId,
      actorType: "faction_command_node",
      actorIds: nodes.map((node) => node.id),
      worldTimeMinutes,
    }),
  );

  const candidates = nodes.flatMap((node): FactionCommandDecisionCandidate[] => {
    const reports = listAvailableFactionReports({
      campaignId: input.campaignId,
      commandNodeId: node.id,
    });
    const standingOrders = parseStringArray(node.standingOrders);
    const wakeSignals = wakeSignalsByNode.get(node.id) ?? [];
    const retryOperations = loadRetryOperations({
      campaignId: input.campaignId,
      commandNodeId: node.id,
    });
    const reasons = [
      reports.length > 0 ? "available_report" : null,
      standingOrders.length > 0 ? "standing_order" : null,
      wakeSignals.length > 0 ? "durable_wake_signal" : null,
      retryOperations.length > 0 ? "operation_retry" : null,
    ].filter((reason): reason is string => Boolean(reason));
    if (reasons.length === 0) {
      return [];
    }

    const resources = loadResources({
      campaignId: input.campaignId,
      factionId: node.factionId,
    });
    return [{
      commandNodeId: node.id,
      factionId: node.factionId,
      label: node.label,
      reason: reasons[0]!,
      reasons,
      reports,
      standingOrders,
      resources,
      wakeSignals,
      retryOperations,
      writeScopes: buildWriteScopes({
        factionId: node.factionId,
        commandNodeId: node.id,
        reports,
        resources,
      }),
    }];
  });

  return {
    campaignId: input.campaignId,
    baseWorldVersion: clock.worldVersion,
    worldTimeMinutes,
    candidates,
  };
}
