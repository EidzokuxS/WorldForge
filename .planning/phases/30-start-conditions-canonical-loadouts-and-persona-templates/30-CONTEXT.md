# Phase 30: Start Conditions, Canonical Loadouts, and Persona Templates - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 30 extends the shared `CharacterDraft` / `CharacterRecord` foundation established by Phase 29. It must convert the current transient starting-location flow into persisted `startConditions`, derive canonical loadouts from structured scenario state, and introduce persona templates that can seed both player and NPC draft generation.

The implementation baseline is the current Phase 29 worktree, not the last green commit. Both character creation pages already hold full `CharacterDraft` state, world review NPC editing already round-trips draft-backed NPCs, and backend save/load already persists canonical `characterRecord` JSON plus compatibility fields. Phase 30 must build directly on those seams.

</domain>

<decisions>
## Decisions

### Locked Decisions
- Build on the current Phase 29 worktree as the implementation baseline; do not plan against the last fully committed pre-29 state.
- Replace loose starting-location resolution with persisted `startConditions` rather than introducing another transient helper layer.
- Canonical loadout derivation must come from structured scenario/context state and end at real item materialization, not remain a detached equipped-string list.
- Persona templates must be reusable across player and NPC flows and must feed the shared draft pipeline rather than separate player-only or NPC-only models.
- Creation and review surfaces must expose the new fields through existing draft seams; do not create alternate frontend data models.

### Claude's Discretion
- Exact persistence shape for persona templates is open as long as templates are storable/selectable within a campaign and reusable by both player and NPC flows.
- Exact start-condition subfield granularity is open as long as Phase 30 persists the Phase 28 ontology fields needed for location, arrival circumstances, and prompt/runtime reuse.
- Loadout derivation can use deterministic rule composition with optional AI-assisted scenario resolution, but final persisted loadout and item rows must be deterministic and auditable.
- Compatibility strategy is open as long as existing saves, runtime readers, and the partially closed Phase 29 worktree remain functional during migration.

### Deferred Ideas
- Do not drift into Phase 31 prompt harmonization or broad prompt-family rewrites.
- Do not turn this into the Phase 32 desktop-first UI overhaul.
- Do not redesign memory/retrieval or unrelated gameplay balance systems.
- Do not require cross-campaign/global persona libraries in Phase 30 unless campaign-local storage proves insufficient.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 28 handoff: `28-phase-29-30-handoff.md`
- Phase 28 ontology: `28-character-ontology-spec.md`
- Canonical types: `shared/src/types.ts`
- Backend persistence/adapters: `backend/src/character/record-adapters.ts`, `backend/src/routes/character.ts`, `backend/src/db/schema.ts`
- Runtime readers: `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/state-snapshot.ts`, `backend/src/engine/tool-executor.ts`
- Frontend draft seams: `frontend/app/character-creation/page.tsx`, `frontend/app/campaign/[id]/character/page.tsx`, `frontend/components/character-creation/character-card.tsx`, `frontend/components/world-review/npcs-section.tsx`, `frontend/lib/character-drafts.ts`

### Established Patterns
- Canonical data is already persisted as `characterRecord` JSON with legacy bridge columns kept in sync for runtime compatibility.
- Character generation/import already funnels through shared draft helpers on both backend and frontend.
- World review NPC editing already uses `CharacterDraft` as the source of truth while projecting back to scaffold NPC compatibility shapes.
- Campaign DB migrations run lazily on campaign load through Drizzle migrations in `campaign/manager.ts`.

### Integration Points
- `POST /api/worldgen/resolve-starting-location` and `backend/src/worldgen/starting-location.ts`
- `POST /api/worldgen/save-character`
- `GET /api/campaigns/:id/world`
- World scaffold save/load for NPC drafts
- Prompt assembler player/NPC compact views

</code_context>

<specifics>
## Specific Ideas

- Keep the current route and page seams as migration-compatible shells where possible, but route them through richer internal services.
- Prefer lightweight UI additions to the existing draft editors over new workflow pages.
- Treat old `players.equippedItems` and missing `character_record` columns as compatibility concerns that still exist in real campaign DBs.
- Make Phase 30 planning explicit about which work is code-only and which work requires lazy backfill or data migration behavior.

</specifics>
