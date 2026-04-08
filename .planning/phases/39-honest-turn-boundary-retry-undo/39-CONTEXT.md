# Phase 39: Honest Turn Boundary, Retry & Undo - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the player-visible end of a turn match the authoritative rollback boundary used by `retry` and `undo`.

This phase covers:
- when a turn is considered complete from the player's perspective
- which runtime mutations belong inside the authoritative last-turn boundary
- what `retry` and `undo` must restore for the most recent completed turn
- the gameplay UI readiness contract for "turn done" vs "still processing"

This phase does **not** promise:
- durable multi-step undo history
- checkpoint artifact fidelity across restart
- full campaign restore beyond the most recent completed turn
- route-tree redesign or transport changes beyond what is necessary for the honest turn contract
- new simulation systems beyond making the current ones truthful at the turn boundary

</domain>

<decisions>
## Implementation Decisions

### Turn Completion Contract
- **D-01:** A turn must not be presented as complete until all mechanics that can change player-visible world state for that turn have finished.
- **D-02:** For Phase 39, the authoritative turn boundary includes the current post-turn simulation stack already wired in `buildOnPostTurn()`: present-NPC ticks, off-screen NPC simulation, reflection checks, and faction ticks.
- **D-03:** `done` must mean "authoritative turn boundary reached", not merely "narration stream finished."

### Retry / Undo Semantics
- **D-04:** `undo` must restore the exact pre-turn world boundary for the most recent completed turn, including post-turn simulation-visible consequences produced by that turn.
- **D-05:** `retry` must restore that same pre-turn boundary first, then replay the same player action from that clean state. It must not leave behind mutations from the abandoned branch.
- **D-06:** Phase 39 keeps single-step `retry/undo`. Depth expansion into multi-step history is a separate problem and stays out of scope.

### UI Readiness Contract
- **D-07:** The gameplay UI must distinguish between "narrative is still streaming" and "the turn is still finalizing." If post-turn work is running, the UI must not expose the turn as fully done yet.
- **D-08:** `retry/undo` controls should be available only after the authoritative turn boundary has been reached for the current last turn.
- **D-09:** If the backend chooses to expose a separate finalization signal instead of overloading the current `done` event, that is acceptable. The invariant is that the UI can no longer treat narration completion alone as full turn completion.

### Scope Guardrails
- **D-10:** Image generation and other best-effort presentation side effects are not part of the authoritative retry/undo boundary in Phase 39 unless they directly mutate gameplay state.
- **D-11:** Auto-checkpoint file creation, checkpoint pruning, and broader save-restore artifact fidelity remain Phase 41 concerns unless they are strictly necessary to avoid lying about last-turn rollback.
- **D-12:** Phase 39 should repair the last-turn authoritative boundary without reopening inventory authority as a separate concern. Inventory truth itself belongs to Phase 38, but Phase 39 must consume whatever authoritative item model Phase 38 establishes.
- **D-13:** Assistant-message `edit` is not the center of this phase. Keep it working, but do not let edit-specific UX or semantics distract from the turn/rollback contract.

### Self-Critique
- **D-14:** Pulling all current post-turn simulation inside the authoritative turn boundary is the simplest honest contract, but it may increase perceived turn latency. That tradeoff is acceptable here because fidelity matters more than optimistic UI.
- **D-15:** Keeping single-step undo avoids scope explosion, but it also means some player expectations will still be narrower than a full timeline model. That limitation must stay explicit.
- **D-16:** Deferring checkpoint artifacts and restart durability keeps the phase focused, but it means Phase 39 alone will not make rollback globally trustworthy across process restarts. That is intentional and must not be oversold.

### Codex's Discretion
- Exact wire format for the turn-finalization signal (`done` replacement, additional SSE event, or equivalent readiness contract) as long as the semantics become honest.
- Whether the implementation uses richer snapshots, post-turn summary capture, or another rollback-safe mechanism, as long as the restored boundary matches the completed-turn contract.
- Exact UI wording for the intermediate "finalizing turn" state.

</decisions>

<specifics>
## Specific Ideas

- The main product question here is not "how many systems run after a turn," but "what the player is allowed to believe `done` means."
- If a faction/NPC/reflection change can alter the world panels or later gameplay immediately after a turn, it belongs in the same authoritative boundary for `retry/undo`.
- The cleanest contract is: the player gets one honest completion signal, and `retry/undo` operate against that exact boundary rather than against a half-finished shell state.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and requirement baseline
- `.planning/ROADMAP.md` — Phase 39 goal, dependency chain, success criteria.
- `.planning/REQUIREMENTS.md` — `RINT-02` and `SIMF-02` define the runtime and simulation integrity contract for this phase.
- `.planning/PROJECT.md` — v1.1 is reconciliation-driven and prioritizes gameplay truthfulness over optimistic UX.
- `.planning/STATE.md` — current milestone position and continuity notes.

### Prior reconciliation and transport decisions
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md` — Group A3 is the direct source for this phase.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-CLAIMS.md` — source claims for turn loop, simulation, and checkpoints (`TURN-*`, `WORLD-*`, `SAVE-*`).
- `.planning/phases/37-campaign-loaded-gameplay-transport/37-CONTEXT.md` — Phase 37 scope guardrails and explicit note that turn-boundary honesty was intentionally deferred to Phase 39.

### Gameplay design docs
- `docs/concept.md` — `Anatomy of a Turn`, `World Structure`.
- `docs/mechanics.md` — `The Oracle Flow`, `Character System (3 Tiers) / Key Characters ("AI Players")`, `World Engine (Macro-Simulation)`, `Death & Defeat`.
- `docs/memory.md` — `Prompt Assembly`, `Save / Load System / Operations`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/engine/turn-processor.ts`: current authoritative turn generator, including the point where `done` is emitted and post-turn work is kicked off.
- `backend/src/routes/chat.ts`: current `buildOnPostTurn()` stack and the existing `retry/undo` route semantics.
- `backend/src/engine/state-snapshot.ts`: current snapshot capture/restore seam for rollback.
- `frontend/app/game/page.tsx`: current readiness and control exposure logic for action submission, retry, undo, and post-turn UI state.

### Established Patterns
- Gameplay transport now uses explicit `campaignId` from Phase 37, so Phase 39 can focus on boundary honesty instead of session coupling.
- Post-turn systems are already centralized behind `buildOnPostTurn()`, which makes the boundary repair targetable.
- Current rollback is pre-turn snapshot based, not timeline-based, and only supports the latest turn.

### Integration Points
- `backend/src/engine/turn-processor.ts`
- `backend/src/routes/chat.ts`
- `backend/src/engine/state-snapshot.ts`
- `frontend/app/game/page.tsx`
- related tests in `backend/src/routes/__tests__/chat.test.ts`, `backend/src/engine/__tests__/turn-processor.test.ts`, and `frontend/app/game/__tests__/page.test.tsx`

</code_context>

<deferred>
## Deferred Ideas

- Multi-step undo / persistent history stack.
- Cross-restart rollback durability.
- Route-level redesign to `/campaign/[id]/game`.
- Broader checkpoint artifact cleanup and save-list semantics beyond what Phase 39 strictly needs for last-turn honesty.

</deferred>

---

*Phase: 39-honest-turn-boundary-retry-undo*
*Context gathered: 2026-04-08*
