/**
 * Structured prompt assembly from all game data sources.
 *
 * Gathers content from: system rules, world premise, scene (location + items),
 * player state, NPC states, lore context (via vector search), episodic memory,
 * recent conversation (with smart compression), and optional action result.
 * Enriches NPC states with multi-hop relationship graph data.
 * Enforces token budgets with priority-based truncation.
 */

import { eq, desc } from "drizzle-orm";
import type { CharacterRecord, ChatMessage, PowerStats } from "@worldforge/shared";
import { formatTierRank } from "@worldforge/shared";
import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../ai/provider-registry.js";
import { readCampaignConfig, getChatHistory } from "../campaign/index.js";
import { getDb } from "../db/index.js";
import { players, npcs, locations, items, relationships, chronicle, factions } from "../db/schema.js";
import { searchLoreCards } from "../vectors/lore-cards.js";
import { searchEpisodicEvents } from "../vectors/episodic-events.js";
import { embedTexts } from "../vectors/embeddings.js";
import type { ResolveResult, ResolvedRole } from "../ai/index.js";
import {
  estimateTokens,
  allocateBudgets,
  truncateToFit,
  type PromptSection,
} from "./token-budget.js";
import { getRelationshipGraph } from "./graph-queries.js";
import { createLogger } from "../lib/index.js";
// Direct import (NOT via ../lib/index.js barrel) — Plan 58-01 cycle
// prevention. prompt-dump must never be re-exported from lib/index.ts.
import { writePromptSideCarIfEnabled } from "../lib/prompt-dump.js";
import {
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
} from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import { buildStorytellerContract } from "./storyteller-contract.js";
import {
  formatSessionLanguageContract,
  inferSessionResponseLanguage,
} from "./session-language.js";
import type { StorytellerPass, StorytellerSceneMode } from "./storyteller-presets.js";
import { deriveStartConditionEffects } from "./start-condition-runtime.js";
import { listRecentLocationEvents } from "./location-events.js";
import { loadAuthoritativeInventoryView } from "../inventory/authority.js";
import type { SceneAssembly } from "./scene-assembly.js";
import {
  formatNarrativeOutcomeBoundsBlock,
  type NarrativeOutcomeBounds,
} from "./combat-envelope.js";
import {
  formatHiddenWorldBrainDirectionBlock,
  formatPlayerPerceivableWorldBrainDirectionBlock,
  formatWorldBrainNarrationGuardrails,
  type WorldBrainSceneDirection,
} from "./world-brain.js";
import { buildJudgeAdjudicationContract } from "./hidden-adjudication.js";
import {
  AWARENESS_BAND_CONTRACT,
  getObserverAwareness,
  inferPresenceVisibility,
  resolveScenePresence,
  resolveStoredSceneScopeId,
  type PresenceSnapshot,
} from "./scene-presence.js";
import {
  assertNarratorPacketPromptSafe,
  type NarratorPacket,
} from "./narrator-packet.js";
import {
  buildPlayerFacingPacketFromNarratorPacket,
  formatPlayerFacingPacketForPrompt,
} from "./player-facing-packet.js";
import { buildContextCompressionPromptContract } from "./prompt-contracts.js";

const log = createLogger("prompt-assembler");

export interface AssembledPrompt {
  sections: PromptSection[];
  totalTokens: number;
  /** Percentage of context window used (0-100). */
  budgetUsed: number;
  /** Final prompt string with [SECTION NAME] headers. */
  formatted: string;
}

export interface AssembleOptions {
  campaignId: string;
  /** Model's context window in tokens. */
  contextWindow: number;
  storytellerPass?: StorytellerPass;
  sceneAssembly?: SceneAssembly;
  /** Whether to include chat history in the assembled system prompt. */
  includeRecentConversation?: boolean;
  /** Oracle result (optional -- not available for Oracle call itself). */
  actionResult?: {
    chance: number;
    roll: number;
    outcome: string;
    reasoning: string;
  };
  /** For lore vector search. */
  embedderResult?: ResolveResult;
  /** Current action text, used as lore search query. */
  playerAction?: string;
  /** Judge role for LLM-based importance detection during compression. */
  judgeRole?: ResolvedRole;
  /** Raw world-brain direction for hidden-pass consumption before scene assembly exists. */
  worldBrainDirection?: WorldBrainSceneDirection;
  /** Optional override for the top-level SYSTEM RULES section content. */
  systemRulesOverride?: string;
  /** Optional override for prompt.assembled pass label. */
  passLogLabel?: string;
  /** Optional override for prompt sidecar label. */
  promptDumpLabel?: string;
}

export interface FinalNarrationPrompt {
  system: string;
  prompt: string;
  assembledBase: AssembledPrompt;
}

export interface JudgeAdjudicationPrompt {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  assembledBase: AssembledPrompt;
}

function buildHiddenWorldBrainDirectionSection(
  storytellerPass: StorytellerPass,
  direction?: WorldBrainSceneDirection | null,
): PromptSection | null {
  if (!direction) {
    return null;
  }
  if (storytellerPass === "final-visible") {
    return null;
  }
  const content = formatHiddenWorldBrainDirectionBlock(direction);

  return {
    name: "WORLD-BRAIN DIRECTION",
    priority: 3,
    content,
    estimatedTokens: estimateTokens(content),
    canTruncate: false,
  };
}

function buildVisibleWorldBrainSections(
  direction?: WorldBrainSceneDirection | null,
): PromptSection[] {
  if (!direction) {
    return [];
  }

  const sceneDirectionContent = formatPlayerPerceivableWorldBrainDirectionBlock(direction)
    .replace(/^\[SCENE DIRECTION\]\n/, "");
  const guardrailContent = formatWorldBrainNarrationGuardrails(direction)
    .replace(/^\[NARRATION GUARDRAILS\]\n/, "");

  return [
    {
      name: "SCENE DIRECTION",
      priority: 3,
      content: sceneDirectionContent,
      estimatedTokens: estimateTokens(sceneDirectionContent),
      canTruncate: false,
    },
    {
      name: "NARRATION GUARDRAILS",
      priority: 3,
      content: guardrailContent,
      estimatedTokens: estimateTokens(guardrailContent),
      canTruncate: false,
    },
  ];
}

// -- LLM-based importance detection for smart compression --------------------

const importantIndicesSchema = z.object({
  importantIndices: z
    .array(z.number().int())
    .max(12)
    .describe("Indices (0-based) of messages that are important enough to always keep in context"),
});

/**
 * Batch-detect important messages via a single LLM call.
 * Returns a Set of indices (into the provided messages array) that are important.
 * Falls back to empty set on LLM failure.
 */
async function detectImportantMessages(
  messages: ReadonlyArray<{ role: string; content: string }>,
  judgeRole: ResolvedRole,
): Promise<Set<number>> {
  if (messages.length === 0) return new Set();

  try {
    const numbered = messages.map(
      (m, i) => `[${i}] ${m.role === "user" ? "Player" : "GM"}: ${m.content}`,
    );

    const { object } = await generateObject({
      model: createModel(judgeRole.provider),
      schema: importantIndicesSchema,
      prompt: [
        "You are reviewing RPG game messages to decide which are important enough to always keep in context during compression.",
        "",
        buildContextCompressionPromptContract(),
        "",
        "Important messages include: combat encounters, death, major discoveries, betrayals, captures, escapes, plot twists, relationship changes, promises, commitments, open questions, named introductions, changed trust, acquired or lost access, acquisition of powerful items, critical world events.",
        "Routine actions are usually unimportant only when they leave no relationship beat, promise, clue, question, changed access, emotional commitment, NPC boundary, or future hook.",
        "Messages with [IMPORTANT] prefix are always important.",
        "",
        "Return the indices of important messages.",
        "",
        "Messages:",
        numbered.join("\n"),
      ].join("\n"),
      temperature: 0.1,
    });

    return new Set(object.importantIndices.filter((i) => i >= 0 && i < messages.length));
  } catch (error) {
    log.warn("LLM importance detection failed, keeping no middle messages", error);
    return new Set();
  }
}

// -- System rules template --------------------------------------------------

const OUTPUT_RULES = `You are the Game Master of a text RPG. You narrate the world and its inhabitants.

CRITICAL OUTPUT RULES (MANDATORY — VIOLATION MEANS FAILURE):
1. Your output is ONLY narrative prose. NOTHING ELSE.
2. FORBIDDEN in your output: any text in [BRACKETS], any section header, any metadata, any statistics, any chance/roll numbers, any system information, any HP values (like "HP is now 3/5").
3. FORBIDDEN: echoing, repeating, or referencing [ACTION RESULT], [NPC STATES], [NARRATION DIRECTIVE], [RECENT CONVERSATION], [SCENE], [SYSTEM RULES], [WORLD PREMISE], [PLAYER STATE], [WORLD STATE], [LORE CONTEXT], [EPISODIC MEMORY], [RELATIONSHIPS], or ANY bracketed text.
4. FORBIDDEN: fabricating dice rolls, chances, percentages, or outcome values. The outcome is already determined — narrate it as prose.
5. If you are about to write a bracket "[" followed by a section name — STOP. That is system data, not narrative.`;

