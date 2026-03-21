"use client";

import { useCallback } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagEditor } from "@/components/world-review/tag-editor";
import { StringListEditor } from "@/components/world-review/string-list-editor";
import { RegenerateDialog } from "@/components/world-review/regenerate-dialog";
import type { ScaffoldFaction } from "@/lib/api";

interface FactionsSectionProps {
  factions: ScaffoldFaction[];
  locationNames: string[];
  onChange: (factions: ScaffoldFaction[]) => void;
  onRegenerate: (instruction: string | undefined) => void;
  regenerating: boolean;
}

export function FactionsSection({
  factions,
  locationNames,
  onChange,
  onRegenerate,
  regenerating,
}: FactionsSectionProps) {
  const updateFaction = useCallback(
    (index: number, patch: Partial<ScaffoldFaction>) => {
      const updated = factions.map((f, i) =>
        i === index ? { ...f, ...patch } : f
      );
      onChange(updated);
    },
    [factions, onChange]
  );

  const deleteFaction = useCallback(
    (index: number) => {
      onChange(factions.filter((_, i) => i !== index));
    },
    [factions, onChange]
  );

  const addFaction = useCallback(() => {
    const newFaction: ScaffoldFaction = {
      name: "",
      tags: [],
      goals: [],
      assets: [],
      territoryNames: [],
    };
    onChange([...factions, newFaction]);
  }, [factions, onChange]);

  const addTerritory = useCallback(
    (index: number, name: string) => {
      const faction = factions[index];
      if (faction.territoryNames.includes(name)) return;
      updateFaction(index, {
        territoryNames: [...faction.territoryNames, name],
      });
    },
    [factions, updateFaction]
  );

  const removeTerritory = useCallback(
    (index: number, name: string) => {
      const faction = factions[index];
      updateFaction(index, {
        territoryNames: faction.territoryNames.filter((t) => t !== name),
      });
    },
    [factions, updateFaction]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-bone">Factions</h2>
        <div className="flex items-center gap-2">
          <RegenerateDialog
            sectionName="Factions"
            onConfirm={onRegenerate}
            regenerating={regenerating}
          />
          <Button variant="outline" size="sm" onClick={addFaction}>
            <Plus className="mr-2 h-4 w-4" />
            Add Faction
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {factions.map((faction, index) => (
          <Card key={faction.name || `faction-${index}`} className="relative border-border/50 bg-card">
            <button
              type="button"
              onClick={() => deleteFaction(index)}
              className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <CardHeader className="pb-2 pr-10">
              <Input
                value={faction.name}
                onChange={(e) =>
                  updateFaction(index, { name: e.target.value })
                }
                placeholder="Faction name"
                className="font-serif text-lg font-bold"
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Tags</Label>
                <div className="mt-1">
                  <TagEditor
                    tags={faction.tags}
                    onChange={(tags) => updateFaction(index, { tags })}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Goals</Label>
                <div className="mt-1">
                  <StringListEditor
                    items={faction.goals}
                    onChange={(goals) => updateFaction(index, { goals })}
                    placeholder="Add goal..."
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Assets</Label>
                <div className="mt-1">
                  <StringListEditor
                    items={faction.assets}
                    onChange={(assets) => updateFaction(index, { assets })}
                    placeholder="Add asset..."
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Territory
                </Label>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {faction.territoryNames.map((name) => (
                    <Badge
                      key={name}
                      variant="secondary"
                      className="gap-1 pr-1 text-xs"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => removeTerritory(index, name)}
                        className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {(() => {
                    const available = locationNames.filter(
                      (n) => !faction.territoryNames.includes(n)
                    );
                    if (available.length === 0) return null;
                    return (
                      <Select
                        value=""
                        onValueChange={(v: string) => addTerritory(index, v)}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs">
                          <SelectValue placeholder="Add..." />
                        </SelectTrigger>
                        <SelectContent>
                          {available.map((n) => (
                            <SelectItem key={n} value={n}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
