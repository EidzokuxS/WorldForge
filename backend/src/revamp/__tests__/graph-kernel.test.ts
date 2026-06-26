import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDraftCampaignKernel,
  type CharacterDraft,
  type RevampCastMember,
} from "@worldforge/shared";
import { readCampaignKernel, writeCampaignKernel } from "../dna-adapter.js";
import { composeRevampKernelWorldGraph } from "../graph-kernel.js";

const CAMPAIGN_ID = "campaign-a6b";

let originalCampaignRoot: string | undefined;
let campaignRoot: string;

function writeConfig(): void {
  const campaignDir = path.join(campaignRoot, CAMPAIGN_ID);
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir, "config.json"),
    JSON.stringify(
      {
        name: "A6b Campaign",
        premise: "A harbor city with sealed gates.",
        createdAt: 1,
        updatedAt: 1,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function makeDraft(
  name: string,
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
      personaSummary: `${name} watches the harbor gate.`,
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: "location:harbor",
      currentLocationName: "Harbor Gate",
      relationshipRefs: [],
      socialStatus: [],
      originMode: "native",
    },
    motivations: {
      shortTermGoals: ["Find safe ground"],
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
      startLocationId: "location:harbor",
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

function makeMember(name: string, role: "player" | "npc" = "player"): RevampCastMember {
  return {
    id: role === "player" ? "cast:player_created:mira" : "cast:npc_imported:warden",
    source: role === "player" ? "player_created" : "npc_imported",
    characterDraft: makeDraft(name, role),
    campaignRole: role === "player" ? "player" : "major_npc",
    placement: {
      locationId: "location:harbor",
      sceneLocationId: null,
      notes: [],
    },
    importance: role === "player" ? "primary" : "major",
  };
}

function writeCastReadyKernel(overrides: Partial<ReturnType<typeof createDraftCampaignKernel>> = {}): void {
  writeCampaignKernel(CAMPAIGN_ID, {
    ...createDraftCampaignKernel({
      id: CAMPAIGN_ID,
      premise: "A harbor city with sealed gates.",
    }),
    phase: "cast_ready",
    worldGraph: {
      nodes: [
        {
          id: "location:harbor",
          type: "Location",
          name: "Harbor Gate",
          data: {},
        },
      ],
      edges: [],
    },
    castRegistry: {
      playerCharacter: makeMember("Mira Vale", "player"),
      importedCast: [makeMember("Gate Warden", "npc")],
      generatedCast: [],
    },
    ...overrides,
  });
}

describe("revamp graph kernel", () => {
  beforeEach(() => {
    originalCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-a6b-"));
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

  it("composes cast into the kernel world graph without changing phase", () => {
    writeCastReadyKernel();

    const kernel = composeRevampKernelWorldGraph(CAMPAIGN_ID);

    expect(kernel.phase).toBe("cast_ready");
    expect(kernel.worldGraph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "location:harbor",
          type: "Location",
        }),
        expect.objectContaining({
          id: "cast:player_created:mira",
          type: "Character",
          name: "Mira Vale",
        }),
        expect.objectContaining({
          id: "cast:npc_imported:warden",
          type: "Character",
          name: "Gate Warden",
        }),
      ]),
    );
    expect(kernel.worldGraph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "edge:located_at:cast:player_created:mira:location:harbor",
          fromId: "cast:player_created:mira",
          toId: "location:harbor",
          type: "located_at",
        }),
      ]),
    );
    expect(readCampaignKernel(CAMPAIGN_ID)).toEqual(kernel);
  });

  it("fails before cast_ready", () => {
    writeCampaignKernel(CAMPAIGN_ID, {
      ...createDraftCampaignKernel({
        id: CAMPAIGN_ID,
        premise: "A harbor city with sealed gates.",
      }),
      phase: "world_ready",
    });

    expect(() => composeRevampKernelWorldGraph(CAMPAIGN_ID)).toThrow(
      "Campaign kernel phase world_ready cannot compose A6 graph.",
    );
  });

  it("fails when player cast is missing", () => {
    writeCastReadyKernel({
      castRegistry: {
        playerCharacter: null,
        importedCast: [],
        generatedCast: [],
      },
    });

    expect(() => composeRevampKernelWorldGraph(CAMPAIGN_ID)).toThrow(
      "A6 graph composition requires a player cast member.",
    );
  });

  it("fails when cast placement points outside the graph", () => {
    writeCastReadyKernel({
      castRegistry: {
        playerCharacter: {
          ...makeMember("Mira Vale", "player"),
          placement: {
            locationId: "location:missing",
            sceneLocationId: null,
            notes: [],
          },
        },
        importedCast: [],
        generatedCast: [],
      },
    });

    expect(() => composeRevampKernelWorldGraph(CAMPAIGN_ID)).toThrow(
      "Cast member Mira Vale references missing placement target location:missing.",
    );
  });
});
