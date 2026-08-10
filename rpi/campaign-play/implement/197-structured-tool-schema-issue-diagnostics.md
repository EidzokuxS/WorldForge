# Task 197 - Structured-tool schema issue diagnostics

## Contract and frozen boundary

The frozen `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r144` lane is immutable. At action 8, Game Master attempt 1 ended at the existing 45-second local stage boundary; automatic attempt 2 returned an invalid `structured_output` tool call in tool mode. The retained Task 187 diagnostic recorded only bounded call-origin metadata and no schema coordinate. Source review confirms that the selected invalid argument remains in memory during extraction and was previously discarded before the diagnostic event.

Task 197 is diagnostics-only. For each invalid matching `structured_output` call, the existing `llm.structured_output_invalid_tool_call` event keeps every prior field and adds only `schemaParseOutcome`, `schemaIssueCount`, `schemaIssuesTruncated`, and at most eight `{ issueIndex, code, path }` entries. The argument is used only in the local invalid branch. The original schema is evaluated with `safeParse` without coercion; a schema-valid argument marked invalid reports `valid` with zero issues, and an evaluation failure reports `unavailable` with no issues. Invalid Zod issues are flattened in stable order, union branches included, with a pre-cap count.

Paths retain non-negative numeric indexes and only schema-owned property names collected from bounded provider JSON Schema traversal. Every other string, symbol, or dynamic segment is `[dynamic]`; paths are capped at 12 segments and entries at 8. No argument values, object keys, raw messages, expected/received values, provider data, proposal text, player prose, or schema object are logged, persisted, returned in `SafeGenerateTrace`, or attached to `SafeGenerateError`. Extraction acceptance, valid-call preference, missing-call silence, error code/message, retries, fallback, provider/model/mode/deadline, and player behavior remain unchanged.

## Impact and authorization

Entry was `feat/revamp` at local/origin `e544426c2c9ec476afa7f3deba12be5506f38935`; only pre-existing unstaged `AGENTS.md` and `CLAUDE.md` changes were present. The registered GitNexus index was stale. A task-owned exact-entry shadow at `e544426c2c9ec476afa7f3deba12be5506f38935` was analyzed before editing. Exact private-source impact was:

- `extractStructuredOutputToolInput`: CRITICAL, 3 impacted symbols, 1 direct caller, 8 processes, 2 modules.
- `attemptToolModeGenerate`: CRITICAL, 74 impacted symbols, 1 direct caller, 23 processes, 7 modules.
- `structuredOutputToolArgument`: HIGH, 4 impacted symbols, 2 direct callers, 4 processes, 1 module.
- `collectStructuredOutputToolCalls`: HIGH, 3 impacted symbols, 1 direct caller, 4 processes, 1 module.

The nested `StructuredOutputToolInputResult` type is source-qualified and absent from the graph. Main explicitly authorizes this disclosed shared `generate-object-safe` transitive risk only for the private diagnostic seam named in the Task 197 packet. No exported `SafeGenerateTrace`, error interface, signature, consumer, acceptance path, or second production owner is changed.

## Implementation

`generate-object-safe.ts` carries the selected invalid argument only on the local invalid extraction result. Private helpers perform direct Zod parsing, bounded JSON Schema property-name collection, recursive union-issue flattening, path masking, and bounded payload construction. The invalid tool-mode branch spreads this payload into the existing event and then throws the unchanged `invalid_structured_tool_call` error. No argument or schema survives payload construction.

Focused tests cover invalid object privacy, SDK-invalid/schema-valid input, dynamic record-key masking, stable union flattening and eight-entry truncation, scalar/missing carriers, valid-over-invalid preference, missing-call silence, and unchanged error behavior.

No prompt or player-visible copy changed; humanizer/deslop review is not applicable.

## Static validation before r145

- Focused `generate-object-safe.test.ts`: 43/43 passed.
- Combined focused AI/Campaign Play suites (Judge, Game Master, Narrator, Actor Replanner, turn runtime, application): 7 files, 289/289 passed.
- Backend typecheck (`npm run typecheck`) passed.
- Backend build (`npm run build`) passed.
- `git diff --check` passed.
- On the task-owned exact-entry shadow with the staged patch, GitNexus `detect_changes --scope staged` reported 3 files, 6 mapped shared-AI symbols, 36 affected execution flows, and critical risk. The mapped shared symbols include the existing `safeGenerateObject`/native-generation callers because the private helper lives in the shared file; no additional production file, exported interface, consumer, or acceptance path was edited. This is within Main's explicit authorization for the disclosed private diagnostic seam.
The bounded implementation and initial note were committed and pushed as `38a1afe3c43098c4dea8e472774f0105ec95f2f1`; local `HEAD` equaled `origin/feat/revamp` before the lane. The protected `AGENTS.md` and `CLAUDE.md` files remained byte-for-byte unchanged and unstaged.

