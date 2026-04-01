"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/non-game-shell/app-sidebar";
import { PageHeader } from "@/components/non-game-shell/page-header";
import {
  ShellActionTray,
  ShellFrame,
  ShellMainPanel,
  ShellNavigationRail,
  ShellPanel,
} from "@/components/non-game-shell/shell-primitives";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  eyebrow?: string;
  status?: React.ReactNode;
  headerActions?: React.ReactNode;
  inspector?: React.ReactNode;
  inspectorTitle?: string;
  inspectorDescription?: string;
  stickyActions?: React.ReactNode;
  stickyTitle?: string;
  stickyDescription?: string;
}

interface RouteDescription {
  eyebrow: string;
  title: string;
  description: string;
  inspectorTitle: string;
  inspectorDescription: string;
  stickyTitle: string;
  stickyDescription: string;
  stickyActions?: React.ReactNode;
  suppressDefaultStickyAction?: boolean;
}

function describeRoute(pathname: string): RouteDescription {
  if (pathname === "/") {
    return {
      eyebrow: "Launch",
      title: "Campaign Launchpad",
      description: "Recent campaigns, creation entry points, and reusable source management live in one desktop frame.",
      inspectorTitle: "Launch Context",
      inspectorDescription: "Start a new campaign, resume an existing one, or adjust shared settings without leaving the shell.",
      stickyTitle: "Primary Flow",
      stickyDescription: "The launcher hands off into routed creation, not a modal-only workflow.",
      stickyActions: (
        <>
          <Button asChild size="sm">
            <Link href="/campaign/new">New Campaign</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings">Settings</Link>
          </Button>
        </>
      ),
    };
  }

  if (pathname.startsWith("/campaign/new")) {
    return {
      eyebrow: "Create",
      title: "Campaign Creation",
      description: "Concept, DNA, and source selection now live in a routed workspace.",
      inspectorTitle: "Creation Summary",
      inspectorDescription: "Selected sources, research state, and handoff expectations stay visible as you move through the flow.",
      stickyTitle: "Creation Flow",
      stickyDescription: "Complete concept and DNA steps, then generate into the canonical review route.",
      suppressDefaultStickyAction: true,
    };
  }

  if (pathname.startsWith("/campaign/") && pathname.endsWith("/review")) {
    return {
      eyebrow: "Review",
      title: "World Review",
      description: "Audit scaffold sections, lore, and NPCs before handing off to character creation.",
      inspectorTitle: "Review Signals",
      inspectorDescription: "Keep validation context, counts, and next-step guidance visible while editing.",
      stickyTitle: "Review Flow",
      stickyDescription: "Save edits, regenerate sections, and continue into character authoring.",
    };
  }

  if (pathname.startsWith("/campaign/") && pathname.endsWith("/character")) {
    return {
      eyebrow: "Character",
      title: "Character Authoring",
      description: "Input methods, structured drafting, start conditions, and loadout preview belong in one route-owned workspace.",
      inspectorTitle: "Character Summary",
      inspectorDescription: "Track completeness, persona application, and launch readiness without leaving the editor.",
      stickyTitle: "Character Flow",
      stickyDescription: "Save the canonical draft, then hand off cleanly into /game.",
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      eyebrow: "Settings",
      title: "Provider and Role Settings",
      description: "Configure providers, role bindings, research defaults, and image settings in the shared shell.",
      inspectorTitle: "Provider Health",
      inspectorDescription: "The shell keeps save state and active role bindings visible instead of burying them below the fold.",
      stickyTitle: "Settings Status",
      stickyDescription: "Changes save automatically and should remain visible from the header and inspector regions.",
    };
  }

  if (pathname.startsWith("/library")) {
    return {
      eyebrow: "Library",
      title: "Reusable Source Library",
      description: "Browse, import, and curate reusable worldbooks without jumping back into the creation modal.",
      inspectorTitle: "Library Guidance",
      inspectorDescription: "Reusable knowledge sources stay available as a first-class workspace, not a hidden side path.",
      stickyTitle: "Library Flow",
      stickyDescription: "Manage sources here, then return to campaign creation with the same shell language.",
    };
  }

  return {
    eyebrow: "Workspace",
    title: "Non-Game Workspace",
    description: "Shared desktop shell for launcher, creation, review, character, settings, and library surfaces.",
    inspectorTitle: "Inspector",
    inspectorDescription: "Context, warnings, and next actions stay visible while you work.",
    stickyTitle: "Ready",
    stickyDescription: "Persistent action regions remove the need to hunt for the next step.",
  };
}

export function AppShell({
  children,
  title,
  description,
  eyebrow,
  status,
  headerActions,
  inspector,
  inspectorTitle,
  inspectorDescription,
  stickyActions,
  stickyTitle,
  stickyDescription,
}: AppShellProps) {
  const pathname = usePathname();
  const route = describeRoute(pathname);
  const resolvedStickyActions = stickyActions ?? route.stickyActions;

  return (
    <SidebarProvider>
      <div className="min-h-screen [background:var(--shell-backdrop)]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1820px] px-4 py-4 lg:px-6">
          <ShellFrame className="flex min-h-[calc(100vh-2rem)] w-full">
            <ShellNavigationRail className="w-[18.5rem]">
              <AppSidebar pathname={pathname} />
            </ShellNavigationRail>
            <ShellMainPanel>
              <PageHeader
                eyebrow={eyebrow ?? route.eyebrow}
                title={title ?? route.title}
                description={description ?? route.description}
                status={status}
                actions={headerActions}
                className="border-b [border-color:var(--shell-border)] [background:linear-gradient(180deg,rgba(255,255,255,0.025)_0%,rgba(255,255,255,0)_100%)]"
              />
              <div className="flex min-h-[calc(100vh-10rem)] min-w-0 flex-1 flex-col lg:flex-row">
                <main className="min-w-0 flex-1 px-6 py-6" role="main">
                  <div data-testid="shell-grid" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0">{children}</div>
                    <aside className="hidden xl:block">
                      <ShellPanel className="sticky top-6 p-5">
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <h2 className="font-serif text-xl text-bone">{inspectorTitle ?? route.inspectorTitle}</h2>
                            <p className="text-sm text-muted-foreground">
                              {inspectorDescription ?? route.inspectorDescription}
                            </p>
                          </div>
                          <div className="space-y-3 text-sm text-muted-foreground">
                            {inspector ?? (
                              <>
                                <p>Route context stays visible here instead of duplicating the full editor surface.</p>
                                <Separator />
                                <p>Use this rail for summaries, warnings, generation progress, or quick orientation notes.</p>
                              </>
                            )}
                          </div>
                        </div>
                      </ShellPanel>
                    </aside>
                  </div>
                  <ShellActionTray
                    title={stickyTitle ?? route.stickyTitle}
                    description={stickyDescription ?? route.stickyDescription}
                  >
                    <div className="flex flex-wrap justify-end gap-2">
                      {resolvedStickyActions ?? (route.suppressDefaultStickyAction ? null : (
                        <Button asChild size="sm" variant="outline">
                          <Link href="/campaign/new">Open Creation Flow</Link>
                        </Button>
                      ))}
                    </div>
                  </ShellActionTray>
                </main>
              </div>
            </ShellMainPanel>
          </ShellFrame>
        </div>
      </div>
    </SidebarProvider>
  );
}