const RUNTIME_SCENE_RULES = `Runtime narration rules:
- Do not hallucinate items, NPCs, or locations that have not been established.
- [ENCOUNTER SCOPE] is authoritative for who is in the immediate scene and how much of them the player can perceive.
- If the [NPC STATES] section lists NPCs, those NPCs are the fully present actors for this encounter scope. Include them in your narration. Do not claim they are absent.
- When Key NPCs are listed in [NPC STATES], you MUST acknowledge their presence and have them react to the player's action. Key NPCs are autonomous characters with goals and beliefs — they should speak, react, or take action based on their persona and the situation. Do NOT ignore NPCs listed in [NPC STATES].
- If [ENCOUNTER SCOPE] reports hint-band awareness, treat it as indirect presence only. Do not reveal identity in visible narration unless runtime consequences justify that reveal.
- If a Key NPC's goals or beliefs conflict with the player's action, narrate the NPC's reaction (objection, interference, support). NPCs are not passive scenery.
- After moving to a new location, describe the new location using its tags and description from [SCENE]. Mention any NPCs or items present at the new location.
- When a character reaches HP 0, narrate a contextual outcome based on the situation:
  - Non-lethal context (pit fight, bar brawl, sparring, training): knockout/submission/unconsciousness. Do NOT describe lethal wounds in non-lethal contexts.
  - Lethal context (death match, assassination, monster attack): death is possible. Consider the attacker's intent, the setting, and dramatic alternatives (capture, last-second rescue, enemy mercy).
  - NEVER automatically kill at HP 0 -- always consider context first.
- NEVER reference items the player does not have in their inventory. Check [PLAYER STATE] Inventory before mentioning any item.
- To give the player a new item, use the spawn_item tool first. Do NOT spawn an item that already exists in the player's inventory.
- When the player trades or gives away an item, use the transfer_item tool. Do NOT just narrate the trade without using tools.
- Character wealth tiers are Destitute < Poor < Comfortable < Wealthy < Obscenely Rich. Consider wealth tier when evaluating purchase, bribe, or trade actions.
- Skill tiers are Novice < Skilled < Master. Higher skill tier gives better odds on relevant actions.
- Use the terminology, concepts, and naming conventions from the world premise and lore context. If the world has specific terms for abilities, locations, or social structures, use those terms consistently instead of generic fantasy equivalents.`;

const STORYTELLER_SCENE_TAG_MAP: Record<StorytellerSceneMode, string[]> = {
  combat: ["combat", "battle", "hostile", "danger", "hazard"],
  dialogue: ["dialogue", "social", "conversation", "talk", "negotiat", "council"],
  horror: ["horror", "terror", "eerie", "haunted", "nightmare", "uncanny"],
  quiet: ["quiet", "stealth", "low-activity", "observation", "ambient", "sneak"],
  default: [],
};

const STORYTELLER_OUTCOME_COMBAT_SIGNALS = [
  "critical",
  "crit",
  "strong_hit",
  "weak_hit",
  "hit",
  "strike",
  "damage",
  "attac",
  "blow",
  "stab",
  "slash",
  "smash",
  "knee",
  "knock",
];

const STORYTELLER_OPENING_HORROR_PRESSURE = [
  "under watch",
  "clock running out",
  "panic",
  "pursued",
  "threat",
  "hostile",
  "ambush",
];

const STORYTELLER_OPENING_QUIET_PRESSURE = ["calm", "soft", "stilled", "silent", "distant"];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hasAnyTokenMatch(texts: string[], tokens: string[]): boolean {
  return texts.some((text) => {
    const normalized = normalizeText(text);
    return tokens.some((token) => normalized.includes(normalizeText(token)));
  });
}

function classifyStorytellerSceneMode(opts: {
  sceneAssembly?: SceneAssembly;
  actionResult?: AssembleOptions["actionResult"];
  playerAction?: string;
}): StorytellerSceneMode {
  const outcome = opts.actionResult?.outcome ?? "";
  const playerAction = opts.playerAction ?? "";
  const tags = opts.sceneAssembly?.currentScene?.tags?.map(normalizeText) ?? [];
  const sceneEffects = opts.sceneAssembly?.sceneEffects ?? [];
  const recentContext = opts.sceneAssembly?.recentContext?.map((entry) => entry.summary) ?? [];
  const hintSignals = opts.sceneAssembly?.awareness.hintSignals ?? [];
  const openingPressure = opts.sceneAssembly?.openingState?.entryPressure ?? [];
  const openingContext = [
    opts.sceneAssembly?.openingState?.immediateSituation ?? "",
    ...(opts.sceneAssembly?.openingState?.sceneContextLines ?? []),
    ...(opts.sceneAssembly?.openingState?.promptLines ?? []),
  ];

  const factText = [
    outcome,
    playerAction,
    ...sceneEffects.map((effect) => `${effect.summary} ${effect.causalDetail ?? ""}`),
    ...recentContext,
    ...hintSignals,
    ...openingContext,
    ...openingPressure,
  ];

  // Fixed-priority, bounded watermark style: explicit combat pass first from outcome/effects.
  if (hasAnyTokenMatch([outcome], STORYTELLER_OUTCOME_COMBAT_SIGNALS)) {
    return "combat";
  }

  const hasPhysicalEffect = sceneEffects.some((effect) =>
    effect.kind === "state_change" &&
    hasAnyTokenMatch([effect.summary, effect.causalDetail ?? ""], ["damage", "hp", "hit", "strike", "attack", "blow"]),
  );
  if (hasPhysicalEffect) {
    return "combat";
  }

  // Dialogue and combat pressure from direct player/action intent and visible scene markers.
  if (hasAnyTokenMatch([playerAction], ["say", "talk", "ask", "reply", "negotiat", "dialogu"])) {
    return "dialogue";
  }

  if (hasAnyTokenMatch(tags, STORYTELLER_SCENE_TAG_MAP.dialogue)) {
    return "dialogue";
  }

  if (hasAnyTokenMatch([...sceneEffects.map((effect) => effect.summary), ...recentContext], STORYTELLER_SCENE_TAG_MAP.horror)) {
    return "horror";
  }

  if (hasAnyTokenMatch(openingPressure, STORYTELLER_OPENING_HORROR_PRESSURE)) {
    return "horror";
  }

  if (
    hasAnyTokenMatch([...tags, ...openingPressure, ...factText], STORYTELLER_SCENE_TAG_MAP.quiet) ||
    hasAnyTokenMatch([...openingPressure, ...factText], STORYTELLER_OPENING_QUIET_PRESSURE)
  ) {
    return "quiet";
  }

  return "default";
}

function buildSystemRules(
  pass: StorytellerPass,
  sceneMode: StorytellerSceneMode = "default",
): string {
  return [
    OUTPUT_RULES,
    buildStorytellerContract({ pass, sceneMode, includeGlmOverlay: true }),
    RUNTIME_SCENE_RULES,
  ].join("\n\n");
}


// -- Smart conversation compression -----------------------------------------

/**
 * Smart conversation compression: keeps first 2 messages (world setup),
 * last N messages (recent context, ~60% of budget), and any important
 * messages from the middle (detected via LLM batch call). Drops mundane
 * middle turns and inserts an omission marker.
 *
 * When no judgeRole is provided, falls back to keeping no middle messages
 * (only first + last).
 */
