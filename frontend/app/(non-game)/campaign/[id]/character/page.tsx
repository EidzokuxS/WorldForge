"use client";

import { use, useCallback, useEffect, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  applyPersonaTemplate,
  generateCharacter as apiGenerateCharacter,
  getWorldData,
  importV2Card,
  loadCampaign,
  parseCharacter,
  previewCanonicalLoadout,
  resolveStartingLocation,
  saveCharacter,
} from "@/lib/api";
import type { CharacterDraft } from "@worldforge/shared";
import type { CharacterImportMode } from "@/lib/types";
import type { LoadoutPreviewResult, PersonaTemplateSummary } from "@/lib/api-types";
import { parseV2CardFile } from "@/lib/v2-card-parser";
import { CharacterCard } from "@/components/character-creation/character-card";
import { CharacterForm } from "@/components/character-creation/character-form";
import { CharacterWorkspace } from "@/components/character-creation/character-workspace";
import { Button } from "@/components/ui/button";

type BusyState = "idle" | "loading" | "parsing" | "generating" | "importing" | "saving";

function isGenerationRequiredError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("generation") &&
    (message.includes("required") || message.includes("not ready") || message.includes("not complete"))
  );
}

export default function CharacterCreationPage(props: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(props.params);
  const router = useRouter();

  const [locationNames, setLocationNames] = useState<string[]>([]);
  const [personaTemplates, setPersonaTemplates] = useState<PersonaTemplateSummary[]>([]);
  const [busy, setBusy] = useState<BusyState>("loading");
  const [characterDraft, setCharacterDraft] = useState<CharacterDraft | null>(null);
  const [generationRequired, setGenerationRequired] = useState(false);
  const [resolvingStart, setResolvingStart] = useState(false);
  const [previewingLoadout, setPreviewingLoadout] = useState(false);
  const [loadoutPreview, setLoadoutPreview] = useState<LoadoutPreviewResult | null>(null);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

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
        setBusy("idle");
      }
    }

    void loadData();
  }, [campaignId]);

  const handleParse = useCallback(async (description: string) => {
    setBusy("parsing");
    try {
      const result = await parseCharacter(campaignId, description);
      if (result.role === "player") {
        startTransition(() => setCharacterDraft(result.draft));
        setLoadoutPreview(null);
      }
      toast.success("Character parsed");
    } catch (error) {
      toast.error("Failed to parse character", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusy("idle");
    }
  }, [campaignId]);

  const handleGenerate = useCallback(async () => {
    setBusy("generating");
    try {
      const result = await apiGenerateCharacter(campaignId);
      if (result.role === "player") {
        startTransition(() => setCharacterDraft(result.draft));
        setLoadoutPreview(null);
      }
      toast.success("Character generated");
    } catch (error) {
      toast.error("Failed to generate character", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusy("idle");
    }
  }, [campaignId]);

  const handleImport = useCallback(async (file: File, importMode: CharacterImportMode) => {
    setBusy("importing");
    try {
      const payload = await parseV2CardFile(file);
      const result = await importV2Card(campaignId, payload, {
        role: "player",
        importMode,
        locationNames,
      });
      if (result.role === "player") {
        startTransition(() => setCharacterDraft(result.draft));
        setLoadoutPreview(null);
      }
      toast.success(`Imported "${payload.name}"`);
    } catch (error) {
      toast.error("Failed to import character card", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusy("idle");
    }
  }, [campaignId, locationNames]);

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

      // Auto-preview loadout with the freshly updated draft
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

  const handleApplyPersonaTemplate = useCallback(async (templateId: string) => {
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
  }, [campaignId, characterDraft]);

  const handleSave = useCallback(async () => {
    if (!characterDraft) {
      return;
    }
    setBusy("saving");
    try {
      await saveCharacter(campaignId, characterDraft);
      toast.success("Character saved");
      router.push("/game");
    } catch (error) {
      toast.error("Failed to save character", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusy("idle");
    }
  }, [campaignId, characterDraft, router]);

  if (busy === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (generationRequired) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-lg text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blood">
            Campaign Readiness
          </p>
          <h2 className="mt-2 font-serif text-[clamp(24px,2vw,36px)] text-bone">
            World generation required
          </h2>
          <p className="mt-3 text-[13px] text-zinc-500">
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
      <CharacterWorkspace>
        <div className="flex flex-1 items-start justify-center px-4 pt-[8vh]">
          <div className="w-full max-w-3xl">
            <CharacterForm
              onParse={handleParse}
              onGenerate={handleGenerate}
              onImport={handleImport}
              parsing={busy === "parsing"}
              generating={busy === "generating"}
              importing={busy === "importing"}
            />
          </div>
        </div>

        <div className="mt-auto flex shrink-0 items-center justify-between border-t border-border/30 py-[clamp(12px,1vw,20px)]">
          <Button variant="ghost" asChild>
            <Link href={`/campaign/${campaignId}/review`}>Back to Review</Link>
          </Button>
        </div>
      </CharacterWorkspace>
    );
  }

  /* ── Character exists: compact form + dossier card ── */
  return (
    <CharacterWorkspace>
      <div className="flex-1 overflow-y-auto">
        <CharacterForm
          onParse={handleParse}
          onGenerate={handleGenerate}
          onImport={handleImport}
          parsing={busy === "parsing"}
          generating={busy === "generating"}
          importing={busy === "importing"}
          compact
        />

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

      <div className="mt-auto flex shrink-0 items-center justify-between border-t border-border/30 py-[clamp(12px,1vw,20px)]">
        <Button variant="ghost" asChild>
          <Link href={`/campaign/${campaignId}/review`}>Back to Review</Link>
        </Button>
        <Button
          onClick={handleSave}
          disabled={busy !== "idle" || !characterDraft || !characterDraft.identity.displayName.trim()}
          className="bg-blood text-white hover:bg-blood/90"
        >
          {busy === "saving" ? (
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
