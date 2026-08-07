# Task 155 - Player Narrator tool transport

## Outcome

Use the provider's explicit tool structured-output transport for player-action narration while preserving the existing storyteller model, reasoning mode, prompt, schema, semantic compiler, recovery gate, shared deadline, persistence fences, and visible prose contract. Opening Narrator remains on its existing automatic transport selection.

## Evidence

Fresh r95 action 4 (`Wait 10 minutes`) settled Game Master mechanics and one Actor Replanner job, then the first Narrator call stayed in `native_json` until the operation deadline. The retained trace recorded no response model, usage, finish reason, or output and ended after 89,954 ms with `This operation was aborted`. The narration operation failed `stage_timeout`; no proper scene was inserted.

`CampaignPlayNarratorRequest` now accepts an optional `structuredOutputMode`, defaulting to `auto` for all existing callers. Both player-action narration call sites explicitly request `tool`; Opening supplies no override and therefore remains `auto`. The Narrator capability check and `safeGenerateObject` call use the same requested mode, so accepted evidence remains truthful.

## Acceptance contract

- Opening narration retains automatic structured-output selection.
- Every player-action narration attempt, including its one semantic recovery, requests tool transport.
- Provider/model, prompt, schema, temperature, reasoning mode, budgets, semantic checks, immutable packet/receipt identity, deadline, and acceptance CAS remain unchanged.
- A transport timeout still produces the existing concise fallback with no proper-scene write or mechanics replay.

## Validation

- Narrator suite: 28/28 passed, including a real capability/trace assertion for explicit tool mode.
- Targeted player Narrator runtime recovery cases: 2/2 passed.
- Campaign Play application suite: 13/13 passed.
- Backend typecheck and build passed.
- GitNexus upstream impact was HIGH: Narrator 24 impacted symbols/5 direct callers/4 processes; turn runtime 14 impacted symbols/2 direct callers/4 processes. The index was 11 commits stale and current source call sites were checked directly.
- No prompt or visible copy changed; humanizer/deslop review is not applicable.

## Product acceptance

Pending a fresh pristine lane. r95 remains frozen at action 4 and must not be resumed, retried, or mutated.
