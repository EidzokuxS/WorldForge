# Task 198: Narrator generation-schema recovery

## Contract

When the first Campaign Play Narrator `safeGenerateObject` call fails with
`schema_validation_failed`, the existing external `narration_invalid`/contract
classification remains unchanged, while the existing automatic attempt 2 may
receive one safe, non-persistent generation-recovery signal. The signal is
`narrator_generation_schema_mismatch` with the sole check
`generation_schema_invalid`. It carries no candidate, provider response,
Zod message, packet prose, name, label, handle, or rejected value.

The recovery prompt adds the packet-derived `ACTION_SELECTION_INDEX_FRAME` only
for that signal. The frame contains the expected selection count and ordered
allowed intent indexes. Required-reply position zero allows only the required
intent and trailing positions exclude it; without a required reply every
position allows every packet intent index. The one-intent packet remains valid.
Normal prompts, packet-validation/actor-scope recovery, schema, compiler,
provider/model selection, deadline, retry count, persistence, mechanics, UI,
and visible copy remain unchanged.

The runtime forwards this non-null feedback through the existing safe-feedback
attempt-2 path only before the persisted deadline. The operation, packet,
result, receipt, turn, and fencing identities remain shared; there is one
automatic recovery and no attempt 3 or mechanics replay.

## Evidence and impact

Entry was `feat/revamp` at `3f74d98cdbaac9c62b2909b1e77a7e6e7f46849a`, equal to
`origin/feat/revamp`; only the protected pre-existing `AGENTS.md` and
`CLAUDE.md` were dirty. Frozen r145 remains immutable. Its action-19 Narrator
operation `narration-operation:4b85c02fae13b235daa3300147bb63c800a2e8f3`
failed attempt 1 at `schema_validation_failed` (`actionSelections.1.intentIndex`)
and attempt 2 expired with no retained provider cause or candidate.

An exact-entry task-owned GitNexus shadow was analyzed. Source-qualified
`buildPrompt` and `executeNarration` are LOW-risk nested targets; the
`CampaignPlayNarratorError` carrier is MEDIUM. The enclosing
`createCampaignPlayNarrator` and `createCampaignPlayTurnRuntime` factories show
HIGH transitive fan-out, but they are not edited symbols and no exported
interface is changed. No CRITICAL exact edited target was found.

Main's semantic, humanizer, and deslop verdict for the approved recovery
literal: direct, natural, and non-repetitive; retain it byte-for-byte.

## Implementation

- `backend/src/campaign-play/narrator.ts`: added the discriminated generation
  feedback variant, packet-only action-selection frame, recovery block, and
  `schema_validation_failed` attachment while preserving all existing packet
  and actor-scope paths.
- `backend/src/campaign-play/turn-runtime.ts`: forwards non-null
  `model_contract_failed` Narrator feedback through the already existing safe
  recovery selector; persisted/public narration classification remains
  `narration_invalid`.
- Focused tests cover required-reply ordering, trailing exclusion, no-required
  reply behavior, the one-intent boundary, normal-prompt omission, exact
  recovery prose, frame privacy, and the same-identity runtime retry for both
  public failure codes.

## Static validation before live run

- Narrator focused suite: 37 assertions passed.
- Turn-runtime full file: all 73 assertions passed, including both
  `narration_invalid` and `model_contract_failed` cases, but Vitest exited
  non-zero after a known `onTaskUpdate` worker-shutdown unhandled error. The
  narrow recovery rerun passed 2/2 targeted tests (71 skipped) with exit 0;
  the shutdown is therefore recorded as a harness defect, not hidden as a
  green full-file process.
- Campaign Play application suite: 15/15 passed (exit 0).
- Backend typecheck: passed (`tsc --noEmit`, exit 0).
- Backend build: passed (`tsc -p tsconfig.json`, exit 0).
- `git diff --cached --check`: passed (exit 0).
- The registered GitNexus index was stale at `1a06944`; its staged query
  returned `No changes detected` and is not treated as authoritative. The
  task-owned exact-entry shadow detected the retained patch as 4 source files,
  13 symbols, and 7 affected Campaign Play flows at HIGH transitive risk.
  The changed nested `buildPrompt`/`narrate`/`executeNarration` path is the
  expected Narrator recovery path; the HIGH result is the enclosing factory
  fan-out, with no CRITICAL exact target, exported interface, or unrelated
  production owner.

