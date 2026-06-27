import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDraftCampaignKernel,
  type CampaignKernel,
  type CharacterDraft,
} from "@worldforge/shared";

vi.mock("@/lib/api", () => ({
  loadCampaign: vi.fn(),
  generateWorld: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/lib/campaign-kernel-api", () => ({
  applyWorldDna: vi.fn(),
  loadCampaignKernel: vi.fn(),
  parsePlayerCharacterDraft: vi.fn(),
  importPlayerCard: vi.fn(),
  savePlayerCast: vi.fn(),
  composeCampaignGraph: vi.fn(),
  suggestCampaignWorldDna: vi.fn(),
  suggestCampaignWorldDnaCategory: vi.fn(),
}));

vi.mock("@/lib/v2-card-parser", () => ({
  parseV2CardFile: vi.fn(),
}));

import { loadCampaign } from "@/lib/api";
import { generateWorld } from "@/lib/api";
import {
  applyWorldDna,
  composeCampaignGraph,
  loadCampaignKernel,
  parsePlayerCharacterDraft,
  savePlayerCast,
  suggestCampaignWorldDna,
  suggestCampaignWorldDnaCategory,
} from "@/lib/campaign-kernel-api";
import CampaignForgePage from "@/app/(non-game)/campaign/[id]/forge/page";

const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedGenerateWorld = vi.mocked(generateWorld);
const mockedApplyWorldDna = vi.mocked(applyWorldDna);
const mockedLoadCampaignKernel = vi.mocked(loadCampaignKernel);
const mockedParsePlayerCharacterDraft = vi.mocked(parsePlayerCharacterDraft);
const mockedSavePlayerCast = vi.mocked(savePlayerCast);
const mockedComposeCampaignGraph = vi.mocked(composeCampaignGraph);
const mockedSuggestCampaignWorldDna = vi.mocked(suggestCampaignWorldDna);
const mockedSuggestCampaignWorldDnaCategory = vi.mocked(suggestCampaignWorldDnaCategory);

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
  pushMock.mockReset();
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
  mockedApplyWorldDna.mockResolvedValue({
    campaign: {
      id: "campaign-1",
      name: "Arcadia",
      premise: "A haunted coast of guild cities.",
      createdAt: 1,
      updatedAt: 2,
      generationComplete: false,
      seeds: FULL_SEEDS,
    },
    kernel: makeKernel({
      phase: "world_ready",
      worldDna: FULL_WORLD_DNA,
    }),
    worldDna: FULL_WORLD_DNA,
  });
  mockedSuggestCampaignWorldDna.mockResolvedValue({
    seeds: {
      geography: "Flooded stations",
      politicalStructure: "Signal cabinet",
      centralConflict: "Families barter illegal platform passes",
      culturalFlavor: ["Rail noir", "Signal liturgy"],
      environment: "Salt rain under glass canopies",
      wildcard: "Tickets remember every hand that held them",
    },
  });
  mockedSuggestCampaignWorldDnaCategory.mockResolvedValue({
    category: "geography",
    value: "Flooded stations",
  });
});

