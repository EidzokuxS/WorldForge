import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import {
  actorDecisionPacketSchema,
  assertActorDecisionPacket,
  type ActorDecisionPacket,
} from "./actor-decision-packet.js";
import type { ActorFrame } from "./actor-frame.js";
import { playerBlockingStageLimit } from "./runtime-limits.js";

const log = createLogger("actor-brain");

export const ACTOR_DECISION_TIMEOUT_MS = playerBlockingStageLimit(
  "WORLDFORGE_ACTOR_DECISION_TIMEOUT_MS",
);
export const ACTOR_DECISION_DEFAULT_MAX_OUTPUT_TOKENS = 900;

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

function actorToolInputContracts(frame: ActorFrame): string {
  const contracts: string[] = [];
  if (frame.legalTools.includes("log_event")) {
    contracts.push(
      'log_event input: { "text": string, "importance": 1-10, "participants": [exact visible/current actor labels], "durability": "scene_local"|"durable", "futureRelevance"?: string }. durable requires futureRelevance.',
    );
  }
  if (frame.legalTools.includes("move_to")) {
    contracts.push(
      'move_to input: { "targetLocationName": string }. Copy the exact destination from a cited reachable move:* fact. Do not use destination, destinationRef, target, locationName, or an empty input object.',
    );
  }
  if (frame.legalTools.includes("set_relationship")) {
    contracts.push(
      'set_relationship input: { "entityA": string, "entityB": string, "tag": string, "reason": string }. Entities must be visible/current ActorFrame facts.',
    );
  }
  if (frame.legalTools.includes("add_tag")) {
    contracts.push(
      'add_tag input: { "entityName": string, "entityType": "player"|"npc"|"location"|"faction"|"item", "tag": string }. Use only for a concrete observable state/status this actor can impose now.',
    );
  }
  if (frame.legalTools.includes("remove_tag")) {
    contracts.push(
      'remove_tag input: { "entityName": string, "entityType": "player"|"npc"|"location"|"faction"|"item", "tag": string }. Use only when this actor actually clears a current observable state/status.',
    );
  }
  if (frame.legalTools.includes("request_contested_outcome")) {
    contracts.push(
      'request_contested_outcome input: { "actorName": string, "targetName": string, "mode": "attack"|"restrain"|"escape"|"pursue"|"defend"|"interfere"|"other", "intent": string, "stakes": string, "evidenceRefs": [fact ids] }.',
    );
  }
  if (frame.legalTools.includes("set_condition")) {
    contracts.push(
      'set_condition input: { "targetName": string, "delta"?: number, "value"?: number }. Provide delta or value; only for settled injury/healing after a bounded contest permits it.',
    );
  }
  if (frame.legalTools.includes("spawn_item")) {
    contracts.push(
      'spawn_item input: { "name": string, "tags": [string], "ownerName": string, "ownerType": "character"|"location" }. Do not create items as a substitute for missing proof.',
    );
  }
  if (frame.legalTools.includes("transfer_item")) {
    contracts.push(
      'transfer_item input: { "itemName": string, "targetName": string, "targetType": "character"|"location", "equipState"?: "carried"|"equipped", "equippedSlot"?: string }. Item and recipient must be grounded in current facts.',
    );
  }

  return contracts.length > 0
    ? contracts.map((contract) => `- ${contract}`).join("\n")
    : "- none";
}

export function buildActorDecisionPrompt(frame: ActorFrame): string {
  return [
    "ACTOR DECISION CONTRACT",
    "- Decide only for observer.actorId.",
    "- Use requestedTools only when this actor genuinely attempts something now.",
    '- Every requestedTools entry must be exactly { "toolName": string, "purpose": string, "input": object }.',
    "- Never put tool arguments beside input. For log_event, text, importance, participants, durability, and futureRelevance must be inside input.",
    '- INVALID requestedTools entry: { "toolName": "log_event", "purpose": "...", "input": "text", "text": "...", "importance": 3, "participants": [], "durability": "scene_local" }.',
    "- If the actor only watches, hesitates, or has no useful move, return requestedTools: [] and a concrete noActionReason.",
    "- Use log_event durability durable, with futureRelevance, when the actor gives the player a future-usable procedure, constraint, route, name, lead, warning, promise, obligation, or permission boundary.",
    '- HARD VALIDATION RULE: every requested log_event with input.durability === "durable" must include non-empty input.futureRelevance. If you cannot state why it should matter later in one sentence, use scene_local or omit the tool.',
    "- Use log_event durability scene_local only for transient speech, posture, hesitation, sensory color, or witnessed beats that should not matter after this turn.",
    "- Use move_to only for the actor's own movement to a connected movement candidate.",
    "- For attack, restraint, escape, pursuit, defense, or other active opposition, request request_contested_outcome before any tool claim that would treat the result as settled.",
    "- Treat request_contested_outcome as bounds, not victory: HP, movement, inventory, tags, relationships, and durable memory still require separate successful backend tools.",
    "- Do not create locations, spawn NPCs, or award items unless the tool is explicitly legal and grounded.",
    "- Before returning JSON, check every requested tool against legalTools and the durable/futureRelevance rule.",
    "- Keep the packet compact. No prose narration.",
    "",
    "ACTOR FRAME",
    formatActorFrame(frame),
    "",
    "LEGAL TOOL INPUT CONTRACTS",
    actorToolInputContracts(frame),
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
    "",
    "DURABLE LOG_EVENT EXAMPLE",
    JSON.stringify(
      {
        toolName: "log_event",
        purpose: "Record a procedure or boundary that can affect later play.",
        input: {
          text: "Gate Clerk says the player needs a stamped Council seal before the ward gate will open.",
          importance: 4,
          participants: [frame.observer.label],
          durability: "durable",
          futureRelevance:
            "The stamped Council seal requirement should constrain later attempts to enter this ward.",
        },
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
      model: createModel(args.provider, { role: "judge", reasoningMode: "bypass" }),
      schema: actorDecisionPacketSchema,
      system: buildActorDecisionSystem(),
      prompt,
      temperature: 0.2,
      mode: "native_json",
      retries: 1,
      allowTextFallback: false,
      allowRepair: false,
      maxOutputTokens: Math.min(
        args.maxOutputTokens ?? ACTOR_DECISION_DEFAULT_MAX_OUTPUT_TOKENS,
        ACTOR_DECISION_DEFAULT_MAX_OUTPUT_TOKENS,
      ),
      timeout: { totalMs: ACTOR_DECISION_TIMEOUT_MS },
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
