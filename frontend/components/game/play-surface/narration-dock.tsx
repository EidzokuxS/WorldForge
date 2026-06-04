import { BookOpen, Pause, Play, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichTextMessage } from "@/components/game/rich-text-message";
import { cn } from "@/lib/utils";
import type { DisplayBeat } from "./types";

export interface NarrationDockProps {
  beats: DisplayBeat[];
  currentBeatIndex: number;
  isAutoPlaying: boolean;
  onNextBeat: () => void;
  onToggleAuto: () => void;
  onOpenLog: () => void;
  isBusy?: boolean;
  statusCopy?: string;
  className?: string;
}

export function NarrationDock({
  beats,
  currentBeatIndex,
  isAutoPlaying,
  onNextBeat,
  onToggleAuto,
  onOpenLog,
  isBusy = false,
  statusCopy,
  className,
}: NarrationDockProps) {
  const currentBeat = getCurrentBeat(beats, currentBeatIndex);
  const label = getBeatLabel(currentBeat);
  const canAdvance = beats.length > 0 && !isBusy;

  return (
    <section
      data-testid="narration-dock"
      className={cn(
        "rounded-[var(--r-l)] border border-white/10 bg-black/78 p-4 text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-md sm:p-5",
        className,
      )}
      aria-label="Current scene beat"
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          {label ? (
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ember)]">
              {label}
            </p>
          ) : null}
          {currentBeat?.speaker ? (
            <h3 className="mt-1 text-xl font-semibold leading-tight text-white">
              {currentBeat.speaker}
            </h3>
          ) : null}
        </div>
        {statusCopy ? (
          <span
            className="shrink-0 rounded-[var(--r-s)] border border-white/10 bg-zinc-900/80 px-2 py-1 font-mono text-xs font-semibold text-zinc-300"
            aria-live="polite"
          >
            {statusCopy}
          </span>
        ) : null}
      </div>

      <div
        data-overflow-owner="narration-scroll"
        className="mt-3 max-h-[20vh] min-h-[72px] min-w-0 overflow-y-auto pr-1"
      >
        {currentBeat ? (
          <BeatContent beat={currentBeat} />
        ) : (
          <div>
            <h3 className="text-xl font-semibold text-white">Scene loading</h3>
            <p className="mt-2 text-base leading-6 text-zinc-300">
              WorldForge is grounding the opening scene. You can act once the first beat appears.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-start gap-2 border-t border-white/8 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-10 border border-white/10 bg-zinc-900/70 text-zinc-100 hover:bg-zinc-800"
          aria-label="Next"
          title="Show next beat"
          onClick={onNextBeat}
          disabled={!canAdvance}
        >
          <SkipForward aria-hidden="true" />
          <span>Next</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "min-h-10 border border-white/10 bg-zinc-900/70 text-zinc-100 hover:bg-zinc-800",
            isAutoPlaying && "border-[rgba(224,72,28,0.45)] bg-[var(--ember-paper)] text-orange-100",
          )}
          aria-label="Auto"
          aria-pressed={isAutoPlaying}
          title="Auto"
          onClick={onToggleAuto}
        >
          {isAutoPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          <span>Auto</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-10 border border-white/10 bg-zinc-900/70 text-zinc-100 hover:bg-zinc-800"
          aria-label="Log"
          title="Log"
          onClick={onOpenLog}
        >
          <BookOpen aria-hidden="true" />
          <span>Log</span>
        </Button>
      </div>
    </section>
  );
}

function BeatContent({ beat }: { beat: DisplayBeat }) {
  if (beat.kind === "mechanical_result") {
    return (
      <div className="rounded-[var(--r-m)] border border-[rgba(224,72,28,0.3)] bg-[var(--ember-paper)] px-3 py-3">
        <p className="text-xl font-semibold leading-tight text-orange-100">
          {beat.mechanic?.label ?? beat.text}
        </p>
        {beat.text && beat.text !== beat.mechanic?.label ? (
          <p className="mt-2 text-base leading-6 text-zinc-300">{beat.text}</p>
        ) : null}
      </div>
    );
  }

  if (beat.kind === "choice" && beat.choices && beat.choices.length > 0) {
    return (
      <div className="space-y-2">
        <p className="text-base leading-6 text-zinc-300">{beat.text}</p>
        <div className="flex flex-wrap gap-2">
          {beat.choices.map((choice) => (
            <span
              key={`${choice.label}-${choice.action}`}
              className="max-w-full break-words rounded-md border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm font-semibold text-zinc-100"
            >
              {choice.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (beat.kind === "progress" || beat.kind === "input_handoff") {
    return (
      <p className="mx-auto max-w-[78ch] break-words text-base font-semibold leading-6 text-zinc-300">
        {beat.text}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-[78ch] break-words text-[17px] leading-7 text-zinc-100">
      <RichTextMessage content={beat.text} />
    </div>
  );
}

function getCurrentBeat(beats: DisplayBeat[], currentBeatIndex: number): DisplayBeat | null {
  if (beats.length === 0) return null;
  const safeIndex = Math.min(Math.max(currentBeatIndex, 0), beats.length - 1);
  return beats[safeIndex] ?? null;
}

function getBeatLabel(beat: DisplayBeat | null): string | null {
  if (!beat) return null;
  if (beat.kind === "dialogue") return "Dialogue";
  if (beat.kind === "side_remark") return "Aside";
  if (beat.kind === "mechanical_result") return "Outcome";
  if (beat.kind === "state_change") return "Changed";
  if (beat.kind === "choice") return "Choice";
  if (beat.kind === "progress") return "Reading";
  if (beat.kind === "input_handoff") return "Ready";
  return null;
}
