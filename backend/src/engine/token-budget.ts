/**
 * Token estimation and budget allocation for prompt assembly.
 *
 * Uses a simple 4-char-per-token heuristic (good enough for English text
 * and avoids importing a tokenizer dependency).
 */

export interface PromptSection {
  name: string;
  /** 0 = highest priority (never cut). Higher numbers = lower importance. */
  priority: number;
  content: string;
  estimatedTokens: number;
  canTruncate: boolean;
}

/**
 * Estimate token count using ~4 characters per token heuristic.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Default budget percentages for each prompt section.
 * Must sum to <= 1.0. responseHeadroom is reserved for the model's reply.
 */
export const DEFAULT_BUDGETS: Record<string, number> = {
  systemRules: 0.05,
  worldPremise: 0.03,
  scene: 0.05,
  playerState: 0.03,
  npcStates: 0.10,
  actionResult: 0.03,
  loreContext: 0.08,
  episodicMemory: 0.05,
  recentConversation: 0.20,
  responseHeadroom: 0.25,
};

/**
 * Convert percentage budgets into absolute token limits for a given context window.
 */
export function allocateBudgets(contextWindow: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, pct] of Object.entries(DEFAULT_BUDGETS)) {
    result[key] = Math.floor(pct * contextWindow);
  }
  return result;
}

/**
 * Trim sections to fit within maxTokens.
 *
 * Strategy: Sort truncatable sections by priority descending (highest number = least important).
 * Trim from least important first. For each section, reduce content proportionally.
 * Never touch canTruncate=false sections.
 *
 * Returns a new array (does not mutate input).
 */
export function truncateToFit(
  sections: PromptSection[],
  maxTokens: number
): PromptSection[] {
  const result = sections.map((s) => ({ ...s }));
  let total = result.reduce((sum, s) => sum + s.estimatedTokens, 0);

  if (total <= maxTokens) return result;

  // Sort truncatable sections by priority descending (trim least important first)
  const truncatable = result
    .filter((s) => s.canTruncate)
    .sort((a, b) => b.priority - a.priority);

  for (const section of truncatable) {
    if (total <= maxTokens) break;

    const excess = total - maxTokens;
    const reduction = Math.min(section.estimatedTokens, excess);
    const newTokens = section.estimatedTokens - reduction;

    // Truncate content to match new token count
    const newLength = newTokens * 4;
    section.content = section.content.slice(0, newLength);
    section.estimatedTokens = newTokens;
    total -= reduction;
  }

  return result;
}