export async function compressConversation(
  history: ChatMessage[],
  budgetTokens: number,
  judgeRole?: ResolvedRole,
): Promise<PromptSection | null> {
  if (history.length === 0) return null;

  const FIRST_KEEP = 2; // Always keep first 2 messages (world setup / character intro)
  const RECENT_RATIO = 0.6; // 60% of budget for recent messages

  // Format a single message
  const format = (msg: ChatMessage) =>
    `${msg.role === "user" ? "Player" : "GM"}: ${msg.content}`;

  // If everything fits, return all
  const allFormatted = history.map(format);
  const allTokens = allFormatted.reduce(
    (sum, line) => sum + estimateTokens(line),
    0,
  );

  if (allTokens <= budgetTokens) {
    const content = allFormatted.join("\n");
    return {
      name: "RECENT CONVERSATION",
      priority: 7,
      content,
      estimatedTokens: allTokens,
      canTruncate: true,
    };
  }

  // --- Need to compress ---

  // 1. Always keep first N messages
  const firstCount = Math.min(FIRST_KEEP, history.length);
  const firstMessages = history.slice(0, firstCount);
  const firstFormatted = firstMessages.map(format);
  let usedTokens = firstFormatted.reduce(
    (sum, line) => sum + estimateTokens(line),
    0,
  );

  // 2. Take recent messages from the end (up to 60% of budget)
  const recentBudget = Math.floor(budgetTokens * RECENT_RATIO);
  const recentFormatted: string[] = [];
  let recentStartIdx = history.length; // exclusive start

  for (let i = history.length - 1; i >= firstCount; i--) {
    const line = format(history[i]!);
    const lineTokens = estimateTokens(line);
    if (usedTokens + lineTokens > budgetTokens) break;

    const recentUsed = recentFormatted.reduce(
      (sum, l) => sum + estimateTokens(l),
      0,
    );
    if (recentUsed + lineTokens > recentBudget) break;

    recentFormatted.unshift(line);
    recentStartIdx = i;
    usedTokens += lineTokens;
  }

  // 3. From middle (firstCount .. recentStartIdx), keep important messages
  const middleMessages = history.slice(firstCount, recentStartIdx);
  const importantSet = judgeRole
    ? await detectImportantMessages(middleMessages, judgeRole)
    : new Set<number>();

  const importantMiddle: Array<{ idx: number; line: string }> = [];
  for (let i = 0; i < middleMessages.length; i++) {
    if (importantSet.has(i)) {
      const line = format(middleMessages[i]!);
      const lineTokens = estimateTokens(line);
      if (usedTokens + lineTokens <= budgetTokens) {
        importantMiddle.push({ idx: firstCount + i, line });
        usedTokens += lineTokens;
      }
    }
  }

  // 4. Count omitted messages
  const keptMiddleCount = importantMiddle.length;
  const totalMiddle = recentStartIdx - firstCount;
  const omittedCount = totalMiddle - keptMiddleCount;

  // 5. Assemble final output
  const outputLines: string[] = [...firstFormatted];

  if (omittedCount > 0) {
    // Insert important middle messages in order, with omission marker
    let lastInsertedIdx = firstCount - 1;

    for (const imp of importantMiddle) {
      const gapBefore = imp.idx - lastInsertedIdx - 1;
      if (gapBefore > 0) {
        outputLines.push(`[... ${gapBefore} earlier turns omitted ...]`);
      }
      outputLines.push(imp.line);
      lastInsertedIdx = imp.idx;
    }

    // Gap between last important (or first block) and recent block
    const gapToRecent = recentStartIdx - lastInsertedIdx - 1;
    if (gapToRecent > 0) {
      outputLines.push(`[... ${gapToRecent} earlier turns omitted ...]`);
    }
  }

  outputLines.push(...recentFormatted);

  const content = outputLines.join("\n");

  return {
    name: "RECENT CONVERSATION",
    priority: 7,
    content,
    estimatedTokens: estimateTokens(content),
    canTruncate: true,
  };
}

// -- Power stats helper -------------------------------------------------------

/**
 * Build a compact power stats line for prompt injection.
 * Returns null if no powerStats present — callers skip the line entirely.
 */
export function buildPowerStatsLine(record: { powerStats?: PowerStats }): string | null {
  const ps = record.powerStats;
  if (!ps) return null;
  const axes = [
    `AP=${formatTierRank(ps.attackPotency)}`,
    `Speed=${formatTierRank(ps.speed)}`,
    `Dur=${formatTierRank(ps.durability)}`,
    `Int=${formatTierRank(ps.intelligence)}`,
  ].join(" | ");
  const parts = [`Power: ${axes}`];
  if (ps.hax.length > 0) {
    parts.push(`Hax: ${ps.hax.map(h => {
      const bypass = h.bypassTier ? `, bypasses ${h.bypassTier}` : "";
      const limits = h.limitations.length > 0 ? `, limits: ${h.limitations.join("; ")}` : "";
      return `${h.name} (${h.type}${bypass}${limits})`;
    }).join("; ")}`);
  }
  if (ps.vulnerabilities.length > 0) {
    parts.push(`Vulnerabilities: ${ps.vulnerabilities.map(v => `${v.description} (${v.severity})`).join("; ")}`);
  }
  return parts.join("\n");
}

// -- Section builders --------------------------------------------------------

function buildPlayerStateSection(
  campaignId: string,
  currentTick: number,
): PromptSection | null {
  const db = getDb();
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();

  if (!player) return null;

  const playerRecord = hydrateStoredPlayerRecord(player);
  const openingState = deriveStartConditionEffects(playerRecord, {
    currentTick,
    currentLocationId: player.currentLocationId,
  });
  const effectivePlayerRecord = {
    ...playerRecord,
    state: {
      ...playerRecord.state,
      statusFlags: openingState.activeStatusFlags,
    },
  };
  const authoritativeInventory = loadAuthoritativeInventoryView(campaignId, player.id);
  const tags = deriveRuntimeCharacterTags(effectivePlayerRecord);
  const carriedItems = authoritativeInventory.carried.map((item) => item.name);
  const equipped = authoritativeInventory.compatibility.equippedItemRefs;
  const signatureItems = authoritativeInventory.compatibility.signatureItems;
  const wealthTag = effectivePlayerRecord.capabilities.wealthTier;
  const startConditions = effectivePlayerRecord.startConditions;
  const inventoryLine = carriedItems.length > 0
    ? `Inventory: ${carriedItems.join(", ")}`
    : "Inventory: (empty)";
  const identityLines = buildRuntimeIdentityLines(effectivePlayerRecord);

  const lines = [
    `Name: ${playerRecord.identity.displayName}`,
    playerRecord.profile.species ? `Race: ${playerRecord.profile.species}` : null,
    playerRecord.profile.gender ? `Gender: ${playerRecord.profile.gender}` : null,
    playerRecord.profile.ageText ? `Age: ${playerRecord.profile.ageText}` : null,
    playerRecord.profile.appearance ? `Appearance: ${playerRecord.profile.appearance}` : null,
    `HP: ${playerRecord.state.hp}/5`,
    wealthTag ? `Wealth: ${wealthTag}` : null,
    tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
    buildPowerStatsLine(playerRecord),
    startConditions.startLocationId
      ? `Start: ${startConditions.arrivalMode ?? "unknown arrival"} at ${playerRecord.socialContext.currentLocationName ?? "unknown location"}`
      : null,
    startConditions.immediateSituation
      ? `Opening Situation: ${startConditions.immediateSituation}`
      : null,
    startConditions.entryPressure && startConditions.entryPressure.length > 0
      ? `Opening Pressure: ${startConditions.entryPressure.join(", ")}`
      : null,
    startConditions.startingVisibility
      ? `Visibility: ${startConditions.startingVisibility}`
      : null,
    ...identityLines,
    ...openingState.promptLines,
    equipped.length > 0 ? `Equipped: ${equipped.join(", ")}` : null,
    signatureItems.length > 0 ? `Signature Items: ${signatureItems.join(", ")}` : null,
    inventoryLine,
  ].filter(Boolean);

  const content = lines.join("\n");

  return {
    name: "PLAYER STATE",
    priority: 3,
    content,
    estimatedTokens: estimateTokens(content),
    canTruncate: false,
  };
}

function buildSceneSection(
  campaignId: string,
  locationId: string | null,
  currentTick: number,
  encounter?: EncounterPromptContext,
): PromptSection | null {
  if (!locationId) return null;

  const db = getDb();
  const location = db
    .select()
    .from(locations)
    .where(eq(locations.id, locationId))
    .get();

  if (!location) return null;

  const locationTags = safeParseTags(location.tags);
  const locationItems = db
    .select()
    .from(items)
    .where(eq(items.locationId, locationId))
    .all();

  const npcRows =
    getClearPresentNpcRows(encounter, locationId)
    ?? db
      .select({ id: npcs.id, name: npcs.name })
      .from(npcs)
      .where(eq(npcs.currentLocationId, locationId))
      .all();

  // Query items owned by NPCs at this location
  const npcEquipmentLines: string[] = [];
  for (const npc of npcRows) {
    const npcInventory = loadAuthoritativeInventoryView(campaignId, npc.id);
    if (npcInventory.items.length > 0) {
      npcEquipmentLines.push(
        `  ${npc.name}: ${npcInventory.items.map((item) => item.name).join(", ")}`,
      );
    }
  }

  // Parse connected locations and resolve their names
  let connectedNames: string[] = [];
  try {
    const connectedIds = JSON.parse(location.connectedTo) as string[];
    if (connectedIds.length > 0) {
      const allCampaignLocations = db
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(eq(locations.campaignId, campaignId))
        .all();
      connectedNames = connectedIds
        .map((cid) => allCampaignLocations.find((l) => l.id === cid)?.name)
        .filter((n): n is string => Boolean(n));
    }
  } catch {
    // Invalid connectedTo JSON -- skip
  }

  const recentHappenings = listRecentLocationEvents({
    campaignId,
    locationRef: locationId,
    limit: 5,
  }).filter((event) => event.tick >= currentTick - 50);
  const recentHappeningsLines =
    recentHappenings.length > 0
      ? [
          "Recent happenings here:",
          ...recentHappenings.map((event) => `- [Tick ${event.tick}] ${event.summary}`),
        ]
      : ["Recent happenings here: none in the last 50 ticks."];

  const lines = [
    `Location: ${location.name}`,
    location.description,
    locationTags.length > 0 ? `Tags: ${locationTags.join(", ")}` : null,
    locationItems.length > 0
      ? `Items here: ${locationItems.map((i) => i.name).join(", ")}`
      : null,
    npcEquipmentLines.length > 0
      ? `NPC Equipment:\n${npcEquipmentLines.join("\n")}`
      : null,
    connectedNames.length > 0
      ? `Connected paths: ${connectedNames.join(", ")}`
      : null,
    ...recentHappeningsLines,
  ].filter(Boolean);

  const content = lines.join("\n");

  return {
    name: "SCENE",
    priority: 2,
    content,
    estimatedTokens: estimateTokens(content),
    canTruncate: true,
  };
}

