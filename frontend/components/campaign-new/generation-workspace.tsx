"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import type { GenerationProgress } from "@/lib/api";
import { WORLD_DNA_CARDS, seedValueToTextarea } from "@/components/title/utils";
import { useCampaignNewFlow } from "@/components/campaign-new/flow-provider";

const WORLDGEN_STAGES = [
  { title: "Premise", detail: "concept pass" },
  { title: "Locations", detail: "world map" },
  { title: "Location check", detail: "judge pass" },
  { title: "Factions", detail: "power groups" },
  { title: "Faction check", detail: "judge pass" },
  { title: "Characters", detail: "cast and goals" },
  { title: "Placement", detail: "scene presence" },
  { title: "Cast check", detail: "judge pass" },
  { title: "Cross-checks", detail: "consistency pass" },
  { title: "Lore", detail: "world memory" },
] as const;

type GenerationWorkspaceProps = {
  returnHref: string;
};

export function GenerationWorkspace({ returnHref }: GenerationWorkspaceProps) {
  const w = useCampaignNewFlow();
  const progress = w.generationProgress;
  const totalSteps = Math.max(progress?.totalSteps ?? WORLDGEN_STAGES.length, WORLDGEN_STAGES.length);
  const activeIndex = clamp(progress?.step ?? 0, 0, totalSteps - 1);
  const progressPercent = getProgressPercent(progress, totalSteps);
  const activeStage = WORLDGEN_STAGES[activeIndex] ?? { title: `Stage ${activeIndex + 1}`, detail: "backend stage" };
  const activeTitle = normalizeProgressLabel(progress?.label) ?? activeStage.title;
  const activeSubLabel = getSubLabel(progress);
  const [startedAt] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(() => Date.now());
  const [history, setHistory] = React.useState<GenerationProgress[]>(() => progress ? [progress] : []);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!progress) {
      return;
    }
    setHistory((current) => {
      const last = current[current.length - 1];
      if (
        last
        && last.step === progress.step
        && last.totalSteps === progress.totalSteps
        && last.label === progress.label
        && last.subStep === progress.subStep
        && last.subTotal === progress.subTotal
        && last.subLabel === progress.subLabel
      ) {
        return current;
      }
      return [...current.slice(-7), progress];
    });
  }, [progress]);

  return (
    <div className="wf-gen-shell wf-v4-page-theater" data-testid="worldgen-surface">
      <aside className="wf-gen-rail" aria-label="World generation stages">
        <div className="wf-gen-rail-h">Stages</div>
        {Array.from({ length: totalSteps }, (_, index) => {
          const stage = WORLDGEN_STAGES[index] ?? { title: `Stage ${index + 1}`, detail: "backend stage" };
          const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
          return (
            <div key={`${stage.title}-${index}`} className="wf-gen-stage" data-state={state}>
              <div className="wf-gen-stage-mark">
                {state === "done" ? <Check className="h-3 w-3" /> : state === "active" ? ">" : roman(index + 1)}
              </div>
              <div>
                <div className="wf-gen-stage-h">{stage.title}</div>
                <div className="wf-gen-stage-sub">
                  {stage.detail}
                </div>
              </div>
            </div>
          );
        })}
      </aside>

      <main className="wf-gen-main">
        <header className="wf-gen-head">
          <div>
            <p className="wf-gen-sub">Forging - step {activeIndex + 1} of {totalSteps}</p>
            <h1 className="wf-gen-h">{renderHeadline(activeTitle)}</h1>
          </div>
          <div className="wf-gen-progress" aria-label="World generation progress">
            <div className="wf-gen-progress-bar">
              <div style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="wf-gen-progress-meta">
              <span>{Math.round(progressPercent)}% complete</span>
              <span><b>{formatElapsed(now - startedAt)}</b> elapsed</span>
            </div>
          </div>
        </header>

        <section className="wf-gen-think" aria-label="Current generation work">
          <div className="wf-gen-think-mark" />
          <div>
            <div className="wf-gen-think-h">Engine - {activeTitle}</div>
            <p className="wf-gen-think-prose">
              {activeSubLabel ?? "WorldForge is building the campaign scaffold from the current concept, DNA, sources, and generator settings."}
              <span className="wf-gen-cursor" />
            </p>
          </div>
        </section>

        {w.dnaState ? (
          <section className="wf-gen-section">
            <div className="wf-gen-section-h">
              <span className="wf-gen-kicker">i</span>
              <h2 className="wf-gen-h2">World <em>DNA</em></h2>
              <span className="wf-gen-pill">locked</span>
            </div>
            <div className="wf-gen-dna">
              {WORLD_DNA_CARDS.map((card) => {
                const slot = w.dnaState?.[card.category];
                return (
                  <article key={card.category} className="wf-gen-dna-card" data-enabled={slot?.enabled ? "true" : "false"}>
                    <div className="wf-gen-dna-card-k">{card.label}</div>
                    <div className="wf-gen-dna-card-v">{slot ? seedValueToTextarea(slot.value) : "Waiting for seed."}</div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="wf-gen-section">
            <div className="wf-gen-section-h">
              <span className="wf-gen-kicker">i</span>
              <h2 className="wf-gen-h2">Concept <em>input</em></h2>
              <span className="wf-gen-pill">locked</span>
            </div>
            <div className="wf-gen-dna">
              <article className="wf-gen-dna-card">
                <div className="wf-gen-dna-card-k">Campaign</div>
                <div className="wf-gen-dna-card-v">{w.campaignName || "Untitled world"}</div>
              </article>
              <article className="wf-gen-dna-card">
                <div className="wf-gen-dna-card-k">Premise</div>
                <div className="wf-gen-dna-card-v">{w.campaignPremise || "Premise carried by selected sources."}</div>
              </article>
              <article className="wf-gen-dna-card">
                <div className="wf-gen-dna-card-k">Sources</div>
                <div className="wf-gen-dna-card-v">{formatSources(w.selectedWorldbooks)}</div>
              </article>
            </div>
          </section>
        )}

        <section className="wf-gen-section">
          <details className="wf-gen-trace" data-testid="engine-trace">
            <summary className="wf-gen-trace-h">
              <span>Engine trace</span>
              <span>{history.length > 0 ? `${history.length} backend events` : "waiting"}</span>
            </summary>
            <div className="wf-gen-trace-body">
              {history.length > 0 ? history.map((item, index) => (
                <div key={`${item.step}-${item.label}-${index}`} className="wf-gen-trace-line" data-kind={index === history.length - 1 ? "active" : "info"}>
                  <span className="wf-gen-trace-ts">{String(index + 1).padStart(2, "0")}</span>
                  <span>
                    [{item.step + 1}/{item.totalSteps}] {item.label}
                    {getSubLabel(item) ? ` - ${getSubLabel(item)}` : ""}
                  </span>
                </div>
              )) : (
                <div className="wf-gen-trace-line" data-kind="active">
                  <span className="wf-gen-trace-ts">01</span>
                  <span>Waiting for first backend progress event.</span>
                </div>
              )}
            </div>
          </details>
        </section>

        {w.generationError ? (
          <section className="wf-gen-section">
            <pre className="wf-forge-error">{w.generationError}</pre>
          </section>
        ) : null}

        <div className="wf-gen-actions">
          <Link href={returnHref} className="wf-v4-btn">Edit inputs</Link>
        </div>
      </main>
    </div>
  );
}

function getProgressPercent(progress: GenerationProgress | null, totalSteps: number): number {
  if (!progress) {
    return 8;
  }
  const stagePart = clamp(progress.step, 0, totalSteps - 1) / totalSteps;
  const subPart =
    progress.subStep !== undefined && progress.subTotal !== undefined && progress.subTotal > 0
      ? clamp(progress.subStep + 1, 0, progress.subTotal) / progress.subTotal / totalSteps
      : 1 / totalSteps;
  return clamp((stagePart + subPart) * 100, 4, 100);
}

function getSubLabel(progress: GenerationProgress | null): string | null {
  if (!progress) {
    return null;
  }
  if (progress.subStep !== undefined && progress.subTotal !== undefined) {
    const label = progress.subLabel?.trim();
    const prefix = label ? `${label} - ` : "";
    return `${prefix}${progress.subStep + 1} of ${progress.subTotal}`;
  }
  return null;
}

function normalizeProgressLabel(label: string | undefined): string | null {
  const clean = label?.trim().replace(/\.+$/, "");
  return clean && clean.length > 0 ? clean : null;
}

function renderHeadline(label: string): React.ReactNode {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return <><em>{label}.</em></>;
  }
  const last = words.pop();
  return <>{words.join(" ")} <em>{last}.</em></>;
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) {
    return `${rest}s`;
  }
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function formatSources(items: Array<{ displayName: string }>): string {
  if (items.length === 0) {
    return "No reusable sources selected.";
  }
  return items.map((item) => item.displayName).join(", ");
}

function roman(value: number): string {
  const numerals = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
  return numerals[value - 1] ?? String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
