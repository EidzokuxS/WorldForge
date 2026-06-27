"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  FileText,
  Loader2,
  Network,
  Save,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";
import type { CampaignKernel, CharacterDraft } from "@worldforge/shared";

import { loadCampaign, type CampaignMeta } from "@/lib/api";
import {
  importPlayerCard,
  loadCampaignKernel,
  parsePlayerCharacterDraft,
  savePlayerCast,
} from "@/lib/campaign-kernel-api";
import { getErrorMessage } from "@/lib/settings";
import { parseV2CardFile as parseCharacterCardFile } from "@/lib/v2-card-parser";
import type { CharacterImportMode } from "@/lib/types";

function KernelMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-[var(--line)] bg-[var(--bg-2)] px-4 py-3">
      <div className="text-xs uppercase tracking-[0.12em] text-[var(--fg-3)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[var(--fg)]">{value}</div>
    </div>
  );
}

function KernelJson({ kernel }: { kernel: CampaignKernel }) {
  return (
    <pre className="max-h-[360px] overflow-auto border border-[var(--line)] bg-black/20 p-4 text-xs leading-relaxed text-[var(--fg-2)]">
      {JSON.stringify(kernel, null, 2)}
    </pre>
  );
}

function CharacterDraftPreview({ draft }: { draft: CharacterDraft }) {
  return (
    <div className="grid gap-3 border border-[var(--line)] bg-black/15 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
        <UserRound className="h-4 w-4 text-[var(--ember-1)]" />
        {draft.identity.displayName || "Unnamed character"}
      </div>
      <p className="text-sm leading-6 text-[var(--fg-2)]">
        {draft.identity.personality?.summary
          || draft.profile.personaSummary
          || draft.profile.backgroundSummary
          || "Draft is ready for review."}
      </p>
      <div className="grid gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-3)]">
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

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center text-[var(--fg-2)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading campaign forge...
      </main>
    );
  }

  if (loadError || !campaign || !kernel) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <h1 className="font-serif text-3xl font-semibold text-[var(--fg)]">Campaign forge failed</h1>
        <p className="text-sm text-red-300">{loadError ?? "Campaign was not loaded."}</p>
        <Link href="/campaign/new" className="wf-v4-btn w-fit">
          Start over
        </Link>
      </main>
    );
  }

  const savedPlayer = kernel.castRegistry.playerCharacter;
  const isCharacterBusy = characterBusy !== "idle";
  const castCount = (savedPlayer ? 1 : 0)
    + kernel.castRegistry.importedCast.length
    + kernel.castRegistry.generatedCast.length;

  return (
    <main
      className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-8"
      data-testid="campaign-forge"
    >
      <section className="grid gap-4 border-b border-[var(--line)] pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--fg-3)]">Campaign Forge</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold text-[var(--fg)]">
              {campaign.name}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--fg-2)]">
              {kernel.premise || campaign.premise || "Draft campaign shell ready. Start the Campaign Kernel."}
            </p>
          </div>
          <Link href="/campaign/new" className="wf-v4-btn">
            Start draft
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <KernelMetric label="phase" value={kernel.phase} />
        <KernelMetric label="turn index" value={kernel.turnIndex} />
        <KernelMetric label="graph nodes" value={kernel.worldGraph.nodes.length} />
        <KernelMetric label="cast" value={castCount} />
      </section>

      <section className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <div className="grid gap-4">
          <article className="border border-[var(--line)] bg-[var(--bg-2)] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
              <ShieldCheck className="h-4 w-4 text-[var(--ember-1)]" />
              Campaign Kernel
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-[var(--fg-3)]">Campaign ID</dt>
                <dd className="font-mono text-[var(--fg)]">{kernel.campaignId}</dd>
              </div>
              <div>
                <dt className="text-[var(--fg-3)]">Kernel phase</dt>
                <dd className="text-[var(--fg)]" data-testid="kernel-phase">
                  {kernel.phase}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--fg-3)]">World DNA</dt>
                <dd className="text-[var(--fg)]">{kernel.worldDna ? "ready" : "awaiting builder"}</dd>
              </div>
              <div>
                <dt className="text-[var(--fg-3)]">Player cast</dt>
                <dd className="text-[var(--fg)]">
                  {savedPlayer?.characterDraft.identity.displayName ?? "awaiting character"}
                </dd>
              </div>
            </dl>
          </article>

          <article
            className="border border-[var(--line)] bg-[var(--bg-2)] p-5"
            data-testid="player-cast-panel"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
              <UserRound className="h-4 w-4 text-[var(--ember-1)]" />
              Player cast
            </div>

            {savedPlayer ? (
              <div className="mt-4 grid gap-3">
                <CharacterDraftPreview draft={savedPlayer.characterDraft} />
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Player creation modes">
              <button
                type="button"
                role="tab"
                aria-selected={characterMode === "describe"}
                className="wf-v4-btn"
                disabled={isCharacterBusy}
                onClick={() => setCharacterMode("describe")}
              >
                <FileText className="mr-2 h-4 w-4" />
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
                <Upload className="mr-2 h-4 w-4" />
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
                  className="min-h-[140px] resize-y border border-[var(--line)] bg-black/20 px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-3)]"
                />
                <button
                  type="button"
                  className="wf-v4-btn w-fit"
                  disabled={isCharacterBusy || !concept.trim()}
                  onClick={() => void handleDescribe()}
                >
                  {characterBusy === "parsing" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  Create draft
                </button>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm text-[var(--fg-2)]">
                  Import mode
                  <select
                    value={importMode}
                    onChange={(event) => setImportMode(event.target.value as CharacterImportMode)}
                    disabled={isCharacterBusy}
                    className="border border-[var(--line)] bg-black/20 px-3 py-2 text-sm text-[var(--fg)]"
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Choose card
                </button>
              </div>
            )}

            <label className="mt-4 grid gap-1 text-sm text-[var(--fg-2)]">
              Override
              <textarea
                value={overrideText}
                onChange={(event) => setOverrideText(event.target.value)}
                rows={3}
                disabled={isCharacterBusy}
                placeholder="Instructions for this draft."
                aria-label="Player override"
                className="resize-y border border-[var(--line)] bg-black/20 px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-3)]"
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save player cast
                </button>
              </div>
            ) : null}
          </article>

          <article className="border border-[var(--line)] bg-[var(--bg-2)] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
              <Network className="h-4 w-4 text-[var(--ember-1)]" />
              Kernel boundary
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--fg-2)]" data-testid="kernel-boundary">
              Player cast writes to the Campaign Kernel. Full worldgen remains outside this Campaign Forge path.
            </p>
            {actionError ? <p className="mt-3 text-sm text-red-300">{actionError}</p> : null}
          </article>
        </div>

        <article className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--fg)]">Kernel payload</h2>
            <span className="flex items-center gap-1 text-xs text-[var(--fg-3)]">
              A1
              <ArrowRight className="h-3 w-3" />
              A5b proof surface
            </span>
          </div>
          <KernelJson kernel={kernel} />
        </article>
      </section>
    </main>
  );
}
