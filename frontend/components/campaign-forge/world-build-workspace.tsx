"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, Plus, RotateCcw, X } from "lucide-react";
import type {
  CampaignWorldBuildEvent,
  CampaignWorldBuildStage,
  CampaignWorldDna,
  CampaignWorldSource,
} from "@worldforge/shared";

import type {
  CampaignWorldStateResponse,
  StartedCampaignWorldBuild,
} from "@/lib/campaign-world-api";
import { presentCampaignWorldResearchSummary } from "@/lib/campaign-world-research";

type StageVisualState = "pending" | "active" | "done" | "failed";

type WorldDnaField = keyof CampaignWorldDna;

interface WorldStageDefinition {
  title: string;
  detail: string;
  stages: readonly CampaignWorldBuildStage[];
}

const WORLD_DNA_FIELDS: ReadonlyArray<{
  field: WorldDnaField;
  label: string;
}> = [
  { field: "geography", label: "Geography" },
  { field: "politicalStructure", label: "Political structure" },
  { field: "centralConflict", label: "Central conflict" },
  { field: "culturalFlavor", label: "Cultural flavor" },
  { field: "environment", label: "Environment" },
  { field: "wildcard", label: "Wildcard" },
];

const WORLD_STAGES: readonly WorldStageDefinition[] = [
  {
    title: "Locations",
    detail: "places and directed routes",
    stages: ["world_frame"],
  },
  {
    title: "Actors",
    detail: "people and collectives",
    stages: ["world_cast"],
  },
  {
    title: "Connections",
    detail: "goals, relations, and pressures",
    stages: ["world_connections"],
  },
  {
    title: "Review preparation",
    detail: "validation and atomic commit",
    stages: ["validation", "persistence"],
  },
];

const STAGE_ACTIVITY: Record<CampaignWorldBuildStage, string> = {
  world_frame: "Establishing locations and the routes between them.",
  world_cast: "Placing people and collectives with goals of their own.",
  world_connections: "Connecting actors, pressures, and the world around them.",
  validation: "Checking references and world invariants.",
  persistence: "Committing the completed world as one durable version.",
};

export interface WorldBuildWorkspaceProps {
  campaignId: string;
  campaignName: string;
  state: CampaignWorldStateResponse;
  events: readonly CampaignWorldBuildEvent[];
  connectionError?: string | null;
  onSaveDna: (dna: CampaignWorldDna) => Promise<CampaignWorldSource>;
  onStartBuild: (sourceDigest: string) => Promise<StartedCampaignWorldBuild>;
  onBuildStarted: (build: StartedCampaignWorldBuild) => Promise<void> | void;
}

function blankDna(): CampaignWorldDna {
  return {
    geography: "",
    politicalStructure: "",
    centralConflict: "",
    culturalFlavor: "",
    environment: "",
    wildcard: "",
  };
}

function editableSource(state: CampaignWorldStateResponse): CampaignWorldSource | null {
  if (state.status === "unbuilt" || state.status === "building" || state.status === "failed") {
    return state.source;
  }
  return null;
}

function displaySource(state: CampaignWorldStateResponse) {
  if ("source" in state) {
    return state.source;
  }
  return state.world.source;
}

function completeDna(dna: CampaignWorldDna): CampaignWorldDna | null {
  const normalized: CampaignWorldDna = {
    geography: dna.geography.trim(),
    politicalStructure: dna.politicalStructure.trim(),
    centralConflict: dna.centralConflict.trim(),
    culturalFlavor: dna.culturalFlavor.trim(),
    environment: dna.environment.trim(),
    wildcard: dna.wildcard.trim(),
  };
  return Object.values(normalized).every((value) => value.length > 0) ? normalized : null;
}

function eventStageState(
  definition: WorldStageDefinition,
  state: CampaignWorldStateResponse,
  events: readonly CampaignWorldBuildEvent[],
): StageVisualState {
  if (state.status === "review" || state.status === "accepted") return "done";

  const completed = new Set<CampaignWorldBuildStage>();
  for (const event of events) {
    if (event.type === "stage_completed") completed.add(event.stage);
  }
  if (definition.stages.every((stage) => completed.has(stage))) return "done";

  const currentStage = state.currentStage;
  if (state.status === "failed" && currentStage && definition.stages.includes(currentStage)) {
    return "failed";
  }
  if (state.status === "building" && currentStage && definition.stages.includes(currentStage)) {
    return "active";
  }

  const started = events.some(
    (event) => event.type === "stage_started" && definition.stages.includes(event.stage),
  );
  return started ? "active" : "pending";
}

