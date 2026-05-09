import { beforeEach, describe, expect, it, vi } from "vitest";

const { logEventMock } = vi.hoisted(() => ({
  logEventMock: vi.fn(),
}));

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn(),
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    event: logEventMock,
  })),
  withRole: vi.fn(async (_role: string, fn: () => unknown) => await fn()),
}));

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel } from "../../ai/provider-registry.js";
import { withRole } from "../../lib/index.js";
import {
  WORLD_BRAIN_MAX_BACKGROUND_ACTORS,
  WORLD_BRAIN_MAX_CAUSAL_BEATS,
  WORLD_BRAIN_MAX_GUARDRAILS,
  WORLD_BRAIN_MAX_PRESENCE_REASONS,
  buildWorldBrainPrompt,
  formatHiddenWorldBrainDirectionBlock,
  formatPlayerPerceivableWorldBrainDirectionBlock,
  formatWorldBrainNarrationGuardrails,
  runWorldBrainSceneDirection,
  sanitizeWorldBrainSceneDirection,
  worldBrainSceneDirectionSchema,
  toPlayerPerceivableWorldBrainDirection,
  type WorldBrainSceneDirection,
  type WorldBrainSceneSeed,
} from "../world-brain.js";
import { buildWorldBrainPromptContract } from "../prompt-contracts.js";

function createDirection(
  overrides: Partial<WorldBrainSceneDirection> = {},
): WorldBrainSceneDirection {
  return {
    situationSummary: "A tense contact pocket forms around the player.",
    sceneQuestion: "Who commits first?",
    focalActorNames: ["Hero", "Nanami"],
    backgroundActorNames: ["Choso"],
    presenceReasons: [
      {
        actorName: "Hero",
        reason: "The player arrival is the local pivot.",
        perceivable: true,
      },
      {
        actorName: "Nanami",
        reason: "Nanami is already holding the line in the visible scene.",
        perceivable: true,
      },
      {
        actorName: "Choso",
        reason: "A hidden observer is tracking the scene from above.",
        perceivable: false,
      },
    ],
    causalBeats: [
      {
        summary: "Nanami measures intent before escalating.",
        perceivable: true,
      },
      {
        summary: "A hidden observer is deciding whether to surface.",
        perceivable: false,
      },
    ],
    narrationGuardrails: [
      "Keep the narration anchored to the immediate exchange.",
      "Do not reveal hidden actors by name.",
    ],
    ...overrides,
  };
}

function createSeed(overrides: Partial<WorldBrainSceneSeed> = {}): WorldBrainSceneSeed {
  return {
    runSource: "player-turn",
    playerLabel: "Hero",
    sceneName: "Platform 7",
    sceneDescription: "A concrete platform inside a larger station district.",
    sceneTags: ["encounter-scope", "tense"],
    immediateSituation: "Two strangers are reading the player from opposite ends of the platform.",
    entryPressure: ["public space", "unclear allegiance"],
    openingPromptLines: [],
    sceneContextLines: [],
    clearActorNames: ["Nanami", "Choso"],
    hintSignals: ["A pressure shift suggests someone hidden above the platform."],
    recentContextSummaries: ["Train brakes scream through the station."],
    sceneEffectSummaries: ["Nanami squares up beside the player."],
    playerPerceivableConsequences: ["Nanami squares up beside the player."],
    playerAction: "I give my name and nothing else.",
    intent: "hold information",
    method: "coolly",
    oracleOutcome: "weak_hit",
    targetLabel: "Nanami",
    ...overrides,
  };
}

