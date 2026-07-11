"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { getActiveCampaign, loadCampaign, type CampaignMeta } from "@/lib/api";
import {
  loadCampaignWorldState,
  type CampaignWorldStateResponse,
} from "@/lib/campaign-world-api";

interface CampaignStatusValue {
  campaignId: string | null;
  campaign: CampaignMeta | null;
  worldState: CampaignWorldStateResponse | null;
  loading: boolean;
  refreshCampaignWorldState: () => Promise<CampaignWorldStateResponse | null>;
}

const CampaignStatusContext = createContext<CampaignStatusValue | null>(null);

function getRouteCampaignId(pathname: string): string | null {
  const segments = pathname.split("/");
  if (segments[1] !== "campaign" || !segments[2] || segments[2] === "new") return null;
  return segments[2];
}

export function CampaignStatusProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeCampaignId = useMemo(() => getRouteCampaignId(pathname), [pathname]);
  const [campaign, setCampaign] = useState<CampaignMeta | null>(null);
  const [worldState, setWorldState] = useState<CampaignWorldStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const currentCampaignId = routeCampaignId ?? campaign?.id ?? null;

  const refreshCampaignWorldState = useCallback(async () => {
    if (!currentCampaignId) {
      setWorldState(null);
      return null;
    }
    const state = await loadCampaignWorldState(currentCampaignId);
    setWorldState(state);
    return state;
  }, [currentCampaignId]);

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
          setWorldState(null);
        }

        if (nextCampaign) {
          try {
            const nextWorldState = await loadCampaignWorldState(nextCampaign.id);
            if (!cancelled) setWorldState(nextWorldState);
          } catch {
            if (!cancelled) setWorldState(null);
          }
        }
      } catch {
        if (!cancelled) {
          setCampaign(null);
          setWorldState(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void resolveCampaignStatus();
    return () => {
      cancelled = true;
    };
  }, [pathname, routeCampaignId]);

  const currentCampaign = routeCampaignId
    ? campaign?.id === routeCampaignId ? campaign : null
    : campaign;

  const value = useMemo<CampaignStatusValue>(() => ({
    campaignId: currentCampaign?.id ?? routeCampaignId,
    campaign: currentCampaign,
    worldState,
    loading,
    refreshCampaignWorldState,
  }), [currentCampaign, loading, refreshCampaignWorldState, routeCampaignId, worldState]);

  return (
    <CampaignStatusContext.Provider value={value}>
      {children}
    </CampaignStatusContext.Provider>
  );
}

export function useCampaignStatus(): CampaignStatusValue {
  const value = useContext(CampaignStatusContext);
  if (!value) throw new Error("useCampaignStatus requires CampaignStatusProvider.");
  return value;
}
