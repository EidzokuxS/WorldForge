import { describe, expect, it } from "vitest";

import {
  type AuthoritativeSceneFrame,
  type CleanNarratorView,
  type CleanNarrationCandidate,
  type GameplayRuntimeTurnInput,
  type GmRead,
  type JudgeUncertainty,
} from "../gameplay-cycle-runtime/contracts.js";
import {
  buildCleanNarrationSystemPrompt,
  buildCleanNarratorPromptInput,
  renderCleanNarrationFallback,
  runCleanNarration,
  validateCleanNarrationCandidate,
} from "../gameplay-cycle-runtime/narration.js";
import { processCleanGameplayTurnFromInput } from "../gameplay-cycle-runtime/runtime.js";
import type { ProviderConfig } from "../../ai/provider-registry.js";
import type { CleanPlayerFacingTurnCommitResult } from "../gameplay-cycle-runtime/turn-persistence.js";

const provider: ProviderConfig = {
  id: "test",
  name: "Test",
  baseUrl: "https://example.invalid/v1",
  apiKey: "test-key",
  model: "test-model",
};

function movementView(overrides: Partial<CleanNarratorView> = {}): CleanNarratorView {
  return {
    version: "gameplay-runtime.narrator-view.v1",
    packetId: "cgpacket_test",
    campaignId: "campaign-1",
    turnId: "clean-turn-1",
    playerAction: "I walk to North Hall.",
    responseLanguage: "match_player_action",
    preserveLabelsVerbatim: true,
    acceptedEvidence: [{
      ref: "e1",
      authority: "terminal_mutation_receipt",
      claimKinds: ["player_location_change", "elapsed_time"],
      text: "Player location changed to North Hall.",
      backendFacts: [
        { factRef: "e1.f1", text: "Player location changed to North Hall.", exact: true },
        { factRef: "e1.f2", text: "Travel cost: 1 minute(s).", exact: true },
      ],
      limits: {
        proves: ["player location change", "elapsed travel time"],
        doesNotProve: ["discovery", "absence", "no-change"],
      },
    }],
    stepAuditForGrounding: [],
    guard: {
      mayCallTools: false,
      mayInferNewFacts: false,
      mayUseFailedOrSkippedAsTruth: false,
      mayNarrateNoChangeWithoutExplicitEvidence: false,
    },
    privateGuardSidecar: {
      forbiddenActorLabels: ["Hidden Watcher"],
      forbiddenPrivateTerms: ["secret chamber"],
    },
    ...overrides,
  };
}

function movementCandidate(text = "You move to North Hall."): CleanNarrationCandidate {
  return {
    version: "gameplay-runtime.clean-narration-candidate.v1",
    packetId: "cgpacket_test",
    turnId: "clean-turn-1",
    language: "en",
    sentences: [{
      kind: "accepted_evidence",
      text,
      evidenceRefs: ["e1"],
      backendFactRefs: ["e1.f1"],
      claimKinds: ["player_location_change"],
      auditStepIds: [],
    }],
    finalText: text,
  };
}

function routeView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "route_check_receipt",
      claimKinds: ["route_status"],
      text: "North Hall is reachable from Market.",
      backendFacts: [{ factRef: "e1.f1", text: "North Hall is reachable from Market.", exact: true }],
      limits: {
        proves: ["route status only"],
        doesNotProve: ["movement", "arrival", "current-scene change"],
      },
    }],
  });
}

function timeView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "terminal_mutation_receipt",
      claimKinds: ["elapsed_time"],
      text: "5 minute(s) pass.",
      backendFacts: [{ factRef: "e1.f1", text: "5 minute(s) pass.", exact: true }],
      limits: {
        proves: ["elapsed world clock time"],
        doesNotProve: ["no-change", "offscreen events", "NPC action", "world fact"],
      },
    }],
  });
}

function routeOptionsView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "route_options_receipt",
      claimKinds: ["movement_option"],
      text: "Visible route options: North Hall.",
      backendFacts: [{ factRef: "e1.f1", text: "Route option: North Hall (connected, 1 minute(s)).", exact: true }],
      limits: {
        proves: ["route options exposed by current SceneFrame"],
        doesNotProve: ["hidden routes", "absence of other routes", "movement", "discovery", "no-change"],
      },
    }],
  });
}

