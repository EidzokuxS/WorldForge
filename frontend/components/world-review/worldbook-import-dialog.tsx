"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Upload, X, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  parseWorldBook,
  importWorldBook,
  type ClassifiedWorldBookEntry,
  type WorldBookImportResult,
} from "@/lib/api";

interface WorldBookImportDialogProps {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

type DialogState = "idle" | "parsing" | "preview" | "importing" | "done" | "error";

const TYPE_COLORS: Record<string, string> = {
  character: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  location: "bg-green-500/20 text-green-400 border-green-500/30",
  faction: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  bestiary: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  lore_general: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const TYPE_LABELS: Record<string, string> = {
  character: "Character",
  location: "Location",
  faction: "Faction",
  bestiary: "Bestiary",
  lore_general: "Lore",
};

export function WorldBookImportDialog({
  campaignId,
  open,
  onOpenChange,
  onComplete,
}: WorldBookImportDialogProps) {
  const [state, setState] = useState<DialogState>("idle");
  const [entries, setEntries] = useState<ClassifiedWorldBookEntry[]>([]);
  const [importResult, setImportResult] = useState<WorldBookImportResult | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setState("idle");
    setEntries([]);
    setImportResult(null);
    setError("");
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) reset();
      onOpenChange(newOpen);
    },
    [onOpenChange, reset],
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      setState("parsing");
      setError("");

      try {
        const text = await file.text();
        const json = JSON.parse(text) as object;
        const result = await parseWorldBook(campaignId, json);
        setEntries(result.entries);
        setState("preview");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse WorldBook file.");
        setState("error");
      }
    },
    [campaignId],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFileSelect(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [handleFileSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".json")) {
        void handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const removeEntry = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleImport = useCallback(async () => {
    setState("importing");
    try {
      const result = await importWorldBook(campaignId, entries);
      setImportResult(result);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setState("error");
    }
  }, [campaignId, entries]);

  const handleDone = useCallback(() => {
    onComplete();
    handleOpenChange(false);
  }, [onComplete, handleOpenChange]);

  // Compute counts for preview
  const counts = {
    characters: entries.filter((e) => e.type === "character").length,
    locations: entries.filter((e) => e.type === "location").length,
    factions: entries.filter((e) => e.type === "faction").length,
    lore: entries.filter((e) => e.type === "bestiary" || e.type === "lore_general").length,
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif">Import WorldBook</DialogTitle>
        </DialogHeader>

        {/* Idle: file upload area */}
        {state === "idle" && (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border/60 p-12 transition-colors hover:border-border"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag and drop a SillyTavern WorldBook JSON file, or click to browse
            </p>
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {/* Parsing: spinner */}
        {state === "parsing" && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Classifying entries...</p>
          </div>
        )}

        {/* Preview: classified entries list */}
        {state === "preview" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {counts.characters > 0 && <span>{counts.characters} characters</span>}
              {counts.locations > 0 && <span>{counts.locations} locations</span>}
              {counts.factions > 0 && <span>{counts.factions} factions</span>}
              {counts.lore > 0 && <span>{counts.lore} lore entries</span>}
            </div>

            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-4">
                {entries.map((entry, idx) => (
                  <div
                    key={`${entry.name}-${idx}`}
                    className="flex items-start gap-3 rounded-md border border-border/50 bg-card p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={TYPE_COLORS[entry.type] ?? ""}
                        >
                          {TYPE_LABELS[entry.type] ?? entry.type}
                        </Badge>
                        <span className="text-sm font-medium text-foreground truncate">
                          {entry.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {entry.summary.length > 100
                          ? entry.summary.slice(0, 100) + "..."
                          : entry.summary}
                      </p>
                    </div>
                    <button
                      onClick={() => removeEntry(idx)}
                      className="mt-1 shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={entries.length === 0}>
                Import Selected ({entries.length})
              </Button>
            </div>
          </div>
        )}

        {/* Importing: spinner */}
        {state === "importing" && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Importing...</p>
          </div>
        )}

        {/* Done: success message */}
        {state === "done" && importResult && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle className="h-10 w-10 text-green-500" />
            <div className="text-center">
              <p className="mb-2 font-medium text-foreground">Import Complete</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                {importResult.imported.characters > 0 && (
                  <p>{importResult.imported.characters} characters added</p>
                )}
                {importResult.imported.locations > 0 && (
                  <p>{importResult.imported.locations} locations added</p>
                )}
                {importResult.imported.factions > 0 && (
                  <p>{importResult.imported.factions} factions added</p>
                )}
                {importResult.imported.loreCards > 0 && (
                  <p>{importResult.imported.loreCards} lore cards added</p>
                )}
              </div>
            </div>
            <Button onClick={handleDone}>Close</Button>
          </div>
        )}

        {/* Error state */}
        {state === "error" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <div className="text-center">
              <p className="mb-1 font-medium text-foreground">Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button variant="secondary" onClick={reset}>
              Try Again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
