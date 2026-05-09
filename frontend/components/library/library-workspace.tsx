"use client";

import * as React from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { importWorldbookLibrary, listWorldbookLibrary } from "@/lib/api";

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
    <div className="wf-v4-page wf-v4-page-theater">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-5 border-b border-white/[0.08] pb-8">
        <div>
          <p className="wf-kicker wf-kicker-ember">Worldbook</p>
          <h1 className="wf-display mt-3 text-[clamp(44px,3.7vw,78px)]">Reusable context.</h1>
          <p className="wf-prose mt-4 max-w-[72ch] text-[17px] leading-7 text-[var(--fg-2)]">
            Import SillyTavern-style worldbook JSON and reuse it during campaign creation.
          </p>
        </div>
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
          <span className="wf-v4-btn wf-v4-btn-primary cursor-pointer">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import JSON
          </span>
        </label>
      </div>

      {loading ? (
        <div className="wf-v4-card flex items-center gap-2 p-8 text-sm text-[var(--fg-2)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading worldbooks...
        </div>
      ) : items.length === 0 ? (
        <div className="wf-v4-card p-8 text-sm text-[var(--fg-2)]">
          No worldbooks yet. Import a JSON file to get started.
        </div>
      ) : (
        <div className="wf-worldbook-shelf">
          {items.map((item) => (
            <article
              key={item.id}
              className="wf-v4-card wf-worldbook-card"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-3)]">
                {formatDate(item.updatedAt)}
              </div>
              <h2 className="mt-4 font-serif text-[clamp(24px,1.7vw,34px)] font-semibold leading-tight text-[var(--fg)]">
                {item.displayName}
              </h2>
              {item.originalFileName ? (
                <p className="wf-prose mt-3 line-clamp-2 text-sm text-[var(--fg-2)]">{item.originalFileName}</p>
              ) : null}
              <div className="mt-7 inline-flex border border-white/[0.08] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-2)]">
                {item.entryCount} entries
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
