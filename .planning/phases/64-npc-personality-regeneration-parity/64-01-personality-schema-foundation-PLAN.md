---
phase: 64-npc-personality-regeneration-parity
plan: 01
slug: personality-schema-foundation
type: execute
wave: 1
status: draft
depends_on: []
files_modified:
  - backend/src/character/personality-schema.ts
  - backend/src/character/__tests__/personality-schema.test.ts
autonomous: true
requirements: [P64-R2]
must_haves:
  truths:
    - "backend/src/character/personality-schema.ts exists and exports personalityFieldSchema (Zod fragment) plus mapFlatPersonalityToNested helper"
    - "personalityFieldSchema has EXACTLY the 7 flat keys from npc-generator.ts:29-35: personalitySummary, personalityVoice, personalityDecisionStyle, personalityWorldview, personalityContradictions, personalityMythology, personalitySampleLines"
    - "mapFlatPersonalityToNested produces a CharacterPersonality object with all 7 sub-fields: summary, voice, decisionStyle, worldview, internalContradictions, personalMythology, sampleLines"
    - "Field constraints match npc-generator.ts exactly: z.string().max(400/600), contradictions z.array(z.string().max(300)).max(3), sampleLines z.array(z.string().max(300)).min(0).max(3)"
    - "Compile-time guard: type of mapper return matches CharacterPersonality (satisfies check or explicit return type)"
    - "npm --prefix backend test -- run personality-schema exits 0"
  artifacts:
    - path: backend/src/character/personality-schema.ts
      provides: "Shared Zod fragment + flat→nested mapper; single source of truth for worldgen + npc-generator personality surface."
      min_lines: 40
      contains: "personalityFieldSchema"
    - path: backend/src/character/__tests__/personality-schema.test.ts
      provides: "Unit tests asserting schema shape, default behavior, mapper output equality, CharacterPersonality compatibility"
      contains: "mapFlatPersonalityToNested"
  key_links:
    - from: backend/src/character/personality-schema.ts
      to: "@worldforge/shared CharacterPersonality"
      via: "return-type constraint on mapFlatPersonalityToNested"
      pattern: "CharacterPersonality"
---

<objective>
Extract the 7 flat personality fields + flat→nested mapper into a shared helper module so worldgen's `npcs-step.ts` and `npc-generator.ts` reference ONE source of truth. Prevents schema drift (the root cause of the Phase 64 parity gap).

Purpose: `npc-generator.ts:29-35` already defines the canonical flat schema; `npc-generator.ts:111-118` already defines the canonical flat→nested mapper. Phase 64's fix to `npcs-step.ts` needs to extend that step's inline schema + add the mapping logic. If both call-sites duplicate the field list inline, they will drift again. This plan extracts the shared helper FIRST (Wave 1), then Plan 02 rewires both call-sites to use it (Wave 2).

Output:
- `backend/src/character/personality-schema.ts` exporting `personalityFieldSchema` + `mapFlatPersonalityToNested`
- `backend/src/character/__tests__/personality-schema.test.ts` locking schema shape + mapper behavior
- Zero changes to call-sites yet — Plan 02 handles the migration to prevent cascading test failures
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md
@.planning/phases/64-npc-personality-regeneration-parity/64-RESEARCH.md
@.planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md
@.planning/phases/63-personality-interiority-model/63-CONTEXT.md
@CLAUDE.md
@backend/src/character/npc-generator.ts
@backend/src/character/record-adapters.ts
@shared/src/types.ts

<interfaces>
<!-- The canonical CharacterPersonality type the mapper MUST return -->
<!-- (from shared/src/types.ts — single source of truth for nested shape) -->
```ts
export interface CharacterPersonality {
  summary: string;
  voice: string;
  decisionStyle: string;
  worldview: string;
  internalContradictions: string[];
  personalMythology: string;
  sampleLines: string[];
}
```

<!-- Existing flat schema in backend/src/character/npc-generator.ts:29-35 — -->
<!-- This is the canonical reference. Extract VERBATIM into the shared module. -->
```ts
personalitySummary: z.string().max(400).default(""),
personalityVoice: z.string().max(600).default(""),
personalityDecisionStyle: z.string().max(400).default(""),
personalityWorldview: z.string().max(400).default(""),
personalityContradictions: z.array(z.string().max(300)).max(3).default([]),
personalityMythology: z.string().max(400).default(""),
personalitySampleLines: z.array(z.string().max(300)).min(0).max(3).default([]),
```

