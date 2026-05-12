/**
 * Storyteller tool definitions for AI SDK.
 *
 * Factory function creates campaign-scoped tools with Zod input schemas.
 * Each tool's execute callback delegates to the tool-executor for DB validation.
 */

import { z } from "zod";
import { tool } from "ai";
import { executeToolCall } from "./tool-executor.js";
import type { ToolExecutionContext } from "./tool-execution-context.js";
import {
  executeBridgeCandidateTool,
  type BridgeLookupToolName,
} from "./bridge-candidate-tools.js";
import {
  MINOR_POI_TYPES,
  SCENE_EXTRA_ROLES,
} from "./bridge-state-tools.js";
import { INVENTORY_EQUIP_STATES } from "../inventory/authority.js";

const entityTypeEnum = z.enum(["player", "npc", "location", "item", "faction"]);
const eventDurabilityEnum = z.enum(["durable", "scene_local"]);
const dialogueOutcomeKindEnum = z.enum([
  "answered",
  "refused",
  "silent",
  "gestured",
  "warned",
  "redirected",
  "unavailable",
  "no_current_answer",
]);
const dialogueTopicKindEnum = z.enum([
  "social",
  "procedure",
  "permission",
  "proof",
  "route",
  "safety",
  "trade",
  "status",
  "other",
]);
const dialogueAuthorityKindEnum = z.enum([
  "role_authority",
  "public_service",
  "witness",
  "hearsay",
  "not_authorized",
  "no_visible_authority",
  "unknown",
]);
const dialogueTruthStatusEnum = z.enum([
  "settled_by_backend",
  "speaker_asserted",
  "unconfirmed",
  "contested",
  "conflicting",
]);
const dialogueFutureUseKindEnum = z.enum([
  "route_choice",
  "permission_check",
  "evidence",
  "safety",
  "obligation",
  "npc_memory",
  "relationship",
  "other",
]);
const worldFactSourceKindEnum = z.enum([
  "direct_observation",
  "public_record",
  "report_message",
  "rumor",
  "claim",
  "comparison",
  "memory",
  "other",
]);
const worldFactTruthStatusEnum = z.enum([
  "observed",
  "verified",
  "reported",
  "rumored",
  "claimed",
  "believed",
  "disputed",
  "unknown",
]);
const worldFactKindEnum = z.enum([
  "public_record",
  "procedure",
  "route_status",
  "permission_boundary",
  "warning",
  "lead",
  "status",
  "contradiction",
  "gap",
  "other",
]);
const worldFactClaimKindEnum = z.enum([
  "public_record",
  "requirement",
  "permission_boundary",
  "prohibition",
  "office",
  "route_status",
  "warning",
  "lead",
  "status",
  "contradiction",
  "gap",
  "other",
]);
const dialogueClaimKindEnum = z.enum([
  "requirement",
  "permission",
  "prohibition",
  "office",
  "route_status",
  "warning",
  "lead",
  "document_status",
  "other",
]);
const dialogueClaimPolarityEnum = z.enum([
  "allows",
  "denies",
  "requires",
  "redirects",
  "unknown",
  "states",
]);
const inventoryEquipStateEnum = z.enum(INVENTORY_EQUIP_STATES);
const contestedOutcomeModeEnum = z.enum([
  "attack",
  "restrain",
  "escape",
  "pursue",
  "defend",
  "contest",
]);
const transferItemInputSchema = z.discriminatedUnion("targetType", [
  z.object({
    itemName: z.string().describe("Name of the item to transfer"),
    targetName: z.string().describe("Name of the character to receive the item"),
    targetType: z.literal("character").describe("Transfer to a character"),
    equipState: inventoryEquipStateEnum
      .optional()
      .describe("Optional carry/equip intent. Omit to keep the item carried."),
    equippedSlot: z
      .string()
      .optional()
      .describe("Optional explicit slot when equipState is equipped"),
  }),
  z.object({
    itemName: z.string().describe("Name of the item to transfer"),
    targetName: z.string().describe("Name of the location to receive the item"),
    targetType: z.literal("location").describe("Transfer to a location"),
  }),
]);

