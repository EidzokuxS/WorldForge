"use client";

import { useRef, useState } from "react";
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

import { CreationModes, type CreationMode } from "./creation-modes";
import { OverrideTextField } from "./override-text-field";

/**
 * Phase 61 — Player character creation form.
 *
 * Unified 4-mode surface built on the shared CreationModes + OverrideTextField
 * atoms from Plan 01. Mode-specific inputs (description, archetype, file) are
 * kept locally and preserved across mode switches so the user can toggle
 * without losing work. The OverrideTextField is controlled by the page so the
 * value survives ingestion attempts.
 *
 * Per feedback_backdrop_blur_perf.md: no backdrop-blur classes anywhere.
 * Per feedback_no_ip_in_prompts.md: no franchise names in placeholders.
 */
export type BusyState =
  | "idle"
  | "parsing"
  | "generating"
  | "researching"
  | "importing";

interface CharacterFormProps {
  busy: BusyState;
  overrideText: string;
  onOverrideTextChange: (value: string) => void;
  onParse: (description: string) => void | Promise<void>;
  onGenerate: () => void | Promise<void>;
  onResearch: (archetype: string) => void | Promise<void>;
  onImport: (file: File, importMode: CharacterImportMode) => void | Promise<void>;
  /** Thin strip variant for the draft-present recreate row. */
  compact?: boolean;
}

