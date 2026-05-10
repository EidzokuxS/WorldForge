import type { Phase94RouteId } from "../../backend/src/engine/phase-94-trace-assertions.js";
import type { Phase94CollectedTurn } from "./trace-collector.js";

export interface Phase94RouteFinding {
  routeId: Phase94RouteId;
  turnIndex: number | null;
  severity: "hard" | "soft";
  gate: string;
  message: string;
  evidenceIds: string[];
}

export interface Phase94RouteAssertionResult {
  routeId: Phase94RouteId;
  status: "passed" | "failed";
  findings: Phase94RouteFinding[];
}

function containsParserLikeClarification(text: string): boolean {
  return /which exact|exact id|clarify which|be more specific|which one do you mean|who are you actually|what are you actually/i.test(text);
}

function hasWorldProgress(turn: Phase94CollectedTurn): boolean {
  if (turn.worldBefore.hash !== turn.worldAfter.hash) return true;
  if (
    typeof turn.worldBefore.worldTimeMinutes === "number"
    && typeof turn.worldAfter.worldTimeMinutes === "number"
    && turn.worldAfter.worldTimeMinutes > turn.worldBefore.worldTimeMinutes
  ) {
    return true;
  }
  if (
    typeof turn.worldBefore.worldVersion === "number"
    && typeof turn.worldAfter.worldVersion === "number"
    && turn.worldAfter.worldVersion >= turn.worldBefore.worldVersion
  ) {
    return true;
  }
  return false;
}

function baseFindings(routeId: Phase94RouteId, turns: readonly Phase94CollectedTurn[]): Phase94RouteFinding[] {
  const findings: Phase94RouteFinding[] = [];
  if (turns.length === 0) {
    findings.push({
      routeId,
      turnIndex: null,
      severity: "hard",
      gate: "raw-artifact-coverage",
      message: "Route has no collected turns.",
      evidenceIds: [],
    });
    return findings;
  }
  for (const turn of turns) {
    if (turn.terminalEvent !== "done") {
      findings.push({
        routeId,
        turnIndex: turn.turnIndex,
        severity: "hard",
        gate: "terminal-event",
        message: "Turn did not end with terminal done event.",
        evidenceIds: [turn.rawSseArtifactId],
      });
    }
    if (turn.assistantText.trim().length === 0) {
      findings.push({
        routeId,
        turnIndex: turn.turnIndex,
        severity: "hard",
        gate: "empty-assistant-text",
        message: "Assistant text is empty.",
        evidenceIds: [turn.fullTurnArtifactId],
      });
    }
    if (containsParserLikeClarification(turn.assistantText)) {
      findings.push({
        routeId,
        turnIndex: turn.turnIndex,
        severity: "hard",
        gate: "parser-like-response",
        message: "Assistant response appears to ask parser-style exact-ID clarification.",
        evidenceIds: [turn.fullTurnArtifactId],
      });
    }
  }
  return findings;
}

function routeSpecificFindings(routeId: Phase94RouteId, turns: readonly Phase94CollectedTurn[]): Phase94RouteFinding[] {
  const findings: Phase94RouteFinding[] = [];
  if (routeId === "tourist-courier" && !turns.some(hasWorldProgress)) {
    findings.push({
      routeId,
      turnIndex: null,
      severity: "hard",
      gate: "tourist-world-progress",
      message: "Tourist/courier smoke route did not show world hash, version, or time progress.",
      evidenceIds: turns.map((turn) => turn.traceArtifactId),
    });
  }
  if (routeId === "proposal-backlog-world-time" && !turns.some(hasWorldProgress)) {
    findings.push({
      routeId,
      turnIndex: null,
      severity: "hard",
      gate: "proposal-world-time",
      message: "Proposal backlog route did not show world-time or world-version movement.",
      evidenceIds: turns.map((turn) => turn.traceArtifactId),
    });
  }
  if (routeId === "narrator-repair-prose") {
    findings.push({
      routeId,
      turnIndex: null,
      severity: "soft",
      gate: "soft-review-required",
      message: "Narrator prose quality requires LLM/human review; code does not auto-pass prose quality.",
      evidenceIds: turns.map((turn) => turn.fullTurnArtifactId),
    });
  }
  return findings;
}

export function assertPhase94Route(input: {
  routeId: Phase94RouteId;
  turns: readonly Phase94CollectedTurn[];
}): Phase94RouteAssertionResult {
  const findings = [
    ...baseFindings(input.routeId, input.turns),
    ...routeSpecificFindings(input.routeId, input.turns),
  ];
  return {
    routeId: input.routeId,
    status: findings.some((finding) => finding.severity === "hard") ? "failed" : "passed",
    findings,
  };
}
