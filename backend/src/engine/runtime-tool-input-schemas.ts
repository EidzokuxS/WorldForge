/**
 * Runtime Storyteller tool input schemas.
 *
 * This file is deliberately side-effect free so both the AI SDK bridge and
 * direct programmatic executor calls validate against the same contract.
 */

import { z } from "zod";
import {
  MINOR_POI_TYPES,
  SCENE_EXTRA_ROLES,
} from "./bridge-state-tools.js";
import {
  DIALOGUE_STRUCTURAL_EFFECT_TOOL_NAMES,
  dialogueStateEffectStateKeyDescription,
  isDialogueStateReceiptKeyForTool,
} from "./dialogue-state-receipt-contract.js";
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
const transferItemSplitFields = {
  transferredItemName: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional split-off item name when only part of a bundled item/stack is transferred, e.g. 'Two Ration Slips'. Provide with remainingItemName."),
  remainingItemName: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional name for the portion left with the current holder after a partial transfer, e.g. 'One Ration Slip'. Provide with transferredItemName."),
};
const transferItemInputSchema = z.object({
  itemName: z.string().describe("Name of the item to transfer; for bundled/stacked items, this is the source bundle to split"),
  targetName: z.string().describe("Name of the character/actor/NPC/player or location to receive the item"),
  targetType: z
    .enum(["character", "npc", "player", "actor", "location"])
    .describe("Use character for any actor/NPC/player recipient; npc/player/actor are accepted aliases. Use location only for a place."),
  equipState: inventoryEquipStateEnum
    .optional()
    .describe("Optional carry/equip intent for character/actor/NPC/player targets. Omit to keep the item carried."),
  equippedSlot: z
    .string()
    .optional()
    .describe("Optional explicit slot when equipState is equipped"),
  ...transferItemSplitFields,
}).superRefine((data, ctx) => {
  const hasTransferredName = Boolean(data.transferredItemName?.trim());
  const hasRemainingName = Boolean(data.remainingItemName?.trim());
  if (hasTransferredName !== hasRemainingName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasTransferredName ? ["remainingItemName"] : ["transferredItemName"],
      message: "Partial transfer requires both transferredItemName and remainingItemName",
    });
  }

  if (data.targetType === "location" && data.equipState) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["equipState"],
      message: "equipState is only valid when transferring to a character-like target",
    });
  }
});

const addTagInputSchema = z.object({
  entityName: z.string().describe("Name of the entity to tag"),
  entityType: entityTypeEnum,
  tag: z.string().describe("The tag to add (lowercase, hyphenated); tags carry concrete observable states such as routing-stamped, temporarily-cleared, suspicious, trusted, wounded, marked, or blocked"),
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
  sourceRefs: z
    .array(
      z.string().trim().min(1).max(120)
        .describe("Visible/current ref or player-known fact ref grounding this quick-action offer")
    )
    .max(12)
    .optional(),
});

const spawnNpcInputSchema = z.object({
  name: z.string().describe("NPC name"),
  tags: z.array(z.string()).describe("Tags describing the NPC (role, trait, local function, state)"),
  locationRef: z
    .enum(["current_scene", "current_location"])
    .describe("Local spawn target. Use current_scene/current_location; do not copy backend ids."),
});

const promoteNpcInputSchema = z.object({
  npcRef: z.string().describe("Visible NPC name/ref to promote; do not copy backend actor ids from diagnostics"),
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
  actorName: z.string().describe("Visible actor label/ref attempting the contest"),
  targetName: z.string().describe("Visible opposing actor label/ref"),
  mode: contestedOutcomeModeEnum.describe("Kind of contested pressure being requested"),
  intent: z.string().min(1).max(400).describe("What the actor is trying to do now"),
  stakes: z.string().min(1).max(400).describe("What would change if this contest lands"),
  evidenceRefs: z
    .array(z.string().min(1).max(200))
    .max(8)
    .default([])
    .describe("Short ActorFrame fact refs such as f1/f2, or exact visible refs supporting the contest"),
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
  roleText: z.string().trim().min(1).max(120).optional(),
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
  summary: z.string().trim().min(1).max(500),
});
const structuralDialogueStateToolEnum = z.enum(DIALOGUE_STRUCTURAL_EFFECT_TOOL_NAMES);
const dialogueStateEffectStatusEnum = z.enum([
  "applied_now",
  "not_applied",
  "asserted_only",
]);
const dialogueStateEffectInputSchema = z.object({
  effectId: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe("Stable short id for this effect within the dialogue outcome."),
  status: dialogueStateEffectStatusEnum.describe("applied_now means this turn actually changed backend world state; asserted_only/not_applied are communicative only."),
  stateReceipt: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .describe("For applied_now in the GM tool loop, cite the stateReceipt alias returned by the prior structural tool result, such as state_receipt_1_1. The backend resolves target/key/value from that receipt."),
  structuralTool: structuralDialogueStateToolEnum
    .optional()
    .describe("Resolved by the backend from stateReceipt for applied_now; legacy/internal callers may provide it to name the successful structural tool."),
  targetRef: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .optional()
    .describe("Resolved by the backend from stateReceipt for applied_now; legacy/internal callers may provide the same exact target/entity ref or label used by the structural tool input/result."),
  stateKey: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .describe(dialogueStateEffectStateKeyDescription()),
  stateValue: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .optional()
    .describe("Resolved by the backend from stateReceipt for applied_now; legacy/internal callers may provide the state value backed by the structural tool result."),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(360)
    .describe("Human-readable description. Validators do not parse this for semantics."),
}).superRefine((data, ctx) => {
  if (data.status === "applied_now") {
    const hasStateReceipt = Boolean(data.stateReceipt?.trim());
    if (!hasStateReceipt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stateReceipt"],
        message: "applied_now stateEffects require a backend-issued stateReceipt",
      });
    }
    if (
      data.structuralTool
      && data.stateKey?.trim()
      && !isDialogueStateReceiptKeyForTool(data.structuralTool, data.stateKey)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stateKey"],
        message: `${data.structuralTool} cannot back dialogue stateKey ${data.stateKey}`,
      });
    }
  } else if (data.structuralTool) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["structuralTool"],
      message: "structuralTool is only valid for applied_now stateEffects",
    });
  }
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
    .describe("Direct speech in any language. Required for durable answered procedural outcomes so the receipt owns the concrete player-visible answer surface."),
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
    .describe("Structured claims carried by procedural/reusable dialogue outcomes. Claims are communication, not applied world mutation."),
  stateEffects: z
    .array(dialogueStateEffectInputSchema)
    .max(6)
    .default([])
    .describe("Typed state effects linked to this dialogue. Empty means communicative only. Every applied_now effect must be backed by a prior successful structural tool result."),
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
    && data.outcomeKind === "answered"
    && !data.quote?.trim()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quote"],
      message: "durable procedural answered outcomes require quote; use no_current_answer, refused, unavailable, or redirected if no concrete answer can be spoken",
    });
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

  if (data.stateEffects.some((effect) => effect.status === "applied_now") && data.durability !== "durable") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["durability"],
      message: "record_dialogue_outcome with applied_now stateEffects must be durable",
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