interface EncounterPromptContext {
  broadLocationId: string | null;
  sceneId: string | null;
  sceneName: string | null;
  playerId: string | null;
  snapshot: PresenceSnapshot | null;
  npcRows: Array<typeof npcs.$inferSelect>;
  hintSignals: string[];
}

type EncounterLocationRow = {
  name: string;
  kind: string | null;
  parentLocationId: string | null;
};

function getClearPresentNpcRows(
  encounter: EncounterPromptContext | undefined,
  locationId: string,
): Array<{ id: string; name: string }> | null {
  if (!encounter?.snapshot || !encounter.playerId || encounter.sceneId !== locationId) {
    return null;
  }

  const presentActorIds = new Set(encounter.snapshot.presentActorIds);

  return encounter.npcRows
    .filter((npc) => presentActorIds.has(npc.id))
    .filter(
      (npc) =>
        getObserverAwareness(encounter.snapshot!, encounter.playerId!, npc.id) === "clear",
    )
    .map((npc) => ({ id: npc.id, name: npc.name }));
}

function buildEncounterPromptContext(
  campaignId: string,
  sceneAssembly?: SceneAssembly,
): EncounterPromptContext {
  const db = getDb();
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();
  const storedLocationId = player?.currentLocationId ?? null;
  const storedLocationRow = storedLocationId
    ? db
        .select({
          name: locations.name,
          kind: locations.kind,
          parentLocationId: locations.parentLocationId,
        })
        .from(locations)
        .where(eq(locations.id, storedLocationId))
        .get() as EncounterLocationRow | undefined
    : null;
  const sceneId =
    sceneAssembly?.currentScene?.id
    ?? resolveStoredSceneScopeId(
      storedLocationId,
      player?.currentSceneLocationId ?? null,
    );
  const sceneRow = sceneId
    ? db
        .select({
          name: locations.name,
          kind: locations.kind,
          parentLocationId: locations.parentLocationId,
        })
        .from(locations)
        .where(eq(locations.id, sceneId))
        .get() as EncounterLocationRow | undefined
    : null;
  const broadLocationId =
    sceneRow?.parentLocationId
    ?? storedLocationRow?.parentLocationId
    ?? storedLocationId;
  let presenceSceneId = player?.currentSceneLocationId ?? sceneId ?? null;
  if (presenceSceneId && presenceSceneId === broadLocationId) {
    const presenceSceneRow =
      sceneRow && sceneId === presenceSceneId
        ? sceneRow
        : db
            .select({
              name: locations.name,
              kind: locations.kind,
              parentLocationId: locations.parentLocationId,
            })
            .from(locations)
            .where(eq(locations.id, presenceSceneId))
            .get() as EncounterLocationRow | undefined;
    if (presenceSceneRow?.kind === "macro") {
      presenceSceneId = null;
    }
  }
  const npcRows = broadLocationId
    ? db
        .select()
        .from(npcs)
        .where(eq(npcs.currentLocationId, broadLocationId))
        .all()
    : [];

  const snapshot =
    player?.id && broadLocationId && presenceSceneId
      ? resolveScenePresence({
          playerActorId: player.id,
          broadLocationId,
          sceneScopeId: presenceSceneId,
          actors: [
            {
              actorId: player.id,
              actorType: "player",
              broadLocationId,
              sceneScopeId: presenceSceneId,
              visibility: "clear",
            },
            ...npcRows.map((npc) => {
              const visibility = inferPresenceVisibility(npc.tags);
              return {
                actorId: npc.id,
                actorType: "npc" as const,
                broadLocationId: npc.currentLocationId,
                sceneScopeId: npc.currentSceneLocationId,
                visibility: visibility.visibility,
                awarenessHint: visibility.awarenessHint,
              };
            }),
          ],
        })
      : null;

  return {
    broadLocationId,
    sceneId,
    sceneName: sceneAssembly?.currentScene?.name ?? sceneRow?.name ?? null,
    playerId: player?.id ?? null,
    snapshot,
    npcRows,
    hintSignals: sceneAssembly?.awareness.hintSignals ?? snapshot?.playerAwarenessHints ?? [],
  };
}

function buildEncounterScopeSection(
  encounter: EncounterPromptContext,
  storytellerPass: StorytellerPass,
): PromptSection | null {
  if (!encounter.sceneId && encounter.hintSignals.length === 0) {
    return null;
  }

  const clearActors =
    encounter.snapshot && encounter.playerId
      ? encounter.npcRows
          .filter((npc) => encounter.snapshot?.presentActorIds.includes(npc.id))
          .filter((npc) => getObserverAwareness(encounter.snapshot!, encounter.playerId!, npc.id) === "clear")
          .map((npc) => npc.name)
      : [];

  const lines = [
    encounter.sceneName
      ? `Immediate encounter: ${encounter.sceneName}`
      : "Immediate encounter: unresolved",
    encounter.broadLocationId && encounter.sceneId && encounter.broadLocationId !== encounter.sceneId
      ? `Broad location anchor: ${encounter.broadLocationId}`
      : null,
    `Awareness contract: clear=${AWARENESS_BAND_CONTRACT.clear}`,
    `Awareness contract: hint=${AWARENESS_BAND_CONTRACT.hint}`,
    `Awareness contract: none=${AWARENESS_BAND_CONTRACT.none}`,
    clearActors.length > 0 ? `Clear actors: ${clearActors.join(", ")}` : "Clear actors: none",
    encounter.hintSignals.length > 0
      ? `Hint signals: ${encounter.hintSignals.join(" | ")}`
      : "Hint signals: none",
    storytellerPass === "hidden-tool-driving"
      ? "Hidden pass rule: hint-band actors remain real participants in the scene model, but visible narration may expose only bounded indirect cues until runtime consequences reveal more."
      : "Final visible rule: narrate only what the player can perceive from clear actors and hint signals.",
  ].filter((line): line is string => Boolean(line));

  const content = lines.map((line) => `- ${line}`).join("\n");

  return {
    name: "ENCOUNTER SCOPE",
    priority: 2,
    content,
    estimatedTokens: estimateTokens(content),
    canTruncate: true,
  };
}

