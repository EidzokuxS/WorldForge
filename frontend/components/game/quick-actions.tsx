"use client";

interface QuickAction {
  label: string;
  action: string;
}

interface QuickActionsProps {
  actions: QuickAction[];
  onAction: (action: string) => void;
  disabled?: boolean;
}

export type { QuickAction };

export function QuickActions({ actions, onAction, disabled }: QuickActionsProps) {
  if (actions.length === 0) return null;

  return (
    <div className="border-t border-white/8 bg-white/[0.03] px-4 py-3 sm:px-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-zinc-500">
          Support Actions
        </p>
        <p className="text-[11px] text-zinc-500">
          Unlocks after authoritative turn completion
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((qa, i) => (
          <button
            key={i}
            onClick={() => onAction(qa.action)}
            disabled={disabled}
            className="rounded-2xl border border-white/10 bg-black/25 px-3.5 py-2 text-sm text-zinc-100 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {qa.label}
          </button>
        ))}
      </div>
    </div>
  );
}
