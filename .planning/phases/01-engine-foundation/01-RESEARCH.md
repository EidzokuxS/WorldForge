# Phase 1: Engine Foundation - Research

**Researched:** 2026-03-18
**Domain:** Prompt Assembly + Oracle Probability System (Vercel AI SDK + Drizzle + LanceDB)
**Confidence:** HIGH

## Summary

Phase 1 delivers two components: the Prompt Assembler (compiles structured context from 6+ data sources with token budgets) and the Oracle system (Judge LLM evaluates action probability, backend rolls D100, produces 3-tier outcome). Both build entirely on existing infrastructure -- no new npm dependencies required. The Prompt Assembler reads from SQLite via Drizzle, LanceDB via existing lore-cards module, and chat_history.json from disk. The Oracle wraps the existing `generateObject` pattern with the Judge role (already configured in settings).

The main technical risk is token budget estimation accuracy. The 4-chars-per-token approximation is sufficient for planning (actual token counts vary by model/tokenizer, but budgets are soft limits, not hard cuts). The Oracle's main risk is probability inconsistency for semantically similar actions -- mitigated by structured input normalization and temperature 0.

**Primary recommendation:** Build Prompt Assembler first (pure data gathering, zero LLM dependency, fully testable with mock data), then Oracle (thin `generateObject` wrapper), then wire both into a new `/api/chat/action` endpoint with a debug endpoint for prompt inspection.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Prompt Assembler lives in new `backend/src/engine/prompt-assembler.ts` -- clean separation from existing AI layer
- Token budgets estimated via char-based approximation (4 chars ~ 1 token), configurable max per section -- no tokenizer dependency
- Token budget overflow handled by priority-based truncation: system rules (never cut) > world premise (never cut) > recent turns (sliding window) > memories (reduce count) > lore (reduce count)
- Section budgets are dynamic per model -- different models have different context windows; store model context size in provider config, allocate proportionally
- Oracle receives structured JSON payload: `{intent, method, actorTags, targetTags, environmentTags}` -- matches mechanics.md spec
- Oracle output via Zod-validated `generateObject`: `{chance: number, reasoning: string}` -- same pattern as existing worldgen
- On Oracle call failure: fallback to 50% chance (coin flip) with warning logged -- game never blocks on Oracle failure
- D100 roll via `crypto.randomInt(1, 101)` -- already used in seed-roller.ts, cryptographically random
- Extend current routes -- add `/api/chat/action` for Oracle+Storyteller pipeline, keep existing `/api/chat` as fallback during development
- Oracle result shown in UI in a collapsible panel above narrative -- player sees chance%, tier, and reasoning
- Dev-only debug endpoint `GET /api/debug/prompt?action=...` returns compiled prompt with section sizes
- Tick counter stored as `currentTick` in campaign config.json, incremented per turn

