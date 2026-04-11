# Phase 42: Targeted Oracle & Start-Condition Runtime Effects - Research

**Researched:** 2026-04-11
**Domain:** Target-aware Oracle input resolution and persistent early-game start-condition mechanics
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Oracle Target Scope
- **D-01:** Phase 42 must not reduce target-aware Oracle evaluation to NPC-only behavior.
- **D-02:** Mandatory target-aware support for this phase is `character`, `item`, and `location/object`.
- **D-03:** `Faction` support is conditional — only when there is already direct and meaningful runtime target context.
- **D-04:** Unsupported target types must degrade honestly to non-targeted rulings.

### Start-Condition Mechanics
- **D-05:** Mechanically binding start-condition fields: `startLocationId`, `arrivalMode`, `startingVisibility`, `entryPressure`, `companions`, `immediateSituation`.
- **D-06:** `startLocationId` is always mechanical because it defines the opening location.
- **D-07:** `companions` matter as runtime presence/context only; no party-management expansion.
- **D-08:** `immediateSituation` may create initial flags/constraints/modifiers, but must not become a free-form rule engine.

### Effect Surface
- **D-09:** Phase 42 should use a combination of scene flags, action gating/unlocking, and Oracle modifiers.
- **D-10:** Start-condition fields must affect early rulings and available actions through structured runtime state, not only prompt flavor.
- **D-11:** Companion effects remain narrow and early-scene-focused.
- **D-12:** All Phase 42 mechanics must survive reload, retry, and checkpoint restore.

### Scope Guardrails
- **D-16:** No travel/time implementation here.
- **D-17:** No broad prompt-system or world-state redesign outside the mechanics required for `GSEM-01` and `GSEM-02`.
- **D-18:** Where docs are broader than live support, implement the honest supported subset rather than faking full coverage.

### the agent's Discretion
- Exact target-resolution helper/fallback structure
- Exact mapping from start-condition fields to runtime flags and Oracle modifiers
- Exact backend/UI seam used to surface start-condition-driven opening state

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GSEM-01 | Oracle evaluation includes target-aware context when the player acts against a concrete entity, instead of always judging actions with empty target tags. | Identify the live player-action seam, existing entity-resolution helpers, and the minimum honest target taxonomy that can be supported in this phase. |
| GSEM-02 | Start conditions affect early gameplay mechanically and persistently, not only as prompt flavor text. | Identify canonical start-condition storage, current prompt/loadout hooks, missing runtime mechanics, and persistence risks after Phases 39 and 41. |
</phase_requirements>

## Summary

Phase 42 is fundamentally two seams, not one: the player-action path never populates Oracle `targetTags`, and structured start conditions already exist in saved character data but are still mostly prompt-facing rather than gameplay-mechanical. The safest plan is to keep those as separate plan units that converge on one persistence boundary.

The Oracle contract is already explicit in [backend/src/engine/oracle.ts](R:\Projects\WorldForge\backend\src\engine\oracle.ts): `targetTags` are a first-class payload field and the system prompt expects them. The missing part is player-turn target resolution. [backend/src/engine/turn-processor.ts](R:\Projects\WorldForge\backend\src\engine\turn-processor.ts) still hard-codes `targetTags: []` for player actions, so every player action is judged as if it had no concrete target. Meanwhile, runtime already has usable entity-resolution seams in [backend/src/engine/tool-executor.ts](R:\Projects\WorldForge\backend\src\engine\tool-executor.ts) for `character` and `location`, plus general entity lookup by name/type. That means Phase 42 does not need a brand-new ontology; it needs a clean target-resolution layer for action evaluation.

Structured start conditions are already canonical data, not an invention of this phase. [@worldforge/shared types](R:\Projects\WorldForge\node_modules\@worldforge\shared\src\types.ts) define `startLocationId`, `arrivalMode`, `immediateSituation`, `entryPressure`, `companions`, `startingVisibility`, `resolvedNarrative`, and `sourcePrompt`. [backend/src/routes/character.ts](R:\Projects\WorldForge\backend\src\routes\character.ts) persists them onto the player record; [backend/src/worldgen/starting-location.ts](R:\Projects\WorldForge\backend\src\worldgen\starting-location.ts) resolves them structurally; [backend/src/character/loadout-deriver.ts](R:\Projects\WorldForge\backend\src\character\loadout-deriver.ts) already proves start conditions can drive backend-owned mechanics. The gap is that early gameplay still mostly consumes start conditions through [backend/src/engine/prompt-assembler.ts](R:\Projects\WorldForge\backend\src\engine\prompt-assembler.ts) as narration context rather than a scene-state mechanic.

