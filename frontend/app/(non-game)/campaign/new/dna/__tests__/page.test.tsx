import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/campaign-new/flow-provider", () => ({
  useCampaignNewFlow: () => ({
    isBusy: false,
    isSuggesting: false,
    suggestingCategory: null,
    handleResuggestAll: vi.fn(),
    handleResuggestCategory: vi.fn(),
    handleCreateWithDna: vi.fn(),
    handleSeedTextChange: vi.fn(),
    dnaState: {
      geography: { enabled: true, value: "Storm coast", isCustom: false },
      politicalStructure: { enabled: true, value: "Guild council", isCustom: false },
      centralConflict: { enabled: true, value: "Trade war", isCustom: false },
      culturalFlavor: { enabled: true, value: ["masked festivals"], isCustom: false },
      environment: { enabled: true, value: "Sea caves", isCustom: false },
      wildcard: { enabled: true, value: "Whispering relics", isCustom: false },
    },
  }),
}));

import CampaignDnaPage from "@/app/(non-game)/campaign/new/dna/page";

describe("CampaignDnaPage", () => {
  it("renders routed DNA editing on persisted flow state", () => {
    render(<CampaignDnaPage />);

    expect(screen.getByText("World DNA")).toBeInTheDocument();
    expect(screen.getByText(/Storm coast/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create World" })).toBeInTheDocument();
  });
});
