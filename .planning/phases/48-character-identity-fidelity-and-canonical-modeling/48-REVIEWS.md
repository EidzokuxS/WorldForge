---
phase: 48
reviewers:
  - gemini
  - claude
reviewed_at: 2026-04-12T15:38:00Z
plans_reviewed:
  - 48-01-PLAN.md
  - 48-02-PLAN.md
  - 48-03-PLAN.md
  - 48-04-PLAN.md
---

# Cross-AI Plan Review — Phase 48

## Gemini Review

### 1. Summary
The Phase 48 plan package provides a well-structured, comprehensive approach to upgrading the character identity model. By introducing a three-layer truth model (`baseFacts`, `behavioralCore`, `liveDynamics`) within the existing shared `CharacterDraft`/`CharacterRecord` lane, it successfully avoids the anti-pattern of forking a separate "canonical-only" ontology. The wave-ordered execution thoughtfully sequences schema/adapter work, followed by generation pipelines, runtime consumers, and finally bounded UI updates. The plan strictly adheres to the requirement of preserving authoritative mechanical truth while preventing character flattening.

### 2. Strengths
- **Unified Ontology:** Extending the existing shared lane rather than creating parallel character types prevents fragmentation and ensures that player, native, and imported characters all benefit from the richer model.
- **Layered Truth Model:** Explicitly separating stable traits (`baseFacts`, `behavioralCore`) from mutable state (`liveDynamics`) elegantly solves the problem of trivial personality drift while still allowing earned change.
- **Rigorous Validation Strategy:** Using the currently failing `generator.test.ts` as a red baseline guard is excellent. The Wave 0 test ownership model ensures that test scaffolds dictate the contract boundaries before implementation begins.
- **Bounded UI Scope:** Plan `48-04` wisely restricts the UI updates to preserving the richer data during round-trips and only minimally exposing what is necessary, avoiding a scope-creeping editor redesign.

### 3. Concerns
- **MEDIUM:** Existing characters may not get enough deterministic backfill into `behavioralCore` and related richer fields, which risks legacy saves feeling hollow relative to newly generated characters.
- **MEDIUM:** Reflection “promotion” from `liveDynamics` into deeper identity layers is not fully explicit yet.
- **LOW:** A read-only surface for the synthesized identity core may be useful later for player trust, even if deep editing stays out of scope here.

### 4. Suggestions
- Add an explicit migration/backfill note for legacy characters.
- Clarify promotion logic for deeper identity shifts.
- Consider a minimal read-only “identity core” surface later if users need more transparency.

### 5. Risk Assessment
**MEDIUM** — Architecture is strong; the main risks are migration quality and clearly defining how deeper identity changes become earned rather than frozen or trivial.

---

## Claude Review

## 1. Summary

This is a well-structured four-plan phase that addresses a real problem: characters collapse into thin `persona + tags + goals` summaries at runtime, losing the details that make them behaviorally distinct. The plans follow a sound wave-ordered approach — schema/types first (Plan 01), then generation/route alignment (Plan 02), then runtime consumer migration (Plan 03), then bounded frontend preservation (Plan 04). The three-layer identity model (baseFacts / behavioralCore / liveDynamics) with optional source-bundle and continuity metadata is architecturally clean and stays on the existing shared `CharacterDraft/CharacterRecord` lane from Phases 29/30 instead of forking. The main risks are scope density in Plan 02, the "richer but still LLM-generated" gap in the generation output schema, and a missing migration/backfill strategy for existing campaigns.

## 2. Strengths

- **Single shared ontology**: All four plans consistently extend the existing `CharacterDraft`/`CharacterRecord` rather than creating canonical-only or backend-only shadow types. This is the right call given Phases 29 and 30.

- **Wave ordering eliminates forward references**: Plan 01 (types + schemas) must land before Plan 02 (generators + routes) can consume them, and Plan 03 (runtime consumers) depends on both. Plan 04 (frontend) runs in parallel with Plan 03 since both only depend on 01+02. This is correct.

- **Continuity as metadata, not lockdown**: The plans explicitly separate "preserve identity" from "freeze character." Reflection stays scoped to `liveDynamics` with earned promotion for deeper changes, which honors D-09/D-10 without implementing rigidity.

- **Explicit red baseline acknowledgment**: Plan 02 correctly identifies the existing `generator.test.ts` failures as prerequisite work, not polish. This prevents the common mistake of building on a test suite that is already broken.

