"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadCampaignDialog } from "@/components/title/load-campaign-dialog";

export default function LauncherPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card className="border-border/70 bg-card/80 shadow-xl shadow-black/10">
          <CardHeader>
            <CardTitle className="font-serif text-3xl text-bone">Campaign Launchpad</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enter routed creation, resume existing campaigns, or jump into the reusable source library without leaving the shell.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-border/70 bg-muted/20 p-5">
              <p className="text-sm font-medium text-bone">Primary flow</p>
              <p className="mt-2 text-sm text-muted-foreground">
                New campaigns now start from a route-owned workspace instead of a modal-only dialog.
              </p>
              <Button asChild className="mt-4">
                <Link href="/campaign/new">New Campaign</Link>
              </Button>
            </div>
            <div className="rounded-3xl border border-border/70 bg-muted/20 p-5">
              <p className="text-sm font-medium text-bone">Resume flow</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Existing load behavior stays available while the launcher adopts the new shell.
              </p>
              <div className="mt-4">
                <LoadCampaignDialog onLoaded={() => {}} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-xl shadow-black/10">
          <CardHeader>
            <CardTitle className="font-serif text-2xl text-bone">Shell Shortcuts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/library">Open Library</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/settings">Open Settings</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              World review, character authoring, settings, and library now converge on the same shell language.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
