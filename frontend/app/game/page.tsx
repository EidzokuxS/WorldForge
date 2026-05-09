"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LocationPanel } from "@/components/game/location-panel";
import { NarrativeLog } from "@/components/game/narrative-log";
import { CharacterPanel } from "@/components/game/character-panel";
import { LorePanel } from "@/components/game/lore-panel";
import { CheckpointPanel } from "@/components/game/checkpoint-panel";
import type { OracleResultData } from "@/components/game/oracle-panel";
import { GameSceneShell } from "@/components/game/play-surface/game-scene-shell";
import { SceneBackdrop } from "@/components/game/play-surface/scene-backdrop";
import { SceneHUD, type SceneHUDStatus } from "@/components/game/play-surface/scene-hud";
import { StageOverlay } from "@/components/game/play-surface/stage-overlay";
import { NarrationDock } from "@/components/game/play-surface/narration-dock";
import { ActionDock } from "@/components/game/play-surface/action-dock";
import { WidgetRail } from "@/components/game/play-surface/widget-rail";
import { DrawerHost, type DrawerSlots } from "@/components/game/play-surface/drawer-host";
import { PresenceLayer } from "@/components/game/play-surface/presence-layer";
import { InspectDrawer } from "@/components/game/play-surface/inspect-drawer";
import { CONTINUE_ACTION_PAYLOAD } from "@/lib/display-beats";
import { cn } from "@/lib/utils";
import { useGamePlaySurfaceState } from "./use-game-play-surface-state";
import type { CampaignMeta, ChatMessage } from "@worldforge/shared";
import { formatLookupLogEntry, isChatMessage } from "@worldforge/shared";
import { getErrorMessage } from "@/lib/settings";
import { useSettings } from "@/lib/use-settings";
import {
  chatAction,
  chatEdit,
  chatHistory,
  chatLookup,
  chatOpening,
  chatRetry,
  chatUndo,
  getActiveCampaign,
  getRememberedCampaignId,
  getImageUrl,
  getWorldData,
  loadCampaign,
  parseTurnSSE,
} from "@/lib/api";
import type { ChatLookupRequest, LookupKind, LookupResultEvent } from "@/lib/api";
import type { WorldCurrentScene, WorldData } from "@/lib/api-types";
import { deriveGameMessageKind } from "@/lib/gameplay-text";

type TurnPhase = "idle" | "streaming" | "finalizing";
type QuickAction = { label: string; action: string };
type SceneProgress = "opening" | "scene-settling" | null;
type SceneSettlingStatus = { phase?: string; opening?: boolean };
type FinalizingTurnStatus = { stage?: string; phase?: string; tick?: number };
type DisplayChatMessage = ChatMessage & { debugReasoning?: string | null };

