"use client";

import * as React from "react";

import { fetchSettings } from "@/lib/api";
import { createDefaultSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";
import { useNewCampaignWizard } from "@/components/title/use-new-campaign-wizard";

type CampaignNewFlowValue = ReturnType<typeof useNewCampaignWizard> & {
  settings: Settings | null;
  settingsLoading: boolean;
};

const CampaignNewFlowContext = React.createContext<CampaignNewFlowValue | null>(null);

export function CampaignNewFlowProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [settingsLoading, setSettingsLoading] = React.useState(true);
  const wizard = useNewCampaignWizard(settings, () => {});

  React.useEffect(() => {
    let cancelled = false;

    void fetchSettings()
      .then((loaded) => {
        if (!cancelled) {
          setSettings(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettings(createDefaultSettings());
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSettingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    wizard.handleOpenChange(true);
  }, []);

  const value = React.useMemo(
    () => ({
      ...wizard,
      settings,
      settingsLoading,
    }),
    [settings, settingsLoading, wizard],
  );

  return (
    <CampaignNewFlowContext.Provider value={value}>
      {children}
    </CampaignNewFlowContext.Provider>
  );
}

export function useCampaignNewFlow() {
  const context = React.useContext(CampaignNewFlowContext);
  if (!context) {
    throw new Error("Campaign new flow must be used inside CampaignNewFlowProvider.");
  }
  return context;
}
