import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDraftCampaignKernel,
  type CharacterDraft,
  type CampaignCastMember,
} from "@worldforge/shared";
import { readCampaignKernel, writeCampaignKernel } from "../dna-adapter.js";
import { createCampaignChatMessage } from "../chat-kernel.js";

const CAMPAIGN_ID = "campaign-a9";

let originalCampaignRoot: string | undefined;
let campaignRoot: string;

function writeConfig(): void {
  const campaignDir = path.join(campaignRoot, CAMPAIGN_ID);
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir, "config.json"),
    JSON.stringify(
      {
        name: "A9 Campaign",
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

function makeDraft(name: string, role: CharacterDraft["identity"]["role"]): CharacterDraft {
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
      personaSummary: `${name} watches the platform.`,
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: null,
      relationshipRefs: [],
      socialStatus: [],
      originMode: role === "player" ? "native" : "resident",
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
      sourceKind: role === "player" ? "player-input" : "import",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
  };
}

function makeMember(id: string, name: string, role: "player" | "npc"): CampaignCastMember {
  return {
    id,
    source: role === "player" ? "player_created" : "npc_imported",
    characterDraft: makeDraft(name, role),
    campaignRole: role === "player" ? "player" : "minor_npc",
    placement: {
      locationId: null,
      sceneLocationId: null,
      notes: [],
    },
    importance: role === "player" ? "primary" : "minor",
  };
}

const PLAYER = makeMember("cast:player_created:mira", "Mira Vale", "player");
const WARDEN = makeMember("cast:npc_imported:warden", "Gate Warden", "npc");

function writeActiveKernel(overrides: Partial<ReturnType<typeof createDraftCampaignKernel>> = {}): void {
  writeCampaignKernel(CAMPAIGN_ID, {
    ...createDraftCampaignKernel({
      id: CAMPAIGN_ID,
      premise: "A railway city under curfew.",
    }),
    phase: "active",
    worldGraph: {
      nodes: [
        {
          id: "scene:platform",
          type: "SceneLocation",
          name: "Platform Office",
          data: { description: "A cramped office lit by timetable lamps." },
        },
        {
          id: PLAYER.id,
          type: "Character",
          name: "Mira Vale",
          data: {},
        },
        {
          id: WARDEN.id,
          type: "Character",
          name: "Gate Warden",
          data: {},
        },
      ],
      edges: [],
    },
    castRegistry: {
      playerCharacter: PLAYER,
      importedCast: [WARDEN],
      generatedCast: [],
    },
    startingSetup: {
      mode: "gm_invented",
      anchorSceneId: "scene:platform",
      playerCharacterId: PLAYER.id,
      presentCastIds: [PLAYER.id, WARDEN.id],
      nearbyCastIds: [],
      activePressureIds: [],
      visibleHooks: [],
      hiddenTruthIds: [],
      openingSituation: "Start at Platform Office. A cramped office lit by timetable lamps.",
      openingQuestion: "What do you do?",
    },
    chatSession: {
      turns: [{ role: "assistant", content: "Opening.", createdAt: 100 }],
      pendingSoftStateHints: [],
    },
    runtimeState: {
      currentSceneId: "scene:platform",
    },
    turnIndex: 1,
    ...overrides,
  });
}

describe("campaign kernel chat kernel", () => {
  beforeEach(() => {
    originalCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-a9-"));
    process.env.GSD_CAMPAIGNS_ROOT = campaignRoot;
    writeConfig();
  });

  afterEach(() => {
    if (originalCampaignRoot === undefined) {
      delete process.env.GSD_CAMPAIGNS_ROOT;
    } else {
      process.env.GSD_CAMPAIGNS_ROOT = originalCampaignRoot;
    }
    fs.rmSync(campaignRoot, { recursive: true, force: true });
  });

  it("persists user and assistant turns and advances turn index", () => {
    writeActiveKernel();

    const result = createCampaignChatMessage({
      campaignId: CAMPAIGN_ID,
      message: " Talk to Gate Warden ",
      createdAt: 200,
    });

    expect(result.kernel.phase).toBe("active");
    expect(result.kernel.turnIndex).toBe(3);
    expect(result.userTurn).toEqual({
      role: "user",
      content: "Talk to Gate Warden",
      createdAt: 200,
    });
    expect(result.assistantTurn).toEqual({
      role: "assistant",
      content: result.response.text,
      createdAt: 200,
    });
    expect(result.kernel.chatSession.turns).toEqual([
      { role: "assistant", content: "Opening.", createdAt: 100 },
      result.userTurn,
      result.assistantTurn,
    ]);
    expect(result.kernel.chatSession.pendingSoftStateHints).toEqual(result.response.softStateHints);
    expect(readCampaignKernel(CAMPAIGN_ID)).toEqual(result.kernel);
  });

  it("fails before active", () => {
    writeActiveKernel({ phase: "setup_ready" });

    expect(() =>
      createCampaignChatMessage({ campaignId: CAMPAIGN_ID, message: "Look around" }),
    ).toThrow("Campaign kernel phase setup_ready cannot process A9 chat.");
  });

  it("fails without an opening assistant turn", () => {
    writeActiveKernel({
      chatSession: {
        turns: [],
        pendingSoftStateHints: [],
      },
    });

    expect(() =>
      createCampaignChatMessage({ campaignId: CAMPAIGN_ID, message: "Look around" }),
    ).toThrow("A9 chat requires an opening assistant turn.");
  });

  it("fails on an empty direct message", () => {
    writeActiveKernel();

    expect(() =>
      createCampaignChatMessage({ campaignId: CAMPAIGN_ID, message: "   " }),
    ).toThrow("A9 chat requires a user message.");
  });
});
