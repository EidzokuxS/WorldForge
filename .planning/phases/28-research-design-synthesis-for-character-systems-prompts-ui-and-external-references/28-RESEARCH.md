# Phase 28 Research Synthesis

**Date:** 2026-04-01
**Purpose:** Consolidate the research wave for character-model redesign, prompt-system audit, desktop-first non-game UI direction, and external repo review.

## 1. Character-System Findings

### Current Reality
- World scaffold generation, NPC generation, player creation, and runtime all consume different shapes for “character”.
- Players and NPCs are stored separately and treated differently by runtime rules.
- Starting location, starting situation, and starting equipment are only loosely connected.
- Equipment is split across `players.equippedItems` and the `items` table.
- Persona/archetype/template mechanisms are fragmented across free-text parse, V2 card import, archetype research, and WorldBook ingestion.

### Key Contradictions
- There is no unified character model even though design intent implies parity for major characters.
- Supporting NPC tier can be lost during edit/save loops.
- Tag formatting/canonicalization is inconsistent across players, NPCs, and worldgen.
- Goals/beliefs use inconsistent shapes across UI, DB, and runtime.

### Design Direction
- Move toward one canonical character ontology with role/tier as attributes instead of separate player/NPC mental models.
- Treat flat runtime tags as a derived view, not the source of truth.
- Make starting state a persisted structured object, not just a selected location name.
- Collapse equipment toward first-class item entities plus explicit equip state.
- Funnel persona/archetype/import/template inputs into one `CharacterDraft` pipeline.

## 2. Prompt-System Findings

### Current Reality
- The prompt layer is already relatively mature and schema-driven in many places.
- The main risk is drift between docs, prompt contracts, runtime policies, and structured-output schemas.

### Key Contradictions
- Reflection threshold, scaffold sizing, and HP semantics are already drifting between docs and runtime.
- Narration policy is split across multiple runtime prompt surfaces.
- Structured-output tasks still contain duplicated or stale instructions in some places.

### Prompt Rewrite Principles
- One task, one schema, one output contract.
- Put canon and user facts first, then apply deltas or inference.
- Preserve explicit user-provided facts verbatim where required.
- Prefer positive output instructions plus a compact example over giant prohibition lists.
- Keep a single authoritative prompt contract per role/family and reuse it.
- Update docs and code together when contracts change.

## 3. UI / UX Findings

### Current Reality
- The title flow is too modal-heavy.
- Review, character creation, and settings feel like disconnected single pages rather than a coherent campaign workspace.
- Dense editors use repeated card grids that do not scale well on FHD/1440p.
- Character creation is too narrow for desktop and does not expose enough structured workflow.
- Import/library experiences are fragmented across unrelated screens.
- Route structure is inconsistent between canonical `[id]` routes, legacy query-param routes, and active-campaign `/game`.

### UI Direction
- Use `docs/ui_concept_hybrid.html` as the aesthetic target for menus/non-game surfaces.
- Preserve the dark serif/sans hybrid language, restrained `blood`/`mystic` accents, subtle glass/depth, and framed composition.
- Improve UX by favoring route-based workspaces, master-detail editing, stronger hierarchy, sticky actions, and denser desktop layouts.
- Keep implementation constrained to Tailwind, shadcn, and compatible libraries only; no custom CSS files.

### Likely UX Architecture
- Shared non-game shell with campaign header + left navigation/step rail + main workspace + optional right summary/inspector.
- Campaign creation becomes a routed workspace, not an oversized dialog.
- World review becomes a list/detail editor system, not a grid of giant edit cards.
- Character creation becomes a split workspace with inputs/imports on one side and a live sheet/start setup on the other.
- Settings gets explicit save state and better information architecture.

## 4. Aventuras Takeaways

### Worth Borrowing
- Context-builder pattern for assembling prompt context from multiple subsystems.
- Modular prompt system with explicit mode/style/lore constraints.
- Tiered retrieval with sticky high-value context.
- Agentic lore-management workflow with controlled mutations and reviewable change flow.
- Desktop shell ideas: resizable panels, dense sidebars, richer workspace framing.

### Not Worth Borrowing
- Tauri/mobile/sync direction.
- Svelte-specific implementation details.
- Theme sprawl or prompt bloat for its own sake.

### Applicability to This Milestone
- Strongly relevant to prompt harmonization, shared character context, UI shell redesign, and possibly lore/memory shaping.

## 5. Recommended Downstream Phase Intent

### Phase 29
- Define and implement the shared character ontology and tag derivation model.

### Phase 30
- Build structured starting-state resolution, canonical loadouts, and persona templates on top of the new model.

### Phase 31
- Rewrite prompt families to align with the new character/start contracts and eliminate drift.

### Phase 32
- Apply the new model to a desktop-first non-game shell and workflow redesign.

### Phase 33
- Browser-verify the redesigned creation/review flows and polish regressions.