function dialogueView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "terminal_dialogue_receipt",
      claimKinds: ["dialogue_response"],
      text: 'Guide says: "The north stairs flooded before dawn."',
      backendFacts: [
        { factRef: "e1.f1", text: "Speaker: Guide.", exact: true },
        { factRef: "e1.f2", text: 'Guide says: "The north stairs flooded before dawn."', exact: true },
        { factRef: "e1.f3", text: "Dialogue summary: Guide says the north stairs flooded before dawn.", exact: true },
      ],
      limits: {
        proves: ["visible speaker identity", "visible response content", "speaker response happened this turn"],
        doesNotProve: ["truth of speaker claim", "durable world fact", "NPC private knowledge beyond the utterance"],
      },
    }],
  });
}

function turn(): GameplayRuntimeTurnInput {
  return {
    version: "gameplay-runtime.turn-input.v1",
    route: "/api/chat/action",
    campaignId: "campaign-1",
    turnId: "clean-turn-1",
    playerAction: {
      submitted: "I look around.",
      normalized: "I look around.",
      source: "typed",
    },
    base: {
      tick: 0,
      worldVersion: 0,
      worldTimeMinutes: 0,
      chatHistoryLengthBeforeTurn: 0,
      preTurnSnapshot: { bundleDir: "snapshot-dir", capturedAt: 1 },
    },
    providers: {
      judge: { id: "test", model: "test-model", baseUrl: null },
      storyteller: { id: "test", model: "test-model", baseUrl: null },
    },
    idempotencyKey: "campaign-1:0:0:clean-turn-1",
  };
}

function frame(): AuthoritativeSceneFrame {
  return {
    version: "scene-frame.v1",
    frameId: "frame-1",
    campaignId: "campaign-1",
    turnId: "clean-turn-1",
    base: { tick: 0, worldVersion: 0, worldTimeMinutes: 0 },
    playerAction: "I look around.",
    player: {
      ref: "Player",
      label: "Mira Voss",
      visibleStatus: { hp: null, conditions: [] },
    },
    scene: {
      currentLocation: { ref: "Market", label: "Market", description: null },
      currentScene: { ref: "Market", label: "Market", description: null },
      visibleFacts: [],
      recentLocalFacts: [],
    },
    actors: [],
    movementOptions: [],
    targets: [],
    inventory: [],
    capabilities: [{ capabilityId: "observe_visible", evidenceAuthority: "observation_only", allowed: true }],
    citableRefs: ["Player", "Market"],
    privateGuards: { forbiddenActorLabels: [], forbiddenPrivateTerms: [] },
    forecast: {
      version: "scoped-forecast.v1",
      advisoryOnly: true,
      sourceStatus: "empty_missing",
      mayAuthorizeMutation: false,
      maySupportNarrationClaim: false,
      entries: [],
      forbiddenPrivateTerms: [],
    },
  };
}

function gmRead(inputFrame = frame()): GmRead {
  return {
    version: "gm-read.v1",
    frameId: inputFrame.frameId,
    turnId: inputFrame.turnId,
    path: "direct",
    situationSummary: "The player observes the current visible scene.",
    liveSceneQuestion: "What can the player observe?",
    focalRefs: ["Player"],
    evidenceRefs: ["Player", "Market"],
    actionInterpretation: {
      summary: "The player observes without mutation.",
      playerIntent: "Observe the scene.",
      method: null,
      targetRefs: ["Market"],
      interactionKind: "current_scene_observation",
    },
    uncertainty: { present: false, question: null, basis: null },
    interpretationRationale: "Observation of current visible truth.",
  };
}

function judgment(inputFrame = frame(), read = gmRead(inputFrame)): JudgeUncertainty {
  return {
    version: "judge-uncertainty.v1",
    judgmentId: "judge-1",
    campaignId: inputFrame.campaignId,
    turnId: inputFrame.turnId,
    frameId: inputFrame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      gmReadPath: read.path,
    },
    physicalPossibility: "possible",
    checkNeed: "no_roll_needed",
    nextStep: "settle_no_roll",
    actorRefs: ["Player"],
    targetRefs: ["Market"],
    evidenceRefs: ["Player", "Market"],
    possibilityRationale: "Observation is possible.",
    checkRationale: "Visible observation needs no roll.",
    difficulty: null,
    oracleAdmission: null,
    noRollReason: {
      code: "deterministic_scene_truth",
      explanation: "The action asks for current visible truth.",
      evidenceRefs: ["Player", "Market"],
    },
  };
}

