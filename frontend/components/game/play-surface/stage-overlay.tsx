import { cn } from "@/lib/utils";
import type { StageSignal } from "./types";

export interface StageOverlayProps {
  currentBeatId: string | null;
  signals: StageSignal[];
  onSignalInspect?: (signal: StageSignal) => void;
}

const EFFECT_BY_KIND: Record<StageSignal["kind"], string> = {
  ambient: "side_remark",
  danger: "side_remark",
  fade: "fade",
  flash: "flash",
  glitch: "glitch",
  shake: "screen_shake",
  whisper: "whisper",
};

export function StageOverlay({
  currentBeatId,
  signals,
  onSignalInspect,
}: StageOverlayProps) {
  if (signals.length === 0) {
    return (
      <div
        data-testid="stage-overlay"
        data-current-beat-id={currentBeatId ?? ""}
        className="pointer-events-none absolute inset-0 z-20"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      data-testid="stage-overlay"
      data-current-beat-id={currentBeatId ?? ""}
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      aria-label="Scene signals"
    >
      <div className="absolute inset-x-0 top-[5.75rem] bottom-[15.25rem] mx-auto w-full max-w-[1880px] px-5 2xl:px-8">
        {signals.map((signal, index) => {
          const effect = EFFECT_BY_KIND[signal.kind];
          const canInspect = Boolean(onSignalInspect);
          const positionClass = index % 2 === 0 ? "left-5 2xl:left-8" : "right-5 2xl:right-8";
          const topClass = index < 2 ? "top-[24%]" : index < 4 ? "top-[43%]" : "top-[58%]";

          return (
            <button
              key={signal.id}
              type="button"
              data-testid={`stage-signal-${signal.id}`}
              data-effect={effect}
              data-clear-on={signal.clearOn}
              className={cn(
                "pointer-events-auto absolute max-w-[min(17rem,calc(100vw-2.5rem))] rounded-md border px-3 py-2 text-left text-sm leading-5 shadow-2xl transition",
                positionClass,
                topClass,
                signal.clearOn === "turn_boundary" && "ring-1 ring-white/10",
                signal.kind === "whisper" && "border-white/12 bg-zinc-950/72 text-zinc-200",
                signal.kind === "glitch" && "border-blue-400/30 bg-blue-950/28 text-blue-100",
                signal.kind === "flash" && "border-white/40 bg-white/16 text-white",
                signal.kind === "fade" && "border-zinc-500/30 bg-black/58 text-zinc-300",
                signal.kind === "shake" && "border-[#E63E00]/40 bg-[#E63E00]/14 text-orange-100",
                (signal.kind === "ambient" || signal.kind === "danger") &&
                  "border-white/10 bg-zinc-950/64 text-zinc-300",
              )}
              onClick={() => onSignalInspect?.(signal)}
              disabled={!canInspect}
            >
              {signal.actorName ? (
                <span className="mb-1 block break-words text-xs font-semibold text-white">
                  {signal.actorName}
                </span>
              ) : null}
              <span className="break-words">{signal.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
