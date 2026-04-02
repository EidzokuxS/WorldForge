"use client";

import * as React from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { importWorldbookLibrary, listWorldbookLibrary } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface LibraryItem {
  id: string;
  displayName: string;
  entryCount: number;
  updatedAt: number;
  originalFileName?: string;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function LibraryWorkspace() {
  const [items, setItems] = React.useState<LibraryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    void listWorldbookLibrary()
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error("Failed to load worldbook library", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as object;
      const displayName = file.name.replace(/\.json$/i, "").trim() || "Worldbook";
      const result = await importWorldbookLibrary(displayName, parsed, file.name);
      setItems((current) => {
        const next = [...current.filter((item) => item.id !== result.item.id), result.item];
        return next.sort((left, right) => right.updatedAt - left.updatedAt);
      });
      toast.success("Worldbook imported");
    } catch (error) {
      toast.error("Worldbook import failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex justify-end mb-[clamp(6px,0.5vw,12px)]">
        <label className="inline-flex">
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImport(file);
              }
              event.target.value = "";
            }}
          />
          <span className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-[clamp(10px,0.8vw,16px)] py-[clamp(5px,0.4vw,8px)] text-[clamp(13px,0.9vw,16px)] font-medium text-foreground shadow-sm transition-colors hover:bg-white/[0.08]">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import Worldbook
          </span>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading worldbooks...
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">
          No worldbooks yet. Import a JSON file to get started.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_100px_120px] pb-[clamp(6px,0.5vw,10px)] border-b border-border/60 text-[clamp(10px,0.7vw,13px)] font-semibold uppercase tracking-[0.06em] text-zinc-500">
            <span>Name</span>
            <span>Entries</span>
            <span>Updated</span>
            <span />
          </div>

          {/* Table rows */}
          {items.map((item) => (
            <div
              key={item.id}
              className="group grid grid-cols-[1fr_80px_100px_120px] items-center py-[clamp(10px,0.9vw,18px)] border-b border-border/60 transition-colors hover:bg-white/[0.04]"
            >
              <span className="text-[clamp(14px,1vw,18px)] font-medium text-foreground">
                {item.displayName}
              </span>
              <span className="text-[clamp(12px,0.85vw,15px)] text-zinc-500">
                {item.entryCount}
              </span>
              <span className="text-[clamp(12px,0.85vw,15px)] text-zinc-500">
                {formatDate(item.updatedAt)}
              </span>
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  Export
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-400 hover:bg-red-500/[0.06]">
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
