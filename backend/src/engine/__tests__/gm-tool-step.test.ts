import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  executeBridgeCandidateToolMock,
  sqliteExecMock,
  retractStoredEpisodicEventMock,
  retractReflectionBudgetMock,
  retractActorKnowledgeRecordMock,
} = vi.hoisted(() => ({
  executeBridgeCandidateToolMock: vi.fn(),
  sqliteExecMock: vi.fn(),
  retractStoredEpisodicEventMock: vi.fn(),
  retractReflectionBudgetMock: vi.fn(),
  retractActorKnowledgeRecordMock: vi.fn(),
}));

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn(),
}));

vi.mock("../bridge-candidate-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bridge-candidate-tools.js")>();
  const lookupTools = new Set([
    "list_visible_affordances",
    "list_navigation_options",
    "find_location_candidates",
    "find_object_candidates",
    "find_actor_candidates",
    "find_poi_candidates",
    "inspect_known_fact",
    "check_route",
  ]);
  return {
    ...actual,
    executeBridgeCandidateTool: executeBridgeCandidateToolMock,
    isBridgeLookupToolName: (toolName: string) => lookupTools.has(toolName),
    BRIDGE_LOOKUP_TOOL_NAMES: [...lookupTools],
  };
});

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn(() => ({ modelId: "judge-test-model" })),
}));

vi.mock("../../db/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../db/index.js")>();
  return {
    ...actual,
    getSqliteConnection: vi.fn(() => ({
      exec: sqliteExecMock,
    })),
  };
});

vi.mock("../../vectors/episodic-events.js", () => ({
  retractStoredEpisodicEvent: retractStoredEpisodicEventMock,
}));

vi.mock("../reflection-budget.js", () => ({
  retractReflectionBudget: retractReflectionBudgetMock,
}));

vi.mock("../knowledge-model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../knowledge-model.js")>();
  return {
    ...actual,
    retractActorKnowledgeRecord: retractActorKnowledgeRecordMock,
  };
});

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import type { ProviderConfig } from "../../ai/provider-registry.js";
import type { GmActionChecklist } from "../gm-action-checklist.js";
import { executeGmToolSteps, runGmToolStepRevision } from "../gm-tool-step.js";
import type { SceneFrame } from "../scene-frame.js";
import { executeToolCall } from "../tool-executor.js";
import type { ToolResultAuthority } from "../tool-result.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const npcId = "22222222-2222-4222-8222-222222222222";
const sceneId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const locationId = "99999999-9999-4999-8999-999999999999";
const provider: ProviderConfig = {
  id: "test-provider",
  name: "Test Provider",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "test-key",
  model: "judge-model",
};
const sceneBeatRuntimeRequirement = {
  kind: "scene_beat",
  durability: "durable",
  beatKind: "event_log",
} as const;
const supportActorRuntimeRequirement = {
  kind: "state_mutation",
  effectKind: "support_actor_created",
} as const;

function toolAuthority(
  stateDeltaRefs: string[],
  toolResultId = "tool-result-test",
  eventRefs: string[] = [],
): ToolResultAuthority {
  return {
    toolResultId,
    campaignId: "campaign-1",
    sourceEntity: { type: "system", id: "gm-tool-step-test" },
    baseWorldVersion: 4,
    resultWorldVersion: 5,
    elapsedWorldTimeMinutes: 0,
    stateDeltaRefs,
    eventRefs,
    witnesses: [],
    knowledgeOutputs: [],
    visibilityOutputs: [],
    resources: [],
  };
}

