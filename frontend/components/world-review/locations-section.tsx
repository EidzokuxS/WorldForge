"use client";

import { useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { TagEditor } from "@/components/world-review/tag-editor";
import { RegenerateDialog } from "@/components/world-review/regenerate-dialog";
import type { ScaffoldLocation } from "@/lib/api";

interface LocationsSectionProps {
  locations: ScaffoldLocation[];
  onChange: (locations: ScaffoldLocation[]) => void;
  onRegenerate: (instruction: string | undefined) => void;
  regenerating: boolean;
}

export function LocationsSection({
  locations,
  onChange,
  onRegenerate,
  regenerating,
}: LocationsSectionProps) {
  const updateLocation = useCallback(
    (index: number, patch: Partial<ScaffoldLocation>) => {
      const updated = locations.map((loc, i) =>
        i === index ? { ...loc, ...patch } : loc
      );
      onChange(updated);
    },
    [locations, onChange]
  );

  const deleteLocation = useCallback(
    (index: number) => {
      onChange(locations.filter((_, i) => i !== index));
    },
    [locations, onChange]
  );

  const addLocation = useCallback(() => {
    const newLoc: ScaffoldLocation = {
      name: "",
      description: "",
      tags: [],
      isStarting: false,
      connectedTo: [],
    };
    onChange([...locations, newLoc]);
  }, [locations, onChange]);

  const allNames = locations.map((l) => l.name).filter(Boolean);

  const addConnection = useCallback(
    (index: number, name: string) => {
      const loc = locations[index];
      if (loc.connectedTo.includes(name)) return;
      updateLocation(index, { connectedTo: [...loc.connectedTo, name] });
    },
    [locations, updateLocation]
  );

  const removeConnection = useCallback(
    (index: number, connName: string) => {
      const loc = locations[index];
      updateLocation(index, {
        connectedTo: loc.connectedTo.filter((c) => c !== connName),
      });
    },
    [locations, updateLocation]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-bone">Locations</h2>
        <div className="flex items-center gap-2">
          <RegenerateDialog
            sectionName="Locations"
            onConfirm={onRegenerate}
            regenerating={regenerating}
          />
          <Button variant="outline" size="sm" onClick={addLocation}>
            <Plus className="mr-2 h-4 w-4" />
            Add Location
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {locations.map((loc, index) => (
          <Card key={`loc-${index}`} className="relative border-border/50 bg-card">
            <button
              type="button"
              onClick={() => deleteLocation(index)}
              className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <CardHeader className="pb-2 pr-10">
              <Input
                value={loc.name}
                onChange={(e) => updateLocation(index, { name: e.target.value })}
                placeholder="Location name"
                className="font-serif text-lg font-bold"
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Description
                </Label>
                <Textarea
                  value={loc.description}
                  onChange={(e) =>
                    updateLocation(index, { description: e.target.value })
                  }
                  rows={3}
                  className="mt-1 resize-none text-sm"
                  placeholder="Describe this location..."
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Tags</Label>
                <div className="mt-1">
                  <TagEditor
                    tags={loc.tags}
                    onChange={(tags) => updateLocation(index, { tags })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id={`starting-${index}`}
                  checked={loc.isStarting}
                  onCheckedChange={(checked: boolean) =>
                    updateLocation(index, { isStarting: checked })
                  }
                />
                <Label
                  htmlFor={`starting-${index}`}
                  className="text-sm text-muted-foreground"
                >
                  Starting location
                </Label>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Connected To
                </Label>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {loc.connectedTo.map((conn) => (
                    <Badge
                      key={conn}
                      variant="secondary"
                      className="gap-1 pr-1 text-xs"
                    >
                      {conn}
                      <button
                        type="button"
                        onClick={() => removeConnection(index, conn)}
                        className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {(() => {
                    const available = allNames.filter(
                      (n) => n !== loc.name && !loc.connectedTo.includes(n)
                    );
                    if (available.length === 0) return null;
                    return (
                      <Select
                        value=""
                        onValueChange={(v: string) => addConnection(index, v)}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs">
                          <SelectValue placeholder="Add..." />
                        </SelectTrigger>
                        <SelectContent>
                          {[...new Set(available)].map((n, i) => (
                            <SelectItem key={`${n}-${i}`} value={n}>
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
