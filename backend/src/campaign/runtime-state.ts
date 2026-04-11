import type { TurnSnapshot } from "../engine/state-snapshot.js";

const lastTurnSnapshots = new Map<string, TurnSnapshot>();
const campaignsWithActiveTurn = new Set<string>();

export function tryBeginTurn(campaignId: string): boolean {
  if (campaignsWithActiveTurn.has(campaignId)) {
    return false;
  }

  campaignsWithActiveTurn.add(campaignId);
  return true;
}

export function endTurn(campaignId: string): void {
  campaignsWithActiveTurn.delete(campaignId);
}

export function hasActiveTurn(campaignId: string): boolean {
  return campaignsWithActiveTurn.has(campaignId);
}

export function setLastTurnSnapshot(
  campaignId: string,
  snapshot: TurnSnapshot,
): void {
  lastTurnSnapshots.set(campaignId, snapshot);
}

export function getLastTurnSnapshot(
  campaignId: string,
): TurnSnapshot | undefined {
  return lastTurnSnapshots.get(campaignId);
}

export function clearLastTurnSnapshot(campaignId: string): void {
  lastTurnSnapshots.delete(campaignId);
}

export function hasLiveTurnSnapshot(campaignId: string): boolean {
  return lastTurnSnapshots.has(campaignId);
}

export function clearCampaignRuntimeState(campaignId: string): void {
  campaignsWithActiveTurn.delete(campaignId);
  lastTurnSnapshots.delete(campaignId);
}
