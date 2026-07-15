import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterDraft, Settings } from "@worldforge/shared";
import { closeDb } from "../db/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import {
  openCampaignWorldDatabase,
  type CampaignWorldDatabaseHandle,
} from "../campaign-world/world-database.js";
import { createCampaignWorldRepository } from "../campaign-world/world-repository.js";
import {
  advanceBuildToPersistence,
  candidateFixture,
  createMigratedCampaign,
  sourceFixture,
} from "../campaign-world/world-repository.test-support.js";
import { calculateCampaignWorldContentHash } from "../campaign-world/world-snapshot.js";
import {
  openCampaignPlayDatabase,
  type CampaignPlayDatabaseHandle,
} from "./campaign-play-database.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import { createCampaignPlayReadModel } from "./campaign-play-read-model.js";
import { createCampaignPlayCharacterService } from "./character-service.js";
import {
  bootstrapCampaignPlayPlayer,
  CampaignPlayPlayerBootstrapError,
} from "./player-bootstrap.js";

const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "actor-player-bootstrap";

let root = "";
let previousCampaignsRoot: string | undefined;
let handles: Array<CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle> = [];

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-player-bootstrap-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.close();
  closeDb();
  if (previousCampaignsRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
  else process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  fs.rmSync(root, { recursive: true, force: true });
});

function track<T extends CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle>(handle: T): T {
  handles.push(handle);
  return handle;
}

function createState() {
  createMigratedCampaign(root, CAMPAIGN_ID);
  const worldHandle = openCampaignWorldDatabase(CAMPAIGN_ID);
  try {
    const worlds = createCampaignWorldRepository(worldHandle);
    const source = sourceFixture(CAMPAIGN_ID);
    worlds.acquireBuild({
      buildId: "build-player-bootstrap",
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test-provider",
      model: "test-model",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(worlds, "build-player-bootstrap");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b"
          ? { ...placement, locationId: "location-a" }
          : placement),
    };
    const review = worlds.completeBuild({
      buildId: "build-player-bootstrap",
      candidate: {
        ...candidate,
        draft,
        contentHash: calculateCampaignWorldContentHash(source.sourceDigest, draft),
      },
      completedAt: 1_100,
    });
    worlds.acceptWorld({
      expectedVersion: review.version,
      expectedContentHash: review.contentHash,
      acceptedAt: 1_200,
    });
  } finally {
    worldHandle.close();
  }
  const handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
  const states = createCampaignPlayStateRepository(handle);
  const state = states.createState({ eventId: "runtime-play-created", createdAt: 1_300 });
  return { handle, state };
}

function donorDraft(inventorySeed: string[] = ["Repair roll"]): CharacterDraft {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: "Mara Venn",
      canonicalStatus: "original",
      behavioralCore: {
        attachments: [],
        selfImage: "A practical mechanic following an impossible signal.",
      },
      liveDynamics: {
        attachments: [], activeGoals: [], beliefDrift: [], currentStrains: [], earnedChanges: [],
      },
      personality: {
        summary: "Patient and observant.",
        voice: "Precise and dry.",
        decisionStyle: "Tests one variable at a time.",
        worldview: "Every mystery leaves a trace.",
        internalContradictions: [],
        personalMythology: "The mechanic who can tune the sky.",
        sampleLines: ["Give me a minute."],
      },
    },
    profile: {
      species: "Human",
      gender: "Woman",
      ageText: "Thirty-two",
      appearance: "Oil-dark coat and brass spectacles.",
      backgroundSummary: "An instrument repairer from inland observatories.",
      personaSummary: "A careful mechanic drawn into a city-scale mystery.",
    },
    socialContext: {
      factionId: null, factionName: null, homeLocationId: null, homeLocationName: null,
      currentLocationId: null, currentLocationName: null, relationshipRefs: [],
      socialStatus: [], originMode: null,
    },
    motivations: {
      shortTermGoals: [], longTermGoals: [], beliefs: ["Machines tell the truth"],
      drives: ["Understand the signal"], frictions: [],
    },
    capabilities: {
      traits: ["Observant", "Methodical"],
      skills: [{ name: "Instrument repair", tier: "Master" }],
      flaws: [], specialties: ["Acoustic mechanisms"], wealthTier: null,
    },
    state: { hp: 5, conditions: [], statusFlags: [], activityState: "idle" },
    loadout: {
      inventorySeed, equippedItemRefs: [], currencyNotes: "",
      signatureItems: ["Brass tuning fork"],
    },
    startConditions: {},
    provenance: {
      sourceKind: "generator", importMode: null, templateId: null,
      archetypePrompt: null, worldgenOrigin: null,
    },
  };
}

