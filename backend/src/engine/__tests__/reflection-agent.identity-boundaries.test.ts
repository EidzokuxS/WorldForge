import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn().mockResolvedValue({ success: true, result: {} }),
}));

import { getDb } from "../../db/index.js";
import { createReflectionTools } from "../reflection-tools.js";

const CAMPAIGN_ID = "test-campaign-123";
const NPC_ID = "npc-001";

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
        canonicalStatus: "known_ip_canonical",
        baseFacts: {
          biography: "A broker with debts in every district.",
          socialRole: ["market broker"],
          hardConstraints: ["Cannot burn her ledger network"],
        },
        behavioralCore: {
          motives: ["Keep leverage over the market"],
          pressureResponses: ["Gets quieter and more surgical under pressure"],
          taboos: ["Will not beg"],
          attachments: ["Her debtors"],
          selfImage: "The hinge the market swings on.",
        },
        liveDynamics: {
          activeGoals: ["Stabilize the bazaar"],
          beliefDrift: ["Every debt can be collected"],
          currentStrains: ["Watched by rivals"],
          earnedChanges: [],
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
      continuity: {
        identityInertia: "anchored",
        protectedCore: ["identity.baseFacts", "identity.behavioralCore"],
        mutableSurface: ["identity.liveDynamics"],
        changePressureNotes: ["Shallow scenes should update strain before core identity."],
      },
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

function setupMockDb(npc: Record<string, unknown> = createMockNpc()) {
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

  (getDb as ReturnType<typeof vi.fn>).mockReturnValue(db);
  return db;
}

function parseProjectedRecord(db: ReturnType<typeof setupMockDb>) {
  const setCall = db.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
  expect(setCall).toBeDefined();
  expect(typeof setCall?.characterRecord).toBe("string");
  return JSON.parse(String(setCall?.characterRecord)) as {
    identity: {
      behavioralCore: {
        selfImage: string;
        motives: string[];
      };
      liveDynamics: {
        activeGoals: string[];
        beliefDrift: string[];
        earnedChanges: string[];
      };
    };
  };
}

describe("reflection identity boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("set_belief updates liveDynamics belief drift without rewriting the behavioral core", async () => {
    const db = setupMockDb();
    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);

    await tools.set_belief.execute!(
      {
        belief: "The player may be worth trusting",
        evidence: ["The player covered Greta's escape route"],
      },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    const projected = parseProjectedRecord(db);
    expect(projected.identity.liveDynamics.beliefDrift).toContain("The player may be worth trusting");
    expect(projected.identity.behavioralCore.selfImage).toBe("The hinge the market swings on.");
  });

  it("set_goal updates liveDynamics active goals instead of treating shallow goals as stable identity truth", async () => {
    const db = setupMockDb();
    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);

    await tools.set_goal.execute!(
      {
        goal: "Hide the registry ledgers tonight",
        priority: "short_term",
      },
      { toolCallId: "tc2", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    const projected = parseProjectedRecord(db);
    expect(projected.identity.liveDynamics.activeGoals).toContain("Hide the registry ledgers tonight");
    expect(projected.identity.behavioralCore.motives).toEqual(["Keep leverage over the market"]);
  });

  it("rejects deeper identity promotion when anchored continuity only has one weak evidence point", async () => {
    setupMockDb();
    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);

    const result = await tools.promote_identity_change.execute!(
      {
        axis: "self_image",
        newValue: "A protector who openly trusts the player",
        evidence: ["The player was polite once"],
        whyNow: "One tense conversation changed everything.",
      },
      { toolCallId: "tc3", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/multiple strong evidence/i);
  });

  it("allows explicit earned promotion when anchored continuity has accumulated evidence", async () => {
    const db = setupMockDb();
    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);

    await tools.promote_identity_change.execute!(
      {
        axis: "self_image",
        newValue: "A protector willing to trust chosen allies with the ledger network",
        evidence: [
          "The player shielded Greta during the raid",
          "The player returned the missing ledger pages without leverage",
        ],
        whyNow: "Repeated costly loyalty broke Greta's assumption that every ally is temporary.",
      },
      { toolCallId: "tc4", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    const projected = parseProjectedRecord(db);
    expect(projected.identity.behavioralCore.selfImage).toBe(
      "A protector willing to trust chosen allies with the ledger network",
    );
    expect(projected.identity.liveDynamics.earnedChanges[0]).toContain("self_image");
  });
});
