# Task 16A: deterministic integration and promotion gate

Status: packets 16A.1 and 16A.2 complete; restart and provenance integration in progress.

## Evidence contract

The Campaign Play evidence format now has strict schemas for run configuration, manifests, eligibility, opening and player-action counts, checkpoints, budgets, turn and mutation ledgers, scorecards, and SHA-256 inventory entries.

Opening uses `openingTurn: 0`. Completed gameplay counts use contiguous `playerActionNumber` values beginning at 1. The validator rejects records that mix the two counters.

The eligibility contract freezes the accepted snapshot and content hashes, reachable topology, one key actor, two support actors, one collective, pressure anchors, opening candidates, exposure paths, plans, and schedules before opening begins.

The scorecard derives promotion from measured coverage. Promotion requires the target number of completed player actions, full Rulebook receipt coverage, one runtime event per runtime revision, sanitized turn-event coverage for turn-owned changes, zero hard failures, and zero unresolved findings.

## Bundle validation

`validateCampaignPlayBundle` checks:

- every required file and directory from the canonical plan;
- strict JSON and JSONL record shapes;
- consistent run and campaign ownership;
- contiguous player-action numbers and unique turn and idempotency IDs;
- terminal state for every turn in a complete bundle;
- a continuous runtime revision and hash chain;
- absence of `/game`, `/api/chat/*`, and displaced worldgen-character requests;
- empty browser-console and network-error ledgers for complete runs;
- canonical file ordering, byte counts, and SHA-256 hashes for every bundle file except the inventory itself.

Strict public-evidence schemas reject extra protected payload fields. Later secrecy probes still own semantic leak detection; the validator records their result through the scorecard.

## Verification

- Campaign Play evidence tests: 3 files, 16 tests passed.
- Evidence TypeScript project: passed with no emit.
- `git diff --check`: passed.
- Existing production symbols changed: 0. Packet 16A.1 adds isolated evidence code and task notes only.
- Standalone smoke additions: 0.

Humanizer/deslop review found the contract note direct and evidence-bound. It contains no player-facing copy or model prompt changes.

## Deterministic replay

`runSeededCampaignPlayReplay` creates a fresh accepted Campaign World, bootstraps the human player, completes opening turn zero, and advances a fixed player-action script through the production application, turn worker, Rulebook, scheduler, visibility, and narrator boundaries. Each invocation uses an isolated campaign root and restores process state during cleanup.

The canonical report includes accepted snapshot bytes and hash, eligibility, mechanical/runtime/protected/public projections, all turn terminals, model stages, commands, receipts, world and runtime events, sanitized turn events, route and pressure state, plans, schedules, due sets, jobs, proposals, actor knowledge, observations, SQLite integrity, and foreign-key results.

Direct promotion runs completed each deterministic lane twice:

- 10 completed player actions plus opening turn zero: byte-identical replay, 26 receipts, 168 runtime events, and 166 sanitized turn events.
- 30 completed player actions plus opening turn zero: byte-identical replay, 66 receipts, 468 runtime events, and 466 sanitized turn events.
- 60 completed player actions plus opening turn zero: byte-identical replay hash `7e5bcb90ea8513bbf68e47cc1964b1db049ad754612c44bec0222c02dc3e8af2`, 126 receipts, 918 runtime events, 916 sanitized turn events, SQLite `ok`, and zero foreign-key violations. The final paired run took 148,132 ms.

Vitest keeps the double 10-action case as the focused regression. The 30 and 60-action cases run through `playtest-runner.ts` so a long promotion run does not depend on the Vitest worker heartbeat.

The paired case starts both policies from the same accepted snapshot and opening projection. Intervention advances the visible pressure through a Rulebook command. Peripheral play records a local wait event. Their mechanical and public reports diverge, while every persisted observation comes from an eligible direct-perception exposure and retains an exact protected event binding.

## Defect found by the gate

The second player-action admission initially failed with `turn_public_context_invalid`. `candidateBindings` recreated an observation handle from the observation row ID, while visibility had created the public handle from actor, exposure, and source evidence. The first action had no continuity observation and passed; the next action exposed the mismatch.

The runtime now reads the validated `observationHandle` from the durable public journal entry and binds it to that row's protected world event. The authority set remains limited to public observations already present in the narrator packet. An adjacent regression admits a second action after the first observation is committed.

Verification after the fix:

- Campaign Play evidence and replay tests: 4 files, 18 tests passed.
- Campaign Play backend and mounted routes: 24 files, 322 tests passed.
- Evidence and backend typechecks passed.
- Direct 10, 30, and 60-action runner gates passed.
- `git diff --check` passed.
- Standalone smoke additions: 0.
