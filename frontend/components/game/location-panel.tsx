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
      <aside className="flex w-full flex-col border-r border-border bg-card lg:w-[250px]">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
            Location
          </h2>
        </div>
        <ScrollArea className="flex-1 p-4">
          <p className="text-sm italic text-muted-foreground">No location loaded</p>
        </ScrollArea>
      </aside>
    );
  }

  const recentHappenings = location.recentHappenings ?? [];

  const formatTravelCost = (travelCost?: number | null) => {
    if (travelCost == null) {
      return null;
    }

    return travelCost === 1 ? "1 tick" : `${travelCost} ticks`;
  };

  return (
    <aside className="flex w-full flex-col border-r border-border bg-card lg:w-[250px]">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
          Location
        </h2>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold">{location.name}</h3>
            {scene?.name ? (
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Immediate Scene: {scene.name}
                {scene.broadLocationName && scene.broadLocationName !== scene.name ? (
                  <span> · within {scene.broadLocationName}</span>
                ) : null}
              </p>
            ) : null}
            {location.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {location.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-sm text-foreground/90">{location.description}</p>
          </div>

          <div>
            <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Recent Happenings
            </h4>
            {recentHappenings.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {recentHappenings.map((event) => (
                  <li key={event.id} className="space-y-1 text-sm">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Tick {event.tick}
                    </p>
                    <p>{event.summary}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No recent happenings recorded here yet.
              </p>
            )}
          </div>

          {scene?.hintSignals && scene.hintSignals.length > 0 ? (
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Nearby Signs
              </h4>
              <ul className="mt-2 space-y-1">
                {scene.hintSignals.map((signal, index) => (
                  <li key={`${signal}-${index}`} className="text-sm text-muted-foreground">
                    • {signal}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {npcsHere.length > 0 && (
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                People Here
              </h4>
              <ul className="mt-2 space-y-1">
                {npcsHere.map((npc) => (
                  <li key={npc.id} className="text-sm">
                    • {npc.name}
                    {npc.tier === "temporary" && (
                      <span className="ml-1 text-xs text-muted-foreground">(passing)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {itemsHere.length > 0 && (
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Items Here
              </h4>
              <ul className="mt-2 space-y-1">
                {itemsHere.map((item) => (
                  <li key={item.id} className="text-sm">
                    • {item.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {connectedPaths.length > 0 && (
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Paths
              </h4>
              <ul className="mt-2 space-y-1">
                {connectedPaths.map((path) => (
                  <li key={path.id} className="space-y-1">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onMove(path.name)}
                      className="text-sm text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                    >
                      {path.name}
                    </button>
                    {(formatTravelCost(path.travelCost) || path.pathSummary) ? (
                      <p className="text-xs text-muted-foreground">
                        {formatTravelCost(path.travelCost) ? (
                          <span>{formatTravelCost(path.travelCost)}</span>
                        ) : null}
                        {formatTravelCost(path.travelCost) && path.pathSummary ? (
                          <span> • </span>
                        ) : null}
                        {path.pathSummary ? <span>{path.pathSummary}</span> : null}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
