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
    <div className="border-t border-border bg-card/90 px-4 py-3 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-start gap-2">
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
            placeholder="Describe your action..."
            disabled={disabled || isLoading}
            maxLength={MAX_ACTION_LENGTH}
            rows={1}
            className="min-h-10 resize-none font-serif italic pr-16"
          />
          {turnPhase === "finalizing" ? (
            <p className="mt-2 pr-16 text-xs italic text-muted-foreground">
              The world is still settling. You can act again when the turn is fully resolved.
            </p>
          ) : null}
          {value.length > 0 && (
            <span
              className={`absolute bottom-1.5 right-2 text-[10px] tabular-nums ${getCounterColor(value.length)}`}
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
          className="mt-0.5"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
