# Phase 75 Context - Cross-Phase Promise Audit and Location-Presence Reality Closure

## User Request

The user found a live generated JJK/Shibuya world where the prose quality improved and the narrator responded acceptably, but all relevant characters still appeared to be gathered in Shibuya as one broad place. This contradicts earlier work that was supposed to split large locations into smaller places and keep actors scoped to where they actually are.

The user asked for an autonomous overnight GSD cycle:

1. Audit previous completed phases, not just the latest stack trace.
2. Find promises that are true in planning/docs/schema but not actually wired into live worldgen/runtime behavior.
3. Treat recent implemented decisions as fresher truth than stale older plans, but do not leave stale claims unclassified.
4. Use Gemini/Claude-style external review where useful.
5. Plan Phase 75, review it, incorporate review feedback, execute it, verify it, and create/execute gap closure if anything remains.

## Known Trigger Gap

Claude Code's quick scan pointed at Phases 43 and 46:

- Phase 43 planned travel/location state and a runtime location model that distinguishes macro, persistent sublocation, and ephemeral scene locations.
- Phase 46 planned encounter scope and presence boundaries, including current scene location and resolver behavior.
- Current worldgen persistence appears to save generated locations as macro locations only.
- Current NPC placement appears to map location names directly to broad location ids without distribution into scoped sublocations.
- Runtime scene presence code exists, but the generated world may not feed it useful scoped data.

This is the first release-blocking concrete target for Phase 75, but the phase must not stop at this one bug if the audit finds other stale completed-phase promises.

## Phase Goal

Audit completed phase promises against the current codebase and close the first material reality gap: dense generated worlds must persist/use scoped sublocations and distribute NPC presence so one macro location does not behave like a single small room.

## Requirements

- P75-R1: completed phase artifacts are audited against current code/tests with an evidence matrix.
- P75-R2: user-visible gameplay/worldgen promises are prioritized over cosmetic documentation drift.
- P75-R3: worldgen creates or preserves scoped persistent sublocations for dense macro locations when generated evidence exists.
- P75-R4: worldgen NPC placement assigns NPCs to appropriate scoped locations/current scene presence when evidence exists.
- P75-R5: runtime opening/turn scene participation consumes scoped location/presence data.
- P75-R6: backend deterministic code derives reproducible shape/placement only; LLM/artifacts own semantic interpretation.
- P75-R7: regression coverage proves dense-world NPCs do not all collapse into one macro location.
- P75-R8: remaining stale promises are fixed, explicitly moved to Phase 76/gaps, or deprecated from active truth.

## Constraints

- Work through GSD. Do not replace the GSD cycle with an ad hoc manual fix.
- Once an agent is assigned, do not interrupt it; wait for completion.
- Do not create side worktrees for this phase unless a workflow step absolutely requires isolation. Previous misplaced phase work makes main-tree traceability important here.
- Use GitNexus impact analysis before editing code symbols and detect changes before committing.
- Backend must not infer franchise/canon/source meaning from arbitrary strings. It may deterministically persist, group, cap, and map data already produced by LLM-owned artifacts/scaffolds.
- Verification must prove player-visible behavior path, not only schema existence.

## Expected Deliverables

- `75-PROMISE-AUDIT.md`: phase-by-phase evidence matrix for material completed promises.
- `75-LOCATION-PRESENCE-TRACE.md`: focused trace from worldgen location scaffold through persistence, NPC placement, scene presence, and opening/turn scene selection.
- Implementation fixing the dense-location/NPC distribution gap when confirmed.
- Regression tests for the Shibuya-style dense macro location collapse.
- `75-REVIEWS.md` or equivalent review record with external feedback and responses.
- `75-VERIFICATION.md` proving requirements and closeout gates.

## Initial Files To Inspect

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/`
- `.planning/phases/43-travel-and-location-state-contract-resolution/`
- `.planning/phases/46-encounter-scope-presence-and-knowledge-boundaries/`
- `.planning/phases/55-gap-proof-verification-matrix-and-closeout-truth-alignment/`
- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/`
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/`
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/`
- `.planning/phases/73-structured-output-stability-and-provider-conformance/`
- `.planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/`
- `backend/src/worldgen/scaffold-saver.ts`
- `backend/src/worldgen/scaffold-steps/locations-step.ts`
- `backend/src/worldgen/scaffold-steps/npcs-step.ts`
- `backend/src/engine/scene-presence.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/scene-planner.ts`
