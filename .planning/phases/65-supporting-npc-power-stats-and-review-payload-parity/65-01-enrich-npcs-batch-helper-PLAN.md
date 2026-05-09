---
phase: 65-supporting-npc-power-stats-and-review-payload-parity
plan: 01
slug: enrich-npcs-batch-helper
type: execute
wave: 1
status: draft
depends_on: []
files_modified:
  - backend/src/character/enrich-npc-batch.ts
  - backend/src/character/__tests__/enrich-npc-batch.test.ts
autonomous: true
requirements: [P65-R1, P65-R2, P65-R3, P65-R4]
must_haves:
  truths:
    - "backend/src/character/enrich-npc-batch.ts exists and exports async function enrichNpcsBatch that takes a batch of drafts plus a per-NPC IngestionClassification builder, delegates each NPC to the EXISTING assessPowerStats dispatcher at backend/src/character/ingestion/power-assessor.ts:38, bounds concurrency, and returns drafts all carrying non-null draft.powerStats."
    - "Retry ownership lives at the SINGLE existing layer. enrich-npc-batch.ts does NOT wrap per-NPC calls in withPipelineRetry. The original branch already retries internally (backend/src/character/ingestion/assess-original.ts:86 wraps generation in withPipelineRetry('power_assess', ...)); the canon branch's retry is out of Phase 65 scope. Adding an outer withPipelineRetry here would double-wrap the original branch and inflate attempt counts (3 × 3 = 9 attempts instead of 3). Absence of outer retry is proven by a grep-zero acceptance criterion AND by a unit test asserting that original-world retry exhaustion hits EXACTLY the inner attempt count (3), not the squared count (9)."
    - "Routing is delegated to the existing assessPowerStats dispatcher (power-assessor.ts:38), which routes by classification.canonicalStatus: known_ip_canonical | known_ip_diverged → enrichKnownIpWorldgenNpcDraft; original | imported → assessOriginalCharacterPowerStats. enrichNpcsBatch's job is purely: build per-NPC classification + dispatch + bounded concurrency + fail-closed propagation."
    - "Caller synthesizes IngestionClassification per NPC: ipContext non-null → canonicalStatus='known_ip_canonical' (or 'known_ip_diverged' if the worldgen layer already flagged premise divergence), franchise=ipContext.franchise, premiseDivergence from the caller. ipContext null → canonicalStatus='original', franchise=null. The helper exposes a buildClassification callback so the caller owns the (ipContext, tier) → classification synthesis."
    - "Fail-closed: when assessPowerStats throws (which it does as IngestionPipelineError when a canon/original retry exhausts OR as plain Error for validation violations), enrichNpcsBatch propagates the original thrown error unchanged — no wrap, no swallow, no partial results returned."
    - "Bounded parallel execution: NPCs are processed in groups of at most N concurrent promises where N = opts.concurrency ?? 4. Within a chunk, all promises run via Promise.all; chunks run sequentially. Concurrency is exposed as an optional parameter so downstream fail-closed tests (Plan 02) can set concurrency=1 for deterministic, fast runs."
    - "No Human-default shortcut. Every NPC hits an actual assessPowerStats call. No code path returns an unenriched draft."
    - "Shared helper is consumed by both worldgen/scaffold-steps/npcs-step.ts (Plan 02) and routes/worldgen.ts regenerate-section handler (Plan 03) — Plan 01 only lands the module + tests; migration to call-sites is Plan 02 and Plan 03."
    - "Unit tests: assert routing via assessPowerStats mock receiving classifications with correct canonicalStatus for each (ipContext, tier) quadrant; assert NO outer withPipelineRetry in helper source (grep-zero); assert original-branch retry-exhaustion hits exactly 3 attempts (not 9); assert fail-closed throw propagates the original IngestionPipelineError; assert bounded concurrency chunk size <= 4."
    - "npm --prefix backend test -- run enrich-npc-batch exits 0."
  artifacts:
    - path: backend/src/character/enrich-npc-batch.ts
      provides: "Shared enrichNpcsBatch helper that delegates every NPC to the existing assessPowerStats dispatcher under bounded parallelism. Retry ownership stays at existing layers (internal to assess-original; canon branch retry out of Phase 65 scope)."
      min_lines: 50
      contains: "export async function enrichNpcsBatch"
    - path: backend/src/character/__tests__/enrich-npc-batch.test.ts
      provides: "Unit coverage for routing quadrants, anti-nested-retry (original branch exactly 3 attempts), fail-closed error propagation, and bounded concurrency."
      contains: "enrichNpcsBatch"
  key_links:
    - from: backend/src/character/enrich-npc-batch.ts
      to: backend/src/character/ingestion/power-assessor.ts
      via: "assessPowerStats({ draft, sources, classification, researchDigest, ctx }) called per NPC — reuses existing dispatcher at line 38, no duplicated routing rules"
      pattern: "assessPowerStats"
    - from: backend/src/character/enrich-npc-batch.ts
      to: backend/src/character/ingestion/types.ts
      via: "IngestionContext, IngestionClassification, IngestionSources type imports for the dispatcher signature"
      pattern: "IngestionClassification|IngestionContext|IngestionSources"
