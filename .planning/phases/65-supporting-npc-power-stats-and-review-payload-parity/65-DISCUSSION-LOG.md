# Phase 65: Supporting NPC Power Stats and Review Payload Parity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 65-supporting-npc-power-stats-and-review-payload-parity
**Areas discussed:** Worldgen power stats coverage, Regenerate-section + saver parity

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Worldgen power stats coverage | Who gets powerStats in npcs-step? Branch by canonicalStatus (known-IP key vs supporting vs original). | ✓ |
| Frontend draft payload persistence | How result.draft reaches ScaffoldNpc (backend toLegacyNpcDraft include draft, frontend spread with draft, or replace with characterDraftToScaffoldNpc). | |
| Regenerate-section + saver parity | /api/worldgen/regenerate-section and scaffold-saver must preserve powerStats for supporting NPCs too. Mirror Phase 64 parity pattern. | ✓ |
| Legacy NPC backfill | Existing supporting NPCs in saved campaigns have no powerStats. Backfill script vs on-load retroactive vs leave-legacy. | |

**Notes:** Frontend draft payload persistence deferred to Claude's Discretion in CONTEXT.md because it is mentioned by the phase title and the bug is confirmed in `record-adapters.ts:920` → `npcs-section.tsx:207` spread pattern, but the user opted not to discuss the implementation choice. Legacy backfill deferred to future phase.

---

## Worldgen Power Stats Coverage

### Q1: Known-IP SUPPORTING NPCs — how to assess powerStats?

| Option | Description | Selected |
|--------|-------------|----------|
| Full canon research (enrichKnownIpWorldgenNpcDraft) | Same path as key — web research + VS Battles tier assessment. Expensive (adds N search calls where N=3-5 supporting). Best quality, canon-accurate. | ✓ |
| assessOriginalCharacterPowerStats (no search) | LLM-only inference from draft + persona + premise — reuses Phase 60 original branch. Cheap, fast. Quality depends on LLM priors about franchise. | |
| Human default baseline | Skip assessment — use Human tier defaults. Matches mundane informant/merchant archetype. Zero cost. | |

**User's choice:** Full canon research.

### Q2: ORIGINAL-world NPCs (both tiers) — how to assess powerStats?

| Option | Description | Selected |
|--------|-------------|----------|
| assessOriginalCharacterPowerStats for all | Same treatment as player/NPC ingestion in Phase 60. Both tiers. One LLM call per NPC (~6-10 key + 3-5 supporting). Consistent across creation surfaces. | ✓ |
| assessOriginal for key only, Human default for supporting | Tiered: key NPCs assess, supporting NPCs Human baseline. Halves cost. | |
| Human default for all original NPCs | Lowest cost. Original worlds usually lack distinct power scaling needs. | |

**User's choice:** assessOriginalCharacterPowerStats for all.

### Q3: Fail-closed policy when enrichment fails mid-batch

| Option | Description | Selected |
|--------|-------------|----------|
| Fail entire npcs-step (Phase 60 fail-closed) | Throw IngestionPipelineError, abort scaffold gen. | |
| Retry per-NPC via withPipelineRetry, fail on exhaustion | Each NPC enrichment wrapped in withPipelineRetry(3 attempts). If one NPC fails all retries → abort scaffold. | ✓ |
| Per-NPC isolation, partial success allowed | Failed NPC gets null powerStats + provenance.enrichmentError. Violates no-fallback. | |

**User's choice:** Retry per-NPC via withPipelineRetry, fail on exhaustion.

### Q4: Parallelization of enrichment calls across 6-15 NPCs

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential per-NPC | Simple, predictable. Slowest: ~15 sequential LLM calls. | |
| Parallel batches of 3-5 (match npc-generator detail batch size) | Mirrors existing detail-pass pattern in npcs-step. Bounded concurrency. | ✓ |
| Full parallel (Promise.all over all NPCs) | Fastest. Risk of rate-limit bursts especially with web-search. | |

