# Phase 42: Targeted Oracle & Start-Condition Runtime Effects - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Make target-aware Oracle rulings and structured start conditions mechanically real in live gameplay.

This phase covers:
- what kinds of targets must feed real target context into Oracle evaluation
- which authored start-condition fields are mechanically binding in early gameplay
- what kinds of runtime effects those start conditions must produce
- the persistence boundary required so reload, retry, and checkpoint restore keep those mechanics intact

This phase does **not** cover:
- travel/time semantics or per-location recent-happenings systems
- inventory/equipment authority beyond what start-condition mechanics already depend on
- broader docs cleanup or deprecation work outside the mechanics needed for `GSEM-01` and `GSEM-02`
- party-management or tactical companion systems

</domain>

<decisions>
## Implementation Decisions

### Oracle Target Scope
- **D-01:** Phase 42 must not limit target-aware Oracle evaluation to NPCs only. The docs promise `target tags` generically for Oracle input, not a character-only subset.
- **D-02:** The baseline first-class target types for this phase are `character`, `item`, and `location/object`, because those are practically targetable in live play and can carry meaningful runtime context.
- **D-03:** `Faction` may participate in target-aware rulings only where there is already direct and meaningful faction-target runtime context. Phase 42 does not owe a full generic faction-targeting vertical if the live action contract is still indirect.
- **D-04:** If a requested target type does not have a real target-resolution path yet, the system must degrade honestly to a non-targeted ruling rather than pretending target-aware evaluation happened.

### Start-Condition Mechanical Scope
- **D-05:** The following start-condition fields are mechanically binding for this phase: `startLocationId`, `arrivalMode`, `startingVisibility`, `entryPressure`, `companions`, and `immediateSituation`.
- **D-06:** `startLocationId` is always mechanically real because it determines the actual opening location and scene bootstrap.
- **D-07:** `companions` remain in scope only as runtime presence/context and early-scene implications. Phase 42 must not silently expand them into party-management or tactical squad-control systems.
- **D-08:** `immediateSituation` is mechanically meaningful, but only as a source of initial scene flags, constraints, and contextual modifiers. It must not become a free-form universal rule engine.

### Mechanical Effect Surface
- **D-09:** Start conditions should not resolve into a single effect type. Phase 42 should use a combination of scene flags, action gating/unlocking, and Oracle modifiers where appropriate.
- **D-10:** `arrivalMode`, `startingVisibility`, `entryPressure`, and `immediateSituation` should be able to affect early rulings and available actions through structured scene state, not only through prompt flavor.
- **D-11:** `companions` should contribute runtime-backed presence/context in the opening scene and early turns, even if they do not yet imply a broader companion-control feature set.
- **D-12:** Start-condition effects must persist across reload, retry, and checkpoint restore; they are part of live gameplay semantics, not disposable opening narration.

### Documentation-Grounded Interpretation
- **D-13:** The docs clearly promise Oracle payload support for target tags, but they do not narrowly define the target-type taxonomy. Phase 42 should therefore implement a broad target-aware contract bounded by real runtime support, not by arbitrary NPC-only restrictions.
- **D-14:** The docs clearly promise a richer structured opening state than the old “starting node only” contract, but they do not prescribe the exact mechanic for every field. Phase 42 should make the listed fields mechanically consequential without inflating them into a second rules language.
- **D-15:** This phase should prefer honest runtime semantics over prompt-only implication. If a start-condition field or target type is treated as mechanically supported, the backend/runtime path must actually preserve and use it.

### Scope Guardrails
- **D-16:** Phase 42 should repair gameplay semantics, not widen the feature surface. No new travel system, no general faction strategy interface, and no companion-management layer.
- **D-17:** The phase may introduce explicit runtime flags or target-resolution helpers, but it should not reopen unrelated prompt-system cleanup or world-state redesign.
- **D-18:** Where docs are broader than live entity support, Phase 42 should implement the honest supported subset and make unsupported cases degrade explicitly rather than smuggling in fake coverage.

### Codex's Discretion
- Exact target-resolution algorithm per entity type
- Exact mapping from start-condition fields to scene flags and Oracle modifiers
- Exact representation of runtime-backed companion presence in early gameplay
- Exact backend/UI seam used to expose start-condition-derived scene state to the player

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone baseline
- `.planning/ROADMAP.md` — Phase 42 goal, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` — `GSEM-01` and `GSEM-02`.
- `.planning/STATE.md` — current milestone status and recent integrity decisions from Phases 37-41.

### Reconciled gameplay baseline
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md` — Group B1 and the general requirement to make still-intended docs claims real mechanics.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-CLAIMS.md` — `TURN-19`, `CHAR-18`, `CHAR-21`, `CHAR-23`, and related start-condition/loadout claims.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-RUNTIME-MATRIX.md` — evidence that Oracle `targetTags` are currently empty and that structured start-condition authoring exists but is not yet gameplay-mechanical.