---

<objective>
Extract per-NPC power-stats enrichment dispatch + bounded concurrency + fail-closed propagation into a single reusable module that worldgen (`npcs-step.ts`) and the regenerate-section route handler will both consume. Single source of truth prevents drift — same pattern used by Phase 64's `personality-schema.ts` helper.

**Critical design point (per Phase 65 cross-AI review):** The helper does NOT duplicate the canon/original routing rules. The repo already has `assessPowerStats` at `backend/src/character/ingestion/power-assessor.ts:38` as the canonical dispatcher — it routes by `classification.canonicalStatus`. `enrichNpcsBatch` delegates to it.

**Retry ownership (per Phase 65 cross-AI review):** The original branch already retries internally at `backend/src/character/ingestion/assess-original.ts:86` (`await withPipelineRetry("power_assess", ...)`). Wrapping `assessPowerStats` (or its underlying callees) in an outer `withPipelineRetry` would produce nested retries — 9 total attempts on failure instead of 3 — and misleading failure semantics. This plan keeps retry at the existing single layer. The helper's responsibility is purely: dispatch + concurrency + propagate.

Purpose: Phase 65's core bug is that `npcs-step.ts:679` gates enrichment on `ipContext && tier === "key"`, leaving the other three NPC quadrants (known-IP supporting, original key, original supporting) without `draft.powerStats`. This plan lands the shared replacement helper with full unit coverage. Plans 02 and 03 migrate the two call-sites.

Output:
- `backend/src/character/enrich-npc-batch.ts` exporting `enrichNpcsBatch`
- `backend/src/character/__tests__/enrich-npc-batch.test.ts` locking routing (via assessPowerStats), anti-nested-retry, fail-closed propagation, and concurrency
- Zero changes to call-sites — Plan 02 (worldgen) and Plan 03 (regenerate) handle migration
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
@.planning/phases/64-npc-personality-regeneration-parity/64-01-personality-schema-foundation-PLAN.md
@.planning/phases/60-character-ingestion-backend-pipeline/60-03-PLAN.md
@CLAUDE.md
@backend/src/character/ingestion/power-assessor.ts
@backend/src/character/ingestion/types.ts
@backend/src/character/ingestion/assess-original.ts
@backend/src/character/ingestion/retry.ts
@backend/src/character/ingestion/errors.ts
@backend/src/character/known-ip-worldgen-research.ts
@backend/src/character/personality-schema.ts
@backend/src/worldgen/scaffold-steps/npcs-step.ts

<interfaces>
<!-- EXISTING assessPowerStats dispatcher (backend/src/character/ingestion/power-assessor.ts:38) — REUSE THIS, DO NOT DUPLICATE: -->
```ts
export async function assessPowerStats(opts: {
  draft: CharacterDraft;
  sources: IngestionSources;
  classification: IngestionClassification;
  researchDigest: string | null;
  ctx: IngestionContext;
}): Promise<CharacterDraft>;

// Routes by classification.canonicalStatus:
//   "known_ip_canonical" | "known_ip_diverged" → enrichKnownIpWorldgenNpcDraft
//   "original" | "imported"                    → assessOriginalCharacterPowerStats
// Canon branch requires classification.franchise AND ctx.settings.research?.enabled — else throws IngestionPipelineError(stage:'power_assess').
// Both branches guarantee a draft with non-null powerStats OR throw.
```

<!-- IngestionClassification shape (backend/src/character/ingestion/types.ts): -->
```ts
type IngestionClassification = {
  canonicalStatus: "known_ip_canonical" | "known_ip_diverged" | "original" | "imported";
  franchise: string | null;
  premiseDivergence?: PremiseDivergence | null;
  // ... other fields
};
```

<!-- assessOriginalCharacterPowerStats internal retry (backend/src/character/ingestion/assess-original.ts:86 — VERIFIED): -->
```ts
const powerStats: PowerStats = await withPipelineRetry("power_assess", async () => {
  // ... LLM call + validation
});
```
This internal retry is why enrichNpcsBatch MUST NOT wrap dispatch in another withPipelineRetry — it would nest.

<!-- enrichKnownIpWorldgenNpcDraft (backend/src/character/known-ip-worldgen-research.ts:270) — VERIFIED no internal retry. Canon-branch retry policy is out of Phase 65 scope. -->

<!-- IngestionPipelineError shape (backend/src/character/ingestion/errors.ts): -->
```ts
export class IngestionPipelineError extends Error {
  readonly stage: IngestionStage;
  readonly attempts: number;
  readonly cause: unknown;
}
```

<!-- ScaffoldNpc tier field (backend/src/worldgen/types.ts) — "key" | "supporting" at worldgen layer. The helper does NOT route by tier — routing is owned by assessPowerStats + classification.canonicalStatus. The caller synthesizes classification from (ipContext, tier). -->
</interfaces>

