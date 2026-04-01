import * as React from "react";

import {
  ShellActionTray,
  ShellPanel,
  ShellRail,
} from "@/components/non-game-shell/shell-primitives";
import { cn } from "@/lib/utils";

interface ReviewWorkspaceProps {
  sectionNav: React.ReactNode;
  summary: React.ReactNode;
  actions: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ReviewWorkspace({
  sectionNav,
  summary,
  actions,
  children,
  className,
}: ReviewWorkspaceProps) {
  return (
    <div className={cn("grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]", className)}>
      <ShellRail className="h-fit p-5">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blood">Review Rail</p>
            <h2 className="font-serif text-2xl text-bone">Sections</h2>
          </div>
          <div className="space-y-4 text-sm text-muted-foreground">
          {sectionNav}
          </div>
        </div>
      </ShellRail>

      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">{children}</div>
          <ShellPanel className="h-fit p-5">
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blood">Shell Summary</p>
                <h2 className="font-serif text-2xl text-bone">Review Summary</h2>
              </div>
              <div className="space-y-3 text-sm text-muted-foreground">
              {summary}
              </div>
            </div>
          </ShellPanel>
        </div>
        <ShellActionTray>
          {actions}
        </ShellActionTray>
      </div>
    </div>
  );
}
