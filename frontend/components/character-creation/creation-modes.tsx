"use client";

import type { LucideIcon } from "lucide-react";
import { FileText, Sparkles, Upload, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Phase 61 — shared 4-mode creation selector.
 *
 * Both the player creation page and the world-review NPC tab consume this
 * atom so that the two surfaces expose the same modes: describe (parse),
 * AI-generate-from-scratch, research-archetype, and import-V2.
 *
 * Tab semantics: clicking the active mode again toggles it off (null) so the
 * consumer can reset the sub-form without navigating away.
 */
export type CreationMode = "parse" | "generate" | "research" | "import";

interface CreationModesProps {
  mode: CreationMode | null;
  onModeChange: (mode: CreationMode | null) => void;
  busy: boolean;
  disabledModes?: CreationMode[];
  labels?: Partial<Record<CreationMode, string>>;
}

const MODE_CONFIG: Record<CreationMode, { icon: LucideIcon; defaultLabel: string; ariaLabel: string }> = {
  parse: {
    icon: FileText,
    defaultLabel: "Describe",
    ariaLabel: "Describe character from free text",
  },
  generate: {
    icon: Sparkles,
    defaultLabel: "AI Generate",
    ariaLabel: "Generate character from scratch",
  },
  research: {
    icon: Wand2,
    defaultLabel: "Research Archetype",
    ariaLabel: "Research archetype and ground in canon",
  },
  import: {
    icon: Upload,
    defaultLabel: "Import V2 Card",
    ariaLabel: "Import SillyTavern V2/V3 card",
  },
};

const ORDERED_MODES: CreationMode[] = ["parse", "generate", "research", "import"];

export function CreationModes({
  mode,
  onModeChange,
  busy,
  disabledModes = [],
  labels = {},
}: CreationModesProps) {
  return (
    <div role="tablist" aria-label="Creation modes" className="flex flex-wrap gap-2">
      {ORDERED_MODES.map((m) => {
        const cfg = MODE_CONFIG[m];
        const Icon = cfg.icon;
        const isActive = mode === m;
        const isDisabled = busy || disabledModes.includes(m);
        return (
          <Button
            key={m}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={cfg.ariaLabel}
            variant={isActive ? "default" : "outline"}
            size="sm"
            disabled={isDisabled}
            onClick={() => onModeChange(isActive ? null : m)}
            className="font-mono text-[11px] uppercase tracking-[0.12em]"
          >
            <Icon className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {labels[m] ?? cfg.defaultLabel}
          </Button>
        );
      })}
    </div>
  );
}
