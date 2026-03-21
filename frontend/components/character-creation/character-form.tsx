"use client";

import { useState, useRef } from "react";
import { Loader2, Sparkles, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface CharacterFormProps {
  onParse: (description: string) => void;
  onGenerate: () => void;
  onImport: (file: File) => void;
  parsing: boolean;
  generating: boolean;
  importing: boolean;
}

export function CharacterForm({
  onParse,
  onGenerate,
  onImport,
  parsing,
  generating,
  importing,
}: CharacterFormProps) {
  const [description, setDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = parsing || generating || importing;

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium text-bone">
          Describe your character
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Write a free-text description — name, background, personality, skills,
          flaws, equipment. The AI will parse it into game stats.
        </p>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          className="mt-2 resize-none"
          placeholder="A grizzled ex-soldier with a limp and a heart of gold. Carries a battered sword and a flask of cheap whiskey. Knows her way around a battlefield but can't resist a card game..."
          disabled={busy}
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => onParse(description.trim())}
          disabled={busy || !description.trim()}
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

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onImport(file);
              e.target.value = "";
            }
          }}
        />
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
  );
}
