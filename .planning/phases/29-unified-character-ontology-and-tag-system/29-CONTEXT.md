# Phase 29: Unified Character Ontology & Tag System - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase implements the shared character ontology defined in Phase 28. It replaces the current player/NPC/tag drift with one canonical character model, makes flat runtime tags explicitly derived rather than authoritative, and establishes the storage/runtime seams needed before Phase 30 layers on start conditions, canonical loadouts, and persona templates.

</domain>

<decisions>
## Implementation Decisions

### Locked From Phase 28
- One canonical character model serves both player and NPC flows; role/tier are attributes, not separate mental models.
- Flat tags are retained only as derived runtime outputs where still useful.
- Character profile facets such as race, gender, age, and appearance are not player-only concepts anymore.
- Equipment should move toward a first-class shared model instead of player-only `equippedItems` strings.

### Phase Boundary
- Phase 29 owns the ontology, canonical data model, migration seams, adapters, and shared derivation layer.
- Phase 29 must not fully implement the richer starting-state scenario system; that belongs to Phase 30.
- Phase 29 must not turn into the prompt rewrite phase or the UI overhaul phase; those belong to Phases 31 and 32.

### the agent's Discretion
- Exact migration strategy, compatibility layers, and intermediate adapters are at the agent's discretion as long as they preserve working flows and create a stable foundation for Phase 30.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 28 outputs: `28-character-systems-audit.md`, `28-character-ontology-spec.md`, and `28-phase-29-30-handoff.md`
- Backend character surfaces: `backend/src/character/*`, `backend/src/routes/character.ts`, `backend/src/db/schema.ts`
- Runtime consumers: `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/tool-executor.ts`, `backend/src/engine/npc-agent.ts`
- Frontend editors: `frontend/components/character-creation/*`, `frontend/components/world-review/npcs-section.tsx`, `frontend/lib/world-data-helpers.ts`

### Established Patterns
- The repo already uses adapters between DB/runtime/frontend shapes in several places; Phase 29 can follow that compatibility approach during migration.
- Structured generation uses Zod + `safeGenerateObject`, so ontology changes must keep schemas and prompts aligned.

### Integration Points
- DB schema and save/load routes
- Character generation/import and NPC generation/import
- Review editing and scaffold save/load
- Runtime prompt assembly and tool behavior where character data is consumed

</code_context>

<specifics>
## Specific Ideas

- The user explicitly rejected a narrow “which tags are extra?” fix; this phase must solve the broader model problem.
- The resulting character model should make later start-condition, canonical-loadout, and persona-template work straightforward rather than bolted on.
- Preserve working behavior where possible through compatibility layers; avoid gratuitous breakage.

</specifics>

<deferred>
## Deferred Ideas

- Full starting-scenario persistence and canonical loadout resolution belong to Phase 30.
- Prompt family rewrites belong to Phase 31.
- Desktop-first shell and workflow redesign belong to Phase 32.

</deferred>
