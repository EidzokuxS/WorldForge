"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagEditor } from "@/components/world-review/tag-editor";
import { StringListEditor } from "@/components/world-review/string-list-editor";
import type { ParsedCharacter } from "@/lib/api";

interface CharacterCardProps {
  character: ParsedCharacter;
  locationNames: string[];
  onChange: (character: ParsedCharacter) => void;
}

const HP_OPTIONS = [1, 2, 3, 4, 5];

export function CharacterCard({
  character,
  locationNames,
  onChange,
}: CharacterCardProps) {
  function update(patch: Partial<ParsedCharacter>) {
    onChange({ ...character, ...patch });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground">Name</Label>
        <Input
          value={character.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Character name"
          className="mt-1 font-serif text-lg font-bold"
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Tags</Label>
        <p className="text-xs text-muted-foreground/70 mb-1">
          Traits, skills, flaws, background
        </p>
        <TagEditor
          tags={character.tags}
          onChange={(tags) => update({ tags })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">HP</Label>
          <div className="mt-1 flex items-center gap-1">
            {HP_OPTIONS.map((hp) => (
              <button
                key={hp}
                type="button"
                onClick={() => update({ hp })}
                className={`text-lg ${
                  hp <= character.hp
                    ? "text-red-500"
                    : "text-muted-foreground/30"
                }`}
              >
                &#9829;
              </button>
            ))}
            <span className="ml-2 text-sm text-muted-foreground">
              {character.hp}/5
            </span>
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">
            Starting Location
          </Label>
          <Select
            value={character.locationName}
            onValueChange={(v) => update({ locationName: v })}
          >
            <SelectTrigger className="mt-1 h-9 text-sm">
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              {locationNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Equipped Items</Label>
        <div className="mt-1">
          <StringListEditor
            items={character.equippedItems}
            onChange={(equippedItems) => update({ equippedItems })}
            placeholder="Add item..."
          />
        </div>
      </div>
    </div>
  );
}
