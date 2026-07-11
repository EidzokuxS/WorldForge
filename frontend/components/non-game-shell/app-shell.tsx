"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/non-game-shell/app-sidebar";
import { useCampaignStatus } from "@/components/non-game-shell/campaign-status-provider";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  headerActions?: React.ReactNode;
}

function titleForRoute(pathname: string): string {
  if (pathname === "/") return "Home";
  if (pathname === "/campaign/new") return "Forge / New Campaign";
  if (pathname.startsWith("/campaign/new/dna")) return "Forge / World DNA";
  if (pathname.startsWith("/campaign/") && pathname.endsWith("/forge")) return "Campaign / Forge";
  if (pathname.startsWith("/campaign/") && pathname.endsWith("/review")) return "Campaign / World Review";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/library")) return "Worldbook";
  return "Workspace";
}

export function AppShell({
  children,
  title,
  headerActions,
}: AppShellProps) {
  const pathname = usePathname();
  const { campaign } = useCampaignStatus();
  const resolvedTitle = title ?? titleForRoute(pathname);
  const showTopbar = pathname !== "/";
  const isForgeRoute = pathname.startsWith("/campaign/") && pathname.endsWith("/forge");
  const isReviewRoute = pathname.startsWith("/campaign/") && pathname.endsWith("/review");
  const crumb = (isForgeRoute || isReviewRoute) && campaign ? (
    <>
      <b>{campaign.name}</b>
      <span className="sep">/</span>
      <span>{isReviewRoute ? "World Review" : "Campaign Forge"}</span>
    </>
  ) : (
    resolvedTitle
  );

  return (
    <div className="wf-v4-app">
      <aside className="wf-v4-rail">
        <AppSidebar pathname={pathname} />
      </aside>
      <div className="wf-v4-stage">
        {showTopbar ? (
          <header className="wf-v4-topbar">
            <button className="wf-v4-hamburger" aria-label="Menu" type="button">
              ≡
            </button>
            <div className="wf-v4-crumb">{crumb}</div>
            <div className="ml-auto flex items-center gap-2">
              {headerActions}
            </div>
          </header>
        ) : null}
        <main role="main" className="wf-v4-scroll">
          {children}
        </main>
      </div>
    </div>
  );
}
