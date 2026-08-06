# Task 139 — Game Master stage deadline

## Outcome

Player-action Judge calls retain the 30,000 ms per-attempt deadline. Game Master calls now receive a role-local 45,000 ms per-attempt deadline, including certified routes that skip Judge and full-authority routes after an accepted Judge result. The existing single automatic retry still bounds Game Master provider time at 90,000 ms.

## Evidence and decision

The frozen r79 first action admitted once and stopped before mechanics because both certified Game Master attempts reached the local 30,000 ms abort boundary without response metadata. This was a functioning deadline cutoff, not evidence of a provider outage or semantic rejection. The prior r78 lane accepted a Game Master recovery at 28.3 seconds, already close to that boundary, and retained historical evidence includes an accepted 39.6-second Game Master call. Judge latency evidence did not require a change.

The smallest compatible correction is an optional deadline on the existing external-stage handler. The turn service preserves its configured default; the player-action runtime selects 30 seconds for Judge and 45 seconds for Game Master. Opening, Actor Replanner, Narrator, provider/model selection, prompts, schemas, semantic compilers, settlement, retry count, leases, stale-result fencing, mechanics, UI, and visible copy are unchanged.

## Verification

- The focused turn-service test proves a stage-local deadline overrides the service default, aborts the provider signal, persists `stage_timeout`, and fences a late completion.
- The focused runtime test proves certified Game Master uses 45 seconds, full-authority Judge uses 30 seconds, and the following Game Master uses 45 seconds.
- The complete turn-runtime file executed all 66 tests successfully; Vitest then reported an unrelated worker RPC `onTaskUpdate` timeout, so the directly affected test was rerun alone and passed cleanly.
- Backend typecheck passed.

## Acceptance contract

From a fresh Campaign Play action, a certified route may spend up to 45 seconds in each of at most two Game Master attempts. A full-authority route keeps the existing 30-second Judge boundary, then uses the same 45-second Game Master boundary. A timeout remains an explicit interruption with no late acceptance, mechanics duplication, third attempt, or hidden fallback. The rendered endurance lane must still finish each player action with usable control inside the 120-second experience contract.