The main planning risk is dependency bleed from Phase 38. Roadmap says Phase 42 depends on Phase 38 because start conditions and target-aware actions can intersect with inventory/equipment truth. Since Phase 38 is not yet complete, Phase 42 should avoid inventing new mechanics that require a stronger item authority model than the repo currently has. The honest approach is to use canonical character/start-condition state plus current location/entity state, and keep inventory-sensitive target logic narrow unless Phase 38 lands first.

**Primary recommendation:** split Phase 42 into two plans:
1. target-aware Oracle input resolution for the player action path, with honest fallback when no supported target resolves;
2. runtime-backed start-condition scene state and early-turn effects, using structured flags/modifiers that persist through the restore guarantees already repaired by Phases 39 and 41.

## Standard Stack

### Core
| Component | Purpose | Why Standard |
|-----------|---------|--------------|
| `backend/src/engine/oracle.ts` | Oracle payload contract | Already defines `targetTags` and the Judge-side semantics the docs promise. |
| `backend/src/engine/turn-processor.ts` | Player-turn Oracle call seam | This is where player actions currently lose target context. |
| `backend/src/worldgen/starting-location.ts` | Structured start-condition resolution | Already produces the canonical authored opening-state object. |
| `backend/src/routes/character.ts` | Player save/handoff persistence | Already persists start conditions onto the player record and aligns start location. |
| `backend/src/engine/prompt-assembler.ts` | Runtime consumption of player/start-condition state | Already surfaces start conditions in the storyteller prompt, proving the data is present during play. |

### Supporting
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `backend/src/engine/tool-executor.ts` | Existing entity resolution by name/type | Reuse or extract helper patterns for target-aware Oracle resolution. |
| `backend/src/character/loadout-deriver.ts` | Existing backend-owned mechanical use of `startConditions` | Use as precedent for how start conditions can change real runtime behavior. |
| `backend/src/campaign/restore-bundle.ts` and Phase 41 restore paths | Persistence boundary | Ensure any new start-condition mechanics or target-aware state survive restore without inventing a new persistence model. |
| `frontend/app/game/page.tsx` | Current gameplay UI seam | Relevant only if the phase needs a lightweight way to expose or preserve target choice from the client. |

## Architecture Patterns

### Pattern 1: Separate Target Resolution From Oracle Evaluation
**What:** Resolve action target into a normalized target context before calling Oracle; keep Oracle itself unchanged.
**Why:** `oracle.ts` already models the right contract. The problem is upstream in `turn-processor.ts`, not in the Judge model interface.
**Recommended normalized target context**
- `targetType`: `character | item | location | object | faction | none`
- `targetTags`: resolved tags or derived characteristics
- `targetLabel`: optional display/debug label
- `fallbackReason`: why target-aware evaluation was not possible

**Safe rule:** if resolution fails or the type is unsupported, feed `targetTags: []` intentionally and record the honest fallback.

### Pattern 2: Start Conditions Should Become Runtime Scene State, Not New Character Stats
**What:** Convert canonical `startConditions` into a small early-game runtime state surface, likely scene flags plus action/ruling modifiers.
**Why:** The docs promise mechanical effect, but the current data model is descriptive. Scene-state translation is the smallest honest bridge.

**Good fit by field**
- `startLocationId` → opening node / location bootstrap
- `arrivalMode` → opening approach flags, access assumptions, motion posture
- `startingVisibility` → noticed/anonymous/expected opening-state flags and social exposure
- `entryPressure` → immediate constraints or pressure tags influencing first turns
- `immediateSituation` → one-time opening flags and action constraints
- `companions` → presence/context hooks, not full controllable-party mechanics

### Pattern 3: Persist Effects Through Existing Character/Scene Truth, Not Ad-Hoc Client State
**What:** If a start-condition effect matters after turn 0, it should be materialized into existing authoritative state (`conditions`, `statusFlags`, location-scoped flags, or another backend-owned record), not just reconstructed client-side.
**Why:** Phase 42 success criteria explicitly require reload/retry/checkpoint preservation.
**Constraint:** avoid inventing a big new subsystem if one of the existing character or scene state containers can hold the semantics cleanly.

