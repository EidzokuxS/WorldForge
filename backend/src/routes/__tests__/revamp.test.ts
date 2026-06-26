import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  createDraftCampaignKernel,
  type CharacterDraft,
} from "@worldforge/shared";

const { ingestMock } = vi.hoisted(() => ({ ingestMock: vi.fn() }));

vi.mock("../../character/ingestion/index.js", async () => {
  const actualErrors = await vi.importActual<any>("../../character/ingestion/errors.js");
  return {
    ingestCharacterDraft: ingestMock,
    IngestionPipelineError: actualErrors.IngestionPipelineError,
  };
});

vi.mock("../../campaign/index.js", () => ({
  getActiveCampaign: vi.fn(),
  loadCampaign: vi.fn(),
  loadIpContext: vi.fn(() => null),
  loadPremiseDivergence: vi.fn(() => null),
}));

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(() => ({
    providers: [{ id: "p1", name: "P", baseUrl: "http://x", apiKey: "k", defaultModel: "m" }],
    generator: { providerId: "p1", model: "m", temperature: 0.7, maxTokens: 4096 },
    images: { providerId: "", model: "", stylePrompt: "", enabled: false },
    research: { enabled: false, maxSearchSteps: 3 },
    ui: { showRawReasoning: false },
  })),
}));

vi.mock("../../ai/index.js", () => ({
  resolveRoleModel: vi.fn(() => ({
    provider: { baseUrl: "http://x", model: "m", apiKey: "k" },
    temperature: 0.7,
    maxTokens: 4096,
  })),
}));

import { getActiveCampaign, loadCampaign } from "../../campaign/index.js";
import { readCampaignKernel, writeCampaignKernel } from "../../revamp/dna-adapter.js";
import revampRoutes from "../revamp.js";

const app = new Hono();
app.route("/api/revamp", revampRoutes);

const CAMPAIGN_ID = "campaign-a5b-route";

let originalCampaignRoot: string | undefined;
let campaignRoot: string;

const mockedGetActiveCampaign = vi.mocked(getActiveCampaign);
const mockedLoadCampaign = vi.mocked(loadCampaign);

