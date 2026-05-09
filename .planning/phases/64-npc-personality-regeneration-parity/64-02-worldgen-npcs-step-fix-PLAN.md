---
phase: 64-npc-personality-regeneration-parity
plan: 02
slug: worldgen-npcs-step-fix
type: execute
wave: 2
status: draft
depends_on: [64-01]
files_modified:
  - backend/src/worldgen/scaffold-steps/npcs-step.ts
  - backend/src/worldgen/__tests__/npcs-step.test.ts
  - backend/src/character/npc-generator.ts
autonomous: true
requirements: [P64-R1, P64-R3, P64-R4]
must_haves:
  truths:
    - "generateNpcsStep emits full personality for every NPC tier (key AND supporting): identity.personality has non-empty summary, voice, decisionStyle, worldview, personalMythology, and non-empty arrays for internalContradictions + sampleLines when LLM returns them"
    - "npcs-step.ts per-NPC detail Zod schema spreads personalityFieldSchema.shape (from Plan 01) — 7 flat fields present: personalitySummary, personalityVoice, personalityDecisionStyle, personalityWorldview, personalityContradictions, personalityMythology, personalitySampleLines"
    - "npcs-step.ts prompt block explicitly requests the 7 personality sub-fields with guidance mirroring npc-generator.ts:buildNpcFlatOutputStrategy style"
    - "npcs-step.ts mapper runs AFTER fromLegacyScaffoldNpc (canonical ordering per RESEARCH.md §3.2): the existing fromLegacyScaffoldNpc call at :537 stays, then the degenerate personality merge at :554-564 is REPLACED by mapFlatPersonalityToNested(finalDetail) so draft.identity.personality is fully overwritten with the mapped block from the LLM detail return"
    - "sample-lines retry heuristic active: if detail.personalitySampleLines fails predicate shouldRetrySampleLines (length === 0 OR every line.length < 15 OR every line matches /^(I am|I'm|Hello|Greetings|My name)/i OR all lines identical case-insensitive) → run ONE additional targeted LLM call focused on voice+sampleLines; max 1 retry per NPC (per D-09); on retry failure fall back to primary detail without crashing worldgen (catch branch returns primary detail)"
    - "npc-generator.ts migrated to import personalityFieldSchema.shape + mapFlatPersonalityToNested from shared module — no field-list duplication left inline (drift prevention per D-02)"
    - "enrichKnownIpWorldgenNpcDraft.ts untouched (D-07 scope exclusion)"
    - "known-ip-worldgen-research.ts untouched (D-07)"
    - "All existing worldgen tests pass after schema extension — mocks updated to return the 7 flat personality fields"
    - "New unit test asserts personality sub-fields non-empty for returned NPCs (key-tier + supporting-tier coverage)"
    - "New unit test asserts key-tier NPC with ipContext present ALSO receives full personality (D-06 parity, enrichKnownIpWorldgenNpcDraft path not regressed)"
    - "New unit test asserts retry fires exactly once when first call returns empty sampleLines"
    - "New unit test asserts retry fires exactly once when first call returns generic sampleLines (e.g. ['Hello', 'I am Dr. Kel'])"
    - "New unit test asserts retry fires exactly once when first call returns all-identical sampleLines"
    - "New unit test asserts retry failure (retry LLM throws) falls back to primary detail without crashing worldgen"
    - "npm --prefix backend test -- run \"npcs-step\" exits 0"
    - "npm --prefix backend run typecheck exits 0"
  artifacts:
    - path: backend/src/worldgen/scaffold-steps/npcs-step.ts
      provides: "Full-personality per-NPC detail generation with retry heuristic for degenerate sampleLines"
      contains: "personalityFieldSchema"
    - path: backend/src/worldgen/__tests__/npcs-step.test.ts
      provides: "Extended unit coverage: full personality block, retry-on-empty/generic/all-identical sampleLines, retry-failure fallback, key-tier known-IP parity"
      contains: "personalitySampleLines"
    - path: backend/src/character/npc-generator.ts
      provides: "Drift-free reuse of personalityFieldSchema.shape + mapFlatPersonalityToNested (D-02)"
      contains: "personalityFieldSchema"
  key_links:
    - from: backend/src/worldgen/scaffold-steps/npcs-step.ts
      to: backend/src/character/personality-schema.ts
      via: "npcDetailSingleSchema spreads personalityFieldSchema.shape into its z.object"
      pattern: "personalityFieldSchema"
    - from: backend/src/worldgen/scaffold-steps/npcs-step.ts
      to: backend/src/character/personality-schema.ts
      via: "draft-merge step calls mapFlatPersonalityToNested(finalDetail) AFTER fromLegacyScaffoldNpc, replacing the degenerate block at :554-564"
      pattern: "mapFlatPersonalityToNested"
    - from: backend/src/character/npc-generator.ts
      to: backend/src/character/personality-schema.ts
      via: "npcSchema spreads personalityFieldSchema.shape; toNpcDraft calls mapFlatPersonalityToNested"
      pattern: "personalityFieldSchema"
---

<objective>
Fix the Phase 64 root-cause parity gap: make `generateNpcsStep` emit the full structured personality block for every NPC tier. Replace the stub in `npcs-step.ts:554-564` (which writes only `summary: detail.persona.trim()` and defaults the other 6 sub-fields to empty/fallback) with a call to `mapFlatPersonalityToNested(finalDetail)` **AFTER** the existing `fromLegacyScaffoldNpc` call. Add a 1-retry fallback for degenerate sampleLines per D-09, with a try/catch around the retry so a retry LLM failure falls back to the primary detail. Migrate `npc-generator.ts` to the shared helper as an isolated low-risk task.

Purpose: `/api/worldgen/regenerate-section section="npcs"` calls `generateNpcsStep` directly (`routes/worldgen.ts:594-597`). Fixing the step fixes both entry-points (initial scaffold + regenerate). This plan implements per user-locked D-01, D-03, D-06, D-08, D-09. Research §3.2 confirms: "Either ordering works provided final `draft.identity.personality` contains all 7 sub-fields before `enrichKnownIpWorldgenNpcDraft`." We pick AFTER-overwrite because it preserves the existing adapter call shape and minimizes blast radius (adapter is already in use elsewhere per GitNexus: `insertNpcs`, `handleSpawnNpc`, `reconcileDraftBackedScaffoldNpc`).

