"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/settings";
import { useSettings } from "@/lib/use-settings";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProvidersTab } from "@/components/settings/providers-tab";
import { RolesTab } from "@/components/settings/roles-tab";
import { ImagesTab } from "@/components/settings/images-tab";
import { ResearchTab } from "@/components/settings/research-tab";

export default function SettingsPage() {
  const { settings, setSettings, isLoading, isSaving, save } = useSettings();
  const lastPersistedRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const serialized = JSON.stringify(settings);
    if (lastPersistedRef.current === null) {
      lastPersistedRef.current = serialized;
      return;
    }
    if (serialized === lastPersistedRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void save(settings)
        .then((saved) => {
          lastPersistedRef.current = JSON.stringify(saved);
        })
        .catch((error) => {
          toast.error("Failed to save settings", {
            description:
              getErrorMessage(error, "Unknown API error."),
          });
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isLoading, save, settings]);

  const providerById = useMemo(() => {
    return new Map(settings.providers.map((p) => [p.id, p]));
  }, [settings.providers]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-bold tracking-wide text-bone">
            Settings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure providers, role models, and image generation defaults.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSaving ? "Saving changes..." : "Changes are saved automatically."}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Title
          </Link>
        </Button>
      </header>

      <Tabs defaultValue="providers" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          <ProvidersTab settings={settings} setSettings={setSettings} />
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <RolesTab settings={settings} setSettings={setSettings} />
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          <ImagesTab settings={settings} setSettings={setSettings} />
        </TabsContent>

        <TabsContent value="research" className="space-y-4">
          <ResearchTab settings={settings} setSettings={setSettings} />
        </TabsContent>
      </Tabs>

      <footer className="pb-2 text-xs text-muted-foreground">
        Active providers: {settings.providers.length} · Judge:{" "}
        {providerById.get(settings.judge.providerId)?.name ?? "Unknown"} ·
        Storyteller:{" "}
        {providerById.get(settings.storyteller.providerId)?.name ?? "Unknown"} ·
        Generator:{" "}
        {providerById.get(settings.generator.providerId)?.name ?? "Unknown"} ·
        Embedder:{" "}
        {providerById.get(settings.embedder.providerId)?.name ?? "Unknown"}
      </footer>
    </main>
  );
}

