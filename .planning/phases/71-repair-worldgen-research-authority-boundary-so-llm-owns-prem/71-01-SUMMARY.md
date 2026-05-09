---
phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem
plan: 01
subsystem: worldgen
tags: [worldgen, research-artifact, zod, shared-types, prompt-boundary]

requires:
  - phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem
    provides: Phase context, research, validation, and Wave 0 contract requirements
provides:
  - Versioned WorldgenResearchArtifactV2 shared contract
  - Backend Zod parser, mechanical normalizer, and bounded prompt formatter
  - Reusable JJK world-basis plus Naruto power-overlay regression fixture
affects: [worldgen-research, known-ip-generation, campaign-config-persistence, prompt-formatting]

tech-stack:
  added: []
  patterns:
    - Shared persisted/API artifact type in @worldforge/shared
    - Zod schema enforces caps while preserving LLM-authored semantic roles
    - Prompt formatter quotes raw premise and search data as bounded context

key-files:
  created:
    - .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-PHASE-START.txt
    - backend/src/worldgen/research-artifact.ts
    - backend/src/worldgen/__tests__/fixtures/jjk-naruto-artifact.ts
    - backend/src/worldgen/__tests__/research-artifact.test.ts
  modified:
    - shared/src/types.ts
    - shared/src/index.ts
    - backend/src/worldgen/index.ts

key-decisions:
  - "WorldgenResearchUse remains a capped string instead of a backend-owned enum, so unknown LLM-authored use labels remain artifact data."
  - "The formatter renders approved/generated research context and source usage rules without declaring a canonical subject."
  - "Shared dist is generated locally for typecheck but not committed because shared/dist is gitignored."

patterns-established:
  - "Research artifacts preserve LLM-authored source roles and use labels exactly apart from mechanical trimming/deduping."
  - "Forbidden canonical-subject wording is guarded by regression tests and a literal scan."

requirements-completed: [P71-R1, P71-R3]

duration: 8 min
completed: 2026-04-26
---

# Phase 71 Plan 01: Research Artifact Contract Summary

**Versioned worldgen research artifact with shared types, Zod validation, bounded formatting, and mixed-premise source-role regressions.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-26T06:22:12Z
- **Completed:** 2026-04-26T06:30:07Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added `WorldgenResearchArtifactV2` and supporting shared types for raw premise, LLM-authored source usage rules, search jobs/results, generated context, and provenance.
- Added `backend/src/worldgen/research-artifact.ts` with Zod caps, mechanical normalization, parser, and formatter.
- Locked Wave 0 behavior with a reusable JJK/Naruto fixture and 13 focused Vitest cases covering caps, prompt-injection-as-data, unknown use labels, source roles, and forbidden wording.

## Task Commits

1. **Task 0: Record Phase 71 start anchor** - `f088093` (docs)
2. **Task 1 RED: Create artifact schema and formatter regressions** - `196dd98` (test)
3. **Task 2 GREEN: Implement shared v2 artifact type, schema, and formatter** - `9cd64b3` (feat)

## Files Created/Modified

- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-PHASE-START.txt` - compare-mode anchor set to pre-source-edit commit `2d4081336fc97d379334a638f3f6bf868002be92`.
- `shared/src/types.ts` - added `WorldgenResearchArtifactV2` and supporting source-role/search/provenance types.
- `shared/src/index.ts` - exported new shared artifact types.
- `backend/src/worldgen/research-artifact.ts` - added schema, parser, mechanical normalizer, and formatter.
- `backend/src/worldgen/index.ts` - exported artifact helpers.
- `backend/src/worldgen/__tests__/fixtures/jjk-naruto-artifact.ts` - added reusable mixed-premise fixture and invalid builders.
- `backend/src/worldgen/__tests__/research-artifact.test.ts` - added Wave 0 artifact tests.

## Decisions Made

- `WorldgenResearchUse` is a capped string, not a closed backend enum, matching the plan boundary that backend should not reject unknown LLM-authored semantic labels.
- Formatter uses quoted raw premise/search/generated data and source usage rules, avoiding backend-owned canonical-subject language.
- Existing high-risk `buildIpContextBlock` path was not modified in this plan; later plans can migrate consumers to the new additive formatter.

## Verification

- `npm --prefix shared run build` - passed.
- `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts` - passed, 13 tests.
- `npm --prefix backend run typecheck` - passed.
- Forbidden text scan over `backend/src/worldgen/research-artifact.ts` and `backend/src/worldgen/__tests__/research-artifact.test.ts` - no matches.
- `npx gitnexus status` - up to date at `9cd64b3`.
- GitNexus impact: `IpResearchContext` LOW risk, 0 impacted; `buildIpContextBlock` HIGH risk but untouched; `parseWorldgenResearchArtifact` LOW risk with formatter as only direct caller; `formatWorldgenResearchArtifactBlock` LOW risk, 0 impacted.
- Evidence campaign config `campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/config.json` - unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built shared package before backend typecheck**
- **Found during:** Task 2
- **Issue:** Backend `tsc` resolves `@worldforge/shared` through generated `shared/dist` declarations; after changing shared source, typecheck saw stale exported types.
- **Fix:** Ran `npm --prefix shared run build`; `shared/dist` is gitignored and was not staged.
- **Files modified:** none committed beyond planned source files
- **Verification:** `npm --prefix backend run typecheck` passed after rebuild.
- **Committed in:** `9cd64b3`

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** No scope expansion. The fix was an environment/build prerequisite for planned shared type changes.

## Issues Encountered

- Initial Task 0 PowerShell command quoting failed before writing a valid anchor; reran the same action directly in the active PowerShell shell and verified the 40-character hash.
- GitNexus MCP resources/tools were unavailable in this Codex runtime, and the CLI exposes `impact/context/status/analyze` but not `detect_changes`. Scope was verified with GitNexus CLI impact/status plus explicit staged file checks instead.

## Known Stubs

None.

## Threat Flags

None - new trust-boundary surface is the planned artifact parser/formatter and is covered by the plan threat model.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `71-02`: persistence can store/read `WorldgenResearchArtifactV2` using the shared contract and backend parser added here.

## Self-Check: PASSED

- Created/modified files listed in this summary exist.
- Task commits `f088093`, `196dd98`, and `9cd64b3` exist in git history.
- Summary evidence includes requirements `P71-R1` and `P71-R3`, verification commands, and next-plan readiness.

---
*Phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem*
*Completed: 2026-04-26*
