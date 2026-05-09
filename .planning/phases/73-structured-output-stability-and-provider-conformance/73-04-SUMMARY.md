---
phase: 73-structured-output-stability-and-provider-conformance
plan: 04
subsystem: ai
tags: [structured-output, provider-conformance, vitest, tsx, gitnexus]

requires:
  - phase: 73-02
    provides: "safeGenerateObject native/text/repair strategy traces"
  - phase: 73-03
    provides: "semantic ScenePlan model-facing contract and backend-owned ID mapping"
provides:
  - "Non-mutating structured-output conformance runner keyed by provider/model/schema/mode"
  - "Representative conformance cases for generated context, semantic ScenePlan actions, metadata caps, tool enums, and ID/reference mapping"
  - "Environment-gated live provider CLI that reads settings.json only when explicitly enabled"
affects: [provider-conformance, safeGenerateObject, scene-plan, worldgen]

tech-stack:
  added: []
  patterns:
    - "Conformance reports include provider/model/protocol/schema/mode/strategy/latency/usage/error/repair/semantic pass-fail fields"
    - "Live provider conformance is opt-in through WORLDFORGE_LIVE_PROVIDER_CONFORMANCE=1 and defaults to skipped JSON"
    - "Conformance harnesses use read-only settings parsing and never import DB, campaign managers, routes, or runtime tool executors"

key-files:
  created:
    - backend/src/ai/structured-output-conformance.ts
    - backend/src/ai/__tests__/structured-output-conformance.test.ts
    - backend/src/scripts/structured-output-conformance.ts
    - .planning/phases/73-structured-output-stability-and-provider-conformance/73-04-SUMMARY.md
  modified:
    - backend/package.json

key-decisions:
  - "Conformance cases use representative local schemas/prompts and call safeGenerateObject, but do not import runtime tool executor or campaign mutation code."
  - "CLI live mode reads existing settings.json directly instead of settings/manager.ts so it cannot create, normalize, backup, or mutate settings files."
  - "CLI output omits raw prompts and apiKey fields; provider secrets are used only to create live model handles when live mode is explicitly enabled."

patterns-established:
  - "Use runStructuredOutputConformance({ providers, cases }) for deterministic mocked tests and optional live provider probes."
  - "Use npm --prefix backend run structured-output:conformance for a non-mutating local report; it skips unless WORLDFORGE_LIVE_PROVIDER_CONFORMANCE=1."

requirements-completed: [P73-R3, P73-R5, P73-R6, P73-R7]

duration: 12min
completed: 2026-04-27
---

# Phase 73 Plan 04: Provider Conformance Harness Summary

**Non-mutating structured-output conformance reports with mocked tests and opt-in live provider probing**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-27T21:42:27Z
- **Completed:** 2026-04-27T21:54:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `structured-output-conformance.ts` with report/result types, default representative cases, semantic checks, compact errors, latency, usage, strategy, repair, and semantic pass/fail reporting.
- Added mocked Vitest coverage for report shape, required case IDs, semantic failure behavior, forbidden import scanning, no-secret output, CLI gate behavior, and npm script wiring.
- Added `src/scripts/structured-output-conformance.ts`, a read-only live harness that exits skipped by default and only reads configured providers when `WORLDFORGE_LIVE_PROVIDER_CONFORMANCE=1`.
- Added backend npm script `structured-output:conformance`.

## Task Commits

1. **Task 1 RED:** `2beb7ca` (test) - add failing conformance harness tests.
2. **Task 1 GREEN:** `ba011e5` (feat) - add structured output conformance runner.
3. **Task 2 RED:** `e5f7762` (test) - add failing CLI conformance tests.
4. **Task 2 GREEN:** `a49aa52` (feat) - add live-gated conformance CLI.

**Plan metadata:** final docs commit - complete provider conformance harness plan.

## Files Created/Modified

