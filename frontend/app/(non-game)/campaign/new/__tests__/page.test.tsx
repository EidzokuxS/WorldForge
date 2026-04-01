import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/campaign-new/flow-provider", () => ({
  useCampaignNewFlow: () => ({
    campaignName: "Arcadia",
    setCampaignName: vi.fn(),
    campaignPremise: "A haunted coast.",
    setCampaignPremise: vi.fn(),
    campaignFranchise: "The Witcher",
    setCampaignFranchise: vi.fn(),
    researchEnabled: true,
    setResearchEnabled: vi.fn(),
    hasWorldbook: true,
    selectedWorldbooks: [{ id: "wb", displayName: "Alpha Codex" }],
    worldbookLibrary: [{ id: "wb", displayName: "Alpha Codex", entryCount: 12 }],
    worldbookLibraryLoading: false,
    worldbookError: null,
    toggleWorldbookSelection: vi.fn(),
    handleWorldbookUpload: vi.fn(),
    canCreate: true,
    handleCreateWithSeeds: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import CampaignConceptPage from "@/app/(non-game)/campaign/new/page";

describe("CampaignConceptPage", () => {
  it("renders concept, research, and selected-source context in shell-owned routed form", () => {
    render(<CampaignConceptPage />);

    expect(screen.getByLabelText("Campaign Name")).toHaveValue("Arcadia");
    expect(screen.getByLabelText("Premise")).toHaveValue("A haunted coast.");
    expect(screen.getByText("Source Library")).toBeInTheDocument();
    expect(screen.getByText("Alpha Codex")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to DNA" })).toBeInTheDocument();
  });
});
