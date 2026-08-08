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

The bounded code commit was `165848ef274830f6eb1622f6846629a950efae68`
(`fix(campaign-play): restore narrator stage-local deadline`), pushed to
`origin/feat/revamp` before the lane. The fresh lane was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r116` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, using the lowwater-ledger-pristine
template. The materialized state/config hashes were
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` and
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`;
the imported canonical Brina card was
`brina-porter-v2.json` with SHA-256
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
Setup performed one card import, one Save (`PUT` 200), one
lower-wards/Local/Already here/Looking for work selection, and one Begin
admission (`POST /play/opening` 202). Opening completed with a proper scene;
no setup retry or direct state write occurred.

Action 1 was submitted once before a harness-only evidence exception and was
reconciled read-only in `actions/action-001-evidence.json`. It completed
`turn-player-action:6e32470d41ec42fb7b6f91e9780ebf0ee75741a5`, created
`narration-operation:504ff999e97595e5d22d1011920bf94cc829a6a2`, accepted one
Narrator attempt, produced proper scene
`narration:23a1d3faa4052e937a176ed552ed5fb6b80cb6a3`, and retained three
receipts. The persisted deadline proof is exact: submitted `1786207659126`
before mechanics completion `1786207690865`; operation creation equals that
completion, and both `automaticDeadlineAt` and `activeDeadlineAt` equal
`1786207780865` (`completedAt + 90000`). Backend logs for this player-action
Narrator show `requestedMode=auto`, `actualMode=native_json`, and the normal
zero-reasoning/bypass shape; construction tests cover the unchanged bypass
selection. The read-only reconciliation records that its before-click hash was
unavailable because the harness threw after the action, not because the player
clicked twice.

Actions 2 through 7 each used one currently rendered choice and one admitted
request, completed with one proper scene and one unique browser binding. Each
retained the stage-local deadline proof and native JSON trace. Action 6
naturally exercised the existing single recovery and completed with two
Narrator attempts, one accepted scene, and no third attempt. At this boundary
the lane had seven completed/bound proper player actions (action 1 plus 2-7)
and no duplicate receipt or binding.

Action 8 was the first genuine product defect. The rendered choice was
“Talk to Pira Senn: ask who handles the other rounds”
(`choice_575463e97e2f68e08a15ca17`), clicked once and admitted once. Mechanics
completed turn
`turn-player-action:e24b9ec86250183834653744256d5c9dabede63b`, with Game Master
accepted and two applied receipts (world 19 to 20, then a no-op). Its
Narrator operation
`narration-operation:82effd7a96c3cabbc949016532ee40a046ea0c40` preserved
`automaticDeadlineAt === activeDeadlineAt === 1786208342370` from operation
creation/completion `1786208252370`, while `submittedAt` was the earlier
`1786208246649`. Both attempt 1
(`narration-attempt:09c2f0458bdbbfbcb043c86ca21127d6b9bb2405`) and attempt 2
(`narration-attempt:3fa7adf4244d84e0463d8ebe727cf5996d7a84cc`) used the
existing strict-object/native-JSON path and failed `narration_invalid`; there
was no attempt 3, no proper scene, no late scene, and no duplicate mechanics
settlement. The precise rejected candidate/invariant was not retained. The
journey harness reported `hard_deadline_or_poll_timeout` while waiting, but
read-only reconciliation in `actions/action-008-reconciled.json` proves the
earlier terminal Narrator failure and is the authoritative boundary. The
rendered page was `phase=ready`, `activeTurn=null`, with no proper narration
scene and the concise fallback visible; no further player action was sent.

The lane therefore stopped at 8 completed player-action turns, 7 durable
proper-scene bindings, and 30 total receipts (7 prior operations plus the
failed action's two receipts). No 60/60 claim or same-page reload was made.
SQLite `pragma integrity_check` returned `ok` and `pragma foreign_key_check`
returned `[]` after the defect and after the read-only reconciliation.

## Acceptance handoff

Entry state: current source at Task 167 commit
`165848ef274830f6eb1622f6846629a950efae68`, with frozen r115 preserved and
only pre-existing `AGENTS.md`/`CLAUDE.md` worktree edits left unstaged.
Criteria 1 and 2 are positively mapped by action 1's exact deadline proof,
accepted scene, enabled controls, and one binding; criterion 3 by action 6's
single successful recovery on the shared deadline; criterion 4 by action 8's
two failed attempts, no attempt 3, and no late scene; criterion 5 by the
operation identity, immutable packet/receipt evidence, and absent post-failure
scene; criterion 6 by the focused Manual Restore tests; criterion 7 by the
unchanged schema and no migration; criterion 8 by the automated checks above,
the r116 SQLite checks, and the detect/commit/push evidence; criteria 9 and 10
are bounded by the first genuine action-8 defect, so reload and 60/60 remain
omitted. Exact task-owned process/listener/browser cleanup is recorded in the
r116 ownership registry and terminal handoff after shutdown.
