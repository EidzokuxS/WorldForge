# Phase 64: NPC Personality Regeneration Parity — Research

**Researched:** 2026-04-19
**Domain:** Worldgen scaffold pipeline + per-NPC LLM detail call + regenerate-section endpoint + narrow data backfill
**Confidence:** HIGH (source read verified at file:line; all CONTEXT.md decisions D-01..D-16 map to verified code surfaces)
**Planner consumer:** `/gsd:plan-phase 64`

---

<user_constraints>
## User Constraints (from 64-CONTEXT.md)

### Locked Decisions (D-01..D-16)

**GA-1 Schema Extension — Option A (inline in existing detail call):**
- **D-01** Extend Zod `npcDetailSingleSchema` per-NPC detail call in `backend/src/worldgen/scaffold-steps/npcs-step.ts` with flat personality fields: `personalitySummary`, `personalityVoice`, `personalityDecisionStyle`, `personalityWorldview`, `personalityContradictions[]`, `personalityMythology`, `personalitySampleLines[]` — exact mirror of `npc-generator.ts:29-35`.
- **D-02** Extract shared helper (Zod fragment + flat→nested mapper) to a shared module so `npc-generator.ts` and `scaffold-steps/npcs-step.ts` both import it. Prevents drift.
- **D-03** Mapper writes all 7 sub-fields to `draft.identity.personality` (not only `summary`). Replaces the current block at `npcs-step.ts:554-564`.
- **Not doing:** separate post-scaffold enrichment pass (doubles LLM calls); looping `npc-generator.ts` per NPC (high cost, duplicates logic).

**GA-2 Regenerate-section Behavior — Option A (full replace):**
- **D-04** `/api/worldgen/regenerate-section section="npcs"` stays full-section replace. No merge semantics for personality.
- **D-05** Client-side preserve-edits logic is deferred (requires new API contract — sending current NPC drafts in body).

**GA-3 Known-IP Enrichment Interaction — Option A (base step generates, IP enrichment later refines):**
- **D-06** Base `generateNpcsStep` writes full personality for ALL NPC (tier=key and tier=supporting).
- **D-07** `enrichKnownIpWorldgenNpcDraft()` is NOT touched in Phase 64 (it currently writes `powerStats`, not personality).

**GA-4 Sample Lines Quality — Options A+B (inline + 1-retry fallback):**
- **D-08** `sampleLines` generated in the same per-NPC detail call. Prompt asks for 2-3 actual phrases in the NPC's voice. Zod: `z.array(z.string().max(300)).min(0).max(3)` (permissive to avoid hard rejection).
- **D-09** Lightweight retry: if first attempt returns `sampleLines.length === 0` OR all lines match generic heuristic (length < 15, `/^(I am|I'm|Hello|Greetings|My name)/i`, all-identical), trigger ONE targeted retry LLM call focused only on voice + sampleLines. Max 1 retry per NPC.

**GA-5 Backfill Scope — Option A (narrow backfill):**
- **D-10** Extend `backend/src/scripts/backfill-personality.ts` with mode `incomplete-personality-pack`: target NPC where `personality.summary` present AND sub-fields empty.
- **D-11** Existing skip condition (summary present) unchanged — add a NEW opt-in path via `--mode=incomplete-pack` flag. Explicit trigger.
- **D-12** Mandatory per-record backup (Phase 63 Plan 05 pattern) before update. Idempotent.

**GA-6 Validation/Tests — Options A+B required, C optional:**
- **D-13** Unit test on `generateNpcsStep` in `backend/src/worldgen/__tests__/npcs-step.test.ts` asserting personality non-empty sub-fields.
- **D-14** Integration test on `/api/worldgen/regenerate-section` in `backend/src/routes/__tests__/worldgen.test.ts` asserting returned NPC drafts have full personality.
- **D-15** Unit test on backfill `incomplete-pack` mode (detect-predicate + enrichment logic).
- **D-16** PinchTab E2E — OPTIONAL, not blocking.

### Claude's Discretion
- Name of shared helper module (recommended: `backend/src/character/personality-schema.ts` — see §4.1).
- Exact retry heuristic (regex vs length — §4.2 proposes combined predicate).
- Retry prompt wording (§4.2 proposes minimal voice-only prompt).
- Decision on `--dry-run` reuse vs new flag for `incomplete-pack` mode (§5.2 recommends reuse).

### Deferred Ideas (OUT OF SCOPE)
- **Preserve-edits-on-regenerate (GA-2 Option C)** — new API contract needed.
- **Known-IP personality refinement expansion (GA-3 Option B)** — separate phase if LLM quality insufficient.
- **E2E PinchTab coverage (GA-6 Option C)** — weak oracle, not blocker.
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 64 has no pre-mapped requirement IDs in `REQUIREMENTS.md` (TBD per 64-CONTEXT.md). The planner SHOULD add P64-R1..P64-R8 to `REQUIREMENTS.md` under `### Phase 64 — NPC Personality Regeneration Parity` and back-fill the Traceability table in the first task of Plan 64-01.

**Recommended requirement IDs (derived from D-01..D-16):**

