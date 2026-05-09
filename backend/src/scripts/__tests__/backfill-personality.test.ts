import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { connectDb, closeDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { campaigns, locations, npcs, players } from "../../db/schema.js";

type BackfillArgs = {
  campaignFilter?: string;
  dryRun: boolean;
  batchSize: number;
  mode?: "default" | "incomplete-pack";
};

type BackfillResults = {
  written: number;
  skipped: number;
  failed: number;
  changed: number;
  campaignsProcessed: number;
};

type ScriptModule = {
  runBackfill: (args: BackfillArgs) => Promise<BackfillResults>;
  parseArgs: (argv: string[]) => BackfillArgs;
};

type TempCampaignContext = {
  rootDir: string;
  campaignsDir: string;
  campaignId: string;
  campaignDir: string;
  dbPath: string;
  backlogPath: string;
  configPath: string;
};

type LoggedEvent = {
  level: "info" | "warn" | "error" | "debug" | "event";
  message: string;
  payload?: unknown;
  turnId?: string;
  role?: string;
};

const personalityPayload = {
  summary: "A wary idealist who masks fear with dry humor and ritual composure.",
  voice: "Measured, observant, and edged with tired wit when trust is earned.",
  decisionStyle: "Deliberate first, but decisive once the stakes feel personal.",
  worldview: "People survive by bonds, debts, and the stories they keep repeating.",
  internalContradictions: [
    "Craves closeness but treats dependence like a trap that must be outsmarted.",
    "Believes mercy matters while rehearsing ruthless exits in every tense room.",
  ],
  personalMythology: "They cast themselves as the last reliable witness when systems fail.",
  sampleLines: [
    "I do not panic. I inventory consequences faster than other people breathe.",
    "If I stay, it is because someone has to remember what happened here.",
  ],
};

function makeTempCampaignContext(): TempCampaignContext {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-backfill-personality-"));
  const campaignsDir = path.join(rootDir, "campaigns");
  const campaignId = "test-campaign";
  const campaignDir = path.join(campaignsDir, campaignId);
  const dbPath = path.join(campaignDir, "state.db");
  const backlogPath = path.join(rootDir, ".planning", "BACKLOG.md");
  const configPath = path.join(campaignDir, "config.json");

  fs.mkdirSync(path.join(campaignDir, "logs"), { recursive: true });
  fs.mkdirSync(path.dirname(backlogPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        name: "Backfill Test Campaign",
        premise: "Test campaign for personality backfill.",
        createdAt: 1,
        updatedAt: 1,
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(campaignDir, "chat_history.json"), "[]", "utf-8");

  return {
    rootDir,
    campaignsDir,
    campaignId,
    campaignDir,
    dbPath,
    backlogPath,
    configPath,
  };
}

function makeRecordBase(role: "npc" | "player", id: string, displayName: string) {
  return {
    identity: {
      id,
      campaignId: "test-campaign",
      role,
      tier: role === "player" ? "key" : "persistent",
      displayName,
      canonicalStatus: "original",
    },
    profile: {
      species: "Human",
      gender: "Unknown",
      ageText: "32",
      appearance: "Weathered and attentive.",
      backgroundSummary: "Built for test coverage.",
      personaSummary: "Carries the scene like a fixture.",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: "loc-1",
      currentLocationName: "Harbor",
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
      activityState: "active",
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: [],
    },
    startConditions: {},
    provenance: {
      sourceKind: "migration",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
  };
}

function makeSeedRecords() {
  return {
    npcExisting: {
      ...makeRecordBase("npc", "npc-a", "NPC-A"),
      identity: {
        ...makeRecordBase("npc", "npc-a", "NPC-A").identity,
        personality: {
          ...personalityPayload,
          summary: "Existing personality already present.",
        },
      },
    },
    npcPlain: {
      ...makeRecordBase("npc", "npc-b", "NPC-B"),
    },
    npcCarryForward: {
      ...makeRecordBase("npc", "npc-c", "NPC-C"),
      identity: {
        ...makeRecordBase("npc", "npc-c", "NPC-C").identity,
        behavioralCore: {
          attachments: ["old-link"],
          selfImage: "Guarded but loyal.",
        },
      },
    },
    playerKeepNew: {
      ...makeRecordBase("player", "player-d", "Player-D"),
      identity: {
        ...makeRecordBase("player", "player-d", "Player-D").identity,
        behavioralCore: {
          attachments: ["x"],
          selfImage: "Restless and vigilant.",
        },
        liveDynamics: {
          attachments: ["y"],
          activeGoals: [],
          beliefDrift: [],
          currentStrains: [],
          earnedChanges: [],
        },
      },
    },
  };
}

function recordWithLegacySummaryOnly(id: string, displayName: string) {
  const base = makeRecordBase("npc", id, displayName);
  return {
    ...base,
    identity: {
      ...base.identity,
      personality: {
        summary: "A brief summary only, nothing else populated.",
        voice: "",
        decisionStyle: "",
        worldview: "",
        personalMythology: "",
        internalContradictions: [],
        sampleLines: [],
      },
    },
  };
}

function recordWithProseButEmptySampleLines(id: string, displayName: string) {
  const base = makeRecordBase("npc", id, displayName);
  return {
    ...base,
    identity: {
      ...base.identity,
      personality: {
        ...personalityPayload,
        summary: "A full prose pack with deliberately empty sample lines.",
        sampleLines: [],
      },
    },
  };
}

function recordWithProseButEmptyContradictions(id: string, displayName: string) {
  const base = makeRecordBase("npc", id, displayName);
  return {
    ...base,
    identity: {
      ...base.identity,
      personality: {
        ...personalityPayload,
        summary: "A full prose pack with deliberately empty contradictions.",
        internalContradictions: [],
      },
    },
  };
}

function recordWithFullPack(
  id: string,
  displayName: string,
  role: "npc" | "player" = "npc",
) {
  const base = makeRecordBase(role, id, displayName);
  return {
    ...base,
    identity: {
      ...base.identity,
      personality: {
        ...personalityPayload,
      },
    },
  };
}

function recordWithEmptySummary(id: string, displayName: string) {
  const base = makeRecordBase("npc", id, displayName);
  return {
    ...base,
    identity: {
      ...base.identity,
      personality: {
        summary: "",
        voice: "",
        decisionStyle: "",
        worldview: "",
        personalMythology: "",
        internalContradictions: [],
        sampleLines: [],
      },
    },
  };
}

function seedCampaign(context: TempCampaignContext) {
  const records = makeSeedRecords();

  connectDb(context.dbPath);
  runMigrations();

  getDb()
    .insert(campaigns)
    .values({
      id: context.campaignId,
      name: "Backfill Test Campaign",
      premise: "Test campaign for personality backfill.",
      createdAt: 1,
      updatedAt: 1,
    })
    .run();

  getDb()
    .insert(locations)
    .values({
      id: "loc-1",
      campaignId: context.campaignId,
      name: "Harbor",
      description: "A salt-stained harbor for tests.",
    })
    .run();

  getDb()
    .insert(npcs)
    .values([
      {
        id: "npc-a",
        campaignId: context.campaignId,
        name: "NPC-A",
        persona: "",
        characterRecord: JSON.stringify(records.npcExisting),
        derivedTags: "[]",
        tags: "[]",
        tier: "persistent",
        currentLocationId: "loc-1",
        goals: JSON.stringify({ short_term: [], long_term: [] }),
        beliefs: "[]",
        unprocessedImportance: 0,
        inactiveTicks: 0,
        createdAt: 1,
      },
      {
        id: "npc-b",
        campaignId: context.campaignId,
        name: "NPC-B",
        persona: "",
        characterRecord: JSON.stringify(records.npcPlain),
        derivedTags: "[]",
        tags: "[]",
        tier: "persistent",
        currentLocationId: "loc-1",
        goals: JSON.stringify({ short_term: [], long_term: [] }),
        beliefs: "[]",
        unprocessedImportance: 0,
        inactiveTicks: 0,
        createdAt: 1,
      },
      {
        id: "npc-c",
        campaignId: context.campaignId,
        name: "NPC-C",
        persona: "",
        characterRecord: JSON.stringify(records.npcCarryForward),
        derivedTags: "[]",
        tags: "[]",
        tier: "persistent",
        currentLocationId: "loc-1",
        goals: JSON.stringify({ short_term: [], long_term: [] }),
        beliefs: "[]",
        unprocessedImportance: 0,
        inactiveTicks: 0,
        createdAt: 1,
      },
    ])
    .run();

  getDb()
    .insert(players)
    .values({
      id: "player-d",
      campaignId: context.campaignId,
      name: "Player-D",
      race: "Human",
      gender: "Unknown",
      age: "32",
      appearance: "Weathered and attentive.",
      hp: 5,
      characterRecord: JSON.stringify(records.playerKeepNew),
      derivedTags: "[]",
      tags: "[]",
      equippedItems: "[]",
      currentLocationId: "loc-1",
    })
    .run();

  closeDb();
}

function readNpcRecord(context: TempCampaignContext, id: string) {
  connectDb(context.dbPath);
  try {
    const row = getDb().select().from(npcs).where(eq(npcs.id, id)).get();
    return JSON.parse(row!.characterRecord) as Record<string, any>;
  } finally {
    closeDb();
  }
}

function readPlayerRecord(context: TempCampaignContext, id: string) {
  connectDb(context.dbPath);
  try {
    const row = getDb().select().from(players).where(eq(players.id, id)).get();
    return JSON.parse(row!.characterRecord) as Record<string, any>;
  } finally {
    closeDb();
  }
}

function writeNpcRecord(
  context: TempCampaignContext,
  id: string,
  record: Record<string, unknown>,
) {
  connectDb(context.dbPath);
  try {
    getDb()
      .update(npcs)
      .set({
        name: String((record as { identity?: { displayName?: string } }).identity?.displayName ?? id),
        characterRecord: JSON.stringify(record),
      })
      .where(eq(npcs.id, id))
      .run();
  } finally {
    closeDb();
  }
}

function writePlayerRecord(
  context: TempCampaignContext,
  id: string,
  record: Record<string, unknown>,
) {
  connectDb(context.dbPath);
  try {
    getDb()
      .update(players)
      .set({
        name: String((record as { identity?: { displayName?: string } }).identity?.displayName ?? id),
        characterRecord: JSON.stringify(record),
      })
      .where(eq(players.id, id))
      .run();
  } finally {
    closeDb();
  }
}

function prepareModeCase(
  context: TempCampaignContext,
  targetRecord: Record<string, unknown>,
) {
  writeNpcRecord(context, "npc-a", recordWithFullPack("npc-a", "NPC-A"));
  writeNpcRecord(context, "npc-b", targetRecord);
  writeNpcRecord(context, "npc-c", recordWithFullPack("npc-c", "NPC-C"));
  writePlayerRecord(context, "player-d", recordWithFullPack("player-d", "Player-D", "player"));
}

function readConfig(context: TempCampaignContext) {
  return JSON.parse(fs.readFileSync(context.configPath, "utf-8")) as Record<string, unknown>;
}

function countBackupFiles(context: TempCampaignContext) {
  const logsDir = path.join(context.campaignDir, "logs");
  return fs
    .readdirSync(logsDir)
    .filter((entry) => /^backfill-backup-.*\.json$/i.test(entry)).length;
}

async function importScript(
  context: TempCampaignContext,
  events: LoggedEvent[],
  generateObjectImpl: (args: any) => Promise<{ object: typeof personalityPayload }>,
  options?: {
    loggerSetup?: {
      getLogRoot?: () => string;
      setLogRoot?: (root: string | undefined) => void;
    };
  },
): Promise<ScriptModule> {
  vi.resetModules();

  vi.doMock("../../ai/generate-object-safe.js", () => ({
    safeGenerateObject: vi.fn(generateObjectImpl),
  }));

  vi.doMock("../../ai/index.js", () => ({
    createModel: vi.fn(() => ({ model: "glm-test" })),
  }));

  vi.doMock("../../ai/resolve-role-model.js", () => ({
    resolveRoleModel: vi.fn(() => ({
      provider: {
        id: "glm",
        name: "GLM",
        baseUrl: "http://glm.local",
        apiKey: "secret",
        model: "glm-default",
      },
      temperature: 0.2,
      maxTokens: 1200,
    })),
  }));

  vi.doMock("../../settings/manager.js", () => ({
    loadSettings: vi.fn(() => ({
      providers: [
        {
          id: "glm",
          name: "GLM",
          baseUrl: "http://glm.local",
          apiKey: "secret",
          defaultModel: "glm-default",
        },
      ],
      judge: { providerId: "glm", temperature: 0, maxTokens: 1000 },
      storyteller: { providerId: "glm", temperature: 0.7, maxTokens: 1000 },
      generator: { providerId: "glm", temperature: 0.2, maxTokens: 1200 },
      embedder: { providerId: "glm", temperature: 0, maxTokens: 1000 },
      images: { providerId: "glm", model: "none", stylePrompt: "", enabled: false },
      research: { enabled: false, maxSearchSteps: 1, searchProvider: "duckduckgo" },
      ui: { showRawReasoning: false },
      observability: {
        enabled: true,
        dumpFullPrompts: false,
        roles: {
          judge: true,
          storyteller: true,
          oracle: true,
          npcAgent: true,
          reflection: true,
          embedder: true,
        },
      },
    })),
  }));

  vi.doMock("../../lib/index.js", async () => {
    const loggerContext = await import("../../lib/logger-context.js");
    return {
      runWithTurnContext: loggerContext.runWithTurnContext,
      createLogger: vi.fn(() => ({
        info: (message: string, payload?: unknown) => {
          const ctx = loggerContext.getTurnContext();
          events.push({ level: "info", message, payload, turnId: ctx?.turnId, role: ctx?.role });
        },
        warn: (message: string, payload?: unknown) => {
          const ctx = loggerContext.getTurnContext();
          events.push({ level: "warn", message, payload, turnId: ctx?.turnId, role: ctx?.role });
        },
        error: (message: string, payload?: unknown) => {
          const ctx = loggerContext.getTurnContext();
          events.push({ level: "error", message, payload, turnId: ctx?.turnId, role: ctx?.role });
        },
        debug: (message: string, payload?: unknown) => {
          const ctx = loggerContext.getTurnContext();
          events.push({ level: "debug", message, payload, turnId: ctx?.turnId, role: ctx?.role });
        },
        event: (message: string, payload?: unknown) => {
          const ctx = loggerContext.getTurnContext();
          events.push({ level: "event", message, payload, turnId: ctx?.turnId, role: ctx?.role });
        },
      })),
    };
  });

  if (options?.loggerSetup) {
    vi.doMock("../../lib/logger-setup.js", () => ({
      getLogRoot: vi.fn(options.loggerSetup?.getLogRoot ?? (() => process.cwd())),
      setLogRoot: vi.fn(options.loggerSetup?.setLogRoot ?? (() => {})),
    }));
  }

  vi.doMock("node:fs/promises", async (importOriginal) => {
    const actual = await importOriginal<typeof fsPromises>();
    return {
      ...actual,
      writeFile: async (
        filePath: fsPromises.FileHandle | string | URL,
        data: string | NodeJS.ArrayBufferView,
        options?: Parameters<typeof fsPromises.writeFile>[2],
      ) => {
        const normalized = typeof filePath === "string" ? filePath.replace(/\\/g, "/") : String(filePath);
        if (normalized.endsWith("/.planning/BACKLOG.md")) {
          await actual.mkdir(path.dirname(context.backlogPath), { recursive: true });
          return actual.writeFile(context.backlogPath, data, options);
        }
        return actual.writeFile(filePath as never, data as never, options as never);
      },
    };
  });

  process.env.GSD_CAMPAIGNS_ROOT = context.campaignsDir;

  return import("../backfill-personality.js");
}

describe.sequential("backfill-personality", () => {
  let context: TempCampaignContext;
  let events: LoggedEvent[];

  beforeEach(() => {
    context = makeTempCampaignContext();
    seedCampaign(context);
    events = [];
  });

  afterEach(() => {
    delete process.env.GSD_CAMPAIGNS_ROOT;
    closeDb();
    vi.resetModules();
    vi.restoreAllMocks();
    fs.rmSync(context.rootDir, { recursive: true, force: true });
  });

  it("keeps dry-run side-effect free", async () => {
    const script = await importScript(
      context,
      events,
      async () => ({ object: personalityPayload }),
    );

    const beforeNpc = readNpcRecord(context, "npc-b");
    const beforeConfig = readConfig(context);
    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: true,
      batchSize: 5,
    });

    expect(result).toMatchObject({
      written: 3,
      skipped: 1,
      failed: 0,
      changed: 0,
      campaignsProcessed: 1,
    });
    expect(countBackupFiles(context)).toBe(0);
    expect(readNpcRecord(context, "npc-b")).toEqual(beforeNpc);
    expect(readConfig(context)).toEqual(beforeConfig);
  });

  it("passes a versioned structured output contract to personality generation", async () => {
    const prompts: string[] = [];
    const script = await importScript(
      context,
      events,
      async (args) => {
        prompts.push(String(args.prompt));
        return { object: personalityPayload };
      },
    );

    await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: true,
      batchSize: 5,
    });

    const prompt = prompts.find((value) => value.includes("NPC-B")) ?? prompts[0] ?? "";
    expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: backfill-personality.v1");
    expect(prompt).toContain("summary: string");
    expect(prompt).toContain("voice: string");
    expect(prompt).toContain("decisionStyle: string");
    expect(prompt).toContain("worldview: string");
    expect(prompt).toContain("internalContradictions: string[2-3]");
    expect(prompt).toContain("personalMythology: string");
    expect(prompt).toContain("sampleLines: string[2-3]");
    expect(prompt).toContain("Minimal valid output");
    expect(prompt).toContain("Invalid example");
    expect(prompt).toContain("Source record text is authority");
    expect(prompt).toContain("Do not invent unsupported canon, power, source, faction, biography, or relationship truth");
  });

  it("writes personality, backups, and sentinel on a real run", async () => {
    const script = await importScript(
      context,
      events,
      async () => ({ object: personalityPayload }),
    );

    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
    });

    expect(result).toMatchObject({
      written: 3,
      skipped: 1,
      failed: 0,
      changed: 0,
      campaignsProcessed: 1,
    });
    expect(countBackupFiles(context)).toBe(3);
    expect(readNpcRecord(context, "npc-b").identity.personality.summary).not.toBe("");
    expect(readNpcRecord(context, "npc-c").identity.personality.summary).not.toBe("");
    expect(readPlayerRecord(context, "player-d").identity.personality.summary).not.toBe("");
    expect(readNpcRecord(context, "npc-a").identity.personality.summary).toBe(
      "Existing personality already present.",
    );

    const config = readConfig(context);
    expect(config.personalityBackfillComplete).toBe(true);
    expect(typeof config.backfilledAt).toBe("string");
  });

  it("is idempotent on a second real run", async () => {
    const script = await importScript(
      context,
      events,
      async () => ({ object: personalityPayload }),
    );

    await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
    });
    const backupCount = countBackupFiles(context);

    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
    });

    expect(result).toMatchObject({
      written: 0,
      skipped: 4,
      failed: 0,
      changed: 0,
      campaignsProcessed: 1,
    });
    expect(countBackupFiles(context)).toBe(backupCount);
    expect(readConfig(context).personalityBackfillComplete).toBe(true);
  });

  it("carries forward legacy attachments without overwriting new ones", async () => {
    const script = await importScript(
      context,
      events,
      async () => ({ object: personalityPayload }),
    );

    await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
    });

    expect(readNpcRecord(context, "npc-c").identity.liveDynamics.attachments).toEqual(["old-link"]);
    expect(readPlayerRecord(context, "player-d").identity.liveDynamics.attachments).toEqual(["y"]);
  });

  it("isolates provider failures and appends a backlog follow-up", async () => {
    const script = await importScript(
      context,
      events,
      async (args) => {
        if (JSON.stringify(args.prompt).includes("NPC-B")) {
          throw new Error("provider exhausted for NPC-B");
        }
        return { object: personalityPayload };
      },
    );

    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
    });

    expect(result).toMatchObject({
      written: 2,
      skipped: 1,
      failed: 1,
      changed: 0,
      campaignsProcessed: 1,
    });
    expect(readNpcRecord(context, "npc-b").identity.personality).toBeUndefined();
    expect(readConfig(context).personalityBackfillComplete).toBeUndefined();
    expect(fs.readFileSync(context.backlogPath, "utf-8")).toContain("NPC-B");
  });

  it("retries transient failures and succeeds on a later attempt", async () => {
    let npcBFailures = 0;
    const script = await importScript(
      context,
      events,
      async (args) => {
        if (JSON.stringify(args.prompt).includes("NPC-B") && npcBFailures < 1) {
          npcBFailures += 1;
          throw new Error("transient glitch");
        }
        return { object: personalityPayload };
      },
    );

    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
    });

    expect(result).toMatchObject({
      written: 3,
      skipped: 1,
      failed: 0,
      changed: 0,
      campaignsProcessed: 1,
    });
  });

  it("skips writes when the record changes during generation", async () => {
    let changedOnce = false;
    const script = await importScript(
      context,
      events,
      async (args) => {
        if (!changedOnce && JSON.stringify(args.prompt).includes("NPC-B")) {
          changedOnce = true;
          const sqlite = new Database(context.dbPath);
          try {
            const row = sqlite
              .prepare("select character_record from npcs where id = ?")
              .get("npc-b") as { character_record: string };
            const record = JSON.parse(row.character_record) as Record<string, any>;
            record.profile.personaSummary = "mutated during run";
            sqlite
              .prepare("update npcs set character_record = ? where id = ?")
              .run(JSON.stringify(record), "npc-b");
          } finally {
            sqlite.close();
          }
        }
        return { object: personalityPayload };
      },
    );

    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
    });

    expect(result).toMatchObject({
      written: 2,
      skipped: 1,
      failed: 0,
      changed: 1,
      campaignsProcessed: 1,
    });
    expect(readNpcRecord(context, "npc-b").profile.personaSummary).toBe("mutated during run");
    expect(events.some((event) => event.message === "backfill.skip_record_changed")).toBe(true);
  });

  it("emits structured turn-correlated log events without credential leakage", async () => {
    const script = await importScript(
      context,
      events,
      async () => ({ object: personalityPayload }),
    );

    await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
    });

    expect(events.some((event) => event.message === "backfill.synthesize")).toBe(true);
    expect(events.some((event) => event.message === "backfill.backup")).toBe(true);
    expect(events.some((event) => event.message === "backfill.write")).toBe(true);
    expect(events.some((event) => event.message === "backfill.batch_complete")).toBe(true);
    expect(events.every((event) => !String(event.payload ?? "").includes("apiKey"))).toBe(true);
    expect(events.every((event) => !String(event.payload ?? "").includes("Authorization"))).toBe(true);
    const recordEvents = events.filter((event) =>
      [
        "backfill.synthesize",
        "backfill.backup",
        "backfill.write",
        "backfill.batch_complete",
        "backfill.skip",
        "backfill.skip_record_changed",
        "backfill.attachments_carried_forward",
      ].includes(event.message),
    );
    expect(
      recordEvents.every((event) =>
        event.turnId?.startsWith("backfill-") ?? false,
      ),
    ).toBe(true);
  });

  it("pins JSONL logging to the repo root when invoked from backend cwd", async () => {
    const backendCwd = process.cwd();
    const repoRoot = path.resolve(backendCwd, "..");
    const setLogRoot = vi.fn();
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(backendCwd);

    try {
      await importScript(
        context,
        events,
        async () => ({ object: personalityPayload }),
        {
          loggerSetup: {
            getLogRoot: () => backendCwd,
            setLogRoot,
          },
        },
      );

      expect(setLogRoot).toHaveBeenCalledWith(repoRoot);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it("includes records with legacy summary-only signature in incomplete-pack mode", async () => {
    prepareModeCase(context, recordWithLegacySummaryOnly("npc-b", "NPC-B"));
    let callCount = 0;
    const script = await importScript(context, events, async () => {
      callCount += 1;
      return { object: personalityPayload };
    });

    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
      mode: "incomplete-pack",
    });

    expect(result).toMatchObject({
      written: 1,
      skipped: 3,
      failed: 0,
      changed: 0,
      campaignsProcessed: 1,
    });
    expect(callCount).toBe(1);
    expect(readNpcRecord(context, "npc-b").identity.personality.voice).toBe(personalityPayload.voice);
    expect(readNpcRecord(context, "npc-b").identity.personality.sampleLines).toEqual(
      personalityPayload.sampleLines,
    );
  });

  it("SKIPS records with full prose but empty sampleLines in incomplete-pack mode", async () => {
    prepareModeCase(context, recordWithProseButEmptySampleLines("npc-b", "NPC-B"));
    let callCount = 0;
    const script = await importScript(context, events, async () => {
      callCount += 1;
      return { object: personalityPayload };
    });

    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
      mode: "incomplete-pack",
    });

    expect(result).toMatchObject({
      written: 0,
      skipped: 4,
      failed: 0,
      changed: 0,
      campaignsProcessed: 1,
    });
    expect(callCount).toBe(0);
    expect(readNpcRecord(context, "npc-b").identity.personality.sampleLines).toEqual([]);
  });

  it("SKIPS records with full prose but empty internalContradictions in incomplete-pack mode", async () => {
    prepareModeCase(context, recordWithProseButEmptyContradictions("npc-b", "NPC-B"));
    let callCount = 0;
    const script = await importScript(context, events, async () => {
      callCount += 1;
      return { object: personalityPayload };
    });

    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
      mode: "incomplete-pack",
    });

    expect(result).toMatchObject({
      written: 0,
      skipped: 4,
      failed: 0,
      changed: 0,
      campaignsProcessed: 1,
    });
    expect(callCount).toBe(0);
    expect(readNpcRecord(context, "npc-b").identity.personality.internalContradictions).toEqual([]);
  });

  it("SKIPS fully populated personality packs in incomplete-pack mode", async () => {
    prepareModeCase(context, recordWithFullPack("npc-b", "NPC-B"));
    let callCount = 0;
    const script = await importScript(context, events, async () => {
      callCount += 1;
      return { object: personalityPayload };
    });

    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
      mode: "incomplete-pack",
    });

    expect(result).toMatchObject({
      written: 0,
      skipped: 4,
      failed: 0,
      changed: 0,
      campaignsProcessed: 1,
    });
    expect(callCount).toBe(0);
    expect(readNpcRecord(context, "npc-b").identity.personality.summary).toBe(
      personalityPayload.summary,
    );
  });

  it("includes summary-empty records in incomplete-pack mode", async () => {
    prepareModeCase(context, recordWithEmptySummary("npc-b", "NPC-B"));
    let callCount = 0;
    const script = await importScript(context, events, async () => {
      callCount += 1;
      return { object: personalityPayload };
    });

    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
      mode: "incomplete-pack",
    });

    expect(result).toMatchObject({
      written: 1,
      skipped: 3,
      failed: 0,
      changed: 0,
      campaignsProcessed: 1,
    });
    expect(callCount).toBe(1);
    expect(readNpcRecord(context, "npc-b").identity.personality.summary).toBe(
      personalityPayload.summary,
    );
  });

  it("keeps default mode unchanged for legacy summary-only records", async () => {
    prepareModeCase(context, recordWithLegacySummaryOnly("npc-b", "NPC-B"));
    let callCount = 0;
    const script = await importScript(context, events, async () => {
      callCount += 1;
      return { object: personalityPayload };
    });

    const result = await script.runBackfill({
      campaignFilter: context.campaignId,
      dryRun: false,
      batchSize: 5,
    });

    expect(result).toMatchObject({
      written: 0,
      skipped: 4,
      failed: 0,
      changed: 0,
      campaignsProcessed: 1,
    });
    expect(callCount).toBe(0);
    expect(readNpcRecord(context, "npc-b").identity.personality.voice).toBe("");
  });

  it("parseArgs rejects an invalid --mode value", async () => {
    const script = await importScript(
      context,
      events,
      async () => ({ object: personalityPayload }),
    );

    expect(() => script.parseArgs(["node", "script", "--mode", "bogus"])).toThrow(
      /Invalid --mode value/i,
    );
  });
});
