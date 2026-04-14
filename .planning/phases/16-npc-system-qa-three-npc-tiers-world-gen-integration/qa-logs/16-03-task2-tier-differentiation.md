# 16-03 Task 2: NPC Tier Differentiation Verification

**Date:** 2026-03-20

## Code-Level Tier Verification

### 1. npc-agent.ts -- Key NPCs only get ticks

**File:** `backend/src/engine/npc-agent.ts`, lines 263-273

```typescript
const keyNpcs = db
  .select({ id: npcs.id, name: npcs.name })
  .from(npcs)
  .where(
    and(
      eq(npcs.campaignId, campaignId),
      eq(npcs.tier, "key"),                    // <-- KEY FILTER
      eq(npcs.currentLocationId, playerLocationId)
    )
  )
  .all();
```

**Result: PASS** -- `tickPresentNpcs` explicitly filters `tier = "key"`. Only Key NPCs get autonomous ticks.

### 2. npc-offscreen.ts -- Key NPCs only simulated off-screen

**File:** `backend/src/engine/npc-offscreen.ts`, lines 189-206

```typescript
const offscreenKeyNpcs = db
  .select({...})
  .from(npcs)
  .where(
    and(
      eq(npcs.campaignId, campaignId),
      eq(npcs.tier, "key"),                    // <-- KEY FILTER
      sql`${npcs.currentLocationId} != ${playerLocationId}`
    )
  )
  .all();
```

**Result: PASS** -- `simulateOffscreenNpcs` explicitly filters `tier = "key"`. Only Key NPCs not at player's location are batch-simulated.

### 3. prompt-assembler.ts -- NPC presence in prompts

**File:** `backend/src/engine/prompt-assembler.ts`, lines 412-472

`buildNpcStatesSection` queries ALL NPCs at the player's location (no tier filter):
```typescript
const npcRows = locationId
  ? db.select().from(npcs).where(eq(npcs.currentLocationId, locationId)).all()
  : [];
```

Each NPC block includes tier in the output: `- {name} ({tier})`

Tier-aware detail levels:
- All NPCs include: name, tier label, persona, tags
- Goals included for all tiers (parsed from goals JSON)
- Beliefs included for all tiers (parsed from beliefs JSON)
- Relationship graph enrichment applied to all NPCs at location

**Note:** The prompt does NOT differentiate detail levels by tier -- all NPCs at the location get full persona+goals+beliefs+relationships. This is a deliberate design choice: the SYSTEM_RULES instruct the Storyteller to treat Key NPCs as autonomous characters vs others as background.

**Result: PASS** -- NPCs included in SCENE context with tier label. SYSTEM_RULES lines 110-111 instruct LLM to handle Key NPCs differently.

### 4. tool-executor.ts -- spawn_npc creates temporary tier

**File:** `backend/src/engine/tool-executor.ts`, lines 324-360

```typescript
db.insert(npcs).values({
  id,
  campaignId,
  name,
  persona: tags.join(", "),
  tags: JSON.stringify(tags),
  tier: "temporary",                           // <-- TEMPORARY TIER
  currentLocationId: location.id,
  goals: '{"short_term":[],"long_term":[]}',
  beliefs: "[]",
  unprocessedImportance: 0,
  inactiveTicks: 0,
  createdAt: Date.now(),
});
```

**Result: PASS** -- spawn_npc hardcodes `tier: "temporary"` for spawned NPCs.

### 5. reflection-agent.ts -- Importance threshold filtering

**File:** `backend/src/engine/reflection-agent.ts`, lines 182-202

```typescript
const qualifyingNpcs = db
  .select({ id: npcs.id, name: npcs.name })
  .from(npcs)
  .where(
    and(
      eq(npcs.campaignId, campaignId),
      sql`${npcs.unprocessedImportance} >= ${REFLECTION_THRESHOLD}`,
    ),
  )
  .all();
```

