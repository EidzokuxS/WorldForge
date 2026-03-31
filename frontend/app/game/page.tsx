"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  apiGet,
  apiStreamPost,
  chatEdit,
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

type ChatHistoryResponse = {
  messages: ChatMessage[];
  premise: string;
};

export default function GamePage() {
  const router = useRouter();
  const [activeCampaign, setActiveCampaign] = useState<CampaignMeta | null>(null);
  const [premise, setPremise] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastOracleResult, setLastOracleResult] = useState<OracleResultData | null>(null);
  const [quickActions, setQuickActions] = useState<Array<{ label: string; action: string }>>([]);
  const [worldData, setWorldData] = useState<WorldData | null>(null);
  const [checkpointOpen, setCheckpointOpen] = useState(false);

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

        const [history, world] = await Promise.all([
          apiGet<ChatHistoryResponse>("/api/chat/history"),
          getWorldData(campaign.id),
        ]);

        if (cancelled) return;

        const safeMessages = Array.isArray(history.messages)
          ? history.messages.filter(isChatMessage)
          : [];

        setMessages(safeMessages);
        setPremise(history.premise || campaign.premise);
        setWorldData(world);
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
  }, [router]);

  // Derived state for panels
  const player = worldData?.player ?? null;

  const currentLocation = useMemo(() => {
    if (!worldData || !player?.currentLocationId) return null;
    return worldData.locations.find((l) => l.id === player.currentLocationId) ?? null;
  }, [worldData, player]);

  const connectedLocations = useMemo(() => {
    if (!worldData || !currentLocation) return [];
    return currentLocation.connectedTo
      .map((id) => worldData.locations.find((l) => l.id === id))
      .filter((l): l is NonNullable<typeof l> => Boolean(l))
      .map((l) => ({ id: l.id, name: l.name }));
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
    if (!actionText || isStreaming) return;

    setIsStreaming(true);
    setLastOracleResult(null);
    setQuickActions([]);

    // Track whether we successfully started receiving narrative data
    let streamStarted = false;

    try {
      const response = await apiStreamPost("/api/chat/action", {
        playerAction: actionText,
        intent: actionText,
        method: "",
      });

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
        onStateUpdate: () => {
          // Refresh world data on any state change (movement, spawn, item transfer, etc.)
          if (activeCampaign) {
            void refreshWorldData(activeCampaign.id);
          }
        },
        onQuickActions: (actions) => {
          setQuickActions(actions);
        },
        onDone: () => {
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
      setIsStreaming(false);
    }
  };

  const handleRetry = async () => {
    if (isStreaming) return;

    setIsStreaming(true);
    setLastOracleResult(null);
    setQuickActions([]);

    // Remove last assistant message (optimistic UI)
    setMessages((current) => {
      const next = [...current];
      if (next.length > 0 && next[next.length - 1].role === "assistant") {
        next.pop();
      }
      // Add empty assistant placeholder
      return [...next, { role: "assistant" as const, content: "" }];
    });

    try {
      const response = await chatRetry();

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
        onStateUpdate: () => {
          if (activeCampaign) {
            void refreshWorldData(activeCampaign.id);
          }
        },
        onQuickActions: (actions) => {
          setQuickActions(actions);
        },
        onDone: () => {
          if (activeCampaign) {
            void refreshWorldData(activeCampaign.id);
          }
        },
        onError: (error) => {
          toast.error("Retry error", { description: error });
        },
      });
    } catch (error) {
      // Remove empty placeholder on error
      setMessages((current) => {
        const next = [...current];
        const lastMessage = next[next.length - 1];
        if (lastMessage?.role === "assistant" && !lastMessage.content.trim()) {
          next.pop();
        }
        return next;
      });

      toast.error("Failed to retry", {
        description: getErrorMessage(error, "Unknown streaming error."),
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleUndo = async () => {
    if (isStreaming) return;

    try {
      await chatUndo();
      setMessages((current) => {
        const next = [...current];
        // Remove last 2 messages (user action + assistant response)
        if (next.length >= 2) {
          next.pop();
          next.pop();
        }
        return next;
      });
      setQuickActions([]);
      setLastOracleResult(null);
      if (activeCampaign) {
        void refreshWorldData(activeCampaign.id);
      }
      toast.success("Last action undone");
    } catch (error) {
      toast.error("Failed to undo", {
        description: getErrorMessage(error, "Unknown error."),
      });
    }
  };

  const handleEdit = async (messageIndex: number, newContent: string) => {
    try {
      await chatEdit(messageIndex, newContent);
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
    !isStreaming && messages.length >= 2 && messages[messages.length - 1]?.role === "assistant";

  const handleSubmitAction = () => {
    const playerAction = input.trim();
    if (!playerAction) return;
    setInput("");
    void submitAction(playerAction);
  };

  const handleQuickAction = (actionText: string) => {
    if (isStreaming) return;
    void submitAction(actionText);
  };

  const handleMove = (targetLocationName: string) => {
    if (isStreaming) return;
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
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <LocationPanel
          location={currentLocation}
          connectedLocations={connectedLocations}
          npcsHere={npcsHere}
          itemsHere={itemsHere}
          onMove={handleMove}
          disabled={isStreaming}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <OraclePanel result={lastOracleResult} />
          <NarrativeLog
            messages={messages}
            premise={premise}
            isStreaming={isStreaming}
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
        disabled={isStreaming}
      />
      <ActionBar
        value={input}
        onChange={setInput}
        onSubmit={handleSubmitAction}
        isLoading={isStreaming}
        disabled={!canInteract}
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
