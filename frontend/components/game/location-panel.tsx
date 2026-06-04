"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

type ConnectedPathView = {
  id: string;
  name: string;
  pathSummary?: string | null;
  travelCost?: number | null;
};

interface LocationPanelProps {
  location: {
    id: string;
    name: string;
    description: string;
    tags: string[];
    recentHappenings?: Array<{
      id: string;
      summary: string;
      tick: number;
      eventType: string;
    }>;
  } | null;
  scene?: {
    id: string | null;
    name: string | null;
    broadLocationName: string | null;
    hintSignals?: string[];
  } | null;
  connectedPaths: ConnectedPathView[];
  npcsHere: Array<{ id: string; name: string; tier: string }>;
  itemsHere: Array<{ id: string; name: string }>;
  onMove: (locationName: string) => void;
  disabled: boolean;
}

export function LocationPanel({
  location,
  scene,
  connectedPaths,
  npcsHere,
  itemsHere,
  onMove,
  disabled,
}: LocationPanelProps) {
  if (!location) {
    return (
      <aside className="flex w-full flex-col overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl xl:h-full">
        <div className="border-b border-white/8 bg-white/[0.03] px-5 py-4">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
            Location
          </h2>
        </div>
        <ScrollArea className="flex-1 px-5 py-5">
          <p className="text-sm italic text-zinc-500">No location loaded</p>
        </ScrollArea>
      </aside>
    );
  }

  const recentHappenings = location.recentHappenings ?? [];
  const hintSignals = scene?.hintSignals ?? [];

  const formatTravelCost = (travelCost?: number | null) => {
    if (travelCost == null) {
      return null;
    }

    return travelCost === 1 ? "1 tick" : `${travelCost} ticks`;
  };

  const sectionLabelClass = "text-[10px] font-medium uppercase tracking-[0.24em] text-zinc-500";
  const cardClass = "rounded-2xl border border-white/8 bg-black/20 px-4 py-3";

  return (
    <aside className="flex w-full flex-col overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl xl:h-full">
      <div className="border-b border-white/8 bg-white/[0.03] px-5 py-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
          Location
        </h2>
      </div>
      <ScrollArea className="flex-1 px-5 py-5">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className={sectionLabelClass}>Broad Location</p>
              <h3 className="text-xl font-semibold tracking-[0.01em] text-zinc-100">{location.name}</h3>
            </div>
            {scene?.name ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <p className={sectionLabelClass}>Immediate Scene</p>
                <p className="mt-1 text-sm font-medium text-zinc-100">Immediate Scene: {scene.name}</p>
                {scene.broadLocationName && scene.broadLocationName !== scene.name ? (
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">
                    within {scene.broadLocationName}
                  </p>
                ) : null}
              </div>
            ) : null}
            {location.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {location.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/8 bg-black/25 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <p className="text-sm leading-6 text-zinc-300">{location.description}</p>
          </div>

          <div className="space-y-3">
            <h4 className={sectionLabelClass}>
              Recent Happenings
            </h4>
            {recentHappenings.length > 0 ? (
              <ul className="space-y-2">
                {recentHappenings.map((event) => (
                  <li key={event.id} className={`${cardClass} space-y-2`}>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      Tick {event.tick}
                    </p>
                    <p className="text-sm leading-6 text-zinc-200">{event.summary}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${cardClass} text-sm text-zinc-500`}>
                No recent happenings recorded here yet.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <h4 className={sectionLabelClass}>Nearby Signs</h4>
            {hintSignals.length > 0 ? (
              <ul className="space-y-2">
                {hintSignals.map((signal, index) => (
                  <li key={`${signal}-${index}`} className={`${cardClass} text-sm leading-6 text-zinc-300`}>
                    {signal}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${cardClass} text-sm text-zinc-500`}>
                No immediate signals stand out beyond the current scene.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <h4 className={sectionLabelClass}>People Here</h4>
            {npcsHere.length > 0 ? (
              <ul className="space-y-2">
                {npcsHere.map((npc) => (
                  <li key={npc.id} className={`${cardClass} flex items-center justify-between gap-3`}>
                    <span className="text-sm font-medium text-zinc-100">{npc.name}</span>
                    <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                      {npc.tier === "temporary" ? "(passing)" : npc.tier}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${cardClass} text-sm text-zinc-500`}>
                No one is immediately in focus here.
              </p>
            )}
          </div>

          {itemsHere.length > 0 && (
            <div className="space-y-3">
              <h4 className={sectionLabelClass}>
                Items Here
              </h4>
              <ul className="space-y-2">
                {itemsHere.map((item) => (
                  <li key={item.id} className={`${cardClass} text-sm text-zinc-200`}>
                    {item.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            <h4 className={sectionLabelClass}>Paths</h4>
            {connectedPaths.length > 0 ? (
              <ul className="space-y-2">
                {connectedPaths.map((path) => (
                  <li key={path.id}>
                    <button
                      type="button"
                      aria-label={path.name}
                      disabled={disabled}
                      onClick={() => onMove(path.name)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-left transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-zinc-500 disabled:hover:bg-black/20"
                    >
                      <span>
                        <span className="block text-sm font-medium text-zinc-100">{path.name}</span>
                        {(formatTravelCost(path.travelCost) || path.pathSummary) ? (
                          <span className="mt-1 block text-xs text-zinc-500">
                            {formatTravelCost(path.travelCost) ? (
                              <span>{formatTravelCost(path.travelCost)}</span>
                            ) : null}
                            {formatTravelCost(path.travelCost) && path.pathSummary ? (
                              <span> • </span>
                            ) : null}
                            {path.pathSummary ? <span>{path.pathSummary}</span> : null}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                        Travel
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${cardClass} text-sm text-zinc-500`}>
                No obvious paths branch from this immediate scene.
              </p>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