function createFrame(overrides: Partial<SceneFrame> = {}): SceneFrame {
  return {
    campaignId: "campaign-1",
    tick: 4,
    playerActorId: playerId,
    currentLocationId: locationId,
    currentSceneScopeId: sceneId,
    playerAction: "Promise the road warden I will return before dusk.",
    roster: {
      active: [
        {
          id: playerId,
          actorId: playerId,
          type: "player",
          label: "Player",
          locationId,
          sceneScopeId: sceneId,
          awareness: "clear",
        },
        {
          id: npcId,
          actorId: npcId,
          type: "npc",
          label: "Road Warden",
          locationId,
          sceneScopeId: sceneId,
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
        id: `actor:${npcId}`,
        actorId: npcId,
        type: "actor",
        label: "Road Warden",
        awareness: "clear",
      },
    ],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: ["log_event", "spawn_npc"],
    oracleContext: null,
    combatEnvelope: null,
    oracle: null,
    ...overrides,
    worldVersion: overrides.worldVersion ?? 0,
  };
}

function logEventStep(overrides: Partial<GmActionChecklist["steps"][number]> = {}) {
  return {
    stepId: "step-1",
    purpose: "Record a promise that should matter later.",
    evidenceRefs: ["Player", "Road Warden"],
    dependsOnStepIds: [],
    expectedVisibleEffect: "The warden treats the promise as real.",
    requiredAction: "runtime_tool",
    status: "pending",
    candidateRefs: ["Player", "Road Warden"],
    candidateToolRequest: {
      toolName: "log_event",
      actorRef: "Player",
      targetRefs: ["Road Warden"],
      input: {
        text: "The player promises the road warden to return before dusk.",
        importance: 6,
        participants: ["Player", "Road Warden"],
        durability: "durable",
        futureRelevance: "The promise can shape future trust.",
      },
    },
    ...overrides,
  } satisfies GmActionChecklist["steps"][number];
}

function checklist(
  steps: GmActionChecklist["steps"] = [logEventStep()],
): GmActionChecklist {
  return {
    version: "gm-action-checklist.v1",
    turnPath: "tool_plan",
    turnIntent: "Record future-relevant local consequences.",
    steps,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(executeToolCall).mockResolvedValue({
    success: true,
    result: {
      eventId: "event-1",
      actorName: "Road Warden",
      durability: "durable",
      persisted: true,
    },
    authority: toolAuthority([], "tool-result-event-1", ["event-1"]),
  });
  executeBridgeCandidateToolMock.mockReturnValue({
    success: true,
    status: "success",
    kind: "observation",
    observationOnly: true,
    result: {
      observationOnly: true,
      candidates: [{ ref: "actor:npc-warden", label: "Road Warden" }],
    },
  });
});

describe("executeGmToolSteps", () => {
  it("executes one backend-validated runtime tool candidate", async () => {
    const frame = createFrame();
    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist(),
      runtimeRequirement: sceneBeatRuntimeRequirement,
    });

    expect(results).toEqual([
      expect.objectContaining({
        stepId: "step-1",
        attempt: 1,
        status: "done",
        toolName: "log_event",
        validationError: null,
        mutationRefs: ["event-1", "Road Warden"],
      }),
    ]);
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(executeToolCall).toHaveBeenCalledWith(
      frame.campaignId,
      "log_event",
      expect.objectContaining({
        text: "The player promises the road warden to return before dusk.",
      }),
      frame.tick,
      undefined,
      expect.objectContaining({
        scope: "player_turn",
        subjectActorId: playerId,
      }),
    );
  });

  it("rolls back a standalone log_event when no typed scene beat receipt boundary is provided", async () => {
    const frame = createFrame();
    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist(),
    });

    expect(results).toEqual([
      expect.objectContaining({
        stepId: "step-1",
        status: "skipped",
        toolName: "log_event",
        result: null,
        mutationRefs: [],
        validationError: expect.objectContaining({
          code: "tool_failed",
          message: expect.stringContaining("typed runtimeRequirement was not provided"),
        }),
      }),
    ]);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_step_/),
    ]);
  });

  it("executes lookup candidates through observation dispatch instead of executeToolCall", async () => {
    const frame = createFrame({ allowedTools: ["find_actor_candidates"] });
    const lookupStep = logEventStep({
      candidateToolRequest: {
        toolName: "find_actor_candidates",
        actorRef: "Player",
        targetRefs: [],
        input: {
          query: "warden",
          maxResults: 4,
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([lookupStep]),
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "done",
        toolName: "find_actor_candidates",
        mutationRefs: [],
        result: expect.objectContaining({
          kind: "observation",
          observationOnly: true,
        }),
      }),
    ]);
    expect(executeBridgeCandidateToolMock).toHaveBeenCalledWith(
      "find_actor_candidates",
      { query: "warden", maxResults: 4 },
      expect.objectContaining({ scope: "player_turn" }),
    );
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("fails closed when candidate tool is outside frame.allowedTools", async () => {
    const frame = createFrame({ allowedTools: ["spawn_npc"] });
    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist(),
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "skipped",
        validationError: expect.objectContaining({
          code: "tool_not_allowed",
          path: "candidateToolRequest.toolName",
        }),
      }),
    ]);
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("allows one revised candidate after schema or grounding rejection", async () => {
    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: true,
      result: { npcId: "npc-gate-witness" },
      authority: toolAuthority(["actor:npc-gate-witness"]),
    });
    const frame = createFrame();
    const spawnStep: GmActionChecklist["steps"][number] = {
      ...logEventStep({ stepId: "step-1" }),
      purpose: "Bring a local witness into the current scene.",
      expectedVisibleEffect: "A witness arrives nearby.",
      candidateToolRequest: {
        toolName: "spawn_npc",
        actorRef: "Player",
        targetRefs: [],
        input: {
          name: "Gate Witness",
          tags: ["witness"],
          locationName: "Remote Outpost",
        },
      },
    };

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([spawnStep]),
      runtimeRequirement: supportActorRuntimeRequirement,
      reviseStep: ({ validationError }) => {
        expect(validationError.code).toBe("schema_invalid");
        return {
          toolName: "spawn_npc",
          targetRefs: [],
          input: {
            name: "Gate Witness",
            tags: ["witness"],
            locationRef: "current_scene",
          },
        };
      },
    });

    expect(results).toEqual([
      expect.objectContaining({
        stepId: "step-1",
        attempt: 2,
        status: "revised",
        toolName: "spawn_npc",
        validationError: null,
      }),
    ]);
    expect(executeToolCall).toHaveBeenCalledWith(
      frame.campaignId,
      "spawn_npc",
      expect.objectContaining({ locationRef: "current_scene" }),
      frame.tick,
      undefined,
      expect.any(Object),
    );
  });

  it("rolls back a side-effecting revision when the original checklist looked observation-only", async () => {
    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: true,
      status: "success",
      result: { entity: "Road Warden", tags: ["trusting-player"] },
      authority: toolAuthority(["npc:road-warden:tag"]),
    });
    const frame = createFrame({
      allowedTools: ["find_actor_candidates", "add_tag"],
    });
    const lookupStep = logEventStep({
      stepId: "step-1",
      candidateToolRequest: {
        toolName: "find_actor_candidates",
        actorRef: "Player",
        targetRefs: [],
        input: {
          query: "",
          maxResults: 4,
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([lookupStep]),
      reviseStep: ({ validationError }) => {
        expect(validationError.code).toBe("schema_invalid");
        return {
          toolName: "add_tag",
          targetRefs: ["Road Warden"],
          input: {
            entityName: "Road Warden",
            entityType: "npc",
            tag: "trusting-player",
          },
        };
      },
    });

    expect(results).toEqual([
      expect.objectContaining({
        stepId: "step-1",
        attempt: 2,
        status: "skipped",
        toolName: "add_tag",
        result: null,
        mutationRefs: [],
        validationError: expect.objectContaining({
          code: "tool_failed",
          message: expect.stringContaining("typed runtimeRequirement was not provided"),
        }),
      }),
    ]);
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_step_/),
    ]);
  });

  it("commits a side-effecting revision from an observation-only draft when it satisfies a typed requirement", async () => {
    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: true,
      status: "success",
      result: { entity: "Road Warden", tags: ["trusting-player"] },
      authority: toolAuthority(["npc:road-warden:tag"]),
    });
    const frame = createFrame({
      allowedTools: ["find_actor_candidates", "add_tag"],
    });
    const lookupStep = logEventStep({
      stepId: "step-1",
      candidateToolRequest: {
        toolName: "find_actor_candidates",
        actorRef: "Player",
        targetRefs: [],
        input: {
          query: "",
          maxResults: 4,
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([lookupStep]),
      runtimeRequirement: { kind: "state_mutation", effectKind: "entity_tag" },
      reviseStep: () => ({
        toolName: "add_tag",
        targetRefs: ["Road Warden"],
        input: {
          entityName: "Road Warden",
          entityType: "npc",
          tag: "trusting-player",
        },
      }),
    });

    expect(results).toEqual([
      expect.objectContaining({
        stepId: "step-1",
        attempt: 2,
        status: "revised",
        toolName: "add_tag",
        validationError: null,
      }),
    ]);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_step_/),
    ]);
  });

  it("rolls back a side-effecting revision when its typed receipt lacks authority", async () => {
    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: true,
      status: "success",
      result: { entity: "Road Warden", tags: ["trusting-player"] },
    });
    const frame = createFrame({
      allowedTools: ["find_actor_candidates", "add_tag"],
    });
    const lookupStep = logEventStep({
      stepId: "step-1",
      candidateToolRequest: {
        toolName: "find_actor_candidates",
        actorRef: "Player",
        targetRefs: [],
        input: {
          query: "",
          maxResults: 4,
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([lookupStep]),
      runtimeRequirement: { kind: "state_mutation", effectKind: "entity_tag" },
      reviseStep: () => ({
        toolName: "add_tag",
        targetRefs: ["Road Warden"],
        input: {
          entityName: "Road Warden",
          entityType: "npc",
          tag: "trusting-player",
        },
      }),
    });

    expect(results).toEqual([
      expect.objectContaining({
        stepId: "step-1",
        attempt: 2,
        status: "skipped",
        toolName: "add_tag",
        result: null,
        mutationRefs: [],
        validationError: expect.objectContaining({
          code: "tool_failed",
          message: expect.stringContaining(
            "add_tag did not satisfy or feed an accepted runtime receipt",
          ),
        }),
      }),
    ]);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_step_/),
    ]);
  });

  it("skips the step when revision generation fails after validation rejection", async () => {
    const frame = createFrame();
    const spawnStep: GmActionChecklist["steps"][number] = {
      ...logEventStep({ stepId: "step-1" }),
      candidateToolRequest: {
        toolName: "spawn_npc",
        actorRef: "Player",
        targetRefs: [],
        input: {
          name: "Remote Witness",
          tags: ["witness"],
          locationName: "Remote Outpost",
        },
      },
    };

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([spawnStep]),
      reviseStep: () => {
        throw new Error("revision model malformed output");
      },
    });

    expect(results).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "skipped",
        validationError: expect.objectContaining({
          code: "schema_invalid",
          message: expect.stringContaining("Revision failed: revision model malformed output"),
        }),
      }),
    ]);
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("skips invalid steps and does not execute dependent steps", async () => {
    const frame = createFrame();
    const invalidSpawnStep: GmActionChecklist["steps"][number] = {
      ...logEventStep({ stepId: "step-1" }),
      purpose: "Try an illegal remote spawn.",
      candidateToolRequest: {
        toolName: "spawn_npc",
        targetRefs: [],
        input: {
          name: "Remote Witness",
          tags: ["witness"],
          locationName: "Remote Outpost",
        },
      },
    };
    const dependentStep = logEventStep({
      stepId: "step-2",
      dependsOnStepIds: ["step-1"],
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([invalidSpawnStep, dependentStep]),
    });

    expect(results).toEqual([
      expect.objectContaining({
        stepId: "step-1",
        status: "skipped",
        validationError: expect.objectContaining({ code: "schema_invalid" }),
      }),
      expect.objectContaining({
        stepId: "step-2",
        status: "skipped",
        validationError: expect.objectContaining({
          message: "Dependency step-1 was skipped.",
        }),
      }),
    ]);
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("reports executor failure without continuing as done", async () => {
    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: false,
      error: "DB rejected mutation.",
    });

    const frame = createFrame();
    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist(),
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "skipped",
        visibleEffect: "",
        validationError: expect.objectContaining({
          code: "tool_failed",
          message: "DB rejected mutation.",
        }),
      }),
    ]);
  });

  it("allows one revised candidate after executor failure", async () => {
    vi.mocked(executeToolCall)
      .mockResolvedValueOnce({
        success: false,
        error: "Entity not found.",
      })
      .mockResolvedValueOnce({
        success: true,
        result: { eventId: "event-2", durability: "durable", persisted: true },
        authority: toolAuthority([], "tool-result-event-2", ["event-2"]),
      });

    const frame = createFrame();
    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist(),
      runtimeRequirement: sceneBeatRuntimeRequirement,
      reviseStep: ({ validationError }) => {
        expect(validationError.code).toBe("tool_failed");
        return {
          toolName: "log_event",
          targetRefs: [],
          input: {
            text: "The player makes a future-relevant promise.",
            importance: 5,
            participants: ["Player"],
            durability: "durable",
            futureRelevance: "The promise can shape later trust.",
          },
        };
      },
    });

    expect(results).toEqual([
      expect.objectContaining({
        attempt: 2,
        status: "revised",
        validationError: null,
        mutationRefs: ["event-2"],
      }),
    ]);
    expect(executeToolCall).toHaveBeenCalledTimes(2);
  });

  it("skips the step when revision generation fails after executor failure", async () => {
    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: false,
      error: "Entity not found.",
    });

    const frame = createFrame();
    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist(),
      reviseStep: () => {
        throw new Error("revision endpoint failed");
      },
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "skipped",
        validationError: expect.objectContaining({
          code: "tool_failed",
          message: "Entity not found. Revision failed: revision endpoint failed",
        }),
      }),
    ]);
    expect(executeToolCall).toHaveBeenCalledTimes(1);
  });

  it("rejects private forbidden terms before execution", async () => {
    const frame = createFrame();
    const privateStep = logEventStep({
      candidateToolRequest: {
        toolName: "log_event",
        actorRef: "Player",
        targetRefs: ["Road Warden"],
        input: {
          text: "The road warden reacts to the Postal Cache.",
          importance: 6,
          participants: ["Player", "Road Warden"],
          durability: "durable",
          futureRelevance: "Postal Cache pressure should matter later.",
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([privateStep]),
      forbiddenPrivateTerms: ["Postal Cache"],
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "skipped",
        visibleEffect: "",
        validationError: expect.objectContaining({ code: "private_term_leak" }),
      }),
    ]);
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("skips durable player-turn log_event claims that would commit unsupported item access", async () => {
    const frame = createFrame({
      playerAction:
        "I take the Registry Vault master key from my pocket and unlock the vault door.",
    });
    const unsupportedClaimStep = logEventStep({
      candidateToolRequest: {
        toolName: "log_event",
        actorRef: "Player",
        targetRefs: [],
        input: {
          text: "Iria Vale uses the Registry Vault master key to unlock the vault door at The Brass Citadel.",
          importance: 7,
          participants: ["Player"],
          durability: "durable",
          futureRelevance: "Iria now has access to the Registry Vault.",
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([unsupportedClaimStep]),
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "skipped",
        toolName: "log_event",
        visibleEffect: "",
        validationError: expect.objectContaining({
          code: "grounding_invalid",
          path: "candidateToolRequest.input.text",
          message: expect.stringContaining("cannot commit possession"),
        }),
      }),
    ]);
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("allows durable NPC procedural rulings when futureRelevance only explains later stakes", async () => {
    const frame = createFrame({
      playerAction:
        "I show only the documents I actually have and ask which one fails their requirement.",
    });
    const proceduralRulingStep = logEventStep({
      candidateToolRequest: {
        toolName: "log_event",
        actorRef: "Player",
        targetRefs: ["Road Warden"],
        input: {
          text: "The Road Warden states that the route logbook, rainproof ledger, and sealed lacquer message do not satisfy the transit requirement.",
          importance: 7,
          participants: ["Player", "Road Warden"],
          durability: "durable",
          futureRelevance:
            "The ruling tells Mira what she must address to gain passage in a future negotiation or appeal.",
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([proceduralRulingStep]),
      runtimeRequirement: sceneBeatRuntimeRequirement,
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "done",
        toolName: "log_event",
        validationError: null,
      }),
    ]);
    expect(executeToolCall).toHaveBeenCalledWith(
      frame.campaignId,
      "log_event",
      expect.objectContaining({
        durability: "durable",
        futureRelevance: expect.stringContaining("gain passage"),
      }),
      frame.tick,
      undefined,
      expect.objectContaining({ scope: "player_turn" }),
    );
  });

  it("allows scene-local log_event records for unsupported access attempts without durable persistence", async () => {
    const frame = createFrame({
      playerAction:
        "I take the Registry Vault master key from my pocket and unlock the vault door.",
    });
    const sceneLocalAttemptStep = logEventStep({
      candidateToolRequest: {
        toolName: "log_event",
        actorRef: "Player",
        targetRefs: [],
        input: {
          text: "Iria Vale claims a Registry Vault master key and tries to unlock the vault door.",
          importance: 3,
          participants: ["Player"],
          durability: "scene_local",
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([sceneLocalAttemptStep]),
      runtimeRequirement: sceneBeatRuntimeRequirement,
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "done",
        toolName: "log_event",
        validationError: null,
      }),
    ]);
    expect(executeToolCall).toHaveBeenCalledWith(
      frame.campaignId,
      "log_event",
      expect.objectContaining({ durability: "scene_local" }),
      frame.tick,
      undefined,
      expect.objectContaining({ scope: "player_turn" }),
    );
  });

  it("rolls back side effects when a planned terminal receipt is skipped", async () => {
    const frame = createFrame({
      allowedTools: ["add_tag", "record_dialogue_outcome"],
    });
    const addTagStep = logEventStep({
      stepId: "step-1",
      expectedVisibleEffect: "The warden is marked as trusting the player.",
      candidateToolRequest: {
        toolName: "add_tag",
        actorRef: "Player",
        targetRefs: ["Road Warden"],
        input: {
          entityName: "Road Warden",
          entityType: "npc",
          tag: "trusting-player",
        },
      },
    });
    const invalidTerminalReceiptStep = logEventStep({
      stepId: "step-2",
      dependsOnStepIds: ["step-1"],
      expectedVisibleEffect: "The warden's answer is recorded as a typed receipt.",
      candidateToolRequest: {
        toolName: "record_dialogue_outcome",
        actorRef: "Player",
        targetRefs: ["Road Warden"],
        input: {
          addresseeRefs: ["Player"],
          outcomeKind: "answered",
          topicKind: "permission",
          authorityKind: "role_authority",
          truthStatus: "settled_by_backend",
          durability: "durable",
          futureUseKind: "permission_check",
          futureRelevance: "The answer controls a later permission check.",
          summary: "The warden trusts the player enough to permit passage.",
          sourceRefs: ["Road Warden"],
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([addTagStep, invalidTerminalReceiptStep]),
    });

    expect(results).toEqual([
      expect.objectContaining({
        stepId: "step-1",
        status: "skipped",
        toolName: "add_tag",
        result: null,
        mutationRefs: [],
        validationError: expect.objectContaining({
          code: "tool_failed",
          message: expect.stringContaining("record_dialogue_outcome terminal receipt was not accepted"),
        }),
      }),
      expect.objectContaining({
        stepId: "step-2",
        status: "skipped",
        toolName: "record_dialogue_outcome",
        result: null,
        validationError: expect.objectContaining({
          code: "schema_invalid",
        }),
      }),
    ]);
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_step_/),
    ]);
  });

  it("rolls back a standalone add_tag when no typed state mutation receipt boundary is provided", async () => {
    const frame = createFrame({
      allowedTools: ["add_tag"],
    });
    const addTagStep = logEventStep({
      expectedVisibleEffect: "The warden is marked as trusting the player.",
      candidateToolRequest: {
        toolName: "add_tag",
        actorRef: "Player",
        targetRefs: ["Road Warden"],
        input: {
          entityName: "Road Warden",
          entityType: "npc",
          tag: "trusting-player",
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([addTagStep]),
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "skipped",
        toolName: "add_tag",
        result: null,
        mutationRefs: [],
        validationError: expect.objectContaining({
          code: "tool_failed",
          message: expect.stringContaining("typed runtimeRequirement was not provided"),
        }),
      }),
    ]);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_step_/),
    ]);
  });

  it("rolls back an unrelated side effect even when another checklist step satisfies the runtime receipt", async () => {
    vi.mocked(executeToolCall)
      .mockResolvedValueOnce({
        success: true,
        result: {
          eventId: "event-1",
          actorName: "Road Warden",
          durability: "durable",
          persisted: true,
        },
        authority: toolAuthority([], "tool-result-event-1", ["event-1"]),
      })
      .mockResolvedValueOnce({
        success: true,
        result: { tags: ["trusting-player"] },
        authority: toolAuthority(["actor:road-warden:tag"]),
      });
    const frame = createFrame({
      allowedTools: ["log_event", "add_tag"],
    });
    const addTagStep = logEventStep({
      stepId: "step-2",
      expectedVisibleEffect: "The warden is marked as trusting the player.",
      candidateToolRequest: {
        toolName: "add_tag",
        actorRef: "Player",
        targetRefs: ["Road Warden"],
        input: {
          entityName: "Road Warden",
          entityType: "npc",
          tag: "trusting-player",
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([logEventStep(), addTagStep]),
      runtimeRequirement: sceneBeatRuntimeRequirement,
    });

    expect(results).toEqual([
      expect.objectContaining({
        stepId: "step-1",
        status: "skipped",
        result: null,
        validationError: expect.objectContaining({
          code: "tool_failed",
          message: expect.stringContaining("add_tag did not satisfy or feed an accepted runtime receipt"),
        }),
      }),
      expect.objectContaining({
        stepId: "step-2",
        status: "skipped",
        result: null,
        validationError: expect.objectContaining({
          code: "tool_failed",
          message: expect.stringContaining("add_tag did not satisfy or feed an accepted runtime receipt"),
        }),
      }),
    ]);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_step_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_step_/),
    ]);
  });

  it("retracts durable legacy memory when a later unrelated side effect rejects the checklist batch", async () => {
    vi.mocked(executeToolCall)
      .mockResolvedValueOnce({
        success: true,
        result: {
          eventId: "event-durable-1",
          actorName: "Road Warden",
          durability: "durable",
          persisted: true,
        },
        authority: toolAuthority([], "tool-result-event-durable-1", ["event-durable-1"]),
      })
      .mockResolvedValueOnce({
        success: true,
        result: { tags: ["trusting-player"] },
        authority: toolAuthority(["actor:road-warden:tag"]),
      });
    const frame = createFrame({
      allowedTools: ["log_event", "add_tag"],
    });
    const durableLogStep = logEventStep({
      stepId: "step-1",
      candidateToolRequest: {
        toolName: "log_event",
        actorRef: "Player",
        targetRefs: ["Road Warden"],
        input: {
          text: "The road warden records a future-relevant promise.",
          importance: 4,
          participants: ["Player", "Road Warden"],
          durability: "durable",
          futureRelevance: "This promise may affect later trust checks.",
        },
      },
    });
    const addTagStep = logEventStep({
      stepId: "step-2",
      expectedVisibleEffect: "The warden is marked as trusting the player.",
      candidateToolRequest: {
        toolName: "add_tag",
        actorRef: "Player",
        targetRefs: ["Road Warden"],
        input: {
          entityName: "Road Warden",
          entityType: "npc",
          tag: "trusting-player",
        },
      },
    });

    await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([durableLogStep, addTagStep]),
      runtimeRequirement: sceneBeatRuntimeRequirement,
    });

    expect(retractStoredEpisodicEventMock).toHaveBeenCalledWith({
      campaignId: frame.campaignId,
      eventId: "event-durable-1",
    });
    expect(retractReflectionBudgetMock).toHaveBeenCalledWith(
      frame.campaignId,
      ["Player", "Road Warden"],
      4,
    );
    expect(retractActorKnowledgeRecordMock).not.toHaveBeenCalled();
  });

  it("skips player-turn tags that would persist unsupported access as world state", async () => {
    const frame = createFrame({
      allowedTools: ["log_event", "spawn_npc", "add_tag"],
      playerAction:
        "I take the Registry Vault master key from my pocket and unlock the vault door.",
    });
    const unsupportedTagStep = logEventStep({
      candidateToolRequest: {
        toolName: "add_tag",
        actorRef: "Player",
        targetRefs: [],
        input: {
          entityName: "Player",
          entityType: "player",
          tag: "vault-unlocked",
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([unsupportedTagStep]),
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "skipped",
        toolName: "add_tag",
        visibleEffect: "",
        validationError: expect.objectContaining({
          code: "grounding_invalid",
          path: "candidateToolRequest.input.tag",
          message: expect.stringContaining("cannot commit possession"),
        }),
      }),
    ]);
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("blocks repeated equivalent dynamic creation in one turn so existing affordances are reused", async () => {
    vi.mocked(executeToolCall).mockResolvedValueOnce({
      success: true,
      result: { npcId: "npc-counter-clerk" },
      authority: toolAuthority(["actor:npc-counter-clerk"]),
    });
    const frame = createFrame({ allowedTools: ["spawn_npc"] });
    const firstSpawn = logEventStep({
      stepId: "step-1",
      candidateToolRequest: {
        toolName: "spawn_npc",
        actorRef: "Player",
        targetRefs: [],
        input: {
          name: "Counter Clerk",
          tags: ["service-staff"],
          locationRef: "current_scene",
        },
      },
    });
    const duplicateSpawn = logEventStep({
      stepId: "step-2",
      candidateToolRequest: {
        toolName: "spawn_npc",
        actorRef: "Player",
        targetRefs: [],
        input: {
          name: "Counter Clerk",
          tags: ["service-staff"],
          locationRef: "current_scene",
        },
      },
    });

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([firstSpawn, duplicateSpawn]),
      runtimeRequirement: supportActorRuntimeRequirement,
    });

    expect(results).toEqual([
      expect.objectContaining({
        stepId: "step-1",
        status: "done",
        toolName: "spawn_npc",
      }),
      expect.objectContaining({
        stepId: "step-2",
        status: "skipped",
        toolName: "spawn_npc",
        validationError: expect.objectContaining({
          code: "semantic_budget_exceeded",
          message: expect.stringContaining("reuse the existing local affordance"),
        }),
      }),
    ]);
    expect(executeToolCall).toHaveBeenCalledTimes(1);
  });

  it("enforces the candidate request budget across revision attempts", async () => {
    const frame = createFrame();
    const reviseStep = vi.fn(() => ({
      toolName: "spawn_npc" as const,
      targetRefs: [],
      input: {
        name: "Gate Witness",
        tags: ["witness"],
        locationRef: "current_scene",
      },
    }));
    const invalidSpawnStep: GmActionChecklist["steps"][number] = {
      ...logEventStep({ stepId: "step-1" }),
      candidateToolRequest: {
        toolName: "spawn_npc",
        targetRefs: [],
        input: {
          name: "Remote Witness",
          tags: ["witness"],
          locationName: "Remote Outpost",
        },
      },
    };

    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist([invalidSpawnStep]),
      maxCandidateRequests: 1,
      reviseStep,
    });

    expect(results).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "skipped",
        validationError: expect.objectContaining({ code: "schema_invalid" }),
      }),
    ]);
    expect(reviseStep).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("sanitizes rejected tool candidates and validation errors before repair prompting", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: {
        toolName: "log_event",
        targetRefs: ["Road Warden"],
        input: {
          text: "The road warden acknowledges a corrected visible beat.",
          importance: 3,
          participants: ["Player", "Road Warden"],
        },
      },
    } as never);
    const step = logEventStep({
      candidateToolRequest: {
        toolName: "log_event",
        actorRef: "Player",
        targetRefs: ["Road Warden"],
        input: {
          text: `Rejected candidate mentioned actor:${npcId} at location:${locationId}.`,
          importance: 3,
          participants: [`actor:${npcId}`],
        },
      },
    });

    await runGmToolStepRevision({
      provider,
      frame: createFrame(),
      checklist: checklist([step]),
      step,
      validationError: {
        code: "grounding_invalid",
        message: `candidateToolRequest.input.participants.0 rejected actor:${npcId}`,
        path: "candidateToolRequest.input.participants.0",
        toolName: "log_event",
      },
    });

    const prompt = vi.mocked(safeGenerateObject).mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("BACKEND VALIDATION ERROR");
    expect(prompt).not.toContain(`actor:${npcId}`);
    expect(prompt).not.toContain(`location:${locationId}`);
    expect(prompt).toContain("[backend ref hidden]");
  });
});
