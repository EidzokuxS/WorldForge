"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Phase 61 — shared "override instructions" textarea.
 *
 * Threads the user's free-text override into the ingestion pipeline (priority 1
 * in the synthesizer prompt: user override > card > research > LLM inference).
 * The backend Zod schema caps this at 2000 characters, so we enforce the same
 * limit client-side with a visible counter.
 *
 * Controlled component — owner keeps state so the value persists across mode
 * switches (describe / generate / research / import).
 */
interface OverrideTextFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Compact variant for the existing-draft recreate strip (rows=2). */
  compact?: boolean;
}

const FIELD_ID = "character-override-text";
const MAX_LENGTH = 2000;

export function OverrideTextField({ value, onChange, disabled, compact }: OverrideTextFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={FIELD_ID}
        className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500"
      >
        Override Instructions — Optional
      </Label>
      <p className="text-[clamp(11px,0.8vw,13px)] text-zinc-600">
        Free-text corrections that win over everything else. Examples: &ldquo;her eyes are red not blue&rdquo;,
        &ldquo;she is weaker than canon&rdquo;, &ldquo;speaks in archaic English&rdquo;.
      </p>
      <Textarea
        id={FIELD_ID}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={compact ? 2 : 4}
        maxLength={MAX_LENGTH}
        placeholder="Describe any corrections or overrides. Leave empty to use card / research / inference as-is."
        aria-label="Override instructions"
        className="resize-y bg-zinc-800 border-zinc-700 text-[clamp(13px,1vw,16px)] text-zinc-200 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-600/50"
      />
      <div
        className="flex justify-end font-mono text-[10px] text-zinc-600"
        aria-live="polite"
      >
        {value.length}/{MAX_LENGTH}
      </div>
    </div>
  );
}
