"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getActiveCampaign,
  getWorldData,
  getLoreCards,
  saveWorldEdits,
  regenerateSection,
  type EditableScaffold,
  type ScaffoldLocation,
  type ScaffoldFaction,
  type ScaffoldNpc,
  type LoreCardItem,
  type RegenerateSectionRequest,
} from "@/lib/api";
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
        const [campaign, world, lore] = await Promise.all([
          getActiveCampaign(),
          getWorldData(campaignId),
          getLoreCards(campaignId).catch(() => [] as LoreCardItem[]),
        ]);

        // Build ID -> name maps for converting DB IDs to human-readable names
        const locationIdToName = new Map(world.locations.map((l) => [l.id, l.name]));
        const factionIdToName = new Map(world.factions.map((f) => [f.id, f.name]));
        const npcIdToName = new Map(world.npcs.map((n) => [n.id, n.name]));

        // Parse relationships into lookup maps
        const factionTerritories = new Map<string, string[]>();
        const npcFaction = new Map<string, string>();
        for (const rel of world.relationships) {
          if (rel.tags.includes("Controls")) {
            // entityA = factionId, entityB = locationId
            const factionName = factionIdToName.get(rel.entityA);
            const locationName = locationIdToName.get(rel.entityB);
            if (factionName && locationName) {
              const existing = factionTerritories.get(factionName) ?? [];
              existing.push(locationName);
              factionTerritories.set(factionName, existing);
            }
          } else if (rel.tags.includes("Member")) {
            // entityA = npcId, entityB = factionId
            const nName = npcIdToName.get(rel.entityA);
            const fName = factionIdToName.get(rel.entityB);
            if (nName && fName) {
              npcFaction.set(nName, fName);
            }
          }
        }

        const editableScaffold: EditableScaffold = {
          refinedPremise: campaign.premise,
          locations: world.locations.map((loc) => ({
            name: loc.name,
            description: loc.description,
            tags: loc.tags,
            isStarting: loc.isStarting,
            connectedTo: loc.connectedTo
              .map((id) => locationIdToName.get(id))
              .filter((n): n is string => n != null),
          })),
          factions: world.factions.map((fac) => ({
            name: fac.name,
            tags: fac.tags,
            goals: fac.goals,
            assets: fac.assets,
            territoryNames: factionTerritories.get(fac.name) ?? [],
          })),
          npcs: world.npcs.map((npc) => {
            const goals = npc.goals as Record<string, unknown>;
            const shortTerm = Array.isArray(goals.short_term)
              ? (goals.short_term as string[])
              : Array.isArray(goals.shortTerm)
                ? (goals.shortTerm as string[])
                : [];
            const longTerm = Array.isArray(goals.long_term)
              ? (goals.long_term as string[])
              : Array.isArray(goals.longTerm)
                ? (goals.longTerm as string[])
                : [];
            return {
              name: npc.name,
              persona: npc.persona,
              tags: npc.tags,
              goals: { shortTerm, longTerm },
              locationName: npc.currentLocationId
                ? locationIdToName.get(npc.currentLocationId) ?? ""
                : "",
              factionName: npcFaction.get(npc.name) ?? null,
            };
          }),
          loreCards: lore.map((lc) => ({
            term: lc.term,
            definition: lc.definition,
            category: lc.category,
          })),
        };

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
            body = { section: "premise", additionalInstruction };
            break;
          case "locations":
            body = { section: "locations", refinedPremise: scaffold.refinedPremise, additionalInstruction };
            break;
          case "factions":
            body = { section: "factions", refinedPremise: scaffold.refinedPremise, locationNames, additionalInstruction };
            break;
          case "npcs":
            body = { section: "npcs", refinedPremise: scaffold.refinedPremise, locationNames, factionNames, additionalInstruction };
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
    [scaffold],
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
