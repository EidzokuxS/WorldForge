import * as React from "react";

import { cn } from "@/lib/utils";

type DivProps = React.ComponentProps<"div">;

export function ShellFrame({ className, ...props }: DivProps) {
  return (
    <div
      data-shell-region="outer-frame"
      className={cn(
        "overflow-hidden rounded-[var(--shell-radius)] border [border-color:var(--shell-border)] [background:var(--shell-frame-surface)] shadow-[0_18px_80px_rgba(0,0,0,0.32)]",
        className,
      )}
      {...props}
    />
  );
}

export function ShellNavigationRail({ className, ...props }: DivProps) {
  return (
    <div
      data-shell-region="navigation-rail"
      className={cn(
        "flex shrink-0 flex-col border-r [border-color:var(--shell-border)] [background:var(--shell-rail-surface)]",
        className,
      )}
      {...props}
    />
  );
}

export function ShellMainPanel({ className, ...props }: DivProps) {
  return (
    <div
      data-shell-region="main-panel"
      className={cn(
        "flex min-w-0 flex-1 flex-col overflow-hidden [background:linear-gradient(180deg,var(--shell-panel-surface)_0%,#0d0d11_100%)]",
        className,
      )}
      {...props}
    />
  );
}
