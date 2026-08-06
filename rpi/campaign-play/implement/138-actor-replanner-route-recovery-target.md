# Task 138 - Actor Replanner route recovery target

## Outcome

Actor Replanner recovery must not repeat a move target that the compiler already rejected as unreachable from the step location. The one existing recovery attempt may choose another directly reachable destination from the same frame or replace the move with a grounded non-move step.

## Scope

- Keep attempt 1, the proposal schema, compiler, grounding review, provider, model, reasoning modes, shared deadline, persistence, mechanics, UI, and visible copy unchanged.
- Add one route-specific instruction to the existing safe recovery prompt.
- Keep the existing one-retry and no-attempt-3 contract.

## Evidence

- Fresh r78 action 12 produced `route_not_traversable_from_step_location` for move target `0:location:29b40405fcda3c880984` on attempt 1. Attempt 2 received the existing safe feedback but repeated the same rejected target and ended `replan_invalid`.
- A second actor in the same turn used the same recovery path, changed its rejected arrangement, and settled on attempt 2. This localizes the change to the route recovery instruction rather than schema or compiler relaxation.
- GitNexus upstream impact for `buildCampaignPlayActorReplanRecoveryPrompt` was LOW and exact: two direct dependants, no affected processes. The index was one commit stale; both source callers were confirmed.

## Semantic review

Humanizer/deslop verdict: the added instruction is technical, literal, and scoped to the existing safe fields. It adds no narrative voice, filler, visible copy, or change to the world contract.