Output:
- Extended `npcs-step.ts` per-NPC schema + prompt + AFTER-adapter mapper wiring + retry heuristic + retry-failure catch
- Migrated `npc-generator.ts` to shared helper (isolated mechanical swap, Task 3)
- Updated `npcs-step.test.ts` with 6 new test cases (empty/generic/all-identical sampleLines, retry failure, key-tier known-IP parity, happy path full personality)
- Green backend tests + typecheck
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
@.planning/phases/64-npc-personality-regeneration-parity/64-REVIEWS.md
@.planning/phases/64-npc-personality-regeneration-parity/64-01-personality-schema-foundation-PLAN.md
@CLAUDE.md
@backend/src/character/personality-schema.ts
@backend/src/character/npc-generator.ts
@backend/src/worldgen/scaffold-steps/npcs-step.ts
@backend/src/worldgen/__tests__/npcs-step.test.ts
@backend/src/character/record-adapters.ts

<interfaces>
<!-- Plan 01 output (available in Wave 1) -->
```ts
// backend/src/character/personality-schema.ts
export const personalityFieldSchema: z.ZodObject<{
  personalitySummary: z.ZodDefault<z.ZodString>;
  personalityVoice: z.ZodDefault<z.ZodString>;
  personalityDecisionStyle: z.ZodDefault<z.ZodString>;
  personalityWorldview: z.ZodDefault<z.ZodString>;
  personalityContradictions: z.ZodDefault<z.ZodArray<z.ZodString>>;
  personalityMythology: z.ZodDefault<z.ZodString>;
  personalitySampleLines: z.ZodDefault<z.ZodArray<z.ZodString>>;
}>;
export type FlatPersonalityFields = z.infer<typeof personalityFieldSchema>;
export function mapFlatPersonalityToNested(flat: FlatPersonalityFields): CharacterPersonality;
```

<!-- Current degenerate personality block in npcs-step.ts:554-564 (REPLACE by calling mapper AFTER fromLegacyScaffoldNpc returned at :537): -->
```ts
// :537 — fromLegacyScaffoldNpc is ALREADY called before the merge block
let draft = fromLegacyScaffoldNpc(legacyNpc, { ... });

// :545-573 — spread-merge that currently writes degenerate personality at :554-564
draft = {
  ...draft,
  identity: {
    ...draft.identity,
    baseFacts: { ... },
    personality: {                        // <-- REPLACE this 10-line literal
      summary: detail.persona.trim(),
      voice: draft.identity.personality?.voice ?? "",
      decisionStyle: draft.identity.personality?.decisionStyle ?? "",
      worldview: draft.identity.personality?.worldview ?? "",
      internalContradictions: draft.identity.personality?.internalContradictions ?? [],
      personalMythology: draft.identity.personality?.personalMythology ?? "",
      sampleLines: draft.identity.personality?.sampleLines ?? [],
    },
    behavioralCore: { ... },
  },
};
```

<!-- Canonical Phase 64 D-03 rewrite: AFTER fromLegacyScaffoldNpc, inside the same spread-merge, call the shared mapper with finalDetail (which includes retry-repaired voice+sampleLines when triggered): -->
```ts
personality: mapFlatPersonalityToNested({
  personalitySummary: finalDetail.personalitySummary || detail.persona.trim(),
  personalityVoice: finalDetail.personalityVoice,
  personalityDecisionStyle: finalDetail.personalityDecisionStyle,
  personalityWorldview: finalDetail.personalityWorldview,
  personalityContradictions: finalDetail.personalityContradictions,
  personalityMythology: finalDetail.personalityMythology,
  personalitySampleLines: finalDetail.personalitySampleLines,
}),
```

<!-- Current npcDetailSingleSchema (:38-73) — EXTEND by spreading personalityFieldSchema.shape: -->
```ts
const npcDetailSingleSchema = z.object({
  persona: z.string()...,
  tags: z.array(z.string())...,
  goals: z.union([...]),
  selfImage: z.string().default(""),
  socialRoles: z.array(z.string()).default([]),
  // EXTEND HERE with ...personalityFieldSchema.shape
});
```

<!-- Retry heuristic predicate (D-09, to be implemented verbatim): -->
```ts
function shouldRetrySampleLines(lines: string[]): boolean {
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  if (trimmed.length === 0) return true;
  if (trimmed.every((l) => l.length < 15)) return true;
  const genericRe = /^(I am|I'm|Hello|Greetings|My name)/i;
  if (trimmed.every((l) => genericRe.test(l))) return true;
  const lower = trimmed.map((l) => l.toLowerCase());
  if (lower.length > 1 && lower.every((l) => l === lower[0])) return true;
  return false;
}
```

<!-- Retry failure branch (Q3 coverage): the try/catch MUST return primary detail, not crash worldgen. -->
```ts
let finalDetail = detail;
if (shouldRetrySampleLines(detail.personalitySampleLines)) {
  try {
    const repaired = await retrySampleLines({ ... });
    finalDetail = { ...detail, personalityVoice: repaired.personalityVoice || detail.personalityVoice, personalitySampleLines: repaired.personalitySampleLines };
  } catch {
    // Retry LLM failed (e.g. provider 5xx). Keep primary detail. Do not crash worldgen.
    // finalDetail remains === detail (primary).
  }
}
```
</interfaces>

<project_conventions>
- TypeScript strict mode
- Zod validation at every LLM boundary
- Max 1 retry per NPC (per D-09) — no unbounded loops
- Keep `npcs-step.ts` under 800 lines; current file is ~620 lines, schema + retry adds ~60 lines
- Preserve per-entity plan+detail pattern (not batch) — current architecture intent
- `safeGenerateObject` is the project's wrapper around `ai.generateObject`; use it (see line 1)
- Do NOT touch `enrichKnownIpWorldgenNpcDraft` (per D-07, 64-CONTEXT.md)
</project_conventions>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pre-edit GitNexus impact analysis</name>
  <files>(no edits — impact analysis only)</files>
  <read_first>
    - backend/src/worldgen/scaffold-steps/npcs-step.ts (current shape)
    - backend/src/character/npc-generator.ts (current shape)
    - .planning/phases/64-npc-personality-regeneration-parity/64-REVIEWS.md (Codex Q1: pre-edit impact requirement)
  </read_first>
  <action>
Run GitNexus impact analysis BEFORE implementation to confirm blast radius (per CLAUDE.md "MUST run impact analysis before editing any symbol"):

1. `gitnexus_impact({target: "generateNpcsStep", direction: "upstream"})` — expect exactly two callers: `scaffold-generator.ts` (initial scaffold pipeline) and `routes/worldgen.ts` (regenerate-section). Any other caller is unexpected scope.

2. `gitnexus_impact({target: "npcDetailSingleSchema", direction: "upstream"})` — expect local-only usage inside `npcs-step.ts`. No external consumers.

3. `gitnexus_impact({target: "toNpcDraft", direction: "upstream"})` — expect callers only from `routes/worldgen.ts` (generate-character + import routes) and any NPC ingestion tests. The `npc-generator.ts` migration (Task 3) touches this symbol.

