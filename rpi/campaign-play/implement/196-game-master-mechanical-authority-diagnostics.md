# Task 196 - Game Master mechanical-authority diagnostic coordinates

## Contract and frozen boundary

The frozen r143 run is immutable: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r143`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. At action 2 both Game Master attempts reached the Mechanical Authority Reviewer and repeated `mechanical_authority_rejected`; the private reviewer reason and rejected subclaim were not retained. The existing generic recovery instruction already forbids untyped possession, obligation, and route claims. Task 196 is diagnostics-only and does not infer a cause or add another recovery instruction.

The provider-facing Mechanical Authority Reviewer result now requires `failedChecks`. An accepted result must use `failedChecks: []`. A rejected result must use one to five entries from this exact enum, in provider output order before private canonicalization:

- `possession_authority_missing`
- `obligation_authority_missing`
- `route_authority_missing`
- `possession_transform_identity_incomplete`
- `other_mechanical_authority_mismatch`

Rejected reviews are canonicalized to the enum declaration order and deduplicated for one private `reviewFailedChecks` warning field. The existing warning name, model-contract error, denial, artifact boundary, generic `mechanical_authority_rejected` recovery feedback, recovery prompt, attempt limit, mechanics, persistence, provider/model/mode/deadline, and player-visible behavior remain unchanged. Reviewer reason, proposal/event summaries, player text, names, provider text, and raw candidate data are not logged or persisted in the rejected-review warning payload.

The exact reviewer instruction is intentionally unchanged from Main's approved literal:

> Set failedChecks to [] when verdict is accepted. When verdict is rejected, include each applicable safe check once: possession_authority_missing for an untyped possession or custody change; obligation_authority_missing for an untyped debt, payment, or duty change; route_authority_missing for an unsupported route or access claim; possession_transform_identity_incomplete when a typed transformation leaves retained possession identity incomplete; other_mechanical_authority_mismatch only when none of the specific checks applies. Do not copy event summaries, proposal text, player text, actor names, location names, provider text, or the free-form reason into failedChecks.

Prompt semantic review: Main's prompt-craft, humanizer, and deslop verdicts all approve the literal as direct, bounded, and non-sloppy. No other prompt or player-visible copy changed.

## Impact and implementation

Entry branch was `feat/revamp` at local/origin `43ba9aa68193bd5b112e77d772f1ed2fc5779680`; only the pre-existing unstaged `AGENTS.md` and `CLAUDE.md` changes were present. The registered GitNexus index was stale. A task-owned exact-entry shadow was rebuilt at `43ba9aa68193bd5b112e77d772f1ed2fc5779680` (`14,934` nodes, `42,704` edges, `882` flows).

The exact private schema target `mechanicalAuthorityReviewSchema` and prompt helper `mechanicalAuthorityReviewPrompt` were LOW risk. The nested `createCampaignPlayGameMaster.plan` implementation seam was LOW lower-bound with no indexed direct callers because 22 receiver callsites were unresolved. The exported outer factory `createCampaignPlayGameMaster` reported HIGH transitive impact (18 symbols, 3 direct callers, Campaign Play drive/recoverNarration/admitTurn and Engine transitive modules), but it is not the edited target and its exported signature is unchanged. No CRITICAL exact edited target was used and no other production owner was edited.

Implementation is limited to `backend/src/campaign-play/game-master.ts`: the private reviewer schema is a verdict-discriminated union; canonicalized failed-checks are carried only through an in-memory WeakMap to the existing private warning; the generic recovery feedback remains byte-for-byte equivalent. `backend/src/campaign-play/game-master.test.ts` inspects the Zod/provider JSON Schema, accepted/rejected shape boundaries, prompt literal, canonical ordering/deduplication, and diagnostic privacy.

## Static validation before r144

The focused Game Master suite passed 62/62 tests. The focused turn-runtime suite passed 72/72 tests, and the Campaign Play application suite passed 15/15 tests. Backend typecheck (`tsc --noEmit`) and build (`tsc -p tsconfig.json`) passed. `git diff --check` passed. A first path-prefixed Vitest invocation was a harness/command-path miss with no test files selected; the corrected package-relative command passed and is the acceptance result. Exact-entry shadow GitNexus `detect_changes --scope staged` reported 3 files, 9 symbols, 5 Plan flows, and MEDIUM risk: the expected private reviewer/schema and nested Game Master Plan path plus focused test symbols. The registered primary index returned no changes because it is stale at commit `1a06944`; the shadow result is authoritative for this staged patch. Protected `AGENTS.md` and `CLAUDE.md` remain byte-for-byte unchanged and unstaged. Generated r144 evidence is not part of the implementation commit.

## r144 journey

The fresh lane is `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r144`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, using owned ports `4300/4301/4302`. Canonical setup hashes are template state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Setup was performed once through the rendered surface: one canonical Brina card import/file assignment, one Save/Continue, lower-wards / Local / Already here / Looking for work, and one Begin. Opening reached a proper ready scene. The required live hashes were verified before setup: template state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Actions 1-7 each settled exactly once with one proper scene and one unique binding. The rendered labels and final world versions were: action 1 `Talk to Dren Vask: ask what work the market offers` (world 13), action 2 `Talk to Dren Vask: ask what the shaft trouble is` (world 14), action 3 `Talk to Dren Vask: press why the alderman won't explain` (world 15), action 4 `Talk to Dren Vask: ask if Vedris knows more` (world 16), action 5 `Talk to Dren Vask: ask why Vedris keeps going back` (world 17), action 6 `Talk to Vedris Kast: ask about the marked names` (world 18), and action 7 `Talk to Vedris Kast: ask about a specific marked household` (world 19). The corresponding durable turns were `turn-player-action:d858727e5c90cac7402075a6d0499afcc9108a36`, `turn-player-action:5839d6057baa49b45c40192610269eaeb45a3905`, `turn-player-action:d16c3a05e91313f83b58664ea80494299a3fcc77`, `turn-player-action:cb31eb28711d1f690369bf02442ba2fadc8ff5f9`, `turn-player-action:535dd18450e9f13549bdfd8dd1806bfe3c1c8ea7`, `turn-player-action:93b1aa59690bd8fe21b97373347b80979eac531e`, and `turn-player-action:c1d5183cd4dc7a41b0dce3446ff0542294032ec4`.

