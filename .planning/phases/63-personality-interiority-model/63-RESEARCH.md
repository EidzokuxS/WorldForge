# Phase 63: Personality Interiority Model — Research

**Researched:** 2026-04-18
**Domain:** Character identity schema + prompt assembly + ingestion pipeline + UI + data migration
**Confidence:** HIGH (all findings verified against source at file:line; no guessing)
**Planner consumer:** `/gsd:plan-phase 63`

---

<user_constraints>
## User Constraints (from 63-CONTEXT.md)

### Locked Decisions
- Add `personality: CharacterPersonality` block to `CharacterIdentityDraft` with fields: `summary`, `voice`, `decisionStyle`, `worldview`, `internalContradictions[]`, `personalMythology`, `sampleLines[]`.
- Remove from `behavioralCore`: `motives`, `pressureResponses`, `taboos`. Keep `selfImage`, `attachments`, `hardConstraints`. `attachments` becomes **mutable runtime field** (written by `updates`/`liveDynamics` flow).
- Remove from `capabilities`: `traits`, `flaws`. Remove `legacyTags` entirely from `provenance`.
- Keep unchanged: `baseFacts.biography`, `hardConstraints`, `selfImage`, `liveDynamics.*`, `profile.*`, `starting.*`, `runtime`, `loadout`, `socialStatus`, `capabilities.{skills,specialties,wealthTier}`, `motivations.{beliefs,drives,frictions}`.
- All 4 ingestion paths (V2/V3 import, parse-description, generate, archetype-research) MUST emit `personality` block.
- Prompt assembler `buildRuntimeIdentityLines` (`backend/src/engine/prompt-assembler.ts:1375-1420`) — replace `Behavioral Core: motives | pressure | taboos | attachments | self-image` line with a `Personality:` block; keep `Base Facts` and `Live Dynamics` intact.
- Basic NPC card gets a new **PERSONALITY** section between Tags and Power Stats; collapsible details for `sampleLines`, `decisionStyle`, `worldview`, `internalContradictions`, `personalMythology`; always-visible `summary` + `voice`.
- Advanced inspector (`character-record-inspector.tsx`): remove Identity Core `motives/taboos/pressureResponses` blocks; remove Capabilities `traits/flaws`; remove Provenance section entirely (metadata moves to Raw JSON tab only).
- Migration = **LLM-pack backfill** via one-shot script `backend/src/scripts/backfill-personality.ts`. Idempotent (skip NPCs with non-empty `personality.summary`). Batched 5-10 parallel via `generateObject`. Structured per-NPC logs (Phase 58 pattern).
- Deprecation strategy: removed fields marked `.optional()` in Zod for backward READ compat during migration window. **Writing** stops at Phase 63 start. Final removal deferred to follow-up cleanup phase (64+).
- Schema storage: extend existing `characterRecord` JSON column on `npcs` + `players`. No new SQL columns. Drizzle migration only if a strict schema validation check depends on shape (research below confirms: **no migration file needed** — the JSON column is schema-less from Drizzle's POV).

### Claude's Discretion
- Exact Zod validations (min/max string lengths, max array sizes). Defaults proposed below.
- `personality.summary` source during backfill: synthesized from `biography + behavioralCore + profile.personaSummary + motivations + socialRole`.
- Migration script error-handling: per-NPC isolation, retry, dry-run flag, progress reporter format.
- Specific shadcn components for the UI PERSONALITY section.
- Test-file names and assertion shape (concrete proposals below).

### Deferred Ideas (OUT OF SCOPE)
- Voice-consistency runtime checker (storyteller responses vs. `personality.voice`) — **separate observability phase**.
- `personality.internalContradictions` ↔ `liveDynamics.beliefDrift` evolution mechanic — **separate design phase**.
- Global character DB (cross-campaign personality reuse) — **separate phase**, referenced in `memory/project_power_profile_redesign.md`.
- Final removal of `motives/taboos/pressureResponses/traits/flaws/legacyTags` from Zod — **follow-up cleanup phase 64+**. Phase 63 leaves them `.optional()`.
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 63 is a stub in ROADMAP.md (`Plans: 0 plans`, `TBD`) with no pre-mapped IDs in REQUIREMENTS.md. REQUIREMENTS.md currently ends at **P62-R5** and the Traceability table has no Phase 63 rows.

**Recommended new requirement IDs** (planner should add to REQUIREMENTS.md `## v1.1 Requirements` under a new `### Phase 63 — Personality Interiority Model` heading, then back-fill the Traceability table):

| Proposed ID | Description | Research Support |
|-------------|-------------|------------------|
| **P63-R1** | `CharacterPersonality` block present on every `CharacterIdentityDraft` produced by all 4 ingestion paths (parse / generate / research / import). Every field non-empty when source material is non-trivial; `sampleLines[]` length ≥ 2 and ≤ 3. | Synthesizer + researcher + richCharacterSchema extension (Section 4). |
| **P63-R2** | Prompt assembler runtime identity block emits a `Personality:` section with `summary / voice / decision-style / worldview / internal-contradictions / personal-mythology / sample-lines` and no longer emits `motives / pressure / taboos`. `attachments` stays but reads from `liveDynamics.attachments` (not `behavioralCore.attachments`). | Prompt assembler:1375-1420 + golden-test rewrite (Section 3). |
| **P63-R3** | V2/V3 card import maps `card.personality` → `personality.summary` and parses `card.mes_example` `{{char}}` turns → `personality.sampleLines` (2-3, ≥20 chars, no OOC markers). LLM-pass derives `voice / decisionStyle / worldview / internalContradictions / personalMythology`. | V2 parser extension + mes_example parsing algorithm (Section 5). |
| **P63-R4** | Basic NPC card (`npcs-section.tsx`) renders a PERSONALITY section between Tags and PowerStats. `summary` + `voice` always visible; `sampleLines / decisionStyle / worldview / internalContradictions / personalMythology` reveal via a collapsible control. | UI change set (Section 6). |
| **P63-R5** | Advanced inspector (`character-record-inspector.tsx`) no longer renders blocks for `motives / pressureResponses / taboos / traits / flaws / legacyTags`. Provenance section is removed (metadata only reachable via Raw JSON tab). | UI change set (Section 6). |
| **P63-R6** | Backfill script (`backend/src/scripts/backfill-personality.ts`) populates `personality` on every pre-existing player + NPC row with empty `personality.summary`, in batches of 5-10 parallel `generateObject` calls, with idempotency check, per-record structured logs, and a `--dry-run` flag. | Migration architecture (Section 7). |
| **P63-R7** | Zod schemas accept the new `personality` block and keep `motives / pressureResponses / taboos / traits / flaws / legacyTags` as `.optional()` reads during the migration window. All 4 ingestion route Zod contracts pass with personality-enabled payloads. | Schema migration (Section 2). |
| **P63-R8** | NPC runtime prompts (`npc-agent.ts:425-442`, `npc-offscreen.ts:79-93`) and reflection prompt (`reflection-agent.ts:137`) read from `personality.*` instead of `behavioralCore.motives / pressureResponses / taboos`. | GitNexus impact report (Section 8). |

**Note on requirement scope:** Backfill (P63-R6) is a one-time data operation, but it is a real requirement because an unbackfilled NPC renders with an empty PERSONALITY section on the basic card, which the user will see as a regression from the current `behavioralCore` display. Planner MUST schedule it inside Phase 63, not defer.
</phase_requirements>

---

## 1. Goal Restated

Replace the flat V2-tag-like behavioral model (`behavioralCore.motives/taboos/pressureResponses` + `capabilities.traits/flaws` + `provenance.legacyTags`) with a V2-SillyTavern-style personality interiority block (`summary / voice / decisionStyle / worldview / internalContradictions / personalMythology / sampleLines`). The change shifts the LLM from **enacting** a character-by-tag-list to **embodying** a character-by-interiority. The block flows through all 4 ingestion paths, replaces a specific region of the runtime prompt, surfaces in both the basic NPC card and the advanced inspector, and requires an LLM-packed backfill migration for every pre-existing character record in SQLite `characterRecord` JSON columns. No phased rollout — single execution, full scope. Deprecated fields stay `.optional()` for one phase window; final removal is a follow-up cleanup phase.

---

## 2. Schema Migration Approach

### 2.1 Storage reality — no SQL migration required

- `backend/src/db/schema.ts:147` — `players.characterRecord text('character_record').notNull().default('{}')` is an opaque JSON TEXT column. Drizzle does not validate its shape.
- `backend/src/db/schema.ts:169` — `npcs.characterRecord text('character_record').notNull().default('{}')` — same pattern.
- `backend/drizzle/meta/_journal.json` + `0000_wild_sphinx.sql` through `0008_dusty_tana_nile.sql` — existing migrations all manipulate columns, not JSON content. **No new Drizzle migration file is needed for Phase 63.**

**Implication:** the schema change is entirely in Zod (`backend/src/routes/schemas.ts:380-426`) + TypeScript interfaces (`shared/src/types.ts:280-326`). Data migration happens at the application layer via the backfill script; there is no DDL.

### 2.2 Type additions (`shared/src/types.ts`)

Add after `CharacterIdentityLiveDynamics` (line 307):

```ts
export interface CharacterPersonality {
  summary: string;                      // 1-2 sentences, essence
  voice: string;                        // register/rhythm/metaphor/what avoided — prose, not bullets
  decisionStyle: string;                // impulsive|analytical|intuitive|planned (prose with example)
  worldview: string;                    // cynic|idealist|pragmatist|mystic (prose)
  internalContradictions: string[];     // 2-3 items, "Believes X but acts Y because Z"
  personalMythology: string;            // 1 sentence, first-person or narrative
  sampleLines: string[];                // 2-3 actual quotes in character's voice
}
```

Extend `CharacterIdentityDraft` (line 318):
```ts
export interface CharacterIdentityDraft {
  // ... existing fields unchanged
  personality?: CharacterPersonality;   // optional during migration window
}
```

Extend `CharacterDraftPatch` (line 451):
```ts
identity?: Partial<Omit<CharacterIdentityDraft, "baseFacts" | "behavioralCore" | "liveDynamics" | "personality">> & {
  baseFacts?: Partial<CharacterIdentityBaseFacts>;
  behavioralCore?: Partial<CharacterIdentityBehavioralCore>;
  liveDynamics?: Partial<CharacterIdentityLiveDynamics>;
  personality?: Partial<CharacterPersonality>;
};
```

Export from `shared/src/index.ts:38-42` block (add `CharacterPersonality` alongside `CharacterIdentityBehavioralCore`).

### 2.3 Zod schema (`backend/src/routes/schemas.ts`)

Insert between `characterIdentityLiveDynamicsSchema` (line 396) and `characterIdentityDraftSchema` (line 403):

```ts
const characterPersonalitySchema = z.object({
  summary: z.string().max(400).default(""),
  voice: z.string().max(600).default(""),
  decisionStyle: z.string().max(400).default(""),
  worldview: z.string().max(400).default(""),
  internalContradictions: z.array(z.string().max(300)).max(5).default([]),
  personalMythology: z.string().max(400).default(""),
  sampleLines: z.array(z.string().max(300)).min(0).max(3).default([]),
});
```

Extend `characterIdentityDraftSchema` (line 403) — add after `liveDynamics`:
```ts
personality: characterPersonalitySchema.optional(),
```

**Leave existing** `motives / pressureResponses / taboos` inside `characterIdentityBehavioralCoreSchema` (line 388) — do NOT mark each inner field `.optional()`. Instead, make the whole `behavioralCore` object optional at the draft level by changing `.default({...})` to `.optional()` on `characterIdentityDraftSchema`. This is the backward-compat read path. Same treatment for `capabilities.traits/flaws` (line 463, 465) and `provenance.legacyTags` (line 597):
- `traits: z.array(z.string()).default([])` → `traits: z.array(z.string()).optional()`
- `flaws: z.array(z.string()).default([])` → `flaws: z.array(z.string()).optional()`
- `legacyTags: z.array(z.string()).default([])` → `legacyTags: z.array(z.string()).optional()`

### 2.4 Record adapter normalization (`backend/src/character/record-adapters.ts`)

- Line 154: `normalizeBehavioralCore()` continues to populate the legacy-read shape (for old records during migration window). Do NOT delete — reading old records must still produce a `behavioralCore` object so `npc-agent.ts:425-442` + `npc-offscreen.ts:79-93` + `reflection-agent.ts:137` keep working until Phase 63 retires them in parallel.
- Add `normalizePersonality()` (new function, ~lines 230-260 region): when `record.identity.personality` is undefined but legacy fields exist, return `{ summary: profile.personaSummary ?? "", voice: "", ... }` sentinel so `.summary === ""` marks "needs backfill". Do NOT attempt on-the-fly LLM synthesis — that happens only in the backfill script.
- Line 154-195 (`normalizeCharacterDraftRecord`): add `personality: normalizePersonality(record)` to the returned `identity` object.

### 2.5 `attachments` becomes live runtime

Move `attachments` from `behavioralCore` to `liveDynamics` conceptually — but keep the shape for compat reads. Concrete change:
- `shared/src/types.ts:302-307` `CharacterIdentityLiveDynamics` — add `attachments: string[]`.
- `backend/src/routes/schemas.ts:396-401` `characterIdentityLiveDynamicsSchema` — add `attachments: z.array(z.string()).default([])`.
- `CharacterIdentityBehavioralCore.attachments` stays but is now read-only shadow from `liveDynamics.attachments` during `normalizeBehavioralCore()`. Reflection tool `reflection-tools.ts:322-327` (which writes `behavioralCore.attachments`) must switch to writing `liveDynamics.attachments`.

---

## 3. Prompt Assembler Change Set

### 3.1 Primary target

`backend/src/engine/prompt-assembler.ts:1375-1420` — `buildRuntimeIdentityLines()`. Specifically lines 1394-1402 (the "Behavioral Core" block):

**Current (lines 1394-1402):**
```ts
[
  formatIdentityField("motives", behavioralCore?.motives ?? []),
  formatIdentityField("pressure", behavioralCore?.pressureResponses ?? []),
  formatIdentityField("taboos", behavioralCore?.taboos ?? []),
  formatIdentityField("attachments", behavioralCore?.attachments ?? []),
  behavioralCore?.selfImage ? `self-image=${behavioralCore.selfImage}` : null,
]
```

**Replacement:**
Introduce a parallel `buildPersonalityLines()` helper and rename section label from `Behavioral Core` → `Personality` (line 1415). New block:
```
Personality:
  summary: "…"
  voice: "…"
  decision-style: "…"
  worldview: "…"
  internal-contradictions: […]
  personal-mythology: "…"
  sample-lines: ["…", "…"]
self-image: "…"                    ← kept from behavioralCore.selfImage
attachments: […]                   ← now from liveDynamics.attachments
hard-constraints: […]              ← kept from baseFacts.hardConstraints
```

The `formatted` block on lines 1413-1418 needs a new `Personality:` line prepended before `Base Facts`:
```ts
const formatted = [
  lines[0] ? `${indent}Base Facts: ${lines[0]}` : null,
  lines[1] ? `${indent}Personality: ${lines[1]}` : null,      // was "Behavioral Core"
  lines[2] ? `${indent}Live Dynamics: ${lines[2]}` : null,
].filter(...)
```

### 3.2 Call sites that use `buildRuntimeIdentityLines`

- `prompt-assembler.ts:503` — player identity in turn prompt
- `prompt-assembler.ts:814` — NPC identity in turn prompt (nested with indent)

Both are **automatically updated** by the helper change; no extra edits needed at these call sites.

### 3.3 Golden test rewrite cost

**Good news:** `backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts` is a **misleading filename** — it tests only `buildPowerStatsLine()` (95 lines, zero assertions on behavioralCore). **Zero rewrite cost there.**

**`backend/src/engine/__tests__/prompt-assembler.test.ts`** — grep confirmed: **zero mentions of `motives / taboos / pressureResponses / behavioralCore / Behavioral Core`**. So the main prompt assembler suite does not currently pin the behavioralCore output shape. **Zero rewrite cost there either.**

**Actual golden-test rewrite cost: LOW.** New tests must be ADDED to cover the new `Personality:` block (not rewritten).

**Proposed new test file:** `backend/src/engine/__tests__/prompt-assembler.personality.test.ts`
- Asserts `buildRuntimeIdentityLines()` emits `Personality:` line when `record.identity.personality` is populated.
- Asserts the block is omitted when all 7 personality fields are empty.
- Asserts `attachments` renders from `liveDynamics.attachments` (not `behavioralCore.attachments`).
- Asserts legacy records (no `personality` field) emit a degraded-but-non-empty `Personality:` block fed from `normalizePersonality()` fallback, OR none at all (decision — see Open Questions).

### 3.4 Other NPC runtime prompt surfaces

These also read `behavioralCore.motives / pressureResponses / taboos` and MUST be updated in parallel (otherwise new characters written without those fields will render blank NPC-agent prompts):

- `backend/src/engine/npc-agent.ts:425-442` — `formatNpcIdentityList("Enduring motives"|"Pressure responses"|"Taboos", …)`. Replace with `Personality:` lines in same format.
- `backend/src/engine/npc-offscreen.ts:79-93` — same three lines. Same replacement.
- `backend/src/engine/reflection-agent.ts:137` — `Current behavioral core: motives=[...]; pressure=[...]; self-image=...`. Replace with `Current personality: summary=...; voice=...; contradictions=[...]; self-image=...`.
- `backend/src/engine/reflection-agent.ts:151` — copy `promote_identity_change` hint: change `behavioralCore or baseFacts` to `personality or baseFacts`.
- `backend/src/engine/reflection-tools.ts:295-328` — the `promote_identity_change` tool currently writes `behavioralCore.{motives, pressureResponses, taboos, attachments, selfImage}`. Rewrite to write `personality.*` and `liveDynamics.attachments`. `selfImage` stays on `behavioralCore.selfImage`.

### 3.5 Prompt-contract string constants (`backend/src/character/prompt-contract.ts`)

- Line 17 `RICHER_IDENTITY_TRUTH_RULE` — reword "baseFacts + behavioralCore define who" → "baseFacts + personality define who".
- Line 26 `FLAT_OUTPUT_ADAPTER_RULE` — "Do NOT emit nested baseFacts, behavioralCore, liveDynamics" → add `personality` to the excluded list (the synthesizer still wants flat input for these).
- Line 29 `DETERMINISTIC_MAPPING_RULE` — "enduring motives, self-image, attachments, and pressure cues feed behavioralCore" → rewrite as "interiority cues (summary/voice/decisionStyle/worldview/contradictions/mythology/quotes) feed personality; self-image and hard-constraints remain on behavioralCore/baseFacts".

All three constants are pinned by `backend/src/character/__tests__/generator.test.ts:106-109` + `npc-generator.test.ts:78,112` — **tests MUST be updated in the same plan**. Low cost: 4 assertions total across 2 files.

---

## 4. Ingestion Pipeline Change Set Per Entry Point

All 4 paths funnel through `backend/src/character/ingestion/pipeline.ts` (111 lines) which calls `synthesizeDraftFromSources()` in `synthesizer.ts`. **The single source of truth for the LLM's output shape is `richCharacterSchema` in `backend/src/character/generator.ts:42-77`.** This is shared by all 4 routes via `synthesizer.ts:158`.

### 4.1 Shared synthesizer contract — PRIMARY CHANGE

Extend `richCharacterSchema` (`generator.ts:42-77`) — add after line 77:
```ts
  // Personality interiority (Phase 63)
  personalitySummary: z.string().max(400).default(""),
  personalityVoice: z.string().max(600).default(""),
  personalityDecisionStyle: z.string().max(400).default(""),
  personalityWorldview: z.string().max(400).default(""),
  personalityContradictions: z.array(z.string().max(300)).max(3).default([]),
  personalityMythology: z.string().max(400).default(""),
  personalitySampleLines: z.array(z.string().max(300)).min(2).max(3).default([]),
```

**Why flat keys:** the `FLAT_OUTPUT_ADAPTER_RULE` (`prompt-contract.ts:26`) bans nested `personality` in LLM output. `toCharacterDraftFromRich()` (`generator.ts:129`) + `fromRichParsedCharacter()` (`record-adapters.ts`) lift the flat keys into `identity.personality`. Same pattern as existing `drives/frictions/shortTermGoals → motivations.*`.

Extend `buildFlatOutputStrategy()` (`generator.ts:79-95`) — add bullet:
```
- Use personalitySummary, personalityVoice, personalityDecisionStyle, personalityWorldview, personalityContradictions, personalityMythology, personalitySampleLines to author interiority. These lift into identity.personality. MUST produce at least 2 sampleLines that are actual quotable sentences in character's voice, not descriptions.
```

Update `toCharacterDraftFromRich()` (`generator.ts:129-148`) — pass personality fields through `fromRichParsedCharacter()`.

Update `fromRichParsedCharacter()` (`record-adapters.ts` — search for definition) to map flat personality keys → `identity.personality`.

### 4.2 Path-specific diffs

| Path | File | Change | Model role |
|------|------|--------|-----------|
| **Parse description** (`parse-character` route) | `character/generator.ts:150-210` `parseCharacterDescription()` | Prompt template at line 186-198 mentions "drives" and "frictions" — add two bullets describing how to derive personality fields from free text. | Generator |
| **AI generate** (`generate-character` route) | `character/generator.ts:250-280` `generateCharacter()` | Prompt template at line 247-262 — add bullet "- personality*: voice + sampleLines MUST match WORLD premise tone and genre". | Generator |
| **Archetype research** (`research-character` route) | `character/archetype-researcher.ts:19-35` + synthesizer consumption in `synthesizer.ts:57-59` | `researchArchetype()` prompt (line 25) already asks for "signature traits". Extend it: `"...personality, voice samples (direct quotes if canon, paraphrased otherwise), decision style, worldview, notable contradictions, mythology phrase"`. The synthesizer's `formatResearchSection()` already consumes the returned digest — it will automatically feed the extended research into the main synthesis call. | Generator (research step itself uses `generateText` + MCP tools) |
| **V2/V3 import** (`import-v2-card` route) | `character/v2-sections.ts:1-19` + `lib/v2-card-parser.ts:1-82` + `character/ingestion/synthesizer.ts:34-48` | See Section 5 for full `mes_example` extraction. `buildV2CardSections()` must include a `SAMPLE LINES:\n- "…"\n- "…"` block so the synthesizer sees the parsed quotes. | Generator |

### 4.3 Token cost impact estimate

- Added output fields: 7 fields, avg ~60 tokens each = +420 tokens per `synthesizeDraftFromSources()` call.
- Added prompt instructions: ~200 tokens in `buildFlatOutputStrategy` + per-path bullets.
- Archetype researcher prompt extension: +80 tokens input, research digest grows by ~200 tokens.
- V2 card `SAMPLE LINES` section: +100-300 tokens depending on count.

**Net estimate:** +800-1200 tokens per ingestion call. Non-blocking on GLM-5.1 (current default, 64K context). No need to clamp.

### 4.4 Persona templates (`character/persona-templates.ts:34-55`)

`mergeDefined` pattern at lines 49-55 merges `behavioralCore`. Add parallel `personality` merging. Update `personaTemplatePatchSchema` (`schemas.ts:495-518`) to include `personality: characterPersonalitySchema.partial().optional()`.

---

## 5. V2/V3 `mes_example` Parsing Algorithm

### 5.1 Current state

`frontend/lib/v2-card-parser.ts:2-9` only extracts: `name, description, personality, scenario, tags`. **`mes_example` is NOT currently extracted.** Same for `backend/src/character/ingestion/types.ts:13-20` `V2CardPayload` — missing.

### 5.2 Required additions

Extend both `V2ImportPayload` (frontend) and `V2CardPayload` (backend ingestion) with:
```ts
mesExample: string;  // raw V2 mes_example field, empty string if absent
```

`parseV2Json()` (`v2-card-parser.ts:24-44`) — add at line 42:
```ts
mesExample: String(data.mes_example ?? ""),
```

Route payload (`backend/src/routes/character.ts` — `/import-v2-card`) — thread `mesExample` through to `V2CardPayload`.

### 5.3 `mes_example` format (SillyTavern spec)

```
<START>
{{user}}: Hello, who are you?
{{char}}: I am Ryo, last of the Saga. *bows stiffly*
{{user}}: Can you help me?
{{char}}: Perhaps. What you ask for determines what I can give.
<START>
{{user}}: Another greeting?
{{char}}: State your business.
```

Multiple `<START>` blocks. `{{user}}:` and `{{char}}:` alternate turns. `*...*` are action markers. `(OOC: ...)` and `[OOC]` blocks are out-of-character notes.

### 5.4 Proposed extractor (`backend/src/character/ingestion/mes-example-parser.ts` — NEW FILE)

```ts
export function extractSampleLinesFromMesExample(raw: string): string[] {
  if (!raw?.trim()) return [];

  // 1. Normalize line endings
  const normalized = raw.replace(/\r\n/g, "\n");

  // 2. Split on any {{char}}: / {{user}}: marker keeping context
  //    Walk line-by-line, capture only {{char}}: turns
  const charTurns: string[] = [];
  let inCharTurn = false;
  let currentBuffer: string[] = [];

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const isChar = /^\{\{char\}\}\s*:/i.test(line);
    const isUser = /^\{\{user\}\}\s*:/i.test(line);
    const isStart = /^<START>\s*$/i.test(line);

    if (isStart) {
      if (inCharTurn && currentBuffer.length) charTurns.push(currentBuffer.join(" "));
      inCharTurn = false;
      currentBuffer = [];
      continue;
    }
    if (isUser) {
      if (inCharTurn && currentBuffer.length) charTurns.push(currentBuffer.join(" "));
      inCharTurn = false;
      currentBuffer = [];
      continue;
    }
    if (isChar) {
      if (inCharTurn && currentBuffer.length) charTurns.push(currentBuffer.join(" "));
      currentBuffer = [line.replace(/^\{\{char\}\}\s*:\s*/i, "").trim()];
      inCharTurn = true;
      continue;
    }
    // Continuation of previous turn
    if (inCharTurn) currentBuffer.push(line);
  }
  if (inCharTurn && currentBuffer.length) charTurns.push(currentBuffer.join(" "));

  // 3. Filter: skip OOC, skip short, skip action-only, prefer long
  const cleaned = charTurns
    .map((t) => t.replace(/\((OOC|ooc)[^)]*\)/g, "").trim())  // strip inline OOC
    .filter((t) => !/^\[?\(?ooc/i.test(t))                     // skip OOC-start lines
    .filter((t) => t.length >= 20)                             // length threshold
    .filter((t) => !/^\*[^*]+\*\s*$/.test(t))                  // skip action-only turns

  // 4. Rank: prefer longer, with dialog (contains quoted speech OR direct speech)
  cleaned.sort((a, b) => {
    const aHasSpeech = /["'"]|\w+\s+\w+\s+\w+/.test(a);
    const bHasSpeech = /["'"]|\w+\s+\w+\s+\w+/.test(b);
    if (aHasSpeech !== bHasSpeech) return aHasSpeech ? -1 : 1;
    return b.length - a.length;
  });

  // 5. Take top 3
  return cleaned.slice(0, 3);
}
```

### 5.5 Integration

- `backend/src/character/v2-sections.ts:buildV2CardSections()` — accept `mesExample: string` and `sampleLines: string[]`. Append a `SAMPLE LINES (direct quotes from source):` section with bulleted list when `sampleLines.length > 0`.
- `backend/src/character/ingestion/synthesizer.ts:37-44` `formatCardSection()` — call `extractSampleLinesFromMesExample(card.mesExample)` and pass to `buildV2CardSections()`. Also add a merge rule after line 144-145: `"10. If PRIORITY 2 supplied SAMPLE LINES, preserve 2-3 of them verbatim in personalitySampleLines — they are the character's canonical voice."`
- Unit tests: `backend/src/character/ingestion/__tests__/mes-example-parser.test.ts` — cover (a) empty input, (b) single `<START>` block, (c) multiple blocks, (d) OOC filtering, (e) action-only filtering, (f) length filtering, (g) length ranking, (h) malformed input (no `{{char}}` markers at all → returns []).

---

## 6. UI Change Set

### 6.1 Basic NPC card — `frontend/components/world-review/npcs-section.tsx` (877 lines)

The file is large. Locate the NPC card render block (search for existing `tags` rendering and `PowerStatsSection` import). Per CONTEXT.md the new PERSONALITY section sits **between Tags and Power Stats**. Pattern matches Phase 61-62 decision: basic card owns `PowerStatsSection`, advanced inspector stays complementary.

**Insert: `frontend/components/world-review/personality-section.tsx`** (NEW shared atom, matches `power-stats-section.tsx` convention from Phase 61).

Props:
```ts
interface PersonalitySectionProps {
  personality: CharacterPersonality | undefined;
}
```

Render (always-visible + collapsible):
```tsx
<section data-shell-region="personality" className="border-t border-zinc-800 pt-3">
  <div className="flex items-center justify-between">
    <h4 className="font-serif text-sm uppercase tracking-wide text-zinc-300">Personality</h4>
    <button onClick={toggle} aria-expanded={open}>
      <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
    </button>
  </div>
  {personality?.summary && <p className="text-sm text-zinc-200">{personality.summary}</p>}
  {personality?.voice && <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Voice: {personality.voice}</p>}
  {open && (
    <div className="mt-2 space-y-2 text-sm">
      {personality?.sampleLines?.length > 0 && <SampleLinesBlock lines={personality.sampleLines} />}
      {personality?.decisionStyle && <Field label="Decision style" value={personality.decisionStyle} />}
      {personality?.worldview && <Field label="Worldview" value={personality.worldview} />}
      {personality?.internalContradictions?.length > 0 && <ListBlock label="Contradictions" items={personality.internalContradictions} />}
      {personality?.personalMythology && <Field label="Mythology" value={personality.personalMythology} />}
    </div>
  )}
</section>
```

**Reuse on player CharacterCard:** `frontend/components/character-creation/character-card.tsx` already renders `behavioralCore.selfImage` at line 110. Add `<PersonalitySection personality={draft.identity.personality} />` nearby.

### 6.2 Advanced inspector — `frontend/components/world-review/character-record-inspector.tsx` (565 lines)

**Removals (per CONTEXT.md):**

| Line | Remove |
|------|--------|
| 41, 43-46 | `hasText(d.identity?.behavioralCore?.selfImage)` + all three `hasItems(motives/pressureResponses/taboos)` + `attachments` — DELETE from `hasIdentityCore` check (but keep `hardConstraints` + `baseFacts` check) |
| 62, 65 | `hasItems(d.capabilities?.traits)` + `hasItems(d.capabilities?.flaws)` — DELETE |
| 85 | `hasItems(d.provenance?.legacyTags)` — DELETE |
| 228-231 | Identity Core render conditions — DELETE motives/pressureResponses/taboos/attachments |
| 261, 264 | Capabilities section — DELETE traits + flaws render conditions |
| 317 | Provenance section hasItems check — remove legacyTags branch |
| 373-386 | `ListBlock label="Motives" / "Pressure responses" / "Taboos" / "Attachments"` blocks — DELETE all four |
| 451, 457 | `ListBlock label="Traits" / "Flaws"` — DELETE both |
| 546 | `ListBlock label="Legacy tags"` — DELETE |
| 219, 261 (et al.) | `behavioralCore?.selfImage` — RELOCATE from removed Identity Core fields to a solo line at top of Identity Core alongside `personality.summary` |

**Also: per CONTEXT.md, remove the entire Provenance section** (not just its `legacyTags` field). Search the file for the Provenance section header and delete the section branch + its `hasItems` gate.

**Tests to update** (same plan):
- `frontend/components/world-review/__tests__/character-record-inspector.test.tsx` — currently asserts Phase 62 section order includes Provenance. Rewrite the section order assertion to 9 sections (was 10), and drop assertions on `Motives`, `Traits`, `Flaws`, `Legacy tags`, `Pressure responses`, `Taboos`, `Attachments`, the Provenance section header. P62-R2 locked the order at 10; Phase 63 changes the contract.

### 6.3 Character form editor — `frontend/components/character-creation/character-form.tsx:297-305`

The player creation form has tag-tokens for `capabilities.traits` and `capabilities.flaws`. These are user-editable inputs. Per CONTEXT.md, remove both (they duplicate Basic Tags). Delete lines 296-306 (the two `<TagTokens>` blocks).

Replace with: no equivalent PERSONALITY editor at creation time — the LLM generates `personality` during ingestion. The user edits via re-running ingestion with different `overrideText`. Document this in the plan (not a UI decision to invent an editor for).

---

## 7. Migration Script Architecture

**File path:** `backend/src/scripts/backfill-personality.ts` — **new directory `backend/src/scripts/` must be created** (doesn't exist per `ls` check above).

### 7.1 Execution pattern

Standalone Node script, invoked via:
```bash
npx tsx backend/src/scripts/backfill-personality.ts [--campaign <id>] [--dry-run] [--batch-size 5]
```

Or via `npm --prefix backend run backfill:personality`.

### 7.2 Shape

```ts
import { db } from "../db/index.js";
import { npcs, players, campaigns } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { generateObject } from "ai";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import { createLogger } from "../lib/index.js";
import { loadSettings } from "../settings/manager.js";
import { resolveRoleModel } from "../ai/resolve-role-model.js";
import { runWithTurnContext } from "../lib/logger-context.js";  // reuse Phase 58 context

const log = createLogger("backfill-personality");

const personalityPackSchema = z.object({
  summary: z.string().min(10).max(400),
  voice: z.string().min(10).max(600),
  decisionStyle: z.string().min(5).max(400),
  worldview: z.string().min(5).max(400),
  internalContradictions: z.array(z.string().min(10).max(300)).min(2).max(3),
  personalMythology: z.string().min(5).max(400),
  sampleLines: z.array(z.string().min(10).max(300)).min(2).max(3),
});

async function synthesizePersonalityFor(record: CharacterRecord, gen: ResolvedRole) {
  const prompt = buildBackfillPrompt(record);  // uses biography + behavioralCore + profile + motivations
  const result = await generateObject({
    model: createModel(gen.provider),
    schema: personalityPackSchema,
    prompt,
    temperature: gen.temperature,
  });
  return result.object;
}

async function processRow(row: NpcRow | PlayerRow, gen: ResolvedRole, dryRun: boolean) {
  const record = JSON.parse(row.characterRecord) as CharacterRecord;
  if (record.identity?.personality?.summary?.trim()) {
    log.info("skip: personality already populated", { id: row.id });
    return { status: "skipped" as const };
  }
  try {
    const pack = await synthesizePersonalityFor(record, gen);
    record.identity.personality = pack;
    if (!dryRun) {
      const table = row.kind === "npc" ? npcs : players;
      await db.update(table).set({ characterRecord: JSON.stringify(record) }).where(eq(table.id, row.id));
    }
    log.info("backfilled", { id: row.id, kind: row.kind, dryRun });
    return { status: "written" as const };
  } catch (error) {
    log.error("backfill failed", { id: row.id, error: String(error) });
    return { status: "failed" as const, error };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const settings = await loadSettings();
  const gen = resolveRoleModel("generator", settings);
  const allRows = await loadAllCharacterRows(args.campaignFilter);

  log.info("starting backfill", { total: allRows.length, dryRun: args.dryRun });

  // Batch in chunks of `args.batchSize` parallel
  const results = { written: 0, skipped: 0, failed: 0 };
  for (const batch of chunk(allRows, args.batchSize)) {
    const outcomes = await Promise.all(batch.map((row) =>
      runWithTurnContext({ turnId: `backfill-${row.id}`, role: "backfill" }, () =>
        processRow(row, gen, args.dryRun)
      )
    ));
    for (const o of outcomes) results[o.status]++;
    log.info("batch complete", { running: results });
  }

  log.info("backfill finished", results);
  process.exit(results.failed > 0 ? 1 : 0);
}
```

### 7.3 Design notes

- **Idempotency check (line `if (record.identity?.personality?.summary?.trim())`):** skip when summary is already non-empty.
- **Batching:** `--batch-size` defaults to 5. Each batch runs `Promise.all`. One failed NPC in a batch does NOT abort; it's logged and the loop continues (error isolation per CONTEXT.md).
- **Logging:** per Phase 58 pattern — `runWithTurnContext` wraps each row with a synthetic turn ID `backfill-<npcId>` so logs correlate. Each NPC emits `backfill.start / backfill.synthesize / backfill.write / backfill.complete` events via the standard pino logger. Log file: `campaigns/{id}/logs/backfill-{timestamp}.jsonl` (already handled by Phase 58 file destination).
- **Dry-run:** `--dry-run` flag skips the `db.update` call but still runs `generateObject`. Useful for cost estimation and prompt validation.
- **Campaign scope:** `--campaign <id>` filter so tests can bound the operation. Default: all campaigns.
- **Cost estimate:** ~1500 tokens per NPC × ~20 NPCs per campaign × 1 generateObject each. On GLM-5 rate: ~$0.002 per NPC. Negligible.

### 7.4 Backfill prompt builder

```ts
function buildBackfillPrompt(record: CharacterRecord): string {
  return `You are deriving a PERSONALITY INTERIORITY pack for an RPG character from their existing record.
Produce: summary, voice, decisionStyle, worldview, internalContradictions[2-3], personalMythology, sampleLines[2-3].

CHARACTER: ${record.identity.displayName}
BIOGRAPHY: ${record.identity.baseFacts?.biography ?? record.profile.backgroundSummary ?? "(none)"}
PERSONA: ${record.profile.personaSummary}
DRIVES: ${record.motivations.drives.join("; ") || "(none)"}
FRICTIONS: ${record.motivations.frictions.join("; ") || "(none)"}
SELF-IMAGE: ${record.identity.behavioralCore?.selfImage ?? "(none)"}
LEGACY MOTIVES: ${record.identity.behavioralCore?.motives?.join("; ") ?? "(none)"}
LEGACY PRESSURE: ${record.identity.behavioralCore?.pressureResponses?.join("; ") ?? "(none)"}
SOCIAL ROLE: ${record.identity.baseFacts?.socialRole?.join("; ") ?? record.socialContext.factionName ?? "(none)"}

RULES:
- sampleLines MUST be direct quotes ("A ty dumаl..." — actual speech), not descriptions of speech.
- internalContradictions format: "Believes X, but acts Y because Z".
- voice is prose describing vocab register, rhythm, avoided topics — not a tag list.
- personalMythology is 1 sentence, first-person or narrative ("I am the last X who remembers Y").
- If source material is thin, extrapolate sensibly from role + biography. Do NOT fabricate franchise-specific lore.
`;
}
```

---

## 8. GitNexus Impact Report

> Per CLAUDE.md mandatory impact analysis. Without running live `gitnexus_impact` (stale-index risk) the static analysis below was derived from direct grep over `backend/src/**` — it enumerates every d=1 reader. Plan MUST re-run `gitnexus_impact({target: "CharacterIdentityBehavioralCore", direction: "upstream"})` during Wave 0 to confirm nothing is missed.

### 8.1 `CharacterIdentityBehavioralCore` type — upstream readers

| File | Lines | Severity | Action |
|------|-------|----------|--------|
| `shared/src/types.ts` | 290-296, 324, 453 | d=1 | Type source — add `personality`, keep core as-is |
| `shared/src/index.ts` | 38 | d=1 | Add `CharacterPersonality` export |
| `backend/src/routes/schemas.ts` | 388-394, 413-419, 502 | d=1 | Add Zod personality, mark inner behavioralCore fields `.optional()` |
| `backend/src/engine/prompt-assembler.ts` | 1383-1399 | d=1 | Replace behavioralCore block with personality block (+ keep selfImage) |
| `backend/src/engine/npc-agent.ts` | 425-442 | d=1 | Replace motives/pressure/taboos lines with personality lines |
| `backend/src/engine/npc-offscreen.ts` | 79-93 | d=1 | Same |
| `backend/src/engine/reflection-agent.ts` | 137, 151 | d=1 | Rewrite prompt — "behavioral core" → "personality" |
| `backend/src/engine/reflection-tools.ts` | 295-328, 496 | d=1 | `promote_identity_change` writes to personality + liveDynamics.attachments |
| `backend/src/character/record-adapters.ts` | 124, 126, 154, 163, 188, 215-228, 655-683 | d=1 | Extend normalizers; add `normalizePersonality` |
| `backend/src/character/npc-generator.ts` | 28, 52, 54, 103-109 | d=1 | Extend rich schema mapping, remove behavioralCore mapping |
| `backend/src/character/persona-templates.ts` | 34, 49-55 | d=1 | Add personality merge path |
| `backend/src/character/prompt-contract.ts` | 17, 26, 29 | d=1 | Update 3 rule strings |
| `backend/src/worldgen/scaffold-steps/npcs-step.ts` | 554-558 | d=1 | Worldgen NPC generation — add personality lift |

### 8.2 Risk classification: **HIGH**

- 13 source files touched (backend); 3 files touched (frontend).
- Runtime prompt consumers on the hot path (npc-agent, npc-offscreen, reflection-agent) — wrong shape = NPCs go mute.
- Reflection tool writes to behavioralCore — if rewrite is partial, reflection silently fails.
- **Mitigation:** Keep `behavioralCore.motives/pressureResponses/taboos` reads alive via `.optional()` + `normalizeBehavioralCore()` legacy fallback during the migration window. Prompt assembler reads from `personality` FIRST, falls back to behavioralCore ONLY when personality is undefined (unbackfilled record).

### 8.3 `legacyTags` — upstream readers

| File | Lines | Action |
|------|-------|--------|
| `shared/src/types.ts` | 421 | Make optional in interface |
| `backend/src/routes/schemas.ts` | 597 | Zod `.optional()` |
| `backend/src/character/npc-generator.ts` | 139 | Stop writing |
| `frontend/components/world-review/character-record-inspector.tsx` | 85, 317, 546 | Remove from rendering |

### 8.4 `capabilities.traits` / `capabilities.flaws` — upstream readers

| File | Lines | Action |
|------|-------|--------|
| `shared/src/types.ts` | 375, 377 | Make optional |
| `backend/src/routes/schemas.ts` | 463, 465 | Zod `.optional()` |
| `backend/src/character/record-adapters.ts` | 314, 316 | Stop populating from legacy tags; use `?? []` when read |
| `frontend/components/world-review/character-record-inspector.tsx` | 62, 65, 261, 264, 451, 457 | Remove rendering |
| `frontend/components/character-creation/character-form.tsx` | 297-305 | Remove TagTokens editors |

### 8.5 `mapV2CardToCharacter` / `ingestCharacterDraft` — d=1 impact

From STATE.md Phase 60 decisions: `mapV2CardToCharacter`, `mapV2CardToNpc`, `synthesizeArchetypePowerStats` were **deleted in Phase 60-04**. Only callers are `ingestCharacterDraft`. Impact on that function is bounded to the `V2CardPayload.mesExample` field add + `synthesizer.ts:formatCardSection` integration (Section 5.5). **Risk: LOW for ingestion entry points.**

---

## 9. Test Strategy

### 9.1 New tests

| File | Assertion shape |
|------|-----------------|
| `backend/src/character/ingestion/__tests__/mes-example-parser.test.ts` | Input `<START>\n{{char}}: "Hello, traveler."` → output `["Hello, traveler."]`. 8 cases per Section 5.5. |
| `backend/src/engine/__tests__/prompt-assembler.personality.test.ts` | Given record with `identity.personality`, `buildRuntimeIdentityLines` output contains `"Personality: summary=..."` and does NOT contain `"Behavioral Core:"`. Given legacy record, emits `Personality: (legacy — see behavioralCore)` OR omits section. |
| `backend/src/character/ingestion/__tests__/synthesizer.personality.test.ts` | Mock `generateObject` to return rich draft with personality keys. Assert returned `CharacterDraft.identity.personality` matches. |
| `backend/src/scripts/__tests__/backfill-personality.test.ts` | Seed a test DB with 3 characters (one already has personality, two don't). Run script with `--dry-run`. Assert skipped=1, written=2, actual `db` unchanged. Re-run without `--dry-run`, assert DB updated. Re-run idempotently, assert skipped=3. |
| `frontend/components/world-review/__tests__/personality-section.test.tsx` | Renders `summary` + `voice` always; collapsible click reveals `sampleLines / decisionStyle / worldview / internalContradictions / personalMythology`. Empty personality → section does not render. |

### 9.2 Tests to UPDATE

| File | Change |
|------|--------|
| `backend/src/character/__tests__/generator.test.ts:106-109, 195` | Change asserted rule strings to new personality-aware wording. |
| `backend/src/character/__tests__/npc-generator.test.ts:66, 78, 112` | Drop behavioralCore.motives assertion (line 66); update rule-string assertions. |
| `backend/src/character/__tests__/persona-templates.test.ts:23-171` | Add personality merge test cases alongside existing behavioralCore merges. |
| `backend/src/character/__tests__/record-adapters.identity.test.ts:34` | Add `personality` field expectation on normalized record. |
| `backend/src/worldgen/__tests__/npcs-step.test.ts:118` | Add `personality` to `expect.objectContaining`. |
| `backend/src/engine/__tests__/npc-agent.test.ts:676` | Replace `behavioralCore` fixture setup with `personality`. |
| `backend/src/engine/__tests__/npc-offscreen.test.ts:309` | Same. |
| `frontend/components/world-review/__tests__/character-record-inspector.test.tsx` | Rewrite section-order assertion (9 sections instead of 10 — Provenance dropped). Remove all `Motives/Traits/Flaws/Legacy tags/Pressure responses/Taboos/Attachments` assertions. Add Identity Core → Personality transition assertion. |
| `frontend/components/character-creation/__tests__/character-card.identity.test.tsx` | Expect `PersonalitySection` rendered; drop behavioralCore assertions. |
| `frontend/components/world-review/__tests__/npcs-section.test.tsx` | Assert PERSONALITY section lives between Tags and Power Stats. |

### 9.3 Integration check

Add `backend/src/character/ingestion/__tests__/pipeline.personality-e2e.test.ts` — mocks `createModel` + `generateObject` to return a full rich draft with personality keys, exercises all 4 modes (parse/generate/research/import), asserts every returned `CharacterDraft.identity.personality.summary` is non-empty.

---

## 10. Validation Architecture (Nyquist Dimension 8)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (backend) + Vitest (frontend, verified via `npm --prefix frontend test`) |
| Config | `backend/vitest.config.ts`, `frontend/vitest.config.ts` (per Phase 62 script-alias fix) |
| Quick run (backend) | `npm --prefix backend test -- run prompt-assembler.personality.test.ts` |
| Quick run (frontend) | `npm --prefix frontend test -- run character-record-inspector` |
| Full suite | `npm --prefix backend test -- run && npm --prefix frontend test -- run` |

### Phase Requirements → Test Map

| Req | Behavior | Test type | Automated command | File exists? |
|-----|----------|-----------|-------------------|-------------|
| P63-R1 | `personality` on every ingested draft | integration | `backend test -- run synthesizer.personality` | ❌ Wave 0 |
| P63-R2 | Prompt assembler emits Personality block | unit snapshot | `backend test -- run prompt-assembler.personality` | ❌ Wave 0 |
| P63-R3 | `mes_example` → `sampleLines` | unit | `backend test -- run mes-example-parser` | ❌ Wave 0 |
| P63-R4 | Basic NPC card renders PERSONALITY section | RTL | `frontend test -- run personality-section` | ❌ Wave 0 |
| P63-R5 | Inspector drops deprecated fields | RTL | `frontend test -- run character-record-inspector` | ✅ Update |
| P63-R6 | Backfill script idempotency | integration | `backend test -- run backfill-personality` | ❌ Wave 0 |
| P63-R7 | Zod accepts personality; legacy fields `.optional()` | unit | `backend test -- run schemas.personality` | ❌ Wave 0 |
| P63-R8 | NPC-agent/offscreen/reflection prompts use personality | unit snapshot | `backend test -- run npc-agent.personality` + `npc-offscreen.personality` + `reflection-agent.personality` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm --prefix backend test -- run <affected-test>` — sub-10s per file.
- **Per wave merge:** Full `backend test` + `frontend test` — expect ~3-4 min combined.
- **Phase gate (before `/gsd:verify-work`):** Full suite green + manual PinchTab smoke on one NPC card rendering.

### Wave 0 Gaps
- [ ] `backend/src/character/ingestion/__tests__/mes-example-parser.test.ts` — covers P63-R3
- [ ] `backend/src/engine/__tests__/prompt-assembler.personality.test.ts` — covers P63-R2
- [ ] `backend/src/character/ingestion/__tests__/synthesizer.personality.test.ts` — covers P63-R1
- [ ] `backend/src/scripts/__tests__/backfill-personality.test.ts` — covers P63-R6
- [ ] `backend/src/scripts/` directory — doesn't exist; create with first commit
- [ ] `frontend/components/world-review/__tests__/personality-section.test.tsx` — covers P63-R4
- [ ] `backend/src/routes/__tests__/schemas.personality.test.ts` — covers P63-R7
- [ ] `backend/src/engine/__tests__/npc-agent.personality.test.ts` + `npc-offscreen.personality.test.ts` + `reflection-agent.personality.test.ts` — covers P63-R8

---

## 11. Open Questions / Risks with Defaults

Per `memory/feedback_full_autonomy.md` Claude picks autonomously. Planner can override.

| Question | Default pick | Rationale |
|----------|-------------|-----------|
| Should legacy records (no `personality`) emit a degraded Personality: block in prompts, or skip it entirely? | **Skip entirely** (render nothing until backfilled). | Partial block misleads the LLM; an empty block at least makes the gap visible. Backfill must run before user-facing play anyway. |
| Should `attachments` stay on `behavioralCore` compat-read shadow, or hard-move to `liveDynamics`? | **Shadow for one phase.** Write to `liveDynamics.attachments`; `normalizeBehavioralCore()` reads `liveDynamics.attachments ?? behavioralCore.attachments` for legacy records. | Minimizes runtime breakage; lets the cleanup phase finish the move. |
| Should `sampleLines` minimum be 2 or 3? | **2**, max 3. | Some cards have sparse `mes_example`; forcing 3 invites fabrication. 2 is sufficient to imply voice. |
| Should the backfill script run inline during Phase 63 migration, or be invoked manually by the user? | **Inline, but opt-in.** Add a `tsx` command to backend `package.json` and document in plan summary. Do NOT run automatically at server startup (risk: surprise cost + long stall). | Matches "no MVP/phases" rule: shipped code includes the tool; operator chooses when to run. |
| Should `provenance.legacyTags` be `.optional()` + kept as backward-read, or hard-deleted? | **`.optional()`.** Raw JSON tab still renders them when present; advanced inspector stops binding to them. | Deprecation window discipline. Cleanup phase deletes them. |
| Should `internalContradictions` min be 0 or 2? | **0** in Zod (allow sparse), **require 2 in prompt** (soft enforcement). | Prevents hard Zod rejection on edge cases; LLM nearly always produces ≥ 2 when prompted. |
| Do we need to update `docs/mechanics.md` + `docs/memory.md` to describe `personality`? | **Yes, but defer to a tiny doc-alignment task within Phase 63 — not a separate DOCA phase.** | DOCA-01/02/03 pattern from v1.1 shows stale docs cause future phase debt. |
| Should `dumpFullPrompts` side-car (Phase 58) snapshot new Personality block? | **Automatic** — side-car prints whatever the assembler emits, no change needed. | Already verified — the side-car reads assembled prompt text verbatim. |

### Known risks

1. **Backfill is a one-way door for existing campaigns** — once `personality` is populated and the legacy fields are read-shadowed, reverting the plan means writing a reverse migration. **Mitigation:** backfill script must support `--dry-run` AND write original record to `campaigns/{id}/logs/backfill-backup-{id}-{timestamp}.json` before updating. Add to script spec.
2. **GLM provider variance** — STATE notes GLM 4.7 Flash has structured-output issues (Phase 16 decision). Backfill relies on `generateObject` with a strict Zod schema. **Mitigation:** plan must use GLM-5 (current default), document fallback to OpenRouter for backfill-only if provider rejects schema. This does NOT violate `feedback_openrouter_embargo.md` because backfill is a one-shot operator tool, not runtime play.
3. **V2 `mes_example` wild-format edge cases** — cards in the wild sometimes use `You:` instead of `{{user}}:`, or omit `<START>`, or put `*actions*` around everything. Parser spec (Section 5.4) is permissive, but real data may still fall through. **Mitigation:** parser returns `[]` on failure; ingestion falls back to LLM-synthesized `sampleLines` from `personality` field — same pass.
4. **Prompt-contract rule strings are load-bearing on multiple tests** — changing `prompt-contract.ts` breaks 4+ test assertions simultaneously. **Mitigation:** plan treats prompt-contract + its test updates as a single task to avoid red commits.

---

## 12. Mapping to REQUIREMENTS.md

**Current state:** REQUIREMENTS.md has no Phase 63 entries (last = P62-R5). ROADMAP.md Phase 63 = `TBD`.

**Planner MUST perform both updates in the first task of the plan:**

1. **REQUIREMENTS.md — add section `### Phase 63 — Personality Interiority Model`** under `## v1.1 Requirements`, listing P63-R1 through P63-R8 with the exact descriptions from the `<phase_requirements>` block in Section 2 of this file.
2. **REQUIREMENTS.md — append 8 rows to the Traceability table** (P63-R1 → Phase 63 → Planned, etc.).
3. **ROADMAP.md — rewrite Phase 63 entry** (lines 428-436) with the goal statement from CONTEXT.md, the 8 requirement IDs, and the concrete plan list (TBD until planner decides plan decomposition).

**Suggested plan decomposition** (planner finalizes):
- **63-01:** Foundation — shared types, Zod schemas, record-adapter normalizers, prompt-contract rewrites, `backend/src/scripts/` directory + stub, docs housekeeping (REQUIREMENTS + ROADMAP edits), `mes-example-parser.ts` + unit test.
- **63-02:** Ingestion pipeline — extend `richCharacterSchema`, `buildFlatOutputStrategy`, synthesizer prompt, all 4 route prompts; update `V2CardPayload.mesExample` threading; synthesizer tests; persona-template personality merge.
- **63-03:** Engine consumers — prompt-assembler `Personality:` block, npc-agent, npc-offscreen, reflection-agent, reflection-tools (`promote_identity_change` write-path), snapshot tests.
- **63-04:** UI — new `PersonalitySection` atom, basic NPC card insertion, player CharacterCard integration, advanced inspector cleanup (drop `motives/traits/flaws/legacyTags` + entire Provenance section), character-form trait/flaw editor removal, all associated test updates.
- **63-05:** Backfill — `scripts/backfill-personality.ts` with dry-run + backup file + per-row logging + idempotency test, `npm` script wiring, one manual run on a real campaign documented in SUMMARY.
- **63-06:** Verification — full test suite, PinchTab smoke on basic NPC card rendering, 63-VALIDATION.md evidence bundle.

---

## Sources

### Primary (HIGH confidence — direct source inspection)
- `shared/src/types.ts:260-460` — canonical CharacterIdentityDraft structure
- `backend/src/engine/prompt-assembler.ts:1375-1420` — `buildRuntimeIdentityLines` target
- `backend/src/engine/npc-agent.ts:425-442`, `npc-offscreen.ts:79-93`, `reflection-agent.ts:137,151`, `reflection-tools.ts:295-328` — runtime consumer sites
- `backend/src/routes/schemas.ts:380-600` — Zod schema source of truth
- `backend/src/character/generator.ts:42-77, 79-95, 129-148` — `richCharacterSchema` and adapter
- `backend/src/character/ingestion/synthesizer.ts:1-183` — LLM priority-merge orchestrator
- `backend/src/character/ingestion/types.ts:13-20` — `V2CardPayload`
- `backend/src/character/v2-sections.ts:1-19` — V2 card section builder
- `backend/src/character/record-adapters.ts:100-270` — normalizer contracts
- `backend/src/character/prompt-contract.ts:1-77` — rule strings (test-pinned)
- `frontend/lib/v2-card-parser.ts:1-82` — current V2 parser (missing `mes_example`)
- `frontend/components/world-review/character-record-inspector.tsx:41-546` — advanced inspector removal targets
- `frontend/components/character-creation/character-card.tsx:110, 297-305` — player card + form removal targets
- `backend/src/db/schema.ts:134-184` — players/npcs JSON column storage model
- `backend/drizzle/meta/_journal.json` + `0000-0008` SQL files — confirmed no DDL needed
- `.planning/phases/58-pipeline-observability-logging/58-03-SUMMARY.md` (grep only, not fully read) — Phase 58 structured log pattern reference

### Secondary (MEDIUM confidence)
- CONTEXT.md scope + locked decisions — verbatim user TZ
- STATE.md project state — Phase 60 decisions on `mapV2Card* deletion` and pipeline shape
- SillyTavern `mes_example` spec — inferred from format patterns in `buildV2CardSections` + general knowledge (LOW on exact spec currency; parser designed permissively to handle variance)

### Tertiary (LOW confidence — flagged)
- Exact `mes_example` grammar: no authoritative spec URL consulted this pass. Parser algorithm (Section 5.4) is deliberately permissive (filters on markers + length + OOC) so edge cases degrade gracefully to empty array rather than crashing. **Recommendation:** during 63-01 Wave 0, grep for `mes_example` usage in any imported V2 card fixtures under `backend/src/character/ingestion/__tests__/fixtures/v2-*.json` to validate the parser against real data.

---

## Metadata

**Confidence breakdown:**
- Schema migration: HIGH — direct source read confirms storage is JSON-column opaque
- Prompt assembler impact: HIGH — grep found every consumer; line numbers verified
- Test rewrite cost: HIGH — read both named test files; actual cost is additive not rewrite
- V2 mes_example parser: MEDIUM — algorithm is standard text-walking but not validated against live card corpus
- GitNexus impact: MEDIUM — static grep only; plan MUST re-run live `gitnexus_impact` at Wave 0 per CLAUDE.md mandate
- Backfill architecture: MEDIUM — pattern is standard; Phase 58 logger reuse unverified end-to-end with synthetic turn IDs
- UI integration: HIGH — specific line numbers identified in both basic card and advanced inspector

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days — phase scope is stable; no fast-moving deps)
