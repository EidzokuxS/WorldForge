"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatMessage } from "@worldforge/shared";
import type { OracleResultData } from "@/components/game/oracle-panel";
import type {
  DisplayBeat,
  DrawerKind,
  QuickChoice,
  StageSignal,
} from "@/components/game/play-surface/types";
import {
  deriveDisplayBeats,
  type SceneProgress,
  type TurnPhase,
} from "@/lib/display-beats";
import { useCampaignDraft } from "@/lib/use-campaign-draft";

export interface UseGamePlaySurfaceStateInput {
  campaignId: string | null;
  messages: ChatMessage[];
  turnPhase: TurnPhase;
  sceneProgress: SceneProgress;
  oracleResult: OracleResultData | null;
  travelFeedback: string | null;
  quickActions: QuickChoice[];
}

export interface GamePlaySurfaceState {
  beats: DisplayBeat[];
  currentBeat: DisplayBeat | null;
  currentBeatIndex: number;
  currentStageSignals: StageSignal[];
  isAutoPlaying: boolean;
  activeDrawer: DrawerKind | null;
  selectedActorId: string | null;
  draft: string;
  setDraft: (draft: string) => void;
  clearDraft: () => void;
  handleNextBeat: () => void;
  handleToggleAuto: () => void;
  openDrawer: (drawer: DrawerKind, options?: { preserveSelectedActor?: boolean }) => void;
  closeDrawer: () => void;
  selectActor: (actorId: string | null) => void;
}

const AUTO_ADVANCE_MS = 1600;

export function useGamePlaySurfaceState({
  campaignId,
  messages,
  turnPhase,
  sceneProgress,
  oracleResult,
  travelFeedback,
  quickActions,
}: UseGamePlaySurfaceStateInput): GamePlaySurfaceState {
  const { draft, setDraft, clearDraft } = useCampaignDraft(campaignId);
  const [currentBeatIndex, setCurrentBeatIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<DrawerKind | null>(null);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);

  const beats = useMemo(
    () =>
      deriveDisplayBeats({
        messages,
        turnPhase,
        sceneProgress,
        oracleResult,
        travelFeedback,
        quickActions,
      }),
    [messages, oracleResult, quickActions, sceneProgress, travelFeedback, turnPhase],
  );
  const safeCurrentBeatIndex = beats.length === 0
    ? 0
    : Math.min(currentBeatIndex, beats.length - 1);
  const currentBeat = beats[safeCurrentBeatIndex] ?? beats[0] ?? null;
  const currentStageSignals = currentBeat?.stageSignals ?? [];

  const handleNextBeat = useCallback(() => {
    setCurrentBeatIndex((index) => {
      if (beats.length === 0) {
        return 0;
      }

      return Math.min(index + 1, beats.length - 1);
    });
  }, [beats.length]);

  const handleToggleAuto = useCallback(() => {
    setIsAutoPlaying((current) => !current);
  }, []);

  useEffect(() => {
    if (!isAutoPlaying || beats.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentBeatIndex((index) => {
        if (index >= beats.length - 1) {
          setIsAutoPlaying(false);
          return index;
        }

        return index + 1;
      });
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, [beats.length, isAutoPlaying]);

  const openDrawer = useCallback((drawer: DrawerKind, options?: { preserveSelectedActor?: boolean }) => {
    if (drawer === "character" && !options?.preserveSelectedActor) {
      setSelectedActorId(null);
    }
    setActiveDrawer(drawer);
  }, []);

  const closeDrawer = useCallback(() => {
    setActiveDrawer(null);
  }, []);

  const selectActor = useCallback((actorId: string | null) => {
    setSelectedActorId(actorId);
    if (actorId) {
      setActiveDrawer("character");
    }
  }, []);

  return {
    beats,
    currentBeat,
    currentBeatIndex: safeCurrentBeatIndex,
    currentStageSignals,
    isAutoPlaying,
    activeDrawer,
    selectedActorId,
    draft,
    setDraft,
    clearDraft,
    handleNextBeat,
    handleToggleAuto,
    openDrawer,
    closeDrawer,
    selectActor,
  };
}
