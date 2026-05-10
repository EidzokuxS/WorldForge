# 93-05 Summary: Honest UI Stage Messages and Final Instrumentation Gate

## Outcome

Phase 93-05 is implemented.

Normal turn progress events now carry compact, player-safe stage metadata. The backend converts `scene-settling` and `finalizing_turn` payloads into whitelisted stage ids, phase/tick/count fields, and criticality labels. The frontend normalizes those payloads again at the SSE boundary and renders only safe copy, so malformed payloads cannot leak hidden actor names, proposal ids, private terms, hidden rationale, or raw stage identifiers into `/game` progress text.

## Code Changes

- Added `withSafeTurnProgressPayload` and safe stage inference in `backend/src/engine/turn-processor.ts`.
- Wrapped `processTurn` output so normal turn `scene-settling` and `finalizing_turn` events expose safe progress payloads.
- Added `TurnStageStatus` parsing in `frontend/lib/api.ts`, preserving existing SSE compatibility while dropping non-whitelisted fields.
- Mapped safe stage ids to player-facing progress copy in `frontend/app/game/page.tsx`.
- Added backend, SSE parser, and UI regressions proving hidden/proposal/private payload fields are ignored.

## Verification

Passed:

```powershell
npm --prefix backend run test -- src/engine/__tests__/turn-processor.observability.test.ts
npm --prefix frontend run test -- --run app/game/__tests__/page.test.tsx lib/__tests__/api.test.ts
npm --prefix backend run test -- src/engine/__tests__/turn-latency-trace.test.ts src/engine/__tests__/turn-processor.observability.test.ts
npm --prefix backend run typecheck
npm --prefix frontend run typecheck
git diff --check
```

Result:

- Backend observability passed: 1 file / 4 tests.
- Frontend SSE/UI suite passed: 2 files / 89 tests.
- Final backend gate passed: 2 files / 11 tests.
- Backend and frontend typechecks passed.
- Diff check passed with CRLF normalization warnings only.
- Production diff guard scan found no `truncateToFit`, `sanitizeNarrative`, `didClipModelOutput: true`, timeout shortcut, or raw hidden/proposal/private stage text additions.
- GitNexus `detect_changes(scope=all)` reported MEDIUM risk: 13 changed symbols, 6 files, 3 affected frontend SSE flows (`handleContinueAction`, `handleMove`, `handleRetry`).

## Risk Notes

GitNexus preflight identified `parseTurnSSE` as HIGH risk because it feeds the main `/game` streaming flows. The implementation keeps the parser backward-compatible: legacy strings still parse, known safe payload fields are copied, and all extra payload fields are dropped before handlers see them.

The backend wrapper is additive at the event boundary and does not change turn resolution semantics, route finalization, narrator text, or model-output handling.
