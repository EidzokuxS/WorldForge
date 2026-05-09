---
phase: 63-personality-interiority-model
plan: 02
slug: ingestion-pipeline
type: execute
wave: 2
status: draft
depends_on: [63-01]
files_modified:
  - backend/src/character/generator.ts
  - backend/src/character/record-adapters.ts
  - backend/src/character/ingestion/types.ts
  - backend/src/character/ingestion/synthesizer.ts
  - backend/src/character/v2-sections.ts
  - backend/src/character/persona-templates.ts
  - backend/src/character/archetype-researcher.ts
  - backend/src/character/npc-generator.ts
  - backend/src/character/prompt-contract.ts
  - backend/src/character/__tests__/generator.test.ts
  - backend/src/character/__tests__/npc-generator.test.ts
  - backend/src/routes/schemas.ts
  - backend/src/worldgen/scaffold-steps/npcs-step.ts
  - frontend/lib/v2-card-parser.ts
  - backend/src/character/ingestion/__tests__/synthesizer.personality.test.ts
  - backend/src/character/ingestion/__tests__/pipeline.personality-e2e.test.ts
  - backend/src/character/__tests__/persona-templates.test.ts
  - backend/src/character/__tests__/record-adapters.identity.test.ts
  - backend/src/worldgen/__tests__/npcs-step.test.ts
autonomous: true
requirements: [P63-R1, P63-R3]
must_haves:
  truths:
    - "All 4 ingestion paths (parse / generate / research / V2 import) emit a populated CharacterPersonality block on the returned CharacterDraft"
    - "richCharacterSchema accepts personality flat-keys; toCharacterDraftFromRich + fromRichParsedCharacter lift them into identity.personality"
    - "personalitySampleLines Zod: .min(0).max(3).default([]) — soft-require ≥2 via prompt text only (REVIEWS fix #5 — Zod default [] cannot violate min(2))"
    - "prompt-contract rule strings reference personality and ship ATOMICALLY with richCharacterSchema extension + pinned test updates (REVIEWS fix #1 — moved from 63-01)"
    - "V2/V3 card payload carries mesExample end-to-end (frontend parser → route → V2CardPayload → synthesizer → buildV2CardSections); V3 nested card.data.mes_example handled"
    - "Synthesizer prompt instructs the LLM to respect parsed sampleLines verbatim when supplied"
    - "persona-template merge handles personality patches"
    - "buildFlatOutputStrategy lists personality flat-keys with the 'lift into identity.personality' rule and soft-requires ≥2 sampleLines in prompt text"
    - "Worldgen NPC scaffold step lifts personality into NPCs"
  artifacts:
    - path: backend/src/character/generator.ts
      provides: "richCharacterSchema personality flat-keys (sampleLines min(0)) + buildFlatOutputStrategy bullet + toCharacterDraftFromRich pass-through"
      contains: "personalitySummary"
    - path: backend/src/character/prompt-contract.ts
      provides: "RICHER_IDENTITY_TRUTH_RULE + FLAT_OUTPUT_ADAPTER_RULE + DETERMINISTIC_MAPPING_RULE rewritten to reference personality"
      contains: "personality"
    - path: backend/src/character/ingestion/synthesizer.ts
      provides: "mesExample → extractSampleLinesFromMesExample → buildV2CardSections SAMPLE LINES section + merge rule"
      contains: "extractSampleLinesFromMesExample"
    - path: backend/src/character/ingestion/types.ts
      provides: "V2CardPayload.mesExample field"
      contains: "mesExample"
    - path: backend/src/character/v2-sections.ts
      provides: "SAMPLE LINES section block when sampleLines.length > 0"
      contains: "SAMPLE LINES"
    - path: frontend/lib/v2-card-parser.ts
      provides: "mesExample extracted from V2 + V3 card JSON + PNG tEXt (V3 nests under data{})"
      contains: "mesExample"
    - path: backend/src/character/ingestion/__tests__/synthesizer.personality.test.ts
      provides: "Vitest coverage for P63-R1"
    - path: backend/src/character/ingestion/__tests__/pipeline.personality-e2e.test.ts
      provides: "All 4 ingestion modes return personality.summary non-empty (mocked LLM)"
  key_links:
    - from: frontend/lib/v2-card-parser.ts
      to: backend/src/character/ingestion/types.ts
      via: "POST body field mesExample threaded through /import-v2-card route"
      pattern: "mesExample"
    - from: backend/src/character/ingestion/synthesizer.ts
      to: backend/src/character/ingestion/mes-example-parser.ts
      via: "extractSampleLinesFromMesExample(card.mesExample) called inside formatCardSection"
      pattern: "extractSampleLinesFromMesExample"
    - from: backend/src/character/generator.ts
      to: shared/src/types.ts
      via: "toCharacterDraftFromRich lifts personality flat-keys into identity.personality"
      pattern: "personality:"
    - from: backend/src/character/prompt-contract.ts
      to: backend/src/character/generator.ts
      via: "richCharacterSchema + prompt-contract rules must land atomically (REVIEWS fix #1)"
      pattern: "RICHER_IDENTITY_TRUTH_RULE"
