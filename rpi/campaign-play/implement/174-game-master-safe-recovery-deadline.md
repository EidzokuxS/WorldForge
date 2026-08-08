# Task 174: Game Master safe-recovery deadline

## Contract

Only a newly recreated automatic Campaign Play Game Master runtime that carries the existing non-null `gameMasterRecoveryFeedback` receives a 90,000 ms operation window. Ordinary Game Master attempt 1, opaque semantic recovery without feedback, and provider/stage-timeout recovery without feedback remain at 45,000 ms. Certified and full-authority Game Master routes use the same existing `gameMasterOperationDeadlineMs` input. Judge, Actor Replanner, Narrator, Opening, mechanics, persistence, provider/model selection, mode/reasoning, prompts, schema, attempt count, and UI behavior are unchanged.

## Impact and semantic review

The current GitNexus index is 12 commits behind the entry source. The exact file-owner impact for `backend/src/campaign-play/campaign-play-application.ts` was LOW (6 impacted files, 3 direct imports, no indexed processes/modules). `CampaignPlayRuntimeFactory` was LOW with the same direct callers. `CreateCampaignPlayTurnRuntimeInput` was LOW (7 impacted files, 3 direct imports, no indexed processes/modules). The nested `createDefaultTurnRuntime` target was absent from the index; source inspection identified its single existing `createCampaignPlayTurnRuntime` construction seam. Main's accepted source-qualified risk assessment is MEDIUM for the application/runtime path; no HIGH or CRITICAL result was found.

No prompt, visible copy, or player-facing prose changed. Humanizer/deslop review is not applicable to this internal deadline selector.

## Exact delta

`campaignPlayGameMasterOperationDeadlineMs` selects 45,000 ms for an ordinary or feedback-free runtime and 90,000 ms only when safe Game Master recovery feedback is present. `createDefaultTurnRuntime` passes that value through the existing `gameMasterOperationDeadlineMs` seam; no runtime input, schema, persisted deadline, state-machine branch, or recovery policy was added.

## Automated validation

Pending implementation validation: full Campaign Play application and turn-runtime suites, directly affected Game Master coverage, backend typecheck/build, `git diff --check`, GitNexus `detect_changes`, staged-path review, commit/push, and local/origin equality.

## Rendered r124 journey

Pending fresh pristine run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r124` from `lowwater-ledger-pristine-93a09e46-20260719`. The lane will stop at the first genuine defect or continue to 60 unique bindings plus one same-page reload. Generated evidence remains outside Git.

## Unknowns

The live lane may not naturally exercise safe Game Master recovery; no recovery will be manufactured. An upstream response absent retained provider evidence remains unknown.
