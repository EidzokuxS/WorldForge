import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  apiGet: vi.fn().mockResolvedValue([]),
  apiDelete: vi.fn(),
  loadCampaign: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@worldforge/shared", () => ({
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

import LauncherPage from "@/app/(non-game)/page";

describe("LauncherPage", () => {
  it("renders the launcher with campaign actions and recent campaigns section", () => {
    render(<LauncherPage />);

    const link = screen.getByRole("link", { name: "New Campaign" });
    expect(link).toHaveAttribute("href", "/campaign/new");
    expect(screen.getByText("Recent Campaigns")).toBeInTheDocument();
    expect(screen.getByText("Load Campaign")).toBeInTheDocument();
  });
});