const addTagInputSchema = z.object({
  entityName: z.string().describe("Name of the entity to tag"),
  entityType: entityTypeEnum,
  tag: z.string().describe("The tag to add (lowercase, hyphenated); item tags carry durable document states such as reviewed, officially-unsealed, docketed, stamped, receipt, or warning-rider"),
});

const removeTagInputSchema = z.object({
  entityName: z.string().describe("Name of the entity"),
  entityType: entityTypeEnum,
  tag: z.string().describe("The tag to remove"),
});

const setRelationshipInputSchema = z.object({
  entityA: z.string().describe("Name of the first entity"),
  entityB: z.string().describe("Name of the second entity"),
  tag: z
    .string()
    .describe("Relationship tag (e.g. ally, enemy, mentor, rival)"),
  reason: z
    .string()
    .describe("Brief reason for this relationship"),
});

const addChronicleEntryInputSchema = z.object({
  text: z
    .string()
    .describe("Description of the event for the chronicle"),
});

const logEventInputSchema = z.object({
  text: z.string().describe("Event description for memory"),
  importance: z
    .number()
    .min(1)
    .max(10)
    .describe("Importance 1-10 (10 = world-changing, 1 = trivial)"),
  participants: z
    .array(z.string())
    .describe("Clear local/current actor names from model-facing refs; omit transcript-only or offscreen names"),
  durability: eventDurabilityEnum
    .optional()
    .describe("scene_local for transient/attempted/witnessed beats; durable only for future-relevant facts that do not grant possession, access, item use, or completed movement by themselves"),
  futureRelevance: z
    .string()
    .min(1)
    .optional()
    .describe("Required when durability is durable: why this fact should matter later"),
}).superRefine((data, ctx) => {
  if (data.durability === "durable" && !data.futureRelevance?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["futureRelevance"],
      message: "futureRelevance is required when durability is durable",
    });
  }
});

const advanceTimeInputSchema = z.object({
  minutes: z
    .number()
    .int()
    .min(1)
    .max(525_600)
    .describe("GM-estimated in-world minutes elapsed by the player action"),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .describe("Brief source-grounded reason this much time passed"),
});

const offerQuickActionsInputSchema = z.object({
  actions: z
    .array(
      z.object({
        label: z.string().describe("Short button label"),
        action: z.string().describe("Full action text if selected"),
      })
    )
    .min(3)
    .max(5),
});

const spawnNpcInputSchema = z.object({
  name: z.string().describe("NPC name"),
  tags: z.array(z.string()).describe("Tags describing the NPC (role, trait, local function, state)"),
  locationRef: z
    .enum(["current_scene", "current_location"])
    .optional()
    .describe("Preferred local spawn target for GM turns after the backend has established where the scene is."),
  locationId: z
    .string()
    .optional()
    .describe("Exact location id only when exposed by the model-facing legal refs or returned by a successful reveal_location observation in this tool loop."),
  locationName: z
    .string()
    .optional()
    .describe("Legacy compatibility only; player turns may use only the current scene/current location name."),
}).refine(
  (data) => Boolean(data.locationRef ?? data.locationId ?? data.locationName),
  { message: "locationRef, locationId, or locationName is required" },
);

const promoteNpcInputSchema = z.object({
  npcRef: z.string().describe("Visible NPC id or name to promote"),
  newTier: z.enum(["persistent", "key"]).describe("Promotion target tier"),
  reason: z.string().min(1).describe("Brief source-grounded reason this NPC should persist"),
});

const spawnItemInputSchema = z.object({
  name: z.string().describe("Concrete item name; only create tangible future-usable items, not incidental scenery."),
  tags: z.array(z.string()).describe("Tags describing item function, state, visibility, and story relevance. Include document/receipt/proof plus state tags for future-usable receipts, dockets, stamps, warning riders, permits, and proof artifacts."),
  ownerName: z.string().describe("Visible character or local location ref that the backend can resolve as the authoritative item owner."),
  ownerType: z.enum(["character", "location"]).describe("Whether the owner is a character or location"),
});

const revealLocationInputSchema = z.object({
  name: z.string().describe("Name of the new local sublocation or ephemeral scene."),
  description: z.string().describe("Grounded description of the newly discovered local place."),
  tags: z.array(z.string()).describe("Tags for locality, persistence, access, and scene function."),
  connectedToName: z.string().describe("Existing local anchor. Prefer current_scene/current_location; otherwise copy an exact legal ref from the model-facing view, never a shortened paraphrase."),
});

