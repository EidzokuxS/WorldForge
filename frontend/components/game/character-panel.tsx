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
      <aside className="flex w-full flex-col overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl xl:h-full">
        <div className="border-b border-white/8 bg-white/[0.03] px-5 py-4">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
            Character
          </h2>
        </div>
        <ScrollArea className="flex-1 px-5 py-5">
          <p className="text-sm italic text-zinc-500">
            No character loaded
          </p>
        </ScrollArea>
      </aside>
    );
  }

  const sectionLabelClass = "text-[10px] font-medium uppercase tracking-[0.24em] text-zinc-500";
  const itemCardClass = "rounded-2xl border border-white/8 bg-black/20 px-4 py-3";

  return (
    <aside className="flex w-full flex-col overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl xl:h-full">
      <div className="border-b border-white/8 bg-white/[0.03] px-5 py-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
          Character
        </h2>
      </div>
      <ScrollArea className="flex-1 px-5 py-5">
        <div className="space-y-5">
          {portraitUrl && (
            <div className="overflow-hidden rounded-[20px] border border-white/10 bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={portraitUrl}
                alt={`Portrait of ${player.name}`}
                className="h-48 w-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
          <div className="space-y-3">
            <div className="space-y-1">
              <p className={sectionLabelClass}>Profile</p>
              <h3 className="text-xl font-semibold tracking-[0.01em] text-zinc-100">{player.name}</h3>
            </div>
            {(player.race || player.gender || player.age) && (
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                {[player.race, player.gender, player.age].filter(Boolean).join(" · ")}
              </p>
            )}
            {player.appearance && (
              <p className="text-sm leading-6 text-zinc-300">
                {player.appearance}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <p className={sectionLabelClass}>Vitality</p>
                <div className="mt-2 flex items-center gap-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className={`text-base ${
                        i < player.hp
                          ? "text-red-400 drop-shadow-[0_0_4px_rgba(248,113,113,0.45)]"
                          : "text-zinc-700"
                      }`}
                    >
                      &#9829;
                    </span>
                  ))}
                  <span className="ml-1 text-xs text-zinc-500">
                    {player.hp}/5
                  </span>
                </div>
              </div>
              {locationName ? (
                <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <p className={sectionLabelClass}>Location</p>
                  <p className="mt-2 text-sm text-zinc-200">{locationName}</p>
                </div>
              ) : null}
            </div>
          </div>

          {player.tags.length > 0 && (
            <div className="space-y-3">
              <h4 className={sectionLabelClass}>
                Traits
              </h4>
              <div className="flex flex-wrap gap-2">
                {player.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/8 bg-black/25 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h4 className={sectionLabelClass}>
              Equipment
            </h4>
            {equippedItems.length > 0 ? (
              <ul className="space-y-2">
                {equippedItems.map((item) => (
                  <li key={item.id} className={`${itemCardClass} space-y-1`}>
                    <p className="text-sm font-medium text-zinc-100">{item.name}</p>
                    {renderItemMeta(item) ? (
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                        {renderItemMeta(item)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${itemCardClass} text-sm text-zinc-500`}>(none equipped)</p>
            )}
          </div>

          <div className="space-y-3">
            <h4 className={sectionLabelClass}>
              Inventory
            </h4>
            {carriedItems.length > 0 ? (
              <ul className="space-y-2">
                {carriedItems.map((item) => (
                  <li key={item.id} className={`${itemCardClass} space-y-1`}>
                    <p className="text-sm font-medium text-zinc-100">{item.name}</p>
                    {renderItemMeta(item) ? (
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                        {renderItemMeta(item)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${itemCardClass} text-sm text-zinc-500`}>(empty)</p>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
