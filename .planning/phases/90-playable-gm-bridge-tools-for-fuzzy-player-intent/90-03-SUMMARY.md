---
phase: 90-playable-gm-bridge-tools-for-fuzzy-player-intent
plan: 90-03
subsystem: engine
tags: [gm-read, clarification-review, fuzzy-intent, bridge-tools]
requires:
  - phase: 90-01
    provides: observation-only bridge lookup tools
  - phase: 90-02
    provides: constrained bridge state tools
provides:
  - compact fuzzy-intent bridge policy in GM Read and GM Action Checklist prompt contracts
  - parser-like clarification reviewer and repair gate
  - turn-processor review before visible clarification output
key-files:
  created:
    - backend/src/engine/clarification-reviewer.ts
    - backend/src/engine/__tests__/clarification-reviewer.test.ts
  modified:
    - backend/src/engine/prompt-contracts.ts
    - backend/src/engine/gm-turn-read.ts
    - backend/src/engine/gm-action-checklist.ts
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/gm-turn-read.test.ts
    - backend/src/engine/__tests__/gm-action-checklist.test.ts
    - backend/src/engine/__tests__/turn-processor.scene-plan.test.ts
requirements-completed: [P90-R3, P90-R4, P90-R6]
completed: 2026-05-10
---

# Phase 90 Plan 90-03: GM Fuzzy Intent Policy And Clarification Repair Summary

## Accomplishments

- Added compact GM Read and GM Action Checklist policy that tells the GM to bridge understandable low-risk fuzzy intent with lookup/state bridge tools and legal candidates instead of asking for exact backend strings.
- Added `clarification-reviewer.ts`, which detects parser-like exact-ID/backend-target/connected-location clarification when a route/POI/service-role/search bridge is available.
- Wired clarification review into `turn-processor.ts` before visible clarification output; repaired non-clarification paths continue into the normal Oracle/tool/narrator path.
- Preserved valid clarification for materially different risk/cost, high-impact or irreversible actions, contradictory intent, identity-critical ambiguity, and no-fair-bridge cases.
- Added latency metadata for clarification review without logging raw clarification prompt text.

## Commits

- `2082335` - `docs(90-03): record fuzzy intent policy impact preflight`
- `1902ea0` - `feat(90-03): add fuzzy intent bridge prompt policy`
- `06cefcb` - `feat(90-03): add clarification reviewer repair gate`
- `ff46bb8` - `feat(90-03): review clarifications before visible output`

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-action-checklist.test.ts src/engine/__tests__/clarification-reviewer.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` - passed, 4 files / 62 tests.
- `npm --prefix backend run typecheck` - passed.
- `git diff --check` - passed.
- GitNexus `detect_changes(scope="all")` after commits reported no uncommitted changes.

## Deviations

- Summary was written by the orchestrator because the executor's completion signal did not return and no summary file was present, while commits and verification were already present.
- No implementation scope expansion beyond compact prompt policy, clarification review, and turn-processor routing.

## Residual Risk

- Turn-processor generator symbols were not resolved by GitNexus during preflight; focused source-order and behavior tests cover the visible clarification gate, but live acceptance remains owned by 90-04.

## Self-Check: PASSED

- Required 90-03 implementation commits exist.
- Focused tests, typecheck, diff check, and GitNexus final scope check passed.
- Phase 90-04 can proceed to deterministic and e2e acceptance evidence.
