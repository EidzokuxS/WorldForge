---
phase: 65-supporting-npc-power-stats-and-review-payload-parity
plan: 02
slug: worldgen-npcs-step-integration
type: execute
wave: 2
status: draft
depends_on: [65-01]
files_modified:
  - backend/src/worldgen/scaffold-steps/npcs-step.ts
  - backend/src/worldgen/__tests__/npcs-step.test.ts
autonomous: true
requirements: [P65-R1, P65-R3]
must_haves:
  truths:
    - "backend/src/worldgen/scaffold-steps/npcs-step.ts no longer contains the gate 'if (ipContext && tier === \"key\")'. The per-loop inline enrichKnownIpWorldgenNpcDraft call at line 679-689 is replaced by a single post-loop call to enrichNpcsBatch covering every generated draft in every quadrant."
    - "After the detail loop builds all ScaffoldNpc drafts, enrichNpcsBatch runs ONCE — exactly one invocation — with the full batch. The caller synthesizes per-NPC IngestionClassification from (ipContext, tier) and npcs-step's own premiseDivergence signal. Both tiers ('key' and 'supporting') are enriched; both worlds (ipContext-present and ipContext-null) are enriched."
    - "Fail-closed: if enrichNpcsBatch throws, generateNpcsStep throws — no partial scaffold emission, no swallowed error. The caller (scaffold-generator or regenerate-section route) sees the IngestionPipelineError thrown by the underlying dispatcher's retry exhaustion."
    - "No Human-default branch added anywhere. No new early-return for supporting NPCs. No new fallback to unenriched drafts."
    - "Existing Phase 64 personality mapping (npcs-step.ts:653-668) is preserved UNCHANGED. Only the power-stats enrichment block is replaced. Ordering invariant preserved: personality mapping runs during the loop, enrichment runs once after the loop."
    - "Integration test 'generateNpcsStep enriches powerStats for both tiers in known-IP world' added to backend/src/worldgen/__tests__/npcs-step.test.ts. Mocks safeGenerateObject for LLM seams AND mocks enrichKnownIpWorldgenNpcDraft to return a draft with non-null powerStats. Asserts both the key-tier AND supporting-tier output ScaffoldNpcs have draft.powerStats populated."
    - "Integration test 'generateNpcsStep enriches powerStats for both tiers in original world' added. Mocks safeGenerateObject AND assessOriginalCharacterPowerStats. Asserts both tiers' output drafts carry draft.powerStats."
    - "Integration test 'generateNpcsStep fails closed when enrichment retry exhausts (supporting-tier regression)' — simulates enrichKnownIpWorldgenNpcDraft throwing, asserts generateNpcsStep rejects with IngestionPipelineError stage='power_assess' and NO npcs are returned. The call site may pass concurrency=1 to assessPowerStats (via enrichNpcsBatch options) so the retry backoff is serial and test runtime stays predictable."
    - "'enrichment runs once' regression: Test B asserts vi.mocked(enrichNpcsBatch) (or its leaf mocks) is invoked exactly once for the full batch — not once per NPC. Locks the post-loop-batch architecture against regression to per-loop enrichment."
    - "Existing npcs-step test cases for personality mapping (Phase 64) still pass unchanged — grep 'personality' in npcs-step.test.ts continues to return the same test names."
    - "npm --prefix backend test -- run npcs-step exits 0"
    - "npm --prefix backend run typecheck exits 0"
  artifacts:
    - path: backend/src/worldgen/scaffold-steps/npcs-step.ts
      provides: "Replaces the line-679 enrichment gate with a single enrichNpcsBatch call covering all 4 NPC quadrants."
      contains: "enrichNpcsBatch"
    - path: backend/src/worldgen/__tests__/npcs-step.test.ts
      provides: "Integration coverage for PowerStats enrichment across all 4 NPC quadrants plus fail-closed behavior on retry exhaustion plus once-per-batch invocation lock."
      contains: "powerStats"
  key_links:
    - from: backend/src/worldgen/scaffold-steps/npcs-step.ts
      to: backend/src/character/enrich-npc-batch.ts
      via: "Single enrichNpcsBatch call after detail loop replaces the per-loop gate."
      pattern: "enrichNpcsBatch"
    - from: backend/src/worldgen/__tests__/npcs-step.test.ts
      to: backend/src/character/enrich-npc-batch.ts
      via: "Integration mocks enrichKnownIpWorldgenNpcDraft + assessOriginalCharacterPowerStats via vi.mock; exercises the real enrichNpcsBatch + real assessPowerStats dispatcher."
      pattern: "enrichKnownIpWorldgenNpcDraft|assessOriginalCharacterPowerStats"
---

