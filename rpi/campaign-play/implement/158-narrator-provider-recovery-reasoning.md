# Task 158 — Narrator provider recovery reasoning

## Outcome

The one automatic Narrator recovery after a tool-transport `provider_unavailable` failure uses native JSON with default reasoning. Attempt 1 remains tool mode with bypass reasoning. The recovery keeps the exact provider, model, prompt, schema, operation, result, narration, packet, receipts, and absolute deadline.

## Evidence

The frozen r99 lane proved the Task 157 transport switch: attempt 1 failed immediately because the provider rejected the tool request, and attempt 2 returned a valid native JSON object in 6.9 seconds. That bypass result then failed semantic compilation because it duplicated `intentIndex 8`. The native transport worked; the remaining failure was semantic.

The existing opaque-semantic recovery already uses default reasoning when no safe compiler coordinates exist. A provider rejection likewise supplies no semantic coordinates, so the same bounded recovery model construction is used. Safe semantic feedback continues to use bypass reasoning and tool mode.

## Contract

- Attempt 1: bypass reasoning, tool structured output.
- Provider recovery attempt 2: default reasoning, native JSON structured output.
- Safe semantic recovery attempt 2: bypass reasoning, tool structured output.
- Opaque semantic recovery attempt 2: default reasoning, tool structured output.
- No attempt 3, deadline reset, provider/model change, mechanics replay, schema relaxation, prompt change, or visible-copy change.

## Validation

Focused model-path coverage proves the provider branch constructs `[bypass, default]`, uses the existing native JSON transport recovery, preserves durable identities, and accepts one proper scene. The Campaign Play application suite passed 13/13, backend typecheck and build passed, and `git diff --check` passed. The full turn-runtime file completed all 68 assertions twice, but both long Vitest runs reported the same post-result worker RPC timeout; the directly changed model-path case passed independently without that runner error. Existing recovery tests retain exact two-attempt/no-replay/no-third-call coverage.

## Semantic review

No prompt, model instruction, player-visible copy, or narrative prose changed. Humanizer and deslop review are not applicable.
