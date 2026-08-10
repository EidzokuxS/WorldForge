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

Pending at initial note commit: focused runtime/application/Judge suites,
backend typecheck/build, diff check, and staged GitNexus detect_changes.

## r148 live evidence

Pending. The required fresh lane is
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r148` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66` on task-owned ports 4340/4341/4342,
with canonical state/config/card hashes
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`,
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

## Acceptance handoff

Static evidence must map the five mode/recovery scenarios to focused runtime
tests. Live evidence must distinguish setup, every durable player-action
binding, checkpoints, any natural Judge safe-recovery mode pair, final
integrity/FK state, reload, and cleanup. Unavailable natural recovery or
60-action evidence must remain explicitly unavailable.
