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
import type { ChatMessage } from "@worldforge/shared";
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
}

// -- Importance keywords for smart compression --------------------------------

/**
 * Keywords that mark a message as important enough to survive compression.
 * Messages containing these (case-insensitive) are kept even from the middle.
 */
export const IMPORTANCE_KEYWORDS = [
  "attack",
  "attacked",
  "killed",
  "kill",
  "died",
  "death",
  "dead",
  "discovered",
  "discovery",
  "betrayed",
  "betrayal",
  "ambush",
  "battle",
  "fight",
  "fighting",
  "defeated",
  "captured",
  "escaped",
  "destroyed",
  "stolen",
  "revealed",
  "secret",
  "cursed",
  "poisoned",
  "wounded",
  "critical",
  "treasure",
  "artifact",
] as const;

// -- System rules template --------------------------------------------------

const SYSTEM_RULES = `You are the Game Master of a text RPG. You narrate the world and its inhabitants.

CRITICAL OUTPUT RULES (MANDATORY — VIOLATION MEANS FAILURE):
1. Your output is ONLY narrative prose. NOTHING ELSE.
2. FORBIDDEN in your output: any text in [BRACKETS], any section header, any metadata, any statistics, any chance/roll numbers, any system information, any HP values (like "HP is now 3/5").
3. FORBIDDEN: echoing, repeating, or referencing [ACTION RESULT], [NPC STATES], [NARRATION DIRECTIVE], [RECENT CONVERSATION], [SCENE], [SYSTEM RULES], [WORLD PREMISE], [PLAYER STATE], [WORLD STATE], [LORE CONTEXT], [EPISODIC MEMORY], [RELATIONSHIPS], or ANY bracketed text.
4. FORBIDDEN: fabricating dice rolls, chances, percentages, or outcome values. The outcome is already determined — narrate it as prose.
5. If you are about to write a bracket "[" followed by a section name — STOP. That is system data, not narrative.

Rules you MUST follow:
- You are a narrator ONLY. You describe what happens, you do not decide mechanical outcomes.
- All characters, items, locations, and factions use a tag-based system (string labels, not numbers).
- The only numeric stat is HP (1-5). Do not invent other numeric stats.
- Do not hallucinate items, NPCs, or locations that have not been established.
- If the [NPC STATES] section lists NPCs, those NPCs ARE PRESENT at the player's location. Include them in your narration. Do not claim they are absent.
- When Key NPCs are present at the player's location (listed in [NPC STATES]), you MUST acknowledge their presence and have them react to the player's action. Key NPCs are autonomous characters with goals and beliefs — they should speak, react, or take action based on their persona and the situation. Do NOT ignore NPCs listed in [NPC STATES].
- If a Key NPC's goals or beliefs conflict with the player's action, narrate the NPC's reaction (objection, interference, support). NPCs are not passive scenery.
- MOVEMENT: When the player describes traveling to another location (walking, running, going somewhere), you MUST call the move_to tool with the destination name. If the destination doesn't exist, call reveal_location first to create it, then call move_to. NEVER narrate the player arriving at a new location without calling move_to — the backend tracks player position.
- After moving to a new location, describe the new location using its tags and description from [SCENE]. Mention any NPCs or items present at the new location.
- Reference established lore, relationships, and world facts when relevant.
- Stay consistent with the world premise and previously narrated events.
- When an [ACTION RESULT] is provided, narrate the outcome matching that result EXACTLY. If the outcome is "miss", narrate FAILURE. If "strong_hit", narrate SUCCESS with bonus. If "weak_hit", narrate success with complication. Do NOT contradict the outcome.
- COMBAT HP TRACKING (MANDATORY): Whenever the player takes physical damage in combat (hit by a weapon, struck by a fist, injured by a fall, hurt by magic), you MUST call set_condition with a negative delta. A light hit = -1 HP, a solid blow = -1 or -2 HP, a devastating attack = -2 or -3 HP. NEVER describe the player being injured without calling set_condition. Similarly, if the player heals (potion, rest, medical treatment), call set_condition with a positive delta.
- When a character reaches HP 0, narrate a contextual outcome based on the situation:
  - Non-lethal context (pit fight, bar brawl, sparring, training): knockout/submission/unconsciousness. Do NOT describe lethal wounds in non-lethal contexts.
  - Lethal context (death match, assassination, monster attack): death is possible. Consider the attacker's intent, the setting, and dramatic alternatives (capture, last-second rescue, enemy mercy).
  - NEVER automatically kill at HP 0 -- always consider context first.
- NEVER reference items the player does not have in their inventory. Check [PLAYER STATE] Inventory before mentioning any item.
- To give the player a new item, use the spawn_item tool first. Do NOT spawn an item that already exists in the player's inventory.
- When the player trades or gives away an item, use the transfer_item tool. Do NOT just narrate the trade without using tools.
- Character wealth is tag-based: Destitute < Poor < Comfortable < Wealthy < Obscenely Rich. Consider wealth tier when evaluating purchase, bribe, or trade actions.
- Skills are tag-based: Novice < Skilled < Master. Higher skill tier gives better odds on relevant actions.
- Use the terminology, concepts, and naming conventions from the world premise and lore context. If the world has specific terms for abilities, locations, or social structures, use those terms consistently instead of generic fantasy equivalents.
- CRITICAL WORLD CONSISTENCY: Never contradict the world premise. If the premise says "no sun", NEVER describe sunlight, sunshine, or daybreak. If the premise defines specific technology levels, respect them. The premise is absolute truth.
- MANDATORY: You MUST call offer_quick_actions after EVERY narration. This is not optional. If you do not call offer_quick_actions, the turn is incomplete. Vary suggestions — include at least one social, one physical, and one exploratory option. Reference present NPCs by name, available items, current threats, and nearby locations.`;


