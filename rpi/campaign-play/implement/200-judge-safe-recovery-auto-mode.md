# Task 200: Judge safe-recovery auto mode

## Contract and boundaries

When Judge attempt 2 carries the existing safe `judgeRecoveryFeedback`, the
existing external structured-output mode selector requests `auto` instead of
forcing `tool`. Attempt 1 remains `auto`; attempt 2 without safe feedback
remains `tool`; Game Master mode selection remains unchanged. Judge schemas,
prompts, models, deadlines, retry count, authority, mechanics, persistence,
UI, and copy are unchanged. The frozen r147 lane is immutable.

## Entry and impact

Entry is `feat/revamp` at
`0ffcf54c480530643c4b53e702c7edb795fdc19d`, equal to
`origin/feat/revamp`. Pre-existing `AGENTS.md` and `CLAUDE.md` remain dirty,
unstaged, and byte-preserved. Exact-current source impact for
`structuredOutputModeForExternalAttempt` is LOW: two direct callers, two
Campaign Play processes (Judge and Game Master), one module. The enclosing
runtime factory is a broader transitive owner but is not edited.

## Implementation and review

`structuredOutputModeForExternalAttempt` now returns `auto` only for Judge
attempt 2 when `input.judgeRecoveryFeedback` is defined. The existing no-
feedback Judge branch and all Game Master lookup behavior remain byte-stable.
No prompt or visible copy changed; humanizer/deslop review is not applicable.

## Static validation

Implementation commit: `f5230a45f0f12170be5bbb822abaaeb598028db8`, pushed with
local `HEAD == origin/feat/revamp` before the live lane. Focused
`turn-runtime.test.ts` passed 73/73 assertions (exit 0),
`campaign-play-application.test.ts` passed 15/15, and `judge.test.ts` passed
45/45. Backend typecheck, production build, and `git diff --check` passed.
Staged GitNexus `detect_changes` reported only the expected nested selector and
its enclosing runtime factory, two Campaign Play callers/processes, and LOW
risk; no unrelated production flow was present. The initial Judge call remains
`auto`; safe-feedback Judge recovery is now `[auto, auto]`; the no-feedback
Judge timeout/failure path remains `[auto, tool]`; Game Master selection tests
remain unchanged. No prompt or visible copy changed, so humanizer/deslop are
not applicable.

## r148 live evidence

The single fresh lane was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r148` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66` on owned ports 4340/4341/4342. The
materialized state, config, and canonical Brina card matched SHA-256
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`,
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Setup performed one canonical import/file assignment, one Save, the exact
lower-wards / Local / Already here / Looking for work selections, and one
Begin. A setup helper reported a listener race; read-only CDP/runtime/SQLite
reconciliation proved the import and Save had already completed, so no setup
action was repeated. Opening reached a ready rendered scene. Actions 1-13
settled one turn and one rendered proper-scene binding each; action 5 naturally
recovered an Actor Replanner attempt-1 contract-invalid result on attempt 2
and settled once, unrelated to this Judge change. Checkpoint 10 recorded
completed/bound `10/10`, `worldVersion=21`, `runtimeRevision=189`, and
`integrity_check=ok` with empty `foreign_key_check`.

The first genuine defect was player action 14; no later click was submitted.
Turn `turn-player-action:9638318a5998af477e6280a44ffd59711e031682` itself is
completed, but Narrator operation
`narration-operation:bcfcfd46fdeebf62e48c21542f032c755aaacfed` failed
`stage_timeout` at its persisted local deadline
`1786375570096` after 89,917 ms. Its only attempt
`narration-attempt:b43b5a307d6e5e445e6d5e6a67d7b5794020efb9` failed with
`stage_timeout`, `requested_strategy=strict_object`,
`actual_strategy=null`, and no accepted Narrator attempt or proper-scene
binding. The preceding Game Master stage
`7206db9332c5b1602c937b00a45609382b6f84294c688327e2d09f01a37caf9a` had
attempt 1 schema-invalid and attempt 2 accepted; no mechanics replay or late
write occurred. Read-only SQLite integrity remained `ok` with an empty
foreign-key check. The rendered page remained ready with no accepted
Narrator result, so the lane froze at completed `14`, bound `13`; checkpoints
20-60 and same-page reload are unavailable. No natural Judge safe-feedback
recovery occurred in r148, so live `[auto, auto]` coverage is unavailable.

Evidence hashes after shutdown/read-only capture: `r148-terminal.json`
`8D271743A5245F0EE91F944C25F45E3B7925F4D4DDF1572A0D94E4EC3F26C277`,
`browser-actions.jsonl`
`219EB2BBC93240CCC048651A797C59F3E0345C2C646FA856F48A58E9392559C2`,
`probes/setup-continuation.json`
`5F03B903EC42CABBE9CA2165CDEA43A89AE4B1236FFB6C1D930E32511D53670C`,
`runtime.json`
`8EDC2F5D272C4EE0154FC708655EF42C5DD95021D11EA8AC445DE65B36BA1652`, and
the read-only campaign `state.db`
`2A457D4FF90C388E6A7A7BC5A4EBA23CC0E9B550EFE1EEFF5542F452ECF9A82C`.

Cleanup closed the r148 page and stopped only recorded task-owned PIDs
26128 (backend), 6292/80688 (frontend), and 33656 (Chrome). Ports
4340/4341/4342, the CDP endpoint, the page target, and those PIDs are absent;
the task-owned browser profile was removed. Session and world-run evidence
remain uncommitted.

## Acceptance handoff

1. Safe final-validation rejection: static runtime coverage proves recovery
feedback is retained and Judge modes are `[auto, auto]`; no natural Judge
recovery occurred in r148.
2. Attempt-1 timeout/provider failure without feedback: static coverage proves
`[auto, tool]`; r148 did not naturally exercise a Judge no-feedback timeout.
3. Initial attempt: static coverage proves supplied feedback is ignored and
attempt 1 remains `auto`.
4. Game Master: focused runtime/application coverage and detect_changes prove
its prior-stage lookup and mode behavior are unchanged.
5. Failed attempt 2: static fencing tests prove terminal/no-attempt-3/no-late
settlement behavior. Built evidence freezes earlier at Narrator action 14,
before a Judge recovery, so the 60-action and reload criteria are unavailable.

Protected `AGENTS.md` and `CLAUDE.md` remain byte-preserved and unstaged.
Unknown upstream Narrator timeout cause, provider response/status/body, and
raw candidate bytes remain unavailable by contract.
