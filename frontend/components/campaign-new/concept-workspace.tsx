"use client";

import Link from "next/link";
import { Loader2, Play, Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCampaignNewFlow } from "@/components/campaign-new/flow-provider";
import { GenerationWorkspace } from "@/components/campaign-new/generation-workspace";
import { DnaSuggestionWorkspace } from "@/components/campaign-new/dna-suggestion-workspace";

interface ConceptWorkspaceProps {
  onContinue: () => Promise<void>;
}

export function ConceptWorkspace({ onContinue }: ConceptWorkspaceProps) {
  const w = useCampaignNewFlow();
  if (w.isGenerating) {
    return <GenerationWorkspace returnHref="/campaign/new" />;
  }
  if (w.isSuggesting && !w.dnaState) {
    return <DnaSuggestionWorkspace returnHref="/campaign/new" />;
  }

  const selectedWorldbookIds = new Set(w.selectedWorldbooks.map((item) => item.id));
  const missingCampaignName = w.campaignName.trim().length === 0;
  const missingPremise = w.campaignPremise.trim().length === 0 && !w.hasWorldbook;
  const conceptValidationMessage =
    missingCampaignName || missingPremise
      ? "Enter a campaign name and premise, or select a source, before continuing into DNA."
      : null;
  const activeProgressLabel = w.generationProgress?.label ?? (w.isSuggesting ? "Preparing World DNA suggestions..." : null);
  const activeProgressStep =
    w.generationProgress && w.generationProgress.totalSteps > 0
      ? `Step ${w.generationProgress.step + 1} of ${w.generationProgress.totalSteps}`
      : null;
  const activeSubLabel =
    w.generationProgress?.subStep !== undefined && w.generationProgress?.subTotal !== undefined
      ? `${w.generationProgress.subLabel ?? ""} (${w.generationProgress.subStep + 1}/${w.generationProgress.subTotal})`
      : null;
  const createLabel = w.isGenerating
    ? "Generating World..."
    : w.creatingCampaign
      ? "Creating Campaign..."
      : "Create World Now";
  const continueLabel = w.isSuggesting ? "Preparing DNA..." : "Continue to DNA";

  return (
    <div className="wf-forge-shell wf-v4-page-theater">
      <section className="wf-forge-main">
        <div className="wf-forge-head">
          <p className="wf-kicker wf-kicker-ember wf-forge-kicker">The forge</p>
          <h1 className="wf-display wf-serif-em mt-4 text-[clamp(48px,4.6vw,88px)]">
            Name a world. <em>State its law.</em>
          </h1>
        </div>

        <div className="wf-forge-steps">
          <ForgeStep number="i." title="Name">
            <Label htmlFor="campaign-name" className="sr-only">Campaign Name</Label>
            <Input
              id="campaign-name"
              value={w.campaignName}
              onChange={(event) => w.setCampaignName(event.target.value)}
              placeholder="Give your campaign a name"
              className="min-h-[54px] text-[clamp(19px,1.35vw,28px)]"
            />
          </ForgeStep>

          <ForgeStep
            number="ii."
            title="Premise"
            description="Describe setting, tensions, and what makes this campaign playable."
          >
            <Label htmlFor="campaign-premise" className="sr-only">Premise</Label>
            <Textarea
              id="campaign-premise"
              className="min-h-[220px] resize-y text-[clamp(16px,1vw,20px)] leading-8"
              value={w.campaignPremise}
              onChange={(event) => w.setCampaignPremise(event.target.value)}
              placeholder={
                w.hasWorldbook
                  ? "Describe your world (optional when selected worldbooks already carry context)..."
                  : "Describe your world: setting, tone, tensions, and what makes this campaign distinct."
              }
            />
          </ForgeStep>

          <ForgeStep number="iii." title="Franchise / IP" meta="optional" description="Optional source context for known worlds.">
            <Input
              id="campaign-franchise"
              value={w.campaignFranchise}
              onChange={(event) => w.setCampaignFranchise(event.target.value)}
              placeholder="e.g. The Witcher, Naruto, Star Wars..."
            />
            <div className="wf-set-row wf-research-row">
              <div>
                <div className="wf-set-row-h">Research Mode</div>
                <p className="wf-set-row-sub">
                  Let the backend research known-IP or source context during DNA/world generation.
                </p>
              </div>
              <button
                type="button"
                id="research-toggle"
                className="wf-set-toggle"
                data-on={w.researchEnabled ? "true" : "false"}
                aria-pressed={w.researchEnabled}
                aria-label="Toggle research mode"
                onClick={() => w.setResearchEnabled(!w.researchEnabled)}
              />
            </div>
          </ForgeStep>

          <ForgeStep
            number="iv."
            title="Sources"
            meta={`${w.selectedWorldbooks.length} selected`}
            description="Reusable worldbooks from the Library. Import accepts JSON today."
          >
            {w.worldbookLibraryLoading ? (
              <div className="wf-forge-progress">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading worldbooks...
              </div>
            ) : w.worldbookLibrary.length > 0 ? (
              <div className="wf-forge-sources">
                {w.worldbookLibrary.map((item) => (
                  <SourceItem
                    key={item.id}
                    name={item.displayName}
                    detail={`${item.entryCount} reusable entries`}
                    selected={selectedWorldbookIds.has(item.id)}
                    sigil={item.displayName.trim().charAt(0) || "W"}
                    onClick={() => w.toggleWorldbookSelection(item)}
                  />
                ))}
                <ImportSourceItem onUpload={w.handleWorldbookUpload} />
              </div>
            ) : (
              <div className="wf-forge-sources">
                <Link href="/library" className="wf-forge-source" data-on="false">
                  <span className="wf-forge-source-sigil">+</span>
                  <span>
                    <span className="wf-forge-source-name">Open Library</span>
                    <span className="wf-forge-source-role">Choose reusable worldbooks</span>
                  </span>
                  <span className="wf-forge-source-check" />
                </Link>
                <ImportSourceItem onUpload={w.handleWorldbookUpload} />
              </div>
            )}
            {w.worldbookError ? <p className="mt-4 text-sm text-red-400">{w.worldbookError}</p> : null}
          </ForgeStep>
        </div>

        <div className="wf-forge-cta">
          <button type="button" className="wf-v4-btn wf-v4-btn-primary" onClick={() => void w.handleCreateWithSeeds()} disabled={!w.canCreate}>
            {w.creatingCampaign || w.isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {createLabel}
          </button>
          <button type="button" className="wf-v4-btn" onClick={() => void onContinue()} disabled={!w.canCreate}>
            {w.isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {continueLabel}
          </button>
          <Link href="/" className="wf-v4-btn">
            Cancel
          </Link>
          <span className="wf-forge-cta-note">DNA can be edited before generation</span>
          {conceptValidationMessage ? (
            <span className="wf-forge-validation">{conceptValidationMessage}</span>
          ) : null}
          {activeProgressLabel ? (
            <span className="wf-forge-progress">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {activeProgressLabel}
              {activeProgressStep ? <span>{activeProgressStep}</span> : null}
              {activeSubLabel ? <span>{activeSubLabel}</span> : null}
            </span>
          ) : null}
          {w.generationError ? (
            <pre className="wf-forge-error">
              {w.generationError}
            </pre>
          ) : null}
        </div>
      </section>

      <aside className="wf-forge-side">
        <div className="wf-forge-sequence">
          <p className="wf-kicker wf-kicker-ember">Forge sequence</p>
          <div className="wf-stage-list">
            <SequenceItem number="i" state="active" label="Concept" detail="Name, premise, sources" />
            <SequenceItem number="ii" state="pending" label="World DNA" detail="Six real seed cards" />
            <SequenceItem number="iii" state="pending" label="World generation" detail="Backend pipeline" />
            <SequenceItem number="iv" state="pending" label="World Review" detail="Save before character" />
            <SequenceItem number="v" state="pending" label="Player character" detail="Player draft" />
          </div>
        </div>
      </aside>
    </div>
  );
}

function ForgeStep({
  number,
  title,
  meta,
  description,
  children,
}: {
  number: string;
  title: string;
  meta?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="wf-form-step">
      <div className="wf-form-step-num">{number}</div>
      <div className="min-w-0">
        <h2 className="wf-form-step-title">
          {title}
          {meta ? <span className="wf-form-step-meta">{meta}</span> : null}
        </h2>
        {description ? <p className="wf-prose mt-1 text-[15px] italic text-[var(--fg-2)]">{description}</p> : null}
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

function SequenceItem({
  number,
  state,
  label,
  detail,
}: {
  number: string;
  state: "done" | "active" | "pending";
  label: string;
  detail: string;
}) {
  return (
    <div className="wf-stage-row" data-state={state}>
      <div />
      <div>
        <div className="wf-stage-num">{number}</div>
        <div className="wf-stage-title">{label}</div>
        <div className="wf-stage-sub">{detail}</div>
      </div>
    </div>
  );
}

function SourceItem({
  name,
  detail,
  sigil,
  selected,
  onClick,
}: {
  name: string;
  detail: string;
  sigil: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="wf-forge-source" data-on={selected ? "true" : "false"} onClick={onClick}>
      <span className="wf-forge-source-sigil">{sigil.slice(0, 2)}</span>
      <span>
        <span className="wf-forge-source-name">{name}</span>
        <span className="wf-forge-source-role">{detail}</span>
      </span>
      <span className="wf-forge-source-check">{selected ? "✓" : ""}</span>
    </button>
  );
}

function ImportSourceItem({ onUpload }: { onUpload: (file: File) => Promise<void> | void }) {
  return (
    <label className="wf-forge-source cursor-pointer" data-on="false">
      <span className="wf-forge-source-sigil"><Plus className="h-3.5 w-3.5" /></span>
      <span>
        <span className="wf-forge-source-name">Import worldbook JSON</span>
        <span className="wf-forge-source-role">Adds to reusable Library</span>
      </span>
      <span className="wf-forge-source-check" />
      <input
        type="file"
        accept=".json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void onUpload(file);
          }
          event.target.value = "";
        }}
      />
    </label>
  );
}
