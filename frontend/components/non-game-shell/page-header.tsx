import * as React from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center justify-between border-b border-white/[0.06] px-[clamp(18px,3vw,56px)] py-[clamp(14px,1.4vw,24px)]",
        className,
      )}
    >
      <h1 className="font-serif text-[clamp(26px,2vw,42px)] font-semibold text-bone">
        {title}
      </h1>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