- **UI scope discipline**: Plan 04 explicitly avoids redesigning the character editor. The goal is round-trip safety, not rich editing of every new field. This is the right boundary for this phase.

- **Test-driven with Wave 0 gap tracking**: The validation strategy has explicit ownership for every missing test file, and the wave-0 contract prevents claiming completion without test coverage.

## 3. Concerns

### HIGH

**H1: No migration/backfill strategy for existing saved characters.**  
Plans 01 and 02 define richer identity fields, but there is no explicit plan for what happens when existing campaigns are loaded with `characterRecord` JSON that lacks `baseFacts`, `behavioralCore`, `liveDynamics`, `sourceBundle`, or `continuity`. The hydration functions in `record-adapters.ts` need deterministic default-mapping: existing `backgroundSummary` → `baseFacts.biography`, existing `drives`/`frictions` → `behavioralCore`, existing `beliefs`/`goals` → `liveDynamics`, etc. Task 48-01-02 mentions this mapping but does not specify it as a hard requirement with test coverage for the "stored JSON has no new fields" case. If this is fuzzy, every existing campaign will either crash or silently produce empty identity layers.

**H2: Plan 02 Task 48-02-02 is overloaded.**  
This single task modifies `npc-generator.ts`, `routes/character.ts`, `routes/campaigns.ts`, and adds/extends three test files (`npc-generator.test.ts`, `character.test.ts`, `campaigns.test.ts`). That is two distinct concerns (generator alignment + route boundary fidelity) packed into one task. If the generator changes break route tests or vice versa, debugging becomes harder. Consider splitting into 48-02-02a (NPC generator alignment) and 48-02-02b (route boundary regressions).

### MEDIUM

**M1: Generation output schema still uses `richCharacterSchema` (persona/tags/goals), not the three-layer identity model.**  
Plans 02 refers to updating "prompts" and "prompt doctrine" but the actual LLM output schema in `generator.ts` (`richCharacterSchema`) and `npc-generator.ts` (`npcSchema`) still emit flat fields like `backgroundSummary`, `personaSummary`, `tags`, `goals`. The richer identity mapping happens post-generation in `toCharacterDraftFromRich()` / `toNpcDraft()`. Plan 02 should clarify: are we (a) keeping the LLM output schema flat and doing richer mapping in the adapter, or (b) asking the LLM to emit `baseFacts`/`behavioralCore`/`liveDynamics` directly? Option (a) is safer and faster but means generation still produces thin summaries that get mechanically slotted. Option (b) gets richer data but risks LLM schema compliance issues. The plan should state the choice explicitly.

**M2: `CharacterDraftPatch` needs extending for richer identity layers.**  
Plan 02 Task 48-02-03 says persona templates should patch richer identity layers (`baseFacts`, `behavioralCore`, `liveDynamics`), but `CharacterDraftPatch` in `shared/src/types.ts` currently does not include these fields. Plan 01 extends `CharacterDraft` and `CharacterRecord`, but does not mention extending `CharacterDraftPatch`. If templates can't patch the richer layers, Task 48-02-03 cannot deliver its stated behavior.

**M3: Off-screen NPC simulation prompt still uses thin identity slices.**  
Plan 03 Task 48-03-01 mentions `npc-offscreen.ts` but the current batch prompt in `simulateOffscreenNpcs()` builds NPC summaries from `personaSummary` + `tags` + `goals`. The plan says to use richer identity, but off-screen is a batch prompt for multiple NPCs at once. If each NPC now carries 5-10x more identity context, the batch prompt may hit token limits. The plan should note this constraint or cap the identity slices for batch contexts.

**M4: No explicit prompt-assembler.ts interface reading in Plan 03.**  
The `<interfaces>` block shows `assemblePrompt` and `assembleFinalNarrationPrompt` signatures, but the actual NPC identity context is built inside scene assembly helpers. Plan 03 should specify which scene assembly functions need modification, not just the top-level assembler.

### LOW

**L1: `canonical-source-bundle.ts` is a new file with unclear scope.**  
Plan 01 creates this helper, but the validation strategy does not have a dedicated test file for it. The helpers are tested indirectly through `record-adapters.identity.test.ts`. If the source-bundle logic is non-trivial, it should have its own unit tests.

