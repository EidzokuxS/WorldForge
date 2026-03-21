"use client";

import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface CharacterFormProps {
  onParse: (description: string) => void;
  onGenerate: () => void;
  parsing: boolean;
  generating: boolean;
}

export function CharacterForm({
  onParse,
  onGenerate,
  parsing,
  generating,
}: CharacterFormProps) {
  const [description, setDescription] = useState("");
  const busy = parsing || generating;

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
      </div>
    </div>
  );
}
