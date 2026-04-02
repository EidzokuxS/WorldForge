"use client";

import { useEffect, useRef } from "react";
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

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading settings...</p>;
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[clamp(12px,0.85vw,15px)] font-medium text-green-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
          {isSaving ? "Saving..." : "Saved"}
        </div>
      </div>

      <Tabs defaultValue="providers" className="flex flex-1 flex-col min-h-0 mt-[clamp(12px,1vw,20px)]">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto py-[clamp(20px,1.8vw,40px)]">
          <TabsContent value="providers" className="mt-0">
            <ProvidersTab settings={settings} setSettings={setSettings} />
          </TabsContent>
          <TabsContent value="roles" className="mt-0">
            <RolesTab settings={settings} setSettings={setSettings} />
          </TabsContent>
          <TabsContent value="images" className="mt-0">
            <ImagesTab settings={settings} setSettings={setSettings} />
          </TabsContent>
          <TabsContent value="research" className="mt-0">
            <ResearchTab settings={settings} setSettings={setSettings} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