function buildNpcStatesSection(
  campaignId: string,
  encounter: EncounterPromptContext,
  storytellerPass: StorytellerPass,
): PromptSection | null {
  const snapshot = encounter.snapshot;
  const playerId = encounter.playerId;
  const npcRows =
    snapshot && playerId
      ? encounter.npcRows.filter((npc) => {
          if (!snapshot.presentActorIds.includes(npc.id)) {
            return false;
          }

          const awareness = getObserverAwareness(snapshot, playerId, npc.id);

          return storytellerPass === "hidden-tool-driving"
            ? awareness !== "none"
            : awareness === "clear";
        })
      : [];

  if (npcRows.length === 0) return null;

  const npcIds = npcRows.map((n) => n.id);
  const graphNodes = getRelationshipGraph(campaignId, npcIds, 2);
  const graphMap = new Map(graphNodes.map((g) => [g.entityId, g]));

  const npcBlocks = npcRows.map((npc) => {
    const npcRecord = hydrateStoredNpcRecord(npc);
    const authoritativeInventory = loadAuthoritativeInventoryView(campaignId, npc.id);
    const tags = deriveRuntimeCharacterTags(npcRecord);
    const goals = [
      ...npcRecord.motivations.shortTermGoals,
      ...npcRecord.motivations.longTermGoals,
    ];
    const beliefs = npcRecord.motivations.beliefs;
    const npcWealthTag = npcRecord.capabilities.wealthTier;
    const awareness =
      encounter.snapshot && encounter.playerId
        ? getObserverAwareness(encounter.snapshot, encounter.playerId, npc.id)
        : "clear";
    const identityLines = buildRuntimeIdentityLines(npcRecord, { indent: "  " });

    const lines = [
      `- ${npcRecord.identity.displayName} (${npcRecord.identity.tier})`,
      `  Encounter awareness: ${awareness}`,
      `  Awareness meaning: ${AWARENESS_BAND_CONTRACT[awareness]}`,
      `  Persona: ${npcRecord.profile.personaSummary}`,
      npcWealthTag ? `  Wealth: ${npcWealthTag}` : null,
      ...identityLines,
      tags.length > 0 ? `  Tags: ${tags.join(", ")}` : null,
      goals.length > 0 ? `  Goals: ${goals.join("; ")}` : null,
      beliefs.length > 0 ? `  Beliefs: ${beliefs.join(", ")}` : null,
      authoritativeInventory.compatibility.equippedItemRefs.length > 0
        ? `  Equipped: ${authoritativeInventory.compatibility.equippedItemRefs.join(", ")}`
        : null,
      authoritativeInventory.carried.length > 0
        ? `  Inventory: ${authoritativeInventory.carried.map((item) => item.name).join(", ")}`
        : null,
      authoritativeInventory.compatibility.signatureItems.length > 0
        ? `  Signature Items: ${authoritativeInventory.compatibility.signatureItems.join(", ")}`
        : null,
      (() => { const pl = buildPowerStatsLine(npcRecord); return pl ? `  ${pl.split("\n").join("\n  ")}` : null; })(),
    ].filter(Boolean);

    // Enrich with relationship graph data
    const graphNode = graphMap.get(npc.id);
    if (graphNode && graphNode.relationships.length > 0) {
      for (const rel of graphNode.relationships) {
        const tagStr = rel.tags.length > 0 ? rel.tags.join(", ") : "related";
        lines.push(`  Relationships: ${tagStr} with ${rel.targetName}${rel.reason ? ` (${rel.reason})` : ""}`);
      }
    }

    return lines.join("\n");
  });

  const content = npcBlocks.join("\n");

  return {
    name: "NPC STATES",
    priority: 4,
    content,
    estimatedTokens: estimateTokens(content),
    canTruncate: true,
  };
}

function buildRelationshipsSection(
  campaignId: string,
  playerId: string | null,
  npcIds: string[],
): PromptSection | null {
  if (!playerId) return null;

  const db = getDb();
  const allRels = db
    .select()
    .from(relationships)
    .where(eq(relationships.campaignId, campaignId))
    .all();

  // Only include player relationships not already covered by NPC graph enrichment
  const npcIdSet = new Set(npcIds);
  const relevant = allRels.filter(
    (r) =>
      (r.entityA === playerId || r.entityB === playerId) &&
      // Exclude NPC<->NPC relationships (those are in NPC states now)
      !(npcIdSet.has(r.entityA) && npcIdSet.has(r.entityB)),
  );

  if (relevant.length === 0) return null;

  const lines = relevant.map((r) => {
    const tags = safeParseTags(r.tags);
    return `- ${r.entityA} <-> ${r.entityB}: ${tags.join(", ")}${r.reason ? ` (${r.reason})` : ""}`;
  });

  const content = lines.join("\n");

  return {
    name: "RELATIONSHIPS",
    priority: 4,
    content,
    estimatedTokens: estimateTokens(content),
    canTruncate: true,
  };
}

async function buildLoreContextSection(
  embedderResult: ResolveResult | undefined,
  playerAction: string | undefined,
): Promise<PromptSection | null> {
  if (!embedderResult || !playerAction) return null;
  if ("error" in embedderResult) return null;

  try {
    const embeddings = await embedTexts(
      [playerAction],
      embedderResult.resolved.provider,
    );
    const queryVector = embeddings[0];
    if (!queryVector || queryVector.length === 0) return null;

    const loreCards = await searchLoreCards(queryVector, 3);
    if (loreCards.length === 0) return null;

    const lines = loreCards.map(
      (card) => `${card.term}: ${card.definition}`,
    );
    const content = lines.join("\n");

    return {
      name: "LORE CONTEXT",
      priority: 6,
      content,
      estimatedTokens: estimateTokens(content),
      canTruncate: true,
    };
  } catch (error) {
    log.warn("Lore context retrieval failed, skipping", error);
    return null;
  }
}

/**
 * Build episodic memory section from composite-scored vector search.
 * Retrieves top 5 episodic events semantically related to the current action.
 */
async function buildEpisodicMemorySection(
  embedderResult: ResolveResult | undefined,
  playerAction: string | undefined,
  currentTick: number,
): Promise<PromptSection | null> {
  if (!embedderResult || !playerAction) return null;
  if ("error" in embedderResult) return null;

  try {
    const embeddings = await embedTexts(
      [playerAction],
      embedderResult.resolved.provider,
    );
    const queryVector = embeddings[0];
    if (!queryVector || queryVector.length === 0) return null;

    const events = await searchEpisodicEvents(queryVector, currentTick, 5);
    if (events.length === 0) return null;

    const lines = events.map(
      (e) => `[Tick ${e.tick}] ${e.text} (importance: ${e.importance})`,
    );
    const content = lines.join("\n");

    return {
      name: "EPISODIC MEMORY",
      priority: 5,
      content,
      estimatedTokens: estimateTokens(content),
      canTruncate: true,
    };
  } catch (error) {
    log.warn("Episodic memory retrieval failed, skipping", error);
    return null;
  }
}

// -- World state section ----------------------------------------------------

function buildWorldStateSection(
  campaignId: string,
): PromptSection | null {
  const db = getDb();

  // Query last 5 chronicle entries (newest first), then reverse for chronological order
  const recentChronicle = db
    .select({ tick: chronicle.tick, text: chronicle.text })
    .from(chronicle)
    .where(eq(chronicle.campaignId, campaignId))
    .orderBy(desc(chronicle.tick))
    .limit(5)
    .all();

  const allFactions = db
    .select({
      id: factions.id,
      name: factions.name,
      tags: factions.tags,
      goals: factions.goals,
    })
    .from(factions)
    .where(eq(factions.campaignId, campaignId))
    .all();

  if (recentChronicle.length === 0 && allFactions.length === 0) {
    return null;
  }

  const lines: string[] = [];

  if (recentChronicle.length > 0) {
    lines.push("Recent World Events:");
    const chronological = [...recentChronicle].reverse();
    for (const entry of chronological) {
      lines.push(`[Tick ${entry.tick}] ${entry.text}`);
    }
  }

  if (allFactions.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Active Factions:");
    for (const faction of allFactions) {
      const tags = safeParseTags(faction.tags);
      const goals = safeParseGoals(faction.goals);
      const tagStr = tags.length > 0 ? `[${tags.join(", ")}]` : "";
      const goalStr = goals.length > 0 ? `Goals: [${goals.join(", ")}]` : "";
      lines.push(`- ${faction.name}: ${tagStr}${tagStr && goalStr ? ", " : ""}${goalStr}`);
    }
  }

  const content = lines.join("\n");

  return {
    name: "WORLD STATE",
    priority: 3,
    content,
    estimatedTokens: estimateTokens(content),
    canTruncate: true,
  };
}

// -- Main assembler ----------------------------------------------------------

