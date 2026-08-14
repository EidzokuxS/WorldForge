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
  applied: boolean;
  consistent: boolean;
}

interface AuthorityRefreshOptions {
  clearRequestError?: boolean;
  signal?: AbortSignal;
}

interface AuthorityApplication {
  campaignId: string;
  turnId: string | null;
  runtimeRevision: number;
  projectionRank: number;
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

const AUTHORITY_READ_DEADLINE_MS = 5_000;
const AUTHORITY_RECOVERY_RELOAD_DELAY_MS = 15_000;
const AUTHORITY_RECOVERY_RELOAD_KEY_PREFIX = "worldforge:campaign-play:authority-recovery-reload:";

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

function authorityRecoveryReloadKey(campaignId: string, turnId: string): string {
  return `${AUTHORITY_RECOVERY_RELOAD_KEY_PREFIX}${campaignId}:${turnId}`;
}

function hasAuthorityRecoveryReloadGuard(campaignId: string, turnId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(authorityRecoveryReloadKey(campaignId, turnId)) === "1";
  } catch {
    return false;
  }
}

function readAuthorityRecoveryReloadTurnId(campaignId: string): string | null {
  if (typeof window === "undefined") return null;
  const prefix = `${AUTHORITY_RECOVERY_RELOAD_KEY_PREFIX}${campaignId}:`;
  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(prefix) && window.sessionStorage.getItem(key) === "1") {
        return key.slice(prefix.length);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function armAuthorityRecoveryReloadGuard(campaignId: string, turnId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const key = authorityRecoveryReloadKey(campaignId, turnId);
    window.sessionStorage.setItem(key, "1");
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function clearAuthorityRecoveryReloadGuard(campaignId: string, turnId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(authorityRecoveryReloadKey(campaignId, turnId));
  } catch {
    // The page can still settle using its in-memory authority projection.
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

class AuthorityReadTimeoutError extends Error {
  constructor() {
    super("Campaign Play authority read timed out.");
    this.name = "AuthorityReadTimeoutError";
  }
}

function authorityAbortError(): Error {
  const error = new Error("Campaign Play authority read aborted.");
  error.name = "AbortError";
  return error;
}

function withAuthorityReadDeadline<T>(
  parentSignal: AbortSignal | undefined,
  read: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
    };
    const settle = (kind: "resolve" | "reject", value: T | Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (kind === "resolve") resolve(value as T);
      else reject(value);
    };
    const abortFromParent = () => {
      controller.abort();
      settle("reject", authorityAbortError());
    };

    if (parentSignal?.aborted) {
      abortFromParent();
      return;
    }
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      settle("reject", new AuthorityReadTimeoutError());
    }, AUTHORITY_READ_DEADLINE_MS);
    void read(controller.signal).then(
      (value) => settle("resolve", value),
      (error: unknown) => settle("reject", error instanceof Error ? error : new Error(String(error))),
    );
  });
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

function isTurnProjectionReady(
  state: CampaignPlayState,
  turn: CampaignPlayTurnReadResponse | null,
  turnId: string,
): boolean {
  const operation = state.narrationOperation;
  if (operation?.turnId === turnId && (operation.status === "pending" || operation.status === "running")) {
    return false;
  }
  const currentScene = state.narration?.turnId === turnId;
  if (state.phase === "ready" && currentScene) return true;
  if (operation?.turnId === turnId) {
    return operation.status === "failed" || (operation.status === "complete" && currentScene);
  }
  if (turn?.turn.status === "interrupted" || turn?.turn.status === "failed") return true;
  if (turn?.result.status === "completed") {
    const resultOperation = turn.result.narrationOperation;
    if (resultOperation?.status === "pending" || resultOperation?.status === "running") return false;
    return turn.result.narration?.turnId === turnId;
  }
  return false;
}

