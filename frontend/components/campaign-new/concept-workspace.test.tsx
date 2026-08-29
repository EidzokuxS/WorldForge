import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setPlayerIdentityName = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/campaign-new/dna-suggestion-workspace", () => ({
  DnaSuggestionWorkspace: () => null,
}));

vi.mock("@/components/campaign-new/flow-provider", () => ({
  useCampaignNewFlow: () => ({
    isSuggesting: false,
    dnaState: null,
    selectedWorldbooks: [],
    campaignName: "A Brina Story",
    campaignPremise: "Brina arrives at the registry.",
    hasWorldbook: false,
    playerIdentityName: "",
    setPlayerIdentityName,
    setCampaignName: vi.fn(),
    setCampaignPremise: vi.fn(),
    campaignFranchise: "",
    setCampaignFranchise: vi.fn(),
    researchEnabled: true,
    setResearchEnabled: vi.fn(),
    worldbookLibraryLoading: false,
    worldbookLibrary: [],
    worldbookError: null,
    canCreate: true,
    creatingCampaign: false,
    handleCreateWithSeeds: vi.fn(),
    handleWorldbookUpload: vi.fn(),
    toggleWorldbookSelection: vi.fn(),
  }),
}));

import { ConceptWorkspace } from "./concept-workspace";

describe("ConceptWorkspace", () => {
  beforeEach(() => {
    setPlayerIdentityName.mockClear();
  });

  it("shows the optional player identity reservation with the backend length cap", () => {
    render(<ConceptWorkspace onContinue={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: "Player character" });
    expect(input).toHaveProperty("maxLength", 200);
    expect(screen.getByText("Reserve the name of the character you’ll create or import after the world is accepted.")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Brina Hael" } });
    expect(setPlayerIdentityName).toHaveBeenCalledWith("Brina Hael");
  });
});
