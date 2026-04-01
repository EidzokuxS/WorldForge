"use client";

import Link from "next/link";
import { BookOpen, Compass, Library, Settings2, Sword } from "lucide-react";

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

function getCampaignRoutes(pathname: string): NavItem[] {
  const match = pathname.match(/^\/campaign\/([^/]+)/);
  const campaignId = match?.[1];
  if (!campaignId) {
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

  const campaignItems = getCampaignRoutes(pathname);

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="rounded-3xl border border-border/70 bg-background/50 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blood">WorldForge</p>
          <p className="mt-2 font-serif text-2xl text-bone">Desktop Shell</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Non-game planning, creation, review, and authoring surfaces.
          </p>
        </div>
      </SidebarHeader>
      <SidebarContent>
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
        {campaignItems.length > 0 ? (
          <SidebarGroup className="mt-6">
            <SidebarGroupLabel>Campaign</SidebarGroupLabel>
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
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <p className="text-xs text-muted-foreground">
          Persistent navigation for launcher, creation, review, character, settings, and library flows.
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