function fakeCommit(input: Parameters<typeof processCleanGameplayTurnFromInput>[0] extends never ? never : any): CleanPlayerFacingTurnCommitResult {
  return {
    record: {
      version: "gameplay-runtime.player-facing-turn-record.v1",
      runtime: "gameplay-cycle-runtime",
      route: "/api/chat/action",
      campaignId: input.turn.campaignId,
      recordId: "cgtr_fake",
      publicTurnId: "cgturn_fake",
      publicPacketId: input.settlement.settledPacket.packetId,
      internalTurnId: input.turn.turnId,
      internalFrameId: input.projection.frameId,
      idempotencyKey: input.turn.idempotencyKey,
      committedAt: 1,
      input: input.turn.playerAction,
      base: {
        tick: 0,
        worldVersion: 0,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
      },
      chat: {
        userMessageIndex: 0,
        assistantMessageIndex: 1,
        userMessageSha256: "0".repeat(64),
        assistantMessageSha256: "1".repeat(64),
      },
      terminalProjection: input.projection,
      settlement: input.settlement,
      evidenceRefs: input.evidenceRefs,
      durableEventIds: { accepted: [], produced: [] },
      doneBoundary: {
        runtime: "gameplay-cycle-runtime",
        recordId: "cgtr_fake",
        turnId: "cgturn_fake",
        packetId: input.settlement.settledPacket.packetId,
        mutationApplied: input.projection.mutationApplied,
        settled: true,
        chatHistoryLengthBeforeTurn: 0,
        chatHistoryLengthAfterTurn: 2,
        userMessageSha256: "0".repeat(64),
        assistantMessageSha256: "1".repeat(64),
      },
    },
    doneBoundary: {
      runtime: "gameplay-cycle-runtime",
      recordId: "cgtr_fake",
      turnId: "cgturn_fake",
      packetId: input.settlement.settledPacket.packetId,
      mutationApplied: input.projection.mutationApplied,
      settled: true,
      chatHistoryLengthBeforeTurn: 0,
      chatHistoryLengthAfterTurn: 2,
      userMessageSha256: "0".repeat(64),
      assistantMessageSha256: "1".repeat(64),
    },
  } as CleanPlayerFacingTurnCommitResult;
}

