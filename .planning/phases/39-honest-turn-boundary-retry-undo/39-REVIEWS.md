---
phase: 39
reviewers: [claude]
review_failures:
  - reviewer: gemini
    reason: "429 MODEL_CAPACITY_EXHAUSTED / no usable review returned"
skipped_reviewers:
  - reviewer: codex
    reason: "current runtime; skipped for independence"
reviewed_at: 2026-04-08T21:47:22.7232307+03:00
plans_reviewed:
  - 39-01-PLAN.md
  - 39-02-PLAN.md
---

# Cross-AI Plan Review — Phase 39

## Gemini Review

No usable review returned.

Observed failure:
- `429 MODEL_CAPACITY_EXHAUSTED` for `gemini-3-flash-preview`
- Gemini CLI also emitted local agent/skill validation noise before the capacity failure

This is not a plan-quality verdict. It is an external reviewer availability failure.

---

## Claude Review

# Phase 39 Cross-AI Plan Review: Honest Turn Boundary, Retry & Undo

## Plan 39-01: Backend Authoritative Finalization & Single-Step Restore

### Summary

Solid, well-scoped backend plan that correctly identifies the core integrity problem: `done` fires before post-turn simulation completes, and rollback captures only a narrow player-shell snapshot. The approach (Shape B+C from research — explicit `finalizing_turn` event + broadened file-backed rollback) is architecturally sound and respects scope boundaries. TDD-first structure is appropriate.

### Strengths

- **Correct problem decomposition**: separating "narration complete" from "turn complete" is the right architectural fix
- **File-backed rollback bundle** (`state.db`, `config.json`, `chat_history.json`) is much more robust than the current row-level `TurnSnapshot` — captures the full authoritative boundary
- **Explicit scope exclusions**: image gen, checkpoint artifacts, multi-step history clearly out of scope per decisions D-06/D-10/D-11
- **Failure semantics are specified**: rollback-critical finalization failure → restore bundle → emit `error` → no false completion. This is a critical edge case that many plans miss
- **Traceability**: tasks reference specific decisions (D-01 through D-12) directly, making verification against CONTEXT.md straightforward
- **Wave 1 with no dependencies**: correct ordering — backend must be authoritative before frontend can consume the contract

### Concerns

- **HIGH — File copy atomicity and race conditions**: The plan says "capture the authoritative campaign runtime files before a turn begins" but doesn't address atomicity. Copying `state.db` while SQLite WAL mode is active could produce a corrupt snapshot. The implementer needs guidance on using SQLite backup API or checkpoint + copy, not naive `fs.copyFile()`. This is the most likely implementation trap.

- **HIGH — In-memory state not covered by file backup**: The `lastTurnSnapshots` Map and any in-process state in `buildOnPostTurn()` closures won't be captured by copying files alone. If post-turn sim partially mutates `state.db` and then fails, the file restore handles DB state, but are there any in-memory caches (e.g., campaign manager state, loaded NPC objects) that also need invalidation after restore?

- **MEDIUM — `buildOnPostTurn()` error propagation**: Currently fire-and-forget. The plan says to await it, but doesn't specify what happens if one of the four systems (present NPC, offscreen, reflection, faction) fails while others succeed. Is it all-or-nothing? Partial completion? The current `buildOnPostTurn` likely doesn't have transactional semantics — each tick is independent. If `tickPresentNpcs` succeeds but `checkAndTriggerReflections` throws, what state is the world in before restore kicks in?

- **MEDIUM — Performance implications acknowledged but not bounded**: Moving four async simulation systems into the blocking turn path will increase turn latency. The plan accepts this tradeoff (D-14) but gives no guidance on timeouts. What if `simulateOffscreenNpcs` takes 30 seconds because it hits LLM calls? Should there be a timeout that triggers the error/restore path?

- **LOW — Vector DB (LanceDB) not mentioned in rollback**: The rollback bundle covers `state.db`, `config.json`, `chat_history.json`, but episodic events in LanceDB (`campaigns/{id}/vectors/`) are written during turns. If the plan excludes LanceDB from rollback per D-10 (best-effort), that's fine, but it should be stated explicitly so the implementer doesn't accidentally include or exclude it.

- **LOW — Test spec says "Test 3: single-step last-turn restore covers... config.json, chat_history.json"** but the current codebase reads `chat_history.json` via `appendChatMessages` which has a known race condition (per MEMORY.md). Rollback will work, but the test should account for the append pattern.

### Suggestions

- Add explicit guidance on **SQLite backup strategy** — recommend `db.backup()` or `VACUUM INTO` for the pre-turn snapshot rather than file copy, to avoid WAL corruption
- Specify **all-or-nothing semantics** for the post-turn simulation stack: if any rollback-critical system throws, restore the full pre-turn bundle. Don't attempt partial recovery
- Add a **timeout ceiling** for the finalization phase (e.g., 60s) after which the system treats it as a failure and restores
- Explicitly state that **LanceDB vectors are NOT part of the rollback bundle** in Phase 39, with a comment for Phase 41 to revisit
- Consider whether the implementation should **invalidate any in-memory campaign state** after a restore (e.g., force re-read from disk)

### Risk Assessment: **MEDIUM**

The architectural direction is correct and well-scoped. The primary risk is implementation-level: file-backed rollback of an active SQLite database requires careful handling that the plan doesn't specify. A naive implementation will work in happy-path tests but corrupt data under concurrent access or WAL mode. The implementer needs to know about SQLite backup semantics.

---

## Plan 39-02: Frontend Turn-Readiness & Honest UI Contract

