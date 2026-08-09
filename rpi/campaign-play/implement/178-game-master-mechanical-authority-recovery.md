# Task 178 - Game Master mechanical-authority recovery

## Contract

When the existing Mechanical Authority Reviewer rejects a schema-valid Game Master proposal, the first attempt remains rejected with `model_contract_failed` and `modelEvidence.errorCode=mechanical_authority_rejected`. The same immutable turn/frame/ruling/resolution may use the existing single automatic recovery attempt, but only the bounded safe feedback channel is added:

```json
{"diagnostic":"game_master_semantic_validation_mismatch","failedChecks":[{"check":"mechanical_authority_rejected"}]}
```

The feedback contains no reviewer reason, proposal, event summary, actor/location name, player text, source moment, provider prose, or hidden state. Existing repeated-dialogue feedback, model selection, auto/native_json route, 90,000 ms safe-recovery deadline, authority, fencing, persistence, mechanics, and two-attempt limit remain unchanged.

## Graph and scope review

The accepted source was `a0e938cb79517df4c23593d2e7695e8f2b3ac648` on `feat/revamp`; the live index was stale by 19 commits, so a task-owned shadow index was analyzed at the exact source outside the checkout. Current shadow impact was LOW for `CampaignPlayGameMasterRecoveryCheck` (8 impacted), LOW for `mechanicalAuthorityReviewPrompt` (1), LOW for `mechanicalAuthorityReviewInput` (1), LOW for `rememberCampaignPlayGameMasterRecoveryFeedback` (11), and MEDIUM for `compile` (16). The indexed `createCampaignPlayGameMaster` target was HIGH and was not edited; the exported `CampaignPlayGameMasterError` class was not edited. No additional production file was required.

## Implementation and semantic review

`CampaignPlayGameMasterRecoveryCheck` is now the smallest discriminated union preserving the ordered `repeated_actor_dialogue` coordinates and adding only `{"check":"mechanical_authority_rejected"}`. The existing reviewer rejection branch remembers that exact safe check before throwing, and the existing outer wrapper preserves it. The recovery block uses this exact reviewed text:

> The previous proposal failed the safe checks below. Generate a new proposal from the unchanged frame, ruling, and resolution. Fix every listed check. For repeated_actor_dialogue, do not reuse the matching ACTOR_CONTINUITY.recentOwnActions summary. Answer the current PLAYER_INTENT in new words and include the current question-specific detail. For mechanical_authority_rejected, make every mechanically durable claim in each event summary agree with the typed resource effects and route access claims. If no typed authority changes a possession, obligation, or route, keep the event summary non-mechanical. All schema, authority, continuity, and Rulebook rules above still apply.

Main's semantic verdict: the added sentence restates the existing reviewer boundary without changing authority or mechanics. Humanizer verdict: retain the concrete imperative wording; conversational voice is not appropriate for this machine contract. Deslop verdict: no filler, canned framing, vague abstraction, or repeated conclusion remains. No player-visible copy or unrelated prompt changed.

## Automated evidence

To be completed after the bounded focused suites, typecheck/build, `git diff --check`, and GitNexus `detect_changes` run. The focused tests cover the exact safe reviewer check, preserved error code and wrapper feedback, absence of reviewer/proposal prose from feedback, unchanged normal prompt, unchanged repeated-dialogue coordinates, and exact recovery prompt text.

## Rendered r128 evidence

To be appended after exactly one fresh `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r128` lane from the canonical lowwater-ledger template and Brina card. Generated session/run evidence remains uncommitted. The lane will stop at its first genuine setup, model, semantic, runtime, persistence, mechanics, binding, or reload defect; otherwise it must reach 60 unique bindings and one same-page reload.

## Unknowns and acceptance handoff

Provider response bodies and rejected proposal bytes are not retained by the frozen r127 evidence; no causal provider claim is made. Live affected mechanical-authority recovery remains unknown until it occurs naturally in r128. The acceptance handoff will map the static safe-feedback contract, unchanged recovery identity/deadline/fencing, rendered action boundary, SQLite integrity/foreign keys, and cleanup to exact evidence anchors.
