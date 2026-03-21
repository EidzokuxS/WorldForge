"use client";

import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ActionBarProps {
  value: string;
  disabled?: boolean;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function ActionBar({
  value,
  disabled = false,
  isLoading,
  onChange,
  onSubmit,
}: ActionBarProps) {
  const canSubmit = value.trim().length > 0 && !disabled && !isLoading;

  return (
    <div className="border-t border-border bg-card/90 px-4 py-3 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <Input
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
          className="flex-1 font-serif italic"
        />
        <Button
          size="icon"
          variant="secondary"
          onClick={onSubmit}
          disabled={!canSubmit}
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
