import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CharacterDraft,
  RevampCastMember,
  RevampWorldGraph,
} from "@worldforge/shared";
import { buildRevampWorldGraph } from "../world-graph-builder.js";

function makeDraft(
  name: string,
  role: CharacterDraft["identity"]["role"] = "npc",
  tier: CharacterDraft["identity"]["tier"] = "supporting",
): CharacterDraft {
  return {
    identity: {
      role,
      tier,
      displayName: name,
      canonicalStatus: "original",
    },
    profile: {
      species: "human",
      gender: "",
      ageText: "",
      appearance: "",
      backgroundSummary: "",
      personaSummary: `${name} keeps their own counsel.`,
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: "location:lantern-bar",
      currentLocationName: "Lantern Bar",
      relationshipRefs: [],
      socialStatus: [],
      originMode: role === "player" ? "native" : "resident",
    },
    motivations: {
      shortTermGoals: ["Stay alive"],
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
    startConditions: {
      startLocationId: "location:lantern-bar",
    },
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

function makeMember(
  name: string,
  overrides: Partial<RevampCastMember> = {},
): RevampCastMember {
  const role = overrides.campaignRole === "player" ? "player" : "npc";
  const member: RevampCastMember = {
    id: `cast:${name.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-")}`,
    source: role === "player" ? "player_created" : "npc_imported",
    characterDraft: makeDraft(name, role),
    campaignRole: role === "player" ? "player" : "minor_npc",
    placement: {
      locationId: "location:lantern-bar",
      sceneLocationId: null,
      notes: [],
    },
    importance: role === "player" ? "primary" : "minor",
  };

  return {
    ...member,
    ...overrides,
    placement: {
      ...member.placement,
      ...overrides.placement,
    },
    characterDraft: overrides.characterDraft ?? member.characterDraft,
  };
}

function makeBaseGraph(): RevampWorldGraph {
  return {
    nodes: [
      {
        id: "location:lantern-bar",
        type: "Location",
        name: "Lantern Bar",
        data: { description: "A harbor bar." },
      },
      {
        id: "scene:lantern-bar-back-room",
        type: "SceneLocation",
        name: "Lantern Bar Back Room",
        data: { description: "A private back room." },
      },
    ],
    edges: [
      {
        id: "edge:located_at:scene:lantern-bar-back-room:location:lantern-bar",
        fromId: "scene:lantern-bar-back-room",
        toId: "location:lantern-bar",
        type: "located_at",
        data: {},
      },
    ],
  };
}

describe("revamp world graph builder", () => {
  it("adds character nodes and placement edges while preserving the base graph", () => {
    const player = makeMember("Mira Vale", {
      campaignRole: "player",
      placement: {
        locationId: "location:lantern-bar",
        sceneLocationId: "scene:lantern-bar-back-room",
        notes: ["starts in the private room"],
      },
    });
    const imported = makeMember("Captain Roan", {
      source: "npc_imported",
      campaignRole: "rival",
      importance: "major",
    });
    const generated = makeMember("Dock Informant", {
      source: "npc_generated",
      campaignRole: "minor_npc",
    });
    const baseGraph = makeBaseGraph();

    const graph = buildRevampWorldGraph({
      baseGraph,
      castRegistry: {
        playerCharacter: player,
        importedCast: [imported],
        generatedCast: [generated],
      },
    });

    expect(graph.nodes.slice(0, baseGraph.nodes.length)).toEqual(baseGraph.nodes);
    expect(graph.edges.slice(0, baseGraph.edges.length)).toEqual(baseGraph.edges);
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: player.id,
          type: "Character",
          name: "Mira Vale",
          data: expect.objectContaining({
            source: "player_created",
            campaignRole: "player",
            importance: "primary",
            identity: expect.objectContaining({ displayName: "Mira Vale" }),
          }),
        }),
        expect.objectContaining({
          id: imported.id,
          type: "Character",
          data: expect.objectContaining({
            source: "npc_imported",
            campaignRole: "rival",
            importance: "major",
          }),
        }),
        expect.objectContaining({
          id: generated.id,
          type: "Character",
          data: expect.objectContaining({
            source: "npc_generated",
          }),
        }),
      ]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `edge:located_at:${player.id}:scene:lantern-bar-back-room`,
          fromId: player.id,
          toId: "scene:lantern-bar-back-room",
          type: "located_at",
          data: expect.objectContaining({ placement: "sceneLocationId" }),
        }),
        expect.objectContaining({
          id: `edge:located_at:${imported.id}:location:lantern-bar`,
          fromId: imported.id,
          toId: "location:lantern-bar",
          type: "located_at",
          data: expect.objectContaining({ placement: "locationId" }),
        }),
      ]),
    );
  });

  it("adds a character node without a placement edge when no placement id exists", () => {
    const member = makeMember("Passing Stranger", {
      placement: {
        locationId: null,
        sceneLocationId: null,
        notes: [],
      },
    });

    const graph = buildRevampWorldGraph({
      baseGraph: makeBaseGraph(),
      castRegistry: {
        playerCharacter: null,
        importedCast: [member],
        generatedCast: [],
      },
    });

    expect(graph.nodes.some((node) => node.id === member.id)).toBe(true);
    expect(graph.edges.some((edge) => edge.fromId === member.id)).toBe(false);
  });

  it("fails closed when a placement target is missing", () => {
    expect(() =>
      buildRevampWorldGraph({
        baseGraph: makeBaseGraph(),
        castRegistry: {
          playerCharacter: makeMember("Mira Vale", {
            campaignRole: "player",
            placement: {
              locationId: "location:missing-dock",
              sceneLocationId: null,
              notes: [],
            },
          }),
          importedCast: [],
          generatedCast: [],
        },
      }),
    ).toThrow("Cast member Mira Vale references missing placement target location:missing-dock.");
  });

  it("fails closed when a character node id already exists", () => {
    const member = makeMember("Mira Vale", { campaignRole: "player" });
    const baseGraph = makeBaseGraph();
    baseGraph.nodes.push({
      id: member.id,
      type: "Character",
      name: "Existing Mira",
      data: {},
    });

    expect(() =>
      buildRevampWorldGraph({
        baseGraph,
        castRegistry: {
          playerCharacter: member,
          importedCast: [],
          generatedCast: [],
        },
      }),
    ).toThrow(`WorldGraph node id ${member.id} already exists before A6 can run.`);
  });

  it("fails closed when a generated placement edge id already exists", () => {
    const member = makeMember("Mira Vale", { campaignRole: "player" });
    const baseGraph = makeBaseGraph();
    baseGraph.edges.push({
      id: `edge:located_at:${member.id}:location:lantern-bar`,
      fromId: "other",
      toId: "location:lantern-bar",
      type: "located_at",
      data: {},
    });

    expect(() =>
      buildRevampWorldGraph({
        baseGraph,
        castRegistry: {
          playerCharacter: member,
          importedCast: [],
          generatedCast: [],
        },
      }),
    ).toThrow(`WorldGraph edge id edge:located_at:${member.id}:location:lantern-bar already exists before A6 can run.`);
  });

  it("does not import old route or generator implementations", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/revamp/world-graph-builder.ts"),
      "utf-8",
    );

    expect(source).not.toContain("/api/worldgen/generate");
    expect(source).not.toContain("generateCharacter");
    expect(source).not.toContain("parse-character");
    expect(source).not.toContain("import-v2-card");
    expect(source).not.toContain("scaffold-generator");
  });
});
