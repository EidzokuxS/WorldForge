"use client";

import { Loader2, Plus, Sparkles, Wand2 } from "lucide-react";
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
              <DialogTitle>Create Campaign — Concept</DialogTitle>
              <DialogDescription>
                Name your campaign and define the world tone, themes, and starting
                premise.
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
                  placeholder="Describe your world: setting, tone, key themes..."
                  rows={6}
                />
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
              <DialogTitle>Create Campaign — World DNA</DialogTitle>
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