Action 8 was admitted once with label `Talk to Vedris Kast: ask about the lumens cut`, turn `turn-player-action:29af340aa0576dfa6f7ef27eb80fc05cafcbebf1`, and Game Master stage `042b036ef98534f3762a68f4141cc9129f3abc58e392a2c1880908805af92c90`. Attempt 1 was an unchanged `strict_object`/native-json request that interrupted at the local 45-second stage boundary: duration 45069 ms, `transport_error`, `stage_timeout`, no retained artifact. Automatic attempt 2 used the unchanged tool recovery route and interrupted with `finish_reason=tool-calls`, duration 17405 ms, `schema_outcome=invalid`, and `model_contract_invalid`; no attempt 3 occurred. The backend retained the bounded Task 187 diagnostic for this invalid structured-output result at `backend.stdout.log:1478-1568`:

```text
llm.structured_output_invalid_tool_call
toolName=structured_output source=result stepIndex=null toolCallIndex=0
argumentCarrier=input argumentType=object
directToolCallCount=1 stepToolCallCount=1 matchingToolCallCount=2 invalidMatchingToolCallCount=2
```

The event contains no argument values, keys, prose, provider body, or player text. This was not a Mechanical Authority Reviewer rejection, so `reviewFailedChecks` did not occur naturally in r144 and live diagnostic coverage for Task 196 remains unavailable. The action-8 turn remained interrupted with no final world version, no Narrator operation, no scene, no actor job, no receipts, and no commands; campaign state remained world version 19/runtime revision 168. The rendered page retained the previous proper scene, displayed `The turn stopped before it finished.`, showed Resume, and disabled all suggestions, textbox, and Act controls. The lane was frozen at the first genuine model-stage defect; no Resume, retry, replay, reload, or later action was submitted.

