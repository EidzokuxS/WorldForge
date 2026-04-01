"use client";

import Link from "next/link";
import { BookOpen, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCampaignNewFlow } from "@/components/campaign-new/flow-provider";

interface ConceptWorkspaceProps {
  onContinue: () => Promise<void>;
}

export function ConceptWorkspace({ onContinue }: ConceptWorkspaceProps) {
  const w = useCampaignNewFlow();
  const selectedWorldbookIds = new Set(w.selectedWorldbooks.map((item) => item.id));
  const missingCampaignName = w.campaignName.trim().length === 0;
  const missingPremise = w.campaignPremise.trim().length === 0 && !w.hasWorldbook;
  const conceptValidationMessage =
    missingCampaignName || missingPremise
      ? "Enter a campaign name and premise, or select a source, before continuing into DNA."
      : null;
  const activeProgressLabel = w.generationProgress?.label ?? (w.isSuggesting ? "Preparing World DNA suggestions..." : null);
  const activeProgressStep =
    w.generationProgress && w.generationProgress.totalSteps > 0
      ? `Step ${w.generationProgress.step} of ${w.generationProgress.totalSteps}`
      : null;
  const createLabel = w.isGenerating
    ? "Generating World..."
    : w.creatingCampaign
      ? "Creating Campaign..."
      : "Create World Now";
  const continueLabel = w.isSuggesting ? "Preparing DNA..." : "Continue to DNA";

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="border-border/70 bg-card/80 shadow-xl shadow-black/10">
          <CardHeader>
            <CardTitle className="font-serif text-2xl text-bone">Campaign Concept</CardTitle>
            <p className="text-sm text-muted-foreground">
              Define the premise, optional franchise anchor, research mode, and any reusable worldbooks before moving into World DNA.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign Name</Label>
              <Input
                id="campaign-name"
                value={w.campaignName}
                onChange={(event) => w.setCampaignName(event.target.value)}
                placeholder="Campaign Name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-premise">Premise</Label>
              <Textarea
                id="campaign-premise"
                value={w.campaignPremise}
                onChange={(event) => w.setCampaignPremise(event.target.value)}
                placeholder={
                  w.hasWorldbook
                    ? "Describe your world (optional when selected worldbooks already carry context)..."
                    : "Describe your world: setting, tone, tensions, and what makes this campaign distinct..."
                }
                rows={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-franchise">Franchise / IP</Label>
              <Input
                id="campaign-franchise"
                value={w.campaignFranchise}
                onChange={(event) => w.setCampaignFranchise(event.target.value)}
                placeholder="Optional franchise or known-IP anchor"
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-bone">Research toggle</p>
                <p className="text-xs text-muted-foreground">
                  Preserve the current generator research seam and selected-worldbook context.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="research-toggle" className="text-sm text-muted-foreground">
                  {w.researchEnabled ? "Research on" : "Research off"}
                </Label>
                <Switch
                  id="research-toggle"
                  checked={w.researchEnabled}
                  onCheckedChange={w.setResearchEnabled}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-xl shadow-black/10">
          <CardHeader>
            <CardTitle className="font-serif text-2xl text-bone">Source Library</CardTitle>
            <p className="text-sm text-muted-foreground">
              Reuse worldbooks without reopening the modal flow.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {w.worldbookLibraryLoading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading reusable worldbooks...
              </div>
            ) : w.worldbookLibrary.length > 0 ? (
              <div className="space-y-2">
                {w.worldbookLibrary.map((item) => {
                  const selected = selectedWorldbookIds.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition-colors ${
                        selected
                          ? "border-blood/60 bg-blood/10 text-bone"
                          : "border-border/70 bg-background/40 text-foreground hover:bg-accent/50"
                      }`}
                      onClick={() => w.toggleWorldbookSelection(item)}
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">{item.displayName}</span>
                        <span className="text-xs text-muted-foreground">{item.entryCount} reusable entries</span>
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.18em]">
                        {selected ? "Selected" : "Available"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
                No reusable worldbooks yet. Import from the library page or add one during this flow.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/library">
                  <BookOpen className="h-4 w-4" />
                  Open Library
                </Link>
              </Button>
              <label className="inline-flex">
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void w.handleWorldbookUpload(file);
                    }
                    event.target.value = "";
                  }}
                />
                <span className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-background/50 px-3 py-2 text-sm font-medium hover:bg-accent">
                  <Plus className="h-4 w-4" />
                  Add Worldbook JSON
                </span>
              </label>
            </div>
            {w.worldbookError ? <p className="text-sm text-destructive">{w.worldbookError}</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-3xl border border-border/70 bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-bone">Concept status</p>
            <p className={`text-xs ${conceptValidationMessage ? "text-destructive" : "text-muted-foreground"}`}>
              {conceptValidationMessage
                ?? "Name, premise or selected source, and research context persist into the DNA route through the shared layout provider."}
            </p>
            {activeProgressLabel ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{activeProgressLabel}</span>
                {activeProgressStep ? <span>{activeProgressStep}</span> : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void w.handleCreateWithSeeds()} disabled={!w.canCreate}>
              {w.creatingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {createLabel}
            </Button>
            <Button onClick={() => void onContinue()} disabled={!w.canCreate}>
              {w.isSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {continueLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
