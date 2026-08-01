"use client";

import { useCallback, useState, type ReactNode, type RefObject } from "react";
import type { CampaignPlayStageEffect, CampaignPlayState } from "@worldforge/shared";

import { NarrationDock } from "./NarrationDock";
import { ConciseResultDock } from "./ConciseResultDock";
import { SceneCard } from "./SceneCard";

export interface CampaignPlayStageProps {
  state: CampaignPlayState;
  connectionMessage?: string;
  children?: ReactNode;
  narrationFocusRef?: RefObject<HTMLElement | null>;
  onRecoverNarration?: () => void;
  narrationRecoveryPending?: boolean;
}

interface StageEffectState {
  narrationId: string | null;
  effectArtifactId: string | null;
  effects: CampaignPlayStageEffect[];
  cycle: 0 | 1;
}

function sameEffects(left: CampaignPlayStageEffect[], right: CampaignPlayStageEffect[]): boolean {
  return left.length === right.length && left.every((effect, index) =>
    effect.kind === right[index]?.kind && effect.beatId === right[index]?.beatId,
  );
}

export function CampaignPlayStage({
  state,
  connectionMessage = "",
  children,
  narrationFocusRef,
  onRecoverNarration = () => {},
  narrationRecoveryPending = false,
}: CampaignPlayStageProps) {
  const narrationId = state.narration?.narrationId ?? null;
  const [effectState, setEffectState] = useState<StageEffectState>(() => ({
    narrationId,
    effectArtifactId: null,
    effects: [],
    cycle: 0,
  }));
  if (effectState.narrationId !== narrationId) {
    setEffectState({
      narrationId,
      effectArtifactId: narrationId,
      effects: [],
      cycle: effectState.cycle,
    });
  }

  const presentBeatEffects = useCallback((beatIds: string[]) => {
    const narration = state.narration;
    if (narration === null) return;
    const presented = new Set(beatIds);
    const firstBeatId = narration.beats[0].beatId;
    const effects = narration.effects.filter((effect) =>
      effect.beatId === null ? presented.has(firstBeatId) : presented.has(effect.beatId),
    );
    setEffectState((current) => {
      if (current.effectArtifactId !== narration.narrationId) return current;
      if (sameEffects(effects, current.effects)) return current;
      return {
        ...current,
        effects,
        cycle: current.cycle === 0 ? 1 : 0,
      };
    });
  }, [state.narration]);

  const effectKinds = effectState.effects.map((effect) => effect.kind).join(" ") || undefined;

  return (
    <section
      className="campaign-play-stage"
      data-effect-cycle={effectState.cycle}
      data-effects={effectKinds}
      data-has-scene={state.currentLocation !== null}
    >
      {effectState.effects.map((effect, index) => (
        <span
          aria-hidden="true"
          className="campaign-play-effect-layer"
          data-effect={effect.kind}
          key={JSON.stringify([
            effectState.effectArtifactId,
            effect.beatId,
            effect.kind,
            index,
          ])}
        />
      ))}
      <div className="campaign-play-atmosphere" aria-hidden="true">
        <span /><span /><span />
      </div>
      <header className="campaign-play-context">
        <span className="campaign-play-brand">World<em>Forge</em></span>
        <span className="campaign-play-location-context">
          {state.currentLocation?.name ?? "Before arrival"}
        </span>
        <div className="campaign-play-player-context">
          <span className="campaign-play-player-copy">
            <strong>{state.character?.name}</strong>
            <small>{state.character?.descriptor}</small>
          </span>
          <span className="campaign-play-connection" aria-live="polite">{connectionMessage}</span>
        </div>
      </header>
      <div className="campaign-play-stage-body">
        {state.currentLocation ? (
          <>
            <SceneCard
              actors={state.visibleActors}
              consequences={state.consequences}
              location={state.currentLocation}
              obligations={state.obligations}
              possessions={state.possessions}
              pressures={state.visiblePressures}
              routes={state.visibleRoutes}
            />
            {state.narration ? (
              <NarrationDock
                key={state.narration.narrationId}
                narration={state.narration}
                onBeatPresented={presentBeatEffects}
                ref={narrationFocusRef}
              />
            ) : state.narrationOperation ? (
              <ConciseResultDock
                onRecover={onRecoverNarration}
                operation={state.narrationOperation}
                recoveryPending={narrationRecoveryPending}
              />
            ) : null}
          </>
        ) : null}
        {children}
      </div>
    </section>
  );
}

export default CampaignPlayStage;
