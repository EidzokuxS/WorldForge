---
phase: 49
reviewers:
  - claude
reviewed_at: 2026-04-12T00:00:00+03:00
plans_reviewed:
  - 49-01-PLAN.md
  - 49-02-PLAN.md
  - 49-03-PLAN.md
---

# Cross-AI Plan Review — Phase 49

## Gemini Review

Unavailable for this run. The CLI returned `429 MODEL_CAPACITY_EXHAUSTED`, so no usable review content was produced.

---

## Claude Review

# Phase 49 Plan Review: Search Grounding & In-Game Research Semantics

## Overall Assessment

The three plans form a well-structured wave decomposition that tracks the research recommendations closely. The wave ordering (worldgen intent -> character grounding -> runtime lookup + surface) is correct and avoids circular dependencies. The plans reuse existing seams rather than inventing parallel infrastructure, which matches the user's explicit constraints. The main risks are around Plan 03's runtime lookup scope and the practical integration of grounded profiles into the live prompt assembly pipeline.

---

## Plan 49-01: Worldgen Retrieval Intent & ipContext Reuse

### Summary
Adds a typed retrieval-intent planner for worldgen and wires ip-researcher to emit focused search jobs instead of blended queries, while keeping world canon on the single `ipContext` lane. Straightforward scope, low risk.

### Strengths
- Correctly identifies `ip-researcher.ts` as the right seam to modify rather than creating a parallel research pipeline
- Explicit about not creating a second canon store (D-04 through D-06)
- TDD approach with clear test behaviors for decomposition, sufficiency enrichment, and fallback transparency
- Task split is clean: planner + researcher in Task 1, route reuse + regressions in Task 2

### Concerns
- **LOW**: The `researchPlanSchema` in ip-researcher already generates targeted deep-dive queries (line 184-192). The plan should clarify whether the new retrieval-intent planner *replaces* that existing `researchPlanSchema` or sits above it. Risk of two planning layers competing.
- **LOW**: Task 2 acceptance criteria checks for `rg -n "duplicate canon|second store|preload"` in test files - this is checking for comment/description text, not actual behavioral assertions. The test should prove behavior (e.g., "only one `saveIpContext` call happens per generate flow"), not comment presence.
- **LOW**: The `evaluateResearchSufficiency()` function already takes a `step` parameter typed as `"locations" | "factions" | "npcs"`. The plan should acknowledge this existing narrowing and build on it rather than potentially duplicating the concept.

### Suggestions
- Clarify whether `RetrievalIntent` replaces `researchPlanSchema` or wraps it. Prefer replacement to avoid two layers.
- Task 2 acceptance criteria should assert behavioral invariants (e.g., `saveIpContext` called exactly once per generate, no new config keys created) rather than grepping for comment text.

### Risk Assessment: **LOW**
Well-scoped, builds on existing seams, clear test plan. The main risk is minor scope overlap with existing `researchPlanSchema` - easily resolved during execution.

---

## Plan 49-02: Character & Power Grounding on Phase 48 Lane

### Summary
Adds `CharacterGroundingProfile` and `PowerProfile` types to shared, wires them through record-adapters/schemas, and rebuilds archetype-researcher plus import seams to produce durable structured grounding. The most complex plan of the three.

### Strengths
- Correctly places grounding adjacent to `sourceBundle` and `continuity` on the existing Phase 48 lane (not a fork)
- Covers both research-character AND import-v2-card paths - the import path is easy to forget
- Explicit about citations and uncertainty in power profiles (D-10, D-11, D-12)
- Separation of shared types (Task 1) from backend synthesis logic (Task 2) is correct for wave ordering

