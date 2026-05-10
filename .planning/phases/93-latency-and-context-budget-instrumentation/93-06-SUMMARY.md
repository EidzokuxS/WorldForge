# 93-06 Summary: Oracle and Reviewer Budget Guard Coverage

## Outcome

Phase 93-06 is implemented.

Oracle calls now pass through an explicit `OracleFrame` before prompt formatting, with a shared `OracleFrame` budget trace and exclusion counts for hidden proposals, irrelevant lore, full memories, and unbounded chat history. Reviewer evidence now has a bounded `ReviewerPacket` contract with source-linked overflow summaries and source-ref enforcement.

## Code Changes

- Added `backend/src/engine/oracle-frame.ts`.
- Rewired `backend/src/engine/oracle.ts` so the existing prompt shape is formatted from `OracleFrame`.
- Added `backend/src/engine/reviewer-packet.ts`.
- Exported OracleFrame and ReviewerPacket helpers from the engine index.
- Added OracleFrame tests for prompt inclusion/exclusion, source refs, budget trace, and combat clamp preservation.
- Added ReviewerPacket tests for hidden evidence exclusion, source-linked overflow summaries, and source-free evidence rejection.

## Verification

Passed:

```powershell
npm --prefix backend run test -- src/engine/__tests__/oracle-frame.test.ts src/engine/__tests__/reviewer-packet.test.ts src/engine/__tests__/context-budget-trace.test.ts src/engine/__tests__/oracle.test.ts
npm --prefix backend run typecheck
git diff --check
```

Result:

- 4 focused files passed.
- 29 tests passed.
- Backend typecheck passed.
- Diff check passed with CRLF normalization warnings only.

## Risk Notes

GitNexus impact preflight for `callOracle` and `buildOraclePrompt` was LOW. `ReviewerPacket` is new code and will be covered by staged detect_changes plus focused tests.

The guard scan found no new model-output clipping, `sanitizeNarrative`, `truncateToFit`, generic substring, arbitrary timeout, or `didClipModelOutput: true` additions.
