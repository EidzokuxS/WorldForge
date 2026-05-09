---
phase: 64-npc-personality-regeneration-parity
plan: 03
slug: regenerate-integration-test
type: execute
wave: 3
status: draft
depends_on: [64-01, 64-02]
files_modified:
  - backend/src/routes/__tests__/worldgen.test.ts
autonomous: true
requirements: [P64-R5]
must_haves:
  truths:
    - "A NEW integration test for /api/worldgen/regenerate-section section=npcs exercises the REAL generateNpcsStep runtime — not a vi.mock passthrough. The only mocked seam is the per-NPC LLM call (ai-sdk generateObject or the project's safeGenerateObject wrapper). generateNpcsStep itself runs with its actual schema + mapper + retry logic from Plan 02."
    - "Mock seam is at ../../ai/generate-object-safe.js — vi.mock it so its safeGenerateObject export returns the canned plan-call and detail-call objects. This is the SAME seam the existing npcs-step unit test uses, so the contract is consistent across unit and integration layers."
    - "The mocked LLM returns a full flat personality pack on the detail call (all 7 flat fields populated with substantive content). The test asserts that the HTTP response body contains draft.identity.personality with all 7 nested sub-fields non-empty — proving the real Plan 02 runtime mapping path works end-to-end."
    - "The existing mock-based test (worldgen.test.ts:1889 'calls generateNpcsStep for section=npcs') is REMOVED or REPURPOSED to no longer claim P64-R5 coverage. If kept at all, it must be renamed to describe itself as a route-wiring/transparency check, NOT a P64-R5 runtime proof."
    - "NO negative assertion is included. The test FAILS if the returned personality pack is incomplete — Phase 64 exists to close this gap, not to document surviving broken state."
    - "Test does NOT depend on a real database or real LLM provider — only vi.mock on the LLM seam. Uses the existing test harness (Hono app.request) and existing CAMPAIGN_ID/fakeSettings fixtures."
    - "npm --prefix backend test -- run \"worldgen\" exits 0"
  artifacts:
    - path: backend/src/routes/__tests__/worldgen.test.ts
      provides: "Integration coverage on /regenerate-section section=npcs asserting draft.identity.personality round-trips from REAL generateNpcsStep through the HTTP boundary when only the LLM seam is mocked"
      contains: "identity.personality"
  key_links:
    - from: backend/src/routes/__tests__/worldgen.test.ts
      to: backend/src/routes/worldgen.ts
      via: "app.request('/api/worldgen/regenerate-section', ...) exercises the route; route calls real generateNpcsStep"
      pattern: "regenerate-section"
    - from: backend/src/routes/__tests__/worldgen.test.ts
      to: backend/src/ai/generate-object-safe.ts
      via: "vi.mock at this seam returns canned plan+detail objects so generateNpcsStep runs its real schema/mapper/retry code without a real LLM"
      pattern: "safeGenerateObject"
---

<objective>
Prove P64-R5 with a REAL integration test. The current test at worldgen.test.ts:1889 mocks `generateNpcsStep` entirely — it proves route transparency but CANNOT prove the runtime P64-R5 contract (that `/api/worldgen/regenerate-section section=npcs` emits a fully-populated personality pack). Codex review B2/B3 flagged this as HIGH risk: the test could green even with Plan 02 broken.

This plan UNMOCKS `generateNpcsStep` and mocks only the innermost LLM seam (`safeGenerateObject` from `../../ai/generate-object-safe.js`). The real step's schema + prompt + mapper + retry all execute against the mocked LLM output. The HTTP response is then asserted to carry the full personality pack, end-to-end.

Purpose: close the "mock-based coverage for runtime requirement" gap identified by Codex. Plan 02's unit test proves the step in isolation; this plan proves the step works through the HTTP route → real generateNpcsStep → mocked LLM seam → real mapper → real response body chain.

