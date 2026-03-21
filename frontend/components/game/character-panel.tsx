"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

interface CharacterPanelProps {
  player: {
    id: string;
    name: string;
    race: string;
    gender: string;
    age: string;
    appearance: string;
    hp: number;
    tags: string[];
    equippedItems: string[];
    currentLocationId: string | null;
  } | null;
  items: Array<{ id: string; name: string; tags: string[] }>;
  locationName: string | null;
}

export function CharacterPanel({ player, items, locationName }: CharacterPanelProps) {
  if (!player) {
    return (
      <aside className="flex w-full flex-col border-l border-border bg-card lg:w-[280px]">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
            Character
          </h2>
        </div>
        <ScrollArea className="flex-1 p-4">
          <p className="text-sm italic text-muted-foreground">
            No character loaded
          </p>
        </ScrollArea>
      </aside>
    );
  }

  return (
    <aside className="flex w-full flex-col border-l border-border bg-card lg:w-[280px]">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
          Character
        </h2>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold">{player.name}</h3>
            {(player.race || player.gender || player.age) && (
              <p className="text-xs text-muted-foreground">
                {[player.race, player.gender, player.age].filter(Boolean).join(" · ")}
              </p>
            )}
            {player.appearance && (
              <p className="mt-1 text-sm italic text-muted-foreground/80">
                {player.appearance}
              </p>
            )}
            <div className="mt-1 flex items-center gap-1">
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className={`text-sm ${
                    i < player.hp ? "text-red-500" : "text-muted-foreground/30"
                  }`}
                >
                  &#9829;
                </span>
              ))}
              <span className="ml-1 text-xs text-muted-foreground">
                {player.hp}/5
              </span>
            </div>
          </div>

          {player.tags.length > 0 && (
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Traits
              </h4>
              <div className="mt-2 flex flex-wrap gap-1">
                {player.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {player.equippedItems.length > 0 && (
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Equipment
              </h4>
              <ul className="mt-2 space-y-1">
                {player.equippedItems.map((item) => (
                  <li key={item} className="text-sm">
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Inventory
            </h4>
            {items.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {items.map((item) => (
                  <li key={item.id} className="text-sm">
                    • {item.name}
                    {item.tags.length > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({item.tags.join(", ")})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs italic text-muted-foreground">(empty)</p>
            )}
          </div>

          {locationName && (
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Location
              </h4>
              <p className="mt-1 text-sm">{locationName}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
