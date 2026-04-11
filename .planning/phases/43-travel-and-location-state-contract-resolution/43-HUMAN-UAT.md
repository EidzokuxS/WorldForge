---
status: partial
phase: 43-travel-and-location-state-contract-resolution
source: [43-VERIFICATION.md]
started: 2026-04-11T19:55:06.2486325+03:00
updated: 2026-04-11T20:00:00+03:00
---

## Current Test

Live smoke produced one concrete issue in travel UX/behavior. Longer revisit/archive checks are deferred to broader milestone playtest.

## Tests

### 1. Major-location travel feel
expected: Moving to a distant location shows path-bound travel cost in the location panel and completes with streamed `location_change` feedback that names the destination, path, and tick cost.
result: issue reproduced — travel is surfaced as a typed action even when the target is already the current location, and the returned narration duplicates arrival/you-are-already-here copy instead of resolving cleanly.

### 2. Revisit local history
expected: After creating notable events in a location, leaving, and revisiting, the location surface shows local recent happenings for that place rather than only global chronicle prose.
result: [deferred to milestone-level gameplay verification]

### 3. Ephemeral scene consequence retention
expected: Temporary scene nodes can expire or archive while anchored recent happenings remain coherent on the persistent location after revisit or checkpoint load.
result: [deferred to milestone-level gameplay verification]

## Summary

total: 3
passed: 0
issues: 1
pending: 0
skipped: 2
blocked: 0

## Gaps

### 1. Current-location travel is still offered and narrated as if it were meaningful movement
status: failed
notes:
- `/game` still offers a move action to the current location.
- Travel resolves through normal action narration and can duplicate "already here" copy instead of short-circuiting cleanly.
- This should be handled as a Phase 43 gap closure, not deferred to milestone playtest.
