"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  GitBranch,
  Loader2,
  Save,
  Upload,
  UserRound,
} from "lucide-react";
import type { CampaignKernel, CampaignWorldDna, CharacterDraft } from "@worldforge/shared";

import { loadCampaign, type CampaignMeta } from "@/lib/api";
import {
  composeCampaignGraph,
  importPlayerCard,
  loadCampaignKernel,
  parsePlayerCharacterDraft,
  savePlayerCast,
} from "@/lib/campaign-kernel-api";
import { getErrorMessage } from "@/lib/settings";
import { parseV2CardFile as parseCharacterCardFile } from "@/lib/v2-card-parser";
import type { CharacterImportMode } from "@/lib/types";

type WorldDnaSummaryRow = {
  code: string;
  label: string;
  value: string;
};

type WorldDnaStatus = "Ready" | "No DNA" | "Locked";
type StageState = "done" | "active" | "pending";

const WORLD_DNA_FIELDS: Array<{
  key: keyof CampaignWorldDna;
  label: string;
}> = [
  { key: "geography", label: "Geography" },
  { key: "politicalStructure", label: "Political structure" },
  { key: "centralConflict", label: "Central conflict" },
  { key: "culturalFlavor", label: "Cultural flavor" },
  { key: "environment", label: "Environment" },
  { key: "wildcard", label: "Wildcard" },
];

function characterNodeIsPresent(kernel: CampaignKernel): boolean {
  return kernel.worldGraph.nodes.some((node) => node.type === "Character");
}

function worldDnaStatus(kernel: CampaignKernel): WorldDnaStatus {
  if (kernel.worldDna) {
    return "Ready";
  }
  return kernel.phase === "draft" || kernel.phase === "world_ready" ? "No DNA" : "Locked";
}

function worldDnaRows(worldDna: CampaignWorldDna): WorldDnaSummaryRow[] {
  return WORLD_DNA_FIELDS.map((field, index) => ({
    code: `D${String(index + 1).padStart(2, "0")}`,
    label: field.label,
    value: worldDna[field.key],
  }));
}