describe("CampaignForgePage", () => {
  it("renders saved World DNA without raw kernel JSON or a second DNA editor", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A haunted coast of guild cities.",
      createdAt: 1,
      updatedAt: 1,
      generationComplete: true,
      seeds: FULL_SEEDS,
    });

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByTestId("campaign-forge")).toBeInTheDocument();
    });

    expect(mockedLoadCampaign).toHaveBeenCalledWith("campaign-1");
    expect(mockedLoadCampaignKernel).toHaveBeenCalledWith("campaign-1");
    expect(screen.getByRole("heading", { name: "Arcadia" })).toBeInTheDocument();
    expect(screen.getByTestId("world-dna-panel")).toBeInTheDocument();
    const dnaList = within(screen.getByTestId("world-dna-panel")).getByRole("list", { name: "Accepted World DNA" });
    expect(within(dnaList).getAllByRole("listitem")).toHaveLength(6);
    expect(within(dnaList).getByText("D01")).toBeInTheDocument();
    expect(within(dnaList).getByRole("heading", { name: "Geography" })).toBeInTheDocument();
    expect(screen.getByText("Storm coast")).toBeInTheDocument();
    expect(screen.getByText("World DNA accepted.")).toBeInTheDocument();
    expect(screen.getByTestId("player-cast-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("graph-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Compose graph/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("kernel-phase")).toHaveTextContent("world_ready");
    expect(screen.queryByLabelText("Geography")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use World DNA/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/"campaignId": "campaign-1"/)).not.toBeInTheDocument();
    expect(screen.queryByText("Kernel payload")).not.toBeInTheDocument();
  });

  it("creates the world from a premise-only campaign without requiring World DNA", async () => {
    let finishGeneration: (() => void) | undefined;
    mockedGenerateWorld.mockImplementation((_campaignId, options) => new Promise((resolve) => {
      options?.onProgress?.({
        step: 1,
        totalSteps: 8,
        label: "Refining premise...",
      });
      finishGeneration = () => resolve({
        refinedPremise: "Refined world",
        locationCount: 12,
        npcCount: 14,
        factionCount: 5,
        loreCardCount: 20,
        loreStorageFailed: false,
        startingLocation: "Lantern Gate",
      });
    }));
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
      expect(screen.getByTestId("worldgen-surface")).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Create the world." })).toBeInTheDocument();
    expect(screen.getByTestId("world-source-panel")).toBeInTheDocument();
    expect(screen.getByText("A haunted coast of guild cities.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create world" })).toBeEnabled();
    expect(screen.queryByRole("list", { name: "Editable World DNA" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save DNA" })).not.toBeInTheDocument();
    expect(screen.queryByText("World DNA required")).not.toBeInTheDocument();
    expect(screen.queryByText("World DNA required before player creation.")).not.toBeInTheDocument();
    expect(screen.queryByText("Player creation locked")).not.toBeInTheDocument();
    expect(screen.queryByText("Accept World DNA first")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Player concept")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create world" }));

    await waitFor(() => {
      expect(mockedGenerateWorld).toHaveBeenCalledWith("campaign-1", {
        onProgress: expect.any(Function),
      });
    });

    await act(async () => {
      finishGeneration?.();
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/campaign/campaign-1/review");
    });
  });

  it("opens player setup after a premise-only world is created", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A haunted coast of guild cities.",
      createdAt: 1,
      updatedAt: 1,
      generationComplete: true,
    });
    mockedLoadCampaignKernel.mockResolvedValue({
      kernel: makeKernel(),
    });

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByTestId("campaign-forge")).toBeInTheDocument();
    });

    expect(screen.getByText("No World DNA")).toBeInTheDocument();
    expect(screen.getByTestId("world-dna-status")).toHaveTextContent("Optional");
    expect(screen.getByLabelText("Player concept")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create draft/ })).toBeDisabled();
    expect(screen.queryByText("World DNA required")).not.toBeInTheDocument();
    expect(screen.queryByText("Player creation locked")).not.toBeInTheDocument();
    expect(screen.queryByText("Accept World DNA first")).not.toBeInTheDocument();
  });

  it("shows the product world generation surface when World DNA exists before the world is created", async () => {
    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByTestId("worldgen-surface")).toBeInTheDocument();
    });

    expect(screen.getAllByText("World generation").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Tune the World DNA." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create world" })).toBeInTheDocument();
    const dnaList = screen.getByRole("list", { name: "Editable World DNA" });
    expect(within(dnaList).getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByLabelText("Geography seed text")).toHaveValue("Storm coast");
    expect(screen.getByRole("button", { name: "Re-roll all six" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save DNA" })).toBeDisabled();
    expect(screen.queryByText("Player setup opens after world review.")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("World generation progress")).not.toBeInTheDocument();
    expect(screen.queryByText("World DNA is ready to edit.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "World build" })).not.toBeInTheDocument();
    expect(screen.queryByText("Queued for generation.")).not.toBeInTheDocument();
    expect(screen.queryByText("queued")).not.toBeInTheDocument();
    expect(screen.getByText("World Review")).toBeInTheDocument();
    expect(screen.getByText("Player character")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Describe/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Import card/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Player concept")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Player override")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create draft/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Choose card/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save player/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("graph-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Compose graph/ })).not.toBeInTheDocument();
  });

  it("saves edited World DNA through the kernel boundary", async () => {
    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByLabelText("Geography seed text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Geography seed text"), {
      target: { value: "Flooded stations" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save DNA" }));

    await waitFor(() => {
      expect(mockedApplyWorldDna).toHaveBeenCalledWith("campaign-1", {
        seeds: {
          geography: "Flooded stations",
          politicalStructure: "Guild council",
          centralConflict: "Trade war",
          culturalFlavor: ["Lantern rites"],
          environment: "Storm season",
          wildcard: "Talking maps",
        },
      });
    });
  });

  it("re-rolls one World DNA field without exposing debug context", async () => {
    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByLabelText("Geography seed text")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Re-roll" })[0]!);

    await waitFor(() => {
      expect(mockedSuggestCampaignWorldDnaCategory).toHaveBeenCalledWith("campaign-1", "geography");
    });
    expect(screen.getByLabelText("Geography seed text")).toHaveValue("Flooded stations");
    expect(screen.queryByText("_researchArtifact")).not.toBeInTheDocument();
    expect(screen.queryByText("_ipContext")).not.toBeInTheDocument();
  });

  it("re-rolls all six World DNA fields into the editable draft", async () => {
    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Re-roll all six" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Re-roll all six" }));

    await waitFor(() => {
      expect(mockedSuggestCampaignWorldDna).toHaveBeenCalledWith("campaign-1");
    });
    expect(screen.getByLabelText("Geography seed text")).toHaveValue("Flooded stations");
    expect(screen.getByLabelText("Cultural Flavor seed text")).toHaveValue("Rail noir, Signal liturgy");
  });

  it("auto-saves dirty World DNA before creating the world", async () => {
    mockedGenerateWorld.mockResolvedValue({
      refinedPremise: "Refined world",
      locationCount: 12,
      npcCount: 14,
      factionCount: 5,
      loreCardCount: 20,
      loreStorageFailed: false,
      startingLocation: "Lantern Gate",
    });
    mockedLoadCampaign
      .mockResolvedValueOnce({
        id: "campaign-1",
        name: "Arcadia",
        premise: "A haunted coast of guild cities.",
        createdAt: 1,
        updatedAt: 1,
        generationComplete: false,
        seeds: FULL_SEEDS,
      })
      .mockResolvedValueOnce({
        id: "campaign-1",
        name: "Arcadia",
        premise: "A haunted coast of guild cities.",
        createdAt: 1,
        updatedAt: 2,
        generationComplete: true,
        seeds: FULL_SEEDS,
      });

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByLabelText("Geography seed text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Geography seed text"), {
      target: { value: "Flooded stations" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create world" }));

    await waitFor(() => {
      expect(mockedApplyWorldDna).toHaveBeenCalled();
      expect(mockedGenerateWorld).toHaveBeenCalled();
    });
    expect(mockedApplyWorldDna.mock.invocationCallOrder[0]).toBeLessThan(
      mockedGenerateWorld.mock.invocationCallOrder[0]!,
    );
  });

  it("starts world generation and routes to world review after completion", async () => {
    let finishGeneration: (() => void) | undefined;
    mockedGenerateWorld.mockImplementation((_campaignId, options) => new Promise((resolve) => {
      options?.onProgress?.({
        step: 3,
        totalSteps: 8,
        label: "Building locations...",
        subStep: 2,
        subTotal: 6,
        subLabel: "Location: Lantern Gate",
      });
      finishGeneration = () => resolve({
        refinedPremise: "Refined world",
        locationCount: 12,
        npcCount: 14,
        factionCount: 5,
        loreCardCount: 20,
        loreStorageFailed: false,
        startingLocation: "Lantern Gate",
      });
    }));
    mockedLoadCampaign
      .mockResolvedValueOnce({
        id: "campaign-1",
        name: "Arcadia",
        premise: "A haunted coast of guild cities.",
        createdAt: 1,
        updatedAt: 1,
        generationComplete: false,
        seeds: FULL_SEEDS,
      })
      .mockResolvedValueOnce({
        id: "campaign-1",
        name: "Arcadia",
        premise: "A haunted coast of guild cities.",
        createdAt: 1,
        updatedAt: 2,
        generationComplete: true,
        seeds: FULL_SEEDS,
      });

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create world" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create world" }));

    await waitFor(() => {
      expect(mockedGenerateWorld).toHaveBeenCalledWith("campaign-1", {
        onProgress: expect.any(Function),
      });
    });
    expect(screen.getByLabelText("World generation progress")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "World build" })).toBeInTheDocument();
    expect(screen.queryByText("Queued for generation.")).not.toBeInTheDocument();
    expect(screen.queryByText("queued")).not.toBeInTheDocument();
    expect(screen.getAllByText("Location: Lantern Gate").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Creating world" })).toBeDisabled();

    await act(async () => {
      finishGeneration?.();
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/campaign/campaign-1/review");
    });
  });

  it("keeps saved World DNA visible after the player is saved", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A haunted coast of guild cities.",
      createdAt: 1,
      updatedAt: 1,
      generationComplete: true,
      seeds: FULL_SEEDS,
    });
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
      }),
    });

    await renderPage("campaign-1");

    await waitFor(() => {
      expect(screen.getByText("World DNA accepted.")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Use World DNA/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Compose graph/ })).not.toBeInTheDocument();
    expect(screen.getByText("Storm coast")).toBeInTheDocument();
  });

  it("creates a player, saves cast, and prepares the campaign without showing graph controls", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A haunted coast of guild cities.",
      createdAt: 1,
      updatedAt: 1,
      generationComplete: true,
      seeds: FULL_SEEDS,
    });
    const draft = makeDraft();
    const savedKernel = makeKernel({
      phase: "cast_ready",
      worldDna: FULL_WORLD_DNA,
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

    expect(screen.queryByRole("button", { name: /Compose graph/ })).not.toBeInTheDocument();
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

    await waitFor(() => {
      expect(mockedComposeCampaignGraph).toHaveBeenCalledWith("campaign-1");
    });
    expect(screen.queryByTestId("graph-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Compose graph/ })).not.toBeInTheDocument();
  });
});
