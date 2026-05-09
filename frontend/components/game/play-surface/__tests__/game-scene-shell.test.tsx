import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameSceneShell } from "../game-scene-shell";
import { SceneBackdrop } from "../scene-backdrop";
import { SceneHUD } from "../scene-hud";
import { StageOverlay } from "../stage-overlay";

describe("GameSceneShell", () => {
  const renderShell = () =>
    render(
      <GameSceneShell
        backdrop={
          <SceneBackdrop
            sceneName="Shibuya Station Platform"
            broadLocationName="Shibuya"
            description="Rainwater gathers in the tile seams under a flickering departure board."
            tags={["underground", "crowded", "neon"]}
            mood="tense"
            weather="rain"
            timeOfDay="midnight"
            backgroundUrl="/scene/shibuya-platform.png"
          />
        }
        hud={
          <SceneHUD
            sceneName="Shibuya Station Platform"
            broadLocationName="Shibuya"
            status="Reading"
            mood="tense"
            weather="rain"
            timeOfDay="midnight"
            onHome={vi.fn()}
            onSaves={vi.fn()}
            onSettings={vi.fn()}
          />
        }
        stageOverlay={
          <StageOverlay
            currentBeatId="beat-1"
            signals={[
              { id: "side", kind: "ambient", text: "A train brake shrieks below the platform.", clearOn: "next" },
              { id: "whisper", kind: "whisper", text: "Someone whispers from behind a pillar.", clearOn: "next" },
              { id: "glitch", kind: "glitch", text: "The lights stutter twice.", clearOn: "next" },
              { id: "flash", kind: "flash", text: "White light cuts across the rails.", clearOn: "next" },
              { id: "fade", kind: "fade", text: "The far tunnel drops into black.", clearOn: "turn_boundary" },
              { id: "shake", kind: "shake", text: "The floor trembles.", clearOn: "next" },
            ]}
          />
        }
        presenceSlot={<div data-testid="presence-layer">Nobara near the ticket gate</div>}
        narrationDock={<div data-testid="narration-dock">The station exhales cold rain.</div>}
        actionDock={<div data-testid="action-dock">Action input surface</div>}
        widgetRail={<div data-testid="widget-rail">World Inventory Journal</div>}
        drawerHost={<div data-testid="drawer-host">Drawer host</div>}
        leftStageSlot={<div data-testid="stage-left-widget">Player: steady</div>}
        rightStageSlot={<div data-testid="stage-right-widget">Pressure: rising</div>}
      />,
    );

  it("renders the scene-first play surface hooks without permanent admin columns", () => {
    const { container } = renderShell();

    expect(screen.getByTestId("game-scene-shell")).toBeInTheDocument();
    expect(screen.getByTestId("scene-backdrop")).toBeInTheDocument();
    expect(screen.getByTestId("scene-hud")).toBeInTheDocument();
    expect(screen.getByTestId("narration-dock")).toBeInTheDocument();
    expect(screen.getByTestId("action-dock")).toBeInTheDocument();
    expect(screen.getByTestId("widget-rail")).toBeInTheDocument();
    expect(screen.getByTestId("drawer-host")).toBeInTheDocument();
    expect(screen.getByTestId("presence-layer")).toBeInTheDocument();

    const shell = screen.getByTestId("game-scene-shell");
    expect(shell).toHaveClass("h-dvh", "overflow-hidden");
    expect(shell.className).toMatch(/bg-\[var\(--bg\)\]|bg-zinc-950|bg-\[#09090B\]/);
    expect(container.querySelector('[data-layout="admin-columns"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-shell-region="game-columns"]')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Location$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Oracle$/)).not.toBeInTheDocument();
  });

  it("renders a concrete place backdrop instead of an empty gradient", () => {
    renderShell();

    expect(screen.getAllByText("Shibuya Station Platform").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shibuya").length).toBeGreaterThan(0);
    expect(screen.getByTestId("scene-backdrop")).toHaveAccessibleName(
      expect.stringContaining("Rainwater gathers"),
    );
    expect(screen.getByTestId("scene-backdrop")).toHaveAccessibleName(
      expect.stringContaining("midnight, rain"),
    );
    expect(screen.getByTestId("scene-environment-layer")).toBeInTheDocument();
    expect(screen.getByTestId("scene-floor-plane")).toBeInTheDocument();
    expect(screen.getByTestId("scene-floor-plane")).toHaveClass("bottom-0", "h-[30%]");
    expect(screen.getByTestId("scene-floor-plane")).not.toHaveClass("translate-y-[33%]");
    expect(screen.getByTestId("scene-depth-grid")).toBeInTheDocument();
    expect(screen.getByTestId("scene-backdrop").querySelector(".sr-only")).not.toBeInTheDocument();
    expect(screen.queryByTestId("scene-prop-marker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("scene-actor-marker")).not.toBeInTheDocument();
    expect(screen.getByTestId("scene-backdrop-image")).toHaveStyle({
      backgroundImage: 'url("/scene/shibuya-platform.png")',
    });
  });

  it("keeps beat-scoped stage signals visible until the parent advances or replaces the turn", () => {
    renderShell();

    expect(screen.getByTestId("stage-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("stage-signal-side")).toHaveAttribute("data-clear-on", "next");
    expect(screen.getByTestId("stage-signal-whisper")).toHaveAttribute("data-effect", "whisper");
    expect(screen.getByTestId("stage-signal-glitch")).toHaveAttribute("data-effect", "glitch");
    expect(screen.getByTestId("stage-signal-flash")).toHaveAttribute("data-effect", "flash");
    expect(screen.getByTestId("stage-signal-fade")).toHaveAttribute("data-clear-on", "turn_boundary");
    expect(screen.getByTestId("stage-signal-shake")).toHaveAttribute("data-effect", "screen_shake");
    expect(screen.queryByText(/disappear/i)).not.toBeInTheDocument();
  });

  it("uses wide stage-attached widgets so desktop sides are scene context, not dead bands", () => {
    renderShell();

    expect(screen.getByTestId("stage-left-widget")).toBeInTheDocument();
    expect(screen.getByTestId("stage-right-widget")).toBeInTheDocument();
    expect(screen.getByTestId("game-scene-shell")).toContainElement(screen.getByTestId("stage-left-widget"));
    expect(screen.getByTestId("game-scene-shell")).toContainElement(screen.getByTestId("stage-right-widget"));
  });

  it("does not include rejected paper or editorial direction in default copy", () => {
    const { container } = renderShell();

    expect(container.textContent).not.toMatch(/cream|paper|parchment|newspaper|editorial/i);
  });
});
