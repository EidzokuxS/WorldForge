import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NarrationDock } from "../narration-dock";
import type { DisplayBeat } from "../types";

describe("NarrationDock", () => {
  const beats: DisplayBeat[] = [
    {
      id: "beat-1",
      kind: "narration",
      text: "Rain beads across the platform edge.",
    },
    {
      id: "beat-2",
      kind: "dialogue",
      speaker: "Nobara",
      text: "Do you hear that?",
    },
    {
      id: "beat-3",
      kind: "state_change",
      text: "The exit gate locks behind you.",
    },
  ];

  const defaultProps = {
    beats,
    currentBeatIndex: 0,
    isAutoPlaying: false,
    onNextBeat: vi.fn(),
    onToggleAuto: vi.fn(),
    onOpenLog: vi.fn(),
  };

  it("renders only the current beat by default, not full message history", () => {
    render(<NarrationDock {...defaultProps} currentBeatIndex={1} />);

    expect(screen.getByText("Nobara")).toBeInTheDocument();
    expect(screen.getByText("Do you hear that?")).toBeInTheDocument();
    expect(screen.queryByText("Rain beads across the platform edge.")).not.toBeInTheDocument();
    expect(screen.queryByText("The exit gate locks behind you.")).not.toBeInTheDocument();
  });

  it("keeps Next, Auto, and Log as local callback controls", async () => {
    const user = userEvent.setup();
    const onNextBeat = vi.fn();
    const onToggleAuto = vi.fn();
    const onOpenLog = vi.fn();

    render(
      <NarrationDock
        {...defaultProps}
        onNextBeat={onNextBeat}
        onToggleAuto={onToggleAuto}
        onOpenLog={onOpenLog}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onNextBeat).toHaveBeenCalledOnce();
    expect(onToggleAuto).not.toHaveBeenCalled();
    expect(onOpenLog).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Auto" }));
    expect(onToggleAuto).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Log" }));
    expect(onOpenLog).toHaveBeenCalledOnce();
  });

  it("shows Auto state without using implementation labels", () => {
    render(<NarrationDock {...defaultProps} isAutoPlaying={true} />);

    expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/autoplay/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/scene-settling/i)).not.toBeInTheDocument();
  });

  it("shows the current turn stage copy when the backend reports progress", () => {
    render(<NarrationDock {...defaultProps} statusCopy="GM choosing path" />);

    expect(screen.getByText("GM choosing path")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByText(/scene-settling/i)).not.toBeInTheDocument();
  });

  it("marks the beat body as the intended local scroll owner", () => {
    render(
      <NarrationDock
        {...defaultProps}
        beats={[{
          id: "long",
          kind: "narration",
          text: "A long narration beat repeats. ".repeat(80),
        }]}
      />,
    );

    const scrollOwner = screen.getByTestId("narration-dock").querySelector(
      "[data-overflow-owner='narration-scroll']",
    );

    expect(scrollOwner).toBeInTheDocument();
    expect(scrollOwner).toHaveClass("overflow-y-auto", "min-w-0");
  });

  it("renders mechanical results as fiction-facing labels and hides raw details", () => {
    const mechanicBeat: DisplayBeat = {
      id: "mechanic-weak",
      kind: "mechanical_result",
      text: "Costly success",
      mechanic: {
        label: "Costly success",
        outcome: "weak_hit",
      },
      rawDetails: {
        chance: 65,
        roll: 42,
        reasoning: "The backend compared difficulty and tags.",
      },
    };

    render(
      <NarrationDock
        {...defaultProps}
        beats={[mechanicBeat]}
        currentBeatIndex={0}
      />,
    );

    expect(screen.getByText("Costly success")).toBeInTheDocument();
    expect(screen.queryByText(/Chance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Roll/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backend compared/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/[{}]/)).not.toBeInTheDocument();
  });

  it("does not show player-facing chunk or beat counters", () => {
    render(<NarrationDock {...defaultProps} currentBeatIndex={1} />);

    expect(screen.queryByText(/chunk\s+\d+\/\d+/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/beat\s+\d+\/\d+/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2\s*\/\s*3/)).not.toBeInTheDocument();
  });

  it("does not render Continue inside the narration reader", () => {
    render(<NarrationDock {...defaultProps} />);

    expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Continue scene/i)).not.toBeInTheDocument();
  });

  it("does not import backend transport helpers", () => {
    const rootRelative = resolve(process.cwd(), "frontend/components/game/play-surface/narration-dock.tsx");
    const packageRelative = resolve(process.cwd(), "components/game/play-surface/narration-dock.tsx");
    const source = readFileSync(existsSync(rootRelative) ? rootRelative : packageRelative, "utf8");

    expect(source).not.toMatch(/@\/lib\/api/);
    expect(source).not.toMatch(/\bchatAction\b|\bparseTurnSSE\b|\bchatOpening\b|\bchatRetry\b/);
  });
});
