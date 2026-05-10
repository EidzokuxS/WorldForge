export const PHASE94_ROUTE_IDS = [
  "tourist-courier",
  "jjk-chakra-coin",
  "false-claim",
  "proposal-backlog-world-time",
  "key-npc-faction-discovery",
  "combat-power",
  "hidden-truth-privacy",
  "narrator-repair-prose",
] as const;

export type Phase94RouteId = (typeof PHASE94_ROUTE_IDS)[number];

export type Phase94HardInvariantId =
  | "narrator-repair-no-turn-rollback"
  | "oracle-decision-persistence"
  | "proposal-truth-boundary"
  | "surface-pressure-provenance"
  | "hidden-truth-privacy"
  | "false-claim-truth-boundary"
  | "rollback-limit"
  | "long-turn-no-shortcuts"
  | "terminal-artifact-coverage"
  | "living-world-terminal-state"
  | "combat-power-consequence"
  | "world-version-integrity";

export type Phase94InvariantSeverity = "P0" | "P1";
export type Phase94InvariantStatus = "pass" | "fail";

export interface Phase94HardInvariantDefinition {
  id: Phase94HardInvariantId;
  severity: Phase94InvariantSeverity;
  description: string;
}

export const PHASE94_HARD_INVARIANTS: readonly Phase94HardInvariantDefinition[] = [
  {
    id: "narrator-repair-no-turn-rollback",
    severity: "P0",
    description: "Narrator repair preserves valid GM/Oracle/tool resolution and does not roll back the whole turn.",
  },
  {
    id: "oracle-decision-persistence",
    severity: "P0",
    description: "Accepted Oracle decisions stay linked through narrator repair and final reporting.",
  },
  {
    id: "proposal-truth-boundary",
    severity: "P0",
    description: "Uncommitted proposals do not appear as SceneFrame or NarratorPacket truth.",
  },
  {
    id: "surface-pressure-provenance",
    severity: "P1",
    description: "Player-visible pressure has event, fact, thread, or surface-signal provenance.",
  },
  {
    id: "hidden-truth-privacy",
    severity: "P0",
    description: "Private names, hidden facts, offscreen causes, and unresolved proposals do not leak.",
  },
  {
    id: "false-claim-truth-boundary",
    severity: "P0",
    description: "Unsupported authority/item/pass claims become claims, beliefs, proof pressure, or failed attempts, not truth.",
  },
  {
    id: "rollback-limit",
    severity: "P0",
    description: "Rollback is limited to state corruption, stale world version, or failed atomic mutation boundaries.",
  },
  {
    id: "long-turn-no-shortcuts",
    severity: "P0",
    description: "Acceptance does not pass through duration caps, output clipping, fake success, or skipped mechanics.",
  },
  {
    id: "terminal-artifact-coverage",
    severity: "P0",
    description: "Route evidence has terminal closeout plus raw SSE, trace, and full turn artifacts.",
  },
  {
    id: "living-world-terminal-state",
    severity: "P1",
    description: "Due proposals/jobs reach committed or explicit terminal states and relevant consequences surface.",
  },
  {
    id: "combat-power-consequence",
    severity: "P1",
    description: "Combat/power turns produce tracked consequences or explicit no-combat state without parser collapse.",
  },
  {
    id: "world-version-integrity",
    severity: "P0",
    description: "Next-turn state observes the settled world version and rejects stale accepted versions.",
  },
] as const;

export const PHASE94_HARD_INVARIANT_IDS = PHASE94_HARD_INVARIANTS.map(
  (invariant) => invariant.id,
);