---

<objective>
Make every character ingestion path emit a populated `CharacterPersonality` block AND land the prompt-contract rule-string rewrites atomically with the richCharacterSchema extension.

Purpose: All 4 routes (`parse-character`, `generate-character`, `research-character`, `import-v2-card`) funnel through `synthesizeDraftFromSources()`, which calls the LLM with `richCharacterSchema` (`backend/src/character/generator.ts:42-77`). Adding the personality flat-keys to that single schema + adapter pair propagates the change to all 4 entry points. The V2 path additionally requires `mes_example` parsing because `frontend/lib/v2-card-parser.ts` doesn't currently extract the field at all (RESEARCH §5.1). The archetype researcher gets one prompt extension. Persona-templates merge gains a `personality` branch. Worldgen NPC step picks up the lift automatically through the synthesizer but its targeted Vitest gets a `personality` assertion update.

**Review-fix note (REVIEWS consensus blocker #1, Codex HIGH):** The `prompt-contract.ts` rule-string rewrites + pinned generator/npc-generator test updates were originally scheduled in 63-01 Task 5. That would create a live contract mismatch: prompts would instruct personality-shaped output BEFORE `richCharacterSchema` extended to accept those keys. Those edits have been moved INTO this plan as Task 7, sequenced AFTER richCharacterSchema extension (Task 2), so the rule strings + schema + pinned tests land in the same atomic commit per RESEARCH §11 risk #4 mitigation.

**Review-fix note (REVIEWS blocker #5, Claude HIGH):** Original spec used `z.array(z.string().max(300)).min(2).max(3).default([])` — Zod throws on default invariant evaluation because `[]` violates `min(2)`. This plan uses `.min(0).max(3).default([])` (harmonized with the shared `characterPersonalitySchema` from 63-01). The "≥2 sampleLines" requirement is enforced via prompt text in `buildFlatOutputStrategy` only — soft requirement, not Zod hard rejection.

Output:
- `richCharacterSchema` accepts 7 personality flat-keys (`personalitySummary` … `personalitySampleLines`)
- `buildFlatOutputStrategy` instructs the LLM how to populate them + soft-requires ≥2 sampleLines
- `toCharacterDraftFromRich` + `fromRichParsedCharacter` lift flat-keys into `identity.personality`
- V2/V3 import threads `mesExample` end-to-end; synthesizer parses and feeds `SAMPLE LINES` into the V2 card section
- Archetype researcher prompt asks for voice-bearing facts
- Persona templates merge personality patches
- Worldgen NPC scaffold step lifts personality
- `prompt-contract.ts` 3 rule strings rewritten + pinned test assertions updated atomically
- New + updated Vitest suites prove every mode populates `identity.personality.summary` non-empty
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
@.planning/phases/63-personality-interiority-model/63-01-foundation-PLAN.md
@CLAUDE.md
@backend/src/character/generator.ts
@backend/src/character/prompt-contract.ts
@backend/src/character/ingestion/synthesizer.ts
@backend/src/character/ingestion/types.ts
@backend/src/character/ingestion/mes-example-parser.ts
@backend/src/character/v2-sections.ts
@backend/src/character/archetype-researcher.ts
@backend/src/character/persona-templates.ts
@backend/src/character/npc-generator.ts
@backend/src/character/record-adapters.ts
@frontend/lib/v2-card-parser.ts
@backend/src/worldgen/scaffold-steps/npcs-step.ts

<interfaces>
<!-- Synthesizer / generator changes (RESEARCH §4.1 + REVIEWS fix #5): -->
```ts
// In backend/src/character/generator.ts richCharacterSchema (after line 77):
personalitySummary: z.string().max(400).default(""),
personalityVoice: z.string().max(600).default(""),
personalityDecisionStyle: z.string().max(400).default(""),
personalityWorldview: z.string().max(400).default(""),
personalityContradictions: z.array(z.string().max(300)).max(3).default([]),
personalityMythology: z.string().max(400).default(""),
personalitySampleLines: z.array(z.string().max(300)).min(0).max(3).default([]),
// NOTE REVIEWS fix #5: min(0) not min(2). "≥2 sampleLines" is enforced via prompt text only.
// Zod .default([]) MUST satisfy all schema invariants — min(2) would throw on invariant eval.

// In toCharacterDraftFromRich (~line 129), pass-through:
identity: {
  // ...existing...
  personality: {
    summary: rich.personalitySummary,
    voice: rich.personalityVoice,
    decisionStyle: rich.personalityDecisionStyle,
    worldview: rich.personalityWorldview,
    internalContradictions: rich.personalityContradictions,
    personalMythology: rich.personalityMythology,
    sampleLines: rich.personalitySampleLines,
  },
},
```

<!-- V2/V3 payload contracts: -->
```ts
// frontend/lib/v2-card-parser.ts V2ImportPayload + parseV2Json:
export interface V2ImportPayload {
  // ...existing fields...
  mesExample: string;  // raw mes_example, "" if absent
}

// V2 reads: data.mes_example
// V3 reads: data.data?.mes_example ?? data.mes_example (V3 nests everything under data.data)

// backend/src/character/ingestion/types.ts V2CardPayload (~line 13):
export interface V2CardPayload {
  // ...existing fields...
  mesExample: string;
}

// backend/src/character/v2-sections.ts buildV2CardSections signature:
function buildV2CardSections(card: V2CardPayload, sampleLines: string[]): string;
// When sampleLines.length > 0, append:
// SAMPLE LINES (direct quotes from source):
// - "..."
// - "..."
```

<!-- Synthesizer integration (RESEARCH §5.5): -->
```ts
// backend/src/character/ingestion/synthesizer.ts formatCardSection:
import { extractSampleLinesFromMesExample } from "./mes-example-parser.js";
const sampleLines = extractSampleLinesFromMesExample(card.mesExample ?? "");
return buildV2CardSections(card, sampleLines);

// Add merge-rule bullet (after existing rules around line 144):
// "10. If PRIORITY 2 supplied SAMPLE LINES, preserve 2-3 of them verbatim in personalitySampleLines — they are the character's canonical voice."
```

<!-- prompt-contract.ts rule rewrites (RESEARCH §3.5 — moved from 63-01 per REVIEWS fix #1): -->
```ts
// Line ~17 RICHER_IDENTITY_TRUTH_RULE:
//   "baseFacts + behavioralCore define who" → "baseFacts + personality define who"
// Line ~26 FLAT_OUTPUT_ADAPTER_RULE:
//   "...Do NOT emit nested baseFacts, behavioralCore, liveDynamics" → append ", personality"
// Line ~29 DETERMINISTIC_MAPPING_RULE:
//   "enduring motives, self-image, attachments, and pressure cues feed behavioralCore"
//   → "interiority cues (summary/voice/decisionStyle/worldview/contradictions/mythology/quotes) feed personality;
//      self-image and hard-constraints remain on behavioralCore/baseFacts"
```
</interfaces>

<project_conventions>
- All AI tool inputs/outputs validated by Zod (CLAUDE.md).
- `richCharacterSchema` MUST stay flat — `FLAT_OUTPUT_ADAPTER_RULE` (updated in Task 7) bans nested `personality` in LLM output. Lifting happens in adapters only (RESEARCH §4.1 rationale).
- Use Vercel AI SDK `generateObject`; do NOT raw-fetch LLMs.
- Token budget impact: +800-1200 tokens per ingestion call (RESEARCH §4.3) — non-blocking on GLM-5.1. (REVIEWS Claude LOW concern: worldgen NPCs amplify this to +10-15K tokens per worldgen run across 10-15 NPCs; flag in plan SUMMARY.)
- LLM provider: GLM-default for all 4 ingestion roles (per `feedback_glm_default.md`); OpenRouter is OFF-LIMITS for ingestion (`feedback_openrouter_embargo.md`).
- Real testing only: integration test uses real generateObject mock at the `ai` boundary. Unit tests on the synthesizer mock `generateObject` directly.
- Prompt-contract rule strings are pinned by `generator.test.ts` and `npc-generator.test.ts`; Task 7 bundles rule-string + pinned test edits into a single atomic step (RESEARCH §11 risk #4).
</project_conventions>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pre-task gitnexus impact analysis</name>
  <files>(no edits — analysis only)</files>
  <action>
Per CLAUDE.md GitNexus mandate, run before any edits:
- `gitnexus_impact({target: "richCharacterSchema", direction: "upstream"})`
- `gitnexus_impact({target: "synthesizeDraftFromSources", direction: "upstream"})`
- `gitnexus_impact({target: "buildV2CardSections", direction: "upstream"})`
- `gitnexus_impact({target: "fromRichParsedCharacter", direction: "upstream"})`
- `gitnexus_impact({target: "RICHER_IDENTITY_TRUTH_RULE", direction: "upstream"})` — confirms the 4 pinned test assertion sites from RESEARCH §3.5
- `gitnexus_context({name: "toCharacterDraftFromRich"})`

Cross-check against RESEARCH §4.1-4.4 + §8.5 + §3.5. Capture full reader list. Halt if any unexpected consumer surfaces.

Refresh index first if any tool reports staleness: `npx gitnexus analyze`.

Risk classification: HIGH (per RESEARCH §8.2 — touches the synthesizer hot path + pinned test-bound rule constants).
  </action>
  <verify>
    <automated>node -e "console.log('gitnexus impact captured for: richCharacterSchema, synthesizeDraftFromSources, buildV2CardSections, fromRichParsedCharacter, RICHER_IDENTITY_TRUTH_RULE, toCharacterDraftFromRich')"</automated>
  </verify>
  <done>Reader sets captured; matches RESEARCH; HIGH risk acknowledged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: richCharacterSchema personality flat-keys + adapter lift + synthesizer test</name>
  <files>
backend/src/character/generator.ts
backend/src/character/record-adapters.ts
backend/src/character/ingestion/__tests__/synthesizer.personality.test.ts
  </files>
  <behavior>
Test cases for `synthesizer.personality.test.ts` (RESEARCH §9.1):
- Mock `generateObject` from `ai` to resolve with a rich-draft object containing all 7 personality flat-keys populated (`personalitySummary` "Driven scout…", `personalityVoice` "Curt, military jargon…", `personalityDecisionStyle` "Acts first, justifies later", `personalityWorldview` "Pragmatist", `personalityContradictions` ["Believes X but does Y"], `personalityMythology` "I am the eyes of the regiment", `personalitySampleLines` ["State your business.", "We move at dawn."]).
- Call `synthesizeDraftFromSources()` with a minimal IngestionInput (description-only mode).
- Assert returned `CharacterDraft.identity.personality` is defined and equals the lifted block.
- Assert `personality.sampleLines.length === 2`.
- Assert legacy fields (`behavioralCore.motives`) are absent or empty (LLM no longer emits them via flat-key contract change).
- **Zod invariant guard (REVIEWS fix #5):** parsing a rich-draft with `personalitySampleLines: []` succeeds at the Zod layer (no invariant throw). The "≥2" rule is prompt-enforced, not Zod-enforced.
  </behavior>
  <action>
1. Edit `backend/src/character/generator.ts`:
   - In `richCharacterSchema` (line 42-77), append the 7 flat-keys per the contract above. **CRITICAL (REVIEWS fix #5):** use `.min(0).max(3).default([])` on `personalitySampleLines`, NOT `.min(2)`. Same pattern as `personalityContradictions.max(3)`.
   - In `buildFlatOutputStrategy()` (~line 79-95), append a bullet per RESEARCH §4.1 (soft-require ≥2 in prompt text, not Zod):
     ```
     - Use personalitySummary, personalityVoice, personalityDecisionStyle, personalityWorldview,
       personalityContradictions, personalityMythology, personalitySampleLines to author interiority.
       These lift into identity.personality. MUST produce AT LEAST 2 sampleLines that are actual
       quotable sentences in the character's voice (not descriptions). 3 sampleLines preferred.
     ```
   - In `toCharacterDraftFromRich()` (~line 129-148), add the personality lift per the contract above.

2. Edit `backend/src/character/record-adapters.ts`:
   - Locate `fromRichParsedCharacter` (search for the function definition; RESEARCH §4.1 references it as the lift target alongside `toCharacterDraftFromRich`).
   - Add personality flat-key → nested mapping mirroring `toCharacterDraftFromRich`.

3. Add `parseCharacterDescription()` prompt template extension (RESEARCH §4.2 row 1, lines ~186-198 in generator.ts): append two bullets describing how to derive `personalitySummary` from biography phrasing and how to author 2 representative `personalitySampleLines`.

4. Add `generateCharacter()` prompt template extension (RESEARCH §4.2 row 2, lines ~247-262): append the bullet `"- personality*: voice + sampleLines MUST match WORLD premise tone and genre"`.

5. Create `backend/src/character/ingestion/__tests__/synthesizer.personality.test.ts` per the behavior cases. Mock `generateObject` from `ai` via `vi.mock("ai", ...)`. Use the existing `synthesizer.test.ts` (if any) as the harness pattern; if no existing test exists, mirror the structure of `backend/src/character/__tests__/generator.test.ts`.
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run "synthesizer.personality"</automated>
  </verify>
  <done>Backend typecheck green. New synthesizer.personality test passes. P63-R1 partially covered (synthesizer-level proof). Zod invariant fix verified.</done>
</task>

<task type="auto">
  <name>Task 3: V2/V3 mes_example threading — frontend parser + types + route</name>
  <files>
frontend/lib/v2-card-parser.ts
backend/src/character/ingestion/types.ts
  </files>
  <action>
1. Edit `frontend/lib/v2-card-parser.ts`:
   - Add `mesExample: string` to `V2ImportPayload` (line ~2-9).
   - In `parseV2Json()` (~line 24-44), at line 42 append handling for both V2 and V3 nested shapes:
     ```ts
     mesExample: String(data.data?.mes_example ?? data.mes_example ?? ""),
     ```
     V3 cards wrap everything under `data.data.*`; V2 is flat. Precedence: V3 nested first, then V2 top-level.
   - PNG tEXt chunk path (search for `tEXt` handler in the same file) — once the JSON is decoded from the chunk, the same `parseV2Json` runs, so no extra change needed there. Confirm by grep.

2. Edit `backend/src/character/ingestion/types.ts`:
   - Add `mesExample: string;` to `V2CardPayload` (~line 13-20). Keep it required (default `""` at the call boundary) so route schemas don't need an optional toggle.

3. Locate the import-v2-card route (`backend/src/routes/worldgen/import-v2-card.ts` or equivalent — RESEARCH §5.2 references `backend/src/routes/character.ts`/import-v2-card; verify with grep). Update the request Zod schema to accept `mesExample: z.string().default("")` and thread it into the `V2CardPayload` constructed for the synthesizer.

4. Run `npm --prefix frontend run lint` to confirm no unused-import or any-leakage on the parser changes.
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix frontend run lint</automated>
  </verify>
  <done>`mesExample` typed end-to-end through frontend parser (V2 + V3), `/import-v2-card` route schema, and `V2CardPayload`. No typecheck or lint failures.</done>
</task>

<task type="auto">
  <name>Task 4: Synthesizer wiring — extractSampleLinesFromMesExample + buildV2CardSections SAMPLE LINES</name>
  <files>
backend/src/character/ingestion/synthesizer.ts
backend/src/character/v2-sections.ts
  </files>
  <action>
Pre-task: `gitnexus_context({name: "buildV2CardSections"})` and `gitnexus_context({name: "formatCardSection"})`. Confirm callers — RESEARCH §4.2 row 4 + §5.5.

1. Edit `backend/src/character/v2-sections.ts`:
   - Change `buildV2CardSections` signature to accept `(card: V2CardPayload, sampleLines: string[])`.
   - When `sampleLines.length > 0`, append a `SAMPLE LINES (direct quotes from source):` section with one bullet per quoted line. Do NOT include the section when array is empty.
   - Existing callers must be updated to pass the new arg (only one expected per RESEARCH §4.2 row 4 — verify with gitnexus).

2. Edit `backend/src/character/ingestion/synthesizer.ts`:
   - Import `extractSampleLinesFromMesExample` from `./mes-example-parser.js` (path style matches existing `.js` ESM imports in this dir).
   - In `formatCardSection()` (~line 37-44), call `const sampleLines = extractSampleLinesFromMesExample(card.mesExample ?? "");` then pass to `buildV2CardSections(card, sampleLines)`.
   - Add merge-rule bullet 10 after the existing 9 rules (~line 144-145): `"10. If PRIORITY 2 supplied SAMPLE LINES, preserve 2-3 of them verbatim in personalitySampleLines — they are the character's canonical voice."`

If `extractSampleLinesFromMesExample` returns `[]` (parser couldn't extract), the synthesizer prompt still has the description + personality + LLM-pass to fall back on (RESEARCH §11 risk #3 mitigation — graceful degrade, not silent failure).
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run "v2-sections|synthesizer"</automated>
  </verify>
  <done>V2/V3 cards with `mes_example` produce SAMPLE LINES in the synthesizer prompt; existing v2-sections + synthesizer tests still green.</done>
</task>

<task type="auto">
  <name>Task 5: Archetype researcher prompt extension</name>
  <files>
backend/src/character/archetype-researcher.ts
  </files>
  <action>
Pre-task: `gitnexus_impact({target: "researchArchetype", direction: "upstream"})`.

Per RESEARCH §4.2 row 3, extend `researchArchetype()` prompt at line ~25 (the prompt that asks for "signature traits"). Append: `, personality, voice samples (direct quotes if canon, paraphrased otherwise), decision style, worldview, notable contradictions, mythology phrase`.

The synthesizer's `formatResearchSection()` already consumes the returned digest verbatim, so no further changes are needed in the consumer.

Token cost impact: +80 input / +200 output (RESEARCH §4.3). Acceptable on GLM-5.1.

Do NOT change the function signature, return type, or MCP-tool wiring — prompt-text-only edit.
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run "archetype-researcher"</automated>
  </verify>
  <done>Researcher prompt includes voice/decision-style/worldview/contradictions/mythology asks; existing tests still green.</done>
</task>

<task type="auto">
  <name>Task 6: Persona templates personality merge</name>
  <files>
backend/src/character/persona-templates.ts
backend/src/routes/schemas.ts
backend/src/character/__tests__/persona-templates.test.ts
  </files>
  <action>
Pre-task: `gitnexus_impact({target: "mergePersonaTemplate", direction: "upstream"})` (or the actual exported merge function — verify via grep on `persona-templates.ts:34-55`).

Per RESEARCH §4.4:

1. Edit `backend/src/character/persona-templates.ts`:
   - The existing `mergeDefined` pattern at lines 49-55 merges `behavioralCore`. Add a parallel `personality` merge using the same pattern: when patch has `personality`, deep-merge into the draft's `identity.personality` (use `mergeDefined` per-field so partial patches work).

2. Edit `backend/src/routes/schemas.ts`:
   - Locate `personaTemplatePatchSchema` (~line 495-518).
   - Add `personality: characterPersonalitySchema.partial().optional()` to the schema. **Note:** `characterPersonalitySchema` was declared in 63-01 Task 3; confirm the declaration order in the file places `characterPersonalitySchema` BEFORE `personaTemplatePatchSchema` (if not, reorder — Zod is runtime but TypeScript type inference wants forward references resolved).

3. Update `backend/src/character/__tests__/persona-templates.test.ts` per RESEARCH §9.2: add 1-2 cases mirroring the existing `behavioralCore` merge tests but for `personality`. Pattern:
   - Patch with `personality.voice` overrides draft's existing personality voice.
   - Patch without `personality` leaves draft's personality untouched.
   - Patch with `personality.sampleLines` replaces array (not concat — match existing array-merge semantics in this file).
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run "persona-templates"</automated>
  </verify>
  <done>Persona-template merge handles personality; updated Vitest cases pass.</done>
</task>

<task type="auto">
  <name>Task 7: prompt-contract rule strings + pinned generator/npc-generator tests (MOVED from 63-01 per REVIEWS fix #1, atomic with Task 2)</name>
  <files>
backend/src/character/prompt-contract.ts
backend/src/character/__tests__/generator.test.ts
backend/src/character/__tests__/npc-generator.test.ts
  </files>
  <action>
**REVIEWS fix #1 (Codex HIGH):** This task was originally Task 5 of 63-01. Moved here and sequenced AFTER Task 2 (richCharacterSchema extension) so the prompt-contract rule strings + richCharacterSchema + adapter lift + pinned test updates commit atomically. Without this ordering, 63-01 would update prompts to instruct personality-shaped output BEFORE the generation schema accepts those keys → live contract mismatch.

Pre-task: `gitnexus_context({name: "RICHER_IDENTITY_TRUTH_RULE"})` to confirm pinned reader sites match RESEARCH §3.5 (4 assertions across the 2 named test files). RESEARCH §11 risk #4 mandates a single atomic commit so no test is left red between commits.

Edits per RESEARCH §3.5:
1. `RICHER_IDENTITY_TRUTH_RULE` (line ~17): rewrite "baseFacts + behavioralCore define who" → "baseFacts + personality define who". Keep wording deliberately close so the test diff is minimal.
2. `FLAT_OUTPUT_ADAPTER_RULE` (line ~26): existing list of nested fields the LLM must NOT emit ("baseFacts, behavioralCore, liveDynamics") gains `personality`. New string ends with "...behavioralCore, liveDynamics, personality" (or matching local style).
3. `DETERMINISTIC_MAPPING_RULE` (line ~29): replace "enduring motives, self-image, attachments, and pressure cues feed behavioralCore" with "interiority cues (summary/voice/decisionStyle/worldview/contradictions/mythology/quotes) feed personality; self-image and hard-constraints remain on behavioralCore/baseFacts".

In the SAME commit, update the 4 pinned assertions:
- `backend/src/character/__tests__/generator.test.ts:106-109` — assertions on the 3 rule strings. **Preferred refactor (REVIEWS gemini + claude suggestion):** Change the pinned tests to import the constant directly (`import { RICHER_IDENTITY_TRUTH_RULE } from "../prompt-contract"`) and assert that the prompt contains the constant. This decouples future text edits from test updates.
- `backend/src/character/__tests__/npc-generator.test.ts:78` — assertion on `RICHER_IDENTITY_TRUTH_RULE` literal → switch to constant import.
- `backend/src/character/__tests__/npc-generator.test.ts:112` — assertion on `DETERMINISTIC_MAPPING_RULE` or `FLAT_OUTPUT_ADAPTER_RULE` literal → switch to constant import.

Do NOT touch the rest of the prompt-contract behavior.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "generator|npc-generator"</automated>
  </verify>
  <done>generator + npc-generator targeted Vitest suites pass. Rule strings reflect personality contract. Atomic with Task 2 richCharacterSchema extension (no red commit).</done>
</task>

<task type="auto">
  <name>Task 8: Worldgen NPC scaffold step + npc-generator personality lift</name>
  <files>
backend/src/character/npc-generator.ts
backend/src/worldgen/scaffold-steps/npcs-step.ts
backend/src/worldgen/__tests__/npcs-step.test.ts
backend/src/character/__tests__/record-adapters.identity.test.ts
  </files>
  <action>
Pre-task: `gitnexus_impact({target: "buildNpcDraftFromRich", direction: "upstream"})` and `gitnexus_context({name: "npcs-step"})`.

1. `backend/src/character/npc-generator.ts` (RESEARCH §8.1 row "npc-generator"):
   - The richCharacterSchema is the same source as in generator.ts — once Task 2 lands the flat-keys, the NPC generator inherits them through the shared schema/import. Confirm `buildNpcDraftFromRich` (or equivalent NPC-side adapter — search for "Rich" in this file) lifts personality flat-keys into `identity.personality`. If a separate adapter exists, mirror the change from `toCharacterDraftFromRich`.
   - Stop writing legacy `behavioralCore.motives` if there's any explicit assignment.

2. `backend/src/worldgen/scaffold-steps/npcs-step.ts:554-558` (RESEARCH §8.1 last row):
   - Add personality lift to the NPC creation path (same pattern: take rich response → lift to draft.identity.personality).

3. Update `backend/src/worldgen/__tests__/npcs-step.test.ts:118` per RESEARCH §9.2: add `personality` to the `expect.objectContaining({...})` assertion so worldgen NPCs are required to carry the block.

4. Update `backend/src/character/__tests__/record-adapters.identity.test.ts:34` per RESEARCH §9.2: add `personality` field expectation on the normalized record.

5. Update `backend/src/character/__tests__/npc-generator.test.ts:66` per RESEARCH §9.2: drop the `behavioralCore.motives` assertion (LLM no longer emits motives via the flat-key contract; the lift target is `personality`).
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run "npc-generator|npcs-step|record-adapters"</automated>
  </verify>
  <done>Worldgen NPC step lifts personality; npc-generator + npcs-step + record-adapters tests pass.</done>
</task>

<task type="auto">
  <name>Task 9: End-to-end pipeline integration test (all 4 modes)</name>
  <files>
backend/src/character/ingestion/__tests__/pipeline.personality-e2e.test.ts
  </files>
  <action>
Per RESEARCH §9.3, create the e2e Vitest:

```ts
// Mocks createModel + generateObject to return a fixed rich-draft with personality flat-keys.
// Exercises ingestCharacterDraft 4 times — once per mode (parse / generate / research / import).
// Asserts every returned CharacterDraft.identity.personality.summary is non-empty.
```

Setup:
- `vi.mock("ai", ...)` with `generateObject` returning the fixed rich-draft.
- `vi.mock("../../ai/index.js", ...)` to stub `createModel` so no provider call leaks.
- Each `it()` invokes the corresponding entry path:
  - parse: call `ingestCharacterDraft({ source: "description", description: "A scout from the eastern dunes." })`
  - generate: call `ingestCharacterDraft({ source: "generate", premise: "..." })`
  - research: call `ingestCharacterDraft({ source: "research", archetype: "..." })`
  - import: call `ingestCharacterDraft({ source: "v2-card", card: { ...minimal payload, mesExample: '<START>\n{{char}}: "Move out, on me."' } })`

For the `import` case, also assert that `personality.sampleLines` includes the parsed `"Move out, on me."` quote (proves end-to-end mes_example wiring works without a real LLM in the loop — synthesizer is mocked, but the parser is real).

Reference the existing ingestion entry-point name from `backend/src/character/ingestion/pipeline.ts` (RESEARCH cites `synthesizeDraftFromSources` and the public entry as `ingestCharacterDraft` per Phase 60 SUMMARYs). Confirm via grep before writing the test.

Note: this is NOT a real-LLM integration test — it's a wiring-correctness test. Real-LLM verification happens in 63-06 Task 7 via the real-path verification suite. Per `feedback_real_testing.md` the real test is 63-06; this Vitest exists to catch wiring regressions cheaply.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "pipeline.personality-e2e"</automated>
  </verify>
  <done>All 4 modes exercise the pipeline; each returned draft has `personality.summary` non-empty. P63-R1 fully covered.</done>
</task>

<task type="auto">
  <name>Task 10: Post-task gitnexus_detect_changes verification</name>
  <files>(no edits — verification only)</files>
  <action>
Per CLAUDE.md, before commit:
- `gitnexus_detect_changes({scope: "all"})`
- Confirm changed files match `files_modified` frontmatter exactly (no surprise edits).
- Expect `backend/src/character/prompt-contract.ts` + `generator.test.ts` + `npc-generator.test.ts` in the change set (moved here from 63-01 per REVIEWS fix #1).
- If gitnexus reports edits to files NOT in `files_modified`, halt and reconcile.

Also re-run `gitnexus_impact({target: "ingestCharacterDraft", direction: "upstream"})` to verify the 4 routes still call into the orchestrator correctly (no signature drift).
  </action>
  <verify>
    <automated>node -e "console.log('gitnexus_detect_changes verified; scope matches files_modified including prompt-contract + pinned tests')"</automated>
  </verify>
  <done>Change scope matches plan; no unexpected file edits.</done>
</task>

</tasks>

<verification>
- `npm --prefix backend run typecheck` exits 0.
- `npm --prefix frontend run lint` exits 0.
- `npm --prefix backend test -- run "synthesizer.personality|pipeline.personality-e2e|persona-templates|npcs-step|npc-generator|record-adapters|v2-sections|archetype-researcher|generator"` exits 0 (includes prompt-contract pinned tests).
- `frontend/lib/v2-card-parser.ts` + `backend/src/character/ingestion/types.ts` + import-v2-card route Zod schema all carry `mesExample`.
- Synthesizer `formatCardSection` calls `extractSampleLinesFromMesExample`.
- `richCharacterSchema` + `buildFlatOutputStrategy` + `toCharacterDraftFromRich` + `fromRichParsedCharacter` all reference personality flat-keys.
- `personalitySampleLines` in richCharacterSchema uses `.min(0)` not `.min(2)` (REVIEWS fix #5).
- `prompt-contract.ts` 3 rule strings rewritten + 4 pinned test assertions refactored to constant imports (atomic with schema change — no red commits).
- V2 + V3 card payloads both extract `mes_example` via the dual-access pattern.
- gitnexus impact + detect_changes captured.
</verification>

<success_criteria>
- All 4 ingestion paths produce `CharacterDraft.identity.personality` with non-empty `summary` when given non-trivial input.
- V2 + V3 cards carry `mesExample` end-to-end (frontend parser → route → V2CardPayload → synthesizer → `SAMPLE LINES` block).
- Synthesizer prompt instructs the LLM to preserve parsed sample lines verbatim.
- Persona templates merge personality patches.
- Worldgen NPC scaffold step lifts personality.
- prompt-contract rule strings + pinned test updates ship atomically with richCharacterSchema extension (REVIEWS fix #1 — no red commit).
- Zod `personalitySampleLines` uses `.min(0).max(3).default([])` — no invariant throw (REVIEWS fix #5).
- New + updated Vitest suites cover P63-R1 and reinforce P63-R3.
- Token cost impact ≤ +1200 tokens per ingestion call (RESEARCH §4.3 budget) — non-blocking on GLM-5.1.
</success_criteria>

<requirement_coverage>
- **P63-R1** — `synthesizer.personality.test.ts` + `pipeline.personality-e2e.test.ts` prove all 4 modes emit personality.
- **P63-R3** — `mesExample` field threaded (V2 + V3); synthesizer integration of `extractSampleLinesFromMesExample` (parser landed in 63-01); e2e test asserts parsed quote propagates to `personality.sampleLines`.
- Reinforces P63-R7 — prompt-contract rule strings match Zod schema contract.
</requirement_coverage>

<estimates>
- **Effort:** ~60 min Claude execution time (10 tasks; prompt-contract Task 7 adds ~10 min vs. original; richCharacterSchema + adapter lift + e2e test are the heavy ones).
- **LLM token cost:** ~0 for plan execution (all `generateObject` calls in tests are mocked). Runtime cost impact at ingest time: +800-1200 tokens per call (RESEARCH §4.3). Worldgen NPCs amplify to +10-15K tokens per worldgen run (REVIEWS Claude LOW concern — documented in SUMMARY).
- **Test runtime:** ~30s for combined backend Vitest filter.
</estimates>

<risks>
- **R1 — Hidden flat-key consumer.** The flat-key contract is shared between `richCharacterSchema` and downstream LLM. If any other consumer (e.g. an unlisted route) constructs the schema differently, the lift could miss. **Mitigation:** Task 1 + Task 10 gitnexus passes catch this. Schema change is centralized in `generator.ts`.
- **R2 — Real LLM doesn't follow new prompt instructions on first try.** The ingestion routes ship code, not LLM behavior. **Mitigation:** This plan tests wiring; 63-06 Task 7 (REVIEWS fix #8) includes real-LLM verification on all 4 modes. If the real LLM consistently underfills, file a follow-up to tune prompts (do NOT fall back to placeholder personality — `feedback_no_fallbacks.md`).
- **R3 — V2 card edge cases (RESEARCH §11 risk #3).** Wild V2 cards may use `You:` instead of `{{user}}:` or skip `<START>`. Parser returns `[]` and the synthesizer falls back to LLM-synthesized sample lines from the description + personality field. **Mitigation:** documented in 63-01 parser tests (case "malformed input → []" + V3 coverage); e2e test in this plan exercises the happy path explicitly.
- **R4 — Persona-template breakage.** `personaTemplatePatchSchema` change can break existing template applications. **Mitigation:** field is `.optional()`; existing templates that omit `personality` continue to work.
- **R5 — Worldgen npcs-step assertion update.** Adding `personality` to `expect.objectContaining` may fail until adapter lifts personality. **Mitigation:** Task 8 sequences the adapter change before the test update so they land in the same commit.
- **R6 — prompt-contract task ordering within this plan.** Task 7 MUST run after Task 2 (richCharacterSchema) — schema + prompt-contract must land together in one atomic commit to avoid a red interval. **Mitigation:** Task 7 explicitly documents the sequence requirement; executor should hold the commit until both are done.
</risks>

<output>
After completion, create `.planning/phases/63-personality-interiority-model/63-02-SUMMARY.md` with:
- Tasks completed (1-10; note Task 7 imported from 63-01 per REVIEWS fix #1)
- Files modified (per `files_modified` — includes prompt-contract.ts + generator.test.ts + npc-generator.test.ts now)
- gitnexus impact + detect_changes digests
- Test commands + pass/fail evidence
- Token-cost notes (estimated ingestion call delta from baseline; worldgen NPC amplification estimate)
- REVIEWS.md fixes applied in this plan: #1 (prompt-contract moved here + atomic with schema), #5 (Zod min(0) not min(2) on sampleLines), #12 (V3 card mesExample threading)
- Deviations + rationale
</output>