## Fresh r146 journey

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r146` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66` was executed once on ports
4320/4321/4322. Session evidence is at
`output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r146.session`;
world-run evidence is at
`output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r146`.
The canonical template, config, and Brina card hashes were respectively
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`,
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
Materialization recorded template commit `f03596b91d857783e54107437ea5fa43e7236275`
and runtime commit `62de24d42095c4509130c506c04243d5a94e8f2f`.

The setup harness exited with `player_save_network_invariant_0_0`; read-only
reconciliation showed no repeated import. A single continuation completed the
exact lower-wards / Local / Already here / Looking for work selections and one
Begin. Opening reached `ready` with Brina Hael and a proper scene at
`alderman-hallway`; the page had no console errors.

Actions 1-3 settled durably with one proper scene and binding each:

- 1: turn `turn-player-action:a995a6a63e1685078b8de37a175255aae31fefb6`,
  choice `choice_49bcb818eb0fc56ad171d8a8`, “Talk to Dren Vask: ask about the
  marked households”, scene `narration:a4373bc5d478b433f9ff83408410d67b04ecc481`,
  operation `narration-operation:76da6aa83dc00f420453d1a04e48fae95ac829a8`.
- 2: turn `turn-player-action:808c10df41ae6d7550820f80c93cad04a9637aee`,
  choice `choice_f5bd3c1f1a53ad34a3c0a8fd`, “Talk to Dren Vask: press him on
  old versus current marks”, scene
  `narration:6da49a5663eff02cbd4127d2d06f9ffc63d5d10a`, operation
  `narration-operation:8c2e0c12aa52657b484b670b787fc7130a32114e`.
- 3: turn `turn-player-action:82f80da8af36ff718044627b6747c30b0ef83c66`,
  choice `choice_8e99d3f57345f568ca13795b`, “Talk to Dren Vask: ask about a
  specific household”, scene
  `narration:fa980e84688f4e2331e794c018b032b3fb57def3`, operation
  `narration-operation:e7af1a236d65c0e1bae7f223c47b0cf68d9b146d`.

The first genuine defect was action 4. Turn
`turn-player-action:e3236785a411fe91a2d1a56a491bf840a7c5bd10` and choice
`choice_d7811dabbc6361a9cdc0cebb` (“Talk to Dren Vask: press for one household
name”) remain frozen with no later click. Judge stage
`73fbc5f79157b49ed3fe66ff2de4b89f7b469783de46e28c23b086bb1f015ad0` attempt 1
(`86e2168eacf8c142b849d5a5d7bd77b2b1a8c3f9e2c6ab7d5d05a0ddc4854764`) was
interrupted after 45,040 ms (`stage_timeout`, no retained artifact). Automatic
attempt 2 (`2d8a1fd446293ecf5fe9bb8bccc1f88fe45aa87dff23167379f7c0362340142b`)
used the same requested/actual `zai-coding-plan` / `glm-5-turbo` / strict-object
identity, returned tool-calls with input/output usage 17,729/5 in 7,774 ms,
and failed `model_contract_invalid` because the structured-output call was
invalid. No Judge artifact, Game Master, Actor, Narrator operation, mechanics,
receipt, scene, or binding followed action 4. The page stayed turn-active with
the prior proper scene visible; this is the terminal boundary.

The Task 198 Narrator generation-schema recovery did not occur naturally.
Narrator packet-validation recoveries occurred on actions 1-3, but they are a
different existing feedback variant. The action-4 backend log also captured
the already-accepted Task 187/197 bounded invalid-tool diagnostic with
`schemaIssues: [{issueIndex: 0, code: "invalid_union", path: ["disposition"]}]`;
that is Judge evidence, not Task 198 Narrator coverage. Raw provider and
proposal bytes remain unknown.

Final read-only SQLite state at the frozen boundary: characters=1, turns=5,
commands=20, receipts=20, proper scenes=3, Narrator operations=3, Narrator
attempts=6, model stages=11, actor jobs=3, runtime events=91; accepted
worldVersion=14, runtimeRevision=91, setup phase `ready`. `integrity_check`
returned `ok` and `foreign_key_check` returned `[]`. No 10/20/30/40/50/60
checkpoints or same-page reload were performed because the first genuine defect
occurred at action 4.

Evidence hashes captured for the relied-on r146 artifacts include:
`runtime.json`=`D89E6C478C0647618252B06EAF99BD475A20C3CE4DF349B186BDD14F0A84B9AB`,
`probes/materialization.json`=`13CE4697D15FE57FE3DD15B1219100013A8D38727281D72839B654D38A09F769`,
`probes/setup-continuation-summary.json`=`EB40BF5BEA18AE627D43E8092B8705C158038284F2BE0C7F5B9E5EFA4E96D785`,
`r146-terminal.json`=`4E920871D6C6C99D40DC1F62D3DE07749E95FA036F0F395CC0936D82ACF1E160`,
`action-001-evidence.json`=`9E32EE498931D72DEA09946E9954590F4738DA4EBBE002E3942175616EA8E501`,
`action-002-evidence.json`=`C809933FC3656E3818AAC9E51559BA2047B6B24B57E232D9C6D26D8BC76DD9CD`,
`action-003-evidence.json`=`14EC35C9BBC244C9A712BBB441E841B26BB28C1797837F389E644EF3D5BE34A8`,
`action-004-evidence.json`=`172BEDDAD9C61EE4A812D6396EC81F20566B21A3C01A12BEF5CA5D83A96F103A`,
`browser-actions.jsonl`=`8FCC5F79F971EA4C607CFEE2F2998DEEBD5A7A2D1182467F98DA71EDE3591C79`,
and `config.json`=`D8362B1AF976C00CB8F14C564C8196A2D1AB137743FF368EA83D762A4AD2E065`.
The post-shutdown `backend.stdout.log` hash was
`AD0AA930F5670B4DEA2D93BCF1929C28786B28C2386354E468E9576AE0C4A4A7` and the
read-only `state.db` hash was
`E52FEB3681717FA1889F5C8B3730CD1B2E7046143F8983DB0B769521696A6FC1`;
both remained stable across the read-only verification pass.

## Acceptance handoff

Static source/tests prove the bounded feedback and frame contract and the
runtime's existing one-recovery fencing. The built r146 surface proved the
canonical setup and ready Opening plus three durable proper-scene bindings;
the first genuine Judge defect froze action 4 before Narrator invocation, so
live Task 198 generation recovery is unavailable. SQLite persistence and
integrity/FK are clean at that boundary. The 60-action checkpoints and
same-page reload are omitted, not inferred, because the hard-stop contract
forbids later clicks. Task-owned backend/frontend/browser processes were
stopped, the page was closed, and the r146 profile and GitNexus shadow were
removed while the session/run evidence was preserved; ambient r145 ports and
evidence were untouched.
