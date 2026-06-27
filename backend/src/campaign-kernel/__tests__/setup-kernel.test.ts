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
import { createCampaignStartingSetup } from "../setup-kernel.js";

const CAMPAIGN_ID = "campaign-a7";

let originalCampaignRoot: string | undefined;
let campaignRoot: string;

function writeConfig(): void {
  const campaignDir = path.join(campaignRoot, CAMPAIGN_ID);
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir, "config.json"),
    JSON.stringify(
      {
        name: "A7 Campaign",
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

function writeCastReadySetupGraph(): void {
  writeCampaignKernel(CAMPAIGN_ID, {
    ...createDraftCampaignKernel({
      id: CAMPAIGN_ID,
      premise: "A railway city under curfew.",
    }),
    phase: "cast_ready",
    worldGraph: {
      nodes: [
        {
          id: "location:station",
          type: "Location",
          name: "Station Gate",
          data: { description: "A curfew checkpoint." },
        },
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
      edges: [
        {
          id: "edge:located_at:scene:platform:location:station",
          fromId: "scene:platform",
          toId: "location:station",
          type: "located_at",
          data: {},
        },
        {
          id: `edge:located_at:${PLAYER.id}:scene:platform`,
          fromId: PLAYER.id,
          toId: "scene:platform",
          type: "located_at",
          data: {},
        },
        {
          id: `edge:located_at:${WARDEN.id}:scene:platform`,
          fromId: WARDEN.id,
          toId: "scene:platform",
          type: "located_at",
          data: {},
        },
      ],
    },
    castRegistry: {
      playerCharacter: PLAYER,
      importedCast: [WARDEN],
      generatedCast: [],
    },
  });
}

describe("campaign kernel setup kernel", () => {
  beforeEach(() => {
    originalCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-a7-"));
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

  it("persists starting setup and advances to setup_ready", () => {
    writeCastReadySetupGraph();

    const kernel = createCampaignStartingSetup({ campaignId: CAMPAIGN_ID });

    expect(kernel.phase).toBe("setup_ready");
    expect(kernel.startingSetup).toMatchObject({
      mode: "gm_invented",
      anchorSceneId: "scene:platform",
      playerCharacterId: PLAYER.id,
      presentCastIds: [PLAYER.id, WARDEN.id],
      openingSituation: "Start at Platform Office. A cramped office lit by timetable lamps.",
      openingQuestion: "What do you do?",
    });
    expect(kernel.runtimeState.currentSceneId).toBe("scene:platform");
    expect(kernel.chatSession.turns).toEqual([]);
    expect(readCampaignKernel(CAMPAIGN_ID)).toEqual(kernel);
  });

  it("persists user-guided setup text", () => {
    writeCastReadySetupGraph();

    const kernel = createCampaignStartingSetup({
      campaignId: CAMPAIGN_ID,
      mode: "user_guided",
      userStart: "Mira starts under the counter while patrol boots pass the door.",
    });

    expect(kernel.startingSetup?.mode).toBe("user_guided");
    expect(kernel.startingSetup?.openingSituation).toBe(
      "Mira starts under the counter while patrol boots pass the door.",
    );
  });

  it("fails before cast_ready", () => {
    writeCampaignKernel(CAMPAIGN_ID, {
      ...createDraftCampaignKernel({
        id: CAMPAIGN_ID,
        premise: "A railway city under curfew.",
      }),
      phase: "world_ready",
    });

    expect(() => createCampaignStartingSetup({ campaignId: CAMPAIGN_ID })).toThrow(
      "Campaign kernel phase world_ready cannot create A7 setup.",
    );
  });

  it("fails when A6 graph composition has not added the player node", () => {
    writeCastReadySetupGraph();
    const kernel = readCampaignKernel(CAMPAIGN_ID)!;
    writeCampaignKernel(CAMPAIGN_ID, {
      ...kernel,
      worldGraph: {
        ...kernel.worldGraph,
        nodes: kernel.worldGraph.nodes.filter((node) => node.id !== PLAYER.id),
      },
    });

    expect(() => createCampaignStartingSetup({ campaignId: CAMPAIGN_ID })).toThrow(
      `A7 starting setup requires character node ${PLAYER.id}.`,
    );
  });
});
