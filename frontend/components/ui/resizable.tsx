"use client";

import * as React from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
  type PanelGroupProps,
  type PanelProps,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

const ResizablePanelGroup = React.forwardRef<
  ImperativePanelHandle,
  PanelGroupProps & React.RefAttributes<ImperativePanelHandle>
>(({ className, ...props }, ref) => (
  <PanelGroup
    ref={ref}
    data-slot="resizable-panel-group"
    className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
    {...props}
  />
));
ResizablePanelGroup.displayName = "ResizablePanelGroup";

const ResizablePanel = ({ className, ...props }: PanelProps & { className?: string }) => (
  <Panel data-slot="resizable-panel" className={cn("min-w-0", className)} {...props} />
);

const ResizableHandle = ({
  className,
  withHandle = false,
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean;
}) => (
  <PanelResizeHandle
    data-slot="resizable-handle"
    className={cn(
      "relative flex w-px items-center justify-center bg-border/60 after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:top-1/2 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0",
      className,
    )}
    {...props}
  >
    {withHandle ? (
      <div className="z-10 flex h-8 w-4 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground shadow-sm data-[panel-group-direction=vertical]:h-4 data-[panel-group-direction=vertical]:w-8">
        <div className="h-4 w-px bg-current data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-4" />
      </div>
    ) : null}
  </PanelResizeHandle>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
