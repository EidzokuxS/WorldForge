---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
plan: 10
subsystem: ai-structured-output
tags: [safeGenerateObject, zod, repair-policy, fixtures, conformance]

requires:
  - phase: 74-02
    provides: ScenePlanner and hidden-adjudication prompt contract patterns
  - phase: 74-04
    provides: generatedContext citations/canonicalNames failure coverage
  - phase: 74-05
    provides: power-stat prompt contracts and lazy-stat regression framing
provides:
  - Phase 74 repair policy artifact for bounded deterministic repair
  - Shared generic repair prompt policy text
  - Sanitized structured-output failure fixture corpus with manifest provenance
affects: [74-11, structured-output-conformance, repair-policy, provider-regressions]

tech-stack:
  added: []
  patterns:
    - "Repair policy marker: STRUCTURED_OUTPUT_CONTRACT: repair-policy.v1"
    - "Failure fixtures store minimal malformed objects plus manifest provenance"

key-files:
  created:
    - .planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-REPAIR-POLICY.md
    - backend/src/ai/__tests__/fixtures/structured-output-failures/manifest.json
    - backend/src/ai/__tests__/fixtures/structured-output-failures/kimi-citations-string.json
    - backend/src/ai/__tests__/fixtures/structured-output-failures/mimo-canonical-names-string.json
    - backend/src/ai/__tests__/fixtures/structured-output-failures/deepseek-scene-plan-missing-action.json
    - backend/src/ai/__tests__/fixtures/structured-output-failures/deepseek-payload-vs-input.json
    - backend/src/ai/__tests__/fixtures/structured-output-failures/glm-overlong-rationale.json
    - backend/src/ai/__tests__/fixtures/structured-output-failures/unsupported-tool-name.json
    - backend/src/ai/__tests__/fixtures/structured-output-failures/lazy-power-stats.json
  modified:
    - backend/src/ai/generate-object-safe.ts
    - backend/src/ai/__tests__/generate-object-safe.test.ts
    - backend/src/character/known-ip-worldgen-research.ts
    - backend/src/character/__tests__/known-ip-worldgen-research.test.ts

key-decisions:
  - "Repair may coerce syntax, shape, field names, known aliases, and caps only when the original payload already carries the same meaning."
  - "Repair must fail closed instead of inventing lore, actions, targets, actor intent, quick-action labels, source roles, canonical names, power facts, IDs, UUIDs, or missing-semantics array elements."
  - "Fixture corpus uses Phase 73/74 evidence and existing regression payloads as provenance while omitting raw prompts, raw provider envelopes, secrets, and campaign-private data."

patterns-established:
  - "TDD RED/GREEN is used for repair-policy text and fixture corpus presence/provenance."
  - "Future conformance tests should consume fixture IDs from structured-output-failures/manifest.json."

requirements-completed: [P74-R4, P74-R5]

duration: 13min
completed: 2026-04-28
---

# Phase 74 Plan 10: Repair Policy and Failure Fixtures Summary

**Bounded structured-output repair policy plus source-linked malformed fixture corpus for provider regression conformance.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-28T20:00:01Z
- **Completed:** 2026-04-28T20:12:52Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Added `74-REPAIR-POLICY.md` and mirrored its rules into the generic repair prompt so repair is bounded and fail-closed.
- Added tests proving generic repair and power-stat repair include the no-invention policy.
- Added seven sanitized malformed fixture files plus `manifest.json` with fixture IDs, source lines, provider/model labels, schema families, and sanitization notes.

## Task Commits

1. **Task 1 RED: Document and test deterministic repair policy** - `1349237` (test)
2. **Task 1 GREEN: Implement repair policy boundary** - `3956af0` (feat)
3. **Task 2 RED: Create sanitized log-derived failure fixture corpus** - `def6ec1` (test)
4. **Task 2 GREEN: Add failure fixture corpus** - `8a27c4f` (feat)

_Note: Both tasks were TDD tasks, so each has a RED test commit followed by a GREEN implementation commit._

## Files Created/Modified

- `.planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-REPAIR-POLICY.md` - Phase 74 source of truth for allowed and forbidden repair behavior.
- `backend/src/ai/generate-object-safe.ts` - Adds the repair-policy marker text to generic repair prompts.
- `backend/src/ai/__tests__/generate-object-safe.test.ts` - Adds repair-policy and fixture-corpus regression tests.
- `backend/src/character/known-ip-worldgen-research.ts` - Makes power-stat repair explicitly fail closed when evidence is too thin.
- `backend/src/character/__tests__/known-ip-worldgen-research.test.ts` - Verifies lazy/underspecified power stats do not authorize invented facts.
- `backend/src/ai/__tests__/fixtures/structured-output-failures/*.json` - Manifest plus seven malformed structured-output fixtures for Plan 74-11 reuse.

## Decisions Made

- Repair policy is a Phase artifact plus in-code prompt text, not an implicit convention hidden in tests.
- Generic repair and domain repair both use the same boundary: shape repair is allowed, semantic invention is not.
- Fixtures preserve only minimal malformed objects and cite Phase 73/74 evidence when raw provider payloads are unavailable or unsafe to store.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- `npx gitnexus detect-changes --scope staged` is not a supported CLI command in this checkout, so pre-commit scope checks used the GitNexus MCP `detect_changes` tool instead.
- `npx gitnexus analyze` succeeded after commits but emitted repeated Node `MaxListenersExceededWarning` messages; the index was current after the final task commit.

## Known Stubs

None. Stub-pattern scan only found pre-existing local examples and initialization patterns; no new placeholder data path blocks the plan goal.

## Threat Flags

None. The only new trust-boundary artifact is the sanitized fixture corpus already covered by the plan threat model.

## Verification

- `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts src/character/__tests__/known-ip-worldgen-research.test.ts` - PASS, 24 tests.
- `rg -n "may coerce|must never invent|fail closed|new array elements|semantic" ...` - PASS, policy/test coverage found.
- Fixture manifest grep for all seven fixture IDs - PASS.
- `rg -n "MISSING_SOURCE" backend/src/ai/__tests__/fixtures/structured-output-failures/manifest.json` - PASS, no matches.
- Forbidden fixture text scan for `apiKey|Authorization|Bearer|raw full prompt|campaigns/` - PASS, no matches.
- `npm --prefix backend run typecheck` - PASS.
- `npx gitnexus status` - PASS, indexed commit `8a27c4f` equals current commit.

## TDD Gate Compliance

- RED gate commit present: `1349237` for repair-policy tests.
- GREEN gate commit present: `3956af0` for repair-policy implementation.
- RED gate commit present: `def6ec1` for fixture-corpus tests.
- GREEN gate commit present: `8a27c4f` for fixture-corpus implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 74-11 can consume `backend/src/ai/__tests__/fixtures/structured-output-failures/manifest.json` by `fixtureId` to distinguish primary prompt-contract success from repair-assisted success across the named provider failure classes.

## Self-Check: PASSED

- Created summary, repair policy, manifest, and seven fixture files exist.
- Task commits found in git history: `1349237`, `3956af0`, `def6ec1`, `8a27c4f`.
- No accidental file deletions were present in task commits.

---
*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Completed: 2026-04-28*
