"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getLoreCards, searchLore, type LoreCardItem } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

interface LorePanelProps {
    campaignId: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
    location: "Locations",
    npc: "Characters",
    faction: "Factions",
    ability: "Abilities",
    rule: "World Rules",
    concept: "Concepts",
    item: "Items",
    event: "Events",
};

const CATEGORY_ORDER = [
    "concept",
    "rule",
    "location",
    "faction",
    "npc",
    "ability",
    "item",
    "event",
];

export function LorePanel({ campaignId }: LorePanelProps) {
    const [cards, setCards] = useState<LoreCardItem[]>([]);
    const [query, setQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (!campaignId) return;
        let cancelled = false;
        void getLoreCards(campaignId)
            .then((data) => {
                if (!cancelled) setCards(data);
            })
            .catch(() => {
                if (!cancelled) setCards([]);
            });
        return () => {
            cancelled = true;
        };
    }, [campaignId]);

    const handleSearch = useCallback(async () => {
        if (!campaignId || !query.trim()) return;
        setIsSearching(true);
        try {
            const results = await searchLore(campaignId, query.trim(), 10);
            setCards(results);
        } catch {
            // Keep existing cards on error
        } finally {
            setIsSearching(false);
        }
    }, [campaignId, query]);

    const handleClear = useCallback(() => {
        setQuery("");
        if (!campaignId) return;
        void getLoreCards(campaignId).then(setCards).catch(() => setCards([]));
    }, [campaignId]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                void handleSearch();
            } else if (e.key === "Escape") {
                handleClear();
            }
        },
        [handleSearch, handleClear]
    );

    const grouped = useMemo(() => {
        const groups: Record<string, LoreCardItem[]> = {};
        for (const card of cards) {
            const cat = card.category || "concept";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(card);
        }
        return CATEGORY_ORDER
            .filter((cat) => groups[cat]?.length)
            .map((cat) => ({
                category: cat,
                label: CATEGORY_LABELS[cat] ?? cat,
                items: groups[cat],
            }));
    }, [cards]);

    if (!campaignId) {
        return (
            <aside className="flex w-full flex-col border-l border-border bg-card lg:w-[250px]">
                <div className="border-b border-border px-4 py-3">
                    <h2 className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                        World Lore
                    </h2>
                </div>
                <ScrollArea className="flex-1 p-4">
                    <p className="text-sm italic text-muted-foreground">No campaign loaded</p>
                </ScrollArea>
            </aside>
        );
    }

    return (
        <aside className="flex w-full flex-col border-l border-border bg-card lg:w-[250px]">
            <div className="border-b border-border px-4 py-3">
                <h2 className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                    World Lore
                </h2>
            </div>

            <div className="border-b border-border px-3 py-2">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search lore..."
                        className="h-8 pl-8 text-xs"
                        disabled={isSearching}
                    />
                </div>
            </div>

            <ScrollArea className="flex-1 p-4">
                {cards.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">
                        No lore cards available
                    </p>
                ) : (
                    <div className="space-y-4">
                        {grouped.map(({ category, label, items }) => (
                            <div key={category}>
                                <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                    {label}
                                    <span className="ml-1 text-muted-foreground/60">
                                        ({items.length})
                                    </span>
                                </h4>
                                <ul className="mt-2 space-y-2">
                                    {items.map((card) => (
                                        <li key={card.id}>
                                            <span className="text-sm font-medium text-foreground">
                                                {card.term}
                                            </span>
                                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                                {card.definition}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </aside>
    );
}
