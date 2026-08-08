# Task 167: Narrator stage-local deadline

## Contract

Every newly created automatic Campaign Play player-action Narrator operation
persists `automaticDeadlineAt` and `activeDeadlineAt` as the completed visible
mechanics boundary plus the existing 90,000 ms automatic Narrator window. The
submission-time cap is no longer applied. Existing persisted operations and
schema rows are unchanged; no migration or backfill is introduced. Automatic
attempts one and two share the immutable persisted deadline, and automatic
recovery does not refresh it. Timeout, late-result, CAS, identity, lease,
receipt, mechanics, and Manual Restore behavior remain unchanged; Manual
Restore still receives its own prepared-time 90,000 ms window.

Semantic-review verdict: "This changes only the persisted deadline origin for
new automatic Narrator operations. It changes no prompt, model instruction,
provider, transport, player-visible copy, mechanics, or narrative semantics;
the existing timeout, recovery, identity, and persistence fences remain
authoritative."

## Scope and graph review

The exact production seam is the automatic deadline calculation in
`backend/src/campaign-play/narration-operation-repository.ts`. The indexed
submission cap was removed because it is unused after the stage-local formula
was restored. Existing recovery and acceptance code continues to read the
persisted automatic/active deadline, and Manual Restore keeps its separate
window.

Current-source GitNexus upstream impact for
`File:backend/src/campaign-play/narration-operation-repository.ts` was LOW
(`impactedCount=8`, exact), with direct Campaign Play callers in
`campaign-play-application.ts` and `turn-runtime.ts`; depth-two and depth-three
routes remain Campaign Play and its seeded playtest runner. No broader or
CRITICAL symbol impact was found. The nested repository closure is not indexed
as a standalone executable symbol; the file-level result and source review are
the required bounded evidence. No other production symbol was edited.

## Implementation

`commitVisibleResult` now computes
`automaticDeadlineAt = completedAt + CAMPAIGN_PLAY_AUTOMATIC_NARRATION_WINDOW_MS`
and persists that same value as `activeDeadlineAt`. The old
`CAMPAIGN_PLAY_SUBMISSION_NARRATION_WINDOW_MS` constant and submission-time
`Math.min` cap were removed. A focused runtime regression admits an action at
an earlier submitted time while mechanics complete later, proving the full
90,000 ms stage-local window rather than the old clipped deadline. The test
also preserves automatic attempt-two timeout, late ignored-abort fencing,
Manual Restore's fresh window, immutable operation identity, one settlement,
integrity, and foreign-key checks.

## Automated evidence

- `npm test -- --run src/campaign-play/turn-runtime.test.ts -t
  "enforces one persisted automatic deadline|stops automatic recovery when
  attempt 2 times out|keeps a normal application narration success to one
  attempt|automatically retries one (transport error|provider error|receipt-
  keyed)|stops after one automatic provider-unavailable narration recovery|
  does not automatically retry a '(timeout|budget)' narration failure|does not
  append an automatic attempt after an explicitly triggered Restore failure|
  reopens an expired narration attempt" --pool=forks --maxWorkers=1
  --no-file-parallelism --reporter=dot`: 11/11 passed.
- `npm test -- --run src/campaign-play/campaign-play-application.test.ts
  --pool=forks --maxWorkers=1 --no-file-parallelism --reporter=dot`: 13/13
  passed.
- `npm test -- --run src/campaign-play/campaign-play-database.test.ts
  --pool=forks --maxWorkers=1 --no-file-parallelism --reporter=dot`: 18/18
  passed.
- Full Campaign Play turn-runtime suite: 70/70 tests passed; Vitest emitted a
  worker `onTaskUpdate` timeout after the completed file, so that runner exit
  was non-zero despite no test failure. The focused rerun passed without this
  runner error.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `git diff --cached --check`: passed (only existing line-ending warnings).
- GitNexus `node .gitnexus/run.cjs detect_changes --repo WorldForge
  --scope staged`: `No changes detected`; source review remains limited to the
  three staged Task 167 paths.

## Rendered lane

Fresh r116 evidence is recorded here after the bounded code commit and exact
Campaign Play journey. The lane must use the canonical lowwater-ledger
template and Brina card, one import/save/Begin setup, one rendered choice at a
time, authoritative readback before every next action, and stop at the first
genuine defect. This note must not claim 60/60 or reload unless the retained
run and SQLite evidence prove them.

## Acceptance handoff

Entry state: current source at the Task 167 commit, with frozen r115
preserved. Criterion mapping and the r116 terminal boundary, deadline/mode
trace, scene/binding counts, SQLite integrity/FK, reload result, and exact
task-owned cleanup are appended after the fresh rendered lane.
