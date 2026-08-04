"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CampaignPlayOpeningLocationOption,
  CampaignPlayPublicErrorCode,
  CampaignPlayPublicProgress,
  CampaignPlayStartingConditions,
  CampaignPlaySseEvent,
  CampaignPlayState,
  CampaignPlayTurnAdmissionRequest,
  CampaignPlayTurnReadResponse,
} from "@worldforge/shared";

import { ActionDock } from "./ActionDock";
import { CampaignPlayStage } from "./CampaignPlayStage";
import { JournalDrawer } from "./JournalDrawer";
import { TurnProgress, type CampaignPlayConnectionState } from "./TurnProgress";

import {
  CampaignPlayApiError,
  admitCampaignPlayOpening,
  admitCampaignPlayTurn,
  loadCampaignPlayJournal,
  loadCampaignPlayState,
  loadCampaignPlayTurn,
  recoverCampaignPlayNarration,
  resumeCampaignPlayTurn,
  streamCampaignPlayTurnEvents,
} from "@/lib/campaign-play-api";

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
  turn_failed: "The turn could not be completed.",
  service_unavailable: "The game service is temporarily unavailable.",
};

const ERROR_ACTIONS = {
  campaign_not_found: { label: "Return to campaigns", kind: "campaigns" },
  world_not_accepted: { label: "Open world review", kind: "review" },
  world_not_playable: { label: "Open world review", kind: "review" },
  character_required: { label: "Create character", kind: "character" },
  character_already_exists: { label: "Reload character", kind: "character" },
  opening_required: { label: "Choose arrival", kind: "opening" },
  opening_already_completed: { label: "Reload scene", kind: "refresh" },
  invalid_character: { label: "Review character", kind: "character" },
  invalid_starting_conditions: { label: "Choose again", kind: "opening" },
  invalid_intent: { label: "Edit action", kind: "edit" },
  invalid_choice: { label: "Reload scene", kind: "refresh" },
  invalid_event_cursor: { label: "Reload scene", kind: "refresh" },
  idempotency_conflict: { label: "Reload scene", kind: "refresh" },
  stale_world_version: { label: "Reload scene", kind: "refresh" },
  stale_runtime_revision: { label: "Reload scene", kind: "refresh" },
  turn_in_progress: { label: "View progress", kind: "progress" },
  turn_not_found: { label: "Reload scene", kind: "refresh" },
  turn_not_resumable: { label: "Reload scene", kind: "refresh" },
  turn_interrupted: { label: "Resume", kind: "resume" },
  turn_failed: { label: "Return to scene", kind: "refresh" },
  service_unavailable: { label: "Try again", kind: "refresh" },
} as const satisfies Record<CampaignPlayPublicErrorCode, {
  label: string;
  kind: "campaigns" | "review" | "character" | "opening" | "edit" | "refresh" | "progress" | "resume";
}>;

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

interface CampaignOpeningSetupProps {
  openingOptions: CampaignPlayOpeningLocationOption[];
  pending: boolean;
  selection: OpeningSelection | null;
  onSelectionChange: (selection: OpeningSelection) => void;
  onSubmit: (startingConditions: CampaignPlayStartingConditions) => void;
}

