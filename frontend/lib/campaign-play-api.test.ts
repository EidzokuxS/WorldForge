import { afterEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_PLAY_LIMITS } from "@worldforge/shared";
import type {
  CampaignPlayCharacterDraft,
  CampaignPlayErrorResponse,
  CampaignPlaySseEvent,
} from "@worldforge/shared";

import {
  admitCampaignPlayOpening,
  admitCampaignPlayTurn,
  CampaignPlayApiError,
  generateCampaignPlayPlayerDraft,
  loadCampaignPlayJournal,
  loadCampaignPlayState,
  loadCampaignPlayTurn,
  parseCampaignPlayPlayerCard,
  putCampaignPlayPlayer,
  researchCampaignPlayPlayer,
  recoverCampaignPlayNarration,
  resumeCampaignPlayTurn,
  streamCampaignPlayTurnEvents,
} from "./campaign-play-api";

const versions = {
  acceptedWorldVersion: 1,
  worldVersion: 1,
  runtimeRevision: 1,
};

const draft: CampaignPlayCharacterDraft = {
  name: "Mara Venn",
  summary: "A patient signal cartographer.",
  species: "Human",
  gender: "Woman",
  ageText: "Thirty-two",
  appearance: "Salt-blue coat and ink-stained fingers.",
  biography: "Mara maps drowned rail lines for the families who still wait beside them.",
  personality: {
    summary: "Measured and perceptive.",
    voice: "Precise, never cold.",
    decisionStyle: "She checks the evidence twice before choosing.",
    worldview: "Every signal has a sender.",
    contradictions: ["She craves certainty while following impossible clues."],
    mythology: "She was raised on stories of the final dry station.",
    sampleLines: ["Listen for the relay before you trust the rail."],
  },
  motives: ["Find the missing stationmaster."],
  beliefs: ["Routes remember their travelers."],
  drives: ["Protect stranded passengers."],
  traits: ["Careful"],
  skills: [{ name: "Signal reading", tier: "Skilled" }],
  flaws: ["Keeps dangerous secrets alone."],
  specialties: ["Flooded rail maps"],
  inventory: ["Brass signal key"],
  signatureItems: ["Blue field notebook"],
  source: {
    kind: "created",
    importMode: null,
    label: "Created character",
  },
};

const state = {
  ...versions,
  campaignId: "campaign-one",
  phase: "character_required",
  character: null,
  openingOptions: [],
  currentLocation: null,
  visibleActors: [],
  visibleRoutes: [],
  visiblePressures: [],
  possessions: [],
  obligations: [],
  commitments: [],
  narration: null,
  narrationOperation: null,
  utilityActions: [],
  consequences: [],
  decisionOutcomes: [],
  activeTurn: null,
  journalCursor: 0,
  projectionHash: "a".repeat(64),
};

const readyNarration = {
  narrationId: "narration-one",
  turnId: "turn-one",
  beats: [{ beatId: "beat-one", text: "The yard waits under the rain." }],
  displayText: "The yard waits under the rain.",
  suggestedActions: [{ choiceHandle: "wait", label: "Wait 10 minutes" }],
  effects: [],
  createdAt: 10,
};

const readyNarrationOperation = {
  operationId: "narration-operation-one",
  resultId: "result-one",
  turnId: "turn-one",
  narrationId: "narration-one",
  packetHash: "b".repeat(64),
  receiptIds: ["receipt-one"],
  status: "complete" as const,
  attemptId: "narration-attempt-one",
  attempt: 1,
  conciseResult: {
    displayText: readyNarration.displayText,
    suggestedActions: readyNarration.suggestedActions,
  },
  createdAt: 10,
  completedAt: 11,
};

const readyState = {
  ...state,
  phase: "ready" as const,
  character: {
    name: "Mara",
    monogram: "M",
    descriptor: "Signal cartographer",
    accent: "ember",
  },
  currentLocation: {
    handle: "location-yard",
    name: "Signal Yard",
    description: "Rain crosses the rails.",
  },
  narration: readyNarration,
  narrationOperation: readyNarrationOperation,
  utilityActions: [{ choiceHandle: "wait", label: "Wait 10 minutes" }],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function eventBlock(
  event: CampaignPlaySseEvent,
  lineEnding = "\n",
  id = String(event.sequence),
  eventName = event.type,
): string {
  return [
    `id: ${id}`,
    `event: ${eventName}`,
    `data: ${JSON.stringify(event)}`,
    "",
    "",
  ].join(lineEnding);
}

function streamResponse(chunks: string[], contentType = "text/event-stream; charset=UTF-8"): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), {
    status: 200,
    headers: { "Content-Type": contentType },
  });
}

