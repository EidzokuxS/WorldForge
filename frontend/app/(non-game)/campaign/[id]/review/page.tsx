"use client";

import { use, useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
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

function titleParts(title: string): { lead: string; accent: string } {
  const normalized = title.trim();
  const lastSpace = normalized.lastIndexOf(" ");
  if (lastSpace <= 0) {
    return { lead: normalized, accent: "" };
  }
  return {
    lead: normalized.slice(0, lastSpace),
    accent: normalized.slice(lastSpace + 1),
  };
}

function EmName({ name, className }: { name: string; className?: string }) {
  const parts = titleParts(name);

  return (
    <span className={className}>
      {parts.lead}
      {parts.accent ? (
        <>
          {" "}
          <em>{parts.accent}</em>
        </>
      ) : null}
    </span>
  );
}

function roman(index: number): string {
  const numerals = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];
  return numerals[index] ?? `${index + 1}`;
}

function initials(name: string): string {
  const value = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return value || "?";
}

function textList(values: Array<string | null | undefined>, fallback: string): string {
  const clean = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  return clean.length > 0 ? clean.join(" · ") : fallback;
}

function firstSentence(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  const sentence = normalized.match(/^.+?[.!?](?:\s|$)/)?.[0]?.trim();
  return sentence || normalized;
}

function compactText(values: Array<string | string[] | null | undefined>, fallback: string): string {
  const clean = values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return clean.length > 0 ? clean.join(" · ") : fallback;
}

function locationKindLabel(location: ScaffoldLocation): string {
  if (location.kind === "persistent_sublocation") {
    return location.parentLocationName ? `under ${location.parentLocationName}` : "scene location";
  }
  if (location.kind === "macro") {
    return "major location";
  }
  return "location";
}

function npcPlacement(npc: ScaffoldNpc): string {
  return npc.sceneLocationName || npc.locationName || "unplaced";
}

function toneFor(value: string | null | undefined): string {
  const source = value?.toLowerCase() ?? "";
  if (source.includes("silent") || source.includes("oracle") || source.includes("cold")) {
    return "silent";
  }
  if (source.includes("ghost") || source.includes("dead") || source.includes("sleep")) {
    return "ghost";
  }
  if (source.includes("child") || source.includes("born")) {
    return "children";
  }
  if (source.includes("machine") || source.includes("ship") || source.includes("system")) {
    return "machine";
  }
  if (source.includes("rebel") || source.includes("heretic") || source.includes("recidiv")) {
    return "recidivists";
  }
  return "custodes";
}

function chipClass(tone?: "ember" | "cold" | "gold" | "danger"): string {
  return tone ? `wf-review-chip wf-review-chip-${tone}` : "wf-review-chip";
}

function ReviewChip({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "ember" | "cold" | "gold" | "danger";
}) {
  return <span className={chipClass(tone)}>{children}</span>;
}

function TarotCard({
  sigil,
  label,
  size = "lg",
  tone,
}: {
  sigil: string;
  label: string;
  size?: "sm" | "lg" | "xl";
  tone?: string | null;
}) {
  return (
    <div className={`wf-review-tarot wf-review-tarot-${size}`} data-faction={toneFor(tone)}>
      <div className="wf-review-tarot-sigil">{sigil}</div>
      <div className="wf-review-tarot-name">{label}</div>
    </div>
  );
}

