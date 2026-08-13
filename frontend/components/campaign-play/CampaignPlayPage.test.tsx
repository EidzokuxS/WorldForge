import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  CampaignPlaySseEvent,
  CampaignPlayPublicProgress,
  CampaignPlayState,
  CampaignPlayTurnReadResponse,
} from "@worldforge/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  loadState: vi.fn(),
  loadTurn: vi.fn(),
  loadJournal: vi.fn(),
  admitOpening: vi.fn(),
  admitTurn: vi.fn(),
  resumeTurn: vi.fn(),
  recoverNarration: vi.fn(),
  streamEvents: vi.fn(),
}));

vi.mock("@/lib/campaign-play-api", () => ({
  CampaignPlayApiError: class CampaignPlayApiError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message = code, status = 500, details: unknown = null) {
      super(message);
      void status;
      this.code = code;
      this.details = details;
    }
  },
  loadCampaignPlayState: api.loadState,
  loadCampaignPlayTurn: api.loadTurn,
  loadCampaignPlayJournal: api.loadJournal,
  admitCampaignPlayOpening: api.admitOpening,
  admitCampaignPlayTurn: api.admitTurn,
  resumeCampaignPlayTurn: api.resumeTurn,
  recoverCampaignPlayNarration: api.recoverNarration,
  streamCampaignPlayTurnEvents: api.streamEvents,
}));

import { CampaignPlayPage } from "./CampaignPlayPage";
import { CampaignPlayApiError } from "@/lib/campaign-play-api";

function state(
  phase: CampaignPlayState["phase"],
  activeTurn: CampaignPlayState["activeTurn"] = null,
): CampaignPlayState {
  const hasSettledScene = phase === "ready" || phase === "turn_active" ||
    phase === "narration_pending";
  return {
    campaignId: "campaign-1",
    phase,
    acceptedWorldVersion: 2,
    worldVersion: 3,
    runtimeRevision: 4,
    character: phase === "character_required" ? null : {
      name: "Mara",
      monogram: "M",
      descriptor: "A patient cartographer",
      accent: "ember",
    },
    openingOptions: phase === "opening_required" ? [{
      locationHandle: "location-1",
      name: "Signal Yard",
      description: "Rain ticks on dead rails.",
      roles: [{ handle: "role-1", label: "Cartographer" }],
      arrivalModes: [{ handle: "arrival-1", label: "On foot" }],
      immediateSituations: [{ handle: "situation-1", label: "A signal wakes" }],
    }] : [],
    currentLocation: hasSettledScene
      ? { handle: "place-1", name: "Signal Yard", description: "Rain ticks on dead rails." }
      : null,
    visibleActors: [],
    visibleRoutes: [],
    visiblePressures: [],
    possessions: [],
    obligations: [],
    narration: hasSettledScene ? {
      narrationId: "narration-0",
      turnId: "opening-1",
      beats: [{ beatId: "beat-0", text: "The rain finds every rail." }],
      displayText: "The rain finds every rail.",
      suggestedActions: [],
      effects: [],
      createdAt: 90,
    } : null,
    narrationOperation: null,
    utilityActions: [],
    consequences: [],
    activeTurn,
    journalCursor: 0,
    projectionHash: "a".repeat(64),
  };
}

function publicTurn(
  status: "processing" | "interrupted" | "completed" | "failed",
  progress: CampaignPlayPublicProgress | null = "interpreting",
  sequence = 1,
) {
  return {
    turnId: "turn-1",
    turnKind: "player_action" as const,
    status,
    progress,
    lastEventSequence: sequence,
    retryEligible: status === "interrupted",
    submittedAt: 100,
    completedAt: status === "completed" || status === "failed" ? 200 : null,
  };
}

function turnRead(
  status: "processing" | "interrupted" | "completed" | "failed",
  sequence = 1,
): CampaignPlayTurnReadResponse {
  const turn = publicTurn(status, status === "completed" || status === "failed" ? null : "interpreting", sequence);
  return {
    campaignId: "campaign-1",
    acceptedWorldVersion: 2,
    worldVersion: 3,
    runtimeRevision: 4,
    turn,
    result: status === "processing"
      ? { status: "processing" }
      : status === "interrupted"
        ? { status: "interrupted", errorCode: "turn_interrupted" }
        : status === "failed"
          ? { status: "failed", errorCode: "turn_failed" }
          : {
              status: "completed",
              narration: {
                narrationId: "narration-1",
                turnId: "turn-1",
                beats: [{ beatId: "beat-1", text: "The signal answers." }],
                displayText: "The signal answers.",
                suggestedActions: [],
                effects: [],
                createdAt: 200,
              },
              narrationOperation: null,
              consequences: [],
              journalCursor: 1,
            },
  };
}

