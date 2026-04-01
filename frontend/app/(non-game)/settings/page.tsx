"use client";

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { getErrorMessage } from "@/lib/settings";
import { useSettings } from "@/lib/use-settings";
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
            description: getErrorMessage(error, "Unknown API error."),
          });
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isLoading, save, settings]);

  const providerById = useMemo(() => {
    return new Map(settings.providers.map((provider) => [provider.id, provider]));
  }, [settings.providers]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading settings...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-muted/20 px-4 py-4">
        <p className="text-sm font-medium text-bone">Save state</p>
        <p className="text-xs text-muted-foreground">
          {isSaving ? "Saving changes..." : "Changes are saved automatically."}
        </p>
      </div>

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

      <div className="rounded-3xl border border-border/70 bg-card/80 px-4 py-4 text-xs text-muted-foreground">
        Active providers: {settings.providers.length} · Judge: {providerById.get(settings.judge.providerId)?.name ?? "Unknown"} · Storyteller: {providerById.get(settings.storyteller.providerId)?.name ?? "Unknown"} · Generator: {providerById.get(settings.generator.providerId)?.name ?? "Unknown"} · Embedder: {providerById.get(settings.embedder.providerId)?.name ?? "Unknown"}
      </div>
    </div>
  );
}
