"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { CampaignWorldReview, CampaignWorldStatus } from "@worldforge/shared";

import { useCampaignStatus } from "@/components/non-game-shell/campaign-status-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActorsSection } from "@/components/world-review/actors-section";
import { ConnectionsSection } from "@/components/world-review/connections-section";
import { LocationsSection } from "@/components/world-review/locations-section";
import { OverviewSection } from "@/components/world-review/overview-section";
import { ReviewWorkspace } from "@/components/world-review/review-workspace";
import {
  acceptCampaignWorld,
  loadCampaignWorldState,
  type CampaignWorldStateResponse,
} from "@/lib/campaign-world-api";
import { presentCampaignWorldResearchSummary } from "@/lib/campaign-world-research";

type ReviewTab = "overview" | "locations" | "actors" | "connections" | "source";

function errorMessage(error: unknown, message: string): string {
  return error instanceof Error ? error.message : message;
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function titleParts(title: string): { lead: string; accent: string } {
  const normalized = title.trim();
  const lastSpace = normalized.lastIndexOf(" ");
  if (lastSpace <= 0) return { lead: normalized, accent: "" };
  return {
    lead: normalized.slice(0, lastSpace),
    accent: normalized.slice(lastSpace + 1),
  };
}

function repeatedId(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function projectionIntegrityError(world: CampaignWorldReview): string | null {
  const collections: Array<{ label: string; ids: string[] }> = [
    { label: "location", ids: world.locations.map((location) => location.id) },
    { label: "route", ids: world.routes.map((route) => route.id) },
    { label: "actor", ids: world.actors.map((actor) => actor.id) },
    { label: "goal", ids: world.goals.map((goal) => goal.id) },
    { label: "relation", ids: world.relations.map((relation) => relation.id) },
    { label: "placement", ids: world.placements.map((placement) => placement.id) },
    { label: "pressure", ids: world.pressures.map((pressure) => pressure.id) },
  ];
  for (const collection of collections) {
    const duplicate = repeatedId(collection.ids);
    if (duplicate) return `Duplicate ${collection.label} ID: ${duplicate}`;
  }

  const locationIds = new Set(world.locations.map((location) => location.id));
  const actorIds = new Set(world.actors.map((actor) => actor.id));
  for (const location of world.locations) {
    if (location.parentLocationId && !locationIds.has(location.parentLocationId)) {
      return `Missing parent location: ${location.parentLocationId}`;
    }
  }
  for (const route of world.routes) {
    if (!locationIds.has(route.fromLocationId) || !locationIds.has(route.toLocationId)) {
      return `Missing route endpoint: ${route.id}`;
    }
  }
  for (const goal of world.goals) {
    if (!actorIds.has(goal.actorId)) return `Missing goal actor: ${goal.id}`;
  }
  for (const relation of world.relations) {
    if (!actorIds.has(relation.sourceActorId) || !actorIds.has(relation.targetActorId)) {
      return `Missing relation endpoint: ${relation.id}`;
    }
  }
  for (const placement of world.placements) {
    if (!actorIds.has(placement.actorId) || !locationIds.has(placement.locationId)) {
      return `Missing placement endpoint: ${placement.id}`;
    }
  }
  for (const pressure of world.pressures) {
    if (
      pressure.actorIds.some((actorId) => !actorIds.has(actorId))
      || pressure.locationIds.some((locationId) => !locationIds.has(locationId))
    ) {
      return `Missing pressure anchor: ${pressure.id}`;
    }
  }
  return null;
}

function statusLabel(status: CampaignWorldStatus): string {
  if (status === "unbuilt") return "World awaits creation";
  if (status === "building") return "World is taking shape";
  if (status === "failed") return "World build needs attention";
  if (status === "accepted") return "World accepted";
  return "World ready for review";
}

function SourceSection({ world }: { world: CampaignWorldReview }) {
  const dna = world.source.dna;
  const researchSummary = presentCampaignWorldResearchSummary(
    world.source.researchSummary,
  );
  const dnaEntries = dna ? [
    ["Geography", dna.geography],
    ["Political structure", dna.politicalStructure],
    ["Central conflict", dna.centralConflict],
    ["Cultural flavor", dna.culturalFlavor],
    ["Environment", dna.environment],
    ["Wildcard", dna.wildcard],
  ] : [];

  return (
    <div className="wf-world-source-review">
      <section>
        <span>Persisted premise</span>
        <p>{world.source.premise}</p>
      </section>

      <section>
        <header className="wf-world-review-section-head">
          <h2>World DNA</h2>
          <span>{dna ? "included" : "premise only"}</span>
        </header>
        {dna ? (
          <dl className="wf-world-source-dna">
            {dnaEntries.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        ) : (
          <p className="wf-review-empty">This world was built from its premise.</p>
        )}
      </section>

      {researchSummary ? (
        <section>
          <header className="wf-world-review-section-head"><h2>Research summary</h2></header>
          <dl className="wf-world-source-dna">
            <div><dt>Interpretation</dt><dd>{researchSummary.interpretation}</dd></div>
            {researchSummary.tonalNotes.length > 0 ? (
              <div><dt>Tonal anchors</dt><dd>{researchSummary.tonalNotes.join(" · ")}</dd></div>
            ) : null}
            {researchSummary.ambiguityNotes.length > 0 ? (
              <div><dt>Research caveats</dt><dd>{researchSummary.ambiguityNotes.join(" · ")}</dd></div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {world.source.sourceReferences.length > 0 ? (
        <section>
          <header className="wf-world-review-section-head"><h2>Source references</h2></header>
          <ul className="wf-world-source-references">
            {world.source.sourceReferences.map((reference) => (
              <li key={reference.id}><strong>{reference.label}</strong><span>{reference.sourceType}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default function WorldReviewPage(props: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(props.params);
  const { campaign, refreshCampaignWorldState } = useCampaignStatus();
  const [state, setState] = useState<CampaignWorldStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [statusRefreshNotice, setStatusRefreshNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReviewTab>("overview");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void loadCampaignWorldState(campaignId)
      .then((loadedState) => {
        if (!cancelled) setState(loadedState);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(errorMessage(error, "World Review could not load."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  function openLocation(locationId?: string) {
    if (locationId) setSelectedLocationId(locationId);
    setActiveTab("locations");
  }

  function openActor(actorId?: string) {
    if (actorId) setSelectedActorId(actorId);
    setActiveTab("actors");
  }

  async function handleAcceptWorld() {
    if (!state || state.status !== "review" || accepting) return;
    setAccepting(true);
    setAcceptError(null);
    setConflict(null);
    setStatusRefreshNotice(null);
    try {
      await acceptCampaignWorld(campaignId, state.world.version, state.world.contentHash);
      const acceptedState = await loadCampaignWorldState(campaignId);
      if (acceptedState.status !== "accepted") {
        throw new Error("Acceptance finished without a persisted accepted world.");
      }
      setState(acceptedState);
      try {
        await refreshCampaignWorldState();
      } catch {
        setStatusRefreshNotice(
          "World accepted. Campaign status could not be refreshed.",
        );
      }
    } catch (error) {
      if (errorCode(error) === "world_version_conflict") {
        setConflict(errorMessage(error, "The world changed before acceptance."));
        const currentState = await loadCampaignWorldState(campaignId);
        setState(currentState);
      } else {
        setAcceptError(errorMessage(error, "The world could not be accepted."));
      }
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="wf-v4-page flex min-h-[50vh] items-center justify-center text-[var(--fg-2)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading World Review
      </div>
    );
  }

  if (loadError || !state) {
    return (
      <div className="wf-v4-page">
        <section className="wf-v4-card p-8">
          <h1 className="font-serif text-4xl text-[var(--fg)]">World Review could not load.</h1>
          <p className="mt-3 text-sm text-[var(--fg-2)]">{loadError ?? "Campaign World state is unavailable."}</p>
        </section>
      </div>
    );
  }

  if (state.status !== "review" && state.status !== "accepted") {
    return (
      <div className="wf-v4-page">
        <section className="wf-v4-card p-8">
          <p className="wf-kicker wf-kicker-ember">Campaign World</p>
          <h1 className="mt-3 font-serif text-4xl text-[var(--fg)]">{statusLabel(state.status)}</h1>
          <p className="mt-3 max-w-2xl text-sm text-[var(--fg-2)]">
            Campaign Forge owns world construction and its durable build record.
          </p>
          <Link className="wf-v4-btn mt-6 w-fit" href={`/campaign/${campaignId}/forge`}>Open Campaign Forge</Link>
        </section>
      </div>
    );
  }

  const world = state.world;
  const integrityError = projectionIntegrityError(world);
  if (integrityError) {
    return (
      <div className="wf-v4-page">
        <section className="wf-v4-card p-8" role="alert">
          <h1 className="font-serif text-4xl text-[var(--fg)]">Campaign World integrity check failed.</h1>
          <p className="mt-3 text-sm text-red-300">{integrityError}</p>
        </section>
      </div>
    );
  }

  const displayName = campaign?.id === campaignId ? campaign.name : "World Review";
  const title = titleParts(displayName);

  return (
    <ReviewWorkspace className="wf-review-screen wf-world-review-screen">
      <div className="wf-review-frame">
        <header className="wf-review-head">
          <div>
            <h1 className="wf-review-title wf-serif-em">
              {title.lead}{title.accent ? <> <em>{title.accent}</em></> : null}
            </h1>
            <p className="wf-review-sub">{world.worldSummary}</p>
          </div>
          <div className="wf-review-cta">
            {state.status === "review" ? (
              <button
                type="button"
                className="wf-v4-btn wf-v4-btn-primary"
                onClick={() => void handleAcceptWorld()}
                disabled={accepting}
              >
                {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {accepting ? "Accepting world" : "Accept world"}
              </button>
            ) : (
              <span className="wf-world-accepted-mark">World accepted</span>
            )}
          </div>
        </header>

        <div
          className={conflict || acceptError ? "wf-world-review-notice" : "hidden"}
          role={conflict || acceptError ? "alert" : undefined}
          data-kind={conflict ? "conflict" : "error"}
        >
          {conflict ?? acceptError}
        </div>
        {statusRefreshNotice ? (
          <div className="wf-world-review-notice" role="status">
            {statusRefreshNotice}
          </div>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ReviewTab)}
          className="wf-review-tabs flex min-h-0 flex-1 flex-col"
        >
          <TabsList variant="line" className="wf-review-tablist">
            <TabsTrigger value="overview" className="wf-review-tab">Overview</TabsTrigger>
            <TabsTrigger value="locations" className="wf-review-tab">Locations <span className="wf-review-tab-count">{world.locations.length}</span></TabsTrigger>
            <TabsTrigger value="actors" className="wf-review-tab">Actors <span className="wf-review-tab-count">{world.actors.length}</span></TabsTrigger>
            <TabsTrigger value="connections" className="wf-review-tab">Connections <span className="wf-review-tab-count">{world.relations.length + world.pressures.length}</span></TabsTrigger>
            <TabsTrigger value="source" className="wf-review-tab">Source</TabsTrigger>
          </TabsList>

          <div className="wf-review-body">
            <TabsContent value="overview" className="wf-review-panel">
              <OverviewSection
                world={world}
                onOpenLocations={() => openLocation()}
                onOpenActors={() => openActor()}
                onOpenConnections={() => setActiveTab("connections")}
              />
            </TabsContent>
            <TabsContent value="locations" className="wf-review-panel">
              <LocationsSection
                locations={world.locations}
                routes={world.routes}
                selectedLocationId={selectedLocationId}
                onSelectLocation={setSelectedLocationId}
              />
            </TabsContent>
            <TabsContent value="actors" className="wf-review-panel">
              <ActorsSection
                actors={world.actors}
                goals={world.goals}
                placements={world.placements}
                relations={world.relations}
                locations={world.locations}
                selectedActorId={selectedActorId}
                onSelectActor={setSelectedActorId}
                onSelectLocation={openLocation}
              />
            </TabsContent>
            <TabsContent value="connections" className="wf-review-panel">
              <ConnectionsSection
                actors={world.actors}
                locations={world.locations}
                relations={world.relations}
                pressures={world.pressures}
                onSelectActor={openActor}
                onSelectLocation={openLocation}
              />
            </TabsContent>
            <TabsContent value="source" className="wf-review-panel">
              <SourceSection world={world} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </ReviewWorkspace>
  );
}
