# Phase 86 Plan Review Notes

## Agent research review

Subagent research agreed on the shape: Phase 86 must be a manifest-driven UAT matrix, not a single happy-path Playwright script. Existing Phase 84 branchy harnesses are useful for mechanics but too narrow to satisfy the requested coverage.

Key reviewer requirements:

- Fixed 4 x 5 x about 20 route matrix.
- Explicit campaign seed/premise, route intent, stressors, start state, and pass/fail gates.
- Per-turn evidence for prompts/model metadata, GM Read, tool checklist, executed/skipped/revised tool steps, backend state diff, narrator packet/visible prose, screenshot, and DB/log pointers.
- Hard gates for unsupported narrated effects, private forecast leakage, impossible inventory/access claims, stale location/presence, tool spam loops, broken V4 layout, and stuck settling.
- Combat must include power mismatch, not only fair fights.
- Screenshots must include streaming/effect states, not only final calm state.

## Fake coverage risks called out by review

- Counting 400 turns while all routes are the same behavior.
- Checking visible text only and missing persisted world lies.
- Accepting tool presence/absence without DB proof.
- Testing only generated settings that are easy for the model.
- Running screenshots after effects disappear.
- Testing combat only against weak or equal enemies.
- Treating a pretty page as playable when NPC/world agency is inert.

## Review outcome

Proceed with Phase 86 after adding a harness that enforces evidence shape and an initial pilot run before the full overnight run.