const setConditionInputSchema = z.object({
  targetName: z.string().describe("Name of the player character"),
  delta: z.number().optional().describe("HP change: positive to heal, negative to damage"),
  value: z.number().min(0).max(5).optional().describe("Set HP to this absolute value (0-5)"),
}).refine(
  (data) => data.delta !== undefined || data.value !== undefined,
  { message: "Either delta or value must be provided" }
);

const requestContestedOutcomeInputSchema = z.object({
  actorName: z.string().describe("Visible actor name or id attempting the contest"),
  targetName: z.string().describe("Visible opposing actor name or id"),
  mode: contestedOutcomeModeEnum.describe("Kind of contested pressure being requested"),
  intent: z.string().min(1).max(400).describe("What the actor is trying to do now"),
  stakes: z.string().min(1).max(400).describe("What would change if this contest lands"),
  evidenceRefs: z
    .array(z.string().min(1).max(200))
    .max(8)
    .default([])
    .describe("ActorFrame/SceneFrame fact ids or exact visible refs supporting the contest"),
});

const moveToInputSchema = z.object({
  targetLocationName: z
    .string()
    .describe("Name of the destination location (must be connected to current location)"),
});

const bridgeLookupScopeEnum = z.enum(["current_scene", "current_location", "visible", "known"]);
const bridgeLookupMaxResults = z.number().int().min(1).max(8).optional();
const bridgeCandidateQueryInputSchema = z.object({
  query: z.string().trim().min(1).max(160).describe("Fuzzy player-facing words to match against visible/legal candidates"),
  scope: bridgeLookupScopeEnum.optional().describe("Limit lookup to the current visible or known scope"),
  tags: z.array(z.string().trim().min(1).max(80)).max(6).default([]),
  maxResults: bridgeLookupMaxResults,
});
const listVisibleAffordancesInputSchema = z.object({
  scope: bridgeLookupScopeEnum.optional().describe("Visible scope to summarize"),
  maxResults: bridgeLookupMaxResults,
});
const listNavigationOptionsInputSchema = z.object({
  actorRef: z.string().trim().min(1).max(160).optional(),
  fromLocationRef: z.string().trim().min(1).max(160).optional(),
  maxResults: bridgeLookupMaxResults,
});
const findActorCandidatesInputSchema = bridgeCandidateQueryInputSchema.extend({
  relationHint: z.string().trim().min(1).max(160).optional(),
});
const findPoiCandidatesInputSchema = bridgeCandidateQueryInputSchema.extend({
  areaRef: z.string().trim().min(1).max(160).optional(),
  includePotential: z.boolean().default(false),
});
const inspectKnownFactInputSchema = z.object({
  query: z.string().trim().min(1).max(220).optional(),
  ref: z.string().trim().min(1).max(180).optional(),
  scope: bridgeLookupScopeEnum.optional(),
  maxResults: bridgeLookupMaxResults,
}).refine(
  (data) => Boolean(data.query ?? data.ref),
  { message: "query or ref is required" },
);
const checkRouteInputSchema = z.object({
  actorRef: z.string().trim().min(1).max(160).optional(),
  destinationRef: z.string().trim().min(1).max(160),
  mode: z.enum(["walk", "travel", "follow_route", "unknown"]).default("walk"),
});
const moveActorInputSchema = z.object({
  actorRef: z.string().trim().min(1).max(160).optional(),
  destinationRef: z.string().trim().min(1).max(160),
  routeId: z.string().trim().min(1).max(180).optional(),
  mode: z.enum(["walk", "travel", "follow_route", "unknown"]).default("walk"),
  intentSummary: z.string().trim().min(1).max(300).optional(),
  evidenceRefs: z
    .array(z.string().trim().min(1).max(200))
    .min(1)
    .max(8)
    .describe("Refs from legal route/movement lookup or check_route evidence."),
});
const createMinorPoiInputSchema = z.object({
  areaRef: z.string().trim().min(1).max(160).default("current_location"),
  poiType: z.enum(MINOR_POI_TYPES),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(400).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(6).default([]),
  persistence: z.enum(["scene_local", "ephemeral"]).default("scene_local"),
  visibility: z.enum(["public", "visible"]).default("public"),
  reason: z.string().trim().min(1).max(360),
});
const createSceneExtraInputSchema = z.object({
  locationRef: z.enum(["current_scene", "current_location"]).default("current_scene"),
  role: z.enum(SCENE_EXTRA_ROLES),
  name: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(6).default([]),
  persistence: z.enum(["temporary"]).default("temporary"),
  visibility: z.enum(["visible"]).default("visible"),
  reason: z.string().trim().min(1).max(360),
});
const startSearchInputSchema = z.object({
  actorRef: z.string().trim().min(1).max(160).optional(),
  query: z.string().trim().min(1).max(220),
  scope: z.enum(["current_scene", "current_location", "visible"]).default("current_scene"),
  method: z.enum(["look", "ask", "inspect", "listen", "track", "browse"]).default("look"),
  intentSummary: z.string().trim().min(1).max(300).optional(),
});
const recordPlayerIntentInputSchema = z.object({
  actorRef: z.string().trim().min(1).max(160).optional(),
  intentType: z.enum(["seek", "ask", "claim", "avoid", "follow", "inspect", "negotiate", "travel", "other"]),
  targetHint: z.string().trim().min(1).max(220).optional(),
  stance: z.enum(["intends", "claims", "suspects", "asks", "refuses", "offers", "unknown"]).default("intends"),
  summary: z.string().trim().min(1).max(360).optional(),
});
const recordDialogueClaimInputSchema = z.object({
  claimKind: dialogueClaimKindEnum,
  polarity: dialogueClaimPolarityEnum,
  subjectRef: z.string().trim().min(1).max(180).optional(),
  subjectText: z.string().trim().min(1).max(240).optional(),
  summary: z.string().trim().min(1).max(500),
});
const recordWorldFactClaimInputSchema = z.object({
  claimKind: worldFactClaimKindEnum,
  polarity: dialogueClaimPolarityEnum,
  subjectRef: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .optional()
    .describe("Optional exact legal visible/current ref or player-known fact ref only; never use free text like notice board, date gap, route log mismatch, clerk, office, or permit here."),
  subjectText: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .optional()
    .describe("Free-text subject label for concepts that are not exact legal refs, such as notice board, posted date, route log mismatch, office name, permit, or procedure."),
  summary: z.string().trim().min(1).max(600),
});
const recordWorldFactInputSchema = z.object({
  sourceKind: worldFactSourceKindEnum.describe("How the player knows this fact: observation, public record, report, rumor, claim, comparison, memory, or other."),
  truthStatus: worldFactTruthStatusEnum.describe("Structured confidence/status. Use disputed/unknown for gaps or contradictions instead of inventing certainty."),
  factKind: worldFactKindEnum.describe("The game-useful fact category being recorded."),
  topicKind: dialogueTopicKindEnum.describe("Broad topic for later retrieval and route choice."),
  durability: z.literal("durable").describe("World facts are future-usable player knowledge; transient color belongs in observation or scene-local beats."),
  futureUseKind: dialogueFutureUseKindEnum.describe("How this fact may matter later."),
  futureRelevance: z
    .string()
    .trim()
    .min(1)
    .max(700)
    .describe("One concrete sentence explaining how later play can use this fact."),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(900)
    .describe("Human-readable player-known fact summary. Validators do not parse this for semantics."),
  claims: z
    .array(recordWorldFactClaimInputSchema)
    .min(1)
    .max(8)
    .describe("Structured claims carried by this fact. These fields carry semantics; prose does not."),
  subjectRefs: z
    .array(z.string().trim().min(1).max(180))
    .max(8)
    .default([])
    .describe("Optional legal visible/current refs or player-known fact refs the fact is about."),
  sourceRefs: z
    .array(z.string().trim().min(1).max(180))
    .min(1)
    .max(12)
    .describe("Legal visible/current refs or player-known fact refs that support this fact."),
}).superRefine((data, ctx) => {
  if (
    data.truthStatus === "unknown"
    && data.factKind !== "gap"
    && data.factKind !== "contradiction"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["factKind"],
      message: "unknown truthStatus must record a gap or contradiction, not a positive fact",
    });
  }
});
const proceduralDialogueTopicKinds = new Set([
  "procedure",
  "permission",
  "proof",
  "route",
  "safety",
  "status",
]);
const proceduralDialogueOutcomeKindsRequiringClaims = new Set([
  "answered",
  "warned",
  "redirected",
]);
const recordDialogueOutcomeInputSchema = z.object({
  speakerRef: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .optional()
    .describe("Exact visible/current actor ref for the NPC/source who answered, refused, warned, gestured, or stayed silent. Do not use a raw role/office label unless it is a legal ref."),
  addresseeRefs: z
    .array(z.string().trim().min(1).max(180))
    .min(1)
    .max(6)
    .describe("Visible/current actor refs who receive this dialogue outcome; usually Player plus any present listener."),
  outcomeKind: dialogueOutcomeKindEnum.describe("Structural outcome. This enum decides what happened; prose does not."),
  topicKind: dialogueTopicKindEnum.describe("What the exchange is about; use procedure/proof/permission/route/safety/status for reusable game facts."),
  authorityKind: dialogueAuthorityKindEnum.describe("Whether the speaker/source can be relied on for the topic."),
  truthStatus: dialogueTruthStatusEnum.describe("Whether the content is backend-settled, speaker-asserted, unconfirmed, contested, or conflicting."),
  durability: eventDurabilityEnum.describe("durable for future-usable answers/refusals/warnings/redirects; scene_local for immediate color."),
  futureUseKind: dialogueFutureUseKindEnum
    .optional()
    .describe("Required when durable: how this outcome can matter later."),
  futureRelevance: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .optional()
    .describe("Required when durable: one concrete sentence explaining later use."),
  requestedRoleText: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .optional()
    .describe("For unavailable/no_current_answer: plain role, office, or authority text the player tried to reach. This is text, not a ref."),
  quote: z
    .string()
    .trim()
    .min(1)
    .max(1_000)
    .optional()
    .describe("Optional direct speech in any language. Validators do not parse this for semantics."),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(700)
    .describe("Human-readable summary in any language. Validators do not parse this for semantics."),
  claims: z
    .array(recordDialogueClaimInputSchema)
    .max(8)
    .default([])
    .describe("Structured claims carried by procedural/reusable dialogue outcomes."),
  sourceRefs: z
    .array(z.string().trim().min(1).max(180))
    .min(1)
    .max(12)
    .describe("Exact legal visible/current refs or known fact refs supporting the outcome. For unavailable/no_current_answer, cite Player/current_scene/current_location/visible evidence, not the unavailable role text."),
}).superRefine((data, ctx) => {
  if (data.durability === "durable") {
    if (!data.futureUseKind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["futureUseKind"],
        message: "futureUseKind is required when durability is durable",
      });
    }
    if (!data.futureRelevance?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["futureRelevance"],
        message: "futureRelevance is required when durability is durable",
      });
    }
  }

  if (data.outcomeKind === "unavailable" || data.outcomeKind === "no_current_answer") {
    if (data.authorityKind !== "no_visible_authority") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authorityKind"],
        message: "unavailable/no_current_answer outcomes require authorityKind no_visible_authority",
      });
    }
    if (data.speakerRef?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["speakerRef"],
        message: "unavailable/no_current_answer outcomes with no_visible_authority must not use a speakerRef",
      });
    }
    if (!data.requestedRoleText?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requestedRoleText"],
        message: "requestedRoleText is required for unavailable/no_current_answer outcomes",
      });
    }
  } else {
    if (data.authorityKind === "no_visible_authority") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authorityKind"],
        message: "no_visible_authority is only valid for unavailable/no_current_answer outcomes",
      });
    }
    if (!data.speakerRef?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["speakerRef"],
        message: "speakerRef is required for visible dialogue outcomes",
      });
    }
  }

  if (
    data.durability === "durable"
    && proceduralDialogueTopicKinds.has(data.topicKind)
    && proceduralDialogueOutcomeKindsRequiringClaims.has(data.outcomeKind)
    && data.claims.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["claims"],
      message: "durable procedural answered/warned/redirected outcomes require at least one structured claim",
    });
  }
});

