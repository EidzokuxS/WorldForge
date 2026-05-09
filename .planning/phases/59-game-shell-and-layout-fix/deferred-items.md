# Phase 59 — Deferred Items

Items discovered during Plan 59-01 execution that are **out of scope** for this plan per the
deviation scope boundary (only auto-fix issues directly caused by current task changes).

## Pre-existing lint errors (not caused by Phase 59)

File: `frontend/app/game/__tests__/page.test.tsx`
- Line 187:21 — `react/no-unescaped-entities`: `"` should be escaped in mocked ActionBar JSX text `RP markup: "speech", *action*, **emphasis**`
- Line 187:28 — same rule, same line

Verified pre-existing: The exact same line exists in parent commit `6e41add` (pre Phase 59).
These are inside the ActionBar `vi.mock` block (lines 165-197) which was untouched by Plan 59-01.

## Pre-existing typecheck errors (not caused by Phase 59)

Running `npx tsc --noEmit -p tsconfig.json` (full scope) surfaces type errors in unrelated test files:
- `components/campaign-new/__tests__/flow-provider.test.tsx` — missing `observability` on Settings
- `components/settings/__tests__/images-tab.test.tsx` — same
- `components/settings/__tests__/providers-tab.test.tsx` — same
- `components/settings/__tests__/research-tab.test.tsx` — same
- `components/settings/__tests__/roles-tab.test.tsx` — same
- `components/title/__tests__/use-new-campaign-wizard.test.tsx` — same
- `components/world-review/__tests__/character-record-inspector.test.tsx` — unknown `grounding` key

These are suppressed by the project `tsconfig.typecheck.json` which narrows scope (the project-standard
`npm run typecheck` PASSES cleanly). The plan's literal verification command `npx tsc --noEmit -p tsconfig.json`
differs from the project script `tsconfig.typecheck.json` — the project script is authoritative and is GREEN.

Not blocking Phase 59; unrelated Settings/campaign/world-review feature domains.

## Pre-existing lint warnings

11 `no-unused-vars` warnings across unrelated files — none touched by Plan 59-01.
