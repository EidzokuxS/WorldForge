# Task 16A: deterministic integration and promotion gate

Status: complete.

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

## Restart and provenance integration

The clean-start provenance lane begins from an accepted parent with zero Campaign Play rows. `cloneCampaignCleanStart` creates a child with rewritten campaign ownership, the same accepted content hash, recorded parent snapshot lineage, and zero child play rows before bootstrap.

The child then creates its own human actor, completes opening turn zero, completes one player action, reloads through a fresh application instance, and completes the next action. The public projection is byte-identical across restart. The child finishes with three completed turns, its own world/runtime versions, observations, receipts, and event ledgers.

After child play mutations:

- the child accepted Review bytes and content hash match its pre-play values;
- the parent accepted Review bytes and content hash remain unchanged;
- the parent `state.db` and `config.json` SHA-256 hashes remain unchanged;
- every parent Campaign Play table remains empty;
- child SQLite integrity is `ok` with zero foreign-key violations.

The promotion proof matrix is covered by the passing 322-test Campaign Play suite:

| Risk | Direct proof owner |
|---|---|
| transaction rollback and partial commit | `rulebook.test.ts`, `campaign-play-state-repository.test.ts`, `turn-runtime.test.ts` |
| concurrent idempotency and one active turn | `campaign-play-turn-repository.test.ts`, `campaign-play-application.test.ts` |
| restart after durable stages and fenced late results | `opening-runtime.test.ts`, `turn-runtime.test.ts`, `turn-service.test.ts` |
| narration interruption and explicit resume | `opening-runtime.test.ts`, `turn-runtime.test.ts` |
| scheduler order, fairness, debt, and stale work | `actor-scheduler.test.ts`, `actor-proposal-service.test.ts` |
| route direction, impossible actions, hidden references, and stale versions | `rulebook.test.ts`, `judge.test.ts`, `game-master.test.ts` |
| visibility channels and protected truth | `visibility-service.test.ts`, `campaign-play-projection.test.ts` |

The new provenance replay is an integration test, not a smoke suite. It covers clone, restart, second action, and immutable accepted provenance in one campaign-owned path.

Manual play remains the promotion owner for prose and experience quality. Tasks 16B and 17 require the main agent to read the rendered scene and choose adaptive actions from visible information. Automation may capture and enter those choices; deterministic scripts do not count as prose or living-world evidence.

## Runner and evidence bundle

`playtest-runner.ts` accepts a strict run-config file for deterministic 10-, 30-, and 60-action lanes. Each lane runs twice, compares canonical bytes and replay hash, checks terminal and SQLite invariants, writes a bundle, and validates that bundle before reporting success. Existing bundle paths fail closed instead of being overwritten.

The bundle contains the run manifest and config, eligibility snapshot, turns and inputs, model stages, runtime events, Rulebook receipts, actor jobs, visibility records, checkpoint, protected probes, transcript, scorecard, browser/network logs, screenshots directory, and a SHA-256 inventory. A one-action writer regression proves a valid promotion result and then proves that a post-write transcript change invalidates the bundle.

The checked 10-action runner bundle completed two identical replays with one application restart. It recorded 26 receipts, 168 runtime events, 166 turn events, SQLite `ok`, zero foreign-key violations, and full promotion coverage. Direct 30- and 60-action double replays remain the long deterministic evidence; the 60-action hash is `7e5bcb90ea8513bbf68e47cc1964b1db049ad754612c44bec0222c02dc3e8af2`.

`capture-campaign-play-state.mjs` is deliberately read-only with respect to play. It attaches to an already open exact URL over CDP, captures visible text and a screenshot, reads browser console errors and resource timing entries, and refreshes the bundle inventory. It has no action-selection or submission path.

Final verification passed: evidence and replay tests `20/20`, focused Campaign Play/clone/routes `331/331`, frontend `491/491`, the complete backend suite, both typechecks, production build, capture-script syntax, bundle validation, and `git diff --check`. GitNexus initially returned its Ladybug WAL `UNREACHABLE_CODE`; after the post-commit index refresh, final impact is LOW with two direct test callers, one runner-local caller, and zero affected execution flows or production modules.
