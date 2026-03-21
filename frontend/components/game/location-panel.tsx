"use client";

import { useEffect, useMemo, useState } from "react";
import { getWorldData, type WorldData } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LocationPanelProps {
  campaignId: string | null;
}

export function LocationPanel({ campaignId }: LocationPanelProps) {
  const [worldData, setWorldData] = useState<WorldData | null>(null);
  const [currentLocationId, setCurrentLocationId] = useState<string | null>(null);
  const [loadedCampaignId, setLoadedCampaignId] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) {
      return;
    }

    let cancelled = false;
    void getWorldData(campaignId)
      .then((data) => {
        if (cancelled) {
          return;
        }
        const startingId =
          data.locations.find((location) => location.isStarting)?.id ??
          data.locations[0]?.id ??
          null;
        setLoadedCampaignId(campaignId);
        setWorldData(data);
        setCurrentLocationId(startingId);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLoadedCampaignId(campaignId);
        setWorldData(null);
        setCurrentLocationId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const location = useMemo(() => {
    if (!worldData || !currentLocationId) {
      return null;
    }
    return worldData.locations.find((item) => item.id === currentLocationId) ?? null;
  }, [currentLocationId, worldData]);

  if (!campaignId || loadedCampaignId !== campaignId || !location || !worldData) {
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

  const tags = location.tags;
  const connectedIds = location.connectedTo;
  const connectedLocations = connectedIds
    .map((id) => worldData.locations.find((item) => item.id === id))
    .filter((item): item is WorldData["locations"][number] => Boolean(item));
  const npcsHere = worldData.npcs.filter(
    (npc) => npc.currentLocationId === currentLocationId
  );

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
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {tags.map((tag) => (
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
                {connectedLocations.map((item) => (
                  <li key={item.id} className="text-sm">
                    • {item.name}
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
