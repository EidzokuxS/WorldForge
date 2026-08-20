import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSearchEpisodicEvents = vi.fn();
const mockReadPendingCommittedEvents = vi.fn();
const mockCommitAuthorityTrace = vi.fn();
const mockReadWorldClock = vi.fn();
const mockValidateBaseWorldVersion = vi.fn();
const mockExecuteToolCall = vi.fn();

// Mock all external dependencies before imports
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  searchEpisodicEvents: (...args: unknown[]) => mockSearchEpisodicEvents(...args),
  readPendingCommittedEvents: (...args: unknown[]) => mockReadPendingCommittedEvents(...args),
}));

vi.mock("../../vectors/embeddings.js", () => ({
  embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

vi.mock("../tool-executor.js", () => ({
  executeToolCall: (...args: unknown[]) => mockExecuteToolCall(...args),
}));

vi.mock("../living-world-authority.js", () => ({
  commitAuthorityTrace: (...args: unknown[]) => mockCommitAuthorityTrace(...args),
  readWorldClock: (...args: unknown[]) => mockReadWorldClock(...args),
  validateBaseWorldVersion: (...args: unknown[]) => mockValidateBaseWorldVersion(...args),
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "",
    steps: [
      {
        toolCalls: [
          {
            toolName: "set_belief",
            input: { belief: "The market is dangerous", evidence: ["bandit attack"] },
          },
        ],
        toolResults: [
          { output: { accepted: false, proposalOnly: true, toolName: "set_belief" } },
        ],
      },
    ],
  }),
  streamText: vi.fn(),
  tool: vi.fn((def: Record<string, unknown>) => def),
  stepCountIs: vi.fn().mockReturnValue(() => false),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

import { createReflectionTools } from "../reflection-tools.js";
import { runReflection, checkAndTriggerReflections, REFLECTION_THRESHOLD } from "../reflection-agent.js";
import { getDb } from "../../db/index.js";

const CAMPAIGN_ID = "test-campaign-123";
const NPC_ID = "npc-001";
const TICK = 10;

const JUDGE_PROVIDER = {
  id: "test-provider",
  name: "Test",
  baseUrl: "http://localhost:1234",
  apiKey: "test-key",
  model: "test-model",
};

// -- Mock DB helpers ----------------------------------------------------------

function createMockNpc(overrides: Record<string, unknown> = {}) {
  return {
    id: NPC_ID,
    campaignId: CAMPAIGN_ID,
    name: "Greta the Merchant",
    persona: "A shrewd merchant who values profit above all",
    tags: '["merchant","shrewd","wealthy"]',
    tier: "key",
    currentLocationId: "loc-001",
    goals: '{"short_term":["sell rare goods"],"long_term":["become guild master"]}',
    beliefs: '["money talks"]',
    unprocessedImportance: 20,
    characterRecord: JSON.stringify({
      identity: {
        id: NPC_ID,
        campaignId: CAMPAIGN_ID,
        role: "npc",
        tier: "key",
        displayName: "Greta the Merchant",
        canonicalStatus: "original",
      },
      profile: {
        species: "",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "A merchant who keeps ledgers on everyone.",
        personaSummary: "A patient fixer who trades in favors.",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: "loc-001",
        currentLocationName: "Market Square",
        relationshipRefs: [],
        socialStatus: ["connected"],
        originMode: "native",
      },
      motivations: {
        shortTermGoals: ["Stabilize the bazaar"],
        longTermGoals: ["Own the market district"],
        beliefs: ["Every debt can be collected"],
        drives: ["Profit"],
        frictions: ["Watched by rivals"],
      },
      capabilities: {
        traits: ["Observant"],
        skills: [{ name: "Negotiation", tier: "Master" }],
        flaws: ["Secretive"],
        specialties: [],
        wealthTier: "Wealthy",
      },
      state: {
        hp: 5,
        conditions: ["Hidden"],
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
        sourceKind: "worldgen",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: "scaffold",
        legacyTags: ["merchant", "shrewd", "wealthy"],
      },
    }),
    derivedTags: '["merchant","shrewd","wealthy"]',
    ...overrides,
  };
}

function setupMockDb(options: {
  npc?: Record<string, unknown> | null;
  npcsAboveThreshold?: Record<string, unknown>[];
  authorityTraceId?: string;
}) {
  const mockNpc = options.npc !== undefined ? options.npc : createMockNpc();
  const npcsAboveThreshold = options.npcsAboveThreshold ?? [];
  const authorityTraceId = options.authorityTraceId ?? "authority-trace-1";
  const run = vi.fn();
  const values = vi.fn().mockReturnValue({ run });
  let selectAuthorityTraceId = false;

  const db = {} as {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    values: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
  };

  db.select = vi.fn((fields?: Record<string, unknown>) => {
    selectAuthorityTraceId = Boolean(fields && Object.keys(fields).length === 1 && "id" in fields);
    return db;
  });
  db.from = vi.fn().mockReturnValue(db);
  db.where = vi.fn().mockReturnValue(db);
  db.insert = vi.fn().mockReturnValue({ values });
  db.update = vi.fn().mockReturnValue(db);
  db.set = vi.fn().mockReturnValue(db);
  db.values = values;
  db.run = run;
  db.get = vi.fn(() => {
    if (selectAuthorityTraceId) {
      selectAuthorityTraceId = false;
      return { id: authorityTraceId };
    }
    return mockNpc;
  });
  db.all = vi.fn().mockReturnValue(npcsAboveThreshold);
  db.transaction = vi.fn((callback: () => unknown) => callback());

  (getDb as ReturnType<typeof vi.fn>).mockReturnValue(db);
  return db;
}

// -- Tests --------------------------------------------------------------------

describe("createReflectionTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadWorldClock.mockReturnValue({
      campaignId: CAMPAIGN_ID,
      worldVersion: 7,
      worldTimeMinutes: 70,
      currentTick: 70,
      updatedAt: 0,
    });
    mockCommitAuthorityTrace.mockReturnValue({
      toolResultId: "tool-result-reflection-1",
      campaignId: CAMPAIGN_ID,
      sourceEntity: { type: "npc", id: NPC_ID },
      baseWorldVersion: 7,
      resultWorldVersion: 8,
      worldTimeMinutes: 70,
      elapsedWorldTimeMinutes: 0,
      stateDeltaRefs: [],
      eventRefs: [],
      witnesses: [],
      knowledgeOutputs: [],
      visibilityOutputs: [],
      resources: [],
    });
  });

  it("returns 7 tools including explicit deeper-identity promotion", () => {
    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    expect(tools).toHaveProperty("set_belief");
    expect(tools).toHaveProperty("set_goal");
    expect(tools).toHaveProperty("drop_goal");
    expect(tools).toHaveProperty("set_relationship");
    expect(tools).toHaveProperty("promote_identity_change");
    expect(tools).toHaveProperty("upgrade_wealth");
    expect(tools).toHaveProperty("upgrade_skill");
    expect(Object.keys(tools)).toHaveLength(7);
  });

  it("set_belief returns a proposal without mutating NPC beliefs or actor knowledge", async () => {
    const mockDb = setupMockDb({});

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.set_belief.execute!(
      { belief: "The market is dangerous", evidence: ["bandit attack"] },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "set_belief",
      proposal: {
        npcId: NPC_ID,
        belief: "The market is dangerous",
        evidence: ["bandit attack"],
      },
    });
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(mockValidateBaseWorldVersion).not.toHaveBeenCalled();
    expect(mockCommitAuthorityTrace).not.toHaveBeenCalled();
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });

  it("set_goal returns a proposal without mutating NPC goals", async () => {
    const mockDb = setupMockDb({});

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.set_goal.execute!(
      { goal: "hire bodyguards", priority: "short_term" as const },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "set_goal",
      proposal: {
        npcId: NPC_ID,
        goal: "hire bodyguards",
        priority: "short_term",
      },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(mockCommitAuthorityTrace).not.toHaveBeenCalled();
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });

  it("drop_goal returns a proposal without mutating NPC goals", async () => {
    const mockDb = setupMockDb({});

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.drop_goal.execute!(
      { goal: "Sell Rare Goods" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "drop_goal",
      proposal: {
        npcId: NPC_ID,
        goal: "Sell Rare Goods",
      },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(mockCommitAuthorityTrace).not.toHaveBeenCalled();
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });

  it("set_relationship returns a proposal without background tool execution", async () => {
    const mockDb = setupMockDb({});

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.set_relationship.execute!(
      { target: "Bandit Leader", tag: "enemy", reason: "Threatened my livelihood" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "set_relationship",
      proposal: {
        npcId: NPC_ID,
        target: "Bandit Leader",
        tag: "enemy",
        reason: "Threatened my livelihood",
      },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(mockCommitAuthorityTrace).not.toHaveBeenCalled();
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });

  it("promote_identity_change returns a proposal without identity mutation authority", async () => {
    const mockDb = setupMockDb({});

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.promote_identity_change.execute!(
      {
        selfImage: "A merchant who now sees threat before profit.",
        evidence: ["evt-strong-1"],
        whyNow: "The repeated direct threats forced a durable self-image change.",
      },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "promote_identity_change",
      proposal: {
        npcId: NPC_ID,
        selfImage: "A merchant who now sees threat before profit.",
        evidence: ["evt-strong-1"],
        whyNow: "The repeated direct threats forced a durable self-image change.",
      },
    });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(mockCommitAuthorityTrace).not.toHaveBeenCalled();
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });

  it("upgrade_wealth and upgrade_skill return proposals without capability mutation authority", async () => {
    const mockDb = setupMockDb({});

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const wealthResult = await tools.upgrade_wealth.execute!(
      { entityName: "Greta the Merchant", entityType: "npc", newTier: "Obscenely Rich" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const skillResult = await tools.upgrade_skill.execute!(
      { entityName: "Greta the Merchant", entityType: "npc", skillName: "Alchemy", newTier: "Novice" },
      { toolCallId: "tc2", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(wealthResult).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "upgrade_wealth",
      proposal: {
        npcId: NPC_ID,
        entityName: "Greta the Merchant",
        entityType: "npc",
        currentWealthTag: "Wealthy",
        newTier: "Obscenely Rich",
      },
    });
    expect(skillResult).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "upgrade_skill",
      proposal: {
        npcId: NPC_ID,
        entityName: "Greta the Merchant",
        entityType: "npc",
        skillName: "Alchemy",
        currentTier: null,
        newTier: "Novice",
      },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockCommitAuthorityTrace).not.toHaveBeenCalled();
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });
});

describe("runReflection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchEpisodicEvents.mockResolvedValue([
      {
        id: "evt-1",
        text: "Greta sold rare goods to the adventurer",
        tick: 3,
        location: "Market Square",
        participants: ["Greta the Merchant", "player"],
        importance: 5,
        type: "event",
        vector: [0.1, 0.2],
      },
      {
        id: "evt-2",
        text: "Greta was threatened by bandits",
        tick: 4,
        location: "Market Square",
        participants: ["Greta the Merchant", "Bandit Leader"],
        importance: 7,
        type: "event",
        vector: [0.3, 0.4],
      },
    ]);
    mockReadPendingCommittedEvents.mockReturnValue([]);
  });

  it("calls Judge LLM with NPC episodic events and resets unprocessedImportance to 0", async () => {
    const mockDb = setupMockDb({});
    const { generateText } = await import("ai");

    const result = await runReflection(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    expect(generateText).toHaveBeenCalled();
    // Verify unprocessedImportance was reset to 0
    const setCall = mockDb.set.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)?.unprocessedImportance === 0,
    );
    expect(setCall).toBeDefined();
  });

  it("builds evidence-driven reflection prompts from canonical record fields before legacy blobs", async () => {
    setupMockDb({
      npc: createMockNpc({
        persona: "Legacy merchant persona",
        tags: '["legacy-only"]',
        goals: '{"short_term":["legacy goal"],"long_term":[]}',
        beliefs: '["legacy belief"]',
      }),
    });

    const { generateText } = await import("ai");

    await runReflection(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER, {
      ...JUDGE_PROVIDER,
      id: "embedder-provider",
    });

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain(
      "Canonical NPC record authority: profile, socialContext, motivations, capabilities, and state define the current baseline before any compatibility aliases.",
    );
    expect(systemPrompt).toContain(
      "Derived runtime tags are compact compatibility evidence, not the source-of-truth worldview.",
    );
    expect(systemPrompt).toContain("Current profile: A patient fixer who trades in favors.");
    expect(systemPrompt).toContain("Current beliefs: [Every debt can be collected]");
    expect(systemPrompt).toContain("Current goals:\n  - [short] Stabilize the bazaar\n  - [long] Own the market district");
    expect(systemPrompt).toContain("Recent evidence:");
    expect(systemPrompt).toContain(
      "Beliefs, goals, and relationships are the first-class outcomes for ordinary reflection.",
    );
    expect(systemPrompt).toContain(
      "Reflection tools are proposal-only: they cannot directly mutate gameplay truth, NPC records, relationships, capabilities, or actor knowledge.",
    );
    expect(systemPrompt).toContain(
      "Accepted reflection changes must be routed later through a typed backend proposal executor with explicit state owners and receipts.",
    );
    expect(systemPrompt).toContain("Wealth changes require significant trade/loot events.");
    expect(systemPrompt).toContain("Skill upgrades require 3+ successful uses of that skill.");
    expect(systemPrompt).toContain(
      "Wealth and skill upgrades require materially stronger evidence than ordinary belief, goal, or relationship drift.",
    );
    expect(systemPrompt).not.toContain("Legacy merchant persona");
    expect(systemPrompt).not.toContain("legacy belief");
    expect(systemPrompt).not.toContain("Use the legacy persona/goals/beliefs blobs as the main worldview");
    expect(systemPrompt).not.toContain("Use tag-only worldview updates");
  });

  it("does not fall back to raw currentLocationId in reflection prompts", async () => {
    const npc = createMockNpc();
    const record = JSON.parse(String(npc.characterRecord)) as Record<string, unknown>;
    const socialContext = record.socialContext as Record<string, unknown>;
    socialContext.currentLocationName = null;
    setupMockDb({
      npc: {
        ...npc,
        currentLocationId: "loc-private-ledger-room",
        characterRecord: JSON.stringify(record),
      },
    });

    const { generateText } = await import("ai");

    await runReflection(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER, {
      ...JUDGE_PROVIDER,
      id: "embedder-provider",
    });

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("Current social context: location=unknown");
    expect(systemPrompt).not.toContain("loc-private-ledger-room");
  });

  it("redacts backend refs from reflection evidence and stored NPC prompt fields", async () => {
    const npc = createMockNpc();
    const record = JSON.parse(String(npc.characterRecord)) as Record<string, unknown>;
    const identity = record.identity as Record<string, unknown>;
    identity.baseFacts = {
      biography: "Ledger witness for actor:actor-private and 55555555-5555-4555-8555-555555555555.",
      socialRole: ["keeper of location:loc-ledger"],
      hardConstraints: ["Never reveal tool-result-hard-stop"],
    };
    identity.behavioralCore = {
      attachments: [],
      selfImage: "Witness tied to loc-self-ref",
    };
    identity.liveDynamics = {
      attachments: ["owes actor:actor-contact"],
      activeGoals: ["secure route-private-9"],
      beliefDrift: ["trusts knowledge:fact-private"],
      currentStrains: ["watched by source:private"],
      earnedChanges: ["survived tool-result-earned"],
    };
    identity.personality = {
      summary: "Careful around actor:actor-handler.",
      voice: "Warns about location:loc-voice.",
      decisionStyle: "Avoids route-private-2.",
      worldview: "Debts bind faction:hidden-ledger.",
      internalContradictions: ["wants item:sealed-token"],
      personalMythology: "Marked by event:hidden-bell.",
      sampleLines: ["I remember tool-result-sample."],
    };
    record.profile = {
      ...(record.profile as Record<string, unknown>),
      personaSummary: "Files claims under tool-result-profile.",
    };
    record.socialContext = {
      ...(record.socialContext as Record<string, unknown>),
      currentLocationName: "location:loc-reflection",
      socialStatus: ["linked to actor:actor-status"],
    };
    record.motivations = {
      ...(record.motivations as Record<string, unknown>),
      shortTermGoals: ["follow route-short-1"],
      longTermGoals: ["protect knowledge:fact-long"],
      beliefs: ["player carries item:sealed-message"],
    };

    setupMockDb({
      npc: {
        ...npc,
        characterRecord: JSON.stringify(record),
      },
    });
    mockReadPendingCommittedEvents.mockReturnValue([
      {
        id: "evt-pending",
        text: "Greta saw actor:actor-private near loc-pending and tool-result-pending.",
        tick: TICK,
        location: "Market Square",
        participants: ["Greta the Merchant", "player"],
        importance: 8,
        type: "dialogue",
      },
    ]);
    mockSearchEpisodicEvents.mockResolvedValue([
      {
        id: "evt-semantic",
        text: "Greta stored location:loc-semantic under source:semantic-private.",
        tick: TICK - 1,
        location: "Market Square",
        participants: ["Greta the Merchant"],
        importance: 7,
        type: "event",
        vector: [0.1, 0.2],
      },
    ]);

    const { generateText } = await import("ai");

    await runReflection(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER, {
      ...JUDGE_PROVIDER,
      id: "embedder-provider",
    });

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("[backend ref hidden]");
    for (const raw of [
      "actor:actor-private",
      "55555555-5555-4555-8555-555555555555",
      "location:loc-ledger",
      "tool-result-hard-stop",
      "loc-self-ref",
      "actor:actor-contact",
      "route-private-9",
      "knowledge:fact-private",
      "source:private",
      "tool-result-earned",
      "actor:actor-handler",
      "location:loc-voice",
      "route-private-2",
      "faction:hidden-ledger",
      "item:sealed-token",
      "event:hidden-bell",
      "tool-result-sample",
      "tool-result-profile",
      "location:loc-reflection",
      "actor:actor-status",
      "route-short-1",
      "knowledge:fact-long",
      "item:sealed-message",
      "loc-pending",
      "tool-result-pending",
      "location:loc-semantic",
      "source:semantic-private",
    ]) {
      expect(systemPrompt).not.toContain(raw);
    }
  });

  it("beliefs, goals, and relationships first when reflection decides what to change", async () => {
    setupMockDb({});
    const { generateText } = await import("ai");

    await runReflection(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER, {
      ...JUDGE_PROVIDER,
      id: "embedder-provider",
    });

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain(
      "Beliefs, goals, and relationships are the first-class outcomes for ordinary reflection.",
    );
    expect(systemPrompt).toContain(
      "Ordinary interaction arcs should usually produce belief, goal, or relationship drift proposals using the structured-state tools.",
    );
  });

  it("materially stronger evidence keeps wealth and skill progression secondary", async () => {
    setupMockDb({});
    const { generateText } = await import("ai");

    await runReflection(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER, {
      ...JUDGE_PROVIDER,
      id: "embedder-provider",
    });

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain(
      "Wealth and skill upgrades require materially stronger evidence than ordinary belief, goal, or relationship drift.",
    );
    expect(systemPrompt).toContain("Wealth changes require significant trade/loot events.");
    expect(systemPrompt).toContain("Skill upgrades require 3+ successful uses of that skill.");
    expect(systemPrompt).toContain("If nothing significant has changed, you may choose not to call any tools.");
  });

  it("uses same-turn pending evidence in Recent evidence when current-turn events are not embedded yet", async () => {
    setupMockDb({});
    mockSearchEpisodicEvents.mockResolvedValue([]);
    mockReadPendingCommittedEvents.mockReturnValue([
      {
        id: "evt-pending",
        text: "Greta the Merchant privately promises the player safe passage tonight.",
        tick: TICK,
        location: "Market Square",
        participants: ["Greta the Merchant", "player"],
        importance: 8,
        type: "dialogue",
      },
    ]);

    const { generateText } = await import("ai");

    await runReflection(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER, {
      ...JUDGE_PROVIDER,
      id: "embedder-provider",
    });

    expect(mockReadPendingCommittedEvents).toHaveBeenCalledWith(CAMPAIGN_ID, TICK);
    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("Recent evidence:");
    expect(systemPrompt).toContain(
      `[Tick ${TICK}] Greta the Merchant privately promises the player safe passage tonight.`,
    );
    expect(systemPrompt).not.toContain("No recent events recorded.");
  });

  it("frames ordinary reflection as live-dynamics-first and reserves deeper identity change for explicit promotion", async () => {
    setupMockDb({});
    const { generateText } = await import("ai");

    await runReflection(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER, {
      ...JUDGE_PROVIDER,
      id: "embedder-provider",
    });

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("Reflection tools are proposal-only: they cannot directly mutate gameplay truth, NPC records, relationships, capabilities, or actor knowledge.");
    expect(systemPrompt).toContain("Propose active goals, belief drift, current strains, and relationships before considering deeper identity edits.");
    expect(systemPrompt).toContain("Deeper identity-change proposals require explicit promotion with multiple strong evidence points.");
  });
});

describe("checkAndTriggerReflections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only reflects NPCs with unprocessedImportance >= REFLECTION_THRESHOLD", async () => {
    const qualifyingNpc = createMockNpc({ id: "npc-above", unprocessedImportance: 20 });
    const mockDb = setupMockDb({
      npcsAboveThreshold: [qualifyingNpc],
    });

    // When checkAndTriggerReflections runs, it queries NPCs above threshold then calls runReflection for each
    // The mock db.all returns npcsAboveThreshold for the first all() call
    // The subsequent get() calls within runReflection use the default npc mock
    const results = await checkAndTriggerReflections(CAMPAIGN_ID, TICK, JUDGE_PROVIDER);

    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("skips NPCs below threshold (returns empty array)", async () => {
    setupMockDb({
      npcsAboveThreshold: [], // No NPCs above threshold
    });

    const results = await checkAndTriggerReflections(CAMPAIGN_ID, TICK, JUDGE_PROVIDER);

    expect(results).toEqual([]);
  });

  it("REFLECTION_THRESHOLD equals 10", () => {
    expect(REFLECTION_THRESHOLD).toBe(10);
  });
});