export interface Phase94TraceRecord {
  routeId: Phase94RouteId | string;
  turnId: string;
  requiredInvariants?: readonly Phase94HardInvariantId[];
  terminal?: {
    eventType?: "done" | "recoverable_error" | "failed";
    routeClosed?: boolean;
    fakeNoOpSuccess?: boolean;
    skippedMechanics?: boolean;
    evidenceIds?: readonly string[];
  };
  artifacts?: {
    rawSseIds?: readonly string[];
    fullTurnArtifactIds?: readonly string[];
    traceArtifactIds?: readonly string[];
    screenshotIds?: readonly string[];
    evidenceIds?: readonly string[];
  };
  narratorRepair?: {
    unsupportedConcreteClaim?: boolean;
    attempted?: boolean;
    status?: "not_needed" | "succeeded" | "failed";
    rolledBackTurn?: boolean;
    preservedResolutionEvidenceIds?: readonly string[];
    evidenceIds?: readonly string[];
  };
  oracle?: {
    required?: boolean;
    acceptedDecisionId?: string;
    finalReportDecisionId?: string;
    linkedTurnId?: string;
    evidenceIds?: readonly string[];
  };
  proposals?: {
    sceneTruthProposalIds?: readonly string[];
    narratorTruthProposalIds?: readonly string[];
    exposedUncommittedProposalIds?: readonly string[];
    terminalProposalIds?: readonly string[];
    committedProposalIds?: readonly string[];
    evidenceIds?: readonly string[];
  };
  pressure?: {
    visible?: boolean;
    sourceEventIds?: readonly string[];
    sourceFactIds?: readonly string[];
    sourceThreadIds?: readonly string[];
    sourceSignalIds?: readonly string[];
    evidenceIds?: readonly string[];
  };
  privacy?: {
    hiddenTerms?: readonly string[];
    playerFacingText?: string;
    packetText?: string;
    leakedTerms?: readonly string[];
    evidenceIds?: readonly string[];
  };
  falseClaim?: {
    playerClaimedAuthority?: boolean;
    createdTruthIds?: readonly string[];
    claimEvidenceIds?: readonly string[];
    beliefIds?: readonly string[];
    proofPressureIds?: readonly string[];
    failedAttemptIds?: readonly string[];
    evidenceIds?: readonly string[];
  };
  rollback?: {
    occurred?: boolean;
    reason?: string;
    evidenceIds?: readonly string[];
  };
  latency?: {
    didClipModelOutput?: boolean;
    durationCapApplied?: boolean;
    timeoutAbortApplied?: boolean;
    fakeSuccess?: boolean;
    evidenceIds?: readonly string[];
  };
  livingWorld?: {
    dueProposalIds?: readonly string[];
    terminalProposalIds?: readonly string[];
    committedProposalIds?: readonly string[];
    keyActorProgressRequired?: boolean;
    factionConsequenceRequired?: boolean;
    keyActorProgressIds?: readonly string[];
    factionConsequenceIds?: readonly string[];
    surfaceSignalIds?: readonly string[];
    staleJobIds?: readonly string[];
    evidenceIds?: readonly string[];
  };
  combat?: {
    combatIntent?: boolean;
    consequenceIds?: readonly string[];
    explicitNoCombatEvidenceIds?: readonly string[];
    parserClarificationOnly?: boolean;
    evidenceIds?: readonly string[];
  };
  worldVersion?: {
    settledWorldVersion?: number;
    nextTurnWorldVersion?: number;
    staleVersionAccepted?: boolean;
    evidenceIds?: readonly string[];
  };
}

export interface Phase94InvariantResult {
  invariantId: Phase94HardInvariantId;
  routeId: string;
  turnId: string;
  status: Phase94InvariantStatus;
  severity: Phase94InvariantSeverity;
  reason: string;
  evidenceIds: string[];
}

export interface Phase94InvariantSummary {
  total: number;
  passed: number;
  failed: number;
  hardFailureCount: number;
  failures: Phase94InvariantResult[];
}

const ALLOWED_ROLLBACK_REASONS = new Set([
  "state_corruption",
  "stale_world_version",
  "atomic_mutation_failed",
]);

function invariantSeverity(id: Phase94HardInvariantId): Phase94InvariantSeverity {
  return PHASE94_HARD_INVARIANTS.find((invariant) => invariant.id === id)?.severity ?? "P0";
}

function uniqueNonEmpty(values: readonly (string | undefined | null)[]): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function collectEvidence(...groups: Array<readonly string[] | undefined>): string[] {
  return uniqueNonEmpty(groups.flatMap((group) => [...(group ?? [])]));
}

function hasAny(values: readonly string[] | undefined): boolean {
  return uniqueNonEmpty(values ?? []).length > 0;
}

function pass(
  trace: Phase94TraceRecord,
  invariantId: Phase94HardInvariantId,
  reason: string,
  evidenceIds: string[] = [],
): Phase94InvariantResult {
  return {
    invariantId,
    routeId: trace.routeId,
    turnId: trace.turnId,
    status: "pass",
    severity: invariantSeverity(invariantId),
    reason,
    evidenceIds,
  };
}

