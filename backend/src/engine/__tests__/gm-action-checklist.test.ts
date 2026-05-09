import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import {
  gmActionChecklistSchema,
  runGmActionChecklist,
  validateGmActionChecklistForFrame,
  type GmActionChecklist,
} from "../gm-action-checklist.js";
import { buildGmActionChecklistPromptContract } from "../prompt-contracts.js";
import type { GmRead } from "../gm-turn-read.js";
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
    playerAction: "Promise the road warden I will return before dusk.",
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
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: ["log_event", "set_relationship"],
    oracleContext: null,
    combatEnvelope: null,
    oracle: null,
    ...overrides,
  };
}

const gmRead: Extract<GmRead, { path: "tool_plan" }> = {
  version: "gm-read.v1",
  situationSummary: "The player makes a promise to a visible road warden.",
  sceneQuestion: "Does the promise become future-relevant?",
  focalActorRefs: ["Player", "Road Warden"],
  backgroundActorRefs: [],
  actionInterpretation: {
    intent: "promise to return before dusk",
    targetRefs: ["Road Warden"],
  },
  path: "tool_plan",
  turnIntent: "Record the promise as a future-relevant local commitment.",
  rationale: "The promise should affect later trust and travel.",
  evidenceRefs: ["Player", "Road Warden"],
  narrationGuardrails: ["Do not narrate offscreen observers."],
};

