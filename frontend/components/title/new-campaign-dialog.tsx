"use client";

import { BookOpen, Loader2, Plus, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { WORLD_DNA_CARDS, seedValueToTextarea } from "./utils";
import type { useNewCampaignWizard } from "./use-new-campaign-wizard";

interface NewCampaignDialogProps {
  wizard: ReturnType<typeof useNewCampaignWizard>;
}

export function NewCampaignDialog({ wizard: w }: NewCampaignDialogProps) {
  const selectedWorldbookIds = new Set(
    w.selectedWorldbooks.map((item) => item.id),
  );

  return (
    <Dialog open={w.open} onOpenChange={w.handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="w-full text-base tracking-wide">
          New Campaign
        </Button>
      </DialogTrigger>
      <DialogContent
        className={
          w.step === 2
            ? "max-h-[90vh] overflow-y-auto sm:max-w-3xl"
            : "max-h-[90vh] overflow-y-auto"
        }
        onInteractOutside={(event: Event) => event.preventDefault()}
      >
        {w.step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Create Campaign - Concept</DialogTitle>
              <DialogDescription>
                Name your campaign, define the premise, and choose any reusable
                worldbooks you want to carry into this session.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Input
                  value={w.campaignName}
                  onChange={(event) => w.setCampaignName(event.target.value)}
                  placeholder="Campaign Name"
                />
              </div>
              <div className="space-y-2">
                <Textarea
                  value={w.campaignPremise}
                  onChange={(event) => w.setCampaignPremise(event.target.value)}
                  placeholder={
                    w.hasWorldbook
                      ? "Describe your world (optional - selected worldbooks provide context)..."
                      : "Describe your world: setting, tone, key themes..."
                  }
                  rows={6}
                />
              </div>
              <div className="space-y-2">
                <Input
                  value={w.campaignFranchise}
                  onChange={(event) => w.setCampaignFranchise(event.target.value)}
                  placeholder="Franchise / IP (optional) — e.g. Naruto, Star Wars, The Witcher"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="research-toggle"
                  checked={w.researchEnabled}
                  onCheckedChange={w.setResearchEnabled}
                />
                <label htmlFor="research-toggle" className="text-sm text-muted-foreground cursor-pointer">
                  Web research {w.campaignFranchise.trim() ? "for franchise lore" : "for inspiration"}
                </label>
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <BookOpen className="h-4 w-4" />
                    <span>Knowledge Sources</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select reusable worldbooks, then add more JSON files in the
                    same session if needed. The backend remains the canonical
                    merge path.
                  </p>
                </div>

                <div className="space-y-2">
                  {w.worldbookLibraryLoading ? (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading reusable worldbooks...</span>
                    </div>
                  ) : w.worldbookLibrary.length > 0 ? (
                    <div className="grid gap-2">
                      {w.worldbookLibrary.map((item) => {
                        const selected = selectedWorldbookIds.has(item.id);
                        return (
                          <Button
                            key={item.id}
                            type="button"
                            variant={selected ? "default" : "outline"}
                            className="h-auto justify-between px-3 py-3 text-left"
                            aria-pressed={selected}
                            onClick={() => w.toggleWorldbookSelection(item)}
                            disabled={w.isBusy}
                          >
                            <span className="flex flex-col items-start">
                              <span>{item.displayName}</span>
                              <span className="text-xs opacity-80">
                                {item.entryCount} reusable entries
                              </span>
                            </span>
                            <span className="text-xs uppercase tracking-[0.18em] opacity-80">
                              {selected ? "Selected" : "Available"}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">
                      No reusable worldbooks yet. Import one below to seed the library.
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-lg border border-border/60 bg-background/80 p-3">
                  <input
                    id="worldbook-upload"
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void w.handleWorldbookUpload(file);
                      event.target.value = "";
                    }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Upload reusable source</p>
                      <p className="text-xs text-muted-foreground">
                        Upload a SillyTavern-style JSON file and store it for reuse.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById("worldbook-upload")?.click()}
                      disabled={w.isBusy}
                    >
                      <Plus className="h-4 w-4" />
                      Add Worldbook JSON
                    </Button>
                  </div>

                  <div
                    role="button"
                    tabIndex={0}
                    className={`rounded-lg border-2 border-dashed border-border/50 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground${
                      w.isBusy ? " pointer-events-none opacity-50" : ""
                    }`}
                    onClick={() => document.getElementById("worldbook-upload")?.click()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        document.getElementById("worldbook-upload")?.click();
                      }
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const file = event.dataTransfer.files[0];
                      if (file && file.name.endsWith(".json")) {
                        void w.handleWorldbookUpload(file);
                      }
                    }}
                  >
                    Drop a JSON file here or click to import it into the reusable library.
                  </div>

                  {w.worldbookStatus === "importing" && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Importing reusable worldbook...</span>
                    </div>
                  )}
                  {w.worldbookStatus === "done" && (
                    <p className="text-sm text-emerald-600">
                      Worldbook imported and selected for this campaign.
                    </p>
                  )}
                  {w.worldbookError && (
                    <p className="text-sm text-destructive">{w.worldbookError}</p>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => w.handleOpenChange(false)}
                disabled={w.isBusy}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => void w.handleCreateWithSeeds()}
                disabled={!w.canCreate}
              >
                {w.creatingCampaign ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create World
              </Button>
              <Button
                onClick={() => void w.handleNextToDna()}
                disabled={!w.canCreate}
              >
                Next &rarr; World DNA
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create Campaign - World DNA</DialogTitle>
              <DialogDescription>
                AI-generated constraints based on your premise. Toggle categories,
                edit freely, and keep only what fits your vision.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Custom-edited fields stay untouched on Re-roll All.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => void w.handleResuggestAll()}
                  disabled={w.isBusy || !w.dnaState}
                >
                  {w.isSuggesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Re-roll All
                </Button>
              </div>

              {w.isSuggesting && !w.dnaState ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating World DNA suggestions...
                </div>
              ) : w.dnaState ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {WORLD_DNA_CARDS.map((item) => {
                    const slot = w.dnaState![item.category];
                    const cardClass = slot.enabled
                      ? "border-border/70"
                      : "border-border/70 opacity-50";

                    return (
                      <Card key={item.category} className={cardClass}>
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={slot.enabled}
                                onCheckedChange={(checked: boolean) =>
                                  w.handleSeedToggle(item.category, checked)
                                }
                                disabled={w.creatingCampaign}
                              />
                              <span>
                                {item.emoji} {item.label}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-base"
                              onClick={() =>
                                void w.handleResuggestCategory(item.category)
                              }
                              disabled={
                                !slot.enabled ||
                                w.isBusy ||
                                w.suggestingCategory === item.category
                              }
                              title={`Re-suggest ${item.label}`}
                            >
                              {w.suggestingCategory === item.category ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "\uD83C\uDFB2"
                              )}
                            </Button>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <Textarea
                            value={seedValueToTextarea(slot.value)}
                            onChange={(event) =>
                              w.handleSeedTextChange(item.category, event.target.value)
                            }
                            disabled={!slot.enabled || w.creatingCampaign}
                            rows={item.category === "culturalFlavor" ? 3 : 4}
                          />
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                              {item.category === "culturalFlavor"
                                ? "Use comma-separated values."
                                : "1-2 concise sentences recommended."}
                            </p>
                            {slot.isCustom ? (
                              <span className="text-xs text-mystic">Custom</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Suggested
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-sm text-muted-foreground">
                  Suggestions unavailable. You can go back and retry.
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => w.setStep(1)}
                disabled={w.isBusy}
              >
                Back
              </Button>
              <Button
                onClick={() => void w.handleCreateWithDna()}
                disabled={w.isBusy || !w.dnaState}
              >
                {w.creatingCampaign ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Create World
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
