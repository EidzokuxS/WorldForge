"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface OracleResultData {
  chance: number;
  roll: number;
  outcome: "strong_hit" | "weak_hit" | "miss";
  reasoning: string;
}

const OUTCOME_STYLES: Record<
  OracleResultData["outcome"],
  { label: string; className: string }
> = {
  strong_hit: {
    label: "Strong Hit",
    className: "bg-green-600/20 text-green-400 border-green-600/40",
  },
  weak_hit: {
    label: "Weak Hit",
    className: "bg-yellow-600/20 text-yellow-400 border-yellow-600/40",
  },
  miss: {
    label: "Miss",
    className: "bg-red-600/20 text-red-400 border-red-600/40",
  },
};

interface OraclePanelProps {
  result: OracleResultData | null;
}

export function OraclePanel({ result }: OraclePanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!result) return null;

  const style = OUTCOME_STYLES[result.outcome];

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="mb-2 rounded-md border bg-muted/50 p-3">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${style.className}`}
            >
              {style.label}
            </span>
            <span className="text-sm text-muted-foreground">
              Chance: {result.chance}% | Roll: {result.roll}
            </span>
          </div>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {isOpen && (
          <p className="mt-2 text-sm text-muted-foreground">{result.reasoning}</p>
        )}
      </div>
    </div>
  );
}
