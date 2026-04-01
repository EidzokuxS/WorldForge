import * as React from "react";

import {
  ShellActionTray,
  ShellPanel,
  ShellRail,
} from "@/components/non-game-shell/shell-primitives";

interface CharacterWorkspaceProps {
  entryMethods: React.ReactNode;
  editor: React.ReactNode;
  summary: React.ReactNode;
  actions: React.ReactNode;
}

export function CharacterWorkspace({
  entryMethods,
  editor,
  summary,
  actions,
}: CharacterWorkspaceProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <ShellRail className="h-fit p-5">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blood">Authoring Rail</p>
            <h2 className="font-serif text-2xl text-bone">Input Methods</h2>
          </div>
          <div className="space-y-4 text-sm text-muted-foreground">
          {entryMethods}
          </div>
        </div>
      </ShellRail>

      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">{editor}</div>
          <ShellPanel className="h-fit p-5">
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blood">Shell Summary</p>
                <h2 className="font-serif text-2xl text-bone">Draft Summary</h2>
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
