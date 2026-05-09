---
phase: 70
reviewers: [gemini, claude]
attempted_failed: [opencode, cursor]
skipped: [codex_self, qwen_missing, coderabbit_missing]
reviewed_at: 2026-04-25T16:41:16.0487212+03:00
plans_reviewed: [70-01-PLAN.md, 70-02-PLAN.md, 70-03-PLAN.md, 70-04-PLAN.md, 70-05-PLAN.md, 70-06-PLAN.md, 70-07-PLAN.md, 70-08-PLAN.md]
---

# Cross-AI Plan Review - Phase 70

## Review Run Notes

- Requested flags: --phase 70 --all.
- Successful external reviewers: Gemini CLI, Claude CLI.
- Skipped self reviewer: Codex CLI, because the workflow requires skipping the current agent's own CLI for independence.
- OpenCode was available but failed before review because C:\Users\robra\.config\opencode\config.json has invalid mcp.gitnexus config.
- Cursor was available as an IDE CLI, but this install did not expose the cursor agent -p --mode ask --trust headless review command; it returned generic pipe usage instead of an agent review.
- Qwen and CodeRabbit CLIs were not available on PATH.

## Gemini Review

# Phase 70 Plan Review: Reactive Scene Resolution and Canonical Event Flow

## 1. Summary
The Phase 70 implementation plan is an exceptionally well-structured and conservative migration designed to solve temporal fragmentation in the WorldForge runtime. By introducing a **Scene Planner of Record**, the plan successfully collapses multiple uncoordinated LLM decision points (World Brain, Hidden Adjudication, and independent NPC mini-rounds) into a single structured `ScenePlan`. The architecture adheres strictly to the "declare, determine, describe" pattern, ensuring that the engine maintains authority over world state and legality while the LLM focuses on semantic interpretation and narrative pacing. The inclusion of a post-generation Storyteller output guard specifically targeting forbidden identities and fact markers (T70-09) is a significant security and integrity strength.

## 2. Strengths
- **Contract-First Wave 0:** Starting with `70-01` to lock names, schemas, and test surfaces ensures that downstream tasks have clear targets and prevents "schema drift" during the implementation of separate modules.
- **Deterministic Roster Classification:** The `SceneFrame` (Plan `70-02`) correctly uses `resolveScenePresence` to categorize actors into `active`, `support`, and `background`. This prevents the "crowded room" problem where every actor in a broad location tries to influence a local scene.
- **Validation-Execution Split:** Separating `validateScenePlan` (Plan `70-04`) from `executeScenePlan` ensures that model-output hallucinations are caught before a single database mutation occurs, maintaining atomicity via the route-level snapshot.
- **Narrator Packet Isolation:** The `NarratorPacket` (Plan `70-05`) creates a hard boundary for the Storyteller, providing only player-perceivable facts. The "backend-only" guard metadata is a clever solution to allow exact-match scanning without leaking hidden data into the prompt.
- **Ordered Processor Migration:** Plan `70-06` carefully reorders `processTurn` so that movement detection is deterministic and `SceneFrame` building precedes all LLM adjudication, closing a potential hallucination gap in current movement logic.

## 3. Concerns
- **Latency from Sequential Guard Retries:**
  - **Severity: LOW**
  - **Risk:** Between the Scene Planner repair pass and the Storyteller output guard retry, a "noisy" or "leaky" model response could lead to a significant increase in total turn latency (potentially 5-6 total LLM calls in a worst-case scenario).
  - **Mitigation:** The plan already includes repair limits and failure thresholds.
- **Opening Scene Parity:**
  - **Severity: LOW**
  - **Risk:** Keeping `processOpeningScene` on the Phase 68 path (as stated in `70-06`) preserves compatibility but creates a slight divergence in how "Scene Direction" is handled vs normal turns.
  - **Mitigation:** Plan `70-08` includes a specific "MIGRATION-PLAN" spec to document these boundaries and deferred work.

