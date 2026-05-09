# Phase 82 Summary: GM Dynamic Scene Expansion and Agentic Tool Harness

Date: 2026-05-05
Status: Verified complete

## Outcome

Phase 82 makes dynamic local staging an intentional GM tool rather than an accidental byproduct of broad locations:

- `reveal_location` creates anchored `ephemeral_scene` rows under the current broad/current scene, with discovered edges, expiry metadata, and structured tool observations.
- `spawn_npc` now places temporary/support NPCs into the correct parent broad location plus exact current scene scope, so `/world`, SceneFrame, prompts, and frontend presence agree.
- `promote_npc` lets useful temporary NPCs become persistent/key instead of being retired by cleanup.
- Transient cleanup archives expired ephemeral scenes and retires unpromoted temporary NPCs while protecting the player's scene and durable actors.
- Dynamic tool calls have semantic repeat-call budgets, compact observations, and frontend progress copy.
- Final narration no longer receives contradictory actor presence or UUID-only tool-result filler when a concrete successful tool fact exists.

## Live Evidence

Fresh live campaign: `0ed6bb3c-a528-4067-8f29-86ebdd8d0637` (`Phase 82 Live Gate - Lacquer Signal`)

Playwright drove 15 `/game` UI turns with no gameplay duration caps. Evidence is under:

`output/playwright/phase-82-live-gate/`

Important live findings fixed during the gate:

- Turn 10 spawned `Gondolier` successfully into `Lantern-Lit Gondola Pier`, but model-facing SceneFrame initially still saw only the player.
- `/world` and frontend presence were fixed to derive parent broad scope for persistent sublocations.
- SceneFrame and final prompt were fixed so NarratorPacket visible actors and `[PRESENT ACTORS]` agree.
- NarratorPacket was fixed to preserve concrete successful `log_event` text, so visible narration can say the actual world fact instead of `Committed log_event result <uuid>`.

Final live proof:

- Turn 13/14: the Gondolier remained visible and answered with concrete route-marker guidance: three black bands, low lantern, hold at the fork.
- Turn 15: a tariff booth/alcove probe did not spawn a new location when the fiction did not support it. This is intentional no-spam behavior; deterministic tests cover `reveal_location` creation/expiry.

## Verification

- Backend focused suite: 8 files / 120 tests passed.
- Backend typecheck: passed.
- Frontend game page suite: 49 tests passed.
- Frontend typecheck: passed.
- Live Playwright gate: turns completed, no stuck settling after final-refresh fix.

## Residual Notes

- Live provider world-forecast structured output still frequently fails schema validation and falls back without blocking turns. This is residual quality/contract debt, not a Phase 82 blocker.
- The live campaign proved support NPC placement and no-spam dynamic scene behavior. `reveal_location` is covered by deterministic tests; broader natural-use tuning can continue through future gameplay UAT.