Output:
- ONE new integration test exercising the real generateNpcsStep with mocked LLM seam
- The old mock-based test either removed or explicitly re-labeled as route-wiring only (NOT P64-R5 proof)
- Removed B3 negative assertion — test MUST fail if Plan 02 is broken
- No changes to `routes/worldgen.ts` — the route itself is correct; only the test changes
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
@.planning/phases/64-npc-personality-regeneration-parity/64-02-worldgen-npcs-step-fix-PLAN.md
@CLAUDE.md
@backend/src/routes/worldgen.ts
@backend/src/routes/__tests__/worldgen.test.ts
@backend/src/worldgen/scaffold-steps/npcs-step.ts
@backend/src/worldgen/types.ts
@backend/src/character/personality-schema.ts
@shared/src/types.ts

<interfaces>
<!-- Existing route shape (routes/worldgen.ts:594-597) — this plan exercises it without modifying it: -->
```ts
case "npcs": {
  const npcs = await generateNpcsStep(req, result.data.refinedPremise, result.data.locationNames, result.data.factionNames, ipContext, result.data.additionalInstruction);
  return c.json({ npcs });
}
```

<!-- Current test at worldgen.test.ts:1889 — it mocks `generateNpcsStep` fully via the top-level vi.mock('../../worldgen/index.js') block. That mock path must be BYPASSED for the new integration test (unmocked real step). The new test either goes in a separate describe block with its own mock configuration, or uses vi.doMock scoping. -->

<!-- LLM seam to mock: backend/src/ai/generate-object-safe.ts -->
```ts
// npcs-step.ts line 1:
import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
```
This is the single seam used for BOTH the plan call AND the detail call in generateNpcsStep. Mocking it once covers all LLM calls the step makes.

<!-- Expected mock sequence for ONE NPC integration test: -->
```
1. Plan-key call     → returns { npcs: [{ name: "Guard", role: "...", locationName: "Castle", factionName: null }] }
2. Plan-supporting   → returns { npcs: [] }
3. Detail for Guard  → returns full detail object with all 7 personality fields populated
4. (optional) retry  → NOT triggered if sampleLines are substantive
```

<!-- CharacterPersonality nested shape (shared/src/types.ts) — the 7 sub-fields the test asserts: -->
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

<!-- Existing test file top (worldgen.test.ts:1-180) already has vi.mock('../../worldgen/index.js', ...) which mocks generateNpcsStep. That mock must be UNDONE or SCOPED OUT for the new integration test. Two possible approaches: -->

<!-- Approach A: use vi.doMock/vi.unmock inside a separate describe with beforeEach/afterEach scoping. -->
<!-- Approach B: split the file — move the existing describe block for regenerate-section full-mock tests to one location, add a new describe block that uses vi.doMock('../../ai/generate-object-safe.js') instead and vi.doUnmock('../../worldgen/index.js') to get the real step. -->

<!-- Approach B is clearer — preferred. The new describe block explicitly sets up its own mocking at the LLM seam only. -->
</interfaces>

<project_conventions>
- Vitest with Hono `app.request(...)` for integration tests
- `vi.mock` / `vi.doMock` / `vi.unmock` for test-seam control
- Keep test concise — prefer a separate describe block over splicing into existing mock-heavy blocks
- Do NOT modify `routes/worldgen.ts` — the route is already correct; only its test needs to prove it
- Do NOT mock `generateNpcsStep` in the new test — that's the whole point (B2 fix)
</project_conventions>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add real-step integration test mocking only the LLM seam (B2 fix)</name>
  <files>backend/src/routes/__tests__/worldgen.test.ts</files>
  <read_first>
    - backend/src/routes/__tests__/worldgen.test.ts (FULL — understand top-level vi.mock calls at :17-80, fakeSettings and CAMPAIGN_ID fixtures, and the existing regenerate-section describe block)
    - backend/src/routes/worldgen.ts (lines 519-607, specifically :594-597 for the case "npcs" branch)
    - backend/src/worldgen/scaffold-steps/npcs-step.ts (understand the real code path that will run unmocked: plan call → detail call → retry check → merge → return)
    - backend/src/ai/generate-object-safe.ts (confirm the export name `safeGenerateObject`)
    - backend/src/worldgen/types.ts (ScaffoldNpc type)
    - shared/src/types.ts (CharacterPersonality + CharacterDraft)
    - .planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md (GA-2 D-04, D-05)
    - .planning/phases/64-npc-personality-regeneration-parity/64-REVIEWS.md (B2 real integration test mandate, B3 delete negative assertion)
    - .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md (Wave 0 §regenerate)
  </read_first>
  <behavior>
    ONE new integration test added to `worldgen.test.ts`. The test:

    - Un-mocks `../../worldgen/index.js` so the REAL `generateNpcsStep` runs.
    - Mocks `../../ai/generate-object-safe.js` to control LLM output deterministically.
    - Sequences the mock responses to match generateNpcsStep's actual call pattern:
      1. Plan call (key tier) — returns 1 NPC
      2. Plan call (supporting tier) — returns 0 NPCs
      3. Detail call — returns a FULL flat personality pack plus persona/selfImage/tags/goals/socialRoles
      4. No retry expected — substantive sampleLines
    - Exercises the HTTP route via `app.request(...)` with `section: "npcs"`.
    - Asserts response body `npcs[0].draft.identity.personality` has all 7 sub-fields populated with the mocked LLM values.
    - DOES NOT include a negative assertion that tolerates incomplete personality (B3 fix).

    The OLD test at :1889 ("calls generateNpcsStep for section=npcs") is kept as-is for backward-compat wiring check but is explicitly re-labeled as route-wiring-only. It is NOT the P64-R5 proof.
  </behavior>
  <action>