function eventLabel(event: CampaignWorldBuildEvent): string {
  if (event.type === "build_started") return "Build started";
  if (event.type === "build_completed") return "World committed";
  if (event.type === "build_failed") return "Build stopped";
  const stage = WORLD_STAGES.find((definition) => definition.stages.includes(event.stage));
  const stageTitle = stage?.title ?? event.stage;
  return event.type === "stage_started" ? `${stageTitle} started` : `${stageTitle} completed`;
}

function terminalFailureMessage(events: readonly CampaignWorldBuildEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "build_failed") return event.message;
  }
  return null;
}

function buildStartedAt(events: readonly CampaignWorldBuildEvent[]): number | null {
  return events.find((event) => event.type === "build_started")?.createdAt ?? null;
}

function buildEndedAt(events: readonly CampaignWorldBuildEvent[]): number | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "build_completed" || event?.type === "build_failed") return event.createdAt;
  }
  return null;
}

function activeBuildStage(
  state: CampaignWorldStateResponse,
  events: readonly CampaignWorldBuildEvent[],
): CampaignWorldBuildStage | null {
  let activeStage: CampaignWorldBuildStage | null = null;
  for (const event of events) {
    if (event.type === "stage_started") {
      activeStage = event.stage;
    } else if (event.type === "stage_completed" && event.stage === activeStage) {
      activeStage = null;
    }
  }
  return activeStage ?? state.currentStage;
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function StageRail({
  state,
  events,
}: {
  state: CampaignWorldStateResponse;
  events: readonly CampaignWorldBuildEvent[];
}) {
  return (
    <aside className="wf-gen-rail wf-world-build-rail" aria-label="World build stages">
      <div className="wf-gen-rail-h">Forge</div>
      {WORLD_STAGES.map((definition, index) => {
        const visualState = eventStageState(definition, state, events);
        return (
          <div
            key={definition.title}
            className="wf-gen-stage wf-world-build-stage"
            data-state={visualState}
          >
            <div className="wf-gen-stage-mark" aria-hidden="true">
              {visualState === "done" ? (
                <Check className="h-3 w-3" />
              ) : visualState === "active" ? ">" : visualState === "failed" ? "!" : String(index + 1)}
            </div>
            <div>
              <div className="wf-gen-stage-h">{definition.title}</div>
              <div className="wf-gen-stage-sub">{definition.detail}</div>
            </div>
          </div>
        );
      })}
    </aside>
  );
}

function SourceProvenance({
  source,
}: {
  source: ReturnType<typeof displaySource>;
}) {
  const research = presentCampaignWorldResearchSummary(source.researchSummary);
  if (!research && source.sourceReferences.length === 0) return null;

  return (
    <details className="wf-world-source-provenance">
      <summary>Source provenance</summary>
      {research ? <p>{research.interpretation}</p> : null}
      {source.sourceReferences.length > 0 ? (
        <ul>
          {source.sourceReferences.map((reference) => (
            <li key={reference.id}>
              <span>{reference.label}</span>
              <small>{reference.sourceType}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

function BuildLedger({ events }: { events: readonly CampaignWorldBuildEvent[] }) {
  if (events.length === 0) {
    return <p className="wf-world-build-ledger-empty">Loading the durable build record.</p>;
  }

  return (
    <ol className="wf-world-build-ledger" aria-label="Persisted build events">
      {events.map((event) => (
        <li key={`${event.buildId}:${event.sequence}`}>
          <span>{String(event.sequence).padStart(2, "0")}</span>
          <strong>{eventLabel(event)}</strong>
          <time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
        </li>
      ))}
    </ol>
  );
}

export function WorldBuildWorkspace({
  campaignId,
  campaignName,
  state,
  events,
  connectionError = null,
  onSaveDna,
  onStartBuild,
  onBuildStarted,
}: WorldBuildWorkspaceProps) {
  const source = displaySource(state);
  const mutableSource = editableSource(state);
  const canEdit = state.status === "unbuilt" || state.status === "failed";
  const [dnaEnabled, setDnaEnabled] = useState(source.dna !== null);
  const [dnaDraft, setDnaDraft] = useState<CampaignWorldDna>(source.dna ?? blankDna());
  const [dnaDirty, setDnaDirty] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submissionRef = useRef(false);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (dnaDirty) return;
    setDnaEnabled(source.dna !== null);
    setDnaDraft(source.dna ?? blankDna());
  }, [dnaDirty, source.dna]);

  const startedAt = buildStartedAt(events);
  const endedAt = buildEndedAt(events);
  useEffect(() => {
    if (state.status !== "building" || startedAt === null) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, state.status]);

  const stageStates = useMemo(
    () => WORLD_STAGES.map((definition) => eventStageState(definition, state, events)),
    [events, state],
  );
  const completeStageCount = stageStates.filter((stage) => stage === "done").length;
  const progress = state.status === "review" || state.status === "accepted"
    ? 100
    : Math.round((completeStageCount / WORLD_STAGES.length) * 100);
  const visibleStage = activeBuildStage(state, events);
  const activeDefinition = WORLD_STAGES.find((definition) => (
    visibleStage ? definition.stages.includes(visibleStage) : false
  ));
  const latestEvent = events[events.length - 1];
  const failureMessage = terminalFailureMessage(events);
  const elapsed = startedAt === null
    ? "--:--"
    : formatElapsed((endedAt ?? clock) - startedAt);

  async function handleCreateWorld() {
    if (!canEdit || !mutableSource || submissionRef.current) return;
    submissionRef.current = true;
    setSubmitting(true);
    setActionError(null);

    try {
      let sourceDigest = mutableSource.sourceDigest;
      if (dnaEnabled) {
        const dna = completeDna(dnaDraft);
        if (!dna) {
          setActionError("Fill all six World DNA fields before creating the world.");
          return;
        }
        if (dnaDirty || mutableSource.dna === null) {
          const savedSource = await onSaveDna(dna);
          sourceDigest = savedSource.sourceDigest;
          setDnaDraft(savedSource.dna ?? dna);
          setDnaDirty(false);
        }
      }

      const build = await onStartBuild(sourceDigest);
      await onBuildStarted(build);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The world build could not start.");
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  const heading = state.status === "building"
    ? "Building the world."
    : state.status === "failed"
      ? "Build needs attention."
      : state.status === "accepted"
        ? "World accepted."
        : state.status === "review"
          ? "World ready for review."
          : "Create the world.";

  return (
    <main
      className="wf-gen-shell wf-world-build-surface wf-v4-page-theater"
      data-testid="worldBuildSurface"
    >
      <StageRail state={state} events={events} />

      <section className="wf-gen-main">
        <header className="wf-gen-head">
          <div>
            <p className="wf-gen-sub">Campaign World</p>
            <h1 className="wf-gen-h"><em>{heading}</em></h1>
            <p className="wf-world-build-campaign">{campaignName}</p>
          </div>
          {state.status === "building" || state.status === "failed" ? (
            <div className="wf-gen-progress" aria-label="World build progress">
              <div className="wf-gen-progress-bar">
                <div style={{ width: `${progress}%` }} />
              </div>
              <div className="wf-gen-progress-meta">
                <span>{completeStageCount} of {WORLD_STAGES.length} stages</span>
                <span data-testid="buildElapsed"><b>{elapsed}</b> elapsed</span>
              </div>
            </div>
          ) : null}
        </header>

        <span className="sr-only" data-testid="worldStatus">{state.status}</span>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {latestEvent ? eventLabel(latestEvent) : ""}
        </div>

        {state.status === "building" ? (
          <>
            <section className="wf-gen-think wf-world-build-activity" aria-label="Current build stage">
              <div className="wf-gen-think-mark" />
              <div>
                <div className="wf-gen-think-h">{activeDefinition?.title ?? "Starting build"}</div>
                <p className="wf-gen-think-prose">
                  {visibleStage ? STAGE_ACTIVITY[visibleStage] : "Opening the durable build record."}
                </p>
              </div>
            </section>
            <section className="wf-gen-section">
              <div className="wf-gen-section-h">
                <span className="wf-gen-kicker">01</span>
                <h2 className="wf-gen-h2">Build <em>ledger</em></h2>
                <span className="wf-gen-pill" data-state="forging">live</span>
              </div>
              <BuildLedger events={events} />
              {connectionError ? <p className="wf-world-build-inline-error">{connectionError}</p> : null}
            </section>
          </>
        ) : null}

        {state.status === "failed" ? (
          <section className="wf-world-build-failure" role="alert">
            <div>
              <span>Build stopped</span>
              <h2>The stored world remains unchanged.</h2>
              <p>{failureMessage ?? "Loading the failure record."}</p>
            </div>
            <BuildLedger events={events} />
          </section>
        ) : null}

        {canEdit ? (
          <>
            <section className="wf-gen-section">
              <div className="wf-gen-section-h">
                <span className="wf-gen-kicker">01</span>
                <h2 className="wf-gen-h2">World <em>source</em></h2>
                <span className="wf-gen-pill">ready</span>
              </div>
              <article className="wf-world-source-premise">
                <span>Premise</span>
                <p>{source.premise}</p>
              </article>
              <SourceProvenance source={source} />
            </section>

            <section className="wf-gen-section">
              <div className="wf-gen-section-h">
                <span className="wf-gen-kicker">02</span>
                <h2 className="wf-gen-h2">World <em>DNA</em></h2>
                <span className="wf-gen-pill">optional</span>
              </div>

              {dnaEnabled ? (
                <>
                  <div className="wf-dna-editor-grid" role="list" aria-label="World DNA fields">
                    {WORLD_DNA_FIELDS.map(({ field, label }, index) => (
                      <article className="wf-dna-seed-card" role="listitem" key={field} data-enabled="true">
                        <div className="wf-dna-seed-head">
                          <div>
                            <div className="wf-dna-seed-code">D{String(index + 1).padStart(2, "0")}</div>
                            <h3 className="wf-dna-seed-title">{label}</h3>
                          </div>
                          <span className="wf-gen-tag">{dnaDirty ? "draft" : "source"}</span>
                        </div>
                        <textarea
                          className="wf-dna-seed-text"
                          aria-label={`${label} DNA`}
                          value={dnaDraft[field]}
                          onChange={(event) => {
                            setDnaDraft((current) => ({ ...current, [field]: event.target.value }));
                            setDnaDirty(true);
                            setActionError(null);
                          }}
                          disabled={submitting}
                        />
                      </article>
                    ))}
                  </div>
                  {source.dna === null ? (
                    <button
                      type="button"
                      className="wf-v4-btn wf-world-build-secondary-action"
                      disabled={submitting}
                      onClick={() => {
                        setDnaEnabled(false);
                        setDnaDraft(blankDna());
                        setDnaDirty(false);
                        setActionError(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                      Remove World DNA
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="wf-world-dna-optional">
                  <p>The premise is enough to create this world. Add six fields when you want tighter direction.</p>
                  <button
                    type="button"
                    className="wf-v4-btn"
                    disabled={submitting}
                    onClick={() => setDnaEnabled(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Add World DNA
                  </button>
                </div>
              )}
            </section>

            {actionError || connectionError ? (
              <p className="wf-world-build-inline-error" role="alert">{actionError ?? connectionError}</p>
            ) : null}

            <div className="wf-gen-actions">
              <button
                type="button"
                className="wf-v4-btn wf-v4-btn-primary"
                disabled={submitting}
                onClick={() => void handleCreateWorld()}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : state.status === "failed" ? <RotateCcw className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                {submitting ? "Starting build" : state.status === "failed" ? "Start build again" : "Create world"}
              </button>
            </div>
          </>
        ) : null}

        {state.status === "review" || state.status === "accepted" ? (
          <section className="wf-world-build-ready">
            <span>{state.status === "accepted" ? "Accepted" : "Review ready"}</span>
            <h2>{state.world.worldSummary}</h2>
            <p>{state.world.locations.length} locations · {state.world.actors.length} actors · {state.world.pressures.length} world pressures</p>
            <Link href={`/campaign/${campaignId}/review`} className="wf-v4-btn wf-v4-btn-primary">
              Open World Review
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        ) : null}
      </section>
    </main>
  );
}