Canonical r145 template state, config, and Brina card hashes are respectively `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

## r145 journey

The fresh lane was `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r145` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, on task-owned ports 4310/4311/4312. The canonical template state, config, and Brina card hashes matched the values above. Materialization was performed once. The rendered Character flow performed one Brina import/file assignment, one Continue/Save, the exact lower-wards / Local / Already here / Looking for work selections, and one Begin. Opening reached `ready` with one proper scene. No import, setup action, Resume, Restore, retry, replay, provider change, settings change, SQLite write, or later player click was issued after the terminal boundary.

Actions 1-18 each settled one completed player turn with one unique proper-scene binding. Checkpoint 10 was: `worldVersion=23`, `runtimeRevision=211`, 10 completed player turns, 10 unique bindings, 10 proper scenes, 10 narration operations, 11 narration attempts (10 accepted, one failed/recovered), 36 commands/receipts, and `integrity_check=ok` with an empty `foreign_key_check`. The earlier failed Narrator attempt was action 2 and its automatic second attempt was accepted; it did not duplicate mechanics or bindings.

Action 19 selected `Talk to Vedris Kast: ask what Pira could gain from leverage` and is the first genuine product/model-stage defect. Its authoritative identity is turn `turn-player-action:62026261a554efcbad2f4b87bb645b4cd8053799`, model-stage row `fd0fd16fe6435a0d2d71b5cf3996cb53acacb0f4f879576dc23d5768074b0128` / stage `5d770bbc75272fdba9c84e50c151a4b09abae5b1c87bccfd5c34aa8e2b3bd83b`, and narration operation `narration-operation:4b85c02fae13b235daa3300147bb63c800a2e8f3`. The player turn itself completed at world version 31 (`expectedWorldVersion=30`, `expectedRuntimeRevision=311`, `baseWorldVersion=30`) with no turn error, and Game Master attempt 1 was accepted (`strict_object`, `glm-5-turbo`, 13,464 ms, finish `stop`, schema `valid`). The Narrator operation then failed at its immutable two-attempt boundary: attempt `narration-attempt:87c27a05dec99522ad46793e3e64f0fff26db01f` failed `narration_invalid` after 7,461 ms (`strict_object`, schema `invalid`); automatic attempt `narration-attempt:3029b900199f9754c6aef9f7efc365053c0a7c5d5` failed `stage_timeout` after 82,413 ms, with no actual provider/model/strategy, no finish reason, and `schema_outcome=transport_error`. The operation remained `status=failed`, `current_attempt=2`, `error_code=stage_timeout`, `automatic_deadline_at=active_deadline_at=1786354245362`; no attempt 3, proper scene, late write, or duplicate mechanics followed.

At the terminal boundary the authoritative state was `setup_phase=ready`, `worldVersion=31`, `runtimeRevision=324`, 18 completed and 18 unique player turns, 17 proper scenes/scene bindings, 18 Narrator operations (17 `complete`, one `failed`), 22 Narrator attempts, 53 commands, and 53 receipts. The terminal action has no proper-scene row, so the run is frozen at 18/60 and no reload was performed. The rendered page retained the previous proper scene and displayed the packet-derived fallback text with a `Restore the telling` control and enabled suggestions; those controls were not clicked because the authoritative operation was failed. The backend log retained the two generic `llm.attempt` records (the first Narrator schema-invalid attempt and the second abort) but no `llm.structured_output_invalid_tool_call` event, because this natural failure was native JSON followed by a stage timeout rather than structured-tool extraction. Live Task 197 diagnostic-event coverage is therefore unavailable; the static privacy suite remains the only direct evidence for the new fields. Final read-only SQLite checks were `integrity_check=ok` and empty `foreign_key_check`. The canonical run database SHA-256 after shutdown is `98872E9A667544FFBA77E338599ABC2DC3DE7E8599D55D15E98D71CCECA6D3FF`; the frozen template/config/card hashes remained `6CB291D11CE6578E3395A10D2C5D590070E3CCDD8B2B67451410869CE97897D2`, `D8362B1AF976C00CB8F14C564C8196A2D1AB137743FF368EA83D762A4AD2E065`, and `4B48DE7A32DF6A6BE5A91AB12F09BB87926B40D5940348C7581E298EAA12B60A`.

Cleanup completed after evidence capture. The task-owned backend, frontend, and Chrome listener processes were PIDs 66252, 56212, and 72408; ports 4310, 4311, and 4312, the CDP endpoint, and the task-owned browser page are absent. The task-owned browser profile under the r145 session root was removed and independently verified absent. The task-owned GitNexus shadow `R:\Temp\WorldForge-task197-shadow` and its registry entry were removed. Session/world-run evidence remains preserved and uncommitted.

## Acceptance handoff

Static acceptance is the focused safe-generation/privacy suite, directly affected Campaign Play suites, typecheck/build, diff check, and staged graph review above. The bounded implementation and r145 evidence update are note/source commits on `feat/revamp`; generated session/world-run evidence is uncommitted. The built journey proves canonical setup, ready Opening, and 18 unique proper-scene bindings before the first genuine Narrator stage-timeout defect. It does not prove the natural invalid structured-tool diagnostic event, 60 bindings, or same-page reload. Persistence at the frozen boundary is authoritative and clean (`integrity_check=ok`, empty `foreign_key_check`), with no late or duplicate settlement. The next decision is Main's choice of a bounded Narrator timeout/continuation repair; this task does not select one.