4. Report summary in task output:
   - d=1 (WILL BREAK) list for each target
   - Risk level: MUST be MEDIUM or lower (HIGH or CRITICAL halts execution pending user review)

If any target returns HIGH/CRITICAL risk, stop and warn user before proceeding. If MEDIUM, document direct callers in the Task 2 read_first set so the executor has context.
  </action>
  <verify>
    <automated>echo "impact analysis is evidence-only; no automated gate"</automated>
  </verify>
  <acceptance_criteria>
    - gitnexus_impact run for generateNpcsStep, npcDetailSingleSchema, toNpcDraft — output captured
    - Risk level recorded as LOW or MEDIUM for all three targets
    - Any HIGH/CRITICAL finding halts the plan for user review
  </acceptance_criteria>
  <done>Pre-edit impact analysis complete; blast radius bounded; executor ready to implement with known risk profile.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend npcs-step.test.ts with 6 failing personality assertions (RED)</name>
  <files>backend/src/worldgen/__tests__/npcs-step.test.ts</files>
  <read_first>
    - backend/src/worldgen/__tests__/npcs-step.test.ts (full existing file — note existing mockGenerateObject sequencing)
    - backend/src/worldgen/scaffold-steps/npcs-step.ts (understand current schema, detail call order, and mapping at :480-603)
    - backend/src/character/personality-schema.ts (from Plan 01 — available since Wave 1 dependency)
    - .planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md (D-06 parity, D-08 sampleLines, D-09 retry heuristic)
    - .planning/phases/64-npc-personality-regeneration-parity/64-REVIEWS.md (Q2 key-tier + ipContext coverage, Q3 all-identical + retry-failure branches)
    - .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md (Wave 0 §npcs-step)
  </read_first>
  <behavior>
    Six NEW test cases added to the existing `describe("generateNpcsStep")` block:

    - Test A (P64-R1 "full personality"): Mock LLM returns BOTH flat personality fields AND the other detail fields. Assert that the returned `ScaffoldNpc[0].draft.identity.personality` has ALL 7 sub-fields populated with the LLM values: `summary`, `voice`, `decisionStyle`, `worldview`, `internalContradictions` (length > 0), `personalMythology`, `sampleLines` (length >= 2).

    - Test B (P64-R4 "retry on empty sampleLines"): Mock first detail call returns `personalitySampleLines: []` and OK other fields. Mock retry (second call) returns 2 substantive sample lines. Assert: mockGenerateObject was called N+1 times for that detail phase, and final draft has 2 sampleLines matching retry output.

    - Test C (P64-R4 "retry on generic sampleLines"): Mock first detail call returns `personalitySampleLines: ["Hello there", "I am a character"]`. Mock retry returns 2 varied substantive lines. Assert retry fired, final lines are the retry output.

    - Test D (P64-R4 "retry on all-identical sampleLines"): Mock first detail call returns `personalitySampleLines: ["The pact is broken and we all know it.", "The pact is broken and we all know it."]`. Assert retry fires (all-identical branch of predicate).

    - Test E (P64-R4 "retry-failure fallback"): Mock first detail call returns `personalitySampleLines: []` (triggers retry). Mock retry call throws `Error("LLM timeout")`. Assert: worldgen does NOT crash; final draft retains primary detail's `personalitySampleLines: []` (or whatever primary returned) — the personality block still has the other 6 sub-fields populated. No unhandled promise rejection.

    - Test F (D-06 P64-R1 "key-tier + ipContext parity"): Mock a key-tier NPC with `ipContext` present in the request. Mock detail call returns full personality. Assert: the returned draft has full personality populated AND `enrichKnownIpWorldgenNpcDraft` was called (via its own mock — known-ip-worldgen-research is mocked at top of file). The personality must NOT be stripped by the known-IP enrichment path (D-07 preservation).

    - Test G (P64-R4 "no retry on good sampleLines"): Mock first detail call returns `personalitySampleLines: ["The winter council decided and I will not revisit it.", "Bring me a more honest argument or leave."]`. Assert mockGenerateObject was NOT called an extra retry time for that NPC.

    All seven tests will FAIL before Task 2's implementation lands.
  </behavior>
  <action>
Add 7 new `it(...)` blocks inside the existing `describe("generateNpcsStep", ...)` in `backend/src/worldgen/__tests__/npcs-step.test.ts`. Each test re-uses the existing `mockGenerateObject` and `fakeReq` fixtures.

Sketch for Test A (adapt for B/C/D/E/F/G):

```ts
it("emits full identity.personality block for every NPC (P64-R1)", async () => {
  // Plan-key returns 1 NPC
  mockGenerateObject
    .mockResolvedValueOnce({
      object: {
        npcs: [{
          name: "Dr. Kel",
          role: "Operates the signal array.",
          locationName: "Observation Deck",
          factionName: "Station Authority",
        }],
      },
    })
    // Plan-supporting returns 0
    .mockResolvedValueOnce({ object: { npcs: [] } })
    // Detail for Dr. Kel — FULL personality fields
    .mockResolvedValueOnce({
      object: {
        persona: "A sleep-deprived scientist haunted by unexplained patterns in the static.",
        selfImage: "The only person listening closely enough to hear the station answer.",
        socialRoles: ["Signal Array Custodian"],
        tags: ["Signal Analyst", "Paranoid", "Exhausted"],
        goals: {
          shortTerm: ["Prove the burst came from outside"],
          longTerm: ["Decode the source before it's silenced"],
        },
        personalitySummary: "Cautious scholar who trusts data more than people",
        personalityVoice: "Clipped, precise, frequently referring to timestamps",
        personalityDecisionStyle: "Collects three independent readings before moving",
        personalityWorldview: "Patterns matter; people lie but data rarely does",
        personalityContradictions: ["Preaches objectivity but nurses a private grudge against the Authority"],
        personalityMythology: "The last honest reader left on the deck",
        personalitySampleLines: [
          "I have that timestamped, if you would like to check.",
          "Patience. The static is teaching me something.",
        ],
      },
    });

  const result = await generateNpcsStep(
    fakeReq as any,
    fakeReq.premise,
    ["Observation Deck"],
    ["Station Authority"],
    null,
  );

  expect(result).toHaveLength(1);
  const personality = result[0]!.draft!.identity.personality;
  expect(personality.summary).toBe("Cautious scholar who trusts data more than people");
  expect(personality.voice).toContain("Clipped");
  expect(personality.decisionStyle).toContain("three independent readings");
  expect(personality.worldview).toContain("Patterns matter");
  expect(personality.internalContradictions.length).toBeGreaterThan(0);
  expect(personality.personalMythology).toBe("The last honest reader left on the deck");
  expect(personality.sampleLines.length).toBeGreaterThanOrEqual(2);
});
```

