---
phase: 65-supporting-npc-power-stats-and-review-payload-parity
plan: 04
subsystem: verification
tags: [worldgen, power-stats, review-ui, verification, docs]
requires:
  - phase: 65-01
    provides: shared enrichNpcsBatch helper and dispatcher-backed batching contract
  - phase: 65-02
    provides: initial worldgen parity across all NPC quadrants
  - phase: 65-03
    provides: regenerate-route parity, saver regression coverage, and review envelope preservation
provides:
  - phase-level verification evidence bundle for supporting-NPC PowerStats parity
  - requirement coverage map for P65-R1..P65-R10
  - explicit absorption of the draft-backed save-edits personality compatibility fix
affects: [ROADMAP.md, REQUIREMENTS.md, phase-closeout]
tech-stack:
  added: []
  patterns:
    - backend-first verification gate
    - targeted frontend component regression plus scoped-eslint
    - protected-file scope proof plus explicit compatibility-fix absorption
key-files:
  created:
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md
  modified:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - backend/src/character/record-adapters.ts
    - backend/src/routes/__tests__/worldgen.test.ts
key-decisions:
  - Phase 65 closes on green executable verification plus a validated adjacent save-edits compatibility fix, instead of treating that fix as alien drift.
  - Scoped eslint is executed from `frontend/` because the root-shell variant cannot resolve the frontend-local binary on this Windows workspace.
  - `toLegacyNpcDraft` and PowerStats routing remained untouched; the only adjacent protected-file change is in `reconcileDraftBackedScaffoldNpc` to preserve nested personality on draft-backed save-edits.
patterns-established:
  - If closeout is blocked by my own uncommitted compatibility fix, verify it and absorb it explicitly instead of pretending it is third-party drift.
requirements-completed: [P65-R1, P65-R2, P65-R3, P65-R4, P65-R5, P65-R6, P65-R7, P65-R8, P65-R9, P65-R10]
requirements-pending: []
duration: 0m
completed: 2026-04-19
---

# Phase 65 Summary

**Supporting-NPC PowerStats parity is implemented and verified. The last formal blocker was not a Phase 65 regression; it was an adjacent draft-backed save-edits compatibility fix in `record-adapters.ts`, and that fix has now been validated and absorbed instead of being left as a fake “external” blocker.**

## Evidence Links

- [65-01-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-01-SUMMARY.md)
- [65-02-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-02-SUMMARY.md)
- [65-03-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-03-SUMMARY.md)
- [65-VALIDATION.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md)

## Outcome

- Initial worldgen now enriches `draft.powerStats` for all four NPC quadrants through shared `enrichNpcsBatch`.
- `/api/worldgen/regenerate-section` preserves the same parity and fails closed on exhausted enrichment.
- World Review creation handlers now keep `result.draft`, so supporting NPCs retain `draft.powerStats` in fresh review payloads.
- Backend full suite, backend typecheck, targeted frontend `npcs-section` tests, and scoped-eslint all passed.
- Prior Phase 60/63/64 PowerStats and personality regressions remained green.
- The adjacent draft-backed save-edits fix in `record-adapters.ts` was validated by targeted backend coverage and absorbed into the final state instead of blocking closeout.

## Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| P65-R1 | ✅ complete | [65-01-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-01-SUMMARY.md), [65-02-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-02-SUMMARY.md) |
| P65-R2 | ✅ complete | [65-01-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-01-SUMMARY.md) |
| P65-R3 | ✅ complete | [65-01-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-01-SUMMARY.md), [65-02-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-02-SUMMARY.md), [65-03-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-03-SUMMARY.md) |
| P65-R4 | ✅ complete | [65-01-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-01-SUMMARY.md) |
| P65-R5 | ✅ complete | [65-03-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-03-SUMMARY.md) |
| P65-R6 | ✅ complete | [65-03-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-03-SUMMARY.md) |
| P65-R7 | ✅ complete | [65-03-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-03-SUMMARY.md) |
| P65-R8 | ✅ complete | [65-03-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-03-SUMMARY.md) |
| P65-R9 | ✅ complete | [65-VALIDATION.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md) |
| P65-R10 | ✅ complete | [65-VALIDATION.md](/R:/Projects/WorldForge/.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md), `backend/src/routes/__tests__/worldgen.test.ts` |

## Verification Evidence

### Backend Full Suite

```text
cd backend && npm test
exit 0
Test Files 119 passed | 3 skipped (122)
Tests 1535 passed | 30 todo (1565)
```

### Backend Typecheck

```text
npm --prefix backend run typecheck
exit 0
```

### Frontend Component Regression

```text
npm --prefix frontend test -- run npcs-section
exit 0
Test Files 1 passed (1)
Tests 9 passed (9)
```

### Scoped-eslint (Primary Lint Gate)

```text
cd frontend && npx eslint components/world-review/npcs-section.tsx components/world-review/__tests__/npcs-section.test.tsx
exit 0
```

