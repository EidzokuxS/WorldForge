---
phase: 42
reviewers: [claude, gemini]
reviewed_at: 2026-04-11T14:58:00+03:00
plans_reviewed:
  - 42-01-PLAN.md
  - 42-02-PLAN.md
---

# Cross-AI Plan Review — Phase 42

## Claude Review

# Phase 42 Plan Review: Targeted Oracle & Start-Condition Runtime Effects

## Plan 42-01: Target-Aware Oracle Resolution

### Summary

Solid, well-scoped plan that addresses a clear gap — the hard-coded `targetTags: []` in `turn-processor.ts`. The two-task TDD structure (lock regressions first, then implement) is appropriate for the complexity. The plan correctly reuses existing entity-resolution seams from `tool-executor.ts` rather than inventing a parallel ontology. The main risk is in how target extraction from free-text player input will work without a UI selection mechanism.

### Strengths

- **Clean seam identification**: correctly identifies `turn-processor.ts:390` as the single point where `targetTags: []` is hard-coded — surgical fix target
- **Reuse over invention**: explicitly calls for reusing `resolveEntity`/`resolveCharacterByName` patterns from `tool-executor.ts` instead of building a new entity ontology
- **Honest fallback design**: the `fallbackReason` field in the normalized target context prevents silent overclaiming — when resolution fails, it fails explicitly
- **Bounded scope**: explicitly excludes travel/time, faction strategy, companion management, and prompt cleanup
- **Oracle contract stability**: correctly identifies that `oracle.ts` needs zero changes — the contract already supports `targetTags`, only the upstream caller is broken

### Concerns

- **HIGH — Target extraction from free-text is underspecified.** The plan says "text-compatible" and "backend-first" but doesn't specify how the system will identify which entity in a player's free-text action is the target. The current `detectMovement()` in `turn-processor.ts` uses an LLM call for movement detection — will target extraction also need an LLM call? If so, this adds latency and cost to every turn. If it uses regex/heuristic parsing, coverage will be spotty. The plan should specify the extraction strategy or at minimum acknowledge this as the core technical decision.

- **MEDIUM — No specification of what "target tags" actually contain per entity type.** The plan says "derive tags/attributes suitable for Oracle input" but doesn't define what tags a resolved `item` or `location/object` produces. For characters, `deriveRuntimeCharacterTags()` already exists. For items and locations, the raw `tags` JSON column exists. Is that sufficient, or do items/locations need derived tags too? The Oracle system prompt examples show `Target: [iron-lock, rusted]` — this suggests raw entity tags are fine, but the plan should be explicit.

- **MEDIUM — The `intent` and `method` fields already partially encode target information.** The chat route parses player actions into `intent` and `method` before calling `processTurn`. If the target is already embedded in `intent` (e.g., "Attack the goblin"), the target-resolution step needs to coordinate with this existing parsing. The plan doesn't address this interaction.

- **LOW — Test strategy assumes mock DB can meaningfully test target resolution.** The existing test infrastructure uses heavily mocked DB responses. Target resolution across multiple entity tables (players, npcs, locations, items) will need more sophisticated mock setups. Not a blocker, but the test task may be larger than it appears.

### Suggestions

- **Specify the target-extraction mechanism explicitly.** Recommend: extend the existing `detectMovement()` pattern with an LLM-based target-extraction call that returns `{ targetName: string | null, targetType: string | null }`, then resolve against the DB. This is consistent with the project's existing "LLM as classifier, backend as authority" pattern. Alternatively, if the `intent` field already names the target, parse it from there without an additional LLM call.

- **Define the tag derivation contract per entity type:**
  - `character` (player/npc): use `deriveRuntimeCharacterTags()` — already exists
  - `item`: use raw `tags` JSON column from items table
  - `location`: use raw `tags` JSON column from locations table
  - `faction`: use raw `tags` JSON column from factions table (conditional path)

- **Add a test case for the movement+target interaction.** What happens when a player says "Go to the tavern and attack the barkeep"? The movement detection fires first; does target resolution also fire on the same action? The plan should clarify whether these are mutually exclusive or composable.

- **Consider caching or memoizing target resolution within a turn.** If the Storyteller's tool calls later reference the same target (e.g., `add_tag` on the same NPC), the resolution should be consistent. Not critical for Plan 01 but worth noting.

