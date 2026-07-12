import {
  CAMPAIGN_PLAY_EVIDENCE_VERSION,
  CAMPAIGN_PLAY_HARD_FAILURE_KEYS,
  campaignPlayScorecardSchema,
  type CampaignPlayScorecard,
} from "./contracts.js";

export interface CampaignPlayPromotionMeasurements {
  runId: string;
  lane: CampaignPlayScorecard["lane"];
  completedPlayerActions: number;
  expectedPlayerActions: number;
  receiptBearingMutations: number;
  mechanicalMutations: number;
  runtimeEvents: number;
  runtimeRevisions: number;
  turnOwnedRuntimeEvents: number;
  turnOwnedRuntimeMutations: number;
  hardFailures?: Partial<CampaignPlayScorecard["hardFailures"]>;
  findings?: CampaignPlayScorecard["findings"];
}

function coverage(covered: number, total: number): number {
  if (!Number.isSafeInteger(covered) || covered < 0 || !Number.isSafeInteger(total) || total < 0) {
    throw new Error("Campaign Play promotion measurements must be nonnegative safe integers.");
  }
  if (covered > total) {
    throw new Error("Campaign Play promotion coverage cannot exceed its measured total.");
  }
  return total === 0 ? 1 : covered / total;
}

export function createCampaignPlayScorecard(
  measurements: CampaignPlayPromotionMeasurements,
): CampaignPlayScorecard {
  const hardFailures = Object.fromEntries(
    CAMPAIGN_PLAY_HARD_FAILURE_KEYS.map((key) => [key, measurements.hardFailures?.[key] ?? 0]),
  ) as CampaignPlayScorecard["hardFailures"];
  const receiptCoverage = coverage(
    measurements.receiptBearingMutations,
    measurements.mechanicalMutations,
  );
  const runtimeEventCoverage = coverage(
    measurements.runtimeEvents,
    measurements.runtimeRevisions,
  );
  const turnEventCoverage = coverage(
    measurements.turnOwnedRuntimeEvents,
    measurements.turnOwnedRuntimeMutations,
  );
  if (receiptCoverage < 1) hardFailures.receiptCoverageGap += 1;
  if (runtimeEventCoverage < 1) hardFailures.runtimeEventGap += 1;
  if (turnEventCoverage < 1) hardFailures.turnEventGap += 1;
  const findings = measurements.findings ?? [];
  const hardFailureTotal = CAMPAIGN_PLAY_HARD_FAILURE_KEYS.reduce(
    (total, key) => total + hardFailures[key],
    0,
  );
  return campaignPlayScorecardSchema.parse({
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: measurements.runId,
    lane: measurements.lane,
    completedPlayerActions: measurements.completedPlayerActions,
    expectedPlayerActions: measurements.expectedPlayerActions,
    receiptCoverage,
    runtimeEventCoverage,
    turnEventCoverage,
    hardFailures,
    promotionEligible: hardFailureTotal === 0
      && measurements.completedPlayerActions === measurements.expectedPlayerActions
      && findings.length === 0,
    findings,
  });
}
