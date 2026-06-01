import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import { buildPlayerActionEpistemicNotes } from "../player-action-epistemics.js";
import { buildGmReadPromptContract } from "../prompt-contracts.js";
import {
  GM_READ_GUARDRAIL_MAX,
  GM_READ_GUARDRAIL_TEXT_MAX,
  GM_READ_STRUCTURED_OUTPUT_RETRIES,
  GM_READ_TIMEOUT_MS,
  GM_READ_RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS,
  GM_READ_SCENE_QUESTION_MAX,
  GM_READ_SITUATION_SUMMARY_MAX,
  buildGmReadPrompt,
  gmReadSchema,
  readGmReadStructuredOutputMode,
  runGmRead,
  validateGmReadForFrame,
  type GmRead,
} from "../gm-turn-read.js";
import type { SceneFrame } from "../scene-frame.js";
import {
  RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS,
  runtimeRequirementStateMutationTools,
} from "../tool-contracts.js";

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

function safeNoMutationAdmissibilityResult(
  overrides: Record<string, unknown> = {},
) {
  return safeResult({
    decision: "admissible",
    safeKind: "no_state_claim",
    blockedClaimKinds: [],
    reason: "The proposed no-mutation response makes no reusable state claim.",
    ...overrides,
  });
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
    allowedTools: [
      "log_event",
      "advance_time",
      "move_actor",
      "create_minor_poi",
      "create_scene_extra",
      "record_dialogue_outcome",
      "record_world_fact",
      "add_tag",
      "remove_tag",
      "set_relationship",
      "spawn_item",
      "set_condition",
      "transfer_item",
    ],
    oracleContext: null,
    combatEnvelope: null,
    oracle: null,
    ...overrides,
    worldVersion: overrides.worldVersion ?? 0,
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
  turnGrounding: {
    intentKind: "ordinary_local_response",
    requiresGrounding: false,
    groundingKind: "none",
    reason: "A local response can be rendered from current visible facts.",
  },
  narrationGuardrails: ["Keep the answer local to the gate."],
} satisfies Omit<GmRead, "path">;

function testTurnGrounding(
  overrides: Partial<GmRead["turnGrounding"]>,
): GmRead["turnGrounding"] {
  return {
    intentKind: "ordinary_local_response",
    requiresGrounding: false,
    groundingKind: "none",
    reason: "Test turn grounding.",
    ...overrides,
  };
}

const validReads: GmRead[] = [
  {
    ...baseRead,
    path: "direct",
    directResolutionNotes: "Answer the question without mutation.",
  },
  {
    ...baseRead,
    path: "roll_oracle",
    turnGrounding: testTurnGrounding({
      intentKind: "combat_pressure",
      requiresGrounding: true,
      groundingKind: "roll_oracle",
      topicKind: "social",
      durability: "scene_local",
    }),
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
    turnGrounding: testTurnGrounding({
      intentKind: "concrete_state_change",
      requiresGrounding: true,
      groundingKind: "scene_beat",
      topicKind: "social",
      durability: "durable",
    }),
    turnIntent: "Record a durable promise if the warden agrees.",
    runtimeRequirement: {
      kind: "scene_beat",
      durability: "durable",
      beatKind: "event_log",
    },
  },
  {
    ...baseRead,
    path: "combat_transition",
    turnGrounding: testTurnGrounding({
      intentKind: "combat_pressure",
      requiresGrounding: true,
      groundingKind: "combat_transition",
      topicKind: "safety",
      durability: "scene_local",
    }),
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
  vi.unstubAllEnvs();
  vi.stubEnv("WORLDFORGE_GM_READ_STRUCTURED_OUTPUT_MODE", "");
  vi.stubEnv("WF_GM_READ_STRUCTURED_OUTPUT_MODE", "");
  vi.clearAllMocks();
  vi.mocked(safeGenerateObject).mockImplementation(async (options) => {
    const prompt = typeof options.prompt === "string" ? options.prompt : "";
    return prompt.includes("NO-MUTATION ADMISSIBILITY CHECK")
      ? safeNoMutationAdmissibilityResult() as never
      : undefined as never;
  });
});

