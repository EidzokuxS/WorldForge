import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import {
  gmTurnDecisionSchema,
  runGmTurnDecision,
  validateGmTurnDecisionForFrame,
  type GmTurnDecision,
} from "../gm-turn-decision.js";
import type { SceneFrame } from "../scene-frame.js";

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn(() => ({ modelId: "judge-test-model" })),
}));

const playerId = "11111111-1111-4111-8111-111111111111";
const npcId = "22222222-2222-4222-8222-222222222222";
const hiddenNpcId = "77777777-7777-4777-8777-777777777777";

const provider: ProviderConfig = {
  id: "test-provider",
  name: "Test Provider",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "test-key",
  model: "judge-model",
};

function safeResult<T>(object: T) {
  return {
    object,
    trace: {
      text: JSON.stringify(object),
      cleanedText: JSON.stringify(object),
    },
  };
}

function createFrame(overrides: Partial<SceneFrame> = {}): SceneFrame {
  return {
    campaignId: "campaign-1",
    tick: 4,
    playerActorId: playerId,
    currentLocationId: "99999999-9999-4999-8999-999999999999",
    currentSceneScopeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    playerAction: "Ask the road warden what happened.",
    roster: {
      active: [
        {
          id: playerId,
          actorId: playerId,
          type: "player",
          label: "Player",
          locationId: "99999999-9999-4999-8999-999999999999",
          sceneScopeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          awareness: "clear",
        },
        {
          id: npcId,
          actorId: npcId,
          type: "npc",
          label: "Road Warden",
          locationId: "99999999-9999-4999-8999-999999999999",
          sceneScopeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          awareness: "clear",
        },
      ],
      support: [],
      background: [
        {
          id: hiddenNpcId,
          actorId: hiddenNpcId,
          type: "npc",
          label: "Hidden Watcher",
          locationId: "99999999-9999-4999-8999-999999999999",
          sceneScopeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          awareness: "none",
        },
      ],
    },
    perception: {
      playerAwarenessHints: [],
      actorAwareness: {},
      forbiddenActorIds: [hiddenNpcId],
      forbiddenActorLabels: ["Hidden Watcher"],
    },
    recentEvents: [],
    targetCandidates: [
      {
        id: npcId,
        actorId: npcId,
        type: "actor",
        label: "Road Warden",
        awareness: "clear",
      },
    ],
    movementCandidates: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        locationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        label: "Old Shrine Road",
        connected: true,
      },
    ],
    deferredHooks: [],
    allowedTools: ["log_event", "move_to", "set_condition"],
    oracleContext: null,
    combatEnvelope: null,
    oracle: null,
    ...overrides,
  };
}

