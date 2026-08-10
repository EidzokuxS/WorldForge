# Task 195 - Judge result-bounds generation schema

## Contract and fixed boundary

The frozen r142 action 17 Judge boundary was a generation/validation mismatch: attempt 1 completed transport and `auto`/`native_json`, then final validation rejected `resultBounds` because the deterministic judgment did not contain a mechanical result range. Automatic attempt 2 separately failed in `tool`/`tool_mode` structured-output extraction; its raw arguments and provider bytes are not retained. Task 195 repairs only the provider-facing generation schema for disposition/result-bounds compatibility. It does not change the attempt-2 extraction path, compiler/final-validation authority, recovery feedback, prompt text, provider/model/mode/reasoning, deadline, retry, persistence, mechanics, UI, or copy.

The generation contract is explicit in the JSON Schema passed to `safeGenerateObject`:

- `deterministic` accepts exactly equal pairs from `setback`, `limited`, `success`, or `strong_success`.
- `uncertain` accepts exactly ordered unequal pairs from those four non-`no_effect` tiers.
- `impossible` and `clarification_required` accept exactly `no_effect`/`no_effect`.
- Task 175's `clarificationQuestion` discriminator and all frame/frozen-choice constraints remain in the same generation schema.

The broad proposal schema, `campaignPlayJudgeRulingSchema`, `compile()`, final guards, feedback, and bounded recovery remain unchanged. Suggested waits continue to use their frozen deterministic branch and the same result-bound restriction.

## Impact and implementation

Entry was branch `feat/revamp`, local/origin `50e4ae8e4807b2aa7f9aa3857ebdb3d990d523eb`. `judgeProposalSchemaForFrame` and the nested schema helper were absent from the registered GitNexus index. The nearest indexed Judge execution owner (`judge` in `backend/src/campaign-play/judge.ts`) reported LOW risk with zero indexed direct callers, processes, or modules; the index was 20 commits stale. Source review confirmed the edited helper is private and generation-only. No HIGH or CRITICAL exact edited target was identified.

The implementation adds private literal-pair unions for deterministic and uncertain bounds and a private `no_effect` pair schema for impossible/clarification branches. No exported interface or runtime selector changed. No prompt/copy review was applicable because prompt literals remain byte-stable; humanizer/deslop review is explicitly not applicable to this generation-only schema.

## Static validation before r143

- `backend/src/campaign-play/judge.test.ts`: 45/45 passed. Tests cover every valid disposition pair, every invalid pair class, the provider-facing JSON Schema branches, clarification-question discrimination, and the broad compile/final-validation path.
- `backend/src/campaign-play/campaign-play-application.test.ts`: 15/15 passed.
- `backend/src/campaign-play/turn-runtime.test.ts`: 72/72 assertions passed in both the initial run and the narrow rerun. Both Vitest processes exited non-zero only because of the known post-run worker error `[vitest-worker]: Timeout calling "onTaskUpdate"` after all selected assertions passed; this is recorded as a verification-tool defect, not an assertion failure.
- Backend typecheck: passed.
- Backend build: passed.
- `git diff --check`: passed before the implementation commit.
- A task-owned exact-entry shadow index was rebuilt successfully (14,931 nodes / 42,701 edges / 882 flows). Its nested `judgeProposalSchemaForFrame` target remained absent; the source-qualified indexed `judge` owner remained LOW with zero direct/process/module impact. The shadow `detect_changes --scope staged` still mapped the three-file patch to unrelated stale `CampaignPlayJudgeInput`/`CampaignPlayModelBudget`/`CampaignPlayModelEvidence` symbols and reported a critical transitive flow set; source review confirms none of those symbols is edited, and the reported critical mapping is stale-index detector noise rather than an exact-target impact. The staged paths are only this note, `judge.ts`, and `judge.test.ts`.

Protected `AGENTS.md` and `CLAUDE.md` remain byte-for-byte unchanged and unstaged. Generated playtest evidence is not part of the commit.

## r143 journey

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r143`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, ports 4290/4291/4292. Required hashes are template state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and canonical Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

The single fresh lane and its authoritative rendered/SQLite evidence are appended below after the implementation is committed. Natural changed-schema coverage, checkpoints, reload, cleanup, and any first genuine defect will be reported exactly without reconstructing unavailable provider or proposal bytes.

## Acceptance handoff before r143

- Entry: accepted source commit with only protected instruction-file dirt.
- Generation contract: focused Judge tests and the provider JSON Schema assertions cover all disposition/result-bounds combinations and preserve Task 175 clarification discrimination.
- Protected behavior: compile/final guards, feedback, extraction, recovery fencing, identity, and deadlines remain covered by existing Judge/turn-runtime/application suites.
- Built product and persistence: unavailable until the one fresh r143 lane reaches a hard-stop boundary or 60 actions plus same-page reload.
