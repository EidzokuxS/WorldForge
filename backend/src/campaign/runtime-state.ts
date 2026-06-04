import type { TurnSnapshot } from "../engine/state-snapshot.js";

const lastTurnSnapshots = new Map<string, TurnSnapshot>();
export interface LastTurnSnapshotMetadata {
  acceptedDurableEventIds: string[];
  producedDurableEventIds: string[];
  playerAction: string | null;
  chatHistoryLengthBeforeTurn: number | null;
  chatHistoryLengthAfterTurn: number | null;
}

const EMPTY_LAST_TURN_SNAPSHOT_METADATA: LastTurnSnapshotMetadata = {
  acceptedDurableEventIds: [],
  producedDurableEventIds: [],
  playerAction: null,
  chatHistoryLengthBeforeTurn: null,
  chatHistoryLengthAfterTurn: null,
};

const lastTurnSnapshotMetadata = new Map<string, LastTurnSnapshotMetadata>();
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
    playerAction?: string | null;
    chatHistoryLengthBeforeTurn?: number | null;
    chatHistoryLengthAfterTurn?: number | null;
  },
): void {
  lastTurnSnapshots.set(campaignId, snapshot);
  lastTurnSnapshotMetadata.set(campaignId, {
    acceptedDurableEventIds: [...new Set(metadata?.acceptedDurableEventIds ?? [])],
    producedDurableEventIds: [...new Set(metadata?.producedDurableEventIds ?? [])],
    playerAction: metadata?.playerAction ?? null,
    chatHistoryLengthBeforeTurn: metadata?.chatHistoryLengthBeforeTurn ?? null,
    chatHistoryLengthAfterTurn: metadata?.chatHistoryLengthAfterTurn ?? null,
  });
}

export function getLastTurnSnapshot(
  campaignId: string,
): TurnSnapshot | undefined {
  return lastTurnSnapshots.get(campaignId);
}

export function getLastTurnSnapshotMetadata(
  campaignId: string,
): LastTurnSnapshotMetadata {
  return lastTurnSnapshotMetadata.get(campaignId) ?? EMPTY_LAST_TURN_SNAPSHOT_METADATA;
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
