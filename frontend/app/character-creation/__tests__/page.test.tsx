import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
const mockReplace = vi.fn();
const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({ get: mockGet }),
}));
import LegacyCharacterCreationPage from "../page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LegacyCharacterCreationPage", () => {
  it("redirects to the canonical campaign character route when campaignId is present", async () => {
    mockGet.mockReturnValue("campaign-1");

    render(<LegacyCharacterCreationPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/campaign/campaign-1/character");
    });
    expect(
      screen.getByText("Redirecting to character creation...")
    ).toBeInTheDocument();
  });

  it("shows a missing-context message when no campaignId is present", () => {
    mockGet.mockReturnValue(null);

    render(<LegacyCharacterCreationPage />);

    expect(screen.getByText("Missing campaign context.")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