function FormStep({
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
  state: StageState;
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

function RailMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="wf-campaign-forge-metric">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function CharacterDraftPreview({ draft }: { draft: CharacterDraft }) {
  return (
    <div className="wf-campaign-forge-preview">
      <div className="flex items-center gap-2">
        <UserRound className="h-4 w-4 text-[var(--ember-1)]" />
        <h3>{draft.identity.displayName || "Unnamed character"}</h3>
      </div>
      <p>
        {draft.identity.personality?.summary
          || draft.profile.personaSummary
          || draft.profile.backgroundSummary
          || "Draft is ready for review."}
      </p>
      <div className="wf-campaign-forge-preview-meta">
        <span>role: {draft.identity.role}</span>
        <span>tier: {draft.identity.tier}</span>
        {draft.socialContext.currentLocationName ? (
          <span>start: {draft.socialContext.currentLocationName}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function CampaignForgePage(props: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(props.params);
  const [campaign, setCampaign] = useState<CampaignMeta | null>(null);
  const [kernel, setKernel] = useState<CampaignKernel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [graphBusy, setGraphBusy] = useState(false);
  const [characterMode, setCharacterMode] = useState<"describe" | "import">("describe");
  const [concept, setConcept] = useState("");
  const [overrideText, setOverrideText] = useState("");
  const [importMode, setImportMode] = useState<CharacterImportMode>("native");
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [draftSource, setDraftSource] = useState<"player_created" | "player_imported">("player_created");
  const [characterBusy, setCharacterBusy] = useState<"idle" | "parsing" | "importing" | "saving">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLoadError(null);
    setActionError(null);
    void Promise.all([
      loadCampaign(campaignId),
      loadCampaignKernel(campaignId),
    ])
      .then(([loaded, kernelResponse]) => {
        if (!cancelled) {
          setCampaign(loaded);
          setKernel(kernelResponse.kernel);
        }
      })
      .catch((loadFailure) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(loadFailure, "Failed to load campaign forge."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  async function handleDescribe() {
    const trimmedConcept = concept.trim();
    if (!trimmedConcept || characterBusy !== "idle") {
      return;
    }

    setCharacterBusy("parsing");
    setActionError(null);
    try {
      const result = await parsePlayerCharacterDraft(campaignId, {
        concept: trimmedConcept,
        ...(overrideText.trim() ? { overrideText: overrideText.trim() } : {}),
      });
      setDraft(result.draft);
      setDraftSource("player_created");
    } catch (parseFailure) {
      setActionError(getErrorMessage(parseFailure, "Failed to create player draft."));
    } finally {
      setCharacterBusy("idle");
    }
  }

  async function handleImport(file: File) {
    if (characterBusy !== "idle") {
      return;
    }

    setCharacterBusy("importing");
    setActionError(null);
    try {
      const card = await parseCharacterCardFile(file);
      const result = await importPlayerCard(
        campaignId,
        card,
        {
          importMode,
          ...(overrideText.trim() ? { overrideText: overrideText.trim() } : {}),
        },
      );
      setDraft(result.draft);
      setDraftSource("player_imported");
    } catch (importFailure) {
      setActionError(getErrorMessage(importFailure, "Failed to import player draft."));
    } finally {
      setCharacterBusy("idle");
    }
  }

  async function handleSavePlayer() {
    if (!draft || characterBusy !== "idle") {
      return;
    }

    setCharacterBusy("saving");
    setActionError(null);
    try {
      const result = await savePlayerCast(campaignId, {
        draft,
        source: draftSource,
      });
      setKernel(result.kernel);
    } catch (saveFailure) {
      setActionError(getErrorMessage(saveFailure, "Failed to save player cast."));
    } finally {
      setCharacterBusy("idle");
    }
  }

  async function handleComposeGraph() {
    if (!kernel?.castRegistry.playerCharacter || kernel.phase !== "cast_ready" || characterNodeIsPresent(kernel) || graphBusy) {
      return;
    }

    setGraphBusy(true);
    setActionError(null);
    try {
      const result = await composeCampaignGraph(campaignId);
      setKernel(result.kernel);
    } catch (composeFailure) {
      setActionError(getErrorMessage(composeFailure, "Failed to compose graph."));
    } finally {
      setGraphBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center text-[var(--fg-2)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading forge...
      </main>
    );
  }

  if (loadError || !campaign || !kernel) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <h1 className="font-serif text-3xl font-semibold text-[var(--fg)]">Forge failed</h1>
        <p className="text-sm text-red-300">{loadError ?? "Campaign was not loaded."}</p>
        <Link href="/campaign/new" className="wf-v4-btn w-fit">
          Start draft
        </Link>
      </main>
    );
  }

  const savedPlayer = kernel.castRegistry.playerCharacter;
  const isCharacterBusy = characterBusy !== "idle";
  const currentWorldDnaStatus = worldDnaStatus(kernel);
  const graphReady = characterNodeIsPresent(kernel);
  const canComposeGraph = Boolean(savedPlayer) && kernel.phase === "cast_ready" && !graphReady && !graphBusy;
  const worldDnaStage: StageState = currentWorldDnaStatus === "Ready" ? "done" : "active";
  const playerStage: StageState = savedPlayer ? "done" : "active";
  const graphStage: StageState = graphReady ? "done" : savedPlayer ? "active" : "pending";

  return (
    <main className="wf-forge-shell wf-v4-page-theater" data-testid="campaign-forge">
      <section className="wf-forge-main">
        <header className="wf-forge-head">
          <p className="wf-kicker wf-kicker-ember wf-forge-kicker">Campaign Forge</p>
          <h1 className="wf-display wf-serif-em mt-4">
            {campaign.name}
          </h1>
          <p className="wf-prose mt-4 max-w-[68ch] text-[var(--fg-2)]">
            {kernel.premise || campaign.premise || "No premise set yet."}
          </p>
        </header>

        {actionError ? (
          <section className="mx-14 mt-6 border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            {actionError}
          </section>
        ) : null}

        <div className="wf-forge-steps">
          <FormStep
            number="i."
            title="World DNA"
            meta={currentWorldDnaStatus}
            description={
              kernel.worldDna
                ? "Accepted DNA from campaign creation. Player drafts use this context."
                : "This campaign was created without World DNA. Player drafts use the premise."
            }
          >
            <div className="wf-campaign-forge-dna-summary" data-testid="world-dna-panel">
              {kernel.worldDna ? (
                <div className="wf-campaign-forge-dna-list" role="list" aria-label="Accepted World DNA">
                  {worldDnaRows(kernel.worldDna).map((row) => (
                    <article className="wf-campaign-forge-dna-card" role="listitem" key={row.label}>
                      <div className="wf-campaign-forge-dna-card-head">
                        <span className="wf-campaign-forge-dna-code">{row.code}</span>
                        <h3>{row.label}</h3>
                      </div>
                      <p>{row.value}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="wf-campaign-forge-preview">
                  <h3>No World DNA saved</h3>
                  <p>
                    Player creation will use the premise only. Start a new campaign through World DNA when the world needs generated seeds first.
                  </p>
                </div>
              )}
              <span className="wf-campaign-forge-hint" data-testid="world-dna-status">
                {kernel.worldDna ? "Ready for player creation." : "Premise-only player creation is available."}
              </span>
            </div>
          </FormStep>

          <FormStep
            number="ii."
            title="Player"
            meta={savedPlayer ? "saved" : "draft"}
            description="Create or import the player character, then save it."
          >
            <div data-testid="player-cast-panel">
              {savedPlayer ? (
                <div className="mb-5">
                  <CharacterDraftPreview draft={savedPlayer.characterDraft} />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Player creation modes">
                <button
                  type="button"
                  role="tab"
                  aria-selected={characterMode === "describe"}
                  className="wf-v4-btn"
                  disabled={isCharacterBusy}
                  onClick={() => setCharacterMode("describe")}
                >
                  <FileText className="h-4 w-4" />
                  Describe
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={characterMode === "import"}
                  className="wf-v4-btn"
                  disabled={isCharacterBusy}
                  onClick={() => setCharacterMode("import")}
                >
                  <Upload className="h-4 w-4" />
                  Import card
                </button>
              </div>

              {characterMode === "describe" ? (
                <div className="mt-4 grid gap-3">
                  <textarea
                    value={concept}
                    onChange={(event) => setConcept(event.target.value)}
                    rows={5}
                    disabled={isCharacterBusy}
                    placeholder="Describe the player character."
                    aria-label="Player concept"
                  />
                  <button
                    type="button"
                    className="wf-v4-btn w-fit"
                    disabled={isCharacterBusy || !concept.trim()}
                    onClick={() => void handleDescribe()}
                  >
                    {characterBusy === "parsing" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    Create draft
                  </button>
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  <label className="wf-campaign-forge-field">
                    <span>Import mode</span>
                    <select
                      value={importMode}
                      onChange={(event) => setImportMode(event.target.value as CharacterImportMode)}
                      disabled={isCharacterBusy}
                      className="wf-campaign-forge-select"
                    >
                      <option value="native">Native resident</option>
                      <option value="outsider">Outsider</option>
                    </select>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.png"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleImport(file);
                      }
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="wf-v4-btn w-fit"
                    disabled={isCharacterBusy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {characterBusy === "importing" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Choose card
                  </button>
                </div>
              )}

              <label className="wf-campaign-forge-field mt-4">
                <span>Override</span>
                <textarea
                  value={overrideText}
                  onChange={(event) => setOverrideText(event.target.value)}
                  rows={3}
                  disabled={isCharacterBusy}
                  placeholder="Instructions for this draft."
                  aria-label="Player override"
                />
              </label>

              {draft ? (
                <div className="mt-4 grid gap-3">
                  <CharacterDraftPreview draft={draft} />
                  <button
                    type="button"
                    className="wf-v4-btn w-fit"
                    disabled={isCharacterBusy || !draft.identity.displayName.trim()}
                    onClick={() => void handleSavePlayer()}
                  >
                    {characterBusy === "saving" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save player
                  </button>
                </div>
              ) : null}
            </div>
          </FormStep>

          <FormStep
            number="iii."
            title="Graph"
            meta={graphReady ? "ready" : "waiting"}
            description="Build the graph after the player is saved."
          >
            <div className="grid gap-4" data-testid="graph-panel">
              <div className="wf-campaign-forge-metrics">
                <RailMetric label="nodes" value={kernel.worldGraph.nodes.length} />
                <RailMetric label="edges" value={kernel.worldGraph.edges.length} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="wf-v4-btn"
                  disabled={!canComposeGraph}
                  onClick={() => void handleComposeGraph()}
                >
                  {graphBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GitBranch className="h-4 w-4" />
                  )}
                  Compose graph
                </button>
                <span className="wf-campaign-forge-hint">
                  {graphReady ? "Graph ready." : savedPlayer ? "Ready to compose." : "Save the player first."}
                </span>
              </div>
            </div>
          </FormStep>
        </div>
      </section>

      <aside className="wf-forge-side">
        <div className="wf-forge-sequence">
          <p className="wf-kicker wf-kicker-ember">Forge sequence</p>
          <div className="wf-stage-list">
            <SequenceItem number="i" state={worldDnaStage} label="World DNA" detail={currentWorldDnaStatus} />
            <SequenceItem number="ii" state={playerStage} label="Player" detail={savedPlayer ? "saved" : "create or import"} />
            <SequenceItem number="iii" state={graphStage} label="Graph" detail={graphReady ? "ready" : "compose after player"} />
          </div>
        </div>

        <div className="wf-rail-card wf-campaign-forge-rail-card">
          <p className="wf-kicker">Kernel state</p>
          <RailMetric label="phase" value={kernel.phase} />
          <div className="sr-only" data-testid="kernel-phase">{kernel.phase}</div>
          <RailMetric label="World DNA" value={currentWorldDnaStatus} />
          <RailMetric label="Player" value={savedPlayer ? savedPlayer.characterDraft.identity.displayName : "empty"} />
          <RailMetric label="Graph nodes" value={kernel.worldGraph.nodes.length} />
        </div>
      </aside>
    </main>
  );
}
