"use client";

import { use, useCallback, useEffect, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  applyPersonaTemplate,
  generateCharacter,
  getWorldData,
  importV2Card,
  IngestionError,
  loadCampaign,
  parseCharacter,
  previewCanonicalLoadout,
  researchCharacter,
  resolveStartingLocation,
  saveCharacter,
} from "@/lib/api";
import type { CharacterDraft } from "@worldforge/shared";
import type { CharacterImportMode } from "@/lib/types";
import type { LoadoutPreviewResult, PersonaTemplateSummary } from "@/lib/api-types";
import { parseV2CardFile } from "@/lib/v2-card-parser";
import { CharacterCard } from "@/components/character-creation/character-card";
import { CharacterForm, type BusyState as IngestionBusyState } from "@/components/character-creation/character-form";
import { CharacterWorkspace } from "@/components/character-creation/character-workspace";
import { PipelineErrorBanner } from "@/components/character-creation/pipeline-error-banner";
import { Button } from "@/components/ui/button";

type LoadingState = "idle" | "loading" | "saving";

function isGenerationRequiredError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("generation") &&
    (message.includes("required") ||
      message.includes("not ready") ||
      message.includes("not complete"))
  );
}

export default function CharacterCreationPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id: campaignId } = use(props.params);
  const router = useRouter();

  const [locationNames, setLocationNames] = useState<string[]>([]);
  const [personaTemplates, setPersonaTemplates] = useState<PersonaTemplateSummary[]>([]);
  const [loading, setLoading] = useState<LoadingState>("loading");
  const [busy, setBusy] = useState<IngestionBusyState>("idle");
  const [characterDraft, setCharacterDraft] = useState<CharacterDraft | null>(null);
  const [generationRequired, setGenerationRequired] = useState(false);
  const [resolvingStart, setResolvingStart] = useState(false);
  const [previewingLoadout, setPreviewingLoadout] = useState(false);
  const [loadoutPreview, setLoadoutPreview] = useState<LoadoutPreviewResult | null>(null);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

  // Phase 61 ingestion state
  const [overrideText, setOverrideText] = useState("");
  const [ingestionError, setIngestionError] = useState<IngestionError | Error | null>(null);
  const [lastIngestion, setLastIngestion] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const campaign = await loadCampaign(campaignId);
        if (!campaign.generationComplete) {
          setGenerationRequired(true);
          return;
        }

        const world = await getWorldData(campaignId);
        setLocationNames(world.locations.map((location) => location.name));
        setPersonaTemplates(world.personaTemplates);
      } catch (error) {
        if (isGenerationRequiredError(error)) {
          setGenerationRequired(true);
          return;
        }

        toast.error("Failed to load world data", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setLoading("idle");
      }
    }

    void loadData();
  }, [campaignId]);

  /**
   * Ingestion runner — captures the failing callable so Retry can re-invoke
   * it with the same inputs at the time of failure (see research §Pitfall 8).
   * No toast.error on pipeline failure — the banner owns that surface
   * (see research §Pitfall 5).
   */
  const runIngestion = useCallback(async (callable: () => Promise<void>) => {
    setLastIngestion(() => callable);
    setIngestionError(null);
    try {
      await callable();
      setLastIngestion(null);
    } catch (err) {
      setIngestionError(err as Error);
    }
  }, []);

  const handleParse = useCallback(
    (description: string) => {
      setBusy("parsing");
      return runIngestion(async () => {
        try {
          const result = await parseCharacter(
            campaignId,
            description,
            "player",
            locationNames,
            [],
            overrideText,
          );
          if (result.role === "player") {
            startTransition(() => setCharacterDraft(result.draft));
            setLoadoutPreview(null);
          }
          toast.success("Character parsed");
        } finally {
          setBusy("idle");
        }
      });
    },
    [campaignId, locationNames, overrideText, runIngestion],
  );

  const handleGenerate = useCallback(() => {
    setBusy("generating");
    return runIngestion(async () => {
      try {
        const result = await generateCharacter(
          campaignId,
          "player",
          locationNames,
          [],
          overrideText,
        );
        if (result.role === "player") {
          startTransition(() => setCharacterDraft(result.draft));
          setLoadoutPreview(null);
        }
        toast.success("Character generated");
      } finally {
        setBusy("idle");
      }
    });
  }, [campaignId, locationNames, overrideText, runIngestion]);

  const handleResearch = useCallback(
    (archetype: string) => {
      setBusy("researching");
      return runIngestion(async () => {
        try {
          const result = await researchCharacter(
            campaignId,
            archetype,
            "player",
            locationNames,
            [],
            overrideText,
          );
          if (result.role === "player") {
            startTransition(() => setCharacterDraft(result.draft));
            setLoadoutPreview(null);
          }
          toast.success("Archetype researched");
        } finally {
          setBusy("idle");
        }
      });
    },
    [campaignId, locationNames, overrideText, runIngestion],
  );

  const handleImport = useCallback(
    async (file: File, importMode: CharacterImportMode) => {
      setBusy("importing");
      return runIngestion(async () => {
        try {
          const card = await parseV2CardFile(file);
          const result = await importV2Card(campaignId, card, {
            role: "player",
            importMode,
            locationNames,
            factionNames: [],
            overrideText,
          });
          if (result.role === "player") {
            startTransition(() => setCharacterDraft(result.draft));
            setLoadoutPreview(null);
          }
          toast.success(`Imported "${card.name}"`);
        } finally {
          setBusy("idle");
        }
      });
    },
    [campaignId, locationNames, overrideText, runIngestion],
  );

  const handleResolveStartingLocation = useCallback(async () => {
    if (!characterDraft) {
      return;
    }
    setResolvingStart(true);
    try {
      const sourcePrompt = characterDraft.startConditions.sourcePrompt?.trim() || undefined;
      const resolved = await resolveStartingLocation(campaignId, sourcePrompt);
      const updatedDraft: CharacterDraft = {
        ...characterDraft,
        socialContext: {
          ...characterDraft.socialContext,
          currentLocationId: resolved.locationId,
          currentLocationName: resolved.locationName,
        },
        startConditions: resolved.startConditions,
      };
      startTransition(() => setCharacterDraft(updatedDraft));
      toast.success("Starting situation applied");

      setPreviewingLoadout(true);
      try {
        const preview = await previewCanonicalLoadout(campaignId, updatedDraft);
        setLoadoutPreview(preview);
        toast.success("Loadout preview updated");
      } catch (loadoutError) {
        toast.error("Failed to preview loadout", {
          description: loadoutError instanceof Error ? loadoutError.message : "Unknown error",
        });
      } finally {
        setPreviewingLoadout(false);
      }
    } catch (error) {
      toast.error("Failed to resolve starting situation", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setResolvingStart(false);
    }
  }, [campaignId, characterDraft]);

  const handlePreviewLoadout = useCallback(async () => {
    if (!characterDraft) {
      return;
    }
    setPreviewingLoadout(true);
    try {
      const preview = await previewCanonicalLoadout(campaignId, characterDraft);
      setLoadoutPreview(preview);
      toast.success("Canonical loadout preview updated");
    } catch (error) {
      toast.error("Failed to preview loadout", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setPreviewingLoadout(false);
    }
  }, [campaignId, characterDraft]);

  const handleApplyPersonaTemplate = useCallback(
    async (templateId: string) => {
      if (!characterDraft) {
        return;
      }
      setApplyingTemplateId(templateId);
      try {
        const result = await applyPersonaTemplate(campaignId, templateId, characterDraft);
        startTransition(() => setCharacterDraft(result.draft));
        setLoadoutPreview(null);
        toast.success("Persona template applied");
      } catch (error) {
        toast.error("Failed to apply persona template", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setApplyingTemplateId(null);
      }
    },
    [campaignId, characterDraft],
  );

  const handleSave = useCallback(async () => {
    if (!characterDraft) {
      return;
    }
    setLoading("saving");
    try {
      await saveCharacter(campaignId, characterDraft);
      setOverrideText("");
      toast.success("Character saved");
      router.push("/game");
    } catch (error) {
      toast.error("Failed to save character", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading("idle");
    }
  }, [campaignId, characterDraft, router]);

  const handleRetry = useCallback(() => {
    if (lastIngestion) {
      void runIngestion(lastIngestion);
    }
  }, [lastIngestion, runIngestion]);

  const handleDismissError = useCallback(() => {
    setIngestionError(null);
  }, []);

  const banner = ingestionError ? (
    <PipelineErrorBanner
      error={ingestionError.message}
      stage={ingestionError instanceof IngestionError ? ingestionError.stage : undefined}
      attempts={ingestionError instanceof IngestionError ? ingestionError.attempts : undefined}
      onRetry={handleRetry}
      retrying={busy !== "idle"}
      onDismiss={handleDismissError}
    />
  ) : null;

  if (loading === "loading") {
    return (
      <div className="wf-v4-page flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (generationRequired) {
    return (
      <div className="wf-v4-page flex min-h-[50vh] items-center justify-center">
        <div className="max-w-lg text-center">
          <p className="wf-kicker wf-kicker-ember">
            Campaign Readiness
          </p>
          <h2 className="mt-2 font-serif text-[clamp(24px,2vw,36px)] text-[var(--fg)]">
            World generation required
          </h2>
          <p className="mt-3 text-[13px] text-[var(--fg-2)]">
            Finish generating this campaign before starting character creation.
            The character workspace unlocks after the world scaffold is ready.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/campaign/new">Return to Creation Flow</Link>
          </Button>
        </div>
      </div>
    );
  }

  /* ── Empty state: centered launcher ── */
  if (!characterDraft) {
    return (
      <CharacterWorkspace className="wf-v4-page wf-v4-page-theater">
        <header className="mb-10 max-w-[920px]">
          <p className="wf-kicker wf-kicker-ember">Player character</p>
          <h1 className="wf-display wf-serif-em mt-4 text-[clamp(48px,4vw,86px)]">
            Create your <em>character.</em>
          </h1>
        </header>

        <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <CharacterForm
              busy={busy}
              overrideText={overrideText}
              onOverrideTextChange={setOverrideText}
              onParse={handleParse}
              onGenerate={handleGenerate}
              onResearch={handleResearch}
              onImport={handleImport}
            />
            {banner && <div className="mt-[clamp(16px,1.4vw,28px)]">{banner}</div>}
          </div>
          <aside className="wf-rail-card self-start p-6 xl:sticky xl:top-[112px]">
            <p className="wf-kicker">Identity preview</p>
            <div className="wf-character-card-preview mt-8 flex aspect-[3/4] items-center justify-center font-serif text-6xl text-[var(--gold)]">
              ?
            </div>
            <p className="wf-prose mt-6 text-sm leading-6 text-[var(--fg-2)]">
              The preview will update once a character is parsed, generated, researched, or imported.
            </p>
          </aside>
        </div>

        <div className="sticky bottom-0 z-20 mt-8 flex shrink-0 items-center justify-between border-t border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,8,10,0.72),#08080a)] py-[clamp(12px,1vw,20px)] backdrop-blur">
          <Button variant="ghost" asChild>
            <Link href={`/campaign/${campaignId}/review`}>Back to Review</Link>
          </Button>
        </div>
      </CharacterWorkspace>
    );
  }

  /* ── Character exists: compact form + dossier card ── */
  return (
    <CharacterWorkspace className="wf-v4-page wf-v4-page-theater">
      <header className="mb-10 max-w-[920px]">
        <p className="wf-kicker wf-kicker-ember">Player character</p>
        <h1 className="wf-display wf-serif-em mt-4 text-[clamp(48px,4vw,86px)]">
          Create your <em>character.</em>
        </h1>
      </header>

      <div className="grid flex-1 gap-12 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <CharacterForm
            busy={busy}
            overrideText={overrideText}
            onOverrideTextChange={setOverrideText}
            onParse={handleParse}
            onGenerate={handleGenerate}
            onResearch={handleResearch}
            onImport={handleImport}
            compact
          />

          {banner && <div className="mt-[clamp(12px,1vw,20px)]">{banner}</div>}

          <div className="mt-[clamp(16px,1.4vw,28px)]">
            <CharacterCard
              draft={characterDraft}
              locationNames={locationNames}
              personaTemplates={personaTemplates}
              previewLoadout={loadoutPreview}
              previewingLoadout={previewingLoadout}
              applyingTemplateId={applyingTemplateId}
              resolvingStartingLocation={resolvingStart}
              onChange={setCharacterDraft}
              onResolveStartingLocation={handleResolveStartingLocation}
              onPreviewLoadout={handlePreviewLoadout}
              onApplyPersonaTemplate={handleApplyPersonaTemplate}
            />
          </div>
        </div>

        <aside className="wf-rail-card self-start p-6 xl:sticky xl:top-[112px]">
          <p className="wf-kicker">Identity preview</p>
          <div className="wf-character-card-preview mt-8 flex aspect-[3/4] items-center justify-center font-serif text-6xl text-[var(--gold)]">
            {initialsFor(characterDraft.identity.displayName)}
          </div>
          <p className="wf-prose mt-6 text-lg italic leading-7 text-[var(--fg-1)]">
            {characterDraft.identity.personality?.summary
              || characterDraft.profile.backgroundSummary
              || characterDraft.profile.personaSummary
              || "Draft character"}
          </p>
          <div className="mt-8 space-y-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-3)]">
            <div>Creation mode · player</div>
            <div>Status · draft</div>
            {characterDraft.socialContext.currentLocationName ? (
              <div>Start · {characterDraft.socialContext.currentLocationName}</div>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 mt-8 flex shrink-0 items-center justify-between border-t border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,8,10,0.72),#08080a)] py-[clamp(12px,1vw,20px)] backdrop-blur">
        <Button variant="ghost" asChild>
          <Link href={`/campaign/${campaignId}/review`}>Back to Review</Link>
        </Button>
        <Button
          onClick={handleSave}
          disabled={
            loading === "saving" ||
            busy !== "idle" ||
            !characterDraft ||
            !characterDraft.identity.displayName.trim()
          }
          className="bg-blood text-white hover:bg-blood/90"
        >
          {loading === "saving" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save & Begin Adventure"
          )}
        </Button>
      </div>
    </CharacterWorkspace>
  );
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}
