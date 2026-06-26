import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDraftCampaignKernel,
  type CharacterDraft,
  type RevampCastMember,
} from "@worldforge/shared";
import {
  getRevampCampaignKernelPath,
  readCampaignKernel,
  writeCampaignKernel,
} from "../dna-adapter.js";
import {
  readOrCreateRevampKernel,
  saveRevampPlayerCharacter,
} from "../cast-kernel.js";

const CAMPAIGN_ID = "campaign-a5b";

let originalCampaignRoot: string | undefined;
let campaignRoot: string;

function writeConfig(config: Record<string, unknown> = {}): void {
  const campaignDir = path.join(campaignRoot, CAMPAIGN_ID);
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir, "config.json"),
    JSON.stringify(
      {
        name: "A5b Campaign",
        premise: "A harbor city with sealed gates.",
        createdAt: 1,
        updatedAt: 1,
        ...config,
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
      personaSummary: `${name} keeps a low profile.`,
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

function makeImportedNpc(): RevampCastMember {
  return {
    id: "cast:npc_imported:gate-warden",
    source: "npc_imported",
    characterDraft: makeDraft("Gate Warden", "npc"),
    campaignRole: "major_npc",
    placement: {
      locationId: "location:harbor",
      sceneLocationId: null,
      notes: ["existing imported cast"],
    },
    importance: "major",
  };
}

describe("revamp cast kernel", () => {
  beforeEach(() => {
    originalCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-a5b-"));
    process.env.GSD_CAMPAIGNS_ROOT = campaignRoot;
  });

  afterEach(() => {
    if (originalCampaignRoot === undefined) {
      delete process.env.GSD_CAMPAIGNS_ROOT;
    } else {
      process.env.GSD_CAMPAIGNS_ROOT = originalCampaignRoot;
    }
    fs.rmSync(campaignRoot, { recursive: true, force: true });
  });

  it("reads an existing kernel or creates a draft view from campaign config", () => {
    writeConfig();

    const kernel = readOrCreateRevampKernel(CAMPAIGN_ID);

    expect(kernel).toMatchObject({
      campaignId: CAMPAIGN_ID,
      phase: "draft",
      premise: "A harbor city with sealed gates.",
      castRegistry: {
        playerCharacter: null,
        importedCast: [],
        generatedCast: [],
      },
    });
    expect(fs.existsSync(getRevampCampaignKernelPath(CAMPAIGN_ID))).toBe(false);
  });

  it("saves a player CharacterDraft into cast registry and advances to cast_ready", () => {
    writeConfig();

    const kernel = saveRevampPlayerCharacter({
      campaignId: CAMPAIGN_ID,
      draft: makeDraft("Mira Vale"),
      source: "player_created",
    });

    expect(kernel.phase).toBe("cast_ready");
    expect(kernel.castRegistry.playerCharacter).toMatchObject({
      source: "player_created",
      campaignRole: "player",
      importance: "primary",
      characterDraft: {
        identity: {
          role: "player",
          tier: "key",
          displayName: "Mira Vale",
        },
      },
    });
    expect(readCampaignKernel(CAMPAIGN_ID)).toEqual(kernel);
  });

  it("preserves existing kernel fields and NPC buckets when replacing player cast", () => {
    writeConfig();
    const existingKernel = {
      ...createDraftCampaignKernel({
        id: CAMPAIGN_ID,
        premise: "A harbor city with sealed gates.",
      }),
      phase: "world_ready" as const,
      worldDna: {
        geography: "harbor",
        politicalStructure: "guilds",
        centralConflict: "closed gates",
        culturalFlavor: "storm bells",
        environment: "salt fog",
        wildcard: "signal fires",
      },
      worldGraph: {
        nodes: [
          {
            id: "location:harbor",
            type: "Location" as const,
            name: "Harbor Gate",
            data: {},
          },
        ],
        edges: [],
      },
      castRegistry: {
        playerCharacter: null,
        importedCast: [makeImportedNpc()],
        generatedCast: [],
      },
    };
    writeCampaignKernel(CAMPAIGN_ID, existingKernel);

    const kernel = saveRevampPlayerCharacter({
      campaignId: CAMPAIGN_ID,
      draft: makeDraft("New Player"),
      source: "player_imported",
    });

    expect(kernel.worldDna).toEqual(existingKernel.worldDna);
    expect(kernel.worldGraph).toEqual(existingKernel.worldGraph);
    expect(kernel.castRegistry.importedCast).toHaveLength(1);
    expect(kernel.castRegistry.importedCast[0]?.characterDraft.identity.displayName).toBe("Gate Warden");
    expect(kernel.castRegistry.playerCharacter?.source).toBe("player_imported");
  });

  it("fails closed for non-player drafts", () => {
    writeConfig();

    expect(() =>
      saveRevampPlayerCharacter({
        campaignId: CAMPAIGN_ID,
        draft: makeDraft("Gate Warden", "npc"),
        source: "player_created",
      }),
    ).toThrow("A5b player cast requires a player CharacterDraft.");
  });

  it("does not rewrite setup-ready kernels", () => {
    writeConfig();
    const kernel = {
      ...createDraftCampaignKernel({
        id: CAMPAIGN_ID,
        premise: "A harbor city with sealed gates.",
      }),
      phase: "setup_ready" as const,
    };
    writeCampaignKernel(CAMPAIGN_ID, kernel);

    expect(() =>
      saveRevampPlayerCharacter({
        campaignId: CAMPAIGN_ID,
        draft: makeDraft("Mira Vale"),
        source: "player_created",
      }),
    ).toThrow("Campaign kernel phase setup_ready cannot save A5b player cast.");
  });
});
