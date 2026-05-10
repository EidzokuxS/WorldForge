import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeBridgeCandidateToolMock } = vi.hoisted(() => ({
  executeBridgeCandidateToolMock: vi.fn(),
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

import type { GmActionChecklist } from "../gm-action-checklist.js";
import { executeGmToolSteps } from "../gm-tool-step.js";
import type { SceneFrame } from "../scene-frame.js";
import { executeToolCall } from "../tool-executor.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const npcId = "22222222-2222-4222-8222-222222222222";
const sceneId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const locationId = "99999999-9999-4999-8999-999999999999";

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
    },
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
      reviseStep: ({ validationError }) => {
        expect(validationError.code).toBe("grounding_invalid");
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
          code: "grounding_invalid",
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
        validationError: expect.objectContaining({ code: "grounding_invalid" }),
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
        result: { eventId: "event-2" },
      });

    const frame = createFrame();
    const results = await executeGmToolSteps({
      campaignId: frame.campaignId,
      tick: frame.tick,
      frame,
      checklist: checklist(),
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
        validationError: expect.objectContaining({ code: "grounding_invalid" }),
      }),
    ]);
    expect(reviseStep).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
  });
});
