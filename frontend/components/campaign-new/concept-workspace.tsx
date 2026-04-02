"use client";

import Link from "next/link";
import { BookOpen, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <div className="flex flex-1 flex-col">
      {/* Two-column form layout */}
      <div
        className="grid flex-1"
        style={{
          gridTemplateColumns: "1fr clamp(240px, 18vw, 320px)",
          gap: "clamp(24px, 2vw, 48px)",
        }}
      >
        {/* Left column: form fields */}
        <div className="flex flex-col" style={{ gap: "clamp(16px, 1.2vw, 24px)" }}>
          <div>
            <Label htmlFor="campaign-name">Campaign Name</Label>
            <Input
              id="campaign-name"
              value={w.campaignName}
              onChange={(event) => w.setCampaignName(event.target.value)}
              placeholder="Give your campaign a name"
            />
          </div>

          {/* Premise - flex-grows to fill available space */}
          <div className="flex flex-1 flex-col">
            <Label htmlFor="campaign-premise">Premise</Label>
            <Textarea
              id="campaign-premise"
              className="flex-1"
              style={{ minHeight: "clamp(100px, 8vw, 180px)" }}
              value={w.campaignPremise}
              onChange={(event) => w.setCampaignPremise(event.target.value)}
              placeholder={
                w.hasWorldbook
                  ? "Describe your world (optional when selected worldbooks already carry context)..."
                  : "Describe your world: setting, tone, tensions, and what makes this campaign distinct."
              }
            />
          </div>

          <div>
            <Label htmlFor="campaign-franchise">
              Franchise / IP{" "}
              <span className="font-normal text-zinc-600">optional</span>
            </Label>
            <Input
              id="campaign-franchise"
              value={w.campaignFranchise}
              onChange={(event) => w.setCampaignFranchise(event.target.value)}
              placeholder="e.g. The Witcher, Naruto, Star Wars..."
            />
          </div>

          {/* Research toggle row */}
          <div className="flex items-center justify-between">
            <Label htmlFor="research-toggle" className="mb-0">Research Mode</Label>
            <Switch
              id="research-toggle"
              checked={w.researchEnabled}
              onCheckedChange={w.setResearchEnabled}
            />
          </div>
        </div>

        {/* Right column: sources sidebar */}
        <div className="flex flex-col" style={{ gap: "clamp(16px, 1.2vw, 24px)" }}>
          <div
            className="shrink-0 font-semibold uppercase tracking-[0.08em] text-zinc-600"
            style={{ fontSize: "clamp(11px, 0.7vw, 14px)" }}
          >
            Sources
          </div>

          {w.worldbookLibraryLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading worldbooks...
            </div>
          ) : w.worldbookLibrary.length > 0 ? (
            <div>
              {w.worldbookLibrary.map((item) => {
                const selected = selectedWorldbookIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`flex w-full items-center justify-between border-b border-white/[0.06] transition-colors last:border-b-0 hover:bg-white/[0.04] ${
                      selected ? "bg-[rgba(230,62,0,0.06)]" : ""
                    }`}
                    style={{ padding: "clamp(8px, 0.6vw, 14px) clamp(10px, 0.8vw, 14px)" }}
                    onClick={() => w.toggleWorldbookSelection(item)}
                  >
                    <div className="text-left">
                      <div
                        className="font-medium text-zinc-100"
                        style={{ fontSize: "clamp(13px, 0.9vw, 16px)" }}
                      >
                        {item.displayName}
                      </div>
                      <div
                        className="text-zinc-600"
                        style={{ fontSize: "clamp(11px, 0.75vw, 14px)", marginTop: "2px" }}
                      >
                        {item.entryCount} entries
                      </div>
                    </div>
                    <div
                      className="shrink-0 rounded-[5px] border-2"
                      style={{
                        width: "clamp(16px, 1.1vw, 20px)",
                        height: "clamp(16px, 1.1vw, 20px)",
                        borderColor: selected ? "#e63e00" : "rgba(255,255,255,0.15)",
                        background: selected ? "#e63e00" : "transparent",
                      }}
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-zinc-500">
              No reusable worldbooks yet. Import from the library page.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost" size="sm" className="self-start">
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
              <span
                className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-transparent text-sm font-medium text-zinc-400 transition-colors hover:bg-white/[0.05]"
                style={{
                  height: "clamp(30px, 2vw, 38px)",
                  padding: "0 clamp(10px, 0.8vw, 16px)",
                }}
              >
                <Plus className="h-4 w-4" />
                Import Worldbook
              </span>
            </label>
          </div>

          {w.worldbookError ? <p className="text-sm text-red-500">{w.worldbookError}</p> : null}
        </div>
      </div>

      {/* Footer bar */}
      <div className="mt-auto flex shrink-0 items-center justify-between border-t border-white/[0.06]" style={{ padding: "clamp(12px, 1vw, 20px) 0" }}>
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost">
            <Link href="/">Cancel</Link>
          </Button>
          {conceptValidationMessage ? (
            <span className="text-xs text-red-500">{conceptValidationMessage}</span>
          ) : null}
          {activeProgressLabel ? (
            <span className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {activeProgressLabel}
              {activeProgressStep ? <span>{activeProgressStep}</span> : null}
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
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
  );
}