### Pattern 4: Bound Scope Against Phase 43 and Phase 38
**What:** Keep start-condition mechanics about the opening state of the current location/scene, not travel cost, elapsed time, or a new inventory truth model.
**Why:** Those belong to later or prerequisite phases.
**Planning implication:** if a desired effect implicitly needs travel-time semantics or stable equipped-item authority, capture the dependency rather than expanding Phase 42.

## Concrete Code Seams and Test Anchors

### Code Seams
| Seam | Why it matters | Recommended role in Phase 42 |
|------|----------------|------------------------------|
| [backend/src/engine/turn-processor.ts](R:\Projects\WorldForge\backend\src\engine\turn-processor.ts) | Player Oracle call currently uses `targetTags: []` | Introduce target-resolution before Oracle call; preserve honest fallback. |
| [backend/src/engine/oracle.ts](R:\Projects\WorldForge\backend\src\engine\oracle.ts) | Already defines target-aware contract | Keep stable; use as invariant. |
| [backend/src/engine/tool-executor.ts](R:\Projects\WorldForge\backend\src\engine\tool-executor.ts) | Has existing `resolveEntity` and `resolveCharacterByName` seams | Reuse/extract for target lookup instead of inventing duplicate entity search logic. |
| [backend/src/routes/character.ts](R:\Projects\WorldForge\backend\src\routes\character.ts) | Persists canonical start conditions on save | Baseline for start-condition persistence. |
| [backend/src/engine/prompt-assembler.ts](R:\Projects\WorldForge\backend\src\engine\prompt-assembler.ts) | Reads start conditions today as prompt context | Will need to coexist with or reflect new runtime mechanics. |
| [backend/src/character/loadout-deriver.ts](R:\Projects\WorldForge\backend\src\character\loadout-deriver.ts) | Already applies `arrivalMode`/origin to real starting gear | Useful precedent and regression anchor. |

### Test Anchors
| Anchor | Behavior to lock | Confidence |
|--------|------------------|------------|
| `backend/src/engine/__tests__/oracle.test.ts` | Oracle contract still expects and renders target tags | HIGH |
| `backend/src/engine/__tests__/turn-processor.test.ts` | Different rulings when a concrete supported target is present vs absent | HIGH |
| `backend/src/routes/__tests__/character.test.ts` | Saved start conditions still persist canonically after any runtime mechanics wiring | MEDIUM |
| `backend/src/character/__tests__/loadout-deriver.test.ts` | Existing mechanical use of start conditions stays correct | MEDIUM |
| new gameplay/restore tests near chat or state restore | Start-condition-driven effects survive reload/retry/checkpoint | MEDIUM |

**Minimum test cases**
1. The same action against no target and against a supported target yields different Oracle input and can yield different odds.
2. Unsupported or unresolved targets fall back honestly to non-targeted Oracle evaluation.
3. Saved start conditions produce backend-owned early-game effects, not only storyteller prompt text.
4. Those effects survive reload, retry, and checkpoint restore.
5. Companion-related start conditions influence opening context without creating party-management behavior.

## Recommended Phase Decomposition

### Recommended Plan 42-01: Target-Aware Oracle Resolution
**Focus**
- player-action target resolution
- normalized target context for `character`, `item`, `location/object`
- optional faction path only where direct context already exists
- turn-processor tests and any minimal gameplay route/client seam needed to preserve explicit target choice

**Why separate**
- This directly closes `GSEM-01`
- It has a clear code seam in `turn-processor.ts`
- It should not be entangled with start-condition runtime semantics

### Recommended Plan 42-02: Start-Condition Runtime Effects
**Focus**
- translate canonical start conditions into early-game runtime flags/modifiers/gating
- preserve through save/reload/retry/checkpoint
- keep companion handling narrow and immediate-situation handling structured

**Why separate**
- This closes `GSEM-02`
- It depends more on Phase 41 restore guarantees than on Oracle internals
- It can stay bounded away from travel/time and broad inventory redesign

### Optional third plan only if research/planning proves needed
A dedicated thin integration/verification plan is only justified if target-aware rulings and start-condition effects end up touching different persistence seams that cannot be covered by the two plans' own verification.

## Validation Architecture

Phase 42 should validate at three layers:

1. **Contract tests**
   - Oracle payload receives non-empty `targetTags` for resolved supported targets.
   - Unsupported targets degrade to explicit non-targeted behavior.

2. **Mechanics tests**
   - Start-condition-derived flags/modifiers change early-turn behavior mechanically.
   - Companion/starting-visibility/entry-pressure effects are persisted in backend-owned state, not only in prompt text.

