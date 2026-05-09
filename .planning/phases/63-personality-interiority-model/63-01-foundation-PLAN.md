---
phase: 63-personality-interiority-model
plan: 01
slug: foundation
type: execute
wave: 1
status: draft
depends_on: []
files_modified:
  - shared/src/types.ts
  - shared/src/index.ts
  - backend/src/routes/schemas.ts
  - backend/src/character/record-adapters.ts
  - backend/src/character/ingestion/mes-example-parser.ts
  - backend/src/character/ingestion/__tests__/mes-example-parser.test.ts
  - backend/src/routes/__tests__/schemas.personality.test.ts
  - backend/src/scripts/.gitkeep
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - docs/mechanics.md
  - docs/memory.md
autonomous: true
requirements: [P63-R3, P63-R7]
must_haves:
  truths:
    - "shared/src/types.ts exports CharacterPersonality and CharacterIdentityDraft.personality is optional"
    - "Zod characterPersonalitySchema validates payloads inside characterIdentityDraftSchema"
    - "Legacy INNER fields (motives/pressureResponses/taboos/traits/flaws/legacyTags) read as .optional() during migration window; behavioralCore WRAPPER stays defaulted (never undefined) until cleanup phase"
    - "extractSampleLinesFromMesExample returns at most 3 char turns, ≥20 chars each, no OOC, no action-only, works on V2 + V3 card formats"
    - "REQUIREMENTS.md gains a Phase 63 section with P63-R1..P63-R8 and 8 traceability rows"
    - "ROADMAP.md Phase 63 entry has a real Goal, the 6 plan list, and the 8 requirement IDs"
    - "backend/src/scripts/ directory exists (with .gitkeep) so 63-05 has a place to land"
  artifacts:
    - path: shared/src/types.ts
      provides: "CharacterPersonality interface + optional personality on CharacterIdentityDraft + Partial<CharacterPersonality> on CharacterDraftPatch"
      contains: "interface CharacterPersonality"
    - path: backend/src/routes/schemas.ts
      provides: "characterPersonalitySchema + .optional() on legacy INNER fields (wrapper behavioralCore stays defaulted)"
      contains: "characterPersonalitySchema"
    - path: backend/src/character/record-adapters.ts
      provides: "normalizePersonality() helper consumed by normalizeCharacterDraftRecord"
      contains: "normalizePersonality"
    - path: backend/src/character/ingestion/mes-example-parser.ts
      provides: "extractSampleLinesFromMesExample(raw) → string[]"
      contains: "extractSampleLinesFromMesExample"
    - path: backend/src/character/ingestion/__tests__/mes-example-parser.test.ts
      provides: "Vitest coverage for 11+ cases including V3 card payloads (P63-R3)"
    - path: backend/src/routes/__tests__/schemas.personality.test.ts
      provides: "Vitest coverage for personality acceptance + legacy optional inner fields (P63-R7)"
    - path: backend/src/scripts/.gitkeep
      provides: "Placeholder so the new scripts directory exists for plan 63-05"
    - path: .planning/REQUIREMENTS.md
      provides: "Phase 63 requirements section + 8 traceability rows"
      contains: "Phase 63 — Personality Interiority Model"
    - path: .planning/ROADMAP.md
      provides: "Phase 63 entry rewritten with goal + plan list"
      contains: "63-06-PLAN.md"
  key_links:
    - from: backend/src/routes/schemas.ts
      to: shared/src/types.ts
      via: "Zod schema mirrors TypeScript interface CharacterPersonality"
      pattern: "characterPersonalitySchema"
    - from: backend/src/character/record-adapters.ts
      to: shared/src/types.ts
      via: "normalizePersonality returns CharacterPersonality shape"
      pattern: "normalizePersonality"
---

<objective>
Land the schema + parser + documentation foundation that the rest of Phase 63 depends on.

Purpose: Every other plan in Phase 63 (ingestion, engine consumers, UI, backfill, verification) needs the personality types in `@worldforge/shared`, a Zod contract that accepts the new block while still reading legacy records, the deprecated INNER fields demoted to `.optional()` for backward-read compat, the V2/V3 `mes_example` parser ready to call from synthesizer integration, the project-level requirements/roadmap pinned to this phase, and a `backend/src/scripts/` directory that 63-05 can drop the backfill script into.

