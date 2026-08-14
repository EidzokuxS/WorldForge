# Task 229: Z.AI response-model compatibility

Status: Done. The compatibility implementation is pushed and the final rendered acceptance completed on the unchanged build.

## Identity

- Repository: `R:\Projects\WorldForge`, branch `feat/revamp`
- Implementation commit: `f6c8315927a05fe25dc805a29345c154ea69e8dd`
- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`
- Gate run: `task229-glm52-gate-20260814`
- Requested roles: `zai-coding-plan / glm-5.2`

## Implementation evidence

- Added one pure Campaign Play model predicate. Exact requested/response equality remains valid for every provider; the only additional valid tuple is provider `zai-coding-plan`, requested `glm-5.2`, response `glm-5.3`.
- Opening planner/narrator, player Judge/Game Master, player Narrator, and `CampaignPlayTurnRepository.acceptModelArtifact` use the predicate. Provider equality, schema/reviewer evidence, retry/deadline, mechanics, lease/CAS/idempotency, and persistence semantics were not broadened. Accepted rows retain the truthful actual model.
- GitNexus pre-edit lower bounds were LOW for the two runtime consumers and CRITICAL for the public repository method (324 impacted symbols, 8 direct callers, 175 processes, 20 modules). The change was limited to the authorized model-value guard. Staged detect mapped only the expected repository/runtime/test symbols; its generic graph result remained CRITICAL and introduced no new production owner.
- Focused helper/Opening/turn/repository/database/application tests passed: 12, 16, 93, 42, 21, and 21 tests respectively. Backend typecheck, production build, and `git diff --check` passed. The grouped Windows test process exited `-1073741819`; the separate affected suites above are the authoritative results.

## Disposable rendered GLM 5.2 gate

- Canonical state/config/Brina hashes matched the recorded values. One successful live-phase prepare completed after task-owned materialization. Setup used one Brina import, one Continue, the four opening selections, and one Begin; Opening rendered ready with enabled choices.
- One visible action was signed and delivered once. Click receipt: choice handle `choice_cbca811f75be37eed063bf18`, locator count `1`, enabled before click `true`, click started `2026-08-14T16:22:16.290Z`, returned `2026-08-14T16:22:19.461Z`.
- Opening evidence requested `glm-5.2` and reported `glm-5.3`; planner and narrator were accepted and persisted with actual model `glm-5.3`. The player authority attempts ended in the existing bounded `stage_timeout` path; deterministic authority continuity then completed with source kind `deterministic_continuity`. The page returned ready with four enabled controls and no Resume, Try again, or service-unavailable surface.
- Persistence showed one opening turn and one player turn/result, one completed continuity narration operation, one proper scene, no duplicate logical action identity, and no action-6-style late write. The read-only copy reported `query_only=1`, `foreign_keys=1`, `integrity_check=ok`, and an empty `foreign_key_check`.
- The gate is not accepted for final-lane authorization. The decision was signed at `2026-08-14T16:21:22.808Z`; ready continuity was observed at `2026-08-14T16:23:46.536Z`, or approximately `143.728s` from signature, above the required `120s` bound. Click-to-ready was approximately `90.246s`, but the runner signed before the actual click. The retained session network trace and browser-action trace were empty, so a live scalar HTTP `202` is not proven; durable admission and the checked-in route contract are not a substitute for that runtime observation.

## Acceptance handoff

- Compatibility rule, exact-match preservation, allowlist, negative-case behavior, truthful actual-model persistence, and static validation: passed on `f6c8315927a05fe25dc805a29345c154ea69e8dd`.
- Rendered gate: reached ready Opening, one rendered action, one durable continuity turn, one proper scene, enabled controls, and clean read-only persistence; strict signed-to-ready and live-202 evidence: not passed.
- At the time of this earlier gate record, the final `pristine-60-glm52-lowwater-ledger-93a09e46-r193` lane had not been materialized; the final acceptance below supersedes that interim status.

## Cleanup

- Settings restored byte-for-byte: SHA-256 `577c39d0a04b5b086d6a4f34f2fd3fa6878a91f6a4fcc82978c17b0c791e0b3d`, 2225 bytes.
- Task-owned frontend process stopped; ports 4820/4821 were free. The temporary read-only database copy, gate config, and settings backup were removed. Generated gate session/world evidence and bounded logs remain preserved and uncommitted. Protected `AGENTS.md` and `CLAUDE.md` were untouched.

Next: Main decides whether to authorize a fresh gate with corrected decision timing and retained scalar 202 evidence.

## Final rendered acceptance: r193

- Run `pristine-60-glm52-lowwater-ledger-93a09e46-r193`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, executable `f6c8315927a05fe25dc805a29345c154ea69e8dd`, requested roles `zai-coding-plan / glm-5.2`, ports `4790/4791/4792`. The canonical state, config, and Brina hashes matched the recorded values. Materialization occurred once and the corrected runner invocation completed exactly one successful `--live-phase prepare`; the earlier argument-parser invocation did not reach prepare.
- The rendered setup completed exactly once: one canonical Brina assignment, one Save/Continue, `lower-wards`, `Local`, `Already here`, `Looking for work`, one Begin, and a ready Opening with enabled choices.
- Actions `1-60` each had one signed visible choice, one DOM click, one durable completed player turn, one unique rendered proper-scene binding, and enabled next controls. There were `60` unique turns and narrations/scenes; source kinds were `47 deterministic_continuity` and `13 model_accepted`. Click-to-ready latency ranged from `67.317s` to `117.568s` (maximum below `120s`). No operator Resume/Try again/replay, duplicate click, duplicate identity, or frozen product boundary occurred. The terminal action was turn `turn-player-action:35dab3811e807c462aa57388635cff701f39ff41`, narration `narration:ccf7486375aba0f18f355d7f8b6d652c48f0b658`, operation `narration-operation:0b8474e3cbd32bbf4e35c57aecd8f336559af95c`, result `result:e3c82e20129ea8c93715b92c98256c217b4d2222`, with world/runtime `71/1199`.
- Checkpoints `10/20/30/40/50/60` were all clean. Completed/bound/scenes were respectively `10/10/10`, `20/20/20`, `30/30/30`, `40/40/40`, `50/50/50`, and `60/60/60`; commands=receipts=world-events were `16/16/16`, `32/32/32`, `44/44/44`, `64/64/64`, `75/75/75`, and `95/95/95`, with distinct identities at each checkpoint. World/runtime versions were `23/198`, `33/403`, `40/586`, `52/788`, `59/975`, and `71/1199`. Every checkpoint used a query-only, foreign-key-enabled read copy with `integrity_check=ok` and an empty `foreign_key_check`; source and copy DB/WAL/SHM hashes matched before each read and the copies were removed afterward. Exact hash records remain in the generated checkpoint summaries.
- After action 60, exactly one same-page reload was performed. It returned ready in `892ms` with the same projection hash `5a33ed82047f7e8c65fc47f4a493c38f81f28188ae3b223db4c07a9b8e7c1886`, same world/runtime `71/1199`, same scene, and the same four enabled choices. The post-reload query-only reconciliation found `60` distinct completed player turns, proper scenes, narration operations, narrations, and results; commands=receipts=world-events were `95/95/95`, all distinct; `integrity_check=ok` and `foreign_key_check=[]`. Source/copy hashes matched and the authoritative DB hashes were unchanged after the read.
- Scalar model evidence retained in `model-scalar.json` shows accepted stages requested `zai-coding-plan / glm-5.2` and truthfully persisted actual `zai-coding-plan / glm-5.3`; no provider or model policy was changed.
- Settings were restored byte-for-byte to SHA-256 `577c39d0a04b5b086d6a4f34f2fd3fa6878a91f6a4fcc82978c17b0c791e0b3d` (2225 bytes). Generated r193 session/world/checkpoint/reload evidence and bounded logs remain uncommitted. This section is factual evidence only; no product source, test, prompt, provider policy, schema, migration, frontend, UI copy, or persistence code changed.

Next: none.