// -- Smart conversation compression -----------------------------------------

/**
 * Check whether a message is "important" based on keywords or [IMPORTANT] tag.
 */
function isImportantMessage(content: string): boolean {
  if (content.startsWith("[IMPORTANT]")) return true;
  const lower = content.toLowerCase();
  return IMPORTANCE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Smart conversation compression: keeps first 2 messages (world setup),
 * last N messages (recent context, ~60% of budget), and any important
 * messages from the middle. Drops mundane middle turns and inserts
 * an omission marker.
 *
 * Exported for testability (pure function -- no DB/campaign access).
 */
export function compressConversation(
  history: ChatMessage[],
  budgetTokens: number,
  _importanceThreshold: number = 7,
): PromptSection | null {
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
  const importantMiddle: Array<{ idx: number; line: string }> = [];
  for (let i = firstCount; i < recentStartIdx; i++) {
    const msg = history[i]!;
    if (isImportantMessage(msg.content)) {
      const line = format(msg);
      const lineTokens = estimateTokens(line);
      if (usedTokens + lineTokens <= budgetTokens) {
        importantMiddle.push({ idx: i, line });
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

// -- Section builders --------------------------------------------------------

function buildPlayerStateSection(
  campaignId: string,
): PromptSection | null {
  const db = getDb();
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();

  if (!player) return null;

  const tags = safeParseTags(player.tags);
  const equipped = safeParseTags(player.equippedItems);

  // Extract wealth tier from tags
  const wealthTiers = ["Destitute", "Poor", "Comfortable", "Wealthy", "Obscenely Rich"];
  const wealthTag = tags.find((t) => wealthTiers.includes(t));

  // Query player's inventory (items owned by this player)
  const playerItems = db
    .select({ name: items.name })
    .from(items)
    .where(eq(items.ownerId, player.id))
    .all();
  const inventoryLine = playerItems.length > 0
    ? `Inventory: ${playerItems.map((i) => i.name).join(", ")}`
    : "Inventory: (empty)";

  const lines = [
    `Name: ${player.name}`,
    player.race ? `Race: ${player.race}` : null,
    player.gender ? `Gender: ${player.gender}` : null,
    player.age ? `Age: ${player.age}` : null,
    player.appearance ? `Appearance: ${player.appearance}` : null,
    `HP: ${player.hp}/5`,
    wealthTag ? `Wealth: ${wealthTag}` : null,
    tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
    equipped.length > 0 ? `Equipped: ${equipped.join(", ")}` : null,
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

  // Get NPCs at this location to query their equipment
  const npcRows = db
    .select({ id: npcs.id, name: npcs.name })
    .from(npcs)
    .where(eq(npcs.currentLocationId, locationId))
    .all();

  // Query items owned by NPCs at this location
  const npcEquipmentLines: string[] = [];
  for (const npc of npcRows) {
    const npcItems = db
      .select({ name: items.name })
      .from(items)
      .where(eq(items.ownerId, npc.id))
      .all();
    if (npcItems.length > 0) {
      npcEquipmentLines.push(`  ${npc.name}: ${npcItems.map((i) => i.name).join(", ")}`);
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
  ].filter(Boolean);

  const content = lines.join("\n");

  return {
    name: "SCENE",
    priority: 2,
    content,
    estimatedTokens: estimateTokens(content),
    canTruncate: false,
  };
}

function buildNpcStatesSection(
  campaignId: string,
  locationId: string | null,
): PromptSection | null {
  const db = getDb();

  // Get NPCs at player's location if known, otherwise all campaign NPCs
  const npcRows = locationId
    ? db
        .select()
        .from(npcs)
        .where(eq(npcs.currentLocationId, locationId))
        .all()
    : [];

  if (npcRows.length === 0) return null;

  // Get relationship graph for all NPCs at the location
  const npcIds = npcRows.map((n) => n.id);
  const graphNodes = getRelationshipGraph(campaignId, npcIds, 2);
  const graphMap = new Map(graphNodes.map((g) => [g.entityId, g]));

  const wealthTiers = ["Destitute", "Poor", "Comfortable", "Wealthy", "Obscenely Rich"];

  const npcBlocks = npcRows.map((npc) => {
    const tags = safeParseTags(npc.tags);
    const goals = safeParseGoals(npc.goals);
    const beliefs = safeParseTags(npc.beliefs);
    const npcWealthTag = tags.find((t) => wealthTiers.includes(t));

    const lines = [
      `- ${npc.name} (${npc.tier})`,
      `  Persona: ${npc.persona}`,
      npcWealthTag ? `  Wealth: ${npcWealthTag}` : null,
      tags.length > 0 ? `  Tags: ${tags.join(", ")}` : null,
      goals.length > 0 ? `  Goals: ${goals.join("; ")}` : null,
      beliefs.length > 0 ? `  Beliefs: ${beliefs.join(", ")}` : null,
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

  // Query all factions for this campaign
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

  // If no chronicle and no factions, skip
  if (recentChronicle.length === 0 && allFactions.length === 0) {
    return null;
  }

  const lines: string[] = [];

  // Chronicle entries (reversed to chronological order)
  if (recentChronicle.length > 0) {
    lines.push("Recent World Events:");
    const chronological = [...recentChronicle].reverse();
    for (const entry of chronological) {
      lines.push(`[Tick ${entry.tick}] ${entry.text}`);
    }
  }

  // Faction summaries
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
  const { campaignId, contextWindow, actionResult, embedderResult, playerAction } =
    options;

  const budgets = allocateBudgets(contextWindow);
  const responseHeadroom = budgets.responseHeadroom ?? Math.floor(contextWindow * 0.25);
  const effectiveMax = contextWindow - responseHeadroom;

  // 1. System rules (never truncate)
  const systemSection: PromptSection = {
    name: "SYSTEM RULES",
    priority: 0,
    content: SYSTEM_RULES,
    estimatedTokens: estimateTokens(SYSTEM_RULES),
    canTruncate: false,
  };

  // 2. World premise
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

  // 3. Player state
  const playerSection = buildPlayerStateSection(campaignId);

  // Get player's location for scene/NPC queries
  const db = getDb();
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();
  const locationId = player?.currentLocationId ?? null;

  // 4. Scene
  const sceneSection = buildSceneSection(campaignId, locationId);

  // 4.5. World state (chronicle + factions)
  const worldStateSection = buildWorldStateSection(campaignId);

  // 5. NPC states (enriched with relationship graph)
  const npcSection = buildNpcStatesSection(campaignId, locationId);

  // 6. Player relationships (fallback -- NPC-NPC rels are in NPC states now)
  const npcIds = locationId
    ? db
        .select({ id: npcs.id })
        .from(npcs)
        .where(eq(npcs.currentLocationId, locationId))
        .all()
        .map((n) => n.id)
    : [];
  const relSection = buildRelationshipsSection(
    campaignId,
    player?.id ?? null,
    npcIds,
  );

  // 7. Action result (if provided)
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

  // 8. Lore context (async)
  const loreSection = await buildLoreContextSection(embedderResult, playerAction);

  // 9. Episodic memory (async)
  const episodicSection = await buildEpisodicMemorySection(
    embedderResult,
    playerAction,
    currentTick,
  );

  // 10. Smart conversation compression (replaces naive tail-slicing)
  const conversationBudget = budgets.recentConversation ?? Math.floor(contextWindow * 0.20);
  const history = getChatHistory(campaignId);
  const conversationSection = compressConversation(history, conversationBudget);

  // Collect all non-null sections
  const allSections: PromptSection[] = [
    systemSection,
    premiseSection,
    ...(sceneSection ? [sceneSection] : []),
    ...(worldStateSection ? [worldStateSection] : []),
    ...(playerSection ? [playerSection] : []),
    ...(npcSection ? [npcSection] : []),
    ...(relSection ? [relSection] : []),
    ...(actionSection ? [actionSection] : []),
    ...(loreSection ? [loreSection] : []),
    ...(episodicSection ? [episodicSection] : []),
    ...(conversationSection ? [conversationSection] : []),
  ];

  // Apply truncation
  const finalSections = truncateToFit(allSections, effectiveMax);

  // Calculate totals
  const totalTokens = finalSections.reduce((sum, s) => sum + s.estimatedTokens, 0);
  const budgetUsed = Math.round((totalTokens / contextWindow) * 100);

  // Format output
  const formatted = finalSections
    .filter((s) => s.content.length > 0)
    .map((s) => `[${s.name}]\n${s.content}`)
    .join("\n\n");

  return {
    sections: finalSections,
    totalTokens,
    budgetUsed,
    formatted,
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
