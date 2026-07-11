"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { CampaignWorldBuildEvent, CampaignWorldDna } from "@worldforge/shared";

import { WorldBuildWorkspace } from "@/components/campaign-forge/world-build-workspace";
import { loadCampaign } from "@/lib/api";
import {
  createCampaignWorldBuild,
  loadCampaignWorldState,
  saveCampaignWorldDna,
  streamCampaignWorldBuildEvents,
  type CampaignWorldStateResponse,
  type StartedCampaignWorldBuild,
} from "@/lib/campaign-world-api";

function errorMessage(error: unknown, message: string): string {
  return error instanceof Error ? error.message : message;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function CampaignForgePage(props: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(props.params);
  const router = useRouter();
  const [campaignName, setCampaignName] = useState("");
  const [worldState, setWorldState] = useState<CampaignWorldStateResponse | null>(null);
  const [events, setEvents] = useState<CampaignWorldBuildEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const lifecycleRef = useRef(0);
  const lastAppliedSequenceRef = useRef(0);

  function stopEventStream() {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
  }

  function applyEvent(event: CampaignWorldBuildEvent) {
    if (event.sequence <= lastAppliedSequenceRef.current) return;
    lastAppliedSequenceRef.current = event.sequence;
    setEvents((current) => [...current, event]);
  }

  async function followBuild(
    buildId: string,
    afterSequence: number,
    lifecycle: number,
    navigation: "push" | "replace",
  ) {
    stopEventStream();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setConnectionError(null);
    let cursor = afterSequence;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await streamCampaignWorldBuildEvents(campaignId, buildId, {
          afterSequence: cursor,
          signal: controller.signal,
          onEvent: (event) => {
            applyEvent(event);
            cursor = event.sequence;
          },
        });
        cursor = result.lastSequence;

        if (controller.signal.aborted || lifecycleRef.current !== lifecycle) return;
        const persistedState = await loadCampaignWorldState(campaignId);
        if (controller.signal.aborted || lifecycleRef.current !== lifecycle) return;
        setWorldState(persistedState);

        if (persistedState.status === "review") {
          const href = `/campaign/${campaignId}/review`;
          if (navigation === "replace") router.replace(href);
          else router.push(href);
        } else if (result.terminalEvent.type === "build_completed") {
          setConnectionError("The build completed without a persisted review state.");
        }
        return;
      } catch (error) {
        if (controller.signal.aborted || lifecycleRef.current !== lifecycle || isAbortError(error)) return;
        if (attempt === 0) {
          setConnectionError(`Build updates paused after event ${cursor}. Resuming the durable stream.`);
          continue;
        }
        setConnectionError(errorMessage(error, "Build updates could not be resumed."));
        return;
      }
    }
  }

  useEffect(() => {
    const lifecycle = lifecycleRef.current + 1;
    lifecycleRef.current = lifecycle;
    stopEventStream();
    setLoading(true);
    setLoadError(null);
    setConnectionError(null);
    setEvents([]);
    lastAppliedSequenceRef.current = 0;

    void Promise.all([
      loadCampaign(campaignId),
      loadCampaignWorldState(campaignId),
    ])
      .then(([campaign, state]) => {
        if (lifecycleRef.current !== lifecycle) return;
        setCampaignName(campaign.name);
        setWorldState(state);
        setLoading(false);

        if (state.status === "review") {
          router.replace(`/campaign/${campaignId}/review`);
          return;
        }
        if ((state.status === "building" || state.status === "failed") && state.currentBuildId) {
          void followBuild(state.currentBuildId, 0, lifecycle, "replace");
        }
      })
      .catch((error) => {
        if (lifecycleRef.current !== lifecycle) return;
        setLoadError(errorMessage(error, "Campaign Forge could not load."));
        setLoading(false);
      });

    return () => {
      if (lifecycleRef.current === lifecycle) lifecycleRef.current += 1;
      stopEventStream();
    };
  }, [campaignId, router]);

  async function handleSaveDna(dna: CampaignWorldDna) {
    const savedSource = await saveCampaignWorldDna(campaignId, dna);
    setWorldState((current) => {
      if (!current || !("source" in current)) return current;
      return { ...current, source: savedSource };
    });
    return savedSource;
  }

  function handleStartBuild(sourceDigest: string) {
    return createCampaignWorldBuild(campaignId, sourceDigest);
  }

  async function handleBuildStarted(build: StartedCampaignWorldBuild) {
    stopEventStream();
    setEvents([]);
    lastAppliedSequenceRef.current = 0;
    setConnectionError(null);

    const state = await loadCampaignWorldState(campaignId);
    if (
      state.status !== "building"
      || state.currentBuildId !== build.buildId
      || state.build.buildId !== build.buildId
    ) {
      throw new Error("The started build is absent from the persisted Campaign World state.");
    }
    setWorldState(state);
    void followBuild(build.buildId, 0, lifecycleRef.current, "push");
  }

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center text-[var(--fg-2)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading Campaign Forge
      </main>
    );
  }

  if (loadError || !worldState || !campaignName) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <h1 className="font-serif text-3xl font-semibold text-[var(--fg)]">Campaign Forge could not load.</h1>
        <p className="text-sm text-red-300">{loadError ?? "Campaign metadata is unavailable."}</p>
        <Link href="/campaign/new" className="wf-v4-btn w-fit">Create campaign</Link>
      </main>
    );
  }

  return (
    <WorldBuildWorkspace
      campaignId={campaignId}
      campaignName={campaignName}
      state={worldState}
      events={events}
      connectionError={connectionError}
      onSaveDna={handleSaveDna}
      onStartBuild={handleStartBuild}
      onBuildStarted={handleBuildStarted}
    />
  );
}