### Claude's Discretion
- Internal module organization within `backend/src/engine/` (file splits, helper functions)
- Exact token budget percentages per section
- Oracle system prompt wording

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRMT-01 | Backend compiles structured prompt from 6+ sources (system rules, world premise, scene, player state, NPC state, lore context, retrieved memories, recent conversation, action result) | Prompt Assembler gathers from SQLite (players, npcs, locations, items, factions, relationships, chronicle tables), LanceDB (lore_cards table), and disk (chat_history.json, config.json). All data access patterns verified in existing codebase. |
| PRMT-02 | Each prompt section has a hard token budget; total prompt fits within model context window | 4-char approximation function, priority-ordered sections with configurable budgets, dynamic allocation based on model context window size. |
| PRMT-05 | Lore cards retrieved by keyword + vector similarity are injected as [LORE CONTEXT] block (2-3 most relevant per turn) | Existing `searchLoreCards()` in `src/vectors/lore-cards.ts` does cosine similarity search. Needs embedding of the player action text to get query vector, then top 2-3 results injected. |
| ORCL-01 | Judge LLM receives action intent, actor tags, target tags, environment tags and returns structured JSON with chance (0-100) and reasoning | `generateObject` with Zod schema `{ chance: z.number().min(0).max(100), reasoning: z.string() }`. Uses Judge role from settings (already configured with providerId, model, temperature, maxTokens). |
| ORCL-02 | Backend rolls D100 against Oracle's chance value to determine 3-tier outcome (Strong Hit / Weak Hit / Miss) | `crypto.randomInt(1, 101)` (proven pattern from seed-roller.ts). Thresholds: Strong Hit = roll <= chance * 0.5, Weak Hit = roll <= chance, Miss = roll > chance. |
| ORCL-03 | Oracle uses temperature 0.0 for consistent rulings | Override temperature to 0 in the Oracle call regardless of Judge role settings. |
| ORCL-04 | Soft-fail system -- Oracle never returns chance=0; even absurd actions get a near-zero probability | System prompt instructs Oracle to never return 0. Zod schema uses `z.number().min(1).max(99)` to enforce at schema level. Backend clamps as safety net. |
| ORCL-05 | Oracle result (chance, outcome tier, reasoning) is passed to Storyteller for narration | Oracle result formatted as `[ACTION RESULT]` block in the Storyteller prompt per mechanics.md template. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | ^6.0.106 | `generateObject` for Oracle structured output | Already used throughout worldgen. Same pattern: Zod schema + model + prompt = validated JSON. |
| `@ai-sdk/openai` | ^3.0.37 | Model creation for all providers | Already used. `createModel()` wraps OpenAI-compatible endpoints. |
| `drizzle-orm` | (installed) | Query SQLite for player/NPC/location/item/faction/relationship/chronicle data | Already used. All 8 tables have Drizzle schemas defined. |
| `@lancedb/lancedb` | (installed) | Vector search for lore cards | Already used. `searchLoreCards()` exists and works. |
| `zod` | (installed) | Schema validation for Oracle output | Already used everywhere. |

### No New Dependencies Needed

This phase requires zero new npm packages. Everything builds on existing infrastructure:
- `generateObject` for Oracle (same as worldgen scaffold generation)
- Drizzle queries for state gathering (same as existing routes)
- LanceDB search for lore retrieval (same as existing lore endpoints)
- `crypto.randomInt` for D100 roll (same as seed-roller.ts)

## Architecture Patterns

### Recommended Project Structure

```
backend/src/engine/           <- NEW directory
├── index.ts                  <- exports
├── prompt-assembler.ts       <- gathers context, formats prompt, enforces budgets
├── oracle.ts                 <- wraps Judge LLM call + D100 roll + outcome resolution
├── token-budget.ts           <- estimateTokens(), allocateBudgets(), truncateToFit()
└── __tests__/
    ├── prompt-assembler.test.ts
    ├── oracle.test.ts
    └── token-budget.test.ts
```

### Pattern 1: Prompt Assembler as Pure Data Coordinator

**What:** The Prompt Assembler gathers data from multiple sources (SQLite, LanceDB, disk) and formats it into a structured prompt string. It has no LLM logic -- it only reads and formats.

**When to use:** Before every LLM call that needs game context (Oracle, Storyteller in Phase 2, NPC agents in Phase 6).

**Key design:**
```typescript
// Section definitions with priority and budget
interface PromptSection {
  name: string;
  priority: number;           // lower = higher priority (never cut)
  content: string;
  estimatedTokens: number;
  canTruncate: boolean;       // false for system rules + world premise
}

// Assemble returns sections in priority order
interface AssembledPrompt {
  sections: PromptSection[];
  totalTokens: number;
  budgetUsed: number;         // percentage of model context
  formatted: string;          // final prompt string
}
```

