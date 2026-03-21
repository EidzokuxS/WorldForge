"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

interface LocationPanelProps {
  location: {
    id: string;
    name: string;
    description: string;
    tags: string[];
  } | null;
  connectedLocations: Array<{ id: string; name: string }>;
  npcsHere: Array<{ id: string; name: string; tier: string }>;
  itemsHere: Array<{ id: string; name: string }>;
  onMove: (locationName: string) => void;
  disabled: boolean;
}

export function LocationPanel({
  location,
  connectedLocations,
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

          {connectedLocations.length > 0 && (
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Paths
              </h4>
              <ul className="mt-2 space-y-1">
                {connectedLocations.map((loc) => (
                  <li key={loc.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onMove(loc.name)}
                      className="text-sm text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                    >
                      {loc.name}
                    </button>
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
