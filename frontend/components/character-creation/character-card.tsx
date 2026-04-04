"use client";

import { useState } from "react";
import type { CharacterDraft } from "@worldforge/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
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

const inputCls = "bg-zinc-800/50 border-zinc-700/50 text-[clamp(14px,1vw,16px)] text-zinc-200 placeholder:text-zinc-600";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[clamp(11px,0.8vw,13px)] uppercase tracking-[0.1em] text-zinc-500">
      {children}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[clamp(10px,0.7vw,12px)] uppercase tracking-[0.1em] text-zinc-600">
      {children}
    </span>
  );
}

function ExpandableText({
  value,
  onChange,
  placeholder,
  minH,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  minH: string;
  maxLength?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          inputCls,
          !expanded && "line-clamp-3 max-h-[4.5em] overflow-hidden"
        )}
        style={{ minHeight: expanded ? minH : undefined }}
        maxLength={maxLength}
      />
      {value.length > 120 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 font-mono text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          {expanded ? "collapse" : "expand..."}
        </button>
      )}
    </div>
  );
}

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
    <div className="relative flex flex-col gap-[clamp(20px,1.8vw,36px)] overflow-hidden border border-border/30 rounded-lg bg-zinc-900/40 p-[clamp(20px,1.8vw,36px)] before:pointer-events-none before:absolute before:left-0 before:top-0 before:h-24 before:w-24 before:rounded-br-full before:bg-[radial-gradient(ellipse_at_top_left,rgba(230,62,0,0.12)_0%,transparent_70%)]">

      {/* ── IDENTITY ── */}
      <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)]">
        <SectionLabel>Identity</SectionLabel>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={draft.identity.displayName}
          onChange={(e) =>
            patch("identity", { ...draft.identity, displayName: e.target.value })
          }
          placeholder="Character name"
          className="!border-0 !bg-transparent !shadow-none px-2 font-mono text-[clamp(16px,1.2vw,22px)] uppercase tracking-widest text-zinc-100 focus-visible:!ring-0"
        />
        <div className="grid grid-cols-3 gap-[clamp(10px,0.8vw,16px)]">
          <div className="flex flex-col gap-1">
            <FieldLabel>Race</FieldLabel>
            <Input
              value={draft.profile.species}
              onChange={(e) => patch("profile", { ...draft.profile, species: e.target.value })}
              placeholder="e.g. Human"
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Gender</FieldLabel>
            <Input
              value={draft.profile.gender}
              onChange={(e) => patch("profile", { ...draft.profile, gender: e.target.value })}
              placeholder="e.g. Male"
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Age</FieldLabel>
            <Input
              value={draft.profile.ageText}
              onChange={(e) => patch("profile", { ...draft.profile, ageText: e.target.value })}
              placeholder="e.g. Young adult"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* ── PROFILE ── */}
      <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)]">
        <SectionLabel>Profile</SectionLabel>
        <div className="flex flex-col gap-1">
          <FieldLabel>Appearance</FieldLabel>
          <ExpandableText
            value={draft.profile.appearance}
            onChange={(v) => patch("profile", { ...draft.profile, appearance: v })}
            placeholder="Brief physical description..."
            minH="120px"
            maxLength={1000}
          />
        </div>
        <div className="grid gap-[clamp(16px,1.2vw,24px)] md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel>Background</FieldLabel>
            <ExpandableText
              value={draft.profile.backgroundSummary}
              onChange={(v) => patch("profile", { ...draft.profile, backgroundSummary: v })}
              placeholder="History, role, and context..."
              minH="120px"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Persona</FieldLabel>
            <ExpandableText
              value={draft.profile.personaSummary}
              onChange={(v) => patch("profile", { ...draft.profile, personaSummary: v })}
              placeholder="Temperament, voice, and default demeanor..."
              minH="120px"
            />
          </div>
        </div>
      </div>

      {/* ── CAPABILITIES ── */}
      <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)]">
        <SectionLabel>Capabilities</SectionLabel>
        <div className="grid gap-[clamp(16px,1.2vw,24px)] md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel>Traits</FieldLabel>
            <TagEditor
              tags={draft.capabilities.traits}
              onChange={(traits) => patch("capabilities", { ...draft.capabilities, traits })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Flaws</FieldLabel>
            <TagEditor
              tags={draft.capabilities.flaws}
              onChange={(flaws) => patch("capabilities", { ...draft.capabilities, flaws })}
            />
          </div>
        </div>
      </div>

      {/* ── MOTIVATIONS ── */}
      <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)]">
        <SectionLabel>Motivations</SectionLabel>
        <div className="grid gap-[clamp(16px,1.2vw,24px)] md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel>Drives</FieldLabel>
            <TagEditor
              tags={draft.motivations.drives}
              onChange={(drives) => patch("motivations", { ...draft.motivations, drives })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Frictions</FieldLabel>
            <TagEditor
              tags={draft.motivations.frictions}
              onChange={(frictions) => patch("motivations", { ...draft.motivations, frictions })}
            />
          </div>
        </div>
        <div className="grid gap-[clamp(16px,1.2vw,24px)] md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel>Short-term Goals</FieldLabel>
            <StringListEditor
              items={draft.motivations.shortTermGoals}
              onChange={(shortTermGoals) => patch("motivations", { ...draft.motivations, shortTermGoals })}
              placeholder="Add short-term goal..."
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Long-term Goals</FieldLabel>
            <StringListEditor
              items={draft.motivations.longTermGoals}
              onChange={(longTermGoals) => patch("motivations", { ...draft.motivations, longTermGoals })}
              placeholder="Add long-term goal..."
            />
          </div>
        </div>
      </div>

      {/* ── SOCIAL ── */}
      <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)]">
        <SectionLabel>Social</SectionLabel>
        <div className="flex flex-col gap-1">
          <FieldLabel>Social Status</FieldLabel>
          <p className="text-[clamp(11px,0.8vw,13px)] text-zinc-600">
            Reputation, role, and social positioning.
          </p>
          <TagEditor
            tags={draft.socialContext.socialStatus}
            onChange={(socialStatus) => patch("socialContext", { ...draft.socialContext, socialStatus })}
          />
        </div>
      </div>

      {/* ── STATUS ── */}
      <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)]">
        <SectionLabel>Status</SectionLabel>
        <div className="grid grid-cols-2 gap-[clamp(16px,1.2vw,24px)]">
          <div className="flex flex-col gap-1">
            <FieldLabel>HP</FieldLabel>
            <div className="flex items-center gap-1">
              {HP_OPTIONS.map((hp) => (
                <button
                  key={hp}
                  type="button"
                  onClick={() => patch("state", { ...draft.state, hp })}
                  className={`text-xl ${hp <= draft.state.hp ? "text-blood" : "text-zinc-700"}`}
                >
                  &#9829;
                </button>
              ))}
              <span className="ml-2 font-mono text-[13px] text-zinc-500">
                {draft.state.hp}/5
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>Starting Location</FieldLabel>
            <Select
              value={draft.socialContext.currentLocationName ?? ""}
              onValueChange={(currentLocationName: string) =>
                patch("socialContext", { ...draft.socialContext, currentLocationName, currentLocationId: null })
              }
            >
              <SelectTrigger className={cn("h-9", inputCls)}>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locationNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {personaTemplates.length > 0 && (
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-[clamp(12px,1vw,16px)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <FieldLabel>Persona Template</FieldLabel>
                <p className="mt-1 text-[clamp(11px,0.8vw,13px)] text-zinc-600">
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
            <Select
              value={selectedTemplateId || "__none__"}
              onValueChange={(value: string) => setSelectedTemplateId(value === "__none__" ? "" : value)}
            >
              <SelectTrigger className={cn("mt-3", inputCls)}>
                <SelectValue placeholder="Choose a persona template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No template</SelectItem>
                {personaTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* ── STARTING CONDITIONS ── */}
      <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)]">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>Starting Conditions</SectionLabel>
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
        <div className="flex flex-col gap-1">
          <FieldLabel>Starting Situation</FieldLabel>
          <p className="text-[clamp(11px,0.8vw,13px)] text-zinc-600">
            Describe where and in what conditions you want to appear.
          </p>
        </div>
        <Textarea
          value={draft.startConditions.sourcePrompt ?? ""}
          onChange={(e) => patch("startConditions", { ...draft.startConditions, sourcePrompt: e.target.value })}
          placeholder="I arrive at the station at dusk after a long climb, exhausted and carrying too much gear..."
          className={cn("min-h-[84px]", inputCls)}
        />
        <div className="grid gap-[clamp(10px,0.8vw,16px)] md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel>Arrival Mode</FieldLabel>
            <Input
              value={draft.startConditions.arrivalMode ?? ""}
              onChange={(e) => patch("startConditions", { ...draft.startConditions, arrivalMode: e.target.value })}
              placeholder="on-foot, escorted, hidden..."
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Visibility</FieldLabel>
            <Input
              value={draft.startConditions.startingVisibility ?? ""}
              onChange={(e) => patch("startConditions", { ...draft.startConditions, startingVisibility: e.target.value })}
              placeholder="noticed, expected, anonymous..."
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel>Immediate Situation</FieldLabel>
          <Textarea
            value={draft.startConditions.immediateSituation ?? ""}
            onChange={(e) => patch("startConditions", { ...draft.startConditions, immediateSituation: e.target.value })}
            placeholder="What is happening to the character at the exact opening moment?"
            className={cn("min-h-[72px]", inputCls)}
          />
        </div>
        <div className="grid gap-[clamp(10px,0.8vw,16px)] md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel>Entry Pressure</FieldLabel>
            <Input
              value={(draft.startConditions.entryPressure ?? []).join(", ")}
              onChange={(e) =>
                patch("startConditions", {
                  ...draft.startConditions,
                  entryPressure: e.target.value.split(",").map((v: string) => v.trim()).filter(Boolean),
                })
              }
              placeholder="late, cold, under watch..."
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Companions</FieldLabel>
            <Input
              value={(draft.startConditions.companions ?? []).join(", ")}
              onChange={(e) =>
                patch("startConditions", {
                  ...draft.startConditions,
                  companions: e.target.value.split(",").map((v: string) => v.trim()).filter(Boolean),
                })
              }
              placeholder="hound, porter, sibling..."
              className={inputCls}
            />
          </div>
        </div>
        {draft.startConditions.resolvedNarrative && (
          <p className="text-[13px] text-zinc-400 italic">
            {draft.startConditions.resolvedNarrative}
          </p>
        )}
      </div>

      {/* ── EQUIPMENT ── */}
      <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)]">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>Equipment</SectionLabel>
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
        <div className="flex flex-col gap-1">
          <FieldLabel>Equipped Items</FieldLabel>
          <p className="text-[clamp(11px,0.8vw,13px)] text-zinc-600">
            Manual edits stay draft-backed; preview asks the backend for the canonical starting kit.
          </p>
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
          <p className="font-mono text-[clamp(11px,0.8vw,13px)] text-zinc-500">
            Signature items: {loadoutToRender.signatureItems.join(", ")}
          </p>
        )}
        {previewLoadout && (
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3 text-[13px]">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400">Canonical preview</p>
            <p className="mt-1 text-zinc-500">
              Audit: {previewLoadout.audit.join(", ")}
            </p>
            {previewLoadout.items.length > 0 && (
              <ul className="mt-2 space-y-1 text-zinc-400">
                {previewLoadout.items.map((item) => (
                  <li key={`${item.slot}:${item.name}`}>
                    {item.name} ({item.slot}) — {item.reason}
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
