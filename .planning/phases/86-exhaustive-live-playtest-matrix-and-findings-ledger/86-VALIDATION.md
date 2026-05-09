# Phase 86 Validation Gates

## Hard failures

A route fails immediately if any of these occur:

- Backend crash, unhandled SSE/API error, or route cannot continue.
- Empty final assistant text.
- Visible prompt/tool/schema/private forecast leak.
- Narration claims a persisted effect that no backend tool/state mutation supports.
- Unsupported player claim becomes durable truth.
- Checkpoint restore does not restore the branch baseline.
- UI is stuck busy after the backend is done.
- `/game` stage is blank, unreadable, or has blocking overlap.
- Combat resolves with impossible power-level logic or loses tracked HP/status.

## Soft failures

Soft failures become ledger findings with severity:

- Prose feels generic, recappy, or AI-sloppy despite being technically true.
- The world waits for the player when it should create pressure/offscreen movement.
- NPCs behave like props instead of actors with goals.
- Location traversal works but reads like disconnected rooms.
- The model overuses or underuses tools for local scene expansion.
- Visual effects exist but are unreadable, mistimed, hidden, or not connected to fiction.
- Formatting is applied but harms readability.

## No fake coverage rules

- Do not count a turn unless player action, visible response, screenshot, and at least one state/log evidence pointer are written.
- Do not count a campaign unless its premise/source setup is recorded.
- Do not count a route if it only repeats another route with different words.
- Do not treat "no tool call happened" as good or bad without checking whether the route expected mutation.
- Do not treat elapsed duration as a fail. Long model work is acceptable; stuck state is a separate evidence-backed failure.

