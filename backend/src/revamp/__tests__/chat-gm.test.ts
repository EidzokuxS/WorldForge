import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CharacterDraft,
  RevampCastMember,
  RevampCastRegistry,
  RevampStartingSetup,
  RevampWorldGraph,
} from "@worldforge/shared";
import { buildRevampGmResponse } from "../chat-gm.js";

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

function makeRegistry(): RevampCastRegistry {
  return {
    playerCharacter: PLAYER,
    importedCast: [WARDEN],
    generatedCast: [],
  };
}

function makeGraph(): RevampWorldGraph {
  return {
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
  };
}

function makeSetup(): RevampStartingSetup {
  return {
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
  };
}

function build(message: string) {
  return buildRevampGmResponse({
    worldGraph: makeGraph(),
    castRegistry: makeRegistry(),
    startingSetup: makeSetup(),
    recentTurns: [{ role: "assistant", content: "Opening.", createdAt: 1 }],
    worldDna: null,
    userMessage: message,
  });
}

describe("revamp chat gm", () => {
  it("answers a look intent from the current scene", () => {
    const response = build("Look around");

    expect(response.text).toContain("You take in Platform Office.");
    expect(response.text).toContain("A cramped office lit by timetable lamps.");
    expect(response.text).toContain("Present: Gate Warden.");
    expect(response.text).toContain("Routes: Ticket Hall.");
    expect(response.suggestedActions).toEqual([
      "Look around",
      "Talk to Gate Warden",
      "Go to Ticket Hall",
    ]);
    expect(response.softStateHints).toEqual([{
      type: "inspect_scene",
      targetId: "scene:platform",
      summary: "Inspect Platform Office.",
    }]);
  });

  it("answers a present cast talk intent", () => {
    const response = build("Talk to Gate Warden");

    expect(response.text).toBe(
      "Gate Warden gives you their attention. The room keeps moving around both of you.",
    );
    expect(response.softStateHints).toEqual([{
      type: "address_cast",
      targetId: WARDEN.id,
      summary: "Address Gate Warden.",
    }]);
  });

  it("answers a route intent without mutating the graph", () => {
    const response = build("Go to Ticket Hall");

    expect(response.text).toBe(
      "You start toward Ticket Hall. The route is open, and the next beat waits there.",
    );
    expect(response.softStateHints).toEqual([{
      type: "route_intent",
      targetId: "scene:ticket-hall",
      summary: "Move from Platform Office toward Ticket Hall.",
    }]);
  });

  it("answers freeform actions with a soft state hint", () => {
    const response = build("I hide the pass under my coat.");

    expect(response.text).toBe(
      "You commit to it. Platform Office answers with pressure and watching eyes.",
    );
    expect(response.softStateHints).toEqual([{
      type: "freeform_action",
      targetId: "scene:platform",
      summary: "Player action: I hide the pass under my coat.",
    }]);
  });

  it("fails when the current scene is missing", () => {
    const graph = makeGraph();
    graph.nodes = graph.nodes.filter((node) => node.id !== "scene:platform");

    expect(() =>
      buildRevampGmResponse({
        worldGraph: graph,
        castRegistry: makeRegistry(),
        startingSetup: makeSetup(),
        recentTurns: [],
        worldDna: null,
        userMessage: "Look around",
      }),
    ).toThrow("A9 chat requires scene scene:platform.");
  });

  it("does not import old chat, generator, provider, or player-table implementations", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/revamp/chat-gm.ts"),
      "utf-8",
    );

    expect(source).not.toContain("/api/chat");
    expect(source).not.toContain("../routes/chat");
    expect(source).not.toContain("/api/worldgen");
    expect(source).not.toContain("resolveRoleModel");
    expect(source).not.toContain("players");
  });
});