## 4. Suggestions
- **Target Actor Mapping (Plan 70-03/04):** In the Scene Planner prompt, explicitly instruct the model to use the UUIDs provided in the `SceneFrame` roster rather than actor names for the `plannedActions` inputs. This reduces ambiguity for characters with similar names and makes the `validateScenePlan` check more robust.
- **Tool Result Projection (Plan 70-04):** Ensure that `executeScenePlan` captures and returns the *full* `ToolResult` for every action, specifically to preserve metadata needed for the `CanonicalTurnPacket` (Step 6 of the Turn Model).
- **Snapshot Isolation Proof (Plan 70-07):** In Task 2, explicitly test that a failure in the `executeScenePlan` stage (e.g., a rejected tool call) triggers a `restoreSnapshot` to a state that *does not* include the user's latest message in history, ensuring the retry can be called cleanly.

## 5. Risk Assessment
**Overall Risk: LOW**

The plan is inherently low-risk because it:
1. **Preserves the Rollback Boundary:** Ownership of state safety remains at the route level using tested snapshot/restore patterns.
2. **Is Additive/Migratory:** It replaces existing calls on the critical path rather than adding new ones, which may actually improve average-case latency by removing N NPC agent calls.
3. **Uses Pure Validation:** Most of the new logic (Frame building, Schema parsing, Validation) is side-effect-free, making it easy to test without complex database mock management.
4. **Follows Research:** The plan implements every specific safeguard identified during the research phase, particularly the output guard for forbidden names.

The dependency chain is logical, and the "Wave 0" strategy provides an excellent early warning system for integration friction.


---

## Claude Review

# Phase 70 Plan Review — Reactive Scene Resolution and Canonical Event Flow

## Summary

Plan set well-decomposed and faithful to CONTEXT/consensus. Wave 0 contract-first approach prevents naming drift. Reuse of `runtimeToolInputSchemas`, `executeToolCall`, `safeGenerateObject` repair pattern, `resolveScenePresence`, route-level snapshot restore is correct. Engine-vs-LLM boundary preserved at every stage. Four substantive risks need pre-execution attention: SSE streaming vs. output guard, narratorFacts as LLM-prose-injection vector, detectMovement refactor scope, hint-band identity protection inconsistency.

**Overall risk: MEDIUM.**

## Top Strengths
- 70-01 locks exact identifiers/caps before any wiring — single most valuable thing in plan set.
- Reuse of `runtimeToolInputSchemas` via `z.discriminatedUnion("toolName", ...)`.
- Throw-on-failure semantics align with `feedback_no_fallbacks_v2.md`.
- 70-05 backend-only `forbiddenActorNames`/`forbiddenFactMarkers` never written into prompt — strong design.
- 70-06 explicit ordering test names (`buildSceneFrame.*before.*callOracle`) catch refactor drift.
- Opening scene path preserved on Phase 68 path.

## Top Concerns

| # | Severity | Concern | Plan |
|---|----------|---------|------|
| 1 | HIGH | SSE streaming vs. output guard interaction unspecified — if streaming, forbidden content reaches client before validation rejects | 70-05/70-06 |
| 2 | HIGH | `narratorFacts.perceivableEvents` is LLM-authored prose flowing into NarratorPacket; exact-substring guard misses paraphrases. Prefer event-ID references | 70-03/70-04 |
| 3 | MEDIUM | `detectMovement` refactor scope underspecified — `target-context.ts` LLM movement classifier path must move post-SceneFrame | 70-06 |
| 4 | MEDIUM | Hint-band actor names NOT in `forbiddenActorNames`, contradicting scene-presence contract | 70-05 |
| 5 | MEDIUM | Wave 0 contract tests are tautological — must enforce red-first behavior tests in 70-04/70-05/70-06 | 70-01 |
| 6 | MEDIUM | `oracleContext` field semantics ambiguous — pre-Oracle vs. Oracle-result | 70-02 |
| 7 | MEDIUM | `deferredHooks` schema field with no consumer — observability noise | 70-03 |
| 8 | MEDIUM | Partial-mutation rollback test missing for executor-throws-on-action-N case | 70-04 |
| 9 | LOW | No env-flag rollback path post-cutover | 70-06/70-07 |
| 10 | LOW | `tickPresentNpcs` becomes orphaned export — retain rationale or remove target unspecified | 70-07 |

## Top 5 Recommended Edits

1. **70-03/70-05:** Decide narratorFacts shape — event-ID references preferred. If prose remains, extend output guard scan to narratorFacts pre-prompt.
2. **70-05 task 3:** Lock visible-narration call as non-streaming. Regression test asserting no `narrative` SSE event before guard passes.
3. **70-06 task 1:** Add `backend/src/engine/target-context.ts` to files_modified; specify movement-intent transition from `detectMovement` LLM call to ScenePlan-owned interpretation.
4. **70-05 task 1:** Decide hint-band rule — include in forbiddenActorNames OR explicit deferral rationale.
5. **70-06/70-07:** Add `SCENE_PLAN_ENABLED` env flag (default true) for legacy-path rollback during initial rollout.