export async function assemblePrompt(
  options: AssembleOptions,
): Promise<AssembledPrompt> {
  const {
    campaignId,
    contextWindow,
    storytellerPass = "hidden-tool-driving",
    sceneAssembly,
    includeRecentConversation = true,
    actionResult,
    embedderResult,
    playerAction,
    judgeRole,
    worldBrainDirection,
    systemRulesOverride,
    passLogLabel,
    promptDumpLabel,
  } = options;

  const budgets = allocateBudgets(contextWindow);
  const responseHeadroom = budgets.responseHeadroom ?? Math.floor(contextWindow * 0.25);
  const effectiveMax = contextWindow - responseHeadroom;
  const storytellerSceneMode = classifyStorytellerSceneMode({
    sceneAssembly,
    actionResult,
    playerAction,
  });
  const systemRules =
    systemRulesOverride
    ?? buildSystemRules(storytellerPass, storytellerSceneMode);

  const systemSection: PromptSection = {
    name: "SYSTEM RULES",
    priority: 0,
    content: systemRules,
    estimatedTokens: estimateTokens(systemRules),
    canTruncate: false,
  };

  const config = readCampaignConfig(campaignId);
  const premiseContent = config.premise;
  const currentTick = config.currentTick ?? 0;
  const premiseSection: PromptSection = {
    name: "WORLD PREMISE",
    priority: 1,
    content: premiseContent,
    estimatedTokens: estimateTokens(premiseContent),
    canTruncate: false,
  };

  const playerSection = buildPlayerStateSection(campaignId, currentTick);

  const db = getDb();
  const encounter = buildEncounterPromptContext(campaignId, sceneAssembly);
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();

  const sceneSection = buildSceneSection(campaignId, encounter.sceneId, currentTick, encounter);
  const encounterSection = buildEncounterScopeSection(encounter, storytellerPass);
  const effectiveWorldBrainDirection =
    storytellerPass === "final-visible"
      ? sceneAssembly?.playerPerceivableSceneDirection ?? null
      : worldBrainDirection ?? sceneAssembly?.sceneDirection ?? null;
  const hiddenWorldBrainSection = buildHiddenWorldBrainDirectionSection(
    storytellerPass,
    effectiveWorldBrainDirection,
  );
  const visibleWorldBrainSections =
    storytellerPass === "final-visible"
      ? buildVisibleWorldBrainSections(effectiveWorldBrainDirection)
      : [];

  const worldStateSection = buildWorldStateSection(campaignId);

  const npcSection = buildNpcStatesSection(campaignId, encounter, storytellerPass);

  // 6. Player relationships (fallback -- NPC-NPC rels are in NPC states now)
  const npcIds =
    encounter.snapshot && encounter.playerId
      ? encounter.npcRows
          .filter((npc) => {
            const awareness = getObserverAwareness(
              encounter.snapshot!,
              encounter.playerId!,
              npc.id,
            );
            return storytellerPass === "hidden-tool-driving"
              ? awareness !== "none"
              : awareness === "clear";
          })
          .map((npc) => npc.id)
      : [];
  const relSection = buildRelationshipsSection(
    campaignId,
    player?.id ?? null,
    npcIds,
  );

  let actionSection: PromptSection | null = null;
  if (actionResult) {
    const content = [
      `Chance: ${actionResult.chance}%`,
      `Roll: ${actionResult.roll}`,
      `Outcome: ${actionResult.outcome}`,
      `Reasoning: ${actionResult.reasoning}`,
    ].join("\n");

    actionSection = {
      name: "ACTION RESULT",
      priority: 5,
      content,
      estimatedTokens: estimateTokens(content),
      canTruncate: false,
    };
  }

  const loreSection = await buildLoreContextSection(embedderResult, playerAction);

  const episodicSection = await buildEpisodicMemorySection(
    embedderResult,
    playerAction,
    currentTick,
  );

  const conversationBudget = budgets.recentConversation ?? Math.floor(contextWindow * 0.20);
  const history = getChatHistory(campaignId);
  const conversationSection = includeRecentConversation
    ? await compressConversation(history, conversationBudget, judgeRole)
    : null;

  const allSections: PromptSection[] = [
    systemSection,
    premiseSection,
    ...(encounterSection ? [encounterSection] : []),
    ...(sceneSection ? [sceneSection] : []),
    ...(hiddenWorldBrainSection ? [hiddenWorldBrainSection] : []),
    ...visibleWorldBrainSections,
    ...(worldStateSection ? [worldStateSection] : []),
    ...(playerSection ? [playerSection] : []),
    ...(npcSection ? [npcSection] : []),
    ...(relSection ? [relSection] : []),
    ...(actionSection ? [actionSection] : []),
    ...(loreSection ? [loreSection] : []),
    ...(episodicSection ? [episodicSection] : []),
    ...(conversationSection ? [conversationSection] : []),
  ];

  const finalSections = truncateToFit(allSections, effectiveMax);

  const totalTokens = finalSections.reduce((sum, s) => sum + s.estimatedTokens, 0);
  const budgetUsed = Math.round((totalTokens / contextWindow) * 100);

  const formatted = finalSections
    .filter((s) => s.content.length > 0)
    .map((s) => `[${s.name}]\n${s.content}`)
    .join("\n\n");

  log.event("prompt.assembled", {
    pass: passLogLabel ?? storytellerPass,
    totalTokens,
    budgetUsed,
    sectionCount: finalSections.length,
    assembledChars: formatted.length,
    formatted,
  });

  writePromptSideCarIfEnabled(
    promptDumpLabel
      ?? (storytellerPass === "final-visible"
        ? "final-visible-base"
        : "hidden-tool-driving"),
    formatted,
  );

  return {
    sections: finalSections,
    totalTokens,
    budgetUsed,
    formatted,
  };
}

function formatListSection(name: string, values: string[], emptyState: string): string {
  const lines = values.length > 0 ? values.map((value) => `- ${value}`) : [`- ${emptyState}`];
  return `[${name}]\n${lines.join("\n")}`;
}

function includesAnyTerm(text: string, terms: readonly string[]): boolean {
  const normalizedText = text.toLowerCase();
  return terms.some((term) => {
    const normalizedTerm = term.trim().toLowerCase();
    return normalizedTerm.length > 0 && normalizedText.includes(normalizedTerm);
  });
}

function buildRecentVisibleTranscriptSection(
  campaignId: string,
  narratorPacket: NarratorPacket,
): string | null {
  const forbiddenTerms = [
    ...narratorPacket.forbiddenActorNames,
    ...narratorPacket.forbiddenFactMarkers,
    ...narratorPacket.forbiddenPrivateTerms,
  ];
  const lines = getChatHistory(campaignId)
    .slice(-8)
    .flatMap((message) => {
      const content = message.content.trim();
      if (!content) {
        return [];
      }
      if (message.role !== "user" && includesAnyTerm(content, forbiddenTerms)) {
        return [];
      }

      const speaker = message.role === "user" ? "Player (player-supplied claim)" : "GM";
      const clipped = content.length > 900 ? `${content.slice(0, 900).trim()}...` : content;
      return [`${speaker}: ${clipped}`];
    });

  if (lines.length === 0) {
    return null;
  }

  return [
    "[RECENT VISIBLE TRANSCRIPT]",
    "Use only as continuity for the current player-visible scene. NarratorPacket facts remain authoritative.",
    ...lines.map((line) => `- ${line}`),
  ].join("\n");
}