| Proposed ID | Description | Research Support |
|-------------|-------------|------------------|
| **P64-R1** | `generateNpcsStep` per-NPC detail call emits all 7 flat personality fields via extended Zod schema; mapper lifts them into `draft.identity.personality` for every NPC tier (key + supporting). | §3.1 npcs-step change set; §4.1 shared helper. |
| **P64-R2** | A shared helper module exports the flat personality Zod fragment + `mapFlatPersonalityToNested` mapper. Both `npc-generator.ts` and `scaffold-steps/npcs-step.ts` import it (no duplication). | §4.1 helper design. |
| **P64-R3** | In `generateNpcsStep`, the flat→nested mapper runs BEFORE `fromLegacyScaffoldNpc` so the per-NPC personality object is preserved through normalization (the existing adapter writes `normalizePersonality` which spreads `record.identity.personality`, so the helper's output must be in place first). Alternative: apply the mapper AFTER `fromLegacyScaffoldNpc` and OVERWRITE `draft.identity.personality` like the current code at lines 545-573 already does. Either ordering works provided the final `draft.identity.personality` contains all 7 sub-fields before `enrichKnownIpWorldgenNpcDraft`. | §3.2 call-order analysis. |
| **P64-R4** | Sample-lines retry heuristic: detects empty / generic / duplicated `sampleLines` and issues ONE targeted LLM retry per NPC. Pure TS predicate, bounded cost. | §4.2 retry design. |
| **P64-R5** | `/api/worldgen/regenerate-section section="npcs"` returns NPC payloads with full `identity.personality` block (automatically inherits from fixed `generateNpcsStep`). | §3.3 route wiring — no route code change needed. |
| **P64-R6** | Backfill script `--mode=incomplete-pack` targets NPCs with `personality.summary` present AND sub-fields empty. Mandatory per-record backup. Idempotent. Reuses existing `--dry-run` + per-campaign connectDb loop. | §5 backfill extension. |
| **P64-R7** | Unit test on `generateNpcsStep` asserts full personality population (all 7 fields non-empty); integration test on `/regenerate-section` asserts same on returned payloads; unit test on backfill `incomplete-pack` mode asserts detect-predicate + enrichment. | §6 test strategy. |
| **P64-R8** | `prompt-assembler.ts:buildPersonalityLines` (§ unchanged) already reads all 7 sub-fields — new worldgen/regenerate NPCs produce non-empty prompt output automatically. No regression in existing `npc-agent.ts`, `npc-offscreen.ts`, `reflection-agent.ts` consumers because they already read `identity.personality.*` (Phase 63). | §7 regression surface audit. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Loaded from project `./CLAUDE.md`:

- **TypeScript strict, ES modules** — all new code must compile under backend strict tsc.
- **Drizzle query builder**, not raw SQL — backfill extensions use `db.update(...).set(...).where(...)`.
- **Zod schemas for all AI tool definitions and API payloads** — personality flat schema is Zod; retry call also Zod.
- **Vercel AI SDK** (`generateObject`, `streamText`) — retry call uses same `safeGenerateObject` wrapper as the primary detail call (see `npcs-step.ts:1`).
- **Route handlers:** outer try/catch, `parseBody()` for validation, `getErrorStatus(error)` — `/regenerate-section` already follows this pattern; no route code change needed for Phase 64.
- **Shared types/constants live in `@worldforge/shared`** — `CharacterPersonality` type already defined at `shared/src/types.ts:310`. No shared types change for Phase 64.
- **User communicates in Russian. Respond in Russian** — planner output in Russian per user preference.
- **GitNexus mandatory impact analysis before editing any symbol** — `gitnexus_impact({target: "generateNpcsStep", direction: "upstream"})` + `gitnexus_impact({target: "npcDetailSingleSchema", direction: "upstream"})` MUST run during Wave 0.
- **GitNexus detect_changes before commit** — every plan task ends with `gitnexus_detect_changes({scope: "staged"})`.

## Project Skills

Available skills (`.claude/skills/`):

- `desloppify/` — quality scoring and anti-gaming rules. Relevant for Phase 64 score reporting (avoid exactly 95.0, use the strict resolve attestation).
- `gitnexus/` — code intelligence; MUST run impact analysis before editing `generateNpcsStep`, `npcDetailSingleSchema`, `fromLegacyScaffoldNpc`, and `backfill-personality.ts`.

No other project-specific skills detected under `.agents/skills/`.

---

## 1. Summary

Phase 63 shipped the `CharacterPersonality` block and wired it through 4 ingestion endpoints (parse/generate/research/V2-import via `ingestCharacterDraft`), prompt assembler, basic NPC card, and a one-shot backfill script. **One lane was missed:** the worldgen pipeline's per-NPC detail call (`backend/src/worldgen/scaffold-steps/npcs-step.ts`) and the route that reuses it (`/api/worldgen/regenerate-section` section=`npcs`) only populate `identity.personality.summary` (copied from `persona`) and leave `voice / decisionStyle / worldview / internalContradictions / personalMythology / sampleLines` empty.

Source evidence — `backend/src/worldgen/scaffold-steps/npcs-step.ts:545-573`:

```ts
draft = {
  ...draft,
  identity: {
    ...draft.identity,
    baseFacts: { ... },
    personality: {
      summary: detail.persona.trim(),          // ← only summary populated
      voice: draft.identity.personality?.voice ?? "",                  // empty
      decisionStyle: draft.identity.personality?.decisionStyle ?? "",  // empty
      worldview: draft.identity.personality?.worldview ?? "",          // empty
      internalContradictions: draft.identity.personality?.internalContradictions ?? [],  // []
      personalMythology: draft.identity.personality?.personalMythology ?? "",            // empty
      sampleLines: draft.identity.personality?.sampleLines ?? [],                        // []
    },
    behavioralCore: { ... selfImage: detail.selfImage.trim() },
  },
};
```

The `npcDetailSingleSchema` (lines 38-73) has no personality fields; the LLM is never asked to produce them. The reference implementation `backend/src/character/npc-generator.ts:29-35` + mapping at 111-118 already knows how to do this — the fix is to hoist that pattern into a shared helper module, extend the worldgen detail schema to include the 7 flat fields, and lift them via a mapper into `draft.identity.personality` in place of the stub above.

**Primary recommendation:** Extend `npcDetailSingleSchema` inline with flat personality fields, extract a shared `personality-schema.ts` helper that both `npc-generator.ts` and `npcs-step.ts` import, add a pure-TS sample-lines retry heuristic with one targeted LLM retry, and extend the existing Phase 63 backfill script with a narrow `incomplete-pack` mode. No prompt assembler change, no database migration, no UI change, no consumer prompt rewrites — Phase 63 already owns those surfaces and they read `identity.personality.*` generically.

---

## 2. Standard Stack

### Core (inherited from Phase 63 — no new libraries)

| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `zod` | project-pinned | Schema validation for LLM tool output | CLAUDE.md mandate for AI tool schemas; already used in `npcDetailSingleSchema` and `npc-generator.ts:npcSchema`. |
| `ai` (Vercel AI SDK) | v6+ | `generateObject` structured output for per-NPC detail + retry | CLAUDE.md mandate; already used via `safeGenerateObject` wrapper in `npcs-step.ts:1`. |
| `drizzle-orm` | project-pinned | Query builder for backfill update path | Backfill script already uses Drizzle (`backfill-personality.ts:7`). |
| `vitest` | 2.x | Unit + integration tests | Project test framework; 3 test files touched (`npcs-step.test.ts`, `worldgen.test.ts`, new `backfill-personality.test.ts` extension). |

### Supporting (existing helpers, no new deps)

| Helper | File | Purpose | When Phase 64 Uses It |
|--------|------|---------|-----------------------|
| `safeGenerateObject` | `backend/src/ai/generate-object-safe.js` | Wrapped `generateObject` with retries built-in | Reused for both primary NPC detail call AND retry call (same seam). |
| `createModel` | `backend/src/ai/index.js` | Construct model from provider config | No change; called from `npcs-step.ts`. |
| `fromLegacyScaffoldNpc` | `backend/src/character/record-adapters.ts:652` | Converts ScaffoldNpc → CharacterDraft | Unchanged; existing `npcs-step.ts:537` call chain preserved. |
| `normalizePersonality` | `backend/src/character/record-adapters.ts:274-281` | Ensures `draft.identity.personality` has all 7 sub-fields (spreads over `blankPersonality()`) | Protects against undefined sub-fields; called inside `normalizeCharacterDraftRecord`. |
| `blankPersonality` | `backend/src/character/record-adapters.ts:262-272` | Empty `CharacterPersonality` sentinel | Already used as the normalize-fill default. |
| `withPipelineRetry` | `backend/src/character/ingestion/retry.js` | 3-attempt retry + typed `IngestionPipelineError` | Backfill extension reuses existing wrapper. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Why rejected |
|------------|-----------|----------|--------------|
| Inline schema extension | Post-scaffold enrichment pass (separate LLM call per NPC) | Doubles call count; adds latency | Rejected per D-03 — unnecessary cost when detail call already exists. |
| Shared helper module | Duplicate the Zod fragment + mapper in both files | Zero drift today; drift tomorrow | Rejected per D-02 — drift risk is exactly what caused the Phase 63 parity gap. |
| Retry LLM call | Regenerate-entire-NPC on empty sampleLines | Wastes tokens on already-good fields | Rejected per D-09 — targeted voice+sampleLines-only retry is cheaper. |
| New backfill mode flag | Hard-delete the Phase 63 skip-if-summary-present condition | Would re-backfill already-complete records | Rejected per D-11 — idempotency of Phase 63 mode stays intact. |

**Installation:** No new npm packages. All work uses existing deps.

**Version verification:** Not applicable — no package version changes. Confirm existing lockfile is green via `npm --prefix backend run typecheck`.

---

## 3. Architecture Patterns

### Recommended Change Structure

```
backend/src/
├── character/
│   ├── personality-schema.ts          ← NEW (shared helper — D-02)
│   ├── npc-generator.ts               ← MODIFY (import shared helper, dedupe flat keys)
│   └── record-adapters.ts             ← UNCHANGED (normalizePersonality stays)
├── worldgen/
│   ├── scaffold-steps/
│   │   ├── npcs-step.ts               ← MODIFY (extend detail schema, add mapper call, add retry)
│   │   └── __tests__/npcs-step.test.ts ← MODIFY (+ new assertions — D-13)
│   └── (no other worldgen file changes — regenerate-section reuses generateNpcsStep)
├── routes/
│   └── __tests__/worldgen.test.ts     ← MODIFY (new integration test — D-14)
└── scripts/
    ├── backfill-personality.ts        ← MODIFY (add --mode=incomplete-pack — D-10/D-11/D-12)
    └── __tests__/backfill-personality.test.ts ← MODIFY (new test case — D-15)
```

**No UI changes. No prompt-assembler changes. No runtime consumer changes. No database migration.** Phase 63 already owns those surfaces.

### Pattern 1: Shared Zod Fragment + Mapper Helper (D-02)

**What:** A reusable module `backend/src/character/personality-schema.ts` exporting:
1. `personalityFlatFields` — a plain object literal of `z.ZodType` fragments, spreadable into any `z.object({...})`.
2. `mapFlatPersonalityToNested(flat)` — pure function `(FlatPersonalityFields) => CharacterPersonality`.

**When to use:** Every LLM detail call that wants the 7 flat keys in its output schema. Today that's `npc-generator.ts:npcSchema` and `worldgen/scaffold-steps/npcs-step.ts:npcDetailSingleSchema`. Tomorrow — any new character-creation variant.

**Example (reference signature — exact contents verified against `npc-generator.ts:29-35`):**

```ts
// backend/src/character/personality-schema.ts
import { z } from "zod";
import type { CharacterPersonality } from "@worldforge/shared";

/**
 * Flat Zod fragments for LLM output. Spread into z.object({...}) alongside
 * other character fields. Produces flat keys that map 1:1 to CharacterPersonality.
 *
 * Mirror of npc-generator.ts:29-35 (which originated the pattern) — any
 * change here must keep both call-sites in sync.
 */
export const personalityFlatFields = {
  personalitySummary: z.string().max(400).default(""),
  personalityVoice: z.string().max(600).default(""),
  personalityDecisionStyle: z.string().max(400).default(""),
  personalityWorldview: z.string().max(400).default(""),
  personalityContradictions: z.array(z.string().max(300)).max(3).default([]),
  personalityMythology: z.string().max(400).default(""),
  personalitySampleLines: z.array(z.string().max(300)).min(0).max(3).default([]),
} as const;

export interface FlatPersonalityFields {
  personalitySummary: string;
  personalityVoice: string;
  personalityDecisionStyle: string;
  personalityWorldview: string;
  personalityContradictions: string[];
  personalityMythology: string;
  personalitySampleLines: string[];
}

export function mapFlatPersonalityToNested(
  flat: FlatPersonalityFields,
): CharacterPersonality {
  return {
    summary: flat.personalitySummary,
    voice: flat.personalityVoice,
    decisionStyle: flat.personalityDecisionStyle,
    worldview: flat.personalityWorldview,
    internalContradictions: flat.personalityContradictions,
    personalMythology: flat.personalityMythology,
    sampleLines: flat.personalitySampleLines,
  };
}

/**
 * Prompt bullet listing the flat personality keys. Reuse in
 * buildFlatOutputStrategy() callers so prompt wording is identical.
 */
export const PERSONALITY_FLAT_STRATEGY_BULLET =
  "- personalitySummary, personalityVoice, personalityDecisionStyle, personalityWorldview, personalityContradictions, personalityMythology, and personalitySampleLines lift into identity.personality. Provide at least 2 spoken sampleLines in the NPC's actual voice (direct quotes, not descriptions).";
```

**Impact on `npc-generator.ts`:** imports `personalityFlatFields` + `mapFlatPersonalityToNested`, replaces lines 29-35 with `...personalityFlatFields` spread, and replaces lines 111-118 with `personality: mapFlatPersonalityToNested(npc)`.

### Pattern 2: Extend npcs-step Detail Schema (D-01)

Replace `backend/src/worldgen/scaffold-steps/npcs-step.ts:38-73`:

```ts
// Before (current — 7 fields only):
const npcDetailSingleSchema = z.object({
  persona: z.string().describe(...),
  tags: z.array(z.string()).describe(...),
  goals: z.union([...]).catch({...}),
  selfImage: z.string().default(""),
  socialRoles: z.array(z.string()).default([]),
});

// After (Phase 64 — adds personality flat keys):
import { personalityFlatFields, mapFlatPersonalityToNested, PERSONALITY_FLAT_STRATEGY_BULLET } from "../../character/personality-schema.js";

const npcDetailSingleSchema = z.object({
  persona: z.string().describe(...),
  tags: z.array(z.string()).describe(...),
  goals: z.union([...]).catch({...}),
  selfImage: z.string().default(""),
  socialRoles: z.array(z.string()).default([]),
  ...personalityFlatFields,                 // ← NEW: 7 flat keys
});
```

Then in the detail-merge block (lines 545-573), replace the stub personality object with the mapped result:

```ts
// Before:
personality: {
  summary: detail.persona.trim(),
  voice: draft.identity.personality?.voice ?? "",
  decisionStyle: draft.identity.personality?.decisionStyle ?? "",
  worldview: draft.identity.personality?.worldview ?? "",
  internalContradictions: draft.identity.personality?.internalContradictions ?? [],
  personalMythology: draft.identity.personality?.personalMythology ?? "",
  sampleLines: draft.identity.personality?.sampleLines ?? [],
},

// After:
personality: mapFlatPersonalityToNested({
  personalitySummary: detail.personalitySummary || detail.persona.trim(),  // fallback if LLM omits
  personalityVoice: detail.personalityVoice,
  personalityDecisionStyle: detail.personalityDecisionStyle,
  personalityWorldview: detail.personalityWorldview,
  personalityContradictions: detail.personalityContradictions,
  personalityMythology: detail.personalityMythology,
  personalitySampleLines: detail.personalitySampleLines,
}),
```

The `|| detail.persona.trim()` fallback for `personalitySummary` preserves today's summary semantics when the LLM returns empty `personalitySummary` — the prompt still asks for both persona AND summary separately so they may diverge legitimately.

### Pattern 3: Prompt Instructions for New Fields

Extend `generateNpcDetail` prompt (lines 330-364) with an explicit FIELD INSTRUCTIONS block for the personality keys. Keep it short — token budget is already heavy with "ALREADY DETAILED NPCs" accumulator. Proposed additions after the `goals` block:

```
- personalitySummary: 1-2 sentences, the essence of who this character is at their core. May overlap with persona but must capture interiority, not outward description.
- personalityVoice: Prose describing this character's vocabulary register, speech rhythm, metaphors they reach for, and what they avoid. Not a tag list.
- personalityDecisionStyle: Prose — impulsive vs analytical, intuitive vs planned — with one concrete example of how they choose under pressure.
- personalityWorldview: Prose — how they see the world (cynic / idealist / pragmatist / mystic) and what they believe is true about it.
- personalityContradictions: 2-3 items, format "Believes X, but acts Y because Z". Gives interiority depth.
- personalityMythology: One sentence, first-person or narrative, how this character frames their own role ("I am the last X who remembers Y").
- personalitySampleLines: 2-3 actual spoken quotes in this character's voice. MUST be direct speech, not narrator description. MUST match the voice described above.
```

**Token cost estimate:** +300-500 tokens input (new instructions) + ~400 tokens output (7 personality fields at ~60 tokens each). Net ~+800 tokens per NPC. On a 10-15 NPC scaffold that's +8-12K tokens — non-blocking on GLM-5.1 (64K context) but noticeable on the SSE heartbeat. Acceptable. Document in SUMMARY.

### Pattern 4: Call-Order Constraint (P64-R3 critical)

**Risk:** `fromLegacyScaffoldNpc` (record-adapters.ts:652) → `toCharacterDraft` → `normalizeCharacterDraftRecord` → `normalizePersonality` (lines 274-281), which does `{ ...blankPersonality(), ...record.identity.personality }`. If the mapper writes `draft.identity.personality = {...}` BEFORE `fromLegacyScaffoldNpc`, the normalize step will preserve it (spread over blank). If AFTER, the current code at lines 545-573 already overwrites whatever normalize produced — which is what today's stub does.

**Verified current ordering:** the existing stub writes personality AFTER `fromLegacyScaffoldNpc` (at line 545-573). The Phase 64 fix maintains that ordering — replace the stub with `mapFlatPersonalityToNested(...)` result at the same call site. **No reordering needed.**

**Why it's safe:** `fromLegacyScaffoldNpc` builds a draft from the legacy `ScaffoldNpc` shape (name, persona, tags, goals, locationName, factionName, tier). It knows nothing about personality. Its output draft has `identity.personality = normalizePersonality(empty) = blankPersonality()` (from line 157 in the adapter). We then overwrite `draft.identity.personality` with the LLM-derived mapped object. No conflict.

### Anti-Patterns to Avoid

- **Adding personality generation to `enrichKnownIpWorldgenNpcDraft`.** It currently writes `powerStats`, not personality. Expanding its contract mixes two separable concerns and doubles LLM calls for key-tier NPCs. Per D-07, not in scope.
- **Looping `npc-generator.ts:parseNpcDescription` per NPC inside the worldgen pipeline.** Would duplicate work the plan-and-detail pattern already does, and the generator expects free-text input that worldgen doesn't have.
- **Writing to `draft.identity.personality` partially** (e.g., only summary + voice). Downstream consumers (`prompt-assembler.ts:1375-1397`) defensively handle each field, but the user-visible UI (`PersonalitySection` per Phase 63 Plan 04) shows a mix of filled/empty fields as obvious drift. All 7 must be populated together per D-03.
- **Silent fallback to stub personality on retry exhaustion.** Per `feedback_no_fallbacks_v2.md`, the retry call should either succeed OR the first-attempt result is accepted as-is (even if sampleLines are empty). Never fabricate sampleLines in code.

---

## 4. Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Flat→nested personality mapping | Hand-rolled per-site mappers in both files | Shared `mapFlatPersonalityToNested` helper (D-02) | The exact bug Phase 64 closes was caused by npcs-step.ts not using the same mapping npc-generator.ts had. Sharing prevents recurrence. |
| Retry logic for transient LLM failures | Custom `for (attempt 1..3)` loop | `withPipelineRetry` from `backend/src/character/ingestion/retry.js` (Phase 60) | Typed `IngestionPipelineError`, bounded attempts, Phase 58 logging already wired. The Phase 64 **content retry** (D-09) is orthogonal — see §4.2 — but the infrastructure retry for schema-rejection is already covered by `safeGenerateObject`. |
| Backfill record backup | Custom fs.writeFile with ad-hoc naming | Phase 63 Plan 05 pattern: `campaigns/{id}/logs/backfill-backup-{recordId}-{ISO}.json` via `writeBackupFile()` | Already implemented at `backfill-personality.ts:228-243`. New `incomplete-pack` mode reuses it. |
| Campaign enumeration | Hand-rolled `readdir` + filter | `listCampaignIds()` at `backfill-personality.ts:358-380` | Already handles `_worldbook-library` exclusion + `state.db` existence check. |
| Per-record turn context for logging | Hand-rolled pino correlation | `runWithTurnContext({ turnId: 'backfill-<id>' })` from Phase 58 | Already wired at `backfill-personality.ts:425-434`. |
| Re-read-before-write safeguard | Custom optimistic-locking | `getRecordRow()` + byte-exact comparison (Phase 63 Plan 05 REVIEWS fix #10) | Already implemented at `backfill-personality.ts:294-311`. |
| Sample-lines generic detection | Regex-soup `/bad|trite|hello/i` | Three composable predicates: length check, opener-phrase regex, identical-lines check | Composable predicates are testable independently. See §4.2. |

**Key insight:** Phase 64 is almost entirely a consolidation-of-existing-patterns phase. Every new line of code has an existing parallel in Phase 60/63. The only genuinely new logic is the sample-lines retry heuristic (D-09). Everything else is wire-up.

---

## 4.1 Shared Helper Module Design (D-02)

See **Pattern 1** in Section 3 for the exact module contents. Key properties:

1. **Location:** `backend/src/character/personality-schema.ts`. Rationale: adjacent to `npc-generator.ts` (primary reference implementation) and `record-adapters.ts` (the other personality surface). The worldgen step imports via `../../character/personality-schema.js`.
2. **Exports:**
   - `personalityFlatFields` — `Record<string, z.ZodTypeAny>` spreadable into any `z.object({...})`.
   - `FlatPersonalityFields` — TypeScript interface (derived from the Zod fragment's `z.infer<z.ZodObject<...>>` OR declared explicitly for clarity).
   - `mapFlatPersonalityToNested(flat: FlatPersonalityFields): CharacterPersonality` — pure function.
   - `PERSONALITY_FLAT_STRATEGY_BULLET` — prompt bullet string for consistent wording across callers.
3. **Non-export:** no runtime state, no side effects. Pure functions + constants.
4. **Testing:** dedicated `backend/src/character/__tests__/personality-schema.test.ts` with 3 cases:
   - Round-trip: `z.object({...personalityFlatFields}).parse(validFlat)` produces the exact input.
   - Mapper identity: `mapFlatPersonalityToNested(flat)` produces each field in the right nested slot.
   - Defaults: missing fields coerce to empty string / empty array per Zod defaults.

**Drift-prevention assertion:** the shared helper's field names MUST match the 7 nested keys on `CharacterPersonality` (shared/src/types.ts:310). Add a compile-time type assertion in the helper file:

```ts
// Compile-time assertion: mapper output is a full CharacterPersonality
const _assertMapperCompleteness: CharacterPersonality = mapFlatPersonalityToNested({
  personalitySummary: "",
  personalityVoice: "",
  personalityDecisionStyle: "",
  personalityWorldview: "",
  personalityContradictions: [],
  personalityMythology: "",
  personalitySampleLines: [],
});
void _assertMapperCompleteness;
```

If `CharacterPersonality` grows a new field, TypeScript rejects this line and the helper is forced to update in sync.

## 4.2 Sample-Lines Retry Heuristic (D-09, P64-R4)

**Predicate (pure TS, testable in isolation):**

```ts
// backend/src/worldgen/scaffold-steps/npcs-step.ts (near generateNpcDetail)

const GENERIC_OPENER_REGEX = /^(I am|I'm|Hello|Greetings|My name)/i;

function isGenericSampleLine(line: string): boolean {
  if (line.trim().length < 15) return true;
  if (GENERIC_OPENER_REGEX.test(line.trim())) return true;
  return false;
}

function needsSampleLinesRetry(lines: string[]): boolean {
  if (!lines || lines.length === 0) return true;
  if (lines.every(isGenericSampleLine)) return true;
  // All identical (case-insensitive, trimmed)
  const normalized = lines.map((l) => l.trim().toLowerCase());
  if (new Set(normalized).size === 1 && lines.length > 1) return true;
  return false;
}
```

**Retry call** (prompt focuses on voice + sampleLines ONLY; other fields already good):

```ts
const sampleLinesRetrySchema = z.object({
  personalityVoice: personalityFlatFields.personalityVoice,
  personalitySampleLines: z.array(z.string().min(10).max(300)).min(2).max(3),
});

async function retrySampleLines(opts: {
  req: GenerateScaffoldRequest;
  npc: PlannedNpc;
  previousPersona: string;
  previousVoice: string;
  previousSampleLines: string[];
}): Promise<{ personalityVoice: string; personalitySampleLines: string[] }> {
  const prompt = `You previously wrote an NPC profile but the sample lines came back empty or generic. Produce 2-3 actual spoken lines in this character's voice — direct quotes only, no narrator description, no introductions like "I am" or "Hello".

CHARACTER: ${opts.npc.name}
ROLE: ${opts.npc.role}
PERSONA: ${opts.previousPersona}

Generate only voice + 2-3 sampleLines. Each sampleLine must be ≥15 chars, a direct quote, in the character's distinct speech register. No opener clichés.`;

  const result = await generateObject({
    model: createModel(opts.req.role.provider),
    schema: sampleLinesRetrySchema,
    prompt,
    temperature: Math.min(opts.req.role.temperature, 0.4),
    maxOutputTokens: opts.req.role.maxTokens,
    retries: 1,  // safeGenerateObject's built-in schema-retry
  });
  return result.object;
}
```

**Integration in `generateNpcDetail`** — after the primary detail call succeeds, before returning:

```ts
const detail = await /* primary per-NPC detail call */;

if (needsSampleLinesRetry(detail.personalitySampleLines)) {
  try {
    const retry = await retrySampleLines({
      req: opts.req,
      npc: opts.npc,
      previousPersona: detail.persona,
      previousVoice: detail.personalityVoice,
      previousSampleLines: detail.personalitySampleLines,
    });
    // Merge — keep primary detail, overwrite voice+sampleLines
    detail.personalityVoice = retry.personalityVoice || detail.personalityVoice;
    detail.personalitySampleLines = retry.personalitySampleLines;
  } catch (error) {
    // Phase 58 log + continue with the primary result; do NOT fabricate.
    log.warn("npcs-step.sample_lines_retry_failed", {
      npcName: opts.npc.name,
      error: String(error),
    });
  }
}

return detail;
```

**Bounded cost:** Max 1 retry per NPC. On a 10-15 NPC scaffold with good LLM output, most NPCs skip the retry (predicate is strict on what triggers). Worst case: +15 retry calls × ~400 tokens each ≈ +6K tokens. Non-blocking.

**Tests for the predicate** (separate test file at `backend/src/worldgen/scaffold-steps/__tests__/sample-lines-retry.test.ts` OR inline in `npcs-step.test.ts`):
- Empty array → needs retry.
- `["Hello traveler", "I am a man"]` → all generic → needs retry.
- `["The sun rises", "The sun rises"]` → all identical → needs retry.
- `["A complex sentence with specific content."]` → length 1 but legitimate → does NOT need retry.
- `["Keep the supplies coming.", "Name your price."]` → does NOT need retry.

---

## 5. Runtime State Inventory

**N/A — Phase 64 is a greenfield-code-path phase, not a rename/refactor.** The only persistent state touched is `npcs.characterRecord` JSON column, and the backfill script's `incomplete-pack` mode is the documented migration path for existing data. No OS-level state, no external service registrations, no environment variables, no stale build artifacts.

Verified explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `npcs.characterRecord` JSON column contains `identity.personality.summary` only for worldgen-created NPCs between Phase 63 merge and Phase 64 merge. | Backfill `--mode=incomplete-pack` covers this (D-10..D-12). |
| Live service config | None — Phase 64 touches no external services (no n8n, Datadog, Tailscale, etc.). | None. |
| OS-registered state | None — no Task Scheduler, pm2, launchd, or systemd registrations. | None. |
| Secrets/env vars | None — no new secrets introduced; existing GLM provider keys unchanged. | None. |
| Build artifacts | None — no renamed packages, no egg-info, no Docker image tag changes. | None. |

## 5.1 Backfill `incomplete-pack` Mode (D-10..D-12)

**Predicate (P64-R6):**

```ts
function isIncompletePersonalityPack(record: CharacterRecord): boolean {
  const p = record.identity.personality;
  if (!p) return false;                         // No personality block at all — Phase 63 mode handles.
  if (!p.summary || !p.summary.trim()) return false;  // Empty summary — Phase 63 mode handles.

  // Summary present, check if sub-fields are empty:
  const voiceEmpty = !p.voice || !p.voice.trim();
  const decisionEmpty = !p.decisionStyle || !p.decisionStyle.trim();
  const worldviewEmpty = !p.worldview || !p.worldview.trim();
  const contradictionsEmpty = !p.internalContradictions || p.internalContradictions.length === 0;
  const mythologyEmpty = !p.personalMythology || !p.personalMythology.trim();
  const sampleLinesEmpty = !p.sampleLines || p.sampleLines.length === 0;

  // Flag as "incomplete pack" when summary present but ALL other sub-fields are empty.
  // Looser variant (ANY sub-field empty) risks re-backfilling partially-complete records.
  return voiceEmpty && decisionEmpty && worldviewEmpty && contradictionsEmpty && mythologyEmpty && sampleLinesEmpty;
}
```

**CLI flag integration (D-11):**

Extend `BackfillArgs` in `backfill-personality.ts:68-72`:

```ts
export interface BackfillArgs {
  campaignFilter?: string;
  dryRun: boolean;
  batchSize: number;
  mode: "missing-summary" | "incomplete-pack";  // NEW — default "missing-summary"
}
```

Extend `parseArgs` (lines 78-112) to handle `--mode=incomplete-pack` (reject unknown values explicitly).

**Predicate dispatch** — modify `hasExistingPersonality` usage in `processRow` (lines 265-273):

```ts
// Before:
if (hasExistingPersonality(parsedRecord)) { return { status: "skipped" }; }

// After:
const shouldBackfill = args.mode === "incomplete-pack"
  ? isIncompletePersonalityPack(parsedRecord)
  : !hasExistingPersonality(parsedRecord);

if (!shouldBackfill) {
  log.event("backfill.skip", { campaignId, recordId: row.id, kind: row.kind, reason: args.mode === "incomplete-pack" ? "pack_complete" : "personality_present" });
  return { status: "skipped" };
}
```

**Idempotency:** re-running `--mode=incomplete-pack` after a successful pass skips all records (predicate returns `false` because sub-fields are now populated). Re-running `--mode=missing-summary` (default) after an `incomplete-pack` pass also skips them. Both modes remain orthogonal.

**`--dry-run` reuse:** D-11 discretion. **Recommendation: REUSE existing `--dry-run` flag.** Rationale: the dry-run contract (no backup file, no DB write, no config.json sentinel — REVIEWS fix #11 from Phase 63 Plan 05) applies identically to incomplete-pack mode. Duplicating it would invite drift.

**Per-record backup (D-12):** `writeBackupFile()` at `backfill-personality.ts:228-243` already implements the Phase 63 Plan 05 mandatory-backup pattern. No change needed — the new mode inherits it.

**Sentinel (config.json `personalityBackfillComplete`):** the existing flag is written when `missing-summary` mode completes a campaign with zero failures. For `incomplete-pack` mode, **recommend NOT writing a second sentinel** — same flag covers both cases conceptually. Document: after running both modes, a single `personalityBackfillComplete: true` means "full personality data is present for all records". If drift is discovered later, a third mode can be added. Planner decides final sentinel semantics.

**Prompt for `incomplete-pack` mode:** the existing `buildPrompt` at `backfill-personality.ts:118-140` feeds biography + persona + drives + frictions into the synthesizer. For `incomplete-pack` mode, **also include the existing `personality.summary` in the prompt** so the LLM expands from the already-present summary rather than re-deriving it. Proposed patch:

```ts
function buildPrompt(record: CharacterRecord, mode: "missing-summary" | "incomplete-pack"): string {
  const personalitySummary = mode === "incomplete-pack"
    ? record.identity.personality?.summary ?? ""
    : "";
  return [
    "You are backfilling a structured personality pack for an existing WorldForge character record.",
    mode === "incomplete-pack"
      ? `The summary is already written: "${personalitySummary}". Expand it into voice, decisionStyle, worldview, internalContradictions, personalMythology, and sampleLines without contradicting the summary.`
      : "Return a fully populated personality object grounded in the existing record.",
    // ... rest unchanged
  ].join("\n");
}
```

---

## 6. Common Pitfalls

### Pitfall 1: Dropping personality in `enrichKnownIpWorldgenNpcDraft`

**What goes wrong:** The key-tier enrichment step at `npcs-step.ts:575-584` wraps the draft with IP-specific `powerStats`. If the helper function spreads `...draft` and then overwrites fields, it could accidentally overwrite `identity.personality` if the future enrichment adds personality-related updates.

**Why it happens:** `enrichKnownIpWorldgenNpcDraft` currently writes `powerStats` only (per D-07). A future expansion that adds personality rewrites risks overwriting the base-step personality.

**How to avoid:** Plan 64-xx does NOT modify `known-ip-worldgen-research.ts`. Integration test (D-14) asserts that post-enrichment NPCs still have the `personality.summary` non-empty, catching any regression in a future PR.

**Warning signs:** Snapshot-style tests on key-tier NPCs show `personality.summary === ""` after enrichment.

### Pitfall 2: Retry-exhausted prompt reject

**What goes wrong:** `safeGenerateObject` applies its own retries for schema-validation failures. If the LLM repeatedly returns data that fails `personalityFlatFields` validation (e.g., sampleLines length > 3), the wrapper throws. The outer `generateNpcDetail` catches via `try/catch` and degrades mode (`"full" → "compact" → "none"`), but each mode retry repeats the full personality output expectation.

**Why it happens:** Token budget exhaustion on large scaffolds, or a model that doesn't respect `min/max` constraints cleanly.

**How to avoid:** Use permissive Zod on personality (`.max(3)` not `.min(2)`) so the LLM can return 0-3 sampleLines without rejection. The content-level retry (§4.2) handles quality separately. This matches D-08: Zod accepts empty; prompt pushes for 2-3.

**Warning signs:** `safeGenerateObject` throws `ZodError: sampleLines exceeds max` or similar — visible in Phase 58 JSONL logs under `npcs-step.detail.failed`.

### Pitfall 3: Prompt-token bloat on large known-IP scaffolds

**What goes wrong:** Adding +300-500 input tokens per NPC × 10-15 NPCs = +3-7K input tokens. Combined with the existing "ALREADY DETAILED NPCs" accumulator (which grows per NPC) and the IP research context, prompts may approach the model's input limit.

**Why it happens:** Current prompt at `npcs-step.ts:330-364` already references `allPlanned.map(...)` and full previous-NPC dumps. Phase 64 extends the OUTPUT schema (minor) AND the FIELD INSTRUCTIONS (moderate).

**How to avoid:** Keep the new personality bullets short (under 300 tokens total). If token bloat becomes visible, the `buildPreviousNpcSection("compact")` fallback at lines 301-305 already exists — the detail call naturally degrades.

**Warning signs:** Scaffold generation latency grows noticeably (SSE progress events slow), or 4xx provider errors in logs.

### Pitfall 4: Regenerate-section NPC payload lacks `draft` field in response

**What goes wrong:** The `/regenerate-section` route returns `c.json({ npcs })` at line 596, where `npcs` is `ScaffoldNpc[]`. If the integration test asserts on `npcs[0].draft.identity.personality` but the route doesn't include `draft`, the test falsely fails.

**Why it happens:** Not a Phase 64 bug — existing behavior. Need to verify the serialization path.

**How to avoid:** **Verified in code:** `generateNpcsStep` returns `ScaffoldNpc[]` with `draft` field populated (line 586-595). The route passes it through `c.json({ npcs })` as-is. JSON serialization includes the full `draft` object. No additional route work needed.

**Warning signs:** Integration test at D-14 fails with `npcs[0].draft undefined`.

### Pitfall 5: Sample-lines retry recursion / infinite loop

**What goes wrong:** If the retry call's output ALSO triggers `needsSampleLinesRetry`, a naive implementation might retry again.

**How to avoid:** The retry is explicitly bounded to ONE call per NPC (D-09). No recursion. If the retry result still looks generic, the NPC gets whatever it gets — log warning and return.

**Warning signs:** Per Phase 58 logs, repeated `npcs-step.sample_lines_retry` events for the same `npcName`.

### Pitfall 6: Backfill `incomplete-pack` mode re-backfills correctly-completed records

**What goes wrong:** If the predicate is too loose (e.g., "any sub-field empty"), records with legitimately-empty optional fields (e.g., no `internalContradictions` because the character truly has none) get re-processed every run.

**How to avoid:** Predicate uses AND semantics — only flag when ALL sub-fields are empty. See §5.1 predicate. This catches only the true "summary-only" artifact, not legitimate sparse personalities.

**Warning signs:** Repeated backfill runs rewrite the same records, or per-record backup files accumulate on idempotent runs.

### Pitfall 7: Shared helper module path resolution

**What goes wrong:** Importing `../../character/personality-schema.js` from `npcs-step.ts` but `../../../character/personality-schema.js` from `npc-generator.ts` — one path typo breaks the compile.

**How to avoid:** Use absolute-ish path via `@worldforge` scope OR verify both imports via `npm --prefix backend run typecheck` in Wave 0. Claude note: `npc-generator.ts` lives at `backend/src/character/npc-generator.ts`, so its import is `./personality-schema.js`. `npcs-step.ts` lives at `backend/src/worldgen/scaffold-steps/npcs-step.ts`, so its import is `../../character/personality-schema.js`.

**Warning signs:** `Cannot find module` TS error.

---

## 7. Regression Surface Audit (P64-R8)

Audit of all sites that read `identity.personality.*` to confirm no regression from Phase 64 changes.

| File:Line | Reads | Regression Risk |
|-----------|-------|-----------------|
| `backend/src/engine/prompt-assembler.ts:1375-1397` `buildPersonalityLines` | `summary, voice, decisionStyle, worldview, internalContradictions, personalMythology, sampleLines` | **NONE.** Reads via `personality?.*` with defensive nulls. Phase 64 now provides non-empty values. No code change. |
| `backend/src/engine/prompt-assembler.ts:1409` `buildRuntimeIdentityLines` | Calls `buildPersonalityLines(record.identity.personality)` | **NONE.** No code change. |
| `backend/src/engine/npc-agent.ts` | Reads `personality.*` (Phase 63 Plan 03) | **NONE.** Phase 63 work; consumer already handles all sub-fields. |
| `backend/src/engine/npc-offscreen.ts` | Reads `personality.*` (Phase 63 Plan 03) | **NONE.** |
| `backend/src/engine/reflection-agent.ts` | Reads `personality.*` (Phase 63 Plan 03) | **NONE.** |
| `backend/src/character/record-adapters.ts:274-281` `normalizePersonality` | Spreads `{ ...blankPersonality(), ...record.identity.personality }` | **NONE.** Defensive. Phase 64 populates more fields — normalization still idempotent. |
| `frontend/components/world-review/personality-section.tsx` | Renders all 7 sub-fields | **NONE.** Phase 63 Plan 04 component. Now shows filled state instead of mostly-empty. This is the user-visible win. |
| `frontend/components/world-review/npcs-section.tsx` | Hosts `PersonalitySection` | **NONE.** |
| `backend/src/character/known-ip-worldgen-research.ts:enrichKnownIpWorldgenNpcDraft` | Reads `draft` wholesale, writes `powerStats` | **LOW.** Doesn't overwrite personality. But snapshot test at D-14 should cover this boundary. |
| `backend/src/character/record-adapters.ts:reconcileDraftBackedScaffoldNpc:722-780` | Line 729-730: `personality: npc.draft.identity.personality ?? editableDraft.identity.personality` | **NONE.** Correctly preserves `draft.identity.personality` during save-edits reconciliation. Phase 64 makes this branch consistently non-empty. |
| `backend/src/routes/worldgen.ts:100-133 normalizeSavedScaffold` | Calls `reconcileDraftBackedScaffoldNpc` | **NONE.** Transitive — handled by record-adapter. |
| `backend/src/scripts/backfill-personality.ts:114-116 hasExistingPersonality` | Reads `record.identity.personality?.summary` | **NONE for default mode.** New `incomplete-pack` mode adds its own predicate that inspects sub-fields. |

**Net regression risk: LOW.** Phase 63 prepared the full read-path surface; Phase 64 only fills the write-path gap for worldgen-generated NPCs. The sole risky boundary is `enrichKnownIpWorldgenNpcDraft` which the integration test (D-14) should explicitly assert against.

---

## 8. Code Examples

Verified patterns from in-repo sources:

### Shared Helper Import + Use (npcs-step.ts pattern)

```ts
// Source: backend/src/character/npc-generator.ts:29-35 (existing reference implementation)
// Shows the exact flat-key shape to be hoisted into personality-schema.ts.
personalitySummary: z.string().max(400).default(""),
personalityVoice: z.string().max(600).default(""),
personalityDecisionStyle: z.string().max(400).default(""),
personalityWorldview: z.string().max(400).default(""),
personalityContradictions: z.array(z.string().max(300)).max(3).default([]),
personalityMythology: z.string().max(400).default(""),
personalitySampleLines: z.array(z.string().max(300)).min(0).max(3).default([]),
```

### Mapper in Place (npc-generator.ts pattern, to be hoisted)

```ts
// Source: backend/src/character/npc-generator.ts:111-118
personality: {
  summary: npc.personalitySummary,
  voice: npc.personalityVoice,
  decisionStyle: npc.personalityDecisionStyle,
  worldview: npc.personalityWorldview,
  internalContradictions: npc.personalityContradictions,
  personalMythology: npc.personalityMythology,
  sampleLines: npc.personalitySampleLines,
},
```

### Per-NPC Detail Schema Extension (npcs-step.ts target)

```ts
// Source: backend/src/worldgen/scaffold-steps/npcs-step.ts:38-73 (current)
const npcDetailSingleSchema = z.object({
  persona: z.string().describe(...),
  tags: z.array(z.string()).describe(...),
  goals: z.union([...]).catch({...}),
  selfImage: z.string().default("").describe(...),
  socialRoles: z.array(z.string()).default([]).describe(...),
  // Phase 64 additions spread from shared helper:
  // ...personalityFlatFields,
});
```

### Integration Test Pattern (worldgen.test.ts:1889-1918)

```ts
// Existing structure of /regenerate-section npcs test — extend with personality assertion
const npcs = [{
  name: "Guard",
  persona: "Loyal",
  tags: [],
  goals: { shortTerm: [], longTerm: [] },
  locationName: "Castle",
  factionName: null,
  // Phase 64 extension — the mocked generateNpcsStep must now return draft:
  draft: {
    identity: {
      personality: {
        summary: "...",
        voice: "...",
        decisionStyle: "...",
        worldview: "...",
        internalContradictions: ["..."],
        personalMythology: "...",
        sampleLines: ["...", "..."],
      },
    },
  },
}];
mockedGenerateNpcs.mockResolvedValue(npcs as any);

// Assert on response body:
const body = await res.json();
expect(body.npcs[0].draft.identity.personality.summary).toBeTruthy();
expect(body.npcs[0].draft.identity.personality.sampleLines.length).toBeGreaterThanOrEqual(2);
```

### Unit Test Pattern (npcs-step.test.ts:105-150 extension)

```ts
// Extend existing test's mockGenerateObject chain to return full personality:
.mockResolvedValueOnce({
  object: {
    persona: "...",
    selfImage: "...",
    socialRoles: ["Signal Array Custodian"],
    tags: [...],
    goals: { shortTerm: [...], longTerm: [...] },
    // NEW flat personality fields:
    personalitySummary: "A sleep-deprived analyst.",
    personalityVoice: "Clipped sentences, jargon-heavy, trails off when tired.",
    personalityDecisionStyle: "Analytical when rested, reckless when awake too long.",
    personalityWorldview: "Data is the only honest thing in the universe.",
    personalityContradictions: ["Trusts data over people, but needs human validation."],
    personalityMythology: "I am the last one listening.",
    personalitySampleLines: [
      "The signal's not random. Listen to the silence between bursts.",
      "Station Authority's scared. That's the only reason they're quiet.",
    ],
  },
})

// Add assertion:
expect(result[0]?.draft?.identity.personality).toEqual({
  summary: "A sleep-deprived analyst.",
  voice: "Clipped sentences, jargon-heavy, trails off when tired.",
  decisionStyle: expect.any(String),
  worldview: expect.any(String),
  internalContradictions: expect.arrayContaining([expect.any(String)]),
  personalMythology: expect.any(String),
  sampleLines: expect.arrayContaining([expect.stringMatching(/signal/i)]),
});
```

### Backfill Predicate Test (backfill-personality.test.ts extension)

```ts
describe("--mode=incomplete-pack", () => {
  it("targets records where summary is present but sub-fields are empty", async () => {
    // Seed DB:
    // - NPC-A: summary="...", voice="..." (complete — skip)
    // - NPC-B: summary="...", voice="", decisionStyle="", worldview="", ... (incomplete pack — backfill)
    // - NPC-C: no personality at all (skip — this is missing-summary mode's target)
    // - NPC-D: no personality (skip — same)

    await runBackfill({ mode: "incomplete-pack", campaignFilter: "test", dryRun: false, batchSize: 5 });

    // Assert: NPC-B now has full personality; A unchanged; C/D unchanged.
  });

  it("is idempotent — second run skips everything", async () => { /* ... */ });

  it("reuses existing --dry-run and mandatory backup", async () => { /* ... */ });
});
```

---

## 9. State of the Art

| Old Approach (Phase 63 worldgen lane) | Current Approach (Phase 64) | When Changed | Impact |
|---------------------------------------|-----------------------------|--------------|--------|
| Worldgen NPC detail schema has no personality fields → stub block copies `persona` into `personality.summary` only | Shared `personalityFlatFields` spread into detail schema; mapper lifts into full `identity.personality` | Phase 64 merge | Worldgen + regenerate NPCs now have the same personality fidelity as `npc-generator.ts` ingestion paths (Phase 63 parity closed). |
| Sample lines generated once without quality check | Pure-TS heuristic + 1 targeted retry on empty/generic output | Phase 64 merge | Reduces user-visible "no voice" NPCs; cost-bounded (max 1 retry per NPC). |
| Backfill only covers `summary`-missing NPCs | `--mode=incomplete-pack` also covers summary-present-but-sub-fields-empty | Phase 64 merge | Operators can remediate existing campaigns in place. |
| Inline flat schema duplicated across `npc-generator.ts` and `npcs-step.ts` (one copy actually missing the fields) | Single shared helper `personality-schema.ts` | Phase 64 merge | Eliminates drift class — future character endpoints inherit automatically. |

**Deprecated/outdated:** None. Phase 64 is purely additive consolidation.

---

## 10. Open Questions / Risks with Defaults

Per `memory/feedback_full_autonomy.md` Claude picks autonomously. Planner can override.

| Question | Default pick | Rationale |
|----------|-------------|-----------|
| Should the shared helper module live at `backend/src/character/personality-schema.ts` or `shared/src/personality-schema.ts`? | **`backend/src/character/`** | `shared` is for TYPES + constants consumable by frontend. The Zod fragment is backend-only (LLM schema). Splitting would force a second mapper in frontend land. |
| Should the retry heuristic live inline in `npcs-step.ts` or as a separate module? | **Inline** (with inline test) | Single caller today. Extracting would scatter related logic. If a second caller appears (e.g., `npc-generator.ts` wants the same retry), THEN extract. YAGNI. |
| Should `isIncompletePersonalityPack` return true when ANY sub-field is empty, or only when ALL are empty? | **ALL empty** (AND semantics) | Strict predicate = fewer false positives = cleaner idempotency. Legitimate sparse personalities (character has no contradictions) don't trip the filter. |
| Should `incomplete-pack` mode write a different config.json sentinel? | **Reuse the same `personalityBackfillComplete: true`** | Single flag means "full data present". Drift-resistant. |
| Should the retry prompt include the previous (bad) sample lines as negative examples? | **No — just ask fresh** | Including bad examples biases the LLM toward the same pattern. Fresh ask with explicit constraint ("no opener clichés") is cleaner. |
| Should the integration test assert on ALL 7 personality fields, or just the 3 most user-visible? | **All 7** (non-empty string OR non-empty array) | The user-visible regression is the whole block being silent. Full-field assertion catches partial regressions from future PRs. |

### Known risks

1. **Prompt-token bloat.** Adding ~300-500 input tokens + ~400 output tokens per NPC may approach model context limits on large scaffolds (10-15 NPCs × sequential). Mitigation: compact-mode fallback already exists at lines 301-305. Monitor latency during live smoke test (recommended during 64-xx verification wave).
2. **Shared helper type drift.** If `CharacterPersonality` gains a new field (e.g., `archetype`), both `mapFlatPersonalityToNested` AND the Zod fragment must be extended in lockstep. Mitigation: the `_assertMapperCompleteness` compile-time assertion in §4.1 catches this at build time.
3. **Retry heuristic false positives.** A character whose legitimate voice is terse (e.g., "Speak." "Move.") could trip the `length < 15` predicate. Mitigation: check on TWO predicates OR (empty count OR all-generic), not either alone. Current spec is strict. If false-positive reports emerge, loosen to OR semantics.
4. **Backfill cost on large campaigns.** An `--mode=incomplete-pack` run on a prod campaign with 50+ worldgen NPCs × $0.002/call = ~$0.10 per campaign. Non-blocking. Operator documentation (SUMMARY) notes expected cost.
5. **Test harness for D-15.** The existing `backfill-personality.test.ts` uses Phase 63 Plan 05's harness — review for reusability with the new mode case. Likely 1-day effort; not a research blocker.
6. **Existing test expectations may break.** `npcs-step.test.ts` current mocks return a detail object WITHOUT the new personality flat keys. After Phase 64 schema extension, Zod defaults will auto-fill to empty strings, so the test won't crash but the new `personality` assertions won't pass unless the mocks are updated. Confirmed during research: Zod `.default("")` covers the undefined path. Plan must update all existing `mockResolvedValueOnce({ object: {...} })` in the test file to include the new fields (§8 example shows the pattern).

---

## 11. Environment Availability

Phase 64 uses no external dependencies beyond what Phase 60/63 already established. Explicit audit:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| GLM LLM provider (builtin `glm-provider`) | Primary NPC detail call + retry call + backfill | ✓ (assumed — user operates this project with GLM keys per MEMORY feedback_glm_default.md) | provider-pinned | None per `feedback_openrouter_embargo.md` — fail loud on exhaustion. |
| Node.js 18+ | All backend code | ✓ | pinned in package.json | — |
| Vitest | Unit + integration tests | ✓ | 2.x | — |
| better-sqlite3 | Backfill DB reads/writes | ✓ | pinned | — |
| Drizzle ORM | Backfill query builder | ✓ | pinned | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

**Skip rationale:** The phase is entirely backend code + schema + test changes. No new external services, no new runtime tools.

---

## 12. Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (backend) |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `npm --prefix backend test -- run <pattern>` |
| Full suite command | `npm --prefix backend test -- run && npm --prefix frontend test -- run` |
| Estimated runtime | ~3-4 min combined |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P64-R1 | `generateNpcsStep` emits full personality for each NPC | unit | `npm --prefix backend test -- run "npcs-step"` | ✅ Extend (D-13) |
| P64-R2 | Shared helper module exports schema fragment + mapper; both npcs-step.ts and npc-generator.ts import it | unit | `npm --prefix backend test -- run "personality-schema"` | ❌ Wave 0 (new test file) |
| P64-R3 | Mapper call order preserves full personality through `fromLegacyScaffoldNpc` | unit (covered by P64-R1 assertion) | Same as P64-R1 | ✅ Extend |
| P64-R4 | Sample-lines retry heuristic triggers on empty/generic/duplicate lines; no retry on good lines | unit | `npm --prefix backend test -- run "sample-lines-retry"` OR inline in npcs-step.test.ts | ❌ Wave 0 |
| P64-R5 | `/api/worldgen/regenerate-section section="npcs"` response contains full `draft.identity.personality` | integration | `npm --prefix backend test -- run "worldgen"` | ✅ Extend (D-14) |
| P64-R6 | Backfill `--mode=incomplete-pack` targets + updates summary-only records; idempotent re-run skips all | integration | `npm --prefix backend test -- run "backfill-personality"` | ✅ Extend (D-15) |
| P64-R7 | All three test surfaces green | full suite | `npm --prefix backend test -- run` | ✅ |
| P64-R8 | Prompt-assembler reads all 7 fields (regression check) | unit (existing Phase 63 test) | `npm --prefix backend test -- run "prompt-assembler.personality"` | ✅ Existing; no change required |

### Sampling Rate
- **Per task commit:** `npm --prefix backend test -- run <affected-test-pattern>` — sub-10s per file.
- **Per wave merge:** Full `backend test` — expect ~2-3 min.
- **Phase gate:** Full suite green (backend + frontend) before `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `backend/src/character/personality-schema.ts` — new shared helper module (covers P64-R2 source).
- [ ] `backend/src/character/__tests__/personality-schema.test.ts` — covers P64-R2 behavior + drift-prevention.
- [ ] Sample-lines retry unit coverage — new file `backend/src/worldgen/scaffold-steps/__tests__/sample-lines-retry.test.ts` OR inline inside existing `npcs-step.test.ts` (planner decides).
- [ ] Extend `backend/src/worldgen/__tests__/npcs-step.test.ts` — assert personality sub-fields non-empty (covers P64-R1, P64-R3).
- [ ] Extend `backend/src/routes/__tests__/worldgen.test.ts` section=npcs test — assert returned `draft.identity.personality` non-empty (covers P64-R5).
- [ ] Extend `backend/src/scripts/__tests__/backfill-personality.test.ts` — new describe block for `incomplete-pack` mode (covers P64-R6).

*(If existing test suites cover all requirements, state so explicitly. Here, 3 test files already exist and are extended; 2 new files are added.)*

---

## 13. Sources

### Primary (HIGH confidence — direct source inspection)

- `backend/src/worldgen/scaffold-steps/npcs-step.ts:38-73` — current `npcDetailSingleSchema` (stub).
- `backend/src/worldgen/scaffold-steps/npcs-step.ts:330-364` — current detail prompt (FIELD INSTRUCTIONS).
- `backend/src/worldgen/scaffold-steps/npcs-step.ts:545-573` — current stub personality write block (target of fix).
- `backend/src/worldgen/scaffold-steps/npcs-step.ts:575-584` — `enrichKnownIpWorldgenNpcDraft` call (D-07 boundary).
- `backend/src/character/npc-generator.ts:29-35` — reference flat personality Zod fragment (hoist source).
- `backend/src/character/npc-generator.ts:111-118` — reference flat→nested mapping (hoist source).
- `backend/src/character/npc-generator.ts:54-63` — `buildNpcFlatOutputStrategy` — prompt bullet pattern reference.
- `backend/src/character/record-adapters.ts:262-281` — `blankPersonality` + `normalizePersonality` (defensive normalize).
- `backend/src/character/record-adapters.ts:652-682` — `fromLegacyScaffoldNpc` call chain.
- `backend/src/character/record-adapters.ts:722-780` — `reconcileDraftBackedScaffoldNpc` (save-edits path; confirms `npc.draft.identity.personality` preservation).
- `backend/src/engine/prompt-assembler.ts:1375-1397` — `buildPersonalityLines` (reader — no change needed).
- `backend/src/engine/prompt-assembler.ts:1409-1443` — `buildRuntimeIdentityLines` (consumer — no change needed).
- `backend/src/routes/worldgen.ts:519-607` — `/regenerate-section` endpoint (no code change).
- `backend/src/routes/worldgen.ts:594-596` — `case "npcs"` branch (delegates to `generateNpcsStep`).
- `backend/src/routes/schemas.ts:743-767` — `regenerateSectionSchema` (no change).
- `backend/src/routes/schemas.ts:404-412` — `characterPersonalitySchema` (read-only reference).
- `backend/src/routes/schemas.ts:438` — `personality: characterPersonalitySchema.optional()` on `characterIdentityDraftSchema` (no change).
- `shared/src/types.ts:310` — `CharacterPersonality` type definition.
- `shared/src/types.ts:337` — `personality?: CharacterPersonality` on `CharacterIdentityDraft`.
- `backend/src/worldgen/__tests__/npcs-step.test.ts:1-381` — existing test structure + mock patterns to extend (D-13).
- `backend/src/routes/__tests__/worldgen.test.ts:1889-1918` — existing integration test for `section=npcs` to extend (D-14).
- `backend/src/scripts/backfill-personality.ts:1-545` — existing backfill script + REVIEWS fixes pattern for `incomplete-pack` mode extension (D-10..D-12).
- `.planning/phases/63-personality-interiority-model/63-CONTEXT.md` — Phase 63 locked schema decisions.
- `.planning/phases/63-personality-interiority-model/63-RESEARCH.md` — Phase 63 architecture details; backfill section reference.
- `.planning/phases/63-personality-interiority-model/63-VALIDATION.md` — Phase 63 Nyquist format inherited for Phase 64.
- `.planning/phases/63-personality-interiority-model/63-05-backfill-PLAN.md` — Plan 05 REVIEWS fixes pattern (mandatory-backup, idempotent, dry-run flag).
- `./CLAUDE.md` — project coding style + GitNexus mandates.
- `./.planning/config.json` — `nyquist_validation: true` confirms §12 section required.

### Secondary (MEDIUM confidence)

- `backend/src/character/ingestion/retry.ts` (not read directly; signature inferred from Plan 63-05 doc at line 126: `withPipelineRetry<T>(label: string, fn: () => Promise<T>): Promise<T>`). Reasonable confidence from repeated pattern use in other Phase 60 plans.

### Tertiary (LOW confidence — flagged)

- None — all critical decisions traced to directly-read source. The only inference not verified is the exact GLM provider variance on the new Zod schema fragment (content retry is likely bounded; schema retry handled by `safeGenerateObject` which wraps the ai SDK's retry builtin). Plan should run a real-LLM smoke test (recommended optional PinchTab evidence step) to validate prompt behavior against GLM-default.

---

## Metadata

**Confidence breakdown:**
- Shared helper design: HIGH — directly mirrored from working `npc-generator.ts` reference.
- npcs-step change set: HIGH — target code lines verified; call order analyzed.
- Retry heuristic: MEDIUM — predicate designed but not benchmarked against real LLM output; plan should capture one smoke dump.
- Backfill extension: HIGH — existing script covers 80% of needed infrastructure; predicate is small addition.
- Regression surface: HIGH — grep + file reads cover all personality readers in repo.
- Test strategy: HIGH — all target test files exist; extension paths are mechanical.
- Environment: HIGH — no external deps added.

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30 days — phase scope is narrow; no fast-moving upstream deps).
