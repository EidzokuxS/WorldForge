# Phase 88 Live Focused Harness Correction - 2026-05-08

## Run

- Artifact: `output/playwright/phase-88-living-world/live-focused-20260508-final-proof`
- Mode/profile: `live` / `focused`
- Fresh campaigns: yes
- Result before harness correction: failed, 6 routes, 11 turns, 2 hard failures

## Diagnosis

The failed run did not expose a backend/GM regression in the two red rows:

1. `key-npc-offscreen` turn 2 reported `world_did_not_change_for_mutating_route`.
   - Turn 1 created visible offscreen pressure and changed world state.
   - Turn 2 was a public follow-up/observation of that consequence.
   - Requiring a new persistent world write on every follow-up observation would push the GM toward noisy state churn instead of proving a living world.

2. `false-claim-boundary` turn 2 reported `action_submission_lost`.
   - UI was idle, spinner was false, assistant text was absent, and chat history never received the player action.
   - Screenshot showed an empty input after the harness attempted textarea Enter submission.
   - This was a harness submission failure, not model latency and not backend semantics.

## Correction

- `key-npc-offscreen` now checks mutation at the route/first-reaction boundary and allows the second turn to be observational.
- Live action submission now uses the actual `Send action` button after filling `Scene action`, falling back to Enter only if that control is unavailable.
- Deterministic focused proof after the correction:
  - Artifact: `output/playwright/phase-88-living-world/deterministic-focused-20260508-harness-fix`
  - Result: passed, 6 routes, 11 turns, 0 hard failures

## Scope Note

No gameplay backend or frontend runtime behavior was changed here. This correction only makes the Phase 88 playtest harness match the product gate: long-distance gameplay and living-world behavior, not forced mutation spam or fragile keyboard-only submission.
