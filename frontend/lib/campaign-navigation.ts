import { loadCampaignPlayState } from "@/lib/campaign-play-api";
import { loadCampaignWorldState } from "@/lib/campaign-world-api";

export type CampaignDestination =
  | `/campaign/${string}/forge`
  | `/campaign/${string}/review`
  | `/campaign/${string}/character`
  | `/campaign/${string}/play`;

function campaignDestination(campaignId: string, surface: "forge" | "review" | "character" | "play"): CampaignDestination {
  return `/campaign/${campaignId}/${surface}`;
}

/** Resolves the next player surface from persisted Campaign World and Campaign Play state. */
export async function loadCampaignDestination(campaignId: string): Promise<CampaignDestination> {
  const worldState = await loadCampaignWorldState(campaignId);

  switch (worldState.status) {
    case "unbuilt":
    case "building":
    case "failed":
      return campaignDestination(campaignId, "forge");
    case "review":
      return campaignDestination(campaignId, "review");
    case "accepted": {
      const playState = await loadCampaignPlayState(campaignId);
      return playState.phase === "character_required"
        ? campaignDestination(campaignId, "character")
        : campaignDestination(campaignId, "play");
    }
  }
}
