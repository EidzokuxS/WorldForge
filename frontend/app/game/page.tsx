"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LocationPanel } from "@/components/game/location-panel";
import { NarrativeLog } from "@/components/game/narrative-log";
import { CharacterPanel } from "@/components/game/character-panel";
import { LorePanel } from "@/components/game/lore-panel";
import { ActionBar } from "@/components/game/action-bar";
import type { CampaignMeta, ChatMessage } from "@worldforge/shared";
import { isChatMessage } from "@worldforge/shared";
import { getErrorMessage } from "@/lib/settings";
import { apiGet, apiStreamPost } from "@/lib/api";

type ChatHistoryResponse = {
  messages: ChatMessage[];
  premise: string;
};

export default function GamePage() {
  const router = useRouter();
  const [activeCampaign, setCampaignMeta] = useState<CampaignMeta | null>(null);
  const [premise, setPremise] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function initGame() {
      try {
        const campaign = await apiGet<CampaignMeta | null>("/api/campaigns/active");
        if (!campaign) {
          toast.error("No active campaign found. Create or load one first.");
          router.replace("/");
          return;
        }

        if (cancelled) {
          return;
        }

        setCampaignMeta(campaign);

        const history = await apiGet<ChatHistoryResponse>("/api/chat/history");
        if (cancelled) {
          return;
        }

        const safeMessages = Array.isArray(history.messages)
          ? history.messages.filter(isChatMessage)
          : [];

        setMessages(safeMessages);
        setPremise(history.premise || campaign.premise);
      } catch (error) {
        toast.error("Failed to load game state", {
          description:
            getErrorMessage(error, "Unknown initialization error."),
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

  const handleSubmitAction = async () => {
    const playerAction = input.trim();
    if (!playerAction || isStreaming) {
      return;
    }

    setInput("");
    setIsStreaming(true);

    const userMessage: ChatMessage = { role: "user", content: playerAction };
    setMessages((current) => [...current, userMessage, { role: "assistant", content: "" }]);

    try {
      const response = await apiStreamPost("/api/chat", { playerAction });

      if (!response.body) {
        throw new Error("Empty response stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        assistantText += decoder.decode(value, { stream: true });
        updateAssistantContent(assistantText);
      }

      assistantText += decoder.decode();
      updateAssistantContent(assistantText);
    } catch (error) {
      setMessages((current) => {
        const next = [...current];
        const lastMessage = next[next.length - 1];
        if (lastMessage?.role === "assistant" && !lastMessage.content.trim()) {
          next.pop();
        }
        return next;
      });

      toast.error("Failed to generate narrative", {
        description:
          getErrorMessage(error, "Unknown streaming error."),
      });
    } finally {
      setIsStreaming(false);
    }
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
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <LocationPanel campaignId={activeCampaign?.id ?? null} />
        <NarrativeLog messages={messages} premise={premise} isStreaming={isStreaming} />
        <CharacterPanel />
        <LorePanel campaignId={activeCampaign?.id ?? null} />
      </div>
      <ActionBar
        value={input}
        onChange={setInput}
        onSubmit={() => void handleSubmitAction()}
        isLoading={isStreaming}
        disabled={!canInteract}
      />
    </div>
  );
}
