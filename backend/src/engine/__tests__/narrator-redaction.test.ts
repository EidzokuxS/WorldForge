import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../campaign/index.js", () => ({
  readCampaignConfig: vi.fn(),
  getChatHistory: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

import { readCampaignConfig, getChatHistory } from "../../campaign/index.js";
import { assembleFinalNarrationPrompt } from "../prompt-assembler.js";
import type { NarratorPacket } from "../narrator-packet.js";
import type { SceneAssembly } from "../scene-assembly.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const visibleNpcId = "22222222-2222-4222-8222-222222222222";
const hiddenNpcId = "33333333-3333-4333-8333-333333333333";

function createSceneAssembly(): SceneAssembly {
  return {
    openingScene: false,
    openingState: {
      active: true,
      locationId: "scene-1",
      locationName: "Night Courier Depot",
      arrivalMode: "already_present",
      startingVisibility: "public",
      immediateSituation: "The depot clerk waits behind a brass counter.",
      entryPressure: [],
      promptLines: ["The depot queue is stalled at the brass counter."],
      sceneContextLines: [],
    },
    currentScene: {
      id: "scene-1",
      name: "Night Courier Depot",
      description: "A brass counter, route hooks, and a rain-black street outside.",
      tags: ["depot"],
    },
    presentNpcNames: ["Depot Clerk"],
    sceneDirection: null,
    playerPerceivableSceneDirection: null,
    awareness: {
      contract: {
        clear: "clear",
        hint: "hint",
        none: "none",
      },
      byNpcName: {},
      clearNpcNames: ["Depot Clerk"],
      hintSignals: [],
    },
    recentContext: [],
    sceneEffects: [],
    playerPerceivableConsequences: [],
  } as SceneAssembly;
}

function createNarratorPacket(): NarratorPacket {
  return {
    campaignId: "campaign-1",
    tick: 3,
    playerAction: "I ask why the ledger is sealed.",
    oracleOutcome: null,
    anchorEvent: {
      id: "event-player",
      actorId: playerId,
      kind: "player_action",
      summary: "Mira asks why the ledger is sealed.",
      perceivableByPlayer: true,
    },
    perceivableEvents: [
      {
        id: "event-player",
        actorId: playerId,
        kind: "player_action",
        summary: "Mira asks why the ledger is sealed.",
        perceivableByPlayer: true,
      },
    ],
    perceivableResponses: [],
    perceivableEffects: [
      {
        id: "effect-visible",
        actorId: visibleNpcId,
        summary: "The clerk pushes the ledger farther from the counter edge.",
        perceivableByPlayer: true,
      },
    ],
    visibleActors: [
      { id: playerId, label: "Mira", type: "player" },
      { id: visibleNpcId, label: "Depot Clerk", type: "npc" },
    ],
    hintSignals: ["Paper clicks once behind the ledger wall."],
    guardrails: ["Do not identify the unseen paper-click source."],
    controlReturnReason: "Return control after the clerk's visible refusal.",
    allowedVisibleActorNames: ["Mira", "Depot Clerk"],
    forbiddenActorNames: ["Hidden Auditor"],
    forbiddenFactMarkers: [`hidden-actor:${hiddenNpcId}`],
    forbiddenPrivateTerms: ["Forest Outpost"],
    canonicalTurnPacket: {
      campaignId: "campaign-1",
      tick: 3,
      playerAction: "I ask why the ledger is sealed.",
      oracleOutcome: null,
      narratorFacts: {
        anchorEventId: "event-player",
        eventIds: ["event-player"],
        responseIds: [],
        actionIds: [],
        toolResultRefs: [],
      },
      anchorEvent: {
        id: "event-player",
        actorId: playerId,
        kind: "player_action",
        summary: "Mira asks why the ledger is sealed.",
        perceivableByPlayer: true,
      },
      events: [],
      responses: [],
      effects: [],
      actionResults: [],
      guardrails: ["Do not identify the unseen paper-click source."],
      controlReturnReason: "Return control after the clerk's visible refusal.",
    },
  };
}

