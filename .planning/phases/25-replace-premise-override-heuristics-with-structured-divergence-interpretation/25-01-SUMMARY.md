---
phase: 25-replace-premise-override-heuristics-with-structured-divergence-interpretation
plan: 01
subsystem: api
tags: [worldgen, known-ip, zod, vitest, typescript, frontend-api]
requires:
  - phase: 23-unified-research-world-generation-pipeline
    provides: cached ipContext request-or-cache plumbing for world generation
  - phase: 24-worldgen-known-ip-quality
    provides: canonical known-IP research context and prompt grounding
provides:
  - shared PremiseDivergence contract beside immutable IpResearchContext
  - structured known-IP premise interpreter with cached request-or-cache handoff
  - hidden frontend divergence transport across suggest and generate flows
affects: [phase-25-02, phase-25-03, worldgen, prompt-contracts]
tech-stack:
  added: []
  patterns: [structured divergence artifact, immutable canon cache, request-or-cache worldgen context]
key-files:
  created: [backend/src/worldgen/premise-divergence.ts, backend/src/worldgen/__tests__/premise-divergence.test.ts]
  modified: [shared/src/types.ts, backend/src/campaign/manager.ts, backend/src/routes/worldgen.ts, backend/src/worldgen/seed-suggester.ts, frontend/lib/api.ts]
key-decisions:
  - "PremiseDivergence lives beside IpResearchContext so canonical research stays immutable."
  - "Routes compute-or-load premiseDivergence once and pass the cached artifact downstream instead of mutating ipContext."
  - "Prompt rewrites were deferred; this plan establishes interpretation and transport first."
patterns-established:
  - "Known-IP context is split into canon reference data (ipContext) and campaign-specific state interpretation (premiseDivergence)."
  - "Worldgen entry points return or reuse hidden _premiseDivergence artifacts without changing visible frontend UX."
requirements-completed: [P25-01, P25-02, P25-03]
duration: 13min
completed: 2026-03-30
---

# Phase 25 Plan 01: Structured divergence contract and cached interpretation summary

**Structured PremiseDivergence contracts with cached known-IP interpretation and hidden frontend handoff across suggest, generate, and regenerate worldgen flows**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-30T07:06:30Z
- **Completed:** 2026-03-30T07:19:05Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments
- Added a shared `PremiseDivergence` artifact and campaign persistence helpers so divergence is cached beside `ipContext` instead of mutating canonical research data.
- Implemented `interpretPremiseDivergence()` as a dedicated structured-output pass for known-IP premises and normalized canonical protagonist matching.
- Threaded hidden `_premiseDivergence` transport through `suggest-seeds`, `generate`, `regenerate-section`, and the title-screen wizard/API without introducing new UX.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define PremiseDivergence contracts and persistence surfaces** - `dfc5ca1`, `8b94a0f`
2. **Task 2: Implement structured premise interpretation and request-or-cache handoff** - `45e2f83`, `826283f`

Plan metadata: pending docs commit

Note: TDD tasks used `test` → `feat` commit pairs.

## Files Created/Modified

