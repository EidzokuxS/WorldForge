import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CharacterDraft,
  RevampCastMember,
  RevampCastRegistry,
  RevampWorldGraph,
} from "@worldforge/shared";
import { buildRevampStartingSetup } from "../starting-setup.js";

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
const PRESENT_NPC = makeMember("cast:npc_imported:warden", "Gate Warden", "npc");
const NEARBY_NPC = makeMember("cast:npc_imported:broker", "Night Broker", "npc");

function makeRegistry(): RevampCastRegistry {
  return {
    playerCharacter: PLAYER,
    importedCast: [PRESENT_NPC, NEARBY_NPC],
    generatedCast: [],
  };
}

function makeGraph(): RevampWorldGraph {
  return {
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
        id: PRESENT_NPC.id,
        type: "Character",
        name: "Gate Warden",
        data: {},
      },
      {
        id: NEARBY_NPC.id,
        type: "Character",
        name: "Night Broker",
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
        id: "edge:located_at:scene:ticket-hall:location:station",
        fromId: "scene:ticket-hall",
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
        id: `edge:located_at:${PRESENT_NPC.id}:scene:platform`,
        fromId: PRESENT_NPC.id,
        toId: "scene:platform",
        type: "located_at",
        data: {},
      },
      {
        id: `edge:located_at:${NEARBY_NPC.id}:scene:ticket-hall`,
        fromId: NEARBY_NPC.id,
        toId: "scene:ticket-hall",
        type: "located_at",
        data: {},
      },
    ],
  };
}

describe("revamp starting setup", () => {
  it("builds setup from a direct player scene placement", () => {
    const setup = buildRevampStartingSetup({
      worldGraph: makeGraph(),
      castRegistry: makeRegistry(),
    });

    expect(setup).toEqual({
      mode: "gm_invented",
      anchorSceneId: "scene:platform",
      playerCharacterId: PLAYER.id,
      presentCastIds: [PLAYER.id, PRESENT_NPC.id],
      nearbyCastIds: [NEARBY_NPC.id],
      activePressureIds: [],
      visibleHooks: [],
      hiddenTruthIds: [],
      openingSituation: "Start at Platform Office. A cramped office lit by timetable lamps.",
      openingQuestion: "What do you do?",
    });
  });

  it("resolves a single contained scene when the player is placed at a location", () => {
    const graph = makeGraph();
    graph.nodes = graph.nodes.filter((node) => node.id !== "scene:ticket-hall");
    graph.edges = graph.edges
      .filter((edge) => edge.fromId !== "scene:ticket-hall" && edge.fromId !== NEARBY_NPC.id)
      .map((edge) =>
        edge.fromId === PLAYER.id
          ? { ...edge, id: `edge:located_at:${PLAYER.id}:location:station`, toId: "location:station" }
          : edge,
      );

    const setup = buildRevampStartingSetup({
      worldGraph: graph,
      castRegistry: makeRegistry(),
    });

    expect(setup.anchorSceneId).toBe("scene:platform");
    expect(setup.presentCastIds).toEqual([PLAYER.id, PRESENT_NPC.id]);
  });

  it("uses user-guided setup text when mode is user_guided", () => {
    const setup = buildRevampStartingSetup({
      worldGraph: makeGraph(),
      castRegistry: makeRegistry(),
      mode: "user_guided",
      userStart: "Mira begins under the ticket counter with patrol boots passing nearby.",
    });

    expect(setup.mode).toBe("user_guided");
    expect(setup.openingSituation).toBe(
      "Mira begins under the ticket counter with patrol boots passing nearby.",
    );
  });

  it("fails when a location anchor has multiple contained scenes", () => {
    const graph = makeGraph();
    graph.edges = graph.edges.map((edge) =>
      edge.fromId === PLAYER.id
        ? { ...edge, id: `edge:located_at:${PLAYER.id}:location:station`, toId: "location:station" }
        : edge,
    );

    expect(() =>
      buildRevampStartingSetup({
        worldGraph: graph,
        castRegistry: makeRegistry(),
      }),
    ).toThrow("A7 starting setup requires exactly one scene under location location:station.");
  });

  it("fails when the player character node is missing", () => {
    const graph = makeGraph();
    graph.nodes = graph.nodes.filter((node) => node.id !== PLAYER.id);

    expect(() =>
      buildRevampStartingSetup({
        worldGraph: graph,
        castRegistry: makeRegistry(),
      }),
    ).toThrow(`A7 starting setup requires character node ${PLAYER.id}.`);
  });

  it("fails when the player placement target is not a location node", () => {
    const graph = makeGraph();
    graph.nodes.push({
      id: "item:sealed-pass",
      type: "Item",
      name: "Sealed Pass",
      data: {},
    });
    graph.edges = graph.edges.map((edge) =>
      edge.fromId === PLAYER.id
        ? { ...edge, id: `edge:located_at:${PLAYER.id}:item:sealed-pass`, toId: "item:sealed-pass" }
        : edge,
    );

    expect(() =>
      buildRevampStartingSetup({
        worldGraph: graph,
        castRegistry: makeRegistry(),
      }),
    ).toThrow("A7 starting setup cannot anchor at Item item:sealed-pass.");
  });

  it("fails when user-guided setup lacks userStart", () => {
    expect(() =>
      buildRevampStartingSetup({
        worldGraph: makeGraph(),
        castRegistry: makeRegistry(),
        mode: "user_guided",
      }),
    ).toThrow("A7 user-guided setup requires userStart.");
  });

  it("does not import old route or generator implementations", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/revamp/starting-setup.ts"),
      "utf-8",
    );

    expect(source).not.toContain("/api/worldgen");
    expect(source).not.toContain("scaffold-generator");
    expect(source).not.toContain("../routes/chat");
    expect(source).not.toContain("players");
  });
});