function StatBlock({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div className="wf-review-stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function npcProfileText(npc: ScaffoldNpc): string {
  return compactText(
    [
      npc.draft?.profile.personaSummary,
      npc.draft?.profile.backgroundSummary,
      npc.persona,
    ],
    "No persona written yet.",
  );
}

function npcDetailRows(npc: ScaffoldNpc): Array<{ label: string; value: string }> {
  const draft = npc.draft;
  const skills = draft?.capabilities.skills?.map((skill) =>
    skill.tier ? `${skill.name} (${skill.tier})` : skill.name,
  );

  return [
    {
      label: "Identity",
      value: compactText(
        [
          draft?.profile.species,
          draft?.profile.ageText,
          draft?.profile.gender,
          draft?.identity.baseFacts?.socialRole,
          npc.tier,
        ],
        textList([npc.tier, npc.factionName], "cast"),
      ),
    },
    {
      label: "Background",
      value: compactText(
        [
          draft?.identity.baseFacts?.biography,
          draft?.profile.backgroundSummary,
          npc.persona,
        ],
        "No background written yet.",
      ),
    },
    {
      label: "Motives",
      value: compactText(
        [
          draft?.motivations.shortTermGoals,
          npc.goals?.shortTerm,
          draft?.motivations.drives,
        ],
        "No short-term goal written yet.",
      ),
    },
    {
      label: "Long arc",
      value: compactText(
        [
          draft?.motivations.longTermGoals,
          npc.goals?.longTerm,
          draft?.motivations.beliefs,
        ],
        "No long-term goal written yet.",
      ),
    },
    {
      label: "Pressure",
      value: compactText(
        [
          draft?.identity.behavioralCore?.pressureResponses,
          draft?.motivations.frictions,
          draft?.startConditions.entryPressure,
        ],
        "No pressure response written yet.",
      ),
    },
    {
      label: "Capabilities",
      value: compactText(
        [
          draft?.capabilities.specialties,
          draft?.capabilities.traits,
          skills,
          draft?.loadout.signatureItems,
        ],
        "No capabilities written yet.",
      ),
    },
    {
      label: "Placement",
      value: compactText(
        [
          draft?.socialContext.currentLocationName,
          draft?.socialContext.homeLocationName,
          npc.locationName,
          npc.sceneLocationName,
        ],
        "Unplaced",
      ),
    },
  ];
}

export default function WorldReviewPage(props: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(props.params);
  const router = useRouter();

  const [scaffold, setScaffold] = useState<EditableScaffold | null>(null);
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [loreCards, setLoreCards] = useState<LoreCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generationRequired, setGenerationRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedNpcKey, setSelectedNpcKey] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const campaign = await loadCampaign(campaignId);
        setCampaignName(campaign.name);
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
          body = { campaignId, section: "npcs", refinedPremise: scaffold.refinedPremise, locations: scaffold.locations, locationNames, factionNames, additionalInstruction };
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

  const openNpcEditor = useCallback(() => {
    setActiveTab("edit");
    window.setTimeout(() => {
      document.getElementById("wf-review-npc-editor")?.scrollIntoView?.({
        block: "start",
        behavior: "smooth",
      });
    }, 0);
  }, []);

  if (loading) {
    return (
      <div className="wf-v4-page flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (generationRequired) {
    return (
      <div className="wf-v4-page">
      <div className="wf-v4-card p-8">
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="wf-kicker wf-kicker-ember">
              Campaign Readiness
            </p>
            <h2 className="font-serif text-4xl text-[var(--fg)]">World generation required</h2>
          </div>
          <p className="max-w-2xl text-sm text-[var(--fg-2)]">
            Finish generating this campaign before opening World Review. The review workspace unlocks once the scaffold and world data are available.
          </p>
          <Button asChild size="lg">
            <Link href="/campaign/new">Return to Creation Flow</Link>
          </Button>
        </div>
      </div>
      </div>
    );
  }

  if (!scaffold) {
    return <div className="wf-v4-page text-sm text-[var(--fg-2)]">Failed to load world data.</div>;
  }

  const displayName = campaignName ?? "World Review";
  const title = titleParts(displayName);
  const startingLocation = scaffold.locations.find((location) => location.isStarting) ?? scaffold.locations[0] ?? null;
  const castAtStart = startingLocation
    ? scaffold.npcs.filter((npc) =>
        npc.locationName === startingLocation.name ||
        npc.sceneLocationName === startingLocation.name,
      )
    : [];
  const openingCastLabel = castAtStart.length > 0
    ? castAtStart.slice(0, 3).map((npc) => npc.name).join(", ")
    : "No cast assigned yet";
  const npcEntries = scaffold.npcs.map((npc, index) => ({
    npc,
    key: npc._uid ?? `${npc.name}-${index}`,
    index,
  }));
  const keyCast = npcEntries.filter(({ npc }) => npc.tier === "key");
  const supportCast = npcEntries.filter(({ npc }) => npc.tier !== "key");
  const selectedNpcEntry =
    npcEntries.find((entry) => entry.key === selectedNpcKey) ??
    npcEntries[0] ??
    null;
  const selectedNpc = selectedNpcEntry?.npc ?? null;
  const selectedNpcResolvedKey = selectedNpcEntry?.key ?? null;
  const dnaRows = [
    {
      key: "Premise",
      value: scaffold.refinedPremise,
    },
    {
      key: "Opening scene",
      value: startingLocation
        ? `${startingLocation.name}. ${startingLocation.description}`
        : "No starting location is marked yet.",
    },
    {
      key: "Cast focus",
      value: keyCast.length > 0
        ? keyCast.map(({ npc }) => npc.name).join(", ")
        : "No key cast exists yet.",
    },
    {
      key: "Faction pressure",
      value: scaffold.factions.length > 0
        ? scaffold.factions.map((faction) => faction.name).join(", ")
        : "No factions generated yet.",
    },
    {
      key: "Location graph",
      value: startingLocation
        ? textList(
            [
              locationKindLabel(startingLocation),
              (startingLocation.connectedTo?.length ?? 0) > 0
                ? `connected to ${startingLocation.connectedTo.join(", ")}`
                : null,
            ],
            "No location graph details yet.",
          )
        : "No location graph details yet.",
    },
    {
      key: "Lore library",
      value: loreCards.length > 0
        ? textList([...new Set(loreCards.map((card) => card.category))], "Lore cards exist without categories.")
        : "No lore cards are attached yet.",
    },
  ];

  return (
    <ReviewWorkspace className="wf-review-screen">
      <div className="wf-review-frame">
      <header className="wf-review-head">
        <div>
          <h1 className="wf-review-title wf-serif-em">
            {title.lead}
            {title.accent ? (
              <>
                {" "}
                <em>{title.accent}</em>
              </>
            ) : null}
          </h1>
          <p className="wf-review-sub">
            {scaffold.npcs.length} characters · {scaffold.locations.length} locations · {scaffold.factions.length} factions · {loreCards.length} lore cards
          </p>
        </div>
        <div className="wf-review-cta">
          <Button type="button" variant="outline" className="wf-v4-btn" onClick={() => setActiveTab("edit")}>
            Edit world
          </Button>
          <Button className="wf-v4-btn wf-v4-btn-primary" onClick={handleSaveAndContinue} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Continue to Character"
            )}
          </Button>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="wf-review-tabs flex min-h-0 flex-1 flex-col">
        <TabsList variant="line" className="wf-review-tablist">
          <TabsTrigger value="overview" className="wf-review-tab">Overview</TabsTrigger>
          <TabsTrigger value="cast" className="wf-review-tab">Cast <span className="wf-review-tab-count">{scaffold.npcs.length}</span></TabsTrigger>
          <TabsTrigger value="locations" className="wf-review-tab">Locations <span className="wf-review-tab-count">{scaffold.locations.length}</span></TabsTrigger>
          <TabsTrigger value="factions" className="wf-review-tab">Factions <span className="wf-review-tab-count">{scaffold.factions.length}</span></TabsTrigger>
          <TabsTrigger value="lore" className="wf-review-tab">Lore cards <span className="wf-review-tab-count">{loreCards.length}</span></TabsTrigger>
          <TabsTrigger value="dna" className="wf-review-tab">World DNA</TabsTrigger>
        </TabsList>

        <div className="wf-review-body">
          <TabsContent value="overview" className="wf-review-panel wf-review-overview">
            <div className="wf-review-health">
              <StatBlock value={scaffold.npcs.length} label="NPCs" />
              <StatBlock value={scaffold.locations.length} label="Locations" />
              <StatBlock value={scaffold.factions.length} label="Factions" />
              <StatBlock value={loreCards.length} label="Lore cards" />
            </div>

            <section className="wf-review-over-section">
              <h3>Premise</h3>
              <p>{scaffold.refinedPremise}</p>
            </section>

            <section className="wf-review-over-section">
              <h3>Where it begins</h3>
              <p>
                {startingLocation
                  ? `${startingLocation.name}. ${openingCastLabel}.`
                  : "No starting location is marked yet."}
              </p>
              <div className="wf-review-over-row">
                <Button type="button" variant="outline" className="wf-v4-btn" onClick={() => setActiveTab("locations")}>
                  Inspect locations →
                </Button>
                <Button type="button" variant="outline" className="wf-v4-btn" onClick={() => setActiveTab("cast")}>
                  Inspect cast →
                </Button>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="cast" className="wf-review-panel wf-review-cast">
            <div className="wf-review-cast-board">
              <section className="wf-review-cast-group">
                <div className="wf-review-cast-group-head">
                  <span className="wf-kicker wf-kicker-ember">key cast · {keyCast.length}</span>
                  <span className="wf-review-group-sub">primary movers in the generated world</span>
                  <Button type="button" variant="outline" className="wf-v4-btn wf-review-cast-create" onClick={openNpcEditor}>
                    <Plus className="h-3.5 w-3.5" />
                    Create NPC
                  </Button>
                </div>
                <div className="wf-review-cast-grid">
                  {keyCast.length > 0 ? keyCast.map(({ npc, key, index }) => (
                    <button
                      key={key}
                      type="button"
                      className="wf-review-npc"
                      data-selected={key === selectedNpcResolvedKey}
                      onClick={() => setSelectedNpcKey(key)}
                    >
                      <TarotCard sigil={initials(npc.name)} label={npc.tier} tone={npc.factionName ?? (npc.tags ?? []).join(" ")} />
                      <div>
                        <div className="wf-review-npc-head">
                          <EmName name={npc.name} className="wf-review-npc-name" />
                          <span className="wf-review-npc-role">{textList([npc.tier, npc.factionName], "unaffiliated")}</span>
                        </div>
                        <p className="wf-review-npc-hook">{firstSentence(npc.persona, "No persona written yet.")}</p>
                        <div className="wf-review-npc-meta">
                          <ReviewChip>{npcPlacement(npc)}</ReviewChip>
                          {castAtStart.includes(npc) ? <ReviewChip tone="cold">scene present</ReviewChip> : null}
                          {index === 0 ? <ReviewChip tone="ember">first cast</ReviewChip> : null}
                        </div>
                      </div>
                    </button>
                  )) : (
                    <div className="wf-review-empty">No key cast exists yet.</div>
                  )}
                </div>
              </section>

              <section className="wf-review-cast-group">
                <div className="wf-review-cast-group-head">
                  <span className="wf-kicker">supporting cast · {supportCast.length}</span>
                </div>
                <div className="wf-review-cast-grid wf-review-cast-grid-mini">
                  {supportCast.length > 0 ? supportCast.map(({ npc, key }) => (
                    <button
                      key={key}
                      type="button"
                      className="wf-review-npc wf-review-npc-mini"
                      data-selected={key === selectedNpcResolvedKey}
                      onClick={() => setSelectedNpcKey(key)}
                    >
                      <TarotCard sigil={initials(npc.name)} label={npc.tier} size="sm" tone={npc.factionName ?? (npc.tags ?? []).join(" ")} />
                      <div>
                        <EmName name={npc.name} className="wf-review-npc-name" />
                        <span className="wf-review-npc-role">{textList([npc.factionName, npcPlacement(npc)], "supporting")}</span>
                      </div>
                    </button>
                  )) : (
                    <div className="wf-review-empty">No supporting cast generated yet.</div>
                  )}
                </div>
              </section>

              <section className="wf-review-create-card" aria-label="Create an NPC">
                <div>
                  <h3>Create an NPC</h3>
                  <p>Add, import, research, or AI-generate a cast member through the real review editor.</p>
                </div>
                <div className="wf-review-create-actions">
                  <Button type="button" variant="outline" className="wf-v4-btn" onClick={openNpcEditor}>
                    <Plus className="h-3.5 w-3.5" />
                    Open NPC editor
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="wf-v4-btn"
                    onClick={() => handleRegenerate("npcs", "Add or refresh generated cast while preserving existing locations, sublocations, and factions.")}
                    disabled={regenerating === "npcs"}
                  >
                    {regenerating === "npcs" ? "Regenerating..." : "Regenerate cast"}
                  </Button>
                </div>
              </section>
            </div>

            <aside className="wf-review-profile">
              {selectedNpc ? (
                <>
                  <div className="wf-review-profile-head">
                    <TarotCard
                      sigil={initials(selectedNpc.name)}
                      label={selectedNpc.tier}
                      size="xl"
                      tone={selectedNpc.factionName ?? (selectedNpc.tags ?? []).join(" ")}
                    />
                    <div>
                      <div className="wf-review-profile-sub">{textList([selectedNpc.tier, selectedNpc.factionName], "cast")}</div>
                      <EmName name={selectedNpc.name} className="wf-review-profile-name" />
                      <div className="wf-review-profile-tags">
                        <ReviewChip tone="ember">{npcPlacement(selectedNpc)}</ReviewChip>
                        {(selectedNpc.tags ?? []).slice(0, 2).map((tag) => <ReviewChip key={tag}>{tag}</ReviewChip>)}
                      </div>
                    </div>
                  </div>
                  <blockquote className="wf-review-profile-quote">
                    {npcProfileText(selectedNpc)}
                    <span className="wf-review-profile-quote-from">generated cast profile</span>
                  </blockquote>
                  <div className="wf-review-profile-grid">
                    {npcDetailRows(selectedNpc).map((row) => (
                      <div key={row.label} className="wf-review-profile-field">
                        <span>{row.label}</span>
                        <p>{row.value}</p>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="wf-v4-btn"
                    onClick={() => handleRegenerate("npcs", "Keep existing locations, sublocations, and faction names intact.")}
                    disabled={regenerating === "npcs"}
                  >
                    {regenerating === "npcs" ? "Regenerating..." : "Regenerate cast"}
                  </Button>
                </>
              ) : (
                <div className="wf-review-empty">No cast generated yet.</div>
              )}
            </aside>
          </TabsContent>

          <TabsContent value="locations" className="wf-review-panel wf-review-locs">
            {scaffold.locations.length > 0 ? scaffold.locations.map((location, index) => (
              <div key={`${location.name}-${index}`} className="wf-review-locrow">
                <div className="wf-review-locrow-num">{roman(index)}.</div>
                <div>
                  <EmName name={location.name} className="wf-review-locrow-title" />
                  <div className="wf-review-locrow-sub">
                    {textList([locationKindLabel(location), location.parentLocationName], "location")}
                  </div>
                </div>
                <p className="wf-review-locrow-desc">{location.description || "No description written yet."}</p>
                <div className="wf-review-locrow-tags">
                  {location.isStarting ? <ReviewChip tone="ember">opening scene</ReviewChip> : null}
                  {(location.connectedTo?.length ?? 0) > 0 ? <ReviewChip tone="cold">{location.connectedTo.length} links</ReviewChip> : null}
                  {(location.tags ?? []).slice(0, 2).map((tag) => <ReviewChip key={tag}>{tag}</ReviewChip>)}
                </div>
              </div>
            )) : (
              <div className="wf-review-empty">No locations generated yet.</div>
            )}
          </TabsContent>

          <TabsContent value="factions" className="wf-review-panel wf-review-factions">
            {scaffold.factions.length > 0 ? scaffold.factions.map((faction) => {
              const members = scaffold.npcs.filter((npc) => npc.factionName === faction.name);
              return (
                <div key={faction.name} className="wf-review-faction" data-faction={toneFor(faction.name)}>
                  <div className="wf-review-faction-sigil">{initials(faction.name)}</div>
                  <div>
                    <EmName name={faction.name} className="wf-review-faction-name" />
                    <p className="wf-review-faction-hook">{textList(faction.goals ?? [], "No faction goal written yet.")}</p>
                    <div className="wf-review-faction-count">
                      <b>{members.length}</b> cast members · <b>{faction.territoryNames?.length ?? 0}</b> territories · <b>{faction.assets?.length ?? 0}</b> assets
                    </div>
                    <div className="wf-review-npc-meta">
                      {(faction.tags ?? []).slice(0, 3).map((tag) => <ReviewChip key={tag}>{tag}</ReviewChip>)}
                    </div>
                  </div>
                  <div className="wf-review-faction-members">
                    {members.slice(0, 8).map((npc) => (
                      <div key={npc._uid ?? npc.name} className="wf-review-faction-member">
                        <TarotCard sigil={initials(npc.name)} label={npc.name} size="sm" tone={faction.name} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }) : (
              <div className="wf-review-empty">No factions generated yet.</div>
            )}
          </TabsContent>

          <TabsContent value="lore" className="wf-review-panel wf-review-lore">
            {loreCards.length > 0 ? loreCards.map((card, index) => (
              <article key={card.id} className="wf-review-lore-card">
                <div className="wf-review-lore-num">
                  {roman(index)}{index === 0 ? ` of ${roman(loreCards.length)}` : "."}
                </div>
                <EmName name={card.term} className="wf-review-lore-title" />
                <p className="wf-review-lore-p">{card.definition}</p>
                <ReviewChip tone="gold">{card.category}</ReviewChip>
              </article>
            )) : (
              <div className="wf-review-empty">No lore cards available.</div>
            )}
          </TabsContent>

          <TabsContent value="dna" className="wf-review-panel wf-review-dna">
            {dnaRows.map((row) => (
              <div key={row.key} className="wf-review-dna-row">
                <div className="wf-review-dna-key">{row.key}</div>
                <div className="wf-review-dna-value">{row.value}</div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="edit" className="wf-review-panel wf-review-edit-panel">
            <div className="wf-review-edit-grid">
              <PremiseSection
                refinedPremise={scaffold.refinedPremise}
                onChange={(refinedPremise: string) => setScaffold((current) => current ? { ...current, refinedPremise } : current)}
                onRegenerate={(instruction: string | undefined) => handleRegenerate("premise", instruction)}
                regenerating={regenerating === "premise"}
              />
              <LocationsSection
                locations={scaffold.locations}
                onChange={(locations: ScaffoldLocation[]) => setScaffold((current) => current ? { ...current, locations } : current)}
                onRegenerate={(instruction: string | undefined) => handleRegenerate("locations", instruction)}
                regenerating={regenerating === "locations"}
              />
              <FactionsSection
                factions={scaffold.factions}
                locationNames={scaffold.locations.map((location) => location.name)}
                onChange={(factions: ScaffoldFaction[]) => setScaffold((current) => current ? { ...current, factions } : current)}
                onRegenerate={(instruction: string | undefined) => handleRegenerate("factions", instruction)}
                regenerating={regenerating === "factions"}
              />
              <section id="wf-review-npc-editor" className="wf-review-edit-anchor">
                <NpcsSection
                  npcs={scaffold.npcs}
                  campaignId={campaignId}
                  locations={scaffold.locations}
                  locationNames={scaffold.locations.map((location) => location.name)}
                  factionNames={scaffold.factions.map((faction) => faction.name)}
                  onChange={(npcs: ScaffoldNpc[]) => setScaffold((current) => current ? { ...current, npcs } : current)}
                  onRegenerate={(instruction: string | undefined) => handleRegenerate("npcs", instruction)}
                  regenerating={regenerating === "npcs"}
                />
              </section>
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
            </div>
          </TabsContent>
        </div>
      </Tabs>
      </div>
    </ReviewWorkspace>
  );
}