function formatOpeningState(sceneAssembly: SceneAssembly): string {
  const openingState = sceneAssembly.openingState;
  if (!openingState) {
    return "[OPENING STATE]\n- No structured opening state is active.";
  }

  const lines = [
    openingState.active ? "Structured opening state is active." : "Structured opening state has expired.",
    openingState.locationName ? `Opening location: ${openingState.locationName}` : null,
    openingState.arrivalMode ? `Arrival mode: ${openingState.arrivalMode}` : null,
    openingState.startingVisibility ? `Visibility: ${openingState.startingVisibility}` : null,
    openingState.immediateSituation ? `Immediate situation: ${openingState.immediateSituation}` : null,
    openingState.entryPressure.length > 0
      ? `Entry pressure: ${openingState.entryPressure.join(", ")}`
      : null,
    ...openingState.promptLines,
    ...openingState.sceneContextLines,
  ].filter((line): line is string => Boolean(line));

  return `[OPENING STATE]\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function formatCurrentScene(sceneAssembly: SceneAssembly): string {
  const currentScene = sceneAssembly.currentScene;
  if (!currentScene) {
    return "[CURRENT LOCAL SCENE]\n- No current local scene is available.";
  }

  const lines = [
    `Name: ${currentScene.name}`,
    `Id: ${currentScene.id}`,
    currentScene.description ? `Description: ${currentScene.description}` : null,
    currentScene.tags.length > 0 ? `Tags: ${currentScene.tags.join(", ")}` : null,
  ].filter((line): line is string => Boolean(line));

  return `[CURRENT LOCAL SCENE]\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function buildIsolatedFinalNarrationBase(): AssembledPrompt {
  return {
    sections: [],
    totalTokens: 0,
    budgetUsed: 0,
    formatted: "",
  };
}

function assertFinalNarrationPromptSafe(
  sections: Array<{ name: string; content: string; sourceBoundaryChecked: boolean }>,
  narratorPacket?: NarratorPacket,
): void {
  if (!narratorPacket) return;

  const forbiddenTerms = [
    ...narratorPacket.forbiddenActorNames,
    ...narratorPacket.forbiddenFactMarkers,
    ...narratorPacket.forbiddenPrivateTerms,
  ];

  for (const term of forbiddenTerms) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) continue;
    const leak = sections
      .filter((section) => !section.sourceBoundaryChecked)
      .find((section) => section.content.toLowerCase().includes(normalizedTerm));
    if (leak) {
      throw new Error(
        `Final narration prompt contains forbidden private term from ${leak.name}: ${term}`,
      );
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectNarratorPacketForbiddenTerms(narratorPacket?: NarratorPacket): string[] {
  if (!narratorPacket) {
    return [];
  }
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of [
    ...narratorPacket.forbiddenActorNames,
    ...narratorPacket.forbiddenFactMarkers,
    ...narratorPacket.forbiddenPrivateTerms,
  ]) {
    const trimmed = term.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    terms.push(trimmed);
  }
  return terms;
}

function redactFinalNarrationUncheckedSections(
  sections: Array<{ name: string; content: string; sourceBoundaryChecked: boolean }>,
  narratorPacket?: NarratorPacket,
): Array<{ name: string; content: string; sourceBoundaryChecked: boolean }> {
  const forbiddenTerms = collectNarratorPacketForbiddenTerms(narratorPacket);
  if (forbiddenTerms.length === 0) {
    return sections;
  }

  return sections.map((section) => {
    if (section.sourceBoundaryChecked) {
      return section;
    }

    let content = section.content;
    for (const term of forbiddenTerms) {
      content = content.replace(
        new RegExp(escapeRegExp(term), "gi"),
        "[private term omitted]",
      );
    }
    return { ...section, content };
  });
}

function formatSettledPacketEffectsSection(narratorPacket: NarratorPacket): string {
  return formatListSection(
    "SETTLED PACKET EFFECTS",
    narratorPacket.perceivableEffects.map(
      (effect) =>
        `${effect.summary} [source=narrator-packet; player-perceivable=yes]`,
    ),
    "No settled player-perceivable effects are in scope.",
  );
}

function formatNarrationDraftContract(narratorPacket: NarratorPacket): string {
  const evidenceLines = (narratorPacket.evidenceLedger ?? []).map(
    (entry) => `- ${entry.id}`,
  );

  return [
    "[NARRATION DRAFT CONTRACT]",
    "Return a single JSON object, not markdown.",
    "Shape: { \"prose\": string, \"claims\": [{ \"id\": string, \"kind\": \"actor_presence\" | \"object_presence\" | \"location_change\" | \"route_status\" | \"threat_hazard\" | \"future_pressure\" | \"inventory_status_change\" | \"oracle_outcome\" | \"playable_beat\", \"summary\": string, \"requiresEvidence\": boolean, \"evidenceRefs\": string[] }], \"claimSpans\": [{ \"id\": string, \"spanText\": string, \"claimIds\": string[], \"requiresEvidence\": boolean }] }.",
    "Every concrete world, pressure, route, actor, object, status, oracle, or playable-beat statement in prose must appear as a claimSpan and map to declared claims.",
    "When a claim requires packet support, set requiresEvidence=true and cite only ids from [PACKET EVIDENCE IDS].",
    "For atmosphere or connective prose that does not assert a concrete world fact, use requiresEvidence=false on its span.",
    "",
    "[PACKET EVIDENCE IDS]",
    ...(evidenceLines.length > 0 ? evidenceLines : ["- No packet evidence ids are in scope."]),
  ].join("\n");
}

function buildRpBeatDirective(narratorPacket?: NarratorPacket): string {
  const authorityLine = narratorPacket
    ? "Treat NarratorPacket events, effects, and tool results as the only authority for success, possession, access, consent, location change, and durable world change."
    : "Treat assembled scene effects and player-perceivable consequences as the only authority for success, possession, access, consent, location change, and durable world change.";
  const boundedNoEffectLine = narratorPacket
    ? "If NarratorPacket has no perceivable effects, keep the beat alive through existing visible actors, already listed scene details, dialogue, refusal, posture, distance, attention, silence, or sensory color already implied by the current scene; do not add reusable props, new routes, doors, hazards, documents, authorities, promises, injuries, movement, changed positions, or new named facts unless the packet/current scene already names them."
    : "If no authoritative scene effect is present, keep the beat alive through existing visible actors, already listed scene details, dialogue, refusal, posture, distance, attention, silence, or sensory color already implied by the current scene; do not add reusable props, new routes, doors, hazards, documents, authorities, promises, injuries, movement, changed positions, or new named facts unless assembled inputs already name them.";

  return [
    "[RP BEAT DIRECTIVE]",
    "- Write one playable RPG/VN beat, not a recap, report, or lore dump.",
    "- Start from the player request and show what visibly changes now.",
    "- Let visible NPCs act from motives, pressure, relationships, and limited knowledge.",
    "- First sentence must add new pressure, a visible reaction, or a fresh authoritative scene fact; do not spend it restating what the player just typed.",
    "- If a present NPC matters to this beat and packet/current-scene facts support it, give one concrete line, gesture, decision, or refusal.",
    "- Use concrete observable details, body language, distinct dialogue, and changed positions before abstract mood.",
    "- Do not open by echoing or paraphrasing the player action.",
    "- Do not decide the player's deliberate words, feelings, consent, or completed success.",
    "- If the packet describes an unconfirmed claim, bluff, or failed test, keep it unconfirmed; do not concretize the claimed prop, authority, or access into the player's hand or inventory.",
    `- ${authorityLine}`,
    `- ${boundedNoEffectLine}`,
    "- Stop when the scene reaches a live next decision, question, pressure, or invitation.",
  ].join("\n");
}

function formatPresentActorsSection(
  sceneAssembly: SceneAssembly,
  narratorPacket?: NarratorPacket,
): string {
  const presentActorNames = narratorPacket
    ? narratorPacket.visibleActors
        .filter((actor) => actor.type !== "player")
        .map((actor) => actor.label)
    : sceneAssembly.presentNpcNames;

  return formatListSection(
    "PRESENT ACTORS",
    presentActorNames,
    "No other present actors are confirmed in the current scene.",
  );
}

export async function assembleFinalNarrationPrompt(options: {
  campaignId: string;
  contextWindow: number;
  sceneAssembly: SceneAssembly;
  narratorPacket?: NarratorPacket;
  outcomeBounds?: NarrativeOutcomeBounds;
  actionResult?: AssembleOptions["actionResult"];
  embedderResult?: ResolveResult;
  playerAction?: string;
  judgeRole?: ResolvedRole;
}): Promise<FinalNarrationPrompt> {
  const assembledBase = options.narratorPacket
    ? buildIsolatedFinalNarrationBase()
    : await assemblePrompt({
        campaignId: options.campaignId,
        contextWindow: options.contextWindow,
        storytellerPass: "final-visible",
        sceneAssembly: options.sceneAssembly,
        includeRecentConversation: true,
        actionResult: undefined,
        embedderResult: options.embedderResult,
        playerAction: options.playerAction,
        judgeRole: options.judgeRole,
      });
  const storytellerSceneMode = classifyStorytellerSceneMode({
    sceneAssembly: options.sceneAssembly,
    actionResult: options.actionResult,
    playerAction: options.playerAction,
  });
  const campaignConfig = readCampaignConfig(options.campaignId);
  const recentConversation = getChatHistory(options.campaignId).slice(-8);
  const responseLanguage = inferSessionResponseLanguage({
    playerAction: options.playerAction,
    campaignName: campaignConfig?.name,
    campaignPremise: campaignConfig?.premise,
    recentConversation,
  });
  const formattedNarratorPacket = options.narratorPacket
    ? (() => {
        assertNarratorPacketPromptSafe(options.narratorPacket);
        return formatPlayerFacingPacketForPrompt(
          buildPlayerFacingPacketFromNarratorPacket(options.narratorPacket),
        );
      })()
    : null;
  const finalNarrationTask = options.narratorPacket
    ? `[FINAL NARRATION TASK]
Use the NarratorPacket as the authoritative committed packet.
Write one final narration pass from the settled opening state, current scene, and NarratorPacket facts.
Do not invent material events outside these authoritative inputs.
When the packet has no perceivable effects, answer with immediate visible reaction, dialogue, refusal, or local sensory color grounded in the current scene; do not introduce any reusable prop, route, hazard, document, authority, promise, injury, movement, changed position, or new named fact.
Treat the raw player action as an attempted request, not as proof that the action already succeeded.
Do not narrate claimed possessions, NPC consent, location access, or item acquisition unless NarratorPacket events/effects/tool results confirm them.
If a packet effect says a claim may be false or unconfirmed, narrate the visible challenge/refusal without placing the claimed object in the player's hand.
Return the final narration as the JSON draft object required by [NARRATION DRAFT CONTRACT]; put player-visible prose only in the prose field.
Do not write tool syntax or backend metadata inside the prose field.
Keep the output bounded to what the player can perceive in this scene.
End on a concrete playable next moment rather than closing the scene with generic reflection.`
    : `[FINAL NARRATION TASK]
Write one final narration pass from the settled opening state, current scene, scene effects, and player-perceivable consequences.
Do not invent material events outside these authoritative inputs.
When no player-perceivable effect is present, answer with immediate visible reaction, dialogue, refusal, or local sensory color grounded in the current scene; do not introduce any reusable prop, route, hazard, document, authority, promise, injury, movement, changed position, or new named fact.
Do not write tool syntax or metadata.
Keep the output bounded to what the player can perceive in this scene.
End on a concrete playable next moment rather than closing the scene with generic reflection.`;

  const rawPromptSections = [
    {
      name: "assembled-base",
      content: assembledBase.formatted,
      sourceBoundaryChecked: false,
    },
    {
      name: "session-language",
      content: formatSessionLanguageContract(responseLanguage),
      sourceBoundaryChecked: false,
    },
    formattedNarratorPacket
      ? {
          name: "player-facing-packet",
          content: formattedNarratorPacket,
          sourceBoundaryChecked: true,
        }
      : null,
    {
      name: "rp-beat-directive",
      content: buildRpBeatDirective(options.narratorPacket),
      sourceBoundaryChecked: false,
    },
    options.narratorPacket
      ? (() => {
          const content = buildRecentVisibleTranscriptSection(
            options.campaignId,
            options.narratorPacket,
          );
          return content
            ? { name: "recent-visible-transcript", content, sourceBoundaryChecked: true }
            : null;
        })()
      : null,
    {
      name: "current-local-scene",
      content: formatCurrentScene(options.sceneAssembly),
      sourceBoundaryChecked: false,
    },
    {
      name: "opening-state",
      content: formatOpeningState(options.sceneAssembly),
      sourceBoundaryChecked: false,
    },
    options.narratorPacket
      ? {
          name: "settled-packet-effects",
          content: formatSettledPacketEffectsSection(options.narratorPacket),
          sourceBoundaryChecked: true,
        }
      : {
          name: "scene-effects",
          content: formatListSection(
            "SCENE EFFECTS",
            options.sceneAssembly.sceneEffects
              .filter((effect) => effect.perceivable)
              .map(
                (effect) =>
                  `${effect.summary} [source=${effect.source}; kind=${effect.kind}; player-perceivable=yes]`,
              ),
            "No authoritative scene effects were assembled.",
          ),
          sourceBoundaryChecked: false,
        },
    options.narratorPacket
      ? null
      : {
          name: "player-perceivable-consequences",
          content: formatListSection(
            "PLAYER-PERCEIVABLE CONSEQUENCES",
            options.sceneAssembly.playerPerceivableConsequences,
            "No additional player-perceivable consequences are in scope.",
          ),
          sourceBoundaryChecked: false,
        },
    options.narratorPacket
      ? null
      : {
          name: "recent-local-context",
          content: formatListSection(
            "RECENT LOCAL CONTEXT",
            options.sceneAssembly.recentContext.map(
              (entry) => `[Tick ${entry.tick}] ${entry.summary} (${entry.source})`,
            ),
            "No recent local context is relevant.",
          ),
          sourceBoundaryChecked: false,
        },
    {
      name: "present-actors",
      content: formatPresentActorsSection(options.sceneAssembly, options.narratorPacket),
      sourceBoundaryChecked: Boolean(options.narratorPacket),
    },
    options.narratorPacket
      ? {
          name: "narration-draft-contract",
          content: formatNarrationDraftContract(options.narratorPacket),
          sourceBoundaryChecked: true,
        }
      : null,
    options.outcomeBounds
      ? {
          name: "outcome-bounds",
          content: formatNarrativeOutcomeBoundsBlock(options.outcomeBounds),
          sourceBoundaryChecked: false,
        }
      : null,
    {
      name: "final-narration-task",
      content: finalNarrationTask,
      sourceBoundaryChecked: false,
    },
  ].filter(
    (
      section,
    ): section is { name: string; content: string; sourceBoundaryChecked: boolean } =>
      Boolean(section?.content),
  );

  const promptSections = redactFinalNarrationUncheckedSections(
    rawPromptSections,
    options.narratorPacket,
  );

  assertFinalNarrationPromptSafe(promptSections, options.narratorPacket);

  const prompt = promptSections.map((section) => section.content).join("\n\n");

  const finalSystem = [
    buildStorytellerContract({
      pass: "final-visible",
      sceneMode: storytellerSceneMode,
      includeGlmOverlay: true,
      responseLanguage,
      outputMode: options.narratorPacket ? "narration-draft-json" : "prose",
    }),
  ].filter((section): section is string => Boolean(section)).join("\n");

  log.event("prompt.assembled", {
    pass: "final-narration",
    totalTokens: assembledBase.totalTokens,
    budgetUsed: assembledBase.budgetUsed,
    sectionCount: assembledBase.sections.length,
    assembledChars: prompt.length,
    formatted: prompt,
  });

  writePromptSideCarIfEnabled("final-narration", prompt);

  return {
    system: finalSystem,
    prompt,
    assembledBase,
  };
}

export async function assembleJudgeAdjudicationPrompt(options: {
  campaignId: string;
  contextWindow: number;
  actionResult: NonNullable<AssembleOptions["actionResult"]>;
  playerAction: string;
  embedderResult?: ResolveResult;
  judgeRole?: ResolvedRole;
  worldBrainDirection?: WorldBrainSceneDirection;
  outcomeBounds?: NarrativeOutcomeBounds;
}): Promise<JudgeAdjudicationPrompt> {
  const assembledBase = await assemblePrompt({
    campaignId: options.campaignId,
    contextWindow: options.contextWindow,
    storytellerPass: "hidden-tool-driving",
    includeRecentConversation: false,
    actionResult: options.actionResult,
    embedderResult: options.embedderResult,
    playerAction: options.playerAction,
    judgeRole: options.judgeRole,
    worldBrainDirection: options.worldBrainDirection,
    systemRulesOverride: [
      OUTPUT_RULES,
      buildJudgeAdjudicationContract(),
      RUNTIME_SCENE_RULES,
    ].join("\n\n"),
    passLogLabel: "judge-adjudication",
    promptDumpLabel: "judge-adjudication",
  });

  const system = [
    assembledBase.formatted,
    options.outcomeBounds
      ? formatNarrativeOutcomeBoundsBlock(options.outcomeBounds)
      : null,
    `[JUDGE ADJUDICATION TASK]
Return a structured adjudication plan for this turn.
Treat [ACTION RESULT] as binding resolution authority.
Treat [WORLD-BRAIN DIRECTION] as binding hidden scene-causality authority.
Plan only backend actions that should actually execute.
If no state mutation is justified, return an empty actions list.`,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n");

  const messages = [
    ...getChatHistory(options.campaignId)
      .slice(-20)
      .filter(
        (
          message,
        ): message is { role: "user" | "assistant"; content: string } =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string",
      ),
    { role: "user" as const, content: options.playerAction },
  ];

  return {
    system,
    messages,
    assembledBase,
  };
}

// -- Helpers -----------------------------------------------------------------

function safeParseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function safeParseGoals(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string");
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const short = Array.isArray(obj.short_term) ? obj.short_term : [];
      const long = Array.isArray(obj.long_term) ? obj.long_term : [];
      return [...short, ...long].filter((t): t is string => typeof t === "string");
    }
    return [];
  } catch {
    return [];
  }
}

