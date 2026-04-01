"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  getLoreCards,
  getWorldData,
  loadCampaign,
  regenerateSection,
  saveWorldEdits,
  type EditableScaffold,
  type LoreCardItem,
  type RegenerateSectionRequest,
  type ScaffoldFaction,
  type ScaffoldLocation,
  type ScaffoldNpc,
} from "@/lib/api";
import { toEditableScaffold } from "@/lib/world-data-helpers";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FactionsSection } from "@/components/world-review/factions-section";
import { LocationsSection } from "@/components/world-review/locations-section";
import { LoreSection } from "@/components/world-review/lore-section";
import { NpcsSection } from "@/components/world-review/npcs-section";
import { PremiseSection } from "@/components/world-review/premise-section";
import { ReviewWorkspace } from "@/components/world-review/review-workspace";

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

export default function WorldReviewPage(props: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(props.params);
  const router = useRouter();

  const [scaffold, setScaffold] = useState<EditableScaffold | null>(null);
  const [loreCards, setLoreCards] = useState<LoreCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generationRequired, setGenerationRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const campaign = await loadCampaign(campaignId);
        if (!campaign.generationComplete) {
          setGenerationRequired(true);
          return;
        }

        const [world, lore] = await Promise.all([
          getWorldData(campaignId),
          getLoreCards(campaignId).catch(() => [] as LoreCardItem[]),
        ]);

        const editableScaffold = toEditableScaffold(world, campaign?.premise ?? "", lore);
        setScaffold(editableScaffold);
        setLoreCards(lore);
      } catch (error) {
        if (isGenerationRequiredError(error)) {
          setGenerationRequired(true);
          return;
        }

        toast.error("Failed to load world data", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [campaignId]);

  const handleRegenerate = useCallback(async (section: string, additionalInstruction?: string) => {
    if (!scaffold) {
      return;
    }

    setRegenerating(section);
    try {
      let body: RegenerateSectionRequest;
      const locationNames = scaffold.locations.map((location) => location.name);
      const factionNames = scaffold.factions.map((faction) => faction.name);

      switch (section) {
        case "premise":
          body = { campaignId, section: "premise", additionalInstruction };
          break;
        case "locations":
          body = { campaignId, section: "locations", refinedPremise: scaffold.refinedPremise, additionalInstruction };
          break;
        case "factions":
          body = { campaignId, section: "factions", refinedPremise: scaffold.refinedPremise, locationNames, additionalInstruction };
          break;
        case "npcs":
          body = { campaignId, section: "npcs", refinedPremise: scaffold.refinedPremise, locationNames, factionNames, additionalInstruction };
          break;
        default:
          return;
      }

      const result = await regenerateSection<Record<string, unknown>>(body);
      setScaffold((current) => {
        if (!current) {
          return current;
        }
        switch (section) {
          case "premise":
            return { ...current, refinedPremise: result.refinedPremise as string };
          case "locations":
            return { ...current, locations: result.locations as ScaffoldLocation[] };
          case "factions":
            return { ...current, factions: result.factions as ScaffoldFaction[] };
          case "npcs":
            return { ...current, npcs: result.npcs as ScaffoldNpc[] };
          default:
            return current;
        }
      });

      toast.success(`${section} regenerated`);
    } catch (error) {
      toast.error(`Failed to regenerate ${section}`, {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setRegenerating(null);
    }
  }, [campaignId, scaffold]);

  const handleSaveAndContinue = useCallback(async () => {
    if (!scaffold) {
      return;
    }
    setSaving(true);
    try {
      await saveWorldEdits(campaignId, scaffold);
      toast.success("World saved");
      router.push(`/campaign/${campaignId}/character`);
    } catch (error) {
      toast.error("Failed to save", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }, [campaignId, router, scaffold]);

  if (loading) {
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
            Finish generating this campaign before opening World Review. The review workspace unlocks once the scaffold and world data are available.
          </p>
          <Button asChild size="lg">
            <Link href="/campaign/new">Return to Creation Flow</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!scaffold) {
    return <p className="text-sm text-muted-foreground">Failed to load world data.</p>;
  }

  return (
    <ReviewWorkspace
      sectionNav={
        <ul className="space-y-2">
          <li>Premise</li>
          <li>Locations ({scaffold.locations.length})</li>
          <li>Factions ({scaffold.factions.length})</li>
          <li>NPCs ({scaffold.npcs.length})</li>
          <li>Lore ({loreCards.length})</li>
        </ul>
      }
      summary={
        <>
          <p>Premise reviewed: {scaffold.refinedPremise ? "ready" : "missing"}</p>
          <p>Locations: {scaffold.locations.length}</p>
          <p>Factions: {scaffold.factions.length}</p>
          <p>NPCs: {scaffold.npcs.length}</p>
          <p>Lore cards: {loreCards.length}</p>
        </>
      }
      actions={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-bone">Save and continue</p>
            <p className="text-xs text-muted-foreground">
              Persist current scaffold edits, then move into canonical character creation.
            </p>
          </div>
          <Button size="lg" onClick={handleSaveAndContinue} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Continue to Character Creation"
            )}
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="premise" className="w-full">
        <TabsList className="mb-6 w-full justify-start">
          <TabsTrigger value="premise">Premise</TabsTrigger>
          <TabsTrigger value="locations">Locations ({scaffold.locations.length})</TabsTrigger>
          <TabsTrigger value="factions">Factions ({scaffold.factions.length})</TabsTrigger>
          <TabsTrigger value="npcs">NPCs ({scaffold.npcs.length})</TabsTrigger>
          <TabsTrigger value="lore">Lore ({loreCards.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="premise">
          <PremiseSection
            refinedPremise={scaffold.refinedPremise}
            onChange={(refinedPremise: string) => setScaffold((current) => current ? { ...current, refinedPremise } : current)}
            onRegenerate={(instruction: string | undefined) => handleRegenerate("premise", instruction)}
            regenerating={regenerating === "premise"}
          />
        </TabsContent>
        <TabsContent value="locations">
          <LocationsSection
            locations={scaffold.locations}
            onChange={(locations: ScaffoldLocation[]) => setScaffold((current) => current ? { ...current, locations } : current)}
            onRegenerate={(instruction: string | undefined) => handleRegenerate("locations", instruction)}
            regenerating={regenerating === "locations"}
          />
        </TabsContent>
        <TabsContent value="factions">
          <FactionsSection
            factions={scaffold.factions}
            locationNames={scaffold.locations.map((location) => location.name)}
            onChange={(factions: ScaffoldFaction[]) => setScaffold((current) => current ? { ...current, factions } : current)}
            onRegenerate={(instruction: string | undefined) => handleRegenerate("factions", instruction)}
            regenerating={regenerating === "factions"}
          />
        </TabsContent>
        <TabsContent value="npcs">
          <NpcsSection
            npcs={scaffold.npcs}
            campaignId={campaignId}
            locationNames={scaffold.locations.map((location) => location.name)}
            factionNames={scaffold.factions.map((faction) => faction.name)}
            personaTemplates={scaffold.personaTemplates ?? []}
            onChange={(npcs: ScaffoldNpc[]) => setScaffold((current) => current ? { ...current, npcs } : current)}
            onRegenerate={(instruction: string | undefined) => handleRegenerate("npcs", instruction)}
            regenerating={regenerating === "npcs"}
          />
        </TabsContent>
        <TabsContent value="lore">
          <LoreSection
            cards={loreCards}
            campaignId={campaignId}
            onRefresh={async () => {
              try {
                const refreshed = await getLoreCards(campaignId);
                setLoreCards(refreshed);
              } catch {
                // Keep stale lore on refresh failure.
              }
            }}
          />
        </TabsContent>
      </Tabs>
    </ReviewWorkspace>
  );
}