<!-- Existing flat→nested mapping in backend/src/character/npc-generator.ts:111-118 -->
<!-- This is the canonical mapping. Extract as the mapFlatPersonalityToNested body. -->
```ts
personality: {
  summary: npc.personalitySummary,
  voice: npc.personalityVoice,
  decisionStyle: npc.personalityDecisionStyle,
  worldview: npc.personalityWorldview,
  internalContradictions: npc.personalityContradictions,
  personalMythology: npc.personalityMythology,
  sampleLines: npc.personalitySampleLines,
}
```
</interfaces>

<project_conventions>
- TypeScript strict mode, ES modules
- Zod for all LLM schema definitions
- File size 200-400 lines target; this one is small (helper module)
- Do NOT duplicate types — re-use CharacterPersonality from @worldforge/shared
- Place tests in colocated `__tests__/` directory
</project_conventions>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write personality-schema.test.ts FIRST (RED)</name>
  <files>backend/src/character/__tests__/personality-schema.test.ts</files>
  <read_first>
    - backend/src/character/npc-generator.ts (lines 1-150, reference: flat schema at :29-35 and mapping at :111-118)
    - shared/src/types.ts (CharacterPersonality interface — grep `export interface CharacterPersonality`)
    - .planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md (D-02, Specifics §D-02)
    - .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md (Wave 0 §1)
    - backend/src/character/__tests__/ (check for existing test patterns — if directory missing, create it)
  </read_first>
  <behavior>
    Five test cases:
    - Test 1: `personalityFieldSchema` parses a fully-populated flat object — returns the same shape.
    - Test 2: `personalityFieldSchema` with empty input applies defaults (all strings `""`, all arrays `[]`).
    - Test 3: `personalityFieldSchema` rejects `personalityContradictions.length > 3` — Zod throws.
    - Test 4: `personalityFieldSchema` rejects `personalitySampleLines.length > 3` — Zod throws.
    - Test 5: `mapFlatPersonalityToNested({...7 flat fields})` returns `{summary, voice, decisionStyle, worldview, internalContradictions, personalMythology, sampleLines}` with exact value equality — and the return type satisfies `CharacterPersonality` (TypeScript compile-time check via `const result: CharacterPersonality = mapFlatPersonalityToNested(...)`).
  </behavior>
  <action>
Create `backend/src/character/__tests__/personality-schema.test.ts` with Vitest. Test skeleton:

```ts
import { describe, it, expect } from "vitest";
import type { CharacterPersonality } from "@worldforge/shared";
import {
  personalityFieldSchema,
  mapFlatPersonalityToNested,
} from "../personality-schema.js";

describe("personalityFieldSchema", () => {
  it("parses a fully-populated flat object round-trip", () => {
    const flat = {
      personalitySummary: "A cautious scholar",
      personalityVoice: "Clipped, formal, prefers understatement",
      personalityDecisionStyle: "Weighs options before committing",
      personalityWorldview: "Order through careful scholarship",
      personalityContradictions: ["Preaches humility but hoards secrets"],
      personalityMythology: "Keeper of forbidden knowledge",
      personalitySampleLines: ["Patience, patience — the pages tell more than the hand.", "I have read this twice and still it mocks me."],
    };
    const parsed = personalityFieldSchema.parse(flat);
    expect(parsed).toEqual(flat);
  });

  it("applies defaults when fields are omitted", () => {
    const parsed = personalityFieldSchema.parse({});
    expect(parsed.personalitySummary).toBe("");
    expect(parsed.personalityVoice).toBe("");
    expect(parsed.personalityDecisionStyle).toBe("");
    expect(parsed.personalityWorldview).toBe("");
    expect(parsed.personalityContradictions).toEqual([]);
    expect(parsed.personalityMythology).toBe("");
    expect(parsed.personalitySampleLines).toEqual([]);
  });

  it("rejects contradictions.length > 3", () => {
    expect(() =>
      personalityFieldSchema.parse({
        personalityContradictions: ["a", "b", "c", "d"],
      }),
    ).toThrow();
  });

  it("rejects sampleLines.length > 3", () => {
    expect(() =>
      personalityFieldSchema.parse({
        personalitySampleLines: ["one", "two", "three", "four"],
      }),
    ).toThrow();
  });
});

describe("mapFlatPersonalityToNested", () => {
  it("maps all 7 flat fields into CharacterPersonality nested shape", () => {
    const flat = {
      personalitySummary: "Summary text",
      personalityVoice: "Voice text",
      personalityDecisionStyle: "Decision style text",
      personalityWorldview: "Worldview text",
      personalityContradictions: ["Contradiction one"],
      personalityMythology: "Mythology text",
      personalitySampleLines: ["Line one", "Line two"],
    };
    const nested: CharacterPersonality = mapFlatPersonalityToNested(flat);
    expect(nested).toEqual({
      summary: "Summary text",
      voice: "Voice text",
      decisionStyle: "Decision style text",
      worldview: "Worldview text",
      internalContradictions: ["Contradiction one"],
      personalMythology: "Mythology text",
      sampleLines: ["Line one", "Line two"],
    });
  });
});
```