function publicError(code: CampaignPlayErrorResponse["code"]): CampaignPlayErrorResponse {
  const context = code === "campaign_not_found" || code === "world_not_accepted" ? null : "character_required";
  const retryEligible = code === "turn_interrupted" || code === "service_unavailable";
  const status = code === "campaign_not_found" || code === "turn_not_found"
    ? 404
    : code === "turn_interrupted" || code === "turn_failed" || code === "service_unavailable"
      ? 503
      : ["character_already_exists", "opening_already_completed", "idempotency_conflict", "stale_world_version", "stale_runtime_revision", "turn_in_progress", "turn_not_resumable"].includes(code)
        ? 409
        : 422;
  return {
    code,
    status: status as 404 | 409 | 422 | 503,
    campaignPhase: context,
    acceptedWorldVersion: context === null ? null : 1,
    expectedWorldVersion: code === "stale_world_version" ? 1 : null,
    currentWorldVersion: context === null ? null : 1,
    expectedRuntimeRevision: code === "stale_runtime_revision" ? 1 : null,
    currentRuntimeRevision: context === null ? null : 1,
    turnId: null,
    retryEligible,
    unmetRequirements: code === "world_not_playable" ? ["missing_world"] : [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Campaign Play API", () => {
  it.each([undefined, "model_accepted", "deterministic_continuity"] as const)(
    "accepts a ready narration operation with sourceKind %s",
    async (sourceKind) => {
      const narrationOperation = sourceKind === undefined
        ? { ...readyNarrationOperation }
        : { ...readyNarrationOperation, sourceKind };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
        ...readyState,
        narrationOperation,
      })));

      await expect(loadCampaignPlayState("campaign-one")).resolves.toMatchObject({
        phase: "ready",
        narration: readyNarration,
        narrationOperation,
        utilityActions: readyState.utilityActions,
      });
    },
  );

  it.each([
    "unsupported_source",
    "model_accepted_extra",
  ])("rejects an invalid narration operation sourceKind: %s", async (sourceKind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      narrationOperation: { ...readyNarrationOperation, sourceKind },
    })));

    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("rejects closed decision outcome statuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      decisionOutcomes: [{
        decisionKey: "decision_bridge_guard",
        actorHandle: "actor_guard",
        kind: "yes_no",
        disposition: "accept",
        status: "closed",
        sourceTurnId: "turn_one",
        summary: "The bridge guard asks for a toll.",
      }],
    })));

    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("rejects unrelated narration operation keys even when sourceKind is valid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      narrationOperation: {
        ...readyNarrationOperation,
        sourceKind: "model_accepted",
        unexpected: true,
      },
    })));

    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("loads starting possessions while opening is still required", async () => {
    const openingState = {
      ...state,
      worldVersion: 5,
      runtimeRevision: 2,
      phase: "opening_required",
      character: {
        name: "Lenna Vey",
        monogram: "LV",
        descriptor: "An itinerant lamp-glass mender.",
        accent: "amber-7",
      },
      openingOptions: [{
        locationHandle: "location-terrace",
        name: "Glasswater Terrace",
        description: "A salt-streaked working terrace.",
        roles: [{ handle: "role-outsider", label: "Outsider" }],
        arrivalModes: [{ handle: "arrival-foot", label: "On foot" }],
        immediateSituations: [{ handle: "situation-work", label: "Looking for work" }],
      }],
      possessions: [
        { handle: "possession-crate", name: "Padded chimney crate", quantity: 1 },
        { handle: "possession-tools", name: "Lamp-glass mending tools", quantity: 1 },
      ],
      obligations: [],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(openingState)));
    await expect(loadCampaignPlayState("campaign-one")).resolves.toMatchObject({
      phase: "opening_required",
      possessions: openingState.possessions,
      obligations: openingState.obligations,
    });
  });

  it("loads directed payable and receivable obligations from the public state", async () => {
    const obligations = [{
      handle: "obligation-payable",
      direction: "payable" as const,
      counterpartyHandle: "actor-mara",
      counterpartyName: "Mara Venn",
      unitKey: "copper",
      outstandingAmount: 7,
    }, {
      handle: "obligation-receivable",
      direction: "receivable" as const,
      counterpartyHandle: "actor-oren",
      counterpartyName: "Oren Tide",
      unitKey: "copper",
      outstandingAmount: 4,
    }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...state,
      phase: "ready",
      character: {
        name: "Mara",
        monogram: "M",
        descriptor: "Signal cartographer",
        accent: "ember",
      },
      currentLocation: {
        handle: "location-yard",
        name: "Signal Yard",
        description: "Rain crosses the rails.",
      },
      obligations,
      narration: {
        narrationId: "narration-one",
        turnId: "opening-one",
        beats: [{ beatId: "beat-one", text: "The yard waits under the rain." }],
        displayText: "The yard waits under the rain.",
        suggestedActions: [],
        effects: [],
        createdAt: 10,
      },
    })));

    await expect(loadCampaignPlayState("campaign-one")).resolves.toMatchObject({ obligations });
  });

  it("loads active and completed paid-delivery commitments from the public state", async () => {
    const commitments = [{
      handle: "commitment-active",
      kind: "paid_delivery" as const,
      status: "active" as const,
      counterpartyHandle: "actor-orsa",
      counterpartyName: "Orsa Pell",
      title: "Carry the sealed dispatch",
      subjectName: "Sealed dispatch",
      destinationHandle: "location-north-cut",
      destinationName: "North Cut",
      feeUnit: "copper" as const,
      feeAmount: 16,
      paymentTiming: "on_completion" as const,
      dueWorldTimeLabel: "Before dawn",
    }, {
      handle: "commitment-completed",
      kind: "paid_delivery" as const,
      status: "completed" as const,
      counterpartyHandle: "actor-ilya",
      counterpartyName: "Ilya Venn",
      title: "Return the signal key",
      subjectName: "Brass signal key",
      destinationHandle: "location-signal-yard",
      destinationName: "Signal Yard",
      feeUnit: "copper" as const,
      feeAmount: 8,
      paymentTiming: "on_completion" as const,
      dueWorldTimeLabel: null,
    }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      commitments,
    })));

    await expect(loadCampaignPlayState("campaign-one")).resolves.toMatchObject({ commitments });
  });

  it("loads unpaid delivery work without inventing payment terms", async () => {
    const commitments = [{
      handle: "commitment-unpaid-active",
      kind: "unpaid_delivery" as const,
      status: "active" as const,
      counterpartyHandle: "actor-joss",
      counterpartyName: "Joss Pebbler",
      title: "Carry the evacuation roll",
      subjectName: "Evacuation signature roll",
      destinationHandle: "location-quayside",
      destinationName: "Quayside Landing",
      dueWorldTimeLabel: null,
    }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      commitments,
    })));

    await expect(loadCampaignPlayState("campaign-one")).resolves.toMatchObject({ commitments });
  });

  it("rejects payment terms on unpaid delivery work", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      commitments: [{
        handle: "commitment-unpaid-active",
        kind: "unpaid_delivery",
        status: "active",
        counterpartyHandle: "actor-joss",
        counterpartyName: "Joss Pebbler",
        title: "Carry the evacuation roll",
        subjectName: "Evacuation signature roll",
        destinationHandle: "location-quayside",
        destinationName: "Quayside Landing",
        dueWorldTimeLabel: null,
        feeUnit: "copper",
        feeAmount: 1,
        paymentTiming: "on_completion",
      }],
    })));

    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("fails closed when commitments are missing from the public state", async () => {
    const { commitments: omittedCommitments, ...withoutCommitments } = readyState;
    void omittedCommitments;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(withoutCommitments)));

    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("fails closed when commitments contain an extra field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      commitments: [{
        handle: "commitment-active",
        kind: "paid_delivery",
        status: "active",
        counterpartyHandle: "actor-orsa",
        counterpartyName: "Orsa Pell",
        title: "Carry the sealed dispatch",
        subjectName: "Sealed dispatch",
        destinationHandle: "location-north-cut",
        destinationName: "North Cut",
        feeUnit: "copper",
        feeAmount: 16,
        paymentTiming: "on_completion",
        dueWorldTimeLabel: "Before dawn",
        internalId: "commitment-secret",
      }],
    })));

    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("fails closed for invalid commitment terms and internal handles", async () => {
    const invalidTerms = {
      handle: "commitment-active",
      kind: "paid_delivery",
      status: "active",
      counterpartyHandle: "actor-orsa",
      counterpartyName: "Orsa Pell",
      title: "Carry the sealed dispatch",
      subjectName: "Sealed dispatch",
      destinationHandle: "location-north-cut",
      destinationName: "North Cut",
      feeUnit: "copper",
      feeAmount: 0,
      paymentTiming: "on_completion",
      dueWorldTimeLabel: "Before dawn",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      commitments: [invalidTerms],
    })));

    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      commitments: [{ ...invalidTerms, feeAmount: 16, handle: "commitment:secret" }],
    })));

    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("preserves exact commitment bindings on narration choices and admission requests", async () => {
    const commitmentBinding = {
      commitmentHandle: "commitment-active",
      action: "collect" as const,
      counterpartyHandle: "actor-orsa",
      subjectName: "Sealed dispatch",
      destinationHandle: "location-north-cut",
    };
    const suggestedAction = {
      choiceHandle: "choice-collect-dispatch",
      label: "Ask Orsa Pell for Sealed dispatch",
      commitmentBinding,
    };
    const narration = {
      ...readyNarration,
      suggestedActions: [suggestedAction],
    };
    const narrationOperation = {
      ...readyNarrationOperation,
      conciseResult: {
        displayText: narration.displayText,
        suggestedActions: [suggestedAction],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      commitments: [{
        handle: "commitment-active",
        kind: "paid_delivery",
        status: "active",
        counterpartyHandle: "actor-orsa",
        counterpartyName: "Orsa Pell",
        title: "Carry the sealed dispatch",
        subjectName: "Sealed dispatch",
        destinationHandle: "location-north-cut",
        destinationName: "North Cut",
        feeUnit: "copper",
        feeAmount: 16,
        paymentTiming: "on_completion",
        dueWorldTimeLabel: "Before dawn",
      }],
      narration,
      narrationOperation,
    })));

    await expect(loadCampaignPlayState("campaign-one")).resolves.toMatchObject({
      narration: { suggestedActions: [suggestedAction] },
      narrationOperation: { conciseResult: { suggestedActions: [suggestedAction] } },
    });

    const mixedBinding = {
      ...suggestedAction,
      decisionBinding: {
        decisionKey: "decision-one",
        actorHandle: "actor-orsa",
        kind: "offer",
        disposition: "accept",
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      narration: { ...readyNarration, suggestedActions: [mixedBinding] },
      narrationOperation: {
        ...readyNarrationOperation,
        conciseResult: {
          displayText: readyNarration.displayText,
          suggestedActions: [mixedBinding],
        },
      },
    })));
    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("preserves an exact copper receivable binding on narration choices", async () => {
    const obligationBinding = {
      obligationHandle: "obligation-aldous",
      debtorHandle: "actor-aldous",
      creditorHandle: "actor-mara",
      unitKey: "copper" as const,
      amount: 12,
    };
    const suggestedAction = {
      choiceHandle: "choice-collect-debt",
      label: "Collect 12 copper from Aldous Crane",
      obligationBinding,
    };
    const narration = {
      ...readyNarration,
      suggestedActions: [suggestedAction],
    };
    const narrationOperation = {
      ...readyNarrationOperation,
      conciseResult: {
        displayText: narration.displayText,
        suggestedActions: [suggestedAction],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      narration,
      narrationOperation,
    })));

    await expect(loadCampaignPlayState("campaign-one")).resolves.toMatchObject({
      narration: { suggestedActions: [suggestedAction] },
      narrationOperation: { conciseResult: { suggestedActions: [suggestedAction] } },
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      narration: {
        ...readyNarration,
        suggestedActions: [{
          ...suggestedAction,
          obligationBinding: { ...obligationBinding, unitKey: "silver" },
        }],
      },
      narrationOperation: {
        ...readyNarrationOperation,
        conciseResult: {
          displayText: readyNarration.displayText,
          suggestedActions: [{
            ...suggestedAction,
            obligationBinding: { ...obligationBinding, unitKey: "silver" },
          }],
        },
      },
    })));
    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("forwards the exact commitment binding when admitting a suggested action", async () => {
    const request = {
      source: "suggested" as const,
      idempotencyKey: "turn-commitment-collect",
      choiceHandle: "choice-collect-dispatch",
      commitmentBinding: {
        commitmentHandle: "commitment-active",
        action: "collect" as const,
        counterpartyHandle: "actor-orsa",
        subjectName: "Sealed dispatch",
        destinationHandle: "location-north-cut",
      },
      expectedWorldVersion: 2,
      expectedRuntimeRevision: 2,
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ turnId: "turn-commitment-collect", sequence: 1 }, 202),
    );
    vi.stubGlobal("fetch", fetchMock);

    await admitCampaignPlayTurn("campaign-one", request);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/campaigns/campaign-one/play/turns",
      expect.objectContaining({ body: JSON.stringify(request) }),
    );
  });

  it("forwards the exact receivable binding when admitting a suggested action", async () => {
    const request = {
      source: "suggested" as const,
      idempotencyKey: "turn-receivable-collect",
      choiceHandle: "choice-collect-debt",
      obligationBinding: {
        obligationHandle: "obligation-aldous",
        debtorHandle: "actor-aldous",
        creditorHandle: "actor-mara",
        unitKey: "copper" as const,
        amount: 12,
      },
      expectedWorldVersion: 2,
      expectedRuntimeRevision: 2,
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ turnId: "turn-receivable-collect", sequence: 1 }, 202),
    );
    vi.stubGlobal("fetch", fetchMock);

    await admitCampaignPlayTurn("campaign-one", request);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/campaigns/campaign-one/play/turns",
      expect.objectContaining({ body: JSON.stringify(request) }),
    );
  });

  it("preserves the opaque utility wait action on a ready public state", async () => {
    const utilityActions = [{ choiceHandle: "opaque-wait", label: "Wait 10 minutes" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...state,
      phase: "ready",
      character: {
        name: "Mara",
        monogram: "M",
        descriptor: "Signal cartographer",
        accent: "ember",
      },
      currentLocation: {
        handle: "location-yard",
        name: "Signal Yard",
        description: "Rain crosses the rails.",
      },
      narration: {
        narrationId: "narration-one",
        turnId: "opening-one",
        beats: [{ beatId: "beat-one", text: "The yard waits under the rain." }],
        displayText: "The yard waits under the rain.",
        suggestedActions: [],
        effects: [],
        createdAt: 10,
      },
      utilityActions,
    })));

    await expect(loadCampaignPlayState("campaign-one")).resolves.toMatchObject({
      utilityActions,
    });
  });

  it("rejects utility actions outside a ready state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...state,
      utilityActions: [{ choiceHandle: "opaque-wait", label: "Wait 10 minutes" }],
    })));

    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("uses exact campaign-scoped endpoints, JSON bodies, and admission status contracts", async () => {
    const turnAdmission = { turnId: "turn-one", sequence: 1 };
    const addressedCampaignId = "campaign:one";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ...state, campaignId: addressedCampaignId }))
      .mockResolvedValueOnce(jsonResponse({ draft }))
      .mockResolvedValueOnce(jsonResponse({ draft: { ...draft, source: { ...draft.source, kind: "generated", label: "Generated character" } } }))
      .mockResolvedValueOnce(jsonResponse({ research: { summary: "Found one source.", sources: [{ label: "Archive", excerpt: "The station closed at dusk." }] } }))
      .mockResolvedValueOnce(jsonResponse({ ...versions, worldVersion: 5, actorHandle: "actor-mara" }))
      .mockResolvedValueOnce(jsonResponse(turnAdmission, 202))
      .mockResolvedValueOnce(jsonResponse(turnAdmission, 202))
      .mockResolvedValueOnce(jsonResponse({
        ...versions,
        campaignId: addressedCampaignId,
        turn: {
          turnId: "turn-one",
          turnKind: "player_action",
          status: "processing",
          progress: "interpreting",
          lastEventSequence: 1,
          retryEligible: false,
          submittedAt: 1,
          completedAt: null,
        },
        result: { status: "processing" },
      }))
      .mockResolvedValueOnce(jsonResponse(turnAdmission, 202))
      .mockResolvedValueOnce(jsonResponse({
        operationId: "narration-operation-one",
        attemptId: "narration-attempt-two",
        attempt: 2,
        status: "running",
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ ...versions, campaignId: addressedCampaignId, entries: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    const cardRequest = { cardJson: "{}", importMode: "native" as const };
    const generatedRequest = { prompt: "A relay keeper", research: null };
    const researchRequest = { query: "drowned station" };
    const playerRequest = {
      acceptedWorldVersion: 1,
      expectedWorldVersion: 1,
      expectedRuntimeRevision: 1,
      source: "created" as const,
      character: draft,
    };
    const openingRequest = {
      idempotencyKey: "opening-one",
      expectedWorldVersion: 2,
      expectedRuntimeRevision: 2,
      startingConditions: { mode: "delegate" as const },
    };
    const turnRequest = {
      source: "freeform" as const,
      idempotencyKey: "turn-one",
      text: "Inspect the platform.",
      expectedWorldVersion: 2,
      expectedRuntimeRevision: 2,
    };
    const resumeRequest = { expectedWorldVersion: 2, expectedRuntimeRevision: 3 };
    const narrationRecoveryRequest = {
      operationId: "narration-operation-one",
      resultId: "result-one",
      narrationId: "narration-one",
      packetHash: "b".repeat(64),
      receiptIds: ["receipt-one"],
    };

    await loadCampaignPlayState(addressedCampaignId);
    await parseCampaignPlayPlayerCard(addressedCampaignId, cardRequest);
    await generateCampaignPlayPlayerDraft(addressedCampaignId, generatedRequest);
    await researchCampaignPlayPlayer(addressedCampaignId, researchRequest);
    await putCampaignPlayPlayer(addressedCampaignId, playerRequest);
    await admitCampaignPlayOpening(addressedCampaignId, openingRequest);
    await admitCampaignPlayTurn(addressedCampaignId, turnRequest);
    await loadCampaignPlayTurn(addressedCampaignId, "turn-one");
    await resumeCampaignPlayTurn(addressedCampaignId, "turn-one", resumeRequest);
    await recoverCampaignPlayNarration(
      addressedCampaignId,
      "turn-one",
      narrationRecoveryRequest,
    );
    await loadCampaignPlayJournal(addressedCampaignId, { cursor: 0, limit: 20 });

    const base = "http://localhost:3001/api/campaigns/campaign%3Aone/play";
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${base}/state`, {
      method: "GET",
      cache: "no-store",
      signal: undefined,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${base}/player/cards/parse`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cardRequest),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, `${base}/player/drafts/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(generatedRequest),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, `${base}/player/research`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(researchRequest),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, `${base}/player`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(playerRequest),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(6, `${base}/opening`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(openingRequest),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(7, `${base}/turns`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(turnRequest),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(8, `${base}/turns/turn-one`, {
      method: "GET",
      cache: "no-store",
      signal: undefined,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(9, `${base}/turns/turn-one/resume`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resumeRequest),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(10, `${base}/turns/turn-one/narration/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(narrationRecoveryRequest),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(11, `${base}/journal?cursor=0&limit=20`, { method: "GET" });
  });

  it("keeps ordinary journal entries unchanged", async () => {
    const entry = {
      observationHandle: "observation-ordinary",
      title: "A sealed road",
      text: "The eastern gate closed before dawn.",
      whereOrRoute: "Eastern gate",
      worldTimeLabel: "Before dawn",
      consequence: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...versions,
      campaignId: "campaign-one",
      entries: [entry],
      nextCursor: null,
    })));

    await expect(loadCampaignPlayJournal("campaign-one", { cursor: 0, limit: 20 }))
      .resolves.toEqual({ ...versions, campaignId: "campaign-one", entries: [entry], nextCursor: null });
  });

  it("accepts a journal entry with a decision outcome", async () => {
    const decisionOutcome = {
      decisionKey: "decision-one",
      actorName: "Mara Venn",
      actorHandle: "actor-mara",
      kind: "yes_no",
      disposition: "accept",
      summary: "The bridge guard asks for a toll.",
      selectedLabel: "Pay the toll",
    } as const;
    const entry = {
      observationHandle: "observation-decision-outcome",
      title: "Decision accepted",
      text: "You pay the bridge toll.",
      whereOrRoute: "Eastern gate",
      worldTimeLabel: "Morning",
      consequence: null,
      decisionOutcome,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...versions,
      campaignId: "campaign-one",
      entries: [entry],
      nextCursor: null,
    })));

    await expect(loadCampaignPlayJournal("campaign-one", { cursor: 0, limit: 20 }))
      .resolves.toMatchObject({ entries: [entry] });
  });

  it("accepts a journal entry with an opening decision", async () => {
    const decision = {
      decisionKey: "decision-one",
      actorName: "Mara Venn",
      actorHandle: "actor-mara",
      kind: "yes_no",
      summary: "The bridge guard asks for a toll.",
      acceptLabel: "Pay the toll",
      declineLabel: "Refuse the toll",
      acceptEffect: null,
    } as const;
    const entry = {
      observationHandle: "observation-opening-decision",
      title: "A choice at hand",
      text: "Mara puts a choice before you.",
      whereOrRoute: "Eastern gate",
      worldTimeLabel: "Morning",
      consequence: null,
      decision,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...versions,
      campaignId: "campaign-one",
      entries: [entry],
      nextCursor: null,
    })));

    await expect(loadCampaignPlayJournal("campaign-one", { cursor: 0, limit: 20 }))
      .resolves.toMatchObject({ entries: [entry] });
  });

  it.each([
    ["decision", {
      decisionKey: "decision-one",
      actorName: "Mara Venn",
      actorHandle: "actor-mara",
      kind: "yes_no",
      summary: "The bridge guard asks for a toll.",
      acceptLabel: "",
      declineLabel: "Refuse the toll",
    }],
    ["decisionOutcome", {
      decisionKey: "decision-one",
      actorName: "Mara Venn",
      actorHandle: "actor-mara",
      kind: "yes_no",
      disposition: "accept",
      summary: "The bridge guard asks for a toll.",
      selectedLabel: "",
    }],
  ] as const)("rejects malformed optional journal %s fields", async (field, malformedValue) => {
    const entry = {
      observationHandle: `observation-malformed-${field}`,
      title: "A malformed decision",
      text: "This entry must not be accepted.",
      whereOrRoute: "Eastern gate",
      worldTimeLabel: "Morning",
      consequence: null,
      [field]: malformedValue,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...versions,
      campaignId: "campaign-one",
      entries: [entry],
      nextCursor: null,
    })));

    await expect(loadCampaignPlayJournal("campaign-one", { cursor: 0, limit: 20 }))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("marks authority reads no-store and forwards their caller signal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(state))
      .mockResolvedValueOnce(jsonResponse({
        ...versions,
        campaignId: "campaign-one",
        turn: {
          turnId: "turn-one",
          turnKind: "player_action",
          status: "processing",
          progress: "interpreting",
          lastEventSequence: 1,
          retryEligible: false,
          submittedAt: 1,
          completedAt: null,
        },
        result: { status: "processing" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await loadCampaignPlayState("campaign-one", { signal: controller.signal });
    await loadCampaignPlayTurn("campaign-one", "turn-one", { signal: controller.signal });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/campaigns/campaign-one/play/state",
      { method: "GET", cache: "no-store", signal: controller.signal },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/campaigns/campaign-one/play/turns/turn-one",
      { method: "GET", cache: "no-store", signal: controller.signal },
    );
  });

  it("forwards an optional admission signal without changing the request", async () => {
    const controller = new AbortController();
    const request = {
      source: "suggested" as const,
      idempotencyKey: "turn-one",
      choiceHandle: "wait",
      expectedWorldVersion: 2,
      expectedRuntimeRevision: 2,
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ turnId: "turn-one", sequence: 1 }, 202));
    vi.stubGlobal("fetch", fetchMock);

    await admitCampaignPlayTurn("campaign-one", request, { signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/campaigns/campaign-one/play/turns",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      },
    );
  });

  it("requires strict public errors and exact 202 admission responses", async () => {
    const error = publicError("stale_world_version");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(error, 409)));

    await expect(admitCampaignPlayTurn("campaign-1", {
      source: "suggested",
      idempotencyKey: "turn-one",
      choiceHandle: "wait",
      expectedWorldVersion: 1,
      expectedRuntimeRevision: 1,
    })).rejects.toMatchObject({
      name: "CampaignPlayApiError",
      code: "stale_world_version",
      status: 409,
      details: error,
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ turnId: "turn-one", sequence: 1 })));
    await expect(admitCampaignPlayOpening("campaign-1", {
      idempotencyKey: "opening-one",
      expectedWorldVersion: 1,
      expectedRuntimeRevision: 1,
      startingConditions: { mode: "delegate" },
    })).rejects.toMatchObject({ code: "service_unavailable", status: 200, invalidResponse: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ code: "invalid_intent" }, 422)));
    await expect(loadCampaignPlayState("campaign-1")).rejects.toBeInstanceOf(CampaignPlayApiError);
  });

  it("rejects malformed successful player and state responses", async () => {
    const malformedDraft = structuredClone(draft) as CampaignPlayCharacterDraft & { personality: CampaignPlayCharacterDraft["personality"] & { extra: string } };
    malformedDraft.personality.extra = "unexpected";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ draft: malformedDraft })));
    await expect(parseCampaignPlayPlayerCard("campaign-1", { cardJson: "{}", importMode: "native" }))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    for (const worldVersion of [1, CAMPAIGN_PLAY_LIMITS.characterList + 3]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
        ...versions,
        worldVersion,
        actorHandle: "actor-mara",
      })));
      await expect(putCampaignPlayPlayer("campaign-1", {
        acceptedWorldVersion: 1,
        expectedWorldVersion: 1,
        expectedRuntimeRevision: 1,
        source: "created",
        character: draft,
      })).rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ ...state, projectionHash: "not-a-hash" })));
    await expect(loadCampaignPlayState("campaign-1"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...state,
      possessions: [{ handle: "possession-one", name: "Brass key", quantity: 0 }],
    })));
    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    const longMultibyteText = "界".repeat(CAMPAIGN_PLAY_LIMITS.text);
    const oversizedState = {
      ...state,
      phase: "ready",
      character: {
        name: "Mara",
        monogram: "M",
        descriptor: "Signal cartographer",
        accent: "ember",
      },
      currentLocation: {
        handle: "location-one",
        name: "Signal Yard",
        description: longMultibyteText,
      },
      narration: {
        narrationId: "narration-one",
        turnId: "opening-one",
        beats: Array.from({ length: CAMPAIGN_PLAY_LIMITS.narrationBeats }, (_, index) => ({
          beatId: `beat-${index}`,
          text: longMultibyteText,
        })),
        displayText: "界".repeat(CAMPAIGN_PLAY_LIMITS.narrationText),
        suggestedActions: [],
        effects: [],
        createdAt: 10,
      },
      consequences: Array.from({ length: CAMPAIGN_PLAY_LIMITS.newObservations }, (_, index) => ({
        observationHandle: `observation-${index}`,
        performingActorHandle: null,
        performingActorName: null,
        whatChanged: longMultibyteText,
        whereOrRoute: "Signal Yard",
        worldTimeLabel: "Before dawn",
        causalCue: "visible_aftermath",
      })),
    };
    expect(new TextEncoder().encode(JSON.stringify(oversizedState)).byteLength)
      .toBeGreaterThan(CAMPAIGN_PLAY_LIMITS.publicStateBytes);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(oversizedState)));
    await expect(loadCampaignPlayState("campaign-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("accepts an interrupted turn that is no longer retry eligible", async () => {
    const interruptedTurn = {
      turnId: "turn-one",
      turnKind: "player_action" as const,
      status: "interrupted" as const,
      progress: null,
      lastEventSequence: 3,
      retryEligible: false,
      submittedAt: 1,
      completedAt: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...versions,
      campaignId: "campaign-one",
      turn: interruptedTurn,
      result: { status: "interrupted", errorCode: "turn_interrupted" },
    })));
    await expect(loadCampaignPlayTurn("campaign-one", "turn-one"))
      .resolves.toMatchObject({ turn: interruptedTurn });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...readyState,
      phase: "narration_pending",
      narration: null,
      narrationOperation: null,
      utilityActions: [],
      activeTurn: interruptedTurn,
    })));
    await expect(loadCampaignPlayState("campaign-one"))
      .resolves.toMatchObject({ phase: "narration_pending", activeTurn: interruptedTurn });
  });

  it("rejects valid payloads whose campaign or turn identity differs from the addressed resource", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...versions,
      campaignId: "campaign-two",
      turn: {
        turnId: "turn-one",
        turnKind: "player_action",
        status: "interrupted",
        progress: null,
        lastEventSequence: 3,
        retryEligible: false,
        submittedAt: 1,
        completedAt: null,
      },
      result: { status: "interrupted", errorCode: "turn_interrupted" },
    })));
    await expect(loadCampaignPlayTurn("campaign-one", "turn-one"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(state)));
    await expect(loadCampaignPlayState("campaign-two"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...versions,
      campaignId: "campaign-one",
      turn: {
        turnId: "turn-one",
        turnKind: "player_action",
        status: "processing",
        progress: "interpreting",
        lastEventSequence: 1,
        retryEligible: false,
        submittedAt: 1,
        completedAt: null,
      },
      result: { status: "processing" },
    })));
    await expect(loadCampaignPlayTurn("campaign-one", "turn-two"))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ...versions,
      campaignId: "campaign-one",
      entries: [],
      nextCursor: null,
    })));
    await expect(loadCampaignPlayJournal("campaign-two", { cursor: 0, limit: 20 }))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("accepts unknown optional character descriptors without client-side defaults", async () => {
    const optionalDraft = structuredClone(draft);
    optionalDraft.species = "";
    optionalDraft.gender = "";
    optionalDraft.ageText = "";
    optionalDraft.appearance = "";
    optionalDraft.personality = {
      summary: "",
      voice: "",
      decisionStyle: "",
      worldview: "",
      contradictions: ["x".repeat(300)],
      mythology: "",
      sampleLines: ["y".repeat(300)],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ draft: optionalDraft })));

    await expect(generateCampaignPlayPlayerDraft("campaign-1", {
      prompt: "An outsider whose age and origin are unspecified.",
      research: null,
    })).resolves.toEqual({ draft: optionalDraft });
  });

  it("parses chunked LF and CRLF records, suppresses exact duplicates, and returns the terminal event", async () => {
    const progressed: CampaignPlaySseEvent = {
      sequence: 3,
      turnId: "turn-one",
      ...versions,
      createdAt: 10,
      type: "turn.progressed",
      progress: "settling",
    };
    const completed: CampaignPlaySseEvent = {
      sequence: 4,
      turnId: "turn-one",
      ...versions,
      createdAt: 11,
      type: "turn.completed",
      retryEligible: false,
    };
    const payload = eventBlock(progressed, "\r\n") + eventBlock(progressed, "\n") + eventBlock(completed, "\n");
    const splitAt = payload.indexOf("settling") + 4;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([
      payload.slice(0, splitAt),
      payload.slice(splitAt, splitAt + 5),
      payload.slice(splitAt + 5),
    ])));
    const received: CampaignPlaySseEvent[] = [];

    const result = await streamCampaignPlayTurnEvents("campaign one", "turn-one", {
      afterSequence: 2,
      onEvent: (event) => received.push(event),
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/campaigns/campaign%20one/play/turns/turn-one/events?afterSequence=2",
      { method: "GET", signal: undefined },
    );
    expect(received).toEqual([progressed, completed]);
    expect(result).toEqual({ lastSequence: 4, terminalEvent: completed });
  });

  it("accepts false retry eligibility for interrupted SSE events", async () => {
    const interrupted: CampaignPlaySseEvent = {
      sequence: 1,
      turnId: "turn-one",
      ...versions,
      createdAt: 1,
      type: "turn.interrupted",
      retryEligible: false,
    };
    const received: CampaignPlaySseEvent[] = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      streamResponse([eventBlock(interrupted)]),
    ));

    await expect(streamCampaignPlayTurnEvents("campaign-1", "turn-one", {
      afterSequence: 0,
      onEvent: (event) => received.push(event),
    })).resolves.toEqual({ lastSequence: 1, terminalEvent: interrupted });
    expect(received).toEqual([interrupted]);
  });

  it("rejects SSE content-type, identity, conflicting duplicates, gaps, and out-of-order sequences", async () => {
    const interrupted = {
      sequence: 1,
      turnId: "turn-one",
      ...versions,
      createdAt: 1,
      type: "turn.interrupted",
      retryEligible: "false",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      streamResponse([eventBlock(interrupted as unknown as CampaignPlaySseEvent)]),
    ));
    await expect(streamCampaignPlayTurnEvents("campaign-1", "turn-one", { afterSequence: 0, onEvent: vi.fn() }))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    const accepted: CampaignPlaySseEvent = {
      sequence: 1,
      turnId: "turn-one",
      ...versions,
      createdAt: 1,
      type: "turn.accepted",
      status: "processing",
    };
    const progressed: CampaignPlaySseEvent = {
      sequence: 3,
      turnId: "turn-one",
      ...versions,
      createdAt: 2,
      type: "turn.progressed",
      progress: "world_acting",
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([eventBlock(accepted)], "application/json")));
    await expect(streamCampaignPlayTurnEvents("campaign-1", "turn-one", { afterSequence: 0, onEvent: vi.fn() }))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([eventBlock(accepted, "\n", "8")])));
    await expect(streamCampaignPlayTurnEvents("campaign-1", "turn-one", { afterSequence: 0, onEvent: vi.fn() }))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([
      eventBlock(accepted, "\n", "1", "turn.progressed"),
    ])));
    await expect(streamCampaignPlayTurnEvents("campaign-1", "turn-one", { afterSequence: 0, onEvent: vi.fn() }))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([eventBlock(accepted) + eventBlock({ ...accepted, status: "processing", createdAt: 9 })])));
    await expect(streamCampaignPlayTurnEvents("campaign-1", "turn-one", { afterSequence: 0, onEvent: vi.fn() }))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([eventBlock(progressed)])));
    await expect(streamCampaignPlayTurnEvents("campaign-1", "turn-one", { afterSequence: 0, onEvent: vi.fn() }))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });

    const afterCursor = { ...accepted, sequence: 3, createdAt: 3 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([
      eventBlock(afterCursor),
      eventBlock(accepted),
    ])));
    await expect(streamCampaignPlayTurnEvents("campaign-1", "turn-one", { afterSequence: 2, onEvent: vi.fn() }))
      .rejects.toMatchObject({ code: "service_unavailable", invalidResponse: true });
  });

  it("returns a nullable terminal event for an empty stream beyond a terminal tail and forwards AbortSignal", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([])));

    const result = await streamCampaignPlayTurnEvents("campaign-1", "turn-one", {
      afterSequence: 12,
      signal: controller.signal,
      onEvent: vi.fn(),
    });

    expect(result).toEqual({ lastSequence: 12, terminalEvent: null });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/campaigns/campaign-1/play/turns/turn-one/events?afterSequence=12",
      { method: "GET", signal: controller.signal },
    );
  });

  it("preserves an abort raised by fetch", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));

    await expect(streamCampaignPlayTurnEvents("campaign-1", "turn-one", {
      afterSequence: 0,
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    })).rejects.toBe(abort);
  });
});
