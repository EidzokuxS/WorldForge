"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useCampaignStatus } from "@/components/non-game-shell/campaign-status-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CAMPAIGN_NEW_FLOW_CLEARED_EVENT,
  clearCampaignNewFlowSession,
  isCampaignNewFlowSessionEmpty,
  readCampaignNewFlowSession,
  type CampaignNewFlowSession,
} from "@/components/campaign-new/flow-session";

interface AppSidebarProps {
  pathname: string;
}

interface NavItem {
  href: string;
  label: string;
  glyph: string;
  badge?: string;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  match: (pathname: string) => boolean;
}

function getCampaignId(pathname: string): string | null {
  const match = pathname.match(/^\/campaign\/(?!new(?:\/|$))([^/]+)/);
  return match?.[1] ?? null;
}

function getDraftHref(session: CampaignNewFlowSession | null): string | null {
  if (!session || isCampaignNewFlowSessionEmpty(session)) {
    return null;
  }
  return session.step === 2 ? "/campaign/new/dna" : "/campaign/new";
}

function useForgeDraft(pathname: string) {
  const [draft, setDraft] = React.useState<CampaignNewFlowSession | null>(null);

  React.useEffect(() => {
    function syncDraft() {
      setDraft(readCampaignNewFlowSession());
    }

    syncDraft();
    window.addEventListener(CAMPAIGN_NEW_FLOW_CLEARED_EVENT, syncDraft);
    window.addEventListener("storage", syncDraft);
    return () => {
      window.removeEventListener(CAMPAIGN_NEW_FLOW_CLEARED_EVENT, syncDraft);
      window.removeEventListener("storage", syncDraft);
    };
  }, [pathname]);

  return draft;
}

export function AppSidebar({ pathname }: AppSidebarProps) {
  const router = useRouter();
  const { campaign, generationReady } = useCampaignStatus();
  const draft = useForgeDraft(pathname);
  const draftHref = getDraftHref(draft);
  const [confirmFreshStart, setConfirmFreshStart] = React.useState(false);
  const routeCampaignId = getCampaignId(pathname);
  const activeCampaignId = routeCampaignId ?? campaign?.id ?? null;
  const reviewHref = activeCampaignId ? `/campaign/${activeCampaignId}/review` : "/";

  const sessionItems: NavItem[] = [
    {
      href: "/game",
      label: "Play",
      glyph: "▸",
      disabled: !campaign,
      match: (value) => value === "/game",
    },
    {
      href: reviewHref,
      label: "World",
      glyph: "◇",
      disabled: !generationReady,
      match: (value) => value.startsWith("/campaign/") && value.endsWith("/review"),
    },
    {
      href: "/",
      label: "Home",
      glyph: "★",
      match: (value) => value === "/",
    },
    {
      href: "/#campaigns",
      label: "Campaigns",
      glyph: "≣",
      match: (value) => value === "/#campaigns",
    },
  ];

  const forgeItems: NavItem[] = [
    {
      href: "/campaign/new",
      label: "New campaign",
      glyph: "+",
      onClick: (event) => {
        if (draftHref) {
          event.preventDefault();
          setConfirmFreshStart(true);
          return;
        }
        clearCampaignNewFlowSession();
      },
      match: (value) => value === "/campaign/new" || value === "/campaign/new/dna",
    },
    ...(draftHref
      ? [{
          href: draftHref,
          label: "Resume draft",
          glyph: "↩",
          badge: draft?.step === 2 ? "DNA" : "I",
          match: (value: string) => value === draftHref,
        }]
      : []),
    {
      href: activeCampaignId ? `/campaign/${activeCampaignId}/character` : "#",
      label: "Player character",
      glyph: "⇣",
      disabled: !activeCampaignId,
      match: (value) => value.startsWith("/campaign/") && value.endsWith("/character"),
    },
  ];

  const libraryItems: NavItem[] = [
    {
      href: "/library",
      label: "Worldbook",
      glyph: "❦",
      match: (value) => value.startsWith("/library"),
    },
    {
      href: "/settings",
      label: "Settings",
      glyph: "⚙",
      match: (value) => value.startsWith("/settings"),
    },
  ];

  return (
    <nav className="wf-sidebar">
      <div className="wf-sidebar-brand">
        <Link href="/" className="wf-sidebar-mark">
          World<span className="text-[var(--ember)]">Forge</span>
        </Link>
        <span className="wf-sidebar-ver">v0.7.2</span>
      </div>

      <div className="wf-sidebar-campaign">
        <p className="wf-sidebar-kicker">Current campaign</p>
        {campaign ? (
          <>
            <p className="wf-serif-em wf-sidebar-campaign-title">
              {campaign.name}
            </p>
            <p className="wf-sidebar-campaign-meta">
              <span className="wf-sidebar-dot" aria-hidden="true" />
              <span>{campaign.generationComplete ? "Generated world" : "Campaign draft"}</span>
            </p>
          </>
        ) : (
          <p className="wf-sidebar-empty">No campaign loaded.</p>
        )}
      </div>

      <div className="wf-sidebar-nav">
        <SidebarGroup title="Session" items={sessionItems} pathname={pathname} />
        <SidebarGroup title="Forge" items={forgeItems} pathname={pathname} />
        <SidebarGroup title="Library" items={libraryItems} pathname={pathname} />
      </div>

      <div className="wf-sidebar-foot">
        <span className="text-[var(--good)]">●</span> local rig
        <span className="mx-2">·</span>
        all data on disk
      </div>
      <AlertDialog open={confirmFreshStart} onOpenChange={setConfirmFreshStart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the current campaign draft from this browser tab. Use Resume draft if you want to keep working on it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep draft</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearCampaignNewFlowSession();
                setConfirmFreshStart(false);
                router.push("/campaign/new");
              }}
            >
              Start over
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}

function SidebarGroup({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="wf-sidebar-group">
      <p className="wf-sidebar-group-h">
        {title}
      </p>
      <div className="wf-sidebar-group-items">
        {items.map((item) => {
          const active = item.match(pathname);
          const content = (
            <>
              <span className="wf-sidebar-glyph">{item.glyph}</span>
              <span className="wf-sidebar-label">{item.label}</span>
              {item.badge ? (
                <span className="wf-sidebar-badge">
                  {item.badge}
                </span>
              ) : null}
            </>
          );
          const className = [
            "wf-sidebar-item",
            active ? "is-active" : "",
            item.disabled ? "is-disabled" : "",
          ].join(" ");

          return (
            <Link
              key={`${title}-${item.label}`}
              href={item.disabled ? "#" : item.href}
              aria-label={item.label}
              aria-disabled={item.disabled}
              aria-current={active ? "page" : undefined}
              className={className}
              onClick={item.onClick}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