describe("clean Stage 6 narration contracts", () => {
  it("builds prompt input without private sidecar or raw player action", () => {
    const promptInput = buildCleanNarratorPromptInput(movementView());
    const serialized = JSON.stringify(promptInput);

    expect(serialized).not.toContain("privateGuardSidecar");
    expect(serialized).not.toContain("Hidden Watcher");
    expect(serialized).not.toContain("secret chamber");
    expect(serialized).not.toContain("I walk to North Hall.");
    expect(promptInput.language).toBe("en");
    expect(promptInput.languageSource).toBe("derived_from_player_action_without_prompting_raw_action");
    expect(promptInput.acceptedEvidence[0]?.backendFacts[0]?.factRef).toBe("e1.f1");
  });

  it("accepts model narration from accepted movement evidence", () => {
    const result = validateCleanNarrationCandidate({
      view: movementView(),
      candidate: movementCandidate(),
    });

    expect(result.status).toBe("accepted");
  });

  it("rejects route_check candidates that declare movement", () => {
    const result = validateCleanNarrationCandidate({
      view: routeView(),
      candidate: movementCandidate("You move to North Hall."),
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.issues.some((issue) => issue.code === "claim_not_supported")).toBe(true);
    expect(renderCleanNarrationFallback(routeView())).not.toMatch(/\b(move|arrive|travel)\b/iu);
  });

  it("falls back from P64 elapsed-time evidence without no-change claims", () => {
    const text = renderCleanNarrationFallback(timeView());

    expect(text).toBe("5 minute(s) pass.");
    expect(text).not.toMatch(/nothing changed|nothing happened|no visible changes|everything stayed/iu);
  });

  it("renders route-options evidence without converting options into movement", () => {
    const text = renderCleanNarrationFallback(routeOptionsView());

    expect(text).toBe("Route option: North Hall (connected, 1 minute(s)).");
    expect(text).not.toMatch(/\b(move|arrive|travel to|you go)\b/iu);
  });

  it("renders dialogue response evidence without promoting the quote to world truth", () => {
    const text = renderCleanNarrationFallback(dialogueView());

    expect(text).toBe('Guide says: "The north stairs flooded before dawn."');
    const promotedTruth = validateCleanNarrationCandidate({
      view: dialogueView(),
      candidate: {
        ...movementCandidate("The north stairs flooded before dawn."),
        sentences: [{
          kind: "accepted_evidence",
          text: "The north stairs flooded before dawn.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2"],
          claimKinds: ["visible_fact"],
          auditStepIds: [],
        }],
        finalText: "The north stairs flooded before dawn.",
      },
    });
    expect(promotedTruth.status).toBe("rejected");
    if (promotedTruth.status !== "rejected") throw new Error("expected rejected");
    expect(promotedTruth.issues.some((issue) => issue.code === "claim_not_supported")).toBe(true);
  });

  it("keeps failed and skipped audit notices from becoming world truth", () => {
    const view = movementView({
      acceptedEvidence: [],
      stepAuditForGrounding: [{
        stepId: "step-1",
        status: "failed",
        publicReason: "Movement was not accepted.",
        mayUseAsWorldTruth: false,
      }],
    });
    const result = validateCleanNarrationCandidate({
      view,
      candidate: {
        ...movementCandidate("You move to North Hall."),
        sentences: [{
          kind: "audit_notice",
          text: "You move to North Hall.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1"],
          claimKinds: ["player_location_change"],
          auditStepIds: ["step-1"],
        }],
      },
    });

    expect(result.status).toBe("rejected");
    expect(renderCleanNarrationFallback(view)).toContain("not confirmed");
  });

  it("rejects private, backend, old-runtime, and oracle adapter leaks", () => {
    const result = validateCleanNarrationCandidate({
      view: movementView(),
      candidate: movementCandidate("You move to location:secret after roll reasoning."),
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "backend_ref",
      "old_runtime_marker",
    ]));
  });

  it("falls back on generation failure without no-change narration", async () => {
    const result = await runCleanNarration({
      narratorView: movementView(),
      provider,
      generateCandidate: async () => {
        throw new Error("model offline");
      },
    });

    expect(result.source).toBe("fallback_generation_error");
    expect(result.text).toBe("You move to North Hall.");
    expect(result.text).not.toMatch(/nothing changed|nothing happened|no visible changes|you remain/iu);
  });

  it("uses Russian ordinary prose while preserving English accepted labels", async () => {
    const result = await runCleanNarration({
      narratorView: movementView({
        playerAction: "Я иду в The Copper Tap.",
        acceptedEvidence: [{
          ...movementView().acceptedEvidence[0]!,
          text: "Player location changed to The Copper Tap.",
          backendFacts: [
            { factRef: "e1.f1", text: "Player location changed to The Copper Tap.", exact: true },
          ],
        }],
      }),
      provider,
      generateCandidate: async () => {
        throw new Error("force fallback");
      },
    });

    expect(result.text).toBe("Вы перемещаетесь в The Copper Tap.");
  });

  it("documents that raw player action is intentionally omitted from the system prompt", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("raw player action is intentionally omitted");
  });

  it("composes runtime through Stage 6 with only CleanNarratorView input", async () => {
    const inputFrame = frame();
    const read = gmRead(inputFrame);
    const eventTypes: string[] = [];
    const stages: string[] = [];
    const narrationInputs: unknown[] = [];

    for await (const event of processCleanGameplayTurnFromInput({
      turn: turn(),
      judgeProvider: provider,
      storytellerProvider: provider,
      buildFrame: async () => inputFrame,
      gmReadCandidateGenerator: async () => read,
      judgeUncertaintyCandidateGenerator: async () => judgment(inputFrame, read),
      runNarration: async (input) => {
        narrationInputs.push(input);
        return {
          version: "gameplay-runtime.clean-narration-result.v1",
          packetId: input.narratorView.packetId,
          turnId: input.narratorView.turnId,
          text: "Current scene is Market.",
          source: "model",
          validationIssues: [],
        };
      },
      commitTurn: async (input) => fakeCommit(input),
    })) {
      eventTypes.push(event.type);
      if (event.type === "scene-settling" && typeof event.data === "object" && event.data) {
        const stage = (event.data as { stage?: unknown }).stage;
        if (typeof stage === "string") stages.push(stage);
      }
    }

    expect(stages).toEqual(["scene-frame", "gm-read", "judge-uncertainty", "settled-turn-packet"]);
    expect(eventTypes).toEqual([
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "narrative",
      "finalizing_turn",
      "done",
    ]);
    expect(narrationInputs).toHaveLength(1);
    expect(JSON.stringify(narrationInputs[0])).toContain("narratorView");
    expect(JSON.stringify(narrationInputs[0])).not.toContain("receipts");
    expect(JSON.stringify(narrationInputs[0])).not.toContain("checklist");
  });
});
