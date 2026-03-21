"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchSettings } from "@/lib/api";
import { createDefaultSettings, getErrorMessage } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { NewCampaignDialog } from "@/components/title/new-campaign-dialog";
import { LoadCampaignDialog } from "@/components/title/load-campaign-dialog";
import { useNewCampaignWizard } from "@/components/title/use-new-campaign-wizard";
import type { Settings } from "@/lib/types";

export default function TitleScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchSettings()
      .then((loaded) => {
        if (!cancelled) {
          setSettings(loaded);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSettings(createDefaultSettings());
          toast.error("Failed to load settings", {
            description: getErrorMessage(error, "Unknown API error."),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const wizard = useNewCampaignWizard(settings, () => { });

  return (
    <>
      <main className="flex min-h-screen flex-col items-center justify-center gap-16">
        <div className="flex flex-col items-center gap-4">
          <h1 className="font-serif text-6xl font-bold tracking-wide text-bone sm:text-7xl">
            WorldForge
          </h1>
          <p className="text-sm tracking-[0.25em] uppercase text-muted-foreground">
            AI-Driven Text RPG Sandbox
          </p>
        </div>

        <nav className="flex flex-col gap-3 w-64">
          <NewCampaignDialog wizard={wizard} />
          <LoadCampaignDialog onLoaded={() => { }} />

          <Button
            variant="secondary"
            size="lg"
            className="w-full text-base tracking-wide"
            asChild
          >
            <Link href="/settings">Settings</Link>
          </Button>
        </nav>
      </main>

      {wizard.isGenerating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            {wizard.generationProgress ? (
              <>
                <p className="text-sm font-medium text-bone">
                  {wizard.generationProgress.label}...
                </p>
                <p className="text-xs text-muted-foreground">
                  Step {wizard.generationProgress.step} of{" "}
                  {wizard.generationProgress.totalSteps}
                </p>
              </>
            ) : (
              <p className="text-sm font-medium text-bone">Starting generation...</p>
            )}
            <p className="max-w-xs text-center text-xs text-muted-foreground">
              This may take 15-60 seconds depending on the model.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
