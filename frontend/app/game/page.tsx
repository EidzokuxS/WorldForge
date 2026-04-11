"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LocationPanel } from "@/components/game/location-panel";
import { NarrativeLog } from "@/components/game/narrative-log";
import { CharacterPanel } from "@/components/game/character-panel";
import { LorePanel } from "@/components/game/lore-panel";
import { CheckpointPanel } from "@/components/game/checkpoint-panel";
import { ActionBar } from "@/components/game/action-bar";
import { OraclePanel, type OracleResultData } from "@/components/game/oracle-panel";
import { QuickActions } from "@/components/game/quick-actions";
import { Home, Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { CampaignMeta, ChatMessage } from "@worldforge/shared";
import { isChatMessage } from "@worldforge/shared";
import { getErrorMessage } from "@/lib/settings";
import {
  chatAction,
  chatEdit,
  chatHistory,
  chatRetry,
  chatUndo,
  getActiveCampaign,
  getRememberedCampaignId,
  getImageUrl,
  getWorldData,
  loadCampaign,
  parseTurnSSE,
} from "@/lib/api";
import type { WorldData } from "@/lib/api-types";

type TurnPhase = "idle" | "streaming" | "finalizing";
type QuickAction = { label: string; action: string };

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

export default function GamePage() {
  const router = useRouter();
  const [activeCampaign, setActiveCampaign] = useState<CampaignMeta | null>(null);
  const [premise, setPremise] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [turnPhase, setTurnPhase] = useState<TurnPhase>("idle");
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasLiveTurnSnapshot, setHasLiveTurnSnapshot] = useState(false);
  const [lastOracleResult, setLastOracleResult] = useState<OracleResultData | null>(null);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [worldData, setWorldData] = useState<WorldData | null>(null);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [travelFeedback, setTravelFeedback] = useState<string | null>(null);
  const bufferedQuickActionsRef = useRef<QuickAction[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);

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

  const bufferQuickActions = useCallback((actions: QuickAction[]) => {
    bufferedQuickActionsRef.current = actions;
    setQuickActions([]);
  }, []);

  const revealBufferedQuickActions = useCallback(() => {
    setQuickActions(bufferedQuickActionsRef.current);
  }, []);

  const restoreGameplayState = useCallback(
    async (campaignId: string, fallbackPremise: string) => {
      const [history, world] = await Promise.all([
        chatHistory(campaignId),
        getWorldData(campaignId),
      ]);
      const safeMessages = Array.isArray(history.messages)
        ? history.messages.filter(isChatMessage)
        : [];

      setMessages(safeMessages);
      setPremise(history.premise || fallbackPremise);
      setHasLiveTurnSnapshot(history.hasLiveTurnSnapshot);
      setWorldData(world);
    },
    [],
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
        await restoreGameplayState(campaignId, fallbackPremise);
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
        await restoreGameplayState(campaign.id, campaign.premise);
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
  }, [restoreGameplayState, router]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Derived state for panels
  const player = worldData?.player ?? null;

  const currentLocation = useMemo(() => {
    if (!worldData || !player?.currentLocationId) return null;
    return worldData.locations.find((l) => l.id === player.currentLocationId) ?? null;
  }, [worldData, player]);

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
    if (!worldData || !player?.currentLocationId) return [];
    return worldData.npcs
      .filter((npc) => npc.currentLocationId === player.currentLocationId)
      .map((npc) => ({ id: npc.id, name: npc.name, tier: npc.tier }));
  }, [worldData, player]);

  const itemsHere = useMemo(() => {
    if (!worldData || !player?.currentLocationId) return [];
    return worldData.items
      .filter((item) => item.locationId === player.currentLocationId)
      .map((item) => ({ id: item.id, name: item.name }));
  }, [worldData, player]);

  const playerItems = useMemo(() => {
    if (!worldData || !player) return [];
    return worldData.items
      .filter((item) => item.ownerId === player.id)
      .map((item) => ({ id: item.id, name: item.name, tags: item.tags }));
  }, [worldData, player]);

  const locationName = currentLocation?.name ?? null;

  const portraitUrl = useMemo(() => {
    if (!activeCampaign || !player) return undefined;
    return getImageUrl(activeCampaign.id, "portraits", `${player.id}.png`);
  }, [activeCampaign, player]);

  const canInteract = Boolean(activeCampaign) && !isInitializing;
  const isTurnBusy = turnPhase !== "idle";

  const updateAssistantContent = (text: string) => {
    setMessages((current) => {
      const next = [...current];
      const lastIndex = next.length - 1;
      if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
        next[lastIndex] = { ...next[lastIndex], content: text };
      }
      return next;
    });
  };

  const submitAction = async (actionText: string) => {
    if (!actionText || isTurnBusy || !activeCampaign) return;

    setTurnPhase("streaming");
    setLastOracleResult(null);
    setTravelFeedback(null);
    clearQuickActionState();

    // Track whether we successfully started receiving narrative data
    let streamStarted = false;
    let turnCompleted = false;

    try {
      const response = await chatAction(activeCampaign.id, actionText, actionText, "");

      if (!response.body) {
        throw new Error("Empty response stream.");
      }

      // Only add messages to chat once the stream connection succeeds
      const userMessage: ChatMessage = { role: "user", content: actionText };
      setMessages((current) => [...current, userMessage, { role: "assistant", content: "" }]);
      streamStarted = true;

      let narrativeText = "";

      await parseTurnSSE(response.body, {
        onNarrative: (text) => {
          narrativeText += text;
          updateAssistantContent(narrativeText);
        },
        onOracleResult: (result) => {
          setLastOracleResult(result as OracleResultData);
        },
        onStateUpdate: (update) => {
          const locationChange = getLocationChangeUpdate(update);
          if (locationChange) {
            setTravelFeedback(formatTravelFeedback(locationChange));
          }
          // Refresh world data on any state change (movement, spawn, item transfer, etc.)
          if (activeCampaign) {
            void refreshWorldData(activeCampaign.id);
          }
        },
        onQuickActions: (actions) => {
          bufferQuickActions(actions);
        },
        onFinalizing: () => {
          setTurnPhase("finalizing");
        },
        onDone: () => {
          turnCompleted = true;
          setTurnPhase("idle");
          setHasLiveTurnSnapshot(true);
          revealBufferedQuickActions();
          // Refresh world data after every completed turn to sync all panels
          if (activeCampaign) {
            void refreshWorldData(activeCampaign.id);
          }
        },
        onError: (error) => {
          toast.error("Turn processing error", { description: error });
        },
      });
    } catch (error) {
      if (streamStarted) {
        // Remove empty assistant placeholder if stream failed after messages were added
        setMessages((current) => {
          const next = [...current];
          const lastMessage = next[next.length - 1];
          if (lastMessage?.role === "assistant" && !lastMessage.content.trim()) {
            next.pop();
          }
          // Also remove the user message that triggered the failed turn
          const prevMessage = next[next.length - 1];
          if (prevMessage?.role === "user") {
            next.pop();
          }
          return next;
        });
      }

      toast.error("Failed to generate narrative", {
        description: getErrorMessage(error, "Unknown streaming error."),
      });
    } finally {
      if (!turnCompleted) {
        setTurnPhase("idle");
      }
    }
  };

  const handleRetry = async () => {
    if (isTurnBusy || !activeCampaign) return;

    setTurnPhase("streaming");
    setLastOracleResult(null);
    setTravelFeedback(null);
    clearQuickActionState();

    // Remove last assistant message (optimistic UI)
    setMessages((current) => {
      const next = [...current];
      if (next.length > 0 && next[next.length - 1].role === "assistant") {
        next.pop();
      }
      // Add empty assistant placeholder
      return [...next, { role: "assistant" as const, content: "" }];
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
        onNarrative: (text) => {
          narrativeText += text;
          updateAssistantContent(narrativeText);
        },
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
        onFinalizing: () => {
          setTurnPhase("finalizing");
        },
        onDone: () => {
          turnCompleted = true;
          setTurnPhase("idle");
          setHasLiveTurnSnapshot(true);
          revealBufferedQuickActions();
          if (activeCampaign) {
            void refreshWorldData(activeCampaign.id);
          }
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

  const handleSubmitAction = () => {
    const playerAction = input.trim();
    if (!playerAction) return;
    setInput("");
    void submitAction(playerAction);
  };

  const handleQuickAction = (actionText: string) => {
    if (isTurnBusy) return;
    void submitAction(actionText);
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

  return (
    <div className="flex h-screen flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-1.5">
        <div className="flex items-center gap-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
              >
                <Home className="h-3.5 w-3.5" />
                Title
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave game?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your progress is saved automatically. You can resume this campaign from the title screen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => router.push("/")}>
                  Go to Title
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => router.push("/settings")}
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setCheckpointOpen(true)}
        >
          <Save className="h-3.5 w-3.5" />
          Saves
        </Button>
      </div>
      {travelFeedback ? (
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm text-foreground/85">
          {travelFeedback}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <LocationPanel
          location={currentLocation}
          connectedPaths={connectedPaths}
          npcsHere={npcsHere}
          itemsHere={itemsHere}
          onMove={handleMove}
          disabled={isTurnBusy}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <OraclePanel result={lastOracleResult} />
          <NarrativeLog
            messages={messages}
            premise={premise}
            isStreaming={turnPhase === "streaming"}
            turnPhase={turnPhase}
            onRetry={handleRetry}
            onUndo={handleUndo}
            onEdit={handleEdit}
            canRetryUndo={canRetryUndo}
          />
        </div>
        <CharacterPanel
          player={player}
          items={playerItems}
          locationName={locationName}
          portraitUrl={portraitUrl}
        />
        <LorePanel campaignId={activeCampaign?.id ?? null} />
      </div>
      <QuickActions
        actions={quickActions}
        onAction={handleQuickAction}
        disabled={isTurnBusy}
      />
      <ActionBar
        value={input}
        onChange={setInput}
        onSubmit={handleSubmitAction}
        isLoading={isTurnBusy}
        disabled={!canInteract || isTurnBusy}
        turnPhase={turnPhase}
      />
      {activeCampaign && (
        <CheckpointPanel
          campaignId={activeCampaign.id}
          open={checkpointOpen}
          onClose={() => setCheckpointOpen(false)}
        />
      )}
    </div>
  );
}