export const runtimeToolInputSchemas = {
  list_visible_affordances: listVisibleAffordancesInputSchema,
  list_navigation_options: listNavigationOptionsInputSchema,
  find_location_candidates: bridgeCandidateQueryInputSchema,
  find_object_candidates: bridgeCandidateQueryInputSchema,
  find_actor_candidates: findActorCandidatesInputSchema,
  find_poi_candidates: findPoiCandidatesInputSchema,
  inspect_known_fact: inspectKnownFactInputSchema,
  check_route: checkRouteInputSchema,
  move_actor: moveActorInputSchema,
  create_minor_poi: createMinorPoiInputSchema,
  create_scene_extra: createSceneExtraInputSchema,
  start_search: startSearchInputSchema,
  record_player_intent: recordPlayerIntentInputSchema,
  record_dialogue_outcome: recordDialogueOutcomeInputSchema,
  record_world_fact: recordWorldFactInputSchema,
  add_tag: addTagInputSchema,
  remove_tag: removeTagInputSchema,
  set_relationship: setRelationshipInputSchema,
  add_chronicle_entry: addChronicleEntryInputSchema,
  log_event: logEventInputSchema,
  advance_time: advanceTimeInputSchema,
  offer_quick_actions: offerQuickActionsInputSchema,
  spawn_npc: spawnNpcInputSchema,
  promote_npc: promoteNpcInputSchema,
  spawn_item: spawnItemInputSchema,
  reveal_location: revealLocationInputSchema,
  request_contested_outcome: requestContestedOutcomeInputSchema,
  set_condition: setConditionInputSchema,
  move_to: moveToInputSchema,
  transfer_item: transferItemInputSchema,
} as const;

