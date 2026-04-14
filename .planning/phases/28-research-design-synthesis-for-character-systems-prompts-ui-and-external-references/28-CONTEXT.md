# Phase 28: Research & Design Synthesis for Character Systems, Prompts, UI, and External References - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase is the research-and-synthesis foundation for the next WorldForge milestone. It does not primarily ship end-user features; it produces the concrete architectural and design direction needed for the following implementation phases:
- a shared character model instead of player/NPC drift
- a non-sloppy prompt system with one coherent contract
- a desktop-first non-game UI direction aligned with `docs/ui_concept_hybrid.html`
- explicit decisions on what to borrow from Aventuras and what to reject

</domain>

<decisions>
## Implementation Decisions

### Research Scope
- Treat flat character tags as a symptom of a deeper model problem, not the core problem itself.
- Evaluate the full character/start/equipment/persona model across player creation, NPC generation, runtime prompts, and DB/storage.
- Include external repo research for Aventuras as an input, but only borrow concepts that fit a browser-first localhost architecture.

### UI Direction
- Menus and non-game surfaces should aesthetically move toward `docs/ui_concept_hybrid.html`.
- UX quality is more important than decorative fidelity; the concept is a target mood/language, not a permission slip for clutter.
- Desktop first means explicit optimization for 1080p and 1440p, with strong layout hierarchy and efficient editing workflows.
- No custom CSS files; use Tailwind, shadcn, and compatible libraries only.

### Prompt-System Direction
- Prompt quality is already non-trivial, but the main risk is contract drift and fragmentation.
- The phase must identify prompt families, contradictions, stale instructions, and rewrite principles that can be enforced in the next phase.
- Prompt recommendations must be actionable and grounded in concrete system needs such as structured output fidelity, canon preservation, and anti-slop behavior.

### the agent's Discretion
- Exact plan slicing inside this phase is at the agent's discretion as long as the output is useful for phases 29-33.
- Documentation format may evolve if it better captures the synthesis, but it must stay compatible with GSD planning/execution artifacts.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Character generation/import entry points are already centralized in `backend/src/character/*` and `backend/src/routes/character.ts`.
- Non-game frontend flows already have canonical `[id]` routes for review and character creation, even though legacy query-param routes remain.
- Prompt families are already clustered in `backend/src/engine/*`, `backend/src/worldgen/*`, and `backend/src/character/*`.

### Established Patterns
- Backend uses schema-driven structured generation with `safeGenerateObject`.
- Worldgen already separates canon baseline from divergence via `PremiseDivergence`.
- Frontend uses Next App Router + shadcn-style components with Tailwind utility classes and existing palette tokens in `frontend/app/globals.css`.

### Integration Points
- Character-system redesign touches DB schema, routes, character generation, runtime prompt assembly, review editors, and game panels.
- Prompt harmonization must reconcile runtime narration prompts, worldgen prompts, and character prompts.
- UI overhaul will likely introduce a shared non-game shell spanning title/create/review/character/settings/library surfaces.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly wants a broad rethink, not a narrow “which tags are extra” patch.
- Starting state must mean more than a chosen location: it includes arrival conditions and must influence starting equipment/loadout.
- Reusable persona templates should seed both protagonist and NPC creation.
- Aventuras should be studied for borrowable concepts, especially prompt/context layering, retrieval, and UI shell ideas.

</specifics>

<deferred>
## Deferred Ideas

- Tauri/mobile/sync ideas from Aventuras are out of scope for this milestone.
- Any broad retrieval/memory overhaul inspired by Aventuras should stay secondary unless it directly supports the queued phases.

</deferred>
