import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  listWorldbookLibrary: vi.fn().mockResolvedValue({
    items: [
      {
        id: "wb-1",
        displayName: "Alpha Codex",
        entryCount: 12,
        updatedAt: 1710000000000,
        originalFileName: "alpha.json",
      },
    ],
  }),
  importWorldbookLibrary: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import LibraryPage from "@/app/(non-game)/library/page";

describe("LibraryPage", () => {
  it("lists reusable sources and keeps a path back to routed campaign creation", async () => {
    render(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpha Codex")).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: "Back to Campaign Creation" })).toHaveAttribute("href", "/campaign/new");
  });
});
