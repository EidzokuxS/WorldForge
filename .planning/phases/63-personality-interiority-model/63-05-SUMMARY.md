---
phase: 63-personality-interiority-model
plan: 05
subsystem: character
tags: [personality, backfill, sqlite, vitest, scripts, gitnexus]
requires:
  - phase: 63-01
    provides: personality types, normalization defaults, and scripts directory foundation
  - phase: 63-03
    provides: runtime consumers that read identity.personality and liveDynamics.attachments
provides:
  - one-shot personality backfill script for legacy player and NPC records
  - real SQLite integration coverage for dry-run, retry, backup, changed-record, and sentinel behavior
  - npm entrypoint for operator backfill runs
affects: [63-06-verification, campaign-migration, personality-runtime]
tech-stack:
  added: []
  patterns:
    - per-campaign connectDb/getDb/closeDb loop for one-shot scripts
    - side-effect-free dry-run with pre-write backup gating
    - re-read-before-write guard around long-running structured generation
key-files:
  created:
    - backend/src/scripts/backfill-personality.ts
  modified:
    - backend/src/scripts/__tests__/backfill-personality.test.ts
    - backend/package.json
    - backend/src/character/ingestion/types.ts
key-decisions:
  - "The backfill runs sequentially per campaign, opens each state.db explicitly, and only parallelizes row-level generation work inside a campaign batch."
  - "The script records changed-during-run rows separately and treats them as a non-zero exit condition instead of risking stale overwrites."
  - "The retry stage union was extended to include backfill so the script can use withPipelineRetry without type casts."
patterns-established:
  - "Backfill scripts should use campaign path helpers plus per-campaign DB connect/close boundaries instead of assuming a global singleton."
  - "Legacy migration writes are backup-first, config-sentinel-last, and skip entirely in dry-run mode."
requirements-completed: [P63-R6]
duration: 8m
completed: 2026-04-18
---

# Phase 63 Plan 05: Backfill Summary

**Legacy personality migration script with retry, backup, changed-record protection, attachment carry-forward, and a real SQLite integration suite**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-18T19:39:33+03:00
- **Completed:** 2026-04-18T19:47:45+03:00
- **Tasks:** 5
- **Files modified:** 4

## Accomplishments
- Added `backend/src/scripts/backfill-personality.ts` with CLI parsing, per-campaign DB loops, `withPipelineRetry("backfill", ...)`, dry-run gating, re-read-before-write protection, backup writes, attachment carry-forward, and config sentinel writes.
- Landed an 8-case Vitest suite that exercises the script end-to-end against a real SQLite database while mocking the AI boundary and logger surface.
- Wired `npm --prefix backend run backfill:personality -- ...` for operator use without adding any new dependencies.

## GitNexus Impact Digest

- Task 1 API-surface verification confirmed:
  - `connectDb(dbPath: string)` at `backend/src/db/index.ts:7`
  - `getDb()` at `backend/src/db/index.ts:21`
  - `closeDb()` at `backend/src/db/index.ts:35`
  - `createModel` re-export in `backend/src/ai/index.ts:1` backed by `backend/src/ai/provider-registry.ts:102`
  - `resolveRoleModel(role, providers)` at `backend/src/ai/resolve-role-model.ts:27`
  - synchronous `loadSettings()` at `backend/src/settings/manager.ts:314`
  - `withPipelineRetry(...)` at `backend/src/character/ingestion/retry.ts:6`
  - `runWithTurnContext(...)` at `backend/src/lib/logger-context.ts:29`
  - campaign path helpers at `backend/src/campaign/paths.ts:15`, `:25`, and `:30`
- Pre-edit blast radius remained `LOW` on the only existing helpers touched indirectly:
  - `withPipelineRetry` upstream risk `LOW`, no direct callers reported by GitNexus for the planned change shape
  - `getCampaignsDir` upstream risk `LOW`, direct dependency chain limited to campaign path helpers and `createCampaign` / `loadCampaign`
  - `createLogger` upstream risk `LOW`
- Final `gitnexus_detect_changes({scope: "all"})` reported `risk_level: low`, `changed_files: 13`, `changed_symbols: 0`, `affected_processes: 0`. The dirty worktree contained unrelated files, so manual file scoping remained the source of truth for this plan.

## Verification

