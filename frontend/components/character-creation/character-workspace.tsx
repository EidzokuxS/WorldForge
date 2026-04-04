import * as React from "react";

import { cn } from "@/lib/utils";

interface CharacterWorkspaceProps {
  children: React.ReactNode;
  className?: string;
}

export function CharacterWorkspace({
  children,
  className,
}: CharacterWorkspaceProps) {
  return (
    <div className={cn("flex flex-1 flex-col min-h-0", className)}>
      {children}
    </div>
  );
}