**Data sources mapped to sections:**
| Section | Source | Priority | Can Truncate |
|---------|--------|----------|-------------|
| System Rules | Hardcoded template | 0 (highest) | No |
| World Premise | `config.json` via `readCampaignConfig()` | 1 | No |
| Scene (location + entities) | SQLite: `locations`, `npcs`, `items` tables | 2 | No |
| Player State | SQLite: `players` table | 3 | No |
| NPC States (in scene) | SQLite: `npcs` + `relationships` tables | 4 | Yes (reduce NPC count) |
| Action Result | Oracle output (when available) | 5 | No |
| Lore Context | LanceDB: `searchLoreCards()` | 6 | Yes (reduce card count) |
| Recent Conversation | `chat_history.json` | 7 | Yes (sliding window) |

### Pattern 2: Oracle as generateObject Wrapper

**What:** The Oracle wraps a `generateObject` call to the Judge LLM with a specific Zod schema and system prompt. It adds D100 rolling and outcome tier resolution.

**When to use:** Every player action that requires probability evaluation.

**Key design:**
```typescript
// Oracle input -- structured, not free-text
interface OraclePayload {
  intent: string;            // "attack", "persuade", "sneak", etc.
  method: string;            // "with sword", "using charm", "via shadows"
  actorTags: string[];       // player's relevant tags
  targetTags: string[];      // target's tags (if any)
  environmentTags: string[]; // location tags
  sceneContext: string;      // brief scene description for grounding
}

// Oracle output -- Zod-validated
const oracleOutputSchema = z.object({
  chance: z.number().min(1).max(99),
  reasoning: z.string(),
});

// Outcome tier resolution
type OutcomeTier = 'strong_hit' | 'weak_hit' | 'miss';

interface OracleResult {
  chance: number;
  roll: number;
  outcome: OutcomeTier;
  reasoning: string;
}
```

### Pattern 3: Token Budget Estimation

**What:** Estimate token count from character count, allocate budgets proportionally to model context window.

**Key design:**
```typescript
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Default budget allocation (percentages of model context window)
// Reserve 25% for LLM response
const DEFAULT_BUDGETS = {
  systemRules: 0.05,        // ~200 tokens
  worldPremise: 0.03,       // ~120 tokens
  scene: 0.05,              // ~200 tokens
  playerState: 0.03,        // ~120 tokens
  npcStates: 0.10,          // ~400 tokens
  actionResult: 0.03,       // ~120 tokens
  loreContext: 0.08,        // ~320 tokens
  recentConversation: 0.25, // ~1000 tokens
  responseHeadroom: 0.25,   // reserved for LLM output
  // Remaining ~13% is buffer
};
```

### Pattern 4: resolveJudge() Helper

**What:** Follow the existing `resolveStoryteller()` / `resolveGenerator()` / `resolveEmbedder()` pattern to add `resolveJudge()`.

**Where:** `backend/src/routes/helpers.ts`

```typescript
export function resolveJudge(settings: Settings): ResolveResult {
  return resolveRole("Judge", settings.judge, settings.providers);
}
```

This is a one-liner that slots into the existing pattern. The `resolveRole()` private function already handles all validation.

### Anti-Patterns to Avoid

- **Free-text to Oracle:** Never send raw player text to the Oracle. Parse intent + method + tags first. This reduces tokenization variance and improves consistency (Pitfall 2 from PITFALLS.md).
- **Unbounded prompt growth:** Never add content without checking against the token budget. Every section must go through the budget allocator (Pitfall 3).
- **Hardcoded token budgets:** Budgets must scale with model context window. A 4K context model and a 128K context model need different absolute limits but similar proportions.
- **Oracle at temperature > 0:** Always force temperature 0 for Oracle, regardless of Judge role settings. This is a per-call override.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output | JSON parsing + regex extraction | `generateObject` from `ai` SDK | Handles retries, schema validation, provider differences. Already proven in worldgen. |
| Token counting | Character tokenizer library | `Math.ceil(text.length / 4)` | Good enough for budget planning. Actual tokenizers are model-specific and add ~2MB dependency. The 4-char approximation is within 20% accuracy for English text. |
| D100 dice roll | `Math.random()` | `crypto.randomInt(1, 101)` | Cryptographically random, uniform distribution, already used in seed-roller.ts. |
| Model creation | Direct API calls | `createModel()` from provider-registry.ts | Already handles all provider types (OpenAI, Anthropic, OpenRouter, local). |
| Settings resolution | Manual provider lookup | `resolveJudge()` / `resolveRole()` pattern | Validation, error messages, API key checks all handled. |

