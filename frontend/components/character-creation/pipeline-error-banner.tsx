"use client";

import { AlertTriangle, RotateCw } from "lucide-react";

import type { IngestionError } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Phase 61 — visible pipeline error banner with stage context + real retry.
 *
 * Replaces the previous "toast.error and leave the form blank" pattern. The
 * backend emits HTTP 502 with `{ error, stage, attempts }` on
 * IngestionPipelineError; `IngestionError` preserves those fields for us.
 *
 * Per feedback_no_fallbacks_v2.md: failed-call state owns the screen until the
 * user dismisses or retries. No silent toast-and-forget.
 */
type IngestionStage = NonNullable<IngestionError["stage"]>;

interface PipelineErrorBannerProps {
  error: string;
  stage?: IngestionStage;
  attempts?: number;
  onRetry: () => void;
  retrying: boolean;
  onDismiss?: () => void;
}

const STAGE_LABELS: Record<IngestionStage, string> = {
  extract: "Source Extraction",
  classify: "Canonical Classification",
  research: "Canon Research",
  synthesize: "Draft Synthesis",
  power_assess: "Power Assessment",
};

export function PipelineErrorBanner({
  error,
  stage,
  attempts,
  onRetry,
  retrying,
  onDismiss,
}: PipelineErrorBannerProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-red-900/40 bg-red-950/20 p-[clamp(12px,1vw,18px)]"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
      <div className="flex flex-col gap-1 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-red-400">
            {stage ? `${STAGE_LABELS[stage]} failed` : "Pipeline failed"}
          </span>
          {typeof attempts === "number" && attempts > 0 && (
            <span className="font-mono text-[10px] text-red-500/70">
              after {attempts} attempt{attempts === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <p className="leading-5 text-zinc-200">{error}</p>
        <div className="mt-1 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={retrying}
            aria-label="Retry last ingestion"
          >
            <RotateCw
              className={
                retrying ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"
              }
              aria-hidden
            />
            {retrying ? "Retrying..." : "Retry"}
          </Button>
          {onDismiss && (
            <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
