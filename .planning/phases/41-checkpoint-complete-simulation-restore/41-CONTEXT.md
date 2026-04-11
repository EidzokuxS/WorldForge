# Phase 41: Checkpoint-Complete Simulation Restore - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Restore full campaign-authoritative runtime state when loading checkpoints so later gameplay continues from the restored timeline instead of a partially restored hybrid state. This phase repairs restore fidelity for already-existing systems; it does not add new gameplay mechanics.

</domain>

<decisions>
## Implementation Decisions

### Restore Contract
- **D-01:** Checkpoint save/load must restore one coherent authoritative bundle: `state.db`, `config.json`, `chat_history.json`, and the campaign vector store used by runtime retrieval.
- **D-02:** `config.json` is part of authoritative runtime state for this phase, not optional side metadata. Tick and other campaign runtime metadata must round-trip through checkpoint restore.
- **D-03:** Later turns after checkpoint load must read restored state only; mutations from the discarded timeline must not leak through singleton handles or stale runtime pointers.

### Restore Semantics
- **D-04:** Phase 41 should align checkpoint restore semantics with the Phase 39 turn-boundary restore contract instead of inventing a second restore model with different guarantees.
- **D-05:** Restore must explicitly invalidate and reopen DB/vector connections so no stale handles survive after bundle replacement.
- **D-06:** Retry, undo, and checkpoint load should end on the same campaign boundary contract for NPC autonomy, reflection, and faction/world simulation inputs.
- **D-07:** Checkpoint restore must also clear per-campaign in-memory runtime state from the discarded branch, including live turn snapshots, active-turn guards, and same-turn reflection evidence queues.

### Scope Guardrails
- **D-08:** This phase repairs restore fidelity only. It does not redesign inventory authority, target-aware oracle logic, start-condition mechanics, travel semantics, or gameplay docs.
- **D-09:** Asynchronous best-effort artifacts that are not part of the authoritative campaign boundary stay out of scope unless they are already promised by the live restore contract.

### the agent's Discretion
- Exact helper factoring between checkpoint restore and turn-boundary restore.
- Whether checkpoint and turn-boundary flows share one lower-level bundle-restore utility or coordinated wrappers over shared primitives.
- Exact file-layout details for checkpoint bundles, as long as the restore contract above stays intact.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and requirement baseline
- `.planning/ROADMAP.md` — Phase 41 goal, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` — `RINT-03` and `SIMF-03` authoritative requirement contract.
- `.planning/PROJECT.md` — milestone-level non-negotiable: backend state remains the mechanical source of truth.
- `.planning/STATE.md` — current repaired baseline from Phases 37, 39, and 40.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md` — source handoff identifying checkpoint/config restore gaps.

### Prior repaired contracts
- `.planning/phases/39-honest-turn-boundary-retry-undo/39-CONTEXT.md` — turn-boundary restore decisions that Phase 41 must stay compatible with.
- `.planning/phases/40-live-reflection-progression-triggers/40-CONTEXT.md` — reflection/progression expectations that must survive restore coherently.

### Runtime storage and restore docs
- `docs/memory.md` — documented storage model and save/load expectations for SQLite, LanceDB, and campaign files.

### Restore implementation seams
- `backend/src/campaign/checkpoints.ts` — checkpoint save/load behavior that currently omits `config.json`.
- `backend/src/engine/state-snapshot.ts` — existing rollback bundle behavior from Phase 39, including `config.json` restore.
- `backend/src/campaign/manager.ts` — authoritative `config.json` fields and campaign load behavior.
- `backend/src/routes/chat.ts` — retry/undo boundary orchestration and rollback-critical post-turn flow.
- `backend/src/db/index.ts` — DB connection lifecycle that must be invalidated/reopened cleanly during restore.
- `backend/src/vectors/connection.ts` — vector DB connection lifecycle used during restore/load flows.
- `backend/src/vectors/episodic-events.ts` — same-turn evidence queue that must not leak across restored timelines.
- `backend/src/engine/reflection-agent.ts` — reflection read path that consumes restored evidence/state after load.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/campaign/checkpoints.ts`: existing checkpoint metadata, SQLite backup, vector-copy, and reconnect flow.
- `backend/src/engine/state-snapshot.ts`: existing pre-turn bundle capture/restore logic already restoring `config.json` and `chat_history.json`.
- `backend/src/campaign/manager.ts`: `readCampaignConfig()`, `loadCampaign()`, and config-backed runtime helpers (`incrementTick`, IP context, divergence, persona templates).

### Established Patterns
- SQLite is treated as structured source of truth and LanceDB as retrieval memory; restore flows already close and reopen global connections.
- Phase 39 established a rollback bundle contract for retry/undo that excludes vectors but includes `state.db`, `config.json`, and `chat_history.json`.
- Campaign runtime metadata such as `currentTick`, `ipContext`, `premiseDivergence`, `worldbookSelection`, and `personaTemplates` already live in `config.json`.
- Per-campaign gameplay readiness and same-turn evidence still have in-memory seams (`chat.ts`, `episodic-events.ts`) that must be invalidated on restore to avoid discarded-timeline leakage.

### Integration Points
- Checkpoint create/load path in `backend/src/campaign/checkpoints.ts`.
- Turn-boundary snapshot capture/restore in `backend/src/engine/state-snapshot.ts`.
- Campaign reload and singleton reattachment in `backend/src/campaign/manager.ts`.
- Gameplay restore callers in `backend/src/routes/chat.ts`.

</code_context>

<specifics>
## Specific Ideas

- Prefer one coherent restore contract across checkpoint load and turn-boundary restore rather than two partially overlapping restore models.
- Treat `config.json` as part of simulation truth, not as UI-only metadata.
- Keep restore-time promises narrow and defensible: authoritative gameplay boundary first, secondary background artifacts only if they materially participate in later turns.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- `2026-03-29-add-reusable-multi-worldbook-library.md` — keyword-matched on `campaign`, but unrelated to restore fidelity and left out of Phase 41.
- `2026-03-30-add-lore-card-editing-and-deletion.md` — weak keyword match only; unrelated to checkpoint/runtime restore scope.

None beyond these false-positive todo matches — discussion stayed within phase scope.

</deferred>

---

*Phase: 41-checkpoint-complete-simulation-restore*
*Context gathered: 2026-04-11*
