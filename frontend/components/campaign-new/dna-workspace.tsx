"use client";

import { Loader2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { WORLD_DNA_CARDS, seedValueToTextarea } from "@/components/title/utils";
import { useCampaignNewFlow } from "@/components/campaign-new/flow-provider";

export function DnaWorkspace() {
  const w = useCampaignNewFlow();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/70 bg-muted/20 px-4 py-4">
        <div>
          <p className="text-sm font-medium text-bone">World DNA</p>
          <p className="text-xs text-muted-foreground">
            Source selections, IP context, and divergence interpretation are preserved from the concept route.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void w.handleResuggestAll()} disabled={w.isBusy || !w.dnaState}>
            {w.isSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Re-roll All
          </Button>
          <Button onClick={() => void w.handleCreateWithDna()} disabled={w.isBusy || !w.dnaState}>
            Create World
          </Button>
        </div>
      </div>

      {w.isSuggesting && !w.dnaState ? (
        <div className="flex items-center justify-center rounded-3xl border border-border/70 bg-card/70 px-6 py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating World DNA suggestions...
        </div>
      ) : w.dnaState ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {WORLD_DNA_CARDS.map((item) => {
            const slot = w.dnaState![item.category];
            return (
              <Card key={item.category} className="border-border/70 bg-card/80 shadow-xl shadow-black/10">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-3 text-base text-bone">
                    <span>
                      {item.emoji} {item.label}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void w.handleResuggestCategory(item.category)}
                      disabled={!slot.enabled || w.isBusy || w.suggestingCategory === item.category}
                    >
                      {w.suggestingCategory === item.category ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Re-roll"
                      )}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    value={seedValueToTextarea(slot.value)}
                    onChange={(event) => w.handleSeedTextChange(item.category, event.target.value)}
                    rows={item.category === "culturalFlavor" ? 3 : 4}
                  />
                  <p className="text-xs text-muted-foreground">
                    {slot.isCustom ? "Custom value retained across route changes." : "Suggested from current concept and selected sources."}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-border/70 bg-card/70 px-6 py-16 text-sm text-muted-foreground">
          DNA suggestions are not ready yet. Return to concept and continue when the flow is populated.
        </div>
      )}
    </div>
  );
}
