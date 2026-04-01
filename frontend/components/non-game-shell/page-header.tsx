import * as React from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 border-b border-border/70 px-6 py-5",
        className,
      )}
    >
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-blood">
            {eyebrow}
          </p>
        ) : null}
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-bone">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {status ? <div className="text-xs text-muted-foreground">{status}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