## Common Pitfalls

### Pitfall 1: Oracle Probability Inconsistency
**What goes wrong:** Same action, different wording, different probability. "I attack the guard" = 65%, "I swing at the soldier" = 40%.
**Why it happens:** LLM tokenization variance even at temp 0. Different phrasings produce different logits.
**How to avoid:** (1) Send structured payload, not free text. (2) Clamp result to nearest 5% increment. (3) System prompt should instruct Oracle to evaluate based on tags, not prose.
**Warning signs:** Same-intent actions varying by >15%.

### Pitfall 2: Token Budget Explosion
**What goes wrong:** Prompt grows unbounded as game progresses. More chat history, more NPCs, more lore.
**Why it happens:** Each section adds context independently without global coordination.
**How to avoid:** Build budget system FIRST, before building individual sections. Every section goes through budget allocation. Log section sizes per call.
**Warning signs:** Total prompt exceeding 80% of model context window.

### Pitfall 3: Lore Search Returning Empty Vectors
**What goes wrong:** `searchLoreCards()` requires a query vector (embedding), but embedding the player action text requires the Embedder role to be configured. If no Embedder is configured, lore search fails silently.
**How to avoid:** Check if Embedder is configured before attempting lore search. If not configured, skip lore section gracefully. Some campaigns may have lore cards stored without vectors (via `insertLoreCardsWithoutVectors`), in which case vector search won't work at all.
**Warning signs:** Lore section always empty in assembled prompt.

### Pitfall 4: Oracle generateObject Failure
**What goes wrong:** Cheap Judge models (8B, Haiku) may return malformed JSON that fails Zod validation. `generateObject` throws, crashing the endpoint.
**Why it happens:** Smaller models have lower tool-calling reliability.
**How to avoid:** Wrap Oracle call in try/catch. On failure, fallback to 50% chance with warning logged (per CONTEXT.md decision). Log the raw response for debugging.
**Warning signs:** Oracle error rate > 5% per provider.

### Pitfall 5: Missing Player/Location Data
**What goes wrong:** Prompt Assembler queries for player state but no player exists yet (campaign created but character not saved). Or player's `currentLocationId` is null.
**How to avoid:** Every data source query must handle null/empty gracefully. If no player exists, omit [PLAYER STATE] section. If no location, omit [SCENE] section. Log warnings but don't crash.
**Warning signs:** Null reference errors in prompt assembly.

## Code Examples

### Oracle Call Pattern (verified from existing generateObject usage in worldgen)

```typescript
import { generateObject } from "ai";
import { z } from "zod";
import { createModel } from "../ai/provider-registry.js";

const oracleOutputSchema = z.object({
  chance: z.number().min(1).max(99),
  reasoning: z.string().max(500),
});

type OracleOutput = z.infer<typeof oracleOutputSchema>;

async function callOracle(
  payload: OraclePayload,
  provider: ProviderConfig
): Promise<OracleOutput> {
  const model = createModel(provider);

  const result = await generateObject({
    model,
    schema: oracleOutputSchema,
    temperature: 0,
    prompt: formatOraclePrompt(payload),
  });

  return result.object;
}
```

### D100 Roll and Outcome Resolution (verified from seed-roller.ts pattern)

