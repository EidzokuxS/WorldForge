import * as React from "react";

import { cn } from "@/lib/utils";

interface StickyActionBarProps {
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function StickyActionBar({
  title = "Ready",
  description,
  children,
  className,
}: StickyActionBarProps) {
  return (
    <div
      className={cn(
        "sticky bottom-4 z-20 mt-6 rounded-3xl border border-border/70 bg-background/92 px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-bone">{title}</p>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
