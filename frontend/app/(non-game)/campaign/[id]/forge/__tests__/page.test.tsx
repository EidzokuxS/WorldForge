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
  composeCampaignGraph: vi.fn(),
}));

vi.mock("@/lib/v2-card-parser", () => ({
  parseV2CardFile: vi.fn(),
}));

import { loadCampaign } from "@/lib/api";
import {
  composeCampaignGraph,
  loadCampaignKernel,
  parsePlayerCharacterDraft,
  savePlayerCast,
} from "@/lib/campaign-kernel-api";
import CampaignForgePage from "@/app/(non-game)/campaign/[id]/forge/page";

const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedLoadCampaignKernel = vi.mocked(loadCampaignKernel);
const mockedParsePlayerCharacterDraft = vi.mocked(parsePlayerCharacterDraft);
const mockedSavePlayerCast = vi.mocked(savePlayerCast);
const mockedComposeCampaignGraph = vi.mocked(composeCampaignGraph);

const FULL_SEEDS = {
  geography: "Storm coast",
  politicalStructure: "Guild council",
  centralConflict: "Trade war",
  culturalFlavor: ["Lantern rites"],
  environment: "Storm season",
  wildcard: "Talking maps",
};

const FULL_WORLD_DNA = {
  geography: "Storm coast",
  politicalStructure: "Guild council",
  centralConflict: "Trade war",
  culturalFlavor: "Lantern rites",
  environment: "Storm season",
  wildcard: "Talking maps",
};

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
    seeds: FULL_SEEDS,
  });
  mockedLoadCampaignKernel.mockResolvedValue({
    kernel: makeKernel({
      phase: "world_ready",
      worldDna: FULL_WORLD_DNA,
    }),
  });
});

describe("CampaignForgePage", () => {
  it("renders saved World DNA without raw kernel JSON or a second DNA editor", async () => {
    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByTestId("campaign-forge")).toBeInTheDocument();
    });

    expect(mockedLoadCampaign).toHaveBeenCalledWith("campaign-1");
    expect(mockedLoadCampaignKernel).toHaveBeenCalledWith("campaign-1");
    expect(screen.getByRole("heading", { name: "Arcadia" })).toBeInTheDocument();
    expect(screen.getByTestId("world-dna-panel")).toBeInTheDocument();
    expect(screen.getByText("Storm coast")).toBeInTheDocument();
    expect(screen.getByText("Ready for player creation.")).toBeInTheDocument();
    expect(screen.getByTestId("player-cast-panel")).toBeInTheDocument();
    expect(screen.getByTestId("graph-panel")).toBeInTheDocument();
    expect(screen.getByTestId("kernel-phase")).toHaveTextContent("world_ready");
    expect(screen.queryByLabelText("Geography")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use World DNA/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/"campaignId": "campaign-1"/)).not.toBeInTheDocument();
    expect(screen.queryByText("Kernel payload")).not.toBeInTheDocument();
  });

  it("shows a premise-only state when the campaign was created without World DNA", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A haunted coast of guild cities.",
      createdAt: 1,
      updatedAt: 1,
      generationComplete: false,
    });
    mockedLoadCampaignKernel.mockResolvedValue({
      kernel: makeKernel(),
    });

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByTestId("world-dna-panel")).toBeInTheDocument();
    });

    expect(screen.getByText("No World DNA saved")).toBeInTheDocument();
    expect(screen.getByText("Premise-only player creation is available.")).toBeInTheDocument();
    expect(screen.getByLabelText("Player concept")).toBeEnabled();
  });

  it("keeps saved World DNA visible after the player is saved", async () => {
    mockedLoadCampaignKernel.mockResolvedValue({
      kernel: makeKernel({
        phase: "cast_ready",
        worldDna: FULL_WORLD_DNA,
        castRegistry: {
          playerCharacter: {
            id: "cast:player_created:mira-vale",
            source: "player_created",
            characterDraft: makeDraft(),
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
      }),
    });

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByText("Ready for player creation.")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Use World DNA/ })).not.toBeInTheDocument();
    expect(screen.getByText("Storm coast")).toBeInTheDocument();
  });

  it("creates a player, saves cast, and composes the graph through campaign kernel helpers", async () => {
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
    const composedKernel = makeKernel({
      ...savedKernel,
      worldGraph: {
        nodes: [
          {
            id: "cast:player_created:mira-vale",
            type: "Character",
            name: "Mira Vale",
            data: {},
          },
        ],
        edges: [],
      },
    });
    mockedParsePlayerCharacterDraft.mockResolvedValue({ draft });
    mockedSavePlayerCast.mockResolvedValue({
      kernel: savedKernel,
      playerCharacter: savedKernel.castRegistry.playerCharacter!,
    });
    mockedComposeCampaignGraph.mockResolvedValue({
      kernel: composedKernel,
      worldGraph: composedKernel.worldGraph,
    });

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByTestId("player-cast-panel")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Compose graph/ })).toBeDisabled();
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

    fireEvent.click(screen.getByRole("button", { name: /Save player/ }));

    await waitFor(() => {
      expect(mockedSavePlayerCast).toHaveBeenCalledWith("campaign-1", {
        draft,
        source: "player_created",
      });
    });
    expect(screen.getByTestId("kernel-phase")).toHaveTextContent("cast_ready");

    fireEvent.click(screen.getByRole("button", { name: /Compose graph/ }));

    await waitFor(() => {
      expect(mockedComposeCampaignGraph).toHaveBeenCalledWith("campaign-1");
    });
    expect(screen.getByText("Graph ready.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Compose graph/ })).toBeDisabled();
  });
});
