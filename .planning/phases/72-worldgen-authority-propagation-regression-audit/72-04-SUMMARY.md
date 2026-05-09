---
phase: 72-worldgen-authority-propagation-regression-audit
plan: 04
subsystem: frontend-worldgen-authority
tags: [worldgen, research-artifact, frontend, review, ingestion-audit]

requires:
  - phase: 72-worldgen-authority-propagation-regression-audit
    provides: "72-01 authority inventory and 72-02 nullable artifact route semantics"
provides:
  - "Frontend API and wizard transport for backend-returned WorldgenResearchArtifactV2"
  - "Known-IP NPC draft identity regression coverage"
  - "Generic ingestion adjacency Explicit Deferral"
affects: [phase-72, frontend-api, campaign-wizard, world-review, character-ingestion]

tech-stack:
  added: []
  patterns:
    - "Non-null researchArtifact is serialized explicitly; null/absent artifact is omitted from frontend request bodies."
    - "Review conversion tests assert canonicalStatus rather than inferring identity from top-level NPC fields."

key-files:
  created:
    - ".planning/phases/72-worldgen-authority-propagation-regression-audit/72-GENERIC-INGESTION-ADJACENCY.md"
  modified:
    - "frontend/lib/api.ts"
    - "frontend/lib/__tests__/api.test.ts"
    - "frontend/components/title/use-new-campaign-wizard.ts"
    - "frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx"
    - "frontend/lib/character-drafts.ts"
    - "frontend/lib/__tests__/character-drafts.test.ts"

key-decisions:
  - "Frontend stores the backend-returned `_researchArtifact` and sends it to `/suggest-seed` and `/generate`; backend fallback remains compatibility only."
  - "Generic character ingestion is explicitly deferred because no artifact-backed worldgen caller reaches `ingestCharacterDraft` in this plan's scan."
  - "Known-IP draft preservation already existed at runtime; Phase 72 locks it with regression tests and fixes owned draft normalization type gaps."

patterns-established:
  - "Artifact request serialization is additive and omits `researchArtifact` when the client has no non-null artifact."
  - "Generic ingestion artifact work requires a separate requirement with an explicit caller chain."

requirements-completed: [P72-R6, P72-R7, P72-R4]

duration: 11 min
completed: 2026-04-26
---

# Phase 72 Plan 04: Frontend Artifact Transport and Review Identity Summary

**Worldgen research artifacts now survive the frontend wizard path into seed rerolls and generation, while known-IP review identity is locked by regression tests and generic ingestion is explicitly deferred.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-26T18:59:42Z
- **Completed:** 2026-04-26T19:10:09Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added API and wizard regressions that fail if `_researchArtifact` is dropped before single-category reroll or world generation.
- Updated frontend API helpers and wizard state to carry `WorldgenResearchArtifactV2` and omit `researchArtifact` when no artifact exists.
- Added known-IP NPC draft preservation tests and kept `createEmptyNpcDraft` default-original behavior intact.
- Recorded generic ingestion as `Explicit Deferral` with scan evidence and no backend ingestion production changes.

## Task Commits

1. **Task 1 RED:** `6a7be7b` test(72-04): add failing artifact transport regressions
2. **Task 1 GREEN:** `a714e4e` feat(72-04): transport worldgen research artifacts in frontend
3. **Task 2 regression tests:** `ac964e3` test(72-04): lock known-ip draft identity regression
4. **Task 2 normalization fix:** `5d7c8be` fix(72-04): normalize draft live dynamics safely
5. **Task 3 disposition:** `3c400ec` docs(72-04): record generic ingestion adjacency disposition

## Files Created/Modified

