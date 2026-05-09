"use client";

import { useId, useState } from "react";
import type { CharacterPersonality } from "@worldforge/shared";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface PersonalitySectionProps {
  personality: CharacterPersonality | undefined;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function PersonalitySection({
  personality,
}: PersonalitySectionProps) {
  const detailsId = useId();
  const [open, setOpen] = useState(false);

  if (!personality) return null;

  const summary = personality.summary.trim();
  const voice = personality.voice.trim();
  const decisionStyle = personality.decisionStyle.trim();
  const worldview = personality.worldview.trim();
  const personalMythology = personality.personalMythology.trim();
  const sampleLines = personality.sampleLines.filter(hasText);
  const internalContradictions =
    personality.internalContradictions.filter(hasText);
  const hasDetails = Boolean(
    sampleLines.length > 0 ||
      decisionStyle ||
      worldview ||
      internalContradictions.length > 0 ||
      personalMythology,
  );
  const hasContent = Boolean(summary || voice || hasDetails);

  if (!hasContent) return null;

  return (
    <section
      aria-label="Personality"
      role="region"
      data-shell-region="personality"
      data-shell-surface="panel"
      className="flex flex-col gap-[clamp(10px,0.8vw,16px)] border-t border-zinc-800 pt-3"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[clamp(11px,0.8vw,13px)] uppercase tracking-[0.1em] text-zinc-500">
          Personality
        </span>
        {hasDetails ? (
          <button
            type="button"
            aria-controls={detailsId}
            aria-expanded={open}
            aria-label={open ? "Hide personality details" : "Show personality details"}
            onClick={() => setOpen((current) => !current)}
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[rgb(24,24,27)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:text-zinc-200"
          >
            Details
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
            />
          </button>
        ) : null}
      </div>

      {summary ? (
        <p className="text-sm leading-6 text-zinc-100">{summary}</p>
      ) : null}

      {voice ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
          Voice: {voice}
        </p>
      ) : null}

      {hasDetails && open ? (
        <div id={detailsId} className="space-y-4">
          {sampleLines.length > 0 ? (
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                Sample lines
              </div>
              <div className="space-y-2">
                {sampleLines.map((line) => (
                  <blockquote
                    key={line}
                    className="border-l border-zinc-700 bg-[rgb(24,24,27)] pl-3 italic text-zinc-200"
                  >
                    <span aria-hidden="true">&ldquo;</span>
                    <span>{line}</span>
                    <span aria-hidden="true">&rdquo;</span>
                  </blockquote>
                ))}
              </div>
            </div>
          ) : null}

          {decisionStyle ? (
            <p className="text-sm leading-6 text-zinc-200">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                Decision style:
              </span>{" "}
              {decisionStyle}
            </p>
          ) : null}

          {worldview ? (
            <p className="text-sm leading-6 text-zinc-200">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                Worldview:
              </span>{" "}
              {worldview}
            </p>
          ) : null}

          {internalContradictions.length > 0 ? (
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                Internal contradictions
              </div>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-200">
                {internalContradictions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {personalMythology ? (
            <p className="text-sm leading-6 text-zinc-200">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                Personal mythology:
              </span>{" "}
              {personalMythology}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
