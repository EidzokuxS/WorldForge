import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CampaignPlayStageEffect, CampaignPlayState } from "@worldforge/shared";
import { describe, expect, it } from "vitest";

import { CampaignPlayStage } from "./CampaignPlayStage";

function readyState(
  narrationId = "narration-1",
  effect: CampaignPlayStageEffect["kind"] = "fade",
): CampaignPlayState {
  return {
    campaignId: "campaign-1",
    phase: "ready",
    acceptedWorldVersion: 2,
    worldVersion: 3,
    runtimeRevision: 4,
    character: { name: "Mara", monogram: "M", descriptor: "Cartographer", accent: "amber" },
    openingOptions: [],
    currentLocation: { handle: "location-1", name: "Signal Yard", description: "Rain ticks on dead rails." },
    visibleActors: [],
    visibleRoutes: [],
    visiblePressures: [],
    possessions: [],
    obligations: [],
    narration: {
      narrationId,
      turnId: `turn-${narrationId}`,
      beats: [{ beatId: `beat-${narrationId}`, text: "The signal wakes." }],
      displayText: "The signal wakes.",
      suggestedActions: [],
      effects: [{ kind: effect, beatId: `beat-${narrationId}` }],
      createdAt: 100,
    },
    consequences: [],
    activeTurn: null,
    journalCursor: 0,
    projectionHash: "a".repeat(64),
  };
}

describe("CampaignPlayStage", () => {
  it("hydrates a settled artifact without replaying its effect", () => {
    const { container } = render(<CampaignPlayStage state={readyState()} />);
    expect(screen.getByRole("heading", { name: "Signal Yard" })).toBeInTheDocument();
    expect(screen.getByText("Mara")).toBeInTheDocument();
    expect(screen.getByText("Cartographer")).toBeInTheDocument();
    expect(container.querySelector(".campaign-play-stage")).not.toHaveAttribute("data-effects");
  });

  it("plays a newly accepted artifact once, retriggers the same kind, and suppresses it after remount", async () => {
    const { container, rerender, unmount } = render(<CampaignPlayStage state={readyState()} />);
    rerender(<CampaignPlayStage state={readyState("narration-2", "fade")} />);
    await waitFor(() => expect(container.querySelector(".campaign-play-stage")).toHaveAttribute("data-effects", "fade"));
    const firstLayer = container.querySelector('.campaign-play-effect-layer[data-effect="fade"]');
    rerender(<CampaignPlayStage state={readyState("narration-3", "fade")} />);
    await waitFor(() => expect(container.querySelector('.campaign-play-effect-layer[data-effect="fade"]')).not.toBe(firstLayer));
    unmount();

    const remounted = render(<CampaignPlayStage state={readyState("narration-3", "fade")} />);
    expect(remounted.container.querySelector(".campaign-play-stage")).not.toHaveAttribute("data-effects");
  });

  it("presents every effect bound to one beat and clears them on the next beat", async () => {
    const nextState = readyState("narration-2", "flash");
    nextState.narration!.beats = [
      { beatId: "beat-first", text: "The signal wakes." },
      { beatId: "beat-second", text: "White light crosses the rain." },
      { beatId: "beat-third", text: "The yard settles." },
    ];
    nextState.narration!.effects = [
      { kind: "flash", beatId: "beat-second" },
      { kind: "danger", beatId: "beat-second" },
    ];
    const { container, rerender } = render(<CampaignPlayStage state={readyState()} />);
    rerender(<CampaignPlayStage state={nextState} />);

    expect(container.querySelector(".campaign-play-stage")).not.toHaveAttribute("data-effects");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(container.querySelector(".campaign-play-stage")).toHaveAttribute("data-effects", "flash danger"));
    expect(container.querySelector('.campaign-play-effect-layer[data-effect="flash"]')).toBeInTheDocument();
    expect(container.querySelector('.campaign-play-effect-layer[data-effect="danger"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(container.querySelector(".campaign-play-stage")).not.toHaveAttribute("data-effects"));
  });

  it("distinguishes an artifact effect from a beat whose ID is artifact", async () => {
    const nextState = readyState("narration-2", "fade");
    nextState.narration!.beats = [
      { beatId: "beat-first", text: "The signal wakes." },
      { beatId: "artifact", text: "The rails answer." },
    ];
    nextState.narration!.effects = [
      { kind: "fade", beatId: null },
      { kind: "fade", beatId: "artifact" },
    ];
    const { container, rerender } = render(<CampaignPlayStage state={readyState()} />);
    rerender(<CampaignPlayStage state={nextState} />);
    await waitFor(() => expect(container.querySelector(".campaign-play-stage")).toHaveAttribute("data-effects", "fade"));
    const artifactLayer = container.querySelector('.campaign-play-effect-layer[data-effect="fade"]');

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(container.querySelector('.campaign-play-effect-layer[data-effect="fade"]')).not.toBe(artifactLayer));
  });
});
