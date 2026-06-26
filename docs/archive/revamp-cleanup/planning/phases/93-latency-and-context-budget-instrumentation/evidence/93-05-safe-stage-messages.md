# 93-05 Evidence: Safe Stage Messages

## Contract

Safe progress events may expose:

- `stage`
- `stageId`
- `phase`
- `tick`
- `opening`
- `criticality`
- `criticalPath`
- `executed`
- `deferred`
- `worldThreads`
- `resumed`

They must not expose hidden actor names, proposal ids, hidden rationale, packet bodies, prompt text, private plans, redaction term values, or raw unknown stage ids as UI copy.

## Backend Evidence

`backend/src/engine/turn-processor.ts` now wraps normal `processTurn` events with `withSafeTurnProgressPayload`.

Mapped stage ids:

- `resolving-action`
- `checking-immediate-consequences`
- `resolving-nearby-reactions`
- `advancing-world-time`
- `writing-scene`
- `repairing-narration-grounding`

Backend regression:

```powershell
npm --prefix backend run test -- src/engine/__tests__/turn-processor.observability.test.ts
```

Result: 1 file / 4 tests passed. The added regression proves hidden fields such as hidden actor names, proposal ids, hidden rationale, and private terms are not present after progress payload normalization.

## Frontend Evidence

`frontend/lib/api.ts` normalizes `scene-settling` and `finalizing_turn` payloads before invoking handlers. `frontend/app/game/page.tsx` maps only known stage ids to safe copy and uses generic fallback copy for unknown ids.

Frontend regression:

```powershell
npm --prefix frontend run test -- --run app/game/__tests__/page.test.tsx lib/__tests__/api.test.ts
```

Result: 2 files / 89 tests passed. The added regressions prove hidden/proposal/private payload fields are ignored and raw stage ids do not render in the UI.

## Final Gate

```powershell
npm --prefix backend run test -- src/engine/__tests__/turn-latency-trace.test.ts src/engine/__tests__/turn-processor.observability.test.ts
npm --prefix backend run typecheck
npm --prefix frontend run typecheck
git diff --check
```

Result:

- Backend final gate: 2 files / 11 tests passed.
- Backend typecheck passed.
- Frontend typecheck passed.
- Diff check passed with CRLF normalization warnings only.

Production diff guard scan:

```powershell
git diff -- backend/src/engine/turn-processor.ts frontend/app/game/page.tsx frontend/lib/api.ts |
  Select-String -Pattern 'truncateToFit|sanitizeNarrative|didClipModelOutput\s*:\s*true|AbortSignal\.timeout|setTimeout\(|proposalId|hiddenActorName|privateTerm|hiddenRationale' -CaseSensitive
```

Result: no matches beyond Git CRLF normalization warnings.

GitNexus:

- Preflight: `parseTurnSSE` impact was HIGH due to `/game` streaming flows.
- Closeout: `detect_changes(scope=all)` reported MEDIUM risk with expected frontend SSE flows affected: `handleContinueAction`, `handleMove`, and `handleRetry`.
