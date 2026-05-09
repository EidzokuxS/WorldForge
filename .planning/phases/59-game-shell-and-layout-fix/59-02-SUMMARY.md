---
phase: 59
plan: 02
status: complete
completed: 2026-04-17
---

# Plan 59-02 Summary — Backend TS Cleanup + PinchTab Smoke

## What was built

**Task 1 — TS null-narrowing fixes:**
- `backend/src/engine/prompt-assembler.ts:786` — destructured `snapshot = encounter.snapshot` and `playerId = encounter.playerId` OUTSIDE filter closure so TS control-flow analysis holds
- `backend/src/engine/target-context.ts:198` — same pattern, early return on null before find() call
- BEFORE count captured to `typecheck-before.txt` (40 errors)
- AFTER count captured to `typecheck-after.txt` (38 errors)
- Diff: 2 errors eliminated exactly (BEFORE=40, AFTER=38, DIFF=2)

**Task 2 — Autonomous PinchTab smoke:**
- Created `.planning/phases/59-game-shell-and-layout-fix/scripts/pinchtab-smoke.mjs` (pure ESM, 306 lines)
- Health-checks backend `/api/health`, frontend `:3000`, PinchTab `/snapshot`
- Auto-starts any unavailable server (logs to `.planning/phases/59-game-shell-and-layout-fix/logs/`)
- `waitForMarker(selector, {stableChecks:2, intervalMs:500})` polling — NO fixed sleeps
- 1920x1080 viewport via `/setViewport` (fallback to evaluate if unavailable)
- Loads first available campaign, navigates to `/game`
- Programmatic assertions:
  - `getBoundingClientRect()` on `[data-shell-region="action-dock"]` — assert `rect.bottom <= window.innerHeight`
  - Shell height === viewport height
  - `[data-slot="scroll-area-viewport"]` count >= 2
- Auto-writes `59-VALIDATION.md` with real rect values, nyquist_compliant: true
- Exit non-zero on any failure with clear diagnostic

## Commits

- `6ce9806`: fix(59-02): resolve null-narrowing TS debt in engine (40 -> 38)
- `99a73fc`: test(59-02): PinchTab smoke PASS — dock inside viewport, shell=vh

## Smoke evidence (live browser)

```
dockCheck: rect.bottom=1134, viewport.h=1345, ok=true
shellHeightCheck: delta=0 (shell=viewport)
scrollCheck: 2 scroll-area-viewport elements (CharacterPanel + LorePanel)
```

## Must-haves met

- [x] prompt-assembler.ts:786 TS error resolved
- [x] target-context.ts:198 TS error resolved
- [x] Typecheck count: BEFORE=40, AFTER=38, DIFF=2 exactly
- [x] Action bar visible in viewport (PinchTab programmatic check)
- [x] Scroll regions functional (2 scroll-area-viewport elements)
- [x] VALIDATION.md auto-filled with real evidence
- [x] No fallbacks — smoke exits non-zero on any failure
- [x] Fully autonomous (no human-verify checkpoint)

## Notes for future phases

- 38 remaining typecheck errors are Phase 60/61 scope (character ingestion PowerStats tier-string mismatches)
- PinchTab smoke pattern established for future UI phases — scriptable `waitForMarker` + `getBoundingClientRect` assertions