### Gameplay docs
- `docs/mechanics.md` — `The Probability Oracle`, `The Oracle Flow`, `AI Agent Tool System`, `Character System (3 Tiers)`.
- `docs/concept.md` — `Anatomy of a Turn`, `The "What If" Sandbox`, `World Structure`.
- `docs/memory.md` — player-state and prompt-assembly expectations where relevant to start-condition carry-through.
- `docs/plans/2026-03-06-player-character-creation.md` — character/save payload expectations around starting location and authored player state.

### Runtime code
- `backend/src/engine/oracle.ts` — Oracle payload contract and current target-tag support shape.
- `backend/src/engine/turn-processor.ts` — current player turn path, including the empty `targetTags` seam.
- `backend/src/engine/npc-tools.ts` — NPC action Oracle use and another target-context consumer to keep consistent if needed.
- `backend/src/engine/tool-executor.ts` — live target resolution by entity name/type for world mutations.
- `backend/src/engine/prompt-assembler.ts` — current start-condition prompt surfacing and early-scene context shaping.
- `backend/src/routes/chat.ts` — gameplay route path and persistence boundary after Phases 37, 39, and 41.
- `backend/src/routes/character.ts` — save/handoff path for structured start conditions.
- `backend/src/worldgen/starting-location.ts` — authored/derived start-condition structure and resolution contract.
- `backend/src/character/loadout-deriver.ts` — existing mechanical use of start conditions for starting kit.
- `frontend/app/game/page.tsx` — current gameplay client flow and possible target/start-condition UI seams.
- `frontend/components/character-creation/character-card.tsx` — authored start-condition inputs.

### Verification anchors
- `backend/src/engine/__tests__/oracle.test.ts`
- `backend/src/engine/__tests__/turn-processor.test.ts`
- `backend/src/routes/__tests__/character.test.ts`
- `backend/src/worldgen/__tests__/starting-location.test.ts`
- `backend/src/character/__tests__/loadout-deriver.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/engine/oracle.ts` already models `targetTags` explicitly in the judge payload.
- `backend/src/engine/tool-executor.ts` already resolves concrete targets by name/type for several mutation tools, which gives Phase 42 a live target-resolution seam to reuse or extend.
- `backend/src/worldgen/starting-location.ts` already resolves rich `startConditions` including `arrivalMode`, `startingVisibility`, `entryPressure`, `companions`, and `immediateSituation`.
- `backend/src/character/loadout-deriver.ts` already proves start conditions can have backend-owned mechanical effects.
- `backend/src/engine/prompt-assembler.ts` already exposes start-condition context to gameplay prompts, so Phase 42 is about moving from narration-only context to real mechanics.

### Established Patterns
- Phases 37, 39, and 41 already established explicit campaign identity, honest turn completion, and restore-coherent runtime boundaries, so Phase 42 can rely on those persistence seams.
- World/entity runtime already distinguishes characters, locations, items, and factions; target-aware Oracle should map onto that reality rather than inventing a new ontology.
- Structured character data is canonical; derived tags are shorthand. Start-condition mechanics should therefore read canonical start-condition fields first.

### Integration Points
- `backend/src/engine/turn-processor.ts` is the current player-action seam where target-aware Oracle input is missing.
- `backend/src/routes/character.ts` and gameplay restore/checkpoint paths must preserve any new runtime-backed start-condition effects.
- `backend/src/engine/prompt-assembler.ts` and scene/world state will likely need to consume structured start-condition-derived flags after they become mechanical.

</code_context>

<specifics>
## Specific Ideas

- The docs promise `target tags` as part of Oracle input, but they do not limit that promise to characters. The chosen product interpretation is therefore broad-by-contract, bounded-by-real-entity-support.
- The user accepted that `character`, `item`, and `location/object` are mandatory target-aware types for this phase, with `faction` support only where direct runtime target context already exists.
- The user accepted that structured start conditions should become actual early-game mechanics for `startLocationId`, `arrivalMode`, `startingVisibility`, `entryPressure`, `companions`, and `immediateSituation`.
- The chosen mechanical expression is a combination of scene flags, action gating/unlocking, and Oracle modifiers rather than a single monolithic effect type.
- `companions` are explicitly allowed to matter in opening scenes without implying party management.
- `immediateSituation` must influence early gameplay through constrained structured effects, not through arbitrary free-form rule injection.

</specifics>

<deferred>
## Deferred Ideas

- A broader generalized faction-targeting system if Phase 42 reveals that direct faction-target actions are common enough to deserve a fuller contract.
- Companion-management, party tactics, or explicit squad control surfaces.
- Travel/time and location-event semantics promised elsewhere in the docs — those belong to Phase 43.
- Broader docs rewrite or deprecation pass — that belongs to Phase 44.

</deferred>

---

*Phase: 42-targeted-oracle-and-start-condition-runtime-effects*
*Context gathered: 2026-04-11*