<project_conventions>
- TypeScript strict mode, ES modules, `.js` suffix on relative imports at compile-time.
- Vitest with inline `vi.mock` factories, imports at top of file.
- Fail-closed: rethrow original error unchanged; do NOT wrap or swallow.
- Do not introduce any new Human-default shortcut. D-03 explicitly forbids it.
- Do NOT add outer `withPipelineRetry` in this helper. Retry ownership stays at existing layers (currently: internal to `assessOriginalCharacterPowerStats`).
- Concurrency guard uses simple chunked Promise.all, matching the existing pattern in `npcs-step.ts` detail-pass batching.
- @worldforge/shared re-exports come from `shared/src/types.ts`; import types (`CharacterDraft`, `PremiseDivergence`) from the shared package, not re-declare.
- Reuse `IngestionClassification`, `IngestionContext`, `IngestionSources` from `backend/src/character/ingestion/types.ts`.
</project_conventions>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write enrich-npc-batch.test.ts with dispatcher-reuse / anti-nested-retry / concurrency cases (RED)</name>
  <files>backend/src/character/__tests__/enrich-npc-batch.test.ts</files>
  <read_first>
    - backend/src/character/ingestion/power-assessor.ts (assessPowerStats signature — lines 38-91)
    - backend/src/character/ingestion/types.ts (IngestionClassification, IngestionContext, IngestionSources)
    - backend/src/character/ingestion/assess-original.ts (lines 16, 86 — confirm the internal withPipelineRetry("power_assess", ...) wrap)
    - backend/src/character/ingestion/retry.ts (withPipelineRetry default attempts = 3)
    - backend/src/character/ingestion/errors.ts (IngestionPipelineError shape)
    - backend/src/character/__tests__/personality-schema.test.ts (structural reference for unit test layout)
    - shared/src/types.ts (CharacterDraft, PowerStats, PremiseDivergence)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md (D-01..D-05)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-REVIEWS.md (Codex HIGH-1: retry double-wrap; Codex MEDIUM: existing dispatcher reuse)
  </read_first>
  <behavior>
    The test file mocks `assessPowerStats` (from `../ingestion/power-assessor.js`) at the dispatcher level — this proves enrichNpcsBatch delegates to the existing dispatcher and does not re-implement routing.

    For the anti-nested-retry case (Test 6), the test mocks ONE LAYER DEEPER: it mocks `assessOriginalCharacterPowerStats` (the leaf LLM call target) and leaves the REAL `assessPowerStats` + the REAL inner `withPipelineRetry` chain running. This exercises the full retry pipeline end-to-end so a nested wrapper (if ever introduced) would be caught by the attempt count.

    Test cases:

    1. **Known-IP key tier → dispatcher receives canonicalStatus "known_ip_canonical".** Batch of 1 NPC, ipContext non-null, tier "key". Caller's buildClassification returns `{canonicalStatus: "known_ip_canonical", franchise, premiseDivergence: null, ...}`. Assert `assessPowerStats` called with a classification whose `canonicalStatus === "known_ip_canonical"` and `franchise === "TestFranchise"`.

    2. **Known-IP supporting tier → dispatcher receives canonicalStatus "known_ip_canonical" (D-01).** Same wiring as tier "key" when ipContext non-null. Assert same dispatch; proves supporting tier is NOT dropped.

    3. **Original-world key tier → dispatcher receives canonicalStatus "original" (D-02).** ipContext null; caller's buildClassification returns `{canonicalStatus: "original", franchise: null, ...}`. Assert dispatch.

    4. **Original-world supporting tier → dispatcher receives canonicalStatus "original" (D-02).** Same as key.

    5. **Mixed tiers fans out correctly.** Batch of 4 NPCs under shared ipContext — 2 key + 2 supporting. All 4 call `assessPowerStats` with `canonicalStatus === "known_ip_canonical"`. Renamed from "mixed batch" per Codex LOW: ipContext is batch-wide; only tiers are mixed.

    6. **Anti-nested-retry (Codex HIGH-1, original branch).** Import REAL `assessPowerStats` and the REAL retry chain; mock ONLY `assessOriginalCharacterPowerStats`'s innermost generateObject seam (or use the existing mocking pattern that makes `assessOriginalCharacterPowerStats` reject deterministically). Given a batch of 1 original-world NPC whose leaf assessment ALWAYS throws, enrichNpcsBatch must reject with `IngestionPipelineError{stage:"power_assess"}` AND the leaf mock must have been called EXACTLY 3 times — not 9 times. 9 calls would prove a nested withPipelineRetry double-wrap. Also assert `grep -c "withPipelineRetry" backend/src/character/enrich-npc-batch.ts === 0` as a static invariant (tested via a second simple assertion on a file read — OR deferred to acceptance_criteria grep check).

    7. **Fail-closed propagation.** Given an `assessPowerStats` mock that rejects with a specific `IngestionPipelineError{stage:"power_assess", attempts: 3, cause: someInner}`, enrichNpcsBatch rejects with the SAME error object — not a wrapped one. Assert by identity check: `expect(caught).toBe(thrown)` OR by spotting the `.stage`, `.attempts`, and original `.cause`. No partial results returned.

    8. **Bounded parallel concurrency (D-05).** Given a batch of 10 NPCs and an `assessPowerStats` mock that counts concurrent inflight calls, max observed concurrency <= 4. Mock captures `inflight` before awaiting a 10ms delay, decrements on resolve.

    9. **Concurrency override honored.** With `concurrency: 1`, a batch of 3 NPCs is processed strictly serially (max observed inflight === 1). Proves the optional param works so Plan 02 can set concurrency=1 for fast deterministic fail-closed tests.

    10. **Empty batch is a no-op.** `enrichNpcsBatch({ items: [], ... })` returns `[]` without calling `assessPowerStats`.
  </behavior>
  <action>