const generator = {
  provider: {
    id: "test-provider", name: "Test Provider", baseUrl: "https://example.invalid",
    apiKey: "test-key", model: "test-model",
  },
  temperature: 0.4,
  maxTokens: 4_096,
} satisfies ResolvedRole;

const settings = { research: { enabled: false } } as unknown as Settings;

function characterService(inventorySeed?: string[]) {
  return createCampaignPlayCharacterService({
    ingestCharacterDraft: vi.fn(async () => donorDraft(inventorySeed)),
  });
}

function v2Card() {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Mara Venn",
      description: "A mechanic who hears a structured signal inside the storm.",
      personality: "Patient and observant.",
      scenario: "She has reached the rain-soaked port city.",
      first_mes: "The harbor bells answer a note nobody played.",
      mes_example: "<START>\nMara: Give me a minute.",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      character_book: { entries: [] },
      tags: [],
      creator: "fixture",
      character_version: "1.0",
      extensions: {},
    },
  };
}

function bootstrapSnapshot(handle: CampaignPlayDatabaseHandle) {
  const authority = createCampaignPlayStateRepository(handle).loadState()!.authority;
  const counts = handle.sqlite.prepare(`SELECT
    (SELECT count(*) FROM actors WHERE campaign_id = ? AND controller = 'human') AS humans,
    (SELECT count(*) FROM campaign_play_characters WHERE campaign_id = ?) AS profiles,
    (SELECT count(*) FROM campaign_play_commands WHERE campaign_id = ?) AS commands,
    (SELECT count(*) FROM campaign_play_receipts WHERE campaign_id = ?) AS receipts,
    (SELECT count(*) FROM campaign_play_events WHERE campaign_id = ?) AS events,
    (SELECT count(*) FROM campaign_play_actor_possessions WHERE campaign_id = ?) AS possessions,
    (SELECT count(*) FROM campaign_play_runtime_events WHERE campaign_id = ?) AS runtimeEvents`
  ).get(
    CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID,
    CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID,
  );
  return { authority, counts };
}

async function prepareCharacter(
  sourceKind: "character_card" | "generated",
  acceptedWorld: ReturnType<typeof createState>["state"]["acceptedReview"],
  inventorySeed?: string[],
) {
  const service = characterService(inventorySeed);
  const context = { acceptedWorld, generator, settings };
  const intake = sourceKind === "character_card"
    ? await service.parsePlayerCard(
      CAMPAIGN_ID,
      { cardJson: JSON.stringify(v2Card()), importMode: "outsider" },
      context,
    )
    : await service.generatePlayerDraft(
      CAMPAIGN_ID,
      { prompt: "A retired cartographer who follows impossible tides.", research: null },
      context,
    );
  return service.preparePlayerProfile({
    campaignId: CAMPAIGN_ID,
    actorId: ACTOR_ID,
    character: intake.draft,
  });
}

