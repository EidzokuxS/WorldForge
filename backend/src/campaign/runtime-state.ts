import type { TurnSnapshot } from "../engine/state-snapshot.js";

const lastTurnSnapshots = new Map<string, TurnSnapshot>();
const lastTurnSnapshotMetadata = new Map<string, {
  acceptedDurableEventIds: string[];
  producedDurableEventIds: string[];
}>();
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

export function hasAnyActiveTurn(): boolean {
  return campaignsWithActiveTurn.size > 0;
}

export function setLastTurnSnapshot(
  campaignId: string,
  snapshot: TurnSnapshot,
  metadata?: {
    acceptedDurableEventIds?: readonly string[];
    producedDurableEventIds?: readonly string[];
  },
): void {
  lastTurnSnapshots.set(campaignId, snapshot);
  lastTurnSnapshotMetadata.set(campaignId, {
    acceptedDurableEventIds: [...new Set(metadata?.acceptedDurableEventIds ?? [])],
    producedDurableEventIds: [...new Set(metadata?.producedDurableEventIds ?? [])],
  });
}

export function getLastTurnSnapshot(
  campaignId: string,
): TurnSnapshot | undefined {
  return lastTurnSnapshots.get(campaignId);
}

export function getLastTurnSnapshotMetadata(
  campaignId: string,
): {
  acceptedDurableEventIds: string[];
  producedDurableEventIds: string[];
} {
  return lastTurnSnapshotMetadata.get(campaignId) ?? {
    acceptedDurableEventIds: [],
    producedDurableEventIds: [],
  };
}

export function clearLastTurnSnapshot(campaignId: string): void {
  lastTurnSnapshots.delete(campaignId);
  lastTurnSnapshotMetadata.delete(campaignId);
}

export function hasLiveTurnSnapshot(campaignId: string): boolean {
  return lastTurnSnapshots.has(campaignId);
}

export function clearCampaignRuntimeState(campaignId: string): void {
  campaignsWithActiveTurn.delete(campaignId);
  lastTurnSnapshots.delete(campaignId);
  lastTurnSnapshotMetadata.delete(campaignId);
}