function formatIdentityField(label: string, values: string[]): string | null {
  if (values.length === 0) return null;
  return `${label}: ${values.join("; ")}`;
}

function buildPersonalityLines(
  personality?: CharacterRecord["identity"]["personality"],
): string {
  const parts = [
    personality?.summary ? `summary=${JSON.stringify(personality.summary)}` : null,
    personality?.voice ? `voice=${JSON.stringify(personality.voice)}` : null,
    personality?.decisionStyle
      ? `decision-style=${JSON.stringify(personality.decisionStyle)}`
      : null,
    personality?.worldview ? `worldview=${JSON.stringify(personality.worldview)}` : null,
    personality?.internalContradictions?.length
      ? `internal-contradictions=${JSON.stringify(personality.internalContradictions)}`
      : null,
    personality?.personalMythology
      ? `personal-mythology=${JSON.stringify(personality.personalMythology)}`
      : null,
    personality?.sampleLines?.length
      ? `sample-lines=${JSON.stringify(personality.sampleLines)}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join("; ");
}

export function buildRuntimeIdentityLines(
  record: CharacterRecord,
  options: {
    indent?: string;
  } = {},
): string[] {
  const indent = options.indent ?? "";
  const baseFacts = record.identity.baseFacts;
  const behavioralCore = record.identity.behavioralCore;
  const liveDynamics = record.identity.liveDynamics;
  const personalityLine = buildPersonalityLines(record.identity.personality);

  const lines = [
    [
      baseFacts?.biography ? `biography=${baseFacts.biography}` : null,
      formatIdentityField("roles", baseFacts?.socialRole ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | "),
    [
      formatIdentityField("goals", liveDynamics?.activeGoals ?? []),
      formatIdentityField("belief drift", liveDynamics?.beliefDrift ?? []),
      formatIdentityField("strains", liveDynamics?.currentStrains ?? []),
      formatIdentityField("earned changes", liveDynamics?.earnedChanges ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | "),
  ];

  const formatted = [
    lines[0] ? `${indent}Base Facts: ${lines[0]}` : null,
    personalityLine ? `${indent}Personality: ${personalityLine}` : null,
    behavioralCore?.selfImage
      ? `${indent}self-image=${JSON.stringify(behavioralCore.selfImage)}`
      : null,
    liveDynamics?.attachments?.length
      ? `${indent}attachments=${JSON.stringify(liveDynamics.attachments)}`
      : null,
    baseFacts?.hardConstraints?.length
      ? `${indent}hard-constraints=${JSON.stringify(baseFacts.hardConstraints)}`
      : null,
    lines[1] ? `${indent}Live Dynamics: ${lines[1]}` : null,
  ].filter((value): value is string => Boolean(value));

  return formatted;
}
