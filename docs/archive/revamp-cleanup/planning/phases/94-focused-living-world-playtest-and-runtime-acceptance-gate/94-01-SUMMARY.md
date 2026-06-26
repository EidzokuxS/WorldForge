# 94-01 Summary: Deterministic Runtime Acceptance Invariants

## Outcome

Phase 94-01 is implemented.

A pure Phase 94 trace assertion helper now evaluates hard acceptance invariants before live route execution. The helper consumes sanitized trace records and returns machine-readable pass/fail results with invariant id, route id, turn id, severity, reason, and evidence ids. It does not touch files, databases, LLMs, or runtime state.

## Code Changes

- Added `backend/src/engine/phase-94-trace-assertions.ts`.
- Added deterministic fixtures and pass/fail coverage in `backend/src/engine/__tests__/phase-94-runtime-invariants.test.ts`.
- Added wave-1 dependency preflight evidence at `evidence/wave-1/dependency-preflight.md`.
- Added hard invariant coverage evidence at `evidence/wave-1/hard-invariants.json`.

## Covered Invariants

- Narrator repair does not roll back valid turn resolution.
- Oracle decisions persist through final reporting.
- Uncommitted proposals do not become SceneFrame or NarratorPacket truth.
- Visible pressure has source event/fact/thread/surface-signal evidence.
- Hidden/private terms do not leak into player-facing artifacts.
- Unsupported false claims remain claims, beliefs, proof pressure, or failed attempts.
- Rollback reasons stay within deterministic state boundaries.
- Acceptance cannot pass via output clipping, duration caps, fake success, or skipped mechanics.
- Terminal route evidence includes raw SSE, full turn, and trace artifacts.
- Living-world due work reaches terminal state and relevant consequences surface.
- Combat/power turns produce tracked consequence or explicit no-combat evidence.
- Next-turn world version observes the settled turn boundary.

## Verification

Passed:

```powershell
npm --prefix backend run test -- src/engine/__tests__/phase-94-runtime-invariants.test.ts
npm --prefix backend run typecheck
```

Result:

- 1 focused backend file passed.
- 4 tests passed.
- Backend typecheck passed.

## Risk Notes

No existing runtime symbols were modified. Phase 94-01 intentionally keeps acceptance logic as a pure evaluator so later live harness waves can reuse the same deterministic checks without broadening runtime behavior.