- `backend/src/ai/structured-output-conformance.ts` - non-mutating provider/schema report runner and representative conformance cases.
- `backend/src/ai/__tests__/structured-output-conformance.test.ts` - mocked harness, no-secret, no-mutation, CLI gate, and npm script tests.
- `backend/src/scripts/structured-output-conformance.ts` - environment-gated live/local CLI harness with read-only `settings.json` parsing.
- `backend/package.json` - adds `structured-output:conformance` script.
- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-04-SUMMARY.md` - execution evidence.

## Decisions Made

- Kept conformance cases representative and local rather than importing tool executor-adjacent runtime schemas.
- Used direct `fs.readFileSync` JSON parsing in the CLI because `settings/manager.ts` can write defaults, backups, and normalized settings.
- Report rows carry only diagnostic metadata and compact error slices; no raw prompt text, full provider settings, or API key fields are serialized.

## Verification

- RED Task 1: `npm --prefix backend run test -- src/ai/__tests__/structured-output-conformance.test.ts` failed as expected because `structured-output-conformance.ts` was missing.
- GREEN Task 1: `npm --prefix backend run test -- src/ai/__tests__/structured-output-conformance.test.ts` passed, 4 tests.
- GREEN Task 1: `npm --prefix backend run typecheck` passed after strict semantic-check typing fixes.
- RED Task 2: `npm --prefix backend run test -- src/ai/__tests__/structured-output-conformance.test.ts` failed as expected because the CLI module and npm script were missing.
- GREEN Task 2: `npm --prefix backend run test -- src/ai/__tests__/structured-output-conformance.test.ts` passed, 7 tests.
- GREEN Task 2: `npm --prefix backend run structured-output:conformance` passed and printed skipped JSON with `skipped: true`.
- GREEN Task 2: `npm --prefix backend run typecheck` passed.
- Final plan verification: targeted conformance test passed, skipped CLI smoke passed, backend typecheck passed.
- Acceptance greps found all required conformance case IDs, `semanticPass`, `repairUsed`, `WORLDFORGE_LIVE_PROVIDER_CONFORMANCE`, `skipped`, `apiKey`, `readFileSync`, and `structured-output:conformance`.

## GitNexus And Scope Evidence

- `npx gitnexus status` before execution: up to date at `63ea510`.
- `npx gitnexus impact safeGenerateObject --repo WorldForge`: CRITICAL, 23 impacted symbols, 13 direct callers, 5 affected processes, 5 modules. This plan only calls `safeGenerateObject`; it does not edit it.
- `gitnexus_detect_changes(scope=staged)` before Task 1 RED: low risk, test-only.
- `gitnexus_detect_changes(scope=staged)` before Task 1 GREEN: low risk, new harness/test files.
- `gitnexus_detect_changes(scope=staged)` before Task 2 RED: low risk, test-only.
- `gitnexus_detect_changes(scope=staged)` before Task 2 GREEN: low risk, new CLI/package/test files.
- Final `npx gitnexus status`: up to date at `a49aa52`.
- Final `gitnexus_detect_changes(scope=all)`: no uncommitted code changes detected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed strict TypeScript callback typing**
- **Found during:** Task 1 and Task 2 verification.
- **Issue:** Generic semantic-check callbacks and Vitest provider-registry mocks passed tests but failed `tsc --noEmit` under strict function parameter checks.
- **Fix:** Added explicit `unknown` casts in tests and typed conformance case definitions in the harness.
- **Files modified:** `backend/src/ai/structured-output-conformance.ts`, `backend/src/ai/__tests__/structured-output-conformance.test.ts`.
- **Verification:** `npm --prefix backend run typecheck` passed.
- **Committed in:** `ba011e5`, `a49aa52`.

**2. [Rule 3 - Blocking] Rebuilt missing local `tsx` npm shim**
- **Found during:** Task 2 CLI verification.
- **Issue:** `npm --prefix backend run structured-output:conformance` could not resolve `tsx` because `backend/node_modules/.bin` was missing despite `backend/node_modules/tsx` existing.
- **Fix:** Ran `npm rebuild tsx --prefix backend --ignore-scripts`, which recreated local `.bin` shims without source or lockfile changes.
- **Files modified:** None committed; generated dependency shims are ignored.
- **Verification:** `npm --prefix backend run structured-output:conformance` passed and emitted skipped JSON.
- **Committed in:** Not applicable.

**Total deviations:** 2 auto-fixed (2 blocking).
**Impact on plan:** Both fixes were necessary to satisfy mandatory typecheck and CLI verification. No feature scope expansion.

## Issues Encountered

- `npm --prefix backend install --package-lock=false --ignore-scripts` was attempted while diagnosing the missing `tsx` shim and failed because `@worldforge/shared@*` is workspace-local and not a registry package in prefix-install mode. No tracked files changed.
- `npx gitnexus analyze` repeatedly emitted Node `MaxListenersExceededWarning` warnings but completed successfully and refreshed the index.

## Known Stubs

None. Stub scan matched only intentional empty arrays/default parameters in harness/test helpers and `value !== null` checks; no UI/data placeholder or unwired mock path was introduced.

## Threat Flags

None. The only new filesystem read is the planned, live-gated, read-only `settings.json` parse in the conformance CLI; no new network endpoint, auth path, database mutation, route handler, campaign mutation, or runtime tool execution surface was introduced.

## User Setup Required

None for mocked/default operation. Optional live provider probing requires setting `WORLDFORGE_LIVE_PROVIDER_CONFORMANCE=1` in the shell before running the npm script.

## Next Phase Readiness

Ready for Plan 73-05. The conformance harness can now prove provider/model/schema/mode behavior locally without campaign mutation, while live provider probing remains opt-in and secret-safe.

## Self-Check: PASSED

- Created files exist: `structured-output-conformance.ts`, `structured-output-conformance.test.ts`, `structured-output-conformance.ts` CLI script, and `73-04-SUMMARY.md`.
- Task commits found: `2beb7ca`, `ba011e5`, `e5f7762`, `a49aa52`.
- Final targeted tests, skipped CLI smoke, backend typecheck, GitNexus status, and all-scope change detection passed.

---
*Phase: 73-structured-output-stability-and-provider-conformance*
*Completed: 2026-04-27*