function CampaignOpeningSetup({
  openingOptions,
  pending,
  selection,
  onSelectionChange,
  onSubmit,
}: CampaignOpeningSetupProps) {
  const selectedOption = selection === null
    ? null
    : openingOptions.find((option) => option.locationHandle === selection.locationHandle) ?? null;
  const validSelection = selectedOption !== null && selection !== null &&
    selectedOption.roles.some((option) => option.handle === selection.roleHandle) &&
    selectedOption.arrivalModes.some((option) => option.handle === selection.arrivalModeHandle) &&
    selectedOption.immediateSituations.some(
      (option) => option.handle === selection.immediateSituationHandle,
    );

  return (
    <section className="campaign-play-arrival" aria-labelledby="campaign-play-arrival-heading">
      <p className="campaign-play-kicker">Enter the world</p>
      <h1 id="campaign-play-arrival-heading" tabIndex={-1}>Choose your arrival</h1>
      <p>Pick a starting point and role, or let the world place you.</p>
      <div className="campaign-play-arrival-locations" role="group" aria-label="Starting places">
        {openingOptions.map((option) => {
          const selected = option.locationHandle === selection?.locationHandle;
          return (
            <button
              aria-label={option.name}
              aria-pressed={selected}
              key={option.locationHandle}
              onClick={() => onSelectionChange(initialOpeningSelection(option))}
              type="button"
            >
              <strong>{option.name}</strong>
              <span>{option.description}</span>
            </button>
          );
        })}
      </div>
      {selectedOption && selection ? (
        <div className="campaign-play-arrival-details">
          <label>
            Your place here
            <select
              onChange={(event) => onSelectionChange({ ...selection, roleHandle: event.target.value })}
              value={selection.roleHandle}
            >
              {selectedOption.roles.map((option) => (
                <option key={option.handle} value={option.handle}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            How you arrive
            <select
              onChange={(event) => onSelectionChange({
                ...selection,
                arrivalModeHandle: event.target.value,
              })}
              value={selection.arrivalModeHandle}
            >
              {selectedOption.arrivalModes.map((option) => (
                <option key={option.handle} value={option.handle}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            What is happening
            <select
              onChange={(event) => onSelectionChange({
                ...selection,
                immediateSituationHandle: event.target.value,
              })}
              value={selection.immediateSituationHandle}
            >
              {selectedOption.immediateSituations.map((option) => (
                <option key={option.handle} value={option.handle}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <div className="campaign-play-arrival-actions">
        <button disabled={pending} onClick={() => onSubmit({ mode: "delegate" })} type="button">
          Let the world decide
        </button>
        <button
          className="campaign-play-primary-action"
          disabled={!validSelection || pending}
          onClick={() => selection && onSubmit({ mode: "chosen", ...selection })}
          type="button"
        >
          Begin
        </button>
      </div>
    </section>
  );
}

export function CampaignPlayPage({
  campaignId,
  reconnectDelayMilliseconds = 500,
}: CampaignPlayPageProps) {
  const [state, setState] = useState<CampaignPlayState | null>(null);
  const [turnRead, setTurnRead] = useState<CampaignPlayTurnReadResponse | null>(null);
  const [followedTurn, setFollowedTurn] = useState<FollowedTurn | null>(null);
  const [connection, setConnection] = useState<CampaignPlayConnectionState>("idle");
  const [eventProgress, setEventProgress] = useState<CampaignPlayPublicProgress | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState<{
    campaignId: string;
    code: CampaignPlayPublicErrorCode;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null);
  const [openingSelection, setOpeningSelection] = useState<OpeningSelection | null>(null);
  const [journalOpenCampaignId, setJournalOpenCampaignId] = useState<string | null>(null);
  const [recoveringNarrationId, setRecoveringNarrationId] = useState<string | null>(null);
  const operationRef = useRef<PendingOperation | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const narrationFocusRef = useRef<HTMLElement>(null);
  const suggestionsHeadingRef = useRef<HTMLHeadingElement>(null);
  const journalTriggerRef = useRef<HTMLButtonElement>(null);
  const actionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const errorActionRef = useRef<HTMLButtonElement>(null);
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
  const journalOpen = journalOpenCampaignId === campaignId;

  const setDraft = useCallback((value: string) => {
    setDrafts((current) => ({ ...current, [campaignId]: value }));
    writeStoredDraft(campaignId, value);
  }, [campaignId]);

  const loadJournalPage = useCallback(
    (cursor: number) => loadCampaignPlayJournal(campaignId, { cursor, limit: 20 }),
    [campaignId],
  );

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

  const retryAuthority = useCallback(() => {
    void refreshAuthority().catch((error) => {
      if (mountedRef.current && campaignIdRef.current === campaignId) {
        setRequestError({ campaignId, code: errorCode(error) });
      }
    });
  }, [campaignId, refreshAuthority]);

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
        const authorityTurn = authority.turn;
        const terminalStatus = authorityTurn?.turn.status;
        if (authorityTurn === null || terminalStatus !== "processing") {
          window.setTimeout(() => {
            if (campaignIdRef.current !== campaignId) return;
            if (terminalStatus === "interrupted") {
              progressRef.current?.focus();
            } else if (terminalStatus === "failed") {
              errorActionRef.current?.focus();
            } else if (terminalStatus === "completed") {
              (suggestionsHeadingRef.current ?? narrationFocusRef.current)?.focus();
            }
          }, 0);
          return;
        }
        cursor = authorityTurn.turn.lastEventSequence;
        recordSequence(campaignId, cursor);
        setConnection("disconnected");
        await waitForReconnect(reconnectDelayMilliseconds, controller.signal);
      }
    })();

    return () => controller.abort();
  }, [campaignId, followedTurn, reconnectDelayMilliseconds, recordSequence, refreshAuthority]);

  useEffect(() => {
    const operation = campaignState?.narrationOperation;
    if (!operation || (operation.status !== "pending" && operation.status !== "running")) return;
    const controller = new AbortController();
    void (async () => {
      while (!controller.signal.aborted) {
        await waitForReconnect(reconnectDelayMilliseconds, controller.signal);
        if (controller.signal.aborted) return;
        try {
          const authority = await refreshAuthority(operation.turnId);
          const status = authority.state.narrationOperation?.status;
          if (status !== "pending" && status !== "running") return;
        } catch {
          // The committed result remains playable while narration status is temporarily unavailable.
        }
      }
    })();
    return () => controller.abort();
  }, [campaignState?.narrationOperation, reconnectDelayMilliseconds, refreshAuthority]);

  const beginFollowing = useCallback((turnId: string, sequence: number) => {
    setTurnRead(null);
    setEventProgress(null);
    setFollowedTurn({ campaignId, turnId, sequence });
    recordSequence(campaignId, sequence);
    window.setTimeout(() => progressRef.current?.focus(), 0);
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

  const submitAction = useCallback(async (
    action: Pick<CampaignPlayTurnAdmissionRequest, "source"> & {
      text?: string;
      choiceHandle?: string;
    },
  ) => {
    const request = action.source === "freeform"
      ? { source: "freeform" as const, text: action.text ?? "" }
      : { source: "suggested" as const, choiceHandle: action.choiceHandle ?? "" };
    if (
      operationRef.current?.campaignId === campaignId ||
      campaignState?.phase !== "ready" ||
      (request.source === "freeform" ? request.text.trim().length === 0 : request.choiceHandle.length === 0)
    ) return;
    const operation: PendingOperation = { campaignId, kind: "admission", token: Symbol() };
    operationRef.current = operation;
    setPendingOperation(operation);
    setRequestError(null);
    try {
      const admission = await admitCampaignPlayTurn(campaignId, {
        ...request,
        idempotencyKey: crypto.randomUUID(),
        expectedWorldVersion: campaignState.worldVersion,
        expectedRuntimeRevision: campaignState.runtimeRevision,
      });
      if (
        !mountedRef.current || campaignIdRef.current !== campaignId ||
        operationRef.current !== operation
      ) return;
      beginFollowing(admission.turnId, admission.sequence);
      if (request.source === "freeform") setDraft("");
    } catch (error) {
      await reconcileRequestFailure(operation, error);
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        if (mountedRef.current && campaignIdRef.current === campaignId) setPendingOperation(null);
      }
    }
  }, [beginFollowing, campaignId, campaignState, reconcileRequestFailure, setDraft]);

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

  const recoverNarration = useCallback(async () => {
    const operation = campaignState?.narrationOperation;
    if (!operation || operation.status !== "failed" || recoveringNarrationId !== null) return;
    setRecoveringNarrationId(operation.operationId);
    setRequestError(null);
    try {
      await recoverCampaignPlayNarration(campaignId, operation.turnId, {
        operationId: operation.operationId,
        resultId: operation.resultId,
        narrationId: operation.narrationId,
        packetHash: operation.packetHash,
        receiptIds: operation.receiptIds,
      });
      await refreshAuthority(operation.turnId);
    } catch (error) {
      if (mountedRef.current && campaignIdRef.current === campaignId) {
        setRequestError({ campaignId, code: errorCode(error) });
      }
    } finally {
      if (mountedRef.current && campaignIdRef.current === campaignId) {
        setRecoveringNarrationId(null);
      }
    }
  }, [campaignId, campaignState?.narrationOperation, recoveringNarrationId, refreshAuthority]);

  if (loading || (state !== null && campaignState === null)) {
    return <section aria-live="polite" className="grid min-h-dvh place-items-center">Loading campaign</section>;
  }

  if (campaignState === null) {
    const initialError = campaignError ?? "service_unavailable";
    const initialAction = ERROR_ACTIONS[initialError];
    return (
      <section className="grid min-h-dvh place-items-center p-6">
        <div className="campaign-play-alert" role="alert">
          <p>{ERROR_COPY[initialError]}</p>
          {initialAction.kind === "campaigns" ? (
            <Link href="/">{initialAction.label}</Link>
          ) : initialAction.kind === "review" ? (
            <Link href={`/campaign/${campaignId}/review`}>{initialAction.label}</Link>
          ) : initialAction.kind === "character" ? (
            <Link href={`/campaign/${campaignId}/character`}>{initialAction.label}</Link>
          ) : (
            <button onClick={retryAuthority} type="button">{initialAction.label}</button>
          )}
        </div>
      </section>
    );
  }

  const activeTurn = campaignState.activeTurn ?? campaignTurnRead?.turn ?? null;
  const progress = eventProgress ?? activeTurn?.progress ?? null;
  const followsCurrentCampaign = followedTurn?.campaignId === campaignId;
  const inputLocked = campaignState.phase !== "ready" || followsCurrentCampaign ||
    campaignPendingOperation !== null;
  const failedCode = campaignTurnRead?.result.status === "failed"
    ? campaignTurnRead.result.errorCode
    : null;
  const activeError = campaignError ?? failedCode;
  const actionSurfaceVisible = campaignState.phase === "ready" ||
    campaignState.phase === "turn_active" || campaignState.phase === "narration_pending";
  const turnProgress = (
    <TurnProgress
      accepted={followsCurrentCampaign}
      connection={connection}
      onResume={() => void resumeTurn()}
      pendingResume={campaignPendingOperation?.kind === "resume"}
      progress={progress}
      ref={progressRef}
      turn={activeTurn}
    />
  );
  const errorAction = activeError === null ? null : ERROR_ACTIONS[activeError];
  const runErrorAction = () => {
    if (errorAction === null) return;
    if (errorAction.kind === "opening") {
      document.getElementById("campaign-play-arrival-heading")?.focus();
    } else if (errorAction.kind === "edit") {
      actionTextareaRef.current?.focus();
    } else if (errorAction.kind === "refresh") {
      retryAuthority();
    } else if (errorAction.kind === "progress") {
      progressRef.current?.focus();
    } else if (errorAction.kind === "resume") {
      void resumeTurn();
    }
  };

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
      {activeError && errorAction ? (
        <div className="campaign-play-alert" role="alert">
          <p>{ERROR_COPY[activeError]}</p>
          {errorAction.kind === "campaigns" ? (
            <Link href="/">{errorAction.label}</Link>
          ) : errorAction.kind === "review" ? (
            <Link href={`/campaign/${campaignId}/review`}>{errorAction.label}</Link>
          ) : errorAction.kind === "character" ? (
            <Link href={`/campaign/${campaignId}/character`}>{errorAction.label}</Link>
          ) : (
            <button onClick={runErrorAction} ref={errorActionRef} type="button">
              {errorAction.label}
            </button>
          )}
        </div>
      ) : null}

      <CampaignPlayStage
        narrationRecoveryPending={recoveringNarrationId !== null}
        narrationFocusRef={narrationFocusRef}
        onRecoverNarration={() => void recoverNarration()}
        state={campaignState}
      >
        {campaignState.phase === "opening_required" && !followsCurrentCampaign ? (
          <CampaignOpeningSetup
            onSelectionChange={setOpeningSelection}
            onSubmit={(startingConditions) => void submitOpening(startingConditions)}
            openingOptions={campaignState.openingOptions}
            pending={campaignPendingOperation?.kind === "admission"}
            selection={openingSelection}
          />
        ) : null}

        {!actionSurfaceVisible && (followsCurrentCampaign || activeTurn !== null) ? turnProgress : null}
      </CampaignPlayStage>

      {actionSurfaceVisible ? (
        <ActionDock
          draft={draft}
          inputLocked={inputLocked}
          journalOpen={journalOpen}
          journalTriggerRef={journalTriggerRef}
          onDraftChange={setDraft}
          onJournalOpen={() => setJournalOpenCampaignId(campaignId)}
          onSubmitFreeform={() => void submitAction({ source: "freeform", text: draft })}
          onSubmitSuggested={(choiceHandle) => void submitAction({ source: "suggested", choiceHandle })}
          pendingAdmission={campaignPendingOperation?.kind === "admission"}
          statusSlot={activeTurn !== null || followsCurrentCampaign ? turnProgress : undefined}
          suggestedActions={campaignState.narration?.suggestedActions ??
            campaignState.narrationOperation?.conciseResult.suggestedActions ?? []}
          utilityActions={campaignState.utilityActions}
          suggestionsHeadingRef={suggestionsHeadingRef}
          textareaRef={actionTextareaRef}
        />
      ) : null}

      <JournalDrawer
        key={campaignId}
        loadPage={loadJournalPage}
        onClose={() => setJournalOpenCampaignId(null)}
        open={journalOpen}
        returnFocusRef={journalTriggerRef}
      />
    </section>
  );
}

export default CampaignPlayPage;
