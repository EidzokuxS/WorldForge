import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import {
  actorDecisionPacketSchema,
  assertActorDecisionPacket,
  type ActorDecisionPacket,
} from "./actor-decision-packet.js";
import type { ActorFrame } from "./actor-frame.js";

const log = createLogger("actor-brain");

export interface RunActorDecisionBrainArgs {
  provider: ProviderConfig;
  frame: ActorFrame;
  maxOutputTokens?: number;
}

export function buildActorDecisionSystem(): string {
  return [
    "You are the decision brain for exactly one NPC actor in a living RPG world.",
    "You are not the narrator, not the backend, and not the player's GM.",
    "Choose this actor's immediate intent from the ActorFrame only.",
    "Cite fact ids for every meaningful claim. Do not use hidden, absent, or imagined facts.",
    "Return one JSON ActorDecisionPacket only.",
    "The backend validates every requested tool; failed tools do not mutate world state.",
  ].join(" ");
}

function formatActorFrame(frame: ActorFrame): string {
  return JSON.stringify(
    {
      campaignId: frame.campaignId,
      worldVersion: frame.worldVersion,
      observer: frame.observer,
      playerActionRequest: frame.playerActionRequest,
      facts: frame.facts,
      legalTools: frame.legalTools,
      constraints: frame.constraints,
      hiddenExcludedCount: frame.hiddenExcludedCount,
    },
    null,
    2,
  );
}

export function buildActorDecisionPrompt(frame: ActorFrame): string {
  return [
    "ACTOR DECISION CONTRACT",
    "- Decide only for observer.actorId.",
    "- Use requestedTools only when this actor genuinely attempts something now.",
    "- If the actor only watches, hesitates, or has no useful move, return requestedTools: [] and a concrete noActionReason.",
    "- Prefer log_event with durability scene_local for visible speech/reaction beats unless the fact must matter later.",
    "- Use move_to only for the actor's own movement to a connected movement candidate.",
    "- For attack, restraint, escape, pursuit, defense, or other active opposition, request request_contested_outcome before any tool claim that would treat the result as settled.",
    "- Treat request_contested_outcome as bounds, not victory: HP, movement, inventory, tags, relationships, and durable memory still require separate successful backend tools.",
    "- Do not create locations, spawn NPCs, or award items unless the tool is explicitly legal and grounded.",
    "- Keep the packet compact. No prose narration.",
    "",
    "ACTOR FRAME",
    formatActorFrame(frame),
    "",
    "RETURN SHAPE",
    JSON.stringify(
      {
        actorId: frame.observer.actorId,
        decisionSummary: "one sentence decision",
        citedFactIds: ["fact:id"],
        selectedGoal: "goal or null",
        intent: "what the actor is trying to do now",
        requestedTools: [
          {
            toolName: "log_event",
            purpose: "why this tool is needed",
            input: {
              text: "grounded event text",
              importance: 3,
              participants: [frame.observer.label],
              durability: "scene_local",
            },
          },
        ],
        beliefUpdates: [],
        planUpdates: [],
        nextDecisionTrigger: {
          reason: "when this actor should reconsider",
          delayWorldTimeMinutes: 15,
        },
        noActionReason: null,
      },
      null,
      2,
    ),
  ].join("\n");
}

export async function runActorDecisionBrain(
  args: RunActorDecisionBrainArgs,
): Promise<ActorDecisionPacket> {
  const prompt = buildActorDecisionPrompt(args.frame);
  const result = await withRole("judge", () =>
    safeGenerateObject({
      model: createModel(args.provider, { role: "judge" }),
      schema: actorDecisionPacketSchema,
      system: buildActorDecisionSystem(),
      prompt,
      temperature: 0.2,
      maxOutputTokens: args.maxOutputTokens,
    }),
  );
  const packet = assertActorDecisionPacket({
    frame: args.frame,
    packet: result.object,
  });
  log.event("actor.decision.packet", {
    campaignId: args.frame.campaignId,
    actorId: packet.actorId,
    citedFactCount: packet.citedFactIds.length,
    requestedToolCount: packet.requestedTools.length,
    noAction: packet.requestedTools.length === 0,
    usage: result.trace.usage ?? null,
    reasoningLen: result.trace.reasoningText?.length ?? 0,
  });
  return packet;
}
