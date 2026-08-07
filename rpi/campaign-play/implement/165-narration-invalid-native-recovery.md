# Task 165: Narration-invalid native JSON recovery

## Contract

The automatic Campaign Play `narration_invalid` recovery now requests
`structuredOutputMode: "auto"`. For the existing `api.z.ai` capability this
resolves to native JSON, while the recovery keeps its existing default-reasoning
model construction. The initial player-action Narrator remains
auto/native-JSON with bypass reasoning. Provider/transport recovery remains the
existing auto/native-JSON/default-reasoning path. Opening Narrator, Judge, Game
Master, Actor Replanner, legacy storyteller flows, provider/model selection,
prompts, schemas, semantic guards, deadline arithmetic, one-retry limit, packet
and receipt identity, persistence, mechanics, UI, and visible copy remain
unchanged. There is no attempt 3.

Semantic-review verdict: "This changes one internal recovery transport strategy. It changes no prompt, model instruction, player-visible copy, or semantic invariant; the existing compiler and persistence fences remain authoritative."

## Repair and impact

The only production edit is the existing `narration_invalid` branch in
`backend/src/campaign-play/campaign-play-application.ts`: its automatic
`runNarration` recovery mode is now `auto` rather than `tool`. The
`provider_unavailable` branch remains `auto`, and the existing recovery call
continues to construct its model with default reasoning. The focused test delta
records and asserts both recovery mode requests as `auto`; no other role or
branch was changed.

The refreshed current-source GitNexus index contained 14,570 nodes, 42,004
edges, 792 clusters, and 882 flows. Upstream impact for
`Method:backend/src/campaign-play/campaign-play-application.ts:createCampaignPlayApplication.recoverNarration@1154:4#3`
was LOW with `impactedCount=0` and no direct callers, processes, or modules in
the graph. The result includes a boundary warning: one call site invoking
`recoverNarration` was dropped because its receiver type is unresolved, so the
graph result is an under-approximation. Main's bounded shared-path
authorization permitted this one branch-local mode change; no additional
executable symbol was edited.

## Automated evidence

- `npm --prefix backend test -- --run src/campaign-play/turn-runtime.test.ts --pool=forks --poolOptions.forks.singleFork`: 68/68 passed. This covers initial auto/bypass, narration-invalid auto/default recovery, provider-unavailable auto/default recovery, identity, deadline, one-retry/no-third-attempt, CAS, late-result, mechanics, and persistence fences.
- Focused Narrator/application/Opening/capability/generate-object-safe suites: 98/98 passed.
- `npm --prefix backend run typecheck`: passed.
- `npm --prefix backend run build`: passed.
- `git diff --check`: passed; only existing line-ending warnings were emitted.
- GitNexus `detect_changes` for the staged source/test delta returned `No changes detected`; broader read-only inspection showed only the pre-existing AGENTS.md and CLAUDE.md changes and no unexpected Campaign Play role or execution-flow mapping.
- Source/test commit `d7a6ce4181f3efde9ddbc17890d5ee6e5806480e` was pushed to `origin/feat/revamp`; local and origin matched. AGENTS.md and CLAUDE.md retained their pre-existing hashes and remained unstaged.

## Fresh rendered journey

Fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r114` used only
`lowwater-ledger-pristine-93a09e46-20260719` (state SHA-256
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`)
and canonical Brina card SHA-256
`4B48DE7A32DF6A6BE5A91AB12F09BB87926B40D5940348C7581E298EAA12B60A`. Setup
was one card import, one Save/Continue, `lower-wards`, `Local`, `Already
here`, `Looking for work`, and one Begin.

Actions 1 through 8 each used one currently rendered choice, completed one
player-action turn with a proper scene, accepted exactly one Narrator attempt,
restored enabled controls, and created one unique browser ledger binding. The
journey varied contact and wait actions and preserved the local alderman-hallway
thread. The new narration-invalid recovery was not naturally exercised.

Action 9 selected `Talk to Dren Vask: plead for a second chance` once. Its one
request returned 202, but the authoritative turn
`turn-player-action:b491ce260bba8274226a054bc1ae2680841a0ce6` stopped at
`interrupted` with `error_code=model_contract_invalid` during Judge. Exactly two
Judge attempts ran, both strict-object model stages: attempt 1 ended with the
bounded `resultBounds` semantic issue (`Actionable judgments require a
mechanical result range.`), and attempt 2 ended with the bounded
`clarificationQuestion` issue (`Clarification question must match the judgment
disposition.`). The new Judge diagnostic events contain only campaign/turn/stage
identity, attempt/epoch, issue code/path, and schema-owned messages; no proposal
bytes or player prose were retained. There was no Narrator attempt, narration
operation, proper scene, receipt, actor job, turn result, attempt 3, or late
write. No Judge repair was made because this is outside the selected Narrator
recovery change and is the first genuine defect in the lane.

The journey runner initially reported empty per-action mode fields because its
parser searched for a quoted event key while Pino pretty output uses `event:`.
The lane was not restarted or replayed. A corrected offline read-only parse of
the preserved backend log found 42 generate-object-safe calls: 36
auto/native-JSON and 6 tool/tool-mode. The final Judge calls were
auto/native-JSON with zero reasoning tokens, then tool/tool-mode with 3,265
reasoning characters, matching the unchanged Judge path. The corrected trace is
preserved in `r114-mode-trace.md` beside the raw log.

The frozen run ended at 9 admitted/completed player-action turns and 8 unique
browser bindings; no 10/30/60 checkpoint or reload was attempted. SQLite
`pragma integrity_check` returned `ok`, and `pragma foreign_key_check` returned
no rows.

## Acceptance handoff

| Criterion | Evidence | Result |
| --- | --- | --- |
| Initial player Narrator remains auto/native JSON with bypass reasoning | Existing focused construction/capability tests and r114 corrected raw-log trace | Pass; actions 1–8 each accepted one proper Narrator result |
| `narration_invalid` recovery requests auto/native JSON with default reasoning | Branch-specific tests | Pass statically; not naturally exercised in r114 |
| Provider-unavailable recovery remains auto/default and identity/deadline/retry/CAS/mechanics fences remain unchanged | Focused application/turn-runtime suites | Pass statically |
| Fresh rendered positive journey | r114 setup and actions 1–8 | 8 proper scenes and 8 unique bindings; no later action after the first defect |
| First-defect boundary | r114 action 9 Judge attempts and bounded diagnostics | Frozen at Judge semantic contract invalid; no scene, receipt, replay, or late write |
| 60/60 plus same-page reload | r114 terminal evidence | Not reached; reload intentionally not attempted after action 9 |

## Cleanup

The frozen r114 ownership registry recorded backend root 73176, frontend root
32208, browser/CDP root 34320, journey helper 63828, descendants
49312, 74288, 47356, 74468, 66360, 56184, 12740, 6808, and ports 4010/4011/4012.
All owned roots and descendants were stopped. Independent verification recorded
`remainingPids=[]`, no listeners on the task ports, unreachable CDP, and the
preserved browser profile. Frozen r111–r113 remain untouched. No provider call,
Resume, Restore, retry, replay, direct SQLite/API write, or instruction-file
mutation was used.
