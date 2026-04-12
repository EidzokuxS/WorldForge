"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { WorldPlayerInventoryItem } from "@/lib/api-types";

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
    currentLocationId: string | null;
  } | null;
  carriedItems: WorldPlayerInventoryItem[];
  equippedItems: WorldPlayerInventoryItem[];
  locationName: string | null;
  portraitUrl?: string;
}

function renderItemMeta(item: WorldPlayerInventoryItem): string | null {
  const meta = [...item.tags];
  if (item.isSignature && !meta.includes("signature")) {
    meta.push("signature");
  }
  if (item.equippedSlot && !meta.includes(item.equippedSlot)) {
    meta.push(item.equippedSlot);
  }
  return meta.length > 0 ? meta.join(", ") : null;
}

export function CharacterPanel({
  player,
  carriedItems,
  equippedItems,
  locationName,
  portraitUrl,
}: CharacterPanelProps) {
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
          {portraitUrl && (
            <div className="overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={portraitUrl}
                alt={`Portrait of ${player.name}`}
                className="h-48 w-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
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
                  className={`text-base ${
                    i < player.hp
                      ? "text-red-500 drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]"
                      : "text-muted-foreground/15"
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

          <div>
            <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Equipment
            </h4>
            {equippedItems.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {equippedItems.map((item) => (
                  <li key={item.id} className="text-sm">
                    • {item.name}
                    {renderItemMeta(item) ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({renderItemMeta(item)})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs italic text-muted-foreground">(none equipped)</p>
            )}
          </div>

          <div>
            <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Inventory
            </h4>
            {carriedItems.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {carriedItems.map((item) => (
                  <li key={item.id} className="text-sm">
                    • {item.name}
                    {renderItemMeta(item) ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({renderItemMeta(item)})
                      </span>
                    ) : null}
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
