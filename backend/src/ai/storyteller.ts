import { streamText } from "ai";
import type { ChatMessage } from "@worldforge/shared";
import { createModel } from "./provider-registry.js";
import type { ProviderConfig } from "./provider-registry.js";

export type { ChatMessage } from "@worldforge/shared";

export interface StorytellerRequest {
  playerAction: string;
  worldPremise: string;
  chatHistory: ChatMessage[];
  temperature: number;
  maxTokens: number;
  provider: ProviderConfig;
  onFinish?: (result: { text: string }) => void | Promise<void>;
}

export function callStoryteller(req: StorytellerRequest) {
  const model = createModel(req.provider);

  const systemPrompt = `You are the Storyteller — a vivid, atmospheric narrator for a text RPG.
World premise: ${req.worldPremise}

Rules:
- Narrate the outcome of the player's action in 2-4 paragraphs
- Be descriptive and atmospheric, use sensory details
- Never break character or reference game mechanics
- End with a subtle hook or situation that invites the player's next action
- Do NOT list options or choices — just narrate what happens
- Address the player as "you"`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...req.chatHistory.slice(-20),
    { role: "user", content: req.playerAction },
  ];

  return streamText({
    model,
    messages,
    temperature: req.temperature,
    maxOutputTokens: req.maxTokens,
    onFinish: async ({ text }) => {
      await req.onFinish?.({ text });
    },
  });
}