- `shared/src/types.ts` - added the shared structured divergence contract beside `IpResearchContext`.
- `shared/src/index.ts` - re-exported the new shared divergence types.
- `backend/src/worldgen/types.ts` - extended scaffold requests with optional cached divergence.
- `backend/src/routes/schemas.ts` - accepted optional `premiseDivergence` payloads while preserving `ipContext` compatibility.
- `backend/src/campaign/manager.ts` - persisted and reloaded `premiseDivergence` beside `ipContext`.
- `backend/src/campaign/index.ts` - re-exported the new campaign cache helpers.
- `backend/src/worldgen/premise-divergence.ts` - implemented the structured known-IP premise interpreter.
- `backend/src/worldgen/index.ts` - exported the new interpreter from the worldgen facade.
- `backend/src/worldgen/seed-suggester.ts` - returned cached divergence artifacts without mutating canonical research data.
- `backend/src/worldgen/scaffold-generator.ts` - reused cached divergence on scaffold generation entry.
- `backend/src/routes/worldgen.ts` - compute-or-load divergence once for suggest, generate, and regenerate flows.
- `frontend/lib/types.ts` - exposed `PremiseDivergence` to frontend callers.
- `frontend/lib/api.ts` - added hidden `_premiseDivergence` API transport and generate/suggest signatures.
- `frontend/components/title/use-new-campaign-wizard.ts` - carried hidden divergence state through the existing wizard flow.
- `backend/src/worldgen/__tests__/premise-divergence.test.ts` - covered the motivating VotV and outsider Naruto interpretation cases.
- `backend/src/worldgen/__tests__/seed-suggester.test.ts` - updated regressions for the non-mutating divergence artifact flow.
- `backend/src/routes/__tests__/worldgen.test.ts` - covered route reuse of cached divergence artifacts.
- `backend/src/campaign/__tests__/manager.test.ts` - verified cache round-tripping beside `ipContext`.
- `backend/src/routes/__tests__/schemas.test.ts` - verified schema compatibility for optional divergence payloads.

## Decisions Made

- Kept `IpResearchContext` immutable and stored user-specific premise interpretation in `PremiseDivergence`.
- Let the route layer own compute-or-load caching so downstream services can reuse the artifact without recomputing.
- Deferred prompt-contract rewrites to later Phase 25 plans; this plan only establishes interpretation and transport.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt shared package output for frontend type resolution**
- **Found during:** Task 1 verification
- **Issue:** Frontend imports `@worldforge/shared` from `shared/dist`, so the new `PremiseDivergence` type was invisible until the shared package was rebuilt.
- **Fix:** Ran `npm --prefix shared run build` before re-running frontend type resolution.
- **Files modified:** generated `shared/dist/*` in the local workspace only
- **Verification:** The `PremiseDivergence` export error disappeared from frontend typecheck output.
- **Committed in:** none (generated output is ignored)

**2. [Rule 3 - Blocking] Updated seed suggester regressions to the non-mutating divergence contract**
- **Found during:** Task 2 verification
- **Issue:** Existing `seed-suggester` tests still expected `excludedCharacters` mutation and the old return shape, which blocked regression verification after the new artifact landed.
- **Fix:** Rewrote the affected assertions to expect `premiseDivergence` transport and unchanged canonical `ipContext`.
- **Files modified:** `backend/src/worldgen/__tests__/seed-suggester.test.ts`
- **Verification:** `npm --prefix backend exec vitest run src/worldgen/__tests__/seed-suggester.test.ts`
- **Committed in:** `826283f`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were required to complete verification of the planned contract and cache changes. No scope creep beyond keeping the new artifact path testable.

## Issues Encountered

- The plan's frontend verification command, `npm --prefix frontend exec tsc --noEmit`, prints the TypeScript CLI help text in this environment rather than running the project typecheck. The equivalent working command was `npx --prefix frontend tsc --noEmit -p frontend/tsconfig.json`.
- That corrected frontend typecheck still fails in unrelated already-dirty files outside Plan 25-01 scope:
  - `frontend/app/character-creation/page.tsx`
  - `frontend/app/world-review/page.tsx`
  - `frontend/components/title/__tests__/new-campaign-dialog.test.tsx`
- Those out-of-scope blockers were logged in `.planning/phases/25-replace-premise-override-heuristics-with-structured-divergence-interpretation/deferred-items.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 25 now has a reusable `PremiseDivergence` artifact available anywhere the known-IP worldgen pipeline needs it.
- Follow-up plans can safely rewrite prompt contracts around `canon + premiseDivergence` without touching campaign cache semantics again.
- The unrelated frontend typecheck debt remains outside this plan and should be resolved separately if full frontend `tsc` must pass.

## Self-Check: PASSED

- Found summary file: `.planning/phases/25-replace-premise-override-heuristics-with-structured-divergence-interpretation/25-01-SUMMARY.md`
- Found commits: `dfc5ca1`, `8b94a0f`, `45e2f83`, `826283f`
