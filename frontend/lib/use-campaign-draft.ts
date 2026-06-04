"use client";

import { useCallback, useState } from "react";

export interface CampaignDraftState {
  draft: string;
  setDraft: (draft: string) => void;
  clearDraft: () => void;
}

const STORAGE_PREFIX = "worldforge:game:draft:";
const MEMORY_DRAFT_KEY = "__memory__";

export function useCampaignDraft(campaignId: string | null): CampaignDraftState {
  const [draftByCampaign, setDraftByCampaign] = useState<Record<string, string>>({});
  const draftKey = campaignId ?? MEMORY_DRAFT_KEY;
  const draft = draftByCampaign[draftKey] ?? readStoredDraft(campaignId);

  const setDraft = useCallback(
    (nextDraft: string) => {
      setDraftByCampaign((current) => ({
        ...current,
        [draftKey]: nextDraft,
      }));

      if (!campaignId || typeof window === "undefined") {
        return;
      }

      try {
        if (nextDraft.length > 0) {
          window.localStorage.setItem(getDraftKey(campaignId), nextDraft);
        } else {
          window.localStorage.removeItem(getDraftKey(campaignId));
        }
      } catch {
        // The controlled draft stays usable even when browser storage is unavailable.
      }
    },
    [campaignId, draftKey],
  );

  const clearDraft = useCallback(() => {
    setDraftByCampaign((current) => ({
      ...current,
      [draftKey]: "",
    }));

    if (!campaignId || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.removeItem(getDraftKey(campaignId));
    } catch {
      // Clearing the in-memory draft is still sufficient for the current render.
    }
  }, [campaignId, draftKey]);

  return { draft, setDraft, clearDraft };
}

function getDraftKey(campaignId: string): string {
  return `${STORAGE_PREFIX}${campaignId}`;
}

function readStoredDraft(campaignId: string | null): string {
  if (!campaignId || typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(getDraftKey(campaignId)) ?? "";
  } catch {
    return "";
  }
}
