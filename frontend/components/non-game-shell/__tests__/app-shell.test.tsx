import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";

import { AppShell } from "@/components/non-game-shell/app-shell";

const navigation = vi.hoisted(() => ({
  pathname: "/settings",
  push: vi.fn(),
}));

const campaignStatus = vi.hoisted(() => ({
  current: {
    campaignId: null as string | null,
    campaign: null as { id: string; name: string } | null,
    worldState: null as { status: string } | null,
    loading: false,
    refreshCampaignWorldState: vi.fn(),
  },
}));

const playApi = vi.hoisted(() => ({ loadCampaignPlayState: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation,
}));

vi.mock("@/components/non-game-shell/campaign-status-provider", () => ({
  useCampaignStatus: () => campaignStatus.current,
}));

vi.mock("@/lib/campaign-play-api", () => ({
  loadCampaignPlayState: playApi.loadCampaignPlayState,
}));

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
  }));
}

function setCampaignStatus(status: string) {
  campaignStatus.current = {
    campaignId: "campaign-1",
    campaign: { id: "campaign-1", name: "Bell Coast" },
    worldState: { status },
    loading: false,
    refreshCampaignWorldState: vi.fn(),
  };
}

describe("AppShell", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    navigation.pathname = "/settings";
    navigation.push.mockClear();
    playApi.loadCampaignPlayState.mockReset();
    playApi.loadCampaignPlayState.mockResolvedValue({ phase: "opening_required" });
    campaignStatus.current = {
      campaignId: null,
      campaign: null,
      worldState: null,
      loading: false,
      refreshCampaignWorldState: vi.fn(),
    };
  });

  it("renders the route topbar and main stage", () => {
    render(<AppShell><div>Settings body</div></AppShell>);

    expect(document.querySelector(".wf-v4-crumb")).toHaveTextContent("Settings");
    expect(screen.getByRole("main")).toHaveTextContent("Settings body");
    expect(screen.getByRole("main").closest(".wf-v4-stage")).not.toBeNull();
    expect(document.querySelector(".wf-v4-rail")).not.toBeNull();
  });

  it("keeps route title and header actions as explicit shell inputs", () => {
    render(
      <AppShell title="Provider Settings" headerActions={<button type="button">Reconnect</button>}>
        <div>Child slot</div>
      </AppShell>,
    );

    expect(screen.getByText("Provider Settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("Child slot")).toBeInTheDocument();
  });

  it("keeps draft resume separate from destructive campaign creation", async () => {
    writeDraftSession();
    const user = userEvent.setup();
    render(<AppShell><div>Settings body</div></AppShell>);

    expect(screen.getByRole("link", { name: "Resume draft" })).toHaveAttribute("href", "/campaign/new");
    await user.click(screen.getByRole("link", { name: "New campaign" }));
    expect(await screen.findByText("Start a new campaign?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep draft" }));
    expect(window.sessionStorage.getItem(FLOW_KEY)).toContain("Draft Mercy");

    await user.click(screen.getByRole("link", { name: "New campaign" }));
    await user.click(await screen.findByRole("button", { name: "Start over" }));
    await waitFor(() => expect(window.sessionStorage.getItem(FLOW_KEY)).toBeNull());
    expect(navigation.push).toHaveBeenCalledWith("/campaign/new");
  });

  it("renders all Campaign World lifecycle labels and gates World Review", () => {
    navigation.pathname = "/campaign/campaign-1/forge";
    const labels = [
      ["unbuilt", "World awaits creation"],
      ["building", "World is taking shape"],
      ["review", "World ready for review"],
      ["failed", "World build needs attention"],
      ["accepted", "World accepted"],
    ];
    setCampaignStatus(labels[0]![0]);
    const view = render(<AppShell><div>Campaign body</div></AppShell>);

    for (const [status, label] of labels) {
      setCampaignStatus(status);
      view.rerender(<AppShell><div>Campaign body</div></AppShell>);
      expect(screen.getByText(label)).toBeInTheDocument();
      const reviewLink = screen.getByRole("link", { name: "World Review" });
      expect(reviewLink).toHaveAttribute(
        "href",
        status === "review" || status === "accepted" ? "/campaign/campaign-1/review" : "#",
      );
    }

    expect(screen.getByRole("link", { name: "Campaign Forge" })).toHaveAttribute(
      "href",
      "/campaign/campaign-1/forge",
    );
    expect(screen.queryByRole("link", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Player character" })).not.toBeInTheDocument();
  });

  it("routes an accepted campaign to Character until its player character exists", async () => {
    navigation.pathname = "/campaign/campaign-1/review";
    setCampaignStatus("accepted");
    playApi.loadCampaignPlayState.mockResolvedValue({ phase: "character_required" });

    render(<AppShell><div>Campaign body</div></AppShell>);

    const characterLink = await screen.findByRole("link", { name: "Player character" });
    expect(characterLink).toHaveAttribute("href", "/campaign/campaign-1/character");
    expect(screen.queryByRole("link", { name: "Play" })).not.toBeInTheDocument();
  });

  it("routes an accepted campaign with an opening or turn to Play", async () => {
    navigation.pathname = "/campaign/campaign-1/review";
    setCampaignStatus("accepted");
    playApi.loadCampaignPlayState.mockResolvedValue({ phase: "opening_required" });

    render(<AppShell><div>Campaign body</div></AppShell>);

    const playLink = await screen.findByRole("link", { name: "Play" });
    expect(playLink).toHaveAttribute("href", "/campaign/campaign-1/play");
  });

  it("uses Campaign Forge and World Review crumbs without a session action", () => {
    setCampaignStatus("review");
    navigation.pathname = "/campaign/campaign-1/forge";
    const view = render(<AppShell><div>Forge body</div></AppShell>);
    expect(document.querySelector(".wf-v4-crumb")).toHaveTextContent("Bell Coast/Campaign Forge");

    navigation.pathname = "/campaign/campaign-1/review";
    view.rerender(<AppShell><div>Review body</div></AppShell>);
    expect(document.querySelector(".wf-v4-crumb")).toHaveTextContent("Bell Coast/World Review");
    expect(screen.queryByRole("link", { name: "Begin session" })).not.toBeInTheDocument();
  });
});