Test B — retry on empty:
```ts
it("retries sample-lines when first call returns empty array (P64-R4)", async () => {
  mockGenerateObject
    .mockResolvedValueOnce({ object: { npcs: [{ name: "Mara", role: "Trader.", locationName: "Dock Bazaar", factionName: null }] } })
    .mockResolvedValueOnce({ object: { npcs: [] } })
    // First detail — empty sampleLines triggers retry
    .mockResolvedValueOnce({
      object: {
        persona: "Sharp trader who knows every smuggler in the sector.",
        selfImage: "The last honest broker in a market of liars.",
        socialRoles: ["Broker"],
        tags: ["Cynical", "Networked", "Observant"],
        goals: { shortTerm: ["Move the shipment"], longTerm: ["Buy a ship of her own"] },
        personalitySummary: "Cynical broker who trusts nobody",
        personalityVoice: "Dry, transactional, peppered with old spacer slang",
        personalityDecisionStyle: "Haggles twice, walks away the third time",
        personalityWorldview: "Every deal is a small lie both sides agree to",
        personalityContradictions: ["Claims neutrality but helps refugees for free"],
        personalityMythology: "The broker who never gets cheated",
        personalitySampleLines: [],  // <-- TRIGGER empty
      },
    })
    // Retry call — voice+sampleLines-focused
    .mockResolvedValueOnce({
      object: {
        personalityVoice: "Dry, transactional, peppered with old spacer slang",
        personalitySampleLines: [
          "Half now, half when the cargo moves. Same as last time.",
          "You brought me a problem. I brought you a price. We're done.",
        ],
      },
    });

  const result = await generateNpcsStep(fakeReq as any, fakeReq.premise, ["Dock Bazaar"], [], null);

  // 2 plan + 1 detail + 1 retry = 4 LLM calls
  expect(mockGenerateObject).toHaveBeenCalledTimes(4);
  expect(result[0]!.draft!.identity.personality.sampleLines).toHaveLength(2);
  expect(result[0]!.draft!.identity.personality.sampleLines[0]).toContain("Half now");
});
```

Test C — generic openers (same pattern, first detail returns `["Hello there", "I am a character"]`).
Test D — all-identical (same pattern, first detail returns `["The pact is broken and we all know it.", "The pact is broken and we all know it."]`).

Test E — retry-failure fallback:
```ts
it("falls back to primary detail when retry LLM fails (P64-R4)", async () => {
  mockGenerateObject
    .mockResolvedValueOnce({ object: { npcs: [{ name: "Quiet One", role: "Silent witness.", locationName: "Shrine", factionName: null }] } })
    .mockResolvedValueOnce({ object: { npcs: [] } })
    .mockResolvedValueOnce({
      object: {
        persona: "A mute watcher whose vows forbid speaking to outsiders.",
        selfImage: "The keeper of silence; speech is the first betrayal.",
        socialRoles: ["Shrinekeeper"],
        tags: ["Silent", "Devout"],
        goals: { shortTerm: ["Keep vigil"], longTerm: ["Preserve the shrine"] },
        personalitySummary: "Non-dialog NPC; vows forbid speech",
        personalityVoice: "Never speaks; communicates through gesture",
        personalityDecisionStyle: "Defers to elder; acts only when silence would be worse",
        personalityWorldview: "Speech scatters truth; silence contains it",
        personalityContradictions: ["Sworn to silence yet keeps exhaustive written records"],
        personalityMythology: "The unheard witness",
        personalitySampleLines: [],  // triggers retry
      },
    })
    .mockRejectedValueOnce(new Error("LLM timeout during retry"));

  const result = await generateNpcsStep(fakeReq as any, fakeReq.premise, ["Shrine"], [], null);

  // Retry failed — fallback to primary detail. No crash.
  expect(result).toHaveLength(1);
  const personality = result[0]!.draft!.identity.personality;
  expect(personality.summary).toContain("Non-dialog NPC");
  expect(personality.voice).toContain("gesture");
  expect(personality.sampleLines).toEqual([]);  // primary detail's empty array preserved
});
```

Test F — key-tier + ipContext parity (D-06):
```ts
it("populates full personality for key-tier NPC even when ipContext triggers enrichKnownIpWorldgenNpcDraft (D-06)", async () => {
  // This test MUST be colocated with the existing mocks for known-ip-worldgen-research
  // — check the top of the test file for the vi.mock('../known-ip-worldgen-research', ...) block
  // and ensure its enrichKnownIpWorldgenNpcDraft mock is a passthrough that preserves identity.personality.

  const ipContext = {
    franchise: { name: "TestFranchise", ... },  // minimal valid shape — read ./types.ts
    // ... whatever minimum IpResearchContext requires
  };

  mockGenerateObject
    .mockResolvedValueOnce({ object: { npcs: [{ name: "Canon Hero", role: "Chosen.", locationName: "Capital", factionName: "Order" }] } })
    .mockResolvedValueOnce({ object: { npcs: [] } })
    .mockResolvedValueOnce({
      object: {
        persona: "The canonical chosen one, bound to the Order.",
        selfImage: "Reluctant symbol; prefers doing to meaning.",
        socialRoles: ["Champion"],
        tags: ["Brave", "Burdened"],
        goals: { shortTerm: ["Defend the Capital"], longTerm: ["Restore the Order"] },
        personalitySummary: "Reluctant champion who carries the Order's hope",
        personalityVoice: "Plainspoken, reflexively deferent, occasional dry humor",
        personalityDecisionStyle: "Acts fast but privately doubts the whole affair",
        personalityWorldview: "The Order is imperfect but better than the alternative",
        personalityContradictions: ["Publicly certain, privately uncertain about the Order's motives"],
        personalityMythology: "The one who would rather not be the one",
        personalitySampleLines: [
          "I will do what is asked. Do not ask me why.",
          "If the Order falls, something worse takes its place.",
        ],
      },
    });

  const result = await generateNpcsStep(
    { ...fakeReq, /* whatever enables ipContext */ } as any,
    fakeReq.premise,
    ["Capital"],
    ["Order"],
    ipContext as any,
  );

  expect(result).toHaveLength(1);
  const personality = result[0]!.draft!.identity.personality;
  expect(personality.summary).toContain("Reluctant champion");
  expect(personality.voice).toContain("Plainspoken");
  expect(personality.sampleLines).toHaveLength(2);
});
```

Test G — no retry on good sampleLines (assert `mockGenerateObject.toHaveBeenCalledTimes(3)` — 2 plan + 1 detail only).

