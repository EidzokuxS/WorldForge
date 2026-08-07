# Task 156: Narrator provider recovery

## Outcome

One first-attempt `provider_unavailable` Narrator failure now receives exactly one automatic attempt 2 while the existing immutable operation packet and absolute automatic deadline remain current. The retry keeps the same provider, model, storyteller reasoning mode, prompt, schema, receipt identities, and committed mechanics.

## Boundary

- `narration_invalid` retains its existing feedback-aware recovery and default-reasoning fallback for opaque semantic failures.
- `provider_unavailable` reuses the original runtime; it does not change reasoning or transport strategy.
- `stage_timeout` and `stage_budget_exceeded` remain terminal for automatic recovery.
- A failed attempt 2 is terminal. There is no attempt 3, mechanics replay, replacement operation, or packet rewrite.

## Evidence

- r97 action 3 completed mechanics once, then Narrator attempt 1 failed `provider_unavailable` after 1,285 ms with no response metadata. The operation failed at attempt 1 despite retaining most of its 90-second automatic deadline.
- Focused application-through-runtime tests cover raw transport and classified provider failures recovering to one accepted scene, and a second provider failure stopping after exactly two attempts with unchanged mechanics.
- The existing reasoning-mode integration fixture now returns the tool call required by the already-shipped player Narrator tool transport; this is test-harness alignment, not a product behavior change.
- Prompt, model instruction, visible copy, prose, provider selection, and UI are unchanged; humanizer/deslop review is therefore not applicable to product text.