function isStateProjectionReady(state: CampaignPlayState, turnId: string): boolean {
  if (state.phase !== "ready" || state.activeTurn !== null) return false;
  const operation = state.narrationOperation;
  if (operation?.turnId === turnId && (operation.status === "pending" || operation.status === "running")) {
    return false;
  }
  if (state.narration?.turnId === turnId) return true;
  return operation?.turnId === turnId && operation.status === "failed";
}

function authorityProjectionRank(
  state: CampaignPlayState,
  turn: CampaignPlayTurnReadResponse | null,
  turnId: string | null,
): number {
  if (turnId === null) return state.phase === "ready" ? 2 : 0;
  if (isStateProjectionReady(state, turnId) || isTurnProjectionReady(state, turn, turnId)) return 2;
  const operation = state.narrationOperation;
  if (operation?.turnId === turnId && (operation.status === "pending" || operation.status === "running")) {
    return 1;
  }
  if (turn?.result.status === "completed") {
    const resultOperation = turn.result.narrationOperation;
    if (resultOperation?.status === "pending" || resultOperation?.status === "running") return 1;
  }
  return 0;
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
  const [followedTurn, setFollowedTurnState] = useState<FollowedTurn | null>(null);
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
  const followedTurnRef = useRef<FollowedTurn | null>(null);
  const authorityAppliedRef = useRef<AuthorityApplication | null>(null);
  const authorityRecoveryFailureRef = useRef<{
    campaignId: string;
    turnId: string;
    timer: number;
  } | null>(null);
  const authorityRecoveryControllerRef = useRef<AbortController | null>(null);
  const automaticReloadRequestRef = useRef<{ campaignId: string; turnId: string } | null>(null);
  campaignIdRef.current = campaignId;

  const setFollowedTurn = useCallback((next: FollowedTurn | null) => {
    followedTurnRef.current = next;
    setFollowedTurnState(next);
  }, []);

  const clearAuthorityRecoveryFailure = useCallback((target?: Pick<FollowedTurn, "campaignId" | "turnId">) => {
    const current = authorityRecoveryFailureRef.current;
    if (current === null || (target !== undefined && (
      current.campaignId !== target.campaignId || current.turnId !== target.turnId
    ))) return;
    window.clearTimeout(current.timer);
    authorityRecoveryFailureRef.current = null;
  }, []);

  const noteAuthorityRecoveryFailure = useCallback((target: FollowedTurn) => {
    if (
      !mountedRef.current ||
      campaignIdRef.current !== target.campaignId ||
      followedTurnRef.current?.campaignId !== target.campaignId ||
      followedTurnRef.current.turnId !== target.turnId ||
      (automaticReloadRequestRef.current?.campaignId === target.campaignId &&
        automaticReloadRequestRef.current.turnId === target.turnId) ||
      hasAuthorityRecoveryReloadGuard(target.campaignId, target.turnId)
    ) return;
    const current = authorityRecoveryFailureRef.current;
    if (current?.campaignId === target.campaignId && current.turnId === target.turnId) return;
    clearAuthorityRecoveryFailure();
    const timer = window.setTimeout(() => {
      if (
        !mountedRef.current ||
        campaignIdRef.current !== target.campaignId ||
        followedTurnRef.current?.campaignId !== target.campaignId ||
        followedTurnRef.current.turnId !== target.turnId ||
        automaticReloadRequestRef.current !== null ||
        hasAuthorityRecoveryReloadGuard(target.campaignId, target.turnId)
      ) return;
      if (!armAuthorityRecoveryReloadGuard(target.campaignId, target.turnId)) return;
      automaticReloadRequestRef.current = target;
      authorityRecoveryControllerRef.current?.abort();
      window.location.reload();
    }, AUTHORITY_RECOVERY_RELOAD_DELAY_MS);
    authorityRecoveryFailureRef.current = {
      campaignId: target.campaignId,
      turnId: target.turnId,
      timer,
    };
  }, [clearAuthorityRecoveryFailure]);

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
    const current = lastSequenceRef.current.campaignId === targetCampaignId
      ? lastSequenceRef.current.sequence
      : readNavigationSequence(targetCampaignId);
    const nextSequence = Math.max(current, sequence);
    lastSequenceRef.current = { campaignId: targetCampaignId, sequence: nextSequence };
    writeNavigationState(targetCampaignId, nextSequence);
  }, []);

  const applyAuthorityState = useCallback((
    nextState: CampaignPlayState,
    preferredTurnId?: string,
    options: Pick<AuthorityRefreshOptions, "clearRequestError"> = {},
  ) => {
    const followedId = followedTurnRef.current?.campaignId === campaignId
      ? followedTurnRef.current.turnId
      : null;
    const recoveryTurnId = readAuthorityRecoveryReloadTurnId(campaignId);
    const trackedTurnId = preferredTurnId ?? followedId ?? nextState.activeTurn?.turnId ??
      nextState.narrationOperation?.turnId ?? recoveryTurnId;
    const snapshotRevision = nextState.runtimeRevision;
    const projectionRank = authorityProjectionRank(nextState, null, trackedTurnId);
    const previous = authorityAppliedRef.current;
    const stale = previous !== null && previous.campaignId === campaignId && (
      snapshotRevision < previous.runtimeRevision ||
      (
        trackedTurnId === previous.turnId &&
        snapshotRevision === previous.runtimeRevision &&
        projectionRank < previous.projectionRank
      )
    );
    const applied = !stale && mountedRef.current && campaignIdRef.current === campaignId;
    if (!applied) {
      return {
        applied: false,
        trackedTurnId,
        projectionReady: false,
        nextSequence: followedTurnRef.current?.sequence ?? readNavigationSequence(campaignId),
      };
    }

    authorityAppliedRef.current = {
      campaignId,
      turnId: trackedTurnId,
      runtimeRevision: snapshotRevision,
      projectionRank,
    };
    setState(nextState);
    if (options.clearRequestError) setRequestError(null);
    setEventProgress(nextState.activeTurn?.progress ?? null);

    const projectionReady = trackedTurnId !== null && isStateProjectionReady(nextState, trackedTurnId);
    const processingTurn = nextState.activeTurn?.status === "processing"
      ? nextState.activeTurn
      : null;
    const terminalTurn = nextState.activeTurn?.status === "interrupted" ||
      nextState.activeTurn?.status === "failed";
    if (trackedTurnId !== null && (projectionReady || terminalTurn)) {
      clearAuthorityRecoveryReloadGuard(campaignId, trackedTurnId);
      clearAuthorityRecoveryFailure({ campaignId, turnId: trackedTurnId });
      if (automaticReloadRequestRef.current?.campaignId === campaignId &&
        automaticReloadRequestRef.current.turnId === trackedTurnId) {
        automaticReloadRequestRef.current = null;
      }
    }
    const shouldFollow = processingTurn !== null || (
      trackedTurnId !== null && !projectionReady && !terminalTurn
    );
    const nextSequence = processingTurn?.lastEventSequence ?? nextState.activeTurn?.lastEventSequence ??
      followedTurnRef.current?.sequence ?? readNavigationSequence(campaignId);
    const currentFollowed = followedTurnRef.current;
    if (shouldFollow && trackedTurnId !== null) {
      if (currentFollowed?.campaignId !== campaignId || currentFollowed.turnId !== trackedTurnId) {
        setFollowedTurn({ campaignId, turnId: trackedTurnId, sequence: nextSequence });
      }
      recordSequence(campaignId, nextSequence);
    } else {
      setFollowedTurn(null);
      setTurnRead((current) => nextState.phase === "ready" && nextState.activeTurn === null ? null : current);
      setConnection("idle");
      const retainedSequence = Math.max(
        lastSequenceRef.current.campaignId === campaignId
          ? lastSequenceRef.current.sequence
          : readNavigationSequence(campaignId),
        nextState.activeTurn?.lastEventSequence ?? 0,
      );
      recordSequence(campaignId, retainedSequence);
      if (terminalTurn) {
        window.setTimeout(() => {
          if (campaignIdRef.current !== campaignId) return;
          if (nextState.activeTurn?.status === "interrupted") {
            progressRef.current?.focus();
          } else if (nextState.activeTurn?.status === "failed") {
            errorActionRef.current?.focus();
          }
        }, 0);
      }
    }
    return { applied: true, trackedTurnId, projectionReady, nextSequence };
  }, [campaignId, clearAuthorityRecoveryFailure, recordSequence, setFollowedTurn]);

  const refreshAuthority = useCallback(async (
    preferredTurnId?: string,
    options: AuthorityRefreshOptions = {},
  ): Promise<AuthoritySnapshot> => {
    const nextState = await withAuthorityReadDeadline(
      options.signal,
      (signal) => loadCampaignPlayState(campaignId, { signal }),
    );
    if (options.signal?.aborted) throw authorityAbortError();

    const followedId = followedTurnRef.current?.campaignId === campaignId
      ? followedTurnRef.current.turnId
      : null;
    const turnId = preferredTurnId ?? followedId ?? nextState.activeTurn?.turnId ??
      nextState.narrationOperation?.turnId ?? null;
    const stateApplication = applyAuthorityState(nextState, preferredTurnId, options);
    if (!stateApplication.applied) {
      return { state: nextState, turn: null, applied: false, consistent: true };
    }

    // A ready state owns the rendered scene. Do not let a stale or unavailable
    // turn-detail read delay the scene or re-lock the controls.
    if (turnId !== null && stateApplication.projectionReady) {
      return { state: nextState, turn: null, applied: true, consistent: true };
    }

    let nextTurn: CampaignPlayTurnReadResponse | null = null;
    try {
      nextTurn = turnId === null
        ? null
        : await withAuthorityReadDeadline(
          options.signal,
          (signal) => loadCampaignPlayTurn(campaignId, turnId, { signal }),
        );
    } catch (error) {
      if (options.signal?.aborted || isAbortError(error)) throw error;
      return { state: nextState, turn: null, applied: true, consistent: true };
    }
    if (options.signal?.aborted) throw authorityAbortError();

    const consistent = nextTurn === null || nextTurn.runtimeRevision === nextState.runtimeRevision;
    if (consistent && nextTurn !== null && mountedRef.current && campaignIdRef.current === campaignId &&
      (followedTurnRef.current?.turnId === turnId || nextState.activeTurn?.turnId === turnId)) {
      setTurnRead(nextTurn);
      recordSequence(campaignId, nextTurn.turn.lastEventSequence);
    }
    return { state: nextState, turn: nextTurn, applied: true, consistent };
  }, [applyAuthorityState, campaignId, recordSequence]);

  const retryAuthority = useCallback(() => {
    void refreshAuthority(undefined, { clearRequestError: true }).catch((error) => {
      if (mountedRef.current && campaignIdRef.current === campaignId) {
        setRequestError({ campaignId, code: errorCode(error) });
      }
    });
  }, [campaignId, refreshAuthority]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    const recoveryTurnId = readAuthorityRecoveryReloadTurnId(campaignId);
    if (recoveryTurnId !== null) {
      setFollowedTurn({
        campaignId,
        turnId: recoveryTurnId,
        sequence: readNavigationSequence(campaignId),
      });
      setLoading(false);
      return () => {
        controller.abort();
        mountedRef.current = false;
        clearAuthorityRecoveryFailure();
        if (automaticReloadRequestRef.current?.campaignId === campaignId) {
          automaticReloadRequestRef.current = null;
        }
      };
    }
    void (async () => {
      try {
        let authority = await refreshAuthority(undefined, {
          clearRequestError: true,
          signal: controller.signal,
        });
        while (!controller.signal.aborted && !authority.consistent) {
          await waitForReconnect(reconnectDelayMilliseconds, controller.signal);
          if (controller.signal.aborted) return;
          authority = await refreshAuthority(undefined, {
            clearRequestError: true,
            signal: controller.signal,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted && mountedRef.current) {
          if (readAuthorityRecoveryReloadTurnId(campaignId) === null) {
            setState(null);
            setTurnRead(null);
            setFollowedTurn(null);
            setRequestError({ campaignId, code: errorCode(error) });
          } else {
            setConnection("disconnected");
            setRequestError(null);
          }
        }
      } finally {
        if (!controller.signal.aborted && mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      mountedRef.current = false;
      clearAuthorityRecoveryFailure();
      if (automaticReloadRequestRef.current?.campaignId === campaignId) {
        automaticReloadRequestRef.current = null;
      }
    };
  }, [campaignId, clearAuthorityRecoveryFailure, reconnectDelayMilliseconds, refreshAuthority, setFollowedTurn]);

  useEffect(() => {
    if (followedTurn === null || followedTurn.campaignId !== campaignId) return;
    const controller = new AbortController();
    let cursor = followedTurn.sequence;

    void (async () => {
      while (!controller.signal.aborted) {
        const recordedSequence = lastSequenceRef.current.campaignId === campaignId
          ? lastSequenceRef.current.sequence
          : 0;
        if (recordedSequence > cursor) cursor = recordedSequence;
        setConnection("connecting");
        try {
          const stream = await streamCampaignPlayTurnEvents(campaignId, followedTurn.turnId, {
            afterSequence: cursor,
            signal: controller.signal,
            onEvent: (event: CampaignPlaySseEvent) => {
              if (
                controller.signal.aborted ||
                campaignIdRef.current !== campaignId ||
                followedTurnRef.current?.turnId !== followedTurn.turnId
              ) return;
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
          if (stream.lastSequence > cursor) {
            cursor = stream.lastSequence;
            recordSequence(campaignId, cursor);
          }
          if (!controller.signal.aborted) setConnection("connected");
        } catch (error) {
          if (controller.signal.aborted || followedTurnRef.current?.turnId !== followedTurn.turnId) return;
          if (!isAbortError(error) && mountedRef.current) setConnection("disconnected");
        }

        if (
          !mountedRef.current ||
          campaignIdRef.current !== campaignId ||
          followedTurnRef.current?.turnId !== followedTurn.turnId
        ) return;
        await waitForReconnect(Math.max(reconnectDelayMilliseconds, 1), controller.signal);
      }
    })();

    return () => controller.abort();
  }, [campaignId, followedTurn, reconnectDelayMilliseconds, recordSequence]);

  useEffect(() => {
    if (followedTurn === null || followedTurn.campaignId !== campaignId) return;
    const controller = new AbortController();
    const followed = followedTurn;
    authorityRecoveryControllerRef.current = controller;
    let cursor = followed.sequence;

    void (async () => {
      while (!controller.signal.aborted) {
        setConnection("connecting");
        let nextState: CampaignPlayState;
        try {
          nextState = await withAuthorityReadDeadline(
            controller.signal,
            (signal) => loadCampaignPlayState(campaignId, { signal }),
          );
        } catch (error) {
          if (controller.signal.aborted || campaignIdRef.current !== campaignId) return;
          if (!isAbortError(error) && mountedRef.current) setConnection("disconnected");
          noteAuthorityRecoveryFailure(followed);
          await waitForReconnect(reconnectDelayMilliseconds, controller.signal);
          continue;
        }

        if (controller.signal.aborted || campaignIdRef.current !== campaignId) return;
        const stateApplication = applyAuthorityState(nextState, followed.turnId);
        if (!stateApplication.applied) {
          const readyProjectionRejected = nextState.phase === "ready" &&
            nextState.activeTurn === null && isStateProjectionReady(nextState, followed.turnId);
          const readyWithoutCurrentProjection = nextState.phase === "ready" &&
            nextState.activeTurn === null && !isStateProjectionReady(nextState, followed.turnId);
          if (readyProjectionRejected || readyWithoutCurrentProjection) noteAuthorityRecoveryFailure(followed);
          else clearAuthorityRecoveryFailure(followed);
          if (mountedRef.current) setConnection("disconnected");
          await waitForReconnect(reconnectDelayMilliseconds, controller.signal);
          continue;
        }
        const stateShowsActiveWork = nextState.activeTurn?.status === "processing" ||
          (nextState.narrationOperation?.turnId === followed.turnId &&
            (nextState.narrationOperation.status === "pending" ||
              nextState.narrationOperation.status === "running"));
        if (stateShowsActiveWork || nextState.phase !== "ready" || nextState.activeTurn !== null ||
          stateApplication.projectionReady) {
          clearAuthorityRecoveryFailure(followed);
        } else {
          noteAuthorityRecoveryFailure(followed);
        }
        setRequestError((current) => (
          current?.campaignId === campaignId && current.code === "service_unavailable"
            ? null
            : current
        ));

        // CampaignPlayState owns the current scene. A ready state releases the
        // followed turn without waiting for the secondary turn-detail read.
        if (followedTurnRef.current?.turnId !== followed.turnId) {
          const terminalStatus = nextState.activeTurn?.status;
          window.setTimeout(() => {
            if (campaignIdRef.current !== campaignId) return;
            if (terminalStatus === "interrupted") {
              progressRef.current?.focus();
            } else if (terminalStatus === "failed") {
              errorActionRef.current?.focus();
            } else {
              (suggestionsHeadingRef.current ?? narrationFocusRef.current)?.focus();
            }
          }, 0);
          return;
        }

        let authorityTurn: CampaignPlayTurnReadResponse;
        try {
          authorityTurn = await withAuthorityReadDeadline(
            controller.signal,
            (signal) => loadCampaignPlayTurn(campaignId, followed.turnId, { signal }),
          );
        } catch (error) {
          if (controller.signal.aborted || campaignIdRef.current !== campaignId) return;
          if (!isAbortError(error) && mountedRef.current) setConnection("disconnected");
          if (stateShowsActiveWork) clearAuthorityRecoveryFailure(followed);
          else noteAuthorityRecoveryFailure(followed);
          await waitForReconnect(reconnectDelayMilliseconds, controller.signal);
          continue;
        }
        if (controller.signal.aborted || campaignIdRef.current !== campaignId) return;
        if (authorityTurn.runtimeRevision !== nextState.runtimeRevision) {
          clearAuthorityRecoveryFailure(followed);
          setConnection("disconnected");
          await waitForReconnect(reconnectDelayMilliseconds, controller.signal);
          continue;
        }
        if (followedTurnRef.current?.turnId !== followed.turnId) return;
        setTurnRead(authorityTurn);
        const terminalStatus = authorityTurn?.turn.status;
        // The turn-detail response is secondary metadata. CampaignPlayState
        // owns the rendered scene and control lock, so a completed result
        // there cannot release a still-processing or stale state projection.
        const projectionReady = isStateProjectionReady(nextState, followed.turnId);
        const terminalTurn = terminalStatus === "interrupted" || terminalStatus === "failed";
        if (terminalTurn || projectionReady) {
          clearAuthorityRecoveryReloadGuard(campaignId, followed.turnId);
          clearAuthorityRecoveryFailure(followed);
          if (automaticReloadRequestRef.current?.campaignId === campaignId &&
            automaticReloadRequestRef.current.turnId === followed.turnId) {
            automaticReloadRequestRef.current = null;
          }
          recordSequence(campaignId, authorityTurn.turn.lastEventSequence);
          setFollowedTurn(null);
          setConnection("idle");
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

        if (
          stateShowsActiveWork ||
          nextState.phase !== "ready" ||
          nextState.activeTurn !== null ||
          projectionReady
        ) {
          clearAuthorityRecoveryFailure(followed);
        }
        cursor = authorityTurn.turn.lastEventSequence ?? cursor;
        recordSequence(campaignId, cursor);
        setConnection("connected");
        await waitForReconnect(reconnectDelayMilliseconds, controller.signal);
      }
    })();
    return () => {
      controller.abort();
      if (authorityRecoveryControllerRef.current === controller) {
        authorityRecoveryControllerRef.current = null;
      }
      clearAuthorityRecoveryFailure(followed);
    };
  }, [
    applyAuthorityState,
    campaignId,
    clearAuthorityRecoveryFailure,
    followedTurn,
    noteAuthorityRecoveryFailure,
    reconnectDelayMilliseconds,
    recordSequence,
    setFollowedTurn,
  ]);

  const beginFollowing = useCallback((turnId: string, sequence: number) => {
    clearAuthorityRecoveryFailure();
    if (automaticReloadRequestRef.current !== null && (
      automaticReloadRequestRef.current.campaignId !== campaignId ||
      automaticReloadRequestRef.current.turnId !== turnId
    )) {
      automaticReloadRequestRef.current = null;
    }
    setTurnRead(null);
    setEventProgress(null);
    setFollowedTurn({ campaignId, turnId, sequence });
    recordSequence(campaignId, sequence);
    window.setTimeout(() => progressRef.current?.focus(), 0);
  }, [campaignId, clearAuthorityRecoveryFailure, recordSequence, setFollowedTurn]);

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
    const admissionRequest: CampaignPlayTurnAdmissionRequest = {
      ...request,
      idempotencyKey: crypto.randomUUID(),
      expectedWorldVersion: campaignState.worldVersion,
      expectedRuntimeRevision: campaignState.runtimeRevision,
    };
    try {
      const admission = await admitCampaignPlayTurn(campaignId, admissionRequest);
      if (
        !mountedRef.current || campaignIdRef.current !== campaignId ||
        operationRef.current !== operation
      ) return;
      beginFollowing(admission.turnId, admission.sequence);
      if (request.source === "freeform") setDraft("");
    } catch (error) {
      const ambiguous = !(error instanceof CampaignPlayApiError) || error.code === "service_unavailable";
      if (!ambiguous) {
        await reconcileRequestFailure(operation, error);
      } else if (
        mountedRef.current && campaignIdRef.current === campaignId &&
        operationRef.current === operation
      ) {
        try {
          await refreshAuthority(undefined, { clearRequestError: true });
        } catch {
          // The replay remains safe because it reuses the canonical idempotency key.
        }
        if (
          !mountedRef.current || campaignIdRef.current !== campaignId ||
          operationRef.current !== operation
        ) return;
        try {
          const admission = await admitCampaignPlayTurn(campaignId, admissionRequest);
          if (
            !mountedRef.current || campaignIdRef.current !== campaignId ||
            operationRef.current !== operation
          ) return;
          beginFollowing(admission.turnId, admission.sequence);
          if (request.source === "freeform") setDraft("");
        } catch (replayError) {
          await reconcileRequestFailure(operation, replayError);
        }
      }
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        if (mountedRef.current && campaignIdRef.current === campaignId) setPendingOperation(null);
      }
    }
  }, [beginFollowing, campaignId, campaignState, reconcileRequestFailure, refreshAuthority, setDraft]);

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
      await refreshAuthority(operation.turnId, { clearRequestError: true });
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

  const recoveringGuardedTurn = followedTurn?.campaignId === campaignId &&
    readAuthorityRecoveryReloadTurnId(campaignId) !== null;
  if (loading || (state !== null && campaignState === null) ||
    (campaignState === null && recoveringGuardedTurn)) {
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
