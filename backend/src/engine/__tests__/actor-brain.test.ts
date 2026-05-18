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
        citedFactIds: ["f1"],
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

  it("formats ActorFrame prompts through the model-facing safety adapter", () => {
    const prompt = buildActorDecisionPrompt({
      ...frame,
      modelFacingSafety: {
        forbiddenTerms: ["Hidden Tea Broker"],
        backendOnlyTerms: ["loc-private-vault", "npc-1"],
      },
      playerActionRequest: "The player asks whether actor:hidden-broker came from loc-private-vault.",
      constraints: [
        "Do not reveal Hidden Tea Broker or loc-private-vault.",
      ],
      facts: [
        {
          id: "event:private-entry",
          route: "direct_observation",
          text: "Hidden Tea Broker crossed actor:hidden-broker through loc-private-vault.",
          subjectRefs: ["actor:hidden-broker", "loc-private-vault"],
          confidence: 0.9,
        },
      ],
    });

    expect(prompt).toContain('"ref": "f1"');
    expect(prompt).not.toContain("Hidden Tea Broker");
    expect(prompt).not.toContain("actor:hidden-broker");
    expect(prompt).not.toContain("loc-private-vault");
    expect(prompt).not.toContain("event:private-entry");
    expect(prompt).toContain("[redacted]");
    expect(prompt).toContain("[backend ref hidden]");
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

  it("describes natural private and plan update shapes separately from tool inputs", () => {
    const prompt = buildActorDecisionPrompt(frame);

    expect(prompt).toContain("beliefUpdates are transient private packet notes only");
    expect(prompt).toContain("use an array of compact strings");
    expect(prompt).toContain(
      'planUpdates entries must be { "summary": "how the actor plan changes", "status": "planned|continued|completed|blocked" }',
    );
    expect(prompt).toContain("Do not include writeScopes; backend scheduling owns write scopes");
    expect(prompt).toContain("do not put private cognition in log_event text");
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
    expect(prompt).toContain("Use the exact destination label from a cited reachable movement fact text");
    expect(prompt).toContain("Do not use destination, destinationRef, target, locationName, or an empty input object");
    expect(prompt).toContain('"ref": "f1"');
    expect(prompt).not.toContain('"actorId": "npc-1"');
    expect(prompt).not.toContain('"campaignId"');
  });

  it("suppresses runtime tool examples when no tools are legal", () => {
    const prompt = buildActorDecisionPrompt({
      ...frame,
      legalTools: [],
    });

    expect(prompt).toContain("No tools are legal in this actor pass. Return requestedTools: [] only.");
    expect(prompt).toContain('"requestedTools": []');
    expect(prompt).toContain("No world-facing tool is legal for this process update.");
    expect(prompt).not.toContain("DURABLE LOG_EVENT EXAMPLE");
    expect(prompt).not.toContain('"toolName": "log_event"');
  });

  it("accepts durable actor log events only when the model supplies futureRelevance", async () => {
    safeGenerateObjectMock.mockResolvedValue({
      object: {
        decisionSummary: "The clerk states the permit requirement.",
        citedFactIds: ["f1"],
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

    expect(packet.actorId).toBe("npc-1");
    expect(packet.citedFactIds).toEqual(["self:npc-1"]);
    expect(packet.requestedTools?.[0]?.input).toMatchObject({
      durability: "durable",
      futureRelevance:
        "The stamped Council seal should constrain later attempts to enter through this gate.",
    });
  });

  it("accepts natural typed private updates without relaxing tool request shape", async () => {
    safeGenerateObjectMock.mockResolvedValue({
      object: {
        decisionSummary: "The clerk keeps the boundary in mind.",
        citedFactIds: ["f1"],
        selectedGoal: null,
        intent: "Watch the player without making a public move.",
        requestedTools: [],
        beliefUpdates: [
          {
            category: "recognition",
            update: "The player is trying to preserve leverage without striking the fork.",
          },
        ],
        planUpdates: [
          {
            category: "continued",
            update: "Maintain the threshold posture and wait for the player's next proof.",
          },
        ],
        noActionReason: "The clerk has no grounded public action before the player acts again.",
      },
      trace: {
        usage: null,
        reasoningText: "",
      },
    });

    const packet = await runActorDecisionBrain({ provider, frame });

    expect(packet.beliefUpdates).toEqual([
      "recognition: The player is trying to preserve leverage without striking the fork.",
    ]);
    expect(packet.planUpdates?.[0]).toMatchObject({
      summary: "Maintain the threshold posture and wait for the player's next proof.",
      status: "continued",
    });
    expect(packet.requestedTools).toEqual([]);
  });

  it("fails closed when a durable actor log event omits futureRelevance", async () => {
    safeGenerateObjectMock.mockResolvedValue({
      object: {
        decisionSummary: "The clerk states the permit requirement.",
        citedFactIds: ["f1"],
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
