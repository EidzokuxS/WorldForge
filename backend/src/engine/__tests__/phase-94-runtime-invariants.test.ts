import { describe, expect, it } from "vitest";

import {
  evaluatePhase94Trace,
  PHASE94_HARD_INVARIANT_IDS,
  PHASE94_ROUTE_IDS,
  summarizePhase94InvariantResults,
  type Phase94HardInvariantId,
  type Phase94TraceRecord,
} from "../phase-94-trace-assertions.js";

function completeTrace(overrides: Partial<Phase94TraceRecord> = {}): Phase94TraceRecord {
  return {
    routeId: "jjk-chakra-coin",
    turnId: "turn-94-1",
    terminal: {
      eventType: "done",
      routeClosed: true,
      evidenceIds: ["terminal:done"],
    },
    artifacts: {
      rawSseIds: ["artifact:sse"],
      fullTurnArtifactIds: ["artifact:turn"],
      traceArtifactIds: ["artifact:trace"],
      screenshotIds: ["artifact:screenshot"],
      evidenceIds: ["artifact:index"],
    },
    narratorRepair: {
      unsupportedConcreteClaim: true,
      attempted: true,
      status: "succeeded",
      rolledBackTurn: false,
      preservedResolutionEvidenceIds: ["saga:resolved-pending-narration"],
      evidenceIds: ["narrator:repair"],
    },
    oracle: {
      required: true,
      acceptedDecisionId: "oracle:decision-1",
      finalReportDecisionId: "oracle:decision-1",
      linkedTurnId: "turn-94-1",
      evidenceIds: ["oracle:decision-1"],
    },
    proposals: {
      sceneTruthProposalIds: ["proposal:committed-1"],
      narratorTruthProposalIds: ["proposal:committed-1"],
      terminalProposalIds: ["proposal:committed-1"],
      committedProposalIds: ["proposal:committed-1"],
      evidenceIds: ["proposal:ledger"],
    },
    pressure: {
      visible: true,
      sourceEventIds: ["event:surface-pressure"],
      evidenceIds: ["pressure:packet"],
    },
    privacy: {
      hiddenTerms: ["secret vessel", "private faction order"],
      playerFacingText: "A clerk notices the unusual coin and asks a careful follow-up.",
      packetText: "Visible pressure: clerk interest, source event linked.",
      evidenceIds: ["privacy:redaction"],
    },
    falseClaim: {
      playerClaimedAuthority: true,
      claimEvidenceIds: ["claim:authority"],
      proofPressureIds: ["pressure:show-permit"],
      evidenceIds: ["false-claim:ledger"],
    },
    rollback: {
      occurred: false,
      evidenceIds: ["rollback:none"],
    },
    latency: {
      didClipModelOutput: false,
      durationCapApplied: false,
      timeoutAbortApplied: false,
      fakeSuccess: false,
      evidenceIds: ["latency:trace"],
    },
    livingWorld: {
      dueProposalIds: ["proposal:committed-1"],
      terminalProposalIds: ["proposal:committed-1"],
      committedProposalIds: ["proposal:committed-1"],
      keyActorProgressRequired: true,
      factionConsequenceRequired: true,
      keyActorProgressIds: ["actor:key-progress"],
      factionConsequenceIds: ["faction:report"],
      surfaceSignalIds: ["surface:rumor"],
      evidenceIds: ["living-world:ledger"],
    },
    combat: {
      combatIntent: true,
      consequenceIds: ["combat:guarded-retreat"],
      parserClarificationOnly: false,
      evidenceIds: ["combat:envelope"],
    },
    worldVersion: {
      settledWorldVersion: 12,
      nextTurnWorldVersion: 12,
      staleVersionAccepted: false,
      evidenceIds: ["world-version:12"],
    },
    ...overrides,
  };
}

function failingResultFor(
  trace: Phase94TraceRecord,
  invariantId: Phase94HardInvariantId,
) {
  return evaluatePhase94Trace(trace, [invariantId])[0];
}

