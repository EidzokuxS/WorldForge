import * as React from "react";

import { cn } from "@/lib/utils";

type DivProps = React.ComponentProps<"div">;

const shellSurfaceBase =
  "rounded-[var(--shell-radius-panel)] border [border-color:var(--shell-border)] shadow-[0_24px_70px_rgba(0,0,0,0.18)] backdrop-blur-xl";

export function ShellFrame({ className, ...props }: DivProps) {
  return (
    <div
      data-shell-region="outer-frame"
      className={cn(
        "overflow-hidden rounded-[var(--shell-radius)] border [border-color:var(--shell-border)] [background:var(--shell-frame-surface)] shadow-[0_32px_120px_rgba(0,0,0,0.35)] backdrop-blur-xl",
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
        "flex min-w-0 flex-1 flex-col overflow-hidden [background:linear-gradient(180deg,rgba(255,255,255,0.02)_0%,rgba(255,255,255,0)_100%),var(--shell-panel-surface)]",
        className,
      )}
      {...props}
    />
  );
}

/** @deprecated Use flat layout instead. Kept for backward compatibility with workspace components. */
export function ShellPanel({ className, ...props }: DivProps) {
  return (
    <div
      data-shell-surface="panel"
      className={cn(shellSurfaceBase, "[background:var(--shell-panel-surface)]", className)}
      {...props}
    />
  );
}

/** @deprecated Use flat layout instead. Kept for backward compatibility with workspace components. */
export function ShellRail({ className, ...props }: DivProps) {
  return (
    <div
      data-shell-surface="rail"
      className={cn(shellSurfaceBase, "[background:var(--shell-rail-surface)]", className)}
      {...props}
    />
  );
}

interface ShellActionTrayProps extends DivProps {
  title?: string;
  description?: string;
}

/** @deprecated Use flat layout instead. Kept for backward compatibility with workspace components. */
export function ShellActionTray({
  title,
  description,
  children,
  className,
  ...props
}: ShellActionTrayProps) {
  return (
    <div
      data-shell-region="action-tray"
      className={cn(
        shellSurfaceBase,
        "sticky bottom-4 z-20 mt-6 px-4 py-3 [background:var(--shell-panel-muted)]",
        className,
      )}
      {...props}
    >
      {title || description ? (
        <div className="mb-3">
          {title ? <p className="text-sm font-medium text-bone">{title}</p> : null}
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