- `frontend/lib/api.ts` - Adds `WorldgenResearchArtifactV2` to suggest/generate API surfaces and serializes non-null artifacts.
- `frontend/lib/__tests__/api.test.ts` - Covers `suggestSeed` and `generateWorld` request body artifact inclusion/omission.
- `frontend/components/title/use-new-campaign-wizard.ts` - Stores returned `_researchArtifact` and passes it to reroll/generation.
- `frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx` - Covers wizard artifact propagation through reroll and generation.
- `frontend/lib/character-drafts.ts` - Populates required `liveDynamics.attachments` and guards optional traits/flaws during normalization.
- `frontend/lib/__tests__/character-drafts.test.ts` - Covers known-IP canonical identity preservation and empty draft original defaults.
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-GENERIC-INGESTION-ADJACENCY.md` - Records generic ingestion adjacency disposition.

## Verification Results

- PASS: `npm --prefix frontend run test -- --run lib/__tests__/api.test.ts components/title/__tests__/use-new-campaign-wizard.test.tsx` - 36 tests passed.
- PASS: `npm --prefix frontend run test -- --run lib/__tests__/character-drafts.test.ts components/world-review/__tests__/npcs-section.test.tsx` - 18 tests passed.
- PASS: `npm --prefix frontend run test -- --run lib/__tests__/api.test.ts components/title/__tests__/use-new-campaign-wizard.test.tsx lib/__tests__/character-drafts.test.ts components/world-review/__tests__/npcs-section.test.tsx` - 54 tests passed.
- PASS: Task 3 disposition PowerShell check found exactly one path: `Explicit Deferral`.
- PASS: `npm --prefix backend run test -- src/character/ingestion/__tests__/classifier.test.ts src/character/ingestion/__tests__/pipeline.test.ts` - 16 tests passed.
- FAIL, out of scope: `npm --prefix frontend run typecheck` still fails in unowned `frontend/lib/v2-card-parser.ts:44` with `Property 'mes_example' does not exist on type '{}'`. Owned `frontend/lib/character-drafts.ts` type errors were fixed.

## GitNexus Evidence

- Impact before Task 1 production edit:
  - `suggestSeeds`: HIGH, direct callers `handleNextToDna`, `handleResuggestAll`; affected flows NewCampaignDialog, CampaignConceptPage, DnaWorkspace.
  - `suggestSeed`: LOW, direct caller `handleResuggestCategory`.
  - `generateWorld`: LOW, direct caller `tryGenerateWorld`.
- Impact before Task 2 production edit:
  - `scaffoldNpcToDraft`: LOW, direct callers `normalizeCharacterResult`, `NpcsSection`.
  - Additional owned normalization symbols: `normalizeCharacterDraft`, `buildDerivedTagsFromDraft`, and `characterDraftToScaffoldNpc` reported CRITICAL upstream impact, so edits were limited to type-safe normalization defaults.
- `gitnexus_detect_changes({scope:"staged"})` ran before each commit:
  - RED tests: low, 2 changed files, no indexed symbol changes.
  - Task 1 GREEN: high, expected frontend wizard/API flows only.
  - Task 2 tests: low, 1 changed test file.
  - Task 2 fix: medium, `normalizeCharacterDraft`, `buildDerivedTagsFromDraft`, `parsedCharacterToDraft`, `scaffoldNpcToDraft`.
  - Task 3 note: low, docs only.

## Threat Coverage

- **Frontend `_researchArtifact` tampering/drop:** Tests now assert the wizard stores the backend-returned artifact and sends it through reroll and generation; API tests assert non-null artifact request serialization.
- **Client-submitted artifact spoofing boundary:** Frontend only preserves the artifact it receives; request-body artifacts remain backend-parsed and capped by existing route schemas.
- **Known-IP identity fallback tampering in `scaffoldNpcToDraft`:** Regression tests prove `known_ip_canonical` remains stable through `scaffoldNpcToDraft` and `characterDraftToScaffoldNpc(scaffoldNpcToDraft(npc))`; empty new NPC drafts still default to `original`.
- **Generic ingestion adjacency EoP disposition:** Explicit Deferral records that `ingestCharacterDraft` is reached from character routes with legacy `ipContext`/`premiseDivergence`, not from artifact-backed worldgen routes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Bug] Fresh Response instances for repeated API helper calls**
- **Found during:** Task 1 GREEN verification
- **Issue:** New API tests reused one `Response` object for two fetch calls, causing "Body is unusable: Body has already been read" after production code started passing.
- **Fix:** Changed the mock to return a fresh `Response` per fetch call.
- **Files modified:** `frontend/lib/__tests__/api.test.ts`
- **Verification:** Focused Task 1 frontend tests passed.
- **Committed in:** `a714e4e`

**2. [Rule 3 - Blocking] Owned draft normalization type gaps**
- **Found during:** Task 1/Task 2 typecheck
- **Issue:** `frontend/lib/character-drafts.ts` omitted required `liveDynamics.attachments` and treated optional traits/flaws as required arrays.
- **Fix:** Populated `liveDynamics.attachments`, added fallback arrays for optional traits/flaws, and preserved existing empty NPC default-original behavior.
- **Files modified:** `frontend/lib/character-drafts.ts`
- **Verification:** Task 2 tests passed; subsequent typecheck no longer reported `character-drafts.ts`.
- **Committed in:** `5d7c8be`

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking). **Impact:** Scoped to plan-owned tests/helpers; no backend ingestion production changes.

## TDD Gate Notes

- Task 1 RED failed as expected before production edits.
- Task 2 RED passed unexpectedly because the runtime known-IP canonical status behavior already existed. The tests were kept as regression locks; production changes in Task 2 were limited to owned type/normalization blockers exposed by verification.

## Issues Encountered

- `npm --prefix frontend run typecheck` remains blocked by unowned `frontend/lib/v2-card-parser.ts:44` (`mes_example` on `{}`). This file is outside the 72-04 owned file list, so it was not edited, staged, or committed.

## Known Stubs

None. Stub-pattern scan hits were normal parser buffers, null checks, and internal empty-array accumulators, not placeholder UI/data stubs.

## Threat Flags

None. No new backend endpoints, auth paths, file access patterns, or trust-boundary schema changes were introduced in this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 72-05 verification with one known caveat: frontend typecheck needs the pre-existing/unowned `frontend/lib/v2-card-parser.ts` issue resolved or explicitly waived by the owning plan.

## Self-Check: PASSED

- Verified all created/modified plan-owned files exist.
- Verified task commits exist: `6a7be7b`, `a714e4e`, `ac964e3`, `5d7c8be`, `3c400ec`.

---
*Phase: 72-worldgen-authority-propagation-regression-audit*
*Completed: 2026-04-26*