function StageContextCard({
  label,
  title,
  children,
  accent = false,
}: {
  label: string;
  title?: string | null;
  children?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-white/10 bg-black/58 px-3.5 py-3 text-zinc-100 shadow-[0_16px_44px_rgba(0,0,0,0.3)] backdrop-blur-md",
        accent && "border-[#E63E00]/35 bg-[#E63E00]/[0.08]",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      {title ? (
        <p className="mt-1 text-[15px] font-semibold leading-snug text-zinc-100">
          {title}
        </p>
      ) : null}
      {children ? (
        <div className="mt-2 text-[13px] leading-5 text-zinc-300">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function StageChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-zinc-950/70 px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
      {children}
    </span>
  );
}

type TravelFeedbackState = {
  locationId: string;
  locationName: string;
  travelCost: number;
  path: string[];
};

function getLocationChangeUpdate(update: unknown): TravelFeedbackState | null {
  if (!update || typeof update !== "object") {
    return null;
  }

  const maybeLocationChange = update as {
    type?: unknown;
    locationId?: unknown;
    locationName?: unknown;
    travelCost?: unknown;
    path?: unknown;
  };

  if (
    maybeLocationChange.type !== "location_change"
    || typeof maybeLocationChange.locationId !== "string"
    || typeof maybeLocationChange.locationName !== "string"
    || typeof maybeLocationChange.travelCost !== "number"
    || !Array.isArray(maybeLocationChange.path)
  ) {
    return null;
  }

  return {
    locationId: maybeLocationChange.locationId,
    locationName: maybeLocationChange.locationName,
    travelCost: maybeLocationChange.travelCost,
    path: maybeLocationChange.path.filter(
      (step): step is string => typeof step === "string",
    ),
  };
}

function formatTravelFeedback(feedback: TravelFeedbackState): string {
  const tickLabel = feedback.travelCost === 1 ? "1 tick" : `${feedback.travelCost} ticks`;
  const pathSummary = feedback.path.length > 0
    ? ` via ${feedback.path.join(" -> ")}`
    : "";

  return `Travel complete: ${feedback.locationName} reached in ${tickLabel}${pathSummary}.`;
}

function getAuthoritativeSceneNpcs(worldData: WorldData): Array<{ id: string; name: string; tier: string }> {
  const currentScene = worldData.currentScene;
  if (!currentScene) {
    return [];
  }

  const npcById = new Map(worldData.npcs.map((npc) => [npc.id, npc]));
  const clearNpcIds = currentScene.clearNpcIds.length > 0
    ? currentScene.clearNpcIds
    : currentScene.sceneNpcIds.filter((npcId) => currentScene.awareness.byNpcId[npcId] === "clear");

  return clearNpcIds
    .map((npcId) => npcById.get(npcId))
    .filter((npc): npc is NonNullable<typeof npc> => Boolean(npc))
    .map((npc) => ({ id: npc.id, name: npc.name, tier: npc.tier }));
}

function getFallbackSceneNpcs(worldData: WorldData): Array<{ id: string; name: string; tier: string }> {
  const player = worldData.player;
  if (!player?.currentLocationId) {
    return [];
  }

  const playerSceneScopeId = player.sceneScopeId ?? player.currentLocationId;
  const sceneScopedNpcs = worldData.npcs
    .filter((npc) => (npc.sceneScopeId ?? npc.currentLocationId) === playerSceneScopeId)
    .map((npc) => ({ id: npc.id, name: npc.name, tier: npc.tier }));

  if (sceneScopedNpcs.length > 0) {
    return sceneScopedNpcs;
  }

  return worldData.npcs
    .filter((npc) => npc.currentLocationId === player.currentLocationId)
    .map((npc) => ({ id: npc.id, name: npc.name, tier: npc.tier }));
}

function buildScenePanelData(
  currentScene: WorldCurrentScene | null,
  currentLocation: { id: string; name: string } | null,
) {
  if (!currentScene) {
    return null;
  }

  return {
    id: currentScene.id,
    name: currentScene.name,
    broadLocationName: currentScene.broadLocationName ?? currentLocation?.name ?? null,
    hintSignals: currentScene.awareness.hintSignals,
  };
}

function parseExplicitLookupCommand(value: string): ChatLookupRequest | null {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith("/compare ")) {
    const comparisonBody = trimmed.slice("/compare".length).trim();
    const match = comparisonBody.match(/^(.+?)\s+(?:vs\.?|versus)\s+(.+)$/i);
    if (!match) {
      return comparisonBody
        ? { lookupKind: "power_profile", subject: comparisonBody }
        : null;
    }

    return {
      lookupKind: "power_profile",
      subject: match[1].trim(),
      compareAgainst: match[2].trim(),
    };
  }

  if (!lower.startsWith("/lookup ")) {
    return null;
  }

  const lookupBody = trimmed.slice("/lookup".length).trim();
  if (!lookupBody) {
    return null;
  }

  const prefixedKinds: Array<{ prefix: string; lookupKind: LookupKind }> = [
    { prefix: "world:", lookupKind: "world_canon_fact" },
    { prefix: "event:", lookupKind: "event_clarification" },
    { prefix: "character:", lookupKind: "character_canon_fact" },
  ];

  for (const entry of prefixedKinds) {
    if (lookupBody.toLowerCase().startsWith(entry.prefix)) {
      const subject = lookupBody.slice(entry.prefix.length).trim();
      return subject
        ? {
            lookupKind: entry.lookupKind,
            subject,
          }
        : null;
    }
  }

  return {
    lookupKind: "character_canon_fact",
    subject: lookupBody,
  };
}

function formatLookupAssistantMessage(
  request: ChatLookupRequest,
  result: Pick<LookupResultEvent, "lookupKind" | "answer">,
): string {
  const persistedKind =
    result.lookupKind === "power_profile" && request.compareAgainst
      ? "compare"
      : result.lookupKind;
  return formatLookupLogEntry(persistedKind, result.answer);
}

function toDisplayMessages(messages: ChatMessage[]): DisplayChatMessage[] {
  return messages.map((message) => ({ ...message, debugReasoning: null }));
}

function hasNarratedAssistantMessage(messages: ChatMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant"
      && deriveGameMessageKind(message.role, message.content) === "narration",
  );
}

