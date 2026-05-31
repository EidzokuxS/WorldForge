"use client";

import type { OracleResultData } from "@/lib/oracle-result";
import { formatOracleOutcome } from "@/lib/oracle-result";

export type { OracleResultData } from "@/lib/oracle-result";

const OUTCOME_STYLES: Record<
  OracleResultData["outcome"],
  { className: string }
> = {
  strong_hit: {
    className: "bg-green-600/20 text-green-400 border-green-600/40",
  },
  weak_hit: {
    className: "bg-yellow-600/20 text-yellow-400 border-yellow-600/40",
  },
  miss: {
    className: "bg-red-600/20 text-red-400 border-red-600/40",
  },
};

interface OraclePanelProps {
  result: OracleResultData | null;
}

export function OraclePanel({ result }: OraclePanelProps) {
  if (!result) return null;

  const style = OUTCOME_STYLES[result.outcome];
  const label = formatOracleOutcome(result.outcome);

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="mb-2 rounded-md border bg-muted/50 p-3">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${style.className}`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
