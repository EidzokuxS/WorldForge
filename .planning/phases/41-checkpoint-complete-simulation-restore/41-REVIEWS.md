---
phase: 41
reviewers: [gemini, claude]
reviewed_at: 2026-04-11T10:42:00Z
plans_reviewed:
  - 41-01-PLAN.md
  - 41-02-PLAN.md
---

# Cross-AI Plan Review — Phase 41

## Gemini Review

# Plan Review: Phase 41 — Checkpoint-Complete Simulation Restore

## 1. Summary
The plans for Phase 41 provide a robust and surgically precise approach to resolving the "hybrid state" problem during campaign restores. By converging the ad-hoc checkpoint logic with the authoritative turn-boundary contract from Phase 39, Plan 01 ensures that `config.json` (and thus `currentTick` and metadata) is finally treated as a first-class citizen of the world state. Plan 02 completes the integrity loop by formalizing a "runtime invalidation" seam, which is critical for clearing in-memory buffers (undo snapshots, active-turn guards, and reflection evidence) that would otherwise leak from a discarded timeline into a restored one.

## 2. Strengths
- **Single Source of Truth (SSOT) Convergence**: Instead of maintaining two drifting restore models, the plans unify them into a shared `restoreCampaignBundle` primitive. This reduces architectural surface area and prevents future bugs where one restore path forgets an artifact.
- **Manager-First Reopening**: Moving away from ad-hoc `connectDb()` calls in the checkpoint logic to the authoritative `loadCampaign()` path ensures that the `activeCampaign` singleton is properly refreshed from disk.
- **Runtime Coherence**: Plan 02 correctly identifies that filesystem restoration is insufficient on its own. Clearing the `pendingCommittedEvents` and `lastTurnSnapshots` is essential for the "Honest Turn Boundary" promise.
- **Strict Scope Guardrails**: The plans strictly adhere to the D-08 guardrail, avoiding the temptation to refactor inventory or travel mechanics while fixing the underlying persistence layer.
- **TDD-First Approach**: The use of explicit failing tests to pin the artifact contract (`config.json` inclusion) and the invalidation behavior (clearing the undo buffer) provides high confidence in the verification phase.

## 3. Concerns
- **Asynchronous Mutation Bleed (Severity: MEDIUM)**: While Plan 02 clears the *queue* of pending events, it doesn't explicitly address active, in-flight async promises (e.g., a storyteller or embedding call that is currently awaiting a network response). If a restore occurs while a network call is pending, the eventual callback might attempt to mutate the *newly restored* state with data from the *discarded* branch.
- **Handle Invalidation Timing (Severity: LOW)**: Plan 01 calls `closeDb()` and `closeVectorDb()`. There is a small risk of "File in use" errors on Windows if the underlying SQLite/LanceDB drivers don't release handles immediately upon closing, especially if an async task is still holding a reference.