function renderInventoryDrawer(
  carriedItems: NonNullable<WorldData["player"]>["inventory"],
  equippedItems: NonNullable<WorldData["player"]>["equipment"],
) {
  const itemClass = "rounded-[8px] border border-white/10 bg-black/20 px-3 py-2";

  return (
    <div data-testid="inventory-drawer" className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Equipped
        </h3>
        {equippedItems.length > 0 ? (
          <ul className="space-y-2">
            {equippedItems.map((item) => (
              <li key={item.id} className={itemClass}>
                <p className="text-[16px] leading-6 text-zinc-100">{item.name}</p>
                {item.equippedSlot || item.isSignature || item.tags.length > 0 ? (
                  <p className="mt-1 text-[12px] leading-5 text-zinc-500">
                    {[item.equippedSlot, item.isSignature ? "signature" : null, ...item.tags]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={itemClass}>Nothing is visibly equipped.</p>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Carried
        </h3>
        {carriedItems.length > 0 ? (
          <ul className="space-y-2">
            {carriedItems.map((item) => (
              <li key={item.id} className={itemClass}>
                <p className="text-[16px] leading-6 text-zinc-100">{item.name}</p>
                {item.tags.length > 0 ? (
                  <p className="mt-1 text-[12px] leading-5 text-zinc-500">
                    {item.tags.join(" / ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={itemClass}>You are not carrying anything visible right now.</p>
        )}
      </section>
    </div>
  );
}

export default function GamePage() {
  const router = useRouter();
  const { settings } = useSettings();
  const [activeCampaign, setActiveCampaign] = useState<CampaignMeta | null>(null);
  const [messages, setMessages] = useState<DisplayChatMessage[]>([]);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>("idle");
  const [sceneProgress, setSceneProgress] = useState<SceneProgress>(null);
  const [sceneProgressCopy, setSceneProgressCopy] = useState<string | null>(null);
  const [showRawReasoning, setShowRawReasoning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasLiveTurnSnapshot, setHasLiveTurnSnapshot] = useState(false);
  const [lastOracleResult, setLastOracleResult] = useState<OracleResultData | null>(null);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [worldData, setWorldData] = useState<WorldData | null>(null);
  const [travelFeedback, setTravelFeedback] = useState<string | null>(null);
  const bufferedQuickActionsRef = useRef<QuickAction[]>([]);
  const messagesRef = useRef<DisplayChatMessage[]>([]);
  const openingRequestCampaignRef = useRef<string | null>(null);

  const refreshWorldData = useCallback(
    async (campaignId: string) => {
      try {
        const data = await getWorldData(campaignId);
        setWorldData(data);
      } catch {
        // Non-critical — keep existing data on refresh failure
      }
    },
    [],
  );

  const clearQuickActionState = useCallback(() => {
    bufferedQuickActionsRef.current = [];
    setQuickActions([]);
  }, []);

  const upsertAssistantMessage = useCallback((content: string) => {
    setMessages((current) => {
      const next = [...current];
      const lastIndex = next.length - 1;
      if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
        next[lastIndex] = { ...next[lastIndex], content };
        return next;
      }

      return [...next, { role: "assistant", content, debugReasoning: null }];
    });
  }, []);

  const attachReasoningToLatestAssistant = useCallback((payload: { text: string }) => {
    const reasoningText = payload.text.trim();
    if (!reasoningText) {
      return;
    }

    setMessages((current) => {
      const next = [...current];
      for (let index = next.length - 1; index >= 0; index -= 1) {
        if (next[index]?.role === "assistant") {
          next[index] = { ...next[index], debugReasoning: reasoningText };
          break;
        }
      }
      return next;
    });
  }, []);

  const bufferQuickActions = useCallback((actions: QuickAction[]) => {
    bufferedQuickActionsRef.current = actions;
    setQuickActions([]);
  }, []);

  const revealBufferedQuickActions = useCallback(() => {
    setQuickActions(bufferedQuickActionsRef.current);
  }, []);

  const finishCompletedTurn = useCallback(
    (campaignId: string) => {
      setSceneProgress("scene-settling");
      setSceneProgressCopy("Syncing world state");
      setTurnPhase("finalizing");
      setHasLiveTurnSnapshot(true);
      revealBufferedQuickActions();

      void (async () => {
        await refreshWorldData(campaignId);
        setSceneProgress(null);
        setTurnPhase("idle");
      })();
    },
    [refreshWorldData, revealBufferedQuickActions],
  );

  useEffect(() => {
    setShowRawReasoning(settings.ui.showRawReasoning);
  }, [settings.ui.showRawReasoning]);

  const restoreGameplayState = useCallback(
    async (campaignId: string) => {
      const [history, world] = await Promise.all([
        chatHistory(campaignId),
        getWorldData(campaignId),
      ]);
      const safeMessages = Array.isArray(history.messages)
        ? history.messages.filter(isChatMessage)
        : [];
      const displayMessages = toDisplayMessages(safeMessages);

      setMessages(displayMessages);
      setHasLiveTurnSnapshot(history.hasLiveTurnSnapshot);
      setWorldData(world);

      return {
        messages: displayMessages,
        hasNarratedAssistantMessage: hasNarratedAssistantMessage(displayMessages),
      };
    },
    [],
  );

  useEffect(() => {
    if (sceneProgress === null) {
      setSceneProgressCopy(null);
    }
  }, [sceneProgress]);

  const applySceneSettlingStatus = useCallback((status?: SceneSettlingStatus) => {
    const phase = status?.phase ?? "";
    const isOpeningPhase = status?.opening === true || phase.startsWith("opening");
    setSceneProgress(isOpeningPhase ? "opening" : "scene-settling");
    setSceneProgressCopy(getSceneProgressCopy(status));
    setTurnPhase("idle");
  }, []);

  const applyFinalizingStatus = useCallback((status?: FinalizingTurnStatus) => {
    setSceneProgress("scene-settling");
    setSceneProgressCopy(getFinalizingProgressCopy(status));
    setTurnPhase("finalizing");
  }, []);

  const requestOpeningScene = useCallback(
    async (campaignId: string) => {
      if (openingRequestCampaignRef.current === campaignId) {
        return;
      }

      openingRequestCampaignRef.current = campaignId;
      setSceneProgress("opening");
      setSceneProgressCopy("Grounding opening");
      setTurnPhase("idle");

      let openingNarrative = "";
      let openingFailed: string | null = null;

      try {
        const response = await chatOpening(campaignId);
        if (!response.body) {
          throw new Error("Empty opening scene stream.");
        }

        await parseTurnSSE(response.body, {
          onSceneSettling: applySceneSettlingStatus,
          onNarrative: (text) => {
            openingNarrative += text;
            setSceneProgress(null);
            setTurnPhase("streaming");
            upsertAssistantMessage(openingNarrative);
          },
          onReasoning: attachReasoningToLatestAssistant,
          onOracleResult: () => {},
          onStateUpdate: () => {},
          onQuickActions: () => {},
          onDone: () => {
            setSceneProgress(null);
            setTurnPhase("idle");
            void refreshWorldData(campaignId);
          },
          onError: (error) => {
            openingFailed = error;
          },
        });

        if (openingFailed) {
          throw new Error(openingFailed);
        }
      } catch (error) {
        openingRequestCampaignRef.current = null;
        setSceneProgress(null);
        setTurnPhase("idle");
        toast.error("Failed to generate opening scene", {
          description: getErrorMessage(error, "Unknown opening scene error."),
        });
      }
    },
    [
      applySceneSettlingStatus,
      attachReasoningToLatestAssistant,
      refreshWorldData,
      upsertAssistantMessage,
    ],
  );

  const rollbackRetryBoundary = useCallback(
    async (campaignId: string, fallbackPremise: string, cause: unknown) => {
      const rolledBackMessages = messagesRef.current.slice(
        0,
        Math.max(0, messagesRef.current.length - 2),
      );

      messagesRef.current = rolledBackMessages;
      setMessages(rolledBackMessages);
      setLastOracleResult(null);
      setHasLiveTurnSnapshot(false);
      clearQuickActionState();

      try {
        await restoreGameplayState(campaignId);
      } catch {
        if (getErrorMessage(cause, "").includes("Nothing to retry")) {
          setHasLiveTurnSnapshot(false);
        }
      }
    },
    [clearQuickActionState, restoreGameplayState],
  );

  useEffect(() => {
    let cancelled = false;

    async function initGame() {
      try {
        let campaign = await getActiveCampaign();
        if (!campaign) {
          const rememberedCampaignId = getRememberedCampaignId();
          if (rememberedCampaignId) {
            campaign = await loadCampaign(rememberedCampaignId).catch(() => null);
          }
        }

        if (!campaign) {
          toast.error("No active campaign found. Create or load one first.");
          router.replace("/");
          return;
        }

        if (cancelled) return;
        setActiveCampaign(campaign);
        const restored = await restoreGameplayState(campaign.id);
        if (!cancelled && !restored.hasNarratedAssistantMessage) {
          void requestOpeningScene(campaign.id);
        }
      } catch (error) {
        toast.error("Failed to load game state", {
          description: getErrorMessage(error, "Unknown initialization error."),
        });
        router.replace("/");
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    }

    void initGame();

    return () => {
      cancelled = true;
    };
  }, [requestOpeningScene, restoreGameplayState, router]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Derived state for panels
  const player = worldData?.player ?? null;

  const currentLocation = useMemo(() => {
    if (!worldData || !player?.currentLocationId) return null;
    return worldData.locations.find((l) => l.id === player.currentLocationId) ?? null;
  }, [worldData, player]);

  const currentScene = useMemo(
    () => (worldData?.currentScene ?? null),
    [worldData],
  );

  const connectedPaths = useMemo(() => {
    if (!worldData || !currentLocation) return [];
    if ((currentLocation.connectedPaths?.length ?? 0) > 0) {
      return currentLocation.connectedPaths!
        .filter((path) => path.toLocationId !== currentLocation.id)
        .map((path) => ({
          id: path.toLocationId,
          name: path.toLocationName
            ?? worldData.locations.find((location) => location.id === path.toLocationId)?.name
            ?? path.toLocationId,
          travelCost: path.travelCost,
          pathSummary: null,
        }));
    }

    return currentLocation.connectedTo
      .filter((id) => id !== currentLocation.id)
      .map((id) => worldData.locations.find((location) => location.id === id))
      .filter((location): location is NonNullable<typeof location> => Boolean(location))
      .map((location) => ({
        id: location.id,
        name: location.name,
        travelCost: null,
        pathSummary: null,
      }));
  }, [worldData, currentLocation]);

  const npcsHere = useMemo(() => {
    if (!worldData) return [];
    return currentScene
      ? getAuthoritativeSceneNpcs(worldData)
      : getFallbackSceneNpcs(worldData);
  }, [currentScene, worldData]);
  const scenePresenceHints = currentScene?.awareness.hintSignals ?? [];
  const offscreenAnchorCount = useMemo(() => {
    if (!worldData || !currentScene) return 0;
    const visibleIds = new Set(npcsHere.map((npc) => npc.id));
    return worldData.npcs.filter((npc) => {
      if (visibleIds.has(npc.id)) return false;
      return npc.currentLocationId === currentScene.broadLocationId
        && (npc.sceneScopeId ?? currentScene.id) !== currentScene.id;
    }).length;
  }, [currentScene, npcsHere, worldData]);

  const scenePanelData = useMemo(
    () => buildScenePanelData(currentScene, currentLocation),
    [currentLocation, currentScene],
  );

  const itemsHere = useMemo(() => {
    if (!worldData || !player?.currentLocationId) return [];
    return worldData.items
      .filter((item) => item.locationId === player.currentLocationId)
      .map((item) => ({ id: item.id, name: item.name }));
  }, [worldData, player]);

  const playerCarriedItems = useMemo(() => player?.inventory ?? [], [player]);
  const playerEquippedItems = useMemo(() => player?.equipment ?? [], [player]);

  const locationName = currentLocation?.name ?? null;

  const portraitUrl = useMemo(() => {
    if (!activeCampaign || !player) return undefined;
    return getImageUrl(activeCampaign.id, "portraits", `${player.id}.png`);
  }, [activeCampaign, player]);

  const canInteract = Boolean(activeCampaign) && !isInitializing;
  const isTurnBusy = turnPhase !== "idle" || sceneProgress !== null;
  const playSurface = useGamePlaySurfaceState({
    campaignId: activeCampaign?.id ?? null,
    messages,
    turnPhase,
    sceneProgress,
    oracleResult: lastOracleResult,
    travelFeedback,
    quickActions,
  });
  const selectedActor = useMemo(() => {
    if (!worldData || !playSurface.selectedActorId) return null;
    return worldData.npcs.find((npc) => npc.id === playSurface.selectedActorId) ?? null;
  }, [playSurface.selectedActorId, worldData]);
  const selectedActorLocation = useMemo(() => {
    if (!worldData || !selectedActor?.currentLocationId) return null;
    return worldData.locations.find((location) => location.id === selectedActor.currentLocationId) ?? null;
  }, [selectedActor, worldData]);

  const submitLookup = async (
    commandText: string,
    lookupRequest: ChatLookupRequest,
  ) => {
    if (!commandText || isTurnBusy || !activeCampaign) return;

    setSceneProgress(null);
    setTurnPhase("streaming");
    setLastOracleResult(null);
    setTravelFeedback(null);
    clearQuickActionState();

    let lookupCompleted = false;
    let lookupError: string | null = null;

    try {
      const response = await chatLookup(activeCampaign.id, lookupRequest);

      if (!response.body) {
        throw new Error("Empty lookup response stream.");
      }

      const userMessage: ChatMessage = { role: "user", content: commandText };
      flushSync(() => {
        setMessages((current) => {
          const next = [...current, userMessage];
          messagesRef.current = next;
          return next;
        });
      });

      await parseTurnSSE(response.body, {
        onLookupResult: (result) => {
          setTurnPhase("streaming");
          const assistantContent = formatLookupAssistantMessage(lookupRequest, result);
          flushSync(() => {
            setMessages((current) => {
              const next = [...current];
              const lastMessage = next[next.length - 1];

              if (lastMessage?.role !== "user" || lastMessage.content !== commandText) {
                next.push({ role: "user", content: commandText });
              }

              const nextLastIndex = next.length - 1;
              if (nextLastIndex >= 0 && next[nextLastIndex].role === "assistant") {
                next[nextLastIndex] = {
                  ...next[nextLastIndex],
                  content: assistantContent,
                };
              } else {
                next.push({ role: "assistant", content: assistantContent, debugReasoning: null });
              }

              messagesRef.current = next;
              return next;
            });
          });
        },
        onNarrative: () => {},
        onOracleResult: () => {},
        onStateUpdate: () => {},
        onQuickActions: () => {},
        onDone: () => {
          lookupCompleted = true;
          setTurnPhase("idle");
        },
        onError: (error) => {
          lookupError = error;
        },
      });

      if (lookupError) {
        throw new Error(lookupError);
      }
    } catch (error) {
      flushSync(() => {
        setMessages((current) => {
          const next = [...current];
          const lastMessage = next[next.length - 1];
          if (lastMessage?.role === "assistant") {
            next.pop();
          }
          const prevMessage = next[next.length - 1];
          if (prevMessage?.role === "user" && prevMessage.content === commandText) {
            next.pop();
          }
          messagesRef.current = next;
          return next;
        });
      });

      toast.error("Failed to resolve lookup", {
        description: getErrorMessage(error, "Unknown lookup error."),
      });
    } finally {
      if (!lookupCompleted) {
        setTurnPhase("idle");
      }
    }
  };

  const submitAction = async (
    actionText: string,
    onStreamAccepted?: () => void,
  ): Promise<boolean> => {
    if (!actionText || isTurnBusy || !activeCampaign) return false;
    const campaignId = activeCampaign.id;

    const lookupRequest = parseExplicitLookupCommand(actionText);
    if (lookupRequest) {
      await submitLookup(actionText, lookupRequest);
      onStreamAccepted?.();
      return true;
    }

    setTurnPhase("idle");
    setSceneProgress("scene-settling");
    setSceneProgressCopy("Sending action");
    setLastOracleResult(null);
    setTravelFeedback(null);
    clearQuickActionState();

    let turnCompleted = false;
    let actionStreamAccepted = false;
    let actionStreamError: string | null = null;

    const removeOptimisticActionMessages = () => {
      setMessages((current) => {
        const next = [...current];
        const lastMessage = next[next.length - 1];
        if (lastMessage?.role === "assistant") {
          next.pop();
        }
        const prevMessage = next[next.length - 1];
        if (prevMessage?.role === "user" && prevMessage.content === actionText) {
          next.pop();
        }
        messagesRef.current = next;
        return next;
      });
    };

    try {
      const response = await chatAction(campaignId, actionText, actionText, "");

      if (!response.body) {
        throw new Error("Empty response stream.");
      }
      actionStreamAccepted = true;
      onStreamAccepted?.();

      // Only add messages to chat once the stream connection succeeds
      const userMessage: ChatMessage = { role: "user", content: actionText };
      setMessages((current) => {
        const next = [...current, userMessage];
        messagesRef.current = next;
        return next;
      });

      let narrativeText = "";

      await parseTurnSSE(response.body, {
        onSceneSettling: applySceneSettlingStatus,
        onNarrative: (text) => {
          narrativeText += text;
          setSceneProgress(null);
          setTurnPhase("streaming");
          upsertAssistantMessage(narrativeText);
        },
        onReasoning: attachReasoningToLatestAssistant,
        onOracleResult: (result) => {
          setLastOracleResult(result as OracleResultData);
        },
        onStateUpdate: (update) => {
          const locationChange = getLocationChangeUpdate(update);
          if (locationChange) {
            setTravelFeedback(formatTravelFeedback(locationChange));
          }
          // Refresh world data on any state change (movement, spawn, item transfer, etc.)
          void refreshWorldData(campaignId);
        },
        onQuickActions: (actions) => {
          bufferQuickActions(actions);
        },
        onFinalizing: applyFinalizingStatus,
        onDone: () => {
          turnCompleted = true;
          finishCompletedTurn(campaignId);
        },
        onError: (error) => {
          actionStreamError = error;
        },
      });

      if (actionStreamError) {
        throw new Error(actionStreamError);
      }
    } catch (error) {
      clearQuickActionState();
      setLastOracleResult(null);
      setTravelFeedback(null);

      if (actionStreamAccepted) {
        try {
          await restoreGameplayState(campaignId);
        } catch {
          removeOptimisticActionMessages();
          setHasLiveTurnSnapshot(false);
        }
      } else {
        removeOptimisticActionMessages();
      }

      toast.error("Failed to generate narrative", {
        description: getErrorMessage(error, "Unknown streaming error."),
      });
      return false;
    } finally {
      if (!turnCompleted) {
        setSceneProgress(null);
        setTurnPhase("idle");
      }
    }
    return true;
  };

  const handleRetry = async () => {
    if (isTurnBusy || !activeCampaign) return;

    setTurnPhase("idle");
    setSceneProgress("scene-settling");
    setSceneProgressCopy("Retrying turn");
    setLastOracleResult(null);
    setTravelFeedback(null);
    clearQuickActionState();

    // Remove last assistant message (optimistic UI)
    setMessages((current) => {
      const next = [...current];
      if (next.length > 0 && next[next.length - 1].role === "assistant") {
        next.pop();
      }
      return next;
    });
    let turnCompleted = false;
    let retryStreamError: string | null = null;

    try {
      const response = await chatRetry(activeCampaign.id);

      if (!response.body) {
        throw new Error("Empty response stream.");
      }

      let narrativeText = "";

      await parseTurnSSE(response.body, {
        onSceneSettling: applySceneSettlingStatus,
        onNarrative: (text) => {
          narrativeText += text;
          setSceneProgress(null);
          setTurnPhase("streaming");
          upsertAssistantMessage(narrativeText);
        },
        onReasoning: attachReasoningToLatestAssistant,
        onOracleResult: (result) => {
          setLastOracleResult(result as OracleResultData);
        },
        onStateUpdate: (update) => {
          const locationChange = getLocationChangeUpdate(update);
          if (locationChange) {
            setTravelFeedback(formatTravelFeedback(locationChange));
          }
          if (activeCampaign) {
            void refreshWorldData(activeCampaign.id);
          }
        },
        onQuickActions: (actions) => {
          bufferQuickActions(actions);
        },
        onFinalizing: applyFinalizingStatus,
        onDone: () => {
          turnCompleted = true;
          finishCompletedTurn(activeCampaign.id);
        },
        onError: (error) => {
          retryStreamError = error;
        },
      });

      if (retryStreamError) {
        throw new Error(retryStreamError);
      }
    } catch (error) {
      await rollbackRetryBoundary(activeCampaign.id, activeCampaign.premise, error);

      toast.error("Failed to retry", {
        description: getErrorMessage(error, "Unknown streaming error."),
      });
    } finally {
      if (!turnCompleted) {
        setSceneProgress(null);
        setTurnPhase("idle");
      }
    }
  };

  const handleUndo = async () => {
    if (isTurnBusy || !activeCampaign) return;

    try {
      await chatUndo(activeCampaign.id);
      setMessages((current) => {
        const next = [...current];
        // Remove last 2 messages (user action + assistant response)
        if (next.length >= 2) {
          next.pop();
          next.pop();
        }
        return next;
      });
      clearQuickActionState();
      setLastOracleResult(null);
      setTravelFeedback(null);
      setHasLiveTurnSnapshot(false);
      if (activeCampaign) {
        void refreshWorldData(activeCampaign.id);
      }
      toast.success("Last action undone");
    } catch (error) {
      if (getErrorMessage(error, "").includes("Nothing to undo")) {
        setHasLiveTurnSnapshot(false);
      }
      toast.error("Failed to undo", {
        description: getErrorMessage(error, "Unknown error."),
      });
    }
  };

  const handleEdit = async (messageIndex: number, newContent: string) => {
    if (!activeCampaign) return;

    try {
      await chatEdit(activeCampaign.id, messageIndex, newContent);
      setMessages((current) => {
        const next = [...current];
        if (messageIndex >= 0 && messageIndex < next.length) {
          next[messageIndex] = { ...next[messageIndex], content: newContent };
        }
        return next;
      });
    } catch (error) {
      toast.error("Failed to edit message", {
        description: getErrorMessage(error, "Unknown error."),
      });
    }
  };

  const canRetryUndo =
    hasLiveTurnSnapshot &&
    turnPhase === "idle" &&
    messages.length >= 2 &&
    messages[messages.length - 1]?.role === "assistant";

  const handleContinueAction = () => {
    if (isTurnBusy) return;
    void submitAction(CONTINUE_ACTION_PAYLOAD);
  };

  const handleMove = (targetLocationName: string) => {
    if (isTurnBusy) return;
    void submitAction(`go to ${targetLocationName}`);
  };

  if (isInitializing) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading campaign...</p>
      </main>
    );
  }

  const hudStatus = getHudStatus(sceneProgress, turnPhase, playSurface.isAutoPlaying);
  const turnProgressCopy = sceneProgressCopy
    ?? (turnPhase === "finalizing" ? "Finalizing turn" : hudStatus);
  const backdropSceneName = scenePanelData?.name ?? currentLocation?.name ?? null;
  const backdropLocationName = scenePanelData?.broadLocationName ?? currentLocation?.name ?? null;
  const selectedActorProfile = selectedActor?.characterRecord?.profile
    ?? selectedActor?.draft?.profile
    ?? null;
  const characterPanelSubject = selectedActor
    ? {
        id: selectedActor.id,
        name: selectedActor.name,
        race: selectedActorProfile?.species ?? "",
        gender: selectedActorProfile?.gender ?? "",
        age: selectedActorProfile?.ageText ?? "",
        appearance: selectedActorProfile?.appearance
          || selectedActorProfile?.personaSummary
          || selectedActor.persona,
        hp: null,
        tags: selectedActor.tags,
        currentLocationId: selectedActor.currentLocationId,
      }
    : player;
  const characterPanelCarriedItems = selectedActor ? [] : playerCarriedItems;
  const characterPanelEquippedItems = selectedActor ? [] : playerEquippedItems;
  const characterPanelLocationName = selectedActor
    ? selectedActorLocation?.name ?? null
    : locationName;
  const latestDebugReasoning = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.debugReasoning?.trim())
    ?.debugReasoning ?? null;
  const inspectBeat = playSurface.currentBeat?.rawDetails
    ? playSurface.currentBeat
    : playSurface.beats.find((beat) => beat.rawDetails)
      ?? playSurface.currentBeat;
  const drawerSlots: DrawerSlots = {
    log: (
      <NarrativeLog
        messages={messages}
        isStreaming={turnPhase === "streaming"}
        turnPhase={turnPhase}
        sceneProgress={sceneProgress}
        showRawReasoning={showRawReasoning}
        onRetry={handleRetry}
        onUndo={handleUndo}
        onEdit={handleEdit}
        canRetryUndo={canRetryUndo}
      />
    ),
    world: (
      <LocationPanel
        location={currentLocation}
        scene={scenePanelData}
        connectedPaths={connectedPaths}
        npcsHere={npcsHere}
        itemsHere={itemsHere}
        onMove={handleMove}
        disabled={isTurnBusy}
      />
    ),
    inventory: renderInventoryDrawer(playerCarriedItems, playerEquippedItems),
    journal: <LorePanel campaignId={activeCampaign?.id ?? null} />,
    character: (
      <CharacterPanel
        player={characterPanelSubject}
        carriedItems={characterPanelCarriedItems}
        equippedItems={characterPanelEquippedItems}
        locationName={characterPanelLocationName}
        portraitUrl={selectedActor ? undefined : portraitUrl}
      />
    ),
    inspect: (
      <InspectDrawer
        currentBeat={inspectBeat}
        oracleResult={lastOracleResult}
        status={hudStatus}
        showDebug={showRawReasoning}
        debugReasoning={latestDebugReasoning}
        stateSummary={travelFeedback}
      />
    ),
    saves: activeCampaign ? (
      <CheckpointPanel
        campaignId={activeCampaign.id}
        open={playSurface.activeDrawer === "saves"}
        onClose={playSurface.closeDrawer}
      />
    ) : null,
  };
  const visibleActorCount = npcsHere.length;
  const presenceTitle = visibleActorCount > 0
    ? `${visibleActorCount} visible`
    : scenePresenceHints.length > 0
      ? "Something nearby"
      : offscreenAnchorCount > 0
        ? `${offscreenAnchorCount} not in sight`
        : "No one visible";
  const stageLeftSlot = (
    <div className="space-y-3">
      <StageContextCard
        label="You"
        title={player?.name ?? "Character"}
        accent
      >
        <div className="flex flex-wrap gap-2">
          {typeof player?.hp === "number" ? <StageChip>HP {player.hp}</StageChip> : null}
          {playerEquippedItems.length > 0 ? <StageChip>{playerEquippedItems.length} equipped</StageChip> : null}
          {playerCarriedItems.length > 0 ? <StageChip>{playerCarriedItems.length} carried</StageChip> : null}
        </div>
      </StageContextCard>
      <StageContextCard
        label="Scene"
        title={backdropSceneName ?? backdropLocationName ?? "Scene loading"}
      >
        {backdropLocationName && backdropLocationName !== backdropSceneName ? (
          <p>{backdropLocationName}</p>
        ) : null}
        {connectedPaths.length > 0 ? (
          <p className="mt-1 text-zinc-400">
            {connectedPaths.length} route{connectedPaths.length === 1 ? "" : "s"} nearby
          </p>
        ) : null}
      </StageContextCard>
    </div>
  );
  const stageRightSlot = (
    <div className="space-y-3">
      <StageContextCard label="Presence" title={presenceTitle}>
        {visibleActorCount > 0 ? (
          <div className="flex flex-wrap gap-2">
            {npcsHere.slice(0, 4).map((npc) => (
              <button
                key={npc.id}
                type="button"
                className="rounded-full border border-white/10 bg-zinc-950/70 px-2.5 py-1 text-left text-[11px] font-semibold text-zinc-200 transition hover:border-[#E63E00]/50 hover:text-white"
                onClick={() => playSurface.selectActor(npc.id)}
              >
                {npc.name}
              </button>
            ))}
            {visibleActorCount > 4 ? <StageChip>+{visibleActorCount - 4}</StageChip> : null}
          </div>
        ) : scenePresenceHints.length > 0 ? (
          <p>{scenePresenceHints[0]}</p>
        ) : offscreenAnchorCount > 0 ? (
          <p>Same broad area, outside this immediate scene.</p>
        ) : (
          <p>The scene is quiet for now.</p>
        )}
        {visibleActorCount > 0 && scenePresenceHints.length > 0 ? (
          <p className="mt-2 text-zinc-500">{scenePresenceHints[0]}</p>
        ) : null}
        {visibleActorCount > 0 && offscreenAnchorCount > 0 ? (
          <p className="mt-2 text-zinc-500">
            {offscreenAnchorCount} more in the same broad area, not in sight.
          </p>
        ) : null}
      </StageContextCard>
      {itemsHere.length > 0 ? (
        <StageContextCard label="Objects" title={`${itemsHere.length} here`}>
          <div className="flex flex-wrap gap-2">
            {itemsHere.slice(0, 4).map((item) => (
              <StageChip key={item.id}>{item.name}</StageChip>
            ))}
            {itemsHere.length > 4 ? <StageChip>+{itemsHere.length - 4}</StageChip> : null}
          </div>
        </StageContextCard>
      ) : null}
    </div>
  );

  return (
    <GameSceneShell
      backdrop={
        <SceneBackdrop
          sceneName={backdropSceneName}
          broadLocationName={backdropLocationName}
          description={currentLocation?.description ?? null}
          tags={currentLocation?.tags ?? []}
        />
      }
      hud={
        <SceneHUD
          sceneName={backdropSceneName}
          broadLocationName={backdropLocationName}
          status={hudStatus}
          onHome={() => router.push("/")}
          onSaves={() => playSurface.openDrawer("saves")}
          onSettings={() => router.push("/settings")}
        />
      }
      stageOverlay={
        <StageOverlay
          currentBeatId={playSurface.currentBeat?.id ?? null}
          signals={playSurface.currentStageSignals}
          onSignalInspect={() => playSurface.openDrawer("inspect")}
        />
      }
      presenceSlot={
        <PresenceLayer
          visibleActors={npcsHere}
          hintSignals={scenePresenceHints}
          offscreenAnchorCount={offscreenAnchorCount}
          selectedActorId={playSurface.selectedActorId}
          onSelectActor={playSurface.selectActor}
        />
      }
      leftStageSlot={stageLeftSlot}
      rightStageSlot={stageRightSlot}
      narrationDock={
        <NarrationDock
          beats={playSurface.beats}
          currentBeatIndex={playSurface.currentBeatIndex}
          isAutoPlaying={playSurface.isAutoPlaying}
          onNextBeat={playSurface.handleNextBeat}
          onToggleAuto={playSurface.handleToggleAuto}
          onOpenLog={() => playSurface.openDrawer("log")}
          isBusy={false}
          statusCopy={isTurnBusy ? turnProgressCopy : undefined}
        />
      }
      actionDock={
        <ActionDock
          value={playSurface.draft}
          onChange={playSurface.setDraft}
          onSubmitAction={(actionText) => {
            void submitAction(actionText, playSurface.clearDraft);
          }}
          onContinue={handleContinueAction}
          disabled={!canInteract}
          isBusy={isTurnBusy}
          turnPhase={turnPhase}
          quickActions={quickActions}
        />
      }
      widgetRail={
        <WidgetRail
          activeDrawer={playSurface.activeDrawer}
          onOpenDrawer={playSurface.openDrawer}
        />
      }
      drawerHost={
        <DrawerHost
          activeDrawer={playSurface.activeDrawer}
          onClose={playSurface.closeDrawer}
          slots={drawerSlots}
          selectedActorName={selectedActor?.name ?? null}
          playerName={player?.name ?? null}
        />
      }
    />
  );
}

function getHudStatus(
  sceneProgress: SceneProgress,
  turnPhase: TurnPhase,
  isAutoPlaying: boolean,
): SceneHUDStatus {
  if (sceneProgress === "opening") return "Reading";
  if (sceneProgress === "scene-settling") return "Thinking";
  if (turnPhase === "streaming") return "Thinking";
  if (turnPhase === "finalizing") return "Thinking";
  if (isAutoPlaying) return "Auto";
  return "Ready";
}

function getSceneProgressCopy(status?: SceneSettlingStatus): string {
  const phase = status?.phase ?? "";

  switch (phase) {
    case "opening":
      return "Grounding opening";
    case "opening-local-scene":
      return "Placing opening scene";
    case "opening-final-narration":
      return "Writing opening";
    case "gm-read":
      return "Reading scene";
    case "oracle":
      return "Resolving uncertainty";
    case "gm-action-checklist":
      return "Planning consequences";
    case "tool-step":
    case "gm-tool-steps":
      return "Applying world changes";
    case "creating-local-scene":
      return "Creating local scene";
    case "spawning-support-npc":
      return "Adding support character";
    case "promoting-support-npc":
      return "Promoting support character";
    case "settling-tool-observation":
      return "Reading tool observation";
    case "cleaning-transient-scene":
      return "Cleaning transient scene";
    case "settled-packet":
      return "Syncing world truth";
    case "gm-scene-plan":
      return "GM choosing path";
    case "judge-scene-plan":
      return "Judge checking stakes";
    case "judge-adjudication":
      return "Judge resolving action";
    case "local-present-scene":
      return "Applying world changes";
    case "final-narration":
      return "Writing narration";
    default:
      return status?.opening ? "Grounding opening" : "Preparing scene";
  }
}

function getFinalizingProgressCopy(status?: FinalizingTurnStatus): string {
  const phase = status?.phase ?? status?.stage ?? "";

  switch (phase) {
    case "rollback_critical":
      return "Syncing world simulation";
    default:
      return "Finalizing turn";
  }
}
