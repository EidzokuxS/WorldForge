import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/title/load-campaign-dialog", () => ({
  LoadCampaignDialog: () => <div>Load Campaign Dialog</div>,
}));

import LauncherPage from "@/app/(non-game)/page";

describe("LauncherPage", () => {
  it("pins Gap 1 launcher cards to shared shell panel primitives", () => {
    render(<LauncherPage />);

    const link = screen.getByRole("link", { name: "New Campaign" });
    expect(link).toHaveAttribute("href", "/campaign/new");
    expect(screen.getByText("Load Campaign Dialog")).toBeInTheDocument();
    expect(screen.getByText("Primary flow").closest("[data-shell-surface='panel']")).not.toBeNull();
    expect(screen.getByText("Resume flow").closest("[data-shell-surface='panel']")).not.toBeNull();
    expect(screen.getByText("Shell Shortcuts").closest("[data-shell-surface='panel']")).not.toBeNull();
  });
});