**IMPORTANT — audit existing mocks:**
Every existing `mockGenerateObject.mockResolvedValueOnce({ object: { persona: ..., selfImage: ..., socialRoles: ..., tags: ..., goals: ... } })` that represents a DETAIL call now needs the 7 personality fields added (otherwise Zod defaults kick in and personality is empty — test will green but not prove the fix). Grep `selfImage:` in the test file; every occurrence sits inside a detail-call mock. Update each one whose assertions touch personality.

Run the suite. ALL new tests MUST FAIL (RED) — implementation does not yet extend schema nor add retry.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "npcs-step" 2>&1 | grep -Ec "(FAIL|failed)"</automated>
  </verify>
  <acceptance_criteria>
    - `backend/src/worldgen/__tests__/npcs-step.test.ts` contains 7 new `it(...)` blocks with strings: "full identity.personality block", "retries sample-lines when first call returns empty", "retries sample-lines when first call returns generic", "retries sample-lines when first call returns all-identical", "falls back to primary detail when retry LLM fails", "key-tier NPC even when ipContext", "does not retry when sample-lines are substantive"
    - `grep -c "personalitySampleLines" backend/src/worldgen/__tests__/npcs-step.test.ts` returns ≥ 10
    - `grep -c "personalityContradictions" backend/src/worldgen/__tests__/npcs-step.test.ts` returns ≥ 5
    - `grep -c "mockRejectedValueOnce" backend/src/worldgen/__tests__/npcs-step.test.ts` returns ≥ 1 (retry-failure test)
    - Running the test suite shows the 7 new tests FAILING (RED confirmed). Existing tests may also fail because their mocks no longer populate personality correctly — THAT IS EXPECTED and will be fixed by Task 3 updating those same mocks.
  </acceptance_criteria>
  <done>7 new test cases added; all fail as expected (RED); existing tests may also fail due to mock-shape drift (to be corrected in Task 3).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend npcs-step.ts schema + AFTER-adapter mapper + retry + retry-failure catch (GREEN) per D-01/D-03/D-08/D-09</name>
  <files>backend/src/worldgen/scaffold-steps/npcs-step.ts,backend/src/worldgen/__tests__/npcs-step.test.ts</files>
  <read_first>
    - backend/src/worldgen/scaffold-steps/npcs-step.ts (FULL file — especially :38-73 schema, :480-503 detail call, :508-603 merge/mapping loop)
    - backend/src/character/personality-schema.ts (Plan 01 output — this is the shared helper to import)
    - backend/src/character/npc-generator.ts (reference: prompt text style for personality fields, mapping pattern)
    - backend/src/worldgen/__tests__/npcs-step.test.ts (Task 2-updated tests drive the implementation shape)
    - backend/src/character/record-adapters.ts (:652-682 — confirm fromLegacyScaffoldNpc shape; mapper runs AFTER this call)
    - .planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md (D-01, D-03, D-08, D-09 — exact field names and retry heuristic)
    - .planning/phases/64-npc-personality-regeneration-parity/64-REVIEWS.md (B1 ordering resolution: AFTER fromLegacyScaffoldNpc)
  </read_first>
  <action>
**Step A — Add imports at the top of `npcs-step.ts`:**

```ts
import {
  personalityFieldSchema,
  mapFlatPersonalityToNested,
  type FlatPersonalityFields,
} from "../../character/personality-schema.js";
```

**Step B — Extend `npcDetailSingleSchema` (:38-73) by spreading `personalityFieldSchema.shape` (D-01):**

```ts
const npcDetailSingleSchema = z.object({
  persona: z.string().describe(
    "2-3 sentences: personality, background, motivation. Concrete details, no vague archetypes.",
  ),
  tags: z.array(z.string()).describe(
    "Character traits and skills: [Master Swordsman], [Cynical], [Wealthy]",
  ),
  goals: z.union([
    z.object({
      shortTerm: z.array(z.string()).min(1).max(3),
      longTerm: z.array(z.string()).min(1).max(3),
    }),
    z.object({
      short_term: z.array(z.string()).min(1).max(3),
      long_term: z.array(z.string()).min(1).max(3),
    }).transform((g) => ({ shortTerm: g.short_term, longTerm: g.long_term })),
  ]).catch({ shortTerm: ["Survive"], longTerm: ["Find purpose"] }),
  selfImage: z.string().default("").describe(
    "1 sentence: how this character privately frames their own role, worth, or burden. Must not duplicate persona verbatim.",
  ),
  socialRoles: z.array(z.string()).default([]).describe(
    "1-3 concise in-world roles or statuses, e.g. [Teacher], [Clan Heir], [Border Commander]. Do not include generic system labels like NPC or player.",
  ),
  // --- Phase 64 D-01: spread shared personality fragment ---
  ...personalityFieldSchema.shape,
});
```

**Step C — Extend the prompt text (D-08):**

Inside `generateNpcDetail`, locate the `FIELD INSTRUCTIONS` block. After the `goals:` bullet, add 7 new bullets:

```
- personalitySummary: 1-2 sentences naming the NPC's essential interior shape in their own frame. Different from persona (which is third-person exterior read).
- personalityVoice: 1-2 sentences describing HOW they speak — vocabulary register, rhythm, verbal habits, topics they avoid. Prose, not a tag list.
- personalityDecisionStyle: 1 sentence on how this character reaches a decision when under pressure (deliberative / impulsive / consultative / silent-then-decisive).
- personalityWorldview: 1 sentence naming the operative belief shaping their stance on the present world.
- personalityContradictions: 1-3 entries formatted "Believes X, but acts Y because Z". Concrete, drawn from persona + role.
- personalityMythology: 1 sentence — the private story this character tells themselves about who they are.
- personalitySampleLines: 2-3 quoted phrases this character would actually say in-world. Direct speech (no narrator framing). Each at least 15 characters. Avoid generic greetings ("Hello", "I am...").
```

**Step D — Add module-level retry helpers (D-09):**

```ts
function shouldRetrySampleLines(lines: string[]): boolean {
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  if (trimmed.length === 0) return true;
  if (trimmed.every((l) => l.length < 15)) return true;
  const generic = /^(I am|I'm|Hello|Greetings|My name)/i;
  if (trimmed.every((l) => generic.test(l))) return true;
  const lower = trimmed.map((l) => l.toLowerCase());
  if (lower.length > 1 && lower.every((l) => l === lower[0])) return true;
  return false;
}

async function retrySampleLines(opts: {
  req: GenerateScaffoldRequest;
  npcName: string;
  npcRole: string;
  firstPersona: string;
  firstVoice: string;
  firstContradictions: string[];
}): Promise<{ personalityVoice: string; personalitySampleLines: string[] }> {
  const retrySchema = z.object({
    personalityVoice: z.string().max(600).default(""),
    personalitySampleLines: z.array(z.string().max(300)).min(2).max(3),
  });
  const prompt = `You are repairing the VOICE + SAMPLE LINES for an RPG NPC. The first attempt produced empty, identical, or generic sample lines. Produce 2-3 SPECIFIC, IN-CHARACTER quoted phrases (no narrator framing, each 15+ characters) plus a refined voice description. Do not repeat the previous attempt.

