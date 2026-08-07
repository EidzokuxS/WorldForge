# Task 152 - Game Master recovery capability alignment

## Outcome

When an automatic Game Master transport recovery requests strict tool mode, the Game Master now validates the returned tool-mode trace against the same requested capability instead of an unrelated auto/native-JSON capability.

## Evidence and scope

- Frozen r92 action 3 attempt 1 ended at the existing 45-second external-stage deadline with `stage_timeout` and no provider response.
- Automatic attempt 2 requested `tool`, returned one schema-valid `tool_mode` result from the same provider and model in 6,133 ms, then was incorrectly classified as `model_contract_invalid` because capability resolution was hard-coded to `auto`.
- The production change only resolves capability with `request.structuredOutputMode ?? "auto"`. Retry count, model and provider selection, prompts, schemas, compiler, authority reviewer, deadline, persistence, mechanics, and UI are unchanged.
- The focused tool-mode test now supplies tool-mode trace metadata for both proposer and authority reviewer, so the prior mismatch would fail the regression.

## Acceptance contract

- Actor: the Campaign Play player using an already-rendered action.
- Surface: the existing `/campaign/:id/play` turn flow.
- Trigger: attempt 1 is interrupted by a transport/deadline class and the existing one-shot recovery selects tool mode.
- Observable outcome: a valid tool-mode attempt 2 can pass its capability check and continue through the unchanged compiler and settlement path.
- Forbidden surfaces: no additional retry, no fallback or repair, no provider/model/prompt/schema/UI/copy/mechanics change, and no replay of accepted work.

## Validation

- Campaign Play Game Master and turn-runtime suites: 115/115 passed.
- Backend typecheck passed.
- `git diff --check` passed apart from expected line-ending warnings.
- GitNexus pre-edit impact for `createCampaignPlayGameMaster` was HIGH: 17 impacted symbols, 3 direct consumers, and 3 affected processes; the index was eight commits behind and the result was source-confirmed.
