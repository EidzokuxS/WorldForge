import { Suspense } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  loadCampaign: vi.fn(),
  getWorldData: vi.fn(),
  parseCharacter: vi.fn(),
  generateCharacter: vi.fn(),
  importV2Card: vi.fn(),
  resolveStartingLocation: vi.fn(),
  previewCanonicalLoadout: vi.fn(),
  applyPersonaTemplate: vi.fn(),
  saveCharacter: vi.fn(),
}));

vi.mock("@/lib/v2-card-parser", () => ({
  parseV2CardFile: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/character-creation/character-form", () => ({
  CharacterForm: (props: Record<string, unknown>) => (
    <div
      data-testid="character-form"
      data-parsing={String(props.parsing)}
      data-generating={String(props.generating)}
      data-importing={String(props.importing)}
    />
  ),
}));

vi.mock("@/components/character-creation/character-card", () => ({
  CharacterCard: () => <div data-testid="character-card" />,
}));

import { getWorldData, loadCampaign } from "@/lib/api";
import CharacterCreationPage from "@/app/(non-game)/campaign/[id]/character/page";

const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedGetWorldData = vi.mocked(getWorldData);

async function renderPage(campaignId: string) {
  await act(async () => {
    render(
      <Suspense fallback={<div>Loading route...</div>}>
        <CharacterCreationPage params={Promise.resolve({ id: campaignId })} />
      </Suspense>,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CharacterCreationPage", () => {
  it("renders character form, no-draft message, and action buttons", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A world",
      generationComplete: true,
    } as never);
    mockedGetWorldData.mockResolvedValue({ locations: [], factions: [], npcs: [], relationships: [], personaTemplates: [] } as never);

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByTestId("character-form")).toBeInTheDocument();
    });

    expect(screen.getByText("Use the entry methods above to parse, generate, or import a character.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save & Begin Adventure" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Back to Review" })).toBeInTheDocument();
  });

  it("blocks character creation when the backend reports world generation is not ready", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A world",
      generationComplete: true,
    } as never);
    mockedGetWorldData.mockRejectedValue(new Error("World generation not complete yet."));

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByText("World generation required")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("character-form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save.*Begin Adventure/ })).not.toBeInTheDocument();
  });
});