function writeConfig(): void {
  const campaignDir = path.join(campaignRoot, CAMPAIGN_ID);
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir, "config.json"),
    JSON.stringify(
      {
        name: "A5b Route Campaign",
        premise: "A railway city under curfew.",
        createdAt: 1,
        updatedAt: 1,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function setLoadedCampaign(): void {
  const campaign = {
    id: CAMPAIGN_ID,
    name: "A5b Route Campaign",
    premise: "A railway city under curfew.",
    createdAt: 1,
    updatedAt: 1,
    generationComplete: false,
  };
  mockedGetActiveCampaign.mockReturnValue(campaign);
  mockedLoadCampaign.mockResolvedValue(campaign);
}

function makeDraft(
  name = "Mira Vale",
  role: CharacterDraft["identity"]["role"] = "player",
): CharacterDraft {
  return {
    identity: {
      role,
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
      personaSummary: `${name} watches the station clock.`,
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
      shortTermGoals: ["Find a way through the curfew"],
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
      sourceKind: role === "player" ? "player-input" : "import",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
  };
}

function writeCastReadyKernelWithLocation(): void {
  writeCampaignKernel(CAMPAIGN_ID, {
    ...createDraftCampaignKernel({
      id: CAMPAIGN_ID,
      premise: "A railway city under curfew.",
    }),
    phase: "cast_ready",
    worldGraph: {
      nodes: [
        {
          id: "location:station-gate",
          type: "Location",
          name: "Station Gate",
          data: {},
        },
      ],
      edges: [],
    },
    castRegistry: {
      playerCharacter: {
        id: "cast:player_created:mira",
        source: "player_created",
        characterDraft: makeDraft("Mira Vale"),
        campaignRole: "player",
        placement: {
          locationId: "location:station-gate",
          sceneLocationId: null,
          notes: [],
        },
        importance: "primary",
      },
      importedCast: [],
      generatedCast: [],
    },
  });
}

function writeCastReadyKernelWithSetupGraph(): void {
  writeCampaignKernel(CAMPAIGN_ID, {
    ...createDraftCampaignKernel({
      id: CAMPAIGN_ID,
      premise: "A railway city under curfew.",
    }),
    phase: "cast_ready",
    worldGraph: {
      nodes: [
        {
          id: "location:station-gate",
          type: "Location",
          name: "Station Gate",
          data: { description: "A curfew checkpoint." },
        },
        {
          id: "scene:platform-office",
          type: "SceneLocation",
          name: "Platform Office",
          data: { description: "A cramped office lit by timetable lamps." },
        },
        {
          id: "cast:player_created:mira",
          type: "Character",
          name: "Mira Vale",
          data: {},
        },
      ],
      edges: [
        {
          id: "edge:located_at:scene:platform-office:location:station-gate",
          fromId: "scene:platform-office",
          toId: "location:station-gate",
          type: "located_at",
          data: {},
        },
        {
          id: "edge:located_at:cast:player_created:mira:scene:platform-office",
          fromId: "cast:player_created:mira",
          toId: "scene:platform-office",
          type: "located_at",
          data: {},
        },
      ],
    },
    castRegistry: {
      playerCharacter: {
        id: "cast:player_created:mira",
        source: "player_created",
        characterDraft: makeDraft("Mira Vale"),
        campaignRole: "player",
        placement: {
          locationId: "location:station-gate",
          sceneLocationId: "scene:platform-office",
          notes: [],
        },
        importance: "primary",
      },
      importedCast: [],
      generatedCast: [],
    },
  });
}

function writeSetupReadyKernelWithOpeningGraph(): void {
  writeCampaignKernel(CAMPAIGN_ID, {
    ...createDraftCampaignKernel({
      id: CAMPAIGN_ID,
      premise: "A railway city under curfew.",
    }),
    phase: "setup_ready",
    worldGraph: {
      nodes: [
        {
          id: "scene:platform-office",
          type: "SceneLocation",
          name: "Platform Office",
          data: { description: "A cramped office lit by timetable lamps." },
        },
        {
          id: "cast:player_created:mira",
          type: "Character",
          name: "Mira Vale",
          data: {},
        },
      ],
      edges: [],
    },
    castRegistry: {
      playerCharacter: {
        id: "cast:player_created:mira",
        source: "player_created",
        characterDraft: makeDraft("Mira Vale"),
        campaignRole: "player",
        placement: {
          locationId: null,
          sceneLocationId: "scene:platform-office",
          notes: [],
        },
        importance: "primary",
      },
      importedCast: [],
      generatedCast: [],
    },
    startingSetup: {
      mode: "gm_invented",
      anchorSceneId: "scene:platform-office",
      playerCharacterId: "cast:player_created:mira",
      presentCastIds: ["cast:player_created:mira"],
      nearbyCastIds: [],
      activePressureIds: [],
      visibleHooks: [],
      hiddenTruthIds: [],
      openingSituation: "Start at Platform Office. A cramped office lit by timetable lamps.",
      openingQuestion: "What do you do?",
    },
  });
}

function writeActiveKernelWithChatGraph(): void {
  writeCampaignKernel(CAMPAIGN_ID, {
    ...createDraftCampaignKernel({
      id: CAMPAIGN_ID,
      premise: "A railway city under curfew.",
    }),
    phase: "active",
    worldGraph: {
      nodes: [
        {
          id: "scene:platform-office",
          type: "SceneLocation",
          name: "Platform Office",
          data: { description: "A cramped office lit by timetable lamps." },
        },
        {
          id: "cast:player_created:mira",
          type: "Character",
          name: "Mira Vale",
          data: {},
        },
      ],
      edges: [],
    },
    castRegistry: {
      playerCharacter: {
        id: "cast:player_created:mira",
        source: "player_created",
        characterDraft: makeDraft("Mira Vale"),
        campaignRole: "player",
        placement: {
          locationId: null,
          sceneLocationId: "scene:platform-office",
          notes: [],
        },
        importance: "primary",
      },
      importedCast: [],
      generatedCast: [],
    },
    startingSetup: {
      mode: "gm_invented",
      anchorSceneId: "scene:platform-office",
      playerCharacterId: "cast:player_created:mira",
      presentCastIds: ["cast:player_created:mira"],
      nearbyCastIds: [],
      activePressureIds: [],
      visibleHooks: [],
      hiddenTruthIds: [],
      openingSituation: "Start at Platform Office. A cramped office lit by timetable lamps.",
      openingQuestion: "What do you do?",
    },
    chatSession: {
      turns: [{ role: "assistant", content: "Opening.", createdAt: 100 }],
    },
    turnIndex: 1,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ingestMock.mockReset();
  originalCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
  campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-a5b-route-"));
  process.env.GSD_CAMPAIGNS_ROOT = campaignRoot;
  writeConfig();
  setLoadedCampaign();
});

afterEach(() => {
  if (originalCampaignRoot === undefined) {
    delete process.env.GSD_CAMPAIGNS_ROOT;
  } else {
    process.env.GSD_CAMPAIGNS_ROOT = originalCampaignRoot;
  }
  fs.rmSync(campaignRoot, { recursive: true, force: true });
});

describe("revamp routes", () => {
  it("returns a draft kernel without old worldgen generation", async () => {
    const res = await app.request(`/api/revamp/campaigns/${CAMPAIGN_ID}/kernel`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kernel).toMatchObject({
      campaignId: CAMPAIGN_ID,
      phase: "draft",
      premise: "A railway city under curfew.",
      castRegistry: {
        playerCharacter: null,
        importedCast: [],
        generatedCast: [],
      },
    });
  });

  it("parses a revamp player draft through the revamp API boundary", async () => {
    ingestMock.mockResolvedValueOnce(makeDraft());

    const res = await app.request(`/api/revamp/campaigns/${CAMPAIGN_ID}/player/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        concept: "A courier with a forbidden railway pass.",
        overrideText: "Make the pass a family relic.",
      }),
    });

    expect(res.status).toBe(200);
    expect(ingestMock).toHaveBeenCalledTimes(1);
    const input = ingestMock.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      mode: "parse",
      campaignId: CAMPAIGN_ID,
      role: "player",
      freeText: "A courier with a forbidden railway pass.",
      overrideText: "Make the pass a family relic.",
      locationNames: [],
      factionNames: [],
    });
    const body = await res.json();
    expect(body.draft.identity.displayName).toBe("Mira Vale");
  });

  it("imports a V2 card through the revamp API boundary", async () => {
    ingestMock.mockResolvedValueOnce(makeDraft("Imported Hero"));

    const res = await app.request(`/api/revamp/campaigns/${CAMPAIGN_ID}/player/import-v2-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Imported Hero",
        description: "A card payload",
        personality: "calm",
        scenario: "station platform",
        tags: ["rail"],
        importMode: "outsider",
      }),
    });

    expect(res.status).toBe(200);
    const input = ingestMock.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      mode: "import",
      campaignId: CAMPAIGN_ID,
      role: "player",
      v2Card: {
        name: "Imported Hero",
        description: "A card payload",
        personality: "calm",
        scenario: "station platform",
        tags: ["rail"],
        importMode: "outsider",
      },
    });
  });

  it("saves a player draft into kernel cast registry", async () => {
    const draft = makeDraft("Mira Vale");

    const res = await app.request(`/api/revamp/campaigns/${CAMPAIGN_ID}/cast/player`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft,
        source: "player_created",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kernel.phase).toBe("cast_ready");
    expect(body.playerCharacter).toMatchObject({
      source: "player_created",
      campaignRole: "player",
      characterDraft: {
        identity: {
          role: "player",
          displayName: "Mira Vale",
        },
      },
    });
    expect(readCampaignKernel(CAMPAIGN_ID)?.castRegistry.playerCharacter?.characterDraft.identity.displayName)
      .toBe("Mira Vale");
  });

  it("rejects NPC drafts at the player cast route", async () => {
    const res = await app.request(`/api/revamp/campaigns/${CAMPAIGN_ID}/cast/player`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft: makeDraft("Gate Warden", "npc"),
        source: "player_created",
      }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "A5b player cast requires a player CharacterDraft.",
    });
  });

  it("composes the revamp world graph through the revamp API boundary", async () => {
    writeCastReadyKernelWithLocation();

    const res = await app.request(`/api/revamp/campaigns/${CAMPAIGN_ID}/graph/compose`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kernel.phase).toBe("cast_ready");
    expect(body.worldGraph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "cast:player_created:mira",
          type: "Character",
          name: "Mira Vale",
        }),
      ]),
    );
    expect(body.worldGraph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "edge:located_at:cast:player_created:mira:location:station-gate",
          fromId: "cast:player_created:mira",
          toId: "location:station-gate",
          type: "located_at",
        }),
      ]),
    );
    expect(readCampaignKernel(CAMPAIGN_ID)?.worldGraph).toEqual(body.worldGraph);
  });

  it("creates starting setup through the revamp API boundary", async () => {
    writeCastReadyKernelWithSetupGraph();

    const res = await app.request(`/api/revamp/campaigns/${CAMPAIGN_ID}/setup/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "gm_invented" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kernel.phase).toBe("setup_ready");
    expect(body.startingSetup).toMatchObject({
      mode: "gm_invented",
      anchorSceneId: "scene:platform-office",
      playerCharacterId: "cast:player_created:mira",
      presentCastIds: ["cast:player_created:mira"],
      openingSituation: "Start at Platform Office. A cramped office lit by timetable lamps.",
      openingQuestion: "What do you do?",
    });
    expect(readCampaignKernel(CAMPAIGN_ID)?.startingSetup).toEqual(body.startingSetup);
  });

  it("creates the opening through the revamp API boundary", async () => {
    writeSetupReadyKernelWithOpeningGraph();

    const res = await app.request(`/api/revamp/campaigns/${CAMPAIGN_ID}/opening`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kernel.phase).toBe("active");
    expect(body.opening.text).toContain("Start at Platform Office.");
    expect(body.opening.suggestedActions).toEqual(["Look around"]);
    const storedKernel = readCampaignKernel(CAMPAIGN_ID);
    expect(storedKernel?.phase).toBe("active");
    expect(storedKernel?.chatSession.turns[0]?.role).toBe("assistant");
    expect(storedKernel?.chatSession.turns[0]?.content).toBe(body.opening.text);
  });

  it("processes a chat message through the revamp API boundary", async () => {
    writeActiveKernelWithChatGraph();

    const res = await app.request(`/api/revamp/campaigns/${CAMPAIGN_ID}/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Look around" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kernel.phase).toBe("active");
    expect(body.kernel.turnIndex).toBe(3);
    expect(body.response.text).toContain("You take in Platform Office.");
    expect(body.response.suggestedActions).toEqual(["Look around"]);
    expect(body.userTurn).toMatchObject({
      role: "user",
      content: "Look around",
    });
    expect(body.assistantTurn).toMatchObject({
      role: "assistant",
      content: body.response.text,
    });
    const storedKernel = readCampaignKernel(CAMPAIGN_ID);
    expect(storedKernel?.chatSession.turns).toHaveLength(3);
    expect(storedKernel?.chatSession.turns[1]?.role).toBe("user");
    expect(storedKernel?.chatSession.turns[2]?.content).toBe(body.response.text);
  });
});
