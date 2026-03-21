import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before imports
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn().mockResolvedValue({ success: true, result: {} }),
}));

vi.mock("ai", () => ({
  tool: vi.fn((def: Record<string, unknown>) => def),
}));

import {
  createReflectionTools,
  WEALTH_TIERS,
  SKILL_TIERS,
  RELATIONSHIP_TAGS,
} from "../reflection-tools.js";
import { getDb } from "../../db/index.js";

const CAMPAIGN_ID = "test-campaign-123";
const NPC_ID = "npc-001";

// -- Mock DB helpers ----------------------------------------------------------

function createMockEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: NPC_ID,
    campaignId: CAMPAIGN_ID,
    name: "Greta the Merchant",
    tags: '["merchant","Poor"]',
    ...overrides,
  };
}

function setupMockDb(entity: Record<string, unknown> | null = createMockEntity()) {
  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    run: vi.fn(),
    get: vi.fn().mockReturnValue(entity),
  };

  (getDb as ReturnType<typeof vi.fn>).mockReturnValue(db);
  return db;
}

const execCtx = {
  toolCallId: "tc1",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

// -- Tier constant tests ------------------------------------------------------

describe("Tier constants", () => {
  it("WEALTH_TIERS contains ordered array from Destitute to Obscenely Rich", () => {
    expect(WEALTH_TIERS).toEqual([
      "Destitute",
      "Poor",
      "Comfortable",
      "Wealthy",
      "Obscenely Rich",
    ]);
  });

  it("SKILL_TIERS contains ordered array from Novice to Master", () => {
    expect(SKILL_TIERS).toEqual(["Novice", "Skilled", "Master"]);
  });

  it("RELATIONSHIP_TAGS contains descriptive labels array", () => {
    expect(RELATIONSHIP_TAGS).toEqual([
      "Trusted Ally",
      "Friendly",
      "Neutral",
      "Suspicious",
      "Hostile",
      "Sworn Enemy",
    ]);
  });
});

// -- upgrade_wealth tests -----------------------------------------------------

describe("upgrade_wealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces old wealth tier tag with new one (Poor -> Comfortable)", async () => {
    const mockDb = setupMockDb(createMockEntity({ tags: '["merchant","Poor"]' }));

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.upgrade_wealth.execute!(
      { entityName: "Greta the Merchant", entityType: "npc" as const, newTier: "Comfortable" as const },
      execCtx,
    );

    expect(result).toHaveProperty("updated", true);
    const setCall = mockDb.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const tagsStr = setCall?.tags as string;
    const tags = JSON.parse(tagsStr) as string[];
    expect(tags).toContain("Comfortable");
    expect(tags).not.toContain("Poor");
    expect(tags).toContain("merchant");
  });

  it("rejects downgrade (Wealthy -> Poor returns error)", async () => {
    setupMockDb(createMockEntity({ tags: '["merchant","Wealthy"]' }));

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.upgrade_wealth.execute!(
      { entityName: "Greta the Merchant", entityType: "npc" as const, newTier: "Poor" as const },
      execCtx,
    );

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/downgrade|one step/i);
  });

  it("rejects skip-level (Poor -> Wealthy returns error, must go Poor->Comfortable)", async () => {
    setupMockDb(createMockEntity({ tags: '["merchant","Poor"]' }));

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.upgrade_wealth.execute!(
      { entityName: "Greta the Merchant", entityType: "npc" as const, newTier: "Wealthy" as const },
      execCtx,
    );

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/one step/i);
  });

  it("allows setting Destitute or Poor as starting tier when no wealth tag exists", async () => {
    const mockDb = setupMockDb(createMockEntity({ tags: '["merchant"]' }));

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.upgrade_wealth.execute!(
      { entityName: "Greta the Merchant", entityType: "npc" as const, newTier: "Poor" as const },
      execCtx,
    );

    expect(result).toHaveProperty("updated", true);
    const setCall = mockDb.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const tagsStr = setCall?.tags as string;
    const tags = JSON.parse(tagsStr) as string[];
    expect(tags).toContain("Poor");
  });
});

// -- upgrade_skill tests ------------------------------------------------------

describe("upgrade_skill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces old skill tier tag with new one (Novice Swordsman -> Skilled Swordsman)", async () => {
    const mockDb = setupMockDb(
      createMockEntity({ tags: '["merchant","Novice Swordsman"]' }),
    );

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.upgrade_skill.execute!(
      {
        entityName: "Greta the Merchant",
        entityType: "npc" as const,
        skillName: "Swordsman",
        newTier: "Skilled" as const,
      },
      execCtx,
    );

    expect(result).toHaveProperty("updated", true);
    const setCall = mockDb.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const tagsStr = setCall?.tags as string;
    const tags = JSON.parse(tagsStr) as string[];
    expect(tags).toContain("Skilled Swordsman");
    expect(tags).not.toContain("Novice Swordsman");
  });

  it("rejects downgrade (Master Swordsman -> Novice Swordsman returns error)", async () => {
    setupMockDb(createMockEntity({ tags: '["merchant","Master Swordsman"]' }));

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.upgrade_skill.execute!(
      {
        entityName: "Greta the Merchant",
        entityType: "npc" as const,
        skillName: "Swordsman",
        newTier: "Novice" as const,
      },
      execCtx,
    );

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/downgrade|one step/i);
  });

  it("allows setting Novice as starting tier when no skill tag exists", async () => {
    const mockDb = setupMockDb(createMockEntity({ tags: '["merchant"]' }));

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.upgrade_skill.execute!(
      {
        entityName: "Greta the Merchant",
        entityType: "npc" as const,
        skillName: "Alchemy",
        newTier: "Novice" as const,
      },
      execCtx,
    );

    expect(result).toHaveProperty("updated", true);
    const setCall = mockDb.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const tagsStr = setCall?.tags as string;
    const tags = JSON.parse(tagsStr) as string[];
    expect(tags).toContain("Novice Alchemy");
  });
});