describe("narrator redaction boundary", () => {
  beforeEach(() => {
    vi.mocked(readCampaignConfig).mockReturnValue({
      name: "Night Courier Depot",
      premise: "A depot scene with strict visibility.",
      createdAt: Date.now(),
      currentTick: 3,
      generationComplete: true,
    });
    vi.mocked(getChatHistory).mockReturnValue([]);
  });

  it("assembles final narration through PlayerFacingPacket trace without hidden private surfaces", async () => {
    const result = await assembleFinalNarrationPrompt({
      campaignId: "campaign-1",
      contextWindow: 8192,
      sceneAssembly: createSceneAssembly(),
      narratorPacket: createNarratorPacket(),
      playerAction: "I ask why the ledger is sealed.",
    });

    expect(result.prompt).toContain("[PLAYER-FACING PACKET]");
    expect(result.prompt).toContain("[CONTEXT BUDGET TRACE]");
    expect(result.prompt).toContain("didClipModelOutput: false");
    expect(result.prompt).toContain("Paper clicks once behind the ledger wall.");
    expect(result.prompt).not.toContain("Hidden Auditor");
    expect(result.prompt).not.toContain("Forest Outpost");
    expect(result.prompt).not.toContain(`hidden-actor:${hiddenNpcId}`);
    expect(result.prompt).not.toContain("canonicalTurnPacket");
  });

  it("redacts forbidden private truth from unchecked current scene text before final narration", async () => {
    const sceneAssembly = createSceneAssembly();
    sceneAssembly.currentScene = {
      ...sceneAssembly.currentScene!,
      description: "Forest Outpost is secretly visible from the depot.",
    };

    const result = await assembleFinalNarrationPrompt({
      campaignId: "campaign-1",
      contextWindow: 8192,
      sceneAssembly,
      narratorPacket: createNarratorPacket(),
      playerAction: "I look around.",
    });

    expect(result.prompt).toContain("[CURRENT LOCAL SCENE]");
    expect(result.prompt).toContain("[private term omitted] is secretly visible");
    expect(result.prompt).not.toContain("Forest Outpost");
  });

  it("allows a forbidden private name inside a raw player claim without making it authoritative", async () => {
    const narratorPacket = createNarratorPacket();
    narratorPacket.playerAction = "I claim Hidden Auditor gave me permission.";
    narratorPacket.anchorEvent = {
      ...narratorPacket.anchorEvent,
      summary: "Player action request: I claim Hidden Auditor gave me permission.",
    };
    narratorPacket.perceivableEvents[0] = {
      ...narratorPacket.perceivableEvents[0]!,
      summary: "Player action request: I claim Hidden Auditor gave me permission.",
    };
    narratorPacket.perceivableEffects[0] = {
      ...narratorPacket.perceivableEffects[0]!,
      toolName: "log_event",
      summary: "Mira claimed Hidden Auditor gave her permission; no proof was confirmed.",
    };
    narratorPacket.canonicalTurnPacket = {
      ...narratorPacket.canonicalTurnPacket,
      playerAction: narratorPacket.playerAction,
      anchorEvent: narratorPacket.anchorEvent,
      events: [narratorPacket.perceivableEvents[0]!],
    };

    const result = await assembleFinalNarrationPrompt({
      campaignId: "campaign-1",
      contextWindow: 8192,
      sceneAssembly: createSceneAssembly(),
      narratorPacket,
      playerAction: narratorPacket.playerAction,
    });

    expect(result.prompt).toContain("I claim Hidden Auditor gave me permission.");
    expect(result.prompt).toContain("Mira claimed Hidden Auditor gave her permission");
    expect(result.prompt).toContain("player-supplied claims");
    expect(result.prompt).toContain("not authoritative world state");
  });

  it("keeps a player-claimed private name only in player-sourced packet text when scene context also contains it", async () => {
    const narratorPacket = createNarratorPacket();
    narratorPacket.forbiddenActorNames = ["Satoru Gojo"];
    narratorPacket.playerAction =
      "I loudly claim that Satoru Gojo personally authorized my chakra experiment, even though I have no proof.";
    narratorPacket.anchorEvent = {
      ...narratorPacket.anchorEvent,
      summary:
        "Player action request: I loudly claim that Satoru Gojo personally authorized my chakra experiment, even though I have no proof.",
    };
    narratorPacket.perceivableEvents[0] = {
      ...narratorPacket.perceivableEvents[0]!,
      summary:
        "Player action request: I loudly claim that Satoru Gojo personally authorized my chakra experiment, even though I have no proof.",
    };
    narratorPacket.perceivableEffects[0] = {
      ...narratorPacket.perceivableEffects[0]!,
      toolName: "log_event",
      summary:
        "Mira claimed Satoru Gojo authorized her chakra experiment; no proof was confirmed.",
    };
    narratorPacket.canonicalTurnPacket = {
      ...narratorPacket.canonicalTurnPacket,
      playerAction: narratorPacket.playerAction,
      anchorEvent: narratorPacket.anchorEvent,
      events: [narratorPacket.perceivableEvents[0]!],
    };
    const sceneAssembly = createSceneAssembly();
    sceneAssembly.currentScene = {
      ...sceneAssembly.currentScene!,
      description: "The district is rumored to be a trap prepared for Satoru Gojo.",
    };

    const result = await assembleFinalNarrationPrompt({
      campaignId: "campaign-1",
      contextWindow: 8192,
      sceneAssembly,
      narratorPacket,
      playerAction: narratorPacket.playerAction,
    });

    expect(result.prompt).toContain("I loudly claim that Satoru Gojo");
    expect(result.prompt).toContain("Mira claimed Satoru Gojo authorized");
    expect(result.prompt).not.toContain("trap prepared for Satoru Gojo");
    expect(result.prompt).toContain("trap prepared for [private term omitted]");
  });

  it("still rejects a player-named private actor when an effect asserts the name as fact", async () => {
    const narratorPacket = createNarratorPacket();
    narratorPacket.playerAction = "I claim Hidden Auditor gave me permission.";
    narratorPacket.anchorEvent = {
      ...narratorPacket.anchorEvent,
      summary: "Player action request: I claim Hidden Auditor gave me permission.",
    };
    narratorPacket.perceivableEvents[0] = {
      ...narratorPacket.perceivableEvents[0]!,
      summary: "Player action request: I claim Hidden Auditor gave me permission.",
    };
    narratorPacket.perceivableEffects[0] = {
      ...narratorPacket.perceivableEffects[0]!,
      toolName: "log_event",
      summary: "Hidden Auditor appears from a private office.",
    };

    await expect(
      assembleFinalNarrationPrompt({
        campaignId: "campaign-1",
        contextWindow: 8192,
        sceneAssembly: createSceneAssembly(),
        narratorPacket,
        playerAction: narratorPacket.playerAction,
      }),
    ).rejects.toThrow(/forbidden packet term/i);
  });
});