Terminal read-only totals were 8 player turns (7 completed), 7 proper scenes, 7 Narrator operations, 30 commands and receipts, 17 model stages, and 5 actor jobs. The action-8 stage had no late write or duplicate settlement. `PRAGMA integrity_check` returned `ok` and `PRAGMA foreign_key_check` returned `[]`. No 10/20/30/40/50/60 checkpoints or reload were reached because of the hard stop.

Evidence hashes captured after terminal reconciliation were backend stdout `214E1C9A3961B87E35EE764B6A741CB82651B83B781400FEED0EC93AF7895DF6`, backend stderr `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`, r144 state database `FC30200791F4784A88AE6F446AF0CD3DA5258B03EA40CAFDCD2105DF172DD7DA`, r144 WAL `D8B6E6AB9E1CFAAE344CB740391A5D199924F677387E2660A9DED504A9F47FB0`, and config `D8362B1AF976C00CB8F14C564C8196A2D1AB137743FF368EA83D762A4AD2E065`.

Cleanup was independently verified after evidence capture. The task-owned backend/frontend process chains (`87120, 81396, 5948, 49132, 74452, 69712, 48536, 87236`) and exact task browser-profile Chrome chain (`4164, 79436, 88736, 84488, 17084, 38056, 40004`) are absent. Ports 4300/4301/4302, the CDP endpoint/page, task browser profile, temporary launch helpers, and exact-entry GitNexus shadow are absent. The r144 session and world-run evidence roots remain preserved. `AGENTS.md` and `CLAUDE.md` remain byte-for-byte unchanged and unstaged.

## Acceptance handoff before r144

- Private generation contract: the reviewer schema and prompt literal are bounded to the allowlisted checks; no accepted/rejected semantics or recovery route changes.
- Diagnostic contract: a rejected review will expose only ordered/deduplicated `reviewFailedChecks`; raw reviewer/proposal/player/provider content remains excluded.
- Protected behavior: generic recovery feedback, prompt, one automatic recovery, mechanics, identity, deadlines, persistence, UI, and unrelated roles remain unchanged.
- Built product and persistence: r144 proves canonical setup, Opening, and seven exactly-once player settlements with authoritative state; the first genuine action-8 model-stage defect freezes the lane before 60/reload. SQLite integrity/FK are clean at the boundary. Mechanical `reviewFailedChecks` live coverage is unavailable because no reviewer rejection occurred.

## Acceptance handoff after r144

- Entry and source: implementation commit `b24bc8700969fff0e70a68ff68eb70a6a47ca2f4` is pushed on `feat/revamp`; local and origin were equal before the lane. The evidence update is note-only and keeps the protected dirty files unstaged.
- Reviewer generation contract: static schema/provider JSON-schema assertions cover accepted `[]`, rejected bounded enum values, malformed output, and unchanged reviewer acceptance/rejection. Focused Game Master 62/62, turn-runtime 72/72, application 15/15, typecheck, build, diff check, and staged detect evidence are recorded above.
- Diagnostic privacy: static rejection coverage proves ordered/deduplicated `reviewFailedChecks` only, with no reviewer reason/proposal/event/player/provider prose and no change to generic recovery. The new live Task 196 diagnostic was not observed; action 8 instead observed the already accepted Task 187 bounded invalid-tool event.
- Built product: setup/opening and actions 1-7 satisfy exactly-once scene/binding evidence. Action 8 is the immutable first genuine defect with the exact turn/stage/attempt and rendered terminal state above; no 60-action, checkpoint, or reload claim is made.
- Persistence and cleanup: terminal state has world 19/runtime 168, 7 completed bindings/scenes, 30 commands/receipts, integrity `ok`, empty foreign-key check, no action-8 late write, and independently absent owned processes/listeners/page/profile/helpers.
- Omitted criteria: natural Mechanical Authority Reviewer `reviewFailedChecks` capture, 10/20/30/40/50/60 checkpoints, 60 unique bindings, and same-page reload are unavailable because r144 hard-stopped at action 8. Raw provider status/body, raw structured-tool arguments, and reviewer reason/subclaim remain unknown.
