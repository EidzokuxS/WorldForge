"use client";

import { clsx } from "clsx";
import type { GameMessageKind } from "@/lib/gameplay-text";

type SpecialMessageKind = Extract<
  GameMessageKind,
  "compare" | "lookup" | "system" | "mechanical" | "progress"
>;

interface SpecialMessageBlockProps {
  kind: SpecialMessageKind;
  content: string;
  className?: string;
}

const LABELS: Record<SpecialMessageKind, string> = {
  compare: "Power Profile",
  lookup: "Lookup",
  system: "System",
  mechanical: "Mechanical",
  progress: "Status",
};

export function SpecialMessageBlock({
  kind,
  content,
  className,
}: SpecialMessageBlockProps) {
  return (
    <aside
      className={clsx(
        "rounded-2xl border px-4 py-3 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.85)]",
        kind === "compare" &&
          "border-[color:var(--color-mystic)]/35 bg-[color:var(--color-mystic)]/10",
        kind === "lookup" &&
          "border-white/8 bg-white/[0.035]",
        kind === "system" &&
          "border-white/8 bg-white/[0.02]",
        kind === "mechanical" &&
          "border-[color:var(--color-blood)]/30 bg-[color:var(--color-blood-dark)]/55",
        kind === "progress" &&
          "border-white/6 bg-white/[0.015]",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            "mt-1 h-2 w-2 shrink-0 rounded-full",
            kind === "compare" && "bg-[color:var(--color-mystic)]",
            kind === "lookup" && "bg-white/75",
            kind === "system" && "bg-white/55",
            kind === "mechanical" && "bg-[color:var(--color-blood)]",
            kind === "progress" && "bg-white/45"
          )}
        />
        <div className="min-w-0 space-y-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {LABELS[kind]}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {content}
          </p>
        </div>
      </div>
    </aside>
  );
}