**User's choice:** Parallel batches of 3-5.

---

## Regenerate-Section + Saver Parity

### Q1: /api/worldgen/regenerate-section section="npcs" — how to reach parity?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse same enrichment batch path as initial npcs-step | Extract enrichment into shared helper (enrichNpcsBatch) called by both scaffold-steps/npcs-step and regenerate-section. Single source of truth. Phase 64 pattern. | ✓ |
| Duplicate enrichment inside regenerate handler | Copy logic. Faster to implement, guaranteed drift. | |
| Post-process regenerated NPCs through ingestCharacterDraft | Route each regenerated NPC through the Phase 60 ingestion pipeline. Unified but changes semantics. | |

**User's choice:** Reuse same enrichment batch path as initial npcs-step.

### Q2: scaffold-saver — how to persist powerStats on supporting NPCs?

| Option | Description | Selected |
|--------|-------------|----------|
| reconcileDraftBackedScaffoldNpc already handles it — only fix upstream | Saver line 176 already calls reconcileDraftBackedScaffoldNpc when npc.draft exists. Verify via test, no saver changes needed. | ✓ |
| Audit saver to force powerStats round-trip | Add assertion/log + new test case covering supporting NPC. | |
| Saver-side fallback assessment | If draft.powerStats missing at save, saver invokes assessor as safety net. Violates fail-closed. | |

**User's choice:** reconcileDraftBackedScaffoldNpc already handles it — only fix upstream.

### Q3: Verification strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Real-step integration test on /regenerate-section (Phase 64 pattern) | Real route + LLM seam mock, asserts powerStats present on supporting NPC. Plus scaffold-saver test with draft.powerStats round-trip. Plus initial-scaffold test for known-IP supporting + original-both-tiers. | ✓ |
| Unit tests only | Test shared enrichNpcsBatch helper in isolation. Weaker proof of end-to-end parity. | |
| Full suite: unit + integration + PinchTab smoke | Strongest proof, longest plan. | |

**User's choice:** Real-step integration test on /regenerate-section (Phase 64 pattern).

### Q4: Frontend card rendering for supporting NPCs with powerStats

| Option | Description | Selected |
|--------|-------------|----------|
| No UI changes — card already renders npc.draft.powerStats when present | Per frontend/components/world-review/npcs-section.tsx:544 PowerStatsSection already conditionally renders. | ✓ |
| Add explicit 'Supporting NPC' header above stats | Scope creep — tier label already shown per Phase 35. | |
| Verify render but skip changes | Write regression test asserting PowerStatsSection renders for both tiers. No production code change. | |

**User's choice:** No UI changes — card already renders npc.draft.powerStats when present.

**Notes:** Regression test to lock the conditional render will still land via the frontend Vitest file (specifics section of CONTEXT.md).

---

## Final Gate

**Question:** Ready for CONTEXT.md, or explore more gray areas?
**User's choice:** I'm ready for context.

## Claude's Discretion

- Frontend payload envelope implementation choice (attach `result.draft` on frontend vs replace with `characterDraftToScaffoldNpc` vs backend `toLegacyNpcDraft` change) — planner picks least-invasive surface.
- Supporting-tier prompt tuning for `enrichKnownIpWorldgenNpcDraft` — only if assessment quality audit shows degradation.
- Research cache reuse for supporting NPC enrichment — cost optimization path.
- Test file layout and wave structure — plan-checker concern.

## Deferred Ideas

- `backfill-powerstats.ts` script for legacy campaigns — future phase.
- On-load retroactive enrichment.
- UI "Enrich now" button on legacy NPC cards.
- Review UI empty-state redesign for missing stats.
- Creation-tier flip timing rework (pass tier through 4 character-ingestion routes).
- Supporting-tier aware prompt variant for enrichKnownIpWorldgenNpcDraft.
