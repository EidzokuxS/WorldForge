"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CampaignMeta } from "@/lib/api";
import { getActiveCampaign, loadCampaign } from "@/lib/api";
import { usePathname } from "next/navigation";

interface CampaignStatusValue {
  campaignId: string | null;
  campaign: CampaignMeta | null;
  loading: boolean;
  generationReady: boolean;
  reviewAvailable: boolean;
  characterAvailable: boolean;
}

const defaultCampaignStatus: CampaignStatusValue = {
  campaignId: null,
  campaign: null,
  loading: false,
  generationReady: false,
  reviewAvailable: false,
  characterAvailable: false,
};

const CampaignStatusContext = createContext<CampaignStatusValue | null>(null);

function getRouteCampaignId(pathname: string): string | null {
  const match = pathname.match(/^\/campaign\/(?!new(?:\/|$))([^/]+)/);
  return match?.[1] ?? null;
}

export function CampaignStatusProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeCampaignId = useMemo(() => getRouteCampaignId(pathname), [pathname]);
  const [campaign, setCampaign] = useState<CampaignMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolveCampaignStatus() {
      setLoading(true);

      try {
        const activeCampaign = await getActiveCampaign();
        const nextCampaign = routeCampaignId
          ? activeCampaign?.id === routeCampaignId
            ? activeCampaign
            : await loadCampaign(routeCampaignId)
          : activeCampaign;

        if (!cancelled) {
          setCampaign(nextCampaign);
        }
      } catch {
        if (!cancelled) {
          setCampaign(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void resolveCampaignStatus();

    return () => {
      cancelled = true;
    };
  }, [routeCampaignId]);

  const currentCampaign =
    routeCampaignId && campaign?.id === routeCampaignId ? campaign : routeCampaignId ? null : campaign;
  const generationReady = Boolean(currentCampaign?.generationComplete);

  const value = useMemo<CampaignStatusValue>(
    () => ({
      campaignId: routeCampaignId,
      campaign: currentCampaign,
      loading,
      generationReady,
      reviewAvailable: generationReady,
      characterAvailable: generationReady,
    }),
    [currentCampaign, generationReady, loading, routeCampaignId],
  );

  return (
    <CampaignStatusContext.Provider value={value}>
      {children}
    </CampaignStatusContext.Provider>
  );
}

export function useCampaignStatus() {
  return useContext(CampaignStatusContext) ?? defaultCampaignStatus;
}
