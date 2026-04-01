import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface InspectorRailProps {
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function InspectorRail({
  title = "Inspector",
  description,
  children,
  className,
}: InspectorRailProps) {
  return (
    <aside className={cn("hidden xl:block", className)}>
      <Card className="sticky top-6 border-border/70 bg-card/80 shadow-xl shadow-black/10 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-xl text-bone">{title}</CardTitle>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {children}
        </CardContent>
      </Card>
    </aside>
  );
}