Run the test — it MUST fail (RED) because `personality-schema.ts` does not yet exist.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "personality-schema" 2>&1 | grep -E "(FAIL|Cannot find module|PASS)"</automated>
  </verify>
  <acceptance_criteria>
    - File `backend/src/character/__tests__/personality-schema.test.ts` exists
    - File contains `describe("personalityFieldSchema"` and `describe("mapFlatPersonalityToNested"`
    - File contains both imports: `personalityFieldSchema` and `mapFlatPersonalityToNested` from `../personality-schema.js`
    - Running `npm --prefix backend test -- run "personality-schema"` FAILS with module-not-found error (RED confirmed)
    - `grep -c "expect" backend/src/character/__tests__/personality-schema.test.ts` returns ≥ 10
  </acceptance_criteria>
  <done>Test file exists with 5 test cases covering schema defaults, round-trip, rejection, and mapper equality; test run fails because implementation does not yet exist (expected RED).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement personality-schema.ts (GREEN) per D-02</name>
  <files>backend/src/character/personality-schema.ts</files>
  <read_first>
    - backend/src/character/npc-generator.ts (lines 29-35 for schema, lines 111-118 for mapping — COPY VERBATIM)
    - shared/src/types.ts (CharacterPersonality type)
    - backend/src/character/__tests__/personality-schema.test.ts (just written; drives behavior)
    - .planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md (D-01, D-02, D-03)
  </read_first>
  <action>
Create `backend/src/character/personality-schema.ts` with the exact schema from `npc-generator.ts:29-35` and the exact mapping from `npc-generator.ts:111-118`:

```ts
import { z } from "zod";
import type { CharacterPersonality } from "@worldforge/shared";

/**
 * Flat personality field fragment for LLM Zod schemas.
 *
 * Phase 64: Single source of truth — shared by `backend/src/character/npc-generator.ts`
 * and `backend/src/worldgen/scaffold-steps/npcs-step.ts`. Extend BOTH call-sites
 * to spread this fragment into their output schemas; do NOT duplicate the fields
 * inline (that drift caused the Phase 64 parity gap).
 *
 * Field shape matches `npc-generator.ts:29-35` verbatim.
 */
export const personalityFieldSchema = z.object({
  personalitySummary: z.string().max(400).default(""),
  personalityVoice: z.string().max(600).default(""),
  personalityDecisionStyle: z.string().max(400).default(""),
  personalityWorldview: z.string().max(400).default(""),
  personalityContradictions: z.array(z.string().max(300)).max(3).default([]),
  personalityMythology: z.string().max(400).default(""),
  personalitySampleLines: z.array(z.string().max(300)).min(0).max(3).default([]),
});

export type FlatPersonalityFields = z.infer<typeof personalityFieldSchema>;

/**
 * Map the 7 flat personality fields into the nested `CharacterPersonality`
 * shape expected by `CharacterDraft.identity.personality`.
 *
 * Body matches `npc-generator.ts:111-118` verbatim. Return type is pinned to
 * `CharacterPersonality` so any future schema divergence surfaces as a TypeScript
 * compile error instead of a silent runtime drift.
 */
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
```

Notes:
- The return-type pin `: CharacterPersonality` is the compile-time completeness guard promised by P64-R2. If `CharacterPersonality` adds a field later, this function won't compile until the mapper is updated.
- `FlatPersonalityFields` is exported because Plan 02 will want the type to strengthen `npcs-step.ts` internals.
- Do NOT change `npc-generator.ts` yet — that's Plan 02's scope. Keeping changes narrow here prevents cross-plan scope leak.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "personality-schema"</automated>
  </verify>
  <acceptance_criteria>
    - File `backend/src/character/personality-schema.ts` exists
    - `grep -c "personalityFieldSchema" backend/src/character/personality-schema.ts` returns ≥ 2 (declaration + export)
    - `grep -c "mapFlatPersonalityToNested" backend/src/character/personality-schema.ts` returns ≥ 2
    - Function signature: `mapFlatPersonalityToNested(flat: FlatPersonalityFields): CharacterPersonality` — exact return type pin
    - `grep "personalitySampleLines: z.array(z.string().max(300)).min(0).max(3).default" backend/src/character/personality-schema.ts` matches 1 line
    - `grep "personalityContradictions: z.array(z.string().max(300)).max(3).default" backend/src/character/personality-schema.ts` matches 1 line
    - All 5 tests from Task 1 now PASS: `npm --prefix backend test -- run "personality-schema"` exits 0
    - `npm --prefix backend run typecheck` exits 0 (CharacterPersonality return-type contract holds)
  </acceptance_criteria>
  <done>personality-schema.ts exists with canonical flat fields + nested mapper; 5 tests pass; typecheck clean; return-type pinned to CharacterPersonality (P64-R2 completeness guard).</done>
