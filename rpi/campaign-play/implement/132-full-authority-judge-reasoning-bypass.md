# Task 132: full-authority Judge reasoning bypass

## Outcome

The default full-authority Campaign Play Judge uses the existing `reasoningMode: "bypass"` provider option. Opening, certified Game Master, full-authority Game Master, Actor Replanner, Narrator, provider/model selection, strict schema strategy, deadlines, mechanics, and visible UI remain unchanged.

An uncertain ruling must retain two distinct result tiers. The Judge prompt states the rule and semantic compilation rejects a fixed uncertain result, preserving a meaningful code-owned check when reasoning is bypassed.

## Evidence before implementation

The frozen r70 action-one Judge call reached the existing 90-second deadline without returning a provider result. A controlled six-sample comparison reconstructed that exact Judge frame, prompt, schema, provider, and model without mutating r70. Default reasoning accepted 3/3 with a maximum wall time of 22,363 ms. Bypass accepted 3/3 with a maximum wall time of 7,248 ms, but all bypass samples returned `limited` to `limited` for an uncertain ruling. That fixed range made the code-owned check mechanically irrelevant, so bypass was not enabled until the semantic boundary was closed.

Diagnostic output is preserved under `output/playtests/campaign-play/judge-reasoning-evaluation/r70-action1-20260806`.

## Acceptance contract

- Actor and surface: the player submits a full-authority action on `/campaign/:id/play`.
- Trigger: Campaign Play constructs the default full-authority Judge for the admitted player turn.
- Observable result: the same selected provider/model and strict Judge contract return within the existing stage deadline; an uncertain ruling has distinct minimum and maximum result tiers; the turn continues through mechanics and a proper rendered scene.
- Protected behavior: certified routes, Opening, Game Master, Actor Replanner, Narrator, player mechanics, receipts, deadlines, retries, and visible copy are unchanged.
- Failure behavior: a fixed uncertain result is rejected as `model_contract_failed`; an elapsed provider deadline remains a truthful `stage_timeout` with no late mechanics write.

## Semantic review

Humanizer and deslop review: the added Judge instruction is technical, literal, and short. It states one mechanical invariant and contains no narrative voice, filler, visible copy, or example-specific content.

## Automated verification

- Focused Judge suite: 35/35 passed, including the fixed uncertain-range rejection and exact prompt instruction.
- Campaign Play application suite: 12/12 passed, including the complete role construction matrix.
- Backend typecheck and build passed.
- Shared and frontend production builds passed.
- `git diff --check` passed with only the existing line-ending warnings.