**Review-fix note (REVIEWS.md consensus blocker #3, Codex HIGH):** The original plan made `characterIdentityDraftSchema.behavioralCore` optional at the WRAPPER level. That changes parsed object shape immediately and breaks code paths that rely on the default (non-optional-chained `.behavioralCore.X` accessors). THIS PLAN keeps the wrapper defaulted and demotes only the legacy INNER fields (`motives`, `pressureResponses`, `taboos`, `traits`, `flaws`, `legacyTags`) to `.optional()`. Wrapper-level optionality lands in the cleanup phase (64+) after all consumers are converted.

**Review-fix note (REVIEWS.md consensus blocker #1, Codex HIGH):** The original plan updated `prompt-contract.ts` rule strings + pinned generator/npc-generator test assertions in this plan, BEFORE 63-02 extends `richCharacterSchema`. That creates a live contract mismatch where prompts instruct personality-shaped output while generation schema still expects old shape. MOVED to 63-02 as a task sequenced AFTER `richCharacterSchema` extension so they commit atomically.

Output:
- `CharacterPersonality` type + Zod schema available codebase-wide
- Legacy INNER fields demoted to `.optional()` (wrapper `behavioralCore` stays defaulted)
- `extractSampleLinesFromMesExample` ready to wire into the V2/V3 ingestion path (63-02), tested against realistic V3 card payloads
- `normalizePersonality` helper available to record adapters
- `REQUIREMENTS.md` + `ROADMAP.md` Phase 63 entries finalized (P63-R1..R8 traceable)
- `backend/src/scripts/` directory exists for 63-05
- `docs/mechanics.md` + `docs/memory.md` mention the new personality block
- **NOT in this plan:** `prompt-contract.ts` rule string rewrites + pinned test updates — moved to 63-02 for atomic land with richCharacterSchema
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/63-personality-interiority-model/63-CONTEXT.md
@.planning/phases/63-personality-interiority-model/63-RESEARCH.md
@.planning/phases/63-personality-interiority-model/63-VALIDATION.md
@.planning/phases/63-personality-interiority-model/63-REVIEWS.md
@CLAUDE.md
@shared/src/types.ts
@backend/src/routes/schemas.ts
@backend/src/character/record-adapters.ts
@backend/src/character/ingestion/types.ts
@frontend/lib/v2-card-parser.ts

<interfaces>
<!-- Contracts the executor must implement against. From RESEARCH §2.2-2.4 + §5.4. -->
<!-- TypeScript additions to shared/src/types.ts (after CharacterIdentityLiveDynamics ~line 307): -->
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

export interface CharacterIdentityDraft {
  // ...existing unchanged...
  personality?: CharacterPersonality;
}

// Extend CharacterDraftPatch (~line 451):
identity?: Partial<Omit<CharacterIdentityDraft, "baseFacts" | "behavioralCore" | "liveDynamics" | "personality">> & {
  baseFacts?: Partial<CharacterIdentityBaseFacts>;
  behavioralCore?: Partial<CharacterIdentityBehavioralCore>;
  liveDynamics?: Partial<CharacterIdentityLiveDynamics>;
  personality?: Partial<CharacterPersonality>;
};
```

<!-- Zod additions in backend/src/routes/schemas.ts: -->
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

// Add to characterIdentityDraftSchema after liveDynamics:
personality: characterPersonalitySchema.optional(),

// Demote legacy INNER fields to .optional() (REVIEWS fix #3 — wrapper stays defaulted):
// Inside characterIdentityBehavioralCoreSchema:
//   motives:            z.array(z.string()).default([]) → z.array(z.string()).optional()
//   pressureResponses:  z.array(z.string()).default([]) → z.array(z.string()).optional()
//   taboos:             z.array(z.string()).default([]) → z.array(z.string()).optional()
//   (keep attachments + selfImage defaulted for now; 63-03 owns attachments migration)
// characterIdentityDraftSchema.behavioralCore — KEEP .default({...}), do NOT change to .optional()
// capabilitiesSchema.traits + .flaws → .optional()
// provenanceSchema.legacyTags → .optional()
```

<!-- mes-example-parser contract (RESEARCH §5.4): -->
```ts
export function extractSampleLinesFromMesExample(raw: string): string[];
// - Returns [] on empty/null input.
// - Walks line-by-line; <START> resets context; only {{char}}: turns are captured.
// - Strips inline (OOC: ...) and skips lines starting with [OOC] or (ooc.
// - Filters: length ≥ 20, not action-only (^\*[^*]+\*\s*$).
// - Sorts: prefer dialog-bearing turns, then longer-first.
// - Returns top 3.
// - Works on V2 + V3 cards (both use {{char}}:/{{user}}: markers; V3 may nest mes_example inside data{})
```

<!-- normalizePersonality contract (RESEARCH §2.4): -->
```ts
function normalizePersonality(record: CharacterDraftRecord): CharacterPersonality;
// Returns sentinel { summary: "", voice: "", decisionStyle: "", worldview: "",
//   internalContradictions: [], personalMythology: "", sampleLines: [] }
// when record.identity.personality is undefined; .summary === "" marks "needs backfill".
// Does NOT call LLM. Pure data shaping.
```

</interfaces>

<project_conventions>
- TypeScript strict mode, ES modules, Zod for ALL schemas (CLAUDE.md).
- `@worldforge/shared` is the single source of truth for cross-package types — never duplicate the interface in backend/.
- Legacy deprecation strategy (RESEARCH §2.3 + REVIEWS fix #3): only INNER legacy fields go `.optional()` during the migration window. Wrapper objects (`behavioralCore`, `capabilities`, `provenance`) stay defaulted so consumers with non-optional-chained access keep working.
- Defaults per RESEARCH §11: `internalContradictions` Zod min=0 (soft-enforce ≥2 via prompt only), `sampleLines` Zod min=0 max=3 (synthesizer prompt requires 2; parser may yield 0 on malformed input).
- **Prompt-contract edits live in 63-02, not here** (REVIEWS fix #1 — atomic land with richCharacterSchema).
</project_conventions>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pre-task gitnexus impact analysis</name>
  <files>(no edits — analysis only)</files>
  <action>
Per CLAUDE.md GitNexus mandatory protocol, run impact analysis BEFORE any edits and capture the d=1 readers + risk level.

Commands (record raw output):
- `gitnexus_impact({target: "CharacterIdentityBehavioralCore", direction: "upstream"})`
- `gitnexus_impact({target: "characterIdentityDraftSchema", direction: "upstream"})`
- `gitnexus_impact({target: "normalizeBehavioralCore", direction: "upstream"})`
- `gitnexus_context({name: "CharacterIdentityBehavioralCore"})`
- `gitnexus_context({name: "buildRuntimeIdentityLines"})`

**Additional check for REVIEWS fix #3 (behavioralCore wrapper optionality):** Grep `behavioralCore?\.` vs `behavioralCore\.` across backend/ + frontend/. Record the count of each pattern. If ANY non-optional-chained `behavioralCore.` accessor exists outside test files, confirm the wrapper MUST stay defaulted (not `.optional()`) in this plan — else they break at runtime.

Cross-check the result against RESEARCH §8.1 (13 backend files + 3 frontend files). Halt if gitnexus reports a reader NOT in RESEARCH §8.1.

If gitnexus warns the index is stale, run `npx gitnexus analyze` first.

Expected risk level: HIGH (per RESEARCH §8.2). Mitigation: inner-field-only `.optional()` keeps wrapper shape stable; later plans replace consumers in lockstep.
  </action>
  <verify>
    <automated>node -e "console.log('gitnexus impact captured + behavioralCore accessor pattern count recorded')"</automated>
  </verify>
  <done>gitnexus impact reports captured; behavioralCore accessor pattern count recorded; HIGH risk acknowledged; no hidden consumers.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: V2/V3 mes_example parser + Vitest unit suite (P63-R3)</name>
  <files>
backend/src/character/ingestion/mes-example-parser.ts
backend/src/character/ingestion/__tests__/mes-example-parser.test.ts
  </files>
  <behavior>
Test cases (per RESEARCH §5.5 + REVIEWS fix #12 V3 card coverage):
- empty / whitespace input → []
- single `<START>` block, one `{{char}}:` turn → 1-element array
- multiple `<START>` blocks, alternating `{{char}}:` / `{{user}}:` → captures only `{{char}}` turns, max 3
- multi-line `{{char}}:` turn (continuation lines without role marker) → joined with single space
- inline `(OOC: ...)` segment stripped from kept turn
- line starting with `[OOC` or `(ooc` → skipped entirely
- turn shorter than 20 chars → filtered out
- action-only turn (`*sighs heavily*`) → filtered out
- length-rank verified: longer dialog-bearing turn precedes shorter one in output
- malformed input (no `{{char}}` markers anywhere) → []
- case-insensitive marker match: `{{Char}}:` and `{{USER}}:` recognized

**V3 card format coverage (REVIEWS fix #12):**
- V3-format with standard `<START>` block + `{{char}}:` markers (identical grammar to V2) → parses correctly
- V3-format WITHOUT `<START>` marker (some V3 cards omit it — the initial block is implicit) → still captures leading `{{char}}:` turns
- V3-format with action-only emotes intermixed with speech turns → emotes filtered, speech kept
- Real V3 payload string pulled from a realistic test fixture (inline literal, not a file) — at least 40 lines of mes_example with 4-6 `<START>` blocks, OOC notes, action descriptions, and speech — confirms top-3 ranking picks the longest dialog-bearing turns
  </behavior>
  <action>
Create the parser per RESEARCH §5.4 algorithm. Implement as a pure function; no I/O. Algorithm:

1. Bail with `[]` when `raw?.trim()` is falsy.
2. Normalize CRLF → LF.
3. Walk lines. Track `inCharTurn` boolean + `currentBuffer: string[]`.
   - Trim each line; skip empty.
   - `^<START>\s*$` (case-insensitive) → flush buffer (if `inCharTurn`), reset.
   - `^\{\{user\}\}\s*:` (case-insensitive) → flush buffer, reset.
   - `^\{\{char\}\}\s*:` (case-insensitive) → flush buffer, set `inCharTurn=true`, seed buffer with text after the marker.
   - Otherwise: if `inCharTurn`, push line to buffer.
4. Flush trailing buffer.
5. Cleanup pass on each captured turn:
   - Replace `\((OOC|ooc)[^)]*\)` with `""` then trim.
   - Drop turns where the original first chars match `^\[?\(?ooc` (case-insensitive).
   - Drop turns shorter than 20 chars after cleanup.
   - Drop action-only turns matching `^\*[^*]+\*\s*$`.
6. Sort: dialog-bearing turns first (heuristic: contains a quote char OR ≥3 word tokens), then by length desc.
7. Return `slice(0, 3)`.

V3 notes: V3 and V2 share the `{{char}}:/{{user}}:` + `<START>` grammar; the only V3-specific difference at the `mes_example` field level is that V3 nests data at `card.data.mes_example` instead of `card.mes_example`. Since this function receives the raw mes_example STRING (not the card envelope), V3/V2 handling is identical here. Envelope-level nesting is 63-02's job in the frontend parser.

Write the Vitest suite with one `describe('extractSampleLinesFromMesExample', ...)` and one `it()` per behavior bullet. Use literal string fixtures inline (no fixture files) so the test file is self-contained.

Reference: this parser is consumed by 63-02's V2/V3 ingestion wiring; do NOT thread it into the synthesizer in this plan.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run mes-example-parser</automated>
  </verify>
  <done>All 15+ Vitest cases pass (11 V2 base + 4 V3 coverage). `extractSampleLinesFromMesExample` exported from `backend/src/character/ingestion/mes-example-parser.ts`. P63-R3 covered.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Shared types + Zod personality schema + INNER-field .optional() (P63-R7)</name>
  <files>
shared/src/types.ts
shared/src/index.ts
backend/src/routes/schemas.ts
backend/src/routes/__tests__/schemas.personality.test.ts
  </files>
  <behavior>
Test cases for `backend/src/routes/__tests__/schemas.personality.test.ts`:
- `characterIdentityDraftSchema.parse({...minimal valid draft, personality: { summary, voice, decisionStyle, worldview, internalContradictions: ["..."], personalMythology, sampleLines: ["q1", "q2"] }})` succeeds; returned object has personality block intact.
- Parsing a draft WITHOUT `personality` succeeds (optional).
- Parsing a draft with legacy `behavioralCore: { motives: ["x"], pressureResponses: ["y"], taboos: ["z"], selfImage: "...", attachments: [], hardConstraints: [] }` succeeds (legacy reads still accepted).
- Parsing a draft where `behavioralCore` is OMITTED — the parsed output STILL has `behavioralCore` as a defaulted object (NOT undefined). This locks REVIEWS fix #3: wrapper stays defaulted.
- Parsing a draft where `behavioralCore.motives` is undefined succeeds (inner-field `.optional()` works).
- Parsing a draft with `capabilities: { skills: [...] }` and no `traits` / `flaws` succeeds; output traits/flaws are undefined (not `[]` default) — inner-field `.optional()`.
- Parsing a draft with `provenance: { sourceKind: "original" }` and no `legacyTags` succeeds; legacyTags is undefined on output.
- `personality.sampleLines` length 4 → Zod throws.
- `personality.summary` length 401 → Zod throws.
- `personality.internalContradictions` length 6 → Zod throws (max 5).
  </behavior>
  <action>
Edit `shared/src/types.ts`:
1. After the existing `CharacterIdentityLiveDynamics` interface (around line 307), insert the `CharacterPersonality` interface from the contract above.
2. In `CharacterIdentityDraft` (around line 318), append `personality?: CharacterPersonality;`.
3. In `CharacterDraftPatch` (around line 451), update the `identity?` shape per the contract above so `personality?: Partial<CharacterPersonality>` is allowed.

Edit `shared/src/index.ts`:
- Add `CharacterPersonality` to the existing type-export block alongside `CharacterIdentityBehavioralCore` (~line 38-42).

Edit `backend/src/routes/schemas.ts` — **REVIEWS fix #3 applies here**:
1. Insert `characterPersonalitySchema` between `characterIdentityLiveDynamicsSchema` (~line 396) and `characterIdentityDraftSchema` (~line 403). Use the exact shape from the contract above.
2. Inside `characterIdentityDraftSchema`, add `personality: characterPersonalitySchema.optional()` after the existing `liveDynamics` line.
3. Demote legacy INNER fields to `.optional()` (NOT the wrappers):
   - Inside `characterIdentityBehavioralCoreSchema`:
     - `motives: z.array(z.string()).default([])` → `motives: z.array(z.string()).optional()`
     - `pressureResponses: z.array(z.string()).default([])` → `pressureResponses: z.array(z.string()).optional()`
     - `taboos: z.array(z.string()).default([])` → `taboos: z.array(z.string()).optional()`
     - `attachments` — LEAVE AS-IS (63-03 handles the attachments migration; changing it here fights that plan)
     - `selfImage` — LEAVE AS-IS (stays canonical in behavioralCore)
     - `hardConstraints` — LEAVE AS-IS
   - `characterIdentityDraftSchema.behavioralCore` — LEAVE `.default({...})` AS-IS. Do NOT change to `.optional()`. Wrapper stays defaulted per REVIEWS fix #3.
   - Inside `capabilitiesSchema`:
     - `traits: z.array(z.string()).default([])` → `traits: z.array(z.string()).optional()`
     - `flaws: z.array(z.string()).default([])` → `flaws: z.array(z.string()).optional()`
   - `characterIdentityDraftSchema.capabilities` — LEAVE defaulted (wrapper stays).
   - Inside `provenanceSchema`:
     - `legacyTags: z.array(z.string()).default([])` → `legacyTags: z.array(z.string()).optional()`

Create `backend/src/routes/__tests__/schemas.personality.test.ts` with the behavior cases above. Build a `minimalDraft` factory so each `it()` only varies the field under test. The "draft without behavioralCore → behavioralCore defaulted" case is the load-bearing REVIEWS fix #3 guard.

Pre-task gitnexus check already captured in Task 1 accessor-pattern count. No additional check needed.
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run schemas.personality</automated>
  </verify>
  <done>Backend typecheck green. New Vitest suite passes. P63-R7 covered. `CharacterPersonality` exported from `@worldforge/shared`. Wrapper-level `behavioralCore` stays defaulted; only inner legacy fields are `.optional()`.</done>
</task>

<task type="auto">
  <name>Task 4: record-adapters.normalizePersonality + identity wiring</name>
  <files>
backend/src/character/record-adapters.ts
  </files>
  <action>
Pre-task: `gitnexus_impact({target: "normalizeCharacterDraftRecord", direction: "upstream"})` and `gitnexus_context({name: "normalizeBehavioralCore"})`. Confirm reader set; halt if anything is unexpected.

Edits per RESEARCH §2.4:
1. Add `normalizePersonality(record)` helper near the existing normalizers (search for `normalizeBehavioralCore` and place adjacent). Returns:
   ```ts
   {
     summary: record?.identity?.personality?.summary ?? "",
     voice: record?.identity?.personality?.voice ?? "",
     decisionStyle: record?.identity?.personality?.decisionStyle ?? "",
     worldview: record?.identity?.personality?.worldview ?? "",
     internalContradictions: record?.identity?.personality?.internalContradictions ?? [],
     personalMythology: record?.identity?.personality?.personalMythology ?? "",
     sampleLines: record?.identity?.personality?.sampleLines ?? [],
   }
   ```
   Pure data shaping; NO LLM call. The empty `summary` is the "needs backfill" sentinel consumed by 63-05.
2. In `normalizeCharacterDraftRecord` (RESEARCH cites lines 154-195), add `personality: normalizePersonality(record)` to the returned `identity` object so downstream consumers always see a populated shape.
3. DO NOT delete `normalizeBehavioralCore` — it must keep producing the legacy-shape read for the migration window (RESEARCH §2.4 + §11 risk #4 mitigation). Plans 63-03 swap consumers to read `personality` first; legacy fallback stays alive.

**Review-fix note (REVIEWS consensus blocker #2 — Codex HIGH):** The `attachments` bridge direction is 63-03's job, NOT this task. Do NOT add the `liveDynamics.attachments ?? behavioralCore.attachments` read here. That bridge lands in 63-03 Task 2 where `liveDynamics.attachments` also gets added to types + Zod.

No new tests added in this task — `record-adapters.identity.test.ts` is updated in 63-02 alongside the synthesizer changes (RESEARCH §9.2 list).
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck</automated>
  </verify>
  <done>`normalizePersonality` exported and used inside `normalizeCharacterDraftRecord`; backend typecheck passes; legacy `normalizeBehavioralCore` untouched; attachments bridge deferred to 63-03.</done>
</task>

<task type="auto">
  <name>Task 5: Create backend/src/scripts/ directory placeholder for 63-05</name>
  <files>
backend/src/scripts/.gitkeep
  </files>
  <action>
Create the directory `backend/src/scripts/` (does not currently exist per RESEARCH §7) and a `.gitkeep` so 63-05 can land `backfill-personality.ts` and a `__tests__/` subfolder without first having to create the directory inside that plan. `.gitkeep` content:

```
# Phase 63 reservation. Plan 63-05 lands backfill-personality.ts and __tests__/ here.
```

No tsconfig changes needed — `backend/tsconfig.json` already includes `src/**/*`.
  </action>
  <verify>
    <automated>node -e "require('fs').accessSync('backend/src/scripts/.gitkeep')"</automated>
  </verify>
  <done>Directory + placeholder file committed; `ls backend/src/scripts/` lists `.gitkeep`.</done>
</task>

<task type="auto">
  <name>Task 6: REQUIREMENTS.md — add Phase 63 section + 8 traceability rows</name>
  <files>
.planning/REQUIREMENTS.md
  </files>
  <action>
Edit `.planning/REQUIREMENTS.md`:

1. Append a new subsection under `## v1.1 Requirements`, placed AFTER the existing `### Phase 62 - Advanced Character Inspector Complement Redesign` block:

```markdown
### Phase 63 — Personality Interiority Model

- [ ] **P63-R1**: `CharacterPersonality` block present on every `CharacterIdentityDraft` produced by all 4 ingestion paths (parse / generate / research / import). Every field non-empty when source material is non-trivial; `sampleLines[]` length ≥ 2 and ≤ 3.
- [ ] **P63-R2**: Prompt assembler runtime identity block emits a `Personality:` section with `summary / voice / decision-style / worldview / internal-contradictions / personal-mythology / sample-lines` and no longer emits `motives / pressure / taboos`. `attachments` reads from `liveDynamics.attachments`.
- [ ] **P63-R3**: V2/V3 card import maps `card.personality` → `personality.summary` and parses `card.mes_example` `{{char}}` turns → `personality.sampleLines` (2-3, ≥20 chars, no OOC markers). LLM-pass derives `voice / decisionStyle / worldview / internalContradictions / personalMythology`.
- [ ] **P63-R4**: Basic NPC card (`npcs-section.tsx`) renders a PERSONALITY section between Tags and PowerStats. `summary` + `voice` always visible; `sampleLines / decisionStyle / worldview / internalContradictions / personalMythology` reveal via a collapsible control.
- [ ] **P63-R5**: Advanced inspector (`character-record-inspector.tsx`) no longer renders blocks for `motives / pressureResponses / taboos / traits / flaws / legacyTags`. Provenance section is removed (metadata only reachable via Raw JSON tab).
- [ ] **P63-R6**: Backfill script (`backend/src/scripts/backfill-personality.ts`) populates `personality` on every pre-existing player + NPC row with empty `personality.summary`, in batches of 5-10 parallel `generateObject` calls, with idempotency check, per-record structured logs, backup file written before each update, `withPipelineRetry` retry wrapper, re-read-before-write safeguard, and a `--dry-run` flag.
- [ ] **P63-R7**: Zod schemas accept the new `personality` block and keep `motives / pressureResponses / taboos / traits / flaws / legacyTags` as `.optional()` reads during the migration window. Wrapper objects (`behavioralCore`, `capabilities`, `provenance`) stay defaulted.
- [ ] **P63-R8**: NPC runtime prompts (`npc-agent.ts`, `npc-offscreen.ts`) and reflection prompt (`reflection-agent.ts`) read from `personality.*` instead of `behavioralCore.motives / pressureResponses / taboos`.
```

2. Append 8 rows to the Traceability table (between the last `P62-R5` row and the `**Coverage:**` line):

```markdown
| P63-R1 | Phase 63 | Planned |
| P63-R2 | Phase 63 | Planned |
| P63-R3 | Phase 63 | Planned |
| P63-R4 | Phase 63 | Planned |
| P63-R5 | Phase 63 | Planned |
| P63-R6 | Phase 63 | Planned |
| P63-R7 | Phase 63 | Planned |
| P63-R8 | Phase 63 | Planned |
```

3. Update the **Coverage:** counts:
   - "v1.1 requirements: 28 total" → "36 total"
   - "Mapped to phases: 28" → "36"
   - Unmapped stays "0 ✓"

4. Update the trailing comment line: "*Last updated: 2026-04-18 after Phase 62 planning*" → "*Last updated: 2026-04-18 after Phase 63 planning*".
  </action>
  <verify>
    <automated>node -e "const t=require('fs').readFileSync('.planning/REQUIREMENTS.md','utf8'); for(const id of ['P63-R1','P63-R2','P63-R3','P63-R4','P63-R5','P63-R6','P63-R7','P63-R8']){ if(!t.includes(id)) throw new Error('missing '+id); } if(!t.includes('### Phase 63 — Personality Interiority Model')) throw new Error('missing section'); console.log('REQUIREMENTS.md OK');"</automated>
  </verify>
  <done>All 8 P63-R* IDs appear in both the section list and the Traceability table. Coverage count updated to 36/36.</done>
</task>

<task type="auto">
  <name>Task 7: ROADMAP.md — finalize Phase 63 entry</name>
  <files>
.planning/ROADMAP.md
  </files>
  <action>
Replace the current Phase 63 stub (lines ~428-436) with:

```markdown
### Phase 63: Personality Interiority Model

**Goal:** Replace the flat behavioral model (`behavioralCore.motives/taboos/pressureResponses` + `capabilities.traits/flaws` + `provenance.legacyTags`) with a V2-SillyTavern-style personality interiority block (`summary / voice / decisionStyle / worldview / internalContradictions / personalMythology / sampleLines`) on every `CharacterIdentityDraft`. The block flows through all 4 ingestion paths (parse / generate / research / V2 import — including `mes_example` → `sampleLines`), replaces a specific region of the runtime prompt assembler + npc-agent + npc-offscreen + reflection prompts, surfaces in the basic NPC card (always-visible summary+voice + collapsible details) and the player CharacterCard, drops the deprecated fields from the advanced inspector + character form, and an LLM-packed backfill script populates pre-existing characters. Deprecated INNER fields stay `.optional()` for one phase window for backward read (wrappers stay defaulted); final removal is a follow-up cleanup phase.
**Requirements**: P63-R1, P63-R2, P63-R3, P63-R4, P63-R5, P63-R6, P63-R7, P63-R8
**Depends on:** Phase 62
**Plans:** 6 plans

Plans:
- [ ] 63-01-foundation-PLAN.md — Shared types + Zod (inner-field .optional() only; wrapper stays defaulted) + record-adapter normalizers + mes-example-parser (V2+V3 coverage) + REQUIREMENTS/ROADMAP/docs housekeeping + backend/src/scripts/ directory.
- [ ] 63-02-ingestion-pipeline-PLAN.md — richCharacterSchema personality flat-keys, buildFlatOutputStrategy, synthesizer prompt, all 4 route prompts, V2/V3 mesExample threading + parser integration, prompt-contract rule strings + pinned tests (atomic with schema), persona-template merge, synthesizer + integration tests.
- [ ] 63-03-engine-consumers-PLAN.md — prompt-assembler `Personality:` block, npc-agent / npc-offscreen / reflection-agent / reflection-tools rewrites, liveDynamics.attachments migration with read-time fallback from behavioralCore.attachments, snapshot tests for each.
- [ ] 63-04-ui-PLAN.md — `PersonalitySection` shared atom, basic NPC card insertion, player CharacterCard integration, advanced inspector cleanup (drop motives/traits/flaws/legacyTags + entire Provenance section, drop section count 10 → 9), character-form trait/flaw editor removal, all associated test updates.
- [ ] 63-05-backfill-PLAN.md — `backend/src/scripts/backfill-personality.ts` with --dry-run + --campaign + --batch-size + per-campaign connectDb/closeDb loop + withPipelineRetry + re-read-before-write safeguard + attachments carry-forward + per-row backup file (real-run only, not dry-run) + Phase 58 structured logging + idempotency Vitest, npm script wiring.
- [ ] 63-06-verification-PLAN.md — Full backend + frontend Vitest suites, real-path verification for all 4 ingestion modes (parse/generate/research/V2 import), PinchTab smoke with HTTP fallback path on basic NPC card PERSONALITY rendering, manual backfill run on dev campaign, `63-VALIDATION.md` sign-off, gitnexus_detect_changes report, Phase 62 P62-R2 section-order test updated 10 → 9.
```

Do NOT modify any other roadmap entries.
  </action>
  <verify>
    <automated>node -e "const t=require('fs').readFileSync('.planning/ROADMAP.md','utf8'); if(!t.includes('63-06-verification-PLAN.md')) throw new Error('plan list missing'); if(t.includes('Phase 63: Personality Interiority Model\n\n**Goal:** [To be planned]')) throw new Error('stub still present'); if(!t.match(/Plans:.*6 plans/)) throw new Error('plan count not 6'); console.log('ROADMAP.md OK');"</automated>
  </verify>
  <done>Phase 63 entry shows real Goal, all 8 requirement IDs, and 6 plan list with proper filenames.</done>
</task>

<task type="auto">
  <name>Task 8: docs/mechanics.md + docs/memory.md — personality alignment edits</name>
  <files>
docs/mechanics.md
docs/memory.md
  </files>
  <action>
Per RESEARCH §11 (DOCA-style alignment, defer-not-permitted) and the open-questions table answer "Yes, but defer to a tiny doc-alignment task within Phase 63":

`docs/mechanics.md`:
- Locate the section that describes character/NPC structure (search for "behavioralCore" or "motives/taboos"). Add a short paragraph (3-5 sentences) describing the new `personality` block: what fields it contains, that it replaces explicit motives/taboos/pressureResponses (which the LLM now derives situationally), and that V2/V3 cards' `mes_example` field is parsed into `personality.sampleLines`.

`docs/memory.md`:
- Locate the section that describes prompt assembly / character record shape. Add a short note that the runtime identity block now emits a `Personality:` section (summary, voice, decision-style, worldview, internal-contradictions, personal-mythology, sample-lines) instead of `Behavioral Core: motives | pressure | taboos`. `attachments` now reads from `liveDynamics.attachments` (with read-time fallback from `behavioralCore.attachments` for legacy records during the migration window).

Edits are minimal — small paragraphs, not section rewrites. Goal is to keep the docs from drifting (DOCA pattern). If the existing files have no obvious section about character identity, append a new `## Phase 63 Personality Block (2026-04)` subsection at the end with the same content.
  </action>
  <verify>
    <automated>node -e "for (const f of ['docs/mechanics.md','docs/memory.md']) { const t=require('fs').readFileSync(f,'utf8'); if(!/personality/i.test(t)) throw new Error(f+' missing personality reference'); } console.log('docs OK');"</automated>
  </verify>
  <done>Both docs reference the personality block; word `personality` (case-insensitive) appears in each.</done>
</task>

</tasks>

<verification>
- Backend: `npm --prefix backend run typecheck` exits 0.
- Backend: `npm --prefix backend test -- run "mes-example-parser|schemas.personality"` exits 0.
- Files-on-disk: `backend/src/scripts/.gitkeep`, `backend/src/character/ingestion/mes-example-parser.ts`, `backend/src/character/ingestion/__tests__/mes-example-parser.test.ts`, `backend/src/routes/__tests__/schemas.personality.test.ts` all exist.
- `.planning/REQUIREMENTS.md` contains 8 P63-R* rows; `.planning/ROADMAP.md` Phase 63 stub replaced.
- Zod schema check: parsing a draft without `behavioralCore` yields a defaulted object (NOT undefined) — REVIEWS fix #3 guard test passes.
- No edits to `backend/src/character/prompt-contract.ts` in this plan — moved to 63-02 per REVIEWS fix #1.
- gitnexus impact reports for the 4 anchor symbols captured + behavioralCore accessor-pattern count recorded.

Post-task: `gitnexus_detect_changes({scope: "all"})` — confirm change scope matches `files_modified` (note `prompt-contract.ts` + generator/npc-generator tests are NOT in this plan's files_modified; they belong to 63-02).
</verification>

<success_criteria>
- `CharacterPersonality` exported from `@worldforge/shared` and consumable by both backend + frontend.
- Zod `characterPersonalitySchema` accepts well-formed payloads; legacy INNER fields (motives/pressure/taboos/traits/flaws/legacyTags) read as `.optional()`; wrapper objects (`behavioralCore`, `capabilities`, `provenance`) stay DEFAULTED (not undefined) per REVIEWS fix #3.
- `extractSampleLinesFromMesExample` exported; 15+ Vitest cases green (V2 base + V3 coverage).
- `normalizePersonality` consumed by `normalizeCharacterDraftRecord`; legacy `normalizeBehavioralCore` untouched.
- `REQUIREMENTS.md` + `ROADMAP.md` Phase 63 entries finalized.
- `backend/src/scripts/` directory exists for 63-05.
- `docs/mechanics.md` + `docs/memory.md` reference the personality block.
- `prompt-contract.ts` NOT edited here (moved to 63-02).
- P63-R3 + P63-R7 fully covered by automated tests landing in this plan.
</success_criteria>

<requirement_coverage>
- **P63-R3** — `extractSampleLinesFromMesExample` + Vitest suite landed (parser ready for 63-02 wiring, V3 coverage included).
- **P63-R7** — Zod schema accepts personality + legacy INNER fields demoted to `.optional()` (wrappers stay defaulted); `schemas.personality.test.ts` proves contract.
- Foundation for P63-R1 (shared types), P63-R2/R8 (record-adapters preconditions — prompt-contract is 63-02's job now), P63-R5 (`.optional()` lets inspector drop without Zod failure), P63-R6 (`backend/src/scripts/` exists).
</requirement_coverage>

<estimates>
- **Effort:** ~45 min Claude execution time (8 atomic edit tasks; prompt-contract Task cut so 1 fewer task than original plan).
- **LLM token cost:** ~0 (pure code/docs edits, no `generateObject` calls).
- **Test runtime:** ~15s for combined backend Vitest filter.
</estimates>

<risks>
- **R1 — Shared package build cascade.** Adding `CharacterPersonality` to `@worldforge/shared` may require `npm run build` in shared/ before backend/frontend pick it up. **Mitigation:** include shared build step in verify command if `npm --prefix backend run typecheck` fails on missing export.
- **R2 — Inner-field `.optional()` vs wrapper defaulted (REVIEWS fix #3).** Some consumers may rely on `.behavioralCore.motives` being an array; marking motives `.optional()` means callers must null-check before `.forEach`/`.map`. **Mitigation:** Task 1 grep of `behavioralCore.motives` (no optional chain) catches all at-risk callers; if any exist outside test files, document them as 63-03 conversion targets.
- **R3 — gitnexus index staleness.** All gitnexus calls in this plan rely on a fresh index. **Mitigation:** Task 1 explicitly runs `npx gitnexus analyze` if any tool reports staleness.
- **R4 — V3 fixture realism.** Real V3 cards can have quirky mes_example formatting not fully captured by inline string fixtures. **Mitigation:** V3 tests are designed to degrade gracefully (returns `[]` on total malformation); 63-06 adds real-card verification for edge cases.
- **R5 — Docs alignment scope creep.** Task 8 risks turning into a full docs rewrite. **Mitigation:** explicit "minimal — small paragraphs, not section rewrites" guidance.
</risks>

<output>
After completion, create `.planning/phases/63-personality-interiority-model/63-01-SUMMARY.md` with:
- Tasks completed (1-8; note Task 5 from original plan moved to 63-02)
- Files modified (per `files_modified` frontmatter — `prompt-contract.ts` + `generator.test.ts` + `npc-generator.test.ts` are NOT in this plan)
- gitnexus impact report digest (Task 1 output) + behavioralCore accessor-pattern count
- Test commands run + pass/fail evidence
- Any deviations from the plan and rationale
- REVIEWS.md fixes applied in this plan: #1 (prompt-contract moved to 63-02), #3 (wrapper stays defaulted), #12 (V3 card test coverage)
</output>
