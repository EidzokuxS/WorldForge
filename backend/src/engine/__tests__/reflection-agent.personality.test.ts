import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    text: "",
    steps: [],
  }),
);

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  searchEpisodicEvents: vi.fn().mockResolvedValue([]),
  readPendingCommittedEvents: vi.fn().mockReturnValue([]),
}));

vi.mock("../../vectors/embeddings.js", () => ({
  embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn().mockResolvedValue({ success: true, result: {} }),
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  tool: vi.fn((definition: Record<string, unknown>) => definition),
  stepCountIs: vi.fn().mockReturnValue(() => false),
}));

import { getDb } from "../../db/index.js";
import { runReflection } from "../reflection-agent.js";
import { createReflectionTools } from "../reflection-tools.js";
import type { ZodType } from "zod";

const CAMPAIGN_ID = "camp-1";
const NPC_ID = "npc-1";
const JUDGE_PROVIDER = {
  id: "judge",
  name: "Judge",
  baseUrl: "http://localhost:1234",
  apiKey: "test-key",
  model: "test-model",
};

function createMockNpc() {
  return {
    id: NPC_ID,
    campaignId: CAMPAIGN_ID,
    name: "Greta the Merchant",
    persona: "Legacy persona",
    tags: '["merchant"]',
    tier: "key",
    currentLocationId: "loc-1",
    goals: '{"short_term":["Stabilize the bazaar"],"long_term":["Own the market district"]}',
    beliefs: '["Every debt can be collected"]',
    unprocessedImportance: 20,
    inactiveTicks: 0,
    createdAt: 0,
    characterRecord: JSON.stringify({
      identity: {
        id: NPC_ID,
        campaignId: CAMPAIGN_ID,
        role: "npc",
        tier: "key",
        displayName: "Greta the Merchant",
        canonicalStatus: "original",
        baseFacts: {
          biography: "A merchant who keeps ledgers on everyone.",
          socialRole: ["broker"],
          hardConstraints: ["Protect the bazaar"],
        },
        behavioralCore: {
          motives: ["Profit"],
          pressureResponses: ["Turns colder under pressure"],
          taboos: [],
          attachments: ["Old route"],
          selfImage: "Keeps the market stitched together.",
        },
        liveDynamics: {
          attachments: ["Old route"],
          activeGoals: ["Stabilize the bazaar"],
          beliefDrift: ["Elara may be useful"],
          currentStrains: ["Watched by rivals"],
          earnedChanges: [],
        },
        personality: {
          summary: "A patient fixer who turns favors into structure.",
          voice: "Low-key, dry, and careful not to waste leverage.",
          decisionStyle: "Tests soft options first, then commits hard.",
          worldview: "Order comes from the people who keep accounts.",
          internalContradictions: [
            "Insists everything is transactional, but keeps rescuing people she cannot invoice.",
          ],
          personalMythology: "If the bazaar survives, it will be because she kept the books balanced.",
          sampleLines: ["I can forgive panic. I do not forgive sloppy numbers."],
        },
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
        currentLocationId: "loc-1",
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
        legacyTags: ["merchant"],
      },
    }),
    derivedTags: '["merchant"]',
  };
}

function setupMockDb() {
  const npc = createMockNpc();
  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    run: vi.fn(),
    get: vi.fn().mockReturnValue(npc),
    all: vi.fn().mockReturnValue([]),
  };

  vi.mocked(getDb).mockReturnValue(db as never);
  return { db, npc };
}

describe("reflection personality contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds reflection prompts from current personality instead of behavioral core", async () => {
    setupMockDb();

    await runReflection(CAMPAIGN_ID, NPC_ID, 10, JUDGE_PROVIDER, JUDGE_PROVIDER);

    const systemPrompt = generateTextMock.mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain(
      "Current personality: summary=A patient fixer who turns favors into structure.; voice=Low-key, dry, and careful not to waste leverage.; contradictions=[Insists everything is transactional, but keeps rescuing people she cannot invoice.]; self-image=Keeps the market stitched together.",
    );
    expect(systemPrompt).toContain(
      "Use promote_identity_change only when repeated, material evidence justifies modifying personality or baseFacts.",
    );
    expect(systemPrompt).not.toContain("Current behavioral core:");
  });

  it("accepts personality patch inputs and rejects legacy behavioralCore writes", () => {
    setupMockDb();
    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const schema = tools.promote_identity_change.inputSchema as ZodType;

    expect(
      schema.safeParse({
        personality: {
          summary: "Now trusts Elara with the ledger keys.",
        },
        liveDynamicsAttachments: ["Elara"],
        selfImage: "A broker willing to risk herself for the market.",
        hardConstraints: ["Protect the bazaar", "Protect Elara"],
        evidence: ["Elara saved the bazaar twice."],
        whyNow: "Repeated evidence finally justifies promoting the change into her durable identity.",
      }).success,
    ).toBe(true);

    expect(
      schema.safeParse({
        behavioralCore: {
          motives: ["Profit"],
        },
        evidence: ["legacy"],
        whyNow: "legacy path",
      }).success,
    ).toBe(false);
  });

  it("writes promoted identity changes into personality and live dynamics attachments", async () => {
    const { db } = setupMockDb();
    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);

    await tools.promote_identity_change.execute!(
      {
        personality: {
          summary: "Now trusts Elara with the ledger keys.",
          voice: "Still dry, but no longer hiding every concern.",
        },
        liveDynamicsAttachments: ["Elara"],
        selfImage: "A broker willing to risk herself for the market.",
        hardConstraints: ["Protect the bazaar", "Protect Elara"],
        evidence: ["Elara saved the bazaar twice."],
        whyNow: "Repeated evidence finally justifies promoting the change into her durable identity.",
      },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    const payload = db.set.mock.calls[0]?.[0] as Record<string, string>;
    const updatedRecord = JSON.parse(payload.characterRecord);
    expect(updatedRecord.identity.personality.summary).toBe(
      "Now trusts Elara with the ledger keys.",
    );
    expect(updatedRecord.identity.personality.voice).toBe(
      "Still dry, but no longer hiding every concern.",
    );
    expect(updatedRecord.identity.personality.worldview).toBe(
      "Order comes from the people who keep accounts.",
    );
    expect(updatedRecord.identity.liveDynamics.attachments).toEqual(["Elara"]);
    expect(updatedRecord.identity.behavioralCore.selfImage).toBe(
      "A broker willing to risk herself for the market.",
    );
    expect(updatedRecord.identity.baseFacts.hardConstraints).toEqual([
      "Protect the bazaar",
      "Protect Elara",
    ]);
  });
});
