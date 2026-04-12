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

The original `v1.1 Gameplay Fidelity` reconciliation tranche (`37-44`) is complete. The milestone remains open and is now extended with follow-on gameplay-quality phases (`45-50`) driven by live gameplay findings rather than docs reconciliation alone.

`Phase 48` is now complete: runtime character modeling preserves richer identity layers, continuity, and source-bundle fidelity across generation, persistence, prompts, reflection, and the bounded frontend draft/editor seam.

The milestone still starts from the docs-to-runtime reconciliation in [36-HANDOFF.md](/R:/Projects/WorldForge/.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md), not from old assumptions.

## Current Milestone: v1.1 Gameplay Fidelity

**Goal:** Bring live gameplay runtime into honest alignment with the documented design baseline from Phase 36, then keep iterating until baseline live gameplay feel is acceptable in practice.

**Target features:**
- runtime integrity: session-decoupled gameplay routes, authoritative inventory/equipment state, honest rollback/retry, and complete checkpoint fidelity
- live simulation fidelity: reflection/progression that actually triggers, post-turn simulation with a trustworthy player-visible turn boundary, and target-aware Oracle context
- mechanics and docs reconciliation: implement or explicitly deprecate documented gameplay claims around travel, location event state, retrieval semantics, and start-condition runtime effects
- scene authority: single-pass turn synthesis, runtime-driven opening scenes, and encounter/perception scoping instead of flat location dumps
- narrative quality: better storyteller prompting, reduced purple prose/AI smell, and stronger text presentation/readability
- character and research fidelity: stronger canonical/imported character identity modeling plus better search grounding in worldgen and live play

## Requirements

### Validated

- ✓ Deterministic gameplay foundation: prompt assembly, Oracle, turn loop, tool execution, story control, and core mechanics — `v1.0`
- ✓ Living world simulation: episodic memory, key NPC autonomy, reflection/progression scaffolding, faction ticks, and checkpoints — `v1.0`
- ✓ World creation stack: research-backed worldgen, lore extraction/search, known-IP divergence, worldbook reuse, and review editing — `v1.0`
- ✓ Character authoring stack: shared ontology, structured starts, canonical loadouts, and persona templates — `v1.0`
- ✓ Desktop non-game shell and routed creation/review/character flows — `v1.0`

### Active

- [ ] Gameplay runtime matches the integrity baseline established by Phase 36 before new gameplay expansion
- [ ] Session-coupled gameplay seams are removed from turn, history, retry, undo, and edit flows
- [ ] Checkpoints, rollback, and retry restore one coherent authoritative world boundary
- [ ] Reflection/progression and post-turn simulation become trustworthy live mechanics instead of half-wired background systems
- [ ] Documented gameplay claims that are still intended are implemented; stale ones are explicitly deprecated

### Out of Scope

- Multiplayer / co-op
- Electron/Tauri wrapper
- Cloud deployment / accounts
- Mobile-first UI
- Tactical squad control / party management

## Context

**Tech stack:** Hono, Next.js App Router, Tailwind, shadcn/ui, Drizzle, SQLite, LanceDB, Vercel AI SDK.  
**Execution reality:** worldgen and non-game authoring are now broad and feature-rich; the next major risk area is gameplay fidelity, not content creation breadth.  
**Planning reality:** `v1.0` is archived; `v1.1` starts from the `36-HANDOFF.md` priority groups instead of older milestone assumptions.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Deterministic engine + LLM narrator | Prevent mechanics drift and hallucinated state | ✓ Good |
| Tag-light, structured character ontology | Flat tags degraded authoring and runtime semantics | ✓ Good |
| Known-IP generation uses structured divergence | Regex-style premise overrides were brittle and underfit the problem | ✓ Good |
| Desktop-first non-game shell | Creation/review/character flows needed coherence before more feature growth | ✓ Good |
| Next gameplay milestone must be docs-to-runtime-driven | Phase 36 proved assumptions had drifted from live wiring | ✓ Good |
| Integrity repair before gameplay expansion | New mechanics on top of untrusted runtime state would create false progress | ✓ Good |
| `v1.1` stays open until gameplay baseline feels acceptable in live use | Formal reconciliation alone is not enough if live play still exposes major scene, writing, search, or character-fidelity gaps | ✓ Active |

---
*Last updated: 2026-04-12 after Phase 48 completion*
