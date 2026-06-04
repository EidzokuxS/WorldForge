import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigationMock = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => navigationMock,
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

const FLOW_KEY = "worldforge.campaign-new-flow";

function writeDraftSession() {
  window.sessionStorage.setItem(FLOW_KEY, JSON.stringify({
    version: 1,
    campaignName: "Draft Mercy",
    campaignPremise: "A saved forge draft",
    campaignFranchise: "",
    researchEnabled: true,
    selectedWorldbooks: [],
    dnaState: null,
    researchArtifact: null,
    step: 1,
    phase: { kind: "idle" },
    generationProgress: null,
  }));
}

describe("AppShell", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    navigationMock.push.mockClear();
  });

  it("renders the V4 rail, route topbar, and main stage", () => {
    render(
      <AppShell>
        <div>Settings body</div>
      </AppShell>,
    );

    expect(document.querySelector(".wf-v4-crumb")).toHaveTextContent("Settings");
    expect(screen.getByRole("main")).toHaveTextContent("Settings body");

    const main = screen.getByRole("main");
    expect(main.closest(".wf-v4-stage")).not.toBeNull();

    const navRail = document.querySelector(".wf-v4-rail");
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

  it("keeps draft resume separate from destructive new campaign start", async () => {
    writeDraftSession();
    const user = userEvent.setup();

    render(
      <AppShell>
        <div>Settings body</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Resume draft" })).toHaveAttribute("href", "/campaign/new");

    await user.click(screen.getByRole("link", { name: "New campaign" }));
    expect(await screen.findByText("Start a new campaign?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep draft" }));
    expect(window.sessionStorage.getItem(FLOW_KEY)).toContain("Draft Mercy");
    expect(navigationMock.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("link", { name: "New campaign" }));
    await user.click(await screen.findByRole("button", { name: "Start over" }));

    await waitFor(() => {
      expect(window.sessionStorage.getItem(FLOW_KEY)).toBeNull();
    });
    expect(navigationMock.push).toHaveBeenCalledWith("/campaign/new");
  });
});
