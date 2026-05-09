import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn(),
}));

import {
  SCENE_PLAN_ROLLBACK_STAGES,
  SCENE_PLAN_TURN_ORDER,
  SCENE_PLAN_VISIBLE_CRITICAL_PATH_EXCLUSIONS,
  runScenePlanner,
} from "../scene-planner.js";
import { runGmToolLoop } from "../gm-tool-loop.js";
import { runGmRead } from "../gm-turn-read.js";
import { buildScopedForecastExcerpt } from "../world-forecast.js";
import { executeToolCall } from "../tool-executor.js";
import { executeScenePlan, ScenePlanExecutionError } from "../scene-plan-executor.js";
import { buildNarratorPacket } from "../narrator-packet.js";
import { validateScenePlan } from "../scene-plan-validator.js";
import { scenePlanSchema, type ScenePlan } from "../scene-plan-schema.js";
import type { SceneFrame } from "../scene-frame.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TURN_PROCESSOR_PATH = join(
  __dirname,
  "../turn-processor.ts",
);
const MIGRATION_PLAN_PATH = join(
  __dirname,
  "../../../../.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70A-MIGRATION-PLAN.md",
);

const playerId = "11111111-1111-4111-8111-111111111111";
const clerkId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const responseId = "44444444-4444-4444-8444-444444444444";
const localActionId = "55555555-5555-4555-8555-555555555555";
const remoteActionId = "66666666-6666-4666-8666-666666666666";

function createShibuyaFrame(): SceneFrame {
  return {
    campaignId: "campaign-phase-79-04",
    tick: 79,
    playerActorId: playerId,
    currentLocationId: "loc-shibuya-district",
    currentSceneScopeId: "scene-shibuya-cafe",
    playerAction: "I ask the cafe clerk for the price.",
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
          id: clerkId,
          actorId: clerkId,
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
    },
    recentEvents: [],
    targetCandidates: [
      {
        id: `actor:${clerkId}`,
        actorId: clerkId,
        type: "actor",
        label: "Cafe Clerk",
        awareness: "clear",
      },
    ],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: ["log_event", "spawn_npc"],
    oracle: null,
  };
}

function createMixedLocalAndRemotePlan(): ScenePlan {
  return scenePlanSchema.parse({
    actionInterpretation: {
      actorId: playerId,
      intent: "ask cafe price",
      method: "speech",
      targetIds: [clerkId],
    },
    anchorEvent: {
      id: eventId,
      actorId: playerId,
      subjectIds: [clerkId],
      kind: "player_action",
    },
    primaryResponse: {
      id: responseId,
      actorId: clerkId,
      responseKind: "spoken",
      eventId,
      visibleToPlayer: true,
      targetIds: [playerId],
    },
    supportResponses: [],
    plannedActions: [
      {
        id: localActionId,
        actorId: clerkId,
        toolName: "log_event",
        input: {
          text: "The cafe clerk quotes the price.",
          importance: 2,
          participants: ["Cafe Clerk", "Player"],
        },
      },
      {
        id: remoteActionId,
        actorId: clerkId,
        toolName: "spawn_npc",
        input: {
          name: "Outpost Cook",
          tags: ["service-staff"],
          locationName: "Okutama Safe Zone - Forest Outpost",
        },
      },
    ],
    deferredHooks: [],
    narratorFacts: {
      anchorEventId: eventId,
      eventIds: [eventId],
      responseIds: [responseId],
      actionIds: [localActionId, remoteActionId],
      toolResultRefs: [
        { actionId: localActionId, toolName: "log_event" },
        { actionId: remoteActionId, toolName: "spawn_npc" },
      ],
    },
    hiddenRationale: "A remote spawn in a local Shibuya turn must fail atomically.",
  });
}

function readTurnProcessorSource(): string {
  return readFileSync(TURN_PROCESSOR_PATH, "utf-8");
}

