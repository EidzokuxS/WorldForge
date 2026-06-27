import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDraftCampaignKernel,
  type CampaignKernel,
  type CharacterDraft,
} from "@worldforge/shared";

vi.mock("@/lib/api", () => ({
  loadCampaign: vi.fn(),
}));

vi.mock("@/lib/campaign-kernel-api", () => ({
  loadCampaignKernel: vi.fn(),
  parsePlayerCharacterDraft: vi.fn(),
  importPlayerCard: vi.fn(),
  savePlayerCast: vi.fn(),
}));

vi.mock("@/lib/v2-card-parser", () => ({
  parseV2CardFile: vi.fn(),
}));

import { loadCampaign } from "@/lib/api";
import {
  loadCampaignKernel,
  parsePlayerCharacterDraft,
  savePlayerCast,
} from "@/lib/campaign-kernel-api";
import CampaignForgePage from "@/app/(non-game)/campaign/[id]/forge/page";

const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedLoadCampaignKernel = vi.mocked(loadCampaignKernel);
const mockedParsePlayerCharacterDraft = vi.mocked(parsePlayerCharacterDraft);
const mockedSavePlayerCast = vi.mocked(savePlayerCast);

function makeDraft(name = "Mira Vale"): CharacterDraft {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: name,
      canonicalStatus: "original",
    },
    profile: {
      species: "human",
      gender: "",
      ageText: "",
      appearance: "",
      backgroundSummary: "",
      personaSummary: `${name} keeps moving through the station.`,
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Station Gate",
      relationshipRefs: [],
      socialStatus: [],
      originMode: "native",
    },
    motivations: {
      shortTermGoals: [],
      longTermGoals: [],
      beliefs: [],
      drives: [],
      frictions: [],
    },
    capabilities: {
      traits: [],
      skills: [],
      flaws: [],
      specialties: [],
      wealthTier: null,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "idle",
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: [],
    },
    startConditions: {},
    provenance: {
      sourceKind: "player-input",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
  };
}

function makeKernel(overrides: Partial<CampaignKernel> = {}): CampaignKernel {
  return {
    ...createDraftCampaignKernel({
      id: "campaign-1",
      premise: "A haunted coast of guild cities.",
    }),
    ...overrides,
  };
}

async function renderPage(campaignId: string) {
  await act(async () => {
    render(
      <Suspense fallback={<div>Loading route...</div>}>
        <CampaignForgePage params={Promise.resolve({ id: campaignId })} />
      </Suspense>,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedLoadCampaign.mockResolvedValue({
    id: "campaign-1",
    name: "Arcadia",
    premise: "A haunted coast of guild cities.",
    createdAt: 1,
    updatedAt: 1,
    generationComplete: false,
  });
  mockedLoadCampaignKernel.mockResolvedValue({ kernel: makeKernel() });
});

describe("CampaignForgePage", () => {
  it("renders the persisted Campaign Kernel shell and kernel boundary", async () => {
    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByTestId("campaign-forge")).toBeInTheDocument();
    });

    expect(mockedLoadCampaign).toHaveBeenCalledWith("campaign-1");
    expect(mockedLoadCampaignKernel).toHaveBeenCalledWith("campaign-1");
    expect(screen.getByRole("heading", { name: "Arcadia" })).toBeInTheDocument();
    expect(screen.getByTestId("kernel-phase")).toHaveTextContent("draft");
    expect(screen.getByTestId("kernel-boundary")).toHaveTextContent(
      "Player cast writes to the Campaign Kernel.",
    );
    expect(screen.getByText(/"campaignId": "campaign-1"/)).toBeInTheDocument();
  });

  it("creates and saves a player cast through campaign kernel helpers", async () => {
    const draft = makeDraft();
    const savedKernel = makeKernel({
      phase: "cast_ready",
      castRegistry: {
        playerCharacter: {
          id: "cast:player_created:mira-vale",
          source: "player_created",
          characterDraft: draft,
          campaignRole: "player",
          placement: {
            locationId: null,
            sceneLocationId: null,
            notes: [],
          },
          importance: "primary",
        },
        importedCast: [],
        generatedCast: [],
      },
    });
    mockedParsePlayerCharacterDraft.mockResolvedValue({ draft });
    mockedSavePlayerCast.mockResolvedValue({
      kernel: savedKernel,
      playerCharacter: savedKernel.castRegistry.playerCharacter!,
    });

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByTestId("player-cast-panel")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Player concept"), {
      target: { value: "A courier with a sealed pass." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create draft/ }));

    await waitFor(() => {
      expect(mockedParsePlayerCharacterDraft).toHaveBeenCalledWith("campaign-1", {
        concept: "A courier with a sealed pass.",
      });
    });
    expect(screen.getByText("Mira Vale")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save player cast/ }));

    await waitFor(() => {
      expect(mockedSavePlayerCast).toHaveBeenCalledWith("campaign-1", {
        draft,
        source: "player_created",
      });
    });
    expect(screen.getByTestId("kernel-phase")).toHaveTextContent("cast_ready");
  });
});
