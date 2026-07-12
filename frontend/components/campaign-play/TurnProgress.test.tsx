import { fireEvent, render, screen } from "@testing-library/react";
import type { CampaignPlayPublicProgress, CampaignPlayPublicTurn } from "@worldforge/shared";
import { describe, expect, it, vi } from "vitest";

import { TurnProgress } from "./TurnProgress";

function turn(overrides: Partial<CampaignPlayPublicTurn> = {}): CampaignPlayPublicTurn {
  return {
    turnId: "turn-hidden",
    turnKind: "player_action",
    status: "processing",
    progress: "interpreting",
    lastEventSequence: 1,
    retryEligible: false,
    submittedAt: 10,
    completedAt: null,
    ...overrides,
  };
}

describe("TurnProgress", () => {
  it.each<[CampaignPlayPublicProgress, string]>([
    ["interpreting", "Reading your action"],
    ["settling", "Applying the result"],
    ["world_acting", "The world is moving"],
    ["revealing", "Finding what reaches you"],
    ["narrating", "Writing the moment"],
  ])("announces %s as %s", (progress, label) => {
    render(<TurnProgress accepted={false} connection="connected" onResume={vi.fn()} pendingResume={false} progress={progress} turn={turn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });

  it("announces transport loss without claiming interruption", () => {
    render(<TurnProgress accepted={false} connection="disconnected" onResume={vi.fn()} pendingResume={false} progress="settling" turn={turn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Connection lost. The turn may still be running.");
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("offers explicit resume only for a durable eligible interruption", () => {
    const onResume = vi.fn();
    render(<TurnProgress
      accepted={false}
      connection="idle"
      onResume={onResume}
      pendingResume={false}
      progress={null}
      turn={turn({ status: "interrupted", progress: null, retryEligible: true })}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledOnce();
    expect(screen.getByText("The turn stopped before it finished.")).toBeInTheDocument();
  });
});
