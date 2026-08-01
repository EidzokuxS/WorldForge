import { describe, expect, it, vi } from "vitest";
import type {
  CampaignPlayCharacterDraft,
  CampaignPlayState,
  CampaignPlayTurnReadResponse,
} from "@worldforge/shared";
import {
  campaignPlayErrorResponseSchema,
  campaignPlayJournalPageSchema,
  campaignPlayStateSchema,
  campaignPlayTurnAdmissionResponseSchema,
  campaignPlayTurnReadResponseSchema,
} from "../campaign-play/contracts.js";
import {
  CampaignPlayApplicationError,
  type CampaignPlayApplication,
} from "../campaign-play/campaign-play-application.js";
import { createCampaignPlayRoutes } from "./campaign-play.js";

const CAMPAIGN_ID = "88888888-8888-4888-8888-888888888888";

function characterDraft(): CampaignPlayCharacterDraft {
  return {
    name: "Mara Venn",
    summary: "A careful mechanic following an impossible signal.",
    species: "Human",
    gender: "Woman",
    ageText: "Thirty-two",
    appearance: "Oil-dark coat and brass spectacles.",
    biography: "Mara repairs instruments and follows impossible harmonics.",
    personality: {
      summary: "Patient and observant.",
      voice: "Precise and dry.",
      decisionStyle: "Tests one variable at a time.",
      worldview: "Every mystery leaves a trace.",
      contradictions: ["Distrusts prophecy but records omens"],
      mythology: "The mechanic who tunes the sky.",
      sampleLines: ["Give me a minute."],
    },
    motives: ["Understand the signal"],
    beliefs: ["Machines tell the truth"],
    drives: ["Protect witnesses"],
    traits: ["Observant"],
    skills: [{ name: "Instrument repair", tier: "Master" }],
    flaws: ["Overcommits"],
    specialties: ["Acoustics"],
    inventory: ["Repair roll"],
    signatureItems: ["Tuning fork"],
    source: { kind: "created", importMode: null, label: "Player-authored character" },
  };
}

function stateFixture(): CampaignPlayState {
  return {
    campaignId: CAMPAIGN_ID,
    acceptedWorldVersion: 1,
    worldVersion: 1,
    runtimeRevision: 1,
    phase: "character_required",
    character: null,
    openingOptions: [],
    currentLocation: null,
    visibleActors: [],
    visibleRoutes: [],
    visiblePressures: [],
    possessions: [],
    obligations: [],
    narration: null,
    narrationOperation: null,
    consequences: [],
    activeTurn: null,
    journalCursor: 0,
    projectionHash: "a".repeat(64),
  };
}

function turnFixture(): CampaignPlayTurnReadResponse {
  return {
    campaignId: CAMPAIGN_ID,
    acceptedWorldVersion: 1,
    worldVersion: 2,
    runtimeRevision: 9,
    turn: {
      turnId: "turn-one",
      turnKind: "opening",
      status: "completed",
      progress: null,
      lastEventSequence: 2,
      retryEligible: false as const,
      submittedAt: 1_000,
      completedAt: 1_100,
    },
    result: {
      status: "completed",
      narration: {
        narrationId: "narration-one",
        turnId: "turn-one",
        beats: [{ beatId: "beat-one", text: "Rain rings against the signal tower." }],
        displayText: "Rain rings against the signal tower.",
        suggestedActions: [],
        effects: [{ kind: "fade", beatId: "beat-one" }],
        createdAt: 1_090,
      },
      narrationOperation: null,
      consequences: [],
      journalCursor: 0,
    },
  };
}