### Concerns
- **MEDIUM**: `archetype-researcher.ts` currently returns `string | null` (raw research prose). Transforming it to also produce structured `CharacterGroundingProfile` is a significant behavioral change. The plan says "rework" but doesn't specify whether the function signature changes or a new parallel function is added. If the signature changes, all three callers in `character.ts` (research-character for both player and key roles) need updating.
- **MEDIUM**: The plan says `grounded-character-profile.ts` will "synthesize compact grounded character artifacts from retrieved inputs." This synthesis requires an LLM call to convert raw search results into structured profiles. The plan doesn't mention the LLM call cost, provider routing, or error handling for synthesis failure. If synthesis fails, does the character still get created without grounding?
- **LOW**: `mapV2CardToCharacter` and `mapV2CardToNpc` in generator.ts/npc-generator.ts don't call research - they just map card fields. The plan says import-v2-card should "receive durable search-backed canon/power grounding," but currently import is a pure card->draft transform. Adding web search to the import path would change its latency profile significantly. The plan should clarify: does import trigger new research, or does it only structure existing card data into the grounding format?
- **LOW**: The `normalizeCharacterDraftRecord` function in record-adapters.ts already handles `sourceBundle` and `continuity` normalization. Adding `grounding` normalization follows the same pattern but needs to handle the case where old stored records lack the field (backward compat).

### Suggestions
- Explicitly state whether `researchArchetype()` changes signature or a new function is added alongside it. The route in `character.ts` calls it via `researchArchetype({...})` and passes the result as `researchContext` to generators.
- Clarify the import-v2-card grounding strategy: does it trigger live search for the imported character, or does it only structure the card's existing data (description, personality, tags) into the grounding format? The latter is safer and faster.
- Add a graceful degradation path: if grounding synthesis fails, the character should still be created with `grounding: undefined` rather than failing the entire create/import flow.
- Consider whether the power-profile LLM synthesis should use the Generator role or a dedicated role. Generator is the natural choice but the plan should be explicit.

### Risk Assessment: **MEDIUM**
The scope is appropriate but the plan underspecifies the LLM synthesis mechanics and the import-path grounding strategy. Both are resolvable during execution but could cause task-level replanning if the executor makes wrong assumptions.

---

## Plan 49-03: Runtime Lookup & Settings Alignment

### Summary
Adds a `grounded-lookup.ts` service for in-game fact/power lookups, wires it into turn-processor as a branch before normal Oracle/scene, adds a prompt-assembler boundary, and updates settings copy. The most architecturally ambitious plan.

### Strengths
- Explicit about preserving the Phase 47 visible-pass guard contract - avoids breaking existing narration quality work
- Correct instinct to branch before Oracle/scene rather than injecting into the narration pipeline
- Settings copy update (Task 2) is important and often forgotten - good that it's included
- Clear separation: lookup stays factual, scene stays narrative

### Concerns
- **HIGH**: The plan says turn-processor should "short-circuit or branch before the normal Oracle/scene-narration path" for lookup requests. But `processTurn` currently receives `{ playerAction, intent, method }` - there's no field to signal "this is a lookup, not a scene action." The plan doesn't specify how lookup intent is detected. Options: (a) a new route endpoint like `/api/chat/lookup`, (b) a new field in the action body, (c) intent classification inside turn-processor. Each has different implications. This is the plan's biggest gap.
- **MEDIUM**: The plan says lookup should "return a concise factual answer instead of a full scene turn." But the current SSE protocol emits `oracle_result -> scene-settling -> narrative -> state_update -> quick_actions -> done`. A lookup response needs a different event shape or a special `narrative` event that the frontend knows to render differently. The plan doesn't specify the SSE contract for lookup responses, nor how `/game` renders them.
- **MEDIUM**: `grounded-lookup.ts` needs to consume the retrieval planner from 49-01 and character grounding from 49-02. But the retrieval planner is worldgen-focused (`world_canon_fact`). The plan's research doc mentions additional intent kinds (`character_canon_fact`, `power_profile`, `event_clarification`) but 49-01 only implements `world_canon_fact`. Plan 49-03 may need to extend the retrieval-intent planner, which creates a hidden dependency back on 49-01's code.
- **LOW**: The plan modifies `shared/src/index.ts` to re-export grounding types. This is a barrel-export change that should have been in 49-02 when the types were created. Deferring it to 49-03 means 49-02's tests can't import from `@worldforge/shared` cleanly.
- **LOW**: Task 2 (settings copy) is trivial but the acceptance criteria `rg -n "before world generation" frontend/components/settings/research-tab.tsx returns no matches` is fragile - the current copy says "before world generation" in a different phrasing ("before building the world scaffold"). Need to check exact current wording.

