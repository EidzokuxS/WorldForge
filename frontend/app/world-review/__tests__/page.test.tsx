import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockReplace = vi.fn();
const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({ get: mockGet }),
}));

import LegacyWorldReviewPage from "../page";

describe("LegacyWorldReviewPage", () => {
  it("redirects to the canonical campaign review route when campaignId is present", async () => {
    mockGet.mockReturnValue("campaign-1");

    render(<LegacyWorldReviewPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/campaign/campaign-1/review");
    });
    expect(screen.getByText("Redirecting to campaign review...")).toBeInTheDocument();
  });
});