---

## Plan 42-02: Start-Condition Runtime Effects

### Summary

More ambitious and less precisely specified than Plan 01. The goal — making start conditions mechanically consequential — is clear, but the plan leaves the most critical design decision ("what storage shape fits early-game effects") to implementer discretion. This is appropriate given the CONTEXT.md explicitly grants that discretion, but it means the plan's success depends heavily on the executor making a good architectural choice. The persistence story is solid thanks to Phases 39 and 41, but the "what does mechanical effect actually mean" question is still soft.

### Strengths

- **Correct dependency chain**: Plan 02 depends on Plan 01 and Phase 41, both of which establish the persistence guarantees needed for start-condition mechanics to survive restore
- **Bounded companion semantics**: explicitly limits companions to "presence/context" without party management — prevents the most dangerous scope creep vector
- **Deterministic re-derivation as persistence strategy**: recognizing that start-condition effects can be re-derived from canonical saved data (which Phase 41 already restores) is the lightest-weight persistence approach and avoids inventing new state containers
- **Existing precedent in loadout-deriver**: the plan correctly identifies `loadout-deriver.ts` as proof that start conditions can already drive backend-owned mechanics — this is the right pattern to extend

### Concerns

- **HIGH — "Scene flags, action gating, and Oracle modifiers" is still abstract.** The plan names three effect types but doesn't concretize any of them. What is a "scene flag" in the current codebase? There's no `sceneFlags` field on any existing table or state object. Does the plan intend to use `statusFlags` on the player record? `conditions`? A new field? The executor will need to make this decision, and a wrong choice could create a state container that doesn't survive restore or conflicts with Phase 38's later inventory work.

- **HIGH — The "early game" boundary is undefined.** Start-condition effects should influence "early gameplay" — but when do they expire? After tick 1? Tick 5? Never? If `arrivalMode: "hidden"` gives a stealth bonus, does it last one turn or the whole game? The plan says "opening-state flags and modifiers" but doesn't specify a decay or expiration mechanism. Without this, either the effects are permanent (overclaiming) or the executor invents an expiration mechanism not specified in the plan.

- **MEDIUM — `immediateSituation` is the most dangerous field.** It's free-text authored by an LLM during `resolveStartingLocation()`. Converting arbitrary LLM-generated text into "structured opening effects" requires either another LLM classification step (adds complexity) or ignoring the text content and using it purely as a prompt modifier (which contradicts D-10's requirement for "structured runtime state, not only prompt flavor"). The plan should specify which approach to take.

- **MEDIUM — Prompt-assembler changes may conflict with the existing start-condition surfacing.** `prompt-assembler.ts` already renders start conditions as `Start:`, `Opening Situation:`, `Opening Pressure:`, and `Visibility:` lines. If Plan 02 also materializes these into `statusFlags` or `conditions`, the prompt assembler needs to be updated to avoid double-surfacing. The plan lists `prompt-assembler.ts` in modified files but doesn't specify the coordination.

- **LOW — No frontend awareness of start-condition-derived state.** If `arrivalMode: "hidden"` translates to a `hidden` status flag, does the `/game` UI show this to the player? The plan is backend-focused, which is correct for the runtime mechanics, but the player may not realize their start conditions are having mechanical effects without some UI signal.

### Suggestions

- **Concretize the storage decision in the plan.** Recommend: use the existing `state.statusFlags` array on the player's `CharacterRecord` for start-condition-derived effects. This field already exists, survives checkpoint/restore through the character record, and is already readable by `deriveRuntimeCharacterTags()`. Start-condition effects become status flags like `arrival:hidden`, `pressure:pursuit`, `visibility:anonymous` that the Oracle can read as actor tags and the prompt assembler already surfaces.

- **Define expiration rules.** Recommend a tick-based approach: start-condition effects apply for ticks 0 through N (configurable, default 3-5), then automatically expire. The `deriveStartConditionEffects()` function takes `currentTick` and `startTick` (tick 0, when the character was saved) and only returns active effects. This keeps the mechanic bounded to "early game" without being permanent.