function fail(
  trace: Phase94TraceRecord,
  invariantId: Phase94HardInvariantId,
  reason: string,
  evidenceIds: string[] = [],
): Phase94InvariantResult {
  return {
    invariantId,
    routeId: trace.routeId,
    turnId: trace.turnId,
    status: "fail",
    severity: invariantSeverity(invariantId),
    reason,
    evidenceIds,
  };
}

function checkNarratorRepairNoTurnRollback(trace: Phase94TraceRecord): Phase94InvariantResult {
  const repair = trace.narratorRepair;
  const id: Phase94HardInvariantId = "narrator-repair-no-turn-rollback";
  if (!repair) {
    return fail(trace, id, "Missing narrator repair evidence.");
  }
  if (repair.unsupportedConcreteClaim && !repair.attempted) {
    return fail(trace, id, "Unsupported concrete narration claim did not enter narrator repair.", collectEvidence(repair.evidenceIds));
  }
  if (repair.rolledBackTurn) {
    return fail(trace, id, "Narrator repair rolled back valid turn resolution.", collectEvidence(repair.evidenceIds));
  }
  if (repair.status === "failed") {
    return fail(trace, id, "Narrator repair failed without preserving pending resolved turn state.", collectEvidence(repair.evidenceIds));
  }
  if (!hasAny(repair.preservedResolutionEvidenceIds)) {
    return fail(trace, id, "Narrator repair evidence does not link to preserved settled resolution.");
  }
  return pass(
    trace,
    id,
    "Narrator repair preserves settled resolution without full-turn rollback.",
    collectEvidence(repair.evidenceIds, repair.preservedResolutionEvidenceIds),
  );
}

function checkOracleDecisionPersistence(trace: Phase94TraceRecord): Phase94InvariantResult {
  const oracle = trace.oracle;
  const id: Phase94HardInvariantId = "oracle-decision-persistence";
  if (!oracle) {
    return fail(trace, id, "Missing Oracle decision evidence.");
  }
  if (oracle.required === false) {
    return pass(trace, id, "Oracle decision was not required for this trace.", collectEvidence(oracle.evidenceIds));
  }
  if (!oracle.acceptedDecisionId || !oracle.finalReportDecisionId) {
    return fail(trace, id, "Accepted Oracle decision or final report decision id is missing.", collectEvidence(oracle.evidenceIds));
  }
  if (oracle.acceptedDecisionId !== oracle.finalReportDecisionId) {
    return fail(trace, id, "Final report lost or replaced the accepted Oracle decision.", collectEvidence(oracle.evidenceIds));
  }
  if (oracle.linkedTurnId !== trace.turnId) {
    return fail(trace, id, "Oracle decision is not linked to the evaluated turn.", collectEvidence(oracle.evidenceIds));
  }
  return pass(trace, id, "Accepted Oracle decision remains linked through final report.", collectEvidence(oracle.evidenceIds, [oracle.acceptedDecisionId]));
}

function checkProposalTruthBoundary(trace: Phase94TraceRecord): Phase94InvariantResult {
  const proposals = trace.proposals;
  const id: Phase94HardInvariantId = "proposal-truth-boundary";
  if (!proposals) {
    return fail(trace, id, "Missing proposal truth-boundary evidence.");
  }
  const terminal = new Set(collectEvidence(proposals.terminalProposalIds, proposals.committedProposalIds));
  const exposed = collectEvidence(
    proposals.sceneTruthProposalIds,
    proposals.narratorTruthProposalIds,
    proposals.exposedUncommittedProposalIds,
  );
  const uncommitted = exposed.filter((proposalId) => !terminal.has(proposalId));
  if (uncommitted.length > 0) {
    return fail(
      trace,
      id,
      `Uncommitted proposals exposed as truth: ${uncommitted.join(", ")}.`,
      collectEvidence(proposals.evidenceIds, uncommitted),
    );
  }
  return pass(trace, id, "Scene and narrator truth reference only committed or terminal proposal evidence.", collectEvidence(proposals.evidenceIds, exposed));
}

