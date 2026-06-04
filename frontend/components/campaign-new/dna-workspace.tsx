"use client";

import Link from "next/link";
import { ArrowLeft, Check, Loader2, Play, Wand2 } from "lucide-react";

import { WORLD_DNA_CARDS, seedValueToTextarea } from "@/components/title/utils";
import { useCampaignNewFlow } from "@/components/campaign-new/flow-provider";
import { collectEnabledSeeds } from "@/components/title/utils";
import { GenerationWorkspace } from "@/components/campaign-new/generation-workspace";
import { DnaSuggestionWorkspace } from "@/components/campaign-new/dna-suggestion-workspace";

const DNA_READY_STAGES = [
  { title: "Concept", detail: "name + sources" },
  { title: "World DNA", detail: "six seed cards" },
  { title: "World generation", detail: "backend pipeline" },
  { title: "World Review", detail: "save world" },
  { title: "Player character", detail: "player draft" },
] as const;

export function DnaWorkspace() {
  const w = useCampaignNewFlow();
  if (w.isGenerating) {
    return <GenerationWorkspace returnHref="/campaign/new/dna" />;
  }
  if (w.isSuggesting && !w.dnaState) {
    return <DnaSuggestionWorkspace returnHref="/campaign/new" />;
  }

  const hasUsableSeeds = collectEnabledSeeds(w.dnaState) !== undefined;
  const activeProgressLabel = w.generationProgress?.label ?? (w.isSuggesting ? "Generating World DNA suggestions..." : null);
  const activeProgressStep =
    w.generationProgress && w.generationProgress.totalSteps > 0
      ? `Step ${w.generationProgress.step + 1} of ${w.generationProgress.totalSteps}`
      : null;
  const activeSubLabel =
    w.generationProgress?.subStep !== undefined && w.generationProgress?.subTotal !== undefined
      ? `${w.generationProgress.subLabel ?? ""} (${w.generationProgress.subStep + 1}/${w.generationProgress.subTotal})`
      : null;
  const showCentralDnaLoader = w.isSuggesting && !w.dnaState;
  const showFooterProgress = Boolean(activeProgressLabel && !showCentralDnaLoader);
  const createLabel = w.isGenerating
    ? "Generating World..."
    : w.creatingCampaign
      ? "Creating Campaign..."
      : "Create World";
  const readyProgressRatio = w.isSuggesting ? 52 : hasUsableSeeds ? 100 : 18;
  const enabledCount = w.dnaState
    ? WORLD_DNA_CARDS.filter((item) => w.dnaState?.[item.category].enabled).length
    : 0;
  const sourceSummary = w.selectedWorldbooks.length > 0
    ? w.selectedWorldbooks.map((item) => item.displayName).join(" + ")
    : w.campaignFranchise.trim() || "No reusable source selected";

  return (
    <div className="wf-gen-shell wf-dna-edit-shell wf-v4-page-theater" data-testid="dna-edit-surface">
      <aside className="wf-gen-rail wf-gen-rail-dna wf-dna-edit-rail" aria-label="World DNA forge stages">
        <div className="wf-gen-rail-h">Forge</div>
        {DNA_READY_STAGES.map((stage, index) => {
          const state = index === 0 ? "done" : index === 1 ? "active" : "pending";
          return (
            <DnaPipelineStage
              key={stage.title}
              title={stage.title}
              detail={stage.detail}
              mark={index === 0 ? "done" : roman(index + 1)}
              state={state}
            />
          );
        })}
      </aside>

      <main className="wf-gen-main wf-dna-edit-main">
      <header className="wf-gen-head wf-dna-edit-head">
        <div>
          <p className="wf-gen-sub">World DNA - review</p>
          <h1 className="wf-gen-h">
            Six laws before the <em>world wakes.</em>
          </h1>
        </div>
        <div className="wf-gen-progress" aria-label="World DNA readiness">
          <div className="wf-gen-progress-bar">
            <div style={{ width: `${readyProgressRatio}%` }} />
          </div>
          <div className="wf-gen-progress-meta">
            <span>{enabledCount} of 6 seeds active</span>
            <span><b>{hasUsableSeeds ? "ready" : "empty"}</b></span>
          </div>
        </div>
      </header>

      {showCentralDnaLoader ? (
        <div className="wf-v4-card flex min-h-[360px] flex-col items-center justify-center gap-4 text-[var(--fg-2)]">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--ember-1)]" />
          <p className="font-serif text-2xl font-semibold text-[var(--fg)]">Generating World DNA suggestions...</p>
        </div>
      ) : w.dnaState ? (
        <>
          <section className="wf-gen-think wf-dna-context-panel" aria-label="World DNA context">
            <div className="wf-gen-think-mark" />
            <div>
              <div className="wf-gen-think-h">Seed source - {sourceSummary}</div>
              <p className="wf-gen-think-prose">
                <b>{w.campaignName || "Untitled world"}</b>
                {w.campaignPremise ? ` - ${w.campaignPremise}` : ""}
              </p>
            </div>
          </section>

          <section className="wf-gen-section wf-dna-seed-section">
            <div className="wf-gen-section-h">
              <span className="wf-gen-kicker">i</span>
              <h2 className="wf-gen-h2">World <em>DNA</em></h2>
              <span className="wf-gen-pill" data-state={w.isSuggesting ? "forging" : undefined}>
                {w.isSuggesting ? "rerolling" : "editable"}
              </span>
            </div>
            <div className="wf-dna-editor-grid">
              {WORLD_DNA_CARDS.map((item, index) => {
                const slot = w.dnaState![item.category];
                const isRerolling = w.suggestingCategory === item.category;

                return (
                  <article
                    key={item.category}
                    className="wf-dna-seed-card"
                    data-enabled={slot.enabled ? "true" : "false"}
                    data-busy={isRerolling ? "true" : "false"}
                  >
                    <div className="wf-dna-seed-head">
                      <div>
                        <div className="wf-dna-seed-code">D{String(index + 1).padStart(2, "0")}</div>
                        <h3 className="wf-dna-seed-title">{item.label}</h3>
                      </div>
                      <span className="wf-gen-tag">
                        {slot.enabled ? (slot.isCustom ? "custom" : "seed") : "muted"}
                      </span>
                    </div>

                    <textarea
                      className="wf-dna-seed-text"
                      value={seedValueToTextarea(slot.value)}
                      onChange={(event) => w.handleSeedTextChange(item.category, event.target.value)}
                      disabled={!slot.enabled}
                      aria-label={`${item.label} seed text`}
                      placeholder="Seed text"
                    />

                    <div className="wf-dna-seed-actions">
                      <button
                        type="button"
                        className="wf-dna-use-toggle"
                        data-on={slot.enabled ? "true" : "false"}
                        aria-pressed={slot.enabled}
                        onClick={() => w.handleSeedToggle(item.category, !slot.enabled)}
                      >
                        <span className="wf-dna-use-box" aria-hidden="true">
                          {slot.enabled ? <Check className="h-3 w-3" /> : null}
                        </span>
                        Use seed
                      </button>
                      <button
                        type="button"
                        className="wf-dna-card-action"
                        onClick={() => void w.handleResuggestCategory(item.category)}
                        disabled={!slot.enabled || w.isBusy || isRerolling}
                      >
                        {isRerolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                        Re-roll
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <div className="wf-v4-card flex min-h-[360px] flex-col items-center justify-center gap-4 px-8 text-center">
          <h2 className="font-serif text-3xl font-semibold text-[var(--fg)]">
            World DNA has not been prepared.
          </h2>
          <p className="wf-prose max-w-[58ch] text-[var(--fg-2)]">
            Return to concept and prepare suggestions, or start with manual seed cards after a generation error.
          </p>
          <button type="button" className="wf-v4-btn" onClick={() => w.handlePrepareManualDna()}>
            Start With Manual DNA
          </button>
        </div>
      )}

      {w.dnaState && !hasUsableSeeds && !w.isBusy ? (
        <div className="mt-5 border border-yellow-500/20 bg-yellow-500/[0.06] px-4 py-3 text-sm text-yellow-200/85">
          Add at least one enabled DNA seed before generating the world.
        </div>
      ) : null}

      <div className="wf-gen-actions wf-dna-actionbar">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Link href="/campaign/new" className="wf-v4-btn">
            <ArrowLeft className="h-4 w-4" />
            Back to Concept
          </Link>
          {showFooterProgress ? (
            <span className="flex items-center gap-2 text-xs text-[var(--fg-2)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {activeProgressLabel}
              {activeProgressStep ? <span>{activeProgressStep}</span> : null}
              {activeSubLabel ? <span>{activeSubLabel}</span> : null}
            </span>
          ) : null}
          {w.generationError ? (
            <pre className="max-h-24 max-w-[60vw] overflow-auto whitespace-pre-wrap border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-300 select-all">
              {w.generationError}
            </pre>
          ) : null}
        </div>
        <div className="wf-dna-actionbar-main">
          <button type="button" className="wf-v4-btn" onClick={() => void w.handleResuggestAll()} disabled={w.isBusy || !w.dnaState}>
            {w.isSuggesting && w.dnaState ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Re-roll All
          </button>
          <button type="button" className="wf-v4-btn wf-v4-btn-primary" onClick={() => void w.handleCreateWithDna()} disabled={w.isBusy || !w.dnaState || !hasUsableSeeds}>
            {(w.creatingCampaign || w.isGenerating) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {createLabel}
          </button>
        </div>
      </div>
      </main>
    </div>
  );
}

function DnaPipelineStage({
  title,
  detail,
  mark,
  state,
}: {
  title: string;
  detail: string;
  mark: string;
  state: "done" | "active" | "pending";
}) {
  return (
    <div className="wf-gen-stage" data-state={state}>
      <div className="wf-gen-stage-mark">
        {state === "done" ? <Check className="h-3 w-3" /> : state === "active" ? ">" : mark}
      </div>
      <div>
        <div className="wf-gen-stage-h">{title}</div>
        <div className="wf-gen-stage-sub">{detail}</div>
      </div>
    </div>
  );
}

function roman(value: number): string {
  return ["i", "ii", "iii", "iv", "v"][value - 1] ?? String(value);
}
