---
phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem
plan: 09
subsystem: worldgen-routes
tags: [worldgen, research-artifact-v2, route-wiring, lore-extraction, sha256-evidence]

requires:
  - phase: 71-07
    provides: artifact-aware scaffold orchestration, regeneration, lore extraction, and sufficiency enrichment
  - phase: 71-08
    provides: verification gap report and GitNexus fallback pattern
provides:
  - artifact-only `/generate` and `/regenerate-section` route lanes when v2 researchArtifact exists
  - `/suggest-seed` researchArtifact schema acceptance and pass-through
  - `/save-edits` lore re-extraction with stored artifact-first context selection
  - SHA256 baseline and closeout comparison for evidence campaign config/state
affects: [worldgen, route-schemas, route-tests, campaign-evidence]

tech-stack:
  added: []
  patterns:
    - artifact lane wins over legacy ipContext/premiseDivergence/researchFrame
    - legacy research context loads only when no v2 artifact exists
    - read-shared SHA256 hashing for locked local SQLite evidence files

key-files:
  created:
    - .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-09-EVIDENCE-CAMPAIGN-HASHES.json
    - .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-09-SUMMARY.md
  modified:
    - backend/src/routes/schemas.ts
    - backend/src/routes/worldgen.ts
    - backend/src/routes/__tests__/worldgen.test.ts

key-decisions:
  - "When a v2 worldgen research artifact exists, routes do not load, save, or forward legacy semantic research context for that request."
  - "Save-edits uses stored campaign research context for lore extraction: artifact first, legacy context only when no artifact exists."
  - "Evidence campaign preservation uses SHA256 comparison because campaigns/ is gitignored; git diff is supplemental only."

patterns-established:
  - "Route handlers choose exactly one research lane before calling downstream prompt/generation consumers."
  - "Tests assert negative calls on legacy loaders/savers when the artifact lane owns the request."

requirements-completed: [P71-R4, P71-R5]
duration: 7 min
completed: 2026-04-26
---

# Phase 71 Plan 09: Artifact Route Boundary Summary

**Worldgen route handoff now keeps v2 research artifacts authoritative across generate, regenerate, suggest-seed, and save-edits without mixing legacy semantic context.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-26T12:43:59Z
- **Completed:** 2026-04-26T12:50:29Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added RED route regressions for all three verifier gaps: artifact-only generate/regenerate lanes, suggest-seed artifact pass-through, and save-edits lore context selection.
- Added `researchArtifact` to `suggestSeedSchema` and passed it through to `suggestSingleSeed`.
- Reordered `/generate` and `/regenerate-section` orchestration so stored/body artifacts win before legacy `ipContext`, `premiseDivergence`, or `researchFrame` can be loaded, saved, or forwarded.
- Updated `/save-edits` to load stored `worldgenResearchArtifact` first and pass either artifact context or legacy context into `extractLoreCards`.
- Created `71-09-EVIDENCE-CAMPAIGN-HASHES.json` and verified evidence campaign config/state hashes still match.

## Task Commits

1. **Task 1: Lock route regressions for artifact lane isolation** - `15b7d29` (test)
2. **Task 2: Implement artifact-first route and schema wiring** - `5de84fd` (fix)
3. **Task 3: Run focused closeout and write 71-09 summary** - pending metadata commit

## Files Created/Modified

- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-09-EVIDENCE-CAMPAIGN-HASHES.json` - Pre-edit SHA256 baseline for the ignored evidence campaign config/state files.
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-09-SUMMARY.md` - This closeout summary.
- `backend/src/routes/__tests__/worldgen.test.ts` - Route-level regressions for artifact lane isolation, suggest-seed artifact pass-through, and save-edits lore context.
- `backend/src/routes/schemas.ts` - `suggestSeedSchema` now accepts the bounded v2 research artifact payload.
- `backend/src/routes/worldgen.ts` - Generate/regenerate/save-edits route orchestration now selects artifact or legacy context without mixing lanes.

