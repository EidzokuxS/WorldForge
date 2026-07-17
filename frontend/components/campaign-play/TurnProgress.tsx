"use client";

import { forwardRef } from "react";
import type {
  CampaignPlayPublicProgress,
  CampaignPlayPublicTurn,
} from "@worldforge/shared";

export type CampaignPlayConnectionState = "idle" | "connecting" | "connected" | "disconnected";

const ACTION_PROGRESS_COPY: Record<CampaignPlayPublicProgress, string> = {
  interpreting: "Reading your action",
  settling: "Applying the result",
  world_acting: "The world is moving",
  revealing: "Finding what reaches you",
  narrating: "Writing the moment",
};

const OPENING_PROGRESS_COPY: Record<CampaignPlayPublicProgress, string> = {
  interpreting: "Preparing your arrival",
  settling: "Placing you in the world",
  world_acting: "The world is moving",
  revealing: "Finding what reaches you",
  narrating: "Writing the opening",
};

export interface TurnProgressProps {
  accepted: boolean;
  connection: CampaignPlayConnectionState;
  pendingResume: boolean;
  progress: CampaignPlayPublicProgress | null;
  turn: CampaignPlayPublicTurn | null;
  onResume: () => void;
}

export const TurnProgress = forwardRef<HTMLDivElement, TurnProgressProps>(function TurnProgress({
  accepted,
  connection,
  pendingResume,
  progress,
  turn,
  onResume,
}, ref) {
  if (turn?.status === "interrupted" && !accepted) {
    return (
      <div className="campaign-play-interruption" ref={ref} tabIndex={-1}>
        <p role="status">
          {turn.turnKind === "opening"
            ? "The opening stopped before it finished."
            : "The turn stopped before it finished."}
        </p>
        {turn.retryEligible ? (
          <button disabled={pendingResume} onClick={onResume} type="button">
            {pendingResume ? "Resuming" : "Resume"}
          </button>
        ) : null}
      </div>
    );
  }

  if (turn?.status !== "processing" && !accepted) return null;

  const label = turn === null || progress === null
    ? "Action received"
    : turn.turnKind === "opening"
      ? OPENING_PROGRESS_COPY[progress]
      : ACTION_PROGRESS_COPY[progress];
  const connectionLabel = connection === "disconnected"
    ? "Connection lost. The turn may still be running."
    : connection === "connecting"
      ? "Reconnecting to the turn."
      : "";

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="campaign-play-progress"
      data-connection={connection}
      ref={ref}
      role="status"
      tabIndex={-1}
    >
      <span aria-hidden="true" />
      <p>{label}</p>
      {connectionLabel ? <small>{connectionLabel}</small> : null}
    </div>
  );
});

export default TurnProgress;
