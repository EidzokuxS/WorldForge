"use client";

import { useRef, useState } from "react";
import { BookOpen, FileUp, Loader2, Sparkles, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type CampaignPlayerIntakeBusy = "idle" | "draft" | "research" | "card";
export type CampaignPlayerImportMode = "native" | "outsider";

interface CampaignPlayerIntakeProps {
  busy: CampaignPlayerIntakeBusy;
  onDraft: (prompt: string) => void | Promise<void>;
  onResearch: (query: string) => void | Promise<void>;
  onCard: (file: File, importMode: CampaignPlayerImportMode) => void | Promise<void>;
  compact?: boolean;
}

export function CampaignPlayerIntake({
  busy,
  onDraft,
  onResearch,
  onCard,
  compact = false,
}: CampaignPlayerIntakeProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"draft" | "research" | "card">("draft");
  const [prompt, setPrompt] = useState("");
  const [importMode, setImportMode] = useState<CampaignPlayerImportMode>("native");
  const isBusy = busy !== "idle";

  return (
    <section className="rounded-[var(--r-l)] border border-white/[0.08] bg-black/25 p-[clamp(16px,1.5vw,28px)]">
      <div className="flex flex-wrap gap-2" aria-label="Character creation method">
        <Button type="button" size="sm" variant={mode === "draft" ? "default" : "outline"} onClick={() => setMode("draft")} disabled={isBusy}>
          <WandSparkles className="mr-2 h-4 w-4" /> Describe
        </Button>
        <Button type="button" size="sm" variant={mode === "research" ? "default" : "outline"} onClick={() => setMode("research")} disabled={isBusy}>
          <BookOpen className="mr-2 h-4 w-4" /> Research
        </Button>
        <Button type="button" size="sm" variant={mode === "card" ? "default" : "outline"} onClick={() => setMode("card")} disabled={isBusy}>
          <FileUp className="mr-2 h-4 w-4" /> Import card
        </Button>
      </div>

      {mode === "card" ? (
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="grid gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">
            Place in the world
            <Select value={importMode} onValueChange={(value: CampaignPlayerImportMode) => setImportMode(value)} disabled={isBusy}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="native">Native resident</SelectItem>
                <SelectItem value="outsider">World outsider</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <input
            ref={fileInput}
            className="hidden"
            type="file"
            accept=".json,.png,application/json,image/png"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void onCard(file, importMode);
              event.currentTarget.value = "";
            }}
          />
          <Button type="button" onClick={() => fileInput.current?.click()} disabled={isBusy}>
            {busy === "card" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
            Choose JSON or PNG
          </Button>
        </div>
      ) : (
        <div className="mt-5">
          <Textarea
            aria-label={mode === "research" ? "Character archetype" : "Character concept"}
            rows={compact ? 3 : 7}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={isBusy}
            placeholder={mode === "research"
              ? "Describe the archetype or source material that should ground this character."
              : "Describe who you want to inhabit, or leave a few strong constraints for the world to complete."}
          />
          <div className="mt-3 flex justify-end">
            {mode === "draft" ? (
              <Button
                className="mr-auto"
                type="button"
                variant="ghost"
                onClick={() => onDraft("Create a grounded player character who belongs in this accepted world and has a life beyond the opening scene.")}
                disabled={isBusy}
              >
                Let the world decide
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => mode === "research" ? onResearch(prompt.trim()) : onDraft(prompt.trim())}
              disabled={isBusy || prompt.trim().length === 0}
            >
              {busy === mode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {mode === "research" ? "Research and draft" : "Build draft"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
