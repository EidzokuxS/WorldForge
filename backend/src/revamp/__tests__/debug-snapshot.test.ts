import { describe, expect, it } from "vitest";
import {
  createDraftCampaignKernel,
  type CampaignKernel,
  type CharacterDraft,
  type RevampCastMember,
} from "@worldforge/shared";
import { buildRevampDebugSnapshot } from "../debug-snapshot.js";

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
const WARDEN = makeMember("cast:npc_imported:warden", "Gate Warden", "npc");

function makeActiveKernel(): CampaignKernel {
  return {
    ...createDraftCampaignKernel({
      id: "campaign-a10",
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
        {
          id: WARDEN.id,
          type: "Character",
          name: "Gate Warden",
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
      ],
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
      turns: [
        { role: "assistant", content: "Opening.", createdAt: 100 },
        { role: "user", content: "Look around", createdAt: 200 },
        {
          role: "assistant",
          content: "You take in Platform Office. A cramped office lit by timetable lamps.",
          createdAt: 200,
        },
      ],
      pendingSoftStateHints: [{
        type: "inspect_scene",
        targetId: "scene:platform",
        summary: "Inspect Platform Office.",
      }],
    },
    runtimeState: {
      currentSceneId: "scene:platform",
    },
    turnIndex: 3,
  };
}

describe("revamp debug snapshot", () => {
  it("summarizes a draft kernel without setup", () => {
    const snapshot = buildRevampDebugSnapshot(createDraftCampaignKernel({
      id: "campaign-a10",
      premise: "A railway city under curfew.",
    }));

    expect(snapshot).toMatchObject({
      campaignId: "campaign-a10",
      phase: "draft",
      turnIndex: 0,
      counts: {
        nodes: 0,
        edges: 0,
        castMembers: 0,
        turns: 0,
        pendingSoftStateHints: 0,
      },
      currentScene: null,
      presentCast: [],
      routes: [],
      pendingSoftStateHints: [],
      recentTurns: [],
    });
  });

  it("summarizes active scene, present cast, routes, turns, and pending hints", () => {
    const snapshot = buildRevampDebugSnapshot(makeActiveKernel(), 2);

    expect(snapshot.currentScene).toEqual({
      id: "scene:platform",
      name: "Platform Office",
      description: "A cramped office lit by timetable lamps.",
    });
    expect(snapshot.presentCast).toEqual([
      {
        id: PLAYER.id,
        name: "Mira Vale",
        source: "player_created",
        campaignRole: "player",
        isPlayer: true,
      },
      {
        id: WARDEN.id,
        name: "Gate Warden",
        source: "npc_imported",
        campaignRole: "minor_npc",
        isPlayer: false,
      },
    ]);
    expect(snapshot.routes).toEqual([{
      edgeId: "edge:route_to:scene:platform:scene:ticket-hall",
      toSceneId: "scene:ticket-hall",
      name: "Ticket Hall",
    }]);
    expect(snapshot.pendingSoftStateHints).toEqual([{
      type: "inspect_scene",
      targetId: "scene:platform",
      summary: "Inspect Platform Office.",
    }]);
    expect(snapshot.recentTurns).toEqual([
      {
        index: 1,
        role: "user",
        contentPreview: "Look around",
        createdAt: 200,
      },
      {
        index: 2,
        role: "assistant",
        contentPreview: "You take in Platform Office. A cramped office lit by timetable lamps.",
        createdAt: 200,
      },
    ]);
  });

  it("fails when setup references missing present cast", () => {
    const kernel = makeActiveKernel();
    kernel.startingSetup!.presentCastIds = [PLAYER.id, "cast:npc_imported:missing"];

    expect(() => buildRevampDebugSnapshot(kernel)).toThrow(
      "A10 debug requires present cast member cast:npc_imported:missing.",
    );
  });
});