function checkSurfacePressureProvenance(trace: Phase94TraceRecord): Phase94InvariantResult {
  const pressure = trace.pressure;
  const id: Phase94HardInvariantId = "surface-pressure-provenance";
  if (!pressure) {
    return fail(trace, id, "Missing player-visible pressure provenance evidence.");
  }
  if (pressure.visible === false) {
    return pass(trace, id, "No player-visible pressure was surfaced in this trace.", collectEvidence(pressure.evidenceIds));
  }
  const sourceIds = collectEvidence(
    pressure.sourceEventIds,
    pressure.sourceFactIds,
    pressure.sourceThreadIds,
    pressure.sourceSignalIds,
  );
  if (sourceIds.length === 0) {
    return fail(trace, id, "Player-visible pressure has no event, fact, thread, or surface-signal source.", collectEvidence(pressure.evidenceIds));
  }
  return pass(trace, id, "Player-visible pressure is source-backed.", collectEvidence(pressure.evidenceIds, sourceIds));
}

function checkHiddenTruthPrivacy(trace: Phase94TraceRecord): Phase94InvariantResult {
  const privacy = trace.privacy;
  const id: Phase94HardInvariantId = "hidden-truth-privacy";
  if (!privacy) {
    return fail(trace, id, "Missing hidden-truth privacy evidence.");
  }
  const directLeaks = uniqueNonEmpty(privacy.leakedTerms ?? []);
  if (directLeaks.length > 0) {
    return fail(trace, id, `Privacy evidence reports leaked terms: ${directLeaks.join(", ")}.`, collectEvidence(privacy.evidenceIds, directLeaks));
  }
  const visibleText = `${privacy.playerFacingText ?? ""}\n${privacy.packetText ?? ""}`.toLocaleLowerCase();
  const textLeaks = uniqueNonEmpty(privacy.hiddenTerms ?? []).filter((term) => visibleText.includes(term.toLocaleLowerCase()));
  if (textLeaks.length > 0) {
    return fail(trace, id, `Player-facing artifacts contain hidden terms: ${textLeaks.join(", ")}.`, collectEvidence(privacy.evidenceIds, textLeaks));
  }
  return pass(trace, id, "Player-facing artifacts omit configured hidden/private terms.", collectEvidence(privacy.evidenceIds));
}

function checkFalseClaimTruthBoundary(trace: Phase94TraceRecord): Phase94InvariantResult {
  const claim = trace.falseClaim;
  const id: Phase94HardInvariantId = "false-claim-truth-boundary";
  if (!claim) {
    return fail(trace, id, "Missing false-claim truth-boundary evidence.");
  }
  if (claim.playerClaimedAuthority === false) {
    return pass(trace, id, "No unsupported authority/item/pass claim was made in this trace.", collectEvidence(claim.evidenceIds));
  }
  if (hasAny(claim.createdTruthIds)) {
    return fail(trace, id, "Unsupported player claim created direct world truth.", collectEvidence(claim.evidenceIds, claim.createdTruthIds));
  }
  const safeEvidence = collectEvidence(
    claim.claimEvidenceIds,
    claim.beliefIds,
    claim.proofPressureIds,
    claim.failedAttemptIds,
  );
  if (safeEvidence.length === 0) {
    return fail(trace, id, "Unsupported player claim did not create claim, belief, proof-pressure, or failed-attempt evidence.", collectEvidence(claim.evidenceIds));
  }
  return pass(trace, id, "Unsupported player claim stayed in claim/belief/proof-pressure evidence.", collectEvidence(claim.evidenceIds, safeEvidence));
}

function checkRollbackLimit(trace: Phase94TraceRecord): Phase94InvariantResult {
  const rollback = trace.rollback;
  const id: Phase94HardInvariantId = "rollback-limit";
  if (!rollback) {
    return fail(trace, id, "Missing rollback boundary evidence.");
  }
  if (!rollback.occurred) {
    return pass(trace, id, "No rollback occurred.", collectEvidence(rollback.evidenceIds));
  }
  if (!rollback.reason || !ALLOWED_ROLLBACK_REASONS.has(rollback.reason)) {
    return fail(trace, id, `Rollback used unsupported reason: ${rollback.reason ?? "missing"}.`, collectEvidence(rollback.evidenceIds));
  }
  return pass(trace, id, "Rollback reason is within the accepted deterministic boundary.", collectEvidence(rollback.evidenceIds, [rollback.reason]));
}