- **Handle `immediateSituation` explicitly.** Recommend: treat it as a structured LLM-classification problem. At save time (in `save-character`), classify the `immediateSituation` text into a small set of predefined opening-state flags using `generateObject` with a Zod schema. This is consistent with how `resolveStartingLocation` already works. Store the classified flags, not the raw text, as the mechanical basis.

- **Add a test case for the re-derivation path.** The plan claims effects can be "deterministically re-derived from canonical saved state." Write a test that: saves a character with start conditions → derives effects → simulates checkpoint restore (which replaces state.db) → re-derives effects → asserts they match. This directly validates the persistence claim.

- **Specify what "action gating" means concretely.** Does it mean certain quick actions are filtered? Certain Oracle evaluations automatically fail? Certain tool calls are blocked? Without this, "action gating" could mean anything from a prompt hint to a hard backend rejection.

---

## Cross-Plan Assessment

### Risk Assessment: **MEDIUM**

**Justification:**

Plan 01 is well-bounded and low-risk. The main technical question (target extraction from free text) is solvable with existing patterns. The Oracle contract is already correct; only the upstream caller needs work.

Plan 02 carries most of the phase risk. The abstraction level is appropriate for a planning document, but the gap between "scene flags, action gating, and Oracle modifiers" and actual implementation is large enough that the executor could produce widely different outcomes depending on interpretation. The three high/medium concerns (storage shape, expiration, immediateSituation handling) are all solvable but unspecified.

**The plans do achieve the phase goals** — GSEM-01 and GSEM-02 are directly addressed. The two-plan decomposition along Oracle targeting vs. start-condition mechanics is the right split. The dependency ordering (01 before 02) is correct. Scope boundaries against Phase 38, 43, and 44 are well-drawn.

**The main risk is not failure but ambiguity in Plan 02's mechanical semantics**, which could lead to either under-delivery (effects that are still mostly prompt-flavor with a thin runtime veneer) or over-delivery (a mini rules engine that creates Phase 38/43 dependency bleed).

### Dependency Note

The roadmap lists Phase 38 (Authoritative Inventory & Equipment State) as a dependency for Phase 42, but Phase 38 is "Not started." Both plans correctly acknowledge this and avoid inventing new inventory mechanics. However, if Plan 02's start-condition effects interact with equipment (e.g., `arrivalMode: "armed"` implies having weapons equipped), the Phase 38 dependency becomes real rather than theoretical. The plans should explicitly state: "start-condition effects do NOT modify inventory or equipment state; those mechanics wait for Phase 38."

---

## Gemini Review

# Phase 42 Implementation Plan Review: Targeted Oracle & Start-Condition Runtime Effects

## 1. Summary
The implementation plans for Phase 42 are exceptionally disciplined and surgically address the "Gameplay Fidelity" requirements of the v1.1 milestone. By separating target resolution from Oracle evaluation and translating descriptive start conditions into structured runtime flags, the plans bridge the gap between "narration flavor" and "mechanical truth" identified in the Phase 36 audit. The approach avoids over-engineering by utilizing existing persistence seams and entity-resolution patterns, ensuring that new mechanics are both verifiable and performant.

## 2. Strengths
- **Surgical Seam Integration:** Updating `turn-processor.ts` to replace hard-coded `targetTags: []` is the highest-leverage path to satisfying `GSEM-01`.
- **Logic Reuse:** Reusing entity lookup patterns from `tool-executor.ts` (Plan 42-01) prevents the creation of a parallel, drifting ontology for target resolution.
- **Bounded Mechanics:** The decision to resolve start conditions into "scene flags and modifiers" (Plan 42-02) rather than a free-form rules engine (D-08) protects the system from scope creep and maintainability issues.
- **Honest Fallbacks:** The commitment to "honest fallback" (D-04) ensures the system degrades gracefully when a target cannot be resolved, rather than hallucinating target context.
- **Persistence First:** Leveraging the restore guarantees from Phase 41 ensures that these new mechanics survive the "rollback boundary," which is critical for a deterministic engine.

## 3. Concerns
- **Target Discovery Ambiguity (Severity: MEDIUM):** 
  Plan 42-01 focuses on *resolving* a target once identified, but it is less explicit on how the *identification* happens from free-text (e.g., turning "stab the tall guard" into `npc:id_123`). If this requires a new LLM extraction step before every Oracle call, it may impact latency. If it relies on simple string matching, it may be brittle.