NPC: "${opts.npcName}"
Role: ${opts.npcRole}
Persona excerpt: ${opts.firstPersona}
Previous voice attempt: ${opts.firstVoice}
Known contradictions: ${opts.firstContradictions.join("; ") || "(none)"}

RULES:
- Each sample line MUST be a direct quote the NPC would say. No "He says..." framing.
- Avoid greetings like "Hello" or self-introductions like "I am X".
- Each line must be at least 15 characters.
- Lines must NOT be identical — vary the sentiment across 2-3 distinct utterances.
- Voice description must be prose about register/rhythm/topics avoided, not a tag list.`;

  const result = await generateObject({
    model: createModel(opts.req.role.provider),
    schema: retrySchema,
    prompt,
    temperature: Math.min(opts.req.role.temperature, 0.35),
    maxOutputTokens: opts.req.role.maxTokens,
    retries: 1,
  });
  return result.object;
}
```

**Step E — Wire retry + retry-failure catch into the per-NPC detail loop (D-09):**

In the per-NPC loop (around :465-503 where `generateNpcDetail` is called and `allDetailed.push(...)` happens), capture `detail` into `finalDetail` with retry wrapping:

```ts
const detail = await generateNpcDetail({ req, npc, ... });  // existing call

let finalDetail = detail;
if (shouldRetrySampleLines(detail.personalitySampleLines)) {
  try {
    const repaired = await retrySampleLines({
      req,
      npcName: npc.name,
      npcRole: npc.role,
      firstPersona: detail.persona,
      firstVoice: detail.personalityVoice,
      firstContradictions: detail.personalityContradictions,
    });
    finalDetail = {
      ...detail,
      personalityVoice: repaired.personalityVoice || detail.personalityVoice,
      personalitySampleLines: repaired.personalitySampleLines,
    };
  } catch {
    // Q3 retry-failure branch: keep primary detail. Never crash worldgen.
    finalDetail = detail;
  }
}

// Use `finalDetail` (not `detail`) in allDetailed.push and previouslyDetailed.push:
allDetailed.push({
  name: npc.name,
  persona: finalDetail.persona,
  tags: finalDetail.tags,
  goals: finalDetail.goals,
  selfImage: finalDetail.selfImage,
  socialRoles: finalDetail.socialRoles,
  personalitySummary: finalDetail.personalitySummary,
  personalityVoice: finalDetail.personalityVoice,
  personalityDecisionStyle: finalDetail.personalityDecisionStyle,
  personalityWorldview: finalDetail.personalityWorldview,
  personalityContradictions: finalDetail.personalityContradictions,
  personalityMythology: finalDetail.personalityMythology,
  personalitySampleLines: finalDetail.personalitySampleLines,
});
```

Also extend the `allDetailed` local-tuple type (or inline object) to carry the 7 new personality fields into the merge phase. The `previouslyDetailed` tracker (used for context in subsequent planning calls) does not need personality fields — keep it lean.

**Step F — Replace the degenerate personality merge at :554-564 with the mapper call (D-03, AFTER fromLegacyScaffoldNpc per B1):**

Locate the existing merge at :545-573 where `fromLegacyScaffoldNpc` has already run at :537. REPLACE ONLY the personality sub-object (:554-564). The `fromLegacyScaffoldNpc` call at :537 stays. This is the canonical B1 resolution: AFTER-overwrite, matching action and must_haves consistently.

```ts
let draft = fromLegacyScaffoldNpc(legacyNpc, {          // :537 — unchanged
  canonicalStatus,
  sourceKind: "worldgen",
  currentLocationName: locationName,
  factionName,
  originMode: "resident",
});

draft = {                                                // :545 — spread-merge unchanged
  ...draft,
  identity: {
    ...draft.identity,
    baseFacts: {
      biography: draft.identity.baseFacts?.biography ?? "",
      socialRole: roleLabels,
      hardConstraints: draft.identity.baseFacts?.hardConstraints ?? [],
    },
    personality: mapFlatPersonalityToNested({            // <-- REPLACES :554-564
      personalitySummary: detail.personalitySummary || detail.persona.trim(),
      personalityVoice: detail.personalityVoice,
      personalityDecisionStyle: detail.personalityDecisionStyle,
      personalityWorldview: detail.personalityWorldview,
      personalityContradictions: detail.personalityContradictions,
      personalityMythology: detail.personalityMythology,
      personalitySampleLines: detail.personalitySampleLines,
    }),
    behavioralCore: {                                    // :565 — unchanged
      motives: draft.identity.behavioralCore?.motives ?? [],
      pressureResponses: draft.identity.behavioralCore?.pressureResponses ?? [],
      taboos: draft.identity.behavioralCore?.taboos ?? [],
      attachments: draft.identity.behavioralCore?.attachments ?? [],
      selfImage: detail.selfImage.trim(),
    },
  },
};
```

Note: `detail` here refers to the merge-loop variable (which was already re-fetched from `allDetailed`). Since `allDetailed` entries now carry the 7 personality fields per Step E, the merge block sees the post-retry values. The `detail.personalitySummary || detail.persona.trim()` fallback preserves behavior when the LLM omits personalitySummary (schema `.default("")` returns `""`, which is falsy → persona trim wins).

**Step G — Add the D-07 preservation comment and keep the enrichKnownIpWorldgenNpcDraft call intact:**

```ts
// D-07: enrichKnownIpWorldgenNpcDraft writes PowerStats only — it does not
// touch identity.personality. Phase 64 leaves this call intact. Personality
// survives the call because known-ip-worldgen-research never mutates it.
if (ipContext && tier === "key") {
  draft = await enrichKnownIpWorldgenNpcDraft({
    draft,
    franchise: ipContext.franchise,
    role: req.role,
    research: req.research,
    premise: refinedPremise,
    premiseDivergence: req.premiseDivergence,
  });
}
```

**Step H — Update existing DETAIL-call mocks in `npcs-step.test.ts`:**

