"use client";

import * as React from "react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const SidebarContext = React.createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("Sidebar components must be used inside SidebarProvider.");
  }
  return context;
}

function SidebarProvider({
  children,
  defaultOpen = true,
}: React.PropsWithChildren<{ defaultOpen?: boolean }>) {
  const [open, setOpen] = React.useState(defaultOpen);
  const value = React.useMemo(() => ({ open, setOpen }), [open]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

function Sidebar({
  className,
  ...props
}: React.ComponentProps<"aside">) {
  const { open } = useSidebar();

  return (
    <aside
      data-slot="sidebar"
      data-state={open ? "open" : "collapsed"}
      className={cn(
        "flex h-full w-72 shrink-0 flex-col text-sidebar-foreground",
        !open && "w-20",
        className,
      )}
      {...props}
    />
  );
}

function SidebarInset({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-inset"
      className={cn("flex min-h-screen min-w-0 flex-1 flex-col", className)}
      {...props}
    />
  );
}

function SidebarHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("p-4", className)} {...props} />;
}

function SidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-content" className={cn("flex-1 overflow-y-auto px-3 pb-4", className)} {...props} />;
}

function SidebarFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("border-t border-border/70 p-4", className)} {...props} />;
}

function SidebarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group" className={cn("space-y-2", className)} {...props} />;
}

function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="sidebar-group-label"
      className={cn("px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground", className)}
      {...props}
    />
  );
}

function SidebarMenu({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={cn("space-y-1", className)} {...props} />;
}

function SidebarMenuItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("list-none", className)} {...props} />;
}

function SidebarMenuButton({
  asChild = false,
  className,
  isActive = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive}
      className={cn(
        "flex w-full items-center gap-3 rounded-[calc(var(--shell-radius-panel)-0.5rem)] px-3 py-3 text-left text-sm font-medium text-sidebar-foreground/90 transition-all hover:[background:var(--shell-panel-muted)] hover:text-bone",
        isActive && "[background:var(--shell-highlight)] text-bone [box-shadow:inset_0_0_0_1px_var(--shell-highlight-strong),0_12px_30px_rgba(0,0,0,0.18)]",
        className,
      )}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
};