**Step A — Study the existing mock setup:**
Read the top of `worldgen.test.ts` (lines 1-180). Identify:
1. The `vi.mock('../../worldgen/index.js', ...)` call (≈ line 17-30) that currently mocks `generateNpcsStep`.
2. Any top-level `vi.mock('../../ai/...')` call that may already mock generateObject.
3. Whether the file uses hoisted vi.mock or inline-factory form.

**Step B — Decide mocking strategy:**
Since top-level `vi.mock` is hoisted by Vitest and applies to the entire file, this plan chooses the CLEAN approach: use `vi.doMock` inside a new describe block that overrides the generateNpcsStep mock (by reading the module fresh via dynamic import) and adds a seam mock at `../../ai/generate-object-safe.js`.

Concretely, append a NEW describe block to the file:

```ts
describe("/api/worldgen/regenerate-section section=npcs — real step integration (P64-R5)", () => {
  // Each test in this block uses a fresh import graph with un-mocked
  // generateNpcsStep and a mocked LLM seam.
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../../worldgen/index.js");
    vi.doMock("../../ai/generate-object-safe.js", () => ({
      safeGenerateObject: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../ai/generate-object-safe.js");
  });

  it("returns fully-populated identity.personality when real generateNpcsStep runs with mocked LLM seam", async () => {
    // Dynamic import so the module graph picks up doMock/doUnmock
    const { default: appFresh } = await import("../../index.js");  // or whatever path exposes the Hono app — match existing test-file imports
    const { safeGenerateObject } = await import("../../ai/generate-object-safe.js");
    const mockLlm = vi.mocked(safeGenerateObject);

    // Mock sequence: plan-key → plan-supporting → detail → (no retry, substantive lines)
    mockLlm
      .mockResolvedValueOnce({
        object: {
          npcs: [{
            name: "Guard",
            role: "Gate warden",
            locationName: "Castle",
            factionName: null,
          }],
        },
      } as any)
      .mockResolvedValueOnce({
        object: { npcs: [] },
      } as any)
      .mockResolvedValueOnce({
        object: {
          persona: "A stoic gate warden who has served the Castle for twenty years.",
          selfImage: "The last man who still keeps his post.",
          socialRoles: ["Gate Warden"],
          tags: ["Disciplined", "Watchful", "Loyal"],
          goals: {
            shortTerm: ["Hold the gate through the night"],
            longTerm: ["Retire with honor intact"],
          },
          personalitySummary: "Stoic guard with a private grudge against his captain",
          personalityVoice: "Terse, repeats the rulebook to himself under his breath",
          personalityDecisionStyle: "Defers to protocol unless protocol fails him",
          personalityWorldview: "Order is the only thing standing between people and ruin",
          personalityContradictions: [
            "Believes loyalty is absolute, but secretly resents his captain for three long years",
          ],
          personalityMythology: "The last man who kept his post when the others fled",
          personalitySampleLines: [
            "Stand down. I will not ask again.",
            "Protocol says you leave through the west gate. Use it.",
          ],
        },
      } as any);

    const res = await appFresh.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        section: "npcs",
        refinedPremise: "A dark medieval world",
        locationNames: ["Castle"],
        factionNames: [],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // REAL-step integration: generateNpcsStep ran its real schema + mapper + retry predicate
    expect(body.npcs).toHaveLength(1);
    expect(body.npcs[0].draft).toBeDefined();
    const personality = body.npcs[0].draft.identity.personality;

    // ALL 7 sub-fields MUST be populated — P64-R5. No negative assertion; this test
    // FAILS if Plan 02's runtime mapping is broken.
    expect(personality.summary).toBe("Stoic guard with a private grudge against his captain");
    expect(personality.voice).toContain("Terse");
    expect(personality.decisionStyle).toContain("protocol");
    expect(personality.worldview).toContain("Order is the only thing");
    expect(personality.internalContradictions.length).toBeGreaterThan(0);
    expect(personality.internalContradictions[0]).toContain("loyalty is absolute");
    expect(personality.personalMythology).toBe("The last man who kept his post when the others fled");
    expect(personality.sampleLines).toHaveLength(2);
    expect(personality.sampleLines[0]).toContain("Stand down");
    expect(personality.sampleLines[1]).toContain("Protocol");
  });
});
```

