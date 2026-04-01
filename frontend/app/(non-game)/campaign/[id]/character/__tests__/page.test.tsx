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
  it("pins Gap 1 character navigation, summary, and action tray to shared shell primitives", async () => {
    mockedLoadCampaign.mockResolvedValue({ id: "campaign-1", name: "Arcadia", premise: "A world" } as never);
    mockedGetWorldData.mockResolvedValue({ locations: [], factions: [], npcs: [], relationships: [], personaTemplates: [] } as never);

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByText("Input Methods")).toBeInTheDocument();
    });

    expect(screen.getByTestId("character-form")).toBeInTheDocument();
    expect(screen.getByText("Awaiting Draft")).toBeInTheDocument();
    expect(screen.getByText("Input Methods").closest("[data-shell-surface='rail']")).not.toBeNull();
    expect(screen.getByText("Draft Summary").closest("[data-shell-surface='panel']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Begin Adventure" }).closest("[data-shell-region='action-tray']")).not.toBeNull();
  });
});
