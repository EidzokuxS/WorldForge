import {
  buildFactionCommandNodeFrame,
  commitFactionOperation,
  proposeFactionOperation,
  type FactionOperationCommitResult,
  type FactionOperationProposalResult,
} from "./faction-command-network.js";
import {
  scheduleFactionCommandNodes,
  type FactionCommandDecisionCandidate,
} from "./faction-command-scheduler.js";
import type { CommandNodeFrame } from "./actor-frame.js";

export type CommandNodeDecision =
  | {
      action: "none";
      reason?: string;
    }
  | {
      action: "propose_operation";
      operationKind: string;
      summary: string;
      requiredReportIds?: readonly string[];
      resourceCosts: Record<string, number>;
      targetLocationId?: string | null;
      commit?: boolean;
      surfaceSummary?: string | null;
      surfaceLocationRef?: string | null;
    }
  | {
      action: "commit_operation";
      operationId: string;
      surfaceSummary?: string | null;
      surfaceLocationRef?: string | null;
    };

export interface DecideCommandNodeInput {
  frame: CommandNodeFrame;
  candidate: FactionCommandDecisionCandidate;
}

export type DecideCommandNode = (
  input: DecideCommandNodeInput,
) => CommandNodeDecision | Promise<CommandNodeDecision>;

export interface CommandNodeDecisionResult {
  commandNodeId: string;
  factionId: string;
  decision: CommandNodeDecision;
  proposal?: FactionOperationProposalResult;
  commit?: FactionOperationCommitResult;
}

export interface RunCommandNodeDecisionPassInput {
  campaignId: string;
  tick: number;
  commandNodeIds?: readonly string[];
  decideCommandNode?: DecideCommandNode;
}

export interface RunCommandNodeDecisionPassResult {
  campaignId: string;
  tick: number;
  inspectedCommandNodeIds: string[];
  results: CommandNodeDecisionResult[];
}

function defaultDecideCommandNode(): CommandNodeDecision {
  return {
    action: "none",
    reason: "no command-node decision provider configured",
  };
}

function defaultRequiredReportIds(
  candidate: FactionCommandDecisionCandidate,
  decision: Extract<CommandNodeDecision, { action: "propose_operation" }>,
): readonly string[] {
  return decision.requiredReportIds ?? candidate.reports.map((report) => report.id);
}

export async function runCommandNodeDecisionPass(
  input: RunCommandNodeDecisionPassInput,
): Promise<RunCommandNodeDecisionPassResult> {
  const schedule = scheduleFactionCommandNodes({
    campaignId: input.campaignId,
    commandNodeIds: input.commandNodeIds,
  });
  const decide = input.decideCommandNode ?? defaultDecideCommandNode;
  const results: CommandNodeDecisionResult[] = [];

  for (const candidate of schedule.candidates) {
    const frame = buildFactionCommandNodeFrame({
      campaignId: input.campaignId,
      commandNodeId: candidate.commandNodeId,
      worldVersion: schedule.baseWorldVersion,
    });
    const decision = await decide({ frame, candidate });

    if (decision.action === "none") {
      results.push({
        commandNodeId: candidate.commandNodeId,
        factionId: candidate.factionId,
        decision,
      });
      continue;
    }

    if (decision.action === "commit_operation") {
      results.push({
        commandNodeId: candidate.commandNodeId,
        factionId: candidate.factionId,
        decision,
        commit: commitFactionOperation({
          campaignId: input.campaignId,
          operationId: decision.operationId,
          surfaceSummary: decision.surfaceSummary,
          surfaceLocationRef: decision.surfaceLocationRef,
        }),
      });
      continue;
    }

    const proposal = proposeFactionOperation({
      campaignId: input.campaignId,
      factionId: candidate.factionId,
      commandNodeId: candidate.commandNodeId,
      operationKind: decision.operationKind,
      summary: decision.summary,
      requiredReportIds: defaultRequiredReportIds(candidate, decision),
      resourceCosts: decision.resourceCosts,
      targetLocationId: decision.targetLocationId,
      baseWorldVersion: schedule.baseWorldVersion,
    });
    const commit = decision.commit === true && proposal.status === "proposed"
      ? commitFactionOperation({
          campaignId: input.campaignId,
          operationId: proposal.operation.id,
          surfaceSummary: decision.surfaceSummary,
          surfaceLocationRef: decision.surfaceLocationRef,
        })
      : undefined;
    results.push({
      commandNodeId: candidate.commandNodeId,
      factionId: candidate.factionId,
      decision,
      proposal,
      commit,
    });
  }

  return {
    campaignId: input.campaignId,
    tick: input.tick,
    inspectedCommandNodeIds: schedule.candidates.map((candidate) => candidate.commandNodeId),
    results,
  };
}
