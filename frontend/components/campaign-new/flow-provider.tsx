"use client";

import * as React from "react";

import { fetchSettings } from "@/lib/api";
import { createDefaultSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";
import { useNewCampaignWizard } from "@/components/title/use-new-campaign-wizard";
import {
  clearCampaignNewFlowSession,
  isCampaignNewFlowSessionEmpty,
  readCampaignNewFlowSession,
  writeCampaignNewFlowSession,
} from "@/components/campaign-new/flow-session";

type CampaignNewFlowValue = ReturnType<typeof useNewCampaignWizard> & {
  settings: Settings | null;
  settingsLoading: boolean;
};

const CampaignNewFlowContext = React.createContext<CampaignNewFlowValue | null>(null);

export function CampaignNewFlowProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [settingsLoading, setSettingsLoading] = React.useState(true);
  const [initialSession] = React.useState(() => readCampaignNewFlowSession());
  const wizard = useNewCampaignWizard(settings, () => {}, { initialSession });

  React.useEffect(() => { setMounted(true); }, []);

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

  React.useEffect(() => {
    const phase =
      wizard.suggestingCategory
        ? { kind: "suggesting-category" as const, category: wizard.suggestingCategory }
        : wizard.isSuggesting
          ? { kind: "suggesting-all" as const }
          : wizard.isGenerating
            ? { kind: "generating" as const }
            : wizard.creatingCampaign
              ? { kind: "creating" as const }
              : { kind: "idle" as const };

    const session = {
      version: 1 as const,
      campaignName: wizard.campaignName,
      campaignPremise: wizard.campaignPremise,
      campaignFranchise: wizard.campaignFranchise,
      researchEnabled: wizard.researchEnabled,
      selectedWorldbooks: wizard.selectedWorldbooks,
      dnaState: wizard.dnaState,
      step: wizard.step,
      phase,
      generationProgress: wizard.generationProgress,
    };

    if (isCampaignNewFlowSessionEmpty(session)) {
      clearCampaignNewFlowSession();
      return;
    }

    writeCampaignNewFlowSession(session);
  }, [
    wizard.campaignFranchise,
    wizard.campaignName,
    wizard.campaignPremise,
    wizard.creatingCampaign,
    wizard.dnaState,
    wizard.generationProgress,
    wizard.isGenerating,
    wizard.isSuggesting,
    wizard.researchEnabled,
    wizard.selectedWorldbooks,
    wizard.step,
    wizard.suggestingCategory,
  ]);

  const value = React.useMemo(
    () => ({
      ...wizard,
      settings,
      settingsLoading,
    }),
    [settings, settingsLoading, wizard],
  );

  if (!mounted) {
    return null;
  }

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