describe("world-brain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createModel).mockReturnValue("judge-model");
  });

  it("sanitizes actor names, dedupes duplicates, and clamps bounded arrays", () => {
    const direction = createDirection({
      focalActorNames: ["Ghost", "Hero", "Nanami", "Hero"],
      backgroundActorNames: ["Choso", "Ghost", "Choso", "Mahito", "Gojo", "Geto"],
      presenceReasons: Array.from({ length: WORLD_BRAIN_MAX_PRESENCE_REASONS + 2 }, (_, index) => ({
        actorName: index % 2 === 0 ? "Hero" : "Choso",
        reason: `Reason ${index}`,
        perceivable: index % 3 === 0,
      })),
      causalBeats: Array.from({ length: WORLD_BRAIN_MAX_CAUSAL_BEATS + 2 }, (_, index) => ({
        summary: `Beat ${index}`,
        perceivable: index % 2 === 0,
      })),
      narrationGuardrails: Array.from({ length: WORLD_BRAIN_MAX_GUARDRAILS + 2 }, (_, index) => `Guardrail ${index}`),
    });

    const sanitized = sanitizeWorldBrainSceneDirection(direction, [
      "Hero",
      "Nanami",
      "Choso",
      "Mahito",
      "Gojo",
    ]);

    expect(sanitized.focalActorNames).toEqual(["Hero", "Nanami"]);
    expect(sanitized.backgroundActorNames).toEqual(["Choso", "Mahito", "Gojo"]);
    expect(sanitized.presenceReasons.length).toBeLessThanOrEqual(WORLD_BRAIN_MAX_PRESENCE_REASONS);
    expect(sanitized.causalBeats).toHaveLength(WORLD_BRAIN_MAX_CAUSAL_BEATS);
    expect(sanitized.narrationGuardrails).toHaveLength(WORLD_BRAIN_MAX_GUARDRAILS);
    expect(sanitized.presenceReasons.every((reason) => ["Hero", "Nanami", "Choso", "Mahito", "Gojo"].includes(reason.actorName))).toBe(true);
  });

  it("exposes a semantic world-brain structured-output contract helper", () => {
    const contract = buildWorldBrainPromptContract();

    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: world-brain.v1");
    expect(contract).toContain("situationSummary");
    expect(contract).toContain("sceneQuestion");
    expect(contract).toContain("focalActorNames");
    expect(contract).toContain("backgroundActorNames");
    expect(contract).toContain("presenceReasons");
    expect(contract).toContain("actorName");
    expect(contract).toContain("reason");
    expect(contract).toContain("perceivable");
    expect(contract).toContain("causalBeats");
    expect(contract).toContain("narrationGuardrails");
    expect(contract).toContain("situationSummary max 240 chars");
    expect(contract).toContain("sceneQuestion max 140 chars");
    expect(contract).toContain("focalActorNames min 1 max 3");
    expect(contract).toContain("backgroundActorNames max 4");
    expect(contract).toContain("presenceReasons max 6");
    expect(contract).toContain("causalBeats max 6");
    expect(contract).toContain("narrationGuardrails max 4");
    expect(contract).toContain("Use [] when no background actors, presence reasons, causal beats, or guardrails are justified.");
    expect(contract).toContain("Compact valid example:");
    expect(contract).toContain("Minimal valid output:");
    expect(contract).toContain("Invalid examples:");
    expect(contract).toContain("missing required field");
    expect(contract).toContain("overlong rationale");
    expect(contract).toContain("Backend authority:");
    expect(contract).toContain("must not invent actors, scene facts, oracle meaning, source roles, or canonical truth");
  });

  it("places the world-brain structured-output contract before scene data", () => {
    const prompt = buildWorldBrainPrompt(createSeed());
    const contractIndex = prompt.indexOf("STRUCTURED_OUTPUT_CONTRACT: world-brain.v1");
    const runSourceIndex = prompt.indexOf("Run source:");

    expect(contractIndex).toBeGreaterThanOrEqual(0);
    expect(contractIndex).toBeLessThan(runSourceIndex);
    expect(prompt).toContain("Required shape:");
    expect(prompt).toContain("situationSummary max 240 chars");
    expect(prompt).toContain("sceneQuestion max 140 chars");
    expect(prompt).toContain("focalActorNames min 1 max 3");
    expect(prompt).toContain("Use [] when no background actors, presence reasons, causal beats, or guardrails are justified.");
    expect(prompt).toContain("Compact valid example:");
    expect(prompt).toContain("Minimal valid output:");
    expect(prompt).toContain("Invalid examples:");
    expect(prompt).toContain("Backend authority:");
    expect(prompt).toContain("must not invent actors, scene facts, oracle meaning, source roles, or canonical truth");
  });

  it("routes overlong bounded fields through a strict repair pass instead of slicing them locally", async () => {
    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce({
        object: createDirection({
          situationSummary:
            "Tiamat stands in a Tokyo ward where cursed energy and chakra pathways overlap while Esdeath's prior barrage lingers and Naruto keeps pressure on the same contact pocket with too much unresolved movement for one compact scene-summary line.",
          sceneQuestion:
            "Will Esdeath escalate her assault in response to Tiamat's dismissive answer while Naruto and the local sorcerers keep re-evaluating the unknown contact in front of them?",
          presenceReasons: [
            {
              actorName: "Hero",
              reason:
                "The player is the unknown contact anchoring the encounter and forcing everyone nearby to decide whether this stays a guarded read or becomes an immediate escalation.",
              perceivable: true,
            },
          ],
          causalBeats: [
            {
              summary:
                "Pressure is already live because one combatant has tested the contact, another is preparing to escalate, and the local defenders are still trying to classify what they are seeing.",
              perceivable: true,
            },
          ],
          narrationGuardrails: [
            "Show the escalation as a readable chain of actions instead of jumping straight to aftermath or implying unseen beats happened between visible lines.",
          ],
        }),
        trace: {
          text: "{\"sceneQuestion\":\"overflow\"}",
          cleanedText: "{\"sceneQuestion\":\"overflow\"}",
          reasoningText: "Initial direction kept too much detail in bounded fields.",
          response: {
            modelId: "glm-5.1",
          },
        },
      } as Awaited<ReturnType<typeof safeGenerateObject>>)
      .mockResolvedValueOnce({
        object: createDirection({
          situationSummary: "Tiamat faces an unstable contact pocket where Esdeath and Naruto are already testing the unknown arrival.",
          sceneQuestion: "Does the contact stay tense, or does someone force open escalation first?",
          presenceReasons: [
            {
              actorName: "Hero",
              reason: "The unknown arrival is the pivot everyone nearby is judging right now.",
              perceivable: true,
            },
          ],
          causalBeats: [
            {
              summary: "Esdeath is poised to escalate while Naruto keeps pressure on the contact.",
              perceivable: true,
            },
          ],
          narrationGuardrails: [
            "Show actions in readable order before describing consequences.",
          ],
        }),
        trace: {
          text: "{\"sceneQuestion\":\"repaired\"}",
          cleanedText: "{\"sceneQuestion\":\"repaired\"}",
          reasoningText: "Compressed the bounded fields without changing actor or tension meaning.",
          response: {
            modelId: "glm-5.1",
          },
        },
      } as Awaited<ReturnType<typeof safeGenerateObject>>);

    const result = await runWorldBrainSceneDirection({
      provider: {
        id: "judge-provider",
        name: "Judge",
        model: "judge-model",
        apiKey: "test",
        baseUrl: "http://localhost",
      },
      seed: createSeed(),
    });

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        schema: worldBrainSceneDirectionSchema,
        prompt: expect.stringContaining("Validation issues:"),
      }),
    );
    expect(logEventMock).toHaveBeenCalledWith(
      "world-brain.repair",
      expect.objectContaining({
        runSource: "player-turn",
        reason: "strict-parse-failed",
      }),
    );
    expect(result.situationSummary).toBe(
      "Tiamat faces an unstable contact pocket where Esdeath and Naruto are already testing the unknown arrival.",
    );
    expect(result.sceneQuestion).toBe(
      "Does the contact stay tense, or does someone force open escalation first?",
    );
  });

  it("filters hidden presence reasons and causal beats for player-perceivable direction", () => {
    const visible = toPlayerPerceivableWorldBrainDirection(createDirection());

    expect(visible.presenceReasons).toEqual([
      {
        actorName: "Hero",
        reason: "The player arrival is the local pivot.",
        perceivable: true,
      },
      {
        actorName: "Nanami",
        reason: "Nanami is already holding the line in the visible scene.",
        perceivable: true,
      },
    ]);
    expect(visible.focalActorNames).toEqual(["Hero", "Nanami"]);
    expect(visible.backgroundActorNames).toEqual([]);
    expect(visible.causalBeats).toEqual([
      {
        summary: "Nanami measures intent before escalating.",
        perceivable: true,
      },
    ]);
  });

  it("formats separate hidden and player-facing world-brain sections", () => {
    const direction = createDirection();

    const hiddenBlock = formatHiddenWorldBrainDirectionBlock(direction);
    const visibleBlock = formatPlayerPerceivableWorldBrainDirectionBlock(direction);
    const guardrailBlock = formatWorldBrainNarrationGuardrails(direction);

    expect(hiddenBlock).toContain("[WORLD-BRAIN SCENE DIRECTION]");
    expect(hiddenBlock).toContain("A hidden observer is deciding whether to surface.");
    expect(visibleBlock).toContain("[SCENE DIRECTION]");
    expect(visibleBlock).toContain("Focal actors: Hero, Nanami");
    expect(visibleBlock).not.toContain("Background actors: Choso");
    expect(visibleBlock).not.toContain("Choso");
    expect(visibleBlock).not.toContain("A hidden observer is deciding whether to surface.");
    expect(guardrailBlock).toContain("[NARRATION GUARDRAILS]");
    expect(guardrailBlock).toContain("Do not reveal hidden actors by name.");
  });

  it("runs through the judge lane and returns a sanitized scene direction", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValue({
      object: createDirection({
        focalActorNames: ["Ghost", "Hero"],
        backgroundActorNames: ["Choso", "Ghost"],
      }),
      trace: {
        text: "{\"sceneQuestion\":\"Who commits first?\"}",
        cleanedText: "{\"sceneQuestion\":\"Who commits first?\"}",
        reasoningText: "Nanami and Choso are the only allowed non-player actors in the pocket.",
        response: {
          modelId: "glm-5.1",
        },
        usage: {
          inputTokens: 321,
          outputTokens: 77,
          totalTokens: 398,
        },
      },
    } as Awaited<ReturnType<typeof safeGenerateObject>>);

    const result = await runWorldBrainSceneDirection({
      provider: {
        id: "judge-provider",
        name: "Judge",
        model: "judge-model",
        apiKey: "test",
        baseUrl: "http://localhost",
      },
      seed: createSeed(),
    });

    expect(withRole).toHaveBeenCalledWith("judge", expect.any(Function));
    expect(createModel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "judge-provider" }),
    );
    expect(safeGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "judge-model",
        prompt: expect.stringContaining("Allowed actor names: Hero, Nanami, Choso"),
      }),
    );
    expect(result.focalActorNames).toEqual(["Hero"]);
    expect(result.backgroundActorNames).toEqual(["Choso"]);
    expect(logEventMock).toHaveBeenCalledWith(
      "world-brain.reasoning",
      expect.objectContaining({
        runSource: "player-turn",
        reasoningText: "Nanami and Choso are the only allowed non-player actors in the pocket.",
        responseModel: "glm-5.1",
        usage: {
          inputTokens: 321,
          outputTokens: 77,
          totalTokens: 398,
        },
      }),
    );
  });
});
