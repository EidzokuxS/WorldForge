# Task 190: Narrator actor-scope recovery frame

## Contract

When the Narrator's first proposal is rejected with the existing
`visible_actor_observation_mismatch` check, the one existing automatic recovery
attempt receives a code-derived `ACTOR_SCOPE_REPAIR_FRAME`. The frame is
derived only from the immutable packet's `OBSERVATION_ACTOR_NAME_FRAME` and
the safe mismatch coordinates. It identifies the failed beat field, final
observation indexes, matched actor, the actor's scope (`permitted`,
`quoted_reference`, or `forbidden`) for each index, and the stable allowed actor
names. It contains no rejected proposal, provider response, source prose,
secret, or hidden state.

Normal Narrator prompts and recovery prompts containing only other checks are
unchanged. Compiler guards, warning names and payloads, recovery feedback,
operation/packet identity, deadlines, attempts, persistence, mechanics, and
player-visible UI/copy remain unchanged.

## Entry and frozen evidence

Repository `R:\Projects\WorldForge`, branch `feat/revamp`, entry and origin
`90594177db2b8e442dce4fd9e3650aad3d3f5585`. Pre-existing `AGENTS.md` and
`CLAUDE.md` changes were preserved byte-for-byte and remain unstaged.

Frozen r137 (`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r137`, campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`) is immutable. Its action 9 failed both
Narrator attempts at the same safe visible-actor mismatch: beat 0,
`beats[0].text`, observation index `[0]`, matched Vedris Kast/Vedris, with Dren
Vask as the allowed/source performer. The separate pending narration
projection was accepted as packet-derived fallback behavior, not a persistence
or UI defect.

## Impact and semantic review

The current GitNexus index was 11 commits behind. The nested targets
`buildPrompt`, `buildObservationActorNameFrame`, and
`balancedDialogueQuoteSpans` were absent, so the current source-qualified
`narrator.ts` owner was used. File-level upstream impact for
`backend/src/campaign-play/narrator.ts` was LOW: 8 impacted files, 4 direct
callers, 0 indexed processes/modules. No HIGH or CRITICAL edited target was
found.

The approved recovery prose was reviewed by Main: humanizer and deslop found
it direct, concrete, and free of filler. It is retained exactly:

```text
ACTOR_SCOPE_REPAIR
Each entry identifies one failed beat field. Keep its final observationIndexes grounded; do not change them merely to authorize a name. If the matched actor is forbidden for every listed observation, remove its canonical name and matched alias from that field. If the matched actor is a quoted reference for any listed observation and is never permitted, keep it only inside balanced quoted dialogue and do not depict that actor speaking, moving, arriving, watching, or otherwise acting. Rewrite the listed field, then check every actor name against OBSERVATION_ACTOR_NAME_FRAME.
ACTOR_SCOPE_REPAIR_FRAME
<canonical JSON frame>
END_ACTOR_SCOPE_REPAIR_FRAME
```

## Implementation

`buildActorScopeRepairFrame` in `backend/src/campaign-play/narrator.ts`
preserves mismatch order, maps every final observation index against the
existing permitted/quoted-reference/forbidden frame lists, and emits only the
safe fields. `buildPrompt` appends the block only when at least one visible
actor mismatch is present; the existing generic recovery block and diagnostic
remain unchanged for all other feedback.

Focused Narrator coverage in
`backend/src/campaign-play/narrator.test.ts` proves the r137-shaped forbidden
case, permitted/quoted-reference/forbidden scope ordering, stable allowed names,
normal-prompt omission, unchanged generic recovery, and privacy exclusions.

## Static validation

- Narrator suite: 36/36 assertions passed.
- Turn-runtime plus application combined run: 87/87 assertions passed; Vitest
  reported its known post-run worker `onTaskUpdate` timeout after all selected
  files passed.
- Application single-thread run: 15/15 assertions passed; the same known
  post-run worker shutdown timeout returned a non-zero process status.
- Backend typecheck: passed (`tsc --noEmit`).
- Backend build: passed (`tsc -p tsconfig.json`).
- `git diff --check`: pending before the implementation commit.
- GitNexus staged `detect_changes`: pending before the implementation commit.

## r138 rendered evidence

Pending. The required fresh lane is
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r138` on ports 4240/4241/4242.
Canonical inputs must be verified before one atomic import, one Save, setup
selection, and one Begin. The lane will stop at its first genuine defect or
continue to 60 unique proper-scene bindings plus one same-page reload. A
natural visible-actor mismatch will be recorded only from retained safe
coordinates; no failure will be manufactured.

## Acceptance handoff

- Actor/surface/trigger: Campaign Play player, rendered Narrator scene, first
  mismatch followed by the existing automatic attempt 2.
- Positive static path: safe frame contains exact beat/field/index, actor scope
  per observation, and stable allowed names; normal and non-mismatch recovery
  remain unchanged.
- Protected behavior: existing semantic guard, warning/recovery payload,
  two-attempt fencing, deadline, immutable identity, mechanics, persistence,
  and visible copy are unchanged.
- Rendered evidence: pending r138 journey, with integrity/FK and reload proof
  if 60 actions complete.
- Omitted live evidence: no natural r138 lane has yet been run.

## Unknowns

Whether the configured model naturally produces the r137-shaped mismatch in
r138 is unknown until the rendered lane; rejected proposal/provider bytes are
not retained and will not be reconstructed.
