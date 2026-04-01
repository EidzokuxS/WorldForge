"use client";

import { use, useCallback, useEffect, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        setCharacterDraft(result.draft);
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
        setCharacterDraft(result.draft);
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
        setCharacterDraft(result.draft);
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
      setCharacterDraft({
        ...characterDraft,
        socialContext: {
          ...characterDraft.socialContext,
          currentLocationId: resolved.locationId,
          currentLocationName: resolved.locationName,
        },
        startConditions: resolved.startConditions,
      });
      toast.success("Starting situation applied");
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
      setCharacterDraft(result.draft);
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
      <div className="rounded-[var(--shell-radius-panel)] border [border-color:var(--shell-border)] bg-card/80 p-6 shadow-xl shadow-black/10">
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blood">
              Campaign Readiness
            </p>
            <h2 className="font-serif text-3xl text-bone">World generation required</h2>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Finish generating this campaign before starting character creation. The character workspace unlocks after the world scaffold is ready.
          </p>
          <Button asChild size="lg">
            <Link href="/campaign/new">Return to Creation Flow</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CharacterWorkspace
      entryMethods={
        <>
          <p>Free text, AI generation, import, and persona-template application remain first-class entry paths.</p>
          <CharacterForm
            onParse={handleParse}
            onGenerate={handleGenerate}
            onImport={handleImport}
            parsing={busy === "parsing"}
            generating={busy === "generating"}
            importing={busy === "importing"}
          />
        </>
      }
      editor={
        characterDraft ? (
          <Card className="border-border/70 bg-card/80 shadow-xl shadow-black/10">
            <CardHeader>
              <CardTitle className="font-serif text-2xl text-bone">Structured Draft</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/70 bg-card/80 shadow-xl shadow-black/10">
            <CardHeader>
              <CardTitle className="font-serif text-2xl text-bone">Awaiting Draft</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Use the entry methods to parse, generate, or import a character. The workspace preserves the current draft/start/loadout seam once a draft exists.
            </CardContent>
          </Card>
        )
      }
      summary={
        characterDraft ? (
          <>
            <p>Name: {characterDraft.identity.displayName || "Unnamed"}</p>
            <p>Starting location: {characterDraft.socialContext.currentLocationName ?? "Unset"}</p>
            <p>Persona templates available: {personaTemplates.length}</p>
            <p>Loadout items: {(loadoutPreview?.loadout.equippedItemRefs ?? characterDraft.loadout.equippedItemRefs).length}</p>
          </>
        ) : (
          <p>No draft yet. Start from free text, generation, or import to populate the authoring workspace.</p>
        )
      }
      actions={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-bone">Begin Adventure</p>
            <p className="text-xs text-muted-foreground">
              Save the canonical `CharacterDraft`, then hand off directly into `/game`.
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleSave}
            disabled={busy !== "idle" || !characterDraft || !characterDraft.identity.displayName.trim()}
          >
            {busy === "saving" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Begin Adventure"
            )}
          </Button>
        </div>
      }
    />
  );
}