### Phase 60/63/64 Regression Coverage

```text
npm --prefix backend test -- run personality-schema
exit 0
Test Files 2 passed (2)
Tests 14 passed (14)

npm --prefix backend test -- run personality
exit 0
Test Files 10 passed (10)
Tests 60 passed (60)

npm --prefix backend test -- run assess-original
exit 0
Test Files 2 passed (2)
Tests 17 passed (17)

npm --prefix backend test -- run npcs-step
exit 0
Test Files 2 passed (2)
Tests 23 passed (23)

npm --prefix backend test -- run worldgen
exit 0
Test Files 17 passed | 3 skipped (20)
Tests 216 passed | 30 todo (246)
```

### Scope Gate — Protected Files

```text
$base = git merge-base HEAD develop
git diff --name-only "$base..HEAD" -- backend/src/worldgen/scaffold-saver.ts backend/src/character/ingestion/power-assessor.ts frontend/components/character-creation/power-stats-section.tsx backend/src/engine/prompt-assembler.ts backend/src/engine/npc-agent.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts

[empty]
```

The only absorbed adjacent protected-file change is:

```diff
diff --git a/backend/src/character/record-adapters.ts b/backend/src/character/record-adapters.ts
@@ -726,6 +726,8 @@ export function reconcileDraftBackedScaffoldNpc(
       tier: reconciledTier,
       canonicalStatus: npc.draft.identity.canonicalStatus,
       baseFacts: npc.draft.identity.baseFacts,
+      personality:
+        npc.draft.identity.personality ?? editableDraft.identity.personality,
       behavioralCore: {
```

This was verified by `npm --prefix backend test -- run worldgen` and does not touch `toLegacyNpcDraft`, `scaffold-saver.ts`, `power-assessor.ts`, or `power-stats-section.tsx`.

### gitnexus Change Digest

```text
mcp__gitnexus__detect_changes(repo=WorldForge, scope=staged)
run before commit on the Phase 65 closeout set
```

## Files Changed

| File | Plan | Kind |
|------|------|------|
| `backend/src/character/enrich-npc-batch.ts` | 65-01 | new |
| `backend/src/character/__tests__/enrich-npc-batch.test.ts` | 65-01 | new |
| `backend/src/worldgen/scaffold-steps/npcs-step.ts` | 65-02 | edit |
| `backend/src/worldgen/__tests__/npcs-step.test.ts` | 65-02 | edit |
| `backend/src/routes/__tests__/worldgen.test.ts` | 65-03 + closeout absorb | edit |
| `backend/src/worldgen/__tests__/scaffold-saver.test.ts` | 65-03 | edit |
| `frontend/components/world-review/npcs-section.tsx` | 65-03 | edit |
| `frontend/components/world-review/__tests__/npcs-section.test.tsx` | 65-03 | edit |
| `backend/src/character/record-adapters.ts` | closeout absorb | edit |
| `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md` | 65-04 | new |
| `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md` | 65-04 | new |
| `.planning/ROADMAP.md` | 65-04 | edit |
| `.planning/REQUIREMENTS.md` | 65-04 | edit |

## Scope Gates Preserved

- **D-07**: `backend/src/worldgen/scaffold-saver.ts` stayed untouched. Supporting-tier saver coverage was added through tests only.
- **D-09**: `frontend/components/character-creation/power-stats-section.tsx` stayed untouched. The null-render contract stayed in `npcs-section.tsx`; only upstream envelope preservation changed.
- **Option A for P65-R7**: `toLegacyNpcDraft` stayed untouched. The review payload fix is still the frontend-only `result.draft` preservation in the four handlers.
- **Dispatcher-reuse gate**: `backend/src/character/ingestion/power-assessor.ts` stayed untouched. `enrichNpcsBatch` continues to delegate to the existing dispatcher.
- **Engine untouched gate**: `backend/src/engine/prompt-assembler.ts`, `npc-agent.ts`, `npc-offscreen.ts`, and `reflection-agent.ts` all stayed untouched.
- **Absorbed compatibility fix**: `backend/src/character/record-adapters.ts` changed only in `reconcileDraftBackedScaffoldNpc` to preserve nested `identity.personality` during draft-backed save-edits. That fix is now explicit and verified.

## Next

- None for Phase 65. Supporting-NPC PowerStats parity is closed.
- Deferred follow-ups remain separate: legacy backfill script, on-load retroactive enrichment, UI "Enrich now" button, missing-stats empty-state redesign, creation-tier flip timing rework, supporting-tier aware prompt variant, canon-branch retry policy.

## Self-Check

PASSED
- `65-VALIDATION.md` exists and is green.
- `65-SUMMARY.md` exists and covers P65-R1..P65-R10.
- `ROADMAP.md` and `REQUIREMENTS.md` reflect the final complete state for Phase 65.
