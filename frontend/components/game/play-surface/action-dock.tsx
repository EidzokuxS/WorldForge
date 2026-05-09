"use client";

import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { QuickChoice } from "./types";

export interface ActionDockProps {
  value: string;
  onChange: (value: string) => void;
  onSubmitAction: (actionText: string) => void;
  onContinue: () => void;
  disabled?: boolean;
  isBusy: boolean;
  turnPhase?: "idle" | "streaming" | "finalizing";
  quickActions: QuickChoice[];
  className?: string;
}

const MAX_ACTION_LENGTH = 1000;
const WARN_THRESHOLD = 0.8;
const DANGER_THRESHOLD = 0.95;

export function ActionDock({
  value,
  onChange,
  onSubmitAction,
  onContinue,
  disabled = false,
  isBusy,
  turnPhase = isBusy ? "streaming" : "idle",
  quickActions,
  className,
}: ActionDockProps) {
  const trimmedValue = value.trim();
  const controlsDisabled = disabled || isBusy;
  const canSubmit =
    trimmedValue.length > 0 &&
    value.length <= MAX_ACTION_LENGTH &&
    !controlsDisabled;

  const submitCurrentDraft = () => {
    if (!canSubmit) return;
    onSubmitAction(trimmedValue);
  };

  return (
    <section
      data-testid="action-dock"
      className={cn(
        "rounded-[var(--r-l)] border border-white/10 bg-black/82 p-3 text-zinc-100 shadow-[0_18px_60px_rgba(0,0,0,0.42)] backdrop-blur-md",
        className,
      )}
      aria-label="Scene action controls"
    >
      {quickActions.length > 0 ? (
        <div className="mb-3 flex min-w-0 flex-wrap gap-2 border-b border-white/8 pb-3">
          {quickActions.map((choice) => (
            <Button
              key={`${choice.label}-${choice.action}`}
              type="button"
              variant="ghost"
              className="min-h-11 max-w-full whitespace-normal rounded-[var(--r-m)] border border-white/10 bg-zinc-900/70 px-3 text-left text-sm font-semibold leading-5 text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
              disabled={controlsDisabled}
              onClick={() => {
                if (!controlsDisabled) onSubmitAction(choice.action);
              }}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      ) : null}

      <div
        data-testid="action-dock-input-lane"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="relative min-w-0 flex-1">
          <Textarea
            aria-label="Scene action"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitCurrentDraft();
              }
            }}
            placeholder="Describe what you do next..."
            disabled={controlsDisabled}
            maxLength={MAX_ACTION_LENGTH}
            rows={2}
            className="min-h-[80px] resize-none rounded-[var(--r-m)] border-zinc-800/90 bg-zinc-950/80 pr-16 text-base leading-6 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-600 focus-visible:ring-zinc-700/50"
          />
          {value.length > 0 ? (
            <span
              className={cn(
                "absolute bottom-2 right-3 text-xs tabular-nums",
                getCounterColor(value.length),
              )}
            >
              {value.length}/{MAX_ACTION_LENGTH}
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 shrink-0 gap-2 max-sm:w-full max-sm:justify-end">
          <Button
            type="button"
            aria-label="Send action"
            title="Send action"
            size="icon"
            className="h-11 w-11 rounded-[var(--r-m)] border border-[rgba(224,72,28,0.5)] bg-[var(--ember)] text-white hover:bg-[var(--ember-1)]"
            disabled={!canSubmit}
            onClick={submitCurrentDraft}
          >
            {isBusy ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            title="Let the scene breathe without adding a specific action"
            className="min-h-11 rounded-[var(--r-m)] border border-[rgba(224,72,28,0.45)] bg-[var(--ember-paper)] px-4 font-semibold text-orange-100 hover:bg-[rgba(224,72,28,0.14)]"
            disabled={controlsDisabled}
            onClick={onContinue}
          >
            Continue
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {turnPhase === "finalizing" ? (
          <p className="text-xs text-amber-200/85">
            Finalizing turn state.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function getCounterColor(length: number): string {
  const ratio = length / MAX_ACTION_LENGTH;
  if (ratio >= DANGER_THRESHOLD) return "text-red-400";
  if (ratio >= WARN_THRESHOLD) return "text-yellow-300";
  return "text-zinc-500";
}