describe("GM Read contract", () => {
  it("keeps GM Read as a no-write authority classifier outside runtime mutation owners", () => {
    const source = fs.readFileSync(new URL("../gm-turn-read.ts", import.meta.url), "utf-8");
    const forbiddenMutationSurfaces = [
      { label: "runtime executor import", pattern: /from\s+["']\.\/tool-executor\.js["']/u },
      { label: "executeToolCall call", pattern: /\bexecuteToolCall\s*\(/u },
      { label: "authority trace import", pattern: /from\s+["']\.\/living-world-authority\.js["']/u },
      { label: "commitAuthorityTrace call", pattern: /\bcommitAuthorityTrace\s*\(/u },
      { label: "sqlite connection import", pattern: /from\s+["']\.\.\/db\//u },
      { label: "database write chain", pattern: /\bdb\.(?:insert|update|delete|transaction|run)\s*\(/u },
      { label: "episodic vector write", pattern: /\bstoreEpisodicEvent\s*\(/u },
      { label: "snapshot capture", pattern: /\bcaptureSnapshot\s*\(/u },
      { label: "snapshot restore", pattern: /\brestoreSnapshot\s*\(/u },
      { label: "filesystem write", pattern: /\bfs\.(?:writeFileSync|rmSync|renameSync|copyFileSync)\s*\(/u },
    ];

    for (const { label, pattern } of forbiddenMutationSurfaces) {
      expect(source, label).not.toMatch(pattern);
    }
  });

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
    expect(contract).toContain("For broad observe, inspect, take stock");
    expect(contract).toContain("Clock advance, sensory color, or repeated tension alone is not a completed status read");
    expect(contract).toContain("choose tool_plan for a lookup-grounded read or minimal state-bearing consequence");
    expect(contract).toContain("observation-only lookup evidence is enough");
    expect(contract).toContain("whether crowd pressure, authority procedure");
    expect(contract).toContain("do not use direct for a future-relevant yes/no answer");
    expect(contract).toContain("Ground the visible unchanged state, change, announcement, or lack of public shift");
    expect(contract).toContain("vendor, clerk, worker, assistant");
    expect(contract).toContain("what changed today");
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
    expect(contract).toContain("Use clarification only when the requested role cannot plausibly exist");
    expect(contract).toContain("Fuzzy bridge policy");
    expect(contract).toContain("bridge understandable low-risk navigation, search, and service-role intent");
    expect(contract).toContain("Selection caps are hard");
    expect(contract).toContain("never enumerate every visible actor");
    expect(contract).toContain("For broad take-stock/status-read actions");
    expect(contract).toContain("top 1-2 blockers");
    expect(contract).toContain("not an exact backend string");
    expect(contract).toContain("materially similar");
    expect(contract).toContain("bounded diegetic 2-3 choice question");
    expect(contract).toContain("public/indicated/legal/visible/previously listed route");
    expect(contract).toContain("safest lawful destination is enough movement intent for tool_plan");
    expect(contract).toContain("list, check, move, or record blocked/no-current-route");
    expect(contract).toContain("Clarification is allowed only for materially different risk/cost");
    expect(contract).toContain("mechanically important target identity");
    expect(contract).toContain("no fair playable bridge");
    expect(contract).toContain("Do not ask exact ID, backend target, route id, or connected-location questions");
    expect(contract).toContain("Public/commercial/institutional scenes should not stall");
    expect(contract).toContain("ordinary service worker or assistant is usually a plausible support NPC");
    expect(contract).toContain("nearest notice-board clerk");
    expect(contract).toContain("which posted item/notice/rule/sign applies");
    expect(contract).toContain("which posted item applies");
    expect(contract).toContain("create/tag item state");
    expect(contract).toContain("Do not choose clarification just because the exact clerk/assistant actor is not already listed");
    expect(contract).toContain("bounded temporary responder or record a grounded unavailable/no-current-answer outcome");
    expect(contract).toContain("next practical move from accumulated evidence or options");
    expect(contract).toContain("without committing the player's choice");
    expect(contract).toContain("keep sceneQuestion/clarificationPrompt free of future-relevant concrete pressure");
    expect(contract).toContain("follow a public indicated route toward the safest named office or holding point");
    expect(contract).toContain("Do not complete movement without a valid route or blocked-route tool result");
    expect(contract).toContain("Combat pressure is broader than explicit attack verbs");
    expect(contract).toContain("defensive posture");
    expect(contract).toContain("power-gap questions");
    expect(contract).toContain("Do not include concrete tool payloads");
    expect(contract).toContain("runtimeRequirement is the typed runtime obligation for tool_plan, roll_oracle, and combat_transition");
    expect(contract).toContain('"kind": "dialogue_outcome"');
    expect(contract).toContain('"kind": "prose_role"');
    expect(contract).toContain('"requestedRoleText": "nearest engineer"');
    expect(contract).toContain("Never write proseRole or roleText in GM Read speakerBinding");
    expect(contract).toContain('"kind": "world_fact"');
    expect(contract).toContain('"kind": "observation_read"');
    expect(contract).toContain("Use observation_read for broad observation/status scans");
    expect(contract).toContain('Do not put "observation" or "public_record" in dialogue_outcome/world_fact.topicKind');
    expect(contract).not.toContain("plannedActions shape");
    expect(contract.split("\n").length).toBeLessThanOrEqual(110);
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

  it("accepts typed runtimeRequirement for mutating runtime paths and rejects it on no-runtime paths", () => {
    expect(
      gmReadSchema.parse({
        ...baseRead,
        path: "tool_plan",
        turnIntent: "Record the warden answer as reusable procedure.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "durable",
          topicKind: "proof",
          speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
        },
      }),
    ).toMatchObject({
      path: "tool_plan",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
        speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
      },
    });

    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "roll_oracle",
          turnGrounding: testTurnGrounding({
            intentKind: "concrete_state_change",
            requiresGrounding: true,
            groundingKind: "roll_oracle",
            topicKind: "status",
            durability: "scene_local",
          }),
          rollRequest: {
            actorRef: "Player",
            question: "Does the guard yield?",
            stakes: "Whether the gate state changes.",
            evidenceRefs: ["Player"],
          },
          runtimeRequirement: {
            kind: "state_mutation",
            effectKind: "entity_tag",
          },
        }),
        createFrame({ allowedTools: ["log_event", "move_to", "set_condition", "add_tag"] }),
      ),
    ).toEqual([]);

    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "combat_transition",
          turnGrounding: testTurnGrounding({
            intentKind: "combat_pressure",
            requiresGrounding: true,
            groundingKind: "combat_transition",
            topicKind: "safety",
            durability: "scene_local",
          }),
          actorRef: "Player",
          targetRef: "Road Warden",
          combatFraming: "The shove becomes a fight.",
          stakes: "Whether the opening exchange leaves a condition.",
          runtimeRequirement: {
            kind: "state_mutation",
            effectKind: "actor_condition",
          },
        }),
        createFrame(),
      ),
    ).toEqual([]);

    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "direct",
          directResolutionNotes: "Answer locally without durable procedure.",
          runtimeRequirement: {
            kind: "dialogue_outcome",
            durability: "durable",
            topicKind: "proof",
            speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
          },
        }),
        createFrame(),
      ),
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "runtimeRequirement",
        message: expect.stringContaining("non-none only for tool_plan, roll_oracle, or combat_transition"),
      }),
    ]));
  });

  it("canonicalizes observed proseRole speakerBinding alias at the GM Read boundary", () => {
    const parsed = gmReadSchema.parse({
      ...baseRead,
      path: "tool_plan",
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "procedure",
        durability: "durable",
      }),
      turnIntent: "Resolve the nearest engineer's procedural answer.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "procedure",
        speakerBinding: {
          kind: "prose_role",
          proseRole: "nearest engineer",
        },
      },
    });

    expect(parsed.runtimeRequirement).toMatchObject({
      kind: "dialogue_outcome",
      speakerBinding: {
        kind: "prose_role",
        requestedRoleText: "nearest engineer",
      },
    });
    expect(JSON.stringify(parsed)).not.toContain("proseRole");
  });

  it("requires dialogue_outcome speakerBinding before the tool loop can bind a speaker", () => {
    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "tool_plan",
          turnGrounding: testTurnGrounding({
            intentKind: "procedural_information",
            requiresGrounding: true,
            groundingKind: "dialogue_outcome",
            topicKind: "proof",
            durability: "durable",
          }),
          turnIntent: "Record the warden answer as reusable procedure.",
          runtimeRequirement: {
            kind: "dialogue_outcome",
            durability: "durable",
            topicKind: "proof",
          },
        }),
        createFrame(),
      ),
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "runtimeRequirement.speakerBinding",
        message: expect.stringContaining("requires speakerBinding"),
      }),
    ]));

    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "tool_plan",
          turnGrounding: testTurnGrounding({
            intentKind: "ordinary_local_response",
            requiresGrounding: true,
            groundingKind: "dialogue_outcome",
            topicKind: "other",
            durability: "scene_local",
          }),
          turnIntent: "Resolve the clerk role if the scene can support one.",
          runtimeRequirement: {
            kind: "dialogue_outcome",
            durability: "scene_local",
            topicKind: "other",
            speakerBinding: {
              kind: "prose_role",
              requestedRoleText: "bored clerk",
            },
          },
        }),
        createFrame(),
      ),
    ).toEqual([]);
  });

  it("accepts incomplete structural dialogue proposals into semantic repair instead of schema-failing the turn", () => {
    const read = gmReadSchema.parse({
      ...baseRead,
      path: "tool_plan",
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "route",
        durability: "durable",
      }),
      turnIntent: "Ask the route-scout for the first route marker wording.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "route",
        speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
        requiresStructuralEffect: true,
      },
    });

    expect(validateGmReadForFrame(read, createFrame())).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "runtimeRequirement.effectKind",
        message: expect.stringContaining("structural-dialogue-requires-explicit-effect-kind"),
      }),
    ]));
  });

  it("repairs missing structural dialogue effectKind by choosing an explicit non-structural dialogue outcome", async () => {
    const invalidRead = gmReadSchema.parse({
      ...baseRead,
      path: "tool_plan",
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "route",
        durability: "durable",
      }),
      turnIntent: "Ask the route-scout for the first route marker wording.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "route",
        speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
        requiresStructuralEffect: true,
      },
    });
    const repairedRead = gmReadSchema.parse({
      ...invalidRead,
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "route",
        speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
        requiresStructuralEffect: false,
      },
    });

    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(safeResult(invalidRead))
      .mockResolvedValueOnce(safeResult(repairedRead));

    await expect(runGmRead({
      provider,
      playerAction:
        "I ask Route-Scout Fen Dorrow to point out the first physical marker on the Ventwatch Ridge route.",
      frame: createFrame(),
    })).resolves.toMatchObject({
      path: "tool_plan",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        topicKind: "route",
        requiresStructuralEffect: false,
      },
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0]?.prompt).toContain(
      "structural-dialogue-requires-explicit-effect-kind",
    );
  });

  it("allows concrete dialogue outcomes without structural owners for unmodeled paid route hints", () => {
    const read = gmReadSchema.parse({
      ...baseRead,
      path: "tool_plan",
      situationSummary: "The player pays a visible contact for a quiet route hint.",
      sceneQuestion: "What route hint does the contact sell?",
      actionInterpretation: {
        intent: "pay the visible contact for a quiet route hint",
        targetRefs: ["Road Warden"],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "concrete_state_change",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "trade",
        durability: "durable",
      }),
      turnIntent:
        "Record the visible contact accepting unmodeled small currency and giving the route hint as a durable dialogue outcome.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "trade",
        speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
        requiresStructuralEffect: false,
      },
      rationale:
        "The payment is ordinary unmodeled pocket money; no item, location, relationship, or permission state changes structurally.",
      narrationGuardrails: ["Do not claim a structural item transfer receipt."],
    });

    expect(validateGmReadForFrame(read, createFrame())).toEqual([]);
  });

  it("rejects dialogue outcomes that absorb explicit travel to a distinct responder location", () => {
    const read = gmReadSchema.parse({
      ...baseRead,
      path: "tool_plan",
      actionInterpretation: {
        intent: "follow directions down to the lower gallery stationer's stall and ask the price there",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "trade",
        durability: "durable",
      }),
      turnIntent: "Create a stationer responder and record their answer about paper prices.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "trade",
        speakerBinding: {
          kind: "prose_role",
          requestedRoleText: "Lower Gallery Stationer",
          allowCreateSceneExtra: true,
        },
      },
    });

    expect(validateGmReadForFrame(
      read,
      createFrame(),
      "I follow the clerk's directions down from the receiving desk toward the lower gallery corridor stationer's stall. At the stall I ask the price for one acceptable unmarked folio.",
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "runtimeRequirement",
        message: expect.stringContaining("mixed-travel-dialogue-requires-movement-first"),
      }),
    ]));
  });

  it("hardens mixed travel plus dialogue into a movement runtime requirement before repair", async () => {
    const invalidRead = gmReadSchema.parse({
      ...baseRead,
      path: "tool_plan",
      actionInterpretation: {
        intent: "follow directions down to the lower gallery stationer's stall and ask the price there",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "trade",
        durability: "durable",
      }),
      turnIntent: "Create a stationer responder and record their answer about paper prices.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "trade",
        speakerBinding: {
          kind: "prose_role",
          requestedRoleText: "Lower Gallery Stationer",
          allowCreateSceneExtra: true,
        },
      },
    });
    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(safeResult(invalidRead));

    await expect(runGmRead({
      provider,
      playerAction:
        "I follow the clerk's directions down from the receiving desk toward the lower gallery corridor stationer's stall. At the stall I ask the price for one acceptable unmarked folio.",
      frame: createFrame(),
    })).resolves.toMatchObject({
      path: "tool_plan",
      runtimeRequirement: { kind: "state_mutation", effectKind: "movement" },
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("keeps runtimeRequirement topicKind aligned with runtime tool schemas", () => {
    expect(gmReadSchema.safeParse({
      ...baseRead,
      path: "tool_plan",
      turnIntent: "Record the public answer to the rumor question.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "observation",
      },
    }).success).toBe(false);

    expect(gmReadSchema.safeParse({
      ...baseRead,
      path: "tool_plan",
      turnIntent: "Record the public notice-board fact.",
      runtimeRequirement: {
        kind: "world_fact",
        durability: "durable",
        topicKind: "public_record",
      },
    }).success).toBe(false);

    expect(gmReadSchema.safeParse({
      ...baseRead,
      path: "tool_plan",
      turnIntent: "Ground an existing visible public-record read.",
      runtimeRequirement: {
        kind: "observation_read",
        categories: ["public_records", "local_status"],
      },
    }).success).toBe(true);

    expect([...GM_READ_RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS]).toEqual(
      RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS.filter((effectKind) =>
        effectKind !== "chronicle_entry"),
    );

    for (const effectKind of GM_READ_RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS) {
      expect(gmReadSchema.safeParse({
        ...baseRead,
        path: "tool_plan",
        turnIntent: "Use a runtime-owned state effect kind.",
        turnGrounding: testTurnGrounding({
          intentKind: "concrete_state_change",
          requiresGrounding: true,
          groundingKind: "state_mutation",
        }),
        runtimeRequirement: {
          kind: "state_mutation",
          effectKind,
        },
      }).success).toBe(true);

      expect(gmReadSchema.safeParse({
        ...baseRead,
        path: "tool_plan",
        turnIntent: "Use a runtime-owned scene beat state effect kind.",
        turnGrounding: testTurnGrounding({
          intentKind: "concrete_state_change",
          requiresGrounding: true,
          groundingKind: "scene_beat",
        }),
        runtimeRequirement: {
          kind: "scene_beat",
          durability: "scene_local",
          effectKind,
        },
      }).success).toBe(true);
    }
  });

  it("keeps GM Read StateEffectKind prompt text in parity with runtime owners", () => {
    const contract = buildGmReadPromptContract({
      allowedTools: ["log_event", "set_condition"],
    });
    const exposedTools = new Set(["log_event", "set_condition"]);

    for (const effectKind of GM_READ_RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS) {
      const ownerTools = runtimeRequirementStateMutationTools({
        kind: "state_mutation",
        effectKind,
      }).filter((ownerTool) => exposedTools.has(ownerTool));
      if (ownerTools.length > 0) {
        expect(contract).toContain(`"${effectKind}"`);
        for (const ownerTool of ownerTools) {
          expect(contract).toContain(ownerTool);
        }
      }
    }
    expect(contract).not.toContain('"chronicle_entry"');
    expect(contract).not.toContain("add_chronicle_entry");
  });

  it("rejects runtime requirements that the current model-facing tool surface cannot satisfy", () => {
    const read = gmReadSchema.parse({
      ...baseRead,
      path: "tool_plan",
      turnGrounding: testTurnGrounding({
        intentKind: "concrete_state_change",
        requiresGrounding: true,
        groundingKind: "state_mutation",
        topicKind: "route",
        durability: "durable",
      }),
      turnIntent: "Create a local public point of interest if the scene supports it.",
      runtimeRequirement: {
        kind: "state_mutation",
        effectKind: "minor_poi_created",
      },
    });

    expect(validateGmReadForFrame(
      read,
      createFrame({ allowedTools: ["log_event", "set_condition"] }),
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "runtimeRequirement",
        message: expect.stringContaining("cannot be satisfied by the current model-facing tool surface"),
      }),
    ]));
  });

  it("tells GM Read to route prior procedural fact comparisons through tool_plan", () => {
    const contract = buildGmReadPromptContract({
      allowedTools: ["log_event"],
    });

    expect(contract).toContain("compares");
    expect(contract).toContain("prior procedural");
    expect(contract).toContain("official claims");
    expect(contract).toContain("choose tool_plan");
    expect(contract).toContain("Ground and record");
    expect(contract).toContain("future route choices");
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

  it("rejects typed backend refs even when they point at known current actors and locations", () => {
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
    ).toEqual([
      expect.objectContaining({ path: "focalActorRefs.0", message: expect.stringContaining("backend-only ref") }),
      expect.objectContaining({ path: "focalActorRefs.1", message: expect.stringContaining("backend-only ref") }),
      expect.objectContaining({ path: "actionInterpretation.targetRefs.0", message: expect.stringContaining("backend-only ref") }),
      expect.objectContaining({ path: "evidenceRefs.0", message: expect.stringContaining("backend-only ref") }),
      expect.objectContaining({ path: "evidenceRefs.1", message: expect.stringContaining("backend-only ref") }),
    ]);
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

  it("rejects no-mutation GM Read paths when structured turnGrounding requires backend grounding", () => {
    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "direct",
          turnGrounding: testTurnGrounding({
            intentKind: "concrete_state_change",
            requiresGrounding: true,
            groundingKind: "scene_beat",
            topicKind: "status",
            durability: "durable",
          }),
          sceneQuestion: "Do the raised voices become an inspection dispute?",
          directResolutionNotes:
            "Raised voices become an inspection dispute as a dockworker with a clipboard changes the crate count.",
        }),
        createFrame(),
      ),
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "path",
        message: expect.stringContaining("turn-grounding-runtime-contract-mismatch"),
      }),
    ]));

    expect(
      validateGmReadForFrame(
        gmReadSchema.parse({
          ...baseRead,
          path: "continue",
          turnGrounding: testTurnGrounding({
            intentKind: "concrete_state_change",
            requiresGrounding: true,
            groundingKind: "scene_beat",
            topicKind: "route",
            durability: "durable",
          }),
          continuationGuidance:
            "A recessed maintenance-like door opens onto a narrow stair that should guide the next route.",
        }),
        createFrame(),
      ),
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "path",
        message: expect.stringContaining("turn-grounding-runtime-contract-mismatch"),
      }),
    ]));
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
          turnGrounding: testTurnGrounding({
            intentKind: "combat_pressure",
            requiresGrounding: true,
            groundingKind: "combat_transition",
            topicKind: "safety",
            durability: "scene_local",
          }),
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
    const frame = createFrame();

    const result = await runGmRead({
      provider,
      playerAction: "I just say hello.",
      frame,
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
    expect(createModel).toHaveBeenCalledWith(provider, { role: "judge", reasoningMode: "bypass" });
    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
    expect(safeGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: gmReadSchema,
        temperature: 0,
        maxOutputTokens: 1200,
        timeout: { totalMs: GM_READ_TIMEOUT_MS },
        retries: GM_READ_STRUCTURED_OUTPUT_RETRIES,
        mode: "native_json",
        allowTextFallback: false,
        allowRepair: false,
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
    expect(firstCall?.prompt).toContain("GM READ CITABLE REF BUDGET");
    expect(firstCall?.prompt).toContain('"evidenceRefsMax": 8');
    expect(firstCall?.prompt).toContain("Use only these refs in evidenceRefs");
    expect(firstCall?.prompt).toContain("CANDIDATE REFS FROM MODEL-FACING VIEW ONLY");
    expect(firstCall?.prompt).toContain('"preferredRef": "Player"');
    expect(firstCall?.prompt).toContain('"preferredRef": "Road Warden"');
    expect(firstCall?.prompt).toContain('"ref": "current_scene"');
    expect(firstCall?.prompt).not.toContain('"usableRefs"');
    expect(firstCall?.prompt).not.toContain(`actor:${playerId}`);
    expect(firstCall?.prompt).not.toContain(`location:${frame.currentLocationId}`);
    expect(firstCall?.prompt).toContain("REFERENCE SELECTION RULES");
    expect(firstCall?.prompt).toContain("For the player, use Player");
    expect(firstCall?.prompt).toContain("ALLOWED TOOLS FROM frame.allowedTools");
    expect(firstCall?.prompt).toContain("SCOPED FORECAST EXCERPT ONLY");
    expect(firstCall?.prompt).toContain("The warden is likely to ask");
    expect(firstCall?.prompt).toContain("Do not include concrete tool payloads");
    expect(firstCall?.prompt).toContain("next playable beat");
    expect(firstCall?.prompt).toContain("Use direct for normal conversation");
    expect(firstCall?.prompt).toContain("Use tool_plan only when world state must actually change");
    expect(firstCall?.prompt).toContain("Do not use direct for reusable procedural answers");
    expect(firstCall?.prompt).toContain("turnGrounding");
    expect(firstCall?.prompt).toContain('"speakerBinding"');
    expect(firstCall?.prompt).toContain("The player asks a visible warden what proof is required");
    expect(firstCall?.prompt).toContain("Resolve and record the authority response");
    expect(firstCall?.prompt).toContain("Proof requirements are reusable procedural information");
    expect(firstCall?.prompt).toContain("proofs, permits, waivers, authorisations");
    expect(firstCall?.prompt).toContain("reusable NPC procedural/logistical information");
    expect(firstCall?.prompt).toContain("Before choosing direct for a passive/tourist action");
    expect(firstCall?.prompt).toContain("Do not smuggle support presence through direct");
    expect(firstCall?.prompt).toContain("worker, assistant");
    expect(firstCall?.prompt).toContain("low-ranking staff");
    expect(firstCall?.prompt).toContain("what changed today");
    expect(firstCall?.prompt).toContain("groundingKind");
    expect(firstCall?.prompt).toContain("Player agency is locked");
    expect(firstCall?.prompt).toContain("Treat claimed possessions, authority, access");
    expect(firstCall?.prompt).toContain("do not ask Oracle whether the proof exists");
    expect(firstCall?.prompt).toContain("Do not rescue a false or unconfirmed access claim");
    expect(firstCall?.prompt).toContain("NPCs are autonomous actors");
    expect(firstCall?.prompt).toContain("Before returning direct, continue, or clarification");
    expect(firstCall?.prompt).toContain("Path choice is the GM's job");
    expect(firstCall?.prompt).not.toContain('"plannedTools":');
    expect(firstCall?.prompt).not.toContain('"input":');
    const secondCall = vi.mocked(safeGenerateObject).mock.calls[1]?.[0];
    expect(secondCall?.prompt).toContain("NO-MUTATION ADMISSIBILITY CHECK");
    expect(secondCall?.prompt).toContain("Do not trust the previous turnGrounding label");
  });

  it("can accept no-mutation reads under the clean stage1 contract without the legacy classifier", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validReads[0]));

    const result = await runGmRead({
      provider,
      playerAction: "I just say hello.",
      frame: createFrame(),
      noMutationAdmissibilityMode: "stage1_contract",
    });

    expect(result).toMatchObject({ path: "direct" });
    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
    const onlyCall = vi.mocked(safeGenerateObject).mock.calls[0]?.[0];
    expect(onlyCall?.prompt).not.toContain("NO-MUTATION ADMISSIBILITY CHECK");
  });

  it.each([
    {
      playerAction: "Which permit lets me pass through the posted gate?",
      blockedClaimKind: "permission_access",
      requiredGroundingKind: "dialogue_outcome",
      topicKind: "permission",
      repairedTurnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
      }),
      repairedRuntimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "permission",
        speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
      },
    },
    {
      playerAction: "Does this stamped receipt satisfy the posting?",
      blockedClaimKind: "proof_document",
      requiredGroundingKind: "dialogue_outcome",
      topicKind: "proof",
      repairedTurnGrounding: testTurnGrounding({
        intentKind: "posted_proof_applicability",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "proof",
        durability: "durable",
      }),
      repairedRuntimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
        speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
      },
    },
    {
      playerAction: "Which route is now safest?",
      blockedClaimKind: "route",
      requiredGroundingKind: "observation_read",
      topicKind: "route",
      repairedTurnGrounding: testTurnGrounding({
        intentKind: "passive_status_read",
        requiresGrounding: true,
        groundingKind: "observation_read",
        topicKind: "route",
        durability: "scene_local",
      }),
      repairedRuntimeRequirement: {
        kind: "observation_read",
        categories: ["routes", "hazards", "local_status"],
      },
    },
    {
      playerAction: "Has the clerk accepted the waiver?",
      blockedClaimKind: "status_read_change",
      requiredGroundingKind: "dialogue_outcome",
      topicKind: "status",
      repairedTurnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "status",
        durability: "durable",
      }),
      repairedRuntimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "status",
        speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
      },
    },
    {
      playerAction: "What changed in the queue?",
      blockedClaimKind: "procedure",
      requiredGroundingKind: "observation_read",
      topicKind: "procedure",
      repairedTurnGrounding: testTurnGrounding({
        intentKind: "passive_status_read",
        requiresGrounding: true,
        groundingKind: "observation_read",
        topicKind: "procedure",
        durability: "scene_local",
      }),
      repairedRuntimeRequirement: {
        kind: "observation_read",
        categories: ["crowd", "procedure", "local_status"],
      },
    },
  ])(
    "repairs misclassified direct no-mutation claims into grounded paths: $playerAction",
    async ({
      playerAction,
      blockedClaimKind,
      requiredGroundingKind,
      topicKind,
      repairedTurnGrounding,
      repairedRuntimeRequirement,
    }) => {
      const misclassifiedRead = gmReadSchema.parse({
        ...baseRead,
        path: "direct",
        situationSummary: "The player asks for a reusable answer, but the read mislabeled it local.",
        sceneQuestion: "Which reusable answer applies now?",
        actionInterpretation: {
          intent: playerAction,
          targetRefs: ["Road Warden"],
        },
        directResolutionNotes: "Answer directly without tools.",
      });
      const repairedRead = gmReadSchema.parse({
        ...baseRead,
        path: "tool_plan",
        situationSummary: "The player asks for a reusable answer that needs grounding.",
        sceneQuestion: "Which grounded answer applies now?",
        actionInterpretation: {
          intent: playerAction,
          targetRefs: ["Road Warden"],
        },
        turnGrounding: repairedTurnGrounding,
        runtimeRequirement: repairedRuntimeRequirement,
        turnIntent: "Ground and record the reusable answer before narration uses it.",
      });

      vi.mocked(safeGenerateObject)
        .mockResolvedValueOnce(safeResult(misclassifiedRead))
        .mockResolvedValueOnce(safeResult({
          decision: "runtime_required",
          blockedClaimKinds: [blockedClaimKind],
          requiredGroundingKind,
          topicKind,
          durability: topicKind === "route" || topicKind === "procedure" ? "scene_local" : "durable",
          reason: "The proposed direct answer would create a reusable gameplay claim.",
        }))
        .mockResolvedValueOnce(safeResult(repairedRead));

      await expect(runGmRead({
        provider,
        playerAction,
        frame: createFrame(),
      })).resolves.toMatchObject({
        path: "tool_plan",
        runtimeRequirement: repairedRuntimeRequirement,
      });

      expect(safeGenerateObject).toHaveBeenCalledTimes(3);
      expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0]?.prompt).toContain(
        "NO-MUTATION ADMISSIBILITY CHECK",
      );
      expect(vi.mocked(safeGenerateObject).mock.calls[2]?.[0]?.prompt).toContain(
        "no-mutation-admissibility-requires-runtime",
      );
    },
  );

  it("uses local aliases instead of raw ids when prompt candidates lack labels", () => {
    const frame = createFrame({
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
            label: "",
            locationId: "99999999-9999-4999-8999-999999999999",
            sceneScopeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            awareness: "clear",
          },
        ],
        support: [],
        background: [],
      },
      targetCandidates: [
        {
          id: npcId,
          actorId: npcId,
          type: "actor",
          label: "",
          awareness: "clear",
        },
      ],
      movementCandidates: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          locationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          label: "",
          connected: true,
        },
      ],
    });

    const prompt = buildGmReadPrompt({
      provider,
      playerAction: "I check who is nearby.",
      frame,
    });

    expect(prompt).toContain('"ref": "person_2"');
    expect(prompt).toContain('"preferredRef": "target_1"');
    expect(prompt).toContain('"preferredRef": "move_1"');
    expect(prompt).not.toContain(npcId);
    expect(prompt).not.toContain("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(prompt).not.toContain("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  });

  it("keeps OpenCode/Mimo GM Read on closed native JSON by default with same-mode retries", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validReads[0]));

    await runGmRead({
      provider: {
        ...provider,
        name: "OpenCode",
        baseUrl: "https://opencode.ai/api",
        model: "mimo-v2.5-pro",
      },
      playerAction: "I just say hello.",
      frame: createFrame(),
    });

    expect(readGmReadStructuredOutputMode({
      ...provider,
      name: "OpenCode",
      baseUrl: "https://opencode.ai/api",
      model: "mimo-v2.5-pro",
    })).toBe("native_json");
    expect(safeGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "native_json",
        retries: GM_READ_STRUCTURED_OUTPUT_RETRIES,
        allowTextFallback: false,
        allowRepair: false,
      }),
    );
  });

  it("keeps non-Mimo GM Read on native_json by default", () => {
    expect(readGmReadStructuredOutputMode(provider)).toBe("native_json");
  });

  it("lets env force closed tool-mode structured output for GM Read", async () => {
    vi.stubEnv("WORLDFORGE_GM_READ_STRUCTURED_OUTPUT_MODE", "tool_mode");
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validReads[0]));

    await runGmRead({
      provider,
      playerAction: "I just say hello.",
      frame: createFrame(),
    });

    expect(readGmReadStructuredOutputMode()).toBe("tool_mode");
    expect(safeGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "tool_mode",
        retries: GM_READ_STRUCTURED_OUTPUT_RETRIES,
        allowTextFallback: false,
        allowRepair: false,
      }),
    );
  });

  it("rejects unknown GM Read structured output modes at runtime", () => {
    vi.stubEnv("WORLDFORGE_GM_READ_STRUCTURED_OUTPUT_MODE", "loose-json");

    expect(() => readGmReadStructuredOutputMode()).toThrow(/native_json or tool_mode/);
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
    expect(prompt).toContain("prior_gm_visible_prose_non_authority");
    expect(prompt).toContain("presentation only, not legal evidence");
    expect(prompt).not.toContain("ceramic cup");
    expect(prompt).not.toContain("Postal Cache");
  });

  it("redacts exact non-pattern frame ids from player action and recent conversation", () => {
    const prompt = buildGmReadPrompt({
      provider,
      playerAction:
        "I paste miraInternal42 near pierInternal77 and ask about backRoomInternal99.",
      frame: createFrame({
        playerActorId: "miraInternal42",
        currentLocationId: "pierInternal77",
        currentSceneScopeId: "counterInternal88",
        roster: {
          active: [
            {
              id: "miraInternal42",
              actorId: "miraInternal42",
              type: "player",
              label: "Player",
              locationId: "pierInternal77",
              sceneScopeId: "counterInternal88",
              awareness: "clear",
            },
            {
              id: "wardenInternal13",
              actorId: "wardenInternal13",
              type: "npc",
              label: "Road Warden",
              locationId: "pierInternal77",
              sceneScopeId: "counterInternal88",
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
            id: "wardenInternal13",
            actorId: "wardenInternal13",
            type: "actor",
            label: "Road Warden",
            awareness: "clear",
          },
        ],
        movementCandidates: [
          {
            id: "backRoomInternal99",
            locationId: "backRoomInternal99",
            label: "Back Room",
            connected: true,
          },
        ],
      }),
      recentConversation: [
        {
          role: "assistant",
          content: "Debug replay mentioned wardenInternal13 and counterInternal88.",
        },
      ],
    });

    expect(prompt).toContain("Road Warden");
    expect(prompt).toContain("Back Room");
    for (const leaked of [
      "miraInternal42",
      "pierInternal77",
      "counterInternal88",
      "wardenInternal13",
      "backRoomInternal99",
    ]) {
      expect(prompt).not.toContain(leaked);
    }
    expect(prompt).toContain("[backend ref hidden]");
  });

  it("does not carry assistant-authored route/social facts into GM Read as evidence", async () => {
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
    expect(prompt).not.toContain("slower route along Old Shrine Road");
    expect(prompt).not.toContain("nearby vendor offers a quiet deal");
    expect(prompt).toContain("Old Shrine Road");
    expect(prompt).toContain("presentation only, not legal evidence");
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

  it("rejects unconfirmed access-claim refs instead of repairing the first pass", async () => {
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

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I use the Registry Vault master key I definitely have in my pocket to unlock the restricted canal office door and walk inside.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/GM Read validation failed/);
    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("rejects ordinary visible-player UUID typos instead of repairing the first pass", async () => {
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

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction: "I ignore the message routes and spend an hour buying street food.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/GM Read validation failed/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("repairs recoverable GM Read path validation failures with a second semantic pass", async () => {
    const invalidRead = {
      ...baseRead,
      path: "direct",
      turnGrounding: testTurnGrounding({
        intentKind: "concrete_state_change",
        requiresGrounding: true,
        groundingKind: "scene_beat",
        topicKind: "status",
        durability: "scene_local",
      }),
      sceneQuestion: "Do the raised voices become an inspection dispute?",
      directResolutionNotes:
        "Raised voices become an inspection dispute as actor:private-handler with loc-secret-vault changes the crate count after tool-result-abc.",
      rationale: "The pressure can be answered in prose.",
      narrationGuardrails: ["Keep the inspection dispute visible."],
    } satisfies GmRead;
    const repairedRead = {
      ...baseRead,
      path: "tool_plan",
      turnGrounding: testTurnGrounding({
        intentKind: "concrete_state_change",
        requiresGrounding: true,
        groundingKind: "scene_beat",
        topicKind: "status",
        durability: "scene_local",
      }),
      sceneQuestion: "What grounded local pressure can be recorded before narration?",
      actionInterpretation: {
        intent: "notice raised voices and local inspection pressure",
        targetRefs: ["Road Warden"],
      },
      turnIntent:
        "Ground the local inspection pressure before narration uses it as a playable update.",
      runtimeRequirement: {
        kind: "scene_beat",
        durability: "scene_local",
        beatKind: "event_log",
      },
      rationale: "The pressure should be grounded before narration treats it as a continuing beat.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Keep the pressure modest and local."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(safeResult(invalidRead))
      .mockResolvedValueOnce(safeResult(repairedRead));

    await expect(
      runGmRead({
        provider,
        playerAction: "I take a detour when I hear raised voices.",
        frame: createFrame(),
      }),
    ).resolves.toMatchObject({
      path: "tool_plan",
      turnIntent: expect.stringContaining("inspection pressure"),
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0]?.prompt).toContain(
      "VALIDATION REPAIR REQUIRED",
    );
    expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0]?.prompt).not.toContain(
      "actor:private-handler",
    );
    expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0]?.prompt).not.toContain(
      "loc-secret-vault",
    );
    expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0]?.prompt).not.toContain(
      "tool-result-abc",
    );
  });

  it("hardens repaired reusable dialogue requirements to durable before final validation", async () => {
    const invalidRead = {
      ...baseRead,
      path: "direct",
      sceneQuestion: "Where does the factor say the conveyance-warrant office is?",
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "procedure",
        durability: "durable",
      }),
      directResolutionNotes:
        "The factor says the harbormaster signs conveyance warrants past the lock gates.",
      rationale: "The answer is routine local conversation.",
      narrationGuardrails: ["Keep the direction actionable."],
    } satisfies GmRead;
    const repairedRead = {
      ...baseRead,
      path: "tool_plan",
      sceneQuestion: "Which official direction does the factor give?",
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "procedure",
        durability: "durable",
      }),
      actionInterpretation: {
        intent: "ask where the harbormaster or conveyance-warrant office is",
        targetRefs: ["Road Warden"],
      },
      turnIntent:
        "Record the factor's public-service direction so the player can rely on the office route later.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "scene_local",
        topicKind: "procedure",
        speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
        requiresStructuralEffect: false,
      },
      rationale: "The factor's direction is reusable but does not grant access by itself.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Do not invent that the warrant was issued."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(safeResult(invalidRead))
      .mockResolvedValueOnce(safeResult(repairedRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I ask the factor where the harbormaster or conveyance-warrant office is, and which public route I should take.",
        frame: createFrame(),
      }),
    ).resolves.toMatchObject({
      path: "tool_plan",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "procedure",
        requiresStructuralEffect: false,
      },
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("rejects no-mutation structured grounding instead of silently promoting into a tool path", async () => {
    const invalidRead = {
      ...baseRead,
      path: "direct",
      turnGrounding: testTurnGrounding({
        intentKind: "concrete_state_change",
        requiresGrounding: true,
        groundingKind: "scene_beat",
        topicKind: "status",
        durability: "scene_local",
      }),
      sceneQuestion: "Do the raised voices become an inspection dispute?",
      directResolutionNotes:
        "Raised voices become an inspection dispute as a dockworker with a clipboard changes the crate count.",
      rationale: "The pressure can be answered in prose.",
      narrationGuardrails: ["Keep the inspection dispute visible."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction: "I take a detour when I hear raised voices.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/GM Read validation failed/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("rejects broad status-read no-mutation turns instead of repairing the path", async () => {
    const invalidRead = {
      ...baseRead,
      path: "direct",
      sceneQuestion: "What can the player assess from visible officials, bells, fog, and challengers?",
      turnGrounding: testTurnGrounding({
        intentKind: "passive_status_read",
        requiresGrounding: true,
        groundingKind: "observation_read",
        topicKind: "status",
      }),
      actionInterpretation: {
        intent:
          "take stock of visible officials, public bells, ward engines, fog level, and possible challengers",
        targetRefs: [],
      },
      directResolutionNotes:
        "Describe the assessment using established facts: the clerk's fixed attention and the message tube's weight.",
      rationale: "The player is only observing, so prose can answer from existing color.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Do not add new facts."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I take stock: visible officials, public bells, ward engines, fog level, and possible challengers.",
        frame: createFrame({
          recentEvents: [
            {
              id: "recent-pressure",
              tick: 3,
              summary: "Road clerks are watching message traffic at the gate.",
              source: "location_recent_event",
              actorIds: [npcId],
              perceivableByPlayer: true,
            },
          ],
        }),
      }),
    ).rejects.toThrow(/GM Read validation failed/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("rejects actionable NPC handoff answers instead of repairing into a tool path", async () => {
    const invalidRead = {
      ...baseRead,
      path: "direct",
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "procedure",
        durability: "durable",
      }),
      sceneQuestion: "Where does the visible attendant say the anomaly report should go?",
      directResolutionNotes:
        "The Road Warden says station security could take a report and points the player toward lost and found or police.",
      rationale: "The answer is a routine local conversation.",
      narrationGuardrails: ["Keep station security as the next actionable handoff."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I describe the coin as an unverified anomaly and ask where a low-authority courier should take it.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/GM Read validation failed/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("rejects reusable procedural proof answers on direct no-mutation paths", async () => {
    const invalidRead = {
      ...baseRead,
      path: "direct",
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "proof",
        durability: "durable",
      }),
      sceneQuestion: "What proof does the visible authority require?",
      directResolutionNotes:
        "The Lead Warden says Mira needs a seal-verified transit chit, guild waiver, or signal-house dispatch authorisation stamped within twelve hours.",
      rationale: "The answer is a routine local conversation.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Keep the proof requirement visible for the player."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I ask the nearest visible authority what specific proof they require, without arguing or inventing status.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/GM Read validation failed/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("rejects document requirement adjudication on direct no-mutation paths", async () => {
    const invalidRead = {
      ...baseRead,
      path: "direct",
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "proof",
        durability: "durable",
      }),
      sceneQuestion: "Which document fails the stated requirement?",
      directResolutionNotes:
        "The Lead Warden says the courier logbook fails the permit requirement and the sealed lacquer message is not sufficient.",
      rationale: "The answer is a routine local conversation.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Do not invent a valid permit."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I show only the documents I actually have and ask which one fails their requirement.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/passive-status-read-requires-grounded-consequence-path/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("rejects document state transitions on no-mutation paths", () => {
    const issues = validateGmReadForFrame(
      gmReadSchema.parse({
        ...baseRead,
        path: "direct",
        turnGrounding: testTurnGrounding({
          intentKind: "concrete_state_change",
          requiresGrounding: true,
          groundingKind: "state_mutation",
          topicKind: "proof",
          durability: "durable",
        }),
        sceneQuestion: "Does the clerk issue a docket receipt?",
        directResolutionNotes:
          "The clerk issues a docket receipt, stamps the proof reviewed, and attaches a warning rider.",
        narrationGuardrails: ["Keep the reviewed proof visible for later turns."],
      }),
      createFrame(),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "turnGrounding",
          message: expect.stringContaining("document-state-requires-tool-path"),
        }),
      ]),
    );
  });

  it("rejects unsupported player document-state premises before narration treats them as true", () => {
    const issues = validateGmReadForFrame(
      gmReadSchema.parse({
        ...baseRead,
        path: "direct",
        turnGrounding: testTurnGrounding({
          intentKind: "document_state_assumption",
          requiresGrounding: false,
          groundingKind: "none",
          topicKind: "proof",
          durability: "durable",
        }),
        directResolutionNotes:
          "Answer with a local reaction without changing the document.",
      }),
      createFrame(),
      "After the official unsealing, I ask the archive reviewer which docket controls the message.",
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "path",
          message: expect.stringContaining("document-premise-requires-backed-state"),
        }),
      ]),
    );
  });

  it("accepts document-state premises when current item tags back them", () => {
    const issues = validateGmReadForFrame(
      gmReadSchema.parse({
        ...baseRead,
        path: "direct",
        turnGrounding: testTurnGrounding({
          intentKind: "document_state_assumption",
          requiresGrounding: false,
          groundingKind: "none",
          topicKind: "proof",
          durability: "durable",
        }),
        directResolutionNotes: "The clerk gives one local nod.",
      }),
      createFrame({
        playerInventory: [
          {
            id: "current-inventory:item-proof",
            itemId: "item-proof",
            label: "Archive Proof Packet",
            tags: ["document", "officially-unsealed", "reviewed"],
            equipState: "carried",
            equippedSlot: null,
            isSignature: false,
          },
        ],
      }),
      "After the official unsealing, I nod once to the clerk.",
    );

    expect(issues).toEqual([]);
  });

  it("rejects dispatch-contact permission answers on direct no-mutation paths", async () => {
    const invalidRead = {
      ...baseRead,
      situationSummary:
        "The player asks whether they may contact dispatch while staying in place.",
      sceneQuestion: "May the courier send a dispatch message while remaining here?",
      actionInterpretation: {
        intent: "ask permission to send a dispatch message while staying in place",
        targetRefs: ["Road Warden"],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
      }),
      path: "direct",
      directResolutionNotes:
        "The Road Warden says the courier may send one short message to dispatch if they stay beside the desk.",
      rationale: "The answer is a routine local conversation.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Keep the permission available for later turns."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I ask whether I may send a message to my dispatch office while staying in place.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/passive-status-read-requires-grounded-consequence-path/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("rejects watch-for-public-procedure-change answers on direct no-mutation paths", async () => {
    const invalidRead = {
      ...baseRead,
      situationSummary:
        "The player watches whether crowd pressure changes the wardens' procedure.",
      sceneQuestion:
        "Does crowd pressure change the wardens' procedure or create a public announcement?",
      actionInterpretation: {
        intent: "watch for crowd pressure, procedure change, or public announcement",
        targetRefs: ["Road Warden"],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "passive_status_read",
        requiresGrounding: true,
        groundingKind: "observation_read",
        topicKind: "status",
      }),
      path: "direct",
      directResolutionNotes:
        "The crowd pressure is making the wardens adjust procedure and a public announcement may follow.",
      rationale: "The player is only watching, so local prose can answer.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Keep the crowd pressure and procedure change visible."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I watch whether crowd pressure changes the wardens' procedure or creates a public announcement.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/passive-status-read-requires-grounded-consequence-path/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("accepts watch-for-public-procedure-change turns when GM Read chooses a grounded tool plan", async () => {
    const validRead = {
      ...baseRead,
      situationSummary:
        "The player watches whether crowd pressure changes the wardens' procedure.",
      sceneQuestion: "What grounded crowd or authority signal is visible now?",
      actionInterpretation: {
        intent: "watch for crowd pressure, procedure change, or public announcement",
        targetRefs: ["Road Warden"],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "passive_status_read",
        requiresGrounding: true,
        groundingKind: "observation_read",
        topicKind: "status",
      }),
      path: "tool_plan",
      turnIntent:
        "Ground the visible unchanged state, change, announcement, or lack of public shift before narration uses it as a playable update.",
      runtimeRequirement: {
        kind: "observation_read",
        categories: ["crowd", "procedure", "local_status"],
      },
      rationale:
        "A yes/no change in public procedure is a future-relevant situational read, not ambient direct prose.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: [
        "It is valid for nothing to change, but the lack of change must be grounded as the current playable read.",
      ],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I watch whether crowd pressure changes the wardens' procedure or creates a public announcement.",
        frame: createFrame(),
      }),
    ).resolves.toMatchObject({
      path: "tool_plan",
      turnIntent: expect.stringContaining("lack of public shift"),
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("accepts dispatch-contact permission questions when GM Read chooses a grounded tool plan", async () => {
    const validRead = {
      ...baseRead,
      situationSummary:
        "The player asks whether they may contact dispatch while staying in place.",
      sceneQuestion: "What permission or public communication procedure applies here?",
      actionInterpretation: {
        intent: "ask permission to send a dispatch message while remaining in place",
        targetRefs: ["Road Warden"],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "permission",
        durability: "durable",
      }),
      path: "tool_plan",
      turnIntent:
        "Resolve and record the authority response about dispatch contact and whether staying in place is permitted.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "permission",
        speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
      },
      rationale:
        "Permission to contact an office or use a public procedure is reusable logistical adjudication.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: [
        "The authority may allow, refuse, redirect, or require a specific office; do not complete the message without a tool result.",
      ],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I ask whether I may send a message to my dispatch office while staying in place.",
        frame: createFrame(),
      }),
    ).resolves.toMatchObject({
      path: "tool_plan",
      turnIntent: expect.stringContaining("dispatch contact"),
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  });

  it.each(["direct", "continue", "clarification"] as const)(
    "rejects prior procedural fact comparisons on %s no-mutation paths",
    async (path) => {
      const commonRead = {
        ...baseRead,
        situationSummary:
          "The player compares prior public warnings before deciding how to treat contradictions.",
        sceneQuestion: "Which contradiction between the engineer warning and debt clerk claim matters?",
        actionInterpretation: {
          intent: "compare prior procedural warnings and mark contradictions as uncertainty",
          targetRefs: [],
        },
        turnGrounding: testTurnGrounding({
          intentKind: "procedural_information",
          requiresGrounding: true,
          groundingKind: "world_fact",
          topicKind: "procedure",
          durability: "durable",
        }),
        rationale: "The player is only comparing prior statements.",
        evidenceRefs: ["Player", "Road Warden"],
        narrationGuardrails: ["Preserve uncertainty without inventing a conspiracy."],
      } satisfies Omit<GmRead, "path">;
      const invalidRead: GmRead =
        path === "direct"
          ? {
              ...commonRead,
              path,
              directResolutionNotes:
                "The engineer warning and debt clerk claim partly conflict, so mark the difference as uncertainty.",
            }
          : path === "continue"
            ? {
                ...commonRead,
                path,
                continuationGuidance:
                  "Let the player hold the engineer warning and debt clerk claim as unresolved uncertainty.",
              }
            : {
                ...commonRead,
                path,
                clarificationPrompt:
                  "Which prior official claim do you want to compare against the engineer warning?",
              };

      vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

      await expect(
        runGmRead({
          provider,
          playerAction:
            "I compare the engineer's warning with what the debt clerk said, marking contradictions as uncertainty rather than conspiracy.",
          frame: createFrame({
            recentEvents: [
              {
                id: "engineer-warning",
                tick: 3,
                summary:
                  "The ward engineer warned that fourth boiler inspections and route holds are stricter today.",
                source: "location_recent_event",
                actorIds: [npcId],
                perceivableByPlayer: true,
              },
              {
                id: "debt-clerk-claim",
                tick: 2,
                summary:
                  "The debt clerk claimed registry delays were routine and not connected to boiler limits.",
                source: "location_recent_event",
                actorIds: [npcId],
                perceivableByPlayer: true,
              },
            ],
          }),
        }),
      ).rejects.toThrow(/passive-status-read-requires-grounded-consequence-path/);

      expect(safeGenerateObject).toHaveBeenCalledTimes(2);
    },
  );

  it("accepts prior procedural fact comparisons when GM Read chooses a grounded tool plan", async () => {
    const validRead = {
      ...baseRead,
      situationSummary:
        "The player compares prior public warnings before deciding how to treat contradictions.",
      sceneQuestion: "Which contradiction between the engineer warning and debt clerk claim matters?",
      actionInterpretation: {
        intent: "compare prior procedural warnings and mark contradictions as uncertainty",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "world_fact",
        topicKind: "procedure",
        durability: "durable",
      }),
      path: "tool_plan",
      turnIntent:
        "Ground and record the comparison between the engineer warning and debt clerk claim so future route choices can use the uncertainty.",
      runtimeRequirement: {
        kind: "world_fact",
        durability: "durable",
        topicKind: "procedure",
      },
      rationale:
        "The comparison changes reusable procedural understanding and should be grounded before narration uses it later.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Preserve uncertainty without inventing a conspiracy."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I compare the engineer's warning with what the debt clerk said, marking contradictions as uncertainty rather than conspiracy.",
        frame: createFrame({
          recentEvents: [
            {
              id: "engineer-warning",
              tick: 3,
              summary:
                "The ward engineer warned that fourth boiler inspections and route holds are stricter today.",
              source: "location_recent_event",
              actorIds: [npcId],
              perceivableByPlayer: true,
            },
            {
              id: "debt-clerk-claim",
              tick: 2,
              summary:
                "The debt clerk claimed registry delays were routine and not connected to boiler limits.",
              source: "location_recent_event",
              actorIds: [npcId],
              perceivableByPlayer: true,
            },
          ],
        }),
      }),
    ).resolves.toMatchObject({
      path: "tool_plan",
      turnIntent: expect.stringContaining("future route choices"),
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("rejects generic worker status-read clarification instead of asking for a backend target", async () => {
    const invalidRead = {
      ...baseRead,
      situationSummary: "The player asks a nearby low-ranking worker for a public update.",
      sceneQuestion: "Which worker or assistant does the player mean?",
      focalActorRefs: ["Player"],
      actionInterpretation: {
        intent: "ask the nearest low-ranking worker or assistant what changed today",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "status",
        durability: "durable",
      }),
      path: "clarification",
      clarificationPrompt: "Which worker or assistant do you mean?",
      rationale: "The exact service worker is not named.",
      evidenceRefs: ["Player"],
      narrationGuardrails: ["Do not mention hidden private actors."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I ask the nearest low-ranking worker or assistant what changed today without mentioning chakra, Naruto, Konoha, or hidden villages.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/passive-status-read-requires-grounded-consequence-path/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("accepts generic worker status reads when GM Read chooses a grounded tool plan", async () => {
    const validRead = {
      ...baseRead,
      situationSummary: "The player asks a plausible current-scene worker for a public update.",
      sceneQuestion: "What public, worker-level answer or refusal can be grounded for this scene?",
      focalActorRefs: ["Player"],
      actionInterpretation: {
        intent: "ask the nearest low-ranking worker or assistant what changed today",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "status",
        durability: "durable",
      }),
      path: "tool_plan",
      turnIntent:
        "Resolve a plausible current-scene worker or assistant and record their observable answer, refusal, silence, or warning.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "status",
        speakerBinding: {
          kind: "prose_role",
          requestedRoleText: "nearest low-ranking worker or assistant",
          allowCreateSceneExtra: true,
        },
      },
      rationale:
        "The service-role question should produce a grounded public update rather than a backend target clarification.",
      evidenceRefs: ["Player"],
      narrationGuardrails: ["The worker knows only public-facing changes."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I ask the nearest low-ranking worker or assistant what changed today without mentioning chakra, Naruto, Konoha, or hidden villages.",
        frame: createFrame(),
      }),
    ).resolves.toMatchObject({
      path: "tool_plan",
      turnIntent: expect.stringContaining("worker or assistant"),
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("rejects public notice-board clerk clarification for a procedural status request", async () => {
    const invalidRead = {
      ...baseRead,
      situationSummary: "The player asks a public service role about postings today.",
      sceneQuestion: "Which exact notice-board clerk does the player mean?",
      focalActorRefs: ["Player"],
      actionInterpretation: {
        intent: "ask the nearest notice-board clerk whether any public posting changed today",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "status",
        durability: "durable",
      }),
      path: "clarification",
      clarificationPrompt: "Which exact notice-board clerk should answer whether any posting changed today?",
      rationale: "The exact clerk actor is not already listed.",
      evidenceRefs: ["Player"],
      narrationGuardrails: ["Do not invent a public posting change."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I ask the nearest notice-board clerk whether any public posting was added, removed, or amended today.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/turn-grounding-runtime-contract-mismatch|passive-status-read-requires-grounded-consequence-path/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("accepts public notice-board clerk status requests as grounded tool plans", async () => {
    const validRead = {
      ...baseRead,
      situationSummary: "The player asks a plausible public service role about postings today.",
      sceneQuestion: "What public posting answer, refusal, or no-current-answer can be grounded here?",
      focalActorRefs: ["Player"],
      actionInterpretation: {
        intent: "ask the nearest notice-board clerk whether any public posting changed today",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "status",
        durability: "durable",
      }),
      path: "tool_plan",
      turnIntent:
        "Resolve a bounded public service responder or record no-current-answer, then ground the posting status for future route choices.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "status",
        speakerBinding: {
          kind: "prose_role",
          requestedRoleText: "nearest notice-board clerk",
          allowCreateSceneExtra: true,
        },
      },
      rationale:
        "A notice-board clerk question in a public scene is reusable procedural/status information, not a backend identity clarification.",
      evidenceRefs: ["Player"],
      narrationGuardrails: ["The responder may answer, refuse, redirect, or have no current answer."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I ask the nearest notice-board clerk whether any public posting was added, removed, or amended today.",
        frame: createFrame(),
      }),
    ).resolves.toMatchObject({
      path: "tool_plan",
      turnIntent: expect.stringContaining("public service responder"),
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("rejects reusable procedural dialogue tool plans with scene-local durability", () => {
    const invalidRead = {
      ...baseRead,
      situationSummary: "The player asks a road warden which public office can give a real route answer.",
      sceneQuestion: "Which office or route answer can the warden ground for later choices?",
      focalActorRefs: ["Player", "Road Warden"],
      actionInterpretation: {
        intent: "ask which office can provide the real route answer",
        targetRefs: ["Road Warden"],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "procedural_information",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "procedure",
        durability: "durable",
      }),
      path: "tool_plan",
      turnIntent: "Record the warden answer so the player can choose a lawful office route.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "scene_local",
        topicKind: "procedure",
      },
      rationale: "The answer is only for the immediate exchange.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Do not invent a completed route."],
    } satisfies GmRead;

    const issues = validateGmReadForFrame(
      invalidRead,
      createFrame(),
      "I ask the road warden which public office can give me the real route answer.",
    );

    expect(issues).toContainEqual(expect.objectContaining({
      path: "runtimeRequirement.durability",
      message: expect.stringContaining("reusable-dialogue-requires-durable-requirement"),
    }));
  });

  it("rejects applicable posted-item questions on direct no-mutation paths", async () => {
    const invalidRead = {
      ...baseRead,
      situationSummary: "The player asks a clerk which posted item applies to a sealed message.",
      sceneQuestion: "Which posted item applies to the sealed message?",
      focalActorRefs: ["Player"],
      actionInterpretation: {
        intent: "ask a clerk to identify which posted item applies to the sealed message",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "posted_proof_applicability",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "proof",
        durability: "durable",
      }),
      path: "direct",
      directResolutionNotes: "The clerk answers from ambient current facts without a tool path.",
      rationale: "The answer is local.",
      evidenceRefs: ["Player"],
      narrationGuardrails: ["The answer may matter later."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I ask the clerk to identify which posted item, if any, actually applies to my sealed message.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/passive-status-read-requires-grounded-consequence-path/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("accepts applicable posted-item questions as grounded tool plans", async () => {
    const validRead = {
      ...baseRead,
      situationSummary: "The player asks a public clerk which posted item applies to a sealed message.",
      sceneQuestion: "What clerk answer, refusal, redirect, or no-current-answer can be grounded here?",
      focalActorRefs: ["Player"],
      actionInterpretation: {
        intent: "ask a clerk to identify which posted item applies to the sealed message",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "posted_proof_applicability",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "proof",
        durability: "durable",
      }),
      path: "tool_plan",
      turnIntent:
        "Resolve a plausible current-scene clerk or record no-current-answer, then record the posted-item/proof answer for future route choices.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
        speakerBinding: {
          kind: "prose_role",
          requestedRoleText: "clerk",
          allowCreateSceneExtra: true,
        },
      },
      rationale:
        "Which posted item applies to a carried document is reusable proof/procedure adjudication, not direct prose.",
      evidenceRefs: ["Player"],
      narrationGuardrails: [
        "The clerk may answer, refuse, redirect to the registry, or say no posted item applies here.",
      ],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I ask the clerk to identify which posted item, if any, actually applies to my sealed message.",
        frame: createFrame(),
      }),
    ).resolves.toMatchObject({
      path: "tool_plan",
      runtimeRequirement: { kind: "dialogue_outcome", topicKind: "proof" },
      turnIntent: expect.stringContaining("posted-item/proof answer"),
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("rejects applicable posted-item tool plans without dialogue proof grounding", async () => {
    const invalidRead = {
      ...baseRead,
      situationSummary: "The player asks a public clerk which posted item applies to a sealed message.",
      sceneQuestion: "What public record observation applies here?",
      focalActorRefs: ["Player"],
      actionInterpretation: {
        intent: "ask a clerk to identify which posted item applies to the sealed message",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "posted_proof_applicability",
        requiresGrounding: true,
        groundingKind: "dialogue_outcome",
        topicKind: "proof",
        durability: "durable",
      }),
      path: "tool_plan",
      turnIntent:
        "Look up posted signs and summarize the applicable record without recording a clerk outcome.",
      runtimeRequirement: {
        kind: "observation_read",
        categories: ["public_records"],
      },
      rationale: "A public-record read is enough.",
      evidenceRefs: ["Player"],
      narrationGuardrails: ["The answer may matter later."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction:
          "I ask the clerk to identify which posted item, if any, actually applies to my sealed message.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/posted-proof-request-requires-dialogue-outcome/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it.each([
    "I ask the clerk which greeting applies to this festival.",
    "I ask a local which song applies to the mood.",
    "I ask what message is written on the ribbon.",
  ])("does not force weak applies/message wording into tool_plan: %s", async (playerAction) => {
    const validRead = {
      ...baseRead,
      situationSummary: "The player asks a local low-stakes conversational question.",
      sceneQuestion: "What local color answer is available?",
      actionInterpretation: {
        intent: "ask a low-stakes conversational question",
        targetRefs: ["Road Warden"],
      },
      path: "direct",
      directResolutionNotes: "Answer with local color only.",
      rationale: "The action is conversational and not a posted proof applicability request.",
      evidenceRefs: ["Player", "Road Warden"],
      narrationGuardrails: ["Keep the answer local."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validRead));

    await expect(
      runGmRead({
        provider,
        playerAction,
        frame: createFrame(),
      }),
    ).resolves.toMatchObject({ path: "direct" });

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0]?.prompt).toContain(
      "NO-MUTATION ADMISSIBILITY CHECK",
    );
  });

  it("rejects public indicated route clarification that tries to carry future pressure", async () => {
    const invalidRead = {
      ...baseRead,
      situationSummary: "The player tries to follow a public indicated route.",
      sceneQuestion: "Which holding point becomes safest as the public route shifts?",
      focalActorRefs: ["Player"],
      actionInterpretation: {
        intent: "follow a public indicated route toward the safest named office or holding point",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "concrete_state_change",
        requiresGrounding: true,
        groundingKind: "state_mutation",
        topicKind: "route",
        durability: "scene_local",
      }),
      path: "clarification",
      clarificationPrompt: "Which safest holding point should the public route commit you toward?",
      rationale: "The safest office wording is not an exact backend route id.",
      evidenceRefs: ["Player"],
      narrationGuardrails: ["Keep the public route pressure visible for later choices."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction: "I follow only a public, indicated route toward the safest named office or holding point.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/turn-grounding-runtime-contract-mismatch/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("accepts public indicated route movement as a grounded tool plan", async () => {
    const validRead = {
      ...baseRead,
      situationSummary: "The player follows a public indicated route toward the safest lawful office.",
      sceneQuestion: "Which legal movement or blocked-route outcome can be grounded now?",
      focalActorRefs: ["Player"],
      actionInterpretation: {
        intent: "follow a public indicated route toward the safest named office or holding point",
        targetRefs: [],
      },
      turnGrounding: testTurnGrounding({
        intentKind: "concrete_state_change",
        requiresGrounding: true,
        groundingKind: "state_mutation",
        topicKind: "route",
        durability: "scene_local",
      }),
      path: "tool_plan",
      turnIntent:
        "Resolve legal route options, move along a confirmed public route, or record a grounded blocked/no-current-route outcome.",
      runtimeRequirement: {
        kind: "state_mutation",
        effectKind: "movement",
      },
      rationale: "Low-risk public navigation should bridge through route tools instead of asking for backend route ids.",
      evidenceRefs: ["Player"],
      narrationGuardrails: ["Do not complete movement without a valid route or blocked-route tool result."],
    } satisfies GmRead;

    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(validRead));

    await expect(
      runGmRead({
        provider,
        playerAction: "I follow only a public, indicated route toward the safest named office or holding point.",
        frame: createFrame(),
      }),
    ).resolves.toMatchObject({
      path: "tool_plan",
      turnIntent: expect.stringContaining("blocked/no-current-route"),
      runtimeRequirement: { kind: "state_mutation", effectKind: "movement" },
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("does not secretly promote invalid no-mutation reads in backend", async () => {
    const invalidRead = {
      ...baseRead,
      path: "direct",
      turnGrounding: testTurnGrounding({
        intentKind: "concrete_state_change",
        requiresGrounding: true,
        groundingKind: "scene_beat",
        topicKind: "status",
        durability: "scene_local",
      }),
      sceneQuestion: "Do the raised voices become an inspection dispute?",
      directResolutionNotes:
        "Raised voices become an inspection dispute as a dockworker with a clipboard changes the crate count.",
      rationale: "The pressure can be answered in prose.",
      narrationGuardrails: ["Keep the inspection dispute visible."],
    } satisfies GmRead;
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(invalidRead));

    await expect(
      runGmRead({
        provider,
        playerAction: "I take a detour when I hear raised voices.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/GM Read validation failed/);
    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("rejects invented evidence-only refs instead of sanitizing them", async () => {
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

    await expect(
      runGmRead({
        provider,
        playerAction: "I offer one registry chit for quiet lawful guidance.",
        frame: createFrame(),
      }),
    ).rejects.toThrow(/evidenceRefs\.1 uses a backend-only ref/);

    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
  });
});