function applicationFixture() {
  const state = stateFixture();
  const turn = turnFixture();
  const application: CampaignPlayApplication = {
    loadState: vi.fn(() => state),
    loadTurn: vi.fn(() => turn),
    loadJournal: vi.fn(() => ({
      campaignId: CAMPAIGN_ID,
      acceptedWorldVersion: 1,
      worldVersion: 2,
      runtimeRevision: 9,
      entries: [],
      nextCursor: null,
    })),
    listTurnEvents: vi.fn((_campaignId, _turnId, afterSequence) =>
      afterSequence < 2 ? [{
        type: "turn.completed" as const,
        sequence: 2,
        turnId: "turn-one",
        acceptedWorldVersion: 1,
        worldVersion: 2,
        runtimeRevision: 9,
        retryEligible: false as const,
        createdAt: 1_100,
      }] : []),
    parsePlayerCard: vi.fn(async () => ({ draft: characterDraft() })),
    generatePlayerDraft: vi.fn(async () => ({ draft: characterDraft() })),
    researchPlayer: vi.fn(async () => ({
      research: { summary: "A signal mechanic archetype.", sources: [] },
    })),
    putPlayer: vi.fn(() => ({
      acceptedWorldVersion: 1,
      worldVersion: 2,
      runtimeRevision: 2,
      actorHandle: "actor-public",
    })),
    admitOpening: vi.fn(() => ({ turnId: "turn-one", sequence: 1 })),
    admitTurn: vi.fn(() => ({ turnId: "turn-two", sequence: 1 })),
    resumeTurn: vi.fn(() => ({ turnId: "turn-one", sequence: 3 })),
    recoverNarration: vi.fn(() => ({
      operationId: "narration-operation-one",
      attemptId: "narration-attempt-one",
      attempt: 2,
      status: "running" as const,
    })),
    recoverCampaign: vi.fn(async () => undefined),
    waitForIdle: vi.fn(async () => undefined),
  };
  return { application, state, turn };
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("Campaign Play routes", () => {
  it("mounts every public read and write contract with strict DTOs", async () => {
    const fixture = applicationFixture();
    const app = createCampaignPlayRoutes({
      application: fixture.application,
      readCampaign: vi.fn(() => ({ name: "Campaign" } as never)),
      eventPollMilliseconds: 1,
    });

    const stateResponse = await app.request(`/${CAMPAIGN_ID}/play/state`);
    expect(campaignPlayStateSchema.parse(await stateResponse.json())).toEqual(fixture.state);

    const card = await app.request(
      `/${CAMPAIGN_ID}/play/player/cards/parse`,
      jsonRequest("POST", { cardJson: "{}", importMode: "outsider" }),
    );
    expect(card.status).toBe(200);
    expect((await card.json() as { draft: CampaignPlayCharacterDraft }).draft.name).toBe("Mara Venn");

    const generated = await app.request(
      `/${CAMPAIGN_ID}/play/player/drafts/generate`,
      jsonRequest("POST", { prompt: "A signal mechanic", research: null }),
    );
    expect(generated.status).toBe(200);

    const research = await app.request(
      `/${CAMPAIGN_ID}/play/player/research`,
      jsonRequest("POST", { query: "Signal mechanic" }),
    );
    expect(research.status).toBe(200);

    const put = await app.request(
      `/${CAMPAIGN_ID}/play/player`,
      jsonRequest("PUT", {
        acceptedWorldVersion: 1,
        expectedWorldVersion: 1,
        expectedRuntimeRevision: 1,
        source: "created",
        character: characterDraft(),
      }),
    );
    expect(put.status).toBe(200);

    const opening = await app.request(
      `/${CAMPAIGN_ID}/play/opening`,
      jsonRequest("POST", {
        idempotencyKey: "opening-one",
        expectedWorldVersion: 2,
        expectedRuntimeRevision: 2,
        startingConditions: { mode: "delegate" },
      }),
    );
    expect(opening.status).toBe(202);
    expect(campaignPlayTurnAdmissionResponseSchema.parse(await opening.json()))
      .toEqual({ turnId: "turn-one", sequence: 1 });

    const action = await app.request(
      `/${CAMPAIGN_ID}/play/turns`,
      jsonRequest("POST", {
        source: "freeform",
        idempotencyKey: "action-one",
        text: "Watch the tower.",
        expectedWorldVersion: 2,
        expectedRuntimeRevision: 9,
      }),
    );
    expect(action.status).toBe(202);

    const turn = await app.request(`/${CAMPAIGN_ID}/play/turns/turn-one`);
    expect(campaignPlayTurnReadResponseSchema.parse(await turn.json())).toEqual(fixture.turn);

    const resume = await app.request(
      `/${CAMPAIGN_ID}/play/turns/turn-one/resume`,
      jsonRequest("POST", { expectedWorldVersion: 2, expectedRuntimeRevision: 9 }),
    );
    expect(resume.status).toBe(202);
    expect(campaignPlayTurnAdmissionResponseSchema.parse(await resume.json()))
      .toEqual({ turnId: "turn-one", sequence: 3 });

    const recoveryRequest = {
      operationId: "narration-operation-one",
      resultId: "result-one",
      narrationId: "narration-one",
      packetHash: "b".repeat(64),
      receiptIds: ["receipt-one"],
    };
    const recovery = await app.request(
      `/${CAMPAIGN_ID}/play/turns/turn-one/narration/recover`,
      jsonRequest("POST", recoveryRequest),
    );
    expect(recovery.status).toBe(202);
    expect(await recovery.json()).toEqual({
      operationId: "narration-operation-one",
      attemptId: "narration-attempt-one",
      attempt: 2,
      status: "running",
    });
    expect(fixture.application.recoverNarration).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "turn-one",
      recoveryRequest,
    );

    const journal = await app.request(`/${CAMPAIGN_ID}/play/journal?cursor=0&limit=20`);
    expect(campaignPlayJournalPageSchema.parse(await journal.json())).toMatchObject({ entries: [] });
  });

  it("replays terminal SSE once and rejects malformed cursors with a strict public error", async () => {
    const fixture = applicationFixture();
    const app = createCampaignPlayRoutes({
      application: fixture.application,
      readCampaign: vi.fn(() => ({ name: "Campaign" } as never)),
      eventPollMilliseconds: 1,
    });
    const stream = await app.request(
      `/${CAMPAIGN_ID}/play/turns/turn-one/events?afterSequence=0`,
    );
    const text = await stream.text();
    expect(text).toContain("id: 2");
    expect(text).toContain("event: turn.completed");
    expect(fixture.application.listTurnEvents).toHaveBeenCalledTimes(1);

    vi.mocked(fixture.application.listTurnEvents).mockClear();
    const resumedStream = await app.request(
      `/${CAMPAIGN_ID}/play/turns/turn-one/events`,
      { headers: { "Last-Event-ID": "1" } },
    );
    expect(await resumedStream.text()).toContain("id: 2");
    expect(fixture.application.listTurnEvents).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "turn-one",
      1,
    );

    const beyondTail = await app.request(
      `/${CAMPAIGN_ID}/play/turns/turn-one/events?afterSequence=99`,
    );
    expect(await beyondTail.text()).toBe("");

    const invalid = await app.request(
      `/${CAMPAIGN_ID}/play/turns/turn-one/events?afterSequence=2x`,
    );
    expect(invalid.status).toBe(422);
    const body = campaignPlayErrorResponseSchema.parse(await invalid.json());
    expect(body).toMatchObject({
      code: "invalid_event_cursor",
      status: 422,
      turnId: "turn-one",
    });
  });

  it("maps campaign and application failures without leaking internal fields", async () => {
    const fixture = applicationFixture();
    const missing = createCampaignPlayRoutes({
      application: fixture.application,
      readCampaign: vi.fn(() => { throw new Error("private path"); }),
    });
    const missingResponse = await missing.request(`/${CAMPAIGN_ID}/play/state`);
    expect(campaignPlayErrorResponseSchema.parse(await missingResponse.json()))
      .toMatchObject({ code: "campaign_not_found", status: 404 });

    vi.mocked(fixture.application.loadState).mockImplementation(() => {
      throw new CampaignPlayApplicationError(
        "world_not_accepted",
        "private review state",
      );
    });
    const unaccepted = createCampaignPlayRoutes({
      application: fixture.application,
      readCampaign: vi.fn(() => ({ name: "Campaign" } as never)),
    });
    const unacceptedResponse = await unaccepted.request(`/${CAMPAIGN_ID}/play/state`);
    expect(campaignPlayErrorResponseSchema.parse(await unacceptedResponse.json()))
      .toMatchObject({ code: "world_not_accepted", status: 422 });

    vi.mocked(fixture.application.loadState).mockImplementation(() => {
      throw new Error("private database failure");
    });
    const unavailable = createCampaignPlayRoutes({
      application: fixture.application,
      readCampaign: vi.fn(() => ({ name: "Campaign" } as never)),
    });
    const unavailableResponse = await unavailable.request(`/${CAMPAIGN_ID}/play/state`);
    expect(unavailableResponse.status).toBe(503);
    expect(campaignPlayErrorResponseSchema.parse(await unavailableResponse.json()))
      .toMatchObject({
        code: "service_unavailable",
        campaignPhase: null,
        acceptedWorldVersion: null,
        currentWorldVersion: null,
        currentRuntimeRevision: null,
      });
    vi.mocked(fixture.application.loadState).mockImplementation(() => fixture.state);

    vi.mocked(fixture.application.admitTurn).mockImplementation(() => {
      throw new CampaignPlayApplicationError(
        "turn_in_progress",
        "private active turn detail",
      );
    });
    const app = createCampaignPlayRoutes({
      application: fixture.application,
      readCampaign: vi.fn(() => ({ name: "Campaign" } as never)),
    });
    const response = await app.request(
      `/${CAMPAIGN_ID}/play/turns`,
      jsonRequest("POST", {
        source: "freeform",
        idempotencyKey: "action-two",
        text: "Wait.",
        expectedWorldVersion: 2,
        expectedRuntimeRevision: 9,
      }),
    );
    expect(response.status).toBe(409);
    const raw = await response.json() as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual([
      "acceptedWorldVersion",
      "campaignPhase",
      "code",
      "currentRuntimeRevision",
      "currentWorldVersion",
      "expectedRuntimeRevision",
      "expectedWorldVersion",
      "retryEligible",
      "status",
      "turnId",
      "unmetRequirements",
    ]);
    expect(JSON.stringify(raw)).not.toContain("private active turn detail");

    vi.mocked(fixture.application.admitTurn).mockImplementation(() => {
      throw new CampaignPlayApplicationError(
        "stale_runtime_revision",
        "private revision detail",
      );
    });
    const staleResponse = await app.request(
      `/${CAMPAIGN_ID}/play/turns`,
      jsonRequest("POST", {
        source: "freeform",
        idempotencyKey: "action-stale",
        text: "Wait.",
        expectedWorldVersion: 2,
        expectedRuntimeRevision: 9,
      }),
    );
    expect(campaignPlayErrorResponseSchema.parse(await staleResponse.json()))
      .toMatchObject({
        code: "stale_runtime_revision",
        status: 409,
        expectedRuntimeRevision: 9,
        currentRuntimeRevision: 1,
      });

    vi.mocked(fixture.application.admitTurn).mockImplementation(() => {
      throw new CampaignPlayApplicationError(
        "world_not_playable",
        "private topology detail",
        ["opening_scene_unavailable"],
      );
    });
    const ineligibleResponse = await app.request(
      `/${CAMPAIGN_ID}/play/turns`,
      jsonRequest("POST", {
        source: "freeform",
        idempotencyKey: "action-ineligible",
        text: "Wait.",
        expectedWorldVersion: 2,
        expectedRuntimeRevision: 9,
      }),
    );
    expect(campaignPlayErrorResponseSchema.parse(await ineligibleResponse.json()))
      .toMatchObject({
        code: "world_not_playable",
        status: 422,
        unmetRequirements: ["opening_scene_unavailable"],
      });

    vi.mocked(fixture.application.loadTurn).mockImplementation(() => {
      throw new CampaignPlayApplicationError("turn_not_found", "private turn id");
    });
    const missingTurnResponse = await app.request(
      `/${CAMPAIGN_ID}/play/turns/missing-turn`,
    );
    expect(campaignPlayErrorResponseSchema.parse(await missingTurnResponse.json()))
      .toMatchObject({ code: "turn_not_found", status: 404, turnId: "missing-turn" });
  });
});
