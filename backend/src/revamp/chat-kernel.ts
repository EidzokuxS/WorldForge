import type {
  CampaignKernel,
  RevampChatTurn,
  RevampGmResponse,
} from "@worldforge/shared";
import { assertSafeId } from "../campaign/paths.js";
import { AppError } from "../lib/index.js";
import { readOrCreateRevampKernel } from "./cast-kernel.js";
import { writeCampaignKernel } from "./dna-adapter.js";
import { buildRevampGmResponse } from "./chat-gm.js";

export interface CreateRevampChatMessageResult {
  kernel: CampaignKernel;
  response: RevampGmResponse;
  userTurn: RevampChatTurn;
  assistantTurn: RevampChatTurn;
}

export function createRevampChatMessage(input: {
  campaignId: string;
  message: string;
  createdAt?: number;
}): CreateRevampChatMessageResult {
  assertSafeId(input.campaignId);
  const currentKernel = readOrCreateRevampKernel(input.campaignId);

  if (currentKernel.phase !== "active") {
    throw new AppError(`Campaign kernel phase ${currentKernel.phase} cannot process A9 chat.`, 409);
  }
  if (!currentKernel.startingSetup) {
    throw new AppError("A9 chat requires starting setup.", 409);
  }
  const firstTurn = currentKernel.chatSession.turns[0];
  if (!firstTurn || firstTurn.role !== "assistant" || !firstTurn.content.trim()) {
    throw new AppError("A9 chat requires an opening assistant turn.", 409);
  }

  const message = input.message.trim();
  if (!message) {
    throw new AppError("A9 chat requires a user message.", 400);
  }

  const response = buildRevampGmResponse({
    worldGraph: currentKernel.worldGraph,
    castRegistry: currentKernel.castRegistry,
    startingSetup: currentKernel.startingSetup,
    recentTurns: currentKernel.chatSession.turns.slice(-8),
    worldDna: currentKernel.worldDna,
    userMessage: message,
  });
  const createdAt = input.createdAt ?? Date.now();
  const userTurn: RevampChatTurn = {
    role: "user",
    content: message,
    createdAt,
  };
  const assistantTurn: RevampChatTurn = {
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
