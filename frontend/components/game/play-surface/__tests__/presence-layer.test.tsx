import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PresenceLayer } from "../presence-layer";

describe("PresenceLayer", () => {
  it("renders visible actors as selectable scene chips", () => {
    const onSelectActor = vi.fn();

    render(
      <PresenceLayer
        visibleActors={[
          { id: "npc-1", name: "Nobara Kugisaki", tier: "key" },
          { id: "npc-2", name: "Megumi Fushiguro", tier: "supporting" },
        ]}
        hintSignals={[]}
        selectedActorId={null}
        onSelectActor={onSelectActor}
      />,
    );

    const layer = screen.getByTestId("presence-layer");
    expect(within(layer).getByRole("button", { name: "Open Nobara Kugisaki character details" })).toBeInTheDocument();
    expect(within(layer).getByRole("button", { name: "Open Megumi Fushiguro character details" })).toBeInTheDocument();

    fireEvent.click(within(layer).getByRole("button", { name: "Open Nobara Kugisaki character details" }));
    expect(onSelectActor).toHaveBeenCalledWith("npc-1");
  });

  it("renders sensed hints as muted non-target cues without actor buttons", () => {
    render(
      <PresenceLayer
        visibleActors={[{ id: "npc-1", name: "Nobara Kugisaki", tier: "key" }]}
        hintSignals={["A pressure shift moves along the platform edge."]}
        selectedActorId={null}
        onSelectActor={vi.fn()}
      />,
    );

    const hint = screen.getByTestId("presence-hint-0");
    expect(hint).toHaveTextContent("A pressure shift moves along the platform edge.");
    expect(hint).toHaveAttribute("aria-disabled", "true");
    expect(within(hint).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Satoru Gojo/i })).not.toBeInTheDocument();
  });

  it("does not render off-screen anchors as direct scene chips", () => {
    render(
      <PresenceLayer
        visibleActors={[]}
        hintSignals={[]}
        offscreenAnchorCount={3}
        selectedActorId={null}
        onSelectActor={vi.fn()}
      />,
    );

    expect(screen.getByTestId("presence-offscreen-anchor-count")).toHaveTextContent("3 nearby, not visible");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("marks the selected visible actor without making hints selectable", () => {
    render(
      <PresenceLayer
        visibleActors={[{ id: "npc-1", name: "Nobara Kugisaki", tier: "key" }]}
        hintSignals={["Movement gathers behind the crowd."]}
        selectedActorId="npc-1"
        onSelectActor={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Open Nobara Kugisaki character details" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("presence-hint-0")).toHaveAttribute("aria-disabled", "true");
  });
});