## Verification

- **RED route suite:** `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts` failed before implementation with 6 expected failures across the three verification gaps.
- **Focused route suite:** `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts` passed: 1 file, 59 tests.
- **Closeout route + adjacent tests:** `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts` passed: 4 files, 100 tests.
- **Backend typecheck:** `npm --prefix backend run typecheck` passed.
- **Evidence hash closeout:** read-shared SHA256 comparison matched both baseline entries in `71-09-EVIDENCE-CAMPAIGN-HASHES.json`.
- **Supplemental evidence diff:** `git diff -- campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/config.json campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/state.db` produced no output.
- **GitNexus:** `npx gitnexus status` was up to date before edits at `733cfdf`; API impact for `backend/src/routes/worldgen.ts` was LOW; symbol impacts for `suggestSingleSeed`, `generateWorldScaffold`, `extractLoreCards`, and `resolvePremiseDivergence` were LOW. `suggestSeedSchema` and route files were not indexed as direct impact targets, so file/API impact plus focused route tests were used as planned fallback evidence. `gitnexus_detect_changes({scope: "staged"})` returned LOW risk before both task commits. After task commits, `npx gitnexus analyze` completed and `npx gitnexus status` reported up to date at `5de84fd`.

## Decisions Made

- Artifact-backed requests do not persist incoming legacy `ipContext` or `premiseDivergence`; the legacy fields remain stored but ignored for that request lane.
- Stored artifact lookup happens before legacy context lookup on generate/regenerate so old cached context cannot silently influence v2 artifact-backed flow.
- Save-edits lore extraction mirrors the same lane rule: pass artifact as the eighth `extractLoreCards` argument when present; otherwise pass legacy `ipContext` and `premiseDivergence`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hashed locked SQLite evidence file with read-shared access**
- **Found during:** Task 1 baseline creation and Task 3 closeout hash comparison.
- **Issue:** `Get-FileHash` could not read `campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/state.db` because another process held the SQLite file open.
- **Fix:** Used a read-only .NET `FileStream` with `FileShare.ReadWrite` to compute SHA256 without writing or unlocking the database.
- **Files modified:** `71-09-EVIDENCE-CAMPAIGN-HASHES.json` during baseline creation.
- **Verification:** Read-shared closeout comparison matched both baseline hashes; supplemental campaign git diff remained empty.
- **Committed in:** `15b7d29`

---

**Total deviations:** 1 auto-fixed Rule 3 issue.
**Impact on plan:** No scope expansion. The fallback preserved the required hash comparison without touching campaign data.

## Issues Encountered

- Exact `Get-FileHash` closeout command failed on locked `state.db`; read-shared SHA256 comparison proved the file content matched the pre-edit baseline.
- GitNexus `analyze` emitted non-blocking Node `MaxListenersExceededWarning` warnings but exited successfully.
- Existing unrelated dirty files remained in the worktree and were not staged or committed.

## Known Stubs

None. Stub-pattern scan hits were existing route locals initialized to `null` and schema/test empty-string checks, not user-facing placeholders or unwired mock data.

## Threat Flags

None. This plan changed existing worldgen route payload/context selection only; it introduced no new endpoint, auth path, schema trust boundary beyond the planned `researchArtifact` field, network call, repair path, or migration behavior.

## User Setup Required

None.

## Next Phase Readiness

Phase 71 gap closure is ready for verifier re-check of P71-R4/P71-R5. No evidence campaign repair or migration command was run.

## Self-Check: PASSED

- `71-09-SUMMARY.md` exists.
- `71-09-EVIDENCE-CAMPAIGN-HASHES.json` exists.
- Task commit `15b7d29` exists in git history.
- Task commit `5de84fd` exists in git history.
- Plan-scope route/schema/test files exist.

---
*Phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem*
*Completed: 2026-04-26*