<objective>
Close the primary Phase 65 bug: `npcs-step.ts:679` gates power-stats enrichment on `ipContext && tier === "key"`, leaving known-IP supporting NPCs and all original-world NPCs without `draft.powerStats`. This plan replaces the gate with a single `enrichNpcsBatch` call (from Plan 01) that covers every NPC in every quadrant.

**Architectural clarification (per Phase 65 cross-AI review — Codex MEDIUM):** The rationale is NOT that batching mirrors the existing detail-pass pattern. The current detail pass in `npcs-step.ts` is SEQUENTIAL (per-NPC `await` inside the for loop). Post-loop bounded-parallel batching is NEW behavior introduced specifically for enrichment, delivered by Plan 01's `enrichNpcsBatch`. This plan installs the new behavior at the call site. The enrichment must run ONCE after the loop (not per-NPC) — Test B includes an explicit invocation-count assertion to lock that architecture.

Purpose: Initial worldgen scaffold generation must emit `draft.powerStats` for all 4 NPC quadrants. This is one of two code sites carrying the bug — the other is the `/regenerate-section` handler, addressed in Plan 03.

Output:
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` rewired to call `enrichNpcsBatch` once after the detail loop; per-loop inline enrichment block removed.
- `backend/src/worldgen/__tests__/npcs-step.test.ts` gains 3 new integration test cases (both tiers known-IP with once-per-batch assertion, both tiers original, fail-closed on retry exhaustion with concurrency=1 for speed). Existing Phase 64 personality tests remain unchanged.
- Fail-closed contract preserved end-to-end: any single-NPC retry exhaustion aborts the entire step.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-REVIEWS.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-01-enrich-npcs-batch-helper-PLAN.md
@.planning/phases/64-npc-personality-regeneration-parity/64-02-worldgen-npcs-step-fix-PLAN.md
@CLAUDE.md
@backend/src/worldgen/scaffold-steps/npcs-step.ts
@backend/src/worldgen/__tests__/npcs-step.test.ts
@backend/src/character/enrich-npc-batch.ts
@backend/src/character/ingestion/power-assessor.ts
@backend/src/character/known-ip-worldgen-research.ts
@backend/src/character/ingestion/assess-original.ts
@backend/src/character/ingestion/errors.ts

<interfaces>
<!-- Bug site (current behavior at npcs-step.ts:679-689): -->
```ts
if (ipContext && tier === "key") {
  // Phase 64 parity fix: known-IP enrichment writes power stats only.
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

<!-- Desired shape: the loop builds drafts without enriching. After the loop, a single enrichNpcsBatch runs. The batching is NEW — the existing detail loop is sequential, not chunked; post-loop bounded-parallel batching is introduced here. -->

<!-- enrichNpcsBatch signature (from Plan 01 after revision — delegates to assessPowerStats dispatcher): -->
```ts
export async function enrichNpcsBatch(opts: {
  items: Array<{ draft: CharacterDraft; tier: "key" | "supporting" }>;
  buildClassification: (item) => IngestionClassification;
  ctx: IngestionContext;
  buildSources?: (item) => IngestionSources;
  researchDigest?: string | null;
  concurrency?: number;
}): Promise<CharacterDraft[]>;
```

<!-- npcs-step caller responsibilities:
    - Synthesize IngestionClassification per NPC:
        ipContext non-null → canonicalStatus='known_ip_canonical' (or 'known_ip_diverged' if req.premiseDivergence is set)
        ipContext null → canonicalStatus='original'
    - Supply ctx with { campaign: { premise: refinedPremise }, settings: req.settings, gen: req.role, ... }
    - No per-NPC sources override in the initial worldgen path (buildSources omitted → helper uses empty sources default)
-->

<!-- Current result push shape at npcs-step.ts:691-700: -->
```ts
result.push({
  ...legacyNpc,
  draft: {
    ...draft,
    provenance: {
      ...draft.provenance,
      worldgenOrigin: planEntry?.role ?? null,
    },
  },
});
```

<!-- `tier` variable in scope of the loop: "key" | "supporting" — carries the worldgen-layer label. -->

<!-- `req` has: role (ResolvedRole), research (ResearchConfig | undefined), premiseDivergence, settings. Confirmed by reading the full file. -->
</interfaces>

<project_conventions>
- Preserve all Phase 64 personality mapping logic (line 653-668) untouched.
- Preserve the provenance worldgenOrigin tagging block untouched.
- `ScaffoldNpc.tier` is the worldgen-layer label ("key" | "supporting"), distinct from `CharacterRecord.identity.tier` — do NOT conflate.
- Classification synthesis: npcs-step owns the (ipContext, tier) → canonicalStatus mapping. If `req.premiseDivergence` is set on a known-IP run, prefer `canonicalStatus='known_ip_diverged'`; otherwise `'known_ip_canonical'`.
- Fail-closed: throw upward. The existing outer try/catch in routes/worldgen.ts handles the error surface.
- Integration test style: mock the innermost seams (`safeGenerateObject` + the two assessment functions) via `vi.mock` at the top of the test file; run the real `generateNpcsStep` (and the real `enrichNpcsBatch` + real `assessPowerStats`) via direct import.
</project_conventions>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add 3 failing integration tests to npcs-step.test.ts (RED)</name>
  <files>backend/src/worldgen/__tests__/npcs-step.test.ts</files>
  <read_first>
    - backend/src/worldgen/__tests__/npcs-step.test.ts (full — understand existing vi.mock blocks at the top, existing personality test structure, test fixtures, and how `safeGenerateObject` is mocked for plan/detail calls)
    - backend/src/worldgen/scaffold-steps/npcs-step.ts (full — understand generateNpcsStep signature, the two-pass plan+detail structure, and req shape)
    - backend/src/character/__tests__/enrich-npc-batch.test.ts (Plan 01 test — mirror the fixture builder patterns)
    - backend/src/character/enrich-npc-batch.ts (Plan 01 implementation — delegates to assessPowerStats, no internal retry wrapper)
    - backend/src/character/ingestion/power-assessor.ts (the real dispatcher exercised by the integration test)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md (D-01..D-05)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-REVIEWS.md (Codex MEDIUM batching rationale; Codex LOW fast fail-closed test)
  </read_first>
  <behavior>
    Add three new integration test cases to the existing `npcs-step.test.ts` describe block (or a new describe block within the same file). All three test the REAL `generateNpcsStep` against mocked leaf seams (`safeGenerateObject` + the two leaf assessment functions). The REAL `enrichNpcsBatch` + REAL `assessPowerStats` dispatcher run in the middle.

    **Test A — known-IP both-tiers enrichment:**
    - `vi.mock("../../character/known-ip-worldgen-research.js")` so `enrichKnownIpWorldgenNpcDraft` returns the input draft with a stub `powerStats` attached.
    - `vi.mock("../../character/ingestion/assess-original.js")` NOT expected to fire in this test (known-IP route).
    - Mock `safeGenerateObject` plan call returns 1 key NPC + 1 supporting NPC; detail calls return populated personality packs for both.
    - Run `generateNpcsStep` with `ipContext: { franchise: "TestFranchise", ... }`.
    - Assert: returned `ScaffoldNpc[]` has length 2; BOTH entries have `draft.powerStats` non-null; `enrichKnownIpWorldgenNpcDraft` was called 2 times (once per NPC); `assessOriginalCharacterPowerStats` was called 0 times.

    **Test B — original-world both-tiers enrichment + once-per-batch invocation assertion:**
    - Mock `assessOriginalCharacterPowerStats` to return input draft + stub `powerStats`.
    - `enrichKnownIpWorldgenNpcDraft` NOT expected to fire.
    - Same plan/detail mock pattern.
    - Run `generateNpcsStep` with `ipContext: null`.
    - Assert: both returned NPCs have `draft.powerStats` non-null; `assessOriginalCharacterPowerStats` called 2 times; `enrichKnownIpWorldgenNpcDraft` called 0 times.
    - **Once-per-batch assertion (Codex LOW):** Add a spy on `enrichNpcsBatch` (via `vi.spyOn` after importing from the real module, OR count batches indirectly via a one-shot module-level counter inside a test-only wrapper). Assert enrichment was invoked exactly ONCE (not per NPC). This locks the post-loop-batch architecture against regression to per-loop enrichment.

    **Test C — fail-closed on supporting-tier enrichment failure (with concurrency=1 for fast deterministic runtime):**
    - Mock `enrichKnownIpWorldgenNpcDraft` to reject with `new Error("canon lookup failed")`.
    - Plan call returns 1 supporting NPC (this is the regression case — old gate skipped supporting, new code must enrich them and therefore must fail when their enrichment fails).
    - Run `generateNpcsStep` with `ipContext: { franchise: "TestFranchise", ... }`.
    - Assert: the call rejects. The error should carry the `IngestionPipelineError` surface from the underlying retry exhaustion (note: canon branch has no internal retry in current codebase, so the thrown error may be the underlying `Error("canon lookup failed")` rather than an `IngestionPipelineError`; assert on whichever the dispatcher emits — read `power-assessor.ts` lines 55-80 for the exact throw surface). If original-branch variant is needed instead for a guaranteed `IngestionPipelineError` with `stage="power_assess"`, add a parallel Test C' using `assessOriginalCharacterPowerStats` rejecting.
    - To keep runtime fast: if npcs-step exposes a way to pass a `concurrency` override down to `enrichNpcsBatch` (via req options or a test hook), use `concurrency: 1`. Otherwise rely on the 1-NPC batch size which is already serial.
    - Assert: no `ScaffoldNpc[]` is returned.
  </behavior>
  <action>
**Step A — inspect existing vi.mock blocks:**

Read the top of `backend/src/worldgen/__tests__/npcs-step.test.ts`. Confirm:
- `vi.mock("../../ai/generate-object-safe.js", ...)` exists (or similar) — this is the LLM seam.
- Existing fixtures for `req`, `refinedPremise`, `locationNames`, `factionNames`.
- Confirm no prior `vi.mock` on `known-ip-worldgen-research.js` or `assess-original.js`.

**Step B — add new mocks at the top of the file (if not already present):**

```ts
vi.mock("../../character/known-ip-worldgen-research.js", () => ({
  enrichKnownIpWorldgenNpcDraft: vi.fn(),
  // Re-export any schemas/helpers imported from this module by assess-original.ts.
  // Read assess-original.ts imports (lines 4-13) to enumerate:
  loosePowerStatsSchema: {},
  normalizeLlmPowerStats: vi.fn(),
  repairPowerStats: vi.fn(),
  AP_DUR_TIER_LIST: "",
  SPEED_TIER_LIST: "",
  INTELLIGENCE_TIER_LIST: "",
  describeZodIssues: vi.fn(),
  recordFromUnknown: vi.fn(),
}));
vi.mock("../../character/ingestion/assess-original.js", () => ({
  assessOriginalCharacterPowerStats: vi.fn(),
}));
```

(Note: the known-ip-worldgen-research module re-exports schemas consumed by assess-original. Vitest's vi.mock replaces the whole module, so the mock factory must re-export the shape. Read the actual imports before finalizing the mock object.)

Also import at the top:
```ts
import { enrichKnownIpWorldgenNpcDraft } from "../../character/known-ip-worldgen-research.js";
import { assessOriginalCharacterPowerStats } from "../../character/ingestion/assess-original.js";
import { IngestionPipelineError } from "../../character/ingestion/errors.js";
```

**Step C — append a new describe block:**

```ts
describe("generateNpcsStep — Phase 65 PowerStats enrichment across all quadrants", () => {
  beforeEach(() => {
    vi.mocked(enrichKnownIpWorldgenNpcDraft).mockReset();
    vi.mocked(assessOriginalCharacterPowerStats).mockReset();
    // Reset safeGenerateObject mock to a clean state; the file's existing mock factory applies here
  });

  const stubPowerStats = () => ({
    attackPotency: { tier: "Human", rank: 5 },
    speed: { tier: "Normal Human", rank: 5 },
    durability: { tier: "Human", rank: 5 },
    intelligence: { tier: "Average", rank: 5 },
    hax: [],
    vulnerabilities: [],
  });

  const fullDetail = (name: string) => ({
    persona: `${name} is a stoic guard.`,
    tags: ["Stoic"],
    goals: { shortTerm: ["Hold the gate"], longTerm: ["Retire with honor"] },
    selfImage: "The last one standing.",
    socialRoles: ["Gate Warden"],
    personalitySummary: `${name} summary`,
    personalityVoice: `${name} voice`,
    personalityDecisionStyle: "Deliberate",
    personalityWorldview: "Order over chaos",
    personalityContradictions: ["Loyalty vs resentment"],
    personalityMythology: "The last post-keeper",
    personalitySampleLines: ["Stand down.", "I will not ask again."],
  });

  it("enriches PowerStats on BOTH tiers in a known-IP world (D-01)", async () => {
    vi.mocked(enrichKnownIpWorldgenNpcDraft).mockImplementation(async ({ draft }) => ({
      ...draft,
      powerStats: stubPowerStats(),
    }));

    // Sequence safeGenerateObject to return 1 key NPC, 1 supporting NPC, then 2 details.
    // Match the existing personality test's sequencing pattern (.mockResolvedValueOnce chain).

    const result = await generateNpcsStep(
      reqWithIpContext,
      "refined premise text",
      ["Castle"],
      [],
      { franchise: "TestFranchise", keyFacts: [], rawSearchDigest: "" } as unknown as IpResearchContext,
      undefined,
    );

    expect(result).toHaveLength(2);
    for (const npc of result) {
      expect(npc.draft).toBeDefined();
      expect(npc.draft!.powerStats).not.toBeNull();
      expect(npc.draft!.powerStats).toBeDefined();
    }
    expect(vi.mocked(enrichKnownIpWorldgenNpcDraft)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(assessOriginalCharacterPowerStats)).not.toHaveBeenCalled();
  });

  it("enriches PowerStats on BOTH tiers in an original world + enrichment runs exactly once per step (D-02)", async () => {
    vi.mocked(assessOriginalCharacterPowerStats).mockImplementation(async ({ draft }) => ({
      ...draft,
      powerStats: stubPowerStats(),
    }));

    // Spy on enrichNpcsBatch to count step-level invocations.
    // Import the module under test and spy:
    const enrichModule = await import("../../character/enrich-npc-batch.js");
    const enrichSpy = vi.spyOn(enrichModule, "enrichNpcsBatch");

    // Plan+detail mock sequence (2 NPCs).

    const result = await generateNpcsStep(
      reqOriginal,
      "refined premise text",
      ["Village"],
      [],
      null,
      undefined,
    );

    expect(result).toHaveLength(2);
    for (const npc of result) {
      expect(npc.draft!.powerStats).toBeDefined();
    }
    expect(vi.mocked(assessOriginalCharacterPowerStats)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(enrichKnownIpWorldgenNpcDraft)).not.toHaveBeenCalled();

    // Once-per-batch architecture lock (Codex LOW)
    expect(enrichSpy).toHaveBeenCalledTimes(1);
    enrichSpy.mockRestore();
  });

  it("throws when enrichment fails for a supporting-tier NPC (D-04)", async () => {
    // Use the original branch for a guaranteed IngestionPipelineError (stage=power_assess)
    // emitted by the internal withPipelineRetry inside assessOriginalCharacterPowerStats.
    // Using original branch also avoids depending on the canon branch's retry policy
    // (out of Phase 65 scope).
    vi.mocked(assessOriginalCharacterPowerStats).mockRejectedValue(new Error("assessment failed"));

    // Plan returns 1 supporting NPC only; detail returns its pack.

    await expect(
      generateNpcsStep(
        reqOriginal,
        "refined premise text",
        ["Village"],
        [],
        null,
        undefined,
      ),
    ).rejects.toMatchObject({
      name: "IngestionPipelineError",
      stage: "power_assess",
      attempts: 3,
    });
  }, 15000);
});
```

**IMPORTANT — mock sequence for `safeGenerateObject`:** the existing test file sets up `safeGenerateObject` as a `vi.fn()`. Match the existing pattern for sequencing `.mockResolvedValueOnce(...)` for plan(key), plan(supporting), detail(NPC1), detail(NPC2). If the existing test uses a helper (e.g. `mockNpcPlanAndDetail(...)`), reuse it.

**Step D — run the tests and verify explicit RED state:**

The verify command below captures the test runner output and checks:
1. A FAIL line specifically anchored to the `npcs-step` test file (avoids false-pass when a passing test happens to contain the word "powerStats").
2. The summary reports `3 failed` (exactly our 3 new tests).
3. Exit code is non-zero.

```
OUT=$(npm --prefix backend test -- run npcs-step 2>&1)
echo "$OUT" | grep -E "3 failed" && echo "$OUT" | grep -E "FAIL.*npcs-step" || exit 1
```

The 3 new tests MUST fail because `npcs-step.ts` still has the old gate at line 679. Specifically:
- Test A: supporting-tier NPCs have no `draft.powerStats` → fails `expect(powerStats).toBeDefined`
- Test B: original-world NPCs have no `draft.powerStats` (no enrichment branch exists) → fails; enrichSpy never invoked
- Test C: no retry happens because supporting-tier never enters the enrichment branch → fails

Existing Phase 64 tests MUST continue to pass unchanged.
  </action>
  <verify>
    <automated>OUT=$(npm --prefix backend test -- run npcs-step 2>&1); echo "$OUT" | grep -E "3 failed" && echo "$OUT" | grep -E "FAIL.*npcs-step" || exit 1</automated>
  </verify>
  <acceptance_criteria>
    - File modified: `backend/src/worldgen/__tests__/npcs-step.test.ts`
    - 3 new `it(...)` blocks present: `grep -c "PowerStats enrichment\\|enriches PowerStats on BOTH tiers\\|enrichment runs exactly once\\|throws when enrichment fails" backend/src/worldgen/__tests__/npcs-step.test.ts` returns >= 3
    - Top-level mocks added: `grep -c "vi.mock.*known-ip-worldgen-research\\|vi.mock.*assess-original" backend/src/worldgen/__tests__/npcs-step.test.ts` returns >= 2
    - **Once-per-batch architecture lock (Codex LOW):** `grep -c "enrichSpy\\|enrichNpcsBatch.*toHaveBeenCalledTimes(1)" backend/src/worldgen/__tests__/npcs-step.test.ts` returns >= 1
    - Running tests shows 3 new FAILING cases AND all existing Phase 64 personality tests still PASSING — verify command anchors FAIL to the `npcs-step` file and checks summary reports `3 failed`; verify exit code is non-zero
    - `grep -c "personality" backend/src/worldgen/__tests__/npcs-step.test.ts` count has NOT decreased vs pre-task baseline (Phase 64 coverage preserved)
    - No changes to `backend/src/worldgen/scaffold-steps/npcs-step.ts` yet — `git diff backend/src/worldgen/scaffold-steps/npcs-step.ts` is empty
  </acceptance_criteria>
  <done>Three new RED integration tests added (including once-per-batch lock); existing tests green; npcs-step.ts untouched — Task 2 implements the fix.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Replace per-loop enrichment gate with post-loop enrichNpcsBatch call (GREEN)</name>
  <files>backend/src/worldgen/scaffold-steps/npcs-step.ts</files>
  <read_first>
    - backend/src/worldgen/scaffold-steps/npcs-step.ts (full — specifically lines 600-710; know exactly what to remove and where to insert the batch call)
    - backend/src/character/enrich-npc-batch.ts (Plan 01 — signature: items + buildClassification + ctx + optional buildSources/researchDigest/concurrency)
    - backend/src/character/ingestion/power-assessor.ts (dispatcher — what classification canonicalStatus values route where)
    - backend/src/character/ingestion/types.ts (IngestionContext + IngestionClassification + IngestionSources shape)
    - backend/src/worldgen/__tests__/npcs-step.test.ts (Task 1 — the tests that must go GREEN after this change)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md (D-04 fail-closed, D-05 bounded concurrency)
    - backend/src/character/ingestion/errors.ts (IngestionPipelineError shape — for the throw surface)
  </read_first>
  <behavior>
    Inside `generateNpcsStep`, remove the per-loop inline enrichment block (lines 679-689). Preserve the rest of the loop: personality mapping (lines 653-668), provenance tagging, `result.push(...)`. After the loop, call `enrichNpcsBatch` once with the full result's drafts, then write the enriched drafts back onto each `ScaffoldNpc`.

    The caller synthesizes `IngestionClassification` per NPC:
    - `ipContext` non-null AND `req.premiseDivergence` set → `canonicalStatus: "known_ip_diverged"`, `franchise: ipContext.franchise`, `premiseDivergence: req.premiseDivergence`
    - `ipContext` non-null AND no premise divergence → `canonicalStatus: "known_ip_canonical"`, `franchise: ipContext.franchise`, `premiseDivergence: null`
    - `ipContext` null → `canonicalStatus: "original"`, `franchise: null`, `premiseDivergence: null`

    The caller synthesizes `IngestionContext` from `req`:
    - `campaign: { premise: refinedPremise, ... }`
    - `settings: req.settings`
    - `gen: req.role`
    - (match the actual shape of IngestionContext from types.ts; fill any fields the dispatcher reads — specifically `ctx.settings.research?.enabled` is checked on the canon branch.)

    Personality mapper must still run BEFORE enrichment — personality is used by the assessment prompts (e.g. `draft.profile.personaSummary` feeds `assessOriginalCharacterPowerStats`'s prompt). Ordering invariant: personality first, then power-stats enrichment last.
  </behavior>
  <action>
**Step A — import enrichNpcsBatch at the top of npcs-step.ts:**

Add to the existing import block at the top of the file:

```ts
import { enrichNpcsBatch } from "../../character/enrich-npc-batch.js";
import type { IngestionClassification, IngestionContext } from "../../character/ingestion/types.js";
```

**Step B — remove the per-loop inline enrichment block:**

At `backend/src/worldgen/scaffold-steps/npcs-step.ts:679-689`, DELETE the entire block:

```ts
if (ipContext && tier === "key") {
  // Phase 64 parity fix: known-IP enrichment writes power stats only.
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

Do NOT remove the `import { enrichKnownIpWorldgenNpcDraft } ...` line yet — confirm no remaining references first. After removal, if `enrichKnownIpWorldgenNpcDraft` is no longer referenced anywhere in the file, the import can be deleted too (run `grep -c enrichKnownIpWorldgenNpcDraft backend/src/worldgen/scaffold-steps/npcs-step.ts` after removing the block; if 0, remove the import; if >0, keep it).

**Step C — add the post-loop enrichNpcsBatch call:**

After the detail loop completes (i.e. after the for-loop that pushes `result` entries, line 700 area), but BEFORE the `return result;` statement, insert:

```ts
  // Phase 65: enrich PowerStats for every NPC in every quadrant — known-IP
  // key, known-IP supporting, original key, original supporting. Single
  // bounded-parallel batch call (NEW post-loop behavior, not a continuation
  // of the detail pass's sequential loop). Fail-closed per D-04: any NPC
  // enrichment that exhausts the dispatcher's internal retry aborts the
  // entire step.
  if (result.length > 0) {
    const enrichmentItems = result.map((npc) => ({
      draft: npc.draft!,
      tier: (npc.tier ?? "key") as "key" | "supporting",
    }));

    const ctx: IngestionContext = {
      // Match the shape defined in backend/src/character/ingestion/types.ts.
      // Fill with fields the dispatcher reads (campaign.premise, settings.research, gen, ...).
      campaign: { premise: refinedPremise },
      settings: req.settings,
      gen: req.role,
    } as IngestionContext;

    const buildClassification = (): IngestionClassification => {
      if (ipContext) {
        return {
          canonicalStatus: req.premiseDivergence ? "known_ip_diverged" : "known_ip_canonical",
          franchise: ipContext.franchise,
          premiseDivergence: req.premiseDivergence ?? null,
        } as IngestionClassification;
      }
      return {
        canonicalStatus: "original",
        franchise: null,
        premiseDivergence: null,
      } as IngestionClassification;
    };

    const enrichedDrafts = await enrichNpcsBatch({
      items: enrichmentItems,
      buildClassification,
      ctx,
    });
    for (let i = 0; i < result.length; i++) {
      result[i] = {
        ...result[i],
        draft: enrichedDrafts[i],
      };
    }
  }

  // If additionalInstruction provided, it was already considered in the prompts
  // (unused in current flow but kept for signature compatibility)
  void additionalInstruction;

  return result;
}
```

**NOTE — tier field source:** confirm how `tier` is set on each `ScaffoldNpc` pushed to `result`. In the existing detail loop there is a `const tier = ...` local that originates from the plan entry (`planEntry.tier` or similar). That `tier` string is already attached to `legacyNpc` before it is spread into the result push. Verify by reading the file; if the tier is not actually set on the pushed object, adjust the enrichment item construction to capture `tier` alongside `draft` during the loop (e.g. maintain a parallel `tiers: ("key" | "supporting")[]` array and use it when building enrichment items).

**NOTE — IngestionContext fields:** read `backend/src/character/ingestion/types.ts` for the exact shape. The dispatcher reads `ctx.settings.research?.enabled` (power-assessor.ts:64), `ctx.gen` (passed as `role` to the leaf assessors), and `ctx.campaign.premise` (passed as `premise`). Fill those at minimum. Other fields can be cast or stubbed with `as unknown as IngestionContext` if they are not read by the dispatcher.

**Step D — run the tests:**

```
npm --prefix backend test -- run npcs-step
npm --prefix backend run typecheck
```

All 3 new integration tests must go GREEN (including Test B's once-per-batch assertion). All existing Phase 64 personality tests must remain GREEN. Typecheck must exit 0.

**Step E — scope check:**

```
git diff backend/src/worldgen/scaffold-steps/npcs-step.ts
```

The diff should show:
1. Two new import lines (`enrichNpcsBatch` + type imports).
2. Removal of lines 679-689 (the old gate).
3. Addition of the post-loop enrichment block.
4. Optional removal of the `enrichKnownIpWorldgenNpcDraft` import if no longer referenced.

NO changes to: personality mapping block (653-668), provenance tagging, plan-pass LLM call, detail-pass LLM call, sample-lines retry logic. `grep -c "mapFlatPersonalityToNested\\|personalityFieldSchema\\|shouldRetrySampleLines" backend/src/worldgen/scaffold-steps/npcs-step.ts` must match pre-change count.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run npcs-step && npm --prefix backend run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "if (ipContext && tier === \"key\")" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns 0 matches (old gate removed)
    - `grep -c "enrichNpcsBatch" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns >= 2 (1 import + 1 call)
    - `grep -c "buildClassification" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns >= 1 (per-NPC classification synthesis at the caller)
    - `grep -c "canonicalStatus" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns >= 1 (classification synthesis)
    - `grep -c "mapFlatPersonalityToNested" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns >= 1 (Phase 64 personality mapping preserved)
    - `grep -c "shouldRetrySampleLines" backend/src/worldgen/scaffold-steps/npcs-step.ts` count unchanged vs pre-task (Phase 64 retry preserved)
    - `npm --prefix backend test -- run npcs-step` exits 0 with the 3 new Phase 65 tests GREEN (including once-per-batch assertion) AND all existing Phase 64 tests GREEN
    - `npm --prefix backend run typecheck` exits 0
    - No new "Human default" branch: `grep -ic "human default\\|default powerstats\\|fallback stats" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns 0
    - No changes to `backend/src/routes/worldgen.ts` — migration of regenerate-section is Plan 03
    - No changes to `backend/src/worldgen/scaffold-saver.ts` — D-07 zero-code-change gate
    - No changes to `backend/src/character/ingestion/power-assessor.ts` — dispatcher reused as-is
  </acceptance_criteria>
  <done>Line-679 gate replaced; all 4 NPC quadrants enriched via shared dispatcher; all 3 new tests GREEN including once-per-batch lock; Phase 64 personality coverage preserved; fail-closed retry propagation verified.</done>
</task>

</tasks>

<verification>
- `npm --prefix backend test -- run npcs-step` exits 0 — 3 new tests GREEN (including once-per-batch assertion) plus all existing Phase 64 personality tests unchanged.
- `npm --prefix backend run typecheck` exits 0.
- `git diff backend/src/worldgen/scaffold-steps/npcs-step.ts` shows the gate removed and the post-loop batch call added with per-NPC classification synthesis; personality mapping + provenance tagging untouched.
- `git diff backend/src/worldgen/scaffold-saver.ts` is empty (D-07 gate).
- `git diff backend/src/routes/worldgen.ts` is empty (Plan 03 scope).
- `git diff backend/src/character/ingestion/power-assessor.ts` is empty (existing dispatcher reused).
</verification>

<success_criteria>
- Initial worldgen scaffold generation emits `draft.powerStats` for every NPC regardless of (ipContext, tier) quadrant — via the shared `assessPowerStats` dispatcher.
- Enrichment runs ONCE per step (post-loop batch architecture, new behavior — not a continuation of the sequential detail pass). Once-per-batch lock asserted in Test B.
- Fail-closed behavior: any single-NPC retry exhaustion aborts the step with `IngestionPipelineError` stage="power_assess".
- No regression on Phase 64 personality schema + sample-lines retry behavior.
</success_criteria>

<requirement_coverage>
- **P65-R1** (all 4 quadrants enriched at worldgen initial): `enrichNpcsBatch` called once post-loop; caller synthesizes per-NPC classification covering known-IP key + supporting + original key + supporting. Proven by integration tests A and B.
- **P65-R3** (fail-closed retry — layer 2 of 3): integration test C proves `generateNpcsStep` propagates `IngestionPipelineError` stage="power_assess" when any NPC's retry (internal to `assessOriginalCharacterPowerStats`) exhausts; the step aborts and no partial scaffold is returned. Layer 1 is the unit-level proof in Plan 01; Layer 3 is the HTTP-boundary proof in Plan 03.
</requirement_coverage>

<estimates>
- Effort: ~45-60 min Claude execution (3 integration tests with mock sequencing + once-per-batch spy + targeted npcs-step.ts edit).
- Test runtime: < 15s for npcs-step.test.ts after additions (Test C runs real withPipelineRetry with backoff ≈ 1.5s).
- Wave 2: depends on Plan 01.
</estimates>

<risks>
- **R1 — safeGenerateObject mock sequencing.** The existing npcs-step test file has specific `.mockResolvedValueOnce(...)` ordering. Adding 3 new tests requires matching that sequence precisely (plan(key), plan(supporting), detail 1, detail 2, ...). Mitigation: read the existing Phase 64 personality test's mock setup verbatim and mirror its pattern.
- **R2 — `tier` accessibility on ScaffoldNpc.** The loop constructs `legacyNpc` with a `tier` field but may not preserve it on the pushed object spread. Mitigation: Task 2 Step C explicitly directs reading the file to confirm; fallback is a parallel `tiers[]` array captured during the loop.
- **R3 — `enrichKnownIpWorldgenNpcDraft` import removal.** If another branch in the file still references it, leaving the import in is fine. Acceptance criterion only requires the gate line is gone, not the import.
- **R4 — IngestionContext shape drift.** If `types.ts` defines IngestionContext with more required fields than the dispatcher actually reads, TypeScript strict will complain. Mitigation: use `as IngestionContext` cast in the caller if the dispatcher's real usage is narrow (`ctx.settings.research?.enabled`, `ctx.gen`, `ctx.campaign.premise`). Validate by reading types.ts + power-assessor.ts usage at the start of Task 2.
- **R5 — known-ip-worldgen-research mock re-exports.** The module exports `loosePowerStatsSchema`, `normalizeLlmPowerStats`, etc. consumed by `assess-original.ts`. Vitest's vi.mock replaces the whole module; the mock factory must re-export these symbols (even as empty stubs) or `assess-original.ts` will fail to load. Mitigation: Task 1 Step B lists the re-exports explicitly.
- **R6 — Concurrency vs retry timing in Test C.** `withPipelineRetry` has 500ms + 1s backoff between 3 attempts → ≈ 1.5s total for a 1-NPC batch. 15-second timeout is generous.
</risks>

<output>
After completion, create `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-02-SUMMARY.md` with:
- Task breakdown (test additions + npcs-step.ts edit)
- Test output — 3 new Phase 65 tests green including once-per-batch assertion; Phase 64 tests unchanged
- Typecheck output
- Diff summary showing exactly what lines changed in npcs-step.ts
- Confirmation that saver, routes/worldgen.ts, and power-assessor.ts are untouched (Plan 03 scope + dispatcher reuse)
</output>
