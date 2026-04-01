"use client";

import { useState } from "react";
import type { CharacterDraft } from "@worldforge/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StringListEditor } from "@/components/world-review/string-list-editor";
import { TagEditor } from "@/components/world-review/tag-editor";
import type {
  LoadoutPreviewResult,
  PersonaTemplateSummary,
} from "@/lib/api-types";

interface CharacterCardProps {
  draft: CharacterDraft;
  locationNames: string[];
  personaTemplates?: PersonaTemplateSummary[];
  previewLoadout?: LoadoutPreviewResult | null;
  previewingLoadout?: boolean;
  applyingTemplateId?: string | null;
  resolvingStartingLocation?: boolean;
  onChange: (draft: CharacterDraft) => void;
  onResolveStartingLocation: () => void;
  onPreviewLoadout?: () => void;
  onApplyPersonaTemplate?: (templateId: string) => void;
}

const HP_OPTIONS = [1, 2, 3, 4, 5];

export function CharacterCard({
  draft,
  locationNames,
  personaTemplates = [],
  previewLoadout = null,
  previewingLoadout = false,
  applyingTemplateId = null,
  resolvingStartingLocation = false,
  onChange,
  onResolveStartingLocation,
  onPreviewLoadout,
  onApplyPersonaTemplate,
}: CharacterCardProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    draft.provenance.templateId ?? "",
  );

  function update(next: CharacterDraft) {
    onChange(next);
  }

  function patch<K extends keyof CharacterDraft>(
    key: K,
    value: CharacterDraft[K],
  ) {
    update({ ...draft, [key]: value });
  }

  const loadoutToRender = previewLoadout?.loadout ?? draft.loadout;

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground">Name</Label>
        <Input
          value={draft.identity.displayName}
          onChange={(e) =>
            patch("identity", {
              ...draft.identity,
              displayName: e.target.value,
            })
          }
          placeholder="Character name"
          className="mt-1 font-serif text-lg font-bold"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Race</Label>
          <Input
            value={draft.profile.species}
            onChange={(e) =>
              patch("profile", {
                ...draft.profile,
                species: e.target.value,
              })
            }
            placeholder="e.g. Human"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Gender</Label>
          <Input
            value={draft.profile.gender}
            onChange={(e) =>
              patch("profile", {
                ...draft.profile,
                gender: e.target.value,
              })
            }
            placeholder="e.g. Male"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Age</Label>
          <Input
            value={draft.profile.ageText}
            onChange={(e) =>
              patch("profile", {
                ...draft.profile,
                ageText: e.target.value,
              })
            }
            placeholder="e.g. Young adult"
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Appearance</Label>
        <Textarea
          value={draft.profile.appearance}
          onChange={(e) =>
            patch("profile", {
              ...draft.profile,
              appearance: e.target.value,
            })
          }
          placeholder="Brief physical description..."
          className="mt-1 min-h-[60px]"
          maxLength={1000}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">Background</Label>
          <Textarea
            value={draft.profile.backgroundSummary}
            onChange={(e) =>
              patch("profile", {
                ...draft.profile,
                backgroundSummary: e.target.value,
              })
            }
            placeholder="History, role, and context..."
            className="mt-1 min-h-[92px]"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Persona</Label>
          <Textarea
            value={draft.profile.personaSummary}
            onChange={(e) =>
              patch("profile", {
                ...draft.profile,
                personaSummary: e.target.value,
              })
            }
            placeholder="Temperament, voice, and default demeanor..."
            className="mt-1 min-h-[92px]"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">Traits</Label>
          <div className="mt-1">
            <TagEditor
              tags={draft.capabilities.traits}
              onChange={(traits) =>
                patch("capabilities", {
                  ...draft.capabilities,
                  traits,
                })
              }
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Flaws</Label>
          <div className="mt-1">
            <TagEditor
              tags={draft.capabilities.flaws}
              onChange={(flaws) =>
                patch("capabilities", {
                  ...draft.capabilities,
                  flaws,
                })
              }
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Drives</Label>
          <div className="mt-1">
            <TagEditor
              tags={draft.motivations.drives}
              onChange={(drives) =>
                patch("motivations", {
                  ...draft.motivations,
                  drives,
                })
              }
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Frictions</Label>
          <div className="mt-1">
            <TagEditor
              tags={draft.motivations.frictions}
              onChange={(frictions) =>
                patch("motivations", {
                  ...draft.motivations,
                  frictions,
                })
              }
            />
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Social Status</Label>
        <p className="mb-1 text-xs text-muted-foreground/70">
          Reputation, role, and social positioning.
        </p>
        <TagEditor
          tags={draft.socialContext.socialStatus}
          onChange={(socialStatus) =>
            patch("socialContext", {
              ...draft.socialContext,
              socialStatus,
            })
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">
            Short-term Goals
          </Label>
          <div className="mt-1">
            <StringListEditor
              items={draft.motivations.shortTermGoals}
              onChange={(shortTermGoals) =>
                patch("motivations", {
                  ...draft.motivations,
                  shortTermGoals,
                })
              }
              placeholder="Add short-term goal..."
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            Long-term Goals
          </Label>
          <div className="mt-1">
            <StringListEditor
              items={draft.motivations.longTermGoals}
              onChange={(longTermGoals) =>
                patch("motivations", {
                  ...draft.motivations,
                  longTermGoals,
                })
              }
              placeholder="Add long-term goal..."
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">HP</Label>
          <div className="mt-1 flex items-center gap-1">
            {HP_OPTIONS.map((hp) => (
              <button
                key={hp}
                type="button"
                onClick={() =>
                  patch("state", {
                    ...draft.state,
                    hp,
                  })
                }
                className={`text-lg ${
                  hp <= draft.state.hp
                    ? "text-red-500"
                    : "text-muted-foreground/30"
                }`}
              >
                &#9829;
              </button>
            ))}
            <span className="ml-2 text-sm text-muted-foreground">
              {draft.state.hp}/5
            </span>
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">
            Starting Location
          </Label>
          <Select
            value={draft.socialContext.currentLocationName ?? ""}
            onValueChange={(currentLocationName: string) =>
              patch("socialContext", {
                ...draft.socialContext,
                currentLocationName,
                currentLocationId: null,
              })
            }
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

      {personaTemplates.length > 0 && (
        <div className="rounded-lg border border-border/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">
                Persona Template
              </Label>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Apply a campaign-scoped persona baseline without leaving the draft workflow.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedTemplateId || applyingTemplateId === selectedTemplateId}
              onClick={() => onApplyPersonaTemplate?.(selectedTemplateId)}
            >
              {applyingTemplateId === selectedTemplateId ? "Applying..." : "Apply Persona"}
            </Button>
          </div>
          <Select value={selectedTemplateId || "__none__"} onValueChange={(value: string) => setSelectedTemplateId(value === "__none__" ? "" : value)}>
            <SelectTrigger className="mt-3">
              <SelectValue placeholder="Choose a persona template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No template</SelectItem>
              {personaTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">
              Starting Situation
            </Label>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Describe where and in what conditions you want to appear.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResolveStartingLocation}
            disabled={resolvingStartingLocation}
          >
            {resolvingStartingLocation ? "Resolving..." : "Apply Start"}
          </Button>
        </div>
        <Textarea
          value={draft.startConditions.sourcePrompt ?? ""}
          onChange={(e) =>
            patch("startConditions", {
              ...draft.startConditions,
              sourcePrompt: e.target.value,
            })
          }
          placeholder="I arrive at the station at dusk after a long climb, exhausted and carrying too much gear..."
          className="mt-2 min-h-[84px]"
        />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Arrival Mode</Label>
            <Input
              value={draft.startConditions.arrivalMode ?? ""}
              onChange={(e) =>
                patch("startConditions", {
                  ...draft.startConditions,
                  arrivalMode: e.target.value,
                })
              }
              placeholder="on-foot, escorted, hidden..."
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Visibility</Label>
            <Input
              value={draft.startConditions.startingVisibility ?? ""}
              onChange={(e) =>
                patch("startConditions", {
                  ...draft.startConditions,
                  startingVisibility: e.target.value,
                })
              }
              placeholder="noticed, expected, anonymous..."
              className="mt-1"
            />
          </div>
        </div>
        <div className="mt-3">
          <Label className="text-xs text-muted-foreground">Immediate Situation</Label>
          <Textarea
            value={draft.startConditions.immediateSituation ?? ""}
            onChange={(e) =>
              patch("startConditions", {
                ...draft.startConditions,
                immediateSituation: e.target.value,
              })
            }
            placeholder="What is happening to the character at the exact opening moment?"
            className="mt-1 min-h-[72px]"
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Entry Pressure</Label>
            <Input
              value={(draft.startConditions.entryPressure ?? []).join(", ")}
              onChange={(e) =>
                patch("startConditions", {
                  ...draft.startConditions,
                  entryPressure: e.target.value
                    .split(",")
                    .map((value: string) => value.trim())
                    .filter(Boolean),
                })
              }
              placeholder="late, cold, under watch..."
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Companions</Label>
            <Input
              value={(draft.startConditions.companions ?? []).join(", ")}
              onChange={(e) =>
                patch("startConditions", {
                  ...draft.startConditions,
                  companions: e.target.value
                    .split(",")
                    .map((value: string) => value.trim())
                    .filter(Boolean),
                })
              }
              placeholder="hound, porter, sibling..."
              className="mt-1"
            />
          </div>
        </div>
        {draft.startConditions.resolvedNarrative && (
          <p className="mt-2 text-sm text-muted-foreground">
            {draft.startConditions.resolvedNarrative}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Equipped Items</Label>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Manual edits stay draft-backed; preview asks the backend for the canonical starting kit.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPreviewLoadout?.()}
            disabled={!onPreviewLoadout || previewingLoadout}
          >
            {previewingLoadout ? "Previewing..." : "Preview Loadout"}
          </Button>
        </div>
        <div className="mt-1">
          <StringListEditor
            items={loadoutToRender.equippedItemRefs}
            onChange={(equippedItemRefs) =>
              patch("loadout", {
                ...draft.loadout,
                inventorySeed:
                  draft.loadout.inventorySeed.length > 0
                    ? draft.loadout.inventorySeed
                    : equippedItemRefs,
                equippedItemRefs,
                signatureItems:
                  draft.loadout.signatureItems.length > 0
                    ? draft.loadout.signatureItems
                    : equippedItemRefs,
              })
            }
            placeholder="Add item..."
          />
        </div>
        {loadoutToRender.signatureItems.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Signature items: {loadoutToRender.signatureItems.join(", ")}
          </p>
        )}
        {previewLoadout && (
          <div className="mt-3 rounded-lg border border-border/50 bg-muted/30 p-3 text-sm">
            <p className="font-medium">Canonical preview</p>
            <p className="mt-1 text-muted-foreground">
              Audit: {previewLoadout.audit.join(", ")}
            </p>
            {previewLoadout.items.length > 0 && (
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {previewLoadout.items.map((item) => (
                  <li key={`${item.slot}:${item.name}`}>
                    {item.name} ({item.slot}) - {item.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