Every `.mockResolvedValueOnce({ object: { persona: ..., selfImage: ..., ... } })` that represents a DETAIL call (not a plan call) MUST now include the 7 personality fields. Grep `selfImage:` inside the test file — every occurrence is a detail-call mock. Add the 7 fields to each one. Tests that do not assert on personality can leave placeholder strings (e.g. `personalitySummary: "test summary"`, `personalitySampleLines: ["test line one of sufficient length.", "test line two of sufficient length."]`).

**Verification:**
```
npm --prefix backend test -- run "npcs-step"
npm --prefix backend run typecheck
```
All 7 new tests PASS; existing tests PASS with updated mocks.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "npcs-step" && npm --prefix backend run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "personalityFieldSchema" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns ≥ 2 lines (import + spread)
    - `grep -n "mapFlatPersonalityToNested" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns ≥ 1 (use in draft merge AFTER fromLegacyScaffoldNpc)
    - `grep -n "shouldRetrySampleLines" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns ≥ 2 (definition + call)
    - `grep -n "retrySampleLines" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns ≥ 2 (definition + call)
    - `grep "I am\\|I'm\\|Hello\\|Greetings\\|My name" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns ≥ 1 (regex literal present)
    - Order check: `grep -n "fromLegacyScaffoldNpc\|mapFlatPersonalityToNested" backend/src/worldgen/scaffold-steps/npcs-step.ts` shows fromLegacyScaffoldNpc line number LESS THAN mapFlatPersonalityToNested line number inside the merge block (AFTER-ordering enforced per B1)
    - `grep -n "try {" backend/src/worldgen/scaffold-steps/npcs-step.ts` and `grep -n "} catch" backend/src/worldgen/scaffold-steps/npcs-step.ts` show the try/catch around retrySampleLines (Q3 retry-failure branch)
    - `npm --prefix backend test -- run "npcs-step"` exits 0 (all 7 new tests + all existing tests pass)
    - `npm --prefix backend run typecheck` exits 0
    - `git diff backend/src/character/known-ip-worldgen-research.ts` is EMPTY (D-07 preserved)
  </acceptance_criteria>
  <done>npcs-step.ts emits full personality per NPC AFTER fromLegacyScaffoldNpc; retry heuristic active with try/catch fallback; D-07 preserved; all 7 new tests green (P64-R1 + P64-R3 + P64-R4 covered including key-tier+ipContext parity and retry-failure branch).</done>
</task>

<task type="auto">
  <name>Task 4: npc-generator.ts migration to shared helper (low-risk mechanical swap, D-02)</name>
  <files>backend/src/character/npc-generator.ts</files>
  <read_first>
    - backend/src/character/npc-generator.ts (FULL — note current flat fields at :29-35 and mapping at :111-118)
    - backend/src/character/personality-schema.ts (Plan 01 output)
    - .planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md (D-02)
  </read_first>
  <action>
