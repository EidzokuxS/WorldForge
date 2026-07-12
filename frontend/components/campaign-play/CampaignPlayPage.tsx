"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CampaignPlayOpeningLocationOption,
  CampaignPlayPublicErrorCode,
  CampaignPlayPublicProgress,
  CampaignPlaySseEvent,
  CampaignPlayStartingConditions,
  CampaignPlayState,
  CampaignPlayTurnReadResponse,
} from "@worldforge/shared";

import { CampaignPlayStage } from "./CampaignPlayStage";

import {
  CampaignPlayApiError,
  admitCampaignPlayOpening,
  admitCampaignPlayTurn,
  loadCampaignPlayState,
  loadCampaignPlayTurn,
  resumeCampaignPlayTurn,
  streamCampaignPlayTurnEvents,
} from "@/lib/campaign-play-api";

type ConnectionState = "idle" | "connecting" | "connected" | "disconnected";

interface FollowedTurn {
  campaignId: string;
  turnId: string;
  sequence: number;
}

interface AuthoritySnapshot {
  state: CampaignPlayState;
  turn: CampaignPlayTurnReadResponse | null;
}

interface PendingOperation {
  campaignId: string;
  kind: "admission" | "resume";
  token: symbol;
}

interface OpeningSelection {
  locationHandle: string;
  roleHandle: string;
  arrivalModeHandle: string;
  immediateSituationHandle: string;
}

export interface CampaignPlayPageProps {
  campaignId: string;
  reconnectDelayMilliseconds?: number;
}

const ERROR_COPY: Record<CampaignPlayPublicErrorCode, string> = {
  campaign_not_found: "Campaign unavailable.",
  world_not_accepted: "Accept the world before play.",
  world_not_playable: "This world needs attention before play can begin.",
  character_required: "Create a player character before entering the world.",
  character_already_exists: "This campaign already has a player character.",
  opening_required: "Choose how you enter the world.",
  opening_already_completed: "The opening has already been played.",
  invalid_character: "Review the character details and try again.",
  invalid_starting_conditions: "Those starting conditions are no longer available.",
  invalid_intent: "Describe an action grounded in the current scene.",
  invalid_choice: "That option is no longer available.",
  invalid_event_cursor: "The event stream could not resume.",
  idempotency_conflict: "This action conflicts with an earlier request.",
  stale_world_version: "The world changed before the action was accepted.",
  stale_runtime_revision: "The turn state changed before the action was accepted.",
  turn_in_progress: "A turn is already in progress.",
  turn_not_found: "That turn is unavailable.",
  turn_not_resumable: "This turn cannot resume.",
  turn_interrupted: "The turn stopped before it finished.",
  service_unavailable: "The game service is temporarily unavailable.",
};

const PROGRESS_COPY: Record<CampaignPlayPublicProgress, string> = {
  interpreting: "Reading your action",
  settling: "Applying the result",
  world_acting: "The world is moving",
  revealing: "Finding what reaches you",
  narrating: "Writing the moment",
};

const OPENING_PROGRESS_COPY: Record<CampaignPlayPublicProgress, string> = {
  interpreting: "Preparing your arrival",
  settling: "Placing you in the world",
  world_acting: "The world is moving",
  revealing: "Finding what reaches you",
  narrating: "Writing the opening",
};

function draftStorageKey(campaignId: string): string {
  return `worldforge:campaign-play:draft:${campaignId}`;
}

function readStoredDraft(campaignId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(draftStorageKey(campaignId)) ?? "";
  } catch {
    return "";
  }
}

function writeStoredDraft(campaignId: string, value: string): void {
  try {
    if (value.length > 0) window.localStorage.setItem(draftStorageKey(campaignId), value);
    else window.localStorage.removeItem(draftStorageKey(campaignId));
  } catch {
    // The controlled draft remains available for the current page lifetime.
  }
}

function writeNavigationState(campaignId: string, lastSeenSequence: number): void {
  if (typeof window === "undefined") return;
  try {
    const current = window.history.state;
    const base = current && typeof current === "object" ? current : {};
    window.history.replaceState({
      ...base,
      campaignPlay: { campaignId, lastSeenSequence },
    }, "");
  } catch {
    // The in-memory campaign identity remains authoritative for this page lifetime.
  }
}

