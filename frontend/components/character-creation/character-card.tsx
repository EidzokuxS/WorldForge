"use client";

import React, { useState, useEffect, useRef } from "react";
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

const inputCls = "bg-zinc-800 border-zinc-700 text-[clamp(14px,1vw,16px)] text-zinc-200 placeholder:text-zinc-600";

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

function CompactTextarea({
  value,
  onChange,
  placeholder,
  maxLength,
  minH,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength?: number;
  minH?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={minH ? { minHeight: minH } : undefined}
      className={cn(
        "min-h-[72px] w-full resize-y rounded-md border px-3 py-2 outline-none",
        "bg-zinc-800 border-zinc-700 text-[clamp(14px,1vw,16px)] text-zinc-200 placeholder:text-zinc-600",
        "focus-visible:border-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-600/50",
      )}
      maxLength={maxLength}
    />
  );
}

function formatCanonicalStatus(
  status: CharacterDraft["identity"]["canonicalStatus"],
): string {
  switch (status) {
    case "known_ip_canonical":
      return "Known IP Canonical";
    case "known_ip_diverged":
      return "Known IP Diverged";
    case "imported":
      return "Imported";
    default:
      return "Original";
  }
}

function getIdentityFidelitySummary(draft: CharacterDraft) {
  const selfImage = draft.identity.behavioralCore?.selfImage?.trim() ?? "";
  const activeGoals = (draft.identity.liveDynamics?.activeGoals ?? [])
    .map((goal) => goal.trim())
    .filter(Boolean)
    .slice(0, 2);
  const sourceLabels = Array.from(
    new Set(
      [
        ...(draft.sourceBundle?.canonSources ?? []),
        ...(draft.sourceBundle?.secondarySources ?? []),
      ]
        .map((citation) => citation.label.trim())
        .filter(Boolean),
    ),
  ).slice(0, 3);
  const continuityLabel = draft.continuity
    ? `${draft.continuity.identityInertia.charAt(0).toUpperCase()}${draft.continuity.identityInertia.slice(1)} continuity`
    : null;
  const changePressureNote = draft.continuity?.changePressureNotes?.find((note) => note.trim()) ?? null;
  const hasFidelitySignals = Boolean(
    draft.identity.canonicalStatus !== "original"
    || selfImage
    || activeGoals.length > 0
    || sourceLabels.length > 0
    || continuityLabel,
  );

  return {
    hasFidelitySignals,
    canonicalStatusLabel: formatCanonicalStatus(draft.identity.canonicalStatus),
    continuityLabel,
    selfImage,
    activeGoals,
    sourceLabels,
    changePressureNote,
  };
}