## 4. Suggestions
- **Restore Epochs**: To mitigate the "Async Mutation Bleed," consider adding a simple `restoreEpoch` (integer or UUID) to the campaign manager. When a restore occurs, increment the epoch. Every post-turn or auxiliary callback should check if its `startEpoch` matches the current `manager.epoch` before committing any side effects. (This can be deferred as per Research recommendation, but it's a cleaner long-term fix than just clearing queues).
- **Atomic Directory Swap**: For the `vectors/` directory restoration, ensuring the `rmSync` and `cpSync` happen as close to atomically as possible is good, but Plan 01's approach is standard for this project's local-file model.

## 5. Risk Assessment: LOW
The risk is low because:
1. The project already has working (though partial) restore models to use as templates.
2. The plans focus on file-system operations and simple in-memory map clearing, which are deterministic.
3. The dependency on Phases 39 and 40 is well-managed, specifically regarding the "same-turn evidence" queue which was a known risk area.
4. The TDD strategy will immediately catch if `config.json` values (like `currentTick`) fail to round-trip, which is the most likely regression point.

**Verdict: Approved.** Proceed with implementation.

---

## the agent Review

# Phase 41: Checkpoint-Complete Simulation Restore — Plan Review

## Plan 41-01: Converge Checkpoint and Turn-Boundary Restore onto One Authoritative Bundle Contract

### Summary

A well-scoped plan that addresses the most concrete gap in checkpoint fidelity: the missing `config.json` in checkpoint capture/load and the divergent restore semantics between checkpoints and Phase 39 snapshots. The TDD approach with two tasks (lock contract in tests, then implement shared helper) is clean and matches the project's established execution pattern. The plan correctly identifies that convergence should happen at the semantics level (invalidate-copy-reopen), not at the artifact scope level (keeping vectors out of Phase 39).

### Strengths

- **Precise artifact contract** — the `must_haves.truths` enumerate exactly what must round-trip (`currentTick`, `ipContext`, `premiseDivergence`, `worldbookSelection`, `personaTemplates`), leaving no ambiguity for the executor.
- **Clean separation from Plan 02** — Plan 01 handles the file-level bundle contract; Plan 02 handles in-memory runtime invalidation. No overlap.
- **Correct scope discipline** — explicitly excludes `meta.json`, images, and other best-effort artifacts per D-08/D-09. The `key_links` section traces each connection back to specific context decisions.
- **Reuses existing `loadCampaign()` path** — avoids the anti-pattern of ad-hoc reconnect that the current `loadCheckpoint()` uses. This is the single highest-value change in the plan.
- **TDD anchoring is specific** — the `behavior` block for each task names exact assertions rather than vague "verify it works" language.

### Concerns

- **MEDIUM — `captureCampaignBundle` not fully specified.** The plan mentions a shared capture primitive in the `artifacts` block and `key_links`, but Task 2's `action` text focuses heavily on restore. The capture side (adding `config.json` to `createCheckpoint`) gets one sentence. The executor might under-test the capture path. The `acceptance_criteria` grep pattern includes `captureCampaignBundle` but the action text doesn't describe its shape clearly.

- **LOW — SQLite backup semantics for checkpoint vs. file copy for snapshot.** `createCheckpoint` uses `getSqliteConnection().backup()` for safe SQLite backup, while `captureSnapshot` also uses `.backup()`. The shared helper for the restore side uses `fs.copyFileSync`. This asymmetry between capture (backup API) and restore (file copy) is correct but worth noting — the plan doesn't accidentally propose switching capture to file copy, which would be unsafe.

- **LOW — No explicit error handling specification for partial restore failure.** If `config.json` copy succeeds but `loadCampaign()` fails, the campaign is in an inconsistent state. The existing `restoreSnapshot` doesn't handle this either, so it's inherited debt rather than new risk, but worth the executor knowing.

### Suggestions

- Add one sentence to Task 2's action clarifying the capture-side contract: "Update `createCheckpoint` to copy `config.json` into the checkpoint directory alongside the existing `state.db` backup, `vectors/` copy, and `chat_history.json` copy."
- Consider whether the shared `restoreCampaignBundle` should accept a `clearRuntimeState` callback (as shown in the research code example) or whether that's Plan 02's concern. The current plan text is ambiguous — the `key_links` don't mention runtime-state clearing in Plan 01, but an executor might wonder whether to add the parameter now or later.

### Risk Assessment

**LOW.** This is a well-bounded file-manipulation refactor with clear before/after contracts. The main risk — breaking existing Phase 39 snapshot behavior — is explicitly tested. The plan doesn't touch routes, UI, or any user-facing surface beyond the internal restore path.

---

## Plan 41-02: Clear Discarded-Timeline Runtime State on Checkpoint Restore

### Summary

Addresses the harder half of Phase 41: ensuring that in-memory runtime state from the discarded timeline doesn't leak into post-restore gameplay. The plan correctly identifies three independent leakage vectors (last-turn snapshots, active-turn guards, and pending committed events) and proposes extracting them into a testable module. The module extraction (`runtime-state.ts`) is the right architectural move — it makes the route file cleaner while giving checkpoint restore a clean import path for invalidation.

### Strengths

- **Correct identification of all three leakage vectors** — `lastTurnSnapshots`, `campaignsWithActiveTurn`, and `pendingCommittedEvents` are exactly the in-memory stores that survive file replacement.
- **Campaign-scoped invalidation** — Test 4 explicitly verifies that clearing one campaign's state doesn't affect others. This is important because the maps are keyed by `campaignId`.
- **Module extraction is justified** — moving route-local state into `runtime-state.ts` solves a real import-cycle problem (checkpoint code shouldn't import route code) while making the state testable independently.
- **Correct dependency ordering** — Plan 02 depends on Plan 01, which means the shared bundle helper exists before runtime invalidation is wired in.
- **Aligned with Phase 39 and 40 contracts** — the plan explicitly references prior phase summaries and ensures compatibility.

### Concerns

- **MEDIUM — `clearPendingCommittedEvents` is tick-agnostic but the existing API is tick-scoped.** The current `drainPendingCommittedEvents(campaignId, tick)` filters by tick. A checkpoint restore needs to clear ALL pending events for a campaign regardless of tick, since the entire timeline is discarded. The plan's `action` text says "removes queued same-turn evidence for one campaign" but doesn't specify whether this is a new tick-agnostic overload or reuses the existing tick-filtered drain. The executor needs clarity here — a tick-agnostic clear is correct for restore, but the plan should say so explicitly.

- **MEDIUM — Auxiliary post-turn work race condition.** `queueAuxiliaryPostTurnWork()` fires async embedding/image work that reads `drainPendingCommittedEvents`. If checkpoint load happens while auxiliary work from a previous turn is still running, the async callback could race with the restore. The plan mentions D-07 but doesn't address the research's Pitfall 4 (restore-epoch gating for long-lived async completions). The research recommends "add restore-epoch gating only if tests show stale async completions still mutate restored campaigns" — but the plan doesn't include a test for this case. Given that auxiliary work is fire-and-forget (`void (async () => ...)`), this race is real but low-probability in single-player.

- **LOW — Test complexity in `chat.test.ts`.** The existing chat test file is already 800+ lines. Adding checkpoint-restore regressions here increases its size further. The plan could suggest a separate test file for checkpoint-restore integration tests, but this is a minor organizational concern.

- **LOW — No explicit test for "take a new turn after checkpoint restore."** The research's minimum test case 4 ("After checkpoint restore, take a new turn and verify NPC/reflection/faction post-turn work runs from restored state without stale-turn errors") is not directly represented in Plan 02's test behaviors. Tests 1-4 cover invalidation verification but not the positive case of successful post-restore gameplay. This is arguably integration-test scope rather than unit-test scope, but it's worth noting.

### Suggestions

- Clarify that `clearPendingCommittedEvents(campaignId)` should be a **new tick-agnostic helper** that removes all entries for the given campaign, not a wrapper around the existing tick-filtered drain. The existing `drainPendingCommittedEvents` should remain unchanged for normal post-turn use.
- Add a brief note about the auxiliary work race: "If tests reveal stale async completions mutating restored campaigns, add a restore-epoch guard. For Phase 41, clearing the queue before restore is the minimum viable fix per the research recommendation."
- Consider whether `clearCampaignRuntimeState` in `runtime-state.ts` should also call `clearPendingCommittedEvents` from `episodic-events.ts`, or whether checkpoint load calls both independently. A single entry point is safer (callers can't forget one), but creates a cross-module dependency. The plan's `key_links` show checkpoint load calling both separately, which is fine but should be explicit.

### Risk Assessment

**LOW-MEDIUM.** The module extraction is straightforward, and the invalidation logic is simple (delete map entries). The medium risk comes from the auxiliary work race condition — it's unlikely to manifest in single-player testing but is a correctness gap that could cause confusion in rare timing windows. The plan's scope is well-contained and doesn't touch any gameplay mechanics or UI.

---

## Cross-Plan Assessment

### Phase Goal Coverage

| Success Criterion | Plan 01 | Plan 02 | Coverage |
|---|---|---|---|
| SC-1: Saving/loading restores same gameplay state, tick, and runtime metadata | Full | — | Complete |
| SC-2: Later turns reflect restored simulation state, not discarded timeline | Partial (file-level) | Full (memory-level) | Complete |
| SC-3: Retry, undo, and checkpoint load align on same campaign boundary | Partial (shared restore helper) | Full (shared runtime-state seam) | Complete |

### Requirement Coverage

| Requirement | Plan 01 | Plan 02 | Coverage |
|---|---|---|---|
| RINT-03 | `config.json` round-trip, full bundle | Runtime invalidation | Complete |
| SIMF-03 | — | Stale evidence/snapshot clearing | Complete |

### Overall Verdict

**Well-designed phase with appropriate two-plan decomposition.** Plan 01 handles the data plane (what files are captured/restored), Plan 02 handles the control plane (what runtime state is invalidated). The plans don't overlap, have correct dependency ordering, and stay within the scope guardrails from CONTEXT.md.

The two medium concerns (tick-agnostic clearing and auxiliary work race) are execution details that a competent implementer would resolve naturally, but calling them out explicitly in the plan text would reduce ambiguity. Neither is a blocking issue.

**Overall Risk: LOW.**

---

## Consensus Summary

Both reviewers consider the phase structurally sound and approved for execution. The shared assessment is that the split between `41-01` and `41-02` is correct: one plan fixes the authoritative artifact bundle and restore contract, the other fixes discarded-timeline in-memory leakage so later simulation uses only the restored branch.

### Agreed Strengths
- The phase is well-scoped and avoids bleeding into adjacent fidelity work from Phases `38`, `42`, `43`, and `44`.
- Reusing `loadCampaign()` as the reopen seam is the right move and eliminates the current ad-hoc reconnect path in checkpoint restore.
- The two-plan decomposition is clean: data-plane restore contract in `41-01`, runtime/control-plane invalidation in `41-02`.
- TDD coverage is concrete and anchored to explicit restore behaviors rather than vague “works after restore” assertions.

### Agreed Concerns
- `41-02` should be explicit that `clearPendingCommittedEvents(campaignId)` is a new campaign-scoped, tick-agnostic clear path for restore, not a reuse of normal tick-filtered drain semantics.
- There is a real, though probably low-frequency, race where long-lived auxiliary async work from the discarded branch could still mutate restored state. The current plans acknowledge the seam but do not fully pin restore-epoch behavior.

### Divergent Views
- Gemini is more comfortable treating the auxiliary async race as follow-up debt and still rates overall risk as `LOW`.
- the agent review is slightly stricter and calls out a second medium concern around under-specified `captureCampaignBundle` semantics in `41-01`, though it still considers the plans non-blocking and ready for execution.