function readNavigationSequence(campaignId: string): number {
  if (typeof window === "undefined") return 0;
  const value = window.history.state?.campaignPlay;
  return value && typeof value === "object" && value.campaignId === campaignId &&
      Number.isSafeInteger(value.lastSeenSequence) && value.lastSeenSequence >= 0
    ? value.lastSeenSequence
    : 0;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function errorCode(error: unknown): CampaignPlayPublicErrorCode {
  return error instanceof CampaignPlayApiError ? error.code : "service_unavailable";
}

function waitForReconnect(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function initialOpeningSelection(option: CampaignPlayOpeningLocationOption): OpeningSelection {
  return {
    locationHandle: option.locationHandle,
    roleHandle: option.roles[0]!.handle,
    arrivalModeHandle: option.arrivalModes[0]!.handle,
    immediateSituationHandle: option.immediateSituations[0]!.handle,
  };
}

export function CampaignPlayPage({
  campaignId,
  reconnectDelayMilliseconds = 500,
}: CampaignPlayPageProps) {
  const [state, setState] = useState<CampaignPlayState | null>(null);
  const [turnRead, setTurnRead] = useState<CampaignPlayTurnReadResponse | null>(null);
  const [followedTurn, setFollowedTurn] = useState<FollowedTurn | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [eventProgress, setEventProgress] = useState<CampaignPlayPublicProgress | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState<{
    campaignId: string;
    code: CampaignPlayPublicErrorCode;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null);
  const [openingSelection, setOpeningSelection] = useState<OpeningSelection | null>(null);
  const operationRef = useRef<PendingOperation | null>(null);
  const mountedRef = useRef(true);
  const campaignIdRef = useRef(campaignId);
  const lastSequenceRef = useRef({ campaignId, sequence: 0 });
  campaignIdRef.current = campaignId;

  const draft = drafts[campaignId] ?? readStoredDraft(campaignId);
  const campaignState = state?.campaignId === campaignId ? state : null;
  const campaignTurnRead = turnRead?.campaignId === campaignId ? turnRead : null;
  const campaignError = requestError?.campaignId === campaignId ? requestError.code : null;
  const campaignPendingOperation = pendingOperation?.campaignId === campaignId
    ? pendingOperation
    : null;

  const setDraft = useCallback((value: string) => {
    setDrafts((current) => ({ ...current, [campaignId]: value }));
    writeStoredDraft(campaignId, value);
  }, [campaignId]);

  const recordSequence = useCallback((targetCampaignId: string, sequence: number) => {
    if (!mountedRef.current || campaignIdRef.current !== targetCampaignId) return;
    lastSequenceRef.current = { campaignId: targetCampaignId, sequence };
    writeNavigationState(targetCampaignId, sequence);
  }, []);

  const refreshAuthority = useCallback(async (
    preferredTurnId?: string,
  ): Promise<AuthoritySnapshot> => {
    const nextState = await loadCampaignPlayState(campaignId);
    const turnId = nextState.activeTurn?.turnId ?? preferredTurnId ?? null;
    const nextTurn = turnId === null
      ? null
      : await loadCampaignPlayTurn(campaignId, turnId);

    if (mountedRef.current && campaignIdRef.current === campaignId) {
      setState(nextState);
      setTurnRead(nextTurn);
      setRequestError(null);
      setEventProgress(nextState.activeTurn?.progress ?? null);
      const processingTurn = nextTurn?.turn.status === "processing"
        ? nextTurn.turn
        : nextState.activeTurn?.status === "processing"
          ? nextState.activeTurn
          : null;
      if (processingTurn) {
        setFollowedTurn((current) => current?.turnId === processingTurn.turnId
          && current.campaignId === campaignId
          ? current
          : {
              campaignId,
              turnId: processingTurn.turnId,
              sequence: processingTurn.lastEventSequence,
            });
        recordSequence(campaignId, processingTurn.lastEventSequence);
      } else {
        setFollowedTurn(null);
        setConnection("idle");
        const retainedSequence = lastSequenceRef.current.campaignId === campaignId
          ? lastSequenceRef.current.sequence
          : readNavigationSequence(campaignId);
        recordSequence(campaignId, retainedSequence);
      }
    }
    return { state: nextState, turn: nextTurn };
  }, [campaignId, recordSequence]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    void (async () => {
      try {
        await refreshAuthority();
      } catch (error) {
        if (!controller.signal.aborted && mountedRef.current) {
          setState(null);
          setTurnRead(null);
          setFollowedTurn(null);
          setRequestError({ campaignId, code: errorCode(error) });
        }
      } finally {
        if (!controller.signal.aborted && mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      mountedRef.current = false;
    };
  }, [campaignId, refreshAuthority]);

  useEffect(() => {
    if (followedTurn === null || followedTurn.campaignId !== campaignId) return;
    const controller = new AbortController();
    let cursor = followedTurn.sequence;

    void (async () => {
      while (!controller.signal.aborted) {
        setConnection("connecting");
        try {
          await streamCampaignPlayTurnEvents(campaignId, followedTurn.turnId, {
            afterSequence: cursor,
            signal: controller.signal,
            onEvent: (event: CampaignPlaySseEvent) => {
              if (controller.signal.aborted || campaignIdRef.current !== campaignId) return;
              if (event.sequence <= cursor) return;
              if (event.sequence !== cursor + 1) {
                throw new Error("Campaign Play event sequence is discontinuous.");
              }
              cursor = event.sequence;
              recordSequence(campaignId, cursor);
              setConnection("connected");
              if (event.type === "turn.progressed") setEventProgress(event.progress);
            },
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!isAbortError(error) && mountedRef.current) setConnection("disconnected");
        }

        if (!mountedRef.current || campaignIdRef.current !== campaignId) return;
        let authority: AuthoritySnapshot;
        try {
          authority = await refreshAuthority(followedTurn.turnId);
        } catch (error) {
          if (controller.signal.aborted || campaignIdRef.current !== campaignId) return;
          setRequestError({ campaignId, code: errorCode(error) });
          setConnection("disconnected");
          await waitForReconnect(reconnectDelayMilliseconds, controller.signal);
          continue;
        }

        if (controller.signal.aborted || campaignIdRef.current !== campaignId) return;
        if (authority.turn?.turn.status !== "processing") return;
        cursor = authority.turn.turn.lastEventSequence;
        recordSequence(campaignId, cursor);
        setConnection("disconnected");
        await waitForReconnect(reconnectDelayMilliseconds, controller.signal);
      }
    })();

    return () => controller.abort();
  }, [campaignId, followedTurn, reconnectDelayMilliseconds, recordSequence, refreshAuthority]);

  const beginFollowing = useCallback((turnId: string, sequence: number) => {
    setTurnRead(null);
    setEventProgress(null);
    setFollowedTurn({ campaignId, turnId, sequence });
    recordSequence(campaignId, sequence);
  }, [campaignId, recordSequence]);

  const reconcileRequestFailure = useCallback(async (
    operation: PendingOperation,
    error: unknown,
  ) => {
    if (
      !mountedRef.current || campaignIdRef.current !== campaignId ||
      operationRef.current !== operation
    ) return;
    const preferredTurnId = error instanceof CampaignPlayApiError
      ? error.details?.turnId ?? undefined
      : undefined;
    try {
      await refreshAuthority(preferredTurnId);
    } catch {
      // The original public request error remains the useful player-facing result.
    }
    if (
      mountedRef.current && campaignIdRef.current === campaignId &&
      operationRef.current === operation
    ) setRequestError({ campaignId, code: errorCode(error) });
  }, [campaignId, refreshAuthority]);

  const submitAction = useCallback(async () => {
    if (
      operationRef.current?.campaignId === campaignId ||
      campaignState?.phase !== "ready" || draft.trim().length === 0
    ) return;
    const operation: PendingOperation = { campaignId, kind: "admission", token: Symbol() };
    operationRef.current = operation;
    setPendingOperation(operation);
    setRequestError(null);
    try {
      const admission = await admitCampaignPlayTurn(campaignId, {
        source: "freeform",
        idempotencyKey: crypto.randomUUID(),
        text: draft,
        expectedWorldVersion: campaignState.worldVersion,
        expectedRuntimeRevision: campaignState.runtimeRevision,
      });
      if (
        !mountedRef.current || campaignIdRef.current !== campaignId ||
        operationRef.current !== operation
      ) return;
      beginFollowing(admission.turnId, admission.sequence);
      setDraft("");
    } catch (error) {
      await reconcileRequestFailure(operation, error);
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        if (mountedRef.current && campaignIdRef.current === campaignId) setPendingOperation(null);
      }
    }
  }, [beginFollowing, campaignId, campaignState, draft, reconcileRequestFailure, setDraft]);

  const submitOpening = useCallback(async (startingConditions: CampaignPlayStartingConditions) => {
    if (
      operationRef.current?.campaignId === campaignId ||
      campaignState?.phase !== "opening_required"
    ) return;
    const operation: PendingOperation = { campaignId, kind: "admission", token: Symbol() };
    operationRef.current = operation;
    setPendingOperation(operation);
    setRequestError(null);
    try {
      const admission = await admitCampaignPlayOpening(campaignId, {
        idempotencyKey: crypto.randomUUID(),
        startingConditions,
        expectedWorldVersion: campaignState.worldVersion,
        expectedRuntimeRevision: campaignState.runtimeRevision,
      });
      if (
        !mountedRef.current || campaignIdRef.current !== campaignId ||
        operationRef.current !== operation
      ) return;
      beginFollowing(admission.turnId, admission.sequence);
    } catch (error) {
      await reconcileRequestFailure(operation, error);
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        if (mountedRef.current && campaignIdRef.current === campaignId) setPendingOperation(null);
      }
    }
  }, [beginFollowing, campaignId, campaignState, reconcileRequestFailure]);

  const resumeTurn = useCallback(async () => {
    const turn = campaignState?.activeTurn ?? campaignTurnRead?.turn ?? null;
    if (
      operationRef.current?.campaignId === campaignId || turn?.status !== "interrupted" ||
      !turn.retryEligible || !campaignState
    ) {
      return;
    }
    const operation: PendingOperation = { campaignId, kind: "resume", token: Symbol() };
    operationRef.current = operation;
    setPendingOperation(operation);
    setRequestError(null);
    try {
      const admission = await resumeCampaignPlayTurn(campaignId, turn.turnId, {
        expectedWorldVersion: campaignState.worldVersion,
        expectedRuntimeRevision: campaignState.runtimeRevision,
      });
      if (
        !mountedRef.current || campaignIdRef.current !== campaignId ||
        operationRef.current !== operation
      ) return;
      beginFollowing(admission.turnId, admission.sequence - 1);
    } catch (error) {
      await reconcileRequestFailure(operation, error);
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        if (mountedRef.current && campaignIdRef.current === campaignId) setPendingOperation(null);
      }
    }
  }, [beginFollowing, campaignId, campaignState, campaignTurnRead, reconcileRequestFailure]);

  if (loading || (state !== null && campaignState === null)) {
    return <section aria-live="polite" className="grid min-h-dvh place-items-center">Loading campaign</section>;
  }

  if (campaignState === null) {
    return (
      <section className="grid min-h-dvh place-items-center p-6">
        <p role="alert">{ERROR_COPY[campaignError ?? "service_unavailable"]}</p>
      </section>
    );
  }

  const activeTurn = campaignState.activeTurn ?? campaignTurnRead?.turn ?? null;
  const progress = eventProgress ?? activeTurn?.progress ?? null;
  const followsCurrentCampaign = followedTurn?.campaignId === campaignId;
  const inputLocked = campaignState.phase !== "ready" || followsCurrentCampaign ||
    campaignPendingOperation !== null;
  const interrupted = activeTurn?.status === "interrupted";
  const failedCode = campaignTurnRead?.result.status === "failed"
    ? campaignTurnRead.result.errorCode
    : null;
  const progressCopy = progress === null
    ? "Action received"
    : activeTurn?.turnKind === "opening"
      ? OPENING_PROGRESS_COPY[progress]
      : PROGRESS_COPY[progress];

  const selectedOpeningOption = openingSelection === null
    ? null
    : campaignState.openingOptions.find(
        (option) => option.locationHandle === openingSelection.locationHandle,
      ) ?? null;
  const validOpeningSelection = selectedOpeningOption !== null && openingSelection !== null &&
    selectedOpeningOption.roles.some((option) => option.handle === openingSelection.roleHandle) &&
    selectedOpeningOption.arrivalModes.some(
      (option) => option.handle === openingSelection.arrivalModeHandle,
    ) &&
    selectedOpeningOption.immediateSituations.some(
      (option) => option.handle === openingSelection.immediateSituationHandle,
    );

  if (campaignState.phase === "character_required") {
    return (
      <section className="campaign-play-guard">
        <p className="campaign-play-kicker">Player character</p>
        <h1>Create a player character before entering the world.</h1>
        <Link href={`/campaign/${campaignId}/character`}>Create character</Link>
      </section>
    );
  }

  return (
    <section
      className="campaign-play-page"
      data-connection={connection}
    >
      {campaignError || failedCode ? (
        <p className="campaign-play-alert" role="alert">{ERROR_COPY[campaignError ?? failedCode ?? "service_unavailable"]}</p>
      ) : null}

      <CampaignPlayStage
        connectionMessage={connection === "disconnected"
          ? "Connection lost. The turn may still be running."
          : ""}
        state={campaignState}
      >
        {campaignState.phase === "opening_required" && !followsCurrentCampaign ? (
          <section className="campaign-play-arrival" aria-labelledby="campaign-play-arrival-heading">
            <p className="campaign-play-kicker">Enter the world</p>
            <h1 id="campaign-play-arrival-heading">Choose your arrival</h1>
            <p>Pick a starting point and role, or let the world place you.</p>
            <div className="campaign-play-arrival-locations" role="group" aria-label="Starting places">
              {campaignState.openingOptions.map((option) => {
                const selected = option.locationHandle === openingSelection?.locationHandle;
                return (
                  <button
                    aria-label={option.name}
                    aria-pressed={selected}
                    key={option.locationHandle}
                    onClick={() => setOpeningSelection(initialOpeningSelection(option))}
                    type="button"
                  >
                    <strong>{option.name}</strong>
                    <span>{option.description}</span>
                  </button>
                );
              })}
            </div>
            {selectedOpeningOption && openingSelection ? (
              <div className="campaign-play-arrival-details">
                <label>
                  Your place here
                  <select
                    onChange={(event) => setOpeningSelection({
                      ...openingSelection,
                      roleHandle: event.target.value,
                    })}
                    value={openingSelection.roleHandle}
                  >
                    {selectedOpeningOption.roles.map((option) => (
                      <option key={option.handle} value={option.handle}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  How you arrive
                  <select
                    onChange={(event) => setOpeningSelection({
                      ...openingSelection,
                      arrivalModeHandle: event.target.value,
                    })}
                    value={openingSelection.arrivalModeHandle}
                  >
                    {selectedOpeningOption.arrivalModes.map((option) => (
                      <option key={option.handle} value={option.handle}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  What is happening
                  <select
                    onChange={(event) => setOpeningSelection({
                      ...openingSelection,
                      immediateSituationHandle: event.target.value,
                    })}
                    value={openingSelection.immediateSituationHandle}
                  >
                    {selectedOpeningOption.immediateSituations.map((option) => (
                      <option key={option.handle} value={option.handle}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            <div className="campaign-play-arrival-actions">
              <button
                disabled={campaignPendingOperation?.kind === "admission"}
                onClick={() => void submitOpening({ mode: "delegate" })}
                type="button"
              >
                Let the world decide
              </button>
              <button
                className="campaign-play-primary-action"
                disabled={!validOpeningSelection || campaignPendingOperation?.kind === "admission"}
                onClick={() => openingSelection && void submitOpening({
                  mode: "chosen",
                  ...openingSelection,
                })}
                type="button"
              >
                Begin
              </button>
            </div>
          </section>
        ) : null}

        {(followsCurrentCampaign || campaignState.phase === "opening_active" || campaignState.phase === "turn_active" || campaignState.phase === "narration_pending") ? (
          <div className="campaign-play-progress" aria-live="polite" role="status" tabIndex={-1}>
            <span aria-hidden="true" />
            <p>{progressCopy}</p>
          </div>
        ) : null}

        {interrupted ? (
          <div className="campaign-play-interruption">
            <p>{activeTurn?.turnKind === "opening" ? "The opening stopped before it finished." : "The turn stopped before it finished."}</p>
            {activeTurn?.retryEligible ? (
              <button
                disabled={campaignPendingOperation?.kind === "resume"}
                onClick={() => void resumeTurn()}
                type="button"
              >
                Resume
              </button>
            ) : null}
          </div>
        ) : null}
      </CampaignPlayStage>

      {(campaignState.phase === "ready" || campaignState.phase === "turn_active" || campaignState.phase === "narration_pending") ? (
        <div className="campaign-play-action-shell">
          <label htmlFor="campaign-play-action">Your action</label>
          <div>
            <textarea
              disabled={inputLocked}
              id="campaign-play-action"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="What do you do?"
              value={draft}
            />
            <button
              disabled={inputLocked || draft.trim().length === 0}
              onClick={() => void submitAction()}
              type="button"
            >
              Act
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default CampaignPlayPage;
