"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import type { CampaignPlayNarration } from "@worldforge/shared";

export interface NarrationDockProps {
  narration: CampaignPlayNarration;
  onBeatPresented?: (beatIds: string[]) => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const NarrationDock = forwardRef<HTMLElement, NarrationDockProps>(function NarrationDock({
  narration,
  onBeatPresented,
}, ref) {
  const [visibleBeatIndex, setVisibleBeatIndex] = useState(0);
  const [auto, setAuto] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const beatIds = prefersReducedMotion()
      ? narration.beats.map((beat) => beat.beatId)
      : [narration.beats[visibleBeatIndex].beatId];
    onBeatPresented?.(beatIds);
  }, [narration.beats, onBeatPresented, visibleBeatIndex]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(query.matches);
      if (query.matches) {
        setAuto(false);
        setVisibleBeatIndex(narration.beats.length - 1);
        onBeatPresented?.(narration.beats.map((beat) => beat.beatId));
      }
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [narration.beats, onBeatPresented]);

  useEffect(() => {
    if (!auto || reducedMotion || visibleBeatIndex >= narration.beats.length - 1) return;
    const timer = window.setTimeout(() => {
      setVisibleBeatIndex((current) => Math.min(current + 1, narration.beats.length - 1));
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [auto, narration.beats.length, reducedMotion, visibleBeatIndex]);

  const visibleBeats = useMemo(
    () => narration.beats.slice(0, visibleBeatIndex + 1),
    [narration.beats, visibleBeatIndex],
  );
  const atEnd = visibleBeatIndex >= narration.beats.length - 1;

  return (
    <section
      aria-labelledby="campaign-play-narration-heading"
      className="campaign-play-narration"
      ref={ref}
      tabIndex={-1}
    >
      <header>
        <p className="campaign-play-kicker" id="campaign-play-narration-heading">The moment</p>
        <span>{visibleBeatIndex + 1} of {narration.beats.length}</span>
      </header>
      <div
        aria-atomic="false"
        aria-live="polite"
        aria-relevant="additions"
        className="campaign-play-narration-beats"
      >
        {visibleBeats.map((beat) => <p key={beat.beatId}>{beat.text}</p>)}
      </div>
      {narration.beats.length > 1 ? (
        <div className="campaign-play-narration-controls">
          <button
            disabled={atEnd}
            onClick={() => setVisibleBeatIndex((current) => Math.min(current + 1, narration.beats.length - 1))}
            type="button"
          >
            Next
          </button>
          <button
            aria-pressed={auto}
            disabled={reducedMotion || atEnd}
            onClick={() => setAuto((current) => !current)}
            type="button"
          >
            Auto {auto ? "on" : "off"}
          </button>
        </div>
      ) : null}
    </section>
  );
});

export default NarrationDock;