const validDecisions: GmTurnDecision[] = [
  {
    path: "direct",
    directResolutionNotes: "Answer the greeting without a roll.",
    evidenceRefs: ["Player"],
  },
  {
    path: "roll_oracle",
    rollRequest: {
      actorRef: "Player",
      targetRef: "Road Warden",
      question: "Does the warden believe the bluff?",
      stakes: "Trust opens or closes the gate.",
      evidenceRefs: ["Player", "Road Warden"],
    },
    evidenceRefs: ["Player", "Road Warden"],
  },
  {
    path: "tool_plan",
    plannedTools: [
      {
        toolName: "log_event",
        actorRef: "Player",
        targetRefs: [],
        input: {
          text: "The player asks about the road.",
          importance: 2,
          participants: ["Player"],
        },
        evidenceRefs: ["Player"],
      },
    ],
    evidenceRefs: ["Player"],
  },
  {
    path: "combat_transition",
    actorRef: "Player",
    targetRef: "Road Warden",
    combatFraming: "The player commits to an attack.",
    stakes: "Whether the warden can answer before harm lands.",
    evidenceRefs: ["Player", "Road Warden"],
  },
  {
    path: "clarification",
    clarificationPrompt: "Which door are you opening?",
    evidenceRefs: ["Old Shrine Road"],
  },
  {
    path: "continue",
    continuationGuidance: "Let the scene breathe without inventing a player action.",
    evidenceRefs: ["Player"],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GM turn decision contract", () => {
  it("defines exactly every GM-owned first-turn path", () => {
    expect(validDecisions.map((example) => gmTurnDecisionSchema.parse(example).path)).toEqual([
      "direct",
      "roll_oracle",
      "tool_plan",
      "combat_transition",
      "clarification",
      "continue",
    ]);

    expect(() =>
      gmTurnDecisionSchema.parse({
        path: "backend_inferred_attack",
        targetRef: "Road Warden",
      }),
    ).toThrow();
  });

  it("requires path-specific fields and rejects backend-owned state deltas", () => {
    expect(() =>
      gmTurnDecisionSchema.parse({
        path: "direct",
        narrationIntent: "old field",
      }),
    ).toThrow();

    expect(() =>
      gmTurnDecisionSchema.parse({
        path: "continue",
        actionCategory: "observe",
        continuationGuidance: "Let the scene breathe.",
      }),
    ).toThrow();

    expect(() =>
      gmTurnDecisionSchema.parse({
        path: "clarification",
        evidenceRefs: ["Player"],
      }),
    ).toThrow();

    expect(() =>
      gmTurnDecisionSchema.parse({
        path: "direct",
        directResolutionNotes: "He looks wounded.",
        hpDelta: -1,
        evidenceRefs: ["Player"],
      }),
    ).toThrow();
  });

  it("normalizes direct near-miss output without accepting backend-owned semantics", () => {
    const parsed = gmTurnDecisionSchema.parse({
      path: "tool_plan",
      rationale:
        "Tiamat is expressing sensory observations and desires in Shibuya; no mechanical resolution is needed.",
      evidenceRefs: ["Player", "Shibuya Station"],
      directResolutionNotes:
        "Let the next beat follow the smell of pancakes without mutating state.",
      narrationGuidance:
        "Keep the narration sensory and local.",
    });

    expect(parsed).toMatchObject({
      path: "direct",
      directResolutionNotes:
        "Let the next beat follow the smell of pancakes without mutating state.",
      narrationGuidance: "Keep the narration sensory and local.",
      evidenceRefs: ["Player", "Shibuya Station"],
    });

    expect(() =>
      gmTurnDecisionSchema.parse({
        path: "tool_plan",
        rationale: "Use a hidden backend action.",
        evidenceRefs: ["Player"],
        directResolutionNotes: "Do a thing.",
        hpDelta: -1,
      }),
    ).toThrow(/hpDelta/);
  });

  it("makes roll_oracle the only path that can request backend randomness or Oracle", () => {
    expect(gmTurnDecisionSchema.parse(validDecisions[1]).path).toBe("roll_oracle");

    expect(() =>
      gmTurnDecisionSchema.parse({
        path: "tool_plan",
        rollRequest: {
          actorRef: "Player",
          question: "Does it work?",
          stakes: "Unclear outcome.",
          evidenceRefs: ["Player"],
        },
        plannedTools: validDecisions[2].path === "tool_plan"
          ? validDecisions[2].plannedTools
          : [],
        evidenceRefs: ["Player"],
      }),
    ).toThrow();

    expect(() =>
      gmTurnDecisionSchema.parse({
        path: "combat_transition",
        actorRef: "Player",
        targetRef: "Road Warden",
        combatFraming: "They fight.",
        stakes: "Who lands first.",
        rollRequest: {
          actorRef: "Player",
          question: "Who wins?",
          stakes: "Combat.",
          evidenceRefs: ["Player", "Road Warden"],
        },
        evidenceRefs: ["Player", "Road Warden"],
      }),
    ).toThrow();
  });

  it("fails closed for unsupported tools, invented refs, missing required targets, and over-cap text", () => {
    expect(() =>
      gmTurnDecisionSchema.parse({
        path: "tool_plan",
        plannedTools: [
          {
            toolName: "search_environment",
            actorRef: "Player",
            targetRefs: [],
            input: {},
            evidenceRefs: ["Player"],
          },
        ],
        evidenceRefs: ["Player"],
      }),
    ).toThrow();

    expect(
      validateGmTurnDecisionForFrame(
        {
          path: "combat_transition",
          actorRef: "Player",
          targetRef: "Invented Bandit",
          combatFraming: "The player attacks.",
          stakes: "Combat starts.",
          evidenceRefs: ["Player"],
        },
        createFrame(),
      ),
    ).toEqual([
      expect.objectContaining({
        path: "targetRef.0",
      }),
    ]);

    expect(
      validateGmTurnDecisionForFrame(
        {
          path: "tool_plan",
          plannedTools: [
            {
              toolName: "move_to",
              actorRef: "Player",
              targetRefs: [],
              input: { targetLocationName: "Old Shrine Road" },
              evidenceRefs: ["Player"],
            },
          ],
          evidenceRefs: ["Player"],
        },
        createFrame(),
      ),
    ).toEqual([
      expect.objectContaining({
        path: "plannedTools.0.targetRefs",
      }),
    ]);

    expect(() =>
      gmTurnDecisionSchema.parse({
        path: "direct",
        directResolutionNotes: "x".repeat(1001),
        evidenceRefs: ["Player"],
      }),
    ).toThrow();
  });

  it("runs with judge role, temperature zero, one retry, raw player text, neutral SceneFrame, candidates, and allowed tools", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validDecisions[0]));

    const result = await runGmTurnDecision({
      provider,
      playerAction: "I just say hello.",
      frame: createFrame(),
    });

    expect(result).toMatchObject({ path: "direct" });
    expect(createModel).toHaveBeenCalledWith(provider, { role: "judge" });
    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
    expect(safeGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: gmTurnDecisionSchema,
        temperature: 0,
        retries: 1,
      }),
    );
    const firstCall = vi.mocked(safeGenerateObject).mock.calls[0]?.[0];
    expect(firstCall?.system).toContain("raw playerAction text");
    expect(firstCall?.system).toContain("Do not require Act/Speak/Observe");
    expect(firstCall?.prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: gm-turn-decision.v1");
    expect(firstCall?.prompt).toContain("PLAYER ACTION RAW TEXT");
    expect(firstCall?.prompt).toContain("I just say hello.");
    expect(firstCall?.prompt).toContain("MODEL-FACING SCENE VIEW");
    expect(firstCall?.prompt).toContain("CANDIDATE REFS FROM MODEL-FACING VIEW ONLY");
    expect(firstCall?.prompt).toContain("ALLOWED TOOLS FROM frame.allowedTools");
    expect(firstCall?.prompt).toContain("backend owns IDs, validation, allowed tools, deterministic math, random rolls, persistence, rollback, and final truth");
    expect(firstCall?.prompt).toContain("roll_oracle is the only path");
  });

  it("does not leak background actors, forbidden fields, or offscreen Forest Outpost text into the prompt", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validDecisions[0]));

    await runGmTurnDecision({
      provider,
      playerAction: "I ask the cafe clerk for the price.",
      frame: createFrame({
        currentLocationId: "loc-shibuya-district",
        currentSceneScopeId: "scene-shibuya-cafe",
        roster: {
          active: [
            {
              id: playerId,
              actorId: playerId,
              type: "player",
              label: "Player",
              locationId: "loc-shibuya-district",
              sceneScopeId: "scene-shibuya-cafe",
              awareness: "clear",
            },
            {
              id: npcId,
              actorId: npcId,
              type: "npc",
              label: "Cafe Clerk",
              locationId: "loc-shibuya-district",
              sceneScopeId: "scene-shibuya-cafe",
              awareness: "clear",
            },
          ],
          support: [],
          background: [
            {
              id: hiddenNpcId,
              actorId: hiddenNpcId,
              type: "npc",
              label: "Outpost Cook",
              locationId: "loc-okutama-safe-zone",
              sceneScopeId: "scene-forest-outpost",
              awareness: "none",
            },
          ],
        },
        perception: {
          playerAwarenessHints: [],
          actorAwareness: {},
          forbiddenActorIds: [hiddenNpcId],
          forbiddenActorLabels: ["Outpost Cook"],
        },
        recentEvents: [
          {
            id: "local-cafe-bell",
            tick: 78,
            summary: "The Shibuya cafe bell rings as the clerk waits.",
            source: "location_recent_event",
            actorIds: [playerId, npcId],
            perceivableByPlayer: true,
          },
          {
            id: "private-outpost-beat",
            tick: 78,
            summary: "Outpost Cook waits at Okutama Safe Zone - Forest Outpost.",
            source: "committed_event",
            actorIds: [hiddenNpcId],
            perceivableByPlayer: false,
          },
        ],
        targetCandidates: [
          {
            id: `actor:${npcId}`,
            actorId: npcId,
            type: "actor",
            label: "Cafe Clerk",
            awareness: "clear",
          },
        ],
        allowedTools: ["log_event", "spawn_npc"],
      }),
      recentConversation: [
        {
          role: "assistant",
          content: "Earlier background beat: Outpost Cook stayed at Forest Outpost.",
        },
      ],
    });

    const prompt = vi.mocked(safeGenerateObject).mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("Shibuya");
    expect(prompt).toContain("Cafe Clerk");
    expect(prompt).toContain("hiddenActorCount");
    expect(prompt).not.toContain("Forest Outpost");
    expect(prompt).not.toContain("Okutama Safe Zone");
    expect(prompt).not.toContain("Outpost Cook");
    expect(prompt).not.toContain(hiddenNpcId);
    expect(prompt).not.toContain("forbiddenActorLabels");
    expect(prompt).not.toContain("roster.background");
  });

  it("drops recent conversation entries that contain private forecast terms", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validDecisions[0]));

    await runGmTurnDecision({
      provider,
      playerAction: "I ask the cafe clerk for another cup.",
      frame: createFrame({
        currentLocationId: "loc-shibuya-district",
        currentSceneScopeId: "scene-shibuya-cafe",
        roster: {
          active: [
            {
              id: playerId,
              actorId: playerId,
              type: "player",
              label: "Player",
              locationId: "loc-shibuya-district",
              sceneScopeId: "scene-shibuya-cafe",
              awareness: "clear",
            },
            {
              id: npcId,
              actorId: npcId,
              type: "npc",
              label: "Cafe Clerk",
              locationId: "loc-shibuya-district",
              sceneScopeId: "scene-shibuya-cafe",
              awareness: "clear",
            },
          ],
          support: [],
          background: [],
        },
        perception: {
          playerAwarenessHints: [],
          actorAwareness: {},
          forbiddenActorIds: [],
          forbiddenActorLabels: [],
        },
        targetCandidates: [
          {
            id: `actor:${npcId}`,
            actorId: npcId,
            type: "actor",
            label: "Cafe Clerk",
            awareness: "clear",
          },
        ],
      }),
      scopedForecastExcerpt: {
        version: "scoped-forecast-excerpt.v1",
        baseTick: 78,
        promptReady: true,
        entries: [],
        forbiddenPrivateTerms: ["Postal Cache"],
      },
      recentConversation: [
        {
          role: "assistant",
          content: "The Cafe Clerk puts a ceramic cup on the counter.",
        },
        {
          role: "assistant",
          content: "Private forecast pressure: the Postal Cache is being watched.",
        },
      ],
    });

    const prompt = vi.mocked(safeGenerateObject).mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("The Cafe Clerk puts a ceramic cup on the counter.");
    expect(prompt).not.toContain("Postal Cache");
  });

  it("rejects model output that references hidden/background refs or tools outside frame.allowedTools", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult({
        path: "tool_plan",
        plannedTools: [
          {
            toolName: "set_condition",
            actorRef: "Hidden Watcher",
            targetRefs: ["Road Warden"],
            input: { targetName: "Road Warden", delta: -1 },
            evidenceRefs: ["Hidden Watcher"],
          },
        ],
        evidenceRefs: ["Hidden Watcher"],
      }),
    );

    await expect(
      runGmTurnDecision({
        provider,
        playerAction: "Hit the watcher.",
        frame: createFrame({ allowedTools: ["log_event"] }),
      }),
    ).rejects.toThrow(/GmTurnDecision validation failed/);
  });
});
