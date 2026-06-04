import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpResearchContext, PremiseDivergence, Settings } from "@/lib/types";
import type { WorldgenResearchArtifactV2 } from "@worldforge/shared";
import { useNewCampaignWizard } from "../use-new-campaign-wizard";

const mockPush = vi.fn();

const mockGenerateWorld = vi.fn();
const mockSuggestSeed = vi.fn();
const mockSuggestSeeds = vi.fn();
const mockClassifyWorldBook = vi.fn();
const mockApiPost = vi.fn();
const mockLoadCampaign = vi.fn();
const mockGetWorldData = vi.fn();
const mockGetWorldgenDebugProgress = vi.fn();
const mockListWorldbookLibrary = vi.fn();
const mockImportWorldbookLibrary = vi.fn();
const mockWorldbookToIpResearchContext = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/settings", () => ({
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("@/lib/api", () => ({
  generateWorld: (...args: unknown[]) => mockGenerateWorld(...args),
  suggestSeed: (...args: unknown[]) => mockSuggestSeed(...args),
  suggestSeeds: (...args: unknown[]) => mockSuggestSeeds(...args),
  classifyWorldBook: (...args: unknown[]) => mockClassifyWorldBook(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  loadCampaign: (...args: unknown[]) => mockLoadCampaign(...args),
  getWorldData: (...args: unknown[]) => mockGetWorldData(...args),
  getWorldgenDebugProgress: (...args: unknown[]) => mockGetWorldgenDebugProgress(...args),
  listWorldbookLibrary: (...args: unknown[]) => mockListWorldbookLibrary(...args),
  importWorldbookLibrary: (...args: unknown[]) => mockImportWorldbookLibrary(...args),
  worldbookToIpResearchContext: (...args: unknown[]) => mockWorldbookToIpResearchContext(...args),
}));

type WorldbookLibraryItem = {
  id: string;
  displayName: string;
  originalFileName: string;
  normalizedSourceHash: string;
  entryCount: number;
  classificationVersion: number;
  createdAt: number;
  updatedAt: number;
};

type WizardWithWorldbooks = ReturnType<typeof useNewCampaignWizard> & {
  worldbookLibrary: WorldbookLibraryItem[];
  selectedWorldbooks: WorldbookLibraryItem[];
};

const SETTINGS: Settings = {
  providers: [
    {
      id: "generator",
      name: "Generator",
      baseUrl: "https://example.com/v1",
      apiKey: "secret",
      defaultModel: "test-model",
    },
  ],
  judge: { providerId: "generator", model: "test-model", temperature: 0, maxTokens: 128 },
  storyteller: { providerId: "generator", model: "test-model", temperature: 0.8, maxTokens: 256 },
  generator: { providerId: "generator", model: "test-model", temperature: 0.8, maxTokens: 256 },
  embedder: { providerId: "generator", model: "test-model", temperature: 0, maxTokens: 64 },
  images: { providerId: "", model: "", stylePrompt: "", enabled: false },
  research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
  ui: { showRawReasoning: false },
};

const LIBRARY_ITEMS: WorldbookLibraryItem[] = [
  {
    id: "wb-alpha",
    displayName: "Alpha Codex",
    originalFileName: "alpha.json",
    normalizedSourceHash: "hash-alpha",
    entryCount: 12,
    classificationVersion: 1,
    createdAt: 100,
    updatedAt: 100,
  },
  {
    id: "wb-beta",
    displayName: "Beta Atlas",
    originalFileName: "beta.json",
    normalizedSourceHash: "hash-beta",
    entryCount: 7,
    classificationVersion: 1,
    createdAt: 200,
    updatedAt: 250,
  },
];

const RESEARCH_ARTIFACT: WorldgenResearchArtifactV2 = {
  version: 2,
  rawPremise: "Jujutsu Kaisen world with Naruto power system",
  rawKnownIP: "Jujutsu Kaisen",
  researchBrief: {
    interpretationSummary: "Use Jujutsu Kaisen as the world basis and Naruto as the power system overlay.",
    ambiguityNotes: [],
    sourceUsageRules: [],
    searchJobs: [],
  },
  searchResults: [],
  generatedContext: {
    keyFacts: ["Tokyo Jujutsu High anchors the setting."],
    tonalNotes: ["Occult action"],
    canonicalNames: {
      characters: ["Satoru Gojo"],
    },
  },
  provenance: {
    createdAt: "2026-04-26T00:00:00.000Z",
    model: "test-model",
    searchProvider: "test",
  },
};

function createWorldbookFile(name = "library-import.json"): File {
  return new File(
    [JSON.stringify({ entries: { lore: { content: "Ancient lore", name: "Lore" } } })],
    name,
    { type: "application/json" },
  );
}

async function openWizard(result: { current: ReturnType<typeof useNewCampaignWizard> }) {
  await act(async () => {
    result.current.handleOpenChange(true);
    await Promise.resolve();
  });
}

async function uploadWorldbook(result: { current: ReturnType<typeof useNewCampaignWizard> }, file = createWorldbookFile()) {
  await act(async () => {
    await result.current.handleWorldbookUpload(file);
  });
}

describe("useNewCampaignWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGenerateWorld.mockResolvedValue({
      startingLocation: "North Gate",
      locationCount: 3,
      npcCount: 2,
      factionCount: 1,
    });
    mockLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "",
      createdAt: 1,
      updatedAt: 1,
    });
    mockGetWorldData.mockResolvedValue({ locations: [], npcs: [], factions: [], relationships: [], items: [], player: null });
    mockGetWorldgenDebugProgress.mockResolvedValue({ active: [], recent: [] });
    mockListWorldbookLibrary.mockResolvedValue({ items: LIBRARY_ITEMS });
    mockImportWorldbookLibrary.mockResolvedValue({
      item: LIBRARY_ITEMS[1],
      existed: false,
    });
    mockSuggestSeeds.mockResolvedValue({
      geography: "Cliffside kingdoms",
      politicalStructure: "Merchant republics",
      centralConflict: "An occult trade war",
      culturalFlavor: ["masked festivals"],
      environment: "Sea caves",
      wildcard: "Whispering relics",
      _ipContext: null,
      _premiseDivergence: null,
    });
    mockSuggestSeed.mockResolvedValue({
      category: "geography",
      value: "Veiled Tokyo wards",
    });
    mockApiPost.mockImplementation(async (path: string, body?: unknown) => {
      if (path === "/api/campaigns") {
        return {
          id: "campaign-1",
          name: (body as { name: string }).name,
          premise: (body as { premise: string }).premise,
          createdAt: 1,
          updatedAt: 1,
        };
      }
      throw new Error(`Unexpected apiPost path: ${path}`);
    });
  });

  it("loads reusable library items when the wizard opens", async () => {
    const { result } = renderHook(() => useNewCampaignWizard(SETTINGS, vi.fn()));

    await openWizard(result);

    await waitFor(() => {
      expect(mockListWorldbookLibrary).toHaveBeenCalledTimes(1);
    });

    expect((result.current as WizardWithWorldbooks).worldbookLibrary).toEqual(LIBRARY_ITEMS);
    expect((result.current as WizardWithWorldbooks).selectedWorldbooks).toEqual([]);
  });

  it("keeps the loaded reusable library when a fresh campaign reset clears the draft", async () => {
    const { result } = renderHook(() => useNewCampaignWizard(SETTINGS, vi.fn()));

    await openWizard(result);

    await waitFor(() => {
      expect((result.current as WizardWithWorldbooks).worldbookLibrary).toEqual(LIBRARY_ITEMS);
    });

    act(() => {
      result.current.setCampaignName("Arcadia");
      result.current.toggleWorldbookSelection(LIBRARY_ITEMS[0]);
      result.current.resetFlow();
    });

    expect(result.current.campaignName).toBe("");
    expect((result.current as WizardWithWorldbooks).worldbookLibrary).toEqual(LIBRARY_ITEMS);
    expect((result.current as WizardWithWorldbooks).selectedWorldbooks).toEqual([]);
  });

  it("imports a new JSON worldbook into the reusable library and auto-selects it", async () => {
    const { result } = renderHook(() => useNewCampaignWizard(SETTINGS, vi.fn()));

    await openWizard(result);
    await uploadWorldbook(result, createWorldbookFile("beta.json"));

    await waitFor(() => {
      expect(mockImportWorldbookLibrary).toHaveBeenCalledTimes(1);
    });

    expect((result.current as WizardWithWorldbooks).worldbookLibrary).toEqual(LIBRARY_ITEMS);
    expect((result.current as WizardWithWorldbooks).selectedWorldbooks).toEqual([LIBRARY_ITEMS[1]]);
  });

  it("sends selectedWorldbooks to DNA suggestions instead of client-side worldbook entries", async () => {
    const { result } = renderHook(() => useNewCampaignWizard(SETTINGS, vi.fn()));

    await openWizard(result);
    await uploadWorldbook(result);
    act(() => {
      result.current.setCampaignName("Arcadia");
      result.current.setCampaignPremise("A haunted coast of guild cities.");
    });

    await act(async () => {
      await result.current.handleNextToDna();
    });

    expect(mockSuggestSeeds).toHaveBeenCalledWith(
      "A haunted coast of guild cities.",
      expect.objectContaining({
        name: "Arcadia",
        selectedWorldbooks: [LIBRARY_ITEMS[1]],
      }),
    );
    expect(mockSuggestSeeds.mock.calls[0]?.[1]).not.toHaveProperty("worldbookEntries");
  });

  it("creates campaigns with worldbookSelection and never rebuilds ipContext in the browser", async () => {
    const onCreated = vi.fn();
    const { result } = renderHook(() => useNewCampaignWizard(SETTINGS, onCreated));

    await openWizard(result);
    await uploadWorldbook(result);
    act(() => {
      result.current.setCampaignName("Arcadia");
    });

    await act(async () => {
      await result.current.handleCreateWithSeeds();
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/campaigns",
      expect.objectContaining({
        name: "Arcadia",
        premise: "",
        worldbookSelection: [LIBRARY_ITEMS[1]],
      }),
    );
    expect(mockWorldbookToIpResearchContext).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("passes the source hint and research flag through direct world creation", async () => {
    const { result } = renderHook(() => useNewCampaignWizard(SETTINGS, vi.fn()));

    act(() => {
      result.current.setCampaignName("Naruto x JJK");
      result.current.setCampaignPremise("Jujutsu Kaisen world with Naruto power system");
      result.current.setCampaignFranchise("Jujutsu Kaisen / Naruto");
      result.current.setResearchEnabled(false);
    });

    await act(async () => {
      await result.current.handleCreateWithSeeds();
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/campaigns",
      expect.objectContaining({
        name: "Naruto x JJK",
        premise: "Jujutsu Kaisen world with Naruto power system",
        worldgenSourceHint: "Jujutsu Kaisen / Naruto",
        worldgenResearchEnabled: false,
      }),
    );
  });

  it("retries world generation on the already-created campaign after generation failure", async () => {
    const onCreated = vi.fn();
    mockGenerateWorld.mockRejectedValueOnce(new Error("provider failed"));
    const { result } = renderHook(() => useNewCampaignWizard(SETTINGS, onCreated));

    act(() => {
      result.current.setCampaignName("Arcadia");
      result.current.setCampaignPremise("A haunted coast of guild cities.");
    });

    await act(async () => {
      await result.current.handleCreateWithSeeds();
    });

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockGenerateWorld).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleCreateWithSeeds();
    });

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockGenerateWorld).toHaveBeenCalledTimes(2);
    expect(mockGenerateWorld).toHaveBeenLastCalledWith(
      "campaign-1",
      expect.any(Function),
      null,
      null,
      null,
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("carries the research artifact from DNA suggestions into reroll and generation", async () => {
    const { result } = renderHook(() => useNewCampaignWizard(SETTINGS, vi.fn()));

    mockSuggestSeeds.mockResolvedValueOnce({
      geography: "Tokyo districts",
      politicalStructure: "Jujutsu institutions",
      centralConflict: "Curses spill into the public world",
      culturalFlavor: ["Hidden sorcery"],
      environment: "Urban occult frontiers",
      wildcard: "Chakra-like cursed techniques",
      _ipContext: null,
      _premiseDivergence: null,
      _researchArtifact: RESEARCH_ARTIFACT,
    });

    act(() => {
      result.current.setCampaignName("Shibuya Nexus");
      result.current.setCampaignPremise("Jujutsu Kaisen world with Naruto power system");
      result.current.setCampaignFranchise("Jujutsu Kaisen");
    });

    await act(async () => {
      await result.current.handleNextToDna();
    });

    await act(async () => {
      await result.current.handleResuggestCategory("geography");
    });

    expect(mockSuggestSeed).toHaveBeenCalledWith(
      "Jujutsu Kaisen world with Naruto power system",
      "geography",
      null,
      null,
      RESEARCH_ARTIFACT,
    );

    await act(async () => {
      await result.current.handleCreateWithDna();
    });

    expect(mockGenerateWorld).toHaveBeenCalledWith(
      "campaign-1",
      expect.any(Function),
      null,
      null,
      RESEARCH_ARTIFACT,
    );
  });

  it("clears stale legacy context when full seed suggestions return null authority fields", async () => {
    const legacyIpResearchContext: IpResearchContext = {
      franchise: "Legacy Source",
      keyFacts: ["A previous source should not leak into the next world."],
      tonalNotes: ["stale"],
      source: "llm",
    };
    const legacyPremiseDivergence: PremiseDivergence = {
      mode: "diverged",
      protagonistRole: {
        kind: "custom",
        interpretation: "newcomer",
        roleSummary: "Stale legacy protagonist role.",
      },
      preservedCanonFacts: [],
      changedCanonFacts: ["This should be cleared."],
      currentStateDirectives: ["Do not leak this into generation."],
      ambiguityNotes: [],
    };

    mockSuggestSeeds
      .mockResolvedValueOnce({
        geography: "Legacy city",
        politicalStructure: "Legacy council",
        centralConflict: "Legacy conflict",
        culturalFlavor: ["Legacy custom"],
        environment: "Legacy environment",
        wildcard: "Legacy wildcard",
        _ipContext: legacyIpResearchContext,
        _premiseDivergence: legacyPremiseDivergence,
        _researchArtifact: null,
      })
      .mockResolvedValueOnce({
        geography: "Clean coast",
        politicalStructure: "Open harbor",
        centralConflict: "Smugglers fight dock guilds",
        culturalFlavor: ["Salt markets"],
        environment: "Storm reefs",
        wildcard: "Clockwork lighthouse",
        _ipContext: null,
        _premiseDivergence: null,
        _researchArtifact: null,
      });

    const { result } = renderHook(() => useNewCampaignWizard(SETTINGS, vi.fn()));

    act(() => {
      result.current.setCampaignName("Clean Slate");
      result.current.setCampaignPremise("A new coast with no known-IP source.");
    });

    await act(async () => {
      await result.current.handleNextToDna();
    });

    await act(async () => {
      await result.current.handleResuggestAll();
    });

    await act(async () => {
      await result.current.handleCreateWithDna();
    });

    expect(mockGenerateWorld).toHaveBeenCalledWith(
      "campaign-1",
      expect.any(Function),
      null,
      null,
      null,
    );
  });

  it("carries a restored research artifact from the saved campaign-new session into generation", async () => {
    const dnaState = {
      geography: {
        enabled: true,
        isCustom: false,
        value: "Tokyo wards divided by curse barriers",
      },
      politicalStructure: { enabled: false, isCustom: false, value: "" },
      centralConflict: { enabled: false, isCustom: false, value: "" },
      culturalFlavor: { enabled: false, isCustom: false, value: [] },
      environment: { enabled: false, isCustom: false, value: "" },
      wildcard: { enabled: false, isCustom: false, value: "" },
    };
    const initialSession = {
      version: 1 as const,
      campaignName: "Shibuya Nexus",
      campaignPremise: "Jujutsu Kaisen world with Naruto power system",
      campaignFranchise: "Jujutsu Kaisen",
      researchEnabled: true,
      selectedWorldbooks: [],
      dnaState,
      step: 2 as const,
      phase: { kind: "idle" as const },
      generationProgress: null,
      researchArtifact: RESEARCH_ARTIFACT,
    };
    const { result } = renderHook(() =>
      useNewCampaignWizard(SETTINGS, vi.fn(), { initialSession }),
    );

    await act(async () => {
      await result.current.handleCreateWithDna();
    });

    expect(mockGenerateWorld).toHaveBeenCalledWith(
      "campaign-1",
      expect.any(Function),
      null,
      null,
      RESEARCH_ARTIFACT,
    );
  });

  it("invalidates prepared DNA when the concept changes before generation", async () => {
    const { result } = renderHook(() => useNewCampaignWizard(SETTINGS, vi.fn()));

    act(() => {
      result.current.setCampaignName("Arcadia");
      result.current.setCampaignPremise("A haunted coast.");
    });

    await act(async () => {
      await result.current.handleNextToDna();
    });

    expect(result.current.step).toBe(2);
    expect(result.current.dnaState?.geography.value).toBe("Cliffside kingdoms");

    act(() => {
      result.current.setCampaignPremise("A drowned observatory.");
    });

    expect(result.current.step).toBe(1);
    expect(result.current.dnaState).toBeNull();
    expect(result.current.researchArtifact).toBeNull();
  });
});