function narrationOperation(
  status: "pending" | "complete",
  turnId = "turn-1",
): NonNullable<CampaignPlayState["narrationOperation"]> {
  return {
    operationId: "narration-operation-1",
    resultId: "result-1",
    turnId,
    narrationId: "narration-1",
    packetHash: "b".repeat(64),
    receiptIds: ["receipt-1"],
    status,
    attemptId: status === "pending" ? "narration-attempt-1" : "narration-attempt-2",
    attempt: status === "pending" ? 1 : 2,
    conciseResult: {
      displayText: "The signal answers.",
      suggestedActions: [{ choiceHandle: "choice-follow", label: "Follow the signal" }],
    },
    createdAt: 200,
    completedAt: status === "complete" ? 300 : null,
  };
}

function completedTurnReadWithOperation(
  operation: NonNullable<CampaignPlayState["narrationOperation"]>,
  sequence = 3,
): CampaignPlayTurnReadResponse {
  const completedRead = turnRead("completed", sequence);
  if (completedRead.result.status !== "completed") throw new Error("expected completed turn");
  return {
    ...completedRead,
    result: {
      ...completedRead.result,
      narrationOperation: operation,
    },
  };
}

function progressed(sequence: number, progress: "settling" | "revealing"): CampaignPlaySseEvent {
  return {
    sequence,
    turnId: "turn-1",
    type: "turn.progressed",
    progress,
    acceptedWorldVersion: 2,
    worldVersion: 3,
    runtimeRevision: 4,
    createdAt: 150 + sequence,
  };
}

function completed(sequence: number): CampaignPlaySseEvent {
  return {
    sequence,
    turnId: "turn-1",
    type: "turn.completed",
    retryEligible: false,
    acceptedWorldVersion: 2,
    worldVersion: 3,
    runtimeRevision: 4,
    createdAt: 200,
  };
}

function interrupted(sequence: number): CampaignPlaySseEvent {
  return {
    sequence,
    turnId: "turn-1",
    type: "turn.interrupted",
    retryEligible: true,
    acceptedWorldVersion: 2,
    worldVersion: 3,
    runtimeRevision: 4,
    createdAt: 200,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.history.replaceState({}, "");
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "request-1") });
  api.streamEvents.mockImplementation(() => new Promise(() => {}));
  api.recoverNarration.mockResolvedValue({
    operationId: "narration-operation-1",
    attemptId: "narration-attempt-2",
    attempt: 2,
    status: "running",
  });
});

