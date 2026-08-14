# Task 229: Z.AI response-model compatibility

Status: Needs attention. The compatibility implementation is pushed, but the required final 60-action rendered acceptance was not started because the disposable gate did not satisfy the strict evidence contract.

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
- Final `pristine-60-glm52-lowwater-ledger-93a09e46-r193` lane: not materialized. Therefore 60/60 actions, checkpoints, and final same-page reload remain unproven.

## Cleanup

- Settings restored byte-for-byte: SHA-256 `577c39d0a04b5b086d6a4f34f2fd3fa6878a91f6a4fcc82978c17b0c791e0b3d`, 2225 bytes.
- Task-owned frontend process stopped; ports 4820/4821 were free. The temporary read-only database copy, gate config, and settings backup were removed. Generated gate session/world evidence and bounded logs remain preserved and uncommitted. Protected `AGENTS.md` and `CLAUDE.md` were untouched.

Next: Main decides whether to authorize a fresh gate with corrected decision timing and retained scalar 202 evidence.
