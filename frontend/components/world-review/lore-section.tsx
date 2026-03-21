"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchLore, type LoreCardItem } from "@/lib/api";
import { WorldBookImportDialog } from "./worldbook-import-dialog";

interface LoreSectionProps {
  cards: LoreCardItem[];
  campaignId: string;
  onRefresh?: () => void;
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

export function LoreSection({ cards: initialCards, campaignId, onRefresh }: LoreSectionProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LoreCardItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayCards = results ?? initialCards;

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!value.trim()) {
        setResults(null);
        return;
      }

      debounceRef.current = setTimeout(() => {
        setIsSearching(true);
        void searchLore(campaignId, value.trim(), 20)
          .then((data) => setResults(data))
          .catch(() => {
            // Keep current display on error
          })
          .finally(() => setIsSearching(false));
      }, 300);
    },
    [campaignId]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<string, LoreCardItem[]> = {};
    for (const card of displayCards) {
      const cat = card.category || "concept";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(card);
    }
    return CATEGORY_ORDER.filter((cat) => groups[cat]?.length).map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] ?? cat,
      items: groups[cat],
    }));
  }, [displayCards]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-bone">Lore Cards</h2>
        <span className="text-xs text-muted-foreground">
          {displayCards.length} cards
        </span>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search lore cards..."
            className="pl-9 text-sm"
            disabled={isSearching}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setImportOpen(true)}
        >
          <Upload className="h-4 w-4" />
          Import WorldBook
        </Button>
      </div>

      <WorldBookImportDialog
        campaignId={campaignId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onComplete={() => onRefresh?.()}
      />

      {displayCards.length === 0 ? (
        <p className="py-4 text-center text-sm italic text-muted-foreground">
          No lore cards available
        </p>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ category, label, items }) => (
            <div key={category}>
              <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {label}
                <span className="ml-1 text-muted-foreground/60">
                  ({items.length})
                </span>
              </h3>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {items.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-md border border-border/50 bg-card p-3"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {card.category}
                      </Badge>
                      <span className="text-sm font-medium text-foreground">
                        {card.term}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {card.definition}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
