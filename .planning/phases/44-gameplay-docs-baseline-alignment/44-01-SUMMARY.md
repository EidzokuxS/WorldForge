---
phase: 44-gameplay-docs-baseline-alignment
plan: 01
subsystem: docs
tags: [documentation, gameplay, runtime, transport, setup]
requires:
  - phase: 36-gameplay-docs-to-runtime-reconciliation-audit
    provides: claim inventory and deprecation tracker for stale gameplay promises
  - phase: 42-targeted-oracle-and-start-condition-runtime-effects
    provides: live start-condition and canonical-character runtime truth
  - phase: 43-travel-and-location-state-contract-resolution
    provides: live travel-cost and recent-happenings contract for docs alignment
provides:
  - explicit gameplay-doc authority boundaries between concept, mechanics, memory, and technical-reference docs
  - corrected top-level setup, travel, and `/game` shell language in concept.md
  - reference-only stack documentation plus a historical marker on the legacy player-creation plan
affects: [phase-44-02, phase-44-03, gameplay-docs-baseline]
tech-stack:
  added: []
  patterns:
    - concept.md is high-level product contract only; mechanics.md and memory.md own detailed runtime truth
    - tech_stack.md records implementation details without acting as gameplay authority
    - superseded design docs stay in-repo with explicit historical notes instead of silent rewrites
key-files:
  created: [.planning/phases/44-gameplay-docs-baseline-alignment/44-01-SUMMARY.md]
  modified: [docs/concept.md, docs/tech_stack.md, docs/plans/2026-03-06-player-character-creation.md]
key-decisions:
  - "docs/concept.md now states product boundaries and redirects detailed gameplay/runtime truth to docs/mechanics.md and docs/memory.md."
  - "docs/tech_stack.md is reference-only and documents gameplay transport as REST plus SSE rather than WebSocket gameplay truth."
  - "The 2026-03-06 player-character-creation plan remains in the repo as historical context, explicitly superseded by the current runtime baseline."
patterns-established:
  - "Pattern 1: stale gameplay promises are deprecated explicitly in prose rather than disappearing silently."
  - "Pattern 2: historical design docs can remain discoverable if they point readers to the current normative docs."
requirements-completed: [DOCA-01]
duration: 8 min
completed: 2026-04-11
---

# Phase 44 Plan 01: Gameplay Docs Baseline Alignment Summary

**Top-level docs now distinguish product contract, runtime authority, and technical reference while explicitly deprecating stale setup, transport, and UI promises**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-11T19:12:00Z
- **Completed:** 2026-04-11T19:20:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Rewrote `docs/concept.md` into a high-level product contract with an explicit `Docs authority` note pointing detailed gameplay and runtime truth to `docs/mechanics.md` and `docs/memory.md`.
- Replaced stale top-level claims around wiki ingest, old scaffold counts, the `Solid Slate` layout label, and setup/handoff wording with live-scope or explicitly superseded language.
- Rewrote `docs/tech_stack.md` into a technical reference that reflects the real monorepo and REST + SSE transport contract, then marked the older player-character creation plan as historical instead of silently authoritative.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reframe `docs/concept.md` as a high-level product contract with explicit deprecations** - `7288a89` (`docs`)
2. **Task 2: Correct technical-reference and setup-handoff docs without letting them masquerade as gameplay authority** - `d792274` (`docs`)

## Files Created/Modified

- `docs/concept.md` - high-level product/system contract with authority boundaries, live setup wording, and explicit deprecations for stale gameplay promises
- `docs/tech_stack.md` - reference-only architecture and stack document corrected to the live monorepo and REST + SSE transport contract
- `docs/plans/2026-03-06-player-character-creation.md` - historical note that redirects readers to current normative docs and calls out later runtime changes
- `.planning/phases/44-gameplay-docs-baseline-alignment/44-01-SUMMARY.md` - execution summary for this plan

## Decisions Made

- `concept.md` now owns product-level guarantees only; detailed gameplay and runtime semantics defer to `mechanics.md` and `memory.md`.
- The live gameplay transport is documented as REST + SSE, while `@hono/node-ws` is kept as implementation capability rather than active gameplay contract.
- Superseded setup documents remain available only with an explicit historical note so future planning cannot mistake them for current authority.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- One acceptance check initially failed because a replacement note in `docs/tech_stack.md` still repeated stale trigger wording. The note was rewritten to record the correction without preserving the old false phrasing, then the acceptance check passed.

## Known Stubs

- `docs/plans/2026-03-06-player-character-creation.md:526` - `placeholder="Character name"` appears inside historical sample UI code retained as archived design context.
- `docs/plans/2026-03-06-player-character-creation.md:575` - `placeholder="Select location"` appears inside historical sample UI code retained as archived design context.
- `docs/plans/2026-03-06-player-character-creation.md:594` - `placeholder="Add item..."` appears inside historical sample UI code retained as archived design context.
- `docs/plans/2026-03-06-player-character-creation.md:647` - long textarea placeholder text appears inside historical sample UI code retained as archived design context.
- `docs/plans/2026-03-06-player-character-creation.md:899` - `TODO` remains in archived implementation notes because the plan is explicitly marked historical and superseded.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 44 now has an explicit top-level docs authority split that later `mechanics.md` and `memory.md` rewrites can build on cleanly.
- `44-02` can rewrite the normative gameplay baseline without competing with stale product or stack docs.

## Self-Check: PASSED

- FOUND: `.planning/phases/44-gameplay-docs-baseline-alignment/44-01-SUMMARY.md`
- FOUND: `7288a89`
- FOUND: `d792274`

---
*Phase: 44-gameplay-docs-baseline-alignment*
*Completed: 2026-04-11*
