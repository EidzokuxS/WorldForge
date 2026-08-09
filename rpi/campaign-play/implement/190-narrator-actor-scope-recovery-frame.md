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
- `git diff --check`: passed for the implementation patch.
- GitNexus staged `detect_changes`: passed on exactly the three owned paths; the
  stale index reported one indexed `safeParse` test symbol, 0 affected
  processes/modules, and LOW risk. Source review confirmed only the Narrator
  recovery frame/prompt and focused tests changed.
- Implementation commit `87dcf50c596e54c9c7d64eb99911591037877553` was pushed;
  local `HEAD` equals `origin/feat/revamp`.

## r138 rendered evidence

The exact fresh lane
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r138` ran on owned ports
4240/4241/4242 from the materialized canonical template. The source template
state hash was
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, the
source and materialized config hash was
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and the
canonical Brina card hash was
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. The
materialized state was intentionally changed by the run (final hash
`A53BF09E2BF91097FB81A76F336EA0FCF55D6D0DB7CA829A4E44C4DBD4EA119F`).

Setup used one atomic card assignment/import (HTTP 200), one Continue/Save,
the exact lower-wards / Local / Already here / Looking for work selections, and
one Begin. The Opening reached a proper ready scene. Actions 1 and 2 each
settled one proper scene and one unique binding. Action 3 selected
`Talk to Dren Vask: ask what the alderman does with seized tokens` and was the
first genuine product boundary: the Narrator operation
`narration-operation:6a9e361600e007858966eddf9d25a64898048990` failed
`narration_invalid` after both bounded attempts at the same visible-actor
mismatch coordinate. No later click was made.

The retained safe log coordinates were beat 0, `beats[0].text`, observation
index `[0]`. Attempt 1 matched Dren Vask/Dren with no allowed/source performer
in its safe warning; attempt 2 matched Vedris Kast/Vedris with the same empty
allowed list. Both attempts were `zai-coding-plan` / `glm-5-turbo`,
`strict_object`, native_json, finish `stop`, and schema-invalid
`narration_invalid`; durations were 5,786 ms and 3,985 ms. The immutable
operation reused packet hash
`07a2c54b835139a1bcd0ae1d569ac9b8fd99cb17df45895bf3486e67afe0e573`, result
`result:0cf65d22ac395aac4599ca3a97f9daedb61893da`, and the shared 90,000 ms
deadline. No attempt 3, late write, mechanics replay, proper scene, or binding
followed action 3.

The authoritative final state was ready with worldVersion 14 and
runtimeRevision 66, four turns (Opening plus three actions), two proper scenes,
18 commands, 18 receipts, three Narrator operations/four attempts, seven model
stages, one actor job, and no active turn. SQLite read-only checks were
`integrity_check=ok` and `foreign_key_check=[]`; the failed operation left the
expected packet-derived fallback display and choices. The lane therefore hard
stopped at completed=3, bound=2, before any 10/20/30/40/50/60 checkpoint or
reload.

The exact session/run evidence remains under the two r138 output roots. Owned
backend PID 30328, frontend roots/PIDs 21460 and 10688, browser PID 36284 and
its recorded children, listeners 4240/4241/4242, the CDP endpoint/page, and the
task browser profile were stopped/closed/removed and independently verified
absent. Unrelated Comet/EdgeWebView processes were left untouched.

## Acceptance handoff

- Actor/surface/trigger: Campaign Play player, rendered Narrator scene, first
  mismatch followed by the existing automatic attempt 2.
- Positive static path: safe frame contains exact beat/field/index, actor scope
  per observation, and stable allowed names; normal and non-mismatch recovery
  remain unchanged.
- Protected behavior: existing semantic guard, warning/recovery payload,
  two-attempt fencing, deadline, immutable identity, mechanics, persistence,
  and visible copy are unchanged.
- Rendered evidence: setup and Opening were ready; actions 1-2 settled one
  proper scene/binding each; action 3 froze at the first genuine
  `visible_actor_observation_mismatch` Narrator defect with the exact retained
  operation/attempt, packet, deadline, safe log coordinates, and clean SQLite
  state above. This is natural affected-path coverage, although the private
  recovery prompt/frame bytes are not retained.
- Persistence evidence: no duplicate mechanics/receipts or late writes were
  observed; `integrity_check=ok` and `foreign_key_check=[]`. The 60-action and
  same-page reload criteria were not reached because hard-stop correctly froze
  action 3.
- Cleanup evidence: all task-owned processes, listeners, CDP/page, and profile
  were independently absent after capture; generated evidence remains
  uncommitted.

## Unknowns

The configured model did naturally produce a visible-actor mismatch in r138,
but the retained logs do not include private recovery prompt/frame bytes or
rejected proposal/provider bodies, so the new block's exact provider receipt is
unknown. The upstream cause of the two invalid candidates is also unknown. The
60-action endurance and reload evidence remain unavailable because action 3 was
the first genuine frozen defect.
