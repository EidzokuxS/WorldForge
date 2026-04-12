"use client";

import { useState, useRef } from "react";
import { Loader2, Sparkles, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CharacterImportMode } from "@/lib/types";

interface CharacterFormProps {
  onParse: (description: string) => void;
  onGenerate: () => void;
  onImport: (file: File, importMode: CharacterImportMode) => void;
  parsing: boolean;
  generating: boolean;
  importing: boolean;
  /** When true, renders a compact strip (no textarea, just action buttons). */
  compact?: boolean;
}

export function CharacterForm({
  onParse,
  onGenerate,
  onImport,
  parsing,
  generating,
  importing,
  compact = false,
}: CharacterFormProps) {
  const [description, setDescription] = useState("");
  const [importMode, setImportMode] = useState<CharacterImportMode>("native");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = parsing || generating || importing;

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".json,.png"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) {
          onImport(file, importMode);
          e.target.value = "";
        }
      }}
    />
  );

  /* ── Compact mode: thin action strip ── */
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-[clamp(8px,0.6vw,12px)] border-b border-border/30 pb-[clamp(12px,1vw,20px)]">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500 mr-auto">
          Recreate
        </span>
        <Button size="sm" variant="outline" onClick={onGenerate} disabled={busy}>
          {generating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          AI Generate
        </Button>
        <div className="flex items-center gap-1.5">
          <Select value={importMode} onValueChange={(v: CharacterImportMode) => setImportMode(v)} disabled={busy}>
            <SelectTrigger className="h-8 w-[130px] text-[11px] font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="native">Native resident</SelectItem>
              <SelectItem value="outsider">Outsider</SelectItem>
            </SelectContent>
          </Select>
          {fileInput}
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {importing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            Import
          </Button>
        </div>
      </div>
    );
  }

  /* ── Full mode: centered hero form ── */
  return (
    <div className="flex flex-col items-center">
      {/* Tagline */}
      <p className="font-mono text-[clamp(10px,0.8vw,12px)] uppercase tracking-[0.2em] text-zinc-600">
        Begin your story
      </p>
      <h2 className="mt-2 font-serif text-[clamp(28px,2.4vw,42px)] text-bone">
        Create a Character
      </h2>
      <p className="mt-3 max-w-lg text-center text-[clamp(13px,1vw,16px)] text-zinc-500">
        Describe who they are — the AI will parse your concept into game stats.
        Or use one of the shortcuts below.
      </p>

      {/* Textarea — the hero */}
      <div className="mt-[clamp(20px,1.6vw,32px)] w-full max-w-2xl">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={12}
          className="flex w-full rounded-md border px-3 py-2 text-base min-h-[clamp(200px,20vh,360px)] resize-none bg-zinc-800/50 border-zinc-700/50 font-mono text-[clamp(13px,1vw,16px)] text-zinc-200 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="A grizzled ex-soldier with a limp and a heart of gold. Carries a battered sword and a flask of cheap whiskey. Knows her way around a battlefield but can't resist a card game..."
          disabled={busy}
        />

        {/* Parse — primary action */}
        <div className="mt-3 flex justify-end">
          <Button
            onClick={() => onParse(description.trim())}
            disabled={busy || !description.trim()}
            className="bg-blood text-white hover:bg-blood/90"
          >
            {parsing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Parse Character
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="mt-[clamp(20px,1.6vw,32px)] flex w-full max-w-2xl items-center gap-4">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="font-mono text-[clamp(10px,0.8vw,12px)] uppercase tracking-[0.15em] text-zinc-600">or</span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      {/* Secondary actions */}
      <div className="mt-[clamp(16px,1.2vw,24px)] flex flex-wrap items-center justify-center gap-[clamp(8px,0.6vw,12px)]">
        <Button variant="outline" onClick={onGenerate} disabled={busy}>
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              AI Generate
            </>
          )}
        </Button>

        <div className="flex items-center gap-2">
          <Select
            value={importMode}
            onValueChange={(value: CharacterImportMode) => setImportMode(value)}
            disabled={busy}
          >
            <SelectTrigger className="h-9 w-[140px] text-[11px] font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="native">Native resident</SelectItem>
              <SelectItem value="outsider">Outsider</SelectItem>
            </SelectContent>
          </Select>

          {fileInput}
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import V2 Card
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