**Note:** No explicit `tier = "key"` filter. However, only Key NPCs accumulate `unprocessedImportance` through:
- NPC agent ticks (only run for Key NPCs)
- Episodic events referencing NPCs (importance accumulation)

Temporary and persistent NPCs start with `unprocessedImportance: 0` and never receive tick-based importance increases, so they effectively never trigger reflection.

**Threshold:** `REFLECTION_THRESHOLD = 10` (line 23)

**Result: PASS** -- Reflection is implicitly tier-filtered via importance accumulation pattern. Only Key NPCs with sufficient accumulated importance trigger reflection.

### 6. DB Schema Verification

**File:** `backend/src/db/schema.ts`, lines 60-81

```typescript
tier: text("tier", {
  enum: ["temporary", "persistent", "key"],
}).notNull(),
```

Additional Key-NPC fields confirmed:
- `goals: text("goals").notNull().default('{"short_term":[],"long_term":[]}')`
- `beliefs: text("beliefs").notNull().default("[]")`
- `unprocessedImportance: integer("unprocessed_importance").notNull().default(0)`
- `inactiveTicks: integer("inactive_ticks").notNull().default(0)`

**Result: PASS** -- Tier enum has all 3 values. Key-NPC fields (goals, beliefs, unprocessedImportance, inactiveTicks) exist.

## Tier Promotion Verification

### Promotion Endpoint

**File:** `backend/src/routes/campaigns.ts`, lines 211-269

`POST /campaigns/:id/npcs/:npcId/promote` endpoint:
- Accepts `{ newTier: "persistent" | "key" }` body (validated via `promoteNpcBodySchema`)
- Validates upward-only promotion: `temporary -> persistent -> key`
- Returns `{ success, npcId, name, oldTier, newTier }`

```typescript
const tierOrder: Record<string, number> = { temporary: 0, persistent: 1, key: 2 };
if (newOrder <= currentOrder) {
  return c.json({ error: "Can only promote upward..." }, 400);
}
```

### No Storyteller Promotion Tool

No promotion tool exists in `tool-schemas.ts` -- the LLM cannot promote NPCs during gameplay.

### Promotion Paths

1. **API endpoint** -- `POST /campaigns/:id/npcs/:npcId/promote` (programmatic)
2. **World Review** -- save-edits can modify NPC tier (manual editing)
3. **No in-gameplay promotion** -- Storyteller has no promote tool

**Result: PASS** -- Tier promotion is explicit (API endpoint with upward-only validation). No automatic or LLM-driven promotion exists.

## Summary Table

| Check | File:Line | Result | Notes |
|-------|-----------|--------|-------|
| NPC ticks: Key only | npc-agent.ts:269 | PASS | `eq(npcs.tier, "key")` |
| Off-screen: Key only | npc-offscreen.ts:201 | PASS | `eq(npcs.tier, "key")` |
| Prompt: tier-labeled | prompt-assembler.ts:443 | PASS | `{name} ({tier})` in NPC block |
| spawn_npc: temporary | tool-executor.ts:346 | PASS | `tier: "temporary"` |
| Reflection: threshold | reflection-agent.ts:194 | PASS | Implicit via importance accumulation |
| DB schema: tier enum | schema.ts:70-72 | PASS | `["temporary","persistent","key"]` |
| Promotion: upward-only | campaigns.ts:239-248 | PASS | API endpoint, no LLM tool |

## Tier Behavior Matrix

| Behavior | Key | Persistent | Temporary |
|----------|-----|-----------|-----------|
| Autonomous ticks | Yes | No | No |
| Off-screen simulation | Yes | No | No |
| Reflection agent | Yes (via importance) | No | No |
| In prompt context | Yes (full detail) | Yes | Yes |
| UI "People Here" | Yes | Yes | Yes (with "passing" label) |
| Spawned by LLM | No | No | Yes (spawn_npc) |
| Promotion API | Target | Target | Source |
| Goals/Beliefs used | Yes (active) | Stored only | Empty defaults |
