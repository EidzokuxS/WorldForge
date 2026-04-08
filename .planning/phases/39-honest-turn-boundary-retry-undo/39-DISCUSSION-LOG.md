# Phase 39: Honest Turn Boundary, Retry & Undo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `39-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 39-honest-turn-boundary-retry-undo

## Inputs Considered

- Roadmap goal and success criteria from `.planning/ROADMAP.md`
- Requirements `RINT-02` and `SIMF-02` from `.planning/REQUIREMENTS.md`
- Phase 36 handoff priority item `A3`
- Phase 37 transport boundary and guardrails
- Live code in:
  - `backend/src/engine/turn-processor.ts`
  - `backend/src/routes/chat.ts`
  - `backend/src/engine/state-snapshot.ts`
  - `frontend/app/game/page.tsx`

## Gray Areas Identified

1. **What counts as turn completion**
   - Option A: keep current optimistic contract where `done` means narration complete and simulation continues after
   - Option B: redefine completion so all player-visible post-turn simulation is inside the authoritative boundary
   - Selected: **Option B**
   - Rationale: this is the only contract that can make `retry/undo` honest without lying to the player

2. **Which post-turn systems belong inside rollback**
   - Option A: only immediate tool mutations from the narrated turn
   - Option B: immediate tool mutations plus present/off-screen NPC ticks, reflection checks, and faction ticks already wired in `buildOnPostTurn()`
   - Selected: **Option B**
   - Rationale: those systems already produce player-visible world changes closely coupled to the just-finished turn

3. **How broad undo semantics should become**
   - Option A: expand to multi-step history in this phase
   - Option B: keep single-step undo but make that one step honest
   - Selected: **Option B**
   - Rationale: multi-step history is a different feature and would blur this integrity phase into a larger timeline system

4. **What to do with peripheral side effects**
   - Option A: include every async side effect, including image jobs and checkpoint artifacts, in the authoritative boundary
   - Option B: keep gameplay-state effects in scope and defer checkpoint artifact/image fidelity unless strictly required
   - Selected: **Option B**
   - Rationale: keeps the phase aligned to rollback truth instead of absorbing all persistence concerns ahead of Phase 41

5. **How much UI behavior should change**
   - Option A: keep current UI and only patch backend semantics
   - Option B: give the UI an honest distinction between streaming and turn finalization, and expose retry/undo only after finalization
   - Selected: **Option B**
   - Rationale: backend honesty without UI honesty still leaves the player with a false completion signal

## Why No Interactive Menu

The user had already delegated the technical side and asked for the builder to make the technical calls. This discuss-phase was therefore executed in an effective auto/recommended mode rather than re-interviewing for choices the user had explicitly handed off.

## Rejected Scope

- Multi-step undo timeline
- Durable rollback across server restart
- Route redesign
- Full checkpoint artifact fidelity
- New gameplay mechanics unrelated to honest turn boundaries

---

*Discussion log generated: 2026-04-08*
