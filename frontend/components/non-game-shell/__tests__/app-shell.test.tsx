import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
}));

import { AppShell } from "@/components/non-game-shell/app-shell";

describe("AppShell", () => {
  it("renders Gap 1 shell hooks for the outer frame, left rail, main panel, and sticky action tray", () => {
    render(
      <AppShell
        inspector={<p>Inspector summary</p>}
        stickyActions={<button type="button">Save settings</button>}
      >
        <div>Settings body</div>
      </AppShell>,
    );

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Provider and Role Settings")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Settings body");
    expect(screen.getByText("Inspector summary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument();
    expect(screen.getByTestId("shell-grid").className).toContain("xl:grid-cols");
    expect(screen.getByRole("link", { name: "Settings" }).closest("[data-shell-region='navigation-rail']")).not.toBeNull();
    expect(screen.getByRole("main").closest("[data-shell-region='main-panel']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save settings" }).closest("[data-shell-region='action-tray']")).not.toBeNull();
    expect(screen.getByRole("main").closest("[data-shell-region='outer-frame']")).not.toBeNull();
  });

  it("exposes route context and action labels without baking page-specific forms into the foundation", () => {
    render(
      <AppShell
        title="Provider Settings"
        description="Route-owned shell frame"
        eyebrow="Route Context"
        status="Autosave active"
        headerActions={<button type="button">Reconnect</button>}
      >
        <div>Child slot</div>
      </AppShell>,
    );

    expect(screen.getByText("Route Context")).toBeInTheDocument();
    expect(screen.getByText("Provider Settings")).toBeInTheDocument();
    expect(screen.getByText("Route-owned shell frame")).toBeInTheDocument();
    expect(screen.getByText("Autosave active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();

    const main = screen.getByRole("main");
    expect(within(main).getByText("Child slot")).toBeInTheDocument();
    expect(within(main).queryByLabelText(/campaign name/i)).not.toBeInTheDocument();
  });
});