```typescript
import crypto from "node:crypto";

type OutcomeTier = "strong_hit" | "weak_hit" | "miss";

function resolveOutcome(roll: number, chance: number): OutcomeTier {
  if (roll <= chance * 0.5) return "strong_hit";
  if (roll <= chance) return "weak_hit";
  return "miss";
}

function rollD100(): number {
  return crypto.randomInt(1, 101); // 1-100 inclusive
}
```

### Drizzle Query for Scene Context (verified from existing route patterns)

```typescript
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { players, npcs, locations, items, relationships } from "../db/schema.js";

function getSceneContext(campaignId: string, locationId: string) {
  const db = getDb();

  const location = db.select().from(locations)
    .where(eq(locations.id, locationId)).get();

  const npcsAtLocation = db.select().from(npcs)
    .where(and(
      eq(npcs.campaignId, campaignId),
      eq(npcs.currentLocationId, locationId)
    )).all();

  const itemsAtLocation = db.select().from(items)
    .where(and(
      eq(items.campaignId, campaignId),
      eq(items.locationId, locationId)
    )).all();

  return { location, npcs: npcsAtLocation, items: itemsAtLocation };
}
```

### Prompt Formatting (from mechanics.md template)

```typescript
function formatStorytellerPrompt(sections: Record<string, string>): string {
  const blocks: string[] = [];

  if (sections.systemRules)
    blocks.push(`[SYSTEM RULES]\n${sections.systemRules}`);
  if (sections.worldPremise)
    blocks.push(`[WORLD PREMISE]\n${sections.worldPremise}`);
  if (sections.scene)
    blocks.push(`[SCENE]\n${sections.scene}`);
  if (sections.playerState)
    blocks.push(`[PLAYER STATE]\n${sections.playerState}`);
  if (sections.npcStates)
    blocks.push(`[NPC STATE]\n${sections.npcStates}`);
  if (sections.loreContext)
    blocks.push(`[LORE CONTEXT]\n${sections.loreContext}`);
  if (sections.recentConversation)
    blocks.push(`[RECENT CONVERSATION]\n${sections.recentConversation}`);
  if (sections.actionResult)
    blocks.push(`[ACTION RESULT]\n${sections.actionResult}`);

  return blocks.join("\n\n");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `streamText` without context assembly | Structured prompt assembly with token budgets | This phase | Every LLM call gets properly assembled context instead of just worldPremise + chatHistory |
| Direct storyteller call | Oracle evaluation -> D100 roll -> Storyteller narration | This phase | Player actions get probability evaluation before narration |
| No Judge role usage | Judge role used for Oracle at temperature 0 | This phase | Judge role (already in settings) gets its first production use |

## Open Questions

1. **Model context window size storage**
   - What we know: CONTEXT.md says "store model context size in provider config, allocate proportionally"
   - What's unclear: Where exactly to store it. The `ProviderConfig` interface currently has `id, name, baseUrl, apiKey, model`. Adding `contextWindow` would require a shared type change.
   - Recommendation: Add optional `contextWindow?: number` to provider config in shared types. Default to 8192 if not set. This is a minor shared type extension, not a schema migration.

2. **Oracle system prompt wording**
   - What we know: Marked as "Claude's Discretion" in CONTEXT.md. Must instruct Oracle to evaluate tags, never return 0, provide reasoning.
   - What's unclear: Exact wording that produces consistent probabilities across models.
   - Recommendation: Start with a concise prompt (~200 tokens) that emphasizes tag-based evaluation. Iterate based on testing. Include 1-2 few-shot examples of Oracle input/output.

3. **Lore retrieval without Embedder**
   - What we know: `searchLoreCards()` requires a query vector. Getting a query vector requires the Embedder role.
   - What's unclear: How to handle campaigns where Embedder is not configured or lore was stored without vectors.
   - Recommendation: If Embedder not configured, skip lore section entirely. Log a debug message. The prompt still works without lore -- it's a "nice to have" section.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (installed in backend) |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx vitest run src/engine/__tests__/ --reporter=verbose` |
