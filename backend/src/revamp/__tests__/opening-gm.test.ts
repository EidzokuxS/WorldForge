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
import { buildRevampOpening } from "../opening-gm.js";

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

describe("revamp opening gm", () => {
  it("builds the first assistant opening and action handles", () => {
    const opening = buildRevampOpening({
      worldGraph: makeGraph(),
      castRegistry: makeRegistry(),
      startingSetup: makeSetup(),
      worldDna: null,
    });

    expect(opening.text).toContain("Start at Platform Office.");
    expect(opening.text).toContain("Platform Office. A cramped office lit by timetable lamps.");
    expect(opening.text).toContain("Present: Gate Warden.");
    expect(opening.text).toContain("What do you do?");
    expect(opening.suggestedActions).toEqual([
      "Look around",
      "Talk to Gate Warden",
      "Go to Ticket Hall",
    ]);
  });

  it("fails when a present cast id is not in the registry", () => {
    const setup = makeSetup();
    setup.presentCastIds = [PLAYER.id, "cast:npc_imported:missing"];

    expect(() =>
      buildRevampOpening({
        worldGraph: makeGraph(),
        castRegistry: makeRegistry(),
        startingSetup: setup,
        worldDna: null,
      }),
    ).toThrow("A8 opening requires present cast member cast:npc_imported:missing.");
  });

  it("fails when a route target is missing", () => {
    const graph = makeGraph();
    graph.edges[0] = {
      ...graph.edges[0]!,
      id: "edge:route_to:scene:platform:scene:missing",
      toId: "scene:missing",
    };

    expect(() =>
      buildRevampOpening({
        worldGraph: graph,
        castRegistry: makeRegistry(),
        startingSetup: makeSetup(),
        worldDna: null,
      }),
    ).toThrow("A8 opening route references missing target scene:missing.");
  });

  it("does not import old route or generator implementations", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/revamp/opening-gm.ts"),
      "utf-8",
    );

    expect(source).not.toContain("/api/chat");
    expect(source).not.toContain("../routes/chat");
    expect(source).not.toContain("/api/worldgen");
    expect(source).not.toContain("players");
  });
});