Create `backend/src/character/__tests__/enrich-npc-batch.test.ts`.

Key structural decisions:

**For Tests 1-5, 7-10** — mock `assessPowerStats` at the dispatcher level (`vi.mock("../ingestion/power-assessor.js", ...)`). This proves enrichNpcsBatch delegates correctly and does not duplicate routing.

**For Test 6 (anti-nested-retry)** — do NOT mock `assessPowerStats`. Instead mock the underlying `assessOriginalCharacterPowerStats`'s leaf (e.g. via `vi.mock("../ingestion/assess-original.js")` to return a function whose internal behavior throws but whose retry wrap is REAL). This requires careful separation: either split Test 6 into its own `describe` block with different mocks, OR import both REAL modules at test time. Use Vitest's `vi.hoisted` + per-test `vi.doMock` / `vi.resetModules` if isolation is needed. OR — simpler — in Test 6, have the `assessPowerStats` mock INVOKE the real `withPipelineRetry("power_assess", ...)` chain internally with an always-throwing leaf, so the retry count is measured on the leaf.

Recommended simplest pattern for Test 6:

```ts
// In Test 6, override assessPowerStats to spin up a real withPipelineRetry chain with a counter:
let leafCalls = 0;
vi.mocked(assessPowerStats).mockImplementation(async () => {
  // Simulate what assess-original does internally: real withPipelineRetry with a leaf that always throws
  return await withPipelineRetry("power_assess", async () => {
    leafCalls++;
    throw new Error("leaf failure");
  });
});

const items = [{ draft: makeDraft("Doomed"), tier: "supporting" as const }];
await expect(enrichNpcsBatch({
  items,
  buildClassification: () => ({ canonicalStatus: "original", franchise: null, premiseDivergence: null }),
  ctx: makeCtx(),
})).rejects.toMatchObject({ name: "IngestionPipelineError", stage: "power_assess", attempts: 3 });

expect(leafCalls).toBe(3);  // NOT 9 — proves no outer withPipelineRetry double-wrap in enrichNpcsBatch
```

(withPipelineRetry is imported from `../ingestion/retry.js` at test top — NOT mocked.)

**Fixtures:**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterDraft, PowerStats, PremiseDivergence } from "@worldforge/shared";
import type { IngestionContext, IngestionClassification } from "../ingestion/types.js";

vi.mock("../ingestion/power-assessor.js", () => ({
  assessPowerStats: vi.fn(),
}));

import { enrichNpcsBatch, type EnrichNpcsBatchItem } from "../enrich-npc-batch.js";
import { assessPowerStats } from "../ingestion/power-assessor.js";
import { withPipelineRetry } from "../ingestion/retry.js";
import { IngestionPipelineError } from "../ingestion/errors.js";

function makeDraft(name: string): CharacterDraft {
  // Minimal valid CharacterDraft. Copy shape from
  // frontend/components/world-review/__tests__/npcs-section.test.tsx `makeDraft`
  // (which already matches the current shared/src/types.ts shape) and cast via
  // `as unknown as CharacterDraft`. Tests only care about identity.displayName
  // and powerStats fields.
  return {
    identity: { displayName: name, tier: "persistent" } as unknown,
    // ... minimal other fields
    powerStats: null,
  } as unknown as CharacterDraft;
}

function makePowerStats(): PowerStats {
  return {
    attackPotency: { tier: "Human", rank: 5 },
    speed: { tier: "Normal Human", rank: 5 },
    durability: { tier: "Human", rank: 5 },
    intelligence: { tier: "Average", rank: 5 },
    hax: [],
    vulnerabilities: [],
  };
}

function makeCtx(): IngestionContext {
  // Minimal IngestionContext. For tests mocking assessPowerStats directly,
  // ctx fields are not read — pass {} as unknown as IngestionContext.
  return {} as unknown as IngestionContext;
}

function classificationKnownIp(): IngestionClassification {
  return { canonicalStatus: "known_ip_canonical", franchise: "TestFranchise", premiseDivergence: null } as unknown as IngestionClassification;
}
function classificationOriginal(): IngestionClassification {
  return { canonicalStatus: "original", franchise: null, premiseDivergence: null } as unknown as IngestionClassification;
}

beforeEach(() => {
  vi.mocked(assessPowerStats).mockReset();
});