const validChecklist: GmActionChecklist = {
  version: "gm-action-checklist.v1",
  turnPath: "tool_plan",
  turnIntent: "Record the promise as future-relevant.",
  steps: [
    {
      stepId: "step-1",
      purpose: "Record the promise because the warden can hold the player to it later.",
      evidenceRefs: ["Player", "Road Warden"],
      dependsOnStepIds: [],
      expectedVisibleEffect: "The warden treats the promise as a real commitment.",
      requiredAction: "runtime_tool",
      status: "pending",
      candidateRefs: ["Player", "Road Warden"],
      candidateToolRequest: {
        toolName: "log_event",
        actorRef: "Player",
        targetRefs: [],
        input: {
          text: "The player promises the road warden to return before dusk.",
          importance: 6,
          participants: ["Player", "Road Warden"],
          durability: "durable",
          futureRelevance: "The promise should shape the warden's future trust.",
        },
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GM Action Checklist contract", () => {
  it("keeps the checklist as an explicit compact consequence plan, not a second GM", () => {
    const contract = buildGmActionChecklistPromptContract({
      allowedTools: ["log_event", "spawn_npc"],
    });

    expect(contract).toContain("not a second GM");
    expect(contract).toContain("normal native tool loops");
    expect(contract).toContain("Keep the same beat anchor from GM Read");
    expect(contract).toContain("Fewer steps are better");
    expect(contract).toContain("Do not fill all six steps by default");
  });

  it("accepts bounded tool and combat checklist shapes", () => {
    expect(gmActionChecklistSchema.parse(validChecklist)).toMatchObject({
      version: "gm-action-checklist.v1",
      turnPath: "tool_plan",
      steps: [expect.objectContaining({ stepId: "step-1", status: "pending" })],
    });

    expect(
      gmActionChecklistSchema.parse({
        version: "gm-action-checklist.v1",
        turnPath: "combat_transition",
        turnIntent: "Prepare a combat exchange.",
        steps: [
          {
            stepId: "step-1",
            purpose: "Frame the combat transition without applying damage yet.",
            evidenceRefs: ["Player", "Road Warden"],
            dependsOnStepIds: [],
            expectedVisibleEffect: "The scene enters combat posture.",
            requiredAction: "combat_transition",
            status: "pending",
            candidateRefs: ["Player", "Road Warden"],
          },
        ],
      }),
    ).toMatchObject({ turnPath: "combat_transition" });
  });

  it("rejects over-cap, non-sequential, forward-dependent, and invalid-action checklists", () => {
    expect(() =>
      gmActionChecklistSchema.parse({
        ...validChecklist,
        steps: Array.from({ length: 7 }, (_, index) => ({
          ...validChecklist.steps[0],
          stepId: `step-${Math.min(index + 1, 6)}`,
        })),
      }),
    ).toThrow();

    expect(() =>
      gmActionChecklistSchema.parse({
        ...validChecklist,
        steps: [{ ...validChecklist.steps[0], stepId: "step-2" }],
      }),
    ).toThrow(/sequential/);

    expect(() =>
      gmActionChecklistSchema.parse({
        ...validChecklist,
        steps: [
          { ...validChecklist.steps[0], dependsOnStepIds: ["step-2"] },
          {
            ...validChecklist.steps[0],
            stepId: "step-2",
            dependsOnStepIds: [],
          },
        ],
      }),
    ).toThrow(/earlier/);

    expect(() =>
      gmActionChecklistSchema.parse({
        ...validChecklist,
        steps: [
          {
            ...validChecklist.steps[0],
            candidateToolRequest: {
              toolName: "log_event",
              actorRef: "Player",
              targetRefs: [],
              input: { text: "Missing required fields." },
            },
          },
        ],
      }),
    ).toThrow(/runtime schema/);
  });

  it("rejects executable smuggling outside candidateToolRequest and backend-owned deltas", () => {
    expect(() =>
      gmActionChecklistSchema.parse({
        ...validChecklist,
        plannedActions: [],
      }),
    ).toThrow(/plannedActions/);

    expect(() =>
      gmActionChecklistSchema.parse({
        ...validChecklist,
        steps: [
          {
            ...validChecklist.steps[0],
            toolName: "log_event",
          },
        ],
      }),
    ).toThrow(/toolName/);

    expect(() =>
      gmActionChecklistSchema.parse({
        ...validChecklist,
        steps: [
          {
            ...validChecklist.steps[0],
            hpDelta: -1,
          },
        ],
      }),
    ).toThrow(/hpDelta/);

    expect(() =>
      gmActionChecklistSchema.parse({
        ...validChecklist,
        steps: [
          {
            ...validChecklist.steps[0],
            candidateToolRequest: {
              toolName: "log_event",
              payload: validChecklist.steps[0].candidateToolRequest?.input,
            },
          },
        ],
      }),
    ).toThrow(/payload/);
  });

  it("fails closed for hidden, background, invented refs, and tools outside frame.allowedTools", () => {
    expect(
      validateGmActionChecklistForFrame(
        gmActionChecklistSchema.parse({
          ...validChecklist,
          steps: [
            {
              ...validChecklist.steps[0],
              evidenceRefs: ["Hidden Watcher"],
              candidateRefs: ["Invented Bandit"],
            },
          ],
        }),
        createFrame(),
      ),
    ).toEqual([
      expect.objectContaining({ path: "steps.0.evidenceRefs.0" }),
      expect.objectContaining({ path: "steps.0.candidateRefs.0" }),
    ]);

    expect(
      validateGmActionChecklistForFrame(
        gmActionChecklistSchema.parse(validChecklist),
        createFrame({ allowedTools: ["set_relationship"] }),
      ),
    ).toEqual([
      expect.objectContaining({ path: "steps.0.candidateToolRequest.toolName" }),
    ]);
  });

  it("accepts Player as a stable checklist ref even when the live actor label is a character name", () => {
    expect(
      validateGmActionChecklistForFrame(
        gmActionChecklistSchema.parse({
          ...validChecklist,
          steps: [
            {
              ...validChecklist.steps[0],
              evidenceRefs: ["Player", "Road Warden"],
              candidateRefs: ["Player", "Road Warden"],
              candidateToolRequest: {
                ...validChecklist.steps[0].candidateToolRequest!,
                actorRef: "Player",
              },
            },
          ],
        }),
        createFrame({
          roster: {
            active: [
              {
                id: playerId,
                actorId: playerId,
                type: "player",
                label: "Mira Voss",
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
            background: [],
          },
          perception: {
            playerAwarenessHints: [],
            actorAwareness: {},
            forbiddenActorIds: [],
            forbiddenActorLabels: [],
          },
        }),
      ),
    ).toEqual([]);
  });

  it("runs with judge role, GM Read, candidate refs, allowed tools, forecast, and no private leakage", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validChecklist));

    const result = await runGmActionChecklist({
      provider,
      playerAction: "I promise to return before dusk.",
      frame: createFrame({
        recentEvents: [
          {
            id: "local-gate",
            tick: 4,
            summary: "The road warden waits at the gate.",
            source: "location_recent_event",
            actorIds: [playerId, npcId],
            perceivableByPlayer: true,
          },
          {
            id: "private-outpost",
            tick: 4,
            summary: "Hidden Watcher reports to Okutama Safe Zone - Forest Outpost.",
            source: "committed_event",
            actorIds: [hiddenNpcId],
            perceivableByPlayer: false,
          },
        ],
      }),
      gmRead,
      scopedForecastExcerpt: {
        version: "scoped-forecast-excerpt.v1",
        baseTick: 4,
        promptReady: true,
        entries: [],
        forbiddenPrivateTerms: ["Postal Cache"],
      },
      recentConversation: [
        {
          role: "assistant",
          content: "The Road Warden narrows his eyes.",
        },
        {
          role: "assistant",
          content: "Private forecast pressure: the Postal Cache is watched.",
        },
      ],
    });

    expect(result.steps).toHaveLength(1);
    expect(createModel).toHaveBeenCalledWith(provider, { role: "judge" });
    expect(safeGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: gmActionChecklistSchema,
        temperature: 0,
        retries: 1,
      }),
    );
    const prompt = vi.mocked(safeGenerateObject).mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: gm-action-checklist.v1");
    expect(prompt).toContain("PLAYER ACTION EPISTEMIC NOTES");
    expect(prompt).toContain("GM READ");
    expect(prompt).toContain("CANDIDATE REFS FROM MODEL-FACING VIEW ONLY");
    expect(prompt).toContain("ALLOWED TOOLS FROM frame.allowedTools");
    expect(prompt).toContain("candidateToolRequest is an untrusted suggestion");
    expect(prompt).toContain("Fewer steps are better");
    expect(prompt).toContain("Do not fill all six steps");
    expect(prompt).toContain("one backend action");
    expect(prompt).toContain("expectedVisibleEffect must be concrete");
    expect(prompt).toContain("Prefer reuse over creation");
    expect(prompt).toContain("Player agency remains locked");
    expect(prompt).toContain("Claimed possessions, authority, access");
    expect(prompt).toContain("must not put unconfirmed props into the player's hand");
    expect(prompt).toContain("Names can be private facts");
    expect(prompt).toContain("the named authority from the player's claim");
    expect(prompt).toContain("An Oracle hit on a claim is not proof");
    expect(prompt).toContain("Do not convert a failed or unconfirmed access claim into success");
    expect(prompt).toContain("Dynamic local staging kit");
    expect(prompt).toContain("Reuse an existing suitable local scene affordance before creating another");
    expect(prompt).toContain("support NPC");
    expect(prompt).toContain("promote_npc");
    expect(prompt).toContain("temporary props/items are out of scope");
    expect(prompt).toContain("The Road Warden narrows his eyes.");
    expect(prompt).not.toContain("Forest Outpost");
    expect(prompt).not.toContain("Postal Cache");
    expect(prompt).not.toContain("Hidden Watcher");
  });

  it("does not let checklist planning turn an unconfirmed access claim into proof or access", () => {
    const playerAction =
      "I claim I already have the master key to every signal-house door and try to unlock the nearest sealed office.";
    const frame = createFrame({ allowedTools: ["log_event", "spawn_item"] });

    expect(
      validateGmActionChecklistForFrame(
        gmActionChecklistSchema.parse({
          ...validChecklist,
          steps: [
            {
              stepId: "step-1",
              purpose: "Create the master key because the Oracle hit makes it real.",
              evidenceRefs: ["Player", "Road Warden"],
              dependsOnStepIds: [],
              expectedVisibleEffect: "The key is in the player's hand.",
              requiredAction: "runtime_tool",
              status: "pending",
              candidateRefs: ["Player", "Road Warden"],
              candidateToolRequest: {
                toolName: "spawn_item",
                actorRef: "Player",
                targetRefs: [],
                input: {
                  name: "Signal-House Master Key",
                  tags: ["key", "master-access"],
                  ownerName: "Player",
                  ownerType: "character",
                },
              },
            },
          ],
        }),
        frame,
        playerAction,
      ),
    ).toEqual([
      expect.objectContaining({
        path: "steps.0.candidateToolRequest.toolName",
        message: expect.stringContaining("unconfirmed access proof claims cannot be planned"),
      }),
    ]);

    expect(
      validateGmActionChecklistForFrame(
        gmActionChecklistSchema.parse({
          ...validChecklist,
          steps: [
            {
              stepId: "step-1",
              purpose: "Ask whether the warden believes the bluff.",
              evidenceRefs: ["Player", "Road Warden"],
              dependsOnStepIds: [],
              expectedVisibleEffect: "The warden may hesitate, demand proof, or raise suspicion.",
              requiredAction: "oracle",
              status: "pending",
              candidateRefs: ["Player", "Road Warden"],
            },
          ],
        }),
        frame,
        playerAction,
      ),
    ).toEqual([]);

    expect(
      validateGmActionChecklistForFrame(
        gmActionChecklistSchema.parse({
          ...validChecklist,
          steps: [
            {
              stepId: "step-1",
              purpose: "Ask whether the claimed master key exists and fits the lock.",
              evidenceRefs: ["Player", "Road Warden"],
              dependsOnStepIds: [],
              expectedVisibleEffect: "The door opened and the player is inside.",
              requiredAction: "oracle",
              status: "pending",
              candidateRefs: ["Player", "Road Warden"],
            },
          ],
        }),
        frame,
        playerAction,
      ),
    ).toEqual([
      expect.objectContaining({
        path: "steps.0.requiredAction",
        message: expect.stringContaining("cannot use checklist Oracle steps"),
      }),
    ]);
  });
});
