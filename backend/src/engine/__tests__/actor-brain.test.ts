import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  safeGenerateObjectMock,
  createModelMock,
} = vi.hoisted(() => ({
  safeGenerateObjectMock: vi.fn(),
  createModelMock: vi.fn(() => "judge-model"),
}));

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: safeGenerateObjectMock,
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: createModelMock,
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    event: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  withRole: vi.fn(async (_role: string, fn: () => unknown) => await fn()),
}));

import type { ProviderConfig } from "../../ai/provider-registry.js";
import {
  ACTOR_DECISION_DEFAULT_MAX_OUTPUT_TOKENS,
  ACTOR_DECISION_TIMEOUT_MS,
  buildActorDecisionPrompt,
  runActorDecisionBrain,
} from "../actor-brain.js";
import type { ActorFrame } from "../actor-frame.js";

const provider = {
  id: "test-provider",
  name: "GLM",
  baseUrl: "https://api.z.ai/api/coding/paas/v4",
  apiKey: "test-key",
  model: "glm-5-turbo",
} as ProviderConfig;

const frame = {
  campaignId: "campaign-1",
  worldVersion: 3,
  observer: {
    id: "scene-actor-1",
    actorId: "npc-1",
    label: "Gate Clerk",
    type: "npc",
    locationId: "loc-gate",
    sceneScopeId: "scene-gate",
  },
  playerActionRequest: "The player asks what is visible at the gate.",
  facts: [
    {
      id: "self:npc-1",
      route: "self_state",
      text: "Gate Clerk is present.",
      subjectRefs: ["npc-1"],
      confidence: 1,
    },
  ],
  legalTools: ["log_event"],
  constraints: [],
  contextBudgetTrace: {} as never,
  hiddenExcludedCount: 0,
} as ActorFrame;

describe("runActorDecisionBrain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    safeGenerateObjectMock.mockResolvedValue({
      object: {
        actorId: "npc-1",
        citedFactIds: ["self:npc-1"],
        intent: "Keep watching without changing the scene.",
        requestedTools: [],
        noActionReason: "The clerk has no useful immediate move.",
      },
      trace: {
        usage: null,
        reasoningText: "",
      },
    });
  });

  it("uses the low-latency judge model budget for player-blocking actor decisions", async () => {
    await runActorDecisionBrain({
      provider,
      frame,
      maxOutputTokens: 32_000,
    });

    expect(createModelMock).toHaveBeenCalledWith(provider, {
      role: "judge",
      reasoningMode: "bypass",
    });
    expect(safeGenerateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "judge-model",
        temperature: 0.2,
        mode: "native_json",
        retries: 1,
        allowTextFallback: false,
        allowRepair: false,
        maxOutputTokens: ACTOR_DECISION_DEFAULT_MAX_OUTPUT_TOKENS,
        timeout: { totalMs: ACTOR_DECISION_TIMEOUT_MS },
      }),
    );
  });

  it("asks actors to persist future-usable leads instead of treating them as scene-local chatter", () => {
    const prompt = buildActorDecisionPrompt(frame);

    expect(prompt).toContain("future-usable procedure, constraint, route, name, lead");
    expect(prompt).toContain("durability durable");
    expect(prompt).toContain("input.futureRelevance");
    expect(prompt).toContain("DURABLE LOG_EVENT EXAMPLE");
    expect(prompt).toContain("stamped Council seal requirement should constrain later attempts");
    expect(prompt).toContain("Use log_event durability scene_local only for transient speech");
  });

  it("warns actors not to flatten runtime tool args beside input", () => {
    const prompt = buildActorDecisionPrompt(frame);

    expect(prompt).toContain(
      'Every requestedTools entry must be exactly { "toolName": string, "purpose": string, "input": object }',
    );
    expect(prompt).toContain("Never put tool arguments beside input");
    expect(prompt).toContain("text, importance, participants, durability, and futureRelevance must be inside input");
    expect(prompt).toContain('"input": "text"');
    expect(prompt).toContain('"importance": 3');
  });

  it("shows exact actor tool input contracts for movement instead of a generic input object", () => {
    const prompt = buildActorDecisionPrompt({
      ...frame,
      legalTools: ["log_event", "move_to"],
      facts: [
        ...frame.facts,
        {
          id: "move:loc-station-b",
          route: "local_affordance",
          text: "Station B is reachable.",
          subjectRefs: ["loc-station-b"],
          confidence: 0.9,
        },
      ],
    });

    expect(prompt).toContain("LEGAL TOOL INPUT CONTRACTS");
    expect(prompt).toContain('"targetLocationName"');
    expect(prompt).toContain("Copy the exact destination from a cited reachable move:* fact");
    expect(prompt).toContain("Do not use destination, destinationRef, target, locationName, or an empty input object");
  });

  it("accepts durable actor log events only when the model supplies futureRelevance", async () => {
    safeGenerateObjectMock.mockResolvedValue({
      object: {
        actorId: "npc-1",
        decisionSummary: "The clerk states the permit requirement.",
        citedFactIds: ["self:npc-1"],
        selectedGoal: null,
        intent: "State the boundary that blocks passage.",
        requestedTools: [
          {
            toolName: "log_event",
            purpose: "Persist a future-usable entry requirement.",
            input: {
              text: "Gate Clerk says entry requires a stamped Council seal.",
              importance: 4,
              participants: ["Gate Clerk"],
              durability: "durable",
              futureRelevance:
                "The stamped Council seal should constrain later attempts to enter through this gate.",
            },
          },
        ],
        beliefUpdates: [],
        planUpdates: [],
        noActionReason: null,
      },
      trace: {
        usage: null,
        reasoningText: "",
      },
    });

    const packet = await runActorDecisionBrain({ provider, frame });

    expect(packet.requestedTools?.[0]?.input).toMatchObject({
      durability: "durable",
      futureRelevance:
        "The stamped Council seal should constrain later attempts to enter through this gate.",
    });
  });

  it("fails closed when a durable actor log event omits futureRelevance", async () => {
    safeGenerateObjectMock.mockResolvedValue({
      object: {
        actorId: "npc-1",
        decisionSummary: "The clerk states the permit requirement.",
        citedFactIds: ["self:npc-1"],
        selectedGoal: null,
        intent: "State the boundary that blocks passage.",
        requestedTools: [
          {
            toolName: "log_event",
            purpose: "Persist a future-usable entry requirement.",
            input: {
              text: "Gate Clerk says entry requires a stamped Council seal.",
              importance: 4,
              participants: ["Gate Clerk"],
              durability: "durable",
            },
          },
        ],
        beliefUpdates: [],
        planUpdates: [],
        noActionReason: null,
      },
      trace: {
        usage: null,
        reasoningText: "",
      },
    });

    await expect(runActorDecisionBrain({ provider, frame })).rejects.toThrow(
      /futureRelevance is required when durability is durable/,
    );
  });
});