## Risk Assessment

**MEDIUM.** Architecture sound, plans achieve stated phase goal, rollback/retry/visibility/canonical-state preserved, ordering testable. Pre-execution, resolve the 2 HIGH and 4 MEDIUM concerns above. No blockers, but unresolved HIGH items would let hidden actor identities leak through narratorFacts prose or stream to client before guard rejection.

Full review written to `C:\Users\robra\.claude\plans\cross-ai-plan-review-playful-crab.md`.


---

## OpenCode Review Attempt

OpenCode review failed or returned empty output. ExitCode=1
Error: Configuration is invalid at C:\Users\robra\.config\opencode\config.json
↳ Invalid input mcp.gitnexus



---

## Cursor Review Attempt

Run with 'cursor -' to read output from another program (e.g. 'echo Hello World | cursor -').


---

## Consensus Summary

Two independent reviewers agreed that the Phase 70 plan is structurally sound and faithful to the intended architecture: a single local Scene Planner of Record, deterministic backend validation/execution, player-visible NarratorPacket, and guarded final prose.

### Agreed Strengths

- Contract-first Wave 0 is the right starting point because it locks names, schemas, caps, and test surfaces before live runtime wiring.
- Reusing existing backend seams (`runtimeToolInputSchemas`, `executeToolCall`, `safeGenerateObject`, `resolveScenePresence`, route snapshot restore) keeps the migration conservative and maintainable.
- The SceneFrame / ScenePlan / validation / execution / NarratorPacket split preserves the engine-vs-LLM boundary.
- Backend-only forbidden guard metadata is a strong design choice because it enables post-generation scanning without leaking hidden terms into the Storyteller prompt.
- Explicit ordering tests around `buildSceneFrame -> callOracle -> runScenePlanner -> validate -> execute -> packet -> narrate` are valuable and should remain non-negotiable.

### Agreed Concerns

- Rollback/failure proof should be very explicit. Gemini called for snapshot isolation proof around rejected execution; Claude called for partial-mutation rollback tests when action N fails.
- Visibility leakage deserves extra attention at implementation time. Gemini viewed the output guard as a strength; Claude flagged that streaming, LLM-authored `narratorFacts`, and hint-band names can still undermine the guard if underspecified.
- The movement/target transition needs precise execution. Gemini praised deterministic movement ordering; Claude warned that the `target-context.ts` LLM movement classifier path must not remain pre-frame by accident.

### High-Priority Follow-Up Before Execution

1. Update the plans through `$gsd-plan-phase 70 --reviews` so 70-05/70-06 explicitly require non-streaming guarded final narration or otherwise prove no `narrative` SSE reaches the client before the output guard passes.
2. Tighten the `narratorFacts` contract so LLM-authored prose cannot become an unguarded hidden-fact channel. Prefer event IDs / backend canonical packet references over free prose where possible.
3. Add or strengthen partial rollback tests for `executeScenePlan` failure after earlier validated actions, proving route snapshot restore removes all partial mutations and no unsafe assistant message is persisted.
4. Make the hint-band identity rule explicit: either hint actor names are included in `forbiddenActorNames`, or the plan must document why hint identities are safe to reveal.
5. Name `backend/src/engine/target-context.ts` and the movement classifier path in 70-06 if that path must change to preserve SceneFrame before LLM interpretation.

### Divergent Views

- Gemini assessed overall plan risk as LOW because the plan is conservative, validates before mutation, and removes more LLM calls than it adds.
- Claude assessed overall risk as MEDIUM because output streaming, `narratorFacts`, hint identity handling, and movement-classifier migration could still leak hidden information or preserve old ordering if execution is too literal.
- This divergence is useful: the architecture is likely correct, but the execution plans should be sharpened around streaming, `narratorFacts`, hint identities, and partial rollback before implementation begins.

## Recommended Next Step

Run:

```powershell
$gsd-plan-phase 70 --reviews
```

The review feedback is strong enough to justify one more targeted plan revision before $gsd-execute-phase 70.