export type RuntimeToolName = keyof typeof runtimeToolInputSchemas;

/**
 * Create Storyteller tools bound to a specific campaign and tick.
 * Returns a tools object suitable for passing to streamText().
 */
export function createStorytellerTools(
  campaignId: string,
  tick: number,
  outcomeTier?: string,
  executionContext?: ToolExecutionContext,
) {
  let executionQueue = Promise.resolve();
  const executeRuntimeTool = (
    toolName: RuntimeToolName,
    args: Record<string, unknown>,
    toolOutcomeTier?: string,
  ) => {
    const run = executionQueue.then(() =>
      executeToolCall(
        campaignId,
        toolName,
        args,
        tick,
        toolOutcomeTier,
        executionContext,
      ),
    );
    executionQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  const executeBridgeLookupTool = (
    toolName: BridgeLookupToolName,
    args: Record<string, unknown>,
  ) => executeBridgeCandidateTool(toolName, args, executionContext);

  return {
    list_visible_affordances: tool({
      description:
        "Observation-only lookup. List current visible affordances, legal targets, legal movement, visible fact refs, and allowed tools without mutating world state.",
      inputSchema: listVisibleAffordancesInputSchema,
      execute: (args) => executeBridgeLookupTool("list_visible_affordances", args),
    }),

    list_navigation_options: tool({
      description:
        "Observation-only lookup. Return visible/legal navigation options from model-facing movement candidates; never invent or reveal hidden routes.",
      inputSchema: listNavigationOptionsInputSchema,
      execute: (args) => executeBridgeLookupTool("list_navigation_options", args),
    }),

    find_location_candidates: tool({
      description:
        "Observation-only lookup. Fuzzy-match visible legal locations and movement refs by player-facing words or tags.",
      inputSchema: bridgeCandidateQueryInputSchema,
      execute: (args) => executeBridgeLookupTool("find_location_candidates", args),
    }),

    find_object_candidates: tool({
      description:
        "Observation-only lookup. Fuzzy-match visible object/item candidates only; hidden/offscreen objects are denied by omission.",
      inputSchema: bridgeCandidateQueryInputSchema,
      execute: (args) => executeBridgeLookupTool("find_object_candidates", args),
    }),

    find_actor_candidates: tool({
      description:
        "Observation-only lookup. Fuzzy-match clear visible actor candidates only; hidden/offscreen actor names are never returned.",
      inputSchema: findActorCandidatesInputSchema,
      execute: (args) => executeBridgeLookupTool("find_actor_candidates", args),
    }),

    find_poi_candidates: tool({
      description:
        "Observation-only lookup. Find visible/current-area POI candidates or a generic potential local POI hint when explicitly requested.",
      inputSchema: findPoiCandidatesInputSchema,
      execute: (args) => executeBridgeLookupTool("find_poi_candidates", args),
    }),

    inspect_known_fact: tool({
      description:
        "Observation-only lookup. Inspect only player-visible or player-known facts; private/offscreen facts deny without naming them.",
      inputSchema: inspectKnownFactInputSchema,
      execute: (args) => executeBridgeLookupTool("inspect_known_fact", args),
    }),

    check_route: tool({
      description:
        "Observation-only lookup. Check whether a destination ref is already here or a visible legal movement route; illegal/hidden routes deny without leaks.",
      inputSchema: checkRouteInputSchema,
      execute: (args) => executeBridgeLookupTool("check_route", args),
    }),

    move_actor: tool({
      description:
        "State-bearing bridge. Move only the current player/subject actor along a legal movement candidate backed by route evidence; returns destination, path, travel cost, and actor refs.",
      inputSchema: moveActorInputSchema,
      execute: (args) => executeRuntimeTool("move_actor", args),
    }),

    create_minor_poi: tool({
      description:
        "State-bearing bridge. Create only an ordinary local low-impact public POI in current scope: tea stall, street vendor, shrine desk, notice board, or courier desk. Rejects secret, remote, faction, rare, key, or plot-critical places.",
      inputSchema: createMinorPoiInputSchema,
      execute: (args) => executeRuntimeTool("create_minor_poi", args),
    }),

    create_scene_extra: tool({
      description:
        "State-bearing bridge. Create only a temporary visible service/witness/crowd/support extra in current_scene/current_location; not a key or persistent NPC.",
      inputSchema: createSceneExtraInputSchema,
      execute: (args) => executeRuntimeTool("create_scene_extra", args),
    }),

    start_search: tool({
      description:
        "State-bearing bridge. Record that the current actor starts searching; does not create a found target, proof, or discovery.",
      inputSchema: startSearchInputSchema,
      execute: (args) => executeRuntimeTool("start_search", args),
    }),

    record_player_intent: tool({
      description:
        "State-bearing bridge. Record player intent, stance, or claim as unconfirmed; does not make the hinted target true.",
      inputSchema: recordPlayerIntentInputSchema,
      execute: (args) => executeRuntimeTool("record_player_intent", args),
    }),

    record_dialogue_outcome: tool({
      description:
        "State-bearing semantic dialogue outcome. Use for an NPC/source answer, refusal, silence, gesture, warning, redirect, unavailable role, or no-current-answer result. Outcome semantics live in enum fields; quote/summary may be any language and are display/evidence only.",
      inputSchema: recordDialogueOutcomeInputSchema,
      execute: (args) => executeRuntimeTool("record_dialogue_outcome", args),
    }),

    record_world_fact: tool({
      description:
        "State-bearing semantic world fact. Use when the player compares, verifies, or records future-usable public/known facts without an NPC dialogue outcome. Semantics live in sourceKind/truthStatus/factKind/topicKind/claims; summary may be any language and is display/evidence only. claims[].subjectRef, subjectRefs, and sourceRefs must be exact legal refs; put ordinary labels like notice board or route-log mismatch in subjectText.",
      inputSchema: recordWorldFactInputSchema,
      execute: (args) => executeRuntimeTool("record_world_fact", args),
    }),

    add_tag: tool({
      description:
        "Add a tag to an entity (player, NPC, location, item, or faction). Tags represent traits, states, skills, relationships. For document/proof items, use this for durable states such as reviewed, officially-unsealed, docketed, stamped, receipt, or warning-rider.",
      inputSchema: addTagInputSchema,
      execute: (args) => executeRuntimeTool("add_tag", args),
    }),

    remove_tag: tool({
      description:
        "Remove a tag from an entity. Use when a state, trait, or condition no longer applies.",
      inputSchema: removeTagInputSchema,
      execute: (args) => executeRuntimeTool("remove_tag", args),
    }),

    set_relationship: tool({
      description:
        "Set or update a relationship between two entities. Upserts -- creating or updating the relationship.",
      inputSchema: setRelationshipInputSchema,
      execute: (args) => executeRuntimeTool("set_relationship", args),
    }),

    add_chronicle_entry: tool({
      description:
        "Record a significant event in the campaign chronicle. Use for major story beats, discoveries, or turning points.",
      inputSchema: addChronicleEntryInputSchema,
      execute: (args) => executeRuntimeTool("add_chronicle_entry", args),
    }),

    log_event: tool({
      description:
        "Log a scene beat. Use scene_local for attempted, refused, witnessed, conversational, sensory/non-durable, or bluff beats. Use durable only for future-relevant facts that should matter later; never use durable log_event itself to grant possession, access, item use, document state, route revelation, or completed movement.",
      inputSchema: logEventInputSchema,
      execute: (args) => executeRuntimeTool("log_event", args),
    }),

    advance_time: tool({
      description:
        "Advance the campaign clock when the player intentionally waits, travels, rests, shops, observes, or otherwise spends meaningful in-world time. The GM chooses minutes from the action and scene; backend only validates and commits the clock advance.",
      inputSchema: advanceTimeInputSchema,
      execute: (args) => executeRuntimeTool("advance_time", args),
    }),

    offer_quick_actions: tool({
      description:
        "Suggest 3-5 quick action options for the player to choose from. Keep the options varied, concrete, and grounded in the current scene, present NPCs, available items, and visible threats.",
      inputSchema: offerQuickActionsInputSchema,
      execute: async (args) => ({
        success: true as const,
        result: { actions: args.actions },
      }),
    }),

    spawn_npc: tool({
      description:
        "Spawn a temporary support NPC only when a concrete local actor is needed for play or future pressure. Use current_scene/current_location or a location id returned by a successful reveal_location observation; never use assistant prose to introduce a continuing actor, and never use this to pretend an unrevealed room exists.",
      inputSchema: spawnNpcInputSchema,
      execute: (args) => executeRuntimeTool("spawn_npc", args),
    }),

    promote_npc: tool({
      description:
        "Promote a visible temporary NPC upward to persistent or key when the scene makes them future-relevant.",
      inputSchema: promoteNpcInputSchema,
      execute: (args) => executeRuntimeTool("promote_npc", args),
    }),

    spawn_item: tool({
      description:
        "Spawn a tangible, persistent item that the player or visible actors can later inspect, use, own, carry, transfer, or owe action around. Spawn every future-usable receipt, docket, warning rider, stamp, permit, proof artifact, or document the player may later cite, with document/state tags. Do not leave future-relevant props or obligations only in assistant prose. Do not create casual props, set dressing, atmospheric details, or generic scenery.",
      inputSchema: spawnItemInputSchema,
      execute: (args) => executeRuntimeTool("spawn_item", args),
    }),

    reveal_location: tool({
      description:
        "Reveal a new local sublocation/ephemeral scene and connect it to an existing legal local anchor. Use connectedToName current_scene/current_location unless copying an exact legal ref; use before moving into, populating, or making future-relevant a newly discovered room, back area, booth, alley mouth, recessed door, narrow stair, or other specific route/place.",
      inputSchema: revealLocationInputSchema,
      execute: (args) => executeRuntimeTool("reveal_location", args),
    }),

    request_contested_outcome: tool({
      description:
        "Ask the backend rules for bounded actor-vs-actor contest/combat authority before narrating or committing a hit, escape, capture, restraint, pursuit, or defense result. This returns allowed/prohibited consequences and does not itself change HP, position, inventory, tags, or relationships.",
      inputSchema: requestContestedOutcomeInputSchema,
      execute: (args) => executeRuntimeTool("request_contested_outcome", args),
    }),

    set_condition: tool({
      description:
        "Modify a player character's HP when violence, injury, healing, or combat aftermath changes durable player condition. Use delta for relative damage or healing, or value for an absolute HP set. Only works on player characters, not NPCs.",
      inputSchema: setConditionInputSchema,
      execute: (args) => executeRuntimeTool("set_condition", args, outcomeTier),
    }),

    move_to: tool({
      description:
        "Move the player to a connected location by targetLocationName when travel to an established destination succeeds. Do not describe completed route traversal in assistant prose unless a successful move_to observation or existing state already supports it.",
      inputSchema: moveToInputSchema,
      execute: (args) => executeRuntimeTool("move_to", args),
    }),

    transfer_item: tool({
      description:
        "Transfer an existing item to a different character or location. Character targets can optionally equip the item; location targets always drop it carried and unequipped.",
      inputSchema: transferItemInputSchema,
      execute: (args) => executeRuntimeTool("transfer_item", args),
    }),
  };
}