describe("enrichNpcsBatch", () => {
  it("routes known-IP key tier to assessPowerStats with canonicalStatus='known_ip_canonical'", async () => {
    vi.mocked(assessPowerStats).mockImplementation(async ({ draft }) => ({ ...draft, powerStats: makePowerStats() }));
    const items: EnrichNpcsBatchItem[] = [{ draft: makeDraft("Guard"), tier: "key" }];

    const result = await enrichNpcsBatch({
      items,
      buildClassification: () => classificationKnownIp(),
      ctx: makeCtx(),
    });

    expect(assessPowerStats).toHaveBeenCalledTimes(1);
    const receivedClassification = vi.mocked(assessPowerStats).mock.calls[0]![0]!.classification;
    expect(receivedClassification.canonicalStatus).toBe("known_ip_canonical");
    expect(receivedClassification.franchise).toBe("TestFranchise");
    expect(result).toHaveLength(1);
    expect(result[0]!.powerStats).not.toBeNull();
  });

  it("routes known-IP supporting tier to assessPowerStats with canonicalStatus='known_ip_canonical' (D-01)", async () => { /* analogous */ });
  it("routes original-world key tier to assessPowerStats with canonicalStatus='original' (D-02)", async () => { /* analogous */ });
  it("routes original-world supporting tier to assessPowerStats with canonicalStatus='original' (D-02)", async () => { /* analogous */ });

  it("fans out mixed tiers (batch-wide ipContext) correctly", async () => {
    // 2 key + 2 supporting, all under ipContext; all 4 get canonicalStatus="known_ip_canonical".
  });

  it("anti-nested-retry: original-branch leaf failure hits exactly 3 attempts, not 9 (Codex HIGH-1)", async () => {
    let leafCalls = 0;
    vi.mocked(assessPowerStats).mockImplementation(async () => {
      // Simulate the original branch's internal withPipelineRetry layer (real retry wrapper, always-throwing leaf)
      return await withPipelineRetry("power_assess", async () => {
        leafCalls++;
        throw new Error("leaf failure");
      });
    });

    const items: EnrichNpcsBatchItem[] = [{ draft: makeDraft("Doomed"), tier: "supporting" }];
    await expect(
      enrichNpcsBatch({ items, buildClassification: () => classificationOriginal(), ctx: makeCtx() }),
    ).rejects.toMatchObject({ name: "IngestionPipelineError", stage: "power_assess", attempts: 3 });

    // CRITICAL: 3 attempts, not 9. If enrichNpcsBatch added its own withPipelineRetry,
    // this assertion would fire 9 (3 outer × 3 inner) and fail.
    expect(leafCalls).toBe(3);
  }, 15000);

  it("propagates IngestionPipelineError from assessPowerStats unchanged (fail-closed)", async () => {
    const originalError = new IngestionPipelineError({
      stage: "power_assess",
      attempts: 3,
      cause: new Error("inner"),
      message: "canon lookup exhausted",
    });
    vi.mocked(assessPowerStats).mockRejectedValue(originalError);

    const items: EnrichNpcsBatchItem[] = [{ draft: makeDraft("Doomed"), tier: "key" }];

    let caught: unknown;
    try {
      await enrichNpcsBatch({ items, buildClassification: () => classificationKnownIp(), ctx: makeCtx() });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(originalError);  // identity — not wrapped
  });

  it("bounds concurrency to at most 4 inflight assessPowerStats calls (D-05)", async () => {
    let inflight = 0;
    const observed: number[] = [];
    vi.mocked(assessPowerStats).mockImplementation(async ({ draft }) => {
      inflight++;
      observed.push(inflight);
      await new Promise((r) => setTimeout(r, 10));
      inflight--;
      return { ...draft, powerStats: makePowerStats() };
    });

    const items: EnrichNpcsBatchItem[] = Array.from({ length: 10 }, (_, i) => ({
      draft: makeDraft(`N${i}`),
      tier: "supporting" as const,
    }));

    await enrichNpcsBatch({ items, buildClassification: () => classificationOriginal(), ctx: makeCtx() });

    expect(Math.max(...observed)).toBeLessThanOrEqual(4);
    expect(vi.mocked(assessPowerStats)).toHaveBeenCalledTimes(10);
  });

  it("honors concurrency override (concurrency: 1 → strictly serial)", async () => {
    let inflight = 0;
    const observed: number[] = [];
    vi.mocked(assessPowerStats).mockImplementation(async ({ draft }) => {
      inflight++;
      observed.push(inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return { ...draft, powerStats: makePowerStats() };
    });

    const items: EnrichNpcsBatchItem[] = Array.from({ length: 3 }, (_, i) => ({ draft: makeDraft(`S${i}`), tier: "key" as const }));
    await enrichNpcsBatch({ items, buildClassification: () => classificationKnownIp(), ctx: makeCtx(), concurrency: 1 });
    expect(Math.max(...observed)).toBe(1);
  });

  it("returns empty array for empty batch without calling assessPowerStats", async () => {
    const result = await enrichNpcsBatch({ items: [], buildClassification: () => classificationOriginal(), ctx: makeCtx() });
    expect(result).toEqual([]);
    expect(assessPowerStats).not.toHaveBeenCalled();
  });
});
```

Run `npm --prefix backend test -- run enrich-npc-batch` — the test file should error because `../enrich-npc-batch.js` does not yet exist (RED). This is expected and correct — Task 2 creates the module.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run enrich-npc-batch 2>&1 | grep -E "Cannot find|Failed to resolve|failed"</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `backend/src/character/__tests__/enrich-npc-batch.test.ts`
    - `grep -c "enrichNpcsBatch" backend/src/character/__tests__/enrich-npc-batch.test.ts` returns >= 8 (multiple test cases)
    - `grep -c "assessPowerStats" backend/src/character/__tests__/enrich-npc-batch.test.ts` returns >= 5 (dispatcher is the primary mock target)
    - `grep -c "IngestionPipelineError" backend/src/character/__tests__/enrich-npc-batch.test.ts` returns >= 1
    - `grep -c "leafCalls).toBe(3)" backend/src/character/__tests__/enrich-npc-batch.test.ts` returns >= 1 (anti-nested-retry assertion)
    - `grep -c "toBeLessThanOrEqual(4)" backend/src/character/__tests__/enrich-npc-batch.test.ts` returns >= 1 (concurrency cap)
    - `grep -c "concurrency: 1" backend/src/character/__tests__/enrich-npc-batch.test.ts` returns >= 1 (override honored)
    - Routing quadrant cases all present: `grep -c "canonicalStatus.*known_ip_canonical\\|canonicalStatus.*original" backend/src/character/__tests__/enrich-npc-batch.test.ts` returns >= 4
    - Running tests produces an import/resolution failure on `../enrich-npc-batch.js` (RED — module does not exist yet) OR test failures that Task 2 will resolve
  </acceptance_criteria>
  <done>Test file written with all 10 cases; fails because module doesn't exist yet — correct RED state.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement enrich-npc-batch.ts module delegating to assessPowerStats (GREEN)</name>
  <files>backend/src/character/enrich-npc-batch.ts</files>
  <read_first>
    - backend/src/character/__tests__/enrich-npc-batch.test.ts (the tests this implements against — Task 1)
    - backend/src/character/ingestion/power-assessor.ts (assessPowerStats signature — lines 38-91; REUSE, do not duplicate its routing)
    - backend/src/character/ingestion/types.ts (IngestionContext, IngestionClassification, IngestionSources)
    - backend/src/character/ingestion/assess-original.ts (line 86 — confirms internal retry; do NOT add outer retry)
    - backend/src/character/personality-schema.ts (structural reference for Phase 64 sibling helper)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md (D-01..D-05, D-03 no-shortcut rule)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-REVIEWS.md (Codex HIGH-1: no outer withPipelineRetry; Codex MEDIUM: delegate to assessPowerStats)
  </read_first>
  <behavior>
    Create a new module exporting `enrichNpcsBatch` plus the `EnrichNpcsBatchItem` input type. The function:

    1. Iterates items, building per-NPC `IngestionClassification` via caller-provided `buildClassification(item)` callback. This keeps the (ipContext, tier) → classification synthesis at the CALLER, where the worldgen layer has the domain knowledge (e.g. "this NPC's premise diverges" flag from npcs-step).

    2. Delegates each NPC to `assessPowerStats({ draft, sources, classification, researchDigest, ctx })`. Uses a minimal `IngestionSources` (empty card/override for worldgen context) and a null `researchDigest` by default — caller can override via options if needed for Plan 02/03 integration.

    3. Does NOT wrap in `withPipelineRetry` — retry lives inside `assessOriginalCharacterPowerStats` already (`assess-original.ts:86`). Canon branch retry is out of Phase 65 scope. Absence of outer retry in this file is a static invariant verified by grep.

    4. Bounded chunked concurrency (default 4, caller-overridable).

    5. Propagates any thrown error unchanged.
  </behavior>
  <action>
Create `backend/src/character/enrich-npc-batch.ts`:

```ts
import type { CharacterDraft } from "@worldforge/shared";
import { assessPowerStats } from "./ingestion/power-assessor.js";
import type {
  IngestionClassification,
  IngestionContext,
  IngestionSources,
} from "./ingestion/types.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("enrich-npcs-batch");

/** Worldgen-side NPC tier label consumed by enrichNpcsBatch. */
export type EnrichNpcTier = "key" | "supporting";

/** One entry in an enrichment batch — the worldgen draft plus its tier. */
export interface EnrichNpcsBatchItem {
  draft: CharacterDraft;
  tier: EnrichNpcTier;
}

export interface EnrichNpcsBatchOptions {
  items: EnrichNpcsBatchItem[];
  /**
   * Caller-provided synthesis of (item → IngestionClassification). Worldgen-layer
   * callers set canonicalStatus='known_ip_canonical' (or 'known_ip_diverged' if
   * the worldgen layer flagged premise divergence) when ipContext is non-null,
   * 'original' when ipContext is null. Keeps domain knowledge at the caller.
   */
  buildClassification: (item: EnrichNpcsBatchItem) => IngestionClassification;
  /** Full ingestion context. Worldgen passes its existing ctx (campaign, settings, gen role, etc.). */
  ctx: IngestionContext;
  /**
   * Optional per-NPC sources override. Worldgen default is an empty sources
   * bundle (no card, no override). Callers may inject override text if a
   * sectional regenerate exposes per-NPC user notes.
   */
  buildSources?: (item: EnrichNpcsBatchItem) => IngestionSources;
  /**
   * Optional researchDigest to pass per NPC. Worldgen default null —
   * assessPowerStats will use its own research path via ctx.settings.research.
   */
  researchDigest?: string | null;
  /**
   * Maximum concurrent per-NPC assessment calls. Default 4 per CONTEXT D-05.
   * Exposed for test/override only; production call sites pass nothing.
   */
  concurrency?: number;
}

const DEFAULT_CONCURRENCY = 4;

const EMPTY_SOURCES: IngestionSources = {
  card: null,
  description: null,
  overrideText: null,
  // Fill any other required fields per IngestionSources type definition.
} as unknown as IngestionSources;

/**
 * Enrich a batch of worldgen NPC drafts with PowerStats.
 *
 * Architecture:
 *
 *   enrichNpcsBatch (this file)
 *     └─► assessPowerStats (backend/src/character/ingestion/power-assessor.ts:38)
 *           ├─► enrichKnownIpWorldgenNpcDraft  (for known_ip_canonical | known_ip_diverged)
 *           └─► assessOriginalCharacterPowerStats  (for original | imported)
 *                 └─► withPipelineRetry("power_assess", ...)  [INTERNAL RETRY, assess-original.ts:86]
 *
 * This file intentionally does NOT wrap assessPowerStats in withPipelineRetry.
 * Retry ownership lives at the existing single layer inside
 * assessOriginalCharacterPowerStats. Adding an outer retry would nest on the
 * original branch (3 outer × 3 inner = 9 attempts) and inflate latency +
 * misreport failure semantics. See Phase 65 cross-AI review (Codex HIGH-1).
 *
 * Canon branch retry is out of Phase 65 scope.
 *
 * Fail-closed (D-04): any error thrown by assessPowerStats propagates
 * unchanged — the entire batch aborts. No partial results, no Human-default
 * fallback (D-03).
 *
 * Execution is chunked with concurrency cap (default 4) to protect rate limits
 * while cutting sequential latency. [D-05]
 */
export async function enrichNpcsBatch(
  opts: EnrichNpcsBatchOptions,
): Promise<CharacterDraft[]> {
  const { items, buildClassification, ctx, buildSources, researchDigest } = opts;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);

  if (items.length === 0) return [];

  log.info("enrichNpcsBatch start", { count: items.length, concurrency });

  const results: CharacterDraft[] = new Array(items.length);

  for (let start = 0; start < items.length; start += concurrency) {
    const chunk = items.slice(start, start + concurrency);
    const chunkPromises = chunk.map((item, offset) =>
      enrichSingle(item, {
        classification: buildClassification(item),
        sources: buildSources ? buildSources(item) : EMPTY_SOURCES,
        researchDigest: researchDigest ?? null,
        ctx,
      }).then((enriched) => {
        results[start + offset] = enriched;
      }),
    );
    // Any rejection here propagates the thrown error up to the caller
    // (fail-closed per D-04). No wrapping. No withPipelineRetry at this layer.
    await Promise.all(chunkPromises);
  }

  log.info("enrichNpcsBatch complete", { count: items.length });
  return results;
}

async function enrichSingle(
  item: EnrichNpcsBatchItem,
  ctxBundle: {
    classification: IngestionClassification;
    sources: IngestionSources;
    researchDigest: string | null;
    ctx: IngestionContext;
  },
): Promise<CharacterDraft> {
  // Direct delegation — no retry wrap. The dispatcher handles routing;
  // the original branch handles its own retry internally.
  return await assessPowerStats({
    draft: item.draft,
    sources: ctxBundle.sources,
    classification: ctxBundle.classification,
    researchDigest: ctxBundle.researchDigest,
    ctx: ctxBundle.ctx,
  });
}
```

Run `npm --prefix backend test -- run enrich-npc-batch` — all 10 tests must pass (GREEN).
Run `npm --prefix backend run typecheck` — must exit 0.

Static invariant check (anti-nested-retry): `grep -c "withPipelineRetry" backend/src/character/enrich-npc-batch.ts` must return 0.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run enrich-npc-batch && npm --prefix backend run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `backend/src/character/enrich-npc-batch.ts`
    - `grep -n "export async function enrichNpcsBatch" backend/src/character/enrich-npc-batch.ts` returns non-empty
    - `grep -n "export interface EnrichNpcsBatchItem" backend/src/character/enrich-npc-batch.ts` returns non-empty
    - Dispatcher reuse (Codex MEDIUM): `grep -c "assessPowerStats" backend/src/character/enrich-npc-batch.ts` returns >= 2 (import + call)
    - No duplicated routing: `grep -c "canonicalStatus" backend/src/character/enrich-npc-batch.ts` returns 0 (classification comes from caller; routing lives in assessPowerStats, not in this file)
    - **Anti-nested-retry invariant (Codex HIGH-1):** `grep -c "withPipelineRetry" backend/src/character/enrich-npc-batch.ts` returns 0
    - No direct reference to leaf assessment functions (dispatcher owns those): `grep -c "enrichKnownIpWorldgenNpcDraft\\|assessOriginalCharacterPowerStats" backend/src/character/enrich-npc-batch.ts` returns 0
    - No Human-default shortcut: `grep -c "Human.*default\\|defaultHuman\\|fallbackStats" backend/src/character/enrich-npc-batch.ts` returns 0
    - `npm --prefix backend test -- run enrich-npc-batch` exits 0 (all 10 cases green, including Test 6 proving leafCalls === 3)
    - `npm --prefix backend run typecheck` exits 0
    - No changes to `backend/src/worldgen/scaffold-steps/npcs-step.ts` — `git diff backend/src/worldgen/scaffold-steps/npcs-step.ts` is empty (migration is Plan 02)
    - No changes to `backend/src/routes/worldgen.ts` — migration is Plan 03
    - No changes to `backend/src/character/ingestion/power-assessor.ts` — dispatcher is reused as-is, not modified
  </acceptance_criteria>
  <done>Shared helper module lands delegating to existing assessPowerStats dispatcher; 10 unit tests green; anti-nested-retry proven (leafCalls === 3, grep "withPipelineRetry" === 0); bounded concurrency + override proven; call-sites untouched pending Plans 02 and 03.</done>
</task>

</tasks>

<verification>
- `npm --prefix backend test -- run enrich-npc-batch` exits 0 (10 tests pass).
- `npm --prefix backend run typecheck` exits 0.
- New module exports `enrichNpcsBatch` and `EnrichNpcsBatchItem`.
- Module delegates to existing `assessPowerStats` dispatcher — no duplicated routing.
- Module does NOT wrap in `withPipelineRetry` (grep-zero) — avoids original-branch nested retry.
- No consumer migrations in this plan — Plan 02 and Plan 03 handle those.
</verification>

<success_criteria>
- Single source of truth for per-NPC power-stats delegation, bounded concurrency, and fail-closed propagation.
- Routing rules are NOT duplicated — `assessPowerStats` at `power-assessor.ts:38` is the single dispatcher.
- Retry ownership stays at the existing single layer (internal to `assessOriginalCharacterPowerStats`). Anti-nested-retry proven by leaf-count === 3.
- All 4 NPC quadrants proven to reach the correct dispatcher branch via unit tests.
- Concurrency cap proven (D-05): max observed inflight calls <= 4; override honored.
</success_criteria>

<requirement_coverage>
- **P65-R1** (partial — helper delegates all 4 quadrants; integration in Plans 02 + 03): dispatcher reuse covers every quadrant via `assessPowerStats`.
- **P65-R2** (shared helper with single source of truth): `enrichNpcsBatch` is the canonical module; reuses the existing `assessPowerStats` dispatcher (Codex MEDIUM addressed — no rule duplication).
- **P65-R3** (fail-closed retry — layer 1 of 3): retry lives at the existing internal layer inside `assessOriginalCharacterPowerStats`; this helper does NOT add another. Anti-nested-retry proven by Test 6 (`leafCalls === 3`). Propagation proven by Test 7 (error identity). Additional layers proven in Plan 02 (integration) and Plan 03 (HTTP boundary).
- **P65-R4** (bounded parallel concurrency): Test 8 asserts max observed inflight <= 4; Test 9 proves override honored.
</requirement_coverage>

<estimates>
- Effort: ~45-60 min Claude execution (10 unit tests including 1 retry-chain simulation + 1 module file delegating to existing dispatcher).
- Test runtime: < 10s for all 10 cases (Test 6 runs real withPipelineRetry with 500ms/1s backoff ≈ 2s).
- Wave 1: no dependencies.
</estimates>

<risks>
- **R1 — vi.mock resolution.** Vitest's `vi.mock` is hoisted; mocking `../ingestion/power-assessor.js` by relative path requires matching the test file location. Mitigation: test file lives at `backend/src/character/__tests__/` so `../ingestion/power-assessor.js` resolves correctly.
- **R2 — IngestionClassification / IngestionContext / IngestionSources shape drift.** The types are defined in `backend/src/character/ingestion/types.ts`. Mitigation: read types.ts at the start of Task 1 and mirror the exact shape in fixtures.
- **R3 — Test 6 retry-chain simulation.** Real `withPipelineRetry` has backoff (500ms + 1s + 2s). Test timeout set to 15s to accommodate. If backoff is configurable, Test 6 may optionally pass `{ maxAttempts: 3, baseDelayMs: 10 }` if the helper exposes that API.
- **R4 — Concurrency-cap proof flakiness.** Observed-inflight assertion might pass-by-luck on fast hardware. Mitigation: 10 items + 10ms artificial delay inside mock ensures at least one chunk boundary is exercised.
- **R5 — Dispatcher signature assumptions.** `assessPowerStats` takes `{ draft, sources, classification, researchDigest, ctx }`. If any field is required by the dispatcher but not obvious at call site, Task 2 action specifies a minimal EMPTY_SOURCES and null researchDigest for the worldgen default. Verify by reading power-assessor.ts before writing the implementation.
</risks>

<output>
After completion, create `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-01-SUMMARY.md` with:
- Task breakdown (test file + implementation file)
- Test output — all 10 cases green including Test 6 (`leafCalls === 3` — anti-nested-retry proof)
- Typecheck output
- Static invariants verified: `grep "withPipelineRetry" backend/src/character/enrich-npc-batch.ts` returns 0; `grep "canonicalStatus" ...` returns 0 (routing delegated, not duplicated)
- Confirmation that npcs-step.ts, routes/worldgen.ts, and power-assessor.ts are untouched
</output>
