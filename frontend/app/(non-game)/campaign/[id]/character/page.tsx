"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CampaignPlayCharacterDraft, CampaignPlayState } from "@worldforge/shared";

import {
  CampaignPlayApiError,
  generateCampaignPlayPlayerDraft,
  loadCampaignPlayState,
  parseCampaignPlayPlayerCard,
  putCampaignPlayPlayer,
  researchCampaignPlayPlayer,
} from "@/lib/campaign-play-api";
import { readCampaignPlayerCard } from "@/lib/campaign-player-card";
import {
  CampaignPlayerIntake,
  type CampaignPlayerImportMode,
  type CampaignPlayerIntakeBusy,
} from "@/components/character-creation/campaign-player-intake";
import { CampaignPlayerEditor } from "@/components/character-creation/campaign-player-editor";
import { CharacterWorkspace } from "@/components/character-creation/character-workspace";
import { Button } from "@/components/ui/button";

type PageStatus = "loading" | "ready" | "saving";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Campaign Play could not complete the request.";
}

function hasIncompleteRows(draft: CampaignPlayCharacterDraft): boolean {
  const lists = [
    draft.personality.contradictions,
    draft.personality.sampleLines,
    draft.motives,
    draft.beliefs,
    draft.drives,
    draft.traits,
    draft.flaws,
    draft.specialties,
    draft.inventory,
    draft.signatureItems,
  ];
  return lists.some((items) => items.some((item) => item.trim().length === 0))
    || draft.skills.some((skill) => skill.name.trim().length === 0);
}