**L2: Frontend `api-types.ts` changes in Plan 04 may need coordination with world-review components.**  
The world-review NPC section uses `ScaffoldNpc` with a `draft` field. If `CharacterDraft` shape changes, world-review NPC editing (which is not in Plan 04's file list) could break silently. The plan should verify that `frontend/components/world-review/npcs-section.tsx` is not affected.

**L3: Reflection tools interface (`reflection-tools.ts`) is listed in Plan 03 but has no test file.**  
The existing `reflection-agent.test.ts` may cover tool behavior indirectly, but if Plan 03 adds earned-promotion logic to the tools themselves, explicit tool-level tests would be prudent.

## 4. Suggestions

1. **Add explicit migration test in 48-01-02**: Create a test case where `parseStoredCharacterRecord()` receives JSON with no `baseFacts`/`behavioralCore`/`liveDynamics` keys and verify it deterministically maps existing fields into the new layers. This is the most critical correctness boundary in the whole phase.

2. **Split 48-02-02**: Separate NPC generator alignment from route boundary regressions. Two focused tasks are easier to debug and commit atomically than one omnibus task touching 7 files.

3. **State the LLM output schema strategy explicitly**: Add a note in Plan 02 clarifying whether the LLM is asked to emit three-layer identity directly or whether the adapter does the mapping. My recommendation: keep the LLM output schema flat and do richer mapping in the adapter — it's safer and the identity enrichment is deterministic.

4. **Extend `CharacterDraftPatch` in Plan 01**: Add `baseFacts`, `behavioralCore`, `liveDynamics`, `sourceBundle`, and `continuity` as optional partial fields in `CharacterDraftPatch` so Plan 02 Task 48-02-03 can actually patch them through persona templates.

5. **Cap off-screen identity context**: In Plan 03 Task 48-03-01, note that the off-screen batch prompt should use a bounded identity summary (e.g., top motives + current strains only) rather than the full richer model, to avoid token budget issues with 5+ off-screen NPCs.

6. **Verify world-review NPC section compatibility**: Add `frontend/components/world-review/npcs-section.tsx` to Plan 04's verification scope or at least note it as a regression check.

## 5. Risk Assessment

**Overall: MEDIUM**

The architecture is sound and the wave ordering is correct. The main risks are operational:
- Missing migration handling for existing campaigns (HIGH if not addressed — broken load path)
- Plan 02 Task 48-02-02 overload (MEDIUM — manageable but fragile)
- Ambiguity about LLM output schema vs adapter mapping (MEDIUM — needs one sentence of clarification)

None of these are architectural blockers. They are all addressable with targeted additions to the existing plan structure. The phase will satisfy CHARF-01 if execution follows the plans and the migration/backfill gap is closed.

The canonical fidelity approach is well-balanced: strong enough to preserve identity without role-locking. The three-layer model with earned promotion is the right design for characters that need to feel like themselves while still being allowed to change through gameplay.

---

## Consensus Summary

Both reviewers agree the package is architecturally strong:
- one shared richer character ontology instead of forked models
- correct wave ordering
- correct continuity model for canonical characters
- bounded UI scope

Shared concerns:
- **Migration/backfill for existing saved characters** needs to be made more explicit and tested as a first-class boundary, not left implicit in adapter work.
- **Plan 48-02 is dense** and may benefit from either clearer internal sub-splitting or very explicit execution discipline.

Reviewer-specific but credible concerns:
- clarify whether richer identity is emitted directly by the LLM schema or deterministically mapped from flatter generation output
- ensure `CharacterDraftPatch` and persona-template seams are fully aligned with the richer model
- cap off-screen identity context so batch prompts do not bloat
- sanity-check world-review compatibility if `CharacterDraft` shape expansion touches that path

### Agreed Strengths
- The package preserves the existing shared `CharacterDraft` / `CharacterRecord` lane instead of inventing parallel ontologies.
- The three-layer model (`baseFacts`, `behavioralCore`, `liveDynamics`) is the right structural answer to identity fidelity versus live change.
- Runtime consumers are covered rather than leaving the work at creation/import time only.
- Frontend scope remains appropriately bounded for this phase.

### Agreed Concerns
- Migration/backfill from old saved character data needs stronger explicit treatment.
- Plan `48-02` is the densest and riskiest part of the package.

### Divergent Views
- `Gemini` is mostly satisfied with the current package and frames remaining issues as medium-risk execution details.
- `Claude` is more skeptical about contract details and wants sharper wording around migration, generation schema strategy, and a few runtime/token-boundary nuances.
