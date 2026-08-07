# Task 157 — Narrator provider transport recovery

## Outcome

When the first player-action Narrator call fails as `provider_unavailable`, its one existing automatic recovery uses native structured output instead of repeating the rejected tool transport. The provider, model, reasoning mode, prompt, schema, immutable operation identity, receipts, and absolute deadline remain unchanged.

## Contract

- Attempt 1 remains `structuredOutputMode: "tool"`.
- The single automatic recovery after `provider_unavailable` uses `structuredOutputMode: "auto"`.
- Automatic recovery after `narration_invalid` remains `structuredOutputMode: "tool"` and keeps its existing semantic-recovery reasoning behavior.
- Manual Restore defaults to `structuredOutputMode: "tool"`.
- No attempt 3, mechanics replay, new operation, deadline reset, provider/model change, schema relaxation, prompt change, or visible-copy change is introduced.

## Evidence

The frozen r98 lane returned `provider_unavailable` twice in 2,290 ms and 1,537 ms. Both calls used tool mode and both provider diagnostics reported `Invalid API parameter`; neither returned response metadata. Repeating the same transport therefore consumed the only recovery without testing the provider's native JSON path.

Focused application/runtime coverage asserts `["tool", "auto"]` for provider recovery, `["tool", "tool"]` for semantic recovery, exact two-attempt persistence, unchanged mechanics, and no third call.

## Semantic review

No prompt, model instruction, player-visible copy, or narrative prose changed. Humanizer and deslop review are not applicable.
