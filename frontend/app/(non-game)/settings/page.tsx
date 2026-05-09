"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { getErrorMessage } from "@/lib/settings";
import { useSettings } from "@/lib/use-settings";
import type { Settings } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProvidersTab } from "@/components/settings/providers-tab";
import { RolesTab } from "@/components/settings/roles-tab";
import { ImagesTab } from "@/components/settings/images-tab";
import { GameplayTab } from "@/components/settings/gameplay-tab";
import { ResearchTab } from "@/components/settings/research-tab";

export default function SettingsPage() {
  const { settings, setSettings, isLoading, isSaving, save, loadError } = useSettings();
  const lastPersistedRef = useRef<string | null>(null);

  const safeSetSettings: Dispatch<SetStateAction<Settings>> = (next) => {
    setSettings((current) => {
      const resolved = typeof next === "function"
        ? (next as (current: Settings) => Settings | undefined)(current)
        : next;
      return resolved ?? current;
    });
  };

  useEffect(() => {
    if (isLoading || loadError) {
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
  }, [isLoading, loadError, save, settings]);

  if (isLoading) {
    return (
      <div className="wf-v4-page">
        <div className="wf-v4-card flex items-center gap-2 p-6 text-sm text-[var(--fg-2)]">
        Loading settings...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="wf-v4-page">
        <div className="wf-v4-card border-destructive/30 bg-destructive/5 p-6">
          <p className="text-sm font-medium text-destructive">Failed to load settings</p>
          <p className="mt-1 text-sm text-[var(--fg-2)]">{loadError}</p>
          <p className="mt-2 text-xs text-[var(--fg-3)]">
            The page is read-blocked to avoid overwriting your persisted provider configuration with defaults.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wf-settings-page wf-v4-page-theater">
      <Tabs defaultValue="providers" className="wf-settings-tabs min-h-0">
        <div className="wf-settings-nav-row">
          <TabsList className="wf-settings-rail h-auto bg-transparent p-0">
            <TabsTrigger value="providers" className="wf-settings-tab flex-none px-3">Providers</TabsTrigger>
            <TabsTrigger value="roles" className="wf-settings-tab flex-none px-3">Roles</TabsTrigger>
            <TabsTrigger value="images" className="wf-settings-tab flex-none px-3">Images</TabsTrigger>
            <TabsTrigger value="gameplay" className="wf-settings-tab flex-none px-3">Gameplay</TabsTrigger>
            <TabsTrigger value="research" className="wf-settings-tab flex-none px-3">Research</TabsTrigger>
          </TabsList>

          <div className="wf-settings-save">
            <span />
            {isSaving ? "Saving" : "Saved"}
          </div>
        </div>

        <div className="wf-settings-content py-[clamp(32px,2.8vw,64px)]">
          <TabsContent value="providers" className="mt-0">
            <ProvidersTab settings={settings} setSettings={safeSetSettings} />
          </TabsContent>
          <TabsContent value="roles" className="mt-0">
            <RolesTab settings={settings} setSettings={safeSetSettings} />
          </TabsContent>
          <TabsContent value="images" className="mt-0">
            <ImagesTab settings={settings} setSettings={safeSetSettings} />
          </TabsContent>
          <TabsContent value="gameplay" className="mt-0">
            <GameplayTab settings={settings} setSettings={safeSetSettings} />
          </TabsContent>
          <TabsContent value="research" className="mt-0">
            <ResearchTab settings={settings} setSettings={safeSetSettings} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
