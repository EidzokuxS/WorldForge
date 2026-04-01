"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { importWorldbookLibrary, listWorldbookLibrary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LibraryItem {
  id: string;
  displayName: string;
  entryCount: number;
  updatedAt: number;
  originalFileName?: string;
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
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_320px]">
        <Card className="border-border/70 bg-card/80 shadow-xl shadow-black/10">
          <CardHeader>
            <CardTitle className="font-serif text-3xl text-bone">Reusable Worldbook Library</CardTitle>
            <p className="text-sm text-muted-foreground">
              Browse reusable knowledge sources, import new files, and keep campaign creation lightweight.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
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
              <span className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-background/50 px-3 py-2 text-sm font-medium hover:bg-accent">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Import Worldbook JSON
              </span>
            </label>

            {loading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading reusable worldbooks...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
                No reusable worldbooks yet.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-bone">{item.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.entryCount} entries
                          {item.originalFileName ? ` · ${item.originalFileName}` : ""}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Updated {new Date(item.updatedAt).toLocaleString("en-US")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-xl shadow-black/10">
          <CardHeader>
            <CardTitle className="font-serif text-2xl text-bone">Creation Handoff</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              After curating reusable sources, go back into routed campaign creation with the same shell frame and selected-source workflow.
            </p>
            <Button asChild className="w-full">
              <Link href="/campaign/new">Back to Campaign Creation</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