**NOTE — import path portability:** `appFresh` above must be the live Hono `app` object. Read the existing test file for how `app` is obtained (likely `import app from "../../index.js"` or similar). Match that path for the dynamic import. If the existing test uses a shared helper (e.g. `createApp()`), use that same helper inside the new describe block.

**NOTE — vi.mock/doMock nuances:** Vitest hoists top-level `vi.mock` calls to the top of the file, which means `vi.doUnmock` in a beforeEach may not fully override them if the module was already imported. If that proves fragile, the alternative is to:
- move the entire new describe block to a SEPARATE test file (e.g. `worldgen.personality-integration.test.ts`) where no conflicting top-level mock exists; OR
- use `vi.resetModules()` + `vi.unmock()` + dynamic `await import()` pattern.

If a separate test file is preferred for clarity, update `files_modified` accordingly — the scope contract is "add one integration test", the filename can be either location.

**Step C — Re-label (do NOT delete) the old mock-based test at :1889:**

Change its title from `"calls generateNpcsStep for section=npcs"` to `"calls generateNpcsStep for section=npcs (route-wiring only — P64-R5 proven by real-step integration test below)"`. Add a leading comment block:

```ts
// Route-wiring transparency check only. Does NOT prove P64-R5 runtime behavior.
// P64-R5 is proven by the real-step integration test that mocks only the LLM seam.
// See `describe("/api/worldgen/regenerate-section section=npcs — real step integration (P64-R5)", ...)`.
it("calls generateNpcsStep for section=npcs (route-wiring only)", async () => {
  // ... existing body unchanged
});
```

**Step D — Verify negative assertion removed (B3 fix):**

The original Plan 03 had a must_have claiming the test "still passes even when generateNpcsStep returns draft WITHOUT personality.voice" — this is DELETED. The new real-step test FAILS on any missing sub-field. Confirm no test in this plan asserts an incomplete pack as acceptable.

**Step E — Run the test:**

```
npm --prefix backend test -- run "worldgen"
npm --prefix backend run typecheck
```

