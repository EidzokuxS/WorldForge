import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DrawerKind } from "../types";
import { DrawerHost } from "../drawer-host";
import { WidgetRail } from "../widget-rail";

const drawerLabels: Array<{ kind: DrawerKind; label: string }> = [
  { kind: "log", label: "Log" },
  { kind: "world", label: "World" },
  { kind: "inventory", label: "Inventory" },
  { kind: "journal", label: "Journal" },
  { kind: "character", label: "Character" },
  { kind: "inspect", label: "Inspect" },
  { kind: "saves", label: "Saves" },
];

function drawerSlots() {
  return {
    log: <p>Full log content</p>,
    world: <p>World map content</p>,
    inventory: <p>Inventory content</p>,
    journal: <p>Journal content</p>,
    character: <p>Character content</p>,
    inspect: <p>Inspect content</p>,
    saves: <p>Saves content</p>,
  };
}

describe("WidgetRail", () => {
  it("opens every player-facing drawer kind from compact widget buttons", () => {
    const onOpenDrawer = vi.fn();

    render(
      <WidgetRail
        activeDrawer={null}
        onOpenDrawer={onOpenDrawer}
      />,
    );

    for (const { kind, label } of drawerLabels) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(onOpenDrawer).toHaveBeenLastCalledWith(kind);
    }

    expect(screen.queryByText("World Lore")).not.toBeInTheDocument();
    expect(screen.queryByText("Support Actions")).not.toBeInTheDocument();
    expect(screen.queryByText("scene-settling")).not.toBeInTheDocument();
  });

  it("reserves accent styling for the active drawer and keeps inactive tools neutral", () => {
    render(
      <WidgetRail
        activeDrawer="world"
        onOpenDrawer={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "World" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "Log" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("button", { name: "World" }).className).toContain("text-[#E63E00]");
    expect(screen.getByRole("button", { name: "Log" }).className).toContain("text-zinc-300");
  });

  it("can sit as a compact stage-attached rail without full-height sidebar classes", () => {
    render(
      <WidgetRail
        activeDrawer={null}
        onOpenDrawer={vi.fn()}
      />,
    );

    const rail = screen.getByTestId("widget-rail");
    expect(rail.className).toContain("grid");
    expect(rail.className).not.toContain("w-80");
    expect(rail.className).not.toContain("h-full");
    expect(rail.className).not.toContain("aside");
  });
});

describe("DrawerHost", () => {
  it("renders one controlled drawer overlay at a time and closes through the close control", () => {
    const onClose = vi.fn();

    render(
      <DrawerHost
        activeDrawer="world"
        onClose={onClose}
        slots={drawerSlots()}
      />,
    );

    expect(screen.getByTestId("drawer-host")).toHaveAttribute("data-active-drawer", "world");
    expect(screen.getByRole("dialog", { name: "World" })).toBeInTheDocument();
    expect(screen.getByText("World map content")).toBeInTheDocument();
    expect(screen.queryByText("Full log content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the close control at the 44px touch target", () => {
    render(
      <DrawerHost
        activeDrawer="world"
        onClose={vi.fn()}
        slots={drawerSlots()}
      />,
    );

    expect(screen.getByRole("button", { name: "Close drawer" })).toHaveClass("h-11", "w-11");
  });

  it("keeps drawer content inside an independently scrolling panel", () => {
    render(
      <DrawerHost
        activeDrawer="log"
        onClose={vi.fn()}
        slots={drawerSlots()}
      />,
    );

    const host = screen.getByTestId("drawer-host");
    const scrollArea = within(host).getByTestId("drawer-scroll-area");
    expect(scrollArea.className).toContain("overflow-hidden");
    expect(scrollArea.className).toContain("flex-1");
  });

  it("describes selected actor scope for Character and falls back to the player", () => {
    const { rerender } = render(
      <DrawerHost
        activeDrawer="character"
        onClose={vi.fn()}
        selectedActorName="Nobara Kugisaki"
        playerName="Hero"
        slots={drawerSlots()}
      />,
    );

    expect(screen.getByText("Viewing Nobara Kugisaki")).toBeInTheDocument();

    rerender(
      <DrawerHost
        activeDrawer="character"
        onClose={vi.fn()}
        selectedActorName={null}
        playerName="Hero"
        slots={drawerSlots()}
      />,
    );

    expect(screen.getByText("Viewing Hero")).toBeInTheDocument();
  });

  it("does not render any drawer when inactive", () => {
    render(
      <DrawerHost
        activeDrawer={null}
        onClose={vi.fn()}
        slots={drawerSlots()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