- **Effect Lifetime Management (Severity: MEDIUM):** 
  Start conditions like `immediateSituation` or `entryPressure` are often transient (e.g., "pursued by guards"). The plan does not explicitly define an "expiration" or "clear" condition for these flags. There is a risk that "opening pressures" could unintentionally persist for the entire campaign if not scoped to the first N ticks or the first location change.
- **Gating Enforcement (Severity: LOW):** 
  The plan mentions "action gating/unlocking" (D-09). It is unclear where this enforcement lives. If a player is "hidden" via start conditions, does the backend actually block certain NPC tools, or does it simply pass a `hidden` tag to the Oracle? Real gating usually requires changes to `tool-executor.ts` or the prompt assembler's tool availability logic.

## 4. Suggestions
- **Target Extraction Pattern:** Replicate the `detectMovement` pattern in `turn-processor.ts` to create a `detectActionTarget` helper. This should extract a "target candidate name" from the user's action before passing it to the resolution helper.
- **Define Mechanic Lifecycles:** In `start-condition-runtime.ts`, consider adding a `shouldExpire(currentTick, startTick)` check or a location-change trigger to clear transient opening effects like `entryPressure`.
- **Oracle Modifier Transparency:** Since Oracle modifiers are "mechanical truth," consider surfacing active modifiers (e.g., "Difficulty: +15% [Pursued]") in the `finalizing_turn` or `state_update` events so the player (and debug logs) can see the mechanics at work.
- **Integration with Prompt Assembler:** Ensure `buildPlayerStateSection` in `prompt-assembler.ts` is updated to show the *active mechanical state* (e.g., "Status: Hidden") derived from start conditions, rather than just re-printing the authored start-condition text.

## 5. Risk Assessment
**Overall Risk: LOW-MEDIUM**

The primary technical risk is the **Target Resolution Seam**. Because the player action is free-text, the "glue" between the user's words and the database entities must be robust. However, because Plan 42-01 includes an explicit "honest fallback" to non-targeted rulings, even a failure in resolution does not break the turn loop—it simply reverts to the v1.0 baseline behavior. The start-condition persistence risk is mitigated by the successful completion of Phase 41.

**Justification:** The plans are well-bounded, preserve existing invariants, and provide clear TDD-driven paths to verification. They resolve documented gaps without expanding the "Narrator" role into "Engine" territory.

---

## Consensus Summary

Both reviewers agree that the phase split is correct:
- `42-01` is a low-risk, high-leverage seam fix around the hard-coded empty `targetTags` path.
- `42-02` is the main risk area because the phrase “scene flags, action gating, and Oracle modifiers” still leaves several mechanical semantics underspecified.

### Agreed Strengths

- The two-plan split is correct and maps cleanly to `GSEM-01` and `GSEM-02`.
- `42-01` correctly reuses existing entity-resolution/runtime seams instead of inventing a second ontology.
- Honest fallback for unsupported/unresolved targets is the right contract.
- `42-02` keeps scope bounded and correctly avoids spilling into travel/time, party management, or wide inventory redesign.
- Persistence assumptions are sound because the phase builds on Phases 39 and 41 rather than inventing a new restore model.

### Agreed Concerns

- **Target extraction is underspecified.** Both reviewers call out that resolving target context is only half the problem; identifying the target from free-text player input still needs a clearer plan.
- **Start-condition effect lifetime is underspecified.** Both reviewers flag the absence of a clear “early-game” expiration boundary for opening-state effects.
- **`42-02` needs more concrete semantics for mechanical effects.** In particular, storage shape / active-state representation, action gating semantics, and the exact handling of `immediateSituation` remain the softest parts of the plan.

### Divergent Views

- Claude is more concerned about the exact storage shape for start-condition-derived mechanics and how it could collide with later inventory/state work.
- Gemini is more comfortable with the overall boundedness of the plan and focuses more on lifecycle and observability than on the storage seam itself.
- Claude additionally raises the Phase 38 dependency edge case more explicitly: start-condition effects must not imply equipment/inventory mutation before that authority model is repaired.
