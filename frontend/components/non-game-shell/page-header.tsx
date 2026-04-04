import * as React from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  actions?: React.ReactNode;
  className?: string;
  /** @deprecated Ignored in flat layout. */
  eyebrow?: string;
  /** @deprecated Ignored in flat layout. */
  description?: string;
  /** @deprecated Ignored in flat layout. */
  status?: React.ReactNode;
}

export function PageHeader({
  title,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center justify-between px-[clamp(28px,2.5vw,56px)] pt-[clamp(20px,1.8vw,40px)]",
        className,
      )}
    >
      <h1 className="font-serif text-[clamp(28px,2.2vw,44px)] font-semibold tracking-tight text-bone">
        {title}
      </h1>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