function checkLongTurnNoShortcuts(trace: Phase94TraceRecord): Phase94InvariantResult {
  const latency = trace.latency;
  const terminal = trace.terminal;
  const id: Phase94HardInvariantId = "long-turn-no-shortcuts";
  if (!latency) {
    return fail(trace, id, "Missing long-turn honesty evidence.");
  }
  const shortcuts = [
    latency.didClipModelOutput ? "model_output_clipped" : undefined,
    latency.durationCapApplied ? "duration_cap_applied" : undefined,
    latency.timeoutAbortApplied ? "timeout_abort_applied" : undefined,
    latency.fakeSuccess ? "latency_fake_success" : undefined,
    terminal?.fakeNoOpSuccess ? "terminal_fake_noop_success" : undefined,
    terminal?.skippedMechanics ? "terminal_skipped_mechanics" : undefined,
  ];
  const detected = uniqueNonEmpty(shortcuts);
  if (detected.length > 0) {
    return fail(trace, id, `Acceptance shortcut detected: ${detected.join(", ")}.`, collectEvidence(latency.evidenceIds, terminal?.evidenceIds, detected));
  }
  return pass(trace, id, "Trace did not use clipping, duration caps, fake success, or skipped mechanics.", collectEvidence(latency.evidenceIds, terminal?.evidenceIds));
}

function checkTerminalArtifactCoverage(trace: Phase94TraceRecord): Phase94InvariantResult {
  const terminal = trace.terminal;
  const artifacts = trace.artifacts;
  const id: Phase94HardInvariantId = "terminal-artifact-coverage";
  if (!terminal || terminal.eventType !== "done" || terminal.routeClosed !== true) {
    return fail(trace, id, "Route is missing terminal done closeout evidence.", collectEvidence(terminal?.evidenceIds, artifacts?.evidenceIds));
  }
  const missing = [
    hasAny(artifacts?.rawSseIds) ? undefined : "raw_sse",
    hasAny(artifacts?.fullTurnArtifactIds) ? undefined : "full_turn_artifact",
    hasAny(artifacts?.traceArtifactIds) ? undefined : "trace_artifact",
  ];
  const missingArtifacts = uniqueNonEmpty(missing);
  if (missingArtifacts.length > 0) {
    return fail(trace, id, `Route terminal evidence is missing: ${missingArtifacts.join(", ")}.`, collectEvidence(terminal.evidenceIds, artifacts?.evidenceIds));
  }
  return pass(
    trace,
    id,
    "Route terminal closeout includes raw SSE, full turn, and trace artifacts.",
    collectEvidence(terminal.evidenceIds, artifacts?.evidenceIds, artifacts?.rawSseIds, artifacts?.fullTurnArtifactIds, artifacts?.traceArtifactIds),
  );
}

function checkLivingWorldTerminalState(trace: Phase94TraceRecord): Phase94InvariantResult {
  const livingWorld = trace.livingWorld;
  const id: Phase94HardInvariantId = "living-world-terminal-state";
  if (!livingWorld) {
    return fail(trace, id, "Missing living-world terminal-state evidence.");
  }
  if (hasAny(livingWorld.staleJobIds)) {
    return fail(trace, id, "Living-world evidence contains stale due jobs.", collectEvidence(livingWorld.evidenceIds, livingWorld.staleJobIds));
  }
  const terminal = new Set(collectEvidence(livingWorld.terminalProposalIds, livingWorld.committedProposalIds));
  const nonTerminal = collectEvidence(livingWorld.dueProposalIds).filter((proposalId) => !terminal.has(proposalId));
  if (nonTerminal.length > 0) {
    return fail(trace, id, `Due proposals lack terminal state: ${nonTerminal.join(", ")}.`, collectEvidence(livingWorld.evidenceIds, nonTerminal));
  }
  if (livingWorld.keyActorProgressRequired && !hasAny(livingWorld.keyActorProgressIds)) {
    return fail(trace, id, "Key actor progress was required but no progress evidence was recorded.", collectEvidence(livingWorld.evidenceIds));
  }
  if (livingWorld.factionConsequenceRequired && !hasAny(livingWorld.factionConsequenceIds)) {
    return fail(trace, id, "Faction consequence was required but no consequence evidence was recorded.", collectEvidence(livingWorld.evidenceIds));
  }
  if ((livingWorld.keyActorProgressRequired || livingWorld.factionConsequenceRequired) && !hasAny(livingWorld.surfaceSignalIds)) {
    return fail(trace, id, "Relevant key actor/faction consequence has no discoverable surface signal.", collectEvidence(livingWorld.evidenceIds));
  }
  return pass(
    trace,
    id,
    "Due living-world work reached terminal state and relevant consequences have surface evidence.",
    collectEvidence(
      livingWorld.evidenceIds,
      livingWorld.terminalProposalIds,
      livingWorld.committedProposalIds,
      livingWorld.keyActorProgressIds,
      livingWorld.factionConsequenceIds,
      livingWorld.surfaceSignalIds,
    ),
  );
}

