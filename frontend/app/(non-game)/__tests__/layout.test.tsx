import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
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
import NonGameLayout from "@/app/(non-game)/layout";

describe("NonGameLayout", () => {
  it("composes the shared shell and keeps a dedicated child slot for downstream pages", () => {
    render(
      <NonGameLayout>
        <div>Launchpad child</div>
      </NonGameLayout>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Launchpad");
    expect(screen.getByRole("link", { name: "New Campaign" })).toBeInTheDocument();

    const main = screen.getByRole("main");
    expect(within(main).getByText("Launchpad child")).toBeInTheDocument();
  });
});