All tests pass. The new real-step integration test specifically runs Plan 02's real code path against the mocked LLM seam.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "worldgen" && npm --prefix backend run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - A new describe block titled "/api/worldgen/regenerate-section section=npcs — real step integration (P64-R5)" exists in `backend/src/routes/__tests__/worldgen.test.ts`
    - Inside that describe block, `grep -n "vi.doMock.*generate-object-safe" backend/src/routes/__tests__/worldgen.test.ts` returns ≥ 1 (LLM seam mock)
    - Inside that describe block, `grep -n "vi.doUnmock.*worldgen/index" backend/src/routes/__tests__/worldgen.test.ts` returns ≥ 1 (real step un-mocked)
    - The new test's mock sequence has at least 3 .mockResolvedValueOnce calls (plan-key + plan-supporting + detail)
    - `grep -c "personalitySummary\|personalityVoice\|personalityDecisionStyle\|personalityWorldview\|personalityContradictions\|personalityMythology\|personalitySampleLines" backend/src/routes/__tests__/worldgen.test.ts` returns ≥ 7 (all 7 flat fields present in mock detail)
    - The HTTP response assertion covers all 7 sub-fields: `grep -c "personality.summary\|personality.voice\|personality.decisionStyle\|personality.worldview\|personality.internalContradictions\|personality.personalMythology\|personality.sampleLines" backend/src/routes/__tests__/worldgen.test.ts` returns ≥ 7
    - NO negative assertion tolerating missing sub-fields — grep for "passes even when\|incomplete personality\|tolerates empty" in the test file returns 0
    - The original test at :1889 is re-labeled to include "route-wiring only" — `grep -c "route-wiring only" backend/src/routes/__tests__/worldgen.test.ts` returns ≥ 1
    - Test passes: `npm --prefix backend test -- run "worldgen"` exits 0
    - Typecheck: `npm --prefix backend run typecheck` exits 0
    - No changes to `routes/worldgen.ts` — the route is already correct. `git diff backend/src/routes/worldgen.ts` returns empty.
  </acceptance_criteria>
  <done>Real-step integration test added; mocks only the LLM seam; asserts full personality pack round-trips; negative assertion removed; old mock-based test re-labeled as route-wiring only. P64-R5 now provably covered.</done>
</task>

<task type="auto">
  <name>Task 2: Cross-check with Plan 02 + scope verification</name>
  <files>(no edits — verification only)</files>
  <read_first>
    - backend/src/routes/__tests__/worldgen.test.ts (just-extended)
    - .planning/phases/64-npc-personality-regeneration-parity/64-02-worldgen-npcs-step-fix-PLAN.md (what Plan 02 changed)
  </read_first>
  <action>
1. Run full worldgen test suite:
   ```
   npm --prefix backend test -- run "worldgen"
   ```
   Expect: all tests pass INCLUDING the new real-step integration test.

2. Prove the new test actually exercises Plan 02's runtime. If Plan 02 lands AFTER Plan 03 is written (they are in different waves now — 64-03 is Wave 3, depends on 64-02 in Wave 2), the test MUST fail on Plan 02-pre-landing and pass on Plan 02-post-landing. Verify this in the execution log:
   - Before Plan 02 lands: the real-step test fails (generateNpcsStep returns incomplete personality, test assertions break).
   - After Plan 02 lands: the real-step test passes.
   This flip is the proof that the integration test genuinely exercises Plan 02's fix.

3. Run full backend suite to catch any cross-test collisions:
   ```
   npm --prefix backend test -- run
   ```

4. Run `gitnexus_detect_changes({scope: "all"})` — confirm ONLY `backend/src/routes/__tests__/worldgen.test.ts` was modified by this plan.

5. Cross-check scope contract:
   - D-04 says `/regenerate-section` stays full-replace. Plan 03 test does NOT test merge semantics. Verify: `grep -c "existingNpcs\|mergeBy" backend/src/routes/__tests__/worldgen.test.ts` returns 0.
   - D-05 deferred preserve-edits. Plan 03 test does NOT assume preserve-edits behavior.
   - B3 negative-assertion fix: `grep -c "passes even when\|incomplete personality\|tolerates empty" backend/src/routes/__tests__/worldgen.test.ts` returns 0.

6. Check test runtime — integration tests spin up Hono app; budget < 10s.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run && npm --prefix backend run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - Full backend suite exits 0
    - Typecheck exits 0
    - gitnexus_detect_changes shows exactly 1 file: `backend/src/routes/__tests__/worldgen.test.ts`
    - `git diff backend/src/routes/worldgen.ts` is empty (route not touched)
    - `grep -c "existingNpcs\|mergeBy" backend/src/routes/__tests__/worldgen.test.ts` returns 0 (D-04/D-05 scope contract preserved)
    - `grep -c "passes even when\|incomplete personality\|tolerates empty" backend/src/routes/__tests__/worldgen.test.ts` returns 0 (B3 negative assertion removed)
    - Worldgen integration test file runtime < 10s (budget check)
  </acceptance_criteria>
  <done>Integration test lands cleanly; no scope leak; full suite green; D-04 + D-05 preserved; B3 fix verified.</done>
</task>

</tasks>

