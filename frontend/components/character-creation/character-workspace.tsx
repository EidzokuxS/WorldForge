import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <Card className="h-fit border-border/70 bg-card/80 shadow-xl shadow-black/10">
        <CardHeader>
          <CardTitle className="font-serif text-2xl text-bone">Input Methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          {entryMethods}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">{editor}</div>
          <Card className="h-fit border-border/70 bg-card/80 shadow-xl shadow-black/10">
            <CardHeader>
              <CardTitle className="font-serif text-2xl text-bone">Draft Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {summary}
            </CardContent>
          </Card>
        </div>
        <div className="rounded-3xl border border-border/70 bg-background/90 px-4 py-3 shadow-xl shadow-black/20">
          {actions}
        </div>
      </div>
    </div>
  );
}
