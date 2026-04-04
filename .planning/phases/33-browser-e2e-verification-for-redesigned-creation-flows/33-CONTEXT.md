# Phase 33: Browser E2E Verification for Redesigned Creation Flows - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate the redesigned non-game creation flows (campaign creation, character creation, world review) through real browser E2E testing using PinchTab. Fix all bugs discovered during verification. Remove legacy routes. Smoke-test both known-IP and original-world paths.

</domain>

<decisions>
## Implementation Decisions

### Test scope & flow priority
- **D-01:** Three priority flows: (1) Campaign creation + World DNA + scaffold generation, (2) Character creation + persona selection + start conditions + canonical loadout, (3) World review editing (locations, factions, NPCs, lore)
- **D-02:** Library management is OUT of E2E scope for this phase
- **D-03:** Both a known-IP flow and an original-world flow must be smoke-tested
- **D-04:** Comprehensive error coverage — happy path + error states + edge cases (empty world DNA, cancel mid-generation, back navigation, invalid inputs, LLM connection failure)

### LLM dependency handling
- **D-05:** Full real LLM calls for all generation steps — no mocks, no pre-seeded data, no caching. GLM provider for Judge/Storyteller/Generator, OpenRouter for Embedder only.
- **D-06:** Retry tolerance: up to 3 retries on LLM failure before marking test as failed. Clear error reporting on final failure.

### Bug fix strategy
- **D-07:** Fix bugs inline as found — find bug, fix it, re-run the affected test immediately. No separate bug catalog or batch fixing.
- **D-08:** Done threshold: ALL bugs must be fixed. No deferring major or minor bugs. Every discovered issue resolved and re-tested within this phase.

### Legacy route cleanup
- **D-09:** Remove legacy routes entirely (`/character-creation/page.tsx`, `/world-review/page.tsx`) — delete the old route files. Do not create redirects.
- **D-10:** Test only canonical `(non-game)/` routes after removal.

### Shell verification
- **D-11:** Verify shared shell elements (sidebar navigation, canvas framing) as part of each flow test — no separate shell-only test. During each flow, confirm shell renders correctly.

### Claude's Discretion
- Exact PinchTab test structure and organization
- Test execution order within each flow
- How to handle PinchTab workarounds (ref-clicks on React buttons with lucide icons → use `/evaluate` with JS programmatic click)
- Specific edge cases to test beyond the ones enumerated

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### E2E Testing
- `docs/ui_concept_hybrid.html` — Visual language anchor for UI verification
- `.planning/codebase/TESTING.md` — Test framework conventions (Vitest for unit, PinchTab for E2E)

### Phase 32 Redesign (what we're verifying)
- `.planning/phases/32-desktop-first-non-game-ui-overhaul/32-RESEARCH.md` — Desktop workspace redesign decisions, route structure
- `.planning/phases/32-desktop-first-non-game-ui-overhaul/32-05-SUMMARY.md` — Character creation shell integration
- `.planning/phases/32-desktop-first-non-game-ui-overhaul/32-04-SUMMARY.md` — World review shell integration
- `.planning/phases/32-desktop-first-non-game-ui-overhaul/32-01-SUMMARY.md` — Shared shell foundation

### Route Structure
- `frontend/app/(non-game)/` — Canonical route group (campaign/new, campaign/[id]/character, campaign/[id]/review, library, settings)
- `frontend/components/non-game-shell/app-shell.tsx` — Shared shell component

### Character & World Systems (tested flows)
- `.planning/phases/29-unified-character-ontology-and-tag-system/29-CONTEXT.md` — Character ontology decisions
- `.planning/phases/30-start-conditions-canonical-loadouts-and-persona-templates/30-CONTEXT.md` — Persona templates, start conditions, loadouts

### Project conventions
- `docs/concept.md` — Vision, gameplay loop, world generation
- `docs/mechanics.md` — Tag system, Oracle, NPCs, factions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/components/non-game-shell/app-shell.tsx` — Shared shell with sidebar, canvas framing
- `frontend/components/character-creation/` — CharacterForm, CharacterCard components
- `frontend/components/world-review/` — PremiseSection, LocationsSection, FactionsSection, NpcsSection, LoreSection
- `frontend/components/campaign-new/` — Campaign creation components
- `frontend/lib/api.ts` — API client for backend calls

### Established Patterns
- PinchTab E2E: accessibility tree + HTTP API (port 9867), headless mode via `BRIDGE_HEADLESS=true`
- PinchTab workarounds: `/evaluate` with JS programmatic click for React buttons with lucide icons; `var` instead of `const`/`let` in evaluate; avoid `!` character
- File upload via DataTransfer API + native setter in PinchTab
- Backend on :3001, frontend on :3000

### Integration Points
- E2E tests will navigate through `(non-game)/` routes via PinchTab browser automation
- Tests depend on both backend and frontend dev servers running
- LLM calls go through backend API → GLM provider (real calls)
- Legacy routes to delete: `frontend/app/character-creation/page.tsx`, `frontend/app/world-review/page.tsx`

</code_context>

<specifics>
## Specific Ideas

- PinchTab is the ONLY E2E tool — NOT Playwright. Project convention.
- Real testing only — no mocks, no grep, no fake scores. All testing through real browser + real LLM calls.
- GLM is default provider for all roles except Embedder (OpenRouter with qwen/qwen3-embedding-8b)
- "All bugs fixed" — no deferring. Every bug found is fixed and re-tested before phase completion.

</specifics>

<deferred>
## Deferred Ideas

- Library management E2E testing — lower priority, can be covered in a future phase
- Mobile/responsive testing — project is desktop-first (FHD/1440p)
- Performance benchmarking of generation pipeline — separate concern

### Reviewed Todos (not folded)
- "Add lore card editing and deletion" (score 0.6) — already completed in Phase 27, todo is stale
- "Add reusable multi-worldbook library" (score 0.4) — already completed in Phase 26, todo is stale

</deferred>

---

*Phase: 33-browser-e2e-verification-for-redesigned-creation-flows*
*Context gathered: 2026-04-01*
