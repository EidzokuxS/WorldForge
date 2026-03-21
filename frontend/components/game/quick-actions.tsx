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
    <div className="flex flex-wrap gap-2 px-4 py-2 border-t border-border bg-muted/30">
      {actions.map((qa, i) => (
        <button
          key={i}
          onClick={() => onAction(qa.action)}
          disabled={disabled}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {qa.label}
        </button>
      ))}
    </div>
  );
}
