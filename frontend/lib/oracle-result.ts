export const ORACLE_OUTCOMES = ["strong_hit", "weak_hit", "miss"] as const;

export type OracleOutcome = (typeof ORACLE_OUTCOMES)[number];

export interface OracleResultData {
  outcome: OracleOutcome;
}

const ORACLE_OUTCOME_SET = new Set<string>(ORACLE_OUTCOMES);

export function normalizeOracleResult(value: unknown): OracleResultData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const outcome = (value as Record<string, unknown>).outcome;
  return typeof outcome === "string" && ORACLE_OUTCOME_SET.has(outcome)
    ? { outcome: outcome as OracleOutcome }
    : null;
}

export function formatOracleOutcome(outcome: OracleOutcome): string {
  switch (outcome) {
    case "strong_hit":
      return "Strong Hit";
    case "weak_hit":
      return "Weak Hit";
    case "miss":
      return "Miss";
  }
}
