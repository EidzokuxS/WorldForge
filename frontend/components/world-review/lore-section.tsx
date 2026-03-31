"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Loader2, Pencil, Search, Trash2, Upload } from "lucide-react";
import {
  deleteLoreCardById,
  searchLore,
  updateLoreCard,
  type LoreCardItem,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  LORE_CARD_CATEGORIES,
  type LoreCardCategory,
  type LoreCardUpdateInput,
} from "@/lib/api-types";
import { WorldBookImportDialog } from "./worldbook-import-dialog";

interface LoreSectionProps {
  cards: LoreCardItem[];
  campaignId: string;
  onRefresh?: () => void;
}

const CATEGORY_LABELS: Record<LoreCardCategory, string> = {
  location: "Locations",
  npc: "Characters",
  faction: "Factions",
  ability: "Abilities",
  rule: "World Rules",
  concept: "Concepts",
  item: "Items",
  event: "Events",
};

function defaultEditPayload(card: LoreCardItem): LoreCardUpdateInput {
  return {
    term: card.term,
    definition: card.definition,
    category: normalizeCategory(card.category),
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Lore update failed.";
}

function normalizeCategory(category: string): LoreCardCategory {
  return (LORE_CARD_CATEGORIES as readonly string[]).includes(category)
    ? (category as LoreCardCategory)
    : "concept";
}

export function LoreSection({ cards: initialCards, campaignId, onRefresh }: LoreSectionProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LoreCardItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"edit" | "delete" | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<LoreCardItem | null>(null);
  const [editPayload, setEditPayload] = useState<LoreCardUpdateInput | null>(null);
  const [editError, setEditError] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<LoreCardItem | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayCards = results ?? initialCards;
  const isCardPending = useCallback(
    (cardId: string) => pendingCardId === cardId,
    [pendingCardId],
  );

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

  const clearCardError = useCallback((cardId: string) => {
    setCardErrors((current) => {
      if (!(cardId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[cardId];
      return next;
    });
  }, []);

  const beginEdit = useCallback(
    (card: LoreCardItem) => {
      clearCardError(card.id);
      setEditError("");
      setEditingCard(card);
      setEditPayload(defaultEditPayload(card));
      setEditOpen(true);
    },
    [clearCardError],
  );

  const beginDelete = useCallback(
    (card: LoreCardItem) => {
      clearCardError(card.id);
      setDeleteCandidate(card);
    },
    [clearCardError],
  );

  const handleEditOpenChange = useCallback((open: boolean) => {
    setEditOpen(open);
    if (!open && pendingAction !== "edit") {
      setEditingCard(null);
      setEditPayload(null);
      setEditError("");
    }
  }, [pendingAction]);

  const refreshCards = useCallback(async () => {
    setResults(null);
    await onRefresh?.();
  }, [onRefresh]);

  const handleEditSave = useCallback(async () => {
    if (!editingCard || !editPayload) return;

    setPendingCardId(editingCard.id);
    setPendingAction("edit");
    clearCardError(editingCard.id);
    setEditError("");

    try {
      await updateLoreCard(campaignId, editingCard.id, editPayload);
      await refreshCards();
      setEditOpen(false);
      setEditingCard(null);
      setEditPayload(null);
    } catch (error) {
      const message = getErrorMessage(error);
      setCardErrors((current) => ({ ...current, [editingCard.id]: message }));
      setEditError(message);
    } finally {
      setPendingCardId(null);
      setPendingAction(null);
    }
  }, [campaignId, clearCardError, editPayload, editingCard, refreshCards]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteCandidate) return;
    const targetCard = deleteCandidate;

    setPendingCardId(targetCard.id);
    setPendingAction("delete");
    clearCardError(targetCard.id);
    setDeleteCandidate(null);

    try {
      await deleteLoreCardById(campaignId, targetCard.id);
      await refreshCards();
    } catch (error) {
      const message = getErrorMessage(error);
      setCardErrors((current) => ({ ...current, [targetCard.id]: message }));
    } finally {
      setPendingCardId(null);
      setPendingAction(null);
    }
  }, [campaignId, clearCardError, deleteCandidate, refreshCards]);

  const grouped = useMemo(() => {
    const groups: Partial<Record<LoreCardCategory, LoreCardItem[]>> = {};
    for (const card of displayCards) {
      const cat = normalizeCategory(card.category);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(card);
    }
    return LORE_CARD_CATEGORIES.filter((cat) => groups[cat]?.length).map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] ?? cat,
      items: groups[cat] ?? [],
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

      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Lore Card</DialogTitle>
            <DialogDescription>
              Update the term, definition, and category for this lore card.
            </DialogDescription>
          </DialogHeader>
          {editingCard && editPayload ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lore-edit-term">Term</Label>
                <Input
                  id="lore-edit-term"
                  value={editPayload.term}
                  onChange={(event) =>
                    setEditPayload((current) => current
                      ? { ...current, term: event.target.value }
                      : current)
                  }
                  disabled={isCardPending(editingCard.id)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lore-edit-definition">Definition</Label>
                <Textarea
                  id="lore-edit-definition"
                  value={editPayload.definition}
                  onChange={(event) =>
                    setEditPayload((current) => current
                      ? { ...current, definition: event.target.value }
                      : current)
                  }
                  rows={5}
                  disabled={isCardPending(editingCard.id)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lore-edit-category">Category</Label>
                <Select
                  value={editPayload.category}
                  onValueChange={(value: LoreCardCategory) =>
                    setEditPayload((current) => current
                      ? { ...current, category: value }
                      : current)
                  }
                  disabled={isCardPending(editingCard.id)}
                >
                  <SelectTrigger id="lore-edit-category" aria-label="Category" className="w-full">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {LORE_CARD_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editError ? (
                <p className="text-sm text-destructive" role="alert">
                  {editError}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleEditOpenChange(false)}
                  disabled={isCardPending(editingCard.id)}
                >
                  Cancel
                </Button>
                <Button onClick={() => void handleEditSave()} disabled={isCardPending(editingCard.id)}>
                  {isCardPending(editingCard.id) && pendingAction === "edit" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteCandidate !== null}
        onOpenChange={(open: boolean) => {
          if (!open && pendingAction !== "delete") {
            setDeleteCandidate(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lore Card</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCandidate
                ? `Delete "${deleteCandidate.term}" from this campaign's lore?`
                : "Delete this lore card?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCandidate ? isCardPending(deleteCandidate.id) : false}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                void handleDeleteConfirm();
              }}
              disabled={deleteCandidate ? isCardPending(deleteCandidate.id) : false}
            >
              {deleteCandidate && isCardPending(deleteCandidate.id) && pendingAction === "delete"
                ? "Deleting..."
                : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          aria-label={`Edit ${card.term}`}
                          disabled={isCardPending(card.id)}
                          onClick={() => beginEdit(card)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          aria-label={isCardPending(card.id) && pendingAction === "delete"
                            ? `Deleting ${card.term}`
                            : `Delete ${card.term}`}
                          disabled={isCardPending(card.id)}
                          onClick={() => beginDelete(card)}
                        >
                          {isCardPending(card.id) && pendingAction === "delete" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          {isCardPending(card.id) && pendingAction === "delete" ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </div>
                    {cardErrors[card.id] ? (
                      <p className="mt-2 text-xs text-destructive" role="alert">
                        {cardErrors[card.id]}
                      </p>
                    ) : null}
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
