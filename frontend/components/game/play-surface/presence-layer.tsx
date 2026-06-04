import { Eye, Radio, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PresenceActor {
  id: string;
  name: string;
  tier?: string | null;
}

export interface PresenceLayerProps {
  visibleActors: PresenceActor[];
  hintSignals: string[];
  offscreenAnchorCount?: number;
  selectedActorId: string | null;
  onSelectActor: (actorId: string) => void;
  className?: string;
}

export function PresenceLayer({
  visibleActors,
  hintSignals,
  offscreenAnchorCount = 0,
  selectedActorId,
  onSelectActor,
  className,
}: PresenceLayerProps) {
  if (visibleActors.length === 0 && hintSignals.length === 0 && offscreenAnchorCount === 0) {
    return null;
  }

  return (
    <section
      data-testid="presence-layer"
      aria-label="Scene presence"
      className={cn("flex flex-col items-center gap-3", className)}
    >
      {visibleActors.length > 0 ? (
        <div className="flex max-w-full flex-wrap justify-center gap-2">
          {visibleActors.map((actor) => {
            const isSelected = selectedActorId === actor.id;

            return (
              <button
                key={actor.id}
                type="button"
                aria-label={`Open ${actor.name} character details`}
                aria-pressed={isSelected}
                onClick={() => onSelectActor(actor.id)}
                className={cn(
                  "inline-flex min-h-11 max-w-[min(18rem,calc(100vw-2rem))] items-center gap-2 rounded-full border border-white/15 bg-zinc-950/78 px-3 py-2 text-[12px] font-semibold leading-tight text-zinc-100 shadow-[0_10px_26px_rgba(0,0,0,0.32)] transition-colors hover:border-[#E63E00]/50 hover:text-[#E63E00]",
                  isSelected && "border-[#E63E00]/70 bg-[#E63E00]/14 text-orange-100",
                )}
              >
                <Eye aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 break-words">{actor.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {hintSignals.length > 0 ? (
        <div className="flex max-w-3xl flex-wrap justify-center gap-2">
          {hintSignals.map((signal, index) => (
            <p
              key={`${signal}-${index}`}
              data-testid={`presence-hint-${index}`}
              aria-disabled="true"
              className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-white/10 bg-zinc-950/56 px-3 py-1.5 text-[12px] font-semibold leading-tight text-zinc-400 shadow-[0_8px_22px_rgba(0,0,0,0.24)]"
            >
              <Radio aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span className="min-w-0 break-words">{signal}</span>
            </p>
          ))}
        </div>
      ) : null}

      {offscreenAnchorCount > 0 ? (
        <p
          data-testid="presence-offscreen-anchor-count"
          className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/8 bg-black/30 px-3 py-1 text-[12px] font-semibold leading-tight text-zinc-500"
        >
          <UsersRound aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span>
            {offscreenAnchorCount} nearby, not visible
          </span>
        </p>
      ) : null}
    </section>
  );
}
