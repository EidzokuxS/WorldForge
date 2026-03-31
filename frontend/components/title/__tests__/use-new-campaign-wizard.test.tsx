import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/lib/types";
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
const mockWorldbookToIpContext = vi.fn();

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
  worldbookToIpContext: (...args: unknown[]) => mockWorldbookToIpContext(...args),
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
  fallback: { providerId: "", model: "", timeoutMs: 1000, retryCount: 0 },
  images: { providerId: "", model: "", stylePrompt: "", enabled: false },
  research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
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
    await result.current.handleWorldBookUpload(file);
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
    expect(mockWorldbookToIpContext).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});
