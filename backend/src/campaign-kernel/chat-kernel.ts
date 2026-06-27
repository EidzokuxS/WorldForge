import type {
  CampaignKernel,
  CampaignChatTurn,
  CampaignGmResponse,
} from "@worldforge/shared";
import { assertSafeId } from "../campaign/paths.js";
import { AppError } from "../lib/index.js";
import { readOrCreateCampaignKernel } from "./cast-kernel.js";
import { writeCampaignKernel } from "./dna-adapter.js";
import { buildCampaignGmResponse } from "./chat-gm.js";

export interface CreateCampaignChatMessageResult {
  kernel: CampaignKernel;
  response: CampaignGmResponse;
  userTurn: CampaignChatTurn;
  assistantTurn: CampaignChatTurn;
}

export function createCampaignChatMessage(input: {
  campaignId: string;
  message: string;
  createdAt?: number;
}): CreateCampaignChatMessageResult {
  assertSafeId(input.campaignId);
  const currentKernel = readOrCreateCampaignKernel(input.campaignId);

  if (currentKernel.phase !== "active") {
    throw new AppError(`Campaign kernel phase ${currentKernel.phase} cannot process A9 chat.`, 409);
  }
  if (!currentKernel.startingSetup) {
    throw new AppError("A9 chat requires starting setup.", 409);
  }
  if (!currentKernel.runtimeState.currentSceneId) {
    throw new AppError("A9 chat requires current scene.", 409);
  }
  const firstTurn = currentKernel.chatSession.turns[0];
  if (!firstTurn || firstTurn.role !== "assistant" || !firstTurn.content.trim()) {
    throw new AppError("A9 chat requires an opening assistant turn.", 409);
  }

  const message = input.message.trim();
  if (!message) {
    throw new AppError("A9 chat requires a user message.", 400);
  }

  const response = buildCampaignGmResponse({
    worldGraph: currentKernel.worldGraph,
    castRegistry: currentKernel.castRegistry,
    startingSetup: currentKernel.startingSetup,
    currentSceneId: currentKernel.runtimeState.currentSceneId,
    recentTurns: currentKernel.chatSession.turns.slice(-8),
    worldDna: currentKernel.worldDna,
    userMessage: message,
  });
  const createdAt = input.createdAt ?? Date.now();
  const userTurn: CampaignChatTurn = {
    role: "user",
    content: message,
    createdAt,
  };
  const assistantTurn: CampaignChatTurn = {
    role: "assistant",
    content: response.text,
    createdAt,
  };
  const nextKernel: CampaignKernel = {
    ...currentKernel,
    chatSession: {
      turns: [
        ...currentKernel.chatSession.turns,
        userTurn,
        assistantTurn,
      ],
      pendingSoftStateHints: response.softStateHints,
    },
    turnIndex: currentKernel.turnIndex + 2,
  };

  writeCampaignKernel(input.campaignId, nextKernel);
  return {
    kernel: nextKernel,
    response,
    userTurn,
    assistantTurn,
  };
}
