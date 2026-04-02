"use client";

import Link from "next/link";
import { BookOpen, Compass, Library, Settings2, Sword } from "lucide-react";
import { useCampaignStatus } from "@/components/non-game-shell/campaign-status-provider";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface AppSidebarProps {
  pathname: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (pathname: string) => boolean;
}

function getCampaignId(pathname: string): string | null {
  const match = pathname.match(/^\/campaign\/(?!new(?:\/|$))([^/]+)/);
  return match?.[1] ?? null;
}

function getCampaignRoutes(pathname: string, generationReady: boolean): NavItem[] {
  const campaignId = getCampaignId(pathname);
  if (!campaignId || !generationReady) {
    return [];
  }

  const reviewHref = `/campaign/${campaignId}/review`;
  const characterHref = `/campaign/${campaignId}/character`;

  return [
    {
      href: reviewHref,
      label: "World Review",
      icon: Compass,
      match: (value) => value.startsWith(reviewHref),
    },
    {
      href: characterHref,
      label: "Character",
      icon: Sword,
      match: (value) => value.startsWith(characterHref),
    },
  ];
}

export function AppSidebar({ pathname }: AppSidebarProps) {
  const { loading, generationReady } = useCampaignStatus();
  const primaryItems: NavItem[] = [
    {
      href: "/",
      label: "Launchpad",
      icon: BookOpen,
      match: (value) => value === "/",
    },
    {
      href: "/campaign/new",
      label: "New Campaign",
      icon: Compass,
      match: (value) => value.startsWith("/campaign/new"),
    },
    {
      href: "/library",
      label: "Library",
      icon: Library,
      match: (value) => value.startsWith("/library"),
    },
    {
      href: "/settings",
      label: "Settings",
      icon: Settings2,
      match: (value) => value.startsWith("/settings"),
    },
  ];

  const campaignItems = getCampaignRoutes(pathname, generationReady);
  const routeCampaignId = getCampaignId(pathname);

  return (
    <Sidebar className="h-full w-full border-0 bg-transparent supports-[backdrop-filter]:bg-transparent">
      <SidebarHeader className="px-[clamp(16px,1.2vw,24px)] pt-[clamp(20px,1.5vw,32px)] pb-[clamp(16px,1vw,24px)]">
        <p className="text-[clamp(14px,1.1vw,20px)] font-bold uppercase tracking-[0.2em] text-blood">
          WorldForge
        </p>
      </SidebarHeader>
      <SidebarContent className="px-[clamp(6px,0.5vw,12px)] pb-5">
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenu>
            {primaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={item.match(pathname)}>
                    <Link href={item.href}>
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
        {routeCampaignId ? (
          <SidebarGroup className="mt-6">
            <SidebarGroupLabel>Campaign</SidebarGroupLabel>
            {campaignItems.length > 0 ? (
              <SidebarMenu>
                {campaignItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={item.match(pathname)}>
                        <Link href={item.href}>
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            ) : (
              <p className="px-3 text-xs text-muted-foreground">
                {loading
                  ? "Checking world readiness..."
                  : "World Review and Character unlock after generation completes."}
              </p>
            )}
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter className="border-t [border-color:var(--shell-border)] px-[clamp(16px,1.2vw,24px)] py-[clamp(12px,1vw,20px)]">
        <p className="text-[clamp(11px,0.7vw,14px)] text-zinc-600">v0.1.0</p>
      </SidebarFooter>
    </Sidebar>
  );
}
