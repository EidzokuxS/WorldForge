# Task 5 evidence: build service and Campaign World API

## Background build ownership

- Build acquisition, frozen source persistence, and coordinator registration occur under the campaign source mutex.
- The model worker starts after the mutex releases and holds one dedicated campaign database handle through its terminal transaction.
- Model stages read `campaign_world_builds.source_snapshot_json` through the repository. The service performs no config read after acquisition.
- Validation and persistence are explicit code stages in the durable event ledger.
- Provider and validation failures commit one terminal failure with no domain rows.
- A running build without a live process coordinator becomes `process_interrupted` on the first Campaign World access. Repeated recovery keeps the existing terminal event.

## Race and isolation proof

- The coordinator is registered before `startBuild` returns, so an immediate state access recognizes the live build.
- Campaign A completes after the process-global connection switches to campaign B; both databases retain isolated rows.
- When build acquisition wins the source mutex, DNA save returns `world_build_running` and source content stays unchanged.
- When DNA mutation wins, a build carrying the earlier digest returns `source_changed` and leaves no build row.
- Failed and interrupted builds release the partial-index lock and permit a new explicit build.

## Campaign World API

- Mounted routes provide source load, strict DNA save, asynchronous build creation, resumable build events, state, and acceptance under `/api/campaigns/:id/world/*`.
- Every request first uses the normal campaign load path, which applies migration `0024`, before a dedicated Campaign World handle opens.
- Build creation resolves the configured generator, creates the registered structured-output model, and returns `202` after durable acquisition.
- State returns the shared state union plus `currentBuildId`, `currentStage`, and `lastEventSequence` from persisted rows.
- SSE writes persisted sequence as `id`, supports `Last-Event-ID` and `afterSequence`, and streams until the committed terminal state.
- Cursor parsing uses literal character checks. The route and service add no regex parser.
- Stable error codes map to reviewed player-safe messages without provider output, reasoning, prompts, stack traces, or raw database errors.

## Route and restart evidence

- A live subscriber consumes sequences 1 through 12 while the build is active.
- A simulated disconnected client applies the first five events, resumes after sequence 5, deduplicates by sequence, and reaches the same 12-event ledger.
- A fresh route/service instance reconnects through the normal campaign path, reloads review state, and replays from sequence zero.
- SSE completion is followed by a fresh state read from SQLite.
- Two simultaneous starts produce one `202` and one `409 world_build_running`.
- Stale acceptance returns `409 world_version_conflict`; matching version and hash produce the acceptance receipt and survive reload.
- Provider failure produces a durable `build_failed`, failed state, and zero location and actor rows.

## Copy review

- Humanizer and deslop criteria found direct, state-accurate messages with plain next actions and no promotional language, artificial suspense, vague authority, formulaic contrast, or decorative punctuation.
- Droid GLM-5.2 exited 0 and returned `Plan is up-to-date.`
- Prompt: `.codex/droid-prompts/campaign-world-route-copy-review.md`.
- Output: `.codex/agent-logs/droid-campaign-world-route-copy-20260710-015022.out.log`.
- Stderr contains only the known MCP reload warning.

## Verification

- Campaign World service tests: 1 file, 6 tests passed.
- Campaign World route tests: 1 file, 4 tests passed.
- Combined Campaign World and route suite: 10 files, 111 tests passed.
- Backend typecheck: passed.
- `git diff --check`: passed.
- No standalone smoke suite was added.
