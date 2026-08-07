# Task 153 - Judge recovery tool mode

## Outcome

The first Judge attempt remains unchanged in automatic structured-output mode. Its one existing recovery attempt now requests strict tool mode, while the existing model selection continues to use default reasoning after `model_contract_invalid` and the bypass model for transport-class recovery.

## Evidence and scope

- Frozen r93 action 16 Judge attempt 1 returned native JSON in 8,603 ms but failed strict schema validation because `movementRouteHandle` did not equal the single frame-authorized route handle.
- Attempt 2 used default reasoning and native JSON, then reached the unchanged 45-second deadline without a response.
- Judge now accepts an optional `structuredOutputMode`, resolves its capability from the requested mode, and passes that mode to strict generation.
- The turn runtime selects `auto` for Judge attempt 1 and `tool` for the sole recovery attempt. Retry count, provider/model choice, prompt, schema, compiler, deadline, persistence, mechanics, and UI are unchanged.

## Acceptance contract

- Actor: the Campaign Play player using a rendered full-authority action.
- Surface: the existing `/campaign/:id/play` player turn.
- Trigger: Judge attempt 1 fails and the existing exact-identity recovery creates attempt 2.
- Observable outcome: attempt 2 keeps the existing reasoning selection but uses schema-constrained tool mode and can continue through the unchanged Judge compiler.
- Forbidden surfaces: no third attempt, no repair or text fallback, no deadline reset, no provider/model/prompt/schema/UI/copy/mechanics change, and no replay of accepted work.

## Validation

- Focused Judge and turn-runtime suites: 102/102 passed.
- Backend typecheck passed.
- `git diff --check` passed apart from expected line-ending warnings.
- GitNexus pre-edit impacts were HIGH: `createCampaignPlayJudge` had 18 impacted symbols, 3 direct consumers, and 3 processes; `createCampaignPlayTurnRuntime` had 14 impacted symbols, 2 direct consumers, and 4 processes. The index was nine commits behind, so source was authoritative.