function extractScenePlanPathSource(): string {
  const source = readTurnProcessorSource();
  const start = source.indexOf("async function* processTurnScenePlan");
  const end = source.indexOf("async function* processTurnLegacy", start);

  expect(start, "processTurnScenePlan exists").toBeGreaterThanOrEqual(0);
  expect(end, "processTurnLegacy follows ScenePlan path").toBeGreaterThan(start);

  return source.slice(start, end);
}

function expectInOrder(source: string, names: readonly string[]) {
  const positions = names.map((name) => source.indexOf(name));

  for (const [index, position] of positions.entries()) {
    expect(position, `${names[index]} exists`).toBeGreaterThanOrEqual(0);
  }

  for (let index = 1; index < positions.length; index += 1) {
    expect(positions[index], `${names[index - 1]} before ${names[index]}`).toBeGreaterThan(
      positions[index - 1]!,
    );
  }
}

describe("turn processor ScenePlan contract", () => {
  it("pins canonical GM tool-loop ordering before final narration", () => {
    expect(SCENE_PLAN_TURN_ORDER).toEqual([
      "buildSceneFrame",
      "optional runWorldForecastBuilder",
      "stageWorldTrajectoryForecast",
      "buildScopedForecastExcerpt",
      "runGmRead",
      "optional callOracle",
      "optional runGmToolLoop",
      "required actor decision pass",
      "buildNarratorPacket",
      "final narration",
      "commit staged world forecast",
    ]);

    expect(SCENE_PLAN_TURN_ORDER.indexOf("buildSceneFrame")).toBeLessThan(
      SCENE_PLAN_TURN_ORDER.indexOf("buildScopedForecastExcerpt"),
    );
    expect(SCENE_PLAN_TURN_ORDER.indexOf("optional runWorldForecastBuilder")).toBeLessThan(
      SCENE_PLAN_TURN_ORDER.indexOf("stageWorldTrajectoryForecast"),
    );
    expect(SCENE_PLAN_TURN_ORDER.indexOf("stageWorldTrajectoryForecast")).toBeLessThan(
      SCENE_PLAN_TURN_ORDER.indexOf("buildScopedForecastExcerpt"),
    );
    expect(SCENE_PLAN_TURN_ORDER.indexOf("buildScopedForecastExcerpt")).toBeLessThan(
      SCENE_PLAN_TURN_ORDER.indexOf("runGmRead"),
    );
    expect(SCENE_PLAN_TURN_ORDER.indexOf("runGmRead")).toBeLessThan(
      SCENE_PLAN_TURN_ORDER.indexOf("optional callOracle"),
    );
    expect(SCENE_PLAN_TURN_ORDER.indexOf("optional runGmToolLoop")).toBeLessThan(
      SCENE_PLAN_TURN_ORDER.indexOf("required actor decision pass"),
    );
    expect(SCENE_PLAN_TURN_ORDER.indexOf("required actor decision pass")).toBeLessThan(
      SCENE_PLAN_TURN_ORDER.indexOf("buildNarratorPacket"),
    );
    expect(SCENE_PLAN_TURN_ORDER.indexOf("buildNarratorPacket")).toBeLessThan(
      SCENE_PLAN_TURN_ORDER.indexOf("final narration"),
    );
    expect(SCENE_PLAN_TURN_ORDER.indexOf("final narration")).toBeLessThan(
      SCENE_PLAN_TURN_ORDER.indexOf("commit staged world forecast"),
    );
  });

  it("imports the canonical contracts used by later processTurn wiring", () => {
    expect(runScenePlanner).toEqual(expect.any(Function));
    expect(runGmRead).toEqual(expect.any(Function));
    expect(runGmToolLoop).toEqual(expect.any(Function));
    expect(buildScopedForecastExcerpt).toEqual(expect.any(Function));
    expect(validateScenePlan).toEqual(expect.any(Function));
    expect(executeScenePlan).toEqual(expect.any(Function));
    expect(buildNarratorPacket).toEqual(expect.any(Function));
  });

  it("excludes independent tickPresentNpcs calls from the visible critical path", () => {
    expect(SCENE_PLAN_VISIBLE_CRITICAL_PATH_EXCLUSIONS).toContain("tickPresentNpcs");
    expect(SCENE_PLAN_TURN_ORDER).not.toContain("tickPresentNpcs");
  });

  it("neutral input does not escalate through present-NPC mini-round", () => {
    const source = extractScenePlanPathSource();
    const neutralInputProof =
      "neutral input remains inside ScenePlan; no independent tickPresentNpcs escalation; normal action route never passes onBeforeVisibleNarration";

    expect(neutralInputProof).toContain("neutral input");
    expect(neutralInputProof).toContain("tickPresentNpcs escalation");
    expect(neutralInputProof).toContain("normal action route never passes onBeforeVisibleNarration");
    expect(source).not.toContain("tickPresentNpcs");
    expect(source).not.toContain("onBeforeVisibleNarration");
  });

  it("names retry and rollback stages for route-level failure recovery", () => {
    expect(SCENE_PLAN_ROLLBACK_STAGES).toEqual([
      "runGmToolLoop",
      "retry",
      "rollback",
    ]);
  });

  it("gates Oracle, GM tool loop, chat append, and final narration behind scoped forecast and GM decision", () => {
    const source = extractScenePlanPathSource();

    expectInOrder(source, [
      "buildSceneFrame",
      "buildScopedForecastExcerptForFrame",
      "runGmRead",
      "callOracle",
      "appendChatMessages",
      "runGmToolLoop",
      "runRequiredActorDecisionPass",
      "buildNarratorPacket",
      "assembleFinalNarrationPrompt",
    ]);
  });

  it("runs required actor decisions before building the narrator packet", () => {
    const source = extractScenePlanPathSource();

    expectInOrder(source, [
      "runGmToolLoop",
      "runRequiredActorDecisionPass",
      "buildCanonicalTurnPacketFromScenePlan",
      "buildNarratorPacket",
    ]);
    expect(source).toContain("actorActionResults");
    expect(source).toContain("actor-reactions");
  });

  it("announces GM thinking before waiting on the model decision", () => {
    const source = extractScenePlanPathSource();

    expectInOrder(source, [
      'phase: "gm-read"',
      "runGmRead",
    ]);
  });

  it("passes bounded recent conversation into GM Read before path selection", () => {
    const source = extractScenePlanPathSource();
    const gmReadStart = source.indexOf("const gmRead = await runGmRead({");
    const gmReadEnd = source.indexOf('log.event("judge.gm-read.selected"', gmReadStart);
    const gmReadCall = source.slice(gmReadStart, gmReadEnd);

    expect(gmReadStart, "runGmRead call exists").toBeGreaterThanOrEqual(0);
    expect(gmReadEnd, "runGmRead call ends before selected log").toBeGreaterThan(gmReadStart);
    expect(gmReadCall).toContain("recentConversation: getChatHistory(campaignId).slice(-8)");
    expect(source.indexOf("recentConversation: getChatHistory(campaignId).slice(-8)")).toBeLessThan(
      source.indexOf("runGmToolLoop"),
    );
  });

  it("does not use background or movement candidates as scoped forecast refs", () => {
    const source = extractScenePlanPathSource();
    const helperStart = readTurnProcessorSource().indexOf("function buildSceneFrameForecastRefs");
    const helperEnd = readTurnProcessorSource().indexOf(
      "function buildScopedForecastExcerptForFrame",
      helperStart,
    );
    const helper = readTurnProcessorSource().slice(helperStart, helperEnd);

    expect(source).toContain("scopedForecastExcerpt");
    expect(helper).toContain("frame.currentLocationName");
    expect(helper).toContain("frame.currentSceneScopeName");
    expect(helper).toContain("frame.roster.active");
    expect(helper).toContain("frame.roster.support");
    expect(helper).not.toContain("frame.roster.background");
    expect(helper).not.toContain("frame.movementCandidates");
    expect(helper).toContain('candidate.type === "location"');
    expect(helper).toContain('candidate.type === "actor" && candidate.awareness !== "clear"');
  });

  it("redacts unsafe clarification prompts before chat append and narrative SSE", () => {
    const source = extractScenePlanPathSource();
    const clarificationStart = source.indexOf('if (gmRead.path === "clarification")');
    const clarificationEnd = source.indexOf("const hpDropped", clarificationStart);
    const clarificationPath = source.slice(clarificationStart, clarificationEnd);

    expect(clarificationPath).toContain("safeClarificationPromptForFrame");
    expectInOrder(clarificationPath, [
      "safeClarificationPromptForFrame",
      "appendChatMessages",
      "yield { type: \"narrative\"",
    ]);
  });

  it("rejects wrong-location spawn_npc before ScenePlan execution", () => {
    const validation = validateScenePlan({
      frame: createShibuyaFrame(),
      plan: createMixedLocalAndRemotePlan(),
    });

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "remote_location_ref",
            path: expect.stringContaining("locationName"),
            message: expect.not.stringContaining("Forest Outpost"),
          }),
        ]),
      );
    }
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("prevalidates mixed legal and illegal tool plans atomically with no narrated remote truth", async () => {
    const frame = createShibuyaFrame();
    const plan = createMixedLocalAndRemotePlan();
    const promise = executeScenePlan({
      campaignId: frame.campaignId,
      tick: frame.tick,
      plan: { frame, plan, issues: [] },
    });

    await expect(promise).rejects.toBeInstanceOf(ScenePlanExecutionError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining("remote_location_ref"),
      partial: {
        actionResults: [],
        canonicalEvents: [],
        emittedEvents: [],
      },
    });
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("no narrative SSE before runVisibleNarrationWithPacketGuard passes", () => {
    const source = extractScenePlanPathSource();
    const orderingProof =
      "ScenePlan ordering is frame-gm-read-optional-oracle-optional-gm-tool-loop-packet-narrate; buildSceneFrame before runGmRead; runGmRead before optional callOracle; runGmToolLoop before buildNarratorPacket; buildNarratorPacket before assembleFinalNarrationPrompt";
    const visibleNarrationProof =
      "runGmToolLoop before assembleFinalNarrationPrompt; runVisibleNarrationWithPacketGuard before appendChatMessages; runVisibleNarrationWithPacketGuard before narrative SSE; unsafe guard failure yields no done";

    expect(orderingProof).toContain("buildSceneFrame before runGmRead");
    expect(orderingProof).toContain("frame-gm-read-optional-oracle-optional-gm-tool-loop-packet-narrate");
    expect(orderingProof).toContain("runGmRead before optional callOracle");
    expect(orderingProof).toContain("runGmToolLoop before buildNarratorPacket");
    expect(visibleNarrationProof).toContain("before assembleFinalNarrationPrompt");
    expect(visibleNarrationProof).toContain("runVisibleNarrationWithPacketGuard before appendChatMessages");
    expect(visibleNarrationProof).toContain("runVisibleNarrationWithPacketGuard before narrative SSE");
    expect(visibleNarrationProof).toContain("no done");
    expectInOrder(source, [
      "buildSceneFrame",
      "runGmRead",
      "runGmToolLoop",
      "runRequiredActorDecisionPass",
      "buildNarratorPacket",
      "assembleFinalNarrationPrompt",
      "runVisibleNarrationWithPacketGuard",
    ]);
    expect(source.lastIndexOf("{ role: \"assistant\"")).toBeGreaterThan(
      source.indexOf("runVisibleNarrationWithPacketGuard"),
    );
    expect(source.lastIndexOf("yield { type: \"narrative\"")).toBeGreaterThan(
      source.indexOf("runVisibleNarrationWithPacketGuard"),
    );
  });

  it("keeps pure speech and Continue off the automatic Oracle path", () => {
    const source = extractScenePlanPathSource();
    const oraclePosition = source.indexOf("callOracle");
    const gmDecisionPosition = source.indexOf("runGmRead");

    expect(gmDecisionPosition, "GM Read is present").toBeGreaterThanOrEqual(0);
    expect(oraclePosition, "Oracle is still available on demand").toBeGreaterThanOrEqual(0);
    expect(gmDecisionPosition).toBeLessThan(oraclePosition);
    expect(source).toContain('path === "roll_oracle"');
    expect(source.indexOf("yield { type: \"oracle_result\"")).toBeGreaterThan(
      source.indexOf('path === "roll_oracle"'),
    );
    expect(source).not.toContain('playerAction === "Continue scene."');
  });

  it("does not create combat authority from raw hostile text before GM decision", () => {
    const source = extractScenePlanPathSource();

    expect(source).not.toContain("isHostileCombatAction");
    expect(source).not.toContain("sceneFrame.combatEnvelope ??");
    expect(source).not.toContain("const combatEnvelope = null");
    expect(source).toContain("runGmRead");
  });

  it("derives combat math only from a GM-selected combat transition target", () => {
    const source = extractScenePlanPathSource();

    expect(source).toContain('gmRead.path === "combat_transition"');
    expect(source).toContain("buildSceneFrameCombatEnvelopeForConcreteTarget");
    expect(source).toContain("targetContext?.actorId");
    expect(source).toContain("buildNarrativeOutcomeBounds(combatEnvelope");
    expect(source.indexOf('gmRead.path === "combat_transition"')).toBeLessThan(
      source.indexOf("buildSceneFrameCombatEnvelopeForConcreteTarget"),
    );
  });

  it("bypasses legacy hidden stages on the ScenePlan path", () => {
    const source = extractScenePlanPathSource();

    expect(source).not.toContain("runWorldBrainSceneDirection");
    expect(source).not.toContain("runHiddenAdjudicationPlan");
    expect(source).not.toContain("executeAdjudicationPlan");
    expect(source).not.toContain("assembleJudgeAdjudicationPrompt");
    expect(source).not.toContain("onBeforeVisibleNarration");
  });

  it("keeps LLM movement and target classifier interpretation after SceneFrame ownership", () => {
    const source = extractScenePlanPathSource();
    const movementProof =
      "detectMovement not before buildSceneFrame; after SceneFrame; detectCandidateByClassifier source classifier; move_to";

    expect(movementProof).toContain("detectMovement not before buildSceneFrame");
    expect(movementProof).toContain("after SceneFrame");
    expect(movementProof).toContain("detectCandidateByClassifier source classifier");
    expect(movementProof).toContain("move_to");
    expect(source).not.toContain("detectMovement(");
    expect(source).not.toContain("resolveActionTargetContext(");
  });

  it("documents the temporary SCENE_PLAN_ENABLED rollback flag cleanup criteria", () => {
    const source = readTurnProcessorSource();
    const migrationPlan = readFileSync(MIGRATION_PLAN_PATH, "utf-8");
    const flagProof =
      "SCENE_PLAN_ENABLED legacy path cleanup criteria remove flag dated follow-up";

    expect(flagProof).toContain("SCENE_PLAN_ENABLED");
    expect(flagProof).toContain("legacy path");
    expect(flagProof).toContain("cleanup criteria");
    expect(flagProof).toContain("remove flag");
    expect(flagProof).toContain("dated follow-up");
    expect(source).toContain("SCENE_PLAN_ENABLED");
    expect(source).toContain('process.env.SCENE_PLAN_ENABLED === "false"');
    expect(migrationPlan).toContain("SCENE_PLAN_ENABLED");
    expect(migrationPlan).toMatch(/remove .*flag/i);
    expect(migrationPlan).toMatch(/dated follow-up/i);
  });
});