### Summary

Clean, well-structured frontend plan that correctly depends on 39-01's backend contract. The core change — replacing `isStreaming` boolean with a three-phase `idle | streaming | finalizing` state machine — is the right abstraction. Scope is appropriately narrow: consume the new SSE event, gate controls honestly, preserve existing features.

### Strengths

- **Correct dependency**: Wave 2, depends on 39-01 — won't be executed until backend contract exists
- **State machine upgrade** from boolean to `idle | streaming | finalizing` is cleaner than adding more booleans and prevents invalid state combinations
- **UI contract is specific**: "different copy for streaming vs finalizing" and "retry/undo hidden until authoritative boundary" — implementer knows exactly what to build
- **Edit preservation**: explicitly calls out D-13 (keep edit working, don't let it distract from turn contract)
- **Minimal component surface**: only touches `api.ts`, `page.tsx`, `narrative-log.tsx`, `action-bar.tsx` — no unnecessary cascading changes

### Concerns

- **MEDIUM — `parseTurnSSE()` handler interface change**: Adding `onFinalizing` to `TurnSSEHandlers` is a breaking interface change. The plan's `interfaces` section shows the current type without it. Any other caller of `parseTurnSSE()` (if any exist) would break. Should verify this is the only call site.

- **MEDIUM — UX copy for "finalizing" state not specified**: D-09 says "the UI can no longer treat narration completion alone as full turn completion" but the plan leaves exact wording to the implementer ("exact UI wording for the intermediate finalizing turn state" is in Codex's Discretion). For a game, this copy matters — "Weaving fate..." vs "Processing world changes..." vs a spinner. A bad choice breaks immersion. Consider providing a suggestion or constraint (e.g., "must be diegetic / in-universe, not technical").

- **MEDIUM — `hasLiveTurnSnapshot` clearing on failed retry**: The plan says "clear it on undo or failed retry" but doesn't address what the UI state should be after a failed retry. Does the user see an error? Can they retry again? Is the action bar re-enabled? The error recovery UX path needs specification.

- **LOW — Potential flicker between streaming → finalizing transition**: If the backend emits `finalizing_turn` immediately after the last narrative chunk, the user might see a brief flash of status change. The plan doesn't specify whether the UI should debounce or smooth this transition.

- **LOW — No mention of `quick_actions`**: The current flow emits quick actions before `done`. With the new flow, quick actions should presumably appear after `done` (authoritative completion), not during `finalizing`. The plan doesn't address when quick actions become visible in the new lifecycle.

### Suggestions

- Verify `parseTurnSSE()` has **only one call site** before changing the interface, or make `onFinalizing` optional for backwards compatibility
- Provide a **UX copy suggestion** for the finalizing state that maintains game immersion (e.g., "The world shifts around you..." rather than "Finalizing turn...")
- Specify the **error recovery path**: after a failed retry, what does the UI show and what controls are available?
- Clarify **quick_actions timing**: should they appear during `finalizing`, after `done`, or unchanged from current behavior?
- Consider a **minimum display time** for the finalizing state (e.g., 500ms) to avoid visual flicker if finalization is fast

### Risk Assessment: **LOW**

This is a straightforward state machine upgrade consuming a well-defined backend contract. The main risks are UX polish issues (copy, transitions, error states) rather than architectural problems. The plan correctly constrains scope and preserves existing features.

---

## Overall Phase Assessment

### Combined Risk: **MEDIUM**

The phase is architecturally well-conceived. The two-plan split (backend authority first, frontend consumption second) is the right decomposition with correct dependency ordering.

**Primary risk vector**: Plan 39-01's file-backed rollback needs more implementation guidance around SQLite atomicity. Everything else is well-scoped and tractable.

**Scope discipline is excellent**: every plan explicitly excludes multi-step undo, checkpoint artifacts, route redesign, and inventory authority — the most common scope-creep vectors for this kind of work.

**One gap across both plans**: neither plan addresses what happens to **WebSocket connections** or **active SSE streams** during a restore. If a restore is triggered by finalization failure, is the current SSE stream still open? Does the client receive the error event on the same connection? This is likely fine given the current architecture (error is emitted on the same stream), but worth confirming.

---

## Consensus Summary

Available review coverage is limited to one usable external review. Gemini did not return a substantive review, so the synthesis below reflects the available reviewer only.

### Agreed Strengths

- The phase boundary is tight and matches `39-CONTEXT.md`.
- Wave ordering is correct: backend authority first, frontend adoption second.
- The two-plan split aligns with the real fault line: authoritative turn finalization on the backend and honest readiness semantics on the frontend.
- Scope discipline is good: multi-step undo, checkpoint fidelity, route redesign, and inventory authority are kept out of this phase.

### Agreed Concerns

- The backend rollback plan needs explicit guidance for **SQLite-safe snapshot capture**; naive file copying is the main implementation hazard.
- The backend plan should state **all-or-nothing finalization semantics** and define what gets invalidated after restore, including any in-memory campaign state.
- The backend plan should bound **finalization latency** and clarify whether LanceDB/vector state is excluded from the rollback bundle in this phase.
- The frontend plan should tighten the contract around **`finalizing` UX**, including copy, quick-action timing, and failed-retry recovery behavior.
- The frontend plan should verify the **`parseTurnSSE()` surface** before making `onFinalizing` a required handler.

### Divergent Views

- No meaningful reviewer divergence was available because only one external review succeeded.
- Gemini reviewer availability failed due to provider capacity, not because of plan content.
