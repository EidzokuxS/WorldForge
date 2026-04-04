import * as React from "react";

import { cn } from "@/lib/utils";

interface ReviewWorkspaceProps {
  children: React.ReactNode;
  className?: string;
}

export function ReviewWorkspace({
  children,
  className,
}: ReviewWorkspaceProps) {
  return (
    <div className={cn("flex flex-1 flex-col min-h-0", className)}>
      {children}
    </div>
  );
}