describe("CampaignPlayPage durable state", () => {
  it("keeps actions usable after narration failure and recovers the exact visible result", async () => {
    const fallback = state("ready");
    fallback.narration = null;
    fallback.narrationOperation = {
      operationId: "narration-operation-1",
      resultId: "result-1",
      turnId: "turn-1",
      narrationId: "narration-1",
      packetHash: "b".repeat(64),
      receiptIds: ["receipt-1"],
      status: "failed",
      attemptId: "narration-attempt-1",
      attempt: 1,
      conciseResult: {
        displayText: "The north signal answers, and the gate opens.",
        suggestedActions: [{ choiceHandle: "choice-follow", label: "Follow the north signal" }],
      },
      createdAt: 200,
      completedAt: null,
    };
    api.loadState.mockResolvedValue(fallback);
    api.loadTurn.mockResolvedValue(turnRead("completed"));
    render(<CampaignPlayPage campaignId="campaign-1" />);

    expect(await screen.findByText(fallback.narrationOperation.conciseResult.displayText))
      .toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your action" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Follow the north signal/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Restore the telling" }));

    await waitFor(() => expect(api.recoverNarration).toHaveBeenCalledWith(
      "campaign-1",
      "turn-1",
      {
        operationId: "narration-operation-1",
        resultId: "result-1",
        narrationId: "narration-1",
        packetHash: "b".repeat(64),
        receiptIds: ["receipt-1"],
      },
    ));
    expect(screen.getByRole("textbox", { name: "Your action" })).toBeEnabled();
  });

  it("offers a working retry when the initial state load fails", async () => {
    api.loadState
      .mockRejectedValueOnce(new CampaignPlayApiError(
        "service_unavailable",
        "Campaign Play is temporarily unavailable.",
        503,
        null,
      ))
      .mockResolvedValueOnce(state("ready"));
    render(<CampaignPlayPage campaignId="campaign-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByLabelText("Your action")).toBeEnabled();
    expect(api.loadState).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["character_required", "Create a player character before entering the world."],
    ["opening_required", "Choose your arrival"],
    ["opening_active", "Preparing your arrival"],
    ["ready", "Your action"],
    ["turn_active", "Applying the result"],
    ["narration_pending", "Writing the moment"],
  ] as const)("reloads the %s server phase", async (phase, expectedText) => {
    const active = phase === "opening_active"
      ? { ...publicTurn("processing", "interpreting"), turnKind: "opening" as const }
      : phase === "turn_active"
        ? publicTurn("processing", "settling")
        : phase === "narration_pending"
          ? publicTurn("processing", "narrating")
          : null;
    api.loadState.mockResolvedValue(state(phase, active));
    if (active) api.loadTurn.mockResolvedValue(turnRead("processing", active.lastEventSequence));

    render(<CampaignPlayPage campaignId="campaign-1" />);

    expect(await screen.findByText(expectedText)).toBeInTheDocument();
    if (phase === "turn_active" || phase === "narration_pending") {
      expect(screen.getByLabelText("Your action")).toBeDisabled();
    }
  });

  it("admits only a complete chosen opening tuple from one location option", async () => {
    api.loadState.mockResolvedValue(state("opening_required"));
    api.admitOpening.mockResolvedValue({ turnId: "opening-1", sequence: 1 });
    render(<CampaignPlayPage campaignId="campaign-1" />);

    const begin = await screen.findByRole("button", { name: "Begin" });
    expect(begin).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Signal Yard" }));
    expect(begin).toBeEnabled();
    fireEvent.click(begin);

    await waitFor(() => expect(api.admitOpening).toHaveBeenCalledWith("campaign-1", {
      idempotencyKey: "request-1",
      startingConditions: {
        mode: "chosen",
        locationHandle: "location-1",
        roleHandle: "role-1",
        arrivalModeHandle: "arrival-1",
        immediateSituationHandle: "situation-1",
      },
      expectedWorldVersion: 3,
      expectedRuntimeRevision: 4,
    }));
  });

  it("prevents concurrent admission and clears the durable draft only after 202", async () => {
    api.loadState.mockResolvedValue(state("ready"));
    let acceptAdmission!: (value: { turnId: string; sequence: number }) => void;
    api.admitTurn.mockReturnValue(new Promise((resolve) => {
      acceptAdmission = resolve;
    }));
    render(<CampaignPlayPage campaignId="campaign-1" />);
    const input = await screen.findByLabelText("Your action");
    fireEvent.change(input, { target: { value: "I listen at the signal box." } });
    const actButton = screen.getByRole("button", { name: "Act" });
    fireEvent.click(actButton);
    fireEvent.click(actButton);

    expect(api.admitTurn).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("worldforge:campaign-play:draft:campaign-1"))
      .toBe("I listen at the signal box.");

    await act(async () => acceptAdmission({ turnId: "turn-1", sequence: 1 }));

    expect(input).toHaveValue("");
    expect(input).toBeDisabled();
    expect(window.localStorage.getItem("worldforge:campaign-play:draft:campaign-1")).toBeNull();
    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
  });

  it("admits a suggested action by opaque handle", async () => {
    const ready = state("ready");
    ready.narration!.suggestedActions = [{ choiceHandle: "choice-hidden", label: "Follow the signal" }];
    api.loadState.mockResolvedValue(ready);
    api.admitTurn.mockResolvedValue({ turnId: "turn-1", sequence: 1 });
    render(<CampaignPlayPage campaignId="campaign-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Follow the signal" }));

    await waitFor(() => expect(api.admitTurn).toHaveBeenCalledWith("campaign-1", {
      source: "suggested",
      idempotencyKey: "request-1",
      choiceHandle: "choice-hidden",
      expectedWorldVersion: 3,
      expectedRuntimeRevision: 4,
    }));
    expect(document.body).not.toHaveTextContent("choice-hidden");
  });

  it("opens earned journal entries through the campaign loader", async () => {
    api.loadState.mockResolvedValue(state("ready"));
    api.loadJournal.mockResolvedValue({
      campaignId: "campaign-1",
      acceptedWorldVersion: 2,
      worldVersion: 3,
      runtimeRevision: 4,
      entries: [{
        observationHandle: "observation-hidden",
        title: "The signal changed",
        text: "The east lamp went dark.",
        whereOrRoute: "Signal Yard",
        worldTimeLabel: "Before dawn",
        consequence: null,
      }],
      nextCursor: null,
    });
    render(<CampaignPlayPage campaignId="campaign-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Journal" }));

    expect(await screen.findByText("The signal changed")).toBeInTheDocument();
    expect(api.loadJournal).toHaveBeenCalledWith("campaign-1", { cursor: 0, limit: 20 });
    expect(document.body).not.toHaveTextContent("observation-hidden");
  });

  it("keeps the draft when admission fails", async () => {
    api.loadState.mockResolvedValue(state("ready"));
    api.admitTurn.mockRejectedValue(new Error("offline"));
    render(<CampaignPlayPage campaignId="campaign-1" />);
    const input = await screen.findByLabelText("Your action");
    fireEvent.change(input, { target: { value: "I wait under the awning." } });
    fireEvent.click(screen.getByRole("button", { name: "Act" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(input).toHaveValue("I wait under the awning.");
  });

  it("restores the campaign draft after remount", async () => {
    api.loadState.mockResolvedValue(state("ready"));
    const first = render(<CampaignPlayPage campaignId="campaign-1" />);
    fireEvent.change(await screen.findByLabelText("Your action"), {
      target: { value: "I mark the safe route in my notebook." },
    });
    first.unmount();

    render(<CampaignPlayPage campaignId="campaign-1" />);

    expect(await screen.findByLabelText("Your action"))
      .toHaveValue("I mark the safe route in my notebook.");
  });

  it("ignores a late admission after unmount and preserves the draft", async () => {
    api.loadState.mockResolvedValue(state("ready"));
    let resolveAdmission!: (value: { turnId: string; sequence: number }) => void;
    api.admitTurn.mockReturnValue(new Promise((resolve) => {
      resolveAdmission = resolve;
    }));
    const page = render(<CampaignPlayPage campaignId="campaign-1" />);
    const input = await screen.findByLabelText("Your action");
    fireEvent.change(input, { target: { value: "I wait for the last train." } });
    fireEvent.click(screen.getByRole("button", { name: "Act" }));
    page.unmount();

    await act(async () => resolveAdmission({ turnId: "turn-1", sequence: 1 }));

    expect(window.localStorage.getItem("worldforge:campaign-play:draft:campaign-1"))
      .toBe("I wait for the last train.");
    expect(window.history.state.campaignPlay).toEqual({
      campaignId: "campaign-1",
      lastSeenSequence: 0,
    });
  });

  it("deduplicates replayed events and unlocks only after exact turn and state refetch", async () => {
    const completedState = state("ready");
    completedState.narration!.suggestedActions = [{
      choiceHandle: "choice-next",
      label: "Follow the new signal",
    }];
    api.loadState
      .mockResolvedValueOnce(state("turn_active", publicTurn("processing", "interpreting", 1)))
      .mockResolvedValueOnce(completedState);
    api.loadTurn
      .mockResolvedValueOnce(turnRead("processing", 1))
      .mockResolvedValueOnce(turnRead("completed", 3));
    api.streamEvents.mockImplementationOnce(async (_campaignId, _turnId, options) => {
      options.onEvent(progressed(2, "settling"));
      options.onEvent(progressed(2, "settling"));
      options.onEvent(completed(3));
      return { lastSequence: 3, terminalEvent: completed(3) };
    });

    render(<CampaignPlayPage campaignId="campaign-1" reconnectDelayMilliseconds={0} />);

    const input = await screen.findByLabelText("Your action");
    await waitFor(() => expect(input).toBeEnabled());
    expect(api.loadState).toHaveBeenCalledTimes(2);
    expect(api.loadTurn).toHaveBeenCalledTimes(2);
    expect(window.history.state.campaignPlay).toEqual({
      campaignId: "campaign-1",
      lastSeenSequence: 3,
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Your move" })).toHaveFocus());
  });

  it("keeps terminal interruption focus on its recovery surface", async () => {
    api.loadState
      .mockResolvedValueOnce(state("turn_active", publicTurn("processing", "interpreting", 1)))
      .mockResolvedValueOnce(state("turn_active", publicTurn("interrupted", null, 2)));
    api.loadTurn
      .mockResolvedValueOnce(turnRead("processing", 1))
      .mockResolvedValueOnce(turnRead("interrupted", 2));
    api.streamEvents.mockImplementationOnce(async (_campaignId, _turnId, options) => {
      const event = interrupted(2);
      options.onEvent(event);
      return { lastSequence: 2, terminalEvent: event };
    });

    render(<CampaignPlayPage campaignId="campaign-1" reconnectDelayMilliseconds={0} />);

    const status = await screen.findByText("The turn stopped before it finished.");
    await waitFor(() => expect(status.parentElement).toHaveFocus());
    expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled();
  });

  it("refetches authority after a sequence gap and reconnects from the durable cursor", async () => {
    api.loadState
      .mockResolvedValueOnce(state("turn_active", publicTurn("processing", "interpreting", 1)))
      .mockResolvedValueOnce(state("turn_active", publicTurn("processing", "settling", 2)))
      .mockResolvedValueOnce(state("ready"));
    api.loadTurn
      .mockResolvedValueOnce(turnRead("processing", 1))
      .mockResolvedValueOnce(turnRead("processing", 2))
      .mockResolvedValueOnce(turnRead("completed", 3));
    api.streamEvents
      .mockImplementationOnce(async (_campaignId, _turnId, options) => {
        options.onEvent(progressed(3, "revealing"));
        return { lastSequence: 1, terminalEvent: null };
      })
      .mockImplementationOnce(async (_campaignId, _turnId, options) => {
        options.onEvent(completed(3));
        return { lastSequence: 3, terminalEvent: completed(3) };
      });

    render(<CampaignPlayPage campaignId="campaign-1" reconnectDelayMilliseconds={0} />);

    await waitFor(() => expect(screen.getByLabelText("Your action")).toBeEnabled());
    expect(screen.queryByText("Finding what reaches you")).not.toBeInTheDocument();
    expect(api.streamEvents).toHaveBeenNthCalledWith(2, "campaign-1", "turn-1", expect.objectContaining({
      afterSequence: 2,
    }));
    expect(api.loadState).toHaveBeenCalledTimes(3);
  });

  it("refetches after disconnect and reconnects from the durable cursor", async () => {
    api.loadState
      .mockResolvedValueOnce(state("turn_active", publicTurn("processing", "interpreting", 1)))
      .mockResolvedValueOnce(state("turn_active", publicTurn("processing", "settling", 2)))
      .mockResolvedValueOnce(state("ready"));
    api.loadTurn
      .mockResolvedValueOnce(turnRead("processing", 1))
      .mockResolvedValueOnce(turnRead("processing", 2))
      .mockResolvedValueOnce(turnRead("completed", 3));
    api.streamEvents
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockImplementationOnce(async (_campaignId, _turnId, options) => {
        options.onEvent(completed(3));
        return { lastSequence: 3, terminalEvent: completed(3) };
      });

    render(<CampaignPlayPage campaignId="campaign-1" reconnectDelayMilliseconds={0} />);

    await waitFor(() => expect(screen.getByLabelText("Your action")).toBeEnabled());
    expect(api.streamEvents).toHaveBeenNthCalledWith(1, "campaign-1", "turn-1", expect.objectContaining({ afterSequence: 1 }));
    expect(api.streamEvents).toHaveBeenNthCalledWith(2, "campaign-1", "turn-1", expect.objectContaining({ afterSequence: 2 }));
  });

  it("offers durable Resume only for an eligible interrupted turn", async () => {
    api.loadState
      .mockResolvedValueOnce(state("turn_active", publicTurn("interrupted", null, 2)))
      .mockResolvedValueOnce(state("ready"));
    api.loadTurn
      .mockResolvedValueOnce(turnRead("interrupted", 2))
      .mockResolvedValueOnce(turnRead("completed", 4));
    api.resumeTurn.mockResolvedValue({ turnId: "turn-1", sequence: 3 });
    api.streamEvents.mockImplementationOnce(async (_campaignId, _turnId, options) => {
      options.onEvent(progressed(3, "revealing"));
      options.onEvent(completed(4));
      return { lastSequence: 4, terminalEvent: completed(4) };
    });
    render(<CampaignPlayPage campaignId="campaign-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));

    await waitFor(() => expect(api.resumeTurn).toHaveBeenCalledWith("campaign-1", "turn-1", {
      expectedWorldVersion: 3,
      expectedRuntimeRevision: 4,
    }));
    await waitFor(() => expect(api.streamEvents).toHaveBeenCalledWith(
      "campaign-1",
      "turn-1",
      expect.objectContaining({ afterSequence: 2 }),
    ));
    await waitFor(() => expect(screen.getByLabelText("Your action")).toBeEnabled());
    expect(api.loadState).toHaveBeenCalledTimes(2);
    expect(api.loadTurn).toHaveBeenCalledTimes(2);
  });

  it("rejects late authority from the previous campaign after navigation", async () => {
    let resolvePrevious!: (value: CampaignPlayState) => void;
    api.loadState
      .mockReturnValueOnce(new Promise((resolve) => {
        resolvePrevious = resolve;
      }))
      .mockResolvedValueOnce({
        ...state("ready"),
        campaignId: "campaign-2",
        acceptedWorldVersion: 12,
        worldVersion: 13,
        runtimeRevision: 14,
      });
    api.admitTurn.mockResolvedValue({ turnId: "turn-2", sequence: 1 });
    const { rerender } = render(<CampaignPlayPage campaignId="campaign-1" />);

    rerender(<CampaignPlayPage campaignId="campaign-2" />);
    const input = await screen.findByLabelText("Your action");
    await act(async () => resolvePrevious(state("ready")));
    fireEvent.change(input, { target: { value: "I test the second campaign." } });
    fireEvent.click(screen.getByRole("button", { name: "Act" }));

    await waitFor(() => expect(api.admitTurn).toHaveBeenCalledWith("campaign-2", {
      source: "freeform",
      idempotencyKey: "request-1",
      text: "I test the second campaign.",
      expectedWorldVersion: 13,
      expectedRuntimeRevision: 14,
    }));
  });

  it("closes the journal when campaign navigation resets its cache", async () => {
    api.loadState
      .mockResolvedValueOnce(state("ready"))
      .mockResolvedValueOnce({ ...state("ready"), campaignId: "campaign-2" });
    api.loadJournal.mockReturnValue(new Promise(() => {}));
    const { rerender } = render(<CampaignPlayPage campaignId="campaign-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Journal" }));
    expect(screen.getByRole("dialog", { name: "The journal" })).toBeInTheDocument();

    rerender(<CampaignPlayPage campaignId="campaign-2" />);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "The journal" }))
      .not.toBeInTheDocument());
  });

  it("ignores a late admission from the previous campaign without clearing its draft", async () => {
    let resolvePreviousAdmission!: (value: { turnId: string; sequence: number }) => void;
    api.loadState
      .mockResolvedValueOnce(state("ready"))
      .mockResolvedValueOnce({ ...state("ready"), campaignId: "campaign-2" });
    api.admitTurn
      .mockReturnValueOnce(new Promise((resolve) => {
        resolvePreviousAdmission = resolve;
      }))
      .mockResolvedValueOnce({ turnId: "turn-2", sequence: 1 });
    const { rerender } = render(<CampaignPlayPage campaignId="campaign-1" />);
    const firstInput = await screen.findByLabelText("Your action");
    fireEvent.change(firstInput, { target: { value: "A draft for campaign one." } });
    fireEvent.click(screen.getByRole("button", { name: "Act" }));

    rerender(<CampaignPlayPage campaignId="campaign-2" />);
    const secondInput = await screen.findByLabelText("Your action");
    fireEvent.change(secondInput, { target: { value: "An action for campaign two." } });
    fireEvent.click(screen.getByRole("button", { name: "Act" }));
    await waitFor(() => expect(api.admitTurn).toHaveBeenCalledTimes(2));

    await act(async () => resolvePreviousAdmission({ turnId: "turn-1", sequence: 1 }));

    expect(window.history.state.campaignPlay).toEqual({
      campaignId: "campaign-2",
      lastSeenSequence: 1,
    });
    expect(window.localStorage.getItem("worldforge:campaign-play:draft:campaign-1"))
      .toBe("A draft for campaign one.");
  });

  it("refetches durable authority after an external admission wins", async () => {
    api.loadState
      .mockResolvedValueOnce(state("ready"))
      .mockResolvedValueOnce(state("turn_active", publicTurn("processing", "interpreting", 1)));
    api.loadTurn.mockResolvedValue(turnRead("processing", 1));
    api.admitTurn.mockRejectedValue(new CampaignPlayApiError(
      "turn_in_progress",
      "A turn is already in progress.",
      409,
      {
        code: "turn_in_progress",
        status: 409,
        campaignPhase: "turn_active",
        acceptedWorldVersion: 2,
        expectedWorldVersion: 3,
        currentWorldVersion: 3,
        expectedRuntimeRevision: 4,
        currentRuntimeRevision: 4,
        turnId: "turn-1",
        retryEligible: false,
        unmetRequirements: [],
      },
    ));
    render(<CampaignPlayPage campaignId="campaign-1" />);
    const input = await screen.findByLabelText("Your action");
    fireEvent.change(input, { target: { value: "I arrive too late." } });
    fireEvent.click(screen.getByRole("button", { name: "Act" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("already in progress");
    expect(input).toBeDisabled();
    expect(api.loadState).toHaveBeenCalledTimes(3);
    expect(api.loadTurn).toHaveBeenCalledWith(
      "campaign-1",
      "turn-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("shows a durable failed-turn error after authoritative terminal refetch", async () => {
    api.loadState
      .mockResolvedValueOnce(state("turn_active", publicTurn("processing", "revealing", 1)))
      .mockResolvedValueOnce(state("ready"));
    api.loadTurn
      .mockResolvedValueOnce(turnRead("processing", 1))
      .mockResolvedValueOnce(turnRead("failed", 2));
    api.streamEvents.mockImplementationOnce(async (_campaignId, _turnId, options) => {
      const event: CampaignPlaySseEvent = {
        sequence: 2,
        turnId: "turn-1",
        type: "turn.failed",
        retryEligible: false,
        errorCode: "turn_failed",
        acceptedWorldVersion: 2,
        worldVersion: 3,
        runtimeRevision: 4,
        createdAt: 200,
      };
      options.onEvent(event);
      return { lastSequence: 2, terminalEvent: event };
    });

    render(<CampaignPlayPage campaignId="campaign-1" reconnectDelayMilliseconds={0} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be completed");
    await waitFor(() => expect(screen.getByRole("button", { name: "Return to scene" })).toHaveFocus());
    expect(screen.getByLabelText("Your action")).toBeEnabled();
  });

  it("keeps one accepted action reconciling through stream and authority transport loss", async () => {
    const initial = state("ready");
    const pending = state("ready");
    pending.narrationOperation = narrationOperation("pending");
    const settled = state("ready");
    settled.narration!.turnId = "turn-1";
    settled.narration!.displayText = "The signal answers after the line goes quiet.";
    settled.narration!.beats[0]!.text = settled.narration!.displayText;
    let stateCalls = 0;
    api.loadState.mockImplementation(async () => {
      stateCalls += 1;
      if (stateCalls === 1) return initial;
      if (stateCalls === 2) throw new Error("authority read unavailable");
      if (stateCalls === 3) return pending;
      return settled;
    });
    api.loadTurn.mockImplementation(async () => {
      if (stateCalls === 3) return completedTurnReadWithOperation(narrationOperation("pending"));
      return turnRead("completed", 4);
    });
    api.admitTurn.mockResolvedValue({ turnId: "turn-1", sequence: 1 });
    api.streamEvents
      .mockRejectedValueOnce(new Error("stream closed"))
      .mockRejectedValueOnce(new Error("stream closed again"))
      .mockImplementation(() => new Promise(() => {}));

    render(<CampaignPlayPage campaignId="campaign-1" reconnectDelayMilliseconds={0} />);
    const input = await screen.findByLabelText("Your action");
    fireEvent.change(input, { target: { value: "I wait for the signal." } });
    fireEvent.click(screen.getByRole("button", { name: "Act" }));

    await waitFor(() => expect(screen.getByText(settled.narration!.displayText)).toBeInTheDocument());
    expect(input).toBeEnabled();
    expect(api.admitTurn).toHaveBeenCalledTimes(1);
    expect(api.resumeTurn).not.toHaveBeenCalled();
    expect(screen.queryByText("The game service is temporarily unavailable.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("aborts a hung authority read and continues the same accepted turn", async () => {
    const initial = state("ready");
    const settled = state("ready");
    settled.narration!.turnId = "turn-1";
    settled.narration!.displayText = "The late read returns the waiting scene.";
    settled.narration!.beats[0]!.text = settled.narration!.displayText;
    let stateCalls = 0;
    let hungSignal: AbortSignal | undefined;
    api.loadState.mockImplementation(async (_campaignId, options) => {
      stateCalls += 1;
      if (stateCalls === 1) return initial;
      if (stateCalls === 2) {
        hungSignal = options?.signal;
        return new Promise<CampaignPlayState>(() => {});
      }
      return settled;
    });
    api.loadTurn.mockResolvedValue(turnRead("completed", 4));
    api.admitTurn.mockResolvedValue({ turnId: "turn-1", sequence: 1 });

    render(<CampaignPlayPage campaignId="campaign-1" reconnectDelayMilliseconds={0} />);
    const input = await screen.findByLabelText("Your action");
    fireEvent.change(input, { target: { value: "I wait for the delayed scene." } });
    fireEvent.click(screen.getByRole("button", { name: "Act" }));

    await waitFor(() => expect(hungSignal?.aborted).toBe(true), { timeout: 6_000 });
    await waitFor(() => expect(screen.getByText(settled.narration!.displayText)).toBeInTheDocument());
    expect(input).toBeEnabled();
    expect(api.admitTurn).toHaveBeenCalledTimes(1);
    expect(api.resumeTurn).not.toHaveBeenCalled();
    expect(screen.queryByText("The game service is temporarily unavailable.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  }, 15_000);

  it("discards a mismatched authority pair before applying the ready scene", async () => {
    const initial = state("ready");
    const mismatched = state("turn_active", publicTurn("processing", "settling", 1));
    mismatched.runtimeRevision = 5;
    const mismatchedTurn = turnRead("processing", 1);
    mismatchedTurn.runtimeRevision = 4;
    const settled = state("ready");
    settled.runtimeRevision = 6;
    settled.narration!.turnId = "turn-1";
    settled.narration!.displayText = "The matched authority scene is ready.";
    settled.narration!.beats[0]!.text = settled.narration!.displayText;
    api.loadState
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(mismatched)
      .mockResolvedValueOnce(settled);
    const settledTurn = turnRead("completed", 4);
    settledTurn.runtimeRevision = 6;
    api.loadTurn
      .mockResolvedValueOnce(mismatchedTurn)
      .mockResolvedValueOnce(settledTurn);
    api.admitTurn.mockResolvedValue({ turnId: "turn-1", sequence: 1 });

    render(<CampaignPlayPage campaignId="campaign-1" reconnectDelayMilliseconds={0} />);
    const input = await screen.findByLabelText("Your action");
    fireEvent.change(input, { target: { value: "I wait for matching authority." } });
    fireEvent.click(screen.getByRole("button", { name: "Act" }));

    await waitFor(() => expect(screen.getByText(settled.narration!.displayText)).toBeInTheDocument());
    expect(input).toBeEnabled();
    expect(api.loadState).toHaveBeenCalledTimes(3);
    expect(api.loadTurn).toHaveBeenCalledTimes(1);
    expect(api.admitTurn).toHaveBeenCalledTimes(1);
    expect(api.resumeTurn).not.toHaveBeenCalled();
  });

  it("promotes an equal-revision ready projection over pending authority", async () => {
    const initial = state("ready");
    const pending = state("ready");
    pending.narrationOperation = narrationOperation("pending");
    const newerReady = state("ready");
    newerReady.runtimeRevision = 4;
    newerReady.narration!.turnId = "turn-1";
    newerReady.narration!.displayText = "The newer authority snapshot is ready.";
    newerReady.narration!.beats[0]!.text = newerReady.narration!.displayText;
    api.loadState
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(newerReady);
    const pendingTurn = completedTurnReadWithOperation(narrationOperation("pending"), 3);
    pendingTurn.runtimeRevision = 4;
    const settledTurn = turnRead("completed", 4);
    settledTurn.runtimeRevision = 4;
    api.loadTurn.mockResolvedValueOnce(pendingTurn).mockResolvedValueOnce(settledTurn);
    api.admitTurn.mockResolvedValue({ turnId: "turn-1", sequence: 1 });
    api.streamEvents.mockRejectedValue(new Error("stream closed"));

    render(<CampaignPlayPage campaignId="campaign-1" reconnectDelayMilliseconds={0} />);
    const input = await screen.findByLabelText("Your action");
    fireEvent.change(input, { target: { value: "I wait for the newer scene." } });
    fireEvent.click(screen.getByRole("button", { name: "Act" }));

    await waitFor(() => expect(api.loadState).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText(newerReady.narration!.displayText)).toBeInTheDocument());
    expect(input).toBeEnabled();
    expect(api.loadState).toHaveBeenCalledTimes(3);
    expect(api.loadTurn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("The game service is temporarily unavailable.")).not.toBeInTheDocument();
    expect(api.admitTurn).toHaveBeenCalledTimes(1);
  });

  it("keeps reconciling the same cursor across repeated stream failures", async () => {
    const first = state("turn_active", publicTurn("processing", "interpreting", 1));
    const second = state("turn_active", publicTurn("processing", "settling", 2));
    const settled = state("ready");
    settled.narration!.turnId = "turn-1";
    api.loadState
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(settled);
    api.loadTurn
      .mockResolvedValueOnce(turnRead("processing", 1))
      .mockResolvedValueOnce(turnRead("processing", 2))
      .mockResolvedValueOnce(turnRead("completed", 3));
    api.streamEvents
      .mockRejectedValueOnce(new Error("first stream close"))
      .mockRejectedValueOnce(new Error("second stream close"));

    render(<CampaignPlayPage campaignId="campaign-1" reconnectDelayMilliseconds={0} />);

    await waitFor(() => expect(screen.getByLabelText("Your action")).toBeEnabled());
    expect(api.admitTurn).not.toHaveBeenCalled();
    expect(api.streamEvents).toHaveBeenNthCalledWith(
      1,
      "campaign-1",
      "turn-1",
      expect.objectContaining({ afterSequence: 1 }),
    );
    expect(api.streamEvents).toHaveBeenNthCalledWith(
      2,
      "campaign-1",
      "turn-1",
      expect.objectContaining({ afterSequence: 2 }),
    );
    expect(api.loadState).toHaveBeenCalledTimes(3);
  });

  it("rehydrates a narration-pending turn without posting a new action", async () => {
    const pending = state("ready");
    pending.narrationOperation = narrationOperation("pending");
    const settled = state("ready");
    settled.narration!.turnId = "turn-1";
    settled.narration!.displayText = "The rehydrated scene is ready.";
    settled.narration!.beats[0]!.text = settled.narration!.displayText;
    api.loadState.mockResolvedValueOnce(pending).mockResolvedValue(settled);
    api.loadTurn
      .mockResolvedValueOnce(completedTurnReadWithOperation(narrationOperation("pending")))
      .mockResolvedValue(turnRead("completed", 4));
    api.streamEvents
      .mockRejectedValueOnce(new Error("stream unavailable"))
      .mockImplementation(() => new Promise(() => {}));

    render(<CampaignPlayPage campaignId="campaign-1" reconnectDelayMilliseconds={0} />);

    const input = await screen.findByLabelText("Your action");
    await waitFor(() => expect(screen.getByText(settled.narration!.displayText)).toBeInTheDocument());
    expect(input).toBeEnabled();
    expect(api.admitTurn).not.toHaveBeenCalled();
    expect(api.resumeTurn).not.toHaveBeenCalled();
    expect(api.streamEvents).toHaveBeenCalledWith(
      "campaign-1",
      "turn-1",
      expect.objectContaining({ afterSequence: 3 }),
    );
  });
});
