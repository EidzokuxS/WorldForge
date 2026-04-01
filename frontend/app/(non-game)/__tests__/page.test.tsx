import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/title/load-campaign-dialog", () => ({
  LoadCampaignDialog: () => <div>Load Campaign Dialog</div>,
}));

import LauncherPage from "@/app/(non-game)/page";

describe("LauncherPage", () => {
  it("exposes a routed new-campaign entry as the primary path", () => {
    render(<LauncherPage />);

    const link = screen.getByRole("link", { name: "New Campaign" });
    expect(link).toHaveAttribute("href", "/campaign/new");
    expect(screen.getByText("Load Campaign Dialog")).toBeInTheDocument();
  });
});
