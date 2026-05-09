"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { WORLD_DNA_CARDS } from "@/components/title/utils";
import { useCampaignNewFlow } from "@/components/campaign-new/flow-provider";

const DNA_PREP_STAGES = [
  { title: "Concept locked", detail: "name and premise" },
  { title: "Source context", detail: "research and worldbooks" },
  { title: "Seed draft", detail: "six DNA cards" },
  { title: "Coherence pass", detail: "canon and premise fit" },
  { title: "Ready to edit", detail: "player review" },
] as const;

type DnaSuggestionWorkspaceProps = {
  returnHref: string;
};

export function DnaSuggestionWorkspace({ returnHref }: DnaSuggestionWorkspaceProps) {
  const w = useCampaignNewFlow();
  const [startedAt] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(() => Date.now());
  const activeIndex = needsSourcePass(w) ? 1 : 2;
  const elapsed = formatElapsed(now - startedAt);
  const sourceSummary = formatSources(w.selectedWorldbooks, w.campaignFranchise, w.researchEnabled);
  const activeTitle = DNA_PREP_STAGES[activeIndex]?.title ?? "Seed draft";
  const activeDetail =
    activeIndex === 1
      ? sourceSummary
      : "Drafting six editable World DNA cards from the locked concept.";

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="wf-gen-shell wf-gen-shell-dna wf-v4-page-theater" data-testid="dna-suggestion-surface">
      <aside className="wf-gen-rail wf-gen-rail-dna" aria-label="World DNA preparation stages">
        <div className="wf-gen-rail-h">DNA</div>
        {DNA_PREP_STAGES.map((stage, index) => {
          const state = index === 0 ? "done" : index === activeIndex ? "active" : "pending";
          return (
            <div key={stage.title} className="wf-gen-stage" data-state={state}>
              <div className="wf-gen-stage-mark">
                {state === "done" ? <Check className="h-3 w-3" /> : state === "active" ? ">" : roman(index + 1)}
              </div>
              <div>
                <div className="wf-gen-stage-h">{stage.title}</div>
                <div className="wf-gen-stage-sub">{stage.detail}</div>
              </div>
            </div>
          );
        })}
      </aside>

      <main className="wf-gen-main">
        <header className="wf-gen-head">
          <div>
            <p className="wf-gen-sub">World DNA - preparing suggestions</p>
            <h1 className="wf-gen-h">Preparing <em>World DNA.</em></h1>
          </div>
          <div className="wf-gen-progress" aria-label="World DNA preparation progress">
            <div className="wf-gen-progress-bar">
              <div style={{ width: activeIndex === 1 ? "34%" : "52%" }} />
            </div>
            <div className="wf-gen-progress-meta">
              <span>{activeTitle}</span>
              <span><b>{elapsed}</b> elapsed</span>
            </div>
          </div>
        </header>

        <section className="wf-gen-think" aria-label="Current DNA preparation work">
          <div className="wf-gen-think-mark" />
          <div>
            <div className="wf-gen-think-h">Engine - {activeTitle}</div>
            <p className="wf-gen-think-prose">
              {activeDetail}
              <span className="wf-gen-cursor" />
            </p>
          </div>
        </section>

        <section className="wf-gen-section">
          <div className="wf-gen-section-h">
            <span className="wf-gen-kicker">i</span>
            <h2 className="wf-gen-h2">Concept <em>input</em></h2>
            <span className="wf-gen-pill">locked</span>
          </div>
          <div className="wf-gen-dna wf-gen-dna-compact">
            <article className="wf-gen-dna-card">
              <div className="wf-gen-dna-card-k">Campaign</div>
              <div className="wf-gen-dna-card-v">{w.campaignName || "Untitled world"}</div>
            </article>
            <article className="wf-gen-dna-card">
              <div className="wf-gen-dna-card-k">Premise</div>
              <div className="wf-gen-dna-card-v">{w.campaignPremise || "Premise carried by selected sources."}</div>
            </article>
            <article className="wf-gen-dna-card">
              <div className="wf-gen-dna-card-k">Source context</div>
              <div className="wf-gen-dna-card-v">{sourceSummary}</div>
            </article>
          </div>
        </section>

        <section className="wf-gen-section">
          <div className="wf-gen-section-h">
            <span className="wf-gen-kicker">ii</span>
            <h2 className="wf-gen-h2">Six <em>seed cards</em></h2>
            <span className="wf-gen-pill" data-state="forging">generating</span>
          </div>
          <div className="wf-gen-locs wf-gen-seed-slots">
            {WORLD_DNA_CARDS.map((card, index) => (
              <article key={card.category} className="wf-gen-loc" data-state={index === 0 ? "forging" : "queued"}>
                <div className="wf-gen-loc-num">{String(index + 1).padStart(2, "0")}</div>
                <div className="wf-gen-loc-h">{card.label}</div>
                <div className="wf-gen-loc-sub">Awaiting generated rule.</div>
                <div className="wf-gen-loc-tag">
                  <span className="wf-gen-tag">{index === 0 ? "active" : "queued"}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="wf-gen-section">
          <div className="wf-gen-trace">
            <div className="wf-gen-trace-h">Request trace</div>
            <div className="wf-gen-trace-body">
              <div className="wf-gen-trace-line" data-kind="info">
                <span className="wf-gen-trace-ts">01</span>
                <span>Concept locked for DNA suggestion.</span>
              </div>
              <div className="wf-gen-trace-line" data-kind="active">
                <span className="wf-gen-trace-ts">02</span>
                <span>Waiting for backend seed suggestions.</span>
              </div>
            </div>
          </div>
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

function needsSourcePass(w: ReturnType<typeof useCampaignNewFlow>): boolean {
  return w.selectedWorldbooks.length > 0 || w.researchEnabled || w.campaignFranchise.trim().length > 0;
}

function formatSources(
  worldbooks: Array<{ displayName: string }>,
  franchise: string,
  researchEnabled: boolean,
): string {
  if (worldbooks.length > 0) {
    return worldbooks.map((item) => item.displayName).join(", ");
  }
  const cleanFranchise = franchise.trim();
  if (cleanFranchise && researchEnabled) {
    return `Researching source context for ${cleanFranchise}.`;
  }
  if (cleanFranchise) {
    return cleanFranchise;
  }
  return researchEnabled ? "Interpreting source context from the premise." : "No external source context selected.";
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

function roman(value: number): string {
  const numerals = ["i", "ii", "iii", "iv", "v"];
  return numerals[value - 1] ?? String(value);
}