- `npm --prefix backend test -- run "backfill-personality"` ✅
- `npm --prefix backend run typecheck` ✅
- `node -e "const pkg = require('./backend/package.json'); console.log(pkg.scripts['backfill:personality'])"` ✅
- `rg -n "OpenRouter|openrouter" backend/src/scripts/backfill-personality.ts backend/src/scripts/__tests__/backfill-personality.test.ts` ✅ no matches
- Real-campaign execution remains deferred to `63-06`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pre-task gitnexus verification of imports + APIs** - `e237278` (`chore`)
2. **Task 2: backfill-personality.ts implementation with all REVIEWS fixes** - `f0e3175` (`feat`)
3. **Task 3: Vitest integration test covering all REVIEWS behavior contracts** - `76985e6`, `06b951d` (`test`, `test`)
4. **Task 4: backend/package.json npm script wiring** - `4d299a9` (`chore`)
5. **Task 5: Post-task verification** - `a1524ae` (`chore`)

## Files Created/Modified

- `backend/src/scripts/backfill-personality.ts` - Implements the one-shot backfill runner with correct DB/API wiring, retry, backups, dry-run gating, changed-record skips, attachment carry-forward, and config sentinel writes.
- `backend/src/scripts/__tests__/backfill-personality.test.ts` - Covers dry-run safety, real writes, idempotency, attachment migration, provider failure isolation, retry recovery, changed-record detection, and turn-correlated logs.
- `backend/package.json` - Adds the `backfill:personality` npm script.
- `backend/src/character/ingestion/types.ts` - Extends the retry stage union with `backfill` so the script can use the shared pipeline retry helper without a cast.

## Decisions Made

- Used the existing campaign path helpers instead of inventing a script-local path resolver so the backfill follows the same `GSD_CAMPAIGNS_ROOT` override behavior as the rest of the backend.
- Counted changed-during-run rows separately from hard failures but still rolled them into the process exit code to fail closed on concurrent edits.
- Kept the test harness on real SQLite + migrations and mocked only the AI/settings/logger boundaries; that gives stronger behavioral coverage than a fake Drizzle implementation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended the ingestion retry stage union with `backfill`**
- **Found during:** Task 2 (backfill-personality.ts implementation with all REVIEWS fixes)
- **Issue:** `withPipelineRetry` is typed against `IngestionStage`, and the existing union did not include the plan-mandated `"backfill"` label.
- **Fix:** Added `"backfill"` to `backend/src/character/ingestion/types.ts` and used the shared helper directly instead of introducing a cast or local retry wrapper.
- **Files modified:** `backend/src/character/ingestion/types.ts`, `backend/src/scripts/backfill-personality.ts`
- **Verification:** `npm --prefix backend run typecheck`; `npm --prefix backend test -- run "backfill-personality"`
- **Committed in:** `f0e3175`

**2. [Rule 3 - Blocking] Corrected the integration harness to mirror the real script import surface**
- **Found during:** Task 3 (Vitest integration test covering all REVIEWS behavior contracts)
- **Issue:** The first green test pass exposed two harness bugs: the mock for `../../lib/index.js` omitted `runWithTurnContext`, and the helper readers used an invalid Drizzle `where(...)` callback shape.
- **Fix:** Exported `runWithTurnContext` from the mocked barrel, switched helper reads to `where(eq(...))`, and used a separate raw SQLite connection for the concurrent-write simulation so the script's singleton DB connection stayed intact.
- **Files modified:** `backend/src/scripts/__tests__/backfill-personality.test.ts`
- **Verification:** `npm --prefix backend test -- run "backfill-personality"`
- **Committed in:** `06b951d`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were required for the planned implementation to compile and for the promised integration coverage to exercise the real runtime path. No scope creep beyond the backfill contract.

## Issues Encountered

- The exact verification command from the plan resolves to `vitest run run backfill-personality` because `backend/package.json` already defines `test` as `vitest run`. It still executes the intended suite on this setup.
- Windows-safe backup filenames required replacing `:` in the ISO timestamp when constructing the backup file path; the script still writes a real ISO string to `config.json` for `backfilledAt`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase `63-06` can now perform the real-campaign operator run and collect evidence on top of a tested script path.
- Runtime consumers from `63-03` now have a durable migration tool for legacy campaigns instead of relying on read-time fallbacks alone.

## Known Stubs

None.

---
*Phase: 63-personality-interiority-model*
*Completed: 2026-04-18*

## Self-Check: PASSED

- FOUND: `.planning/phases/63-personality-interiority-model/63-05-SUMMARY.md`
- FOUND: `e237278`
- FOUND: `76985e6`
- FOUND: `f0e3175`
- FOUND: `06b951d`
- FOUND: `4d299a9`
- FOUND: `a1524ae`
