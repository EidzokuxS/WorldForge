import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDraftCampaignKernel,
  type CampaignKernel,
  type CharacterDraft,
  type RevampCastMember,
} from "@worldforge/shared";
import { readCampaignKernel, writeCampaignKernel } from "../dna-adapter.js";
import { applyRevampStateHints, applyRevampStateWriter } from "../state-writer.js";

const CAMPAIGN_ID = "campaign-a11";

let originalCampaignRoot: string | undefined;
let campaignRoot: string;

function writeConfig(): void {
  const campaignDir = path.join(campaignRoot, CAMPAIGN_ID);
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir, "config.json"),
    JSON.stringify(
      {
        name: "A11 Campaign",
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

function makeMember(id: string, name: string, role: "player" | "npc"): RevampCastMember {
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

function makeActiveKernel(): CampaignKernel {
  return {
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
          id: "scene:ticket-hall",
          type: "SceneLocation",
          name: "Ticket Hall",
          data: { description: "A public hall under guard." },
        },
        {
          id: PLAYER.id,
          type: "Character",
          name: "Mira Vale",
          data: {},
        },
      ],
      edges: [
        {
          id: "edge:route_to:scene:platform:scene:ticket-hall",
          fromId: "scene:platform",
          toId: "scene:ticket-hall",
          type: "route_to",
          data: {},
        },
        {
          id: `edge:located_at:${PLAYER.id}:scene:platform`,
          fromId: PLAYER.id,
          toId: "scene:platform",
          type: "located_at",
          data: {},
        },
      ],
    },
    castRegistry: {
      playerCharacter: PLAYER,
      importedCast: [],
      generatedCast: [],
    },
    startingSetup: {
      mode: "gm_invented",
      anchorSceneId: "scene:platform",
      playerCharacterId: PLAYER.id,
      presentCastIds: [PLAYER.id],
      nearbyCastIds: [],
      activePressureIds: [],
      visibleHooks: [],
      hiddenTruthIds: [],
      openingSituation: "Start at Platform Office. A cramped office lit by timetable lamps.",
      openingQuestion: "What do you do?",
    },
    chatSession: {
      turns: [
        { role: "assistant", content: "Opening.", createdAt: 100 },
        { role: "user", content: "Go to Ticket Hall", createdAt: 200 },
        {
          role: "assistant",
          content: "You start toward Ticket Hall. The route is open, and the next beat waits there.",
          createdAt: 200,
        },
      ],
      pendingSoftStateHints: [{
        type: "route_intent",
        targetId: "scene:ticket-hall",
        summary: "Move from Platform Office toward Ticket Hall.",
      }],
    },
    runtimeState: {
      currentSceneId: "scene:platform",
    },
    turnIndex: 3,
  };
}

describe("revamp state writer", () => {
  beforeEach(() => {
    originalCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-a11-"));
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

  it("applies a route intent as MoveCharacter", () => {
    const result = applyRevampStateHints(makeActiveKernel());

    expect(result.result).toEqual({
      changes: [{
        type: "MoveCharacter",
        status: "applied",
        actorId: PLAYER.id,
        fromSceneId: "scene:platform",
        toSceneId: "scene:ticket-hall",
        reason: "Move from Platform Office toward Ticket Hall.",
      }],
      appliedCount: 1,
      rejectedCount: 0,
    });
    expect(result.kernel.runtimeState.currentSceneId).toBe("scene:ticket-hall");
    expect(result.kernel.chatSession.pendingSoftStateHints).toEqual([]);
    expect(result.kernel.worldGraph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `edge:located_at:${PLAYER.id}:scene:ticket-hall`,
          fromId: PLAYER.id,
          toId: "scene:ticket-hall",
          type: "located_at",
        }),
      ]),
    );
    expect(result.kernel.worldGraph.edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `edge:located_at:${PLAYER.id}:scene:platform`,
        }),
      ]),
    );
  });

  it("rejects unsupported hints and clears the pending list", () => {
    const kernel = makeActiveKernel();
    kernel.chatSession.pendingSoftStateHints = [{
      type: "inspect_scene",
      targetId: "scene:platform",
      summary: "Inspect Platform Office.",
    }];

    const result = applyRevampStateHints(kernel);

    expect(result.result).toEqual({
      changes: [{
        type: "MoveCharacter",
        status: "rejected",
        reason: "A11 handles route_intent only. Received inspect_scene.",
      }],
      appliedCount: 0,
      rejectedCount: 1,
    });
    expect(result.kernel.runtimeState.currentSceneId).toBe("scene:platform");
    expect(result.kernel.chatSession.pendingSoftStateHints).toEqual([]);
  });

  it("fails when route intent has no visible route", () => {
    const kernel = makeActiveKernel();
    kernel.worldGraph.edges = kernel.worldGraph.edges.filter((edge) => edge.type !== "route_to");

    expect(() => applyRevampStateHints(kernel)).toThrow(
      "A11 state writer requires route from scene:platform to scene:ticket-hall.",
    );
  });

  it("persists state writer output", () => {
    writeCampaignKernel(CAMPAIGN_ID, makeActiveKernel());

    const result = applyRevampStateWriter({ campaignId: CAMPAIGN_ID });

    expect(result.kernel.runtimeState.currentSceneId).toBe("scene:ticket-hall");
    expect(readCampaignKernel(CAMPAIGN_ID)).toEqual(result.kernel);
  });
});
