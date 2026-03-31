"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getWorldData,
  getLoreCards,
  loadCampaign,
  saveWorldEdits,
  regenerateSection,
  type EditableScaffold,
  type ScaffoldLocation,
  type ScaffoldFaction,
  type ScaffoldNpc,
  type LoreCardItem,
  type RegenerateSectionRequest,
} from "@/lib/api";
import { toEditableScaffold } from "@/lib/world-data-helpers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PremiseSection } from "@/components/world-review/premise-section";
import { LocationsSection } from "@/components/world-review/locations-section";
import { FactionsSection } from "@/components/world-review/factions-section";
import { NpcsSection } from "@/components/world-review/npcs-section";
import { LoreSection } from "@/components/world-review/lore-section";

export default function WorldReviewPage(props: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(props.params);
  const router = useRouter();

  const [scaffold, setScaffold] = useState<EditableScaffold | null>(null);
  const [loreCards, setLoreCards] = useState<LoreCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const campaign = await loadCampaign(campaignId);
        const [world, lore] = await Promise.all([
          getWorldData(campaignId),
          getLoreCards(campaignId).catch(() => [] as LoreCardItem[]),
        ]);

        const editableScaffold = toEditableScaffold(world, campaign?.premise ?? "", lore);

        setScaffold(editableScaffold);
        setLoreCards(lore);
      } catch (error) {
        toast.error("Failed to load world data", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [campaignId]);

  const handleRegenerate = useCallback(
    async (section: string, additionalInstruction?: string) => {
      if (!scaffold) return;
      setRegenerating(section);

      try {
        let body: RegenerateSectionRequest;
        const locationNames = scaffold.locations.map((l) => l.name);
        const factionNames = scaffold.factions.map((f) => f.name);

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

        setScaffold((prev) => {
          if (!prev) return prev;
          switch (section) {
            case "premise":
              return { ...prev, refinedPremise: result.refinedPremise as string };
            case "locations":
              return { ...prev, locations: result.locations as ScaffoldLocation[] };
            case "factions":
              return { ...prev, factions: result.factions as ScaffoldFaction[] };
            case "npcs":
              return { ...prev, npcs: result.npcs as ScaffoldNpc[] };
            default:
              return prev;
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
    },
    [campaignId, scaffold],
  );

  const handleSaveAndContinue = useCallback(async () => {
    if (!scaffold) return;
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
  }, [scaffold, campaignId, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!scaffold) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Failed to load world data.</p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-bone">World Review</h1>
          <p className="text-sm text-muted-foreground">
            Review and edit your generated world before continuing
          </p>
        </div>
        <Button
          size="lg"
          onClick={handleSaveAndContinue}
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Continue to Character Creation \u2192"
          )}
        </Button>
      </div>

      <Tabs defaultValue="premise" className="w-full">
        <TabsList className="mb-6 w-full justify-start">
          <TabsTrigger value="premise">Premise</TabsTrigger>
          <TabsTrigger value="locations">
            Locations ({scaffold.locations.length})
          </TabsTrigger>
          <TabsTrigger value="factions">
            Factions ({scaffold.factions.length})
          </TabsTrigger>
          <TabsTrigger value="npcs">
            NPCs ({scaffold.npcs.length})
          </TabsTrigger>
          <TabsTrigger value="lore">
            Lore ({loreCards.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="premise">
          <PremiseSection
            refinedPremise={scaffold.refinedPremise}
            onChange={(premise: string) => setScaffold((prev) => prev ? { ...prev, refinedPremise: premise } : prev)}
            onRegenerate={(instruction: string | undefined) => handleRegenerate("premise", instruction)}
            regenerating={regenerating === "premise"}
          />
        </TabsContent>

        <TabsContent value="locations">
          <LocationsSection
            locations={scaffold.locations}
            onChange={(locations: ScaffoldLocation[]) => setScaffold((prev) => prev ? { ...prev, locations } : prev)}
            onRegenerate={(instruction: string | undefined) => handleRegenerate("locations", instruction)}
            regenerating={regenerating === "locations"}
          />
        </TabsContent>

        <TabsContent value="factions">
          <FactionsSection
            factions={scaffold.factions}
            locationNames={scaffold.locations.map((l) => l.name)}
            onChange={(factions: ScaffoldFaction[]) => setScaffold((prev) => prev ? { ...prev, factions } : prev)}
            onRegenerate={(instruction: string | undefined) => handleRegenerate("factions", instruction)}
            regenerating={regenerating === "factions"}
          />
        </TabsContent>

        <TabsContent value="npcs">
          <NpcsSection
            npcs={scaffold.npcs}
            campaignId={campaignId}
            locationNames={scaffold.locations.map((l) => l.name)}
            factionNames={scaffold.factions.map((f) => f.name)}
            onChange={(npcs: ScaffoldNpc[]) => setScaffold((prev) => prev ? { ...prev, npcs } : prev)}
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
                const fresh = await getLoreCards(campaignId);
                setLoreCards(fresh);
              } catch {
                // keep existing cards on error
              }
            }}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
