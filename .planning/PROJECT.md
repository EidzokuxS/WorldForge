# WorldForge

## What This Is

An AI-driven singleplayer text RPG sandbox. The LLM narrates and interprets fiction; backend code owns mechanics, persistence, world state, and progression. The product now includes world generation, lore ingestion, character authoring, desktop non-game workflows, and a live gameplay runtime.

## Core Value

The LLM is the narrator, never the engine. Mechanical truth stays in backend code so outcomes remain consistent, inspectable, and recoverable.

## Current State

`v1.0 Living Sandbox` shipped on `2026-04-08`.

The shipped baseline includes:
- deterministic Oracle-driven turn processing with validated tools and typed SSE streaming
- world mechanics for HP, inventory, movement, entity tracking, checkpoints, and optional images
- world generation for original and known-IP campaigns with lore search/import and reusable source libraries
- unified character ontology, structured start conditions, canonical loadouts, and persona templates
- desktop-first non-game shell for launcher, creation, review, and character authoring

The next milestone should start from the docs-to-runtime reconciliation in [36-HANDOFF.md](/R:/Projects/WorldForge/.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md), not from old assumptions.

## Requirements

### Validated

- ✓ Deterministic gameplay foundation: prompt assembly, Oracle, turn loop, tool execution, story control, and core mechanics — `v1.0`
- ✓ Living world simulation: episodic memory, key NPC autonomy, reflection/progression scaffolding, faction ticks, and checkpoints — `v1.0`
- ✓ World creation stack: research-backed worldgen, lore extraction/search, known-IP divergence, worldbook reuse, and review editing — `v1.0`
- ✓ Character authoring stack: shared ontology, structured starts, canonical loadouts, and persona templates — `v1.0`
- ✓ Desktop non-game shell and routed creation/review/character flows — `v1.0`

### Active

- [ ] Make gameplay runtime fully match documented intent from `docs/`, using Phase 36 as the authoritative baseline
- [ ] Remove session-coupled gameplay seams so runtime routes work from campaign identity, not volatile active-memory state
- [ ] Make checkpoints and undo/retry faithfully cover full world state, including config-backed state and post-turn simulation
- [ ] Resolve inventory/equipment authority so gameplay mutations have one canonical source of truth
- [ ] Either fully wire reflection/progression into live runtime or cut dead paths from the design
- [ ] Make Oracle target resolution and start conditions matter as runtime mechanics, not mostly prompt context

### Out of Scope

- Multiplayer / co-op
- Electron/Tauri wrapper
- Cloud deployment / accounts
- Mobile-first UI
- Tactical squad control / party management

## Context

**Tech stack:** Hono, Next.js App Router, Tailwind, shadcn/ui, Drizzle, SQLite, LanceDB, Vercel AI SDK.  
**Execution reality:** worldgen and non-game authoring are now broad and feature-rich; the next major risk area is gameplay fidelity, not content creation breadth.  
**Planning reality:** `v1.0` is archived; the next milestone should begin with a new requirements/roadmap cycle instead of adding more phases onto the closed one.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Deterministic engine + LLM narrator | Prevent mechanics drift and hallucinated state | ✓ Good |
| Tag-light, structured character ontology | Flat tags degraded authoring and runtime semantics | ✓ Good |
| Known-IP generation uses structured divergence | Regex-style premise overrides were brittle and underfit the problem | ✓ Good |
| Desktop-first non-game shell | Creation/review/character flows needed coherence before more feature growth | ✓ Good |
| Next gameplay milestone must be docs-to-runtime-driven | Phase 36 proved assumptions had drifted from live wiring | ✓ Good |

---
*Last updated: 2026-04-08 after v1.0 milestone closeout*
