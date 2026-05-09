---
phase: 59-game-shell-and-layout-fix
status: approved
nyquist_compliant: true
wave_0_complete: true
generated_at: 2026-04-17T03:01:58.027Z
generated_by: pinchtab-smoke.mjs
viewport: 1920x1080
---

# Phase 59 Validation

## Automated Evidence (PinchTab smoke, 1920x1080 viewport)

### Action dock visibility
- ok: true
- rect.top: 1134
- rect.bottom: 1333
- rect.height: 199
- viewport.h: 1345
- viewport.w: 2544
- assertion: rect.bottom (1333) <= viewport.h (1345) => PASS

### Shell height equals viewport
- shellHeight: 1345
- viewportHeight: 1345
- delta: 0
- assertion: delta (0) < 2 => PASS

### Right-column internal scroll hooks (canonical data-slot)
- scroller count: 2
- expectation: >= 2 (CharacterPanel + LorePanel ScrollAreas, both emit [data-slot="scroll-area-viewport"])
- result: PASS

## Per-Task Verification Map

| Plan-Task | Verify command | Evidence |
|-----------|----------------|----------|
| 59-01 T1 | npm --prefix frontend test -- --run frontend/app/game/__tests__/page.test.tsx && npm --prefix frontend test -- --run frontend/components/game/__tests__/lore-panel.layout.test.tsx | DOM regression tests green |
| 59-01 T2 | same as above + npm --prefix frontend run lint && npm --prefix frontend run typecheck | shell rewrite + LorePanel align |
| 59-02 T1 | typecheck-before.txt (BEFORE=40) + typecheck-after.txt (AFTER=38), DIFF=2 | TS narrowing fixes, persisted evidence |
| 59-02 T2 | node scripts/pinchtab-smoke.mjs (this file, exit 0) | PASS |

## Test Infrastructure
- Frontend framework: Vitest 3.2.4 + jsdom 27
- Frontend config: frontend/vitest.config.ts
- Backend framework: Vitest 3.2.4 (node env)
- Browser smoke: PinchTab on :9867 via HTTP /navigate + /evaluate
- Viewport: fixed at 1920x1080 (single Chromium via PinchTab, no multi-viewport)
- Quick: `npm --prefix frontend test -- --run frontend/app/game/__tests__/page.test.tsx`
- Full: `npm --prefix frontend test -- --run && npm --prefix backend run typecheck && node .planning/phases/59-game-shell-and-layout-fix/scripts/pinchtab-smoke.mjs`

## Raw evidence JSON (machine-readable)
```json
{
  "dockCheck": {
    "ok": true,
    "rect": {
      "bottom": 1333,
      "height": 199,
      "left": 743,
      "right": 1791,
      "top": 1134
    },
    "viewport": {
      "h": 1345,
      "w": 2544
    }
  },
  "shellHeightCheck": {
    "delta": 0,
    "shellHeight": 1345,
    "viewportHeight": 1345
  },
  "scrollCheck": {
    "count": 2,
    "ok": true,
    "scrollers": [
      {
        "clientHeight": 805,
        "scrollHeight": 805
      },
      {
        "clientHeight": 10253,
        "scrollHeight": 10253
      }
    ]
  },
  "viewport": {
    "width": 1920,
    "height": 1080
  }
}
```
