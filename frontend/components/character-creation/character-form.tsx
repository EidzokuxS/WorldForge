"use client";

import { useState, useRef } from "react";
import { Loader2, Sparkles, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  const [importMode, setImportMode] = useState<CharacterImportMode>("native");
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

      <div className="flex flex-wrap gap-2">
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

        <div className="min-w-[240px] space-y-1">
          <Label className="text-xs text-muted-foreground">Import integration</Label>
          <Select
            value={importMode}
            onValueChange={(value: CharacterImportMode) => setImportMode(value)}
            disabled={busy}
          >
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="native">Native resident</SelectItem>
              <SelectItem value="outsider">Outsider / popadanets</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
