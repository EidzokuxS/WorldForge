"use client";

import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_ACTION_LENGTH = 1000;
const WARN_THRESHOLD = 0.8;
const DANGER_THRESHOLD = 0.95;

interface ActionBarProps {
  value: string;
  disabled?: boolean;
  isLoading: boolean;
  turnPhase?: "idle" | "streaming" | "finalizing";
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function getCounterColor(length: number): string {
  const ratio = length / MAX_ACTION_LENGTH;
  if (ratio >= DANGER_THRESHOLD) return "text-red-500";
  if (ratio >= WARN_THRESHOLD) return "text-yellow-500";
  return "text-muted-foreground/50";
}

export function ActionBar({
  value,
  disabled = false,
  isLoading,
  turnPhase = isLoading ? "streaming" : "idle",
  onChange,
  onSubmit,
}: ActionBarProps) {
  const trimmedLength = value.trim().length;
  const canSubmit =
    trimmedLength > 0 &&
    value.length <= MAX_ACTION_LENGTH &&
    !disabled &&
    !isLoading;

  return (
    <div className="px-4 pb-4 pt-3 sm:px-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-zinc-500">
            Your action
          </p>
          <p className="text-[11px] text-zinc-500">
            Plain text input. Shift+Enter adds a new line.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="relative flex-1">
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSubmit) {
                  onSubmit();
                }
              }
            }}
            placeholder="Detail your next action..."
            disabled={disabled || isLoading}
            maxLength={MAX_ACTION_LENGTH}
            rows={4}
            className="min-h-[112px] resize-none border-zinc-800/80 bg-zinc-950/80 pr-16 font-sans text-sm leading-6 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-600 focus-visible:ring-zinc-700/50"
          />
          {value.length > 0 && (
            <span
              className={`absolute bottom-2 right-3 text-[10px] tabular-nums ${getCounterColor(value.length)}`}
            >
              {value.length}/{MAX_ACTION_LENGTH}
            </span>
          )}
          </div>
          <Button
            size="icon"
            variant="secondary"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="mb-1 h-11 w-11 shrink-0 rounded-xl border border-zinc-700/80 bg-zinc-100 text-zinc-950 hover:bg-white"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pr-1">
          <p className="text-[11px] text-zinc-500">{'RP markup: "speech", *action*, **emphasis**'}</p>
          {turnPhase === "finalizing" ? (
            <p className="text-[11px] text-amber-200/80">
              The world is still settling. You can act again when the turn is fully resolved.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
