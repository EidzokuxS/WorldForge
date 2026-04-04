import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/non-game-shell/campaign-status-provider", () => ({
  CampaignStatusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useCampaignStatus: () => ({
    loading: false,
    generationReady: false,
    campaignId: null,
    campaign: null,
    reviewAvailable: false,
    characterAvailable: false,
  }),
}));

vi.mock("@/lib/api", () => ({
  getActiveCampaign: vi.fn().mockResolvedValue(null),
  loadCampaign: vi.fn(),
}));

import React from "react";
import { AppShell } from "@/components/non-game-shell/app-shell";

describe("AppShell", () => {
  it("renders the outer frame, navigation rail, main panel, and page header", () => {
    render(
      <AppShell>
        <div>Settings body</div>
      </AppShell>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Settings");
    expect(screen.getByRole("main")).toHaveTextContent("Settings body");

    const main = screen.getByRole("main");
    expect(main.closest("[data-shell-region='main-panel']")).not.toBeNull();

    const outerFrame = document.querySelector("[data-shell-region='outer-frame']");
    expect(outerFrame).not.toBeNull();

    const navRail = document.querySelector("[data-shell-region='navigation-rail']");
    expect(navRail).not.toBeNull();

    expect(document.querySelector("[data-shell-region='action-tray']")).toBeNull();
  });

  it("exposes route context via title and headerActions without baking page-specific forms into the foundation", () => {
    render(
      <AppShell
        title="Provider Settings"
        headerActions={<button type="button">Reconnect</button>}
      >
        <div>Child slot</div>
      </AppShell>,
    );

    expect(screen.getByText("Provider Settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();

    const main = screen.getByRole("main");
    expect(within(main).getByText("Child slot")).toBeInTheDocument();
    expect(within(main).queryByLabelText(/campaign name/i)).not.toBeInTheDocument();
  });
});
