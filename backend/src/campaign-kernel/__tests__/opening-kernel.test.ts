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
import { createCampaignOpening } from "../opening-kernel.js";

const CAMPAIGN_ID = "campaign-a8";

let originalCampaignRoot: string | undefined;
let campaignRoot: string;

function writeConfig(): void {
  const campaignDir = path.join(campaignRoot, CAMPAIGN_ID);
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir, "config.json"),
    JSON.stringify(
      {
        name: "A8 Campaign",
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

function writeSetupReadyKernel(overrides: Partial<ReturnType<typeof createDraftCampaignKernel>> = {}): void {
  writeCampaignKernel(CAMPAIGN_ID, {
    ...createDraftCampaignKernel({
      id: CAMPAIGN_ID,
      premise: "A railway city under curfew.",
    }),
    phase: "setup_ready",
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
    runtimeState: {
      currentSceneId: "scene:platform",
    },
    ...overrides,
  });
}

describe("campaign kernel opening kernel", () => {
  beforeEach(() => {
    originalCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-a8-"));
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

  it("persists the opening as the first assistant turn and activates the campaign", () => {
    writeSetupReadyKernel();

    const result = createCampaignOpening({ campaignId: CAMPAIGN_ID, createdAt: 123 });

    expect(result.kernel.phase).toBe("active");
    expect(result.kernel.turnIndex).toBe(1);
    expect(result.kernel.runtimeState.currentSceneId).toBe("scene:platform");
    expect(result.kernel.chatSession.turns).toEqual([
      {
        role: "assistant",
        content: result.opening.text,
        createdAt: 123,
      },
    ]);
    expect(result.opening.suggestedActions).toEqual([
      "Look around",
      "Talk to Gate Warden",
    ]);
    expect(readCampaignKernel(CAMPAIGN_ID)).toEqual(result.kernel);
  });

  it("fails before setup_ready", () => {
    writeSetupReadyKernel({ phase: "cast_ready" });

    expect(() => createCampaignOpening({ campaignId: CAMPAIGN_ID })).toThrow(
      "Campaign kernel phase cast_ready cannot create A8 opening.",
    );
  });

  it("fails when chat already contains turns", () => {
    writeSetupReadyKernel({
    chatSession: {
        turns: [{ role: "assistant", content: "Already open.", createdAt: 1 }],
        pendingSoftStateHints: [],
      },
    });

    expect(() => createCampaignOpening({ campaignId: CAMPAIGN_ID })).toThrow(
      "A8 opening requires an empty chat session.",
    );
  });
});