</task>

<task type="auto">
  <name>Task 3: Post-task verification + gitnexus scope check</name>
  <files>(no edits — verification only)</files>
  <read_first>
    - backend/src/character/personality-schema.ts (just created)
    - backend/src/character/__tests__/personality-schema.test.ts (just created)
  </read_first>
  <action>
1. Run targeted tests:
   ```
   npm --prefix backend test -- run "personality-schema"
   ```
   Expect: 5 tests pass, exit 0, < 10s runtime.

2. Run backend typecheck:
   ```
   npm --prefix backend run typecheck
   ```
   Expect: exit 0. The `CharacterPersonality` return-type pin on `mapFlatPersonalityToNested` is the completeness guard — any type mismatch halts here.

3. Run `gitnexus_detect_changes({scope: "all"})` — confirm only the two files in `files_modified` were touched (no incidental edits to `npc-generator.ts` or `npcs-step.ts` — those are Plan 02's scope).

4. Confirm NO call-site changes yet: `grep -rn "personalityFieldSchema\|mapFlatPersonalityToNested" backend/src --include='*.ts' | grep -v "personality-schema"` should return 0 matches (helper is unused until Plan 02 rewires). Document this in the SUMMARY — isolated foundation landing.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "personality-schema" && npm --prefix backend run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - Targeted test exits 0
    - Backend typecheck exits 0
    - gitnexus_detect_changes shows exactly 2 changed files matching files_modified
    - No other source files modified (Plan 02 handles rewiring)
  </acceptance_criteria>
  <done>Foundation landed in isolation; call-site rewire deferred to Plan 02; typecheck + tests green; scope verified.</done>
</task>

</tasks>

<verification>
- `npm --prefix backend test -- run "personality-schema"` exits 0; 5 tests pass.
- `npm --prefix backend run typecheck` exits 0 — CharacterPersonality return-type pin enforces the P64-R2 completeness guard.
- `backend/src/character/personality-schema.ts` exists with `personalityFieldSchema` + `mapFlatPersonalityToNested` + `FlatPersonalityFields` exports.
- Schema field list matches `npc-generator.ts:29-35` byte-for-byte (same keys, same constraints).
- Mapper body matches `npc-generator.ts:111-118` byte-for-byte (same 7 assignments).
- No call-site changes in this plan — those land in Plan 02.
- gitnexus_detect_changes reports exactly 2 modified files.
</verification>

<success_criteria>
- Shared helper module exists and is tested.
- Compile-time completeness guard active (return-type pin to `CharacterPersonality`).
- Zero drift risk between worldgen and npc-generator: both Plan 02 tasks will import from this one module.
- P64-R2 fully covered (module + test).
</success_criteria>

<requirement_coverage>
- **P64-R2** — `backend/src/character/personality-schema.ts` exports both required artifacts. Unit test `personality-schema.test.ts` verifies: schema shape (Test 1), defaults (Test 2), rejection bounds (Tests 3-4), mapper equality + type compatibility (Test 5). CharacterPersonality return-type pin is the compile-time completeness guard.
</requirement_coverage>

<estimates>
- Effort: ~15-20 min Claude execution time (foundation extract + test).
- Test runtime: < 2s for the 5-case suite.
- Unblocks: Plan 02 (worldgen fix) + Plan 04 (backfill extension).
</estimates>

<output>
After completion, create `.planning/phases/64-npc-personality-regeneration-parity/64-01-SUMMARY.md` with:
- Tasks completed (RED → GREEN → verify)
- Files created
- Test output (5 pass)
- Typecheck output (exit 0)
- gitnexus_detect_changes digest (exactly 2 files)
- Note that Plan 02 now has a shared helper to consume (no drift risk)
</output>
