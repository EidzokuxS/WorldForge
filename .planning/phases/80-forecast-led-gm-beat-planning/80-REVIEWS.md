# Phase 80 Cross-Agent Review

## Review Sources

- Poincare (`gsd-plan-checker`): plan structure and GSD readiness.
- Linnaeus (`explorer`): code insertion points, hidden couplings, test gaps.
- Bernoulli (`default`): game/AI architecture and GM/backend authority split.
- Socrates (`gsd-verifier`): acceptance and negative-test readiness.

## Blocking Findings Incorporated

1. **Forecast builder was missing.** Phase 80 must add an explicit LLM-authored `runWorldForecastBuilder`-style step. Backend assembles durable facts; GM/LLM writes bounded advisory forecast pressure; backend validates, stages, scopes, and persists only after success.
2. **BeatPlan was too advisory to govern execution.** ScenePlan must implement the BeatPlan, not invent an unrelated current beat. Validation must reject coarse posture/tool-category mismatches before mutation.
3. **Forecast input to GM decision was optional.** Scoped forecast excerpt must be passed to GM TurnDecision and BeatPlan every turn, even when empty.
4. **Hard gate was incomplete.** Invalid/missing/throwing BeatPlan must prevent ScenePlanner, tool execution, final narration prompt assembly, narration model call, chat append, and forecast commit.
5. **Rollback boundary was vague.** Forecast revisions remain staged until the route is past the final narration success point, or storage must be snapshot-covered. No sidecar/vector forecast persistence is allowed in Phase 80.
6. **Secondary prompt paths were under-tested.** ScenePlanner repair and visible-output narration retry/correction prompts must not receive private forecast, private BeatPlan rationale, hidden names, or backend diagnostics.
7. **Direct/continue/clarification paths can bypass ScenePlanner.** They still require scoped forecast and non-mutating BeatPlan, unless a clarification exception is explicitly documented and tested.
8. **`/retry` must be covered.** Retry turns must share the same rollback and no-leak guarantees for forecast and BeatPlan artifacts.
9. **No candidate pollution.** Forecast/BeatPlan refs must not become actor/location/item candidates and must not expand `ToolExecutionContext`.
10. **Actual test owners corrected.** `narrator-packet.test.ts` does not exist; use `scene-turn-packet.test.ts` unless intentionally creating a new test file.

## Execution Amendments

- Add `world-forecast.ts` forecast builder contract in 80-02, not merely storage helpers.
- Keep forecast refresh lazy: missing, expired, invalidated, or major durable committed change.
- Scope forecast before any prompt formatting, including GM TurnDecision.
- Add private/public BeatPlan formatters before ScenePlanner integration.
- Update `SCENE_PLAN_TURN_ORDER` alongside runtime turn-order changes.
- Treat `executeScenePlan` as the committed-effect boundary for forecast invalidation.
- Keep final narrator input to settled player-facing beat guidance only.
- Run GitNexus impact checks before touching each listed production symbol and `gitnexus_detect_changes({ scope: "all" })` after critical plan slices, not only final closeout.
