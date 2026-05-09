import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import { buildPlayerActionEpistemicNotes } from "../player-action-epistemics.js";
import { buildGmReadPromptContract } from "../prompt-contracts.js";
import {
  GM_READ_GUARDRAIL_MAX,
  GM_READ_GUARDRAIL_TEXT_MAX,
  GM_READ_SCENE_QUESTION_MAX,
  GM_READ_SITUATION_SUMMARY_MAX,
  gmReadSchema,
  runGmRead,
  validateGmReadForFrame,
  type GmRead,
} from "../gm-turn-read.js";
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

const baseRead = {
  version: "gm-read.v1",
  situationSummary: "The player asks a visible road warden a direct question.",
  sceneQuestion: "What does the warden reveal?",
  focalActorRefs: ["Player", "Road Warden"],
  backgroundActorRefs: [],
  actionInterpretation: {
    intent: "ask about recent trouble",
    targetRefs: ["Road Warden"],
  },
  rationale: "The action is local and can be answered from visible scene facts.",
  evidenceRefs: ["Player", "Road Warden"],
  narrationGuardrails: ["Keep the answer local to the gate."],
} satisfies Omit<GmRead, "path">;

const validReads: GmRead[] = [
  {
    ...baseRead,
    path: "direct",
    directResolutionNotes: "Answer the question without mutation.",
  },
  {
    ...baseRead,
    path: "roll_oracle",
    rollRequest: {
      actorRef: "Player",
      targetRef: "Road Warden",
      question: "Does the warden believe the bluff?",
      stakes: "Trust opens or closes the gate.",
      evidenceRefs: ["Player", "Road Warden"],
    },
  },
  {
    ...baseRead,
    path: "tool_plan",
    turnIntent: "Record a durable promise if the warden agrees.",
  },
  {
    ...baseRead,
    path: "combat_transition",
    actorRef: "Player",
    targetRef: "Road Warden",
    combatFraming: "The player commits to an attack.",
    stakes: "Whether the warden can answer before harm lands.",
  },
  {
    ...baseRead,
    path: "clarification",
    clarificationPrompt: "Which door are you opening?",
  },
  {
    ...baseRead,
    path: "continue",
    continuationGuidance: "Let the scene breathe without inventing a player action.",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GM Read contract", () => {
  it("states the GM job as one playable beat with NPC knowledge bounds", () => {
    const contract = buildGmReadPromptContract({
      allowedTools: ["log_event", "spawn_npc", "reveal_location"],
    });

    expect(contract).toContain("One beat anchor");
    expect(contract).toContain("lightest path");
    expect(contract).toContain("NPC knowledge bounds");
    expect(contract).toContain("The world is not waiting for the player");
    expect(contract).toContain("Passive, tourist, waiting, travel, shopping");
    expect(contract).toContain("Do not smuggle support presence through direct");
    expect(contract).toContain("vendor, clerk, porter, witness");
    expect(contract).toContain("Keep passive-pressure modest and world-agnostic");
    expect(contract).toContain("Translate them into local observable signals");
    expect(contract).toContain("Unlisted claimed objects, doors, offices, routes");
    expect(contract).toContain("omit rollRequest.targetRef unless it is an exact listed candidate");
    expect(contract).toContain("future-relevant concrete pressure");
    expect(contract).toContain("Before returning direct, continue, or clarification");
    expect(contract).toContain("Path choice is the GM's job");
    expect(contract).toContain("Backend validates and may reject");
    expect(contract).toContain("Use roll_oracle for uncertain visible reactions");
    expect(contract).toContain("routes/doors/stairs");
    expect(contract).toContain("Resolve obvious recent-context references");
    expect(contract).toContain("that rumor");
    expect(contract).toContain("localRecentEvents");
    expect(contract).toContain("the slower route");
    expect(contract).toContain("generic public role");
    expect(contract).toContain("vendor");
    expect(contract).toContain("use clarification only when the requested role cannot plausibly exist");
    expect(contract).toContain("Public/commercial/institutional scenes should not stall");
    expect(contract).toContain("ordinary service worker is usually a plausible support NPC");
    expect(contract).toContain("Combat pressure is broader than explicit attack verbs");
    expect(contract).toContain("defensive posture");
    expect(contract).toContain("power-gap questions");
    expect(contract).toContain("Do not include concrete tool payloads");
    expect(contract).not.toContain("plannedActions shape");
  });

  it("defines every GM-owned turn path without requiring concrete tool payloads", () => {
    expect(validReads.map((example) => gmReadSchema.parse(example).path)).toEqual([
      "direct",
      "roll_oracle",
      "tool_plan",
      "combat_transition",
      "clarification",
      "continue",
    ]);

    expect(gmReadSchema.parse(validReads[2])).toMatchObject({
      path: "tool_plan",
      turnIntent: "Record a durable promise if the warden agrees.",
    });

    expect(() =>
      gmReadSchema.parse({
        ...baseRead,
        path: "backend_inferred_attack",
      }),
    ).toThrow();
  });

  it("accepts detailed advisory text without clipping the GM Read intent", () => {
    const situationSummary = "summary ".repeat(70).trim();
    const sceneQuestion = "question ".repeat(35).trim();
    const narrationGuardrails = Array.from({ length: GM_READ_GUARDRAIL_MAX }, (_, index) =>
      `Guardrail ${index + 1}: ${"keep the beat anchored in visible pressure ".repeat(8)}`.trim(),
    );
    const parsed = gmReadSchema.parse({
      ...baseRead,
      path: "direct",
      situationSummary,
      sceneQuestion,
      actionInterpretation: {
        intent: "ask about recent trouble",
        targetRefs: ["Road Warden"],
      },
      narrationGuardrails,
      directResolutionNotes: "Answer from visible facts without changing state.",
    });

    expect(parsed.situationSummary.length).toBeLessThanOrEqual(GM_READ_SITUATION_SUMMARY_MAX);
    expect(parsed.situationSummary).toBe(situationSummary);
    expect(parsed.sceneQuestion.length).toBeLessThanOrEqual(GM_READ_SCENE_QUESTION_MAX);
    expect(parsed.sceneQuestion).toBe(sceneQuestion);
    expect(parsed.narrationGuardrails).toHaveLength(GM_READ_GUARDRAIL_MAX);
    expect(
      parsed.narrationGuardrails.every((text) => text.length <= GM_READ_GUARDRAIL_TEXT_MAX),
    ).toBe(true);
    expect(parsed.narrationGuardrails).toEqual(narrationGuardrails);
    expect(parsed.path).toBe("direct");
    if (parsed.path !== "direct") throw new Error("Expected direct GM Read path");
    expect(parsed.directResolutionNotes).toBe("Answer from visible facts without changing state.");
  });

  it("accepts typed aliases for known current location and actor refs", () => {
    const frame = createFrame();
    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "direct",
          focalActorRefs: [`actor:${playerId}`, `actor:${npcId}`],
          actionInterpretation: {
            intent: "try the local vault door",
            targetRefs: [`location:${frame.currentLocationId}`],
          },
          evidenceRefs: [`actor:${playerId}`, `location:${frame.currentLocationId}`],
          directResolutionNotes: "The current place is known, but the vault claim is not.",
        }),
        frame,
      ),
    ).toEqual([]);
  });

  it("accepts Player as a stable alias even when the live actor label is a character name", () => {
    const frame = createFrame({
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
    });

    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "direct",
          focalActorRefs: ["Player", "Road Warden"],
          actionInterpretation: {
            intent: "ask who controls the passage",
            targetRefs: ["Road Warden"],
          },
          evidenceRefs: ["Player", "Road Warden"],
          directResolutionNotes: "Answer from visible local actors.",
        }),
        frame,
      ),
    ).toEqual([]);
  });

  it("rejects no-mutation GM Read paths that introduce future-relevant concrete pressure", () => {
    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "direct",
          sceneQuestion: "Do the raised voices become an inspection dispute?",
          directResolutionNotes:
            "Raised voices become an inspection dispute as a dockworker with a clipboard changes the crate count.",
        }),
        createFrame(),
      ),
    ).toEqual([
      expect.objectContaining({
        path: "sceneQuestion",
        message: expect.stringContaining("future-relevant-pressure-requires-tool-path"),
      }),
      expect.objectContaining({
        path: "directResolutionNotes",
        message: expect.stringContaining("future-relevant-pressure-requires-tool-path"),
      }),
    ]);

    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "continue",
          continuationGuidance:
            "A recessed maintenance-like door opens onto a narrow stair that should guide the next route.",
        }),
        createFrame(),
      ),
    ).toEqual([
      expect.objectContaining({
        path: "continuationGuidance",
        message: expect.stringContaining("future-relevant-pressure-requires-tool-path"),
      }),
    ]);
  });

  it("allows no-mutation GM Read paths for local sensory color without durable pressure", () => {
    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "direct",
          sceneQuestion: "What does the warden answer?",
          directResolutionNotes:
            "Answer from the visible warden. Cold rain beads on the awning; no new actor, route, prop, or lasting commitment is established.",
          narrationGuardrails: ["Keep the answer local and do not persist a world fact."],
        }),
        createFrame(),
      ),
    ).toEqual([]);
  });

  it("rejects planned tools, nested tool calls, and backend-owned state deltas", () => {
    expect(() =>
      gmReadSchema.parse({
        ...baseRead,
        path: "tool_plan",
        turnIntent: "Persist a promise.",
        plannedTools: [
          {
            toolName: "log_event",
            input: { text: "The player promises to return.", importance: 6 },
          },
        ],
      }),
    ).toThrow(/plannedTools/);

    expect(() =>
      gmReadSchema.parse({
        ...baseRead,
        path: "direct",
        directResolutionNotes: "He looks wounded.",
        hpDelta: -1,
      }),
    ).toThrow(/hpDelta/);

    expect(() =>
      gmReadSchema.parse({
        ...baseRead,
        path: "direct",
        directResolutionNotes: "Do a backend action.",
        hiddenPlan: {
          toolName: "set_condition",
          input: { targetName: "Road Warden", delta: -1 },
        },
      }),
    ).toThrow(/runtime tool calls|toolName|input/);
  });

  it("fails closed for hidden, background, and invented refs", () => {
    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "direct",
          directResolutionNotes: "Answer.",
          focalActorRefs: ["Player", "Hidden Watcher"],
          evidenceRefs: ["Hidden Watcher"],
        }),
        createFrame(),
      ),
    ).toEqual([
      expect.objectContaining({ path: "focalActorRefs.1" }),
      expect.objectContaining({ path: "evidenceRefs.0" }),
    ]);

    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "combat_transition",
          actorRef: "Player",
          targetRef: "Invented Bandit",
          combatFraming: "The player attacks.",
          stakes: "Combat starts.",
        }),
        createFrame(),
      ),
    ).toEqual([expect.objectContaining({ path: "targetRef.0" })]);
  });

  it("runs with judge role, temperature zero, one retry, raw player text, neutral scene, candidates, forecast, and allowed tools", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validReads[0]));

    const result = await runGmRead({
      provider,
      playerAction: "I just say hello.",
      frame: createFrame(),
      scopedForecastExcerpt: {
        version: "scoped-forecast-excerpt.v1",
        baseTick: 4,
        promptReady: true,
        entries: [
          {
            entryId: "forecast-1",
            horizonTicks: 2,
            subjectRefs: [{ type: "actor", id: npcId, label: "Road Warden" }],
            confidence: 0.7,
            pressure: "medium",
            preconditions: ["The warden is likely to ask why the player is traveling."],
          },
        ],
        forbiddenPrivateTerms: [],
      },
    });

    expect(result).toMatchObject({ path: "direct" });
    expect(createModel).toHaveBeenCalledWith(provider, { role: "judge" });
    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
    expect(safeGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: gmReadSchema,
        temperature: 0,
        retries: 1,
      }),
    );
    const firstCall = vi.mocked(safeGenerateObject).mock.calls[0]?.[0];
    expect(firstCall?.system).toContain("raw playerAction");
    expect(firstCall?.system).toContain("do not create concrete tool payloads");
    expect(firstCall?.prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: gm-read.v1");
    expect(firstCall?.prompt).toContain("PLAYER ACTION RAW TEXT");
    expect(firstCall?.prompt).toContain("I just say hello.");
    expect(firstCall?.prompt).toContain("PLAYER ACTION EPISTEMIC NOTES");
    expect(firstCall?.prompt).toContain("MODEL-FACING SCENE VIEW");
    expect(firstCall?.prompt).toContain("CANDIDATE REFS FROM MODEL-FACING VIEW ONLY");
    expect(firstCall?.prompt).toContain('"preferredRef": "Player"');
    expect(firstCall?.prompt).toContain('"preferredRef": "Road Warden"');
    expect(firstCall?.prompt).toContain('"usableRefs"');
    expect(firstCall?.prompt).toContain("REFERENCE SELECTION RULES");
    expect(firstCall?.prompt).toContain("For the player, use Player");
    expect(firstCall?.prompt).toContain("ALLOWED TOOLS FROM frame.allowedTools");
    expect(firstCall?.prompt).toContain("SCOPED FORECAST EXCERPT ONLY");
    expect(firstCall?.prompt).toContain("The warden is likely to ask");
    expect(firstCall?.prompt).toContain("Do not include concrete tool payloads");
    expect(firstCall?.prompt).toContain("next playable beat");
    expect(firstCall?.prompt).toContain("Use direct for normal conversation");
    expect(firstCall?.prompt).toContain("Use tool_plan only when world state must actually change");
    expect(firstCall?.prompt).toContain("Before choosing direct for a passive/tourist action");
    expect(firstCall?.prompt).toContain("Do not smuggle support presence through direct");
    expect(firstCall?.prompt).toContain("Player agency is locked");
    expect(firstCall?.prompt).toContain("Treat claimed possessions, authority, access");
    expect(firstCall?.prompt).toContain("do not ask Oracle whether the proof exists");
    expect(firstCall?.prompt).toContain("Do not rescue a false or unconfirmed access claim");
    expect(firstCall?.prompt).toContain("NPCs are autonomous actors");
    expect(firstCall?.prompt).toContain("Before returning direct, continue, or clarification");
    expect(firstCall?.prompt).toContain("Path choice is the GM's job");
    expect(firstCall?.prompt).not.toContain('"plannedTools":');
    expect(firstCall?.prompt).not.toContain('"input":');
  });

  it("does not leak background actors, forbidden fields, or offscreen Forest Outpost text into the prompt", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult({
        ...validReads[0],
        focalActorRefs: ["Player", "Cafe Clerk"],
        actionInterpretation: {
          intent: "ask for the price",
          targetRefs: ["Cafe Clerk"],
        },
        evidenceRefs: ["Player", "Cafe Clerk"],
      }),
    );

    await runGmRead({
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

  it("carries a player-visible recent claim even when its support NPC participant is no longer clear-visible", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult({
        ...validReads[0],
        situationSummary: "The player follows up on the ledger claim they just planted.",
        sceneQuestion: "How does the local scene answer the follow-up?",
        focalActorRefs: ["Player"],
        actionInterpretation: {
          intent: "ask about the planted ledger rumor",
          targetRefs: [],
        },
        evidenceRefs: ["Player"],
        directResolutionNotes:
          "Use the visible recent event to resolve the ledger-rumor referent without inventing a new source.",
      }),
    );

    await runGmRead({
      provider,
      playerAction: "I ask what happened with that ledger rumor.",
      frame: createFrame({
        currentLocationId: "loc-lowwater-bazaar",
        currentSceneScopeId: "scene-signal-counter",
        roster: {
          active: [
            {
              id: playerId,
              actorId: playerId,
              type: "player",
              label: "Mira Voss",
              locationId: "loc-lowwater-bazaar",
              sceneScopeId: "scene-signal-counter",
              awareness: "clear",
            },
          ],
          support: [],
          background: [
            {
              id: hiddenNpcId,
              actorId: hiddenNpcId,
              type: "npc",
              label: "Signal Desk Clerk",
              locationId: "loc-lowwater-bazaar",
              sceneScopeId: "scene-signal-counter",
              awareness: "none",
            },
          ],
        },
        perception: {
          playerAwarenessHints: [],
          actorAwareness: {},
          forbiddenActorIds: [hiddenNpcId],
          forbiddenActorLabels: ["Signal Desk Clerk"],
        },
        recentEvents: [
          {
            id: "ledger-rumor",
            tick: 79,
            summary:
              "Mira approached a signal desk clerk at Lowwater Bazaar and planted a claim: \"Tower Three's western ledger is missing pages.\"",
            source: "committed_event",
            actorIds: ["Mira Voss", "Signal Desk Clerk"],
            perceivableByPlayer: true,
          },
        ],
        targetCandidates: [],
      }),
    });

    const prompt = vi.mocked(safeGenerateObject).mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("localRecentEvents");
    expect(prompt).toContain("Tower Three's western ledger is missing pages");
    expect(prompt).not.toContain("Signal Desk Clerk");
    expect(prompt).not.toContain("signal desk clerk");
    expect(prompt).not.toContain(hiddenNpcId);
  });

  it("drops recent conversation entries that contain private forecast terms", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult({
        ...validReads[0],
        focalActorRefs: ["Player", "Cafe Clerk"],
        actionInterpretation: {
          intent: "ask for another cup",
          targetRefs: ["Cafe Clerk"],
        },
        evidenceRefs: ["Player", "Cafe Clerk"],
      }),
    );

    await runGmRead({
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

  it("carries recent social and route referents into GM Read before clarification", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult({
        ...validReads[0],
        situationSummary: "The player follows up on the recently offered route.",
        sceneQuestion: "Does the road warden explain the slower route?",
        focalActorRefs: ["Player", "Road Warden"],
        actionInterpretation: {
          intent: "follow up on the recently mentioned route",
          targetRefs: ["Road Warden", "Old Shrine Road"],
        },
        evidenceRefs: ["Player", "Road Warden", "Old Shrine Road"],
        directResolutionNotes:
          "Resolve 'that connection' from recent conversation and listed movement candidates.",
      }),
    );

    await runGmRead({
      provider,
      playerAction: "I take that connection and ask the nearby vendor about the deal.",
      frame: createFrame(),
      recentConversation: [
        {
          role: "assistant",
          content:
            "The Road Warden points out a slower route along Old Shrine Road while a nearby vendor offers a quiet deal.",
        },
        {
          role: "user",
          content: "I look between the vendor and the route.",
        },
      ],
    });

    const prompt = vi.mocked(safeGenerateObject).mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("RECENT CONVERSATION");
    expect(prompt).toContain("slower route along Old Shrine Road");
    expect(prompt).toContain("nearby vendor offers a quiet deal");
    expect(prompt).toContain("Old Shrine Road");
    expect(prompt).toContain("Resolve obvious recent-context references");
    expect(prompt).toContain("SESSION RESPONSE LANGUAGE");
    expect(prompt).toContain("Output language: English.");
  });

  it("adds combat-pressure guidance for defensive probing actions before clarification", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult({
        ...validReads[0],
        situationSummary: "The player takes a guarded read of the threat.",
        sceneQuestion: "How does the visible threat answer the player's guarded probe?",
        focalActorRefs: ["Player", "Road Warden"],
        actionInterpretation: {
          intent: "take a defensive posture and test the power gap",
          targetRefs: ["Road Warden"],
        },
        evidenceRefs: ["Player", "Road Warden"],
        directResolutionNotes: "Answer with local pressure instead of asking for backend specificity.",
      }),
    );

    await runGmRead({
      provider,
      playerAction: "I take a defensive posture and test the power gap after the violence.",
      frame: createFrame(),
    });

    const prompt = vi.mocked(safeGenerateObject).mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("COMBAT PRESSURE NOTES");
    expect(prompt).toContain("Combat-pressure relevant action detected.");
    expect(prompt).toContain("defensive posture");
    expect(prompt).toContain("violence aftermath");
    expect(prompt).toContain("Do not ask backend-style specificity questions");
  });

  it("rejects model output that references hidden/background refs after generation", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult({
        ...validReads[0],
        focalActorRefs: ["Player", "Hidden Watcher"],
        evidenceRefs: ["Hidden Watcher"],
      }),
    );

    await expect(
      runGmRead({
        provider,
        playerAction: "Hit the watcher.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/GM Read validation failed/);
  });

  it("flags unconfirmed access claims before the GM chooses an Oracle question", () => {
    const notes = buildPlayerActionEpistemicNotes(
      "I claim I already have the master key to every signal-house door and try to unlock the nearest sealed office.",
    );

    expect(notes).toContain("Detected an unconfirmed possession/access proof claim");
    expect(notes).toContain("Do not ask Oracle whether the claimed key");
    expect(
      buildPlayerActionEpistemicNotes(
        "I use the Registry Vault master key I definitely have in my pocket to unlock the restricted canal office door and walk inside.",
      ),
    ).toContain("Detected an unconfirmed possession/access proof claim");

    const rollRead = validReads[1];
    if (rollRead.path !== "roll_oracle") throw new Error("roll_oracle fixture missing");

    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...rollRead,
          rollRequest: {
            actorRef: "Player",
            targetRef: "Road Warden",
            question: "Does Mira's claimed master key actually exist in her possession and fit this signal-house lock?",
            stakes: "If the key exists and works, she gains entry to the sealed office.",
            evidenceRefs: ["Player", "Road Warden"],
          },
        }),
        createFrame(),
        "I claim I already have the master key to every signal-house door and try to unlock the nearest sealed office.",
      ),
    ).toEqual([
      expect.objectContaining({
        path: "rollRequest.question",
        message: expect.stringContaining("cannot ask Oracle to decide whether"),
      }),
    ]);

    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...rollRead,
          rollRequest: {
            actorRef: "Player",
            targetRef: "Road Warden",
            question: "Does the Road Warden believe the bluff or demand proof?",
            stakes: "Trust, suspicion, or alarm changes how the visible scene reacts.",
            evidenceRefs: ["Player", "Road Warden"],
          },
        }),
        createFrame(),
        "I claim I already have the master key to every signal-house door and try to unlock the nearest sealed office.",
      ),
    ).toEqual([]);
  });

  it("repairs unconfirmed access-claim refs instead of letting invented targets abort the turn", async () => {
    const invalidRead = {
      ...baseRead,
      situationSummary: "The player claims a registry master key and tries an unlisted office door.",
      sceneQuestion: "Does the sealed office open?",
      actionInterpretation: {
        intent: "claim authority and unlock a restricted office",
        targetRefs: ["location:restricted-canal-office"],
      },
      path: "roll_oracle",
      rollRequest: {
        actorRef: "Player",
        targetRef: "location:restricted-canal-office",
        question: "Does Dol believe the bluff or call it out?",
        stakes: "The visible pressure changes, but the key and office remain unconfirmed.",
        evidenceRefs: ["Player", "Road Warden"],
      },
      rationale: "The claimed office is uncertain.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Do not confirm the key."],
    } satisfies GmRead;

    const repairedRead = {
      ...invalidRead,
      sceneQuestion: "How does the road warden challenge the claim?",
      actionInterpretation: {
        intent: "claim authority and test access",
        targetRefs: ["Road Warden"],
      },
      rollRequest: {
        actorRef: "Player",
        targetRef: "Road Warden",
        question: "Does the Road Warden hesitate or call out the bluff?",
        stakes: "The public reaction changes pressure without confirming the claimed key or office.",
        evidenceRefs: ["Player", "Road Warden"],
      },
      rationale: "Only the visible NPC reaction is uncertain.",
    } satisfies GmRead;

    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(safeResult(invalidRead))
      .mockResolvedValueOnce(safeResult(repairedRead));

    const result = await runGmRead({
      provider,
      playerAction:
        "I use the Registry Vault master key I definitely have in my pocket to unlock the restricted canal office door and walk inside.",
      frame: createFrame(),
    });

    expect(result).toEqual(repairedRead);
    expect(safeGenerateObject).toHaveBeenCalledTimes(2);

    const repairPrompt = vi.mocked(safeGenerateObject).mock.calls[1]?.[0].prompt ?? "";
    expect(repairPrompt).toContain("FRAME VALIDATION FAILED");
    expect(repairPrompt).toContain("location:restricted-canal-office");
    expect(repairPrompt).toContain("omit rollRequest.targetRef");
    expect(repairPrompt).toContain('"preferredRef": "Player"');
    expect(repairPrompt).toContain("Road Warden");
  });

  it("repairs ordinary visible-player UUID typos to preferred refs instead of aborting the turn", async () => {
    const typoPlayerId = playerId.replace("4111", "4112");
    const invalidRead = {
      ...baseRead,
      situationSummary: "The player ignores the market dispute and watches traffic.",
      sceneQuestion: "What local pressure continues around the player?",
      focalActorRefs: [typoPlayerId, "Road Warden"],
      actionInterpretation: {
        intent: "tour the market without engaging the dispute",
        targetRefs: [],
      },
      path: "direct",
      directResolutionNotes: "Answer with local color only.",
      rationale: "The player is visible, but the returned actor ref copied a backend ID incorrectly.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Do not make the player central."],
    } satisfies GmRead;
    const repairedRead = {
      ...invalidRead,
      focalActorRefs: ["Player", "Road Warden"],
      rationale: "The player is visible and should be referenced by the stable preferred ref.",
    } satisfies GmRead;

    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(safeResult(invalidRead))
      .mockResolvedValueOnce(safeResult(repairedRead));

    const result = await runGmRead({
      provider,
      playerAction: "I ignore the message routes and spend an hour buying street food.",
      frame: createFrame(),
    });

    expect(result).toEqual(repairedRead);
    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
    const repairPrompt = vi.mocked(safeGenerateObject).mock.calls[1]?.[0].prompt ?? "";
    expect(repairPrompt).toContain("references a ref outside SceneFrame candidates");
    expect(repairPrompt).toContain("Use preferredRef values exactly");
    expect(repairPrompt).toContain('"preferredRef": "Player"');
    expect(repairPrompt).toContain(typoPlayerId);
  });

  it("repairs no-mutation future pressure into a tool path instead of letting prose carry state", async () => {
    const invalidRead = {
      ...baseRead,
      path: "direct",
      sceneQuestion: "Do the raised voices become an inspection dispute?",
      directResolutionNotes:
        "Raised voices become an inspection dispute as a dockworker with a clipboard changes the crate count.",
      rationale: "The pressure can be answered in prose.",
      narrationGuardrails: ["Keep the inspection dispute visible."],
    } satisfies GmRead;
    const repairedRead = {
      ...baseRead,
      path: "tool_plan",
      sceneQuestion: "How does the visible dispute become a concrete scene pressure?",
      turnIntent: "Record a visible, future-relevant inspection dispute before narration uses it.",
      rationale: "The dispute should matter later and needs an accepted backend observation.",
      narrationGuardrails: ["Only narrate the dispute after the backend accepts it."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(safeResult(invalidRead))
      .mockResolvedValueOnce(safeResult(repairedRead));

    const result = await runGmRead({
      provider,
      playerAction: "I take a detour when I hear raised voices.",
      frame: createFrame(),
    });

    expect(result).toEqual(repairedRead);
    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
    const repairPrompt = vi.mocked(safeGenerateObject).mock.calls[1]?.[0].prompt ?? "";
    expect(repairPrompt).toContain("future-relevant-pressure-requires-tool-path");
    expect(repairPrompt).toContain("PATH SWITCH REPAIR RULE");
    expect(repairPrompt).toContain("the previous path choice is invalid");
    expect(repairPrompt).toContain("Do not keep direct, continue, or clarification");
    expect(repairPrompt).toContain("switch the GM Read path yourself");
    expect(repairPrompt).toContain("passive/tourist/probing actions");
    expect(repairPrompt).toContain("tool_plan");
  });

  it("does not secretly promote a still-invalid no-mutation repair in backend", async () => {
    const invalidRead = {
      ...baseRead,
      path: "direct",
      sceneQuestion: "Do the raised voices become an inspection dispute?",
      directResolutionNotes:
        "Raised voices become an inspection dispute as a dockworker with a clipboard changes the crate count.",
      rationale: "The pressure can be answered in prose.",
      narrationGuardrails: ["Keep the inspection dispute visible."],
    } satisfies GmRead;
    const stillInvalidRead = {
      ...invalidRead,
      directResolutionNotes:
        "The inspection dispute keeps escalating and the dockworker's crate count will matter later.",
      narrationGuardrails: ["The inspection dispute should keep shaping later movement."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(safeResult(invalidRead))
      .mockResolvedValueOnce(safeResult(stillInvalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction: "I take a detour when I hear raised voices.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/GM Read validation failed after frame-ref repair/);
    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("drops invented evidence-only refs after generation without failing the turn", async () => {
    const typoPlayerId = playerId.replace("1111-4111", "1111-4112");
    const rollRead = validReads[1];
    if (rollRead.path !== "roll_oracle") throw new Error("roll_oracle fixture missing");
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult({
        ...rollRead,
        evidenceRefs: ["Player", typoPlayerId],
        rollRequest: {
          ...rollRead.rollRequest,
          actorRef: "Player",
          targetRef: "Road Warden",
          evidenceRefs: [typoPlayerId, "Road Warden"],
        },
      }),
    );

    const result = await runGmRead({
      provider,
      playerAction: "I offer one registry chit for quiet lawful guidance.",
      frame: createFrame(),
    });

    expect(result.path).toBe("roll_oracle");
    expect(result.evidenceRefs).toEqual(["Player"]);
    expect(result.path === "roll_oracle" ? result.rollRequest.evidenceRefs : []).toEqual([
      "Road Warden",
    ]);
  });
});