function checkCombatPowerConsequence(trace: Phase94TraceRecord): Phase94InvariantResult {
  const combat = trace.combat;
  const id: Phase94HardInvariantId = "combat-power-consequence";
  if (!combat) {
    return fail(trace, id, "Missing combat/power consequence evidence.");
  }
  if (combat.parserClarificationOnly) {
    return fail(trace, id, "Combat/power turn collapsed into parser-style clarification only.", collectEvidence(combat.evidenceIds));
  }
  if (combat.combatIntent && !hasAny(combat.consequenceIds) && !hasAny(combat.explicitNoCombatEvidenceIds)) {
    return fail(trace, id, "Combat/power intent has neither tracked consequence nor explicit no-combat evidence.", collectEvidence(combat.evidenceIds));
  }
  return pass(trace, id, "Combat/power trace has consequence evidence or explicit no-combat state.", collectEvidence(combat.evidenceIds, combat.consequenceIds, combat.explicitNoCombatEvidenceIds));
}

function checkWorldVersionIntegrity(trace: Phase94TraceRecord): Phase94InvariantResult {
  const worldVersion = trace.worldVersion;
  const id: Phase94HardInvariantId = "world-version-integrity";
  if (!worldVersion) {
    return fail(trace, id, "Missing next-turn world version evidence.");
  }
  if (worldVersion.staleVersionAccepted) {
    return fail(trace, id, "Trace accepted a stale world version.", collectEvidence(worldVersion.evidenceIds));
  }
  if (
    typeof worldVersion.settledWorldVersion !== "number"
    || typeof worldVersion.nextTurnWorldVersion !== "number"
  ) {
    return fail(trace, id, "Settled or next-turn world version is missing.", collectEvidence(worldVersion.evidenceIds));
  }
  if (worldVersion.nextTurnWorldVersion < worldVersion.settledWorldVersion) {
    return fail(trace, id, "Next turn observes an older world version than the settled turn.", collectEvidence(worldVersion.evidenceIds));
  }
  return pass(trace, id, "Next turn observes the settled world version boundary.", collectEvidence(worldVersion.evidenceIds));
}

export function evaluatePhase94Invariant(
  trace: Phase94TraceRecord,
  invariantId: Phase94HardInvariantId,
): Phase94InvariantResult {
  switch (invariantId) {
    case "narrator-repair-no-turn-rollback":
      return checkNarratorRepairNoTurnRollback(trace);
    case "oracle-decision-persistence":
      return checkOracleDecisionPersistence(trace);
    case "proposal-truth-boundary":
      return checkProposalTruthBoundary(trace);
    case "surface-pressure-provenance":
      return checkSurfacePressureProvenance(trace);
    case "hidden-truth-privacy":
      return checkHiddenTruthPrivacy(trace);
    case "false-claim-truth-boundary":
      return checkFalseClaimTruthBoundary(trace);
    case "rollback-limit":
      return checkRollbackLimit(trace);
    case "long-turn-no-shortcuts":
      return checkLongTurnNoShortcuts(trace);
    case "terminal-artifact-coverage":
      return checkTerminalArtifactCoverage(trace);
    case "living-world-terminal-state":
      return checkLivingWorldTerminalState(trace);
    case "combat-power-consequence":
      return checkCombatPowerConsequence(trace);
    case "world-version-integrity":
      return checkWorldVersionIntegrity(trace);
  }
}

export function evaluatePhase94Trace(
  trace: Phase94TraceRecord,
  invariantIds: readonly Phase94HardInvariantId[] = trace.requiredInvariants ?? PHASE94_HARD_INVARIANT_IDS,
): Phase94InvariantResult[] {
  return invariantIds.map((invariantId) => evaluatePhase94Invariant(trace, invariantId));
}

export function summarizePhase94InvariantResults(
  results: readonly Phase94InvariantResult[],
): Phase94InvariantSummary {
  const failures = results.filter((result) => result.status === "fail");
  return {
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    hardFailureCount: failures.filter((failure) => failure.severity === "P0").length,
    failures,
  };
}