Annotation: **This task is a low-risk mechanical swap.** Blast radius is bounded (verified by Task 1 gitnexus_impact on `toNpcDraft`). It is isolated in its own Task (not interleaved with the core fix in Task 3) per Q4 review guidance. No behavioral change is expected — semantics are preserved if `personalityFieldSchema.shape` matches the previous inline fields verbatim (Plan 01 Task 2's acceptance criteria verified this).

**Step A — Add import at top of `npc-generator.ts`:**

```ts
import {
  personalityFieldSchema,
  mapFlatPersonalityToNested,
} from "./personality-schema.js";
```

**Step B — Replace the explicit 7 flat fields at `:29-35` with a spread:**

```ts
const npcSchema = z.object({
  name: z.string(),
  race: z.string().max(100).default(""),
  gender: z.string().max(100).default(""),
  age: z.string().max(100).default(""),
  appearance: z.string().max(1000).default(""),
  backgroundSummary: z.string().max(2000).default("").describe(...),
  personaSummary: z.string().max(2000).default("").describe(...),
  ...personalityFieldSchema.shape,   // <-- D-02: shared fragment
  tags: z.array(z.string()).min(3).max(10),
  drives: z.array(z.string()).default([]),
  frictions: z.array(z.string()).default([]),
  shortTermGoals: z.array(z.string()).default([]),
  longTermGoals: z.array(z.string()).default([]),
  locationName: z.string(),
  factionName: z.string().nullable(),
});
```

**Step C — Replace the explicit 7-line `personality: { summary: ..., voice: ..., ... }` at `:111-118` with:**

```ts
personality: mapFlatPersonalityToNested(npc),
```

No other changes to `npc-generator.ts`. The `buildNpcFlatOutputStrategy()` prompt text stays intact (that's prompt-side, not schema-side).

**Step D — Run targeted test to confirm no behavioral drift:**
```
npm --prefix backend test -- run "npc-generator"
npm --prefix backend run typecheck
```
Both MUST exit 0. The existing `npc-generator.test.ts` suite should pass without any mock changes — the schema shape and mapper output are byte-identical after migration.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "npc-generator" && npm --prefix backend run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "personalityFieldSchema" backend/src/character/npc-generator.ts` returns ≥ 2 (import + spread)
    - `grep -n "mapFlatPersonalityToNested" backend/src/character/npc-generator.ts` returns ≥ 1 (call in toNpcDraft)
    - `grep -c "personalitySummary:" backend/src/character/npc-generator.ts` in z.object literal context — the old 7 explicit field declarations should be removed. Remaining occurrences, if any, must be inside `buildNpcFlatOutputStrategy()` prompt text (not inside the Zod schema literal).
    - `grep -n "npc.personalityVoice\|npc.personalityDecisionStyle\|npc.personalityWorldview\|npc.personalityContradictions\|npc.personalityMythology\|npc.personalitySampleLines" backend/src/character/npc-generator.ts` returns 0 (the old explicit mapping at :111-118 is replaced by the mapper call)
    - `npm --prefix backend test -- run "npc-generator"` exits 0
    - `npm --prefix backend run typecheck` exits 0
  </acceptance_criteria>
  <done>npc-generator.ts migrated to shared helper; zero behavioral drift; existing tests green (D-02 drift prevention landed).</done>
</task>

<task type="auto">
  <name>Task 5: Post-implementation gitnexus verification + full-suite check</name>
  <files>(no edits — verification only)</files>
  <read_first>
    - backend/src/worldgen/scaffold-steps/npcs-step.ts
    - backend/src/character/npc-generator.ts
    - backend/src/character/personality-schema.ts
  </read_first>
  <action>
1. Run `gitnexus_impact({target: "generateNpcsStep", direction: "upstream"})` again (post-implementation) — confirm blast radius unchanged from Task 1 pre-edit run.

2. Run `gitnexus_detect_changes({scope: "all"})` — verify changed files match files_modified exactly:
   - backend/src/worldgen/scaffold-steps/npcs-step.ts
   - backend/src/worldgen/__tests__/npcs-step.test.ts
   - backend/src/character/npc-generator.ts

3. `known-ip-worldgen-research.ts` verification (D-07): `git diff backend/src/character/known-ip-worldgen-research.ts` — must show ZERO changes.

4. Run full backend suite to catch any cross-test collisions from the Task 4 migration:
   ```
   npm --prefix backend test -- run
   ```
   Any sibling test file failure must be diagnosed (a mock shape expectation may have silently drifted). Fix inline or defer to Plan 05 verification gate if the failure is pre-existing (unrelated to this plan).
  </action>
  <verify>
    <automated>npm --prefix backend test -- run && npm --prefix backend run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - Full backend suite exits 0
    - Typecheck exits 0
    - gitnexus_impact shows only expected upstream callers (scaffold-generator, routes/worldgen, character/ingestion/routes) — no surprise fanout
    - gitnexus_detect_changes matches files_modified exactly (3 files)
    - `git diff backend/src/character/known-ip-worldgen-research.ts` shows no changes (D-07 preserved)
  </acceptance_criteria>
  <done>Scope contained to 3 files; full suite green; D-07 preserved; retry-on-generics heuristic + retry-failure fallback + key-tier-ipContext parity verified by unit tests.</done>
</task>

</tasks>

<verification>
- `npm --prefix backend test -- run "npcs-step"` exits 0 — 7 new personality assertions pass (including key-tier+ipContext parity, retry-on-empty, retry-on-generic, retry-on-all-identical, retry-failure fallback, no-retry happy path).
- `npm --prefix backend test -- run "npc-generator"` exits 0 — migration to shared helper did not break existing tests.
- `npm --prefix backend test -- run` exits 0 — full backend suite green.
- `npm --prefix backend run typecheck` exits 0.
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` imports `personalityFieldSchema` + `mapFlatPersonalityToNested` from the shared helper.
- Mapper call sits AFTER fromLegacyScaffoldNpc (canonical B1 ordering) inside the existing spread-merge block.
- `shouldRetrySampleLines` predicate exactly matches D-09 heuristic (length<15, generic regex, all-identical).
- `retrySampleLines` helper exists; wrapped in try/catch for Q3 retry-failure fallback; max 1 retry per NPC.
- `backend/src/character/npc-generator.ts` migrated — no duplicated flat personality fields in the Zod schema literal.
- `backend/src/character/known-ip-worldgen-research.ts` is UNCHANGED (D-07 enforced).
</verification>

<success_criteria>
- generateNpcsStep (used by both initial scaffold + regenerate-section) emits non-empty personality sub-fields for every NPC when the LLM cooperates; degrades gracefully with `.default("")` when LLM omits.
- Sample-lines retry heuristic catches the three degenerate cases from D-09 exactly (empty, generic, all-identical).
- Retry-failure fallback keeps worldgen alive when the retry LLM throws.
- Key-tier + ipContext parity test confirms D-06 holds through the known-IP enrichment path.
- Shared helper used at both call-sites; drift impossible (future edits flow through personality-schema.ts).
- P64-R1, P64-R3, P64-R4 all covered by unit tests.
- D-07 preserved: known-ip-worldgen-research.ts untouched.
</success_criteria>

<requirement_coverage>
- **P64-R1** — `npcs-step.ts` writes full personality block via mapFlatPersonalityToNested; Test A asserts all 7 sub-fields populated on the returned draft; Test F asserts same for key-tier + ipContext path (D-06 parity).
- **P64-R3** — mapper call sits AFTER the existing `fromLegacyScaffoldNpc` call and BEFORE `enrichKnownIpWorldgenNpcDraft`; personality is OVERWRITTEN (not merged) into `draft.identity.personality` via the mapper. RESEARCH.md §3.2 approves this ordering.
- **P64-R4** — `shouldRetrySampleLines` + `retrySampleLines` + max-1-retry-per-NPC + try/catch fallback; Tests B, C, D, E, G cover the three predicate branches (empty, generic, all-identical), the retry-failure fallback, and the no-retry happy path.
</requirement_coverage>

<estimates>
- Effort: ~55-65 min Claude execution (schema extend + retry + 7 test cases + existing-test mock audit + npc-generator migration).
- Test runtime: < 15s for full worldgen suite.
- Risk: existing tests' mocks require updates (Step H) — audit thoroughly.
</estimates>

<risks>
- **R1 — Existing test mock drift.** Existing detail-call mocks in `npcs-step.test.ts` do not include the 7 personality fields. With `.default("")` they parse cleanly, but tests asserting non-empty personality will see empty values. **Mitigation:** Task 3 Step H explicitly audits every `selfImage:` occurrence as a detail-call mock and adds the 7 personality fields. The `personalitySummary || detail.persona.trim()` fallback in Step F further softens this.
- **R2 — Retry LLM budget.** Retry costs one extra call per NPC when triggered. In worst-case worlds (20 NPCs, all triggering), doubles cost. **Mitigation:** D-09 caps retry to 1 per NPC. Heuristic is strict enough that normal GLM output doesn't trigger it (verified by Test G).
- **R3 — Retry LLM failure crashing worldgen.** Without a catch, a retry provider error would propagate up and fail the whole scaffold run. **Mitigation:** Q3/Step E explicit try/catch returns primary detail on retry failure. Test E proves this branch.
- **R4 — Regenerate-section integration not yet proven.** This plan only covers the unit level. Plan 03 adds the integration test that walks the HTTP route → generateNpcsStep → response body path.
- **R5 — `npc-generator.ts` behavioral drift.** Migrating the schema spread + mapper call is semantic-preserving IF `personalityFieldSchema.shape` matches `:29-35` byte-for-byte (Plan 01 Task 2's acceptance_criteria verified that). Task 4 runs the existing `npc-generator.test.ts` suite to confirm no drift.
</risks>

<output>
After completion, create `.planning/phases/64-npc-personality-regeneration-parity/64-02-SUMMARY.md` with:
- Tasks completed (impact analysis → RED tests → GREEN implementation → npc-generator migration → verify)
- Files modified (3)
- Schema + retry + retry-failure-catch + mapper diffs
- Test output (7 new tests + existing tests green)
- Typecheck output (exit 0)
- gitnexus_impact + detect_changes digests (pre-edit and post-edit)
- D-07 preservation evidence (`git diff` on known-ip-worldgen-research.ts empty)
- B1 ordering evidence: mapper call LINE NUMBER > fromLegacyScaffoldNpc call LINE NUMBER
- Note: regenerate-section integration proof lands in Plan 03
</output>
</content>
</invoke>