"use client";

import Link from "next/link";
import { Loader2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WORLD_DNA_CARDS, seedValueToTextarea } from "@/components/title/utils";
import { useCampaignNewFlow } from "@/components/campaign-new/flow-provider";
import { collectEnabledSeeds } from "@/components/title/utils";

export function DnaWorkspace() {
  const w = useCampaignNewFlow();
  const hasUsableSeeds = collectEnabledSeeds(w.dnaState) !== undefined;
  const activeProgressLabel = w.generationProgress?.label ?? (w.isSuggesting ? "Generating World DNA suggestions..." : null);
  const activeProgressStep =
    w.generationProgress && w.generationProgress.totalSteps > 0
      ? `Step ${w.generationProgress.step + 1} of ${w.generationProgress.totalSteps}`
      : null;
  const activeSubLabel =
    w.generationProgress?.subStep !== undefined && w.generationProgress?.subTotal !== undefined
      ? `${w.generationProgress.subLabel ?? ""} (${w.generationProgress.subStep + 1}/${w.generationProgress.subTotal})`
      : null;
  const createLabel = w.isGenerating
    ? "Generating World..."
    : w.creatingCampaign
      ? "Creating Campaign..."
      : "Create World";

  return (
    <div className="flex flex-1 flex-col">
      {/* Loading state when DNA not ready */}
      {w.isSuggesting && !w.dnaState ? (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating World DNA suggestions...
        </div>
      ) : w.dnaState ? (
        /* DNA grid: 2 columns, border dividers */
        <div className="grid flex-1" style={{ gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          {WORLD_DNA_CARDS.map((item, index) => {
            const slot = w.dnaState![item.category];
            const isRightColumn = index % 2 === 1;
            const isLastRow = index >= WORLD_DNA_CARDS.length - 2;

            return (
              <div
                key={item.category}
                className={`${!isLastRow ? "border-b border-white/[0.06]" : ""} ${!isRightColumn ? "border-r border-white/[0.06]" : ""}`}
                style={{ padding: "clamp(14px, 1.2vw, 24px) clamp(16px, 1.4vw, 28px)" }}
              >
                {/* Header: category label + re-roll + toggle */}
                <div className="flex items-center justify-between" style={{ marginBottom: "clamp(6px, 0.5vw, 12px)" }}>
                  <span
                    className="font-semibold uppercase tracking-[0.08em] text-zinc-400"
                    style={{ fontSize: "clamp(12px, 0.85vw, 15px)" }}
                  >
                    {item.label}
                  </span>
                  <div className="flex items-center" style={{ gap: "clamp(4px, 0.3vw, 8px)" }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void w.handleResuggestCategory(item.category)}
                      disabled={!slot.enabled || w.isBusy || w.suggestingCategory === item.category}
                    >
                      {w.suggestingCategory === item.category ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Re-roll"
                      )}
                    </Button>
                    {/* Small toggle */}
                    <button
                      type="button"
                      className="relative shrink-0 cursor-pointer rounded-[9px] transition-colors"
                      style={{
                        width: "clamp(28px, 1.8vw, 34px)",
                        height: "clamp(16px, 1vw, 18px)",
                        background: slot.enabled ? "#e63e00" : "#52525b",
                      }}
                      onClick={() => w.handleSeedToggle(item.category, !slot.enabled)}
                    >
                      <span
                        className="absolute rounded-full bg-white transition-transform"
                        style={{
                          width: "clamp(12px, 0.8vw, 14px)",
                          height: "clamp(12px, 0.8vw, 14px)",
                          top: "2px",
                          left: "2px",
                          transform: slot.enabled ? "translateX(clamp(12px, 0.8vw, 16px))" : "none",
                        }}
                      />
                    </button>
                  </div>
                </div>

                {/* Transparent textarea */}
                <textarea
                  className="w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.04] text-zinc-200 outline-none focus:border-white/[0.15] placeholder:text-zinc-600"
                  style={{
                    fontFamily: "var(--font-sans, Inter, -apple-system, sans-serif)",
                    fontSize: "clamp(14px, 0.95vw, 17px)",
                    lineHeight: 1.6,
                    padding: "clamp(8px, 0.6vw, 12px)",
                    minHeight: "auto",
                    height: "auto",
                  }}
                  rows={4}
                  value={seedValueToTextarea(slot.value)}
                  onChange={(event) => w.handleSeedTextChange(item.category, event.target.value)}
                  disabled={!slot.enabled}
                />
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty state: no DNA prepared */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-sm text-zinc-500">
          <p className="font-medium text-zinc-100">
            World DNA has not been prepared yet.
          </p>
          <p>Go back to concept, continue into DNA, or start with manual seeds.</p>
          <Button variant="outline" onClick={() => w.handlePrepareManualDna()}>
            Start With Manual DNA
          </Button>
        </div>
      )}

      {/* Warning: no enabled seeds */}
      {w.dnaState && !hasUsableSeeds && !w.isBusy ? (
        <div className="border-t border-dashed border-white/[0.06] px-4 py-3 text-sm text-zinc-500">
          Add at least one enabled DNA seed before generating the world.
        </div>
      ) : null}

      {/* Footer bar */}
      <div className="mt-auto flex shrink-0 items-center justify-between border-t border-white/[0.06]" style={{ padding: "clamp(12px, 1vw, 20px) 0" }}>
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost">
            <Link href="/campaign/new">Back to Concept</Link>
          </Button>
          {activeProgressLabel ? (
            <span className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {activeProgressLabel}
              {activeProgressStep ? <span>{activeProgressStep}</span> : null}
              {activeSubLabel ? (
                <span className="text-xs text-zinc-600">{activeSubLabel}</span>
              ) : null}
            </span>
          ) : null}
          {w.generationError ? (
            <pre className="max-h-24 max-w-[60vw] overflow-auto whitespace-pre-wrap rounded border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-400 select-all">
              {w.generationError}
            </pre>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void w.handleResuggestAll()} disabled={w.isBusy || !w.dnaState}>
            {w.isSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Re-roll All
          </Button>
          <Button onClick={() => void w.handleCreateWithDna()} disabled={w.isBusy || !w.dnaState || !hasUsableSeeds}>
            {(w.creatingCampaign || w.isGenerating) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {createLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