export function CharacterForm({
  busy,
  overrideText,
  onOverrideTextChange,
  onParse,
  onGenerate,
  onResearch,
  onImport,
  compact = false,
}: CharacterFormProps) {
  const isBusy = busy !== "idle";
  const [mode, setMode] = useState<CreationMode | null>(compact ? null : "parse");
  const [description, setDescription] = useState("");
  const [archetype, setArchetype] = useState("");
  const [importMode, setImportMode] = useState<CharacterImportMode>("native");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file, importMode);
      e.target.value = "";
    }
  }

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".json,.png"
      className="hidden"
      onChange={handleFileChange}
    />
  );

  /* ────────────────── COMPACT STRIP (draft present) ────────────────── */
  if (compact) {
    return (
      <div className="flex flex-col gap-[clamp(8px,0.6vw,12px)] border-b border-zinc-800 pb-[clamp(12px,1vw,20px)]">
        <div className="flex flex-wrap items-center gap-[clamp(8px,0.6vw,12px)]">
          <span className="mr-auto font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">
            Recreate
          </span>
          <CreationModes
            mode={mode}
            onModeChange={setMode}
            busy={isBusy}
          />
        </div>

        {/* Per-mode compact inputs */}
        {mode === "parse" && (
          <div className="flex items-start gap-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={isBusy}
              placeholder="Describe the character in free text."
              aria-label="Character description"
              className="flex-1 resize-y rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-[12px] text-zinc-200 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600/50"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => onParse(description.trim())}
              disabled={isBusy || !description.trim()}
            >
              {busy === "parsing" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Run
            </Button>
          </div>
        )}
        {mode === "generate" && (
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onGenerate()}
              disabled={isBusy}
            >
              {busy === "generating" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Run
            </Button>
          </div>
        )}
        {mode === "research" && (
          <div className="flex items-start gap-2">
            <textarea
              value={archetype}
              onChange={(e) => setArchetype(e.target.value)}
              rows={2}
              disabled={isBusy}
              placeholder="a battle-scarred veteran, a mysterious plague doctor, a pragmatic court mage"
              aria-label="Archetype to research"
              className="flex-1 resize-y rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-[12px] text-zinc-200 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600/50"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResearch(archetype.trim())}
              disabled={isBusy || !archetype.trim()}
            >
              {busy === "researching" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Run
            </Button>
          </div>
        )}
        {mode === "import" && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={importMode}
              onValueChange={(v: CharacterImportMode) => setImportMode(v)}
              disabled={isBusy}
            >
              <SelectTrigger className="h-8 w-[130px] font-mono text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="native">Native resident</SelectItem>
                <SelectItem value="outsider">Outsider</SelectItem>
              </SelectContent>
            </Select>
            {hiddenFileInput}
            <Button
              size="sm"
              variant="outline"
              onClick={openFilePicker}
              disabled={isBusy}
            >
              {busy === "importing" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-3.5 w-3.5" />
              )}
              Run
            </Button>
          </div>
        )}

        {/* Collapsible override in compact variant */}
        <details className="group rounded-md border border-zinc-800 bg-zinc-900 p-2">
          <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-400">
            Override Instructions
          </summary>
          <div className="mt-2">
            <OverrideTextField
              value={overrideText}
              onChange={onOverrideTextChange}
              disabled={isBusy}
              compact
            />
          </div>
        </details>
      </div>
    );
  }

  /* ────────────────── FULL HERO FORM (empty state) ────────────────── */
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
        Pick a creation mode. The LLM parses your input into identity, appearance,
        personality, and power — the override field always wins.
      </p>

      <div className="mt-[clamp(20px,1.6vw,32px)] w-full max-w-2xl">
        {/* Mode selector */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-[clamp(14px,1.2vw,20px)]">
          <CreationModes
            mode={mode}
            onModeChange={setMode}
            busy={isBusy}
          />

          <div className="mt-[clamp(14px,1.2vw,20px)]">
            {mode === "parse" && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={10}
                  disabled={isBusy}
                  placeholder="Describe the character in free text. The LLM will extract identity, appearance, personality, and power."
                  aria-label="Character description"
                  className="min-h-[clamp(160px,16vh,280px)] w-full resize-y rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-[clamp(13px,1vw,16px)] text-zinc-200 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600/50"
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => onParse(description.trim())}
                    disabled={isBusy || !description.trim()}
                    className="bg-blood text-white hover:bg-blood/90"
                  >
                    {busy === "parsing" ? (
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
            )}

            {mode === "generate" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-center text-[clamp(12px,0.9vw,14px)] text-zinc-500">
                  Generate a completely new character from scratch. No inputs
                  needed — the LLM decides.
                </p>
                <Button
                  onClick={() => onGenerate()}
                  disabled={isBusy}
                  className="bg-blood text-white hover:bg-blood/90"
                >
                  {busy === "generating" ? (
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
              </div>
            )}

            {mode === "research" && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={archetype}
                  onChange={(e) => setArchetype(e.target.value)}
                  rows={4}
                  disabled={isBusy}
                  placeholder='"a battle-scarred veteran", "a mysterious plague doctor", "a pragmatic court mage"'
                  aria-label="Archetype to research"
                  className="min-h-[96px] w-full resize-y rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-[clamp(13px,1vw,16px)] text-zinc-200 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600/50"
                />
                <p className="text-[clamp(11px,0.8vw,13px)] text-zinc-600">
                  The research agent grounds the archetype in canon before the
                  LLM synthesises the draft.
                </p>
                <div className="flex justify-end">
                  <Button
                    onClick={() => onResearch(archetype.trim())}
                    disabled={isBusy || !archetype.trim()}
                    className="bg-blood text-white hover:bg-blood/90"
                  >
                    {busy === "researching" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Researching...
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-2 h-4 w-4" />
                        Research Archetype
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {mode === "import" && (
              <div className="flex flex-col gap-3">
                <p className="text-[clamp(12px,0.9vw,14px)] text-zinc-500">
                  SillyTavern V2/V3 JSON or PNG with tEXt chunk. The card is
                  treated as INPUT to the pipeline, not as a direct field map.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      Import Mode
                    </span>
                    <Select
                      value={importMode}
                      onValueChange={(value: CharacterImportMode) => setImportMode(value)}
                      disabled={isBusy}
                    >
                      <SelectTrigger className="h-9 w-[160px] font-mono text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="native">Native resident</SelectItem>
                        <SelectItem value="outsider">Outsider</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {hiddenFileInput}
                  <Button
                    onClick={openFilePicker}
                    disabled={isBusy}
                    className="bg-blood text-white hover:bg-blood/90"
                  >
                    {busy === "importing" ? (
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
            )}

            {mode === null && (
              <p className="py-6 text-center text-[clamp(12px,0.9vw,14px)] text-zinc-600">
                Select a creation mode above.
              </p>
            )}
          </div>
        </div>

        {/* Override — always visible */}
        <div className="mt-[clamp(16px,1.2vw,24px)] rounded-lg border border-zinc-800 bg-zinc-900 p-[clamp(14px,1.2vw,20px)]">
          <OverrideTextField
            value={overrideText}
            onChange={onOverrideTextChange}
            disabled={isBusy}
          />
        </div>
      </div>
    </div>
  );
}
