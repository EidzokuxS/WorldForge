---
phase: 38
reviewers:
  - gemini
  - claude
reviewed_at: 2026-04-12T07:50:29.6118649+03:00
plans_reviewed:
  - 38-01-PLAN.md
  - 38-02-PLAN.md
  - 38-03-PLAN.md
---

# Cross-AI Plan Review — Phase 38

## Gemini Review

### Summary

This is a comprehensive and technically rigorous plan to resolve the long-standing inventory authority split. The three-wave approach correctly sequences the foundation (schema and migration), the logic (backend writers and readers), and the presentation (frontend rendering).

### Strengths

- Integrity-first migration through `loadCampaign()` is the right seam because checkpoint and retry/undo reopen full bundles.
- Plan `38-02` includes a live `processTurn()` reachability proof for the revised `transfer_item` path.
- Legacy projections are kept one-way, which avoids dual-write authority drift.
- Structured item metadata is the right direction versus free-form tags.

### Concerns

- `LOW`: NPC equipment visibility should stay aligned with the same authority resolver used for player state.
- `LOW`: Fail-closed migration errors should remain repairable and include enough context for manual campaign repair.

### Suggestions

- Prefer discrete item-row fields such as an equip-state column and signature flag instead of a JSON blob.
- Explicitly remove or avoid any lingering writes to legacy `equippedItems` outside compatibility projection.

### Risk Assessment

`LOW` — Gemini considers the package ready to execute.

---

## Claude Review

### Summary

This is a well-structured three-plan phase that addresses a real runtime integrity seam: split-brain inventory/equipment state across `items`, `characterRecord.loadout`, and `players.equippedItems`. The wave ordering is sound and the TDD progression is grounded in the actual codebase.

### Strengths

- `38-01` explicitly covers fresh load, checkpoint restore, and retry/undo restore.
- `38-02` keeps a single storyteller/runtime item-state seam by extending `transfer_item` instead of adding new tool names.
- `38-02` now proves live reachability through `processTurn()` and `createStorytellerTools()`, not only direct executor calls.
- `38-03` cleanly removes frontend authority drift and aligns `/game` with backend-derived inventory/equipment arrays.

### Concerns

- `MEDIUM`: The exact item-row schema is still executor discretion; this is acceptable, but it creates some coordination risk across plans.
- `MEDIUM`: Migration idempotency should remain explicit because `loadCampaign()` can run repeatedly after restore flows.
- `MEDIUM`: `spawn_item` must land in a sane default metadata state after the new schema lands.
- `MEDIUM`: NPC equipment authority should not remain only implicit; at least one test should prove NPC reads also use the same authority seam.

### Suggestions

- Add a minimum schema contract so all three plans share one mental model.
- Treat `spawn_item` as default carried/unequipped unless explicitly changed by later runtime mutations.
- Keep `equipState` optional with a sensible default in the `transfer_item` schema extension.
- Include one NPC-equipment authority regression and an explicit migration-idempotency regression.

### Risk Assessment

`LOW-MEDIUM` — the package is solid and executable, with a few watch items worth keeping tight during implementation.

---

## Consensus Summary

Both reviewers agree the Phase 38 package is structurally strong and execution-ready. The core split is correct: first lock schema/migration authority, then converge backend writes and readers, then switch frontend consumers. Both reviewers also agree the central design choice is sound: `items` becomes the only runtime truth, while legacy fields are demoted to one-way compatibility output.

### Agreed Strengths

- The `38-01 -> 38-02 -> 38-03` dependency order is correct.
- `loadCampaign()` is the right place to enforce idempotent migration/backfill for direct load and restore paths.
- Extending existing `transfer_item` is better than adding new `equip` / `unequip` tool names.
- The package now proves storyteller/runtime reachability, not just isolated executor behavior.
- Frontend authority is correctly postponed until the backend contract is repaired.

### Agreed Concerns

- The exact item-row schema is still somewhat open; implementation should keep it explicit and queryable, not heuristic.
- Migration/backfill must stay idempotent because restore flows repeatedly reopen campaign bundles.
- NPC equipment reads must not be left as an implicit side effect of player-focused changes.
- `spawn_item` needs a clear default metadata story once structured equipment fields exist.

### Divergent Views

- Gemini sees overall risk as low and is ready to proceed immediately.
- Claude is slightly more cautious and frames the remaining issues as execution watch items rather than blockers.

## Recommended Follow-Through During Execution

- Keep the item-row schema minimal and explicit.
- Add or preserve one NPC-equipment authority regression.
- Make migration idempotency and `spawn_item` default metadata behavior explicit in implementation and tests.