3. **Restore tests**
   - Reload/retry/checkpoint preserve target-aware and start-condition-driven mechanics.
   - No branch drift after Phase 41 restore bundle replacement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Target resolution | A separate action-parser ontology unrelated to world entities | Reuse/extract current entity-resolution seams from runtime | Prevents parallel target models. |
| Start-condition mechanics | A giant free-form rules interpreter over `immediateSituation` text | Small structured runtime flags / gating / Oracle modifiers | Keeps Phase 42 bounded and testable. |
| Persistence | Client-only memory of opening-state effects | Existing authoritative campaign/player/scene state | Required for reload/retry/checkpoint correctness. |

## Common Pitfalls

### Pitfall 1: Treating “target-aware” as NPC-only
**What goes wrong:** The phase technically passes a narrow test but under-delivers relative to docs and the user decision.
**Avoid by:** making `character`, `item`, and `location/object` first-class from the start.

### Pitfall 2: Smuggling travel/time semantics into start conditions
**What goes wrong:** Opening-state mechanics turn into Phase 43 scope creep.
**Avoid by:** keeping effects local to the opening scene and early-turn conditions.

### Pitfall 3: Requiring Phase 38 to be fully solved for every effect
**What goes wrong:** Phase 42 stalls on broad inventory redesign.
**Avoid by:** only using current inventory/equipment truth where strictly necessary and keeping start-condition mechanics centered on scene state.

### Pitfall 4: Leaving effects in prompt text only
**What goes wrong:** The docs claim is still false after implementation because nothing mechanical changed.
**Avoid by:** requiring a backend-observable state/evaluation difference for both `GSEM-01` and `GSEM-02`.

## Open Questions

1. **Where explicit target selection should live in the UI**
   - What we know: current gameplay page is free-text driven.
   - What remains open: whether Phase 42 needs explicit target UI, or whether target resolution can remain text-derived for now.
   - Planning guidance: prefer backend-first resolution with minimal UI dependence unless tests prove the UI seam is required.

2. **What storage shape best fits early-game start-condition effects**
   - What we know: canonical start conditions already persist; loadout already reads them mechanically.
   - What remains open: whether opening-state effects belong in player `statusFlags`, location-scoped flags, a dedicated opening-state record, or a combination.
   - Planning guidance: pick the smallest backend-owned state surface that cleanly survives restore.

## Sources

### Primary (HIGH confidence)
- [42-CONTEXT.md](R:\Projects\WorldForge\.planning\phases\42-targeted-oracle-and-start-condition-runtime-effects\42-CONTEXT.md)
- [ROADMAP.md](R:\Projects\WorldForge\.planning\ROADMAP.md)
- [REQUIREMENTS.md](R:\Projects\WorldForge\.planning\REQUIREMENTS.md)
- [36-HANDOFF.md](R:\Projects\WorldForge\.planning\phases\36-gameplay-docs-to-runtime-reconciliation-audit\36-HANDOFF.md)
- [36-RUNTIME-MATRIX.md](R:\Projects\WorldForge\.planning\phases\36-gameplay-docs-to-runtime-reconciliation-audit\36-RUNTIME-MATRIX.md)
- [oracle.ts](R:\Projects\WorldForge\backend\src\engine\oracle.ts)
- [turn-processor.ts](R:\Projects\WorldForge\backend\src\engine\turn-processor.ts)
- [tool-executor.ts](R:\Projects\WorldForge\backend\src\engine\tool-executor.ts)
- [starting-location.ts](R:\Projects\WorldForge\backend\src\worldgen\starting-location.ts)
- [character.ts](R:\Projects\WorldForge\backend\src\routes\character.ts)
- [loadout-deriver.ts](R:\Projects\WorldForge\backend\src\character\loadout-deriver.ts)
- [prompt-assembler.ts](R:\Projects\WorldForge\backend\src\engine\prompt-assembler.ts)
- [types.ts](R:\Projects\WorldForge\node_modules\@worldforge\shared\src\types.ts)
- [mechanics.md](R:\Projects\WorldForge\docs\mechanics.md)
- [concept.md](R:\Projects\WorldForge\docs\concept.md)

## Metadata

**Confidence breakdown:**
- Oracle seam identification: HIGH
- Start-condition persistence path: HIGH
- Inventory/dependency caution around Phase 38: MEDIUM
- Exact state-storage choice for early-game effects: MEDIUM

**Research date:** 2026-04-11
**Valid until:** 2026-05-11