function CharacterCardInner({
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
  // Local draft state — edits happen here, debounced to parent
  const [local, setLocal] = useState<CharacterDraft>(draft);
  const onChangeRef = useRef(onChange);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Sync from parent when a new character arrives (parse/generate/import)
  useEffect(() => { setLocal(draft); }, [draft]);

  // Debounced propagation to parent
  function commitLocal(next: CharacterDraft) {
    setLocal(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { onChangeRef.current(next); }, 300);
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    draft.provenance.templateId ?? "",
  );
  const [customLocation, setCustomLocation] = useState<boolean>(
    () =>
      !!draft.socialContext.currentLocationName &&
      !locationNames.includes(draft.socialContext.currentLocationName),
  );

  function patch<K extends keyof CharacterDraft>(
    key: K,
    value: CharacterDraft[K],
  ) {
    commitLocal({ ...local, [key]: value });
  }

  const loadoutToRender = previewLoadout?.loadout ?? local.loadout;
  const identityFidelity = getIdentityFidelitySummary(local);

  return (
    <div className="flex flex-col gap-[clamp(20px,1.8vw,36px)] border border-border/30 rounded-lg bg-zinc-900 p-[clamp(20px,1.8vw,36px)]">

      {/* ── IDENTITY ── */}
      <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)]">
        <SectionLabel>Identity</SectionLabel>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={local.identity.displayName}
          onChange={(e) =>
            patch("identity", { ...local.identity, displayName: e.target.value })
          }
          placeholder="Character name"
          className="!border-0 !bg-transparent !shadow-none px-2 font-mono text-[clamp(16px,1.2vw,22px)] uppercase tracking-widest text-zinc-100 focus-visible:!ring-0"
        />
        <div className="grid grid-cols-3 gap-[clamp(10px,0.8vw,16px)]">
          <div className="flex flex-col gap-1">
            <FieldLabel>Race</FieldLabel>
            <Input
              value={local.profile.species}
              onChange={(e) => patch("profile", { ...local.profile, species: e.target.value })}
              placeholder="e.g. Human"
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Gender</FieldLabel>
            <Input
              value={local.profile.gender}
              onChange={(e) => patch("profile", { ...local.profile, gender: e.target.value })}
              placeholder="e.g. Male"
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Age</FieldLabel>
            <Input
              value={local.profile.ageText}
              onChange={(e) => patch("profile", { ...local.profile, ageText: e.target.value })}
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
          <CompactTextarea
            value={local.profile.appearance}
            onChange={(v) => patch("profile", { ...local.profile, appearance: v })}
            placeholder="Brief physical description..."            maxLength={1000}
          />
        </div>
        <div className="grid gap-[clamp(16px,1.2vw,24px)] md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel>Background</FieldLabel>
            <CompactTextarea
              value={local.profile.backgroundSummary}
              onChange={(v) => patch("profile", { ...local.profile, backgroundSummary: v })}
              placeholder="Where they come from and what brought them here..."
              minH="120px"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>First Impression</FieldLabel>
            <CompactTextarea
              value={local.profile.personaSummary}
              onChange={(v) => patch("profile", { ...local.profile, personaSummary: v })}
              placeholder="How others perceive them at first glance..."
              minH="120px"
            />
          </div>
        </div>
      </div>

      {identityFidelity.hasFidelitySignals && (
        <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)] rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-[clamp(12px,1vw,18px)]">
          <SectionLabel>Identity Fidelity</SectionLabel>
          <div className="grid gap-[clamp(10px,0.8vw,16px)] md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <FieldLabel>Canon Status</FieldLabel>
              <p className="text-[13px] text-zinc-300">
                {identityFidelity.canonicalStatusLabel}
              </p>
            </div>
            {identityFidelity.continuityLabel && (
              <div className="flex flex-col gap-1">
                <FieldLabel>Continuity</FieldLabel>
                <p className="text-[13px] text-zinc-300">
                  {identityFidelity.continuityLabel}
                </p>
              </div>
            )}
          </div>
          {identityFidelity.selfImage && (
            <div className="flex flex-col gap-1">
              <FieldLabel>Core Self-Image</FieldLabel>
              <p className="text-[13px] leading-6 text-zinc-300">
                {identityFidelity.selfImage}
              </p>
            </div>
          )}
          {identityFidelity.activeGoals.length > 0 && (
            <div className="flex flex-col gap-1">
              <FieldLabel>Live Identity Pressure</FieldLabel>
              <p className="text-[13px] text-zinc-300">
                {identityFidelity.activeGoals.join(" · ")}
              </p>
            </div>
          )}
          {identityFidelity.sourceLabels.length > 0 && (
            <div className="flex flex-col gap-1">
              <FieldLabel>Source Signals</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {identityFidelity.sourceLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-zinc-700/60 px-2 py-1 text-[12px] text-zinc-400"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {identityFidelity.changePressureNote && (
            <p className="text-[12px] text-zinc-500">
              {identityFidelity.changePressureNote}
            </p>
          )}
        </div>
      )}

      {/* ── CAPABILITIES ── */}
      <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)]">
        <SectionLabel>Capabilities</SectionLabel>
        <div className="grid gap-[clamp(16px,1.2vw,24px)] md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel>Traits</FieldLabel>
            <TagEditor
              tags={local.capabilities.traits}
              onChange={(traits) => patch("capabilities", { ...local.capabilities, traits })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Flaws</FieldLabel>
            <TagEditor
              tags={local.capabilities.flaws}
              onChange={(flaws) => patch("capabilities", { ...local.capabilities, flaws })}
            />
          </div>
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
                  onClick={() => patch("state", { ...local.state, hp })}
                  className={`text-xl ${hp <= local.state.hp ? "text-blood" : "text-zinc-700"}`}
                >
                  &#9829;
                </button>
              ))}
              <span className="ml-2 font-mono text-[13px] text-zinc-500">
                {local.state.hp}/5
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>Starting Location</FieldLabel>
            <Select
              value={customLocation ? "__custom__" : (local.socialContext.currentLocationName ?? "")}
              onValueChange={(value: string) => {
                if (value === "__custom__") {
                  setCustomLocation(true);
                  patch("socialContext", {
                    ...local.socialContext,
                    currentLocationName: "",
                    currentLocationId: null,
                  });
                } else {
                  setCustomLocation(false);
                  patch("socialContext", {
                    ...local.socialContext,
                    currentLocationName: value,
                    currentLocationId: null,
                  });
                }
              }}
            >
              <SelectTrigger className={cn("h-9", inputCls)}>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locationNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
                <SelectItem value="__custom__">Custom...</SelectItem>
              </SelectContent>
            </Select>
            {customLocation && (
              <Input
                value={local.socialContext.currentLocationName ?? ""}
                onChange={(e) =>
                  patch("socialContext", {
                    ...local.socialContext,
                    currentLocationName: e.target.value,
                    currentLocationId: null,
                  })
                }
                placeholder="Type custom location name..."
                className={cn("mt-1", inputCls)}
              />
            )}
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
        <textarea
          value={local.startConditions.sourcePrompt ?? ""}
          onChange={(e) => patch("startConditions", { ...local.startConditions, sourcePrompt: e.target.value })}
          placeholder="I arrive at the station at dusk after a long climb, exhausted and carrying too much gear..."
          className="min-h-[84px] w-full resize-y rounded-md border bg-zinc-800 border-zinc-700 px-3 py-2 text-[clamp(14px,1vw,16px)] text-zinc-200 placeholder:text-zinc-600 outline-none focus-visible:border-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-600/50"
        />
        <div className="grid gap-[clamp(10px,0.8vw,16px)] md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel>Arrival Mode</FieldLabel>
            <Input
              value={local.startConditions.arrivalMode ?? ""}
              onChange={(e) => patch("startConditions", { ...local.startConditions, arrivalMode: e.target.value })}
              placeholder="on-foot, escorted, hidden..."
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Visibility</FieldLabel>
            <Input
              value={local.startConditions.startingVisibility ?? ""}
              onChange={(e) => patch("startConditions", { ...local.startConditions, startingVisibility: e.target.value })}
              placeholder="noticed, expected, anonymous..."
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel>Immediate Situation</FieldLabel>
          <textarea
            value={local.startConditions.immediateSituation ?? ""}
            onChange={(e) => patch("startConditions", { ...local.startConditions, immediateSituation: e.target.value })}
            placeholder="What is happening to the character at the exact opening moment?"
            className="min-h-[72px] w-full resize-y rounded-md border bg-zinc-800 border-zinc-700 px-3 py-2 text-[clamp(14px,1vw,16px)] text-zinc-200 placeholder:text-zinc-600 outline-none focus-visible:border-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-600/50"
          />
        </div>
        <div className="grid gap-[clamp(10px,0.8vw,16px)] md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel>Entry Pressure</FieldLabel>
            <Input
              value={(local.startConditions.entryPressure ?? []).join(", ")}
              onChange={(e) =>
                patch("startConditions", {
                  ...local.startConditions,
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
              value={(local.startConditions.companions ?? []).join(", ")}
              onChange={(e) =>
                patch("startConditions", {
                  ...local.startConditions,
                  companions: e.target.value.split(",").map((v: string) => v.trim()).filter(Boolean),
                })
              }
              placeholder="hound, porter, sibling..."
              className={inputCls}
            />
          </div>
        </div>
        {local.startConditions.resolvedNarrative && (
          <p className="text-[13px] text-zinc-400 italic">
            {local.startConditions.resolvedNarrative}
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
                ...local.loadout,
                inventorySeed:
                  local.loadout.inventorySeed.length > 0
                    ? local.loadout.inventorySeed
                    : equippedItemRefs,
                equippedItemRefs,
                signatureItems:
                  local.loadout.signatureItems.length > 0
                    ? local.loadout.signatureItems
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

export const CharacterCard = React.memo(CharacterCardInner);