### Suggestions
- **Critical**: Specify how lookup intent enters the system. Recommend a new route `/api/chat/lookup` with a dedicated body schema (`{ campaignId, lookupKind, subject, compareAgainst? }`) rather than overloading the action route. This keeps the turn-processor branching clean and avoids intent-classification ambiguity.
- **Critical**: Define the SSE event contract for lookup responses. Suggest: `{ event: "lookup_result", data: { kind, answer, citations, sceneImpact } }` followed by `{ event: "done" }`. No oracle_result, no scene-settling, no quick_actions.
- Move the `shared/src/index.ts` barrel re-export into Plan 49-02 so the types are immediately importable after that plan completes.
- Extend the retrieval-intent planner types in 49-01 to include all four intent kinds (world_canon_fact, character_canon_fact, power_profile, event_clarification), even if 49-01 only exercises the worldgen kind. This avoids 49-03 having to modify 49-01's code.
- Specify the frontend rendering strategy for lookup results, even if minimal. At minimum: does `/game` need a new message type in the chat log, or does the lookup answer appear as a special assistant message?

### Risk Assessment: **HIGH**
The plan's core architecture is sound but it underspecifies the entry point (how lookups are triggered), the transport contract (SSE events), and the frontend rendering. These are not implementation details - they're architectural decisions that affect the route layer, the frontend, and the SSE protocol. An executor without this guidance will either make ad-hoc choices or block on a checkpoint.

---

## Cross-Plan Observations

### Dependency Chain
49-01 -> 49-02 -> 49-03 is correct. No circular dependencies. However:
- 49-02 should own the `shared/src/index.ts` re-export, not 49-03
- 49-01 should define all retrieval intent kinds (worldgen + character + power + event), even if it only exercises the worldgen ones

### Scope Assessment
- 49-01: Tight, well-scoped. ~1 session.
- 49-02: Medium scope, manageable. ~1-2 sessions.
- 49-03: Ambitious. The runtime lookup is a new gameplay feature, not just a backend wiring change. Could easily take 2+ sessions if the SSE/frontend integration isn't pre-decided.

### Missing from All Plans
- No plan addresses how the frontend `/game` page renders lookup results. Even if Phase 50 owns "rich text presentation," the basic rendering of a lookup answer in the chat log needs to exist in this phase for the feature to be testable.
- No plan mentions the `chatActionBodySchema` or whether a new schema is needed for lookup requests. The current schema is `{ campaignId, playerAction, intent, method }` - lookup doesn't fit naturally.

### Overall Phase Risk: **MEDIUM**
Plans 49-01 and 49-02 are solid. Plan 49-03 needs architectural pre-decisions before execution to avoid mid-plan replanning. The phase will deliver on RES-01 if Plan 49-03's transport and rendering gaps are resolved.

---

## Codex Review

Skipped for independence because this thread is the active Codex runtime.

---

## Consensus Summary

Only one usable external review was available in this run. The strongest concerns are all concentrated in `49-03`: the lookup entry point, the transport contract for lookup responses, and the minimal frontend rendering path are underspecified and should be fixed before execution. Secondary concerns are narrower: `49-01` should clarify whether retrieval intent replaces or wraps the existing worldgen search planner, and `49-02` should be explicit about import-path grounding strategy and graceful degradation if structured synthesis fails.

### Agreed Strengths

- The phase split is directionally correct: worldgen retrieval intent first, then character grounding, then runtime lookup.
- The package reuses existing canon and character seams rather than creating parallel storage or side systems.
- Import-path coverage for grounded character data is now explicitly present and no longer a planning gap.

### Agreed Concerns

- `49-03` still needs an explicit entry path for lookup requests instead of relying on an implied branch inside the normal turn flow.
- `49-03` needs a concrete SSE and frontend rendering contract for lookup responses.
- `49-01` should be explicit that the new retrieval-intent planner owns the planning role instead of competing with an older worldgen planner seam.
- `49-02` should define whether imported characters trigger new research or only structure existing card data, and should state the fallback if grounding synthesis fails.

### Divergent Views

- None recorded. Only Claude returned a usable review in this run; Gemini failed with capacity exhaustion and Codex was intentionally skipped.
