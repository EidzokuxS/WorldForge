"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/non-game-shell/app-sidebar";
import { PageHeader } from "@/components/non-game-shell/page-header";
import {
  ShellFrame,
  ShellMainPanel,
  ShellNavigationRail,
} from "@/components/non-game-shell/shell-primitives";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  headerActions?: React.ReactNode;
  /** @deprecated Ignored in flat layout. */
  description?: string;
  /** @deprecated Ignored in flat layout. */
  eyebrow?: string;
  /** @deprecated Ignored in flat layout. */
  status?: React.ReactNode;
  /** @deprecated Ignored in flat layout. */
  inspector?: React.ReactNode;
  /** @deprecated Ignored in flat layout. */
  inspectorTitle?: string;
  /** @deprecated Ignored in flat layout. */
  inspectorDescription?: string;
  /** @deprecated Ignored in flat layout. */
  stickyActions?: React.ReactNode;
  /** @deprecated Ignored in flat layout. */
  stickyTitle?: string;
  /** @deprecated Ignored in flat layout. */
  stickyDescription?: string;
}

function titleForRoute(pathname: string): string {
  if (pathname === "/") return "Launchpad";
  if (pathname.startsWith("/campaign/new")) return "New Campaign";
  if (pathname.startsWith("/campaign/") && pathname.endsWith("/review")) return "World Review";
  if (pathname.startsWith("/campaign/") && pathname.endsWith("/character")) return "Character";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/library")) return "Library";
  return "Workspace";
}

export function AppShell({
  children,
  title,
  headerActions,
}: AppShellProps) {
  const pathname = usePathname();
  const resolvedTitle = title ?? titleForRoute(pathname);

  return (
    <SidebarProvider>
      <div className="min-h-screen [background:var(--shell-backdrop)]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1820px] p-[clamp(8px,0.6vw,16px)]">
          <ShellFrame className="flex min-h-[calc(100vh-2rem)] w-full">
            <ShellNavigationRail className="w-[clamp(220px,16vw,300px)]">
              <AppSidebar pathname={pathname} />
            </ShellNavigationRail>
            <ShellMainPanel>
              <PageHeader title={resolvedTitle} actions={headerActions} />
              <main
                role="main"
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-[clamp(28px,2.5vw,56px)] py-[clamp(20px,1.8vw,40px)]"
              >
                {children}
              </main>
            </ShellMainPanel>
          </ShellFrame>
        </div>
      </div>
    </SidebarProvider>
  );
}