| Full suite command | `cd backend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRMT-01 | Prompt assembler gathers from 6+ sources | unit | `cd backend && npx vitest run src/engine/__tests__/prompt-assembler.test.ts -x` | Wave 0 |
| PRMT-02 | Token budgets enforced per section, total fits context | unit | `cd backend && npx vitest run src/engine/__tests__/token-budget.test.ts -x` | Wave 0 |
| PRMT-05 | Lore cards injected as [LORE CONTEXT] block | unit | `cd backend && npx vitest run src/engine/__tests__/prompt-assembler.test.ts -t "lore" -x` | Wave 0 |
| ORCL-01 | Oracle returns structured JSON with chance + reasoning | unit | `cd backend && npx vitest run src/engine/__tests__/oracle.test.ts -t "structured" -x` | Wave 0 |
| ORCL-02 | D100 roll resolves 3-tier outcome correctly | unit | `cd backend && npx vitest run src/engine/__tests__/oracle.test.ts -t "outcome" -x` | Wave 0 |
| ORCL-03 | Oracle uses temperature 0.0 | unit | `cd backend && npx vitest run src/engine/__tests__/oracle.test.ts -t "temperature" -x` | Wave 0 |
| ORCL-04 | Oracle never returns chance=0 (schema enforces min=1) | unit | `cd backend && npx vitest run src/engine/__tests__/oracle.test.ts -t "soft-fail" -x` | Wave 0 |
| ORCL-05 | Oracle result formatted into Storyteller prompt | unit | `cd backend && npx vitest run src/engine/__tests__/prompt-assembler.test.ts -t "action result" -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx vitest run src/engine/__tests__/ --reporter=verbose`
- **Per wave merge:** `cd backend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/engine/__tests__/prompt-assembler.test.ts` -- covers PRMT-01, PRMT-02, PRMT-05, ORCL-05
- [ ] `backend/src/engine/__tests__/oracle.test.ts` -- covers ORCL-01, ORCL-02, ORCL-03, ORCL-04
- [ ] `backend/src/engine/__tests__/token-budget.test.ts` -- covers PRMT-02

## Sources

### Primary (HIGH confidence)
- Existing codebase: `backend/src/ai/storyteller.ts` -- current `callStoryteller` pattern with `streamText`
- Existing codebase: `backend/src/worldgen/scaffold-generator.ts` -- `generateObject` pattern with Zod schemas
- Existing codebase: `backend/src/worldgen/seed-roller.ts` -- `crypto.randomInt()` pattern
- Existing codebase: `backend/src/vectors/lore-cards.ts` -- `searchLoreCards()` vector search pattern
- Existing codebase: `backend/src/routes/helpers.ts` -- `resolveRole()` / `resolveStoryteller()` pattern
- Existing codebase: `backend/src/db/schema.ts` -- all 8 table schemas
- Design doc: `docs/mechanics.md` -- Oracle flow, prompt template, tool system spec
- Design doc: `docs/memory.md` -- prompt assembly template, data architecture

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` -- component boundaries, data flow, prompt assembly detail
- `.planning/research/PITFALLS.md` -- Oracle inconsistency (Pitfall 2), token budget explosion (Pitfall 3)
- `.planning/research/STACK.md` -- no new deps needed confirmation

### Tertiary (LOW confidence)
- Token estimation accuracy (4 chars ~ 1 token) -- varies by model/language. Good enough for English, may undercount for CJK or code blocks. Flag for validation if used with non-English-heavy content.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- everything is already installed and proven in the codebase
- Architecture: HIGH -- follows existing patterns (generateObject, Drizzle queries, LanceDB search), new directory structure is straightforward
- Pitfalls: HIGH -- Oracle inconsistency and token budget issues are well-documented in project research

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- no fast-moving dependencies)