describe("Phase 94 deterministic runtime invariants", () => {
  it("passes a complete sanitized trace across every hard invariant", () => {
    const results = evaluatePhase94Trace(completeTrace());

    expect(results).toHaveLength(PHASE94_HARD_INVARIANT_IDS.length);
    expect(results.map((result) => result.status)).toEqual(
      Array(PHASE94_HARD_INVARIANT_IDS.length).fill("pass"),
    );
    expect(summarizePhase94InvariantResults(results)).toEqual({
      total: PHASE94_HARD_INVARIANT_IDS.length,
      passed: PHASE94_HARD_INVARIANT_IDS.length,
      failed: 0,
      hardFailureCount: 0,
      failures: [],
    });
  });

  it("fails closed for each hard invariant when its evidence is unsafe or missing", () => {
    const cases: Array<{
      invariantId: Phase94HardInvariantId;
      trace: Phase94TraceRecord;
      reasonSnippet: string;
    }> = [
      {
        invariantId: "narrator-repair-no-turn-rollback",
        trace: completeTrace({
          narratorRepair: {
            unsupportedConcreteClaim: true,
            attempted: true,
            status: "succeeded",
            rolledBackTurn: true,
            preservedResolutionEvidenceIds: ["saga:resolved-pending-narration"],
          },
        }),
        reasonSnippet: "rolled back",
      },
      {
        invariantId: "oracle-decision-persistence",
        trace: completeTrace({
          oracle: {
            required: true,
            acceptedDecisionId: "oracle:decision-1",
            finalReportDecisionId: "oracle:decision-2",
            linkedTurnId: "turn-94-1",
          },
        }),
        reasonSnippet: "lost or replaced",
      },
      {
        invariantId: "proposal-truth-boundary",
        trace: completeTrace({
          proposals: {
            sceneTruthProposalIds: ["proposal:pending-1"],
            terminalProposalIds: [],
            committedProposalIds: [],
          },
        }),
        reasonSnippet: "Uncommitted proposals",
      },
      {
        invariantId: "surface-pressure-provenance",
        trace: completeTrace({
          pressure: {
            visible: true,
          },
        }),
        reasonSnippet: "no event, fact, thread, or surface-signal source",
      },
      {
        invariantId: "hidden-truth-privacy",
        trace: completeTrace({
          privacy: {
            hiddenTerms: ["secret vessel"],
            playerFacingText: "The secret vessel is named aloud.",
          },
        }),
        reasonSnippet: "hidden terms",
      },
      {
        invariantId: "false-claim-truth-boundary",
        trace: completeTrace({
          falseClaim: {
            playerClaimedAuthority: true,
            createdTruthIds: ["truth:free-permit"],
          },
        }),
        reasonSnippet: "direct world truth",
      },
      {
        invariantId: "rollback-limit",
        trace: completeTrace({
          rollback: {
            occurred: true,
            reason: "narrator_grounding_repair",
          },
        }),
        reasonSnippet: "unsupported reason",
      },
      {
        invariantId: "long-turn-no-shortcuts",
        trace: completeTrace({
          latency: {
            didClipModelOutput: true,
          },
        }),
        reasonSnippet: "Acceptance shortcut",
      },
      {
        invariantId: "terminal-artifact-coverage",
        trace: completeTrace({
          artifacts: {
            rawSseIds: [],
            fullTurnArtifactIds: ["artifact:turn"],
            traceArtifactIds: ["artifact:trace"],
          },
        }),
        reasonSnippet: "raw_sse",
      },
      {
        invariantId: "living-world-terminal-state",
        trace: completeTrace({
          livingWorld: {
            dueProposalIds: ["proposal:pending-1"],
            terminalProposalIds: [],
            committedProposalIds: [],
          },
        }),
        reasonSnippet: "lack terminal state",
      },
      {
        invariantId: "combat-power-consequence",
        trace: completeTrace({
          combat: {
            combatIntent: true,
            parserClarificationOnly: true,
          },
        }),
        reasonSnippet: "parser-style clarification",
      },
      {
        invariantId: "world-version-integrity",
        trace: completeTrace({
          worldVersion: {
            settledWorldVersion: 12,
            nextTurnWorldVersion: 11,
          },
        }),
        reasonSnippet: "older world version",
      },
    ];

    for (const testCase of cases) {
      const result = failingResultFor(testCase.trace, testCase.invariantId);
      expect(result.status, testCase.invariantId).toBe("fail");
      expect(result.reason).toContain(testCase.reasonSnippet);
    }
  });

  it("covers every required route family with deterministic pass fixtures", () => {
    const fixtures: Phase94TraceRecord[] = [
      completeTrace({
        routeId: "tourist-courier",
        requiredInvariants: [
          "terminal-artifact-coverage",
          "surface-pressure-provenance",
          "long-turn-no-shortcuts",
          "world-version-integrity",
        ],
      }),
      completeTrace({
        routeId: "jjk-chakra-coin",
        requiredInvariants: [
          "oracle-decision-persistence",
          "narrator-repair-no-turn-rollback",
          "combat-power-consequence",
        ],
      }),
      completeTrace({
        routeId: "false-claim",
        requiredInvariants: [
          "false-claim-truth-boundary",
          "surface-pressure-provenance",
          "hidden-truth-privacy",
        ],
      }),
      completeTrace({
        routeId: "proposal-backlog-world-time",
        requiredInvariants: [
          "proposal-truth-boundary",
          "living-world-terminal-state",
          "world-version-integrity",
        ],
      }),
      completeTrace({
        routeId: "key-npc-faction-discovery",
        requiredInvariants: [
          "living-world-terminal-state",
          "surface-pressure-provenance",
          "hidden-truth-privacy",
        ],
      }),
      completeTrace({
        routeId: "combat-power",
        requiredInvariants: [
          "combat-power-consequence",
          "oracle-decision-persistence",
          "rollback-limit",
        ],
      }),
      completeTrace({
        routeId: "hidden-truth-privacy",
        requiredInvariants: [
          "hidden-truth-privacy",
          "proposal-truth-boundary",
          "terminal-artifact-coverage",
        ],
      }),
      completeTrace({
        routeId: "narrator-repair-prose",
        requiredInvariants: [
          "narrator-repair-no-turn-rollback",
          "long-turn-no-shortcuts",
          "terminal-artifact-coverage",
        ],
      }),
    ];
    const fixtureRouteIds = new Set(fixtures.map((fixture) => fixture.routeId));
    const coveredInvariants = new Set(fixtures.flatMap((fixture) => fixture.requiredInvariants ?? []));

    for (const routeId of PHASE94_ROUTE_IDS) {
      expect(fixtureRouteIds.has(routeId), routeId).toBe(true);
    }
    for (const invariantId of PHASE94_HARD_INVARIANT_IDS) {
      expect(coveredInvariants.has(invariantId), invariantId).toBe(true);
    }
    for (const fixture of fixtures) {
      expect(evaluatePhase94Trace(fixture).every((result) => result.status === "pass"), fixture.routeId).toBe(true);
    }
  });

  it("summarizes failures for later acceptance report input", () => {
    const results = [
      ...evaluatePhase94Trace(completeTrace(), ["terminal-artifact-coverage"]),
      ...evaluatePhase94Trace(
        completeTrace({
          latency: {
            durationCapApplied: true,
          },
        }),
        ["long-turn-no-shortcuts"],
      ),
    ];

    const summary = summarizePhase94InvariantResults(results);

    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.hardFailureCount).toBe(1);
    expect(summary.failures[0]?.invariantId).toBe("long-turn-no-shortcuts");
  });
});