<verification>
- `npm --prefix backend test -- run "worldgen"` exits 0 — new real-step integration test PASSES (mocking only the LLM seam).
- `npm --prefix backend test -- run` exits 0 — full backend suite green.
- `npm --prefix backend run typecheck` exits 0.
- The new test in `backend/src/routes/__tests__/worldgen.test.ts` un-mocks `../../worldgen/index.js` and mocks `../../ai/generate-object-safe.js`.
- Route file `backend/src/routes/worldgen.ts` is UNCHANGED.
- No negative assertion in the new test — it FAILS if Plan 02's mapping is broken.
- Old mock-based test re-labeled as route-wiring only; P64-R5 claim removed from it.
</verification>

<success_criteria>
- HTTP round-trip contract for `/api/worldgen/regenerate-section section=npcs` PROVEN at the runtime level: real generateNpcsStep → real mapper → real response body carries full personality pack.
- Mock-based route-transparency test retained as a wiring check only, not the P64-R5 proof.
- P64-R5 genuinely covered (not merely syntactically).
</success_criteria>

<requirement_coverage>
- **P64-R5** — Real-step integration test runs generateNpcsStep unmocked with only the LLM seam (`safeGenerateObject`) stubbed, then asserts the HTTP response body carries `draft.identity.personality` with all 7 sub-fields populated. Plan 02 provides the runtime implementation; Plan 03 proves it works end-to-end through the HTTP route.
</requirement_coverage>

<estimates>
- Effort: ~35-45 min Claude execution (single test + mock seam plumbing + mock sequence crafting + re-label of old test).
- Test runtime: < 10s for full worldgen integration suite.
- Execution: sequential Wave 3 — depends on Plan 02 being green in Wave 2.
</estimates>

<risks>
- **R1 — vi.mock hoisting fragility.** Vitest hoists top-level vi.mock calls. Overriding them with vi.doMock inside a describe block can be flaky. **Mitigation:** if the vi.resetModules + vi.doMock + dynamic import approach proves unstable during implementation, the fallback is to put the new real-step test in a SEPARATE file (e.g. `worldgen.personality-integration.test.ts`). That file would have NO top-level `vi.mock('../../worldgen/index.js', ...)`, only `vi.mock('../../ai/generate-object-safe.js', ...)`. Update `files_modified` frontmatter if the split is chosen.
- **R2 — CharacterDraft shape complexity on assertion.** The assertion reads deeply into `body.npcs[0].draft.identity.personality.*`. If the real generateNpcsStep returns a ScaffoldNpc without `.draft` (e.g., because of a bug in fromLegacyScaffoldNpc), the test needs a defensive assertion before drilling. **Mitigation:** `expect(body.npcs[0].draft).toBeDefined()` first, then drill — produces a better failure message.
- **R3 — Wave 3 dependency.** Plan 03 now depends on Plan 02 (was parallel in the original). If Plan 02 has not landed, this test will fail — that's CORRECT behavior, not a bug. Execute-phase must run Plan 02 first.
- **R4 — Existing tests' top-level vi.mock conflict.** If the existing `vi.mock('../../worldgen/index.js')` is used by the other `describe` blocks in the file (factions, locations, lore, etc.), un-mocking it inside our describe must NOT affect them. `vi.doUnmock` in beforeEach and `vi.doUnmock` restored-in-afterEach pattern handles this, but verify during execution that sibling describe blocks still pass.
</risks>

<output>
After completion, create `.planning/phases/64-npc-personality-regeneration-parity/64-03-SUMMARY.md` with:
- Task completed (real-step integration test + old test re-label)
- File modified (1 — OR 2 if the split-file fallback was taken)
- Mock seam chosen: `../../ai/generate-object-safe.js`
- Test output — new assertion green; proves P64-R5 at the runtime level
- Before/after flip evidence: test fails on Plan-02-pre-landing worktree snapshot (if possible to demonstrate); test passes on current worktree
- gitnexus_detect_changes digest
- D-04 + D-05 preservation evidence
- B2 fix confirmation: grep -c "vi.doMock.*generate-object-safe" ≥ 1
- B3 fix confirmation: grep -c "passes even when\|incomplete personality\|tolerates empty" returns 0
</output>
</content>
</invoke>