describe("Campaign Play player bootstrap", () => {
  it.each(["character_card", "generated"] as const)(
    "commits one %s profile through Rulebook and reloads the same authority hashes",
    async (sourceKind) => {
      const { handle, state } = createState();
      const character = await prepareCharacter(sourceKind, state.acceptedReview);
      const possessionCount = new Set(character.record.loadout.inventorySeed.map((name) =>
        name.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " "))).size;
      const result = bootstrapCampaignPlayPlayer(handle, {
        character,
        expectedAcceptedWorldVersion: state.authority.acceptedWorldVersion,
        expectedAcceptedContentHash: state.authority.acceptedContentHash,
        expectedWorldVersion: state.authority.worldVersion,
        expectedRuntimeRevision: state.authority.runtimeRevision,
        createdAt: 1_400,
      });

      expect(result.state.authority).toMatchObject({
        setupPhase: "opening_required",
        worldVersion: state.authority.worldVersion + 1 + possessionCount,
        runtimeRevision: state.authority.runtimeRevision + 1,
      });
      expect(result.execution.receiptIds).toHaveLength(1 + possessionCount);
      const publicState = createCampaignPlayReadModel(handle).loadState();
      expect(publicState.phase).toBe("opening_required");
      expect(publicState.possessions).toHaveLength(possessionCount);
      expect(handle.sqlite.prepare(`SELECT
        (SELECT count(*) FROM actors WHERE campaign_id = ? AND kind = 'person' AND controller = 'human' AND role = 'player') AS humans,
        (SELECT count(*) FROM campaign_play_characters WHERE campaign_id = ? AND record_hash = ?) AS profiles,
        (SELECT count(*) FROM campaign_play_commands WHERE campaign_id = ?) AS commands,
        (SELECT count(*) FROM campaign_play_receipts WHERE campaign_id = ?) AS receipts,
        (SELECT count(*) FROM campaign_play_events WHERE campaign_id = ?) AS events,
        (SELECT count(*) FROM campaign_play_actor_possessions WHERE campaign_id = ?) AS possessions,
        (SELECT count(*) FROM campaign_play_runtime_events WHERE campaign_id = ?) AS runtimeEvents`
      ).get(
        CAMPAIGN_ID, CAMPAIGN_ID, character.profileDigest, CAMPAIGN_ID,
        CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID,
      )).toEqual({
        humans: 1,
        profiles: 1,
        commands: 1 + possessionCount,
        receipts: 1 + possessionCount,
        events: 1 + possessionCount,
        possessions: possessionCount,
        runtimeEvents: 2,
      });

      const expectedAuthority = result.state.authority;
      handle.close();
      handles = handles.filter((candidate) => candidate !== handle);
      const reopened = track(openCampaignPlayDatabase(CAMPAIGN_ID));
      const reloaded = createCampaignPlayStateRepository(reopened).loadState();
      expect(reloaded?.authority).toEqual(expectedAuthority);
      expect(reloaded?.mechanical.hash).toBe(result.state.mechanical.hash);
    },
  );

  it.each([
    { label: "empty inventory", inventory: [] as string[], expectedRows: 0, expectedQuantity: null },
    {
      label: "normalized duplicates",
      inventory: ["Copper chit", "Copper   chit"],
      expectedRows: 1,
      expectedQuantity: 2,
    },
    {
      label: "twenty distinct entries",
      inventory: Array.from({ length: 20 }, (_, index) => `Tool ${index + 1}`),
      expectedRows: 20,
      expectedQuantity: 1,
    },
  ])("persists $label atomically as current possessions", async ({
    inventory, expectedRows, expectedQuantity,
  }) => {
    const { handle, state } = createState();
    const character = await prepareCharacter("generated", state.acceptedReview, inventory);
    const result = bootstrapCampaignPlayPlayer(handle, {
      character,
      expectedAcceptedWorldVersion: state.authority.acceptedWorldVersion,
      expectedAcceptedContentHash: state.authority.acceptedContentHash,
      expectedWorldVersion: state.authority.worldVersion,
      expectedRuntimeRevision: state.authority.runtimeRevision,
      createdAt: 1_400,
    });

    expect(result.state.authority.worldVersion)
      .toBe(state.authority.worldVersion + 1 + expectedRows);
    expect(result.execution.receiptIds).toHaveLength(1 + expectedRows);
    const possessions = handle.sqlite.prepare(`SELECT name, quantity
      FROM campaign_play_actor_possessions
      WHERE campaign_id = ? AND actor_id = ?
      ORDER BY possession_key`).all(CAMPAIGN_ID, ACTOR_ID) as Array<{
        name: string;
        quantity: number;
      }>;
    expect(possessions).toHaveLength(expectedRows);
    if (expectedQuantity !== null) {
      expect(possessions[0]?.quantity).toBe(expectedQuantity);
    }
  });

  it("rejects stale, forged, and duplicate bootstrap attempts without partial rows", async () => {
    const { handle, state } = createState();
    const character = await prepareCharacter("generated", state.acceptedReview);
    const baseline = {
      expectedAcceptedWorldVersion: state.authority.acceptedWorldVersion,
      expectedAcceptedContentHash: state.authority.acceptedContentHash,
      expectedWorldVersion: state.authority.worldVersion,
      expectedRuntimeRevision: state.authority.runtimeRevision,
      createdAt: 1_400,
    };
    const emptySnapshot = bootstrapSnapshot(handle);
    expect(() => bootstrapCampaignPlayPlayer(handle, {
      ...baseline,
      character,
      expectedAcceptedWorldVersion: baseline.expectedAcceptedWorldVersion + 1,
    })).toThrowError(expect.objectContaining<Partial<CampaignPlayPlayerBootstrapError>>({
      code: "bootstrap_stale",
    }));
    expect(bootstrapSnapshot(handle)).toEqual(emptySnapshot);
    expect(() => bootstrapCampaignPlayPlayer(handle, {
      ...baseline,
      character,
      expectedAcceptedContentHash: "e".repeat(64),
    })).toThrowError(expect.objectContaining<Partial<CampaignPlayPlayerBootstrapError>>({
      code: "bootstrap_stale",
    }));
    expect(bootstrapSnapshot(handle)).toEqual(emptySnapshot);

    const forged = structuredClone(character);
    forged.profileDigest = "f".repeat(64);
    expect(() => bootstrapCampaignPlayPlayer(handle, {
      ...baseline,
      character: forged,
    })).toThrowError(expect.objectContaining<Partial<CampaignPlayPlayerBootstrapError>>({
      code: "bootstrap_profile_invalid",
    }));
    expect(bootstrapSnapshot(handle)).toEqual(emptySnapshot);

    const collision = characterService().preparePlayerProfile({
      campaignId: CAMPAIGN_ID,
      actorId: state.acceptedReview.actors[0]!.id,
      character: {
        name: "Mara Venn",
        summary: "A careful mechanic drawn into a city-scale mystery.",
        species: "Human",
        gender: "Woman",
        ageText: "Thirty-two",
        appearance: "Oil-dark coat and brass spectacles.",
        biography: "Mara follows the storm signal.",
        personality: {
          summary: "Patient and observant.", voice: "Precise and dry.",
          decisionStyle: "Tests one variable.", worldview: "Every mystery leaves a trace.",
          contradictions: [], mythology: "The mechanic who tunes the sky.", sampleLines: [],
        },
        motives: [], beliefs: [], drives: [], traits: ["Observant"], skills: [],
        flaws: [], specialties: [], inventory: [], signatureItems: [],
        source: { kind: "generated", importMode: null, label: "Generated player character" },
      },
    });
    expect(() => bootstrapCampaignPlayPlayer(handle, { ...baseline, character: collision }))
      .toThrowError(expect.objectContaining<Partial<CampaignPlayPlayerBootstrapError>>({
        code: "bootstrap_state_invalid",
      }));
    expect(bootstrapSnapshot(handle)).toEqual(emptySnapshot);
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM actors WHERE campaign_id = ? AND controller = 'human') AS humans,
      (SELECT count(*) FROM campaign_play_commands WHERE campaign_id = ?) AS commands`
    ).get(CAMPAIGN_ID, CAMPAIGN_ID)).toEqual({ humans: 0, commands: 0 });
    expect(bootstrapSnapshot(handle)).toEqual(emptySnapshot);

    const committed = bootstrapCampaignPlayPlayer(handle, { ...baseline, character });
    const committedSnapshot = bootstrapSnapshot(handle);
    expect(() => bootstrapCampaignPlayPlayer(handle, { ...baseline, character }))
      .toThrowError(expect.objectContaining<Partial<CampaignPlayPlayerBootstrapError>>({
        code: "bootstrap_state_invalid",
      }));
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM actors WHERE campaign_id = ? AND controller = 'human') AS humans,
      (SELECT count(*) FROM campaign_play_commands WHERE campaign_id = ?) AS commands,
      (SELECT count(*) FROM campaign_play_runtime_events WHERE campaign_id = ?) AS runtimeEvents`
    ).get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID)).toEqual({
      humans: 1, commands: 2, runtimeEvents: 2,
    });
    expect(bootstrapSnapshot(handle)).toEqual(committedSnapshot);
    expect(committedSnapshot.authority).toEqual(committed.state.authority);
  });
});
