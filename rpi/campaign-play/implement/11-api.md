# Task 11 — Campaign Play API and recovery

Date: 2026-07-12

Status: complete

## Delivered boundary

Campaign Play now owns a campaign-scoped HTTP surface under `/api/campaigns/:id/play/*`. The route reads the addressed campaign configuration without activating the legacy campaign controller, then delegates state, character setup, opening admission, player turns, resume, journal reads, and SSE replay to the Campaign Play application service.

Admission and resume persist their authority before returning `202`. SSE reads stored public events by numeric sequence, accepts `Last-Event-ID` and `afterSequence`, and closes when the turn reaches interruption or a terminal state. Error responses pass through the strict public schema and carry durable eligibility requirement codes for `world_not_playable`.

## Durable application behavior

- State initialization is SQLite-owned and idempotent.
- Same-key replay looks up the durable turn before resolving current model settings. It compares the canonical public request and returns the stored turn identity.
- A different request under the same key returns `idempotency_conflict`.
- Runtime reconstruction uses the model selection frozen on the turn.
- Startup recovery advances deterministic work, preserves a live foreign lease, and registers a wake-up at its stored expiry.
- An expired external lease becomes a durable interruption. A player resume creates a fresh worker epoch.
- A queued actor replan remains outside startup model execution and runs only during normal turn work.
- Unknown model pricing keeps estimated cost nullable and marks cost coverage incomplete.

## Public read behavior

The read model assembles state, exact-turn results, journals, and SSE events from Campaign Play projections and ledgers. Exact missing turns return `turn_not_found`; inconsistent durable rows remain service failures. Reopening the database preserves the serialized public state and completed turn data.

## Acceptance proof

The focused Campaign Play suite passes 24 files and 322 tests. It covers strict request and response schemas, opening handles, idempotency, leases, interruption and resume, actor replanning, visibility, terminal narration, reopen behavior, cursor resume, and future SSE cursors.

The mounted-route playtest creates a migrated, accepted campaign and drives character bootstrap, opening, one player action, SSE replay, journal reads, SQLite ledger checks, and process-style reopen. It found a missing `createdAt` field in the stored public narration projection; the projection now includes the durable narration timestamp, and the same playtest passes end to end.

The full backend suite passes 274 files and 3,886 tests with four workers. The production build passes for shared, frontend, and backend packages. GitNexus change detection reports LOW risk with no affected indexed execution process. One unconstrained full-suite run exceeded the five-second limit in an existing SQLite race test; the isolated race test and the bounded-worker full suite both pass.

## Review notes

Public error copy describes the failed contract and the next stable state without exposing provider output, protected world truth, filesystem paths, or stack details. The current delivery path has no GLM review step and adds no standalone smoke suite.