export default function CharacterCreationPage(props: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(props.params);
  const router = useRouter();
  const [playState, setPlayState] = useState<CampaignPlayState | null>(null);
  const [draft, setDraft] = useState<CampaignPlayCharacterDraft | null>(null);
  const [status, setStatus] = useState<PageStatus>("loading");
  const [busy, setBusy] = useState<CampaignPlayerIntakeBusy>("idle");
  const [failure, setFailure] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setStatus("loading");
    setFailure(null);
    try {
      const state = await loadCampaignPlayState(campaignId);
      if (state.phase !== "character_required") {
        router.replace(`/campaign/${campaignId}/play`);
        return;
      }
      setPlayState(state);
      setStatus("ready");
    } catch (error) {
      setFailure(errorMessage(error));
      setStatus("ready");
    }
  }, [campaignId, router]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleDraft = useCallback(async (prompt: string) => {
    setBusy("draft");
    setFailure(null);
    try {
      const result = await generateCampaignPlayPlayerDraft(campaignId, { prompt, research: null });
      setDraft(result.draft);
      toast.success("Character draft ready");
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusy("idle");
    }
  }, [campaignId]);

  const handleResearch = useCallback(async (query: string) => {
    setBusy("research");
    setFailure(null);
    try {
      const { research } = await researchCampaignPlayPlayer(campaignId, { query });
      const result = await generateCampaignPlayPlayerDraft(campaignId, { prompt: query, research });
      setDraft(result.draft);
      toast.success("Research-backed draft ready");
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusy("idle");
    }
  }, [campaignId]);

  const handleCard = useCallback(async (file: File, importMode: CampaignPlayerImportMode) => {
    setBusy("card");
    setFailure(null);
    try {
      const cardJson = await readCampaignPlayerCard(file);
      const result = await parseCampaignPlayPlayerCard(campaignId, { cardJson, importMode });
      setDraft(result.draft);
      toast.success("Character card imported");
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusy("idle");
    }
  }, [campaignId]);

  const handleSave = useCallback(async () => {
    if (playState === null || draft === null) return;
    if (hasIncompleteRows(draft)) {
      setFailure("Complete or remove every empty list and skill row before saving.");
      return;
    }
    setStatus("saving");
    setFailure(null);
    try {
      await putCampaignPlayPlayer(campaignId, {
        acceptedWorldVersion: playState.acceptedWorldVersion,
        expectedWorldVersion: playState.worldVersion,
        expectedRuntimeRevision: playState.runtimeRevision,
        source: draft.source.kind,
        character: draft,
      });
      toast.success("Character joined the campaign");
      router.push(`/campaign/${campaignId}/play`);
    } catch (error) {
      if (
        error instanceof CampaignPlayApiError
        && ["stale_world_version", "stale_runtime_revision", "character_already_exists"].includes(error.code)
      ) {
        try {
          const refreshedState = await loadCampaignPlayState(campaignId);
          if (refreshedState.phase !== "character_required") {
            router.replace(`/campaign/${campaignId}/play`);
            return;
          }
          setPlayState(refreshedState);
          setFailure("Campaign state changed. Review the character and save again.");
          setStatus("ready");
          return;
        } catch (refreshError) {
          setFailure(errorMessage(refreshError));
          setStatus("ready");
          return;
        }
      }
      setFailure(errorMessage(error));
      setStatus("ready");
    }
  }, [campaignId, draft, playState, router]);

  if (status === "loading") {
    return <div className="wf-v4-page flex min-h-[50vh] items-center justify-center"><Loader2 aria-label="Loading campaign" className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (playState === null) {
    return (
      <div className="wf-v4-page flex min-h-[50vh] items-center justify-center">
        <div className="wf-rail-card max-w-lg p-8 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-[var(--ember)]" />
          <h1 className="mt-4 font-serif text-3xl text-[var(--fg)]">Character setup is unavailable</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-[var(--fg-2)]">{failure}</p>
          <Button className="mt-6" onClick={() => void loadState()}>Try again</Button>
        </div>
      </div>
    );
  }

  return (
    <CharacterWorkspace className="wf-v4-page wf-v4-page-theater">
      <header className="mb-10 max-w-[920px]">
        <p className="wf-kicker wf-kicker-ember">Player character</p>
        <h1 className="wf-display wf-serif-em mt-4 text-[clamp(48px,4vw,86px)]">Enter the world <em>on your terms.</em></h1>
        <p className="wf-prose mt-5 max-w-2xl text-[var(--fg-2)]">Bring a character card, describe someone specific, or let research anchor a new inhabitant in this campaign.</p>
      </header>

      <div className="grid flex-1 gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-6">
          <CampaignPlayerIntake busy={busy} onDraft={handleDraft} onResearch={handleResearch} onCard={handleCard} compact={draft !== null} />
          {failure ? (
            <div role="alert" className="flex gap-3 rounded-[var(--r-m)] border border-red-800/50 bg-red-950/25 p-4 text-sm text-red-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p>{failure}</p>
            </div>
          ) : null}
          {draft ? <CampaignPlayerEditor draft={draft} onChange={setDraft} /> : null}
        </main>

        <aside className="wf-rail-card self-start p-6 xl:sticky xl:top-[112px]">
          <p className="wf-kicker">Identity</p>
          <div className="wf-character-card-preview mt-8 flex aspect-[3/4] items-center justify-center font-serif text-6xl text-[var(--gold)]">
            {draft ? draft.name.trim().split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?" : "?"}
          </div>
          <p className="wf-prose mt-6 text-sm leading-6 text-[var(--fg-2)]">
            {draft?.summary || "Your draft will appear here before it becomes part of the living world."}
          </p>
          {draft ? <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">{draft.source.kind} · {draft.source.label}</div> : null}
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 mt-8 flex shrink-0 items-center justify-between border-t border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,8,10,0.82),#08080a)] py-[clamp(12px,1vw,20px)] backdrop-blur">
        <Button variant="ghost" asChild><Link href={`/campaign/${campaignId}/review`}>Back to review</Link></Button>
        <Button onClick={() => void handleSave()} disabled={status === "saving" || busy !== "idle" || draft === null || draft.name.trim().length === 0}>
          {status === "saving" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving character…</> : "Continue to opening"}
        </Button>
      </div>
    </CharacterWorkspace>
  );
}
